export type QualitySettings = {
  denoiseStrength: number;
  edgeBoost: number;
  colorBoost: number;
  exposureBoost: number;
  searchRadius: number;
};

export type PanoramaResult = {
  url: string;
  width: number;
  height: number;
  frames: number;
  methodLabel: string;
  qualityScore: number;
};

export type StitchDiagnostics = {
  averageConfidence: number;
  averageOverlap: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type GrayFrame = {
  data: Float32Array;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
};

type AlignmentShift = {
  dx: number;
  dy: number;
  confidence: number;
  overlap: number;
};

const MAX_OUTPUT_PIXELS = 170_000_000;
const MAX_FOCUS_PIXELS = 14_000_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`ファイル読み込み失敗: ${file.name}`));
    };

    image.src = objectUrl;
  });
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('パノラマ画像の読み込みに失敗しました。'));
    image.src = url;
  });
}

function blurGray(source: Float32Array, width: number, height: number, radius: number) {
  const output = new Float32Array(source.length);
  const resolvedRadius = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let ky = -resolvedRadius; ky <= resolvedRadius; ky += 1) {
        const sampleY = y + ky;
        if (sampleY < 0 || sampleY >= height) {
          continue;
        }

        for (let kx = -resolvedRadius; kx <= resolvedRadius; kx += 1) {
          const sampleX = x + kx;
          if (sampleX < 0 || sampleX >= width) {
            continue;
          }

          sum += source[sampleY * width + sampleX];
          count += 1;
        }
      }

      output[y * width + x] = count > 0 ? sum / count : source[y * width + x];
    }
  }

  return output;
}

function buildAlignmentFrame(image: HTMLImageElement, settings: QualitySettings): GrayFrame {
  const maxSide = 560;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(96, Math.round(image.naturalWidth * scale));
  const height = Math.max(96, Math.round(image.naturalHeight * scale));

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  if (!context) {
    return {
      data: new Float32Array(width * height),
      width,
      height,
      scaleX: image.naturalWidth / width,
      scaleY: image.naturalHeight / height,
    };
  }

  const brightness = (1 + settings.exposureBoost / 100).toFixed(3);
  const saturation = (1 + settings.colorBoost / 100).toFixed(3);
  const contrast = (1 + settings.edgeBoost / 160).toFixed(3);
  context.filter = `brightness(${brightness}) saturate(${saturation}) contrast(${contrast})`;
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';

  const imageData = context.getImageData(0, 0, width, height);
  const luminance = new Float32Array(width * height);

  for (let index = 0, cursor = 0; index < luminance.length; index += 1, cursor += 4) {
    const red = imageData.data[cursor];
    const green = imageData.data[cursor + 1];
    const blue = imageData.data[cursor + 2];
    luminance[index] = red * 0.299 + green * 0.587 + blue * 0.114;
  }

  const denoiseRadius = settings.denoiseStrength > 0.3 ? 1 : 0;
  const denoised = denoiseRadius > 0 ? blurGray(luminance, width, height, denoiseRadius) : luminance;

  if (settings.edgeBoost <= 0.05) {
    return {
      data: denoised,
      width,
      height,
      scaleX: image.naturalWidth / width,
      scaleY: image.naturalHeight / height,
    };
  }

  const boosted = new Float32Array(denoised.length);
  const gain = settings.edgeBoost * 0.16;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const center = denoised[index];
      const laplacian =
        center * 4 -
        denoised[index - 1] -
        denoised[index + 1] -
        denoised[index - width] -
        denoised[index + width];

      boosted[index] = clamp(center + laplacian * gain, 0, 255);
    }
  }

  for (let x = 0; x < width; x += 1) {
    boosted[x] = denoised[x];
    boosted[(height - 1) * width + x] = denoised[(height - 1) * width + x];
  }

  for (let y = 0; y < height; y += 1) {
    boosted[y * width] = denoised[y * width];
    boosted[y * width + (width - 1)] = denoised[y * width + (width - 1)];
  }

  return {
    data: boosted,
    width,
    height,
    scaleX: image.naturalWidth / width,
    scaleY: image.naturalHeight / height,
  };
}

function sampleDifference(
  previous: GrayFrame,
  next: GrayFrame,
  dx: number,
  dy: number,
  stride: number,
) {
  const width = Math.min(previous.width, next.width);
  const height = Math.min(previous.height, next.height);

  const startX = Math.max(0, -dx);
  const endX = Math.min(width, width - dx);
  const startY = Math.max(0, -dy);
  const endY = Math.min(height, height - dy);

  if (endX - startX < 20 || endY - startY < 20) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  let count = 0;

  for (let y = startY; y < endY; y += stride) {
    for (let x = startX; x < endX; x += stride) {
      const previousValue = previous.data[y * previous.width + x];
      const nextValue = next.data[(y + dy) * next.width + (x + dx)];
      total += Math.abs(previousValue - nextValue);
      count += 1;
    }
  }

  if (count < 120) {
    return Number.POSITIVE_INFINITY;
  }

  return total / count;
}

