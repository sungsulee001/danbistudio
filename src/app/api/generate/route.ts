import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comfyuiClient } from '@/lib/comfyui-client';
import { loadWorkflow, injectParameters } from '@/lib/workflow-loader';

/**
 * POST /api/generate
 *
 * Creates a new generation job and queues it to ComfyUI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelName, workflowName, parameters } = body;

    // Validate required fields
    if (!modelName || !workflowName) {
      return NextResponse.json(
        { error: 'Missing required fields: modelName, workflowName' },
        { status: 400 }
      );
    }

    // Load and prepare workflow
    const baseWorkflow = loadWorkflow(workflowName);
    const workflow = parameters
      ? injectParameters(baseWorkflow, parameters)
      : baseWorkflow;

    // Queue to ComfyUI
    const { prompt_id } = await comfyuiClient.queuePrompt(workflow);

    // Create job in database
    const job = await prisma.generationJob.create({
      data: {
        status: 'pending',
        modelName,
        workflowName,
        parameters: JSON.stringify(parameters || {}),
        promptId: prompt_id,
      },
    });

    return NextResponse.json({
      id: job.id,
      status: job.status,
      promptId: job.promptId,
      createdAt: job.createdAt,
    });
  } catch (error) {
    console.error('Error creating generation job:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
