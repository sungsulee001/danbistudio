import { resolve } from 'node:path';

export function getLocalDataRoot(rootDir?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (rootDir !== undefined) {
    return resolve(rootDir, '.danbi');
  }

  const configuredRoot = env.DANBI_LOCAL_DATA_ROOT?.trim();
  if (configuredRoot) {
    assertSafeLocalDataRoot(configuredRoot, 'DANBI_LOCAL_DATA_ROOT');
    return resolve(configuredRoot);
  }

  const electronUserDataRoot = env.DANBI_ELECTRON_USER_DATA?.trim();
  if (electronUserDataRoot) {
    assertSafeLocalDataRoot(electronUserDataRoot, 'DANBI_ELECTRON_USER_DATA');
    return resolve(electronUserDataRoot);
  }

  return resolve(process.cwd(), '.danbi');
}

function assertSafeLocalDataRoot(value: string, label: string): void {
  if (value.includes('\0')) {
    throw new Error(`${label} cannot contain null bytes.`);
  }
  if (hasBlockedLocalDataRootProtocol(value)) {
    throw new Error(`${label} must be a local filesystem path, not a URL or shell protocol.`);
  }
  if (hasBlockedWindowsDevicePath(value)) {
    throw new Error(`${label} cannot use a Windows device namespace path.`);
  }
}

function hasBlockedLocalDataRootProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|pipe|crypto|concat|subfile|tcp|udp):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}
