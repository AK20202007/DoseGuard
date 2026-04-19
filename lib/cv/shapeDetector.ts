export interface OvalMask {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ShapeResult {
  label: string;
  aspectRatio: number;
  solidity: number;
  confidence: number;
}

export interface OutlineDetectionResult {
  mask: OvalMask;
  contour: Array<{ x: number; y: number }>;
  confidence: number;
  usedFallback: boolean;
  method: "radial" | "gaussian" | "region" | "edge" | "fallback";
}

export interface ShapeDebugResult {
  result: ShapeResult;
  edges: Uint8Array;
  maskBitmap: Uint8Array;
  contour: Array<{ x: number; y: number }>;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  approxVertices: number;
}

interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface OutlineDetectionOptions {
  edgeFloorMeanMultiplier: number;
  edgeFloorMaxRatio: number;
  radialGradientWeight: number;
  radialContrastWeight: number;
  radialOutwardBiasWeight: number;
  minContourPoints: number;
  minComponentArea: number;
  minAreaFraction: number;
  preferredMaxAreaFraction: number;
  hardMaxAreaFraction: number;
  radialMethodBonus: number;
  gaussianMethodBonus: number;
  regionMethodBonus: number;
  edgeMethodBonus: number;
}

export const DEFAULT_OUTLINE_DETECTION_OPTIONS: OutlineDetectionOptions = {
  edgeFloorMeanMultiplier: 1.15,
  edgeFloorMaxRatio: 0.12,
  radialGradientWeight: 0.9,
  radialContrastWeight: 0.55,
  radialOutwardBiasWeight: 5,
  minContourPoints: 24,
  minComponentArea: 120,
  minAreaFraction: 0.008,
  preferredMaxAreaFraction: 0.28,
  hardMaxAreaFraction: 0.48,
  radialMethodBonus: 0.08,
  gaussianMethodBonus: 0.05,
  regionMethodBonus: 0.04,
  edgeMethodBonus: 0.01,
};

function resolveOutlineOptions(options?: Partial<OutlineDetectionOptions>): OutlineDetectionOptions {
  if (!options) return DEFAULT_OUTLINE_DETECTION_OPTIONS;
  const resolved = {
    ...DEFAULT_OUTLINE_DETECTION_OPTIONS,
    ...options,
  };
  if (resolved.preferredMaxAreaFraction > resolved.hardMaxAreaFraction) {
    resolved.preferredMaxAreaFraction = resolved.hardMaxAreaFraction;
  }
  return resolved;
}

function toGrayscale(imageData: ImageDataLike): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

function buildMaskBitmap(width: number, height: number, mask: OvalMask): Uint8Array {
  const bitmap = new Uint8Array(width * height);
  const { cx, cy, rx, ry } = mask;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        bitmap[y * width + x] = 1;
      }
    }
  }
  return bitmap;
}

function buildFullMaskBitmap(width: number, height: number): Uint8Array {
  const bitmap = new Uint8Array(width * height);
  bitmap.fill(1);
  return bitmap;
}

function gaussianBlur5x5(gray: Float32Array, width: number, height: number, maskBitmap: Uint8Array): Float32Array {
  const kernel = [
    2, 4, 5, 4, 2,
    4, 9, 12, 9, 4,
    5, 12, 15, 12, 5,
    4, 9, 12, 9, 4,
    2, 4, 5, 4, 2,
  ];
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!maskBitmap[idx]) {
        out[idx] = gray[idx];
        continue;
      }
      let sum = 0;
      let wsum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const w = kernel[(ky + 2) * 5 + (kx + 2)];
            sum += gray[ny * width + nx] * w;
            wsum += w;
          }
        }
      }
      out[idx] = wsum > 0 ? sum / wsum : gray[idx];
    }
  }

  const out2 = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!maskBitmap[idx]) {
        out2[idx] = out[idx];
        continue;
      }
      let sum = 0;
      let wsum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const w = kernel[(ky + 2) * 5 + (kx + 2)];
            sum += out[ny * width + nx] * w;
            wsum += w;
          }
        }
      }
      out2[idx] = wsum > 0 ? sum / wsum : out[idx];
    }
  }

  return out2;
}

interface SobelResult {
  magnitude: Float32Array;
  angle: Float32Array;
}

function sobel(gray: Float32Array, width: number, height: number): SobelResult {
  const magnitude = new Float32Array(width * height);
  const angle = new Float32Array(width * height);

  const Kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const Ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const v = gray[(y + ky) * width + (x + kx)];
          const ki = (ky + 1) * 3 + (kx + 1);
          gx += Kx[ki] * v;
          gy += Ky[ki] * v;
        }
      }
      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      angle[idx] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, angle };
}

function nonMaxSuppression(magnitude: Float32Array, angle: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];
      const theta = angle[idx];
      const deg = ((theta * 180) / Math.PI + 180) % 180;

      let n1: number;
      let n2: number;

      if (deg < 22.5 || deg >= 157.5) {
        n1 = magnitude[idx - 1];
        n2 = magnitude[idx + 1];
      } else if (deg < 67.5) {
        n1 = magnitude[(y - 1) * width + (x + 1)];
        n2 = magnitude[(y + 1) * width + (x - 1)];
      } else if (deg < 112.5) {
        n1 = magnitude[(y - 1) * width + x];
        n2 = magnitude[(y + 1) * width + x];
      } else {
        n1 = magnitude[(y - 1) * width + (x - 1)];
        n2 = magnitude[(y + 1) * width + (x + 1)];
      }

      out[idx] = mag >= n1 && mag >= n2 ? mag : 0;
    }
  }

  return out;
}

