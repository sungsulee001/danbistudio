import { buildComfyUIResultReviewReport, inferComfyUIResultKind, resolveComfyUIResultMimeType, resolveComfyUIResultSource, type ComfyUIResultReference } from '../../lib/editor/comfyui-results';
import type { ClipKind, EditorAsset, EditorProject, TimelineClip } from '../../lib/editor/types';
import type { ComfyUIReviewItem } from './editor-view-model';

export function buildComfyUIReviewItems(
  results: ComfyUIResultReference[],
  clips: TimelineClip[],
  assetById: Map<string, EditorAsset>,
  project: EditorProject,
): ComfyUIReviewItem[] {
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));

  return results
    .filter((result) => result.status === 'completed' && Boolean(resolveComfyUIResultSource(result)))
    .map((result, index) => {
      const sourceClip = clipById.get(result.clipId);
      if (!sourceClip) {
        return undefined;
      }

      const resultKind = inferReviewResultKind(result);
      if (!resultKind) {
        return undefined;
      }

      const sourceAsset = sourceClip.assetId ? assetById.get(sourceClip.assetId) : undefined;
      const resultAsset = buildReviewResultAsset(result, sourceClip, project, index, resultKind);
      const resultClip: TimelineClip = {
        ...sourceClip,
        id: `review-${sourceClip.id}-${index + 1}`,
        assetId: resultAsset.id,
        name: resultAsset.name,
        kind: resultAsset.kind,
        sourceIn: 0,
      };

      return {
        result,
        sourceClip,
        sourceAsset,
        resultAsset,
        resultClip,
        reviewReport: buildComfyUIResultReviewReport(result, sourceClip, sourceAsset),
      };
    })
    .filter((item): item is ComfyUIReviewItem => Boolean(item));
}

function buildReviewResultAsset(
  result: ComfyUIResultReference,
  sourceClip: TimelineClip,
  project: EditorProject,
  index: number,
  kind: EditorAsset['kind'],
): EditorAsset {
  const resultSource = resolveComfyUIResultSource(result)!;
  const resultFilename = result.filename ?? filenameFromSource(resultSource);
  const filename = resultFilename || `${sourceClip.name} AI result`;
  const metadata: Record<string, string | number | boolean> = {
    generated: true,
    provider: 'comfyui',
    sourceClipId: sourceClip.id,
    automationJobId: result.automationJobId,
    mimeType: resolveComfyUIResultMimeType(result, kind),
  };
  if (result.promptId) {
    metadata.promptId = result.promptId;
  }
  if (result.workflowName) {
    metadata.workflowName = result.workflowName;
  }
  if (result.modelName) {
    metadata.modelName = result.modelName;
  }
  if (result.prompt) {
    metadata.prompt = result.prompt;
  }
  if (result.negativePrompt) {
    metadata.negativePrompt = result.negativePrompt;
  }
  if (result.seed !== undefined) {
    metadata.seed = result.seed;
  }
  if (result.media?.videoCodec) {
    metadata.videoCodec = result.media.videoCodec;
  }
  if (result.media?.audioCodec) {
    metadata.audioCodec = result.media.audioCodec;
  }

  return {
    id: `review-asset-${sourceClip.id}-${index + 1}`,
    name: filename,
    kind,
    source: resultSource,
    renderPath: result.renderPath,
    duration: Math.max(0.25, result.media?.duration ?? sourceClip.duration),
    width: result.media?.width ?? project.width,
    height: result.media?.height ?? project.height,
    fps: result.media?.fps ?? project.fps,
    mediaCache: result.mediaCache,
    metadata,
  };
}

function inferReviewResultKind(result: ComfyUIResultReference): ClipKind | undefined {
  return inferComfyUIResultKind(result.mimeType, `${result.filename ?? ''} ${resolveComfyUIResultSource(result) ?? ''}`, result.media);
}

function filenameFromSource(source: string): string {
  return source.split(/[\\/]/).pop() ?? '';
}
