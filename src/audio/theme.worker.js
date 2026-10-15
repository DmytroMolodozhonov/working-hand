/**
 * theme.worker.js — the long tune of «Create a Castle» (HouseTheme.houseTheme for 30 s, its grandest form):
 * ~0.2 s of synthesis, never in a frame of the game. In: {sr, seconds, level}; out: {data} (moved).
 */
import { houseTheme } from './HouseTheme.js';

self.onmessage = (e) => {
    const { sr, seconds, level } = e.data || {};
    const data = houseTheme(sr, seconds, level);
    self.postMessage({ data }, [data.buffer]);
};
