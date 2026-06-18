import { describe, expect, it } from 'vitest';

import { createEditorNativeFileService } from '../../src/electron/main/native-file-service';

describe('native file service', () => {
  it('opens normal absolute filesystem paths through the shell bridge', async () => {
    const openedPaths: string[] = [];
    const service = createEditorNativeFileService({
      async openPath(path) {
        openedPaths.push(path);
        return '';
      },
      showItemInFolder(path) {
        openedPaths.push(path);
      },
    });

    await expect(service.openPath({ path: 'E:/renders/final.mp4' })).resolves.toEqual({
      ok: true,
      path: 'E:/renders/final.mp4',
    });
    await expect(service.revealInFolder({ path: 'E:/renders/final.mp4' })).resolves.toEqual({
      ok: true,
      path: 'E:/renders/final.mp4',
    });
    expect(openedPaths).toEqual([
      'E:/renders/final.mp4',
      'E:/renders/final.mp4',
    ]);
  });

  it('rejects Windows device namespace paths before calling the shell bridge', async () => {
    const openedPaths: string[] = [];
    const service = createEditorNativeFileService({
      async openPath(path) {
        openedPaths.push(path);
        return '';
      },
      showItemInFolder(path) {
        openedPaths.push(path);
      },
    });

    await expect(service.openPath({ path: '\\\\.\\pipe\\danbi-render-worker' })).resolves.toMatchObject({
      ok: false,
      error: 'Native file actions cannot open Windows device namespace paths.',
    });
    await expect(service.revealInFolder({ path: '\\\\?\\C:\\Windows\\System32\\cmd.exe' })).resolves.toMatchObject({
      ok: false,
      error: 'Native file actions cannot open Windows device namespace paths.',
    });
    expect(openedPaths).toEqual([]);
  });
});
