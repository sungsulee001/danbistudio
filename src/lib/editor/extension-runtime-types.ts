import type { EditorPluginManifest, EditorProject } from './types';

export type ExtensionPermission = EditorPluginManifest['permissions'][number];
export type ExtensionContribution = EditorPluginManifest['contributes'][number];
export type ExtensionRuntimeJsonValue =
  | string
  | number
  | boolean
  | null
  | ExtensionRuntimeJsonValue[]
  | { [key: string]: ExtensionRuntimeJsonValue };
export type ExtensionRuntimeMetadata = Record<string, ExtensionRuntimeJsonValue>;
export type ExtensionRenderHookEvent = 'before-render';

export interface ExtensionCommandContribution {
  id: string;
  title: string;
  description: string;
  category: 'automation' | 'project' | 'render';
  sourcePluginId: string;
  permission?: ExtensionPermission;
}

export interface ExtensionRenderHookContribution {
  id: string;
  event: ExtensionRenderHookEvent;
  title: string;
  description: string;
  sourcePluginId: string;
  permission?: ExtensionPermission;
  priority: number;
}

export interface ExtensionRenderHookContext {
  project: EditorProject;
  profileId: string;
  outputPath?: string;
  outputFilename?: string;
  encoderPreference?: string;
  exportRange?: {
    start: number;
    end: number;
  };
  dryRun?: boolean;
}

export interface ExtensionRenderHookResult {
  hookId: string;
  extensionId: string;
  event: ExtensionRenderHookEvent;
  handled: boolean;
  warnings: string[];
  metadata: ExtensionRuntimeMetadata;
}

export interface ExtensionRenderHookRunResult {
  projectId: string;
  profileId: string;
  event: ExtensionRenderHookEvent;
  handledHookCount: number;
  hooks: ExtensionRenderHookResult[];
  warnings: string[];
  metadata: Record<string, ExtensionRuntimeMetadata>;
}
