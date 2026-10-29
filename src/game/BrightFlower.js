/**
 * BrightFlower.js — the mind of the Brightflower («Ярколето», a kind of Plants.js; rules and numbers: PlantLife.BRIGHT / BRIGHT_TARGETS,
 * the look: fx/BrightFlowerFx.js).
 *
 *   Calm      the cup breathes: shut ~8 s, open ~14 s (PlantLife.brightOpen — the same wall clock on every computer); open, a tongue of
 *             flame burns in it, its light is one of FireLights' (no light of its own), sparks rise, a tree or dry block within 3 m
 *             of the flame may catch (the fire spreads by its own rules, world/Fire.js).
 *   Angry     touched (a creature within 0.95 m of the stem) / struck / hit by a spell → ~8 s: the cup opens wide, TURNS on the
 *             offender and breathes fire: a cone 11.5 m long, 3.5 HP/s together with the burning (1.5 breath + 2 burning), creatures in it
 *             flee burning. Fire does not anger it (it is made of fire); cold and water put it to sleep (shut, no flame) for 12 s.
 *   Network   the host decides who is angry / asleep and tells the others 5 times a second ('b'); every computer draws the cup and the
 *             breath itself and decides about ITS OWN player (damage, burning), the host about everybody else.
 */
import * as THREE from 'three';
import { BRIGHT, brightOpen } from './PlantLife.js';
import { crowdNear } from './CrowdSources.js';
import { BrightFlowerFx } from '../fx/BrightFlowerFx.js';
import { BF } from '../fx/BrightFlowerModel.js';

