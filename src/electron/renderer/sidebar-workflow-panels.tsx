import { EDITOR_KEYBOARD_SHORTCUTS } from '../../lib/editor/keyboard-map';
import type { EditorPluginExporterWriterTrust, EditorProject } from '../../lib/editor/types';
import { buildExtensionHostSnapshot } from '../shared/extension-api';
import type { EditorHookEvent, EditorHookPlanView, EditorQueueSettingsView } from './editor-view-model';
import { NumberField } from './editor-form-controls';
import {
  buildExternalCustomCommandDefaultParameters,
  findMissingExternalCustomCommandDefaultParameters,
  type ExternalPluginCustomCommandParameters,
} from './plugin-custom-command-helpers';

export type ExternalEffectPresetId = 'warm-contrast' | 'soft-vignette';
export type ExternalTransitionPresetId = 'smooth-crossfade' | 'push-left';
export type ExternalPluginPlanParameters = Record<string, string | number | boolean>;

type HookRunContext = {
  selectedClipIds?: string[];
};

type HookRunOptions = {
  queueComfyUI?: boolean;
  executeComfyUI?: boolean;
  applyLocalActions?: boolean;
  executeWebhooks?: boolean;
};

export function ShortcutsPanel() {
  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shortcuts</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-zinc-400">
        {EDITOR_KEYBOARD_SHORTCUTS.map((shortcut) => (
          <ShortcutHint key={shortcut.id} keys={shortcut.keys} label={shortcut.label} />
        ))}
      </div>
    </div>
  );
}

export function QueueSettingsPanel({
  queueSettings,
  onPatchQueueSettings,
  onApplyQueueSettings,
}: {
  queueSettings: EditorQueueSettingsView;
  onPatchQueueSettings: (patch: Partial<EditorQueueSettingsView>) => void;
  onApplyQueueSettings: () => void;
}) {
  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Queue Settings</h2>
        <button
          type="button"
          className="text-xs text-emerald-300 hover:text-emerald-200"
          onClick={onApplyQueueSettings}
        >
          Apply
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumberField
          label="Render workers"
          value={queueSettings.renderConcurrency}
          step={1}
          min={1}
          max={4}
          onChange={(value) => onPatchQueueSettings({ renderConcurrency: value })}
        />
        <NumberField
          label="Cache workers"
          value={queueSettings.mediaCacheConcurrency}
          step={1}
          min={1}
          max={6}
          onChange={(value) => onPatchQueueSettings({ mediaCacheConcurrency: value })}
        />
        <NumberField
          label="Comfy workers"
          value={queueSettings.comfyuiConcurrency}
          step={1}
          min={1}
          max={4}
          onChange={(value) => onPatchQueueSettings({ comfyuiConcurrency: value })}
        />
        <NumberField
          label="STT workers"
          value={queueSettings.sttConcurrency}
          step={1}
          min={1}
          max={4}
          onChange={(value) => onPatchQueueSettings({ sttConcurrency: value })}
        />
        <NumberField
          label="Render priority"
          value={queueSettings.defaultRenderPriority}
          step={1}
          min={-100}
          max={100}
          onChange={(value) => onPatchQueueSettings({ defaultRenderPriority: value })}
        />
        <NumberField
          label="Cache priority"
          value={queueSettings.defaultMediaCachePriority}
          step={1}
          min={-100}
          max={100}
          onChange={(value) => onPatchQueueSettings({ defaultMediaCachePriority: value })}
        />
        <NumberField
          label="Comfy priority"
          value={queueSettings.defaultComfyUIPriority}
          step={1}
          min={-100}
          max={100}
          onChange={(value) => onPatchQueueSettings({ defaultComfyUIPriority: value })}
        />
        <NumberField
          label="STT priority"
          value={queueSettings.defaultSttPriority}
          step={1}
          min={-100}
          max={100}
          onChange={(value) => onPatchQueueSettings({ defaultSttPriority: value })}
        />
      </div>
    </div>
  );
}

