import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/library/route';

const mocks = vi.hoisted(() => ({
  prismaFindMany: vi.fn(),
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
      findMany: mocks.prismaFindMany,
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

function createGetRequest(url = 'http://localhost/api/library'): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
  });
}

describe('GET /api/library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPromptStatus.mockResolvedValue({ status: 'running', outputs: {} });
    mocks.customGetPromptStatus.mockResolvedValue({ status: 'running', outputs: {} });
    mocks.extractOutputPath.mockReturnValue('ComfyVideo.mp4');
    mocks.getComfyUIOutputPath.mockReturnValue('E:/comfy/output/ComfyVideo.mp4');
    mocks.saveResultFile.mockResolvedValue({
      originalPath: 'E:/comfy/output/ComfyVideo.mp4',
      savedPath: '/outputs/job.mp4',
      filePath: 'E:/ai_tool/Danbi_Studio/.danbi/outputs/job.mp4',
      filename: 'job.mp4',
    });
    mocks.validateComfyUIBaseUrl.mockImplementation((baseUrl: string) => ({
      ok: true,
      url: new URL(baseUrl),
    }));
    mocks.ComfyUIClient.mockImplementation(function MockComfyUIClient(
      this: { getPromptStatus?: typeof mocks.customGetPromptStatus },
    ) {
      this.getPromptStatus = mocks.customGetPromptStatus;
    });
  });

  it('returns recent generation jobs from the database', async () => {
    mocks.prismaFindMany.mockResolvedValueOnce([
      {
        id: 'job-completed',
        status: 'completed',
        modelName: 'wan_i2v',
        workflowName: 'wan_i2v',
        parameters: '{"prompt":"launch video"}',
        promptId: 'prompt-1',
        resultPath: '/outputs/job-completed.mp4',
        error: null,
        createdAt: new Date('2026-06-14T02:00:00.000Z'),
        updatedAt: new Date('2026-06-14T02:05:00.000Z'),
      },
      {
        id: 'job-running',
        status: 'running',
        modelName: 'sdxl',
        workflowName: 'image',
        parameters: '{"prompt":"thumbnail"}',
        promptId: 'prompt-2',
        resultPath: null,
        error: null,
        createdAt: new Date('2026-06-14T01:00:00.000Z'),
        updatedAt: new Date('2026-06-14T01:01:00.000Z'),
      },
    ]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prismaFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    expect(data).toEqual({
      count: 2,
      jobs: [
        {
          id: 'job-completed',
          status: 'completed',
          modelName: 'wan_i2v',
          workflowName: 'wan_i2v',
          parameters: { prompt: 'launch video' },
          promptId: 'prompt-1',
          resultPath: '/outputs/job-completed.mp4',
          createdAt: '2026-06-14T02:00:00.000Z',
          updatedAt: '2026-06-14T02:05:00.000Z',
        },
        {
          id: 'job-running',
          status: 'running',
          modelName: 'sdxl',
          workflowName: 'image',
          parameters: { prompt: 'thumbnail' },
          promptId: 'prompt-2',
          createdAt: '2026-06-14T01:00:00.000Z',
          updatedAt: '2026-06-14T01:01:00.000Z',
        },
      ],
    });
    expect(mocks.getPromptStatus).toHaveBeenCalledWith('prompt-2');
  });

  it('refreshes active jobs and captures completed ComfyUI results while loading the library', async () => {
    const runningJob = {
      id: 'job-running-completed',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{"prompt":"finished render"}',
      promptId: 'prompt-done',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T04:00:00.000Z'),
      updatedAt: new Date('2026-06-14T04:01:00.000Z'),
    };
    const completedJob = {
      ...runningJob,
      status: 'completed',
      resultPath: '/outputs/job-running-completed.mp4',
      updatedAt: new Date('2026-06-14T04:02:00.000Z'),
    };

    mocks.prismaFindMany.mockResolvedValueOnce([runningJob]);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'success',
      outputs: {
        '9': {
          videos: [{ filename: 'ComfyVideo.mp4', subfolder: 'renders', type: 'output' }],
        },
      },
    });
    mocks.extractOutputPath.mockReturnValueOnce('renders/ComfyVideo.mp4');
    mocks.getComfyUIOutputPath.mockReturnValueOnce('E:/comfy/output/renders/ComfyVideo.mp4');
    mocks.saveResultFile.mockResolvedValueOnce({
      originalPath: 'E:/comfy/output/renders/ComfyVideo.mp4',
      savedPath: '/outputs/job-running-completed.mp4',
      filePath: 'E:/ai_tool/Danbi_Studio/.danbi/outputs/job-running-completed.mp4',
      filename: 'job-running-completed.mp4',
    });
    mocks.prismaUpdate.mockResolvedValueOnce(completedJob);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getPromptStatus).toHaveBeenCalledWith('prompt-done');
    expect(mocks.extractOutputPath).toHaveBeenCalledWith({
      '9': {
        videos: [{ filename: 'ComfyVideo.mp4', subfolder: 'renders', type: 'output' }],
      },
    });
    expect(mocks.getComfyUIOutputPath).toHaveBeenCalledWith('renders/ComfyVideo.mp4');
    expect(mocks.saveResultFile).toHaveBeenCalledWith('E:/comfy/output/renders/ComfyVideo.mp4', 'job-running-completed');
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-running-completed' },
      data: {
        status: 'completed',
        resultPath: '/outputs/job-running-completed.mp4',
      },
    });
    expect(data.jobs[0]).toMatchObject({
      id: 'job-running-completed',
      status: 'completed',
      resultPath: '/outputs/job-running-completed.mp4',
    });
  });

  it('marks refreshed active jobs failed when ComfyUI output capture fails', async () => {
    const runningJob = {
      id: 'job-output-missing',
      status: 'running',
      modelName: 'wan_i2v',
      workflowName: 'wan_i2v',
      parameters: '{"prompt":"missing file"}',
      promptId: 'prompt-missing-file',
      resultPath: null,
      error: null,
      createdAt: new Date('2026-06-14T05:00:00.000Z'),
      updatedAt: new Date('2026-06-14T05:01:00.000Z'),
    };
    const failedJob = {
      ...runningJob,
      status: 'failed',
      error: 'ComfyUI completed but result capture failed: Source file not found: E:/comfy/output/MissingVideo.mp4',
      updatedAt: new Date('2026-06-14T05:02:00.000Z'),
    };

    mocks.prismaFindMany.mockResolvedValueOnce([runningJob]);
    mocks.getPromptStatus.mockResolvedValueOnce({
      status: 'success',
      outputs: {
        '9': {
          videos: [{ filename: 'MissingVideo.mp4', subfolder: '', type: 'output' }],
        },
      },
    });
    mocks.extractOutputPath.mockReturnValueOnce('MissingVideo.mp4');
    mocks.getComfyUIOutputPath.mockReturnValueOnce('E:/comfy/output/MissingVideo.mp4');
    mocks.saveResultFile.mockRejectedValueOnce(new Error('Source file not found: E:/comfy/output/MissingVideo.mp4'));
    mocks.prismaUpdate.mockResolvedValueOnce(failedJob);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-output-missing' },
      data: {
        status: 'failed',
        error: 'ComfyUI completed but result capture failed: Source file not found: E:/comfy/output/MissingVideo.mp4',
      },
    });
    expect(data.jobs[0]).toMatchObject({
      id: 'job-output-missing',
      status: 'failed',
      error: 'ComfyUI completed but result capture failed: Source file not found: E:/comfy/output/MissingVideo.mp4',
    });
  });

  it('clamps the requested limit to the supported range', async () => {
    mocks.prismaFindMany.mockResolvedValueOnce([]);

    const response = await GET(createGetRequest('http://localhost/api/library?limit=500'));

    expect(response.status).toBe(200);
    expect(mocks.prismaFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('keeps malformed job parameters from breaking the whole library response', async () => {
    mocks.prismaFindMany.mockResolvedValueOnce([
      {
        id: 'job-malformed',
        status: 'failed',
        modelName: 'wan_i2v',
        workflowName: 'wan_i2v',
        parameters: '{not-json',
        promptId: null,
        resultPath: null,
        error: 'Execution failed',
        createdAt: new Date('2026-06-14T03:00:00.000Z'),
        updatedAt: new Date('2026-06-14T03:01:00.000Z'),
      },
    ]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobs[0]).toMatchObject({
      id: 'job-malformed',
      status: 'failed',
      parameters: null,
      error: 'Execution failed',
    });
  });

  it('returns 500 when the library cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.prismaFindMany.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'database unavailable' });
    expect(consoleError).toHaveBeenCalledWith('Error loading generation library:', expect.any(Error));
    consoleError.mockRestore();
  });
});
