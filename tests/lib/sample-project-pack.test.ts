import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runSampleMediaCommand } from '../../src/electron/main/sample-project-pack';

describe('sample project pack media generation', () => {
  it('bounds stalled sample media commands', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-sample-media-timeout-'));
    const stalledCommand = join(tempRoot, 'stalled-sample-media-command.js');

    try {
      await writeFile(stalledCommand, 'setInterval(() => undefined, 1000);\n', 'utf8');

      await expect(runSampleMediaCommand(process.execPath, [stalledCommand], 100))
        .rejects.toThrow('timed out after 100ms');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
