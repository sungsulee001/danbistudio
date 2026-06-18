import type { AutomationPlan } from './types';

export interface GenerateApiPayload {
  modelName: string;
  workflowName: string;
  parameters: Record<string, string | number | boolean>;
}

export interface AutomationWebhookPayload {
  source: 'danbi-studio';
  action: 'queue-comfyui-generation';
  jobId: string;
  clipId: string;
  trackId: string;
  endpoint: '/api/generate';
  payload: GenerateApiPayload;
}

export function buildGeneratePayloads(plan: AutomationPlan, modelName = 'wan_i2v'): GenerateApiPayload[] {
  return plan.jobs.map((job) => ({
    modelName,
    workflowName: job.workflowName,
    parameters: job.parameters,
  }));
}

export function buildAutomationWebhookPayloads(plan: AutomationPlan): AutomationWebhookPayload[] {
  return plan.jobs.map((job) => ({
    source: 'danbi-studio',
    action: 'queue-comfyui-generation',
    jobId: job.id,
    clipId: job.clipId,
    trackId: job.trackId,
    endpoint: '/api/generate',
    payload: {
      modelName: 'wan_i2v',
      workflowName: job.workflowName,
      parameters: job.parameters,
    },
  }));
}
