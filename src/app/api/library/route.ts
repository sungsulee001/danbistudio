import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ComfyUIClient,
  comfyuiClient,
  readComfyUIClientConfig,
  validateComfyUIBaseUrl,
} from '@/lib/comfyui-client';
import { extractOutputPath, getComfyUIOutputPath, saveResultFile } from '@/lib/result-handler';

interface LibraryGenerationJobRecord {
  id: string;
  status: string;
  modelName: string;
  workflowName: string;
  parameters: string;
  promptId: string | null;
  resultPath: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const ACTIVE_REFRESH_LIMIT = 5;
const activeStatuses = new Set(['pending', 'running']);

export async function GET(request: NextRequest) {
  try {
    const limit = resolveLibraryLimit(request.nextUrl.searchParams.get('limit'));
    const jobs = await prisma.generationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const refreshedJobs = await refreshActiveLibraryJobs(jobs);

    return NextResponse.json({
      jobs: refreshedJobs.map(serializeLibraryJob),
      count: refreshedJobs.length,
    });
  } catch (error) {
    console.error('Error loading generation library:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

function serializeLibraryJob(job: LibraryGenerationJobRecord) {
  return {
    id: job.id,
    status: job.status,
    modelName: job.modelName,
    workflowName: job.workflowName,
    parameters: parseJobParameters(job.parameters),
    promptId: job.promptId ?? undefined,
    resultPath: job.resultPath ?? undefined,
    error: job.error ?? undefined,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function refreshActiveLibraryJobs(
  jobs: LibraryGenerationJobRecord[],
): Promise<LibraryGenerationJobRecord[]> {
  let refreshBudget = ACTIVE_REFRESH_LIMIT;
  const refreshedJobs: LibraryGenerationJobRecord[] = [];

  for (const job of jobs) {
    if (refreshBudget > 0 && activeStatuses.has(job.status) && job.promptId) {
      refreshBudget -= 1;
      refreshedJobs.push(await refreshActiveLibraryJob(job));
    } else {
      refreshedJobs.push(job);
    }
  }

  return refreshedJobs;
}

async function refreshActiveLibraryJob(
  job: LibraryGenerationJobRecord,
): Promise<LibraryGenerationJobRecord> {
  try {
    const promptStatus = await resolveLibraryComfyUIClient(parseJobParameters(job.parameters)).getPromptStatus(job.promptId!);

    if (promptStatus.status === 'success') {
      const captureResult = await captureLibraryPromptResult(promptStatus.outputs, job.id);

      return await prisma.generationJob.update({
        where: { id: job.id },
        data: captureResult.ok
          ? {
            status: 'completed',
            resultPath: captureResult.resultPath,
          }
          : {
            status: 'failed',
            error: captureResult.error,
          },
      }) as LibraryGenerationJobRecord;
    }

    if (promptStatus.status === 'error') {
      return await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'ComfyUI execution failed',
        },
      }) as LibraryGenerationJobRecord;
    }
  } catch (error) {
    console.error('Error refreshing library job status:', error);
  }

  return job;
}

async function captureLibraryPromptResult(
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
    const result = await saveResultFile(getComfyUIOutputPath(outputFilename), jobId);
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

function resolveLibraryComfyUIClient(
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

function parseJobParameters(parameters: string): unknown {
  try {
    return JSON.parse(parameters);
  } catch {
    return null;
  }
}

function resolveLibraryLimit(rawLimit: string | null): number {
  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }

  const value = Number(rawLimit);
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
