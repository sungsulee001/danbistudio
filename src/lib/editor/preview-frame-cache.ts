// Adapted from OpenCut Classic services/video-cache.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

export interface PreviewCachedFrame {
  timestamp: number;
  duration: number;
  id?: string;
}

export interface PreviewFrameCacheState {
  mediaId: string;
  currentFrame: PreviewCachedFrame | null;
  nextFrame: PreviewCachedFrame | null;
  lastTime: number;
  prefetching: boolean;
  generation: number;
  requestChainLength: number;
}

export interface PreviewFrameRequest {
  mediaId: string;
  time: number;
  generation: number;
}

export type PreviewFrameResolveAction =
  | 'reuse-current'
  | 'promote-next'
  | 'iterate-forward'
  | 'seek'
  | 'stale-current'
  | 'none';

export interface PreviewFrameResolveOptions {
  state: PreviewFrameCacheState;
  request: PreviewFrameRequest;
  decodedFrame?: PreviewCachedFrame | null;
  forwardWindowSeconds?: number;
}

export interface PreviewFrameResolveResult {
  state: PreviewFrameCacheState;
  frame: PreviewCachedFrame | null;
  action: PreviewFrameResolveAction;
  shouldPrefetch: boolean;
}

export interface PreviewFrameCacheStats {
  totalSinks: number;
  activeSinks: number;
  cachedFrames: number;
  pendingRequests: number;
  prefetchingSinks: number;
}

export function createPreviewFrameCacheState(mediaId: string): PreviewFrameCacheState {
  return {
    mediaId,
    currentFrame: null,
    nextFrame: null,
    lastTime: -1,
    prefetching: false,
    generation: 0,
    requestChainLength: 0,
  };
}

export function beginPreviewFrameRequest(
  state: PreviewFrameCacheState,
  time: number,
): { state: PreviewFrameCacheState; request: PreviewFrameRequest } {
  const generation = state.generation + 1;
  const nextState = {
    ...state,
    generation,
    requestChainLength: state.requestChainLength + 1,
  };

  return {
    state: nextState,
    request: {
      mediaId: state.mediaId,
      time: normalizePreviewTime(time),
      generation,
    },
  };
}

export function resolvePreviewFrameRequest({
  state,
  request,
  decodedFrame,
  forwardWindowSeconds = 2,
}: PreviewFrameResolveOptions): PreviewFrameResolveResult {
  let nextState = finishPreviewFrameRequest(state);

  if (request.mediaId !== state.mediaId) {
    return {
      state: nextState,
      frame: null,
      action: 'none',
      shouldPrefetch: false,
    };
  }

  if (request.generation !== state.generation) {
    return {
      state: nextState,
      frame: nextState.currentFrame,
      action: 'stale-current',
      shouldPrefetch: false,
    };
  }

  const requestTime = normalizePreviewTime(request.time);
  if (nextState.nextFrame && nextState.nextFrame.timestamp <= requestTime) {
    const promotedFrame = nextState.nextFrame;
    nextState = {
      ...nextState,
      currentFrame: promotedFrame,
      nextFrame: null,
      lastTime: promotedFrame.timestamp,
    };

    if (isPreviewFrameValid(promotedFrame, requestTime)) {
      return buildPreviewFrameResolveResult(nextState, promotedFrame, 'promote-next');
    }
  }

  if (nextState.currentFrame && isPreviewFrameValid(nextState.currentFrame, requestTime)) {
    return buildPreviewFrameResolveResult(nextState, nextState.currentFrame, 'reuse-current');
  }

  if (shouldIteratePreviewFrameForward(nextState, requestTime, forwardWindowSeconds)) {
    const frame = normalizePreviewCachedFrame(decodedFrame);
    if (frame) {
      nextState = cacheDecodedPreviewFrame(nextState, frame);
    }

    return buildPreviewFrameResolveResult(nextState, frame, 'iterate-forward');
  }

  const seekFrame = normalizePreviewCachedFrame(decodedFrame);
  nextState = {
    ...cacheDecodedPreviewFrame(nextState, seekFrame),
    nextFrame: null,
    lastTime: seekFrame?.timestamp ?? requestTime,
  };

  return buildPreviewFrameResolveResult(nextState, seekFrame, 'seek');
}

