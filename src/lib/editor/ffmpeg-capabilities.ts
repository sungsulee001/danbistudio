import type { ExportProfile } from './types';

export type FfmpegEncoderPreference = 'software' | 'auto' | string;

export interface FfmpegCapabilities {
  ffmpegPath: string;
  detectedAt: string;
  encoders: string[];
  hardwareEncoders: string[];
  warnings: string[];
}

export interface FfmpegVideoEncoderSelection {
  codec: ExportProfile['codec'];
  encoder: string;
  hardware: boolean;
  preference: FfmpegEncoderPreference;
  availableHardwareEncoders: string[];
  reason: string;
}

const HARDWARE_ENCODERS_BY_CODEC: Record<ExportProfile['codec'], string[]> = {
  h264: ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_vaapi'],
  h265: ['hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'hevc_videotoolbox', 'hevc_vaapi'],
  prores: [],
  av1: ['av1_nvenc', 'av1_qsv', 'av1_amf'],
};

const SOFTWARE_ENCODERS: Record<ExportProfile['codec'], string> = {
  h264: 'libx264',
  h265: 'libx265',
  prores: 'prores_ks',
  av1: 'libaom-av1',
};

export function parseFfmpegEncoders(output: string, ffmpegPath = 'ffmpeg'): FfmpegCapabilities {
  const encoders = Array.from(new Set(output
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\s*[VAS.][FS.][S.][X.][B.][D.]\s+([a-zA-Z0-9_]+)/);
      return match ? [match[1]] : [];
    })))
    .sort();
  const hardwareEncoders = encoders.filter(isHardwareEncoder);

  return {
    ffmpegPath,
    detectedAt: new Date().toISOString(),
    encoders,
    hardwareEncoders,
    warnings: encoders.length === 0 ? ['No FFmpeg encoders were parsed from ffmpeg -encoders output.'] : [],
  };
}

export function selectFfmpegVideoEncoder(
  codec: ExportProfile['codec'],
  capabilities?: FfmpegCapabilities,
  preference: FfmpegEncoderPreference = 'software',
): FfmpegVideoEncoderSelection {
  const softwareEncoder = SOFTWARE_ENCODERS[codec];
  const encoders = new Set(capabilities?.encoders ?? []);
  const hardwareCandidates = HARDWARE_ENCODERS_BY_CODEC[codec].filter((encoder) => encoders.has(encoder));
  const normalizedPreference = normalizePreference(preference);

  if (normalizedPreference === 'software' || codec === 'prores') {
    return {
      codec,
      encoder: softwareEncoder,
      hardware: false,
      preference: normalizedPreference,
      availableHardwareEncoders: hardwareCandidates,
      reason: codec === 'prores'
        ? 'ProRes export uses the software prores_ks encoder.'
        : 'Software encoder selected.',
    };
  }

  if (normalizedPreference !== 'auto') {
    const requestedIsAvailable = capabilities ? encoders.has(normalizedPreference) : true;
    if (requestedIsAvailable) {
      return {
        codec,
        encoder: normalizedPreference,
        hardware: isHardwareEncoder(normalizedPreference),
        preference: normalizedPreference,
        availableHardwareEncoders: hardwareCandidates,
        reason: `Manual FFmpeg encoder selected: ${normalizedPreference}.`,
      };
    }

    return {
      codec,
      encoder: softwareEncoder,
      hardware: false,
      preference: normalizedPreference,
      availableHardwareEncoders: hardwareCandidates,
      reason: `Requested encoder ${normalizedPreference} was not reported by FFmpeg; falling back to ${softwareEncoder}.`,
    };
  }

  const hardwareEncoder = hardwareCandidates[0];
  if (hardwareEncoder) {
    return {
      codec,
      encoder: hardwareEncoder,
      hardware: true,
      preference: normalizedPreference,
      availableHardwareEncoders: hardwareCandidates,
      reason: `Auto-selected hardware encoder ${hardwareEncoder}.`,
    };
  }

  return {
    codec,
    encoder: softwareEncoder,
    hardware: false,
    preference: normalizedPreference,
    availableHardwareEncoders: [],
    reason: `No compatible hardware encoder was detected; using ${softwareEncoder}.`,
  };
}

export async function detectFfmpegCapabilities(ffmpegPath = readEnv('FFMPEG_PATH') || 'ffmpeg'): Promise<FfmpegCapabilities> {
  try {
    const output = await runFfmpegEncoders(ffmpegPath);
    return parseFfmpegEncoders(output, ffmpegPath);
  } catch (error) {
    return {
      ffmpegPath,
      detectedAt: new Date().toISOString(),
      encoders: [],
      hardwareEncoders: [],
      warnings: [`FFmpeg encoder detection failed: ${(error as Error).message}`],
    };
  }
}

export function defaultFfmpegEncoderPreference(): FfmpegEncoderPreference {
  return normalizePreference(readEnv('DANBI_FFMPEG_ENCODER') ?? readEnv('DANBI_FFMPEG_HW_ENCODER') ?? 'software');
}

async function runFfmpegEncoders(ffmpegPath: string): Promise<string> {
  const { spawn } = await import(/* webpackIgnore: true */ 'node:child_process');

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg -encoders exited with code ${code}`));
    });
  });
}

function readEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function normalizePreference(preference: FfmpegEncoderPreference): FfmpegEncoderPreference {
  const value = String(preference || 'software').trim();
  return value || 'software';
}

function isHardwareEncoder(encoder: string): boolean {
  return /_(nvenc|qsv|amf|videotoolbox|vaapi)$/i.test(encoder);
}
