import type { DriftIssue, LanguageMetadata, RiskLevel, Recommendation } from '@/lib/types';

const FIELD_WEIGHTS: Record<string, number> = {
  dosage_amount: 40,
  dosage_unit: 35,
  max_daily_dose: 40,
  frequency: 40,
  warnings: 30,
  route: 20,
  duration: 15,
  interval: 10,       // low — usually duplicates frequency
  food_instruction: 8,
  conditionality: 8,
  medication_name: 6,
  patient_group: 5,
  notes: 0,           // excluded — too noisy
};

const SEVERITY_MULTIPLIERS: Record<DriftIssue['severity'], number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

export type RiskScoringResult = {
  riskScore: number;
  riskLevel: RiskLevel;
  riskExplanation: string;
  recommendation: Recommendation;
};

export function scoreRisk(
  driftIssues: DriftIssue[],
  langMeta: LanguageMetadata,
  extractionFailed: boolean,
): RiskScoringResult {
  let score = 0;
  const keyExplanations: string[] = [];

  for (const issue of driftIssues) {
    const weight = FIELD_WEIGHTS[issue.field] ?? 5;
    score += Math.round(weight * SEVERITY_MULTIPLIERS[issue.severity]);
    if (issue.severity === 'high' && keyExplanations.length < 2) {
      keyExplanations.push(issue.explanation);
    }
  }

  score = Math.min(100, score);

  let riskLevel: RiskLevel = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low';

  const escalationNotes: string[] = [];

  if (langMeta.escalatesRisk) {
    if (riskLevel === 'low') riskLevel = 'medium';
    else if (riskLevel === 'medium') riskLevel = 'high';
    escalationNotes.push(`${langMeta.code} is a low-resource language — risk level automatically escalated.`);
  }

  if (extractionFailed) {
    riskLevel = 'high';
    escalationNotes.push('Structured field extraction failed — unable to verify translation safety.');
  }

  const recommendation: Recommendation =
    riskLevel === 'low'
      ? 'safe_to_use'
      : riskLevel === 'medium'
        ? 'use_with_caution'
        : 'human_review_required';

  let riskExplanation = '';
  if (driftIssues.length === 0 && !langMeta.escalatesRisk && !extractionFailed) {
    riskExplanation = 'No semantic drift detected between source and back-translation.';
  } else {
    const highCount = driftIssues.filter(i => i.severity === 'high').length;
    const medCount = driftIssues.filter(i => i.severity === 'medium').length;
    const parts: string[] = [];
    if (highCount > 0) parts.push(`${highCount} high-severity drift issue${highCount > 1 ? 's' : ''}`);
    if (medCount > 0) parts.push(`${medCount} medium-severity issue${medCount > 1 ? 's' : ''}`);
    parts.push(...escalationNotes);
    riskExplanation = parts.join('; ');
    if (keyExplanations.length > 0) {
      riskExplanation += '. ' + keyExplanations[0];
    }
  }

  return { riskScore: score, riskLevel, riskExplanation, recommendation };
}
