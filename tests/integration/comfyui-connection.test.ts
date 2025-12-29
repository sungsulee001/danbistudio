import { describe, it, expect, beforeAll } from 'vitest';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';

interface SystemStats {
  system: {
    os: string;
    ram_total: number;
    ram_free: number;
    comfyui_version: string;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total?: number;
    vram_free?: number;
  }>;
}

interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

/**
 * ComfyUI Client for testing
 */
class ComfyUIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if ComfyUI is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get system statistics including GPU info
   */
  async getSystemStats(): Promise<SystemStats> {
    const response = await fetch(`${this.baseUrl}/system_stats`);

    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Queue a prompt to ComfyUI
   */
  async queuePrompt(workflow: object): Promise<QueuePromptResponse> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: 'test-client'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }
}

describe('Phase 1: ComfyUI Connection Tests', () => {
  let client: ComfyUIClient;

  beforeAll(() => {
    client = new ComfyUIClient(COMFYUI_URL);
  });

  describe('RED: ComfyUI Server Connection', () => {
    it('should return true when ComfyUI is running', async () => {
      const isRunning = await client.isRunning();
      expect(isRunning).toBe(true);
    });

    it('should return GPU info from system stats', async () => {
      const stats = await client.getSystemStats();

      expect(stats).toBeDefined();
      expect(stats.system).toBeDefined();
      expect(stats.devices).toBeDefined();
      expect(Array.isArray(stats.devices)).toBe(true);
      expect(stats.devices.length).toBeGreaterThan(0);

      // Check if GPU device exists
      const hasGPU = stats.devices.some(
        device => device.type === 'cuda' || device.type === 'mps'
      );
      expect(hasGPU).toBe(true);
    });

    it('should handle queuePrompt API call correctly', async () => {
      // Test that queuePrompt method can make API calls
      // We expect this to fail with validation error since we don't have a complete workflow
      // but it proves the API is accessible and responding
      const testWorkflow = {
        "1": {
          "inputs": {
            "width": 512,
            "height": 512,
            "batch_size": 1
          },
          "class_type": "EmptyLatentImage"
        }
      };

      try {
        await client.queuePrompt(testWorkflow);
        // If it succeeds, that's fine
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, check that we got a proper error response from ComfyUI
        // This proves the API is accessible and responding
        expect(error).toBeDefined();
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Failed to queue prompt');
        // The error should contain ComfyUI's error response
        expect(
          errorMessage.includes('invalid_prompt') ||
          errorMessage.includes('prompt_no_outputs') ||
          errorMessage.includes('node_errors')
        ).toBe(true);
      }
    });
  });
});
