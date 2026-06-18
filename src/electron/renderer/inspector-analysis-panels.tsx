import type { AudioPeakNormalizePlan } from '../../lib/editor/audio-normalize';
import type { BeatDetectionPlan } from '../../lib/editor/beat-detection';
import type { SilenceRemovalPlan } from '../../lib/editor/silence-removal';
import { NumberField, ToggleButton } from './editor-form-controls';
import type { BeatDetectionSettings, SilenceRemovalSettings } from './editor-view-model';

type FormatTimecode = (seconds: number, fps: number) => string;

interface InspectorAudioAnalysisPanelsProps {
  clipId: string;
  fps: number;
  normalizeTargetPeak: number;
  normalizeReadyCount: number;
  canNormalizeAudio: boolean;
  peakNormalizePlan: AudioPeakNormalizePlan | null;
  silenceSettings: SilenceRemovalSettings;
  silencePlan: SilenceRemovalPlan | null;
  canRemoveSilence: boolean;
  beatSettings: BeatDetectionSettings;
  beatPlan: BeatDetectionPlan | null;
  canDetectBeats: boolean;
  onNormalizeTargetPeakChange: (value: number) => void;
  onNormalizeAudioPeak: () => void;
  onSilenceSettingsPatch: (patch: Partial<SilenceRemovalSettings>) => void;
  onAnalyzeSilence: () => void;
  onRemoveSilence: () => void;
  onBeatSettingsPatch: (patch: Partial<BeatDetectionSettings>) => void;
  onAnalyzeBeats: () => void;
  onAddBeatMarkers: () => void;
  onBeatCut: () => void;
  formatTimecode: FormatTimecode;
}

export function InspectorAudioAnalysisPanels({
  clipId,
  fps,
  normalizeTargetPeak,
  normalizeReadyCount,
  canNormalizeAudio,
  peakNormalizePlan,
  silenceSettings,
  silencePlan,
  canRemoveSilence,
  beatSettings,
  beatPlan,
  canDetectBeats,
  onNormalizeTargetPeakChange,
  onNormalizeAudioPeak,
  onSilenceSettingsPatch,
  onAnalyzeSilence,
  onRemoveSilence,
  onBeatSettingsPatch,
  onAnalyzeBeats,
  onAddBeatMarkers,
  onBeatCut,
  formatTimecode,
}: InspectorAudioAnalysisPanelsProps) {
  return (
    <>
      <InspectorPeakNormalizePanel
        targetPeak={normalizeTargetPeak}
        readyCount={normalizeReadyCount}
        canNormalizeAudio={canNormalizeAudio}
        plan={peakNormalizePlan}
        onTargetPeakChange={onNormalizeTargetPeakChange}
        onNormalizeAudioPeak={onNormalizeAudioPeak}
      />
      <InspectorSilencePanel
        clipId={clipId}
        fps={fps}
        settings={silenceSettings}
        plan={silencePlan}
        canRemoveSilence={canRemoveSilence}
        onSettingsPatch={onSilenceSettingsPatch}
        onAnalyzeSilence={onAnalyzeSilence}
        onRemoveSilence={onRemoveSilence}
        formatTimecode={formatTimecode}
      />
      <InspectorBeatEditPanel
        clipId={clipId}
        fps={fps}
        settings={beatSettings}
        plan={beatPlan}
        canDetectBeats={canDetectBeats}
        onSettingsPatch={onBeatSettingsPatch}
        onAnalyzeBeats={onAnalyzeBeats}
        onAddBeatMarkers={onAddBeatMarkers}
        onBeatCut={onBeatCut}
        formatTimecode={formatTimecode}
      />
    </>
  );
}

