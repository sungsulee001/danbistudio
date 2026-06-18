import { createClip } from './project';
import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';
import { getTextStylePackStyle } from './text-style-packs';
import { TITLE_STYLE_EFFECT_LABEL } from './title-style';
import type { CaptionSegment, ClipEffect, EditorAsset, EditorProject, TimelineClip, TimelineMarker, TimelineTrack } from './types';

type TitleStylePackId = 'title-clean-center' | 'title-bold-box' | 'title-lower-third';
type CaptionStylePackId = 'caption-readable' | 'caption-creator-box' | 'caption-top-note';

interface TemplateTitleItem {
  offset: number;
  duration: number;
  text: string;
  stylePackId: TitleStylePackId;
  color: string;
}

interface TemplateCaptionItem {
  offset: number;
  duration: number;
  text: string;
  speaker?: string;
  stylePackId: CaptionStylePackId;
}

interface TemplateMarkerItem {
  offset: number;
  duration?: number;
  label: string;
  kind: TimelineMarker['kind'];
  color: string;
  note?: string;
}

interface TemplateAiItem {
  offset: number;
  duration: number;
  name: string;
  prompt: string;
  color: string;
}

export interface CreatorTemplatePreset {
  id: 'short-launch' | 'tutorial-steps' | 'review-pass';
  label: string;
  description: string;
  duration: number;
  titleItems: readonly TemplateTitleItem[];
  captionItems: readonly TemplateCaptionItem[];
  markerItems: readonly TemplateMarkerItem[];
  aiItems: readonly TemplateAiItem[];
}

export interface CreatorTemplateApplyResult {
  project: EditorProject;
  preset: CreatorTemplatePreset;
  createdClipIds: string[];
  createdCaptionIds: string[];
  createdMarkerIds: string[];
  appliedRange: {
    start: number;
    end: number;
    duration: number;
  };
  status: string;
}

export const CREATOR_TEMPLATE_PRESETS: readonly CreatorTemplatePreset[] = [
  {
    id: 'short-launch',
    label: 'Short Launch',
    description: '30s hook, proof, and call-to-action outline.',
    duration: 30,
    titleItems: [
      { offset: 0.4, duration: 3.6, text: 'Hook headline', stylePackId: 'title-bold-box', color: '#f59e0b' },
      { offset: 24, duration: 4.5, text: 'Call to action', stylePackId: 'title-lower-third', color: '#22c55e' },
    ],
    captionItems: [
      { offset: 1, duration: 2.4, text: 'Open with the clearest result.', speaker: 'Host', stylePackId: 'caption-creator-box' },
      { offset: 7, duration: 3, text: 'Show the proof point or before and after.', speaker: 'Host', stylePackId: 'caption-readable' },
      { offset: 16, duration: 3, text: 'Name the workflow and why it matters.', speaker: 'Host', stylePackId: 'caption-readable' },
      { offset: 25, duration: 3, text: 'Close with the next action.', speaker: 'Host', stylePackId: 'caption-creator-box' },
    ],
    markerItems: [
      { offset: 0, duration: 4, label: 'Hook', kind: 'chapter', color: '#22c55e', note: 'Lead with the promise.' },
      { offset: 7, duration: 6, label: 'Proof', kind: 'chapter', color: '#38bdf8', note: 'Show evidence or workflow.' },
      { offset: 24, duration: 5, label: 'CTA', kind: 'todo', color: '#f59e0b', note: 'Confirm the final call to action.' },
    ],
    aiItems: [
      { offset: 6, duration: 4, name: 'B-roll proof shot', prompt: 'clean product proof b-roll, local editing workflow, bright practical lighting', color: '#fb7185' },
      { offset: 15, duration: 4, name: 'B-roll workflow shot', prompt: 'close-up editing timeline, fast cuts, modern desktop workstation', color: '#f97316' },
    ],
  },
  {
    id: 'tutorial-steps',
    label: 'Tutorial Steps',
    description: 'Chaptered tutorial skeleton with step titles.',
    duration: 45,
    titleItems: [
      { offset: 0.5, duration: 3.5, text: 'What you will build', stylePackId: 'title-clean-center', color: '#60a5fa' },
      { offset: 10, duration: 3, text: 'Step 1', stylePackId: 'title-lower-third', color: '#34d399' },
      { offset: 23, duration: 3, text: 'Step 2', stylePackId: 'title-lower-third', color: '#a78bfa' },
      { offset: 38, duration: 4, text: 'Final check', stylePackId: 'title-bold-box', color: '#fbbf24' },
    ],
    captionItems: [
      { offset: 1.1, duration: 2.8, text: 'Start with the outcome viewers will have.', speaker: 'Narrator', stylePackId: 'caption-readable' },
      { offset: 10.5, duration: 3.2, text: 'Walk through the first concrete action.', speaker: 'Narrator', stylePackId: 'caption-top-note' },
      { offset: 23.5, duration: 3.2, text: 'Show the second action and the result.', speaker: 'Narrator', stylePackId: 'caption-top-note' },
      { offset: 39, duration: 3, text: 'Recap the finished state.', speaker: 'Narrator', stylePackId: 'caption-readable' },
    ],
    markerItems: [
      { offset: 0, duration: 5, label: 'Intro', kind: 'chapter', color: '#60a5fa' },
      { offset: 10, duration: 10, label: 'Step 1', kind: 'chapter', color: '#34d399' },
      { offset: 23, duration: 10, label: 'Step 2', kind: 'chapter', color: '#a78bfa' },
      { offset: 38, duration: 6, label: 'Recap', kind: 'chapter', color: '#fbbf24' },
    ],
    aiItems: [],
  },
  {
    id: 'review-pass',
    label: 'Review Pass',
    description: 'QC markers and captions for a fast approval cut.',
    duration: 24,
    titleItems: [
      { offset: 0.3, duration: 3.2, text: 'Review cut', stylePackId: 'title-clean-center', color: '#38bdf8' },
      { offset: 18, duration: 4, text: 'Needs approval', stylePackId: 'title-lower-third', color: '#f43f5e' },
    ],
    captionItems: [
      { offset: 1, duration: 2.5, text: 'Check framing and first impression.', speaker: 'Review', stylePackId: 'caption-top-note' },
      { offset: 8, duration: 2.5, text: 'Confirm captions and speaker labels.', speaker: 'Review', stylePackId: 'caption-readable' },
      { offset: 15, duration: 2.5, text: 'Listen for music and voice balance.', speaker: 'Review', stylePackId: 'caption-readable' },
      { offset: 20, duration: 2.5, text: 'Export after final approval.', speaker: 'Review', stylePackId: 'caption-creator-box' },
    ],
    markerItems: [
      { offset: 0, duration: 4, label: 'Framing', kind: 'todo', color: '#38bdf8', note: 'Check crop, safe area, and first frame.' },
      { offset: 8, duration: 4, label: 'Captions', kind: 'todo', color: '#22c55e', note: 'Check spelling, line breaks, and speaker labels.' },
      { offset: 15, duration: 4, label: 'Audio', kind: 'todo', color: '#f59e0b', note: 'Check loudness, clipping, and ducking.' },
      { offset: 20, duration: 4, label: 'Approval', kind: 'warning', color: '#f43f5e', note: 'Confirm final export settings.' },
    ],
    aiItems: [],
  },
];

