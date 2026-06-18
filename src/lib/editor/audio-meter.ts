import type { ProgramPreviewLayer } from './preview';
import type { EditorAsset } from './types';
import { assetCanHaveWaveform, resolveAssetRuntimeWaveformPeaks, resolveAssetWaveformPeaks } from './waveform-cache';

export interface AudioMeterSample {
  left: number;
  right: number;
  peak: number;
  clipping: boolean;
  activeLayerCount: number;
  meteredLayerCount: number;
}

export type AudioMeterStatus = 'pending' | 'silent' | 'nominal' | 'hot' | 'clipping';

export interface AudioMeterReadout {
  status: AudioMeterStatus;
  label: string;
  detail: string;
  hasMeter: boolean;
  peakDb: number | null;
  leftDb: number | null;
  rightDb: number | null;
  headroomDb: number | null;
  warning?: string;
}

export interface AudioMeterReadoutOptions {
  contextLabel?: 'Program' | 'Source';
}

export interface AudioMeterWaveformOptions {
  audioPeaksByAssetId?: Record<string, number[]>;
}

export interface SourceAudioMeterOptions {
  runtimePeaks?: number[];
  range?: {
    in: number;
    out: number;
  } | null;
}

export const AUDIO_METER_SILENCE_FLOOR = 0.0001;
export const AUDIO_METER_HOT_THRESHOLD = 0.85;

export function buildProgramAudioMeter(
  layers: ProgramPreviewLayer[],
  options: AudioMeterWaveformOptions = {},
): AudioMeterSample {
  let left = 0;
  let right = 0;
  let meteredLayerCount = 0;

  for (const layer of layers) {
    const waveformPeak = readLayerWaveformPeak(layer, options);
    if (waveformPeak === undefined) {
      continue;
    }

    const volume = clamp(layer.style.volume, 0, 4);
    const pan = clamp(layer.style.pan, -1, 1);
    const angle = ((pan + 1) * Math.PI) / 4;
    left += waveformPeak * volume * Math.cos(angle);
    right += waveformPeak * volume * Math.sin(angle);
    meteredLayerCount += 1;
  }

  const roundedLeft = roundMeter(left);
  const roundedRight = roundMeter(right);
  const peak = roundMeter(Math.max(roundedLeft, roundedRight));

  return {
    left: roundedLeft,
    right: roundedRight,
    peak,
    clipping: peak >= 1,
    activeLayerCount: layers.length,
    meteredLayerCount,
  };
}

export function buildSourceAudioMeter(
  asset: EditorAsset | undefined,
  sourceTime: number,
  options: SourceAudioMeterOptions = {},
): AudioMeterSample {
  if (!asset || !assetCanHaveWaveform(asset)) {
    return emptyAudioMeterSample(0);
  }

  const peaks = resolveAssetWaveformPeaks(asset, options.runtimePeaks).peaks;
  if (!peaks?.length || asset.duration <= 0) {
    return emptyAudioMeterSample(1);
  }

  const peak = readSourceWaveformPeak(peaks, asset.duration, sourceTime, options.range);

  return {
    left: peak,
    right: peak,
    peak,
    clipping: peak >= 1,
    activeLayerCount: 1,
    meteredLayerCount: 1,
  };
}

export function resolveAudioMeterReadout(
  meter: AudioMeterSample,
  options: AudioMeterReadoutOptions = {},
): AudioMeterReadout {
  const leftDb = audioPeakToDb(meter.left);
  const rightDb = audioPeakToDb(meter.right);
  const peakDb = audioPeakToDb(meter.peak);
  const hasMeter = meter.meteredLayerCount > 0;
  const detail = `${meter.meteredLayerCount}/${meter.activeLayerCount} metered`;
  const contextLabel = options.contextLabel ?? 'Program';
  const contextName = contextLabel.toLowerCase();

  if (!hasMeter) {
    return {
      status: 'pending',
      label: 'meter pending',
      detail,
      hasMeter,
      peakDb,
      leftDb,
      rightDb,
      headroomDb: null,
      warning: meter.activeLayerCount > 0 ? `Waveform cache is required for ${contextName} audio metering.` : undefined,
    };
  }

  if (meter.peak <= AUDIO_METER_SILENCE_FLOOR) {
    return {
      status: 'silent',
      label: '-inf dB',
      detail,
      hasMeter,
      peakDb,
      leftDb,
      rightDb,
      headroomDb: null,
    };
  }

  const headroomDb = peakDb === null ? null : roundDb(-peakDb);
  if (meter.clipping) {
    return {
      status: 'clipping',
      label: `CLIP ${formatAudioMeterDb(peakDb)}`,
      detail,
      hasMeter,
      peakDb,
      leftDb,
      rightDb,
      headroomDb,
      warning: contextLabel === 'Source'
        ? 'Source audio is clipping. Normalize the source or lower clip gain after insert.'
        : 'Program audio is clipping. Lower clip gain, track gain, or normalize to a lower target.',
    };
  }

  if (meter.peak >= AUDIO_METER_HOT_THRESHOLD) {
    return {
      status: 'hot',
      label: `Hot ${formatAudioMeterDb(peakDb)}`,
      detail,
      hasMeter,
      peakDb,
      leftDb,
      rightDb,
      headroomDb,
      warning: `Only ${formatAudioMeterDb(headroomDb)} headroom before clipping.`,
    };
  }

  return {
    status: 'nominal',
    label: formatAudioMeterDb(peakDb),
    detail,
    hasMeter,
    peakDb,
    leftDb,
    rightDb,
    headroomDb,
  };
}

