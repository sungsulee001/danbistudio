import type { CaptionSidecarOptions } from '../../lib/editor/caption-sidecar';
import type { ChangeEvent, RefObject } from 'react';
import type { MarkerInterchangeFormat } from '../../lib/editor/marker-interchange';
import {
  DEFAULT_MASTER_LOUDNESS_LUFS,
  DEFAULT_MASTER_TRUE_PEAK_DB,
  MASTER_LOUDNESS_MAX_LUFS,
  MASTER_LOUDNESS_MIN_LUFS,
  MASTER_TRUE_PEAK_MAX_DB,
  MASTER_TRUE_PEAK_MIN_DB,
  type MasterAudioSettings,
} from '../../lib/editor/master-audio';
import { NumberField, ToggleButton } from './editor-form-controls';

export function MasterAudioExportPanel({
  settings,
  onChange,
}: {
  settings: MasterAudioSettings;
  onChange: (patch: MasterAudioSettings) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-zinc-500">Master audio</span>
        <span className="text-sky-300">
          {settings.loudnessLufs ?? DEFAULT_MASTER_LOUDNESS_LUFS} LUFS / {settings.truePeakDb ?? DEFAULT_MASTER_TRUE_PEAK_DB} dBTP
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Loudness LUFS"
          value={settings.loudnessLufs ?? DEFAULT_MASTER_LOUDNESS_LUFS}
          step={0.5}
          min={MASTER_LOUDNESS_MIN_LUFS}
          max={MASTER_LOUDNESS_MAX_LUFS}
          onChange={(value) => onChange({ loudnessLufs: value })}
        />
        <NumberField
          label="True peak dB"
          value={settings.truePeakDb ?? DEFAULT_MASTER_TRUE_PEAK_DB}
          step={0.1}
          min={MASTER_TRUE_PEAK_MIN_DB}
          max={MASTER_TRUE_PEAK_MAX_DB}
          onChange={(value) => onChange({ truePeakDb: value })}
        />
      </div>
    </div>
  );
}

export function CaptionSidecarExportPanel({
  settings,
  onChange,
  onDownload,
}: {
  settings: Required<CaptionSidecarOptions>;
  onChange: (settings: Required<CaptionSidecarOptions>) => void;
  onDownload: (format: 'srt' | 'vtt') => void | Promise<void>;
}) {
  return (
    <>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
        <div className="grid grid-cols-3 gap-2">
          <ToggleButton
            label="Speaker"
            active={settings.includeSpeaker}
            onClick={() => onChange({ ...settings, includeSpeaker: !settings.includeSpeaker })}
          />
          <ToggleButton
            label="VTT style"
            active={settings.includeStyleMetadata}
            onClick={() => onChange({ ...settings, includeStyleMetadata: !settings.includeStyleMetadata })}
          />
          <ToggleButton
            label="VTT words"
            active={settings.includeWordTiming}
            onClick={() => onChange({ ...settings, includeWordTiming: !settings.includeWordTiming })}
          />
        </div>
        <div className="mt-2">
          <NumberField
            label="Wrap chars"
            value={settings.maxLineLength}
            step={1}
            min={0}
            max={120}
            onChange={(value) => onChange({
              ...settings,
              maxLineLength: Math.max(0, Math.min(120, Math.round(value))),
            })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownload('srt')}
        >
          SRT
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownload('vtt')}
        >
          VTT
        </button>
      </div>
    </>
  );
}

export function InterchangeExportPanel({
  onDownloadEdl,
  edlFileInputRef,
  onImportEdl,
  onEdlFileChange,
  onDownloadFcpxml,
  fcpxmlFileInputRef,
  onImportFcpxml,
  onFcpxmlFileChange,
  markerFileInputRef,
  onDownloadMarkers,
  onImportMarkers,
  onMarkerFileChange,
}: {
  onDownloadEdl: () => void | Promise<void>;
  edlFileInputRef: RefObject<HTMLInputElement>;
  onImportEdl: () => void;
  onEdlFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onDownloadFcpxml: () => void | Promise<void>;
  fcpxmlFileInputRef: RefObject<HTMLInputElement>;
  onImportFcpxml: () => void;
  onFcpxmlFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  markerFileInputRef: RefObject<HTMLInputElement>;
  onDownloadMarkers: (format: MarkerInterchangeFormat) => void | Promise<void>;
  onImportMarkers: () => void;
  onMarkerFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-zinc-500">Interchange</span>
        <span className="text-zinc-500">EDL / FCPXML / Markers</span>
      </div>
      <input
        ref={edlFileInputRef}
        type="file"
        accept=".edl,text/plain"
        className="hidden"
        onChange={(event) => void onEdlFileChange(event)}
      />
      <input
        ref={fcpxmlFileInputRef}
        type="file"
        accept=".fcpxml,.xml,application/xml,text/xml,text/plain"
        className="hidden"
        onChange={(event) => void onFcpxmlFileChange(event)}
      />
      <input
        ref={markerFileInputRef}
        type="file"
        accept=".csv,.txt,.chapters,text/csv,text/plain"
        className="hidden"
        onChange={(event) => void onMarkerFileChange(event)}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownloadEdl()}
        >
          Export EDL
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-sky-500"
          onClick={onImportEdl}
        >
          Import EDL
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownloadFcpxml()}
        >
          Export XML
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-sky-500"
          onClick={onImportFcpxml}
        >
          Import XML
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownloadMarkers('csv')}
        >
          Marker CSV
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => void onDownloadMarkers('youtube-chapters')}
        >
          Chapters
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 hover:border-sky-500"
          onClick={onImportMarkers}
        >
          Import
        </button>
      </div>
    </div>
  );
}
