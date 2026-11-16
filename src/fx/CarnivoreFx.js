/**
 * CarnivoreFx.js — the look of the carnivorous head's hunt and its death (the author 15.11: «сейчас она довольно примитивно кусает. Особенно животных. Она просто их
 * уменьшает и всё, когда глотает… проработай её анимацию… Также, когда она умирает, когда её уничтожают, при взрыве или при огне — тоже фигня полная»).
 *
 * The hunt (Plants.js asks, nothing here decides anything): saliva that strings from the jaws, blood and fur flying at each bite, a wet crunch, a belch with green gas and
 * a few bones thrown out when the meal is digested. (The wind-up, the head whipping, the throw-back swallow and the swallow itself moving DOWN the neck are in Plants._animate / _applyPrey.)
 *
 * The death — three different ones, by what killed it:
 *   BLAST  it bursts: the two jaws, the ruff and pieces of the neck fly off as solid things (they turn, fall, bounce, lie and fade), a fan of sap, shreds of leaf, a puff of green smoke
 *   FIRE   it burns alive: flames run along the neck, it writhes and its jaws snap in spasms, it shrieks, blackens to charcoal; when it falls it sags and curls into a smoking stump
 *   CUT    (a blade, a bolt, anything else) the head is flung down by its own weight on the rope of the neck: it bounces, the jaws gape, sap spurts from the wound, the tendrils go slack
 *
 * Cheap on purpose: the pieces are clones of meshes that already exist (shared geometry and materials, no new shaders), at most `MAX_PIECES` alive; everything else is the shared
 * particle pools; the flames are glow particles along the spine, only for plants near the hero.
 */
import * as THREE from 'three';

export const CARN = { MAX_PIECES: 28, PIECE_LIFE: 5.5, G: 22, BOUNCE: 0.32, FIRE_NEAR: 60 };
const SAP = [0x6fb83a, 0x4f8a30, 0x9ac24a, 0x2c5a22, 0xb8e060];
const BLOOD = [0xb01820, 0x7d0d17, 0xd03a2a];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const pick = (a) => a[(Math.random() * a.length) | 0];
let CHUNK = null, CHAR = null;
const chunkGeo = () => CHUNK || (CHUNK = new THREE.CylinderGeometry(0.34, 0.42, 1, 7));
/** Charred plant: one dark material for everything that burnt (shared). */
export function charMaterial() { return CHAR || (CHAR = Object.assign(new THREE.MeshLambertMaterial({ color: 0x1c1712, flatShading: true }), { userData: { shared: true } })); }
let _sapMat = null;
const sapMat = () => _sapMat || (_sapMat = Object.assign(new THREE.MeshLambertMaterial({ color: 0x4a7a2a, flatShading: true }), { userData: { shared: true } }));

export class CarnivoreFx {
    constructor(game) { this.game = game; this.pieces = []; this.t = 0; this.fires = new Set(); }

