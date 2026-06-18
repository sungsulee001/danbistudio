import type { ClipEffect, ClipKeyframe, TimelineClip, TimelineTransition } from '../../lib/editor/types';
import {
  MOTION_PRESETS,
  type MotionPresetId,
  type updateClipKeyframe,
  type updateClipTransition,
} from '../../lib/editor/timeline';
import type { ClipMotionTransform } from '../../lib/editor/motion-transform';
import { KEYFRAME_PROPERTIES, type KeyframeDraft } from './editor-view-model';
import { NumberField, ToggleButton } from './editor-form-controls';

type TransitionPatch = Parameters<typeof updateClipTransition>[2];
type KeyframePatch = Parameters<typeof updateClipKeyframe>[3];
type InspectorTransitionType = Exclude<TimelineTransition['type'], 'cut' | 'match-cut'>;
type FormatTimecode = (seconds: number, fps: number) => string;

interface InspectorMotionPanelProps {
  motionEffect?: ClipEffect;
  motionTransform: ClipMotionTransform;
  canApplyMotionPreset: boolean;
  canUseMotion: boolean;
  onMotionTransformPatch: (patch: Partial<ClipMotionTransform>) => void;
  onApplyMotionPreset: (presetId: MotionPresetId) => void;
  onResetMotionTransform: () => void;
}

interface InspectorTransitionPanelProps {
  clip: TimelineClip;
  fps: number;
  onApplyTransition: (type: InspectorTransitionType) => void;
  onTransitionPatch: (patch: TransitionPatch) => void;
  onRemoveTransition: () => void;
}

interface InspectorKeyframesPanelProps {
  clip: TimelineClip;
  fps: number;
  localTime: number;
  keyframes: ClipKeyframe[];
  keyframeDraft: KeyframeDraft;
  onKeyframeDraftPropertyChange: (property: ClipKeyframe['property']) => void;
  onKeyframeDraftChange: (patch: Partial<KeyframeDraft>) => void;
  onAddKeyframeAtPlayhead: () => void;
  onKeyframePatch: (keyframeId: string, patch: KeyframePatch) => void;
  onDeleteKeyframe: (keyframeId: string) => void;
  formatTimecode: FormatTimecode;
}

