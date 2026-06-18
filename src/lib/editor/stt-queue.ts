import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getClipPlaybackSpeed } from './clip-timing';
import { resolveReadableCachePath } from '../../server/cache-storage';
import { getPersistedJob, listPersistedJobs, savePersistedJob } from '../../server/editor/job-store';
import { resolveImportStoragePath } from '../../server/import-storage';
import { resolveReadableOutputPath } from '../../server/output-storage';
import { getSttStorageRoot } from '../../server/stt-storage';
import { clipHasTimelineAudio } from './media-metadata';
import { getEditorQueueSettings, normalizeJobPriority } from './queue-settings';
import { resolveRenderableAssetMediaKind, type RenderableAssetMediaKind } from './renderable-media-kind';
import { enrichSttCaptionsWithAcousticEmbeddings } from './stt-acoustic-embedding';
import { applySttSpeakerEncoderOutput, buildSttSpeakerEncoderCommand, buildSttSpeakerEncoderManifest } from './stt-speaker-encoder';
import { alignSttSegmentsToClip, parseSttTranscript, type SttTranscriptFormat } from './stt-transcript';
import type { CaptionSegment, EditorAsset, EditorProject, TimelineClip } from './types';

export type SttJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SttClipTask {
  id: string;
  clip: TimelineClip;
  trackId: string;
  assetId: string;
  assetName: string;
  assetMediaKind?: RenderableAssetMediaKind;
  inputPath: string;
  source: string;
  duration: number;
  speed: number;
  assetDuration: number;
  waveformPeaks?: number[];
}

export interface SttJobSnapshot {
  id: string;
  projectId: string;
  status: SttJobStatus;
  progress: number;
  priority: number;
  execute: boolean;
  engine: string;
  language: string;
  speakerEncoderCommand?: string;
  totalClips: number;
  completedClips: number;
  failedClips: number;
  currentClipId?: string;
  captions: CaptionSegment[];
  tasks: SttClipTask[];
  error?: string;
  warnings: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface SttJobRecord extends SttJobSnapshot {
  abortController?: AbortController;
}

export interface SttJobOptions {
  execute?: boolean;
  priority?: number;
  language?: string;
  engine?: string;
  commandTemplate?: string;
  speakerEncoderCommand?: string;
}

export interface ResolveSttSpeakerEncoderCommandOptions {
  explicitCommand?: string;
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
}

interface SttCommand {
  command: string;
  args: string[];
  outputDir: string;
  display: string;
}

const SPEAKER_ENCODER_MANIFEST_NAMES = [
  'danbi-speaker-encoder.json',
  'speaker-encoder.json',
  'speaker-encoder-command.json',
];

const SPEAKER_ENCODER_RESOURCE_DIRECTORIES = [
  'speaker-encoder',
  'stt-speaker-encoder',
  join('models', 'speaker-encoder'),
  join('models', 'stt-speaker-encoder'),
];
const DEFAULT_STT_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_STT_SPEAKER_ENCODER_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_STT_COMMAND_TIMEOUT_MS = 100;
const MAX_STT_COMMAND_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const globalForSttQueue = globalThis as unknown as {
  danbiSttJobs?: Map<string, SttJobRecord>;
  danbiSttPending?: string[];
  danbiSttRunningCount?: number;
};

const jobs = globalForSttQueue.danbiSttJobs ?? new Map<string, SttJobRecord>();
const pending = globalForSttQueue.danbiSttPending ?? [];
globalForSttQueue.danbiSttJobs = jobs;
globalForSttQueue.danbiSttPending = pending;
globalForSttQueue.danbiSttRunningCount ??= 0;

export function resolveSttSpeakerEncoderCommand(
  options: ResolveSttSpeakerEncoderCommandOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const explicitCommand = normalizeOptionalCommand(options.explicitCommand ?? env.DANBI_STT_SPEAKER_ENCODER_COMMAND);
  if (explicitCommand) {
    return explicitCommand;
  }

  for (const presetDirectory of buildSpeakerEncoderPresetDirectories(options, env)) {
    const manifestPath = findSpeakerEncoderPresetManifest(presetDirectory);
    if (!manifestPath) {
      continue;
    }

    const commandTemplate = readSpeakerEncoderPresetCommandTemplate(manifestPath, presetDirectory);
    if (commandTemplate) {
      return commandTemplate;
    }
  }

  return undefined;
}

export function createSttJob(
  project: EditorProject,
  selectedClipIds: string[] = [],
  options: SttJobOptions = {},
): SttJobSnapshot {
  const tasks = buildSttClipTasks(project, selectedClipIds);
  if (tasks.length === 0) {
    throw new Error('No audio-capable clips were found for STT.');
  }

  const execute = options.execute ?? true;
  const settings = getEditorQueueSettings();
  const job: SttJobRecord = {
    id: randomUUID(),
    projectId: project.id,
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, settings.defaultSttPriority),
    execute,
    engine: options.engine ?? process.env.DANBI_STT_ENGINE ?? 'whisper',
    language: normalizeLanguage(options.language ?? process.env.DANBI_STT_LANGUAGE ?? 'auto'),
    speakerEncoderCommand: resolveSttSpeakerEncoderCommand({ explicitCommand: options.speakerEncoderCommand }),
    totalClips: tasks.length,
    completedClips: 0,
    failedClips: 0,
    captions: [],
    tasks,
    warnings: execute ? [] : ['STT execution skipped; enable execution to run the local speech engine.'],
    createdAt: new Date().toISOString(),
  };

