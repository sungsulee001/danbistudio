import { AI_ENHANCEMENT_PRESETS, type AiEnhancementPresetId } from '../../lib/editor/ai-effects';
import { AUDIO_CLEANUP_PRESETS, type AudioCleanupPresetId } from '../../lib/editor/audio-cleanup-effects';
import { CROP_MASK_PRESETS, type CropMaskPresetId } from '../../lib/editor/crop-mask';
import { STABILIZE_PRESETS, type StabilizePresetId } from '../../lib/editor/stabilize-effects';
import {
  COLOR_GRADING_PRESETS,
  type ColorGradingPresetId,
} from '../../lib/editor/timeline';
import type { ClipEffect, TimelineClip } from '../../lib/editor/types';
import { VISUAL_FILTER_PRESETS, type VisualFilterPresetId } from '../../lib/editor/visual-effects';
import { EffectParameterControls } from './inspector-controls';

interface InspectorEffectsPanelProps {
  clip: TimelineClip;
  canAddColorEffect: boolean;
  canApplyColorLut: boolean;
  canAddColorMatch: boolean;
  canApplyAiEnhancement: boolean;
  canApplyVisualFilter: boolean;
  canAddAudioGain: boolean;
  canApplyAudioCleanup: boolean;
  canApplyStabilize: boolean;
  canAddCropMask: boolean;
  canAddSmartReframe: boolean;
  canTrackSubject: boolean;
  canApplyObjectMask: boolean;
  canApplyCropPreset: boolean;
  canApplyColorPreset: boolean;
  onAddColorEffect: () => void;
  onRequestLutFile: () => void;
  onAddColorMatchEffect: () => void;
  onApplyAiEnhancementPreset: (presetId: AiEnhancementPresetId) => void;
  onApplyVisualFilterPreset: (presetId: VisualFilterPresetId) => void;
  onAddAudioGainEffect: () => void;
  onApplyAudioCleanupPreset: (presetId: AudioCleanupPresetId) => void;
  onApplyStabilizePreset: (presetId: StabilizePresetId) => void;
  onAddCropMaskEffect: () => void;
  onAddSmartReframeEffect: () => void;
  onTrackSubjectReframe: () => void;
  onApplyTrackedObjectMask: () => void;
  onApplyCropPreset: (presetId: CropMaskPresetId) => void;
  onApplyColorPreset: (presetId: ColorGradingPresetId) => void;
  onToggleClipEffect: (effectId: string) => void;
  onMoveClipEffect: (effectId: string, direction: 'up' | 'down') => void;
  onRemoveClipEffect: (effectId: string) => void;
  onEffectParameterChange: (effectId: string, key: string, value: string | number | boolean) => void;
}

