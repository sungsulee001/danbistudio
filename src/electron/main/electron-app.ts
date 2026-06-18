import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { createEditorIpcHandlers, registerEditorIpcHandlers } from './ipc-handlers';
import { createEditorNativeDialogService, resolveNativeDialogAutomationOptions } from './native-dialog-service';
import { createEditorNativeFileService } from './native-file-service';
import { createNativeProjectRepository } from './native-project-repository';
import type { ElectronMediaDialogLike } from './native-media-import-engine';
import { startPackagedRendererServer, type PackagedRendererServerHandle } from './packaged-renderer-server';
import { applyFfmpegSetupToProcessEnv, discoverFfmpegSetup } from './ffmpeg-discovery';
import { buildDanbiRuntimeDiagnostics, initializeDanbiDesktopRuntime } from './runtime-diagnostics';
import type { DanbiRuntimeDiagnosticsSnapshot } from '../shared/runtime-diagnostics';

const DEFAULT_RENDERER_URL = 'http://127.0.0.1:3000/editor';

export interface DanbiElectronAppOptions {
  rendererUrl?: string;
  userDataPath?: string;
  preloadPath?: string;
  openDevTools?: boolean;
  usePackagedRenderer?: boolean;
  resourcesPath?: string;
  appPath?: string;
}

export interface DanbiElectronSmokeResult {
  rendererUrl: string;
  preloadPath: string;
  userDataPath: string;
  diagnostics: DanbiRuntimeDiagnosticsSnapshot;
}

export function resolveDanbiElectronRendererUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DANBI_STUDIO_URL || DEFAULT_RENDERER_URL;
}

export function resolveDanbiElectronPreloadPath(baseDir: string = __dirname): string {
  return join(baseDir, '..', 'preload', 'electron-preload.cjs');
}

export function registerDanbiElectronIpc(options: DanbiElectronAppOptions = {}): void {
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  const runtimePaths = initializeDanbiDesktopRuntime(app, { userDataPath });
  const projects = createNativeProjectRepository({
    rootDir: runtimePaths.projectsPath,
  });

  registerEditorIpcHandlers(ipcMain, createEditorIpcHandlers({
    projects,
    systemDiagnostics: () => buildDanbiRuntimeDiagnostics({
      app,
      userDataPath,
      rendererUrl: options.rendererUrl,
      resourcesPath: options.resourcesPath ?? process.resourcesPath,
      appPath: options.appPath ?? app.getAppPath(),
    }),
    dialogs: createEditorNativeDialogService({
      showOpenDialog: (request) => dialog.showOpenDialog(request),
      showSaveDialog: (request) => dialog.showSaveDialog(request),
    }, {
      automation: resolveNativeDialogAutomationOptions(),
    }),
    files: createEditorNativeFileService({
      openPath: (filePath) => shell.openPath(filePath),
      showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
    }),
    mediaDialog: {
      showOpenDialog: (request) => dialog.showOpenDialog(request),
    } satisfies ElectronMediaDialogLike,
    externalExporterOutputRoot: runtimePaths.outputsPath,
    projectPackageRoot: runtimePaths.packagesPath,
    pluginPackageInstallRoot: runtimePaths.packagesPath,
  }));
}

