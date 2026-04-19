import { NextRequest } from 'next/server';
import { getLanguageMetadata } from '@/data/languages';
import { simplifySource } from '@/lib/pipeline/sourceSimplifier';
import { translateInstruction, correctDiacritics } from '@/lib/pipeline/translator';
import { backTranslateInstruction } from '@/lib/pipeline/backTranslator';
import { extractMedicationFields } from '@/lib/pipeline/semanticExtractor';
import { analyzeDrift } from '@/lib/pipeline/driftAnalyzer';
import { validateDiacritics } from '@/lib/pipeline/diacriticValidator';
import { scoreRisk } from '@/lib/pipeline/riskScorer';
import { generateTeachBack } from '@/lib/pipeline/teachBackGenerator';
import { appendAuditLog } from '@/lib/auditLog';
import type { AnalysisResult, StreamEvent, SupportedLanguage } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const { instruction, targetLanguage, useSimplification } = (await request.json()) as {
    instruction: string;
    targetLanguage: SupportedLanguage;
    useSimplification: boolean;
  };

  const langMeta = getLanguageMetadata(targetLanguage);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: StreamEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // ── Step 1: Source simplification ────────────────────────────────
        emit({ step: 'simplify', status: 'running' });
        const simplificationResult = await simplifySource(instruction);
        emit({ step: 'simplify', status: 'complete', result: simplificationResult });

        const effectiveSource =
          useSimplification && simplificationResult.rewritten
            ? simplificationResult.rewritten
            : instruction;

        // ── Step 2: Translation (+ Yoruba diacritic self-correction) ─────
        emit({ step: 'translate', status: 'running' });
        let translation = await translateInstruction(effectiveSource, targetLanguage, langMeta);

        if (targetLanguage === 'Yoruba' && translation) {
          const initialIssues = validateDiacritics(translation);
          const highIssues = initialIssues.filter(i => i.severity === 'high');
          if (highIssues.length > 0) {
            const corrected = await correctDiacritics(translation, highIssues);
            if (corrected && validateDiacritics(corrected).length < initialIssues.length) {
              translation = corrected;
            }
          }
        }

        emit({ step: 'translate', status: 'complete', result: translation });

        // ── Step 3: Back-translation ──────────────────────────────────────
        emit({ step: 'backTranslate', status: 'running' });
        const backTranslation = await backTranslateInstruction(translation, targetLanguage);
        emit({ step: 'backTranslate', status: 'complete', result: backTranslation });

        // ── Steps 4+5: Parallel extraction ───────────────────────────────
        emit({ step: 'extractSource', status: 'running' });
        emit({ step: 'extractBack', status: 'running' });
        const [sourceFields, backTranslatedFields] = await Promise.all([
          extractMedicationFields(effectiveSource, 'source'),
          extractMedicationFields(backTranslation, 'back-translation'),
        ]);
        emit({ step: 'extractSource', status: 'complete', result: sourceFields });
        emit({ step: 'extractBack', status: 'complete', result: backTranslatedFields });

        // ── Step 6: Drift analysis + diacritic validation + risk scoring ──
        emit({ step: 'analyze', status: 'running' });
        const driftIssues = await analyzeDrift(sourceFields, backTranslatedFields, effectiveSource, backTranslation);
        const diacriticIssues = targetLanguage === 'Yoruba'
          ? validateDiacritics(translation)
          : [];
        const extractionFailed =
          sourceFields.medication_name === null &&
          sourceFields.dosage_amount === null &&
          sourceFields.frequency === null;
        const { riskScore, riskLevel, riskExplanation, recommendation } = scoreRisk(
          driftIssues,
          langMeta,
          extractionFailed,
          diacriticIssues,
        );
        emit({ step: 'analyze', status: 'complete', result: { driftIssues, diacriticIssues, riskScore, riskLevel } });

        // ── Step 7: Teach-back ────────────────────────────────────────────
        emit({ step: 'teachBack', status: 'running' });
        const teachBackQuestion = await generateTeachBack(
          instruction,
          targetLanguage,
          riskLevel,
        );
        emit({ step: 'teachBack', status: 'complete', result: teachBackQuestion });

        // ── Done: assemble and emit final result ──────────────────────────
        const analysisResult: AnalysisResult = {
          originalInstruction: instruction,
          simplificationResult,
          effectiveSource,
          translation,
          backTranslation,
          sourceFields,
          backTranslatedFields,
          driftIssues,
          diacriticIssues,
          riskScore,
          riskLevel,
          riskExplanation,
          recommendation,
          teachBackQuestion,
          targetLanguage,
          languageQualityWarning: langMeta.warningMessage,
          timestamp: new Date().toISOString(),
        };

        appendAuditLog(analysisResult);
        emit({ step: 'done', status: 'complete', final: analysisResult });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        emit({ step: 'done', status: 'error', error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