export function InspectorMotionPanel({
  motionEffect,
  motionTransform,
  canApplyMotionPreset,
  canUseMotion,
  onMotionTransformPatch,
  onApplyMotionPreset,
  onResetMotionTransform,
}: InspectorMotionPanelProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Motion</h2>
        <span className="text-[11px] text-zinc-500">
          {motionEffect?.enabled ? 'active' : motionEffect ? 'disabled' : 'default'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumberField
          label="Position X"
          value={motionTransform.positionX}
          step={1}
          min={-200}
          max={200}
          onChange={(value) => onMotionTransformPatch({ positionX: value })}
        />
        <NumberField
          label="Position Y"
          value={motionTransform.positionY}
          step={1}
          min={-200}
          max={200}
          onChange={(value) => onMotionTransformPatch({ positionY: value })}
        />
        <NumberField
          label="Scale"
          value={motionTransform.scale}
          step={0.05}
          min={0.05}
          max={8}
          onChange={(value) => onMotionTransformPatch({ scale: value })}
        />
        <NumberField
          label="Rotation"
          value={motionTransform.rotation}
          step={1}
          min={-360}
          max={360}
          onChange={(value) => onMotionTransformPatch({ rotation: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {MOTION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={!canApplyMotionPreset}
            onClick={() => onApplyMotionPreset(preset.id)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!canUseMotion}
        onClick={onResetMotionTransform}
        className="mt-3 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reset motion
      </button>
    </div>
  );
}

export function InspectorTransitionPanel({
  clip,
  fps,
  onApplyTransition,
  onTransitionPatch,
  onRemoveTransition,
}: InspectorTransitionPanelProps) {
  const transition = clip.transitionOut;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Transition Out</h2>
        <span className="text-[11px] text-zinc-500">
          {transition ? transitionTypeLabel(transition.type) : 'cut'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-5">
        {(['crossfade', 'dip', 'push', 'wipe', 'ai-morph'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onApplyTransition(type)}
            className={`rounded border px-2 py-2 text-xs ${
              transition?.type === type
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-100'
                : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-emerald-500'
            }`}
          >
            {transitionTypeLabel(type)}
          </button>
        ))}
      </div>
      {transition ? (
        <div className="mt-3 space-y-3">
          <NumberField
            label="Duration"
            value={transition.duration}
            step={1 / fps}
            min={0.05}
            max={clip.duration}
            onChange={(value) => onTransitionPatch({ duration: value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-zinc-500">
              Easing
              <select
                value={transition.easing}
                onChange={(event) => onTransitionPatch({ easing: event.target.value as TimelineTransition['easing'] })}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              >
                <option value="linear">Linear</option>
                <option value="easeIn">Ease in</option>
                <option value="easeOut">Ease out</option>
                <option value="easeInOut">Ease in/out</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Direction
              <select
                value={readTransitionDirection(transition)}
                disabled={transition.type !== 'push' && transition.type !== 'wipe'}
                onChange={(event) => onTransitionPatch({ parameters: { direction: event.target.value } })}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-40"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
          </div>
          <ToggleButton
            label="Audio transition"
            active={transition.parameters.preserveAudio !== false}
            onClick={() => onTransitionPatch({
              parameters: {
                preserveAudio: transition.parameters.preserveAudio === false,
              },
            })}
          />
          <button
            type="button"
            onClick={onRemoveTransition}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-rose-200 hover:border-rose-500"
          >
            Remove transition
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-500">
          Select FFmpeg xfade transitions or AI Morph for a ComfyUI transition draft between adjacent clips.
        </div>
      )}
    </div>
  );
}

export function InspectorKeyframesPanel({
  clip,
  fps,
  localTime,
  keyframes,
  keyframeDraft,
  onKeyframeDraftPropertyChange,
  onKeyframeDraftChange,
  onAddKeyframeAtPlayhead,
  onKeyframePatch,
  onDeleteKeyframe,
  formatTimecode,
}: InspectorKeyframesPanelProps) {
  const draftBounds = keyframeValueBounds(keyframeDraft.property);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Keyframes</h2>
        <span className="text-[11px] text-zinc-500">
          {formatTimecode(localTime, fps)} / {keyframes.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block text-xs text-zinc-500">
          Property
          <select
            value={keyframeDraft.property}
            onChange={(event) => onKeyframeDraftPropertyChange(event.target.value as ClipKeyframe['property'])}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            {KEYFRAME_PROPERTIES.map((property) => (
              <option key={property} value={property}>
                {keyframePropertyLabel(property)}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Value"
          value={keyframeDraft.value}
          step={draftBounds.step}
          min={draftBounds.min}
          max={draftBounds.max}
          onChange={(value) => onKeyframeDraftChange({ value })}
        />
        <label className="block text-xs text-zinc-500">
          Easing
          <select
            value={keyframeDraft.easing}
            onChange={(event) => onKeyframeDraftChange({ easing: event.target.value as ClipKeyframe['easing'] })}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="hold">Hold</option>
            <option value="linear">Linear</option>
            <option value="easeIn">Ease in</option>
            <option value="easeOut">Ease out</option>
            <option value="easeInOut">Ease in/out</option>
            <option value="smooth">Smooth</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={onAddKeyframeAtPlayhead}
        className="mt-3 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500"
      >
        Add at playhead
      </button>
      <div className="mt-3 space-y-2">
        {keyframes.length > 0 ? (
          keyframes.map((keyframe) => {
            const bounds = keyframeValueBounds(keyframe.property);
            return (
              <div key={keyframe.id} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-200">{keyframePropertyLabel(keyframe.property)}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteKeyframe(keyframe.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="Time"
                    value={keyframe.time}
                    step={1 / fps}
                    min={0}
                    max={clip.duration}
                    onChange={(value) => onKeyframePatch(keyframe.id, { time: value })}
                  />
                  <NumberField
                    label="Value"
                    value={keyframeNumericValue(keyframe, clip)}
                    step={bounds.step}
                    min={bounds.min}
                    max={bounds.max}
                    onChange={(value) => onKeyframePatch(keyframe.id, { value })}
                  />
                  <label className="block text-xs text-zinc-500">
                    Easing
                    <select
                      value={keyframe.easing}
                      onChange={(event) => onKeyframePatch(keyframe.id, { easing: event.target.value as ClipKeyframe['easing'] })}
                      className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
                    >
                      <option value="hold">Hold</option>
                      <option value="linear">Linear</option>
                      <option value="easeIn">Ease in</option>
                      <option value="easeOut">Ease out</option>
                      <option value="easeInOut">Ease in/out</option>
                      <option value="smooth">Smooth</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-500">
            No keyframes
          </div>
        )}
      </div>
    </div>
  );
}

export function defaultKeyframeValue(property: ClipKeyframe['property'], clip?: TimelineClip): number {
  switch (property) {
    case 'opacity':
      return clip?.opacity ?? 1;
    case 'volume':
      return clip?.volume ?? 1;
    case 'scale':
      return 1;
    case 'positionX':
    case 'positionY':
    case 'rotation':
    default:
      return 0;
  }
}

export function transitionTypeLabel(type: TimelineTransition['type']): string {
  switch (type) {
    case 'crossfade':
      return 'Crossfade';
    case 'dip':
      return 'Dip';
    case 'push':
      return 'Push';
    case 'wipe':
      return 'Wipe';
    case 'match-cut':
      return 'Match cut';
    case 'ai-morph':
      return 'AI morph';
    default:
      return 'Cut';
  }
}

function keyframePropertyLabel(property: ClipKeyframe['property']): string {
  switch (property) {
    case 'positionX':
      return 'Position X';
    case 'positionY':
      return 'Position Y';
    case 'scale':
      return 'Scale';
    case 'rotation':
      return 'Rotation';
    case 'opacity':
      return 'Opacity';
    case 'volume':
      return 'Volume';
    default:
      return property;
  }
}

function keyframeValueBounds(property: ClipKeyframe['property']): { min: number; max: number; step: number } {
  switch (property) {
    case 'positionX':
    case 'positionY':
      return { min: -200, max: 200, step: 1 };
    case 'scale':
      return { min: 0.05, max: 8, step: 0.05 };
    case 'rotation':
      return { min: -360, max: 360, step: 1 };
    case 'opacity':
      return { min: 0, max: 1, step: 0.05 };
    case 'volume':
      return { min: 0, max: 2, step: 0.05 };
    default:
      return { min: -9999, max: 9999, step: 1 };
  }
}

function keyframeNumericValue(keyframe: ClipKeyframe, clip: TimelineClip): number {
  return typeof keyframe.value === 'number' && Number.isFinite(keyframe.value)
    ? keyframe.value
    : defaultKeyframeValue(keyframe.property, clip);
}

function readTransitionDirection(transition: TimelineTransition): 'left' | 'right' | 'up' | 'down' {
  const value = transition.parameters.direction;
  return value === 'right' || value === 'up' || value === 'down' ? value : 'left';
}
