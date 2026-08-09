import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSttJob, getSttJob, type SttJobSnapshot } from '../../src/lib/editor/stt-queue';
import type { EditorProject } from '../../src/lib/editor/types';

const originalCwd = process.cwd();
const trackedEnvKeys = [
  'DANBI_ELECTRON_USER_DATA',
  'DANBI_LOCAL_DATA_ROOT',
  'DANBI_STT_COMMAND',
  'DANBI_STT_COMMAND_TIMEOUT_MS',
  'DANBI_STT_BINARY',
  'DANBI_STT_ENGINE',
  'DANBI_STT_SPEAKER_ENCODER_COMMAND',
  'DANBI_STT_SPEAKER_ENCODER_TIMEOUT_MS',
] as const;
const originalEnv = Object.fromEntries(trackedEnvKeys.map((key) => [key, process.env[key]])) as Record<typeof trackedEnvKeys[number], string | undefined>;
const tempRoots: string[] = [];

describe('STT durable storage', () => {
  afterEach(async () => {
    process.chdir(originalCwd);
    for (const key of trackedEnvKeys) {
      restoreEnvValue(key, originalEnv[key]);
    }

    // The timed-out speaker-encoder child can still hold its script file when
    // we get here; on Windows that makes rmdir fail with EBUSY. Retry rather
    // than let cleanup flake the test that just passed.
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })));
  });

  it('resolves durable import sources and writes STT outputs under Electron user data', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-stt-storage-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const inputPath = join(userDataRoot, 'imports', 'audio.wav');
    const fakeSttCommand = join(tempRoot, 'fake-stt-command.js');
    const fakeSpeakerEncoderCommand = join(tempRoot, 'fake-speaker-encoder-command.js');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;
    process.env.DANBI_STT_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSttCommand)} {outputDir}`;
    process.env.DANBI_STT_SPEAKER_ENCODER_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSpeakerEncoderCommand)} {manifest}`;

    await mkdir(join(userDataRoot, 'imports'), { recursive: true });
    await writeFile(inputPath, 'fake audio');
    await writeFile(fakeSttCommand, [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const outputDir = process.argv[2];',
      'fs.mkdirSync(outputDir, { recursive: true });',
      "fs.writeFileSync(path.join(outputDir, 'transcript.json'), JSON.stringify({ segments: [{ start: 0, end: 1, text: 'Hello durable STT' }] }));",
    ].join('\n'));
    await writeFile(fakeSpeakerEncoderCommand, [
      "const fs = require('node:fs');",
      'const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));',
      'process.stdout.write(JSON.stringify({ embeddings: manifest.captions.map((caption, index) => ({ captionId: caption.id, speakerEmbedding: [0.8 + index, 0.1, 0.1] })) }));',
    ].join('\n'));

    const project = buildSttProject('/imports/audio.wav?cache=1');
    const queued = createSttJob(project, ['clip-audio'], { execute: true });
    const completed = await waitForTerminalSttJob(queued.id);
    const speakerEncoderDir = join(userDataRoot, 'stt', queued.id, 'stt-clip-audio', 'speaker-encoder');

    expect(completed.status).toBe('completed');
    expect(completed.captions[0]?.text).toBe('Hello durable STT');
    expect(completed.captions[0]?.speakerEmbedding).toEqual([0.8, 0.1, 0.1]);
    await expect(access(join(userDataRoot, 'stt', queued.id, 'stt-clip-audio', 'transcript.json'))).resolves.toBeUndefined();
    await expect(access(join(speakerEncoderDir, 'speaker-encoder-manifest.json'))).resolves.toBeUndefined();
    expect((await readdir(speakerEncoderDir)).some((fileName) => fileName.endsWith('.tmp'))).toBe(false);
    await expect(stat(join(tempRoot, '.danbi', 'stt', queued.id, 'stt-clip-audio', 'transcript.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(inputPath, 'utf8')).toBe('fake audio');
  });

  it('fails stalled STT commands instead of leaving the queue running forever', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-stt-timeout-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const inputPath = join(userDataRoot, 'imports', 'audio.wav');
    const fakeSttCommand = join(tempRoot, 'fake-stalled-stt-command.js');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_STT_SPEAKER_ENCODER_COMMAND;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;
    process.env.DANBI_STT_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSttCommand)}`;
    process.env.DANBI_STT_COMMAND_TIMEOUT_MS = '100';

    await mkdir(join(userDataRoot, 'imports'), { recursive: true });
    await writeFile(inputPath, 'fake audio');
    await writeFile(fakeSttCommand, [
      'setInterval(() => undefined, 1000);',
    ].join('\n'));

    const queued = createSttJob(buildSttProject('/imports/audio.wav'), ['clip-audio'], { execute: true });
    const failed = await waitForTerminalSttJob(queued.id);

    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('STT command timed out after 100ms');
  });

  it('keeps STT task outputs inside storage when clip IDs contain path separators', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-stt-safe-task-path-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const inputPath = join(userDataRoot, 'imports', 'audio.wav');
    const fakeSttCommand = join(tempRoot, 'fake-stt-command.js');
    const unsafeClipId = 'clip/../../escape';
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_STT_SPEAKER_ENCODER_COMMAND;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;
    process.env.DANBI_STT_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSttCommand)} {outputDir}`;

    await mkdir(join(userDataRoot, 'imports'), { recursive: true });
    await writeFile(inputPath, 'fake audio');
    await writeFile(fakeSttCommand, [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const outputDir = process.argv[2];',
      'fs.mkdirSync(outputDir, { recursive: true });',
      "fs.writeFileSync(path.join(outputDir, 'transcript.json'), JSON.stringify({ segments: [{ start: 0, end: 1, text: 'Safe STT path' }] }));",
    ].join('\n'));

    const queued = createSttJob(buildSttProject('/imports/audio.wav', unsafeClipId), [unsafeClipId], { execute: true });
    const completed = await waitForTerminalSttJob(queued.id);

    expect(completed.status).toBe('completed');
    await expect(access(join(userDataRoot, 'stt', queued.id, 'stt-clip-..-..-escape', 'transcript.json'))).resolves.toBeUndefined();
    await expect(stat(join(userDataRoot, 'stt', 'escape', 'transcript.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('continues STT when the external speaker encoder times out', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-stt-speaker-timeout-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const inputPath = join(userDataRoot, 'imports', 'audio.wav');
    const fakeSttCommand = join(tempRoot, 'fake-stt-command.js');
    const fakeSpeakerEncoderCommand = join(tempRoot, 'fake-stalled-speaker-encoder.js');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;
    process.env.DANBI_STT_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSttCommand)} {outputDir}`;
    process.env.DANBI_STT_SPEAKER_ENCODER_COMMAND = `${quotePath(process.execPath)} ${quotePath(fakeSpeakerEncoderCommand)}`;
    process.env.DANBI_STT_SPEAKER_ENCODER_TIMEOUT_MS = '100';

    await mkdir(join(userDataRoot, 'imports'), { recursive: true });
    await writeFile(inputPath, 'fake audio');
    await writeFile(fakeSttCommand, [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const outputDir = process.argv[2];',
      'fs.mkdirSync(outputDir, { recursive: true });',
      "fs.writeFileSync(path.join(outputDir, 'transcript.json'), JSON.stringify({ segments: [{ start: 0, end: 1, text: 'Hello without speaker encoder' }] }));",
    ].join('\n'));
    await writeFile(fakeSpeakerEncoderCommand, [
      'setInterval(() => undefined, 1000);',
    ].join('\n'));

    const queued = createSttJob(buildSttProject('/imports/audio.wav'), ['clip-audio'], { execute: true });
    const completed = await waitForTerminalSttJob(queued.id);

    expect(completed.status).toBe('completed');
    expect(completed.captions[0]?.text).toBe('Hello without speaker encoder');
    expect(completed.warnings.some((warning) => warning.includes('STT speaker encoder command timed out after 100ms'))).toBe(true);
  });
});

function buildSttProject(source: string, clipId = 'clip-audio'): EditorProject {
  return {
    id: 'project-stt-storage',
    schemaVersion: 1,
    name: 'STT storage test',
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 2,
    updatedAt: '2026-06-17T00:00:00.000Z',
    assets: [{
      id: 'asset-audio',
      name: 'audio.wav',
      kind: 'audio',
      source,
      duration: 2,
    }],
    tracks: [{
      id: 'track-audio',
      name: 'A1',
      kind: 'audio',
      muted: false,
      locked: false,
      clips: [{
        id: clipId,
        assetId: 'asset-audio',
        trackId: 'track-audio',
        name: 'Audio',
        kind: 'audio',
        start: 0,
        duration: 2,
        sourceIn: 0,
        color: '#38bdf8',
        speed: 1,
        volume: 1,
        opacity: 1,
        blendMode: 'normal',
        automationTags: [],
        effects: [],
        keyframes: [],
      }],
    }],
    markers: [],
    captions: [],
    automation: [],
    plugins: [],
    exportProfiles: [],
  };
}

async function waitForTerminalSttJob(id: string): Promise<SttJobSnapshot> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await getSttJob(id);
    if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for STT job ${id}`);
}

function quotePath(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function restoreEnvValue(name: typeof trackedEnvKeys[number], value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
