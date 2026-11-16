/**
 * ElementAura.js — the element round a mage, as THINGS you can see (the author 15.11, after testing: «у мага воздуха нету вокруг… эффекта, что у него воздух вокруг… то же самое нет у огня…
 * у мага воды тоже нет вокруг, воды»). The particle swirl (ElementalSwirl.js) is a faint haze that vanishes against a bright day; this is solid and lit:
 *
 *   air    a ring of LEAVES and scraps of paper carried round him on the wind, each tumbling on its own, rising and falling in a lazy helix — and a ground ring of dust
 *   fire   TONGUES of flame (cones, additive, flickering) circling at his waist and shoulders, their tips leading the turn
 *   water  DROPS and short strands of water (glossy, translucent) circling in tilted rings like an orrery
 *   earth  PEBBLES and chips of stone hanging and turning slowly (the earth mage keeps his bigger stones in his own system)
 *
 * Who: every elemental mage (NPC) near the hero, and the HERO himself when he is a mage of an element (HeroElement) — always, a calm ring; it grows richer (more, faster, wider)
 * when he works his element (a vortex, a swing, a throw). Four InstancedMeshes in all (one draw an element), one material each, built once and prewarmed (`sampleModels`); nothing
 * is made per frame. Other players' heroes get theirs from the same flag when it is sent (a later step).
 *
 * «А если»: the mage dies / hides / is far (not drawn: > NEAR m); the hero is in a cave / on a ship / flying (the ring just follows his body); the game is paused (no time passes:
 * the ring stops); a hundred mages (the counts are capped per mesh: the nearest first); the mage is invisible (nothing drawn — the aura would give him away).
 */
import * as THREE from 'three';
import { FX } from './WizardFx.js';

const NEAR = 55;
const CAP = 220; // instances a mesh
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

/** How many things, where and how fast, per element (calm → busy by `k` 0…1). */
/** The colour buckets of each kind (one InstancedMesh and one plain material each: per-instance colours read black on this renderer, so the variety is made of a few meshes). */
const BUCKETS = { leaf: [0xd9cfae, 0xb59a5a, 0x8a6a3a, 0x7d9a45], flame: [0xff4a00, 0xffc23a], drop: [0x7ccfff, 0xd8f4ff], pebble: [0x7d6a55, 0x5a4a3c], streak: [0xdbeeff, 0xffffff] };
const KIND = {
    air: { mesh: 'leaf', n: [5, 12], r: [1.4, 3.2], h: [0.3, 4.4], spin: 2.6, bob: 0.5, size: [0.2, 0.4], cols: [0x7fae3a, 0x9bc255, 0xc9a35a, 0x8a6a3a, 0xf1f6ff, 0xdbe7d0] }, // (a little dry debris on the wind; the wind itself is the streaks — _air)
    fire: { mesh: 'flame', n: [8, 15], r: [1.0, 1.8], h: [0.4, 3.3], spin: 2.2, bob: 0.35, size: [0.9, 1.6], cols: [0xff7a1a, 0xff4a00, 0xffb030, 0xffd86a] },
    water: { mesh: 'drop', n: [12, 22], r: [1.0, 2.2], h: [0.6, 3.2], spin: 2.8, bob: 0.3, size: [0.6, 1.1], cols: [0x7ccfff, 0x9fe0ff, 0xd8f4ff, 0x56b4f0] },
    earth: { mesh: 'pebble', n: [4, 8], r: [1.2, 2.0], h: [0.6, 3.0], spin: 1.1, bob: 0.2, size: [0.3, 0.6], cols: [0x7d6a55, 0x6b5440, 0x8a7a64, 0x5a4a3c] },
};

