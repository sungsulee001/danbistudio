import { buildGeneratePayloads, type GenerateApiPayload } from './comfyui-bridge';
import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';
import { normalizeCaptionStyle } from './caption-style';
import { normalizeMasterLoudnessLufs, normalizeMasterTruePeakDb } from './master-audio';
import { clipHasTimelineAudio } from './media-metadata';
import { applyTrackedObjectMask, type ObjectMaskShape } from './object-mask';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { AutomationJob, AutomationRule, CaptionSegment, ClipEffect, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';

export type EditorHookEvent = AutomationRule['trigger'];

export interface EditorHookContext {
  event: EditorHookEvent;
  selectedClipIds?: string[];
  assetIds?: string[];
  executeWebhooks?: boolean;
}

export interface EditorHookAction {
  id: string;
  ruleId: string;
  ruleName: string;
  provider: AutomationRule['provider'];
  trigger: AutomationRule['trigger'];
  status: 'prepared' | 'skipped';
  description: string;
  localActions: EditorHookLocalAction[];
  jobs: AutomationJob[];
  generatePayloads: GenerateApiPayload[];
  webhookPayloads: EditorHookWebhookPayload[];
  parameters: Record<string, string | number | boolean>;
  warnings: string[];
}

export interface EditorHookLocalAction {
  id: string;
  type: 'caption-burn-in' | 'loudness-normalization' | 'color-match' | 'object-mask';
  label: string;
  targetClipIds: string[];
  parameters: Record<string, string | number | boolean>;
}

export interface EditorHookWebhookPayload {
  source: 'danbi-studio';
  event: EditorHookEvent;
  ruleId: string;
  ruleName: string;
  targetUrl?: string;
  projectId: string;
  selectedClipIds: string[];
  assetIds: string[];
  jobs: AutomationJob[];
  generatePayloads: GenerateApiPayload[];
  parameters: Record<string, string | number | boolean>;
}

export interface EditorHookPlan {
  projectId: string;
  event: EditorHookEvent;
  generatedAt: string;
  matchedRuleCount: number;
  actionCount: number;
  actions: EditorHookAction[];
  warnings: string[];
}

export interface EditorHookApplyResult {
  project: EditorProject;
  changed: boolean;
  appliedActionIds: string[];
  appliedClipIds: string[];
  warnings: string[];
}

export function buildEditorHookPlan(project: EditorProject, context: EditorHookContext): EditorHookPlan {
  const rules = project.automation.filter((rule) => rule.trigger === context.event);
  const actions = rules.map((rule, index) => buildHookAction(project, rule, context, index));
  const warnings = buildHookWarnings(context.event, rules, actions);

  return {
    projectId: project.id,
    event: context.event,
    generatedAt: new Date().toISOString(),
    matchedRuleCount: rules.length,
    actionCount: actions.filter((action) => action.status === 'prepared').length,
    actions,
    warnings,
  };
}

export function applyEditorHookPlan(project: EditorProject, plan: EditorHookPlan): EditorHookApplyResult {
  let nextProject = project;
  let changed = false;
  const appliedActionIds: string[] = [];
  const appliedClipIds = new Set<string>();
  const warnings: string[] = [];

  for (const action of plan.actions) {
    if (action.status !== 'prepared' || action.provider !== 'local') {
      continue;
    }

    for (const localAction of action.localActions) {
      const result = applyLocalHookAction(nextProject, action, localAction);
      nextProject = result.project;
      warnings.push(...result.warnings);

      if (result.applied) {
        appliedActionIds.push(localAction.id);
        result.appliedClipIds.forEach((clipId) => appliedClipIds.add(clipId));
      }

      changed = changed || result.changed;
    }
  }

  return {
    project: changed ? touchProject(nextProject) : nextProject,
    changed,
    appliedActionIds,
    appliedClipIds: Array.from(appliedClipIds),
    warnings,
  };
}

function buildHookAction(project: EditorProject, rule: AutomationRule, context: EditorHookContext, index: number): EditorHookAction {
  const candidateClips = findHookCandidateClips(project, rule, context);
  const localActions = rule.provider === 'local'
    ? buildLocalActions(project, rule, candidateClips)
    : [];
  const jobs = rule.provider === 'comfyui'
    ? candidateClips.map(({ clip, track }, clipIndex) => buildComfyJob(project, rule, clip, track, index + clipIndex + 1))
    : [];
  const generatePayloads = jobs.length > 0 ? buildGeneratePayloads({ projectId: project.id, generatedAt: new Date().toISOString(), jobs, warnings: [] }) : [];
  const warnings = buildActionWarnings(rule, candidateClips, jobs);
  const webhookPayloads = rule.provider === 'webhook'
    ? [buildWebhookPayload(project, rule, context, candidateClips.map(({ clip }) => clip.id), jobs, generatePayloads)]
    : [];
  const prepared = localActions.length > 0 || jobs.length > 0 || webhookPayloads.length > 0;

  return {
    id: `hook-${rule.id}-${Date.now()}`,
    ruleId: rule.id,
    ruleName: rule.name,
    provider: rule.provider,
    trigger: rule.trigger,
    status: prepared ? 'prepared' : 'skipped',
    description: describeAction(rule, localActions.length, jobs.length, webhookPayloads.length),
    localActions,
    jobs,
    generatePayloads,
    webhookPayloads,
    parameters: rule.parameters,
    warnings,
  };
}

function buildLocalActions(
  project: EditorProject,
  rule: AutomationRule,
  candidateClips: Array<{ clip: TimelineClip; track: TimelineTrack }>,
): EditorHookLocalAction[] {
  const actions: EditorHookLocalAction[] = [];
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  if (rule.parameters.captions === true && project.captions.some((caption) => caption.text.trim().length > 0)) {
    actions.push({
      id: `${rule.id}-caption-burn-in`,
      type: 'caption-burn-in',
      label: 'Prepare caption burn-in',
      targetClipIds: [],
      parameters: {
        captionCount: project.captions.length,
      },
    });
  }

  if (typeof rule.parameters.loudnessLufs === 'number' && Number.isFinite(rule.parameters.loudnessLufs)) {
    actions.push({
      id: `${rule.id}-loudness-normalization`,
      type: 'loudness-normalization',
      label: 'Prepare loudness normalization',
      targetClipIds: candidateClips
        .filter(({ clip }) => isLoudnessHookClip(clip, clip.assetId ? assetById.get(clip.assetId) : undefined))
        .map(({ clip }) => clip.id),
      parameters: {
        loudnessLufs: rule.parameters.loudnessLufs,
        ...(typeof rule.parameters.truePeakDb === 'number' ? { truePeakDb: rule.parameters.truePeakDb } : {}),
      },
    });
  }

  if (rule.parameters.colorMatch === true) {
    const colorMatchClipIds = candidateClips
      .filter(({ clip, track }) => (
        track.kind !== 'audio' &&
        (
          clip.automationTags.includes('color-match') ||
          clip.effects.some((effect) => effect.type === 'color' && effect.enabled)
        )
      ))
      .map(({ clip }) => clip.id);

    if (colorMatchClipIds.length > 0) {
      actions.push({
        id: `${rule.id}-color-match`,
        type: 'color-match',
        label: 'Prepare color pass',
        targetClipIds: colorMatchClipIds,
        parameters: {
          clipCount: colorMatchClipIds.length,
        },
      });
    }
  }

  if (rule.parameters.objectMask === true) {
    const objectMaskClipIds = candidateClips
      .filter(({ clip, track }) => isVisualHookClip(
        clip,
        track,
        clip.assetId ? project.assets.find((asset) => asset.id === clip.assetId) : undefined,
      ))
      .map(({ clip }) => clip.id);

    if (objectMaskClipIds.length > 0) {
      actions.push({
        id: `${rule.id}-object-mask`,
        type: 'object-mask',
        label: 'Apply tracked object mask',
        targetClipIds: objectMaskClipIds,
        parameters: {
          shape: readObjectMaskShape(rule.parameters.objectMaskShape),
          width: readNumber(rule.parameters.objectMaskWidth, 0.36),
          height: readNumber(rule.parameters.objectMaskHeight, 0.52),
          feather: readNumber(rule.parameters.objectMaskFeather, 0.05),
          invert: rule.parameters.objectMaskInvert === true,
        },
      });
    }
  }

  return actions;
}

function findHookCandidateClips(
  project: EditorProject,
  rule: AutomationRule,
  context: EditorHookContext,
): Array<{ clip: TimelineClip; track: TimelineTrack }> {
  const selectedClipIds = new Set(context.selectedClipIds ?? []);
  const assetIds = new Set(context.assetIds ?? []);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  return project.tracks.flatMap((track) => {
    const trackAllowed = rule.targetTrackIds.length === 0 || rule.targetTrackIds.includes(track.id);
    if (!trackAllowed || track.locked) {
      return [];
    }

    return track.clips
      .filter((clip) => {
        if (clip.locked || clip.muted) {
          return false;
        }

        if (selectedClipIds.size > 0 && !selectedClipIds.has(clip.id)) {
          return false;
        }

        if (assetIds.size > 0 && (!clip.assetId || !assetIds.has(clip.assetId))) {
          return false;
        }

        if (rule.provider === 'comfyui') {
          return isComfyReadyClip(clip, clip.assetId ? assetById.get(clip.assetId) : undefined, track);
        }

        return true;
      })
      .map((clip) => ({ clip, track }));
  });
}

function buildComfyJob(
  project: EditorProject,
  rule: AutomationRule,
  clip: TimelineClip,
  track: TimelineTrack,
  priority: number,
): AutomationJob {
  const workflowName = rule.workflowName ?? clip.generation?.workflowName ?? DEFAULT_COMFYUI_WORKFLOW_NAME;

  return {
    id: `hook-${rule.id}-${clip.id}`,
    clipId: clip.id,
    trackId: track.id,
    provider: 'comfyui',
    workflowName,
    priority,
    parameters: {
      prompt: clip.generation?.prompt ?? `${clip.name}, cinematic production quality`,
      negative_prompt: clip.generation?.negativePrompt ?? 'low quality, distorted, unreadable text',
      seed: clip.generation?.seed ?? 0,
      steps: readRuleNumber(rule, 'steps', 24),
      cfg: readRuleNumber(rule, 'cfg', 6),
      width: readRuleNumber(rule, 'width', project.width),
      height: readRuleNumber(rule, 'height', project.height),
      fps: project.fps,
      duration_seconds: clip.duration,
      timeline_start_seconds: clip.start,
      clip_name: clip.name,
      trigger: rule.trigger,
      ...rule.parameters,
    },
  };
}

function buildWebhookPayload(
  project: EditorProject,
  rule: AutomationRule,
  context: EditorHookContext,
  selectedClipIds: string[],
  jobs: AutomationJob[],
  generatePayloads: GenerateApiPayload[],
): EditorHookWebhookPayload {
  const targetUrl = typeof rule.parameters.url === 'string' ? rule.parameters.url : undefined;

  return {
    source: 'danbi-studio',
    event: context.event,
    ruleId: rule.id,
    ruleName: rule.name,
    targetUrl,
    projectId: project.id,
    selectedClipIds,
    assetIds: context.assetIds ?? [],
    jobs,
    generatePayloads,
    parameters: rule.parameters,
  };
}

function buildHookWarnings(event: EditorHookEvent, rules: AutomationRule[], actions: EditorHookAction[]): string[] {
  const warnings = [];

  if (rules.length === 0) {
    warnings.push(`No automation rules are registered for ${event}.`);
  }

  if (rules.length > 0 && !actions.some((action) => action.status === 'prepared')) {
    warnings.push(`No hook actions were prepared for ${event}.`);
  }

  return warnings;
}

function applyLocalHookAction(
  project: EditorProject,
  action: EditorHookAction,
  localAction: EditorHookLocalAction,
): { project: EditorProject; changed: boolean; applied: boolean; appliedClipIds: string[]; warnings: string[] } {
  switch (localAction.type) {
    case 'caption-burn-in':
      return applyCaptionBurnInHook(project, action);
    case 'loudness-normalization':
      return applyLoudnessHook(project, action);
    case 'color-match':
      return applyColorMatchHook(project, action, localAction.targetClipIds);
    case 'object-mask':
      return applyObjectMaskHook(project, action, localAction);
    default:
      return {
        project,
        changed: false,
        applied: false,
        appliedClipIds: [],
        warnings: [`Unsupported local hook action: ${localAction.type}`],
      };
  }
}

function applyObjectMaskHook(
  project: EditorProject,
  action: EditorHookAction,
  localAction: EditorHookLocalAction,
): { project: EditorProject; changed: boolean; applied: boolean; appliedClipIds: string[]; warnings: string[] } {
  if (localAction.targetClipIds.length === 0) {
    return { project, changed: false, applied: false, appliedClipIds: [], warnings: [`${action.ruleName} found no object-mask targets.`] };
  }

  const result = applyTrackedObjectMask(project, localAction.targetClipIds, {
    shape: readObjectMaskShape(localAction.parameters.shape),
    width: readNumber(localAction.parameters.width, 0.36),
    height: readNumber(localAction.parameters.height, 0.52),
    feather: readNumber(localAction.parameters.feather, 0.05),
    invert: localAction.parameters.invert === true,
  });

  return {
    project: result.project,
    changed: result.updatedClipIds.length > 0,
    applied: result.updatedClipIds.length > 0,
    appliedClipIds: result.updatedClipIds,
    warnings: result.skipped.map((item) => `${action.ruleName} skipped ${item.clipId}: ${item.reason}`),
  };
}

function applyCaptionBurnInHook(
  project: EditorProject,
  action: EditorHookAction,
): { project: EditorProject; changed: boolean; applied: boolean; appliedClipIds: string[]; warnings: string[] } {
  if (project.captions.length === 0) {
    return { project, changed: false, applied: false, appliedClipIds: [], warnings: [`${action.ruleName} has no captions to prepare.`] };
  }

  const patch = readCaptionStylePatch(action.parameters);
  let changed = false;
  const captions = project.captions.map((caption) => {
    const currentStyle = normalizeCaptionStyle(caption.style);
    const nextStyle = normalizeCaptionStyle({ ...currentStyle, ...patch });
    if (!captionStyleEquals(caption.style, nextStyle)) {
      changed = true;
      return {
        ...caption,
        style: nextStyle,
      };
    }

    return caption;
  });

  return {
    project: changed ? { ...project, captions } : project,
    changed,
    applied: true,
    appliedClipIds: [],
    warnings: [],
  };
}

function applyLoudnessHook(
  project: EditorProject,
  action: EditorHookAction,
): { project: EditorProject; changed: boolean; applied: boolean; appliedClipIds: string[]; warnings: string[] } {
  const loudnessLufs = readFiniteNumber(action.parameters.loudnessLufs);
  const truePeakDb = readFiniteNumber(action.parameters.truePeakDb);

  if (loudnessLufs === undefined && truePeakDb === undefined) {
    return {
      project,
      changed: false,
      applied: false,
      appliedClipIds: [],
      warnings: [`${action.ruleName} has no loudness parameters.`],
    };
  }

  let changed = false;
  const automation = project.automation.map((rule) => {
    if (rule.id !== action.ruleId) {
      return rule;
    }

    const parameters = {
      ...rule.parameters,
      ...(loudnessLufs === undefined ? {} : { loudnessLufs: normalizeMasterLoudnessLufs(loudnessLufs) }),
      ...(truePeakDb === undefined ? {} : { truePeakDb: normalizeMasterTruePeakDb(truePeakDb) }),
    };
    changed = changed || !recordEquals(rule.parameters, parameters);

    return changed ? { ...rule, parameters } : rule;
  });

  return {
    project: changed ? { ...project, automation } : project,
    changed,
    applied: true,
    appliedClipIds: action.localActions
      .find((localAction) => localAction.type === 'loudness-normalization')
      ?.targetClipIds ?? [],
    warnings: [],
  };
}

function applyColorMatchHook(
  project: EditorProject,
  action: EditorHookAction,
  targetClipIds: string[],
): { project: EditorProject; changed: boolean; applied: boolean; appliedClipIds: string[]; warnings: string[] } {
  const targetIds = new Set(targetClipIds);
  if (targetIds.size === 0) {
    return { project, changed: false, applied: false, appliedClipIds: [], warnings: [`${action.ruleName} found no color-match targets.`] };
  }

  const parameters = readColorMatchParameters(action.parameters);
  const appliedClipIds: string[] = [];
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.locked) {
      return track;
    }

    return {
      ...track,
      clips: track.clips.map((clip) => {
        if (!targetIds.has(clip.id) || clip.locked || track.kind === 'audio') {
          return clip;
        }

        const nextClip = upsertColorMatchEffect(clip, action.ruleId, parameters);
        if (nextClip !== clip) {
          changed = true;
          appliedClipIds.push(clip.id);
        }

        return nextClip;
      }),
    };
  });

  return {
    project: changed ? { ...project, tracks } : project,
    changed,
    applied: appliedClipIds.length > 0,
    appliedClipIds,
    warnings: appliedClipIds.length === 0 ? [`${action.ruleName} could not update any color-match clips.`] : [],
  };
}

