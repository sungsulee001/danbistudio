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
  testIdPrefix?: string;
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
  testIdPrefix = 'inspector-effects',
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
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid={`${testIdPrefix}-panel`}
      data-clip-id={clip.id}
      data-clip-kind={clip.kind}
      data-effect-count={clip.effects.length}
      data-can-add-color-effect={canAddColorEffect ? 'true' : 'false'}
      data-can-apply-color-lut={canApplyColorLut ? 'true' : 'false'}
      data-can-add-color-match={canAddColorMatch ? 'true' : 'false'}
      data-can-apply-ai-enhancement={canApplyAiEnhancement ? 'true' : 'false'}
      data-can-apply-visual-filter={canApplyVisualFilter ? 'true' : 'false'}
      data-can-add-audio-gain={canAddAudioGain ? 'true' : 'false'}
      data-can-apply-audio-cleanup={canApplyAudioCleanup ? 'true' : 'false'}
      data-can-apply-stabilize={canApplyStabilize ? 'true' : 'false'}
      data-can-add-crop-mask={canAddCropMask ? 'true' : 'false'}
      data-can-add-smart-reframe={canAddSmartReframe ? 'true' : 'false'}
      data-can-track-subject={canTrackSubject ? 'true' : 'false'}
      data-can-apply-object-mask={canApplyObjectMask ? 'true' : 'false'}
      data-can-apply-crop-preset={canApplyCropPreset ? 'true' : 'false'}
      data-can-apply-color-preset={canApplyColorPreset ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Effects</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <QuickEffectButton actionId="color" testIdPrefix={testIdPrefix} label="Color" disabled={!canAddColorEffect} onClick={onAddColorEffect} />
          <QuickEffectButton
            actionId="lut"
            testIdPrefix={testIdPrefix}
            label="LUT"
            disabled={!canApplyColorLut}
            tone="teal"
            onClick={onRequestLutFile}
          />
          <QuickEffectButton actionId="match" testIdPrefix={testIdPrefix} label="Match" disabled={!canAddColorMatch} onClick={onAddColorMatchEffect} />
          <QuickEffectButton
            actionId="ai-fx"
            testIdPrefix={testIdPrefix}
            label="AI FX"
            disabled={!canApplyAiEnhancement}
            tone="fuchsia"
            onClick={() => onApplyAiEnhancementPreset('denoise-sharpen')}
          />
          <QuickEffectButton
            actionId="visual-fx"
            testIdPrefix={testIdPrefix}
            label="FX"
            disabled={!canApplyVisualFilter}
            tone="sky"
            onClick={() => onApplyVisualFilterPreset('blur-soft')}
          />
          <QuickEffectButton actionId="gain" testIdPrefix={testIdPrefix} label="Gain" disabled={!canAddAudioGain} onClick={onAddAudioGainEffect} />
          <QuickEffectButton
            actionId="clean"
            testIdPrefix={testIdPrefix}
            label="Clean"
            disabled={!canApplyAudioCleanup}
            tone="amber"
            onClick={() => onApplyAudioCleanupPreset('voice-clean')}
          />
          <QuickEffectButton
            actionId="stabilize"
            testIdPrefix={testIdPrefix}
            label="Stabilize"
            disabled={!canApplyStabilize}
            tone="lime"
            onClick={() => onApplyStabilizePreset('standard-deshake')}
          />
          <QuickEffectButton actionId="crop" testIdPrefix={testIdPrefix} label="Crop" disabled={!canAddCropMask} onClick={onAddCropMaskEffect} />
          <QuickEffectButton actionId="reframe" testIdPrefix={testIdPrefix} label="Reframe" disabled={!canAddSmartReframe} onClick={onAddSmartReframeEffect} />
          <QuickEffectButton
            actionId="track"
            testIdPrefix={testIdPrefix}
            label="Track"
            disabled={!canTrackSubject}
            tone="violet"
            onClick={onTrackSubjectReframe}
          />
          <QuickEffectButton
            actionId="object"
            testIdPrefix={testIdPrefix}
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
            data-testid={`${testIdPrefix}-crop-preset-${preset.id}`}
            data-effect-preset-id={preset.id}
            disabled={!canApplyCropPreset}
            onClick={() => onApplyCropPreset(preset.id)}
            className="rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-700 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
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
            data-testid={`${testIdPrefix}-color-preset-${preset.id}`}
            data-effect-preset-id={preset.id}
            disabled={!canApplyColorPreset}
            onClick={() => onApplyColorPreset(preset.id)}
            className="rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-700 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {VISUAL_FILTER_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            testId={`${testIdPrefix}-visual-preset-${preset.id}`}
            presetId={preset.id}
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
            testId={`${testIdPrefix}-ai-preset-${preset.id}`}
            presetId={preset.id}
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
            testId={`${testIdPrefix}-stabilize-preset-${preset.id}`}
            presetId={preset.id}
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
            testId={`${testIdPrefix}-audio-cleanup-preset-${preset.id}`}
            presetId={preset.id}
            label={preset.label}
            disabled={!canApplyAudioCleanup}
            tone="amber"
            onClick={() => onApplyAudioCleanupPreset(preset.id)}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {clip.effects.length === 0 ? (
          <p className="text-sm text-ds-600">No effects</p>
        ) : clip.effects.map((effect, effectIndex) => (
          <EffectStackItem
            key={effect.id}
            effect={effect}
            effectIndex={effectIndex}
            effectCount={clip.effects.length}
            testIdPrefix={testIdPrefix}
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
  testIdPrefix,
  onToggleClipEffect,
  onMoveClipEffect,
  onRemoveClipEffect,
  onEffectParameterChange,
}: {
  effect: ClipEffect;
  effectIndex: number;
  effectCount: number;
  testIdPrefix: string;
  onToggleClipEffect: (effectId: string) => void;
  onMoveClipEffect: (effectId: string, direction: 'up' | 'down') => void;
  onRemoveClipEffect: (effectId: string) => void;
  onEffectParameterChange: (effectId: string, key: string, value: string | number | boolean) => void;
}) {
  const trackingQuality = buildEffectTrackingQualityView(effect);

  return (
    <div
      className="rounded-md border border-ds-200 bg-paper p-3"
      data-testid={`${testIdPrefix}-stack-item-${effect.id}`}
      data-effect-id={effect.id}
      data-effect-type={effect.type}
      data-effect-enabled={effect.enabled ? 'true' : 'false'}
      data-effect-index={effectIndex}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`${testIdPrefix}-stack-toggle-${effect.id}`}
          onClick={() => onToggleClipEffect(effect.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm"
        >
          <span className="truncate">{effect.label}</span>
          <span className={effect.enabled ? 'shrink-0 text-accent-700' : 'shrink-0 text-ds-600'}>
            {effect.enabled ? 'On' : 'Off'}
          </span>
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-stack-move-up-${effect.id}`}
          disabled={effectIndex === 0}
          onClick={() => onMoveClipEffect(effect.id, 'up')}
          className="shrink-0 rounded border border-ds-200 px-2 py-1 text-meta text-ds-700 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Up
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-stack-move-down-${effect.id}`}
          disabled={effectIndex === effectCount - 1}
          onClick={() => onMoveClipEffect(effect.id, 'down')}
          className="shrink-0 rounded border border-ds-200 px-2 py-1 text-meta text-ds-700 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Down
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-stack-remove-${effect.id}`}
          onClick={() => onRemoveClipEffect(effect.id)}
          className="shrink-0 rounded border border-ds-200 px-2 py-1 text-meta text-danger-700 hover:border-danger-500"
        >
          Remove
        </button>
      </div>
      {trackingQuality ? (
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-meta ${trackingQuality.className}`}>
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
      ? 'border-warn-500/30 bg-warn-500/10 text-warn-900'
      : 'border-accent-500/30 bg-accent-500/10 text-accent-900',
  };
}

function QuickEffectButton({
  actionId,
  testIdPrefix,
  label,
  disabled,
  tone = 'zinc',
  onClick,
}: {
  actionId: string;
  testIdPrefix: string;
  label: string;
  disabled: boolean;
  tone?: 'zinc' | 'teal' | 'fuchsia' | 'sky' | 'amber' | 'lime' | 'violet' | 'cyan';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`${testIdPrefix}-quick-${actionId}`}
      data-effect-action={actionId}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2 py-1 text-meta disabled:cursor-not-allowed disabled:opacity-40 ${quickEffectToneClass(tone)}`}
    >
      {label}
    </button>
  );
}

function PresetButton({
  testId,
  presetId,
  label,
  disabled,
  tone,
  onClick,
}: {
  testId: string;
  presetId: string;
  label: string;
  disabled: boolean;
  tone: 'sky' | 'fuchsia' | 'lime' | 'amber';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-effect-preset-id={presetId}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded border px-2 py-2 text-meta leading-tight disabled:cursor-not-allowed disabled:opacity-40 ${presetToneClass(tone)}`}
    >
      {label}
    </button>
  );
}

