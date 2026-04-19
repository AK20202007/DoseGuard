import type {
  DriftIssue,
  LanguageMetadata,
  MedicationFields,
  ConfidenceScore,
  ConfidenceBreakdown,
} from '@/lib/types';

const CRITICAL_FIELDS: (keyof MedicationFields)[] = [
  'medication_name',
  'dosage_amount',
  'dosage_unit',
  'frequency',
];

export function scoreConfidence(
  driftIssues: DriftIssue[],
  riskScore: number,
  langMeta: LanguageMetadata,
  sourceFields: MedicationFields,
  backFields: MedicationFields,
): ConfidenceScore {
  const breakdown: ConfidenceBreakdown = {
    translation_quality: 0,
    language_tier:       0,
    field_extraction:    0,
    back_translation:    0,
  };

  // ── Translation quality (0–40): inverse of drift risk score ────────────────
  // riskScore 0 → 40 pts, riskScore 100 → 0 pts
  breakdown.translation_quality = Math.round((1 - riskScore / 100) * 40);

  // ── Language quality tier (0–25) ────────────────────────────────────────────
  if (langMeta.qualityTier === 'high')           breakdown.language_tier = 25;
  else if (langMeta.qualityTier === 'medium')    breakdown.language_tier = 14;
  else                                            breakdown.language_tier = 5;  // low-resource

  // ── Field extraction success (0–20) ─────────────────────────────────────────
  // How many critical fields were extracted in the source
  const extracted = CRITICAL_FIELDS.filter(f => sourceFields[f] !== null).length;
  breakdown.field_extraction = Math.round((extracted / CRITICAL_FIELDS.length) * 20);

  // ── Back-translation faithfulness (0–15) ─────────────────────────────────────
  // No high-severity drift on critical fields → full points
  const highDrift = driftIssues.filter(
    i => i.severity === 'high' && CRITICAL_FIELDS.includes(i.field),
  ).length;
  const medDrift = driftIssues.filter(
    i => i.severity === 'medium' && CRITICAL_FIELDS.includes(i.field),
  ).length;
  breakdown.back_translation = Math.max(0, 15 - highDrift * 7 - medDrift * 3);

  const total = Math.round(
    Math.min(100, Math.max(0,
      breakdown.translation_quality +
      breakdown.language_tier +
      breakdown.field_extraction +
      breakdown.back_translation,
    )),
  );

  let label: ConfidenceScore['label'];
  let tier:  ConfidenceScore['tier'];
  if      (total >= 85) { label = 'High';     tier = 'high'; }
  else if (total >= 70) { label = 'Good';     tier = 'good'; }
  else if (total >= 50) { label = 'Moderate'; tier = 'moderate'; }
  else if (total >= 30) { label = 'Low';      tier = 'low'; }
  else                  { label = 'Very Low'; tier = 'very_low'; }

  return { score: total, label, tier, breakdown };
}