/** A strip of wind: an arc of a ring (unit radius, ~125°) as a thin band that swells in the middle and fades to nothing at both ends (vertex colours: additive black = clear). */
function streakGeometry() {
    const N = 16, span = 2.2, pos = [], col = [], idx = [];
    for (let i = 0; i <= N; i++) {
        const u = i / N, a = (u - 0.5) * span, w = Math.sin(u * Math.PI), wy = 0.5 * Math.pow(w, 0.8), c = Math.pow(w, 1.2);
        for (const sgn of [-1, 1]) { pos.push(Math.sin(a), sgn * wy, Math.cos(a)); col.push(c, c, c); }
        if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
}

let SHARED = null;
function parts() {
    if (SHARED) return SHARED;
    const leaf = new THREE.PlaneGeometry(0.55, 0.34, 2, 1); // (a little crooked: the middle vertices lifted — a curled leaf)
    { const P = leaf.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, (1 - Math.abs(P.getX(i)) / 0.275) * 0.07 * (P.getX(i) === 0 ? 1 : 0.2)); P.needsUpdate = true; leaf.computeVertexNormals(); }
    const geo = {
        leaf,
        flame: new THREE.LatheGeometry([[0.0, 0.0], [0.17, 0.08], [0.24, 0.26], [0.21, 0.5], [0.12, 0.74], [0.05, 0.92], [0.0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y)), 10), // (a teardrop of flame: round at the foot, a curling tip; tip up +Y)
        drop: new THREE.SphereGeometry(0.5, 10, 8).scale(0.6, 1.25, 0.6),
        pebble: new THREE.DodecahedronGeometry(0.5, 0),
        streak: streakGeometry(),
    };
    const mk = (kind, hex) => {
        const m = kind === 'streak' ? new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true })
            : kind === 'flame' ? new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
            : kind === 'drop' ? new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.82 })
            : new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
        m.userData.shared = true; return m;
    };
    const mats = {};
    for (const k of Object.keys(BUCKETS)) mats[k] = BUCKETS[k].map((h) => mk(k, h));
    return (SHARED = { geo, mats });
}

export class ElementAura {
    constructor(game) {
        this.game = game; this.t = 0; this.meshes = []; this.index = {}; // (kind → [mesh per colour bucket])
        const S = parts();
        for (const k of Object.keys(BUCKETS)) {
            this.index[k] = [];
            for (let b = 0; b < BUCKETS[k].length; b++) {
                const im = new THREE.InstancedMesh(S.geo[k], S.mats[k][b], CAP);
                im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = false;
                game.scene.add(im); this.meshes.push(im); this.index[k].push({ im, n: 0 });
            }
        }
        this.subjects = [];
    }
    get cnt() { const o = {}; for (const k of Object.keys(this.index)) o[k] = this.index[k].reduce((a, e) => a + e.n, 0); return o; }
    sampleModels() { const S = parts(); const out = []; for (const k of Object.keys(S.geo)) for (const m of S.mats[k]) { const x = new THREE.Mesh(S.geo[k], m); x.userData.shared = true; out.push(x); } return out; }

    /** The subjects this frame: elemental mages near me, and me. → [{id, element, x, y, z, k (busy 0…1), seed}] */
    _gather(out) {
        out.length = 0;
        const g = this.game, me = g.character?.group?.position, L = g.castleLife;
        if (L && me) {
            for (const v of L.byId.values()) {
                if (!v.element || v.dead || !v.group?.visible || v.invisible) continue;
                if (!v.foe || v.elemental?.phase === 'rest') continue; // (the author 16.11: the effects are costly — only while the mage works his magic, in a fight; never while he stands)
                if (Math.hypot(v.x - me.x, v.z - me.z) > NEAR) continue;
                const busy = (v.fx & FX.SWIRL ? 0.7 : 0.4) + (v.mode === 'airSpin' || v.mode === 'fireVault' || v.mode === 'waterPush' ? 0.3 : 0);
                out.push({ id: v.id, element: v.element, x: v.x, y: v.y, z: v.z, k: Math.min(1, busy), seed: (v.entry?.seed | 0) || hash(v.id) });
            }
        }
        const el = g.heroElement?.id;
        if (el && me && !g.isDeadLocal && !g.combat?.dead && !g.invisibility?.on) {
            const working = !!(g.vortex?.state || g.hellfire?.state || g.airVortex?.on || g.groundVortex?.busy || g.heroShards?.on);
            if (working) out.push({ id: 'me', element: el, x: me.x, y: me.y - 2.0, z: me.z, k: 1, seed: 7, me: true }); // (only while he works his element, like the vortex itself)
        }
        return out;
    }

