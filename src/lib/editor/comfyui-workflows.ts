import type { EditorPluginComfyUIWorkflowPreset, EditorPluginManifest, EditorProject, GenerationBinding, TimelineClip } from './types';
import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';

export interface ComfyUIWorkflowPreset {
  id: string;
  label: string;
  workflowName: string;
  description: string;
  promptSuffix: string;
  negativePrompt: string;
  parameters: Record<string, string | number | boolean>;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  pluginName?: string;
  pluginPresetId?: string;
  requiredNodeTypes: string[];
}

export interface ComfyUIWorkflowBinding {
  preset: ComfyUIWorkflowPreset;
  presetId: string;
  workflowName: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  parameters: Record<string, string | number | boolean>;
  status: GenerationBinding['status'];
}

export interface ComfyUIWorkflowBindingPatch extends Partial<Pick<
  GenerationBinding,
  'presetId' | 'workflowName' | 'prompt' | 'negativePrompt' | 'seed' | 'parameters' | 'status'
>> {
  replaceParameters?: boolean;
}

export const COMFYUI_WORKFLOW_PRESETS: ComfyUIWorkflowPreset[] = [
  {
    id: 'broll-i2v',
    label: 'B-roll I2V',
    workflowName: DEFAULT_COMFYUI_WORKFLOW_NAME,
    description: 'Image/video-to-video cutaway generation for timeline B-roll.',
    promptSuffix: 'cinematic production quality, coherent motion, editor-ready B-roll',
    negativePrompt: 'low quality, distorted, unreadable text, flicker, broken motion',
    parameters: { steps: 24, cfg: 6 },
    source: 'builtin',
    requiredNodeTypes: [],
  },
  {
    id: 'style-transfer',
    label: 'Style Transfer',
    workflowName: 'style_transfer',
    description: 'Apply a visual style while preserving timing and composition.',
    promptSuffix: 'consistent style transfer, preserved subject, clean temporal stability',
    negativePrompt: 'identity drift, heavy artifacts, unstable texture, warped subject',
    parameters: { steps: 28, cfg: 5.5, denoise: 0.42 },
    source: 'builtin',
    requiredNodeTypes: [],
  },
  {
    id: 'upscale-restore',
    label: 'Upscale Restore',
    workflowName: 'upscale_restore',
    description: 'Clean local upscaling and detail restoration for selected clips.',
    promptSuffix: 'high detail restoration, natural texture, clean edges',
    negativePrompt: 'oversharpened, plastic skin, halos, ringing artifacts',
    parameters: { steps: 18, cfg: 4, upscale: 2 },
    source: 'builtin',
    requiredNodeTypes: [],
  },
  {
    id: 'background-remove',
    label: 'Background Remove',
    workflowName: 'background_remove',
    description: 'Generate keyed or isolated subject output for compositing.',
    promptSuffix: 'clean subject isolation, accurate edges, transparent background',
    negativePrompt: 'missing limbs, noisy matte, jagged edges, background remnants',
    parameters: { steps: 16, cfg: 4.5, alpha_output: true },
    source: 'builtin',
    requiredNodeTypes: [],
  },
  {
    id: 'interpolation',
    label: 'Interpolation',
    workflowName: 'frame_interpolation',
    description: 'Generate smoother motion or slow-motion helper frames.',
    promptSuffix: 'smooth temporal interpolation, natural motion, no ghosting',
    negativePrompt: 'ghosting, duplicated limbs, warped frame, jitter',
    parameters: { interpolation_factor: 2, motion_sensitivity: 0.5 },
    source: 'builtin',
    requiredNodeTypes: [],
  },
  {
    id: 'transition-morph',
    label: 'AI Transition Morph',
    workflowName: 'transition_morph',
    description: 'Generate a transition bridge between adjacent timeline clips.',
    promptSuffix: 'seamless morph transition, temporal bridge, consistent motion, no hard cut',
    negativePrompt: 'ghosting, duplicated faces, warped subject, flicker, abrupt jump cut',
    parameters: { steps: 24, cfg: 5, transition_strength: 0.65 },
    source: 'builtin',
    requiredNodeTypes: [],
  },
];

export function listComfyUIWorkflowPresets(project?: EditorProject): ComfyUIWorkflowPreset[] {
  const pluginPresets = project?.plugins.flatMap(readComfyUIWorkflowPresetsFromPlugin) ?? [];
  return [...COMFYUI_WORKFLOW_PRESETS, ...pluginPresets];
}

export function readComfyUIWorkflowPresetsFromPlugin(plugin: EditorPluginManifest): ComfyUIWorkflowPreset[] {
  if (!plugin.contributes.includes('workflow') || !plugin.permissions.includes('comfyui')) {
    return [];
  }

  return (plugin.comfyUIWorkflows ?? [])
    .map((preset) => normalizePluginWorkflowPreset(plugin, preset))
    .filter((preset): preset is ComfyUIWorkflowPreset => Boolean(preset));
}

export function resolveProjectDefaultComfyUIWorkflowName(project: EditorProject): string {
  return project.automation.find((rule) => rule.provider === 'comfyui' && rule.workflowName)?.workflowName
    ?? COMFYUI_WORKFLOW_PRESETS[0].workflowName;
}

export function findComfyUIWorkflowPreset(value?: string, project?: EditorProject): ComfyUIWorkflowPreset | undefined {
  if (!value) {
    return undefined;
  }

  return listComfyUIWorkflowPresets(project).find((preset) => (
    preset.id === value ||
    preset.workflowName === value ||
    (preset.pluginId !== undefined && preset.pluginPresetId === value)
  ));
}

