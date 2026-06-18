export const DEFAULT_COMFYUI_WORKFLOW_NAME = 'broll_i2v';
export const DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME = 'broll_reference_i2v';
export const LEGACY_TEST_COMFYUI_WORKFLOW_NAME = 'test_workflow';

const HIDDEN_WORKFLOW_NAMES = new Set([
  LEGACY_TEST_COMFYUI_WORKFLOW_NAME,
]);

const WORKFLOW_LABEL_OVERRIDES: Record<string, string> = {
  [DEFAULT_COMFYUI_WORKFLOW_NAME]: 'B-roll I2V',
  [DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME]: 'B-roll Reference I2V',
};

export function isWorkflowHiddenFromPicker(workflowName: string): boolean {
  return HIDDEN_WORKFLOW_NAMES.has(workflowName);
}

export function getWorkflowLabelOverride(workflowName: string): string | undefined {
  return WORKFLOW_LABEL_OVERRIDES[workflowName];
}

export function resolveGenerateWorkflowName(workflowName: string, hasReferenceImage: boolean): string {
  if (hasReferenceImage && workflowName === DEFAULT_COMFYUI_WORKFLOW_NAME) {
    return DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME;
  }

  return workflowName;
}
