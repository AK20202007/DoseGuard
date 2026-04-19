// Curated EN-YO sentence pairs.
// Sources:
//   - Core set: original medication-instruction examples (MediVerify team)
//   - Extended set: filtered from MENYO-20k MT corpus (Adelani et al., 2021)
//     https://github.com/uds-lsv/menyo-20k_MT  (CC BY-NC 4.0)
//
// Organised by topic so the example selector can weight by relevance.

export type MenyoExample = {
  en: string;
  yo: string;
  tags: string[];
};

export const MENYO_EXAMPLES: MenyoExample[] = [
  // ── Frequency / dosing (core medication instruction set) ──────────────────
  {
    en: 'Take the medicine twice every day.',
    yo: 'Mu oogun náà lẹ́ẹ̀mejì lójoojúmọ́.',
    tags: ['frequency', 'dosing', 'instruction'],
  },
  {
    en: 'Take this medicine three times daily.',
    yo: 'Mu oogun yìí lẹ́ẹ̀mẹ́ta lójoojúmọ́.',
    tags: ['frequency', 'dosing', 'instruction'],
  },
  {
    en: 'Take one tablet in the morning and one in the evening.',
    yo: 'Mu tábùlẹ́tì kan ní òwúrọ̀ àti ọ̀kan ní alẹ́.',
    tags: ['frequency', 'dosing', 'timing', 'instruction'],
  },
  {
    en: 'Continue taking this medicine for seven days.',
    yo: 'Máa mu oogun yìí fún ọjọ́ méjẹ̀.',
    tags: ['duration', 'instruction'],
  },
  {
    en: 'Swallow the tablet with a full glass of water.',
    yo: 'Gbé tábùlẹ́tì mì pẹ̀lú ìkòkò omi kún.',
    tags: ['route', 'instruction'],
  },
  {
    en: 'Take this medicine with food.',
    yo: 'Mu oogun yìí pẹ̀lú oúnjẹ.',
    tags: ['food', 'instruction'],
  },

  // ── Warnings / negation (core medication instruction set) ─────────────────
  {
    en: 'Do not take more than the prescribed amount.',
    yo: 'Má ṣe mu jù ìwọ̀n tí a ti fún ọ lọ.',
    tags: ['warning', 'negation', 'max-dose'],
  },
  {
    en: 'Do not take more than 8 tablets in 24 hours.',
    yo: 'Má mu tábùlẹ́tì ju mẹjọ lọ ní wákàtí mẹ́rìnlélógún.',
    tags: ['warning', 'negation', 'max-dose', 'number'],
  },
  {
    en: 'Do not drink alcohol while taking this medicine.',
    yo: 'Má mu ọtí líle nígbà tí o bá ń mu oogun yìí.',
    tags: ['warning', 'negation', 'alcohol'],
  },
  {
    en: 'Seek immediate medical attention if you have difficulty breathing.',
    yo: 'Wá ìrànlọ́wọ́ ìṣègùn lẹ́sẹ̀kẹsẹ bí o bá ní ìṣòro mímí.',
    tags: ['warning', 'emergency', 'conditional'],
  },

  // ── Medical vocabulary (from MENYO-20k) ───────────────────────────────────
  {
    en: "I'm a nurse. I feel it's just fever.",
    yo: 'Nọ́ọ̀sì ni mí, ibà lásán ni mo rò pé ó jẹ́.',
    tags: ['medical', 'diagnosis'],
  },
  {
    en: 'They can cause a lot of damage to your health, including cancer.',
    yo: 'Wọ́n máa ń fa ìpalára ìlera rẹ, pẹ̀lú àìsàn jẹjẹrẹ.',
    tags: ['warning', 'health', 'medical'],
  },
  {
    en: 'That is used to treat numerous diseases such as infections, malaria and jaundice.',
    yo: 'Tí a fi ń wo ọ̀gọ̀rọ̀ àìsàn bí àkóràn, ibà àti ibà apọ́njú-pọ́ntọ.',
    tags: ['medical', 'treatment', 'disease'],
  },
  {
    en: "The doctor must refrain from providing this treatment if it violates the patient's will.",
    yo: 'Dókítà ò gbọ́dọ̀ fún un nírú ìtọ́jú yìí tí onítọ̀hún bá ti lóhun ò fẹ́.',
    tags: ['medical', 'treatment', 'negation', 'doctor'],
  },
  {
    en: 'When my treatments were terminated, my disease started to progress.',
    yo: 'Nígbà tí wọ́n dá ìtọ́jú tí mò ń gbà dúró, àìsàn tó ń ṣe mí wá bẹ̀rẹ̀ sí í le sí i.',
    tags: ['treatment', 'medical', 'disease'],
  },
  {
    en: 'Whoever conceals a disease is beyond help from a doctor.',
    yo: 'Ẹní gbé àrùn pamọ́ kọjá ore oníṣègùn.',
    tags: ['medical', 'doctor', 'disease'],
  },
  {
    en: 'Health is wealth.',
    yo: "Ìlera l'ọrọ̀.",
    tags: ['health'],
  },

  // ── Food and nutrition (from MENYO-20k) ──────────────────────────────────
  {
    en: 'Young people learned basic cooking and healthy eating.',
    yo: 'Àwọn ọ̀dọ́ kọ́ nípa ìpilẹ̀ṣẹ̀ oúnjẹ sísè àti oúnjẹ aṣaralóore.',
    tags: ['food', 'health', 'eating'],
  },
  {
    en: 'They learned how to select and prepare healthy food.',
    yo: "Bí a ti ń ṣ'àṣàyàn àti ra oúnjẹ tútù, àti sísè àti ìtọ́wò oúnjẹ aṣaralóore.",
    tags: ['food', 'health', 'eating'],
  },
  {
    en: 'A person who waits patiently before eating will not eat unwholesome food.',
    yo: 'A-pẹ́-ẹ́-jẹ kì í jẹ ìbàjẹ́.',
    tags: ['food', 'caution'],
  },

  // ── Conditional / time expressions ───────────────────────────────────────
  {
    en: 'Although he was denied care at first, he received treatment when his condition became urgent.',
    yo: 'Bó tiẹ̀ jẹ́ pé wọn ò kọ́kọ́ jẹ́ kó gbàtọ́jú, nígbà tí ìlera ẹ̀ di pé ó ń burú sí i, wọ́n tọ́jú rẹ̀.',
    tags: ['treatment', 'conditional', 'medical'],
  },
];
