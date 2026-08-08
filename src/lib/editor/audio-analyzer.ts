import { audioPeakToDb, formatAudioMeterDb, resolveLayerWaveformPeaks, type AudioMeterWaveformOptions } from './audio-meter';
import type { ProgramPreviewLayer } from './preview';

export interface AudioAnalyzerBand {
  id: 'recent' | 'now' | 'next';
  label: string;
  value: number;
  db: number | null;
}

export interface ProgramAudioFftBand {
  id: 'low' | 'mid' | 'high';
  label: string;
  value: number;
  db: number | null;
}

export interface ProgramAudioFftLayerSample {
  layerId: string;
  frequencyBinCount: number;
  peak: number;
  average: number;
  bands: ProgramAudioFftBand[];
}

export interface ProgramAudioFftSample {
  sourceLayerCount: number;
  capturedLayerCount: number;
  frequencyBinCount: number;
  peak: number;
  average: number;
  bands: ProgramAudioFftBand[];
}

export type AudioAnalyzerStatus = 'pending' | 'silent' | 'balanced' | 'left-heavy' | 'right-heavy' | 'dense' | 'wide' | 'live';

export interface ProgramAudioAnalyzerSample {
  activeLayerCount: number;
  analyzedLayerCount: number;
  peak: number;
  rms: number;
  crestFactorDb: number | null;
  balance: number;
  density: number;
  monoCompatibility: number | null;
  bands: AudioAnalyzerBand[];
  fft?: ProgramAudioFftSample;
}

export interface AudioAnalyzerReadout {
  status: AudioAnalyzerStatus;
  label: string;
  detail: string;
  peakDb: number | null;
  rmsDb: number | null;
  crestFactorDb: number | null;
  monoCompatibility: number | null;
  warning?: string;
}

const ANALYZER_SILENCE_FLOOR = 0.0001;
const DEFAULT_WINDOW_RADIUS = 4;
const FFT_BANDS: Array<Pick<ProgramAudioFftBand, 'id' | 'label'>> = [
  { id: 'low', label: 'Low' },
  { id: 'mid', label: 'Mid' },
  { id: 'high', label: 'High' },
];

export function buildProgramAudioAnalyzer(
  layers: ProgramPreviewLayer[],
  options: AudioMeterWaveformOptions & { windowRadius?: number } = {},
): ProgramAudioAnalyzerSample {
  const windowRadius = Math.max(1, Math.min(16, Math.round(options.windowRadius ?? DEFAULT_WINDOW_RADIUS)));
  const bandSums = [0, 0, 0];
  const bandCounts = [0, 0, 0];
  let analyzedLayerCount = 0;
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  let midEnergy = 0;
  let sideEnergy = 0;

  for (const layer of layers) {
    const peaks = resolveLayerWaveformPeaks(layer, options);
    if (!peaks?.length || !layer.asset || layer.asset.duration <= 0) {
      continue;
    }

    const ratio = clamp(layer.localTime / layer.asset.duration, 0, 1);
    const center = Math.round(ratio * (peaks.length - 1));
    const start = Math.max(0, center - windowRadius);
    const end = Math.min(peaks.length - 1, center + windowRadius);
    const volume = clamp(layer.style.volume, 0, 4);
    const pan = clamp(layer.style.pan, -1, 1);
    const angle = ((pan + 1) * Math.PI) / 4;
    const leftGain = Math.cos(angle);
    const rightGain = Math.sin(angle);

    analyzedLayerCount += 1;

    for (let index = start; index <= end; index += 1) {
      const normalizedPeak = clamp(Math.abs(peaks[index] ?? 0), 0, 1) * volume;
      const left = normalizedPeak * leftGain;
      const right = normalizedPeak * rightGain;
      const mixed = Math.max(left, right);
      const mid = (left + right) / Math.SQRT2;
      const side = (left - right) / Math.SQRT2;
      const bandIndex = index < center ? 0 : index === center ? 1 : 2;

      peak = Math.max(peak, mixed);
      sumSquares += mixed * mixed;
      leftEnergy += left * left;
      rightEnergy += right * right;
      midEnergy += mid * mid;
      sideEnergy += side * side;
      sampleCount += 1;
      bandSums[bandIndex] += mixed;
      bandCounts[bandIndex] += 1;
    }
  }

  const rms = sampleCount > 0 ? roundAudioAnalyzerValue(Math.sqrt(sumSquares / sampleCount)) : 0;
  const roundedPeak = roundAudioAnalyzerValue(peak);
  const density = roundedPeak > ANALYZER_SILENCE_FLOOR
    ? roundAudioAnalyzerValue(rms / roundedPeak)
    : 0;
  const crestFactorDb = roundedPeak > ANALYZER_SILENCE_FLOOR && rms > ANALYZER_SILENCE_FLOOR
    ? roundAnalyzerDb((audioPeakToDb(roundedPeak) ?? 0) - (audioPeakToDb(rms) ?? 0))
    : null;
  const balance = leftEnergy + rightEnergy > ANALYZER_SILENCE_FLOOR
    ? roundAudioAnalyzerValue((Math.sqrt(rightEnergy) - Math.sqrt(leftEnergy)) / (Math.sqrt(rightEnergy) + Math.sqrt(leftEnergy)))
    : 0;
  const monoCompatibility = midEnergy + sideEnergy > ANALYZER_SILENCE_FLOOR
    ? roundAudioAnalyzerValue(clamp((midEnergy - sideEnergy) / (midEnergy + sideEnergy), -1, 1))
    : null;

  return {
    activeLayerCount: layers.length,
    analyzedLayerCount,
    peak: roundedPeak,
    rms,
    crestFactorDb,
    balance,
    density,
    monoCompatibility,
    bands: [
      buildAnalyzerBand('recent', 'Recent', bandSums[0], bandCounts[0]),
      buildAnalyzerBand('now', 'Now', bandSums[1], bandCounts[1]),
      buildAnalyzerBand('next', 'Next', bandSums[2], bandCounts[2]),
    ],
  };
}

