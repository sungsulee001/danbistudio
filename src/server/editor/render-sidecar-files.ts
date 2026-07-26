import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';

// Windows CreateProcess 인자 한계(32767자) 보호 — 캡션이 많은 프로젝트는 -filter_complex
// 인라인 문자열이 한계를 넘어 spawn ENAMETOOLONG으로 실패한다. 임계 초과 시에만 그래프를
// 사이드카 파일로 옮기고 -filter_complex_script로 치환한다(소형 커맨드는 기존 동작 유지).
const MAX_INLINE_FILTER_COMPLEX_LENGTH = 24000;

export async function prepareFfmpegRenderPlanSidecarFiles(plan: FfmpegRenderPlan): Promise<void> {
  await externalizeOversizedFilterComplex(plan);

  if (!plan.chapterMetadata) {
    return;
  }

  await mkdir(dirname(plan.chapterMetadata.path), { recursive: true });
  await writeFileAtomically(plan.chapterMetadata.path, plan.chapterMetadata.content);
}

async function externalizeOversizedFilterComplex(plan: FfmpegRenderPlan): Promise<void> {
  const flagIndex = plan.command.indexOf('-filter_complex');
  if (flagIndex === -1 || flagIndex + 1 >= plan.command.length) {
    return;
  }

  const graph = plan.command[flagIndex + 1];
  if (typeof graph !== 'string' || graph.length <= MAX_INLINE_FILTER_COMPLEX_LENGTH) {
    return;
  }

  const scriptPath = `${plan.outputPath}.filtergraph.txt`;
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFileAtomically(scriptPath, graph);
  plan.command.splice(flagIndex, 2, '-filter_complex_script', scriptPath);
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
