import type { ColorDebugResult, ColorResult, OvalMask } from '@/lib/cv/colorExtractor';
import type { ColorSignature } from '@/lib/cv/colorSignature';
import type { ShapeDebugResult, ShapeResult, OutlineDetectionResult } from '@/lib/cv/shapeDetector';
import type { CVResult } from '@/lib/cv/scorer';
import type { PrescriptionAttributes, ResolvedPrescription } from '@/lib/dailymed/types';

export type VariantSelectionMode = 'auto' | 'manual';
export type VlmVerdict = 'match' | 'non_match' | 'uncertain';

export interface VariantOption {
  key: string;
  label: string;
  attrs: PrescriptionAttributes;
}

export interface ImprintLikeResult {
  text: string;
  confidence: number;
}

export interface ScoreVariantsInput {
  colorResult: ColorResult;
  shapeResult: ShapeResult;
  imprintResult: ImprintLikeResult;
  prescription: PrescriptionAttributes | null;
  prescriptionMeta?: ResolvedPrescription | null;
  variantSelectionKey?: string;
}

export interface ScoreVariantsOutput {
  result: CVResult;
  label: string;
  mode: VariantSelectionMode;
  options: VariantOption[];
  selectedKey: string;
}

export interface AnalyzePillCandidateInput {
  analyzedImage: ImageData;
  outline: OutlineDetectionResult;
  prescription: PrescriptionAttributes;
  prescriptionMeta?: ResolvedPrescription | null;
  variantSelectionKey?: string;
  enableImprint?: boolean;
}

export interface AnalyzePillCandidateOutput {
  mask: OvalMask;
  conformingMaskBitmap: Uint8Array;
  colorDebug: ColorDebugResult;
  colorSignature: ColorSignature;
  shapeDebug: ShapeDebugResult;
  imprintResult: ImprintLikeResult;
  score: ScoreVariantsOutput;
}

export interface VlmBackupResult {
  triggered: boolean;
  available: boolean;
  verdict: VlmVerdict;
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

export interface VlmBackupRequestPayload {
  imageDataUrl: string;
  prescription: PrescriptionAttributes;
  cv: {
    overallScore: number;
    color: { primary: string; secondary: string | null; confidence: number };
    shape: { label: string; confidence: number };
    imprint: { text: string; confidence: number };
  };
}
