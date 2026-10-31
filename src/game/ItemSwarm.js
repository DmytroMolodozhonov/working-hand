/**
 * ItemSwarm.js — «дирижёр предметов»: «Вингардиум Левиоса Максима» pointed at a thing lying about.
 *
 *   The words ONCE: the first thing obeys. Then the wand only points at others — each one rests under it
 *   for DWELL s and rises too (up to SWARM.MAX_ITEMS). They do not stick to the hand: they hang in the air,
 *   bobbing a little, and follow the wand in a chain, in the order they were lifted (ItemSwarmRules.SwarmSim).
 *   Modes (all one swarm, the hand and two words choose):
 *     train   the wand leads, the things follow it (the default)
 *     orbit   the hand goes round and round → the things wind round the hero in rings, as fast as the hand
 *             (the same SwingMeter as «Water Vortex»); the hand stops circling → back to the train
 *     shield  «Shield» («Щит»): the things close into a wall in front of the hero where the wand points; a spell
 *             or a blow from that side hits the THINGS (Combat.shieldFactor/_blocked ask `faces`/`took`)
 *     attack  «Атак»: the things fly one after another at the one the wand points at (or along it)
 *   Mana: the spell's own 50 + 2 a second, and SWARM.PER_ITEM a second for each thing after the first (cap
 *   SWARM.CAP). «Стоп», out of mana, the caster's death: everything falls (Items' physics, with collisions).
 *   Things: Items.loose only (not gifts of the gods, not unpaid goods, not what «Акцио» is bringing). Earth is not
 *   taken (that is «Ground Vortex»). Weapons, books, book-birds: the plain «Левиоса».
 *   Network: things are the host's (Items.auth): the swarm runs on the host's computer and the others see every
 *   thing move through Items' own positions (10×/s…); the host decides every blow. A guest does not lift things yet
 *   (as with the plain «Левиоса»).
 *   «На кого и на что»: ItemSwarmRules.SWARM_TARGETS.
 */

import * as THREE from 'three';
import { SwingMeter } from './WaterVortex.js';
import { SWARM, SwarmSim, ModeKeeper, swarmDrain, itemRefusal, aimedAt, hitDamage, hitPush, absorbOf, wallBreaks } from './ItemSwarmRules.js';
import { ITEM_INFO } from './ItemTypes.js';
import { isDivine } from './ProtectionGods.js';

const _h = new THREE.Vector3(), _d = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3();
const TAU = Math.PI * 2;
/** Creature kinds (Duel._bodies) a flying thing hurts, and those it only bounces off; the rest it flies past. */
const HURT = new Set(['z', 'v', 'a', 'c', 'p']);
const SOLID = new Set(['t', 's', 'D', 'I']);

