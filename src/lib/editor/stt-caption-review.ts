import type { CaptionSegment, CaptionWordTiming, EditorProject } from './types';

export type SttCaptionReviewIssueKind =
  | 'empty-text'
  | 'low-confidence'
  | 'too-short'
  | 'too-long'
  | 'too-fast'
  | 'missing-speaker'
  | 'word-timing-drift';

export type SttCaptionReviewSeverity = 'warning' | 'blocked';

export interface SttCaptionReviewOptions {
  targetCaptionIds?: string[];
  includeNonStt?: boolean;
  requireSpeaker?: boolean;
  confidenceThreshold?: number;
  minDuration?: number;
  maxDuration?: number;
  maxCharsPerSecond?: number;
  mergeGap?: number;
  maxMergeDuration?: number;
}

export interface SttCaptionReviewIssue {
  id: string;
  captionId: string;
  kind: SttCaptionReviewIssueKind;
  severity: SttCaptionReviewSeverity;
  message: string;
  action: string;
}

export interface SttCaptionReviewReport {
  captionCount: number;
  issueCount: number;
  blockedCount: number;
  lowConfidenceCount: number;
  timingIssueCount: number;
  readabilityIssueCount: number;
  textIssueCount: number;
  wordTimedCaptionCount: number;
  targetCaptionIds: string[];
  issues: SttCaptionReviewIssue[];
}

export interface SttCaptionCleanupResult {
  project: EditorProject;
  changedCaptionCount: number;
  mergedCaptionCount: number;
  removedCaptionCount: number;
  selectedCaptionIds: string[];
}

interface NormalizedSttCaptionReviewOptions {
  targetCaptionIds?: Set<string>;
  includeNonStt: boolean;
  requireSpeaker: boolean;
  confidenceThreshold: number;
  minDuration: number;
  maxDuration: number;
  maxCharsPerSecond: number;
  mergeGap: number;
  maxMergeDuration: number;
}

export function buildSttCaptionReview(
  projectOrCaptions: EditorProject | CaptionSegment[],
  options: SttCaptionReviewOptions = {},
): SttCaptionReviewReport {
  const captions = Array.isArray(projectOrCaptions) ? projectOrCaptions : projectOrCaptions.captions;
  const normalizedOptions = normalizeOptions(options);
  const targetCaptions = captions.filter((caption) => shouldReviewCaption(caption, normalizedOptions));
  const issues = targetCaptions.flatMap((caption) => buildCaptionIssues(caption, normalizedOptions));

  return {
    captionCount: targetCaptions.length,
    issueCount: issues.length,
    blockedCount: issues.filter((issue) => issue.severity === 'blocked').length,
    lowConfidenceCount: issues.filter((issue) => issue.kind === 'low-confidence').length,
    timingIssueCount: issues.filter((issue) => issue.kind === 'too-short' || issue.kind === 'too-long' || issue.kind === 'word-timing-drift').length,
    readabilityIssueCount: issues.filter((issue) => issue.kind === 'too-fast').length,
    textIssueCount: issues.filter((issue) => issue.kind === 'empty-text' || issue.kind === 'missing-speaker').length,
    wordTimedCaptionCount: targetCaptions.filter((caption) => (caption.words?.length ?? 0) > 0).length,
    targetCaptionIds: targetCaptions.map((caption) => caption.id),
    issues,
  };
}

export function cleanSttCaptions(
  project: EditorProject,
  options: SttCaptionReviewOptions = {},
): SttCaptionCleanupResult {
  const normalizedOptions = normalizeOptions(options);
  const originalCaptions = project.captions.slice().sort((a, b) => a.start - b.start);
  const cleanedCaptions: CaptionSegment[] = [];
  let changedCaptionCount = 0;
  let mergedCaptionCount = 0;
  let removedCaptionCount = 0;

  for (let index = 0; index < originalCaptions.length; index += 1) {
    const caption = originalCaptions[index];
    if (!shouldReviewCaption(caption, normalizedOptions)) {
      cleanedCaptions.push(caption);
      continue;
    }

    const nextCaption = originalCaptions[index + 1];
    let cleaned = normalizeCaption(caption, nextCaption, normalizedOptions);
    if (!cleaned.text) {
      removedCaptionCount += 1;
      changedCaptionCount += 1;
      continue;
    }

    while (
      index + 1 < originalCaptions.length
      && shouldMergeCaptions(cleaned, originalCaptions[index + 1], normalizedOptions)
    ) {
      const next = normalizeCaption(originalCaptions[index + 1], originalCaptions[index + 2], normalizedOptions);
      cleaned = mergeCleanedCaptions(cleaned, next);
      index += 1;
      mergedCaptionCount += 1;
      changedCaptionCount += 1;
    }

    if (!captionsEqual(caption, cleaned)) {
      changedCaptionCount += 1;
    }
    cleanedCaptions.push(cleaned);
  }

  const selectedCaptionIds = cleanedCaptions
    .filter((caption) => shouldReviewCaption(caption, normalizedOptions))
    .map((caption) => caption.id);
  const nextProject = changedCaptionCount === 0 && mergedCaptionCount === 0 && removedCaptionCount === 0
    ? project
    : {
      ...project,
      captions: cleanedCaptions.sort((a, b) => a.start - b.start),
      updatedAt: new Date().toISOString(),
    };

  return {
    project: nextProject,
    changedCaptionCount,
    mergedCaptionCount,
    removedCaptionCount,
    selectedCaptionIds,
  };
}

