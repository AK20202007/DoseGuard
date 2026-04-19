// Curated EN-YO sentence pairs derived from MENYO-20k dataset structure.
// Used as few-shot examples in the Yoruba translation prompt to ground diacritic quality.
export const MENYO_EXAMPLES: Array<{ en: string; yo: string }> = [
  {
    en: 'Take the medicine twice every day.',
    yo: 'Mu oogun náà lẹ́ẹ̀mejì lójoojúmọ́.',
  },
  {
    en: 'Do not take more than the prescribed amount.',
    yo: 'Má ṣe mu jù ìwọ̀n tí a ti fún ọ lọ.',
  },
  {
    en: 'Take this medicine with food.',
    yo: 'Mu oogun yìí pẹ̀lú oúnjẹ.',
  },
  {
    en: 'Take one tablet in the morning and one in the evening.',
    yo: 'Mu tábùlẹ́tì kan ní òwúrọ̀ àti ọ̀kan ní alẹ́.',
  },
  {
    en: 'Do not drink alcohol while taking this medicine.',
    yo: 'Má mu ọtí líle nígbà tí o bá ń mu oogun yìí.',
  },
  {
    en: 'Continue taking this medicine for seven days.',
    yo: 'Máa mu oogun yìí fún ọjọ́ méjẹ̀.',
  },
  {
    en: 'Take this medicine three times daily.',
    yo: 'Mu oogun yìí lẹ́ẹ̀mẹ́ta lójoojúmọ́.',
  },
  {
    en: 'Swallow the tablet with a full glass of water.',
    yo: 'Gbé tábùlẹ́tì mì pẹ̀lú ìkòkò omi kún.',
  },
  {
    en: 'Seek immediate medical attention if you have difficulty breathing.',
    yo: 'Wá ìrànlọ́wọ́ ìṣègùn lẹ́sẹ̀kẹsẹ bí o bá ní ìṣòro mímí.',
  },
  {
    en: 'Do not take more than 8 tablets in 24 hours.',
    yo: 'Má mu tábùlẹ́tì ju mẹjọ lọ ní wákàtí mẹ́rìnlélógún.',
  },
];
