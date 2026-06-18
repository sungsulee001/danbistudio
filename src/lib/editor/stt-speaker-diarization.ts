import { isSttCaption } from './stt-caption-review';
import type { CaptionSegment, EditorProject } from './types';

export interface SpeakerDiarizationOptions {
  targetCaptionIds?: string[];
  includeNonStt?: boolean;
  overwriteExisting?: boolean;
  speakerPrefix?: string;
  maxSameSpeakerGap?: number;
  carryKnownSpeakerGap?: number;
  maxInferredSpeakers?: number;
  minTurnDuration?: number;
  useSpeakerEmbeddings?: boolean;
  speakerEmbeddingSimilarityThreshold?: number;
  speakerEmbeddingSimilarityMargin?: number;
  minSpeakerEmbeddingDimensions?: number;
}

export type SpeakerDiarizationAssignmentSource =
  | 'existing'
  | 'embedding'
  | 'time-gap'
  | 'known-neighbor'
  | 'inferred';

export interface SpeakerDiarizationSpeaker {
  id: string;
  label: string;
  captionIds: string[];
  start: number;
  end: number;
  duration: number;
  captionCount: number;
  wordCount: number;
  averageConfidence: number;
  inferred: boolean;
  embeddingCaptionCount: number;
}

export interface SpeakerDiarizationTurn {
  id: string;
  speaker: string;
  captionIds: string[];
  start: number;
  end: number;
  duration: number;
  captionCount: number;
  averageConfidence: number;
}

export interface SpeakerDiarizationReport {
  captionCount: number;
  assignedCaptionCount: number;
  changedCaptionCount: number;
  missingSpeakerCount: number;
  speakerCount: number;
  turnCount: number;
  embeddingCaptionCount: number;
  embeddingAssignedCaptionCount: number;
  embeddingAmbiguousCaptionCount: number;
  embeddingLowSimilarityCaptionCount: number;
  targetCaptionIds: string[];
  changedCaptionIds: string[];
  reviewCaptionIds: string[];
  speakers: SpeakerDiarizationSpeaker[];
  turns: SpeakerDiarizationTurn[];
  warnings: string[];
  assignments: Record<string, string>;
  assignmentSources: Record<string, SpeakerDiarizationAssignmentSource>;
}

export interface SpeakerDiarizationApplyResult {
  project: EditorProject;
  changedCaptionIds: string[];
  selectedCaptionIds: string[];
  report: SpeakerDiarizationReport;
}

interface NormalizedSpeakerDiarizationOptions {
  targetCaptionIds?: Set<string>;
  includeNonStt: boolean;
  overwriteExisting: boolean;
  speakerPrefix: string;
  maxSameSpeakerGap: number;
  carryKnownSpeakerGap: number;
  maxInferredSpeakers: number;
  minTurnDuration: number;
  useSpeakerEmbeddings: boolean;
  speakerEmbeddingSimilarityThreshold: number;
  speakerEmbeddingSimilarityMargin: number;
  minSpeakerEmbeddingDimensions: number;
}

interface CaptionAssignment {
  caption: CaptionSegment;
  speaker: string;
  currentSpeaker?: string;
  inferred: boolean;
  assignmentSource: SpeakerDiarizationAssignmentSource;
  speakerEmbedding?: number[];
  embeddingMatch?: SpeakerEmbeddingMatch;
}

interface SpeakerEmbeddingModel {
  speaker: string;
  centroid: number[];
  count: number;
}

interface SpeakerEmbeddingMatch {
  speaker?: string;
  bestScore: number;
  secondBestScore?: number;
  margin?: number;
  status: 'accepted' | 'ambiguous' | 'low-similarity' | 'unavailable';
}

