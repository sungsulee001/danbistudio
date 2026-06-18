import type { RenderWorkerDaemonRunRecord, RenderWorkerDaemonStatus } from '../shared/render-worker-contract';
import {
  buildRenderWorkerCentralTrustGovernanceSummary,
  evaluateRenderWorkerCentralTrustPolicy,
  formatRenderWorkerCentralTrustGovernanceSummary,
  formatRenderWorkerFleetStatus,
  formatRenderWorkerDaemonStatus,
  formatRenderWorkerRunStatus,
  isRenderWorkerDaemonTrusted,
  normalizeRenderWorkerDaemonUrl,
  type RenderWorkerControllerSettings,
  type RenderWorkerTrustedDaemon,
} from './render-worker-controller-helpers';

export function RenderWorkerControllerPanel({
  settings,
  daemonStatus,
  lastRun,
  fleet = [],
  trustedWorkers = [],
  status,
  isSubmitting,
  isDiscovering = false,
  onSettingsChange,
  onDiscoverDaemon,
  onSelectDaemon,
  onTrustDaemon,
  onForgetTrustedDaemon,
  onCheckStatus,
  onSubmitHandoff,
}: {
  settings: RenderWorkerControllerSettings;
  daemonStatus: RenderWorkerDaemonStatus | null;
  lastRun: RenderWorkerDaemonRunRecord | null;
  fleet?: RenderWorkerDaemonStatus[];
  trustedWorkers?: RenderWorkerTrustedDaemon[];
  status: string;
  isSubmitting: boolean;
  isDiscovering?: boolean;
  onSettingsChange: (patch: Partial<RenderWorkerControllerSettings>) => void;
  onDiscoverDaemon?: () => void | Promise<void>;
  onSelectDaemon?: (daemonUrl: string) => void | Promise<void>;
  onTrustDaemon?: (daemonUrl: string) => void | Promise<void>;
  onForgetTrustedDaemon?: (daemonUrl: string) => void | Promise<void>;
  onCheckStatus: () => void | Promise<void>;
  onSubmitHandoff: () => void | Promise<void>;
}) {
  const progress = lastRun?.progress;
  const report = lastRun?.report;
  const totalJobs = progress?.totalJobs ?? report?.summary.totalJobs ?? 0;
  const finishedJobs = progress
    ? totalJobs - progress.pendingJobs - progress.runningJobs
    : report
      ? report.summary.plannedJobs + report.summary.completedJobs + report.summary.blockedJobs + report.summary.skippedJobs + report.summary.failedJobs
      : 0;
  const progressPercent = totalJobs > 0 ? Math.round((finishedJobs / totalJobs) * 100) : 0;
  const visibleJobs = (progress?.jobs ?? report?.jobs ?? []).slice(-4);
  const normalizedDaemonUrl = normalizeRenderWorkerDaemonUrl(settings.daemonUrl);
  const governanceStatuses = daemonStatus ? [daemonStatus, ...fleet] : fleet;
  const trustGovernance = buildRenderWorkerCentralTrustGovernanceSummary(governanceStatuses, trustedWorkers);
  const selectedTrustDecision = daemonStatus
    ? evaluateRenderWorkerCentralTrustPolicy(daemonStatus, trustedWorkers)
    : undefined;
  const canSubmitByTrustPolicy = selectedTrustDecision?.allowed !== false;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Render worker</span>
        <span className="text-[11px] text-zinc-500">{formatRenderWorkerDaemonStatus(daemonStatus)}</span>
      </div>
      <label className="block text-xs text-zinc-500">
        Daemon URL
        <input
          value={settings.daemonUrl}
          onChange={(event) => onSettingsChange({ daemonUrl: event.currentTarget.value })}
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-500"
          placeholder="http://127.0.0.1:47683"
        />
      </label>
      <label className="mt-2 block text-xs text-zinc-500">
        Pair token
        <input
          type="password"
          value={settings.authToken}
          onChange={(event) => onSettingsChange({ authToken: event.currentTarget.value })}
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          placeholder="optional"
          autoComplete="off"
        />
      </label>
      <label className="mt-2 block text-xs text-zinc-500">
        Remote workers
        <textarea
          value={settings.remoteDaemonUrls}
          onChange={(event) => onSettingsChange({ remoteDaemonUrls: event.currentTarget.value })}
          className="mt-1 min-h-14 w-full resize-y rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-500"
          placeholder="render-node.local:47683, 192.168.0.42:47683"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Worker cwd
          <input
            value={settings.workerCwd}
            onChange={(event) => onSettingsChange({ workerCwd: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="."
          />
        </label>
        <label className="text-xs text-zinc-500">
          Executable
          <input
            value={settings.workerExecutable}
            onChange={(event) => onSettingsChange({ workerExecutable: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="npm.cmd"
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-300">
        <label className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
          <span>Dry run</span>
          <input
            type="checkbox"
            checked={settings.dryRun}
            onChange={(event) => onSettingsChange({ dryRun: event.currentTarget.checked })}
            className="h-4 w-4 accent-emerald-500"
          />
        </label>
        <label className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
          <span>Blocked</span>
          <input
            type="checkbox"
            checked={settings.executeBlocked}
            onChange={(event) => onSettingsChange({ executeBlocked: event.currentTarget.checked })}
            className="h-4 w-4 accent-rose-500"
          />
        </label>
        <label className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
          <span>Auto route</span>
          <input
            type="checkbox"
            checked={settings.autoRoute}
            onChange={(event) => onSettingsChange({ autoRoute: event.currentTarget.checked })}
            className="h-4 w-4 accent-sky-500"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onDiscoverDaemon?.()}
          disabled={isDiscovering || !onDiscoverDaemon}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-fuchsia-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
        >
          {isDiscovering ? 'Discovering' : 'Discover'}
        </button>
        <button
          type="button"
          onClick={() => void onCheckStatus()}
          disabled={isDiscovering}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-sky-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
        >
          Check
        </button>
        <button
          type="button"
          onClick={() => void onSubmitHandoff()}
          disabled={isSubmitting || !canSubmitByTrustPolicy}
          className="rounded border border-sky-500/50 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600"
        >
          Submit
        </button>
      </div>
      <div className="mt-3 rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px] leading-5 text-zinc-400">
        <div>{status}</div>
        <div>{formatRenderWorkerRunStatus(lastRun)}</div>
        <div className={trustGovernance.blockedWorkers > 0 ? 'text-amber-200' : 'text-zinc-500'}>
          {formatRenderWorkerCentralTrustGovernanceSummary(trustGovernance)}
        </div>
        {selectedTrustDecision ? (
          <div className={selectedTrustDecision.allowed ? 'text-zinc-500' : 'text-rose-300'}>
            Active worker: {selectedTrustDecision.reason}
            {selectedTrustDecision.warnings[0] ? ` ${selectedTrustDecision.warnings[0]}` : ''}
          </div>
        ) : null}
        {fleet.length > 0 ? (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Fleet</span>
              <span>{formatRenderWorkerFleetStatus(fleet)}</span>
            </div>
            <div className="space-y-1">
              {fleet.map((worker) => {
                const selected = normalizeRenderWorkerDaemonUrl(worker.url) === normalizedDaemonUrl;
                const trusted = isRenderWorkerDaemonTrusted(trustedWorkers, worker);
                const trustDecision = evaluateRenderWorkerCentralTrustPolicy(worker, trustedWorkers);
                return (
                  <div key={worker.url} className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-1 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <div className={`truncate ${selected ? 'text-emerald-200' : 'text-zinc-300'}`}>
                        {worker.workerId}{trusted ? ' · trusted' : ''}{trustDecision.allowed ? '' : ' · blocked'}
                      </div>
                      <div className="truncate text-[10px] text-zinc-600">{worker.url}</div>
                      <div className={`truncate text-[10px] ${trustDecision.allowed ? 'text-zinc-600' : 'text-rose-300'}`}>{trustDecision.reason}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-zinc-500">R{worker.runningRuns ?? 0} Q{worker.queuedRuns ?? 0} / {worker.maxConcurrentRuns ?? 1}</span>
                      <button
                        type="button"
                        onClick={() => void (trusted ? onForgetTrustedDaemon?.(worker.url) : onTrustDaemon?.(worker.url))}
                        disabled={(!onTrustDaemon && !trusted) || (!onForgetTrustedDaemon && trusted)}
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-amber-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        {trusted ? 'Forget' : 'Trust'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onSelectDaemon?.(worker.url)}
                        disabled={selected || !onSelectDaemon || !trustDecision.allowed}
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        {!trustDecision.allowed ? 'Blocked' : selected ? 'Active' : 'Select'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {trustedWorkers.length > 0 ? (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Trusted</span>
              <span>{trustedWorkers.length} saved</span>
            </div>
            <div className="space-y-1">
              {trustedWorkers.map((worker) => {
                const selected = normalizeRenderWorkerDaemonUrl(worker.url) === normalizedDaemonUrl;
                return (
                  <div key={`${worker.workerId}-${worker.url}`} className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-1 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <div className={`truncate ${selected ? 'text-emerald-200' : 'text-zinc-300'}`}>{worker.workerId}</div>
                      <div className="truncate text-[10px] text-zinc-600">{worker.url}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-zinc-600">{worker.authRequired ? 'token' : 'open'}</span>
                      <button
                        type="button"
                        onClick={() => void onSelectDaemon?.(worker.url)}
                        disabled={selected || !onSelectDaemon}
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        {selected ? 'Active' : 'Select'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onForgetTrustedDaemon?.(worker.url)}
                        disabled={!onForgetTrustedDaemon}
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-rose-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        Forget
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {totalJobs > 0 ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${Math.max(0, Math.min(progressPercent, 100))}%` }}
              />
            </div>
          </div>
        ) : null}
        {visibleJobs.length > 0 ? (
          <div className="mt-2 space-y-1">
            {visibleJobs.map((job) => (
              <div key={`${job.jobId}-${job.status}`} className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-1">
                <span className="min-w-0 truncate">{job.profileLabel}</span>
                <span className={job.status === 'failed' ? 'text-rose-300' : job.status === 'running' ? 'text-sky-300' : 'text-zinc-500'}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {lastRun?.lease ? (
          <div className="mt-2 border-t border-zinc-800 pt-1 text-[10px] text-zinc-500">
            Lease {lastRun.lease.workerId} until {lastRun.lease.expiresAt}
          </div>
        ) : null}
      </div>
    </div>
  );
}
