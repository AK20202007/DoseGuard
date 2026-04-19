import type { SupportedLanguage, LanguageMetadata } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildTranslatePrompt, buildDiacriticCorrectionPrompt } from '@/lib/prompts/translate';
import { selectExamples } from '@/lib/pipeline/exampleSelector';
import type { DiacriticIssue } from '@/lib/pipeline/diacriticValidator';

export async function translateInstruction(
  text: string,
  targetLanguage: SupportedLanguage,
  langMeta: LanguageMetadata,
): Promise<string> {
  if (!text) return '';
  try {
    const client = getClient();
    const selectedExamples = langMeta.usesFewShot ? selectExamples(text) : undefined;
    const { system, user } = buildTranslatePrompt(text, targetLanguage, langMeta.usesFewShot, selectedExamples);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  } catch {
    return '';
  }
}

export async function correctDiacritics(
  translation: string,
  issues: DiacriticIssue[],
): Promise<string> {
  if (!translation || issues.length === 0) return translation;
  try {
    const client = getClient();
    const { system, user } = buildDiacriticCorrectionPrompt(translation, issues);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content[0].type === 'text' ? response.content[0].text.trim() : translation;
  } catch {
    return translation;
  }
}