    update(dt) {
        const g = this.game;
        if (!g.scene) return;
        this.t += dt; this._dt = dt; this._rings = 0; this._wr = 0;
        const subs = this._gather(this.subjects);
        for (const k of Object.keys(this.index)) for (const e of this.index[k]) e.n = 0;
        for (const s of subs) this._draw(s);
        for (const k of Object.keys(this.index)) for (const e of this.index[k]) { e.im.count = e.n; e.im.instanceMatrix.needsUpdate = true; }
    }

    /** The air mage's wind: thin bands going round him at many heights and speeds, each tilted a little, and a bit of dry debris carried by it. */
    _air(s) {
        const bs = this.index.streak, N = Math.round(7 + 8 * s.k);
        for (let i = 0; i < N; i++) {
            const bk = bs[i & 1]; if (bk.n >= CAP) continue;
            const f = (i * 0.6180339 + (s.seed % 97) / 97) % 1, f2 = (i * 0.7548776 + (s.seed % 53) / 53) % 1;
            const sp = (1.6 + 2.6 * f) * (1 + 0.7 * s.k) * (i % 3 === 2 ? -0.7 : 1);
            const a = this.t * sp + i * 2.1;
            const h = 0.35 + f2 * 3.5 + Math.sin(this.t * 0.9 + i) * 0.25;
            const r = 1.1 + f * 1.4 + Math.sin(this.t * 0.7 + i * 1.3) * 0.15;
            const grow = Math.min(1, this.t * 1.5 - i * 0.05);
            _e.set(0.18 * Math.sin(this.t * 0.8 + i), a, 0.22 * Math.cos(this.t * 0.6 + i * 1.7)); _q.setFromEuler(_e);
            const wd = (0.1 + 0.28 * f2) * Math.max(0.01, grow);
            _m.compose(_p.set(s.x, s.y + h, s.z), _q, _s.set(r, wd, r));
            bk.im.setMatrixAt(bk.n++, _m);
        }
        this._leaves(s, KIND.air);
    }

    /** The calm fire round a fire mage: the same ring of flame with serpents as «Let the Hellfire Come» (Hellfire._auraRing) — small, steady, no damage. */
    _fire(s) {
        const hf = this.game.hellfire;
        if (!hf?._auraRing || (s.me && hf.state)) return; // (my own real ring is burning: no second one)
        if ((this._rings = (this._rings || 0) + 1) > 2) return; // (the two nearest: the ring is made of a few hundred sparks a second)
        hf._auraRing(this._dt, s.x, s.y, s.z, s.k, s.seed);
    }

    _draw(s) {
        if (s.element === 'fire') return this._fire(s);
        if (s.element === 'air') return this._air(s);
        if (s.element === 'water') { // the same flowing rings as my own Water Vortex (WaterVortex.auraRing), the two nearest
            const wv = this.game.vortex;
            if (!wv?.auraRing || (s.me && wv.state)) return;
            if ((this._wr = (this._wr || 0) + 1) > 2) return;
            return wv.auraRing(s.id, s.x, s.y + 1.95, s.z, s.k);
        }
        this._leaves(s, KIND[s.element]);
    }

