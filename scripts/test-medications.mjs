/**
 * Backtest for 12 common medication prompt pairs
 * Tests realistic source→back-translation field pairs through drift analyzer
 * Goal: zero false positives (no drift issues on semantically equivalent pairs)
 */

// Inline the canonicalize + drift logic by importing via tsx
import { createRequire } from 'module';
import { execSync } from 'child_process';

const tests = [
  // ─── AMOXICILLIN ───
  {
    name: 'Amoxicillin 500mg TID',
    source: {
      medication_name: 'Amoxicillin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: 'by mouth',
      duration: '7 days', max_daily_dose: null, warnings: ['Complete the full course'],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Amoxicillin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'three times a day', interval: null, route: 'orally',
      duration: 'for 7 days', max_daily_dose: null, warnings: ['Complete the full course'],
      food_instruction: 'with meals', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── AMOXICILLIN EVERY 8H VARIANT ───
  {
    name: 'Amoxicillin every 8 hours = three times daily',
    source: {
      medication_name: 'Amoxicillin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'every 8 hours', interval: 'every 8 hours', route: 'by mouth',
      duration: '7 days', max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Amoxicillin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: 'oral',
      duration: '7 days', max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── LISINOPRIL ───
  {
    name: 'Lisinopril 10mg once daily',
    source: {
      medication_name: 'Lisinopril', dosage_amount: '10', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: null, warnings: ['Do not stop without consulting doctor'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Lisinopril', dosage_amount: '10', dosage_unit: 'mg',
      frequency: 'once a day', interval: null, route: 'oral',
      duration: null, max_daily_dose: null, warnings: ['Do not stop without consulting doctor'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── METFORMIN ───
  {
    name: 'Metformin 500mg BID with food',
    source: {
      medication_name: 'Metformin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'twice daily', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Metformin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'two times a day', interval: null, route: 'orally',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: 'with meal', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── PARACETAMOL ───
  {
    name: 'Paracetamol 1000mg PRN every 6h max 4x daily',
    source: {
      medication_name: 'Paracetamol', dosage_amount: '1000', dosage_unit: 'mg',
      frequency: 'every 6 hours as needed', interval: 'every 6 hours', route: 'by mouth',
      duration: null, max_daily_dose: '4000mg per day', warnings: ['Do not exceed stated dose'],
      food_instruction: null, patient_group: null, conditionality: 'as needed', notes: null,
    },
    back: {
      medication_name: 'Paracetamol', dosage_amount: '1000', dosage_unit: 'mg',
      frequency: 'every 6 hours', interval: null, route: 'oral',
      duration: null, max_daily_dose: '4g daily', warnings: ['Do not exceed stated dose'],
      food_instruction: null, patient_group: null, conditionality: 'as needed', notes: null,
    },
    expectedIssues: 0,
  },

  // ─── PARACETAMOL MILLIGRAMS SPELLED OUT ───
  {
    name: 'Paracetamol milligrams spelled out',
    source: {
      medication_name: 'Paracetamol', dosage_amount: '500', dosage_unit: 'milligrams',
      frequency: 'four times daily', interval: null, route: 'oral',
      duration: null, max_daily_dose: '2000mg per day', warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Paracetamol', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'four times a day', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: '2g daily', warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── ZINC SUPPLEMENT ───
  {
    name: 'Zinc 20mg once daily',
    source: {
      medication_name: 'Zinc', dosage_amount: '20', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: null,
      duration: '14 days', max_daily_dose: null, warnings: [],
      food_instruction: 'with food', patient_group: 'children', conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Zinc', dosage_amount: '20', dosage_unit: 'mg',
      frequency: 'one time a day', interval: null, route: null,
      duration: '14 days', max_daily_dose: null, warnings: [],
      food_instruction: 'with meals', patient_group: 'children', conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── IBUPROFEN ───
  {
    name: 'Ibuprofen 400mg TID with food',
    source: {
      medication_name: 'Ibuprofen', dosage_amount: '400', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: 'by mouth',
      duration: '5 days', max_daily_dose: '1200mg per day', warnings: ['Do not take on empty stomach'],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Ibuprofen', dosage_amount: '400', dosage_unit: 'mg',
      frequency: 'three times a day', interval: null, route: 'orally',
      duration: 'for 5 days', max_daily_dose: '1.2g daily', warnings: ['Do not take on empty stomach'],
      food_instruction: 'after food', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── ARTEMETHER-LUMEFANTRINE ───
  {
    name: 'Artemether-Lumefantrine 4 tablets BID for 3 days',
    source: {
      medication_name: 'Artemether-Lumefantrine', dosage_amount: '4', dosage_unit: 'tablets',
      frequency: 'twice daily', interval: null, route: 'by mouth',
      duration: '3 days', max_daily_dose: null, warnings: [],
      food_instruction: 'with food or milk', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Artemether-Lumefantrine', dosage_amount: '4', dosage_unit: 'tablets',
      frequency: 'two times daily', interval: null, route: 'oral',
      duration: '3 days', max_daily_dose: null, warnings: [],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── ORS ───
  {
    name: 'ORS 200-400ml after each loose stool',
    source: {
      medication_name: 'Oral Rehydration Salts', dosage_amount: '200-400', dosage_unit: 'ml',
      frequency: 'after each loose stool', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Oral Rehydration Salts', dosage_amount: '200-400', dosage_unit: 'ml',
      frequency: 'after each loose stool', interval: null, route: 'oral',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── ASPIRIN (LOW-DOSE) ───
  {
    name: 'Aspirin 75mg once daily for heart',
    source: {
      medication_name: 'Aspirin', dosage_amount: '75', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: null, warnings: ['Do not stop without consulting doctor'],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Aspirin', dosage_amount: '75', dosage_unit: 'mg',
      frequency: 'once a day', interval: null, route: 'orally',
      duration: null, max_daily_dose: null, warnings: ['Do not stop without consulting doctor'],
      food_instruction: 'with meal', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── PREDNISOLONE ───
  {
    name: 'Prednisolone 40mg once daily for 5 days',
    source: {
      medication_name: 'Prednisolone', dosage_amount: '40', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: 'by mouth',
      duration: '5 days', max_daily_dose: null, warnings: ['Do not stop abruptly'],
      food_instruction: 'with food', patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Prednisolone', dosage_amount: '40', dosage_unit: 'mg',
      frequency: 'once a day', interval: null, route: 'oral',
      duration: 'for 5 days', max_daily_dose: null, warnings: ['Do not stop abruptly'],
      food_instruction: 'after food', patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── AZITHROMYCIN ───
  {
    name: 'Azithromycin 500mg once daily for 3 days',
    source: {
      medication_name: 'Azithromycin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: 'by mouth',
      duration: '3 days', max_daily_dose: null, warnings: ['Complete the full course'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Azithromycin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'one time daily', interval: null, route: 'orally',
      duration: '3 days', max_daily_dose: null, warnings: ['Complete the full course'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── FLUCONAZOLE ───
  {
    name: 'Fluconazole 150mg single dose',
    source: {
      medication_name: 'Fluconazole', dosage_amount: '150', dosage_unit: 'mg',
      frequency: 'once', interval: null, route: 'by mouth',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Fluconazole', dosage_amount: '150', dosage_unit: 'mg',
      frequency: 'one time', interval: null, route: 'oral',
      duration: null, max_daily_dose: null, warnings: [],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 0,
  },

  // ─── REAL DRIFT CASES — must be detected ───
  {
    name: 'REAL DRIFT: wrong dose amount (500 vs 250)',
    source: {
      medication_name: 'Amoxicillin', dosage_amount: '500', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: null, duration: null,
      max_daily_dose: null, warnings: [], food_instruction: null, patient_group: null,
      conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Amoxicillin', dosage_amount: '250', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: null, duration: null,
      max_daily_dose: null, warnings: [], food_instruction: null, patient_group: null,
      conditionality: null, notes: null,
    },
    expectedIssues: 1,  // dosage_amount mismatch
  },

  {
    name: 'REAL DRIFT: frequency changed once→twice',
    source: {
      medication_name: 'Lisinopril', dosage_amount: '10', dosage_unit: 'mg',
      frequency: 'once daily', interval: null, route: null, duration: null,
      max_daily_dose: null, warnings: [], food_instruction: null, patient_group: null,
      conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Lisinopril', dosage_amount: '10', dosage_unit: 'mg',
      frequency: 'twice daily', interval: null, route: null, duration: null,
      max_daily_dose: null, warnings: [], food_instruction: null, patient_group: null,
      conditionality: null, notes: null,
    },
    expectedIssues: 1,  // frequency mismatch
  },

  {
    name: 'REAL DRIFT: do not take alcohol negation lost',
    source: {
      medication_name: 'Metronidazole', dosage_amount: '400', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: null, duration: '7 days',
      max_daily_dose: null, warnings: ['Do not take with alcohol'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    back: {
      medication_name: 'Metronidazole', dosage_amount: '400', dosage_unit: 'mg',
      frequency: 'three times daily', interval: null, route: null, duration: '7 days',
      max_daily_dose: null, warnings: ['Take with alcohol'],
      food_instruction: null, patient_group: null, conditionality: null, notes: null,
    },
    expectedIssues: 1,  // warning negation lost
  },
];

// Inline the core drift logic (avoid transpile overhead)
function normalizeForComparison(value) {
  if (value === null) return null;
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

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
      [/^(once|one\s*time|single\s*dose?)$/i, 'once'],
      [/\b(every\s*2\s*hours?|once\s*every\s*2\s*hours?)\b/i, 'every 2 hours'],
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

  if (field === 'conditionality') {
    const condMap = [
      [/\b(as\s*needed|when\s*needed|if\s*needed|prn|p\.r\.n\.|as\s*required|when\s*necessary|if\s*necessary)\b/i, 'as needed'],
      [/\b(unless\s*directed|unless\s*told|unless\s*instructed)\b/i, 'unless directed otherwise'],
    ];
    for (const [pattern, canonical] of condMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'food_instruction') {
    const foodMap = [
      [/\b(with\s*food|with\s*meal|with\s*meals|after\s*food|after\s*eating|after\s*meal)\b/i, 'with food'],
      [/\b(without\s*food|on\s*an?\s*empty\s*stomach|before\s*food|before\s*eating|before\s*meal)\b/i, 'on empty stomach'],
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
    const unitMap = [
      [/^milligrams?$/, 'mg'],
      [/^micrograms?$/, 'mcg'],
      [/^milliliters?$/, 'ml'],
      [/^grams?$/, 'g'],
      [/^international\s*units?$/, 'iu'],
      [/^tablets?$/, 'tablet'],
      [/^capsules?$/, 'capsule'],
    ];
    for (const [pattern, canonical] of unitMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  if (field === 'dosage_amount') {
    const numWords = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
    for (const [word, digit] of Object.entries(numWords)) {
      if (norm === word) return digit;
    }
  }

  if (field === 'route') {
    const routeMap = [
      [/\b(by\s*mouth|oral(ly)?|per\s*os|p\.o\.)\b/i, 'by mouth'],
      [/\b(subcut(aneous(ly)?)?|s\.c\.|subcutaneously)\b/i, 'subcutaneous'],
      [/\b(intravenous(ly)?|i\.v\.|iv\s*infusion)\b/i, 'intravenous'],
      [/\b(intramuscular(ly)?|i\.m\.)\b/i, 'intramuscular'],
      [/\b(topical(ly)?|applied\s*to\s*skin)\b/i, 'topical'],
      [/\b(sublingual(ly)?|under\s*the\s*tongue)\b/i, 'sublingual'],
      [/\b(rectal(ly)?|per\s*rectum|suppository)\b/i, 'rectal'],
    ];
    for (const [pattern, canonical] of routeMap) {
      if (pattern.test(norm)) return canonical;
    }
  }

  return norm;
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

function hasNegation(text) {
  return /\b(not|no|never|avoid|do not|don't|stop|contraindicated|prohibited)\b/i.test(text);
}

function semanticallySimilar(a, b) {
  const normA = normalizeForComparison(a) ?? '';
  const normB = normalizeForComparison(b) ?? '';
  if (normA === normB) return true;
  const wordsA = normA.split(' ').filter(w => w.length > 3);
  if (wordsA.length === 0) return normA === normB;
  const matchCount = wordsA.filter(w => normB.includes(w)).length;
  return matchCount / wordsA.length >= 0.6;
}

function fieldSeverity(field) {
  const HIGH = ['dosage_amount', 'dosage_unit', 'frequency', 'max_daily_dose'];
  const MEDIUM = ['route', 'duration', 'warnings'];
  if (HIGH.includes(field)) return 'high';
  if (MEDIUM.includes(field)) return 'medium';
  return 'low';
}

function analyzeDrift(sourceFields, backFields) {
  const issues = [];
  const scalarFields = [
    'medication_name', 'dosage_amount', 'dosage_unit', 'frequency', 'interval',
    'route', 'duration', 'max_daily_dose', 'food_instruction', 'patient_group',
    'conditionality',
  ];

  for (const field of scalarFields) {
    const sv = sourceFields[field];
    const bv = backFields[field];

    if (sv === null && bv === null) continue;

    if (field === 'interval' && bv === null && sourceFields.frequency !== null) {
      const canonInterval = canonicalizeFieldValue(sv, 'interval');
      const canonFreq = canonicalizeFieldValue(sourceFields.frequency, 'frequency');
      if (canonInterval === canonFreq) continue;
      const canonBackFreq = canonicalizeFieldValue(backFields.frequency, 'frequency');
      if (canonBackFreq === canonInterval) continue;
    }

    if (sv !== null && bv === null) {
      if (fieldSeverity(field) === 'low') continue;

      if (field === 'max_daily_dose') {
        const numsInSv = extractNumbers(sv);
        const dosageNums = extractNumbers((sourceFields.dosage_amount) ?? '');
        if (numsInSv.length > 0 && dosageNums.length > 0 && numsInSv[0] === dosageNums[0] && numsInSv.length === 1) continue;
        const canonSvMax = canonicalizeFieldValue(sv, 'max_daily_dose');
        const canonBackFreq = canonicalizeFieldValue((backFields.frequency) ?? '', 'frequency');
        if (canonSvMax && canonBackFreq && canonSvMax === canonBackFreq) continue;
      }

      issues.push({ field, type: 'omitted', severity: fieldSeverity(field), sourceValue: sv, backValue: null });
      continue;
    }

    if (sv === null) continue;

    const canonSv = canonicalizeFieldValue(sv, field);
    const canonBv = canonicalizeFieldValue(bv, field);
    if (canonSv === canonBv) continue;

    if (field === 'dosage_amount' || field === 'max_daily_dose') {
      const mgS = normalizeDosageMg(sv);
      const mgB = normalizeDosageMg(bv);
      if (mgS !== null && mgB !== null) {
        if (Math.abs(mgS - mgB) < 0.001) continue;
        issues.push({ field, type: 'value_changed', severity: 'high', sourceValue: sv, backValue: bv });
        continue;
      }
      const numsS = extractNumbers(sv);
      const numsB = extractNumbers(bv);
      if (numsS.length > 0 && numsB.length > 0 && numsS[0] === numsB[0]) continue;
      if (numsS.length > 0 && numsB.length > 0 && numsS[0] !== numsB[0]) {
        issues.push({ field, type: 'value_changed', severity: 'high', sourceValue: sv, backValue: bv });
        continue;
      }
      if (numsS.length > 0 && numsB.length === 0) continue;
      if (numsS.length === 0 && numsB.length === 0) continue;
    }

    const svHasNeg = hasNegation(sv);
    const bvHasNeg = hasNegation(bv);
    if (svHasNeg !== bvHasNeg) {
      issues.push({ field, type: 'negation_changed', severity: 'high', sourceValue: sv, backValue: bv });
      continue;
    }

    if (fieldSeverity(field) === 'low' && semanticallySimilar(sv, bv)) continue;
    if (fieldSeverity(field) === 'medium' && semanticallySimilar(sv, bv)) continue;

    issues.push({ field, type: 'mismatch', severity: fieldSeverity(field), sourceValue: sv, backValue: bv });
  }

  // Warnings
  for (const warning of sourceFields.warnings) {
    const matchingBack = backFields.warnings.find(bw => semanticallySimilar(warning, bw));
    if (!matchingBack) {
      issues.push({ field: 'warnings', type: 'omitted', severity: hasNegation(warning) ? 'high' : 'medium', sourceValue: warning, backValue: null });
    } else if (hasNegation(warning) && !hasNegation(matchingBack)) {
      issues.push({ field: 'warnings', type: 'negation_changed', severity: 'high', sourceValue: warning, backValue: matchingBack });
    }
  }

  return issues;
}

// ─── Run tests ───
let passed = 0;
let failed = 0;
const WIDTH = 68;

console.log('='.repeat(WIDTH));
console.log('MEDICATION DRIFT BACKTEST — 17 cases');
console.log('='.repeat(WIDTH));

for (const t of tests) {
  const issues = analyzeDrift(t.source, t.back);
  const ok = t.expectedIssues === 0
    ? issues.length === 0
    : issues.length >= t.expectedIssues;

  if (ok) {
    passed++;
    const label = t.expectedIssues > 0 ? '[DRIFT DETECTED]' : '';
    console.log(`✓ ${t.name} ${label}`);
  } else {
    failed++;
    console.log(`✗ ${t.name}`);
    if (t.expectedIssues === 0 && issues.length > 0) {
      console.log(`  FALSE POSITIVE — got ${issues.length} issue(s):`);
      for (const i of issues) {
        console.log(`    field=${i.field} type=${i.type} sv="${i.sourceValue}" bv="${i.backValue}"`);
      }
    } else {
      console.log(`  MISSED DRIFT — expected ${t.expectedIssues} issues, got ${issues.length}`);
    }
  }
}

console.log('='.repeat(WIDTH));
console.log(`RESULT: ${passed}/${tests.length} passed, ${failed} failed`);
console.log('='.repeat(WIDTH));
process.exit(failed > 0 ? 1 : 0);
