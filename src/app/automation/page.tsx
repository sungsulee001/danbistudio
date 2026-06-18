import {
  AppLink,
  DanbiAppShell,
  DataList,
  WorkspacePanel,
} from '../danbi-app-shell';

const automationStatus = [
  { label: 'Automation hooks', value: 'Preserved', tone: 'good' as const },
  { label: 'Before export', value: 'Available', tone: 'good' as const },
  { label: 'Webhook execution', value: 'Explicit', tone: 'pending' as const },
  { label: 'ComfyUI job bridge', value: 'Preserved', tone: 'good' as const },
];

const automationRows = [
  'Manual hook plans',
  'Import and gap events',
  'Before-export local actions',
  'Webhook delivery state',
  'Batch job history',
];

export default function AutomationPage() {
  return (
    <DanbiAppShell
      activeView="automation"
      title="Automation"
      subtitle="Hooks, jobs, webhooks"
      actions={<AppLink href="/editor">Open Editor</AppLink>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkspacePanel eyebrow="Hooks" title="Automation Surface">
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full border-collapse text-left text-sm">
              <tbody className="divide-y divide-zinc-800">
                {automationRows.map((row) => (
                  <tr key={row} className="bg-zinc-950/40">
                    <td className="px-3 py-3 font-medium text-zinc-100">{row}</td>
                    <td className="px-3 py-3 text-right text-zinc-400">Editor-linked</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Status" title="Orchestration Boundary">
          <DataList items={automationStatus} />
        </WorkspacePanel>
      </div>
    </DanbiAppShell>
  );
}
