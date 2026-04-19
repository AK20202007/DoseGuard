// Comprehensive backtest: dosage + frequency + max_daily_dose drift detection
// Mirrors driftAnalyzer.ts logic exactly.
// Run: node scripts/test-dosage-frequency.mjs

function normalizeForComparison(value) {
  if (value === null) return null;
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNumbers(text) {
  const stripped = text.replace(/\b24[\s-]*hours?\b/gi, '');
  const matches = stripped.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function normalizeDosageMg(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|microgram|milligram|gram)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'g' || unit === 'gram') return num * 1000;
  if (unit === 'mg' || unit === 'milligram') return num;
  if (unit === 'mcg' || unit === 'microgram') return num / 1000;
  return null;
}

const HIGH_FIELDS = new Set(['dosage_amount', 'dosage_unit', 'frequency', 'max_daily_dose']);
const MEDIUM_FIELDS = new Set(['route', 'duration', 'warnings']);

function canonicalizeFieldValue(value, field) {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    const freqMap = [
      [/\b(once\s*(daily|a\s*day|per\s*day|every\s*day)|one\s*time\s*(daily|a\s*day)|1\s*x?\s*(daily|a\s*day)?|qd|q\.d\.)\b/i, 'once daily'],
      [/\b(twice\s*(daily|a\s*day|per\s*day)|two\s*times\s*(daily|a\s*day)|2\s*x?\s*(daily|a\s*day)?|every\s*12\s*hours?|bid|b\.i\.d\.)\b/i, 'twice daily'],
      [/\b(three\s*times\s*(daily|a\s*day|per\s*day)|3\s*x?\s*(daily|a\s*day)?|every\s*8\s*hours?|tid|t\.i\.d\.)\b/i, 'three times daily'],
      [/\b(four\s*times\s*(daily|a\s*day|per\s*day)|4\s*x?\s*(daily|a\s*day)?|every\s*6\s*hours?|qid|q\.i\.d\.)\b/i, 'four times daily'],
      [/\b(six\s*times\s*(daily|a\s*day)|6\s*x?\s*(daily|a\s*day)?|every\s*4\s*hours?)\b/i, 'six times daily'],
      [/\btwice\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'twice daily'],
      [/\b(three|3)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'three times daily'],
      [/\b(four|4)\s*times?\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?)\b/i, 'four times daily'],
      [/\bonce\s*(in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hour\s*(period)?|every\s*(\d+|twenty[\s-]*four)\s*hours?)\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*once|not\s*more\s*than\s*once|at\s*most\s*once|maximum\s*once|once\s*maximum)\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'once daily'],
      [/\b(no\s*more\s*than\s*twice|not\s*more\s*than\s*twice|at\s*most\s*twice)\s*(a\s*day|daily|per\s*day)?\b/i, 'twice daily'],
      [/\bevery\s*(24|twenty[\s-]*four)\s*hours?\b/i, 'once daily'],
      [/\b(every\s*2\s*hours?|once\s*every\s*2\s*hours?)\b/i, 'every 2 hours'],
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
    const maxFreqMap = [
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

  if (field === 'dosage_unit') {
    const unitMap = [
      [/^milligrams?$/, 'mg'], [/^micrograms?$/, 'mcg'], [/^milliliters?$/, 'ml'],
      [/^grams?$/, 'g'], [/^international\s*units?$/, 'iu'], [/^tablets?$/, 'mg'], [/^capsules?$/, 'mg'],
    ];
    for (const [p, c] of unitMap) { if (p.test(norm)) return c; }
  }

  if (field === 'route') {
    const routeMap = [
      [/\b(by\s*mouth|oral(ly)?|per\s*os|p\.o\.)\b/i, 'by mouth'],
      [/\b(subcut(aneous(ly)?)?|s\.c\.)\b/i, 'subcutaneous'],
      [/\b(intravenous(ly)?|i\.v\.)\b/i, 'intravenous'],
      [/\b(intramuscular(ly)?|i\.m\.)\b/i, 'intramuscular'],
      [/\b(topical(ly)?)\b/i, 'topical'],
      [/\b(sublingual(ly)?|under\s*the\s*tongue)\b/i, 'sublingual'],
      [/\b(rectal(ly)?|per\s*rectum)\b/i, 'rectal'],
    ];
    for (const [p, c] of routeMap) { if (p.test(norm)) return c; }
  }

  if (field === 'dosage_amount') {
    const numWords = { one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10' };
    for (const [w, d] of Object.entries(numWords)) { if (norm === w) return d; }
  }

  return norm;
}

function semanticallySimilar(a, b) {
  const normA = normalizeForComparison(a) ?? '';
  const normB = normalizeForComparison(b) ?? '';
  if (normA === normB) return true;
  const wordsA = normA.split(' ').filter(w => w.length > 3);
  if (wordsA.length === 0) return normA === normB;
  return wordsA.filter(w => normB.includes(w)).length / wordsA.length >= 0.6;
}

// Simulate the drift check for a single field — mirrors driftAnalyzer.ts logic
function checkField(field, sv, bv, sourceDosageAmount = null) {
  if (sv === null && bv === null) return 'skip';

  if (field === 'max_daily_dose' && sv !== null && bv === null) {
    const numsInSv = extractNumbers(sv);
    const dosageNums = extractNumbers(sourceDosageAmount ?? '');
    if (numsInSv.length > 0 && dosageNums.length > 0 && numsInSv[0] === dosageNums[0] && numsInSv.length === 1) {
      return 'skip_derived_max';
    }
  }

  if (sv !== null && bv === null) return 'omitted';
  if (sv === null) return 'skip';

  const canonSv = canonicalizeFieldValue(sv, field);
  const canonBv = canonicalizeFieldValue(bv, field);
  if (canonSv === canonBv) return 'match';

  // Unit-aware numeric drift for dosage fields
  if (field === 'dosage_amount' || field === 'max_daily_dose') {
    const mgS = normalizeDosageMg(sv);
    const mgB = normalizeDosageMg(bv);
    if (mgS !== null && mgB !== null) {
      return Math.abs(mgS - mgB) < 0.001 ? 'match' : 'value_changed';
    }
    const numsS = extractNumbers(sv);
    const numsB = extractNumbers(bv);
    if (numsS.length > 0 && numsB.length > 0 && numsS[0] === numsB[0]) return 'match';
    if (numsS.length > 0 && numsB.length > 0 && numsS[0] !== numsB[0]) return 'value_changed';
    if (numsS.length > 0 && numsB.length === 0) return 'skip_no_number_in_back';
    if (numsS.length === 0 && numsB.length === 0) return 'match';
  }

  // Semantic similarity only for medium/low fields — HIGH fields go straight to mismatch
  if (!HIGH_FIELDS.has(field) && semanticallySimilar(sv, bv)) return 'semantic_match';
  return 'mismatch';
}

// ─── TEST CASES ───────────────────────────────────────────────────────────────
// [desc, field, source_value, back_value, expected_result, source_dosage_amount]
const TESTS = [

  // ── Dosage amount: exact match ────────────────────────────────────────────
  ['500 = 500',                     'dosage_amount', '500',    '500',    'match'],
  ['10 = 10',                       'dosage_amount', '10',     '10',     'match'],
  ['0.25 = 0.25',                   'dosage_amount', '0.25',   '0.25',   'match'],
  ['one = 1 (word→digit)',           'dosage_amount', 'one',    '1',      'match'],
  ['two = 2',                        'dosage_amount', 'two',    '2',      'match'],

  // ── Dosage amount: real drift ──────────────────────────────────────────────
  ['500 ≠ 250 (REAL DRIFT)',         'dosage_amount', '500',    '250',    'value_changed'],
  ['10 ≠ 100 (REAL DRIFT)',          'dosage_amount', '10',     '100',    'value_changed'],

  // ── Dosage unit: canonicalization ─────────────────────────────────────────
  ['mg = milligrams',               'dosage_unit', 'mg',         'milligrams',   'match'],
  ['mg = mg',                       'dosage_unit', 'mg',         'mg',           'match'],
  ['mcg = micrograms',              'dosage_unit', 'mcg',        'micrograms',   'match'],
  ['ml = milliliters',              'dosage_unit', 'ml',         'milliliters',  'match'],
  ['g = grams',                     'dosage_unit', 'g',          'grams',        'match'],
  ['IU = international units',      'dosage_unit', 'IU',         'international units', 'match'],

  // ── Dosage unit: real drift ────────────────────────────────────────────────
  ['mg ≠ ml (REAL DRIFT)',          'dosage_unit', 'mg',         'ml',           'mismatch'],
  ['mg ≠ mcg (REAL DRIFT)',         'dosage_unit', 'mg',         'mcg',          'mismatch'],

  // ── Frequency: once daily variants ────────────────────────────────────────
  ['once daily = once a day',        'frequency', 'once daily',           'once a day',                    'match'],
  ['once daily = every 24 hours',    'frequency', 'once daily',           'every 24 hours',                'match'],
  ['once daily = once in any 24h',   'frequency', 'once daily',           'once in any 24-hour period',    'match'],
  ['once daily = QD',                'frequency', 'once daily',           'QD',                            'match'],
  ['once daily = once every 24h',    'frequency', 'once daily',           'once every twenty-four hours',  'match'],
  ['no more than once = once daily', 'frequency', 'no more than once daily', 'once daily',                'match'],
  ['not more than once = once/day',  'frequency', 'not more than once daily', 'once per day',             'match'],
  ['no more than once = once in 24h','frequency', 'no more than once per day', 'once in any 24-hour period', 'match'],

  // ── Frequency: twice daily variants ───────────────────────────────────────
  ['twice daily = BID',              'frequency', 'twice daily',          'BID',                           'match'],
  ['twice daily = every 12 hours',   'frequency', 'twice daily',          'every 12 hours',                'match'],
  ['twice daily = twice in any 24h', 'frequency', 'twice daily',          'twice in any 24-hour period',   'match'],
  ['twice daily = twice every 24h',  'frequency', 'twice daily',          'twice every twenty-four hours', 'match'],
  ['twice daily = 2x daily',         'frequency', 'twice daily',          '2x daily',                      'match'],

  // ── Frequency: three/four times daily ─────────────────────────────────────
  ['three times daily = TID',        'frequency', 'three times daily',    'TID',                           'match'],
  ['three times daily = 3x daily',   'frequency', 'three times daily',    '3x daily',                      'match'],
  ['three times daily = every 8h',   'frequency', 'three times daily',    'every 8 hours',                 'match'],
  ['four times daily = QID',         'frequency', 'four times daily',     'QID',                           'match'],
  ['four times daily = every 6h',    'frequency', 'four times daily',     'every 6 hours',                 'match'],
  ['four times daily = 4x per day',  'frequency', 'four times daily',     '4x per day',                    'match'],

  // ── Frequency: PRN / interval expressions ─────────────────────────────────
  ['every 6 hours = every 6 hours',  'frequency', 'every 6 hours',        'every 6 hours',                 'match'],
  ['every 8 hours = every 8 hours',  'frequency', 'every 8 hours',        'every 8 hours',                 'match'],
  ['every 12 hours = every 12 hours','frequency', 'every 12 hours',       'every 12 hours',                'match'],

  // ── Frequency: REAL drift (must flag) ─────────────────────────────────────
  ['once ≠ twice (REAL DRIFT)',      'frequency', 'once daily',           'twice daily',                   'mismatch'],
  ['twice ≠ three times (REAL)',     'frequency', 'twice daily',          'three times daily',             'mismatch'],
  ['every 6h ≠ every 8h (REAL)',     'frequency', 'every 6 hours',        'every 8 hours',                 'mismatch'], // HIGH field — no semantic match
  ['once ≠ four times (REAL)',       'frequency', 'once daily',           'four times daily',              'mismatch'],

  // ── Max daily dose: derived (should NOT flag) ─────────────────────────────
  // These are cases where the extractor calculated max from dose×1 — should be skipped
  ['max: 10mg/day derived from 10mg dose — skip',
    'max_daily_dose', '10mg per day', null, 'skip_derived_max', '10'],
  ['max: 500mg/day derived from 500mg dose — skip',
    'max_daily_dose', '500mg per day', null, 'skip_derived_max', '500'],
  ['max: 0.25mg/day derived from 0.25mg dose — skip',
    'max_daily_dose', '0.25mg per day', null, 'skip_derived_max', '0.25'],

  // ── Max daily dose: explicit cap — should match equivalents ───────────────
  ['max: 4000mg/day = 4g/day',       'max_daily_dose', '4000mg per day',   '4g per day',                  'match'],
  ['max: not more than 4 times = at most 4 times daily',
    'max_daily_dose', 'not more than 4 times daily', 'at most four times daily', 'match'],
  ['max: once in 24h = once every 24h',
    'max_daily_dose', 'once in any 24-hour period', 'once every twenty-four hours', 'match'],
  ['max: not more than once = once per day',
    'max_daily_dose', 'not more than once in any 24-hour period', 'once per day', 'match'],
  ['max: 8 tablets/24h = 8 tablets/day',
    'max_daily_dose', '8 tablets in 24 hours', '8 tablets per day', 'match'],

  // ── Max daily dose: REAL drift (must flag) ────────────────────────────────
  ['max: 4000mg ≠ 2000mg (REAL DRIFT)',
    'max_daily_dose', '4000mg per day', '2000mg per day', 'value_changed'],
  ['max: 8 tablets ≠ 4 tablets (REAL DRIFT)',
    'max_daily_dose', '8 tablets per day', '4 tablets per day', 'value_changed'],

  // ── Complex real-world prompts ─────────────────────────────────────────────
  // Diazepam: "10mg not more than once daily" — max_daily_dose = "10mg per day" in source, null in back
  ['Diazepam: max from single PRN dose — should skip',
    'max_daily_dose', '10mg per day', null, 'skip_derived_max', '10'],

  // Paracetamol: explicit cap stated
  ['Paracetamol: explicit 4g cap — should compare',
    'max_daily_dose', '4000mg per day', '4g daily', 'match'],

  // Ibuprofen: explicit 1200mg cap
  ['Ibuprofen: 1200mg vs 1200mg',
    'max_daily_dose', '1200mg per day', '1200 milligrams per day', 'match'],

  // Amoxicillin: no max stated in either — both null → skip
  ['Amoxicillin: both null → skip',
    'max_daily_dose', null, null, 'skip'],

  // Route: should match variants
  ['route: by mouth = orally',       'route', 'by mouth',    'orally',     'match'],
  ['route: by mouth = oral',         'route', 'by mouth',    'oral',       'match'],
  ['route: by mouth = by mouth',     'route', 'by mouth',    'by mouth',   'match'],
];

// ─── RUNNER ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

console.log('='.repeat(68));
console.log('DOSAGE + FREQUENCY + MAX DOSE COMPREHENSIVE BACKTEST');
console.log('='.repeat(68));

for (const [desc, field, sv, bv, expected, sourceDosageAmount = null] of TESTS) {
  const result = checkField(field, sv, bv, sourceDosageAmount);
  const ok = result === expected;

  if (ok) {
    passed++;
    const label = expected === 'match' || expected === 'semantic_match'
      ? `→ "${canonicalizeFieldValue(sv, field)}"` : `[${expected}]`;
    console.log(`✓ ${desc}  ${label}`);
  } else {
    failed++;
    console.log(`✗ FAIL: ${desc}`);
    console.log(`    expected: ${expected}`);
    console.log(`    got:      ${result}`);
    if (sv) console.log(`    source:   "${canonicalizeFieldValue(sv, field)}"`);
    if (bv) console.log(`    back:     "${canonicalizeFieldValue(bv, field)}"`);
  }
}

console.log('='.repeat(68));
console.log(`RESULT: ${passed}/${TESTS.length} passed, ${failed} failed`);
console.log('='.repeat(68));
