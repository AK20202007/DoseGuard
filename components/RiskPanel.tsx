'use client';

import type { AnalysisResult } from '@/lib/types';
import { TeachBackCard } from '@/components/TeachBackCard';

type Props = { finalResult: AnalysisResult | null; isLoading: boolean };

const REC = {
  safe_to_use: { label: 'Safe to Use', color: 'text-emerald-400', bg: 'bg-emerald-400' },
  use_with_caution: { label: 'Use With Caution', color: 'text-amber-400', bg: 'bg-amber-400' },
  human_review_required: { label: 'Human Review Required', color: 'text-red-400', bg: 'bg-red-400' },
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      {children}
    </div>
  );
}

export function RiskPanel({ finalResult, isLoading }: Props) {
  if (isLoading && !finalResult) {
    return (
      <div className="animate-pulse space-y-4 pt-2">
        {[32, 20, 48, 64, 48].map((h, i) => (
          <div key={i} className="rounded-lg bg-slate-800" style={{ height: h }} />
        ))}
      </div>
    );
  }

  if (!finalResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3 opacity-10">⚕</div>
        <p className="text-slate-500 text-sm">Risk analysis will appear here</p>
      </div>
    );
  }

  const rec = REC[finalResult.recommendation];
  const isVerified = finalResult.riskLevel === 'low' && finalResult.riskScore === 0;
  const scoreColor =
    finalResult.riskLevel === 'low' ? 'bg-emerald-500' :
    finalResult.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div>
      {isVerified && (
        <div className="mb-6 rounded-xl bg-emerald-950/50 border border-emerald-800/60 px-4 py-4 text-center">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-bold text-emerald-400">Translation Verified</p>
          <p className="text-xs text-emerald-600 mt-1 leading-relaxed">All fields verified. Safe for patient use.</p>
        </div>
      )}

      <Section label="Risk Score">
        <div className="mb-3">
          <div className="flex items-end justify-between mb-2">
            <span className={`text-3xl font-bold tabular-nums ${
              finalResult.riskLevel === 'low' ? 'text-emerald-400' :
              finalResult.riskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'
            }`}>{finalResult.riskScore}</span>
            <span className="text-slate-500 text-sm font-medium">/ 100</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${scoreColor}`}
              style={{ width: `${Math.max(finalResult.riskScore, 2)}%` }}
            />
          </div>
        </div>
        {finalResult.riskExplanation && (
          <p className="text-xs text-slate-400 leading-relaxed">{finalResult.riskExplanation}</p>
        )}
      </Section>

      <Section label="Recommendation">
        <div className="flex items-start gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${rec.bg}`} />
          <div>
            <p className={`text-sm font-bold ${rec.color}`}>{rec.label}</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {finalResult.recommendation === 'safe_to_use'
                ? 'No significant semantic drift. Translation appears safe for patient use.'
                : finalResult.recommendation === 'use_with_caution'
                  ? 'Minor drift detected. Review highlighted fields before use.'
                  : 'Significant drift or low-resource language. Clinician review required.'}
            </p>
          </div>
        </div>
      </Section>

      {finalResult.driftIssues.length > 0 && (
        <Section label={`Drift Issues (${finalResult.driftIssues.length})`}>
          <div className="space-y-2">
            {finalResult.driftIssues.map((issue, i) => (
              <div key={i} className={`rounded-lg px-3 py-2.5 border-l-2 text-xs leading-relaxed ${
                issue.severity === 'high'
                  ? 'bg-red-950/40 border-red-500 text-red-200'
                  : issue.severity === 'medium'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-200'
                    : 'bg-yellow-950/40 border-yellow-500 text-yellow-200'
              }`}>
                <div className="font-semibold mb-0.5 capitalize">{issue.field.replace(/_/g, ' ')} · {issue.severity}</div>
                <div className="opacity-80">{issue.explanation}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {finalResult.teachBackQuestion !== null && (
        <Section label="Teach-Back">
          <TeachBackCard question={finalResult.teachBackQuestion} />
        </Section>
      )}
    </div>
  );
}
