import { PanelTitle } from './editor-panel-title';
import { resolveAudioAnalyzerReadout, type ProgramAudioAnalyzerSample } from '../../lib/editor/audio-analyzer';
import { resolveAudioMeterReadout, type AudioMeterSample, type AudioMeterStatus } from '../../lib/editor/audio-meter';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import type { TimelineClip } from '../../lib/editor/types';
import type { VideoScopeReadout, VideoScopeReadoutStatus } from '../../lib/editor/video-scopes';

export function SceneReadoutPanel({
  stack,
  audioMeter,
  audioAnalysis,
  videoScopeReadout,
  selectedClip,
  selectedClipCount,
  activeMonitor,
  sourcePlaybackRate,
  timelinePlaybackRate,
  className = '',
}: {
  stack: ProgramPreviewStack;
  audioMeter: AudioMeterSample;
  audioAnalysis: ProgramAudioAnalyzerSample;
  videoScopeReadout?: VideoScopeReadout | null;
  selectedClip?: TimelineClip;
  selectedClipCount: number;
  activeMonitor: 'source' | 'program';
  sourcePlaybackRate: number;
  timelinePlaybackRate: number;
  className?: string;
}) {
  const title = stack.primaryLayer?.clip.name ?? selectedClip?.name ?? 'No selection';
  const monitorRate = activeMonitor === 'source' ? sourcePlaybackRate : timelinePlaybackRate;
  const audioReadout = resolveAudioMeterReadout(audioMeter);
  const analyzerReadout = resolveAudioAnalyzerReadout(audioAnalysis);

  return (
    <div className={`rounded-md border border-zinc-800 bg-zinc-950 p-4 ${className}`.trim()}>
      <PanelTitle
        eyebrow="Scene"
        title={title}
        eyebrowClassName="text-xs uppercase tracking-wide text-emerald-400"
        titleClassName="mt-1 text-lg font-semibold text-zinc-50"
        titleElement="h2"
      />
      <dl className="mt-4 space-y-3 text-sm">
        <Readout label="Start" value={`${selectedClip?.start ?? 0}s`} />
        <Readout label="Length" value={`${selectedClip?.duration ?? 0}s`} />
        <Readout label="Type" value={selectedClip?.kind ?? 'none'} />
        <Readout label="Tags" value={selectedClip?.automationTags.join(', ') || 'none'} />
        <Readout label="Selection" value={`${selectedClipCount} clip${selectedClipCount === 1 ? '' : 's'}`} />
        <Readout label="Preview layers" value={`${stack.visualLayers.length} visual / ${stack.audioLayers.length} audio`} />
        <Readout label="Video scope" value={formatVideoScopeSceneReadout(videoScopeReadout)} valueClassName={videoScopeReadoutClassName(videoScopeReadout?.status ?? 'pending')} />
        <Readout label="Audio peak" value={audioReadout.label} valueClassName={audioReadoutClassName(audioReadout.status)} />
        <Readout label="Audio meter" value={audioReadout.warning ?? audioReadout.detail} valueClassName={audioReadout.status === 'clipping' ? 'text-rose-300' : undefined} />
        <Readout label="Analyzer" value={analyzerReadout.warning ?? analyzerReadout.detail} valueClassName={analyzerReadout.status === 'balanced' || analyzerReadout.status === 'live' ? 'text-emerald-200' : analyzerReadout.warning ? 'text-amber-200' : 'text-zinc-300'} />
        <Readout label="Monitor" value={`${activeMonitor} ${formatPlaybackRate(monitorRate)}`} />
      </dl>
    </div>
  );
}

export function formatVideoScopeSceneReadout(readout?: VideoScopeReadout | null): string {
  if (!readout || readout.status === 'pending') {
    return 'No sampled frame';
  }

  const detail = readout.warning ?? readout.detail;
  return `${readout.label}: ${detail}`;
}

function Readout({ label, value, valueClassName = 'text-zinc-200' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`truncate text-right ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function formatPlaybackRate(rate: number): string {
  if (rate === 0) {
    return 'paused';
  }

  return `${rate > 0 ? '+' : ''}${rate}x`;
}

function videoScopeReadoutClassName(status: VideoScopeReadoutStatus): string {
  switch (status) {
    case 'balanced':
      return 'text-emerald-200';
    case 'clipped':
      return 'font-semibold text-rose-300';
    case 'underexposed':
    case 'overexposed':
    case 'low-contrast':
      return 'font-semibold text-amber-200';
    case 'pending':
    default:
      return 'text-zinc-400';
  }
}

function audioReadoutClassName(status: AudioMeterStatus): string {
  switch (status) {
    case 'clipping':
      return 'font-semibold text-rose-300';
    case 'hot':
      return 'font-semibold text-amber-200';
    case 'nominal':
      return 'text-emerald-200';
    default:
      return 'text-zinc-400';
  }
}
