"""
Generates synthetic prescription bottle label images for OCR baseline testing.
Uses only PIL — no internet required.

Output: tests/ocr_test_images/synthetic/
Each image is paired with a ground_truth.json listing the expected field values.
"""
from __future__ import annotations
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


# ── Ground-truth prescriptions ────────────────────────────────────────────────
PRESCRIPTIONS = [
    {"medication_name": "Lisinopril",  "dose_value": 10.0,  "dose_unit": "mg",  "frequency": "once daily",        "patient": "John Smith",       "prescriber": "Dr. Sarah Lee"},
    {"medication_name": "Metformin",   "dose_value": 500.0, "dose_unit": "mg",  "frequency": "twice daily",       "patient": "Maria Garcia",     "prescriber": "Dr. James Patel"},
    {"medication_name": "Atorvastatin","dose_value": 20.0,  "dose_unit": "mg",  "frequency": "once daily",        "patient": "Robert Johnson",   "prescriber": "Dr. Emily Chen"},
    {"medication_name": "Amoxicillin", "dose_value": 500.0, "dose_unit": "mg",  "frequency": "three times daily", "patient": "Linda Williams",   "prescriber": "Dr. Mark Davis"},
    {"medication_name": "Omeprazole",  "dose_value": 20.0,  "dose_unit": "mg",  "frequency": "once daily",        "patient": "David Brown",      "prescriber": "Dr. Lisa Wang"},
    {"medication_name": "Amlodipine",  "dose_value": 5.0,   "dose_unit": "mg",  "frequency": "once daily",        "patient": "Susan Martinez",   "prescriber": "Dr. Kevin Park"},
    {"medication_name": "Sertraline",  "dose_value": 50.0,  "dose_unit": "mg",  "frequency": "once daily",        "patient": "Thomas Anderson",  "prescriber": "Dr. Rachel Kim"},
    {"medication_name": "Levothyroxine","dose_value": 100.0,"dose_unit": "mcg", "frequency": "once daily",        "patient": "Nancy Taylor",     "prescriber": "Dr. Daniel Nguyen"},
    {"medication_name": "Metoprolol",  "dose_value": 25.0,  "dose_unit": "mg",  "frequency": "twice daily",       "patient": "Charles White",    "prescriber": "Dr. Amanda Torres"},
    {"medication_name": "Warfarin",    "dose_value": 5.0,   "dose_unit": "mg",  "frequency": "once daily",        "patient": "Patricia Harris",  "prescriber": "Dr. Steven Clark"},
    # Edge cases
    {"medication_name": "Digoxin",     "dose_value": 0.125, "dose_unit": "mg",  "frequency": "once daily",        "patient": "George Lewis",     "prescriber": "Dr. Jennifer Hall"},
    {"medication_name": "Furosemide",  "dose_value": 40.0,  "dose_unit": "mg",  "frequency": "twice daily",       "patient": "Barbara Allen",    "prescriber": "Dr. Christopher Young"},
]

# ── Font loading (falls back to PIL default) ──────────────────────────────────
def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/Windows/Fonts/arial.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


def _get_bold_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/Windows/Fonts/arialbd.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


