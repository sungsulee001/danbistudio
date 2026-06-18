import { upsertClipTransition, type SupportedTransition, type SupportedTransitionType } from './timeline';
import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import type { EditorAsset, EditorProject, TimelineClip, TimelineTrack, TimelineTransition } from './types';

export type ExtensionTransitionPlanOperation = 'upsert-transition';

export interface ExtensionTransitionPlan {
  clipId: string;
  trackId?: string;
  nextClipId?: string;
  operation: ExtensionTransitionPlanOperation;
  transition: SupportedTransition;
}

export interface ExtensionTransitionPlanSkippedClip {
  clipId: string;
  reason: string;
}

export interface ExtensionTransitionPlanApplyResult {
  project: EditorProject;
  requestedPlanCount: number;
  appliedPlanCount: number;
  updatedClipIds: string[];
  skipped: ExtensionTransitionPlanSkippedClip[];
}

const EXTENSION_TRANSITION_TYPES: SupportedTransitionType[] = [
  'crossfade',
  'dip',
  'push',
  'wipe',
  'match-cut',
  'ai-morph',
];
const EXTENSION_TRANSITION_EASINGS: TimelineTransition['easing'][] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
];
const MAX_EXTENSION_TRANSITION_PLAN_COUNT = 250;
const MAX_EXTENSION_TRANSITION_PARAMETER_COUNT = 64;
const MAX_EXTENSION_TRANSITION_STRING_LENGTH = 500;

export function readExtensionTransitionPlansFromRuntimeResult(value: unknown): ExtensionTransitionPlan[] {
  const result = readRecord(value, 'External transition plan result');
  const plans = result.plans;
  if (!Array.isArray(plans)) {
    throw new Error('External transition plan result must include a plans array.');
  }

  if (plans.length > MAX_EXTENSION_TRANSITION_PLAN_COUNT) {
    throw new Error(`External transition plan result exceeds the ${MAX_EXTENSION_TRANSITION_PLAN_COUNT} plan limit.`);
  }

  return plans.map((plan, index) => readExtensionTransitionPlan(plan, index));
}

export function applyExtensionTransitionPlans(
  project: EditorProject,
  plans: ExtensionTransitionPlan[],
): ExtensionTransitionPlanApplyResult {
  if (plans.length === 0) {
    return {
      project,
      requestedPlanCount: 0,
      appliedPlanCount: 0,
      updatedClipIds: [],
      skipped: [],
    };
  }

  let nextProject = project;
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const updatedClipIds = new Set<string>();
  const skipped: ExtensionTransitionPlanSkippedClip[] = [];
  let appliedPlanCount = 0;

  for (const plan of plans) {
    const target = findTrackAndClip(nextProject.tracks, plan.clipId);
    if (!target) {
      skipped.push({ clipId: plan.clipId, reason: 'Clip not found.' });
      continue;
    }

    const { track, clip } = target;
    if (plan.trackId && track.id !== plan.trackId) {
      skipped.push({ clipId: plan.clipId, reason: 'Plan track does not match the current clip track.' });
      continue;
    }

    const nextClip = findNextClip(track, clip.id);
    if (!nextClip) {
      skipped.push({ clipId: plan.clipId, reason: 'Outgoing transition requires a next clip on the same track.' });
      continue;
    }

    if (plan.nextClipId && nextClip.id !== plan.nextClipId) {
      skipped.push({ clipId: plan.clipId, reason: 'Plan next clip does not match the current same-track adjacency.' });
      continue;
    }

    const skipReason = getTransitionPlanApplySkipReason(
      track,
      clip,
      nextClip,
      clip.assetId ? assetById.get(clip.assetId) : undefined,
      nextClip.assetId ? assetById.get(nextClip.assetId) : undefined,
    );
    if (skipReason) {
      skipped.push({ clipId: plan.clipId, reason: skipReason });
      continue;
    }

    if (transitionPlanAlreadyMatches(track, clip, nextClip, plan.transition)) {
      skipped.push({ clipId: plan.clipId, reason: 'Transition plan already matches the clip.' });
      continue;
    }

    try {
      nextProject = upsertClipTransition(nextProject, clip.id, plan.transition, { autoOverlap: true });
      updatedClipIds.add(clip.id);
      appliedPlanCount += 1;
    } catch (error) {
      skipped.push({ clipId: plan.clipId, reason: (error as Error).message });
    }
  }

  return {
    project: nextProject,
    requestedPlanCount: plans.length,
    appliedPlanCount,
    updatedClipIds: Array.from(updatedClipIds),
    skipped,
  };
}

function readExtensionTransitionPlan(value: unknown, index: number): ExtensionTransitionPlan {
  const plan = readRecord(value, `External transition plan ${index + 1}`);
  const clipId = readRequiredString(plan.clipId, `External transition plan ${index + 1} clipId`);
  const trackId = plan.trackId === undefined
    ? undefined
    : readRequiredString(plan.trackId, `External transition plan ${index + 1} trackId`);
  const nextClipId = plan.nextClipId === undefined
    ? undefined
    : readRequiredString(plan.nextClipId, `External transition plan ${index + 1} nextClipId`);
  if (plan.operation !== 'upsert-transition') {
    throw new Error(`External transition plan ${index + 1} has an unsupported operation.`);
  }

  return {
    clipId,
    ...(trackId ? { trackId } : {}),
    ...(nextClipId ? { nextClipId } : {}),
    operation: 'upsert-transition',
    transition: readTransition(plan.transition, index),
  };
}

