'use client';

import type { AnalysisResult } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';
import { TeachBackCard } from '@/components/TeachBackCard';
import { PillScanCard } from '@/components/PillScanCard';

type Props = {
  finalResult: AnalysisResult | null;
  isLoading: boolean;
};

const RECOMMENDATION_STYLES = {
  safe_to_use:           { label: 'Safe to Use',           icon: 'verified',        bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-900', iconColor: 'text-green-600' },
  use_with_caution:      { label: 'Use With Caution',      icon: 'warning',         bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-900', iconColor: 'text-amber-500' },
  human_review_required: { label: 'Human Review Required', icon: 'gpp_bad',         bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-900',   iconColor: 'text-red-600'   },
};

function getRecommendationDescription(result: AnalysisResult): string {
  const hasDrift = result.driftIssues.length > 0 || (result.diacriticIssues?.length ?? 0) > 0;
  const isLowResource = result.languageQualityWarning !== null;

  switch (result.recommendation) {
    case 'safe_to_use':
      return 'No drift or tone mark issues detected. Translation appears safe for patient use.';
    case 'use_with_caution':
      if (!hasDrift && isLowResource)
        return `No errors were found, but ${result.targetLanguage} is a low-resource language with limited machine translation quality. Have a qualified interpreter review before giving to the patient.`;
      if (hasDrift && isLowResource)
        return `Errors were found and ${result.targetLanguage} is a low-resource language. Review all highlighted fields and have a qualified interpreter confirm the translation.`;
      return 'Minor differences found between the original and re-read versions. Review the highlighted fields below before patient use.';
    case 'human_review_required':
      if (!hasDrift && isLowResource)
        return `No drift was detected, but ${result.targetLanguage} is a low-resource language where machine translation is unreliable. A clinician or certified interpreter must review this before patient use.`;
      return 'Significant differences were found between the original and the re-read version. A clinician or certified interpreter must review this translation before it is given to the patient.';
  }
}

function SkeletonPanel() {
  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden">
      <div className="bg-primary px-6 py-5">
        <div className="animate-pulse space-y-2">
          <div className="h-2 bg-white/20 rounded w-1/3" />
          <div className="h-10 bg-white/20 rounded w-1/2" />
        </div>
      </div>
      <div className="p-5 animate-pulse space-y-3">
        <div className="h-6 bg-slate-100 rounded w-2/3" />
        <div className="h-2.5 bg-slate-100 rounded-full" />
        <div className="h-16 bg-slate-100 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm p-8 text-center border border-slate-100">
      <span
        className="material-symbols-outlined text-slate-200 block mb-3"
        style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}
      >
        health_and_safety
      </span>
      <p className="text-sm text-on-surface-variant">Risk analysis will appear here</p>
    </div>
  );
}

export function RiskPanel({ finalResult, isLoading }: Props) {
  if (!finalResult && isLoading) return <SkeletonPanel />;
  if (!finalResult) return <EmptyPanel />;

  const rec = RECOMMENDATION_STYLES[finalResult.recommendation];
  const recDescription = getRecommendationDescription(finalResult);
  const isVerified = finalResult.riskLevel === 'low' && finalResult.riskScore === 0;

  return (
    <div className="space-y-4">

      {/* Verified hero — only when perfectly clean */}
      {isVerified && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <span
            className="material-symbols-outlined text-green-600 flex-shrink-0"
            style={{ fontSize: '32px', fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <div>
            <p className="text-sm font-bold text-green-900">Translation Verified</p>
            <p className="text-xs text-green-700 leading-relaxed">No drift or tone mark issues detected.</p>
          </div>
        </div>
      )}

      {/* Score Card */}
      <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm">
        {/* Blue gradient header */}
        <div className="clinical-gradient px-6 py-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-3 font-label">
            Risk Assessment
          </p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-5xl font-black">{finalResult.riskScore}</span>
            <span className="text-lg font-bold opacity-60">/ 100</span>
          </div>
          <p className="text-xs text-white/70 font-label">Drift Score</p>
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-white/10 rounded border border-white/10">
            <span
              className="material-symbols-outlined text-sm flex-shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {finalResult.riskLevel === 'low' ? 'lock' : finalResult.riskLevel === 'medium' ? 'lock_open' : 'no_encryption'}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider font-label">
              {finalResult.riskLevel === 'low' ? 'Safety: Verified' : finalResult.riskLevel === 'medium' ? 'Safety: Review Advised' : 'Safety: Review Required'}
            </span>
          </div>
        </div>

        {/* Risk badge + progress bar */}
        <div className="px-6 py-4 border-b border-slate-100 space-y-3">
          <RiskBadge riskLevel={finalResult.riskLevel} score={finalResult.riskScore} size="lg" />
          <div>
            <div className="flex justify-between text-[10px] text-on-surface-variant font-label mb-1.5">
              <span>Drift Score</span>
              <span className="font-mono font-bold">{finalResult.riskScore} / 100</span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-700 ease-out ${
                  finalResult.riskLevel === 'low'
                    ? 'bg-green-500'
                    : finalResult.riskLevel === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${Math.max(finalResult.riskScore, 2)}%` }}
              />
            </div>
          </div>
        </div>

        {finalResult.riskExplanation && (
          <div className="px-6 py-4 border-b border-slate-50">
            <p className="text-xs text-on-surface-variant leading-relaxed">{finalResult.riskExplanation}</p>
          </div>
        )}
      </div>

      {/* Language quality warning */}
      {finalResult.languageQualityWarning && (
        <div className="bg-tertiary-fixed rounded-lg p-4 border-l-4 border-tertiary">
          <div className="flex items-start gap-2">
            <span
              className="material-symbols-outlined text-on-tertiary-fixed-variant flex-shrink-0 mt-0.5"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <p className="text-xs text-on-tertiary-fixed-variant leading-relaxed">
              {finalResult.languageQualityWarning}
            </p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className={`rounded-lg border p-4 ${rec.bg} ${rec.border}`}>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`material-symbols-outlined ${rec.iconColor}`}
            style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
          >
            {rec.icon}
          </span>
          <span className={`text-sm font-bold ${rec.text}`}>{rec.label}</span>
        </div>
        <p className={`text-xs leading-relaxed ${rec.text}`}>{recDescription}</p>
      </div>

      {/* Drift issues */}
      {finalResult.driftIssues.length > 0 && (
        <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-red-500"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
            >
              report
            </span>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
                Translation Errors Found
              </p>
              <p className="text-[10px] text-slate-400 font-label">
                These fields changed meaning when re-read in English
              </p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {finalResult.driftIssues.map((issue, i) => {
              const typeLabel =
                issue.type === 'value_changed'     ? 'Number changed' :
                issue.type === 'negation_changed'  ? 'Warning reversed' :
                issue.type === 'omitted'           ? 'Missing from translation' :
                'Meaning changed';
              const sev = issue.severity;
              return (
                <div
                  key={i}
                  className={`rounded border-l-4 p-3 text-xs leading-relaxed ${
                    sev === 'high'
                      ? 'bg-red-50 border-red-500 text-red-900'
                      : sev === 'medium'
                        ? 'bg-amber-50 border-amber-400 text-amber-900'
                        : 'bg-yellow-50 border-yellow-400 text-yellow-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap font-label">
                    <span className="font-bold text-xs uppercase tracking-wide">{sev}</span>
                    <span className="opacity-40">·</span>
                    <span className="capitalize font-medium">{issue.field.replace(/_/g, ' ')}</span>
                    <span className="opacity-40">·</span>
                    <span>{typeLabel}</span>
                  </div>
                  <p className="font-body">{issue.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diacritic issues */}
      {finalResult.diacriticIssues && finalResult.diacriticIssues.length > 0 && (
        <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-amber-500"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
            >
              spellcheck
            </span>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
                Yoruba Accent Marks Missing
              </p>
              <p className="text-[10px] text-slate-400 font-label">
                A missing mark can silently change a number or word meaning
              </p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {finalResult.diacriticIssues.map((issue, i) => (
              <div
                key={i}
                className={`rounded border-l-4 p-3 text-xs leading-relaxed ${
                  issue.severity === 'high'
                    ? 'bg-red-50 border-red-500 text-red-900'
                    : 'bg-amber-50 border-amber-400 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 flex-wrap font-label">
                  <span className="font-bold uppercase text-xs tracking-wide">{issue.severity}</span>
                  <span className="opacity-50">·</span>
                  <span className="capitalize">{issue.category}</span>
                  <span className="opacity-50">·</span>
                  <span className="font-mono">{issue.bare}</span>
                  <span className="opacity-40">→</span>
                  <span className="font-mono font-semibold">{issue.canonical}</span>
                  <span className="opacity-60 font-normal">({issue.meaning})</span>
                </div>
                {issue.confusableWith && (
                  <p className="text-xs opacity-80 font-body">
                    Could be misread as{' '}
                    <span className="font-mono">{issue.confusableWith}</span>{' '}
                    ({issue.confusableMeaning})
                  </p>
                )}
                <p className="text-xs opacity-60 mt-0.5 font-mono truncate">…{issue.context}…</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teach-back */}
      {finalResult.teachBackQuestion !== null && (
        <TeachBackCard question={finalResult.teachBackQuestion} />
      )}

      {/* Pill Scanner safeguard */}
      <PillScanCard initialDrugName={finalResult.sourceFields.medication_name} />
    </div>
  );
}
