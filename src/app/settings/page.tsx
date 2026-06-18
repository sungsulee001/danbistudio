'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { openNativeRuntimePath, readElectronRuntimeDiagnostics, revealNativeRuntimePath } from '@/electron/renderer/editor-system-client';
import type { DanbiRuntimeDiagnosticsSnapshot } from '@/electron/shared/runtime-diagnostics';
import { browserApiFetch } from '@/lib/browser-api-fetch';
import {
  COMFYUI_URL_STORAGE_KEY,
  DEFAULT_COMFYUI_URL,
  DEFAULT_GENERATE_OUTPUT_FORMAT,
  DEFAULT_GENERATE_SEED,
  DEFAULT_GENERATE_STEPS,
  GENERATE_DEFAULT_SEED_STORAGE_KEY,
  GENERATE_DEFAULT_STEPS_STORAGE_KEY,
  GENERATE_OUTPUT_FORMAT_STORAGE_KEY,
  normalizeGenerateOutputFormat,
  normalizeGenerateSeedSetting,
  normalizeGenerateStepsSetting,
} from '@/lib/generate-settings';

const HEALTH_CHECK_TIMEOUT_MS = 8000;
const STORAGE_CLEANUP_SCAN_TIMEOUT_MS = 15000;
const STORAGE_CLEANUP_RUN_TIMEOUT_MS = 60000;

interface StorageCleanupTargetResult {
  id: 'cache' | 'outputs' | 'stt';
  label: string;
  scannedFiles: number;
  eligibleFiles: number;
  deletedFiles: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  errors: string[];
}

interface StorageCleanupResult {
  dryRun: boolean;
  maxAgeDays: number;
  eligibleFiles: number;
  deletedFiles: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  targets: StorageCleanupTargetResult[];
}

