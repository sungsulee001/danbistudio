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

const workspaceRows = [
  { name: 'Editor', status: 'Ready', href: '/editor' },
  { name: 'AI Studio', status: 'Separated', href: '/ai-studio' },
  { name: 'Automation', status: 'Operational', href: '/automation' },
  { name: 'Render Queue', status: 'Operational', href: '/render-queue' },
  { name: 'Extensions', status: 'Managed', href: '/extensions' },
  { name: 'Settings', status: 'Diagnostics', href: '/settings' },
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
            title="Project Entry"
            action={<AppLink href="/editor">New Session</AppLink>}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <AppLink href="/editor">Open Editor</AppLink>
              <AppLink href="/editor" variant="secondary">Open Sample</AppLink>
              <AppLink href="/editor" variant="secondary">Import Media</AppLink>
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Workspaces" title="Top-Level Navigation">
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Workspace</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {workspaceRows.map((row) => (
                    <tr key={row.name} className="bg-zinc-950/40">
                      <td className="px-3 py-3 font-medium text-zinc-100">{row.name}</td>
                      <td className="px-3 py-3 text-zinc-400">{row.status}</td>
                      <td className="px-3 py-3">
                        <AppLink href={row.href} variant="secondary">Open</AppLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
