import type { SupportedLanguage } from '@/lib/types';

export function buildBackTranslatePrompt(
  translation: string,
  sourceLanguage: SupportedLanguage,
): { system: string; user: string } {
  return {
    system: `You are a faithful translator. Back-translate a ${sourceLanguage} medication instruction into English.

CRITICAL RULES:
1. Translate EXACTLY what is written — do not correct errors or improve the text.
2. Do NOT infer or guess what the original English instruction said.
3. If numbers appear unclear or potentially wrong, translate exactly what is written.
4. Preserve the meaning as it appears in the source, even if it seems incomplete or incorrect.
5. If a word has no direct English equivalent, provide a close literal translation.
6. Do NOT add information not in the source text.
7. Return ONLY the English back-translation — no preamble, explanation, or commentary.

This back-translation is used for safety verification. Faithfulness matters more than fluency.`,
    user: `Back-translate this ${sourceLanguage} medication instruction into English exactly as written:

"${translation}"`,
  };
}
