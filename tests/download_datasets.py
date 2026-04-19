"""
Downloads open-source medical prescription image datasets for OCR testing.

Sources:
  1. HuggingFace: chinmays18/medical-prescription-dataset (1,000 synthetic prescriptions)
  2. HuggingFace: naazimsnh02/medocr-vision-dataset (medical documents)
  3. ePillID benchmark sample images (pill photos with label text)
  4. Ultralytics medical-pills zip (92 images, 8 MB)

Run: python tests/download_datasets.py [--source all|hf|epillid|pills]
"""
from __future__ import annotations
import argparse
import io
import json
import sys
from pathlib import Path

import httpx

OUT_DIR = Path("tests/ocr_test_images/downloads")


# ─────────────────────────────────────────────────────────────────────────────
# Source 1: HuggingFace datasets
# ─────────────────────────────────────────────────────────────────────────────

def download_hf_prescription_dataset(max_samples: int = 50) -> int:
    """
    Downloads up to max_samples images from chinmays18/medical-prescription-dataset.
    Requires: pip install datasets Pillow
    """
    print(f"\n[HuggingFace] chinmays18/medical-prescription-dataset — fetching {max_samples} samples…")
    try:
        from datasets import load_dataset  # type: ignore
        from PIL import Image as PILImage
    except ImportError:
        print("  SKIP: 'datasets' not installed. Run: pip install datasets")
        return 0

    out = OUT_DIR / "hf_prescription"
    out.mkdir(parents=True, exist_ok=True)

    try:
        ds = load_dataset("chinmays18/medical-prescription-dataset", split="test", streaming=True)
        saved = 0
        meta: list[dict] = []

        for i, sample in enumerate(ds):
            if i >= max_samples:
                break
            img = sample.get("image") or sample.get("img")
            if img is None:
                continue
            if not isinstance(img, PILImage.Image):
                continue

            fname = f"hf_rx_{i:04d}.png"
            img.save(out / fname)

            # Keep any metadata the dataset provides
            record = {"file": fname, "source": "hf_prescription"}
            for k in ("text", "label", "medication", "dose", "transcription"):
                if k in sample:
                    record[k] = sample[k]
            meta.append(record)
            saved += 1

            if saved % 10 == 0:
                print(f"  {saved}/{max_samples} saved…")

        (out / "metadata.json").write_text(json.dumps(meta, indent=2))
        print(f"  ✓ Saved {saved} images → {out}")
        return saved
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return 0


def download_hf_medocr_dataset(max_samples: int = 30) -> int:
    """
    Downloads from naazimsnh02/medocr-vision-dataset (medical documents for OCR).
    """
    print(f"\n[HuggingFace] naazimsnh02/medocr-vision-dataset — fetching {max_samples} samples…")
    try:
        from datasets import load_dataset  # type: ignore
        from PIL import Image as PILImage
    except ImportError:
        print("  SKIP: 'datasets' not installed.")
        return 0

    out = OUT_DIR / "hf_medocr"
    out.mkdir(parents=True, exist_ok=True)

    try:
        ds = load_dataset("naazimsnh02/medocr-vision-dataset", split="train", streaming=True)
        saved = 0
        meta: list[dict] = []

        for i, sample in enumerate(ds):
            if i >= max_samples:
                break
            # Filter to medical category only
            if sample.get("category", "").lower() not in ("medical", "prescription", ""):
                continue
            img = sample.get("image") or sample.get("img")
            if img is None or not isinstance(img, PILImage.Image):
                continue

            fname = f"medocr_{i:04d}.png"
            img.save(out / fname)
            meta.append({"file": fname, "source": "medocr", **{
                k: sample[k] for k in ("text", "category", "transcription") if k in sample
            }})
            saved += 1

        (out / "metadata.json").write_text(json.dumps(meta, indent=2))
        print(f"  ✓ Saved {saved} images → {out}")
        return saved
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Source 2: Ultralytics medical-pills zip (pill photos)
# ─────────────────────────────────────────────────────────────────────────────

PILLS_ZIP_URL = "https://github.com/ultralytics/assets/releases/download/v0.0.0/medical-pills.zip"

