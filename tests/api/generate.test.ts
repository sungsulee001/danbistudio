import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/generate/route';

const mocks = vi.hoisted(() => ({
  prismaCreate: vi.fn(),
  queuePrompt: vi.fn(),
  customQueuePrompt: vi.fn(),
  uploadImage: vi.fn(),
  customUploadImage: vi.fn(),
  ComfyUIClient: vi.fn(),
  loadWorkflow: vi.fn(),
  injectParameters: vi.fn(),
  readGenerateImageUpload: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    generationJob: {
      create: mocks.prismaCreate,
    },
  },
}));

vi.mock('@/lib/comfyui-client', () => ({
  ComfyUIClient: mocks.ComfyUIClient,
  comfyuiClient: {
    queuePrompt: mocks.queuePrompt,
    uploadImage: mocks.uploadImage,
  },
  readComfyUIClientConfig: () => ({
    baseUrl: 'http://localhost:8188',
    allowedUrls: ['https://remote.example'],
    allowLocalhost: true,
  }),
  validateComfyUIBaseUrl: (baseUrl: string, options: { allowedUrls?: string[]; allowLocalhost?: boolean }) => {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
      return { ok: false, reason: 'ComfyUI server URL is missing.' };
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { ok: false, reason: `ComfyUI server URL is invalid: ${baseUrl}` };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: `ComfyUI server protocol must be http or https: ${url.protocol}` };
    }

    if ((options.allowLocalhost ?? true) && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      return { ok: true, url: new URL(`${url.protocol}//${url.host}/`) };
    }

    if ((options.allowedUrls ?? []).some((entry) => new URL(entry).origin === url.origin)) {
      return { ok: true, url: new URL(`${url.protocol}//${url.host}/`) };
    }

    return {
      ok: false,
      reason: 'ComfyUI target is not allowed. Use localhost/127.0.0.1, or add the server to COMFYUI_ALLOWED_URLS for explicit remote execution.',
    };
  },
}));

vi.mock('@/lib/workflow-loader', () => ({
  loadWorkflow: mocks.loadWorkflow,
  injectParameters: mocks.injectParameters,
}));

