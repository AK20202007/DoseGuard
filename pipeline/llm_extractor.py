"""
LLM-based prescription field extractor using Ollama (free, local).

Takes raw OCR text from all engines combined and asks a local LLM
(Mistral, Llama3, etc.) to extract structured fields in JSON.

This handles pharmacy-label formats that regex cannot:
  "Take 1 tablet by mouth every day"       → frequency: "once daily"
  "LOSARTAN POTASSIUM 50 MG TAB"           → medication_name: "losartan"
  "Take 2 capsules twice a day with food"  → frequency: "twice daily"

Falls back gracefully if Ollama is not running — regex parser is used instead.
"""
from __future__ import annotations
import json
import re
from typing import Optional

import httpx

_OLLAMA_URL = "http://localhost:11434/api/generate"

_PROMPT_TEMPLATE = """\
You are a medical prescription parser. Extract fields from this pharmacy label text.
Return ONLY a JSON object, no markdown, no explanation:

{{
  "medication_name": "<generic drug name, not brand, not salt modifier like Potassium/Sodium/HCl>",
  "dose_value": <number or null>,
  "dose_unit": "<mg|mcg|ml|g|units|iu or null>",
  "frequency": "<once daily|twice daily|three times daily|four times daily|as needed|at bedtime|weekly or null>"
}}

Rules:
- medication_name: generic drug only (e.g. "losartan" not "losartan potassium", "metformin" not "metformin hcl")
- "every day", "daily", "once a day" all mean "once daily"
- "twice a day", "two times a day", "every 12 hours" all mean "twice daily"
- dose_value must be a plain number (50, 0.25, 125)
- null if a field is not clearly visible

Label text:
{text}
"""

# Preferred models in order — first one found in Ollama is used
_PREFERRED_MODELS = ["mistral", "llama3.2", "llama3", "llama2", "phi3", "gemma2"]


async def _get_available_model(client: httpx.AsyncClient) -> Optional[str]:
    """Return the first preferred model that exists in the local Ollama instance."""
    try:
        r = await client.get("http://localhost:11434/api/tags", timeout=3.0)
        if r.status_code != 200:
            return None
        installed = {m["name"].split(":")[0] for m in r.json().get("models", [])}
        for preferred in _PREFERRED_MODELS:
            if preferred in installed:
                return preferred
        # Fallback: use whatever is installed
        names = [m["name"] for m in r.json().get("models", [])]
        return names[0] if names else None
    except Exception:
        return None


async def llm_extract_fields(
    combined_ocr_text: str,
    timeout: float = 15.0,
) -> Optional[dict]:
    """
    Call local Ollama LLM to extract prescription fields from OCR text.
    Returns a dict with medication_name, dose_value, dose_unit, frequency
    or None if Ollama is unavailable.
    """
    if not combined_ocr_text.strip():
        return None

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            model = await _get_available_model(client)
            if not model:
                return None

            prompt = _PROMPT_TEMPLATE.format(text=combined_ocr_text[:1500])
            r = await client.post(_OLLAMA_URL, json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.0, "num_predict": 200},
            })
            if r.status_code != 200:
                return None

            raw = r.json().get("response", "")
            return _parse_json(raw, model)

    except Exception:
        return None


def _parse_json(text: str, model: str) -> Optional[dict]:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        obj = json.loads(m.group())
        dose_val = obj.get("dose_value")
        try:
            dose_val = float(dose_val) if dose_val is not None else None
        except (ValueError, TypeError):
            dose_val = None

        return {
            "medication_name": _clean_name(obj.get("medication_name")),
            "dose_value": dose_val,
            "dose_unit": _clean_unit(obj.get("dose_unit")),
            "frequency": _clean_freq(obj.get("frequency")),
            "llm_model": model,
        }
    except json.JSONDecodeError:
        return None


def _clean_name(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    # Remove salt suffixes from the name
    name = str(v).strip().lower()
    for suffix in (" potassium", " sodium", " hcl", " hydrochloride",
                   " calcium", " magnesium", " sulfate", " besylate"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name or None


def _clean_unit(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    u = str(v).strip().lower()
    aliases = {"ug": "mcg", "micrograms": "mcg", "milligrams": "mg",
               "milliliters": "ml", "millilitres": "ml", "grams": "g"}
    return aliases.get(u, u)


def _clean_freq(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    freq = str(v).strip().lower()
    # Normalise common variations the LLM might output
    mapping = {
        "once a day": "once daily",
        "every day": "once daily",
        "daily": "once daily",
        "twice a day": "twice daily",
        "two times a day": "twice daily",
        "2 times daily": "twice daily",
        "three times a day": "three times daily",
        "3 times daily": "three times daily",
        "four times a day": "four times daily",
        "4 times daily": "four times daily",
    }
    return mapping.get(freq, freq)
