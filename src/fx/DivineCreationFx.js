/**
 * DivineCreationFx.js — how «Да пусть создастся …» looks (DivineCreation.js), the same on every computer.
 *
 * The gods read the words (`seed` — while the local Gemma writes the recipe, 4–40 s; the longer they think, the
 * grander it grows — the answer's progress `u` drives it, so a slow answer is no dead wait):
 *   - a seed of golden light over the ground, breathing, growing with the words read (its heart white-hot);
 *   - three rings of runes of light turning on the ground round it, each its own way, wider as it grows;
 *   - rays of light cracking out along the ground from the seed (eight, then sixteen), longer and longer;
 *   - a slow whirl of motes drawn in from far round and up into the seed, a pillar of light rising from it;
 *   - the words themselves: a stream of light from the caster's wand to the seed while the gods read;
 *   - now and then a flash, a pulse running out along the rings.
 * The recipe is ready (`bloom`): the seed bursts — a sphere of light, a ring sweeping the ground, a white flash.
 * A building rises (`grow`): pillars of light at its corners, blocks of its own colours flying in from all round to the
 * height it has reached, a veil of motes rising along its edges. A creature or a plant is born (`birth`): a cocoon of
 * light round it, spirals closing in, a burst as it is whole.
 *
 * Cheap: everything is in two pools made at start-up — the soft glowing points of `fx.fireworks` (no fog, one shader)
 * and the sparks; the flying blocks are HouseMagicFx's one instanced mesh (`look`). Nothing is made in a frame.
 */

import * as THREE from 'three';

const GOLD = 0xffd98a, WHITE = 0xfff6e0, VIOLET = 0xc9a8ff, SKY = 0x9fe8ff, ROSE = 0xffb8d8, AMBER = 0xffb060, GREEN = 0x8aff9a, LIME = 0xd8ff7a, EMERALD = 0x3fe08a;
/** Each kind its own light after the words are heard (the author: «анимация однотипная»). */
const KIND_PAL = { build: [GOLD, WHITE, SKY], creature: [ROSE, AMBER, VIOLET], plant: [GREEN, LIME, EMERALD] };
const PALETTE = [GOLD, WHITE, VIOLET, SKY, GOLD, ROSE];
/** The colours of the blocks flying into a building (by its material; BLOCK ids — CreationBuild's). */
export const BLOCK_COLOR = { 20: 0x8a8a8a, 21: 0xd8c08a, 22: 0x4c4c55, 23: 0xece8e0, 24: 0x6f7d5a, 25: 0x7d7c78, 26: 0xa4523c, 27: 0xb88a52, 28: 0x6b4a2a, 29: 0xa83a2c, 30: 0x3f5f9e, 31: 0x4f565e, 32: 0xc9b05a, 34: 0xe6b422, 48: 0xeee6d6, 49: 0x7c8db0, 6: 0x8b5a2b, 3: 0x8a8a8a, 7: 0x4f8a3a, 42: 0xf2f0ea };

const rnd = (a, b) => a + Math.random() * (b - a);

export class DivineCreationFx {
    constructor(game) {
        this.game = game;
        this.flashT = 0;
        this._sz = new THREE.Vector2(); // (three's getDrawingBufferSize sets and floors a real Vector2)
    }

    get pool() { return this.game.fx?.fireworks || null; }

