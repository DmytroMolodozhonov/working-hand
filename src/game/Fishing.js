/**
 * Fishing.js — fishing with the rod in the hand (`g.fishing`): the float and the line, the cast, the bite, the fight, the catch. The rules and numbers —
 * FishingRules.js (pure, tested); the rod and the fish as things — FishingRodModel.js. The author 07.11: «технология удочки… протестировать».
 *
 * Everything goes by the HAND (the game's principle — nothing is a button):
 *   rig     the float hangs on a short line under the rod's tip and swings with it (a real pendulum on the tip).
 *   cast    the rod is swung forward and stopped: at the top of the swing the float leaves with the tip's speed (FishingRules.castVelocity), flies, falls.
 *   float   on the water (the sea's wave under it), the line lies out; the rod pulled away fast with nothing on the hook winds the line in (`back`).
 *   bite    a nibble, then the float dips and rings spread: a jerk of the rod UP / BACK in the window sets the hook (FishingRules.isStrike).
 *   fight   a real fish of the sea's hundred pulls (`fightStep`): the rod is lifted — the line comes in, lowered — the slack is wound up; too hard — it snaps,
 *           too slack — the fish spits the hook out; the rod bends with the tension (4 pivoted pieces). Tired and near: it is landed — flies up on to the ground by the hero.
 *   ground  the float fell on dry land: it lies a moment and winds back by itself.
 * The tip's speed is the tip's own (the hero's walk taken off: walking is no cast).
 *
 * «А если»: the rod put away / dropped / the hero dead / another world — the float is wound in at once, the fish goes, nothing is lost (`reset`); the float into lava
 * (hell) or a wall — it lies; two rods in two hands — the first one fishes; the host and the guests — each fishes for himself, others see only the rod in the hand.
 */
import * as THREE from 'three';
import { FISHING, castVelocity, isStrike, pickSpecies, fishLength, fishStrength, makeFishItem, biteWait, fightStep, newFight, rodBend } from './FishingRules.js';
import { FISH_SPECIES, fishItemMesh } from '../fx/ReefFish.js';
import { waterAt } from './CreatureSwim.js';
import { newUid } from './ItemTypes.js';

const _tip = new THREE.Vector3(), _raw = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();
const LINE_SEGS = 30;
const RINGS = 8;
const FISH_VIS = 2.2; // a caught fish is drawn this much bigger than its size in a person's world (ITEM_SCALE.fish: ~2.5× a person's things)

// shared look: the float (red cap, white body, a stalk), the hook, the ring on the water, the line
const _geo = {};
const G = (k, f) => _geo[k] || (_geo[k] = Object.assign(f(), { userData: { shared: true } }));
const _mat = {};
const MAT = (k, f) => _mat[k] || (_mat[k] = Object.assign(f(), { userData: { shared: true } }));
const lam = (c) => MAT('l' + c, () => new THREE.MeshLambertMaterial({ color: c }));