function hysteresisThreshold(nms: Float32Array, width: number, height: number, lowRatio: number, highRatio: number): Uint8Array {
  let maxVal = 0;
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] > maxVal) maxVal = nms[i];
  }

  const low = maxVal * lowRatio;
  const high = maxVal * highRatio;

  const STRONG = 2;
  const WEAK = 1;
  const edges = new Uint8Array(width * height);

  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) edges[i] = STRONG;
    else if (nms[i] >= low) edges[i] = WEAK;
  }

  const stack: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === STRONG) stack.push(i);
  }

  const dirs = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    for (const d of dirs) {
      const ni = idx + d;
      if (ni >= 0 && ni < edges.length && edges[ni] === WEAK) {
        edges[ni] = STRONG;
        stack.push(ni);
      }
    }
  }

  const result = new Uint8Array(width * height);
  for (let i = 0; i < edges.length; i++) {
    result[i] = edges[i] === STRONG ? 1 : 0;
  }

  return result;
}

function cannyEdges(gray: Float32Array, width: number, height: number, maskBitmap: Uint8Array): Uint8Array {
  const blurred = gaussianBlur5x5(gray, width, height, maskBitmap);
  const { magnitude, angle } = sobel(blurred, width, height);
  const nms = nonMaxSuppression(magnitude, angle, width, height);
  const edges = hysteresisThreshold(nms, width, height, 0.05, 0.15);

  for (let i = 0; i < edges.length; i++) {
    if (!maskBitmap[i]) edges[i] = 0;
  }

  return edges;
}

function rgbToSaturation(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  return max === 0 ? 0 : delta / max;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function dilateBinary(bitmap: Uint8Array, width: number, height: number, searchMask: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!searchMask[idx]) continue;
      let on = 0;
      for (let yy = y - 1; yy <= y + 1 && !on; yy++) {
        for (let xx = x - 1; xx <= x + 1 && !on; xx++) {
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
          const ni = yy * width + xx;
          if (bitmap[ni] && searchMask[ni]) on = 1;
        }
      }
      out[idx] = on;
    }
  }
  return out;
}

function erodeBinary(bitmap: Uint8Array, width: number, height: number, searchMask: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!searchMask[idx] || !bitmap[idx]) continue;
      let on = 1;
      for (let yy = y - 1; yy <= y + 1 && on; yy++) {
        for (let xx = x - 1; xx <= x + 1 && on; xx++) {
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) {
            on = 0;
            continue;
          }
          const ni = yy * width + xx;
          if (!bitmap[ni] || !searchMask[ni]) on = 0;
        }
      }
      out[idx] = on;
    }
  }
  return out;
}

function morphologyCloseOpen(bitmap: Uint8Array, width: number, height: number, searchMask: Uint8Array): Uint8Array {
  const dilated = dilateBinary(bitmap, width, height, searchMask);
  const closed = erodeBinary(dilated, width, height, searchMask);
  const opened = dilateBinary(erodeBinary(closed, width, height, searchMask), width, height, searchMask);
  return opened;
}

function buildAdaptiveRegionMask(imageData: ImageDataLike, searchMask: Uint8Array): Uint8Array {
  const { data, width, height } = imageData;
  const lumaSamples: number[] = [];
  const satSamples: number[] = [];

  for (let i = 0; i < width * height; i++) {
    if (!searchMask[i]) continue;
    const di = i * 4;
    const r = data[di];
    const g = data[di + 1];
    const b = data[di + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumaSamples.push(luma);
    satSamples.push(rgbToSaturation(r, g, b));
  }

  if (lumaSamples.length === 0) return new Uint8Array(width * height);

  const lumaThreshold = Math.max(90, percentile(lumaSamples, 0.6));
  const satThreshold = Math.min(0.5, percentile(satSamples, 0.55) + 0.08);

  const rawMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!searchMask[i]) continue;
    const di = i * 4;
    const r = data[di];
    const g = data[di + 1];
    const b = data[di + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = rgbToSaturation(r, g, b);

    if (luma >= lumaThreshold && sat <= satThreshold) {
      rawMask[i] = 1;
    }
  }

  return morphologyCloseOpen(rawMask, width, height, searchMask);
}

function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const sr = r / 255;
  const sg = g / 255;
  const sb = b / 255;
  const lin = (u: number): number => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const rr = lin(sr);
  const gg = lin(sg);
  const bb = lin(sb);

  const x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
  const z = rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041;

  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  const f = (t: number): number => {
    const e = 216 / 24389;
    const k = 24389 / 27;
    return t > e ? Math.cbrt(t) : (k * t + 16) / 116;
  };

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

interface GaussianStats {
  mean: [number, number, number, number, number];
  variance: [number, number, number, number, number];
}

interface SeedPixel {
  idx: number;
  x: number;
  y: number;
  feat: [number, number, number, number, number];
  seed: -1 | 0 | 1;
  label: 0 | 1;
}

