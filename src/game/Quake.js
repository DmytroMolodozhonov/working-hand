/**
 * Quake.js — what «Earthquake» does to the ground and the eye, beyond the crack
 * SpellManager draws (how bodies fall when the ground runs away under them is
 * Impact.js / CreatureImpact.js, for every creature and the players):
 *  - the ground breaks for real: the top block along the crack falls in, and a
 *    «Максима» heaves the earth up beside it (real block edits, saved and sent
 *    to everybody);
 *  - the ground shakes for whoever is near the running wave front, not only the
 *    caster.
 */

import { BLOCK } from '../world/Terrain.js';

export const QUAKE = {
    SHAKE_R: 30, // m from the wave front: the ground shakes under you
};

/** Natural ground that cracks (not built stone, not water, not trees). */
const CRACKS = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.FARMLAND, BLOCK.PATH]);

export class Quake {
    constructor(game) {
        this.game = game;
    }

    /**
     * The ground breaks where the crack runs (host only): the top block falls in;
     * a «Максима» throws the earth up beside it. Returns the edits made.
     */
    breakGround(x, z, power, side) {
        const g = this.game;
        const data = g.terrain?.data;
        if (!data || !g.builder) return [];
        const edits = [];
        const ix = Math.round(x), iz = Math.round(z);
        const L = data.topLayer(ix, iz);
        const t = data.get(ix, L, iz);
        if (!CRACKS.has(t)) return edits; // (bedrock, water, built stone and trees stay)
        if (this.game?.wards?.protects(ix, L - 1, iz)) return edits; // (the crack stops at a house's sphere of protection)
        edits.push([ix, L, iz, BLOCK.AIR]);
        if (power > 1 && side) {
            // the slab beside the crack is pushed up out of the ground
            const sx = Math.round(x + side.x * 1.5), sz = Math.round(z + side.z * 1.5);
            const SL = data.topLayer(sx, sz);
            if (CRACKS.has(data.get(sx, SL, sz)) && data.get(sx, SL + 1, sz) === BLOCK.AIR) edits.push([sx, SL + 1, sz, data.get(sx, SL, sz)]);
        }
        for (const e of edits) data.set(e[0], e[1], e[2], e[3]);
        // a crack beside a river or a lake fills with its water (sent too: the same on every computer)
        const holes = edits.filter((e) => e[3] === BLOCK.AIR).map((e) => ({ x: e[0], y: e[1] - 1, z: e[2] }));
        for (const [x, L, z] of data._flood?.(holes) || []) edits.push([x, L, z, BLOCK.WATER]);
        g.builder._sendEdits(edits);
        return edits;
    }

    /** The wave front is here: the ground shakes under me if I am near it (every computer). */
    shake(front, power) {
        const g = this.game;
        if (!g.character || !g.fx) return;
        const d = g.character.group.position.distanceTo(front);
        if (d > QUAKE.SHAKE_R) return;
        if (g.temple?.wards?.(g.character.group.position)) return; // (in the Gods' temple: its golden ward holds still)
        const s = (power > 1 ? 1.6 : 0.9) * (1 - d / QUAKE.SHAKE_R);
        g.fx.shake = Math.max(g.fx.shake || 0, s);
    }
}
