import type { ChangeEvent, RefObject } from 'react';
import type { SpeakerDiarizationReport } from '../../lib/editor/stt-speaker-diarization';
import type { SttCaptionReviewReport } from '../../lib/editor/stt-caption-review';
import type { updateMarker } from '../../lib/editor/timeline';
import type { CaptionSegment, CaptionStyle, TimelineClip, TimelineMarker } from '../../lib/editor/types';
import { NumberField } from './editor-form-controls';
import { CaptionStyleControls } from './inspector-controls';

type FormatTimecode = (seconds: number, fps: number) => string;
type MarkerPatch = Parameters<typeof updateMarker>[2];

interface InspectorTechnicalPanelProps {
  clip: TimelineClip;
}

interface MarkerPanelProps {
  markers: TimelineMarker[];
  fps: number;
  markerLabel: string;
  onMarkerLabelChange: (value: string) => void;
  onAddMarkerAtPlayhead: () => void;
  onJumpAdjacentMarker: (direction: 'previous' | 'next') => void;
  onJumpToMarker: (markerId: string) => void;
  onMoveMarkerToPlayhead: (markerId: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onMarkerPatch: (markerId: string, patch: MarkerPatch) => void;
  formatTimecode: FormatTimecode;
}

interface CaptionEditorPanelProps {
  captions: CaptionSegment[];
  selectedCaptionIds: string[];
  fps: number;
  projectHeight: number;
  captionFileInputRef: RefObject<HTMLInputElement>;
  captionSpeakerDraft: string;
  captionTightenGap: number;
  sttCaptionReview: SttCaptionReviewReport;
  speakerDiarizationReport: SpeakerDiarizationReport;
  onAddCaption: () => void;
  onGenerateCaptionDraft: () => void;
  onImportCaptionSidecar: () => void;
  onCaptionSidecarFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectSttCaptionIssues: () => void;
  onCleanSttCaptions: () => void;
  onDiarizeSpeakers: () => void;
  onMoveCaptionsToPlayhead: (captionIds?: string[]) => void;
  onSplitActiveCaption: () => void;
  onMergeSelectedCaptions: () => void;
  onDeleteSelectedCaptions: () => void;
  onNudgeSelectedCaptions: (deltaSeconds: number) => void;
  onCaptionSpeakerDraftChange: (value: string) => void;
  onApplyCaptionSpeaker: () => void;
  onCaptionTightenGapChange: (value: number) => void;
  onTightenSelectedCaptions: () => void;
  onJumpToCaption: (captionId: string) => void;
  onSelectCaption: (captionId: string, append?: boolean) => void;
  onDeleteCaption: (captionId: string) => void;
  onCaptionPatch: (captionId: string, patch: Partial<CaptionSegment>) => void;
  onCaptionStylePatch: (caption: CaptionSegment, patch: CaptionStyle) => void;
  formatTimecode: FormatTimecode;
}

export function InspectorTechnicalPanel({ clip }: InspectorTechnicalPanelProps) {
  return (
    <div className="rounded-md border border-ds-200 bg-surface p-3">
      <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Technical</h2>
      <dl className="mt-3 space-y-3 text-sm">
        <Readout label="Track" value={clip.trackId} />
        <Readout label="Asset" value={clip.assetId ?? 'none'} />
        <Readout label="Transition" value={clip.transitionOut?.type ?? 'cut'} />
        <Readout label="Keyframes" value={String(clip.keyframes.length)} />
      </dl>
    </div>
  );
}

export function MarkerPanel({
  markers,
  fps,
  markerLabel,
  onMarkerLabelChange,
  onAddMarkerAtPlayhead,
  onJumpAdjacentMarker,
  onJumpToMarker,
  onMoveMarkerToPlayhead,
  onDeleteMarker,
  onMarkerPatch,
  formatTimecode,
}: MarkerPanelProps) {
  return (
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Markers</h2>
        <div className="flex gap-2">
          <button type="button" className="text-xs text-ds-700 hover:text-accent-800" onClick={() => onJumpAdjacentMarker('previous')}>Prev</button>
          <button type="button" className="text-xs text-ds-700 hover:text-accent-800" onClick={() => onJumpAdjacentMarker('next')}>Next</button>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={markerLabel}
          onChange={(event) => onMarkerLabelChange(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm outline-none focus:border-accent-500"
        />
        <button
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm hover:border-accent-500"
          onClick={onAddMarkerAtPlayhead}
        >
          Add
        </button>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1 custom-scrollbar">
        {markers.length === 0 ? (
          <div className="rounded-md border border-ds-200 bg-paper p-3 text-xs text-ds-600">
            No markers
          </div>
        ) : markers.map((marker) => (
          <div key={marker.id} className="rounded-md border border-ds-200 bg-paper p-2 text-xs text-ds-700">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded border border-ds-200 px-2 py-1 tabular-nums text-meta text-accent-800 hover:border-accent-500"
                onClick={() => onJumpToMarker(marker.id)}
              >
                {formatTimecode(marker.time, fps)}
              </button>
              <button
                type="button"
                className="rounded border border-ds-200 px-2 py-1 text-meta hover:border-info-500"
                onClick={() => onMoveMarkerToPlayhead(marker.id)}
              >
                At playhead
              </button>
              <button
                type="button"
                className="text-danger-700 hover:text-danger-800"
                onClick={() => onDeleteMarker(marker.id)}
              >
                Delete
              </button>
            </div>
            <input
              defaultValue={marker.label}
              onBlur={(event) => onMarkerPatch(marker.id, { label: event.currentTarget.value })}
              className="mt-2 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
            />
            <textarea
              defaultValue={marker.note ?? ''}
              rows={2}
              onBlur={(event) => onMarkerPatch(marker.id, { note: event.currentTarget.value })}
              className="mt-2 w-full resize-none rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
            />
            <div className="mt-2 grid grid-cols-[1fr_1fr_88px_38px] gap-2">
              <input
                aria-label="Marker time"
                type="number"
                defaultValue={marker.time}
                step={1 / fps}
                min={0}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value)) {
                    onMarkerPatch(marker.id, { time: value });
                  }
                }}
                className="rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              />
              <input
                aria-label="Marker duration"
                type="number"
                defaultValue={marker.duration ?? ''}
                step={1 / fps}
                min={0}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (!value) {
                    onMarkerPatch(marker.id, { duration: 0 });
                    return;
                  }

                  const duration = Number(value);
                  if (Number.isFinite(duration)) {
                    onMarkerPatch(marker.id, { duration });
                  }
                }}
                className="rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              />
              <select
                defaultValue={marker.kind}
                onChange={(event) => onMarkerPatch(marker.id, { kind: event.currentTarget.value as TimelineMarker['kind'] })}
                className="rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
              >
                <option value="chapter">chapter</option>
                <option value="beat">beat</option>
                <option value="todo">todo</option>
                <option value="warning">warning</option>
              </select>
              <input
                aria-label="Marker color"
                type="color"
                defaultValue={marker.color}
                onChange={(event) => onMarkerPatch(marker.id, { color: event.currentTarget.value })}
                className="h-8 w-full rounded border border-ds-200 bg-surface"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CaptionEditorPanel({
  captions,
  selectedCaptionIds,
  fps,
  projectHeight,
  captionFileInputRef,
  captionSpeakerDraft,
  captionTightenGap,
  sttCaptionReview,
  speakerDiarizationReport,
  onAddCaption,
  onGenerateCaptionDraft,
  onImportCaptionSidecar,
  onCaptionSidecarFileChange,
  onSelectSttCaptionIssues,
  onCleanSttCaptions,
  onDiarizeSpeakers,
  onMoveCaptionsToPlayhead,
  onSplitActiveCaption,
  onMergeSelectedCaptions,
  onDeleteSelectedCaptions,
  onNudgeSelectedCaptions,
  onCaptionSpeakerDraftChange,
  onApplyCaptionSpeaker,
  onCaptionTightenGapChange,
  onTightenSelectedCaptions,
  onJumpToCaption,
  onSelectCaption,
  onDeleteCaption,
  onCaptionPatch,
  onCaptionStylePatch,
  formatTimecode,
}: CaptionEditorPanelProps) {
  return (
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Captions</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="text-xs text-accent-700 hover:text-accent-800" onClick={onAddCaption}>Add</button>
          <button className="text-xs text-info-700 hover:text-info-800" onClick={onGenerateCaptionDraft}>Draft</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={onImportCaptionSidecar}>Import</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={onSelectSttCaptionIssues}>STT Issues</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={onCleanSttCaptions}>Clean STT</button>
          <button className="text-xs text-info-700 hover:text-info-800" onClick={onDiarizeSpeakers}>Diarize</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={() => onMoveCaptionsToPlayhead()}>At playhead</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={onSplitActiveCaption}>Split</button>
          <button className="text-xs text-ds-700 hover:text-accent-800" onClick={onMergeSelectedCaptions}>Merge</button>
        </div>
      </div>
      {sttCaptionReview.captionCount > 0 ? (
        <div className="mt-2 grid grid-cols-4 gap-2 text-meta text-ds-700">
          <span>STT {sttCaptionReview.captionCount}</span>
          <span>Issues {sttCaptionReview.issueCount}</span>
          <span>Low conf {sttCaptionReview.lowConfidenceCount}</span>
          <span>Words {sttCaptionReview.wordTimedCaptionCount}</span>
        </div>
      ) : null}
      {speakerDiarizationReport.captionCount > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-meta text-ds-700 sm:grid-cols-6">
          <span>Speakers {speakerDiarizationReport.speakerCount}</span>
          <span>Turns {speakerDiarizationReport.turnCount}</span>
          <span>Missing {speakerDiarizationReport.missingSpeakerCount}</span>
          <span>Draft {speakerDiarizationReport.changedCaptionCount}</span>
          <span>Embed {speakerDiarizationReport.embeddingCaptionCount}</span>
          <span>Review {speakerDiarizationReport.embeddingAmbiguousCaptionCount + speakerDiarizationReport.embeddingLowSimilarityCaptionCount}</span>
        </div>
      ) : null}
      <input
        ref={captionFileInputRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
        className="hidden"
        onChange={onCaptionSidecarFileChange}
      />
      {selectedCaptionIds.length > 0 ? (
        <div className="mt-2 space-y-2 text-meta text-ds-600">
          <div className="flex items-center justify-between gap-2">
            <span>
              {selectedCaptionIds.length} caption{selectedCaptionIds.length > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              onClick={onDeleteSelectedCaptions}
              className="text-danger-700 hover:text-danger-800"
            >
              Delete selected
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <CaptionNudgeButton label="-1f" onClick={() => onNudgeSelectedCaptions(-1 / Math.max(1, fps))} />
            <CaptionNudgeButton label="+1f" onClick={() => onNudgeSelectedCaptions(1 / Math.max(1, fps))} />
            <CaptionNudgeButton label="-0.1s" onClick={() => onNudgeSelectedCaptions(-0.1)} />
            <CaptionNudgeButton label="+0.1s" onClick={() => onNudgeSelectedCaptions(0.1)} />
          </div>
          <div className="grid grid-cols-[1fr_104px] items-end gap-2">
            <label className="text-ds-600">
              Speaker
              <input
                value={captionSpeakerDraft}
                onChange={(event) => onCaptionSpeakerDraftChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplyCaptionSpeaker();
                  }
                }}
                placeholder="Speaker"
                className="mt-1 w-full rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ink outline-none focus:border-accent-500"
              />
            </label>
            <button
              type="button"
              onClick={onApplyCaptionSpeaker}
              className="rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-accent-500"
            >
              Apply
            </button>
          </div>
          {selectedCaptionIds.length > 1 ? (
            <div className="grid grid-cols-[1fr_92px] items-end gap-2">
              <NumberField
                label="Caption gap"
                value={captionTightenGap}
                step={0.01}
                min={0}
                max={2}
                onChange={onCaptionTightenGapChange}
              />
              <button
                type="button"
                onClick={onTightenSelectedCaptions}
                className="rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-accent-500"
              >
                Tighten
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 max-h-64 space-y-3 overflow-auto pr-1 custom-scrollbar">
        {captions.length === 0 ? (
          <div className="rounded-md border border-ds-200 bg-paper p-3 text-xs text-ds-600">
            No captions
          </div>
        ) : captions.map((caption) => (
          <CaptionEditorItem
            key={caption.id}
            caption={caption}
            selected={selectedCaptionIds.includes(caption.id)}
            fps={fps}
            projectHeight={projectHeight}
            onJumpToCaption={onJumpToCaption}
            onSelectCaption={onSelectCaption}
            onMoveCaptionsToPlayhead={onMoveCaptionsToPlayhead}
            onDeleteCaption={onDeleteCaption}
            onCaptionPatch={onCaptionPatch}
            onCaptionStylePatch={onCaptionStylePatch}
            formatTimecode={formatTimecode}
          />
        ))}
      </div>
    </div>
  );
}

function CaptionEditorItem({
  caption,
  selected,
  fps,
  projectHeight,
  onJumpToCaption,
  onSelectCaption,
  onMoveCaptionsToPlayhead,
  onDeleteCaption,
  onCaptionPatch,
  onCaptionStylePatch,
  formatTimecode,
}: {
  caption: CaptionSegment;
  selected: boolean;
  fps: number;
  projectHeight: number;
  onJumpToCaption: (captionId: string) => void;
  onSelectCaption: (captionId: string, append?: boolean) => void;
  onMoveCaptionsToPlayhead: (captionIds?: string[]) => void;
  onDeleteCaption: (captionId: string) => void;
  onCaptionPatch: (captionId: string, patch: Partial<CaptionSegment>) => void;
  onCaptionStylePatch: (caption: CaptionSegment, patch: CaptionStyle) => void;
  formatTimecode: FormatTimecode;
}) {
  return (
    <div
      className={`rounded-md border p-2 text-xs text-ds-700 ${
        selected
          ? 'border-accent-500 bg-accent-500/10'
          : 'border-ds-200 bg-paper'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-ds-200 px-2 py-1 tabular-nums text-meta text-accent-800 hover:border-accent-500"
            onClick={() => onJumpToCaption(caption.id)}
          >
            {formatTimecode(caption.start, fps)}
          </button>
          <button
            type="button"
            className="rounded border border-ds-200 px-2 py-1 text-meta hover:border-accent-500"
            onClick={() => onSelectCaption(caption.id)}
          >
            Select
          </button>
          <button
            type="button"
            className="rounded border border-ds-200 px-2 py-1 text-meta hover:border-accent-500"
            onClick={() => onSelectCaption(caption.id, true)}
          >
            Multi
          </button>
          <button
            type="button"
            className="rounded border border-ds-200 px-2 py-1 text-meta hover:border-info-500"
            onClick={() => onMoveCaptionsToPlayhead([caption.id])}
          >
            At playhead
          </button>
        </div>
        <button
          type="button"
          className="text-danger-700 hover:text-danger-800"
          onClick={() => onDeleteCaption(caption.id)}
        >
          Delete
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CaptionTimeInput
          label="Start"
          value={caption.start}
          fps={fps}
          onChange={(value) => onCaptionPatch(caption.id, { start: value })}
        />
        <CaptionTimeInput
          label="End"
          value={caption.end}
          fps={fps}
          onChange={(value) => onCaptionPatch(caption.id, { end: value })}
        />
      </div>
      <label className="mt-2 block text-ds-600">
        Speaker
        <input
          defaultValue={caption.speaker ?? ''}
          onBlur={(event) => onCaptionPatch(caption.id, { speaker: event.currentTarget.value })}
          className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
        />
      </label>
      <textarea
        defaultValue={caption.text}
        onBlur={(event) => onCaptionPatch(caption.id, { text: event.currentTarget.value })}
        className="mt-2 min-h-16 w-full resize-y rounded border border-ds-200 bg-surface px-2 py-2 text-ink outline-none focus:border-accent-500"
      />
      <CaptionStyleControls
        caption={caption}
        projectHeight={projectHeight}
        onChange={(patch) => onCaptionStylePatch(caption, patch)}
      />
    </div>
  );
}

function CaptionTimeInput({
  label,
  value,
  fps,
  onChange,
}: {
  label: string;
  value: number;
  fps: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-ds-600">
      {label}
      <input
        type="number"
        defaultValue={value}
        step={1 / fps}
        min={0}
        onBlur={(event) => {
          const nextValue = Number(event.currentTarget.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className="mt-1 w-full rounded border border-ds-200 bg-surface px-2 py-1 text-ink outline-none focus:border-accent-500"
      />
    </label>
  );
}

function CaptionNudgeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-ds-200 bg-paper px-2 py-2 text-xs text-ds-800 hover:border-info-500"
    >
      {label}
    </button>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ds-600">{label}</dt>
      <dd className="truncate text-ds-800">{value}</dd>
    </div>
  );
}
