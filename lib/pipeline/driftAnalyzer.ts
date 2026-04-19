import type { MedicationFields, DriftIssue } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildWarningCheckPrompt, buildFieldCheckPrompt, buildSentenceEquivalencePrompt } from '@/lib/prompts/warningCheck';
import type Anthropic from '@anthropic-ai/sdk';

const HIGH_WEIGHT_FIELDS: Array<keyof MedicationFields> = [
  'dosage_amount',
  'dosage_unit',
  'frequency',
  'interval',
  'max_daily_dose',
];
const MEDIUM_HIGH_FIELDS: Array<keyof MedicationFields> = ['route'];
const MEDIUM_FIELDS: Array<keyof MedicationFields> = ['duration'];

// Maps spelled-out number words to their digit equivalents so that
// "take two tablets" and "take 2 tablets" are treated as identical.
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  once: 1, twice: 2,
};

function normalizeNumbers(text: string): string {
  // First pass: compound numbers like "twenty-four" or "twenty four" → "24"
  let result = text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens, ones) => String((NUMBER_WORDS[tens.toLowerCase()] ?? 0) + (NUMBER_WORDS[ones.toLowerCase()] ?? 0)),
  );
  // Second pass: single number words → digits
  result = result.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|once|twice)\b/gi,
    m => String(NUMBER_WORDS[m.toLowerCase()] ?? m),
  );
  return result;
}

