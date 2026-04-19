import type { DriftIssue, DiacriticIssue, LanguageMetadata, RiskLevel, Recommendation } from '@/lib/types';

const FIELD_WEIGHTS: Record<string, number> = {
  dosage_amount: 40,
  dosage_unit: 40,
  max_daily_dose: 40,
  frequency: 40,
  interval: 40,
  warnings: 30,
  route: 25,
  duration: 15,
  food_instruction: 10,
  conditionality: 10,
  medication_name: 8,
  patient_group: 8,
  notes: 5,
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

// Diacritic issues on safety-critical categories contribute to score.
// A missing tone mark on a numeral is as dangerous as a drift issue.
const DIACRITIC_WEIGHTS: Record<DiacriticIssue['category'], number> = {
  numeral: 30,
  frequency: 25,
  instruction: 20,
  medical: 10,
  time: 8,
};

export function scoreRisk(
  driftIssues: DriftIssue[],
  langMeta: LanguageMetadata,
  extractionFailed: boolean,
  diacriticIssues: DiacriticIssue[] = [],
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

  for (const issue of diacriticIssues) {
    const weight = DIACRITIC_WEIGHTS[issue.category] ?? 5;
    const multiplier = issue.severity === 'high' ? 1.0 : 0.5;
    score += Math.round(weight * multiplier);
    if (issue.severity === 'high' && keyExplanations.length < 2) {
      const confusable = issue.confusableWith
        ? ` (could be misread as ${issue.confusableWith} = ${issue.confusableMeaning})`
        : '';
      keyExplanations.push(
        `Missing tone marks on "${issue.bare}" (should be "${issue.canonical}" = ${issue.meaning})${confusable}.`,
      );
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
  const hasAnyIssue = driftIssues.length > 0 || diacriticIssues.length > 0 || langMeta.escalatesRisk || extractionFailed;
  if (!hasAnyIssue) {
    riskExplanation = 'No semantic drift or tonal integrity issues detected.';
  } else {
    const highDrift = driftIssues.filter(i => i.severity === 'high').length;
    const medDrift = driftIssues.filter(i => i.severity === 'medium').length;
    const highDiacritic = diacriticIssues.filter(i => i.severity === 'high').length;
    const parts: string[] = [];
    if (highDrift > 0) parts.push(`${highDrift} high-severity drift issue${highDrift > 1 ? 's' : ''}`);
    if (medDrift > 0) parts.push(`${medDrift} medium-severity drift issue${medDrift > 1 ? 's' : ''}`);
    if (highDiacritic > 0) parts.push(`${highDiacritic} missing tone mark${highDiacritic > 1 ? 's' : ''} on safety-critical word${highDiacritic > 1 ? 's' : ''}`);
    parts.push(...escalationNotes);
    riskExplanation = parts.join('; ');
    if (keyExplanations.length > 0) {
      riskExplanation += '. ' + keyExplanations[0];
    }
  }

  return { riskScore: score, riskLevel, riskExplanation, recommendation };
}
