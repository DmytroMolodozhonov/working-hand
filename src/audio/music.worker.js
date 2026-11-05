/**
 * music.worker.js — one tune of the game's music made (MusicComposer.renderTune of MusicCatalog's recipe): ~1–3 s of synthesis, never in
 * a frame of the game. In: {id, sr}; out: {id, left, right} (moved).
 */
import { renderTune } from './MusicComposer.js';
import { tuneById } from './MusicCatalog.js';

self.onmessage = (e) => {
    const { id, sr } = e.data || {};
    const t = tuneById(id);
    if (!t) { self.postMessage({ id, left: null, right: null }); return; }
    const r = renderTune(t, sr);
    self.postMessage({ id, left: r.left, right: r.right }, [r.left.buffer, r.right.buffer]);
};
