export type PreviewFrameStatus = 'unknown' | 'smooth' | 'warning' | 'dropping';

export interface PreviewFrameSample {
  totalVideoFrames?: number;
  presentedFrames?: number;
  droppedVideoFrames?: number;
  corruptedVideoFrames?: number;
  timestampMs?: number;
  mediaTimeSeconds?: number;
  expectedDisplayTimeMs?: number;
  processingDurationMs?: number;
}

export interface PreviewVideoFrameCallbackMetadata {
  presentedFrames?: number;
  mediaTime?: number;
  expectedDisplayTime?: number;
  presentationTime?: number;
  processingDuration?: number;
}

export interface PreviewFrameTelemetry {
  totalFrames: number;
  droppedFrames: number;
  corruptedFrames: number;
  totalFrameDelta: number;
  droppedFrameDelta: number;
  corruptedFrameDelta: number;
  dropRate: number;
  status: PreviewFrameStatus;
  label: string;
  updatedAtMs: number;
}

export function buildPreviewFrameTelemetry(
  sample: PreviewFrameSample,
  previous?: PreviewFrameTelemetry,
): PreviewFrameTelemetry {
  const totalFrames = normalizeFrameCount(sample.totalVideoFrames ?? sample.presentedFrames);
  const droppedFrames = normalizeFrameCount(sample.droppedVideoFrames);
  const corruptedFrames = normalizeFrameCount(sample.corruptedVideoFrames);
  const totalFrameDelta = previous ? Math.max(0, totalFrames - previous.totalFrames) : 0;
  const droppedFrameDelta = previous ? Math.max(0, droppedFrames - previous.droppedFrames) : 0;
  const corruptedFrameDelta = previous ? Math.max(0, corruptedFrames - previous.corruptedFrames) : 0;
  const dropRate = totalFrameDelta > 0
    ? droppedFrameDelta / totalFrameDelta
    : totalFrames > 0
      ? droppedFrames / totalFrames
      : 0;
  const status = resolvePreviewFrameStatus(totalFrames, dropRate, droppedFrameDelta);

  return {
    totalFrames,
    droppedFrames,
    corruptedFrames,
    totalFrameDelta,
    droppedFrameDelta,
    corruptedFrameDelta,
    dropRate: roundRatio(dropRate),
    status,
    label: formatPreviewFrameLabel(status, dropRate, droppedFrames, totalFrames),
    updatedAtMs: normalizeTimestamp(sample.timestampMs),
  };
}

export function buildPreviewFrameSampleFromVideoCallback(
  metadata: PreviewVideoFrameCallbackMetadata,
  timestampMs?: number,
): PreviewFrameSample {
  const presentedFrames = normalizeFrameCount(metadata.presentedFrames);

  return {
    totalVideoFrames: presentedFrames,
    presentedFrames,
    timestampMs: normalizeTimestamp(timestampMs ?? metadata.presentationTime ?? metadata.expectedDisplayTime),
    mediaTimeSeconds: normalizeSeconds(metadata.mediaTime),
    expectedDisplayTimeMs: normalizeTimestamp(metadata.expectedDisplayTime),
    processingDurationMs: normalizeDurationMs(metadata.processingDuration),
  };
}

export function aggregatePreviewFrameTelemetry(items: PreviewFrameTelemetry[]): PreviewFrameTelemetry {
  if (items.length === 0) {
    return buildPreviewFrameTelemetry({});
  }

  const totalFrames = items.reduce((total, item) => total + item.totalFrames, 0);
  const droppedFrames = items.reduce((total, item) => total + item.droppedFrames, 0);
  const corruptedFrames = items.reduce((total, item) => total + item.corruptedFrames, 0);
  const totalFrameDelta = items.reduce((total, item) => total + item.totalFrameDelta, 0);
  const droppedFrameDelta = items.reduce((total, item) => total + item.droppedFrameDelta, 0);
  const corruptedFrameDelta = items.reduce((total, item) => total + item.corruptedFrameDelta, 0);
  const dropRate = totalFrameDelta > 0
    ? droppedFrameDelta / totalFrameDelta
    : totalFrames > 0
      ? droppedFrames / totalFrames
      : 0;
  const status = items.some((item) => item.status === 'dropping')
    ? 'dropping'
    : items.some((item) => item.status === 'warning')
      ? 'warning'
      : totalFrames > 0
        ? 'smooth'
        : 'unknown';

  return {
    totalFrames,
    droppedFrames,
    corruptedFrames,
    totalFrameDelta,
    droppedFrameDelta,
    corruptedFrameDelta,
    dropRate: roundRatio(dropRate),
    status,
    label: formatPreviewFrameLabel(status, dropRate, droppedFrames, totalFrames),
    updatedAtMs: Math.max(...items.map((item) => item.updatedAtMs)),
  };
}

function resolvePreviewFrameStatus(totalFrames: number, dropRate: number, droppedFrameDelta: number): PreviewFrameStatus {
  if (totalFrames === 0) {
    return 'unknown';
  }

  if (dropRate >= 0.15 || droppedFrameDelta >= 5) {
    return 'dropping';
  }

  if (dropRate >= 0.03 || droppedFrameDelta >= 2) {
    return 'warning';
  }

  return 'smooth';
}

function formatPreviewFrameLabel(
  status: PreviewFrameStatus,
  dropRate: number,
  droppedFrames: number,
  totalFrames: number,
): string {
  if (status === 'unknown') {
    return 'Frame stats pending';
  }

  return `${Math.round(dropRate * 100)}% dropped (${droppedFrames}/${totalFrames})`;
}

function normalizeFrameCount(value: number | undefined): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value! : 0));
}

function normalizeTimestamp(value: number | undefined): number {
  return Math.max(0, Number.isFinite(value) ? value! : Date.now());
}

function normalizeSeconds(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(0, value!) : undefined;
}

function normalizeDurationMs(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(0, value! * 1000) : undefined;
}

function roundRatio(value: number): number {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 1000) / 1000;
}
