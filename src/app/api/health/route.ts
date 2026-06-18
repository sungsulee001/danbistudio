import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ComfyUIClient,
  comfyuiClient,
  readComfyUIClientConfig,
  validateComfyUIBaseUrl,
} from '@/lib/comfyui-client';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring system status
 */
export async function GET(request: NextRequest) {
  const requestedComfyUIUrl = request.nextUrl.searchParams.get('comfyuiUrl')?.trim() ?? '';
  const defaultComfyUIConfig = readComfyUIClientConfig();
  const clientResolution = resolveHealthComfyUIClient(requestedComfyUIUrl, defaultComfyUIConfig);
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      comfyui: false,
    },
    config: {
      comfyuiUrl: clientResolution.comfyuiUrl,
      customComfyuiUrl: Boolean(requestedComfyUIUrl),
    },
    version: '0.1.0',
  };

  if (!clientResolution.ok) {
    return NextResponse.json({
      ...health,
      status: 'degraded',
      error: clientResolution.reason,
    }, { status: 400 });
  }

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
    health.status = 'degraded';
  }

  try {
    // Check ComfyUI connection
    const isHealthy = await clientResolution.client.isHealthy();
    health.services.comfyui = isHealthy;
    if (!isHealthy) {
      health.status = 'degraded';
    }
  } catch (error) {
    console.error('ComfyUI health check failed:', error);
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

function resolveHealthComfyUIClient(
  requestedComfyUIUrl: string,
  defaultComfyUIConfig: ReturnType<typeof readComfyUIClientConfig>,
): {
  ok: true;
  client: Pick<ComfyUIClient, 'isHealthy'>;
  comfyuiUrl: string;
} | {
  ok: false;
  reason: string;
  comfyuiUrl: string;
} {
  if (!requestedComfyUIUrl) {
    return {
      ok: true,
      client: comfyuiClient,
      comfyuiUrl: defaultComfyUIConfig.baseUrl,
    };
  }

  const validation = validateComfyUIBaseUrl(requestedComfyUIUrl, {
    allowedUrls: defaultComfyUIConfig.allowedUrls,
    allowLocalhost: defaultComfyUIConfig.allowLocalhost,
  });

  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      comfyuiUrl: requestedComfyUIUrl,
    };
  }

  return {
    ok: true,
    client: new ComfyUIClient({
      ...defaultComfyUIConfig,
      baseUrl: validation.url.href,
    }),
    comfyuiUrl: validation.url.href,
  };
}
