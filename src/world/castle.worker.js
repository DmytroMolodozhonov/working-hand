/**
 * castle.worker.js — the blocks of a castle made by magic (MagicCastle.castleCells: ~0.15 s of work —
 * never in a frame of the game). In: {id, o}; out: {id, cells, shapes, fill, n, nAir, nRise} (the arrays moved, not copied).
 */
import { castleCells } from './MagicCastle.js';

self.onmessage = (e) => {
    const { id, o } = e.data || {};
    const r = castleCells(o);
    self.postMessage({ id, ...r }, [r.cells.buffer, r.fill.buffer, r.shapes.buffer]);
};
