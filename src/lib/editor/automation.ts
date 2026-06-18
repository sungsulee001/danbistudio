import type {
  AutomationJob,
  AutomationPlan,
  EditorAsset,
  EditorProject,
  ExportManifest,
  ExportProfile,
  TimelineClip,
} from './types';
import { resolveComfyUIWorkflowBinding, resolveProjectDefaultComfyUIWorkflowName } from './comfyui-workflows';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { isTrackPlayable } from './track-playback';

export interface ExportBuildOptions {
  exportRange?: {
    start: number;
    end: number;
  };
}

export function buildComfyUIAutomationPlan(
  project: EditorProject,
  selectedClipIds: string[] = [],
): AutomationPlan {
  const targetIds = new Set(selectedClipIds);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const candidateClips = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => shouldQueueClip(clip, targetIds, clip.assetId ? assetById.get(clip.assetId) : undefined, track.kind))
      .map((clip) => ({ clip, trackId: track.id }))
  ));

  const defaultWorkflowName = resolveProjectDefaultComfyUIWorkflowName(project);
  const ruleParameters = readRuleParameters(project);
  const jobs: AutomationJob[] = candidateClips.map(({ clip, trackId }, index) => {
    const track = project.tracks.find((item) => item.id === trackId);
    const nextClip = track ? findNextClipOnTrack(track, clip) : undefined;
    const isAiMorph = clip.transitionOut?.type === 'ai-morph';
    const binding = resolveComfyUIWorkflowBinding(clip, {
      defaultWorkflowName,
      preferredPresetId: isAiMorph ? 'transition-morph' : undefined,
      promptFallback: isAiMorph
        ? `AI morph transition from ${clip.name} to ${nextClip?.name ?? 'next shot'}, seamless temporal bridge`
        : undefined,
      projectWidth: project.width,
      projectHeight: project.height,
      ruleParameters,
      project,
    });

    return {
      id: `comfyui-${clip.id}`,
      clipId: clip.id,
      trackId,
      provider: 'comfyui',
      workflowName: binding.workflowName,
      priority: index + 1,
      parameters: {
        ...binding.parameters,
        prompt: binding.prompt,
        negative_prompt: binding.negativePrompt,
        seed: binding.seed,
        fps: project.fps,
        duration_seconds: clip.duration,
        timeline_start_seconds: clip.start,
        clip_name: clip.name,
        workflow_preset: binding.presetId,
        workflow_preset_source: binding.preset.source,
        ...(binding.preset.pluginId ? {
          workflow_plugin_id: binding.preset.pluginId,
          workflow_plugin_preset_id: binding.preset.pluginPresetId ?? '',
          required_node_types: binding.preset.requiredNodeTypes.join(','),
        } : {}),
        ...(isAiMorph ? {
          transition_type: 'ai-morph',
          transition_duration_seconds: clip.transitionOut?.duration ?? 1.2,
          transition_to_clip_id: nextClip?.id ?? '',
          transition_to_clip_name: nextClip?.name ?? '',
        } : {}),
      },
    };
  });

  return {
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    jobs,
    warnings: buildAutomationWarnings(project, jobs),
  };
}

export function buildExportManifest(project: EditorProject, profileId: string, options: ExportBuildOptions = {}): ExportManifest {
  const profile = findExportProfile(project, profileId);
  const exportRange = normalizeExportRange(project, options.exportRange);
  const renderGraph = project.tracks.flatMap((track) => (
    isTrackPlayable(track, project.tracks)
      ? track.clips
        .filter((clip) => !clip.muted && clipOverlapsExportRange(clip, exportRange))
        .sort((a, b) => a.start - b.start)
        .map((clip) => ({
          trackId: track.id,
          clipId: clip.id,
          start: clip.start,
          duration: clip.duration,
          effects: clip.effects
            .filter((effect) => effect.enabled)
            .map((effect) => effect.label),
          transitionIn: clip.transitionIn,
          transitionOut: clip.transitionOut,
        }))
      : []
  ));

  return {
    projectId: project.id,
    profile,
    duration: exportRange?.duration ?? project.duration,
    ...(exportRange ? { exportRange } : {}),
    fps: project.fps,
    captions: project.captions.filter((caption) => captionOverlapsExportRange(caption, exportRange)),
    markers: project.markers.filter((marker) => markerInsideExportRange(marker, exportRange)),
    renderGraph,
    issues: validateTimeline(project, profile, exportRange),
  };
}

function clipOverlapsExportRange(
  clip: TimelineClip,
  range?: ExportManifest['exportRange'],
): boolean {
  if (!range) {
    return true;
  }

  return clip.start < range.end && clip.start + clip.duration > range.start;
}

function captionOverlapsExportRange(
  caption: EditorProject['captions'][number],
  range?: ExportManifest['exportRange'],
): boolean {
  if (!range) {
    return true;
  }

  return caption.start < range.end && caption.end > range.start;
}