  jobs.set(job.id, job);
  enqueueJob(job.id);
  persistJob(job);
  pumpQueue();

  return snapshot(job);
}

function buildSpeakerEncoderPresetDirectories(
  options: ResolveSttSpeakerEncoderCommandOptions,
  env: NodeJS.ProcessEnv,
): string[] {
  const electronProcess = process as typeof process & { resourcesPath?: string };
  const explicitPresetDirectory = normalizeOptionalCommand(env.DANBI_STT_SPEAKER_ENCODER_PRESET_DIR);
  const resourceRoots = uniquePaths([
    options.resourcesPath,
    env.DANBI_ELECTRON_RESOURCES_PATH,
    electronProcess.resourcesPath,
  ]);
  const candidates = [
    explicitPresetDirectory,
    ...resourceRoots.flatMap((root) => SPEAKER_ENCODER_RESOURCE_DIRECTORIES.map((directory) => join(root, directory))),
  ];

  return uniquePaths(candidates);
}

function findSpeakerEncoderPresetManifest(presetDirectory: string): string | undefined {
  const directory = resolve(presetDirectory);
  const directoryStat = statSync(directory, { throwIfNoEntry: false });
  if (directoryStat?.isFile() && directory.toLowerCase().endsWith('.json')) {
    return directory;
  }

  if (!directoryStat?.isDirectory()) {
    return undefined;
  }

  return SPEAKER_ENCODER_MANIFEST_NAMES
    .map((name) => join(directory, name))
    .find((manifestPath) => statSync(manifestPath, { throwIfNoEntry: false })?.isFile());
}

function readSpeakerEncoderPresetCommandTemplate(manifestPath: string, presetDirectory: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }

  const manifest = parsed as Record<string, unknown>;
  const version = manifest.version;
  if (version !== undefined && version !== 1) {
    return undefined;
  }

  const commandTemplate = readText(manifest.commandTemplate ?? manifest.command_template ?? manifest.template);
  if (!commandTemplate) {
    return undefined;
  }

  return commandTemplate.replace(/\{presetDir\}/g, normalizePresetPath(presetDirectory));
}

function normalizePresetPath(value: string): string {
  return resolve(value).replace(/"/g, '\\"');
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of paths) {
    const normalized = normalizeOptionalCommand(item);
    if (!normalized) {
      continue;
    }

    const absolutePath = resolve(normalized);
    const key = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(absolutePath);
  }

  return unique;
}

export async function getSttJob(id: string): Promise<SttJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (job) {
    return snapshot(job);
  }

  const persisted = await getPersistedJob<SttJobSnapshot>('stt', id);
  return persisted ? normalizeOrphanedJob(persisted) : undefined;
}

