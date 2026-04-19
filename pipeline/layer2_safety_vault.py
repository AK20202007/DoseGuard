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


def _parse_strength_label(label: str) -> tuple[float, str] | None:
    """Parse '5 MG' → (5.0, 'mg'), '0.5 MCG' → (0.5, 'mcg')."""
    m = re.match(
        r"(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|g|meq|units?|iu)",
        label.strip(),
        re.IGNORECASE,
    )
    if not m:
        return None
    value = float(m.group(1).replace(",", "."))
    unit = m.group(2).lower()
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
                    if parsed:
                        v, u = parsed
                        strengths.append(
                            DrugStrength(
                                value=v,
                                unit=u,
                                label=strength_str.strip().upper(),
                                source="openfda",
                            )
                        )
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
    def _match_dose(
        dose_value: float,
        dose_unit: str,
        known: list[DrugStrength],
    ) -> tuple[bool, Optional[DrugStrength]]:
        """
        Return (exact_match_found, nearest_strength).
        Unit normalisation: mg == mg, mcg == mcg, etc.
        """
        if not known:
            # No reference data → cannot verify → treat as unverified (not impossible)
            return False, None

        unit_norm = dose_unit.lower().strip()
        same_unit = [s for s in known if s.unit == unit_norm]
        pool = same_unit if same_unit else known  # fallback to all if unit unknown

        # Exact match
        for s in pool:
            if s.value == dose_value:
                return True, s

        # Find nearest for informational purposes
        nearest = min(pool, key=lambda s: abs(s.value - dose_value))
        return False, nearest
