// Yoruba diacritic validation checklist for Layer 4.
// Derived from MENYO-20k corpus vocabulary (Adelani et al., 2021).
//
// Yoruba is a tonal language: the same sequence of letters carries different
// meaning depending on tone marks (acute ́ = high, grave ̀ = low, dot-below for
// open vowels ẹ/ọ). Missing diacritics are not just typos — they change meaning.
//
// Each entry pairs a "bare" (undiacritized) form with its canonical diacritized
// form. If the bare form appears in a translation without its diacritics, Layer 4
// flags it as a potential tonal integrity error.

export type DiacriticEntry = {
  canonical: string;         // correctly marked: "mẹ́ta"
  bare: string;              // without any marks: "meta"
  meaning: string;           // English gloss
  confusableWith?: string;   // another real word the bare form could be misread as
  confusableMeaning?: string;
  severity: 'high' | 'medium';
  category: 'numeral' | 'time' | 'frequency' | 'medical' | 'instruction';
};

export const DIACRITIC_CHECKLIST: DiacriticEntry[] = [
  // ── Numerals (highest risk — dose confusion) ─────────────────────────────
  {
    canonical: 'ọ̀kan',
    bare: 'okan',
    meaning: 'one',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'méjì',
    bare: 'meji',
    meaning: 'two',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'mẹ́ta',
    bare: 'meta',
    meaning: 'three',
    confusableWith: 'mẹ́fà',
    confusableMeaning: 'six',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'mẹ́rin',
    bare: 'merin',
    meaning: 'four',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'màrún-ún',
    bare: 'marun',
    meaning: 'five',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'mẹ́fà',
    bare: 'mefa',
    meaning: 'six',
    confusableWith: 'mẹ́ta',
    confusableMeaning: 'three',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'méje',
    bare: 'meje',
    meaning: 'seven',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'mẹ́jọ',
    bare: 'mejo',
    meaning: 'eight',
    severity: 'high',
    category: 'numeral',
  },
  {
    canonical: 'mẹ́wàá',
    bare: 'mewa',
    meaning: 'ten',
    severity: 'high',
    category: 'numeral',
  },

  // ── Frequency / timing (dose scheduling) ─────────────────────────────────
  {
    canonical: 'lójoojúmọ́',
    bare: 'lojoojumo',
    meaning: 'daily / every day',
    severity: 'high',
    category: 'frequency',
  },
  {
    canonical: 'lẹ́ẹ̀mejì',
    bare: 'leeemeji',
    meaning: 'twice',
    severity: 'high',
    category: 'frequency',
  },
  {
    canonical: 'lẹ́ẹ̀mẹ́ta',
    bare: 'leeeemeta',
    meaning: 'three times',
    severity: 'high',
    category: 'frequency',
  },
  {
    canonical: 'wákàtí',
    bare: 'wakati',
    meaning: 'hour(s)',
    severity: 'medium',
    category: 'time',
  },
  {
    canonical: 'òwúrọ̀',
    bare: 'owuro',
    meaning: 'morning',
    severity: 'medium',
    category: 'time',
  },
  {
    canonical: 'alẹ́',
    bare: 'ale',
    meaning: 'evening / night',
    confusableWith: 'àlẹ̀',
    confusableMeaning: 'dream',
    severity: 'medium',
    category: 'time',
  },
  {
    canonical: 'ọjọ́',
    bare: 'ojo',
    meaning: 'day',
    confusableWith: 'ọjọ̀',
    confusableMeaning: 'shame / cowardice',
    severity: 'medium',
    category: 'time',
  },

  // ── Medical vocabulary ────────────────────────────────────────────────────
  {
    canonical: 'àìsàn',
    bare: 'aisan',
    meaning: 'sickness / illness',
    severity: 'medium',
    category: 'medical',
  },
  {
    canonical: 'ìtọ́jú',
    bare: 'itoju',
    meaning: 'treatment / care',
    severity: 'medium',
    category: 'medical',
  },
  {
    canonical: 'ibà',
    bare: 'iba',
    meaning: 'fever / malaria',
    severity: 'medium',
    category: 'medical',
  },
  {
    canonical: 'àrùn',
    bare: 'arun',
    meaning: 'disease / ailment',
    severity: 'medium',
    category: 'medical',
  },
  {
    canonical: 'ìwọ̀n',
    bare: 'iwon',
    meaning: 'amount / dose / measure',
    severity: 'high',
    category: 'medical',
  },

  // ── Instruction words ─────────────────────────────────────────────────────
  {
    canonical: 'má',
    bare: 'ma',
    meaning: 'do not (negation imperative)',
    confusableWith: 'má',
    confusableMeaning: 'do not — same bare form, but missing tone = ambiguous',
    severity: 'high',
    category: 'instruction',
  },
];

// Words whose bare form contains at least one diacritic character — used to
// quickly check if a translation appears to have been stripped of marks.
export const KNOWN_DIACRITIZED_WORDS = DIACRITIC_CHECKLIST.map(e => e.canonical);
