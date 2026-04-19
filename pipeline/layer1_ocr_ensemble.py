"""
Layer 1: The OCR Ensemble Council

Runs three independent OCR engines in parallel, then applies a Consensus
Voting mechanism.  Only unanimous agreement (S = 1.0) on all critical fields
(medication_name, dose_value, dose_unit) advances the prescription to Layer 2.

Consensus Score per field:
    S_field = (engines agreeing on the plurality value) / (total engines)

If any critical field scores below the threshold, status = "recapture_required".
"""
from __future__ import annotations
import asyncio
import os
from collections import Counter
from typing import Optional

from PIL import Image

from .models import (
    ConsensusResult,
    ExtractedPrescription,
    FieldConsensus,
)
from .ocr_engines import EasyOCREngine, RapidOCREngine, TesseractEngine
from .ocr_engines.base import BaseOCREngine


# Fields that MUST be unanimous for the prescription to advance
_CRITICAL_FIELDS = ("medication_name", "dose_value", "dose_unit")
# Fields scored but not blocking
_SECONDARY_FIELDS = ("frequency", "patient_name", "prescriber")


def _normalise_med_name(value: Optional[str]) -> Optional[str]:
    """Lowercase + strip so 'Lisinopril' and 'LISINOPRIL' count as equal."""
    if value is None:
        return None
    return value.strip().lower()


def _normalise_dose_value(value: Optional[float]) -> Optional[str]:
    """Represent as a canonical string to enable equality comparison."""
    if value is None:
        return None
    # 5.0 → "5", 0.5 → "0.5"
    return str(int(value)) if value == int(value) else str(value)


def _normalise_unit(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().lower()


def _normalise_generic(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().lower()


_FIELD_NORMALISERS = {
    "medication_name": _normalise_med_name,
    "dose_value": _normalise_dose_value,
    "dose_unit": _normalise_unit,
    "frequency": _normalise_generic,
    "patient_name": _normalise_generic,
    "prescriber": _normalise_generic,
}


def _score_field(
    field: str,
    extractions: list[ExtractedPrescription],
) -> FieldConsensus:
    """Compute consensus for a single field across all engine extractions."""
    normalise = _FIELD_NORMALISERS.get(field, _normalise_generic)
    votes: dict[str, Optional[str]] = {}
    for ex in extractions:
        raw = getattr(ex, field, None)
        votes[ex.engine] = normalise(raw)

    non_null_values = [v for v in votes.values() if v is not None]
    n_engines = len(extractions)

    if not non_null_values:
        # All engines returned None — treat as agreement on "unknown"
        return FieldConsensus(
            field=field,
            agreed_value=None,
            votes=votes,
            score=1.0,
            unanimous=True,
        )

    counter = Counter(non_null_values)
    plurality_value, plurality_count = counter.most_common(1)[0]
    score = plurality_count / n_engines

    return FieldConsensus(
        field=field,
        agreed_value=plurality_value,
        votes=votes,
        score=round(score, 4),
        unanimous=(score == 1.0),
    )


class OCREnsembleCouncil:
    """
    Orchestrates the three-engine OCR ensemble and applies consensus voting.

    Usage::

        council = OCREnsembleCouncil()
        result = await council.run(pil_image)
        if result.passed:
            print(result.medication_name, result.dose_value, result.dose_unit)
        else:
            print("Recapture required:", result.failure_reason)
    """

    def __init__(
        self,
        engines: Optional[list[BaseOCREngine]] = None,
        threshold: float | None = None,
    ) -> None:
        self._engines: list[BaseOCREngine] = engines or [
            EasyOCREngine(),
            TesseractEngine(),
            RapidOCREngine(),
        ]
        self._threshold = threshold or float(os.getenv("CONSENSUS_THRESHOLD", "1.0"))

    async def run(self, image: Image.Image) -> ConsensusResult:
        """Run all engines in parallel and return a ConsensusResult."""
        extractions = await self._run_engines(image)
        return self._vote(extractions)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _run_engines(
        self, image: Image.Image
    ) -> list[ExtractedPrescription]:
        tasks = [engine.extract(image) for engine in self._engines]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return list(results)

    def _vote(self, extractions: list[ExtractedPrescription]) -> ConsensusResult:
        # Filter out engines that errored
        valid = [e for e in extractions if e.error is None]
        errored = [e for e in extractions if e.error is not None]

        if len(valid) < 2:
            error_details = "; ".join(
                f"{e.engine}: {e.error}" for e in errored
            )
            return ConsensusResult(
                passed=False,
                failure_reason=(
                    f"Insufficient valid engine responses ({len(valid)}/3). "
                    f"Errors: {error_details}"
                ),
                extractions=extractions,
            )

        # Score every field
        all_fields = _CRITICAL_FIELDS + _SECONDARY_FIELDS
        field_scores: dict[str, FieldConsensus] = {}
        for field in all_fields:
            field_scores[field] = _score_field(field, valid)

        # Check critical fields
        failing_fields = [
            f for f in _CRITICAL_FIELDS
            if field_scores[f].score < self._threshold
        ]
        overall_score = min(
            field_scores[f].score for f in _CRITICAL_FIELDS
        )

        if failing_fields:
            details = "; ".join(
                f"{f}={field_scores[f].score:.2f} "
                f"(votes: {field_scores[f].votes})"
                for f in failing_fields
            )
            return ConsensusResult(
                passed=False,
                failure_reason=f"Consensus below threshold on: {details}",
                overall_score=overall_score,
                field_scores=field_scores,
                extractions=extractions,
            )

        # All critical fields unanimous — build agreed prescription
        def _agreed(field: str):
            return field_scores[field].agreed_value

        # Reconstruct typed dose_value from its normalised string
        dose_value_str = _agreed("dose_value")
        dose_value = float(dose_value_str) if dose_value_str is not None else None

        return ConsensusResult(
            passed=True,
            overall_score=overall_score,
            field_scores=field_scores,
            extractions=extractions,
            medication_name=_agreed("medication_name"),
            dose_value=dose_value,
            dose_unit=_agreed("dose_unit"),
            frequency=_agreed("frequency"),
            patient_name=_agreed("patient_name"),
            prescriber=_agreed("prescriber"),
        )
