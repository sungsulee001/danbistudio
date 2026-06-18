import type {
  EditorDirectoryDialogRequest,
  EditorDirectoryDialogResponse,
  EditorSaveFileDialogRequest,
  EditorSaveFileDialogResponse,
} from '../shared/ipc-contract';

export interface ElectronDialogLike {
  showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    properties: Array<'openDirectory' | 'createDirectory'>;
  }): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  showSaveDialog?(options: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: Array<{
      name: string;
      extensions: string[];
    }>;
  }): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
}

export interface EditorNativeDialogService {
  selectDirectory(request: EditorDirectoryDialogRequest): Promise<EditorDirectoryDialogResponse>;
  saveFile(request: EditorSaveFileDialogRequest): Promise<EditorSaveFileDialogResponse>;
}

export interface EditorNativeDialogAutomationOptions {
  saveFilePath?: string | ((request: EditorSaveFileDialogRequest) => string | undefined);
}

export interface EditorNativeDialogServiceOptions {
  automation?: EditorNativeDialogAutomationOptions;
}

export interface NativeDialogAutomationEnv {
  DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH?: string;
}

export function createEditorNativeDialogService(
  dialog: ElectronDialogLike,
  options: EditorNativeDialogServiceOptions = {},
): EditorNativeDialogService {
  return {
    async selectDirectory(request) {
      const properties: Array<'openDirectory' | 'createDirectory'> = ['openDirectory'];
      if (request.mode !== 'open' && request.allowCreate !== false) {
        properties.push('createDirectory');
      }

      const result = await dialog.showOpenDialog({
        title: request.title,
        defaultPath: request.defaultPath,
        buttonLabel: request.buttonLabel,
        properties,
      });
      const directory = result.filePaths[0];

      return {
        canceled: result.canceled || !directory,
        ...(directory ? { directory } : {}),
      };
    },
    async saveFile(request) {
      const automatedSaveFilePath = resolveAutomatedSaveFilePath(options.automation?.saveFilePath, request);
      if (automatedSaveFilePath) {
        return {
          canceled: false,
          filePath: automatedSaveFilePath,
        };
      }

      if (!dialog.showSaveDialog) {
        return { canceled: true };
      }

      const result = await dialog.showSaveDialog({
        title: request.title,
        defaultPath: request.defaultPath,
        buttonLabel: request.buttonLabel,
        filters: request.filters,
      });

      return {
        canceled: result.canceled || !result.filePath,
        ...(result.filePath ? { filePath: result.filePath } : {}),
      };
    },
  };
}

export function resolveNativeDialogAutomationOptions(
  env: NativeDialogAutomationEnv = process.env as NativeDialogAutomationEnv,
): EditorNativeDialogAutomationOptions | undefined {
  const saveFilePath = env.DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH?.trim();

  return saveFilePath ? { saveFilePath } : undefined;
}

export function createUnavailableNativeDialogService(): EditorNativeDialogService {
  return {
    async selectDirectory() {
      return { canceled: true };
    },
    async saveFile() {
      return { canceled: true };
    },
  };
}

function resolveAutomatedSaveFilePath(
  saveFilePath: EditorNativeDialogAutomationOptions['saveFilePath'],
  request: EditorSaveFileDialogRequest,
): string | undefined {
  if (!saveFilePath) {
    return undefined;
  }

  return typeof saveFilePath === 'function' ? saveFilePath(request) : saveFilePath;
}
