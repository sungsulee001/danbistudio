/**
 * ComfyUI Client Library
 *
 * Provides methods to interact with ComfyUI REST API
 */

export interface ComfyUIClientConfig {
  baseUrl: string;
}

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface PromptStatus {
  status: string;
  outputs?: any;
}

export class ComfyUIClient {
  private baseUrl: string;

  constructor(config: ComfyUIClientConfig) {
    this.baseUrl = config.baseUrl;
  }

  /**
   * Queue a workflow prompt to ComfyUI
   */
  async queuePrompt(workflow: object, clientId: string = 'danbistudio'): Promise<QueuePromptResponse> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get the status of a queued prompt
   */
  async getPromptStatus(promptId: string): Promise<PromptStatus> {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`);

    if (!response.ok) {
      throw new Error(`Failed to get prompt status: ${response.statusText}`);
    }

    const history = await response.json();
    const promptData = history[promptId];

    if (!promptData) {
      throw new Error(`Prompt ${promptId} not found in history`);
    }

    return {
      status: promptData.status?.status_str || 'unknown',
      outputs: promptData.outputs
    };
  }

  /**
   * Check if ComfyUI server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Default client instance
export const comfyuiClient = new ComfyUIClient({
  baseUrl: process.env.COMFYUI_URL || 'http://localhost:8188'
});
