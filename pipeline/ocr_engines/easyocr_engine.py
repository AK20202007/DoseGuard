"""
Engine A: EasyOCR
https://github.com/JaidedAI/EasyOCR

Free, runs locally, supports 80+ languages.
Install: pip install easyocr
"""
from __future__ import annotations
import io
import numpy as np
from PIL.Image import Image
from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text


class EasyOCREngine(BaseOCREngine):
    name = "easyocr"

    def __init__(self, languages: list[str] | None = None) -> None:
        self._languages = languages or ["en"]
        self._reader = None  # lazy-load to avoid slow startup

    def _get_reader(self):
        if self._reader is None:
            try:
                import easyocr  # type: ignore
                self._reader = easyocr.Reader(self._languages, gpu=False)
            except ImportError as e:
                raise RuntimeError(
                    "easyocr not installed. Run: pip install easyocr"
                ) from e
        return self._reader

    async def extract(self, image: Image) -> ExtractedPrescription:
        try:
            reader = self._get_reader()
            # Convert PIL → numpy array
            img_array = np.array(image.convert("RGB"))
            results = reader.readtext(img_array, detail=0, paragraph=True)
            raw_text = "\n".join(results)
            fields = parse_prescription_text(raw_text)
            return ExtractedPrescription(
                engine=self.name,
                confidence=0.85,  # EasyOCR doesn't expose a single confidence score
                **fields,
            )
        except Exception as exc:
            return self._safe_result(str(exc))
