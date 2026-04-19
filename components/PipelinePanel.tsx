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

function TextBlock({
  label,
  content,
  icon,
  accent = false,
  mono = false,
}: {
  label: string;
  content: string;
  icon: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`material-symbols-outlined ${accent ? 'text-primary' : 'text-on-surface-variant'}`}
          style={{ fontSize: '14px' }}
        >
          {icon}
        </span>
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
          {label}
        </span>
      </div>
      <div
        className={`text-sm rounded p-3 leading-relaxed ${
          accent
            ? 'token-lock text-on-surface font-medium'
            : 'bg-surface-container-low text-on-surface border-l-2 border-outline-variant'
        } ${mono ? 'font-mono' : 'font-body'}`}
      >
        {content || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

export function PipelinePanel({ steps, finalResult, isLoading }: Props) {
  const simplifyResult = steps.get('simplify')?.result as SimplificationResult | undefined;
  const showProgress = isLoading || (steps.size > 0 && !finalResult);
  const showResults = finalResult !== null;

  if (!showProgress && !showResults) {
    return (
      <div className="bg-surface-container-lowest rounded-lg shadow-sm p-10 text-center border border-slate-100">
        <span
          className="material-symbols-outlined text-slate-200 block mb-3"
          style={{ fontSize: '48px' }}
        >
          sync_alt
        </span>
        <p className="text-sm text-on-surface-variant">
          Enter a medication instruction and click Analyze to see the translation pipeline
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(showProgress || steps.size > 0) && (
        <StepProgress steps={steps} isLoading={isLoading} />
      )}

      {showResults && (
        <>
          {/* Translation output card */}
          <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                translate
              </span>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
                  Pipeline Output
                </p>
                <h3 className="text-sm font-bold text-on-surface leading-none mt-0.5">
                  Translation Record
                </h3>
              </div>
            </div>
            <div className="p-5 space-y-5">
              <TextBlock
                icon="description"
                label="Original Source"
                content={finalResult.originalInstruction}
              />

              {simplifyResult?.rewritten && (
                <TextBlock
                  icon="auto_fix_high"
                  label="Simplified (used for translation)"
                  content={simplifyResult.rewritten}
                  accent
                />
              )}

              {finalResult.translation && (
                <TextBlock
                  icon="translate"
                  label={`Translation → ${finalResult.targetLanguage}`}
                  content={finalResult.translation}
                  mono
                  accent
                />
              )}

              {finalResult.backTranslation && (
                <TextBlock
                  icon="sync_alt"
                  label="Re-read in English (safety check)"
                  content={finalResult.backTranslation}
                />
              )}
            </div>
          </div>

          {/* Tonal Rail card (Yoruba only) */}
          {finalResult.tonalRailResult && (
            <TonalRailCard result={finalResult.tonalRailResult} />
          )}

          {/* Semantic integrity verified banner */}
          {finalResult.driftIssues.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2.5">
              <span
                className="material-symbols-outlined text-green-600 flex-shrink-0"
                style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
              >
                verified
              </span>
              <p className="text-xs font-bold text-green-800">Semantic Integrity Verified — all extracted fields match</p>
            </div>
          )}

          {/* Field comparison card */}
          <div className="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-label">
                  Field-by-Field Safety Check
                </p>
                <h3 className="text-sm font-bold text-on-surface leading-none mt-0.5">
                  Deterministic Comparison Table
                </h3>
              </div>
              {finalResult.driftIssues.length === 0 && (
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-primary-fixed rounded font-label">
                  <span
                    className="material-symbols-outlined text-on-primary-fixed"
                    style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                  >
                    verified
                  </span>
                  <span className="text-[10px] font-bold text-on-primary-fixed uppercase tracking-widest">
                    Verified
                  </span>
                </div>
              )}
            </div>
            <div className="p-5">
              <FieldComparisonTable
                sourceFields={finalResult.sourceFields}
                backTranslatedFields={finalResult.backTranslatedFields}
                driftIssues={finalResult.driftIssues}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
