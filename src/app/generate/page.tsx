'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  COMFYUI_URL_STORAGE_KEY,
  DEFAULT_COMFYUI_URL,
  DEFAULT_GENERATE_OUTPUT_FORMAT,
  DEFAULT_GENERATE_SEED,
  DEFAULT_GENERATE_STEPS,
  GENERATE_DEFAULT_SEED_STORAGE_KEY,
  GENERATE_DEFAULT_STEPS_STORAGE_KEY,
  GENERATE_OUTPUT_FORMAT_STORAGE_KEY,
  normalizeGenerateOutputFormat,
  normalizeGenerateStepsSetting,
  resolveGenerateSeedSetting,
  type GenerateOutputFormat,
} from '@/lib/generate-settings';
import {
  DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME,
  DEFAULT_COMFYUI_WORKFLOW_NAME,
  resolveGenerateWorkflowName,
} from '@/lib/comfyui-workflow-defaults';
import { browserApiFetch } from '@/lib/browser-api-fetch';

const WORKFLOW_SCAN_TIMEOUT_MS = 5000;
const GENERATE_QUEUE_TIMEOUT_MS = 15000;
const GENERATE_IMAGE_UPLOAD_TIMEOUT_MS = 30000;

interface GenerateImageUpload {
  originalName: string;
  name: string;
  mimeType: string;
  size: number;
  source: string;
}

interface WorkflowSummary {
  name: string;
  label: string;
  nodeCount: number;
  parameters: string[];
  updatedAt: string | null;
}

