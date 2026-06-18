import type { ComponentProps } from 'react';
import { ComfyUIResultReviewPanel } from './comfyui-result-review-panel';
import { CaptionSidecarExportPanel, InterchangeExportPanel, MasterAudioExportPanel } from './export-delivery-settings-panel';
import { ComfyUIBatchStatusPanel, PreviewRenderParityPanel, SttJobStatusPanel, SttReviewStatusPanel } from './export-job-status-panels';
import { ExportPreflightPanel } from './export-preflight-panel';
import { ExportSettingsPanel } from './export-settings-panel';
import { JobHistoryPanel } from './job-history-panel';
import { RenderWorkerControllerPanel } from './render-worker-controller-panel';
import { RenderStatusPanel } from './render-status-panel';

export function ExportWorkspacePanel({
  renderInputCount,
  exportSettings,
  exportPreflight,
  masterAudio,
  captionSidecar,
  interchange,
  previewRenderParity,
  comfyUIBatch,
  comfyUIReview,
  sttJob,
  sttReview,
  jobHistory,
  renderWorker,
  renderStatus,
}: {
  renderInputCount: number;
  exportSettings: ComponentProps<typeof ExportSettingsPanel>;
  exportPreflight: ComponentProps<typeof ExportPreflightPanel>;
  masterAudio: ComponentProps<typeof MasterAudioExportPanel>;
  captionSidecar: ComponentProps<typeof CaptionSidecarExportPanel>;
  interchange: ComponentProps<typeof InterchangeExportPanel>;
  previewRenderParity: ComponentProps<typeof PreviewRenderParityPanel>;
  comfyUIBatch: ComponentProps<typeof ComfyUIBatchStatusPanel>;
  comfyUIReview?: ComponentProps<typeof ComfyUIResultReviewPanel> | null;
  sttJob: ComponentProps<typeof SttJobStatusPanel>;
  sttReview: ComponentProps<typeof SttReviewStatusPanel>;
  jobHistory: ComponentProps<typeof JobHistoryPanel>;
  renderWorker: ComponentProps<typeof RenderWorkerControllerPanel>;
  renderStatus: ComponentProps<typeof RenderStatusPanel>;
}) {
  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Export Plan</h2>
        <span className="text-xs text-sky-300">{renderInputCount} inputs</span>
      </div>
      <div className="mt-3 space-y-2">
        <ExportSettingsPanel {...exportSettings} />
        <ExportPreflightPanel {...exportPreflight} />
        <MasterAudioExportPanel {...masterAudio} />
        <CaptionSidecarExportPanel {...captionSidecar} />
        <InterchangeExportPanel {...interchange} />
        <PreviewRenderParityPanel {...previewRenderParity} />
        <ComfyUIBatchStatusPanel {...comfyUIBatch} />
        {comfyUIReview ? <ComfyUIResultReviewPanel {...comfyUIReview} /> : null}
        <SttJobStatusPanel {...sttJob} />
        <SttReviewStatusPanel {...sttReview} />
        <JobHistoryPanel {...jobHistory} />
        <RenderWorkerControllerPanel {...renderWorker} />
        <RenderStatusPanel {...renderStatus} />
      </div>
    </div>
  );
}
