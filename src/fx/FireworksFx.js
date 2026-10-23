/**
 * FireworksFx.js — the look and the sound of «Fireworks» salvos (the rules are Fireworks.js; the shapes — FireworkShapes.js).
 *
 * Layers of one rocket:
 *   rising   a white-hot head, a golden trail of glints with a little curl, a thin whistle
 *   burst    a flash of the colour (a ball of light, a white core), the sparks (round, additive, slowed by the
 *            air, falling), the trails of the comets (chrysanthemum, willow, crossette), the twinkling of the glitter,
 *            a faint haze left to one side, one shared light flash on the ground and the clouds, the boom
 *            (late by the distance: the sound is slower than the light) and the crackle of the falling sparks
 *   far      a burst up to ~1.1 km away is seen: the sparks grow with distance and lose their detail (lod)
 * Everything is in the `fx.fireworks` pool (made at start-up, no fog, one shader) — nothing is created in a frame;
 * the sparks of a burst are written into typed arrays. All chance comes from the rocket's seed, so every computer
 * sees the same burst (the glints of the trails and the haze are only decoration).
 * No air (space, a planet without air): the sparks fly straight and do not slow, no haze, no whistle, no boom.
 */

import * as THREE from 'three';
import { burstShape, crossSparks, rng, lod, farSize, planSalvo, KINDS, SHOW } from './FireworkShapes.js';

export const FX = {
    SEE_R: 1100, // m: farther than this nothing is drawn or heard (the camera sees 1000 m)
    SOUND_V: 340, // m/s: how fast the boom comes
    SOUND_MAX_LAG: 3, // s: the game's sound is never later than this
    BOOM_R: 1000, // m: the boom is still heard (faintly) this far
    HEAR_REF: 70, // m: the boom's reference distance (loud to here, then falls off)
    SHELLS: 24, // rockets in the air at once
    COMETS: 900, // sparks that leave trails / twinkle / split at once
    POOL_SAFE: 0.82, // of the pool: over this, new bursts are thinned
    LIGHT: 10, // intensity of the shared flash at its brightest
    SPARK: 1.7, // a spark's size over the kind's (KINDS.size): a soft glow needs more than a hard cube
};

const _o = new THREE.Vector3(), _a = new THREE.Vector3(), _sz = new THREE.Vector2();
const mix = (hex, to, t) => {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255, R = (to >> 16) & 255, G = (to >> 8) & 255, B = to & 255;
    return (Math.round(r + (R - r) * t) << 16) | (Math.round(g + (G - g) * t) << 8) | Math.round(b + (B - b) * t);
};
const scaleColor = (hex, k) => {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
    return (r << 16) | (g << 8) | b;
};

