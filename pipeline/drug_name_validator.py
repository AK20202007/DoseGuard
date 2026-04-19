"""
Drug name validator: cross-references OCR-extracted words against
the OpenFDA drug name database.

Given a list of candidate words extracted from a label, returns the
one that is most likely a real drug name by checking OpenFDA.

Implements the "check all keywords against a drug database" idea:
every capitalized word the OCR sees is scored — the one that exists
in FDA records wins.
"""
from __future__ import annotations
import asyncio
import re
from difflib import SequenceMatcher
from typing import Optional

import httpx

_OPENFDA_SUGGEST = "https://api.fda.gov/drug/ndc.json"
_CACHE: dict[str, Optional[str]] = {}   # word → validated name or None


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


async def _fda_lookup(word: str, client: httpx.AsyncClient) -> Optional[str]:
    """Return the FDA generic name that best matches `word`, or None."""
    if word in _CACHE:
        return _CACHE[word]
    try:
        # Try generic name first, then brand
        for field in ("generic_name", "brand_name"):
            r = await client.get(
                _OPENFDA_SUGGEST,
                params={"search": f'{field}:"{word}"', "limit": "3"},
                timeout=6.0,
            )
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    for res in results:
                        ing = res.get("active_ingredients", [])
                        if ing:
                            name = ing[0].get("name", "").strip().title()
                            if name and _similarity(word, name) > 0.6:
                                _CACHE[word] = name
                                return name
    except Exception:
        pass
    _CACHE[word] = None
    return None


async def validate_drug_name(
    candidates: list[str],
    timeout: float = 8.0,
) -> tuple[Optional[str], float]:
    """
    Given a list of candidate words (from OCR text), query OpenFDA and
    return (best_drug_name, confidence_score).

    confidence_score: 1.0 = exact FDA match, 0.6–0.99 = fuzzy match, 0.0 = no match
    """
    if not candidates:
        return None, 0.0

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [_fda_lookup(c, client) for c in candidates]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    best_name: Optional[str] = None
    best_score = 0.0
    for cand, fda_name in zip(candidates, results):
        if isinstance(fda_name, Exception) or not fda_name:
            continue
        score = _similarity(cand, fda_name)
        if score > best_score:
            best_score = score
            best_name = fda_name

    return best_name, round(best_score, 3)


def extract_word_candidates(text: str) -> list[str]:
    """
    Pull every capitalized or ALL-CAPS word from OCR text that could
    be a drug name (length ≥ 4, not a known filler word).
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
    return candidates
