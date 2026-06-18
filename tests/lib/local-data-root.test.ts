import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getAutosaveStorageRoot } from '../../src/server/autosave-storage';
import { getCacheStorageRoot } from '../../src/server/cache-storage';
import { getImportStorageRoot } from '../../src/server/import-storage';
import { getJobStorageRoot } from '../../src/server/job-storage';
import { getLocalDataRoot } from '../../src/server/local-data-root';
import { getOutputStorageRoot } from '../../src/server/output-storage';
import { getSttStorageRoot } from '../../src/server/stt-storage';

describe('local data root resolution', () => {
  it('keeps explicit rootDir calls scoped to that root', () => {
    const rootDir = 'E:/workspace/danbi';
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DANBI_LOCAL_DATA_ROOT: 'E:/external/local-data',
      DANBI_ELECTRON_USER_DATA: 'E:/external/user-data',
    };

    expect(getLocalDataRoot(rootDir, env)).toBe(join(rootDir, '.danbi'));
    expect(getAutosaveStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'autosave'));
    expect(getCacheStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'cache'));
    expect(getImportStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'imports'));
    expect(getJobStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'jobs'));
    expect(getOutputStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'outputs'));
    expect(getSttStorageRoot(rootDir)).toBe(join(rootDir, '.danbi', 'stt'));
  });

  it('prefers explicit local data env over Electron user data for default server calls', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DANBI_LOCAL_DATA_ROOT: 'E:/local-data',
      DANBI_ELECTRON_USER_DATA: 'E:/user-data',
    };

    expect(getLocalDataRoot(undefined, env)).toBe(join('E:/local-data'));
  });

  it('uses Electron user data for default server storage when no explicit data root is set', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DANBI_ELECTRON_USER_DATA: 'E:/user-data',
    };

    expect(getLocalDataRoot(undefined, env)).toBe(join('E:/user-data'));
  });

  it('rejects unsafe configured local data roots before resolving storage paths', () => {
    expect(() => getLocalDataRoot(undefined, {
      NODE_ENV: 'test',
      DANBI_LOCAL_DATA_ROOT: 'https://example.com/danbi-data',
    })).toThrow('DANBI_LOCAL_DATA_ROOT must be a local filesystem path');

    expect(() => getLocalDataRoot(undefined, {
      NODE_ENV: 'test',
      DANBI_ELECTRON_USER_DATA: '\\\\.\\pipe\\danbi-user-data',
    })).toThrow('DANBI_ELECTRON_USER_DATA cannot use a Windows device namespace path.');

    expect(() => getLocalDataRoot(undefined, {
      NODE_ENV: 'test',
      DANBI_LOCAL_DATA_ROOT: `E:/danbi/${String.fromCharCode(0)}bad`,
    })).toThrow('DANBI_LOCAL_DATA_ROOT cannot contain null bytes.');
  });
});
