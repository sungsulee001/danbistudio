import { buildTimelineStateSnapshot, type TimelineStateSnapshot } from '../shared/timeline-state';
import type { EditorProject } from '../../lib/editor/types';

export function buildRendererTimelineState(project: EditorProject): TimelineStateSnapshot {
  return buildTimelineStateSnapshot(project);
}
