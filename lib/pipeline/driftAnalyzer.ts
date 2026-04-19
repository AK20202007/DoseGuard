import type { MedicationFields, DriftIssue } from '@/lib/types';

const HIGH_WEIGHT_FIELDS: Array<keyof MedicationFields> = [
  'dosage_amount',
  'dosage_unit',
  'frequency',
  'max_daily_dose',
];
const MEDIUM_FIELDS: Array<keyof MedicationFields> = ['duration', 'warnings'];
const LOW_FIELDS: Array<keyof MedicationFields> = [
  'route',            // assumed oral by default; real route changes caught by mismatch path
  'interval',         // duplicates frequency for hourly dosing
  'food_instruction',
  'conditionality',
  'patient_group',
  'medication_name',
];
// 'notes' intentionally excluded — too variable to compare reliably

function normalizeForComparison(value: string | null): string | null {
  if (value === null) return null;
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalizeFieldValue(value: string | null, field: keyof MedicationFields): string | null {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    const freqMap: [RegExp, string][] = [
      // Standard daily frequencies
      [/\b(once\s*(daily|a\s*day|per\s*day|every\s*day)|one\s*time\s*(daily|a\s*day)|1\s*x?\s*(daily|a\s*day)?|qd|q\.d\.)\b/i, 'once daily'],
      [/\b(twice\s*(daily|a\s*day|per\s*day)|two\s*times\s*(daily|a\s*day)|2\s*x?\s*(daily|a\s*day)?|every\s*12\s*hours?|bid|b\.i\.d\.)\b/i, 'twice daily'],
      [/\b(three\s*times\s*(daily|a\s*day|per\s*day)|3\s*x?\s*(daily|a\s*day)?|every\s*8\s*hours?|tid|t\.i\.d\.)\b/i, 'three times daily'],
      [/\b(four\s*times\s*(daily|a\s*day|per\s*day)|4\s*x?\s*(daily|a\s*day)?|every\s*6\s*hours?|qid|q\.i\.d\.)\b/i, 'four times daily'],
      [/\b(six\s*times\s*(daily|a\s*day)|6\s*x?\s*(daily|a\s*day)?|every\s*4\s*hours?)\b/i, 'six times daily'],
      // "N times in any 24-hour period" — back-translators rephrase frequency this way
      [/\btwice\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'twice daily'],
      [/\b(three|3)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'three times daily'],
      [/\b(four|4)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'four times daily'],
      [/\bonce\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'once daily'],
      // "at most once" / "no more than once" — PRN ceiling expressions, all → 'once daily' in freq context
      [/\b(no\s*more\s*than\s*once|not\s*more\s*than\s*once|at\s*most\s*once|maximum\s*once|once\s*maximum)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*twice|not\s*more\s*than\s*twice|at\s*most\s*twice)\s*(a\s*day|daily|per\s*day)?\b/i, 'twice daily'],
      // Standalone "every 24 hours / every twenty-four hours" — placed after N-times patterns so "twice every 24h" matches twice first
      [/\bevery\s*(24|twenty[\s-]*four)\s*hours?\b/i, 'once daily'],
      // Time-of-day qualifiers — all map to once daily (timing is context, not a different frequency)
      [/\b(at\s*bedtime|before\s*bed(time)?|at\s*night|nightly|before\s*sleep|h\.s\.|^hs$)\b/i, 'once daily'],
      [/\b(in\s*the\s*morning|every\s*morning|once\s*(in\s*the\s*)?morning|each\s*morning|once\s*at\s*night|once\s*at\s*bedtime)\b/i, 'once daily'],
      // Single-dose (no recurrence) — "once" or "one time" standalone
      [/^(once|one\s*time|single\s*dose?)$/i, 'once'],
      // Interval-style expressions — canonicalize to "every N hours"
      [/\b(every\s*2\s*hours?|once\s*every\s*2\s*hours?|each\s*2\s*hours?)\b/i, 'every 2 hours'],
      [/\b(every\s*3\s*hours?|once\s*every\s*3\s*hours?)\b/i, 'every 3 hours'],
      [/\b(every\s*4\s*hours?|once\s*every\s*4\s*hours?)\b/i, 'every 4 hours'],
      [/\b(every\s*6\s*hours?|once\s*every\s*6\s*hours?)\b/i, 'every 6 hours'],
      [/\b(every\s*8\s*hours?|once\s*every\s*8\s*hours?)\b/i, 'every 8 hours'],
      [/\b(every\s*12\s*hours?|once\s*every\s*12\s*hours?)\b/i, 'every 12 hours'],
    ];
    for (const [pattern, canonical] of freqMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'max_daily_dose') {
    // Canonicalize frequency-style max expressions so "once in any 24-hour period"
    // and "once every twenty-four hours" both resolve to the same canonical form.
    const maxFreqMap: [RegExp, string][] = [
      // All "once" max-dose expressions → 'once daily' (the "not more than" is implied by the max field)
      [/\b(no\s*more\s*than\s*once|not\s*more\s*than\s*once|at\s*most\s*once|once\s*maximum|maximum\s*once)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'once daily'],
      [/\bonce\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?|a\s*day|daily|per\s*day)\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*twice|not\s*more\s*than\s*twice|at\s*most\s*twice)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'twice daily'],
      [/\btwice\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?|a\s*day|daily|per\s*day)\b/i, 'twice daily'],
      [/\b((no|not)\s*more\s*than\s*(three|3)|at\s*most\s*(three|3))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'three times daily'],
      [/\b((no|not)\s*more\s*than\s*(four|4)|at\s*most\s*(four|4))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'four times daily'],
    ];
    for (const [pattern, canonical] of maxFreqMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'conditionality') {
    // Semicolon-joined values (multi-instruction extractions) — canonicalize each segment,
    // return first meaningful canonical found
    if (norm.includes(';')) {
      const segments = norm.split(';').map(s => s.trim());
      for (const seg of segments) {
        const c = canonicalizeFieldValue(seg, 'conditionality');
        if (c === 'as needed' || c === 'unless directed otherwise') return c;
      }
    }
    const condMap: [RegExp, string][] = [
      [/\b(as\s*needed|when\s*needed|if\s*needed|prn|p\.r\.n\.|as\s*required|when\s*necessary|if\s*necessary)\b/i, 'as needed'],
      [/\b(when\s*(you\s*)?need\s*it|when\s*pain\s*(is\s*)?(present|occurs?)|for\s*pain\s*relief|whenever\s*(you\s*)?feel\s*pain|when\s*required\s*for\s*pain)\b/i, 'as needed'],
      [/\b(unless\s*directed|unless\s*told|unless\s*instructed)\b/i, 'unless directed otherwise'],
    ];
    for (const [pattern, canonical] of condMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'food_instruction') {
    const foodMap: [RegExp, string][] = [
      [/\b(with\s*food|with\s*meal|with\s*meals|after\s*food|after\s*eating|after\s*meal)\b/i, 'with food'],
      [/\b(without\s*food|on\s*an?\s*empty\s*stomach|before\s*food|before\s*eating|before\s*meal|before\s*breakfast)\b/i, 'on empty stomach'],
      [/\b(with\s*(or\s*without|without\s*or\s*with)\s*food)\b/i, 'with or without food'],
      [/\b(with\s*(a\s*)?(full\s*)?(glass|cup)\s*(of\s*)?water)\b/i, 'with water'],
    ];
    for (const [pattern, canonical] of foodMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'duration') {
    return norm.replace(/^for\s+/, '').replace(/\bdays?\b/, 'day').replace(/\bweeks?\b/, 'week');
  }

  if (field === 'dosage_unit') {
    const unitMap: [RegExp, string][] = [
      [/^milligrams?$/, 'mg'],
      [/^micrograms?$/, 'mcg'],
      [/^milliliters?$/, 'ml'],
      [/^grams?$/, 'g'],
      [/^international\s*units?$/, 'iu'],
      [/^tablets?$/, 'mg'],   // if extractor still returns tablet, treat as equivalent to mg context
      [/^capsules?$/, 'mg'],
    ];
    for (const [pattern, canonical] of unitMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'dosage_amount') {
    const numWords: Record<string, string> = {
      one: '1', two: '2', three: '3', four: '4', five: '5',
      six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    };
    for (const [word, digit] of Object.entries(numWords)) {
      if (norm === word) return digit;
    }
  }

  if (field === 'route') {
    const routeMap: [RegExp, string][] = [
      [/\b(by\s*mouth|oral(ly)?|per\s*os|p\.o\.)\b/i, 'by mouth'],
      [/\b(subcut(aneous(ly)?)?|s\.c\.|subcutaneously)\b/i, 'subcutaneous'],
      [/\b(intravenous(ly)?|i\.v\.|iv\s*infusion)\b/i, 'intravenous'],
      [/\b(intramuscular(ly)?|i\.m\.)\b/i, 'intramuscular'],
      [/\b(topical(ly)?|applied\s*to\s*skin|on\s*the\s*skin)\b/i, 'topical'],
      [/\b(sublingual(ly)?|under\s*the\s*tongue)\b/i, 'sublingual'],
      [/\b(rectal(ly)?|per\s*rectum|suppository)\b/i, 'rectal'],
    ];
    for (const [pattern, canonical] of routeMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  return norm;
}

function extractNumbers(text: string): number[] {
  const stripped = text.replace(/\b24[\s-]*hours?\b/gi, '');
  const matches = stripped.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

// Normalize a dosage string to mg for unit-aware comparison.
// Returns null if no convertible unit found.
function normalizeDosageMg(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|microgram|milligram|gram)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'g' || unit === 'gram') return num * 1000;
  if (unit === 'mg' || unit === 'milligram') return num;
  if (unit === 'mcg' || unit === 'microgram') return num / 1000;
  return null;
}

function hasNegation(text: string): boolean {
  return /\b(not|no|never|avoid|do not|don't|stop|contraindicated|prohibited)\b/i.test(text);
}

function semanticallySimilar(a: string, b: string): boolean {
  const normA = normalizeForComparison(a) ?? '';
  const normB = normalizeForComparison(b) ?? '';
  if (normA === normB) return true;
  const wordsA = normA.split(' ').filter(w => w.length > 3);
  const wordsB = normB.split(' ').filter(w => w.length > 3);
  if (wordsA.length === 0 || wordsB.length === 0) return normA === normB;
  // Use the shorter set as the query — handles back-translations that condense long warnings
  const [shorter, longerText] = wordsA.length <= wordsB.length ? [wordsA, normB] : [wordsB, normA];
  const matchCount = shorter.filter(w => longerText.includes(w)).length;
  return matchCount / shorter.length >= 0.6;
}

// Strip negation markers to compare the substance of a warning (e.g. "avoid X" ≈ "do not use X")
function warningContentSimilar(a: string, b: string): boolean {
  const strip = (s: string) =>
    (normalizeForComparison(s) ?? '')
      .replace(/\b(avoid|do not|don t|not|never|no)\b/g, '')
      .replace(/\s+/g, ' ').trim();
  return semanticallySimilar(strip(a), strip(b));
}

function fieldSeverity(field: keyof MedicationFields): DriftIssue['severity'] {
  if (HIGH_WEIGHT_FIELDS.includes(field)) return 'high';
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
    // 'notes' excluded — too noisy
  ];

  for (const field of scalarFields) {
    const sv = sourceFields[field] as string | null;
    const bv = backFields[field] as string | null;

    if (sv === null && bv === null) continue;

    // If interval is missing from back but frequency covers the same info, skip
    if (field === 'interval' && bv === null && sourceFields.frequency !== null) {
      const canonInterval = canonicalizeFieldValue(sv, 'interval');
      const canonFreq = canonicalizeFieldValue(sourceFields.frequency, 'frequency');
      if (canonInterval === canonFreq) continue;
      // Also check back frequency covers it
      const canonBackFreq = canonicalizeFieldValue(backFields.frequency, 'frequency');
      if (canonBackFreq === canonInterval) continue;
    }

    if (sv !== null && bv === null) {
      // Don't flag omissions for low-priority fields
      if (fieldSeverity(field) === 'low') continue;

      // max_daily_dose omission: skip if it's derivable from dosage_amount × back-frequency
      // (extractor sometimes computes max from dose×1 even when no explicit cap is stated)
      if (field === 'max_daily_dose') {
        const numsInSv = extractNumbers(sv);
        const dosageNums = extractNumbers((sourceFields.dosage_amount as string | null) ?? '');
        // If the only number in sv is the dosage_amount itself, it's a derived cap, not explicit
        if (
          numsInSv.length > 0 &&
          dosageNums.length > 0 &&
          numsInSv[0] === dosageNums[0] &&
          numsInSv.length === 1
        ) continue;
        // Also skip if back-frequency already captures the same max via canonicalization
        const canonSvMax = canonicalizeFieldValue(sv, 'max_daily_dose');
        const canonBackFreq = canonicalizeFieldValue((backFields.frequency as string | null) ?? '', 'frequency');
        if (canonSvMax && canonBackFreq && canonSvMax === canonBackFreq) continue;
      }

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

    const canonSv = canonicalizeFieldValue(sv, field);
    const canonBv = canonicalizeFieldValue(bv, field);
    if (canonSv === canonBv) continue;

    // Numeric drift: only flag if actual numbers differ
    if (field === 'dosage_amount' || field === 'max_daily_dose') {
      // Unit-aware comparison: 4g = 4000mg, etc.
      const mgS = normalizeDosageMg(sv);
      const mgB = normalizeDosageMg(bv!);
      if (mgS !== null && mgB !== null) {
        if (Math.abs(mgS - mgB) < 0.001) continue; // same after unit conversion
        // Different amounts even after unit conversion — real drift
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
      const numsS = extractNumbers(sv);
      const numsB = extractNumbers(bv!);
      if (numsS.length > 0 && numsB.length > 0 && numsS[0] === numsB[0]) continue;
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
      if (numsS.length > 0 && numsB.length === 0) continue;
      if (numsS.length === 0 && numsB.length === 0) continue;
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

    // Low-priority fields: skip if semantically similar
    if (fieldSeverity(field) === 'low' && semanticallySimilar(sv, bv!)) continue;

    // Medium fields: only flag if not semantically similar
    if (fieldSeverity(field) === 'medium' && semanticallySimilar(sv, bv!)) continue;

    issues.push({
      field,
      type: 'mismatch',
      severity: fieldSeverity(field),
      sourceValue: sv,
      backValue: bv,
      explanation: `"${field.replace(/_/g, ' ')}" differs: source has "${sv}", back-translation has "${bv}".`,
    });
  }

  // Warnings comparison
  for (const warning of sourceFields.warnings) {
    const matchingBack = backFields.warnings.find(
      bw => semanticallySimilar(warning, bw) || warningContentSimilar(warning, bw),
    );
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
