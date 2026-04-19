import { NextResponse } from 'next/server';
import type { PrescriptionAttributes } from '@/lib/dailymed/types';

export const runtime = 'nodejs';

type BackupVerdict = 'match' | 'non_match' | 'uncertain';

interface BackupRequest {
  imageDataUrl: string;
  prescription: PrescriptionAttributes;
  cv: {
    overallScore: number;
    color: { primary: string; secondary: string | null; confidence: number };
    shape: { label: string; confidence: number };
    imprint: { text: string; confidence: number };
  };
}

interface BackupResponse {
  triggered: boolean;
  available: boolean;
  verdict: BackupVerdict;
  confidence: number;
  rationale: string;
  extracted: {
    color: string | null;
    shape: string | null;
    imprint: string | null;
  };
  model: string | null;
  error: string | null;
}

function fallbackResponse(error: string, model: string | null): BackupResponse {
  return {
    triggered: true,
    available: false,
    verdict: 'uncertain',
    confidence: 0,
    rationale: 'VLM backup unavailable.',
    extracted: {
      color: null,
      shape: null,
      imprint: null,
    },
    model,
    error,
  };
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;

  if (typeof p.output_text === 'string') return p.output_text;

  const output = Array.isArray(p.output) ? p.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partObj = part as Record<string, unknown>;
      if (typeof partObj.text === 'string') return partObj.text;
      if (typeof partObj.output_text === 'string') return partObj.output_text;
    }
  }
  return '';
}

function parseVlmJson(text: string): Partial<BackupResponse> | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<BackupResponse>;
  } catch {
    return null;
  }
}

function normalizeBackupResponse(parsed: Partial<BackupResponse>, model: string): BackupResponse {
  const verdict = parsed.verdict;
  const normalizedVerdict: BackupVerdict =
    verdict === 'match' || verdict === 'non_match' || verdict === 'uncertain' ? verdict : 'uncertain';

  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const extracted = (parsed.extracted ?? {}) as Record<string, unknown>;

  return {
    triggered: true,
    available: true,
    verdict: normalizedVerdict,
    confidence,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    extracted: {
      color: typeof extracted.color === 'string' ? extracted.color : null,
      shape: typeof extracted.shape === 'string' ? extracted.shape : null,
      imprint: typeof extracted.imprint === 'string' ? extracted.imprint : null,
    },
    model,
    error: null,
  };
}

export async function POST(request: Request) {
  let payload: BackupRequest;

  try {
    payload = (await request.json()) as BackupRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!payload?.imageDataUrl || !payload?.prescription || !payload?.cv) {
    return NextResponse.json({ error: 'Missing required fields: imageDataUrl, prescription, cv.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VLM_MODEL ?? 'gpt-4.1-mini';

  if (!apiKey) {
    return NextResponse.json(fallbackResponse('OPENAI_API_KEY is not configured.', model), { status: 200 });
  }

  const systemPrompt =
    'You are a pharmacy safety visual verifier. Analyze the pill image and compare with expected prescription attributes. ' +
    'Return strict JSON only with keys: verdict, confidence, rationale, extracted. ' +
    'verdict must be one of match|non_match|uncertain. confidence is 0..1. ' +
    'extracted object must include color, shape, imprint strings (or null).';

  const userPrompt =
    `Expected prescription: ${JSON.stringify(payload.prescription)}\n` +
    `CV preliminary result: ${JSON.stringify(payload.cv)}\n` +
    'Assess whether the image likely matches the expected pill. Prefer conservative uncertainty if imprint is unreadable.';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: userPrompt },
              { type: 'input_image', image_url: payload.imageDataUrl, detail: 'high' },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
        max_output_tokens: 400,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        fallbackResponse(`VLM request failed (${response.status}): ${body.slice(0, 300)}`, model),
        { status: 200 },
      );
    }

    const responsePayload = (await response.json()) as unknown;
    const outputText = extractOutputText(responsePayload);
    const parsed = parseVlmJson(outputText);

    if (!parsed) {
      return NextResponse.json(
        fallbackResponse('VLM response was not valid JSON.', model),
        { status: 200 },
      );
    }

    return NextResponse.json(normalizeBackupResponse(parsed, model), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(fallbackResponse(`VLM request error: ${message}`, model), { status: 200 });
  }
}