function estimateShift(previous: GrayFrame, next: GrayFrame, radius: number): AlignmentShift {
  const width = Math.min(previous.width, next.width);
  const height = Math.min(previous.height, next.height);

  const maxDx = Math.min(radius, Math.floor(width * 0.45));
  const maxDy = Math.min(radius, Math.floor(height * 0.45));

  let bestDx = 0;
  let bestDy = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let secondBest = Number.POSITIVE_INFINITY;

  for (let dy = -maxDy; dy <= maxDy; dy += 4) {
    for (let dx = -maxDx; dx <= maxDx; dx += 4) {
      const score = sampleDifference(previous, next, dx, dy, 6);
      if (score < bestScore) {
        secondBest = bestScore;
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      } else if (score < secondBest) {
        secondBest = score;
      }
    }
  }

  for (let dy = bestDy - 4; dy <= bestDy + 4; dy += 1) {
    for (let dx = bestDx - 4; dx <= bestDx + 4; dx += 1) {
      if (Math.abs(dx) > maxDx || Math.abs(dy) > maxDy) {
        continue;
      }

      const score = sampleDifference(previous, next, dx, dy, 3);
      if (score < bestScore) {
        secondBest = bestScore;
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      } else if (score < secondBest) {
        secondBest = score;
      }
    }
  }

  const overlapX = clamp((width - Math.abs(bestDx)) / width, 0, 1);
  const overlapY = clamp((height - Math.abs(bestDy)) / height, 0, 1);
  const overlap = (overlapX + overlapY) * 0.5;

  const safeBest = Number.isFinite(bestScore) ? bestScore : 120;
  const safeSecond = Number.isFinite(secondBest) ? secondBest : safeBest * 1.2;

  const textureQuality = clamp(1 - safeBest / 40, 0, 1);
  const scoreMargin = clamp((safeSecond - safeBest) / Math.max(safeSecond, 1), 0, 1);
  const confidence = clamp(textureQuality * 0.7 + scoreMargin * 0.3, 0.08, 0.99);

  return {
    dx: bestDx,
    dy: bestDy,
    confidence,
    overlap,
  };
}