export function buildSpeakerDiarizationReport(
  projectOrCaptions: EditorProject | CaptionSegment[],
  options: SpeakerDiarizationOptions = {},
): SpeakerDiarizationReport {
  const captions = Array.isArray(projectOrCaptions) ? projectOrCaptions : projectOrCaptions.captions;
  const normalizedOptions = normalizeOptions(options);
  const targetCaptions = captions
    .filter((caption) => shouldDiarizeCaption(caption, normalizedOptions))
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const assignments = buildAssignments(targetCaptions, normalizedOptions);
  const speakers = buildSpeakerSummaries(assignments);
  const turns = buildSpeakerTurns(assignments, normalizedOptions);
  const embeddingCaptionCount = assignments.filter((assignment) => assignment.speakerEmbedding).length;
  const embeddingAssignedCaptionCount = assignments.filter((assignment) => assignment.assignmentSource === 'embedding').length;
  const embeddingAmbiguousCaptionCount = assignments.filter((assignment) => assignment.embeddingMatch?.status === 'ambiguous').length;
  const embeddingLowSimilarityCaptionCount = assignments.filter((assignment) => assignment.embeddingMatch?.status === 'low-similarity').length;
  const invalidEmbeddingCount = normalizedOptions.useSpeakerEmbeddings
    ? targetCaptions.filter((caption) => hasRawSpeakerEmbedding(caption) && !readCaptionSpeakerEmbedding(caption, normalizedOptions)).length
    : 0;
  const changedCaptionIds = assignments
    .filter((assignment) => normalizeSpeaker(assignment.caption.speaker) !== assignment.speaker)
    .map((assignment) => assignment.caption.id);
  const missingSpeakerCount = targetCaptions.filter((caption) => !normalizeSpeaker(caption.speaker)).length;
  const warnings = buildWarnings(assignments, turns, missingSpeakerCount, invalidEmbeddingCount, normalizedOptions);

  return {
    captionCount: targetCaptions.length,
    assignedCaptionCount: assignments.filter((assignment) => Boolean(assignment.speaker)).length,
    changedCaptionCount: changedCaptionIds.length,
    missingSpeakerCount,
    speakerCount: speakers.length,
    turnCount: turns.length,
    embeddingCaptionCount,
    embeddingAssignedCaptionCount,
    embeddingAmbiguousCaptionCount,
    embeddingLowSimilarityCaptionCount,
    targetCaptionIds: targetCaptions.map((caption) => caption.id),
    changedCaptionIds,
    reviewCaptionIds: Array.from(new Set([
      ...changedCaptionIds,
      ...assignments
        .filter((assignment) => assignment.embeddingMatch?.status === 'ambiguous' || assignment.embeddingMatch?.status === 'low-similarity')
        .map((assignment) => assignment.caption.id),
      ...turns
        .filter((turn) => turn.duration < normalizedOptions.minTurnDuration)
        .flatMap((turn) => turn.captionIds),
    ])),
    speakers,
    turns,
    warnings,
    assignments: Object.fromEntries(assignments.map((assignment) => [assignment.caption.id, assignment.speaker])),
    assignmentSources: Object.fromEntries(assignments.map((assignment) => [assignment.caption.id, assignment.assignmentSource])),
  };
}

export function applySpeakerDiarization(
  project: EditorProject,
  options: SpeakerDiarizationOptions = {},
): SpeakerDiarizationApplyResult {
  const report = buildSpeakerDiarizationReport(project, options);
  if (report.captionCount === 0) {
    throw new Error('No captions are available for speaker diarization.');
  }

  if (report.changedCaptionIds.length === 0) {
    return {
      project,
      changedCaptionIds: [],
      selectedCaptionIds: report.reviewCaptionIds,
      report,
    };
  }

  const targetIds = new Set(report.changedCaptionIds);
  const captions = project.captions.map((caption) => {
    if (!targetIds.has(caption.id)) {
      return caption;
    }

    return {
      ...caption,
      speaker: report.assignments[caption.id],
    };
  });

  return {
    project: {
      ...project,
      captions,
      updatedAt: new Date().toISOString(),
    },
    changedCaptionIds: report.changedCaptionIds,
    selectedCaptionIds: report.reviewCaptionIds.length > 0 ? report.reviewCaptionIds : report.changedCaptionIds,
    report,
  };
}

