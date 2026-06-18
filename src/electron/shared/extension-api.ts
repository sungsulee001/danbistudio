import { buildTimelineStateSnapshot, type TimelineStateSnapshot } from './timeline-state';
import {
  isExportProfileCodecContainerCompatible,
  isExportProfileDimensionCompatible,
} from '../../lib/editor/export-profiles';
import {
  PLUGIN_MANIFEST_SIGNATURE_ALGORITHM,
  PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN,
  PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM,
  PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN,
  verifyPluginManifestSignature,
  type PluginManifestSigningKeyVerificationStatus,
  type PluginManifestSignatureTrustLevel,
  type PluginManifestSignatureStatus,
} from '../../lib/editor/plugin-signature';
import { buildPluginExporterWriterTrustFingerprint } from '../../lib/editor/plugin-trust';
import type {
  ClipEffect,
  ClipKind,
  EditorPluginCustomCommand,
  EditorPluginExporterWriterRuntimePackage,
  EditorPluginManifest,
  EditorPluginParameterSchema,
  EditorProject,
  ExportProfile,
  TimelineTransition,
  TrackKind,
} from '../../lib/editor/types';
import type {
  ExtensionCommandContribution,
  ExtensionContribution,
  ExtensionPermission,
  ExtensionRenderHookContext,
  ExtensionRenderHookContribution,
  ExtensionRenderHookEvent,
  ExtensionRenderHookResult,
  ExtensionRenderHookRunResult,
  ExtensionRuntimeJsonValue,
  ExtensionRuntimeMetadata,
} from '../../lib/editor/extension-runtime-types';

export const EXTENSION_SANDBOX_PROTOCOL_VERSION = 1;
export const EXTENSION_SANDBOX_HANDSHAKE_REQUEST_KIND = 'danbi.extension-sandbox.handshake.request';
export const EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND = 'danbi.extension-sandbox.handshake.response';
export const EXTENSION_SANDBOX_COMMAND_REQUEST_KIND = 'danbi.extension-sandbox.command.request';
export const EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND = 'danbi.extension-sandbox.command.response';
export const EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND = 'danbi.external.inspectManifest';
export const EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND = 'danbi.external.analyzeTimeline';
export const EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND = 'danbi.external.analyzeExports';
export const EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND = 'danbi.external.planExports';
export const EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND = 'danbi.external.writeExports';
export const EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND = 'danbi.external.planEffects';
export const EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND = 'danbi.external.planTransitions';
export const EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND = 'danbi.external.runCustomCommand';
const EXTENSION_SANDBOX_PERMISSIONS = new Set<ExtensionPermission>(['filesystem', 'network', 'comfyui', 'render', 'project']);
const EXTENSION_SANDBOX_CONTRIBUTES = new Set<ExtensionContribution>(['effect', 'transition', 'exporter', 'automation', 'analyzer', 'workflow']);
const EXTENSION_SANDBOX_CLIP_KINDS = new Set<ClipKind>(['video', 'audio', 'image', 'text', 'effect', 'ai']);
const EXTENSION_SANDBOX_EFFECT_TYPES = new Set<ClipEffect['type']>(['color', 'audio', 'motion', 'caption', 'mask', 'stabilize', 'reframe', 'layout', 'filter', 'ai']);
const EXTENSION_SANDBOX_TRACK_KINDS = new Set<TrackKind>(['video', 'audio', 'text', 'effect']);
const EXTENSION_SANDBOX_FINDING_SEVERITIES = ['info', 'warning', 'error'] as const;
const EXTENSION_SANDBOX_TIMELINE_ANALYSIS_SCOPES = ['all', 'visual', 'audio', 'selected'] as const;
const EXTENSION_SANDBOX_EXPORT_PROFILE_PURPOSES = ['master', 'social', 'proxy'] as const;
const EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST = ['trusted', 'prompt', 'blocked'] as const;
const EXTENSION_SANDBOX_EXPORTER_WRITER_RUNTIMES = ['native', 'node'] as const;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_CONTRIBUTIONS = ['automation', 'analyzer', 'exporter'] as const;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_KINDS = ['project-summary', 'timeline-report', 'export-report'] as const;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_LIMIT = 64;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_PARAMETER_LIMIT = 64;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_ENUM_VALUE_LIMIT = 128;
const EXTENSION_SANDBOX_CUSTOM_COMMAND_STRING_LIMIT = 500;
const EXTENSION_SANDBOX_COMFYUI_WORKFLOW_LIMIT = 128;
const EXTENSION_SANDBOX_COMFYUI_NODE_TYPE_LIMIT = 128;
const EXTENSION_SANDBOX_BLOCKING_SIGNATURE_STATUSES = new Set<PluginManifestSignatureStatus>([
  'mismatch',
  'unsupported',
  'invalid',
  'untrusted-key',
  'bad-signature',
]);
const REVIEWED_SANDBOX_COMMAND_REQUIREMENTS = new Map<string, ExtensionContribution>([
  [EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND, 'analyzer'],
  [EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND, 'analyzer'],
  [EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND, 'exporter'],
  [EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND, 'exporter'],
  [EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND, 'exporter'],
  [EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND, 'effect'],
  [EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND, 'transition'],
]);

export interface ExtensionHostSnapshot {
  projectId: string;
  manifests: EditorPluginManifest[];
  permissions: Record<string, ExtensionPermission[]>;
  contributes: Record<string, ExtensionContribution[]>;
  sandboxes: ExtensionSandboxPolicy[];
  commands: ExtensionCommandContribution[];
  renderHooks: ExtensionRenderHookContribution[];
  warnings: string[];
  blockedPlugins: ExtensionRuntimeBlockedPlugin[];
}

export type ExtensionSandboxStatus = 'trusted-builtin' | 'manifest-only' | 'blocked';
export type ExtensionSandboxRuntime = 'builtin-fixture' | 'external-manifest' | 'external-process-command' | 'blocked';
export type ExtensionSandboxHandshakeRuntime = 'external-process-handshake';
export type ExtensionSandboxCommandRuntime = 'external-process-command';
export type ExtensionSandboxCodeExecution = 'disabled' | 'reviewed-command-api';
export type ExtensionSandboxExecutableApi = 'command' | 'render-hook' | 'exporter-writer';
type ExtensionSandboxFindingSeverity = typeof EXTENSION_SANDBOX_FINDING_SEVERITIES[number];
type ExtensionSandboxExporterWriterTrust = typeof EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST[number];

export interface ExtensionSandboxExporterWriterTrustAuditEntry {
  [key: string]: ExtensionRuntimeJsonValue;
  at: string;
  action: 'approved' | 'review-required' | 'blocked';
  previousTrust: ExtensionSandboxExporterWriterTrust;
  nextTrust: ExtensionSandboxExporterWriterTrust;
  fingerprint: string;
  commandPreview: string;
  source: string | null;
}

export interface ExtensionSandboxExporterWriterPolicy {
  writerId: string;
  label: string;
  executable: string;
  args: string[];
  cwd: string | null;
  trust: ExtensionSandboxExporterWriterTrust;
  status: 'trusted' | 'approval-required' | 'blocked';
  fingerprint: string;
  trustFingerprint: string | null;
  approvalStatus: 'current' | 'missing' | 'stale' | 'not-required';
  latestTrustDecision: ExtensionSandboxExporterWriterTrustAuditEntry | null;
  trustHistoryCount: number;
  runtimePackage: ExtensionSandboxExporterWriterRuntimePackage | null;
  packageStatus: 'packaged' | 'not-packaged';
  timeoutMs: number | null;
  commandPreview: string;
  reason: string;
}

export interface ExtensionSandboxExporterWriterRuntimePackageFile {
  [key: string]: ExtensionRuntimeJsonValue;
  path: string;
  sha256: string | null;
  bytes: number | null;
}

export interface ExtensionSandboxExporterWriterRuntimePackage {
  [key: string]: ExtensionRuntimeJsonValue;
  packageId: string;
  runtime: 'native' | 'node';
  root: string;
  entry: string;
  packagedAt: string | null;
  files: ExtensionSandboxExporterWriterRuntimePackageFile[];
}

export interface ExtensionSandboxSignaturePolicy {
  status: PluginManifestSignatureStatus | 'not-required';
  trustLevel: PluginManifestSignatureTrustLevel;
  algorithm: string | null;
  keyId: string | null;
  signedAt: string | null;
  manifestFingerprint: string | null;
  computedFingerprint: string;
  signatureValue: string | null;
  signingKeyFingerprint: string | null;
  signingKeyLabel: string | null;
  signingKeyStatus: PluginManifestSigningKeyVerificationStatus | null;
  signingKeyValidFrom: string | null;
  signingKeyValidUntil: string | null;
  signingKeyReplacementKeyId: string | null;
  reason: string;
}

interface ReviewedSandboxFinding {
  [key: string]: ExtensionRuntimeJsonValue;
  severity: ExtensionSandboxFindingSeverity;
  code: string;
  message: string;
}

export interface ExtensionSandboxPolicy {
  pluginId: string;
  entry: string;
  status: ExtensionSandboxStatus;
  runtime: ExtensionSandboxRuntime;
  permissions: ExtensionPermission[];
  declaredApis: ExtensionContribution[];
  executableApis: ExtensionSandboxExecutableApi[];
  signature: ExtensionSandboxSignaturePolicy;
  exporterWriters: ExtensionSandboxExporterWriterPolicy[];
  reason: string;
}

export interface ExtensionRuntimeBlockedPlugin {
  pluginId: string;
  reason: string;
}

export interface ExtensionSandboxHandshakeRequest {
  kind: typeof EXTENSION_SANDBOX_HANDSHAKE_REQUEST_KIND;
  protocolVersion: typeof EXTENSION_SANDBOX_PROTOCOL_VERSION;
  projectId: string;
  plugin: EditorPluginManifest;
  requestedApis: ExtensionContribution[];
}

export interface ExtensionSandboxHandshakeResponse {
  kind: typeof EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND;
  protocolVersion: typeof EXTENSION_SANDBOX_PROTOCOL_VERSION;
  pluginId: string;
  accepted: boolean;
  status: Extract<ExtensionSandboxStatus, 'manifest-only' | 'blocked'>;
  runtime: ExtensionSandboxHandshakeRuntime;
  codeExecution: ExtensionSandboxCodeExecution;
  permissions: ExtensionPermission[];
  declaredApis: ExtensionContribution[];
  executableApis: ExtensionSandboxExecutableApi[];
  warnings: string[];
  reason: string;
}

export interface ExtensionSandboxProjectSummary {
  projectId: string;
  name: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  assetCount: number;
  trackCount: number;
  clipCount: number;
  captionCount: number;
  markerCount: number;
  exportProfileCount: number;
}

export interface ExtensionSandboxTimelineGapSummary {
  trackId: string;
  start: number;
  end: number;
  duration: number;
}

export interface ExtensionSandboxTimelineClipSummary {
  clipId: string;
  trackId: string;
  kind: ClipKind;
  start: number;
  duration: number;
  end: number;
  muted: boolean;
  locked: boolean;
  effectTypes: ClipEffect['type'][];
  effectCount: number;
  keyframeCount: number;
  transitionCount: number;
  automationTagCount: number;
}

export interface ExtensionSandboxTimelineTrackSummary {
  trackId: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  syncLocked: boolean;
  clipCount: number;
  clips: ExtensionSandboxTimelineClipSummary[];
  gaps: ExtensionSandboxTimelineGapSummary[];
}

export interface ExtensionSandboxTimelineAnalysisInput {
  project: ExtensionSandboxProjectSummary;
  tracks: ExtensionSandboxTimelineTrackSummary[];
}

export interface ExtensionSandboxExportProfileSummary {
  profileId: string;
  label: string;
  purpose: NonNullable<ExportProfile['purpose']> | null;
  container: ExportProfile['container'];
  codec: ExportProfile['codec'];
  width: number;
  height: number;
  fps: number;
  videoBitrateMbps: number;
  audioBitrateKbps: number;
  ffmpegPreset: NonNullable<ExportProfile['ffmpegPreset']> | null;
  crf: number | null;
  pixelsPerFrame: number;
  megapixelsPerSecond: number;
  aspectRatio: number;
  compatibleCodecContainer: boolean;
  compatibleDimensions: boolean;
}

export interface ExtensionSandboxExportAnalysisInput {
  project: ExtensionSandboxProjectSummary;
  profiles: ExtensionSandboxExportProfileSummary[];
}

export interface ExtensionSandboxCommandRequest {
  kind: typeof EXTENSION_SANDBOX_COMMAND_REQUEST_KIND;
  protocolVersion: typeof EXTENSION_SANDBOX_PROTOCOL_VERSION;
  projectId: string;
  plugin: EditorPluginManifest;
  command: string;
  payload?: unknown;
  projectSummary: ExtensionSandboxProjectSummary;
  timeline: ExtensionSandboxTimelineAnalysisInput;
  exports: ExtensionSandboxExportAnalysisInput;
}

export interface ExtensionSandboxCommandResponse {
  kind: typeof EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND;
  protocolVersion: typeof EXTENSION_SANDBOX_PROTOCOL_VERSION;
  pluginId: string;
  command: string;
  handled: boolean;
  status: 'executed' | 'blocked';
  runtime: ExtensionSandboxCommandRuntime;
  codeExecution: ExtensionSandboxCodeExecution;
  permissions: ExtensionPermission[];
  declaredApis: ExtensionContribution[];
  executableApis: ExtensionSandboxExecutableApi[];
  result?: ExtensionRuntimeMetadata;
  warnings: string[];
  reason: string;
}

export interface DanbiExtensionContext {
  extensionId: string;
  projectId: string;
  permissions: ExtensionPermission[];
  timeline: TimelineStateSnapshot;
}

export interface DanbiExtensionApi {
  readonly apiVersion: 1;
  readonly context: DanbiExtensionContext;
  hasPermission(permission: ExtensionPermission): boolean;
}

export interface ExtensionInvocationRequest {
  project?: EditorProject;
  extensionId: string;
  command: string;
  payload?: unknown;
}

export interface ExtensionInvocationResult {
  extensionId: string;
  command: string;
  handled: boolean;
  result?: unknown;
  warnings: string[];
}

interface ExtensionRuntime {
  projectId: string;
  snapshot: ExtensionHostSnapshot;
  commands: RuntimeExtensionCommand[];
  renderHooks: RuntimeExtensionRenderHook[];
  warnings: string[];
  blockedPlugins: ExtensionRuntimeBlockedPlugin[];
}

interface RuntimeExtensionCommand extends ExtensionCommandContribution {
  requiredContribution: ExtensionContribution;
  run(context: RuntimeExtensionCommandContext): {
    result?: unknown;
    warnings?: string[];
  };
}

interface RuntimeExtensionRenderHook extends ExtensionRenderHookContribution {
  requiredContribution: ExtensionContribution;
  run(context: ExtensionRenderHookContext): ExtensionRenderHookResult;
}

interface RuntimeExtensionCommandContext {
  manifest: EditorPluginManifest;
  api: DanbiExtensionApi;
  project: EditorProject;
  payload?: unknown;
}

interface RuntimeExtensionFixture {
  pluginId: string;
  entry: string;
  commands: RuntimeExtensionCommand[];
  renderHooks: RuntimeExtensionRenderHook[];
}

interface ReviewedSandboxEffectPreset {
  id: string;
  supportedClipKinds: ClipKind[];
  effect: Pick<ClipEffect, 'type' | 'label' | 'parameters'>;
}

interface ReviewedSandboxEffectParameters {
  parameters: ClipEffect['parameters'];
  overrides: ExtensionRuntimeMetadata;
}

interface ReviewedSandboxTransitionPreset {
  id: string;
  label: string;
  supportedClipKinds: ClipKind[];
  transition: Pick<TimelineTransition, 'type' | 'duration' | 'easing' | 'parameters'>;
}

interface ReviewedSandboxTransitionParameters {
  transition: Pick<TimelineTransition, 'type' | 'duration' | 'easing' | 'parameters'>;
  overrides: ExtensionRuntimeMetadata;
}

export function buildExtensionHostSnapshot(project: EditorProject): ExtensionHostSnapshot {
  return createExtensionRuntime(project).snapshot;
}

export function buildExtensionSandboxHandshakeRequest(
  project: EditorProject,
  pluginId: string,
): ExtensionSandboxHandshakeRequest {
  const plugin = project.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Extension ${pluginId} is not enabled for this project.`);
  }

  return {
    kind: EXTENSION_SANDBOX_HANDSHAKE_REQUEST_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    projectId: project.id,
    plugin,
    requestedApis: plugin.contributes,
  };
}

export function buildExtensionSandboxCommandRequest(
  project: EditorProject,
  pluginId: string,
  command: string,
  payload?: unknown,
): ExtensionSandboxCommandRequest {
  const plugin = project.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Extension ${pluginId} is not enabled for this project.`);
  }

  return {
    kind: EXTENSION_SANDBOX_COMMAND_REQUEST_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    projectId: project.id,
    plugin,
    command,
    payload,
    projectSummary: buildExtensionSandboxProjectSummary(project),
    timeline: buildExtensionSandboxTimelineAnalysisInput(project),
    exports: buildExtensionSandboxExportAnalysisInput(project),
  };
}

export function buildExtensionSandboxProjectSummary(project: EditorProject): ExtensionSandboxProjectSummary {
  return {
    projectId: project.id,
    name: project.name,
    duration: project.duration,
    fps: project.fps,
    width: project.width,
    height: project.height,
    assetCount: project.assets.length,
    trackCount: project.tracks.length,
    clipCount: project.tracks.reduce((total, track) => total + track.clips.length, 0),
    captionCount: project.captions.length,
    markerCount: project.markers.length,
    exportProfileCount: project.exportProfiles.length,
  };
}

