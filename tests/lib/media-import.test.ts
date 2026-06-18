import { describe, expect, it } from 'vitest';

import { addImportedMediaAsset } from '../../src/lib/editor/media-import';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('editor media import', () => {
  it('infers supported media kind from exact MIME before extension fallback', () => {
    const project = createDefaultEditorProject();
    const imported = addImportedMediaAsset(project, {
      name: 'voiceover.webm',
      mimeType: 'audio/webm',
      size: 1024,
      source: 'local://voiceover.webm',
      renderPath: 'E:/media/voiceover.webm',
      duration: 8,
    });

    expect(imported.assets.at(-1)).toMatchObject({
      name: 'voiceover.webm',
      kind: 'audio',
      duration: 8,
    });
    expect(addImportedMediaAsset(project, {
      name: 'voiceover-codecs.webm',
      mimeType: 'audio/webm;codecs=opus',
      size: 1024,
      source: 'local://voiceover-codecs.webm',
      renderPath: 'E:/media/voiceover-codecs.webm',
      duration: 5,
    }).assets.at(-1)).toMatchObject({
      name: 'voiceover-codecs.webm',
      kind: 'audio',
      metadata: {
        mimeType: 'audio/webm;codecs=opus',
      },
    });

    const analyzedWebm = addImportedMediaAsset(project, {
      name: 'analyzed-voice.webm',
      mimeType: 'video/webm',
      size: 2048,
      source: 'local://analyzed-voice.webm',
      renderPath: 'E:/media/analyzed-voice.webm',
      duration: 6,
      metadata: {
        hasVideo: false,
        hasAudio: true,
      },
    });

    expect(analyzedWebm.assets.at(-1)).toMatchObject({
      name: 'analyzed-voice.webm',
      kind: 'audio',
      metadata: {
        mimeType: 'video/webm',
        hasAudio: true,
      },
    });
  });

  it('rejects unsupported broad image MIME imports while preserving extension fallback', () => {
    const project = createDefaultEditorProject();

    expect(addImportedMediaAsset(project, {
      name: 'camera.qt',
      mimeType: 'application/octet-stream',
      size: 2048,
      source: 'local://camera.qt',
      renderPath: 'E:/media/camera.qt',
      duration: 12,
    }).assets.at(-1)).toMatchObject({
      name: 'camera.qt',
      kind: 'video',
      duration: 12,
    });
    expect(addImportedMediaAsset(project, {
      name: 'voice.bin',
      mimeType: 'application/octet-stream',
      size: 1024,
      source: 'local://voice.bin',
      renderPath: 'E:/media/voice.bin',
      duration: 4,
      metadata: {
        mimeType: 'audio/webm;codecs=opus',
      },
    }).assets.at(-1)).toMatchObject({
      name: 'voice.bin',
      kind: 'audio',
      metadata: {
        mimeType: 'audio/webm;codecs=opus',
      },
    });
    expect(() => addImportedMediaAsset(project, {
      name: 'vector.svg',
      mimeType: 'image/svg+xml',
      size: 1024,
      source: 'local://vector.svg',
      renderPath: 'E:/media/vector.svg',
    })).toThrow('Unsupported media type for vector.svg: image/svg+xml.');
    expect(() => addImportedMediaAsset(project, {
      name: 'spoofed.png',
      mimeType: 'image/svg+xml',
      size: 1024,
      source: 'local://spoofed.png',
      renderPath: 'E:/media/spoofed.png',
      metadata: {
        hasVideo: true,
        hasAudio: false,
      },
    })).toThrow('Unsupported media type for spoofed.png: image/svg+xml.');
    expect(() => addImportedMediaAsset(project, {
      name: 'metadata-spoofed.png',
      mimeType: 'application/octet-stream',
      size: 1024,
      source: 'local://metadata-spoofed.png',
      renderPath: 'E:/media/metadata-spoofed.png',
      metadata: {
        mimeType: 'image/svg+xml',
        hasVideo: true,
      },
    })).toThrow('Unsupported media type for metadata-spoofed.png: image/svg+xml.');
  });
});