export function audioPeakToDb(peak: number): number | null {
  if (!Number.isFinite(peak) || peak <= AUDIO_METER_SILENCE_FLOOR) {
    return null;
  }

  return roundDb(20 * Math.log10(peak));
}

export function formatAudioMeterDb(db: number | null): string {
  if (db === null || !Number.isFinite(db)) {
    return '-inf dB';
  }

  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function resolveLayerWaveformPeaks(
  layer: ProgramPreviewLayer,
  options: AudioMeterWaveformOptions = {},
): number[] | undefined {
  if (!layer.asset) {
    return undefined;
  }

  return resolveAssetWaveformPeaks(
    layer.asset,
    resolveAssetRuntimeWaveformPeaks(layer.asset, options.audioPeaksByAssetId),
  ).peaks;
}

function readLayerWaveformPeak(
  layer: ProgramPreviewLayer,
  options: AudioMeterWaveformOptions,
): number | undefined {
  const peaks = resolveLayerWaveformPeaks(layer, options);
  if (!peaks || peaks.length === 0 || !layer.asset || layer.asset.duration <= 0) {
    return undefined;
  }

  const ratio = clamp(layer.localTime / layer.asset.duration, 0, 1);
  const center = Math.round(ratio * (peaks.length - 1));
  const start = Math.max(0, center - 1);
  const end = Math.min(peaks.length - 1, center + 1);
  let peak = 0;

  for (let index = start; index <= end; index += 1) {
    peak = Math.max(peak, clamp(Math.abs(peaks[index] ?? 0), 0, 1));
  }

  return peak;
}

function readSourceWaveformPeak(
  peaks: number[],
  duration: number,
  sourceTime: number,
  range: SourceAudioMeterOptions['range'],
): number {
  const normalizedRange = normalizeSourceAudioRange(range, sourceTime, duration);
  const startRatio = clamp(normalizedRange.in / duration, 0, 1);
  const endRatio = clamp(normalizedRange.out / duration, 0, 1);
  const startIndex = Math.floor(startRatio * (peaks.length - 1));
  const endIndex = Math.ceil(endRatio * (peaks.length - 1));
  let peak = 0;

  for (let index = startIndex; index <= Math.max(startIndex, endIndex); index += 1) {
    peak = Math.max(peak, clamp(Math.abs(peaks[index] ?? 0), 0, 1));
  }

  return roundMeter(peak);
}

function normalizeSourceAudioRange(
  range: SourceAudioMeterOptions['range'],
  sourceTime: number,
  duration: number,
): { in: number; out: number } {
  if (range && Number.isFinite(range.in) && Number.isFinite(range.out)) {
    const start = clamp(Math.min(range.in, range.out), 0, duration);
    const end = clamp(Math.max(range.in, range.out), 0, duration);
    if (end > start) {
      return { in: start, out: end };
    }
  }

  const clampedTime = clamp(sourceTime, 0, duration);
  const peakWindow = duration > 0 ? duration / 1000 : 0;
  return {
    in: clamp(clampedTime - peakWindow, 0, duration),
    out: clamp(clampedTime + peakWindow, 0, duration),
  };
}

function emptyAudioMeterSample(activeLayerCount: number): AudioMeterSample {
  return {
    left: 0,
    right: 0,
    peak: 0,
    clipping: false,
    activeLayerCount,
    meteredLayerCount: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundMeter(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundDb(value: number): number {
  return Math.round(value * 10) / 10;
}
