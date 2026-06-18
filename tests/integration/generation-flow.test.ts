import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pollPromptCompletion } from '../../src/lib/polling';
import {
  extractOutputPath,
  resolveComfyUIOutputPath,
  saveResultFile,
} from '../../src/lib/result-handler';
import { injectParameters, type Workflow } from '../../src/lib/workflow-loader';

describe('generation flow integration contracts', () => {
  let tempRoot: string;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    tempRoot = join(tmpdir(), `danbi-generation-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(tempRoot, { recursive: true });
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
  });

  afterEach(async () => {
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('prepares, queues, polls, extracts, and saves a generated video result', async () => {
    const baseWorkflow: Workflow = {
      '1': {
        class_type: 'Sampler',
        inputs: {
          prompt: '',
          seed: 0,
          steps: 1,
          image: '',
        },
      },
    };
    const workflow = injectParameters(baseWorkflow, {
      prompt: 'A product turntable',
      seed: 12345,
      steps: 20,
      image: 'reference.png',
    });
    const queuePrompt = async (queuedWorkflow: Workflow) => {
      expect(queuedWorkflow['1'].inputs).toMatchObject({
        prompt: 'A product turntable',
        seed: 12345,
        steps: 20,
        image: 'reference.png',
      });
      return { prompt_id: 'prompt-integration-1', number: 1 };
    };

    const queued = await queuePrompt(workflow);
    const pollResult = await pollPromptCompletion(
      queued.prompt_id,
      async (promptId) => {
        expect(promptId).toBe('prompt-integration-1');
        return {
          status: 'success',
          outputs: {
            '9': {
              videos: [{ filename: 'renders/result.mp4', subfolder: 'renders', type: 'output' }],
            },
          },
        };
      },
      { interval: 0, timeout: 100, maxRetries: 2 },
    );

    expect(pollResult).toMatchObject({
      success: true,
      attempts: 1,
    });
    const outputFilename = extractOutputPath(pollResult.data?.outputs);
    expect(outputFilename).toBe('renders/result.mp4');

    const comfyOutputRoot = join(tempRoot, 'comfy-output');
    const comfyOutputPath = resolveComfyUIOutputPath(outputFilename!, comfyOutputRoot);
    await mkdir(dirname(comfyOutputPath), { recursive: true });
    await writeFile(comfyOutputPath, 'fake mp4 data');

    const saved = await saveResultFile(comfyOutputPath, 'job-integration-1', { rootDir: tempRoot });

    expect(saved).toMatchObject({
      originalPath: comfyOutputPath,
      savedPath: expect.stringMatching(/^\/outputs\/job-integration-1_\d+\.mp4$/),
      filename: expect.stringMatching(/^job-integration-1_\d+\.mp4$/),
    });
    expect(saved.filePath).toContain(join('.danbi', 'outputs'));
  });

  it('keeps polling while a prompt is running and stops when it succeeds', async () => {
    const statuses = ['running', 'running', 'success'];

    const result = await pollPromptCompletion(
      'prompt-polling',
      async () => ({ status: statuses.shift() ?? 'success', outputs: {} }),
      { interval: 0, timeout: 100, maxRetries: 5 },
    );

    expect(result).toMatchObject({
      success: true,
      attempts: 3,
      data: { status: 'success' },
    });
  });

  it('returns polling errors when ComfyUI status checks fail', async () => {
    const result = await pollPromptCompletion(
      'prompt-offline',
      async () => {
        throw new Error('Connection refused');
      },
      { interval: 0, timeout: 100, maxRetries: 2 },
    );

    expect(result).toEqual({
      success: false,
      error: 'Connection refused',
      attempts: 1,
    });
  });

  it('stops polling when the caller aborts the ComfyUI status wait', async () => {
    const controller = new AbortController();
    let calls = 0;

    const result = await pollPromptCompletion(
      'prompt-abort',
      async (_promptId, signal) => {
        expect(signal).toBe(controller.signal);
        calls += 1;
        controller.abort();
        return { status: 'running', outputs: {} };
      },
      { interval: 0, timeout: 100, maxRetries: 5, signal: controller.signal },
    );

    expect(result).toEqual({
      success: false,
      error: 'Polling aborted',
      attempts: 1,
    });
    expect(calls).toBe(1);
  });

  it('treats ComfyUI error status as a terminal prompt state', async () => {
    const result = await pollPromptCompletion(
      'prompt-error',
      async () => ({ status: 'error', outputs: {} }),
      { interval: 0, timeout: 100, maxRetries: 2 },
    );

    expect(result).toMatchObject({
      success: true,
      attempts: 1,
      data: { status: 'error' },
    });
  });
});

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