export type CreatorTemplatePresetId = CreatorTemplatePreset['id'];

export function listCreatorTemplatePresets(): readonly CreatorTemplatePreset[] {
  return CREATOR_TEMPLATE_PRESETS;
}

export function findCreatorTemplatePreset(presetId: CreatorTemplatePresetId | string): CreatorTemplatePreset | undefined {
  return CREATOR_TEMPLATE_PRESETS.find((preset) => preset.id === presetId);
}

export function applyCreatorTemplatePreset(
  project: EditorProject,
  presetId: CreatorTemplatePresetId | string,
  options: { start?: number } = {},
): CreatorTemplateApplyResult {
  const preset = findCreatorTemplatePreset(presetId);
  if (!preset) {
    throw new Error(`Creator template preset not found: ${presetId}`);
  }

  const start = roundTemplateTime(Math.max(0, options.start ?? 0));
  const idSeed = `${preset.id}-${Math.round(start * 1000)}`;
  const existingIds = collectProjectIds(project);
  const createdClipIds: string[] = [];
  const createdCaptionIds: string[] = [];
  const createdMarkerIds: string[] = [];
  const assets: EditorAsset[] = [];
  const tracks: TimelineTrack[] = [...project.tracks];

  if (preset.titleItems.length > 0) {
    const textTrack = buildTemplateTrack(existingIds, {
      idBase: `track-template-text-${idSeed}`,
      name: `${preset.label} Titles`,
      kind: 'text',
    });
    const clips: TimelineClip[] = [];

    preset.titleItems.forEach((item, index) => {
      const assetId = uniqueId(`asset-template-${idSeed}-title-${index + 1}`, existingIds);
      const clipId = uniqueId(`clip-template-${idSeed}-title-${index + 1}`, existingIds);
      const style = getTextStylePackStyle('title', item.stylePackId);
      const effect: ClipEffect = {
        id: uniqueId(`effect-template-${idSeed}-title-style-${index + 1}`, existingIds),
        type: 'caption',
        label: TITLE_STYLE_EFFECT_LABEL,
        enabled: true,
        parameters: {
          ...style,
          titleStyle: true,
        },
      };

      assets.push({
        id: assetId,
        name: templateTitleClipName(item.text),
        kind: 'text',
        source: item.text,
        duration: item.duration,
      });
      clips.push(createClip({
        id: clipId,
        assetId,
        trackId: textTrack.id,
        name: templateTitleClipName(item.text),
        kind: 'text',
        start: roundTemplateTime(start + item.offset),
        duration: roundTemplateTime(item.duration),
        color: item.color,
        automationTags: ['title', 'template', preset.id],
        effects: [effect],
      }));
      createdClipIds.push(clipId);
    });

    tracks.push({
      ...textTrack,
      clips: clips.sort((a, b) => a.start - b.start),
    });
  }

  if (preset.aiItems.length > 0) {
    const aiTrack = buildTemplateTrack(existingIds, {
      idBase: `track-template-ai-${idSeed}`,
      name: `${preset.label} B-roll`,
      kind: 'video',
    });
    const clips = preset.aiItems.map((item, index) => {
      const clipId = uniqueId(`clip-template-${idSeed}-ai-${index + 1}`, existingIds);
      createdClipIds.push(clipId);
      return createClip({
        id: clipId,
        trackId: aiTrack.id,
        name: item.name,
        kind: 'ai',
        start: roundTemplateTime(start + item.offset),
        duration: roundTemplateTime(item.duration),
        color: item.color,
        automationTags: ['template', preset.id, 'comfyui', 'b-roll'],
        generation: {
          provider: 'comfyui',
          workflowName: DEFAULT_COMFYUI_WORKFLOW_NAME,
          prompt: item.prompt,
          status: 'draft',
        },
      });
    });

    tracks.push({
      ...aiTrack,
      clips: clips.sort((a, b) => a.start - b.start),
    });
  }

  const captions: CaptionSegment[] = preset.captionItems.map((item, index) => {
    const captionId = uniqueId(`caption-template-${idSeed}-${index + 1}`, existingIds);
    createdCaptionIds.push(captionId);

    return {
      id: captionId,
      start: roundTemplateTime(start + item.offset),
      end: roundTemplateTime(start + item.offset + item.duration),
      text: item.text,
      speaker: item.speaker,
      confidence: 1,
      style: getTextStylePackStyle('caption', item.stylePackId),
    };
  });

  const markers: TimelineMarker[] = preset.markerItems.map((item, index) => {
    const markerId = uniqueId(`marker-template-${idSeed}-${index + 1}`, existingIds);
    createdMarkerIds.push(markerId);

    return {
      id: markerId,
      time: roundTemplateTime(start + item.offset),
      label: item.label,
      color: item.color,
      kind: item.kind,
      duration: item.duration,
      note: item.note,
    };
  });

  const nextProject: EditorProject = {
    ...project,
    assets: [...project.assets, ...assets],
    tracks,
    captions: [...project.captions, ...captions].sort((a, b) => a.start - b.start),
    markers: [...project.markers, ...markers].sort((a, b) => a.time - b.time),
    duration: durationForTemplateProject(tracks, [...project.captions, ...captions], [...project.markers, ...markers], Math.max(project.duration, start + preset.duration)),
    updatedAt: new Date().toISOString(),
  };

  return {
    project: nextProject,
    preset,
    createdClipIds,
    createdCaptionIds,
    createdMarkerIds,
    appliedRange: {
      start,
      end: roundTemplateTime(start + preset.duration),
      duration: preset.duration,
    },
    status: `Applied ${preset.label} template: ${createdClipIds.length} clips, ${createdCaptionIds.length} captions, ${createdMarkerIds.length} markers`,
  };
}

