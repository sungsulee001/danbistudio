import type { MediaBinSmartCollection } from '../../lib/editor/media-bin';
import type { RenderPreflightIssue } from '../../lib/editor/render-preflight';
import { findClip } from '../../lib/editor/timeline';
import type { EditorAsset, EditorProject } from '../../lib/editor/types';
import { formatTimecode } from './editor-time-helpers';

export interface PreflightIssueFocusPlan {
  sourceAssetId?: string;
  mediaBinFilter?: string;
  mediaSmartFilter?: MediaBinSmartCollection;
  selectedClipId?: string;
  selectedClipIds?: string[];
  selectedCaptionIds?: string[];
  selectedTrackId?: string;
  playhead?: number;
  status?: string;
}

export interface PreflightIssueRelinkPlan {
  canRelink: boolean;
  sourceAssetId?: string;
  relinkAssetId?: string;
  status?: string;
}

export type PreflightIssuePrimaryActionKind = 'cache' | 'focus' | 'output' | 'profile' | 'relink' | 'render' | 'review';

export interface PreflightIssuePrimaryAction {
  kind: PreflightIssuePrimaryActionKind;
  label: string;
  detail: string;
}

export function resolvePreflightIssuePrimaryAction(issue: RenderPreflightIssue): PreflightIssuePrimaryAction {
  switch (issue.actionKind) {
    case 'cache':
      return {
        kind: 'cache',
        label: 'Build cache',
        detail: issue.action,
      };
    case 'output':
      return {
        kind: 'output',
        label: 'Choose output',
        detail: issue.action,
      };
    case 'profile':
      return {
        kind: 'profile',
        label: 'Review profile',
        detail: issue.action,
      };
    case 'relink':
      return {
        kind: 'relink',
        label: 'Relink media',
        detail: issue.action,
      };
    case 'render':
      return {
        kind: 'render',
        label: 'Review render',
        detail: issue.action,
      };
    case 'timeline':
      return {
        kind: 'focus',
        label: 'Focus timeline',
        detail: issue.action,
      };
    case 'review':
    default:
      return {
        kind: 'review',
        label: 'Review issue',
        detail: issue.action,
      };
  }
}

export function resolvePreflightIssueFocusPlan({
  issue,
  project,
  assetById,
}: {
  issue: RenderPreflightIssue;
  project: EditorProject;
  assetById: Map<string, EditorAsset>;
}): PreflightIssueFocusPlan {
  const plan: PreflightIssueFocusPlan = {};

  if (issue.assetId && assetById.has(issue.assetId)) {
    plan.sourceAssetId = issue.assetId;
    plan.mediaBinFilter = 'all';
    plan.mediaSmartFilter = issue.severity === 'blocked' ? 'missing-render' : 'all';
    plan.status = `Focused asset issue: ${assetById.get(issue.assetId)?.name ?? issue.assetId}`;
  }

  if (issue.clipId) {
    const clip = findClip(project, issue.clipId);
    if (clip) {
      return {
        ...plan,
        selectedClipId: clip.id,
        selectedClipIds: [clip.id],
        selectedTrackId: clip.trackId,
        playhead: issue.time ?? clip.start,
        status: `Focused preflight clip: ${clip.name}`,
      };
    }
  }

  if (issue.captionId) {
    const caption = project.captions.find((item) => item.id === issue.captionId);
    if (caption) {
      return {
        ...plan,
        selectedCaptionIds: [caption.id],
        playhead: issue.time ?? caption.start,
        status: `Focused preflight caption: ${caption.text.trim() || caption.id}`,
      };
    }
  }

  if (issue.time !== undefined) {
    return {
      ...plan,
      playhead: issue.time,
      status: `Focused preflight time ${formatTimecode(issue.time, project.fps)}`,
    };
  }

  if (issue.assetId) {
    return plan;
  }

  return {
    status: issue.message,
  };
}

export function resolvePreflightIssueRelinkPlan({
  issue,
  assetById,
}: {
  issue: RenderPreflightIssue;
  assetById: Map<string, EditorAsset>;
}): PreflightIssueRelinkPlan {
  if (!issue.assetId || !assetById.has(issue.assetId)) {
    return {
      canRelink: false,
      status: 'This preflight issue is not tied to a relinkable asset',
    };
  }

  return {
    canRelink: true,
    sourceAssetId: issue.assetId,
    relinkAssetId: issue.assetId,
  };
}
