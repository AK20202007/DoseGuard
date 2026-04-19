// Comprehensive backtest of tonal rail numeral logic — mirrors production tonalRail.ts exactly
// Run: node scripts/test-tonal-rail.mjs

function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const YORUBA_NUMERALS = [
  { digit: 1, canonical: 'ọ̀kan', stripped: 'okan', frequencyForm: 'lẹ́ẹ̀kan', variants: ['ọkan', 'ọ̀kan', 'ìgbà kan', 'kan'] },
  { digit: 2, canonical: 'èjì', stripped: 'eji', frequencyForm: 'lẹ́ẹ̀mejì', variants: ['ejì', 'èji', 'méjì'] },
  { digit: 3, canonical: 'ẹ̀ta', stripped: 'eta', frequencyForm: 'lẹ́ẹ̀mẹ́ta', variants: ['ẹta', 'mẹ́ta', 'mẹ̀ta'] },
  { digit: 4, canonical: 'ẹ̀rin', stripped: 'erin', frequencyForm: 'lẹ́ẹ̀mẹ́rin', variants: ['ẹrin', 'mẹ́rin'] },
  { digit: 5, canonical: 'àrún', stripped: 'arun', frequencyForm: 'lẹ́ẹ̀márùn', variants: ['arún', 'àrun', 'árún', 'márùn', 'màrún', 'márùn-ún'] },
  { digit: 6, canonical: 'ẹ̀fà', stripped: 'efa', frequencyForm: 'lẹ́ẹ̀mẹ́fà', variants: ['ẹfa', 'mẹ́fà', 'mẹ̀fà'] },
  { digit: 7, canonical: 'èje', stripped: 'eje', frequencyForm: 'lẹ́ẹ̀méje', variants: ['ejè', 'èjè', 'méje', 'méjẹ̀', 'meje'] },
  { digit: 8, canonical: 'ẹ̀jọ', stripped: 'ejo', frequencyForm: 'lẹ́ẹ̀mẹ́jọ', variants: ['ẹjo', 'mẹ́jọ'] },
  { digit: 9, canonical: 'ẹ̀sàn', stripped: 'esan', frequencyForm: 'lẹ́ẹ̀mẹ́sàn', variants: ['ẹsàn', 'ẹ̀sán', 'mẹ́sàn', 'mẹ̀sàn'] },
  { digit: 10, canonical: 'ẹ̀wá', stripped: 'ewa', frequencyForm: 'lẹ́ẹ̀mẹ́wá', variants: ['ẹwa', 'mẹ́wá'] },
];

const ENGLISH_FREQ_MAP = {
  once: 1, twice: 2, 'two times': 2, 'three times': 3, 'four times': 4,
  'five times': 5, 'six times': 6, 'seven times': 7, 'eight times': 8,
  'nine times': 9, 'ten times': 10, 'one time': 1,
};

const ENGLISH_NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Mirrors ARABIC_NUMERAL_PATTERNS in production
const ARABIC_NUMERAL_PATTERNS = [
  /every\s+\d+\s+hours?/,
  /every\s+\d+\s+minutes?/,
  /\d+[\s-]?hours?/,
  /\d+[\s-]?minutes?/,
  /\d+\s*mg\b/,
  /\d+\s*ml\b/,
  /\d+\s*mcg\b/,
  /\d+\s*g\b/,
  /in\s+\d+\s+hours?/,
  /\d+[\s-]hour/,
  /24\s*hours?/,
];

const WORD_FORM_PATTERNS = [
  /\b(\d+)\s+(?:tablets?|capsules?|drops?|doses?|pills?)\b/,
  /\b(\d+)\s+(?:days?|weeks?)\b/,
  /\btake\s+(\d+)\b/,
  /\bfor\s+(\d+)\s+days?\b/,
  /\b(\d+)\s+times?\s+(?:a\s+)?(?:day|daily|week)\b/,
];

