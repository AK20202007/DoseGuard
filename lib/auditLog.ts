import type { AuditLogEntry, AnalysisResult, SupportedLanguage } from '@/lib/types';

const MAX_LOG_ENTRIES = 10;
const log: AuditLogEntry[] = [];

export function appendAuditLog(result: AnalysisResult): void {
  const entry: AuditLogEntry = {
    timestamp: result.timestamp,
    instructionPreview:
      result.originalInstruction.length > 60
        ? result.originalInstruction.slice(0, 60) + '…'
        : result.originalInstruction,
    targetLanguage: result.targetLanguage as SupportedLanguage,
    riskLevel: result.riskLevel,
    recommendation: result.recommendation,
    riskScore: result.riskScore,
  };
  log.unshift(entry);
  if (log.length > MAX_LOG_ENTRIES) log.splice(MAX_LOG_ENTRIES);
}

export function getAuditLog(): AuditLogEntry[] {
  return [...log];
}
