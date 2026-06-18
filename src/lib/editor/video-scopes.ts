export interface VideoScopePoint {
  x: number;
  y: number;
  intensity: number;
}

export interface VideoScopeChannelSeries {
  red: number[];
  green: number[];
  blue: number[];
}

export interface VideoScopeSample {
  width: number;
  height: number;
  histogram: number[];
  rgbHistogram: VideoScopeChannelSeries;
  waveform: number[];
  rgbWaveform: VideoScopeChannelSeries;
  vectorscope: VideoScopePoint[];
  averageLuma: number;
  peakLuma: number;
  lowLuma: number;
  sampledPixels: number;
}

export type VideoScopeReadoutStatus = 'pending' | 'balanced' | 'clipped' | 'underexposed' | 'overexposed' | 'low-contrast';

export interface VideoScopeReadout {
  status: VideoScopeReadoutStatus;
  label: string;
  detail: string;
  averageLuma: number;
  peakLuma: number;
  lowLuma: number;
  dynamicRange: number;
  shadowShare: number;
  highlightShare: number;
  warning?: string;
}

export interface VideoScopeOptions {
  histogramBins?: number;
  waveformColumns?: number;
  vectorscopeBins?: number;
  sampleStride?: number;
}

const DEFAULT_HISTOGRAM_BINS = 32;
const DEFAULT_WAVEFORM_COLUMNS = 32;
const DEFAULT_VECTORSCOPE_BINS = 18;
const MAX_VECTOR_POINTS = 128;

