import { describe, expect, it } from 'vitest';
import {
  beginProgramMonitorMoveInteraction,
  beginProgramMonitorRotationInteraction,
  beginProgramMonitorScaleInteraction,
  resolveProgramMonitorMoveInteractionMove,
  resolveProgramMonitorRotationInteractionMove,
  resolveProgramMonitorScaleInteractionMove,
  resolveProgramMonitorWheelZoomInteraction,
} from '../../src/electron/renderer/program-monitor-interaction-adapter';

describe('program monitor interaction adapter', () => {
  it('keeps visual move pending until the drag threshold is crossed', () => {
    const session = beginProgramMonitorMoveInteraction({
      clientX: 100,
      clientY: 100,
      startX: 12,
      startY: -6,
      previewScale: 2,
    });

    const move = resolveProgramMonitorMoveInteractionMove({
      session,
      clientX: 101,
      clientY: 101,
    });

    expect(move.session.moved).toBe(false);
    expect(move.patch).toEqual({
      positionX: 12,
      positionY: -6,
    });
    expect(move.guides).toBeNull();
  });

  it('maps visual move screen pixels into canvas-space motion patch', () => {
    const session = beginProgramMonitorMoveInteraction({
      clientX: 100,
      clientY: 100,
      startX: 10,
      startY: 20,
      previewScale: 2,
    });

    const move = resolveProgramMonitorMoveInteractionMove({
      session,
      clientX: 150,
      clientY: 130,
    });

    expect(move.session.moved).toBe(true);
    expect(move.patch).toEqual({
      positionX: 35,
      positionY: 35,
    });
  });

  it('snaps moved visual layers back to monitor center', () => {
    const session = beginProgramMonitorMoveInteraction({
      clientX: 100,
      clientY: 100,
      startX: 5,
      startY: -5,
      previewScale: 1,
    });

    const move = resolveProgramMonitorMoveInteractionMove({
      session,
      clientX: 96,
      clientY: 104,
    });

    expect(move.patch).toEqual({
      positionX: 0,
      positionY: 0,
    });
    expect(move.guides).toEqual({
      centerX: true,
      centerY: true,
    });
  });

  it('resolves corner scale drag from rendered box geometry', () => {
    const session = beginProgramMonitorScaleInteraction({
      clientX: 100,
      clientY: 100,
      startScale: 1,
      handle: 'se',
      boxWidth: 160,
      boxHeight: 90,
    });

    const move = resolveProgramMonitorScaleInteractionMove({
      session,
      clientX: 160,
      clientY: 145,
    });

    expect(move.session.moved).toBe(true);
    expect(move.patch.scale).toBeGreaterThan(1.4);
  });

  it('resolves rotation handle drag around the visual center', () => {
    const session = beginProgramMonitorRotationInteraction({
      clientX: 100,
      clientY: 50,
      centerX: 100,
      centerY: 100,
      startRotation: 0,
    });

    const move = resolveProgramMonitorRotationInteractionMove({
      session,
      clientX: 150,
      clientY: 100,
    });

    expect(move.session.moved).toBe(true);
    expect(move.patch.rotation).toBe(90);
  });

  it('anchors preview wheel zoom at the cursor and returns a matching pan', () => {
    const plan = resolveProgramMonitorWheelZoomInteraction({
      clientX: 700,
      clientY: 380,
      viewportLeft: 100,
      viewportTop: 80,
      viewportWidth: 800,
      viewportHeight: 500,
      stageWidth: 1000,
      stageHeight: 700,
      pan: { x: 0, y: 0 },
      currentZoomPercent: 100,
      deltaY: -120,
      deltaMode: 0,
    });

    expect(plan.shouldZoom).toBe(true);
    expect(plan.nextZoomPercent).toBeGreaterThan(100);
    expect(plan.nextPan.x).toBeLessThan(0);
    expect(plan.nextPan.y).toBeLessThan(0);
  });
});
