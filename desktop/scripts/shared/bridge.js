// Renderers can only use the narrow, authenticated preload bridges.
export async function api(route, options) {
  let result;
  try {
    result = await window.jarvisWindow.api(route, options);
  } catch (error) {
    throw new Error(publicError(error), { cause: error });
  }
  if (!result?.ok) throw new Error(result?.data?.detail || 'Não foi possível concluir a operação.');
  return result.data;
}
export function publicError(error) {
  return String(error?.message || 'Não foi possível concluir a operação.')
    .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    .slice(0, 512);
}
export const post = (route, data) => api(route, { method: 'POST', body: JSON.stringify(data) });
export const preferenceStorage = () => window.jarvisStorage || localStorage;
export function readPreference(key, fallback) {
  try {
    return JSON.parse(preferenceStorage().getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writePreference(key, value) {
  try {
    preferenceStorage().setItem(key, JSON.stringify(value));
  } catch {}
}
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      for (const notify of listeners) notify();
    },
    subscribe: (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
  };
}

export function ignoreOwnSelection(event) {
  if (event.defaultPrevented) return;
  const target = event.target;
  const text =
    target && typeof target.value === 'string' && typeof target.selectionStart === 'number'
      ? target.value.slice(target.selectionStart, target.selectionEnd)
      : window.getSelection()?.toString();
  if (text && text.length <= 5400)
    void window.jarvisClipboard?.ignoreOwnCopy?.(text)?.catch(() => {});
}
