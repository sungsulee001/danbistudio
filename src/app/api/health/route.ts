import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comfyuiClient } from '@/lib/comfyui-client';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring system status
 */
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      comfyui: false,
    },
    version: '0.1.0',
  };

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
    const isHealthy = await comfyuiClient.isHealthy();
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