def download_ultralytics_pills() -> int:
    """
    Downloads the Ultralytics medical-pills dataset (~8 MB zip, 115 images).
    https://huggingface.co/datasets/Ultralytics/Medical-pills
    """
    print("\n[Ultralytics] medical-pills dataset…")
    import zipfile

    out = OUT_DIR / "ultralytics_pills"
    out.mkdir(parents=True, exist_ok=True)

    zip_path = out / "medical-pills.zip"
    if zip_path.exists():
        print("  Already downloaded.")
    else:
        try:
            print(f"  Downloading {PILLS_ZIP_URL}…")
            with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                r = client.get(PILLS_ZIP_URL)
                r.raise_for_status()
            zip_path.write_bytes(r.content)
            print(f"  Downloaded {len(r.content) // 1024} KB")
        except Exception as exc:
            print(f"  ERROR: {exc}")
            return 0

    try:
        with zipfile.ZipFile(zip_path) as zf:
            image_files = [f for f in zf.namelist() if f.lower().endswith((".jpg", ".jpeg", ".png"))]
            zf.extractall(out)
        print(f"  ✓ Extracted {len(image_files)} images → {out}")
        return len(image_files)
    except Exception as exc:
        print(f"  ERROR extracting: {exc}")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Source 3: ePillID sample images (GitHub releases)
# ─────────────────────────────────────────────────────────────────────────────

EPILLID_SAMPLE_URL = (
    "https://github.com/usuyama/ePillID-benchmark/releases/download/v1.0/ePillID_data.zip"
)

def download_epillid_samples() -> int:
    """
    Downloads ePillID benchmark pill images (13 k images, ~500 MB).
    Only grabs the first batch if the file is large.
    """
    print("\n[ePillID] benchmark pill images…")
    import zipfile

    out = OUT_DIR / "epillid"
    out.mkdir(parents=True, exist_ok=True)

    zip_path = out / "ePillID_data.zip"
    if list(out.glob("**/*.jpg")):
        existing = list(out.glob("**/*.jpg"))
        print(f"  Already have {len(existing)} images — skipping download.")
        return len(existing)

    try:
        print(f"  Downloading (may be large)… {EPILLID_SAMPLE_URL}")
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            with client.stream("GET", EPILLID_SAMPLE_URL) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                downloaded = 0
                chunks = []
                for chunk in r.iter_bytes(chunk_size=1024 * 512):
                    chunks.append(chunk)
                    downloaded += len(chunk)
                    mb = downloaded / (1024 * 1024)
                    # Stop after 50 MB to avoid huge downloads in CI
                    if downloaded > 50 * 1024 * 1024:
                        print(f"  Stopping at 50 MB (total: {total // (1024*1024)} MB)")
                        break
                    print(f"\r  {mb:.1f} MB…", end="", flush=True)
                zip_path.write_bytes(b"".join(chunks))
        print()

        with zipfile.ZipFile(zip_path) as zf:
            images = [f for f in zf.namelist() if f.lower().endswith((".jpg", ".png"))][:200]
            for f in images:
                zf.extract(f, out)
        print(f"  ✓ Extracted {len(images)} sample images → {out}")
        return len(images)
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Download medical image datasets for OCR testing")
    parser.add_argument(
        "--source",
        choices=["all", "hf", "pills", "epillid"],
        default="all",
        help="Which dataset(s) to download (default: all)",
    )
    parser.add_argument("--hf-samples", type=int, default=50, help="HuggingFace samples to fetch")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    totals: dict[str, int] = {}

    if args.source in ("all", "hf"):
        totals["hf_prescription"] = download_hf_prescription_dataset(args.hf_samples)
        totals["hf_medocr"] = download_hf_medocr_dataset(30)

    if args.source in ("all", "pills"):
        totals["ultralytics_pills"] = download_ultralytics_pills()

    if args.source in ("all", "epillid"):
        totals["epillid"] = download_epillid_samples()

    print("\n── Summary ──────────────────────")
    for src, n in totals.items():
        print(f"  {src}: {n} images")
    print(f"  Output dir: {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
