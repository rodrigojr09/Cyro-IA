import { useEffect, useState } from 'react';
import { readPreference, writePreference } from '../shared/bridge';
export function usePreferences(initial = {}) {
  const [preferences, setPreferences] = useState(() => ({
    ...{ voice: true, collapsed: false, largeText: false, theme: 'dark' },
    ...readPreference('jarvis.preferences', {}),
  }));
  useEffect(() => {
    if (!readPreference('jarvis.setup-applied', false) && Object.keys(initial).length) {
      setPreferences((value) => ({
        ...value,
        ...(typeof initial.voice === 'boolean' ? { voice: initial.voice } : {}),
        theme: initial.theme || value.theme,
      }));
      writePreference('jarvis.setup-applied', true);
    }
  }, [initial]);
  useEffect(() => {
    writePreference('jarvis.preferences', preferences);
    document.documentElement.dataset.theme = preferences.theme;
    document.body.classList.toggle('large-text', preferences.largeText);
    document.body.classList.toggle('sidebar-collapsed', preferences.collapsed);
    void window.jarvisWindow.voicePreference?.(preferences.voice).catch(() => {});
  }, [preferences]);
  return [preferences, (patch) => setPreferences((value) => ({ ...value, ...patch }))];
}
