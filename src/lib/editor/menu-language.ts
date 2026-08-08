export type DanbiMenuLanguage = 'en' | 'ko';

export const MENU_LANGUAGE_STORAGE_KEY = 'danbi.shell.language';

const MENU_LANGUAGE_CHANGE_EVENT = 'danbi-menu-language-change';

export function normalizeMenuLanguage(value: string | null | undefined): DanbiMenuLanguage {
  return value === 'ko' ? 'ko' : 'en';
}

export function readStoredMenuLanguage(): DanbiMenuLanguage {
  if (typeof window === 'undefined') {
    return 'en';
  }

  return normalizeMenuLanguage(window.localStorage.getItem(MENU_LANGUAGE_STORAGE_KEY));
}

export function setStoredMenuLanguage(language: DanbiMenuLanguage): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(MENU_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent(MENU_LANGUAGE_CHANGE_EVENT, {
    detail: { language },
  }));
}

export function subscribeMenuLanguage(listener: (language: DanbiMenuLanguage) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === MENU_LANGUAGE_STORAGE_KEY) {
      listener(normalizeMenuLanguage(event.newValue));
    }
  };

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ language?: string }>).detail;
    listener(normalizeMenuLanguage(detail?.language));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(MENU_LANGUAGE_CHANGE_EVENT, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(MENU_LANGUAGE_CHANGE_EVENT, handleCustom);
  };
}
