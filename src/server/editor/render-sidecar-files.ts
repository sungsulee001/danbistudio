import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';

export async function prepareFfmpegRenderPlanSidecarFiles(plan: FfmpegRenderPlan): Promise<void> {
  if (!plan.chapterMetadata) {
    return;
  }

  await mkdir(dirname(plan.chapterMetadata.path), { recursive: true });
  await writeFileAtomically(plan.chapterMetadata.path, plan.chapterMetadata.content);
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
