import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ComfyUIClient,
  comfyuiClient,
  readComfyUIClientConfig,
  validateComfyUIBaseUrl,
} from '@/lib/comfyui-client';
import { parseGenerateOutputFormat } from '@/lib/generate-settings';
import { loadWorkflow, injectParameters } from '@/lib/workflow-loader';
import { normalizeGenerateImageUploadName, readGenerateImageUpload } from '@/server/generate-image-upload';
import {
  DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME,
  resolveGenerateWorkflowName,
} from '@/lib/comfyui-workflow-defaults';

/**
 * POST /api/generate
 *
 * Creates a new generation job and queues it to ComfyUI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : '';
    const workflowName = typeof body.workflowName === 'string' ? body.workflowName.trim() : '';
    const comfyuiUrl = typeof body.comfyuiUrl === 'string' ? body.comfyuiUrl.trim() : '';
    const imageUploadName = normalizeGenerateImageUploadName(body.image);

    // Validate required fields
    if (!modelName || !workflowName) {
      return NextResponse.json(
        { error: 'Missing required fields: modelName, workflowName' },
        { status: 400 }
      );
    }

    if (!isSafeWorkflowName(workflowName)) {
      return NextResponse.json(
        { error: 'Workflow name must contain only letters, numbers, dashes, or underscores.' },
        { status: 400 },
      );
    }

    if (workflowName === DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME && !imageUploadName) {
      return NextResponse.json(
        { error: 'Reference image workflow requires an uploaded image.' },
        { status: 400 },
      );
    }

    let preparedParameters: Record<string, unknown>;
    let generationComfyUIClient: Pick<ComfyUIClient, 'queuePrompt' | 'uploadImage'>;
    try {
      preparedParameters = normalizeGenerateParameters(
        body.parameters && typeof body.parameters === 'object' ? body.parameters : {},
      );
      const clientResolution = createGenerateComfyUIClient(comfyuiUrl);
      generationComfyUIClient = clientResolution.client;
      if (clientResolution.comfyuiUrl) {
        preparedParameters.comfyuiUrl = clientResolution.comfyuiUrl;
      }
    } catch (validationError) {
      return NextResponse.json(
        { error: (validationError as Error).message },
        { status: 400 },
      );
    }

    if (imageUploadName) {
      const image = await readGenerateImageUpload(imageUploadName);
      const uploadedImage = await generationComfyUIClient.uploadImage(image.bytes, {
        filename: image.originalName,
        mimeType: image.mimeType,
        type: 'input',
        overwrite: true,
      });

      preparedParameters.image = uploadedImage.name;
      preparedParameters.imageFilename = uploadedImage.name;
      preparedParameters.imageSource = image.source;
      preparedParameters.imageUploadName = image.name;
      preparedParameters.imageMimeType = image.mimeType;
    }

    // Load and prepare workflow
    const finalWorkflowName = resolveGenerateWorkflowName(workflowName, Boolean(imageUploadName));
    const baseWorkflow = loadWorkflow(finalWorkflowName);
    const workflow = Object.keys(preparedParameters).length > 0
      ? injectParameters(baseWorkflow, preparedParameters)
      : baseWorkflow;

    // Queue to ComfyUI
    const { prompt_id } = await generationComfyUIClient.queuePrompt(workflow);

    // Create job in database
    const job = await prisma.generationJob.create({
      data: {
        status: 'running',
        modelName,
        workflowName: finalWorkflowName,
        parameters: JSON.stringify(preparedParameters),
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

function normalizeGenerateParameters(parameters: object): Record<string, unknown> {
  const normalized = { ...parameters } as Record<string, unknown>;

  if ('prompt' in normalized && typeof normalized.prompt !== 'string') {
    throw new Error('Prompt must be text.');
  }

  if ('seed' in normalized) {
    normalized.seed = normalizeIntegerParameter(normalized.seed, 'Seed', {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
  }

  if ('steps' in normalized) {
    normalized.steps = normalizeIntegerParameter(normalized.steps, 'Steps', {
      min: 1,
      max: 100,
    });
  }

  if ('outputFormat' in normalized) {
    const outputFormat = parseGenerateOutputFormat(normalized.outputFormat);
    if (!outputFormat) {
      throw new Error('Output format must be MP4, PNG, or JPG.');
    }
    normalized.outputFormat = outputFormat;
  }

  return normalized;
}

function createGenerateComfyUIClient(
  comfyuiUrl: string,
): {
  client: Pick<ComfyUIClient, 'queuePrompt' | 'uploadImage'>;
  comfyuiUrl?: string;
} {
  if (!comfyuiUrl) {
    return { client: comfyuiClient };
  }

  const config = readComfyUIClientConfig();
  const validation = validateComfyUIBaseUrl(comfyuiUrl, {
    allowedUrls: config.allowedUrls,
    allowLocalhost: config.allowLocalhost,
  });
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return {
    client: new ComfyUIClient({
      ...config,
      baseUrl: validation.url.href,
    }),
    comfyuiUrl: validation.url.href,
  };
}

function normalizeIntegerParameter(
  value: unknown,
  label: string,
  range: { min: number; max: number },
): number {
  const numberValue = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;

  if (
    typeof numberValue !== 'number' ||
    !Number.isFinite(numberValue) ||
    !Number.isInteger(numberValue) ||
    numberValue < range.min ||
    numberValue > range.max
  ) {
    throw new Error(`${label} must be an integer from ${range.min} to ${range.max}.`);
  }

  return numberValue;
}

function isSafeWorkflowName(workflowName: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(workflowName);
}
