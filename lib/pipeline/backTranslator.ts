import type { SupportedLanguage } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildBackTranslatePrompt } from '@/lib/prompts/backTranslate';

export async function backTranslateInstruction(
  translation: string,
  sourceLanguage: SupportedLanguage,
): Promise<string> {
  if (!translation) return '';
  try {
    const client = getClient();
    const { system, user } = buildBackTranslatePrompt(translation, sourceLanguage);
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