    // ------------------------------------------------------------------ the hunt
    /** A bite: blood (or sap) and fur flying out of the jaws, a crunch. `kind`: what is bitten ('a' animal / 'v' person / 'p' player). */
    bite(w, kind = 'a', big = 1) {
        const g = this.game, fx = g.fx; if (!fx) return;
        for (let i = 0; i < 12 * big; i++) fx.spark?.(w, pick(BLOOD), 0.12 + Math.random() * 0.12, _a.set((Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6), 0.7);
        for (let i = 0; i < 5 * big; i++) fx.debris?.spawn(w.x, w.y, w.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5, [0xd8c9a8, 0x8a6a4a, 0x4a3a2a, 0xe8e0d0][i % 4], 0.12 + Math.random() * 0.12, 1.2 + Math.random(), { shrink: 0.2, fade: false, spin: 14 }); // (hide, hair, a bit of hoof)
        g.sound?.playPlant?.(w, 'crunch', 0.9);
    }
    /** A string of saliva from the open jaws: drops that fall slowly. */
    drool(w, n = 1) { const fx = this.game.fx; if (!fx) return; for (let i = 0; i < n; i++) fx.spark?.(_a.set(w.x + (Math.random() - 0.5) * 0.8, w.y - 0.1, w.z + (Math.random() - 0.5) * 0.8), 0xc8e89a, 0.07 + Math.random() * 0.06, _b.set(0, -1 - Math.random(), 0), 0.9); }
    /** The belch after a meal: green gas, a few drops. */
    burp(w) {
        const fx = this.game.fx; if (!fx) return;
        for (let i = 0; i < 14; i++) fx.smoke?.spawn(w.x, w.y, w.z, (Math.random() - 0.5) * 2.2, 1 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2, [0x8fb050, 0x6a9a3a, 0xa8c870][i % 3], 0.5 + Math.random() * 0.5, 1.3 + Math.random() * 0.8, { shrink: -0.3, spin: 0.8 });
        this.game.sound?.playPlant?.(w, 'burp', 1);
    }
    /** What is left of an eaten animal comes out of the mouth: a couple of bones (host spawns the real things). */
    bones(w) {
        const fx = this.game.fx; if (!fx) return;
        for (let i = 0; i < 6; i++) fx.debris?.spawn(w.x, w.y, w.z, (Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4, i % 2 ? 0xe9e1c8 : 0xcfc6a8, 0.14 + Math.random() * 0.12, 2.5, { shrink: 0.1, fade: false, spin: 10 });
    }
    /** A splash of sap (a wound, a blow): `n` drops from `w`, the strength `k`. */
    sap(w, n = 10, k = 1) {
        const fx = this.game.fx; if (!fx) return;
        for (let i = 0; i < n; i++) fx.spark?.(w, pick(SAP), 0.1 + Math.random() * 0.12, _a.set((Math.random() - 0.5) * 6 * k, 1.5 + Math.random() * 4 * k, (Math.random() - 0.5) * 6 * k), 0.8);
    }

    // ------------------------------------------------------------------ pieces (clones of meshes that exist: shared geometry and materials)
    _piece(mesh, w, vel, spin, size = 1) {
        const g = this.game; if (!g.scene) return null;
        if (this.pieces.length >= CARN.MAX_PIECES) this._drop(this.pieces[0]);
        mesh.matrixAutoUpdate = true;
        g.scene.add(mesh);
        const e = { mesh, vel: vel.clone(), spin: spin.clone(), t: 0, rest: 0, size, lay: false };
        this.pieces.push(e); return e;
    }
    _drop(e) { const i = this.pieces.indexOf(e); if (i >= 0) this.pieces.splice(i, 1); e.mesh.parent?.remove(e.mesh); }
    /** A world-space clone of `src` (a mesh or a group of the plant) placed exactly where it is now. */
    _cloneAt(src) {
        src.updateWorldMatrix(true, false);
        const c = src.clone(); c.matrix.copy(src.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); c.matrixAutoUpdate = true; c.visible = true; c.frustumCulled = false;
        return c;
    }

    /**
     * BLAST: the head bursts. `p` the plant; `toWorld(arr, out)` local → world; `origin` the blast's centre if known (else the head's own).
     */
    blast(p, toWorld, origin = null) {
        const g = this.game, fx = g.fx;
        const head = toWorld(p.hunt.H, _a).clone();
        const from = origin || head;
        const fly = (dir, k) => dir.clone().normalize().multiplyScalar(k);
        // the two jaws and the ruff
        for (const [src, side] of [[p.top, 1], [p.low, -1]]) {
            const c = this._cloneAt(src);
            const dir = _b.copy(head).sub(from); if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0.4, Math.random() - 0.5);
            dir.y += 0.5; dir.x += side * (Math.random() * 0.6 + 0.3);
            this._piece(c, head, fly(dir, 9 + Math.random() * 6).setY(7 + Math.random() * 5), new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), 1);
        }
        // pieces of the neck: short fat segments along the spine
        const n = 6;
        for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n, k = Math.min(p.spine.length - 2, Math.floor(u * (p.spine.length - 1)));
            const a0 = toWorld(p.spine[k], new THREE.Vector3()), a1 = toWorld(p.spine[k + 1], new THREE.Vector3());
            const c = new THREE.Mesh(chunkGeo(), sapMat()); c.castShadow = false;
            c.position.copy(a0).lerp(a1, 0.5); c.quaternion.setFromUnitVectors(_c.set(0, 1, 0), _b.subVectors(a1, a0).normalize());
            const len = Math.max(0.5, a0.distanceTo(a1) * 1.6 * p.s * 0.8); c.scale.set(p.s * (1 - 0.35 * u), len, p.s * (1 - 0.35 * u));
            const dir = _b.copy(c.position).sub(from); dir.y += 0.6 + Math.random();
            this._piece(c, c.position, fly(dir, 6 + Math.random() * 8).setY(4 + Math.random() * 7), new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), 0.8);
        }
        // the spray: sap, leaf shreds, a green cloud, a flash
        for (let i = 0; i < 60; i++) fx?.spark?.(head, pick(SAP), 0.12 + Math.random() * 0.14, _a.set((Math.random() - 0.5) * 16, 2 + Math.random() * 10, (Math.random() - 0.5) * 16), 1.2);
        for (let i = 0; i < 36; i++) fx?.debris?.spawn(head.x, head.y, head.z, (Math.random() - 0.5) * 14, 3 + Math.random() * 9, (Math.random() - 0.5) * 14, pick([0x4f8a30, 0x2c5a22, 0x9ac24a, 0x6a2a40]), 0.15 + Math.random() * 0.2, 2.5 + Math.random() * 1.5, { shrink: 0.12, fade: false, spin: 14 });
        for (let i = 0; i < 20; i++) fx?.smoke?.spawn(head.x + (Math.random() - 0.5), head.y, head.z + (Math.random() - 0.5), (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, pick([0x6a8a4a, 0x8a9a6a, 0x5a6a42]), 0.8 + Math.random() * 0.8, 1.8 + Math.random() * 1.2, { shrink: -0.35, spin: 1 });
        fx?.lightFlash?.(head, 0xcfe890, 3, 0.25, 22);
        g.sound?.playPlant?.(head, 'rip', 1); g.sound?.playPlant?.(head, 'splat', 1);
        // the head and neck are gone: only the foot and the roots stay
        if (p.pivot) p.pivot.visible = false; if (p.neckMesh) p.neckMesh.visible = false; if (p.vinesMesh) p.vinesMesh.visible = false;
    }

    /** CUT (a blade, a bolt, anything else): a spurt of sap from where the head was cut, the head flung — the Plants side runs the falling head (`deadHead`). */
    cut(p, toWorld) {
        const g = this.game;
        const head = toWorld(p.hunt.H, _a).clone();
        this.sap(head, 26, 1.2);
        g.sound?.playPlant?.(head, 'shriek', 0.9);
        g.sound?.playPlant?.(head, 'rip', 0.8);
    }

    /** Called every frame while a head is falling: sap leaks from the wound. */
    leak(p, toWorld, dt) {
        const fx = this.game.fx; if (!fx || !(p.leakT > 0)) return;
        p.leakT -= dt;
        const w = toWorld(p.hunt.H, _a);
        if (Math.random() < dt * 40) fx.spark?.(w, pick(SAP), 0.12, _b.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.7);
    }

    /** The flames along the neck of a burning head (every computer, near ones only): `spine` local points, `toWorld`. */
    burning(p, toWorld, dt, k) {
        const fx = this.game.fx; if (!fx) return;
        const glow = fx.glow;
        const n = Math.max(1, Math.round(dt * 38));
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * p.spine.length), w = toWorld(p.spine[idx], _a);
            w.x += (Math.random() - 0.5) * 0.8; w.z += (Math.random() - 0.5) * 0.8;
            glow?.spawn(w.x, w.y, w.z, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 2.2, (Math.random() - 0.5) * 0.8, pick([0xff6a14, 0xffa030, 0xffd86a, 0xff3a00]), 0.45 + Math.random() * 0.6, 0.55 + Math.random() * 0.4, { shrink: 1.1 });
            if (Math.random() < 0.5) fx.smoke?.spawn(w.x, w.y + 0.4, w.z, (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6, pick([0x2a2622, 0x3a342e, 0x1c1814]), 0.7 + Math.random() * 0.7, 1.6 + Math.random(), { shrink: -0.3, spin: 0.8 });
        }
        const head = toWorld(p.hunt.H, _a);
        if (Math.random() < dt * 20) glow?.spawn(head.x, head.y + 0.5, head.z, (Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0xffe08a, 0.7 + Math.random() * 0.6, 0.6, { shrink: 1 });
        if (Math.random() < dt * 5) fx.spark?.(head, 0xff8a30, 0.1, _b.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.0); // (embers fall)
    }

    // ------------------------------------------------------------------ the pieces' own physics
    update(dt) {
        const g = this.game, col = g.collision;
        this.t += dt;
        for (let i = this.pieces.length - 1; i >= 0; i--) {
            const e = this.pieces[i], m = e.mesh;
            e.t += dt;
            if (e.t > CARN.PIECE_LIFE) { this._drop(e); continue; }
            if (!e.lay) {
                e.vel.y -= CARN.G * dt;
                m.position.addScaledVector(e.vel, dt);
                m.rotation.x += e.spin.x * dt; m.rotation.y += e.spin.y * dt; m.rotation.z += e.spin.z * dt;
                const gy = col?.groundAt ? col.groundAt(m.position.x, m.position.z, m.position.y + 1) : 0;
                const floor = (Number.isFinite(gy) ? gy : 0) + 0.35 * e.size;
                if (m.position.y < floor) {
                    m.position.y = floor;
                    if (Math.abs(e.vel.y) > 2.5) { // a bounce: it splatters
                        this.sap(m.position, 5, 0.6); if (!e.splat) { e.splat = true; g.sound?.playPlant?.(m.position, 'splat', 0.7); }
                        e.vel.y *= -CARN.BOUNCE; e.vel.x *= 0.7; e.vel.z *= 0.7; e.spin.multiplyScalar(0.6);
                    } else { e.vel.set(0, 0, 0); e.spin.set(0, 0, 0); e.lay = true; }
                }
            }
            const fade = CARN.PIECE_LIFE - e.t;
            if (fade < 1) { const k = Math.max(0.02, fade); m.scale.multiplyScalar(1 - (1 - k) * dt * 2.5 > 0 ? 1 - dt * 1.6 : 1); }
        }
    }
    dispose() { for (const e of [...this.pieces]) this._drop(e); }
}
