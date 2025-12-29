import Link from 'next/link';

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-4">
            DanbiStudio
          </h1>
          <p className="text-xl text-foreground/70">
            Local GPU-based AI Model Platform
          </p>
        </div>

        {/* Quick Start Card */}
        <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Quick Start
          </h2>
          <p className="text-foreground/70 mb-6">
            Generate AI videos and images using your local GPU with ComfyUI
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/generate"
              className="bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-lg transition-all font-medium shadow-lg shadow-primary/20"
            >
              Start Generation
            </Link>
            <Link
              href="/library"
              className="bg-secondary border border-border hover:bg-secondary/70 text-foreground px-6 py-3 rounded-lg transition-all font-medium"
            >
              View Library
            </Link>
            <Link
              href="/settings"
              className="bg-secondary border border-border hover:bg-secondary/70 text-foreground px-6 py-3 rounded-lg transition-all font-medium"
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            System Status
          </h2>
          <div className="space-y-3">
            <StatusItem label="Next.js" status="Running" />
            <StatusItem label="Database" status="Connected" />
            <StatusItem label="ComfyUI" status="Ready" />
            <StatusItem label="Phase Progress" status="3/5 Complete" />
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/30">
      <span className="text-foreground/80 font-medium">{label}</span>
      <span className="flex items-center gap-2 text-green-400 font-semibold">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        {status}
      </span>
    </div>
  );
}
