/**
 * Workflow Loader
 *
 * Utilities for loading and manipulating ComfyUI workflow JSON files
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface WorkflowNode {
  inputs: Record<string, any>;
  class_type: string;
}

export type Workflow = Record<string, WorkflowNode>;

/**
 * Load a workflow JSON file from the workflows directory
 */
export function loadWorkflow(workflowName: string): Workflow {
  const workflowPath = join(process.cwd(), 'workflows', `${workflowName}.json`);

  try {
    const fileContent = readFileSync(workflowPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Workflow file not found: ${workflowName}.json`);
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

    // Replace parameters in node inputs
    for (const paramKey in parameters) {
      if (paramKey.includes('.')) {
        // Handle nested parameter paths like 'config.nested.value'
        const paths = paramKey.split('.');
        let target: any = node.inputs;

        // Navigate to the nested property
        for (let i = 0; i < paths.length - 1; i++) {
          if (target[paths[i]] !== undefined) {
            target = target[paths[i]];
          } else {
            break;
          }
        }

        // Set the value
        const lastKey = paths[paths.length - 1];
        if (target && lastKey in target) {
          target[lastKey] = parameters[paramKey];
        }
      } else {
        // Simple parameter replacement
        if (paramKey in node.inputs) {
          node.inputs[paramKey] = parameters[paramKey];
        }
      }
    }
  }

  return newWorkflow;
}
