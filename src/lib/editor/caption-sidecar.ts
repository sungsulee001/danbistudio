import { normalizeCaptionStyle } from './caption-style';
import type { CaptionSegment, EditorProject } from './types';

export type CaptionSidecarFormat = 'srt' | 'vtt';

export interface CaptionSidecarOptions {
  includeSpeaker?: boolean;
  maxLineLength?: number;
  includeStyleMetadata?: boolean;
  includeWordTiming?: boolean;
}

export interface CaptionSidecarBuildOptions extends CaptionSidecarOptions {
  exportRange?: {
    start: number;
    end: number;
  };
}

export interface CaptionSidecar {
  format: CaptionSidecarFormat;
  filename: string;
  mimeType: string;
  content: string;
  captionCount: number;
}

export interface ParsedCaptionSidecar {
  format: CaptionSidecarFormat;
  captions: CaptionSegment[];
  warnings: string[];
}

interface ParsedCaptionText {
  text: string;
  speaker?: string;
  words?: CaptionSegment['words'];
}

interface NormalizedCaptionSidecarOptions {
  includeSpeaker: boolean;
  maxLineLength: number;
  includeStyleMetadata: boolean;
  includeWordTiming: boolean;
}

interface NormalizedCaptionExportRange {
  start: number;
  end: number;
  duration: number;
}

export function buildCaptionSidecar(
  project: EditorProject,
  format: CaptionSidecarFormat,
  options: CaptionSidecarBuildOptions = {},
): CaptionSidecar {
  const exportRange = normalizeCaptionExportRange(project, options.exportRange);
  const captions = project.captions
    .filter((caption) => caption.end > caption.start && caption.text.trim().length > 0 && captionOverlapsExportRange(caption, exportRange))
    .map((caption) => normalizeCaptionForSidecarRange(caption, exportRange))
    .filter((caption) => caption.end > caption.start)
    .sort((a, b) => a.start - b.start);
  const extension = format === 'vtt' ? 'vtt' : 'srt';
  const normalizedOptions = normalizeSidecarOptions(options);

  return {
    format,
    filename: `${safeName(project.name || project.id)}.${extension}`,
    mimeType: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
    content: format === 'vtt' ? buildWebVtt(captions, normalizedOptions) : buildSrt(captions, normalizedOptions),
    captionCount: captions.length,
  };
}

function normalizeCaptionForSidecarRange(
  caption: CaptionSegment,
  range?: NormalizedCaptionExportRange,
): CaptionSegment {
  if (!range) {
    return caption;
  }

  return {
    ...caption,
    start: roundSeconds(Math.max(caption.start, range.start) - range.start),
    end: roundSeconds(Math.min(caption.end, range.end) - range.start),
    words: normalizeCaptionWordsForSidecarRange(caption, range),
  };
}

function normalizeCaptionWordsForSidecarRange(
  caption: CaptionSegment,
  range: NormalizedCaptionExportRange,
): CaptionSegment['words'] {
  if (!caption.words || caption.words.length === 0) {
    return undefined;
  }

  const clippedCaptionStart = Math.max(caption.start, range.start);
  const clippedCaptionEnd = Math.min(caption.end, range.end);
  const words = caption.words
    .flatMap((word) => {
      if (word.end <= clippedCaptionStart || word.start >= clippedCaptionEnd) {
        return [];
      }

      const start = roundSeconds(Math.max(word.start, clippedCaptionStart) - range.start);
      const end = roundSeconds(Math.min(word.end, clippedCaptionEnd) - range.start);
      if (end <= start) {
        return [];
      }

      return [{
        ...word,
        start,
        end,
      }];
    });

  return words.length > 0 ? words : undefined;
}

function captionOverlapsExportRange(
  caption: CaptionSegment,
  range?: NormalizedCaptionExportRange,
): boolean {
  if (!range) {
    return true;
  }

  return caption.start < range.end && caption.end > range.start;
}

function normalizeCaptionExportRange(
  project: EditorProject,
  range?: CaptionSidecarBuildOptions['exportRange'],
): NormalizedCaptionExportRange | undefined {
  if (!range) {
    return undefined;
  }

  const start = roundSeconds(clampNumber(Math.min(range.start, range.end), 0, project.duration));
  const end = roundSeconds(clampNumber(Math.max(range.start, range.end), 0, project.duration));
  const duration = roundSeconds(end - start);
  if (duration <= 0.001) {
    throw new Error('Caption export range must be longer than 0 seconds.');
  }

  return { start, end, duration };
}

