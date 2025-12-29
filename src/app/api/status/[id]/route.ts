import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comfyuiClient } from '@/lib/comfyui-client';
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
    const job = await prisma.generationJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // If job is still running, check ComfyUI status
    if (job.status === 'running' && job.promptId) {
      try {
        const promptStatus = await comfyuiClient.getPromptStatus(job.promptId);

        // Update job status if changed
        if (promptStatus.status === 'success') {
          // Extract and save result file
          let resultPath: string | undefined;

          try {
            const outputFilename = extractOutputPath(promptStatus.outputs);
            if (outputFilename) {
              const comfyuiPath = getComfyUIOutputPath(outputFilename);
              const result = await saveResultFile(comfyuiPath, id);
              resultPath = result.savedPath;
            }
          } catch (error) {
            console.error('Error saving result file:', error);
          }

          await prisma.generationJob.update({
            where: { id },
            data: {
              status: 'completed',
              resultPath,
            },
          });
        } else if (promptStatus.status === 'error') {
          await prisma.generationJob.update({
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
      parameters: JSON.parse(job.parameters),
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
