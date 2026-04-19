"""
MedPipeline: Orchestrates Layer 1 → Layer 2.

Status values returned in PipelineResult.status:
  "passed"                  — Both layers passed; prescription is verified.
  "recapture_required"      — Layer 1 consensus failed; re-photograph the label.
  "clinical_impossibility"  — Layer 2 detected a dose that does not exist.
  "drug_not_found"          — Layer 2 could not find the drug in any database.
  "error"                   — Unexpected failure.
"""
from __future__ import annotations
from pathlib import Path

from PIL import Image

from .layer1_ocr_ensemble import OCREnsembleCouncil
from .layer2_safety_vault import DeterministicSafetyVault
from .models import PipelineResult


def _load_image(source: str | Path | Image.Image) -> Image.Image:
    if isinstance(source, Image.Image):
        return source
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return Image.open(path).convert("RGB")


class MedPipeline:
    """
    End-to-end medical prescription verification pipeline.

    Example::

        pipeline = MedPipeline()
        result = await pipeline.run("label.jpg")
        print(result.status, result.message)
    """

    def __init__(
        self,
        layer1: OCREnsembleCouncil | None = None,
        layer2: DeterministicSafetyVault | None = None,
    ) -> None:
        self._layer1 = layer1 or OCREnsembleCouncil()
        self._layer2 = layer2 or DeterministicSafetyVault()

    async def run(self, image_source: str | Path | Image.Image) -> PipelineResult:
        try:
            image = _load_image(image_source)
        except Exception as exc:
            return PipelineResult(
                status="error",
                message=f"Could not load image: {exc}",
            )

        # ── Layer 1 ──────────────────────────────────────────────────
        consensus = await self._layer1.run(image)

        if not consensus.passed:
            return PipelineResult(
                status="recapture_required",
                message=(
                    "RECAPTURE REQUIRED — OCR engines did not reach unanimous agreement. "
                    + (consensus.failure_reason or "")
                ),
                layer1=consensus,
            )

        # ── Layer 2 ──────────────────────────────────────────────────
        safety = await self._layer2.validate(consensus)

        if safety.clinical_impossibility:
            return PipelineResult(
                status="clinical_impossibility",
                message=f"CLINICAL IMPOSSIBILITY DETECTED — {safety.impossibility_reason}",
                layer1=consensus,
                layer2=safety,
            )

        if not safety.passed:
            return PipelineResult(
                status="drug_not_found",
                message=f"DRUG NOT VERIFIED — {safety.failure_reason}",
                layer1=consensus,
                layer2=safety,
            )

        # ── Both layers passed ────────────────────────────────────────
        dose_label = (
            f"{consensus.dose_value} {consensus.dose_unit}"
            if consensus.dose_value and consensus.dose_unit
            else "unknown dose"
        )
        return PipelineResult(
            status="passed",
            message=(
                f"VERIFIED — {consensus.medication_name} {dose_label} "
                f"({consensus.frequency or 'frequency unknown'}) "
                f"confirmed by {len(consensus.extractions)} engines and "
                f"{'OpenFDA' if safety.openfda_hit else ''}"
                f"{' + ' if safety.openfda_hit and safety.dailymed_hit else ''}"
                f"{'DailyMed' if safety.dailymed_hit else ''} database."
            ),
            layer1=consensus,
            layer2=safety,
            verified_medication_name=consensus.medication_name,
            verified_dose=dose_label,
            verified_frequency=consensus.frequency,
        )
