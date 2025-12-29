import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComfyUIClient } from '../../src/lib/comfyui-client';

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

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8188/history/test-prompt-123');
      expect(result.status).toBeDefined();
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
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8188/system_stats');
    });

    it('should return false when server is unreachable', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });
  });
});