export function parseCaptionSidecar(content: string, format: CaptionSidecarFormat | 'auto' = 'auto'): ParsedCaptionSidecar {
  const normalizedContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const detectedFormat: CaptionSidecarFormat = format === 'auto'
    ? (normalizedContent.toUpperCase().startsWith('WEBVTT') ? 'vtt' : 'srt')
    : format;

  return detectedFormat === 'vtt'
    ? parseWebVtt(normalizedContent)
    : parseSrt(normalizedContent);
}

function buildSrt(captions: CaptionSegment[], options: NormalizedCaptionSidecarOptions): string {
  return `${captions.map((caption, index) => [
    String(index + 1),
    `${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}`,
    formatCaptionText(caption, options),
  ].join('\n')).join('\n\n')}\n`;
}

function buildWebVtt(captions: CaptionSegment[], options: NormalizedCaptionSidecarOptions): string {
  const styleBlock = options.includeStyleMetadata ? buildWebVttStyleBlock(captions) : '';
  const cues = captions.map((caption) => [
    `${formatWebVttTime(caption.start)} --> ${formatWebVttTime(caption.end)}${options.includeStyleMetadata ? ` ${buildWebVttCueSettings(caption)}` : ''}`,
    options.includeStyleMetadata
      ? `<c.${captionCueClass(caption)}>${formatWebVttCuePayload(caption, options)}</c>`
      : formatWebVttCuePayload(caption, options),
  ].join('\n')).join('\n\n');

  return `WEBVTT\n\n${styleBlock}${cues}\n`;
}

function buildWebVttStyleBlock(captions: CaptionSegment[]): string {
  const styles = captions.map((caption) => {
    const style = normalizeCaptionStyle(caption.style);
    const background = style.boxEnabled ? hexToRgba(style.boxColor, style.boxOpacity) : 'transparent';
    const shadow = style.shadowEnabled && style.shadowOpacity > 0 && style.shadowOffset > 0
      ? hexToRgba(style.shadowColor, style.shadowOpacity)
      : undefined;

    return [
      `::cue(.${captionCueClass(caption)}) {`,
      `  color: ${style.fontColor};`,
      `  background-color: ${background};`,
      `  font-size: ${Math.round(style.fontSize)}px;`,
      ...(shadow ? [`  text-shadow: ${Math.round(style.shadowOffset)}px ${Math.round(style.shadowOffset)}px 0 ${shadow};`] : []),
      '}',
    ].join('\n');
  }).join('\n\n');

  return `STYLE\n${styles}\n\n`;
}

function buildWebVttCueSettings(caption: CaptionSegment): string {
  const style = normalizeCaptionStyle(caption.style);
  return [
    `line:${captionLinePosition(style.position)}`,
    `position:${captionHorizontalPosition(style.align)}`,
    `align:${captionCueAlign(style.align)}`,
    'size:84%',
  ].join(' ');
}

function captionLinePosition(position: ReturnType<typeof normalizeCaptionStyle>['position']): string {
  switch (position) {
    case 'top':
      return '12%';
    case 'middle':
      return '50%';
    default:
      return '88%';
  }
}

function captionHorizontalPosition(align: ReturnType<typeof normalizeCaptionStyle>['align']): string {
  switch (align) {
    case 'left':
      return '8%';
    case 'right':
      return '92%';
    default:
      return '50%';
  }
}

function captionCueAlign(align: ReturnType<typeof normalizeCaptionStyle>['align']): string {
  switch (align) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    default:
      return 'middle';
  }
}

function formatCaptionText(caption: CaptionSegment, options: NormalizedCaptionSidecarOptions): string {
  const text = normalizeCaptionTextLines(caption.text);
  const speaker = caption.speaker?.trim();
  const captionText = options.includeSpeaker && speaker ? `${speaker}: ${text}` : text;
  return wrapCaptionText(captionText, options.maxLineLength);
}

