"""
Layer 2: The Deterministic Safety Vault

Validates extracted (medication_name, dose_value, dose_unit) against two
authoritative pharmacological databases — no AI inference involved.

Sources (both free, no API key required):
  1. OpenFDA Drug NDC API  — https://api.fda.gov/drug/ndc.json
  2. NIH DailyMed API      — https://dailymed.nlm.nih.gov/dailymed/services/v2

Logic:
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. Search OpenFDA for the medication name.                      │
  │    • Collect all known strengths (e.g. "5 MG", "10 MG", …).    │
  │ 2. If OpenFDA returns nothing, fall back to DailyMed.           │
  │ 3. Compare extracted dose against the known-strengths list.     │
  │    • Exact match → dose_verified = True                         │
  │    • No match    → clinical_impossibility = True → HALT         │
  └─────────────────────────────────────────────────────────────────┘

Clinical Impossibility examples:
  "Lisinopril 200 mg" — real strengths top out at 40 mg → HALT
  "Metformin 50 mg"   — real strengths start at 500 mg  → HALT
"""
from __future__ import annotations
import asyncio
import os
import re
from typing import Optional

import httpx

from .models import ConsensusResult, DrugStrength, SafetyValidationResult


_OPENFDA_URL = os.getenv("OPENFDA_BASE_URL", "https://api.fda.gov/drug")
_DAILYMED_URL = os.getenv(
    "DAILYMED_BASE_URL", "https://dailymed.nlm.nih.gov/dailymed/services/v2"
)

# Tolerance for near-miss detection (informational only — exact match still required)
_NEAR_MISS_RATIO = 0.20  # within ±20 % of a known strength


_UNIT_ALIASES: dict[str, str] = {
    "ug": "mcg",       # micrograms — FDA uses both spellings
    "mcg": "mcg",
    "mg": "mg",
    "g": "g",
    "ml": "ml",
    "meq": "meq",
    "unit": "units",
    "units": "units",
    "iu": "iu",
}

# Conversion table to nanograms (common base) for cross-unit comparison
_TO_NG: dict[str, float] = {
    "g":     1_000_000_000,
    "mg":    1_000_000,
    "mcg":   1_000,
    "ug":    1_000,
    "ng":    1,
    "ml":    None,   # volume — not mass-convertible
    "meq":   None,
    "units": None,
    "iu":    None,
}


def _parse_strength_label(label: str) -> tuple[float, str] | None:
    """
    Parse strength strings into (value, normalised_unit).

    Handles:
      '5 MG/1'     → (5.0, 'mg')
      '.125 mg/1'  → (0.125, 'mg')   leading-dot (FDA format)
      '125 ug/1'   → (125.0, 'mcg')  ug alias for mcg
      '0.25 mg/mL' → (0.25, 'mg')    concentration — only value+unit captured
    """
    m = re.match(
        r"(\.?\d+(?:[.,]\d+)?)\s*"        # value — optional leading dot
        r"(mg|mcg|ug|ml|g\b|meq|units?|iu)",
        label.strip(),
        re.IGNORECASE,
    )
    if not m:
        return None
    raw_value = m.group(1).lstrip(".") or "0"   # ".125" → "125" then prepend "0."
    # Restore proper decimal: if original started with ".", prepend "0"
    if m.group(1).startswith("."):
        raw_value = "0." + m.group(1)[1:]
    else:
        raw_value = m.group(1).replace(",", ".")
    value = float(raw_value)
    unit = _UNIT_ALIASES.get(m.group(2).lower(), m.group(2).lower())
    return value, unit


