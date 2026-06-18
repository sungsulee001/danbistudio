import type { RenderFailureDiagnosticView } from './editor-view-model';

export interface RenderDiagnosticActionView {
  label: string;
  detail: string;
  kind: 'install' | 'output' | 'profile' | 'relink' | 'retry' | 'review' | 'timeline';
}

export interface RenderDiagnosticViewModel {
  tone: 'blocked' | 'retry' | 'review';
  title: string;
  summary: string;
  categoryLabel: string;
  retryLabel: string;
  primaryAction?: RenderDiagnosticActionView;
  actions: RenderDiagnosticActionView[];
  evidence: string[];
}

interface RenderDiagnosticExportProfile {
  id: string;
  label: string;
  container: string;
  codec: string;
}

interface RenderDiagnosticRelinkPlan {
  inputs: Array<{
    assetId: string;
    source: string;
  }>;
}

export type RenderDiagnosticActionPlan =
  | { kind: 'relink'; assetId: string }
  | { kind: 'profile'; profileId: string; status: string }
  | { kind: 'output' }
  | { kind: 'retry' }
  | { kind: 'timeline'; playhead: number; status: string }
  | { kind: 'status'; status: string };

export interface RenderDiagnosticActionPlanOptions {
  action: RenderDiagnosticActionView;
  evidence?: string[];
  plan?: RenderDiagnosticRelinkPlan;
  availableAssetIds?: { has(assetId: string): boolean };
  exportProfiles?: RenderDiagnosticExportProfile[];
}

export function buildRenderDiagnosticView(diagnostic: RenderFailureDiagnosticView): RenderDiagnosticViewModel {
  const actions = diagnostic.actions.map((action) => buildDiagnosticActionView(diagnostic.category, action));

  return {
    tone: diagnostic.retryable ? 'retry' : diagnostic.category === 'filter-graph' || diagnostic.category === 'unknown' ? 'review' : 'blocked',
    title: titleForRenderDiagnosticCategory(diagnostic.category),
    summary: diagnostic.summary,
    categoryLabel: diagnostic.category.replace(/-/g, ' '),
    retryLabel: diagnostic.retryable ? 'Retry possible after review' : 'Resolve issue, then retry current export',
    primaryAction: actions[0],
    actions,
    evidence: diagnostic.evidence.filter(Boolean).slice(0, 4),
  };
}

export function formatRenderDiagnosticProblem(diagnostic: RenderFailureDiagnosticView): string {
  const view = buildRenderDiagnosticView(diagnostic);
  return view.primaryAction
    ? `${view.title}: ${view.primaryAction.label}`
    : `${view.title}: ${view.summary}`;
}

export function canRetryRenderDiagnostic(_diagnostic: RenderFailureDiagnosticView | undefined): boolean {
  return true;
}

export function formatRenderRetryActionLabel(_diagnostic: RenderFailureDiagnosticView | undefined): string {
  return 'Retry current export';
}

export function formatRenderRetryBlockedStatus(_diagnostic: RenderFailureDiagnosticView | undefined): string | undefined {
  return undefined;
}

export function findRenderDiagnosticRelinkAssetId(
  plan: RenderDiagnosticRelinkPlan | undefined,
  evidence: string[] = [],
): string | undefined {
  const inputs = plan?.inputs ?? [];
  const matchedInput = inputs.find((input) => sourceMatchesDiagnosticEvidence(input.source, evidence));
  if (matchedInput) {
    return matchedInput.assetId;
  }

  return inputs.find((input) => (
    input.source.startsWith('blob:') || input.source.startsWith('local://')
  ))?.assetId ?? inputs[0]?.assetId;
}

