import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildProgramAudioFftLayerSample,
  buildProgramAudioFftSample,
  shouldEmitProgramAudioFftSample,
  type ProgramAudioFftLayerSample,
  type ProgramAudioFftSample,
} from '../../lib/editor/audio-analyzer';
import { resolveProgramAudioMonitorState } from '../../lib/editor/audio-monitor';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import { resolvePreviewMediaSource } from '../../lib/editor/preview-source';

interface ProgramAudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  panner: StereoPannerNode | null;
  frequencyData?: Uint8Array<ArrayBuffer>;
}

type ProgramAudioOutputMode = 'blocked' | 'native' | 'web-audio';

interface ProgramAudioPlaybackDiagnostic {
  outputMode: ProgramAudioOutputMode;
  contextState: AudioContextState | 'none';
  playError: string;
}

let sharedProgramAudioContext: AudioContext | null = null;

export function ProgramAudioMixer({
  stack,
  isPlaying,
  playbackRate,
  active,
  onFftSample,
}: {
  stack: ProgramPreviewStack;
  isPlaying: boolean;
  playbackRate: number;
  active: boolean;
  onFftSample?: (sample: ProgramAudioFftSample) => void;
}) {
  const layerSamplesRef = useRef<Record<string, ProgramAudioFftLayerSample>>({});
  const lastEmitRef = useRef<{ at: number; sample: ProgramAudioFftSample | null }>({ at: 0, sample: null });
  const audioLayerIds = useMemo(() => stack.audioLayers.map(buildProgramAudioLayerId), [stack.audioLayers]);
  const audioLayerSignature = audioLayerIds.join('|');
  const emitFftSample = useCallback(() => {
    if (!onFftSample) {
      return;
    }

    const sample = buildProgramAudioFftSample(Object.values(layerSamplesRef.current), {
      sourceLayerCount: stack.audioLayers.length,
    });
    const now = Date.now();
    if (!shouldEmitProgramAudioFftSample({
      previous: lastEmitRef.current.sample,
      next: sample,
      lastEmitAt: lastEmitRef.current.at,
      now,
    })) {
      return;
    }

    lastEmitRef.current = { at: now, sample };
    onFftSample(sample);
  }, [onFftSample, stack.audioLayers.length]);
  const handleFftLayerSample = useCallback((sample: ProgramAudioFftLayerSample) => {
    layerSamplesRef.current[sample.layerId] = sample;
    emitFftSample();
  }, [emitFftSample]);
  const handleFftLayerEnd = useCallback((layerId: string) => {
    if (!layerSamplesRef.current[layerId]) {
      return;
    }

    delete layerSamplesRef.current[layerId];
    emitFftSample();
  }, [emitFftSample]);

  useEffect(() => {
    const activeLayerIds = new Set(audioLayerIds);
    let changed = false;
    for (const layerId of Object.keys(layerSamplesRef.current)) {
      if (!activeLayerIds.has(layerId)) {
        delete layerSamplesRef.current[layerId];
        changed = true;
      }
    }

    if (changed || stack.audioLayers.length === 0) {
      emitFftSample();
    }
  }, [audioLayerIds, audioLayerSignature, emitFftSample, stack.audioLayers.length]);

  if (stack.audioLayers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden="true">
      {stack.audioLayers.map((layer) => (
        <ProgramAudioLayerPreview
          key={buildProgramAudioLayerId(layer)}
          layer={layer}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          active={active}
          onFftLayerSample={onFftSample ? handleFftLayerSample : undefined}
          onFftLayerEnd={onFftSample ? handleFftLayerEnd : undefined}
        />
      ))}
    </div>
  );
}

