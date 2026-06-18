import { describe, expect, it } from 'vitest';
import { POST } from '../../src/app/api/editor/edl/route';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/editor/edl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/editor/edl', () => {
  it('exports a project as CMX 3600 EDL', async () => {
    const response = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: {
        title: 'Client Master',
        fps: 30,
      },
      exportRange: {
        start: 0,
        end: 28,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.edl).toMatchObject({
      filename: 'Client-Master.edl',
      mimeType: 'text/plain;charset=utf-8',
      title: 'Client Master',
      fps: 30,
      eventCount: expect.any(Number),
    });
    expect(data.edl.content).toContain('TITLE: Client Master');
    expect(data.edl.content).toContain('FCM: NON-DROP FRAME');
    expect(data.edl.content).toContain('* FROM CLIP NAME: Founder intro');

    const reservedResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: 'CON' },
    }) as never);
    const reservedData = await reservedResponse.json();
    const fallbackResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: '...' },
    }) as never);
    const fallbackData = await fallbackResponse.json();

    expect(reservedData.edl.filename).toBe('edl-CON.edl');
    expect(fallbackData.edl.filename).toBe('danbi-edl.edl');
  });

  it('imports CMX 3600 EDL content into a Danbi project', async () => {
    const exportResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: 'Import Source' },
      exportRange: { start: 0, end: 28 },
    }) as never);
    const exportData = await exportResponse.json();
    const importResponse = await POST(createJsonRequest({
      mode: 'import',
      content: exportData.edl.content,
      options: {
        id: 'imported-api-edl',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    }) as never);
    const importData = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(importData.imported.project).toMatchObject({
      id: 'imported-api-edl',
      name: 'Import Source',
      updatedAt: '2026-06-15T00:00:00.000Z',
    });
    expect(importData.imported.project.tracks[0].clips[0]).toMatchObject({
      name: 'Founder intro',
      start: 0,
      duration: 28,
    });
    expect(importData.imported.warnings).toEqual(expect.arrayContaining([
      'Imported EDL media is offline placeholder media; relink source files before final render.',
    ]));
  });

  it('imports local EDL source file comments as render paths', async () => {
    const importResponse = await POST(createJsonRequest({
      mode: 'import',
      content: [
        'TITLE: Local Source API EDL',
        'FCM: NON-DROP FRAME',
        '001  AX       V     C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
        '* FROM CLIP NAME: Local API Shot',
        '* SOURCE FILE: file:///E:/media/local-api-shot.mov',
        '',
      ].join('\n'),
      options: {
        id: 'local-api-edl',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    }) as never);
    const importData = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(importData.imported.project.assets[0]).toMatchObject({
      name: 'Local API Shot',
      source: 'offline://edl/AX',
      renderPath: 'E:/media/local-api-shot.mov',
      metadata: {
        importedFromEdl: true,
        offlinePlaceholder: false,
        edlAutoRelinked: true,
        edlRelinkHint: 'local-api-shot.mov',
      },
    });
    expect(importData.imported.warnings).not.toContain('Imported EDL media is offline placeholder media; relink source files before final render.');
  });

  it('returns 400 for invalid project export and empty import content', async () => {
    const invalidExport = await POST(createJsonRequest({
      mode: 'export',
      project: {
        id: 'bad-project',
        name: 'Bad Project',
        schemaVersion: 99,
        tracks: [],
      },
    }) as never);
    const invalidExportData = await invalidExport.json();
    const invalidImport = await POST(createJsonRequest({
      mode: 'import',
      content: '',
    }) as never);
    const invalidImportData = await invalidImport.json();

    expect(invalidExport.status).toBe(400);
    expect(invalidExportData.error).toContain('Cannot export EDL because the project JSON is invalid');
    expect(invalidExportData.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('schemaVersion'),
    ]));
    expect(invalidImport.status).toBe(400);
    expect(invalidImportData.error).toBe('EDL content is required.');
  });
});