function buildAssignments(
  captions: CaptionSegment[],
  options: NormalizedSpeakerDiarizationOptions,
): CaptionAssignment[] {
  const assignments: CaptionAssignment[] = [];
  const knownLabels = new Set(captions.map((caption) => normalizeSpeaker(caption.speaker)).filter(Boolean));
  const inferredLabels: string[] = [];
  const speakerModels = options.useSpeakerEmbeddings
    ? buildInitialSpeakerEmbeddingModels(captions, options)
    : new Map<string, SpeakerEmbeddingModel>();

  captions.forEach((caption, index) => {
    const currentSpeaker = normalizeSpeaker(caption.speaker);
    const speakerEmbedding = options.useSpeakerEmbeddings
      ? readCaptionSpeakerEmbedding(caption, options)
      : undefined;
    if (currentSpeaker && !options.overwriteExisting) {
      assignments.push({
        caption,
        speaker: currentSpeaker,
        currentSpeaker,
        inferred: false,
        assignmentSource: 'existing',
        speakerEmbedding,
        embeddingMatch: undefined,
      });
      updateSpeakerEmbeddingModel(speakerModels, currentSpeaker, speakerEmbedding);
      return;
    }

    const previous = assignments[assignments.length - 1];
    const previousGap = previous ? caption.start - previous.caption.end : Number.POSITIVE_INFINITY;
    const carriedSpeaker = previous && previousGap >= -0.001 && previousGap <= options.maxSameSpeakerGap
      ? previous.speaker
      : undefined;
    const embeddingMatch = speakerEmbedding
      ? findBestSpeakerByEmbedding(
        speakerModels,
        speakerEmbedding,
        options.speakerEmbeddingSimilarityThreshold,
        options.speakerEmbeddingSimilarityMargin,
      )
      : undefined;
    const embeddingSpeaker = embeddingMatch?.status === 'accepted'
      ? embeddingMatch.speaker
      : undefined;
    const surroundingKnownSpeaker = embeddingSpeaker || carriedSpeaker
      ? undefined
      : findSurroundingKnownSpeaker(captions, index, options);
    const speaker = embeddingSpeaker
      ?? carriedSpeaker
      ?? surroundingKnownSpeaker
      ?? nextInferredSpeakerLabel(
        inferredLabels,
        knownLabels,
        options,
        previous,
        previousGap,
      );
    const assignmentSource: SpeakerDiarizationAssignmentSource = embeddingSpeaker
      ? 'embedding'
      : carriedSpeaker
        ? 'time-gap'
        : surroundingKnownSpeaker
          ? 'known-neighbor'
          : 'inferred';

    knownLabels.add(speaker);
    updateSpeakerEmbeddingModel(speakerModels, speaker, speakerEmbedding);
    assignments.push({
      caption,
      speaker,
      currentSpeaker,
      inferred: !currentSpeaker || currentSpeaker !== speaker,
      assignmentSource,
      speakerEmbedding,
      embeddingMatch,
    });
  });

  return assignments;
}

function findSurroundingKnownSpeaker(
  captions: CaptionSegment[],
  index: number,
  options: NormalizedSpeakerDiarizationOptions,
): string | undefined {
  const caption = captions[index];
  const previous = findKnownCaption(captions, index, -1, options);
  const next = findKnownCaption(captions, index, 1, options);

  if (previous && next && previous.speaker === next.speaker) {
    return previous.speaker;
  }

  const previousGap = previous ? caption.start - previous.caption.end : Number.POSITIVE_INFINITY;
  const nextGap = next ? next.caption.start - caption.end : Number.POSITIVE_INFINITY;

  if (previous && previousGap >= -0.001 && previousGap <= options.carryKnownSpeakerGap && previousGap <= nextGap) {
    return previous.speaker;
  }

  if (next && nextGap >= -0.001 && nextGap <= options.carryKnownSpeakerGap) {
    return next.speaker;
  }

  return undefined;
}

function findKnownCaption(
  captions: CaptionSegment[],
  fromIndex: number,
  direction: -1 | 1,
  options: NormalizedSpeakerDiarizationOptions,
): { caption: CaptionSegment; speaker: string } | undefined {
  for (let index = fromIndex + direction; index >= 0 && index < captions.length; index += direction) {
    const caption = captions[index];
    const speaker = normalizeSpeaker(caption.speaker);
    if (!speaker) {
      continue;
    }

    const gap = direction < 0
      ? captions[fromIndex].start - caption.end
      : caption.start - captions[fromIndex].end;
    if (gap > options.carryKnownSpeakerGap) {
      return undefined;
    }

    return { caption, speaker };
  }

  return undefined;
}

