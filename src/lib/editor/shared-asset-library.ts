import type { ClipKind, EditorAsset, EditorProject } from './types';

export interface SharedAssetLibraryItem {
  id: 'title-card' | 'lower-third' | 'end-card' | 'chapter-divider';
  label: string;
  kind: Extract<ClipKind, 'text'>;
  description: string;
  duration: number;
  source: string;
  tags: readonly string[];
}

export interface SharedAssetLibraryAddResult {
  project: EditorProject;
  item: SharedAssetLibraryItem;
  assetId: string;
  added: boolean;
  status: string;
}

export const SHARED_ASSET_LIBRARY_BIN = 'Shared Library';

export const SHARED_ASSET_LIBRARY_ITEMS: readonly SharedAssetLibraryItem[] = [
  {
    id: 'title-card',
    label: 'Title Card',
    kind: 'text',
    description: 'Reusable opening title text asset.',
    duration: 4,
    source: 'Opening Title',
    tags: ['title', 'opener'],
  },
  {
    id: 'lower-third',
    label: 'Lower Third',
    kind: 'text',
    description: 'Reusable name or section lower-third text.',
    duration: 5,
    source: 'Name\nRole or context',
    tags: ['title', 'lower-third'],
  },
  {
    id: 'end-card',
    label: 'End Card',
    kind: 'text',
    description: 'Reusable closing call-to-action text.',
    duration: 5,
    source: 'Thanks for watching',
    tags: ['title', 'outro'],
  },
  {
    id: 'chapter-divider',
    label: 'Chapter Divider',
    kind: 'text',
    description: 'Reusable section divider text.',
    duration: 3,
    source: 'Next Section',
    tags: ['title', 'chapter'],
  },
];

export type SharedAssetLibraryItemId = SharedAssetLibraryItem['id'];

export function listSharedAssetLibraryItems(): readonly SharedAssetLibraryItem[] {
  return SHARED_ASSET_LIBRARY_ITEMS;
}

export function findSharedAssetLibraryItem(itemId: SharedAssetLibraryItemId | string): SharedAssetLibraryItem | undefined {
  return SHARED_ASSET_LIBRARY_ITEMS.find((item) => item.id === itemId);
}

export function addSharedAssetLibraryItemToProject(
  project: EditorProject,
  itemId: SharedAssetLibraryItemId | string,
): SharedAssetLibraryAddResult {
  const item = findSharedAssetLibraryItem(itemId);
  if (!item) {
    throw new Error(`Shared asset library item not found: ${itemId}`);
  }

  const existingAsset = project.assets.find((asset) => asset.metadata?.sharedLibraryItemId === item.id);
  if (existingAsset) {
    return {
      project,
      item,
      assetId: existingAsset.id,
      added: false,
      status: `${item.label} is already in the Media Bin`,
    };
  }

  const asset = buildSharedLibraryAsset(item, project);
  return {
    project: {
      ...project,
      assets: [...project.assets, asset],
      updatedAt: new Date().toISOString(),
    },
    item,
    assetId: asset.id,
    added: true,
    status: `Added ${item.label} to the Media Bin`,
  };
}

function buildSharedLibraryAsset(item: SharedAssetLibraryItem, project: EditorProject): EditorAsset {
  return {
    id: uniqueAssetId(`asset-shared-${item.id}`, new Set(project.assets.map((asset) => asset.id))),
    name: item.label,
    kind: item.kind,
    source: item.source,
    duration: item.duration,
    metadata: {
      bin: SHARED_ASSET_LIBRARY_BIN,
      sharedLibrary: true,
      sharedLibraryItemId: item.id,
      sharedLibraryTags: item.tags.join(','),
      generated: false,
    },
  };
}

function uniqueAssetId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}