export function isPreviewFrameValid(frame: PreviewCachedFrame, time: number): boolean {
  const requestTime = normalizePreviewTime(time);
  return requestTime >= frame.timestamp && requestTime < frame.timestamp + frame.duration;
}

export function shouldIteratePreviewFrameForward(
  state: PreviewFrameCacheState,
  time: number,
  forwardWindowSeconds = 2,
): boolean {
  const requestTime = normalizePreviewTime(time);
  const windowSeconds = Math.max(0, forwardWindowSeconds);
  return Boolean(
    state.currentFrame &&
    state.lastTime >= 0 &&
    requestTime >= state.lastTime &&
    requestTime < state.lastTime + windowSeconds,
  );
}

export function shouldStartPreviewFramePrefetch(state: PreviewFrameCacheState): boolean {
  return Boolean(state.currentFrame && !state.nextFrame && !state.prefetching);
}

export function startPreviewFramePrefetch(state: PreviewFrameCacheState): PreviewFrameCacheState {
  if (!shouldStartPreviewFramePrefetch(state)) {
    return state;
  }

  return {
    ...state,
    prefetching: true,
  };
}

export function completePreviewFramePrefetch(
  state: PreviewFrameCacheState,
  nextFrame: PreviewCachedFrame | null,
): PreviewFrameCacheState {
  return {
    ...state,
    nextFrame: normalizePreviewCachedFrame(nextFrame),
    prefetching: false,
  };
}

export function clearPreviewFrameCacheState(state: PreviewFrameCacheState): PreviewFrameCacheState {
  return {
    ...createPreviewFrameCacheState(state.mediaId),
    generation: state.generation + 1,
  };
}

export function summarizePreviewFrameCache(states: Iterable<PreviewFrameCacheState>): PreviewFrameCacheStats {
  const list = Array.from(states);

  return {
    totalSinks: list.length,
    activeSinks: list.filter(isPreviewFrameCacheActive).length,
    cachedFrames: list.reduce((total, state) => total + (state.currentFrame ? 1 : 0) + (state.nextFrame ? 1 : 0), 0),
    pendingRequests: list.reduce((total, state) => total + state.requestChainLength, 0),
    prefetchingSinks: list.filter((state) => state.prefetching).length,
  };
}

function buildPreviewFrameResolveResult(
  state: PreviewFrameCacheState,
  frame: PreviewCachedFrame | null,
  action: PreviewFrameResolveAction,
): PreviewFrameResolveResult {
  return {
    state,
    frame,
    action,
    shouldPrefetch: shouldStartPreviewFramePrefetch(state),
  };
}

function cacheDecodedPreviewFrame(
  state: PreviewFrameCacheState,
  frame: PreviewCachedFrame | null,
): PreviewFrameCacheState {
  if (!frame) {
    return state;
  }

  return {
    ...state,
    currentFrame: frame,
    lastTime: frame.timestamp,
  };
}

function finishPreviewFrameRequest(state: PreviewFrameCacheState): PreviewFrameCacheState {
  return {
    ...state,
    requestChainLength: Math.max(0, state.requestChainLength - 1),
  };
}

function isPreviewFrameCacheActive(state: PreviewFrameCacheState): boolean {
  return Boolean(
    state.currentFrame ||
    state.nextFrame ||
    state.prefetching ||
    state.requestChainLength > 0 ||
    state.lastTime >= 0,
  );
}

function normalizePreviewCachedFrame(frame: PreviewCachedFrame | null | undefined): PreviewCachedFrame | null {
  if (!frame || !Number.isFinite(frame.timestamp) || !Number.isFinite(frame.duration) || frame.duration <= 0) {
    return null;
  }

  return {
    ...frame,
    timestamp: normalizePreviewTime(frame.timestamp),
    duration: frame.duration,
  };
}

function normalizePreviewTime(time: number): number {
  return Math.max(0, Number.isFinite(time) ? time : 0);
}