export function buildExtensionSandboxExportAnalysisInput(project: EditorProject): ExtensionSandboxExportAnalysisInput {
  const projectSummary = buildExtensionSandboxProjectSummary(project);
  return {
    project: projectSummary,
    profiles: project.exportProfiles.map((profile): ExtensionSandboxExportProfileSummary => {
      const pixelsPerFrame = Math.max(0, profile.width * profile.height);
      return {
        profileId: profile.id,
        label: profile.label,
        purpose: profile.purpose ?? null,
        container: profile.container,
        codec: profile.codec,
        width: profile.width,
        height: profile.height,
        fps: profile.fps,
        videoBitrateMbps: profile.videoBitrateMbps,
        audioBitrateKbps: profile.audioBitrateKbps,
        ffmpegPreset: profile.ffmpegPreset ?? null,
        crf: profile.crf ?? null,
        pixelsPerFrame,
        megapixelsPerSecond: roundSandboxSeconds((pixelsPerFrame * profile.fps) / 1_000_000),
        aspectRatio: profile.height > 0 ? roundSandboxSeconds(profile.width / profile.height) : 0,
        compatibleCodecContainer: isExportProfileCodecContainerCompatible(profile),
        compatibleDimensions: isExportProfileDimensionCompatible(profile),
      };
    }),
  };
}

export function buildExtensionSandboxTimelineAnalysisInput(project: EditorProject): ExtensionSandboxTimelineAnalysisInput {
  const projectSummary = buildExtensionSandboxProjectSummary(project);
  return {
    project: projectSummary,
    tracks: project.tracks.map((track) => {
      const clips = track.clips
        .map((clip): ExtensionSandboxTimelineClipSummary => ({
          clipId: clip.id,
          trackId: track.id,
          kind: clip.kind,
          start: roundSandboxSeconds(clip.start),
          duration: roundSandboxSeconds(clip.duration),
          end: roundSandboxSeconds(clip.start + clip.duration),
          muted: Boolean(clip.muted),
          locked: Boolean(clip.locked),
          effectTypes: Array.from(new Set(clip.effects.map((effect) => effect.type))).sort(),
          effectCount: clip.effects.length,
          keyframeCount: clip.keyframes.length,
          transitionCount: (clip.transitionIn ? 1 : 0) + (clip.transitionOut ? 1 : 0),
          automationTagCount: clip.automationTags.length,
        }))
        .sort((left, right) => left.start - right.start || left.clipId.localeCompare(right.clipId));

      return {
        trackId: track.id,
        name: track.name,
        kind: track.kind,
        muted: track.muted,
        solo: Boolean(track.solo),
        locked: track.locked,
        syncLocked: Boolean(track.syncLocked),
        clipCount: clips.length,
        clips,
        gaps: buildExtensionSandboxTrackGaps(projectSummary.duration, track.id, clips),
      };
    }),
  };
}

export function handleExtensionSandboxHandshakeRequest(value: unknown): ExtensionSandboxHandshakeResponse {
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return buildBlockedExtensionSandboxHandshakeResponse('unknown', [], [], [
      'Sandbox handshake request must be a JSON object.',
    ]);
  }

  const plugin = isRecord(value.plugin) ? value.plugin : undefined;
  const pluginId = typeof plugin?.id === 'string' && plugin.id.trim() ? plugin.id : 'unknown';
  const permissions = readExtensionSandboxPermissions(plugin?.permissions, warnings);
  const declaredApis = readExtensionSandboxContributions(plugin?.contributes, warnings);

  if (value.kind !== EXTENSION_SANDBOX_HANDSHAKE_REQUEST_KIND) {
    return buildBlockedExtensionSandboxHandshakeResponse(pluginId, permissions, declaredApis, [
      `Sandbox handshake kind must be ${EXTENSION_SANDBOX_HANDSHAKE_REQUEST_KIND}.`,
      ...warnings,
    ]);
  }

  if (value.protocolVersion !== EXTENSION_SANDBOX_PROTOCOL_VERSION) {
    return buildBlockedExtensionSandboxHandshakeResponse(pluginId, permissions, declaredApis, [
      `Sandbox handshake protocolVersion must be ${EXTENSION_SANDBOX_PROTOCOL_VERSION}.`,
      ...warnings,
    ]);
  }

  const manifestWarnings = validateExtensionSandboxHandshakeManifest(plugin);
  if (manifestWarnings.length > 0 || warnings.length > 0) {
    return buildBlockedExtensionSandboxHandshakeResponse(pluginId, permissions, declaredApis, [
      ...manifestWarnings,
      ...warnings,
    ]);
  }

  const executableApis = getReviewedSandboxExecutableApis({ permissions, declaredApis, plugin });

  return {
    kind: EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    pluginId,
    accepted: true,
    status: 'manifest-only',
    runtime: 'external-process-handshake',
    codeExecution: executableApis.length > 0
      ? 'reviewed-command-api'
      : 'disabled',
    permissions,
    declaredApis,
    executableApis,
    warnings: [
      executableApis.length > 0
        ? 'External plugin process handshake accepted. Plugin file imports remain disabled; only reviewed sandbox commands are executable.'
        : 'External plugin process handshake accepted, but this manifest does not declare the permission/contribution pair required by reviewed sandbox commands.',
    ],
    reason: executableApis.length > 0
      ? 'Manifest is valid for process-isolated sandbox negotiation and reviewed command execution.'
      : 'Manifest is valid for process-isolated sandbox negotiation; command/effect execution remains disabled.',
  };
}

export function handleExtensionSandboxCommandRequest(value: unknown): ExtensionSandboxCommandResponse {
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return buildBlockedExtensionSandboxCommandResponse('unknown', 'unknown', [], [], [
      'Sandbox command request must be a JSON object.',
    ]);
  }

  const plugin = isRecord(value.plugin) ? value.plugin : undefined;
  const pluginId = typeof plugin?.id === 'string' && plugin.id.trim() ? plugin.id : 'unknown';
  const command = readTrimmedString(value.command) ?? 'unknown';
  const permissions = readExtensionSandboxPermissions(plugin?.permissions, warnings);
  const declaredApis = readExtensionSandboxContributions(plugin?.contributes, warnings);

  if (value.kind !== EXTENSION_SANDBOX_COMMAND_REQUEST_KIND) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, [
      `Sandbox command kind must be ${EXTENSION_SANDBOX_COMMAND_REQUEST_KIND}.`,
      ...warnings,
    ]);
  }

  if (value.protocolVersion !== EXTENSION_SANDBOX_PROTOCOL_VERSION) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, [
      `Sandbox command protocolVersion must be ${EXTENSION_SANDBOX_PROTOCOL_VERSION}.`,
      ...warnings,
    ]);
  }

  const manifestWarnings = validateExtensionSandboxHandshakeManifest(plugin);
  if (manifestWarnings.length > 0 || warnings.length > 0) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, [
      ...manifestWarnings,
      ...warnings,
    ]);
  }

  const customCommand = command === EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND
    ? readReviewedCustomCommandDeclaration(plugin, value.payload)
    : null;
  const requiredContribution = customCommand?.contribution ?? REVIEWED_SANDBOX_COMMAND_REQUIREMENTS.get(command);
  if (!requiredContribution) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, [
      command === EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND
        ? `Reviewed custom sandbox command is not declared: ${readPayloadString(value.payload, 'commandId') ?? 'unknown'}.`
        : `Reviewed sandbox command is not available: ${command}.`,
    ]);
  }

  if (!permissions.includes('project') || !declaredApis.includes(requiredContribution)) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, [
      `Reviewed sandbox command ${command} requires project permission and ${requiredContribution} contribution.`,
    ]);
  }

  const customParameterIssues = customCommand
    ? validateReviewedCustomCommandPayload(customCommand, value.payload)
    : [];
  if (customParameterIssues.length > 0) {
    return buildBlockedExtensionSandboxCommandResponse(pluginId, command, permissions, declaredApis, customParameterIssues);
  }

  const projectSummary = isExtensionSandboxProjectSummary(value.projectSummary)
    ? value.projectSummary
    : {
        projectId: readTrimmedString(value.projectId) ?? 'unknown',
        name: 'Unknown project',
        duration: 0,
        fps: 0,
        width: 0,
        height: 0,
        assetCount: 0,
        trackCount: 0,
        clipCount: 0,
        captionCount: 0,
        markerCount: 0,
        exportProfileCount: 0,
      };

  const result = buildReviewedSandboxCommandResult(command, {
    pluginId,
    plugin,
    permissions,
    declaredApis,
    projectSummary,
    timeline: value.timeline,
    exports: value.exports,
    payload: value.payload,
  });

  return {
    kind: EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    pluginId,
    command,
    handled: true,
    status: 'executed',
    runtime: 'external-process-command',
    codeExecution: 'reviewed-command-api',
    permissions,
    declaredApis,
    executableApis: ['command'],
    result,
    warnings: [
      buildReviewedSandboxCommandWarning(command),
    ],
    reason: buildReviewedSandboxCommandReason(command),
  };
}

export function createExtensionRuntime(project: EditorProject): ExtensionRuntime {
  const manifestsById = new Map(project.plugins.map((plugin) => [plugin.id, plugin]));
  const builtinFixtures = createBuiltinExtensionFixtures();
  const builtinPluginIds = new Set(builtinFixtures.map((fixture) => fixture.pluginId));
  const blockedPluginReasons = new Map<string, string>();
  const warnings: string[] = [];
  const blockedPlugins: ExtensionRuntimeBlockedPlugin[] = [];
  const fixtures = builtinFixtures.flatMap((fixture) => {
    const manifest = manifestsById.get(fixture.pluginId);
    if (!manifest) {
      return [];
    }

    const entryBlockReason = getBuiltinExtensionEntryBlockReason(fixture, manifest);
    if (entryBlockReason) {
      blockedPluginReasons.set(manifest.id, entryBlockReason);
      blockedPlugins.push({ pluginId: manifest.id, reason: entryBlockReason });
      warnings.push(entryBlockReason);
      return [];
    }

    return [{ fixture, manifest }];
  });

  for (const plugin of project.plugins) {
    const isBuiltinPlugin = builtinPluginIds.has(plugin.id);
    const signature = buildExtensionSandboxSignaturePolicy(plugin, { builtin: isBuiltinPlugin });
    if (!isBuiltinPlugin && isExtensionSandboxSignatureBlocking(signature)) {
      blockedPluginReasons.set(plugin.id, signature.reason);
      blockedPlugins.push({ pluginId: plugin.id, reason: signature.reason });
      warnings.push(signature.reason);
      continue;
    }

    if (!isBuiltinPlugin) {
      const executableApis = getReviewedSandboxExecutableApis({
        permissions: plugin.permissions,
        declaredApis: plugin.contributes,
        plugin,
      });
      warnings.push(executableApis.length > 0
        ? `Extension ${plugin.id} is available only through reviewed external sandbox commands. External plugin file imports and render hooks remain disabled.`
        : `Extension ${plugin.id} is declared as an external plugin in the manifest-only sandbox. External plugin code execution is disabled until it declares a reviewed command API contract.`);
    }
  }

  const commands = fixtures.flatMap(({ fixture, manifest }) => (
    fixture.commands.filter((command) => isRuntimeCommandAllowed(manifest, command, warnings))
  ));
  const renderHooks = fixtures
    .flatMap(({ fixture, manifest }) => (
      fixture.renderHooks.filter((hook) => isRuntimeRenderHookAllowed(manifest, hook, warnings))
    ))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const sandboxes = buildExtensionSandboxPolicies(project, {
    builtinPluginIds,
    blockedPluginReasons,
    commandPluginIds: new Set(commands.map((command) => command.sourcePluginId)),
    renderHookPluginIds: new Set(renderHooks.map((hook) => hook.sourcePluginId)),
  });

  return {
    projectId: project.id,
    snapshot: {
      projectId: project.id,
      manifests: project.plugins,
      permissions: Object.fromEntries(project.plugins.map((plugin) => [plugin.id, plugin.permissions])),
      contributes: Object.fromEntries(project.plugins.map((plugin) => [plugin.id, plugin.contributes])),
      sandboxes,
      commands: commands.map(serializeRuntimeCommand),
      renderHooks: renderHooks.map(serializeRuntimeHook),
      warnings,
      blockedPlugins,
    },
    commands,
    renderHooks,
    warnings,
    blockedPlugins,
  };
}

export function createExtensionContext(manifest: EditorPluginManifest, project: EditorProject): DanbiExtensionContext {
  return {
    extensionId: manifest.id,
    projectId: project.id,
    permissions: manifest.permissions,
    timeline: buildTimelineStateSnapshot(project),
  };
}

export function createExtensionApi(manifest: EditorPluginManifest, project: EditorProject): DanbiExtensionApi {
  const context = createExtensionContext(manifest, project);

  return {
    apiVersion: 1,
    context,
    hasPermission: (permission) => context.permissions.includes(permission),
  };
}

export function assertExtensionPermission(manifest: EditorPluginManifest, permission: ExtensionPermission): void {
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`Extension ${manifest.id} requires ${permission} permission.`);
  }
}

export function invokeExtensionCommand(project: EditorProject, request: ExtensionInvocationRequest): ExtensionInvocationResult {
  const runtime = createExtensionRuntime(project);
  const manifest = project.plugins.find((plugin) => plugin.id === request.extensionId);

  if (!manifest) {
    return buildUnhandledExtensionInvocationResult(request, [`Extension ${request.extensionId} is not enabled for this project.`]);
  }

  const command = runtime.commands.find((candidate) => (
    candidate.sourcePluginId === request.extensionId && candidate.id === request.command
  ));

  if (!command) {
    return buildUnhandledExtensionInvocationResult(request, [
      `Command ${request.command} is not registered by extension ${request.extensionId}.`,
      ...findRuntimeWarningsForExtension(runtime, request.extensionId),
    ]);
  }

  try {
    if (command.permission) {
      assertExtensionPermission(manifest, command.permission);
    }

    const response = command.run({
      manifest,
      api: createExtensionApi(manifest, project),
      project,
      payload: request.payload,
    });

    return {
      extensionId: request.extensionId,
      command: request.command,
      handled: true,
      result: response.result,
      warnings: response.warnings ?? [],
    };
  } catch (error) {
    return {
      extensionId: request.extensionId,
      command: request.command,
      handled: false,
      warnings: [(error as Error).message],
    };
  }
}

export function invokeExtensionCommandRequest(request: ExtensionInvocationRequest): ExtensionInvocationResult {
  if (!request.project) {
    return buildUnhandledExtensionInvocationResult(request, [
      'Extension invocation requires a project snapshot so permissions, commands, and timeline state can be resolved.',
    ]);
  }

  return invokeExtensionCommand(request.project, request);
}

export function runExtensionRenderHooks(context: ExtensionRenderHookContext): ExtensionRenderHookRunResult {
  const runtime = createExtensionRuntime(context.project);
  const event: ExtensionRenderHookEvent = 'before-render';
  const hooks = runtime.renderHooks.filter((hook) => hook.event === event);
  const results = hooks.map((hook) => runRuntimeRenderHook(hook, context));
  const metadata = Object.fromEntries(results.map((result) => [result.hookId, result.metadata]));

  return {
    projectId: context.project.id,
    profileId: context.profileId,
    event,
    handledHookCount: results.filter((result) => result.handled).length,
    hooks: results,
    warnings: [...runtime.warnings, ...results.flatMap((result) => result.warnings)],
    metadata,
  };
}

function createBuiltinExtensionFixtures(): RuntimeExtensionFixture[] {
  return [
    createComfyUiBridgeFixture(),
    createFfmpegRendererFixture(),
  ];
}

function createComfyUiBridgeFixture(): RuntimeExtensionFixture {
  return {
    pluginId: 'plugin-comfyui-bridge',
    entry: 'plugins/comfyui-bridge/index.ts',
    commands: [
      {
        id: 'danbi.comfyui.inspectAutomationContext',
        title: 'Inspect ComfyUI Automation Context',
        description: 'Summarize ComfyUI automation rules, before-export hooks, and workflow bindings.',
        category: 'automation',
        sourcePluginId: 'plugin-comfyui-bridge',
        requiredContribution: 'automation',
        permission: 'project',
        run: ({ project }) => {
          const beforeExportRules = project.automation.filter((rule) => rule.trigger === 'before-export');
          const comfyRules = beforeExportRules.filter((rule) => rule.provider === 'comfyui');
          const workflowNames = uniqueStrings(comfyRules.map((rule) => rule.workflowName).filter(Boolean));

          return {
            result: {
              projectId: project.id,
              beforeExportRuleCount: beforeExportRules.length,
              comfyuiBeforeExportRuleCount: comfyRules.length,
              workflowNames,
              targetTrackIds: uniqueStrings(comfyRules.flatMap((rule) => rule.targetTrackIds)),
            },
            warnings: comfyRules.length > 0 && workflowNames.length === 0
              ? ['ComfyUI before-export rules are present but no workflowName is configured.']
              : [],
          };
        },
      },
    ],
    renderHooks: [
      {
        id: 'danbi.comfyui.beforeRender',
        event: 'before-render',
        title: 'ComfyUI before-render automation audit',
        description: 'Checks before-export ComfyUI rules before a render job starts.',
        sourcePluginId: 'plugin-comfyui-bridge',
        requiredContribution: 'automation',
        permission: 'project',
        priority: 20,
        run: (context) => {
          const beforeExportRules = context.project.automation.filter((rule) => rule.trigger === 'before-export');
          const comfyRules = beforeExportRules.filter((rule) => rule.provider === 'comfyui');
          const missingWorkflowRules = comfyRules.filter((rule) => !rule.workflowName);

          return {
            hookId: 'danbi.comfyui.beforeRender',
            extensionId: 'plugin-comfyui-bridge',
            event: 'before-render',
            handled: true,
            warnings: missingWorkflowRules.map((rule) => `ComfyUI before-export rule "${rule.name}" has no workflowName.`),
            metadata: {
              beforeExportRuleCount: beforeExportRules.length,
              comfyuiBeforeExportRuleCount: comfyRules.length,
              workflowNames: uniqueStrings(comfyRules.map((rule) => rule.workflowName).filter(Boolean)),
              targetTrackIds: uniqueStrings(comfyRules.flatMap((rule) => rule.targetTrackIds)),
            },
          };
        },
      },
    ],
  };
}

