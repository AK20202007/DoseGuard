"""
YOLO-crop helper: given a PIL image and its YOLO label file,
returns a cropped PIL image focused on the drug-name bounding box.

When a bounding box annotation is available, cropping the label region
before running OCR dramatically improves drug-name extraction accuracy.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image


def crop_drug_name_region(
    image: Image.Image,
    label_path: str | Path,
    padding: float = 0.02,
) -> Image.Image | None:
    """
    Parse the first YOLO bounding box from `label_path` and return a
    cropped + padded region from `image`.

    Returns None if the label file doesn't exist or has no boxes.
    """
    label_path = Path(label_path)
    if not label_path.exists():
        return None

    lines = label_path.read_text().strip().splitlines()
    if not lines:
        return None

    # Take the first (largest / most confident) box
    parts = lines[0].split()
    if len(parts) < 5:
        return None

    try:
        cx, cy, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
    except ValueError:
        return None

    iw, ih = image.size

    # Add padding
    x1 = max(0, int((cx - w / 2 - padding) * iw))
    y1 = max(0, int((cy - h / 2 - padding) * ih))
    x2 = min(iw, int((cx + w / 2 + padding) * iw))
    y2 = min(ih, int((cy + h / 2 + padding) * ih))

    if x2 <= x1 or y2 <= y1:
        return None

    return image.crop((x1, y1, x2, y2))
