'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [comfyuiUrl, setComfyuiUrl] = useState('http://localhost:8188');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline'>('offline');
  const [testing, setTesting] = useState(false);
  const [defaultSteps, setDefaultSteps] = useState('25');
  const [defaultSeed, setDefaultSeed] = useState('Random');
  const [outputFormat, setOutputFormat] = useState('MP4');
  const [autoCleanup, setAutoCleanup] = useState(true);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setConnectionStatus(data.services.comfyui ? 'connected' : 'offline');
    } catch (error) {
      setConnectionStatus('offline');
    } finally {
      setTesting(false);
    }
  };

  const handleClearOldFiles = () => {
    if (confirm('Are you sure you want to clear old files? This cannot be undone.')) {
      // TODO: Implement file cleanup
      alert('File cleanup feature coming soon');
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-primary/80 mb-4 inline-block transition-colors">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground">
            Settings
          </h1>
        </div>

        <div className="space-y-6">
          {/* ComfyUI Connection */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              ComfyUI Connection
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  URL
                </label>
                <input
                  type="text"
                  value={comfyuiUrl}
                  onChange={(e) => setComfyuiUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="http://localhost:8188"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground/80">Status:</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  <span className={connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}>
                    {connectionStatus === 'connected' ? 'Connected' : 'Offline'}
                  </span>
                </span>
              </div>

              <button
                onClick={testConnection}
                disabled={testing}
                className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-all font-medium shadow-lg shadow-primary/20 disabled:bg-foreground/20 disabled:shadow-none"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>

          {/* Default Parameters */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Default Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Steps
                </label>
                <input
                  type="number"
                  value={defaultSteps}
                  onChange={(e) => setDefaultSteps(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  min="1"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Seed
                </label>
                <input
                  type="text"
                  value={defaultSeed}
                  onChange={(e) => setDefaultSeed(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground placeholder-foreground/40 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Random"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Output Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="MP4">MP4</option>
                  <option value="PNG">PNG</option>
                  <option value="JPG">JPG</option>
                </select>
              </div>
            </div>
          </div>

          {/* Storage */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Storage
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-cleanup"
                  checked={autoCleanup}
                  onChange={(e) => setAutoCleanup(e.target.checked)}
                  className="w-4 h-4 text-primary border-border bg-background/50 rounded focus:ring-primary"
                />
                <label htmlFor="auto-cleanup" className="text-sm font-medium text-foreground/80">
                  Auto-cleanup: After 30 days
                </label>
              </div>

              <button
                onClick={handleClearOldFiles}
                className="px-6 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all font-medium"
              >
                Clear Old Files
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
