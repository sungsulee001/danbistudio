import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import type { ExtensionRenderHookRunResult } from '../../lib/editor/extension-runtime-types';
import type { PluginManifestSignatureVerification } from '../../lib/editor/plugin-signature';
import type { ProjectPackageMediaEntry, ProjectPackageMediaManifest } from '../../lib/editor/project-media-package';
import type { ProjectPackageImport } from '../../lib/editor/project-store';
import type { MediaCacheJobSnapshot } from '../../lib/editor/media-cache-queue';
import type { RenderJobSnapshot } from '../../lib/editor/render-queue';
import type { RenderPreflightReport } from '../../lib/editor/render-preflight';
import type { EditorProject } from '../../lib/editor/types';
import type { ExtensionHostSnapshot, ExtensionInvocationRequest, ExtensionInvocationResult } from './extension-api';
import type { ProjectSummary } from './project-schema';
import type { RenderWorkerDiscoveryAnnouncement } from './render-worker-contract';
import type { DanbiRuntimeDiagnosticsSnapshot } from './runtime-diagnostics';
import type { TimelineStateSnapshot } from './timeline-state';

export const EDITOR_IPC_CHANNELS = {
  projectList: 'editor:project:list',
  projectLoad: 'editor:project:load',
  projectSave: 'editor:project:save',
  projectDelete: 'editor:project:delete',
  projectPackageExport: 'editor:project-package:export',
  projectPackageImport: 'editor:project-package:import',
  projectCloudSync: 'editor:project-cloud-sync:sync',
  projectCloudSyncImport: 'editor:project-cloud-sync:import',
  pluginPackageInstall: 'editor:plugin-package:install',
  dialogSelectDirectory: 'editor:dialog:select-directory',
  dialogSaveFile: 'editor:dialog:save-file',
  fileOpenPath: 'editor:file:open-path',
  fileRevealInFolder: 'editor:file:reveal-in-folder',
  mediaSelectImport: 'editor:media:select-import',
  timelineSnapshot: 'editor:timeline:snapshot',
  renderPlan: 'editor:render:plan',
  renderPreflight: 'editor:render:preflight',
  renderDirect: 'editor:render:direct',
  renderQueue: 'editor:render:queue',
  renderJobList: 'editor:render-job:list',
  renderJobGet: 'editor:render-job:get',
  renderJobCancel: 'editor:render-job:cancel',
  renderJobRetry: 'editor:render-job:retry',
  extensionList: 'editor:extension:list',
  extensionInvoke: 'editor:extension:invoke',
  renderWorkerLanDiscovery: 'editor:render-worker:discover-lan',
  systemDiagnostics: 'editor:system:diagnostics',
} as const;

export type EditorIpcChannel = typeof EDITOR_IPC_CHANNELS[keyof typeof EDITOR_IPC_CHANNELS];

export interface EditorExportRange {
  start: number;
  end: number;
}

export interface EditorRenderRequest {
  project: EditorProject;
  profileId: string;
  outputPath?: string;
  outputFilename?: string;
  encoderPreference?: string;
  exportRange?: EditorExportRange;
  playhead?: number;
  sampleTimes?: number[];
  priority?: number;
}

export interface EditorRenderRetryRequest extends Partial<EditorRenderRequest> {
  id: string;
  priority?: number;
}

export interface EditorDirectRenderResponse {
  status: 'completed';
  outputPath: string;
  plan: FfmpegRenderPlan;
  preflight: RenderPreflightReport;
  extensionHooks: ExtensionRenderHookRunResult;
  stderr: string;
}

export interface EditorProjectPackageExportRequest {
  project: EditorProject;
  packageDirectory: string;
  exportedAt?: string;
  packageFileName?: string;
  sourceRoot?: string;
}

export interface EditorProjectPackageImportRequest {
  packageDirectory: string;
  packageFileName?: string;
}

export type EditorPluginPackageInstallMode = 'install' | 'update' | 'replace';

export interface EditorPluginPackageInstallRequest {
  project: EditorProject;
  packageDirectory: string;
  installRootDirectory?: string;
  manifestFileName?: string;
  mode?: EditorPluginPackageInstallMode;
  installedAt?: string;
}

