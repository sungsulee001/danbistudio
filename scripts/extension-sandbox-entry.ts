import {
  handleExtensionSandboxCommandRequest,
  handleExtensionSandboxHandshakeRequest,
  EXTENSION_SANDBOX_COMMAND_REQUEST_KIND,
  EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
  EXTENSION_SANDBOX_PROTOCOL_VERSION,
  type ExtensionSandboxCommandResponse,
  type ExtensionSandboxHandshakeResponse,
} from '../src/electron/shared/extension-api';

async function main(): Promise<void> {
  const input = await readStdin();
  let request: unknown;

  try {
    request = input.trim() ? JSON.parse(input) as unknown : {};
  } catch (error) {
    writeResponse({
      kind: EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
      protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
      pluginId: 'unknown',
      accepted: false,
      status: 'blocked',
      runtime: 'external-process-handshake',
      codeExecution: 'disabled',
      permissions: [],
      declaredApis: [],
      executableApis: [],
      warnings: [`Sandbox handshake request must be valid JSON: ${(error as Error).message}`],
      reason: 'Sandbox handshake request was not valid JSON.',
    });
    return;
  }

  if (isRecord(request) && request.kind === EXTENSION_SANDBOX_COMMAND_REQUEST_KIND) {
    writeResponse(handleExtensionSandboxCommandRequest(request));
    return;
  }

  writeResponse(handleExtensionSandboxHandshakeRequest(request));
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function writeResponse(response: ExtensionSandboxHandshakeResponse | ExtensionSandboxCommandResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

void main().catch((error) => {
  writeResponse({
    kind: EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    pluginId: 'unknown',
    accepted: false,
    status: 'blocked',
    runtime: 'external-process-handshake',
    codeExecution: 'disabled',
    permissions: [],
    declaredApis: [],
    executableApis: [],
    warnings: [(error as Error).message],
    reason: 'Sandbox handshake failed before a plugin manifest could be accepted.',
  });
});
