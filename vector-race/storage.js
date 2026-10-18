import { initialState, move, key } from './engine.js';
export const STORAGE_KEY = 'vector-race.v1';
export function fingerprint(blocks) { let h = 2166136261;for (const ch of JSON.stringify(blocks)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);return (h >>> 0).toString(36); }
export const recordKey = track => `${track.id}:${fingerprint(track.blocks)}`;
export function replay(track, start, actions) {
  if (!Array.isArray(start) || !track.starts.some(p => key(p) === key(start)) || !Array.isArray(actions) || actions.length > 10000) return null;
  try {
    let state = initialState(start);
    for (const a of actions) { if (state.status !== 'racing') return null;state = move(track, state, a); }
    return state;
  } catch { return null; }
}
export function loadData(storage) {
  const empty = { version: 1, records: {}, saved: [], draft: null, session: null, settings: { sound: false, ghost: true, snap: true, theme:'dark', language:'fr' } };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 12000000) return empty;
    const data = JSON.parse(raw);
    if (data?.version !== 1) return empty;
    return { ...empty, records: data.records && typeof data.records === 'object' && !Array.isArray(data.records) ? data.records : {}, saved: Array.isArray(data.saved) ? data.saved.slice(0, 30) : [], draft: data.draft, session: data.session, settings: { sound: data.settings?.sound === true, ghost: data.settings?.ghost !== false, snap: data.settings?.snap !== false, theme:data.settings?.theme==='light'?'light':'dark',language:data.settings?.language==='en'?'en':'fr' } };
  } catch { return empty; }
}
export function saveData(storage, data) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(data));return true; } catch { return false; }
}
export function verifiedRecord(track, record) {
  if (!record || typeof record !== 'object') return null;
  const state = replay(track, record.start, record.actions);
  return state?.status === 'won' && state.moves === record.moves ? { ...record, history: state.history } : null;
}