function createFfmpegRendererFixture(): RuntimeExtensionFixture {
  return {
    pluginId: 'plugin-ffmpeg-renderer',
    entry: 'plugins/ffmpeg-renderer/index.ts',
    commands: [
      {
        id: 'danbi.ffmpeg.inspectRenderContext',
        title: 'Inspect FFmpeg Render Context',
        description: 'Summarize export profiles, timeline density, and render hook readiness.',
        category: 'render',
        sourcePluginId: 'plugin-ffmpeg-renderer',
        requiredContribution: 'exporter',
        permission: 'render',
        run: ({ project, payload }) => {
          const payloadObject = readPayloadObject(payload);
          const selectedProfileId = typeof payloadObject.profileId === 'string' ? payloadObject.profileId : project.exportProfiles[0]?.id;
          const counts = countRenderableTimelineClips(project);

          return {
            result: {
              projectId: project.id,
              selectedProfileId,
              profileIds: project.exportProfiles.map((profile) => profile.id),
              profileCount: project.exportProfiles.length,
              visualClipCount: counts.visualClipCount,
              audioClipCount: counts.audioClipCount,
              supportsBeforeRenderHook: true,
            },
          };
        },
      },
    ],
    renderHooks: [
      {
        id: 'danbi.ffmpeg.beforeRender',
        event: 'before-render',
        title: 'FFmpeg before-render validation',
        description: 'Checks the selected export profile and timeline before FFmpeg is planned or queued.',
        sourcePluginId: 'plugin-ffmpeg-renderer',
        requiredContribution: 'exporter',
        permission: 'render',
        priority: 10,
        run: (context) => {
          const profile = context.project.exportProfiles.find((candidate) => candidate.id === context.profileId);
          const counts = countRenderableTimelineClips(context.project);
          const warnings = [
            ...(!profile ? [`Export profile not found for render hook: ${context.profileId}.`] : []),
            ...(counts.visualClipCount + counts.audioClipCount === 0 ? ['Timeline has no renderable clips.'] : []),
          ];

          return {
            hookId: 'danbi.ffmpeg.beforeRender',
            extensionId: 'plugin-ffmpeg-renderer',
            event: 'before-render',
            handled: true,
            warnings,
            metadata: {
              outputPath: context.outputPath ?? null,
              outputFilename: context.outputFilename ?? null,
              encoderPreference: context.encoderPreference ?? 'auto',
              exportRangeStart: context.exportRange?.start ?? null,
              exportRangeEnd: context.exportRange?.end ?? null,
              profileLabel: profile?.label ?? null,
              container: profile?.container ?? null,
              codec: profile?.codec ?? null,
              visualClipCount: counts.visualClipCount,
              audioClipCount: counts.audioClipCount,
              dryRun: Boolean(context.dryRun),
            },
          };
        },
      },
    ],
  };
}

function runRuntimeRenderHook(
  hook: RuntimeExtensionRenderHook,
  context: ExtensionRenderHookContext,
): ExtensionRenderHookResult {
  const manifest = context.project.plugins.find((plugin) => plugin.id === hook.sourcePluginId);

  if (!manifest) {
    return {
      hookId: hook.id,
      extensionId: hook.sourcePluginId,
      event: hook.event,
      handled: false,
      warnings: [`Extension ${hook.sourcePluginId} is not enabled for this project.`],
      metadata: {},
    };
  }

  try {
    if (hook.permission) {
      assertExtensionPermission(manifest, hook.permission);
    }

    return hook.run(context);
  } catch (error) {
    return {
      hookId: hook.id,
      extensionId: hook.sourcePluginId,
      event: hook.event,
      handled: false,
      warnings: [(error as Error).message],
      metadata: {
        error: (error as Error).message,
      },
    };
  }
}

function serializeRuntimeCommand(command: RuntimeExtensionCommand): ExtensionCommandContribution {
  const { run: _run, requiredContribution: _requiredContribution, ...serialized } = command;
  return serialized;
}

function serializeRuntimeHook(hook: RuntimeExtensionRenderHook): ExtensionRenderHookContribution {
  const { run: _run, requiredContribution: _requiredContribution, ...serialized } = hook;
  return serialized;
}

function getBuiltinExtensionEntryBlockReason(
  fixture: RuntimeExtensionFixture,
  manifest: EditorPluginManifest,
): string | undefined {
  if (manifest.entry.trim() !== fixture.entry) {
    return `Extension ${manifest.id} was blocked because entry "${manifest.entry}" does not match the registered built-in entry "${fixture.entry}". External plugin loading is disabled.`;
  }

  return undefined;
}

function buildExtensionSandboxSignaturePolicy(
  plugin: EditorPluginManifest | Record<string, unknown>,
  options: { builtin: boolean },
): ExtensionSandboxSignaturePolicy {
  const verification = verifyPluginManifestSignature(plugin);
  if (options.builtin && verification.status === 'unsigned') {
    return {
      status: 'not-required',
      trustLevel: 'none',
      algorithm: verification.algorithm,
      keyId: verification.keyId,
      signedAt: verification.signedAt,
      manifestFingerprint: verification.manifestFingerprint,
      computedFingerprint: verification.computedFingerprint,
      signatureValue: verification.signatureValue,
      signingKeyFingerprint: verification.signingKeyFingerprint,
      signingKeyLabel: verification.signingKeyLabel,
      signingKeyStatus: verification.signingKeyStatus ?? null,
      signingKeyValidFrom: verification.signingKeyValidFrom ?? null,
      signingKeyValidUntil: verification.signingKeyValidUntil ?? null,
      signingKeyReplacementKeyId: verification.signingKeyReplacementKeyId ?? null,
      reason: 'Built-in fixture manifest is verified through the registered runtime fixture contract.',
    };
  }

  return {
    status: verification.status,
    trustLevel: verification.trustLevel,
    algorithm: verification.algorithm,
    keyId: verification.keyId,
    signedAt: verification.signedAt,
    manifestFingerprint: verification.manifestFingerprint,
    computedFingerprint: verification.computedFingerprint,
    signatureValue: verification.signatureValue,
    signingKeyFingerprint: verification.signingKeyFingerprint,
    signingKeyLabel: verification.signingKeyLabel,
    signingKeyStatus: verification.signingKeyStatus ?? null,
    signingKeyValidFrom: verification.signingKeyValidFrom ?? null,
    signingKeyValidUntil: verification.signingKeyValidUntil ?? null,
    signingKeyReplacementKeyId: verification.signingKeyReplacementKeyId ?? null,
    reason: verification.reason,
  };
}

function isExtensionSandboxSignatureBlocking(signature: ExtensionSandboxSignaturePolicy): boolean {
  return EXTENSION_SANDBOX_BLOCKING_SIGNATURE_STATUSES.has(signature.status as PluginManifestSignatureStatus);
}

function buildExtensionSandboxExporterWriterPolicies(plugin: EditorPluginManifest): ExtensionSandboxExporterWriterPolicy[] {
  const writers = Array.isArray(plugin.exporterWriters) ? plugin.exporterWriters.slice(0, 16) : [];
  return writers.map((writer, index): ExtensionSandboxExporterWriterPolicy => {
    const writerId = readTrimmedString(writer.id) ?? `writer-${index + 1}`;
    const label = readTrimmedString(writer.label) ?? writerId;
    const executable = readTrimmedString(writer.executable) ?? '';
    const args = Array.isArray(writer.args)
      ? writer.args.filter((arg): arg is string => typeof arg === 'string')
      : [];
    const cwd = readTrimmedString(writer.cwd) ?? null;
    const trust = EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST.includes(writer.trust ?? 'prompt')
      ? writer.trust ?? 'prompt'
      : 'prompt';
    const timeoutMs = typeof writer.timeoutMs === 'number' && Number.isInteger(writer.timeoutMs)
      ? Math.max(1000, Math.min(10 * 60 * 1000, writer.timeoutMs))
      : null;
    const runtimePackage = readExtensionSandboxExporterWriterRuntimePackage(writer.runtimePackage);
    const hasExporterContribution = plugin.contributes.includes('exporter');
    const fingerprint = buildPluginExporterWriterTrustFingerprint({
      id: writerId,
      executable,
      args,
      cwd,
      runtimePackage: writer.runtimePackage,
      timeoutMs,
    });
    const trustFingerprint = readTrimmedString(writer.trustFingerprint) ?? null;
    const trustHistory = readExtensionSandboxExporterWriterTrustHistory(writer.trustHistory);
    const latestTrustDecision = trustHistory[trustHistory.length - 1] ?? null;
    const approvalStatus: ExtensionSandboxExporterWriterPolicy['approvalStatus'] = trust === 'trusted'
      ? trustFingerprint === fingerprint
        ? 'current'
        : trustFingerprint
          ? 'stale'
          : 'missing'
      : 'not-required';
    const status: ExtensionSandboxExporterWriterPolicy['status'] = !hasExporterContribution || trust === 'blocked'
      ? 'blocked'
      : trust === 'trusted' && approvalStatus === 'current'
        ? 'trusted'
        : 'approval-required';
    const reason = !hasExporterContribution
      ? 'Exporter writer declarations require the exporter contribution.'
      : trust === 'trusted' && approvalStatus === 'current'
        ? 'Exporter writer is approved for this exact command fingerprint and can be used by explicit handoff runners.'
        : trust === 'trusted' && approvalStatus === 'stale'
          ? 'Exporter writer command changed after approval and requires review before execution.'
          : trust === 'trusted' && approvalStatus === 'missing'
            ? 'Exporter writer is marked trusted but has no approval fingerprint; review it before execution.'
        : trust === 'blocked'
          ? 'Exporter writer is blocked by the project manifest.'
          : 'Exporter writer is declared but requires project/user approval before execution.';

    return {
      writerId,
      label,
      executable,
      args,
      cwd,
      trust,
      status,
      fingerprint,
      trustFingerprint,
      approvalStatus,
      latestTrustDecision,
      trustHistoryCount: trustHistory.length,
      runtimePackage,
      packageStatus: runtimePackage ? 'packaged' : 'not-packaged',
      timeoutMs,
      commandPreview: [executable, ...args].filter(Boolean).join(' '),
      reason,
    };
  });
}

function readExtensionSandboxExporterWriterRuntimePackage(
  value: unknown,
): ExtensionSandboxExporterWriterRuntimePackage | null {
  if (!isRecord(value)) {
    return null;
  }
  const packageId = readTrimmedString(value.packageId);
  const runtime = readTrimmedString(value.runtime);
  const root = readTrimmedString(value.root);
  const entry = readTrimmedString(value.entry);
  if (!packageId || !(runtime === 'native' || runtime === 'node') || !root || !entry) {
    return null;
  }

  return {
    packageId,
    runtime,
    root,
    entry,
    packagedAt: readTrimmedString(value.packagedAt) ?? null,
    files: Array.isArray(value.files)
      ? value.files.filter(isRecord).slice(0, 64).map((file): ExtensionSandboxExporterWriterRuntimePackageFile | null => {
          const filePath = readTrimmedString(file.path);
          if (!filePath) {
            return null;
          }
          return {
            path: filePath,
            sha256: readTrimmedString(file.sha256) ?? null,
            bytes: typeof file.bytes === 'number' && Number.isInteger(file.bytes) ? file.bytes : null,
          };
        }).filter((file): file is ExtensionSandboxExporterWriterRuntimePackageFile => Boolean(file))
      : [],
  };
}

function readExtensionSandboxExporterWriterTrustHistory(value: unknown): ExtensionSandboxExporterWriterTrustAuditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).slice(-32).map((entry): ExtensionSandboxExporterWriterTrustAuditEntry | undefined => {
    const action = readTrimmedString(entry.action);
    const previousTrust = readTrimmedString(entry.previousTrust);
    const nextTrust = readTrimmedString(entry.nextTrust);
    const fingerprint = readTrimmedString(entry.fingerprint);
    const at = readTrimmedString(entry.at);
    const commandPreview = readTrimmedString(entry.commandPreview);
    if (
      !at ||
      !commandPreview ||
      !fingerprint ||
      !(action === 'approved' || action === 'review-required' || action === 'blocked') ||
      !EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST.includes(previousTrust as ExtensionSandboxExporterWriterTrust) ||
      !EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST.includes(nextTrust as ExtensionSandboxExporterWriterTrust)
    ) {
      return undefined;
    }

    return {
      at,
      action,
      previousTrust: previousTrust as ExtensionSandboxExporterWriterTrust,
      nextTrust: nextTrust as ExtensionSandboxExporterWriterTrust,
      fingerprint,
      commandPreview,
      source: readTrimmedString(entry.source) ?? null,
    };
  }).filter((entry): entry is ExtensionSandboxExporterWriterTrustAuditEntry => Boolean(entry));
}

function buildExtensionSandboxPolicies(
  project: EditorProject,
  options: {
    builtinPluginIds: Set<string>;
    blockedPluginReasons: Map<string, string>;
    commandPluginIds: Set<string>;
    renderHookPluginIds: Set<string>;
  },
): ExtensionSandboxPolicy[] {
  return project.plugins.map((plugin) => {
    const exporterWriters = buildExtensionSandboxExporterWriterPolicies(plugin);
    const isBuiltinPlugin = options.builtinPluginIds.has(plugin.id);
    const signature = buildExtensionSandboxSignaturePolicy(plugin, { builtin: isBuiltinPlugin });
    const signatureBlockReason = !isBuiltinPlugin && isExtensionSandboxSignatureBlocking(signature)
      ? signature.reason
      : undefined;
    const blockedReason = options.blockedPluginReasons.get(plugin.id) ?? signatureBlockReason;
    if (blockedReason) {
      return {
        pluginId: plugin.id,
        entry: plugin.entry,
        status: 'blocked',
        runtime: 'blocked',
        permissions: plugin.permissions,
        declaredApis: plugin.contributes,
        executableApis: [],
        signature,
        exporterWriters,
        reason: blockedReason,
      };
    }

    if (isBuiltinPlugin) {
      const executableApis: ExtensionSandboxPolicy['executableApis'] = [
        ...(options.commandPluginIds.has(plugin.id) ? ['command' as const] : []),
        ...(options.renderHookPluginIds.has(plugin.id) ? ['render-hook' as const] : []),
        ...(exporterWriters.some((writer) => writer.status === 'trusted') ? ['exporter-writer' as const] : []),
      ];
      return {
        pluginId: plugin.id,
        entry: plugin.entry,
        status: 'trusted-builtin',
        runtime: 'builtin-fixture',
        permissions: plugin.permissions,
        declaredApis: plugin.contributes,
        executableApis,
        signature,
        exporterWriters,
        reason: executableApis.length > 0
          ? 'Registered built-in fixture with manifest-gated permissions and contributions.'
          : 'Built-in fixture is present, but permissions or contributions prevent runtime registration.',
      };
    }

    const externalExecutableApis = getReviewedSandboxExecutableApis({
      permissions: plugin.permissions,
      declaredApis: plugin.contributes,
      plugin,
    });
    const executableApis: ExtensionSandboxPolicy['executableApis'] = [
      ...externalExecutableApis,
      ...(exporterWriters.some((writer) => writer.status === 'trusted') ? ['exporter-writer' as const] : []),
    ];
    return {
      pluginId: plugin.id,
      entry: plugin.entry,
      status: 'manifest-only',
      runtime: executableApis.length > 0 ? 'external-process-command' : 'external-manifest',
      permissions: plugin.permissions,
      declaredApis: plugin.contributes,
      executableApis,
      signature,
      exporterWriters,
      reason: executableApis.length > 0
        ? 'External plugin manifest is enrolled for reviewed process-isolated command execution and trusted exporter-writer execution when declared; plugin file imports remain disabled.'
        : 'External plugin manifest is enrolled for sandbox planning; code execution remains disabled until it declares a reviewed command API contract.',
    };
  });
}

function buildBlockedExtensionSandboxHandshakeResponse(
  pluginId: string,
  permissions: ExtensionPermission[],
  declaredApis: ExtensionContribution[],
  warnings: string[],
): ExtensionSandboxHandshakeResponse {
  return {
    kind: EXTENSION_SANDBOX_HANDSHAKE_RESPONSE_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    pluginId,
    accepted: false,
    status: 'blocked',
    runtime: 'external-process-handshake',
    codeExecution: 'disabled',
    permissions,
    declaredApis,
    executableApis: [],
    warnings,
    reason: warnings[0] ?? 'Sandbox handshake was blocked.',
  };
}

function buildBlockedExtensionSandboxCommandResponse(
  pluginId: string,
  command: string,
  permissions: ExtensionPermission[],
  declaredApis: ExtensionContribution[],
  warnings: string[],
): ExtensionSandboxCommandResponse {
  return {
    kind: EXTENSION_SANDBOX_COMMAND_RESPONSE_KIND,
    protocolVersion: EXTENSION_SANDBOX_PROTOCOL_VERSION,
    pluginId,
    command,
    handled: false,
    status: 'blocked',
    runtime: 'external-process-command',
    codeExecution: 'disabled',
    permissions,
    declaredApis,
    executableApis: [],
    warnings,
    reason: warnings[0] ?? 'Sandbox command was blocked.',
  };
}

