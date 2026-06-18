import { describe, expect, it } from 'vitest';
import {
  buildExternalCustomCommandDefaultParameters,
  countExternalCustomCommandFindings,
  findMissingExternalCustomCommandDefaultParameters,
  formatExternalCustomCommandStatus,
} from '../../src/electron/renderer/plugin-custom-command-helpers';
import type { EditorPluginCustomCommand } from '../../src/lib/editor/types';

describe('plugin custom command renderer helpers', () => {
  it('builds default parameter payloads and flags required parameters without defaults', () => {
    const command: EditorPluginCustomCommand = {
      id: 'timeline-gap-audit',
      label: 'Timeline Gap Audit',
      contribution: 'analyzer',
      kind: 'timeline-report',
      parameters: [
        { key: 'minGapDurationSeconds', type: 'number', required: true, defaultValue: 1 },
        { key: 'includeMuted', type: 'boolean', defaultValue: false },
        { key: 'container', type: 'enum', values: ['mp4', 'mov'], defaultValue: 'mp4' },
        { key: 'reviewer', type: 'string', required: true },
        { key: 'badDefault', type: 'number', defaultValue: 'slow' as never },
      ],
    };

    expect(buildExternalCustomCommandDefaultParameters(command)).toEqual({
      minGapDurationSeconds: 1,
      includeMuted: false,
      container: 'mp4',
    });
    expect(findMissingExternalCustomCommandDefaultParameters(command)).toEqual(['reviewer']);
  });

  it('summarizes custom command results with nested finding counts', () => {
    const result = {
      label: 'Timeline Gap Audit',
      contribution: 'analyzer',
      kind: 'timeline-report',
      parameters: {
        minGapDurationSeconds: 2,
      },
      timelineReport: {
        findings: [
          { severity: 'warning', code: 'timeline-gaps', message: 'Gap found.' },
          { severity: 'info', code: 'track-summary', message: 'Track summarized.' },
        ],
      },
    };

    expect(countExternalCustomCommandFindings(result)).toBe(2);
    expect(formatExternalCustomCommandStatus(result, 'timeline-gap-audit')).toBe(
      'Plugin custom command Timeline Gap Audit completed (timeline-report/analyzer, 1 parameter, 2 findings).',
    );
  });
});
