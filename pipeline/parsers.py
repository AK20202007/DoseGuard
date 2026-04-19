"""
Parses raw OCR text into structured ExtractedPrescription fields.

Priority 1: medication_name, dose_value, dose_unit
Priority 2: frequency, patient_name, prescriber
"""
from __future__ import annotations
import re
from typing import Optional


# ── Dose ─────────────────────────────────────────────────────────────────────

_DOSE_RE = re.compile(
    r"(\.?\d+(?:[.,]\d+)?)\s*"
    r"(mg|mcg|micrograms?|ml|millilitres?|g\b|gram|meq|mEq|unit|units?|iu|IU|%)",
    re.IGNORECASE,
)


# ── Frequency ─────────────────────────────────────────────────────────────────

_FREQ_MAP: dict[str, list[str]] = {
    "once daily": [
        r"\bonce\s+daily\b", r"\bqd\b", r"\bod\b", r"\b1x\s*daily\b",
        r"\bevery\s+day\b",                       # "every day"
        r"\bevery\s+24\s+hours?\b",
        r"\btake\s+\d+\s+\w+\s+(?:by\s+mouth\s+)?(?:every\s+day|daily)\b",  # "take 1 tablet every day"
        r"\b1\s+(?:tablet|capsule|pill|tab)\s+(?:by\s+mouth\s+)?(?:every\s+day|daily)\b",
        r"\bonce\b(?!\s+(?:weekly|monthly|a\s+week|a\s+month))",
    ],
    "twice daily": [
        r"\btwice\s+daily\b", r"\bbid\b", r"\bb\.i\.d\b", r"\b2x\s*daily\b",
        r"\btwice\s+a\s+day\b", r"\b2\s+times?\s+(?:a\s+)?day\b",
        r"\bevery\s+12\s+hours?\b", r"\bq12h\b",
        r"\btake\s+\d+.*twice\b",
    ],
    "three times daily": [
        r"\bthree\s+times\s+(?:a\s+)?daily\b", r"\btid\b", r"\bt\.i\.d\b", r"\b3x\s*daily\b",
        r"\b3\s+times?\s+(?:a\s+)?day\b", r"\bthree\s+times?\s+(?:a\s+)?day\b",
    ],
    "four times daily": [
        r"\bfour\s+times\s+(?:a\s+)?daily\b", r"\bqid\b", r"\bq\.i\.d\b", r"\b4x\s*daily\b",
        r"\b4\s+times?\s+(?:a\s+)?day\b",
    ],
    "every 4 hours":  [r"\bq4h\b", r"\bevery\s+4\s+hours?\b"],
    "every 6 hours":  [r"\bq6h\b", r"\bevery\s+6\s+hours?\b"],
    "every 8 hours":  [r"\bq8h\b", r"\bevery\s+8\s+hours?\b"],
    "every 12 hours": [r"\bq12h\b", r"\bevery\s+12\s+hours?\b"],
    "as needed":      [r"\bas\s+needed\b", r"\bprn\b", r"\bwhen\s+needed\b"],
    "at bedtime":     [r"\bat\s+bedtime\b", r"\bqhs\b", r"\bbefore\s+bed\b"],
    "weekly":         [r"\bonce\s+weekly\b", r"\bweekly\b", r"\bq\s*week\b", r"\bqw\b", r"\bonce\s+a\s+week\b"],
    "monthly":        [r"\bonce\s+monthly\b", r"\bmonthly\b", r"\bq\s*month\b", r"\bonce\s+a\s+month\b"],
}