function getReviewedSandboxExecutableApis({
  permissions,
  declaredApis,
  plugin,
}: {
  permissions: ExtensionPermission[];
  declaredApis: ExtensionContribution[];
  plugin?: EditorPluginManifest | Record<string, unknown>;
}): ExtensionSandboxExecutableApi[] {
  if (!permissions.includes('project')) {
    return [];
  }

  const reviewedCommandContributions = new Set(REVIEWED_SANDBOX_COMMAND_REQUIREMENTS.values());
  const hasReviewedBuiltInCommand = declaredApis.some((contribution) => reviewedCommandContributions.has(contribution));
  const hasReviewedCustomCommand = hasReviewedCustomCommandContract(plugin, declaredApis);

  return hasReviewedBuiltInCommand || hasReviewedCustomCommand ? ['command'] : [];
}

function hasReviewedCustomCommandContract(
  plugin: EditorPluginManifest | Record<string, unknown> | undefined,
  declaredApis: ExtensionContribution[],
): boolean {
  if (!plugin || !Array.isArray(plugin.customCommands)) {
    return false;
  }

  return plugin.customCommands.some((command) => {
    if (!isRecord(command)) {
      return false;
    }
    const id = readTrimmedString(command.id);
    const label = readTrimmedString(command.label);
    const contribution = readTrimmedString(command.contribution);
    const kind = readTrimmedString(command.kind);

    return Boolean(
      id &&
      label &&
      contribution &&
      kind &&
      (EXTENSION_SANDBOX_CUSTOM_COMMAND_CONTRIBUTIONS as readonly string[]).includes(contribution) &&
      (EXTENSION_SANDBOX_CUSTOM_COMMAND_KINDS as readonly string[]).includes(kind) &&
      declaredApis.includes(contribution as ExtensionContribution),
    );
  });
}

function buildReviewedSandboxCommandResult(
  command: string,
  options: {
    pluginId: string;
    plugin: Record<string, unknown> | undefined;
    permissions: ExtensionPermission[];
    declaredApis: ExtensionContribution[];
    projectSummary: ExtensionSandboxProjectSummary;
    timeline: unknown;
    exports: unknown;
    payload: unknown;
  },
): ExtensionRuntimeMetadata {
  if (command === EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND) {
    return buildReviewedTimelineAnalyzerResult(options.timeline, options.payload);
  }

  if (command === EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND) {
    return buildReviewedExportAnalyzerResult(options.exports, options.payload);
  }

  if (command === EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND) {
    return buildReviewedExportOutputManifestResult(options.pluginId, options.projectSummary, options.exports, options.payload, {
      command,
      defaultDryRun: true,
      materialization: 'plan-only',
      plugin: options.plugin,
    });
  }

  if (command === EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND) {
    return buildReviewedExportOutputManifestResult(options.pluginId, options.projectSummary, options.exports, options.payload, {
      command,
      defaultDryRun: false,
      materialization: 'electron-main-handoff-writer',
      plugin: options.plugin,
    });
  }

  if (command === EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND) {
    return buildReviewedEffectPlanResult(options.timeline, options.payload);
  }

  if (command === EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND) {
    return buildReviewedTransitionPlanResult(options.timeline, options.payload);
  }

  if (command === EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND) {
    return buildReviewedCustomCommandResult(options.plugin, options.projectSummary, options.timeline, options.exports, options.payload);
  }

  return buildReviewedManifestInspectResult({
    pluginId: options.pluginId,
    plugin: options.plugin,
    permissions: options.permissions,
    declaredApis: options.declaredApis,
    projectSummary: options.projectSummary,
    payload: options.payload,
  });
}

function buildReviewedSandboxCommandWarning(command: string): string {
  if (command === EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND) {
    return 'Reviewed external analyzer command executed on a sanitized timeline snapshot without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND) {
    return 'Reviewed external exporter command executed on sanitized export profile data without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND) {
    return 'Reviewed external exporter command produced output manifests from sanitized export profile data without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND) {
    return 'Reviewed external exporter command produced safe handoff manifests for Electron main materialization without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND) {
    return 'Reviewed external effect command produced a validated effect plan from a sanitized timeline snapshot without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND) {
    return 'Reviewed external transition command produced a validated transition plan from a sanitized timeline snapshot without importing the plugin entry file.';
  }

  if (command === EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND) {
    return 'Reviewed external custom command executed from manifest-declared metadata on sanitized project data without importing the plugin entry file.';
  }

  return 'Reviewed sandbox command executed without importing the external plugin entry file.';
}

function buildReviewedSandboxCommandReason(command: string): string {
  if (command === EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND) {
    return 'Reviewed external analyzer completed inside the process-isolated sandbox runner.';
  }

  if (command === EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND) {
    return 'Reviewed external exporter completed inside the process-isolated sandbox runner.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND) {
    return 'Reviewed external exporter output manifest planning completed inside the process-isolated sandbox runner.';
  }

  if (command === EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND) {
    return 'Reviewed external exporter handoff planning completed inside the process-isolated sandbox runner; filesystem writes are limited to Electron main safe-output materialization.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND) {
    return 'Reviewed external effect plan completed inside the process-isolated sandbox runner.';
  }

  if (command === EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND) {
    return 'Reviewed external transition plan completed inside the process-isolated sandbox runner.';
  }

  if (command === EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND) {
    return 'Reviewed external custom command completed inside the process-isolated sandbox runner using its manifest declaration.';
  }

  return 'Reviewed external command completed inside the process-isolated sandbox runner.';
}

function buildReviewedManifestInspectResult({
  pluginId,
  plugin,
  permissions,
  declaredApis,
  projectSummary,
  payload,
}: {
  pluginId: string;
  plugin: Record<string, unknown> | undefined;
  permissions: ExtensionPermission[];
  declaredApis: ExtensionContribution[];
  projectSummary: ExtensionSandboxProjectSummary;
  payload: unknown;
}): ExtensionRuntimeMetadata {
  return {
    pluginId,
    name: readTrimmedString(plugin?.name) ?? 'Unknown plugin',
    version: readTrimmedString(plugin?.version) ?? '0.0.0',
    entry: readTrimmedString(plugin?.entry) ?? '',
    permissions,
    declaredApis,
    project: {
      projectId: projectSummary.projectId,
      name: projectSummary.name,
      duration: projectSummary.duration,
      fps: projectSummary.fps,
      width: projectSummary.width,
      height: projectSummary.height,
      assetCount: projectSummary.assetCount,
      trackCount: projectSummary.trackCount,
      clipCount: projectSummary.clipCount,
      captionCount: projectSummary.captionCount,
      markerCount: projectSummary.markerCount,
      exportProfileCount: projectSummary.exportProfileCount,
    },
    payloadKeys: Object.keys(readPayloadObject(payload)),
  };
}

function buildReviewedCustomCommandResult(
  plugin: Record<string, unknown> | undefined,
  projectSummary: ExtensionSandboxProjectSummary,
  timeline: unknown,
  exports: unknown,
  payload: unknown,
): ExtensionRuntimeMetadata {
  const declaration = readReviewedCustomCommandDeclaration(plugin, payload);
  if (!declaration) {
    return {
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      status: 'blocked',
      findings: [{
        severity: 'error',
        code: 'custom-command-not-declared',
        message: 'The requested custom command is not declared by the plugin manifest.',
      }],
    };
  }

  const parameterValues = readReviewedCustomCommandParameterValues(declaration, payload);
  const base = {
    command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
    customCommandId: declaration.id,
    label: declaration.label,
    description: declaration.description ?? null,
    contribution: declaration.contribution,
    kind: declaration.kind,
    parameters: parameterValues.values,
    ignoredParameterKeys: parameterValues.ignoredParameterKeys,
    project: {
      projectId: projectSummary.projectId,
      name: projectSummary.name,
      duration: projectSummary.duration,
      fps: projectSummary.fps,
      width: projectSummary.width,
      height: projectSummary.height,
      assetCount: projectSummary.assetCount,
      trackCount: projectSummary.trackCount,
      clipCount: projectSummary.clipCount,
      captionCount: projectSummary.captionCount,
      markerCount: projectSummary.markerCount,
      exportProfileCount: projectSummary.exportProfileCount,
    },
  };

  if (declaration.kind === 'timeline-report') {
    return {
      ...base,
      timelineReport: buildReviewedCustomTimelineReport(timeline, parameterValues.values),
    };
  }

  if (declaration.kind === 'export-report') {
    return {
      ...base,
      exportReport: buildReviewedCustomExportReport(exports, parameterValues.values),
    };
  }

  return {
    ...base,
    projectSummary: {
      editingDensity: projectSummary.duration > 0
        ? roundSandboxSeconds(projectSummary.clipCount / Math.max(1, projectSummary.duration / 60))
        : 0,
      mediaAssetCount: projectSummary.assetCount,
      timelineTrackCount: projectSummary.trackCount,
      annotationCount: projectSummary.captionCount + projectSummary.markerCount,
    },
    findings: [{
      severity: 'info',
      code: 'project-summary-ready',
      message: `Project ${projectSummary.name} was summarized by a manifest-declared custom command.`,
    }],
  };
}

function buildReviewedCustomTimelineReport(
  value: unknown,
  parameters: ExtensionRuntimeMetadata,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxTimelineAnalysisInput(value);
  const includeMuted = parameters.includeMuted !== false;
  const includeLocked = parameters.includeLocked !== false;
  const minGapDurationSeconds = typeof parameters.minGapDurationSeconds === 'number'
    ? parameters.minGapDurationSeconds
    : 1;
  const tracks = input.tracks.map((track) => {
    const clips = track.clips.filter((clip) => (
      (includeMuted || !clip.muted) &&
      (includeLocked || !clip.locked)
    ));
    const gaps = track.gaps.filter((gap) => gap.duration >= minGapDurationSeconds);

    return {
      trackId: track.trackId,
      name: track.name,
      kind: track.kind,
      muted: track.muted,
      locked: track.locked,
      clipCount: clips.length,
      gapCount: gaps.length,
      longestGapDuration: roundSandboxSeconds(Math.max(0, ...gaps.map((gap) => gap.duration))),
      effectCount: clips.reduce((total, clip) => total + clip.effectCount, 0),
      transitionCount: clips.reduce((total, clip) => total + clip.transitionCount, 0),
    };
  });
  const totals = {
    trackCount: tracks.length,
    clipCount: tracks.reduce((total, track) => total + Number(track.clipCount), 0),
    visualTrackCount: tracks.filter((track) => track.kind !== 'audio').length,
    audioTrackCount: tracks.filter((track) => track.kind === 'audio').length,
    gapCount: tracks.reduce((total, track) => total + Number(track.gapCount), 0),
    longestGapDuration: roundSandboxSeconds(Math.max(0, ...tracks.map((track) => Number(track.longestGapDuration)))),
    effectCount: tracks.reduce((total, track) => total + Number(track.effectCount), 0),
    transitionCount: tracks.reduce((total, track) => total + Number(track.transitionCount), 0),
  };

  return {
    request: {
      includeMuted,
      includeLocked,
      minGapDurationSeconds,
    },
    totals,
    tracks,
    findings: [
      ...(totals.gapCount > 0 ? [{
        severity: 'warning',
        code: 'timeline-gaps',
        message: `${totals.gapCount} timeline gaps are at least ${minGapDurationSeconds}s long.`,
      }] : []),
      ...(totals.clipCount === 0 ? [{
        severity: 'warning',
        code: 'no-timeline-clips',
        message: 'No timeline clips matched the custom command filters.',
      }] : []),
    ],
  };
}

function buildReviewedCustomExportReport(
  value: unknown,
  parameters: ExtensionRuntimeMetadata,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxExportAnalysisInput(value);
  const container = typeof parameters.container === 'string' ? parameters.container : null;
  const includeCompatibleProfiles = parameters.includeCompatibleProfiles !== false;
  const profiles = input.profiles.filter((profile) => (
    container ? profile.container === container : true
  ));
  const reports = profiles
    .filter((profile) => includeCompatibleProfiles || !profile.compatibleCodecContainer || !profile.compatibleDimensions)
    .map((profile) => ({
      profileId: profile.profileId,
      label: profile.label,
      purpose: profile.purpose,
      container: profile.container,
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      compatibleCodecContainer: profile.compatibleCodecContainer,
      compatibleDimensions: profile.compatibleDimensions,
      megapixelsPerSecond: profile.megapixelsPerSecond,
    }));
  const totals = {
    allProfileCount: input.profiles.length,
    matchedProfileCount: profiles.length,
    reportedProfileCount: reports.length,
    incompatibleProfileCount: reports.filter((profile) => (
      !profile.compatibleCodecContainer || !profile.compatibleDimensions
    )).length,
  };

  return {
    request: {
      container,
      includeCompatibleProfiles,
    },
    totals,
    profiles: reports,
    findings: [
      ...(profiles.length === 0 ? [{
        severity: 'warning',
        code: 'no-matching-export-profiles',
        message: 'No export profiles matched the custom command filters.',
      }] : []),
      ...(totals.incompatibleProfileCount > 0 ? [{
        severity: 'error',
        code: 'incompatible-export-profiles',
        message: `${totals.incompatibleProfileCount} reported export profiles have compatibility problems.`,
      }] : []),
    ],
  };
}

function readReviewedCustomCommandDeclaration(
  plugin: Record<string, unknown> | undefined,
  payload: unknown,
): EditorPluginCustomCommand | null {
  const commandId = readPayloadString(payload, 'commandId');
  if (!plugin || !commandId || !Array.isArray(plugin.customCommands)) {
    return null;
  }

  const command = plugin.customCommands.find((candidate) => (
    isRecord(candidate) && readTrimmedString(candidate.id) === commandId
  ));
  if (!isRecord(command)) {
    return null;
  }

  const id = readTrimmedString(command.id);
  const label = readTrimmedString(command.label);
  const contribution = readTrimmedString(command.contribution);
  const kind = readTrimmedString(command.kind);
  if (
    !id ||
    !label ||
    !(EXTENSION_SANDBOX_CUSTOM_COMMAND_CONTRIBUTIONS as readonly string[]).includes(String(contribution)) ||
    !(EXTENSION_SANDBOX_CUSTOM_COMMAND_KINDS as readonly string[]).includes(String(kind))
  ) {
    return null;
  }

  return {
    id,
    label,
    description: readTrimmedString(command.description),
    contribution: contribution as EditorPluginCustomCommand['contribution'],
    kind: kind as EditorPluginCustomCommand['kind'],
    parameters: readReviewedCustomCommandParameterDeclarations(command.parameters),
  };
}

function readReviewedCustomCommandParameterDeclarations(value: unknown): EditorPluginParameterSchema[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const keys = new Set<string>();
  return value.slice(0, EXTENSION_SANDBOX_CUSTOM_COMMAND_PARAMETER_LIMIT)
    .map((parameter): EditorPluginParameterSchema | null => {
      if (!isRecord(parameter)) {
        return null;
      }
      const key = readTrimmedString(parameter.key);
      const type = readTrimmedString(parameter.type);
      if (
        !key ||
        keys.has(key) ||
        !(type === 'number' || type === 'string' || type === 'boolean' || type === 'enum')
      ) {
        return null;
      }
      keys.add(key);

      const schema: EditorPluginParameterSchema = {
        key,
        type,
      };
      const label = readTrimmedString(parameter.label);
      if (label) {
        schema.label = label;
      }
      if (typeof parameter.required === 'boolean') {
        schema.required = parameter.required;
      }
      if (type === 'number') {
        if (typeof parameter.min === 'number' && Number.isFinite(parameter.min)) {
          schema.min = parameter.min;
        }
        if (typeof parameter.max === 'number' && Number.isFinite(parameter.max)) {
          schema.max = parameter.max;
        }
      }
      if (type === 'enum' && Array.isArray(parameter.values)) {
        schema.values = Array.from(new Set(parameter.values.filter((item): item is string => (
          typeof item === 'string' && item.trim().length > 0
        )).map((item) => item.trim()))).slice(0, EXTENSION_SANDBOX_CUSTOM_COMMAND_ENUM_VALUE_LIMIT);
      }
      if (
        typeof parameter.defaultValue === 'string' ||
        typeof parameter.defaultValue === 'number' ||
        typeof parameter.defaultValue === 'boolean'
      ) {
        schema.defaultValue = parameter.defaultValue;
      }

      return schema;
    })
    .filter((parameter): parameter is EditorPluginParameterSchema => Boolean(parameter));
}

function validateReviewedCustomCommandPayload(
  declaration: EditorPluginCustomCommand,
  payload: unknown,
): string[] {
  const payloadObject = readPayloadObject(payload);
  const warnings: string[] = [];
  if (!readPayloadString(payload, 'commandId')) {
    warnings.push('Reviewed custom command payload.commandId must be a non-empty string.');
  }
  if (payloadObject.parameters !== undefined && !isRecord(payloadObject.parameters)) {
    warnings.push('Reviewed custom command payload.parameters must be an object when provided.');
    return warnings;
  }

  const parameters = readPayloadNestedObject(payload, 'parameters');
  for (const schema of declaration.parameters ?? []) {
    const value = parameters[schema.key];
    const hasValue = value !== undefined;
    const hasDefault = schema.defaultValue !== undefined;
    const path = `Reviewed custom command parameter ${schema.key}`;
    if (!hasValue) {
      if (schema.required && !hasDefault) {
        warnings.push(`${path} is required.`);
      }
      continue;
    }

    warnings.push(...validateReviewedCustomCommandParameterValue(value, schema, path));
  }

  return warnings;
}

