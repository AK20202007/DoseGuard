"""
Engine C: Vision-LLM via HuggingFace Inference API
Default model: llava-hf/llava-1.5-7b-hf  (free tier)
Alternative:   google/paligemma-3b-mix-448

Requires HF_API_TOKEN in environment.
"""
from __future__ import annotations
import base64
import io
import json
import os
import re
from PIL.Image import Image
import httpx
from .base import BaseOCREngine
from ..models import ExtractedPrescription


_SYSTEM_PROMPT = """\
You are a medical prescription OCR system. Extract the following fields from the label image
and return ONLY a JSON object (no markdown, no explanation):

{
  "medication_name": "<string or null>",
  "dose_value": <number or null>,
  "dose_unit": "<mg|mcg|ml|g|meq|units|iu or null>",
  "frequency": "<once daily|twice daily|three times daily|four times daily|every X hours|as needed|at bedtime or null>",
  "patient_name": "<string or null>",
  "prescriber": "<string or null>"
}

Rules:
- dose_value must be a plain number (e.g. 5, 0.5, 50).
- If a field is not visible in the image, set it to null.
- Do NOT guess or hallucinate values.
"""


class LLaVAEngine(BaseOCREngine):
    name = "llava"

    def __init__(self) -> None:
        self._token = os.getenv("HF_API_TOKEN", "")
        self._model = os.getenv("HF_VISION_MODEL", "llava-hf/llava-1.5-7b-hf")
        self._api_url = f"https://api-inference.huggingface.co/models/{self._model}"

    def _image_to_b64(self, image: Image) -> str:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()

    async def extract(self, image: Image) -> ExtractedPrescription:
        if not self._token:
            return self._safe_result("HF_API_TOKEN not set — skipping LLaVA engine")
        try:
            b64 = self._image_to_b64(image)
            headers = {"Authorization": f"Bearer {self._token}"}
            payload = {
                "inputs": {
                    "image": b64,
                    "text": _SYSTEM_PROMPT,
                },
                "parameters": {"max_new_tokens": 256, "temperature": 0.0},
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self._api_url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

            # HF returns [{"generated_text": "..."}] for text-gen endpoints
            raw_output = ""
            if isinstance(data, list) and data:
                raw_output = data[0].get("generated_text", "")
            elif isinstance(data, dict):
                raw_output = data.get("generated_text", str(data))

            parsed = self._parse_json_output(raw_output)
            return ExtractedPrescription(
                engine=self.name,
                raw_text=raw_output,
                confidence=0.90,
                **parsed,
            )
        except Exception as exc:
            return self._safe_result(str(exc))

    def _parse_json_output(self, text: str) -> dict:
        # Find the first JSON object in the output
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {}
        try:
            obj = json.loads(match.group())
            return {
                "medication_name": obj.get("medication_name"),
                "dose_value": self._coerce_float(obj.get("dose_value")),
                "dose_unit": obj.get("dose_unit"),
                "frequency": obj.get("frequency"),
                "patient_name": obj.get("patient_name"),
                "prescriber": obj.get("prescriber"),
            }
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _coerce_float(v) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None
