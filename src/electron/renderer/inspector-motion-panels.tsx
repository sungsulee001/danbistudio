import type { ClipEffect, ClipKeyframe, TimelineClip, TimelineTransition } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import {
  MOTION_PRESETS,
  type MotionPresetId,
  type updateClipKeyframe,
  type updateClipTransition,
} from '../../lib/editor/timeline';
import type { ClipMotionTransform } from '../../lib/editor/motion-transform';
import { KEYFRAME_PROPERTIES, type KeyframeDraft } from './editor-view-model';
import { NumberField, ToggleButton } from './editor-form-controls';
import { useMenuLanguage } from './use-menu-language';

type TransitionPatch = Parameters<typeof updateClipTransition>[2];
type KeyframePatch = Parameters<typeof updateClipKeyframe>[3];
type InspectorTransitionType = Exclude<TimelineTransition['type'], 'cut' | 'match-cut'>;
type FormatTimecode = (seconds: number, fps: number) => string;

const inspectorMotionText: Record<DanbiMenuLanguage, {
  addAtPlayhead: string;
  audioTransition: string;
  center: string;
  defaultState: string;
  delete: string;
  direction: string;
  duration: string;
  easing: string;
  keyframes: string;
  motionPresets: string;
  noKeyframes: string;
  positionX: string;
  positionY: string;
  property: string;
  removeTransition: string;
  reset: string;
  rotation: string;
  scale: string;
  time: string;
  transform: string;
  transitionHelp: string;
  transitionOut: string;
  value: string;
  state: Record<'active' | 'disabled' | 'default', string>;
  easingOptions: Record<ClipKeyframe['easing'], string>;
  directions: Record<'left' | 'right' | 'up' | 'down', string>;
}> = {
  en: {
    addAtPlayhead: 'Add at playhead',
    audioTransition: 'Audio transition',
    center: 'Center',
    defaultState: 'default',
    delete: 'Delete',
    direction: 'Direction',
    duration: 'Duration',
    easing: 'Easing',
    keyframes: 'Keyframes',
    motionPresets: 'Motion presets',
    noKeyframes: 'No keyframes',
    positionX: 'Position X',
    positionY: 'Position Y',
    property: 'Property',
    removeTransition: 'Remove transition',
    reset: 'Reset',
    rotation: 'Rotation',
    scale: 'Scale',
    time: 'Time',
    transform: 'Transform',
    transitionHelp: 'Select FFmpeg xfade transitions or AI Morph for a ComfyUI transition draft between adjacent clips.',
    transitionOut: 'Transition Out',
    value: 'Value',
    state: { active: 'active', disabled: 'disabled', default: 'default' },
    easingOptions: {
      hold: 'Hold',
      linear: 'Linear',
      easeIn: 'Ease in',
      easeOut: 'Ease out',
      easeInOut: 'Ease in/out',
      smooth: 'Smooth',
    },
    directions: { left: 'Left', right: 'Right', up: 'Up', down: 'Down' },
  },
  ko: {
    addAtPlayhead: '재생헤드에 추가',
    audioTransition: '오디오 전환',
    center: '중앙',
    defaultState: '기본',
    delete: '삭제',
    direction: '방향',
    duration: '길이',
    easing: '이징',
    keyframes: '키프레임',
    motionPresets: '모션 프리셋',
    noKeyframes: '키프레임 없음',
    positionX: '위치 X',
    positionY: '위치 Y',
    property: '속성',
    removeTransition: '전환 제거',
    reset: '초기화',
    rotation: '회전',
    scale: '확대',
    time: '시간',
    transform: '변형',
    transitionHelp: '인접 클립 사이에 FFmpeg xfade 전환 또는 ComfyUI AI Morph 전환 초안을 선택하세요.',
    transitionOut: '나가는 전환',
    value: '값',
    state: { active: '활성', disabled: '비활성', default: '기본' },
    easingOptions: {
      hold: '고정',
      linear: '선형',
      easeIn: '천천히 시작',
      easeOut: '천천히 끝',
      easeInOut: '천천히 시작/끝',
      smooth: '부드럽게',
    },
    directions: { left: '왼쪽', right: '오른쪽', up: '위', down: '아래' },
  },
};

