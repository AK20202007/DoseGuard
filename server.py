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
import os
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image

from pipeline.ocr_engines.easyocr_engine import EasyOCREngine
from pipeline.ocr_engines.tesseract_engine import TesseractEngine
from pipeline.ocr_engines.rapidocr_engine import RapidOCREngine
from pipeline.ocr_engines.mistral_ocr_engine import MistralOCREngine
from pipeline.layer2_safety_vault import DeterministicSafetyVault
from pipeline.models import ConsensusResult, FieldConsensus, ExtractedPrescription
from pipeline.drug_name_validator import extract_word_candidates, validate_drug_name
from pipeline.llm_extractor import llm_extract_fields

from itertools import combinations
from collections import Counter
from typing import Any

app = FastAPI(title="MedPipeline OCR Inspector")

# Lazy-loaded engines (shared across requests)
_engines: dict[str, Any] = {}

def _get_engines():
    if not _engines:
        _engines["easyocr"]     = EasyOCREngine()
        _engines["tesseract"]   = TesseractEngine()
        _engines["rapidocr"]    = RapidOCREngine()    # free, local ONNX
        _engines["mistral_ocr"] = MistralOCREngine()  # Mistral OCR API
    return _engines

CRITICAL_FIELDS = ("medication_name", "dose_value", "dose_unit")
SECONDARY_FIELDS = ("frequency",)
CONSENSUS_MINIMUM = 0.5   # 2 of 4 engines must agree (mistral counts heavily)

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
    # Exclude engines that errored OR returned no useful data (all-null critical fields).
    # An engine with blank output is counted as absent, not as a disagreement.
    def _engine_has_data(r: dict) -> bool:
        if not r["available"]:
            return False
        fields = r.get("fields") or {}
        return any(
            fields.get(f) is not None
            for f in ("medication_name", "dose_value", "dose_unit")
        )

    available = {n: r for n, r in engine_results.items() if _engine_has_data(r)}
    # Track engines that ran but returned nothing (soft failure)
    soft_failed = {
        n: r for n, r in engine_results.items()
        if r["available"] and not _engine_has_data(r)
    }
    cross_check: dict[str, dict] = {}
    merged_fields: dict[str, Any] = {}

    for field in list(CRITICAL_FIELDS) + list(SECONDARY_FIELDS):
        votes = {
            n: _norm((r["fields"] or {}).get(field))
            for n, r in available.items()
        }
        # Pairwise agreement (for display)
        pairs: dict[str, bool] = {}
        for ea, eb in combinations(available.keys(), 2):
            va, vb = votes.get(ea), votes.get(eb)
            pairs[f"{ea}_vs_{eb}"] = (va is not None and vb is not None and va == vb)

        # Plurality score: fraction of engines that voted for the winning value.
        # With 3 engines where 2 agree: plurality = 2/3 = 0.67.
        # Pairwise would give 1/3 = 0.33 (misleading) — so we use plurality.
        winner, agreement_score = _plurality_vote(votes)
        merged_fields[field] = winner

        cross_check[field] = {
            "votes":           votes,
            "pairwise":        pairs,
            "agreement_score": agreement_score,          # plurality fraction
            "unanimous":       agreement_score == 1.0,
            "merged_value":    winner,
            "confidence":      agreement_score,
        }

    critical_scores = [cross_check[f]["agreement_score"] for f in CRITICAL_FIELDS]
    overall_consensus = round(min(critical_scores) if critical_scores else 0.0, 4)
    all_unanimous = all(cross_check[f]["unanimous"] for f in CRITICAL_FIELDS)
    majority_reached = overall_consensus >= CONSENSUS_MINIMUM

    # Confidence tier (4 engines: easyocr, tesseract, rapidocr, mistral_ocr)
    n_available = len(available) if "available" in dir() else 4
    if all_unanimous:
        confidence_tier = "unanimous_all"
    elif majority_reached:
        confidence_tier = "majority_2_of_4"
    else:
        confidence_tier = "recapture_required"

    # ── Gemini Vision verification (primary) + Ollama fallback ──────────────
    # Gemini looks at the ACTUAL IMAGE to verify/correct OCR output.
    # Each model's raw text is shown to Gemini so it can spot disagreements.
    all_raw = " ".join(
        r.get("raw_text", "") for r in engine_results.values() if r.get("raw_text")
    )
    # Format per-engine readings for Gemini's context
    engine_readings = "\n".join(
        f"  {name}: {(r.get('fields') or {}).get('medication_name','?')} | "
        f"{(r.get('fields') or {}).get('dose_value','?')} "
        f"{(r.get('fields') or {}).get('dose_unit','?')} | "
        f"{(r.get('fields') or {}).get('frequency','?')}"
        for name, r in engine_results.items() if r.get("available")
    )
    llm_fields = await llm_extract_fields(
        engine_readings or all_raw,
        timeout=15.0,
        image=img,   # pass actual image → Gemini Vision
    )
    llm_used = llm_fields is not None
    llm_model = (llm_fields or {}).get("llm_model", "")

    # Apply Gemini output to merged fields:
    #   - Gemini Vision: always override (it sees the actual image)
    #   - Ollama text: only fill in blanks
    gemini_is_vision = llm_model and "vision" in llm_model
    if llm_fields:
        for field in ("medication_name", "dose_value", "dose_unit", "frequency"):
            llm_val = llm_fields.get(field)
            if llm_val is None:
                continue
            llm_val_str = str(llm_val) if field == "dose_value" else llm_val
            if gemini_is_vision or merged_fields.get(field) is None:
                merged_fields[field] = llm_val_str
                if field in cross_check:
                    cross_check[field]["merged_value"] = llm_val_str
                    cross_check[field]["gemini_verified"] = gemini_is_vision
                    cross_check[field]["llm_filled"] = True

    # ── FDA drug-name cross-reference + spelling validation ───────────────────
    # Check EVERY unique name each engine returned against OpenFDA.
    # If 2 engines have a name that's in FDA but the 3rd has a misspelling,
    # the FDA-confirmed name wins with a boosted accuracy score.
    fda_candidates = extract_word_candidates(all_raw)[:12]
    # Also include LLM-extracted name as a candidate
    if llm_fields and llm_fields.get("medication_name"):
        llm_name = llm_fields["medication_name"]
        if llm_name not in [c.lower() for c in fda_candidates]:
            fda_candidates.insert(0, llm_name)

    fda_name, fda_score = await validate_drug_name(fda_candidates, timeout=6.0)

    # Engine-level name cross-check: which engines agree with the FDA name?
    engine_name_votes = {
        n: _norm((r["fields"] or {}).get("medication_name"))
        for n, r in available.items()
    }
    fda_name_norm = _norm(fda_name) if fda_name else None
    engines_matching_fda = sum(
        1 for v in engine_name_votes.values()
        if v and fda_name_norm and (v == fda_name_norm or fda_name_norm in v or v in fda_name_norm)
    )

    ocr_name = merged_fields.get("medication_name")

    # Boost accuracy score: FDA-confirmed name that 2+ engines also got
    fda_confirmed_majority = fda_name and engines_matching_fda >= 2
    fda_confirmed_any = fda_name and engines_matching_fda >= 1

    # FDA is the definitive drug name source.
    # Scan ALL raw OCR words → whichever matches FDA wins.
    # Threshold 0.60 catches garbled reads (ETFORMINHCL→metformin, EMAGLUTIDE→semaglutide).
    if fda_name and fda_score >= 0.55:   # 0.55 catches garbled OCR reads
        merged_fields["medication_name"] = fda_name.lower()
        cross_check["medication_name"]["merged_value"] = fda_name.lower()
        cross_check["medication_name"]["fda_validated"] = True
        if fda_confirmed_majority:
            boosted = min(1.0, cross_check["medication_name"]["agreement_score"] + 0.20)
            cross_check["medication_name"]["agreement_score"] = round(boosted, 4)
            cross_check["medication_name"]["fda_boosted"] = True

    fda_result = {
        "validated_name": fda_name,
        "confidence": fda_score,
        "candidates_checked": fda_candidates,
        "engines_matching_fda": engines_matching_fda,
        "fda_confirmed_majority": fda_confirmed_majority,
    }

    # Recompute overall consensus after boosts
    critical_scores = [cross_check[f]["agreement_score"] for f in CRITICAL_FIELDS]
    overall_consensus = round(min(critical_scores) if critical_scores else 0.0, 4)
    all_unanimous = all(cross_check[f]["unanimous"] for f in CRITICAL_FIELDS)
    majority_reached = overall_consensus >= CONSENSUS_MINIMUM
    if all_unanimous:
        confidence_tier = "unanimous_all"
    elif majority_reached:
        confidence_tier = "majority_2_of_4"
    else:
        confidence_tier = "recapture_required"

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
    # Always runs — uses the FDA-validated drug name regardless of OCR consensus.
    # Even if engines disagree on the name, FDA already picked the best match.
    safety_result = None
    # Use FDA name as the authoritative medication name for safety check
    safety_med_name = (fda_name or merged_fields.get("medication_name") or "").lower() or None
    if safety_med_name:
        try:
            dose_str = merged_fields.get("dose_value")
            dose_val = float(dose_str) if dose_str else None
            mock_consensus = ConsensusResult(
                passed=True,
                medication_name=safety_med_name,   # always use FDA-validated name
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
                "reduced_confidence":      not all_unanimous,
                "confidence_tier":         confidence_tier,
            }
        except Exception as exc:
            safety_result = {"error": str(exc)}

    # ── Build merged corrected text ───────────────────────────────────────────
    # Canonical label assembled from cross-validated consensus values.
    # Each field shows the winning value; fields with disagreement are marked [?].
    def _display(field: str, fallback: str = "—") -> str:
        fc = cross_check.get(field, {})
        val = fc.get("merged_value") or fallback
        return val if fc.get("unanimous", True) else f"{val} [disputed]"

    med   = _display("medication_name")
    dose  = _display("dose_value")
    unit  = _display("dose_unit")
    freq  = _display("frequency")

    # Raw text from each available engine for the merged view
    raw_texts = {
        name: (r.get("raw_text") or "").strip()
        for name, r in engine_results.items()
        if r["available"] and r.get("raw_text")
    }

    merged_text = (
        f"VERIFIED PRESCRIPTION\n"
        f"{'─' * 40}\n"
        f"Medication : {med}\n"
        f"Dose       : {dose} {unit}\n"
        f"Frequency  : {freq}\n"
        f"{'─' * 40}\n"
        f"Consensus  : {overall_consensus:.0%} "
        f"({'unanimous' if all_unanimous else 'disputed — recapture required'})\n"
        f"Engines    : {', '.join(available.keys())}"
    )

    # ── LLM plain-English summary ─────────────────────────────────────────────
    rx_summary = await generate_rx_summary(
        medication_name=merged_fields.get("medication_name"),
        dose_value=merged_fields.get("dose_value"),
        dose_unit=merged_fields.get("dose_unit"),
        frequency=merged_fields.get("frequency"),
        fda_verified=bool(fda_name),
        fda_name=fda_name,
        known_strengths=(
            (safety_result or {}).get("known_strengths") or []
        ),
    )

    # ── Final response ────────────────────────────────────────────────────────
    return JSONResponse({
        "image_preview": f"data:image/jpeg;base64,{img_b64}",
        "filename": file.filename,
        "soft_failed_engines": list(soft_failed.keys()),
        "engines": engine_results,
        "cross_check": cross_check,
        "merged": {
            "prescription": merged_fields,
            "overall_consensus_score": overall_consensus,
            "all_unanimous": all_unanimous,
            "majority_reached": majority_reached,
            "confidence_tier": confidence_tier,
            "status": "passed" if all_unanimous else ("majority_passed" if majority_reached else "recapture_required"),
            "merged_text": merged_text,
            "raw_texts": raw_texts,
        },
        "reliability": reliability,
        "layer2_safety": safety_result,
        "fda_name_lookup": fda_result,
        "llm_extraction": {
            "used": llm_used,
            "model": llm_model,
            "fields": llm_fields,
        },
        "rx_summary": rx_summary,
    })


