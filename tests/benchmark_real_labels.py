"""
Benchmark OCR engines on the real pharmaceutical label dataset
(Kabul University drug-name-detection, CC BY 4.0).

Runs EasyOCR + Tesseract on all 182 test images.
Runs Moondream on a random sample of 20 (it's slow).

Outputs:
  tests/results/real/individual_easyocr.json
  tests/results/real/individual_tesseract.json
  tests/results/real/individual_moondream.json
  tests/results/real/merged.json
  tests/results/real/cross_validation_report.json
  tests/results/real/report.html   ← visual HTML report

Usage:
    python tests/benchmark_real_labels.py
    python tests/benchmark_real_labels.py --moondream-sample 0   # skip moondream
"""
from __future__ import annotations
import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image

from pipeline.ocr_engines.easyocr_engine import EasyOCREngine
from pipeline.ocr_engines.tesseract_engine import TesseractEngine
from pipeline.ocr_engines.moondream_engine import MoondreamEngine
from pipeline.models import ExtractedPrescription

RESULTS_DIR = Path("tests/results/real")
IMAGE_DIR   = Path("tests/ocr_test_images/real_labels")
CRITICAL_FIELDS = ("medication_name", "dose_value", "dose_unit")

# ── helpers ──────────────────────────────────────────────────────────────────

def _norm(v):
    if v is None: return None
    s = str(v).strip().lower()
    try:
        f = float(s); s = str(int(f)) if f == int(f) else s
    except ValueError: pass
    return s or None


def _plurality(votes: dict) -> tuple:
    from collections import Counter
    non_null = {e: v for e, v in votes.items() if v is not None}
    if not non_null: return None, 0.0
    c = Counter(non_null.values())
    winner, count = c.most_common(1)[0]
    return winner, round(count / len(non_null), 4)


def _pairwise(votes: dict) -> dict[str, bool]:
    from itertools import combinations
    names = list(votes.keys())
    return {
        f"{a}_vs_{b}": (
            votes[a] is not None and votes[b] is not None
            and votes[a] == votes[b]
        )
        for a, b in combinations(names, 2)
    }


# ── per-image cross-check ────────────────────────────────────────────────────

def cross_check(results: dict[str, ExtractedPrescription]) -> dict:
    available = {n: r for n, r in results.items() if r.error is None}
    if not available:
        return {"status": "all_failed", "fields": {}, "merged": {}}

    fields_out = {}
    merged = {}
    for field in CRITICAL_FIELDS:
        votes = {n: _norm(getattr(r, field, None)) for n, r in available.items()}
        pairs = _pairwise(votes)
        n = len(pairs)
        score = round(sum(1 for v in pairs.values() if v) / n, 4) if n else 1.0
        winner, conf = _plurality(votes)
        fields_out[field] = {
            "votes": votes, "pairwise": pairs,
            "agreement_score": score, "unanimous": score == 1.0,
            "merged_value": winner, "confidence": conf,
        }
        merged[field] = winner

    overall = round(min(f["agreement_score"] for f in fields_out.values()), 4)
    return {
        "status": "passed" if overall == 1.0 else "recapture_required",
        "overall_consensus": overall,
        "all_unanimous": overall == 1.0,
        "fields": fields_out,
        "merged": merged,
    }


# ── main ──────────────────────────────────────────────────────────────────────

