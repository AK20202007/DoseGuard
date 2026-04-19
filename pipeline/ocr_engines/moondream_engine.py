"""
Engine C: Moondream2 via Ollama (100% free, runs locally)
Model: moondream  (1.7 GB — pull once with: ollama pull moondream)

Ollama exposes a local REST API at http://localhost:11434 — no API key,
no internet after initial model download.

Install Ollama: https://ollama.com  (brew install ollama on macOS)
Pull model:    ollama pull moondream
Start server:  ollama serve   (or it auto-starts on macOS)
"""
from __future__ import annotations
import base64
import io
import json
import re

import httpx
from PIL.Image import Image

from .base import BaseOCREngine
from ..models import ExtractedPrescription
from ..parsers import parse_prescription_text, extract_dose, extract_frequency, extract_medication_name

_OLLAMA_URL = "http://localhost:11434/api/generate"

# Moondream 2B sometimes returns empty for complex multi-part questions.
# We try prompts in order, stopping at the first non-empty response.
_PROMPT_CHAIN = [
    "What drug name and dose is on this label?",                         # concise — most reliable
    "What is the drug name, dose, and how often to take it?",            # medium
    "What is the patient name, drug name, dose, and how often to take it on this prescription label?",  # full
    "Describe the text on this medication label.",                        # fallback — always responds
]


class MoondreamEngine(BaseOCREngine):
    name = "moondream"

    def __init__(self, model: str = "moondream") -> None:
        self._model = model

    def _b64(self, image: Image) -> str:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()

    async def _call_ollama(
        self, client: httpx.AsyncClient, b64: str, prompt: str
    ) -> str:
        """Single Ollama call; returns stripped response string."""
        r = await client.post(_OLLAMA_URL, json={
            "model": self._model,
            "prompt": prompt,
            "images": [b64],
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 200},
        })
        if r.status_code != 200:
            return ""
        return r.json().get("response", "").strip()

    async def extract(self, image: Image) -> ExtractedPrescription:
        try:
            b64 = self._b64(image)

            async with httpx.AsyncClient(timeout=60.0) as client:
                # Check model exists
                probe = await client.post(_OLLAMA_URL, json={
                    "model": self._model, "prompt": "hi", "stream": False,
                    "options": {"num_predict": 1}
                })
                if probe.status_code == 404:
                    return self._safe_result(
                        f"Model '{self._model}' not found. Run: ollama pull moondream"
                    )

                # Try each prompt in the chain; stop at first non-empty response
                raw = ""
                for prompt in _PROMPT_CHAIN:
                    raw = await self._call_ollama(client, b64, prompt)
                    if raw:
                        break

            if not raw:
                return self._safe_result(
                    "Moondream returned empty response for all prompts — "
                    "image may be too complex or model needs more VRAM."
                )

            # Use the full multi-strategy parser — handles both structured
            # ("Drug name is X, dose is Y") and descriptive ("...reads Acetazolamide 250mg...")
            parsed = parse_prescription_text(raw)
            # _parse_natural gives us better extraction for conversational answers;
            # try it too and use whichever found more fields
            natural = self._parse_natural(raw)
            fields = {
                "medication_name": parsed["medication_name"] or natural.get("medication_name"),
                "dose_value":      parsed["dose_value"]      or natural.get("dose_value"),
                "dose_unit":       parsed["dose_unit"]       or natural.get("dose_unit"),
                "frequency":       parsed["frequency"]       or natural.get("frequency"),
                "patient_name":    None,
                "prescriber":      None,
            }
            return ExtractedPrescription(
                engine=self.name,
                raw_text=raw,
                confidence=0.85,
                **fields,
            )

        except httpx.ConnectError:
            # Try to auto-start Ollama in the background
            started = self._try_start_ollama()
            if started:
                # Retry once after a short wait
                import asyncio as _asyncio
                await _asyncio.sleep(3)
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        r = await client.post(_OLLAMA_URL, json=payload)
                        if r.status_code == 200:
                            raw = r.json().get("response", "").strip()
                            fields = self._parse_natural(raw)
                            return ExtractedPrescription(
                                engine=self.name, raw_text=raw, confidence=0.85, **fields
                            )
                except Exception:
                    pass
            return self._safe_result(
                "Ollama not running. It will auto-start — please retry in a few seconds. "
                "Or run manually: ollama serve"
            )
        except Exception as exc:
            return self._safe_result(str(exc))

    @staticmethod
    def _try_start_ollama() -> bool:
        """Attempt to launch `ollama serve` as a background process."""
        import shutil
        import subprocess
        binary = shutil.which("ollama") or "/usr/local/bin/ollama"
        if not shutil.which("ollama") and not __import__("os").path.exists(binary):
            return False
        try:
            subprocess.Popen(
                [binary, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return True
        except Exception:
            return False

    @staticmethod
    def _parse_natural(text: str) -> dict:
        """Parse moondream's natural language answer into prescription fields."""
        # Drug name: "drug (name|is) X" or "Drug: X"
        med = None
        m = re.search(
            r"(?:drug(?:\s+name)?(?:\s+is)?|medication(?:\s+is)?|Drug)\s*[:\s]+([A-Za-z][A-Za-z0-9\-]+)",
            text, re.IGNORECASE,
        )
        if m:
            med = m.group(1).strip().title()

        # Dose: reuse shared parser
        dose_value, dose_unit = extract_dose(text)

        # Frequency: reuse shared parser
        frequency = extract_frequency(text)

        # Patient name: "patient('s)? name is X" or "Patient: X"
        patient = None
        mp = re.search(
            r"patient(?:'s)?\s+name\s+is\s+([A-Za-z][A-Za-z\s\.]+?)(?:\.|$|\n)",
            text, re.IGNORECASE,
        )
        if mp:
            patient = mp.group(1).strip().title()

        return {
            "medication_name": med,
            "dose_value": dose_value,
            "dose_unit": dose_unit,
            "frequency": frequency,
            "patient_name": patient,
            "prescriber": None,
        }

    @staticmethod
    def _parse_json(text: str) -> dict:
        # Try greedy JSON match first (handles multi-line)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            raw = m.group()
            # Remove duplicate keys by keeping last occurrence, fix truncation
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                # Attempt to auto-close a truncated JSON
                try:
                    fixed = raw.rstrip().rstrip(",") + "}"
                    return json.loads(fixed)
                except json.JSONDecodeError:
                    pass

        # Regex fallback: extract individual key-value pairs
        result: dict = {}
        for key in ("medication_name", "dose_value", "dose_unit", "frequency",
                    "patient_name", "prescriber"):
            # Match "key": "value" or "key": number
            pat = rf'"{key}"\s*:\s*("([^"]*?)"|(\d+(?:\.\d+)?)|null)'
            kv = re.search(pat, text)
            if kv:
                if kv.group(2) is not None:
                    result[key] = kv.group(2)
                elif kv.group(3) is not None:
                    result[key] = kv.group(3)
                else:
                    result[key] = None
        return result

    @staticmethod
    def _float(v) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None
