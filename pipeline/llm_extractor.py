"""
LLM-based prescription field extractor with Gemini Vision.

Strategy:
  1. Gemini 2.0 Flash Vision (primary) — sends the ACTUAL IMAGE to Gemini.
     Sees what a human would see; corrects OCR errors in the raw text.
  2. Fallback: local Ollama (Mistral/Llama) — text-only, no API key needed.

Gemini free tier: 15 requests/min, 1500 requests/day.
Requires GOOGLE_API_KEY in .env.
"""
from __future__ import annotations
import base64
import io
import json
import os
import re
from typing import Optional

import httpx
from PIL.Image import Image as PILImage

_GEMINI_VISION_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)
_OLLAMA_URL = "http://localhost:11434/api/generate"
_PREFERRED_OLLAMA = ["mistral", "llama3.2", "llama3", "phi3", "gemma2"]

_VISION_PROMPT = """\
You are a medical prescription OCR verifier. Look at this drug label image.
The 3 OCR engines below extracted text from it — some may have errors.

OCR ENGINE READINGS:
{ocr_text}

Your job: look at the ACTUAL IMAGE and return the CORRECT values.
Return ONLY this JSON object (no markdown, no explanation):
{{
  "medication_name": "<generic drug name — NOT brand, NOT manufacturer, NOT salt modifier>",
  "dose_value": <number or null>,
  "dose_unit": "<mg|mcg|ml|g|units|iu|% or null>",
  "frequency": "<once daily|twice daily|three times daily|four times daily|as needed|at bedtime|weekly or null>"
}}

Rules:
- medication_name: active ingredient only (losartan NOT losartan potassium; \
metformin NOT metformin hcl; acetazolamide NOT morningside)
- Ignore company names: Teva, Mylan, CVS, Aurobindo, Pfizer, Morningside, etc.
- "every day" / "daily" / "once a day" → "once daily"
- "twice a day" / "every 12 hours" → "twice daily"
- dose_value is a plain number only
- null if a field is not visible
"""

_TEXT_ONLY_PROMPT = """\
You are a medical prescription parser. Extract fields from this pharmacy label text.
Return ONLY a JSON object, no markdown:
{{
  "medication_name": "<generic drug name, not brand, not salt modifier like Potassium/Sodium/HCl>",
  "dose_value": <number or null>,
  "dose_unit": "<mg|mcg|ml|g|units|iu or null>",
  "frequency": "<once daily|twice daily|three times daily|four times daily|as needed|at bedtime|weekly or null>"
}}
Rules: ignore manufacturer names (Teva, Mylan, CVS, Morningside, Aurobindo, etc.)
"every day"/"daily" = once daily. "twice a day" = twice daily.
null if not found.

Label text:
{text}
"""


def _img_to_b64(image: PILImage) -> str:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode()


async def gemini_verify(
    image: PILImage,
    ocr_text: str,
    timeout: float = 15.0,
) -> Optional[dict]:
    """
    Send the actual image to Gemini Vision for field extraction + OCR verification.
    This is the primary path — Gemini sees what a human sees.
    """
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return None
    try:
        b64 = _img_to_b64(image)
        prompt = _VISION_PROMPT.format(ocr_text=ocr_text[:800] if ocr_text else "(no OCR text available)")
        payload = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                    {"text": prompt},
                ]
            }],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 256,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                _GEMINI_VISION_URL,
                params={"key": api_key},
                json=payload,
            )
        if r.status_code != 200:
            return None
        raw = (
            r.json()
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        return _parse_result(raw, "gemini-2.0-flash-vision")
    except Exception:
        return None


async def llm_extract_fields(
    combined_ocr_text: str,
    timeout: float = 15.0,
    image: Optional[PILImage] = None,
) -> Optional[dict]:
    """
    Extract/verify prescription fields using an LLM.

    If `image` is provided AND GOOGLE_API_KEY is set:
      → Uses Gemini Vision (looks at the actual label image)
    Else if Ollama is running:
      → Uses local Mistral/Llama (text-only, free, no internet)
    Else if GOOGLE_API_KEY is set:
      → Uses Gemini text-only mode
    """
    if not combined_ocr_text.strip() and image is None:
        return None

    # 1 — Gemini Vision (best: sees the actual image)
    if image is not None and os.getenv("GOOGLE_API_KEY"):
        result = await gemini_verify(image, combined_ocr_text, timeout=timeout)
        if result:
            return result

    # 2 — Local Ollama fallback (text-only, free)
    result = await _call_ollama(combined_ocr_text, timeout=min(timeout, 12.0))
    if result:
        return result

    # 3 — Gemini text-only (no image)
    if os.getenv("GOOGLE_API_KEY") and combined_ocr_text:
        result = await _call_gemini_text(combined_ocr_text, timeout=timeout)
        if result:
            return result

    return None


async def _call_ollama(text: str, timeout: float) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get("http://localhost:11434/api/tags", timeout=3.0)
            if r.status_code != 200:
                return None
            installed = {m["name"].split(":")[0] for m in r.json().get("models", [])}
            model = next((m for m in _PREFERRED_OLLAMA if m in installed), None)
            if not model:
                return None
            prompt = _TEXT_ONLY_PROMPT.format(text=text[:1500])
            r2 = await client.post(_OLLAMA_URL, json={
                "model": model, "prompt": prompt, "stream": False,
                "options": {"temperature": 0.0, "num_predict": 200},
            })
            if r2.status_code != 200:
                return None
            return _parse_result(r2.json().get("response", ""), model)
    except Exception:
        return None


async def _call_gemini_text(text: str, timeout: float) -> Optional[dict]:
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return None
    try:
        prompt = _TEXT_ONLY_PROMPT.format(text=text[:2000])
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 256,
                                 "responseMimeType": "application/json"},
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(_GEMINI_VISION_URL, params={"key": api_key}, json=payload)
        if r.status_code != 200:
            return None
        raw = (r.json().get("candidates", [{}])[0]
               .get("content", {}).get("parts", [{}])[0].get("text", ""))
        return _parse_result(raw, "gemini-2.0-flash-text")
    except Exception:
        return None


def _parse_result(text: str, model: str) -> Optional[dict]:
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
            "dose_value":      dose_val,
            "dose_unit":       _clean_unit(obj.get("dose_unit")),
            "frequency":       _clean_freq(obj.get("frequency")),
            "llm_model":       model,
        }
    except json.JSONDecodeError:
        return None


def _clean_name(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    name = str(v).strip().lower()
    for s in (" potassium", " sodium", " hcl", " hydrochloride", " calcium",
              " magnesium", " sulfate", " besylate", " sulphate"):
        if name.endswith(s):
            name = name[: -len(s)]
    return name or None


def _clean_unit(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    u = str(v).strip().lower()
    return {"ug": "mcg", "micrograms": "mcg", "milligrams": "mg",
            "milliliters": "ml", "millilitres": "ml", "grams": "g"}.get(u, u)


def _clean_freq(v) -> Optional[str]:
    if not v or str(v).lower() in ("null", "none", ""):
        return None
    freq = str(v).strip().lower()
    return {
        "once a day": "once daily", "every day": "once daily", "daily": "once daily",
        "twice a day": "twice daily", "two times a day": "twice daily",
        "three times a day": "three times daily",
        "four times a day": "four times daily",
    }.get(freq, freq)