# ── Label renderer ────────────────────────────────────────────────────────────
def render_label(rx: dict, noise: bool = False) -> Image.Image:
    """Render a single prescription label as a PIL Image."""
    W, H = 500, 320
    bg_color = (245, 245, 235)
    img = Image.new("RGB", (W, H), color=bg_color)
    draw = ImageDraw.Draw(img)

    font_lg = _get_bold_font(22)
    font_md = _get_font(16)
    font_sm = _get_font(13)
    font_xs = _get_font(11)

    # Border
    draw.rectangle([3, 3, W - 4, H - 4], outline=(60, 60, 60), width=2)

    # Pharmacy header
    draw.rectangle([3, 3, W - 4, 42], fill=(30, 80, 140))
    draw.text((10, 10), "MEDGUARD PHARMACY", font=_get_bold_font(18), fill=(255, 255, 255))
    draw.text((10, 30), "Tel: (555) 123-4567   Lic: PH-20241", font=_get_font(10), fill=(200, 220, 255))

    # Rx number + date
    rx_no = f"Rx# {random.randint(1000000, 9999999)}"
    date_str = "04/19/2026"
    draw.text((10, 52), rx_no, font=font_xs, fill=(80, 80, 80))
    draw.text((W - 120, 52), f"Date: {date_str}", font=font_xs, fill=(80, 80, 80))

    # Patient
    draw.text((10, 72), f"Patient: {rx['patient']}", font=font_md, fill=(20, 20, 20))

    # Drug name (large, bold)
    dose_str = (
        f"{int(rx['dose_value']) if rx['dose_value'] == int(rx['dose_value']) else rx['dose_value']}"
        f" {rx['dose_unit']}"
    )
    drug_line = f"{rx['medication_name']}  {dose_str}"
    draw.text((10, 100), drug_line, font=font_lg, fill=(0, 0, 0))

    # Divider
    draw.line([(10, 132), (W - 10, 132)], fill=(150, 150, 150), width=1)

    # Directions
    direction_map = {
        "once daily":        "Take 1 tablet by mouth once daily.",
        "twice daily":       "Take 1 tablet by mouth twice daily.",
        "three times daily": "Take 1 tablet by mouth three times daily (TID).",
        "four times daily":  "Take 1 tablet by mouth four times daily (QID).",
        "as needed":         "Take 1 tablet by mouth as needed (PRN).",
        "at bedtime":        "Take 1 tablet by mouth at bedtime (QHS).",
    }
    direction = direction_map.get(rx["frequency"], f"Take as directed. ({rx['frequency']})")
    draw.text((10, 142), direction, font=font_md, fill=(20, 20, 20))

    # Refills, qty
    draw.text((10, 172), "Qty: 30 tablets     Refills: 3 remaining", font=font_sm, fill=(60, 60, 60))

    # Prescriber
    draw.text((10, 196), f"Prescriber: {rx['prescriber']}", font=font_sm, fill=(60, 60, 60))

    # Warning strip
    draw.rectangle([3, 240, W - 4, 272], fill=(255, 235, 59))
    draw.text((10, 248), "⚠  Keep out of reach of children. Store below 25°C.", font=font_sm, fill=(80, 50, 0))

    # Barcode placeholder
    for i in range(30):
        x = 10 + i * 6
        h = random.choice([20, 30, 35, 25])
        draw.rectangle([x, 278, x + 3, 278 + h], fill=(0, 0, 0))
    draw.text((10, 305), "NDC 0071-0155-23", font=font_xs, fill=(80, 80, 80))

    if noise:
        import numpy as np
        arr = np.array(img).astype(np.float32)
        arr += np.random.normal(0, 8, arr.shape)
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)

    return img


# ── Main ──────────────────────────────────────────────────────────────────────
def generate_all(out_dir: Path | str = "tests/ocr_test_images/synthetic") -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    ground_truth: list[dict] = []
    for i, rx in enumerate(PRESCRIPTIONS):
        for noisy in (False, True):
            tag = "noisy" if noisy else "clean"
            fname = f"label_{i:02d}_{rx['medication_name'].lower()}_{tag}.png"
            img = render_label(rx, noise=noisy)
            img.save(out / fname)
            ground_truth.append({
                "file": fname,
                "noisy": noisy,
                "expected": {
                    "medication_name": rx["medication_name"].lower(),
                    "dose_value": rx["dose_value"],
                    "dose_unit": rx["dose_unit"],
                    "frequency": rx["frequency"],
                },
            })

    gt_path = out / "ground_truth.json"
    gt_path.write_text(json.dumps(ground_truth, indent=2))
    print(f"Generated {len(ground_truth)} label images → {out}")
    print(f"Ground truth → {gt_path}")
    return out


if __name__ == "__main__":
    generate_all()
