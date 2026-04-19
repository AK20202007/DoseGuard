export { analyzePillCandidate } from '@/lib/pillcv/analysis';
export { buildVariantOptions, scoreAgainstPrescriptionVariants } from '@/lib/pillcv/variantScoring';
export { fetchPrescriptionByDrugName, requestVlmBackup, shouldRunVlmBackup } from '@/lib/pillcv/apiClient';
export type {
  AnalyzePillCandidateInput,
  AnalyzePillCandidateOutput,
  ImprintLikeResult,
  ScoreVariantsInput,
  ScoreVariantsOutput,
  VariantOption,
  VariantSelectionMode,
  VlmBackupRequestPayload,
  VlmBackupResult,
  VlmVerdict,
} from '@/lib/pillcv/types';
export type { BackupGateOptions } from '@/lib/pillcv/apiClient';
