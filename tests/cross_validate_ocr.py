"""
OCR Cross-Validation — engines check each other, produce reliability scores.

Runs EasyOCR, Tesseract, and LLaVA (if token set) on every image in a
directory, then computes:

  • Per-engine reliability score  — how often does this engine agree with
                                     the plurality merged value?
  • Pairwise agreement matrix     — A↔B, A↔C, B↔C agreement rates per field
  • Per-image confidence          — fraction of critical fields with full
                                     consensus (S = 1.0)
  • Merged value (smart vote)     — plurality winner; ties broken by the
                                     highest-reliability engine

Output files (all in tests/results/):
  individual_easyocr.json         raw per-image results
  individual_tesseract.json
  individual_llava.json
  merged.json                     consensus prescription per image
  cross_validation_report.json    full report with reliability + matrix

Usage:
    python tests/cross_validate_ocr.py
    python tests/cross_validate_ocr.py --image-dir tests/ocr_test_images/downloads/hf_prescription
"""
from __future__ import annotations
import argparse
import asyncio
import json
import sys
import time
from collections import Counter
from itertools import combinations
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image

from pipeline.ocr_engines.easyocr_engine import EasyOCREngine
from pipeline.ocr_engines.tesseract_engine import TesseractEngine
from pipeline.ocr_engines.moondream_engine import MoondreamEngine
from pipeline.models import ExtractedPrescription

RESULTS_DIR = Path("tests/results")
CRITICAL_FIELDS = ("medication_name", "dose_value", "dose_unit", "frequency")


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation
# ─────────────────────────────────────────────────────────────────────────────

