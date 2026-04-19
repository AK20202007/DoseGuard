"""
OCR Engine Benchmark — tests EasyOCR, PaddleOCR, and LLaVA against:
  1. Synthetic prescription labels (ground truth known exactly)
  2. Downloaded real-world images (qualitative review)

Usage:
    # Generate synthetic labels first
    python tests/generate_synthetic_labels.py

    # Run benchmark
    python tests/test_ocr_engines.py
    python tests/test_ocr_engines.py --engine easyocr
    python tests/test_ocr_engines.py --engine all --image-dir tests/ocr_test_images/downloads/hf_prescription

Metrics reported:
  - Field accuracy  : exact match (normalised) per field
  - Partial match   : medication name substring match
  - Dose accuracy   : exact dose_value + dose_unit match
  - Consensus rate  : fraction of images where all available engines agree
  - Error rate      : fraction of images where engine returned an error
"""
from __future__ import annotations
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image
from rich.console import Console
from rich.table import Table
from rich import box

from pipeline.ocr_engines.easyocr_engine import EasyOCREngine
from pipeline.ocr_engines.paddleocr_engine import PaddleOCREngine
from pipeline.ocr_engines.llava_engine import LLaVAEngine
from pipeline.layer1_ocr_ensemble import OCREnsembleCouncil, _score_field
from pipeline.models import ExtractedPrescription

console = Console()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _norm(v) -> str | None:
    if v is None:
        return None
    return str(v).strip().lower()


def _field_match(extracted, expected, field: str) -> bool:
    e_val = _norm(getattr(extracted, field, None))
    gt_val = _norm(expected.get(field))
    if e_val is None or gt_val is None:
        return False
    return e_val == gt_val


def _dose_match(extracted: ExtractedPrescription, expected: dict) -> bool:
    """Exact match on (dose_value, dose_unit)."""
    if extracted.dose_value is None or extracted.dose_unit is None:
        return False
    if _norm(str(extracted.dose_value)) != _norm(str(expected.get("dose_value"))):
        return False
    if _norm(extracted.dose_unit) != _norm(expected.get("dose_unit")):
        return False
    return True


def _name_partial(extracted: ExtractedPrescription, expected: dict) -> bool:
    """True if the ground-truth med name appears somewhere in extracted name."""
    gt = _norm(expected.get("medication_name", ""))
    ex = _norm(extracted.medication_name or "")
    if not gt or not ex:
        return False
    return gt in ex or ex in gt


# ─────────────────────────────────────────────────────────────────────────────
# Per-engine benchmarker
# ─────────────────────────────────────────────────────────────────────────────

class EngineResult:
    def __init__(self, name: str):
        self.name = name
        self.total = 0
        self.errors = 0
        self.name_exact = 0
        self.name_partial = 0
        self.dose_exact = 0
        self.freq_exact = 0
        self.latency_ms: list[float] = []
        self.samples: list[dict] = []   # for detailed review

    def accuracy(self, numerator: int) -> str:
        if self.total == 0:
            return "n/a"
        return f"{numerator / self.total * 100:.1f}%"

    def avg_latency(self) -> str:
        if not self.latency_ms:
            return "n/a"
        return f"{sum(self.latency_ms) / len(self.latency_ms):.0f} ms"


async def _benchmark_engine(
    engine,
    images: list[tuple[Path, dict | None]],
    result: EngineResult,
):
    for img_path, gt in images:
        try:
            img = Image.open(img_path).convert("RGB")
        except Exception as exc:
            result.errors += 1
            result.total += 1
            continue

        t0 = time.perf_counter()
        extraction = await engine.extract(img)
        elapsed = (time.perf_counter() - t0) * 1000

        result.total += 1
        result.latency_ms.append(elapsed)

        if extraction.error:
            result.errors += 1
            result.samples.append({
                "file": img_path.name, "error": extraction.error, "gt": gt
            })
            continue

        sample = {
            "file": img_path.name,
            "extracted": {
                "medication_name": extraction.medication_name,
                "dose_value": extraction.dose_value,
                "dose_unit": extraction.dose_unit,
                "frequency": extraction.frequency,
            },
            "gt": gt,
            "latency_ms": round(elapsed),
        }

        if gt:
            sample["name_exact"] = _field_match(extraction, gt, "medication_name")
            sample["name_partial"] = _name_partial(extraction, gt)
            sample["dose_exact"] = _dose_match(extraction, gt)
            sample["freq_exact"] = _field_match(extraction, gt, "frequency")

            if sample["name_exact"]:
                result.name_exact += 1
            if sample["name_partial"]:
                result.name_partial += 1
            if sample["dose_exact"]:
                result.dose_exact += 1
            if sample["freq_exact"]:
                result.freq_exact += 1

        result.samples.append(sample)


# ─────────────────────────────────────────────────────────────────────────────
# Consensus benchmark
# ─────────────────────────────────────────────────────────────────────────────

