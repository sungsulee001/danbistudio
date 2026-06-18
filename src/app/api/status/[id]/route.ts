import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ComfyUIClient,
  comfyuiClient,
  readComfyUIClientConfig,
  validateComfyUIBaseUrl,
} from '@/lib/comfyui-client';
import { extractOutputPath, getComfyUIOutputPath, saveResultFile } from '@/lib/result-handler';

/**
 * GET /api/status/[id]
 *
 * Returns the status and details of a generation job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find job in database
    let job = await prisma.generationJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const parameters = parseJobParameters(job.parameters);

    // If job is still active, check ComfyUI status. Older local databases may
    // still contain queued jobs saved as "pending", so poll those too.
    if ((job.status === 'running' || job.status === 'pending') && job.promptId) {
      try {
        const promptStatus = await resolveStatusComfyUIClient(parameters).getPromptStatus(job.promptId);

        // Update job status if changed
        if (promptStatus.status === 'success') {
          const captureResult = await capturePromptResult(promptStatus.outputs, id);

          job = await prisma.generationJob.update({
            where: { id },
            data: captureResult.ok
              ? {
                status: 'completed',
                resultPath: captureResult.resultPath,
              }
              : {
                status: 'failed',
                error: captureResult.error,
              },
          });
        } else if (promptStatus.status === 'error') {
          job = await prisma.generationJob.update({
            where: { id },
            data: {
              status: 'failed',
              error: 'ComfyUI execution failed',
            },
          });
        }
      } catch (error) {
        console.error('Error checking ComfyUI status:', error);
        // Continue with database status
      }
    }

    // Return current job status
    const response: any = {
      id: job.id,
      status: job.status,
      modelName: job.modelName,
      workflowName: job.workflowName,
      parameters,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    if (job.promptId) {
      response.promptId = job.promptId;
    }

    if (job.resultPath) {
      response.resultPath = job.resultPath;
    }

    if (job.error) {
      response.error = job.error;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

async function capturePromptResult(
  outputs: unknown,
  jobId: string,
): Promise<{ ok: true; resultPath: string } | { ok: false; error: string }> {
  const outputFilename = extractOutputPath(outputs);
  if (!outputFilename) {
    return {
      ok: false,
      error: 'ComfyUI completed without an output file.',
    };
  }

  try {
    const comfyuiPath = getComfyUIOutputPath(outputFilename);
    const result = await saveResultFile(comfyuiPath, jobId);
    return {
      ok: true,
      resultPath: result.savedPath,
    };
  } catch (error) {
    return {
      ok: false,
      error: `ComfyUI completed but result capture failed: ${formatErrorMessage(error)}`,
    };
  }
}

function parseJobParameters(parameters: string): unknown {
  try {
    return JSON.parse(parameters);
  } catch {
    return null;
  }
}

function resolveStatusComfyUIClient(
  parameters: unknown,
): Pick<ComfyUIClient, 'getPromptStatus'> {
  const comfyuiUrl = readComfyUIUrlFromParameters(parameters);
  if (!comfyuiUrl) {
    return comfyuiClient;
  }

  const config = readComfyUIClientConfig();
  const validation = validateComfyUIBaseUrl(comfyuiUrl, {
    allowedUrls: config.allowedUrls,
    allowLocalhost: config.allowLocalhost,
  });
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return new ComfyUIClient({
    ...config,
    baseUrl: validation.url.href,
  });
}

function readComfyUIUrlFromParameters(parameters: unknown): string {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return '';
  }

  const value = (parameters as Record<string, unknown>).comfyuiUrl;
  return typeof value === 'string' ? value.trim() : '';
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