vi.mock('@/server/generate-image-upload', () => ({
  normalizeGenerateImageUploadName: (value: unknown) => {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object' && 'name' in value) {
      const name = (value as { name?: unknown }).name;
      return typeof name === 'string' ? name : undefined;
    }

    return undefined;
  },
  readGenerateImageUpload: mocks.readGenerateImageUpload,
}));

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkflow.mockReturnValue({
      '1': {
        class_type: 'TestNode',
        inputs: {
          prompt: 'base',
        },
      },
    });
    mocks.injectParameters.mockReturnValue({
      '1': {
        class_type: 'TestNode',
        inputs: {
          prompt: 'A person talking',
          seed: 12345,
          steps: 25,
        },
      },
    });
    mocks.queuePrompt.mockResolvedValue({
      prompt_id: 'prompt-123',
      number: 1,
    });
    mocks.customQueuePrompt.mockResolvedValue({
      prompt_id: 'prompt-custom',
      number: 2,
    });
    mocks.uploadImage.mockResolvedValue({
      name: 'reference.png',
      subfolder: '',
      type: 'input',
    });
    mocks.customUploadImage.mockResolvedValue({
      name: 'custom-reference.png',
      subfolder: '',
      type: 'input',
    });
    mocks.ComfyUIClient.mockImplementation(function MockComfyUIClient(
      this: { queuePrompt?: typeof mocks.customQueuePrompt; uploadImage?: typeof mocks.customUploadImage },
    ) {
      this.queuePrompt = mocks.customQueuePrompt;
      this.uploadImage = mocks.customUploadImage;
    });
    mocks.readGenerateImageUpload.mockResolvedValue({
      originalName: 'reference.png',
      name: 'saved-reference.png',
      mimeType: 'image/png',
      size: 4,
      source: '/imports/generate/saved-reference.png',
      filePath: 'E:/tmp/saved-reference.png',
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    mocks.prismaCreate.mockResolvedValue({
      id: 'test-job-123',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: JSON.stringify({ prompt: 'A person talking', seed: 12345, steps: 25 }),
      promptId: 'prompt-123',
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
    });
  });

  it('creates a running job after loading, parameterizing, and queueing the workflow', async () => {
    const requestBody = {
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: {
        prompt: 'A person talking',
        seed: 12345,
        steps: 25,
        outputFormat: 'MP4',
      },
    };

    const response = await POST(createJsonRequest(requestBody) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadWorkflow).toHaveBeenCalledWith('wan_i2v');
    expect(mocks.injectParameters).toHaveBeenCalledWith(expect.any(Object), requestBody.parameters);
    expect(mocks.queuePrompt).toHaveBeenCalledWith(expect.objectContaining({
      '1': expect.objectContaining({
        inputs: expect.objectContaining({ prompt: 'A person talking' }),
      }),
    }));
    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: {
        status: 'running',
        modelName: 'wan_i2v',
        workflowName: 'wan_i2v',
        parameters: JSON.stringify(requestBody.parameters),
        promptId: 'prompt-123',
      },
    });
    expect(data).toMatchObject({
      id: 'test-job-123',
      status: 'running',
      promptId: 'prompt-123',
    });
  });

  it('returns 400 for missing required fields before loading a workflow', async () => {
    const response = await POST(createJsonRequest({ parameters: {} }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required fields');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid numeric parameters before loading a workflow', async () => {
    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: {
        prompt: 'A person talking',
        seed: 12345,
        steps: null,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Steps must be an integer from 1 to 100.');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for unsafe workflow names before loading a workflow', async () => {
    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: '../secret',
      parameters: {
        seed: 1,
        steps: 1,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Workflow name must contain only letters, numbers, dashes, or underscores.');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });


  it('returns 400 for invalid output formats before loading a workflow', async () => {
    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: {
        prompt: 'A person talking',
        seed: 12345,
        steps: 20,
        outputFormat: 'WEBM',
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Output format must be MP4, PNG, or JPG.');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });

  it('queues against the requested ComfyUI URL with the configured safety policy', async () => {
    mocks.prismaCreate.mockResolvedValueOnce({
      id: 'test-job-custom',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: JSON.stringify({
        prompt: 'A person talking',
        seed: 12345,
        steps: 25,
      }),
      promptId: 'prompt-custom',
      createdAt: new Date('2026-06-14T01:02:03.000Z'),
    });

    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      comfyuiUrl: 'http://127.0.0.1:8189',
      parameters: {
        prompt: 'A person talking',
        seed: 12345,
        steps: 25,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.ComfyUIClient).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:8189/',
      allowedUrls: ['https://remote.example'],
      allowLocalhost: true,
    });
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.customQueuePrompt).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: {
        status: 'running',
        modelName: 'wan_i2v',
        workflowName: 'wan_i2v',
        parameters: JSON.stringify({
          prompt: 'A person talking',
          seed: 12345,
          steps: 25,
          comfyuiUrl: 'http://127.0.0.1:8189/',
        }),
        promptId: 'prompt-custom',
      },
    });
    expect(data).toMatchObject({
      id: 'test-job-custom',
      status: 'running',
      promptId: 'prompt-custom',
    });
  });

  it('returns 400 for disallowed requested ComfyUI URLs before loading a workflow', async () => {
    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      comfyuiUrl: 'https://blocked.example:8188',
      parameters: {
        seed: 1,
        steps: 1,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('ComfyUI target is not allowed');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.customQueuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });

  it('uploads a selected source image to ComfyUI before queueing image workflows', async () => {
    mocks.injectParameters.mockReturnValueOnce({
      '1': {
        class_type: 'ImageWorkflowNode',
        inputs: {
          prompt: 'A person walking',
          image: 'reference.png',
        },
      },
    });

    const requestBody = {
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: {
        prompt: 'A person walking',
        seed: 222,
        steps: 18,
      },
      image: {
        name: 'saved-reference.png',
      },
    };

    const response = await POST(createJsonRequest(requestBody) as never);
    const data = await response.json();

    const expectedParameters = {
      prompt: 'A person walking',
      seed: 222,
      steps: 18,
      image: 'reference.png',
      imageFilename: 'reference.png',
      imageSource: '/imports/generate/saved-reference.png',
      imageUploadName: 'saved-reference.png',
      imageMimeType: 'image/png',
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: 'test-job-123',
      status: 'running',
      promptId: 'prompt-123',
    });
    expect(mocks.readGenerateImageUpload).toHaveBeenCalledWith('saved-reference.png');
    expect(mocks.uploadImage).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]), {
      filename: 'reference.png',
      mimeType: 'image/png',
      type: 'input',
      overwrite: true,
    });
    expect(mocks.injectParameters).toHaveBeenCalledWith(expect.any(Object), expectedParameters);
    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: {
        status: 'running',
        modelName: 'wan_i2v',
        workflowName: 'wan_i2v',
        parameters: JSON.stringify(expectedParameters),
        promptId: 'prompt-123',
      },
    });
  });

  it('routes uploaded images from the default B-roll workflow to the reference-image workflow', async () => {
    mocks.prismaCreate.mockResolvedValueOnce({
      id: 'test-job-reference',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'broll_reference_i2v',
      parameters: '{}',
      promptId: 'prompt-123',
      createdAt: new Date('2026-06-14T01:02:03.000Z'),
    });

    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'broll_i2v',
      parameters: {
        prompt: 'Reference-guided desk cutaway',
        seed: 333,
        steps: 18,
      },
      image: {
        name: 'saved-reference.png',
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('test-job-reference');
    expect(mocks.loadWorkflow).toHaveBeenCalledWith('broll_reference_i2v');
    expect(mocks.prismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        modelName: 'wan_i2v',
        workflowName: 'broll_reference_i2v',
        promptId: 'prompt-123',
      }),
    });
  });

  it('rejects the reference-image workflow when no image was uploaded', async () => {
    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'broll_reference_i2v',
      parameters: {
        seed: 1,
        steps: 1,
      },
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Reference image workflow requires an uploaded image.');
    expect(mocks.loadWorkflow).not.toHaveBeenCalled();
    expect(mocks.queuePrompt).not.toHaveBeenCalled();
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });

  it('returns the created job id, status, prompt id, and timestamp', async () => {
    mocks.prismaCreate.mockResolvedValueOnce({
      id: 'test-job-456',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: 'prompt-456',
      createdAt: new Date('2026-06-14T01:02:03.000Z'),
    });
    mocks.queuePrompt.mockResolvedValueOnce({
      prompt_id: 'prompt-456',
      number: 2,
    });

    const response = await POST(createJsonRequest({
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: {},
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: 'test-job-456',
      status: 'running',
      promptId: 'prompt-456',
      createdAt: '2026-06-14T01:02:03.000Z',
    });
  });
});
