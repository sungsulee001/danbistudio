import { describe, expect, it } from 'vitest';

import { importCmx3600EdlText, importFcpxmlText, importTimelineMarkersText } from '../../src/electron/renderer/interchange-client';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('renderer interchange client', () => {
  it('uses bounded HTTP requests for interchange imports', async () => {
    const project = createDefaultEditorProject();
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        const path = String(input);
        const body = path.includes('/edl')
          ? { imported: { project, events: [], warnings: [] } }
          : path.includes('/fcpxml')
            ? { imported: { project, clips: [], markers: [], warnings: [] } }
            : { imported: { format: 'youtube-chapters', markers: [], warnings: [], markerCount: 0 } };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(importCmx3600EdlText({ content: 'TITLE: Danbi\nFCM: NON-DROP FRAME\n' })).resolves.toMatchObject({
        project: {
          id: project.id,
        },
        events: [],
      });
      await expect(importFcpxmlText({ content: '<fcpxml version="1.10"></fcpxml>' })).resolves.toMatchObject({
        project: {
          id: project.id,
        },
        clips: [],
      });
      await expect(importTimelineMarkersText({ content: '00:00 Intro' })).resolves.toMatchObject({
        format: 'youtube-chapters',
        markerCount: 0,
      });

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/edl',
        '/api/editor/fcpxml',
        '/api/editor/markers',
      ]);
      expect(calls.every((call) => call.init?.signal instanceof AbortSignal)).toBe(true);
      expect(calls.some((call) => 'timeoutMs' in (call.init as Record<string, unknown>))).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