export function buildVideoScopeSampleFromRgba(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  options: VideoScopeOptions = {},
): VideoScopeSample {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  const histogramBins = normalizeBinCount(options.histogramBins, DEFAULT_HISTOGRAM_BINS, 4, 128);
  const waveformColumns = normalizeBinCount(options.waveformColumns, DEFAULT_WAVEFORM_COLUMNS, 2, 128);
  const vectorscopeBins = normalizeBinCount(options.vectorscopeBins, DEFAULT_VECTORSCOPE_BINS, 4, 64);
  const sampleStride = normalizeBinCount(options.sampleStride, 1, 1, 32);

  if (normalizedWidth === 0 || normalizedHeight === 0 || data.length < 4) {
    return buildEmptyVideoScopeSample(normalizedWidth, normalizedHeight, histogramBins, waveformColumns);
  }

  const histogramCounts = Array.from({ length: histogramBins }, () => 0);
  const rgbHistogramCounts = buildZeroChannelSeries(histogramBins);
  const waveformSums = Array.from({ length: waveformColumns }, () => 0);
  const rgbWaveformSums = buildZeroChannelSeries(waveformColumns);
  const waveformCounts = Array.from({ length: waveformColumns }, () => 0);
  const vectorscopeCounts = Array.from({ length: vectorscopeBins * vectorscopeBins }, () => 0);

  let sampledPixels = 0;
  let lumaTotal = 0;
  let peakLuma = 0;
  let lowLuma = 1;
  const availablePixels = Math.min(normalizedWidth * normalizedHeight, Math.floor(data.length / 4));

  for (let y = 0; y < normalizedHeight; y += sampleStride) {
    for (let x = 0; x < normalizedWidth; x += sampleStride) {
      const pixelIndex = y * normalizedWidth + x;
      if (pixelIndex >= availablePixels) {
        continue;
      }

      const dataIndex = pixelIndex * 4;
      const alpha = data[dataIndex + 3] ?? 255;
      if (alpha <= 0) {
        continue;
      }

      const red = clampByte(data[dataIndex]);
      const green = clampByte(data[dataIndex + 1]);
      const blue = clampByte(data[dataIndex + 2]);
      const redNorm = red / 255;
      const greenNorm = green / 255;
      const blueNorm = blue / 255;
      const luma = clampRatio(0.2126 * redNorm + 0.7152 * greenNorm + 0.0722 * blueNorm);
      const histogramIndex = Math.min(histogramBins - 1, Math.floor(luma * histogramBins));
      const redHistogramIndex = resolveHistogramIndex(redNorm, histogramBins);
      const greenHistogramIndex = resolveHistogramIndex(greenNorm, histogramBins);
      const blueHistogramIndex = resolveHistogramIndex(blueNorm, histogramBins);
      const waveformIndex = Math.min(waveformColumns - 1, Math.floor((x / normalizedWidth) * waveformColumns));
      const vectorPosition = rgbToVectorscopeBin(redNorm, blueNorm, luma, vectorscopeBins);

      histogramCounts[histogramIndex] += 1;
      rgbHistogramCounts.red[redHistogramIndex] += 1;
      rgbHistogramCounts.green[greenHistogramIndex] += 1;
      rgbHistogramCounts.blue[blueHistogramIndex] += 1;
      waveformSums[waveformIndex] += luma;
      rgbWaveformSums.red[waveformIndex] += redNorm;
      rgbWaveformSums.green[waveformIndex] += greenNorm;
      rgbWaveformSums.blue[waveformIndex] += blueNorm;
      waveformCounts[waveformIndex] += 1;
      vectorscopeCounts[vectorPosition.row * vectorscopeBins + vectorPosition.column] += 1;

      sampledPixels += 1;
      lumaTotal += luma;
      peakLuma = Math.max(peakLuma, luma);
      lowLuma = Math.min(lowLuma, luma);
    }
  }

  if (sampledPixels === 0) {
    return buildEmptyVideoScopeSample(normalizedWidth, normalizedHeight, histogramBins, waveformColumns);
  }

  const vectorPeak = Math.max(1, ...vectorscopeCounts);

  return {
    width: normalizedWidth,
    height: normalizedHeight,
    histogram: histogramCounts.map((count) => roundRatio(count / sampledPixels)),
    rgbHistogram: mapChannelSeries(rgbHistogramCounts, (counts) => (
      counts.map((count) => roundRatio(count / sampledPixels))
    )),
    waveform: waveformSums.map((sum, index) => (
      waveformCounts[index] > 0 ? roundRatio(sum / waveformCounts[index]) : 0
    )),
    rgbWaveform: mapChannelSeries(rgbWaveformSums, (sums) => (
      sums.map((sum, index) => (
        waveformCounts[index] > 0 ? roundRatio(sum / waveformCounts[index]) : 0
      ))
    )),
    vectorscope: vectorscopeCounts
      .map((count, index): VideoScopePoint | null => {
        if (count === 0) {
          return null;
        }

        const row = Math.floor(index / vectorscopeBins);
        const column = index % vectorscopeBins;
        return {
          x: roundSigned((column / Math.max(1, vectorscopeBins - 1)) * 2 - 1),
          y: roundSigned(1 - (row / Math.max(1, vectorscopeBins - 1)) * 2),
          intensity: roundRatio(count / vectorPeak),
        };
      })
      .filter((point): point is VideoScopePoint => point !== null)
      .sort((left, right) => right.intensity - left.intensity || left.x - right.x || left.y - right.y)
      .slice(0, MAX_VECTOR_POINTS),
    averageLuma: roundRatio(lumaTotal / sampledPixels),
    peakLuma: roundRatio(peakLuma),
    lowLuma: roundRatio(lowLuma),
    sampledPixels,
  };
}

export function resolveVideoScopeReadout(sample?: VideoScopeSample | null): VideoScopeReadout {
  if (!sample || sample.sampledPixels <= 0) {
    return {
      status: 'pending',
      label: 'No scope sample',
      detail: 'No sampled video frame is available.',
      averageLuma: 0,
      peakLuma: 0,
      lowLuma: 0,
      dynamicRange: 0,
      shadowShare: 0,
      highlightShare: 0,
    };
  }

  const shadowShare = roundRatio(sumHistogramLowEdge(sample.histogram, 0.1));
  const highlightShare = roundRatio(sumHistogramHighEdge(sample.histogram, 0.9));
  const dynamicRange = roundRatio(sample.peakLuma - sample.lowLuma);
  const highlightClipped = sample.peakLuma >= 0.995 && highlightShare >= 0.05;
  const shadowClipped = sample.lowLuma <= 0.005 && shadowShare >= 0.15;
  const base = {
    averageLuma: sample.averageLuma,
    peakLuma: sample.peakLuma,
    lowLuma: sample.lowLuma,
    dynamicRange,
    shadowShare,
    highlightShare,
    detail: `Avg ${formatScopePercent(sample.averageLuma)} / range ${formatScopePercent(sample.lowLuma)}-${formatScopePercent(sample.peakLuma)} / shadows ${formatScopePercent(shadowShare)} / highlights ${formatScopePercent(highlightShare)}`,
  };

  if (highlightClipped || shadowClipped) {
    const warning = highlightClipped && shadowClipped
      ? 'Highlights and shadows are clipping; review exposure or contrast before final export.'
      : highlightClipped
        ? 'Highlights are clipping; lower exposure or recover highlights before final export.'
        : 'Shadows are clipping; lift blacks or review the grade before final export.';

    return {
      ...base,
      status: 'clipped',
      label: 'Clipping',
      warning,
    };
  }

  if (dynamicRange <= 0.18) {
    return {
      ...base,
      status: 'low-contrast',
      label: 'Flat',
      warning: 'Scene has low contrast; review levels or curves before final export.',
    };
  }

  if (sample.averageLuma >= 0.72 || highlightShare >= 0.35) {
    return {
      ...base,
      status: 'overexposed',
      label: 'Bright',
      warning: 'Scene is bright; review exposure before final export.',
    };
  }

  if (sample.averageLuma <= 0.24 || shadowShare >= 0.45) {
    return {
      ...base,
      status: 'underexposed',
      label: 'Dark',
      warning: 'Scene is dark; review exposure before final export.',
    };
  }

  return {
    ...base,
    status: 'balanced',
    label: 'Balanced',
  };
}

