import { insertAssetPatchOnTimeline } from '../../lib/editor/timeline';
import type { EditorProject } from '../../lib/editor/types';
import type { PreparedImportedMedia } from './editor-view-model';
import { resolvePreparedMediaBinImportResult, type PreparedMediaBinImportResult } from './media-bin-workflow-helpers';
import { resolveInsertedSourceAssetPatchSelection, type SourceAssetInsertedSelectionPlan } from './source-edit-workflow-helpers';

export type VoiceoverRecordingState = 'idle' | 'requesting' | 'recording' | 'processing';

export interface VoiceoverRecorderEnvironment {
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  isTypeSupported?: (mimeType: string) => boolean;
}

export interface VoiceoverRecorderSupport {
  supported: boolean;
  mimeType: string;
  reason?: string;
}

export interface VoiceoverRecordingSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAtMs: number;
  mimeType: string;
}

export interface VoiceoverRecordedFileOptions {
  blob: Blob;
  projectName: string;
  take: number;
  recordedAt?: Date;
  mimeType?: string;
  createFile?: (parts: BlobPart[], fileName: string, options: FilePropertyBag) => File;
}

export type VoiceoverTimelineImportResult =
  | {
    canImport: false;
    status: string;
  }
  | (PreparedMediaBinImportResult & {
    canImport: true;
    nextProject: EditorProject;
    selection: SourceAssetInsertedSelectionPlan;
    selectedSourceAssetId: string;
    selectedTrackId?: string;
    nextPlayhead: number;
    status: string;
  });

const VOICEOVER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
] as const;
const DEFAULT_VOICEOVER_STOP_TIMEOUT_MS = 5000;

interface VoiceoverGlobalScope {
  navigator?: {
    mediaDevices?: {
      getUserMedia?: unknown;
    };
  };
  MediaRecorder?: {
    new(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
    isTypeSupported?: (mimeType: string) => boolean;
  };
}

export function readVoiceoverRecorderEnvironment(
  scope: VoiceoverGlobalScope = globalThis as VoiceoverGlobalScope,
): VoiceoverRecorderEnvironment {
  return {
    hasGetUserMedia: typeof scope.navigator?.mediaDevices?.getUserMedia === 'function',
    hasMediaRecorder: typeof scope.MediaRecorder === 'function',
    isTypeSupported: scope.MediaRecorder?.isTypeSupported?.bind(scope.MediaRecorder),
  };
}

export function resolveVoiceoverRecorderSupport(
  environment: VoiceoverRecorderEnvironment = readVoiceoverRecorderEnvironment(),
): VoiceoverRecorderSupport {
  const mimeType = resolveVoiceoverMimeType(environment.isTypeSupported);
  if (!environment.hasGetUserMedia) {
    return {
      supported: false,
      mimeType,
      reason: 'Microphone capture is not available in this runtime.',
    };
  }

  if (!environment.hasMediaRecorder) {
    return {
      supported: false,
      mimeType,
      reason: 'MediaRecorder is not available in this runtime.',
    };
  }

  return {
    supported: true,
    mimeType,
  };
}

export async function startVoiceoverRecording({
  mimeType,
  timesliceMs = 250,
}: {
  mimeType?: string;
  timesliceMs?: number;
} = {}): Promise<VoiceoverRecordingSession> {
  const support = resolveVoiceoverRecorderSupport();
  if (!support.supported) {
    throw new Error(support.reason ?? 'Voiceover recording is not available.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  const recorderMimeType = mimeType ?? support.mimeType;
  let recorder: MediaRecorder;

  try {
    recorder = new MediaRecorder(stream, recorderMimeType ? { mimeType: recorderMimeType } : undefined);
  } catch (initialError) {
    try {
      recorder = new MediaRecorder(stream);
    } catch (fallbackError) {
      stopVoiceoverStreamTracks(stream);
      throw fallbackError instanceof Error
        ? fallbackError
        : initialError instanceof Error
          ? initialError
          : new Error(String(fallbackError));
    }
  }

  const session: VoiceoverRecordingSession = {
    recorder,
    stream,
    chunks: [],
    startedAtMs: Date.now(),
    mimeType: recorder.mimeType || recorderMimeType || 'audio/webm',
  };

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      session.chunks.push(event.data);
    }
  });
  try {
    recorder.start(timesliceMs);
  } catch (error) {
    stopVoiceoverStreamTracks(stream);
    throw error instanceof Error ? error : new Error(String(error));
  }

  return session;
}