export function createDanbiEditorWindow(options: DanbiElectronAppOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#09090b',
    title: 'Danbi Studio',
    webPreferences: {
      preload: options.preloadPath ?? resolveDanbiElectronPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void window.loadURL(options.rendererUrl ?? resolveDanbiElectronRendererUrl());

  if (options.openDevTools) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}

export function startDanbiElectronApp(options: DanbiElectronAppOptions = {}): void {
  applyDanbiUserDataPathOption(options);
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  const singleInstanceLock = process.env.DANBI_ELECTRON_DISABLE_SINGLE_INSTANCE === '1' || app.requestSingleInstanceLock();
  if (!singleInstanceLock) {
    app.quit();
    return;
  }

  let rendererServer: PackagedRendererServerHandle | undefined;

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  });

  app.on('before-quit', () => {
    void rendererServer?.stop();
  });

  void app.whenReady().then(async () => {
    let rendererUrl = options.rendererUrl ?? resolveDanbiElectronRendererUrl();
    if (shouldUsePackagedRenderer(options) && !options.rendererUrl && !process.env.DANBI_STUDIO_URL) {
      rendererServer = await startPackagedRendererServer({
        appPath: options.appPath ?? app.getAppPath(),
        resourcesPath: options.resourcesPath ?? process.resourcesPath,
        userDataPath,
        env: process.env,
        execPath: process.execPath,
      });
      rendererUrl = rendererServer.url;
    }

    const ffmpegSetup = await discoverFfmpegSetup({
      resourcesPath: options.resourcesPath ?? process.resourcesPath,
      appPath: options.appPath ?? app.getAppPath(),
    });
    applyFfmpegSetupToProcessEnv(ffmpegSetup);
    registerDanbiElectronIpc({
      ...options,
      userDataPath,
      rendererUrl,
    });
    createDanbiEditorWindow({
      ...options,
      rendererUrl,
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createDanbiEditorWindow({
          ...options,
          rendererUrl,
        });
      }
    });
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

export async function runDanbiElectronSmoke(options: DanbiElectronAppOptions = {}): Promise<DanbiElectronSmokeResult> {
  applyDanbiUserDataPathOption(options);
  await app.whenReady();

  let rendererServer: PackagedRendererServerHandle | undefined;
  let rendererUrl = options.rendererUrl ?? resolveDanbiElectronRendererUrl();
  const preloadPath = options.preloadPath ?? resolveDanbiElectronPreloadPath();
  const userDataPath = options.userDataPath ?? join(app.getPath('userData'), 'smoke');

  if (!existsSync(preloadPath)) {
    throw new Error(`Electron preload bundle is missing: ${preloadPath}`);
  }

  try {
    if (shouldUsePackagedRenderer(options) && !options.rendererUrl && !process.env.DANBI_STUDIO_URL) {
      rendererServer = await startPackagedRendererServer({
        appPath: options.appPath ?? app.getAppPath(),
        resourcesPath: options.resourcesPath ?? process.resourcesPath,
        userDataPath,
        env: process.env,
        execPath: process.execPath,
      });
      rendererUrl = rendererServer.url;
    }

    const ffmpegSetup = await discoverFfmpegSetup({
      resourcesPath: options.resourcesPath ?? process.resourcesPath,
      appPath: options.appPath ?? app.getAppPath(),
    });
    applyFfmpegSetupToProcessEnv(ffmpegSetup);
    registerDanbiElectronIpc({
      ...options,
      rendererUrl,
      userDataPath,
    });
    const diagnostics = await buildDanbiRuntimeDiagnostics({
      app,
      userDataPath,
      rendererUrl,
      resourcesPath: options.resourcesPath ?? process.resourcesPath,
      appPath: options.appPath ?? app.getAppPath(),
    });

    return {
      rendererUrl,
      preloadPath,
      userDataPath,
      diagnostics,
    };
  } finally {
    await rendererServer?.stop();
  }
}

function shouldUsePackagedRenderer(options: DanbiElectronAppOptions): boolean {
  return options.usePackagedRenderer === true ||
    app.isPackaged ||
    process.env.DANBI_ELECTRON_USE_PACKAGED_RENDERER === '1';
}

function applyDanbiUserDataPathOption(options: DanbiElectronAppOptions): void {
  if (!options.userDataPath) {
    return;
  }

  app.setPath('userData', options.userDataPath);
}

function isDanbiElectronEntrypoint(): boolean {
  return require.main === module ||
    process.defaultApp === true ||
    process.argv.some((argument) => /electron-app\.cjs$/.test(argument.replace(/\\/g, '/')));
}

if (isDanbiElectronEntrypoint()) {
  if (process.env.DANBI_ELECTRON_SMOKE === '1') {
    const smokeTimeout = setTimeout(() => {
      console.error('Danbi Electron smoke timed out before app readiness.');
      app.exit(1);
    }, Number(process.env.DANBI_ELECTRON_SMOKE_TIMEOUT_MS || 10000));

    void runDanbiElectronSmoke({
      rendererUrl: process.env.DANBI_STUDIO_URL,
      userDataPath: process.env.DANBI_ELECTRON_SMOKE_USER_DATA ?? process.env.DANBI_ELECTRON_USER_DATA,
      usePackagedRenderer: app.isPackaged || process.env.DANBI_ELECTRON_USE_PACKAGED_RENDERER === '1',
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    })
      .then((result) => {
        clearTimeout(smokeTimeout);
        writeElectronSmokeResult(result);
        console.log(`Danbi Electron smoke passed: ${JSON.stringify(summarizeElectronSmokeResult(result))}`);
        app.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(smokeTimeout);
        console.error(error instanceof Error ? error.message : error);
        app.exit(1);
      });
  } else {
    startDanbiElectronApp({
      rendererUrl: process.env.DANBI_STUDIO_URL,
      userDataPath: process.env.DANBI_ELECTRON_USER_DATA,
      openDevTools: process.env.DANBI_ELECTRON_DEVTOOLS === '1',
      usePackagedRenderer: app.isPackaged || process.env.DANBI_ELECTRON_USE_PACKAGED_RENDERER === '1',
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    });
  }
}

function writeElectronSmokeResult(result: DanbiElectronSmokeResult): void {
  const resultPath = process.env.DANBI_ELECTRON_SMOKE_RESULT_PATH;
  if (!resultPath) {
    return;
  }

  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function summarizeElectronSmokeResult(result: DanbiElectronSmokeResult): Record<string, unknown> {
  return {
    rendererUrl: result.rendererUrl,
    preloadPath: result.preloadPath,
    userDataPath: result.userDataPath,
    logsPath: result.diagnostics.paths.logsPath,
    crashDumpsPath: result.diagnostics.paths.crashDumpsPath,
    ffmpegReady: result.diagnostics.ffmpeg.ready,
    ffmpegPath: result.diagnostics.ffmpeg.ffmpegPath,
    ffprobePath: result.diagnostics.ffmpeg.ffprobePath,
    ffmpegCandidateCount: result.diagnostics.ffmpeg.candidates.length,
    ffmpegEncoderCount: result.diagnostics.ffmpeg.capabilities?.encoders.length ?? 0,
    hardwareEncoderCount: result.diagnostics.ffmpeg.capabilities?.hardwareEncoders.length ?? 0,
    sampleProjectAvailable: result.diagnostics.samples.available,
    sampleProjectPackagePath: result.diagnostics.samples.gettingStartedPackagePath,
  };
}