function validateReviewedCustomCommandParameterValue(
  value: unknown,
  schema: EditorPluginParameterSchema,
  path: string,
): string[] {
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [`${path} must be a finite number.`];
    }
    if (schema.min !== undefined && value < schema.min) {
      return [`${path} must be greater than or equal to ${schema.min}.`];
    }
    if (schema.max !== undefined && value > schema.max) {
      return [`${path} must be less than or equal to ${schema.max}.`];
    }
    return [];
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return [`${path} must be a string.`];
    }
    if (schema.required && value.trim().length === 0) {
      return [`${path} must be a non-empty string.`];
    }
    if (value.length > EXTENSION_SANDBOX_CUSTOM_COMMAND_STRING_LIMIT) {
      return [`${path} exceeds the ${EXTENSION_SANDBOX_CUSTOM_COMMAND_STRING_LIMIT} character limit.`];
    }
    return [];
  }

  if (schema.type === 'boolean') {
    return typeof value === 'boolean'
      ? []
      : [`${path} must be a boolean.`];
  }

  if (schema.type === 'enum') {
    if (typeof value !== 'string') {
      return [`${path} must be an enum string.`];
    }
    if (!schema.values?.includes(value)) {
      return [`${path} must be one of: ${(schema.values ?? []).join(', ')}.`];
    }
    return [];
  }

  return [`${path} has an unsupported schema type.`];
}

function readReviewedCustomCommandParameterValues(
  declaration: EditorPluginCustomCommand,
  payload: unknown,
): { values: ExtensionRuntimeMetadata; ignoredParameterKeys: string[] } {
  const parameters = readPayloadNestedObject(payload, 'parameters');
  const declarationKeys = new Set((declaration.parameters ?? []).map((schema) => schema.key));
  const values: ExtensionRuntimeMetadata = {};

  for (const schema of declaration.parameters ?? []) {
    const value = parameters[schema.key] ?? schema.defaultValue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values[schema.key] = value;
    }
  }

  return {
    values,
    ignoredParameterKeys: Object.keys(parameters).filter((key) => !declarationKeys.has(key)).sort(),
  };
}

function buildReviewedExportAnalyzerResult(
  value: unknown,
  payload: unknown,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxExportAnalysisInput(value);
  const targetContainer = readPayloadString(payload, 'container');
  const targetPurpose = readPayloadEnum(payload, 'purpose', undefined, EXTENSION_SANDBOX_EXPORT_PROFILE_PURPOSES);
  const profileIds = readPayloadStringArray(payload, 'profileIds');
  const includeCompatibleProfiles = readPayloadBoolean(payload, 'includeCompatibleProfiles', true);
  const throughputWarningThreshold = readPayloadNumber(payload, 'throughputWarningMegapixelsPerSecond', 500, 1, 5000);
  const minFindingSeverity = readPayloadEnum(payload, 'minFindingSeverity', 'info', EXTENSION_SANDBOX_FINDING_SEVERITIES) ?? 'info';
  const profiles = input.profiles.filter((profile) => (
    (targetContainer ? profile.container === targetContainer : true) &&
    (targetPurpose ? profile.purpose === targetPurpose : true) &&
    (profileIds.length > 0 ? profileIds.includes(profile.profileId) : true)
  ));
  const allProfileReports = profiles.map((profile) => {
    const findings = filterReviewedSandboxFindings([
      ...(!profile.compatibleCodecContainer ? [{
        severity: 'error',
        code: 'incompatible-codec-container',
        message: `${profile.codec} is not compatible with ${profile.container}.`,
      }] : []),
      ...(!profile.compatibleDimensions ? [{
        severity: 'error',
        code: 'incompatible-dimensions',
        message: `${profile.width}x${profile.height} must use even dimensions within the FFmpeg-safe export range.`,
      }] : []),
      ...(profile.megapixelsPerSecond >= throughputWarningThreshold ? [{
        severity: 'info',
        code: 'high-throughput-profile',
        message: `${profile.label} renders ${profile.megapixelsPerSecond} megapixels per second.`,
      }] : []),
    ] as ReviewedSandboxFinding[], minFindingSeverity);

    return {
      profileId: profile.profileId,
      label: profile.label,
      purpose: profile.purpose,
      container: profile.container,
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      videoBitrateMbps: profile.videoBitrateMbps,
      audioBitrateKbps: profile.audioBitrateKbps,
      ffmpegPreset: profile.ffmpegPreset,
      crf: profile.crf,
      pixelsPerFrame: profile.pixelsPerFrame,
      megapixelsPerSecond: profile.megapixelsPerSecond,
      aspectRatio: profile.aspectRatio,
      compatibleCodecContainer: profile.compatibleCodecContainer,
      compatibleDimensions: profile.compatibleDimensions,
      findingCount: findings.length,
      findings,
    };
  });
  const profileReports = includeCompatibleProfiles
    ? allProfileReports
    : allProfileReports.filter((profile) => profile.findingCount > 0);
  const totals = {
    profileCount: profileReports.length,
    allProfileCount: input.profiles.length,
    incompatibleProfileCount: profileReports.filter((profile) => (
      !profile.compatibleCodecContainer || !profile.compatibleDimensions
    )).length,
    incompatibleCodecContainerCount: profileReports.filter((profile) => !profile.compatibleCodecContainer).length,
    incompatibleDimensionCount: profileReports.filter((profile) => !profile.compatibleDimensions).length,
    masterProfileCount: profileReports.filter((profile) => profile.purpose === 'master').length,
    socialProfileCount: profileReports.filter((profile) => profile.purpose === 'social').length,
    proxyProfileCount: profileReports.filter((profile) => profile.purpose === 'proxy').length,
    maxMegapixelsPerSecond: roundSandboxSeconds(Math.max(0, ...profileReports.map((profile) => profile.megapixelsPerSecond))),
  };
  const findings = filterReviewedSandboxFindings([
    ...(profileReports.length === 0 ? [{
      severity: 'warning',
      code: 'no-export-profiles',
      message: targetContainer || targetPurpose || profileIds.length > 0
        ? 'No export profiles matched the requested external exporter analysis scope.'
        : 'No export profiles are available for exporter analysis.',
    }] : []),
    ...(totals.incompatibleCodecContainerCount > 0 ? [{
      severity: 'error',
      code: 'incompatible-codec-container',
      message: `${totals.incompatibleCodecContainerCount} export profiles use a codec/container pairing that FFmpeg planning blocks.`,
    }] : []),
    ...(totals.incompatibleDimensionCount > 0 ? [{
      severity: 'error',
      code: 'incompatible-dimensions',
      message: `${totals.incompatibleDimensionCount} export profiles use dimensions outside the FFmpeg-safe even-dimension range.`,
    }] : []),
  ] as ReviewedSandboxFinding[], minFindingSeverity);

  return {
    command: EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
    request: {
      profileIds,
      container: targetContainer ?? null,
      purpose: targetPurpose ?? null,
      includeCompatibleProfiles,
      throughputWarningMegapixelsPerSecond: throughputWarningThreshold,
      minFindingSeverity,
    },
    coverage: {
      allProfileCount: input.profiles.length,
      matchedProfileCount: profiles.length,
      reportedProfileCount: profileReports.length,
    },
    targetContainer: targetContainer ?? null,
    project: {
      projectId: input.project.projectId,
      name: input.project.name,
      duration: input.project.duration,
      fps: input.project.fps,
      width: input.project.width,
      height: input.project.height,
      exportProfileCount: input.project.exportProfileCount,
    },
    totals,
    profileReports,
    findings,
  };
}

function buildReviewedExportOutputManifestResult(
  pluginId: string,
  projectSummary: ExtensionSandboxProjectSummary,
  value: unknown,
  payload: unknown,
  options: {
    command: typeof EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND | typeof EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND;
    defaultDryRun: boolean;
    materialization: 'plan-only' | 'electron-main-handoff-writer';
    plugin: Record<string, unknown> | undefined;
  },
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxExportAnalysisInput(value);
  const requestedProfileIds = readPayloadStringArray(payload, 'profileIds');
  const includeIncompatibleProfiles = readPayloadBoolean(payload, 'includeIncompatibleProfiles', false);
  const dryRun = readPayloadBoolean(payload, 'dryRun', options.defaultDryRun);
  const outputDirectory = buildSafeExternalExporterOutputDirectory(
    readPayloadString(payload, 'outputDirectory'),
    pluginId,
  );
  const filenamePrefix = buildSafeExternalExporterFilenamePrefix(
    readPayloadString(payload, 'filenamePrefix') ?? projectSummary.name,
  );
  const selectedProfiles = input.profiles.filter((profile) => (
    requestedProfileIds.length > 0 ? requestedProfileIds.includes(profile.profileId) : true
  ));
  const outputManifests = selectedProfiles.flatMap((profile, index) => {
    const issues = [
      ...(!profile.compatibleCodecContainer ? ['incompatible-codec-container'] : []),
      ...(!profile.compatibleDimensions ? ['incompatible-dimensions'] : []),
    ];
    const compatible = issues.length === 0;
    if (!includeIncompatibleProfiles && !compatible) {
      return [];
    }

    const filename = buildSafeExternalExporterOutputFilename(filenamePrefix, profile.profileId, profile.container);
    return [{
      manifestVersion: 1,
      pluginId,
      profileId: profile.profileId,
      label: profile.label,
      purpose: profile.purpose,
      container: profile.container,
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      videoBitrateMbps: profile.videoBitrateMbps,
      audioBitrateKbps: profile.audioBitrateKbps,
      duration: projectSummary.duration,
      estimatedPixelCount: Math.round(profile.pixelsPerFrame * Math.max(0, projectSummary.duration) * Math.max(1, profile.fps)),
      outputDirectory,
      outputFilename: filename,
      outputPath: `${outputDirectory}/${filename}`,
      dryRun,
      status: compatible ? 'ready' : 'blocked',
      issueCount: issues.length,
      issues,
      priority: index + 1,
    }];
  });
  const skippedProfiles = selectedProfiles.filter((profile) => (
    !includeIncompatibleProfiles && (!profile.compatibleCodecContainer || !profile.compatibleDimensions)
  ));
  const findings = filterReviewedSandboxFindings([
    ...(selectedProfiles.length === 0 ? [{
      severity: 'warning',
      code: 'no-export-profiles',
      message: requestedProfileIds.length > 0
        ? 'No export profiles matched the requested external exporter output manifest scope.'
        : 'No export profiles are available for external exporter output manifests.',
    }] : []),
    ...(skippedProfiles.length > 0 ? [{
      severity: 'warning',
      code: 'skipped-incompatible-export-profiles',
      message: `${skippedProfiles.length} incompatible export profiles were skipped by the reviewed exporter output manifest planner.`,
    }] : []),
  ] as ReviewedSandboxFinding[], 'info');

  return {
    command: options.command,
    exporterManifestVersion: 1,
    pluginId,
    materialization: options.materialization,
    exporterWriters: buildReviewedExporterWriterMetadata(options.plugin),
    request: {
      profileIds: requestedProfileIds,
      includeIncompatibleProfiles,
      outputDirectory,
      filenamePrefix,
      dryRun,
    },
    coverage: {
      allProfileCount: input.profiles.length,
      matchedProfileCount: selectedProfiles.length,
      outputManifestCount: outputManifests.length,
      skippedProfileCount: skippedProfiles.length,
    },
    project: {
      projectId: projectSummary.projectId,
      name: projectSummary.name,
      duration: projectSummary.duration,
      fps: projectSummary.fps,
      width: projectSummary.width,
      height: projectSummary.height,
      exportProfileCount: projectSummary.exportProfileCount,
    },
    outputManifests,
    findings,
  };
}

function buildReviewedExporterWriterMetadata(plugin: Record<string, unknown> | undefined): ExtensionRuntimeMetadata[] {
  const writers = Array.isArray(plugin?.exporterWriters) ? plugin.exporterWriters.filter(isRecord).slice(0, 16) : [];
  return writers.map((writer, index): ExtensionRuntimeMetadata => {
    const writerId = readTrimmedString(writer.id) ?? `writer-${index + 1}`;
    const label = readTrimmedString(writer.label) ?? writerId;
    const executable = readTrimmedString(writer.executable) ?? '';
    const args = Array.isArray(writer.args)
      ? writer.args.filter((arg): arg is string => typeof arg === 'string')
      : [];
    const trust = readNestedEnum(writer, 'trust', 'prompt', EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST);
    const cwd = readTrimmedString(writer.cwd) ?? null;
    const timeoutMs = typeof writer.timeoutMs === 'number' && Number.isInteger(writer.timeoutMs)
      ? Math.max(1000, Math.min(10 * 60 * 1000, writer.timeoutMs))
      : null;
    const runtimePackage = readExtensionSandboxExporterWriterRuntimePackage(writer.runtimePackage);
    const fingerprint = buildPluginExporterWriterTrustFingerprint({
      id: writerId,
      executable,
      args,
      cwd,
      runtimePackage: runtimePackage as EditorPluginExporterWriterRuntimePackage | null,
      timeoutMs,
    });
    const trustFingerprint = readTrimmedString(writer.trustFingerprint) ?? null;
    const trustHistory = readExtensionSandboxExporterWriterTrustHistory(writer.trustHistory);
    const latestTrustDecision = trustHistory[trustHistory.length - 1] ?? null;
    const approvalStatus = trust === 'trusted'
      ? trustFingerprint === fingerprint
        ? 'current'
        : trustFingerprint
          ? 'stale'
          : 'missing'
      : 'not-required';
    const status = trust === 'blocked'
      ? 'blocked'
      : trust === 'trusted' && approvalStatus === 'current'
        ? 'trusted'
        : 'approval-required';

    return {
      writerId,
      label,
      executable,
      args,
      cwd,
      trust,
      status,
      fingerprint,
      trustFingerprint,
      approvalStatus,
      latestTrustDecision,
      trustHistoryCount: trustHistory.length,
      runtimePackage,
      packageStatus: runtimePackage ? 'packaged' : 'not-packaged',
      timeoutMs,
    };
  });
}

function buildReviewedEffectPlanResult(
  value: unknown,
  payload: unknown,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxTimelineAnalysisInput(value);
  const presetId = readPayloadString(payload, 'presetId') ?? 'warm-contrast';
  const selectedClipIds = readPayloadStringArray(payload, 'selectedClipIds');
  const targetClipIds = new Set(selectedClipIds);
  const preset = readReviewedEffectPreset(presetId);
  const presetParameters = buildReviewedEffectParameters(preset, payload);
  const plans: ExtensionRuntimeMetadata[] = [];
  const skipped: ExtensionRuntimeMetadata[] = [];

  for (const track of input.tracks) {
    for (const clip of track.clips) {
      if (targetClipIds.size > 0 && !targetClipIds.has(clip.clipId)) {
        continue;
      }

      const skipReason = getEffectPlanSkipReason(track, clip, preset);
      if (skipReason) {
        skipped.push({
          clipId: clip.clipId,
          trackId: track.trackId,
          reason: skipReason,
        });
        continue;
      }

      plans.push({
        clipId: clip.clipId,
        trackId: track.trackId,
        operation: 'upsert-effect',
        replaceMatching: {
          type: preset.effect.type,
          parameterKey: 'externalPresetId',
          parameterValue: preset.id,
        },
        effect: {
          id: `effect-external-${preset.id}-${clip.clipId}`,
          type: preset.effect.type,
          label: preset.effect.label,
          enabled: true,
          parameters: {
            externalPresetId: preset.id,
            ...presetParameters.parameters,
          },
        },
      });
    }
  }

  return {
    command: EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
    presetId: preset.id,
    presetLabel: preset.effect.label,
    parameterOverrides: presetParameters.overrides,
    requestedClipCount: targetClipIds.size,
    plannedEffectCount: plans.length,
    skippedClipCount: skipped.length,
    plans,
    skipped,
    findings: [
      ...(plans.length === 0 ? [{
        severity: 'warning',
        code: 'no-effect-targets',
        message: 'No unlocked visual clips matched the reviewed effect plan request.',
      }] : []),
      ...(skipped.length > 0 ? [{
        severity: 'info',
        code: 'skipped-effect-targets',
        message: `${skipped.length} clips were skipped because they are locked, muted, or unsupported by the reviewed effect preset.`,
      }] : []),
    ],
  };
}

function readReviewedEffectPreset(presetId: string): ReviewedSandboxEffectPreset {
  const presets: Record<string, ReviewedSandboxEffectPreset> = {
    'warm-contrast': {
      id: 'warm-contrast',
      supportedClipKinds: ['video', 'image'],
      effect: {
        type: 'color',
        label: 'External Warm Contrast',
        parameters: {
          brightness: 0.03,
          contrast: 1.08,
          saturation: 1.05,
          temperature: 0.12,
          tint: 0,
        },
      },
    },
    'soft-vignette': {
      id: 'soft-vignette',
      supportedClipKinds: ['video', 'image'],
      effect: {
        type: 'filter',
        label: 'External Soft Vignette',
        parameters: {
          visualEffect: 'vignette-focus',
          vignetteStrength: 0.3,
        },
      },
    },
  };

  return presets[presetId] ?? presets['warm-contrast'];
}

