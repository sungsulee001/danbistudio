import type { FfmpegRenderPlan } from './ffmpeg-renderer';

export type RenderFailureCategory =
  | 'missing-ffmpeg'
  | 'missing-media'
  | 'unsupported-source'
  | 'codec'
  | 'filter-graph'
  | 'permission'
  | 'empty-timeline'
  | 'cancelled'
  | 'unknown';

export interface RenderFailureDiagnostic {
  category: RenderFailureCategory;
  summary: string;
  retryable: boolean;
  actions: string[];
  evidence: string[];
}

export function analyzeRenderFailure(
  plan: FfmpegRenderPlan,
  stderrTail = '',
  error = '',
): RenderFailureDiagnostic {
  const evidenceText = `${error}\n${stderrTail}\n${plan.warnings.join('\n')}`.toLowerCase();
  const evidence = collectEvidence(plan, stderrTail, error);

  if (evidenceText.includes('enoent') || evidenceText.includes('ffmpeg') && evidenceText.includes('not found')) {
    return diagnostic('missing-ffmpeg', 'FFmpeg executable is not available to the render process.', false, [
      'Install FFmpeg and make sure it is available on PATH.',
      'Restart the dev server after changing PATH.',
    ], evidence);
  }

  if (hasBrowserOnlyRenderSource(plan)) {
    return diagnostic('unsupported-source', 'One or more media sources are browser-only and cannot be rendered by FFmpeg.', false, [
      'Import the media through the editor upload flow so it is saved under /imports.',
      'Rebuild the render plan after the asset has a filesystem renderPath.',
    ], evidence);
  }

  if (plan.warnings.some((warning) => warning.includes('No visual clips'))) {
    return diagnostic('empty-timeline', 'The render plan has no visual clips available for video output.', false, [
      'Place at least one video or image clip on an unlocked, unmuted timeline track.',
      'Check that the source asset exists and is renderable.',
    ], evidence);
  }

  if (evidenceText.includes('no such file') || evidenceText.includes('cannot find the file') || evidenceText.includes('error opening input')) {
    return diagnostic('missing-media', 'FFmpeg could not open one of the media files.', false, [
      'Check that imported files still exist in /imports or on disk.',
      'Re-import missing media and rebuild proxy/cache if needed.',
    ], evidence);
  }

  if (evidenceText.includes('unknown encoder') || evidenceText.includes('encoder') && evidenceText.includes('not found')) {
    return diagnostic('codec', 'The selected export codec is not supported by the installed FFmpeg build.', false, [
      'Switch to the H.264 export profile.',
      'Install an FFmpeg build that includes the requested encoder.',
    ], evidence);
  }

  if (evidenceText.includes('filter_complex') || evidenceText.includes('error initializing complex filters') || evidenceText.includes('invalid argument')) {
    return diagnostic('filter-graph', 'FFmpeg rejected the generated filter graph.', true, [
      'Rebuild the export plan after simplifying overlapping clips or transitions.',
      'Check the render command and stderr tail for the failing filter.',
    ], evidence);
  }

  if (evidenceText.includes('permission denied') || evidenceText.includes('access is denied')) {
    return diagnostic('permission', 'The render output path or source media path is not writable/readable.', true, [
      'Close any app using the target output file.',
      'Render again to a writable local folder.',
    ], evidence);
  }

  if (evidenceText.includes('cancelled')) {
    return diagnostic('cancelled', 'The render was cancelled before completion.', true, [
      'Retry the render when the current queue is ready.',
    ], evidence);
  }

  return diagnostic('unknown', 'The render failed without a recognized FFmpeg error pattern.', true, [
    'Open the stderr tail and inspect the last FFmpeg error.',
    'Retry after rebuilding the export plan.',
  ], evidence);
}

function hasBrowserOnlyRenderSource(plan: FfmpegRenderPlan): boolean {
  return plan.warnings.some((warning) => warning.includes('blob:') || warning.includes('local://')) ||
    plan.inputs.some((input) => input.source.startsWith('blob:') || input.source.startsWith('local://'));
}

function diagnostic(
  category: RenderFailureCategory,
  summary: string,
  retryable: boolean,
  actions: string[],
  evidence: string[],
): RenderFailureDiagnostic {
  return {
    category,
    summary,
    retryable,
    actions,
    evidence,
  };
}

function collectEvidence(plan: FfmpegRenderPlan, stderrTail: string, error: string): string[] {
  return [
    error,
    ...plan.warnings.slice(0, 4),
    ...stderrTail.split(/\r?\n/).filter(Boolean).slice(-4),
  ].filter(Boolean);
}
