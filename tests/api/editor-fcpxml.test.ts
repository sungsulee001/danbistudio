import { describe, expect, it } from 'vitest';
import { POST } from '../../src/app/api/editor/fcpxml/route';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/editor/fcpxml', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/editor/fcpxml', () => {
  it('exports a project as FCPXML', async () => {
    const response = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: {
        title: 'Client Master XML',
      },
      exportRange: {
        start: 0,
        end: 28,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.fcpxml).toMatchObject({
      filename: 'Client-Master-XML.fcpxml',
      mimeType: 'application/xml;charset=utf-8',
      title: 'Client Master XML',
      version: '1.10',
      clipCount: expect.any(Number),
      markerCount: expect.any(Number),
    });
    expect(data.fcpxml.content).toContain('<fcpxml version="1.10">');
    expect(data.fcpxml.content).toContain('<asset-clip');
    expect(data.fcpxml.content).toContain('data-danbi-track-id="track-v1"');

    const reservedResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: 'AUX' },
    }) as never);
    const reservedData = await reservedResponse.json();
    const fallbackResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: '...' },
    }) as never);
    const fallbackData = await fallbackResponse.json();

    expect(reservedData.fcpxml.filename).toBe('fcpxml-AUX.fcpxml');
    expect(fallbackData.fcpxml.filename).toBe('danbi-fcpxml.fcpxml');
  });

  it('imports FCPXML content into a Danbi project', async () => {
    const exportResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      options: { title: 'Import Source XML' },
      exportRange: { start: 0, end: 28 },
    }) as never);
    const exportData = await exportResponse.json();
    const importResponse = await POST(createJsonRequest({
      mode: 'import',
      content: exportData.fcpxml.content,
      options: {
        id: 'imported-api-fcpxml',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    }) as never);
    const importData = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(importData.imported.project).toMatchObject({
      id: 'imported-api-fcpxml',
      name: 'Import Source XML',
      updatedAt: '2026-06-15T00:00:00.000Z',
      fps: 30,
      width: 1920,
      height: 1080,
    });
    expect(importData.imported.project.tracks[0].clips[0]).toMatchObject({
      name: 'Founder intro',
      start: 0,
      duration: 28,
      sourceIn: 0,
    });
    expect(importData.imported.project.markers[0]).toMatchObject({
      label: 'Hook',
      time: 0,
      kind: 'chapter',
    });
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
    expect(invalidExportData.error).toContain('Cannot export FCPXML because the project JSON is invalid');
    expect(invalidExportData.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('schemaVersion'),
    ]));
    expect(invalidImport.status).toBe(400);
    expect(invalidImportData.error).toBe('FCPXML content is required.');
  });
});
