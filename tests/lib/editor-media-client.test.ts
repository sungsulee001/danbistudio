import { describe, expect, it, vi } from 'vitest';

import { pruneRetainedBrowserMediaObjectUrls, readAudioPeaks, readMediaInput, revokeRetainedBrowserMediaObjectUrls, selectAndImportNativeMediaFiles, uploadLutFile, uploadMediaFiles } from '../../src/electron/renderer/editor-media-client';

describe('renderer editor media client', () => {
  it('revokes retained browser media object URLs that are no longer referenced by assets', () => {
    const revoked: string[] = [];
    const retained = pruneRetainedBrowserMediaObjectUrls([
      'blob:keep-source',
      'blob:remove',
      'blob:keep-render-path',
    ], [
      'blob:keep-source',
      undefined,
      'blob:keep-render-path',
    ], (objectUrl) => {
      revoked.push(objectUrl);
    });

    expect(retained).toEqual(['blob:keep-source', 'blob:keep-render-path']);
    expect(revoked).toEqual(['blob:remove']);
  });

  it('revokes all retained browser media object URLs on editor cleanup', () => {
    const revoked: string[] = [];

    revokeRetainedBrowserMediaObjectUrls([
      'blob:first',
      'blob:second',
    ], (objectUrl) => {
      revoked.push(objectUrl);
    });

    expect(revoked).toEqual(['blob:first', 'blob:second']);
  });

  it('uses a bounded HTTP request for browser media upload fallback', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({
          files: [
            {
              originalName: 'clip.mp4',
              name: 'clip.mp4',
              source: '/imports/clip.mp4',
              renderPath: 'E:/danbi/imports/clip.mp4',
              size: 128,
              mimeType: 'video/mp4',
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(uploadMediaFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ])).resolves.toMatchObject([
        {
          source: '/imports/clip.mp4',
          renderPath: 'E:/danbi/imports/clip.mp4',
        },
      ]);

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/media');
      expect(calls[0].init?.method).toBe('POST');
      expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect('timeoutMs' in (calls[0].init as Record<string, unknown>)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('rejects media upload responses without renderable file references', async () => {
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response(JSON.stringify({
        files: [
          {
            originalName: 'clip.mp4',
            name: 'clip.mp4',
            source: '/imports/clip.mp4',
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    try {
      await expect(uploadMediaFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ])).rejects.toThrow('Media upload returned an unusable or unsupported file reference at index 0.');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('rejects upload responses with explicit unsupported metadata MIME despite generic response MIME', async () => {
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response(JSON.stringify({
        files: [
          {
            originalName: 'spoofed.png',
            name: 'spoofed.png',
            mimeType: 'application/octet-stream',
            source: '/imports/spoofed.png',
            renderPath: 'E:/danbi/imports/spoofed.png',
            metadata: {
              mimeType: 'image/svg+xml',
              hasVideo: true,
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    try {
      await expect(uploadMediaFiles([
        new File(['svg'], 'spoofed.png', { type: 'application/octet-stream' }),
      ])).rejects.toThrow('Media upload returned an unusable or unsupported file reference at index 0.');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('skips unusable native import references without dropping valid media or sidecars', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        danbiEditor: {
          media: {
            selectAndImport: async () => ({
              canceled: false,
              files: [
                {
                  originalName: 'camera.mp4',
                  name: 'camera.mp4',
                  mimeType: 'video/mp4',
                  size: 128,
                  source: '/imports/camera.mp4',
                  renderPath: 'E:/danbi/imports/camera.mp4',
                },
                {
                  originalName: 'notes.pdf',
                  name: 'notes.pdf',
                  mimeType: 'application/pdf',
                  size: 128,
                  source: '/imports/notes.pdf',
                  renderPath: 'E:/danbi/imports/notes.pdf',
                },
              ],
              sidecars: [
                {
                  originalName: 'captions.vtt',
                  content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nCaption',
                },
                {
                  originalName: 'caption-upload',
                  mimeType: 'Text/VTT; charset=utf-8',
                  content: 'WEBVTT\n\n00:01.000 --> 00:02.000\nCaption',
                },
                {
                  originalName: 'caption-metadata',
                  content: '1\n00:00:02,000 --> 00:00:03,000\nCaption',
                  metadata: {
                    mimeType: 'application/x-subrip; charset=utf-8',
                  },
                },
                {
                  originalName: 'broken.vtt',
                  mimeType: 'text/vtt',
                },
                {
                  originalName: 'notes.txt',
                  mimeType: 'text/plain',
                  content: 'not a subtitle sidecar',
                },
                {
                  originalName: 'spoofed.vtt',
                  mimeType: 'application/pdf',
                  content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nCaption',
                },
              ],
              warnings: ['Native import completed with warnings.'],
            }),
          },
        },
      },
    });

    try {
      await expect(selectAndImportNativeMediaFiles()).resolves.toMatchObject({
        available: true,
        canceled: false,
        files: [
          {
            originalName: 'camera.mp4',
            source: '/imports/camera.mp4',
            renderPath: 'E:/danbi/imports/camera.mp4',
          },
        ],
        sidecars: [
          {
            originalName: 'captions.vtt',
            mimeType: 'text/vtt',
            size: 39,
          },
          {
            originalName: 'caption-upload',
            mimeType: 'Text/VTT; charset=utf-8',
            size: 39,
          },
          {
            originalName: 'caption-metadata',
            mimeType: 'application/x-subrip; charset=utf-8',
            size: 39,
          },
        ],
        warnings: [
          'Native import completed with warnings.',
          'Native media import skipped unusable or unsupported media file reference at index 1.',
          'Native media import skipped unusable subtitle sidecar reference at index 3.',
          'Native media import skipped unusable subtitle sidecar reference at index 4.',
          'Native media import skipped unusable subtitle sidecar reference at index 5.',
        ],
      });
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('does not read browser metadata for unsupported broad image MIME files', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

    Reflect.deleteProperty(globalThis, 'document');

    try {
      await expect(readMediaInput(
        new File(['<svg />'], 'vector.svg', { type: 'image/svg+xml' }),
        'blob:vector',
      )).resolves.toEqual({
        name: 'vector.svg',
        mimeType: 'image/svg+xml',
        size: 7,
        source: 'blob:vector',
      });
      await expect(readMediaInput(
        new File(['<svg />'], 'spoofed.png', { type: 'image/svg+xml' }),
        'blob:spoofed',
      )).resolves.toEqual({
        name: 'spoofed.png',
        mimeType: 'image/svg+xml',
        size: 7,
        source: 'blob:spoofed',
      });
    } finally {
      if (previousDocument) {
        Object.defineProperty(globalThis, 'document', previousDocument);
      }
    }
  });

  it('reads audio metadata for parameterized audio WebM files before ambiguous extension fallback', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const createdTags: string[] = [];

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: (tagName: string) => {
          createdTags.push(tagName);
          return {
            duration: 2.5,
            videoWidth: 0,
            videoHeight: 0,
            preload: '',
            onloadedmetadata: null as null | (() => void),
            onerror: null as null | (() => void),
            removeAttribute: vi.fn(),
            load: vi.fn(),
            set src(_value: string) {
              setTimeout(() => this.onloadedmetadata?.(), 0);
            },
          };
        },
      },
    });

    try {
      await expect(readMediaInput(
        new File(['voice'], 'voiceover.webm', { type: 'audio/webm;codecs=opus' }),
        'blob:voiceover',
      )).resolves.toMatchObject({
        name: 'voiceover.webm',
        mimeType: 'audio/webm;codecs=opus',
        duration: 2.5,
      });
      expect(createdTags).toEqual(['audio']);
    } finally {
      if (previousDocument) {
        Object.defineProperty(globalThis, 'document', previousDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('uses bounded HTTP requests for LUT upload fallback', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({
          lut: {
            originalName: 'look.cube',
            name: 'look.cube',
            source: '/luts/look.cube',
            renderPath: 'E:/danbi/luts/look.cube',
            size: 128,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(uploadLutFile(new File(['LUT_3D_SIZE 2'], 'look.cube', {
        type: 'text/plain',
      }))).resolves.toMatchObject({
        source: '/luts/look.cube',
        renderPath: 'E:/danbi/luts/look.cube',
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/luts');
      expect(calls[0].init?.method).toBe('POST');
      expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect('timeoutMs' in (calls[0].init as Record<string, unknown>)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('aborts stalled audio peak fetches without decoding audio', async () => {
    const previousFetch = globalThis.fetch;
    const abortSignals: AbortSignal[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          abortSignals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('audio peaks aborted')), { once: true });
        }
      }),
    });

    try {
      await expect(readAudioPeaks('/cache/audio.wav', 64, {
        fetchTimeoutMs: 1,
      })).rejects.toThrow('audio peaks aborted');
      expect(abortSignals).toHaveLength(1);
      expect(abortSignals[0].aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('honors external abort signals while reading audio peaks', async () => {
    const previousFetch = globalThis.fetch;
    const controller = new AbortController();
    const abortSignals: AbortSignal[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          abortSignals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('audio peaks externally aborted')), { once: true });
        }
      }),
    });

    try {
      const readPromise = readAudioPeaks('/cache/audio.wav', 64, {
        fetchTimeoutMs: 10000,
        signal: controller.signal,
      });
      controller.abort();

      await expect(readPromise).rejects.toThrow('audio peaks externally aborted');
      expect(abortSignals).toHaveLength(1);
      expect(abortSignals[0].aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('closes the audio context when audio peak decoding fails', async () => {
    const previousFetch = globalThis.fetch;
    const globalWithAudioContext = globalThis as typeof globalThis & { AudioContext?: unknown };
    const previousAudioContext = globalWithAudioContext.AudioContext;
    let closeCalled = false;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response(new Uint8Array([1, 2, 3]).buffer),
    });
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: class {
        async decodeAudioData() {
          throw new Error('decode failed');
        }

        async close() {
          closeCalled = true;
        }
      },
    });

    try {
      await expect(readAudioPeaks('/cache/bad-audio.wav', 64, {
        fetchTimeoutMs: 1000,
      })).rejects.toThrow('decode failed');
      expect(closeCalled).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
      if (previousAudioContext === undefined) {
        Reflect.deleteProperty(globalWithAudioContext, 'AudioContext');
      } else {
        Object.defineProperty(globalThis, 'AudioContext', {
          configurable: true,
          value: previousAudioContext,
        });
      }
    }
  });
});