export function resolveAudioAnalyzerReadout(sample: ProgramAudioAnalyzerSample): AudioAnalyzerReadout {
  const liveFft = sample.fft && sample.fft.capturedLayerCount > 0 ? sample.fft : undefined;
  const peakDb = audioPeakToDb(sample.peak > ANALYZER_SILENCE_FLOOR ? sample.peak : liveFft?.peak ?? sample.peak);
  const rmsDb = audioPeakToDb(sample.rms > ANALYZER_SILENCE_FLOOR ? sample.rms : liveFft?.average ?? sample.rms);
  const base = {
    peakDb,
    rmsDb,
    crestFactorDb: sample.crestFactorDb,
    monoCompatibility: sample.monoCompatibility,
  };

  if (sample.analyzedLayerCount === 0) {
    if (liveFft) {
      if (liveFft.peak <= ANALYZER_SILENCE_FLOOR || liveFft.average <= ANALYZER_SILENCE_FLOOR) {
        return {
          ...base,
          status: 'silent',
          label: 'FFT silent',
          detail: formatFftReadout(liveFft),
        };
      }

      return {
        ...base,
        status: 'live',
        label: 'FFT live',
        detail: formatFftReadout(liveFft),
      };
    }

    return {
      ...base,
      status: 'pending',
      label: 'Analyzer pending',
      detail: `${sample.analyzedLayerCount}/${sample.activeLayerCount} analyzed`,
      warning: sample.activeLayerCount > 0 ? 'Waveform cache is required for program audio analysis.' : undefined,
    };
  }

  if (sample.peak <= ANALYZER_SILENCE_FLOOR || sample.rms <= ANALYZER_SILENCE_FLOOR) {
    return {
      ...base,
      status: 'silent',
      label: 'Silent',
      detail: `${sample.analyzedLayerCount}/${sample.activeLayerCount} analyzed`,
    };
  }

  const waveformDetail = `RMS ${formatAudioMeterDb(rmsDb)} / crest ${formatAudioMeterDb(sample.crestFactorDb)}`;
  const detail = liveFft ? `${waveformDetail} / ${formatFftReadout(liveFft)}` : waveformDetail;
  if (sample.balance <= -0.35) {
    return {
      ...base,
      status: 'left-heavy',
      label: 'Left heavy',
      detail,
      warning: 'Program audio is weighted left; review track pan or source balance.',
    };
  }

  if (sample.balance >= 0.35) {
    return {
      ...base,
      status: 'right-heavy',
      label: 'Right heavy',
      detail,
      warning: 'Program audio is weighted right; review track pan or source balance.',
    };
  }

  if (sample.density >= 0.78 && sample.crestFactorDb !== null && sample.crestFactorDb <= 2.5) {
    return {
      ...base,
      status: 'dense',
      label: 'Dense',
      detail,
      warning: 'Program audio has low crest factor; review compression or limiter settings.',
    };
  }

  if (sample.monoCompatibility !== null && sample.monoCompatibility <= 0.25) {
    return {
      ...base,
      status: 'wide',
      label: 'Wide',
      detail,
      warning: 'Program audio is very wide; check mono compatibility before export.',
    };
  }

  return {
    ...base,
    status: 'balanced',
    label: 'Balanced',
    detail,
  };
}

export function buildProgramAudioFftLayerSample(
  layerId: string,
  frequencyData: ArrayLike<number>,
): ProgramAudioFftLayerSample {
  const bins = Array.from({ length: frequencyData.length }, (_, index) => normalizeFrequencyValue(frequencyData[index] ?? 0));
  let peak = 0;
  let sum = 0;

  for (const value of bins) {
    peak = Math.max(peak, value);
    sum += value;
  }

  return {
    layerId,
    frequencyBinCount: bins.length,
    peak: roundAudioAnalyzerValue(peak),
    average: bins.length > 0 ? roundAudioAnalyzerValue(sum / bins.length) : 0,
    bands: buildFftBands(bins),
  };
}

