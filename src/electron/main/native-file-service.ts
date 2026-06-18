import path from 'path';
import type { EditorFilePathRequest, EditorFilePathResponse } from '../shared/ipc-contract';

export interface ElectronShellLike {
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

export interface EditorNativeFileService {
  openPath(request: EditorFilePathRequest): Promise<EditorFilePathResponse>;
  revealInFolder(request: EditorFilePathRequest): Promise<EditorFilePathResponse>;
}

export function createEditorNativeFileService(shell: ElectronShellLike): EditorNativeFileService {
  return {
    async openPath(request) {
      const validated = validateNativeShellFilePath(request);
      if (!validated.ok) {
        return validated;
      }

      try {
        const error = await shell.openPath(validated.path);
        return {
          ok: !error,
          path: validated.path,
          ...(error ? { error } : {}),
        };
      } catch (error) {
        return {
          ok: false,
          path: validated.path,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async revealInFolder(request) {
      const validated = validateNativeShellFilePath(request);
      if (!validated.ok) {
        return validated;
      }

      try {
        shell.showItemInFolder(validated.path);
        return {
          ok: true,
          path: validated.path,
        };
      } catch (error) {
        return {
          ok: false,
          path: validated.path,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function validateNativeShellFilePath(
  request: Partial<EditorFilePathRequest> | undefined,
): EditorFilePathResponse {
  const requestedPath = typeof request?.path === 'string' ? request.path.trim() : '';

  if (!requestedPath) {
    return {
      ok: false,
      path: requestedPath,
      error: 'Native file actions require a local absolute file path.',
    };
  }

  if (requestedPath.includes('\0')) {
    return {
      ok: false,
      path: requestedPath,
      error: 'Native file actions cannot open paths containing null bytes.',
    };
  }

  if (hasBlockedShellProtocol(requestedPath)) {
    return {
      ok: false,
      path: requestedPath,
      error: 'Native file actions only accept filesystem paths, not URLs or shell protocols.',
    };
  }

  if (hasBlockedWindowsDevicePath(requestedPath)) {
    return {
      ok: false,
      path: requestedPath,
      error: 'Native file actions cannot open Windows device namespace paths.',
    };
  }

  if (!isAbsoluteFilesystemPath(requestedPath)) {
    return {
      ok: false,
      path: requestedPath,
      error: 'Native file actions require a local absolute file path.',
    };
  }

  return {
    ok: true,
    path: requestedPath,
  };
}

function hasBlockedShellProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|ms-appx):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}

function isAbsoluteFilesystemPath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

export function createUnavailableNativeFileService(): EditorNativeFileService {
  return {
    async openPath(request) {
      return {
        ok: false,
        path: request.path,
        error: 'Native file open service is not available.',
      };
    },
    async revealInFolder(request) {
      return {
        ok: false,
        path: request.path,
        error: 'Native file reveal service is not available.',
      };
    },
  };
}