function nextInferredSpeakerLabel(
  inferredLabels: string[],
  knownLabels: Set<string>,
  options: NormalizedSpeakerDiarizationOptions,
  previous: CaptionAssignment | undefined,
  previousGap: number,
): string {
  if (previous && previousGap >= -0.001 && previousGap <= options.maxSameSpeakerGap) {
    return previous.speaker;
  }

  if (inferredLabels.length === 0) {
    const firstLabel = uniqueSpeakerLabel(options.speakerPrefix, 1, knownLabels);
    inferredLabels.push(firstLabel);
    return firstLabel;
  }

  const previousInferredIndex = previous
    ? Math.max(0, inferredLabels.indexOf(previous.speaker))
    : inferredLabels.length - 1;
  const nextIndex = previousInferredIndex >= 0
    ? (previousInferredIndex + 1) % Math.max(1, options.maxInferredSpeakers)
    : inferredLabels.length % Math.max(1, options.maxInferredSpeakers);

  if (inferredLabels[nextIndex]) {
    return inferredLabels[nextIndex];
  }

  const label = uniqueSpeakerLabel(options.speakerPrefix, inferredLabels.length + 1, knownLabels);
  inferredLabels.push(label);
  return label;
}

function buildSpeakerSummaries(assignments: CaptionAssignment[]): SpeakerDiarizationSpeaker[] {
  const bySpeaker = new Map<string, CaptionAssignment[]>();
  for (const assignment of assignments) {
    const items = bySpeaker.get(assignment.speaker) ?? [];
    items.push(assignment);
    bySpeaker.set(assignment.speaker, items);
  }

  return Array.from(bySpeaker.entries()).map(([label, items]) => {
    const captions = items.map((item) => item.caption);
    const start = Math.min(...captions.map((caption) => caption.start));
    const end = Math.max(...captions.map((caption) => caption.end));
    return {
      id: `speaker-${slugify(label)}`,
      label,
      captionIds: captions.map((caption) => caption.id),
      start: roundTime(start),
      end: roundTime(end),
      duration: roundTime(Math.max(0, end - start)),
      captionCount: captions.length,
      wordCount: captions.reduce((total, caption) => total + countWords(caption.text), 0),
      averageConfidence: averageConfidence(captions),
      inferred: items.some((item) => item.inferred),
      embeddingCaptionCount: items.filter((item) => item.speakerEmbedding).length,
    };
  }).sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
}

function buildSpeakerTurns(
  assignments: CaptionAssignment[],
  options: NormalizedSpeakerDiarizationOptions,
): SpeakerDiarizationTurn[] {
  const turns: SpeakerDiarizationTurn[] = [];

  for (const assignment of assignments) {
    const previous = turns[turns.length - 1];
    const gap = previous ? assignment.caption.start - previous.end : Number.POSITIVE_INFINITY;

    if (previous && previous.speaker === assignment.speaker && gap >= -0.001 && gap <= options.maxSameSpeakerGap) {
      previous.captionIds.push(assignment.caption.id);
      previous.end = roundTime(Math.max(previous.end, assignment.caption.end));
      previous.duration = roundTime(previous.end - previous.start);
      previous.captionCount = previous.captionIds.length;
      previous.averageConfidence = averageConfidence(
        assignments
          .filter((item) => previous.captionIds.includes(item.caption.id))
          .map((item) => item.caption),
      );
      continue;
    }

    turns.push({
      id: `turn-${turns.length + 1}-${slugify(assignment.speaker)}`,
      speaker: assignment.speaker,
      captionIds: [assignment.caption.id],
      start: roundTime(assignment.caption.start),
      end: roundTime(assignment.caption.end),
      duration: roundTime(Math.max(0, assignment.caption.end - assignment.caption.start)),
      captionCount: 1,
      averageConfidence: averageConfidence([assignment.caption]),
    });
  }

  return turns;
}

