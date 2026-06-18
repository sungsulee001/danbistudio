import { parseCaptionSidecar } from './caption-sidecar';
import { getClipPlaybackSpeed, getClipSourceDuration } from './clip-timing';
import type { CaptionSegment, CaptionWordTiming, TimelineClip } from './types';

export type SttTranscriptFormat = 'json' | 'srt' | 'vtt' | 'text' | 'auto';

export interface SttTranscriptSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
  speaker?: string;
  speakerEmbedding?: number[];
  words?: SttTranscriptWord[];
}

export interface SttTranscriptWord {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface ParsedSttTranscript {
  segments: SttTranscriptSegment[];
  warnings: string[];
}

export interface AlignSttSegmentsOptions {
  speaker?: string;
  captionIdPrefix?: string;
}

export function parseSttTranscript(
  content: string,
  format: SttTranscriptFormat = 'auto',
): ParsedSttTranscript {
  const normalizedContent = content.replace(/^\uFEFF/, '').trim();
  if (!normalizedContent) {
    return { segments: [], warnings: ['STT transcript is empty.'] };
  }

  const detectedFormat = detectTranscriptFormat(normalizedContent, format);
  if (detectedFormat === 'srt' || detectedFormat === 'vtt') {
    const parsed = parseCaptionSidecar(normalizedContent, detectedFormat);
    return {
      segments: parsed.captions.map((caption) => ({
        start: caption.start,
        end: caption.end,
        text: caption.text,
        confidence: caption.confidence,
        speaker: caption.speaker,
        words: caption.words,
      })),
      warnings: parsed.warnings,
    };
  }

  if (detectedFormat === 'json') {
    return parseJsonTranscript(normalizedContent);
  }

  return {
    segments: [{
      start: 0,
      end: 5,
      text: normalizedContent.replace(/\s+/g, ' '),
      confidence: 0.5,
    }],
    warnings: ['Plain transcript has no timestamps; created one draft caption.'],
  };
}

export function alignSttSegmentsToClip(
  segments: SttTranscriptSegment[],
  clip: TimelineClip,
  options: AlignSttSegmentsOptions = {},
): CaptionSegment[] {
  const playbackSpeed = getClipPlaybackSpeed(clip);
  const sourceStart = clip.sourceIn;
  const sourceEnd = clip.sourceIn + getClipSourceDuration(clip);
  const captionIdPrefix = options.captionIdPrefix ?? `caption-stt-${clip.id}`;

  return segments
    .map((segment, index): CaptionSegment | undefined => {
      const clippedStart = Math.max(segment.start, sourceStart);
      const clippedEnd = Math.min(segment.end, sourceEnd);
      if (clippedEnd <= clippedStart || segment.text.trim().length === 0) {
        return undefined;
      }

      const start = roundTime(clip.start + ((clippedStart - sourceStart) / playbackSpeed));
      const end = roundTime(clip.start + ((clippedEnd - sourceStart) / playbackSpeed));
      if (end <= start) {
        return undefined;
      }

      const caption: CaptionSegment = {
        id: `${captionIdPrefix}-${index + 1}`,
        start,
        end,
        text: segment.text.trim().replace(/\s+/g, ' '),
        confidence: segment.confidence ?? 1,
      };
      const words = alignWordsToClip(segment.words ?? [], clip, playbackSpeed, sourceStart, clippedStart, clippedEnd, start, end);
      if (words.length > 0) {
        caption.words = words;
      }
      const speaker = segment.speaker ?? options.speaker;
      if (speaker) {
        caption.speaker = speaker;
      }
      if (segment.speakerEmbedding) {
        caption.speakerEmbedding = segment.speakerEmbedding;
      }

      return caption;
    })
    .filter((caption): caption is CaptionSegment => Boolean(caption));
}

function alignWordsToClip(
  words: SttTranscriptWord[],
  clip: TimelineClip,
  playbackSpeed: number,
  sourceStart: number,
  clippedStart: number,
  clippedEnd: number,
  captionStart: number,
  captionEnd: number,
): CaptionWordTiming[] {
  return words
    .flatMap((word): CaptionWordTiming[] => {
      const text = word.text.trim().replace(/\s+/g, ' ');
      const sourceWordStart = Math.max(word.start, clippedStart);
      const sourceWordEnd = Math.min(word.end, clippedEnd);
      if (!text || sourceWordEnd <= sourceWordStart) {
        return [];
      }

      const start = roundTime(clip.start + ((sourceWordStart - sourceStart) / playbackSpeed));
      const end = roundTime(clip.start + ((sourceWordEnd - sourceStart) / playbackSpeed));
      if (end <= start) {
        return [];
      }

      return [{
        start: clamp(start, captionStart, captionEnd),
        end: clamp(end, captionStart, captionEnd),
        text,
        confidence: word.confidence,
      }];
    })
    .filter((word) => word.end > word.start);
}

function detectTranscriptFormat(content: string, format: SttTranscriptFormat): Exclude<SttTranscriptFormat, 'auto'> {
  if (format !== 'auto') {
    return format;
  }

  if (content.startsWith('{') || content.startsWith('[')) {
    return 'json';
  }

  if (content.toUpperCase().startsWith('WEBVTT')) {
    return 'vtt';
  }

  if (/\d{2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(content)) {
    return 'srt';
  }

  return 'text';
}

function parseJsonTranscript(content: string): ParsedSttTranscript {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      segments: [],
      warnings: [`Invalid STT JSON transcript: ${(error as Error).message}`],
    };
  }

