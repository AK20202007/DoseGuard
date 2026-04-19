"""
Engine B: Tesseract OCR (via pytesseract)
https://github.com/tesseract-ocr/tesseract

Free, runs locally, system-installed binary.
Install: brew install tesseract && pip install pytesseract
"""
from __future__ import annotations
from PIL.Image import Image
from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text


class TesseractEngine(BaseOCREngine):
    name = "tesseract"

    def __init__(self, config: str = "--oem 3 --psm 6") -> None:
        self._config = config

    async def extract(self, image: Image) -> ExtractedPrescription:
        try:
            import pytesseract  # type: ignore
            import shutil

            # Explicitly locate tesseract — server process may have a narrow PATH
            binary = (
                shutil.which("tesseract")
                or "/opt/homebrew/bin/tesseract"   # macOS Apple Silicon (brew)
                or "/usr/local/bin/tesseract"       # macOS Intel (brew)
                or "/usr/bin/tesseract"             # Linux
            )
            pytesseract.pytesseract.tesseract_cmd = binary

            raw_text = pytesseract.image_to_string(
                image.convert("RGB"), config=self._config
            )
            fields = parse_prescription_text(raw_text)
            return ExtractedPrescription(
                engine=self.name,
                confidence=0.80,
                **fields,
            )
        except ImportError as exc:
            return self._safe_result("pytesseract not installed: pip install pytesseract")
        except Exception as exc:
            return self._safe_result(str(exc))
