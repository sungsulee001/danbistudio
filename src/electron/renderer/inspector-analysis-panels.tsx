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
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid="inspector-peak-normalize-panel"
      data-can-normalize-audio={canNormalizeAudio ? 'true' : 'false'}
      data-normalize-ready-count={readyCount}
      data-has-normalize-plan={plan ? 'true' : 'false'}
      data-normalize-target-peak={targetPeak}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Peak Normalize</h2>
        <span className="text-meta text-ds-600" data-testid="inspector-peak-normalize-state">
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
          testId="inspector-peak-normalize-target"
          onChange={onTargetPeakChange}
        />
        <button
          type="button"
          data-testid="inspector-peak-normalize-apply"
          disabled={!canNormalizeAudio}
          onClick={onNormalizeAudioPeak}
          className="mt-5 rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      <div className="mt-3 rounded border border-ds-200 bg-paper p-2 text-xs text-ds-700" data-testid="inspector-peak-normalize-readout">
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
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid="inspector-silence-panel"
      data-clip-id={clipId}
      data-can-remove-silence={canRemoveSilence ? 'true' : 'false'}
      data-has-silence-plan={plan?.clipId === clipId ? 'true' : 'false'}
      data-silence-threshold={settings.threshold}
      data-silence-min-duration={settings.minSilenceDuration}
      data-silence-padding={settings.padding}
      data-silence-ripple={settings.ripple ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Silence</h2>
        <span className="text-meta text-ds-600" data-testid="inspector-silence-state">
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
          testId="inspector-silence-threshold"
          onChange={(value) => onSettingsPatch({ threshold: value })}
        />
        <NumberField
          label="Min sec"
          value={settings.minSilenceDuration}
          step={0.05}
          min={0.1}
          max={30}
          testId="inspector-silence-min-duration"
          onChange={(value) => onSettingsPatch({ minSilenceDuration: value })}
        />
        <NumberField
          label="Padding"
          value={settings.padding}
          step={0.01}
          min={0}
          max={5}
          testId="inspector-silence-padding"
          onChange={(value) => onSettingsPatch({ padding: value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {/* Named "Close gaps", not "Ripple": the toolbar and the timeline both
            carry a "Ripple" toggle for the global ripple EDIT MODE, and this
            one is a different thing — whether removing silence closes the gap
            it leaves behind. One word meaning two concepts is worse than a
            duplicate button. */}
        <ToggleButton
          label="Close gaps"
          title="Close the gaps left where silence was removed"
          active={settings.ripple}
          testId="inspector-silence-ripple"
          onClick={() => onSettingsPatch({ ripple: !settings.ripple })}
        />
        <button
          type="button"
          data-testid="inspector-silence-analyze"
          disabled={!canRemoveSilence}
          onClick={onAnalyzeSilence}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Analyze
        </button>
        <button
          type="button"
          data-testid="inspector-silence-remove"
          disabled={!canRemoveSilence}
          onClick={onRemoveSilence}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-danger-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      {plan?.clipId === clipId ? (
        <div
          className="mt-3 rounded border border-ds-200 bg-paper p-2 text-xs text-ds-700"
          data-testid="inspector-silence-plan"
          data-silence-range-count={plan.ranges.length}
          data-silence-removed-duration={plan.removedDuration}
        >
          <div className="flex justify-between gap-2">
            <span>{plan.ranges.length} range{plan.ranges.length === 1 ? '' : 's'}</span>
            <span>{plan.removedDuration.toFixed(2)}s</span>
          </div>
          {plan.ranges[0] ? (
            <div className="mt-1 text-meta text-ds-600">
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
    <div
      className="rounded-md border border-ds-200 bg-surface p-3"
      data-testid="inspector-beat-panel"
      data-clip-id={clipId}
      data-can-detect-beats={canDetectBeats ? 'true' : 'false'}
      data-has-beat-plan={plan?.clipId === clipId ? 'true' : 'false'}
      data-beat-threshold={settings.threshold}
      data-beat-min-spacing={settings.minSpacing}
      data-beat-max={settings.maxBeats}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Beat Edit</h2>
        <span className="text-meta text-ds-600" data-testid="inspector-beat-state">
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
          testId="inspector-beat-threshold"
          onChange={(value) => onSettingsPatch({ threshold: value })}
        />
        <NumberField
          label="Spacing"
          value={settings.minSpacing}
          step={0.05}
          min={0.05}
          max={30}
          testId="inspector-beat-min-spacing"
          onChange={(value) => onSettingsPatch({ minSpacing: value })}
        />
        <NumberField
          label="Max"
          value={settings.maxBeats}
          step={1}
          min={1}
          max={512}
          testId="inspector-beat-max"
          onChange={(value) => onSettingsPatch({ maxBeats: Math.max(1, Math.min(512, Math.round(value))) })}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          data-testid="inspector-beat-analyze"
          disabled={!canDetectBeats}
          onClick={onAnalyzeBeats}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Analyze
        </button>
        <button
          type="button"
          data-testid="inspector-beat-markers"
          disabled={!canDetectBeats}
          onClick={onAddBeatMarkers}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-warn-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Markers
        </button>
        <button
          type="button"
          data-testid="inspector-beat-cut"
          disabled={!canDetectBeats}
          onClick={onBeatCut}
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm text-ds-800 hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cut
        </button>
      </div>
      {plan?.clipId === clipId ? (
        <div
          className="mt-3 rounded border border-ds-200 bg-paper p-2 text-xs text-ds-700"
          data-testid="inspector-beat-plan"
          data-beat-count={plan.beats.length}
        >
          <div className="flex justify-between gap-2">
            <span>{plan.beats.length} beat{plan.beats.length === 1 ? '' : 's'}</span>
            <span>{plan.beats[0] ? formatTimecode(plan.beats[0].time, fps) : '--:--'}</span>
          </div>
          {plan.beats[0] ? (
            <div className="mt-1 text-meta text-ds-600">
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