export default function SettingsPage() {
  const [comfyuiUrl, setComfyuiUrl] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_COMFYUI_URL;
    }

    return window.localStorage.getItem(COMFYUI_URL_STORAGE_KEY) || DEFAULT_COMFYUI_URL;
  });
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline'>('offline');
  const [connectionMessage, setConnectionMessage] = useState('Connection not tested');
  const [testing, setTesting] = useState(false);
  const [defaultSteps, setDefaultSteps] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_STEPS;
    }

    return normalizeGenerateStepsSetting(window.localStorage.getItem(GENERATE_DEFAULT_STEPS_STORAGE_KEY));
  });
  const [defaultSeed, setDefaultSeed] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_SEED;
    }

    return normalizeGenerateSeedSetting(window.localStorage.getItem(GENERATE_DEFAULT_SEED_STORAGE_KEY));
  });
  const [outputFormat, setOutputFormat] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_OUTPUT_FORMAT;
    }

    return normalizeGenerateOutputFormat(window.localStorage.getItem(GENERATE_OUTPUT_FORMAT_STORAGE_KEY));
  });
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupScanning, setCleanupScanning] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState('Storage scan pending');
  const [cleanupPreview, setCleanupPreview] = useState<StorageCleanupResult | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DanbiRuntimeDiagnosticsSnapshot | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState('Runtime diagnostics pending');

  const testConnection = useCallback(async (signal?: AbortSignal) => {
    setTesting(true);
    try {
      const response = await browserApiFetch(`/api/health?comfyuiUrl=${encodeURIComponent(comfyuiUrl.trim())}`, {
        signal,
        timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
      });
      const data = await response.json().catch(() => ({}));
      if (signal?.aborted) {
        return;
      }

      const connected = Boolean(data.services?.comfyui);
      setConnectionStatus(connected ? 'connected' : 'offline');
      setConnectionMessage(connected
        ? `Connected to ${data.config?.comfyuiUrl ?? comfyuiUrl.trim()}`
        : data.error || (response.ok ? 'ComfyUI did not respond' : response.statusText));
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setConnectionStatus('offline');
      setConnectionMessage(`Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setTesting(false);
      }
    }
  }, [comfyuiUrl]);

  const readCleanupDays = useCallback(() => {
    const parsed = Number(cleanupDays);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.round(parsed))) : 30;
  }, [cleanupDays]);

  const refreshStorageCleanupPreview = useCallback(async (signal?: AbortSignal) => {
    setCleanupScanning(true);
    try {
      const response = await browserApiFetch(`/api/storage/cleanup?maxAgeDays=${readCleanupDays()}`, {
        signal,
        timeoutMs: STORAGE_CLEANUP_SCAN_TIMEOUT_MS,
      });
      const data = await response.json();
      if (signal?.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setCleanupPreview(data);
      setCleanupStatus(`${data.eligibleFiles} old files / ${formatBytes(data.eligibleBytes)} eligible`);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setCleanupStatus(`Storage scan failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setCleanupScanning(false);
      }
    }
  }, [readCleanupDays]);

  const refreshRuntimeDiagnostics = useCallback(async (signal?: AbortSignal) => {
    setRuntimeLoading(true);
    try {
      const diagnostics = await readElectronRuntimeDiagnostics();
      if (signal?.aborted) {
        return;
      }

      setRuntimeDiagnostics(diagnostics);
      setRuntimeStatus(diagnostics
        ? `${diagnostics.app.name} ${diagnostics.app.version} / ${diagnostics.ffmpeg.ready ? 'FFmpeg ready' : 'FFmpeg needs review'}`
        : 'Electron runtime diagnostics are not available in this browser session.');
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setRuntimeDiagnostics(null);
      setRuntimeStatus(`Runtime diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setRuntimeLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COMFYUI_URL_STORAGE_KEY, comfyuiUrl);
  }, [comfyuiUrl]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_DEFAULT_STEPS_STORAGE_KEY, defaultSteps);
  }, [defaultSteps]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_DEFAULT_SEED_STORAGE_KEY, defaultSeed);
  }, [defaultSeed]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_OUTPUT_FORMAT_STORAGE_KEY, outputFormat);
  }, [outputFormat]);

  useEffect(() => {
    const controller = new AbortController();

    testConnection(controller.signal);
    refreshStorageCleanupPreview(controller.signal);
    refreshRuntimeDiagnostics(controller.signal);

    return () => {
      controller.abort();
    };
  }, [refreshRuntimeDiagnostics, refreshStorageCleanupPreview, testConnection]);

  const handleClearOldFiles = async () => {
    const days = readCleanupDays();
    const eligibleFiles = cleanupPreview?.eligibleFiles ?? 0;
    const eligibleBytes = cleanupPreview?.eligibleBytes ?? 0;
    const confirmation = eligibleFiles > 0
      ? `Delete ${eligibleFiles} cache/output/STT files older than ${days} days (${formatBytes(eligibleBytes)})? This cannot be undone.`
      : `Scan and delete cache/output/STT files older than ${days} days? This cannot be undone.`;

    if (!confirm(confirmation)) {
      return;
    }

    setCleanupRunning(true);
    try {
      const response = await browserApiFetch('/api/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: STORAGE_CLEANUP_RUN_TIMEOUT_MS,
        body: JSON.stringify({
          dryRun: false,
          maxAgeDays: days,
          targets: ['cache', 'outputs', 'stt'],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setCleanupPreview(data);
      setCleanupStatus(`Deleted ${data.deletedFiles} files / ${formatBytes(data.deletedBytes)}; removed ${data.directoriesRemoved} empty folders`);
    } catch (error) {
      setCleanupStatus(`File cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCleanupRunning(false);
    }
  };

  const handleOpenRuntimePath = async (label: string, path: string) => {
    const result = await openNativeRuntimePath(path);
    setRuntimeStatus(result.ok
      ? `Opened ${label}`
      : result.error ?? `Could not open ${label}`);
  };

  const handleRevealRuntimePath = async (label: string, path: string) => {
    const result = await revealNativeRuntimePath(path);
    setRuntimeStatus(result.ok
      ? `Revealed ${label} folder`
      : result.error ?? `Could not reveal ${label}`);
  };

  const handleCopyRuntimePath = async (label: string, path: string) => {
    try {
      await navigator.clipboard?.writeText(path);
      setRuntimeStatus(`Copied ${label} path`);
    } catch (error) {
      setRuntimeStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground">
            Settings
          </h1>
        </div>

        <div className="space-y-6">
          {/* ComfyUI Connection */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              ComfyUI Connection
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  URL
                </label>
                <input
                  type="text"
                  value={comfyuiUrl}
                  onChange={(e) => setComfyuiUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="http://localhost:8188"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground/80">Status:</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  <span className={connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}>
                    {connectionStatus === 'connected' ? 'Connected' : 'Offline'}
                  </span>
                </span>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground/75">
                {connectionMessage}
              </div>

              <button
                onClick={() => {
                  void testConnection();
                }}
                disabled={testing}
                className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-all font-medium shadow-lg shadow-primary/20 disabled:bg-foreground/20 disabled:shadow-none"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>

          {/* Default Parameters */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Default Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Steps
                </label>
                <input
                  type="number"
                  value={defaultSteps}
                  onChange={(e) => setDefaultSteps(e.target.value)}
                  onBlur={() => setDefaultSteps((value) => normalizeGenerateStepsSetting(value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  min="1"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Seed
                </label>
                <input
                  type="text"
                  value={defaultSeed}
                  onChange={(e) => setDefaultSeed(e.target.value)}
                  onBlur={() => setDefaultSeed((value) => normalizeGenerateSeedSetting(value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground placeholder-foreground/40 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Random"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Output Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(normalizeGenerateOutputFormat(e.target.value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="MP4">MP4</option>
                  <option value="PNG">PNG</option>
                  <option value="JPG">JPG</option>
                </select>
              </div>
            </div>
          </div>

          {/* Runtime Diagnostics */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Runtime Diagnostics
              </h2>
              <button
                onClick={() => {
                  void refreshRuntimeDiagnostics();
                }}
                disabled={runtimeLoading}
                className="px-4 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runtimeLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground/75">
              {runtimeStatus}
            </div>

            {runtimeDiagnostics ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <RuntimeSummary label="App" value={`${runtimeDiagnostics.app.name} ${runtimeDiagnostics.app.version}`} />
                  <RuntimeSummary label="Runtime" value={`${runtimeDiagnostics.app.platform} ${runtimeDiagnostics.app.arch}`} />
                  <RuntimeSummary label="FFmpeg" value={runtimeDiagnostics.ffmpeg.ready ? 'Ready' : 'Needs review'} tone={runtimeDiagnostics.ffmpeg.ready ? 'good' : 'warn'} />
                </div>

                <div className="grid gap-2">
                  {buildRuntimePathRows(runtimeDiagnostics).map((row) => (
                    <div
                      key={row.id}
                      data-testid={`runtime-path-${row.id}`}
                      className="grid gap-2 rounded-md border border-border bg-background/40 p-3 md:grid-cols-[8rem_minmax(0,1fr)_auto]"
                    >
                      <div className="text-sm font-medium text-foreground">{row.label}</div>
                      <div className="break-all text-xs text-foreground/70">{row.path}</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleCopyRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => void handleOpenRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => void handleRevealRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Reveal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {runtimeDiagnostics.warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    {runtimeDiagnostics.warnings.slice(0, 3).map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Storage */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Storage
            </h2>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-foreground/80">
                Age threshold
                <input
                  type="number"
                  value={cleanupDays}
                  min="1"
                  max="3650"
                  onChange={(e) => setCleanupDays(e.target.value)}
                  onBlur={() => {
                    void refreshStorageCleanupPreview();
                  }}
                  className="mt-2 w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void refreshStorageCleanupPreview();
                  }}
                  disabled={cleanupScanning || cleanupRunning}
                  className="px-6 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cleanupScanning ? 'Scanning...' : 'Scan Old Files'}
                </button>
                <button
                  onClick={handleClearOldFiles}
                  disabled={cleanupRunning || cleanupScanning}
                  className="px-6 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cleanupRunning ? 'Clearing...' : 'Clear Old Files'}
                </button>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-foreground/80">
                <div className="font-medium text-foreground">{cleanupStatus}</div>
                {cleanupPreview ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {cleanupPreview.targets.map((target) => (
                      <div key={target.id} className="rounded-md border border-border bg-background/40 p-3">
                        <div className="font-medium text-foreground">{target.label}</div>
                        <div className="mt-1 text-xs text-foreground/70">
                          {target.eligibleFiles} old / {target.scannedFiles} scanned / {formatBytes(target.eligibleBytes)}
                        </div>
                        {target.deletedFiles > 0 ? (
                          <div className="mt-1 text-xs text-green-400">
                            Deleted {target.deletedFiles} / {formatBytes(target.deletedBytes)}
                          </div>
                        ) : null}
                        {target.errors.length > 0 ? (
                          <div className="mt-1 text-xs text-red-400">
                            {target.errors.length} cleanup warning{target.errors.length === 1 ? '' : 's'}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

interface RuntimePathRow {
  id: string;
  label: string;
  path: string;
}

function buildRuntimePathRows(diagnostics: DanbiRuntimeDiagnosticsSnapshot): RuntimePathRow[] {
  return [
    { id: 'user-data', label: 'User Data', path: diagnostics.paths.userDataPath },
    { id: 'logs', label: 'Logs', path: diagnostics.paths.logsPath },
    { id: 'crash-dumps', label: 'Crash Dumps', path: diagnostics.paths.crashDumpsPath },
    { id: 'projects', label: 'Projects', path: diagnostics.paths.projectsPath },
    { id: 'packages', label: 'Packages', path: diagnostics.paths.packagesPath },
    { id: 'renders', label: 'Renders', path: diagnostics.paths.rendersPath },
    { id: 'temp', label: 'Temp', path: diagnostics.paths.tempPath },
  ];
}

function RuntimeSummary({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const toneClass = tone === 'good'
    ? 'text-green-300'
    : tone === 'warn'
      ? 'text-amber-300'
      : 'text-foreground';

  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
      <div className={`mt-1 text-sm font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
