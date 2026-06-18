import { NextResponse, type NextRequest } from 'next/server';

import {
  authorizeEditorApiRequest,
  DANBI_EDITOR_API_TOKEN_HEADER,
  DANBI_GENERIC_API_TOKEN_HEADER,
  readConfiguredEditorApiToken,
} from './server/editor/editor-api-token-auth';

export function proxy(request: NextRequest) {
  const auth = authorizeEditorApiRequest(
    {
      pathname: request.nextUrl.pathname,
      authorization: request.headers.get('authorization'),
      editorApiTokenHeader: request.headers.get(DANBI_EDITOR_API_TOKEN_HEADER),
      genericApiTokenHeader: request.headers.get(DANBI_GENERIC_API_TOKEN_HEADER),
    },
    readConfiguredEditorApiToken(),
  );

  if (auth.allowed) {
    return NextResponse.next();
  }

  const response = NextResponse.json(
    {
      error: 'Danbi editor API token required.',
      code: 'editor_api_token_required',
    },
    { status: 401 },
  );
  response.headers.set('WWW-Authenticate', 'Bearer realm="danbi-editor-api"');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/api/editor/:path*'],
};