function formatWebVttCuePayload(caption: CaptionSegment, options: NormalizedCaptionSidecarOptions): string {
  if (options.includeWordTiming) {
    const wordTimedText = formatWordTimedWebVttText(caption, options);
    if (wordTimedText) {
      return wordTimedText;
    }
  }

  return escapeWebVttText(formatCaptionText(caption, options));
}

function formatWordTimedWebVttText(caption: CaptionSegment, options: NormalizedCaptionSidecarOptions): string | undefined {
  const words = normalizeCaptionWords(caption);
  if (words.length === 0) {
    return undefined;
  }

  const speaker = options.includeSpeaker ? caption.speaker?.trim() : undefined;
  const prefix = speaker ? `${escapeWebVttText(speaker)}: ` : '';
  const tokens = words.map((word) => `${buildWebVttTimestampTag(word.start)}${escapeWebVttText(word.text.trim())}`);
  return wrapWordTimedWebVttText(`${prefix}${tokens.join(' ')}`, options.maxLineLength);
}

function normalizeCaptionWords(caption: CaptionSegment): NonNullable<CaptionSegment['words']> {
  return (caption.words ?? [])
    .flatMap((word) => {
      const text = word.text.trim().replace(/\s+/g, ' ');
      if (!text || word.end <= caption.start || word.start >= caption.end) {
        return [];
      }

      const start = roundSeconds(clampNumber(word.start, caption.start, caption.end));
      const end = roundSeconds(clampNumber(word.end, caption.start, caption.end));
      if (end <= start) {
        return [];
      }

      return [{
        ...word,
        start,
        end,
        text,
      }];
    })
    .sort((a, b) => a.start - b.start);
}

function buildWebVttTimestampTag(seconds: number): string {
  return `<${formatWebVttTime(seconds)}>`;
}

function parseSrt(content: string): ParsedCaptionSidecar {
  const warnings: string[] = [];
  let captionIndex = 0;
  const captions = splitCaptionBlocks(content).flatMap((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex < 0) {
      warnings.push(`Skipped SRT block ${index + 1}: missing timecode.`);
      return [];
    }

    const timing = parseTimeRange(lines[timeLineIndex]);
    if (!timing) {
      warnings.push(`Skipped SRT block ${index + 1}: invalid timecode.`);
      return [];
    }

    const text = lines.slice(timeLineIndex + 1).join(' ');
    const captionText = splitSpeaker(stripCaptionMarkup(text));
    captionIndex += 1;
    return [buildParsedCaption(captionIndex, timing.start, timing.end, captionText.text, captionText.speaker)];
  });

  return { format: 'srt', captions, warnings };
}

function parseWebVtt(content: string): ParsedCaptionSidecar {
  const warnings: string[] = [];
  const styleByClass = parseWebVttStyles(content);
  const blocks = splitCaptionBlocks(content)
    .filter((block) => !/^(WEBVTT|STYLE|NOTE|REGION|::cue\b)(\s|$|\()/i.test(block.trim()));
  let captionIndex = 0;

  const captions = blocks.flatMap((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex < 0) {
      warnings.push(`Skipped VTT block ${index + 1}: missing timecode.`);
      return [];
    }

    const timing = parseTimeRange(lines[timeLineIndex]);
    if (!timing) {
      warnings.push(`Skipped VTT block ${index + 1}: invalid timecode.`);
      return [];
    }

    const textLines = lines.slice(timeLineIndex + 1);
    const cueClass = findWebVttCueClass(textLines.join(' '));
    const captionText = parseWebVttCaptionText(textLines.join(' '), timing);
    const cueStyle = parseWebVttCueSettings(lines[timeLineIndex]);
    const classStyle = cueClass ? styleByClass.get(cueClass) : undefined;
    captionIndex += 1;

    return [{
      ...buildParsedCaption(captionIndex, timing.start, timing.end, captionText.text, captionText.speaker),
      ...(captionText.words ? { words: captionText.words } : {}),
      style: {
        ...classStyle,
        ...cueStyle,
      },
    }];
  });

  return { format: 'vtt', captions, warnings };
}

function buildParsedCaption(
  captionNumber: number,
  start: number,
  end: number,
  text: string,
  speaker?: string,
): CaptionSegment {
  return {
    id: `caption-import-${captionNumber}`,
    start,
    end,
    text: text || 'Caption',
    speaker,
    confidence: 1,
  };
}

