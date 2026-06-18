import {
  AppLink,
  DanbiAppShell,
  DataList,
  WorkspacePanel,
} from '../danbi-app-shell';

const renderStatus = [
  { label: 'Local render', value: 'Available', tone: 'good' as const },
  { label: 'Render Worker', value: 'Preserved', tone: 'good' as const },
  { label: 'Daemon', value: 'Preserved', tone: 'good' as const },
  { label: 'Fleet Discovery', value: 'Preserved', tone: 'good' as const },
  { label: 'Headless Render', value: 'Preserved', tone: 'good' as const },
];

const queueRows = [
  { name: 'Current Render', state: 'Idle' },
  { name: 'Queued Renders', state: 'Ready' },
  { name: 'Completed Renders', state: 'History' },
  { name: 'Failed Renders', state: 'Retryable' },
  { name: 'Output Files', state: 'Open or reveal' },
];

export default function RenderQueuePage() {
  return (
    <DanbiAppShell
      activeView="render"
      title="Render Queue"
      subtitle="Jobs, workers, outputs"
      actions={<AppLink href="/editor">Export</AppLink>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkspacePanel eyebrow="Jobs" title="Queue States">
          <div className="grid gap-2">
            {queueRows.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[minmax(0,1fr)_140px] items-center rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <span className="font-medium text-zinc-100">{row.name}</span>
                <span className="text-right text-zinc-400">{row.state}</span>
              </div>
            ))}
          </div>
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Workers" title="Execution Targets">
          <DataList items={renderStatus} />
        </WorkspacePanel>
      </div>
    </DanbiAppShell>
  );
}
