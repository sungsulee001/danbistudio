import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { resolveMediaBinAssetKindLabel, type MediaBinCollection, type MediaBinKindFilter, type MediaBinSmartCollection, type MediaBinSortKey } from '../../lib/editor/media-bin';
import type { MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import type { MediaAssetHealth } from '../../lib/editor/media-health';
import { resolveTimelineThumbnailSource } from '../../lib/editor/preview-source';
import { listSharedAssetLibraryItems, type SharedAssetLibraryItemId } from '../../lib/editor/shared-asset-library';
import type { EditorAsset } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import type { MediaCacheJobView } from './editor-view-model';
import { AssetHealthBadge, CacheJobStatus } from './media-health-cache-panels';
import { useMenuLanguage } from './use-menu-language';
import type { VoiceoverRecordingState } from './voiceover-workflow-helpers';

const mediaBinText: Record<DanbiMenuLanguage, {
  add: string;
  added: string;
  allBins: string;
  allMedia: string;
  assetBin: string;
  assetType: string;
  audio: string;
  blocked: string;
  cache: string;
  cacheFiltered: string;
  cacheWarning: string;
  caching: string;
  delete: string;
  deleteDisabled: string;
  deleteTitle: string;
  drag: string;
  dragging: string;
  dropMedia: string;
  effect: string;
  filteredSkipped: (count: number) => string;
  grid: string;
  image: string;
  import: string;
  issues: string;
  kind: string;
  list: string;
  local: string;
  longest: string;
  manage: string;
  media: string;
  metadataPending: string;
  mostUsed: string;
  name: string;
  noMatchingAssets: string;
  noMissingRelink: string;
  openMic: string;
  over: string;
  overwrite: string;
  processing: string;
  proxy: string;
  queued: string;
  ready: string;
  record: string;
  recordTitle: string;
  relink: string;
  relinkMissing: string;
  relinkTitle: string;
  removeUnused: string;
  review: string;
  searchMedia: string;
  selectReplacement: string;
  sharedLibrary: string;
  shortest: string;
  smartCollection: string;
  sortAssets: string;
  source: string;
  sourceControls: string;
  sourcePrefix: string;
  stopVoiceover: string;
  text: string;
  thumb: string;
  timeline: string;
  timelineUses: (count: number) => string;
  type: string;
  unused: string;
  unusedFirst: string;
  usage: (count: number) => string;
  video: string;
  visible: string;
  voiceoverUnavailable: string;
  waveform: string;
}> = {
  en: {
    add: '+ Add',
    added: 'Added',
    allBins: 'All bins',
    allMedia: 'All media',
    assetBin: 'Asset bin',
    assetType: 'Asset type',
    audio: 'Audio',
    blocked: 'Blocked',
    cache: 'Cache',
    cacheFiltered: 'Cache filtered',
    cacheWarning: 'cache warning',
    caching: 'Caching',
    delete: 'Delete',
    deleteDisabled: 'Delete timeline clips before removing this asset',
    deleteTitle: 'Remove asset from bin',
    drag: 'Drag',
    dragging: 'Dragging',
    dropMedia: 'Drop media to import',
    effect: 'Effect',
    filteredSkipped: (count) => `${count} filtered asset${count === 1 ? '' : 's'} skipped`,
    grid: 'Grid',
    image: 'Image',
    import: '+ Import',
    issues: 'issues',
    kind: 'kind',
    list: 'List',
    local: 'local',
    longest: 'Longest',
    manage: 'Manage',
    media: 'Media',
    metadataPending: 'metadata pending',
    mostUsed: 'Most used',
    name: 'Name',
    noMatchingAssets: 'No matching assets',
    noMissingRelink: 'No missing media assets need relinking',
    openMic: 'Opening mic...',
    over: 'Over',
    overwrite: 'Overwrite',
    processing: 'Processing...',
    proxy: 'proxy',
    queued: 'Queued',
    ready: 'Ready',
    record: 'Record',
    recordTitle: 'Record voiceover',
    relink: 'Relink',
    relinkMissing: 'Relink missing',
    relinkTitle: 'Select replacement files for offline or missing media',
    removeUnused: 'Remove unused',
    review: 'Review',
    searchMedia: 'Search media',
    selectReplacement: 'Select replacement files for offline or missing media',
    sharedLibrary: 'Shared library',
    shortest: 'Shortest',
    smartCollection: 'Smart collection',
    sortAssets: 'Sort assets',
    source: 'Source',
    sourceControls: 'Source controls',
    sourcePrefix: 'Source',
    stopVoiceover: 'Stop voiceover',
    text: 'Text',
    thumb: 'thumb',
    timeline: 'Timeline',
    timelineUses: (count) => `Timeline ${count}`,
    type: 'Type',
    unused: 'Unused',
    unusedFirst: 'Unused first',
    usage: (count) => (count === 1 ? '1 use' : `${count} uses`),
    video: 'Video',
    visible: 'Visible',
    voiceoverUnavailable: 'Voiceover recording unavailable',
    waveform: 'waveform',
  },
  ko: {
    add: '+ 추가',
    added: '추가됨',
    allBins: '모든 보관함',
    allMedia: '전체 미디어',
    assetBin: '에셋 보관함',
    assetType: '에셋 유형',
    audio: '오디오',
    blocked: '차단',
    cache: '캐시',
    cacheFiltered: '필터 결과 캐시',
    cacheWarning: '캐시 경고',
    caching: '캐시 중',
    delete: '삭제',
    deleteDisabled: '이 에셋을 제거하려면 먼저 타임라인 클립을 삭제하세요',
    deleteTitle: '보관함에서 에셋 제거',
    drag: '드래그',
    dragging: '드래그 중',
    dropMedia: '미디어를 놓으면 가져옵니다',
    effect: '효과',
    filteredSkipped: (count) => `필터된 에셋 ${count}개 건너뜀`,
    grid: '격자',
    image: '이미지',
    import: '+ 가져오기',
    issues: '문제',
    kind: '종류',
    list: '목록',
    local: '로컬',
    longest: '긴 순',
    manage: '관리',
    media: '미디어',
    metadataPending: '메타데이터 대기',
    mostUsed: '많이 사용',
    name: '이름',
    noMatchingAssets: '일치하는 에셋 없음',
    noMissingRelink: '다시 연결할 누락 미디어가 없습니다',
    openMic: '마이크 여는 중...',
    over: '덮기',
    overwrite: '덮어쓰기',
    processing: '처리 중...',
    proxy: '프록시',
    queued: '대기 중',
    ready: '준비됨',
    record: '녹음',
    recordTitle: '보이스오버 녹음',
    relink: '다시 연결',
    relinkMissing: '누락 다시 연결',
    relinkTitle: '오프라인 또는 누락 미디어의 대체 파일 선택',
    removeUnused: '미사용 제거',
    review: '검토',
    searchMedia: '미디어 검색',
    selectReplacement: '오프라인 또는 누락 미디어의 대체 파일 선택',
    sharedLibrary: '공유 라이브러리',
    shortest: '짧은 순',
    smartCollection: '스마트 컬렉션',
    sortAssets: '에셋 정렬',
    source: '소스',
    sourceControls: '소스 제어',
    sourcePrefix: '소스',
    stopVoiceover: '보이스오버 중지',
    text: '텍스트',
    thumb: '썸네일',
    timeline: '타임라인',
    timelineUses: (count) => `타임라인 ${count}`,
    type: '유형',
    unused: '미사용',
    unusedFirst: '미사용 먼저',
    usage: (count) => `${count}회 사용`,
    video: '비디오',
    visible: '표시',
    voiceoverUnavailable: '보이스오버 녹음을 사용할 수 없습니다',
    waveform: '파형',
  },
};

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
  draggingAssetId,
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
  onAssetPointerDragStart,
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
  draggingAssetId?: string;
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
  onAssetPointerDragStart?: (event: MouseEvent<HTMLElement>, asset: EditorAsset) => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  const language = useMenuLanguage();
  const text = mediaBinText[language];
  const selectedAsset = selectedAssetId ? assets.find((asset) => asset.id === selectedAssetId) : undefined;
  const draggingAsset = draggingAssetId ? assets.find((asset) => asset.id === draggingAssetId) : undefined;
  const [assetViewMode, setAssetViewMode] = useState<'grid' | 'list'>('grid');
  const visibleUsedAssetCount = assets.reduce((count, asset) => (
    (assetReferenceCounts.get(asset.id) ?? 0) > 0 ? count + 1 : count
  ), 0);
  const visibleIssueAssetCount = assets.reduce((count, asset) => {
    const health = healthByAssetId.get(asset.id);
    return health?.severity === 'blocked' || health?.severity === 'warning' ? count + 1 : count;
  }, 0);
  const visibleUnusedAssetCount = Math.max(0, assets.length - visibleUsedAssetCount);

  return (
    <div
      data-testid="media-bin-panel"
      data-drop-active={isDropActive ? 'true' : 'false'}
      data-asset-dragging={draggingAsset ? 'true' : 'false'}
      data-dragging-asset-id={draggingAsset?.id ?? ''}
      data-selected-asset-id={selectedAssetId ?? ''}
      data-visible-asset-count={assets.length}
      data-visible-used-asset-count={visibleUsedAssetCount}
      data-visible-unused-asset-count={visibleUnusedAssetCount}
      data-visible-issue-asset-count={visibleIssueAssetCount}
      className={`mt-2 rounded-md border p-1.5 transition-colors ${
        isDropActive
          ? 'border-accent-500 bg-accent-100/20'
          : draggingAsset
            ? 'border-info-500 bg-info-100/10'
            : 'border-surface bg-paper/60'
      }`}
      onDragOver={onDragOver}
      onDrop={(event) => void onDrop(event)}
      onDragLeave={onDragLeave}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-info-700">{text.media}</h2>
        <div className="flex min-w-0 items-center gap-2">
          {selectedAsset ? (
            <span
              data-testid="media-bin-selected-source"
              className="min-w-0 max-w-36 truncate rounded border border-info-500/50 bg-info-500/10 px-2 py-1 text-meta text-info-900"
              title={`${text.sourcePrefix}: ${selectedAsset.name}`}
            >
              {text.sourcePrefix}: {selectedAsset.name}
            </span>
          ) : null}
          <span
            data-testid="media-bin-count-summary"
            className="shrink-0 whitespace-nowrap rounded bg-surface px-2 py-1 text-meta tabular-nums text-ds-700"
          >
            {assets.length} / {totalAssetCount}
          </span>
          <div
            data-testid="media-bin-view-mode"
            className="flex shrink-0 overflow-hidden rounded border border-ds-200 bg-paper"
          >
            <button
              type="button"
              data-testid="media-bin-view-grid"
              aria-pressed={assetViewMode === 'grid'}
              onClick={() => setAssetViewMode('grid')}
              className={`px-2 py-1 text-meta ${
                assetViewMode === 'grid'
                  ? 'bg-info-500/20 text-info-900'
                  : 'text-ds-600 hover:bg-surface hover:text-ds-800'
              }`}
            >
              {text.grid}
            </button>
            <button
              type="button"
              data-testid="media-bin-view-list"
              aria-pressed={assetViewMode === 'list'}
              onClick={() => setAssetViewMode('list')}
              className={`px-2 py-1 text-meta ${
                assetViewMode === 'list'
                  ? 'bg-info-500/20 text-info-900'
                  : 'text-ds-600 hover:bg-surface hover:text-ds-800'
              }`}
            >
              {text.list}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onImportMedia}
          className="rounded-md border border-info-500/50 bg-info-500/10 px-3 py-2 text-sm font-medium text-info-900 hover:border-info-700"
        >
          {text.import}
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
            title={voiceoverSupported ? text.recordTitle : voiceoverUnavailableReason ?? text.voiceoverUnavailable}
            className="rounded-md border border-ds-200 bg-surface px-3 py-2 text-sm text-ds-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {voiceoverState === 'recording'
              ? text.stopVoiceover
              : voiceoverState === 'processing'
                ? text.processing
                : voiceoverState === 'requesting'
                  ? text.openMic
                  : text.record}
          </button>
        ) : null}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-ds-200 bg-surface px-3 py-2 text-sm text-ds-700 hover:border-ds-400">
            {text.manage}
          </summary>
          <div className="absolute left-0 top-10 z-50 w-52 space-y-1 rounded-md border border-ds-300 bg-paper p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => void onBulkRelinkAssets()}
              disabled={bulkRelinkCandidateCount === 0}
              title={bulkRelinkCandidateCount > 0 ? text.selectReplacement : text.noMissingRelink}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-ds-800 hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text.relinkMissing} ({bulkRelinkCandidateCount})
            </button>
            <button
              type="button"
              onClick={onRemoveUnusedAssets}
              disabled={unusedAssetCount === 0}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-ds-800 hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text.removeUnused} ({unusedAssetCount})
            </button>
            <button
              type="button"
              onClick={() => void onRebuildFilteredMediaCache()}
              disabled={mediaCachePlan.targets.length === 0}
              title={text.filteredSkipped(mediaCachePlan.skipped.length)}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-ds-800 hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text.cacheFiltered} ({mediaCachePlan.targets.length})
            </button>
          </div>
        </details>
      </div>
      {onAddSharedLibraryAsset ? (
        <details className="mt-1.5 rounded-md border border-ds-200 bg-paper">
          <summary className="cursor-pointer list-none truncate px-2 py-1 text-kicker font-heading font-semibold uppercase text-ds-600 hover:text-ds-800">
            {text.sharedLibrary}
          </summary>
          <div className="border-t border-ds-200 p-2">
            <SharedAssetLibraryPanel onAddSharedLibraryAsset={onAddSharedLibraryAsset} language={language} />
          </div>
        </details>
      ) : null}
      <input
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
        placeholder={text.searchMedia}
        className="mt-1.5 w-full rounded-md border border-ds-200 bg-paper px-2 py-1 text-sm text-ink outline-none placeholder:text-ds-500 focus:border-accent-500"
      />
      <div className="mt-1.5 grid grid-cols-2 gap-1 2xl:grid-cols-4">
        <select
          value={kindFilter}
          onChange={(event) => onKindFilterChange(event.currentTarget.value as MediaBinKindFilter)}
          className="h-7 rounded-md border border-ds-200 bg-paper px-1.5 text-xs text-ds-800 outline-none focus:border-accent-500"
          title={text.assetType}
        >
          <option value="all">{text.allMedia}</option>
          <option value="video">{text.video}</option>
          <option value="audio">{text.audio}</option>
          <option value="image">{text.image}</option>
          <option value="text">{text.text}</option>
          <option value="ai">AI</option>
          <option value="effect">{text.effect}</option>
        </select>
        <select
          value={smartFilter}
          onChange={(event) => onSmartFilterChange(event.currentTarget.value as MediaBinSmartCollection)}
          className="h-7 rounded-md border border-ds-200 bg-paper px-1.5 text-xs text-ds-800 outline-none focus:border-accent-500"
          title={text.smartCollection}
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
          className="h-7 rounded-md border border-ds-200 bg-paper px-1.5 text-xs text-ds-800 outline-none focus:border-accent-500"
          title={text.assetBin}
        >
          <option value="all">{text.allBins}</option>
          {binCollections.map((bin) => (
            <option key={bin.id} value={bin.id}>
              {bin.label} ({bin.count})
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(event) => onSortKeyChange(event.currentTarget.value as MediaBinSortKey)}
          className="h-7 rounded-md border border-ds-200 bg-paper px-1.5 text-xs text-ds-800 outline-none focus:border-accent-500"
          title={text.sortAssets}
        >
          <option value="name">{text.name}</option>
          <option value="kind">{text.type}</option>
          <option value="duration-desc">{text.longest}</option>
          <option value="duration-asc">{text.shortest}</option>
          <option value="used-desc">{text.mostUsed}</option>
          <option value="used-asc">{text.unusedFirst}</option>
        </select>
      </div>
      <div
        data-testid="media-bin-quick-status"
        data-visible-assets={assets.length}
        data-used-assets={visibleUsedAssetCount}
        data-unused-assets={visibleUnusedAssetCount}
        data-issue-assets={visibleIssueAssetCount}
        className="sr-only"
      >
        <span>{text.visible} {assets.length}</span>
        <span>{text.usage(visibleUsedAssetCount)}</span>
        <span>{text.unused} {visibleUnusedAssetCount}</span>
        <span>{text.issues} {visibleIssueAssetCount}</span>
      </div>
      {isDropActive ? (
        <div className="mt-3 rounded border border-accent-500/60 bg-accent-500/10 px-3 py-2 text-xs text-accent-900">
          {text.dropMedia}
        </div>
      ) : null}
      {draggingAsset ? (
        <div
          data-testid="media-bin-dragging-asset"
          data-dragging-asset-id={draggingAsset.id}
          className="mt-3 flex min-w-0 items-center justify-between gap-2 rounded border border-info-600/60 bg-info-500/10 px-3 py-2 text-xs text-info-900"
        >
          <span className="min-w-0 truncate">
            {text.dragging} <span className="font-semibold">{draggingAsset.name}</span>
          </span>
          <span className="shrink-0 rounded bg-info-700 px-1.5 py-0.5 text-micro font-semibold uppercase text-paper">
            {text.timeline}
          </span>
        </div>
      ) : null}
      {sourceControls ? (
        <details
          data-testid="media-bin-source-controls"
          className="mt-1.5 rounded-md border border-info-500/40 bg-info-500/5"
        >
          <summary className="cursor-pointer list-none truncate px-2 py-1 text-kicker font-heading font-semibold uppercase text-ds-700">
            {text.sourceControls}{selectedAsset ? ` - ${selectedAsset.name}` : ''}
          </summary>
          <div className="border-t border-ds-200 p-2">
            {sourceControls}
          </div>
        </details>
      ) : null}
      <MediaBinAssetList
        assets={assets}
        viewMode={assetViewMode}
        fps={fps}
        selectedAssetId={selectedAssetId}
        draggingAssetId={draggingAsset?.id}
        assetReferenceCounts={assetReferenceCounts}
        healthByAssetId={healthByAssetId}
        cacheJobsByAssetId={cacheJobsByAssetId}
        onAssetDragStart={onAssetDragStart}
        onAssetDragEnd={onAssetDragEnd}
        onAssetPointerDragStart={onAssetPointerDragStart}
        onSelectSourceAsset={onSelectSourceAsset}
        onRebuildMediaCache={onRebuildMediaCache}
        onRelinkAsset={onRelinkAsset}
        onRemoveAsset={onRemoveAsset}
        onInsertAsset={onInsertAsset}
        onOverwriteAsset={onOverwriteAsset}
        onCancelMediaCache={onCancelMediaCache}
        onRetryMediaCache={onRetryMediaCache}
        language={language}
      />
    </div>
  );
}

