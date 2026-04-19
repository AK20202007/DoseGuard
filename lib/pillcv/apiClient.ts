import type { CVResult } from '@/lib/cv/scorer';
import type { ResolvedPrescription } from '@/lib/dailymed/types';
import type { VlmBackupRequestPayload, VlmBackupResult } from '@/lib/pillcv/types';

export interface BackupGateOptions {
  scoreThreshold: number;
  colorConfidenceThreshold: number;
  shapeConfidenceThreshold: number;
  imprintConfidenceThreshold: number;
}

const DEFAULT_BACKUP_GATE_OPTIONS: BackupGateOptions = {
  scoreThreshold: 0.72,
  colorConfidenceThreshold: 0.78,
  shapeConfidenceThreshold: 0.72,
  imprintConfidenceThreshold: 0.45,
};

export function shouldRunVlmBackup(
  cv: CVResult,
  colorConfidence: number,
  shapeConfidence: number,
  imprintText: string,
  imprintConfidence: number,
  hasPrescriptionImprint: boolean,
  options?: Partial<BackupGateOptions>,
): boolean {
  const thresholds = { ...DEFAULT_BACKUP_GATE_OPTIONS, ...options };
  if (cv.hardStop) return true;
  if (cv.overallScore < thresholds.scoreThreshold) return true;
  if (colorConfidence < thresholds.colorConfidenceThreshold) return true;
  if (shapeConfidence < thresholds.shapeConfidenceThreshold) return true;
  if (hasPrescriptionImprint && (imprintText.trim().length === 0 || imprintConfidence < thresholds.imprintConfidenceThreshold)) return true;
  return false;
}

export async function fetchPrescriptionByDrugName(
  drugName: string,
  ndc?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedPrescription> {
  const trimmed = drugName.trim();
  if (!trimmed) {
    throw new Error('Enter a prescribed drug name first.');
  }

  const query = new URLSearchParams({ drugName: trimmed });
  if (ndc) query.set('ndc', ndc);

  const res = await fetchImpl(`/api/dailymed/prescription?${query.toString()}`, { method: 'GET' });
  const payload = (await res.json()) as { prescription?: ResolvedPrescription; error?: string };
  if (!res.ok || !payload.prescription) {
    throw new Error(payload.error ?? 'Unable to load DailyMed prescription attributes.');
  }
  return payload.prescription;
}

export async function requestVlmBackup(
  payload: VlmBackupRequestPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<VlmBackupResult> {
  try {
    const res = await fetchImpl('/api/vlm/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        triggered: true,
        available: false,
        verdict: 'uncertain',
        confidence: 0,
        rationale: 'VLM backup request failed.',
        extracted: { color: null, shape: null, imprint: null },
        model: null,
        error: `HTTP ${res.status}`,
      };
    }

    return (await res.json()) as VlmBackupResult;
  } catch (error) {
    return {
      triggered: true,
      available: false,
      verdict: 'uncertain',
      confidence: 0,
      rationale: 'VLM backup request error.',
      extracted: { color: null, shape: null, imprint: null },
      model: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
