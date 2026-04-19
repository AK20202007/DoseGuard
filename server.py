"""
Local dev server — upload a prescription label image, get back:
  • Individual JSON from each OCR engine
  • Per-field pairwise agreement matrix
  • Merged prescription with confidence scores
  • Layer 2 FDA/DailyMed safety check

Run:
    .venv/bin/python server.py
Then open http://localhost:8000
"""
from __future__ import annotations
import asyncio
import base64
import io
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image

from pipeline.ocr_engines.easyocr_engine import EasyOCREngine
from pipeline.ocr_engines.tesseract_engine import TesseractEngine
from pipeline.ocr_engines.llava_engine import LLaVAEngine
from pipeline.layer2_safety_vault import DeterministicSafetyVault
from pipeline.models import ConsensusResult, FieldConsensus, ExtractedPrescription

from itertools import combinations
from collections import Counter
from typing import Any

app = FastAPI(title="MedPipeline OCR Inspector")

# Lazy-loaded engines (shared across requests)
_engines: dict[str, Any] = {}

def _get_engines():
    if not _engines:
        _engines["easyocr"]   = EasyOCREngine()
        _engines["tesseract"] = TesseractEngine()
        _engines["llava"]     = LLaVAEngine()
    return _engines

CRITICAL_FIELDS = ("medication_name", "dose_value", "dose_unit", "frequency")

def _norm(val):
    if val is None:
        return None
    s = str(val).strip().lower()
    try:
        f = float(s)
        s = str(int(f)) if f == int(f) else s
    except ValueError:
        pass
    return s or None

def _plurality_vote(votes: dict[str, str | None]) -> tuple[str | None, float]:
    non_null = {e: v for e, v in votes.items() if v is not None}
    if not non_null:
        return None, 0.0
    counter: Counter = Counter(non_null.values())
    winner, count = counter.most_common(1)[0]
    return winner, round(count / len(non_null), 4)


@app.get("/", response_class=HTMLResponse)
async def index():
    return Path("static/index.html").read_text()


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    # ── Load image ──────────────────────────────────────────────────────────
    data = await file.read()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise HTTPException(400, f"Cannot open image: {exc}")

    # Thumbnail for response (base64)
    thumb = img.copy()
    thumb.thumbnail((400, 400))
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=80)
    img_b64 = base64.b64encode(buf.getvalue()).decode()

    # ── Run engines ──────────────────────────────────────────────────────────
    engines = _get_engines()
    engine_results: dict[str, dict] = {}

    for name, engine in engines.items():
        t0 = time.perf_counter()
        ex = await engine.extract(img)
        ms = round((time.perf_counter() - t0) * 1000)

        engine_results[name] = {
            "engine": name,
            "available": ex.error is None,
            "error": ex.error,
            "latency_ms": ms,
            "fields": None if ex.error else {
                "medication_name": ex.medication_name,
                "dose_value":      ex.dose_value,
                "dose_unit":       ex.dose_unit,
                "frequency":       ex.frequency,
                "patient_name":    ex.patient_name,
                "prescriber":      ex.prescriber,
            },
            "raw_text": ex.raw_text or "",
            "confidence": ex.confidence,
        }

    # ── Cross-check ──────────────────────────────────────────────────────────
    available = {n: r for n, r in engine_results.items() if r["available"]}
    cross_check: dict[str, dict] = {}
    merged_fields: dict[str, Any] = {}

    for field in CRITICAL_FIELDS:
        votes = {
            n: _norm((r["fields"] or {}).get(field))
            for n, r in available.items()
        }
        # Pairwise
        pairs: dict[str, bool] = {}
        for ea, eb in combinations(available.keys(), 2):
            va, vb = votes.get(ea), votes.get(eb)
            pairs[f"{ea}_vs_{eb}"] = (va is not None and vb is not None and va == vb)

        n_pairs = len(pairs)
        agree_count = sum(1 for v in pairs.values() if v)
        agreement_score = round(agree_count / n_pairs, 4) if n_pairs else 1.0

        winner, confidence = _plurality_vote(votes)
        merged_fields[field] = winner

        cross_check[field] = {
            "votes":           votes,
            "pairwise":        pairs,
            "agreement_score": agreement_score,
            "unanimous":       agreement_score == 1.0,
            "merged_value":    winner,
            "confidence":      confidence,
        }

    scores = [cross_check[f]["agreement_score"] for f in CRITICAL_FIELDS]
    overall_consensus = round(min(scores) if scores else 0.0, 4)
    all_unanimous = all(cross_check[f]["unanimous"] for f in CRITICAL_FIELDS)

    # ── Reliability score per engine ─────────────────────────────────────────
    reliability: dict[str, dict] = {}
    for eng_name in available:
        field_scores: dict[str, float] = {}
        for field in CRITICAL_FIELDS:
            vote = cross_check[field]["votes"].get(eng_name)
            merged = cross_check[field]["merged_value"]
            field_scores[field] = 1.0 if (vote is not None and vote == merged) else 0.0
        overall_rel = round(sum(field_scores.values()) / len(field_scores), 4)
        grade = "A" if overall_rel >= 0.95 else "B" if overall_rel >= 0.85 else "C" if overall_rel >= 0.70 else "D" if overall_rel >= 0.50 else "F"
        reliability[eng_name] = {
            "overall": overall_rel,
            "grade": grade,
            "field_scores": field_scores,
        }

    # ── Layer 2 safety check ─────────────────────────────────────────────────
    safety_result = None
    if all_unanimous and merged_fields.get("medication_name"):
        try:
            dose_str = merged_fields.get("dose_value")
            dose_val = float(dose_str) if dose_str else None
            mock_consensus = ConsensusResult(
                passed=True,
                medication_name=merged_fields.get("medication_name"),
                dose_value=dose_val,
                dose_unit=merged_fields.get("dose_unit"),
                frequency=merged_fields.get("frequency"),
                overall_score=overall_consensus,
                field_scores={
                    f: FieldConsensus(
                        field=f,
                        agreed_value=cross_check[f]["merged_value"],
                        score=cross_check[f]["agreement_score"],
                        unanimous=cross_check[f]["unanimous"],
                        votes=cross_check[f]["votes"],
                    )
                    for f in CRITICAL_FIELDS
                },
                extractions=[],
            )
            vault = DeterministicSafetyVault()
            safety = await vault.validate(mock_consensus)
            safety_result = {
                "passed":                  safety.passed,
                "medication_verified":     safety.medication_name_verified,
                "dose_verified":           safety.dose_verified,
                "clinical_impossibility":  safety.clinical_impossibility,
                "impossibility_reason":    safety.impossibility_reason,
                "extracted_dose_label":    safety.extracted_dose_label,
                "known_strengths":         [s.label for s in safety.known_strengths[:12]],
                "openfda_hit":             safety.openfda_hit,
                "dailymed_hit":            safety.dailymed_hit,
            }
        except Exception as exc:
            safety_result = {"error": str(exc)}

    # ── Final response ────────────────────────────────────────────────────────
    return JSONResponse({
        "image_preview": f"data:image/jpeg;base64,{img_b64}",
        "filename": file.filename,
        "engines": engine_results,
        "cross_check": cross_check,
        "merged": {
            "prescription": merged_fields,
            "overall_consensus_score": overall_consensus,
            "all_unanimous": all_unanimous,
            "status": "passed" if all_unanimous else "recapture_required",
        },
        "reliability": reliability,
        "layer2_safety": safety_result,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