export function stopVoiceoverRecording(
  session: VoiceoverRecordingSession,
  options: { stopTimeoutMs?: number } = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const buildBlob = () => new Blob(session.chunks, { type: session.mimeType || 'audio/webm' });
    const cleanupListeners = () => {
      session.recorder.removeEventListener('stop', handleStop);
      session.recorder.removeEventListener('error', handleError);
    };
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      cleanupListeners();
      stopVoiceoverStreamTracks(session.stream);
      callback();
    };
    const handleStop = () => {
      settle(() => {
        resolve(buildBlob());
      });
    };
    const handleError = (event: Event) => {
      const error = event instanceof ErrorEvent ? event.error ?? event.message : 'Recorder failed.';
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    };

    session.recorder.addEventListener('stop', handleStop, { once: true });
    session.recorder.addEventListener('error', handleError, { once: true });
    timeout = setTimeout(() => {
      settle(() => {
        resolve(buildBlob());
      });
    }, Math.max(1, options.stopTimeoutMs ?? DEFAULT_VOICEOVER_STOP_TIMEOUT_MS));

    if (session.recorder.state === 'inactive') {
      settle(() => {
        resolve(buildBlob());
      });
      return;
    }

    try {
      session.recorder.requestData();
    } catch {
      // Some MediaRecorder implementations throw if no final data is available yet.
    }

    try {
      session.recorder.stop();
    } catch (error) {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

export function cancelVoiceoverRecording(session: VoiceoverRecordingSession): void {
  try {
    if (session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }
  } catch {
    // Cancel is best-effort; the microphone tracks still need to be released.
  } finally {
    stopVoiceoverStreamTracks(session.stream);
  }
}

export function buildVoiceoverRecordedFile({
  blob,
  projectName,
  take,
  recordedAt = new Date(),
  mimeType = blob.type || 'audio/webm',
  createFile = (parts, fileName, options) => new File(parts, fileName, options),
}: VoiceoverRecordedFileOptions): File {
  const fileName = buildVoiceoverFileName({
    projectName,
    take,
    recordedAt,
    mimeType,
  });

  return createFile([blob], fileName, {
    type: mimeType,
    lastModified: recordedAt.getTime(),
  });
}

export function buildVoiceoverFileName({
  projectName,
  take,
  recordedAt = new Date(),
  mimeType = 'audio/webm',
}: {
  projectName: string;
  take: number;
  recordedAt?: Date;
  mimeType?: string;
}): string {
  const projectSlug = slug(projectName) || 'danbi-studio';
  const takeLabel = String(Math.max(1, Math.floor(take))).padStart(2, '0');
  return `${projectSlug}-voiceover-take-${takeLabel}-${formatDateStamp(recordedAt)}.${extensionForMimeType(mimeType)}`;
}

export function markPreparedMediaAsVoiceover(
  preparedMedia: PreparedImportedMedia[],
  { take }: { take?: number } = {},
): PreparedImportedMedia[] {
  return preparedMedia.map((record) => ({
    ...record,
    input: {
      ...record.input,
      metadata: {
        ...record.input.metadata,
        voiceover: true,
        role: 'voiceover',
        ...(take === undefined ? {} : { take }),
      },
    },
  }));
}

export function resolveVoiceoverTimelineImportResult({
  project,
  preparedMedia,
  playhead,
  audioTargetTrackId,
}: {
  project: EditorProject;
  preparedMedia: PreparedImportedMedia[];
  playhead: number;
  audioTargetTrackId?: string;
}): VoiceoverTimelineImportResult {
  if (preparedMedia.length === 0) {
    return {
      canImport: false,
      status: 'No voiceover media was recorded.',
    };
  }

  const importResult = resolvePreparedMediaBinImportResult({
    project,
    preparedMedia: markPreparedMediaAsVoiceover(preparedMedia),
    fileCount: preparedMedia.length,
  });
  const importedAssetId = importResult.importedAssetIds[0];
  const importedAsset = importResult.nextProject.assets.find((asset) => asset.id === importedAssetId);
  if (!importedAsset || importedAsset.kind !== 'audio') {
    return {
      canImport: false,
      status: 'Recorded voiceover is not an audio asset.',
    };
  }

  const placedProject = insertAssetPatchOnTimeline(importResult.nextProject, importedAsset.id, {
    start: playhead,
    audioTargetTrackId,
    targetTrackId: audioTargetTrackId,
    includePrimary: false,
    includeAudio: true,
  });
  const selection = resolveInsertedSourceAssetPatchSelection({
    previousProject: importResult.nextProject,
    nextProject: placedProject,
    assetId: importedAsset.id,
    start: playhead,
  });

  return {
    ...importResult,
    canImport: true,
    nextProject: placedProject,
    selection,
    selectedSourceAssetId: importedAsset.id,
    selectedTrackId: selection.canSelect ? selection.selectedTrackId : audioTargetTrackId,
    nextPlayhead: selection.canSelect ? selection.nextPlayhead : playhead,
    status: 'Voiceover recorded and inserted at playhead',
  };
}

export function formatVoiceoverFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Voiceover failed: ${message}`;
}

function resolveVoiceoverMimeType(isTypeSupported?: (mimeType: string) => boolean): string {
  if (!isTypeSupported) {
    return 'audio/webm';
  }

  return VOICEOVER_MIME_CANDIDATES.find((candidate) => isTypeSupported(candidate)) ?? 'audio/webm';
}

function stopVoiceoverStreamTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Continue closing the remaining tracks even if one device backend throws.
    }
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) {
    return 'wav';
  }

  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    return 'm4a';
  }

  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  return 'webm';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

function formatDateStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}