export const BRIGHT_RANGE = { DRAW: 100, THINK: 60, SPARK: 40 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _top = new THREE.Vector3(), _dir = new THREE.Vector3();
const wall = () => Date.now() / 1000;

/** Pure: the unit direction the cup looks along (up when calm) and whether the target is in reach. `from`, `foe`: {x, y, z}. */
export function cupLook(from, foe, out = { x: 0, y: 1, z: 0, reach: false, dist: 0 }) {
    if (!foe) { out.x = 0; out.y = 1; out.z = 0; out.reach = false; out.dist = 0; return out; }
    let dx = foe.x - from.x, dy = foe.y - from.y, dz = foe.z - from.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    dx /= d; dy /= d; dz /= d;
    // (the cup cannot look below ~10° under the horizon: the neck is a stem)
    if (dy < -0.17) { const h = Math.hypot(dx, dz) || 1, k = Math.sqrt(1 - 0.17 * 0.17) / h; dx *= k; dz *= k; dy = -0.17; }
    out.x = dx; out.y = dy; out.z = dz; out.dist = d; out.reach = d <= BRIGHT.BREATH_R;
    return out;
}

/** Pure: is a point inside the fire cone of a breath from `top` along unit `dir`? `r`: the body's radius. */
export function inBreath(top, dir, p, r = 0.7) {
    const rx = p.x - top.x, ry = p.y - top.y, rz = p.z - top.z;
    const along = rx * dir.x + ry * dir.y + rz * dir.z;
    if (along < -r || along > BRIGHT.BREATH_R + r) return false;
    const px = rx - dir.x * along, py = ry - dir.y * along, pz = rz - dir.z * along;
    return Math.hypot(px, py, pz) <= BRIGHT.BREATH_W * 0.5 + Math.max(0, along) * BRIGHT.CONE + r;
}

export class BrightFlowers {
    /** @param plants the Plants system (it owns the places, the hits, the death and the network) */
    constructor(plants) {
        this.plants = plants;
        this._fx = null; // (made when the first flower is drawn: an old world has none)
        this._list = [];
        this._buf = [];
        this._sendT = 0; this._lastSent = 0;
        this._tick = 0;
    }
    get fx() { return this._fx || (this._fx = new BrightFlowerFx(this.plants.game.scene)); }
    get game() { return this.plants.game; }
    get auth() { return this.plants.auth; }

    /** A new flower's state. */
    init(p) {
        p.bf = { ph: (p.phase * 0.37) % 1, open: 0, flame: 0, angryT: 0, sleepT: 0, foeId: null, foe: null, look: { x: 0, y: 1, z: 0, reach: false, dist: 0 }, dir: new THREE.Vector3(0, 1, 0), tickT: 0, igniteT: Math.random() * BRIGHT.IGNITE_EVERY, whooshT: 0, sparkT: 0, wasOpen: false, heat: 0, hurtT: 0 };
        p.bf.open = brightOpen(wall(), p.bf.ph);
    }

    // ============================================================ provoking (any computer asks; the host decides)
    /** Take offence at `by` (a player id, or null: whoever is near / `at` {x, y, z}). */
    anger(p, by = null, at = null) {
        const bf = p.bf;
        if (!bf || p.dead || bf.sleepT > 0) return;
        if (!this.auth) { this.plants._send({ op: 'anger', id: p.id, by: by || this.game.localId }); return; }
        const was = bf.angryT > 0;
        bf.angryT = BRIGHT.ANGRY_T;
        bf.foeId = by;
        if (at) bf.foe = { x: at.x, y: at.y, z: at.z };
        if (!was) this.game.sound?.playPlant?.(_v.set(p.x, p.y + 1.6 * p.s, p.z), 'flare', 1);
    }
    /** Cold or water: sleep. */
    sleep(p) {
        const bf = p.bf;
        if (!bf || p.dead) return;
        if (!this.auth) { this.plants._send({ op: 'sleep', id: p.id }); return; }
        if (bf.sleepT <= 0) { this.game.sound?.playPlant?.(_v.set(p.x, p.y + 1.6 * p.s, p.z), 'hush', 1); this._puff(p, 0xbfe4ff); }
        bf.sleepT = BRIGHT.SLEEP_T; bf.angryT = 0; bf.foe = null; bf.foeId = null;
    }
    douse(o, r) {
        for (const p of this.plants.near) if (p.kind === 'brightflower' && !p.dead && Math.hypot(p.x - o.x, p.z - o.z) <= r) this.sleep(p);
    }
    _puff(p, color) {
        const fx = this.game.fx;
        this.top(p, _v);
        for (let i = 0; i < 10; i++) fx?.spark?.(_v, color, 0.14, _w.set((Math.random() - 0.5) * 2.5, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.5), 0.9);
    }

    /** World point of the cup's middle. */
    top(p, out) { return out.set(p.x, p.y + BF.STEM_H * p.s + 0.12 * p.s, p.z); }

    // ============================================================ the people the flower can see
    _people(out) {
        const g = this.game;
        out.length = 0;
        if (!g.isDeadLocal && !g.combat?.dead) out.push({ id: g.localId, x: g.character.group.position.x, y: g.character.group.position.y - 1.0, z: g.character.group.position.z });
        for (const [id, r] of g.remotes || []) if (r.position && !r.dead) out.push({ id, x: r.position.x, y: r.position.y - 1.0, z: r.position.z });
        return out;
    }
    /** (host) Who it faces: the offender if there; else the nearest person in sight; else the spot where a creature touched it. */
    _pickFoe(p, people) {
        const bf = p.bf, R2 = BRIGHT.SEE_R * BRIGHT.SEE_R;
        let best = null, bd = R2 + 1;
        for (const q of people) {
            const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
            if (bf.foeId != null && q.id === bf.foeId && d <= R2) return q;
            if (d < bd) { bd = d; best = q; }
        }
        if (bf.foe && !bf.foeId) return bf.foe;
        return best && bd <= R2 ? best : null;
    }

    // ============================================================ per frame
    /** Every drawn flower: its state, its look; the near ones think too. Called from Plants.update. */
    update(dt, me) {
        const P = this.plants, g = this.game, t = wall();
        this._tick++;
        const night = g.world?._night || 0;
        const list = this._list; list.length = 0;
        let people = null;
        for (const grp of P.groups.values()) {
            if (!grp || grp.kind !== 'brightflower') continue;
            for (const p of grp.plants) {
                if (p.dead || !p.bf) continue;
                const dx = p.x - me.x, dz = p.z - me.z, d2 = dx * dx + dz * dz;
                if (d2 > BRIGHT_RANGE.DRAW * BRIGHT_RANGE.DRAW) continue;
                const bf = p.bf, near = d2 < BRIGHT_RANGE.THINK * BRIGHT_RANGE.THINK;
                if (near) people = people || this._people(this._buf);
                this._state(p, dt, near ? people : null, near, me);
                list.push({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, s: p.s, open: bf.open, flame: bf.flame, dx: bf.dir.x, dy: bf.dir.y, dz: bf.dir.z, ph: bf.ph * 6.283, heat: bf.heat });
            }
        }
        if (list.length || this._fx) this.fx.draw(list, P._clock, night);
        if (this.auth) this._snapshot(dt);
    }

    _state(p, dt, people, near, me) {
        const g = this.game, bf = p.bf, t = wall();
        if (bf.hurtT > 0) bf.hurtT -= dt;
        // ---- the host's decisions
        if (this.auth && near) {
            if (bf.sleepT > 0) bf.sleepT -= dt;
            if (bf.angryT > 0) { bf.angryT -= dt; if (bf.angryT <= 0) { bf.foe = null; bf.foeId = null; } }
            if ((this._tick + (p.phase | 0)) % 6 === 0 && bf.sleepT <= 0) this._touchedByCreatures(p);
        } else if (!this.auth) {
            if (bf.sleepT > 0) bf.sleepT -= dt;
            if (bf.angryT > 0) bf.angryT -= dt;
        }
        // me: I decide whether I touched it (on every computer)
        if (near && bf.sleepT <= 0 && !g.isDeadLocal && !g.combat?.dead && !g.flight?.active) {
            const dx = me.x - p.x, dz = me.z - p.z, feet = me.y - 2.0;
            if (dx * dx + dz * dz < (BRIGHT.TOUCH_R * p.s) ** 2 && feet > p.y - 0.6 && feet < p.y + p.H && bf.angryT < BRIGHT.ANGRY_T - 0.5) this.anger(p, g.localId);
        }
        // ---- what it does (same on every computer)
        const asleep = bf.sleepT > 0, angry = bf.angryT > 0 && !asleep;
        let target = asleep ? 0 : angry ? 1 : brightOpen(t, bf.ph);
        const k = Math.min(1, dt * (target > bf.open ? (angry ? 5 : 2.5) : 3));
        bf.open += (angry || asleep ? (target - bf.open) * k : target - bf.open);
        const fireOn = bf.open > BRIGHT.FIRE_OPEN && !asleep;
        const flameT = fireOn ? Math.min(1, (bf.open - BRIGHT.FIRE_OPEN) / 0.35) * (angry ? 1.5 : 1) : 0;
        bf.flame += (flameT - bf.flame) * Math.min(1, dt * 6);
        if (bf.flame < 0.01) bf.flame = 0;
        bf.heat += ((fireOn ? 1 : 0.15) - bf.heat) * Math.min(1, dt * 3);
        // opening / closing sounds (near ones)
        const open = bf.open > 0.5;
        if (open !== bf.wasOpen) {
            bf.wasOpen = open;
            if (near && !angry && !asleep) g.sound?.playPlant?.(this.top(p, _v), open ? 'flare' : 'hush', 0.55);
        }
        // where it looks
        let tx = 0, ty = 1, tz = 0;
        bf.breathing = false;
        if (angry && near && this.auth) {
            const foe = this._pickFoe(p, people || []);
            bf.foe = foe && !foe.id ? foe : bf.foe;
            bf.aim = foe ? { x: foe.x, y: foe.y, z: foe.z } : null;
        }
        if (angry && bf.aim) {
            cupLook(this.top(p, _top), bf.aim, bf.look);
            tx = bf.look.x; ty = bf.look.y; tz = bf.look.z;
            bf.breathing = bf.look.reach && bf.open > 0.8;
        } else if (!angry) bf.aim = null;
        const kd = Math.min(1, dt * 5);
        bf.dir.x += (tx - bf.dir.x) * kd; bf.dir.y += (ty - bf.dir.y) * kd; bf.dir.z += (tz - bf.dir.z) * kd;
        bf.dir.normalize();
        if (!near) return;
        // ---- light, sparks, the breath
        this.top(p, _top);
        if (bf.flame > 0.15) g.fireLights?.want(_top.x, _top.y + 0.35 * p.s, _top.z, 0.35 + 0.45 * Math.min(1, bf.flame));
        const dMe = Math.hypot(p.x - me.x, p.z - me.z);
        if (dMe < BRIGHT_RANGE.SPARK && bf.flame > 0.2) {
            bf.sparkT -= dt;
            const rate = bf.breathing ? 0.025 : 0.11;
            while (bf.sparkT <= 0) {
                bf.sparkT += rate;
                const col = [0xff7a1a, 0xffb02e, 0xffe27a, 0xff4a0e][(Math.random() * 4) | 0];
                if (bf.breathing) {
                    _w.copy(bf.dir).multiplyScalar(7 + Math.random() * 7).add(_v.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4));
                    g.fx?.spark?.(_dir.copy(_top).addScaledVector(bf.dir, 0.4), col, 0.2 + Math.random() * 0.18, _w, 0.7);
                } else {
                    _w.set((Math.random() - 0.5) * 0.7, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.7);
                    g.fx?.spark?.(_dir.copy(_top).add(_v.set((Math.random() - 0.5) * 0.4 * p.s, 0.5 * p.s * bf.flame, (Math.random() - 0.5) * 0.4 * p.s)), col, 0.09 + Math.random() * 0.07, _w, 1.1);
                }
            }
        }
        if (bf.breathing) {
            bf.whooshT -= dt;
            if (bf.whooshT <= 0) { bf.whooshT = 1.5; g.sound?.playPlant?.(_top, 'whoosh', 1); }
            this._breath(p, dt, me);
        } else bf.tickT = 0;
        // (host) a tree or dry block next to a burning flower may catch — carefully: now and then, within 3 m; the fire then spreads by its own rules
        if (this.auth && bf.flame > 0.8 && !g.isSpaceBlocked) {
            bf.igniteT -= dt;
            if (bf.igniteT <= 0) {
                bf.igniteT = BRIGHT.IGNITE_EVERY;
                if (Math.random() < 0.15) g.fire?.ignite?.({ x: _top.x, y: _top.y, z: _top.z }, 0);
            }
        }
    }

    /** (host) A creature standing against the stem touches it. */
    _touchedByCreatures(p) {
        const g = this.game, R = BRIGHT.TOUCH_R * p.s + 0.3;
        if (p.bf.angryT > BRIGHT.ANGRY_T - 0.5) return;
        const list = crowdNear(g, p.x, p.y, p.z, R, null, 4, this._buf2 || (this._buf2 = []));
        for (const b of list) {
            if (b.kind === 'player' || b.kind === 'plant' || b.kind === 'dragon' || b.kind === 'tree') continue;
            if (Math.abs(b.y - p.y) > p.H + 1) continue;
            this.anger(p, null, { x: b.x, y: b.y + 1, z: b.z });
            return;
        }
    }

    /** The breath: my own player (on my computer), and — the host — the creatures in the cone. */
    _breath(p, dt, me) {
        const g = this.game, bf = p.bf, top = _top, dir = bf.dir;
        bf.tickT -= dt;
        if (bf.tickT > 0) return;
        bf.tickT = BRIGHT.TICK;
        const dmg = BRIGHT.DPS * BRIGHT.TICK;
        // me
        if (!g.isDeadLocal && !g.combat?.dead) {
            _v.set(me.x, me.y - 1.0, me.z);
            if (inBreath(top, dir, _v, 0.9) && !g.invis?.isInvisible?.(g.localId) && !g.godMode) {
                if (g.combat?.enabled) g.combat.damage(dmg, null, 'fire'); else g.damageLocalPlayer?.(dmg, 'fire');
                g.burning?.ignite?.('p', g.localId, null);
            }
        }
        if (!this.auth) return;
        // the host: everybody else in the cone burns and is hurt
        g.burning?.igniteRay?.(top, dir, BRIGHT.BREATH_R, BRIGHT.BREATH_W * 0.5 + 0.8, null);
        g.fire?.igniteAlong?.(top, dir, BRIGHT.BREATH_R * 0.7);
        const list = crowdNear(g, top.x, top.y, top.z, BRIGHT.BREATH_R + 2, null, 24, this._buf3 || (this._buf3 = []));
        for (const b of list) {
            if (b.kind === 'player' || b.kind === 'plant' || b.kind === 'dragon' || b.kind === 'tree' || b.kind === 'iceQueen') continue;
            _v.set(b.x, b.y + 0.9, b.z);
            if (!inBreath(top, dir, _v, b.r || 0.7)) continue;
            const o = b.ref;
            _w.set(b.x - top.x, 0, b.z - top.z).normalize();
            if (b.kind === 'animal' && !o.dead) g.animals.hit(o, dmg, _w, null);
            else if (b.kind === 'zombie' && !o.isDead) g.damageZombie?.(o, dmg, false, _w, null);
            else if (b.kind === 'man' && !o.dead) g.castleLife?.hit?.(o, dmg, _w, null, { kind: 'fire' });
        }
    }

    // ============================================================ the network
    _snapshot(dt) {
        this._sendT -= dt;
        if (this._sendT > 0 || !this.game.sync?.net) return;
        this._sendT = 0.2;
        const l = [];
        for (const p of this.plants.near) {
            if (p.kind !== 'brightflower' || p.dead || !p.bf) continue;
            const bf = p.bf;
            if (bf.angryT > 0 || bf.sleepT > 0) l.push([p.id, Math.round(bf.angryT * 10) / 10, Math.round(bf.sleepT * 10) / 10, bf.aim ? Math.round(bf.aim.x * 10) / 10 : 0, bf.aim ? Math.round(bf.aim.y * 10) / 10 : 0, bf.aim ? Math.round(bf.aim.z * 10) / 10 : 0, bf.aim ? 1 : 0]);
        }
        if (!l.length && !this._lastSent) return;
        this._lastSent = l.length;
        this.plants._send({ op: 'b', l, all: 1 });
    }
    /** (a guest) The host's word about the angry / sleeping flowers. */
    onNet(m) {
        if (m.op === 'b') {
            const seen = new Set();
            for (const e of m.l || []) {
                const p = this.plants.byId.get(e[0]);
                if (!p || p.dead || !p.bf) continue;
                seen.add(p);
                p.bf.angryT = e[1]; p.bf.sleepT = e[2];
                p.bf.aim = e[6] ? { x: e[3], y: e[4], z: e[5] } : null;
            }
            for (const p of this.plants.near) if (p.kind === 'brightflower' && p.bf && !seen.has(p) && (p.bf.angryT > 0 || p.bf.sleepT > 0)) { p.bf.angryT = 0; p.bf.sleepT = 0; p.bf.aim = null; }
        } else if (m.op === 'anger' && this.auth) { const p = this.plants.byId.get(m.id); if (p) this.anger(p, m.by || null); }
        else if (m.op === 'sleep' && this.auth) { const p = this.plants.byId.get(m.id); if (p) this.sleep(p); }
    }

    sampleModel() { return this.fx.sampleModel(); }
    dispose() { this._fx?.dispose(); }
}
