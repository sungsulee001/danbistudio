import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRenderInputAccessPreflightIssues } from '../../src/server/editor/render-output-access';
import type { FfmpegRenderPlan } from '../../src/lib/editor/ffmpeg-renderer';
import { createDefaultEditorProject } from '../../src/lib/editor/project';
import type { EditorProject } from '../../src/lib/editor/types';

describe('render input access preflight', () => {
  it('accepts readable normal filesystem input sources', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-render-input-access-'));

    try {
      const sourcePath = join(tempRoot, 'source.mp4');
      await writeFile(sourcePath, 'video');

      await expect(buildRenderInputAccessPreflightIssues(
        buildProjectWithInterviewRenderPath(sourcePath),
        buildPlanWithInterviewSource(sourcePath),
      )).resolves.toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects Windows device namespace input sources before filesystem checks', async () => {
    const sourcePath = '\\\\.\\pipe\\danbi-render-source.mp4';
    const issues = await buildRenderInputAccessPreflightIssues(
      buildProjectWithInterviewRenderPath(sourcePath),
      buildPlanWithInterviewSource(sourcePath),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: 'input-access-asset-interview-windows-device-source',
      severity: 'blocked',
      source: 'media-health',
      message: 'Interview master take render source uses a Windows device namespace path.',
      action: 'Relink Interview master take to a normal local media file before rendering.',
      assetId: 'asset-interview',
      clipId: 'clip-interview-1',
    });
  });
});

function buildProjectWithInterviewRenderPath(renderPath: string): EditorProject {
  const project = createDefaultEditorProject();

  return {
    ...project,
    assets: project.assets.map((asset) => (
      asset.id === 'asset-interview'
        ? { ...asset, renderPath }
        : asset
    )),
  };
}

function buildPlanWithInterviewSource(source: string): FfmpegRenderPlan {
  const project = createDefaultEditorProject();

  return {
    projectId: project.id,
    outputPath: 'E:/renders/final.mp4',
    profile: project.exportProfiles[0],
    ffmpegPath: 'ffmpeg',
    videoEncoder: {} as FfmpegRenderPlan['videoEncoder'],
    inputs: [{
      index: 0,
      assetId: 'asset-interview',
      clipId: 'clip-interview-1',
      source,
      kind: 'video',
      seekSeconds: 0,
      durationSeconds: 1,
    }],
    filterGraph: [],
    command: [],
    commandText: '',
    warnings: [],
  };
}