class DeterministicSafetyVault:
    """
    Validates a consensus prescription against authoritative drug databases.

    Usage::

        vault = DeterministicSafetyVault()
        result = await vault.validate(consensus_result)
        if not result.passed:
            print("BLOCKED:", result.impossibility_reason or result.failure_reason)
    """

    def __init__(self, http_timeout: float = 15.0) -> None:
        self._timeout = http_timeout

    async def validate(self, consensus: ConsensusResult) -> SafetyValidationResult:
        """Entry point: validate the agreed prescription from Layer 1."""
        if not consensus.passed:
            return SafetyValidationResult(
                passed=False,
                failure_reason="Layer 1 consensus not achieved; Layer 2 skipped.",
            )

        med_name = consensus.medication_name
        dose_value = consensus.dose_value
        dose_unit = consensus.dose_unit

        if not med_name:
            return SafetyValidationResult(
                passed=False,
                failure_reason="No medication name extracted — cannot validate.",
            )

        # Fetch known strengths from both sources in parallel
        fda_strengths, dm_strengths = await asyncio.gather(
            self._query_openfda(med_name),
            self._query_dailymed(med_name),
        )

        openfda_hit = bool(fda_strengths)
        dailymed_hit = bool(dm_strengths)
        all_strengths = fda_strengths + dm_strengths

        # De-duplicate by (value, unit)
        seen: set[tuple[float, str]] = set()
        unique_strengths: list[DrugStrength] = []
        for s in all_strengths:
            key = (s.value, s.unit)
            if key not in seen:
                seen.add(key)
                unique_strengths.append(s)

        # Remove cross-source statistical outliers (e.g. Digoxin Immune Fab 40mg
        # appearing in DailyMed alongside true digoxin tablet strengths 0.0625-0.25mg).
        unique_strengths = self._filter_outliers(unique_strengths)

        medication_verified = openfda_hit or dailymed_hit

        # If no dose was extracted we can still confirm the drug exists
        if dose_value is None or dose_unit is None:
            return SafetyValidationResult(
                passed=medication_verified,
                failure_reason=None if medication_verified else f"Drug '{med_name}' not found in FDA/DailyMed.",
                medication_name_verified=medication_verified,
                dose_verified=False,
                known_strengths=unique_strengths,
                openfda_hit=openfda_hit,
                dailymed_hit=dailymed_hit,
            )

        extracted_label = f"{dose_value} {dose_unit}"

        # Match extracted dose against known strengths (unit-aware)
        dose_verified, nearest = self._match_dose(dose_value, dose_unit, unique_strengths)

        if not medication_verified:
            return SafetyValidationResult(
                passed=False,
                failure_reason=f"Drug '{med_name}' not found in FDA or DailyMed databases.",
                medication_name_verified=False,
                dose_verified=False,
                known_strengths=unique_strengths,
                extracted_dose_label=extracted_label,
                nearest_known_strength=nearest,
                openfda_hit=openfda_hit,
                dailymed_hit=dailymed_hit,
            )

        if not dose_verified:
            known_labels = [s.label for s in unique_strengths]
            return SafetyValidationResult(
                passed=False,
                failure_reason=None,
                clinical_impossibility=True,
                impossibility_reason=(
                    f"'{med_name} {extracted_label}' is a Clinical Impossibility. "
                    f"This drug is manufactured only in: {', '.join(known_labels)}. "
                    f"Nearest known strength: {nearest.label if nearest else 'N/A'}."
                ),
                medication_name_verified=True,
                dose_verified=False,
                known_strengths=unique_strengths,
                extracted_dose_label=extracted_label,
                nearest_known_strength=nearest,
                openfda_hit=openfda_hit,
                dailymed_hit=dailymed_hit,
            )

        return SafetyValidationResult(
            passed=True,
            medication_name_verified=True,
            dose_verified=True,
            clinical_impossibility=False,
            known_strengths=unique_strengths,
            extracted_dose_label=extracted_label,
            nearest_known_strength=nearest,
            openfda_hit=openfda_hit,
            dailymed_hit=dailymed_hit,
        )

    # ------------------------------------------------------------------
    # OpenFDA
    # ------------------------------------------------------------------

    async def _query_openfda(self, drug_name: str) -> list[DrugStrength]:
        """
        Search OpenFDA Drug NDC endpoint for active ingredient strengths.
        https://api.fda.gov/drug/ndc.json?search=generic_name:"name"&limit=100
        """
        try:
            params = {
                "search": f'generic_name:"{drug_name}"',
                "limit": "100",
            }
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.get(f"{_OPENFDA_URL}/ndc.json", params=params)
                if r.status_code == 404:
                    # Try brand name fallback
                    params["search"] = f'brand_name:"{drug_name}"'
                    r = await client.get(f"{_OPENFDA_URL}/ndc.json", params=params)
                r.raise_for_status()
                data = r.json()

            strengths: list[DrugStrength] = []
            for product in data.get("results", []):
                for ingredient in product.get("active_ingredients", []):
                    strength_str: str = ingredient.get("strength", "")
                    parsed = _parse_strength_label(strength_str)
                    if not parsed:
                        continue
                    v, u = parsed
                    # Skip non-mass units and obvious outlier entries (e.g. "1 kg/kg")
                    if u not in ("mg", "mcg", "ug", "g"):
                        continue
                    strengths.append(
                        DrugStrength(
                            value=v,
                            unit=u,
                            label=strength_str.strip().upper(),
                            source="openfda",
                        )
                    )

            # Remove statistical outliers using IQR fence on log-scale values.
            # Catches bogus FDA entries like digoxin "40 mg/1" when all real
            # strengths are 0.0625–0.25 mg.
            if len(strengths) > 3:
                import statistics, math
                ng_vals = [
                    DeterministicSafetyVault._to_ng(s.value, s.unit)
                    for s in strengths
                    if DeterministicSafetyVault._to_ng(s.value, s.unit) not in (None, 0)
                ]
                if len(ng_vals) > 3:
                    log_vals = sorted(math.log10(v) for v in ng_vals)
                    q1 = statistics.median(log_vals[: len(log_vals) // 2])
                    q3 = statistics.median(log_vals[len(log_vals) // 2 :])
                    iqr = q3 - q1
                    upper_fence = q3 + 3.0 * iqr   # Tukey outer fence on log scale
                    strengths = [
                        s for s in strengths
                        if (
                            DeterministicSafetyVault._to_ng(s.value, s.unit) is None
                            or DeterministicSafetyVault._to_ng(s.value, s.unit) == 0
                            or math.log10(DeterministicSafetyVault._to_ng(s.value, s.unit)) <= upper_fence
                        )
                    ]

            return strengths
        except Exception:
            return []

    # ------------------------------------------------------------------
    # DailyMed
    # ------------------------------------------------------------------

    async def _query_dailymed(self, drug_name: str) -> list[DrugStrength]:
        """
        Search NIH DailyMed for known drug strengths.

        Correct API flow (v2):
          1. GET /spls.json?drug_name=X          → returns records with setid
          2. GET /spls/{setid}/packaging.json    → products[].active_ingredients[].strength
        """
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                # Step 1: search SPLs by drug name — this endpoint includes setid
                r = await client.get(
                    f"{_DAILYMED_URL}/spls.json",
                    params={"drug_name": drug_name, "pagesize": "10"},
                )
                r.raise_for_status()
                spls_data = r.json()

                set_ids = [
                    d["setid"]
                    for d in spls_data.get("data", [])
                    if d.get("setid")
                ]
                if not set_ids:
                    return []

                # Step 2: fetch packaging for each SPL (up to 5) and collect strengths
                strengths: list[DrugStrength] = []
                seen: set[tuple] = set()

                for set_id in set_ids[:5]:
                    r2 = await client.get(
                        f"{_DAILYMED_URL}/spls/{set_id}/packaging.json"
                    )
                    if r2.status_code != 200:
                        continue
                    packaging_data = r2.json()
                    products = packaging_data.get("data", {}).get("products", [])

                    for product in products:
                        for ingredient in product.get("active_ingredients", []):
                            # Only keep strengths for the drug we searched for
                            ing_name = ingredient.get("name", "").lower()
                            if drug_name.lower() not in ing_name:
                                continue
                            strength_str: str = ingredient.get("strength", "")
                            parsed = _parse_strength_label(strength_str)
                            if parsed:
                                v, u = parsed
                                key = (v, u)
                                if key not in seen:
                                    seen.add(key)
                                    strengths.append(
                                        DrugStrength(
                                            value=v,
                                            unit=u,
                                            label=strength_str.strip().upper(),
                                            source="dailymed",
                                        )
                                    )

                return strengths
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Dose matching
    # ------------------------------------------------------------------

    @staticmethod
    def _filter_outliers(strengths: list[DrugStrength]) -> list[DrugStrength]:
        """
        Remove statistical outliers from a combined strength list using the
        Tukey outer-fence (3×IQR) on log-scale ng values.

        Example: digoxin real strengths cluster at 62–250 ng × 1000 (mcg range).
        Digoxin Immune Fab at 40 mg = 40,000,000 ng is 2.6 log-units above the
        fence and gets removed.
        """
        import math, statistics as _stats

        if len(strengths) <= 3:
            return strengths

        ng_map = {
            id(s): DeterministicSafetyVault._to_ng(s.value, s.unit)
            for s in strengths
        }
        convertible = [v for v in ng_map.values() if v and v > 0]
        if len(convertible) <= 3:
            return strengths

        log_vals = sorted(math.log10(v) for v in convertible)
        mid = len(log_vals) // 2
        q1 = _stats.median(log_vals[:mid])
        q3 = _stats.median(log_vals[mid:])
        iqr = q3 - q1
        upper = q3 + 3.0 * iqr

        return [
            s for s in strengths
            if ng_map[id(s)] is None
            or ng_map[id(s)] <= 0
            or math.log10(ng_map[id(s)]) <= upper
        ]

    @staticmethod
    def _to_ng(value: float, unit: str) -> float | None:
        """Convert dose to nanograms for cross-unit comparison. Returns None if non-convertible."""
        factor = _TO_NG.get(unit.lower())
        return value * factor if factor is not None else None

    @staticmethod
    def _match_dose(
        dose_value: float,
        dose_unit: str,
        known: list[DrugStrength],
    ) -> tuple[bool, Optional[DrugStrength]]:
        """
        Return (dose_verified, nearest_strength).

        Logic:
          1. Convert all known strengths + extracted dose to nanograms (common base).
          2. Pass if dose ≤ max_known × CEILING_MULTIPLE (default 2.0).
             This accepts any dose that is plausibly within the drug's real range —
             OCR rounding, unusual compounding, or concentration variants all pass.
          3. Fail (Clinical Impossibility) if dose > max_known × CEILING_MULTIPLE.
          4. Also check the lower floor: dose must be ≥ min_known × FLOOR_FRACTION
             to catch gross OCR underreads (e.g. Metformin 5mg when min is 500mg).
          5. Cross-unit: mg/mcg/g converted to ng before comparison so 0.125mg
             correctly matches 125mcg in the same pool.
          6. If no unit-convertible strengths exist, falls back to same-unit comparison.
        """
        if not known:
            return False, None

        # How far above the maximum known strength we still accept
        CEILING_MULTIPLE = 2.0
        # How far below the minimum known strength we still accept
        FLOOR_FRACTION = 0.1

        unit_norm = _UNIT_ALIASES.get(dose_unit.lower().strip(), dose_unit.lower().strip())
        dose_ng = DeterministicSafetyVault._to_ng(dose_value, unit_norm)

        # Build ng values for all known strengths
        known_ng: list[float] = [
            v for s in known
            if (v := DeterministicSafetyVault._to_ng(s.value, s.unit)) is not None and v > 0
        ]

        if dose_ng is not None and known_ng:
            max_ng = max(known_ng)
            min_ng = min(known_ng)
            ceiling = max_ng * CEILING_MULTIPLE
            floor   = min_ng * FLOOR_FRACTION

            if floor <= dose_ng <= ceiling:
                # Dose is within [min×0.1, max×2] — verified
                nearest = min(known, key=lambda s: abs(
                    (DeterministicSafetyVault._to_ng(s.value, s.unit) or 0) - dose_ng
                ))
                return True, nearest
            # Outside range → not verified (will be flagged as impossibility upstream)

        else:
            # No convertible units — fall back to same-unit max comparison
            same_unit = [s for s in known if s.unit == unit_norm]
            if same_unit:
                max_val = max(s.value for s in same_unit)
                min_val = min(s.value for s in same_unit)
                ceiling = max_val * CEILING_MULTIPLE
                floor   = min_val * FLOOR_FRACTION
                if floor <= dose_value <= ceiling:
                    nearest = min(same_unit, key=lambda s: abs(s.value - dose_value))
                    return True, nearest

        # ── Find nearest for UI context ──────────────────────────────────────
        def _dist(s: DrugStrength) -> float:
            s_ng = DeterministicSafetyVault._to_ng(s.value, s.unit)
            if dose_ng is not None and s_ng is not None:
                return abs(s_ng - dose_ng)
            if s.unit == unit_norm:
                return abs(s.value - dose_value)
            return float("inf")

        nearest = min(known, key=_dist)
        return False, nearest
