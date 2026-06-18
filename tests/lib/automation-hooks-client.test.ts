import { describe, expect, it } from 'vitest';

import { runAutomationHooks } from '../../src/electron/renderer/automation-hooks-client';
import type { EditorHookPlanView } from '../../src/electron/renderer/editor-view-model';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('renderer automation hooks client', () => {
  it('uses a bounded HTTP request for automation hook execution', async () => {
    const plan: EditorHookPlanView = {
      event: 'manual',
      matchedRuleCount: 0,
      actionCount: 0,
      actions: [],
      warnings: [],
    };
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify(plan), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(runAutomationHooks({
        project: createDefaultEditorProject(),
        event: 'manual',
        selectedClipIds: [],
        assetIds: [],
        priority: 5,
        queueComfyUI: false,
        executeComfyUI: false,
        applyLocalActions: false,
        executeWebhooks: false,
      })).resolves.toEqual(plan);

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/hooks');
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
});
