/**
 * Workflow Loader
 *
 * Utilities for loading and manipulating ComfyUI workflow JSON files
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getWorkflowLabelOverride, isWorkflowHiddenFromPicker } from './comfyui-workflow-defaults';

export interface WorkflowNode {
  inputs: Record<string, any>;
  class_type: string;
  _meta?: {
    title?: string;
  };
}

export type Workflow = Record<string, WorkflowNode>;

export interface WorkflowSummary {
  name: string;
  label: string;
  nodeCount: number;
  parameters: string[];
  updatedAt: string | null;
}

/**
 * Load a workflow JSON file from the workflows directory
 */
export function loadWorkflow(workflowName: string): Workflow {
  const normalizedWorkflowName = normalizeWorkflowName(workflowName);
  const workflowPath = resolveWorkflowPath(normalizedWorkflowName);

  try {
    const fileContent = readFileSync(workflowPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Workflow file not found: ${normalizedWorkflowName}.json`);
    }
    throw error;
  }
}

export function listWorkflowSummaries(): WorkflowSummary[] {
  const workflowsDir = getWorkflowsDirectory();

  try {
    return readdirSync(workflowsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => summarizeWorkflowFile(entry.name))
      .filter((workflow) => !isWorkflowHiddenFromPicker(workflow.name))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

/**
 * Inject parameters into a workflow
 * Creates a new workflow object with parameters replaced
 */
export function injectParameters(
  workflow: Workflow,
  parameters: Record<string, any>
): Workflow {
  // Deep clone the workflow to avoid mutations
  const newWorkflow = JSON.parse(JSON.stringify(workflow)) as Workflow;

  // Iterate through all nodes
  for (const nodeId in newWorkflow) {
    const node = newWorkflow[nodeId];

    for (const paramKey in parameters) {
      injectParameterIntoNode(node, paramKey, parameters[paramKey]);
    }
  }

  return newWorkflow;
}

function injectParameterIntoNode(node: WorkflowNode, paramKey: string, value: any): void {
  if (paramKey.includes('.')) {
    const paths = paramKey.split('.');
    let target: any = node.inputs;

    for (let i = 0; i < paths.length - 1; i++) {
      if (target[paths[i]] !== undefined) {
        target = target[paths[i]];
      } else {
        break;
      }
    }

    const lastKey = paths[paths.length - 1];
    if (target && lastKey in target) {
      target[lastKey] = value;
    }
    return;
  }

  if (paramKey in node.inputs) {
    node.inputs[paramKey] = value;
    return;
  }

  if ((paramKey === 'prompt' || paramKey === 'positive_prompt') && isPromptEncodeNode(node, 'positive')) {
    node.inputs.text = value;
    return;
  }

  if ((paramKey === 'negative_prompt' || paramKey === 'negativePrompt') && isPromptEncodeNode(node, 'negative')) {
    node.inputs.text = value;
  }
}

function isPromptEncodeNode(node: WorkflowNode, kind: 'positive' | 'negative'): boolean {
  if (node.class_type !== 'CLIPTextEncode' || typeof node.inputs.text !== 'string') {
    return false;
  }

  const title = node._meta?.title?.toLowerCase() ?? '';
  const text = node.inputs.text.toLowerCase();
  const looksNegative = title.includes('negative') ||
    /\b(low quality|distorted|unreadable|watermark|flicker|broken motion|bad anatomy)\b/.test(text);

  return kind === 'negative' ? looksNegative : !looksNegative;
}

function summarizeWorkflowFile(fileName: string): WorkflowSummary {
  const workflowName = normalizeWorkflowName(fileName.slice(0, -'.json'.length));
  const workflowPath = resolveWorkflowPath(workflowName);
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8')) as Workflow;
  const nodes = Object.values(workflow).filter((node): node is WorkflowNode => (
    Boolean(node) &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    typeof node.class_type === 'string' &&
    node.inputs !== null &&
    typeof node.inputs === 'object' &&
    !Array.isArray(node.inputs)
  ));
  const parameters = Array.from(new Set(nodes.flatMap((node) => Object.keys(node.inputs)))).sort();
  let updatedAt: string | null = null;
  try {
    updatedAt = statSync(workflowPath).mtime.toISOString();
  } catch {
    updatedAt = null;
  }

  return {
    name: workflowName,
    label: formatWorkflowLabel(workflowName),
    nodeCount: nodes.length,
    parameters,
    updatedAt,
  };
}

function resolveWorkflowPath(workflowName: string): string {
  return join(getWorkflowsDirectory(), `${workflowName}.json`);
}

function getWorkflowsDirectory(): string {
  return join(process.cwd(), 'workflows');
}

function normalizeWorkflowName(workflowName: string): string {
  const trimmed = workflowName.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error('Workflow name must contain only letters, numbers, dashes, or underscores.');
  }

  return trimmed;
}

function formatWorkflowLabel(workflowName: string): string {
  const labelOverride = getWorkflowLabelOverride(workflowName);
  if (labelOverride) {
    return labelOverride;
  }

  return workflowName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
