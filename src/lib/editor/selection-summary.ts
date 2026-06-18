import type { TimelineClip } from './types';

export interface SelectionCommonValue<T> {
  value: T | undefined;
  mixed: boolean;
  count: number;
}

export interface ClipSelectionPropertySummary {
  color: SelectionCommonValue<string>;
  volume: SelectionCommonValue<number>;
  opacity: SelectionCommonValue<number>;
  blendMode: SelectionCommonValue<TimelineClip['blendMode']>;
  reversed: SelectionCommonValue<boolean>;
  muted: SelectionCommonValue<boolean>;
  locked: SelectionCommonValue<boolean>;
}

export function readCommonSelectionValue<T>(
  clips: TimelineClip[],
  readValue: (clip: TimelineClip) => T,
  equals: (left: T, right: T) => boolean = Object.is,
): SelectionCommonValue<T> {
  if (clips.length === 0) {
    return {
      value: undefined,
      mixed: false,
      count: 0,
    };
  }

  const firstValue = readValue(clips[0]);
  const mixed = clips.some((clip) => !equals(readValue(clip), firstValue));

  return {
    value: mixed ? undefined : firstValue,
    mixed,
    count: clips.length,
  };
}

export function summarizeClipSelectionProperties(clips: TimelineClip[]): ClipSelectionPropertySummary {
  return {
    color: readCommonSelectionValue(clips, (clip) => clip.color.toLowerCase()),
    volume: readCommonSelectionValue(clips, (clip) => clip.volume),
    opacity: readCommonSelectionValue(clips, (clip) => clip.opacity),
    blendMode: readCommonSelectionValue(clips, (clip) => clip.blendMode),
    reversed: readCommonSelectionValue(clips, (clip) => Boolean(clip.reversed)),
    muted: readCommonSelectionValue(clips, (clip) => Boolean(clip.muted)),
    locked: readCommonSelectionValue(clips, (clip) => Boolean(clip.locked)),
  };
}