export function resolveRenderDiagnosticActionPlan({
  action,
  evidence,
  plan,
  availableAssetIds,
  exportProfiles = [],
}: RenderDiagnosticActionPlanOptions): RenderDiagnosticActionPlan {
  switch (action.kind) {
    case 'relink': {
      const assetId = findRenderDiagnosticRelinkAssetId(plan, evidence);
      if (!assetId || (availableAssetIds && !availableAssetIds.has(assetId))) {
        return {
          kind: 'status',
          status: 'Select the missing media in the Media Bin and relink it before retrying render',
        };
      }

      return { kind: 'relink', assetId };
    }
    case 'profile': {
      const profile = exportProfiles.find((candidate) => (
        candidate.codec === 'h264' && candidate.container === 'mp4'
      )) ?? exportProfiles[0];

      return profile
        ? { kind: 'profile', profileId: profile.id, status: `Selected export profile: ${profile.label}` }
        : { kind: 'status', status: 'No export profile is available to switch to' };
    }
    case 'output':
      return { kind: 'output' };
    case 'retry':
      return { kind: 'retry' };
    case 'timeline':
      return { kind: 'timeline', playhead: 0, status: action.detail };
    case 'install':
    case 'review':
    default:
      return { kind: 'status', status: action.detail };
  }
}

function sourceMatchesDiagnosticEvidence(source: string, evidence: string[]): boolean {
  const normalizedSource = normalizeDiagnosticPath(source);
  if (!normalizedSource) {
    return false;
  }

  const fileName = readDiagnosticFileName(normalizedSource);
  return evidence.some((line) => {
    const normalizedLine = normalizeDiagnosticPath(line);
    return normalizedLine.includes(normalizedSource) ||
      (fileName.length > 0 && normalizedLine.includes(fileName));
  });
}

function normalizeDiagnosticPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .toLowerCase();
}

function readDiagnosticFileName(source: string): string {
  return source.split('/').filter(Boolean).at(-1) ?? '';
}

function buildDiagnosticActionView(category: string, action: string): RenderDiagnosticActionView {
  return {
    label: labelForDiagnosticAction(category, action),
    detail: action,
    kind: kindForDiagnosticAction(category, action),
  };
}

function labelForDiagnosticAction(category: string, action: string): string {
  const text = action.toLowerCase();

  if (category === 'missing-ffmpeg' || text.includes('install ffmpeg')) {
    return 'Install FFmpeg';
  }

  if (category === 'unsupported-source' || category === 'missing-media' || text.includes('re-import') || text.includes('relink')) {
    return 'Relink media';
  }

  if (category === 'codec' || text.includes('profile') || text.includes('encoder')) {
    return 'Change export profile';
  }

  if (category === 'permission' || text.includes('writable') || text.includes('close any app')) {
    return 'Choose writable output';
  }

  if (category === 'empty-timeline' || text.includes('timeline')) {
    return 'Fix timeline';
  }

  if (category === 'filter-graph' || category === 'unknown' || text.includes('stderr')) {
    return 'Review FFmpeg log';
  }

  return 'Retry render';
}

function kindForDiagnosticAction(category: string, action: string): RenderDiagnosticActionView['kind'] {
  const text = action.toLowerCase();

  if (category === 'missing-ffmpeg') {
    return 'install';
  }

  if (category === 'unsupported-source' || category === 'missing-media' || text.includes('re-import') || text.includes('relink')) {
    return 'relink';
  }

  if (category === 'codec' || text.includes('profile') || text.includes('encoder')) {
    return 'profile';
  }

  if (category === 'permission' || text.includes('writable') || text.includes('close any app')) {
    return 'output';
  }

  if (category === 'empty-timeline' || text.includes('timeline')) {
    return 'timeline';
  }

  if (category === 'filter-graph' || category === 'unknown' || text.includes('stderr')) {
    return 'review';
  }

  return 'retry';
}

function titleForRenderDiagnosticCategory(category: string): string {
  switch (category) {
    case 'missing-ffmpeg':
      return 'FFmpeg missing';
    case 'missing-media':
      return 'Missing media';
    case 'unsupported-source':
      return 'Unrenderable source';
    case 'codec':
      return 'Codec unavailable';
    case 'filter-graph':
      return 'Filter graph failed';
    case 'permission':
      return 'Output access failed';
    case 'empty-timeline':
      return 'Empty timeline';
    case 'cancelled':
      return 'Render cancelled';
    default:
      return 'Render failed';
  }
}
