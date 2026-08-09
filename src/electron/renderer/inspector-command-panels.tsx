import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TimelineTransition } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import { NumberField } from './editor-form-controls';
import { useMenuLanguage } from './use-menu-language';
import { describeEditorCommandGesture, type EditorCommandId } from '../../lib/editor/command-registry';

type InspectorTransitionType = Exclude<TimelineTransition['type'], 'cut' | 'match-cut'>;

interface InspectorCommandPanelsProps {
  fps: number;
  clipArrangeGap: number;
  precisionEditStepFrames: number;
  selectedClipCount: number;
  clipboardClipCount: number;
  hasAttributeClipboard: boolean;
  hasMarkedRange: boolean;
  canSplitAtPlayhead: boolean;
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

const baseCommandButtonClass = 'rounded-md border border-ds-200 bg-surface px-3 py-2 text-sm';
const baseTrimButtonClass = 'rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm';

const inspectorCommandText: Record<DanbiMenuLanguage, {
  arrange: string;
  apply: string;
  clipboard: string;
  clip: string;
  gap: string;
  pack: string;
  precisionTrim: string;
  primary: string;
  range: string;
  rangeOff: string;
  rangeOn: string;
  selected: string;
  stepFrames: string;
  transitions: string;
  actions: {
    append: string;
    copy: string;
    copyAttr: string;
    crossfade: string;
    cut: string;
    cutAll: string;
    cutAtPlayhead: string;
    delete: string;
    deleteLeft: string;
    deleteRight: string;
    dip: string;
    duplicate: string;
    extractRange: string;
    group: string;
    liftRange: string;
    markIn: string;
    markOut: string;
    matchFrame: string;
    paste: string;
    pasteAttr: string;
    push: string;
    rippleDelete: string;
    trimIn: string;
    trimOut: string;
    ungroup: string;
    wipe: string;
  };
  trim: {
    audioHead: (frames: number, direction: '-' | '+') => string;
    audioTail: (frames: number, direction: '-' | '+') => string;
    rollHead: (frames: number, direction: '-' | '+') => string;
    rollTail: (frames: number, direction: '-' | '+') => string;
    slide: (frames: number, direction: '-' | '+') => string;
    slip: (frames: number, direction: '-' | '+') => string;
  };
}> = {
  en: {
    arrange: 'Arrange',
    apply: 'Apply',
    clipboard: 'Clipboard',
    clip: 'Clip',
    gap: 'Gap',
    pack: 'Pack',
    precisionTrim: 'Precision Trim',
    primary: 'Primary',
    range: 'Range',
    rangeOff: 'off',
    rangeOn: 'on',
    selected: 'Sel',
    stepFrames: 'Step frames',
    transitions: 'Transitions',
    actions: {
      append: 'Append',
      copy: 'Copy',
      copyAttr: 'Copy attr',
      crossfade: 'Crossfade',
      cut: 'Cut',
      cutAll: 'Cut all',
      cutAtPlayhead: 'Cut at playhead',
      delete: 'Delete',
      deleteLeft: 'Delete left',
      deleteRight: 'Delete right',
      dip: 'Dip',
      duplicate: 'Duplicate',
      extractRange: 'Extract range',
      group: 'Group',
      liftRange: 'Lift range',
      markIn: 'Mark in',
      markOut: 'Mark out',
      matchFrame: 'Match frame',
      paste: 'Paste',
      pasteAttr: 'Paste attr',
      push: 'Push',
      rippleDelete: 'Ripple delete',
      trimIn: 'Trim in',
      trimOut: 'Trim out',
      ungroup: 'Ungroup',
      wipe: 'Wipe',
    },
    trim: {
      audioHead: (frames, direction) => `Audio head ${direction}${frames}f`,
      audioTail: (frames, direction) => `Audio tail ${direction}${frames}f`,
      rollHead: (frames, direction) => `Roll head ${direction}${frames}f`,
      rollTail: (frames, direction) => `Roll tail ${direction}${frames}f`,
      slide: (frames, direction) => `Slide ${direction}${frames}f`,
      slip: (frames, direction) => `Slip ${direction}${frames}f`,
    },
  },
  ko: {
    arrange: '정렬',
    apply: '적용',
    clipboard: '클립보드',
    clip: '클립',
    gap: '간격',
    pack: '붙이기',
    precisionTrim: '정밀 트림',
    primary: '기본',
    range: '범위',
    rangeOff: '꺼짐',
    rangeOn: '켜짐',
    selected: '선택',
    stepFrames: '프레임 단위',
    transitions: '전환',
    actions: {
      append: '끝에 추가',
      copy: '복사',
      copyAttr: '속성 복사',
      crossfade: '크로스페이드',
      cut: '잘라내기',
      cutAll: '전체 자르기',
      cutAtPlayhead: '재생헤드에서 자르기',
      delete: '삭제',
      deleteLeft: '왼쪽 삭제',
      deleteRight: '오른쪽 삭제',
      dip: '딥',
      duplicate: '복제',
      extractRange: '범위 추출',
      group: '그룹',
      liftRange: '범위 리프트',
      markIn: '인 마크',
      markOut: '아웃 마크',
      matchFrame: '소스 프레임',
      paste: '붙여넣기',
      pasteAttr: '속성 붙여넣기',
      push: '밀기',
      rippleDelete: '리플 삭제',
      trimIn: '앞 트림',
      trimOut: '뒤 트림',
      ungroup: '그룹 해제',
      wipe: '와이프',
    },
    trim: {
      audioHead: (frames, direction) => `오디오 앞 ${direction}${frames}f`,
      audioTail: (frames, direction) => `오디오 뒤 ${direction}${frames}f`,
      rollHead: (frames, direction) => `롤 앞 ${direction}${frames}f`,
      rollTail: (frames, direction) => `롤 뒤 ${direction}${frames}f`,
      slide: (frames, direction) => `슬라이드 ${direction}${frames}f`,
      slip: (frames, direction) => `슬립 ${direction}${frames}f`,
    },
  },
};

export function InspectorCommandPanels({
  fps,
  clipArrangeGap,
  precisionEditStepFrames,
  selectedClipCount,
  clipboardClipCount,
  hasAttributeClipboard,
  hasMarkedRange,
  canSplitAtPlayhead,
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
  const language = useMenuLanguage();
  const text = inspectorCommandText[language];
  const frameStep = 1 / fps;
  const precisionStep = precisionEditStepFrames / fps;
  const hasSelection = selectedClipCount > 0;
  const hasClipboard = clipboardClipCount > 0;
  const canPasteAttributes = hasSelection && hasAttributeClipboard;
  const canApplyMultiClipCommand = selectedClipCount >= 2;

  return (
    <>
      <div
        data-testid="inspector-command-panel"
        data-selected-clip-count={selectedClipCount}
        data-clipboard-count={clipboardClipCount}
        data-has-attribute-clipboard={hasAttributeClipboard ? 'true' : 'false'}
        data-has-marked-range={hasMarkedRange ? 'true' : 'false'}
        data-density="clustered"
        data-command-cluster-count="4"
        className="space-y-2"
      >
        <div
          data-testid="inspector-command-density-summary"
          data-has-selection={hasSelection ? 'true' : 'false'}
          data-has-clipboard={hasClipboard ? 'true' : 'false'}
          data-can-paste-attributes={canPasteAttributes ? 'true' : 'false'}
          className="grid grid-cols-3 gap-1 text-micro uppercase tracking-wide"
        >
          <span className="rounded bg-paper px-1.5 py-1 text-ds-700">{text.selected} {selectedClipCount}</span>
          <span className="rounded bg-paper px-1.5 py-1 text-ds-700">{text.clip} {clipboardClipCount}</span>
          <span className={`rounded px-1.5 py-1 ${hasMarkedRange ? 'bg-accent-500/10 text-accent-800' : 'bg-paper text-ds-600'}`}>
            {text.range} {hasMarkedRange ? text.rangeOn : text.rangeOff}
          </span>
        </div>
        <CommandCluster label={text.primary} testId="inspector-command-cluster-primary" defaultOpen>
          <CommandButton label={text.actions.cutAtPlayhead} testLabel="Cut at playhead" gesture="edit.split" disabled={!canSplitAtPlayhead} onClick={onSplit} />
          <CommandButton label={text.actions.cutAll} testLabel="Cut all" onClick={onSplitAll} />
          <CommandButton label={text.actions.trimIn} testLabel="Trim in" gesture="trim.toPlayhead" disabled={!hasSelection} onClick={() => onTrimToPlayhead('start')} />
          <CommandButton label={text.actions.trimOut} testLabel="Trim out" gesture="trim.toPlayhead" disabled={!hasSelection} onClick={() => onTrimToPlayhead('end')} />
          <CommandButton label={text.actions.deleteLeft} testLabel="Delete left" gesture="edit.deleteLeftOfPlayhead" disabled={!hasSelection} onClick={() => onDeleteSide('left')} />
          <CommandButton label={text.actions.deleteRight} testLabel="Delete right" gesture="edit.deleteRightOfPlayhead" disabled={!hasSelection} onClick={() => onDeleteSide('right')} />
          <CommandButton label={text.actions.duplicate} testLabel="Duplicate" gesture="edit.duplicateSelection" disabled={!hasSelection} onClick={onDuplicateSelectedClips} />
          <CommandButton label={text.actions.group} testLabel="Group" gesture="edit.groupSelection" disabled={!canApplyMultiClipCommand} onClick={onGroupSelectedClips} />
        </CommandCluster>
        <CommandCluster label={text.clipboard} testId="inspector-command-cluster-clipboard">
          <CommandButton label={text.actions.ungroup} testLabel="Ungroup" gesture="edit.ungroupSelection" disabled={!hasSelection} onClick={onUngroupSelectedClips} />
          <CommandButton label={text.actions.copy} testLabel="Copy" gesture="clipboard.copyCutPaste" disabled={!hasSelection} onClick={onCopySelected} />
          <CommandButton label={text.actions.copyAttr} testLabel="Copy attr" gesture="clipboard.attributes" disabled={!hasSelection} onClick={onCopyClipAttributes} />
          <CommandButton label={text.actions.cut} testLabel="Cut" gesture="clipboard.cutSelection" disabled={!hasSelection} onClick={onCutSelected} />
          <CommandButton label={text.actions.paste} testLabel="Paste" gesture="clipboard.pasteSelection" disabled={!hasClipboard} onClick={onPasteClipboard} />
          <CommandButton label={text.actions.pasteAttr} testLabel="Paste attr" gesture="clipboard.pasteAttributes" disabled={!canPasteAttributes} onClick={onPasteClipAttributes} />
          <CommandButton label={text.actions.append} testLabel="Append" gesture="clipboard.appendSelection" disabled={!hasClipboard} onClick={onAppendClipboard} />
          <CommandButton label={text.actions.matchFrame} testLabel="Match frame" tone="sky" disabled={!hasSelection} onClick={onMatchFrameToSource} />
        </CommandCluster>
        <CommandCluster label={text.range} testId="inspector-command-cluster-range">
          <CommandButton label={text.actions.markIn} testLabel="Mark in" gesture="timeline.setMark" onClick={() => onSetMark('in')} />
          <CommandButton label={text.actions.markOut} testLabel="Mark out" gesture="timeline.setMark" onClick={() => onSetMark('out')} />
          <CommandButton label={text.actions.liftRange} testLabel="Lift range" gesture="timeline.liftMarkedRange" tone="rose" disabled={!hasMarkedRange} onClick={() => onDeleteMarkedRange(false)} />
          <CommandButton label={text.actions.extractRange} testLabel="Extract range" gesture="timeline.cutMarkedRange" tone="rose" disabled={!hasMarkedRange} onClick={() => onDeleteMarkedRange(true)} />
          <CommandButton label={text.actions.delete} testLabel="Delete" gesture="edit.deleteSelection" tone="rose" disabled={!hasSelection} onClick={() => onDeleteSelected(false)} />
          <CommandButton label={text.actions.rippleDelete} testLabel="Ripple delete" gesture="edit.rippleDeleteSelection" tone="rose" disabled={!hasSelection} onClick={() => onDeleteSelected(true)} />
          <CommandButton label={language === 'ko' ? '-1 프레임' : '-1 frame'} testLabel="-1 frame" gesture="edit.moveSelection" disabled={!hasSelection} onClick={() => onMoveSelected(-frameStep)} />
          <CommandButton label={language === 'ko' ? '+1 프레임' : '+1 frame'} testLabel="+1 frame" gesture="edit.moveSelection" disabled={!hasSelection} onClick={() => onMoveSelected(frameStep)} />
        </CommandCluster>
        <CommandCluster label={text.transitions} testId="inspector-command-cluster-transitions">
          <CommandButton label={text.actions.crossfade} testLabel="Crossfade" gesture="transition.applyCrossfade" disabled={!hasSelection} onClick={() => onApplyTransition('crossfade')} />
          <CommandButton label={text.actions.dip} testLabel="Dip" gesture="transition.applyDip" disabled={!hasSelection} onClick={() => onApplyTransition('dip')} />
          <CommandButton label={text.actions.push} testLabel="Push" gesture="transition.applyPush" disabled={!hasSelection} onClick={() => onApplyTransition('push')} />
          <CommandButton label={text.actions.wipe} testLabel="Wipe" gesture="transition.applyWipe" disabled={!hasSelection} onClick={() => onApplyTransition('wipe')} />
          <button
            data-testid="inspector-command-ai-morph"
            title={`${language === 'ko' ? 'AI 모프' : 'AI Morph'}
${describeEditorCommandGesture('transition.applyAiMorph')}`}
            className="rounded-md border border-accent2-500/40 bg-accent2-500/10 px-3 py-2 text-sm text-accent2-900 hover:border-accent2-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasSelection}
            onClick={() => onApplyTransition('ai-morph')}
          >
            {language === 'ko' ? 'AI 모프' : 'AI Morph'}
          </button>
        </CommandCluster>
      </div>

      <div className="rounded-md border border-ds-200 bg-surface p-3">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.arrange}</h2>
        <div className="mt-3 grid grid-cols-[1fr_88px_88px] items-end gap-2">
          <NumberField
            label={text.gap}
            value={clipArrangeGap}
            step={0.05}
            min={0}
            max={60}
            onChange={onClipArrangeGapChange}
          />
          <button
            type="button"
            data-testid="inspector-command-pack"
            title={`${text.pack}
${describeEditorCommandGesture('edit.packSelection')}`}
            onClick={() => onArrangeSelectedClips(0)}
            className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={selectedClipCount < 2}
          >
            {text.pack}
          </button>
          <button
            type="button"
            data-testid="inspector-command-arrange-apply"
            onClick={() => onArrangeSelectedClips()}
            className="rounded-md border border-ds-200 bg-paper px-3 py-2 text-sm hover:border-info-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={selectedClipCount < 2}
          >
            {text.apply}
          </button>
        </div>
      </div>

      <details className="rounded-md border border-ds-200 bg-surface p-3">
        <summary className="cursor-pointer list-none text-kicker font-heading font-semibold uppercase text-ds-600 hover:text-ds-800">
          {text.precisionTrim}
        </summary>
        <div className="mt-3">
          <NumberField
            label={text.stepFrames}
            value={precisionEditStepFrames}
            step={1}
            min={1}
            max={600}
            onChange={onPrecisionEditStepFramesChange}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TrimButton label={text.trim.slip(precisionEditStepFrames, '-')} testLabel={`Slip -${precisionEditStepFrames}f`} gesture="trim.slipDrag" disabled={!hasSelection} onClick={() => onSlipSelected(-precisionStep)} />
          <TrimButton label={text.trim.slip(precisionEditStepFrames, '+')} testLabel={`Slip +${precisionEditStepFrames}f`} gesture="trim.slipDrag" disabled={!hasSelection} onClick={() => onSlipSelected(precisionStep)} />
          <TrimButton label={text.trim.rollHead(precisionEditStepFrames, '-')} testLabel={`Roll head -${precisionEditStepFrames}f`} gesture="trim.rollDrag" tone="sky" disabled={!hasSelection} onClick={() => onRollTrimSelected('start', -precisionStep)} />
          <TrimButton label={text.trim.rollHead(precisionEditStepFrames, '+')} testLabel={`Roll head +${precisionEditStepFrames}f`} gesture="trim.rollDrag" tone="sky" disabled={!hasSelection} onClick={() => onRollTrimSelected('start', precisionStep)} />
          <TrimButton label={text.trim.rollTail(precisionEditStepFrames, '-')} testLabel={`Roll tail -${precisionEditStepFrames}f`} gesture="trim.rollDrag" tone="sky" disabled={!hasSelection} onClick={() => onRollTrimSelected('end', -precisionStep)} />
          <TrimButton label={text.trim.rollTail(precisionEditStepFrames, '+')} testLabel={`Roll tail +${precisionEditStepFrames}f`} gesture="trim.rollDrag" tone="sky" disabled={!hasSelection} onClick={() => onRollTrimSelected('end', precisionStep)} />
          <TrimButton label={text.trim.slide(precisionEditStepFrames, '-')} testLabel={`Slide -${precisionEditStepFrames}f`} gesture="trim.slideDrag" tone="amber" disabled={!hasSelection} onClick={() => onSlideSelected(-precisionStep)} />
          <TrimButton label={text.trim.slide(precisionEditStepFrames, '+')} testLabel={`Slide +${precisionEditStepFrames}f`} gesture="trim.slideDrag" tone="amber" disabled={!hasSelection} onClick={() => onSlideSelected(precisionStep)} />
          <TrimButton
            label={text.trim.audioHead(precisionEditStepFrames, '-')}
            testLabel={`Audio head -${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio || !hasSelection}
            onClick={() => onLinkedAudioSplitEdit('start', -precisionStep)}
          />
          <TrimButton
            label={text.trim.audioHead(precisionEditStepFrames, '+')}
            testLabel={`Audio head +${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio || !hasSelection}
            onClick={() => onLinkedAudioSplitEdit('start', precisionStep)}
          />
          <TrimButton
            label={text.trim.audioTail(precisionEditStepFrames, '-')}
            testLabel={`Audio tail -${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio || !hasSelection}
            onClick={() => onLinkedAudioSplitEdit('end', -precisionStep)}
          />
          <TrimButton
            label={text.trim.audioTail(precisionEditStepFrames, '+')}
            testLabel={`Audio tail +${precisionEditStepFrames}f`}
            tone="lime"
            disabled={!selectedCanRelinkAudio || !hasSelection}
            onClick={() => onLinkedAudioSplitEdit('end', precisionStep)}
          />
        </div>
      </details>
    </>
  );
}

/**
 * A collapsible group of timeline commands.
 *
 * These clusters printed all at once: 29 controls, 987px, inside a 448px
 * inspector — so the panel that exists to show a clip's PROPERTIES opened on
 * two screens of buttons and you had to scroll past them to reach Scale and
 * Position. Everything is still one click away; only `Primary` starts open.
 */
function CommandCluster({
  label,
  testId,
  defaultOpen = false,
  children,
}: {
  label: string;
  testId: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid={testId}
      data-command-cluster-label={label}
      className="rounded-md border border-ds-200 bg-paper/45 p-2"
    >
      <summary className="cursor-pointer list-none text-micro font-semibold uppercase tracking-wide text-ds-600 hover:text-ds-800">
        {label}
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {children}
      </div>
    </details>
  );
}

function CommandButton({
  label,
  testLabel = label,
  tone = 'emerald',
  disabled = false,
  gesture,
  onClick,
}: {
  label: string;
  testLabel?: string;
  tone?: 'emerald' | 'rose' | 'sky';
  disabled?: boolean;
  /** The registered command this button runs, so its tooltip can name the
      shortcut. Read from the registry, never retyped here. */
  gesture?: EditorCommandId;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={`inspector-command-${toActionTestId(testLabel)}`}
      title={gesture ? `${label}
${describeEditorCommandGesture(gesture)}` : label}
      className={`${baseCommandButtonClass} ${hoverBorderClass(tone)} disabled:cursor-not-allowed disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function TrimButton({
  label,
  testLabel = label,
  tone = 'emerald',
  disabled = false,
  gesture,
  onClick,
}: {
  label: string;
  testLabel?: string;
  tone?: 'emerald' | 'sky' | 'amber' | 'lime';
  disabled?: boolean;
  /** The command this button duplicates, so its tooltip can teach the faster
      gesture. These frame-nudge buttons exist because the drag gestures were
      never surfaced; naming the gesture here is how someone finds it. */
  gesture?: EditorCommandId;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={`inspector-command-${toActionTestId(testLabel)}`}
      title={gesture ? `${label}
${describeEditorCommandGesture(gesture)}` : label}
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
      return 'hover:border-danger-500';
    case 'sky':
      return 'hover:border-info-500';
    case 'amber':
      return 'hover:border-warn-500';
    case 'lime':
      return 'hover:border-accent-500';
    case 'emerald':
    default:
      return 'hover:border-accent-500';
  }
}

function toActionTestId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
