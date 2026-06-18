import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type {
  ExtensionSandboxCommandRequest,
  ExtensionSandboxCommandResponse,
  ExtensionSandboxHandshakeRequest,
  ExtensionSandboxHandshakeResponse,
} from '../shared/extension-api';
import {
  EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND,
  EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
} from '../shared/extension-api';

export interface ExtensionSandboxProcessHandshakeOptions {
  request: ExtensionSandboxHandshakeRequest;
  command?: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExtensionSandboxProcessCommandOptions {
  request: ExtensionSandboxCommandRequest;
  command?: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export async function runExtensionSandboxProcessHandshake({
  request,
  command = process.execPath,
  args = [resolve(process.cwd(), 'scripts', 'extension-sandbox.mjs')],
  cwd = process.cwd(),
  timeoutMs = 3000,
  maxOutputBytes = 1024 * 1024,
}: ExtensionSandboxProcessHandshakeOptions): Promise<ExtensionSandboxHandshakeResponse> {
  return runExtensionSandboxProcessRequest<ExtensionSandboxHandshakeResponse>({
    request,
    command,
    args,
    cwd,
    timeoutMs,
    maxOutputBytes,
    expectedResponseKind: EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
    label: 'handshake',
  });
}

export async function runExtensionSandboxProcessCommand({
  request,
  command = process.execPath,
  args = [resolve(process.cwd(), 'scripts', 'extension-sandbox.mjs')],
  cwd = process.cwd(),
  timeoutMs = 3000,
  maxOutputBytes = 1024 * 1024,
}: ExtensionSandboxProcessCommandOptions): Promise<ExtensionSandboxCommandResponse> {
  return runExtensionSandboxProcessRequest<ExtensionSandboxCommandResponse>({
    request,
    command,
    args,
    cwd,
    timeoutMs,
    maxOutputBytes,
    expectedResponseKind: EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND,
    label: 'command',
  });
}

function runExtensionSandboxProcessRequest<TResponse extends { kind: string }>({
  request,
  command,
  args,
  cwd,
  timeoutMs,
  maxOutputBytes,
  expectedResponseKind,
  label,
}: {
  request: ExtensionSandboxHandshakeRequest | ExtensionSandboxCommandRequest;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  expectedResponseKind: string;
  label: string;
}): Promise<TResponse> {
  return new Promise((resolveResponse, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        DANBI_EXTENSION_SANDBOX_HANDSHAKE: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          child.kill();
          reject(new Error(`Extension sandbox ${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs)
      : undefined;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > maxOutputBytes && !settled) {
        settled = true;
        child.kill();
        reject(new Error(`Extension sandbox ${label} stdout exceeded the output limit.`));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > maxOutputBytes && !settled) {
        settled = true;
        child.kill();
        reject(new Error(`Extension sandbox ${label} stderr exceeded the output limit.`));
      }
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }

      if (code !== 0) {
        reject(new Error(`Extension sandbox ${label} exited with code ${code}: ${stderr.trim() || 'no stderr'}`));
        return;
      }

      try {
        const response = JSON.parse(readLastJsonLine(stdout)) as TResponse;
        if (response.kind !== expectedResponseKind) {
          reject(new Error(`Extension sandbox ${label} returned an unexpected response kind.`));
          return;
        }

        resolveResponse(response);
      } catch (error) {
        reject(new Error(`Extension sandbox ${label} returned invalid JSON: ${(error as Error).message}`));
      }
    });

    child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
  });
}

function readLastJsonLine(output: string): string {
  const line = output.trim().split(/\r?\n/g).filter(Boolean).at(-1);
  if (!line) {
    throw new Error('empty stdout');
  }

  return line;
}