function buildWarnings(
  assignments: CaptionAssignment[],
  turns: SpeakerDiarizationTurn[],
  missingSpeakerCount: number,
  invalidEmbeddingCount: number,
  options: NormalizedSpeakerDiarizationOptions,
): string[] {
  const warnings: string[] = [];
  const shortTurnCount = turns.filter((turn) => turn.duration < options.minTurnDuration).length;
  const overlappingSpeakerPairs = countOverlappingSpeakerPairs(assignments);
  const ambiguousEmbeddingCount = assignments.filter((assignment) => assignment.embeddingMatch?.status === 'ambiguous').length;
  const lowSimilarityEmbeddingCount = assignments.filter((assignment) => assignment.embeddingMatch?.status === 'low-similarity').length;

  if (missingSpeakerCount > 0) {
    warnings.push(`${missingSpeakerCount} caption${missingSpeakerCount === 1 ? '' : 's'} had no speaker and received draft labels.`);
  }

  if (shortTurnCount > 0) {
    warnings.push(`${shortTurnCount} speaker turn${shortTurnCount === 1 ? '' : 's'} may be too short; review rapid speaker switches.`);
  }

  if (overlappingSpeakerPairs > 0) {
    warnings.push(`${overlappingSpeakerPairs} overlapping caption pair${overlappingSpeakerPairs === 1 ? '' : 's'} have different speakers.`);
  }

  if (invalidEmbeddingCount > 0) {
    warnings.push(`${invalidEmbeddingCount} speaker embedding${invalidEmbeddingCount === 1 ? '' : 's'} ${invalidEmbeddingCount === 1 ? 'was' : 'were'} ignored because ${invalidEmbeddingCount === 1 ? 'it was' : 'they were'} invalid or too short.`);
  }

  if (ambiguousEmbeddingCount > 0) {
    warnings.push(`${ambiguousEmbeddingCount} speaker embedding match${ambiguousEmbeddingCount === 1 ? '' : 'es'} ${ambiguousEmbeddingCount === 1 ? 'was' : 'were'} ambiguous and should be reviewed.`);
  }

  if (lowSimilarityEmbeddingCount > 0) {
    warnings.push(`${lowSimilarityEmbeddingCount} speaker embedding match${lowSimilarityEmbeddingCount === 1 ? '' : 'es'} ${lowSimilarityEmbeddingCount === 1 ? 'was' : 'were'} below the similarity threshold and used fallback labeling.`);
  }

  return warnings;
}

function countOverlappingSpeakerPairs(assignments: CaptionAssignment[]): number {
  let count = 0;
  for (let index = 0; index < assignments.length - 1; index += 1) {
    const current = assignments[index];
    const next = assignments[index + 1];
    if (current.speaker !== next.speaker && current.caption.end > next.caption.start + 0.001) {
      count += 1;
    }
  }

  return count;
}

function shouldDiarizeCaption(caption: CaptionSegment, options: NormalizedSpeakerDiarizationOptions): boolean {
  if (options.targetCaptionIds) {
    return options.targetCaptionIds.has(caption.id);
  }

  return options.includeNonStt || isSttCaption(caption);
}

function normalizeOptions(options: SpeakerDiarizationOptions): NormalizedSpeakerDiarizationOptions {
  return {
    targetCaptionIds: options.targetCaptionIds ? new Set(options.targetCaptionIds) : undefined,
    includeNonStt: options.includeNonStt ?? false,
    overwriteExisting: options.overwriteExisting ?? false,
    speakerPrefix: normalizeSpeaker(options.speakerPrefix) || 'Speaker',
    maxSameSpeakerGap: clamp(options.maxSameSpeakerGap ?? 1.25, 0, 10),
    carryKnownSpeakerGap: clamp(options.carryKnownSpeakerGap ?? 1.5, 0, 30),
    maxInferredSpeakers: Math.round(clamp(options.maxInferredSpeakers ?? 2, 1, 12)),
    minTurnDuration: clamp(options.minTurnDuration ?? 0.45, 0.05, 5),
    useSpeakerEmbeddings: options.useSpeakerEmbeddings ?? true,
    speakerEmbeddingSimilarityThreshold: clamp(options.speakerEmbeddingSimilarityThreshold ?? 0.82, 0.1, 0.999),
    speakerEmbeddingSimilarityMargin: clamp(options.speakerEmbeddingSimilarityMargin ?? 0.035, 0, 0.5),
    minSpeakerEmbeddingDimensions: Math.round(clamp(options.minSpeakerEmbeddingDimensions ?? 2, 2, 4096)),
  };
}

