import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { resolve as resolvePath } from 'node:path';
import {
  ComfyUIClient,
  parseComfyUIAllowlist,
  readComfyUIClientConfig,
  validateComfyUIBaseUrl,
} from '../../src/lib/comfyui-client';
import { extractOutputPath, resolveComfyUIOutputPath } from '../../src/lib/result-handler';

/**
 * Phase 2 GREEN: ComfyUI Client Library Tests
 *
 * This tests the production ComfyUI client that will be used by the Next.js app
 */

// Mock fetch for unit testing
global.fetch = vi.fn();

describe('Phase 2: ComfyUI Client Library', () => {
  let client: ComfyUIClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ComfyUIClient({ baseUrl: 'http://localhost:8188' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('queuePrompt', () => {
    it('should call the correct endpoint with proper format', async () => {
      const mockResponse = {
        prompt_id: 'test-prompt-123',
        number: 1
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const workflow = { "1": { "inputs": {}, "class_type": "TestNode" } };
      const result = await client.queuePrompt(workflow, 'test-client');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8188/prompt',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: workflow,
            client_id: 'test-client'
          })
        })
      );

      expect(result.prompt_id).toBe('test-prompt-123');
      expect(result.number).toBe(1);
    });

    it('should throw error when API call fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        text: async () => 'Error details'
      });

      const workflow = { "1": { "inputs": {}, "class_type": "TestNode" } };

      await expect(client.queuePrompt(workflow)).rejects.toThrow();
    });

    it('aborts slow prompt queue requests after the configured timeout', async () => {
      vi.useFakeTimers();
      client = new ComfyUIClient({
        baseUrl: 'http://localhost:8188',
        queueTimeoutMs: 25,
      });
      (global.fetch as any).mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => (
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        })
      ));

      const request = expect(client.queuePrompt({})).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(25);

      await request;
    });

    it('forwards parent abort signals to prompt queue requests', async () => {
      const controller = new AbortController();
      const abortSignals: AbortSignal[] = [];
      (global.fetch as any).mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) {
          abortSignals.push(init.signal);
        }

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      });

      const request = expect(client.queuePrompt({}, 'test-client', {
        signal: controller.signal,
        timeoutMs: 1000,
      })).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();

      await request;
      expect(abortSignals).toHaveLength(1);
      expect(abortSignals[0].aborted).toBe(true);
    });
  });

  describe('uploadImage', () => {
    it('uploads an image file to the ComfyUI input endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'reference.png',
          subfolder: '',
          type: 'input',
        }),
      });

      const result = await client.uploadImage(new Uint8Array([1, 2, 3]), {
        filename: 'reference.png',
        mimeType: 'image/png',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8188/upload/image',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
      const [, init] = (global.fetch as any).mock.calls[0];
      const body = init.body as FormData;
      expect(body.get('type')).toBe('input');
      expect(body.get('overwrite')).toBe('true');
      expect(body.get('image')).toBeInstanceOf(File);
      expect(result).toEqual({
        name: 'reference.png',
        subfolder: '',
        type: 'input',
      });
    });

    it('throws with ComfyUI response details when image upload fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        text: async () => 'bad image',
      });

      await expect(client.uploadImage(new Uint8Array([1]), {
        filename: 'bad.png',
        mimeType: 'image/png',
      })).rejects.toThrow('Failed to upload image to ComfyUI: Bad Request - bad image');
    });
  });

  describe('getPromptStatus', () => {
    it('should fetch status from /history endpoint', async () => {
      const mockHistory = {
        'test-prompt-123': {
          status: { status_str: 'success' },
          outputs: { '1': { images: [] } }
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory
      });

      const result = await client.getPromptStatus('test-prompt-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8188/history/test-prompt-123',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result.status).toBeDefined();
    });

    it('should encode prompt ids before building the history endpoint', async () => {
      const mockHistory = {
        'folder/prompt 123': {
          status: { status_str: 'success' },
          outputs: {},
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory
      });

      await client.getPromptStatus('folder/prompt 123');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8188/history/folder%2Fprompt%20123',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true when server responds', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ system: { os: 'win32' } })
      });

      const healthy = await client.isHealthy();

      expect(healthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8188/system_stats',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should return false when server is unreachable', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('ComfyUI network safety', () => {
    it('allows localhost by default and blocks remote servers without an allowlist', async () => {
      expect(validateComfyUIBaseUrl('http://127.0.0.1:8188')).toMatchObject({ ok: true });
      expect(validateComfyUIBaseUrl('http://localhost:8188')).toMatchObject({ ok: true });
      expect(validateComfyUIBaseUrl('https://remote.example.com:8188')).toEqual({
        ok: false,
        reason: 'ComfyUI target is not allowed. Use localhost/127.0.0.1, or add the server to COMFYUI_ALLOWED_URLS for explicit remote execution.',
      });
    });

    it('requires explicit allowlist entries before fetch reaches remote ComfyUI targets', async () => {
      const blockedClient = new ComfyUIClient({
        baseUrl: 'https://remote.example.com:8188',
      });
      const allowedClient = new ComfyUIClient({
        baseUrl: 'https://remote.example.com:8188',
        allowLocalhost: false,
        allowedUrls: ['https://remote.example.com:8188'],
      });

      await expect(blockedClient.queuePrompt({})).rejects.toThrow('ComfyUI target is not allowed');
      expect(global.fetch).not.toHaveBeenCalled();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'remote-prompt', number: 1 }),
      });

      await expect(allowedClient.queuePrompt({})).resolves.toMatchObject({
        prompt_id: 'remote-prompt',
      });
      expect(global.fetch).toHaveBeenCalledWith('https://remote.example.com:8188/prompt', expect.any(Object));
    });

    it('reads ComfyUI allowlist configuration from environment values', () => {
      expect(parseComfyUIAllowlist('https://a.example:8188, 10.0.0.2:8188')).toEqual([
        'https://a.example:8188',
        '10.0.0.2:8188',
      ]);
      expect(readComfyUIClientConfig({
        COMFYUI_URL: 'https://a.example:8188',
        COMFYUI_ALLOWED_URLS: 'https://a.example:8188',
        COMFYUI_ALLOW_LOCALHOST: '0',
      })).toEqual({
        baseUrl: 'https://a.example:8188',
        allowedUrls: ['https://a.example:8188'],
        allowLocalhost: false,
      });
    });
  });

  describe('ComfyUI output path safety', () => {
    it('keeps ComfyUI result filenames inside the configured output directory', () => {
      const outputRoot = resolvePath('E:/comfy/output');

      expect(resolveComfyUIOutputPath('result.png', outputRoot)).toBe(resolvePath(outputRoot, 'result.png'));
      expect(resolveComfyUIOutputPath('nested/result.png', outputRoot)).toBe(resolvePath(outputRoot, 'nested/result.png'));
      expect(() => resolveComfyUIOutputPath('../secret.png', outputRoot)).toThrow('escapes the output directory');
      expect(() => resolveComfyUIOutputPath('E:/outside/secret.png', outputRoot)).toThrow('must be relative');
      expect(() => resolveComfyUIOutputPath('https://example.com/secret.png', outputRoot)).toThrow('not a URL or protocol target');
      expect(() => resolveComfyUIOutputPath(`bad${String.fromCharCode(0)}name.png`, outputRoot)).toThrow('null bytes');
    });

    it('keeps ComfyUI output subfolders when resolving generated files', () => {
      const outputRoot = resolvePath('E:/comfy/output');
      const videoOutput = extractOutputPath({
        '9': {
          videos: [{ filename: 'ComfyVideo.mp4', subfolder: 'renders', type: 'output' }],
        },
      });
      const nestedVideoOutput = extractOutputPath({
        '9': {
          videos: [{ filename: 'renders/ComfyVideo.mp4', subfolder: 'renders', type: 'output' }],
        },
      });
      const imageOutput = extractOutputPath({
        '8': {
          images: [{ filename: 'Preview.png', subfolder: 'images', type: 'output' }],
        },
      });
      const unsafeOutput = extractOutputPath({
        '7': {
          images: [{ filename: 'secret.png', subfolder: '../private', type: 'output' }],
        },
      });

      expect(videoOutput).toBe('renders/ComfyVideo.mp4');
      expect(nestedVideoOutput).toBe('renders/ComfyVideo.mp4');
      expect(imageOutput).toBe('images/Preview.png');
      expect(resolveComfyUIOutputPath(videoOutput!, outputRoot)).toBe(resolvePath(outputRoot, 'renders', 'ComfyVideo.mp4'));
      expect(() => resolveComfyUIOutputPath(unsafeOutput!, outputRoot)).toThrow('escapes the output directory');
    });
  });
});
