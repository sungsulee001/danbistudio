import type { TimelineTransition } from '../../lib/editor/types';
import { NumberField } from './editor-form-controls';

type InspectorTransitionType = Exclude<TimelineTransition['type'], 'cut' | 'match-cut'>;

interface InspectorCommandPanelsProps {
  fps: number;
  clipArrangeGap: number;
  precisionEditStepFrames: number;
  selectedClipCount: number;
  selectedCanRelinkAudio: boolean;
  onSplit: () => void;
  onSplitAll: () => void;
  onTrimToPlayhead: (edge: 'start' | 'end') => void;
  onDeleteSide: (side: 'left' | 'right') => void;
  onDuplicateSelectedClips: () => void;
  onGroupSelectedClips: () => void;
  onUngroupSelectedClips: () => void;
  onCopySelected: () => void;
  onCopyClipAttributes: () => void;
  onCutSelected: () => void;
  onPasteClipboard: () => void;
  onPasteClipAttributes: () => void;
  onAppendClipboard: () => void;
  onMatchFrameToSource: () => void;
  onSetMark: (edge: 'in' | 'out') => void;
  onDeleteMarkedRange: (ripple: boolean) => void;
  onDeleteSelected: (ripple: boolean) => void;
  onMoveSelected: (deltaSeconds: number) => void;
  onApplyTransition: (type: InspectorTransitionType) => void;
  onClipArrangeGapChange: (value: number) => void;
  onPrecisionEditStepFramesChange: (value: number) => void;
  onArrangeSelectedClips: (gapSeconds?: number) => void;
  onSlipSelected: (deltaSeconds: number) => void;
  onRollTrimSelected: (edge: 'start' | 'end', deltaSeconds: number) => void;
  onSlideSelected: (deltaSeconds: number) => void;
  onLinkedAudioSplitEdit: (edge: 'start' | 'end', deltaSeconds: number) => void;
}

const baseCommandButtonClass = 'rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm';
const baseTrimButtonClass = 'rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm';