function sumHistogramLowEdge(histogram: number[], threshold: number): number {
  if (histogram.length === 0) {
    return 0;
  }

  return histogram.reduce((sum, value, index) => {
    const binStart = index / histogram.length;
    return binStart <= threshold ? sum + clampRatio(value) : sum;
  }, 0);
}

function sumHistogramHighEdge(histogram: number[], threshold: number): number {
  if (histogram.length === 0) {
    return 0;
  }

  return histogram.reduce((sum, value, index) => {
    const binEnd = (index + 1) / histogram.length;
    return binEnd >= threshold ? sum + clampRatio(value) : sum;
  }, 0);
}

function formatScopePercent(value: number): string {
  return `${Math.round(clampRatio(value) * 100)}%`;
}

function buildEmptyVideoScopeSample(
  width: number,
  height: number,
  histogramBins: number,
  waveformColumns: number,
): VideoScopeSample {
  return {
    width,
    height,
    histogram: Array.from({ length: histogramBins }, () => 0),
    rgbHistogram: buildZeroChannelSeries(histogramBins),
    waveform: Array.from({ length: waveformColumns }, () => 0),
    rgbWaveform: buildZeroChannelSeries(waveformColumns),
    vectorscope: [],
    averageLuma: 0,
    peakLuma: 0,
    lowLuma: 0,
    sampledPixels: 0,
  };
}

function buildZeroChannelSeries(length: number): VideoScopeChannelSeries {
  return {
    red: Array.from({ length }, () => 0),
    green: Array.from({ length }, () => 0),
    blue: Array.from({ length }, () => 0),
  };
}

function mapChannelSeries(
  series: VideoScopeChannelSeries,
  mapper: (values: number[]) => number[],
): VideoScopeChannelSeries {
  return {
    red: mapper(series.red),
    green: mapper(series.green),
    blue: mapper(series.blue),
  };
}

function rgbToVectorscopeBin(
  red: number,
  blue: number,
  luma: number,
  bins: number,
): { column: number; row: number } {
  const cr = clampNumber((red - luma) / 1.5748, -0.5, 0.5);
  const cb = clampNumber((blue - luma) / 1.8556, -0.5, 0.5);
  const column = Math.round(((cr + 0.5) / 1) * (bins - 1));
  const row = Math.round(((0.5 - cb) / 1) * (bins - 1));

  return {
    column: clampInteger(column, 0, bins - 1),
    row: clampInteger(row, 0, bins - 1),
  };
}

function resolveHistogramIndex(value: number, bins: number): number {
  return Math.min(bins - 1, Math.floor(clampRatio(value) * bins));
}

function normalizeDimension(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function normalizeBinCount(value: number | undefined, fallback: number, min: number, max: number): number {
  return clampInteger(Math.round(Number.isFinite(value) ? value! : fallback), min, max);
}

function clampByte(value: number | undefined): number {
  return clampInteger(Math.round(Number.isFinite(value) ? value! : 0), 0, 255);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampRatio(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundRatio(value: number): number {
  return Math.round(clampRatio(value) * 1000) / 1000;
}

function roundSigned(value: number): number {
  return Math.round(clampNumber(value, -1, 1) * 1000) / 1000;
}
