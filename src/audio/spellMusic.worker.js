/**
 * spellMusic.worker.js — the spells' tunes, effects and loops (SpellMusic.js): ~1.5 s of synthesis, never
 * in a frame of the game. In: {sr}; out: one message per sound {key, data} (moved), then {done: true}.
 */
import { SPELL_GEN } from './SpellMusic.js';

self.onmessage = (e) => {
    const sr = e.data?.sr;
    for (const [key, gen] of Object.entries(SPELL_GEN)) {
        const data = gen(sr);
        self.postMessage({ key, data }, [data.buffer]);
    }
    self.postMessage({ done: true });
};
