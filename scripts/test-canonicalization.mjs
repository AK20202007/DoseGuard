// Backtest for frequency + max_daily_dose canonicalization
// Covers all the ways back-translators rephrase "once daily", "twice daily", max-dose caps, etc.
// Run: node scripts/test-canonicalization.mjs

function normalizeForComparison(value) {
  if (value === null) return null;
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalizeFieldValue(value, field) {
  const norm = normalizeForComparison(value);
  if (norm === null) return null;

  if (field === 'frequency' || field === 'interval') {
    const freqMap = [
      // Standard daily — note: "every 24 hours" is BELOW the N-times patterns to avoid matching "twice every 24 hours" as once
      [/\b(once\s*(daily|a\s*day|per\s*day|every\s*day)|one\s*time\s*(daily|a\s*day)|1\s*x?\s*(daily|a\s*day)?|qd|q\.d\.)\b/i, 'once daily'],
      [/\b(twice\s*(daily|a\s*day|per\s*day)|two\s*times\s*(daily|a\s*day)|2\s*x?\s*(daily|a\s*day)?|every\s*12\s*hours?|bid|b\.i\.d\.)\b/i, 'twice daily'],
      [/\b(three\s*times\s*(daily|a\s*day|per\s*day)|3\s*x?\s*(daily|a\s*day)?|every\s*8\s*hours?|tid|t\.i\.d\.)\b/i, 'three times daily'],
      [/\b(four\s*times\s*(daily|a\s*day|per\s*day)|4\s*x?\s*(daily|a\s*day)?|every\s*6\s*hours?|qid|q\.i\.d\.)\b/i, 'four times daily'],
      [/\b(six\s*times\s*(daily|a\s*day)|6\s*x?\s*(daily|a\s*day)?|every\s*4\s*hours?)\b/i, 'six times daily'],
      // N-times in 24h — must come BEFORE standalone "every 24 hours → once daily"
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
      [/\b(no\s*more\s*than\s*(three|3)|at\s*most\s*(three|3))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'three times daily'],
      [/\b(no\s*more\s*than\s*(four|4)|at\s*most\s*(four|4))\s*times?\s*(a\s*day|daily|per\s*day|in\s*(any\s*)?(\d+|twenty[\s-]*four)[\s-]*hours?(\s*period)?)?\b/i, 'four times daily'],
    ];
    for (const [pattern, canonical] of maxFreqMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  return norm;
}

// Each test: [description, field, valueA (source), valueB (back-translation), shouldMatch]
const TESTS = [
  // ── Frequency: "once daily" variants ─────────────────────────────────────────
  ['once daily = once a day',            'frequency', 'once daily',                     'once a day',                       true],
  ['once daily = every 24 hours',        'frequency', 'once daily',                     'every 24 hours',                   true],
  ['once daily = every twenty-four hrs', 'frequency', 'once daily',                     'every twenty-four hours',          true],
  ['once daily = once in any 24-hour',   'frequency', 'once daily',                     'once in any 24-hour period',       true],
  ['once daily = once every 24 hours',   'frequency', 'once daily',                     'once every 24 hours',              true],
  ['once daily = 1x daily',              'frequency', 'once daily',                     '1x daily',                        true],
  ['once daily = QD',                    'frequency', 'once daily',                     'QD',                               true],

  // ── Frequency: "twice daily" variants ────────────────────────────────────────
  ['twice daily = twice a day',          'frequency', 'twice daily',                    'twice a day',                      true],
  ['twice daily = every 12 hours',       'frequency', 'twice daily',                    'every 12 hours',                   true],
  ['twice daily = BID',                  'frequency', 'twice daily',                    'BID',                              true],
  ['twice daily = twice in any 24h',     'frequency', 'twice daily',                    'twice in any 24-hour period',      true],
  ['twice daily = twice every 24 hours', 'frequency', 'twice daily',                    'twice every twenty-four hours',    true],
  ['twice daily = 2x daily',             'frequency', 'twice daily',                    '2x daily',                        true],

  // ── Frequency: "three times daily" variants ───────────────────────────────────
  ['three times daily = TID',            'frequency', 'three times daily',              'TID',                              true],
  ['three times daily = every 8 hours',  'frequency', 'three times daily',              'every 8 hours',                    true],
  ['three times daily = 3x daily',       'frequency', 'three times daily',              '3x daily',                        true],
  ['three times daily = 3 times in 24h', 'frequency', 'three times daily',              'three times in any 24-hour period',true],

  // ── Frequency: "four times daily" ────────────────────────────────────────────
  ['four times daily = QID',             'frequency', 'four times daily',               'QID',                              true],
  ['four times daily = every 6 hours',   'frequency', 'four times daily',               'every 6 hours',                    true],
  ['four times daily = 4 times in 24h',  'frequency', 'four times daily',               'four times in any 24-hour period', true],

  // ── "no more than" / "not more than" ─────────────────────────────────────────
  ['no more than once = not more than once',     'frequency', 'no more than once daily',  'not more than once daily',       true],
  ['no more than once = not more than once 24h', 'frequency', 'no more than once daily',  'not more than once in any 24-hour period', true],
  ['no more than once = at most once',           'frequency', 'no more than once daily',  'at most once daily',             true],
  ['no more than once = once in 24h period',     'frequency', 'no more than once daily',  'once in any 24-hour period',     true],
  ['no more than once = once daily',             'frequency', 'no more than once daily',  'once daily',                     true],

  // ── max_daily_dose: frequency-style caps ──────────────────────────────────────
  ['max: once in 24h = once every 24h',          'max_daily_dose', 'once in any 24-hour period', 'once every twenty-four hours',    true],
  ['max: once daily = once in 24h period',       'max_daily_dose', 'once daily',                  'once in any 24-hour period',      true],
  ['max: not more than once = once in 24h',      'max_daily_dose', 'not more than once in any 24-hour period', 'once in any 24-hour period', true],
  ['max: twice daily = twice in 24h',            'max_daily_dose', 'twice daily',                 'twice in any 24-hour period',     true],
  ['max: no more than 4 times = 4x daily',       'max_daily_dose', 'no more than 4 times daily',  'at most four times daily',        true],

  // ── Interval expressions ──────────────────────────────────────────────────────
  ['every 6 hours = every 6 hours',    'interval', 'every 6 hours',   'every 6 hours',   true],
  ['every 8 hours = every 8 hours',    'interval', 'every 8 hours',   'every 8 hours',   true],
  ['every 12 hours = every 12 hours',  'interval', 'every 12 hours',  'every 12 hours',  true],

  // ── Should NOT match (true negatives) ────────────────────────────────────────
  ['once daily ≠ twice daily',         'frequency', 'once daily',     'twice daily',     false],
  ['once daily ≠ three times daily',   'frequency', 'once daily',     'three times daily', false],
  ['twice daily ≠ three times daily',  'frequency', 'twice daily',    'three times daily', false],
  ['every 6h ≠ every 8h',              'interval',  'every 6 hours',  'every 8 hours',   false],
];

let passed = 0;
let failed = 0;

console.log('='.repeat(65));
console.log('CANONICALIZATION BACKTEST — frequency + max_daily_dose');
console.log('='.repeat(65));

for (const [desc, field, a, b, shouldMatch] of TESTS) {
  const canonA = canonicalizeFieldValue(a, field);
  const canonB = canonicalizeFieldValue(b, field);
  const matched = canonA === canonB;
  const ok = matched === shouldMatch;

  if (ok) {
    passed++;
    if (shouldMatch) {
      console.log(`✓ ${desc}`);
      console.log(`    both → "${canonA}"`);
    } else {
      console.log(`✓ ${desc} [correctly distinct]`);
      console.log(`    "${canonA}" ≠ "${canonB}"`);
    }
  } else {
    failed++;
    if (shouldMatch) {
      console.log(`✗ FAIL (should match): ${desc}`);
      console.log(`    source  → "${canonA}"`);
      console.log(`    back    → "${canonB}"`);
    } else {
      console.log(`✗ FAIL (should differ): ${desc}`);
      console.log(`    both matched as → "${canonA}"`);
    }
  }
}

console.log('='.repeat(65));
console.log(`RESULT: ${passed}/${TESTS.length} passed, ${failed} failed`);
console.log('='.repeat(65));