export function InspectorCommandPanels({
  fps,
  clipArrangeGap,
  precisionEditStepFrames,
  selectedClipCount,
  selectedCanRelinkAudio,
  onSplit,
  onSplitAll,
  onTrimToPlayhead,
  onDeleteSide,
  onDuplicateSelectedClips,
  onGroupSelectedClips,
  onUngroupSelectedClips,
  onCopySelected,
  onCopyClipAttributes,
  onCutSelected,
  onPasteClipboard,
  onPasteClipAttributes,
  onAppendClipboard,
  onMatchFrameToSource,
  onSetMark,
  onDeleteMarkedRange,
  onDeleteSelected,
  onMoveSelected,
  onApplyTransition,
  onClipArrangeGapChange,
  onPrecisionEditStepFramesChange,
  onArrangeSelectedClips,
  onSlipSelected,
  onRollTrimSelected,
  onSlideSelected,
  onLinkedAudioSplitEdit,
}: InspectorCommandPanelsProps) {
  const frameStep = 1 / fps;
  const precisionStep = precisionEditStepFrames / fps;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <CommandButton label="Cut at playhead" onClick={onSplit} />
        <CommandButton label="Cut all" onClick={onSplitAll} />
        <CommandButton label="Trim in" onClick={() => onTrimToPlayhead('start')} />
        <CommandButton label="Trim out" onClick={() => onTrimToPlayhead('end')} />
        <CommandButton label="Delete left" onClick={() => onDeleteSide('left')} />
        <CommandButton label="Delete right" onClick={() => onDeleteSide('right')} />
        <CommandButton label="Duplicate" onClick={onDuplicateSelectedClips} />
        <CommandButton label="Group" onClick={onGroupSelectedClips} />
        <CommandButton label="Ungroup" onClick={onUngroupSelectedClips} />
        <CommandButton label="Copy" onClick={onCopySelected} />
        <CommandButton label="Copy attr" onClick={onCopyClipAttributes} />
        <CommandButton label="Cut" onClick={onCutSelected} />
        <CommandButton label="Paste" onClick={onPasteClipboard} />
        <CommandButton label="Paste attr" onClick={onPasteClipAttributes} />
        <CommandButton label="Append" onClick={onAppendClipboard} />
        <CommandButton label="Match frame" tone="sky" onClick={onMatchFrameToSource} />
        <CommandButton label="Mark in" onClick={() => onSetMark('in')} />
        <CommandButton label="Mark out" onClick={() => onSetMark('out')} />
        <CommandButton label="Lift range" tone="rose" onClick={() => onDeleteMarkedRange(false)} />
        <CommandButton label="Extract range" tone="rose" onClick={() => onDeleteMarkedRange(true)} />
        <CommandButton label="Delete" tone="rose" onClick={() => onDeleteSelected(false)} />
        <CommandButton label="Ripple delete" tone="rose" onClick={() => onDeleteSelected(true)} />
        <CommandButton label="-1 frame" onClick={() => onMoveSelected(-frameStep)} />
        <CommandButton label="+1 frame" onClick={() => onMoveSelected(frameStep)} />
        <CommandButton label="Crossfade" onClick={() => onApplyTransition('crossfade')} />
        <CommandButton label="Dip" onClick={() => onApplyTransition('dip')} />
        <CommandButton label="Push" onClick={() => onApplyTransition('push')} />
        <CommandButton label="Wipe" onClick={() => onApplyTransition('wipe')} />
        <button
          className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-100 hover:border-violet-300"
          onClick={() => onApplyTransition('ai-morph')}
        >
          AI Morph
        </button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Arrange</h2>
        <div className="mt-3 grid grid-cols-[1fr_88px_88px] items-end gap-2">
          <NumberField
            label="Gap"
            value={clipArrangeGap}
            step={0.05}
            min={0}
            max={60}
            onChange={onClipArrangeGapChange}
          />
          <button
            type="button"
            onClick={() => onArrangeSelectedClips(0)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={selectedClipCount < 2}
          >
            Pack
          </button>
          <button
            type="button"
            onClick={() => onArrangeSelectedClips()}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={selectedClipCount < 2}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Precision Trim</h2>
        <div className="mt-3">
          <NumberField
            label="Step frames"
            value={precisionEditStepFrames}
            step={1}
            min={1}
            max={600}
            onChange={onPrecisionEditStepFramesChange}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TrimButton label={`Slip -${precisionEditStepFrames}f`} onClick={() => onSlipSelected(-precisionStep)} />
          <TrimButton label={`Slip +${precisionEditStepFrames}f`} onClick={() => onSlipSelected(precisionStep)} />
          <TrimButton label={`Roll head -${precisionEditStepFrames}f`} tone="sky" onClick={() => onRollTrimSelected('start', -precisionStep)} />
          <TrimButton label={`Roll head +${precisionEditStepFrames}f`} tone="sky" onClick={() => onRollTrimSelected('start', precisionStep)} />
          <TrimButton label={`Roll tail -${precisionEditStepFrames}f`} tone="sky" onClick={() => onRollTrimSelected('end', -precisionStep)} />
          <TrimButton label={`Roll tail +${precisionEditStepFrames}f`} tone="sky" onClick={() => onRollTrimSelected('end', precisionStep)} />
          <TrimButton label={`Slide -${precisionEditStepFrames}f`} tone="amber" onClick={() => onSlideSelected(-precisionStep)} />
          <TrimButton label={`Slide +${precisionEditStepFrames}f`} tone="amber" onClick={() => onSlideSelected(precisionStep)} />
          <TrimButton
            label={`Audio head -${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio}
            onClick={() => onLinkedAudioSplitEdit('start', -precisionStep)}
          />
          <TrimButton
            label={`Audio head +${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio}
            onClick={() => onLinkedAudioSplitEdit('start', precisionStep)}
          />
          <TrimButton
            label={`Audio tail -${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio}
            onClick={() => onLinkedAudioSplitEdit('end', -precisionStep)}
          />
          <TrimButton
            label={`Audio tail +${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio}
            onClick={() => onLinkedAudioSplitEdit('end', precisionStep)}
          />
        </div>
      </div>
    </>
  );
}

function CommandButton({
  label,
  tone = 'emerald',
  onClick,
}: {
  label: string;
  tone?: 'emerald' | 'rose' | 'sky';
  onClick: () => void;
}) {
  return (
    <button className={`${baseCommandButtonClass} ${hoverBorderClass(tone)}`} onClick={onClick}>
      {label}
    </button>
  );
}

function TrimButton({
  label,
  tone = 'emerald',
  disabled = false,
  onClick,
}: {
  label: string;
  tone?: 'emerald' | 'sky' | 'amber' | 'lime';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${baseTrimButtonClass} ${hoverBorderClass(tone)} disabled:cursor-not-allowed disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function hoverBorderClass(tone: 'emerald' | 'rose' | 'sky' | 'amber' | 'lime') {
  switch (tone) {
    case 'rose':
      return 'hover:border-rose-500';
    case 'sky':
      return 'hover:border-sky-500';
    case 'amber':
      return 'hover:border-amber-500';
    case 'lime':
      return 'hover:border-lime-500';
    case 'emerald':
    default:
      return 'hover:border-emerald-500';
  }
}