function upsertColorMatchEffect(
  clip: TimelineClip,
  ruleId: string,
  parameters: Record<string, string | number | boolean>,
): TimelineClip {
  const existing = clip.effects.find((effect) => isColorMatchEffect(effect));
  const nextEffect: ClipEffect = existing
    ? {
      ...existing,
      enabled: true,
      parameters: {
        ...existing.parameters,
        ...parameters,
        source: 'hook',
        ruleId,
      },
    }
    : {
      id: `effect-color-match-${ruleId}-${clip.id}`,
      type: 'color',
      label: 'Color match',
      enabled: true,
      parameters: {
        ...parameters,
        source: 'hook',
        ruleId,
      },
    };

  if (existing) {
    if (
      existing.enabled === nextEffect.enabled &&
      existing.label === nextEffect.label &&
      recordEquals(existing.parameters, nextEffect.parameters)
    ) {
      return clip;
    }

    return {
      ...clip,
      effects: clip.effects.map((effect) => (effect.id === existing.id ? nextEffect : effect)),
    };
  }

  return {
    ...clip,
    effects: [...clip.effects, nextEffect],
  };
}

function readCaptionStylePatch(parameters: Record<string, string | number | boolean>) {
  return {
    ...(typeof parameters.captionFontSize === 'number' ? { fontSize: parameters.captionFontSize } : {}),
    ...(typeof parameters.captionFontColor === 'string' ? { fontColor: parameters.captionFontColor } : {}),
    ...(typeof parameters.captionBoxEnabled === 'boolean' ? { boxEnabled: parameters.captionBoxEnabled } : {}),
    ...(typeof parameters.captionBoxColor === 'string' ? { boxColor: parameters.captionBoxColor } : {}),
    ...(typeof parameters.captionBoxOpacity === 'number' ? { boxOpacity: parameters.captionBoxOpacity } : {}),
    ...(isCaptionPosition(parameters.captionPosition) ? { position: parameters.captionPosition } : {}),
    ...(isCaptionAlign(parameters.captionAlign) ? { align: parameters.captionAlign } : {}),
  };
}

