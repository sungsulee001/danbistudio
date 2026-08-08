'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { openNativeRuntimePath, readElectronRuntimeDiagnostics, revealNativeRuntimePath } from '@/electron/renderer/editor-system-client';
import type { DanbiRuntimeDiagnosticsSnapshot } from '@/electron/shared/runtime-diagnostics';
import { browserApiFetch } from '@/lib/browser-api-fetch';
import {
  COMFYUI_URL_STORAGE_KEY,
  DEFAULT_COMFYUI_URL,
  DEFAULT_GENERATE_OUTPUT_FORMAT,
  DEFAULT_GENERATE_SEED,
  DEFAULT_GENERATE_STEPS,
  GENERATE_DEFAULT_SEED_STORAGE_KEY,
  GENERATE_DEFAULT_STEPS_STORAGE_KEY,
  GENERATE_OUTPUT_FORMAT_STORAGE_KEY,
  normalizeGenerateOutputFormat,
  normalizeGenerateSeedSetting,
  normalizeGenerateStepsSetting,
} from '@/lib/generate-settings';
import {
  readStoredMenuLanguage,
  setStoredMenuLanguage,
  subscribeMenuLanguage,
  type DanbiMenuLanguage,
} from '@/lib/editor/menu-language';
import {
  findEditorCommandsByShortcut,
  listEditorCommands,
  normalizeEditorShortcut,
  type EditorCommandId,
} from '@/lib/editor/command-registry';
import {
  DEFAULT_EDITOR_INTERACTION_SETTINGS,
  patchStoredEditorInteractionSettings,
  readStoredEditorInteractionSettings,
  subscribeEditorInteractionSettings,
  type EditorCustomShortcut,
  type EditorInteractionSettings,
} from '@/lib/editor/editor-settings';
import { DanbiAppShell, type ShellStatusItem } from '../danbi-app-shell';

const HEALTH_CHECK_TIMEOUT_MS = 8000;
const STORAGE_CLEANUP_SCAN_TIMEOUT_MS = 15000;
const STORAGE_CLEANUP_RUN_TIMEOUT_MS = 60000;
const NATIVE_SELECT_OPTION_STYLE = { color: '#111827', backgroundColor: '#ffffff' } as const;

type SettingsTabId = 'general' | 'editor' | 'ai' | 'runtime' | 'storage';

const SETTINGS_TAB_IDS: readonly SettingsTabId[] = ['general', 'editor', 'ai', 'runtime', 'storage'];

const settingsLanguageText = {
  en: {
    pageTitle: 'Settings and Diagnostics',
    menuPanelTitle: 'Menu Language',
    menuPanelDescription: 'Controls the app shell, editor toolbar, and timeline editing menus.',
    menuLanguageLabel: 'Menu language',
    english: 'English',
    korean: '한국어',
    status: {
      ffmpeg: 'FFmpeg',
      storage: 'Storage',
      ready: 'Ready',
      check: 'Check',
      connected: 'Connected',
      offline: 'Offline',
      warnings: 'Warnings',
      externalQa: 'External QA',
      pending: 'EXTERNAL_PENDING',
    },
  },
  ko: {
    pageTitle: '설정 및 진단',
    menuPanelTitle: '메뉴 언어',
    menuPanelDescription: '앱 셸, 에디터 툴바, 타임라인 편집 메뉴에 적용됩니다.',
    menuLanguageLabel: '메뉴 언어',
    english: 'English',
    korean: '한국어',
    status: {
      ffmpeg: 'FFmpeg',
      storage: '저장소',
      ready: '준비됨',
      check: '확인',
      connected: '연결됨',
      offline: '오프라인',
      warnings: '경고',
      externalQa: '외부 QA',
      pending: 'EXTERNAL_PENDING',
    },
  },
} satisfies Record<DanbiMenuLanguage, {
  pageTitle: string;
  menuPanelTitle: string;
  menuPanelDescription: string;
  menuLanguageLabel: string;
  english: string;
  korean: string;
  status: Record<string, string>;
}>;

const settingsTabLanguageText = {
  en: {
    general: 'General',
    editor: 'Editor',
    ai: 'AI / ComfyUI',
    runtime: 'Runtime',
    storage: 'Storage',
  },
  ko: {
    general: '일반',
    editor: '편집기',
    ai: 'AI / ComfyUI',
    runtime: '런타임',
    storage: '저장소',
  },
} satisfies Record<DanbiMenuLanguage, Record<SettingsTabId, string>>;

