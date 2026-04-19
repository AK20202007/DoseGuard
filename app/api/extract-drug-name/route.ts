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
      system: `Extract only the medication/drug name from the text. Return the brand name exactly as written if a brand name is present — do NOT substitute or add the generic name. Return a single lowercase word with no trademark symbols, no punctuation, no explanation. If no medication name is present, return the word null.`,
      messages: [{ role: 'user', content: text.slice(0, 1000) }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : '';
    const cleaned = raw.replace(/\(.*?\)/g, '').replace(/[™®©℠]/g, '').trim();
    const name = cleaned === 'null' || cleaned === '' ? null : cleaned.split(/\s+/)[0].replace(/[^a-z-]/g, '');

    return Response.json({ name: name || null });
  } catch {
    return Response.json({ name: null });
  }
}
