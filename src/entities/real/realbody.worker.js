/**
 * realbody.worker.js — makes the «Реалистичный» hero's skin off the game's thread: once a session the body
 * (RealBuild.buildRealBody: the shapes meshed, thinned, weighted), and for each look its hair, hat and the clothes'
 * pieces (RealWear.buildRealWear). The arrays are handed over, not copied.
 */
import { buildRealBody, transferList } from './RealBuild.js';
import { buildRealWear } from './RealWear.js';

self.onmessage = (e) => {
    const m = e.data || {};
    if (m.wear != null) {
        const lods = [buildRealWear(m.wear, 0), buildRealWear(m.wear, 1)];
        const list = [];
        for (const l of lods) for (const g of Object.values(l)) if (g) for (const k of ['pos', 'nor', 'idx', 'skinIndex', 'skinWeight', 'info', 'mix', 'limb']) list.push(g[k].buffer);
        self.postMessage({ id: m.id, wear: m.wear, lods }, list);
        return;
    }
    const built = buildRealBody();
    self.postMessage({ id: m.id, body: built }, transferList(built));
};
