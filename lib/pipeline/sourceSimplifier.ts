import type { SimplificationResult } from '@/lib/types';
import { getClient } from '@/lib/claude';
import { buildSimplifyPrompt } from '@/lib/prompts/simplify';

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1];
  const bare = text.match(/\{[\s\S]*\}/);
  return bare ? bare[0] : text;
}

export async function simplifySource(instruction: string): Promise<SimplificationResult> {
  try {
    const client = getClient();
    const { system, user } = buildSimplifyPrompt(instruction);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(extractJSON(text));
    return {
      rewritten: parsed.rewritten ?? null,
      ambiguity_flags: Array.isArray(parsed.ambiguity_flags) ? parsed.ambiguity_flags : [],
      is_ambiguous: Boolean(parsed.is_ambiguous),
    };
  } catch {
    return { rewritten: null, ambiguity_flags: [], is_ambiguous: false };
  }
}
