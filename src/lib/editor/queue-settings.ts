export interface EditorQueueSettings {
  renderConcurrency: number;
  mediaCacheConcurrency: number;
  comfyuiConcurrency: number;
  sttConcurrency: number;
  defaultRenderPriority: number;
  defaultMediaCachePriority: number;
  defaultComfyUIPriority: number;
  defaultSttPriority: number;
}

export const DEFAULT_EDITOR_QUEUE_SETTINGS: EditorQueueSettings = {
  renderConcurrency: 1,
  mediaCacheConcurrency: 2,
  comfyuiConcurrency: 1,
  sttConcurrency: 1,
  defaultRenderPriority: 0,
  defaultMediaCachePriority: 0,
  defaultComfyUIPriority: 0,
  defaultSttPriority: 0,
};

const globalForQueueSettings = globalThis as unknown as {
  danbiEditorQueueSettings?: EditorQueueSettings;
};

globalForQueueSettings.danbiEditorQueueSettings ??= { ...DEFAULT_EDITOR_QUEUE_SETTINGS };

export function getEditorQueueSettings(): EditorQueueSettings {
  return { ...globalForQueueSettings.danbiEditorQueueSettings! };
}

export function updateEditorQueueSettings(patch: Partial<EditorQueueSettings>): EditorQueueSettings {
  const current = getEditorQueueSettings();
  const nextSettings: EditorQueueSettings = {
    renderConcurrency: normalizeConcurrency(patch.renderConcurrency, current.renderConcurrency, 4),
    mediaCacheConcurrency: normalizeConcurrency(patch.mediaCacheConcurrency, current.mediaCacheConcurrency, 6),
    comfyuiConcurrency: normalizeConcurrency(patch.comfyuiConcurrency, current.comfyuiConcurrency, 4),
    sttConcurrency: normalizeConcurrency(patch.sttConcurrency, current.sttConcurrency, 4),
    defaultRenderPriority: normalizeJobPriority(patch.defaultRenderPriority, current.defaultRenderPriority),
    defaultMediaCachePriority: normalizeJobPriority(patch.defaultMediaCachePriority, current.defaultMediaCachePriority),
    defaultComfyUIPriority: normalizeJobPriority(patch.defaultComfyUIPriority, current.defaultComfyUIPriority),
    defaultSttPriority: normalizeJobPriority(patch.defaultSttPriority, current.defaultSttPriority),
  };

  globalForQueueSettings.danbiEditorQueueSettings = nextSettings;
  return { ...nextSettings };
}

export function resetEditorQueueSettings(): EditorQueueSettings {
  globalForQueueSettings.danbiEditorQueueSettings = { ...DEFAULT_EDITOR_QUEUE_SETTINGS };
  return getEditorQueueSettings();
}

export function normalizeJobPriority(value: unknown, fallback: unknown = 0): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  const fallbackValue = typeof fallback === 'number' ? fallback : Number(fallback);
  const safeFallback = Number.isFinite(fallbackValue) ? fallbackValue : 0;

  if (!Number.isFinite(numberValue)) {
    return clamp(Math.round(safeFallback), -100, 100);
  }

  return clamp(Math.round(numberValue), -100, 100);
}

function normalizeConcurrency(value: unknown, fallback: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return clamp(Math.round(fallback), 1, max);
  }

  return clamp(Math.round(numberValue), 1, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
