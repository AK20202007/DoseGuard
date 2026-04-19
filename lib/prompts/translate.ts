import type { SupportedLanguage } from '@/lib/types';
import { MENYO_EXAMPLES } from '@/data/menyo-examples';
import { YORUBA_NUMERALS, ENGLISH_FREQ_MAP } from '@/data/yoruba-numerals';

function hasNumerals(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b\d+\b/.test(lower)) return true;
  return Object.keys(ENGLISH_FREQ_MAP).some(p => lower.includes(p));
}

function buildNumeralExamples(): string {
  return YORUBA_NUMERALS.slice(0, 6)
    .map(n => `  ${n.digit} → ${n.canonical} (frequency: ${n.frequencyForm})`)
    .join('\n');
}

export function buildTranslatePrompt(
  text: string,
  targetLanguage: SupportedLanguage,
  useFewShot: boolean,
): { system: string; user: string } {
  const system = `You are a certified medical translator specializing in patient-facing medication instructions. Translate the provided English medication instruction into ${targetLanguage}.

CRITICAL RULES — follow all of these without exception:
1. Preserve ALL numbers, dosages, and units exactly as written. Never alter numeric values.
2. Preserve ALL frequency information with precision — twice daily is not the same as twice a week.
3. Preserve ALL warnings, contraindications, and safety instructions — do not omit any.
4. Preserve ALL negations — "do not take" must remain a clear negation in ${targetLanguage}.
5. Do NOT add information not present in the source.
6. Do NOT remove, summarize, or paraphrase any part of the instruction.
7. MEASUREMENTS — use phonetic transliterations, NEVER brackets:
   mg / milligrams → miligiramu | g / grams → giramu | mcg / micrograms → mikogiramu
   ml / milliliters → milimita | L / liters → lita | IU / international units → ìwọ̀n ìbílẹ̀
   Use the same principle for all languages — find the local phonetic form.
8. DOSAGE FORMS — use standard phonetic Yoruba forms:
   tablet(s) → tábùlẹ́tì | capsule(s) → kapusulu | teaspoon → sibi kékeré | tablespoon → sibi nlá
   drops → ìsọ̀nù | patch → pásítì | injection → abẹrẹ | syrup → sírọ́ọ̀pù | cream → kírímù
9. MEDICATION NAMES — NEVER put in brackets. Phonetically transliterate into target language script:
   Antibiotics: amoxicillin→amoxisilin | azithromycin→asitromaisín | doxycycline→doxisaiklin | metronidazole→metronidasoolu | ciprofloxacin→siprofloasasin | penicillin→penisilin | clarithromycin→klaritromaisín
   Heart/BP: lisinopril→lisinọprílì | metoprolol→metoprolọl | amlodipine→amlodipín | atenolol→atenolọl | ramipril→ramipril | losartan→losatan | furosemide→furosemaíd
   Diabetes: metformin→metfọmin | glipizide→glipisaíd | insulin→ínsiulín | glibenclamide→glibenklẹmáíd
   Pain/Fever: paracetamol→parasitamọl | ibuprofen→ibuprofẹn | aspirin→aspiirin | diclofenac→daiklofinẹk | tramadol→tramadọl | codeine→kodín
   Other: zinc→síńkì | vitamin→vitamin | omeprazole→omeprasọl | salbutamol→salbutamọl | prednisolone→prednisọlọn | fluconazole→flukonasọl | acyclovir→asaiklovír
   For ANY other drug: sound it out phonetically — do NOT bracket it.
10. Use simple, clear language appropriate for a patient with limited health literacy.
10. Return ONLY the translated text — no preamble, explanation, or commentary.${
    targetLanguage === 'Yoruba'
      ? '\n11. ALL Yoruba words MUST carry correct tonal diacritics (acute ́, grave ̀, dot below ̣). Never omit tone marks — they change meaning.'
      : ''
  }`;

  let userContent: string;
  if (useFewShot && targetLanguage === 'Yoruba') {
    const examples = MENYO_EXAMPLES.map(ex => `[EN]: ${ex.en}\n[YO]: ${ex.yo}`).join('\n\n');
    const numeralSection = hasNumerals(text)
      ? `\nCRITICAL — Yoruba numeral tonal forms (all digits):\n${buildNumeralExamples()}\nUse the exact canonical or frequency form for each numeral. Wrong diacritics on numerals can change the meaning to a different number.\n`
      : '';

    const medicalTermsRef = `
YORUBA MEDICAL TERMS REFERENCE:
Measurements: mg/miligiramu | g/giramu | mcg/mikogiramu | ml/milimita | L/lita | IU/ìwọ̀n ìbílẹ̀
Dosage forms: tablet/tábùlẹ́tì | capsule/kapusulu | sachet/àpò | teaspoon/sibi kékeré | tablespoon/sibi nlá | drops/ìsọ̀nù | syrup/sírọ́ọ̀pù | injection/abẹrẹ | packet/àpò | powder/ìyẹ̀fun
Common drugs (phonetic): amoxicillin/amoxisilin | azithromycin/asitromaisín | doxycycline/doxisaiklin | paracetamol/parasitamọl | ibuprofen/ibuprofẹn | metformin/metfọmin | aspirin/aspiirin | lisinopril/lisinọprílì | metoprolol/metoprolọl | amlodipine/amlodipín | glipizide/glipisaíd | zinc/síńkì | omeprazole/omeprasọl | tramadol/tramadọl | oral rehydration salts/Oral Rehydration Salts (keep as-is)
INTERVAL EXPRESSIONS — critical, use these exact Yoruba forms:
  every 2 hours → gbogbo wákàtí méjì (NOT lẹ́ẹ̀mejì ní wákàtí — that means "twice per hour" which is WRONG)
  every 4 hours → gbogbo wákàtí mẹ́rin
  every 6 hours → gbogbo wákàtí mẹ́fà
  every 8 hours → gbogbo wákàtí mẹ́jọ
  every 12 hours → gbogbo wákàtí méjìlá
  every 24 hours / once daily → lẹ́ẹ̀kan lójoojúmọ́
  "every X hours" always uses "gbogbo wákàtí [number]" — never use lẹ́ẹ̀mX for interval expressions
For any drug not listed: spell it out phonetically — never use brackets.
`;
    userContent = `Here are examples of correctly diacritized English-to-Yoruba medical instruction translations:

${examples}
${medicalTermsRef}${numeralSection}
Now translate the following medication instruction into Yoruba, following the same diacritic standards shown above:

"${text}"`;
  } else {
    userContent = `Translate the following medication instruction into ${targetLanguage}:

"${text}"`;
  }

  return { system, user: userContent };
}
