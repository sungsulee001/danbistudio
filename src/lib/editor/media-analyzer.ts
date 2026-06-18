import { inferSupportedMediaFileKind, normalizeMediaFileMimeType } from './media-file-support';

export interface MediaAnalysis {
  duration?: number;
  width?: number;
  height?: number;
  codedWidth?: number;
  codedHeight?: number;
  sampleAspectRatio?: string;
  displayAspectRatio?: string;
  pixelAspectRatio?: number;
  exifOrientation?: number;
  rotation?: number;
  fps?: number;
  bitrate?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  sampleRate?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  warnings: string[];
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  channels?: number;
  sample_rate?: string;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  tags?: {
    rotate?: string;
  };
  side_data_list?: FfprobeStreamSideData[];
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

interface FfprobeStreamSideData {
  rotation?: number | string;
  displaymatrix?: string;
}

export function parseFfprobeOutput(output: string, mimeType = ''): MediaAnalysis {
  const parsed = JSON.parse(output) as FfprobeOutput;
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const formatDuration = parsePositiveNumber(parsed.format?.duration);
  const videoDuration = parsePositiveNumber(videoStream?.duration);
  const audioDuration = parsePositiveNumber(audioStream?.duration);
  const duration = roundTime(formatDuration ?? videoDuration ?? audioDuration ?? 0);
  const fps = parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate);
  const bitrate = parsePositiveNumber(parsed.format?.bit_rate);
  const sampleRate = parsePositiveNumber(audioStream?.sample_rate);
  const codedWidth = positiveInteger(videoStream?.width);
  const codedHeight = positiveInteger(videoStream?.height);
  const sampleAspectRatio = normalizeAspectRatioText(videoStream?.sample_aspect_ratio);
  const displayAspectRatio = normalizeAspectRatioText(videoStream?.display_aspect_ratio);
  const pixelAspectRatio = parseAspectRatio(sampleAspectRatio);
  const displayAspectRatioValue = parseAspectRatio(displayAspectRatio);
  const rotation = readVideoRotation(videoStream);
  const displayDimensions = resolveDisplayDimensions(codedWidth, codedHeight, rotation, pixelAspectRatio, displayAspectRatioValue);
  const mediaKind = inferSupportedMediaFileKind({ name: '', mimeType });

  return {
    duration: duration > 0 ? duration : undefined,
    width: displayDimensions.width,
    height: displayDimensions.height,
    codedWidth,
    codedHeight,
    sampleAspectRatio,
    displayAspectRatio,
    pixelAspectRatio,
    rotation,
    fps,
    bitrate: bitrate ? Math.round(bitrate) : undefined,
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
    audioChannels: positiveInteger(audioStream?.channels),
    sampleRate: sampleRate ? Math.round(sampleRate) : undefined,
    hasVideo: Boolean(videoStream) || mediaKind === 'image',
    hasAudio: Boolean(audioStream) || mediaKind === 'audio',
    warnings: [],
  };
}

export function applyImageOrientationMetadata(
  analysis: MediaAnalysis,
  mimeType: string,
  bytes: Uint8Array,
): MediaAnalysis {
  if (!isJpegMimeType(mimeType)) {
    return analysis;
  }

  const exifOrientation = readJpegExifOrientation(bytes);
  const exifRotation = exifOrientationToRotation(exifOrientation);
  if (!exifOrientation || !exifRotation || analysis.rotation !== undefined) {
    return exifOrientation && analysis.exifOrientation !== exifOrientation
      ? { ...analysis, exifOrientation }
      : analysis;
  }

  const displayAspectRatioValue = parseAspectRatio(analysis.displayAspectRatio);
  const displayDimensions = resolveDisplayDimensions(
    analysis.codedWidth,
    analysis.codedHeight,
    exifRotation,
    analysis.pixelAspectRatio,
    displayAspectRatioValue,
  );

  return {
    ...analysis,
    width: displayDimensions.width,
    height: displayDimensions.height,
    exifOrientation,
    rotation: exifRotation,
  };
}

export function isJpegMimeType(mimeType: string): boolean {
  const normalizedMimeType = normalizeMediaFileMimeType(mimeType);
  return normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg';
}

export function readJpegExifOrientation(bytes: Uint8Array): number | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return undefined;
    }

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) {
      return undefined;
    }
    if (offset + 2 > bytes.length) {
      return undefined;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);
    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      return undefined;
    }

    if (marker === 0xe1 && isExifPayload(bytes, segmentStart, segmentEnd)) {
      return readExifTiffOrientation(bytes, segmentStart + 6, segmentEnd);
    }

    offset = segmentEnd;
  }

  return undefined;
}

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseFrameRate(value?: string): number | undefined {
  if (!value || value === '0/0') {
    return undefined;
  }

  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? '1');

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return undefined;
  }

  const fps = numerator / denominator;
  return fps > 0 ? roundTime(fps) : undefined;
}

function readVideoRotation(stream?: FfprobeStream): number | undefined {
  if (!stream) {
    return undefined;
  }

  const sideDataRotation = stream.side_data_list
    ?.map((entry) => normalizeRotation(entry.rotation) ?? readDisplayMatrixRotation(entry.displaymatrix))
    .find((value): value is number => value !== undefined);
  if (sideDataRotation !== undefined) {
    return sideDataRotation;
  }

  return normalizeRotation(stream.tags?.rotate);
}