export function isSttCaption(caption: CaptionSegment): boolean {
  return caption.id.startsWith('caption-stt-');
}

function buildCaptionIssues(
  caption: CaptionSegment,
  options: NormalizedSttCaptionReviewOptions,
): SttCaptionReviewIssue[] {
  const issues: SttCaptionReviewIssue[] = [];
  const duration = caption.end - caption.start;
  const normalizedText = normalizeText(caption.text);
  const charsPerSecond = duration > 0 ? normalizedText.length / duration : Number.POSITIVE_INFINITY;

  if (!normalizedText) {
    issues.push(buildIssue(caption, 'empty-text', 'blocked', 'Empty caption text', 'Delete or rewrite this caption'));
  }

  if ((caption.confidence ?? 1) < options.confidenceThreshold) {
    issues.push(buildIssue(caption, 'low-confidence', 'warning', 'Low STT confidence', 'Listen and confirm the wording'));
  }

  if (duration < options.minDuration) {
    issues.push(buildIssue(caption, 'too-short', 'warning', 'Caption is too short', 'Extend duration or merge with the next line'));
  }

  if (duration > options.maxDuration) {
    issues.push(buildIssue(caption, 'too-long', 'warning', 'Caption stays on screen too long', 'Split this caption near a sentence break'));
  }

  if (normalizedText && charsPerSecond > options.maxCharsPerSecond) {
    issues.push(buildIssue(caption, 'too-fast', 'warning', 'Caption is too dense', 'Split or extend the caption for readability'));
  }

  if (options.requireSpeaker && !caption.speaker?.trim()) {
    issues.push(buildIssue(caption, 'missing-speaker', 'warning', 'Speaker label is missing', 'Assign a speaker before final export'));
  }

  if (hasWordTimingDrift(caption)) {
    issues.push(buildIssue(caption, 'word-timing-drift', 'warning', 'Word timing is outside the caption range or overlaps', 'Clean word timing before karaoke or word highlight export'));
  }

  return issues;
}

function buildIssue(
  caption: CaptionSegment,
  kind: SttCaptionReviewIssueKind,
  severity: SttCaptionReviewSeverity,
  message: string,
  action: string,
): SttCaptionReviewIssue {
  return {
    id: `${caption.id}-${kind}`,
    captionId: caption.id,
    kind,
    severity,
    message,
    action,
  };
}

function normalizeCaption(
  caption: CaptionSegment,
  nextCaption: CaptionSegment | undefined,
  options: NormalizedSttCaptionReviewOptions,
): CaptionSegment {
  const start = roundTime(Math.max(0, caption.start));
  const minimumEnd = roundTime(start + 0.1);
  const requestedEnd = roundTime(Math.max(minimumEnd, caption.end));
  const expandedEnd = duration(caption) < options.minDuration
    ? roundTime(start + options.minDuration)
    : requestedEnd;
  const nextStart = nextCaption ? Math.max(start + 0.1, nextCaption.start - 0.03) : Number.POSITIVE_INFINITY;
  const end = roundTime(Math.max(minimumEnd, Math.min(expandedEnd, nextStart)));
  const words = normalizeWords(caption.words, start, end);

  return {
    ...caption,
    start,
    end,
    text: normalizeText(caption.text),
    speaker: caption.speaker?.trim() || undefined,
    confidence: clamp(caption.confidence ?? 1, 0, 1),
    words: words.length > 0 ? words : undefined,
  };
}

