"""
Drug name validator: scans ALL words from OCR output against OpenFDA.

Approach (as requested): take every keyword from every OCR engine,
check each against the FDA drug database, the one with the highest
match wins — regardless of what the regex parser extracted.

Special handling:
  - Concatenated salt blobs: "ETFORMINHCL" → strip "hcl" → "ETFORMIN"
    → also try "METFORMIN" (prepend missing first letter) → FDA match
  - Partial reads: "EMAGLUTIDE" → fuzzy match → "SEMAGLUTIDE"
"""
from __future__ import annotations
import asyncio
import re
from difflib import SequenceMatcher
from typing import Optional

import httpx

_OPENFDA_SUGGEST = "https://api.fda.gov/drug/ndc.json"
_CACHE: dict[str, Optional[str]] = {}

# Salt/ester suffixes that get concatenated by OCR onto drug names
_SALT_SUFFIXES = (
    "potassium", "sodium", "hcl", "hci", "hydrochloride", "calcium",
    "magnesium", "sulfate", "sulphate", "phosphate", "besylate",
    "maleate", "tartrate", "acetate", "citrate", "fumarate",
    "bromide", "chloride", "nitrate", "gluconate", "succinate",
)


_SALT_STRIP = re.compile(
    r"\s+(?:potassium|sodium|hcl|hydrochloride|calcium|magnesium|sulfate|"
    r"sulphate|phosphate|besylate|maleate|tartrate|acetate|citrate|"
    r"fumarate|bromide|chloride|nitrate|gluconate|succinate|mesylate)\s*$",
    re.IGNORECASE,
)


def _strip_salt(name: str) -> str:
    """Remove trailing salt modifier: 'Metformin Hydrochloride' → 'Metformin'."""
    return _SALT_STRIP.sub("", name).strip()


def _similarity(a: str, b: str) -> float:
    """Similarity on stripped names — better score for garbled OCR vs full FDA names."""
    a_clean = _strip_salt(a.lower())
    b_clean = _strip_salt(b.lower())
    # Use max of: stripped vs stripped, full vs full
    s1 = SequenceMatcher(None, a_clean, b_clean).ratio()
    s2 = SequenceMatcher(None, a.lower(), b.lower()).ratio()
    return max(s1, s2)


def _expand_candidates(word: str) -> list[str]:
    """
    Generate variations of a potentially garbled word to improve FDA hits.
    e.g. "ETFORMINHCL" → ["ETFORMINHCL", "ETFORMIN", "METFORMIN"]
         "EMAGLUTIDE"  → ["EMAGLUTIDE", "SEMAGLUTIDE"]
    """
    variants = [word]
    lower = word.lower()

    # Strip concatenated salt suffixes from the end
    for suffix in _SALT_SUFFIXES:
        if lower.endswith(suffix) and len(lower) > len(suffix) + 3:
            stripped = word[: -len(suffix)]
            variants.append(stripped)
            lower = stripped.lower()
            break

    # Try prepending each letter A-Z to recover a missing first character
    # (OCR sometimes clips the first letter of all-caps words)
    base = variants[-1]
    if len(base) >= 5:
        for prefix in "abcdefghijklmnopqrstuvwxyz":
            variants.append(prefix + base)

    return variants


async def _fda_lookup_word(word: str, client: httpx.AsyncClient) -> tuple[Optional[str], float]:
    """Return (FDA generic name, similarity score) for the best match to `word`."""
    key = word.lower()
    if key in _CACHE:
        cached = _CACHE[key]
        if cached:
            return cached, _similarity(word, cached)
        return None, 0.0

    best_name: Optional[str] = None
    best_score = 0.0

    for variant in _expand_candidates(word):
        v_lower = variant.lower()
        for field in ("generic_name", "brand_name"):
            try:
                r = await client.get(
                    _OPENFDA_SUGGEST,
                    params={"search": f'{field}:"{variant}"', "limit": "3"},
                    timeout=6.0,
                )
                if r.status_code != 200:
                    continue
                for res in r.json().get("results", []):
                    for ing in res.get("active_ingredients", []):
                        fda_name = ing.get("name", "").strip()
                        if not fda_name:
                            continue
                        # Score against the ORIGINAL word (not the variant)
                        score = _similarity(word, fda_name)
                        # Give bonus when the variant (stripped/prefixed) is a better match
                        score = max(score, _similarity(variant, fda_name) * 0.95)
                        if score > best_score:
                            best_score = score
                            # Return the stripped generic name (not the salt form)
                            best_name = _strip_salt(fda_name).title()
            except Exception:
                continue
        if best_score >= 0.90:
            break   # good enough — stop trying variants

    _CACHE[key] = best_name
    return best_name, round(best_score, 3)


async def validate_drug_name(
    candidates: list[str],
    timeout: float = 8.0,
) -> tuple[Optional[str], float]:
    """
    Scan every candidate word against OpenFDA.
    Returns (best_drug_name, confidence) — the word that best matches
    a real FDA drug name wins, regardless of regex parser output.
    """
    if not candidates:
        return None, 0.0

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [_fda_lookup_word(c, client) for c in candidates]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    best_name: Optional[str] = None
    best_score = 0.0
    for result in results:
        if isinstance(result, Exception):
            continue
        fda_name, score = result
        if fda_name and score > best_score:
            best_score = score
            best_name = fda_name

    return best_name, round(best_score, 3)


def extract_word_candidates(text: str) -> list[str]:
    """
    Extract every word from raw OCR text that could be a drug name.
    Minimum length 4, not a known skip word.
    Prioritises longer words and ALL-CAPS words (more likely to be drug names).
    """
    from .parsers import _is_skip, _clean_word

    seen: set[str] = set()
    candidates: list[str] = []
    for word in re.split(r"[\s\n/\(\)\[\]]+", text):
        c = _clean_word(word)
        if len(c) < 4 or _is_skip(c):
            continue
        if not re.match(r"^[A-Za-z]", c):
            continue
        key = c.lower()
        if key not in seen:
            seen.add(key)
            candidates.append(c)

    # Sort: ALL-CAPS and longer words first (more likely drug names)
    candidates.sort(key=lambda w: (w.isupper(), len(w)), reverse=True)
    return candidates
