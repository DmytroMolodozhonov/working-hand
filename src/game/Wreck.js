/**
 * Wreck.js — things in a building that is blown apart (doors, beds, chests, window glass).
 *
 * They are not blocks, so a blast used to leave them hanging in the air — a door
 * standing where the wall was, a bed floating over a hole — and the next spells hit
 * them instead of the wall. Now, after every blast (on every computer, from the same
 * blocks, so it agrees everywhere and needs nothing saved):
 *  - a door with nothing left to hang on (no lintel above it, no post at its side)
 *    breaks and falls apart (a door a player made is broken by a blast right at it);
 *  - a bed or a chest with no floor under it falls to the floor below;
 *  - window glass whose wall above is gone breaks.
 * The same rules decide a house's door, beds and chests when the house comes near again.
 */

import * as THREE from 'three';
import { isSolid } from '../world/Terrain.js';

const _v = new THREE.Vector3();

/** Is a house door (from its record) still held by its frame? */
export function doorHeld(t, d) {
    if (!t || !d) return true;
    const L0 = Math.round(d.y + 1.5), h = Math.round(d.h || 5), w = d.w || 3;
    const ax = Math.cos(d.ry || 0), az = -Math.sin(d.ry || 0); // along the door
    const solid = (x, L, z) => isSolid(t.get(Math.round(x), L, Math.round(z)));
    const above = solid(d.x, L0 + h, d.z) || solid(d.x + ax, L0 + h, d.z + az) || solid(d.x - ax, L0 + h, d.z - az);
    const s = w / 2 + 0.5;
    const left = solid(d.x + ax * s, L0 + 1, d.z + az * s), right = solid(d.x - ax * s, L0 + 1, d.z - az * s);
    return above || (left && right);
}

/** The floor height (feet y) under a thing standing at y (it falls to it); null: nothing under it. */
export function floorUnder(t, x, y, z) {
    if (!t) return y;
    const L = Math.round(y + 1.5);
    const f = t.floorBelow(Math.round(x), Math.round(z), L);
    if (f < (t.bedrockTop ?? -99)) return null;
    return f - 0.5;
}

export class Wreck {
    constructor(game) { this.game = game; }

    get data() { return this.game.world?.terrain?.data || null; }

    /**
     * After a blast (and what fell after it): doors, beds, chests, glass round it. `power`: the
     * blast's strength (a falling roof: 0) — the gates of a throne room hold one (src/game/Alohomora.js).
     */
    afterBlast(pos, radius, power = 0) {
        const g = this.game, t = this.data;
        if (power > 0) g.locks?.blast(pos, radius, power);
        if (!t) return;
        const R = radius + 24; // (a fallen roof may leave things hanging a little further)
        const near = (x, z) => Math.abs(x - pos.x) < R && Math.abs(z - pos.z) < R;
        // doors
        for (const d of [...(g.doors?.list.values() || [])]) {
            if (!near(d.x, d.z) || d.lifted || g.doors.carried?.door === d || d.gate || d.ship) continue; // (a ship's door: its ship's own wood) // (the gates: Alohomora.blast)
            const hit = Math.hypot(d.x - pos.x, d.y + 1.8 - pos.y, d.z - pos.z) < radius + 0.8;
            if (d.gen ? !doorHeld(t, d) : hit) this._breakDoor(d);
        }
        // beds and chests fall to the floor below
        for (const b of [...(g.beds?.list.values() || [])]) {
            if (!near(b.x, b.z) || g.beds.lying === b.id) continue;
            const y = floorUnder(t, b.x, b.y, b.z);
            if (y == null) g.beds.removeBed(b.id);
            else if (y < b.y - 0.3) g.beds._place({ id: b.id, x: b.x, y, z: b.z, ry: b.ry, color: b.color });
        }
        for (const c of g.chests || []) {
            const p = c.getPosition();
            if (!near(p.x, p.z)) continue;
            const y = floorUnder(t, p.x, p.y - 0.25, p.z); // (a chest stands on its floor: its mesh's y)
            if (y == null || y >= p.y - 0.3 - 0.5) continue;
            this._carryOver(p, y - p.y); // (what floats over an opened chest goes down with it)
            c.mesh.position.y = y;
            c.mesh.updateMatrixWorld(true);
            if (c.boxId != null) { g.collision.removeBox(c.boxId); c.boxId = g.collision.addBox(c.getCollisionBox()); }
        }
        // window glass with no wall over it
        const H = g.houses;
        if (H?.panes) for (const p of [...H.panes]) {
            if (!near(p.x, p.z)) continue;
            const top = Math.round(p.y + 1 + (p.h - 1) / 2) + 1;
            if (!isSolid(t.get(Math.round(p.x), top, Math.round(p.z)))) H.breakPane(p.id, null, false);
        }
    }

    /** Things floating over a chest at p go down by dy with it. */
    _carryOver(p, dy) {
        const g = this.game;
        const over = (m) => Math.abs(m.x - p.x) < 2.2 && Math.abs(m.z - p.z) < 2.2 && m.y > p.y - 0.3 && m.y < p.y + 3.2;
        for (const L of g.items?.loose.values() || []) if (L.hover && over(L.hover)) { L.hover.y += dy; L.model.position.y += dy; }
        for (const w of g.weapons?.weapons || []) if (w.hover?.base && !w.holder && over(w.hover.base)) { w.hover.base.y += dy; w.position.y += dy; }
    }

    _breakDoor(d) {
        const g = this.game;
        g.doors.remove(d.id);
        g.locks?.spelled?.delete(d.id); // (a door shut by «Lock» breaks as any other: it's a lock, not a ward)
        if (d.gen) d.wrecked = true;
        const col = d.color ?? 0x7a4f2a;
        const debris = [];
        for (let i = 0; i < 10; i++) debris.push({ x: d.x + (Math.random() - 0.5) * 2, y: d.y + 0.5 + Math.random() * 3.5, z: d.z + (Math.random() - 0.5) * 2, color: col, size: 0.6 });
        g.fx?.debrisFrom?.(debris, _v.set(d.x, d.y + 1.5, d.z), 20);
    }
}
