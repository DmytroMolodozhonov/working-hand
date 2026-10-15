/**
 * ZombieSpawn.js — zombies come out of the dark.
 *
 * Where: only where it is DARK — the light of a place is the daylight reaching it (Terrain.skyAt:
 * 1 under the open sky … ~0.04 deep in a cave) times how much of the day is left (night: little).
 *   - Caves are dark by day and by night: that is where zombies mostly are. A player who comes near
 *     a cave system meets them for sure (the first time a system is near, one comes at once; then
 *     CAVE_CHANCE a check), in its dark tunnels and chambers — never at the lit mouth.
 *   - The open ground is dark only at night: now and then (NIGHT_CHANCE a check) one comes out
 *     there, far from the players — never in a castle, a village or a tower's land, nor in water.
 *   - Never in a lit place: by a campfire, by a «Люмос» (in a hand or thrown), by the night watch's
 *     torches (LIGHT_R); never under the player's nose (MIN_D from every player).
 * How many: at most NEAR_CAP of them round a player and CAP in the whole world; a zombie that
 * came out of the dark and is far from every player (FORGET) goes back into it (removed).
 *
 * Modes: «Выживание» (free world) — always; «Творческий» — only with zombies on (the slider is not
 * 0); «Хардкор» keeps its hordes (eternal night: everywhere is dark) — but they too never come
 * out in a lit place (`litAt`, Game.spawnZombieWave). Maps: their own zombies only.
 * Multiplayer: the host decides (a zombie it makes goes to everybody with the zombie snapshots).
 */

import * as THREE from 'three';
import { ZOMBIE_GROUND_OFFSET } from '../entities/Zombie.js';

export const ZSPAWN = {
    EVERY: 6, // s between the host's checks
    CAVE_NEAR: 60, // m: a cave system this near a player — he is «at a cave»
    CAVE_CHANCE: 0.3, // a check brings a zombie in the cave's dark
    NIGHT_CHANCE: 0.08, // a check brings one on the open ground at night
    DARK: 0.2, // a place this dark or darker (light 0…1)
    NIGHT_DIM: 0.85, // how much the night takes off the daylight
    MIN_D: 20, // m: never nearer a player
    MAX_D: 55, // m: and not farther (a cave: along its tunnels)
    NIGHT_D: [32, 60], // m out on the open ground
    LIGHT_R: 14, // m round a light: no zombie comes out there
    NEAR: 80, NEAR_CAP: 5, // zombies of the dark round a player
    CAP: 14, // and in the whole world
    FORGET: 150, // m from every player: back into the dark
};

/** How lit a place is (0 dark … 1 broad day): the daylight reaching it, dimmed by the night. */
export function lightLevel(sky, night) {
    return Math.max(0, Math.min(1, sky)) * (1 - ZSPAWN.NIGHT_DIM * Math.max(0, Math.min(1, night)));
}

/** Is a point lit by one of the lights ([{x, y, z, r?}])? */
export function litAt(lights, x, y, z, r = ZSPAWN.LIGHT_R) {
    for (const l of lights) { const R = l.r ?? r; if ((l.x - x) ** 2 + ((l.y ?? y) - y) ** 2 + (l.z - z) ** 2 < R * R) return true; }
    return false;
}

