"""
Engine C: RapidOCR (ONNX runtime)
https://github.com/RapidAI/RapidOCR

Free, runs locally, cross-platform, uses PaddleOCR's detection + recognition
models compiled to ONNX. No Python version restrictions, no heavy C++ deps.

Install: pip install rapidocr-onnxruntime
"""
from __future__ import annotations
import numpy as np
from PIL.Image import Image

from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text


class RapidOCREngine(BaseOCREngine):
    name = "rapidocr"

    def __init__(self) -> None:
        self._ocr = None

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from rapidocr_onnxruntime import RapidOCR  # type: ignore
                self._ocr = RapidOCR()
            except ImportError as e:
                raise RuntimeError(
                    "rapidocr-onnxruntime not installed. "
                    "Run: pip install rapidocr-onnxruntime"
                ) from e
        return self._ocr

    async def extract(self, image: Image) -> ExtractedPrescription:
        try:
            ocr = self._get_ocr()
            img_array = np.array(image.convert("RGB"))
            result, elapse = ocr(img_array)

            if not result:
                return ExtractedPrescription(
                    engine=self.name,
                    raw_text="",
                    confidence=0.0,
                    error=None,  # not an error, just blank label
                )

            # result: [[box, text, confidence], ...]
            lines: list[str] = []
            confidences: list[float] = []
            for item in result:
                text = item[1] if len(item) > 1 else ""
                conf = float(item[2]) if len(item) > 2 else 0.8
                if text:
                    lines.append(text)
                    confidences.append(conf)

            raw_text = "\n".join(lines)
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            fields = parse_prescription_text(raw_text)

            return ExtractedPrescription(
                engine=self.name,
                confidence=round(avg_conf, 4),
                **fields,
            )
        except Exception as exc:
            return self._safe_result(str(exc))
