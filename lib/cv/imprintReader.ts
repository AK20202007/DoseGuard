export interface OvalMask {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ImprintResult {
  text: string;
  confidence: number;
}

function insideMask(
  x: number,
  y: number,
  width: number,
  mask: OvalMask,
  maskBitmap?: Uint8Array,
): boolean {
  if (maskBitmap && maskBitmap.length > 0) {
    const idx = y * width + x;
    if (idx >= 0 && idx < maskBitmap.length) {
      return maskBitmap[idx] === 1;
    }
  }
  const dx = (x - mask.cx) / mask.rx;
  const dy = (y - mask.cy) / mask.ry;
  return dx * dx + dy * dy <= 1;
}

function applyMask(imageData: ImageData, mask: OvalMask, maskBitmap?: Uint8Array): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (insideMask(x, y, width, mask, maskBitmap)) {
        const i = (y * width + x) * 4;
        gray[y * width + x] = Math.round(
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        );
      }
    }
  }

  return gray;
}

function applyCLAHE(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  mask: OvalMask,
  maskBitmap?: Uint8Array,
  tileCountX = 8,
  tileCountY = 8,
  clipLimit = 4.0
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(gray.length);
  const tileW = Math.ceil(width / tileCountX);
  const tileH = Math.ceil(height / tileCountY);

  const tileCDFs: Float32Array[][] = [];

  for (let ty = 0; ty < tileCountY; ty++) {
    tileCDFs[ty] = [];
    for (let tx = 0; tx < tileCountX; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, width);
      const y1 = Math.min(y0 + tileH, height);

      const hist = new Float32Array(256);
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (insideMask(x, y, width, mask, maskBitmap)) {
            hist[gray[y * width + x]]++;
            count++;
          }
        }
      }

      if (count === 0) {
        const cdf = new Float32Array(256);
        for (let i = 0; i < 256; i++) cdf[i] = i / 255;
        tileCDFs[ty][tx] = cdf;
        continue;
      }

      const clipThreshold = Math.max(1, clipLimit * count / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipThreshold) {
          excess += hist[i] - clipThreshold;
          hist[i] = clipThreshold;
        }
      }
      const redistribute = excess / 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += redistribute;
      }

      const cdf = new Float32Array(256);
      let cumSum = 0;
      for (let i = 0; i < 256; i++) {
        cumSum += hist[i];
        cdf[i] = cumSum / count;
      }

      tileCDFs[ty][tx] = cdf;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!insideMask(x, y, width, mask, maskBitmap)) {
        output[y * width + x] = gray[y * width + x];
        continue;
      }

      const val = gray[y * width + x];

      const txf = (x - tileW / 2) / tileW;
      const tyf = (y - tileH / 2) / tileH;

      const tx0 = Math.max(0, Math.floor(txf));
      const ty0 = Math.max(0, Math.floor(tyf));
      const tx1 = Math.min(tileCountX - 1, tx0 + 1);
      const ty1 = Math.min(tileCountY - 1, ty0 + 1);

      const fx = Math.max(0, Math.min(1, txf - tx0));
      const fy = Math.max(0, Math.min(1, tyf - ty0));

      const v00 = tileCDFs[ty0][tx0][val];
      const v10 = tileCDFs[ty0][tx1][val];
      const v01 = tileCDFs[ty1][tx0][val];
      const v11 = tileCDFs[ty1][tx1][val];

      const interpolated =
        (1 - fy) * ((1 - fx) * v00 + fx * v10) +
        fy * ((1 - fx) * v01 + fx * v11);

      output[y * width + x] = Math.round(interpolated * 255);
    }
  }

  return output;
}

function grayToImageData(gray: Uint8ClampedArray, width: number, height: number): ImageData {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = gray[i];
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function getMaskBounds(width: number, height: number, mask: OvalMask, maskBitmap?: Uint8Array): Bounds {
  if (maskBitmap && maskBitmap.length === width * height) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < maskBitmap.length; i++) {
      if (!maskBitmap[i]) continue;
      const y = Math.floor(i / width);
      const x = i - y * width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (maxX >= minX && maxY >= minY) {
      const pad = 4;
      return {
        minX: Math.max(0, minX - pad),
        minY: Math.max(0, minY - pad),
        maxX: Math.min(width - 1, maxX + pad),
        maxY: Math.min(height - 1, maxY + pad),
      };
    }
  }

  return {
    minX: Math.max(0, Math.floor(mask.cx - mask.rx - 4)),
    minY: Math.max(0, Math.floor(mask.cy - mask.ry - 4)),
    maxX: Math.min(width - 1, Math.ceil(mask.cx + mask.rx + 4)),
    maxY: Math.min(height - 1, Math.ceil(mask.cy + mask.ry + 4)),
  };
}