function splitCaptionBlocks(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseTimeRange(line: string): { start: number; end: number } | undefined {
  const match = line.match(/(?<start>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(?<end>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})/);
  if (!match?.groups) {
    return undefined;
  }

  const start = parseTimestamp(match.groups.start);
  const end = parseTimestamp(match.groups.end);
  if (start === undefined || end === undefined || end <= start) {
    return undefined;
  }

  return { start, end };
}

function parseTimestamp(value: string): number | undefined {
  const [time, fraction = '0'] = value.replace(',', '.').split('.');
  const parts = time.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) {
    return undefined;
  }

  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  if ([hours, minutes, seconds, milliseconds].some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  return roundSeconds((hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000));
}

function splitSpeaker(text: string): { text: string; speaker?: string } {
  const normalized = decodeCaptionEntities(text).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^([^:]{1,40}):\s+(.+)$/);
  if (!match) {
    return { text: normalized };
  }

  return {
    speaker: match[1].trim(),
    text: match[2].trim(),
  };
}

function parseWebVttCaptionText(text: string, timing: { start: number; end: number }): ParsedCaptionText {
  const voiceSpeaker = findWebVttVoiceSpeaker(text);
  const captionText = splitSpeaker(stripCaptionMarkup(text));
  return {
    ...captionText,
    speaker: voiceSpeaker ?? captionText.speaker,
    words: parseWebVttWordTimings(text, timing),
  };
}

function findWebVttVoiceSpeaker(text: string): string | undefined {
  const match = text.match(/<v(?:\.[^\s>]*)?\s+([^>]+)>/i);
  const speaker = match ? decodeCaptionEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return speaker || undefined;
}

function stripCaptionMarkup(text: string): string {
  return text
    .replace(/<c(?:\.[^>]*)?>/gi, '')
    .replace(/<\/c>/gi, '')
    .replace(/<(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '');
}

function parseWebVttWordTimings(text: string, cueTiming: { start: number; end: number }): CaptionSegment['words'] {
  const timestampMatches = Array.from(text.matchAll(/<((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})>/g));
  const words = timestampMatches.flatMap((match, index) => {
    const start = parseTimestamp(match[1]);
    const nextMatch = timestampMatches[index + 1];
    const end = nextMatch ? parseTimestamp(nextMatch[1]) : cueTiming.end;
    const wordText = decodeCaptionEntities(stripCaptionMarkup(text.slice(match.index + match[0].length, nextMatch?.index ?? text.length)))
      .replace(/\s+/g, ' ')
      .trim();

    if (!wordText || start === undefined || end === undefined) {
      return [];
    }

    const clampedStart = roundSeconds(clampNumber(start, cueTiming.start, cueTiming.end));
    const clampedEnd = roundSeconds(clampNumber(end, cueTiming.start, cueTiming.end));
    if (clampedEnd <= clampedStart) {
      return [];
    }

    return [{
      start: clampedStart,
      end: clampedEnd,
      text: wordText,
    }];
  });

  return words.length > 0 ? words : undefined;
}

function parseWebVttStyles(content: string): Map<string, CaptionSegment['style']> {
  const styles = new Map<string, CaptionSegment['style']>();
  const styleBlocks = Array.from(content.matchAll(/STYLE\s+([\s\S]*?)(?=\n{2,}(?:NOTE|REGION|STYLE|\d|\S+[\r\n]+(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}|$))/gi));

  styleBlocks.forEach((block) => {
    Array.from(block[1].matchAll(/::cue\(\.([a-zA-Z0-9_-]+)\)\s*\{([\s\S]*?)\}/g)).forEach((match) => {
      styles.set(match[1], parseCssCaptionStyle(match[2]));
    });
  });

  return styles;
}

function parseCssCaptionStyle(css: string): CaptionSegment['style'] {
  const style: CaptionSegment['style'] = {};
  const color = css.match(/(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})/);
  const fontSize = css.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  const background = css.match(/background-color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(?:\.\d+)?)\)/);
  const shadow = css.match(/text-shadow:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+0\s+rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(?:\.\d+)?)\)/);

  if (color) {
    style.fontColor = color[1].toLowerCase();
  }

  if (fontSize) {
    style.fontSize = Number(fontSize[1]);
  }

  if (background) {
    const red = Number(background[1]);
    const green = Number(background[2]);
    const blue = Number(background[3]);
    style.boxEnabled = true;
    style.boxColor = rgbToHex(red, green, blue);
    style.boxOpacity = Number(background[4]);
  }

  if (/background-color:\s*transparent/.test(css)) {
    style.boxEnabled = false;
  }

  if (shadow) {
    const red = Number(shadow[3]);
    const green = Number(shadow[4]);
    const blue = Number(shadow[5]);
    style.shadowEnabled = true;
    style.shadowOffset = Number(shadow[1]);
    style.shadowColor = rgbToHex(red, green, blue);
    style.shadowOpacity = Number(shadow[6]);
  }

  return style;
}