function buildReviewedEffectParameters(
  preset: ReviewedSandboxEffectPreset,
  payload: unknown,
): ReviewedSandboxEffectParameters {
  const overrides = readPayloadNestedObject(payload, 'parameters');
  if (preset.id === 'warm-contrast') {
    const intensity = readNestedNumber(overrides, 'intensity', 1, 0, 2);
    return {
      parameters: {
        brightness: roundSandboxSeconds(0.03 * intensity),
        contrast: roundSandboxSeconds(1 + (1.08 - 1) * intensity),
        saturation: roundSandboxSeconds(1 + (1.05 - 1) * intensity),
        temperature: roundSandboxSeconds(0.12 * intensity),
        tint: 0,
      },
      overrides: { intensity },
    };
  }

  if (preset.id === 'soft-vignette') {
    const vignetteStrength = readNestedNumber(overrides, 'vignetteStrength', 0.3, 0, 1);
    return {
      parameters: {
        ...preset.effect.parameters,
        vignetteStrength,
      },
      overrides: { vignetteStrength },
    };
  }

  return {
    parameters: { ...preset.effect.parameters },
    overrides: {},
  };
}

function getEffectPlanSkipReason(
  track: ExtensionSandboxTimelineTrackSummary,
  clip: ExtensionSandboxTimelineClipSummary,
  preset: ReviewedSandboxEffectPreset,
): string | undefined {
  if (track.locked || clip.locked) {
    return 'Track or clip is locked.';
  }

  if (track.muted || clip.muted) {
    return 'Track or clip is muted.';
  }

  if (!preset.supportedClipKinds.includes(clip.kind)) {
    return `Preset ${preset.id} does not support ${clip.kind} clips.`;
  }

  return undefined;
}

function buildReviewedTransitionPlanResult(
  value: unknown,
  payload: unknown,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxTimelineAnalysisInput(value);
  const presetId = readPayloadString(payload, 'presetId') ?? 'smooth-crossfade';
  const selectedClipIds = readPayloadStringArray(payload, 'selectedClipIds');
  const targetClipIds = new Set(selectedClipIds);
  const preset = readReviewedTransitionPreset(presetId);
  const presetParameters = buildReviewedTransitionParameters(preset, payload);
  const plans: ExtensionRuntimeMetadata[] = [];
  const skipped: ExtensionRuntimeMetadata[] = [];

  for (const track of input.tracks) {
    for (let index = 0; index < track.clips.length; index += 1) {
      const clip = track.clips[index];
      if (targetClipIds.size > 0 && !targetClipIds.has(clip.clipId)) {
        continue;
      }

      const nextClip = track.clips[index + 1];
      const skipReason = getTransitionPlanSkipReason(track, clip, nextClip, preset);
      if (skipReason) {
        skipped.push({
          clipId: clip.clipId,
          trackId: track.trackId,
          nextClipId: nextClip?.clipId ?? null,
          reason: skipReason,
        });
        continue;
      }

      plans.push({
        clipId: clip.clipId,
        trackId: track.trackId,
        nextClipId: nextClip.clipId,
        operation: 'upsert-transition',
        transition: {
          id: `transition-external-${preset.id}-${clip.clipId}`,
          type: presetParameters.transition.type,
          duration: presetParameters.transition.duration,
          easing: presetParameters.transition.easing,
          parameters: {
            externalPresetId: preset.id,
            ...presetParameters.transition.parameters,
          },
        },
      });
    }
  }

  return {
    command: EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
    presetId: preset.id,
    presetLabel: preset.label,
    parameterOverrides: presetParameters.overrides,
    requestedClipCount: targetClipIds.size,
    plannedTransitionCount: plans.length,
    skippedClipCount: skipped.length,
    plans,
    skipped,
    findings: [
      ...(plans.length === 0 ? [{
        severity: 'warning',
        code: 'no-transition-targets',
        message: 'No unlocked adjacent visual clips matched the reviewed transition plan request.',
      }] : []),
      ...(skipped.length > 0 ? [{
        severity: 'info',
        code: 'skipped-transition-targets',
        message: `${skipped.length} clips were skipped because they are locked, muted, unsupported, or have no next same-track clip.`,
      }] : []),
    ],
  };
}

function readReviewedTransitionPreset(presetId: string): ReviewedSandboxTransitionPreset {
  const presets: Record<string, ReviewedSandboxTransitionPreset> = {
    'smooth-crossfade': {
      id: 'smooth-crossfade',
      label: 'External Smooth Crossfade',
      supportedClipKinds: ['video', 'image', 'text', 'effect', 'ai'],
      transition: {
        type: 'crossfade',
        duration: 0.75,
        easing: 'easeInOut',
        parameters: {
          preserveAudio: true,
        },
      },
    },
    'push-left': {
      id: 'push-left',
      label: 'External Push Left',
      supportedClipKinds: ['video', 'image', 'text', 'effect', 'ai'],
      transition: {
        type: 'push',
        duration: 0.65,
        easing: 'easeInOut',
        parameters: {
          preserveAudio: true,
          direction: 'left',
        },
      },
    },
  };

  return presets[presetId] ?? presets['smooth-crossfade'];
}

function buildReviewedTransitionParameters(
  preset: ReviewedSandboxTransitionPreset,
  payload: unknown,
): ReviewedSandboxTransitionParameters {
  const overrides = readPayloadNestedObject(payload, 'parameters');
  const duration = readNestedNumber(overrides, 'duration', preset.transition.duration, 0.05, 5);
  const easing = readNestedEnum(
    overrides,
    'easing',
    preset.transition.easing,
    ['linear', 'easeIn', 'easeOut', 'easeInOut'],
  );
  const preserveAudio = readNestedBoolean(overrides, 'preserveAudio', readBooleanParameter(preset.transition.parameters.preserveAudio, true));
  const direction = (preset.transition.type === 'push' || preset.transition.type === 'wipe')
    ? readNestedEnum(overrides, 'direction', readDirectionParameter(preset.transition.parameters.direction, 'left'), ['left', 'right', 'up', 'down'])
    : undefined;
  const parameters = {
    ...preset.transition.parameters,
    preserveAudio,
    ...(direction ? { direction } : {}),
  };

  return {
    transition: {
      ...preset.transition,
      duration,
      easing,
      parameters,
    },
    overrides: {
      duration,
      easing,
      preserveAudio,
      ...(direction ? { direction } : {}),
    },
  };
}

function getTransitionPlanSkipReason(
  track: ExtensionSandboxTimelineTrackSummary,
  clip: ExtensionSandboxTimelineClipSummary,
  nextClip: ExtensionSandboxTimelineClipSummary | undefined,
  preset: ReviewedSandboxTransitionPreset,
): string | undefined {
  if (!nextClip) {
    return 'Outgoing transition requires a next clip on the same track.';
  }

  if (track.locked || clip.locked || nextClip.locked) {
    return 'Track or clip is locked.';
  }

  if (track.muted || clip.muted || nextClip.muted) {
    return 'Track or clip is muted.';
  }

  if (!preset.supportedClipKinds.includes(clip.kind) || !preset.supportedClipKinds.includes(nextClip.kind)) {
    return `Preset ${preset.id} requires adjacent visual clips.`;
  }

  return undefined;
}

function buildReviewedTimelineAnalyzerResult(
  value: unknown,
  payload: unknown,
): ExtensionRuntimeMetadata {
  const input = readExtensionSandboxTimelineAnalysisInput(value);
  const minGapDuration = readPayloadNumber(payload, 'minGapDurationSeconds', 1, 0.05, 60);
  const scope = readPayloadEnum(payload, 'scope', 'all', EXTENSION_SANDBOX_TIMELINE_ANALYSIS_SCOPES) ?? 'all';
  const trackIds = readPayloadStringArray(payload, 'trackIds');
  const selectedClipIds = Array.from(new Set([
    ...readPayloadStringArray(payload, 'selectedClipIds'),
    ...readPayloadStringArray(payload, 'clipIds'),
  ]));
  const includeMuted = readPayloadBoolean(payload, 'includeMuted', true);
  const includeLocked = readPayloadBoolean(payload, 'includeLocked', true);
  const minFindingSeverity = readPayloadEnum(payload, 'minFindingSeverity', 'info', EXTENSION_SANDBOX_FINDING_SEVERITIES) ?? 'info';
  const scopedTracks = input.tracks.filter((track) => {
    if (trackIds.length > 0 && !trackIds.includes(track.trackId)) {
      return false;
    }
    if (scope === 'visual' && track.kind === 'audio') {
      return false;
    }
    if (scope === 'audio' && track.kind !== 'audio') {
      return false;
    }
    if (scope === 'selected' && selectedClipIds.length > 0 && !track.clips.some((clip) => selectedClipIds.includes(clip.clipId))) {
      return false;
    }
    if (!includeMuted && track.muted) {
      return false;
    }
    if (!includeLocked && track.locked) {
      return false;
    }

    return true;
  });
  const scopedTrackItems = scopedTracks.map((track) => ({
    track,
    clips: track.clips.filter((clip) => {
      if (scope === 'selected' && selectedClipIds.length > 0 && !selectedClipIds.includes(clip.clipId)) {
        return false;
      }
      if (!includeMuted && clip.muted) {
        return false;
      }
      if (!includeLocked && clip.locked) {
        return false;
      }

      return true;
    }),
  })).filter((item) => (
    scope === 'selected' && selectedClipIds.length > 0 ? item.clips.length > 0 : true
  ));
  const trackReports = scopedTrackItems.map(({ track, clips }) => {
    const significantGaps = track.gaps.filter((gap) => gap.duration >= minGapDuration);
    const clipTotals = clips.reduce((totals, clip) => {
      totals.lockedClipCount += clip.locked ? 1 : 0;
      totals.mutedClipCount += clip.muted ? 1 : 0;
      totals.effectCount += clip.effectCount;
      totals.keyframeCount += clip.keyframeCount;
      totals.transitionCount += clip.transitionCount;
      totals.automationTagCount += clip.automationTagCount;
      totals.kindCounts[clip.kind] = (totals.kindCounts[clip.kind] ?? 0) + 1;
      return totals;
    }, {
      lockedClipCount: 0,
      mutedClipCount: 0,
      effectCount: 0,
      keyframeCount: 0,
      transitionCount: 0,
      automationTagCount: 0,
      kindCounts: {} as Record<string, number>,
    });

    return {
      trackId: track.trackId,
      name: track.name,
      kind: track.kind,
      muted: track.muted,
      solo: track.solo,
      locked: track.locked,
      syncLocked: track.syncLocked,
      clipCount: clips.length,
      gapCount: significantGaps.length,
      gapDuration: roundSandboxSeconds(sumDurations(significantGaps)),
      longestGapDuration: roundSandboxSeconds(Math.max(0, ...significantGaps.map((gap) => gap.duration))),
      firstGapStart: significantGaps[0]?.start ?? null,
      lockedClipCount: clipTotals.lockedClipCount,
      mutedClipCount: clipTotals.mutedClipCount,
      effectCount: clipTotals.effectCount,
      keyframeCount: clipTotals.keyframeCount,
      transitionCount: clipTotals.transitionCount,
      automationTagCount: clipTotals.automationTagCount,
      kindCounts: clipTotals.kindCounts,
    };
  });

  const visualReports = trackReports.filter((report) => report.kind !== 'audio');
  const audioReports = trackReports.filter((report) => report.kind === 'audio');
  const totals = {
    trackCount: trackReports.length,
    clipCount: sumNumbers(trackReports.map((report) => report.clipCount)),
    visualGapCount: sumNumbers(visualReports.map((report) => report.gapCount)),
    visualGapDuration: roundSandboxSeconds(sumNumbers(visualReports.map((report) => report.gapDuration))),
    audioGapCount: sumNumbers(audioReports.map((report) => report.gapCount)),
    audioGapDuration: roundSandboxSeconds(sumNumbers(audioReports.map((report) => report.gapDuration))),
    lockedTrackCount: scopedTracks.filter((track) => track.locked).length,
    mutedTrackCount: scopedTracks.filter((track) => track.muted).length,
    lockedClipCount: sumNumbers(trackReports.map((report) => report.lockedClipCount)),
    mutedClipCount: sumNumbers(trackReports.map((report) => report.mutedClipCount)),
    effectCount: sumNumbers(trackReports.map((report) => report.effectCount)),
    transitionCount: sumNumbers(trackReports.map((report) => report.transitionCount)),
  };

  const findings = filterReviewedSandboxFindings([
    ...(totals.visualGapCount > 0 ? [{
      severity: 'info',
      code: 'visual-gaps',
      message: `${totals.visualGapCount} visual timeline gaps are at least ${minGapDuration}s.`,
    }] : []),
    ...(input.project.clipCount === 0 ? [{
      severity: 'warning',
      code: 'empty-timeline',
      message: 'Timeline has no clips to analyze.',
    }] : []),
    ...(totals.lockedTrackCount > 0 || totals.lockedClipCount > 0 ? [{
      severity: 'info',
      code: 'locked-items',
      message: `${totals.lockedTrackCount} tracks and ${totals.lockedClipCount} clips are locked.`,
    }] : []),
  ] as ReviewedSandboxFinding[], minFindingSeverity);

  return {
    command: EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
    minGapDurationSeconds: minGapDuration,
    request: {
      scope,
      trackIds,
      selectedClipIds,
      includeMuted,
      includeLocked,
      minGapDurationSeconds: minGapDuration,
      minFindingSeverity,
    },
    coverage: {
      allTrackCount: input.tracks.length,
      allClipCount: input.project.clipCount,
      matchedTrackCount: scopedTracks.length,
      analyzedTrackCount: trackReports.length,
      analyzedClipCount: totals.clipCount,
    },
    project: {
      projectId: input.project.projectId,
      name: input.project.name,
      duration: input.project.duration,
      fps: input.project.fps,
      width: input.project.width,
      height: input.project.height,
      assetCount: input.project.assetCount,
      trackCount: input.project.trackCount,
      clipCount: input.project.clipCount,
      captionCount: input.project.captionCount,
      markerCount: input.project.markerCount,
      exportProfileCount: input.project.exportProfileCount,
    },
    totals,
    trackReports,
    findings,
  };
}

function buildExtensionSandboxTrackGaps(
  projectDuration: number,
  trackId: string,
  clips: ExtensionSandboxTimelineClipSummary[],
): ExtensionSandboxTimelineGapSummary[] {
  const gaps: ExtensionSandboxTimelineGapSummary[] = [];
  let cursor = 0;
  for (const clip of clips) {
    if (clip.start > cursor + 0.001) {
      gaps.push({
        trackId,
        start: roundSandboxSeconds(cursor),
        end: roundSandboxSeconds(clip.start),
        duration: roundSandboxSeconds(clip.start - cursor),
      });
    }
    cursor = Math.max(cursor, clip.end);
  }

  if (projectDuration > cursor + 0.001) {
    gaps.push({
      trackId,
      start: roundSandboxSeconds(cursor),
      end: roundSandboxSeconds(projectDuration),
      duration: roundSandboxSeconds(projectDuration - cursor),
    });
  }

  return gaps.filter((gap) => gap.duration > 0);
}

function validateExtensionSandboxHandshakeManifest(plugin: Record<string, unknown> | undefined): string[] {
  if (!plugin) {
    return ['Sandbox handshake plugin manifest must be an object.'];
  }

  return [
    ...(!readTrimmedString(plugin.id) ? ['Plugin id must be a non-empty string.'] : []),
    ...(!readTrimmedString(plugin.name) ? ['Plugin name must be a non-empty string.'] : []),
    ...(!readTrimmedString(plugin.version) ? ['Plugin version must be a non-empty string.'] : []),
    ...(!isSafeExtensionPluginEntry(plugin.entry) ? ['Plugin entry must be a safe relative path under plugins/.'] : []),
    ...(!Array.isArray(plugin.permissions) ? ['Plugin permissions must be an array.'] : []),
    ...(!Array.isArray(plugin.contributes) ? ['Plugin contributes must be an array.'] : []),
    ...validateExtensionSandboxPluginSignature(plugin),
    ...validateExtensionSandboxComfyUIWorkflows(plugin.comfyUIWorkflows, plugin.permissions, plugin.contributes),
    ...validateExtensionSandboxCustomCommandDeclarations(plugin.customCommands, plugin.contributes),
    ...validateExtensionSandboxExporterWriterDeclarations(plugin.exporterWriters, plugin.contributes),
  ];
}

function validateExtensionSandboxPluginSignature(plugin: Record<string, unknown>): string[] {
  if (plugin.signature === undefined) {
    return [];
  }
  if (!isRecord(plugin.signature)) {
    return ['Plugin signature must be an object.'];
  }

  const signature = plugin.signature;
  const warnings = [
    ...(
      readTrimmedString(signature.algorithm) !== PLUGIN_MANIFEST_SIGNATURE_ALGORITHM &&
      readTrimmedString(signature.algorithm) !== PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM
        ? [`Plugin signature.algorithm must be ${PLUGIN_MANIFEST_SIGNATURE_ALGORITHM} or ${PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM}.`]
        : []
    ),
    ...(!readTrimmedString(signature.keyId)
      ? ['Plugin signature.keyId must be a non-empty string.']
      : []),
    ...(
      typeof signature.manifestFingerprint !== 'string' ||
      signature.manifestFingerprint.includes('\0') ||
      !PLUGIN_MANIFEST_SIGNATURE_FINGERPRINT_PATTERN.test(signature.manifestFingerprint)
        ? ['Plugin signature.manifestFingerprint must be a manifest-v1 SHA-256 fingerprint string.']
        : []
    ),
    ...(signature.signedAt !== undefined && typeof signature.signedAt !== 'string'
      ? ['Plugin signature.signedAt must be a string.']
      : []),
    ...(
      signature.algorithm === PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM &&
      (
        typeof signature.signatureValue !== 'string' ||
        signature.signatureValue.includes('\0') ||
        !PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PATTERN.test(signature.signatureValue)
      )
        ? ['Plugin signature.signatureValue must be a rsa-sha256-v1 signature string.']
        : []
    ),
    ...(
      signature.algorithm !== PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM &&
      signature.signatureValue !== undefined
        ? [`Plugin signature.signatureValue requires ${PLUGIN_MANIFEST_RSA_SIGNATURE_ALGORITHM}.`]
        : []
    ),
  ];
  if (warnings.length > 0) {
    return warnings;
  }

  const verification = verifyPluginManifestSignature(plugin);
  return isExtensionSandboxSignatureBlocking(buildExtensionSandboxSignaturePolicy(plugin, { builtin: false }))
    ? [verification.reason]
    : [];
}