export interface EditorPluginPackageFileCopyResult {
  path: string;
  sourcePath: string;
  targetPath: string;
  status: 'copied';
  bytes: number;
  sha256: string;
}

export interface EditorPluginPackageInstallResponse {
  kind: 'danbi.plugin-package.install-result';
  status: 'installed' | 'updated';
  packageDirectory: string;
  manifestPath: string;
  installRootDirectory: string;
  installedAt: string;
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  signature: PluginManifestSignatureVerification;
  copiedFiles: EditorPluginPackageFileCopyResult[];
  warnings: string[];
  project: EditorProject;
  summary?: ProjectSummary;
}

export interface ProjectPackageMediaCopyResult {
  assetId: string;
  role: ProjectPackageMediaEntry['role'];
  originalPath: string;
  sourcePath: string;
  packagePath: string;
  targetPath: string;
  status: 'copied' | 'missing' | 'failed';
  bytes?: number;
  error?: string;
}

export interface EditorProjectPackageExportResponse {
  packageDirectory: string;
  projectFilePath: string;
  mediaManifest?: ProjectPackageMediaManifest;
  copiedMedia: ProjectPackageMediaCopyResult[];
  warnings: string[];
}

export interface EditorProjectPackageImportResponse extends ProjectPackageImport {
  packageDirectory: string;
  projectFilePath: string;
}

export interface EditorCloudSyncProjectRequest {
  project: EditorProject;
  syncDirectory: string;
  exportedAt?: string;
  sourceRoot?: string;
  force?: boolean;
}

export interface EditorCloudSyncProjectImportRequest {
  syncDirectory: string;
  projectId: string;
}

export interface EditorCloudSyncManifest {
  kind: 'danbi.cloud-sync.manifest';
  version: 1;
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  exportedAt: string;
  packageFileName: string;
  mediaEntryCount: number;
  copiedMediaCount: number;
  warningCount: number;
}

export interface EditorCloudSyncProjectResponse {
  kind: 'danbi.cloud-sync.result';
  status: 'synced' | 'conflict';
  syncDirectory: string;
  projectSyncDirectory: string;
  packageDirectory: string;
  projectFilePath: string;
  manifestPath: string;
  exportedAt: string;
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  previousProjectUpdatedAt?: string;
  copiedMedia: ProjectPackageMediaCopyResult[];
  warnings: string[];
}

export interface EditorCloudSyncProjectImportResponse extends EditorProjectPackageImportResponse {
  syncDirectory: string;
  projectSyncDirectory: string;
  manifestPath: string;
  projectUpdatedAt: string;
  exportedAt: string;
}

export interface EditorDirectoryDialogRequest {
  title: string;
  defaultPath?: string;
  buttonLabel?: string;
  mode?: 'open' | 'save';
  allowCreate?: boolean;
}

export interface EditorDirectoryDialogResponse {
  canceled: boolean;
  directory?: string;
}

