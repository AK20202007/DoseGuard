import { NextResponse } from 'next/server';
import { DailyMedLookupError, resolvePrescriptionFromDailyMed } from '@/lib/dailymed/resolvePrescription';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const drugName = searchParams.get('drugName') ?? '';
  const ndc = searchParams.get('ndc');

  if (!drugName.trim()) {
    return NextResponse.json({ error: 'Missing required query parameter: drugName' }, { status: 400 });
  }

  try {
    const prescription = await resolvePrescriptionFromDailyMed(drugName, { ndc });
    return NextResponse.json({ prescription });
  } catch (error) {
    const message = error instanceof DailyMedLookupError ? error.message : 'Failed to resolve prescription from DailyMed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
