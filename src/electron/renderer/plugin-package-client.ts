import type { EditorProject } from '../../lib/editor/types';
import type {
  EditorDirectoryDialogResponse,
  EditorPluginPackageInstallMode,
  EditorPluginPackageInstallResponse,
} from '../shared/ipc-contract';
import { getWindowEditorIpcClient } from './editor-ipc-client';

export interface PluginPackageDirectorySelectionRequest {
  defaultPath?: string;
}

export interface PluginPackageDirectorySelectionResult {
  available: boolean;
  canceled: boolean;
  directory?: string;
}

export async function selectPluginPackageDirectory(
  request: PluginPackageDirectorySelectionRequest = {},
): Promise<PluginPackageDirectorySelectionResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.dialogs?.selectDirectory) {
    return { available: false, canceled: false };
  }

  const result = await client.dialogs.selectDirectory({
    title: 'Install plugin package folder',
    defaultPath: request.defaultPath,
    buttonLabel: 'Install package',
    mode: 'open',
    allowCreate: false,
  }) as EditorDirectoryDialogResponse;

  return {
    available: true,
    canceled: result.canceled,
    ...(result.directory ? { directory: result.directory } : {}),
  };
}

export async function installPluginPackageFolder(
  project: EditorProject,
  packageDirectory: string,
  options: { mode?: EditorPluginPackageInstallMode } = {},
): Promise<EditorPluginPackageInstallResponse> {
  const client = getWindowEditorIpcClient();
  if (!client?.plugins?.installPackage) {
    throw new Error('Plugin package installation requires the Electron desktop runtime.');
  }

  return client.plugins.installPackage({
    project,
    packageDirectory,
    mode: options.mode ?? 'replace',
  }) as Promise<EditorPluginPackageInstallResponse>;
}