async def generate_rx_summary(
    medication_name: str | None,
    dose_value: str | float | None,
    dose_unit: str | None,
    frequency: str | None,
    fda_verified: bool,
    fda_name: str | None,
    known_strengths: list[str],
) -> dict:
    """
    Build a plain-English prescription summary from structured consensus fields.
    Completely free -- no LLM call, no API key needed.
    """
    if not medication_name:
        return {"text": None, "model": "template", "error": "No medication detected"}

    name = (fda_name or medication_name).title()
    dose_str = f"{dose_value} {dose_unit}".strip() if dose_value else None

    # Sentence 1: drug + dose
    s1 = (
        f"This prescription is for {name} {dose_str}."
        if dose_str else
        f"This prescription is for {name} (dose not detected on label)."
    )

    # Sentence 2: frequency, noting source
    s2 = (
        f"Per the prescription label, it should be taken {frequency}."
        if frequency else
        "The dosing frequency was not clearly detected on this label."
    )

    # Sentence 3: FDA verification + known strengths
    if fda_verified and known_strengths:
        strengths_str = ", ".join(known_strengths[:4])
        dose_match = dose_str and any(
            dose_str.replace(" ", "").lower() in s.replace(" ", "").lower()
            for s in known_strengths
        )
        s3 = (
            f"FDA/DailyMed confirms this drug and strength are valid (known strengths: {strengths_str})."
            if dose_match else
            f"FDA/DailyMed verified this drug exists; known approved strengths include: {strengths_str}."
        )
    elif fda_verified:
        s3 = "FDA/DailyMed verified this drug, though specific strength data was unavailable."
    else:
        s3 = "This drug could not be verified against FDA/DailyMed -- clinical review recommended."

    return {"text": f"{s1} {s2} {s3}", "model": "template (no LLM)", "error": None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
