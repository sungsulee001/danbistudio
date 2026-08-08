import { describe, expect, it } from 'vitest';
import {
  beginTimelineClipBodyInteraction,
  beginTimelineClipEdgeInteraction,
  beginTimelineScrubInteraction,
  resolveTimelineClipBodyInteractionMove,
  resolveTimelineClipEdgeInteractionMove,
  resolveTimelineClipSelectInteraction,
  resolveTimelineImportDropStart,
  resolveTimelineScrubInteractionEnd,
  resolveTimelineScrubInteractionMove,
  resolveTimelineWheelZoomInteraction,
} from '../../src/electron/renderer/timeline-interaction-adapter';
import { resolveTimelineClipTrimEdit } from '../../src/electron/renderer/timeline-edit-preview-helpers';
import { createDefaultEditorProject } from '../../src/lib/editor/project';
import { getLinkedClipIds, linkAudioVideoClips } from '../../src/lib/editor/timeline';

describe('timeline interaction adapter', () => {
  it('tracks clip body drag as pending session, preview delta, and commit-ready state', () => {
    const session = beginTimelineClipBodyInteraction({
      clientX: 100,
      clientY: 40,
      scrollLeft: 0,
      start: 8,
      clickOffsetSeconds: 1.5,
      mode: 'move',
    });

    const move = resolveTimelineClipBodyInteractionMove({
      session,
      clientX: 180,
      clientY: 43,
      currentScrollLeft: 20,
      pixelsPerSecond: 20,
    });

    expect(move.deltaSeconds).toBe(5);
    expect(move.nextStart).toBe(13);
    expect(move.grabTime).toBe(14.5);
    expect(move.session.clickOffsetSeconds).toBe(1.5);
    expect(move.session.moved).toBe(true);
  });

  it('keeps clip body drag pending below the movement threshold', () => {
    const session = beginTimelineClipBodyInteraction({
      clientX: 100,
      clientY: 40,
      scrollLeft: 0,
      start: 8,
      clickOffsetSeconds: 1,
      mode: 'move',
    });

    const move = resolveTimelineClipBodyInteractionMove({
      session,
      clientX: 102,
      clientY: 41,
      currentScrollLeft: 0,
      pixelsPerSecond: 200,
    });

    expect(move.deltaSeconds).toBe(0.01);
    expect(move.nextStart).toBe(8.01);
    expect(move.grabTime).toBe(9.01);
    expect(move.session.moved).toBe(false);
  });

  it('tracks clip edge trim delta as a separate interaction session', () => {
    const session = beginTimelineClipEdgeInteraction({
      clientX: 100,
      scrollLeft: 0,
      edge: 'end',
      mode: 'trim',
    });

    const move = resolveTimelineClipEdgeInteractionMove({
      session,
      clientX: 150,
      currentScrollLeft: 10,
      pixelsPerSecond: 20,
    });

    expect(move.deltaSeconds).toBe(3);
    expect(move.rawDeltaSeconds).toBe(3);
    expect(move.constrained).toBe(false);
    expect(move.session.edge).toBe('end');
    expect(move.session.moved).toBe(true);
  });

  it('keeps clip edge trim pending below the movement threshold', () => {
    const session = beginTimelineClipEdgeInteraction({
      clientX: 100,
      scrollLeft: 0,
      clipStart: 10,
      clipDuration: 5,
      minDuration: 0.25,
      edge: 'start',
      mode: 'trim',
    });

    const move = resolveTimelineClipEdgeInteractionMove({
      session,
      clientX: 102,
      currentScrollLeft: 0,
      pixelsPerSecond: 20,
    });

    expect(move.rawDeltaSeconds).toBe(0.1);
    expect(move.deltaSeconds).toBe(0.1);
    expect(move.previewStart).toBe(10.1);
    expect(move.session.moved).toBe(false);
  });

  it('clamps clip head trim before preview and commit deltas can exceed valid duration', () => {
    const session = beginTimelineClipEdgeInteraction({
      clientX: 100,
      scrollLeft: 0,
      clipStart: 5,
      clipDuration: 3,
      minDuration: 1,
      edge: 'start',
      mode: 'trim',
    });

    const move = resolveTimelineClipEdgeInteractionMove({
      session,
      clientX: 220,
      currentScrollLeft: 0,
      pixelsPerSecond: 20,
    });

    expect(move.rawDeltaSeconds).toBe(6);
    expect(move.deltaSeconds).toBe(2);
    expect(move.constrained).toBe(true);
    expect(move.previewStart).toBe(7);
    expect(move.previewDuration).toBe(1);
  });

  it('clamps clip head trim at the start of the timeline', () => {
    const session = beginTimelineClipEdgeInteraction({
      clientX: 100,
      scrollLeft: 0,
      clipStart: 2,
      clipDuration: 5,
      minDuration: 1,
      edge: 'start',
      mode: 'trim',
    });

    const move = resolveTimelineClipEdgeInteractionMove({
      session,
      clientX: 0,
      currentScrollLeft: 0,
      pixelsPerSecond: 20,
    });

    expect(move.rawDeltaSeconds).toBe(-5);
    expect(move.deltaSeconds).toBe(-2);
    expect(move.constrained).toBe(true);
    expect(move.previewStart).toBe(0);
    expect(move.previewDuration).toBe(7);
  });

  it('does not mark edge trim as moved when a boundary clamp leaves no applied delta', () => {
    const session = beginTimelineClipEdgeInteraction({
      clientX: 100,
      scrollLeft: 0,
      clipStart: 0,
      clipDuration: 5,
      minDuration: 1,
      edge: 'start',
      mode: 'trim',
    });

    const move = resolveTimelineClipEdgeInteractionMove({
      session,
      clientX: 0,
      currentScrollLeft: 0,
      pixelsPerSecond: 20,
    });

    expect(move.rawDeltaSeconds).toBe(-5);
    expect(move.deltaSeconds).toBe(0);
    expect(move.constrained).toBe(true);
    expect(move.session.moved).toBe(false);
  });

  it('maps import timeline drop coordinates through the adapter', () => {
    const project = createDefaultEditorProject();

    const start = resolveTimelineImportDropStart({
      project,
      clientX: 170,
      laneLeft: 50,
      pixelsPerSecond: 24,
      snapEnabled: false,
      snapExtraPoints: [],
    });

    expect(start).toBe(5);
  });

  it('maps ruler scrub start, move, and end through a stable session', () => {
    const start = beginTimelineScrubInteraction({
      rulerLeft: 40,
      startScrollLeft: 0,
      playhead: 0,
    });

    const move = resolveTimelineScrubInteractionMove({
      session: start.session,
      clientX: 160,
      currentScrollLeft: 0,
      pixelsPerSecond: 24,
      duration: 60,
      frameRate: 30,
    });
    const end = resolveTimelineScrubInteractionEnd({
      session: move.session,
      clientX: 160,
      currentScrollLeft: 0,
      pixelsPerSecond: 24,
      duration: 60,
      frameRate: 30,
    });

    expect(move.playhead).toBe(5);
    expect(end.playhead).toBe(5);
    expect(end.status).toContain('Timeline scrubbed');
  });

  it('maps clip selection through the adapter without changing Danbi grouping semantics', () => {
    const project = createDefaultEditorProject();
    const clip = project.tracks.flatMap((track) => track.clips)[0];
    expect(clip).toBeDefined();

    const selection = resolveTimelineClipSelectInteraction({
      project,
      currentSelectedClipIds: [],
      clip: clip!,
      modifiers: {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    expect(selection.selectedClipId).toBe(clip!.id);
    expect(selection.selectedClipIds).toContain(clip!.id);
    expect(selection.seekTime).toBe(clip!.start);
  });

  it('can select a linked video clip without selecting linked audio when separate editing is enabled', () => {
    const project = linkAudioVideoClips(createDefaultEditorProject(), 'clip-interview-1', 'clip-music-1');
    const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === 'clip-interview-1');
    expect(clip).toBeDefined();
    expect(getLinkedClipIds(project, clip!.id)).toEqual(['clip-interview-1', 'clip-music-1']);

    const linkedSelection = resolveTimelineClipSelectInteraction({
      project,
      currentSelectedClipIds: [],
      clip: clip!,
      modifiers: {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
      includeLinked: true,
    });
    const separateSelection = resolveTimelineClipSelectInteraction({
      project,
      currentSelectedClipIds: [],
      clip: clip!,
      modifiers: {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
      includeLinked: false,
    });

    expect(linkedSelection.selectedClipIds).toEqual(['clip-interview-1', 'clip-music-1']);
    expect(separateSelection.selectedClipIds).toEqual(['clip-interview-1']);
  });

  it('keeps linked audio out of ripple trim previews when separate editing is enabled', () => {
    const project = linkAudioVideoClips(createDefaultEditorProject(), 'clip-interview-1', 'clip-music-1');
    const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === 'clip-interview-1');
    expect(clip).toBeDefined();

    const linkedTrim = resolveTimelineClipTrimEdit({
      project,
      selectedClipIds: [clip!.id],
      snapEnabled: false,
      includeLinked: true,
      rippleMode: true,
      clip: clip!,
      edge: 'end',
      deltaSeconds: 1,
    });
    const separateTrim = resolveTimelineClipTrimEdit({
      project,
      selectedClipIds: [clip!.id],
      snapEnabled: false,
      includeLinked: false,
      rippleMode: true,
      clip: clip!,
      edge: 'end',
      deltaSeconds: 1,
    });

    expect(linkedTrim.group.map((item) => item.id)).toEqual(['clip-interview-1', 'clip-music-1']);
    expect(separateTrim.group.map((item) => item.id)).toEqual(['clip-interview-1']);
  });

  it('anchors timeline wheel zoom at the cursor time and returns the matching scroll position', () => {
    const plan = resolveTimelineWheelZoomInteraction({
      clientX: 300,
      viewportLeft: 100,
      viewportWidth: 500,
      scrollLeft: 200,
      currentPixelsPerSecond: 20,
      deltaY: -120,
      deltaMode: 0,
      duration: 120,
    });

    expect(plan.shouldZoom).toBe(true);
    expect(plan.nextPixelsPerSecond).toBeGreaterThan(20);
    expect(plan.anchorTime).toBe(20);
    expect(plan.nextScrollLeft).toBe(Math.round((plan.anchorTime * plan.nextPixelsPerSecond) - 200));

    const headerOffsetPlan = resolveTimelineWheelZoomInteraction({
      clientX: 300,
      viewportLeft: 100,
      viewportWidth: 500,
      scrollLeft: 328,
      currentPixelsPerSecond: 20,
      deltaY: -120,
      deltaMode: 0,
      duration: 120,
      timelineStartOffsetPixels: 128,
    });
    expect(headerOffsetPlan.anchorTime).toBe(20);
    expect(headerOffsetPlan.nextScrollLeft).toBe(
      Math.round(128 + (headerOffsetPlan.anchorTime * headerOffsetPlan.nextPixelsPerSecond) - 200),
    );
  });
});
