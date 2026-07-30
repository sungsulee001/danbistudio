import { describe, expect, it } from 'vitest';
import {
  CLIP_VOLUME_MAX_DB,
  CLIP_VOLUME_MIN_DB,
  clipVolumeDbToGain,
  formatClipVolumeDb,
  normalizeClipVolumeDb,
} from '../../src/lib/editor/audio-mixer';
import { buildFfmpegRenderPlan } from '../../src/lib/editor/ffmpeg-renderer';
import { createDefaultEditorProject } from '../../src/lib/editor/project';
import { migrateEditorProject } from '../../src/lib/editor/project-store';
import { buildProgramPreviewStack } from '../../src/lib/editor/preview';
import { validateProjectJson } from '../../src/electron/shared/project-schema';
import type { EditorProject } from '../../src/lib/editor/types';

const AUDIO_CLIP_ID = 'clip-music-1';

function audioFilterFor(project: EditorProject, clipId: string): string | undefined {
  const plan = buildFfmpegRenderPlan(project, 'profile-youtube-4k', 'renders/volume-db.mp4');
  const input = plan.inputs.find((item) => item.clipId === clipId);
  if (!input) return undefined;
  const filter = plan.filterGraph.find((line) => line.startsWith(`[${input.index}:a]`));
  return filter?.match(/volume='([^']*)'/)?.[1];
}

function withClipVolumeDb(volumeDb: number | undefined): EditorProject {
  const project = createDefaultEditorProject();
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (
        clip.id === AUDIO_CLIP_ID ? { ...clip, volumeDb } : clip
      )),
    })),
  };
}

describe('clip volumeDb (per-clip gain)', () => {
  it('converts dB to a linear gain and treats "unset" as unity', () => {
    expect(clipVolumeDbToGain(undefined)).toBe(1);
    expect(clipVolumeDbToGain(null)).toBe(1);
    expect(clipVolumeDbToGain(0)).toBe(1);
    // 생성형 SFX 게인표의 양 극단 (03-assets §A3 게인: -14.6 ~ +15.4dB)
    expect(clipVolumeDbToGain(15.4)).toBeCloseTo(5.888, 3);
    expect(clipVolumeDbToGain(-14.6)).toBeCloseTo(0.186, 3);
    // 하한은 완전 무음
    expect(clipVolumeDbToGain(CLIP_VOLUME_MIN_DB)).toBe(0);
  });

  it('clamps to the clip gain domain and formats with a sign', () => {
    expect(normalizeClipVolumeDb(999)).toBe(CLIP_VOLUME_MAX_DB);
    expect(normalizeClipVolumeDb(-999)).toBe(CLIP_VOLUME_MIN_DB);
    expect(normalizeClipVolumeDb('nope')).toBe(0);
    expect(formatClipVolumeDb(3.5)).toBe('+3.5 dB');
    expect(formatClipVolumeDb(-14.6)).toBe('-14.6 dB');
  });

  it('represents gains that linear clip volume cannot (volume is capped at 2.0)', () => {
    // +15.4dB = 5.888배 — clip.volume(0~2)로는 표현할 수 없다. 이것이 클립 게인 필드의 존재 이유다.
    expect(clipVolumeDbToGain(15.4)).toBeGreaterThan(2);
  });

  it('passes the clip gain into the FFmpeg audio graph', () => {
    const expression = audioFilterFor(withClipVolumeDb(15.4), AUDIO_CLIP_ID);
    expect(expression).toBeDefined();
    expect(expression).toContain('5.888');
  });

  it('leaves the audio graph untouched when no clip gain is set', () => {
    const baseline = audioFilterFor(createDefaultEditorProject(), AUDIO_CLIP_ID);
    const unset = audioFilterFor(withClipVolumeDb(undefined), AUDIO_CLIP_ID);
    const zeroDb = audioFilterFor(withClipVolumeDb(0), AUDIO_CLIP_ID);
    expect(unset).toBe(baseline);
    // 0dB = 1배이므로 그래프 표현식도 변하지 않아야 한다(불필요한 곱셈 금지)
    expect(zeroDb).toBe(baseline);
  });

  it('applies the clip gain to preview volume as well (preview/render parity)', () => {
    const loud = buildProgramPreviewStack(withClipVolumeDb(6), 2);
    const plain = buildProgramPreviewStack(createDefaultEditorProject(), 2);
    const loudLayer = loud.audioLayers.find((layer) => layer.clip.id === AUDIO_CLIP_ID);
    const plainLayer = plain.audioLayers.find((layer) => layer.clip.id === AUDIO_CLIP_ID);
    expect(loudLayer).toBeDefined();
    expect(plainLayer).toBeDefined();
    expect(loudLayer!.style.volume).toBeCloseTo(plainLayer!.style.volume * clipVolumeDbToGain(6), 3);
  });

  it('validates clip volumeDb in the project schema and rejects out-of-range values', () => {
    expect(validateProjectJson(withClipVolumeDb(24)).ok).toBe(true);
    expect(validateProjectJson(withClipVolumeDb(-96)).ok).toBe(true);

    const tooLoud = validateProjectJson(withClipVolumeDb(48));
    expect(tooLoud.ok).toBe(false);
    expect(tooLoud.errors.join(' ')).toContain('volumeDb');
  });

  it('keeps the serialized clip shape unchanged when volumeDb is absent', () => {
    const migrated = migrateEditorProject(createDefaultEditorProject());
    const clip = migrated.tracks
      .flatMap((track) => track.clips)
      .find((item) => item.id === AUDIO_CLIP_ID)!;
    expect('volumeDb' in clip).toBe(false);

    const kept = migrateEditorProject(withClipVolumeDb(-10.5));
    const keptClip = kept.tracks
      .flatMap((track) => track.clips)
      .find((item) => item.id === AUDIO_CLIP_ID)!;
    expect(keptClip.volumeDb).toBe(-10.5);
  });
});
