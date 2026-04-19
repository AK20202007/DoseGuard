import type { DemoCase } from '@/lib/types';

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'safe-simple',
    label: 'Safe Simple',
    instruction: 'Take 500mg amoxicillin twice daily for 7 days with food.',
    targetLanguage: 'Spanish',
    useSimplification: false,
    expectedRisk: 'low',
    description:
      'Clear, unambiguous instruction translated into a high-resource language. Expected: low risk, no drift.',
  },
  {
    id: 'ambiguous-source',
    label: 'Ambiguous Source',
    instruction: 'Take 2 tabs TID PRN pain.',
    targetLanguage: 'Yoruba',
    useSimplification: true,
    expectedRisk: 'medium',
    description:
      'Multiple medical abbreviations (TID = three times daily, PRN = as needed) require simplification before safe translation.',
  },
  {
    id: 'frequency-drift',
    label: 'Frequency Drift',
    instruction: 'Take metformin 1000mg twice daily with your morning and evening meals.',
    targetLanguage: 'Quechua',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Low-resource language (Quechua) with complex frequency instructions. Risk is automatically escalated.',
  },
  {
    id: 'max-dose-drift',
    label: 'Max Dose Drift',
    instruction:
      'Do not take more than 8 regular-strength tablets (4000mg acetaminophen) in 24 hours. Liver damage may occur with higher doses.',
    targetLanguage: 'Yoruba',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Critical maximum dose limit with liver damage warning. Any drift in this field is high risk.',
  },
  {
    id: 'warning-omission',
    label: 'Warning Omission',
    instruction:
      'Take warfarin 5mg once daily. Do NOT take with aspirin or ibuprofen. Avoid alcohol. Seek immediate medical help if unusual bleeding occurs.',
    targetLanguage: 'Quechua',
    useSimplification: false,
    expectedRisk: 'high',
    description:
      'Multiple critical safety warnings in a low-resource language — high risk of warning omission.',
  },
];
