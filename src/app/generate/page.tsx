'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GeneratePage() {
  const [modelName, setModelName] = useState('wan_i2v');
  const [workflowName, setWorkflowName] = useState('test_workflow');
  const [prompt, setPrompt] = useState('');
  const [seed, setSeed] = useState('12345');
  const [steps, setSteps] = useState('20');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelName,
          workflowName,
          parameters: {
            prompt,
            seed: parseInt(seed),
            steps: parseInt(steps),
          },
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

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
            ← Back to Home
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
              <option value="test_workflow">Test Workflow</option>
            </select>
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
              Advanced ▼
            </summary>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Seed
                </label>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Steps
                </label>
                <input
                  type="number"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
          </details>

          {/* Submit */}
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20 disabled:bg-foreground/20 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </form>

        {/* Right: Preview */}
        <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Preview</h3>
          <div className="border-2 border-dashed border-border/50 rounded-lg p-12 text-center">
            <div className="text-foreground/40 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-foreground/60 mb-2">Upload Image</p>
            <p className="text-xs text-foreground/40">or</p>
            <p className="text-sm text-foreground/60 mt-2">Drag & Drop</p>
          </div>
          <p className="text-xs text-foreground/40 mt-4 text-center">
            Image upload feature coming soon
          </p>
        </div>
      </div>
      </div>
    </main>
  );
}
