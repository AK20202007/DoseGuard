import type { SupportedLanguage, LanguageMetadata } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildTranslatePrompt } from '@/lib/prompts/translate';

export async function translateInstruction(
  text: string,
  targetLanguage: SupportedLanguage,
  langMeta: LanguageMetadata,
): Promise<string> {
  if (!text) return '';
  try {
    const client = getClient();
    const { system, user } = buildTranslatePrompt(text, targetLanguage, langMeta.usesFewShot);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  } catch {
    return '';
  }
}
