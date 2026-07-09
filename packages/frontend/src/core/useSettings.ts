import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings, updateSettings, type Settings } from './settings';

/** Hook reaktywny na core/settings.ts — useSyncExternalStore unika rozjazdu przy współbieżnym renderze. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  return [settings, updateSettings];
}