function readDisplayMatrixRotation(displayMatrix?: string): number | undefined {
  if (!displayMatrix) {
    return undefined;
  }

  const matrix = displayMatrix
    .split(/\r?\n/)
    .flatMap((line) => {
      const [, values = ''] = line.split(':');
      return values.match(/-?\d+/g)?.map(Number) ?? [];
    });
  if (matrix.length < 5) {
    return undefined;
  }

  const unit = 65536;
  const [a, b] = matrix;
  const c = matrix[3];
  const d = matrix[4];

  if (isNearlyMatrixValue(a, 0) && isNearlyMatrixValue(b, -unit) && isNearlyMatrixValue(c, unit) && isNearlyMatrixValue(d, 0)) {
    return 90;
  }

  if (isNearlyMatrixValue(a, -unit) && isNearlyMatrixValue(b, 0) && isNearlyMatrixValue(c, 0) && isNearlyMatrixValue(d, -unit)) {
    return 180;
  }

  if (isNearlyMatrixValue(a, 0) && isNearlyMatrixValue(b, unit) && isNearlyMatrixValue(c, -unit) && isNearlyMatrixValue(d, 0)) {
    return 270;
  }

  return undefined;
}

function resolveDisplayDimensions(
  codedWidth: number | undefined,
  codedHeight: number | undefined,
  rotation: number | undefined,
  pixelAspectRatio: number | undefined,
  displayAspectRatio: number | undefined,
): { width?: number; height?: number } {
  if (!codedWidth || !codedHeight) {
    return { width: codedWidth, height: codedHeight };
  }

  const unrotated = resolveUnrotatedDisplayDimensions(codedWidth, codedHeight, pixelAspectRatio, displayAspectRatio);
  if (rotation === 90 || rotation === 270) {
    return { width: unrotated.height, height: unrotated.width };
  }

  return unrotated;
}

function resolveUnrotatedDisplayDimensions(
  codedWidth: number,
  codedHeight: number,
  pixelAspectRatio: number | undefined,
  displayAspectRatio: number | undefined,
): { width: number; height: number } {
  if (pixelAspectRatio && Math.abs(pixelAspectRatio - 1) > 0.001) {
    return {
      width: positiveRoundedInteger(codedWidth * pixelAspectRatio),
      height: codedHeight,
    };
  }

  const codedAspectRatio = codedWidth / codedHeight;
  if (displayAspectRatio && Math.abs(displayAspectRatio - codedAspectRatio) > 0.001) {
    return {
      width: positiveRoundedInteger(codedHeight * displayAspectRatio),
      height: codedHeight,
    };
  }

  return { width: codedWidth, height: codedHeight };
}

function normalizeRotation(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  let normalized = Math.round(numeric) % 360;
  if (normalized < 0) {
    normalized += 360;
  }

  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : undefined;
}

function exifOrientationToRotation(orientation: number | undefined): number | undefined {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return undefined;
  }
}

function isNearlyMatrixValue(value: number | undefined, expected: number): boolean {
  return Math.abs((value ?? 0) - expected) <= 1024;
}

function positiveInteger(value?: number): number | undefined {
  return Number.isFinite(value) && value && value > 0 ? Math.round(value) : undefined;
}

function positiveRoundedInteger(value: number): number {
  return Math.max(1, Math.round(value));
}

function normalizeAspectRatioText(value?: string): string | undefined {
  const ratio = parseAspectRatioParts(value);
  return ratio ? `${ratio.numerator}:${ratio.denominator}` : undefined;
}

function parseAspectRatio(value?: string): number | undefined {
  const ratio = parseAspectRatioParts(value);
  if (!ratio) {
    return undefined;
  }

  return ratio.numerator / ratio.denominator;
}

function parseAspectRatioParts(value?: string): { numerator: number; denominator: number } | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === 'N/A') {
    return undefined;
  }

  const parts = normalized.split(/[:/]/);
  if (parts.length !== 2) {
    return undefined;
  }

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return undefined;
  }

  return {
    numerator: Math.round(numerator),
    denominator: Math.round(denominator),
  };
}

function isExifPayload(bytes: Uint8Array, start: number, end: number): boolean {
  return end - start >= 14 &&
    bytes[start] === 0x45 &&
    bytes[start + 1] === 0x78 &&
    bytes[start + 2] === 0x69 &&
    bytes[start + 3] === 0x66 &&
    bytes[start + 4] === 0x00 &&
    bytes[start + 5] === 0x00;
}

function readExifTiffOrientation(bytes: Uint8Array, tiffStart: number, segmentEnd: number): number | undefined {
  if (tiffStart + 8 > segmentEnd) {
    return undefined;
  }

  const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if (!littleEndian && !bigEndian) {
    return undefined;
  }

  const magic = readUint16(bytes, tiffStart + 2, littleEndian);
  if (magic !== 42) {
    return undefined;
  }

  const ifdOffset = readUint32(bytes, tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > segmentEnd) {
    return undefined;
  }

  const entryCount = readUint16(bytes, ifdStart, littleEndian);
  for (let index = 0; index < entryCount; index += 1) {
    const entryStart = ifdStart + 2 + (index * 12);
    if (entryStart + 12 > segmentEnd) {
      return undefined;
    }

    const tag = readUint16(bytes, entryStart, littleEndian);
    const type = readUint16(bytes, entryStart + 2, littleEndian);
    const count = readUint32(bytes, entryStart + 4, littleEndian);
    if (tag === 0x0112 && type === 3 && count >= 1) {
      const orientation = readUint16(bytes, entryStart + 8, littleEndian);
      return orientation >= 1 && orientation <= 8 ? orientation : undefined;
    }
  }

  return undefined;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : readUint16BigEndian(bytes, offset);
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
