"""
Engine D: Mistral OCR (mistral-ocr-latest)
Sends the label image to Mistral's dedicated OCR API.
Returns markdown text parsed by the standard field extractor.
Requires MISTRAL_API_KEY in .env.
"""
from __future__ import annotations
import base64, io, os
import httpx
from PIL.Image import Image
from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text

_URL = "https://api.mistral.ai/v1/ocr"

class MistralOCREngine(BaseOCREngine):
    name = "mistral_ocr"

    def __init__(self) -> None:
        self._api_key = os.getenv("MISTRAL_API_KEY", "")

    def _b64(self, image: Image) -> str:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()

    async def extract(self, image: Image) -> ExtractedPrescription:
        if not self._api_key:
            return self._safe_result("MISTRAL_API_KEY not set")
        try:
            b64 = self._b64(image)
            headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
            payload = {"model": "mistral-ocr-latest",
                       "document": {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64}"}}
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(_URL, json=payload, headers=headers)
            if r.status_code == 401:
                return self._safe_result("Mistral API key invalid.")
            if r.status_code == 429:
                return self._safe_result("Mistral OCR rate limit — retry shortly.")
            if r.status_code != 200:
                return self._safe_result(f"Mistral OCR {r.status_code}: {r.text[:120]}")
            pages = r.json().get("pages", [])
            if not pages:
                return self._safe_result("Mistral OCR returned no pages.")
            raw_text = "\n".join(p.get("markdown", "") for p in pages).strip()
            conf = sum(p.get("confidence_score", 0.9) for p in pages) / len(pages)
            fields = parse_prescription_text(raw_text)
            return ExtractedPrescription(engine=self.name, confidence=round(conf, 4), **fields)
        except Exception as exc:
            return self._safe_result(str(exc))