def _norm(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip().lower()
    # "10.0" → "10" for readability
    try:
        f = float(s)
        s = str(int(f)) if f == int(f) else s
    except ValueError:
        pass
    return s or None


def _fields_from_extraction(ex: ExtractedPrescription) -> dict[str, str | None]:
    return {f: _norm(getattr(ex, f, None)) for f in CRITICAL_FIELDS}


# ─────────────────────────────────────────────────────────────────────────────
# Pairwise agreement helpers
# ─────────────────────────────────────────────────────────────────────────────

def _agree(v1: str | None, v2: str | None) -> bool:
    return v1 is not None and v2 is not None and v1 == v2


def _plurality_vote(
    values: list[str | None],
    engine_names: list[str],
    reliability: dict[str, float],
) -> tuple[str | None, float]:
    """
    Returns (winning_value, confidence).
    Ties broken by the engine with the highest reliability score.
    Confidence = winning_count / total_non_null_engines.
    """
    non_null = [(v, e) for v, e in zip(values, engine_names) if v is not None]
    if not non_null:
        return None, 0.0

    counter: Counter[str] = Counter(v for v, _ in non_null)
    max_count = counter.most_common(1)[0][1]
    candidates = [v for v, c in counter.items() if c == max_count]

    if len(candidates) == 1:
        winner = candidates[0]
    else:
        # Tie-break by highest-reliability engine that voted for a candidate
        best_score = -1.0
        winner = candidates[0]
        for v, e in non_null:
            if v in candidates and reliability.get(e, 0.5) > best_score:
                best_score = reliability.get(e, 0.5)
                winner = v

    confidence = max_count / len(non_null)
    return winner, round(confidence, 4)


# ─────────────────────────────────────────────────────────────────────────────
# Per-image cross-check
# ─────────────────────────────────────────────────────────────────────────────

def _cross_check_image(
    extractions: dict[str, ExtractedPrescription],  # engine_name → extraction
    reliability: dict[str, float],                   # current reliability estimates
) -> dict:
    """Build the per-image cross-check block."""
    engine_names = list(extractions.keys())
    field_results: dict[str, dict] = {}
    merged_fields: dict[str, Any] = {}

    for field in CRITICAL_FIELDS:
        values = [_fields_from_extraction(extractions[e])[field] for e in engine_names]
        votes = dict(zip(engine_names, values))

        # Pairwise agreements
        pairs: dict[str, bool] = {}
        for ea, eb in combinations(engine_names, 2):
            key = f"{ea}_vs_{eb}"
            pairs[key] = _agree(votes[ea], votes[eb])

        n_pairs = len(pairs)
        agreements = sum(1 for v in pairs.values() if v)
        agreement_score = round(agreements / n_pairs, 4) if n_pairs else 1.0

        merged_value, confidence = _plurality_vote(values, engine_names, reliability)

        field_results[field] = {
            "votes": votes,
            "pairwise": pairs,
            "agreement_score": agreement_score,
            "unanimous": agreement_score == 1.0,
            "merged_value": merged_value,
            "merge_confidence": confidence,
        }
        merged_fields[field] = merged_value

    # Image-level consensus score = min agreement across critical fields
    scores = [field_results[f]["agreement_score"] for f in CRITICAL_FIELDS]
    image_consensus = round(min(scores), 4)
    all_unanimous = all(field_results[f]["unanimous"] for f in CRITICAL_FIELDS)

    return {
        "fields": field_results,
        "merged": merged_fields,
        "image_consensus_score": image_consensus,
        "all_critical_unanimous": all_unanimous,
        "status": "passed" if all_unanimous else "recapture_required",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Reliability score computation
# ─────────────────────────────────────────────────────────────────────────────

def _compute_reliability(
    all_image_checks: list[dict],   # list of cross_check blocks
    engine_names: list[str],
) -> dict[str, dict]:
    """
    Reliability = fraction of (image × field) slots where the engine's value
    matched the final merged value.  Also computes pairwise agreement rates.
    """
    agree_counts: dict[str, dict[str, int]] = {e: {f: 0 for f in CRITICAL_FIELDS} for e in engine_names}
    total_counts: dict[str, dict[str, int]] = {e: {f: 0 for f in CRITICAL_FIELDS} for e in engine_names}

    pairwise_agree: dict[str, int] = {}
    pairwise_total: dict[str, int] = {}
    for ea, eb in combinations(engine_names, 2):
        key = f"{ea}_vs_{eb}"
        pairwise_agree[key] = 0
        pairwise_total[key] = 0

    for check in all_image_checks:
        for field in CRITICAL_FIELDS:
            fr = check["fields"][field]
            merged_val = fr["merged_value"]
            for eng in engine_names:
                vote = fr["votes"].get(eng)
                total_counts[eng][field] += 1
                if vote is not None and vote == merged_val:
                    agree_counts[eng][field] += 1

            for ea, eb in combinations(engine_names, 2):
                key = f"{ea}_vs_{eb}"
                pairwise_total[key] += 1
                if fr["pairwise"].get(key, False):
                    pairwise_agree[key] += 1

    result: dict[str, dict] = {}
    for eng in engine_names:
        field_scores = {}
        for field in CRITICAL_FIELDS:
            t = total_counts[eng][field]
            field_scores[field] = round(agree_counts[eng][field] / t, 4) if t else 0.0

        overall = round(sum(field_scores.values()) / len(field_scores), 4)

        pairwise_rates = {}
        for ea, eb in combinations(engine_names, 2):
            key = f"{ea}_vs_{eb}"
            if eng in (ea, eb):
                t = pairwise_total[key]
                pairwise_rates[key] = round(pairwise_agree[key] / t, 4) if t else 0.0

        result[eng] = {
            "overall_reliability": overall,
            "field_reliability": field_scores,
            "pairwise_agreement": pairwise_rates,
            "grade": _reliability_grade(overall),
        }

    return result


def _reliability_grade(score: float) -> str:
    if score >= 0.95:
        return "A"
    if score >= 0.85:
        return "B"
    if score >= 0.70:
        return "C"
    if score >= 0.50:
        return "D"
    return "F"


# ─────────────────────────────────────────────────────────────────────────────
# Image collection
# ─────────────────────────────────────────────────────────────────────────────

def _collect(image_dir: Path) -> list[tuple[Path, dict | None]]:
    gt_map: dict[str, dict] = {}
    gt_file = image_dir / "ground_truth.json"
    if gt_file.exists():
        for entry in json.loads(gt_file.read_text()):
            gt_map[entry["file"]] = entry.get("expected")
    pairs = []
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for p in sorted(image_dir.glob(ext)):
            pairs.append((p, gt_map.get(p.name)))
    return pairs


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

async def run(image_dir: Path):
    images = _collect(image_dir)
    if not images:
        print(f"No images found in {image_dir}")
        return

    # Build available engines
    engines: dict[str, Any] = {
        "easyocr":    EasyOCREngine(),
        "tesseract":  TesseractEngine(),
        "moondream":  MoondreamEngine(),
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nCross-validating {len(images)} images with {len(engines)} engines…\n")

    # ── Step 1: Run all engines ────────────────────────────────────────────
    # engine_name → list of {file, extraction, latency_ms}
    engine_runs: dict[str, list[dict]] = {name: [] for name in engines}

    for idx, (img_path, gt) in enumerate(images):
        print(f"  [{idx+1:02d}/{len(images)}] {img_path.name}", end="  ", flush=True)
        try:
            img = Image.open(img_path).convert("RGB")
        except Exception as exc:
            print(f"[load error: {exc}]")
            continue

        for eng_name, engine in engines.items():
            t0 = time.perf_counter()
            ex = await engine.extract(img)
            ms = round((time.perf_counter() - t0) * 1000)
            engine_runs[eng_name].append({
                "file": img_path.name,
                "extraction": ex,
                "latency_ms": ms,
                "ground_truth": gt,
            })
        print("✓")

    # ── Step 2: Detect available engines (not all errored) ─────────────────
    available_engines = [
        name for name, runs in engine_runs.items()
        if any(r["extraction"].error is None for r in runs)
    ]
    unavailable = [n for n in engines if n not in available_engines]
    if unavailable:
        print(f"\n  Unavailable engines (no HF token or install issue): {unavailable}")

    print(f"\n  Available: {available_engines}")

    # ── Step 3: Cross-check each image ────────────────────────────────────
    # Seed reliability as uniform, then iterate once to refine
    reliability: dict[str, float] = {e: 1.0 / len(available_engines) for e in available_engines}

    all_checks: list[dict] = []
    file_to_gt: dict[str, dict | None] = {img_path.name: gt for img_path, gt in images}

    for idx in range(len(images)):
        file_name = engine_runs[available_engines[0]][idx]["file"]
        extractions_this_image: dict[str, ExtractedPrescription] = {}
        for eng_name in available_engines:
            run_data = engine_runs[eng_name][idx]
            if run_data["extraction"].error is None:
                extractions_this_image[eng_name] = run_data["extraction"]

        if not extractions_this_image:
            continue

        check = _cross_check_image(extractions_this_image, reliability)
        check["file"] = file_name
        check["ground_truth"] = file_to_gt.get(file_name)
        all_checks.append(check)

    # Refine reliability with actual data
    reliability_scores = _compute_reliability(all_checks, available_engines)
    # Re-run cross-checks with refined reliability for better tie-breaking
    for check in all_checks:
        file_name = check["file"]
        idx = next(i for i, (p, _) in enumerate(images) if p.name == file_name)
        extractions_this_image = {}
        for eng_name in available_engines:
            run_data = engine_runs[eng_name][idx]
            if run_data["extraction"].error is None:
                extractions_this_image[eng_name] = run_data["extraction"]
        refined_reliability = {e: reliability_scores[e]["overall_reliability"] for e in available_engines}
        refined = _cross_check_image(extractions_this_image, refined_reliability)
        check["fields"] = refined["fields"]
        check["merged"] = refined["merged"]
        check["image_consensus_score"] = refined["image_consensus_score"]
        check["all_critical_unanimous"] = refined["all_critical_unanimous"]
        check["status"] = refined["status"]

    # Final reliability recompute with refined merge values
    reliability_scores = _compute_reliability(all_checks, available_engines)

    # ── Step 4: Write individual JSONs ─────────────────────────────────────
    for eng_name in available_engines:
        individual = []
        for run_data in engine_runs[eng_name]:
            ex = run_data["extraction"]
            individual.append({
                "file": run_data["file"],
                "engine": eng_name,
                "latency_ms": run_data["latency_ms"],
                "error": ex.error,
                "extracted": None if ex.error else {
                    "medication_name": ex.medication_name,
                    "dose_value": ex.dose_value,
                    "dose_unit": ex.dose_unit,
                    "frequency": ex.frequency,
                    "patient_name": ex.patient_name,
                    "prescriber": ex.prescriber,
                },
                "ground_truth": run_data["ground_truth"],
            })
        out = RESULTS_DIR / f"individual_{eng_name}.json"
        out.write_text(json.dumps(individual, indent=2))
        print(f"  Wrote {out.name}  ({len(individual)} records)")

    # ── Step 5: Write merged JSON ──────────────────────────────────────────
    merged_records = []
    for check in all_checks:
        gt = check.get("ground_truth")
        merged = check["merged"]
        gt_accuracy: dict[str, bool] = {}
        if gt:
            for field in CRITICAL_FIELDS:
                gt_val = _norm(gt.get(field))
                merged_val = _norm(merged.get(field))
                gt_accuracy[field] = (gt_val == merged_val) if gt_val else False

        merged_records.append({
            "file": check["file"],
            "status": check["status"],
            "image_consensus_score": check["image_consensus_score"],
            "all_critical_unanimous": check["all_critical_unanimous"],
            "merged_prescription": {
                "medication_name": merged.get("medication_name"),
                "dose_value": merged.get("dose_value"),
                "dose_unit": merged.get("dose_unit"),
                "frequency": merged.get("frequency"),
            },
            "field_confidence": {
                f: check["fields"][f]["merge_confidence"] for f in CRITICAL_FIELDS
            },
            "ground_truth_accuracy": gt_accuracy if gt else None,
        })

    merged_out = RESULTS_DIR / "merged.json"
    merged_out.write_text(json.dumps(merged_records, indent=2))
    print(f"  Wrote {merged_out.name}  ({len(merged_records)} records)")

    # ── Step 6: Write full cross-validation report ─────────────────────────
    n_total = len(all_checks)
    n_passed = sum(1 for c in all_checks if c["status"] == "passed")
    n_recapture = n_total - n_passed

    # Accuracy vs ground truth (where available)
    gt_checks = [c for c in all_checks if c.get("ground_truth")]
    if gt_checks:
        merged_gt_accuracy: dict[str, float] = {}
        for field in CRITICAL_FIELDS:
            correct = sum(
                1 for c in gt_checks
                if _norm(c["merged"].get(field)) == _norm(c["ground_truth"].get(field))
            )
            merged_gt_accuracy[field] = round(correct / len(gt_checks), 4)
    else:
        merged_gt_accuracy = {}

    report = {
        "summary": {
            "image_dir": str(image_dir),
            "total_images": n_total,
            "available_engines": available_engines,
            "unavailable_engines": unavailable,
            "consensus_passed": n_passed,
            "recapture_required": n_recapture,
            "consensus_pass_rate": round(n_passed / n_total, 4) if n_total else 0,
            "merged_ground_truth_accuracy": merged_gt_accuracy,
        },
        "engine_reliability": reliability_scores,
        "per_image": all_checks,
    }

    report_out = RESULTS_DIR / "cross_validation_report.json"
    report_out.write_text(json.dumps(report, indent=2))
    print(f"  Wrote {report_out.name}")

    # ── Step 7: Print summary table ────────────────────────────────────────
    print("\n" + "═" * 62)
    print("  ENGINE RELIABILITY SCORES")
    print("─" * 62)
    print(f"  {'Engine':<14}  {'Overall':>8}  {'Grade':>5}  {'Name':>7}  {'Dose':>7}  {'Freq':>7}")
    print("─" * 62)
    for eng, scores in reliability_scores.items():
        fr = scores["field_reliability"]
        print(
            f"  {eng:<14}  {scores['overall_reliability']:>7.1%}  "
            f"{scores['grade']:>5}  "
            f"{fr.get('medication_name', 0):>6.1%}  "
            f"{fr.get('dose_value', 0):>6.1%}  "
            f"{fr.get('frequency', 0):>6.1%}"
        )

    print("\n  PAIRWISE AGREEMENT RATES")
    print("─" * 62)
    all_pairs: dict[str, list[float]] = {}
    for eng_data in reliability_scores.values():
        for pair, rate in eng_data.get("pairwise_agreement", {}).items():
            all_pairs.setdefault(pair, []).append(rate)
    for pair, rates in sorted(all_pairs.items()):
        rate = rates[0] if rates else 0
        bar = "█" * int(rate * 20)
        print(f"  {pair:<30}  {rate:>5.1%}  {bar}")

    print("\n  CONSENSUS PASS RATE")
    print("─" * 62)
    rate = n_passed / n_total if n_total else 0
    bar = "█" * int(rate * 20)
    print(f"  {n_passed}/{n_total} images unanimous  {rate:>5.1%}  {bar}")

    if merged_gt_accuracy:
        print("\n  MERGED ACCURACY vs GROUND TRUTH")
        print("─" * 62)
        for field, acc in merged_gt_accuracy.items():
            bar = "█" * int(acc * 20)
            print(f"  {field:<20}  {acc:>5.1%}  {bar}")
    print("═" * 62)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--image-dir",
        default="tests/ocr_test_images/synthetic",
        help="Directory of images to cross-validate",
    )
    args = parser.parse_args()
    asyncio.run(run(Path(args.image_dir)))


if __name__ == "__main__":
    main()
