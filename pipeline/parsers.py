"""
Parses raw OCR text into structured ExtractedPrescription fields.
Used by EasyOCR and PaddleOCR engines which return plain text.
"""
from __future__ import annotations
import re
from typing import Optional


_DOSE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*"
    r"(mg|mcg|micrograms?|ml|millilitres?|g\b|gram|meq|mEq|unit|units?|iu|IU)",
    re.IGNORECASE,
)

_FREQ_MAP: dict[str, list[str]] = {
    "once daily":        [r"\bonce\s+daily\b", r"\bqd\b", r"\bod\b", r"\b1x\s*daily\b", r"\bonce\b"],
    "twice daily":       [r"\btwice\s+daily\b", r"\bbid\b", r"\bb\.i\.d\b", r"\b2x\s*daily\b", r"\btwice\b"],
    "three times daily": [r"\bthree\s+times\s+daily\b", r"\btid\b", r"\bt\.i\.d\b", r"\b3x\s*daily\b"],
    "four times daily":  [r"\bfour\s+times\s+daily\b", r"\bqid\b", r"\bq\.i\.d\b", r"\b4x\s*daily\b"],
    "every 4 hours":     [r"\bq4h\b", r"\bevery\s+4\s+hours?\b"],
    "every 6 hours":     [r"\bq6h\b", r"\bevery\s+6\s+hours?\b"],
    "every 8 hours":     [r"\bq8h\b", r"\bevery\s+8\s+hours?\b"],
    "every 12 hours":    [r"\bq12h\b", r"\bevery\s+12\s+hours?\b"],
    "as needed":         [r"\bas\s+needed\b", r"\bprn\b"],
    "at bedtime":        [r"\bat\s+bedtime\b", r"\bqhs\b", r"\bqh\.s\b"],
}

# Matches the LAST single word (or hyphenated word) immediately before a dose —
# avoids capturing patient/prescriber names that precede the drug line.
_MED_NAME_RE = re.compile(
    r"\b([A-Za-z][A-Za-z0-9\-]{2,})\s+"          # single token: drug name
    r"(?:\d+(?:[.,]\d+)?\s*(?:mg|mcg|ml|g\b|meq|units?|iu))",
    re.IGNORECASE,
)

_PATIENT_RE = re.compile(
    r"(?:patient|pt|name)[:\s]+([A-Za-z,\s\.]+?)(?:\n|dob|date|\Z)",
    re.IGNORECASE,
)
_PRESCRIBER_RE = re.compile(
    r"(?:dr\.?|doctor|prescriber|physician|md|provider)[:\s]+([A-Za-z,\s\.]+?)(?:\n|\Z)",
    re.IGNORECASE,
)


def _normalise_unit(raw: str) -> str:
    raw = raw.lower().strip()
    if raw.startswith("micro"):
        return "mcg"
    if raw.startswith("milli"):
        return "ml"
    if raw.startswith("gram"):
        return "g"
    if raw in ("unit", "units"):
        return "units"
    return raw


def extract_dose(text: str) -> tuple[Optional[float], Optional[str]]:
    m = _DOSE_RE.search(text)
    if not m:
        return None, None
    value_str = m.group(1).replace(",", ".")
    unit = _normalise_unit(m.group(2))
    return float(value_str), unit


def extract_frequency(text: str) -> Optional[str]:
    text_l = text.lower()
    for label, patterns in _FREQ_MAP.items():
        for pat in patterns:
            if re.search(pat, text_l):
                return label
    return None


def extract_medication_name(text: str) -> Optional[str]:
    m = _MED_NAME_RE.search(text)
    if m:
        return m.group(1).strip().title()
    # Fallback: first capitalised word that is not a known non-drug token
    _skip = {"rx", "prescription", "patient", "name", "date", "dob", "refill", "qty", "quantity"}
    for word in text.split():
        clean = re.sub(r"[^A-Za-z]", "", word)
        if clean.istitle() and clean.lower() not in _skip and len(clean) > 2:
            return clean.title()
    return None


def extract_patient(text: str) -> Optional[str]:
    m = _PATIENT_RE.search(text)
    if m:
        return m.group(1).strip().title()
    return None


def extract_prescriber(text: str) -> Optional[str]:
    m = _PRESCRIBER_RE.search(text)
    if m:
        return m.group(1).strip().title()
    return None


def parse_prescription_text(text: str) -> dict:
    """Return a dict with all parsed fields from raw OCR text."""
    dose_value, dose_unit = extract_dose(text)
    return {
        "raw_text": text,
        "medication_name": extract_medication_name(text),
        "dose_value": dose_value,
        "dose_unit": dose_unit,
        "frequency": extract_frequency(text),
        "patient_name": extract_patient(text),
        "prescriber": extract_prescriber(text),
    }