export class ItemSwarm {
    constructor(game) {
        this.game = game;
        this.sim = null;
        this.side = 'right';
        this.by = null;
        this.meter = new SwingMeter();
        this.keeper = new ModeKeeper();
        this._t = 0;
        this._scan = 0;
        this._dwell = null; // {uid, t}
        this._bodies = [];
        // the magic cord joining the things of the train: one line, no lights (shader warmed in Game.prewarm)
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SWARM.MAX_ITEMS + 1) * 2 * 3), 3));
        geo.setDrawRange(0, 0);
        this.cord = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.cord.frustumCulled = false;
        this.cord.visible = false;
    }

    get active() { return !!this.sim; }
    get n() { return this.sim ? this.sim.size : 0; }
    get mode() { return this.sim?.mode || null; }
    /** The mana a second the things cost besides the spell's own. */
    get extraDrain() { return this.sim ? swarmDrain(this.sim.size) : 0; }
    get auth() { const g = this.game; return !!g.items?.auth; }

    sampleModels() { return [this.cord]; }

    // ================================================================ aim
    _hand(side) {
        const ch = this.game.character;
        return { o: ch.getHandWorldPosition(side, _h), d: ch.getHandDirection(side, _d) };
    }

    /** Things the wand can take: [{id, x, y, z, r}] near the hand (the host's loose things that may join). */
    _candidates(o, range) {
        const g = this.game, out = [];
        if (!g.items?.auth) return out;
        const r2 = range * range;
        for (const L of g.items.loose.values()) {
            const p = L.model.position;
            const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            if (itemRefusal(L)) continue;
            out.push({ id: L.item.uid, x: p.x, y: p.y, z: p.z, r: 0.45 });
        }
        return out;
    }

    /**
     * (the cast) The thing the wand points at, if any: {uid, d} — or {no: reason} for a thing that can't join.
     * Used by LevitationMaxima.pick (a creature or a house pointed at wins over a loose thing farther away).
     */
    pickThing(o, d) {
        const g = this.game;
        if (!g.items?.auth) return null;
        const best = aimedAt(this._candidates(o, SWARM.RANGE), o, d);
        if (best) return { uid: best.id, d: best.d };
        // (a thing the spell can't take, pointed at: say why)
        const r2 = SWARM.RANGE * SWARM.RANGE;
        const near = [];
        for (const L of g.items.loose.values()) {
            const p = L.model.position;
            if (p.distanceToSquared(o) > r2 || !itemRefusal(L)) continue;
            near.push({ id: L.item.uid, x: p.x, y: p.y, z: p.z, r: 0.45 });
        }
        const bad = aimedAt(near, o, d);
        if (bad) return { no: itemRefusal(g.items.loose.get(bad.id)), d: bad.d };
        return null;
    }

    // ================================================================ start / end
    /** (my computer) The spell began on a loose thing. → true when the swarm is up. */
    start(side, uid, by) {
        const g = this.game;
        const L = g.items?.loose?.get(uid);
        if (!L || itemRefusal(L) || this.sim) return false;
        this.sim = new SwarmSim();
        this.side = side;
        this.by = by;
        this.meter.reset();
        this.keeper = new ModeKeeper();
        this._dwell = null;
        this._t = 0;
        this._scan = 0;
        this._take(L);
        if (!this.cord.parent) g.scene?.add(this.cord);
        return true;
    }

    _take(L) {
        const g = this.game;
        const p = L.model.position;
        if (!this.sim.add(L.item.uid, p)) return false;
        L.lev = true; L.swarm = true; L.hover = null; L.rest = false; L.sentRest = false; L.vel?.set?.(0, 0, 0);
        this._burst(p, 14);
        g.sound?.playBombardoCast?.();
        return true;
    }

    /** Everything is let go (stop, out of mana, said again → gently). */
    release(gentle) {
        const sim = this.sim;
        if (!sim) return;
        this.sim = null;
        this.cord.visible = false;
        this.cord.geometry.setDrawRange(0, 0);
        this.game.scene?.remove(this.cord);
        for (const e of sim.drop(gentle)) this._free(e.m.id, e.vx, e.vy, e.vz);
    }

    /** A thing goes back to the world's physics with a speed (it falls, bounces and lies like any thing). */
    _free(uid, vx, vy, vz) {
        const L = this.game.items?.loose?.get(uid);
        if (!L) return;
        L.lev = false; L.swarm = false; L.rest = false; L.sentRest = false;
        (L.vel || (L.vel = new THREE.Vector3())).set(vx, vy, vz);
        L.noPick = performance.now() + 500;
        L.thrower = null;
    }

    // ================================================================ words
    /** «Shield» / «Щит» while the swarm is up. → 'Protection' (cast) | null. */
    shield(isFinal = true) {
        const sim = this.sim, g = this.game;
        if (!sim) return null;
        // (the same words heard twice — the half-heard phrase and the whole one — are one: not «up» and «down» again)
        const now = performance.now();
        if (now - (this._shT || -1e9) < 1500) return 'Protection';
        this._shT = now;
        if (sim.mode === 'shield') {
            sim.mode = 'train';
            if (isFinal) g.hud?.setVoice?.('🪶 Щит опущен — вещи снова идут за палочкой', true);
            return 'Protection';
        }
        if (sim.size < SWARM.SHIELD_MIN) { if (isFinal) g.hud?.setVoice?.(`🛡️ Для щита нужно хотя бы ${SWARM.SHIELD_MIN} вещи — укажите палочкой на ещё`, true); return null; }
        const { d } = this._hand(this.side);
        sim.wallYaw = Math.atan2(d.x, d.z);
        sim.mode = 'shield';
        this.keeper.off = 0;
        this._burst(g.character.group.position, 18);
        if (isFinal) g.hud?.setVoice?.('🛡️ Щит из вещей! Он встаёт там, куда смотрит палочка. «Атак» — запустить вещи в цель', true);
        return 'Protection';
    }

    /** «Атак»: the things fly one after another at the one the wand points at (or along it). → 'Attack' | null. */
    attack(isFinal = true) {
        const sim = this.sim, g = this.game;
        if (!sim) return null;
        if (!sim.members.some((m) => !m.fly && !m.out)) { if (isFinal) g.hud?.setVoice?.('🪶 Нечем атаковать — поднимите вещи', true); return null; }
        if (!this.auth) return null;
        const { o, d } = this._hand(this.side);
        const t = this._aimBody(o, d);
        const I = { aim: t ? { x: t.x, y: t.y, z: t.z } : null, dir: { x: d.x, y: d.y, z: d.z } };
        const n = sim.launch(I, t ? t.id : null);
        if (isFinal) g.hud?.setVoice?.(`⚔️ Атак! Вещи летят: ${n}`, true);
        return 'Attack';
    }

    /** The creature the wand points at best → its place (Duel's bodies), or null. */
    _aimBody(o, d) {
        const g = this.game;
        const list = this._bodyList(true);
        let best = null;
        for (const b of list) {
            if (!HURT.has(b.kind) && !SOLID.has(b.kind)) continue;
            if (b.id === this._selfId()) continue;
            _w.set(b.x - o.x, b.y - o.y, b.z - o.z);
            const dist = _w.length();
            if (dist > SWARM.LAUNCH_RANGE || dist < 1) continue;
            const ang = d.angleTo(_w.normalize());
            const lim = 0.22 + Math.atan2(b.r + 0.6, dist);
            if (ang > lim) continue;
            const score = ang - Math.atan2(b.r, dist) * 0.5 + dist * 0.002;
            if (!best || score < best.score) best = { ...b, score };
        }
        return best;
    }

    _selfId() { return 'p:' + this.game.localId; }

    /** Creatures as upright capsules for the flying things: [{id, kind, cid, x, y, z, r, hy}]. */
    _bodyList(always = false) {
        const g = this.game;
        const bodies = g.duel?._bodies?.(null);
        const out = this._bodies;
        out.length = 0;
        if (!bodies) return out;
        for (const b of bodies) {
            if (!HURT.has(b.kind) && !SOLID.has(b.kind)) continue;
            out.push({ id: b.kind + ':' + b.id, kind: b.kind, cid: b.id, x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2, z: (b.a.z + b.b.z) / 2, r: b.r, hy: Math.abs(b.a.y - b.b.y) / 2 + b.r });
        }
        return out;
    }

    // ================================================================ shield: the wall takes a blow
    /** Does the wall stand between me and `from` (a point in the world)? Combat.shieldFactor asks. */
    faces(from) {
        const sim = this.sim;
        if (!sim || sim.mode !== 'shield') return false;
        const c = this.game.character.group.position;
        return sim.faces(from.x - c.x, from.z - c.z);
    }

    /**
     * A blow from `from` of this `kind` landed in the wall (Combat._blocked): the thing in line takes it.
     * → true: held; false: the wall could not hold it (a divine spell sweeps the things aside — it goes on to me).
     */
    took(from, kind) {
        const sim = this.sim, g = this.game;
        if (!sim) return false;
        const c = g.character.group.position;
        const dx = from.x - c.x, dz = from.z - c.z;
        if (kind === 'DevilBall' || kind === 'DevilFist') {
            // шар / кулак Дьяволоса: щит из вещей сломан целиком (DiabolosRules.ballVerdict) — вещи разлетаются, рой снова паровозиком; «Shield» — сказать снова
            for (let i = 0; i < 3; i++) sim.absorb(dx, dz, 99);
            sim.mode = 'train';
            g.hud?.setVoice?.('💥 Шар Дьяволоса разметал щит из вещей — вас не задело. Скажите «Shield» снова', true);
            return true;
        }
        if (wallBreaks(isDivine(kind))) {
            // the gods' spells: the wall is swept away
            for (let i = 0; i < 3; i++) sim.absorb(dx, dz, 99);
            g.hud?.setVoice?.('✨ Божественное заклинание смело вещи', true);
            return false;
        }
        const r = sim.absorb(dx, dz, absorbOf(kind));
        if (!r) return false;
        const L = g.items?.loose?.get(r.m.id);
        if (L) {
            const p = L.model.position;
            for (let i = 0; i < 18; i++) g.fx?.spark(p, i % 2 ? 0xffe9a8 : 0xc9a8ff, 0.12, _b.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.4);
            g.fx?.lightFlash?.(p, 0xc9a8ff, 1.5, 0.15, 12);
        }
        g.sound?.playFrozenHit?.();
        g.hud?.setVoice?.(r.broke ? '🪶 Вещь выбита из щита и падает' : '🛡️ Вещи приняли удар', true);
        return true;
    }

    // ================================================================ frame
    update(dt) {
        const sim = this.sim, g = this.game;
        if (!sim) return;
        if (!this.auth) { this.release(false); return; } // (a guest does not hold things; the host does)
        const ch = g.character;
        this._t += dt;
        // things taken by a hand, burnt, given away: gone from the swarm
        for (let i = sim.members.length - 1; i >= 0; i--) {
            const m = sim.members[i];
            const L = g.items.loose.get(m.id);
            if (!L) sim.remove(m.id);
            else if (!L.lev) sim.remove(m.id); // (somebody else's spell took it away)
        }
        // the hand
        const { o, d } = this._hand(this.side);
        const body = ch.group.position;
        _b.copy(o).sub(body);
        this.meter.push(this._t, _b);
        const rate = this.meter.rate;
        const was = sim.mode;
        sim.mode = this.keeper.next(sim.mode, rate, dt);
        if (was === 'train' && sim.mode === 'orbit') g.hud?.setVoice?.('🌀 Вихрь вещей! Крутите рукой — быстрее, пока не остановитесь; «Атак» — запустить, «Щит» — прикрыться', true);
        if (was === 'launch' && !sim.members.length && !sim._volley.length) sim.mode = 'train';
        if (sim.mode === 'launch' && !sim.members.length) sim.mode = 'train';
        // taking more things: the wand rests on one for DWELL s
        this._scan -= dt;
        if (this._scan <= 0 && sim.mode !== 'launch' && sim.size < SWARM.MAX_ITEMS) { this._scan = 0.1; this._pickMore(o, d); }
        // the world: collisions and floors
        const I = this._I || this._makeI();
        I.head.x = o.x + d.x * SWARM.HOLD; I.head.y = o.y + d.y * SWARM.HOLD; I.head.z = o.z + d.z * SWARM.HOLD;
        I.body.x = body.x; I.body.y = body.y + 0.6; I.body.z = body.z;
        const ay = this.meter.axis.y;
        I.omega = (rate * TAU) * (ay > 0.05 ? -1 : 1);
        I.wandYaw = Math.atan2(d.x, d.z);
        I.selfId = this._selfId();
        I.bodies = sim.mode === 'launch' || sim.flying().length ? this._bodyList() : this._bodies;
        const ev = sim.step(dt, I);
        // the things in their places
        let k = 0;
        const arr = this.cord.geometry.attributes.position.array;
        let prevP = null;
        for (const m of sim.members) {
            const L = g.items.loose.get(m.id);
            if (!L) continue;
            const mp = L.model.position;
            mp.set(m.x, m.y, m.z);
            this._pose(L, m, dt);
            if (sim.mode === 'train' && !m.fly && !m.out) {
                if (!prevP) { arr[k++] = o.x; arr[k++] = o.y; arr[k++] = o.z; arr[k++] = mp.x; arr[k++] = mp.y; arr[k++] = mp.z; }
                else { arr[k++] = prevP.x; arr[k++] = prevP.y; arr[k++] = prevP.z; arr[k++] = mp.x; arr[k++] = mp.y; arr[k++] = mp.z; }
                prevP = mp;
            }
            if (m.kick) m.kick = Math.max(0, m.kick - dt * 4);
            if (Math.random() < dt * 2.5) g.fx?.spark(_b.set(mp.x + (Math.random() - 0.5) * 0.6, mp.y + (Math.random() - 0.5) * 0.6, mp.z + (Math.random() - 0.5) * 0.6), Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.07, _w.set(0, 0.5, 0), 0.6);
        }
        this.cord.visible = k > 0;
        this.cord.geometry.setDrawRange(0, k / 3);
        this.cord.geometry.attributes.position.needsUpdate = true;
        for (const e of ev) this._event(e);
        // finished things fall by themselves from here
        for (let i = sim.members.length - 1; i >= 0; i--) {
            const m = sim.members[i];
            if (!m.done) continue;
            sim.members.splice(i, 1);
            this._free(m.id, m.vx, m.vy, m.vz);
        }
    }

    /** The world as the swarm sees it (made once: nothing new every frame). */
    _makeI() {
        const g = this.game;
        return (this._I = {
            head: { x: 0, y: 0, z: 0 }, body: { x: 0, y: 0, z: 0 },
            blocked: (x, y, z) => !!g.collision?.pointBlocked?.(x, y, z),
            floorY: (x, z, y) => { const c = g.collision; return c ? (c.groundAt ? c.groundAt(x, z, y + 0.5) : c.groundY(x, z)) : -1e9; },
        });
    }

    /** One thing hangs: a slow turn of its own, a little sway; in flight it points along its path. */
    _pose(L, m, dt) {
        const q = L.model;
        if (m.fly) {
            _w.set(m.fly.dx, m.fly.dy, m.fly.dz);
            q.rotation.y += dt * 9;
            return;
        }
        q.rotation.y += dt * (0.6 + (m.ph % 1) * 0.8) * (this.sim.mode === 'orbit' ? 2.5 : 1);
        q.rotation.x += (Math.sin(this._t * 1.7 + m.ph) * 0.25 - q.rotation.x) * Math.min(1, dt * 3) + (m.kick || 0) * dt * 12 * (m.ph % 2 > 1 ? 1 : -1);
        q.rotation.z += (Math.cos(this._t * 1.3 + m.ph) * 0.2 - q.rotation.z) * Math.min(1, dt * 3);
    }

    /** The wand rests on a thing: after DWELL s it joins. */
    _pickMore(o, d) {
        const g = this.game, sim = this.sim;
        const best = aimedAt(this._candidates(o, SWARM.RANGE).filter((c) => !sim.has(c.id)), o, d);
        if (!best) { this._dwell = null; return; }
        if (!this._dwell || this._dwell.uid !== best.id) { this._dwell = { uid: best.id, t: 0 }; return; }
        this._dwell.t += 0.1;
        if (this._dwell.t < SWARM.DWELL) return;
        const L = g.items.loose.get(best.id);
        this._dwell = null;
        if (L && !itemRefusal(L)) {
            this._take(L);
            if (sim.size === SWARM.MAX_ITEMS) g.hud?.setVoice?.(`🪶 Поднято ${SWARM.MAX_ITEMS} — больше рой не удержит`, true);
        }
    }

    // ================================================================ blows
    /** (host) A flying thing met a creature (or only a hard body). */
    _event(e) {
        const g = this.game;
        if (e.type !== 'hit') return;
        const b = e.body;
        const L = g.items?.loose?.get(e.m.id);
        if (!L) return;
        const p = L.model.position;
        for (let i = 0; i < 10; i++) g.fx?.spark(p, 0xffe9a8, 0.1, _b.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5), 0.35);
        if (!HURT.has(b.kind)) return; // (a dragon, the spider, a tree, an ice monster: it bounces off — SWARM_TARGETS)
        const weight = ITEM_INFO[L.item.kind]?.weight ?? 1;
        const dmg = hitDamage(weight, e.v);
        const push = hitPush(weight, e.v);
        const vel = _d.set(e.dir.x * e.v, e.dir.y * e.v, e.dir.z * e.v);
        const by = g.localId;
        if (b.kind === 'p') {
            const r = g.remotes?.get(b.cid);
            if (r) g.combat?.hitRemote?.({ id: b.cid, damageCooldown: 0, group: r.character.group }, dmg, false);
            return;
        }
        const c = g.duel?._creature?.(b.kind, b.cid);
        if (!c) return;
        g.levitation?._hurt?.(b.kind, c, dmg, by, vel, p);
        g.creatureImpact?.apply?.(c, { v: new THREE.Vector3(e.dir.x * push, 0, e.dir.z * push), by, kind: 'swarm', noShield: true, from: p.clone(), always: weight >= 3 ? { down: 1.5 } : null });
    }

    /** (any computer) Particles round a spot. */
    _burst(p, n) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) fx.spark(p, i % 2 ? 0xffe9a8 : 0xc9a8ff, 0.12, _b.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3), 0.8);
    }

    dispose() {
        this.release(false);
        this.cord.geometry.dispose();
        this.cord.material.dispose();
    }
}