export function buildProgramAudioFftSample(
  layerSamples: ProgramAudioFftLayerSample[],
  options: { sourceLayerCount?: number } = {},
): ProgramAudioFftSample {
  const capturedSamples = layerSamples.filter((sample) => sample.frequencyBinCount > 0);
  const bandSums = new Map<ProgramAudioFftBand['id'], number>(FFT_BANDS.map((band) => [band.id, 0]));
  let peak = 0;
  let averageSum = 0;
  let frequencyBinCount = 0;

  for (const sample of capturedSamples) {
    peak = Math.max(peak, sample.peak);
    averageSum += sample.average;
    frequencyBinCount = Math.max(frequencyBinCount, sample.frequencyBinCount);
    for (const band of sample.bands) {
      bandSums.set(band.id, (bandSums.get(band.id) ?? 0) + band.value);
    }
  }

  const capturedLayerCount = capturedSamples.length;
  return {
    sourceLayerCount: Math.max(0, options.sourceLayerCount ?? capturedLayerCount),
    capturedLayerCount,
    frequencyBinCount,
    peak: roundAudioAnalyzerValue(peak),
    average: capturedLayerCount > 0 ? roundAudioAnalyzerValue(averageSum / capturedLayerCount) : 0,
    bands: FFT_BANDS.map((band) => {
      const value = capturedLayerCount > 0
        ? roundAudioAnalyzerValue((bandSums.get(band.id) ?? 0) / capturedLayerCount)
        : 0;
      return {
        ...band,
        value,
        db: audioPeakToDb(value),
      };
    }),
  };
}

/**
 * 프로그램 모니터 FFT는 진단 표시용이라 재생 중 매 프레임 편집기 최상위 상태를 갱신할 이유가 없다.
 * 갱신 주기를 제한하고 값이 같은 샘플을 걸러야 재생 중 전체 트리 리렌더가 폭주하지 않는다.
 */
export const PROGRAM_AUDIO_FFT_EMIT_INTERVAL_MS = 250;

export function isSameProgramAudioFftSample(
  previous: ProgramAudioFftSample | null | undefined,
  next: ProgramAudioFftSample | null | undefined,
): boolean {
  if (!previous || !next) {
    return !previous && !next;
  }

  return (
    previous.sourceLayerCount === next.sourceLayerCount &&
    previous.capturedLayerCount === next.capturedLayerCount &&
    previous.frequencyBinCount === next.frequencyBinCount &&
    previous.peak === next.peak &&
    previous.average === next.average &&
    previous.bands.length === next.bands.length &&
    previous.bands.every((band, index) => (
      band.id === next.bands[index]?.id && band.value === next.bands[index]?.value
    ))
  );
}

export function shouldEmitProgramAudioFftSample({
  previous,
  next,
  lastEmitAt,
  now,
  minIntervalMs = PROGRAM_AUDIO_FFT_EMIT_INTERVAL_MS,
}: {
  previous: ProgramAudioFftSample | null | undefined;
  next: ProgramAudioFftSample;
  lastEmitAt: number;
  now: number;
  minIntervalMs?: number;
}): boolean {
  if (isSameProgramAudioFftSample(previous, next)) {
    return false;
  }

  // 레이어 수가 바뀌면 클립 경계 전환이므로 스로틀을 건너뛴다.
  if (previous?.sourceLayerCount !== next.sourceLayerCount || previous?.capturedLayerCount !== next.capturedLayerCount) {
    return true;
  }

  return now - lastEmitAt >= minIntervalMs;
}

function buildAnalyzerBand(
  id: AudioAnalyzerBand['id'],
  label: string,
  sum: number,
  count: number,
): AudioAnalyzerBand {
  const value = count > 0 ? roundAudioAnalyzerValue(sum / count) : 0;
  return {
    id,
    label,
    value,
    db: audioPeakToDb(value),
  };
}

function buildFftBands(bins: number[]): ProgramAudioFftBand[] {
  const third = Math.max(1, Math.ceil(bins.length / 3));
  return FFT_BANDS.map((band, index) => {
    const start = index * third;
    const end = index === FFT_BANDS.length - 1 ? bins.length : Math.min(bins.length, start + third);
    const values = bins.slice(start, end);
    const value = values.length > 0
      ? roundAudioAnalyzerValue(values.reduce((sum, item) => sum + item, 0) / values.length)
      : 0;

    return {
      ...band,
      value,
      db: audioPeakToDb(value),
    };
  });
}

function formatFftReadout(sample: ProgramAudioFftSample): string {
  const values = sample.bands.map((band) => `${Math.round(band.value * 100)}%`).join('/');
  return `FFT ${sample.capturedLayerCount}/${sample.sourceLayerCount} layers L/M/H ${values}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeFrequencyValue(value: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return clamp(finiteValue > 1 ? finiteValue / 255 : finiteValue, 0, 1);
}

function roundAudioAnalyzerValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundAnalyzerDb(value: number): number {
  return Math.round(value * 10) / 10;
}