function validateExtensionSandboxComfyUIWorkflows(
  value: unknown,
  permissions: unknown,
  contributes: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['Plugin comfyUIWorkflows must be an array.'];
  }

  const warnings: string[] = [];
  const manifestPermissions = Array.isArray(permissions) ? permissions : [];
  const manifestContributes = Array.isArray(contributes) ? contributes : [];
  if (!manifestContributes.includes('workflow')) {
    warnings.push('Plugin comfyUIWorkflows require workflow contribution.');
  }
  if (!manifestPermissions.includes('comfyui')) {
    warnings.push('Plugin comfyUIWorkflows require comfyui permission.');
  }

  const ids = new Set<string>();
  value.slice(0, EXTENSION_SANDBOX_COMFYUI_WORKFLOW_LIMIT + 1).forEach((workflow, index) => {
    if (!isRecord(workflow)) {
      warnings.push(`Plugin comfyUIWorkflows[${index}] must be an object.`);
      return;
    }

    const id = readTrimmedString(workflow.id);
    if (!id) {
      warnings.push(`Plugin comfyUIWorkflows[${index}].id must be a non-empty string.`);
    } else if (ids.has(id)) {
      warnings.push(`Plugin comfyUIWorkflows id "${id}" is duplicated.`);
    } else {
      ids.add(id);
    }
    if (!readTrimmedString(workflow.label)) {
      warnings.push(`Plugin comfyUIWorkflows[${index}].label must be a non-empty string.`);
    }
    if (!readTrimmedString(workflow.workflowName)) {
      warnings.push(`Plugin comfyUIWorkflows[${index}].workflowName must be a non-empty string.`);
    }
    if (workflow.description !== undefined && typeof workflow.description !== 'string') {
      warnings.push(`Plugin comfyUIWorkflows[${index}].description must be a string.`);
    }
    if (workflow.promptSuffix !== undefined && typeof workflow.promptSuffix !== 'string') {
      warnings.push(`Plugin comfyUIWorkflows[${index}].promptSuffix must be a string.`);
    }
    if (workflow.negativePrompt !== undefined && typeof workflow.negativePrompt !== 'string') {
      warnings.push(`Plugin comfyUIWorkflows[${index}].negativePrompt must be a string.`);
    }
    warnings.push(...validateExtensionSandboxComfyUIWorkflowParameters(workflow.parameters, index));
    warnings.push(...validateExtensionSandboxComfyUIRequiredNodeTypes(workflow.requiredNodeTypes, index));
  });
  if (value.length > EXTENSION_SANDBOX_COMFYUI_WORKFLOW_LIMIT) {
    warnings.push(`Plugin comfyUIWorkflows cannot include more than ${EXTENSION_SANDBOX_COMFYUI_WORKFLOW_LIMIT} presets.`);
  }

  return warnings;
}

function validateExtensionSandboxComfyUIWorkflowParameters(
  value: unknown,
  workflowIndex: number,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    return [`Plugin comfyUIWorkflows[${workflowIndex}].parameters must be an object.`];
  }

  return Object.entries(value).flatMap(([key, parameter]) => {
    if (
      typeof parameter === 'string' ||
      typeof parameter === 'boolean' ||
      (typeof parameter === 'number' && Number.isFinite(parameter))
    ) {
      return [];
    }

    return [`Plugin comfyUIWorkflows[${workflowIndex}].parameters.${key} must be a string, finite number, or boolean.`];
  });
}

function validateExtensionSandboxComfyUIRequiredNodeTypes(
  value: unknown,
  workflowIndex: number,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`Plugin comfyUIWorkflows[${workflowIndex}].requiredNodeTypes must be an array.`];
  }

  const warnings: string[] = [];
  const names = new Set<string>();
  value.slice(0, EXTENSION_SANDBOX_COMFYUI_NODE_TYPE_LIMIT + 1).forEach((nodeType, index) => {
    const name = readTrimmedString(nodeType);
    if (!name) {
      warnings.push(`Plugin comfyUIWorkflows[${workflowIndex}].requiredNodeTypes[${index}] must be a non-empty string.`);
    } else if (names.has(name)) {
      warnings.push(`Plugin comfyUIWorkflows[${workflowIndex}].requiredNodeTypes "${name}" is duplicated.`);
    } else {
      names.add(name);
    }
  });
  if (value.length > EXTENSION_SANDBOX_COMFYUI_NODE_TYPE_LIMIT) {
    warnings.push(`Plugin comfyUIWorkflows[${workflowIndex}].requiredNodeTypes cannot include more than ${EXTENSION_SANDBOX_COMFYUI_NODE_TYPE_LIMIT} entries.`);
  }

  return warnings;
}

function validateExtensionSandboxCustomCommandDeclarations(
  value: unknown,
  contributes: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['Plugin customCommands must be an array.'];
  }

  const warnings: string[] = [];
  const manifestContributes = Array.isArray(contributes) ? contributes : [];
  const ids = new Set<string>();
  value.slice(0, EXTENSION_SANDBOX_CUSTOM_COMMAND_LIMIT + 1).forEach((command, index) => {
    if (!isRecord(command)) {
      warnings.push(`Plugin customCommands[${index}] must be an object.`);
      return;
    }

    const id = readTrimmedString(command.id);
    if (!id) {
      warnings.push(`Plugin customCommands[${index}].id must be a non-empty string.`);
    } else if (ids.has(id)) {
      warnings.push(`Plugin customCommands id "${id}" is duplicated.`);
    } else {
      ids.add(id);
    }
    if (!readTrimmedString(command.label)) {
      warnings.push(`Plugin customCommands[${index}].label must be a non-empty string.`);
    }
    if (command.description !== undefined && typeof command.description !== 'string') {
      warnings.push(`Plugin customCommands[${index}].description must be a string.`);
    }

    const contribution = readTrimmedString(command.contribution);
    if (!(EXTENSION_SANDBOX_CUSTOM_COMMAND_CONTRIBUTIONS as readonly string[]).includes(String(contribution))) {
      warnings.push(`Plugin customCommands[${index}].contribution must be automation, analyzer, or exporter.`);
    } else if (!manifestContributes.includes(contribution)) {
      warnings.push(`Plugin customCommands[${index}].contribution must be listed in plugin contributes.`);
    }

    const kind = readTrimmedString(command.kind);
    if (!(EXTENSION_SANDBOX_CUSTOM_COMMAND_KINDS as readonly string[]).includes(String(kind))) {
      warnings.push(`Plugin customCommands[${index}].kind must be project-summary, timeline-report, or export-report.`);
    }

    warnings.push(...validateExtensionSandboxCustomCommandParameters(command.parameters, index));
  });
  if (value.length > EXTENSION_SANDBOX_CUSTOM_COMMAND_LIMIT) {
    warnings.push(`Plugin customCommands cannot include more than ${EXTENSION_SANDBOX_CUSTOM_COMMAND_LIMIT} commands.`);
  }

  return warnings;
}

function validateExtensionSandboxCustomCommandParameters(value: unknown, commandIndex: number): string[] {
  if (value === undefined) {
    return [];
  }
  const path = `Plugin customCommands[${commandIndex}].parameters`;
  if (!Array.isArray(value)) {
    return [`${path} must be an array.`];
  }

  const warnings: string[] = [];
  const keys = new Set<string>();
  value.slice(0, EXTENSION_SANDBOX_CUSTOM_COMMAND_PARAMETER_LIMIT + 1).forEach((parameter, parameterIndex) => {
    const parameterPath = `${path}[${parameterIndex}]`;
    if (!isRecord(parameter)) {
      warnings.push(`${parameterPath} must be an object.`);
      return;
    }

    const key = readTrimmedString(parameter.key);
    if (!key) {
      warnings.push(`${parameterPath}.key must be a non-empty string.`);
    } else if (keys.has(key)) {
      warnings.push(`${parameterPath}.key "${key}" is duplicated.`);
    } else {
      keys.add(key);
    }

    const type = readTrimmedString(parameter.type);
    if (!(type === 'number' || type === 'string' || type === 'boolean' || type === 'enum')) {
      warnings.push(`${parameterPath}.type must be number, string, boolean, or enum.`);
    }
    if (parameter.label !== undefined && typeof parameter.label !== 'string') {
      warnings.push(`${parameterPath}.label must be a string.`);
    }
    if (parameter.required !== undefined && typeof parameter.required !== 'boolean') {
      warnings.push(`${parameterPath}.required must be a boolean.`);
    }

    warnings.push(...validateExtensionSandboxCustomCommandParameterBounds(parameter, parameterPath, type));
    warnings.push(...validateExtensionSandboxCustomCommandParameterEnumValues(parameter.values, parameterPath, type));
    warnings.push(...validateExtensionSandboxCustomCommandDefaultValue(parameter.defaultValue, parameter, parameterPath));
  });
  if (value.length > EXTENSION_SANDBOX_CUSTOM_COMMAND_PARAMETER_LIMIT) {
    warnings.push(`${path} cannot include more than ${EXTENSION_SANDBOX_CUSTOM_COMMAND_PARAMETER_LIMIT} parameters.`);
  }

  return warnings;
}

function validateExtensionSandboxCustomCommandParameterBounds(
  parameter: Record<string, unknown>,
  path: string,
  type: string | undefined,
): string[] {
  const warnings: string[] = [];
  if (parameter.min !== undefined && (type !== 'number' || typeof parameter.min !== 'number' || !Number.isFinite(parameter.min))) {
    warnings.push(`${path}.min is only valid as a finite number for number parameters.`);
  }
  if (parameter.max !== undefined && (type !== 'number' || typeof parameter.max !== 'number' || !Number.isFinite(parameter.max))) {
    warnings.push(`${path}.max is only valid as a finite number for number parameters.`);
  }
  if (
    typeof parameter.min === 'number' &&
    Number.isFinite(parameter.min) &&
    typeof parameter.max === 'number' &&
    Number.isFinite(parameter.max) &&
    parameter.min > parameter.max
  ) {
    warnings.push(`${path}.max must be greater than or equal to min.`);
  }

  return warnings;
}

function validateExtensionSandboxCustomCommandParameterEnumValues(
  value: unknown,
  path: string,
  type: string | undefined,
): string[] {
  if (type !== 'enum') {
    return value === undefined ? [] : [`${path}.values are only valid for enum parameters.`];
  }
  if (!Array.isArray(value)) {
    return [`${path}.values must be an array.`];
  }

  const warnings: string[] = [];
  const values = new Set<string>();
  value.slice(0, EXTENSION_SANDBOX_CUSTOM_COMMAND_ENUM_VALUE_LIMIT + 1).forEach((item, index) => {
    const enumValue = readTrimmedString(item);
    if (!enumValue) {
      warnings.push(`${path}.values[${index}] must be a non-empty string.`);
      return;
    }
    if (enumValue.length > EXTENSION_SANDBOX_CUSTOM_COMMAND_STRING_LIMIT) {
      warnings.push(`${path}.values[${index}] exceeds the ${EXTENSION_SANDBOX_CUSTOM_COMMAND_STRING_LIMIT} character limit.`);
    }
    if (values.has(enumValue)) {
      warnings.push(`${path}.values[${index}] "${enumValue}" is duplicated.`);
      return;
    }
    values.add(enumValue);
  });
  if (value.length === 0) {
    warnings.push(`${path}.values must include at least one enum value.`);
  }
  if (value.length > EXTENSION_SANDBOX_CUSTOM_COMMAND_ENUM_VALUE_LIMIT) {
    warnings.push(`${path}.values cannot include more than ${EXTENSION_SANDBOX_CUSTOM_COMMAND_ENUM_VALUE_LIMIT} values.`);
  }

  return warnings;
}

function validateExtensionSandboxCustomCommandDefaultValue(
  value: unknown,
  parameter: Record<string, unknown>,
  path: string,
): string[] {
  if (value === undefined) {
    return [];
  }
  const type = readTrimmedString(parameter.type);
  const defaultPath = `${path}.defaultValue`;
  if (type === 'number') {
    return validateReviewedCustomCommandParameterValue(value, {
      key: 'defaultValue',
      type: 'number',
      min: typeof parameter.min === 'number' ? parameter.min : undefined,
      max: typeof parameter.max === 'number' ? parameter.max : undefined,
    }, defaultPath);
  }
  if (type === 'string') {
    return validateReviewedCustomCommandParameterValue(value, { key: 'defaultValue', type: 'string' }, defaultPath);
  }
  if (type === 'boolean') {
    return validateReviewedCustomCommandParameterValue(value, { key: 'defaultValue', type: 'boolean' }, defaultPath);
  }
  if (type === 'enum') {
    const values = Array.isArray(parameter.values)
      ? parameter.values.filter((item): item is string => typeof item === 'string')
      : [];
    return validateReviewedCustomCommandParameterValue(value, { key: 'defaultValue', type: 'enum', values }, defaultPath);
  }
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? []
    : [`${defaultPath} must be a string, finite number, or boolean.`];
}

function validateExtensionSandboxExporterWriterDeclarations(
  value: unknown,
  contributes: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['Plugin exporterWriters must be an array.'];
  }
  if (!Array.isArray(contributes) || !contributes.includes('exporter')) {
    return ['Plugin exporterWriters require exporter contribution.'];
  }

  const warnings: string[] = [];
  const ids = new Set<string>();
  value.slice(0, 17).forEach((writer, index) => {
    if (!isRecord(writer)) {
      warnings.push(`Plugin exporterWriters[${index}] must be an object.`);
      return;
    }
    const id = readTrimmedString(writer.id);
    if (!id) {
      warnings.push(`Plugin exporterWriters[${index}].id must be a non-empty string.`);
    } else if (ids.has(id)) {
      warnings.push(`Plugin exporterWriters id "${id}" is duplicated.`);
    } else {
      ids.add(id);
    }
    if (!readTrimmedString(writer.label)) {
      warnings.push(`Plugin exporterWriters[${index}].label must be a non-empty string.`);
    }
    if (!isSafeExtensionExporterWriterPath(writer.executable, { allowBareCommand: true })) {
      warnings.push(`Plugin exporterWriters[${index}].executable must be a bare command or safe relative path under plugins/ or tools/.`);
    }
    if (!Array.isArray(writer.args) || writer.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      warnings.push(`Plugin exporterWriters[${index}].args must be an array of strings without null bytes.`);
    }
    if (writer.cwd !== undefined && !isSafeExtensionExporterWriterPath(writer.cwd, { allowBareCommand: false })) {
      warnings.push(`Plugin exporterWriters[${index}].cwd must be a safe relative path under plugins/ or tools/.`);
    }
    if (writer.trust !== undefined && !(EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST as readonly string[]).includes(String(writer.trust))) {
      warnings.push(`Plugin exporterWriters[${index}].trust must be trusted, prompt, or blocked.`);
    }
    if (
      writer.trustFingerprint !== undefined &&
      (typeof writer.trustFingerprint !== 'string' || writer.trustFingerprint.includes('\0') || !/^writer-v1-[a-z0-9]{7,16}$/.test(writer.trustFingerprint))
    ) {
      warnings.push(`Plugin exporterWriters[${index}].trustFingerprint must be a writer-v1 fingerprint string.`);
    }
    if (writer.trustedAt !== undefined && typeof writer.trustedAt !== 'string') {
      warnings.push(`Plugin exporterWriters[${index}].trustedAt must be a string.`);
    }
    warnings.push(...validateExtensionSandboxExporterWriterTrustHistory(writer.trustHistory, index));
    warnings.push(...validateExtensionSandboxExporterWriterRuntimePackage(writer, index));
    if (
      writer.timeoutMs !== undefined &&
      (typeof writer.timeoutMs !== 'number' || !Number.isInteger(writer.timeoutMs) || writer.timeoutMs < 1000 || writer.timeoutMs > 10 * 60 * 1000)
    ) {
      warnings.push(`Plugin exporterWriters[${index}].timeoutMs must be an integer between 1000 and 600000.`);
    }
  });
  if (value.length > 16) {
    warnings.push('Plugin exporterWriters cannot include more than 16 writers.');
  }

  return warnings;
}

