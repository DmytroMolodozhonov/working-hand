/**
 * Sites.js — every built place of the world in one index: castles (src/world/Castles.js),
 * the wizards' towers (src/world/WizardTowers.js), the wizards' settlements (src/world/WizardVillages.js) and the hamlets
 * between them — lone houses, small villages (src/world/Hamlets.js). The ground, the chunks, the people,
 * the houses, the animals and the minimap ask it instead of the castles alone.
 * (Pure: imports nothing from Terrain.js.)
 */
import { offEarth } from './Planets.js';

export class SiteIndex {
    constructor(castles, towers, ice = null, villages = null, hamlets = null, arenas = null) { this.castles = castles; this.towers = towers; this.ice = ice; this.villages = villages; this.hamlets = hamlets; this.arenas = arenas; }

    /** The duel arenas (DuelArenas.js) whose land reaches within `r` of a point. */
    arenasNear(x, z, r = 0) { return this.arenas && !offEarth(x - r) ? this.arenas.near(x, z, r) : []; }

    /** The indexes of the places people live in (castles, towers, settlements, hamlets). */
    get lived() { return this._lived || (this._lived = [this.castles, this.towers, this.villages, this.hamlets].filter(Boolean)); }

    near(x, z, r = 0) {
        if (offEarth(x - r)) return []; // (other planets: nobody built anything there — Planets.js)
        const a = this.castles.near(x, z, r), b = this.towers.near(x, z, r), c = this.villages ? this.villages.near(x, z, r) : [];
        const h = this.hamlets ? this.hamlets.near(x, z, r) : [];
        return b.length || c.length || h.length ? a.concat(b, c, h) : a;
    }

    /**
     * Make, a little at a time, the castles and towers within `r` that nobody asked for yet (cells of
     * `cell` m): a flight comes to them fast, and the minimap and the people ask for all of them at
     * once — a row of new castles made in one frame was a long one. The same castles either way.
     */
    warm(x, z, r, cell, ms = 1.5) {
        const t0 = performance.now();
        const g0x = Math.floor((x - r) / cell) - 1, g1x = Math.floor((x + r) / cell) + 1;
        const g0z = Math.floor((z - r) / cell) - 1, g1z = Math.floor((z + r) / cell) + 1;
        for (const idx of this.lived) {
            for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
                if (idx.cells.has(idx._key(gx, gz))) continue;
                idx.cellOf(gx, gz);
                if (performance.now() - t0 > ms) return false;
            }
        }
        return true;
    }

    // (the Ice Castle — IceCastle.js — levels its summit and is built into the chunks like a castle;
    //  it is not one of `near`'s: nobody lives there but the Ice Queen and her creatures, IceQueen.js)
    landAt(ix, iz) { return this.castles.landAt(ix, iz) || this.towers.landAt(ix, iz) || (this.villages ? this.villages.landAt(ix, iz) : null) || (this.arenas ? this.arenas.landAt(ix, iz) : null) || (this.ice ? this.ice.landAt(ix, iz) : null) || (this.hamlets ? this.hamlets.landAt(ix, iz) : null); }

    partsForChunk(cx, cz, C) {
        const a = this.castles.partsForChunk(cx, cz, C), b = this.towers.partsForChunk(cx, cz, C);
        const v = this.villages ? this.villages.partsForChunk(cx, cz, C) : [];
        const c = this.ice ? this.ice.partsForChunk(cx, cz, C) : [];
        const h = this.hamlets ? this.hamlets.partsForChunk(cx, cz, C) : [];
        const d = this.arenas ? this.arenas.partsForChunk(cx, cz, C) : []; // (the duel arenas: DuelArenas.js)
        return b.length || c.length || v.length || h.length || d.length ? a.concat(b, v, c, h, d) : a;
    }

    /** The site of an id: castles «cs…», towers «wt…», settlements «wv…», hamlets «hm…», the people of the roads: wandering wizards «ww…», knights errant «wk…», travelling folk «wc…» (riders too). */
    byId(id) {
        const h = /^hm(-?\d+)_(-?\d+)_(\d+)$/.exec(id);
        if (h) return this.hamlets ? this.hamlets.byId(+h[1], +h[2], +h[3]) : null;
        const m = /^(cs|wt|wv|ww|wk|wc)(-?\d+)_(-?\d+)$/.exec(id);
        if (!m) return null;
        if (m[1] === 'wv') return this.villages ? this.villages.cellOf(+m[2], +m[3]) : null;
        return m[1] === 'cs' ? this.castles.cellOf(+m[2], +m[3]) : m[1] === 'wt' ? this.towers.cellOf(+m[2], +m[3]) : this.towers.wanderDef(+m[2], +m[3], m[1]);
    }

    /** Castles and towers for the minimap, nearest first ({x, z, name, icon, def}); cached while they don't change. */
    nearestForMap(p) {
        const a = this.castles.nearestForMap(p), v = this.villages ? this.villages.nearestForMap(p) : [];
        const t1 = this.towers.only(), b = this._tw && this._tw[0] === t1 ? this._tw : (this._tw = t1 ? [t1] : []); // (the world's one tower: always on the map)
        const h = this.hamlets ? this.hamlets.nearestForMap(p) : [];
        if (a !== this._ma || b !== this._mb || v !== this._mv || h !== this._mh) {
            this._ma = a; this._mb = b; this._mv = v; this._mh = h;
            const out = [...a.map((c) => ({ x: c.x, z: c.z, name: c.name, icon: '🏰', def: c })), ...b.map((c) => ({ x: c.x, z: c.z, name: c.name, icon: '🧙', def: c, always: true })), ...v.map((c) => ({ x: c.x, z: c.z, name: c.name, icon: '✨', def: c, always: true }))];
            out.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z));
            // (the village graveyards: small crosses on the map, only the ones close by)
            for (const c of a) for (const g of c.graveyards || []) out.push({ x: g.x, z: g.z, name: 'Кладбище', icon: '✝', def: c });
            // (the hamlets — villages of folk and of wizards, not the lone houses: small badges, up to HAMLET.MAP_R; the far ones as pointers on the edge)
            for (const c of h) out.push({ x: c.x, z: c.z, name: c.name.replace(/^[^«]*«|»$/g, ''), icon: c.mage ? '✦' : '⌂', def: c });
            this._list = out;
        }
        return this._list;
    }
}