function quickEffectToneClass(tone: 'zinc' | 'teal' | 'fuchsia' | 'sky' | 'amber' | 'lime' | 'violet' | 'cyan'): string {
  switch (tone) {
    case 'teal':
      return 'border-accent-500/40 bg-accent-500/10 text-accent-900 hover:border-accent-700';
    case 'fuchsia':
      return 'border-accent2-500/40 bg-accent2-500/10 text-accent2-900 hover:border-accent2-700';
    case 'sky':
      return 'border-info-500/40 bg-info-500/10 text-info-900 hover:border-info-700';
    case 'amber':
      return 'border-warn-500/40 bg-warn-500/10 text-warn-900 hover:border-warn-700';
    case 'lime':
      return 'border-accent-500/40 bg-accent-500/10 text-accent-900 hover:border-accent-700';
    case 'violet':
      return 'border-accent2-500/40 bg-accent2-500/10 text-accent2-900 hover:border-accent2-700';
    case 'cyan':
      return 'border-info-500/40 bg-info-500/10 text-info-900 hover:border-info-700';
    case 'zinc':
    default:
      return 'border-ds-200 bg-paper text-ds-700 hover:border-accent-500';
  }
}

function presetToneClass(tone: 'sky' | 'fuchsia' | 'lime' | 'amber'): string {
  switch (tone) {
    case 'fuchsia':
      return 'border-accent2-500/30 bg-accent2-500/10 text-accent2-900 hover:border-accent2-700';
    case 'lime':
      return 'border-accent-500/30 bg-accent-500/10 text-accent-900 hover:border-accent-700';
    case 'amber':
      return 'border-warn-500/30 bg-warn-500/10 text-warn-900 hover:border-warn-700';
    case 'sky':
    default:
      return 'border-info-500/30 bg-info-500/10 text-info-900 hover:border-info-700';
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
