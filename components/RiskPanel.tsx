'use client';

import type { AnalysisResult, MedicationFields } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';
import { useLang } from '@/lib/i18nContext';

type Props = {
  finalResult: AnalysisResult | null;
  isLoading: boolean;
};

// Critical fields mirroring stage-1-2 CRITICAL_FIELDS
const CRITICAL_FIELDS: (keyof MedicationFields)[] = [
  'medication_name',
  'dosage_amount',
  'dosage_unit',
  'frequency',
  'warnings',
];

function computeConfidence(result: AnalysisResult): {
  score: number;
  tier: 'verified' | 'partial' | 'review';
  matched: number;
  total: number;
} {
  const src = result.sourceFields;
  // Count critical fields that have a value in the source
  const testable = CRITICAL_FIELDS.filter(f => {
    const v = src[f];
    return v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true);
  });
  const failedFields = new Set(result.driftIssues.map(i => i.field));
  const matched = testable.filter(f => !failedFields.has(f)).length;
  const total = testable.length;
  const score = total > 0 ? Math.round((matched / total) * 100) : 100;
  const tier: 'verified' | 'partial' | 'review' =
    score >= 95 ? 'verified' : score >= 70 ? 'partial' : 'review';
  return { score, tier, matched, total };
}

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

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-white/20 rounded-full h-1.5 mt-1.5">
      <div
        className={`h-1.5 rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${Math.max(value, 2)}%` }}
      />
    </div>
  );
}

export function RiskPanel({ finalResult, isLoading }: Props) {
  const { t } = useLang();

  if (!finalResult && isLoading) return <SkeletonPanel />;
  if (!finalResult) return <EmptyPanel />;

  const rec = RECOMMENDATION_STYLES[finalResult.recommendation];
  const recDescription = getRecommendationDescription(finalResult);
  const isVerified = finalResult.riskLevel === 'low' && finalResult.riskScore === 0;
  const conf = computeConfidence(finalResult);

  const confTierLabel =
    conf.tier === 'verified' ? t('confidenceVerified') :
    conf.tier === 'partial'  ? t('confidencePartial')  :
                               t('confidenceReview');
  const confTierColor =
    conf.tier === 'verified' ? 'text-green-300' :
    conf.tier === 'partial'  ? 'text-amber-300'  :
                               'text-red-300';

  const riskBarColor =
    finalResult.riskLevel === 'low' ? 'bg-green-400' :
    finalResult.riskLevel === 'medium' ? 'bg-amber-400' : 'bg-red-400';

  const confBarColor =
    conf.tier === 'verified' ? 'bg-green-400' :
    conf.tier === 'partial'  ? 'bg-amber-400'  : 'bg-red-400';

  return (
    <div className="space-y-4">

      {/* Verified hero */}
      {isVerified && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <span
            className="material-symbols-outlined text-green-600 flex-shrink-0"
            style={{ fontSize: '32px', fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <div>
            <p className="text-sm font-bold text-green-900">{t('translationVerified')}</p>
            <p className="text-xs text-green-700 leading-relaxed">{t('noDriftDetected')}</p>
          </div>
        </div>
      )}

      {/* Score card */}
      <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm">

        {/* Gradient header — dual metrics */}
        <div className="clinical-gradient px-5 py-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-4 font-label">
            {t('riskAssessment')}
          </p>

          {/* Side-by-side metrics */}
          <div className="grid grid-cols-2 gap-4">
            {/* Drift score */}
            <div>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-4xl font-black">{finalResult.riskScore}</span>
                <span className="text-sm font-bold opacity-50">/100</span>
              </div>
              <p className="text-[10px] text-white/60 font-label uppercase tracking-wider">{t('driftScore')}</p>
              <MetricBar value={finalResult.riskScore} color={riskBarColor} />
            </div>

            {/* Confidence score */}
            <div>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-4xl font-black">{conf.score}</span>
                <span className="text-sm font-bold opacity-50">%</span>
              </div>
              <p className="text-[10px] text-white/60 font-label uppercase tracking-wider">{t('translationConfidence')}</p>
              <MetricBar value={conf.score} color={confBarColor} />
            </div>
          </div>

          {/* Tier badges row */}
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 rounded border border-white/10">
              <span
                className="material-symbols-outlined text-xs flex-shrink-0"
                style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
              >
                {finalResult.riskLevel === 'low' ? 'lock' : finalResult.riskLevel === 'medium' ? 'lock_open' : 'no_encryption'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide font-label leading-tight">
                {finalResult.riskLevel === 'low'
                  ? t('safetyVerifiedLabel')
                  : finalResult.riskLevel === 'medium'
                    ? t('safetyReviewAdvised')
                    : t('safetyReviewRequired')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 rounded border border-white/10">
              <span
                className={`material-symbols-outlined text-xs flex-shrink-0 ${confTierColor}`}
                style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
              >
                {conf.tier === 'verified' ? 'verified' : conf.tier === 'partial' ? 'warning' : 'gpp_bad'}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wide font-label leading-tight ${confTierColor}`}>
                {confTierLabel}
              </span>
            </div>
          </div>

          {/* Field count */}
          <p className="text-[10px] text-white/40 font-label mt-2">
            {conf.matched}/{conf.total} {t('fieldsVerified')}
          </p>
        </div>

        {/* Risk badge below header */}
        <div className="px-5 py-3 border-b border-slate-100">
          <RiskBadge riskLevel={finalResult.riskLevel} score={finalResult.riskScore} size="lg" />
        </div>

        {finalResult.riskExplanation && (
          <div className="px-5 py-3">
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
                {t('translationErrorsFound')}
              </p>
              <p className="text-[10px] text-slate-400 font-label">
                {t('fieldsChangedMeaning')}
              </p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {finalResult.driftIssues.map((issue, i) => {
              const typeLabel =
                issue.type === 'value_changed'    ? 'Number changed' :
                issue.type === 'negation_changed' ? 'Warning reversed' :
                issue.type === 'omitted'          ? 'Missing from translation' :
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
                {t('yorubaAccentMissing')}
              </p>
              <p className="text-[10px] text-slate-400 font-label">
                {t('missingMarkWarning')}
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
    </div>
  );
}
