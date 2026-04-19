import { NextRequest } from 'next/server';
import { getClient } from '@/lib/claude';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== 'string') {
      return Response.json({ name: null });
    }

    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      system: `Extract only the medication/drug name from the text. Return a single lowercase word (the generic or brand name). If no medication name is present, return the word null. No punctuation, no explanation.`,
      messages: [{ role: 'user', content: text.slice(0, 1000) }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : '';
    const name = raw === 'null' || raw === '' ? null : raw.split(/\s+/)[0].replace(/[^a-z-]/g, '');

    return Response.json({ name: name || null });
  } catch {
    return Response.json({ name: null });
  }
}