function validateExtensionSandboxExporterWriterRuntimePackage(writer: Record<string, unknown>, writerIndex: number): string[] {
  if (writer.runtimePackage === undefined) {
    return [];
  }
  const path = `Plugin exporterWriters[${writerIndex}].runtimePackage`;
  if (!isRecord(writer.runtimePackage)) {
    return [`${path} must be an object.`];
  }

  const runtimePackage = writer.runtimePackage;
  const warnings: string[] = [];
  const packageId = readTrimmedString(runtimePackage.packageId);
  const runtime = readTrimmedString(runtimePackage.runtime);
  const root = readTrimmedString(runtimePackage.root);
  const entry = readTrimmedString(runtimePackage.entry);
  if (!packageId) {
    warnings.push(`${path}.packageId must be a non-empty string.`);
  }
  if (!(EXTENSION_SANDBOX_EXPORTER_WRITER_RUNTIMES as readonly string[]).includes(String(runtime))) {
    warnings.push(`${path}.runtime must be native or node.`);
  }
  if (!isSafeExtensionExporterWriterPath(root, { allowBareCommand: false })) {
    warnings.push(`${path}.root must be a safe relative path under plugins/ or tools/.`);
  }
  if (!isSafeExtensionPackageRelativePath(entry)) {
    warnings.push(`${path}.entry must be a safe package-relative path.`);
  }
  if (runtime === 'native' && root && entry) {
    const executable = readTrimmedString(writer.executable)?.replace(/\\/g, '/');
    if (executable && executable !== `${root.replace(/\\/g, '/')}/${entry.replace(/\\/g, '/')}`) {
      warnings.push(`${path} native entry must match exporterWriters[${writerIndex}].executable.`);
    }
  }
  if (runtimePackage.packagedAt !== undefined && typeof runtimePackage.packagedAt !== 'string') {
    warnings.push(`${path}.packagedAt must be a string.`);
  }
  if (!Array.isArray(runtimePackage.files)) {
    warnings.push(`${path}.files must be an array.`);
    return warnings;
  }
  const paths = new Set<string>();
  runtimePackage.files.slice(0, 65).forEach((file, fileIndex) => {
    const filePath = `${path}.files[${fileIndex}]`;
    if (!isRecord(file)) {
      warnings.push(`${filePath} must be an object.`);
      return;
    }
    const declaredPath = readTrimmedString(file.path);
    if (!isSafeExtensionPackageRelativePath(declaredPath)) {
      warnings.push(`${filePath}.path must be a safe package-relative path.`);
    } else if (paths.has(declaredPath.replace(/\\/g, '/'))) {
      warnings.push(`${filePath}.path is duplicated.`);
    } else {
      paths.add(declaredPath.replace(/\\/g, '/'));
    }
    if (
      file.sha256 !== undefined &&
      (typeof file.sha256 !== 'string' || file.sha256.includes('\0') || !/^sha256-[a-f0-9]{64}$/.test(file.sha256))
    ) {
      warnings.push(`${filePath}.sha256 must be a sha256 hex digest string.`);
    }
    if (file.bytes !== undefined && (typeof file.bytes !== 'number' || !Number.isInteger(file.bytes) || file.bytes < 0)) {
      warnings.push(`${filePath}.bytes must be a non-negative integer.`);
    }
  });
  if (runtimePackage.files.length > 64) {
    warnings.push(`${path}.files cannot include more than 64 entries.`);
  }

  return warnings;
}

function validateExtensionSandboxExporterWriterTrustHistory(value: unknown, writerIndex: number): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`Plugin exporterWriters[${writerIndex}].trustHistory must be an array.`];
  }

  const warnings: string[] = [];
  value.slice(0, 33).forEach((entry, index) => {
    const path = `Plugin exporterWriters[${writerIndex}].trustHistory[${index}]`;
    if (!isRecord(entry)) {
      warnings.push(`${path} must be an object.`);
      return;
    }
    if (!readTrimmedString(entry.at)) {
      warnings.push(`${path}.at must be a non-empty string.`);
    }
    if (!['approved', 'review-required', 'blocked'].includes(String(entry.action))) {
      warnings.push(`${path}.action must be approved, review-required, or blocked.`);
    }
    if (!(EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST as readonly string[]).includes(String(entry.previousTrust))) {
      warnings.push(`${path}.previousTrust must be trusted, prompt, or blocked.`);
    }
    if (!(EXTENSION_SANDBOX_EXPORTER_WRITER_TRUST as readonly string[]).includes(String(entry.nextTrust))) {
      warnings.push(`${path}.nextTrust must be trusted, prompt, or blocked.`);
    }
    if (
      typeof entry.fingerprint !== 'string' ||
      entry.fingerprint.includes('\0') ||
      !/^writer-v1-[a-z0-9]{7,16}$/.test(entry.fingerprint)
    ) {
      warnings.push(`${path}.fingerprint must be a writer-v1 fingerprint string.`);
    }
    if (!readTrimmedString(entry.commandPreview)) {
      warnings.push(`${path}.commandPreview must be a non-empty string.`);
    }
    if (entry.source !== undefined && typeof entry.source !== 'string') {
      warnings.push(`${path}.source must be a string.`);
    }
  });
  if (value.length > 32) {
    warnings.push(`Plugin exporterWriters[${writerIndex}].trustHistory cannot include more than 32 entries.`);
  }

  return warnings;
}

function isSafeExtensionExporterWriterPath(
  value: unknown,
  options: { allowBareCommand: boolean },
): boolean {
  const raw = readTrimmedString(value);
  if (!raw) {
    return false;
  }

  const normalized = raw.replace(/\\/g, '/');
  if (
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    return false;
  }
  if (!normalized.includes('/')) {
    return options.allowBareCommand && /^[a-zA-Z0-9._-]+$/.test(normalized);
  }

  return (normalized.startsWith('plugins/') || normalized.startsWith('tools/')) &&
    normalized.split('/').every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

function isSafeExtensionPackageRelativePath(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    return false;
  }

  return normalized.split('/').every((segment) => (
    segment &&
    segment !== '.' &&
    segment !== '..' &&
    /^[a-zA-Z0-9._-]+$/.test(segment)
  ));
}

function readExtensionSandboxPermissions(value: unknown, warnings: string[]): ExtensionPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const permissions: ExtensionPermission[] = [];
  for (const item of value) {
    if (typeof item === 'string' && EXTENSION_SANDBOX_PERMISSIONS.has(item as ExtensionPermission)) {
      permissions.push(item as ExtensionPermission);
    } else {
      warnings.push(`Unsupported extension permission in sandbox handshake: ${String(item)}.`);
    }
  }

  return Array.from(new Set(permissions));
}

function readExtensionSandboxContributions(value: unknown, warnings: string[]): ExtensionContribution[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const contributions: ExtensionContribution[] = [];
  for (const item of value) {
    if (typeof item === 'string' && EXTENSION_SANDBOX_CONTRIBUTES.has(item as ExtensionContribution)) {
      contributions.push(item as ExtensionContribution);
    } else {
      warnings.push(`Unsupported extension contribution in sandbox handshake: ${String(item)}.`);
    }
  }

  return Array.from(new Set(contributions));
}

function isSafeExtensionPluginEntry(value: unknown): boolean {
  const entry = readTrimmedString(value);
  if (!entry) {
    return false;
  }

  const normalized = entry.replace(/\\/g, '/');
  return !normalized.includes('\0')
    && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)
    && !normalized.startsWith('/')
    && !normalized.startsWith('//')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.split('/').includes('..')
    && normalized.startsWith('plugins/');
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isExtensionSandboxProjectSummary(value: unknown): value is ExtensionSandboxProjectSummary {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.projectId === 'string'
    && typeof value.name === 'string'
    && typeof value.duration === 'number'
    && typeof value.fps === 'number'
    && typeof value.width === 'number'
    && typeof value.height === 'number'
    && typeof value.assetCount === 'number'
    && typeof value.trackCount === 'number'
    && typeof value.clipCount === 'number'
    && typeof value.captionCount === 'number'
    && typeof value.markerCount === 'number'
    && typeof value.exportProfileCount === 'number';
}

function readExtensionSandboxTimelineAnalysisInput(value: unknown): ExtensionSandboxTimelineAnalysisInput {
  if (!isRecord(value) || !isExtensionSandboxProjectSummary(value.project) || !Array.isArray(value.tracks)) {
    return {
      project: {
        projectId: 'unknown',
        name: 'Unknown project',
        duration: 0,
        fps: 0,
        width: 0,
        height: 0,
        assetCount: 0,
        trackCount: 0,
        clipCount: 0,
        captionCount: 0,
        markerCount: 0,
        exportProfileCount: 0,
      },
      tracks: [],
    };
  }

  return {
    project: value.project,
    tracks: value.tracks.filter(isExtensionSandboxTimelineTrackSummary),
  };
}

function readExtensionSandboxExportAnalysisInput(value: unknown): ExtensionSandboxExportAnalysisInput {
  if (!isRecord(value) || !isExtensionSandboxProjectSummary(value.project) || !Array.isArray(value.profiles)) {
    return {
      project: {
        projectId: 'unknown',
        name: 'Unknown project',
        duration: 0,
        fps: 0,
        width: 0,
        height: 0,
        assetCount: 0,
        trackCount: 0,
        clipCount: 0,
        captionCount: 0,
        markerCount: 0,
        exportProfileCount: 0,
      },
      profiles: [],
    };
  }

  return {
    project: value.project,
    profiles: value.profiles.filter(isExtensionSandboxExportProfileSummary),
  };
}

function isExtensionSandboxExportProfileSummary(value: unknown): value is ExtensionSandboxExportProfileSummary {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.profileId === 'string'
    && typeof value.label === 'string'
    && (value.purpose === null || value.purpose === 'master' || value.purpose === 'social' || value.purpose === 'proxy')
    && (value.container === 'mp4' || value.container === 'mov' || value.container === 'webm')
    && (value.codec === 'h264' || value.codec === 'h265' || value.codec === 'prores' || value.codec === 'av1')
    && typeof value.width === 'number'
    && typeof value.height === 'number'
    && typeof value.fps === 'number'
    && typeof value.videoBitrateMbps === 'number'
    && typeof value.audioBitrateKbps === 'number'
    && (value.ffmpegPreset === null || typeof value.ffmpegPreset === 'string')
    && (value.crf === null || typeof value.crf === 'number')
    && typeof value.pixelsPerFrame === 'number'
    && typeof value.megapixelsPerSecond === 'number'
    && typeof value.aspectRatio === 'number'
    && typeof value.compatibleCodecContainer === 'boolean'
    && typeof value.compatibleDimensions === 'boolean';
}

function isExtensionSandboxTimelineTrackSummary(value: unknown): value is ExtensionSandboxTimelineTrackSummary {
  if (!isRecord(value) || !Array.isArray(value.clips) || !Array.isArray(value.gaps)) {
    return false;
  }

  return typeof value.trackId === 'string'
    && typeof value.name === 'string'
    && typeof value.kind === 'string'
    && EXTENSION_SANDBOX_TRACK_KINDS.has(value.kind as TrackKind)
    && typeof value.muted === 'boolean'
    && typeof value.solo === 'boolean'
    && typeof value.locked === 'boolean'
    && typeof value.syncLocked === 'boolean'
    && typeof value.clipCount === 'number'
    && value.clips.every(isExtensionSandboxTimelineClipSummary)
    && value.gaps.every(isExtensionSandboxTimelineGapSummary);
}

function isExtensionSandboxTimelineClipSummary(value: unknown): value is ExtensionSandboxTimelineClipSummary {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.clipId === 'string'
    && typeof value.trackId === 'string'
    && typeof value.kind === 'string'
    && EXTENSION_SANDBOX_CLIP_KINDS.has(value.kind as ClipKind)
    && typeof value.start === 'number'
    && typeof value.duration === 'number'
    && typeof value.end === 'number'
    && typeof value.muted === 'boolean'
    && typeof value.locked === 'boolean'
    && Array.isArray(value.effectTypes)
    && value.effectTypes.every((item) => typeof item === 'string' && EXTENSION_SANDBOX_EFFECT_TYPES.has(item as ClipEffect['type']))
    && typeof value.effectCount === 'number'
    && typeof value.keyframeCount === 'number'
    && typeof value.transitionCount === 'number'
    && typeof value.automationTagCount === 'number';
}

function isExtensionSandboxTimelineGapSummary(value: unknown): value is ExtensionSandboxTimelineGapSummary {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.trackId === 'string'
    && typeof value.start === 'number'
    && typeof value.end === 'number'
    && typeof value.duration === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isRuntimeCommandAllowed(
  manifest: EditorPluginManifest,
  command: RuntimeExtensionCommand,
  warnings: string[],
): boolean {
  const missingRequirements = getMissingRuntimeRequirements(
    manifest,
    command.permission,
    command.requiredContribution,
  );
  if (missingRequirements.length === 0) {
    return true;
  }

  warnings.push(`Extension ${manifest.id} command ${command.id} was not registered because ${missingRequirements.join(' and ')}.`);
  return false;
}

function isRuntimeRenderHookAllowed(
  manifest: EditorPluginManifest,
  hook: RuntimeExtensionRenderHook,
  warnings: string[],
): boolean {
  const missingRequirements = getMissingRuntimeRequirements(
    manifest,
    hook.permission,
    hook.requiredContribution,
  );
  if (missingRequirements.length === 0) {
    return true;
  }

  warnings.push(`Extension ${manifest.id} render hook ${hook.id} was not registered because ${missingRequirements.join(' and ')}.`);
  return false;
}

function getMissingRuntimeRequirements(
  manifest: EditorPluginManifest,
  permission: ExtensionPermission | undefined,
  contribution: ExtensionContribution,
): string[] {
  return [
    ...(permission && !manifest.permissions.includes(permission) ? [`it requires ${permission} permission`] : []),
    ...(!manifest.contributes.includes(contribution) ? [`it requires ${contribution} contribution`] : []),
  ];
}

function findRuntimeWarningsForExtension(runtime: ExtensionRuntime, extensionId: string): string[] {
  return runtime.warnings.filter((warning) => warning.includes(`Extension ${extensionId}`));
}

function buildUnhandledExtensionInvocationResult(
  request: Pick<ExtensionInvocationRequest, 'extensionId' | 'command'>,
  warnings: string[],
): ExtensionInvocationResult {
  return {
    extensionId: request.extensionId,
    command: request.command,
    handled: false,
    warnings,
  };
}

function countRenderableTimelineClips(project: EditorProject): { visualClipCount: number; audioClipCount: number } {
  return project.tracks.reduce((counts, track) => {
    if (track.locked) {
      return counts;
    }

    const activeClips = track.clips.filter((clip) => !clip.locked && !clip.muted);
    if (track.kind === 'audio') {
      counts.audioClipCount += activeClips.length;
    } else {
      counts.visualClipCount += activeClips.length;
    }

    return counts;
  }, {
    visualClipCount: 0,
    audioClipCount: 0,
  });
}

function readPayloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function readPayloadNestedObject(payload: unknown, key: string): Record<string, unknown> {
  const value = readPayloadObject(payload)[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readPayloadNumber(
  payload: unknown,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readPayloadObject(payload)[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? roundSandboxSeconds(Math.max(min, Math.min(max, value)))
    : fallback;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  const value = readPayloadObject(payload)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPayloadStringArray(payload: unknown, key: string): string[] {
  const value = readPayloadObject(payload)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => (
    typeof item === 'string' && item.trim().length > 0
  )).map((item) => item.trim())));
}

function readPayloadBoolean(payload: unknown, key: string, fallback: boolean): boolean {
  const value = readPayloadObject(payload)[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readPayloadEnum<TValue extends string>(
  payload: unknown,
  key: string,
  fallback: TValue | undefined,
  values: readonly TValue[],
): TValue | undefined {
  const value = readPayloadObject(payload)[key];
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value as TValue
    : fallback;
}

function readNestedNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? roundSandboxSeconds(Math.max(min, Math.min(max, value)))
    : fallback;
}

function readNestedBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readNestedEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  fallback: TValue,
  values: readonly TValue[],
): TValue {
  const value = record[key];
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value as TValue
    : fallback;
}

function readBooleanParameter(value: string | number | boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readDirectionParameter(value: string | number | boolean | undefined, fallback: 'left' | 'right' | 'up' | 'down'): 'left' | 'right' | 'up' | 'down' {
  return value === 'left' || value === 'right' || value === 'up' || value === 'down'
    ? value
    : fallback;
}

function buildSafeExternalExporterOutputDirectory(value: string | undefined, pluginId: string): string {
  const fallback = `exports/external/${sanitizePathSegment(pluginId)}`;
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().replace(/\\/g, '/');
  if (
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    return fallback;
  }

  const parts = normalized
    .split('/')
    .map(sanitizePathSegment)
    .filter((part) => part && part !== '.')
    .slice(0, 6);
  if (parts.length === 0 || parts[0] !== 'exports') {
    return fallback;
  }

  return parts.join('/');
}

function buildSafeExternalExporterFilenamePrefix(value: string): string {
  const prefix = sanitizePathSegment(value).slice(0, 80);
  return prefix && prefix !== '.' ? prefix : 'danbi-export';
}

function buildSafeExternalExporterOutputFilename(
  filenamePrefix: string,
  profileId: string,
  container: ExportProfile['container'],
): string {
  const profileSegment = sanitizePathSegment(profileId) || 'profile';
  const basename = trimUnsafeFilenameEdges(`${filenamePrefix}-${profileSegment}`.slice(0, 120)) || 'danbi-export';
  return `${basename}.${extensionForSandboxExportContainer(container)}`;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 80);
  return sanitized === '.' ? '' : sanitized;
}

function trimUnsafeFilenameEdges(value: string): string {
  return value.replace(/^[._-]+|[._-]+$/g, '');
}

function extensionForSandboxExportContainer(container: ExportProfile['container']): string {
  if (container === 'mov') {
    return 'mov';
  }
  if (container === 'webm') {
    return 'webm';
  }
  return 'mp4';
}

function sumDurations(values: Array<{ duration: number }>): number {
  return values.reduce((total, value) => total + value.duration, 0);
}

function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function filterReviewedSandboxFindings(
  findings: ReviewedSandboxFinding[],
  minSeverity: ExtensionSandboxFindingSeverity,
): ReviewedSandboxFinding[] {
  const minRank = getReviewedSandboxFindingSeverityRank(minSeverity);
  return findings.filter((finding) => getReviewedSandboxFindingSeverityRank(finding.severity) >= minRank);
}

function getReviewedSandboxFindingSeverityRank(severity: ExtensionSandboxFindingSeverity): number {
  if (severity === 'error') {
    return 3;
  }
  if (severity === 'warning') {
    return 2;
  }
  return 1;
}

function roundSandboxSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