function computeGaussianStats(pixels: SeedPixel[], label: 0 | 1): GaussianStats | null {
  const group = pixels.filter((p) => p.label === label);
  if (group.length === 0) return null;

  const mean: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const p of group) {
    for (let k = 0; k < 5; k++) mean[k] += p.feat[k];
  }
  for (let k = 0; k < 5; k++) mean[k] /= group.length;

  const variance: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const p of group) {
    for (let k = 0; k < 5; k++) {
      const d = p.feat[k] - mean[k];
      variance[k] += d * d;
    }
  }
  for (let k = 0; k < 5; k++) {
    variance[k] = Math.max(1e-3, variance[k] / group.length);
  }

  return { mean, variance };
}

function negativeLogLikelihood(feat: [number, number, number, number, number], g: GaussianStats): number {
  let score = 0;
  for (let k = 0; k < 5; k++) {
    const varK = Math.max(1e-3, g.variance[k]);
    const d = feat[k] - g.mean[k];
    score += 0.5 * (Math.log(varK) + (d * d) / varK);
  }
  return score;
}

function buildSeededGaussianMask(
  imageData: ImageDataLike,
  searchMask: Uint8Array,
  seedMask?: OvalMask,
): Uint8Array {
  const { data, width, height } = imageData;
  const cx = seedMask?.cx ?? width / 2;
  const cy = seedMask?.cy ?? height / 2;
  const rx = Math.max(1, seedMask?.rx ?? width * 0.35);
  const ry = Math.max(1, seedMask?.ry ?? height * 0.35);

  const fgSeedScale = 0.35;
  const bgInnerScale = 0.72;
  const pixels: SeedPixel[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!searchMask[idx]) continue;

      const sx = (x - cx) / rx;
      const sy = (y - cy) / ry;
      const d2 = sx * sx + sy * sy;

      const di = idx * 4;
      const lab = rgbToLab(data[di], data[di + 1], data[di + 2]);
      const feat: [number, number, number, number, number] = [
        lab.l,
        lab.a,
        lab.b,
        sx * 28,
        sy * 28,
      ];

      let seed: -1 | 0 | 1 = 0;
      if (d2 <= fgSeedScale * fgSeedScale) seed = 1;
      else if (d2 >= bgInnerScale * bgInnerScale && d2 <= 1.0) seed = -1;

      pixels.push({
        idx,
        x,
        y,
        feat,
        seed,
        label: seed === 1 ? 1 : 0,
      });
    }
  }

  if (pixels.length === 0) return new Uint8Array(width * height);
  if (!pixels.some((p) => p.seed === 1) || !pixels.some((p) => p.seed === -1)) {
    return new Uint8Array(width * height);
  }

  for (let iter = 0; iter < 6; iter++) {
    const fg = computeGaussianStats(pixels, 1);
    const bg = computeGaussianStats(pixels, 0);
    if (!fg || !bg) break;

    for (const p of pixels) {
      if (p.seed === 1) {
        p.label = 1;
        continue;
      }
      if (p.seed === -1) {
        p.label = 0;
        continue;
      }

      const fgCost = negativeLogLikelihood(p.feat, fg);
      const bgCost = negativeLogLikelihood(p.feat, bg);
      p.label = fgCost <= bgCost ? 1 : 0;
    }
  }

  const mask = new Uint8Array(width * height);
  for (const p of pixels) {
    if (p.label === 1) mask[p.idx] = 1;
  }

  return morphologyCloseOpen(mask, width, height, searchMask);
}

function extractLargestConnectedComponent(bitmap: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(width * height);
  let bestIndices: number[] = [];
  const queue: Array<{ x: number; y: number }> = [];
  const dirs8 = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  ];

  for (let i = 0; i < bitmap.length; i++) {
    if (!bitmap[i] || visited[i]) continue;
    const sx = i % width;
    const sy = Math.floor(i / width);
    const component: number[] = [];
    queue.push({ x: sx, y: sy });
    visited[i] = 1;

    while (queue.length > 0) {
      const { x, y } = queue.pop()!;
      const idx = y * width + x;
      component.push(idx);
      for (const d of dirs8) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (!bitmap[ni] || visited[ni]) continue;
        visited[ni] = 1;
        queue.push({ x: nx, y: ny });
      }
    }

    if (component.length > bestIndices.length) {
      bestIndices = component;
    }
  }

  const out = new Uint8Array(width * height);
  for (const idx of bestIndices) out[idx] = 1;
  return out;
}

function extractConnectedComponents(
  bitmap: Uint8Array,
  width: number,
  height: number,
  minArea = 80,
  maxComponents = 10,
): Array<{ mask: Uint8Array; area: number }> {
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const dirs8 = [
    -width - 1, -width, -width + 1,
    -1, 1,
    width - 1, width, width + 1,
  ];

  const components: Array<{ area: number; indices: number[] }> = [];

  for (let i = 0; i < bitmap.length; i++) {
    if (!bitmap[i] || visited[i]) continue;
    visited[i] = 1;
    stack.push(i);
    const indices: number[] = [];

    while (stack.length > 0) {
      const idx = stack.pop()!;
      indices.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);

      for (const d of dirs8) {
        const ni = idx + d;
        if (ni < 0 || ni >= bitmap.length || visited[ni] || !bitmap[ni]) continue;

        const nx = ni % width;
        const ny = Math.floor(ni / width);
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;

        visited[ni] = 1;
        stack.push(ni);
      }
    }

    if (indices.length >= minArea) {
      components.push({ area: indices.length, indices });
    }
  }

  components.sort((a, b) => b.area - a.area);
  return components.slice(0, maxComponents).map((c) => {
    const mask = new Uint8Array(width * height);
    for (const idx of c.indices) mask[idx] = 1;
    return { mask, area: c.area };
  });
}

