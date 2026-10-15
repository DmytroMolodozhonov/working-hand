/**
 * space.worker.js — the planets' pictures for the view from space (PlanetTextures.js), made away from
 * the drawing: the game asks for one map at a time and gets its RGBA bytes back.
 * It has its own copy of the world's recipe (the Earth's map is the world round the start) and of the
 * planets (created / terraformed ones come with the request).
 */
import { TerrainData } from './Terrain.js';
import { planetTexture } from './PlanetTextures.js';

let data = null;

self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
        data = new TerrainData();
        data.generate(m.opts);
        if (m.planets) data.planets.applyJSON(m.planets);
        return;
    }
    if (m.type === 'planets' && data) { data.planets.applyJSON(m.s); return; }
    if (m.type !== 'tex' || !data) return;
    const def = data.planets.get(m.id);
    if (!def) { self.postMessage({ type: 'tex', id: m.id, key: m.key, none: true }); return; }
    const t0 = performance.now();
    const r = planetTexture(def, m.w, m.h, data);
    self.postMessage({ type: 'tex', id: m.id, key: m.key, w: r.w, h: r.h, data: r.data, ms: performance.now() - t0 }, [r.data.buffer]);
};