  const rawSegments = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { segments?: unknown }).segments)
      ? (parsed as { segments: unknown[] }).segments
      : [];

  if (rawSegments.length === 0) {
    const text = typeof (parsed as { text?: unknown }).text === 'string'
      ? (parsed as { text: string }).text.trim()
      : '';
    return {
      segments: text ? [{ start: 0, end: 5, text, confidence: 0.5 }] : [],
      warnings: text
        ? ['STT JSON had text but no segments; created one draft caption.']
        : ['STT JSON did not contain segments.'],
    };
  }

  const segments = rawSegments.flatMap((item, index) => {
    const record = item as Record<string, unknown>;
    const start = readNumber(record.start ?? record.start_time ?? record.from);
    const end = readNumber(record.end ?? record.end_time ?? record.to);
    const text = readText(record.text ?? record.caption ?? record.transcript);
    const confidence = readConfidence(record);
    const speaker = readText(record.speaker ?? record.speaker_label);
    const speakerEmbedding = readSpeakerEmbedding(record.speakerEmbedding ?? record.speaker_embedding ?? record.embedding);

    if (start === undefined || end === undefined || end <= start) {
      warnings.push(`Skipped STT segment ${index + 1}: invalid timing.`);
      return [];
    }

    if (!text) {
      warnings.push(`Skipped STT segment ${index + 1}: empty text.`);
      return [];
    }

    const words = readWords(record, start, end);

    return [{
      start: roundTime(start),
      end: roundTime(end),
      text,
      confidence,
      speaker,
      speakerEmbedding,
      words,
    }];
  });

  return { segments, warnings };
}

function readWords(record: Record<string, unknown>, segmentStart: number, segmentEnd: number): SttTranscriptWord[] | undefined {
  const rawWords = Array.isArray(record.words)
    ? record.words
    : Array.isArray(record.tokens)
      ? record.tokens
      : [];
  if (rawWords.length === 0) {
    return undefined;
  }

  const words = rawWords.flatMap((item) => {
    const wordRecord = item as Record<string, unknown>;
    const start = readNumber(wordRecord.start ?? wordRecord.start_time ?? wordRecord.from);
    const end = readNumber(wordRecord.end ?? wordRecord.end_time ?? wordRecord.to);
    const text = readText(wordRecord.text ?? wordRecord.word ?? wordRecord.token);
    const confidence = readConfidence(wordRecord);

    if (start === undefined || end === undefined || end <= start || !text) {
      return [];
    }

    const clippedStart = roundTime(clamp(start, segmentStart, segmentEnd));
    const clippedEnd = roundTime(clamp(end, segmentStart, segmentEnd));
    if (clippedEnd <= clippedStart) {
      return [];
    }

    return [{
      start: clippedStart,
      end: clippedEnd,
      text,
      confidence,
    }];
  });

  return words.length > 0 ? words : undefined;
}

function readNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readConfidence(record: Record<string, unknown>): number | undefined {
  const confidence = readNumber(record.confidence);
  if (confidence !== undefined) {
    return clamp(confidence, 0, 1);
  }

  const probability = readNumber(record.probability);
  if (probability !== undefined) {
    return clamp(probability, 0, 1);
  }

  const noSpeechProbability = readNumber(record.no_speech_prob);
  if (noSpeechProbability !== undefined) {
    return clamp(1 - noSpeechProbability, 0, 1);
  }

  return undefined;
}

function readSpeakerEmbedding(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const embedding = value
    .map((item) => typeof item === 'number' ? item : Number(item))
    .filter((item) => Number.isFinite(item));

  return embedding.length >= 2 ? embedding : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
