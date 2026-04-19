// Yoruba numeral lookup table with tonal diacritics.
// Source: standard Yoruba orthography + MENYO-20k diacritic conventions.
// Used by the tonal rail to detect dosage/frequency ambiguity in translations.

export type YorubaNumeral = {
  digit: number;
  canonical: string;        // correct fully-diacritized standalone form
  stripped: string;         // diacritic-free form used for matching
  frequencyForm: string;    // form used in "lẹ́ẹ̀mejì" (twice) contexts
  variants: string[];       // other valid diacritized spellings
  confusableWith: number | null;    // digit most easily confused with
  confusableCanonical: string | null;
  medicalRisk: 'critical' | 'high' | 'low';
};

export const YORUBA_NUMERALS: YorubaNumeral[] = [
  {
    digit: 1,
    canonical: 'ọ̀kan',
    stripped: 'okan',
    frequencyForm: 'lẹ́ẹ̀kan',
    variants: ['ọkan', 'ọ̀kan', 'ìgbà kan', 'kan'],
    confusableWith: 2,
    confusableCanonical: 'èjì',
    medicalRisk: 'critical',
  },
  {
    digit: 2,
    canonical: 'èjì',
    stripped: 'eji',
    frequencyForm: 'lẹ́ẹ̀mejì',
    variants: ['ejì', 'èji', 'méjì'],
    confusableWith: 4,
    confusableCanonical: 'ẹ̀rin',
    medicalRisk: 'critical',
  },
  {
    digit: 3,
    canonical: 'ẹ̀ta',
    stripped: 'eta',
    frequencyForm: 'lẹ́ẹ̀mẹ́ta',
    variants: ['ẹta', 'mẹ́ta', 'mẹ̀ta'],
    confusableWith: 6,
    confusableCanonical: 'ẹ̀fà',
    medicalRisk: 'critical',
  },
  {
    digit: 4,
    canonical: 'ẹ̀rin',
    stripped: 'erin',
    frequencyForm: 'lẹ́ẹ̀mẹ́rin',
    variants: ['ẹrin', 'mẹ́rin'],
    confusableWith: 2,
    confusableCanonical: 'èjì',
    medicalRisk: 'high',
  },
  {
    digit: 5,
    canonical: 'àrún',
    stripped: 'arun',
    frequencyForm: 'lẹ́ẹ̀márùn',
    variants: ['arún', 'àrun', 'árún', 'márùn', 'màrún', 'márùn-ún'],
    confusableWith: 6,
    confusableCanonical: 'ẹ̀fà',
    medicalRisk: 'high',
  },
  {
    digit: 6,
    canonical: 'ẹ̀fà',
    stripped: 'efa',
    frequencyForm: 'lẹ́ẹ̀mẹ́fà',
    variants: ['ẹfa', 'mẹ́fà', 'mẹ̀fà'],
    confusableWith: 3,
    confusableCanonical: 'ẹ̀ta',
    medicalRisk: 'critical',
  },
  {
    digit: 7,
    canonical: 'èje',
    stripped: 'eje',
    frequencyForm: 'lẹ́ẹ̀méje',
    variants: ['ejè', 'èjè', 'méje', 'méjẹ̀', 'meje'],
    confusableWith: 8,
    confusableCanonical: 'ẹ̀jọ',
    medicalRisk: 'high',
  },
  {
    digit: 8,
    canonical: 'ẹ̀jọ',
    stripped: 'ejo',
    frequencyForm: 'lẹ́ẹ̀mẹ́jọ',
    variants: ['ẹjo', 'mẹ́jọ'],
    confusableWith: 7,
    confusableCanonical: 'èje',
    medicalRisk: 'high',
  },
  {
    digit: 9,
    canonical: 'ẹ̀sàn',
    stripped: 'esan',
    frequencyForm: 'lẹ́ẹ̀mẹ́sàn',
    variants: ['ẹsàn', 'ẹ̀sán', 'mẹ́sàn', 'mẹ̀sàn'],
    confusableWith: null,
    confusableCanonical: null,
    medicalRisk: 'low',
  },
  {
    digit: 10,
    canonical: 'ẹ̀wá',
    stripped: 'ewa',
    frequencyForm: 'lẹ́ẹ̀mẹ́wá',
    variants: ['ẹwa', 'mẹ́wá'],
    confusableWith: null,
    confusableCanonical: null,
    medicalRisk: 'low',
  },
];

// English frequency words → digit mapping (used to extract expected frequency from source)
export const ENGLISH_FREQ_MAP: Record<string, number> = {
  once: 1,
  twice: 2,
  'two times': 2,
  'three times': 3,
  'four times': 4,
  'five times': 5,
  'six times': 6,
  'seven times': 7,
  'eight times': 8,
  'nine times': 9,
  'ten times': 10,
  'one time': 1,
};

export const ENGLISH_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function getNumeralByDigit(digit: number): YorubaNumeral | undefined {
  return YORUBA_NUMERALS.find(n => n.digit === digit);
}

export function getNumeralByStripped(stripped: string): YorubaNumeral | undefined {
  return YORUBA_NUMERALS.find(
    n =>
      n.stripped === stripped ||
      n.variants.some(v => stripDiacritics(v) === stripped),
  );
}

export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
