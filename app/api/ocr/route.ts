import { NextRequest } from 'next/server';
import { getClient } from '@/lib/claude';

export const runtime = 'nodejs';

const SYSTEM = `You are a medical document OCR specialist. Extract the exact medication instruction text from the image provided.

Rules:
- Return ONLY the raw instruction text exactly as it appears — do not interpret, translate, or rewrite.
- If the image contains multiple instructions, extract all of them separated by newlines.
- Preserve all numbers, units, abbreviations, and punctuation exactly as written.
- If the image is not a medication label or prescription, return the plain text: NOT_MEDICAL
- Do not add any preamble, commentary, or explanation.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return Response.json({ error: 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.' }, { status: 400 });
    }

    const maxBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxBytes) {
      return Response.json({ error: 'Image too large. Maximum size is 5 MB.' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Extract the medication instruction text from this image.',
            },
          ],
        },
      ],
    });

    const extracted = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    if (extracted === 'NOT_MEDICAL') {
      return Response.json({ error: 'Image does not appear to contain a medication instruction.' }, { status: 422 });
    }

    return Response.json({ text: extracted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
