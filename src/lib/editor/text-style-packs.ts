import type { CaptionStyle } from './types';

export type TextStylePackTarget = 'title' | 'caption';

export interface TextStylePack {
  id: string;
  label: string;
  target: TextStylePackTarget;
  description: string;
  style: Required<CaptionStyle>;
}

export const TITLE_TEXT_STYLE_PACKS: readonly TextStylePack[] = [
  {
    id: 'title-clean-center',
    label: 'Clean',
    target: 'title',
    description: 'Centered white title with subtle shadow.',
    style: {
      fontSize: 76,
      fontColor: '#ffffff',
      boxEnabled: false,
      boxColor: '#000000',
      boxOpacity: 0.5,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowOpacity: 0.72,
      shadowOffset: 3,
      position: 'middle',
      align: 'center',
    },
  },
  {
    id: 'title-bold-box',
    label: 'Boxed',
    target: 'title',
    description: 'Large boxed title for hooks and section cards.',
    style: {
      fontSize: 88,
      fontColor: '#f8fafc',
      boxEnabled: true,
      boxColor: '#111827',
      boxOpacity: 0.74,
      shadowEnabled: false,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowOffset: 0,
      position: 'middle',
      align: 'center',
    },
  },
  {
    id: 'title-lower-third',
    label: 'Lower',
    target: 'title',
    description: 'Left aligned lower-third title with a broadcast box.',
    style: {
      fontSize: 58,
      fontColor: '#ecfeff',
      boxEnabled: true,
      boxColor: '#0f172a',
      boxOpacity: 0.78,
      shadowEnabled: true,
      shadowColor: '#020617',
      shadowOpacity: 0.62,
      shadowOffset: 2,
      position: 'bottom',
      align: 'left',
    },
  },
];

export const CAPTION_TEXT_STYLE_PACKS: readonly TextStylePack[] = [
  {
    id: 'caption-readable',
    label: 'Readable',
    target: 'caption',
    description: 'High contrast subtitle style for general dialogue.',
    style: {
      fontSize: 52,
      fontColor: '#ffffff',
      boxEnabled: true,
      boxColor: '#000000',
      boxOpacity: 0.62,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowOpacity: 0.65,
      shadowOffset: 2,
      position: 'bottom',
      align: 'center',
    },
  },
  {
    id: 'caption-creator-box',
    label: 'Creator',
    target: 'caption',
    description: 'Bright creator subtitle with a compact dark box.',
    style: {
      fontSize: 60,
      fontColor: '#fef08a',
      boxEnabled: true,
      boxColor: '#1f2937',
      boxOpacity: 0.68,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowOpacity: 0.58,
      shadowOffset: 2,
      position: 'bottom',
      align: 'center',
    },
  },
  {
    id: 'caption-top-note',
    label: 'Top',
    target: 'caption',
    description: 'Top-positioned caption for demos and screen recordings.',
    style: {
      fontSize: 46,
      fontColor: '#ecfeff',
      boxEnabled: true,
      boxColor: '#083344',
      boxOpacity: 0.64,
      shadowEnabled: false,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowOffset: 0,
      position: 'top',
      align: 'left',
    },
  },
];

export function listTextStylePacks(target: TextStylePackTarget): readonly TextStylePack[] {
  return target === 'title' ? TITLE_TEXT_STYLE_PACKS : CAPTION_TEXT_STYLE_PACKS;
}

export function findTextStylePack(target: TextStylePackTarget, packId: string): TextStylePack | undefined {
  return listTextStylePacks(target).find((pack) => pack.id === packId);
}

export function getTextStylePackStyle(target: TextStylePackTarget, packId: string): Required<CaptionStyle> {
  const pack = findTextStylePack(target, packId);
  if (!pack) {
    throw new Error(`Text style pack not found: ${packId}`);
  }

  return { ...pack.style };
}

export function textStylePackToPatch(pack: TextStylePack): CaptionStyle {
  return { ...pack.style };
}
