import { useEffect, useState } from 'react';
import {
  readStoredMenuLanguage,
  subscribeMenuLanguage,
  type DanbiMenuLanguage,
} from '../../lib/editor/menu-language';

export function useMenuLanguage(): DanbiMenuLanguage {
  const [language, setLanguage] = useState<DanbiMenuLanguage>('en');

  useEffect(() => {
    setLanguage(readStoredMenuLanguage());
    return subscribeMenuLanguage(setLanguage);
  }, []);

  return language;
}
