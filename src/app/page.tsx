import {
  AppLink,
  DanbiAppShell,
  DataList,
  WorkspacePanel,
} from './danbi-app-shell';

const runtimeItems = [
  { label: 'Installer acceptance', value: 'Local passed', tone: 'good' as const },
  { label: 'Storage root', value: 'userData', tone: 'good' as const },
  { label: 'Program Files writes', value: 'None', tone: 'good' as const },
  { label: 'Fresh Windows QA', value: 'External pending', tone: 'pending' as const },
];

export default function ProjectHubPage() {
  return (
    <DanbiAppShell
      activeView="hub"
      title="Project Hub"
      subtitle="Local release candidate workspace"
      actions={<AppLink href="/editor">Open Editor</AppLink>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <WorkspacePanel
            eyebrow="Start"
            title="Open A Project"
            action={<AppLink href="/editor">Edit</AppLink>}
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-sm font-medium text-neutral-100">Getting Started</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Open the editor workspace, then choose a saved project, sample package, or local media.
                </p>
              </div>
              <div className="grid content-start gap-2">
                <AppLink href="/editor">Open Editor</AppLink>
                <AppLink href="/settings" variant="secondary">Runtime Settings</AppLink>
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Workspace" title="Commercial Editor Layout">
            <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-xs font-medium uppercase text-neutral-500">Left</p>
                <p className="mt-1 text-sm text-neutral-100">Media Bin / Project Assets / AI Results</p>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-xs font-medium uppercase text-neutral-500">Center</p>
                <p className="mt-1 text-sm text-neutral-100">Source Monitor / Program Monitor / Timeline</p>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-xs font-medium uppercase text-neutral-500">Right</p>
                <p className="mt-1 text-sm text-neutral-100">Inspector / Effects / Motion / Audio</p>
              </div>
            </div>
          </WorkspacePanel>
        </div>

        <div className="grid gap-4 content-start">
          <WorkspacePanel eyebrow="Runtime" title="Installed-App Status">
            <DataList items={runtimeItems} />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Release" title="Completion Boundary">
            <div className="grid gap-2 text-sm text-zinc-300">
              <div className="flex items-center justify-between gap-3">
                <span>Local Installed-App Acceptance</span>
                <span className="rounded border border-emerald-500/40 px-2 py-1 text-xs font-medium text-emerald-200">
                  Passed
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>External Fresh Windows Evidence</span>
                <span className="rounded border border-cyan-400/40 px-2 py-1 text-xs font-medium text-cyan-200">
                  Pending
                </span>
              </div>
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </DanbiAppShell>
  );
}
