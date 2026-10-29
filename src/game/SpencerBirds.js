/**
 * SpencerBirds.js — the bird of Spencer (rules and the table «who / what»: SpencerRules.js; the look: fx/InvisibleModels.js).
 *
 * A small, ALWAYS invisible bird — rose-pink and glowing to one who has gone through the pentagram of seeing (SecondSight.js, Invisibles.js). About as many as
 * the book-birds (4 near a hero), but ONLY near a player who sees the invisible; nobody else even draws it. It flies from tree to tree, perches, hops and
 * sings; nothing special. «Империус Максима» can take it (ImperiusFlyers.js, adapter 'sx'). Killed, it leaves ONE feather (also invisible): the ingredient of the
 * circle of seeing; the feather is sold in the market of magic things (WizardMarket).
 *
 * The host flies the birds and decides every harm; a guest sends its harm to the host (`spx` messages) and follows the host's places. Every computer draws
 * a bird only if ITS hero sees the invisible (`model.visible`); the shared material is see-through (~15 %) and shimmers (Invisibles.ghostAlpha).
 *
 * What can go wrong (CLAUDE.md): the seer dies / is gone — the birds nobody sees are put away (nothing piles up); the host leaves — the guests keep nothing
 * (their copies are dropped when the host's list stops); a bird killed twice at once (two blasts) — `dead` is set first; a bird in an Imperius body is not
 * put away and does not think (the mind flies it); water / a wall under it — it flies above the highest thing (Animals._floor); off the Earth — none.
 */
import * as THREE from 'three';
import { SPENCER, verdict, DUEL_DEADLY } from './SpencerRules.js';
import { spencerBirdModel, poseSpencer, spencerMaterial, spencerHaloMaterial } from '../fx/InvisibleModels.js';
import { ghostAlpha, seers, seesInvisible } from './Invisibles.js';
import { newUid } from './ItemTypes.js';
import { earthly } from '../world/Planets.js';
import { isLeaves } from '../world/Terrain.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }, _c = new THREE.Vector3();
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (x) => Math.round(x * 100) / 100;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MODES = ['glide', 'fly', 'perch', 'hop', 'fall'];

/** Its body as a capsule (world): from the root of the tail to the head. */
export function spencerBody(o, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const t = o.model.userData.tilt;
    t.updateWorldMatrix(true, false);
    out.a.set(0, 0, -0.2).applyMatrix4(t.matrixWorld);
    out.b.set(0, 0.1, 0.3).applyMatrix4(t.matrixWorld);
    out.r = SPENCER.BODY_R;
    return out;
}

/** Its middle (where spells and arrows are aimed). */
export function spencerCenter(o, out = new THREE.Vector3()) {
    o.model.userData.tilt.updateWorldMatrix(true, false);
    return out.set(0, 0.05, 0.05).applyMatrix4(o.model.userData.tilt.matrixWorld);
}

