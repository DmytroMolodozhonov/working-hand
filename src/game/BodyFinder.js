/**
 * BodyFinder.js — «Reperio»: the way to my own last body (`g.bodyFinder`). The rules — BodyFinderRules.js (pure, tested).
 *
 * The author 08.11: «заклинание… известно любому с начала, без свитка, 10 маны, ищет своё прошлое тело — где ты последний раз умер — автоматически. На карте путь, и светом тоже
 * путь. Чёрная магия.»
 *
 * The word, the cost and the black magic are the game's (Game._castReperio, Combat, DarkMagic); here is what is SEEN:
 *   - a row of BEADS of cold green-violet light along the ground from the hero to the body (a point every 4 m, the nearest 56 within 90 m), each with a halo; a WAVE of light runs
 *     along them towards the body (they are never dark: the way is always readable), they ride the ground (over water — on the water) and lift a little as the wave passes;
 *   - a PILLAR of light over the body (three nested cylinders of additive light, two rune rings turning on the ground, motes rising) — seen from far, over the hills;
 *   - the minimap: a dotted line of the way and the body's mark (Hud.drawMinimap reads `hud.seekPath`);
 *   - the words: the distance and the side of the world, once, at the cast.
 * It lasts SEEK.DUR s; ends when the hero stands by the body (SEEK.ARRIVE m), dies, changes the realm, or the spell is said again (the way is made anew).
 * «А если»: the body was moved («Левиоса», a hand carries it) — its place is read every REFRESH s; the body is gone (a day passed) — the place of the death is the target;
 * the target in another realm (a planet, space, hell) — no way, only the word; the land far off is not made yet — the beads there ride a straight height between the hero's and the
 * body's (no land is made in the frame — `landMade`); the hero flies/swims — the beads stay on the ground / the water; two casts — one trail.
 */