export async function listSttJobs(): Promise<SttJobSnapshot[]> {
  const memorySnapshots = Array.from(jobs.values()).map(snapshot);
  const memoryIds = new Set(memorySnapshots.map((job) => job.id));
  const persistedSnapshots = (await listPersistedJobs<SttJobSnapshot>('stt'))
    .filter((job) => !memoryIds.has(job.id))
    .map(normalizeOrphanedJob);

  return [
    ...memorySnapshots,
    ...persistedSnapshots,
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function cancelSttJob(id: string): Promise<SttJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (!job) {
    const persisted = await getPersistedJob<SttJobSnapshot>('stt', id);
    return persisted ? normalizeOrphanedJob(persisted) : undefined;
  }

  if (job.status === 'queued') {
    removePendingJob(id);
  }

  if (job.status === 'running') {
    job.abortController?.abort();
  }

  job.status = 'cancelled';
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  persistJob(job);
  pumpQueue();
  return snapshot(job);
}

export async function retrySttJob(id: string, options: SttJobOptions = {}): Promise<SttJobSnapshot | undefined> {
  const source = await getSttJob(id);
  if (!source || source.status === 'queued' || source.status === 'running') {
    return undefined;
  }

  const job: SttJobRecord = {
    ...source,
    id: randomUUID(),
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, source.priority),
    execute: options.execute ?? source.execute,
    engine: options.engine ?? source.engine,
    language: normalizeLanguage(options.language ?? source.language),
    speakerEncoderCommand: resolveSttSpeakerEncoderCommand({ explicitCommand: options.speakerEncoderCommand ?? source.speakerEncoderCommand }),
    completedClips: 0,
    failedClips: 0,
    currentClipId: undefined,
    captions: [],
    error: undefined,
    warnings: [],
    createdAt: new Date().toISOString(),
    startedAt: undefined,
    completedAt: undefined,
  };

  jobs.set(job.id, job);
  enqueueJob(job.id);
  persistJob(job);
  pumpQueue();

  return snapshot(job);
}

export function buildSttClipTasks(project: EditorProject, selectedClipIds: string[] = []): SttClipTask[] {
  const selectedIds = new Set(selectedClipIds);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  return project.tracks.flatMap((track) => (
    track.clips.flatMap((clip) => {
      if (selectedIds.size > 0 && !selectedIds.has(clip.id)) {
        return [];
      }

      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      if (!asset || !clipHasTimelineAudio(clip, asset)) {
        return [];
      }

      const assetMediaKind = resolveRenderableAssetMediaKind(asset);
      const source = resolveAssetInputSource(asset);
      const inputPath = resolveAssetInputPath(source);
      return [{
        id: `stt-${clip.id}`,
        clip,
        trackId: track.id,
        assetId: asset.id,
        assetName: asset.name,
        ...(assetMediaKind ? { assetMediaKind } : {}),
        inputPath,
        source,
        duration: clip.duration,
        speed: getClipPlaybackSpeed(clip),
        assetDuration: asset.duration,
        ...(asset.mediaCache?.waveformPeaks?.length ? { waveformPeaks: asset.mediaCache.waveformPeaks } : {}),
      }];
    })
  ));
}