    /** The biggest point the video card draws — asked ONCE, on the loading screen (Game.prewarm): the question waits for the card (seconds on a busy one, found in a flight profile). */
    warm() {
        if (this._maxPx != null) return;
        try { const gl = this.game.renderer.getContext(); this._maxPx = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64); } catch (e) { this._maxPx = 64; }
    }

    /** How big a metre looks now (the points are sized in metres). */
    _view() {
        const g = this.game, pool = this.pool;
        if (!pool?.view || !g.renderer || !g.camera) return;
        this.warm();
        const h = g.renderer.getDrawingBufferSize?.(this._sz)?.y || g.renderer.domElement?.height || 720;
        pool.view(h, g.camera.fov || 75, this._maxPx);
    }

    /**
     * The gods read the words: m = {x, y, z (the ground), t (s), u (0…1 read), wand: {x, y, z}|null}.
     */
    seed(m, dt) {
        const pool = this.pool, fx = this.game.fx;
        if (!pool) return;
        this._view();
        // (still being told what to make: a small calm seed, one ring, the words streaming from the wand — no more)
        if (m.listen) { this._listen(m, dt); return; }
        const t = m.t, u = Math.min(1, m.u || 0), grow = Math.min(1, 0.25 + 0.75 * Math.max(u, Math.min(1, t / 30)));
        this._kindLayer(m, dt, grow);
        const cy = m.y + 4 + 3 * grow; // the seed hangs over the ground, higher as it grows
        const R = 2.2 + 9 * grow; // the rings' radius
        const n = Math.min(3, Math.max(1, Math.round(dt * 60))); // (the same look at any frame rate)
        // the seed: a breathing core and its halo
        const beat = 0.75 + 0.25 * Math.sin(t * 3.1) * Math.sin(t * 1.3 + 1);
        pool.spawn(m.x, cy, m.z, 0, 0, 0, WHITE, (1.2 + 2.6 * grow) * beat, 0.09, { shrink: 0, fade: false });
        pool.spawn(m.x, cy, m.z, 0, 0, 0, GOLD, (3 + 6 * grow) * beat, 0.09, { shrink: 0, fade: false });
        for (let k = 0; k < 2 * n; k++) {
            const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, r = (1 + 2.5 * grow) * Math.random();
            pool.spawn(m.x + Math.cos(a) * Math.cos(e) * r, cy + Math.sin(e) * r, m.z + Math.sin(a) * Math.cos(e) * r, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, PALETTE[(Math.random() * PALETTE.length) | 0], 0.35 + Math.random() * 0.4, 0.6, { shrink: 1 });
        }
        // three rings of runes on the ground, turning each its own way (dots in arcs: the runes)
        for (let ring = 0; ring < 3; ring++) {
            const rr = R * (0.45 + ring * 0.3), sp = (ring % 2 ? -1 : 1) * (0.6 + ring * 0.25);
            for (let k = 0; k < 7 * n; k++) {
                const s = Math.floor(Math.random() * 24), a = t * sp + (s / 24) * Math.PI * 2 + (Math.random() < 0.6 ? 0 : 0.05);
                if (s % 3 === 2) continue; // (the gaps between the runes)
                pool.spawn(m.x + Math.cos(a) * rr, m.y + 0.18 + ring * 0.05, m.z + Math.sin(a) * rr, 0, 0.05, 0, ring === 1 ? VIOLET : GOLD, 0.32 + 0.1 * grow, 0.28, { shrink: 0.4 });
            }
        }
        // rays of light cracking out along the ground
        const rays = u > 0.5 ? 16 : 8, len = 3 + 22 * grow;
        for (let k = 0; k < 2 * n; k++) {
            const ray = Math.floor(Math.random() * rays), a = (ray / rays) * Math.PI * 2 + 0.2, d = Math.random() * len;
            pool.spawn(m.x + Math.cos(a) * d, m.y + 0.12, m.z + Math.sin(a) * d, 0, 0.4, 0, ray % 2 ? SKY : GOLD, 0.28, 0.5, { shrink: 0.6 });
        }
        // the whirl drawn in from far round and up into the seed; the pillar
        for (let k = 0; k < 3 * n; k++) {
            const a = Math.random() * Math.PI * 2, r = R * 1.5 + Math.random() * 10;
            const px = m.x + Math.cos(a) * r, pz = m.z + Math.sin(a) * r, py = m.y + Math.random() * 3;
            const T = 1.4 + Math.random() * 0.8, sw = 0.9;
            const vx = (m.x - px) / T - Math.sin(a) * r * sw / T, vz = (m.z - pz) / T + Math.cos(a) * r * sw / T;
            pool.spawn(px, py, pz, vx, (cy - py) / T, vz, PALETTE[k % PALETTE.length], 0.3 + Math.random() * 0.3, T, { shrink: 0.2, drag: 0.15 });
        }
        for (let k = 0; k < n; k++) pool.spawn(m.x + (Math.random() - 0.5) * 0.8, cy, m.z + (Math.random() - 0.5) * 0.8, 0, 9 + 6 * grow, 0, Math.random() < 0.5 ? WHITE : GOLD, 0.6 + grow * 0.6, 1.2 + grow, { shrink: 0.5 });
        // the words read: a stream of light from the caster's wand to the seed
        if (m.wand && t < 30) {
            const w = m.wand;
            for (let k = 0; k < n; k++) {
                const T = 0.9;
                pool.spawn(w.x + (Math.random() - 0.5) * 0.3, w.y + (Math.random() - 0.5) * 0.3, w.z + (Math.random() - 0.5) * 0.3, (m.x - w.x) / T, (cy - w.y) / T + 1.5, (m.z - w.z) / T, Math.random() < 0.5 ? WHITE : SKY, 0.22, T, { shrink: 0.3, gravity: -3.3 });
            }
        }
        // flashes, faster as the end nears; dust motes in the light (the sparks)
        this.flashT -= dt;
        if (this.flashT <= 0) {
            this.flashT = rnd(0.5, 1.1) * (1.2 - 0.6 * grow);
            fx?.lightFlash?.({ x: m.x, y: cy, z: m.z }, Math.random() < 0.5 ? GOLD : VIOLET, 2 + 3 * grow, 0.5, 30 + 40 * grow);
        }
    }

    /** While the description is being said: a small seed breathing, one turning ring, the words flowing in from the wand. */
    _listen(m, dt) {
        const pool = this.pool, t = m.t, n = Math.min(3, Math.max(1, Math.round(dt * 60)));
        const cy = m.y + 3.2, beat = 0.8 + 0.2 * Math.sin(t * 2.4);
        pool.spawn(m.x, cy, m.z, 0, 0, 0, WHITE, 0.9 * beat, 0.09, { shrink: 0, fade: false });
        pool.spawn(m.x, cy, m.z, 0, 0, 0, GOLD, 2.2 * beat, 0.09, { shrink: 0, fade: false });
        for (let k = 0; k < 3 * n; k++) { const a = t * 0.8 + Math.random() * Math.PI * 2; if (((a * 24 / (Math.PI * 2)) | 0) % 3 === 2) continue; pool.spawn(m.x + Math.cos(a) * 2.6, m.y + 0.16, m.z + Math.sin(a) * 2.6, 0, 0.04, 0, GOLD, 0.26, 0.3, { shrink: 0.4 }); }
        if (Math.random() < dt * 6) { const a = Math.random() * Math.PI * 2; pool.spawn(m.x + Math.cos(a) * 1.4, cy, m.z + Math.sin(a) * 1.4, -Math.cos(a) * 1.2, 0.2, -Math.sin(a) * 1.2, PALETTE[(Math.random() * PALETTE.length) | 0], 0.25, 1, { shrink: 0.5 }); }
        if (m.wand) for (let k = 0; k < n; k++) {
            const w = m.wand, T = 0.8;
            pool.spawn(w.x + (Math.random() - 0.5) * 0.2, w.y + (Math.random() - 0.5) * 0.2, w.z + (Math.random() - 0.5) * 0.2, (m.x - w.x) / T, (cy - w.y) / T + 1.3, (m.z - w.z) / T, Math.random() < 0.5 ? WHITE : GOLD, 0.18, T, { shrink: 0.3, gravity: -3.3 });
        }
    }

    /**
     * After the words are heard: what is being made shows in the light — a building: a golden plan drawn on the ground,
     * pillars at its corners, squares of light rising; a creature: a cocoon of warm light beating like a heart; a plant:
     * green tendrils spiralling up into the seed, leaves drifting.
     */
    _kindLayer(m, dt, grow) {
        const pool = this.pool, t = m.t, kind = m.kind || m.kindHint || 'build', P = KIND_PAL[kind] || KIND_PAL.build;
        const n = Math.min(3, Math.max(1, Math.round(dt * 60)));
        const cy = m.y + 4 + 3 * grow;
        if (kind === 'build') {
            const S = 5 + 9 * grow; // (the plan's half side)
            for (let k = 0; k < 6 * n; k++) { // its outline drawn on the ground, running
                const side = k % 4, u = ((t * 0.35 + Math.random()) % 1) * 2 - 1;
                const x = side < 2 ? u * S : (side === 2 ? -S : S), z = side < 2 ? (side === 0 ? -S : S) : u * S;
                pool.spawn(m.x + x, m.y + 0.15, m.z + z, 0, 0.05, 0, P[k % 2], 0.3, 0.35, { shrink: 0.4 });
            }
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < n; k++) pool.spawn(m.x + sx * S, m.y + Math.random() * 10 * grow, m.z + sz * S, 0, 4, 0, P[1], 0.32, 0.6, { shrink: 0.5 });
            const lvl = (t * 2.2) % (8 + 10 * grow); // (a square of light rising, again and again)
            for (let k = 0; k < 4 * n; k++) { const side = k % 4, u = Math.random() * 2 - 1, s2 = S * 0.8; pool.spawn(m.x + (side < 2 ? u * s2 : (side === 2 ? -s2 : s2)), m.y + lvl, m.z + (side < 2 ? (side === 0 ? -s2 : s2) : u * s2), 0, 0, 0, P[2], 0.24, 0.25, { shrink: 0.5 }); }
        } else if (kind === 'creature') {
            const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.15)), 8); // (a heartbeat: lub… dub)
            if (beat > 0.6 && !this._beatOn) { this._beatOn = true; for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; pool.spawn(m.x, cy, m.z, Math.cos(a) * 9, 0, Math.sin(a) * 9, P[k % 3], 0.3, 0.8, { shrink: 0.6, drag: 1.5 }); } this.game.fx?.lightFlash?.({ x: m.x, y: cy, z: m.z }, AMBER, 3 + 3 * grow, 0.3, 40); }
            if (beat < 0.2) this._beatOn = false;
            for (let k = 0; k < 5 * n; k++) { // the cocoon: an egg of motes turning round the seed
                const a = t * 1.3 + Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), rr = 2.2 + 3 * grow;
                pool.spawn(m.x + Math.cos(a) * Math.sin(e) * rr, cy + Math.cos(e) * rr * 1.35, m.z + Math.sin(a) * Math.sin(e) * rr, -Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5, P[k % 3], 0.26, 0.4, { shrink: 0.5 });
            }
        } else {
            for (let v = 0; v < 3; v++) for (let k = 0; k < 2 * n; k++) { // three tendrils winding up from the ground into the seed
                const h = Math.random(), a = v * 2.094 + h * 7 + t * 0.6, rr = (1 - h) * (3 + 5 * grow);
                pool.spawn(m.x + Math.cos(a) * rr, m.y + h * (cy - m.y), m.z + Math.sin(a) * rr, 0, 0.3, 0, P[v % 3], 0.3 + 0.2 * (1 - h), 0.5, { shrink: 0.5 });
            }
            if (Math.random() < dt * 14) { const a = Math.random() * Math.PI * 2; pool.spawn(m.x + Math.cos(a) * 2, cy + 1, m.z + Math.sin(a) * 2, Math.cos(a) * 2.5, 1.5, Math.sin(a) * 2.5, Math.random() < 0.5 ? LIME : GREEN, 0.42, 2.2, { shrink: 0.3, gravity: 1.2, drag: 0.8 }); } // (leaves drifting down)
        }
    }

    /** The recipe is ready: the seed bursts into light. */
    /**
     * The words are heard (the speaker fell quiet): the seed flares — a shock ring of light along the ground, a column
     * of sparks rising from it, a slow spiral drawn inward to the seed (the words gathered), a flash. At {x, y, z}.
     */
    heard(at) {
        const pool = this.pool, fx = this.game.fx;
        if (!pool || !at) return;
        this._view();
        const cy = at.y + 4.5;
        for (let k = 0; k < 180; k++) { // the ring along the ground
            const a = (k / 180) * Math.PI * 2;
            pool.spawn(at.x + Math.cos(a) * 1.2, at.y + 0.4, at.z + Math.sin(a) * 1.2, Math.cos(a) * 15, 0.6, Math.sin(a) * 15, k % 3 ? GOLD : WHITE, 0.45, 1.3, { shrink: 0.6, drag: 1.4 });
        }
        for (let k = 0; k < 120; k++) { // the column of sparks
            const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
            pool.spawn(at.x + Math.cos(a) * r, at.y + 0.5 + Math.random() * 2, at.z + Math.sin(a) * r, Math.cos(a) * 0.6, 9 + Math.random() * 12, Math.sin(a) * 0.6, PALETTE[k % PALETTE.length], 0.4 + Math.random() * 0.4, 1.4 + Math.random() * 0.8, { shrink: 0.5, drag: 0.8 });
        }
        for (let k = 0; k < 90; k++) { // the words gathered: a spiral drawn inward to the seed
            const a = k * 0.42, r = 9 - (k / 90) * 7;
            pool.spawn(at.x + Math.cos(a) * r, cy - 2 + (k / 90) * 3, at.z + Math.sin(a) * r, -Math.cos(a) * r * 0.9 - Math.sin(a) * 4, 0.5, -Math.sin(a) * r * 0.9 + Math.cos(a) * 4, k % 2 ? GOLD : 0xfff6d8, 0.5, 1.1, { shrink: 0.4, drag: 0.6 });
        }
        fx?.lightFlash?.({ x: at.x, y: cy, z: at.z }, 0xfff2c0, 7, 0.9, 110);
    }

    bloom(m) {
        const pool = this.pool, fx = this.game.fx;
        if (!pool) return;
        const cy = m.y + 7;
        for (let k = 0; k < 260; k++) {
            const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1) - Math.PI / 2, sp = 6 + Math.random() * 16;
            pool.spawn(m.x, cy, m.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, PALETTE[k % PALETTE.length], 0.5 + Math.random() * 0.6, 1.2 + Math.random() * 0.8, { shrink: 0.5, drag: 1.6 });
        }
        for (let k = 0; k < 140; k++) {
            const a = (k / 140) * Math.PI * 2;
            pool.spawn(m.x + Math.cos(a) * 2, m.y + 0.3, m.z + Math.sin(a) * 2, Math.cos(a) * 22, 0.4, Math.sin(a) * 22, k % 2 ? GOLD : WHITE, 0.55, 1.1, { shrink: 0.6, drag: 1.1 });
        }
        fx?.lightFlash?.({ x: m.x, y: cy, z: m.z }, 0xffffff, 9, 1.1, 140);
    }

    /**
     * A building rises: rect, G (its ground), u (0…1 built), top (its highest layer), colours of its blocks. `look` —
     * HouseMagicFx (the flying blocks).
     */
    grow(m, dt, look) {
        const pool = this.pool, fx = this.game.fx;
        if (!pool) return;
        this._view();
        const rc = m.rect, u = Math.min(1, m.u || 0), H = Math.max(6, (m.top ?? m.G + 20) - m.G);
        const h = m.G + 1 + H * Math.min(1, u * 1.15);
        const n = Math.min(3, Math.max(1, Math.round(dt * 60)));
        const W = rc.x1 - rc.x0, D = rc.z1 - rc.z0;
        // pillars of light at the corners, as high as it has grown (and higher)
        for (const [x, z] of [[rc.x0, rc.z0], [rc.x1, rc.z0], [rc.x0, rc.z1], [rc.x1, rc.z1]]) {
            for (let k = 0; k < n; k++) pool.spawn(x, m.G + 1 + Math.random() * (h - m.G + 6), z, 0, 3, 0, Math.random() < 0.5 ? GOLD : WHITE, 0.5, 0.5, { shrink: 0.6 });
        }
        // a veil of motes rising along the edges
        for (let k = 0; k < 4 * n; k++) {
            const side = (Math.random() * 4) | 0, f = Math.random();
            const x = side < 2 ? rc.x0 + f * W : side === 2 ? rc.x0 : rc.x1, z = side >= 2 ? rc.z0 + f * D : side === 0 ? rc.z0 : rc.z1;
            pool.spawn(x, m.G + 1 + Math.random() * 2, z, 0, 2.5 + Math.random() * 3, 0, PALETTE[k % PALETTE.length], 0.3, 1.4, { shrink: 0.5 });
        }
        // the blocks flying in from all round to the height reached now
        m.launchT = (m.launchT || 0) - dt;
        if (look && m.launchT <= 0 && u < 0.99) {
            m.launchT = 0.04;
            const a = Math.random() * Math.PI * 2, r = Math.max(W, D) / 2 + 8 + Math.random() * 18;
            const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
            const from = { x: cx + Math.cos(a) * r, y: m.G + 0.5 + Math.random() * 3, z: cz + Math.sin(a) * r };
            const to = { x: rc.x0 + Math.random() * W, y: h - Math.random() * 2, z: rc.z0 + Math.random() * D };
            const cols = m.colors?.length ? m.colors : [0x8a8a8a];
            const s = 0.8 + Math.random() * 0.4;
            look._launch(vec(from), vec(to), [s, s, s], cols[(Math.random() * cols.length) | 0], 1 + Math.random() * 0.9);
            pool.spawn(from.x, from.y, from.z, 0, 2, 0, GOLD, 0.6, 0.4, { shrink: 1 });
        }
        look?._step?.(dt, fx?.glow);
        this.flashT -= dt;
        if (this.flashT <= 0) {
            this.flashT = rnd(0.25, 0.55);
            fx?.lightFlash?.({ x: rc.x0 + Math.random() * W, y: h, z: rc.z0 + Math.random() * D }, Math.random() < 0.5 ? GOLD : VIOLET, 3, 0.35, 60);
        }
    }

    /** It is whole: a ring sweeping out along the ground and a burst over it. */
    whole(rect, G, top) {
        const pool = this.pool, fx = this.game.fx;
        if (!pool) return;
        const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2, R = Math.max(rect.x1 - rect.x0, rect.z1 - rect.z0) / 2;
        for (let k = 0; k < 200; k++) {
            const a = (k / 200) * Math.PI * 2;
            pool.spawn(cx + Math.cos(a) * R, G + 1, cz + Math.sin(a) * R, Math.cos(a) * 14, 1, Math.sin(a) * 14, k % 3 ? GOLD : WHITE, 0.6, 1.3, { shrink: 0.6, drag: 0.8 });
        }
        for (let k = 0; k < 160; k++) pool.spawn(cx + (Math.random() - 0.5) * R * 1.6, top + Math.random() * 6, cz + (Math.random() - 0.5) * R * 1.6, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, PALETTE[k % PALETTE.length], 0.5, 1.8, { shrink: 0.4, gravity: -1 });
        fx?.lightFlash?.({ x: cx, y: top, z: cz }, 0xffffff, 10, 1.2, 160);
    }

    /** A creature / a plant being born at p (y the ground), k 0…1 of its birth, size its height. */
    birth(p, k, size, dt, color = GOLD) {
        const pool = this.pool;
        if (!pool) return;
        this._view();
        const n = Math.min(3, Math.max(1, Math.round(dt * 60)));
        const r = Math.max(0.8, size * 0.7) * (1.2 - 0.6 * k), cy = p.y + size * 0.5;
        // the cocoon: points on a shell round it, shrinking as it comes whole
        for (let j = 0; j < 6 * n; j++) {
            const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1) - Math.PI / 2;
            pool.spawn(p.x + Math.cos(a) * Math.cos(e) * r, cy + Math.sin(e) * r * 1.1, p.z + Math.sin(a) * Math.cos(e) * r, 0, 0.2, 0, j % 2 ? color : WHITE, 0.25 + 0.1 * size, 0.25, { shrink: 1 });
        }
        // two spirals closing in
        for (let j = 0; j < 2 * n; j++) {
            const a = performanceNow() * 0.004 + j * Math.PI, rr = r * 1.8;
            pool.spawn(p.x + Math.cos(a) * rr, p.y + Math.random() * size * 1.2, p.z + Math.sin(a) * rr, -Math.cos(a) * rr, 0.5, -Math.sin(a) * rr, j % 2 ? VIOLET : GOLD, 0.3, 0.9, { shrink: 0.8 });
        }
    }

    /** Whole: a burst of light round the newborn. */
    born(p, size, color = GOLD) {
        const pool = this.pool;
        if (!pool) return;
        const cy = p.y + size * 0.5;
        for (let j = 0; j < 90; j++) {
            const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1) - Math.PI / 2, sp = 3 + Math.random() * 6;
            pool.spawn(p.x, cy, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, j % 3 ? color : WHITE, 0.35, 1, { shrink: 0.7, drag: 2 });
        }
        this.game.fx?.lightFlash?.({ x: p.x, y: cy, z: p.z }, color, 4, 0.6, 40);
    }

    /** The gods turned away (the answer never came, or the place would not do): the seed fades, falling. */
    fade(m) {
        const pool = this.pool;
        if (!pool) return;
        const cy = m.y + 5;
        for (let j = 0; j < 120; j++) pool.spawn(m.x + (Math.random() - 0.5) * 4, cy + (Math.random() - 0.5) * 4, m.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2, j % 2 ? 0x8a7a9a : GOLD, 0.3, 1.6, { shrink: 0.5 });
    }
}

const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
const performanceNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
