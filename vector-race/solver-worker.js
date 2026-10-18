import { makeTrack, solve, validatePlayable } from './engine.js';
import { setLocale } from './i18n.js';
self.onmessage = ({ data }) => {
  setLocale(data.locale);
  try {
    const track = makeTrack(data.blocks), error = validatePlayable(track);
    self.postMessage({ requestId: data.requestId, error, result: error ? null : solve(track, data.start, data.maxStates || 400000) });
  } catch (e) { self.postMessage({ requestId: data.requestId, error: e.message }); }
};
