import type { SupportedLanguage, RiskLevel } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildTeachBackPrompt } from '@/lib/prompts/teachBack';

export async function generateTeachBack(
  originalInstruction: string,
  targetLanguage: SupportedLanguage,
  riskLevel: RiskLevel,
): Promise<string | null> {
  try {
    const client = getClient();
    const { system, user } = buildTeachBackPrompt(originalInstruction, targetLanguage, riskLevel);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : null;
    return text || null;
  } catch {
    return null;
  }
}
