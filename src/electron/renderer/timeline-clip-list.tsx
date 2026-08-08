import type { MouseEvent } from 'react';
import { resolveTimelineThumbnailSource } from '../../lib/editor/preview-source';
import { resolveTimelineClipWaveformPeaks, shouldRenderTimelineAudioWaveform } from '../../lib/editor/timeline-waveform';
import type { EditorAsset, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import { resolveAssetRuntimeWaveformPeaks, resolveAssetWaveformPeaks } from '../../lib/editor/waveform-cache';
import type { TimelineClipEditPreview } from './editor-view-model';
import { TimelineClipButton } from './timeline-clip-button';
import { resolveTimelineClipDisplayAssetKind } from './timeline-clip-kind';
import { filterTimelineClipsForRender, type TimelineWorkspaceRange } from './timeline-workspace-helpers';

export function TimelineClipList({
  track,
  tracks,
  assetById,
  audioPeaksByAssetId,
  selectedClipIds,
  visibleTimeRange,
  showWaveforms,
  showThumbnails,
  trackHeight,
  pixelsPerSecond,
  getScrollLeft,
  isTrackPlayable,
  onSelectClip,
  onContextMenuClip,
  onMoveClip,
  onMoveClipDrop,
  onDragPointer,
  onDragPreview,
  onTrimPointer,
  onPreviewMove,
  onPreviewTrim,
  onPreviewRollTrim,
  onPreviewSlip,
  onPreviewSlide,
  onPreviewGuide,
  onRollTrim,
  onSlip,
  onSlide,
  onTransitionDuration,
  onKeyframeTime,
  onVolumeChange,
  onTrim,
}: {
  track: TimelineTrack;
  tracks: TimelineTrack[];
  assetById: Map<string, EditorAsset>;
  audioPeaksByAssetId: Record<string, number[]>;
  selectedClipIds: string[];
  visibleTimeRange?: TimelineWorkspaceRange;
  showWaveforms: boolean;
  showThumbnails: boolean;
  trackHeight: number;
  pixelsPerSecond: number;
  getScrollLeft: () => number;
  isTrackPlayable: (track: TimelineTrack, tracks: TimelineTrack[]) => boolean;
  onSelectClip: (event: MouseEvent<HTMLButtonElement>, clip: TimelineClip) => void;
  onContextMenuClip: (event: MouseEvent<HTMLButtonElement>, clip: TimelineClip) => void;
  onMoveClip: (clip: TimelineClip, nextStart: number) => void;
  onMoveClipDrop: (clip: TimelineClip, nextStart: number, clientY: number) => void;
  onDragPointer: (clip: TimelineClip, clientX: number | null, clientY?: number) => void;
  onDragPreview: (clip: TimelineClip, nextStart: number, clientY: number) => void;
  onTrimPointer: (clientX: number | null) => void;
  onPreviewMove: (clip: TimelineClip, nextStart: number) => TimelineClipEditPreview;
  onPreviewTrim: (clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewRollTrim: (clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewSlip: (clip: TimelineClip, deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewSlide: (clip: TimelineClip, deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewGuide: (clip: TimelineClip, preview: TimelineClipEditPreview | null, edge?: 'start' | 'end') => void;
  onRollTrim: (clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number) => void;
  onSlip: (clip: TimelineClip, deltaSeconds: number) => void;
  onSlide: (clip: TimelineClip, deltaSeconds: number) => void;
  onTransitionDuration: (clip: TimelineClip, duration: number) => void;
  onKeyframeTime: (clip: TimelineClip, keyframeId: string, time: number) => void;
  onVolumeChange: (clip: TimelineClip, volume: number) => void;
  onTrim: (clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number) => void;
}) {
  const selectedClipIdSet = new Set(selectedClipIds);
  const playable = isTrackPlayable(track, tracks);
  const clips = visibleTimeRange
    ? filterTimelineClipsForRender(track.clips, visibleTimeRange, selectedClipIds)
    : track.clips;

  return (
    <>
      {clips.map((clip) => {
        const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
        const assetWaveformPeaks = resolveAssetWaveformPeaks(
          asset,
          resolveAssetRuntimeWaveformPeaks(asset, audioPeaksByAssetId),
        ).peaks;
        const audioPeaks = resolveTimelineClipWaveformPeaks({ clip, asset, peaks: assetWaveformPeaks });

        return (
          <TimelineClipButton
            key={clip.id}
            clip={clip}
            asset={asset}
            assetKind={resolveTimelineClipDisplayAssetKind(clip, asset)}
            thumbnailSource={showThumbnails ? resolveTimelineThumbnailSource(asset, clip.kind) : undefined}
            audioPeaks={audioPeaks}
            showAudioWaveform={showWaveforms && shouldRenderTimelineAudioWaveform({ clip, asset, peaks: assetWaveformPeaks })}
            trackHeight={trackHeight}
            pixelsPerSecond={pixelsPerSecond}
            selected={selectedClipIdSet.has(clip.id)}
            muted={Boolean(track.muted || clip.muted || !playable)}
            locked={Boolean(track.locked || clip.locked)}
            getScrollLeft={getScrollLeft}
            onSelect={(event) => {
              event.stopPropagation();
              onSelectClip(event, clip);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenuClip(event, clip);
            }}
            onMove={(nextStart) => onMoveClip(clip, nextStart)}
            onMoveDrop={(nextStart, clientY) => onMoveClipDrop(clip, nextStart, clientY)}
            onDragPointer={(clientX, clientY) => onDragPointer(clip, clientX, clientY)}
            onDragPreview={(nextStart, clientY) => onDragPreview(clip, nextStart, clientY)}
            onTrimPointer={onTrimPointer}
            onPreviewMove={(nextStart) => onPreviewMove(clip, nextStart)}
            onPreviewTrim={(edge, deltaSeconds) => onPreviewTrim(clip, edge, deltaSeconds)}
            onPreviewRollTrim={(edge, deltaSeconds) => onPreviewRollTrim(clip, edge, deltaSeconds)}
            onPreviewSlip={(deltaSeconds) => onPreviewSlip(clip, deltaSeconds)}
            onPreviewSlide={(deltaSeconds) => onPreviewSlide(clip, deltaSeconds)}
            onPreviewGuide={(preview, edge) => onPreviewGuide(clip, preview, edge)}
            onRollTrim={(edge, deltaSeconds) => onRollTrim(clip, edge, deltaSeconds)}
            onSlip={(deltaSeconds) => onSlip(clip, deltaSeconds)}
            onSlide={(deltaSeconds) => onSlide(clip, deltaSeconds)}
            onTransitionDuration={(duration) => onTransitionDuration(clip, duration)}
            onKeyframeTime={(keyframeId, time) => onKeyframeTime(clip, keyframeId, time)}
            onVolumeChange={(volume) => onVolumeChange(clip, volume)}
            onTrim={(edge, deltaSeconds) => onTrim(clip, edge, deltaSeconds)}
          />
        );
      })}
    </>
  );
}
