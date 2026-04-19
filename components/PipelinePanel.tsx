'use client';

import type { AnalysisResult, PipelineStep, StreamEvent, SimplificationResult } from '@/lib/types';
import { StepProgress } from '@/components/StepProgress';
import { FieldComparisonTable } from '@/components/FieldComparisonTable';

type Props = {
  steps: Map<PipelineStep, StreamEvent>;
  finalResult: AnalysisResult | null;
  isLoading: boolean;
};

function TextBlock({
  label,
  content,
  variant = 'default',
  mono = false,
}: {
  label: string;
  content: string;
  variant?: 'default' | 'subdued' | 'accent';
  mono?: boolean;
}) {
  const containerClass =
    variant === 'subdued'
      ? 'bg-slate-50 border-slate-200 text-slate-600'
      : variant === 'accent'
        ? 'bg-blue-50 border-blue-200 text-blue-900'
        : 'bg-white border-slate-200 text-slate-800';
  const labelClass =
    variant === 'accent' ? 'text-blue-700' : 'text-slate-500';

  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${labelClass}`}>
        {label}
      </div>
      <div className={`text-sm rounded border p-3 ${containerClass} ${mono ? 'font-mono' : ''}`}>
        {content || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

export function PipelinePanel({ steps, finalResult, isLoading }: Props) {
  const simplifyEvent = steps.get('simplify');
  const simplifyResult = simplifyEvent?.result as SimplificationResult | undefined;
  const translateDone = steps.get('translate')?.status === 'complete';
  const backTranslateDone = steps.get('backTranslate')?.status === 'complete';

  const showProgress = isLoading || (steps.size > 0 && !finalResult);
  const showResults = finalResult !== null;

  if (!showProgress && !showResults) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <div className="text-slate-200 text-5xl mb-4">⇄</div>
        <p className="text-sm text-slate-400">
          Enter an instruction and click Analyze to see the translation pipeline
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(showProgress || (steps.size > 0)) && (
        <StepProgress steps={steps} isLoading={isLoading} />
      )}

      {showResults && (
        <>
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Pipeline Output
            </h2>

            <TextBlock
              label="Original Source"
              content={finalResult.originalInstruction}
              variant="subdued"
            />

            {simplifyResult?.rewritten && (
              <TextBlock
                label="Simplified Source (used for translation)"
                content={simplifyResult.rewritten}
                variant="accent"
              />
            )}

            {(translateDone || finalResult.translation) && (
              <TextBlock
                label={`Translation → ${finalResult.targetLanguage}`}
                content={finalResult.translation}
                mono
              />
            )}

            {(backTranslateDone || finalResult.backTranslation) && (
              <TextBlock
                label="Re-read in English (safety check)"
                content={finalResult.backTranslation}
              />
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Field-by-Field Safety Check
            </h2>
            <FieldComparisonTable
              sourceFields={finalResult.sourceFields}
              backTranslatedFields={finalResult.backTranslatedFields}
              driftIssues={finalResult.driftIssues}
            />
          </div>
        </>
      )}
    </div>
  );
}