function extractConnectedComponentFromSeed(
  bitmap: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
): Uint8Array {
  const sx = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const startIdx = sy * width + sx;
  if (!bitmap[startIdx]) return extractLargestConnectedComponent(bitmap, width, height);

  const out = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const stack: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
  const dirs8 = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  ];

  visited[startIdx] = 1;
  out[startIdx] = 1;

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const d of dirs8) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (!bitmap[ni] || visited[ni]) continue;
      visited[ni] = 1;
      out[ni] = 1;
      stack.push({ x: nx, y: ny });
    }
  }

  return out;
}

function buildRadialEdgeContour(
  imageData: ImageDataLike,
  searchMask: Uint8Array,
  seedMask?: OvalMask,
  options?: OutlineDetectionOptions,
): Point[] {
  const { width, height } = imageData;
  const cx = seedMask?.cx ?? width / 2;
  const cy = seedMask?.cy ?? height / 2;
  const rx = Math.max(8, seedMask?.rx ?? width * 0.35);
  const ry = Math.max(8, seedMask?.ry ?? height * 0.35);

  const gray = toGrayscale(imageData);
  const blurred = gaussianBlur5x5(gray, width, height, searchMask);
  const { magnitude } = sobel(blurred, width, height);

  let magSum = 0;
  let magCount = 0;
  let magMax = 0;
  for (let i = 0; i < width * height; i++) {
    if (!searchMask[i]) continue;
    const m = magnitude[i];
    magSum += m;
    magCount += 1;
    if (m > magMax) magMax = m;
  }
  if (magCount === 0) return [];

  const meanMag = magSum / magCount;
  const edgeFloor = Math.max(
    meanMag * (options?.edgeFloorMeanMultiplier ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.edgeFloorMeanMultiplier),
    magMax * (options?.edgeFloorMaxRatio ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.edgeFloorMaxRatio),
  );
  const rMax = Math.max(16, Math.min(rx, ry) * 1.12);
  const rMin = Math.max(4, Math.min(rx, ry) * 0.1);
  const angleSteps = 180;

  const radii: Array<number | null> = new Array(angleSteps).fill(null);

  const inside = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height;

  for (let ai = 0; ai < angleSteps; ai++) {
    const t = (ai / angleSteps) * Math.PI * 2;
    const ux = Math.cos(t);
    const uy = Math.sin(t);

    let bestScore = -Infinity;
    let bestRadius: number | null = null;

    for (let r = rMin; r <= rMax; r += 1) {
      const x = cx + ux * r;
      const y = cy + uy * r;
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (!inside(ix, iy)) break;
      const idx = iy * width + ix;
      if (!searchMask[idx]) continue;

      const grad = magnitude[idx];
      if (grad < edgeFloor * 0.6) continue;

      const rin = Math.max(rMin, r - 2);
      const rout = Math.min(rMax, r + 2);
      const xin = Math.round(cx + ux * rin);
      const yin = Math.round(cy + uy * rin);
      const xout = Math.round(cx + ux * rout);
      const yout = Math.round(cy + uy * rout);

      let contrast = 0;
      if (inside(xin, yin) && inside(xout, yout)) {
        const iin = yin * width + xin;
        const iout = yout * width + xout;
        contrast = Math.abs(blurred[iin] - blurred[iout]);
      }

      const outwardBias = r / Math.max(rMax, 1);
      const score =
        grad * (options?.radialGradientWeight ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.radialGradientWeight) +
        contrast * (options?.radialContrastWeight ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.radialContrastWeight) +
        outwardBias * (options?.radialOutwardBiasWeight ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.radialOutwardBiasWeight);
      if (score > bestScore) {
        bestScore = score;
        bestRadius = r;
      }
    }

    radii[ai] = bestRadius;
  }

  const valid = radii.filter((r): r is number => r !== null);
  if (valid.length < angleSteps * 0.35) return [];

  const sortedValid = valid.slice().sort((a, b) => a - b);
  const medianRadius = sortedValid[Math.floor(sortedValid.length / 2)];

  for (let i = 0; i < radii.length; i++) {
    if (radii[i] === null) radii[i] = medianRadius;
  }

  for (let pass = 0; pass < 3; pass++) {
    const next = radii.slice();
    for (let i = 0; i < radii.length; i++) {
      const a = radii[(i - 1 + radii.length) % radii.length] as number;
      const b = radii[i] as number;
      const c = radii[(i + 1) % radii.length] as number;
      next[i] = (a + b + c) / 3;
    }
    for (let i = 0; i < radii.length; i++) radii[i] = next[i];
  }

  const contour: Point[] = [];
  let lastX = -1;
  let lastY = -1;
  for (let ai = 0; ai < angleSteps; ai++) {
    const t = (ai / angleSteps) * Math.PI * 2;
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    let r = Math.max(rMin, Math.min(rMax, radii[ai] as number));

    let x = Math.round(cx + ux * r);
    let y = Math.round(cy + uy * r);

    while (r > rMin && (x < 0 || x >= width || y < 0 || y >= height || !searchMask[y * width + x])) {
      r -= 1;
      x = Math.round(cx + ux * r);
      y = Math.round(cy + uy * r);
    }

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!searchMask[y * width + x]) continue;
    if (x === lastX && y === lastY) continue;

    contour.push({ x, y });
    lastX = x;
    lastY = y;
  }

  return contour;
}

