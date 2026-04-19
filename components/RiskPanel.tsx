'use client';

import type { AnalysisResult } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';
import { TeachBackCard } from '@/components/TeachBackCard';

type Props = {
  finalResult: AnalysisResult | null;
  isLoading: boolean;
};

const RECOMMENDATION_CONFIG = {
  safe_to_use: {
    label: 'Safe to Use',
    description:
      'No significant semantic drift detected. Translation appears safe for patient use.',
    icon: '✓',
    styles: 'bg-green-50 border-green-300 text-green-900',
    iconColor: 'text-green-600',
  },
  use_with_caution: {
    label: 'Use With Caution',
    description:
      'Minor drift detected. Review highlighted fields before patient use.',
    icon: '⚠',
    styles: 'bg-amber-50 border-amber-300 text-amber-900',
    iconColor: 'text-amber-600',
  },
  human_review_required: {
    label: 'Human Review Required',
    description:
      'Significant semantic drift or low-resource language detected. A clinician or qualified interpreter must review this translation before patient use.',
    icon: '⛔',
    styles: 'bg-red-50 border-red-300 text-red-900',
    iconColor: 'text-red-600',
  },
};

function SkeletonPanel() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="animate-pulse space-y-4">
        <div className="h-3 bg-slate-200 rounded w-1/2" />
        <div className="h-8 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-200 rounded w-full" />
        <div className="h-2.5 bg-slate-100 rounded-full" />
        <div className="h-16 bg-slate-100 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
      <div className="text-slate-200 text-4xl mb-3">⚕</div>
      <p className="text-sm text-slate-400">Risk analysis will appear here</p>
    </div>
  );
}

export function RiskPanel({ finalResult, isLoading }: Props) {
  if (!finalResult && isLoading) return <SkeletonPanel />;
  if (!finalResult) return <EmptyPanel />;

  const rec = RECOMMENDATION_CONFIG[finalResult.recommendation];

  return (
    <div className="space-y-4">
      {/* Risk Score Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Risk Analysis
        </h2>

        <RiskBadge riskLevel={finalResult.riskLevel} score={finalResult.riskScore} size="lg" />

        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Drift Score</span>
            <span className="font-mono">{finalResult.riskScore} / 100</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-700 ease-out ${
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

        {finalResult.riskExplanation && (
          <p className="text-xs text-slate-600 leading-relaxed">{finalResult.riskExplanation}</p>
        )}
      </div>

      {/* Language Quality Warning */}
      {finalResult.languageQualityWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              {finalResult.languageQualityWarning}
            </p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className={`rounded-lg border p-4 ${rec.styles}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-base ${rec.iconColor}`}>{rec.icon}</span>
          <span className="text-sm font-bold">{rec.label}</span>
        </div>
        <p className="text-xs leading-relaxed">{rec.description}</p>
      </div>

      {/* Drift Issues */}
      {finalResult.driftIssues.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Drift Issues ({finalResult.driftIssues.length})
          </h3>
          <div className="space-y-2">
            {finalResult.driftIssues.map((issue, i) => (
              <div
                key={i}
                className={`rounded border p-2.5 text-xs leading-relaxed ${
                  issue.severity === 'high'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : issue.severity === 'medium'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="font-bold uppercase text-xs">{issue.severity}</span>
                  <span className="opacity-50">·</span>
                  <span className="font-mono">{issue.field.replace(/_/g, ' ')}</span>
                  <span className="opacity-50">·</span>
                  <span className="capitalize">{issue.type.replace(/_/g, ' ')}</span>
                </div>
                <p>{issue.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teach-Back */}
      {finalResult.teachBackQuestion !== null && (
        <TeachBackCard question={finalResult.teachBackQuestion} />
      )}
    </div>
  );
}
