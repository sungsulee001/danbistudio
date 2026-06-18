import { describe, expect, it } from 'vitest';

import { buildCaptionSidecar, parseCaptionSidecar } from '../../src/lib/editor/caption-sidecar';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('caption sidecar import/export', () => {
  it('does not treat additional WebVTT STYLE cue rules as caption warnings', () => {
    const sidecar = buildCaptionSidecar({
      ...createDefaultEditorProject(),
      captions: [
        {
          id: 'caption-a',
          start: 1,
          end: 2,
          text: 'First caption',
          style: { fontColor: '#ffee99' },
        },
        {
          id: 'caption-b',
          start: 3,
          end: 4,
          text: 'Second caption',
          style: { fontColor: '#ccffee' },
        },
      ],
    }, 'vtt', {
      includeStyleMetadata: true,
    });

    const parsed = parseCaptionSidecar(sidecar.content, 'vtt');

    expect(parsed.warnings).toEqual([]);
    expect(parsed.captions.map((caption) => caption.text)).toEqual([
      'First caption',
      'Second caption',
    ]);
    expect(parsed.captions[0].style?.fontColor).toBe('#ffee99');
    expect(parsed.captions[1].style?.fontColor).toBe('#ccffee');
  });

  it('imports WebVTT voice tags as caption speakers', () => {
    const parsed = parseCaptionSidecar(`WEBVTT

intro-cue
00:00:01.000 --> 00:00:02.000
<v Host>Welcome &amp; hello</v>

00:00:03.000 --> 00:00:04.000
<c.emphasis><v Guest>Reply</v></c>
`, 'vtt');

    expect(parsed.warnings).toEqual([]);
    expect(parsed.captions.map((caption) => ({
      text: caption.text,
      speaker: caption.speaker,
    }))).toEqual([
      { text: 'Welcome & hello', speaker: 'Host' },
      { text: 'Reply', speaker: 'Guest' },
    ]);
  });

  it('round-trips word-timed WebVTT captions into imported word timings', () => {
    const sidecar = buildCaptionSidecar({
      ...createDefaultEditorProject(),
      captions: [
        {
          id: 'caption-word-timed',
          start: 1.25,
          end: 3.5,
          text: 'First line',
          speaker: 'Host',
          words: [
            { start: 1.25, end: 2, text: 'First' },
            { start: 2, end: 3.5, text: 'line' },
          ],
        },
      ],
    }, 'vtt', {
      includeSpeaker: true,
      includeWordTiming: true,
    });

    const parsed = parseCaptionSidecar(sidecar.content, 'vtt');

    expect(parsed.warnings).toEqual([]);
    expect(parsed.captions[0]).toMatchObject({
      text: 'First line',
      speaker: 'Host',
      words: [
        { start: 1.25, end: 2, text: 'First' },
        { start: 2, end: 3.5, text: 'line' },
      ],
    });
  });
});
