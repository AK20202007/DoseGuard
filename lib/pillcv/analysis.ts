import { extractColorDebug } from '@/lib/cv/colorExtractor';
import { extractColorSignature } from '@/lib/cv/colorSignature';
import { readImprint } from '@/lib/cv/imprintReader';
import { buildConformingMaskBitmap, detectShapeDebug } from '@/lib/cv/shapeDetector';
import { scoreAgainstPrescriptionVariants } from '@/lib/pillcv/variantScoring';
import type { AnalyzePillCandidateInput, AnalyzePillCandidateOutput } from '@/lib/pillcv/types';

export async function analyzePillCandidate(input: AnalyzePillCandidateInput): Promise<AnalyzePillCandidateOutput> {
  const { analyzedImage, outline, prescription, prescriptionMeta, variantSelectionKey, enableImprint = true } = input;

  const mask = outline.mask;
  const conformingMaskBitmap = buildConformingMaskBitmap(
    analyzedImage.width,
    analyzedImage.height,
    outline.contour,
    mask,
  );

  const colorDebug = extractColorDebug(analyzedImage, mask, conformingMaskBitmap);
  const colorSignature = extractColorSignature(analyzedImage, mask, conformingMaskBitmap);
  const shapeDebug = detectShapeDebug(analyzedImage, mask, conformingMaskBitmap);

  let imprintResult = { text: '', confidence: 0 };
  if (enableImprint) {
    try {
      imprintResult = await readImprint(analyzedImage, mask, conformingMaskBitmap);
    } catch {
      // OCR is optional; callers can still proceed with color/shape analysis.
    }
  }

  const score = scoreAgainstPrescriptionVariants({
    colorResult: colorDebug.result,
    shapeResult: shapeDebug.result,
    imprintResult,
    prescription,
    prescriptionMeta,
    variantSelectionKey,
  });

  return {
    mask,
    conformingMaskBitmap,
    colorDebug,
    colorSignature,
    shapeDebug,
    imprintResult,
    score,
  };
}