export function AutomationHooksPanel({
  automationRuleCount,
  lastHookPlan,
  selectedClipIds,
  isQueueingComfyUI,
  onRunHooks,
}: {
  automationRuleCount: number;
  lastHookPlan: EditorHookPlanView | null;
  selectedClipIds: string[];
  isQueueingComfyUI: boolean;
  onRunHooks: (event: EditorHookEvent, context?: HookRunContext, options?: HookRunOptions) => void;
}) {
  const localActionCount = countHookPlanLocalActions(lastHookPlan);
  const comfyJobCount = countHookPlanComfyJobs(lastHookPlan);
  const webhookCount = countHookPlanWebhooks(lastHookPlan);

  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Automation Hooks</h2>
        <span className="text-xs text-sky-300">{automationRuleCount} rules</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => onRunHooks('manual')}
        >
          Manual
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-sky-500"
          onClick={() => onRunHooks('on-gap', { selectedClipIds: [] })}
        >
          On gap
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-amber-500"
          onClick={() => onRunHooks('before-export', { selectedClipIds: [] })}
        >
          Export
        </button>
      </div>
      {lastHookPlan ? (
        <div className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-100">
          <div className="flex items-center justify-between gap-2">
            <span>{lastHookPlan.event} / {lastHookPlan.actionCount} prepared</span>
            <span className="text-sky-200/70">{lastHookPlan.matchedRuleCount} matched</span>
          </div>
          {localActionCount > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="w-full rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-[11px] font-semibold text-sky-100 hover:border-sky-300"
                onClick={() => onRunHooks(
                  lastHookPlan.event,
                  { selectedClipIds: lastHookPlan.event === 'manual' ? selectedClipIds : [] },
                  { applyLocalActions: true },
                )}
              >
                Apply Local {localActionCount}
              </button>
            </div>
          ) : null}
          {lastHookPlan.appliedLocalActions ? (
            <div className="mt-2 rounded border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-100">
              Applied {lastHookPlan.appliedLocalActions.appliedActionIds.length} local actions
              {lastHookPlan.appliedLocalActions.appliedClipIds.length > 0 ? ` / clips ${lastHookPlan.appliedLocalActions.appliedClipIds.length}` : ''}
            </div>
          ) : null}
          {comfyJobCount > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isQueueingComfyUI}
                className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100 hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onRunHooks(
                  lastHookPlan.event,
                  { selectedClipIds: lastHookPlan.event === 'manual' ? selectedClipIds : [] },
                  { queueComfyUI: true },
                )}
              >
                Queue {comfyJobCount}
              </button>
              <button
                type="button"
                disabled={isQueueingComfyUI}
                className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onRunHooks(
                  lastHookPlan.event,
                  { selectedClipIds: lastHookPlan.event === 'manual' ? selectedClipIds : [] },
                  { queueComfyUI: true, executeComfyUI: true },
                )}
              >
                Execute
              </button>
            </div>
          ) : null}
          {lastHookPlan.queuedJob ? (
            <div className="mt-2 rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100">
              Queue {lastHookPlan.queuedJob.id.slice(0, 8)} / {lastHookPlan.queuedJob.status} / {lastHookPlan.queuedJob.totalJobs} jobs
            </div>
          ) : null}
          {webhookCount > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="w-full rounded-md border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-[11px] font-semibold text-violet-100 hover:border-violet-300"
                onClick={() => onRunHooks(
                  lastHookPlan.event,
                  { selectedClipIds: lastHookPlan.event === 'manual' ? selectedClipIds : [] },
                  { executeWebhooks: true },
                )}
              >
                Run Webhooks {webhookCount}
              </button>
            </div>
          ) : null}
          {lastHookPlan.webhookExecution ? (
            <div className="mt-2 rounded border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[11px] text-violet-100">
              Webhooks sent {lastHookPlan.webhookExecution.sentCount}/{lastHookPlan.webhookExecution.requestedCount}
              {lastHookPlan.webhookExecution.skippedCount > 0 ? ` / skipped ${lastHookPlan.webhookExecution.skippedCount}` : ''}
              {lastHookPlan.webhookExecution.failedCount > 0 ? ` / failed ${lastHookPlan.webhookExecution.failedCount}` : ''}
              {lastHookPlan.webhookExecution.results[0] ? (
                <div className="mt-1 truncate text-violet-100/75">
                  {lastHookPlan.webhookExecution.results[0].ruleName} / {lastHookPlan.webhookExecution.results[0].status}
                  {lastHookPlan.webhookExecution.results[0].httpStatus ? ` / HTTP ${lastHookPlan.webhookExecution.results[0].httpStatus}` : ''}
                  {lastHookPlan.webhookExecution.results[0].attemptCount && lastHookPlan.webhookExecution.results[0].attemptCount > 1 ? ` / ${lastHookPlan.webhookExecution.results[0].attemptCount} tries` : ''}
                </div>
              ) : null}
              {lastHookPlan.webhookExecution.warnings[0] ? (
                <div className="mt-1 text-amber-200/80">{lastHookPlan.webhookExecution.warnings[0]}</div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            {lastHookPlan.actions.slice(0, 4).map((action) => {
              const localCount = action.localActions?.length ?? 0;
              const jobCount = action.jobs?.length ?? 0;
              const actionWebhookCount = action.webhookPayloads?.length ?? 0;
              const targetCount = action.localActions?.reduce((total, item) => total + item.targetClipIds.length, 0) ?? 0;
              return (
                <div key={action.id} className="rounded border border-sky-400/20 bg-zinc-950/50 p-2">
                  <div className="flex items-center justify-between gap-2 text-sky-100">
                    <span>{action.ruleName}</span>
                    <span className="text-sky-200/70">{action.provider} / {action.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-sky-200/80">
                    {action.description}
                  </div>
                  <div className="mt-1 text-[11px] text-sky-200/70">
                    local {localCount} / jobs {jobCount} / webhooks {actionWebhookCount}{targetCount > 0 ? ` / clips ${targetCount}` : ''}
                  </div>
                  {action.jobs?.[0] ? (
                    <div className="mt-1 text-[11px] text-amber-200/80">
                      {action.jobs[0].workflowName} / {action.jobs[0].clipId}
                    </div>
                  ) : null}
                  {action.webhookPayloads?.[0]?.targetUrl ? (
                    <div className="mt-1 truncate text-[11px] text-violet-200/80">
                      {action.webhookPayloads[0].targetUrl}
                    </div>
                  ) : null}
                  {action.warnings[0] ? (
                    <div className="mt-1 text-[11px] text-amber-200/80">{action.warnings[0]}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {lastHookPlan.warnings[0] ? (
            <div className="mt-2 text-[11px] text-sky-200/70">{lastHookPlan.warnings[0]}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PluginsPanel({
  project,
  selectedClipIds = [],
  onInstallPluginPackage,
  onApplyExternalEffectPlan,
  onApplyExternalTransitionPlan,
  onRunExternalCustomCommand,
  onSetExporterWriterTrust,
}: {
  project: EditorProject;
  selectedClipIds?: string[];
  onInstallPluginPackage?: () => void;
  onApplyExternalEffectPlan?: (pluginId: string, presetId: ExternalEffectPresetId, parameters?: ExternalPluginPlanParameters) => void;
  onApplyExternalTransitionPlan?: (pluginId: string, presetId: ExternalTransitionPresetId, parameters?: ExternalPluginPlanParameters) => void;
  onRunExternalCustomCommand?: (
    pluginId: string,
    commandId: string,
    parameters?: ExternalPluginCustomCommandParameters,
  ) => void;
  onSetExporterWriterTrust?: (
    pluginId: string,
    writerId: string,
    trust: EditorPluginExporterWriterTrust,
  ) => void;
}) {
  const extensionHost = buildExtensionHostSnapshot(project);

  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plugins</h2>
        {onInstallPluginPackage ? (
          <button
            type="button"
            className="shrink-0 rounded border border-sky-500/30 px-2 py-1 text-[11px] text-sky-100 hover:border-sky-300/60 hover:text-sky-50"
            title="Install or update a local Danbi plugin package folder"
            onClick={onInstallPluginPackage}
          >
            Install package
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {project.plugins.map((plugin) => {
          const commands = extensionHost.commands.filter((command) => command.sourcePluginId === plugin.id);
          const renderHooks = extensionHost.renderHooks.filter((hook) => hook.sourcePluginId === plugin.id);
          const warnings = extensionHost.warnings.filter((warning) => warning.includes(`Extension ${plugin.id}`));
          const sandbox = extensionHost.sandboxes.find((policy) => policy.pluginId === plugin.id);
          const customCommands = plugin.customCommands ?? [];
          const canRunExternalCustomCommand = Boolean(
            onRunExternalCustomCommand &&
            sandbox?.status === 'manifest-only' &&
            sandbox.executableApis.includes('command') &&
            sandbox.permissions.includes('project'),
          );
          const canPlanExternalEffects = Boolean(
            onApplyExternalEffectPlan &&
            sandbox?.status === 'manifest-only' &&
            sandbox.executableApis.includes('command') &&
            plugin.contributes.includes('effect'),
          );
          const canPlanExternalTransitions = Boolean(
            onApplyExternalTransitionPlan &&
            sandbox?.status === 'manifest-only' &&
            sandbox.executableApis.includes('command') &&
            plugin.contributes.includes('transition'),
          );

          return (
            <div key={plugin.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm text-zinc-200">{plugin.name}</div>
                {sandbox ? (
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                    sandbox.status === 'trusted-builtin'
                      ? 'border-emerald-500/40 text-emerald-200'
                      : sandbox.status === 'blocked'
                        ? 'border-rose-500/40 text-rose-200'
                        : 'border-amber-500/40 text-amber-200'
                  }`}
                  >
                    {sandbox.status}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{plugin.contributes.join(', ')}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                <span className="rounded border border-zinc-800 px-2 py-1">commands {commands.length}</span>
                <span className="rounded border border-zinc-800 px-2 py-1">render hooks {renderHooks.length}</span>
                {sandbox ? (
                  <span className="rounded border border-zinc-800 px-2 py-1">{sandbox.runtime}</span>
                ) : null}
                {sandbox ? (
                  <span
                    className={`rounded border px-2 py-1 ${
                      sandbox.signature.status === 'verified'
                        ? 'border-emerald-500/30 text-emerald-200'
                        : sandbox.signature.status === 'mismatch' ||
                          sandbox.signature.status === 'invalid' ||
                          sandbox.signature.status === 'unsupported'
                          ? 'border-rose-500/30 text-rose-200'
                          : 'border-zinc-800 text-zinc-400'
                    }`}
                    title={`${sandbox.signature.reason} ${sandbox.signature.signingKeyStatus ? `key ${sandbox.signature.signingKeyStatus}` : ''} ${sandbox.signature.signingKeyFingerprint ?? sandbox.signature.computedFingerprint}`}
                  >
                    signature {sandbox.signature.status}/{sandbox.signature.trustLevel}
                  </span>
                ) : null}
              </div>
              {commands[0] ? (
                <div className="mt-2 truncate text-[11px] text-sky-200/80">{commands[0].title}</div>
              ) : null}
              {renderHooks[0] ? (
                <div className="mt-1 truncate text-[11px] text-emerald-200/80">{renderHooks[0].title}</div>
              ) : null}
              {sandbox?.exporterWriters?.length ? (
                <div className="mt-3 space-y-1">
                  {sandbox.exporterWriters.map((writer) => (
                    <div key={writer.writerId} className="rounded border border-zinc-800 px-2 py-1 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-zinc-300" title={writer.commandPreview}>{writer.label}</span>
                        <span className={`shrink-0 ${
                          writer.status === 'trusted'
                            ? 'text-emerald-200'
                            : writer.status === 'blocked'
                              ? 'text-rose-200'
                              : 'text-amber-200'
                        }`}
                        >
                          {writer.status}
                        </span>
                      </div>
                      {writer.approvalStatus !== 'not-required' ? (
                        <div className="mt-1 truncate text-[10px] text-zinc-500" title={writer.reason}>
                          approval {writer.approvalStatus} / {writer.fingerprint}
                        </div>
                      ) : null}
                      {writer.runtimePackage ? (
                        <div className="mt-1 truncate text-[10px] text-zinc-500" title={`${writer.runtimePackage.root}/${writer.runtimePackage.entry}`}>
                          package {writer.packageStatus} / {writer.runtimePackage.runtime} / {writer.runtimePackage.files.length} files
                        </div>
                      ) : null}
                      {writer.latestTrustDecision ? (
                        <div className="mt-1 truncate text-[10px] text-zinc-500" title={writer.latestTrustDecision.commandPreview}>
                          {writer.latestTrustDecision.action} {writer.latestTrustDecision.at} / {writer.trustHistoryCount} audit
                        </div>
                      ) : null}
                      {onSetExporterWriterTrust ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-emerald-100 hover:border-emerald-300/60 disabled:border-zinc-800 disabled:text-zinc-600"
                            disabled={writer.status === 'trusted'}
                            title="Trust this exporter writer for project handoff execution"
                            onClick={() => onSetExporterWriterTrust(plugin.id, writer.writerId, 'trusted')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-100 hover:border-amber-300/60 disabled:border-zinc-800 disabled:text-zinc-600"
                            disabled={writer.trust === 'prompt'}
                            title="Require approval before this exporter writer can execute"
                            onClick={() => onSetExporterWriterTrust(plugin.id, writer.writerId, 'prompt')}
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            className="rounded border border-rose-500/30 px-1.5 py-0.5 text-rose-100 hover:border-rose-300/60 disabled:border-zinc-800 disabled:text-zinc-600"
                            disabled={writer.status === 'blocked'}
                            title="Block this exporter writer from handoff execution"
                            onClick={() => onSetExporterWriterTrust(plugin.id, writer.writerId, 'blocked')}
                          >
                            Block
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {customCommands.length > 0 ? (
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Custom commands</div>
                  {customCommands.map((command) => {
                    const defaultParameters = buildExternalCustomCommandDefaultParameters(command);
                    const missingDefaultParameters = findMissingExternalCustomCommandDefaultParameters(command);
                    const commandContributionAllowed = plugin.contributes.includes(command.contribution);
                    const canRunCommand = canRunExternalCustomCommand && commandContributionAllowed && missingDefaultParameters.length === 0;
                    const unavailableReason = !onRunExternalCustomCommand
                      ? 'Custom command runner is unavailable in this view.'
                      : sandbox?.status !== 'manifest-only'
                        ? 'Custom commands require a reviewed manifest-only sandbox.'
                        : !sandbox.executableApis.includes('command')
                          ? 'This plugin is not enrolled for reviewed command execution.'
                          : !sandbox.permissions.includes('project')
                            ? 'Custom commands require project permission.'
                            : !commandContributionAllowed
                              ? `Custom command contribution ${command.contribution} is not declared by this plugin.`
                              : missingDefaultParameters.length > 0
                                ? `Missing default values for ${missingDefaultParameters.join(', ')}.`
                                : command.description ?? `Run ${command.label}`;

                    return (
                      <div key={command.id} className="rounded border border-zinc-800 px-2 py-1 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-zinc-300" title={command.description ?? command.label}>
                            {command.label}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded border border-sky-500/30 px-1.5 py-0.5 text-sky-100 hover:border-sky-300/60 hover:text-sky-50 disabled:border-zinc-800 disabled:text-zinc-600"
                            disabled={!canRunCommand}
                            title={canRunCommand ? command.description ?? `Run ${command.label}` : unavailableReason}
                            onClick={() => onRunExternalCustomCommand?.(plugin.id, command.id, defaultParameters)}
                          >
                            Run
                          </button>
                        </div>
                        <div className="mt-1 truncate text-[10px] text-zinc-500" title={`${command.kind} / ${command.contribution}`}>
                          {command.kind} / {command.contribution}
                          {Object.keys(defaultParameters).length > 0 ? ` / defaults ${Object.keys(defaultParameters).length}` : ''}
                        </div>
                        {missingDefaultParameters.length > 0 ? (
                          <div className="mt-1 truncate text-[10px] text-amber-200/80" title={missingDefaultParameters.join(', ')}>
                            missing defaults {missingDefaultParameters.length}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {canPlanExternalEffects ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-amber-400/30 px-2 py-1 text-[11px] text-amber-100 hover:border-amber-300/60 hover:text-amber-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed warm contrast plan to selected clips"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'warm-contrast')}
                  >
                    Warm
                  </button>
                  <button
                    type="button"
                    className="rounded border border-orange-400/30 px-2 py-1 text-[11px] text-orange-100 hover:border-orange-300/60 hover:text-orange-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed warm contrast at stronger intensity"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'warm-contrast', { intensity: 1.5 })}
                  >
                    Warm+
                  </button>
                  <button
                    type="button"
                    className="rounded border border-sky-400/30 px-2 py-1 text-[11px] text-sky-100 hover:border-sky-300/60 hover:text-sky-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed soft vignette plan to selected clips"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'soft-vignette')}
                  >
                    Vignette
                  </button>
                  <button
                    type="button"
                    className="rounded border border-blue-400/30 px-2 py-1 text-[11px] text-blue-100 hover:border-blue-300/60 hover:text-blue-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed stronger soft vignette plan to selected clips"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'soft-vignette', { vignetteStrength: 0.55 })}
                  >
                    Vignette+
                  </button>
                </div>
              ) : null}
              {canPlanExternalTransitions ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-violet-400/30 px-2 py-1 text-[11px] text-violet-100 hover:border-violet-300/60 hover:text-violet-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed smooth crossfade plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'smooth-crossfade')}
                  >
                    Xfade
                  </button>
                  <button
                    type="button"
                    className="rounded border border-fuchsia-400/30 px-2 py-1 text-[11px] text-fuchsia-100 hover:border-fuchsia-300/60 hover:text-fuchsia-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed longer crossfade plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'smooth-crossfade', { duration: 1.25, easing: 'easeOut' })}
                  >
                    Xfade+
                  </button>
                  <button
                    type="button"
                    className="rounded border border-cyan-400/30 px-2 py-1 text-[11px] text-cyan-100 hover:border-cyan-300/60 hover:text-cyan-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed push-left transition plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'push-left')}
                  >
                    Push
                  </button>
                  <button
                    type="button"
                    className="rounded border border-teal-400/30 px-2 py-1 text-[11px] text-teal-100 hover:border-teal-300/60 hover:text-teal-50 disabled:border-zinc-800 disabled:text-zinc-600"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed upward push transition plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'push-left', { duration: 0.9, direction: 'up' })}
                  >
                    Push Up
                  </button>
                </div>
              ) : null}
              {warnings[0] ? (
                <div className="mt-2 text-[11px] text-amber-200/80">{warnings[0]}</div>
              ) : null}
              {!warnings[0] && sandbox?.reason ? (
                <div className="mt-2 text-[11px] text-zinc-500">{sandbox.reason}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <>
      <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-300">{keys}</span>
      <span className="py-1">{label}</span>
    </>
  );
}

function countHookPlanComfyJobs(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.jobs?.length ?? 0), 0) ?? 0;
}

function countHookPlanLocalActions(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.localActions?.length ?? 0), 0) ?? 0;
}

function countHookPlanWebhooks(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.webhookPayloads?.length ?? 0), 0) ?? 0;
}