const editorSettingsLanguageText = {
  en: {
    title: 'Editor Settings',
    description: 'Timeline interaction, linked clip editing, and keyboard shortcut preferences.',
    stickyControls: 'Keep timeline controls fixed while scrolling tracks',
    wheelZoom: 'Mouse wheel zoom on timeline',
    linkedMode: 'Video/audio linked edit mode',
    separate: 'Separate video and audio edits',
    linked: 'Edit linked video/audio together',
    shortcuts: 'Keyboard shortcuts',
    searchPlaceholder: 'Search commands or shortcuts',
    addShortcut: 'Add custom shortcut',
    command: 'Command',
    shortcut: 'Shortcut',
    shortcutPlaceholder: 'ctrl+alt+1',
    add: 'Add',
    remove: 'Remove',
    emptyCustomShortcuts: 'No custom shortcuts yet.',
    conflictPrefix: 'Already used by default shortcut:',
    invalidShortcut: 'Enter a shortcut first.',
    shortcutAdded: 'Shortcut added.',
    customShortcuts: 'Custom shortcuts',
  },
  ko: {
    title: '편집기 설정',
    description: '타임라인 상호작용, 비디오/오디오 링크 편집, 단축키 설정입니다.',
    stickyControls: '트랙을 위아래로 스크롤해도 타임라인 조작부 고정',
    wheelZoom: '타임라인 마우스 휠 줌 사용',
    linkedMode: '비디오/오디오 링크 편집 방식',
    separate: '비디오와 오디오를 따로 편집',
    linked: '링크된 비디오/오디오를 같이 편집',
    shortcuts: '단축키',
    searchPlaceholder: '명령 또는 단축키 검색',
    addShortcut: '사용자 단축키 추가',
    command: '명령',
    shortcut: '단축키',
    shortcutPlaceholder: 'ctrl+alt+1',
    add: '추가',
    remove: '삭제',
    emptyCustomShortcuts: '추가된 사용자 단축키가 없습니다.',
    conflictPrefix: '기본 단축키와 충돌:',
    invalidShortcut: '단축키를 먼저 입력하세요.',
    shortcutAdded: '단축키를 추가했습니다.',
    customShortcuts: '사용자 단축키',
  },
} satisfies Record<DanbiMenuLanguage, {
  title: string;
  description: string;
  stickyControls: string;
  wheelZoom: string;
  linkedMode: string;
  separate: string;
  linked: string;
  shortcuts: string;
  searchPlaceholder: string;
  addShortcut: string;
  command: string;
  shortcut: string;
  shortcutPlaceholder: string;
  add: string;
  remove: string;
  emptyCustomShortcuts: string;
  conflictPrefix: string;
  invalidShortcut: string;
  shortcutAdded: string;
  customShortcuts: string;
}>;

