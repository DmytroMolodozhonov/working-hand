/**
 * IceShards.js — the water mage's ice shards (rules: ElementalRules.SHARDS; the author 14.11). Host: simulates, hits, damages; every computer draws.
 *
 * Orbiting: while a water mage's `fx` has FX.SHARDS the shards hang and turn about him (the same formula everywhere — no message; they grow in over `GROW` s).
 * Flying: the host sends one `ishard` message per volley (the start points and velocities); every computer flies the same shards; only the host looks for hits, and tells the one
 * who was hit (`ishit`, to a guest) or hurts him at once (his own hero). A hit is turned by a shield or a dome (the cost of «Ice»), is stopped by a wall, by water, by the ground.
 *
 * «Кто/что»: players — hurt (3.5, a push); zombies, animals, castle people, ships — not touched (the mage's shards go for his foe: no friendly fire, no harm to the world);
 * blocks — a shard breaks on them in a puff of ice (no digging); the gods' shield turns them like any blow; invisible / dead / spectating players are not hit.
 * One InstancedMesh (96 shards at most), one material: prewarmed (`sampleModel`), nothing built in a frame.
 */
import * as T from 'three';
import { SHARDS, orbitPoint, segHitsCapsule } from './ElementalRules.js';
import { FX } from '../fx/WizardFx.js';