/** The float: a round white body with a red cap, a thin stalk up, a ring at the foot (the line), a tiny hook and a lead shot under it. Radius ~0.2 m (×1 here). */
function floatModel() {
    const g = new THREE.Group();
    const R = FISHING.FLOAT_R;
    const low = new THREE.Mesh(G('flLow', () => new THREE.SphereGeometry(R, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), lam(0xf4f1e8)); g.add(low);
    const cap = new THREE.Mesh(G('flCap', () => new THREE.SphereGeometry(R, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), lam(0xd2262d)); g.add(cap);
    const band = new THREE.Mesh(G('flBand', () => new THREE.TorusGeometry(R * 0.99, R * 0.06, 5, 16)), lam(0x1d1d22)); band.rotation.x = Math.PI / 2; g.add(band);
    const stalk = new THREE.Mesh(G('flStalk', () => new THREE.CylinderGeometry(R * 0.07, R * 0.1, R * 2.3, 6)), lam(0xe8c64a)); stalk.position.y = R * 1.5; g.add(stalk);
    const tipc = new THREE.Mesh(G('flTip', () => new THREE.SphereGeometry(R * 0.11, 6, 5)), lam(0xd2262d)); tipc.position.y = R * 2.65; g.add(tipc);
    const eye = new THREE.Mesh(G('flEye', () => new THREE.TorusGeometry(R * 0.14, R * 0.035, 4, 8)), lam(0xcfd3d8)); eye.position.y = -R * 0.98; g.add(eye);
    const hook = new THREE.Mesh(G('flHook', () => new THREE.TorusGeometry(R * 0.28, R * 0.035, 4, 10, Math.PI * 1.35)), lam(0xcfd3d8)); hook.position.set(0, -R * 1.5, 0); hook.rotation.z = 0.4; g.add(hook);
    const shot = new THREE.Mesh(G('flShot', () => new THREE.SphereGeometry(R * 0.16, 6, 5)), lam(0x555a60)); shot.position.set(0, -R * 1.15, 0); g.add(shot);
    g.userData.hookY = -R * 1.5;
    return g;
}

export class Fishing {
    constructor(game) {
        this.game = game;
        this.state = 'rig';
        this.b = new THREE.Vector3(); // the float
        this.bv = new THREE.Vector3();
        this.tipPrev = new THREE.Vector3(); this.tipV = new THREE.Vector3(); this.heroPrev = new THREE.Vector3();
        this.havePrev = false;
        this.swing = { peak: 0, v: new THREE.Vector3(), t: 0 };
        this.t = 0; this.stateT = 0;
        this.lineOut = 0; // the line paid out (m)
        this.water = null; // {surface, depth, sea}
        this.wait = 0; this.bite = null; this.fight = null; this.fish = null; this.fishMesh = null;
        this.back = null;
        this.group = null; this.floatM = null; this.line = null; this.rings = [];
        this.log = []; // (tests) what happened
        this.touched = false;
        this._lastHold = false;
    }

    // ---------------------------------------------------------------- what is drawn (made on the first rod in a hand; samples in Game.prewarm)
    _ensure() {
        if (this.group) return;
        const g = this.game;
        this.group = new THREE.Group(); this.group.name = 'fishing';
        this.floatM = floatModel(); this.group.add(this.floatM);
        const lg = G('lineUnit', () => new THREE.CylinderGeometry(0.014, 0.014, 1, 4));
        this.line = new THREE.InstancedMesh(lg, MAT('line', () => new THREE.MeshBasicMaterial({ color: 0xe9eee6 })), LINE_SEGS);
        this.line.frustumCulled = false; this.line.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(this.line);
        const rg = G('ring', () => new THREE.RingGeometry(0.82, 1, 28));
        for (let i = 0; i < RINGS; i++) {
            const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
            r.rotation.x = -Math.PI / 2; r.visible = false; r.frustumCulled = false; r.userData.t = 1; r.userData.dur = 1; r.userData.size = 1;
            this.group.add(r); this.rings.push(r);
        }
        g.scene.add(this.group);
        this.group.visible = false;
    }

    /** Meshes for the shader warm-up (Game.prewarm's zoo). */
    sample() { const g = new THREE.Group(); g.add(floatModel()); const r = new THREE.Mesh(G('ring', () => new THREE.RingGeometry(0.82, 1, 28)), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; g.add(r); return g; }

    // ---------------------------------------------------------------- state
    _to(s) { this.state = s; this.stateT = 0; this.log.push(s); if (this.log.length > 60) this.log.shift(); }

    /** The float is wound in at once and everything is as before the cast (a rod put away, a death, a new world). */
    reset() {
        if (this.state !== 'rig' || this.fight || this.fish) this.log.push('reset');
        this.state = 'rig'; this.stateT = 0; this.bite = null; this.fight = null; this.fish = null; this.back = null; this.water = null;
        this.swing.peak = 0; this.havePrev = false;
        if (this.fishMesh) { this.fishMesh.parent?.remove(this.fishMesh); this.fishMesh = null; }
        if (this.group) this.group.visible = false;
        for (const r of this.rings) r.visible = false;
        this._bendRod(null, 0);
    }

    _say(text) { this.game.hud?.setVoice?.(text, true); }

    /** The water under (x, z) with the sea's wave: {surface (y of the water now), depth (m), sea} or null. */
    waterUnder(x, z, y) {
        const g = this.game, data = g.world?.terrain?.data;
        const w = data ? waterAt(data, x, z, y) : null;
        if (!w) return null;
        const sea = !!(g.sea && g.sea.s(x, z) > -2);
        const wave = sea ? g.sea.height(x, z) : 0;
        return { surface: w.surface + wave, depth: w.depth, bottom: w.bottom, sea, wave };
    }
    _ground(x, z, y) { const c = this.game.collision; return c.groundAt ? c.groundAt(x, z, y + 1) : c.groundY(x, z); }

    _ring(x, y, z, size, dur = 1.4) {
        const r = this.rings.find((k) => !k.visible) || this.rings.reduce((a, k) => (k.userData.t > a.userData.t ? k : a));
        r.position.set(x, y + 0.04, z); r.userData.t = 0; r.userData.dur = dur; r.userData.size = size; r.visible = true; r.scale.setScalar(0.1);
    }
    _splash(p, n = 10, power = 1) {
        const g = this.game;
        g.sound?.playSplashAt?.(p, 0.8 * power);
        const fx = g.fx;
        if (fx?.spark) for (let i = 0; i < n; i++) fx.spark(_p.set(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.4), i % 3 ? 0xdff3ff : 0x9fd0f0, 0.08 + Math.random() * 0.07, _v.set((Math.random() - 0.5) * 3 * power, (2 + Math.random() * 3) * power, (Math.random() - 0.5) * 3 * power), 0.6);
    }

    // ---------------------------------------------------------------- the frame
    update(dt) {
        const g = this.game;
        if (!(dt > 0)) return;
        const h = g.items?.heldOf?.('fishingRod');
        const dead = g.isDeadLocal || g.combat?.dead;
        if (!h || dead || !h.model?.userData?.tip) { if (this._lastHold || this.state !== 'rig') this.reset(); this._lastHold = false; return; }
        this._lastHold = true;
        this._ensure();
        this.t += dt; this.stateT += dt;
        this.group.visible = true;
        // the tip and its speed (the hero's own walk taken off)
        h.model.updateWorldMatrix(true, true);
        h.model.userData.tip.getWorldPosition(_tip);
        const hero = g.character.group.position;
        if (!this.havePrev) { this.tipPrev.copy(_tip); this.heroPrev.copy(hero); this.tipV.set(0, 0, 0); this.havePrev = true; this.b.copy(_tip).add(_d.set(0, -FISHING.HANG, 0)); this.bv.set(0, 0, 0); }
        _raw.subVectors(_tip, this.tipPrev).divideScalar(dt).sub(_d.subVectors(hero, this.heroPrev).divideScalar(dt));
        if (_raw.length() < 70) this.tipV.lerp(_raw, 0.55); // (a jump — a teleport, a frame lost — is not a swing)
        this.tipPrev.copy(_tip); this.heroPrev.copy(hero);
        const yaw = g.character.group.rotation.y;
        const face = _w.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        switch (this.state) {
            case 'rig': this._rig(dt, face); break;
            case 'cast': this._cast(dt); break;
            case 'float': this._float(dt); break;
            case 'ground': this._ground2(dt); break;
            case 'bite': this._biteStep(dt); break;
            case 'fight': this._fightStep(dt); break;
            case 'back': this._backStep(dt); break;
            default: break;
        }
        this._draw(h, dt);
    }

    // ---- the float hangs from the tip: a pendulum — and the swing that makes a cast
    _rig(dt, face) {
        const K = FISHING;
        this.bv.y -= K.G * dt;
        this.bv.multiplyScalar(1 - 0.6 * dt);
        this.b.addScaledVector(this.bv, dt);
        _d.subVectors(this.b, _tip);
        const L = _d.length();
        if (L > K.HANG) { _d.multiplyScalar(1 / L); this.b.copy(_tip).addScaledVector(_d, K.HANG); const out = this.bv.dot(_d); if (out > 0) this.bv.addScaledVector(_d, -out); }
        // the swing: the tip fast and forward; at the top of it (the speed falls) the line is let go
        const sp = this.tipV.length(), S = this.swing;
        if (sp > K.CAST_V) {
            if (sp > S.peak) { S.peak = sp; S.v.copy(this.tipV); }
            else if (sp < S.peak * K.CAST_END && !this.game.swim?.swimming) {
                const c = castVelocity(S.v, face);
                S.peak = 0;
                if (c) this._launch(c);
            }
        } else if (sp < K.CAST_V * 0.45) S.peak = 0;
    }
    _launch(c) {
        this.bv.set(c.x, c.y, c.z);
        this.b.copy(_tip).addScaledVector(_d.set(0, -0.2, 0), 1);
        this._to('cast');
        this.lineOut = 0;
        this.game.sound?.playHit?.(); // (a whip through the air)
    }

    // ---- in the air
    _cast(dt) {
        const K = FISHING, g = this.game;
        let steps = Math.max(1, Math.ceil(dt / 0.016)); const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            this.bv.y -= K.G * h;
            this.bv.multiplyScalar(1 - K.DRAG * h);
            this.b.addScaledVector(this.bv, h);
            const w = this.waterUnder(this.b.x, this.b.z, this.b.y);
            if (w && this.b.y <= w.surface && this.bv.y < 0) { this._land(w); return; }
            const gy = this._ground(this.b.x, this.b.z, this.b.y);
            if (this.b.y <= gy + 0.15 && !w) { this.b.y = gy + 0.15; this.bv.set(0, 0, 0); this._to('ground'); this.lineOut = _d.subVectors(this.b, _tip).length(); return; }
            if (_d.subVectors(this.b, _tip).length() > K.LINE_MAX) { this.bv.y = Math.min(this.bv.y, 0); this.bv.x *= 0.3; this.bv.z *= 0.3; }
        }
        void g;
    }
    _land(w) {
        const K = FISHING;
        this.b.y = w.surface;
        this.bv.set(0, 0, 0);
        this.water = w;
        this.lineOut = _d.subVectors(this.b, _tip).length() * 1.04 + 0.5;
        this._splash(this.b, 12, Math.min(1.4, 0.6 + this.bv.length() * 0.03));
        this._ring(this.b.x, w.surface, this.b.z, 1.8, 1.8);
        this.wait = biteWait(Math.random, K);
        this._to('float');
    }

    // ---- on the water
    _float(dt) {
        const K = FISHING, w = this.waterUnder(this.b.x, this.b.z, this.b.y + 1);
        if (!w) { this._to('back'); this._startBack(); return; } // (the water is gone — a drained pond, a closed sea: wound in)
        this.water = w;
        this.b.y = w.surface + Math.sin(this.t * 2.1 + this.b.x) * 0.025; // (it rides the swell: the sea's wave is in `surface`)
        const dist = _d.subVectors(this.b, _tip).length();
        this.lineOut = Math.max(this.lineOut, dist);
        // wound in by a pull: the rod's tip dragged away fast, nothing on the hook
        const away = this._tipAway();
        if (away > K.RETRIEVE_V && this.stateT > 0.6) { this._startBack(); this._to('back'); return; }
        this.wait -= dt;
        if (this.wait <= 0) this._startBite();
    }
    _tipAway() { _d.subVectors(_tip, this.b); const n = _d.length() || 1; return this.tipV.dot(_d.multiplyScalar(1 / n)); }

    _startBite() {
        const w = this.water, K = FISHING;
        const sp = pickSpecies(FISH_SPECIES, { depth: w.depth, sea: w.sea });
        const len = fishLength(sp);
        this.bite = { sp, len, phase: 'nibble', t: 0, rings: 0 };
        this.log.push('bite:' + sp.id);
        this._to('bite');
        void K;
    }
    _biteStep(dt) {
        const K = FISHING.BITE, B = this.bite, w = this.waterUnder(this.b.x, this.b.z, this.b.y + 1);
        if (!B || !w) { this._to('float'); this.wait = biteWait(); return; }
        B.t += dt;
        this.water = w;
        // the nibble: small dips; then the pull under
        let dip = 0;
        if (B.phase === 'nibble') {
            dip = 0.1 * Math.max(0, Math.sin(B.t * 14)) * (1 - B.t / K.FIRST_TUG);
            if (B.t > K.FIRST_TUG) { B.phase = 'dip'; B.t = 0; this._ring(this.b.x, w.surface, this.b.z, 1.2, 1.2); this._splash(this.b, 4, 0.4); }
        } else {
            dip = Math.min(0.36, B.t * 2.6) + 0.04 * Math.sin(B.t * 11);
            if (Math.floor(B.t / 0.4) > B.rings) { B.rings++; this._ring(this.b.x, w.surface, this.b.z, 1.3 + 0.2 * B.rings, 1.3); }
        }
        this.b.y = w.surface - dip + Math.sin(this.t * 2.1) * 0.015;
        const back = _a.subVectors(_tip, this.b).setY(0); const bl = back.length() || 1; back.multiplyScalar(1 / bl);
        if (isStrike(this.tipV, back)) {
            if (B.phase === 'dip') { this._hook(); return; }
            // too early: a jerk at the nibble scares it off
            this.bite = null; this.wait = biteWait() + 3; this._to('float'); return;
        }
        if (B.phase === 'dip' && B.t > K.WINDOW) { this.bite = null; this.wait = biteWait(); this._ring(this.b.x, w.surface, this.b.z, 1.6, 1.6); this._to('float'); } // (it took the bait and went)
    }

    // ---- the hook is set
    _hook() {
        const B = this.bite, w = this.water, K = FISHING;
        const { strength, stamina } = fishStrength(B.sp, B.len);
        this.fish = { sp: B.sp, len: B.len, dir: Math.atan2(this.b.x - _tip.x, this.b.z - _tip.z), turn: 0, depth: Math.min(w.depth - 0.4, 0.7 + Math.random() * 1.2), burstT: 0 };
        const line = _d.subVectors(this.b, _tip).length();
        this.fight = newFight(line, strength, stamina);
        this.lastLine = line;
        this.bite = null;
        this.log.push('hook:' + B.sp.id);
        this._splash(this.b, 10, 0.9);
        this._ring(this.b.x, w.surface, this.b.z, 1.6, 1.4);
        if (!this.fishMesh) { this.fishMesh = fishItemMesh(B.sp, B.len * FISH_VIS); this.group.add(this.fishMesh); }
        this._to('fight');
        void K;
    }
    _fightStep(dt) {
        const K = FISHING, F = this.fight, fish = this.fish, w = this.waterUnder(this.b.x, this.b.z, this.b.y + 1) || this.water;
        if (!F || !fish || !w) { this._release('escaped'); return; }
        this.water = w;
        // the fish: runs in bursts, turns this way and that (a real tug: the hand feels the line pull)
        fish.turn += (Math.sin(this.t * 1.7 + F.seed) * 0.9 - fish.turn) * Math.min(1, dt * 2);
        fish.dir += fish.turn * dt;
        // where it is: on the line's end, away from the tip, at its depth (lifted when the line is shorter than the way down)
        const dy = _tip.y - (w.surface - fish.depth);
        const away = this._lineAway(dt);
        const catchAt = Math.hypot(dy, 2.4);
        const r = fightStep(F, dt, away, K.FIGHT, catchAt);
        F.line = Math.max(F.line, Math.min(dy * 0.5, catchAt * 0.6)); // (never inside the pier)
        const line = F.line;
        const hz = Math.sqrt(Math.max(0, line * line - dy * dy));
        const sx = Math.sin(fish.dir), sz = Math.cos(fish.dir);
        const y = line > dy ? w.surface - fish.depth : _tip.y - line * 0.95; // (the line shorter than the depth: it comes up under the tip)
        this.b.set(_tip.x + sx * hz, Math.max(w.surface - 0.1, y > w.surface ? w.surface - 0.05 : y + fish.depth * 0 + 0.0), _tip.z + sz * hz);
        this.b.y = w.surface - 0.05 + Math.sin(this.t * 9) * 0.04; // (the float skips over the water: the fish is under it)
        this._fishAt = _p.set(this.b.x, w.surface - Math.min(fish.depth, 0.7 + (1 - F.stamina) * 0.1), this.b.z).clone();
        if (Math.random() < dt * (1.2 + 3 * (1 - F.stamina))) { this._ring(this.b.x, w.surface, this.b.z, 1 + Math.random(), 1.1); if (Math.random() < 0.4) this._splash(this.b, 4, 0.5); }
        this.tension = F.tension;
        if (r === 'caught') this._catch();
        else if (r) this._release(r);
    }
    /** How fast the rod's tip goes away from the fish now (m/s): the pump (lifted: +) and the winding (lowered: −). */
    _lineAway() {
        _d.subVectors(_tip, this.b); const n = _d.length() || 1;
        return this.tipV.dot(_d.multiplyScalar(1 / n));
    }
    _release(why) {
        const sp = this.fish?.sp;
        this.log.push('lost:' + why);
        if (why === 'snapped') this._say('🎣 Леска порвалась — слишком резко!');
        else if (why === 'slack') this._say('🎣 Рыба сорвалась с крючка — леска ослабла');
        else this._say('🎣 Рыба ушла');
        this._splash(this.b, 8, 0.8);
        void sp;
        this.fight = null; this.fish = null;
        if (this.fishMesh) { this.fishMesh.parent?.remove(this.fishMesh); this.fishMesh = null; }
        this._startBack(); this._to('back');
    }

    // ---- landed: the fish comes up out of the water, in an arc, on to the ground by the hero
    _catch() {
        const g = this.game, fish = this.fish, sp = fish.sp, w = this.water;
        const item = makeFishItem(sp, fish.len, newUid());
        const hero = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const tx = hero.x - Math.sin(yaw) * 2.2, tz = hero.z - Math.cos(yaw) * 2.2;
        const ty = this._ground(tx, tz, hero.y) + 0.4;
        const from = _p.copy(this._fishAt || this.b); from.y = Math.max(from.y, w.surface);
        const T = 0.85, GG = 24;
        const vel = new THREE.Vector3((tx - from.x) / T, (ty - from.y) / T + 0.5 * GG * T, (tz - from.z) / T);
        this._splash(from, 16, 1.2);
        this._ring(from.x, w.surface, from.z, 2.4, 1.8);
        g.items?.spawnLoose?.(item, from.clone(), { vel, spin: new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4) });
        this._say(`🎣 Поймана: ${sp.name}, ${Math.round(fish.len * 100)} см`);
        this.log.push('caught:' + sp.id);
        this.caught = (this.caught || 0) + 1;
        this.fight = null; this.fish = null;
        if (this.fishMesh) { this.fishMesh.parent?.remove(this.fishMesh); this.fishMesh = null; }
        this._startBack(); this._to('back');
    }

    // ---- the line wound back to the rod
    _startBack() { this.back = { from: this.b.clone(), t: 0, T: FISHING.RETRIEVE_T }; }
    _backStep(dt) {
        const B = this.back || (this.back = { from: this.b.clone(), t: 0, T: FISHING.RETRIEVE_T });
        B.t += dt;
        const k = Math.min(1, B.t / B.T), e = k * k * (3 - 2 * k);
        _d.set(_tip.x, _tip.y - FISHING.HANG, _tip.z);
        this.b.lerpVectors(B.from, _d, e);
        this.b.y += Math.sin(k * Math.PI) * 0.8; // (it skips up out of the water and flies back)
        if (k >= 1) { this.b.copy(_d); this.bv.set(0, 0, 0); this.back = null; this._to('rig'); }
    }
    _ground2(dt) {
        if (this.stateT > FISHING.LAND_WAIT) { this._startBack(); this._to('back'); }
        void dt;
    }

    // ---------------------------------------------------------------- the picture
    _bendRod(h, tension) {
        const m = h?.model;
        if (!m?.userData?.bend) return;
        if (!(tension > 0) || !this.fight) { m.userData.bend(0, 0, 0); return; }
        // the rod leans towards the fish (in the rod's own frame): the direction tip → float, taken into the model's space
        _d.subVectors(this.b, _tip);
        const inv = _m.copy(m.matrixWorld).invert();
        _a.copy(_d).transformDirection(inv); // (a direction: no translation, unit)
        m.userData.bend(_a.x, _a.z, rodBend(tension));
    }

    _draw(h, dt) {
        const g = this.group;
        this._bendRod(h, this.state === 'fight' ? this.tension || 0 : 0);
        h.model.updateWorldMatrix(true, true);
        h.model.userData.tip.getWorldPosition(_tip); // (the tip after the bend)
        // the float
        this.floatM.position.copy(this.b);
        this.floatM.scale.setScalar(1);
        this.floatM.rotation.set(0, 0, 0);
        if (this.state === 'fight' || this.state === 'bite') this.floatM.rotation.z = Math.sin(this.t * 7) * 0.25;
        // the line: from the tip to the float, sagging by its slack (the heavier the sag, the more line is out)
        const hang = this.state === 'rig' || this.state === 'back';
        const dist = _d.subVectors(this.b, _tip).length();
        let sag;
        if (hang) sag = 0.03 * dist;
        else if (this.state === 'fight') sag = 0.015 * dist;
        else if (this.state === 'cast') sag = 0.05 * dist;
        else sag = Math.sqrt(Math.max(0, this.lineOut - dist) * Math.max(dist, 1)) * 0.5 + 0.02 * dist;
        const top = this.floatM.userData.hookY ? 0 : 0;
        void top;
        const A = _a.copy(_tip), Bp = _b.copy(this.b).add(_v.set(0, FISHING.FLOAT_R * 2.65 * 0 - FISHING.FLOAT_R * 1.0, 0)); // (the line ties at the foot's ring)
        let prev = _p.copy(A), n = 0;
        const out = new THREE.Vector3();
        for (let i = 1; i <= LINE_SEGS; i++) {
            const s = i / LINE_SEGS;
            out.lerpVectors(A, Bp, s); out.y -= sag * 4 * s * (1 - s);
            _w.subVectors(out, prev); const len = _w.length();
            if (len > 1e-5) {
                _q.setFromUnitVectors(_up, _w.multiplyScalar(1 / len));
                _s.set(1, len, 1);
                _m.compose(_v.copy(prev).addScaledVector(_w, len * 0.5), _q, _s);
                this.line.setMatrixAt(n++, _m);
            }
            prev.copy(out);
        }
        for (let i = n; i < LINE_SEGS; i++) { _m.makeScale(0, 0, 0); this.line.setMatrixAt(i, _m); }
        this.line.instanceMatrix.needsUpdate = true;
        // the fish under the float (a hooked one: thrashing, nose away from the rod)
        if (this.fishMesh && this._fishAt && this.fish) {
            const f = this.fish;
            this.fishMesh.position.copy(this._fishAt);
            this.fishMesh.rotation.set(0, Math.atan2(-Math.sin(f.dir), -Math.cos(f.dir)) + Math.sin(this.t * 10) * 0.35, Math.sin(this.t * 13) * 0.25);
            this.fishMesh.scale.setScalar(f.len * FISH_VIS);
        }
        // the rings on the water
        for (const r of this.rings) {
            if (!r.visible) continue;
            const u = r.userData; u.t += dt;
            const k = u.t / u.dur;
            if (k >= 1) { r.visible = false; continue; }
            r.scale.setScalar(0.15 + k * u.size * 2.2);
            r.material.opacity = 0.55 * (1 - k) * (1 - k);
        }
        void g;
    }

    dispose() {
        this.reset();
        if (this.group) { this.group.parent?.remove(this.group); this.line?.dispose(); for (const r of this.rings) r.material.dispose(); this.group = null; }
    }
}