function parseWebVttCueSettings(line: string): CaptionSegment['style'] {
  const style: CaptionSegment['style'] = {};
  const lineMatch = line.match(/\sline:(\d+(?:\.\d+)?)%/);
  const alignMatch = line.match(/\salign:(start|middle|center|end|left|right)/);

  if (lineMatch) {
    const linePercent = Number(lineMatch[1]);
    style.position = linePercent <= 25 ? 'top' : linePercent >= 75 ? 'bottom' : 'middle';
  }

  if (alignMatch) {
    const align = alignMatch[1];
    style.align = align === 'start' || align === 'left'
      ? 'left'
      : align === 'end' || align === 'right'
        ? 'right'
        : 'center';
  }

  return style;
}

function findWebVttCueClass(text: string): string | undefined {
  return text.match(/<c\.([a-zA-Z0-9_-]+)>/)?.[1];
}

function formatSrtTime(seconds: number): string {
  return formatTimestamp(seconds, ',');
}

function formatWebVttTime(seconds: number): string {
  return formatTimestamp(seconds, '.');
}

function formatTimestamp(seconds: number, millisecondSeparator: ',' | '.'): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    wholeSeconds.toString().padStart(2, '0'),
  ].join(':') + `${millisecondSeparator}${milliseconds.toString().padStart(3, '0')}`;
}

function safeName(value: string): string {
  const name = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'captions';

  return isWindowsReservedPathName(name) ? `captions-${name}` : name;
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function normalizeSidecarOptions(options: CaptionSidecarOptions): NormalizedCaptionSidecarOptions {
  return {
    includeSpeaker: options.includeSpeaker ?? true,
    maxLineLength: clampInteger(options.maxLineLength ?? 0, 0, 120),
    includeStyleMetadata: options.includeStyleMetadata ?? false,
    includeWordTiming: options.includeWordTiming ?? false,
  };
}

function wrapCaptionText(text: string, maxLineLength: number): string {
  const normalized = normalizeCaptionTextLines(text);
  if (maxLineLength < 8) {
    return normalized;
  }

  return normalized
    .split('\n')
    .map((line) => wrapCaptionLine(line, maxLineLength))
    .join('\n');
}

function wrapCaptionLine(text: string, maxLineLength: number): string {
  if (text.length <= maxLineLength) {
    return text;
  }

  const lines: string[] = [];
  let currentLine = '';

  text.split(' ').forEach((word) => {
    if (!currentLine) {
      currentLine = word;
      return;
    }

    if (`${currentLine} ${word}`.length <= maxLineLength) {
      currentLine = `${currentLine} ${word}`;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

function normalizeCaptionTextLines(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function wrapWordTimedWebVttText(text: string, maxLineLength: number): string {
  if (maxLineLength < 8) {
    return text.trim();
  }

  const tokens = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  let currentVisibleLength = 0;

  tokens.forEach((token) => {
    const visibleLength = token.replace(/<\d{2}:\d{2}:\d{2}\.\d{1,3}>/g, '').length;
    if (!currentLine) {
      currentLine = token;
      currentVisibleLength = visibleLength;
      return;
    }

    if (currentVisibleLength + 1 + visibleLength <= maxLineLength) {
      currentLine = `${currentLine} ${token}`;
      currentVisibleLength += 1 + visibleLength;
      return;
    }

    lines.push(currentLine);
    currentLine = token;
    currentVisibleLength = visibleLength;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

function captionCueClass(caption: CaptionSegment): string {
  return `caption-${caption.id}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function escapeWebVttText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${roundAlpha(alpha)})`;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundAlpha(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

function decodeCaptionEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => clampInteger(value, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
