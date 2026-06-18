import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/status/[id]/route';

const mocks = vi.hoisted(() => ({
  prismaFindUnique: vi.fn(),
  prismaUpdate: vi.fn(),
  getPromptStatus: vi.fn(),
  customGetPromptStatus: vi.fn(),
  ComfyUIClient: vi.fn(),
  validateComfyUIBaseUrl: vi.fn(),
  extractOutputPath: vi.fn(),
  getComfyUIOutputPath: vi.fn(),
  saveResultFile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    generationJob: {
      findUnique: mocks.prismaFindUnique,
      update: mocks.prismaUpdate,
    },
  },
}));

vi.mock('@/lib/comfyui-client', () => ({
  comfyuiClient: {
    getPromptStatus: mocks.getPromptStatus,
  },
  readComfyUIClientConfig: () => ({
    baseUrl: 'http://localhost:8188',
    allowedUrls: ['https://remote.example'],
    allowLocalhost: true,
  }),
  validateComfyUIBaseUrl: mocks.validateComfyUIBaseUrl,
  ComfyUIClient: mocks.ComfyUIClient,
}));

vi.mock('@/lib/result-handler', () => ({
  extractOutputPath: mocks.extractOutputPath,
  getComfyUIOutputPath: mocks.getComfyUIOutputPath,
  saveResultFile: mocks.saveResultFile,
}));

function createGetRequest(id: string): Request {
  return new Request(`http://localhost/api/status/${id}`, {
    method: 'GET',
  });
}

