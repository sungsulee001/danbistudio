import { DEFAULT_CAPTION_STYLE, normalizeCaptionStyle, normalizeHexColor } from '../../lib/editor/caption-style';
import { listTextStylePacks, textStylePackToPatch, type TextStylePackTarget } from '../../lib/editor/text-style-packs';
import { readTitleStyle } from '../../lib/editor/title-style';
import type { CaptionSegment, CaptionStyle, ClipEffect, TimelineClip } from '../../lib/editor/types';
import { NumberField, ToggleButton } from './editor-form-controls';

export type EffectParameterControl =
  | {
      kind: 'number';
      key: string;
      label: string;
      value: number;
      step: number;
      min?: number;
      max?: number;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      value: string;
      options: Array<{ value: string; label: string }>;
    };

export function CaptionStyleControls({
  caption,
  projectHeight,
  onChange,
}: {
  caption: CaptionSegment;
  projectHeight: number;
  onChange: (patch: CaptionStyle) => void;
}) {
  const style = normalizeCaptionStyle(caption.style, Math.max(18, Math.round(projectHeight * 0.045)));

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <TextStylePackButtons target="caption" onApply={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Font px"
          value={style.fontSize}
          step={1}
          min={12}
          max={180}
          onChange={(value) => onChange({ fontSize: value })}
        />
        <label className="block text-xs text-zinc-500">
          Position
          <select
            value={style.position}
            onChange={(event) => onChange({ position: event.target.value as CaptionStyle['position'] })}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="bottom">bottom</option>
            <option value="middle">middle</option>
            <option value="top">top</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          Align
          <select
            value={style.align}
            onChange={(event) => onChange({ align: event.target.value as CaptionStyle['align'] })}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="center">center</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
        </label>
        <NumberField
          label="Box alpha"
          value={style.boxOpacity}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onChange({ boxOpacity: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="block text-xs text-zinc-500">
          Text
          <input
            aria-label="Caption text color"
            type="color"
            value={normalizeHexColor(style.fontColor, DEFAULT_CAPTION_STYLE.fontColor)}
            onChange={(event) => onChange({ fontColor: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-zinc-950"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Box
          <input
            aria-label="Caption box color"
            type="color"
            value={normalizeHexColor(style.boxColor, DEFAULT_CAPTION_STYLE.boxColor)}
            onChange={(event) => onChange({ boxColor: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-zinc-950"
          />
        </label>
        <div className="flex items-end">
          <ToggleButton label="Box" active={style.boxEnabled} onClick={() => onChange({ boxEnabled: !style.boxEnabled })} />
        </div>
      </div>
      <TextShadowControls
        style={style}
        labelPrefix="Caption"
        onChange={onChange}
      />
    </div>
  );
}

export function TitleStyleControls({
  clip,
  projectHeight,
  onChange,
}: {
  clip: TimelineClip;
  projectHeight: number;
  onChange: (patch: CaptionStyle) => void;
}) {
  const style = readTitleStyle(clip, Math.max(18, Math.round(projectHeight * 0.065)));

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <TextStylePackButtons target="title" onApply={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Title px"
          value={style.fontSize}
          step={1}
          min={12}
          max={220}
          onChange={(value) => onChange({ fontSize: value })}
        />
        <label className="block text-xs text-zinc-500">
          Position
          <select
            value={style.position}
            onChange={(event) => onChange({ position: event.target.value as CaptionStyle['position'] })}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="middle">middle</option>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          Align
          <select
            value={style.align}
            onChange={(event) => onChange({ align: event.target.value as CaptionStyle['align'] })}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="center">center</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
        </label>
        <NumberField
          label="Box alpha"
          value={style.boxOpacity}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onChange({ boxOpacity: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="block text-xs text-zinc-500">
          Text
          <input
            aria-label="Title text color"
            type="color"
            value={normalizeHexColor(style.fontColor, DEFAULT_CAPTION_STYLE.fontColor)}
            onChange={(event) => onChange({ fontColor: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-zinc-950"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Box
          <input
            aria-label="Title box color"
            type="color"
            value={normalizeHexColor(style.boxColor, DEFAULT_CAPTION_STYLE.boxColor)}
            onChange={(event) => onChange({ boxColor: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-zinc-950"
          />
        </label>
        <div className="flex items-end">
          <ToggleButton label="Box" active={style.boxEnabled} onClick={() => onChange({ boxEnabled: !style.boxEnabled })} />
        </div>
      </div>
      <TextShadowControls
        style={style}
        labelPrefix="Title"
        onChange={onChange}
      />
    </div>
  );
}

function TextShadowControls({
  style,
  labelPrefix,
  onChange,
}: {
  style: Required<CaptionStyle>;
  labelPrefix: 'Caption' | 'Title';
  onChange: (patch: CaptionStyle) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <label className="block text-xs text-zinc-500">
        Shadow
        <input
          aria-label={`${labelPrefix} shadow color`}
          type="color"
          value={normalizeHexColor(style.shadowColor, DEFAULT_CAPTION_STYLE.shadowColor)}
          onChange={(event) => onChange({ shadowColor: event.target.value })}
          className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-zinc-950"
        />
      </label>
      <NumberField
        label="Sh alpha"
        value={style.shadowOpacity}
        step={0.05}
        min={0}
        max={1}
        onChange={(value) => onChange({ shadowOpacity: value })}
      />
      <NumberField
        label="Sh offset"
        value={style.shadowOffset}
        step={1}
        min={0}
        max={32}
        onChange={(value) => onChange({ shadowOffset: value })}
      />
      <div className="flex items-end">
        <ToggleButton label="Sh" active={style.shadowEnabled} onClick={() => onChange({ shadowEnabled: !style.shadowEnabled })} />
      </div>
    </div>
  );
}

function TextStylePackButtons({
  target,
  onApply,
}: {
  target: TextStylePackTarget;
  onApply: (patch: CaptionStyle) => void;
}) {
  const packs = listTextStylePacks(target);

  return (
    <div className="mb-3">
      <div className="mb-2 text-xs font-medium text-zinc-500">Style packs</div>
      <div className="grid grid-cols-3 gap-2">
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            title={pack.description}
            aria-label={`Apply ${target} style pack ${pack.label}`}
            onClick={() => onApply(textStylePackToPatch(pack))}
            className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-left text-[11px] text-zinc-200 hover:border-emerald-500 focus:border-emerald-500 focus:outline-none"
          >
            <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-sm border border-zinc-700 bg-zinc-900">
              <span style={{ backgroundColor: pack.style.fontColor }} />
              <span style={{ backgroundColor: pack.style.boxColor }} />
              <span style={{ backgroundColor: pack.style.shadowColor }} />
              <span className={pack.style.boxEnabled ? 'bg-emerald-400' : 'bg-zinc-700'} />
            </span>
            <span className="min-w-0 truncate font-medium">{pack.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EffectParameterControls({
  effect,
  onChange,
}: {
  effect: ClipEffect;
  onChange: (effectId: string, key: string, value: string | number | boolean) => void;
}) {
  const controls = getEffectParameterControls(effect);
  if (controls.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {controls.map((control) => {
        if (control.kind === 'select') {
          return (
            <label key={`${effect.id}-${control.key}`} className="block text-xs text-zinc-500">
              {control.label}
              <select
                value={control.value}
                onChange={(event) => onChange(effect.id, control.key, event.currentTarget.value)}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              >
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <NumberField
            key={`${effect.id}-${control.key}`}
            label={control.label}
            value={control.value}
            step={control.step}
            min={control.min}
            max={control.max}
            onChange={(value) => onChange(effect.id, control.key, value)}
          />
        );
      })}
    </div>
  );
}

export function getEffectParameterControls(effect: ClipEffect): EffectParameterControl[] {
  const defaults: Record<string, { label: string; step: number; min?: number; max?: number }> = {
    left: { label: 'Left', step: 0.01, min: 0, max: 0.45 },
    right: { label: 'Right', step: 0.01, min: 0, max: 0.45 },
    top: { label: 'Top', step: 0.01, min: 0, max: 0.45 },
    bottom: { label: 'Bottom', step: 0.01, min: 0, max: 0.45 },
    brightness: { label: 'Brightness', step: 0.01, min: -1, max: 1 },
    contrast: { label: 'Contrast', step: 0.05, min: 0, max: 4 },
    saturation: { label: 'Saturation', step: 0.05, min: 0, max: 4 },
    gamma: { label: 'Gamma', step: 0.05, min: 0.1, max: 10 },
    temperature: { label: 'Temp', step: 0.05, min: -1, max: 1 },
    tint: { label: 'Tint', step: 0.05, min: -1, max: 1 },
    curveShadow: { label: 'Curve shad', step: 0.01, min: 0, max: 1 },
    curveMid: { label: 'Curve mid', step: 0.01, min: 0, max: 1 },
    curveHighlight: { label: 'Curve high', step: 0.01, min: 0, max: 1 },
    targetAspect: { label: 'Aspect', step: 0.01, min: 0.1, max: 10 },
    focalX: { label: 'Focal X', step: 0.01, min: 0, max: 1 },
    focalY: { label: 'Focal Y', step: 0.01, min: 0, max: 1 },
    focalXStart: { label: 'Focal S X', step: 0.01, min: 0, max: 1 },
    focalYStart: { label: 'Focal S Y', step: 0.01, min: 0, max: 1 },
    focalXMid: { label: 'Focal M X', step: 0.01, min: 0, max: 1 },
    focalYMid: { label: 'Focal M Y', step: 0.01, min: 0, max: 1 },
    focalXEnd: { label: 'Focal E X', step: 0.01, min: 0, max: 1 },
    focalYEnd: { label: 'Focal E Y', step: 0.01, min: 0, max: 1 },
    zoom: { label: 'Zoom', step: 0.01, min: 1, max: 4 },
    centerX: { label: 'Mask X', step: 0.01, min: 0, max: 1 },
    centerY: { label: 'Mask Y', step: 0.01, min: 0, max: 1 },
    centerXStart: { label: 'Mask S X', step: 0.01, min: 0, max: 1 },
    centerYStart: { label: 'Mask S Y', step: 0.01, min: 0, max: 1 },
    centerXMid: { label: 'Mask M X', step: 0.01, min: 0, max: 1 },
    centerYMid: { label: 'Mask M Y', step: 0.01, min: 0, max: 1 },
    centerXEnd: { label: 'Mask E X', step: 0.01, min: 0, max: 1 },
    centerYEnd: { label: 'Mask E Y', step: 0.01, min: 0, max: 1 },
    width: { label: 'Mask W', step: 0.01, min: 0.05, max: 1 },
    height: { label: 'Mask H', step: 0.01, min: 0.05, max: 1 },
    feather: { label: 'Feather', step: 0.01, min: 0, max: 0.4 },
    trackingMidTime: { label: 'Track mid', step: 0.05, min: 0 },
    trackingDuration: { label: 'Track end', step: 0.05, min: 0 },
    reductionDb: { label: 'Reduction dB', step: 1, min: -60, max: 0 },
    attackMs: { label: 'Attack ms', step: 10, min: 0, max: 2000 },
    releaseMs: { label: 'Release ms', step: 10, min: 0, max: 3000 },
    gainDb: { label: 'Gain dB', step: 1, min: -24, max: 24 },
    highpassHz: { label: 'Highpass', step: 5, min: 20, max: 400 },
    lowpassHz: { label: 'Lowpass', step: 100, min: 2000, max: 22000 },
    noiseFloorDb: { label: 'Noise floor', step: 1, min: -80, max: -10 },
    compressorThresholdDb: { label: 'Comp thresh', step: 1, min: -60, max: 0 },
    compressorRatio: { label: 'Comp ratio', step: 0.5, min: 1, max: 20 },
    compressorAttackMs: { label: 'Comp attack', step: 1, min: 0.01, max: 2000 },
    compressorReleaseMs: { label: 'Comp release', step: 10, min: 10, max: 5000 },
    makeupGainDb: { label: 'Makeup dB', step: 0.5, min: -12, max: 24 },
    limiterDb: { label: 'Limiter dB', step: 0.5, min: -24, max: 0 },
    deEssFrequencyHz: { label: 'De-ess Hz', step: 100, min: 3000, max: 12000 },
    deEssGainDb: { label: 'De-ess dB', step: 0.5, min: -18, max: 0 },
    deEssWidth: { label: 'De-ess Q', step: 0.1, min: 0.1, max: 8 },
    eqLowFrequencyHz: { label: 'Low Hz', step: 10, min: 20, max: 400 },
    eqLowGainDb: { label: 'Low dB', step: 0.5, min: -18, max: 18 },
    eqLowWidth: { label: 'Low Q', step: 0.1, min: 0.1, max: 8 },
    eqBodyFrequencyHz: { label: 'Body Hz', step: 10, min: 100, max: 1000 },
    eqBodyGainDb: { label: 'Body dB', step: 0.5, min: -18, max: 18 },
    eqBodyWidth: { label: 'Body Q', step: 0.1, min: 0.1, max: 8 },
    eqPresenceFrequencyHz: { label: 'Presence Hz', step: 100, min: 1000, max: 8000 },
    eqPresenceGainDb: { label: 'Presence dB', step: 0.5, min: -18, max: 18 },
    eqPresenceWidth: { label: 'Presence Q', step: 0.1, min: 0.1, max: 8 },
    eqAirFrequencyHz: { label: 'Air Hz', step: 500, min: 4000, max: 20000 },
    eqAirGainDb: { label: 'Air dB', step: 0.5, min: -18, max: 18 },
    eqAirWidth: { label: 'Air Q', step: 0.1, min: 0.1, max: 8 },
    repairHighpassHz: { label: 'Repair HP', step: 5, min: 20, max: 200 },
    repairHumFrequencyHz: { label: 'Hum Hz', step: 1, min: 45, max: 65 },
    repairHumReductionDb: { label: 'Hum dB', step: 0.5, min: -30, max: 0 },
    repairHumWidth: { label: 'Hum Q', step: 0.5, min: 1, max: 30 },
    repairNoiseFloorDb: { label: 'Repair NF', step: 1, min: -80, max: -10 },
    repairHissLowpassHz: { label: 'Hiss LP', step: 500, min: 4000, max: 22000 },
    distance: { label: 'Distance', step: 1, min: 0, max: 800 },
    duration: { label: 'Duration', step: 0.05, min: 0.05, max: 5 },
    radius: { label: 'Radius', step: 1, min: 0, max: 64 },
    blockSize: { label: 'Block size', step: 1, min: 4, max: 128 },
    stabilizeContrast: { label: 'Stab contrast', step: 1, min: 1, max: 255 },
    blurRadius: { label: 'Blur', step: 0.5, min: 0, max: 32 },
    glowRadius: { label: 'Glow blur', step: 0.5, min: 0, max: 16 },
    glowIntensity: { label: 'Glow', step: 0.05, min: 0, max: 1 },
    glowSaturation: { label: 'Glow sat', step: 0.05, min: 0, max: 4 },
    bloomRadius: { label: 'Bloom blur', step: 0.5, min: 0, max: 32 },
    bloomIntensity: { label: 'Bloom', step: 0.05, min: 0, max: 1 },
    bloomThreshold: { label: 'Bloom thresh', step: 0.01, min: 0.1, max: 0.98 },
    bloomSaturation: { label: 'Bloom sat', step: 0.05, min: 0, max: 4 },
    trailFrames: { label: 'Trail frames', step: 1, min: 2, max: 12 },
    trailDecay: { label: 'Trail decay', step: 0.05, min: 0.1, max: 1 },
    flowBlurFrames: { label: 'Flow frames', step: 1, min: 2, max: 6 },
    flowBlurStrength: { label: 'Flow blur', step: 0.05, min: 0.05, max: 1 },
    flowSearchParam: { label: 'Flow search', step: 1, min: 4, max: 128 },
    pixelSize: { label: 'Pixel size', step: 1, min: 4, max: 80 },
    grainStrength: { label: 'Grain', step: 1, min: 0, max: 100 },
    grainSeed: { label: 'Grain seed', step: 1, min: 0, max: 999999 },
    keySimilarity: { label: 'Key sim', step: 0.01, min: 0.01, max: 1 },
    keyBlend: { label: 'Key blend', step: 0.01, min: 0, max: 1 },
    regionCenterX: { label: 'Region X', step: 0.01, min: 0, max: 1 },
    regionCenterY: { label: 'Region Y', step: 0.01, min: 0, max: 1 },
    regionWidth: { label: 'Region W', step: 0.01, min: 0.02, max: 1 },
    regionHeight: { label: 'Region H', step: 0.01, min: 0.02, max: 1 },
    regionStartX: { label: 'Start X', step: 0.01, min: 0, max: 1 },
    regionStartY: { label: 'Start Y', step: 0.01, min: 0, max: 1 },
    regionMidX: { label: 'Mid X', step: 0.01, min: 0, max: 1 },
    regionMidY: { label: 'Mid Y', step: 0.01, min: 0, max: 1 },
    regionEndX: { label: 'End X', step: 0.01, min: 0, max: 1 },
    regionEndY: { label: 'End Y', step: 0.01, min: 0, max: 1 },
    regionMidTime: { label: 'Mid time', step: 0.05, min: 0 },
    regionEndTime: { label: 'End time', step: 0.05, min: 0 },
    denoiseStrength: { label: 'Denoise', step: 0.25, min: 0, max: 12 },
    sharpenAmount: { label: 'Sharpen', step: 0.05, min: 0, max: 1.5 },
    sharpenRadius: { label: 'Sharp radius', step: 1, min: 3, max: 9 },
    focusStrength: { label: 'Focus', step: 0.05, min: 0, max: 1 },
    vignetteStrength: { label: 'Vignette', step: 0.05, min: 0, max: 1 },
    debandStrength: { label: 'Deband', step: 0.001, min: 0.001, max: 0.1 },
    debandRange: { label: 'Deband range', step: 1, min: 1, max: 64 },
    passOpacity: { label: 'Pass opacity', step: 0.05, min: 0, max: 1 },
    passStrength: { label: 'Pass strength', step: 0.05, min: 0, max: 1 },
    restorationDetail: { label: 'Restore detail', step: 0.05, min: 0, max: 1 },
    restorationTextureGuard: { label: 'Texture guard', step: 0.05, min: 0, max: 1 },
    segmentationEdgeFeather: { label: 'Matte feather', step: 0.5, min: 0, max: 32 },
    segmentationForegroundMix: { label: 'Foreground mix', step: 0.05, min: 0, max: 1 },
    segmentationSpillCleanup: { label: 'Spill cleanup', step: 0.05, min: 0, max: 1 },
  };
  const selectDefaults: Record<string, { label: string; values: string[] }> = {
    passBlendMode: { label: 'Pass blend', values: ['normal', 'screen', 'multiply', 'overlay', 'add'] },
    passPurpose: { label: 'Pass purpose', values: ['generic', 'restoration', 'segmentation-matte', 'beauty-retouch'] },
  };

  const numberControls = Object.entries(effect.parameters)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && defaults[entry[0]] !== undefined)
    .map(([key, value]): EffectParameterControl => ({
      kind: 'number',
      key,
      value,
      ...defaults[key],
    }));

  const selectControls = Object.entries(effect.parameters)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && selectDefaults[entry[0]] !== undefined)
    .map(([key, value]): EffectParameterControl => {
      const defaultsForKey = selectDefaults[key];
      const normalizedValue = defaultsForKey.values.includes(value) ? value : defaultsForKey.values[0];
      return {
        kind: 'select',
        key,
        label: defaultsForKey.label,
        value: normalizedValue,
        options: defaultsForKey.values.map((optionValue) => ({
          value: optionValue,
          label: optionValue,
        })),
      };
    });

  return [...numberControls, ...selectControls];
}
