'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  status: string;
  modelName: string;
  workflowName: string;
  resultPath?: string;
  createdAt: string;
}

export default function LibraryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, we'll fetch from local storage or show empty
    // In a real implementation, you'd fetch from an API endpoint
    setLoading(false);
  }, []);

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-foreground">
              Library
            </h1>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-secondary border border-border rounded-lg text-sm font-medium text-foreground hover:bg-secondary/70 transition-all">
              Filter ▼
            </button>
            <button className="px-4 py-2 bg-secondary border border-border rounded-lg text-sm font-medium text-foreground hover:bg-secondary/70 transition-all">
              Sort ▼
            </button>
          </div>
        </div>

        {/* Empty State */}
        {jobs.length === 0 && !loading && (
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-12 text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-24 w-24 text-foreground/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              No generations yet
            </h2>
            <p className="text-foreground/70 mb-8">
              Start creating AI-generated content to see it here
            </p>
            <Link
              href="/generate"
              className="inline-block bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
            >
              Create Your First Generation
            </Link>
          </div>
        )}

        {/* Grid */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/status/${job.id}`}
                className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg overflow-hidden hover:shadow-xl hover:border-primary/50 transition-all"
              >
                {job.resultPath ? (
                  <div className="aspect-video bg-background/50">
                    <img
                      src={job.resultPath}
                      alt="Generated content"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-background/50 flex items-center justify-center">
                    <span className="text-foreground/60">Processing...</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="text-sm font-medium text-foreground mb-1">
                    {job.modelName}
                  </div>
                  <p className="text-xs text-foreground/60 mb-3">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <button className="text-foreground/60 hover:text-primary transition-colors" title="Download">
                      ⬇
                    </button>
                    <button className="text-foreground/60 hover:text-red-400 transition-colors" title="Delete">
                      🗑
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