# ── Non-drug words to skip when scanning for a medication name ────────────────
_SKIP_WORDS = {
    # Administrative / packaging
    "rx", "prescription", "patient", "name", "date", "dob", "refill",
    "qty", "quantity", "dispensed", "pharmacy", "pharmacist",
    # Dosage-form words
    "tablets", "tablet", "capsules", "capsule", "syrup", "solution",
    "injection", "injectable", "suspension", "drops", "cream", "ointment",
    "inhaler", "patch", "gel", "powder", "vial", "ampoule", "ampule",
    "film", "coated", "modified", "release", "extended", "delayed",
    "oral", "topical", "intravenous", "intramuscular", "subcutaneous",
    "ophthalmic", "otic", "nasal", "rectal", "vaginal",
    # Pharmacopoeia / regulatory
    "usp", "nf", "ip", "bp", "ep", "ph", "eur", "who", "gmp",
    # Frequency / timing words (must not be mistaken for drug names)
    "once", "twice", "daily", "weekly", "monthly", "bedtime", "needed",
    "morning", "evening", "night", "before", "after", "meals", "food",
    # Common label filler
    "for", "use", "only", "store", "keep", "below", "above", "room",
    "each", "contains", "caution", "warning", "sterile", "mucolytic",
    "expectorant", "antibiotic", "aminoglycoside", "control", "uric",
    "acid", "see", "insert", "package", "leaflet", "information",
    "temperature", "light", "moisture", "children", "away", "reach",
    "dispense", "original", "container", "protect", "refrigerate",
    "shake", "well", "before", "using", "discard", "unused",
    # Salt/ester modifiers — not the active drug name
    "hydrochloride", "hcl", "sodium", "potassium", "calcium", "magnesium",
    "sulfate", "sulphate", "phosphate", "succinate", "maleate", "tartrate",
    "acetate", "citrate", "besylate", "mesylate", "fumarate", "valerate",
    "bromide", "chloride", "nitrate", "oxide", "hydroxide", "gluconate",
    # Company / brand qualifiers
    "brand", "generic", "registered", "trademark",
    "pharmaceuticals", "pharma", "healthcare", "laboratory", "laboratories",
    "industries", "limited", "pvt", "ltd", "inc", "corp", "company",
    "manufacturing", "manufacturers", "formulations", "enterprises",
    # Numeric words
    "one", "two", "three", "four", "five", "six",
}