export default function GeneratePage() {
  const [modelName, setModelName] = useState('wan_i2v');
  const [workflowName, setWorkflowName] = useState(DEFAULT_COMFYUI_WORKFLOW_NAME);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([
    {
      name: DEFAULT_COMFYUI_WORKFLOW_NAME,
      label: 'B-roll I2V',
      nodeCount: 0,
      parameters: [],
      updatedAt: null,
    },
  ]);
  const [workflowStatus, setWorkflowStatus] = useState('Loading workflows...');
  const [prompt, setPrompt] = useState('');
  const [seed, setSeed] = useState(readDefaultGenerateSeed);
  const [steps, setSteps] = useState(readDefaultGenerateSteps);
  const [outputFormat, setOutputFormat] = useState<GenerateOutputFormat>(readDefaultGenerateOutputFormat);
  const [comfyuiUrl] = useState(readConfiguredComfyUIUrl);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<GenerateImageUpload | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadWorkflows() {
      try {
        const response = await browserApiFetch('/api/workflows', {
          cache: 'no-store',
          signal: controller.signal,
          timeoutMs: WORKFLOW_SCAN_TIMEOUT_MS,
        });
        const data = await response.json() as { error?: string; workflows?: unknown };
        if (!response.ok) {
          throw new Error(data.error || response.statusText);
        }

        const nextWorkflows: WorkflowSummary[] = Array.isArray(data.workflows)
          ? data.workflows.filter(isWorkflowSummary)
          : [];
        if (cancelled || nextWorkflows.length === 0) {
          return;
        }

        setWorkflows(nextWorkflows);
        setWorkflowName((current) => (
          nextWorkflows.some((workflow) => workflow.name === current)
            ? current
            : nextWorkflows[0].name
        ));
        setWorkflowStatus(`${nextWorkflows.length} local workflow${nextWorkflows.length === 1 ? '' : 's'} available`);
      } catch (workflowError) {
        if (!cancelled && !controller.signal.aborted) {
          setWorkflowStatus(`Workflow scan failed: ${workflowError instanceof Error ? workflowError.message : String(workflowError)}`);
        }
      }
    }

    loadWorkflows();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let normalizedSeed: number;
    let normalizedSteps: number;
    try {
      normalizedSeed = parseIntegerFormValue(seed, 'Seed', 0, Number.MAX_SAFE_INTEGER);
      normalizedSteps = parseIntegerFormValue(steps, 'Steps', 1, 100);
    } catch (validationError) {
      setError((validationError as Error).message);
      return;
    }

    setIsGenerating(true);

    try {
      const response = await browserApiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: GENERATE_QUEUE_TIMEOUT_MS,
        body: JSON.stringify({
          modelName,
          workflowName: resolveWorkflowNameForRequest(workflowName, Boolean(uploadedImage)),
          parameters: {
            prompt,
            seed: normalizedSeed,
            steps: normalizedSteps,
            outputFormat,
          },
          comfyuiUrl,
          image: uploadedImage ? { name: uploadedImage.name } : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create job: ${response.statusText}`);
      }

      const data = await response.json();
      setJobId(data.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (jobId) {
    return (
      <main className="container mx-auto px-4 py-8 min-h-screen">
        <div className="max-w-2xl mx-auto">
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
                <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Generation Started!
              </h2>
              <p className="text-foreground/70 mb-4">
                Your job has been queued to ComfyUI
              </p>
              <p className="text-sm text-foreground/60 font-mono bg-background/50 border border-border p-2 rounded">
                Job ID: {jobId}
              </p>
            </div>

            <div className="flex gap-4 justify-center">
              <Link
                href={`/status/${jobId}`}
                className="bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
              >
                View Status
              </Link>
              <button
                onClick={() => {
                  setJobId(null);
                  setPrompt('');
                  setUploadedImage(null);
                  setSeed(readDefaultGenerateSeed());
                  setSteps(readDefaultGenerateSteps());
                  setOutputFormat(readDefaultGenerateOutputFormat());
                }}
                className="bg-secondary border border-border hover:bg-secondary/70 text-foreground px-6 py-3 rounded-lg transition-all font-medium"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      </main>
      );
  }

  const handleImageFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Use a PNG, JPEG, WebP, or GIF image.');
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await browserApiFetch('/api/generate/image', {
        method: 'POST',
        timeoutMs: GENERATE_IMAGE_UPLOAD_TIMEOUT_MS,
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) {
        throw new Error(data.error || response.statusText || 'Image upload failed.');
      }

      setUploadedImage(data.image);
      setWorkflowName((current) => (
        current === DEFAULT_COMFYUI_WORKFLOW_NAME && hasWorkflow(workflows, DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME)
          ? DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME
          : current
      ));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleImageDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await handleImageFile(event.dataTransfer.files[0]);
  };

  const handleRemoveImage = () => {
    setUploadedImage(null);
    setWorkflowName((current) => (
      current === DEFAULT_COMFYUI_REFERENCE_WORKFLOW_NAME && hasWorkflow(workflows, DEFAULT_COMFYUI_WORKFLOW_NAME)
        ? DEFAULT_COMFYUI_WORKFLOW_NAME
        : current
    ));
  };

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Generate
          </h1>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <form onSubmit={handleSubmit} className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6 space-y-6">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Model Selection
            </label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="wan_i2v">WAN I2V (Image to Video)</option>
            </select>
          </div>

          {/* Workflow Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Workflow
            </label>
            <select
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {workflows.map((workflow) => (
                <option key={workflow.name} value={workflow.name}>
                  {workflow.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-foreground/50">{workflowStatus}</p>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Prompt (Optional)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              rows={4}
              className="w-full px-4 py-2 bg-background/50 border border-border text-foreground placeholder-foreground/40 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Advanced Settings */}
          <details className="border-t border-border/30 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground/80 mb-4">
              Advanced
            </summary>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Seed
                </label>
                <input
                  data-testid="generate-seed-input"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  min="0"
                  max={Number.MAX_SAFE_INTEGER}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Steps
                </label>
                <input
                  data-testid="generate-steps-input"
                  type="number"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(normalizeGenerateOutputFormat(e.target.value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="MP4">MP4</option>
                  <option value="PNG">PNG</option>
                  <option value="JPG">JPG</option>
                </select>
              </div>
            </div>
          </details>

          {/* Submit */}
          <button
            type="submit"
            disabled={isGenerating || isUploadingImage}
            className="w-full bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20 disabled:bg-foreground/20 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isGenerating ? 'Generating...' : isUploadingImage ? 'Uploading image...' : 'Generate'}
          </button>
        </form>

        {/* Right: Preview */}
        <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Preview</h3>
          <input
            ref={imageInputRef}
            data-testid="generate-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => handleImageFile(event.target.files?.[0])}
          />
          <label
            htmlFor="generate-image-input"
            data-testid="generate-image-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleImageDrop}
            className="block cursor-pointer rounded-lg border-2 border-dashed border-border/50 p-4 text-center transition-colors hover:border-primary/70"
          >
            {uploadedImage ? (
              <div className="space-y-4">
                <img
                  data-testid="generate-image-preview"
                  src={uploadedImage.source}
                  alt={uploadedImage.originalName}
                  className="mx-auto max-h-80 w-full rounded-md object-contain bg-background/50"
                />
                <div>
                  <p className="break-all text-sm font-medium text-foreground">{uploadedImage.originalName}</p>
                  <p className="mt-1 text-xs text-foreground/50">
                    {uploadedImage.mimeType} / {formatBytes(uploadedImage.size)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-4 py-12">
                <div className="text-foreground/40 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-foreground/70">Upload Image</p>
                <p className="mt-2 text-xs text-foreground/40">PNG, JPEG, WebP, or GIF</p>
                <p className="mt-1 text-xs text-foreground/40">Drag and drop</p>
              </div>
            )}
          </label>
          {uploadedImage && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="mt-4 w-full rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-secondary/70"
            >
              Remove Image
            </button>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}

function resolveWorkflowNameForRequest(
  workflowName: string,
  hasReferenceImage: boolean,
): string {
  return resolveGenerateWorkflowName(workflowName, hasReferenceImage);
}

function hasWorkflow(workflows: WorkflowSummary[], workflowName: string): boolean {
  return workflows.some((workflow) => workflow.name === workflowName);
}

function parseIntegerFormValue(value: string, label: string, min: number, max: number): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (
    trimmed === '' ||
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }

  return parsed;
}

function readConfiguredComfyUIUrl(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_COMFYUI_URL;
  }

  return window.localStorage.getItem(COMFYUI_URL_STORAGE_KEY)?.trim() || DEFAULT_COMFYUI_URL;
}

function readDefaultGenerateSteps(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_GENERATE_STEPS;
  }

  return normalizeGenerateStepsSetting(window.localStorage.getItem(GENERATE_DEFAULT_STEPS_STORAGE_KEY));
}

function readDefaultGenerateSeed(): string {
  if (typeof window === 'undefined') {
    return resolveGenerateSeedSetting(DEFAULT_GENERATE_SEED);
  }

  return resolveGenerateSeedSetting(window.localStorage.getItem(GENERATE_DEFAULT_SEED_STORAGE_KEY));
}

function readDefaultGenerateOutputFormat(): GenerateOutputFormat {
  if (typeof window === 'undefined') {
    return DEFAULT_GENERATE_OUTPUT_FORMAT;
  }

  return normalizeGenerateOutputFormat(window.localStorage.getItem(GENERATE_OUTPUT_FORMAT_STORAGE_KEY));
}

function isWorkflowSummary(value: unknown): value is WorkflowSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const workflow = value as Partial<WorkflowSummary>;
  return typeof workflow.name === 'string' &&
    typeof workflow.label === 'string' &&
    typeof workflow.nodeCount === 'number' &&
    Array.isArray(workflow.parameters) &&
    workflow.parameters.every((parameter) => typeof parameter === 'string') &&
    (workflow.updatedAt === null || typeof workflow.updatedAt === 'string');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