function SharedAssetLibraryPanel({
  onAddSharedLibraryAsset,
  language,
}: {
  onAddSharedLibraryAsset: (itemId: SharedAssetLibraryItemId) => void;
  language: DanbiMenuLanguage;
}) {
  const items = listSharedAssetLibraryItems();
  const text = mediaBinText[language];

  return (
    <div className="rounded-md border border-ds-200 bg-surface p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.sharedLibrary}</span>
        <span className="text-meta text-ds-600">{items.length} {text.local}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 2xl:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.description}
            onClick={() => onAddSharedLibraryAsset(item.id)}
            className="min-w-0 rounded-md border border-ds-200 bg-paper px-2 py-2 text-left hover:border-accent-500 focus:border-accent-500 focus:outline-none"
          >
            <span className="block truncate text-xs font-medium text-ink">{item.label}</span>
            <span className="mt-1 block truncate text-meta text-ds-600">{item.duration}s {item.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaBinAssetList({
  assets,
  viewMode,
  fps,
  language,
  selectedAssetId,
  draggingAssetId,
  assetReferenceCounts,
  healthByAssetId,
  cacheJobsByAssetId,
  onAssetDragStart,
  onAssetDragEnd,
  onAssetPointerDragStart,
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
  viewMode: 'grid' | 'list';
  fps: number;
  language: DanbiMenuLanguage;
  selectedAssetId?: string;
  draggingAssetId?: string;
  assetReferenceCounts: Map<string, number>;
  healthByAssetId: Map<string, MediaAssetHealth>;
  cacheJobsByAssetId: Record<string, MediaCacheJobView>;
  onAssetDragStart: (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => void;
  onAssetDragEnd: () => void;
  onAssetPointerDragStart?: (event: MouseEvent<HTMLElement>, asset: EditorAsset) => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  const text = mediaBinText[language];

  if (assets.length === 0) {
    return (
      <div className="mt-3 space-y-2">
        <div className="rounded-md border border-ds-200 bg-surface p-3 text-xs text-ds-600">
          {text.noMatchingAssets}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="media-bin-asset-list"
      data-view-mode={viewMode}
      className={viewMode === 'grid'
        ? 'mt-2 grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2'
        : 'mt-2 grid gap-2'}
    >
      {assets.map((asset) => (
        <MediaBinAssetCard
          key={asset.id}
          asset={asset}
          viewMode={viewMode}
          fps={fps}
          language={language}
          selected={selectedAssetId === asset.id}
          dragging={draggingAssetId === asset.id}
          referenceCount={assetReferenceCounts.get(asset.id) ?? 0}
          health={healthByAssetId.get(asset.id)}
          cacheJob={cacheJobsByAssetId[asset.id]}
          onDragStart={onAssetDragStart}
          onDragEnd={onAssetDragEnd}
          onAssetPointerDragStart={onAssetPointerDragStart}
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
  viewMode,
  fps,
  language,
  selected,
  dragging,
  referenceCount,
  health,
  cacheJob,
  onDragStart,
  onDragEnd,
  onAssetPointerDragStart,
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
  viewMode: 'grid' | 'list';
  fps: number;
  language: DanbiMenuLanguage;
  selected: boolean;
  dragging: boolean;
  referenceCount: number;
  health?: MediaAssetHealth;
  cacheJob?: MediaCacheJobView;
  onDragStart: (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => void;
  onDragEnd: () => void;
  onAssetPointerDragStart?: (event: MouseEvent<HTMLElement>, asset: EditorAsset) => void;
  onSelectSourceAsset: (assetId: string) => void;
  onRebuildMediaCache: (asset: EditorAsset) => void | Promise<void>;
  onRelinkAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onInsertAsset: (assetId: string) => void;
  onOverwriteAsset: (assetId: string) => void;
  onCancelMediaCache: (assetId: string) => void | Promise<void>;
  onRetryMediaCache: (assetId: string) => void | Promise<void>;
}) {
  const text = mediaBinText[language];
  const thumbnailSource = resolveTimelineThumbnailSource(asset, asset.kind);
  const assetStatus = resolveAssetCardStatus({ selected, referenceCount, health, cacheJob });
  const readinessPercent = resolveAssetReadinessPercent(health, cacheJob);
  const assetStatusLabel = formatAssetCardStatusLabel(assetStatus.value, assetStatus.label, language);
  const assetKindLabel = formatMediaBinAssetKindLabel(asset, language);
  const metadataSummary = buildAssetMetadataSummary(asset, language);
  const usageState = referenceCount > 0 ? 'used' : 'unused';
  const showAssetStatusBadge = assetStatusLabel.length > 0;
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const scrubTime = scrubRatio === null ? 0 : asset.duration * scrubRatio;
  const handlePointerDragStart = (event: MouseEvent<HTMLElement>) => {
    if (isInteractiveAssetCardTarget(event.target)) {
      return;
    }

    onAssetPointerDragStart?.(event, asset);
  };
  const handleThumbnailScrubMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      setScrubRatio(0);
      return;
    }

    setScrubRatio(clampRatio((event.clientX - rect.left) / rect.width));
  };

  return (
    <div
      draggable
      role="group"
      tabIndex={0}
      aria-label={`${text.media} ${asset.name}`}
      data-testid={`media-asset-card-${asset.id}`}
      data-asset-id={asset.id}
      data-asset-kind={asset.kind}
      data-asset-name={asset.name}
      data-asset-duration={asset.duration}
      data-asset-status={assetStatus.value}
      data-asset-usage-state={usageState}
      data-asset-reference-count={referenceCount}
      data-asset-cache-state={cacheJob?.status ?? 'idle'}
      data-preview-ready={health?.previewReady === false ? 'false' : 'true'}
      data-scrub-active={scrubRatio === null ? 'false' : 'true'}
      data-scrub-ratio={scrubRatio === null ? '0' : scrubRatio.toFixed(3)}
      data-scrub-time={scrubTime.toFixed(3)}
      data-selected={selected ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-view-mode={viewMode}
      aria-grabbed={dragging ? 'true' : 'false'}
      title={`${asset.name} ${formatTimecode(asset.duration, fps)}`}
      onDragStart={(event) => onDragStart(event, asset)}
      onDragEnd={onDragEnd}
      onDoubleClick={() => {
        onSelectSourceAsset(asset.id);
        onInsertAsset(asset.id);
      }}
      onClick={(event) => {
        if (isInteractiveAssetCardTarget(event.target)) {
          return;
        }

        onSelectSourceAsset(asset.id);
      }}
      onMouseDown={handlePointerDragStart}
      className={`group min-w-0 rounded-md border bg-surface/90 outline-none transition ${
        dragging
          ? 'border-info-700 ring-2 ring-info-700/60'
          : selected
            ? 'border-info-600 ring-1 ring-info-700/50'
            : 'border-ds-200 hover:border-ds-400 focus:border-info-500'
      } ${viewMode === 'list' ? 'grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 p-2' : 'p-1.5'} cursor-grab active:cursor-grabbing`}
    >
      <div
        className={`relative overflow-hidden rounded-md border bg-ds-200 shadow-inner ${
          health?.severity === 'blocked'
            ? 'border-danger-500/40'
            : health?.severity === 'warning'
              ? 'border-warn-500/40'
              : selected
                ? 'border-info-600/60'
                : 'border-ds-200'
        } ${viewMode === 'list' ? 'h-14 w-24' : 'aspect-video'}`}
        data-has-preview={thumbnailSource ? 'true' : 'false'}
        data-preview-kind={asset.kind}
        data-scrub-active={scrubRatio === null ? 'false' : 'true'}
        data-scrub-time={scrubTime.toFixed(3)}
        data-testid={`media-asset-thumbnail-${asset.id}`}
        onMouseEnter={handleThumbnailScrubMove}
        onMouseMove={handleThumbnailScrubMove}
        onMouseLeave={() => setScrubRatio(null)}
      >
        {thumbnailSource ? (
          <img
            src={thumbnailSource}
            alt={asset.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <MediaAssetThumbnailFallback asset={asset} language={language} />
        )}
        {scrubRatio !== null ? (
          <>
            <span
              data-testid={`media-asset-scrub-line-${asset.id}`}
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-info-800 shadow-[0_0_8px_rgba(103,232,249,0.75)]"
              style={{ left: `${scrubRatio * 100}%` }}
            />
            <span
              data-testid={`media-asset-scrub-time-${asset.id}`}
              className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded on-dark bg-black/85 px-1.5 py-0.5 text-micro tabular-nums text-info-900"
            >
              {formatTimecode(scrubTime, fps)}
            </span>
          </>
        ) : null}
        <span
          data-testid={`media-asset-duration-badge-${asset.id}`}
          className="absolute right-1 top-1 rounded on-dark bg-black/75 px-1.5 py-0.5 text-micro tabular-nums text-white"
        >
          {formatCompactDuration(asset.duration)}
        </span>
        <span className="absolute left-1 top-1 flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            aria-label={`${asset.name} ${text.timeline}`}
            data-testid={`media-asset-drag-handle-${asset.id}`}
            data-drag-active={dragging ? 'true' : 'false'}
            onMouseDown={(event) => {
              event.stopPropagation();
              onAssetPointerDragStart?.(event, asset);
            }}
            className={`cursor-grab rounded px-1.5 py-0.5 text-micro font-semibold uppercase active:cursor-grabbing ${
              dragging
                ? 'bg-info-700 text-paper'
                : showAssetStatusBadge
                  ? assetStatus.className
                  : 'on-dark bg-black/65 text-ink opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
          >
            {showAssetStatusBadge ? assetStatusLabel : text.drag}
          </span>
        </span>
        <div className={`${viewMode === 'list' ? 'hidden' : 'absolute inset-x-1 bottom-1 grid grid-cols-3 gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100'}`}>
          <button
            type="button"
            aria-label={`${text.add} ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onInsertAsset(asset.id);
            }}
            className="truncate rounded bg-info-600 px-1.5 py-1 text-micro font-semibold text-paper shadow hover:bg-info-700"
          >
            {text.add}
          </button>
          <button
            type="button"
            aria-label={`${text.source} ${asset.name}`}
            onClick={() => onSelectSourceAsset(asset.id)}
            className="truncate rounded on-dark bg-black/80 px-1.5 py-1 text-micro text-ink shadow hover:bg-ds-300"
          >
            {text.source}
          </button>
          <button
            type="button"
            aria-label={`${text.overwrite} ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onOverwriteAsset(asset.id);
            }}
            className="truncate rounded bg-warn-600 px-1.5 py-1 text-micro font-semibold text-paper shadow hover:bg-warn-700"
          >
            {text.over}
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 on-dark bg-black/60" aria-hidden="true">
          <div className={`h-full ${assetStatus.barClassName}`} style={{ width: `${readinessPercent}%` }} />
        </div>
      </div>
      <div className={`${viewMode === 'list' ? 'min-w-0' : 'mt-2 min-w-0'}`}>
        <div data-testid={`media-asset-name-${asset.id}`} className="truncate text-xs font-medium text-ink" title={asset.name}>{asset.name}</div>
        <div className={`${viewMode === 'list' ? 'mt-1 flex' : 'hidden'} items-center gap-1 overflow-hidden text-meta text-ds-600`}>
          <span data-testid={`media-asset-usage-badge-${asset.id}`} className="shrink-0 rounded bg-paper px-1.5 py-0.5">
            {formatAssetReferenceCount(referenceCount, language)}
          </span>
          <span
            data-testid={`media-asset-timeline-state-${asset.id}`}
            data-usage-state={usageState}
            data-reference-count={referenceCount}
            className={`shrink-0 rounded px-1.5 py-0.5 ${referenceCount > 0 ? 'bg-accent-500/15 text-accent-800' : 'bg-paper text-ds-600'}`}
          >
            {referenceCount > 0 ? text.timelineUses(referenceCount) : text.ready}
          </span>
          <span data-testid={`media-asset-kind-badge-${asset.id}`} className="min-w-0 truncate rounded bg-paper px-1.5 py-0.5">
            {assetKindLabel}
          </span>
        </div>
        <div className={`${viewMode === 'list' ? 'mt-1 flex' : 'hidden'} items-center gap-2 border-t border-ds-200/70 pt-1`}>
          <div
            data-testid={`media-asset-metadata-summary-${asset.id}`}
            className="min-w-0 flex-1 truncate text-micro text-ds-600"
            title={metadataSummary}
          >
            {metadataSummary}
          </div>
          <details className="relative shrink-0">
            <summary
              className="grid h-6 w-7 cursor-pointer list-none place-items-center rounded border border-ds-200 bg-paper text-xs font-semibold text-ds-600 hover:border-ds-400 hover:text-ink"
              aria-label={`${text.manage} ${asset.name}`}
            >
              ...
            </summary>
            <div className="absolute right-0 top-7 z-50 grid w-36 gap-1 rounded-md border border-ds-300 bg-paper p-1 shadow-2xl">
              <button
                type="button"
                aria-label={`${text.cache} ${asset.name}`}
                onClick={() => void onRebuildMediaCache(asset)}
                className="min-w-0 truncate rounded px-2 py-1.5 text-left text-meta text-ds-800 hover:bg-ds-200"
              >
                {text.cache}
              </button>
              <button
                type="button"
                aria-label={`${text.relink} ${asset.name}`}
                onClick={() => onRelinkAsset(asset.id)}
                className="min-w-0 truncate rounded px-2 py-1.5 text-left text-meta text-ds-800 hover:bg-ds-200"
              >
                {text.relink}
              </button>
              <button
                type="button"
                aria-label={`${text.overwrite} ${asset.name}`}
                onClick={() => {
                  onSelectSourceAsset(asset.id);
                  onOverwriteAsset(asset.id);
                }}
                className="min-w-0 truncate rounded px-2 py-1.5 text-left text-meta text-ds-800 hover:bg-ds-200"
              >
                {text.overwrite}
              </button>
              <button
                type="button"
                aria-label={`${text.delete} ${asset.name}`}
                onClick={() => onRemoveAsset(asset.id)}
                disabled={referenceCount > 0}
                title={referenceCount > 0 ? text.deleteDisabled : text.deleteTitle}
                className="min-w-0 truncate rounded px-2 py-1.5 text-left text-meta text-ds-800 hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {text.delete}
              </button>
            </div>
          </details>
        </div>
      </div>
      {viewMode === 'list' ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`${text.add} ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onInsertAsset(asset.id);
            }}
            className="rounded border border-info-500/50 bg-info-500/10 px-2 py-1 text-meta font-semibold text-info-900 hover:border-info-700"
          >
            {text.add.replace(/^\+\s*/, '')}
          </button>
          <button
            type="button"
            aria-label={`${text.source} ${asset.name}`}
            onClick={() => onSelectSourceAsset(asset.id)}
            className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-ds-500"
          >
            {text.source}
          </button>
          <button
            type="button"
            aria-label={`${text.overwrite} ${asset.name}`}
            onClick={() => {
              onSelectSourceAsset(asset.id);
              onOverwriteAsset(asset.id);
            }}
            className="rounded border border-warn-500/50 bg-warn-500/10 px-2 py-1 text-meta font-semibold text-warn-900 hover:border-warn-700"
          >
            {text.over}
          </button>
        </div>
      ) : null}
      {viewMode === 'list' && (health || cacheJob) ? (
        <details
          data-testid={`media-asset-health-details-${asset.id}`}
          className={`${viewMode === 'list' ? 'col-span-3 mt-1' : 'mt-2'} rounded border border-ds-200 bg-paper/70`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-micro uppercase tracking-wide text-ds-600">
            <span>{health?.severity === 'blocked' ? text.blocked : health?.severity === 'warning' ? text.review : cacheJob ? `${text.cache} ${cacheJob.status}` : text.ready}</span>
            <span>{health ? `${health.issueCount} ${text.issues}` : text.cache}</span>
          </summary>
          <div className="border-t border-ds-200 px-2 pb-2">
            <AssetHealthBadge health={health} />
            {cacheJob ? (
              <CacheJobStatus
                job={cacheJob}
                onCancel={() => void onCancelMediaCache(asset.id)}
                onRetry={() => void onRetryMediaCache(asset.id)}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function isInteractiveAssetCardTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, input, select, textarea, summary, details, a'));
}

function resolveAssetCardStatus({
  selected,
  referenceCount,
  health,
  cacheJob,
}: {
  selected: boolean;
  referenceCount: number;
  health?: MediaAssetHealth;
  cacheJob?: MediaCacheJobView;
}): { value: string; label: string; className: string; barClassName: string } {
  if (cacheJob?.status === 'queued' || cacheJob?.status === 'running') {
    return {
      value: `cache-${cacheJob.status}`,
      label: cacheJob.status === 'running' ? 'Caching' : 'Queued',
      className: 'bg-info-600 text-paper',
      barClassName: 'bg-info-700',
    };
  }

  if (referenceCount > 0) {
    return {
      value: 'added',
      label: 'Added',
      className: 'on-dark bg-black/75 text-ink',
      barClassName: 'bg-accent-700',
    };
  }

  if (selected) {
    return {
      value: 'source',
      label: 'Source',
      className: 'bg-info-700 text-paper',
      barClassName: 'bg-info-700',
    };
  }

  if (health?.severity === 'blocked') {
    return {
      value: 'blocked',
      label: '',
      className: 'bg-danger-600 text-paper',
      barClassName: 'bg-danger-600',
    };
  }

  const actionableWarningCount = health?.issues.filter((issue) => issue.id !== 'unused-media').length ?? 0;
  if (health?.severity === 'warning' && actionableWarningCount > 0) {
    return {
      value: 'review',
      label: '',
      className: 'bg-warn-700 text-paper',
      barClassName: 'bg-warn-700',
    };
  }

  return {
    value: 'unused',
    label: '',
    className: 'bg-paper/85 text-ds-800',
    barClassName: 'bg-ds-500',
  };
}

function resolveAssetReadinessPercent(health?: MediaAssetHealth, cacheJob?: MediaCacheJobView): number {
  if (cacheJob?.status === 'queued' || cacheJob?.status === 'running') {
    return clampPercent(cacheJob.progress);
  }

  if (!health) {
    return 60;
  }

  if (health.severity === 'blocked') {
    return 25;
  }

  if (health.severity === 'warning') {
    return health.cacheReady ? 75 : 55;
  }

  return 100;
}

function clampPercent(value: number): number {
  return Math.max(4, Math.min(100, Math.round(value)));
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function MediaAssetThumbnailFallback({ asset, language }: { asset: EditorAsset; language: DanbiMenuLanguage }) {
  if (asset.kind === 'audio') {
    return (
      <div className="flex h-full items-end justify-center gap-1 bg-paper px-3 pb-3">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            className="w-1 rounded-t bg-info-600"
            style={{ height: `${20 + ((index * 17) % 52)}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-surface text-center text-meta uppercase tracking-wide text-ds-600">
      {formatMediaBinAssetKindLabel(asset, language)}
    </div>
  );
}

function formatCompactDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function buildAssetMetadataSummary(asset: EditorAsset, language: DanbiMenuLanguage): string {
  const text = mediaBinText[language];
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
    parts.push(`${audioCodec.toUpperCase()} ${text.audio.toLowerCase()}`);
  }

  const audioChannels = asset.metadata?.audioChannels;
  if (typeof audioChannels === 'number') {
    parts.push(`${audioChannels} ch`);
  }

  if (asset.mediaCache?.proxySource) {
    parts.push(text.proxy);
  }

  if (asset.mediaCache?.thumbnailSource) {
    parts.push(text.thumb);
  }

  if (asset.mediaCache?.waveformPeaks?.length) {
    parts.push(text.waveform);
  }

  const analysisWarning = asset.metadata?.analysisWarning;
  if (typeof analysisWarning === 'string') {
    parts.push(language === 'ko' ? '분석 경고' : 'analysis warning');
  }

  const cacheWarning = asset.metadata?.cacheWarning;
  if (typeof cacheWarning === 'string') {
    parts.push(text.cacheWarning);
  }

  return parts.length > 0 ? parts.join(' / ') : text.metadataPending;
}

function formatAssetReferenceCount(referenceCount: number, language: DanbiMenuLanguage): string {
  const text = mediaBinText[language];
  if (referenceCount <= 0) {
    return text.unused;
  }

  return text.usage(referenceCount);
}

function formatAssetCardStatusLabel(value: string, fallbackLabel: string, language: DanbiMenuLanguage): string {
  if (!fallbackLabel) {
    return '';
  }

  const text = mediaBinText[language];
  if (value === 'cache-running') {
    return text.caching;
  }
  if (value === 'cache-queued') {
    return text.queued;
  }
  if (value === 'added') {
    return text.added;
  }
  if (value === 'source') {
    return text.source;
  }

  return fallbackLabel;
}

function formatMediaBinAssetKindLabel(asset: EditorAsset, language: DanbiMenuLanguage): string {
  const text = mediaBinText[language];
  switch (asset.kind) {
    case 'video':
      return text.video;
    case 'audio':
      return text.audio;
    case 'image':
      return text.image;
    case 'text':
      return text.text;
    case 'ai':
      return 'AI';
    case 'effect':
      return text.effect;
    default:
      return resolveMediaBinAssetKindLabel(asset);
  }
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
