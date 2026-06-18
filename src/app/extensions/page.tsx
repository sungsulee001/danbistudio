import {
  AppLink,
  DanbiAppShell,
  DataList,
  WorkspacePanel,
} from '../danbi-app-shell';

const extensionStatus = [
  { label: 'Built-in extensions', value: 'Trusted', tone: 'good' as const },
  { label: 'External packages', value: 'Reviewed', tone: 'pending' as const },
  { label: 'Signing', value: 'Required', tone: 'pending' as const },
  { label: 'Sandbox', value: 'Preserved', tone: 'good' as const },
];

const extensionRows = [
  { name: 'Plugin manifests', state: 'Validated' },
  { name: 'Permissions', state: 'Scoped' },
  { name: 'Commands', state: 'Reviewed' },
  { name: 'Render hooks', state: 'Preserved' },
  { name: 'ComfyUI workflow presets', state: 'Manifest-only' },
];

export default function ExtensionsPage() {
  return (
    <DanbiAppShell
      activeView="extensions"
      title="Extensions"
      subtitle="Packages, signing, sandbox"
      actions={<AppLink href="/editor">Open Plugins</AppLink>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkspacePanel eyebrow="Plugins" title="Extension Surfaces">
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full border-collapse text-left text-sm">
              <tbody className="divide-y divide-zinc-800">
                {extensionRows.map((row) => (
                  <tr key={row.name} className="bg-zinc-950/40">
                    <td className="px-3 py-3 font-medium text-zinc-100">{row.name}</td>
                    <td className="px-3 py-3 text-right text-zinc-400">{row.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Trust" title="Package Boundary">
          <DataList items={extensionStatus} />
        </WorkspacePanel>
      </div>
    </DanbiAppShell>
  );
}