function readColorMatchParameters(parameters: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  return {
    brightness: readNumber(parameters.colorMatchBrightness, 0.02),
    contrast: readNumber(parameters.colorMatchContrast, 1.06),
    saturation: readNumber(parameters.colorMatchSaturation, 1.08),
    gamma: readNumber(parameters.colorMatchGamma, 1),
    temperature: readNumber(parameters.colorMatchTemperature, 0),
    tint: readNumber(parameters.colorMatchTint, 0),
  };
}

function isColorMatchEffect(effect: ClipEffect): boolean {
  return effect.type === 'color' && (
    effect.label.toLowerCase() === 'color match' ||
    effect.id.toLowerCase().includes('color-match') ||
    effect.parameters.source === 'hook'
  );
}

function captionStyleEquals(
  current: CaptionSegment['style'],
  next: Required<NonNullable<CaptionSegment['style']>>,
): boolean {
  const normalizedCurrent = normalizeCaptionStyle(current);
  return normalizedCurrent.fontSize === next.fontSize &&
    normalizedCurrent.fontColor === next.fontColor &&
    normalizedCurrent.boxEnabled === next.boxEnabled &&
    normalizedCurrent.boxColor === next.boxColor &&
    normalizedCurrent.boxOpacity === next.boxOpacity &&
    normalizedCurrent.position === next.position &&
    normalizedCurrent.align === next.align;
}