/** The lights of the world now: campfires, «Люмос» (mine, the others', thrown), the watch's torches. */
export function worldLights(g) {
    const out = [];
    for (const f of g.campfires?.list?.values?.() || []) out.push({ x: f.x, y: f.y, z: f.z });
    const wm = g.wandMagic;
    if (wm?.light && g.character) { const p = g.character.group.position; out.push({ x: p.x, y: p.y, z: p.z, r: ZSPAWN.LIGHT_R + 4 * (wm.light.level || 1) }); }
    for (const t of wm?.thrown || []) if (t.pos) out.push({ x: t.pos.x, y: t.pos.y, z: t.pos.z });
    for (const r of g.remotes?.values?.() || []) if (r.lumos && r.position) out.push({ x: r.position.x, y: r.position.y, z: r.position.z, r: ZSPAWN.LIGHT_R + 6 });
    for (const v of g.castleLife?.byId?.values?.() || []) if (v.role === 'knight' && !v.dead && (v.fx & 1) && v.model?.group) { const p = v.model.group.position; out.push({ x: p.x, y: p.y, z: p.z }); }
    return out;
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class ZombieSpawn {
    constructor(game) {
        this.game = game;
        this._t = ZSPAWN.EVERY * 0.5;
        this._seenCaves = new Set(); // cave systems a player has already come near (the first meeting: at once)
        this.log = []; // (tests) where zombies came out: 'cave' / 'night'
    }

    get enabled() {
        const g = this.game, c = g.config || {};
        if (!g.authority || c.map || c.mode === 'test') return false;
        if (c.mode === 'freeworld') return true;
        if (c.mode === 'creative') return (c.zombieCount || 0) > 0;
        return false;
    }

    /** How dark the night is now (0 day … 1 night). */
    night() {
        const g = this.game;
        return g.dayCycle ? g.world?.nightAmount ?? 0 : g.config?.mode === 'survival' ? 1 : 0;
    }

    _players() {
        const g = this.game, out = [];
        if (!g.isDeadLocal && g.character) out.push(g.character.group.position);
        for (const r of g.remotes?.values?.() || []) if (!r.dead && r.position) out.push(r.position);
        return out;
    }

    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        // back into the dark: far from everybody
        const ps = this._players();
        if (!ps.length) return;
        for (const z of [...g.zombies]) {
            if (!z.fromDark || z.isDead || z.isThrall) continue;
            if (!ps.some((p) => Math.hypot(p.x - z.group.position.x, p.z - z.group.position.z) < ZSPAWN.FORGET)) g.removeZombie(z);
        }
        this._t -= dt;
        if (this._t > 0) return;
        this._t = ZSPAWN.EVERY;
        const dark = g.zombies.filter((z) => z.fromDark && !z.isDead);
        if (dark.length >= ZSPAWN.CAP) return;
        const P = ps[Math.floor(Math.random() * ps.length)];
        if (dark.filter((z) => Math.hypot(P.x - z.group.position.x, P.z - z.group.position.z) < ZSPAWN.NEAR).length >= ZSPAWN.NEAR_CAP) return;
        const lights = worldLights(g);
        this.trySpawn(P, ps, lights);
    }

    /** (host) One check round a player: a cave first, else the open night. → the zombie or null. */
    trySpawn(P, ps = this._players(), lights = worldLights(this.game), force = false) {
        const t = this.game.terrain?.data;
        if (!t) return null;
        const caves = t.cavesNear ? t.cavesNear(P.x, P.z, ZSPAWN.CAVE_NEAR) : [];
        if (caves.length) {
            const first = caves.find((s) => !this._seenCaves.has(s.id));
            for (const s of caves) this._seenCaves.add(s.id);
            if (force || first || Math.random() < ZSPAWN.CAVE_CHANCE) {
                const at = this.caveSpot(first || caves[Math.floor(Math.random() * caves.length)], P, ps, lights);
                if (at) return this._make(at, 'cave');
            }
        }
        if (this.night() > 0.6 && (force || Math.random() < ZSPAWN.NIGHT_CHANCE)) {
            const at = this.nightSpot(P, ps, lights);
            if (at) return this._make(at, 'night');
        }
        return null;
    }

    _make(at, where) {
        const z = this.game._createZombie(new THREE.Vector3(at.x, at.y, at.z));
        z.fromDark = where;
        this.log.push(where);
        if (this.log.length > 40) this.log.shift();
        this.last = { where, at: { ...at } }; // (tests)
        return z;
    }

    /** Is this a place a zombie may come out at: far enough from every player, unlit? */
    _clear(x, y, z, ps, lights) {
        for (const p of ps) if (Math.hypot(p.x - x, p.y - y, p.z - z) < ZSPAWN.MIN_D) return false;
        return !litAt(lights, x, y, z);
    }

    /** A dark spot in a cave system (its tunnels, its chambers) near the player, or null. */
    caveSpot(s, P, ps, lights) {
        const t = this.game.terrain.data;
        const night = this.night();
        for (let k = 0; k < 24; k++) {
            let x, y, z;
            if (s.segs?.length) {
                const g = s.segs[Math.floor(Math.random() * s.segs.length)];
                const f = Math.random();
                x = g.ax + (g.bx - g.ax) * f; y = g.ay + (g.by - g.ay) * f; z = g.az + (g.bz - g.az) * f;
            } else if (s.kx != null) { // (an old world's cave: one chamber)
                const a = Math.random() * Math.PI * 2, r = Math.random() * (s.r || 6) * 0.7;
                x = s.kx + Math.cos(a) * r; z = s.kz + Math.sin(a) * r; y = (s.F ?? 0) + 2;
            } else return null;
            const d = Math.hypot(x - P.x, z - P.z);
            if (d < ZSPAWN.MIN_D || d > ZSPAWN.MAX_D) continue;
            const ix = Math.round(x), iz = Math.round(z);
            const L = t.floorBelow(ix, iz, Math.floor(y));
            if (!Number.isFinite(L) || t.ceilingAbove(ix, iz, L + 1) <= L + 3) continue; // (room to stand)
            if (t.isWaterAt?.(ix, L, iz)) continue; // (water over the floor; isWaterAt takes a world y: layer = ⌊y + 1.5⌋)
            const fy = L - 0.5;
            if (lightLevel(t.skyAt ? t.skyAt(ix, fy, iz) : 1, night) > ZSPAWN.DARK) continue; // (the lit mouth: no)
            if (!this._clear(ix, fy, iz, ps, lights)) continue;
            return { x: ix + 0.5, y: fy + ZOMBIE_GROUND_OFFSET, z: iz + 0.5 }; // (a zombie's origin: 1 m over its feet)
        }
        return null;
    }

    /** A dark spot out on the open ground at night, or null. */
    nightSpot(P, ps, lights) {
        const t = this.game.terrain.data;
        const night = this.night();
        for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2, r = rnd(...ZSPAWN.NIGHT_D);
            const ix = Math.round(P.x + Math.cos(a) * r), iz = Math.round(P.z + Math.sin(a) * r);
            if (t.isSeaColumn?.(ix, iz)) continue;
            if ((t.sites || t.castles)?.landAt?.(ix, iz)) continue; // (a castle, a village, a tower: lit and guarded)
            if (t.isIsland?.(ix, iz)) continue; // (not up on a floating island)
            const top = t.topLayer(ix, iz);
            if (t.isWaterAt?.(ix, top - 1, iz) || t.isWaterAt?.(ix, top, iz)) continue; // (a pond, a river)
            const fy = top - 0.5;
            if (lightLevel(t.skyAt ? t.skyAt(ix, fy, iz) : 1, night) > ZSPAWN.DARK) continue;
            if (!this._clear(ix, fy, iz, ps, lights)) continue;
            return { x: ix + 0.5, y: fy + ZOMBIE_GROUND_OFFSET, z: iz + 0.5 }; // (a zombie's origin: 1 m over its feet)
        }
        return null;
    }
}