function buildInitialSpeakerEmbeddingModels(
  captions: CaptionSegment[],
  options: NormalizedSpeakerDiarizationOptions,
): Map<string, SpeakerEmbeddingModel> {
  const models = new Map<string, SpeakerEmbeddingModel>();

  for (const caption of captions) {
    const speaker = normalizeSpeaker(caption.speaker);
    if (!speaker) {
      continue;
    }

    updateSpeakerEmbeddingModel(models, speaker, readCaptionSpeakerEmbedding(caption, options));
  }

  return models;
}

function findBestSpeakerByEmbedding(
  models: Map<string, SpeakerEmbeddingModel>,
  embedding: number[],
  threshold: number,
  minMargin: number,
): SpeakerEmbeddingMatch {
  let bestSpeaker: string | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondBestScore = Number.NEGATIVE_INFINITY;

  for (const model of models.values()) {
    if (model.centroid.length !== embedding.length) {
      continue;
    }

    const score = cosineSimilarity(model.centroid, embedding);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestSpeaker = model.speaker;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!bestSpeaker || !Number.isFinite(bestScore)) {
    return {
      bestScore: 0,
      status: 'unavailable',
    };
  }

  if (bestScore < threshold) {
    return {
      speaker: bestSpeaker,
      bestScore: roundTime(bestScore),
      secondBestScore: Number.isFinite(secondBestScore) ? roundTime(secondBestScore) : undefined,
      status: 'low-similarity',
    };
  }

  const margin = Number.isFinite(secondBestScore)
    ? bestScore - secondBestScore
    : Number.POSITIVE_INFINITY;
  if (Number.isFinite(margin) && margin < minMargin) {
    return {
      speaker: bestSpeaker,
      bestScore: roundTime(bestScore),
      secondBestScore: roundTime(secondBestScore),
      margin: roundTime(margin),
      status: 'ambiguous',
    };
  }

  return {
    speaker: bestSpeaker,
    bestScore: roundTime(bestScore),
    secondBestScore: Number.isFinite(secondBestScore) ? roundTime(secondBestScore) : undefined,
    margin: Number.isFinite(margin) ? roundTime(margin) : undefined,
    status: 'accepted',
  };
}

function updateSpeakerEmbeddingModel(
  models: Map<string, SpeakerEmbeddingModel>,
  speaker: string,
  embedding: number[] | undefined,
): void {
  if (!embedding) {
    return;
  }

  const current = models.get(speaker);
  if (!current || current.centroid.length !== embedding.length) {
    models.set(speaker, {
      speaker,
      centroid: embedding,
      count: 1,
    });
    return;
  }

  const nextCount = current.count + 1;
  current.centroid = current.centroid.map((value, index) => roundEmbeddingValue(
    ((value * current.count) + embedding[index]) / nextCount,
  ));
  current.count = nextCount;
}

function readCaptionSpeakerEmbedding(
  caption: CaptionSegment,
  options: Pick<NormalizedSpeakerDiarizationOptions, 'minSpeakerEmbeddingDimensions'>,
): number[] | undefined {
  if (!Array.isArray(caption.speakerEmbedding) || caption.speakerEmbedding.length < options.minSpeakerEmbeddingDimensions) {
    return undefined;
  }

  const values = caption.speakerEmbedding.map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    return undefined;
  }

  const magnitude = Math.sqrt(values.reduce((total, value) => total + value * value, 0));
  if (magnitude <= 0) {
    return undefined;
  }

  return values.map((value) => roundEmbeddingValue(value / magnitude));
}

function hasRawSpeakerEmbedding(caption: CaptionSegment): boolean {
  return caption.speakerEmbedding !== undefined;
}

function cosineSimilarity(left: number[], right: number[]): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }

  return score;
}

function roundEmbeddingValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function uniqueSpeakerLabel(prefix: string, index: number, existing: Set<string>): string {
  let nextIndex = index;
  let label = `${prefix} ${nextIndex}`;
  while (existing.has(label)) {
    nextIndex += 1;
    label = `${prefix} ${nextIndex}`;
  }

  return label;
}

function normalizeSpeaker(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function averageConfidence(captions: CaptionSegment[]): number {
  if (captions.length === 0) {
    return 1;
  }

  return roundTime(captions.reduce((total, caption) => total + clamp(caption.confidence ?? 1, 0, 1), 0) / captions.length);
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'speaker';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
