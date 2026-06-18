import type { DragEvent, ReactNode } from 'react';
import { readAssetBin, resolveMediaBinAssetKindLabel, type MediaBinCollection, type MediaBinKindFilter, type MediaBinSmartCollection, type MediaBinSortKey } from '../../lib/editor/media-bin';
import type { MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import type { MediaAssetHealth } from '../../lib/editor/media-health';
import { resolveTimelineThumbnailSource } from '../../lib/editor/preview-source';
import { listSharedAssetLibraryItems, type SharedAssetLibraryItemId } from '../../lib/editor/shared-asset-library';
import type { EditorAsset } from '../../lib/editor/types';
import type { MediaCacheJobView } from './editor-view-model';
import { AssetHealthBadge, CacheJobStatus } from './media-health-cache-panels';
import type { VoiceoverRecordingState } from './voiceover-workflow-helpers';

export function MediaBinPanel({
  assets,
  totalAssetCount,
  fps,
  isDropActive,
  unusedAssetCount,
  searchQuery,
  kindFilter,
  smartFilter,
  binFilter,
  sortKey,
  smartCollections,
  binCollections,
  mediaCachePlan,
  bulkRelinkCandidateCount,
  selectedAssetId,
  assetReferenceCounts,
  healthByAssetId,
  cacheJobsByAssetId,
  sourceControls,
  voiceoverState,
  voiceoverSupported = false,
  voiceoverUnavailableReason,
  onDragOver,
  onDrop,
  onDragLeave,
  onImportMedia,
  onBulkRelinkAssets,
  onAddSharedLibraryAsset,
  onStartVoiceover,
  onStopVoiceover,
  onRemoveUnusedAssets,
  onRebuildFilteredMediaCache,
  onSearchQueryChange,
  onKindFilterChange,
  onSmartFilterChange,
  onBinFilterChange,
  onSortKeyChange,
  onAssetDragStart,
  onAssetDragEnd,
  onSelectSourceAsset,
  onRebuildMediaCache,
  onRelinkAsset,
  onRemoveAsset,
  onInsertAsset,
  onOverwriteAsset,
  onCancelMediaCache,
  onRetryMediaCache,
}: {
  assets: EditorAsset[];
  totalAssetCount: number;
  fps: number;
  isDropActive: boolean;
  unusedAssetCount: number;
  searchQuery: string;
  kindFilter: MediaBinKindFilter;
  smartFilter: MediaBinSmartCollection;
  binFilter: string;
  sortKey: MediaBinSortKey;
  smartCollections: MediaBinCollection[];
  binCollections: MediaBinCollection[];
  mediaCachePlan: MediaCacheBatchPlan;
  bulkRelinkCandidateCount: number;
  selectedAssetId?: string;
  assetReferenceCounts: Map<string, number>;
  healthByAssetId: Map<string, MediaAssetHealth>;
  cacheJobsByAssetId: Record<string, MediaCacheJobView>;
  sourceControls?: ReactNode;
  voiceoverState?: VoiceoverRecordingState;
  voiceoverSupported?: boolean;
  voiceoverUnavailableReason?: string;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onImportMedia: () => void;
  onBulkRelinkAssets: () => void | Promise<void>;
  onAddSharedLibraryAsset?: (itemId: SharedAssetLibraryItemId) => void;
  onStartVoiceover?: () => void | Promise<void>;
  onStopVoiceover?: () => void | Promise<void>;
  onRemoveUnusedAssets: () => void;
  onRebuildFilteredMediaCache: () => void | Promise<void>;
  onSearchQueryChange: (query: string) => void;
  onKindFilterChange: (filter: MediaBinKindFilter) => void;
  onSmartFilterChange: (filter: MediaBinSmartCollection) => void;
  onBinFilterChange: (filter: string) => void;
  onSortKeyChange: (sortKey: MediaBinSortKey) => void;
  onAssetDragStart: (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => void;
  onAssetDragEnd: () => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  return (
    <div
      className={`mt-6 rounded-md border p-2 transition-colors ${
        isDropActive ? 'border-emerald-500 bg-emerald-950/20' : 'border-transparent'
      }`}
      onDragOver={onDragOver}
      onDrop={(event) => void onDrop(event)}
      onDragLeave={onDragLeave}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assets</h2>
        <span className="text-[11px] text-zinc-500">
          {assets.length} / {totalAssetCount}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onImportMedia}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-emerald-500"
        >
          Import media
        </button>
        <button
          type="button"
          onClick={() => void onBulkRelinkAssets()}
          disabled={bulkRelinkCandidateCount === 0}
          title={bulkRelinkCandidateCount > 0 ? 'Select replacement files for offline or missing media' : 'No missing media assets need relinking'}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Relink missing ({bulkRelinkCandidateCount})
        </button>
        {onStartVoiceover && onStopVoiceover ? (
          <button
            type="button"
            onClick={() => {
              if (voiceoverState === 'recording') {
                void onStopVoiceover();
                return;
              }

              void onStartVoiceover();
            }}
            disabled={!voiceoverSupported || voiceoverState === 'requesting' || voiceoverState === 'processing'}
            title={voiceoverSupported ? 'Record voiceover' : voiceoverUnavailableReason ?? 'Voiceover recording unavailable'}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-lime-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {voiceoverState === 'recording'
              ? 'Stop voiceover'
              : voiceoverState === 'processing'
                ? 'Processing...'
                : voiceoverState === 'requesting'
                  ? 'Opening mic...'
                  : 'Record voiceover'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemoveUnusedAssets}
          disabled={unusedAssetCount === 0}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove unused ({unusedAssetCount})
        </button>
        <button
          type="button"
          onClick={() => void onRebuildFilteredMediaCache()}
          disabled={mediaCachePlan.targets.length === 0}
          title={`${mediaCachePlan.skipped.length} filtered asset${mediaCachePlan.skipped.length === 1 ? '' : 's'} skipped`}
          className="col-span-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cache filtered ({mediaCachePlan.targets.length})
        </button>
      </div>
      {onAddSharedLibraryAsset ? (
        <SharedAssetLibraryPanel onAddSharedLibraryAsset={onAddSharedLibraryAsset} />
      ) : null}
      <input
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
        placeholder="Search media"
        className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={kindFilter}
          onChange={(event) => onKindFilterChange(event.currentTarget.value as MediaBinKindFilter)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"
          title="Asset type"
        >
          <option value="all">All media</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
          <option value="text">Text</option>
          <option value="ai">AI</option>
          <option value="effect">Effect</option>
        </select>
        <select
          value={smartFilter}
          onChange={(event) => onSmartFilterChange(event.currentTarget.value as MediaBinSmartCollection)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"
          title="Smart collection"
        >
          {smartCollections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.label} ({collection.count})
            </option>
          ))}
        </select>
        <select
          value={binFilter}
          onChange={(event) => onBinFilterChange(event.currentTarget.value)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"
          title="Asset bin"
        >
          <option value="all">All bins</option>
          {binCollections.map((bin) => (
            <option key={bin.id} value={bin.id}>
              {bin.label} ({bin.count})
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(event) => onSortKeyChange(event.currentTarget.value as MediaBinSortKey)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"
          title="Sort assets"
        >
          <option value="name">Name</option>
          <option value="kind">Type</option>
          <option value="duration-desc">Longest</option>
          <option value="duration-asc">Shortest</option>
          <option value="used-desc">Most used</option>
          <option value="used-asc">Unused first</option>
        </select>
      </div>
      {isDropActive ? (
        <div className="mt-3 rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Drop media to import
        </div>
      ) : null}
      {sourceControls}
      <MediaBinAssetList
        assets={assets}
        fps={fps}
        selectedAssetId={selectedAssetId}
        assetReferenceCounts={assetReferenceCounts}
        healthByAssetId={healthByAssetId}
        cacheJobsByAssetId={cacheJobsByAssetId}
        onAssetDragStart={onAssetDragStart}
        onAssetDragEnd={onAssetDragEnd}
        onSelectSourceAsset={onSelectSourceAsset}
        onRebuildMediaCache={onRebuildMediaCache}
        onRelinkAsset={onRelinkAsset}
        onRemoveAsset={onRemoveAsset}
        onInsertAsset={onInsertAsset}
        onOverwriteAsset={onOverwriteAsset}
        onCancelMediaCache={onCancelMediaCache}
        onRetryMediaCache={onRetryMediaCache}
      />
    </div>
  );
}

function SharedAssetLibraryPanel({
  onAddSharedLibraryAsset,
}: {
  onAddSharedLibraryAsset: (itemId: SharedAssetLibraryItemId) => void;
}) {
  const items = listSharedAssetLibraryItems();

  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shared Library</span>
        <span className="text-[11px] text-zinc-500">{items.length} local</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.description}
            onClick={() => onAddSharedLibraryAsset(item.id)}
            className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-left hover:border-emerald-500 focus:border-emerald-500 focus:outline-none"
          >
            <span className="block truncate text-xs font-medium text-zinc-100">{item.label}</span>
            <span className="mt-1 block truncate text-[11px] text-zinc-500">{item.duration}s {item.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaBinAssetList({
  assets,
  fps,
  selectedAssetId,
  assetReferenceCounts,
  healthByAssetId,
  cacheJobsByAssetId,
  onAssetDragStart,
  onAssetDragEnd,
  onSelectSourceAsset,
  onRebuildMediaCache,
  onRelinkAsset,
  onRemoveAsset,
  onInsertAsset,
  onOverwriteAsset,
  onCancelMediaCache,
  onRetryMediaCache,
}: {
  assets: EditorAsset[];
  fps: number;
  selectedAssetId?: string;
  assetReferenceCounts: Map<string, number>;
  healthByAssetId: Map<string, MediaAssetHealth>;
  cacheJobsByAssetId: Record<string, MediaCacheJobView>;
  onAssetDragStart: (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => void;
  onAssetDragEnd: () => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  if (assets.length === 0) {
    return (
      <div className="mt-3 space-y-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
          No matching assets
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {assets.map((asset) => (
        <MediaBinAssetCard
          key={asset.id}
          asset={asset}
          fps={fps}
          selected={selectedAssetId === asset.id}
          referenceCount={assetReferenceCounts.get(asset.id) ?? 0}
          health={healthByAssetId.get(asset.id)}
          cacheJob={cacheJobsByAssetId[asset.id]}
          onDragStart={onAssetDragStart}
          onDragEnd={onAssetDragEnd}
          onSelectSourceAsset={onSelectSourceAsset}
          onRebuildMediaCache={onRebuildMediaCache}
          onRelinkAsset={onRelinkAsset}
          onRemoveAsset={onRemoveAsset}
          onInsertAsset={onInsertAsset}
          onOverwriteAsset={onOverwriteAsset}
          onCancelMediaCache={onCancelMediaCache}
          onRetryMediaCache={onRetryMediaCache}
        />
      ))}
    </div>
  );
}

function MediaBinAssetCard({
  asset,
  fps,
  selected,
  referenceCount,
  health,
  cacheJob,
  onDragStart,
  onDragEnd,
  onSelectSourceAsset,
  onRebuildMediaCache,
  onRelinkAsset,
  onRemoveAsset,
  onInsertAsset,
  onOverwriteAsset,
  onCancelMediaCache,
  onRetryMediaCache,
}: {
  asset: EditorAsset;
  fps: number;
  selected: boolean;
  referenceCount: number;
  health?: MediaAssetHealth;
  cacheJob?: MediaCacheJobView;
  onDragStart: (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => void;
  onDragEnd: () => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  const thumbnailSource = resolveTimelineThumbnailSource(asset, asset.kind);

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, asset)}
      onDragEnd={onDragEnd}
      className={`rounded-md border bg-zinc-900 p-3 ${
        selected ? 'border-emerald-600' : 'border-zinc-800'
      } cursor-grab active:cursor-grabbing`}
    >
      {thumbnailSource ? (
        <img
          src={thumbnailSource}
          alt={asset.name}
          className="mb-3 aspect-video w-full rounded border border-zinc-800 object-cover"
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{asset.name}</span>
        <span className="rounded bg-zinc-800 px-2 py-1 text-[11px] uppercase text-zinc-400">
          {resolveMediaBinAssetKindLabel(asset)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{formatTimecode(asset.duration, fps)} / {formatAssetReferenceCount(referenceCount)}</span>
        <span className="max-w-[9rem] truncate rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">
          {readAssetBin(asset)}
        </span>
        <div className="grid w-full grid-cols-2 gap-1">
          <button
            type="button"
            aria-label={`Open ${asset.name} in Source Monitor`}
            onClick={() => onSelectSourceAsset(asset.id)}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-emerald-500"
          >
            Source
          </button>
          <button
            type="button"
            aria-label={`Build cache for ${asset.name}`}
            onClick={() => void onRebuildMediaCache(asset)}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-sky-500"
          >
            Cache
          </button>
          <button
            type="button"
            aria-label={`Relink ${asset.name}`}
            onClick={() => onRelinkAsset(asset.id)}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-amber-500"
          >
            Relink
          </button>
          <button
            type="button"
            aria-label={`Delete ${asset.name}`}
            onClick={() => onRemoveAsset(asset.id)}
            disabled={referenceCount > 0}
            title={referenceCount > 0 ? 'Delete timeline clips before removing this asset' : 'Remove asset from bin'}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete
          </button>
          <button
            type="button"
            aria-label={`Insert ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onInsertAsset(asset.id);
            }}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-emerald-500"
          >
            Insert
          </button>
          <button
            type="button"
            aria-label={`Overwrite ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onOverwriteAsset(asset.id);
            }}
            className="min-w-0 truncate rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-amber-500"
          >
            Overwrite
          </button>
        </div>
      </div>
      <div className="mt-2 truncate text-[11px] text-zinc-500">
        {buildAssetMetadataSummary(asset)}
      </div>
      <AssetHealthBadge health={health} />
      {cacheJob ? (
        <CacheJobStatus
          job={cacheJob}
          onCancel={() => void onCancelMediaCache(asset.id)}
          onRetry={() => void onRetryMediaCache(asset.id)}
        />
      ) : null}
    </div>
  );
}

function buildAssetMetadataSummary(asset: EditorAsset): string {
  const parts = [];
  if (asset.width && asset.height) {
    parts.push(`${asset.width}x${asset.height}`);
  }

  if (asset.fps) {
    parts.push(`${asset.fps} fps`);
  }

  const videoCodec = asset.metadata?.videoCodec;
  if (typeof videoCodec === 'string') {
    parts.push(videoCodec.toUpperCase());
  }

  const audioCodec = asset.metadata?.audioCodec;
  if (typeof audioCodec === 'string') {
    parts.push(`${audioCodec.toUpperCase()} audio`);
  }

  const audioChannels = asset.metadata?.audioChannels;
  if (typeof audioChannels === 'number') {
    parts.push(`${audioChannels} ch`);
  }

  if (asset.mediaCache?.proxySource) {
    parts.push('proxy');
  }

  if (asset.mediaCache?.thumbnailSource) {
    parts.push('thumb');
  }

  if (asset.mediaCache?.waveformPeaks?.length) {
    parts.push('waveform');
  }

  const analysisWarning = asset.metadata?.analysisWarning;
  if (typeof analysisWarning === 'string') {
    parts.push('analysis warning');
  }

  const cacheWarning = asset.metadata?.cacheWarning;
  if (typeof cacheWarning === 'string') {
    parts.push('cache warning');
  }

  return parts.length > 0 ? parts.join(' / ') : 'metadata pending';
}

function formatAssetReferenceCount(referenceCount: number): string {
  if (referenceCount <= 0) {
    return 'Unused';
  }

  return referenceCount === 1 ? '1 use' : `${referenceCount} uses`;
}

function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(Math.min(frames, fps - 1))}`;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
