import { PanelTitle } from './editor-panel-title';
import { resolveAudioAnalyzerReadout, type ProgramAudioAnalyzerSample } from '../../lib/editor/audio-analyzer';
import { resolveAudioMeterReadout, type AudioMeterSample, type AudioMeterStatus } from '../../lib/editor/audio-meter';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import type { TimelineClip } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import type { VideoScopeReadout, VideoScopeReadoutStatus } from '../../lib/editor/video-scopes';
import { useMenuLanguage } from './use-menu-language';

const sceneReadoutText: Record<DanbiMenuLanguage, {
  analyzer: string;
  audio: string;
  audioMeter: string;
  audioPeak: string;
  clip: (count: number) => string;
  length: string;
  monitor: string;
  none: string;
  noSampledFrame: string;
  noSelection: string;
  paused: string;
  previewLayers: string;
  program: string;
  scene: string;
  selection: string;
  source: string;
  start: string;
  tags: string;
  type: string;
  videoScope: string;
  visual: string;
}> = {
  en: {
    analyzer: 'Analyzer',
    audio: 'audio',
    audioMeter: 'Audio meter',
    audioPeak: 'Audio peak',
    clip: (count) => `${count} clip${count === 1 ? '' : 's'}`,
    length: 'Length',
    monitor: 'Monitor',
    none: 'none',
    noSampledFrame: 'No sampled frame',
    noSelection: 'No selection',
    paused: 'paused',
    previewLayers: 'Preview layers',
    program: 'program',
    scene: 'Scene',
    selection: 'Selection',
    source: 'source',
    start: 'Start',
    tags: 'Tags',
    type: 'Type',
    videoScope: 'Video scope',
    visual: 'visual',
  },
  ko: {
    analyzer: '분석기',
    audio: '오디오',
    audioMeter: '오디오 미터',
    audioPeak: '오디오 피크',
    clip: (count) => `${count}개 클립`,
    length: '길이',
    monitor: '모니터',
    none: '없음',
    noSampledFrame: '샘플링된 프레임 없음',
    noSelection: '선택 없음',
    paused: '정지',
    previewLayers: '프리뷰 레이어',
    program: '프로그램',
    scene: '장면',
    selection: '선택',
    source: '소스',
    start: '시작',
    tags: '태그',
    type: '유형',
    videoScope: '비디오 스코프',
    visual: '비주얼',
  },
};

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
  const language = useMenuLanguage();
  const text = sceneReadoutText[language];
  const title = stack.primaryLayer?.clip.name ?? selectedClip?.name ?? text.noSelection;
  const monitorRate = activeMonitor === 'source' ? sourcePlaybackRate : timelinePlaybackRate;
  const audioReadout = resolveAudioMeterReadout(audioMeter);
  const analyzerReadout = resolveAudioAnalyzerReadout(audioAnalysis);

  return (
    <div className={`rounded-md border border-ds-200 bg-paper p-4 ${className}`.trim()}>
      <PanelTitle
        eyebrow={text.scene}
        title={title}
        eyebrowClassName="text-xs uppercase tracking-wide text-accent-600"
        titleClassName="mt-1 text-lg font-semibold text-ink"
        titleElement="h2"
      />
      <dl className="mt-4 space-y-3 text-sm">
        <Readout label={text.start} value={`${selectedClip?.start ?? 0}s`} />
        <Readout label={text.length} value={`${selectedClip?.duration ?? 0}s`} />
        <Readout label={text.type} value={selectedClip?.kind ?? text.none} />
        <Readout label={text.tags} value={selectedClip?.automationTags.join(', ') || text.none} />
        <Readout label={text.selection} value={text.clip(selectedClipCount)} />
        <Readout label={text.previewLayers} value={`${stack.visualLayers.length} ${text.visual} / ${stack.audioLayers.length} ${text.audio}`} />
        <Readout label={text.videoScope} value={formatVideoScopeSceneReadout(videoScopeReadout, language)} valueClassName={videoScopeReadoutClassName(videoScopeReadout?.status ?? 'pending')} />
        <Readout label={text.audioPeak} value={audioReadout.label} valueClassName={audioReadoutClassName(audioReadout.status)} />
        <Readout label={text.audioMeter} value={audioReadout.warning ?? audioReadout.detail} valueClassName={audioReadout.status === 'clipping' ? 'text-danger-700' : undefined} />
        <Readout label={text.analyzer} value={analyzerReadout.warning ?? analyzerReadout.detail} valueClassName={analyzerReadout.status === 'balanced' || analyzerReadout.status === 'live' ? 'text-accent-800' : analyzerReadout.warning ? 'text-warn-800' : 'text-ds-700'} />
        <Readout label={text.monitor} value={`${activeMonitor === 'source' ? text.source : text.program} ${formatPlaybackRate(monitorRate, language)}`} />
      </dl>
    </div>
  );
}

export function formatVideoScopeSceneReadout(readout?: VideoScopeReadout | null, language: DanbiMenuLanguage = 'en'): string {
  if (!readout || readout.status === 'pending') {
    return sceneReadoutText[language].noSampledFrame;
  }

  const detail = readout.warning ?? readout.detail;
  return `${readout.label}: ${detail}`;
}

function Readout({ label, value, valueClassName = 'text-ds-800' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ds-600">{label}</dt>
      <dd className={`truncate text-right ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function formatPlaybackRate(rate: number, language: DanbiMenuLanguage): string {
  if (rate === 0) {
    return sceneReadoutText[language].paused;
  }

  return `${rate > 0 ? '+' : ''}${rate}x`;
}

function videoScopeReadoutClassName(status: VideoScopeReadoutStatus): string {
  switch (status) {
    case 'balanced':
      return 'text-accent-800';
    case 'clipped':
      return 'font-semibold text-danger-700';
    case 'underexposed':
    case 'overexposed':
    case 'low-contrast':
      return 'font-semibold text-warn-800';
    case 'pending':
    default:
      return 'text-ds-700';
  }
}

function audioReadoutClassName(status: AudioMeterStatus): string {
  switch (status) {
    case 'clipping':
      return 'font-semibold text-danger-700';
    case 'hot':
      return 'font-semibold text-warn-800';
    case 'nominal':
      return 'text-accent-800';
    default:
      return 'text-ds-700';
  }
}
