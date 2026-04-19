import type { MedicationFields, DriftIssue } from '@/lib/types';

const HIGH_WEIGHT_FIELDS: Array<keyof MedicationFields> = [
  'dosage_amount',
  'dosage_unit',
  'frequency',
  'interval',
  'max_daily_dose',
];
const MEDIUM_HIGH_FIELDS: Array<keyof MedicationFields> = ['route'];
const MEDIUM_FIELDS: Array<keyof MedicationFields> = ['duration'];

function normalizeForComparison(value: string | null): string | null {
  if (value === null) return null;
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function hasNegation(text: string): boolean {
  return /\b(not|no|never|avoid|do not|don't|stop|contraindicated|prohibited)\b/i.test(text);
}

function semanticallySimilar(a: string, b: string): boolean {
  const normA = normalizeForComparison(a) ?? '';
  const normB = normalizeForComparison(b) ?? '';
  if (normA === normB) return true;
  const wordsA = normA.split(' ').filter(w => w.length > 3);
  if (wordsA.length === 0) return normA === normB;
  const matchCount = wordsA.filter(w => normB.includes(w)).length;
  return matchCount / wordsA.length >= 0.6;
}

function fieldSeverity(field: keyof MedicationFields): DriftIssue['severity'] {
  if (HIGH_WEIGHT_FIELDS.includes(field)) return 'high';
  if (MEDIUM_HIGH_FIELDS.includes(field)) return 'medium';
  if (MEDIUM_FIELDS.includes(field)) return 'medium';
  return 'low';
}

export function analyzeDrift(
  sourceFields: MedicationFields,
  backFields: MedicationFields,
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  const scalarFields: Array<keyof MedicationFields> = [
    'medication_name',
    'dosage_amount',
    'dosage_unit',
    'frequency',
    'interval',
    'route',
    'duration',
    'max_daily_dose',
    'food_instruction',
    'patient_group',
    'conditionality',
    'notes',
  ];

  for (const field of scalarFields) {
    const sv = sourceFields[field] as string | null;
    const bv = backFields[field] as string | null;

    if (sv === null && bv === null) continue;

    if (sv !== null && bv === null) {
      issues.push({
        field,
        type: 'omitted',
        severity: fieldSeverity(field),
        sourceValue: sv,
        backValue: null,
        explanation: `"${field.replace(/_/g, ' ')}" was present in source ("${sv}") but missing from back-translation.`,
      });
      continue;
    }

    if (sv === null) continue;

    const normSv = normalizeForComparison(sv);
    const normBv = normalizeForComparison(bv);
    if (normSv === normBv) continue;

    // Numeric drift for dosage fields
    if (field === 'dosage_amount' || field === 'max_daily_dose') {
      const numsS = extractNumbers(sv);
      const numsB = extractNumbers(bv!);
      if (numsS.length > 0 && numsB.length > 0 && numsS[0] !== numsB[0]) {
        issues.push({
          field,
          type: 'value_changed',
          severity: 'high',
          sourceValue: sv,
          backValue: bv,
          explanation: `${field.replace(/_/g, ' ')} value changed from "${sv}" to "${bv}" after translation.`,
        });
        continue;
      }
    }

    // Negation drift
    const svHasNeg = hasNegation(sv);
    const bvHasNeg = hasNegation(bv!);
    if (svHasNeg !== bvHasNeg) {
      issues.push({
        field,
        type: 'negation_changed',
        severity: 'high',
        sourceValue: sv,
        backValue: bv,
        explanation: `Negation ${svHasNeg ? 'lost' : 'gained'} in "${field.replace(/_/g, ' ')}": source says "${sv}", back-translation says "${bv}".`,
      });
      continue;
    }

    issues.push({
      field,
      type: 'mismatch',
      severity: fieldSeverity(field),
      sourceValue: sv,
      backValue: bv,
      explanation: `"${field.replace(/_/g, ' ')}" differs: source has "${sv}", back-translation has "${bv}".`,
    });
  }

  // Warnings array comparison
  for (const warning of sourceFields.warnings) {
    const matchingBack = backFields.warnings.find(bw => semanticallySimilar(warning, bw));
    if (!matchingBack) {
      issues.push({
        field: 'warnings',
        type: 'omitted',
        severity: hasNegation(warning) ? 'high' : 'medium',
        sourceValue: warning,
        backValue: null,
        explanation: `Warning "${warning}" was not found in back-translation.`,
      });
    } else if (hasNegation(warning) && !hasNegation(matchingBack)) {
      issues.push({
        field: 'warnings',
        type: 'negation_changed',
        severity: 'high',
        sourceValue: warning,
        backValue: matchingBack,
        explanation: `Warning negation lost: source says "${warning}", back-translation says "${matchingBack}".`,
      });
    }
  }

  return issues;
}
