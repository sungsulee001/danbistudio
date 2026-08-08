'use client';

import { useEffect, useMemo, useState } from 'react';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';
import { buildExtensionHostSnapshot } from '@/electron/shared/extension-api';
import { readBestLocalProjectFallback } from '@/electron/renderer/project-persistence-client';
import {
  AppLink,
  DanbiAppShell,
  DataList,
  StatusPill,
  WorkspacePanel,
  type ShellStatusItem,
} from '../danbi-app-shell';

export default function ExtensionsPage() {
  const [project, setProject] = useState<EditorProject>(() => createDefaultEditorProject());
  const [status, setStatus] = useState('Loaded built-in project extension snapshot');

  useEffect(() => {
    try {
      const fallback = readBestLocalProjectFallback();
      if (fallback?.project) {
        setProject(fallback.project);
        setStatus(`Loaded local project extension snapshot: ${fallback.project.name}`);
      }
    } catch (error) {
      setProject(createDefaultEditorProject());
      setStatus(`Using default extension snapshot: ${formatError(error)}`);
    }
  }, []);

  const extensionHost = useMemo(() => buildExtensionHostSnapshot(project), [project]);
  const summary = useMemo(() => ({
    pluginCount: extensionHost.manifests.length,
    blockedCount: extensionHost.blockedPlugins.length,
    warningCount: extensionHost.warnings.length,
    commandCount: extensionHost.commands.length,
    renderHookCount: extensionHost.renderHooks.length,
    signingIssueCount: extensionHost.sandboxes.filter((sandbox) => (
      sandbox.signature.status !== 'verified' && sandbox.signature.status !== 'not-required'
    )).length,
  }), [extensionHost]);
  const statusItems = useMemo<ShellStatusItem[]>(() => [
    { label: 'Plugins', value: String(summary.pluginCount), tone: summary.pluginCount > 0 ? 'good' : 'neutral' },
    { label: 'Blocked', value: String(summary.blockedCount), tone: summary.blockedCount > 0 ? 'warn' : 'neutral' },
    { label: 'Signing', value: String(summary.signingIssueCount), tone: summary.signingIssueCount > 0 ? 'warn' : 'good' },
    { label: 'Render hooks', value: String(summary.renderHookCount), tone: summary.renderHookCount > 0 ? 'good' : 'neutral' },
    { label: 'External QA', value: 'EXTERNAL_PENDING', tone: 'pending' },
  ], [summary]);

  return (
    <DanbiAppShell
      activeView="extensions"
      title="Extensions"
      subtitle={status}
      actions={<AppLink href="/editor">Open Editor</AppLink>}
      statusItems={statusItems}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <WorkspacePanel eyebrow="Plugins" title="Installed Plugin Manifests">
          <div className="space-y-3">
            {extensionHost.manifests.length === 0 ? (
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
                No plugin manifests are enabled for this project.
              </div>
            ) : extensionHost.manifests.map((plugin) => {
              const sandbox = extensionHost.sandboxes.find((candidate) => candidate.pluginId === plugin.id);
              const commandCount = extensionHost.commands.filter((command) => command.sourcePluginId === plugin.id).length;
              const renderHookCount = extensionHost.renderHooks.filter((hook) => hook.sourcePluginId === plugin.id).length;
              const blocked = extensionHost.blockedPlugins.find((entry) => entry.pluginId === plugin.id);

              return (
                <article key={plugin.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">{plugin.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{plugin.id} / {plugin.version}</div>
                    </div>
                    <StatusPill label="" value={sandbox?.status ?? 'unknown'} tone={toneForSandbox(sandbox?.status)} />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <ManifestMetric label="Permissions" value={plugin.permissions.join(', ') || 'None'} />
                    <ManifestMetric label="Contributes" value={plugin.contributes.join(', ') || 'None'} />
                    <ManifestMetric label="Commands" value={String(commandCount)} />
                    <ManifestMetric label="Render hooks" value={String(renderHookCount)} />
                    <ManifestMetric label="Entry" value={plugin.entry} />
                    <ManifestMetric label="Signature" value={`${sandbox?.signature.status ?? 'unknown'} / ${sandbox?.signature.trustLevel ?? 'unknown'}`} />
                  </div>
                  {sandbox?.exporterWriters?.length ? (
                    <div className="mt-3 space-y-2">
                      {sandbox.exporterWriters.map((writer) => (
                        <div key={writer.writerId} className="rounded border border-neutral-800 bg-neutral-950 px-2 py-2 text-xs text-neutral-400">
                          {writer.label} / {writer.status} / {writer.packageStatus}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {blocked ? <div className="mt-3 text-xs text-amber-200">{blocked.reason}</div> : null}
                </article>
              );
            })}
          </div>
        </WorkspacePanel>

        <div className="space-y-4">
          <WorkspacePanel eyebrow="Trust" title="Sandbox and Signing">
            <DataList
              items={[
                { label: 'Project', value: project.name, tone: 'neutral' },
                { label: 'Installed plugins', value: String(summary.pluginCount), tone: summary.pluginCount > 0 ? 'good' : 'neutral' },
                { label: 'Blocked plugins', value: String(summary.blockedCount), tone: summary.blockedCount > 0 ? 'warn' : 'neutral' },
                { label: 'Warnings', value: String(summary.warningCount), tone: summary.warningCount > 0 ? 'warn' : 'good' },
                { label: 'Commands', value: String(summary.commandCount), tone: summary.commandCount > 0 ? 'good' : 'neutral' },
                { label: 'Render hooks', value: String(summary.renderHookCount), tone: summary.renderHookCount > 0 ? 'good' : 'neutral' },
              ]}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Package Install" title="Install Boundary">
            <div className="space-y-3 text-sm text-neutral-400">
              <p>
                Plugin package install remains attached to the current project context and Electron package installer.
              </p>
              <AppLink href="/editor" variant="secondary">Open plugin installer</AppLink>
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Warnings" title="Extension Runtime Warnings">
            <div className="space-y-2">
              {extensionHost.warnings.length === 0 ? (
                <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
                  No extension warnings.
                </div>
              ) : extensionHost.warnings.map((warning) => (
                <div key={warning} className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                  {warning}
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </DanbiAppShell>
  );
}

function ManifestMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-neutral-800 bg-neutral-950 px-2 py-2">
      <div className="text-[11px] uppercase text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-xs text-neutral-300" title={value}>{value}</div>
    </div>
  );
}

function toneForSandbox(status: string | undefined): ShellStatusItem['tone'] {
  if (status === 'trusted-builtin') {
    return 'good';
  }
  if (status === 'blocked') {
    return 'warn';
  }
  if (status === 'manifest-only') {
    return 'pending';
  }
  return 'neutral';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