describe('GET /api/status/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customGetPromptStatus.mockResolvedValue({
      status: 'running',
      outputs: {},
    });
    mocks.validateComfyUIBaseUrl.mockImplementation((
      baseUrl: string,
      options: { allowedUrls?: string[]; allowLocalhost?: boolean },
    ) => {
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
    });
    mocks.ComfyUIClient.mockImplementation(function MockComfyUIClient(
      this: { getPromptStatus?: typeof mocks.customGetPromptStatus },
    ) {
      this.getPromptStatus = mocks.customGetPromptStatus;
    });
  });

  it('returns job status from the database', async () => {
    const jobId = 'test-job-123';

    mocks.prismaFindUnique.mockResolvedValueOnce({
      id: jobId,
      status: 'completed',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{"prompt":"test"}',
      promptId: 'prompt-123',
      resultPath: '/outputs/result.mp4',
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    });

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prismaFindUnique).toHaveBeenCalledWith({
      where: { id: jobId },
    });
    expect(data).toMatchObject({
      id: jobId,
      status: 'completed',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: { prompt: 'test' },
      promptId: 'prompt-123',
      resultPath: '/outputs/result.mp4',
    });
  });

  it('returns 404 for a non-existent job', async () => {
    mocks.prismaFindUnique.mockResolvedValueOnce(null);

    const response = await GET(createGetRequest('non-existent-id') as never, {
      params: Promise.resolve({ id: 'non-existent-id' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Job not found' });
  });

  it('includes result path when a job is completed', async () => {
    const jobId = 'completed-job';
    const resultPath = '/outputs/video_123.mp4';

    mocks.prismaFindUnique.mockResolvedValueOnce({
      id: jobId,
      status: 'completed',
      resultPath,
      error: null,
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    });

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.resultPath).toBe(resultPath);
  });

  it('includes error message when a job failed', async () => {
    const jobId = 'failed-job';
    const errorMessage = 'GPU out of memory';

    mocks.prismaFindUnique.mockResolvedValueOnce({
      id: jobId,
      status: 'failed',
      error: errorMessage,
      resultPath: null,
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    });

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.error).toBe(errorMessage);
  });

  it('keeps malformed job parameters from breaking the status response', async () => {
    const jobId = 'malformed-parameters-job';

    mocks.prismaFindUnique.mockResolvedValueOnce({
      id: jobId,
      status: 'failed',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{not-json',
      promptId: null,
      resultPath: null,
      error: 'Previous run failed',
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    });

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: jobId,
      status: 'failed',
      parameters: null,
      error: 'Previous run failed',
    });
  });

  it('returns the updated completed state when ComfyUI reports success for a running job', async () => {
    const jobId = 'running-job';
    const runningJob = {
      id: jobId,
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: 'prompt-running',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:30.000Z'),
    };
    const completedJob = {
      ...runningJob,
      status: 'completed',
      resultPath: '/outputs/running-job.mp4',
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    };

    mocks.prismaFindUnique.mockResolvedValueOnce(runningJob);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'success',
      outputs: {
        '9': {
          videos: [{ filename: 'ComfyVideo.mp4', subfolder: '', type: 'output' }],
        },
      },
    });
    mocks.extractOutputPath.mockReturnValueOnce('ComfyVideo.mp4');
    mocks.getComfyUIOutputPath.mockReturnValueOnce('E:/comfy/output/ComfyVideo.mp4');
    mocks.saveResultFile.mockResolvedValueOnce({
      originalPath: 'E:/comfy/output/ComfyVideo.mp4',
      savedPath: '/outputs/running-job.mp4',
      filePath: 'E:/ai_tool/Danbi_Studio/.danbi/outputs/running-job.mp4',
      filename: 'running-job.mp4',
    });
    mocks.prismaUpdate.mockResolvedValueOnce(completedJob);

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data: {
        status: 'completed',
        resultPath: '/outputs/running-job.mp4',
      },
    });
    expect(data).toMatchObject({
      id: jobId,
      status: 'completed',
      resultPath: '/outputs/running-job.mp4',
      promptId: 'prompt-running',
    });
  });

  it('marks a successful ComfyUI prompt failed when the result file cannot be captured', async () => {
    const jobId = 'running-missing-output-job';
    const runningJob = {
      id: jobId,
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: 'prompt-missing-output',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:30.000Z'),
    };
    const failedJob = {
      ...runningJob,
      status: 'failed',
      error: 'ComfyUI completed without an output file.',
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    };

    mocks.prismaFindUnique.mockResolvedValueOnce(runningJob);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'success',
      outputs: {},
    });
    mocks.extractOutputPath.mockReturnValueOnce(null);
    mocks.prismaUpdate.mockResolvedValueOnce(failedJob);

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.saveResultFile).not.toHaveBeenCalled();
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: 'ComfyUI completed without an output file.',
      },
    });
    expect(data).toMatchObject({
      id: jobId,
      status: 'failed',
      error: 'ComfyUI completed without an output file.',
    });
  });

  it('polls ComfyUI for legacy pending jobs that already have a prompt id', async () => {
    const jobId = 'legacy-pending-job';
    const pendingJob = {
      id: jobId,
      status: 'pending',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: 'prompt-pending',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:30.000Z'),
    };
    const completedJob = {
      ...pendingJob,
      status: 'completed',
      resultPath: '/outputs/legacy-pending-job.mp4',
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    };

    mocks.prismaFindUnique.mockResolvedValueOnce(pendingJob);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'success',
      outputs: {
        '9': {
          videos: [{ filename: 'PendingVideo.mp4', subfolder: '', type: 'output' }],
        },
      },
    });
    mocks.extractOutputPath.mockReturnValueOnce('PendingVideo.mp4');
    mocks.getComfyUIOutputPath.mockReturnValueOnce('E:/comfy/output/PendingVideo.mp4');
    mocks.saveResultFile.mockResolvedValueOnce({
      originalPath: 'E:/comfy/output/PendingVideo.mp4',
      savedPath: '/outputs/legacy-pending-job.mp4',
      filePath: 'E:/ai_tool/Danbi_Studio/.danbi/outputs/legacy-pending-job.mp4',
      filename: 'legacy-pending-job.mp4',
    });
    mocks.prismaUpdate.mockResolvedValueOnce(completedJob);

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getPromptStatus).toHaveBeenCalledWith('prompt-pending');
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data: {
        status: 'completed',
        resultPath: '/outputs/legacy-pending-job.mp4',
      },
    });
    expect(data).toMatchObject({
      id: jobId,
      status: 'completed',
      resultPath: '/outputs/legacy-pending-job.mp4',
      promptId: 'prompt-pending',
    });
  });

  it('polls the ComfyUI URL saved with a custom generation job', async () => {
    const jobId = 'custom-comfyui-job';
    const runningJob = {
      id: jobId,
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: JSON.stringify({
        prompt: 'A person talking',
        comfyuiUrl: 'http://127.0.0.1:8189/',
      }),
      promptId: 'prompt-custom',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:30.000Z'),
    };

    mocks.prismaFindUnique.mockResolvedValueOnce(runningJob);
    mocks.customGetPromptStatus.mockResolvedValueOnce({
      status: 'running',
      outputs: {},
    });

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.validateComfyUIBaseUrl).toHaveBeenCalledWith('http://127.0.0.1:8189/', {
      allowedUrls: ['https://remote.example'],
      allowLocalhost: true,
    });
    expect(mocks.ComfyUIClient).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:8189/',
      allowedUrls: ['https://remote.example'],
      allowLocalhost: true,
    });
    expect(mocks.getPromptStatus).not.toHaveBeenCalled();
    expect(mocks.customGetPromptStatus).toHaveBeenCalledWith('prompt-custom');
    expect(mocks.prismaUpdate).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      id: jobId,
      status: 'running',
      promptId: 'prompt-custom',
      parameters: {
        comfyuiUrl: 'http://127.0.0.1:8189/',
      },
    });
  });

  it('returns the updated failed state when ComfyUI reports an execution error', async () => {
    const jobId = 'running-error-job';
    const runningJob = {
      id: jobId,
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{}',
      promptId: 'prompt-error',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:30.000Z'),
    };
    const failedJob = {
      ...runningJob,
      status: 'failed',
      error: 'ComfyUI execution failed',
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    };

    mocks.prismaFindUnique.mockResolvedValueOnce(runningJob);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'error',
      outputs: {},
    });
    mocks.prismaUpdate.mockResolvedValueOnce(failedJob);

    const response = await GET(createGetRequest(jobId) as never, { params: Promise.resolve({ id: jobId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: 'ComfyUI execution failed',
      },
    });
    expect(data).toMatchObject({
      id: jobId,
      status: 'failed',
      error: 'ComfyUI execution failed',
      promptId: 'prompt-error',
    });
  });
});