export class FireworksFx {
    constructor(game) {
        this.game = game;
        this.shells = Array.from({ length: FX.SHELLS }, () => ({ on: false }));
        // the comets (sparks that need a path of their own): flat arrays, no objects
        const n = FX.COMETS;
        this.c = {
            n: 0, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
            drag: new Float32Array(n), grav: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), every: new Float32Array(n), acc: new Float32Array(n),
            tlife: new Float32Array(n), size: new Float32Array(n), col: new Int32Array(n), mode: new Uint8Array(n), // 0 trail · 1 twinkle · 2 splits into a cross
            lodSize: new Float32Array(n), dist: new Float32Array(n),
        };
        // sounds waiting for the boom to arrive
        this.sounds = Array.from({ length: 32 }, () => ({ on: false, t: 0, key: '', x: 0, y: 0, z: 0, vol: 1, ref: 8, rate: 1 }));
        this.salvos = 0; this.bursts = 0; // (counts for the tests and the journal)
        this.vacuum = false; // (the viewer's air: set by Fireworks.update)
    }

    /** The pool the sparks live in (null in the tests, which have no graphics). */
    get pool() { return this.game.fx?.fireworks || null; }

    /** 0 (day) … 1 (night): the sky's darkness, for the brightness of the light. */
    get night() {
        const g = this.game;
        const n = g.zombieSpawn?.night?.() ?? g.world?.nightAmount ?? 0;
        return Math.max(0, Math.min(1, n));
    }

    /** Distance from the viewer (the camera, else the hero) to a point. */
    _dist(x, y, z) {
        const p = this.game.camera?.position || this.game.character?.group?.position;
        return p ? Math.hypot(p.x - x, p.y - y, p.z - z) : 0;
    }

    /**
     * A salvo from `origin` (the wand's tip), the fan's middle `dir` (up-ish), `seed` the salvo's: every rocket
     * of the plan leaves after its own delay. `by`: the caster's id.
     */
    launchSalvo(origin, dir, seed, by = null, vacuum = false) {
        const plan = planSalvo(seed);
        let n = 0;
        for (let i = 0; i < plan.rockets.length; i++) {
            const R = plan.rockets[i], s = this._free();
            if (!s) break;
            // the rocket's axis: straight up, fanned out by yaw / tilt, a little leaning with the wand
            const lean = 0.25;
            let dx = dir.x * lean + Math.sin(R.tilt) * Math.cos(R.yaw), dy = 1, dz = dir.z * lean + Math.sin(R.tilt) * Math.sin(R.yaw);
            const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
            s.on = true; s.t = -R.delay; s.R = R; s.by = by; s.vacuum = vacuum;
            s.ox = origin.x; s.oy = origin.y; s.oz = origin.z;
            s.tx = origin.x + dx * R.height; s.ty = origin.y + dy * R.height; s.tz = origin.z + dz * R.height;
            // two axes round the path for the curl (horizontal ⟂ to it, and the third)
            const q = Math.hypot(dz, dx) || 1;
            s.p1x = dz / q; s.p1y = 0; s.p1z = -dx / q; // (horizontal, ⟂ to the path)
            s.p2x = (dy * s.p1z - dz * s.p1y); s.p2y = (dz * s.p1x - dx * s.p1z); s.p2z = (dx * s.p1y - dy * s.p1x);
            s.acc = 0; s.whistled = false;
            n++;
        }
        this.salvos++;
        return n;
    }

    _free() { for (const s of this.shells) if (!s.on) return s; return null; }
    _freeSound() { for (const s of this.sounds) if (!s.on) return s; return null; }

    update(dt) {
        dt = Math.min(dt, 0.1);
        this._view();
        for (const s of this.shells) if (s.on) this._rocket(s, dt);
        if (this.c.n) this._comets(dt);
        this._soundQueue(dt);
    }

    /** Tell the pool how big a metre looks now (the picture's height, the field of view, the card's largest point). */
    _view() {
        const g = this.game, pool = this.pool;
        if (!pool?.view || !g.renderer || !g.camera) return;
        if (this._maxPx == null) {
            try { const gl = g.renderer.getContext(); this._maxPx = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64); } catch (e) { this._maxPx = 64; }
        }
        const h = g.renderer.getDrawingBufferSize?.(_sz)?.y || g.renderer.domElement?.height || 720;
        pool.view(h, g.camera.fov || 75, this._maxPx);
        if (pool.uniforms?.uHot) pool.uniforms.uHot.value = 0.62 - 0.36 * (1 - this.night); // (by day the cores are less white: the colours must survive a bright sky)
    }

    // ------------------------------------------------------------ a rocket going up
    _rocket(s, dt) {
        const pool = this.pool;
        const wasWaiting = s.t < 0;
        s.t += dt;
        if (s.t < 0) return;
        const R = s.R;
        if (wasWaiting && !s.whistled) {
            s.whistled = true;
            // the whistle at the wand (the others hear it from where they are); none without air
            if (!s.vacuum) this._sound('fxFwLaunch', s.ox, s.oy, s.oz, 0.55, 22, 1 + (R.seed % 7) * 0.02, true);
        }
        const u = Math.min(1, s.t / R.rise), e = 1 - (1 - u) * (1 - u); // (quick off the wand, slowing near the top)
        const curl = 0.35 * (1 - u) * Math.min(1, u * 8), ph = s.t * 26;
        const cx = Math.cos(ph) * curl, cy = Math.sin(ph) * curl;
        const x = s.ox + (s.tx - s.ox) * e + s.p1x * cx + s.p2x * cy;
        const y = s.oy + (s.ty - s.oy) * e + s.p1y * cx + s.p2y * cy;
        const z = s.oz + (s.tz - s.oz) * e + s.p1z * cx + s.p2z * cy;
        s.x = x; s.y = y; s.z = z;
        if (pool) {
            const dist = this._dist(x, y, z);
            if (dist < FX.SEE_R) {
                const big = farSize(dist);
                // the head: white-hot, gone in a blink (drawn again each frame)
                pool.spawn(x, y, z, 0, 0, 0, 0xfff3c8, 1.1 * big, Math.max(0.06, dt * 1.6), { shrink: 0, fade: false });
                // the golden trail: glints that fall behind and cool from white-gold to red-gold
                s.acc += dt;
                while (s.acc >= 0.016) {
                    s.acc -= 0.016;
                    const k = Math.random();
                    pool.spawn(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3,
                        (Math.random() - 0.5) * 1.4, -1.5 - Math.random() * 1.5, (Math.random() - 0.5) * 1.4,
                        k < 0.5 ? 0xffc040 : k < 0.85 ? 0xff9a28 : 0xfff0b0, (0.35 + Math.random() * 0.3) * big, 0.45 + Math.random() * 0.45, { shrink: 0.9 });
                }
            }
        }
        if (u >= 1) { s.on = false; this._burst(s); }
    }

    // ------------------------------------------------------------ the burst
    _burst(s) {
        const pool = this.pool, R = s.R, K = KINDS[R.kind];
        const x = s.x, y = s.y, z = s.z;
        const dist = this._dist(x, y, z);
        this.bursts++;
        this.lastBurst = { kind: R.kind, count: R.count, radius: R.radius, at: [x, y, z], seed: R.seed };
        if (dist > FX.SEE_R) return;
        const night = this.night, day = 1 - night;
        const L = lod(dist), big = farSize(dist) * (1 + 0.35 * day);
        // a thinned burst when the pool is nearly full (many salvos at once)
        const roomy = pool ? pool.active < pool.capacity * FX.POOL_SAFE : true;
        const count = Math.max(40, Math.round(R.count * L.parts * (roomy ? 1 : 0.5)));
        const r = rng(R.seed);
        // star and heart face the caster
        const nrm = [s.ox - x, 0, s.oz - z];
        const shape = burstShape(R.kind, r, count, R.colors, R.kind === 'star' || R.kind === 'heart' ? { normal: nrm } : {});
        const vac = s.vacuum;
        const life0 = K.life;
        // the drag: none without air (the sparks fly straight and go out)
        const k = vac ? 0 : K.drag, grav = vac ? 0 : K.grav;
        if (pool) {
            // the flash: a ball of the colour and a white core (brighter by day, when the sky is bright)
            // (several soft balls at once rather than one huge point: a point is never drawn bigger than the card allows)
            const fr = rng(R.seed ^ 0x5bd1e995);
            for (let i = 0; i < 9; i++) {
                const a = fr() * Math.PI * 2, b = (fr() - 0.5) * Math.PI, rr = fr() * R.radius * 0.28;
                pool.spawn(x + Math.cos(a) * Math.cos(b) * rr, y + Math.sin(b) * rr, z + Math.sin(a) * Math.cos(b) * rr, 0, 0, 0,
                    mix(R.colors[0], 0xffffff, 0.35), R.radius * 0.55 * big, 0.38, { shrink: -1.2 });
            }
            pool.spawn(x, y, z, 0, 0, 0, 0xffffff, R.radius * 0.5 * big, 0.22, { shrink: -1.5 });
            if (day > 0.3) pool.spawn(x, y, z, 0, 0, 0, 0xffffff, R.radius * 0.8 * big, 0.3, { shrink: -0.8 }); // (by day: brighter still, or it is lost in the sky)
        }
        for (const p of shape.parts) {
            const life = life0 * (0.85 + r() * 0.3), o = p.o;
            // v₀ so that the spark ends at `o·R` (the drag slows it): see FireworkShapes
            const m = vac ? R.radius / life : (R.radius * k) / (1 - Math.exp(-k * life));
            const vx = o[0] * m, vy = o[1] * m, vz = o[2] * m;
            const white = r() * 0.25; // (a few sparks whiter, so the colour is alive)
            const col = mix(p.c, 0xffffff, p.c === 0xfff4d0 ? 0 : white + 0.12 * day);
            const size = K.size * FX.SPARK * (0.8 + r() * 0.5) * big;
            if (p.glitter) {
                this._comet(x, y, z, vx, vy, vz, k, grav, life, 0, 0, size, col, 1, big, dist);
                continue;
            }
            if (pool) pool.spawn(x, y, z, vx, vy, vz, col, size, life, { drag: k, gravity: grav, shrink: 0.35 / Math.max(0.5, life) });
            if (p.comet && K.trail && (L.trails || p.cross)) this._comet(x, y, z, vx, vy, vz, k, grav, life, K.trail, K.trailLife, size * 0.55, col, p.cross ? 2 : 0, big, dist, p.o);
        }
        // the haze: dim wisps left to one side; a ball of light on the ground and the clouds
        if (pool && !vac) {
            const wx = 1.2, wz = 0.6;
            for (let i = 0; i < 4; i++) {
                const a = r() * Math.PI * 2, rr = r() * R.radius * 0.3;
                pool.spawn(x + Math.cos(a) * rr, y + (r() - 0.5) * R.radius * 0.3, z + Math.sin(a) * rr, wx + (r() - 0.5), -0.3, wz + (r() - 0.5),
                    scaleColor(mix(R.colors[0], 0x445066, 0.7), 0.16 + 0.22 * night), (6 + r() * 5) * big, 3.2 + r() * 1.2, { shrink: -0.18 });
            }
        }
        if (dist < 520 && this.game.fx?.lightFlash) {
            _o.set(x, y, z);
            this.game.fx.lightFlash(_o, mix(R.colors[0], 0xffffff, 0.25), FX.LIGHT * (0.4 + 0.6 * night), 0.45, 170 + R.radius * 4);
        }
        // sounds: the boom comes later by the distance; the crackle of the sparks a moment after it
        if (!vac && dist < FX.BOOM_R) {
            const lag = Math.min(FX.SOUND_MAX_LAG, dist / FX.SOUND_V);
            this._sound('fxFwBoom', x, y, z, 1.1, FX.HEAR_REF, 0.92 + (R.seed % 9) * 0.02, false, lag);
            if (K.trail || K.glitter) this._sound('fxFwCrackle', x, y, z, 0.6, 40, 0.95 + (R.seed % 5) * 0.03, false, lag + 0.35);
        }
        this.game.fireworks?.onBurst?.(x, y, z, R, s.by);
    }

    // ------------------------------------------------------------ comets: trails, twinkling, crosses
    _comet(x, y, z, vx, vy, vz, drag, grav, life, every, tlife, size, col, mode, big, dist, o = null) {
        const C = this.c, i = C.n;
        if (i >= FX.COMETS) return;
        C.n++;
        C.x[i] = x; C.y[i] = y; C.z[i] = z; C.vx[i] = vx; C.vy[i] = vy; C.vz[i] = vz; C.drag[i] = drag; C.grav[i] = grav;
        C.age[i] = 0; C.life[i] = mode === 2 ? life : life; C.every[i] = every; C.acc[i] = 0; C.tlife[i] = tlife; C.size[i] = size; C.col[i] = col; C.mode[i] = mode;
        C.lodSize[i] = big; C.dist[i] = dist;
    }

    _comets(dt) {
        const C = this.c, pool = this.pool;
        for (let i = C.n - 1; i >= 0; i--) {
            C.age[i] += dt;
            // the same motion as the pool gives the spark itself
            C.vy[i] += C.grav[i] * dt;
            if (C.drag[i] > 0) { const k = Math.exp(-C.drag[i] * dt); C.vx[i] *= k; C.vy[i] *= k; C.vz[i] *= k; }
            C.x[i] += C.vx[i] * dt; C.y[i] += C.vy[i] * dt; C.z[i] += C.vz[i] * dt;
            const mode = C.mode[i];
            if (pool) {
                if (mode === 1) {
                    // twinkle: bright pops here and there (a short flare), more as it ages
                    if (Math.random() < dt * 13 && pool.active < pool.capacity * 0.92) pool.spawn(C.x[i], C.y[i], C.z[i], 0, 0, 0, C.col[i], C.size[i] * (1 + Math.random()), 0.1 + Math.random() * 0.1, { shrink: 0 });
                } else if (C.every[i] > 0 && pool.active < pool.capacity * 0.85) {
                    C.acc[i] += dt;
                    if (C.acc[i] >= C.every[i]) {
                        C.acc[i] -= C.every[i];
                        const fade = Math.max(0.2, 1 - C.age[i] / C.life[i]);
                        pool.spawn(C.x[i], C.y[i], C.z[i], (Math.random() - 0.5) * 0.8, -0.4, (Math.random() - 0.5) * 0.8, scaleColor(C.col[i], 0.55 + 0.45 * fade), C.size[i] * (0.7 + 0.5 * fade), C.tlife[i], { shrink: 0.8 });
                    }
                }
            }
            if (C.age[i] >= C.life[i]) {
                if (mode === 2 && pool) this._split(i);
                this._drop(i);
            }
        }
    }

    /** A crossette's comet breaks into four sparks that fly out in a cross. */
    _split(i) {
        const C = this.c, pool = this.pool, vac = this.vacuum;
        const r = rng((C.x[i] * 73 + C.z[i] * 31) | 0);
        const dir = [C.vx[i], C.vy[i], C.vz[i]];
        const spreadR = 6, k = vac ? 0 : 2.0, life = 1.5;
        const v = vac ? spreadR / life : (spreadR * k) / (1 - Math.exp(-k * life));
        for (const o of crossSparks(dir, r)) {
            pool.spawn(C.x[i], C.y[i], C.z[i], o[0] * v * 2, o[1] * v * 2, o[2] * v * 2, C.col[i], C.size[i] * 1.2, life, { drag: k, gravity: vac ? 0 : -4, shrink: 0.3 });
            this._comet(C.x[i], C.y[i], C.z[i], o[0] * v * 2, o[1] * v * 2, o[2] * v * 2, k, vac ? 0 : -4, life, 0.06, 0.4, C.size[i] * 0.7, C.col[i], 0, C.lodSize[i], C.dist[i]);
        }
        pool.spawn(C.x[i], C.y[i], C.z[i], 0, 0, 0, 0xffffff, 2.5 * C.lodSize[i], 0.12, { shrink: 0 }); // (the little pop)
    }

    _drop(i) {
        const C = this.c, last = --C.n;
        if (i === last) return;
        for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'drag', 'grav', 'age', 'life', 'every', 'acc', 'tlife', 'size', 'col', 'mode', 'lodSize', 'dist']) C[key][i] = C[key][last];
    }

    // ------------------------------------------------------------ sounds
    _sound(key, x, y, z, vol, ref, rate, now = false, lag = 0) {
        if (now && lag <= 0) { this._play(key, x, y, z, vol, ref, rate); return; }
        const q = this._freeSound();
        if (!q) return;
        q.on = true; q.t = lag; q.key = key; q.x = x; q.y = y; q.z = z; q.vol = vol; q.ref = ref; q.rate = rate;
    }

    _soundQueue(dt) {
        for (const q of this.sounds) {
            if (!q.on) continue;
            q.t -= dt;
            if (q.t <= 0) { q.on = false; this._play(q.key, q.x, q.y, q.z, q.vol, q.ref, q.rate); }
        }
    }

    _play(key, x, y, z, vol, ref, rate) {
        const snd = this.game.sound;
        if (!snd?.playSpellFxAt) return;
        const d = this._dist(x, y, z);
        if (d > FX.BOOM_R) return;
        _a.set(x, y, z);
        snd.playSpellFxAt(key, _a, vol, rate, ref);
    }

    /** Everything off (a new world, a test). */
    clear() {
        for (const s of this.shells) s.on = false;
        for (const q of this.sounds) q.on = false;
        this.c.n = 0;
    }
}

export { SHOW };