function normalizeForComparison(value: string | null): string | null {
  if (value === null) return null;
  return normalizeNumbers(
    value
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function applyMap(norm: string, map: [RegExp, string][]): string | null {
  for (const [pattern, canonical] of map) {
    if (pattern.test(norm)) return canonical;
  }
  return null;
}

// Canonical forms for common medically-equivalent expressions to avoid false positives.
// NOTE: normalizeNumbers runs before this, so word-form numbers are already digits.
// "twice daily" → normalizeForComparison → "2 daily"; patterns must match digit forms.
function canonicalizeFieldValue(value: string | null, field: keyof MedicationFields): string | null {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    // Step 1: collapse all "per day / a day / each day / every day" synonyms → "daily"
    // This makes "twice a day" and "twice daily" identical before any pattern matching.
    let f = norm
      .replace(/\bper\s+day\b/gi, 'daily')
      .replace(/\ba\s+day\b/gi, 'daily')
      .replace(/\beach\s+day\b/gi, 'daily')
      .replace(/\bevery\s+day\b/gi, 'daily');

    // Step 2: handle clinical abbreviations and interval forms
    if (/\b(qd|q\.?d\.?|every\s*24\s*hours?)\b/i.test(f)) return 'once daily';
    if (/\b(bid|b\.?i\.?d\.?|every\s*12\s*hours?)\b/i.test(f)) return 'twice daily';
    if (/\b(tid|t\.?i\.?d\.?|every\s*8\s*hours?)\b/i.test(f)) return 'three times daily';
    if (/\b(qid|q\.?i\.?d\.?|every\s*6\s*hours?)\b/i.test(f)) return 'four times daily';

    // Step 3: extract leading digit + "daily" → canonical label
    // Handles: "2 daily", "2 times daily", "2x daily", "daily" (no prefix = once)
    const m = f.match(/\b(\d+)\s*(?:x|times?)?\s*daily\b/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n === 1) return 'once daily';
      if (n === 2) return 'twice daily';
      if (n === 3) return 'three times daily';
      if (n === 4) return 'four times daily';
      return `${n} times daily`;
    }
    if (/\bdaily\b/i.test(f)) return 'once daily';

    return f;
  }

  if (field === 'route') {
    const routeMap: [RegExp, string][] = [
      [/\b(orally?|by\s*mouth|oral|swallow(?:ed)?|by\s*oral|p\.?o\.?)\b/i, 'by mouth'],
      [/\b(topically?|applied?\s*to\s*(the\s*)?skin|on\s*(the\s*)?skin|externally)\b/i, 'topical'],
      [/\b(inhaled?|by\s*inhalation|via\s*inhalation)\b/i, 'inhaled'],
      [/\b(sublingually?|under\s*(the\s*)?tongue|sublingual)\b/i, 'sublingual'],
    ];
    const hit = applyMap(norm, routeMap);
    if (hit) return hit;
  }

  if (field === 'food_instruction') {
    const foodMap: [RegExp, string][] = [
      [/\b(with\s*(a\s*)?meals?|with\s*food|after\s*eating|with\s*eating|with\s*your\s*meals?)\b/i, 'with food'],
      [/\b(without\s*food|on\s*an?\s*empty\s*stomach|before\s*eating|fasting)\b/i, 'on empty stomach'],
      [/\b(with\s*(a\s*(full\s*)?glass\s*of\s*)?water)\b/i, 'with water'],
    ];
    const hit = applyMap(norm, foodMap);
    if (hit) return hit;
  }

  if (field === 'duration') {
    let d = norm.replace(/^for\s+/, '');
    // Normalize week and month expressions to days so "1 week" = "7 days"
    d = d.replace(/\b7\s*days?\b/i, '7 days');
    d = d.replace(/\b(1\s*week|a\s*week)\b/i, '7 days');
    d = d.replace(/\b14\s*days?\b/i, '14 days');
    d = d.replace(/\b2\s*weeks?\b/i, '14 days');
    d = d.replace(/\b30\s*days?\b/i, '30 days');
    d = d.replace(/\b(1\s*month|a\s*month)\b/i, '30 days');
    return d;
  }

  if (field === 'dosage_unit') {
    const unitMap: [RegExp, string][] = [
      [/^tablets?$/, 'tablet'],
      [/^capsules?$/, 'capsule'],
      [/^milligrams?$/, 'mg'],
      [/^micrograms?$/, 'mcg'],
      [/^milliliters?$/, 'ml'],
    ];
    const hit = applyMap(norm, unitMap);
    if (hit) return hit;
  }

  return norm;
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function hasNegation(text: string): boolean {
  return /\b(not|no|nothing|never|avoid|do not|don't|stop|contraindicated|prohibited|npo|nil\s+by\s+mouth|nothing\s+by\s+mouth)\b/i.test(text);
}

// Common medical phrasing synonyms. Applied before semantic comparison so
// "do not drink alcohol" and "avoid alcohol" normalise to the same string,
// and "go to the doctor" / "seek medical help" are treated as equivalent.
const MEDICAL_SYNONYMS: [RegExp, string][] = [
  // Avoidance — "do not drink/consume X" → "avoid X"
  [/\bdo\s+not\s+(drink|consume|use|take)\b/gi, 'avoid'],
  [/\bdon'?t\s+(drink|consume|use|take)\b/gi, 'avoid'],
  [/\babstain\s+from\b/gi, 'avoid'],
  // Seek medical care
  [/\bgo\s+to\s+(?:a\s+|the\s+)?(?:doctor|hospital|physician|emergency|clinic)\b/gi, 'seek medical help'],
  [/\bvisit\s+(?:a\s+|the\s+)?(?:doctor|physician|hospital|clinic)\b/gi, 'seek medical help'],
  [/\bcall\s+(?:a\s+|the\s+|your\s+)?(?:doctor|physician|911|emergency)\b/gi, 'seek medical help'],
  [/\bcontact\s+(?:a\s+|the\s+|your\s+)?(?:doctor|physician|healthcare|medical)\b/gi, 'seek medical help'],
  [/\bseek\s+(?:immediate\s+)?(?:medical\s+)?(?:attention|care|assistance)\b/gi, 'seek medical help'],
  // Symptom / observation words
  [/\babnormal\b/gi, 'unusual'],
  [/\bnotice\b/gi, 'experience'],
  [/\boccurs?\b/gi, 'happens'],
  // Urgency
  [/\bright\s+away\b/gi, 'immediately'],
  [/\bat\s+once\b/gi, 'immediately'],
  [/\bstraight\s+away\b/gi, 'immediately'],
  [/\bpromptly\b/gi, 'immediately'],
];

function applySynonyms(text: string): string {
  let result = text;
  for (const [pattern, replacement] of MEDICAL_SYNONYMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Strip common English suffixes so "doses"/"dose", "tablets"/"tablet",
// "occurs"/"occur" all match. Only applied to words long enough that
// stripping won't produce nonsense (e.g. "does" → "doe").
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('tion')) return word.slice(0, -3); // "damage" ≠ "damages" but "administration" → "administrat" still unique
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ies')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function semanticallySimilar(a: string, b: string): boolean {
  // Apply synonym normalisation first so "do not drink" → "avoid",
  // "go to the doctor" → "seek medical help", etc.
  const normA = applySynonyms(normalizeForComparison(a) ?? '');
  const normB = applySynonyms(normalizeForComparison(b) ?? '');
  if (normA === normB) return true;

  const stemsB = new Set(normB.split(' ').map(stem));

  // Filter out short connective words (≤4 chars) to keep only content words.
  const wordsA = normA.split(' ').filter(w => w.length > 4);
  if (wordsA.length === 0) return normA === normB;

  const matchCount = wordsA.filter(w => stemsB.has(stem(w)) || normB.includes(w)).length;

  // Shorter phrases need fewer overlapping words to be considered equivalent.
  // A 2-word phrase sharing 1 key concept (e.g. "avoid alcohol") is a clear match.
  const threshold = wordsA.length <= 2 ? 0.4 : wordsA.length <= 4 ? 0.5 : 0.6;
  return matchCount / wordsA.length >= threshold;
}

async function callHaikuCheck(
  warning: string,
  backAllText: string,
  client: Anthropic,
): Promise<boolean> {
  try {
    const { system, user } = buildWarningCheckPrompt(warning, backAllText);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return text.toUpperCase().startsWith('YES');
  } catch {
    return false;
  }
}

async function callHaikuFieldCheck(
  sv: string,
  bv: string,
  client: Anthropic,
): Promise<boolean> {
  try {
    const { system, user } = buildFieldCheckPrompt(sv, bv);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return text.toUpperCase().startsWith('YES');
  } catch {
    return false;
  }
}

async function callHaikuSentenceCheck(
  sourceText: string,
  backText: string,
  client: Anthropic,
): Promise<boolean> {
  try {
    const { system, user } = buildSentenceEquivalencePrompt(sourceText, backText);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return text.toUpperCase().startsWith('YES');
  } catch {
    return false;
  }
}

async function warningSemanticMatch(
  warning: string,
  backAllText: string,
  backWarnings: string[],
  client: Anthropic,
): Promise<{ matchingBack: string | null; foundAnywhere: boolean }> {
  const matchingBack = backWarnings.find(bw => semanticallySimilar(warning, bw)) ?? null;
  if (matchingBack !== null) return { matchingBack, foundAnywhere: true };
  if (semanticallySimilar(warning, backAllText)) return { matchingBack: null, foundAnywhere: true };
  const foundByAI = await callHaikuCheck(warning, backAllText, client);
  return { matchingBack: null, foundAnywhere: foundByAI };
}

function fieldSeverity(field: keyof MedicationFields): DriftIssue['severity'] {
  if (HIGH_WEIGHT_FIELDS.includes(field)) return 'high';
  if (MEDIUM_HIGH_FIELDS.includes(field)) return 'medium';
  if (MEDIUM_FIELDS.includes(field)) return 'medium';
  return 'low';
}

export async function analyzeDrift(
  sourceFields: MedicationFields,
  backFields: MedicationFields,
  sourceText?: string,
  backText?: string,
): Promise<DriftIssue[]> {
  const issues: DriftIssue[] = [];
  const client = getClient();

  // Full corpus of all back-translation text — used as fallback when a field
  // is present in the source but the extractor filed its content under a
  // different field in the back-translation.
  const backAllTextFull = [
    backFields.medication_name,
    backFields.dosage_amount,
    backFields.dosage_unit,
    backFields.frequency,
    backFields.interval,
    backFields.route,
    backFields.duration,
    backFields.max_daily_dose,
    backFields.food_instruction,
    backFields.patient_group,
    backFields.conditionality,
    backFields.notes,
    ...backFields.warnings,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ');

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
      // Before flagging as omitted, check whether the content appears anywhere
      // in the back-translation (extractor may have filed it under a different field).
      if (semanticallySimilar(sv, backAllTextFull)) continue;
      if (await callHaikuFieldCheck(sv, backAllTextFull, client)) continue;
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

    // Skip low and medium fields if values are semantically similar.
    // High-severity fields (dosage, frequency, max dose) are never silently skipped
    // here — they must match via canonicalization or numeric equality above.
    const sev = fieldSeverity(field);
    if ((sev === 'low' || sev === 'medium') && semanticallySimilar(sv, bv!)) continue;

    if (await callHaikuFieldCheck(sv, bv!, client)) continue;

    issues.push({
      field,
      type: 'mismatch',
      severity: fieldSeverity(field),
      sourceValue: sv,
      backValue: bv,
      explanation: `"${field.replace(/_/g, ' ')}" differs: source has "${sv}", back-translation has "${bv}".`,
    });
  }

  // Warnings array comparison.
  // The back-translation extractor may file a warning under notes/conditionality
  // rather than warnings[], so we build a fallback corpus from all back-translation
  // text fields and check the warning against that if it isn't found in warnings[].
  const backAllText = [
    ...backFields.warnings,
    backFields.notes,
    backFields.conditionality,
    backFields.food_instruction,
    backFields.frequency,
    backFields.duration,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ');

  for (const warning of sourceFields.warnings) {
    const { matchingBack, foundAnywhere } = await warningSemanticMatch(
      warning,
      backAllText,
      backFields.warnings,
      client,
    );

    if (!foundAnywhere) {
      issues.push({
        field: 'warnings',
        type: 'omitted',
        severity: hasNegation(warning) ? 'high' : 'medium',
        sourceValue: warning,
        backValue: null,
        explanation: `Warning "${warning}" was not found in back-translation.`,
      });
    } else if (matchingBack && hasNegation(warning) && !hasNegation(matchingBack)) {
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

  // Primary semantic gate: always run a full-sentence Haiku check on every translation.
  // If the instructions mean the same thing overall, all field-level issues are suppressed —
  // they are phrasing differences, not clinically meaningful errors.
  // If Haiku detects a difference but field analysis found nothing specific, surface a
  // generic warning so the reviewer knows something may be off.
  if (sourceText && backText) {
    const equivalent = await callHaikuSentenceCheck(sourceText, backText, client);
    if (equivalent) return [];
    if (issues.length === 0) {
      issues.push({
        field: 'notes',
        type: 'mismatch',
        severity: 'medium',
        sourceValue: sourceText,
        backValue: backText,
        explanation: 'The re-read translation may differ in meaning from the original. Review the translation carefully before patient use.',
      });
    }
  }

  return issues;
}
