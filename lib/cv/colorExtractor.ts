export interface OvalMask {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ColorResult {
  primary: string;
  secondary: string | null;
  confidence: number;
}

export const DAILYMED_COLOR_LABELS = [
  'WHITE',
  'YELLOW',
  'ORANGE',
  'RED',
  'PINK',
  'PURPLE',
  'BLUE',
  'GREEN',
  'BROWN',
  'BLACK',
  'GRAY',
] as const;

type ColorLabel = (typeof DAILYMED_COLOR_LABELS)[number];

interface HSV {
  h: number;
  s: number;
  v: number;
}

interface PixelStats {
  hueBuckets: number[];
  whiteCount: number;
  blackCount: number;
  grayCount: number;
  brownCount: number;
  total: number;
}

export interface ColorRegionDebug {
  total: number;
  dominant: string | null;
  dominantCount: number;
  confidence: number;
  whiteCount: number;
  blackCount: number;
  grayCount: number;
  brownCount: number;
  hueBuckets: number[];
}

export interface ColorDebugResult {
  result: ColorResult;
  width: number;
  height: number;
  splitY: number;
  pixelLabelMap: Uint8Array;
  labels: readonly string[];
  top: ColorRegionDebug;
  bottom: ColorRegionDebug;
}

const NUM_HUE_BUCKETS = 16;
const OUTSIDE_LABEL = 255;

function colorLabelToIndex(label: ColorLabel): number {
  return DAILYMED_COLOR_LABELS.indexOf(label);
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function hueToLabel(hue: number): ColorLabel {
  if (hue < 15) return 'RED';
  if (hue < 35) return 'ORANGE';
  if (hue < 70) return 'YELLOW';
  if (hue < 165) return 'GREEN';
  if (hue < 195) return 'GREEN';
  if (hue < 255) return 'BLUE';
  if (hue < 285) return 'PURPLE';
  if (hue < 320) return 'PINK';
  if (hue < 345) return 'RED';
  return 'RED';
}

function emptyStats(): PixelStats {
  return {
    hueBuckets: new Array(NUM_HUE_BUCKETS).fill(0),
    whiteCount: 0,
    blackCount: 0,
    grayCount: 0,
    brownCount: 0,
    total: 0,
  };
}

function accumulatePixel(stats: PixelStats, hsv: HSV): ColorLabel {
  stats.total++;

  if (hsv.v < 0.12) {
    stats.blackCount++;
    return 'BLACK';
  }

  // White tablets often appear in shadow; avoid over-collapsing them to GRAY.
  if (hsv.s < 0.18) {
    if (hsv.v >= 0.52) {
      stats.whiteCount++;
      return 'WHITE';
    }

    if (hsv.v < 0.2) {
      stats.blackCount++;
      return 'BLACK';
    }

    stats.grayCount++;
    return 'GRAY';
  }

  if (
    hsv.s > 0.2 &&
    hsv.s < 0.6 &&
    hsv.v > 0.15 &&
    hsv.v < 0.65 &&
    hsv.h >= 10 &&
    hsv.h <= 40
  ) {
    stats.brownCount++;
    return 'BROWN';
  }

  const bucketIndex = Math.floor((hsv.h / 360) * NUM_HUE_BUCKETS);
  const clampedIndex = Math.min(bucketIndex, NUM_HUE_BUCKETS - 1);
  stats.hueBuckets[clampedIndex]++;
  return hueToLabel(hsv.h);
}

function dominantColorFromStats(stats: PixelStats): { label: ColorLabel; count: number } | null {
  if (stats.total === 0) return null;

  let bestLabel: ColorLabel = 'WHITE';
  let bestCount = stats.whiteCount;

  if (stats.blackCount > bestCount) {
    bestLabel = 'BLACK';
    bestCount = stats.blackCount;
  }
  if (stats.grayCount > bestCount) {
    bestLabel = 'GRAY';
    bestCount = stats.grayCount;
  }
  if (stats.brownCount > bestCount) {
    bestLabel = 'BROWN';
    bestCount = stats.brownCount;
  }

  const hueLabelCounts: Map<ColorLabel, number> = new Map();
  for (let i = 0; i < NUM_HUE_BUCKETS; i++) {
    if (stats.hueBuckets[i] === 0) continue;
    const hue = (i / NUM_HUE_BUCKETS) * 360;
    const label = hueToLabel(hue);
    const existing = hueLabelCounts.get(label) ?? 0;
    hueLabelCounts.set(label, existing + stats.hueBuckets[i]);
  }

  for (const [label, count] of hueLabelCounts.entries()) {
    if (count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }

  return { label: bestLabel, count: bestCount };
}

function computeColorResult(
  topStats: PixelStats,
  bottomStats: PixelStats,
  topResult: { label: ColorLabel; count: number } | null,
  bottomResult: { label: ColorLabel; count: number } | null,
): ColorResult {
  if (!topResult && !bottomResult) {
    return { primary: 'WHITE', secondary: null, confidence: 0 };
  }

  const totalPixels = topStats.total + bottomStats.total;

  if (!topResult) {
    const confidence = bottomResult!.count / bottomStats.total;
    return { primary: bottomResult!.label, secondary: null, confidence };
  }

  if (!bottomResult) {
    const confidence = topResult.count / topStats.total;
    return { primary: topResult.label, secondary: null, confidence };
  }

  if (topResult.label === bottomResult.label) {
    const combinedCount = topResult.count + bottomResult.count;
    const confidence = combinedCount / totalPixels;
    return { primary: topResult.label, secondary: null, confidence };
  }

  const topConfidence = topResult.count / topStats.total;
  const bottomConfidence = bottomResult.count / bottomStats.total;
  const avgConfidence = (topConfidence + bottomConfidence) / 2;

  const primary = topConfidence >= bottomConfidence ? topResult.label : bottomResult.label;
  const secondary = topConfidence >= bottomConfidence ? bottomResult.label : topResult.label;

  return {
    primary,
    secondary,
    confidence: avgConfidence,
  };
}

function regionDebug(
  stats: PixelStats,
  dominant: { label: ColorLabel; count: number } | null,
): ColorRegionDebug {
  const count = dominant?.count ?? 0;
  const total = stats.total;

  return {
    total,
    dominant: dominant?.label ?? null,
    dominantCount: count,
    confidence: total > 0 ? count / total : 0,
    whiteCount: stats.whiteCount,
    blackCount: stats.blackCount,
    grayCount: stats.grayCount,
    brownCount: stats.brownCount,
    hueBuckets: [...stats.hueBuckets],
  };
}

function analyzeColor(imageData: ImageData, mask: OvalMask, includePixelMap: boolean, maskBitmap?: Uint8Array) {
  const { data, width, height } = imageData;
  const { cx, cy, rx, ry } = mask;
  const resolvedMaskBitmap = maskBitmap && maskBitmap.length === width * height ? maskBitmap : null;

  const topStats = emptyStats();
  const bottomStats = emptyStats();
  const pixelLabelMap = includePixelMap
    ? new Uint8Array(width * height).fill(OUTSIDE_LABEL)
    : null;

  let xMin = Math.max(0, Math.floor(cx - rx));
  let xMax = Math.min(width - 1, Math.ceil(cx + rx));
  let yMin = Math.max(0, Math.floor(cy - ry));
  let yMax = Math.min(height - 1, Math.ceil(cy + ry));
  let splitY = cy;

  if (resolvedMaskBitmap) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let ySum = 0;
    let count = 0;
    for (let i = 0; i < resolvedMaskBitmap.length; i++) {
      if (!resolvedMaskBitmap[i]) continue;
      const y = Math.floor(i / width);
      const x = i - y * width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      ySum += y;
      count++;
    }

    if (count > 0) {
      xMin = minX;
      yMin = minY;
      xMax = maxX;
      yMax = maxY;
      splitY = ySum / count;
    }
  }

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      let inside = false;
      if (resolvedMaskBitmap) {
        inside = resolvedMaskBitmap[y * width + x] === 1;
      } else {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        inside = dx * dx + dy * dy <= 1;
      }
      if (!inside) continue;

      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 128) continue;

      const hsv = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
      const label = y < splitY ? accumulatePixel(topStats, hsv) : accumulatePixel(bottomStats, hsv);

      if (pixelLabelMap) {
        pixelLabelMap[y * width + x] = colorLabelToIndex(label);
      }
    }
  }

  const topResult = dominantColorFromStats(topStats);
  const bottomResult = dominantColorFromStats(bottomStats);
  const result = computeColorResult(topStats, bottomStats, topResult, bottomResult);

  return {
    result,
    width,
    height,
    splitY,
    pixelLabelMap,
    topStats,
    bottomStats,
    topResult,
    bottomResult,
  };
}

export function extractColor(imageData: ImageData, mask: OvalMask, maskBitmap?: Uint8Array): ColorResult {
  return analyzeColor(imageData, mask, false, maskBitmap).result;
}

export function extractColorDebug(imageData: ImageData, mask: OvalMask, maskBitmap?: Uint8Array): ColorDebugResult {
  const analysis = analyzeColor(imageData, mask, true, maskBitmap);

  return {
    result: analysis.result,
    width: analysis.width,
    height: analysis.height,
    splitY: analysis.splitY,
    pixelLabelMap: analysis.pixelLabelMap ?? new Uint8Array(analysis.width * analysis.height).fill(OUTSIDE_LABEL),
    labels: DAILYMED_COLOR_LABELS,
    top: regionDebug(analysis.topStats, analysis.topResult),
    bottom: regionDebug(analysis.bottomStats, analysis.bottomResult),
  };
}
