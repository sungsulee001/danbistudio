import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { ClipEffect, ClipKind, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';

export type ExtensionEffectPlanOperation = 'upsert-effect';

export interface ExtensionEffectPlanReplaceMatching {
  type: ClipEffect['type'];
  parameterKey?: string;
  parameterValue?: string | number | boolean;
}

export interface ExtensionEffectPlan {
  clipId: string;
  trackId?: string;
  operation: ExtensionEffectPlanOperation;
  replaceMatching?: ExtensionEffectPlanReplaceMatching;
  effect: ClipEffect;
}

export interface ExtensionEffectPlanSkippedClip {
  clipId: string;
  reason: string;
}

export interface ExtensionEffectPlanApplyResult {
  project: EditorProject;
  requestedPlanCount: number;
  appliedPlanCount: number;
  updatedClipIds: string[];
  skipped: ExtensionEffectPlanSkippedClip[];
}

const EXTENSION_EFFECT_TYPES: ClipEffect['type'][] = [
  'color',
  'audio',
  'motion',
  'caption',
  'mask',
  'stabilize',
  'reframe',
  'layout',
  'filter',
  'ai',
];
const MAX_EXTENSION_EFFECT_PLAN_COUNT = 250;
const MAX_EXTENSION_EFFECT_PARAMETER_COUNT = 64;
const MAX_EXTENSION_EFFECT_STRING_LENGTH = 500;

export function readExtensionEffectPlansFromRuntimeResult(value: unknown): ExtensionEffectPlan[] {
  const result = readRecord(value, 'External effect plan result');
  const plans = result.plans;
  if (!Array.isArray(plans)) {
    throw new Error('External effect plan result must include a plans array.');
  }

  if (plans.length > MAX_EXTENSION_EFFECT_PLAN_COUNT) {
    throw new Error(`External effect plan result exceeds the ${MAX_EXTENSION_EFFECT_PLAN_COUNT} plan limit.`);
  }

  return plans.map((plan, index) => readExtensionEffectPlan(plan, index));
}

export function applyExtensionEffectPlans(
  project: EditorProject,
  plans: ExtensionEffectPlan[],
): ExtensionEffectPlanApplyResult {
  if (plans.length === 0) {
    return {
      project,
      requestedPlanCount: 0,
      appliedPlanCount: 0,
      updatedClipIds: [],
      skipped: [],
    };
  }

  let tracks = project.tracks;
  let changed = false;
  let appliedPlanCount = 0;
  const updatedClipIds = new Set<string>();
  const skipped: ExtensionEffectPlanSkippedClip[] = [];
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  for (const plan of plans) {
    const target = findTrackAndClip(tracks, plan.clipId);
    if (!target) {
      skipped.push({ clipId: plan.clipId, reason: 'Clip not found.' });
      continue;
    }

    const { track, trackIndex, clip, clipIndex } = target;
    if (plan.trackId && track.id !== plan.trackId) {
      skipped.push({ clipId: plan.clipId, reason: 'Plan track does not match the current clip track.' });
      continue;
    }

    const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
    const skipReason = getEffectPlanApplySkipReason(track, clip, asset, plan.effect);
    if (skipReason) {
      skipped.push({ clipId: plan.clipId, reason: skipReason });
      continue;
    }

    const nextClip = applyEffectPlanToClip(clip, plan);
    if (nextClip === clip) {
      skipped.push({ clipId: plan.clipId, reason: 'Effect plan already matches the clip.' });
      continue;
    }

    tracks = tracks.map((candidateTrack, candidateTrackIndex) => (
      candidateTrackIndex === trackIndex
        ? {
            ...candidateTrack,
            clips: candidateTrack.clips.map((candidateClip, candidateClipIndex) => (
              candidateClipIndex === clipIndex ? nextClip : candidateClip
            )),
          }
        : candidateTrack
    ));
    changed = true;
    appliedPlanCount += 1;
    updatedClipIds.add(plan.clipId);
  }

  return {
    project: changed
      ? {
          ...project,
          tracks,
          updatedAt: new Date().toISOString(),
        }
      : project,
    requestedPlanCount: plans.length,
    appliedPlanCount,
    updatedClipIds: Array.from(updatedClipIds),
    skipped,
  };
}

function readExtensionEffectPlan(value: unknown, index: number): ExtensionEffectPlan {
  const plan = readRecord(value, `External effect plan ${index + 1}`);
  const clipId = readRequiredString(plan.clipId, `External effect plan ${index + 1} clipId`);
  const trackId = plan.trackId === undefined
    ? undefined
    : readRequiredString(plan.trackId, `External effect plan ${index + 1} trackId`);
  if (plan.operation !== 'upsert-effect') {
    throw new Error(`External effect plan ${index + 1} has an unsupported operation.`);
  }

  return {
    clipId,
    ...(trackId ? { trackId } : {}),
    operation: 'upsert-effect',
    replaceMatching: plan.replaceMatching === undefined
      ? undefined
      : readReplaceMatching(plan.replaceMatching, index),
    effect: readClipEffect(plan.effect, index),
  };
}

function readReplaceMatching(value: unknown, planIndex: number): ExtensionEffectPlanReplaceMatching {
  const match = readRecord(value, `External effect plan ${planIndex + 1} replaceMatching`);
  const type = readClipEffectType(match.type, `External effect plan ${planIndex + 1} replaceMatching type`);
  const parameterKey = match.parameterKey === undefined
    ? undefined
    : readRequiredString(match.parameterKey, `External effect plan ${planIndex + 1} replaceMatching parameterKey`);
  const parameterValue = match.parameterValue === undefined
    ? undefined
    : readEffectParameterValue(match.parameterValue, `External effect plan ${planIndex + 1} replaceMatching parameterValue`);

  return {
    type,
    ...(parameterKey ? { parameterKey } : {}),
    ...(parameterValue !== undefined ? { parameterValue } : {}),
  };
}

function readClipEffect(value: unknown, planIndex: number): ClipEffect {
  const effect = readRecord(value, `External effect plan ${planIndex + 1} effect`);
  return {
    id: readRequiredString(effect.id, `External effect plan ${planIndex + 1} effect id`),
    type: readClipEffectType(effect.type, `External effect plan ${planIndex + 1} effect type`),
    label: readRequiredString(effect.label, `External effect plan ${planIndex + 1} effect label`),
    enabled: readRequiredBoolean(effect.enabled, `External effect plan ${planIndex + 1} effect enabled`),
    parameters: readEffectParameters(effect.parameters, planIndex),
  };
}

function readEffectParameters(value: unknown, planIndex: number): ClipEffect['parameters'] {
  const parameters = readRecord(value, `External effect plan ${planIndex + 1} effect parameters`);
  const entries = Object.entries(parameters);
  if (entries.length > MAX_EXTENSION_EFFECT_PARAMETER_COUNT) {
    throw new Error(`External effect plan ${planIndex + 1} effect exceeds the ${MAX_EXTENSION_EFFECT_PARAMETER_COUNT} parameter limit.`);
  }

  return Object.fromEntries(entries.map(([key, parameterValue]) => {
    const normalizedKey = readRequiredString(key, `External effect plan ${planIndex + 1} effect parameter key`);
    return [
      normalizedKey,
      readEffectParameterValue(parameterValue, `External effect plan ${planIndex + 1} effect parameter ${normalizedKey}`),
    ];
  }));
}

function readEffectParameterValue(value: unknown, label: string): string | number | boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length > MAX_EXTENSION_EFFECT_STRING_LENGTH) {
      throw new Error(`${label} exceeds the ${MAX_EXTENSION_EFFECT_STRING_LENGTH} character limit.`);
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

function applyEffectPlanToClip(clip: TimelineClip, plan: ExtensionEffectPlan): TimelineClip {
  const nextEffect = cloneClipEffect(plan.effect);
  let replaced = false;
  const effects = clip.effects.reduce<ClipEffect[]>((items, effect) => {
    if (!effectMatchesPlanUpsert(effect, plan)) {
      items.push(effect);
      return items;
    }

    if (!replaced) {
      items.push(nextEffect);
      replaced = true;
    }

    return items;
  }, []);

  if (!replaced) {
    effects.push(nextEffect);
  }

  if (areClipEffectsEqual(clip.effects, effects)) {
    return clip;
  }

  return {
    ...clip,
    effects,
  };
}

function effectMatchesPlanUpsert(effect: ClipEffect, plan: ExtensionEffectPlan): boolean {
  if (plan.replaceMatching) {
    return effect.id === plan.effect.id || effectMatchesReplaceRule(effect, plan.replaceMatching);
  }

  return effect.id === plan.effect.id;
}

function effectMatchesReplaceRule(effect: ClipEffect, rule: ExtensionEffectPlanReplaceMatching): boolean {
  if (effect.type !== rule.type) {
    return false;
  }

  if (!rule.parameterKey) {
    return true;
  }

  return effect.parameters[rule.parameterKey] === rule.parameterValue;
}

function getEffectPlanApplySkipReason(
  track: TimelineTrack,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  effect: ClipEffect,
): string | undefined {
  if (track.locked || clip.locked) {
    return 'Track or clip is locked.';
  }

  if (track.muted || clip.muted) {
    return 'Track or clip is muted.';
  }

  if (!isEffectCompatibleWithClip(effect.type, clip.kind, asset)) {
    return `${effect.label} is not compatible with ${formatCompatibleClipKindLabel(clip.kind, asset)} clips.`;
  }

  return undefined;
}

function isEffectCompatibleWithClip(effectType: ClipEffect['type'], clipKind: ClipKind, asset?: EditorAsset): boolean {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  const effectiveKind = mediaKind ?? clipKind;

  if (effectType === 'audio') {
    return effectiveKind === 'audio' || effectiveKind === 'video';
  }

  if (effectType === 'caption') {
    return effectiveKind === 'text';
  }

  if (effectType === 'stabilize') {
    return effectiveKind === 'video';
  }

  return effectiveKind === 'video' ||
    effectiveKind === 'image' ||
    effectiveKind === 'text' ||
    effectiveKind === 'effect' ||
    (clipKind === 'ai' && !mediaKind);
}

function formatCompatibleClipKindLabel(clipKind: ClipKind, asset?: EditorAsset): string {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  return clipKind === 'ai' && mediaKind ? `ai/${mediaKind}` : clipKind;
}

function findTrackAndClip(
  tracks: TimelineTrack[],
  clipId: string,
): { track: TimelineTrack; trackIndex: number; clip: TimelineClip; clipIndex: number } | undefined {
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) {
      return {
        track,
        trackIndex,
        clip: track.clips[clipIndex],
        clipIndex,
      };
    }
  }

  return undefined;
}

function cloneClipEffect(effect: ClipEffect): ClipEffect {
  return {
    ...effect,
    parameters: { ...effect.parameters },
  };
}

function areClipEffectsEqual(left: ClipEffect[], right: ClipEffect[]): boolean {
  return JSON.stringify(left.map(normalizeEffectForCompare)) === JSON.stringify(right.map(normalizeEffectForCompare));
}

function normalizeEffectForCompare(effect: ClipEffect) {
  return {
    ...effect,
    parameters: Object.fromEntries(Object.entries(effect.parameters).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function readClipEffectType(value: unknown, label: string): ClipEffect['type'] {
  if (typeof value === 'string' && (EXTENSION_EFFECT_TYPES as string[]).includes(value)) {
    return value as ClipEffect['type'];
  }

  throw new Error(`${label} is not a supported effect type.`);
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} cannot be empty.`);
  }

  if (normalized.length > MAX_EXTENSION_EFFECT_STRING_LENGTH) {
    throw new Error(`${label} exceeds the ${MAX_EXTENSION_EFFECT_STRING_LENGTH} character limit.`);
  }

  return normalized;
}

function readRequiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}
