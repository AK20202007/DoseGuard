import { NextRequest } from 'next/server';
import { getLanguageMetadata } from '@/data/languages';
import { simplifySource } from '@/lib/pipeline/sourceSimplifier';
import { translateInstruction } from '@/lib/pipeline/translator';
import { backTranslateInstruction } from '@/lib/pipeline/backTranslator';
import { extractMedicationFields } from '@/lib/pipeline/semanticExtractor';
import { analyzeDrift } from '@/lib/pipeline/driftAnalyzer';
import { scoreRisk } from '@/lib/pipeline/riskScorer';
import { scoreConfidence } from '@/lib/pipeline/confidenceScorer';
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

        // ── Step 2: Translation ───────────────────────────────────────────
        emit({ step: 'translate', status: 'running' });
        const translation = await translateInstruction(effectiveSource, targetLanguage, langMeta);
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

        // ── Step 6: Drift analysis + risk scoring ─────────────────────────
        emit({ step: 'analyze', status: 'running' });
        const driftIssues = analyzeDrift(sourceFields, backTranslatedFields);
        const extractionFailed =
          sourceFields.medication_name === null &&
          sourceFields.dosage_amount === null &&
          sourceFields.frequency === null;
        const { riskScore, riskLevel, riskExplanation, recommendation } = scoreRisk(
          driftIssues,
          langMeta,
          extractionFailed,
        );
        const confidenceScore = scoreConfidence(
          driftIssues,
          riskScore,
          langMeta,
          sourceFields,
          backTranslatedFields,
        );
        emit({ step: 'analyze', status: 'complete', result: { driftIssues, riskScore, riskLevel, confidenceScore } });

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
          riskScore,
          riskLevel,
          riskExplanation,
          recommendation,
          confidenceScore,
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
