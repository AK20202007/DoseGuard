import type { DemoCase } from '@/lib/types';

export const DEMO_CASES: DemoCase[] = [
  // ── Tier 1: Expected LOW risk ─────────────────────────────────────────────
  {
    id: 'safe-simple',
    label: 'Safe Simple',
    instruction: 'Take 500mg amoxicillin twice daily for 7 days with food.',
    targetLanguage: 'Spanish',
    useSimplification: false,
    expectedRisk: 'low',
    description:
      'Clear, unambiguous instruction into a high-resource language. Expected: low risk, no drift.',
  },
  {
    id: 'safe-french',
    label: 'Safe French',
    instruction: 'Take one ibuprofen 200mg tablet every 6 hours as needed for pain. Do not exceed 4 tablets in 24 hours.',
    targetLanguage: 'French',
    useSimplification: false,
    expectedRisk: 'low',
    description:
      'OTC pain reliever with max-dose cap translated into high-resource French. Expected: low risk.',
  },

  // ── Tier 2: Simplification / abbreviations ────────────────────────────────
  {
    id: 'ambiguous-source',
    label: 'Ambiguous Abbreviations',
    instruction: 'Take 2 tabs TID PRN pain.',
    targetLanguage: 'Yoruba',
    useSimplification: true,
    expectedRisk: 'medium',
    description:
      'TID (three times daily) and PRN (as needed) must be expanded before translation. Tests the simplification layer.',
  },
  {
    id: 'clinical-abbreviations',
    label: 'Clinical Abbreviations',
    instruction: 'Metoprolol 25mg PO BID. Hold if HR < 60 or SBP < 90. NPO after midnight.',
    targetLanguage: 'Spanish',
    useSimplification: true,
    expectedRisk: 'medium',
    description:
      'Dense clinical shorthand: PO (by mouth), BID (twice daily), HR (heart rate), SBP (systolic BP), NPO (nothing by mouth). Tests full abbreviation expansion.',
  },

  // ── Tier 3: Yoruba diacritic integrity ───────────────────────────────────
  {
    id: 'yoruba-numerals',
    label: 'Yoruba Dose Numbers',
    instruction: 'Take 3 tablets in the morning and 2 tablets in the evening. Do not take more than 6 tablets per day.',
    targetLanguage: 'Yoruba',
    useSimplification: false,
    expectedRisk: 'medium',
    description:
      'Tests Yoruba numerals 2, 3, 6 — the mẹ́ta/mẹ́fà (three/six) confusable pair is a direct dose-confusion risk. Layer 4 diacritic check fires here.',
  },
  {
    id: 'max-dose-drift',
    label: 'Max Dose (Yoruba)',
    instruction:
      'Do not take more than 8 regular-strength tablets (4000mg acetaminophen) in 24 hours. Liver damage may occur with higher doses.',
    targetLanguage: 'Yoruba',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Critical maximum dose limit with liver damage warning in Yoruba. Tests numeric drift detection and diacritic validation on high numbers.',
  },
  {
    id: 'yoruba-frequency',
    label: 'Yoruba Daily Timing',
    instruction: 'Take one tablet every morning with water. Take one tablet every evening with food. Continue for 14 days.',
    targetLanguage: 'Yoruba',
    useSimplification: false,
    expectedRisk: 'low',
    description:
      'Tests that morning (òwúrọ̀) and evening (alẹ́) timing words carry correct tone marks in Yoruba output. Baseline Yoruba quality check.',
  },

  // ── Tier 4: Warnings / negation drift ────────────────────────────────────
  {
    id: 'warning-omission',
    label: 'Warning Omission (Quechua)',
    instruction:
      'Take warfarin 5mg once daily. Do NOT take with aspirin or ibuprofen. Avoid alcohol. Seek immediate medical help if unusual bleeding occurs.',
    targetLanguage: 'Quechua',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Multiple critical safety warnings in low-resource Quechua. Tests warning omission detection and low-resource risk escalation.',
  },
  {
    id: 'negation-critical',
    label: 'Negation Safety',
    instruction:
      'Do NOT grind or chew this tablet. Do NOT take on an empty stomach. Do NOT swallow with dairy products or antacids.',
    targetLanguage: 'Yoruba',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Three critical negations in Yoruba. If "do not" becomes "take" in back-translation, the patient gets the opposite instruction.',
  },

  // ── Tier 5: Low-resource escalation ──────────────────────────────────────
  {
    id: 'frequency-drift',
    label: 'Low-Resource Frequency',
    instruction: 'Take metformin 1000mg twice daily with your morning and evening meals.',
    targetLanguage: 'Quechua',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Complex frequency + timing instruction in Quechua. Risk escalated one tier by low-resource language flag.',
  },
  {
    id: 'complex-conditional',
    label: 'Conditional Dosing',
    instruction:
      'If pain is severe (score 7–10), take 2 tablets every 4 hours. If pain is mild (score 1–6), take 1 tablet every 6 hours. Do not exceed 8 tablets in 24 hours.',
    targetLanguage: 'Haitian Creole',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Conditional dosing logic with two branches and a max-dose cap in low-resource Haitian Creole. Tests conditionality field extraction and numeric drift.',
  },
];