    _leaves(s, K) {
        if (!K) return;
        const buckets = this.index[K.mesh];
        const n = Math.round(K.n[0] + (K.n[1] - K.n[0]) * s.k);
        for (let i = 0; i < n; i++) {
            const bk = K.mesh === 'flame' ? buckets[0] : buckets[(i * 3 + (s.seed & 7)) % buckets.length];
            if (bk.n >= CAP) continue;
            const f = (i * 0.6180339 + (s.seed % 97) / 97) % 1; // (a stable «random» 0…1 for this thing)
            const f2 = (i * 0.7548776 + (s.seed % 53) / 53) % 1;
            const lane = i / n;
            const a = this.t * K.spin * (0.7 + 0.6 * f) * (1 + 0.5 * s.k) * (i % 2 ? 1 : -0.6) + lane * 6.2832;
            const r = K.r[0] + (K.r[1] - K.r[0]) * f2 * (0.7 + 0.5 * s.k);
            // (air: a helix up and down the body; the others: rings at different heights)
            let h = K.h[0] + (K.h[1] - K.h[0]) * ((s.element === 'air' ? 0.5 + 0.5 * Math.sin(this.t * 0.8 + lane * 9 + f * 3) : f) );
            h += Math.sin(this.t * 1.7 + i) * K.bob;
            let x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, y = s.y + h;
            if (s.element === 'water') { // (tilted rings: an orrery)
                const tilt = 0.5 + 0.5 * f, rr = r * 0.9;
                x = s.x + Math.cos(a) * rr; z = s.z + Math.sin(a) * rr * Math.cos(tilt); y = s.y + 2.0 + Math.sin(a) * rr * Math.sin(tilt) * 1.0 + Math.sin(this.t + i) * 0.12;
            }
            const size = K.size[0] + (K.size[1] - K.size[0]) * f;
            const grow = Math.min(1, this.t * 2 - lane * 0.4); // (they come in one after another when the aura first appears)
            const sc = size * Math.max(0.01, grow);
            if (K.mesh === 'leaf') {
                _e.set(this.t * (2 + 3 * f) + i, this.t * (1.5 + 2 * f2), this.t * (2.5 + 2 * f) + f * 6); _q.setFromEuler(_e);
                _s.set(sc, sc, sc);
            } else if (K.mesh === 'flame') {
                _d.set(-Math.sin(a), 0.55 + 0.25 * Math.sin(this.t * 9 + i * 2), Math.cos(a)).normalize(); _q.setFromUnitVectors(_up, _d); // (the tip leads the turn, leans up)
                const fl = 0.8 + 0.35 * Math.sin(this.t * 13 + i * 3.1) * Math.sin(this.t * 5 + i);
                _s.set(sc * 0.7 * fl, sc * fl * 1.2, sc * 0.7 * fl);
            } else if (K.mesh === 'drop') {
                _d.set(-Math.sin(a), 0.2, Math.cos(a)).normalize(); _q.setFromUnitVectors(_up, _d); // (a drop stretched along its way)
                _s.set(sc, sc * (1 + 0.8 * s.k), sc);
            } else {
                _e.set(this.t * 0.7 + i, this.t * 0.5 + f * 4, f2 * 6); _q.setFromEuler(_e); _s.set(sc, sc, sc);
            }
            _m.compose(_p.set(x, y, z), _q, _s);
            bk.im.setMatrixAt(bk.n++, _m);
            if (K.mesh === 'flame') { // (the hot core: a smaller yellow flame inside the orange one — two buckets, the same place)
                const core = buckets[1];
                if (core.n < CAP) { _s.multiplyScalar(0.55); _m.compose(_p, _q, _s); core.im.setMatrixAt(core.n++, _m); }
                bk.n--; bk.im.setMatrixAt(bk.n++, _m.compose(_p, _q, _s.multiplyScalar(1 / 0.55))); // (the outer one is always the orange bucket: its matrix again, at its own size)
            }
        }
    }

    dispose() { for (const im of this.meshes) { this.game.scene.remove(im); im.dispose?.(); } }
}
const hash = (id) => { let h = 7; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