export class SpencerBirds {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.enabled = game.config?.mode !== 'test';
        this._spawnT = 3;
        this._netT = 0;
        this.clock = 0;
        this.log = []; // (tests) what happened
        this._t = 0;
    }

    get auth() { return this.game.authority !== false; }
    get sees() { return seesInvisible(this.game); }
    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 60) this.log.shift(); }

    /** One of the look (Game.prewarm): the shapes, the material and the halo are made now, with the rest. */
    sampleModels() { return [spencerBirdModel()]; }

    // ------------------------------------------------------------ life
    spawn(pos, id = null) {
        const g = this.game;
        const model = spencerBirdModel();
        model.position.copy(pos);
        model.visible = this.sees;
        g.scene?.add(model);
        const o = {
            id: id ?? 'sx' + Math.floor(Math.random() * 1e9).toString(36), ck: 'S', isSpencer: true, model, group: model, hp: SPENCER.HP, dead: false,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => spencerBody(o, out),
            state: 'fly', t: 0, vel: new THREE.Vector3(), yaw: Math.random() * TAU, goal: pos.clone(), centre: pos.clone(), phase: rnd(...SPENCER.FLY), chirpT: rnd(...SPENCER.CHIRP),
            a: { mode: 'glide', seed: Math.random() * 6 }, flee: null, perchSpot: null,
        };
        // its parts for the hands' blows (BodyStrikes): the body
        const parts = [['body', () => model.userData.tilt, [0, 0, 0], [0.28, 0.2, 0.34]]];
        parts.model = model;
        o._strikeParts = parts;
        this.list.push(o);
        return o;
    }

    _remove(o) {
        this.game.scene?.remove(o.model);
        // (the shapes and the material are shared by every bird: nothing of its own to dispose)
        const i = this.list.indexOf(o);
        if (i >= 0) this.list.splice(i, 1);
    }

    targets() { return this.list.filter((o) => !o.dead); }
    byId(id) { return this.list.find((o) => o.id === id && !o.dead) || null; }

    _ground(x, z) {
        const g = this.game;
        const y = g.animals?._floor ? g.animals._floor(x, z) : g.collision?.groundY?.(x, z);
        return Number.isFinite(y) ? y : 0;
    }

    // ------------------------------------------------------------ harm
    /** A blow / a spell on it (any computer: a guest's goes to the host). */
    hit(o, dmg, kind = null, by = undefined) {
        if (!o || o.dead) return;
        const g = this.game;
        if (by === undefined) by = g.localId;
        if (!this.auth) { this._send({ op: 'hit', id: o.id, dmg: Math.round((+dmg || 0) * 10) / 10, kind }); return; }
        const v = verdict(kind, dmg, o.hp);
        this._note({ ev: 'hit', id: o.id, dmg, kind, v });
        if (v === 'die') { this._die(o, by); return; }
        if (v === 'hurt') o.hp = Math.max(0.01, o.hp - dmg);
        this._startle(o, by != null ? this._at(by) : null);
    }

    _at(by) {
        const g = this.game;
        if (by === g.localId || by === 'local') return g.character?.group?.position || null;
        return g.remotes?.get(by)?.position || null;
    }

    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth) return;
        for (const o of this.targets()) {
            const c = spencerBody(o, _cap);
            _v.copy(c.a).lerp(c.b, 0.5);
            if (_v.distanceTo(p) < radius + c.r) this.hit(o, dmg, kind, by);
        }
    }

    hitRay(org, d, len, width, dmg, kind, by = null) {
        if (!this.auth) return false;
        let any = false;
        for (const o of this.targets()) {
            const b = spencerBody(o, _cap);
            let hit = false;
            for (let k = 0; k <= 2 && !hit; k++) {
                const q = _w.lerpVectors(b.a, b.b, k / 2);
                const along = _v.subVectors(q, org).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(o, dmg, kind, by); any = true; }
        }
        return any;
    }

    /** A duel charge touched it: the deadly ones kill it, «Экспеллиармус», «Левиоса» only startle it. */
    boltHit(o, spell, by) {
        if (!o || o.dead) return;
        if (DUEL_DEADLY.has(spell)) this.hit(o, SPENCER.HP, spell, by); else this.hit(o, 0, spell, by);
    }

    /** It is startled: it darts away from `from` for a few seconds. */
    _startle(o, from) {
        if (o.imp) return;
        o.state = 'flee'; o.flee = { t: SPENCER.FLEE_T, from: from ? from.clone() : null };
    }

    _die(o, by) {
        if (o.dead) return;
        o.dead = true;
        const g = this.game;
        const p = spencerCenter(o, new THREE.Vector3());
        this._note({ ev: 'die', id: o.id, by });
        this._burst(p);
        o.model.visible = false;
        if (this.auth) {
            // its feather drifts down where it fell (an invisible thing: only a seer sees it lying there)
            for (let i = 0; i < SPENCER.FEATHERS; i++) g.items?.spawnLoose?.({ kind: 'spencerFeather', uid: newUid(), count: 1 }, p.clone(), { vel: _v.set((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5) });
            this._send({ op: 'die', id: o.id, p: [p.x, p.y, p.z].map(r2) });
            const killer = by === 'local' || by === 'H' ? g.localId : by;
            if (killer === g.localId && this.sees) g.hud?.setVoice?.('🪶 Птичка Спенсера упала. Остаётся её перо', true);
            else if (killer && g.remotes?.has(killer)) this._send({ op: 'note', to: killer, text: '🪶 Птичка Спенсера упала. Остаётся её перо' });
        }
        setTimeout(() => this._remove(o), 50);
    }

    /** Its rose feathers burst into the air (a seer sees it). */
    _burst(p) {
        if (!this.sees) return;
        const fx = this.game.fx;
        for (let i = 0; i < 36; i++) fx?.spark?.(p, [0xff7ab8, 0xffc4e0, 0xffffff, 0xb48cff][i % 4], 0.08 + Math.random() * 0.09, _v.set((Math.random() - 0.5) * 3.5, Math.random() * 2.5, (Math.random() - 0.5) * 3.5), 1.1 + Math.random() * 0.8);
    }

    // ------------------------------------------------------------ moving
    /** Flies towards `goal` (m/s speed), above the highest thing under it. */
    _fly(o, goal, speed, dt, { low = false, k = 2.6 } = {}) {
        const p = o.model.position;
        const to = _v.subVectors(goal, p), d = to.length();
        const want = d > 1e-3 ? to.multiplyScalar(Math.min(speed, d * 1.5 + 0.3) / d) : to.set(0, 0, 0);
        o.vel.lerp(want, 1 - Math.exp(-dt * k));
        p.addScaledVector(o.vel, dt);
        // never into anything: over the highest thing under it and a little ahead
        const gy = Math.max(this._ground(p.x, p.z), this._ground(p.x + o.vel.x * 0.8, p.z + o.vel.z * 0.8));
        if (!low && p.y < gy + 2.2) { p.y += Math.min(gy + 2.2 - p.y, 6 * dt); o.vel.y = Math.max(o.vel.y, 0); }
        if (p.y < gy) p.y = gy;
        const hs = Math.hypot(o.vel.x, o.vel.z);
        let turn = 0;
        if (hs > 0.4) { turn = angDiff(o.yaw, Math.atan2(o.vel.x, o.vel.z)); o.yaw += turn * Math.min(1, dt * 5); }
        o.model.rotation.y = o.yaw;
        o.a.roll = Math.max(-0.7, Math.min(0.7, (o.a.roll || 0) * 0.9 + (-turn * 1.6) * 0.1));
        o.a.pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(o.vel.y, Math.max(hs, 1)) * 0.8));
        o.a.mode = o.vel.y > 0.5 || hs < speed * 0.5 || (o.beat = (o.beat || 0) - dt) < 0 ? 'fly' : 'glide';
        if (o.beat < -0.8) o.beat = rnd(1.5, 3.5);
        return d;
    }

    /** A place to perch: a leafy crown (a tree), else the ground. */
    _perchNear(from, minD, maxD) {
        const g = this.game, data = g.terrain?.data;
        for (let i = 0; i < 24 && data; i++) {
            const a = Math.random() * TAU, d = minD + Math.random() * (maxD - minD);
            const x = Math.round(from.x + Math.cos(a) * d), z = Math.round(from.z + Math.sin(a) * d);
            if (!data.landMade?.(x, z)) continue; // (the land there is not made yet: not in the frame)
            const top = data.topLayer(x, z);
            if (isLeaves(data.get(x, top, z))) return new THREE.Vector3(x, top + 0.3, z);
        }
        const a = Math.random() * TAU, d = minD + Math.random() * (maxD - minD);
        const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
        return new THREE.Vector3(x, this._ground(x, z) + 0.05, z);
    }

    _think(o, dt) {
        const p = o.model.position;
        o.t += dt;
        o.chirpT -= dt;
        if (o.chirpT <= 0) { o.chirpT = rnd(...SPENCER.CHIRP); this._sound(o, 'chirp'); }
        switch (o.state) {
            case 'flee': {
                const F = o.flee || (o.flee = { t: 0, from: null });
                F.t -= dt;
                const away = F.from ? _w.set(p.x - F.from.x, 0, p.z - F.from.z) : _w.set(Math.cos(o.yaw), 0, Math.sin(o.yaw));
                away.normalize().multiplyScalar(30).add(p).setY(Math.max(p.y, this._ground(p.x, p.z) + 7));
                this._fly(o, away, SPENCER.SPEED * 1.8, dt, { k: 4 });
                o.a.mode = 'fly';
                if (F.t <= 0) { o.state = 'fly'; o.phase = rnd(...SPENCER.FLY); o.goal = this._wander(o); }
                break;
            }
            case 'land': {
                const S = o.perchSpot;
                if (!S) { o.state = 'fly'; break; }
                const hd = hdist(p, S);
                if (hd > 5) { this._fly(o, _c.set(S.x, S.y + Math.min(9, 2 + hd * 0.3), S.z), Math.min(SPENCER.SPEED * 1.2, 3 + hd * 0.6), dt, { low: true }); break; }
                this._fly(o, S, Math.max(1.8, hd * 1.2), dt, { low: true, k: 3.5 });
                o.a.mode = 'fly';
                if (p.distanceTo(S) < 0.3) { p.copy(S); o.vel.set(0, 0, 0); o.a.pitch = 0; o.a.roll = 0; o.state = 'perch'; o.t = 0; o.phase = rnd(...SPENCER.PERCH); this._sound(o, 'wings'); }
                break;
            }
            case 'perch': {
                o.a.mode = Math.sin(o.t * 0.6 + o.a.seed) > 0.6 ? 'hop' : 'perch';
                o.yaw += Math.sin(o.t * 0.7 + o.a.seed) * 0.4 * dt;
                o.model.rotation.y = o.yaw;
                if (o.t > o.phase) { o.state = 'fly'; o.t = 0; o.phase = rnd(...SPENCER.FLY); o.goal = this._wander(o); o.vel.set(0, 2.5, 0); this._sound(o, 'wings'); }
                break;
            }
            default: { // 'fly'
                const d = this._fly(o, o.goal, SPENCER.SPEED, dt);
                if (d < 2.5) o.goal = this._wander(o);
                if (o.t > o.phase) { o.perchSpot = this._perchNear(p, 12, 45); o.state = 'land'; o.t = 0; }
            }
        }
    }

    /** A next point to fly to: round its centre, high over the ground. */
    _wander(o) {
        const a = Math.random() * TAU, d = rnd(10, 38);
        const x = o.centre.x + Math.cos(a) * d, z = o.centre.z + Math.sin(a) * d;
        return new THREE.Vector3(x, this._ground(x, z) + rnd(...SPENCER.ALT), z);
    }

    _sound(o, kind) {
        if (!this.sees) return;
        const g = this.game;
        g.sound?.playSpencer?.(o.model.position, kind);
        if (this.auth && kind === 'chirp') this._send({ op: 'snd', id: o.id, k: kind });
    }

    // ------------------------------------------------------------ spawning (only near one who sees the invisible)
    _spawnTick(dt) {
        if (!this.enabled) return;
        this._spawnT -= dt;
        if (this._spawnT > 0) return;
        this._spawnT = SPENCER.SPAWN_T;
        const S = seers(this.game).filter((P) => earthly(P.pos));
        if (!S.length || this.list.length >= SPENCER.MAX || this.game.duelOnly) return;
        const P = S[Math.floor(Math.random() * S.length)];
        if (this.list.filter((o) => !o.dead && hdist(o.model.position, P.pos) < SPENCER.FORGET).length >= SPENCER.NEAR) return;
        const a = Math.random() * TAU, r = rnd(...SPENCER.SPAWN_R);
        const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        if (!this.game.terrain?.data?.landMade?.(Math.round(x), Math.round(z))) return; // (no land made there yet: a try later, never the land in the frame)
        const o = this.spawn(new THREE.Vector3(x, this._ground(x, z) + rnd(...SPENCER.ALT), z));
        o.centre.set(x, 0, z);
        o.goal = this._wander(o);
        this._note({ ev: 'spawn', id: o.id });
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        if (dt <= 0) return;
        this.clock += dt * 1000;
        this._t += dt;
        const sees = this.sees;
        if (this.auth) {
            this._spawnTick(dt);
            const S = seers(g);
            for (const o of [...this.list]) {
                if (o.dead) continue;
                if (o.imp && g.imperius?.step('sx', o, dt)) continue; // («Империус Максима»: a mind in it — ImperiusControl.step)
                // put away: far from every seer (nobody to see it; nothing piles up)
                if (!S.some((P) => hdist(P.pos, o.model.position) < SPENCER.FORGET)) { this._remove(o); continue; }
                this._think(o, dt);
            }
        } else {
            for (const o of this.list) {
                if (o.dead) continue;
                if (o.imp?.mine && g.imperius?.step('sx', o, dt)) continue;
                if (o.net) this._follow(o, dt);
            }
        }
        // the look: drawn only for one who sees; the shared material shimmers; the halo swells at night
        const me = g.character?.group?.position;
        if (sees) {
            const nightK = g.world?.nightAmount ?? 0, mat = spencerMaterial();
            mat.opacity = ghostAlpha(this._t, 0.7);
            mat.emissiveIntensity = 0.22 + 0.5 * nightK; // (by day a soft rose, at night it glows)
            const halo = spencerHaloMaterial();
            if (halo) halo.opacity = 0.28 + 0.4 * (0.25 + 0.75 * (g.world?.nightAmount ?? 0)) + 0.06 * Math.sin(this._t * 2.1);
        }
        for (const o of this.list) {
            if (o.dead) continue;
            const far = me ? o.model.position.distanceTo(me) > 150 : false;
            o.model.visible = sees && !far;
            if (!o.model.visible) continue;
            poseSpencer(o.model, o.a, dt);
        }
        this._netSend(dt);
    }

    // ------------------------------------------------------------ net
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'spx', ...m }, m.op !== 's'); }

    _netSend(dt) {
        if (!this.auth || !this.game.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.15;
        this._send({ op: 's', l: this.list.filter((o) => !o.dead).slice(0, 24).map((o) => [o.id, r2(o.model.position.x), r2(o.model.position.y), r2(o.model.position.z), r2(o.yaw), r2(o.a.pitch || 0), r2(o.a.roll || 0), Math.max(0, MODES.indexOf(o.a.mode)), r2(o.hp)]) });
    }

    /** (a guest) following the host's bird smoothly. */
    _follow(o, dt) {
        const n = o.net;
        o.model.position.lerp(n.p, Math.min(1, dt * 8));
        o.yaw += angDiff(o.yaw, n.yaw) * Math.min(1, dt * 8);
        o.model.rotation.y = o.yaw;
        o.a.pitch = n.pitch; o.a.roll = n.roll; o.a.mode = n.mode;
    }

    onNet(m, isHost) {
        const g = this.game;
        if (!m || typeof m.op !== 'string') return;
        switch (m.op) {
            case 's': {
                if (isHost) return;
                const seen = new Set();
                for (const e of (m.l || []).slice(0, 24)) {
                    const [id, x, y, z, yaw, pitch, roll, mode, hp] = e;
                    if (![x, y, z].every(Number.isFinite)) continue;
                    seen.add(id);
                    let o = this.list.find((q) => q.id === id);
                    if (!o) { o = this.spawn(new THREE.Vector3(x, y, z), id); o.yaw = yaw; }
                    o.net = { p: new THREE.Vector3(x, y, z), yaw, pitch, roll, mode: MODES[mode] || 'glide' };
                    o.hp = hp;
                }
                for (const o of [...this.list]) if (!seen.has(o.id) && !o.dead && !o.imp?.mine) this._remove(o);
                break;
            }
            case 'hit': if (isHost) { const o = this.byId(m.id); if (o) { if (DUEL_DEADLY.has(m.kind) && !m.dmg) this.boltHit(o, m.kind, m.from); else this.hit(o, Math.min(40, Math.max(0, +m.dmg || 0)), typeof m.kind === 'string' ? m.kind.slice(0, 30) : null, m.from); } } break;
            case 'snd': if (!isHost && this.sees) { const o = this.byId(m.id); if (o && typeof m.k === 'string') g.sound?.playSpencer?.(o.model.position, m.k); } break;
            case 'die': {
                const o = this.list.find((q) => q.id === m.id);
                if (Array.isArray(m.p) && this.sees) this._burst(_c.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0));
                if (o) { o.dead = true; o.model.visible = false; setTimeout(() => this._remove(o), 50); }
                break;
            }
            case 'note': if (m.to === g.localId && typeof m.text === 'string') g.hud?.setVoice?.(m.text.slice(0, 200), true); break;
        }
    }

    dispose() {
        for (const o of [...this.list]) this._remove(o);
    }
}
