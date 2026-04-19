'use client';

import type { AnalysisResult, PipelineStep, StreamEvent, SimplificationResult } from '@/lib/types';
import { StepProgress } from '@/components/StepProgress';
import { FieldComparisonTable } from '@/components/FieldComparisonTable';
import { TonalRailCard } from '@/components/TonalRailCard';

type Props = {
  steps: Map<PipelineStep, StreamEvent>;
  finalResult: AnalysisResult | null;
  isLoading: boolean;
};

function Section({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="mb-6">
      <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${accent ?? 'text-slate-500'}`}>{label}</p>
      {children}
    </div>
  );
}

function TextBox({ content, mono, dim }: { content: string; mono?: boolean; dim?: boolean }) {
  return (
    <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed border ${
      dim
        ? 'bg-slate-800/50 border-slate-700/50 text-slate-400'
        : 'bg-slate-800 border-slate-700 text-slate-100'
    } ${mono ? 'font-mono text-xs' : ''}`}>
      {content || <span className="text-slate-600 italic">—</span>}
    </div>
  );
}

function VerifiedBanner() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 px-4 py-3 mb-6">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <div>
        <p className="text-xs font-semibold text-emerald-400">Semantic Integrity Verified</p>
        <p className="text-xs text-emerald-600 mt-0.5">No drift detected between source and back-translation</p>
      </div>
    </div>
  );
}

export function PipelinePanel({ steps, finalResult, isLoading }: Props) {
  const simplifyResult = steps.get('simplify')?.result as SimplificationResult | undefined;
  const showProgress = isLoading || (steps.size > 0 && !finalResult);

  if (!showProgress && !finalResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center py-20">
        <div className="text-5xl mb-4 opacity-10">⇄</div>
        <p className="text-slate-500 text-sm font-medium">Enter an instruction and click Analyze</p>
        <p className="text-slate-600 text-xs mt-1">The translation pipeline will stream here</p>
      </div>
    );
  }

  return (
    <div>
      {showProgress && <StepProgress steps={steps} isLoading={isLoading} />}

      {finalResult && (
        <>
          <Section label="Original Source">
            <TextBox content={finalResult.originalInstruction} dim />
          </Section>

          {simplifyResult?.rewritten && (
            <Section label="Simplified Source" accent="text-blue-400">
              <TextBox content={simplifyResult.rewritten} />
            </Section>
          )}

          <Section label={`Translation → ${finalResult.targetLanguage}`}>
            <TextBox content={finalResult.translation} mono />
          </Section>

          <Section label="Back-Translation → English" accent="text-emerald-500">
            <TextBox content={finalResult.backTranslation} />
          </Section>

          {finalResult.tonalRailResult && (
            <div className="mb-6">
              <TonalRailCard result={finalResult.tonalRailResult} />
            </div>
          )}

          {finalResult.driftIssues.length === 0 && <VerifiedBanner />}

          <Section label="Field Comparison">
            <FieldComparisonTable
              sourceFields={finalResult.sourceFields}
              backTranslatedFields={finalResult.backTranslatedFields}
              driftIssues={finalResult.driftIssues}
            />
          </Section>
        </>
      )}
    </div>
  );
}