export function InspectorEffectsPanel({
  clip,
  canAddColorEffect,
  canApplyColorLut,
  canAddColorMatch,
  canApplyAiEnhancement,
  canApplyVisualFilter,
  canAddAudioGain,
  canApplyAudioCleanup,
  canApplyStabilize,
  canAddCropMask,
  canAddSmartReframe,
  canTrackSubject,
  canApplyObjectMask,
  canApplyCropPreset,
  canApplyColorPreset,
  onAddColorEffect,
  onRequestLutFile,
  onAddColorMatchEffect,
  onApplyAiEnhancementPreset,
  onApplyVisualFilterPreset,
  onAddAudioGainEffect,
  onApplyAudioCleanupPreset,
  onApplyStabilizePreset,
  onAddCropMaskEffect,
  onAddSmartReframeEffect,
  onTrackSubjectReframe,
  onApplyTrackedObjectMask,
  onApplyCropPreset,
  onApplyColorPreset,
  onToggleClipEffect,
  onMoveClipEffect,
  onRemoveClipEffect,
  onEffectParameterChange,
}: InspectorEffectsPanelProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Effects</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <QuickEffectButton label="Color" disabled={!canAddColorEffect} onClick={onAddColorEffect} />
          <QuickEffectButton
            label="LUT"
            disabled={!canApplyColorLut}
            tone="teal"
            onClick={onRequestLutFile}
          />
          <QuickEffectButton label="Match" disabled={!canAddColorMatch} onClick={onAddColorMatchEffect} />
          <QuickEffectButton
            label="AI FX"
            disabled={!canApplyAiEnhancement}
            tone="fuchsia"
            onClick={() => onApplyAiEnhancementPreset('denoise-sharpen')}
          />
          <QuickEffectButton
            label="FX"
            disabled={!canApplyVisualFilter}
            tone="sky"
            onClick={() => onApplyVisualFilterPreset('blur-soft')}
          />
          <QuickEffectButton label="Gain" disabled={!canAddAudioGain} onClick={onAddAudioGainEffect} />
          <QuickEffectButton
            label="Clean"
            disabled={!canApplyAudioCleanup}
            tone="amber"
            onClick={() => onApplyAudioCleanupPreset('voice-clean')}
          />
          <QuickEffectButton
            label="Stabilize"
            disabled={!canApplyStabilize}
            tone="lime"
            onClick={() => onApplyStabilizePreset('standard-deshake')}
          />
          <QuickEffectButton label="Crop" disabled={!canAddCropMask} onClick={onAddCropMaskEffect} />
          <QuickEffectButton label="Reframe" disabled={!canAddSmartReframe} onClick={onAddSmartReframeEffect} />
          <QuickEffectButton
            label="Track"
            disabled={!canTrackSubject}
            tone="violet"
            onClick={onTrackSubjectReframe}
          />
          <QuickEffectButton
            label="Object"
            disabled={!canApplyObjectMask}
            tone="cyan"
            onClick={onApplyTrackedObjectMask}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {CROP_MASK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={!canApplyCropPreset}
            onClick={() => onApplyCropPreset(preset.id)}
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {COLOR_GRADING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={!canApplyColorPreset}
            onClick={() => onApplyColorPreset(preset.id)}
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {VISUAL_FILTER_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            label={preset.label}
            disabled={!canApplyVisualFilter}
            tone="sky"
            onClick={() => onApplyVisualFilterPreset(preset.id)}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AI_ENHANCEMENT_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            label={preset.label}
            disabled={!canApplyAiEnhancement}
            tone="fuchsia"
            onClick={() => onApplyAiEnhancementPreset(preset.id)}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {STABILIZE_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            label={preset.label}
            disabled={!canApplyStabilize}
            tone="lime"
            onClick={() => onApplyStabilizePreset(preset.id)}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AUDIO_CLEANUP_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            label={preset.label}
            disabled={!canApplyAudioCleanup}
            tone="amber"
            onClick={() => onApplyAudioCleanupPreset(preset.id)}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {clip.effects.length === 0 ? (
          <p className="text-sm text-zinc-500">No effects</p>
        ) : clip.effects.map((effect, effectIndex) => (
          <EffectStackItem
            key={effect.id}
            effect={effect}
            effectIndex={effectIndex}
            effectCount={clip.effects.length}
            onToggleClipEffect={onToggleClipEffect}
            onMoveClipEffect={onMoveClipEffect}
            onRemoveClipEffect={onRemoveClipEffect}
            onEffectParameterChange={onEffectParameterChange}
          />
        ))}
      </div>
    </div>
  );
}

function EffectStackItem({
  effect,
  effectIndex,
  effectCount,
  onToggleClipEffect,
  onMoveClipEffect,
  onRemoveClipEffect,
  onEffectParameterChange,
}: {
  effect: ClipEffect;
  effectIndex: number;
  effectCount: number;
  onToggleClipEffect: (effectId: string) => void;
  onMoveClipEffect: (effectId: string, direction: 'up' | 'down') => void;
  onRemoveClipEffect: (effectId: string) => void;
  onEffectParameterChange: (effectId: string, key: string, value: string | number | boolean) => void;
}) {
  const trackingQuality = buildEffectTrackingQualityView(effect);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleClipEffect(effect.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm"
        >
          <span className="truncate">{effect.label}</span>
          <span className={effect.enabled ? 'shrink-0 text-emerald-300' : 'shrink-0 text-zinc-500'}>
            {effect.enabled ? 'On' : 'Off'}
          </span>
        </button>
        <button
          type="button"
          disabled={effectIndex === 0}
          onClick={() => onMoveClipEffect(effect.id, 'up')}
          className="shrink-0 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Up
        </button>
        <button
          type="button"
          disabled={effectIndex === effectCount - 1}
          onClick={() => onMoveClipEffect(effect.id, 'down')}
          className="shrink-0 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Down
        </button>
        <button
          type="button"
          onClick={() => onRemoveClipEffect(effect.id)}
          className="shrink-0 rounded border border-zinc-800 px-2 py-1 text-[11px] text-rose-300 hover:border-rose-500"
        >
          Remove
        </button>
      </div>
      {trackingQuality ? (
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-[11px] ${trackingQuality.className}`}>
          <span>Tracking</span>
          <span>{trackingQuality.statusLabel} {trackingQuality.scorePercent}%</span>
          <span>jump {trackingQuality.maxJumpLabel}</span>
        </div>
      ) : null}
      <EffectParameterControls effect={effect} onChange={onEffectParameterChange} />
    </div>
  );
}

export interface EffectTrackingQualityView {
  status: 'stable' | 'review';
  statusLabel: string;
  scorePercent: number;
  maxJumpLabel: string;
  className: string;
}

export function buildEffectTrackingQualityView(effect: ClipEffect): EffectTrackingQualityView | null {
  if (effect.parameters.trackingEnabled !== true) {
    return null;
  }

  const score = readNumber(effect.parameters.trackingQualityScore);
  const maxJump = readNumber(effect.parameters.trackingMaxJump) ?? 0;
  if (score === undefined) {
    return null;
  }

  const needsReview = effect.parameters.trackingNeedsReview === true || score < 0.7 || maxJump > 0.35;
  return {
    status: needsReview ? 'review' : 'stable',
    statusLabel: needsReview ? 'Review' : 'Stable',
    scorePercent: Math.round(clampNumber(score, 0, 1) * 100),
    maxJumpLabel: maxJump.toFixed(3),
    className: needsReview
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  };
}

function QuickEffectButton({
  label,
  disabled,
  tone = 'zinc',
  onClick,
}: {
  label: string;
  disabled: boolean;
  tone?: 'zinc' | 'teal' | 'fuchsia' | 'sky' | 'amber' | 'lime' | 'violet' | 'cyan';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${quickEffectToneClass(tone)}`}
    >
      {label}
    </button>
  );
}

function PresetButton({
  label,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  disabled: boolean;
  tone: 'sky' | 'fuchsia' | 'lime' | 'amber';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded border px-2 py-2 text-[11px] leading-tight disabled:cursor-not-allowed disabled:opacity-40 ${presetToneClass(tone)}`}
    >
      {label}
    </button>
  );
}

function quickEffectToneClass(tone: 'zinc' | 'teal' | 'fuchsia' | 'sky' | 'amber' | 'lime' | 'violet' | 'cyan'): string {
  switch (tone) {
    case 'teal':
      return 'border-teal-500/40 bg-teal-500/10 text-teal-100 hover:border-teal-300';
    case 'fuchsia':
      return 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-300';
    case 'sky':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-100 hover:border-sky-300';
    case 'amber':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:border-amber-300';
    case 'lime':
      return 'border-lime-500/40 bg-lime-500/10 text-lime-100 hover:border-lime-300';
    case 'violet':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-100 hover:border-violet-300';
    case 'cyan':
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300';
    case 'zinc':
    default:
      return 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-emerald-500';
  }
}

function presetToneClass(tone: 'sky' | 'fuchsia' | 'lime' | 'amber'): string {
  switch (tone) {
    case 'fuchsia':
      return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-300';
    case 'lime':
      return 'border-lime-500/30 bg-lime-500/10 text-lime-100 hover:border-lime-300';
    case 'amber':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100 hover:border-amber-300';
    case 'sky':
    default:
      return 'border-sky-500/30 bg-sky-500/10 text-sky-100 hover:border-sky-300';
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
