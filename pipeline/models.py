from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class ExtractedPrescription(BaseModel):
    """Structured prescription data extracted by a single OCR engine."""
    engine: str
    raw_text: str = ""

    medication_name: Optional[str] = None
    dose_value: Optional[float] = None
    dose_unit: Optional[str] = None   # mg, mcg, ml, g, meq, units, iu
    frequency: Optional[str] = None  # once daily, bid, tid, qid, prn, etc.
    patient_name: Optional[str] = None
    prescriber: Optional[str] = None

    confidence: float = 0.0
    error: Optional[str] = None


class FieldConsensus(BaseModel):
    """Consensus result for one prescription field."""
    field: str
    agreed_value: Optional[str] = None
    votes: dict[str, Optional[str]] = Field(default_factory=dict)  # engine → value
    score: float = 0.0   # fraction of engines that agree
    unanimous: bool = False


class ConsensusResult(BaseModel):
    """Layer 1 output: consensus across all OCR engines."""
    passed: bool = False
    failure_reason: Optional[str] = None

    # Agreed-upon values (populated only when passed=True)
    medication_name: Optional[str] = None
    dose_value: Optional[float] = None
    dose_unit: Optional[str] = None
    frequency: Optional[str] = None
    patient_name: Optional[str] = None
    prescriber: Optional[str] = None

    # Per-field breakdown
    field_scores: dict[str, FieldConsensus] = Field(default_factory=dict)
    overall_score: float = 0.0  # min score across critical fields

    # Raw engine outputs for audit
    extractions: list[ExtractedPrescription] = Field(default_factory=list)


class DrugStrength(BaseModel):
    """A known strength of a drug from an authoritative database."""
    value: float
    unit: str
    label: str  # e.g. "5 MG"
    source: str  # "openfda" | "dailymed"


class SafetyValidationResult(BaseModel):
    """Layer 2 output: deterministic dose/drug verification."""
    passed: bool = False
    failure_reason: Optional[str] = None

    medication_name_verified: bool = False
    dose_verified: bool = False
    clinical_impossibility: bool = False
    impossibility_reason: Optional[str] = None

    known_strengths: list[DrugStrength] = Field(default_factory=list)
    extracted_dose_label: Optional[str] = None   # e.g. "200 mg"
    nearest_known_strength: Optional[DrugStrength] = None

    openfda_hit: bool = False
    dailymed_hit: bool = False


class PipelineResult(BaseModel):
    """Combined result from both Layer 1 and Layer 2."""
    status: str  # "passed" | "recapture_required" | "clinical_impossibility" | "error"
    message: str

    layer1: Optional[ConsensusResult] = None
    layer2: Optional[SafetyValidationResult] = None

    # Final verified prescription (populated only when status == "passed")
    verified_medication_name: Optional[str] = None
    verified_dose: Optional[str] = None
    verified_frequency: Optional[str] = None
