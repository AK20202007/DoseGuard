import type { SupportedLanguage } from '@/lib/types';

const YORUBA_REFERENCE = `
YORUBA NUMERAL REFERENCE — diacritics are critical, read carefully:
  Standalone: ọ̀kan=1 | èjì=2 | ẹ̀ta=3 | ẹ̀rin=4 | àrún=5 | ẹ̀fà=6 | èje=7 | ẹ̀jọ=8 | ẹ̀sàn=9 | ẹ̀wá=10
  Modifier forms (used with nouns like "days"): méjì=2 | mẹ́ta=3 | mẹ́rin=4 | márùn=5 | mẹ́fà=6 | méje=7 | mẹ́jọ=8 | mẹ́sàn=9 | mẹ́wá=10
  Frequency forms: lẹ́ẹ̀kan=once | lẹ́ẹ̀mejì=twice | lẹ́ẹ̀mẹ́ta=3× | lẹ́ẹ̀mẹ́rin=4× | lẹ́ẹ̀márùn=5× | lẹ́ẹ̀mẹ́fà=6×
  CRITICAL PAIRS — do NOT confuse: méje(7) vs mẹ́jọ(8) | ẹ̀ta(3) vs ẹ̀fà(6) | èjì(2) vs ẹ̀rin(4) | àrún(5) vs ẹ̀fà(6)

YORUBA MEDICAL TERMS — back-translate these to their English equivalents:
  miligiramu=milligrams | giramu=grams | mikogiramu=micrograms | milimita=milliliters | lita=liters | ìwọ̀n ìbílẹ̀=international units (IU)
  tábùlẹ́tì=tablet | kapusulu=capsule | sibi kékeré=teaspoon | sibi nlá=tablespoon | ìsọ̀nù=drops | sírọ́ọ̀pù=syrup | abẹrẹ=injection | kírímù=cream
  Antibiotics: amoxisilin=amoxicillin | asitromaisín=azithromycin | doxisaiklin=doxycycline | metronidasoolu=metronidazole | siprofloasasin=ciprofloxacin | penisilin=penicillin | klaritromaisín=clarithromycin
  Heart/BP: lisinọprílì=lisinopril | metoprolọl=metoprolol | amlodipín=amlodipine | atenolọl=atenolol | losatan=losartan | furosemaíd=furosemide
  Diabetes: metfọmin=metformin | glipisaíd=glipizide | ínsiulín=insulin | glibenklẹmáíd=glibenclamide
  Pain/Fever: parasitamọl=paracetamol | ibuprofẹn=ibuprofen | aspiirin=aspirin | daiklofinẹk=diclofenac | tramadọl=tramadol | kodín=codeine
  Other: síńkì=zinc | omeprasọl=omeprazole | salbutamọl=salbutamol | prednisọlọn=prednisolone | flukonasọl=fluconazole | asaiklovír=acyclovir
  For any other phonetic Yoruba drug name: recognize it and back-translate to standard English drug name.`;

export function buildBackTranslatePrompt(
  translation: string,
  sourceLanguage: SupportedLanguage,
): { system: string; user: string } {
  const numeralNote = sourceLanguage === 'Yoruba' ? YORUBA_REFERENCE : '';

  return {
    system: `You are a faithful translator. Back-translate a ${sourceLanguage} medication instruction into English.

CRITICAL RULES:
1. Translate EXACTLY what is written — do not correct errors or improve the text.
2. Do NOT infer or guess what the original English instruction said.
3. Numbers are safety-critical — translate the exact numeral you see, not what you expect.
4. Preserve the meaning as it appears in the source, even if it seems incomplete or incorrect.
5. If a word has no direct English equivalent, provide a close literal translation.
6. Do NOT add information not in the source text.
7. Return ONLY the English back-translation — no preamble, explanation, or commentary.
${numeralNote}
This back-translation is used for safety verification. Faithfulness matters more than fluency.`,
    user: `Back-translate this ${sourceLanguage} medication instruction into English exactly as written:

"${translation}"`,
  };
}