function shouldMergeCaptions(
  caption: CaptionSegment,
  nextCaption: CaptionSegment,
  options: NormalizedSttCaptionReviewOptions,
): boolean {
  if (!shouldReviewCaption(nextCaption, options)) {
    return false;
  }

  const gap = nextCaption.start - caption.end;
  if (gap < -0.001 || gap > options.mergeGap) {
    return false;
  }

  if ((caption.speaker ?? '') !== (nextCaption.speaker ?? '')) {
    return false;
  }

  const mergedDuration = nextCaption.end - caption.start;
  if (mergedDuration <= 0 || mergedDuration > options.maxMergeDuration) {
    return false;
  }

  const mergedText = [caption.text, nextCaption.text].map(normalizeText).filter(Boolean).join(' ');
  const mergedRate = mergedText.length / mergedDuration;
  const hasShortCaption = duration(caption) < options.minDuration || duration(nextCaption) < options.minDuration;
  const hasShortText = caption.text.length <= 18 || nextCaption.text.length <= 18;

  return (hasShortCaption || hasShortText) && mergedRate <= options.maxCharsPerSecond;
}

function mergeCleanedCaptions(caption: CaptionSegment, nextCaption: CaptionSegment): CaptionSegment {
  const words = [
    ...(caption.words ?? []),
    ...(nextCaption.words ?? []),
  ];

  return {
    ...caption,
    end: roundTime(Math.max(caption.end, nextCaption.end)),
    text: [caption.text, nextCaption.text].map(normalizeText).filter(Boolean).join(' '),
    confidence: Math.min(caption.confidence ?? 1, nextCaption.confidence ?? 1),
    words: words.length > 0 ? words : undefined,
  };
}

function normalizeWords(
  words: CaptionWordTiming[] | undefined,
  captionStart: number,
  captionEnd: number,
): CaptionWordTiming[] {
  const normalizedWords = (words ?? [])
    .map((word, index) => ({ word, index }))
    .flatMap((word) => {
      const text = normalizeText(word.word.text);
      const start = roundTime(clamp(word.word.start, captionStart, captionEnd));
      const end = roundTime(clamp(word.word.end, captionStart, captionEnd));
      if (!text || end <= start) {
        return [];
      }

      return [{
        ...word.word,
        start,
        end,
        text,
        confidence: word.word.confidence === undefined ? undefined : clamp(word.word.confidence, 0, 1),
        index: word.index,
      }];
    })
    .sort((left, right) => left.start - right.start || left.index - right.index);

  const repairedWords: CaptionWordTiming[] = [];
  let previousEnd = captionStart;

  for (const word of normalizedWords) {
    const start = roundTime(Math.max(word.start, previousEnd));
    const end = roundTime(Math.min(word.end, captionEnd));
    if (end <= start) {
      continue;
    }

    const { index: _index, ...cleanedWord } = {
      ...word,
      start,
      end,
    };
    repairedWords.push(cleanedWord);
    previousEnd = end;
  }

  return repairedWords;
}

function hasWordTimingDrift(caption: CaptionSegment): boolean {
  const tolerance = 0.02;
  let previousStart = Number.NEGATIVE_INFINITY;
  let previousEnd = Number.NEGATIVE_INFINITY;

  for (const word of caption.words ?? []) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || !normalizeText(word.text)) {
      return true;
    }

    if (word.start < caption.start - tolerance || word.end > caption.end + tolerance || word.end <= word.start) {
      return true;
    }

    if (word.start < previousStart - tolerance || word.start < previousEnd - tolerance) {
      return true;
    }

    previousStart = word.start;
    previousEnd = word.end;
  }

  return false;
}

function shouldReviewCaption(caption: CaptionSegment, options: NormalizedSttCaptionReviewOptions): boolean {
  if (options.targetCaptionIds) {
    return options.targetCaptionIds.has(caption.id);
  }

  return options.includeNonStt || isSttCaption(caption);
}

function normalizeOptions(options: SttCaptionReviewOptions): NormalizedSttCaptionReviewOptions {
  return {
    targetCaptionIds: options.targetCaptionIds ? new Set(options.targetCaptionIds) : undefined,
    includeNonStt: options.includeNonStt ?? false,
    requireSpeaker: options.requireSpeaker ?? false,
    confidenceThreshold: clamp(options.confidenceThreshold ?? 0.72, 0, 1),
    minDuration: clamp(options.minDuration ?? 0.65, 0.1, 3),
    maxDuration: clamp(options.maxDuration ?? 7, 1, 20),
    maxCharsPerSecond: clamp(options.maxCharsPerSecond ?? 22, 8, 60),
    mergeGap: clamp(options.mergeGap ?? 0.25, 0, 2),
    maxMergeDuration: clamp(options.maxMergeDuration ?? 5.5, 1, 12),
  };
}

function captionsEqual(left: CaptionSegment, right: CaptionSegment): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function duration(caption: CaptionSegment): number {
  return caption.end - caption.start;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
