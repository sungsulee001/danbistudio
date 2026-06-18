import { getClipPlaybackSpeed } from './clip-timing';
import type { CaptionSegment, TimelineClip } from './types';

export interface SttSpeakerEncoderCaptionManifestItem {
  id: string;
  text: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  speaker?: string;
}

export interface SttSpeakerEncoderManifest {
  version: 1;
  clipId: string;
  inputPath: string;
  assetDuration: number;
  language: string;
  captions: SttSpeakerEncoderCaptionManifestItem[];
}

export interface SttSpeakerEncoderManifestOptions {
  inputPath: string;
  clip: TimelineClip;
  assetDuration: number;
  captions: CaptionSegment[];
  language?: string;
}

export interface SttSpeakerEncoderCommandTokens {
  inputPath: string;
  outputDir: string;
  manifestPath: string;
  language: string;
  clipId: string;
}

export interface SttSpeakerEncoderCommand {
  command: string;
  args: string[];
  display: string;
}

export interface SttSpeakerEncoderResult {
  captions: CaptionSegment[];
  generatedCount: number;
  preservedCount: number;
  skippedCount: number;
  warnings: string[];
}

interface SpeakerEmbeddingRecord {
  captionId: string;
  embedding: number[];
}

export function buildSttSpeakerEncoderManifest(
  options: SttSpeakerEncoderManifestOptions,
): SttSpeakerEncoderManifest {
  const captions = options.captions
    .filter((caption) => !hasValidSpeakerEmbedding(caption))
    .map((caption) => {
      const sourceRange = resolveCaptionSourceRange(caption, options.clip, options.assetDuration);
      return {
        id: caption.id,
        text: caption.text,
        start: roundNumber(caption.start),
        end: roundNumber(caption.end),
        sourceStart: sourceRange.start,
        sourceEnd: sourceRange.end,
        ...(caption.speaker ? { speaker: caption.speaker } : {}),
      };
    });

  return {
    version: 1,
    clipId: options.clip.id,
    inputPath: options.inputPath,
    assetDuration: roundNumber(Math.max(0, options.assetDuration)),
    language: normalizeLanguage(options.language),
    captions,
  };
}

export function buildSttSpeakerEncoderCommand(
  template: string,
  tokens: SttSpeakerEncoderCommandTokens,
): SttSpeakerEncoderCommand {
  const expanded = template
    .replace(/\{input\}/g, quoteArg(tokens.inputPath))
    .replace(/\{outputDir\}/g, quoteArg(tokens.outputDir))
    .replace(/\{manifest\}/g, quoteArg(tokens.manifestPath))
    .replace(/\{language\}/g, quoteArg(tokens.language))
    .replace(/\{clipId\}/g, quoteArg(tokens.clipId));
  const [command, ...args] = splitCommandLine(expanded);
  if (!command) {
    throw new Error('DANBI_STT_SPEAKER_ENCODER_COMMAND is empty after expansion.');
  }

  return {
    command,
    args,
    display: expanded,
  };
}

export function applySttSpeakerEncoderOutput(
  captions: CaptionSegment[],
  outputContent: string,
): SttSpeakerEncoderResult {
  const preservedCount = captions.filter(hasValidSpeakerEmbedding).length;
  const warnings: string[] = [];
  const records = readSpeakerEmbeddingRecords(outputContent, warnings);
  const embeddingByCaptionId = new Map(records.map((record) => [record.captionId, record.embedding]));
  let generatedCount = 0;
  let skippedCount = 0;

  const enrichedCaptions = captions.map((caption) => {
    if (hasValidSpeakerEmbedding(caption)) {
      return caption;
    }

    const embedding = embeddingByCaptionId.get(caption.id);
    if (!embedding) {
      skippedCount += 1;
      return caption;
    }

    generatedCount += 1;
    return {
      ...caption,
      speakerEmbedding: embedding,
    };
  });

  return {
    captions: generatedCount > 0 ? enrichedCaptions : captions,
    generatedCount,
    preservedCount,
    skippedCount,
    warnings,
  };
}

function readSpeakerEmbeddingRecords(content: string, warnings: string[]): SpeakerEmbeddingRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    warnings.push('External speaker encoder output was not valid JSON.');
    return [];
  }

  const rawRecords = collectRawEmbeddingRecords(data);
  return rawRecords.flatMap((item, index) => {
    const record = item as Record<string, unknown>;
    const captionId = readText(record.captionId ?? record.caption_id ?? record.id);
    const embedding = readSpeakerEmbedding(record.speakerEmbedding ?? record.speaker_embedding ?? record.embedding ?? record.vector);

    if (!captionId) {
      warnings.push(`Skipped speaker encoder record ${index + 1}: missing caption id.`);
      return [];
    }

    if (!embedding) {
      warnings.push(`Skipped speaker encoder record ${index + 1}: invalid embedding.`);
      return [];
    }

    return [{ captionId, embedding }];
  });
}

function collectRawEmbeddingRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => typeof item === 'object' && item !== null ? [item as Record<string, unknown>] : []);
  }

  if (typeof data !== 'object' || data === null) {
    return [];
  }

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.embeddings)) {
    return collectRawEmbeddingRecords(record.embeddings);
  }

  if (Array.isArray(record.captions)) {
    return collectRawEmbeddingRecords(record.captions);
  }

  return Object.entries(record).flatMap(([captionId, value]) => {
    if (['version', 'warnings', 'metadata'].includes(captionId)) {
      return [];
    }

    if (Array.isArray(value)) {
      return [{ captionId, embedding: value }];
    }

    if (typeof value === 'object' && value !== null) {
      return [{ captionId, ...(value as Record<string, unknown>) }];
    }

    return [];
  });
}

function resolveCaptionSourceRange(
  caption: CaptionSegment,
  clip: TimelineClip,
  assetDuration: number,
): { start: number; end: number } {
  const speed = getClipPlaybackSpeed(clip);
  const localStart = Math.max(0, caption.start - clip.start);
  const localEnd = Math.max(localStart, caption.end - clip.start);
  const sourceStart = clip.reversed
    ? clip.sourceIn + Math.max(0, clip.duration - localEnd) * speed
    : clip.sourceIn + localStart * speed;
  const sourceEnd = clip.reversed
    ? clip.sourceIn + Math.max(0, clip.duration - localStart) * speed
    : clip.sourceIn + localEnd * speed;

  return {
    start: roundNumber(clamp(Math.min(sourceStart, sourceEnd), 0, assetDuration)),
    end: roundNumber(clamp(Math.max(sourceStart, sourceEnd), 0, assetDuration)),
  };
}

function readSpeakerEmbedding(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4096) {
    return undefined;
  }

  const embedding = value.map((item) => typeof item === 'number' ? item : Number(item));
  if (embedding.some((item) => !Number.isFinite(item))) {
    return undefined;
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, item) => sum + item * item, 0));
  return magnitude > 0.001 ? embedding : undefined;
}

function hasValidSpeakerEmbedding(caption: CaptionSegment): boolean {
  return Array.isArray(caption.speakerEmbedding) &&
    caption.speakerEmbedding.length >= 2 &&
    caption.speakerEmbedding.every((value) => Number.isFinite(value));
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function splitCommandLine(value: string): string[] {
  const tokens = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return tokens.map((token) => token.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizeLanguage(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || 'auto';
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