function InspectorPeakNormalizePanel({
  targetPeak,
  readyCount,
  canNormalizeAudio,
  plan,
  onTargetPeakChange,
  onNormalizeAudioPeak,
}: {
  targetPeak: number;
  readyCount: number;
  canNormalizeAudio: boolean;
  plan: AudioPeakNormalizePlan | null;
  onTargetPeakChange: (value: number) => void;
  onNormalizeAudioPeak: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Peak Normalize</h2>
        <span className="text-[11px] text-zinc-500">
          {canNormalizeAudio ? `${readyCount} ready` : 'waveform needed'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_104px] gap-2">
        <NumberField
          label="Target peak"
          value={targetPeak}
          step={0.01}
          min={0.05}
          max={1}
          onChange={onTargetPeakChange}
        />
        <button
          type="button"
          disabled={!canNormalizeAudio}
          onClick={onNormalizeAudioPeak}
          className="mt-5 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
        <div className="flex justify-between gap-2">
          <span>Current peak</span>
          <span className="tabular-nums">{plan ? plan.currentPeak.toFixed(3) : '--'}</span>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          <span>Gain</span>
          <span className="tabular-nums">
            {plan ? `${formatSignedDb(plan.gainDb)}${plan.limited ? ' limited' : ''}` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}

function InspectorSilencePanel({
  clipId,
  fps,
  settings,
  plan,
  canRemoveSilence,
  onSettingsPatch,
  onAnalyzeSilence,
  onRemoveSilence,
  formatTimecode,
}: {
  clipId: string;
  fps: number;
  settings: SilenceRemovalSettings;
  plan: SilenceRemovalPlan | null;
  canRemoveSilence: boolean;
  onSettingsPatch: (patch: Partial<SilenceRemovalSettings>) => void;
  onAnalyzeSilence: () => void;
  onRemoveSilence: () => void;
  formatTimecode: FormatTimecode;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Silence</h2>
        <span className="text-[11px] text-zinc-500">
          {canRemoveSilence ? 'waveform ready' : 'waveform needed'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField
          label="Threshold"
          value={settings.threshold}
          step={0.01}
          min={0}
          max={1}
          onChange={(value) => onSettingsPatch({ threshold: value })}
        />
        <NumberField
          label="Min sec"
          value={settings.minSilenceDuration}
          step={0.05}
          min={0.1}
          max={30}
          onChange={(value) => onSettingsPatch({ minSilenceDuration: value })}
        />
        <NumberField
          label="Padding"
          value={settings.padding}
          step={0.01}
          min={0}
          max={5}
          onChange={(value) => onSettingsPatch({ padding: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ToggleButton
          label="Ripple"
          active={settings.ripple}
          onClick={() => onSettingsPatch({ ripple: !settings.ripple })}
        />
        <button
          type="button"
          disabled={!canRemoveSilence}
          onClick={onAnalyzeSilence}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Analyze
        </button>
        <button
          type="button"
          disabled={!canRemoveSilence}
          onClick={onRemoveSilence}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      {plan?.clipId === clipId ? (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
          <div className="flex justify-between gap-2">
            <span>{plan.ranges.length} range{plan.ranges.length === 1 ? '' : 's'}</span>
            <span>{plan.removedDuration.toFixed(2)}s</span>
          </div>
          {plan.ranges[0] ? (
            <div className="mt-1 text-[11px] text-zinc-500">
              first {formatTimecode(plan.ranges[0].start, fps)} - {formatTimecode(plan.ranges[0].end, fps)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InspectorBeatEditPanel({
  clipId,
  fps,
  settings,
  plan,
  canDetectBeats,
  onSettingsPatch,
  onAnalyzeBeats,
  onAddBeatMarkers,
  onBeatCut,
  formatTimecode,
}: {
  clipId: string;
  fps: number;
  settings: BeatDetectionSettings;
  plan: BeatDetectionPlan | null;
  canDetectBeats: boolean;
  onSettingsPatch: (patch: Partial<BeatDetectionSettings>) => void;
  onAnalyzeBeats: () => void;
  onAddBeatMarkers: () => void;
  onBeatCut: () => void;
  formatTimecode: FormatTimecode;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Beat Edit</h2>
        <span className="text-[11px] text-zinc-500">
          {canDetectBeats ? 'waveform ready' : 'waveform needed'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField
          label="Threshold"
          value={settings.threshold}
          step={0.01}
          min={0}
          max={1}
          onChange={(value) => onSettingsPatch({ threshold: value })}
        />
        <NumberField
          label="Spacing"
          value={settings.minSpacing}
          step={0.05}
          min={0.05}
          max={30}
          onChange={(value) => onSettingsPatch({ minSpacing: value })}
        />
        <NumberField
          label="Max"
          value={settings.maxBeats}
          step={1}
          min={1}
          max={512}
          onChange={(value) => onSettingsPatch({ maxBeats: Math.max(1, Math.min(512, Math.round(value))) })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!canDetectBeats}
          onClick={onAnalyzeBeats}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Analyze
        </button>
        <button
          type="button"
          disabled={!canDetectBeats}
          onClick={onAddBeatMarkers}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Markers
        </button>
        <button
          type="button"
          disabled={!canDetectBeats}
          onClick={onBeatCut}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cut
        </button>
      </div>
      {plan?.clipId === clipId ? (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
          <div className="flex justify-between gap-2">
            <span>{plan.beats.length} beat{plan.beats.length === 1 ? '' : 's'}</span>
            <span>{plan.beats[0] ? formatTimecode(plan.beats[0].time, fps) : '--:--'}</span>
          </div>
          {plan.beats[0] ? (
            <div className="mt-1 text-[11px] text-zinc-500">
              first strength {Math.round(plan.beats[0].strength * 100)}%
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatSignedDb(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
}