const EDITOR_COMMAND_KO_LABELS: Partial<Record<EditorCommandId, string>> = {
  'project.save': '프로젝트 저장',
  'view.commandPalette': '명령 팔레트 열기',
  'playback.toggle': '재생/일시정지',
  'playback.shuttle': '활성 모니터 셔틀 재생',
  'playback.loopMarkedRange': '표시 구간 반복 재생',
  'playback.timelineBoundary': '타임라인 처음/끝으로 이동',
  'playback.nudgePlayhead': '재생 헤드 이동',
  'program.nudgeLayer': '선택한 프로그램 레이어 미세 이동',
  'playback.jumpAdjacentEdit': '이전/다음 편집점으로 이동',
  'playback.jumpAdjacentEditAllTracks': '전체 트랙 이전/다음 편집점으로 이동',
  'edit.split': '자르기',
  'history.undo': '실행 취소',
  'history.redo': '다시 실행',
  'selection.selectAll': '편집 가능한 모든 클립 선택',
  'edit.duplicateSelection': '선택 클립 복제',
  'edit.groupSelection': '클립 그룹화',
  'edit.ungroupSelection': '클립 그룹 해제',
  'selection.selectAtPlayhead': '재생 헤드 위치 클립 선택 / 전체 트랙',
  'selection.selectMarkedRange': '표시 구간 클립 선택 / 전체 트랙',
  'selection.selectRelative': '오른쪽/왼쪽 클립 선택',
  'selection.selectRelativeAllTracks': '전체 트랙 오른쪽/왼쪽 클립 선택',
  'clipboard.copyCutPaste': '선택 클립 복사',
  'clipboard.cutSelection': '선택 클립 잘라내기',
  'clipboard.pasteSelection': '재생 헤드에 붙여넣기',
  'clipboard.attributes': '클립 속성 복사',
  'clipboard.pasteAttributes': '클립 속성 붙여넣기',
  'clipboard.pasteAtIn': '인 포인트에 붙여넣기',
  'clipboard.appendSelection': '클립보드를 트랙 끝에 추가',
  'edit.packSelection': '선택 클립 간격 정리/적용',
  'timeline.copyMarkedRange': '표시 구간 복사 / 전체 트랙',
  'timeline.cutMarkedRange': '표시 구간 잘라내기 / 전체 트랙',
  'timeline.liftMarkedRange': '표시 구간 들어내기',
  'timeline.extractMarkedRange': '표시 구간 추출',
  'edit.escape': '선택 해제/정지',
  'edit.deleteSelection': '삭제',
  'edit.rippleDeleteSelection': '리플 삭제',
  'edit.deleteLeftOfPlayhead': '재생 헤드 왼쪽 삭제',
  'edit.deleteRightOfPlayhead': '재생 헤드 오른쪽 삭제',
  'trim.toPlayhead': '재생 헤드까지 트림',
  'trim.rollDrag': '롤 트림',
  'trim.slipDrag': '슬립 편집',
  'trim.slideDrag': '슬라이드 편집',
  'trim.transitionDurationDrag': '전환 길이 조정',
  'transition.applyCrossfade': '크로스페이드 전환 적용',
  'transition.applyDip': '딥 전환 적용',
  'transition.applyPush': '푸시 전환 적용',
  'transition.applyWipe': '와이프 전환 적용',
  'transition.applyAiMorph': 'AI 모프 전환 적용',
  'keyframe.dragDot': '타임라인 키프레임 이동',
  'edit.moveSelection': '클립 이동',
  'trim.slideSelection': '선택 클립 슬라이드 편집',
  'trim.moveSelectionToPlayhead': '선택 항목을 재생 헤드로 이동',
  'timeline.setMark': '인/아웃 표시 설정',
  'timeline.goToMark': '인/아웃 표시로 이동',
  'timeline.markSelection': '선택 클립 표시',
  'timeline.clearMarks': '인/아웃 표시 해제',
  'timeline.addMarker': '마커 추가',
  'timeline.jumpAdjacentMarker': '이전/다음 마커로 이동',
  'timeline.dragMarker': '타임라인 마커 이동',
  'caption.splitActive': '활성 자막 분할',
  'caption.mergeSelected': '선택 자막 병합',
  'source.goToStart': '소스 처음으로 이동',
  'source.goToEnd': '소스 끝으로 이동',
  'source.nudgePlayhead': '소스 재생 헤드 이동',
  'source.loopRange': '소스 구간 반복',
  'source.setIn': '소스 인 포인트 설정',
  'source.setOut': '소스 아웃 포인트 설정',
  'source.goToIn': '소스 인 포인트로 이동',
  'source.goToOut': '소스 아웃 포인트로 이동',
  'source.clearMarks': '소스 인/아웃 해제',
  'source.matchFrame': '소스 모니터로 매치 프레임',
  'source.replaceSelected': '소스 모니터에서 선택 클립 교체',
  'timeline.threePointInsert': '3점 삽입 편집',
  'timeline.threePointOverwrite': '3점 덮어쓰기 편집',
  'timeline.toggleEditMode': '삽입/덮어쓰기 편집 모드 전환',
  'timeline.setInsertMode': '삽입 편집 모드 설정',
  'timeline.setOverwriteMode': '덮어쓰기 편집 모드 설정',
  'timeline.insertGap': '타임라인 간격 삽입',
  'timeline.closeGap': '재생 헤드 위치 간격 닫기',
  'timeline.closeAllGaps': '선택 트랙 모든 간격 닫기',
  'timeline.toggleSnapRipple': '스냅/리플 전환',
  'timeline.fitZoom': '타임라인/선택 영역 줌 맞춤',
  'media.relinkMissing': '누락 미디어 다시 연결',
  'media.cacheSelectedClip': '선택 클립 미디어 캐시',
  'media.cacheActivePreview': '활성 미리보기 미디어 캐시',
  'export.buildPlan': '내보내기 계획 만들기',
  'export.queueRender': '렌더 대기열에 추가',
};

const editorCommandGroupLabels = {
  en: {
    edit: 'edit',
    export: 'export',
    media: 'media',
    playback: 'playback',
    project: 'project',
    source: 'source',
    timeline: 'timeline',
    trim: 'trim',
    view: 'view',
  },
  ko: {
    edit: '편집',
    export: '내보내기',
    media: '미디어',
    playback: '재생',
    project: '프로젝트',
    source: '소스',
    timeline: '타임라인',
    trim: '트림',
    view: '보기',
  },
} satisfies Record<DanbiMenuLanguage, Record<string, string>>;

interface StorageCleanupTargetResult {
  id: 'cache' | 'outputs' | 'stt';
  label: string;
  scannedFiles: number;
  eligibleFiles: number;
  deletedFiles: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  errors: string[];
}

interface StorageCleanupResult {
  dryRun: boolean;
  maxAgeDays: number;
  eligibleFiles: number;
  deletedFiles: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  targets: StorageCleanupTargetResult[];
}

type EditorCommand = ReturnType<typeof listEditorCommands>[number];

function getEditorCommandDisplayLabel(command: EditorCommand, language: DanbiMenuLanguage): string {
  return language === 'ko'
    ? EDITOR_COMMAND_KO_LABELS[command.id] ?? command.label
    : command.label;
}