import * as THREE from 'three';
import { SEEK, findTarget, routePoints, beadsNear, waveAt, arrived, bearing, compass } from './BodyFinderRules.js';
import { waterAt } from './CreatureSwim.js';
import { realmAt } from '../world/Planets.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const COLD = new THREE.Color(0x7affd0), VIOLET = new THREE.Color(0xa070ff);
const _geo = {};
const G = (k, f) => _geo[k] || (_geo[k] = Object.assign(f(), { userData: { shared: true } }));
const _mat = {};
const MAT = (k, f) => _mat[k] || (_mat[k] = Object.assign(f(), { userData: { shared: true } }));
const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const REALM_RU = { space: 'космос', hell: 'ад', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', earth: 'Земля' };
const realmName = (id) => REALM_RU[id] || String(id);

export class BodyFinder {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.t = 0; this.life = 0; this._refT = 0;
        this.target = null; this.route = null;
        this.group = null;
        this.log = []; // (tests) what happened
    }

    // ---------------------------------------------------------------- what is drawn (made at the first cast; samples in Game.prewarm)
    _ensure() {
        if (this.group) return;
        this.group = new THREE.Group(); this.group.name = 'bodyFinder';
        const N = SEEK.BEADS;
        this.core = new THREE.InstancedMesh(G('bfCore', () => new THREE.SphereGeometry(0.26, 10, 8)), MAT('bfCore', () => new THREE.MeshBasicMaterial({ color: 0xffffff })), N);
        this.halo = new THREE.InstancedMesh(G('bfHalo', () => new THREE.SphereGeometry(0.7, 10, 8)), MAT('bfHalo', () => glow(0xffffff, 0.22)), N);
        for (const m of [this.core, this.halo]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; this.group.add(m); }
        // the pillar over the body: three nested open cylinders, the inner the brightest; two rune rings on the ground
        this.pillar = new THREE.Group();
        const H = SEEK.PILLAR_H;
        [[0.5, 0.34, 0xa6ffe2], [1.2, 0.16, 0x7affd0], [2.4, 0.09, 0xa070ff]].forEach(([r, o, col], i) => {
            const m = new THREE.Mesh(G('bfPillar' + i, () => new THREE.CylinderGeometry(r, r * 1.5, H, 18, 1, true)), MAT('bfPillar' + i, () => glow(col, o)));
            m.position.y = H / 2; this.pillar.add(m);
        });
        this.ring = new THREE.Mesh(G('bfRing', () => new THREE.RingGeometry(2.2, 2.9, 40, 1)), MAT('bfRing', () => glow(0x7affd0, 0.55)));
        this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.12; this.pillar.add(this.ring);
        this.ring2 = new THREE.Mesh(G('bfRing2', () => new THREE.RingGeometry(3.7, 3.95, 40, 1)), MAT('bfRing2', () => glow(0xa070ff, 0.4)));
        this.ring2.rotation.x = -Math.PI / 2; this.ring2.position.y = 0.16; this.pillar.add(this.ring2);
        for (let i = 0; i < 8; i++) { // (eight small rune bars on the inner ring, turning with it)
            const a = i / 8 * Math.PI * 2;
            const bar = new THREE.Mesh(G('bfRune', () => new THREE.BoxGeometry(0.18, 0.8, 0.02)), MAT('bfRune', () => glow(0xdafff3, 0.9)));
            bar.position.set(Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0.02); bar.rotation.z = a + Math.PI / 2 + (i % 2 ? 0.5 : -0.5);
            this.ring.add(bar);
        }
        this.pillar.visible = false;
        this.group.add(this.pillar);
        this.group.visible = false;
        this.game.scene.add(this.group);
    }

    /** Meshes for the shader warm-up (Game.prewarm's zoo). */
    sample() {
        this._ensure();
        const g = new THREE.Group();
        g.add(new THREE.Mesh(this.core.geometry, this.core.material), new THREE.Mesh(this.halo.geometry, this.halo.material));
        for (const m of this.pillar.children) if (m.isMesh) g.add(new THREE.Mesh(m.geometry, m.material));
        return g;
    }

    // ---------------------------------------------------------------- the cast
    /** → {ok: true, target, length} | {ok: false, why}. (No mana here: Game._castReperio pays only for a cast that found something.) */
    find() {
        const g = this.game, me = g.character.group.position;
        const t = findTarget(g.death?.bodies?.values?.() || [], g.localId || 'local', g.lastDeath);
        if (!t) return { ok: false, why: '💀 Вы ещё не умирали в этом мире — искать нечего' };
        const here = realmAt(me.x, me.y, me.z, g.space?.registry), there = realmAt(t.x, t.y, t.z, g.space?.registry);
        if (here !== there) return { ok: false, why: `💀 Ваше тело лежит в другом мире (${realmName(there)}) — отсюда пути к нему нет` };
        return { ok: true, target: t, length: Math.hypot(t.x - me.x, t.z - me.z) };
    }

    start(found) {
        this._ensure();
        const g = this.game;
        this.target = found.target;
        this.active = true; this.life = 0; this.t = 0; this._refT = 0;
        this.group.visible = true;
        this._route();
        this.log.push('start:' + found.target.from);
        const me = g.character.group.position;
        const d = Math.round(found.length), side = compass(bearing(me, found.target));
        g.hud?.setVoice?.(`💀 Тело — в ${d} м, на направлении «${side}». Идите по свету${found.target.from === 'record' ? ' (тела уже нет — это место, где вы погибли)' : ''}`, true);
        // the cast's flash: a ring of cold motes round the feet, rising
        if (g.fx?.spark) for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; g.fx.spark(_v.set(me.x + Math.cos(a) * 1.4, me.y - 1.6, me.z + Math.sin(a) * 1.4), i % 2 ? 0x7affd0 : 0xa070ff, 0.14, _w.set(Math.cos(a) * 1.2, 2.2 + Math.random(), Math.sin(a) * 1.2), 1.0); }
    }

    stop(why = 'stop') {
        if (!this.active && !this.target) return false;
        this.active = false; this.target = null; this.route = null;
        if (this.group) this.group.visible = false;
        if (this.game.hud) this.game.hud.seekPath = null;
        this.log.push(why);
        return true;
    }

    _route() {
        const g = this.game, me = g.character.group.position;
        const t = findTarget(g.death?.bodies?.values?.() || [], g.localId || 'local', g.lastDeath) || this.target;
        if (!t) { this.stop('gone'); return; }
        this.target = t;
        this.route = routePoints(me, t);
        if (g.hud) g.hud.seekPath = { points: this.route.points, target: t, far: this.route.far };
    }

    // ---------------------------------------------------------------- the frame
    _ground(x, z, hy, ty, k) {
        const g = this.game, d = g.world?.terrain?.data;
        if (d && d.landMade?.(Math.round(x), Math.round(z))) {
            const gy = g.collision.groundAt ? g.collision.groundAt(x, z, hy + 1) : g.collision.groundY(x, z);
            const w = waterAt(d, x, z, gy);
            return w ? w.surface + (g.sea ? g.sea.height(x, z) : 0) : gy;
        }
        return hy + (ty - hy) * k; // (the land there is not made: a straight height between the hero's and the body's)
    }

    update(dt) {
        const g = this.game;
        if (!(dt > 0) || !this.active) return;
        if (g.isDeadLocal || g.combat?.dead) { this.stop('died'); return; }
        const me = g.character.group.position;
        this.t += dt; this.life += dt;
        if (this.life > SEEK.DUR) { this.stop('timeout'); return; }
        // (the realm may change under him — a gate, a planet: the way is gone)
        if (this.target && realmAt(me.x, me.y, me.z, g.space?.registry) !== realmAt(this.target.x, this.target.y, this.target.z, g.space?.registry)) { this.stop('realm'); return; }
        this._refT -= dt;
        if (this._refT <= 0) { this._refT = SEEK.REFRESH; this._route(); if (!this.active) return; }
        const T = this.target;
        if (arrived(me, T)) { g.hud?.setVoice?.('💀 Вот оно — ваше тело. Свет гаснет', true); this.stop('arrived'); return; }
        const R = this.route, pts = R.points, hy = me.y - 2, ty = T.y;
        // the beads (a too-far body: only the pillar and the map's arrow tell the way)
        let n = 0;
        if (!R.far) {
            for (const i of beadsNear(pts, me)) {
                const p = pts[i], s = i * SEEK.STEP, k = i / Math.max(1, pts.length - 1);
                const w = waveAt(s, this.t), y = this._ground(p.x, p.z, hy, ty, k) + 0.55 + 0.35 * w;
                _q.identity(); _s.setScalar(0.7 + 0.6 * w);
                _m.compose(_v.set(p.x, y, p.z), _q, _s); this.core.setMatrixAt(n, _m);
                _s.setScalar(0.8 + 1.1 * w); _m.compose(_v, _q, _s); this.halo.setMatrixAt(n, _m);
                _c.copy(COLD).lerp(VIOLET, 0.5 - 0.5 * Math.cos(this.t * 0.8 + s * 0.05)).multiplyScalar(0.55 + 0.45 * w);
                this.core.setColorAt(n, _c); this.halo.setColorAt(n, _c);
                n++;
            }
        }
        for (const m of [this.core, this.halo]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        // the pillar over the body, the rune rings turning, motes rising
        const gy = this._ground(T.x, T.z, hy, T.y - 1, 1);
        this.pillar.visible = true;
        this.pillar.position.set(T.x, gy, T.z);
        const pulse = 0.85 + 0.15 * Math.sin(this.t * 2.3);
        this.pillar.scale.set(pulse, 1, pulse);
        this.ring.rotation.z += dt * 0.7; this.ring2.rotation.z -= dt * 0.45;
        if (g.fx?.spark && Math.hypot(T.x - me.x, T.z - me.z) < 160 && Math.random() < dt * 14) {
            const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.8;
            g.fx.spark(_v.set(T.x + Math.cos(a) * r, gy + 0.3, T.z + Math.sin(a) * r), Math.random() < 0.5 ? 0x7affd0 : 0xa070ff, 0.16, _w.set(0, 3 + Math.random() * 3, 0), 1.6);
        }
    }

    dispose() {
        this.stop('dispose');
        if (this.group) { this.group.parent?.remove(this.group); this.core?.dispose(); this.halo?.dispose(); this.group = null; }
    }
}
