import {
  EDITOR_IPC_CHANNELS,
  type EditorIpcChannel,
  type EditorIpcRequestMap,
  type EditorIpcResponseMap,
} from '../shared/ipc-contract';
import { importProjectFromCloudFolder, syncProjectToCloudFolder } from './cloud-sync-engine';
import {
  EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
  buildExtensionHostSnapshot,
  buildExtensionSandboxCommandRequest,
  invokeExtensionCommandRequest,
} from '../shared/extension-api';
import { buildTimelineStateSnapshot } from '../shared/timeline-state';
import {
  buildFfmpegEnginePlan,
  buildFfmpegEnginePreflight,
  cancelFfmpegEngineJob,
  getFfmpegEngineJob,
  listFfmpegEngineJobs,
  queueFfmpegEngineRender,
  retryFfmpegEngineJob,
  runFfmpegEngineRender,
} from './ffmpeg-render-engine';
import { createUnavailableNativeDialogService, type EditorNativeDialogService } from './native-dialog-service';
import { createUnavailableNativeFileService, type EditorNativeFileService } from './native-file-service';
import { selectAndImportNativeMediaFiles, type ElectronMediaDialogLike } from './native-media-import-engine';
import { installEditorPluginPackageFolder } from './plugin-package-installer';
import { exportProjectPackageFolder, importProjectPackageFolder } from './project-package-engine';
import { discoverRenderWorkerDaemonAnnouncements } from './render-worker-discovery';
import type { EditorProjectRepository } from './project-store-adapter';
import type { DanbiRuntimeDiagnosticsSnapshot } from '../shared/runtime-diagnostics';
import { runExtensionSandboxProcessCommand } from './extension-sandbox-runner';
import { writeReviewedExternalExporterHandoff } from './external-exporter-handoff-writer';

export type EditorIpcHandler<Channel extends EditorIpcChannel> = (
  payload: EditorIpcRequestMap[Channel],
) => Promise<EditorIpcResponseMap[Channel]> | EditorIpcResponseMap[Channel];

export type EditorIpcHandlerMap = {
  [Channel in EditorIpcChannel]: EditorIpcHandler<Channel>;
};

export interface ElectronIpcMainLike {
  handle(channel: string, handler: (event: unknown, payload: unknown) => unknown): void;
}

export interface EditorIpcHandlerDependencies {
  projects: EditorProjectRepository;
  dialogs?: EditorNativeDialogService;
  files?: EditorNativeFileService;
  mediaDialog?: ElectronMediaDialogLike;
  systemDiagnostics?: () => Promise<DanbiRuntimeDiagnosticsSnapshot> | DanbiRuntimeDiagnosticsSnapshot;
  externalExporterOutputRoot?: string;
  pluginPackageInstallRoot?: string;
}