function boundaryFromRegion(regionMask: Uint8Array, width: number, height: number): Uint8Array {
  const boundary = new Uint8Array(width * height);
  const dirs4 = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!regionMask[idx]) continue;

      let edge = false;
      for (const d of dirs4) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          edge = true;
          break;
        }
        const ni = ny * width + nx;
        if (!regionMask[ni]) {
          edge = true;
          break;
        }
      }
      if (edge) boundary[idx] = 1;
    }
  }

  return boundary;
}

interface Point {
  x: number;
  y: number;
}

function traceContour(edges: Uint8Array, width: number, height: number, startIdx: number, visited: Uint8Array): Point[] {
  const contour: Point[] = [];
  const dirs8 = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  ];

  const startX = startIdx % width;
  const startY = Math.floor(startIdx / width);

  const stack: Point[] = [{ x: startX, y: startY }];
  visited[startY * width + startX] = 1;

  while (stack.length > 0) {
    const pt = stack.pop()!;
    contour.push(pt);
    for (const d of dirs8) {
      const nx = pt.x + d.dx;
      const ny = pt.y + d.dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const ni = ny * width + nx;
        if (edges[ni] && !visited[ni]) {
          visited[ni] = 1;
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  return contour;
}

function extractContours(
  edges: Uint8Array,
  width: number,
  height: number,
  minPoints = 20,
  maxContours = 30,
): Point[][] {
  const visited = new Uint8Array(width * height);
  const contours: Point[][] = [];

  for (let i = 0; i < edges.length; i++) {
    if (edges[i] && !visited[i]) {
      const contour = traceContour(edges, width, height, i, visited);
      if (contour.length >= minPoints) contours.push(contour);
    }
  }

  contours.sort((a, b) => b.length - a.length);
  return contours.slice(0, maxContours);
}

function extractLargestContour(edges: Uint8Array, width: number, height: number): Point[] {
  const contours = extractContours(edges, width, height, 1, 1);
  return contours.length > 0 ? contours[0] : [];
}

function boundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function polygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function polygonPerimeter(points: Point[]): number {
  const n = points.length;
  if (n < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();

  const sorted = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

  const cross = (O: Point, A: Point, B: Point): number =>
    (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lineLen = Math.sqrt(dx * dx + dy * dy);

  for (let i = 1; i < points.length - 1; i++) {
    let dist: number;
    if (lineLen === 0) {
      const ddx = points[i].x - start.x;
      const ddy = points[i].y - start.y;
      dist = Math.sqrt(ddx * ddx + ddy * ddy);
    } else {
      dist = Math.abs(dy * points[i].x - dx * points[i].y + end.x * start.y - end.y * start.x) / lineLen;
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [start, end];
}

function sortContourAsPolygon(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.slice().sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / Math.max(1e-6, yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function buildConformingMaskBitmap(
  width: number,
  height: number,
  contour: Array<{ x: number; y: number }>,
  fallbackMask?: OvalMask,
): Uint8Array {
  if (contour.length < 6) {
    return fallbackMask ? buildMaskBitmap(width, height, fallbackMask) : buildFullMaskBitmap(width, height);
  }

  const polygon = sortContourAsPolygon(contour);
  if (polygon.length < 3) {
    return fallbackMask ? buildMaskBitmap(width, height, fallbackMask) : buildFullMaskBitmap(width, height);
  }

  const bb = boundingBox(polygon);
  const minX = Math.max(0, Math.floor(bb.minX));
  const minY = Math.max(0, Math.floor(bb.minY));
  const maxX = Math.min(width - 1, Math.ceil(bb.maxX));
  const maxY = Math.min(height - 1, Math.ceil(bb.maxY));

  const bitmap = new Uint8Array(width * height);
  let filledCount = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) continue;
      bitmap[y * width + x] = 1;
      filledCount++;
    }
  }

  for (const p of polygon) {
    const x = Math.max(0, Math.min(width - 1, Math.round(p.x)));
    const y = Math.max(0, Math.min(height - 1, Math.round(p.y)));
    const idx = y * width + x;
    if (!bitmap[idx]) {
      bitmap[idx] = 1;
      filledCount++;
    }
  }

  if (filledCount < 24 && fallbackMask) {
    return buildMaskBitmap(width, height, fallbackMask);
  }

  return bitmap;
}

function buildOvalBoundaryBandBitmap(
  width: number,
  height: number,
  mask: OvalMask,
  innerScale = 0.62,
  outerScale = 1.08,
): Uint8Array {
  const bitmap = new Uint8Array(width * height);
  const { cx, cy, rx, ry } = mask;
  const inner2 = innerScale * innerScale;
  const outer2 = outerScale * outerScale;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry);
      const d2 = dx * dx + dy * dy;
      if (d2 >= inner2 && d2 <= outer2) {
        bitmap[y * width + x] = 1;
      }
    }
  }

  return bitmap;
}

function classifyShape(
  vertexCount: number,
  aspectRatio: number,
  solidity: number,
  extent: number,
  circularity: number,
): { label: string; confidence: number } {
  const ar = aspectRatio;

  if (ar >= 0.82 && ar <= 1.22 && solidity >= 0.84 && circularity >= 0.56) {
    return { label: "ROUND", confidence: 0.9 };
  }

  if (vertexCount <= 8 && ar > 1.8 && solidity >= 0.7 && extent >= 0.55) {
    return { label: "CAPSULE", confidence: 0.82 };
  }

  if (vertexCount <= 8 && ar > 1.8 && solidity >= 0.7) {
    return { label: "OBLONG", confidence: 0.8 };
  }

  if (vertexCount <= 8 && ar >= 1.18 && ar <= 1.8 && solidity >= 0.8) {
    return { label: "OVAL", confidence: 0.85 };
  }

  if (vertexCount === 3 || (vertexCount === 4 && solidity < 0.75)) {
    return { label: "TRIANGLE", confidence: 0.85 };
  }

  if (vertexCount === 4 && ar >= 0.85 && ar <= 1.18 && solidity >= 0.88) {
    return { label: "SQUARE", confidence: 0.85 };
  }

  if (vertexCount === 4 && ar >= 0.7 && ar <= 1.4 && solidity >= 0.75 && circularity < 0.56 && extent < 0.82) {
    return { label: "DIAMOND", confidence: 0.8 };
  }

  if (vertexCount === 5) {
    return { label: "PENTAGON", confidence: 0.82 };
  }

  if (ar >= 0.85 && ar <= 1.18) {
    return { label: "ROUND", confidence: 0.6 };
  }

  if (circularity >= 0.68) {
    return { label: "ROUND", confidence: 0.62 };
  }

  if (ar > 1.8) {
    return { label: "OBLONG", confidence: 0.6 };
  }

  return { label: "OVAL", confidence: 0.55 };
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function outlineFromContour(
  contour: Point[],
  width: number,
  height: number,
  method: "radial" | "gaussian" | "region" | "edge",
  seedMask?: OvalMask,
  options?: OutlineDetectionOptions,
): OutlineDetectionResult | null {
  const minContourPoints = Math.max(6, Math.round(options?.minContourPoints ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.minContourPoints));
  if (contour.length < minContourPoints) return null;

  const bb = boundingBox(contour);
  const bbWidth = bb.maxX - bb.minX + 1;
  const bbHeight = bb.maxY - bb.minY + 1;
  if (bbWidth < 10 || bbHeight < 10) return null;

  const sortedContour = sortContourAsPolygon(contour);
  const contourArea = polygonArea(sortedContour);
  if (contourArea < 30) return null;

  const bbArea = bbWidth * bbHeight;
  const extent = bbArea > 0 ? contourArea / bbArea : 0;
  const contourDensity = contour.length / Math.max(1, 2 * (bbWidth + bbHeight));
  const areaFraction = contourArea / Math.max(1, width * height);
  const aspectRatio = bbWidth / Math.max(1, bbHeight);
  const perimeter = polygonPerimeter(sortedContour);

  const hull = convexHull(contour);
  const sortedHull = sortContourAsPolygon(hull);
  const hullArea = polygonArea(sortedHull);
  const solidity = hullArea > 0 ? clamp01(contourArea / hullArea) : 0;
  const circularity = perimeter > 0 ? clamp01((4 * Math.PI * contourArea) / (perimeter * perimeter)) : 0;

  const mask: OvalMask = {
    cx: (bb.minX + bb.maxX) / 2,
    cy: (bb.minY + bb.maxY) / 2,
    rx: Math.max(8, (bbWidth / 2) * 1.08),
    ry: Math.max(8, (bbHeight / 2) * 1.08),
  };

  const hardMaxArea = options?.hardMaxAreaFraction ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.hardMaxAreaFraction;
  if (!seedMask && areaFraction > hardMaxArea) return null;

  const areaLow = options?.minAreaFraction ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.minAreaFraction;
  const areaHigh = options?.preferredMaxAreaFraction ?? DEFAULT_OUTLINE_DETECTION_OPTIONS.preferredMaxAreaFraction;
  const areaScore =
    areaFraction < areaLow
      ? clamp01(areaFraction / areaLow)
      : areaFraction > areaHigh
        ? clamp01(1 - (areaFraction - areaHigh) / (Math.max(areaHigh + 1e-6, hardMaxArea) - areaHigh))
        : 1;
  const aspectScore = aspectRatio > 0.35 && aspectRatio < 4.5 ? 1 : 0.35;
  const borderClearance = Math.min(bb.minX, bb.minY, width - 1 - bb.maxX, height - 1 - bb.maxY);
  const borderScore = clamp01(borderClearance / Math.max(6, Math.min(width, height) * 0.08));

  let centerScore = 1;
  if (seedMask) {
    const dx = (mask.cx - seedMask.cx) / Math.max(1, seedMask.rx);
    const dy = (mask.cy - seedMask.cy) / Math.max(1, seedMask.ry);
    const dist = Math.sqrt(dx * dx + dy * dy);
    centerScore = clamp01(1 - dist * 0.7);
  }

  const centerWeight = seedMask ? 0.13 : 0.04;
  const confidence = clamp01(
    0.2 * clamp01(extent) +
      0.2 * clamp01(solidity) +
      0.15 * clamp01(circularity) +
      0.12 * clamp01(contourDensity) +
      0.15 * clamp01(areaScore) +
      0.1 * borderScore +
      0.08 * aspectScore +
      centerWeight * centerScore,
  );

  return {
    mask,
    contour,
    confidence,
    usedFallback: false,
    method,
  };
}

function fallbackOutline(width: number, height: number, seedMask?: OvalMask): OutlineDetectionResult {
  const mask =
    seedMask ??
    {
      cx: width / 2,
      cy: height / 2,
      rx: Math.max(8, width * 0.25),
      ry: Math.max(8, height * 0.25),
    };

  return {
    mask,
    contour: [],
    confidence: 0.15,
    usedFallback: true,
    method: "fallback",
  };
}

function selectionScore(candidate: OutlineDetectionResult, options: OutlineDetectionOptions): number {
  if (candidate.method === "radial") return candidate.confidence + options.radialMethodBonus;
  if (candidate.method === "gaussian") return candidate.confidence + options.gaussianMethodBonus;
  if (candidate.method === "region") return candidate.confidence + options.regionMethodBonus;
  return candidate.confidence + options.edgeMethodBonus;
}

function isSimilarCandidate(a: OutlineDetectionResult, b: OutlineDetectionResult): boolean {
  const dx = Math.abs(a.mask.cx - b.mask.cx) / Math.max(1, Math.max(a.mask.rx, b.mask.rx));
  const dy = Math.abs(a.mask.cy - b.mask.cy) / Math.max(1, Math.max(a.mask.ry, b.mask.ry));
  const drx = Math.abs(a.mask.rx - b.mask.rx) / Math.max(1, Math.max(a.mask.rx, b.mask.rx));
  const dry = Math.abs(a.mask.ry - b.mask.ry) / Math.max(1, Math.max(a.mask.ry, b.mask.ry));
  return dx + dy < 0.75 && drx < 0.35 && dry < 0.35;
}

function finalizeCandidates(
  candidates: OutlineDetectionResult[],
  options: OutlineDetectionOptions,
  limit: number,
): OutlineDetectionResult[] {
  const sorted = candidates
    .slice()
    .sort((a, b) => selectionScore(b, options) - selectionScore(a, options));

  const unique: OutlineDetectionResult[] = [];
  for (const candidate of sorted) {
    if (unique.some((existing) => isSimilarCandidate(existing, candidate))) continue;
    unique.push(candidate);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function detectPillCandidates(
  imageData: ImageDataLike,
  seedMask?: OvalMask,
  options?: Partial<OutlineDetectionOptions>,
  maxCandidates = 6,
): OutlineDetectionResult[] {
  const { width, height } = imageData;
  const resolvedOptions = resolveOutlineOptions(options);

  const searchMask = seedMask
    ? buildMaskBitmap(width, height, seedMask)
    : buildFullMaskBitmap(width, height);

  const candidates: OutlineDetectionResult[] = [];
  const pushCandidate = (candidate: OutlineDetectionResult | null): void => {
    if (candidate) candidates.push(candidate);
  };

  // Candidate A: radial center-out edge tracking.
  pushCandidate(
    outlineFromContour(
      buildRadialEdgeContour(imageData, searchMask, seedMask, resolvedOptions),
      width,
      height,
      "radial",
      seedMask,
      resolvedOptions,
    ),
  );

  if (seedMask) {
    // Seeded path (used when caller provides a prior mask/ROI).
    const gaussianRaw = buildSeededGaussianMask(imageData, searchMask, seedMask);
    const gaussianMask = extractConnectedComponentFromSeed(
      gaussianRaw,
      width,
      height,
      seedMask.cx,
      seedMask.cy,
    );
    const gaussianBoundary = boundaryFromRegion(gaussianMask, width, height);
    pushCandidate(
      outlineFromContour(
        extractLargestContour(gaussianBoundary, width, height),
        width,
        height,
        "gaussian",
        seedMask,
        resolvedOptions,
      ),
    );

    const gray = toGrayscale(imageData);
    const edges = cannyEdges(gray, width, height, searchMask);
    pushCandidate(
      outlineFromContour(
        extractLargestContour(edges, width, height),
        width,
        height,
        "edge",
        seedMask,
        resolvedOptions,
      ),
    );

    const rawRegionMask = buildAdaptiveRegionMask(imageData, searchMask);
    const regionMask = extractConnectedComponentFromSeed(
      rawRegionMask,
      width,
      height,
      seedMask.cx,
      seedMask.cy,
    );
    const regionBoundary = boundaryFromRegion(regionMask, width, height);
    pushCandidate(
      outlineFromContour(
        extractLargestContour(regionBoundary, width, height),
        width,
        height,
        "region",
        seedMask,
        resolvedOptions,
      ),
    );
  } else {
    // Guide-free path: generate many proposals over the full frame, then score.
    const gray = toGrayscale(imageData);
    const edges = cannyEdges(gray, width, height, searchMask);
    const edgeContours = extractContours(
      edges,
      width,
      height,
      Math.max(6, Math.round(resolvedOptions.minContourPoints * 0.9)),
      48,
    );
    for (const contour of edgeContours) {
      pushCandidate(outlineFromContour(contour, width, height, "edge", undefined, resolvedOptions));
    }

    const rawRegionMask = buildAdaptiveRegionMask(imageData, searchMask);
    const regionComponents = extractConnectedComponents(
      rawRegionMask,
      width,
      height,
      Math.max(20, Math.round(resolvedOptions.minComponentArea)),
      12,
    );
    for (const component of regionComponents) {
      const boundary = boundaryFromRegion(component.mask, width, height);
      const contours = extractContours(
        boundary,
        width,
        height,
        Math.max(6, Math.round(resolvedOptions.minContourPoints * 0.8)),
        4,
      );
      for (const contour of contours) {
        pushCandidate(outlineFromContour(contour, width, height, "region", undefined, resolvedOptions));
      }
    }

    const gaussianRaw = buildSeededGaussianMask(imageData, searchMask);
    const gaussianComponents = extractConnectedComponents(
      gaussianRaw,
      width,
      height,
      Math.max(20, Math.round(resolvedOptions.minComponentArea)),
      10,
    );
    for (const component of gaussianComponents) {
      const boundary = boundaryFromRegion(component.mask, width, height);
      const contours = extractContours(
        boundary,
        width,
        height,
        Math.max(6, Math.round(resolvedOptions.minContourPoints * 0.8)),
        3,
      );
      for (const contour of contours) {
        pushCandidate(outlineFromContour(contour, width, height, "gaussian", undefined, resolvedOptions));
      }
    }
  }

  if (candidates.length > 0) {
    return finalizeCandidates(candidates, resolvedOptions, Math.max(1, maxCandidates));
  }

  return [fallbackOutline(width, height, seedMask)];
}

export function detectPillOutline(
  imageData: ImageDataLike,
  seedMask?: OvalMask,
  options?: Partial<OutlineDetectionOptions>,
): OutlineDetectionResult {
  return detectPillCandidates(imageData, seedMask, options, 1)[0];
}

export function detectShapeDebug(imageData: ImageDataLike, mask: OvalMask, maskBitmap?: Uint8Array): ShapeDebugResult {
  const { width, height } = imageData;

  const hasConformingMask = !!maskBitmap && maskBitmap.length === width * height;
  const resolvedMaskBitmap = hasConformingMask ? maskBitmap : buildMaskBitmap(width, height, mask);
  const boundaryBand = hasConformingMask
    ? boundaryFromRegion(resolvedMaskBitmap, width, height)
    : buildOvalBoundaryBandBitmap(width, height, mask, 0.6, 1.1);
  const gray = toGrayscale(imageData);
  const edges = cannyEdges(gray, width, height, resolvedMaskBitmap);
  for (let i = 0; i < edges.length; i++) {
    if (!boundaryBand[i]) edges[i] = 0;
  }

  const contour = extractLargestContour(edges, width, height);

  if (contour.length < 5) {
    return {
      result: { label: "ROUND", aspectRatio: 1, solidity: 1, confidence: 0.1 },
      edges,
      maskBitmap: resolvedMaskBitmap,
      contour,
      boundingBox: null,
      approxVertices: 0,
    };
  }

  const bb = boundingBox(contour);
  const bbWidth = bb.maxX - bb.minX + 1;
  const bbHeight = bb.maxY - bb.minY + 1;
  const aspectRatio = bbHeight > 0 ? bbWidth / bbHeight : 1;
  const bbArea = bbWidth * bbHeight;

  const sortedContour = sortContourAsPolygon(contour);
  const contourArea = polygonArea(sortedContour);
  const extent = bbArea > 0 ? contourArea / bbArea : 0;

  const hull = convexHull(contour);
  const sortedHull = sortContourAsPolygon(hull);
  const hullArea = polygonArea(sortedHull);
  const solidity = hullArea > 0 ? Math.min(contourArea / hullArea, 1) : 0;

  const perimeter = polygonPerimeter(sortedContour);
  const circularity =
    perimeter > 0 ? clamp01((4 * Math.PI * contourArea) / (perimeter * perimeter)) : 0;

  const epsilon = 0.02 * perimeter;
  const approx = douglasPeucker(sortedContour, epsilon);
  const vertexCount = approx.length;

  let { label, confidence } = classifyShape(vertexCount, aspectRatio, solidity, extent, circularity);
  const maskAspect = Math.max(mask.rx, mask.ry) / Math.max(1, Math.min(mask.rx, mask.ry));
  const maskArea = Math.PI * mask.rx * mask.ry;
  const contourImplausible =
    aspectRatio < 0.45 ||
    aspectRatio > 2.4 ||
    contourArea < maskArea * 0.08;

  let finalAspectRatio = aspectRatio;
  let finalSolidity = solidity;

  if (contourImplausible) {
    const maskAr = mask.rx / Math.max(1, mask.ry);
    finalAspectRatio = maskAr;
    finalSolidity = Math.max(solidity, 0.9);

    const absAr = Math.max(maskAr, 1 / Math.max(1e-6, maskAr));
    if (absAr <= 1.16) {
      label = "ROUND";
      confidence = 0.84;
    } else if (absAr <= 1.8) {
      label = "OVAL";
      confidence = 0.76;
    } else {
      label = "CAPSULE";
      confidence = 0.72;
    }
  }

  if (
    (label === "DIAMOND" || label === "TRIANGLE" || label === "SQUARE" || label === "PENTAGON") &&
    maskAspect <= 1.28 &&
    circularity >= 0.52
  ) {
    label = "ROUND";
    confidence = Math.max(0.7, confidence * 0.88);
    finalAspectRatio = mask.rx / Math.max(1, mask.ry);
    finalSolidity = Math.max(finalSolidity, 0.9);
  }

  return {
    result: {
      label,
      aspectRatio: Math.round(finalAspectRatio * 1000) / 1000,
      solidity: Math.round(finalSolidity * 1000) / 1000,
      confidence,
    },
    edges,
    maskBitmap: resolvedMaskBitmap,
    contour,
    boundingBox: bb,
    approxVertices: vertexCount,
  };
}

export function detectShape(imageData: ImageDataLike, mask: OvalMask): ShapeResult {
  return detectShapeDebug(imageData, mask).result;
}