async def run(moondream_sample: int = 20):
    images = sorted(IMAGE_DIR.glob("*.jpg")) + sorted(IMAGE_DIR.glob("*.png"))
    if not images:
        print(f"No images found in {IMAGE_DIR}")
        return

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Decide which images to run moondream on (it's slow ~25s each)
    moon_subset = set(random.sample([p.name for p in images], min(moondream_sample, len(images))))

    engines_fast = {
        "easyocr":   EasyOCREngine(),
        "tesseract": TesseractEngine(),
    }
    engine_moon = MoondreamEngine()

    print(f"\nBenchmarking {len(images)} real label images")
    print(f"  EasyOCR + Tesseract: all {len(images)} images")
    print(f"  Moondream: {len(moon_subset)} sampled images")
    print()

    # Storage: engine → list of records
    eng_records: dict[str, list] = {n: [] for n in ["easyocr","tesseract","moondream"]}
    all_checks: list[dict] = []
    errors = {"easyocr": 0, "tesseract": 0, "moondream": 0}

    for idx, img_path in enumerate(images):
        try:
            img = Image.open(img_path).convert("RGB")
        except Exception:
            continue

        results: dict[str, ExtractedPrescription] = {}

        # Fast engines
        for name, engine in engines_fast.items():
            t0 = time.perf_counter()
            ex = await engine.extract(img)
            ms = round((time.perf_counter() - t0) * 1000)
            results[name] = ex
            if ex.error: errors[name] += 1
            eng_records[name].append({
                "file": img_path.name,
                "engine": name,
                "latency_ms": ms,
                "error": ex.error,
                "medication_name": ex.medication_name,
                "dose_value": ex.dose_value,
                "dose_unit": ex.dose_unit,
                "frequency": ex.frequency,
                "raw_text": (ex.raw_text or "")[:300],
            })

        # Moondream (sampled)
        if img_path.name in moon_subset:
            t0 = time.perf_counter()
            ex_m = await engine_moon.extract(img)
            ms_m = round((time.perf_counter() - t0) * 1000)
            results["moondream"] = ex_m
            if ex_m.error: errors["moondream"] += 1
            eng_records["moondream"].append({
                "file": img_path.name,
                "engine": "moondream",
                "latency_ms": ms_m,
                "error": ex_m.error,
                "medication_name": ex_m.medication_name,
                "dose_value": ex_m.dose_value,
                "dose_unit": ex_m.dose_unit,
                "frequency": ex_m.frequency,
                "raw_text": (ex_m.raw_text or "")[:300],
            })

        cc = cross_check(results)
        cc["file"] = img_path.name
        all_checks.append(cc)

        # Progress
        if (idx + 1) % 20 == 0 or idx == len(images) - 1:
            passed = sum(1 for c in all_checks if c.get("all_unanimous"))
            print(f"  [{idx+1:3d}/{len(images)}]  unanimous so far: {passed}/{idx+1}")

    # ── Write individual JSONs ──────────────────────────────────────────────
    for name in ["easyocr", "tesseract"]:
        (RESULTS_DIR / f"individual_{name}.json").write_text(
            json.dumps(eng_records[name], indent=2)
        )
    if eng_records["moondream"]:
        (RESULTS_DIR / "individual_moondream.json").write_text(
            json.dumps(eng_records["moondream"], indent=2)
        )

    # ── Merged JSON ──────────────────────────────────────────────────────────
    merged_records = []
    for cc in all_checks:
        m = cc.get("merged", {})
        dose_str = m.get("dose_value")
        dose_val = None
        try: dose_val = float(dose_str) if dose_str else None
        except: pass
        merged_records.append({
            "file": cc["file"],
            "status": cc.get("status", "unknown"),
            "overall_consensus": cc.get("overall_consensus", 0),
            "all_unanimous": cc.get("all_unanimous", False),
            "medication_name": m.get("medication_name"),
            "dose_value": dose_val,
            "dose_unit": m.get("dose_unit"),
            "field_confidence": {
                f: cc["fields"].get(f, {}).get("confidence", 0)
                for f in CRITICAL_FIELDS
            } if cc.get("fields") else {},
        })
    (RESULTS_DIR / "merged.json").write_text(json.dumps(merged_records, indent=2))

    # ── Reliability scores (easyocr vs tesseract) ─────────────────────────
    avail_checks = [c for c in all_checks if c.get("fields")]
    def _reliability(engine: str) -> dict:
        agree_counts = {f: 0 for f in CRITICAL_FIELDS}
        totals       = {f: 0 for f in CRITICAL_FIELDS}
        for cc in avail_checks:
            for f in CRITICAL_FIELDS:
                fdata = cc["fields"].get(f, {})
                merged_val = fdata.get("merged_value")
                vote = fdata.get("votes", {}).get(engine)
                if vote is not None:
                    totals[f] += 1
                    if vote == merged_val:
                        agree_counts[f] += 1
        field_scores = {
            f: round(agree_counts[f] / totals[f], 4) if totals[f] else 0.0
            for f in CRITICAL_FIELDS
        }
        overall = round(sum(field_scores.values()) / len(field_scores), 4)
        grade = "A" if overall >= .95 else "B" if overall >= .85 else "C" if overall >= .70 else "D" if overall >= .50 else "F"
        return {"overall": overall, "grade": grade, "field_scores": field_scores}

    # Pairwise easyocr ↔ tesseract
    et_agree = {f: 0 for f in CRITICAL_FIELDS}
    et_total = {f: 0 for f in CRITICAL_FIELDS}
    for cc in avail_checks:
        for f in CRITICAL_FIELDS:
            pair_key = "easyocr_vs_tesseract"
            agreed = cc["fields"].get(f, {}).get("pairwise", {}).get(pair_key)
            if agreed is not None:
                et_total[f] += 1
                if agreed: et_agree[f] += 1

    pairwise_rates = {
        f: round(et_agree[f] / et_total[f], 4) if et_total[f] else 0.0
        for f in CRITICAL_FIELDS
    }

    n_total   = len(all_checks)
    n_passed  = sum(1 for c in all_checks if c.get("all_unanimous"))
    n_no_med  = sum(1 for r in merged_records if not r["medication_name"])
    n_no_dose = sum(1 for r in merged_records if not r["dose_value"])

    report = {
        "dataset": "Kabul University drug-name-detection (CC BY 4.0)",
        "image_dir": str(IMAGE_DIR),
        "summary": {
            "total_images": n_total,
            "consensus_passed": n_passed,
            "recapture_required": n_total - n_passed,
            "consensus_pass_rate": round(n_passed / n_total, 4) if n_total else 0,
            "images_with_no_drug_name": n_no_med,
            "images_with_no_dose": n_no_dose,
            "engine_errors": errors,
        },
        "engine_reliability": {
            "easyocr":   _reliability("easyocr"),
            "tesseract": _reliability("tesseract"),
        },
        "pairwise_agreement": {
            "easyocr_vs_tesseract": pairwise_rates,
        },
        "per_image": all_checks,
    }
    (RESULTS_DIR / "cross_validation_report.json").write_text(json.dumps(report, indent=2))

    # ── HTML Report ───────────────────────────────────────────────────────────
    _write_html_report(report, merged_records, RESULTS_DIR)

    # ── Print summary ─────────────────────────────────────────────────────────
    print("\n" + "═" * 62)
    print("  REAL LABEL BENCHMARK RESULTS")
    print("─" * 62)
    print(f"  Images tested    : {n_total}")
    print(f"  Unanimous pass   : {n_passed}/{n_total}  ({n_passed/n_total:.0%})")
    print(f"  No drug name     : {n_no_med}  ({n_no_med/n_total:.0%})")
    print(f"  No dose found    : {n_no_dose}  ({n_no_dose/n_total:.0%})")
    print()
    for eng, sc in report["engine_reliability"].items():
        fr = sc["field_scores"]
        print(f"  {eng:<12}  {sc['overall']:.0%} {sc['grade']}  "
              f"name={fr.get('medication_name',0):.0%}  "
              f"dose={fr.get('dose_value',0):.0%}  "
              f"unit={fr.get('dose_unit',0):.0%}")
    print()
    print("  EasyOCR ↔ Tesseract pairwise agreement:")
    for f, r in pairwise_rates.items():
        bar = "█" * int(r * 20)
        print(f"    {f:<18} {r:.0%}  {bar}")
    print("═" * 62)
    print(f"\n  Reports saved to: {RESULTS_DIR}/")
    print(f"  Open: {RESULTS_DIR}/report.html")


def _write_html_report(report: dict, merged: list, out_dir: Path):
    rows = ""
    for rec in merged[:200]:  # cap at 200 for HTML size
        status_color = "#22c55e" if rec["all_unanimous"] else "#f59e0b"
        rows += f"""<tr>
          <td class="mono" title="{rec['file']}">{rec['file'][:28]}…</td>
          <td><span style="color:{status_color};font-weight:600">
            {'✓' if rec['all_unanimous'] else '⚠'}</span></td>
          <td><strong>{rec['medication_name'] or '—'}</strong></td>
          <td>{(str(rec['dose_value']) + ' ' + (rec['dose_unit'] or '')) if rec['dose_value'] else '—'}</td>
          <td>{rec['overall_consensus']:.0%}</td>
        </tr>"""

    s = report["summary"]
    rel = report["engine_reliability"]
    pw  = report.get("pairwise_agreement", {}).get("easyocr_vs_tesseract", {})

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Real Label Benchmark</title>
<style>
  body{{font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;padding:32px;}}
  h1{{font-size:22px;margin-bottom:4px}} .sub{{color:#64748b;font-size:13px;margin-bottom:28px}}
  .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}}
  .card{{background:#1a1d27;border:1px solid #2e3350;border-radius:10px;padding:16px}}
  .card .val{{font-size:28px;font-weight:700;margin-bottom:4px}}
  .card .lbl{{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px}}
  .eng-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:28px}}
  .bar-wrap{{margin-top:6px}} .bar{{height:6px;border-radius:3px;background:#2e3350;overflow:hidden}}
  .fill{{height:100%;border-radius:3px;background:#4f8ef7}}
  table{{width:100%;border-collapse:collapse;font-size:13px;background:#1a1d27;border-radius:10px;overflow:hidden}}
  th{{background:#22263a;padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase}}
  td{{padding:9px 12px;border-bottom:1px solid #2e3350}} .mono{{font-family:monospace;font-size:11px}}
  tr:last-child td{{border-bottom:none}}
</style></head><body>
<h1>Real Label OCR Benchmark</h1>
<p class="sub">Dataset: {report['dataset']} · {s['total_images']} test images</p>

<div class="grid">
  <div class="card"><div class="val" style="color:#22c55e">{s['consensus_passed']}</div>
    <div class="lbl">Unanimous pass</div></div>
  <div class="card"><div class="val" style="color:#f59e0b">{s['recapture_required']}</div>
    <div class="lbl">Recapture required</div></div>
  <div class="card"><div class="val">{s['consensus_pass_rate']:.0%}</div>
    <div class="lbl">Consensus rate</div></div>
  <div class="card"><div class="val" style="color:#64748b">{s['images_with_no_drug_name']}</div>
    <div class="lbl">No drug name found</div></div>
</div>

<div class="eng-grid">
{''.join(f"""<div class="card"><strong>{eng.upper()}</strong> &nbsp;
  <span style="background:#14532d;color:#4ade80;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700">{sc['grade']}</span>
  <span style="float:right;font-size:18px;font-weight:700">{sc['overall']:.0%}</span>
  {"".join(f'<div class="bar-wrap"><div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b"><span>{f.replace("_"," ")}</span><span>{v:.0%}</span></div><div class="bar"><div class="fill" style="width:{v*100:.0f}%"></div></div></div>' for f,v in sc["field_scores"].items())}
</div>""" for eng, sc in rel.items())}
</div>

<h2 style="font-size:15px;margin-bottom:10px">EasyOCR ↔ Tesseract Pairwise Agreement</h2>
<div class="card" style="margin-bottom:28px">
{''.join(f'<div class="bar-wrap"><div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#64748b">{f.replace("_"," ")}</span><span style="font-weight:600">{v:.0%}</span></div><div class="bar"><div class="fill" style="width:{v*100:.0f}%"></div></div></div>' for f,v in pw.items())}
</div>

<h2 style="font-size:15px;margin-bottom:10px">Per-Image Results (first 200)</h2>
<table><thead><tr>
  <th>File</th><th>Status</th><th>Drug Name</th><th>Dose</th><th>Consensus</th>
</tr></thead><tbody>{rows}</tbody></table>
</body></html>"""

    (out_dir / "report.html").write_text(html)
    print(f"  Wrote report.html")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--moondream-sample", type=int, default=20)
    args = parser.parse_args()
    asyncio.run(run(args.moondream_sample))
