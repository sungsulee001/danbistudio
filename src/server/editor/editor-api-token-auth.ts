export const DANBI_EDITOR_API_TOKEN_ENV = 'DANBI_EDITOR_API_TOKEN';
export const DANBI_EDITOR_API_TOKEN_HEADER = 'x-danbi-editor-api-token';
export const DANBI_GENERIC_API_TOKEN_HEADER = 'x-danbi-api-token';

export interface EditorApiTokenAuthRequest {
  pathname: string;
  authorization?: string | null;
  editorApiTokenHeader?: string | null;
  genericApiTokenHeader?: string | null;
}

export interface EditorApiTokenAuthResult {
  allowed: boolean;
  required: boolean;
  reason:
    | 'out-of-scope'
    | 'not-configured'
    | 'valid-token'
    | 'missing-or-invalid-token';
}

export function readConfiguredEditorApiToken(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return normalizeEditorApiToken(env[DANBI_EDITOR_API_TOKEN_ENV]);
}

export function authorizeEditorApiRequest(
  request: EditorApiTokenAuthRequest,
  configuredToken: string | undefined,
): EditorApiTokenAuthResult {
  if (!isEditorApiPath(request.pathname)) {
    return { allowed: true, required: false, reason: 'out-of-scope' };
  }

  const expectedToken = normalizeEditorApiToken(configuredToken);
  if (!expectedToken) {
    return { allowed: true, required: false, reason: 'not-configured' };
  }

  const candidates = readEditorApiTokenCandidates(request);
  if (candidates.some((candidate) => constantTimeTokenEqual(candidate, expectedToken))) {
    return { allowed: true, required: true, reason: 'valid-token' };
  }

  return { allowed: false, required: true, reason: 'missing-or-invalid-token' };
}

export function readEditorApiTokenCandidates(request: EditorApiTokenAuthRequest): string[] {
  return [
    readBearerToken(request.authorization),
    normalizeEditorApiToken(request.editorApiTokenHeader),
    normalizeEditorApiToken(request.genericApiTokenHeader),
  ].filter((value): value is string => Boolean(value));
}

export function isEditorApiPath(pathname: string): boolean {
  return pathname === '/api/editor' || pathname.startsWith('/api/editor/');
}

export function readBearerToken(value: string | null | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return normalizeEditorApiToken(match?.[1]);
}

export function normalizeEditorApiToken(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function constantTimeTokenEqual(candidate: string, expected: string): boolean {
  const left = candidate.normalize();
  const right = expected.normalize();
  let mismatch = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