function isCaptionPosition(value: unknown): value is NonNullable<CaptionSegment['style']>['position'] {
  return value === 'top' || value === 'middle' || value === 'bottom';
}

function isCaptionAlign(value: unknown): value is NonNullable<CaptionSegment['style']>['align'] {
  return value === 'left' || value === 'center' || value === 'right';
}

function isVisualHookClip(clip: TimelineClip, track: TimelineTrack, asset?: EditorAsset): boolean {
  return track.kind !== 'audio' && (
    clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    (clip.kind === 'ai' && !asset)
  );
}

function isLoudnessHookClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'audio' || clipHasTimelineAudio(clip, asset);
}

function readObjectMaskShape(value: unknown): ObjectMaskShape {
  return value === 'rectangle' ? 'rectangle' : 'ellipse';
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function recordEquals(
  left: Record<string, string | number | boolean>,
  right: Record<string, string | number | boolean>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function touchProject(project: EditorProject): EditorProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

function buildActionWarnings(
  rule: AutomationRule,
  candidateClips: Array<{ clip: TimelineClip; track: TimelineTrack }>,
  jobs: AutomationJob[],
): string[] {
  const warnings = [];

  if (rule.provider === 'comfyui' && candidateClips.length === 0) {
    warnings.push(`${rule.name} found no ComfyUI-ready clips.`);
  }

  if (jobs.some((job) => Number(job.parameters.width) > 2048 || Number(job.parameters.height) > 2048)) {
    warnings.push(`${rule.name} requests high resolution frames; local GPU memory may limit throughput.`);
  }

  if (rule.provider === 'webhook' && typeof rule.parameters.url !== 'string') {
    warnings.push(`${rule.name} has no webhook url parameter.`);
  }

  return warnings;
}

function describeAction(rule: AutomationRule, localActionCount: number, jobCount: number, webhookCount: number): string {
  if (rule.provider === 'comfyui') {
    return `${jobCount} ComfyUI job${jobCount === 1 ? '' : 's'} prepared`;
  }

  if (rule.provider === 'webhook') {
    return `${webhookCount} webhook payload${webhookCount === 1 ? '' : 's'} prepared`;
  }

  return `${localActionCount} local action${localActionCount === 1 ? '' : 's'} prepared`;
}

function isComfyReadyClip(clip: TimelineClip, asset: EditorAsset | undefined, track: TimelineTrack): boolean {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'audio' || (clip.kind === 'ai' && track.kind === 'audio')) {
    return false;
  }

  return clip.automationTags.includes('comfyui') ||
    clip.effects.some((effect) => effect.type === 'ai' && effect.enabled) ||
    (clip.kind === 'ai' && track.kind !== 'audio');
}

function readRuleNumber(rule: AutomationRule, key: string, fallback: number): number {
  const value = rule.parameters[key];
  return typeof value === 'number' ? value : fallback;
}
