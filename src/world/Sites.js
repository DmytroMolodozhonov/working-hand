/**
 * Sites.js — every built place of the world in one index: castles (src/world/Castles.js)
 * and the wizards' towers (src/world/WizardTowers.js). The ground, the chunks, the people,
 * the houses, the animals and the minimap ask it instead of the castles alone.
 * (Pure: imports nothing from Terrain.js.)
 */
export class SiteIndex {
    constructor(castles, towers) { this.castles = castles; this.towers = towers; }

    near(x, z, r = 0) {
        const a = this.castles.near(x, z, r), b = this.towers.near(x, z, r);
        return b.length ? a.concat(b) : a;
    }

    landAt(ix, iz) { return this.castles.landAt(ix, iz) || this.towers.landAt(ix, iz); }

    partsForChunk(cx, cz, C) {
        const a = this.castles.partsForChunk(cx, cz, C), b = this.towers.partsForChunk(cx, cz, C);
        return b.length ? a.concat(b) : a;
    }

    /** The site of an id: castles «cs…», towers «wt…», the people of the roads: wandering wizards «ww…», knights errant «wk…», travelling folk «wc…». */
    byId(id) {
        const m = /^(cs|wt|ww|wk|wc)(-?\d+)_(-?\d+)$/.exec(id);
        if (!m) return null;
        return m[1] === 'cs' ? this.castles.cellOf(+m[2], +m[3]) : m[1] === 'wt' ? this.towers.cellOf(+m[2], +m[3]) : this.towers.wanderDef(+m[2], +m[3], m[1]);
    }

    /** Castles and towers for the minimap, nearest first ({x, z, name, icon, def}); cached while they don't change. */
    nearestForMap(p) {
        const a = this.castles.nearestForMap(p), b = this.towers.nearestForMap(p);
        if (a !== this._ma || b !== this._mb) {
            this._ma = a; this._mb = b;
            const out = [...a.map((c) => ({ x: c.x, z: c.z, name: c.name, icon: '🏰', def: c })), ...b.map((c) => ({ x: c.x, z: c.z, name: c.name, icon: '🧙', def: c }))];
            this._list = out.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z));
        }
        return this._list;
    }
}