export function resolveComfyUIWorkflowBinding(
  clip: TimelineClip,
  options: {
    defaultWorkflowName?: string;
    preferredPresetId?: string;
    promptFallback?: string;
    projectWidth?: number;
    projectHeight?: number;
    ruleParameters?: Record<string, string | number | boolean>;
    project?: EditorProject;
    workflowPresets?: ComfyUIWorkflowPreset[];
  } = {},
): ComfyUIWorkflowBinding {
  const generation = clip.generation;
  const presets = options.workflowPresets ?? listComfyUIWorkflowPresets(options.project);
  const preset = findWorkflowPresetFromList(presets, generation?.presetId)
    ?? findWorkflowPresetFromList(presets, options.preferredPresetId)
    ?? findWorkflowPresetFromList(presets, generation?.workflowName)
    ?? findWorkflowPresetFromList(presets, options.defaultWorkflowName)
    ?? COMFYUI_WORKFLOW_PRESETS[0];
  const workflowName = readText(generation?.workflowName)
    ?? (options.preferredPresetId ? preset.workflowName : undefined)
    ?? readText(options.defaultWorkflowName)
    ?? preset.workflowName;
  const prompt = readText(generation?.prompt)
    ?? readText(options.promptFallback)
    ?? `${clip.name}, ${preset.promptSuffix}`;
  const negativePrompt = readText(generation?.negativePrompt)
    ?? preset.negativePrompt;
  const seed = normalizeSeed(generation?.seed);

  return {
    preset,
    presetId: generation?.presetId ?? preset.id,
    workflowName,
    prompt,
    negativePrompt,
    seed,
    parameters: {
      ...preset.parameters,
      ...(options.projectWidth !== undefined ? { width: options.projectWidth } : {}),
      ...(options.projectHeight !== undefined ? { height: options.projectHeight } : {}),
      ...(options.ruleParameters ?? {}),
      ...(generation?.parameters ?? {}),
    },
    status: generation?.status ?? 'draft',
  };
}

export function applyComfyUIWorkflowPresetToClip(
  project: EditorProject,
  clipId: string,
  presetId: string,
): EditorProject {
  const preset = findComfyUIWorkflowPreset(presetId, project);
  if (!preset) {
    throw new Error(`ComfyUI workflow preset not found: ${presetId}`);
  }

  return updateClipComfyUIBinding(project, clipId, {
    presetId: preset.id,
    workflowName: preset.workflowName,
    negativePrompt: preset.negativePrompt,
    parameters: preset.parameters,
    replaceParameters: true,
    status: 'draft',
  });
}

export function updateClipComfyUIBinding(
  project: EditorProject,
  clipId: string,
  patch: ComfyUIWorkflowBindingPatch,
): EditorProject {
  let found = false;
  const defaultWorkflowName = resolveProjectDefaultComfyUIWorkflowName(project);

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      found = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot edit a locked track or clip.');
      }

      const current = resolveComfyUIWorkflowBinding(clip, {
        defaultWorkflowName,
        projectWidth: project.width,
        projectHeight: project.height,
      });
      const nextParameters = patch.parameters === undefined
        ? current.parameters
        : patch.replaceParameters
          ? { ...patch.parameters }
          : { ...current.parameters, ...patch.parameters };
      const nextGeneration: GenerationBinding = {
        provider: 'comfyui',
        presetId: patch.presetId ?? current.presetId,
        workflowName: readText(patch.workflowName) ?? current.workflowName,
        prompt: readText(patch.prompt) ?? current.prompt,
        negativePrompt: readText(patch.negativePrompt) ?? current.negativePrompt,
        seed: patch.seed === undefined ? current.seed : normalizeSeed(patch.seed),
        parameters: nextParameters,
        status: patch.status ?? 'draft',
      };

      return {
        ...clip,
        automationTags: clip.automationTags.includes('comfyui')
          ? clip.automationTags
          : [...clip.automationTags, 'comfyui'],
        generation: nextGeneration,
      };
    }),
  }));

  if (!found) {
    throw new Error('Clip not found.');
  }

  return {
    ...project,
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSeed(value?: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value!)) : 0;
}

function normalizePluginWorkflowPreset(
  plugin: EditorPluginManifest,
  preset: EditorPluginComfyUIWorkflowPreset,
): ComfyUIWorkflowPreset | undefined {
  const pluginPresetId = readText(preset.id);
  const workflowName = readText(preset.workflowName);
  const label = readText(preset.label);
  if (!pluginPresetId || !workflowName || !label) {
    return undefined;
  }

  return {
    id: `plugin:${plugin.id}:${pluginPresetId}`,
    label: `${plugin.name}: ${label}`,
    workflowName,
    description: readText(preset.description) ?? `ComfyUI workflow preset from ${plugin.name}.`,
    promptSuffix: readText(preset.promptSuffix) ?? label,
    negativePrompt: readText(preset.negativePrompt) ?? '',
    parameters: normalizeParameterRecord(preset.parameters),
    source: 'plugin',
    pluginId: plugin.id,
    pluginName: plugin.name,
    pluginPresetId,
    requiredNodeTypes: normalizeStringList(preset.requiredNodeTypes),
  };
}

function findWorkflowPresetFromList(
  presets: ComfyUIWorkflowPreset[],
  value?: string,
): ComfyUIWorkflowPreset | undefined {
  if (!value) {
    return undefined;
  }

  return presets.find((preset) => (
    preset.id === value ||
    preset.workflowName === value ||
    (preset.pluginId !== undefined && preset.pluginPresetId === value)
  ));
}

function normalizeParameterRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => {
    const parameter = entry[1];
    return typeof parameter === 'string' ||
      typeof parameter === 'boolean' ||
      (typeof parameter === 'number' && Number.isFinite(parameter));
  }));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(readText).filter((item): item is string => Boolean(item))));
}

function readText(value?: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : undefined;
}