export function createEditorIpcHandlers(deps: EditorIpcHandlerDependencies): EditorIpcHandlerMap {
  const dialogs = deps.dialogs ?? createUnavailableNativeDialogService();
  const files = deps.files ?? createUnavailableNativeFileService();

  return {
    [EDITOR_IPC_CHANNELS.projectList]: () => deps.projects.list(),
    [EDITOR_IPC_CHANNELS.projectLoad]: async (payload) => {
      const result = await deps.projects.load(payload.id);
      if (!result) {
        throw new Error(`Project ${payload.id} was not found.`);
      }

      return result;
    },
    [EDITOR_IPC_CHANNELS.projectSave]: (payload) => deps.projects.save(payload.project),
    [EDITOR_IPC_CHANNELS.projectDelete]: (payload) => deps.projects.delete(payload.id),
    [EDITOR_IPC_CHANNELS.projectPackageExport]: (payload) => exportProjectPackageFolder(payload),
    [EDITOR_IPC_CHANNELS.projectPackageImport]: (payload) => importProjectPackageFolder(payload),
    [EDITOR_IPC_CHANNELS.projectCloudSync]: (payload) => syncProjectToCloudFolder(payload),
    [EDITOR_IPC_CHANNELS.projectCloudSyncImport]: (payload) => importProjectFromCloudFolder(payload),
    [EDITOR_IPC_CHANNELS.pluginPackageInstall]: async (payload) => {
      const installResult = await installEditorPluginPackageFolder({
        ...payload,
        installRootDirectory: payload.installRootDirectory ?? deps.pluginPackageInstallRoot,
      });
      const saved = await deps.projects.save(installResult.project);

      return {
        ...installResult,
        project: saved.project,
        summary: saved.summary,
      };
    },
    [EDITOR_IPC_CHANNELS.dialogSelectDirectory]: (payload) => dialogs.selectDirectory(payload),
    [EDITOR_IPC_CHANNELS.dialogSaveFile]: (payload) => dialogs.saveFile(payload),
    [EDITOR_IPC_CHANNELS.fileOpenPath]: (payload) => files.openPath(payload),
    [EDITOR_IPC_CHANNELS.fileRevealInFolder]: (payload) => files.revealInFolder(payload),
    [EDITOR_IPC_CHANNELS.mediaSelectImport]: (payload) => deps.mediaDialog
      ? selectAndImportNativeMediaFiles(deps.mediaDialog, payload)
      : { canceled: true, files: [], warnings: ['Native media import dialog is not available.'] },
    [EDITOR_IPC_CHANNELS.timelineSnapshot]: (payload) => buildTimelineStateSnapshot(payload.project),
    [EDITOR_IPC_CHANNELS.renderPlan]: (payload) => buildFfmpegEnginePlan(payload),
    [EDITOR_IPC_CHANNELS.renderPreflight]: (payload) => buildFfmpegEnginePreflight(payload),
    [EDITOR_IPC_CHANNELS.renderDirect]: (payload) => runFfmpegEngineRender(payload),
    [EDITOR_IPC_CHANNELS.renderQueue]: async (payload) => ({ job: await queueFfmpegEngineRender(payload) }),
    [EDITOR_IPC_CHANNELS.renderJobList]: async () => ({ jobs: await listFfmpegEngineJobs() }),
    [EDITOR_IPC_CHANNELS.renderJobGet]: async (payload) => ({ job: await getFfmpegEngineJob(payload.id) }),
    [EDITOR_IPC_CHANNELS.renderJobCancel]: async (payload) => ({ job: await cancelFfmpegEngineJob(payload.id) }),
    [EDITOR_IPC_CHANNELS.renderJobRetry]: async (payload) => ({
      job: await retryFfmpegEngineJob(payload.id, payload),
    }),
    [EDITOR_IPC_CHANNELS.extensionList]: (payload) => buildExtensionHostSnapshot(payload.project),
    [EDITOR_IPC_CHANNELS.extensionInvoke]: async (payload) => {
      const builtinResult = invokeExtensionCommandRequest(payload);
      if (builtinResult.handled || !payload.project) {
        return builtinResult;
      }

      const sandbox = buildExtensionHostSnapshot(payload.project).sandboxes.find((policy) => (
        policy.pluginId === payload.extensionId
      ));
      if (sandbox?.status !== 'manifest-only' || !sandbox.executableApis.includes('command')) {
        return builtinResult;
      }

      try {
        const response = await runExtensionSandboxProcessCommand({
          request: buildExtensionSandboxCommandRequest(payload.project, payload.extensionId, payload.command, payload.payload),
          timeoutMs: 15000,
        });
        let result: unknown = response.result;
        const writeWarnings: string[] = [];
        if (response.handled && response.status === 'executed' && payload.command === EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND) {
          const writeResult = await writeReviewedExternalExporterHandoff(response.result, {
            rootDirectory: deps.externalExporterOutputRoot,
          });
          result = {
            ...(isRecord(response.result) ? response.result : {}),
            writeSummary: {
              status: writeResult.status,
              rootDirectory: writeResult.rootDirectory,
              batchManifestRelativePath: writeResult.batchManifestRelativePath,
              batchManifestPath: writeResult.batchManifestPath,
              writtenCount: writeResult.writtenCount,
              skippedCount: writeResult.skippedCount,
              blockedCount: writeResult.blockedCount,
            },
            writtenManifests: writeResult.writes,
          };
          writeWarnings.push(...writeResult.warnings);
        }

        return {
          extensionId: payload.extensionId,
          command: payload.command,
          handled: response.handled,
          result,
          warnings: [
            ...response.warnings,
            ...writeWarnings,
            ...(response.status === 'blocked' ? [response.reason] : []),
          ],
        };
      } catch (error) {
        return {
          extensionId: payload.extensionId,
          command: payload.command,
          handled: false,
          warnings: [(error as Error).message],
        };
      }
    },
    [EDITOR_IPC_CHANNELS.renderWorkerLanDiscovery]: (payload) => discoverRenderWorkerDaemonAnnouncements(payload),
    [EDITOR_IPC_CHANNELS.systemDiagnostics]: () => {
      if (!deps.systemDiagnostics) {
        throw new Error('System diagnostics are not available in this Electron runtime.');
      }

      return deps.systemDiagnostics();
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function registerEditorIpcHandlers(ipcMain: ElectronIpcMainLike, handlers: EditorIpcHandlerMap): void {
  for (const [channel, handler] of Object.entries(handlers) as Array<[EditorIpcChannel, EditorIpcHandler<EditorIpcChannel>]>) {
    ipcMain.handle(channel, (_event, payload) => handler(payload as never));
  }
}
