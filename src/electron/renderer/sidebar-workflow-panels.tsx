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
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Shortcuts</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-ds-700">
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
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Queue Settings</h2>
        <button
          type="button"
          className="text-xs text-accent-700 hover:text-accent-800"
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
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Automation Hooks</h2>
        <span className="text-xs text-info-700">{automationRuleCount} rules</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-800 hover:border-accent-500"
          onClick={() => onRunHooks('manual')}
        >
          Manual
        </button>
        <button
          type="button"
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-800 hover:border-info-500"
          onClick={() => onRunHooks('on-gap', { selectedClipIds: [] })}
        >
          On gap
        </button>
        <button
          type="button"
          className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-800 hover:border-warn-500"
          onClick={() => onRunHooks('before-export', { selectedClipIds: [] })}
        >
          Export
        </button>
      </div>
      {lastHookPlan ? (
        <div className="mt-3 rounded-md border border-info-500/30 bg-info-500/10 p-2 text-xs text-info-900">
          <div className="flex items-center justify-between gap-2">
            <span>{lastHookPlan.event} / {lastHookPlan.actionCount} prepared</span>
            <span className="text-info-800/70">{lastHookPlan.matchedRuleCount} matched</span>
          </div>
          {localActionCount > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="w-full rounded-md border border-info-600/40 bg-info-600/10 px-3 py-2 text-meta font-semibold text-info-900 hover:border-info-700"
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
            <div className="mt-2 rounded border border-info-600/20 bg-info-600/10 px-2 py-1 text-meta text-info-900">
              Applied {lastHookPlan.appliedLocalActions.appliedActionIds.length} local actions
              {lastHookPlan.appliedLocalActions.appliedClipIds.length > 0 ? ` / clips ${lastHookPlan.appliedLocalActions.appliedClipIds.length}` : ''}
            </div>
          ) : null}
          {comfyJobCount > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isQueueingComfyUI}
                className="rounded-md border border-warn-600/40 bg-warn-600/10 px-3 py-2 text-meta font-semibold text-warn-900 hover:border-warn-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded-md border border-accent-600/40 bg-accent-600/10 px-3 py-2 text-meta font-semibold text-accent-900 hover:border-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="mt-2 rounded border border-accent-600/20 bg-accent-600/10 px-2 py-1 text-meta text-accent-900">
              Queue {lastHookPlan.queuedJob.id.slice(0, 8)} / {lastHookPlan.queuedJob.status} / {lastHookPlan.queuedJob.totalJobs} jobs
            </div>
          ) : null}
          {webhookCount > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="w-full rounded-md border border-accent2-600/40 bg-accent2-600/10 px-3 py-2 text-meta font-semibold text-accent2-900 hover:border-accent2-700"
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
            <div className="mt-2 rounded border border-accent2-600/20 bg-accent2-600/10 px-2 py-1 text-meta text-accent2-900">
              Webhooks sent {lastHookPlan.webhookExecution.sentCount}/{lastHookPlan.webhookExecution.requestedCount}
              {lastHookPlan.webhookExecution.skippedCount > 0 ? ` / skipped ${lastHookPlan.webhookExecution.skippedCount}` : ''}
              {lastHookPlan.webhookExecution.failedCount > 0 ? ` / failed ${lastHookPlan.webhookExecution.failedCount}` : ''}
              {lastHookPlan.webhookExecution.results[0] ? (
                <div className="mt-1 truncate text-accent2-900/75">
                  {lastHookPlan.webhookExecution.results[0].ruleName} / {lastHookPlan.webhookExecution.results[0].status}
                  {lastHookPlan.webhookExecution.results[0].httpStatus ? ` / HTTP ${lastHookPlan.webhookExecution.results[0].httpStatus}` : ''}
                  {lastHookPlan.webhookExecution.results[0].attemptCount && lastHookPlan.webhookExecution.results[0].attemptCount > 1 ? ` / ${lastHookPlan.webhookExecution.results[0].attemptCount} tries` : ''}
                </div>
              ) : null}
              {lastHookPlan.webhookExecution.warnings[0] ? (
                <div className="mt-1 text-warn-800/80">{lastHookPlan.webhookExecution.warnings[0]}</div>
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
                <div key={action.id} className="rounded border border-info-600/20 bg-paper/50 p-2">
                  <div className="flex items-center justify-between gap-2 text-info-900">
                    <span>{action.ruleName}</span>
                    <span className="text-info-800/70">{action.provider} / {action.status}</span>
                  </div>
                  <div className="mt-1 text-meta text-info-800/80">
                    {action.description}
                  </div>
                  <div className="mt-1 text-meta text-info-800/70">
                    local {localCount} / jobs {jobCount} / webhooks {actionWebhookCount}{targetCount > 0 ? ` / clips ${targetCount}` : ''}
                  </div>
                  {action.jobs?.[0] ? (
                    <div className="mt-1 text-meta text-warn-800/80">
                      {action.jobs[0].workflowName} / {action.jobs[0].clipId}
                    </div>
                  ) : null}
                  {action.webhookPayloads?.[0]?.targetUrl ? (
                    <div className="mt-1 truncate text-meta text-accent2-800/80">
                      {action.webhookPayloads[0].targetUrl}
                    </div>
                  ) : null}
                  {action.warnings[0] ? (
                    <div className="mt-1 text-meta text-warn-800/80">{action.warnings[0]}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {lastHookPlan.warnings[0] ? (
            <div className="mt-2 text-meta text-info-800/70">{lastHookPlan.warnings[0]}</div>
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
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">Plugins</h2>
        {onInstallPluginPackage ? (
          <button
            type="button"
            className="shrink-0 rounded border border-info-500/30 px-2 py-1 text-meta text-info-900 hover:border-info-700/60 hover:text-info-900"
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
            <div key={plugin.id} className="rounded-md border border-ds-200 bg-paper p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm text-ds-800">{plugin.name}</div>
                {sandbox ? (
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-micro ${
                    sandbox.status === 'trusted-builtin'
                      ? 'border-accent-500/40 text-accent-800'
                      : sandbox.status === 'blocked'
                        ? 'border-danger-500/40 text-danger-800'
                        : 'border-warn-500/40 text-warn-800'
                  }`}
                  >
                    {sandbox.status}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-ds-600">{plugin.contributes.join(', ')}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-meta text-ds-700">
                <span className="rounded border border-ds-200 px-2 py-1">commands {commands.length}</span>
                <span className="rounded border border-ds-200 px-2 py-1">render hooks {renderHooks.length}</span>
                {sandbox ? (
                  <span className="rounded border border-ds-200 px-2 py-1">{sandbox.runtime}</span>
                ) : null}
                {sandbox ? (
                  <span
                    className={`rounded border px-2 py-1 ${
                      sandbox.signature.status === 'verified'
                        ? 'border-accent-500/30 text-accent-800'
                        : sandbox.signature.status === 'mismatch' ||
                          sandbox.signature.status === 'invalid' ||
                          sandbox.signature.status === 'unsupported'
                          ? 'border-danger-500/30 text-danger-800'
                          : 'border-ds-200 text-ds-700'
                    }`}
                    title={`${sandbox.signature.reason} ${sandbox.signature.signingKeyStatus ? `key ${sandbox.signature.signingKeyStatus}` : ''} ${sandbox.signature.signingKeyFingerprint ?? sandbox.signature.computedFingerprint}`}
                  >
                    signature {sandbox.signature.status}/{sandbox.signature.trustLevel}
                  </span>
                ) : null}
              </div>
              {commands[0] ? (
                <div className="mt-2 truncate text-meta text-info-800/80">{commands[0].title}</div>
              ) : null}
              {renderHooks[0] ? (
                <div className="mt-1 truncate text-meta text-accent-800/80">{renderHooks[0].title}</div>
              ) : null}
              {sandbox?.exporterWriters?.length ? (
                <div className="mt-3 space-y-1">
                  {sandbox.exporterWriters.map((writer) => (
                    <div key={writer.writerId} className="rounded border border-ds-200 px-2 py-1 text-meta">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-ds-700" title={writer.commandPreview}>{writer.label}</span>
                        <span className={`shrink-0 ${
                          writer.status === 'trusted'
                            ? 'text-accent-800'
                            : writer.status === 'blocked'
                              ? 'text-danger-800'
                              : 'text-warn-800'
                        }`}
                        >
                          {writer.status}
                        </span>
                      </div>
                      {writer.approvalStatus !== 'not-required' ? (
                        <div className="mt-1 truncate text-micro text-ds-600" title={writer.reason}>
                          approval {writer.approvalStatus} / {writer.fingerprint}
                        </div>
                      ) : null}
                      {writer.runtimePackage ? (
                        <div className="mt-1 truncate text-micro text-ds-600" title={`${writer.runtimePackage.root}/${writer.runtimePackage.entry}`}>
                          package {writer.packageStatus} / {writer.runtimePackage.runtime} / {writer.runtimePackage.files.length} files
                        </div>
                      ) : null}
                      {writer.latestTrustDecision ? (
                        <div className="mt-1 truncate text-micro text-ds-600" title={writer.latestTrustDecision.commandPreview}>
                          {writer.latestTrustDecision.action} {writer.latestTrustDecision.at} / {writer.trustHistoryCount} audit
                        </div>
                      ) : null}
                      {onSetExporterWriterTrust ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-accent-500/30 px-1.5 py-0.5 text-accent-900 hover:border-accent-700/60 disabled:border-ds-200 disabled:text-ds-400"
                            disabled={writer.status === 'trusted'}
                            title="Trust this exporter writer for project handoff execution"
                            onClick={() => onSetExporterWriterTrust(plugin.id, writer.writerId, 'trusted')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded border border-warn-500/30 px-1.5 py-0.5 text-warn-900 hover:border-warn-700/60 disabled:border-ds-200 disabled:text-ds-400"
                            disabled={writer.trust === 'prompt'}
                            title="Require approval before this exporter writer can execute"
                            onClick={() => onSetExporterWriterTrust(plugin.id, writer.writerId, 'prompt')}
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            className="rounded border border-danger-500/30 px-1.5 py-0.5 text-danger-900 hover:border-danger-700/60 disabled:border-ds-200 disabled:text-ds-400"
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
                  <div className="text-micro font-semibold uppercase tracking-wide text-ds-400">Custom commands</div>
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
                      <div key={command.id} className="rounded border border-ds-200 px-2 py-1 text-meta">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-ds-700" title={command.description ?? command.label}>
                            {command.label}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded border border-info-500/30 px-1.5 py-0.5 text-info-900 hover:border-info-700/60 hover:text-info-900 disabled:border-ds-200 disabled:text-ds-400"
                            disabled={!canRunCommand}
                            title={canRunCommand ? command.description ?? `Run ${command.label}` : unavailableReason}
                            onClick={() => onRunExternalCustomCommand?.(plugin.id, command.id, defaultParameters)}
                          >
                            Run
                          </button>
                        </div>
                        <div className="mt-1 truncate text-micro text-ds-600" title={`${command.kind} / ${command.contribution}`}>
                          {command.kind} / {command.contribution}
                          {Object.keys(defaultParameters).length > 0 ? ` / defaults ${Object.keys(defaultParameters).length}` : ''}
                        </div>
                        {missingDefaultParameters.length > 0 ? (
                          <div className="mt-1 truncate text-micro text-warn-800/80" title={missingDefaultParameters.join(', ')}>
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
                    className="rounded border border-warn-600/30 px-2 py-1 text-meta text-warn-900 hover:border-warn-700/60 hover:text-warn-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed warm contrast plan to selected clips"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'warm-contrast')}
                  >
                    Warm
                  </button>
                  <button
                    type="button"
                    className="rounded border border-warn-600/30 px-2 py-1 text-meta text-warn-900 hover:border-warn-700/60 hover:text-warn-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed warm contrast at stronger intensity"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'warm-contrast', { intensity: 1.5 })}
                  >
                    Warm+
                  </button>
                  <button
                    type="button"
                    className="rounded border border-info-600/30 px-2 py-1 text-meta text-info-900 hover:border-info-700/60 hover:text-info-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed soft vignette plan to selected clips"
                    onClick={() => onApplyExternalEffectPlan?.(plugin.id, 'soft-vignette')}
                  >
                    Vignette
                  </button>
                  <button
                    type="button"
                    className="rounded border border-info-600/30 px-2 py-1 text-meta text-info-900 hover:border-info-700/60 hover:text-info-900 disabled:border-ds-200 disabled:text-ds-400"
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
                    className="rounded border border-accent2-600/30 px-2 py-1 text-meta text-accent2-900 hover:border-accent2-700/60 hover:text-accent2-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed smooth crossfade plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'smooth-crossfade')}
                  >
                    Xfade
                  </button>
                  <button
                    type="button"
                    className="rounded border border-accent2-600/30 px-2 py-1 text-meta text-accent2-900 hover:border-accent2-700/60 hover:text-accent2-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed longer crossfade plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'smooth-crossfade', { duration: 1.25, easing: 'easeOut' })}
                  >
                    Xfade+
                  </button>
                  <button
                    type="button"
                    className="rounded border border-info-600/30 px-2 py-1 text-meta text-info-900 hover:border-info-700/60 hover:text-info-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed push-left transition plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'push-left')}
                  >
                    Push
                  </button>
                  <button
                    type="button"
                    className="rounded border border-accent-600/30 px-2 py-1 text-meta text-accent-900 hover:border-accent-700/60 hover:text-accent-900 disabled:border-ds-200 disabled:text-ds-400"
                    disabled={selectedClipIds.length === 0}
                    title="Apply reviewed upward push transition plan to selected clips"
                    onClick={() => onApplyExternalTransitionPlan?.(plugin.id, 'push-left', { duration: 0.9, direction: 'up' })}
                  >
                    Push Up
                  </button>
                </div>
              ) : null}
              {warnings[0] ? (
                <div className="mt-2 text-meta text-warn-800/80">{warnings[0]}</div>
              ) : null}
              {!warnings[0] && sandbox?.reason ? (
                <div className="mt-2 text-meta text-ds-600">{sandbox.reason}</div>
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
      <span className="rounded border border-ds-200 bg-paper px-2 py-1 tabular-nums text-meta text-ds-700">{keys}</span>
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
