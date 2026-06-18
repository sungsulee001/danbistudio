import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  buildProgramAudioFftLayerSample,
  buildProgramAudioFftSample,
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
  const audioLayerIds = useMemo(() => stack.audioLayers.map(buildProgramAudioLayerId), [stack.audioLayers]);
  const audioLayerSignature = audioLayerIds.join('|');
  const emitFftSample = useCallback(() => {
    onFftSample?.(buildProgramAudioFftSample(Object.values(layerSamplesRef.current), {
      sourceLayerCount: stack.audioLayers.length,
    }));
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
          onFftLayerSample={handleFftLayerSample}
          onFftLayerEnd={handleFftLayerEnd}
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
  const source = resolvePreviewMediaSource(layer.asset).source;
  const layerId = buildProgramAudioLayerId(layer);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) {
      return;
    }

    const monitorState = resolveProgramAudioMonitorState(layer, playbackRate, active);
    audio.muted = false;
    audio.playbackRate = monitorState.playbackRate > 0 ? monitorState.playbackRate : 1;

    try {
      if (Math.abs(audio.currentTime - monitorState.seekTime) > 0.18) {
        audio.currentTime = monitorState.seekTime;
      }
    } catch {
      // The element may reject seeks before metadata is ready.
    }

    const graph = ensureProgramAudioGraph(audio, graphRef);
    if (graph) {
      graph.gain.gain.setTargetAtTime(monitorState.gain, graph.context.currentTime, 0.015);
      graph.panner?.pan.setTargetAtTime(monitorState.pan, graph.context.currentTime, 0.015);
      audio.volume = 1;
    } else {
      audio.volume = Math.min(1, monitorState.gain);
    }

    if (!isPlaying || !monitorState.canPlay || monitorState.gain <= 0) {
      audio.pause();
      return;
    }

    if (graph?.context.state === 'suspended') {
      void graph.context.resume().catch(() => undefined);
    }

    if (audio.paused) {
      void audio.play().catch(() => undefined);
    }
  }, [active, isPlaying, layer, layer.clip.id, layer.clip.reversed, layer.clip.speed, layer.localTime, layer.style.pan, layer.style.volume, playbackRate, source]);

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

  return <audio ref={audioRef} src={source} preload="auto" />;
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