function extractExpectedDigits(sourceText) {
  const digits = new Set();
  const lower = sourceText.toLowerCase();

  let filtered = lower;
  for (const pattern of ARABIC_NUMERAL_PATTERNS) {
    filtered = filtered.replace(pattern, ' ');
  }

  for (const pattern of WORD_FORM_PATTERNS) {
    const m = lower.match(new RegExp(pattern.source, 'g'));
    if (m) {
      for (const match of m) {
        const numMatch = match.match(/\d+/);
        if (numMatch) {
          const n = parseInt(numMatch[0], 10);
          if (n >= 1 && n <= 10) digits.add(n);
        }
      }
    }
  }

  for (const [phrase, digit] of Object.entries(ENGLISH_FREQ_MAP)) {
    if (filtered.includes(phrase)) digits.add(digit);
  }

  for (const [word, digit] of Object.entries(ENGLISH_NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(filtered)) digits.add(digit);
  }

  return Array.from(digits);
}

function tokenize(text) {
  return text.replace(/[.,;:!?()"""'']/g, ' ').split(/\s+/).filter(Boolean);
}

function findNumeralToken(tokens, digit) {
  const numeral = YORUBA_NUMERALS.find(n => n.digit === digit);
  if (!numeral) return null;
  const allForms = [numeral.canonical, numeral.frequencyForm, ...numeral.variants];
  const strippedForms = new Set(allForms.map(f => stripDiacritics(f)));
  for (const token of tokens) {
    const stripped = stripDiacritics(token);
    if (strippedForms.has(stripped)) return { token, stripped };
  }
  return null;
}

// Mirrors the new foundAsArabic in production
function foundAsArabic(tokens, digit) {
  const digitStr = String(digit);
  return tokens.some(t => t === digitStr || t.startsWith(digitStr + ',') || t.startsWith(digitStr + '.'));
}

// ─── TEST CASES ────────────────────────────────────────────────────────────────
// Each: [description, source, yorubaTranslation, expectedDigitsChecked, shouldPassFor]
// shouldPassFor: array of digits expected to PASS (either found in Yoruba word OR Arabic in translation)

const TESTS = [
  // ── Frequency forms (English words → Yoruba frequency form) ──────────────────
  ['once daily → lẹ́ẹ̀kan',
    'Take medicine once daily',
    'Mu oogun náà lẹ́ẹ̀kan lójoojúmọ́.',
    [1], 'yoruba'],

  ['twice daily → lẹ́ẹ̀mejì',
    'Take twice daily',
    'Mu oogun yìí lẹ́ẹ̀mejì lójoojúmọ́.',
    [2], 'yoruba'],

  ['three times daily → lẹ́ẹ̀mẹ́ta',
    'Take three times daily',
    'Mu lẹ́ẹ̀mẹ́ta lójoojúmọ́.',
    [3], 'yoruba'],

  ['four times daily → lẹ́ẹ̀mẹ́rin',
    'Take four times daily',
    'Mu lẹ́ẹ̀mẹ́rin lójoojúmọ́.',
    [4], 'yoruba'],

  ['five times daily → lẹ́ẹ̀márùn',
    'Take five times daily',
    'Mu lẹ́ẹ̀márùn lójoojúmọ́.',
    [5], 'yoruba'],

  ['six times daily → lẹ́ẹ̀mẹ́fà',
    'Take six times daily',
    'Mu lẹ́ẹ̀mẹ́fà lójoojúmọ́.',
    [6], 'yoruba'],

  ['seven times daily → lẹ́ẹ̀méje',
    'Take seven times daily',
    'Mu lẹ́ẹ̀méje lójoojúmọ́.',
    [7], 'yoruba'],

  ['eight times daily → lẹ́ẹ̀mẹ́jọ',
    'Take eight times daily',
    'Mu lẹ́ẹ̀mẹ́jọ lójoojúmọ́.',
    [8], 'yoruba'],

  ['nine times daily → lẹ́ẹ̀mẹ́sàn',
    'Take nine times daily',
    'Mu lẹ́ẹ̀mẹ́sàn lójoojúmọ́.',
    [9], 'yoruba'],

  ['ten times daily → lẹ́ẹ̀mẹ́wá',
    'Take ten times daily',
    'Mu lẹ́ẹ̀mẹ́wá lójoojúmọ́.',
    [10], 'yoruba'],

  // ── Duration (N days/weeks → Yoruba modifier form) ───────────────────────────
  ['for 3 days → mẹ́ta',
    'Take for 3 days',
    'Mu fún ọjọ́ mẹ́ta.',
    [3], 'yoruba'],

  ['for 5 days → márùn',
    'Take for 5 days',
    'Mu fún ọjọ́ márùn.',
    [5], 'yoruba'],

  ['for 7 days → méjẹ̀ (variant)',
    'Take for 7 days',
    'Mu fún ọjọ́ méjẹ̀.',
    [7], 'yoruba'],

  ['for 10 days → mẹ́wá',
    'Take for 10 days',
    'Mu fún ọjọ́ mẹ́wá.',
    [10], 'yoruba'],

  // ── Arabic numerals in translation (Claude keeps them as Arabic) ─────────────
  ['4 tablets Arabic in translation — should NOT flag',
    'Take 4 tablets twice daily for 3 days, with food or milk.',
    'Mu tábùlẹ́tì 4 lẹ́ẹ̀mejì lójoojúmọ́ fún ọjọ́ mẹ́ta, pẹ̀lú oúnjẹ tàbí wàrà.',
    [2, 3, 4], 'yoruba'],
    // 4→Arabic (OK), 2→lẹ́ẹ̀mejì (Yoruba), 3→mẹ́ta (Yoruba)

  ['1 tablet Arabic',
    'Take 1 tablet daily',
    'Mu tábùlẹ́tì 1 lójoojúmọ́.',
    [1], 'arabic'],

  ['2 tablets Arabic',
    'Take 2 tablets once daily',
    'Mu tábùlẹ́tì 2 lẹ́ẹ̀kan lójoojúmọ́.',
    [1, 2], 'mixed'],
    // 2→Arabic (OK), 1→lẹ́ẹ̀kan (Yoruba)

  ['6 tablets Arabic',
    'Take 6 tablets daily',
    'Mu tábùlẹ́tì 6 lójoojúmọ́.',
    [6], 'arabic'],

  // ── Interval expressions — should NOT extract digits (filtered by ARABIC_NUMERAL_PATTERNS) ──
  ['every 2 hours — digit NOT extracted (stays Arabic in translation)',
    'Give every 2 hours',
    'Fún gbogbo wákàtí 2.',
    [], 'none'],
    // "every 2 hours" is filtered — digit 2 should NOT be in expectedDigits

  ['every 6 hours — digit NOT extracted',
    'Take every 6 hours',
    'Mu oogun gbogbo wákàtí 6.',
    [], 'none'],

  ['every 8 hours — digit NOT extracted',
    'Take every 8 hours',
    'Mu oogun gbogbo wákàtí 8.',
    [], 'none'],

  // ── Dosage amounts — NOT extracted (filtered by mg/ml patterns) ──────────────
  ['500mg — digit 5 NOT extracted',
    'Take 500mg daily',
    'Mu 500 miligiramu lójoojúmọ́.',
    [], 'none'],

  ['200ml — not extracted',
    'Dissolve in 200ml of water',
    'Tu sínú 200 milimita omi.',
    [], 'none'],

  // ── Complex real-world cases ─────────────────────────────────────────────────
  ['Amoxicillin 500mg twice daily for 7 days',
    'Take 500mg amoxicillin twice daily for 7 days.',
    'Mu amoxisilin 500 miligiramu lẹ́ẹ̀mejì lójoojúmọ́ fún ọjọ́ méjẹ̀.',
    [2, 7], 'yoruba'],

  ['Artemether 4 tablets twice daily for 3 days',
    'Take 4 tablets of Artemether-Lumefantrine twice daily for 3 days, with food or milk.',
    'Mu tábùlẹ́tì 4 Artemether-Lumefantrine lẹ́ẹ̀mejì lójoojúmọ́ fún ọjọ́ mẹ́ta, pẹ̀lú oúnjẹ tàbí wàrà.',
    [2, 3, 4], 'yoruba'],

  ['ORS every 2 hours',
    'Take one sachet of Oral Rehydration Salts dissolved in 200ml of clean water every 2 hours.',
    'Mu àpò kan ti Oral Rehydration Salts tí a tú sínú 200 milimita omi mímọ́ gbogbo wákàtí 2.',
    [1], 'yoruba'],
    // "every 2 hours" filtered, "200ml" filtered, "one sachet" → digit 1 stays

  ['Paracetamol 500mg up to 4 times daily max 8 tablets',
    'Take 500mg paracetamol up to 4 times daily. Do not take more than 8 tablets in 24 hours.',
    'Mu parasitamọl 500 miligiramu lẹ́ẹ̀mẹ́rin lójoojúmọ́. Má mu ju tábùlẹ́tì 8 lọ ní wákàtí 24.',
    [4, 8], 'yoruba'],

  ['Zinc 10mg once daily for 10 days',
    'Give 10mg zinc once daily for 10 days.',
    'Fún síńkì 10 miligiramu lẹ́ẹ̀kan lójoojúmọ́ fún ọjọ́ mẹ́wá.',
    [1, 10], 'yoruba'],
    // 10mg filtered, "for 10 days" → digit 10 as Yoruba

  ['Ibuprofen 400mg three times daily for 5 days',
    'Take 400mg ibuprofen three times daily for 5 days.',
    'Mu ibuprofẹn 400 miligiramu lẹ́ẹ̀mẹ́ta lójoojúmọ́ fún ọjọ́ márùn.',
    [3, 5], 'yoruba'],
];

// ─── RUNNER ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

console.log('='.repeat(65));
console.log('TONAL RAIL COMPREHENSIVE BACKTEST — all digits + all contexts');
console.log('='.repeat(65));

for (const [desc, source, yoruba, expectedDigits, mode] of TESTS) {
  const extracted = extractExpectedDigits(source);
  const tokens = tokenize(yoruba);
  const errors = [];

  // Validate extraction matches expected
  for (const d of expectedDigits) {
    if (!extracted.includes(d)) {
      errors.push(`digit ${d} not extracted from source (got: [${extracted.join(', ')}])`);
    }
  }

  // Check no unexpected extra digits extracted for 'none' cases
  if (mode === 'none' && extracted.length > 0) {
    errors.push(`expected 0 digits extracted but got: [${extracted.join(', ')}]`);
  }

  // For each extracted digit, check it's found (word or Arabic)
  for (const digit of extracted) {
    const wordFound = findNumeralToken(tokens, digit);
    const arabicFound = foundAsArabic(tokens, digit);
    if (!wordFound && !arabicFound) {
      errors.push(`digit ${digit} not found in translation (neither Yoruba word nor Arabic numeral)`);
    }
  }

  if (errors.length === 0) {
    passed++;
    const parts = extracted.length > 0
      ? extracted.map(d => {
          const wf = findNumeralToken(tokens, d);
          const af = foundAsArabic(tokens, d);
          return `${d}→${wf ? `"${wf.token}"` : af ? 'Arabic' : 'MISSING'}`;
        }).join(', ')
      : 'no digits (filtered)';
    console.log(`✓ ${desc}`);
    console.log(`    ${parts}`);
  } else {
    failed++;
    console.log(`✗ FAIL: ${desc}`);
    errors.forEach(e => console.log(`    ✗ ${e}`));
  }
}

console.log('='.repeat(65));
console.log(`RESULT: ${passed}/${TESTS.length} passed, ${failed} failed`);
console.log('='.repeat(65));
