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

// Canonical forms for common medically-equivalent expressions to avoid false positives.
function canonicalizeFieldValue(value: string | null, field: keyof MedicationFields): string | null {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    // Map equivalent frequency phrases to a canonical form
    const freqMap: [RegExp, string][] = [
      [/\b(once\s*(daily|a\s*day|per\s*day)|one\s*time\s*(daily|a\s*day)|1\s*time\s*(daily|a\s*day)|1x\s*(daily|a\s*day)?|every\s*24\s*hours?|qd|q\.d\.)\b/i, 'once daily'],
      [/\b(twice\s*(daily|a\s*day|per\s*day)|two\s*times\s*(daily|a\s*day)|2\s*times\s*(daily|a\s*day)|2x\s*(daily|a\s*day)?|every\s*12\s*hours?|bid|b\.i\.d\.)\b/i, 'twice daily'],
      [/\b(three\s*times\s*(daily|a\s*day)|3\s*times\s*(daily|a\s*day)|3x\s*(daily|a\s*day)?|every\s*8\s*hours?|tid|t\.i\.d\.)\b/i, 'three times daily'],
      [/\b(four\s*times\s*(daily|a\s*day)|4\s*times\s*(daily|a\s*day)|4x\s*(daily|a\s*day)?|every\s*6\s*hours?|qid|q\.i\.d\.)\b/i, 'four times daily'],
    ];
    for (const [pattern, canonical] of freqMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'duration') {
    // Normalize "for 7 days" vs "7 days" → strip leading "for"
    return norm.replace(/^for\s+/, '');
  }

  if (field === 'dosage_unit') {
    // Normalize plurals and abbreviation variants
    const unitMap: [RegExp, string][] = [
      [/^tablets?$/, 'tablet'],
      [/^capsules?$/, 'capsule'],
      [/^milligrams?$/, 'mg'],
      [/^micrograms?$/, 'mcg'],
      [/^milliliters?$/, 'ml'],
    ];
    for (const [pattern, canonical] of unitMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  return norm;
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

    // Use canonical form for comparison to avoid false positives on equivalent expressions
    const canonSv = canonicalizeFieldValue(sv, field);
    const canonBv = canonicalizeFieldValue(bv, field);
    if (canonSv === canonBv) continue;

    // Numeric drift for dosage fields: only flag if the actual numbers differ
    if (field === 'dosage_amount' || field === 'max_daily_dose') {
      const numsS = extractNumbers(sv);
      const numsB = extractNumbers(bv!);
      if (numsS.length > 0 && numsB.length > 0) {
        if (numsS[0] === numsB[0]) continue; // same number, minor phrasing difference only
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

    // Negation drift: only flag if negation appears/disappears
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

    // Skip low-priority fields if values are semantically similar
    if (fieldSeverity(field) === 'low' && semanticallySimilar(sv, bv!)) continue;

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
