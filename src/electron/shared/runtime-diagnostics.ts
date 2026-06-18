import type { FfmpegCapabilities } from '../../lib/editor/ffmpeg-capabilities';

export type FfmpegExecutableKind = 'ffmpeg' | 'ffprobe';
export type FfmpegDiscoverySource = 'env' | 'resources' | 'app' | 'cwd' | 'path';

export interface DanbiRuntimePathSnapshot {
  userDataPath: string;
  logsPath: string;
  crashDumpsPath: string;
  projectsPath: string;
  packagesPath: string;
  rendersPath: string;
  tempPath: string;
}

export interface FfmpegExecutableCandidateSnapshot {
  kind: FfmpegExecutableKind;
  source: FfmpegDiscoverySource;
  label: string;
  path: string;
  exists?: boolean;
  available: boolean;
  version?: string;
  error?: string;
}

export interface FfmpegSetupSnapshot {
  checkedAt: string;
  ready: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  candidates: FfmpegExecutableCandidateSnapshot[];
  capabilities?: FfmpegCapabilities;
  warnings: string[];
}

export interface DanbiRuntimeSampleSnapshot {
  available: boolean;
  gettingStartedPackagePath?: string;
  candidates: string[];
}

export interface DanbiRuntimeDiagnosticsSnapshot {
  checkedAt: string;
  app: {
    name: string;
    version: string;
    isPackaged: boolean;
    platform: NodeJS.Platform;
    arch: string;
    electronVersion?: string;
    chromeVersion?: string;
    nodeVersion: string;
  };
  rendererUrl?: string;
  paths: DanbiRuntimePathSnapshot;
  ffmpeg: FfmpegSetupSnapshot;
  samples: DanbiRuntimeSampleSnapshot;
  warnings: string[];
}
