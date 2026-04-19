"""
Engine C: Claude Haiku Vision (Anthropic API)
Model: claude-haiku-4-5-20251001

Uses the Anthropic SDK to send the prescription image and extract
structured fields via a strict JSON prompt. Reliable, fast, cheap (~$0.001/image).

Requires ANTHROPIC_API_KEY in .env (already set).
"""
from __future__ import annotations
import base64
import io
import json
import os
import re

from PIL.Image import Image

from .base import BaseOCREngine
from ..models import ExtractedPrescription

_PROMPT = """\
You are a medical prescription OCR system. Look at this label image and extract fields.
Return ONLY a JSON object — no markdown, no explanation:

{
  "medication_name": "<drug name or null>",
  "dose_value": <number or null>,
  "dose_unit": "<mg|mcg|ml|g|meq|units|iu or null>",
  "frequency": "<once daily|twice daily|three times daily|four times daily|as needed|at bedtime or null>",
  "patient_name": "<string or null>",
  "prescriber": "<string or null>"
}

Rules: dose_value must be a plain number. Never guess — use null if not visible."""


class ClaudeVisionEngine(BaseOCREngine):
    name = "claude_vision"

    def __init__(self) -> None:
        self._api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self._model = "claude-haiku-4-5-20251001"

    def _image_to_b64(self, image: Image) -> str:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()

    async def extract(self, image: Image) -> ExtractedPrescription:
        if not self._api_key:
            return self._safe_result("ANTHROPIC_API_KEY not set")
        try:
            import anthropic

            b64 = self._image_to_b64(image)
            client = anthropic.Anthropic(api_key=self._api_key)

            msg = client.messages.create(
                model=self._model,
                max_tokens=256,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": b64,
                                },
                            },
                            {"type": "text", "text": _PROMPT},
                        ],
                    }
                ],
            )
            raw = msg.content[0].text if msg.content else ""
            parsed = self._parse_json(raw)
            return ExtractedPrescription(
                engine=self.name,
                raw_text=raw,
                confidence=0.95,
                medication_name=parsed.get("medication_name"),
                dose_value=self._float(parsed.get("dose_value")),
                dose_unit=parsed.get("dose_unit"),
                frequency=parsed.get("frequency"),
                patient_name=parsed.get("patient_name"),
                prescriber=parsed.get("prescriber"),
            )
        except ImportError:
            return self._safe_result("anthropic package not installed: pip install anthropic")
        except Exception as exc:
            return self._safe_result(str(exc))

    @staticmethod
    def _parse_json(text: str) -> dict:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return {}
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _float(v) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None
