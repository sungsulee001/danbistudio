import {
  AppLink,
  DanbiAppShell,
  DataList,
  WorkspacePanel,
} from '../danbi-app-shell';

const aiStates = [
  { label: 'Pending generation', value: 'Actionable', tone: 'pending' as const },
  { label: 'Generating', value: 'Queued', tone: 'neutral' as const },
  { label: 'Generated', value: 'Reviewable', tone: 'good' as const },
  { label: 'Failed', value: 'Recoverable', tone: 'warn' as const },
];

export default function AiStudioPage() {
  return (
    <DanbiAppShell
      activeView="ai"
      title="AI Studio"
      subtitle="ComfyUI operations and AI Results"
      actions={<AppLink href="/generate">Open Generate</AppLink>}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <WorkspacePanel
          eyebrow="ComfyUI"
          title="Workflow Entry"
          action={<AppLink href="/generate" variant="secondary">Generate</AppLink>}
        >
          <div className="grid gap-3">
            <DataList
              items={[
                { label: 'Preset source', value: 'Built-in + plugin', tone: 'good' },
                { label: 'Execution path', value: 'ComfyUI', tone: 'good' },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <AppLink href="/editor" variant="secondary">Clip Binding</AppLink>
              <AppLink href="/library" variant="secondary">AI Results</AppLink>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Queue" title="Asset States">
          <DataList items={aiStates} />
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Actions" title="Pending Asset Controls">
          <div className="grid gap-2 text-sm text-zinc-300">
            <div className="rounded border border-zinc-800 px-3 py-2">Generate now</div>
            <div className="rounded border border-zinc-800 px-3 py-2">Skip this asset</div>
            <div className="rounded border border-zinc-800 px-3 py-2">Replace with local media</div>
            <div className="rounded border border-zinc-800 px-3 py-2">Exclude from current export</div>
          </div>
        </WorkspacePanel>
      </div>
    </DanbiAppShell>
  );
}