const GROW = 0.6;
const _m = new T.Matrix4(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3(), _d = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _o = { x: 0, y: 0, z: 0 };
const NEAR = 60;

export class IceShards {
    constructor(game) {
        this.game = game; this.time = 0; this.flying = []; this.grow = new Map(); this.ot = new Map(); this.seq = 0; this.hits = new Set(); // (ot: each mage's own orbit clock, from the moment his flag came on — the host and the guests agree to within the net's delay)
        if (!game.scene) { this.mesh = null; return; }
        this.geo = new T.ConeGeometry(0.11, 0.95, 5); // (a long thin crystal: tip along +Y)
        this.mat = new T.MeshPhongMaterial({ color: 0xcfeeff, emissive: 0x2f6fa0, shininess: 90, flatShading: true, transparent: true, opacity: 0.88, specular: 0xffffff });
        this.mesh = new T.InstancedMesh(this.geo, this.mat, SHARDS.MAX_LIVE);
        this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.mesh.castShadow = false;
        game.scene.add(this.mesh);
    }

    sampleModel() { const m = new T.Mesh(this.geo, this.mat); m.userData.shared = true; return m; }

    /** (host) Send the volley: `shards` = [{ p: [x,y,z], v: [x,y,z], d: delay }], by a mage. Every computer flies them; the host's list is the one that hits. */
    volley(by, shards) {
        const g = this.game;
        this._spawn(by, shards);
        g.net?.send?.({ t: 'ishard', by, id: by + ':shards:' + (++this.seq), s: shards.map((s) => [...s.p.map((n) => Math.round(n * 100) / 100), ...s.v.map((n) => Math.round(n * 100) / 100), Math.round(s.d * 100) / 100]) }, true);
    }
    _spawn(by, shards) {
        for (const s of shards) {
            if (this.flying.length >= SHARDS.MAX_LIVE) this.flying.shift();
            this.flying.push({ by, x: s.p[0], y: s.p[1], z: s.p[2], vx: s.v[0], vy: s.v[1], vz: s.v[2], delay: s.d || 0, age: 0, dead: 0 });
        }
    }
    onNet(m) {
        const g = this.game;
        if (m.t === 'ishard') {
            if (g.authority || typeof m.by !== 'string' || !Array.isArray(m.s) || m.s.length > 12) return;
            const list = [];
            for (const a of m.s) if (Array.isArray(a) && a.length === 7 && a.every(Number.isFinite)) list.push({ p: [a[0], a[1], a[2]], v: [a[3], a[4], a[5]], d: Math.max(0, Math.min(1, a[6])) });
            this._spawn(m.by, list);
        } else if (m.t === 'ishit') this.hitMe(m);
    }

    /** (my computer) A shard struck me: the shield / dome turns it, else it hurts and pushes. */
    hitMe(m) {
        const g = this.game, c = g.combat;
        if (m.to !== g.localId || !c?.enabled || c.dead || !Array.isArray(m.from) || !Array.isArray(m.vel) || ![...m.from, ...m.vel, m.damage].every(Number.isFinite)) return;
        if (this.hits.has(m.id)) return; this.hits.add(m.id); if (this.hits.size > 256) this.hits.delete(this.hits.values().next().value);
        const p = new T.Vector3(...m.from), vel = new T.Vector3(...m.vel).clampLength(0, 5);
        if (c.shieldFactor(p) >= 1 && c._blocked(p, 'Ice')) return;
        c.damage(Math.max(1, Math.min(8, m.damage)), m.by, 'thrown');
        g.impact?.apply({ v: vel, from: p, by: m.by, kind: 'swarm' });
    }

    /** Where shard `i` of mage `id` hangs now (the clock of his flag): for the host's volley. */
    orbitAt(id, i, v, out) { return orbitPoint(i, SHARDS.N, this.ot.get(id) || 0, v.x, v.y, v.z, out); }

    _bodies() {
        const out = [];
        for (const b of this.game.duel?._bodies?.(null) || []) if (b.kind === 'p') out.push({ id: b.id, a: b.a.clone(), b: b.b.clone(), r: b.r });
        return out;
    }

    update(dt) {
        const g = this.game; if (!this.mesh) return;
        this.time += dt;
        const me = g.character?.group?.position;
        let n = 0;
        // --- flying
        let bodies = null;
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const s = this.flying[i];
            if (s.delay > 0) { s.delay -= dt; continue; }
            s.age += dt;
            if (s.dead || s.age > SHARDS.LIFE) { this.flying.splice(i, 1); continue; }
            const ox = s.x, oy = s.y, oz = s.z;
            s.vy -= SHARDS.GRAV * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
            if (g.authority) {
                if (!bodies) bodies = this._bodies();
                for (const b of bodies) {
                    if (b.id === s.by) continue;
                    const t = segHitsCapsule({ x: ox, y: oy, z: oz }, { x: s.x, y: s.y, z: s.z }, b.a, b.b, b.r + SHARDS.HIT_R);
                    if (t == null) continue;
                    this._hurt(s, b.id); s.dead = 1; this._burst(s.x, s.y, s.z); break;
                }
            }
            if (!s.dead && (g.collision?.pointBlocked?.(s.x, s.y, s.z) || s.y < (g.collision?.groundAt?.(s.x, s.z, s.y + 1) ?? -1e9))) { s.dead = 1; this._burst(s.x, s.y, s.z); }
        }
        for (const s of this.flying) {
            if (s.delay > 0 || s.dead || n >= SHARDS.MAX_LIVE) continue;
            _d.set(s.vx, s.vy, s.vz).normalize(); _q.setFromUnitVectors(_up, _d);
            _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(1.1, 1.1, 1.1)); this.mesh.setMatrixAt(n++, _m);
        }
        // --- orbiting (every computer, from the mage's flag)
        const L = g.castleLife;
        if (L && me) for (const v of L.byId.values()) {
            if (v.element !== 'water') continue;
            const on = !v.dead && (v.fx & FX.SHARDS) && v.group?.visible && Math.hypot(v.x - me.x, v.z - me.z) < NEAR;
            let k = this.grow.get(v.id) || 0;
            k = Math.max(0, Math.min(1, k + (on ? dt / GROW : -dt / 0.15)));
            if (k <= 0) { this.grow.delete(v.id); this.ot.delete(v.id); continue; }
            this.grow.set(v.id, k);
            const ot = (this.ot.get(v.id) || 0) + (on ? dt : 0); this.ot.set(v.id, ot);
            const e = k * k * (3 - 2 * k);
            for (let i = 0; i < SHARDS.N && n < SHARDS.MAX_LIVE; i++) {
                orbitPoint(i, SHARDS.N, ot, v.x, v.y, v.z, _o);
                const a = ot * 2.6 + i * (Math.PI * 2 / SHARDS.N);
                _d.set(-Math.sin(a), 0.35, Math.cos(a)).normalize(); _q.setFromUnitVectors(_up, _d); // (the tip leads the turn)
                _m.compose(_p.set(_o.x, _o.y, _o.z), _q, _s.set(e, e, e)); this.mesh.setMatrixAt(n++, _m);
            }
        }
        this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
    }

    _hurt(s, to) {
        const g = this.game, m = { t: 'ishit', id: s.by + ':' + (++this.seq), to, by: s.by, damage: SHARDS.DAMAGE, from: [s.x - s.vx * 0.05, s.y - s.vy * 0.05, s.z - s.vz * 0.05], vel: [s.vx * 0.25, 2, s.vz * 0.25] };
        if (to === g.localId) this.hitMe(m); else g.net?.send?.(m, true);
    }
    _burst(x, y, z) {
        const fx = this.game.fx; if (!fx) return;
        for (let i = 0; i < 8; i++) fx.spark?.(_p.set(x, y, z), i % 2 ? 0xe8f6ff : 0x9fd8ff, 0.12, _d.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.4);
    }
    dispose() { if (!this.mesh) return; this.game.scene.remove(this.mesh); this.mesh.dispose?.(); this.geo.dispose(); this.mat.dispose(); }
}
