import type { SupportedLanguage } from '@/lib/types';
import { MENYO_EXAMPLES } from '@/data/menyo-examples';

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
7. If a medical term has no equivalent in ${targetLanguage}, keep the English term in brackets: [aspirin].
8. Use simple, clear language appropriate for a patient with limited health literacy.
9. Return ONLY the translated text — no preamble, explanation, or commentary.${
    targetLanguage === 'Yoruba'
      ? '\n10. ALL Yoruba words MUST carry correct tonal diacritics (acute ́, grave ̀, dot below ̣). Never omit tone marks — they change meaning.'
      : ''
  }`;

  let userContent: string;
  if (useFewShot && targetLanguage === 'Yoruba') {
    const examples = MENYO_EXAMPLES.map(ex => `[EN]: ${ex.en}\n[YO]: ${ex.yo}`).join('\n\n');
    userContent = `Here are examples of correctly diacritized English-to-Yoruba medical instruction translations:

${examples}

Now translate the following medication instruction into Yoruba, following the same diacritic standards shown above:

"${text}"`;
  } else {
    userContent = `Translate the following medication instruction into ${targetLanguage}:

"${text}"`;
  }

  return { system, user: userContent };
}
