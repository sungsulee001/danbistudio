import { describe, expect, it } from 'vitest';
import { POST } from '../../src/app/api/editor/markers/route';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/editor/markers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/editor/markers', () => {
  it('exports marker CSV and YouTube chapters from a project', async () => {
    const csvResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      format: 'csv',
    }) as never);
    const csvData = await csvResponse.json();
    const chapterResponse = await POST(createJsonRequest({
      mode: 'export',
      project: createDefaultEditorProject(),
      format: 'youtube-chapters',
    }) as never);
    const chapterData = await chapterResponse.json();

    expect(csvResponse.status).toBe(200);
    expect(csvData.markers).toMatchObject({
      format: 'csv',
      filename: 'Danbi-Studio-AI-Edit.markers.csv',
      mimeType: 'text/csv;charset=utf-8',
      markerCount: 3,
    });
    expect(csvData.markers.content).toContain('timecode,seconds,label,kind,color');
    expect(csvData.markers.content).toContain('Hook');

    expect(chapterResponse.status).toBe(200);
    expect(chapterData.markers).toMatchObject({
      format: 'youtube-chapters',
      filename: 'Danbi-Studio-AI-Edit.chapters.txt',
      mimeType: 'text/plain;charset=utf-8',
      markerCount: 1,
    });
    expect(chapterData.markers.content).toContain('0:00 Hook');
    expect(chapterData.markers.warnings).toEqual(expect.arrayContaining([
      '2 non-chapter markers were skipped for YouTube chapters.',
    ]));
  });

  it('imports marker CSV or chapter text', async () => {
    const csvResponse = await POST(createJsonRequest({
      mode: 'import',
      format: 'csv',
      content: 'timecode,seconds,label,kind,color\n00:00:10:00,10,Act 1,chapter,#22c55e\n',
    }) as never);
    const csvData = await csvResponse.json();
    const chapterResponse = await POST(createJsonRequest({
      mode: 'import',
      format: 'auto',
      content: '0:00 Intro\n1:15 Demo\n',
    }) as never);
    const chapterData = await chapterResponse.json();

    expect(csvResponse.status).toBe(200);
    expect(csvData.imported).toMatchObject({
      format: 'csv',
      markerCount: 1,
      markers: [
        {
          time: 10,
          label: 'Act 1',
          kind: 'chapter',
          color: '#22c55e',
        },
      ],
    });

    expect(chapterResponse.status).toBe(200);
    expect(chapterData.imported).toMatchObject({
      format: 'youtube-chapters',
      markerCount: 2,
    });
    expect(chapterData.imported.markers[1]).toMatchObject({
      time: 75,
      label: 'Demo',
      kind: 'chapter',
    });
  });

  it('returns 400 for invalid marker requests', async () => {
    const invalidExport = await POST(createJsonRequest({
      mode: 'export',
      project: {
        id: 'bad-project',
        name: 'Bad Project',
        schemaVersion: 99,
        tracks: [],
      },
      format: 'csv',
    }) as never);
    const invalidExportData = await invalidExport.json();
    const invalidImport = await POST(createJsonRequest({
      mode: 'import',
      format: 'csv',
      content: '',
    }) as never);
    const invalidImportData = await invalidImport.json();

    expect(invalidExport.status).toBe(400);
    expect(invalidExportData.error).toContain('Cannot export markers because the project JSON is invalid');
    expect(invalidImport.status).toBe(400);
    expect(invalidImportData.error).toBe('Marker content is required.');
  });
});
