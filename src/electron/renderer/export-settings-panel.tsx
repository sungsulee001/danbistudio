import { getExportProfileCodecOptions, type ExportProfilePatch } from '../../lib/editor/export-profiles';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import type { ExportManifest, ExportProfile } from '../../lib/editor/types';
import type { FfmpegCapabilitiesView } from './editor-view-model';
import { NumberField, ToggleButton } from './editor-form-controls';

type ExportRangeMode = 'timeline' | 'marked';
type ExportRange = { start: number; end: number };

export function ExportSettingsPanel({
  exportProfiles,
  activeExportProfileId,
  selectedExportProfile,
  exportManifest,
  renderPlan,
  ffmpegCapabilities,
  exportRangeMode,
  markedRange,
  activeExportRange,
  batchExportProfileIds,
  timelineDuration,
  fps,
  isRendering,
  onSelectExportProfile,
  onToggleBatchExportProfile,
  onQueueBatchRender,
  onPatchExportProfile,
  onDuplicateExportProfile,
  onRemoveExportProfile,
  onExportRangeModeChange,
  onMissingMarkedRange,
}: {
  exportProfiles: ExportProfile[];
  activeExportProfileId: string;
  selectedExportProfile?: ExportProfile;
  exportManifest: ExportManifest;
  renderPlan: FfmpegRenderPlan;
  ffmpegCapabilities: FfmpegCapabilitiesView | null;
  exportRangeMode: ExportRangeMode;
  markedRange: ExportRange | null;
  activeExportRange: ExportRange | null;
  batchExportProfileIds: string[];
  timelineDuration: number;
  fps: number;
  isRendering: boolean;
  onSelectExportProfile: (profileId: string) => void;
  onToggleBatchExportProfile: (profileId: string) => void;
  onQueueBatchRender: () => void;
  onPatchExportProfile: (patch: ExportProfilePatch) => void;
  onDuplicateExportProfile: () => void;
  onRemoveExportProfile: () => void;
  onExportRangeModeChange: (mode: ExportRangeMode) => void;
  onMissingMarkedRange: () => void;
}) {
  return (
    <>
      <label className="block text-xs text-ds-600">
        Profile
        <select
          value={activeExportProfileId}
          onChange={(event) => onSelectExportProfile(event.target.value)}
          className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent-500"
        >
          {exportProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      {selectedExportProfile ? (
        <div className="rounded-md border border-ds-200 bg-paper p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-ds-600">Profile settings</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDuplicateExportProfile}
                className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-info-600"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={onRemoveExportProfile}
                disabled={exportProfiles.length <= 1}
                className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
          <label className="block text-xs text-ds-600">
            Label
            <input
              key={`${selectedExportProfile.id}-${selectedExportProfile.label}`}
              defaultValue={selectedExportProfile.label}
              onBlur={(event) => onPatchExportProfile({ label: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-ds-600">
              Purpose
              <select
                value={selectedExportProfile.purpose ?? ''}
                onChange={(event) => onPatchExportProfile({
                  purpose: event.currentTarget.value
                    ? event.currentTarget.value as NonNullable<ExportProfile['purpose']>
                    : undefined,
                })}
                className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              >
                <option value="">Delivery</option>
                <option value="master">Master</option>
                <option value="social">Social</option>
                <option value="proxy">Proxy</option>
              </select>
            </label>
            <label className="text-xs text-ds-600">
              Container
              <select
                value={selectedExportProfile.container}
                onChange={(event) => onPatchExportProfile({ container: event.currentTarget.value as ExportProfile['container'] })}
                className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              >
                <option value="mp4">MP4</option>
                <option value="mov">MOV</option>
                <option value="webm">WebM</option>
              </select>
            </label>
            <label className="text-xs text-ds-600">
              Codec
              <select
                value={selectedExportProfile.codec}
                onChange={(event) => onPatchExportProfile({ codec: event.currentTarget.value as ExportProfile['codec'] })}
                className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              >
                {getExportProfileCodecOptions(selectedExportProfile.container).map((codec) => (
                  <option key={codec} value={codec}>{formatExportCodecLabel(codec)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ds-600">
              Preset
              <select
                value={selectedExportProfile.ffmpegPreset ?? ''}
                onChange={(event) => onPatchExportProfile({
                  ffmpegPreset: event.currentTarget.value
                    ? event.currentTarget.value as NonNullable<ExportProfile['ffmpegPreset']>
                    : undefined,
                })}
                className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              >
                <option value="">Codec default</option>
                <option value="ultrafast">Ultrafast</option>
                <option value="superfast">Superfast</option>
                <option value="veryfast">Veryfast</option>
                <option value="faster">Faster</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium</option>
                <option value="slow">Slow</option>
              </select>
            </label>
            <NumberField label="Width" value={selectedExportProfile.width} step={16} min={16} max={8192} onChange={(value) => onPatchExportProfile({ width: value })} />
            <NumberField label="Height" value={selectedExportProfile.height} step={16} min={16} max={8192} onChange={(value) => onPatchExportProfile({ height: value })} />
            <NumberField label="FPS" value={selectedExportProfile.fps} step={1} min={1} max={240} onChange={(value) => onPatchExportProfile({ fps: value })} />
            <NumberField label="Video Mbps" value={selectedExportProfile.videoBitrateMbps} step={0.5} min={0.5} max={300} onChange={(value) => onPatchExportProfile({ videoBitrateMbps: value })} />
            <NumberField label="Audio kbps" value={selectedExportProfile.audioBitrateKbps} step={16} min={32} max={1024} onChange={(value) => onPatchExportProfile({ audioBitrateKbps: value })} />
            <label className="text-xs text-ds-600">
              CRF
              <input
                key={`${selectedExportProfile.id}-${selectedExportProfile.crf ?? 'none'}`}
                type="number"
                defaultValue={selectedExportProfile.crf ?? ''}
                min={0}
                max={51}
                step={1}
                placeholder="auto"
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  onPatchExportProfile({ crf: value === '' ? undefined : Number(value) });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none placeholder:text-ds-400 focus:border-accent-500"
              />
            </label>
          </div>
        </div>
      ) : null}
      <div className="rounded-md border border-ds-200 bg-paper p-2">
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton
            label="Full"
            active={exportRangeMode === 'timeline'}
            onClick={() => onExportRangeModeChange('timeline')}
          />
          <ToggleButton
            label="In-Out"
            active={exportRangeMode === 'marked' && Boolean(markedRange)}
            onClick={() => {
              if (!markedRange) {
                onMissingMarkedRange();
                return;
              }

              onExportRangeModeChange('marked');
            }}
          />
        </div>
        <div className="mt-2 text-meta text-ds-600">
          {activeExportRange
            ? `${formatTimecode(activeExportRange.start, fps)} - ${formatTimecode(activeExportRange.end, fps)} / ${activeExportRange.end - activeExportRange.start}s`
            : `Full timeline / ${timelineDuration}s`}
        </div>
      </div>
      <ExportReadout label="Profile" value={exportManifest.profile.label} />
      <ExportReadout label="Purpose" value={exportManifest.profile.purpose ?? 'delivery'} />
      <ExportReadout label="Duration" value={`${exportManifest.duration}s`} />
      <ExportReadout label="Frame" value={`${selectedExportProfile?.width ?? exportManifest.profile.width}x${selectedExportProfile?.height ?? exportManifest.profile.height} / ${selectedExportProfile?.fps ?? exportManifest.profile.fps}fps`} />
      <ExportReadout label="Codec" value={exportManifest.profile.codec.toUpperCase()} />
      <ExportReadout label="Encoder" value={`${renderPlan.videoEncoder.encoder}${renderPlan.videoEncoder.hardware ? ' HW' : ' SW'}`} />
      <ExportReadout label="HW encoders" value={ffmpegCapabilities ? String(ffmpegCapabilities.hardwareEncoders.length) : 'detecting'} />
      <ExportReadout label="Bitrate" value={`${exportManifest.profile.videoBitrateMbps} Mbps`} />
      <ExportReadout label="Filters" value={String(renderPlan.filterGraph.length)} />
      <div className="rounded-md border border-ds-200 bg-paper p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-ds-600">Quick export</span>
          <button
            type="button"
            onClick={onQueueBatchRender}
            disabled={isRendering || batchExportProfileIds.length === 0}
            className="rounded border border-info-500/50 px-2 py-1 text-meta text-info-800 hover:bg-info-500/10 disabled:cursor-not-allowed disabled:border-ds-300 disabled:text-ds-400"
          >
            Queue Batch
          </button>
        </div>
        <div className="space-y-1">
          {exportProfiles.map((profile) => (
            <label key={profile.id} className="flex items-center justify-between gap-3 rounded border border-ds-200 bg-surface px-2 py-1 text-xs text-ds-700">
              <span className="min-w-0 truncate">{profile.label}</span>
              <input
                type="checkbox"
                checked={batchExportProfileIds.includes(profile.id)}
                onChange={() => onToggleBatchExportProfile(profile.id)}
                className="h-4 w-4 accent-accent-500"
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function formatExportCodecLabel(codec: ExportProfile['codec']): string {
  switch (codec) {
    case 'h265':
      return 'H.265';
    case 'prores':
      return 'ProRes';
    case 'av1':
      return 'AV1';
    case 'h264':
    default:
      return 'H.264';
  }
}

function ExportReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ds-200 py-2 text-sm">
      <span className="text-ds-600">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(frames)}`;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}