function ProgramAudioLayerPreview({
  layer,
  isPlaying,
  playbackRate,
  active,
  onFftLayerSample,
  onFftLayerEnd,
}: {
  layer: ProgramPreviewStack['audioLayers'][number];
  isPlaying: boolean;
  playbackRate: number;
  active: boolean;
  onFftLayerSample?: (sample: ProgramAudioFftLayerSample) => void;
  onFftLayerEnd?: (layerId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const graphRef = useRef<ProgramAudioGraph | null>(null);
  const [playbackDiagnostic, setPlaybackDiagnostic] = useState<ProgramAudioPlaybackDiagnostic>({
    outputMode: 'blocked',
    contextState: 'none',
    playError: '',
  });
  const source = resolvePreviewMediaSource(layer.asset).source;
  const layerId = buildProgramAudioLayerId(layer);
  const monitorState = resolveProgramAudioMonitorState(layer, playbackRate, active);
  const monitorCanPlay = monitorState.canPlay;
  const monitorGain = monitorState.gain;
  const monitorPan = monitorState.pan;
  const monitorPlaybackRate = monitorState.playbackRate;
  const monitorSeekTime = monitorState.seekTime;
  const updatePlaybackDiagnostic = useCallback((nextDiagnostic: ProgramAudioPlaybackDiagnostic) => {
    setPlaybackDiagnostic((current) => (
      current.outputMode === nextDiagnostic.outputMode
      && current.contextState === nextDiagnostic.contextState
      && current.playError === nextDiagnostic.playError
        ? current
        : nextDiagnostic
    ));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) {
      return;
    }

    let cancelled = false;
    audio.muted = false;
    audio.playbackRate = monitorPlaybackRate > 0 ? monitorPlaybackRate : 1;

    try {
      if (Math.abs(audio.currentTime - monitorSeekTime) > 0.18) {
        audio.currentTime = monitorSeekTime;
      }
    } catch {
      // The element may reject seeks before metadata is ready.
    }

    audio.volume = Math.min(1, monitorGain);

    if (!isPlaying || !monitorCanPlay || monitorGain <= 0) {
      audio.pause();
      updatePlaybackDiagnostic({
        outputMode: 'blocked',
        contextState: graphRef.current?.context.state ?? 'none',
        playError: '',
      });
      return () => {
        cancelled = true;
      };
    }

    const existingGraph = graphRef.current;
    if (existingGraph?.context.state === 'running') {
      configureProgramAudioGraph(existingGraph, monitorGain, monitorPan);
      audio.volume = 1;
      updatePlaybackDiagnostic({
        outputMode: 'web-audio',
        contextState: existingGraph.context.state,
        playError: '',
      });
    } else {
      updatePlaybackDiagnostic({
        outputMode: 'native',
        contextState: existingGraph?.context.state ?? sharedProgramAudioContext?.state ?? 'none',
        playError: '',
      });
    }

    if (audio.paused) {
      void audio.play()
        .then(() => {
          if (!cancelled) {
            updatePlaybackDiagnostic({
              outputMode: graphRef.current?.context.state === 'running' ? 'web-audio' : 'native',
              contextState: graphRef.current?.context.state ?? sharedProgramAudioContext?.state ?? 'none',
              playError: '',
            });
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            updatePlaybackDiagnostic({
              outputMode: graphRef.current?.context.state === 'running' ? 'web-audio' : 'native',
              contextState: graphRef.current?.context.state ?? sharedProgramAudioContext?.state ?? 'none',
              playError: error instanceof Error ? error.name : 'playback-error',
            });
          }
        });
    }

    const context = existingGraph?.context ?? getSharedProgramAudioContext();
    if (!context) {
      return () => {
        cancelled = true;
      };
    }

    const prepareGraph = () => {
      if (cancelled) {
        return;
      }

      const graph = ensureProgramAudioGraph(audio, graphRef);
      if (!graph || graph.context.state !== 'running') {
        updatePlaybackDiagnostic({
          outputMode: 'native',
          contextState: graph?.context.state ?? context.state,
          playError: '',
        });
        audio.volume = Math.min(1, monitorGain);
        return;
      }

      configureProgramAudioGraph(graph, monitorGain, monitorPan);
      audio.volume = 1;
      updatePlaybackDiagnostic({
        outputMode: 'web-audio',
        contextState: graph.context.state,
        playError: '',
      });
    };

    if (context.state === 'running') {
      prepareGraph();
    } else {
      void context.resume()
        .then(prepareGraph)
        .catch(() => {
          if (!cancelled) {
            updatePlaybackDiagnostic({
              outputMode: 'native',
              contextState: context.state,
              playError: '',
            });
            audio.volume = Math.min(1, monitorGain);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    isPlaying,
    layer.clip.id,
    monitorCanPlay,
    monitorGain,
    monitorPan,
    monitorPlaybackRate,
    monitorSeekTime,
    source,
    updatePlaybackDiagnostic,
  ]);

  useEffect(() => {
    if (!onFftLayerSample || !onFftLayerEnd || !active || !isPlaying) {
      onFftLayerEnd?.(layerId);
      return;
    }

    let frameId = 0;
    let lastEmit = 0;
    let cancelled = false;
    const capture = (timestamp: number) => {
      if (cancelled) {
        return;
      }

      const graph = graphRef.current;
      if (graph) {
        if (!graph.frequencyData || graph.frequencyData.length !== graph.analyser.frequencyBinCount) {
          graph.frequencyData = new Uint8Array(graph.analyser.frequencyBinCount);
        }

        graph.analyser.getByteFrequencyData(graph.frequencyData);
        if (timestamp - lastEmit >= 120) {
          onFftLayerSample(buildProgramAudioFftLayerSample(layerId, graph.frequencyData));
          lastEmit = timestamp;
        }
      }

      frameId = window.requestAnimationFrame(capture);
    };

    frameId = window.requestAnimationFrame(capture);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      onFftLayerEnd(layerId);
    };
  }, [active, isPlaying, layerId, onFftLayerEnd, onFftLayerSample]);

  useEffect(() => () => {
    audioRef.current?.pause();
    disconnectProgramAudioGraph(graphRef.current);
    graphRef.current = null;
    onFftLayerEnd?.(layerId);
  }, [layerId, onFftLayerEnd]);

  if (!source) {
    return null;
  }

  return (
    <audio
      ref={audioRef}
      src={source}
      preload="auto"
      data-testid={`program-audio-layer-${layer.clip.id}`}
      data-audio-layer-id={layerId}
      data-audio-asset-id={layer.asset.id}
      data-audio-clip-id={layer.clip.id}
      data-audio-can-play={monitorState.canPlay ? 'true' : 'false'}
      data-audio-gain={monitorState.gain}
      data-audio-pan={monitorState.pan}
      data-audio-playback-rate={monitorState.playbackRate}
      data-audio-seek-time={monitorState.seekTime}
      data-audio-reason={monitorState.reason ?? ''}
      data-audio-output-mode={playbackDiagnostic.outputMode}
      data-audio-context-state={playbackDiagnostic.contextState}
      data-audio-play-error={playbackDiagnostic.playError}
    />
  );
}

function configureProgramAudioGraph(graph: ProgramAudioGraph, gain: number, pan: number) {
  graph.gain.gain.setTargetAtTime(gain, graph.context.currentTime, 0.015);
  graph.panner?.pan.setTargetAtTime(pan, graph.context.currentTime, 0.015);
}

function ensureProgramAudioGraph(
  audio: HTMLAudioElement,
  graphRef: { current: ProgramAudioGraph | null },
): ProgramAudioGraph | null {
  if (graphRef.current) {
    return graphRef.current;
  }

  try {
    const context = getSharedProgramAudioContext();
    if (!context) {
      return null;
    }

    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    const analyser = context.createAnalyser();
    const panner = typeof context.createStereoPanner === 'function'
      ? context.createStereoPanner()
      : null;

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;

    source.connect(gain);
    gain.connect(analyser);
    if (panner) {
      analyser.connect(panner);
      panner.connect(context.destination);
    } else {
      analyser.connect(context.destination);
    }

    graphRef.current = { context, source, gain, analyser, panner };
    return graphRef.current;
  } catch {
    return null;
  }
}

function getSharedProgramAudioContext(): AudioContext | null {
  if (sharedProgramAudioContext) {
    return sharedProgramAudioContext;
  }

  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  sharedProgramAudioContext = new AudioContextConstructor();
  return sharedProgramAudioContext;
}

function disconnectProgramAudioGraph(graph: ProgramAudioGraph | null) {
  if (!graph) {
    return;
  }

  for (const node of [graph.source, graph.gain, graph.analyser, graph.panner]) {
    try {
      node?.disconnect();
    } catch {
      // The node may already be disconnected during React teardown.
    }
  }
}

function buildProgramAudioLayerId(layer: ProgramPreviewStack['audioLayers'][number]): string {
  return `${layer.trackId}:${layer.clip.id}`;
}