export interface EditorSaveFileDialogRequest {
  title: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface EditorSaveFileDialogResponse {
  canceled: boolean;
  filePath?: string;
}

export interface EditorFilePathRequest {
  path: string;
}

export interface EditorFilePathResponse {
  ok: boolean;
  path: string;
  error?: string;
}

export interface EditorNativeMediaImportRequest {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  allowMultiple?: boolean;
}

export interface EditorNativeImportedMediaFile {
  originalName: string;
  name: string;
  mimeType: string;
  size: number;
  source: string;
  renderPath: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  cacheJob?: MediaCacheJobSnapshot;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface EditorNativeImportedCaptionSidecarFile {
  originalName: string;
  mimeType: string;
  size: number;
  content: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface EditorNativeMediaImportResponse {
  canceled: boolean;
  files: EditorNativeImportedMediaFile[];
  sidecars?: EditorNativeImportedCaptionSidecarFile[];
  warnings: string[];
}

export interface EditorRenderWorkerLanDiscoveryRequest {
  port?: number;
  timeoutMs?: number;
  broadcastAddresses?: string[];
}

export interface EditorRenderWorkerLanDiscoveryResponse {
  kind: 'danbi.render-worker.lan-discovery';
  candidates: string[];
  announcements: RenderWorkerDiscoveryAnnouncement[];
  warnings: string[];
}

export interface EditorIpcRequestMap {
  'editor:project:list': undefined;
  'editor:project:load': { id: string };
  'editor:project:save': { project: EditorProject };
  'editor:project:delete': { id: string };
  'editor:project-package:export': EditorProjectPackageExportRequest;
  'editor:project-package:import': EditorProjectPackageImportRequest;
  'editor:project-cloud-sync:sync': EditorCloudSyncProjectRequest;
  'editor:project-cloud-sync:import': EditorCloudSyncProjectImportRequest;
  'editor:plugin-package:install': EditorPluginPackageInstallRequest;
  'editor:dialog:select-directory': EditorDirectoryDialogRequest;
  'editor:dialog:save-file': EditorSaveFileDialogRequest;
  'editor:file:open-path': EditorFilePathRequest;
  'editor:file:reveal-in-folder': EditorFilePathRequest;
  'editor:media:select-import': EditorNativeMediaImportRequest;
  'editor:timeline:snapshot': { project: EditorProject };
  'editor:render:plan': EditorRenderRequest;
  'editor:render:preflight': EditorRenderRequest;
  'editor:render:direct': EditorRenderRequest;
  'editor:render:queue': EditorRenderRequest;
  'editor:render-job:list': undefined;
  'editor:render-job:get': { id: string };
  'editor:render-job:cancel': { id: string };
  'editor:render-job:retry': EditorRenderRetryRequest;
  'editor:extension:list': { project: EditorProject };
  'editor:extension:invoke': ExtensionInvocationRequest;
  'editor:render-worker:discover-lan': EditorRenderWorkerLanDiscoveryRequest;
  'editor:system:diagnostics': undefined;
}

export interface EditorIpcResponseMap {
  'editor:project:list': { projects: ProjectSummary[] };
  'editor:project:load': { project: EditorProject; summary?: ProjectSummary };
  'editor:project:save': { project: EditorProject; summary?: ProjectSummary };
  'editor:project:delete': { deleted: true; id: string };
  'editor:project-package:export': EditorProjectPackageExportResponse;
  'editor:project-package:import': EditorProjectPackageImportResponse;
  'editor:project-cloud-sync:sync': EditorCloudSyncProjectResponse;
  'editor:project-cloud-sync:import': EditorCloudSyncProjectImportResponse;
  'editor:plugin-package:install': EditorPluginPackageInstallResponse;
  'editor:dialog:select-directory': EditorDirectoryDialogResponse;
  'editor:dialog:save-file': EditorSaveFileDialogResponse;
  'editor:file:open-path': EditorFilePathResponse;
  'editor:file:reveal-in-folder': EditorFilePathResponse;
  'editor:media:select-import': EditorNativeMediaImportResponse;
  'editor:timeline:snapshot': TimelineStateSnapshot;
  'editor:render:plan': FfmpegRenderPlan;
  'editor:render:preflight': RenderPreflightReport;
  'editor:render:direct': EditorDirectRenderResponse;
  'editor:render:queue': { job: RenderJobSnapshot };
  'editor:render-job:list': { jobs: RenderJobSnapshot[] };
  'editor:render-job:get': { job?: RenderJobSnapshot };
  'editor:render-job:cancel': { job?: RenderJobSnapshot };
  'editor:render-job:retry': { job?: RenderJobSnapshot };
  'editor:extension:list': ExtensionHostSnapshot;
  'editor:extension:invoke': ExtensionInvocationResult;
  'editor:render-worker:discover-lan': EditorRenderWorkerLanDiscoveryResponse;
  'editor:system:diagnostics': DanbiRuntimeDiagnosticsSnapshot;
}

export type EditorInvoke = <Channel extends EditorIpcChannel>(
  channel: Channel,
  payload: EditorIpcRequestMap[Channel],
) => Promise<EditorIpcResponseMap[Channel]>;

export interface EditorIpcBridge {
  invoke: EditorInvoke;
}