function readTransition(value: unknown, planIndex: number): SupportedTransition {
  const transition = readRecord(value, `External transition plan ${planIndex + 1} transition`);
  return {
    id: readRequiredString(transition.id, `External transition plan ${planIndex + 1} transition id`),
    type: readTransitionType(transition.type, `External transition plan ${planIndex + 1} transition type`),
    duration: readTransitionDuration(transition.duration, `External transition plan ${planIndex + 1} transition duration`),
    easing: readTransitionEasing(transition.easing, `External transition plan ${planIndex + 1} transition easing`),
    parameters: readTransitionParameters(transition.parameters, planIndex),
  };
}

function readTransitionParameters(value: unknown, planIndex: number): TimelineTransition['parameters'] {
  const parameters = readRecord(value, `External transition plan ${planIndex + 1} transition parameters`);
  const entries = Object.entries(parameters);
  if (entries.length > MAX_EXTENSION_TRANSITION_PARAMETER_COUNT) {
    throw new Error(`External transition plan ${planIndex + 1} transition exceeds the ${MAX_EXTENSION_TRANSITION_PARAMETER_COUNT} parameter limit.`);
  }

  return Object.fromEntries(entries.map(([key, parameterValue]) => {
    const normalizedKey = readRequiredString(key, `External transition plan ${planIndex + 1} transition parameter key`);
    return [
      normalizedKey,
      readTransitionParameterValue(parameterValue, `External transition plan ${planIndex + 1} transition parameter ${normalizedKey}`),
    ];
  }));
}

function readTransitionParameterValue(value: unknown, label: string): string | number | boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length > MAX_EXTENSION_TRANSITION_STRING_LENGTH) {
      throw new Error(`${label} exceeds the ${MAX_EXTENSION_TRANSITION_STRING_LENGTH} character limit.`);
    }

    return normalized;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`${label} must be a string, finite number, or boolean.`);
}

function getTransitionPlanApplySkipReason(
  track: TimelineTrack,
  clip: TimelineClip,
  nextClip: TimelineClip,
  asset: EditorAsset | undefined,
  nextAsset: EditorAsset | undefined,
): string | undefined {
  if (track.locked || clip.locked || nextClip.locked) {
    return 'Track or clip is locked.';
  }

  if (track.muted || clip.muted || nextClip.muted) {
    return 'Track or clip is muted.';
  }

  if (!canReceiveReviewedTransition(track, clip, asset) || !canReceiveReviewedTransition(track, nextClip, nextAsset)) {
    return 'External transition plans are available for visual clips.';
  }

  return undefined;
}

function canReceiveReviewedTransition(track: TimelineTrack, clip: TimelineClip, asset?: EditorAsset): boolean {
  if (track.kind === 'audio') {
    return false;
  }

  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    clip.kind === 'text' ||
    clip.kind === 'effect' ||
    isRenderableVisualMediaAsset(asset) ||
    asset?.kind === 'text' ||
    (clip.kind === 'ai' && !asset);
}

function transitionPlanAlreadyMatches(
  track: TimelineTrack,
  clip: TimelineClip,
  nextClip: TimelineClip,
  transition: SupportedTransition,
): boolean {
  if (!clip.transitionOut || !areTransitionsEqual(clip.transitionOut, transition)) {
    return false;
  }

  const targetNextStart = roundPlanTime(clip.start + clip.duration - transition.duration);
  return track.clips.some((item) => item.id === nextClip.id && Math.abs(item.start - targetNextStart) <= 0.001);
}

function areTransitionsEqual(left: TimelineTransition, right: TimelineTransition): boolean {
  return JSON.stringify(normalizeTransitionForCompare(left)) === JSON.stringify(normalizeTransitionForCompare(right));
}

function normalizeTransitionForCompare(transition: TimelineTransition) {
  return {
    id: transition.id,
    type: transition.type,
    duration: roundPlanTime(transition.duration),
    easing: transition.easing,
    parameters: Object.fromEntries(Object.entries(transition.parameters).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function findTrackAndClip(
  tracks: TimelineTrack[],
  clipId: string,
): { track: TimelineTrack; clip: TimelineClip } | undefined {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) {
      return { track, clip };
    }
  }

  return undefined;
}

function findNextClip(track: TimelineTrack, clipId: string): TimelineClip | undefined {
  const sortedClips = track.clips.slice().sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  return clipIndex >= 0 ? sortedClips[clipIndex + 1] : undefined;
}

function readTransitionType(value: unknown, label: string): SupportedTransitionType {
  if (typeof value === 'string' && (EXTENSION_TRANSITION_TYPES as string[]).includes(value)) {
    return value as SupportedTransitionType;
  }

  throw new Error(`${label} is not a supported transition type.`);
}

function readTransitionEasing(value: unknown, label: string): TimelineTransition['easing'] {
  if (typeof value === 'string' && (EXTENSION_TRANSITION_EASINGS as string[]).includes(value)) {
    return value as TimelineTransition['easing'];
  }

  throw new Error(`${label} is not a supported transition easing.`);
}

function readTransitionDuration(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return roundPlanTime(Math.min(30, Math.max(0.05, value)));
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} cannot be empty.`);
  }

  if (normalized.length > MAX_EXTENSION_TRANSITION_STRING_LENGTH) {
    throw new Error(`${label} exceeds the ${MAX_EXTENSION_TRANSITION_STRING_LENGTH} character limit.`);
  }

  return normalized;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function roundPlanTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
