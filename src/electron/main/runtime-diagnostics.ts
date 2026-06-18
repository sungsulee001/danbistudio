import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { discoverFfmpegSetup } from './ffmpeg-discovery';
import type { DanbiRuntimeDiagnosticsSnapshot, DanbiRuntimePathSnapshot, DanbiRuntimeSampleSnapshot } from '../shared/runtime-diagnostics';
import {
  findSampleProjectPackageDirectory,
  resolveSampleProjectPackageCandidates,
} from '../../server/editor/sample-project-package';

export interface DanbiRuntimeAppLike {
  getName?: () => string;
  getVersion?: () => string;
  getPath?: (name: 'userData') => string;
  setPath?: (name: 'crashDumps', value: string) => void;
  setAppLogsPath?: (value?: string) => void;
  isPackaged?: boolean;
}

export interface DanbiRuntimeDiagnosticsOptions {
  app?: DanbiRuntimeAppLike;
  userDataPath?: string;
  rendererUrl?: string;
  resourcesPath?: string;
  appPath?: string;
  env?: NodeJS.ProcessEnv;
}

let processDiagnosticsRegistered = false;

export function resolveDanbiRuntimePaths(userDataPath: string): DanbiRuntimePathSnapshot {
  return {
    userDataPath,
    logsPath: join(userDataPath, 'logs'),
    crashDumpsPath: join(userDataPath, 'crashDumps'),
    projectsPath: join(userDataPath, 'projects'),
    packagesPath: join(userDataPath, 'packages'),
    importsPath: join(userDataPath, 'imports'),
    cachePath: join(userDataPath, 'cache'),
    autosavePath: join(userDataPath, 'autosave'),
    rendersPath: join(userDataPath, 'renders'),
    tempPath: join(userDataPath, 'temp'),
    jobsPath: join(userDataPath, 'jobs'),
    sttPath: join(userDataPath, 'stt'),
    outputsPath: join(userDataPath, 'outputs'),
  };
}

export function initializeDanbiDesktopRuntime(
  app: DanbiRuntimeAppLike,
  options: Pick<DanbiRuntimeDiagnosticsOptions, 'userDataPath'> = {},
): DanbiRuntimePathSnapshot {
  const userDataPath = options.userDataPath ?? app.getPath?.('userData') ?? join(process.cwd(), '.danbi', 'electron-user-data');
  const paths = resolveDanbiRuntimePaths(userDataPath);

  applyElectronStorageEnvironment(paths);
  for (const directory of Object.values(paths)) {
    mkdirSync(directory, { recursive: true });
  }

  app.setAppLogsPath?.(paths.logsPath);
  app.setPath?.('crashDumps', paths.crashDumpsPath);
  registerProcessDiagnostics(paths);
  appendRuntimeLog(paths, 'runtime-initialized', { userDataPath: paths.userDataPath });

  return paths;
}

export async function buildDanbiRuntimeDiagnostics(
  options: DanbiRuntimeDiagnosticsOptions = {},
): Promise<DanbiRuntimeDiagnosticsSnapshot> {
  const userDataPath = options.userDataPath ?? options.app?.getPath?.('userData') ?? join(process.cwd(), '.danbi', 'electron-user-data');
  const paths = resolveDanbiRuntimePaths(userDataPath);
  const ffmpeg = await discoverFfmpegSetup({
    env: options.env ?? process.env,
    resourcesPath: options.resourcesPath,
    appPath: options.appPath,
    cwd: process.cwd(),
    includeCapabilities: true,
  });
  const samples = resolveDanbiRuntimeSamples(options);
  const warnings = [
    ...ffmpeg.warnings,
  ];

  return {
    checkedAt: new Date().toISOString(),
    app: {
      name: options.app?.getName?.() ?? 'Danbi Studio',
      version: options.app?.getVersion?.() ?? '0.0.0',
      isPackaged: options.app?.isPackaged ?? false,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    },
    rendererUrl: options.rendererUrl,
    paths,
    ffmpeg,
    samples,
    warnings,
  };
}

export function appendRuntimeLog(paths: DanbiRuntimePathSnapshot, event: string, payload: Record<string, unknown> = {}): void {
  const entry = {
    at: new Date().toISOString(),
    event,
    ...payload,
  };

  try {
    mkdirSync(paths.logsPath, { recursive: true });
    appendFileSync(join(paths.logsPath, 'main-process.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Logging must never stop the editor from launching.
  }
}

function applyElectronStorageEnvironment(paths: DanbiRuntimePathSnapshot): void {
  process.env.DANBI_ELECTRON_USER_DATA = paths.userDataPath;
  process.env.DANBI_LOCAL_DATA_ROOT = paths.userDataPath;
}

function registerProcessDiagnostics(paths: DanbiRuntimePathSnapshot): void {
  if (processDiagnosticsRegistered) {
    return;
  }

  processDiagnosticsRegistered = true;
  process.on('uncaughtExceptionMonitor', (error) => {
    appendRuntimeLog(paths, 'uncaught-exception', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });
  process.on('unhandledRejection', (reason) => {
    appendRuntimeLog(paths, 'unhandled-rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      } : String(reason),
    });
  });
}

function resolveDanbiRuntimeSamples(options: DanbiRuntimeDiagnosticsOptions): DanbiRuntimeSampleSnapshot {
  const lookupOptions = {
    env: options.env ?? process.env,
    resourcesPath: options.resourcesPath,
    appPath: options.appPath,
    cwd: process.cwd(),
  };
  const candidates = resolveSampleProjectPackageCandidates(lookupOptions);
  const gettingStartedPackagePath = findSampleProjectPackageDirectory(lookupOptions);

  return {
    available: Boolean(gettingStartedPackagePath),
    ...(gettingStartedPackagePath ? { gettingStartedPackagePath } : {}),
    candidates,
  };
}
