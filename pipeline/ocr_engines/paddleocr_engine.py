"""
Engine B: PaddleOCR
https://github.com/PaddlePaddle/PaddleOCR

Free, runs locally, excellent accuracy on printed labels.
Install: pip install paddlepaddle paddleocr
"""
from __future__ import annotations
import numpy as np
from PIL.Image import Image
from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text


class PaddleOCREngine(BaseOCREngine):
    name = "paddleocr"

    def __init__(self, lang: str = "en") -> None:
        self._lang = lang
        self._ocr = None

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR  # type: ignore
                self._ocr = PaddleOCR(use_angle_cls=True, lang=self._lang, show_log=False)
            except ImportError as e:
                raise RuntimeError(
                    "paddleocr not installed. Run: pip install paddlepaddle paddleocr"
                ) from e
        return self._ocr

    async def extract(self, image: Image) -> ExtractedPrescription:
        try:
            ocr = self._get_ocr()
            img_array = np.array(image.convert("RGB"))
            result = ocr.ocr(img_array, cls=True)

            # result is List[List[[box, (text, confidence)]]]
            lines: list[str] = []
            confidences: list[float] = []
            if result and result[0]:
                for line in result[0]:
                    text, conf = line[1]
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
