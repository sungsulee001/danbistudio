export type ClipKind = 'video' | 'audio' | 'image' | 'text' | 'effect' | 'ai';

export type TrackKind = 'video' | 'audio' | 'text' | 'effect';

export type AutomationProvider = 'comfyui' | 'local' | 'webhook';

export type KeyframeValue = string | number | boolean;

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
  kind: 'chapter' | 'beat' | 'warning' | 'todo';
  duration?: number;
  note?: string;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  confidence?: number;
  speakerEmbedding?: number[];
  words?: CaptionWordTiming[];
  style?: CaptionStyle;
}

export interface CaptionWordTiming {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface CaptionStyle {
  fontSize?: number;
  fontColor?: string;
  boxEnabled?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowOffset?: number;
  position?: 'top' | 'middle' | 'bottom';
  align?: 'left' | 'center' | 'right';
}

export interface TimelineTransition {
  id: string;
  type: 'cut' | 'crossfade' | 'dip' | 'push' | 'wipe' | 'match-cut' | 'ai-morph';
  duration: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  parameters: Record<string, string | number | boolean>;
}

export interface ClipKeyframe {
  id: string;
  property: 'positionX' | 'positionY' | 'scale' | 'rotation' | 'opacity' | 'volume';
  time: number;
  value: KeyframeValue;
  easing: 'hold' | 'linear' | 'smooth' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface ClipSpeedRampPoint {
  id: string;
  time: number;
  speed: number;
}

export interface EditorAsset {
  id: string;
  name: string;
  kind: ClipKind;
  source: string;
  renderPath?: string;
  mediaCache?: MediaCacheManifest;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface MediaCacheManifest {
  generatedAt: string;
  thumbnailSource?: string;
  thumbnailPath?: string;
  proxySource?: string;
  proxyPath?: string;
  waveformSource?: string;
  waveformPath?: string;
  waveformPeaks?: number[];
  warnings: string[];
}

export interface ClipEffect {
  id: string;
  type: 'color' | 'audio' | 'motion' | 'caption' | 'mask' | 'stabilize' | 'reframe' | 'layout' | 'filter' | 'ai';
  label: string;
  enabled: boolean;
  parameters: Record<string, string | number | boolean>;
}

export interface GenerationBinding {
  provider: 'comfyui';
  presetId?: string;
  workflowName: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  parameters?: Record<string, string | number | boolean>;
  status: 'draft' | 'queued' | 'rendered' | 'failed';
}

export interface TimelineClip {
  id: string;
  assetId?: string;
  trackId: string;
  name: string;
  kind: ClipKind;
  start: number;
  duration: number;
  sourceIn: number;
  color: string;
  speed: number;
  speedRamp?: ClipSpeedRampPoint[];
  reversed?: boolean;
  freezeFrameTime?: number;
  volume: number;
  /**
   * 클립 단위 게인(dB). 선형 `volume`(0~2)로는 표현할 수 없는 넓은 편차를 다룰 때 쓴다
   * (예: 생성형 SFX의 컷별 정규화 −14.6~+15.4dB). `volume`과 곱해지며, 미지정은 0dB.
   */
  volumeDb?: number;
  opacity: number;
  blendMode: 'normal' | 'screen' | 'multiply' | 'overlay' | 'add';
  muted?: boolean;
  locked?: boolean;
  automationTags: string[];
  effects: ClipEffect[];
  keyframes: ClipKeyframe[];
  transitionIn?: TimelineTransition;
  transitionOut?: TimelineTransition;
  generation?: GenerationBinding;
}

export interface TimelineTrack {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  solo?: boolean;
  syncLocked?: boolean;
  volumeDb?: number;
  pan?: number;
  locked: boolean;
  clips: TimelineClip[];
}

export interface AutomationRule {
  id: string;
  name: string;
  provider: AutomationProvider;
  trigger: 'manual' | 'on-import' | 'before-export' | 'on-gap';
  workflowName?: string;
  targetTrackIds: string[];
  parameters: Record<string, string | number | boolean>;
}

export type EditorPluginParameterSchemaType = 'number' | 'string' | 'boolean' | 'enum';

export type EditorPluginParameterSchemaDefaultValue = string | number | boolean;

export interface EditorPluginParameterSchema {
  key: string;
  type: EditorPluginParameterSchemaType;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  defaultValue?: EditorPluginParameterSchemaDefaultValue;
}

export interface EditorPluginPlanParameterSchema {
  presetId: string;
  parameters: EditorPluginParameterSchema[];
}

export interface EditorPluginParameterSchemas {
  effects?: EditorPluginPlanParameterSchema[];
  transitions?: EditorPluginPlanParameterSchema[];
}

export interface EditorPluginComfyUIWorkflowPreset {
  id: string;
  label: string;
  workflowName: string;
  description?: string;
  promptSuffix?: string;
  negativePrompt?: string;
  requiredNodeTypes?: string[];
  parameters?: Record<string, string | number | boolean>;
}

export type EditorPluginCustomCommandKind = 'project-summary' | 'timeline-report' | 'export-report';

export interface EditorPluginCustomCommand {
  id: string;
  label: string;
  description?: string;
  contribution: 'automation' | 'analyzer' | 'exporter';
  kind: EditorPluginCustomCommandKind;
  parameters?: EditorPluginParameterSchema[];
}

export type EditorPluginExporterWriterTrust = 'trusted' | 'prompt' | 'blocked';

export interface EditorPluginExporterWriterTrustAuditEntry {
  at: string;
  action: 'approved' | 'review-required' | 'blocked';
  previousTrust: EditorPluginExporterWriterTrust;
  nextTrust: EditorPluginExporterWriterTrust;
  fingerprint: string;
  commandPreview: string;
  source?: string;
}

export interface EditorPluginExporterWriter {
  id: string;
  label: string;
  executable: string;
  args: string[];
  cwd?: string;
  trust?: EditorPluginExporterWriterTrust;
  trustFingerprint?: string;
  trustedAt?: string;
  trustHistory?: EditorPluginExporterWriterTrustAuditEntry[];
  runtimePackage?: EditorPluginExporterWriterRuntimePackage;
  timeoutMs?: number;
}

export type EditorPluginExporterWriterRuntime = 'native' | 'node';

export interface EditorPluginExporterWriterRuntimePackageFile {
  path: string;
  sha256?: string;
  bytes?: number;
}

export interface EditorPluginExporterWriterRuntimePackage {
  packageId: string;
  runtime: EditorPluginExporterWriterRuntime;
  root: string;
  entry: string;
  files: EditorPluginExporterWriterRuntimePackageFile[];
  packagedAt?: string;
}

export type EditorPluginManifestSignatureAlgorithm = 'manifest-sha256-v1' | 'manifest-rsa-sha256-v1';

export interface EditorPluginManifestSignature {
  algorithm: EditorPluginManifestSignatureAlgorithm;
  keyId: string;
  manifestFingerprint: string;
  signatureValue?: string;
  signedAt?: string;
}

export interface EditorPluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions: Array<'filesystem' | 'network' | 'comfyui' | 'render' | 'project'>;
  contributes: Array<'effect' | 'transition' | 'exporter' | 'automation' | 'analyzer' | 'workflow'>;
  signature?: EditorPluginManifestSignature;
  parameterSchemas?: EditorPluginParameterSchemas;
  comfyUIWorkflows?: EditorPluginComfyUIWorkflowPreset[];
  customCommands?: EditorPluginCustomCommand[];
  exporterWriters?: EditorPluginExporterWriter[];
}

export interface ExportProfile {
  id: string;
  label: string;
  purpose?: 'master' | 'social' | 'proxy';
  container: 'mp4' | 'mov' | 'webm';
  codec: 'h264' | 'h265' | 'prores' | 'av1';
  width: number;
  height: number;
  fps: number;
  videoBitrateMbps: number;
  audioBitrateKbps: number;
  ffmpegPreset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  crf?: number;
  /** Master delivery knobs (optional — omitted profiles keep legacy behaviour). */
  audioSampleRate?: number;
  audioChannels?: number;
  h264Profile?: 'baseline' | 'main' | 'high';
  gopSize?: number;
  faststart?: boolean;
}

export interface EditorProject {
  id: string;
  schemaVersion: number;
  name: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  updatedAt: string;
  assets: EditorAsset[];
  tracks: TimelineTrack[];
  markers: TimelineMarker[];
  captions: CaptionSegment[];
  automation: AutomationRule[];
  plugins: EditorPluginManifest[];
  exportProfiles: ExportProfile[];
}

export interface AutomationJob {
  id: string;
  clipId: string;
  trackId: string;
  provider: 'comfyui';
  workflowName: string;
  priority: number;
  parameters: Record<string, string | number | boolean>;
}

export interface AutomationPlan {
  projectId: string;
  generatedAt: string;
  jobs: AutomationJob[];
  warnings: string[];
}

export interface ExportManifest {
  projectId: string;
  profile: ExportProfile;
  duration: number;
  exportRange?: {
    start: number;
    end: number;
    duration: number;
  };
  fps: number;
  captions: CaptionSegment[];
  markers: TimelineMarker[];
  renderGraph: Array<{
    trackId: string;
    clipId: string;
    start: number;
    duration: number;
    effects: string[];
    transitionIn?: TimelineTransition;
    transitionOut?: TimelineTransition;
  }>;
  issues: string[];
}
