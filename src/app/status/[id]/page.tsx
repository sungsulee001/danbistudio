'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface JobStatus {
  id: string;
  status: string;
  modelName: string;
  workflowName: string;
  parameters: any;
  promptId?: string;
  resultPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/status/${id}`);

        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data = await response.json();
        setJob(data);
        setLoading(false);

        // Stop polling if job is completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          if (interval) clearInterval(interval);
        }
      } catch (err) {
        setError((err as Error).message);
        setLoading(false);
        if (interval) clearInterval(interval);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 3 seconds
    interval = setInterval(fetchStatus, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id]);

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8 min-h-screen">
        <div className="max-w-2xl mx-auto text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground/70">Loading job status...</p>
        </div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="container mx-auto px-4 py-8 min-h-screen">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
            <p className="text-red-400/80 mb-6">{error || 'Job not found'}</p>
            <Link
              href="/"
              className="inline-block bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const statusColor = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    running: 'bg-primary/20 text-primary border-primary/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  }[job.status] || 'bg-foreground/10 text-foreground/80 border-border';

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Job Status
          </h1>
          <p className="text-foreground/60 font-mono text-sm">
            {job.id}
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Current Status
            </h2>
            <span className={`px-4 py-2 rounded-full border font-medium uppercase text-sm ${statusColor}`}>
              {job.status}
            </span>
          </div>

          {job.status === 'running' && (
            <div className="mb-6">
              <div className="w-full bg-background/50 rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <p className="text-sm text-foreground/70 mt-2">Processing...</p>
            </div>
          )}

          {job.error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 font-medium">Error:</p>
              <p className="text-red-400/80">{job.error}</p>
            </div>
          )}

          <div className="space-y-3">
            <InfoRow label="Model" value={job.modelName} />
            <InfoRow label="Workflow" value={job.workflowName} />
            {job.promptId && <InfoRow label="Prompt ID" value={job.promptId} />}
            <InfoRow label="Created" value={new Date(job.createdAt).toLocaleString()} />
            <InfoRow label="Updated" value={new Date(job.updatedAt).toLocaleString()} />
          </div>
        </div>

        {/* Result */}
        {job.status === 'completed' && job.resultPath && (
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Result
            </h2>
            <div className="bg-background/50 border border-border rounded-lg p-4 mb-4">
              <img
                src={job.resultPath}
                alt="Generated result"
                className="max-w-full mx-auto rounded"
              />
            </div>
            <a
              href={job.resultPath}
              download
              className="block w-full text-center bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
            >
              Download Result
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-4">
          <Link
            href="/generate"
            className="flex-1 text-center bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
          >
            Generate Another
          </Link>
          <Link
            href="/library"
            className="flex-1 text-center bg-secondary border border-border hover:bg-secondary/70 text-foreground px-6 py-3 rounded-lg transition-all font-medium"
          >
            View Library
          </Link>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/30">
      <span className="text-foreground/70 font-medium">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
