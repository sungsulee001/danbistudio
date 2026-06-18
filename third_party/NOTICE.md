# Third Party Notices

## OpenCut Classic

Source: https://github.com/opencut-app/opencut-classic  
Commit: `cf5e79e919144200294fb9fed22a222592a0aeea`  
License: MIT  

Danbi adapted the action definition and action registry pattern from:

- `apps/web/src/actions/definitions.ts`
- `apps/web/src/actions/registry.ts`
- `apps/web/src/actions/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/command-registry.ts`
- `src/lib/editor/keyboard-map.ts`

Danbi also adapted the timeline snapping and placement patterns from:

- `apps/web/src/timeline/snapping/build.ts`
- `apps/web/src/timeline/snapping/resolve.ts`
- `apps/web/src/timeline/snapping/types.ts`
- `apps/web/src/timeline/placement/compatibility.ts`
- `apps/web/src/timeline/placement/overlap.ts`
- `apps/web/src/timeline/placement/resolve.ts`
- `apps/web/src/timeline/placement/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/timeline-snapping.ts`
- `src/lib/editor/timeline-placement.ts`
- `src/lib/editor/timeline.ts`
- `src/electron/renderer/media-drop-helpers.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`

Danbi also adapted the keyframe animation interpolation and value resolve patterns from:

- `apps/web/src/animation/interpolation.ts`
- `apps/web/src/animation/resolve.ts`
- `apps/web/src/animation/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/keyframe-interpolation.ts`
- `src/lib/editor/preview.ts`
- `src/lib/editor/timeline.ts`

Danbi also adapted the timeline group move planning patterns from:

- `apps/web/src/timeline/group-move/build-group.ts`
- `apps/web/src/timeline/group-move/resolve-move.ts`
- `apps/web/src/timeline/group-move/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/timeline-group-move.ts`
- `src/lib/editor/timeline.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`

Danbi also adapted the timeline group resize planning patterns from:

- `apps/web/src/timeline/group-resize/compute-resize.ts`
- `apps/web/src/timeline/group-resize/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/timeline-group-resize.ts`
- `src/lib/editor/timeline.ts`
- `tests/lib/editor-core.test.ts`

Danbi also adapted the waveform cache promise and source summary cache pattern from:

- `apps/web/src/services/waveform-cache/service.ts`

Imported/adapted Danbi files:

- `src/lib/editor/waveform-cache.ts`
- `src/lib/editor/media-cache.ts`
- `src/lib/editor/preview-source.ts`
- `src/electron/renderer/audio-analysis-workflow-helpers.ts`
- `src/electron/renderer/timeline-source-helpers.ts`
- `src/electron/renderer/selected-clip-capabilities.ts`
- `src/lib/editor/media-bin.ts`
- `src/lib/editor/media-health.ts`
- `tests/lib/editor-core.test.ts`

Danbi also adapted the video frame cache seek-generation and prefetch planning pattern from:

- `apps/web/src/services/video-cache/service.ts`

Imported/adapted Danbi files:

- `src/lib/editor/preview-frame-cache.ts`
- `src/lib/editor/preview-worker.ts`
- `tests/lib/editor-core.test.ts`

Danbi also adapted the timeline update transaction and command history patterns from:

- `apps/web/src/timeline/update-pipeline.ts`
- `apps/web/src/core/managers/commands.ts`

Imported/adapted Danbi files:

- `src/lib/editor/timeline-transaction.ts`
- `src/electron/renderer/project-history-controller.ts`
- `tests/lib/editor-core.test.ts`

Danbi also adapted the storage persistence, recovery ordering, and quota evaluation patterns from:

- `apps/web/src/services/storage/service.ts`
- `apps/web/src/services/storage/quota.ts`
- `apps/web/src/services/storage/types.ts`

Imported/adapted Danbi files:

- `src/lib/editor/project-recovery.ts`
- `src/electron/renderer/project-persistence-workflow-helpers.ts`
- `tests/lib/editor-core.test.ts`

MIT notice:

```text
Copyright 2025-2026 OpenCut

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