function markerInsideExportRange(
  marker: EditorProject['markers'][number],
  range?: ExportManifest['exportRange'],
): boolean {
  if (!range) {
    return true;
  }

  return marker.time >= range.start && marker.time <= range.end;
}

function normalizeExportRange(
  project: EditorProject,
  range?: { start: number; end: number },
): ExportManifest['exportRange'] {
  if (!range) {
    return undefined;
  }

  const start = roundTime(clampNumber(Math.min(range.start, range.end), 0, project.duration));
  const end = roundTime(clampNumber(Math.max(range.start, range.end), 0, project.duration));
  const duration = roundTime(end - start);
  if (duration <= 0.001) {
    throw new Error('Export range must be longer than 0 seconds.');
  }

  return { start, end, duration };
}

function shouldQueueClip(clip: TimelineClip, targetIds: Set<string>, asset: EditorAsset | undefined, trackKind: string): boolean {
  if (targetIds.size > 0 && !targetIds.has(clip.id)) {
    return false;
  }

  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'audio' || (clip.kind === 'ai' && trackKind === 'audio')) {
    return false;
  }

  return clip.automationTags.includes('comfyui') ||
    clip.transitionOut?.type === 'ai-morph' ||
    clip.effects.some((effect) => effect.type === 'ai' && effect.enabled) ||
    (clip.kind === 'ai' && trackKind !== 'audio');
}

function readRuleNumber(project: EditorProject, key: string, fallback: number): number {
  const value = project.automation
    .filter((rule) => rule.provider === 'comfyui')
    .map((rule) => rule.parameters[key])
    .find((parameter) => typeof parameter === 'number');

  return typeof value === 'number' ? value : fallback;
}

function readRuleParameters(project: EditorProject): Record<string, string | number | boolean> {
  const parameters: Record<string, string | number | boolean> = {};
  for (const rule of project.automation.filter((item) => item.provider === 'comfyui')) {
    Object.assign(parameters, rule.parameters);
  }

  parameters.steps = typeof parameters.steps === 'number' ? parameters.steps : readRuleNumber(project, 'steps', 24);
  parameters.cfg = typeof parameters.cfg === 'number' ? parameters.cfg : readRuleNumber(project, 'cfg', 6);
  parameters.width = typeof parameters.width === 'number' ? parameters.width : readRuleNumber(project, 'width', project.width);
  parameters.height = typeof parameters.height === 'number' ? parameters.height : readRuleNumber(project, 'height', project.height);
  return parameters;
}

function buildAutomationWarnings(project: EditorProject, jobs: AutomationJob[]): string[] {
  const warnings: string[] = [];

  if (jobs.length === 0) {
    warnings.push('No ComfyUI-ready clips were found.');
  }

  if (!project.automation.some((rule) => rule.provider === 'comfyui')) {
    warnings.push('No ComfyUI automation rule is configured for this project.');
  }

  const overSizeJobs = jobs.filter((job) => Number(job.parameters.width) > 2048 || Number(job.parameters.height) > 2048);
  if (overSizeJobs.length > 0) {
    warnings.push('Some jobs request high resolution frames; local GPU memory may limit throughput.');
  }

  return warnings;
}

function findNextClipOnTrack(track: { clips: TimelineClip[] }, clip: TimelineClip): TimelineClip | undefined {
  return track.clips
    .filter((candidate) => candidate.id !== clip.id && candidate.start > clip.start)
    .sort((a, b) => a.start - b.start)[0];
}

function findExportProfile(project: EditorProject, profileId: string): ExportProfile {
  const profile = project.exportProfiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Export profile not found: ${profileId}`);
  }

  return profile;
}

function validateTimeline(
  project: EditorProject,
  profile: ExportProfile,
  exportRange?: ExportManifest['exportRange'],
): string[] {
  const issues: string[] = [];
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  if (project.duration <= 0) {
    issues.push('Project duration must be greater than zero.');
  }

  if (profile.fps !== project.fps) {
    issues.push(`Export FPS ${profile.fps} differs from timeline FPS ${project.fps}.`);
  }

  for (const track of project.tracks) {
    if (!isTrackPlayable(track, project.tracks)) {
      continue;
    }

    for (const clip of track.clips) {
      if (clip.muted || !clipOverlapsExportRange(clip, exportRange)) {
        continue;
      }

      if (clip.start < 0) {
        issues.push(`${clip.name} starts before zero.`);
      }

      if (clip.duration <= 0) {
        issues.push(`${clip.name} has no duration.`);
      }

      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      const assetMediaKind = resolveRenderableAssetMediaKind(asset);
      if (clip.kind === 'ai') {
        if (clip.generation?.status === 'rendered') {
          if (!assetMediaKind) {
            issues.push(`${clip.name} is marked rendered but has no linked render media for final export.`);
          }
        } else if (clip.generation || !assetMediaKind) {
          issues.push(`${clip.name} needs a ComfyUI render before final export.`);
        }
      }
    }
  }

  return issues;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