interface InspectorMotionPanelProps {
  motionEffect?: ClipEffect;
  motionTransform: ClipMotionTransform;
  canApplyMotionPreset: boolean;
  canUseMotion: boolean;
  testIdPrefix?: string;
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
  testIdPrefix = 'inspector-transform',
  onMotionTransformPatch,
  onApplyMotionPreset,
  onResetMotionTransform,
}: InspectorMotionPanelProps) {
  const language = useMenuLanguage();
  const text = inspectorMotionText[language];
  const scalePercent = Math.round(motionTransform.scale * 1000) / 10;
  const motionEffectState = motionEffect?.enabled ? 'active' : motionEffect ? 'disabled' : 'default';

  return (
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid={`${testIdPrefix}-panel`}
      data-can-use-motion={canUseMotion ? 'true' : 'false'}
      data-can-apply-motion-preset={canApplyMotionPreset ? 'true' : 'false'}
      data-motion-effect-state={motionEffectState}
      data-motion-scale-percent={scalePercent}
      data-motion-position-x={motionTransform.positionX}
      data-motion-position-y={motionTransform.positionY}
      data-motion-rotation={motionTransform.rotation}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-info-700">{text.transform}</h2>
        <span className="text-meta text-ds-600" data-testid={`${testIdPrefix}-state`}>
          {text.state[motionEffectState]}
        </span>
      </div>
      <div className="mt-3 space-y-4">
        <InspectorMotionSlider
          label={text.scale}
          value={scalePercent}
          min={5}
          max={800}
          step={1}
          suffix="%"
          disabled={!canUseMotion}
          testId={`${testIdPrefix}-scale-percent`}
          onChange={(value) => onMotionTransformPatch({ scale: value / 100 })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={text.positionX}
            value={motionTransform.positionX}
            step={1}
            min={-200}
            max={200}
            disabled={!canUseMotion}
            testId={`${testIdPrefix}-position-x`}
            onChange={(value) => onMotionTransformPatch({ positionX: value })}
          />
          <NumberField
            label={text.positionY}
            value={motionTransform.positionY}
            step={1}
            min={-200}
            max={200}
            disabled={!canUseMotion}
            testId={`${testIdPrefix}-position-y`}
            onChange={(value) => onMotionTransformPatch({ positionY: value })}
          />
        </div>
        <InspectorMotionSlider
          label={text.rotation}
          value={motionTransform.rotation}
          min={-360}
          max={360}
          step={1}
          suffix="deg"
          disabled={!canUseMotion}
          testId={`${testIdPrefix}-rotation`}
          onChange={(value) => onMotionTransformPatch({ rotation: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          data-testid={`${testIdPrefix}-center`}
          disabled={!canUseMotion}
          onClick={() => onMotionTransformPatch({ positionX: 0, positionY: 0 })}
          className="rounded-md border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.center}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-scale-100`}
          disabled={!canUseMotion}
          onClick={() => onMotionTransformPatch({ scale: 1 })}
          className="rounded-md border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          100%
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-reset`}
          disabled={!canUseMotion}
          onClick={onResetMotionTransform}
          className="rounded-md border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.reset}
        </button>
      </div>
      <details
        className="mt-3 rounded border border-ds-200 bg-paper/70"
        data-testid={`${testIdPrefix}-preset-panel`}
        data-can-apply-motion-preset={canApplyMotionPreset ? 'true' : 'false'}
      >
        <summary className="cursor-pointer list-none px-2 py-2 text-kicker font-heading font-semibold uppercase text-ds-600">
          {text.motionPresets}
        </summary>
        <div className="grid grid-cols-3 gap-2 border-t border-ds-200 p-2">
          {MOTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`${testIdPrefix}-preset-${preset.id}`}
              data-motion-preset-id={preset.id}
              disabled={!canApplyMotionPreset}
              onClick={() => onApplyMotionPreset(preset.id)}
              className="rounded-md border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function InspectorMotionSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled: boolean;
  testId: string;
  onChange: (value: number) => void;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const handleValueChange = (nextValue: number) => {
    if (Number.isFinite(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs text-ds-600">{label}</span>
        <label className="flex items-center gap-1 rounded bg-paper px-2 py-1 text-xs text-ds-700">
          <input
            type="number"
            value={Number(safeValue.toFixed(2))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            data-testid={testId}
            onChange={(event) => handleValueChange(Number(event.currentTarget.value))}
            className="w-16 bg-transparent text-right text-ink outline-none disabled:opacity-40"
          />
          <span className="text-ds-600">{suffix}</span>
        </label>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, safeValue))}
        disabled={disabled}
        aria-label={`${label} transform`}
        onInput={(event) => handleValueChange(Number(event.currentTarget.value))}
        onChange={(event) => handleValueChange(Number(event.currentTarget.value))}
        className="w-full"
      />
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
  const language = useMenuLanguage();
  const text = inspectorMotionText[language];
  const transition = clip.transitionOut;
  const transitionType = transition?.type ?? 'cut';
  const directionEditable = transition?.type === 'push' || transition?.type === 'wipe';

  return (
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid="inspector-transition-panel"
      data-transition-state={transition ? 'active' : 'cut'}
      data-transition-type={transitionType}
      data-can-remove-transition={transition ? 'true' : 'false'}
      data-can-edit-direction={directionEditable ? 'true' : 'false'}
      data-transition-duration={transition?.duration ?? 0}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.transitionOut}</h2>
        <span className="text-meta text-ds-600" data-testid="inspector-transition-state">
          {transitionTypeLabel(transitionType, language)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-5">
        {(['crossfade', 'dip', 'push', 'wipe', 'ai-morph'] as const).map((type) => (
          <button
            key={type}
            type="button"
            data-testid={`inspector-transition-button-${type}`}
            data-transition-type={type}
            aria-pressed={transition?.type === type ? 'true' : 'false'}
            onClick={() => onApplyTransition(type)}
            className={`rounded border px-2 py-2 text-xs ${
              transition?.type === type
                ? 'border-accent-500 bg-accent-500/10 text-accent-900'
                : 'border-ds-200 bg-paper text-ds-700 hover:border-accent-500'
            }`}
          >
            {transitionTypeLabel(type, language)}
          </button>
        ))}
      </div>
      {transition ? (
        <div className="mt-3 space-y-3">
          <NumberField
            label={text.duration}
            value={transition.duration}
            step={1 / fps}
            min={0.05}
            max={clip.duration}
            onChange={(value) => onTransitionPatch({ duration: value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ds-600">
              {text.easing}
              <select
                value={transition.easing}
                onChange={(event) => onTransitionPatch({ easing: event.target.value as TimelineTransition['easing'] })}
                className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
              >
                <option value="linear">{text.easingOptions.linear}</option>
                <option value="easeIn">{text.easingOptions.easeIn}</option>
                <option value="easeOut">{text.easingOptions.easeOut}</option>
                <option value="easeInOut">{text.easingOptions.easeInOut}</option>
              </select>
            </label>
            <label className="block text-xs text-ds-600">
              {text.direction}
              <select
                data-testid="inspector-transition-direction"
                value={readTransitionDirection(transition)}
                disabled={!directionEditable}
                onChange={(event) => onTransitionPatch({ parameters: { direction: event.target.value } })}
                className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500 disabled:opacity-40"
              >
                <option value="left">{text.directions.left}</option>
                <option value="right">{text.directions.right}</option>
                <option value="up">{text.directions.up}</option>
                <option value="down">{text.directions.down}</option>
              </select>
            </label>
          </div>
          <ToggleButton
            label={text.audioTransition}
            active={transition.parameters.preserveAudio !== false}
            onClick={() => onTransitionPatch({
              parameters: {
                preserveAudio: transition.parameters.preserveAudio === false,
              },
            })}
          />
          <button
            type="button"
            data-testid="inspector-transition-remove"
            onClick={onRemoveTransition}
            className="w-full rounded border border-ds-200 bg-paper px-3 py-2 text-sm text-danger-800 hover:border-danger-500"
          >
            {text.removeTransition}
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded border border-ds-200 bg-paper p-2 text-xs text-ds-600">
          {text.transitionHelp}
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
  const language = useMenuLanguage();
  const text = inspectorMotionText[language];
  const draftBounds = keyframeValueBounds(keyframeDraft.property);

  return (
    <div
      data-testid="inspector-keyframes-panel"
      data-keyframe-count={keyframes.length}
      className="rounded-md border border-ds-200 bg-surface p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.keyframes}</h2>
        <span className="text-meta text-ds-600">
          {formatTimecode(localTime, fps)} / {keyframes.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block text-xs text-ds-600">
          {text.property}
          <select
            value={keyframeDraft.property}
            onChange={(event) => onKeyframeDraftPropertyChange(event.target.value as ClipKeyframe['property'])}
            className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
          >
            {KEYFRAME_PROPERTIES.map((property) => (
              <option key={property} value={property}>
                {keyframePropertyLabel(property, language)}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label={text.value}
          value={keyframeDraft.value}
          step={draftBounds.step}
          min={draftBounds.min}
          max={draftBounds.max}
          onChange={(value) => onKeyframeDraftChange({ value })}
        />
        <label className="block text-xs text-ds-600">
          {text.easing}
          <select
            value={keyframeDraft.easing}
            onChange={(event) => onKeyframeDraftChange({ easing: event.target.value as ClipKeyframe['easing'] })}
            className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
          >
            <option value="hold">{text.easingOptions.hold}</option>
            <option value="linear">{text.easingOptions.linear}</option>
            <option value="easeIn">{text.easingOptions.easeIn}</option>
            <option value="easeOut">{text.easingOptions.easeOut}</option>
            <option value="easeInOut">{text.easingOptions.easeInOut}</option>
            <option value="smooth">{text.easingOptions.smooth}</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={onAddKeyframeAtPlayhead}
        className="mt-3 w-full rounded border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500"
      >
        {text.addAtPlayhead}
      </button>
      <div className="mt-3 space-y-2">
        {keyframes.length > 0 ? (
          keyframes.map((keyframe) => {
            const bounds = keyframeValueBounds(keyframe.property);
            return (
              <div key={keyframe.id} className="rounded border border-ds-200 bg-paper p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ds-800">{keyframePropertyLabel(keyframe.property, language)}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteKeyframe(keyframe.id)}
                    className="text-xs text-danger-700 hover:text-danger-800"
                  >
                    {text.delete}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label={text.time}
                    value={keyframe.time}
                    step={1 / fps}
                    min={0}
                    max={clip.duration}
                    onChange={(value) => onKeyframePatch(keyframe.id, { time: value })}
                  />
                  <NumberField
                    label={text.value}
                    value={keyframeNumericValue(keyframe, clip)}
                    step={bounds.step}
                    min={bounds.min}
                    max={bounds.max}
                    onChange={(value) => onKeyframePatch(keyframe.id, { value })}
                  />
                  <label className="block text-xs text-ds-600">
                    {text.easing}
                    <select
                      value={keyframe.easing}
                      onChange={(event) => onKeyframePatch(keyframe.id, { easing: event.target.value as ClipKeyframe['easing'] })}
                      className="mt-1 w-full rounded-md border border-ds-200 bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
                    >
                      <option value="hold">{text.easingOptions.hold}</option>
                      <option value="linear">{text.easingOptions.linear}</option>
                      <option value="easeIn">{text.easingOptions.easeIn}</option>
                      <option value="easeOut">{text.easingOptions.easeOut}</option>
                      <option value="easeInOut">{text.easingOptions.easeInOut}</option>
                      <option value="smooth">{text.easingOptions.smooth}</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded border border-ds-200 bg-paper p-2 text-xs text-ds-600">
            {text.noKeyframes}
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

export function transitionTypeLabel(type: TimelineTransition['type'], language: DanbiMenuLanguage = 'en'): string {
  if (language === 'ko') {
    switch (type) {
      case 'crossfade':
        return '크로스페이드';
      case 'dip':
        return '딥';
      case 'push':
        return '밀기';
      case 'wipe':
        return '와이프';
      case 'match-cut':
        return '매치 컷';
      case 'ai-morph':
        return 'AI 모프';
      default:
        return '컷';
    }
  }

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

function keyframePropertyLabel(property: ClipKeyframe['property'], language: DanbiMenuLanguage = 'en'): string {
  if (language === 'ko') {
    switch (property) {
      case 'positionX':
        return '위치 X';
      case 'positionY':
        return '위치 Y';
      case 'scale':
        return '확대';
      case 'rotation':
        return '회전';
      case 'opacity':
        return '불투명도';
      case 'volume':
        return '볼륨';
      default:
        return property;
    }
  }

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
