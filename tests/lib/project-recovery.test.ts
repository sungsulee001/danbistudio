import { describe, expect, it } from 'vitest';
import { buildProjectRecoveryIndex, type ProjectRecoveryCandidate } from '../../src/lib/editor/project-recovery';

describe('project recovery', () => {
  it('normalizes malformed numeric recovery candidate fields without dropping valid snapshots', () => {
    const candidates = [
      {
        id: 'autosave:project-recovery-numeric',
        projectId: 'project-recovery-numeric',
        name: 'Recovery Numeric',
        source: 'autosave',
        savedAt: '2026-06-17T00:00:00.000Z',
        duration: Number.NaN,
        clipCount: Number.POSITIVE_INFINITY,
        warningCount: Number.NaN,
        storageBytes: -10,
      },
      {
        id: 'database:project-recovery-numeric',
        projectId: 'project-recovery-numeric',
        name: 'Recovery Numeric',
        source: 'database',
        savedAt: 'not-a-date',
        duration: 1,
        clipCount: 1,
        warningCount: 1,
      },
    ] as ProjectRecoveryCandidate[];

    const index = buildProjectRecoveryIndex(candidates);

    expect(index.skippedCount).toBe(1);
    expect(index.candidates).toEqual([
      expect.objectContaining({
        id: 'autosave:project-recovery-numeric',
        duration: 0,
        clipCount: 0,
        warningCount: 0,
        storageBytes: 0,
      }),
    ]);
    expect(index.recommended?.id).toBe('autosave:project-recovery-numeric');
    expect(index.warnings).toEqual([]);
  });
});
