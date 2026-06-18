import type { EditorProject } from '../../lib/editor/types';
import {
  EDITOR_IPC_CHANNELS,
  type EditorCloudSyncProjectImportRequest,
  type EditorCloudSyncProjectRequest,
  type EditorDirectoryDialogRequest,
  type EditorFilePathRequest,
  type EditorIpcBridge,
  type EditorInvoke,
  type EditorNativeMediaImportRequest,
  type EditorPluginPackageInstallRequest,
  type EditorProjectPackageExportRequest,
  type EditorProjectPackageImportRequest,
  type EditorRenderRetryRequest,
  type EditorRenderRequest,
  type EditorRenderWorkerLanDiscoveryRequest,
  type EditorSaveFileDialogRequest,
} from './ipc-contract';

export interface EditorPreloadApi {
  ipc: EditorIpcBridge;
  projects: {
    list(): ReturnType<EditorInvoke>;
    load(id: string): ReturnType<EditorInvoke>;
    save(project: EditorProject): ReturnType<EditorInvoke>;
    delete(id: string): ReturnType<EditorInvoke>;
    exportPackage(request: EditorProjectPackageExportRequest): ReturnType<EditorInvoke>;
    importPackage(request: EditorProjectPackageImportRequest): ReturnType<EditorInvoke>;
    syncCloudFolder(request: EditorCloudSyncProjectRequest): ReturnType<EditorInvoke>;
    importCloudSyncProject(request: EditorCloudSyncProjectImportRequest): ReturnType<EditorInvoke>;
  };
  plugins: {
    installPackage(request: EditorPluginPackageInstallRequest): ReturnType<EditorInvoke>;
  };
  dialogs: {
    selectDirectory(request: EditorDirectoryDialogRequest): ReturnType<EditorInvoke>;
    saveFile(request: EditorSaveFileDialogRequest): ReturnType<EditorInvoke>;
  };
  media: {
    selectAndImport(request?: EditorNativeMediaImportRequest): ReturnType<EditorInvoke>;
  };
  files: {
    openPath(path: EditorFilePathRequest['path']): ReturnType<EditorInvoke>;
    revealInFolder(path: EditorFilePathRequest['path']): ReturnType<EditorInvoke>;
  };
  timeline: {
    snapshot(project: EditorProject): ReturnType<EditorInvoke>;
  };
  render: {
    plan(request: EditorRenderRequest): ReturnType<EditorInvoke>;
    preflight(request: EditorRenderRequest): ReturnType<EditorInvoke>;
    direct(request: EditorRenderRequest): ReturnType<EditorInvoke>;
    queue(request: EditorRenderRequest): ReturnType<EditorInvoke>;
    jobs(): ReturnType<EditorInvoke>;
    getJob(id: string): ReturnType<EditorInvoke>;
    cancelJob(id: string): ReturnType<EditorInvoke>;
    retryJob(id: string, retry?: number | Omit<EditorRenderRetryRequest, 'id'>): ReturnType<EditorInvoke>;
  };
  extensions: {
    list(project: EditorProject): ReturnType<EditorInvoke>;
    invoke(project: EditorProject, extensionId: string, command: string, payload?: unknown): ReturnType<EditorInvoke>;
  };
  renderWorkers: {
    discoverLan(request?: EditorRenderWorkerLanDiscoveryRequest): ReturnType<EditorInvoke>;
  };
  system: {
    diagnostics(): ReturnType<EditorInvoke>;
  };
}

export function createEditorPreloadApi(invoke: EditorInvoke): EditorPreloadApi {
  const ipc: EditorIpcBridge = { invoke };

  return {
    ipc,
    projects: {
      list: () => invoke(EDITOR_IPC_CHANNELS.projectList, undefined),
      load: (id) => invoke(EDITOR_IPC_CHANNELS.projectLoad, { id }),
      save: (project) => invoke(EDITOR_IPC_CHANNELS.projectSave, { project }),
      delete: (id) => invoke(EDITOR_IPC_CHANNELS.projectDelete, { id }),
      exportPackage: (request) => invoke(EDITOR_IPC_CHANNELS.projectPackageExport, request),
      importPackage: (request) => invoke(EDITOR_IPC_CHANNELS.projectPackageImport, request),
      syncCloudFolder: (request) => invoke(EDITOR_IPC_CHANNELS.projectCloudSync, request),
      importCloudSyncProject: (request) => invoke(EDITOR_IPC_CHANNELS.projectCloudSyncImport, request),
    },
    plugins: {
      installPackage: (request) => invoke(EDITOR_IPC_CHANNELS.pluginPackageInstall, request),
    },
    dialogs: {
      selectDirectory: (request) => invoke(EDITOR_IPC_CHANNELS.dialogSelectDirectory, request),
      saveFile: (request) => invoke(EDITOR_IPC_CHANNELS.dialogSaveFile, request),
    },
    media: {
      selectAndImport: (request = {}) => invoke(EDITOR_IPC_CHANNELS.mediaSelectImport, request),
    },
    files: {
      openPath: (path) => invoke(EDITOR_IPC_CHANNELS.fileOpenPath, { path }),
      revealInFolder: (path) => invoke(EDITOR_IPC_CHANNELS.fileRevealInFolder, { path }),
    },
    timeline: {
      snapshot: (project) => invoke(EDITOR_IPC_CHANNELS.timelineSnapshot, { project }),
    },
    render: {
      plan: (request) => invoke(EDITOR_IPC_CHANNELS.renderPlan, request),
      preflight: (request) => invoke(EDITOR_IPC_CHANNELS.renderPreflight, request),
      direct: (request) => invoke(EDITOR_IPC_CHANNELS.renderDirect, request),
      queue: (request) => invoke(EDITOR_IPC_CHANNELS.renderQueue, request),
      jobs: () => invoke(EDITOR_IPC_CHANNELS.renderJobList, undefined),
      getJob: (id) => invoke(EDITOR_IPC_CHANNELS.renderJobGet, { id }),
      cancelJob: (id) => invoke(EDITOR_IPC_CHANNELS.renderJobCancel, { id }),
      retryJob: (id, retry) => invoke(
        EDITOR_IPC_CHANNELS.renderJobRetry,
        typeof retry === 'number' ? { id, priority: retry } : { id, ...retry },
      ),
    },
    extensions: {
      list: (project) => invoke(EDITOR_IPC_CHANNELS.extensionList, { project }),
      invoke: (project, extensionId, command, payload) => invoke(EDITOR_IPC_CHANNELS.extensionInvoke, {
        project,
        extensionId,
        command,
        payload,
      }),
    },
    renderWorkers: {
      discoverLan: (request = {}) => invoke(EDITOR_IPC_CHANNELS.renderWorkerLanDiscovery, request),
    },
    system: {
      diagnostics: () => invoke(EDITOR_IPC_CHANNELS.systemDiagnostics, undefined),
    },
  };
}

declare global {
  interface Window {
    danbiEditor?: EditorPreloadApi;
  }
}
