/**
 * temple.worker.js — the Temple of the Gods' look and solids (GodsTemple.templePlan: ~0.5 s of work —
 * never in a frame of the game). In: {id, seed}; out: {id, plan} (the mesh arrays moved, not copied).
 */
import { templePlan, TEMPLE_MATS } from './GodsTemple.js';

self.onmessage = (e) => {
    const { id, seed } = e.data || {};
    const plan = templePlan(seed);
    const transfer = [];
    for (const m of TEMPLE_MATS) { const a = plan.mats[m]; transfer.push(a.pos.buffer, a.nor.buffer, a.col.buffer); }
    self.postMessage({ id, plan }, transfer);
};