function applyDetailBoost(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0.01) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const imageData = context.getImageData(0, 0, width, height);
  const source = imageData.data;
  const original = new Uint8ClampedArray(source);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4;
      const right = index + 4;
      const top = index - width * 4;
      const bottom = index + width * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = original[index + channel];
        const blurred =
          (original[left + channel] +
            original[right + channel] +
            original[top + channel] +
            original[bottom + channel]) *
          0.25;

        source[index + channel] = clamp(center + (center - blurred) * amount, 0, 255);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function applyDenoise(canvas: HTMLCanvasElement, strength: number) {
  if (strength <= 0.1) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const source = imageData.data;
  const snapshot = new Uint8ClampedArray(source);
  const radius = strength > 0.55 ? 2 : 1;

  for (let y = radius; y < canvas.height - radius; y += 1) {
    for (let x = radius; x < canvas.width - radius; x += 1) {
      const centerIndex = (y * canvas.width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let count = 0;

        for (let ky = -radius; ky <= radius; ky += 1) {
          for (let kx = -radius; kx <= radius; kx += 1) {
            const neighborIndex = ((y + ky) * canvas.width + (x + kx)) * 4 + channel;
            sum += snapshot[neighborIndex];
            count += 1;
          }
        }

        source[centerIndex + channel] = Math.round(sum / count);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function composePanorama(
  images: HTMLImageElement[],
  positions: Array<{ x: number; y: number }>,
  settings: QualitySettings,
) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  images.forEach((image, index) => {
    const position = positions[index];
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + image.naturalWidth);
    maxY = Math.max(maxY, position.y + image.naturalHeight);
  });

  const rawWidth = Math.max(1, Math.ceil(maxX - minX));
  const rawHeight = Math.max(1, Math.ceil(maxY - minY));
  const rawPixels = rawWidth * rawHeight;

  const scaling = rawPixels > MAX_OUTPUT_PIXELS ? Math.sqrt(MAX_OUTPUT_PIXELS / rawPixels) : 1;
  const outputWidth = Math.max(1, Math.round(rawWidth * scaling));
  const outputHeight = Math.max(1, Math.round(rawHeight * scaling));

  const canvas = createCanvas(outputWidth, outputHeight);
  const context = canvas.getContext('2d');
  if (!context) {
    return {
      canvas,
      width: outputWidth,
      height: outputHeight,
    };
  }

  const gradient = context.createLinearGradient(0, 0, outputWidth, outputHeight);
  gradient.addColorStop(0, '#070b15');
  gradient.addColorStop(1, '#05070e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, outputWidth, outputHeight);

  const brightness = (1 + settings.exposureBoost / 110).toFixed(3);
  const saturation = (1 + settings.colorBoost / 130).toFixed(3);
  const contrast = (1 + settings.edgeBoost / 220).toFixed(3);

  images.forEach((image, index) => {
    const position = positions[index];
    const drawX = (position.x - minX) * scaling;
    const drawY = (position.y - minY) * scaling;
    const drawWidth = image.naturalWidth * scaling;
    const drawHeight = image.naturalHeight * scaling;

    context.save();
    context.globalAlpha = index === 0 ? 1 : 0.87;
    context.filter = `brightness(${brightness}) saturate(${saturation}) contrast(${contrast})`;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();
  });

  const pixelCount = outputWidth * outputHeight;
  if (pixelCount <= 32_000_000) {
    applyDetailBoost(canvas, clamp(settings.edgeBoost * 0.35, 0, 1.2));
  }

  return {
    canvas,
    width: outputWidth,
    height: outputHeight,
  };
}

export async function buildPanoramaFromLibrary(
  files: File[],
  settings: QualitySettings,
  onProgress: (progress: number, message: string) => void,
): Promise<{ result: PanoramaResult; diagnostics: StitchDiagnostics }> {
  if (files.length < 2) {
    throw new Error('2枚以上の写真を選択してください。');
  }

  onProgress(0.04, '写真を読み込み中...');
  const images = await Promise.all(files.map((file) => loadImageFromFile(file)));

  onProgress(0.14, 'AI前処理: 特徴点抽出フレームを生成中...');
  const frames = images.map((image) => buildAlignmentFrame(image, settings));

  const shifts: AlignmentShift[] = [];
  const positions: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];

  for (let index = 1; index < frames.length; index += 1) {
    onProgress(
      0.14 + (index / Math.max(frames.length - 1, 1)) * 0.42,
      `高精度位置合わせ ${index}/${frames.length - 1}`,
    );

    const shift = estimateShift(frames[index - 1], frames[index], settings.searchRadius);
    shifts.push(shift);

    const previousPosition = positions[index - 1];
    const imageWidthGuard = images[index - 1].naturalWidth * 0.8;
    const imageHeightGuard = images[index - 1].naturalHeight * 0.8;

    const translatedX = clamp(
      -shift.dx * frames[index - 1].scaleX,
      -imageWidthGuard,
      imageWidthGuard,
    );
    const translatedY = clamp(
      -shift.dy * frames[index - 1].scaleY,
      -imageHeightGuard,
      imageHeightGuard,
    );

    positions.push({
      x: previousPosition.x + translatedX,
      y: previousPosition.y + translatedY,
    });
  }

  onProgress(0.62, 'ギガピクセルキャンバスへ合成中...');
  const composed = composePanorama(images, positions, settings);

  onProgress(0.9, '高精細化と書き出し中...');
  const url = composed.canvas.toDataURL('image/jpeg', 0.95);

  const averageConfidence =
    shifts.length > 0
      ? shifts.reduce((total, shift) => total + shift.confidence, 0) / shifts.length
      : 0.8;
  const averageOverlap =
    shifts.length > 0 ? shifts.reduce((total, shift) => total + shift.overlap, 0) / shifts.length : 0.8;

  const qualityScore = Math.round(clamp((averageConfidence * 0.72 + averageOverlap * 0.28) * 100, 45, 99));

  onProgress(1, '完成しました。');

  return {
    result: {
      url,
      width: composed.width,
      height: composed.height,
      frames: images.length,
      methodLabel: 'Photo Library AI Stitch',
      qualityScore,
    },
    diagnostics: {
      averageConfidence,
      averageOverlap,
    },
  };
}

export async function createFocusBoost(
  panoramaUrl: string,
  selection: NormalizedRect,
  upscaleFactor: number,
  detailAmount: number,
  denoiseStrength: number,
) {
  const image = await loadImageFromUrl(panoramaUrl);

  const cropX = clamp(Math.round(selection.x * image.naturalWidth), 0, image.naturalWidth - 1);
  const cropY = clamp(Math.round(selection.y * image.naturalHeight), 0, image.naturalHeight - 1);
  const cropWidth = clamp(Math.round(selection.w * image.naturalWidth), 64, image.naturalWidth - cropX);
  const cropHeight = clamp(Math.round(selection.h * image.naturalHeight), 64, image.naturalHeight - cropY);

  const cropCanvas = createCanvas(cropWidth, cropHeight);
  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) {
    throw new Error('切り出しキャンバスの初期化に失敗しました。');
  }

  cropContext.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  applyDenoise(cropCanvas, denoiseStrength);

  const desiredFactor = clamp(upscaleFactor, 1, 6);
  let targetWidth = Math.round(cropWidth * desiredFactor);
  let targetHeight = Math.round(cropHeight * desiredFactor);

  const maxByPixels = Math.sqrt(MAX_FOCUS_PIXELS / Math.max(1, targetWidth * targetHeight));
  const finalScale = maxByPixels < 1 ? maxByPixels : 1;
  targetWidth = Math.max(96, Math.round(targetWidth * finalScale));
  targetHeight = Math.max(96, Math.round(targetHeight * finalScale));

  const outputCanvas = createCanvas(targetWidth, targetHeight);
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) {
    throw new Error('高精細キャンバスの初期化に失敗しました。');
  }

  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(cropCanvas, 0, 0, targetWidth, targetHeight);

  applyDetailBoost(outputCanvas, clamp(detailAmount, 0, 2));

  return {
    url: outputCanvas.toDataURL('image/jpeg', 0.98),
    width: targetWidth,
    height: targetHeight,
  };
}