function pumpQueue(): void {
  const settings = getEditorQueueSettings();
  while ((globalForSttQueue.danbiSttRunningCount ?? 0) < settings.sttConcurrency) {
    const nextId = takeNextPendingJob();
    if (!nextId) {
      return;
    }

    const job = jobs.get(nextId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    globalForSttQueue.danbiSttRunningCount = (globalForSttQueue.danbiSttRunningCount ?? 0) + 1;
    void runJob(job).finally(() => {
      globalForSttQueue.danbiSttRunningCount = Math.max(
        0,
        (globalForSttQueue.danbiSttRunningCount ?? 1) - 1,
      );
      pumpQueue();
    });
  }
}

async function runJob(job: SttJobRecord): Promise<void> {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.abortController = new AbortController();
  job.progress = 1;
  persistJob(job);

  try {
    if (!job.execute) {
      job.completedClips = job.totalClips;
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      return;
    }

    for (const task of job.tasks) {
      if (job.abortController.signal.aborted) {
        throw new Error('STT job cancelled.');
      }

      job.currentClipId = task.clip.id;
      const captions = await runSttTask(job, task, job.abortController.signal);
      job.captions.push(...captions);
      job.completedClips += 1;
      job.progress = Math.round((job.completedClips / job.totalClips) * 100);
      persistJob(job);
    }

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = job.abortController.signal.aborted ? 'cancelled' : 'failed';
    job.error = (error as Error).message;
    job.failedClips = Math.max(1, job.totalClips - job.completedClips);
    job.progress = 100;
    job.completedAt = new Date().toISOString();
  } finally {
    persistJob(job);
  }
}

async function runSttTask(job: SttJobRecord, task: SttClipTask, signal: AbortSignal): Promise<CaptionSegment[]> {
  await assertReadable(task.inputPath);
  const command = await buildSttCommand(job, task);
  const output = await runCommand(command, signal);
  const transcript = await readTranscriptOutput(command.outputDir, output.stdout);
  const parsed = parseSttTranscript(transcript.content, transcript.format);
  job.warnings.push(...parsed.warnings.map((warning) => `${task.clip.name}: ${warning}`));

  const captions = alignSttSegmentsToClip(parsed.segments, task.clip, {
    speaker: resolveSttCaptionSpeaker(task),
    captionIdPrefix: `caption-stt-${task.clip.id}`,
  });
  const encoderCaptions = await enrichCaptionsWithSpeakerEncoder(job, task, captions, signal);
  const embeddingResult = enrichSttCaptionsWithAcousticEmbeddings(encoderCaptions, {
    clip: task.clip,
    assetDuration: task.assetDuration,
    waveformPeaks: task.waveformPeaks,
  });
  if (embeddingResult.generatedCount > 0) {
    job.warnings.push(`${task.clip.name}: generated ${embeddingResult.generatedCount} acoustic speaker embedding${embeddingResult.generatedCount === 1 ? '' : 's'} from waveform cache.`);
  }

  return embeddingResult.captions;
}

export function resolveSttCaptionSpeaker(task: Pick<SttClipTask, 'clip' | 'assetMediaKind' | 'inputPath' | 'source'>): string {
  return task.clip.kind === 'audio' || task.assetMediaKind === 'audio' || hasAudioFileExtension(`${task.inputPath} ${task.source}`)
    ? 'Voice'
    : 'Speaker';
}

function hasAudioFileExtension(value: string): boolean {
  return /\.(wav|mp3|m4a|aac|flac|ogg)(?:$|[?#\s])/i.test(value);
}

async function enrichCaptionsWithSpeakerEncoder(
  job: SttJobRecord,
  task: SttClipTask,
  captions: CaptionSegment[],
  signal: AbortSignal,
): Promise<CaptionSegment[]> {
  if (!job.speakerEncoderCommand) {
    return captions;
  }

  try {
    const outputDir = join(resolveSttTaskOutputDir(job, task), 'speaker-encoder');
    await mkdir(outputDir, { recursive: true });
    const manifest = buildSttSpeakerEncoderManifest({
      inputPath: task.inputPath,
      clip: task.clip,
      assetDuration: task.assetDuration,
      captions,
      language: job.language,
    });
    if (manifest.captions.length === 0) {
      return captions;
    }

    const manifestPath = join(outputDir, 'speaker-encoder-manifest.json');
    await writeTextFileAtomically(manifestPath, JSON.stringify(manifest, null, 2));
    const command = buildSttSpeakerEncoderCommand(job.speakerEncoderCommand, {
      inputPath: task.inputPath,
      outputDir,
      manifestPath,
      language: job.language,
      clipId: task.clip.id,
    });
    const commandOutput = await runSpeakerEncoderCommand(command, signal);
    const outputContent = await readSpeakerEncoderOutput(outputDir, commandOutput.stdout);
    const result = applySttSpeakerEncoderOutput(captions, outputContent);
    job.warnings.push(...result.warnings.map((warning) => `${task.clip.name}: ${warning}`));
    if (result.generatedCount > 0) {
      job.warnings.push(`${task.clip.name}: generated ${result.generatedCount} speaker embedding${result.generatedCount === 1 ? '' : 's'} from external speaker encoder.`);
    }

    return result.captions;
  } catch (error) {
    job.warnings.push(`${task.clip.name}: external speaker encoder failed; using waveform acoustic fallback. ${(error as Error).message}`);
    return captions;
  }
}

async function writeTextFileAtomically(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function runSpeakerEncoderCommand(
  command: { command: string; args: string[]; display: string },
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command.command, command.args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = readSttCommandTimeoutMs(
      'DANBI_STT_SPEAKER_ENCODER_TIMEOUT_MS',
      DEFAULT_STT_SPEAKER_ENCODER_TIMEOUT_MS,
    );
    const abort = () => {
      child.kill();
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      signal.removeEventListener('abort', abort);
      callback();
    };
    timeout = setTimeout(() => {
      finish(() => {
        child.kill('SIGTERM');
        reject(new Error(`STT speaker encoder command timed out after ${timeoutMs}ms: ${command.display}`));
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(() => reject(new Error(`Failed to start STT speaker encoder command "${command.display}": ${error.message}`)));
    });
    child.on('close', (code) => {
      finish(() => {
        if (signal.aborted) {
          reject(new Error('STT speaker encoder job cancelled.'));
          return;
        }

        if (code !== 0) {
          reject(new Error(`STT speaker encoder command failed with code ${code}: ${trimOutput(stderr || stdout) || command.display}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

async function readSpeakerEncoderOutput(outputDir: string, stdout: string): Promise<string> {
  const outputFile = await findSpeakerEncoderOutputFile(outputDir);
  if (outputFile) {
    return readFile(outputFile, 'utf8');
  }

  return stdout;
}

async function findSpeakerEncoderOutputFile(outputDir: string): Promise<string | undefined> {
  const files = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const candidates = files
    .filter((file) => file.isFile())
    .map((file) => join(outputDir, file.name))
    .filter((file) => extname(file).toLowerCase() === '.json' && !file.toLowerCase().endsWith('speaker-encoder-manifest.json'))
    .sort((left, right) => speakerEncoderOutputRank(left) - speakerEncoderOutputRank(right));

  return candidates[0];
}

function speakerEncoderOutputRank(filePath: string): number {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('speaker-embeddings.json')) {
    return 0;
  }

  if (lower.includes('embedding')) {
    return 1;
  }

  return 2;
}

async function buildSttCommand(job: SttJobRecord, task: SttClipTask): Promise<SttCommand> {
  const outputDir = resolveSttTaskOutputDir(job, task);
  await mkdir(outputDir, { recursive: true });

  const template = process.env.DANBI_STT_COMMAND;
  if (template?.trim()) {
    const expanded = template
      .replace(/\{input\}/g, quoteArg(task.inputPath))
      .replace(/\{outputDir\}/g, quoteArg(outputDir))
      .replace(/\{language\}/g, quoteArg(job.language));
    const [command, ...args] = splitCommandLine(expanded);
    if (!command) {
      throw new Error('DANBI_STT_COMMAND is empty after expansion.');
    }

    return {
      command,
      args,
      outputDir,
      display: expanded,
    };
  }

  const args = [
    task.inputPath,
    '--output_format',
    'json',
    '--output_dir',
    outputDir,
    '--fp16',
    'False',
  ];
  if (job.language !== 'auto') {
    args.push('--language', job.language);
  }

  return {
    command: process.env.DANBI_STT_BINARY || job.engine || 'whisper',
    args,
    outputDir,
    display: `${process.env.DANBI_STT_BINARY || job.engine || 'whisper'} ${args.map(quoteArg).join(' ')}`,
  };
}

function runCommand(command: SttCommand, signal: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command.command, command.args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = readSttCommandTimeoutMs('DANBI_STT_COMMAND_TIMEOUT_MS', DEFAULT_STT_COMMAND_TIMEOUT_MS);
    const abort = () => {
      child.kill();
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      signal.removeEventListener('abort', abort);
      callback();
    };
    timeout = setTimeout(() => {
      finish(() => {
        child.kill('SIGTERM');
        reject(new Error(`STT command timed out after ${timeoutMs}ms: ${command.display}`));
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(() => reject(new Error(`Failed to start STT command "${command.display}": ${error.message}`)));
    });
    child.on('close', (code) => {
      finish(() => {
        if (signal.aborted) {
          reject(new Error('STT job cancelled.'));
          return;
        }

        if (code !== 0) {
          reject(new Error(`STT command failed with code ${code}: ${trimOutput(stderr || stdout) || command.display}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

async function readTranscriptOutput(outputDir: string, stdout: string): Promise<{ content: string; format: SttTranscriptFormat }> {
  const outputFile = await findTranscriptFile(outputDir);
  if (outputFile) {
    return {
      content: await readFile(outputFile, 'utf8'),
      format: formatFromPath(outputFile),
    };
  }

  if (stdout.trim()) {
    return {
      content: stdout,
      format: 'auto',
    };
  }

  throw new Error('STT engine completed but did not produce a transcript file or stdout transcript.');
}

async function findTranscriptFile(outputDir: string): Promise<string | undefined> {
  const files = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const candidates = files
    .filter((file) => file.isFile())
    .map((file) => join(outputDir, file.name))
    .filter((file) => ['.json', '.srt', '.vtt', '.txt'].includes(extname(file).toLowerCase()))
    .sort((a, b) => transcriptRank(a) - transcriptRank(b));

  return candidates[0];
}

function transcriptRank(filePath: string): number {
  switch (extname(filePath).toLowerCase()) {
    case '.json':
      return 0;
    case '.srt':
      return 1;
    case '.vtt':
      return 2;
    default:
      return 3;
  }
}

function formatFromPath(filePath: string): SttTranscriptFormat {
  switch (extname(filePath).toLowerCase()) {
    case '.json':
      return 'json';
    case '.srt':
      return 'srt';
    case '.vtt':
      return 'vtt';
    default:
      return 'text';
  }
}

function enqueueJob(id: string): void {
  if (!pending.includes(id)) {
    pending.push(id);
  }
}

function removePendingJob(id: string): void {
  const index = pending.indexOf(id);
  if (index !== -1) {
    pending.splice(index, 1);
  }
}

function takeNextPendingJob(): string | undefined {
  pending.sort((leftId, rightId) => {
    const left = jobs.get(leftId);
    const right = jobs.get(rightId);
    if (!left || !right) {
      return left ? -1 : 1;
    }

    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });

  return pending.shift();
}

function snapshot(job: SttJobRecord): SttJobSnapshot {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    priority: job.priority,
    execute: job.execute,
    engine: job.engine,
    language: job.language,
    speakerEncoderCommand: job.speakerEncoderCommand,
    totalClips: job.totalClips,
    completedClips: job.completedClips,
    failedClips: job.failedClips,
    currentClipId: job.currentClipId,
    captions: job.captions.map((caption) => ({ ...caption })),
    tasks: job.tasks.map((task) => ({ ...task, clip: { ...task.clip }, waveformPeaks: task.waveformPeaks ? [...task.waveformPeaks] : undefined })),
    error: job.error,
    warnings: [...job.warnings],
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function normalizeOrphanedJob(job: SttJobSnapshot): SttJobSnapshot {
  if (job.status === 'queued' || job.status === 'running') {
    return {
      ...job,
      status: 'failed',
      progress: 100,
      error: 'STT job was interrupted while the server was offline.',
      completedAt: job.completedAt ?? new Date().toISOString(),
    };
  }

  return job;
}

function persistJob(job: SttJobRecord): void {
  void savePersistedJob('stt', snapshot(job)).catch(() => undefined);
}

async function assertReadable(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`STT input file not found: ${filePath}`);
  }
}

function resolveAssetInputSource(asset: EditorAsset): string {
  return asset.renderPath || asset.source;
}

function resolveAssetInputPath(candidate: string): string {
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith('blob:')) {
    return candidate;
  }

  if (candidate.startsWith('file://')) {
    return fileURLToPath(candidate);
  }

  const localPath = stripSourceDecorators(candidate);
  if (localPath.startsWith('/imports/')) {
    return resolveImportStoragePath(decodeSourcePath(localPath.slice('/imports/'.length)));
  }

  if (localPath.startsWith('/outputs/')) {
    return resolveReadableOutputPath(decodeSourcePath(localPath.slice('/outputs/'.length)));
  }

  if (localPath.startsWith('/cache/')) {
    return resolveReadableCachePath(decodeSourcePath(localPath.slice('/cache/'.length)));
  }

  if (localPath.startsWith('/')) {
    return join(process.cwd(), 'public', localPath.replace(/^\/+/, ''));
  }

  return candidate;
}

function resolveSttTaskOutputDir(job: SttJobSnapshot, task: SttClipTask): string {
  return join(getSttStorageRoot(), safeSttStorageSegment(job.id, 'job'), safeSttStorageSegment(task.id, 'task'));
}

function safeSttStorageSegment(value: string, fallback: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || fallback;
}

function stripSourceDecorators(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value;
}

function decodeSourcePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitCommandLine(value: string): string[] {
  const tokens = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return tokens.map((token) => token.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizeLanguage(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || 'auto';
}

function normalizeOptionalCommand(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function readSttCommandTimeoutMs(envName: string, fallback: number): number {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(Math.min(MAX_STT_COMMAND_TIMEOUT_MS, Math.max(MIN_STT_COMMAND_TIMEOUT_MS, parsed)));
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function trimOutput(value: string): string {
  return value.trim().split(/\r?\n/).slice(-8).join('\n').slice(0, 1200);
}
