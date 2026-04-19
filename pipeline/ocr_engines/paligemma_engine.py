"""
Engine C: PaliGemma 2 via HuggingFace Inference API
Model: google/paligemma2-3b-mix-448  (or paligemma-3b-mix-448)

Two API paths tried in order:
  1. HF Inference API v1 (OpenAI-compatible multimodal chat)
     POST https://api-inference.huggingface.co/v1/chat/completions
  2. HF Inference API classic (image-text-to-text)
     POST https://api-inference.huggingface.co/models/{model}

Requirements:
  - HF_API_TOKEN in .env
  - Accept PaliGemma / Gemma license on huggingface.co first:
      https://huggingface.co/google/paligemma2-3b-mix-448
"""
from __future__ import annotations
import base64
import io
import json
import os
import re

import httpx
from PIL.Image import Image

from .base import BaseOCREngine
from ..models import ExtractedPrescription


_EXTRACT_PROMPT = (
    "Extract all prescription fields from this label image and return ONLY "
    "a JSON object with these keys (null if not visible): "
    '{"medication_name": string|null, "dose_value": number|null, '
    '"dose_unit": "mg"|"mcg"|"ml"|"g"|"meq"|"units"|"iu"|null, '
    '"frequency": string|null, "patient_name": string|null, "prescriber": string|null}. '
    "No markdown, no explanation, just the JSON."
)

# PaliGemma prompt format: short task prefix before image token
_PALI_TASK = "Extract prescription fields as JSON: "


class PaliGemmaEngine(BaseOCREngine):
    name = "paligemma"

    def __init__(self) -> None:
        self._token = os.getenv("HF_API_TOKEN", "")
        self._model = os.getenv(
            "HF_VISION_MODEL", "google/paligemma2-3b-mix-448"
        )

    def _b64(self, image: Image) -> str:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()

    async def extract(self, image: Image) -> ExtractedPrescription:
        if not self._token:
            return self._safe_result(
                "HF_API_TOKEN not set — add it to .env to enable PaliGemma"
            )
        b64 = self._b64(image)
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

        # ── Try path 1: OpenAI-compatible chat completions (v1 router) ─────
        result = await self._try_chat_completions(b64, headers)
        if result is not None:
            return result

        # ── Try path 2: Classic image-text-to-text endpoint ─────────────────
        result = await self._try_classic(b64, headers)
        if result is not None:
            return result

        return self._safe_result(
            f"PaliGemma unreachable on HF free tier for model '{self._model}'. "
            "Ensure you accepted the license at huggingface.co/google/paligemma2-3b-mix-448 "
            "and that your token has read access."
        )

    # ── Path 1: /v1/chat/completions (OpenAI-compatible) ────────────────────
    async def _try_chat_completions(
        self, b64: str, headers: dict
    ) -> ExtractedPrescription | None:
        url = "https://api-inference.huggingface.co/v1/chat/completions"
        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                        },
                        {"type": "text", "text": _EXTRACT_PROMPT},
                    ],
                }
            ],
            "max_tokens": 300,
            "temperature": 0.0,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(url, json=payload, headers=headers)
                if r.status_code in (404, 422):
                    return None  # route not available, try next
                r.raise_for_status()
                data = r.json()
            raw = data["choices"][0]["message"]["content"]
            return self._build_result(raw)
        except (KeyError, IndexError, httpx.HTTPStatusError):
            return None
        except Exception:
            return None

    # ── Path 2: Classic HF Inference API ────────────────────────────────────
    async def _try_classic(
        self, b64: str, headers: dict
    ) -> ExtractedPrescription | None:
        url = f"https://api-inference.huggingface.co/models/{self._model}"
        # PaliGemma classic format: inputs is the text prompt, image in parameters
        payload = {
            "inputs": _PALI_TASK + _EXTRACT_PROMPT,
            "parameters": {
                "image": b64,
                "max_new_tokens": 300,
                "temperature": 0.01,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(url, json=payload, headers=headers)
                if r.status_code in (404, 422, 503):
                    return None
                r.raise_for_status()
                data = r.json()
            if isinstance(data, list) and data:
                raw = data[0].get("generated_text", "")
            elif isinstance(data, dict):
                raw = data.get("generated_text", "")
            else:
                return None
            return self._build_result(raw)
        except Exception:
            return None

    # ── Parse JSON from model output ─────────────────────────────────────────
    def _build_result(self, raw: str) -> ExtractedPrescription:
        parsed = self._parse_json(raw)
        return ExtractedPrescription(
            engine=self.name,
            raw_text=raw,
            confidence=0.88,
            medication_name=parsed.get("medication_name"),
            dose_value=self._float(parsed.get("dose_value")),
            dose_unit=parsed.get("dose_unit"),
            frequency=parsed.get("frequency"),
            patient_name=parsed.get("patient_name"),
            prescriber=parsed.get("prescriber"),
        )

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
