import type { ImprintResult } from './imprintReader';

export interface ColorResult {
  primary: string;
  secondary: string | null;
  confidence: number;
}

export interface ShapeResult {
  label: string;
  aspectRatio: number;
  solidity: number;
  confidence: number;
}

export interface PrescriptionAttributes {
  color: string[];
  shape: string;
  imprint: string | null;
}

export interface CVResult {
  overallScore: number;
  hardStop: boolean;
  hardStopReason: string | null;
  matchBreakdown: {
    color: number;
    shape: number;
    imprint: number;
  };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function stringSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function normalizeShapeLabel(value: string): string {
  return value.trim().toUpperCase();
}

function shapeSimilarity(detectedShape: string, prescribedShape: string, detectedConfidence: number): number {
  const detected = normalizeShapeLabel(detectedShape);
  const prescribed = normalizeShapeLabel(prescribedShape);
  if (!detected || !prescribed) return 0;
  if (detected === prescribed) return 1;

  const elongated = new Set(['OVAL', 'OBLONG', 'CAPSULE']);
  if (elongated.has(detected) && elongated.has(prescribed)) return 0.9;

  if (
    (detected === 'ROUND' && (prescribed === 'OVAL' || prescribed === 'OBLONG')) ||
    (prescribed === 'ROUND' && (detected === 'OVAL' || detected === 'OBLONG'))
  ) {
    return detectedConfidence < 0.82 ? 0.65 : 0.3;
  }

  if (
    (detected === 'SQUARE' && prescribed === 'DIAMOND') ||
    (detected === 'DIAMOND' && prescribed === 'SQUARE')
  ) {
    return 0.45;
  }

  return 0.0;
}

function normalizeImprintForCompare(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function scoreMatch(
  colorResult: ColorResult,
  shapeResult: ShapeResult,
  imprintResult: ImprintResult,
  prescription: PrescriptionAttributes
): CVResult {
  const prescribedColors = prescription.color.map((c) => c.toLowerCase());
  const primaryLower = colorResult.primary.toLowerCase();
  const secondaryLower = colorResult.secondary?.toLowerCase() ?? null;

  const colorScore =
    prescribedColors.includes(primaryLower) ||
    (secondaryLower !== null && prescribedColors.includes(secondaryLower))
      ? 1.0
      : 0.0;

  const shapeScore = shapeSimilarity(shapeResult.label, prescription.shape, shapeResult.confidence);

  let imprintScore = 0.0;
  let imprintWeightBase = 0.2;

  if (prescription.imprint === null) {
    imprintWeightBase = 0.0;
    imprintScore = 0.0;
  } else {
    const effectiveImprintWeight =
      imprintResult.confidence < 0.5 ? 0.05 : 0.2;
    imprintWeightBase = effectiveImprintWeight;
    const detectedImprint = normalizeImprintForCompare(imprintResult.text);
    const prescribedImprint = normalizeImprintForCompare(prescription.imprint);
    imprintScore = stringSimilarity(detectedImprint, prescribedImprint);
  }

  const baseColorWeight = 0.4;
  const baseShapeWeight = 0.4;
  const nominalImprintWeight = prescription.imprint === null ? 0.0 : 0.2;
  const actualImprintWeight = imprintWeightBase;

  let colorWeight: number;
  let shapeWeight: number;

  if (prescription.imprint === null) {
    const total = baseColorWeight + baseShapeWeight;
    colorWeight = baseColorWeight / total;
    shapeWeight = baseShapeWeight / total;
  } else if (actualImprintWeight < nominalImprintWeight) {
    const freed = nominalImprintWeight - actualImprintWeight;
    const colorProportion = baseColorWeight / (baseColorWeight + baseShapeWeight);
    const shapeProportion = baseShapeWeight / (baseColorWeight + baseShapeWeight);
    colorWeight = baseColorWeight + freed * colorProportion;
    shapeWeight = baseShapeWeight + freed * shapeProportion;
  } else {
    colorWeight = baseColorWeight;
    shapeWeight = baseShapeWeight;
  }

  const overallScore =
    colorWeight * colorScore +
    shapeWeight * shapeScore +
    actualImprintWeight * imprintScore;

  const hardStop = colorScore === 0.0;
  const hardStopReason = hardStop
    ? `Color mismatch: detected "${colorResult.primary}"${colorResult.secondary ? ` or "${colorResult.secondary}"` : ''} does not match prescribed color(s): ${prescription.color.join(', ')}`
    : null;

  return {
    overallScore,
    hardStop,
    hardStopReason,
    matchBreakdown: {
      color: colorScore,
      shape: shapeScore,
      imprint: imprintScore,
    },
  };
}