function meanGrayInMask(
  gray: Uint8ClampedArray,
  width: number,
  bounds: Bounds,
  mask: OvalMask,
  maskBitmap?: Uint8Array,
): number {
  let sum = 0;
  let count = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!insideMask(x, y, width, mask, maskBitmap)) continue;
      sum += gray[y * width + x];
      count++;
    }
  }
  return count > 0 ? sum / count : 128;
}

function thresholdGray(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  mask: OvalMask,
  threshold: number,
  invert: boolean,
  maskBitmap?: Uint8Array,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!insideMask(x, y, width, mask, maskBitmap)) {
        out[idx] = 255;
        continue;
      }
      const on = gray[idx] >= threshold;
      const value = invert ? (on ? 0 : 255) : on ? 255 : 0;
      out[idx] = value;
    }
  }
  return out;
}

function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function cropAndScaleCanvas(source: HTMLCanvasElement, bounds: Bounds, scale: number): HTMLCanvasElement {
  const cropWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const cropHeight = Math.max(1, bounds.maxY - bounds.minY + 1);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cropWidth * scale));
  out.height = Math.max(1, Math.round(cropHeight * scale));
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, bounds.minX, bounds.minY, cropWidth, cropHeight, 0, 0, out.width, out.height);
  }
  return out;
}

function normalizeOcrText(text: string): { display: string; compact: string } {
  const display = text
    .toUpperCase()
    .replace(/[^A-Z0-9-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = display.replace(/\s+/g, '');
  return { display, compact };
}

export async function readImprint(
  imageData: ImageData,
  mask: OvalMask,
  maskBitmap?: Uint8Array,
): Promise<ImprintResult> {
  const { width, height } = imageData;
  const resolvedMaskBitmap =
    maskBitmap && maskBitmap.length === width * height ? maskBitmap : undefined;
  const bounds = getMaskBounds(width, height, mask, resolvedMaskBitmap);

  const gray = applyMask(imageData, mask, resolvedMaskBitmap);
  const enhanced = applyCLAHE(gray, width, height, mask, resolvedMaskBitmap);
  const mean = meanGrayInMask(enhanced, width, bounds, mask, resolvedMaskBitmap);
  const threshold = Math.max(48, Math.min(212, mean * 0.92));

  const enhancedImageData = grayToImageData(enhanced, width, height);
  const binaryImageData = grayToImageData(
    thresholdGray(enhanced, width, height, mask, threshold, false, resolvedMaskBitmap),
    width,
    height,
  );
  const invertedBinaryImageData = grayToImageData(
    thresholdGray(enhanced, width, height, mask, threshold, true, resolvedMaskBitmap),
    width,
    height,
  );

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      preserve_interword_spaces: '1',
    } as Record<string, string>);

    const sourceVariants = [
      { image: enhancedImageData, scale: 2.4, psm: '7' },
      { image: binaryImageData, scale: 3.2, psm: '7' },
      { image: invertedBinaryImageData, scale: 3.2, psm: '7' },
      { image: binaryImageData, scale: 3.2, psm: '8' },
    ];

    let bestText = '';
    let bestConfidence = 0;
    let bestScore = -Infinity;

    for (const variant of sourceVariants) {
      await worker.setParameters({ tessedit_pageseg_mode: variant.psm } as Record<string, string>);
      const sourceCanvas = imageDataToCanvas(variant.image);
      const roiCanvas = cropAndScaleCanvas(sourceCanvas, bounds, variant.scale);
      const { data } = await worker.recognize(roiCanvas);

      const normalized = normalizeOcrText(data.text ?? '');
      const confidence = Math.max(0, Math.min(1, data.confidence / 100));
      const hasText = normalized.compact.length > 0;
      const score =
        (hasText ? 0.65 : 0) +
        0.35 * confidence +
        Math.min(0.2, normalized.compact.length * 0.02);

      if (score > bestScore) {
        bestScore = score;
        bestText = normalized.display;
        bestConfidence = hasText ? confidence : confidence * 0.35;
      }
    }

    return {
      text: bestText,
      confidence: bestConfidence,
    };
  } finally {
    await worker.terminate();
  }
}