function buildTemplateTrack(
  existingIds: Set<string>,
  options: {
    idBase: string;
    name: string;
    kind: TimelineTrack['kind'];
  },
): TimelineTrack {
  return {
    id: uniqueId(options.idBase, existingIds),
    name: options.name,
    kind: options.kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };
}

function collectProjectIds(project: EditorProject): Set<string> {
  return new Set([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.tracks.map((track) => track.id),
    ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
    ...project.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.effects.map((effect) => effect.id))),
    ...project.captions.map((caption) => caption.id),
    ...project.markers.map((marker) => marker.id),
  ]);
}

function uniqueId(baseId: string, existingIds: Set<string>): string {
  const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'template';
  if (!existingIds.has(safeBaseId)) {
    existingIds.add(safeBaseId);
    return safeBaseId;
  }

  let suffix = 2;
  while (existingIds.has(`${safeBaseId}-${suffix}`)) {
    suffix += 1;
  }

  const id = `${safeBaseId}-${suffix}`;
  existingIds.add(id);
  return id;
}

function durationForTemplateProject(
  tracks: TimelineTrack[],
  captions: CaptionSegment[],
  markers: TimelineMarker[],
  minimumDuration: number,
): number {
  const trackEnd = tracks.reduce((maxDuration, track) => (
    Math.max(maxDuration, ...track.clips.map((clip) => clip.start + clip.duration))
  ), 0);
  const captionEnd = captions.reduce((maxDuration, caption) => Math.max(maxDuration, caption.end), 0);
  const markerEnd = markers.reduce((maxDuration, marker) => Math.max(maxDuration, marker.time + (marker.duration ?? 0)), 0);
  return roundTemplateTime(Math.max(minimumDuration, trackEnd, captionEnd, markerEnd));
}

function roundTemplateTime(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function templateTitleClipName(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  const title = flattened.length > 36 ? `${flattened.slice(0, 33)}...` : flattened;
  return `Title: ${title || 'Template title'}`;
}