async def _benchmark_consensus(
    engines,
    images: list[tuple[Path, dict | None]],
) -> dict:
    council = OCREnsembleCouncil(engines=engines, threshold=1.0)
    passed = 0
    recapture = 0
    total = 0

    for img_path, _ in images:
        try:
            img = Image.open(img_path).convert("RGB")
        except Exception:
            continue
        result = await council.run(img)
        total += 1
        if result.passed:
            passed += 1
        else:
            recapture += 1

    return {
        "total": total,
        "consensus_passed": passed,
        "recapture_required": recapture,
        "pass_rate": f"{passed / total * 100:.1f}%" if total else "n/a",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Image collection
# ─────────────────────────────────────────────────────────────────────────────

def _collect_images(image_dir: Path) -> list[tuple[Path, dict | None]]:
    gt_map: dict[str, dict] = {}
    gt_file = image_dir / "ground_truth.json"
    if gt_file.exists():
        for entry in json.loads(gt_file.read_text()):
            gt_map[entry["file"]] = entry.get("expected")

    pairs: list[tuple[Path, dict | None]] = []
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for p in sorted(image_dir.glob(ext)):
            pairs.append((p, gt_map.get(p.name)))
    return pairs


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_benchmark(engine_names: list[str], image_dir: Path):
    images = _collect_images(image_dir)
    if not images:
        console.print(f"[red]No images found in {image_dir}[/]")
        console.print("Run: python tests/generate_synthetic_labels.py")
        return

    has_gt = any(gt is not None for _, gt in images)
    console.print(f"\n[bold]OCR Engine Benchmark[/] — {len(images)} images, ground truth: {'yes' if has_gt else 'no'}")
    console.print(f"Image dir: {image_dir}\n")

    # Build engines
    engine_map = {
        "easyocr":   EasyOCREngine,
        "paddleocr": PaddleOCREngine,
        "llava":     LLaVAEngine,
    }
    selected: list = []
    results: dict[str, EngineResult] = {}

    for name in engine_names:
        if name not in engine_map:
            console.print(f"[yellow]Unknown engine: {name}[/]")
            continue
        engine = engine_map[name]()
        selected.append(engine)
        results[name] = EngineResult(name)
        console.print(f"[cyan]Initialising {name}…[/]")

    if not selected:
        console.print("[red]No engines selected.[/]")
        return

    # Run benchmarks in parallel per engine, sequentially per image to avoid OOM
    console.print(f"\nRunning {len(selected)} engine(s) on {len(images)} images…")
    for engine, result in zip(selected, results.values()):
        console.print(f"  [{result.name}]…", end=" ")
        t_start = time.perf_counter()
        await _benchmark_engine(engine, images, result)
        elapsed = time.perf_counter() - t_start
        console.print(f"done ({elapsed:.1f}s)")

    # Print per-engine results table
    tbl = Table(title="Per-Engine Accuracy", box=box.SIMPLE_HEAD)
    tbl.add_column("Engine", style="cyan")
    tbl.add_column("Total", justify="right")
    tbl.add_column("Errors", justify="right")
    tbl.add_column("Avg Latency", justify="right")
    if has_gt:
        tbl.add_column("Name Exact", justify="right")
        tbl.add_column("Name Partial", justify="right")
        tbl.add_column("Dose Exact", justify="right")
        tbl.add_column("Freq Exact", justify="right")

    for name, r in results.items():
        row = [
            name,
            str(r.total),
            f"[red]{r.errors}[/]" if r.errors else "0",
            r.avg_latency(),
        ]
        if has_gt:
            row += [
                r.accuracy(r.name_exact),
                r.accuracy(r.name_partial),
                r.accuracy(r.dose_exact),
                r.accuracy(r.freq_exact),
            ]
        tbl.add_row(*row)
    console.print(tbl)

    # Consensus benchmark (only if 2+ engines available)
    if len(selected) >= 2:
        console.print("\n[bold]Consensus Voting (Layer 1 simulation)…[/]")
        consensus_stats = await _benchmark_consensus(selected, images[:20])
        ctbl = Table(title="Consensus Results (first 20 images)", box=box.SIMPLE_HEAD)
        ctbl.add_column("Metric")
        ctbl.add_column("Value", justify="right")
        ctbl.add_row("Total images evaluated", str(consensus_stats["total"]))
        ctbl.add_row("Consensus PASSED (S=1.0)", f"[green]{consensus_stats['consensus_passed']}[/]")
        ctbl.add_row("Recapture required", f"[yellow]{consensus_stats['recapture_required']}[/]")
        ctbl.add_row("Pass rate", f"[bold]{consensus_stats['pass_rate']}[/]")
        console.print(ctbl)

    # Save detailed results
    out_path = Path("tests/results")
    out_path.mkdir(exist_ok=True)
    report = {
        "image_dir": str(image_dir),
        "n_images": len(images),
        "engines": {
            name: {
                "total": r.total,
                "errors": r.errors,
                "avg_latency_ms": sum(r.latency_ms) / len(r.latency_ms) if r.latency_ms else 0,
                "name_exact_pct": r.name_exact / r.total * 100 if r.total else 0,
                "dose_exact_pct": r.dose_exact / r.total * 100 if r.total else 0,
                "freq_exact_pct": r.freq_exact / r.total * 100 if r.total else 0,
                "samples": r.samples[:10],  # first 10 for brevity
            }
            for name, r in results.items()
        },
    }
    report_path = out_path / "ocr_benchmark.json"
    report_path.write_text(json.dumps(report, indent=2))
    console.print(f"\n[dim]Full report saved → {report_path}[/]")


def main():
    parser = argparse.ArgumentParser(description="Benchmark OCR engines on medical prescription images")
    parser.add_argument(
        "--engine",
        default="easyocr",
        help="Comma-separated engines to test: easyocr,paddleocr,llava,all (default: easyocr)",
    )
    parser.add_argument(
        "--image-dir",
        default="tests/ocr_test_images/synthetic",
        help="Directory of images to test (default: synthetic labels)",
    )
    args = parser.parse_args()

    if args.engine == "all":
        engines = ["easyocr", "paddleocr", "llava"]
    else:
        engines = [e.strip() for e in args.engine.split(",")]

    asyncio.run(run_benchmark(engines, Path(args.image_dir)))


if __name__ == "__main__":
    main()