# Pharmaceutical name suffixes that indicate a real drug name
_DRUG_SUFFIXES = re.compile(
    r"(mab|nib|zole|pril|artan|olol|statin|mycin|cillin|cycline|"
    r"oxacin|vir|azole|tidine|prazole|dipine|formin|gliptin|gliflozin|"
    r"afib|umab|ximab|zumab|kinase|tinib|rafenib|olimus|asone|solone|"
    r"cortisone|prednis|cept|ept|mide|amide|azine|iazide|oxib|phen|"
    r"amine|azepam|diazepam|barb|dol|tol|ide|ite|ate|ase|ine|one)$",
    re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_word(w: str) -> str:
    """Strip trailing punctuation / special chars; keep hyphens inside."""
    return re.sub(r"[®™©°\(\)\[\]\{\}\.,;:!\?/\\'\"\*]", "", w).strip()


def _score_candidate(word: str) -> int:
    """Higher = more likely to be a drug name. Used to rank candidates."""
    score = 0
    w = word.lower()
    if _DRUG_SUFFIXES.search(w):
        score += 10
    if len(word) >= 6:
        score += 3
    if word[0].isupper():
        score += 2
    if word.isupper() and len(word) >= 4:
        score += 1          # ALL-CAPS brand names
    return score


def _is_skip(word: str) -> bool:
    clean = _clean_word(word).lower()
    if not clean or len(clean) < 3:
        return True
    if clean in _SKIP_WORDS:
        return True
    # All-digit or starts with digit
    if re.match(r"^\d", clean):
        return True
    return False


# ── Core extraction functions ─────────────────────────────────────────────────

def extract_dose(text: str) -> tuple[Optional[float], Optional[str]]:
    m = _DOSE_RE.search(text)
    if not m:
        return None, None
    raw = m.group(1)
    if raw.startswith("."):
        raw = "0" + raw
    value = float(raw.replace(",", "."))
    unit = _normalise_unit(m.group(2))
    return value, unit


def _normalise_unit(raw: str) -> str:
    raw = raw.lower().strip()
    if raw.startswith("micro") or raw == "ug":
        return "mcg"
    if raw.startswith("milli"):
        return "ml"
    if raw.startswith("gram"):
        return "g"
    if raw in ("unit", "units"):
        return "units"
    return raw


def extract_frequency(text: str) -> Optional[str]:
    text_l = text.lower()
    for label, patterns in _FREQ_MAP.items():
        for pat in patterns:
            if re.search(pat, text_l):
                return label
    return None


def extract_medication_name(text: str) -> Optional[str]:
    """
    Multi-strategy medication name extractor.

    Priority order (generic name preferred over brand name):
      1. Word AFTER a dosage-form phrase on the same/next line
         ("Solution for injection\\nAbatacept" → Abatacept)
      2. Parenthesised generic name  ("(Abatacept)" → Abatacept)
      3. Word immediately AFTER a dose  ("125 mg\\nAbatacept" → Abatacept)
      4. Word immediately BEFORE a dose ("ORENCIA 125 mg" → Orencia — brand fallback)
      5. Word BEFORE dosage-form keyword ("Acetazolamide Tablets" → Acetazolamide)
      6. Best-scored candidate from all prominent words
    """
    cleaned = re.sub(r"[®™©°]", " ", text)

    # ── Strategy 1: word AFTER dosage-form phrase ─────────────────────────────
    # Catches "Solution for injection\nAbatacept", "Tablets IP\nDrugName"
    form_after = re.search(
        r"(?:solution\s+for\s+injection|solution\s+for\s+infusion|"
        r"tablets?\s+(?:ip|bp|usp|nf|ep)?|capsules?\s+(?:bp|usp|ip)?|"
        r"syrup|suspension|oral\s+drops?|injection|infusion|cream|ointment)"
        r"[\s\n]+([A-Za-z][A-Za-z0-9\-]{3,})",
        cleaned, re.IGNORECASE,
    )
    if form_after:
        candidate = _clean_word(form_after.group(1))
        if not _is_skip(candidate):
            return candidate.title()

    # ── Strategy 2: parenthesised generic name ────────────────────────────────
    paren = re.search(r"\(([A-Za-z][A-Za-z0-9\-\s]{3,40})\)", cleaned)
    if paren:
        candidate = _clean_word(paren.group(1).strip().split()[0])
        if not _is_skip(candidate):
            return candidate.title()

    # ── Strategy 3: word BEFORE dose ─────────────────────────────────────────
    # Most reliable for well-formatted labels: "Lisinopril 10 mg"
    m3 = re.search(
        r"\b([A-Za-z][A-Za-z0-9\-]{2,}(?:\s+[A-Za-z][A-Za-z0-9\-]{2,})?)\s+"
        r"(?:\.?\d+(?:[.,]\d+)?\s*(?:mg|mcg|ml|g\b|meq|units?|iu|%))",
        cleaned, re.IGNORECASE,
    )
    if m3:
        candidate = _best_token(m3.group(1))
        if candidate and not _is_skip(candidate):
            return candidate.title()

    # ── Strategy 4: word BEFORE dosage-form keyword ───────────────────────────
    # "Acetazolamide Tablets", "Acarbose Tablets IP"
    form_before = re.search(
        r"\b([A-Za-z][A-Za-z0-9\-]{3,})\s+"
        r"(?:tablets?|capsules?|syrup|suspension|drops?|cream|ointment|"
        r"powder|gel|patch|spray|inhaler|injection)\b",
        cleaned, re.IGNORECASE,
    )
    if form_before:
        candidate = _clean_word(form_before.group(1))
        if not _is_skip(candidate):
            return candidate.title()

    # ── Strategy 5: word AFTER dose (last resort — grabs noise easily) ────────
    m5 = re.search(
        r"(?:\.?\d+(?:[.,]\d+)?\s*(?:mg|mcg|ml|g\b|meq|units?|iu))"
        r"[\s\n]+([A-Za-z][A-Za-z0-9\-]{4,})",   # min 5 chars to skip "once"
        cleaned, re.IGNORECASE,
    )
    if m5:
        candidate = _clean_word(m5.group(1))
        if not _is_skip(candidate):
            return candidate.title()

    # ── Strategy 6: best-scored candidate ────────────────────────────────────
    candidates: list[tuple[int, str]] = []
    for word in re.split(r"[\s\n]+", cleaned):
        c = _clean_word(word)
        if _is_skip(c) or not re.match(r"^[A-Za-z]", c):
            continue
        if c[0].isupper() or c.isupper():
            candidates.append((_score_candidate(c), c))

    if candidates:
        candidates.sort(key=lambda x: -x[0])
        return candidates[0][1].title()

    return None


def _best_token(phrase: str) -> Optional[str]:
    """From a multi-word phrase, return the token most likely to be the drug."""
    words = [_clean_word(w) for w in phrase.strip().split()]
    words = [w for w in words if not _is_skip(w) and len(w) >= 3]
    if not words:
        return None
    # Prefer words with known pharmaceutical suffixes, else longest
    scored = sorted(words, key=lambda w: (_score_candidate(w), len(w)), reverse=True)
    return scored[0]


def extract_patient(text: str) -> Optional[str]:
    m = re.search(
        r"(?:patient|pt|name)[:\s]+([A-Za-z,\s\.]+?)(?:\n|dob|date|\Z)",
        text, re.IGNORECASE,
    )
    return m.group(1).strip().title() if m else None


def extract_prescriber(text: str) -> Optional[str]:
    m = re.search(
        r"(?:dr\.?|doctor|prescriber|physician|md|provider)[:\s]+([A-Za-z,\s\.]+?)(?:\n|\Z)",
        text, re.IGNORECASE,
    )
    return m.group(1).strip().title() if m else None


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