export default function SettingsPage() {
  const [comfyuiUrl, setComfyuiUrl] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_COMFYUI_URL;
    }

    return window.localStorage.getItem(COMFYUI_URL_STORAGE_KEY) || DEFAULT_COMFYUI_URL;
  });
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline'>('offline');
  const [connectionMessage, setConnectionMessage] = useState('Connection not tested');
  const [testing, setTesting] = useState(false);
  const [defaultSteps, setDefaultSteps] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_STEPS;
    }

    return normalizeGenerateStepsSetting(window.localStorage.getItem(GENERATE_DEFAULT_STEPS_STORAGE_KEY));
  });
  const [defaultSeed, setDefaultSeed] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_SEED;
    }

    return normalizeGenerateSeedSetting(window.localStorage.getItem(GENERATE_DEFAULT_SEED_STORAGE_KEY));
  });
  const [outputFormat, setOutputFormat] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_GENERATE_OUTPUT_FORMAT;
    }

    return normalizeGenerateOutputFormat(window.localStorage.getItem(GENERATE_OUTPUT_FORMAT_STORAGE_KEY));
  });
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupScanning, setCleanupScanning] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState('Storage scan pending');
  const [cleanupPreview, setCleanupPreview] = useState<StorageCleanupResult | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DanbiRuntimeDiagnosticsSnapshot | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState('Runtime diagnostics pending');
  const [menuLanguage, setMenuLanguage] = useState<DanbiMenuLanguage>('en');
  const [editorSettings, setEditorSettings] = useState<EditorInteractionSettings>(DEFAULT_EDITOR_INTERACTION_SETTINGS);
  const [shortcutSearch, setShortcutSearch] = useState('');
  const [shortcutCommandId, setShortcutCommandId] = useState<EditorCommandId>('playback.toggle');
  const [shortcutKeys, setShortcutKeys] = useState('');
  const [shortcutStatus, setShortcutStatus] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('general');

  const testConnection = useCallback(async (signal?: AbortSignal) => {
    setTesting(true);
    try {
      const response = await browserApiFetch(`/api/health?comfyuiUrl=${encodeURIComponent(comfyuiUrl.trim())}`, {
        signal,
        timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
      });
      const data = await response.json().catch(() => ({}));
      if (signal?.aborted) {
        return;
      }

      const connected = Boolean(data.services?.comfyui);
      setConnectionStatus(connected ? 'connected' : 'offline');
      setConnectionMessage(connected
        ? `Connected to ${data.config?.comfyuiUrl ?? comfyuiUrl.trim()}`
        : data.error || (response.ok ? 'ComfyUI did not respond' : response.statusText));
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setConnectionStatus('offline');
      setConnectionMessage(`Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setTesting(false);
      }
    }
  }, [comfyuiUrl]);

  const readCleanupDays = useCallback(() => {
    const parsed = Number(cleanupDays);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.round(parsed))) : 30;
  }, [cleanupDays]);

  const refreshStorageCleanupPreview = useCallback(async (signal?: AbortSignal) => {
    setCleanupScanning(true);
    try {
      const response = await browserApiFetch(`/api/storage/cleanup?maxAgeDays=${readCleanupDays()}`, {
        signal,
        timeoutMs: STORAGE_CLEANUP_SCAN_TIMEOUT_MS,
      });
      const data = await response.json();
      if (signal?.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setCleanupPreview(data);
      setCleanupStatus(`${data.eligibleFiles} old files / ${formatBytes(data.eligibleBytes)} eligible`);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setCleanupStatus(`Storage scan failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setCleanupScanning(false);
      }
    }
  }, [readCleanupDays]);

  const refreshRuntimeDiagnostics = useCallback(async (signal?: AbortSignal) => {
    setRuntimeLoading(true);
    try {
      const diagnostics = await readElectronRuntimeDiagnostics();
      if (signal?.aborted) {
        return;
      }

      setRuntimeDiagnostics(diagnostics);
      setRuntimeStatus(diagnostics
        ? `${diagnostics.app.name} ${diagnostics.app.version} / ${diagnostics.ffmpeg.ready ? 'FFmpeg ready' : 'FFmpeg needs review'}`
        : 'Electron runtime diagnostics are not available in this browser session.');
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setRuntimeDiagnostics(null);
      setRuntimeStatus(`Runtime diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!signal?.aborted) {
        setRuntimeLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setMenuLanguage(readStoredMenuLanguage());
    return subscribeMenuLanguage(setMenuLanguage);
  }, []);

  useEffect(() => {
    setEditorSettings(readStoredEditorInteractionSettings());
    return subscribeEditorInteractionSettings(setEditorSettings);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COMFYUI_URL_STORAGE_KEY, comfyuiUrl);
  }, [comfyuiUrl]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_DEFAULT_STEPS_STORAGE_KEY, defaultSteps);
  }, [defaultSteps]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_DEFAULT_SEED_STORAGE_KEY, defaultSeed);
  }, [defaultSeed]);

  useEffect(() => {
    window.localStorage.setItem(GENERATE_OUTPUT_FORMAT_STORAGE_KEY, outputFormat);
  }, [outputFormat]);

  useEffect(() => {
    const controller = new AbortController();

    testConnection(controller.signal);
    refreshStorageCleanupPreview(controller.signal);
    refreshRuntimeDiagnostics(controller.signal);

    return () => {
      controller.abort();
    };
  }, [refreshRuntimeDiagnostics, refreshStorageCleanupPreview, testConnection]);

  const handleClearOldFiles = async () => {
    const days = readCleanupDays();
    const eligibleFiles = cleanupPreview?.eligibleFiles ?? 0;
    const eligibleBytes = cleanupPreview?.eligibleBytes ?? 0;
    const confirmation = eligibleFiles > 0
      ? `Delete ${eligibleFiles} cache/output/STT files older than ${days} days (${formatBytes(eligibleBytes)})? This cannot be undone.`
      : `Scan and delete cache/output/STT files older than ${days} days? This cannot be undone.`;

    if (!confirm(confirmation)) {
      return;
    }

    setCleanupRunning(true);
    try {
      const response = await browserApiFetch('/api/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: STORAGE_CLEANUP_RUN_TIMEOUT_MS,
        body: JSON.stringify({
          dryRun: false,
          maxAgeDays: days,
          targets: ['cache', 'outputs', 'stt'],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setCleanupPreview(data);
      setCleanupStatus(`Deleted ${data.deletedFiles} files / ${formatBytes(data.deletedBytes)}; removed ${data.directoriesRemoved} empty folders`);
    } catch (error) {
      setCleanupStatus(`File cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCleanupRunning(false);
    }
  };

  const handleOpenRuntimePath = async (label: string, path: string) => {
    const result = await openNativeRuntimePath(path);
    setRuntimeStatus(result.ok
      ? `Opened ${label}`
      : result.error ?? `Could not open ${label}`);
  };

  const handleRevealRuntimePath = async (label: string, path: string) => {
    const result = await revealNativeRuntimePath(path);
    setRuntimeStatus(result.ok
      ? `Revealed ${label} folder`
      : result.error ?? `Could not reveal ${label}`);
  };

  const handleCopyRuntimePath = async (label: string, path: string) => {
    try {
      await navigator.clipboard?.writeText(path);
      setRuntimeStatus(`Copied ${label} path`);
    } catch (error) {
      setRuntimeStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleMenuLanguageChange = (language: DanbiMenuLanguage) => {
    setMenuLanguage(language);
    setStoredMenuLanguage(language);
  };

  const editorCommands = useMemo(() => listEditorCommands(), []);
  const editorSettingsText = editorSettingsLanguageText[menuLanguage];
  const filteredEditorCommands = useMemo(() => {
    const query = shortcutSearch.trim().toLowerCase();
    if (!query) {
      return editorCommands.slice(0, 24);
    }

    return editorCommands
      .filter((command) => {
        const localizedLabel = getEditorCommandDisplayLabel(command, menuLanguage).toLowerCase();

        return (
          command.id.toLowerCase().includes(query)
          || command.label.toLowerCase().includes(query)
          || localizedLabel.includes(query)
          || command.group.toLowerCase().includes(query)
          || command.keys.toLowerCase().includes(query)
          || command.defaultShortcuts.some((shortcut) => shortcut.toLowerCase().includes(query))
        );
      })
      .slice(0, 32);
  }, [editorCommands, menuLanguage, shortcutSearch]);

  const updateEditorSettings = (patch: Partial<EditorInteractionSettings>) => {
    setEditorSettings(patchStoredEditorInteractionSettings(patch));
  };

  const handleAddCustomShortcut = () => {
    const normalizedShortcut = normalizeEditorShortcut(shortcutKeys);
    if (!normalizedShortcut) {
      setShortcutStatus(editorSettingsText.invalidShortcut);
      return;
    }

    const defaultConflicts = findEditorCommandsByShortcut(normalizedShortcut);
    if (defaultConflicts.length > 0) {
      const conflictLabels = defaultConflicts
        .map((commandId) => {
          const command = editorCommands.find((item) => item.id === commandId);
          return command ? getEditorCommandDisplayLabel(command, menuLanguage) : commandId;
        })
        .join(', ');
      setShortcutStatus(`${editorSettingsText.conflictPrefix} ${conflictLabels}`);
      return;
    }

    const nextShortcut: EditorCustomShortcut = {
      id: `${shortcutCommandId}:${normalizedShortcut}:${Date.now()}`,
      commandId: shortcutCommandId,
      shortcut: normalizedShortcut,
      enabled: true,
    };
    updateEditorSettings({
      customShortcuts: [
        ...editorSettings.customShortcuts.filter((shortcut) => shortcut.shortcut !== normalizedShortcut),
        nextShortcut,
      ],
    });
    setShortcutKeys('');
    setShortcutStatus(editorSettingsText.shortcutAdded);
  };

  const handleRemoveCustomShortcut = (shortcutId: string) => {
    updateEditorSettings({
      customShortcuts: editorSettings.customShortcuts.filter((shortcut) => shortcut.id !== shortcutId),
    });
  };

  const text = settingsLanguageText[menuLanguage];
  const tabText = settingsTabLanguageText[menuLanguage];
  const statusItems = useMemo<ShellStatusItem[]>(() => [
    { label: text.status.ffmpeg, value: runtimeDiagnostics?.ffmpeg.ready ? text.status.ready : text.status.check, tone: runtimeDiagnostics?.ffmpeg.ready ? 'good' : 'pending' },
    { label: text.status.storage, value: runtimeDiagnostics?.paths.userDataPath ? 'userData' : text.status.pending, tone: runtimeDiagnostics?.paths.userDataPath ? 'good' : 'pending' },
    { label: 'ComfyUI', value: connectionStatus === 'connected' ? text.status.connected : text.status.offline, tone: connectionStatus === 'connected' ? 'good' : 'warn' },
    { label: text.status.warnings, value: String(runtimeDiagnostics?.warnings.length ?? 0), tone: runtimeDiagnostics?.warnings.length ? 'warn' : 'neutral' },
    { label: text.status.externalQa, value: text.status.pending, tone: 'pending' },
  ], [connectionStatus, runtimeDiagnostics, text]);

  return (
    <DanbiAppShell
      activeView="settings"
      title={text.pageTitle}
      subtitle={runtimeStatus}
      statusItems={statusItems}
    >
      <div className="mx-auto max-w-6xl">
        <div
          role="tablist"
          aria-label="Settings groups"
          data-testid="settings-tabs"
          className="mb-6 flex flex-wrap gap-2 rounded-lg border border-border bg-secondary/40 p-2"
        >
          {SETTINGS_TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === tabId}
              data-testid={`settings-tab-${tabId}`}
              onClick={() => setActiveSettingsTab(tabId)}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium transition',
                activeSettingsTab === tabId
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-foreground/70 hover:bg-secondary/80 hover:text-foreground',
              ].join(' ')}
            >
              {tabText[tabId]}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          aria-label={tabText[activeSettingsTab]}
          data-testid={`settings-tab-panel-${activeSettingsTab}`}
          className="space-y-6"
        >
          {activeSettingsTab === 'general' ? (
          <div data-testid="settings-menu-language" className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              {text.menuPanelTitle}
            </h2>
            <p className="mb-4 text-sm text-foreground/65">
              {text.menuPanelDescription}
            </p>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground/80">
                {text.menuLanguageLabel}
              </label>
              <div className="inline-flex rounded-lg border border-border bg-background/50 p-1">
                {(['en', 'ko'] as const).map((language) => (
                  <button
                    key={language}
                    type="button"
                    data-testid={`settings-menu-language-${language}`}
                    aria-pressed={menuLanguage === language}
                    onClick={() => handleMenuLanguageChange(language)}
                    className={[
                      'min-w-24 rounded-md px-4 py-2 text-sm font-medium transition',
                      menuLanguage === language
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'text-foreground/70 hover:bg-secondary/70 hover:text-foreground',
                    ].join(' ')}
                  >
                    {language === 'en' ? text.english : text.korean}
                  </button>
                ))}
              </div>
            </div>
          </div>
          ) : null}

          {activeSettingsTab === 'editor' ? (
          <div data-testid="settings-editor" className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              {editorSettingsText.title}
            </h2>
            <p className="mb-4 text-sm text-foreground/65">
              {editorSettingsText.description}
            </p>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 text-sm text-foreground/80">
                  <input
                    type="checkbox"
                    checked={editorSettings.stickyTimelineControls}
                    onChange={(event) => updateEditorSettings({ stickyTimelineControls: event.currentTarget.checked })}
                    className="mt-1"
                  />
                  <span>{editorSettingsText.stickyControls}</span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 text-sm text-foreground/80">
                  <input
                    type="checkbox"
                    checked={editorSettings.wheelZoomEnabled}
                    onChange={(event) => updateEditorSettings({ wheelZoomEnabled: event.currentTarget.checked })}
                    className="mt-1"
                  />
                  <span>{editorSettingsText.wheelZoom}</span>
                </label>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <label className="mb-2 block text-sm font-medium text-foreground/80">
                    {editorSettingsText.linkedMode}
                  </label>
                  <select
                    value={editorSettings.linkedClipEditMode}
                    onChange={(event) => updateEditorSettings({ linkedClipEditMode: event.currentTarget.value as EditorInteractionSettings['linkedClipEditMode'] })}
                    className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/40"
                  >
                    <option style={NATIVE_SELECT_OPTION_STYLE} value="separate">{editorSettingsText.separate}</option>
                    <option style={NATIVE_SELECT_OPTION_STYLE} value="linked">{editorSettingsText.linked}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground/80">
                    {editorSettingsText.shortcuts}
                  </label>
                  <input
                    type="search"
                    value={shortcutSearch}
                    onChange={(event) => setShortcutSearch(event.currentTarget.value)}
                    placeholder={editorSettingsText.searchPlaceholder}
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-2 text-foreground placeholder-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-border bg-background/30">
                  {filteredEditorCommands.map((command) => (
                    <div
                      key={command.id}
                      className="grid gap-2 border-b border-border/70 px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{getEditorCommandDisplayLabel(command, menuLanguage)}</div>
                        <div className="truncate text-xs text-foreground/50">{editorCommandGroupLabels[menuLanguage][command.group]} · {command.id}</div>
                      </div>
                      <div className="font-mono text-xs text-cyan-200">{command.keys}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    {editorSettingsText.addShortcut}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <select
                      aria-label={editorSettingsText.command}
                      value={shortcutCommandId}
                      onChange={(event) => setShortcutCommandId(event.currentTarget.value as EditorCommandId)}
                      className="min-w-0 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary"
                    >
                      {editorCommands.map((command) => (
                        <option key={command.id} style={NATIVE_SELECT_OPTION_STYLE} value={command.id}>
                          {getEditorCommandDisplayLabel(command, menuLanguage)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={editorSettingsText.shortcut}
                      value={shortcutKeys}
                      onChange={(event) => setShortcutKeys(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleAddCustomShortcut();
                        }
                      }}
                      placeholder={editorSettingsText.shortcutPlaceholder}
                      className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder-foreground/40 focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomShortcut}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80"
                    >
                      {editorSettingsText.add}
                    </button>
                  </div>
                  {shortcutStatus ? (
                    <div className="mt-2 text-xs text-foreground/65">{shortcutStatus}</div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {editorSettingsText.customShortcuts}
                  </h3>
                  {editorSettings.customShortcuts.length === 0 ? (
                    <div className="text-sm text-foreground/50">{editorSettingsText.emptyCustomShortcuts}</div>
                  ) : (
                    <div className="space-y-2">
                      {editorSettings.customShortcuts.map((shortcut) => {
                        const command = editorCommands.find((item) => item.id === shortcut.commandId);

                        return (
                          <div key={shortcut.id} className="flex items-center justify-between gap-3 rounded border border-border bg-background/50 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">
                                {command ? getEditorCommandDisplayLabel(command, menuLanguage) : shortcut.commandId}
                              </div>
                              <div className="font-mono text-xs text-cyan-200">{shortcut.shortcut}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomShortcut(shortcut.id)}
                              className="shrink-0 rounded border border-border px-3 py-1 text-xs text-foreground/70 hover:border-primary hover:text-foreground"
                            >
                              {editorSettingsText.remove}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {activeSettingsTab === 'ai' ? (
            <>
          {/* ComfyUI Connection */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              ComfyUI Connection
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  URL
                </label>
                <input
                  type="text"
                  value={comfyuiUrl}
                  onChange={(e) => setComfyuiUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="http://localhost:8188"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground/80">Status:</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  <span className={connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}>
                    {connectionStatus === 'connected' ? 'Connected' : 'Offline'}
                  </span>
                </span>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground/75">
                {connectionMessage}
              </div>

              <button
                onClick={() => {
                  void testConnection();
                }}
                disabled={testing}
                className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-all font-medium shadow-lg shadow-primary/20 disabled:bg-foreground/20 disabled:shadow-none"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>

          {/* Default Parameters */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Default Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Steps
                </label>
                <input
                  type="number"
                  value={defaultSteps}
                  onChange={(e) => setDefaultSteps(e.target.value)}
                  onBlur={() => setDefaultSteps((value) => normalizeGenerateStepsSetting(value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  min="1"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Seed
                </label>
                <input
                  type="text"
                  value={defaultSeed}
                  onChange={(e) => setDefaultSeed(e.target.value)}
                  onBlur={() => setDefaultSeed((value) => normalizeGenerateSeedSetting(value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground placeholder-foreground/40 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Random"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Output Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(normalizeGenerateOutputFormat(e.target.value))}
                  className="w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option style={NATIVE_SELECT_OPTION_STYLE} value="MP4">MP4</option>
                  <option style={NATIVE_SELECT_OPTION_STYLE} value="PNG">PNG</option>
                  <option style={NATIVE_SELECT_OPTION_STYLE} value="JPG">JPG</option>
                </select>
              </div>
            </div>
          </div>
            </>
          ) : null}

          {activeSettingsTab === 'runtime' ? (
            <>
          {/* Runtime Diagnostics */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Runtime Diagnostics
              </h2>
              <button
                onClick={() => {
                  void refreshRuntimeDiagnostics();
                }}
                disabled={runtimeLoading}
                className="px-4 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runtimeLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground/75">
              {runtimeStatus}
            </div>

            {runtimeDiagnostics ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <RuntimeSummary label="App" value={`${runtimeDiagnostics.app.name} ${runtimeDiagnostics.app.version}`} />
                  <RuntimeSummary label="Runtime" value={`${runtimeDiagnostics.app.platform} ${runtimeDiagnostics.app.arch}`} />
                  <RuntimeSummary label="FFmpeg" value={runtimeDiagnostics.ffmpeg.ready ? 'Ready' : 'Needs review'} tone={runtimeDiagnostics.ffmpeg.ready ? 'good' : 'warn'} />
                </div>

                <div className="grid gap-2">
                  {buildRuntimePathRows(runtimeDiagnostics).map((row) => (
                    <div
                      key={row.id}
                      data-testid={`runtime-path-${row.id}`}
                      className="grid gap-2 rounded-md border border-border bg-background/40 p-3 md:grid-cols-[8rem_minmax(0,1fr)_auto]"
                    >
                      <div className="text-sm font-medium text-foreground">{row.label}</div>
                      <div className="break-all text-xs text-foreground/70">{row.path}</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleCopyRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => void handleOpenRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => void handleRevealRuntimePath(row.label, row.path)}
                          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
                        >
                          Reveal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {runtimeDiagnostics.warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    {runtimeDiagnostics.warnings.slice(0, 3).map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
            </>
          ) : null}

          {activeSettingsTab === 'storage' ? (
            <>
          {/* Storage */}
          <div className="bg-secondary/50 backdrop-blur-sm border border-border rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Storage
            </h2>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-foreground/80">
                Age threshold
                <input
                  type="number"
                  value={cleanupDays}
                  min="1"
                  max="3650"
                  onChange={(e) => setCleanupDays(e.target.value)}
                  onBlur={() => {
                    void refreshStorageCleanupPreview();
                  }}
                  className="mt-2 w-full px-4 py-2 bg-background/50 border border-border text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void refreshStorageCleanupPreview();
                  }}
                  disabled={cleanupScanning || cleanupRunning}
                  className="px-6 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cleanupScanning ? 'Scanning...' : 'Scan Old Files'}
                </button>
                <button
                  onClick={handleClearOldFiles}
                  disabled={cleanupRunning || cleanupScanning}
                  className="px-6 py-2 bg-secondary border border-border hover:bg-secondary/70 text-foreground rounded-lg transition-all font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cleanupRunning ? 'Clearing...' : 'Clear Old Files'}
                </button>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-foreground/80">
                <div className="font-medium text-foreground">{cleanupStatus}</div>
                {cleanupPreview ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {cleanupPreview.targets.map((target) => (
                      <div key={target.id} className="rounded-md border border-border bg-background/40 p-3">
                        <div className="font-medium text-foreground">{target.label}</div>
                        <div className="mt-1 text-xs text-foreground/70">
                          {target.eligibleFiles} old / {target.scannedFiles} scanned / {formatBytes(target.eligibleBytes)}
                        </div>
                        {target.deletedFiles > 0 ? (
                          <div className="mt-1 text-xs text-green-400">
                            Deleted {target.deletedFiles} / {formatBytes(target.deletedBytes)}
                          </div>
                        ) : null}
                        {target.errors.length > 0 ? (
                          <div className="mt-1 text-xs text-red-400">
                            {target.errors.length} cleanup warning{target.errors.length === 1 ? '' : 's'}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
            </>
          ) : null}
        </div>
      </div>
    </DanbiAppShell>
  );
}

interface RuntimePathRow {
  id: string;
  label: string;
  path: string;
}

function buildRuntimePathRows(diagnostics: DanbiRuntimeDiagnosticsSnapshot): RuntimePathRow[] {
  return [
    { id: 'user-data', label: 'User Data', path: diagnostics.paths.userDataPath },
    { id: 'logs', label: 'Logs', path: diagnostics.paths.logsPath },
    { id: 'crash-dumps', label: 'Crash Dumps', path: diagnostics.paths.crashDumpsPath },
    { id: 'projects', label: 'Projects', path: diagnostics.paths.projectsPath },
    { id: 'packages', label: 'Packages', path: diagnostics.paths.packagesPath },
    { id: 'renders', label: 'Renders', path: diagnostics.paths.rendersPath },
    { id: 'temp', label: 'Temp', path: diagnostics.paths.tempPath },
  ];
}

function RuntimeSummary({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const toneClass = tone === 'good'
    ? 'text-green-300'
    : tone === 'warn'
      ? 'text-amber-300'
      : 'text-foreground';

  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
      <div className={`mt-1 text-sm font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
