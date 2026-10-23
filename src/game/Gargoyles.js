/**
 * Gargoyles.js — the infernal gargoyles of the pentagram «Пентаграмма адских горгулий» (the black mage's).
 * Rules and numbers: GargoyleRules.js (+ the table «на кого и на что», `TARGETS`); the look: GargoyleModel.js; the ritual's
 * fire, clouds and glow: GargoyleRitual.js; the voices: audio/GargoyleSounds.js; the pentagram's entry: PentagramGargoyles.js.
 *
 * The ritual (`startRitual`, on the SUMMONER's computer): the picture is drawn and good → if there are ≥ 150 mana (free in
 * Creative) they are taken at once, +1 to the black level (DarkMagic.addDark 'ritual') and the host begins it; with less
 * mana nothing is taken and nothing starts (the pentagram stays — stand in it with 150 mana later: `PentagramGargoyles`).
 * The host runs it: 5 s of hellfire (the ring of flame runs round and grows, an ember-light, a dread melody) → 30 gargoyles
 * burst out one after another, first straight up, then every way → the storm: black-crimson clouds over SKY_R m, ≤ 12 real
 * lightning strikes (as «Lightning Strike»: every «кто/что» of it; never at the summoner; the storm's own bolts never hurt
 * a gargoyle). Every computer shows the fire, the sky and the bolts (messages 'rit' / 'bolt').
 *
 * The creatures: the host thinks and hurts (hunt: a pass, a bite, a break, again; ≤ 3 on one victim; people sheltered under a
 * roof are not reachable — the buildings protect), the guests only follow the positions (like owls and animals). 40 HP; a
 * bite 3–5 (×1.4 on beasts), a shove; «Protection» holds it. They spare the SUMMONER for GRACE 20 s, then he is prey too. They
 * keep within LEASH 120 m of the pentagram, live 5–10 min and crumble into stone and ash (nothing is kept: ≤ 60 in the
 * world, the debris is a pool). Not in the world otherwise: no spawn, nothing saved.
 *
 * Who fights back: the knights of a castle (`knightStep`: they run under it and hit it when it is low), the wizards (a Jolt:
 * Duel._creature 'g'), the frightened run (`fright` 'monster', keyed by the gargoyle); a hurt animal flees as it always does.
 */

import * as THREE from 'three';
import { registerKind } from './CreatureImpact.js';
import { creditKill } from './Mana.js';
import { addDark } from './DarkMagic.js';
import { realmAt } from '../world/Planets.js';
import { RitualFx } from './GargoyleRitual.js';
import { gargoyleModel, poseGargoyle, gargoyleBody, gargoyleCenter, gargoyleDist, MODEL_SCALE, HIP, gargoyleStats } from './GargoyleModel.js';
import {
    GARGOYLE, TARGETS, PHASE, phaseAt, canStart, sparesSummoner, releasePlan, boltPlan, inDisc, rng, mayHunt, biteDamage, harmOf, roomFor, outOfLeash, grabChance, breakFree, isSpent,
} from './GargoyleRules.js';

export { TARGETS, GARGOYLE };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();
const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const DOWN = new THREE.Vector3(0, -1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const MODES = ['fly', 'glide', 'climb', 'hover', 'dive', 'bite', 'fall', 'stone'];
const FEET = HIP * MODEL_SCALE; // m from the hip to the soles (scale 1)
const SCAN_T = 0.4; // s between two looks at the victims
const DEBRIS = 160;

/** Mana kinds of «first kill»: Mana.MAGIC_KILL.gargoyle. */
export const KILL_KIND = 'gargoyle';

export class Gargoyles {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.rituals = [];
        this.enabled = game.config?.mode !== 'test';
        this.fx = new RitualFx(game);
        this.clock = 0;
        this._netT = 0;
        this._scanT = 0;
        this.victims = [];
        this.log = []; // (tests) what happened
        this._seq = 0;
        this._debris = this._makeDebris();
        this.spent = []; // [{x, y, z}] the pentagrams out of which all have flown: they never work again and stay scorched
    }

    get auth() { return this.game.authority !== false; }
    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 80) this.log.shift(); }

    /** One of each look (Game.prewarm): the gargoyle in its three materials, the flame wall, the glow, the clouds. */
    sampleModels() {
        const out = [gargoyleModel(0), gargoyleModel(1), gargoyleModel(2), ...this.fx.sampleModels()];
        if (this._debris?.mesh) out.push(new THREE.InstancedMesh(this._debris.mesh.geometry, this._debris.mesh.material, 1)); // (the chunks' own — instanced — shader)
        return out;
    }

    stats() { return gargoyleStats(); }

    // ============================================================ the ritual
    /**
     * (the summoner's computer) The picture of the pentagram is good — begin the ritual at `center` if there is the mana.
     * @returns {{ok:boolean, why?:string, need?:number}} not ok: nothing was taken (the picture stays; try again with mana)
     */
    startRitual(center, { by = this.game.localId, silent = false } = {}) {
        const g = this.game, c = g.combat;
        if (!this.enabled) return { ok: false, why: 'off' };
        if (!center || realmAt(center.x, center.y, center.z, g.space?.planets) !== 'earth') {
            if (!silent) g.hud?.setVoice?.('🜏 Здесь пентаграмма горгулий молчит', true);
            return { ok: false, why: 'realm' };
        }
        if (isSpent(this.spent, center.x, center.z)) {
            if (!silent) g.hud?.setVoice?.('🜏 Пентаграмма выжжена: из неё уже вылетели горгульи — больше она не действует', true);
            return { ok: false, why: 'spent' };
        }
        const free = !c?.enabled;
        const chk = canStart(c?.fatigue ?? 0, free);
        if (!chk.ok) {
            if (!silent) g.hud?.setVoice?.(`🜏 Нужно ${GARGOYLE.MANA} маны — пентаграмма горит, но ритуал не начался (встаньте в круг, когда наберёте)`, true);
            return { ok: false, why: 'mana', need: chk.need };
        }
        if (this.rituals.some((r) => hdist(r.c, center) < 30 && r.t < GARGOYLE.FIRE_T + GARGOYLE.RELEASE_T + 20)) return { ok: false, why: 'busy' };
        if (!free) c.fatigue = Math.max(0, c.fatigue - GARGOYLE.MANA); // (taken the moment the ritual starts)
        addDark(g.dark, 1, 'ritual'); // (+1 to the black level — DarkMagic.js)
        const seed = (Math.random() * 1e9) | 0;
        const p = [r1(center.x), r1(center.y), r1(center.z)];
        if (this.auth) this._begin(p, by, seed);
        else this._send({ op: 'req', c: p, by, seed });
        return { ok: true };
    }

    /** (host) The ritual begins: everybody sees the fire; the host will bring the gargoyles out. */
    _begin(p, by, seed) {
        if (!this.auth) return;
        const g = this.game;
        const n = roomFor(this.list.filter((o) => !o.dead).length + this.rituals.reduce((s, r) => s + (r.plan ? r.plan.length - r.spawned : 0), 0));
        const r = this._makeRitual(`rt${++this._seq}${Math.floor(Math.random() * 1e6).toString(36)}`, p, by, seed, n);
        this._send({ op: 'rit', id: r.id, c: p, by, seed, n });
        this._note({ ev: 'ritual', id: r.id, n, by });
        // the people near feel it at once (a keyed danger of the monster kind; the wizards look)
        g.castleLife?.witnessCast?.(by, 'ritual');
        g.castleLife?.alarm?.(r.c, 'monster', by, 50);
    }

    _makeRitual(id, p, by, seed, n) {
        const r = {
            id, c: new THREE.Vector3(p[0], p[1], p[2]), by, seed, t: 0, spawned: 0, n,
            plan: releasePlan(seed, GARGOYLE.COUNT).slice(0, n), bolts: boltPlan(seed), boltI: 0, phase: PHASE.FIRE,
            snd: false, sndBurst: false,
        };
        this.rituals.push(r);
        this.game.sound?.playGargoyle?.(r.c, 'ignite', 1.2);
        this.game.hud?.setVoice?.('🜏 <span style="color:#ff5a2a">Адский огонь поднимается из пентаграммы…</span>', true);
        return r;
    }

    /** (every computer) The last gargoyle has flown out: the pentagram is spent — never again — and the ground round it goes black. */
    _spend(c, instant = false) {
        if (isSpent(this.spent, c.x, c.z)) return;
        this.spent.push({ x: c.x, y: c.y, z: c.z });
        if (this.spent.length > 64) this.spent.shift();
        this.fx.addScorch(c.x, c.y, c.z, instant);
        this._note({ ev: 'spent', x: c.x, z: c.z });
    }

    snapshot() { return this.spent.length ? { spent: this.spent.map((s) => [r1(s.x), r1(s.y), r1(s.z)]) } : null; }
    restore(sn) { for (const a of (sn?.spent || []).slice(0, 64)) this._spend({ x: +a[0] || 0, y: +a[1] || 0, z: +a[2] || 0 }, true); }

    _endRitual(r) {
        this.fx.release(r);
        const i = this.rituals.indexOf(r);
        if (i >= 0) this.rituals.splice(i, 1);
    }

    /** Where the world's own sky is made dark by the storm over the camera (Storm.update): 0 … 0.88. */
    skyDark() {
        if (!this.rituals.length) return 0;
        const cam = this.game.camera?.position;
        return cam ? this.fx.skyDark(this.rituals, cam) : 0;
    }

    /** A ritual's time: the fire, the release, the strikes (every computer runs the visuals; the host the creatures and the bolts). */
    _stepRitual(r, dt) {
        const g = this.game;
        r.t += dt;
        const ph = phaseAt(r.t);
        if (ph !== r.phase) {
            r.phase = ph;
            if (ph === PHASE.RELEASE) this.game.sound?.playGargoyle?.(r.c, 'burst', 1.2);
        }
        if (this.auth && r.plan && r.spawned >= r.plan.length && !r.spentDone) { r.spentDone = true; this._spend(r.c); this._send({ op: 'spent', c: [r1(r.c.x), r1(r.c.y), r1(r.c.z)] }); }
        if (this.auth) {
            while (r.spawned < r.plan.length && r.t >= GARGOYLE.FIRE_T + r.plan[r.spawned].delay) this._release(r, r.plan[r.spawned++]);
            while (r.boltI < r.bolts.length && r.t >= r.bolts[r.boltI].t) this._bolt(r, r.bolts[r.boltI++]);
        }
        if (ph === PHASE.DONE && !this.list.some((o) => o.rit === r.id && !o.dead && o.mode === 'rise')) this._endRitual(r);
        void g;
    }

    /** (host) One gargoyle bursts out of the circle. */
    _release(r, plan) {
        const x = r.c.x + (Math.random() - 0.5) * GARGOYLE.CIRCLE_R * 1.2, z = r.c.z + (Math.random() - 0.5) * GARGOYLE.CIRCLE_R * 1.2;
        const o = this.spawn(new THREE.Vector3(x, Math.max(r.c.y, this._ground(x, z)) + FEET + 0.4, z), { rit: r, plan });
        if (!o) return;
        o.mode = 'rise';
        this._note({ ev: 'release', id: o.id, rit: r.id });
        if (r.spawned % 6 === 1) this.game.sound?.playGargoyle?.(o.model.position, 'screech', 1);
    }

    /** (host) One strike of the storm (the same on every computer: the message 'bolt'). */
    _bolt(r, b) {
        const g = this.game;
        const q = rng(b.seed);
        let p = null;
        if (b.near) {
            this._scan(true);
            const vs = this.victims.filter((v) => hdist(v.pos, r.c) < GARGOYLE.SKY_R * 0.9 && !(v.k === 'p' && v.id === r.by));
            if (vs.length) {
                const v = vs[Math.floor(q() * vs.length)];
                const d = inDisc(q(), q(), 4);
                p = { x: v.pos.x + d.x, z: v.pos.z + d.z };
            }
        }
        if (!p) {
            for (let i = 0; i < 6; i++) {
                const d = inDisc(q(), q(), GARGOYLE.SKY_R * 0.92);
                p = { x: r.c.x + d.x, z: r.c.z + d.z };
                if (hdist(p, r.c) > 14) break; // (not on the summoner)
            }
        }
        const point = [r1(p.x), r1(this._ground(p.x, p.z)), r1(p.z)];
        this._send({ op: 'bolt', p: point, by: r.by });
        this._strike(point, r.by);
    }

    /** (every computer) The lightning comes down: «Lightning Strike»'s own bolt, damage and all its «кто/что»; the clouds flash. */
    _strike(point, by) {
        const g = this.game;
        _v.set(point[0], point[1], point[2]);
        this.fx.bolt(1);
        this._boltOn = true; // (the storm's own bolt does not hurt a gargoyle: hitAt skips it)
        try { g.spells?.cast('LightningHit', _v, DOWN, null, by); } finally { this._boltOn = false; }
    }

    // ============================================================ the creatures
    /** (host / guest by the host's list) A gargoyle at `pos`. `o.rit`: the ritual's id. null: no room. */
    spawn(pos, { rit = null, plan = null, id = null, variant = null, scale = null } = {}) {
        const g = this.game;
        if (this.list.length >= GARGOYLE.MAX + 4) return null;
        const var_ = variant ?? plan?.tint ?? Math.floor(Math.random() * 3);
        const model = gargoyleModel(var_);
        const sc = scale ?? plan?.scale ?? 1;
        model.scale.setScalar(MODEL_SCALE * sc);
        model.position.copy(pos);
        model.rotation.order = 'YXZ';
        g.scene?.add(model);
        const o = {
            id: id ?? 'gg' + (++this._seq) + Math.floor(Math.random() * 1e5).toString(36), ck: 'G', isGargoyle: true, model, group: model, hp: GARGOYLE.HP, dead: false,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => gargoyleBody(o, out),
            variant: var_, scale: sc, rit: rit?.id ?? null, by: rit?.by ?? null, home: rit ? rit.c.clone() : pos.clone(),
            age: 0, life: plan?.life ?? rnd(...GARGOYLE.LIFE), plan, mode: 'rise', t: 0, vel: new THREE.Vector3(), yaw: plan ? plan.bearing : Math.random() * 6.28, pitch: 0, roll: 0,
            a: { mode: 'climb', seed: plan?.flap ?? Math.random() * 6.28, span: 0.9 + Math.random() * 0.2, ph: plan?.flap ?? 0, bite: 0 },
            target: null, sub: 'approach', subT: 0, cd: rnd(0.2, 0.8), fireCd: rnd(4, 12), breathT: 0, carry: null, flameT: 0, slowT: 0, stunT: 0, aggro: null, alarmT: rnd(0, 1.2), rethink: 0, crumbleT: 0, flee: 0,
        };
        const sp = gargoyleBodyParts(o);
        o._strikeParts = sp;
        this.list.push(o);
        return o;
    }

    _remove(o) {
        if (o.carry) this._dropVictim(o, 'gone');
        this.game.scene?.remove(o.model);
        const U = o.model.userData;
        U.skel?.dispose?.(); // (its own bone texture; the shapes and materials are shared — never disposed)
        this.game.castleLife?.fright?.list?.delete('garg:' + o.id);
        const i = this.list.indexOf(o);
        if (i >= 0) this.list.splice(i, 1);
    }

    targets() { return this.list.filter((o) => !o.dead && o.mode !== 'crumble'); }
    byId(id) { return this.list.find((o) => o.id === id && !o.dead) || null; }

    // ============================================================ players and victims
    _player(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') {
            if (g.isDeadLocal || g.combat?.dead) return null;
            const ch = g.character;
            const pos = g.invis ? g.invis.aiPos(g.localId, ch.group.position) : ch.group.position;
            return pos ? { pos, yaw: ch.group.rotation.y } : null;
        }
        const r = g.remotes?.get(id);
        if (!r || r.dead) return null;
        const pos = g.invis ? g.invis.aiPos(id, r.position) : r.position;
        return pos ? { pos, yaw: r.character?.group.rotation.y ?? 0 } : null;
    }

    _ground(x, z) { const y = this.game.collision?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }

    /** Is a body at `p` under a roof (a house, a room, a cave)? Then a gargoyle cannot reach it. */
    _roofed(p) {
        const c = this.game.collision?.ceilingAt?.(p.x, p.z, p.y);
        return Number.isFinite(c) && c < p.y + 9;
    }

    /** (host) The prey near any ritual's home: players, castle people, animals, zombies, sailors — refreshed every SCAN_T s. */
    _scan(force = false) {
        const g = this.game;
        if (!force && this._scanT > 0) return;
        this._scanT = SCAN_T;
        const homes = this.list.length ? this.list.filter((o) => !o.dead).map((o) => o.home) : this.rituals.map((r) => r.c);
        const out = this.victims;
        out.length = 0;
        if (!homes.length) return;
        const R = GARGOYLE.LEASH + 30;
        const near = (p) => { for (const h of homes) if (Math.abs(p.x - h.x) < R && Math.abs(p.z - h.z) < R) return true; return false; };
        const add = (k, id, ref, pos, extra = null) => { if (near(pos)) out.push({ k, id, ref, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), roofed: this._roofed(pos), claims: 0, ...extra }); };
        const me = this._player(g.localId);
        if (me) add('p', g.localId, null, me.pos);
        for (const [id] of g.remotes || []) { const p = this._player(id); if (p) add('p', id, null, p.pos); }
        for (const v of g.castleLife?.byId?.values?.() || []) {
            if (v.dead || v.arena || v.imp?.mine || v.carriedBy) continue; // (one in a gargoyle's claws is not prey for the others)
            _v.set(v.x, v.y + 1.4, v.z);
            add('v', v.id, v, _v);
        }
        for (const a of g.animals?.list || []) if (!a.dead && a.group && !a.rider) add('a', a.id, a, a.group.position);
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying && z.group && !z.dummy) add('z', z.id, z, z.group.position);
        for (const s of g.ships?.crew?.byId?.values?.() || []) {
            if (s.dead) continue;
            _v.set(s.x, s.y + 1.4, s.z);
            add('s', s.id, s, _v);
        }
    }

    /** The victim `v` is still there (alive, in the list)? */
    _live(t) {
        const g = this.game;
        if (!t) return false;
        if (t.k === 'p') return !!this._player(t.id);
        if (t.k === 'v') return !!g.castleLife?.byId?.get?.(t.id) && !g.castleLife.byId.get(t.id).dead;
        if (t.k === 'a') return !t.ref.dead;
        if (t.k === 'z') return !t.ref.isDead;
        if (t.k === 's') return !t.ref.dead;
        return false;
    }

    _pick(o) {
        let best = null, bd = GARGOYLE.SEARCH;
        const p = o.model.position;
        const isSummoner = (v) => v.k === 'p' && v.id === o.by;
        for (const v of this.victims) {
            if (v.roofed || !mayHunt(v.k === 'p' ? 'player' : v.k === 'v' ? 'villager' : v.k === 'a' ? 'animal' : v.k === 'z' ? 'zombie' : 'sailor', { isSummoner: isSummoner(v), age: o.age })) continue;
            if (v.claims >= GARGOYLE.PACK && o.target?.key !== v.k + v.id) continue;
            const d = hdist(v.pos, p) + Math.abs(v.pos.y - p.y) * 0.4 - (o.aggro && o.aggro.id === v.id ? 20 : 0);
            if (d < bd && hdist(v.pos, o.home) < GARGOYLE.LEASH + 10) { bd = d; best = v; }
        }
        return best;
    }

    // ============================================================ harm TO a gargoyle
    /** A blow / a spell (any computer: a guest's goes to the host). Rules: GargoyleRules.harmOf, the table TARGETS. */
    hit(o, dmg, kind = null, by = undefined) {
        if (!o || o.dead || o.mode === 'crumble') return;
        const g = this.game;
        if (by === undefined) by = g.localId;
        if (!this.auth) { this._send({ op: 'hit', id: o.id, dmg: r1(+dmg || 0), kind }); this._sparks(o, 6, 0xff7030); return; }
        if (by === 'local' || by === 'H') by = g.localId;
        if (by != null && by !== g.localId && !g.remotes?.has(by)) by = null;
        if (this._boltOn && kind === 'Lightning') return; // (the ritual's own bolts are its own)
        if (o.imp?.immune?.(kind)) return;
        const h = harmOf(kind, dmg);
        this._note({ ev: 'harm', id: o.id, kind, does: h.does, dmg: h.dmg, by });
        if (h.does === 'none') {
            if (kind === 'AvadaKedavra') { g.fx?.lightFlash?.(gargoyleCenter(o, _v3), 0x2bff00, 4, 0.4, 20); this._sparks(o, 8, 0x40ff30); }
            return;
        }
        if (h.does === 'immune') { this._sparks(o, 5, 0xffb060); return; }
        if (h.does === 'push') return;
        this._provoked(o, by);
        if (h.does === 'slow') { o.slowT = Math.max(o.slowT, h.slow); this._sparks(o, 10, 0xbfe8ff); return; }
        if (h.does === 'kill') { this._die(o, by, true); return; }
        o.hp = Math.max(0, o.hp - h.dmg);
        this._sparks(o, 10, 0xff6a20);
        if (kind !== 'fall') this._sound(o, 'roar', 0.6);
        if (o.hp <= 0) this._die(o, by, true);
    }

    /** A blast at p: if it reaches the body. */
    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth || this._boltOn) return;
        for (const o of this.targets()) if (gargoyleDist(o, p) < radius) this.hit(o, dmg, kind, by ?? this._nearestTo(p));
    }

    /** A beam / a cone along org + d·t. */
    hitRay(org, d, len, width, dmg, kind, by = null) {
        if (!this.auth) return false;
        let any = false;
        for (const o of this.targets()) {
            const b = gargoyleBody(o, _cap);
            let hit = false;
            for (let k = 0; k <= 2 && !hit; k++) {
                const q = _v2.lerpVectors(b.a, b.b, k / 2);
                const along = _v.subVectors(q, org).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(o, dmg, kind, by ?? this._nearestTo(org)); any = true; }
        }
        return any;
    }

    /** A duel charge touched it (Duel._bodies / hit): the table says what each does; «Авада» does not act. */
    boltHit(o, spell, by) {
        if (!o || o.dead) return;
        const dmg = { Stupefy: 6, Jolt: 8, JoltMaxima: 20, Accentric: 40, Pilbidrio: 80, Electrum: 60, Die: 100, AvadaKedavra: 0, IceDuel: 0 }[spell] ?? 4;
        this.hit(o, dmg, spell, by);
    }

    /** Water reached it (a vortex, a storm, a wave): it only pushes — no harm. */
    watered(o, push = null, by = null) { if (o && !o.dead) this._provoked(o, by); }

    /** A house's sphere of protection turned it away (no harm). */
    shooed(o) { if (this.auth && o && !o.dead && o.mode !== 'crumble') { o.vel.addScaledVector(_v.subVectors(o.model.position, o.home).setY(0.3).normalize(), 8); o.stunT = Math.max(o.stunT, 0.4); } }

    /** Someone attacked it: it turns on them (never on its summoner in the first GRACE s). */
    _provoked(o, by) {
        if (by == null) return;
        if (by === o.by && sparesSummoner(o.age)) return;
        o.aggro = { id: by, until: this.clock + 9000 };
    }

    _nearestTo(p) {
        let best = null, bd = 14;
        for (const id of [this.game.localId, ...(this.game.remotes?.keys?.() || [])]) {
            const P = this._player(id);
            if (!P) continue;
            const d = P.pos.distanceTo(p);
            if (d < bd) { bd = d; best = id; }
        }
        return best;
    }

    _sparks(o, n, color) {
        const c = gargoyleCenter(o, _v3);
        for (let i = 0; i < n; i++) this.game.fx?.spark?.(c, color, 0.08 + Math.random() * 0.08, _d.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.6);
    }

    _sound(o, kind, vol = 1) {
        this.game.sound?.playGargoyle?.(o.model.position, kind, vol);
        if (this.auth && this.game.sync && (this._sndAt?.[kind] ?? 0) < this.clock - 400) { (this._sndAt || (this._sndAt = {}))[kind] = this.clock; this._send({ op: 'snd', k: kind, p: [r1(o.model.position.x), r1(o.model.position.y), r1(o.model.position.z)] }); }
    }

    /** It is killed: shatters into stone and embers (the divine spells too). */
    _die(o, by, shatter = true) {
        if (o.dead) return;
        if (o.carry) this._dropVictim(o, 'killed');
        o.dead = true;
        const g = this.game;
        const p = gargoyleCenter(o, new THREE.Vector3());
        this._note({ ev: 'die', id: o.id, by, shatter });
        this._shatter(p, o.scale, shatter);
        o.model.visible = false;
        if (this.auth) {
            this._send({ op: 'die', id: o.id, p: [r1(p.x), r1(p.y), r1(p.z)], s: shatter ? 1 : 0 });
            creditKill(g, by, { kind: KILL_KIND });
        }
        this._sound(o, shatter ? 'shatter' : 'crumble', 1);
        setTimeout(() => this._remove(o), 50);
    }

    // ============================================================ the stone chunks (a pool: nothing is made, nothing kept)
    _makeDebris() {
        const g = this.game;
        if (!g.scene) return null;
        const geo = new THREE.IcosahedronGeometry(0.2, 0);
        geo.userData.shared = true;
        const mat = new THREE.MeshLambertMaterial({ color: 0x8c3524, emissive: 0x3a0a02 });
        mat.userData.shared = true;
        const mesh = new THREE.InstancedMesh(geo, mat, DEBRIS);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.castShadow = false;
        g.scene.add(mesh);
        const D = { mesh, n: 0, px: new Float32Array(DEBRIS), py: new Float32Array(DEBRIS), pz: new Float32Array(DEBRIS), vx: new Float32Array(DEBRIS), vy: new Float32Array(DEBRIS), vz: new Float32Array(DEBRIS), rx: new Float32Array(DEBRIS), ry: new Float32Array(DEBRIS), sc: new Float32Array(DEBRIS), life: new Float32Array(DEBRIS), spin: new Float32Array(DEBRIS) };
        return D;
    }

    /** Chunks of stone fly out of `p` (embers and dust with them). `big`: a kill (more and faster) — or a crumbling (few, slow). */
    _shatter(p, scale = 1, big = true) {
        const D = this._debris, fx = this.game.fx;
        const n = big ? 16 : 5;
        if (D) {
            for (let k = 0; k < n; k++) {
                let i = D.n < DEBRIS ? D.n++ : Math.floor(Math.random() * DEBRIS); // (a full pool: an old chunk is replaced)
                D.px[i] = p.x + (Math.random() - 0.5) * 0.8; D.py[i] = p.y + (Math.random() - 0.3) * 0.8; D.pz[i] = p.z + (Math.random() - 0.5) * 0.8;
                const sp = big ? rnd(2, 8) : rnd(0.3, 2), a = Math.random() * 6.28;
                D.vx[i] = Math.cos(a) * sp; D.vz[i] = Math.sin(a) * sp; D.vy[i] = big ? rnd(1, 7) : rnd(0, 2);
                D.rx[i] = Math.random() * 6; D.ry[i] = Math.random() * 6; D.spin[i] = rnd(-8, 8);
                D.sc[i] = scale * (big ? rnd(0.5, 1.6) : rnd(0.3, 0.9)); D.life[i] = rnd(4, 8);
            }
            D.mesh.count = D.n;
        }
        const colors = [0xff6a1a, 0xffb040, 0xc01a10, 0x805040];
        for (let i = 0; i < (big ? 36 : 12); i++) fx?.spark?.(p, colors[i % 4], 0.08 + Math.random() * 0.14, _d.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9), 0.7 + Math.random() * 1.2);
    }

    _debrisStep(dt) {
        const D = this._debris;
        if (!D || !D.n) return;
        const col = this.game.collision;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = _v, sc = _v2;
        let alive = 0;
        for (let i = 0; i < D.n; i++) {
            if (D.life[i] <= 0) { // (finished: the last one takes its place — the list stays packed)
                D.n--;
                if (i < D.n) { for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'sc', 'life', 'spin']) D[k][i] = D[k][D.n]; i--; }
                continue;
            }
            D.life[i] -= dt;
            D.vy[i] -= 22 * dt;
            D.px[i] += D.vx[i] * dt; D.py[i] += D.vy[i] * dt; D.pz[i] += D.vz[i] * dt;
            const gy = col?.groundY?.(D.px[i], D.pz[i]) ?? 0;
            if (D.py[i] < gy + 0.12) { D.py[i] = gy + 0.12; if (D.vy[i] < -1.5) D.vy[i] *= -0.28; else D.vy[i] = 0; D.vx[i] *= 0.82; D.vz[i] *= 0.82; D.spin[i] *= 0.8; }
            D.rx[i] += D.spin[i] * dt; D.ry[i] += D.spin[i] * 0.6 * dt;
            const k = D.life[i] < 1 ? D.life[i] : 1; // (it shrinks away in the last second)
            const s = D.sc[i] * k;
            m.compose(pos.set(D.px[i], D.py[i], D.pz[i]), q.setFromEuler(e.set(D.rx[i], D.ry[i], 0)), sc.set(s, s * 0.8, s * 1.1));
            D.mesh.setMatrixAt(alive++, m);
        }
        D.mesh.count = alive;
        D.mesh.instanceMatrix.needsUpdate = true;
    }

    // ============================================================ the host's mind
    /** Flying towards `goal` at `speed`: steering, keeping off the ground and out of walls. */
    _fly(o, goal, speed, dt, { k = 3, minUp = 0 } = {}) {
        const p = o.model.position;
        const slow = o.slowT > 0 ? 0.5 : 1;
        const to = _v.subVectors(goal, p);
        const d = to.length();
        const want = d > 1e-3 ? to.multiplyScalar((Math.min(speed * slow, d * 2.2 + 0.5)) / d) : to.set(0, 0, 0);
        o.vel.lerp(want, 1 - Math.exp(-dt * k));
        // not through a wall: a look half a second ahead; blocked → up and round
        const col = this.game.collision;
        if (col?.pointBlocked) {
            const ax = p.x + o.vel.x * 0.5, ay = p.y + o.vel.y * 0.5, az = p.z + o.vel.z * 0.5;
            if (col.pointBlocked(ax, ay, az) || col.pointBlocked(p.x + o.vel.x * 0.25, p.y, p.z + o.vel.z * 0.25)) { o.vel.y += 22 * dt; o.vel.x *= 0.96; o.vel.z *= 0.96; o.blockedT = 0.4; }
        }
        p.addScaledVector(o.vel, dt);
        const gy = this._ground(p.x, p.z);
        const floor = gy + FEET * o.scale + 0.3 + minUp;
        if (p.y < floor) { p.y = floor; o.vel.y = Math.max(0, o.vel.y); }
    }

    /** Heading, pitch and bank from the velocity (and a face to turn to). */
    _orient(o, dt, face = null) {
        const hs = Math.hypot(o.vel.x, o.vel.z);
        let turn = 0;
        if (face) { const yw = Math.atan2(face.x - o.model.position.x, face.z - o.model.position.z); turn = angDiff(o.yaw, yw); o.yaw += turn * Math.min(1, dt * 9); }
        else if (hs > 0.5) { const yw = Math.atan2(o.vel.x, o.vel.z); turn = angDiff(o.yaw, yw); o.yaw += turn * Math.min(1, dt * 5); }
        const pitchT = Math.max(-0.9, Math.min(1.0, -Math.atan2(o.vel.y, Math.max(hs, 2)) * 0.9 + (o.mode === 'hunt' && o.sub === 'approach' ? 0.15 : 0)));
        o.pitch += (pitchT - o.pitch) * Math.min(1, dt * 5);
        o.roll += (Math.max(-0.7, Math.min(0.7, -turn * 1.4)) - o.roll) * Math.min(1, dt * 4);
        o.model.rotation.set(o.pitch, o.yaw, o.roll);
    }

    /** One gargoyle's mind. */
    _think(o, dt) {
        const g = this.game;
        const p = o.model.position;
        o.age += dt; o.t += dt;
        o.slowT = Math.max(0, o.slowT - dt);
        o.stunT = Math.max(0, o.stunT - dt);
        o.cd = Math.max(0, o.cd - dt);
        if (o.aggro && this.clock > o.aggro.until) o.aggro = null;
        if (o.mode === 'crumble') { this._crumble(o, dt); return; }
        if (o.carry) { this._carry(o, dt); return; }
        if (o.age >= o.life) { this._startCrumble(o); return; }
        const hd = hdist(p, o.home);
        // (the people's fright follows it: VillagerFear._poll keeps a danger 'monster' keyed 'garg:' + id)
        if (o.stunT > 0) { o.vel.multiplyScalar(Math.max(0, 1 - dt * 4)); p.addScaledVector(o.vel, dt); o.a.mode = 'fall'; this._orient(o, dt); return; }
        // rising out of the circle: straight up, then every way
        if (o.mode === 'rise') {
            const pl = o.plan || { climb: 1.4, up: 10, bearing: o.yaw };
            if (o.t < pl.climb) {
                _v2.set(p.x + Math.sin(pl.bearing) * 2, p.y + 14, p.z + Math.cos(pl.bearing) * 2);
                this._fly(o, _v2, pl.up * 1.4, dt, { k: 2.2 });
                o.a.mode = 'climb';
                this._orient(o, dt);
                return;
            }
            o.mode = 'scatter'; o.t = 0;
            o.scatter = new THREE.Vector3(p.x + Math.sin(pl.bearing) * 70, 0, p.z + Math.cos(pl.bearing) * 70);
            o.scatter.y = this._ground(o.scatter.x, o.scatter.z) + rnd(18, 34);
        }
        if (o.mode === 'scatter') {
            if (o.t > 1.6 || o.scatter.distanceTo(p) < 8) { o.mode = 'roam'; o.t = 0; o.goal = null; } else {
                this._fly(o, o.scatter, GARGOYLE.SPEED * 1.2, dt, { k: 2.4 });
                o.a.mode = 'fly';
                this._orient(o, dt);
                return;
            }
        }
        // too far from the pentagram: turn back
        if (outOfLeash(hd) || o.mode === 'return') {
            if (hd < GARGOYLE.LEASH * 0.75) { if (o.mode === 'return') { o.mode = 'roam'; o.goal = null; o.target = null; } } else {
                o.mode = 'return';
                o.target = null;
                _v2.set(o.home.x, this._ground(o.home.x, o.home.z) + 24, o.home.z);
                this._fly(o, _v2, GARGOYLE.SPEED, dt);
                o.a.mode = 'fly';
                this._orient(o, dt);
                return;
            }
        }
        // choose prey
        o.rethink -= dt;
        if (o.target && !this._targetOk(o)) o.target = null;
        if (!o.target && o.rethink <= 0) {
            o.rethink = rnd(0.25, 0.6);
            const v = this._pick(o);
            if (v) { o.target = { k: v.k, id: v.id, key: v.k + v.id }; o.sub = 'approach'; o.subT = 0; o.mode = 'hunt'; v.claims++; if (Math.random() < 0.25) this._sound(o, 'roar', 0.8); } else if (o.mode === 'hunt') { o.mode = 'roam'; o.goal = null; }
        }
        if (o.mode === 'hunt' && o.target) { this._hunt(o, dt); this._separate(o, dt); return; }
        // roam: patrol the pentagram's land high up (the screaming flock)
        o.mode = 'roam';
        if (!o.goal || o.goal.distanceTo(p) < 7 || o.t > 9) {
            const d = inDisc(Math.random(), Math.random(), GARGOYLE.LEASH * 0.8);
            o.goal = new THREE.Vector3(o.home.x + d.x, 0, o.home.z + d.z);
            o.goal.y = this._ground(o.goal.x, o.goal.z) + rnd(14, 32);
            o.t = 0;
            if (Math.random() < 0.15) this._sound(o, 'screech', 0.8);
        }
        this._fly(o, o.goal, GARGOYLE.SPEED * 0.8, dt, { k: 1.8 });
        o.a.mode = o.vel.y > 1 ? 'fly' : Math.random() < 0.005 ? 'glide' : o.a.mode === 'glide' ? 'glide' : 'fly';
        if (o.a.mode === 'glide' && o.t % 3 < 0.05) o.a.mode = 'fly';
        this._separate(o, dt);
        this._orient(o, dt);
    }

    _targetOk(o) {
        const t = o.target;
        const v = this.victims.find((q) => q.k === t.k && q.id === t.id);
        if (!v) return !!this._live(t) && false;
        if (v.roofed || !this._live(t)) return false;
        if (t.k === 'p' && t.id === o.by && sparesSummoner(o.age)) return false;
        if (hdist(v.pos, o.home) > GARGOYLE.LEASH + 12) return false;
        v.claims++;
        t.v = v;
        return true;
    }

    /** The hunt: approach, bite, break away, again. */
    _hunt(o, dt) {
        const g = this.game, t = o.target, v = t.v;
        if (!v) { o.target = null; return; }
        const p = o.model.position;
        o.subT += dt;
        const toV = _d.subVectors(v.pos, p);
        const dist = toV.length();
        if (o.sub === 'approach') {
            // in front of its face: a point 1.6 m off the prey, on this side, at the height of its chest
            const away = _v2.set(p.x - v.pos.x, 0, p.z - v.pos.z);
            if (away.lengthSq() < 1e-4) away.set(Math.sin(o.yaw), 0, Math.cos(o.yaw));
            away.normalize();
            const hover = _v3.set(v.pos.x + away.x * 1.5, v.pos.y + 0.2, v.pos.z + away.z * 1.5);
            const speed = dist > 30 ? GARGOYLE.SPEED : dist > 6 ? GARGOYLE.DIVE : Math.max(6, dist * 3);
            this._fly(o, hover, speed, dt, { k: 3.2 });
            o.a.mode = dist > 22 ? 'fly' : dist > 5 ? 'dive' : 'hover';
            this._orient(o, dt, dist < 12 ? v.pos : null);
            o.a.headYaw = 0;
            o.fireCd -= dt;
            const F = GARGOYLE.FIRE;
            if (o.fireCd <= 0 && dist > F.RANGE[0] && dist < F.RANGE[1] && Math.abs(angDiff(o.yaw, Math.atan2(v.pos.x - p.x, v.pos.z - p.z))) < 0.4) {
                o.sub = 'breath'; o.subT = 0; o.fireCd = rnd(...F.CD); o.breathT = F.T; o.flameT = 0;
                this._send({ op: 'fb', id: o.id }); this._sound(o, 'roar', 1);
            } else if (dist < GARGOYLE.REACH && o.cd <= 0) { o.sub = 'bite'; o.subT = 0; o.a.bite = 0.001; o.bitten = false; this._sound(o, 'roar', 0.7); }
            else if (o.subT > 9 && dist > 6) { o.target = null; o.rethink = 0.3; } // (cannot get at it: another)
        } else if (o.sub === 'breath') { // fire out of the mouth: it hangs in the air and breathes at the prey
            o.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
            p.addScaledVector(o.vel, dt);
            o.a.mode = 'bite'; o.a.bite = 0.45;
            this._orient(o, dt, v.pos);
            o.flameT -= dt;
            if (o.flameT <= 0) { o.flameT = GARGOYLE.FIRE.TICK; this._flame(o, v.pos); }
            if (o.subT >= GARGOYLE.FIRE.T) { o.sub = 'approach'; o.subT = 0; o.a.bite = 0; o.cd = 0.6; }
        } else if (o.sub === 'bite') {
            o.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
            p.addScaledVector(o.vel, dt);
            o.a.mode = 'bite';
            o.a.bite = Math.min(1, o.subT / 0.55);
            this._orient(o, dt, v.pos);
            if (!o.bitten && o.subT >= 0.25) {
                o.bitten = true;
                if (dist < GARGOYLE.REACH + 0.9) this._bite(o, v); // (it must still reach: the prey may have jumped away)
            }
            if (o.subT >= 0.55) { o.sub = 'break'; o.subT = 0; o.a.bite = 0; o.cd = GARGOYLE.HIT_CD * rnd(0.9, 1.2); o.breakDir = Math.random() < 0.5 ? 1 : -1; }
        } else { // break away: back and up, a little aside — then round again
            const away = _v2.set(p.x - v.pos.x, 0, p.z - v.pos.z);
            if (away.lengthSq() < 1e-4) away.set(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
            away.normalize();
            const side = _v3.set(-away.z * o.breakDir, 0, away.x * o.breakDir);
            const goal = _d.set(p.x + away.x * 8 + side.x * 4, v.pos.y + 4.5, p.z + away.z * 8 + side.z * 4);
            this._fly(o, goal, GARGOYLE.SPEED, dt, { k: 4 });
            o.a.mode = 'fly';
            this._orient(o, dt);
            if (o.subT > 0.7 && o.cd <= 0) { o.sub = 'approach'; o.subT = 0; }
        }
        void g;
    }

    /** Gargoyles keep apart (a flock, not a heap). */
    _separate(o, dt) {
        const p = o.model.position;
        for (const q of this.list) {
            if (q === o || q.dead) continue;
            const dx = p.x - q.model.position.x, dy = p.y - q.model.position.y, dz = p.z - q.model.position.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > 6.5 || d2 < 1e-4) continue;
            const d = Math.sqrt(d2), f = (2.55 - d) * 3.2 * dt;
            p.x += dx / d * f; p.y += dy / d * f * 0.6; p.z += dz / d * f;
        }
    }

    /** (host) A bite lands on prey `v`: a person 3–5 (beasts ×1.4), a shove. Whom: players (their own computer), castle people, animals, zombies, sailors. */
    _bite(o, v) {
        const g = this.game;
        const dmg = biteDamage(v.k === 'a' || v.k === 'z' ? 'animal' : 'p', Math.random());
        _d.set(v.pos.x - o.model.position.x, 0, v.pos.z - o.model.position.z);
        if (_d.lengthSq() < 1e-4) _d.set(Math.sin(o.yaw), 0, Math.cos(o.yaw));
        _d.normalize();
        const dir = _d.clone();
        this._sound(o, 'bite', 0.9);
        const from = o.model.position;
        const by = o.by;
        this._note({ ev: 'bite', id: o.id, k: v.k, vid: v.id, dmg });
        if (v.k === 'p') {
            const push = dir.clone().multiplyScalar(GARGOYLE.SHOVE).setY(2);
            if (v.id === g.localId) this._hurtMe(dmg, from.clone(), push);
            else this._send({ op: 'hurt', to: v.id, dmg, f: [r1(from.x), r1(from.y), r1(from.z)], v: [r1(push.x), r1(push.y), r1(push.z)] });
        } else if (v.k === 'v') {
            this._tryGrab(o, v);
            g.castleLife?.hit(v.ref, dmg, dir.clone(), by, { via: 'ritual', src: { x: o.home.x, y: o.home.y, z: o.home.z }, srcRef: { k: 'g', id: o.id } });
            g.creatureImpact?.apply(v.ref, { v: dir.clone().multiplyScalar(GARGOYLE.SHOVE).setY(1), by, kind: 'gargoyle', jolt: 0, from: from.clone() });
        } else if (v.k === 'a') {
            g.animals?.hit(v.ref, dmg, dir.clone(), by);
        } else if (v.k === 'z') {
            g.damageZombie?.(v.ref, dmg, false, dir.clone(), by === g.localId ? null : by);
        } else if (v.k === 's') {
            g.ships?.crew?.hit(v.ref, dmg, dir.clone(), by, { spell: false, kind: 'crush' }); // (stone claws: they break a skeleton's bones — Sailors.pirateBoneDamage)
        }
        g.fx?.spark?.(v.pos, 0xff3020, 0.1, _v.set((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3), 0.4);
    }

    /** A bite on MY player (my computer counts it): a raised «Protection» facing it holds it. */
    _hurtMe(dmg, from, push, fire = false) {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        if (c.shieldFactor?.(from) >= 1) { c._blocked?.(from, 'bite'); if (push) g.knockback?.add(push.clone().multiplyScalar(0.3)); return; }
        const hurts = c.enabled || g.config?.mode !== 'creative';
        if (c.enabled) c.damage(dmg, null, 'bite'); else g.damageLocalPlayer?.(dmg);
        if (push) g.knockback?.add(push);
        if (fire) g.burning?.ignite?.('p', g.localId, null); // (the breath sets me alight)
        g.hud?.setVoice?.(fire ? '🔥 Горгулья дохнула огнём' : hurts ? `🜏 Горгулья вцепилась: −${r1(dmg)}` : '🜏 Горгулья вцепилась', true);
    }

    // ============================================================ the grip: carried up, let go from a height
    /** (host) A bite may become a grip on a castle person (not the king / the tower's master): chance by who he is. */
    _tryGrab(o, v) {
        const c = v.ref;
        if (o.carry || !c || c.dead || c.carriedBy || c.lev || c.seated) return;
        if (Math.random() > grabChance(c.role, !!c.wizard)) return;
        const G = GARGOYLE.GRAB;
        c.carriedBy = o.id;
        o.carry = { c, t: 0, hold: rnd(...G.HOLD), up: rnd(...G.UP), hit: G.KNIGHT_EVERY, said: false };
        o.mode = 'carry'; o.target = null;
        this._note({ ev: 'grab', id: o.id, vid: c.id, role: c.role });
        this._sound(o, 'screech', 1);
        this.game.castleLife?._say?.(c, 'А-а-а! Пустите!', 3);
    }

    /** (host) Carrying: up and away over open ground, the victim hangs under the claws; a knight may tear free and strikes back. */
    _carry(o, dt) {
        const k = o.carry, c = k.c, p = o.model.position, G = GARGOYLE.GRAB;
        if (!c || c.dead || c.carriedBy !== o.id) { this._dropVictim(o, 'lost'); return; }
        k.t += dt;
        const gy = this._ground(p.x, p.z);
        const goal = _v2.set(p.x + Math.sin(o.yaw) * 10, gy + k.up, p.z + Math.cos(o.yaw) * 10);
        this._fly(o, goal, G.SPEED, dt, { k: 2.2 });
        o.a.mode = 'fly'; o.a.headYaw = 0;
        this._orient(o, dt);
        c.x = p.x; c.z = p.z; c.y = p.y - G.DROP_BELOW; c.vy = 0; c.vx = 0; c.vz = 0; c.mode = 'flail'; c.speed = 0; // (hanging by the claws, kicking in the air)
        if (Math.random() < breakFree(c.role, !!c.wizard) * dt) { this._dropVictim(o, 'free'); return; }
        if (c.role === 'knight') { k.hit -= dt; if (k.hit <= 0) { k.hit = G.KNIGHT_EVERY; this.hit(o, G.KNIGHT_BLOW, 'blade', null); } }
        if (k.t >= k.hold && p.y - gy > k.up * 0.85) this._dropVictim(o, 'dropped');
    }

    /** (host) It lets go (or is made to): the person falls from where he is — Levitation counts the fall. */
    _dropVictim(o, why) {
        const k = o.carry;
        o.carry = null;
        if (o.mode === 'carry') { o.mode = 'roam'; o.goal = null; }
        const c = k?.c;
        if (!c) return;
        c.carriedBy = null;
        this._note({ ev: 'drop', id: o.id, vid: c.id, why });
        if (c.dead) return;
        this.game.levitation?.watchFall?.('v', c, o.by);
        c.vy = -0.01; c.flyFlail = true; c.vx = o.vel.x * 0.5; c.vz = o.vel.z * 0.5;
        this.game.castleLife?._say?.(c, why === 'free' ? 'Вырвался!' : 'А-а-а-а!', 3);
        if (why === 'dropped' || why === 'free') this._sound(o, 'screech', 0.7);
    }

    // ============================================================ the breath
    /** (host) One tick of the flame from the mouth towards `at`: things burn, living bodies catch, a player in it is scorched. */
    _flame(o, at) {
        const g = this.game, F = GARGOYLE.FIRE;
        const mouth = o.model.userData.B.head.getWorldPosition(_v3);
        const d = _d.subVectors(at, mouth);
        const len = Math.min(F.LEN, d.length() + 2);
        d.normalize();
        g.fire?.igniteAlong?.(mouth, d, len);
        g.animals?.burnAlong?.(mouth, d, len);
        g.livingTrees?.burnAlong?.(mouth, d, len);
        g.burning?.igniteRay?.(mouth, d, len, 1.4, o.by);
        o.flameHurt = (o.flameHurt || 0) - F.TICK;
        if (o.flameHurt > 0) return;
        for (const id of [g.localId, ...(g.remotes?.keys?.() || [])]) {
            const P = this._player(id);
            if (!P) continue;
            const along = _v2.subVectors(P.pos, mouth).dot(d);
            if (along < 0 || along > len) continue;
            if (_v2.copy(mouth).addScaledVector(d, along).distanceTo(P.pos) > 2.2) continue;
            if (id === o.by && sparesSummoner(o.age)) continue;
            o.flameHurt = F.PLAYER_EVERY;
            if (id === g.localId) this._hurtMe(F.HURT, mouth.clone(), null, true);
            else this._send({ op: 'hurt', to: id, dmg: F.HURT, f: [r1(mouth.x), r1(mouth.y), r1(mouth.z)], v: null, fire: 1 });
        }
    }

    /** (every computer, per frame) The stream of fire out of the mouth: a fan of hot sparks along the way it faces. */
    _breathFx(o, dt) {
        o.breathT -= dt;
        const fx = this.game.fx;
        if (!fx) return;
        const mouth = o.model.userData.B.head.getWorldPosition(_v3);
        const dir = _d.set(0, -0.12, 1).applyQuaternion(o.model.quaternion).normalize();
        const n = Math.min(10, Math.max(1, Math.round(dt * 60 * 5)));
        for (let i = 0; i < n; i++) {
            const sp = rnd(10, 17);
            fx.spark(mouth, i % 3 === 0 ? 0xffd070 : i % 3 === 1 ? 0xff6a1a : 0xc01a10, 0.12 + Math.random() * 0.2, _v.set(dir.x * sp + (Math.random() - 0.5) * 2.4, dir.y * sp + (Math.random() - 0.3) * 2, dir.z * sp + (Math.random() - 0.5) * 2.4), 0.35 + Math.random() * 0.35);
        }
    }

    // ============================================================ the end of its time
    _startCrumble(o) {
        if (o.mode === 'crumble') return;
        if (o.carry) this._dropVictim(o, 'crumble');
        o.mode = 'crumble'; o.crumbleT = 0; o.target = null;
        o.a.mode = 'stone';
        this._sound(o, 'crumble', 1);
        this._note({ ev: 'crumble', id: o.id });
    }

    _crumble(o, dt) {
        const p = o.model.position;
        o.crumbleT += dt;
        o.vel.y -= 16 * dt;
        o.vel.x *= Math.max(0, 1 - dt * 2); o.vel.z *= Math.max(0, 1 - dt * 2);
        p.addScaledVector(o.vel, dt);
        const gy = this._ground(p.x, p.z);
        const floor = gy + FEET * o.scale * (1 - 0.5 * o.crumbleT / GARGOYLE.CRUMBLE_T);
        if (p.y < floor) { p.y = floor; o.vel.y = 0; }
        const k = o.crumbleT / GARGOYLE.CRUMBLE_T;
        o.a.mode = 'stone';
        o.pitch += (0.25 - o.pitch) * Math.min(1, dt * 3); o.roll *= 0.9;
        o.model.rotation.set(o.pitch, o.yaw, o.roll);
        o.model.scale.set(MODEL_SCALE * o.scale, MODEL_SCALE * o.scale * (1 - 0.55 * k * k), MODEL_SCALE * o.scale);
        if (Math.random() < dt * 14) { gargoyleCenter(o, _v3); _v3.y -= 0.2; this._shatter(_v3, o.scale * 0.8, false); }
        if (k >= 1) {
            gargoyleCenter(o, _v3);
            this._shatter(_v3, o.scale, true);
            o.dead = true; o.model.visible = false;
            this._send({ op: 'die', id: o.id, p: [r1(_v3.x), r1(_v3.y), r1(_v3.z)], s: 0 });
            setTimeout(() => this._remove(o), 50);
        }
    }

    // ============================================================ the castle fights back
    /**
     * (host, CastleLife) A knight / guard near a gargoyle: he goes under it and strikes when it is low enough and in front.
     * @returns {boolean} true: he is busy with it this frame
     */
    knightStep(v, dt) {
        if (!this.auth || !this.list.length || v.role !== 'knight' || v.sleep || v.stunT > 0) return false;
        const L = this.game.castleLife;
        let best = null, bd = 24;
        for (const o of this.list) {
            if (o.dead || o.mode === 'crumble') continue;
            const p = o.model.position;
            const d = Math.hypot(p.x - v.x, p.z - v.z);
            if (d < bd && p.y - v.y < 7) { bd = d; best = o; }
        }
        if (!best) return false;
        const p = best.model.position;
        v.foe = null; v.seated = false; v.path = null;
        v.gcd = Math.max(0, (v.gcd || 0) - dt);
        L._steer?.(v, p.x, p.z, bd > 4 ? 5.6 : 0, dt, 2.2); // (5.6: a man's run — CastleLife.RUN)
        if (bd > 4) v.mode = 'run';
        else { v.speed = 0; v.mode = 'attack'; }
        if (bd < 3.4 && p.y - v.y < 6 && v.gcd <= 0) {
            v.gcd = 1.1;
            this.hit(best, 4 + Math.random() * 3, 'blade', null);
            this.game.fx?.spark?.(p, 0xffe9a0, 0.1, _v.set(0, 2, 0), 0.3);
        }
        L._ground?.(v);
        return true;
    }

    // ============================================================ frame
    update(dt) {
        const g = this.game;
        if (dt <= 0) return;
        this.clock += dt * 1000;
        this._scanT -= dt;
        const cam = g.camera?.position;
        for (const r of [...this.rituals]) {
            this._stepRitual(r, dt);
            this.fx.fire(r, dt, cam);
        }
        this.fx.sky(this.rituals, dt, cam);
        this.fx.scorchStep(cam);
        if (this.auth) {
            if (this.list.length) {
                this._scan();
                for (const o of this.victims) o.claims = 0;
                for (const o of [...this.list]) {
                    if (o.dead) continue;
                    if (o.imp && g.imperius?.step('g', o, dt)) { o.age += dt; if (o.age >= o.life) this._startCrumble(o); o.pitch = o.a.pitch || 0; o.roll = o.a.roll || 0; o.model.rotation.set(o.pitch, o.yaw, o.roll); continue; }
                    this._think(o, dt);
                }
            }
        } else {
            for (const o of this.list) {
                if (o.dead) continue;
                if (o.imp?.mine && g.imperius?.step('g', o, dt)) continue;
                if (o.net) this._follow(o, dt);
            }
        }
        // the look: near ones fully drawn and posed; far ones a light shape; very far ones not at all
        if (this.list.length) {
            const me = cam;
            for (const o of this.list) {
                if (o.dead) continue;
                const d = me ? o.model.position.distanceTo(me) : 0;
                const far = d > 150;
                o.model.visible = !far;
                if (far) continue;
                o.model.userData.setLod(d > 55);
                poseGargoyle(o.model, o.a, dt);
                if (o.breathT > 0) this._breathFx(o, dt);
                if (o.slowT > 0 && Math.random() < dt * 6) g.fx?.spark?.(gargoyleCenter(o, _v3), 0xbfe8ff, 0.07, _v.set(0, 0.5, 0), 0.5); // (frost on it)
            }
            this._wingSounds(me);
        }
        this._debrisStep(dt);
        this._netSend(dt);
    }

    /** Wingbeats heard from the nearest ones (a few at a time, not every beat of every one). */
    _wingSounds(me) {
        if (!me) return;
        this._wT = (this._wT || 0) - 1 / 60;
        if (this._wT > 0) return;
        this._wT = rnd(0.35, 0.7);
        let best = null, bd = 60;
        for (const o of this.list) { if (o.dead) continue; const d = o.model.position.distanceTo(me); if (d < bd) { bd = d; best = o; } }
        if (best) this.game.sound?.playGargoyle?.(best.model.position, 'wings', Math.min(1, 14 / (bd + 4)));
    }

    // ============================================================ network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'garg', ...m }, m.op !== 's'); }

    _netSend(dt) {
        if (!this.auth || !this.game.sync || !this.list.length) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.125;
        this._send({ op: 's', l: this.list.filter((o) => !o.dead).slice(0, 64).map((o) => [o.id, r1(o.model.position.x), r1(o.model.position.y), r1(o.model.position.z), r2(o.yaw), r2(o.pitch), r2(o.roll), MODES.indexOf(o.a.mode), Math.round(o.hp), o.variant, r2(o.scale), r2(o.a.bite || 0), r2(o.a.span), o.slowT > 0 ? 1 : 0]) });
    }

    /** (a guest) Following the host's gargoyle smoothly. */
    _follow(o, dt) {
        const n = o.net;
        o.model.position.lerp(n.p, Math.min(1, dt * 9));
        o.yaw += angDiff(o.yaw, n.yaw) * Math.min(1, dt * 9);
        o.pitch += (n.pitch - o.pitch) * Math.min(1, dt * 8); o.roll += (n.roll - o.roll) * Math.min(1, dt * 8);
        o.model.rotation.set(o.pitch, o.yaw, o.roll);
        o.a.mode = n.mode; o.a.bite = n.bite;
        o.slowT = n.slow ? 1 : 0;
        if (n.mode === 'stone') { o.model.scale.y += (MODEL_SCALE * o.scale * 0.5 - o.model.scale.y) * Math.min(1, dt * 0.6); if (Math.random() < dt * 14) { gargoyleCenter(o, _v3); this._shatter(_v3, o.scale * 0.8, false); } }
    }

    onNet(m, isHost) {
        const g = this.game;
        if (!m || typeof m.op !== 'string') return;
        const vec = (a) => (Array.isArray(a) ? new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0) : null);
        switch (m.op) {
            case 'req': // (a guest paid the mana: the host begins)
                if (isHost && Array.isArray(m.c)) this._begin([+m.c[0] || 0, +m.c[1] || 0, +m.c[2] || 0], typeof m.by === 'string' ? m.by : null, m.seed | 0);
                break;
            case 'rit': // (the host began a ritual: every computer shows the fire and the sky)
                if (!isHost && Array.isArray(m.c) && !this.rituals.some((r) => r.id === m.id)) {
                    const r = this._makeRitual(String(m.id), [+m.c[0] || 0, +m.c[1] || 0, +m.c[2] || 0], m.by, m.seed | 0, m.n | 0);
                    r.plan = null; r.spawned = 0; r.bolts = []; // (the creatures and the bolts come from the host)
                }
                break;
            case 'bolt': if (!isHost && Array.isArray(m.p)) this._strike(m.p, typeof m.by === 'string' ? m.by : null); break;
            case 's': {
                if (isHost) return;
                const seen = new Set();
                for (const e of (m.l || []).slice(0, 64)) {
                    const [id, x, y, z, yaw, pitch, roll, mode, hp, variant, scale, bite, span, slow] = e;
                    seen.add(id);
                    let o = this.list.find((q) => q.id === id);
                    if (!o) { o = this.spawn(new THREE.Vector3(x, y, z), { id, variant, scale }); if (!o) continue; o.yaw = yaw; o.a.span = span; }
                    o.net = { p: new THREE.Vector3(x, y, z), yaw, pitch, roll, mode: MODES[mode] || 'fly', bite, slow };
                    o.hp = hp;
                }
                for (const o of [...this.list]) if (!seen.has(o.id) && !o.dead) this._remove(o);
                break;
            }
            case 'hit': if (isHost) { const o = this.byId(m.id); if (o) this.hit(o, Math.min(120, Math.max(0, +m.dmg || 0)), typeof m.kind === 'string' ? m.kind.slice(0, 24) : 'melee', m.from); } break;
            case 'hurt': if (m.to === g.localId && Array.isArray(m.f)) this._hurtMe(Math.min(10, +m.dmg || 0), vec(m.f), vec(m.v), !!m.fire); break;
            case 'spent': if (!isHost && Array.isArray(m.c)) this._spend({ x: +m.c[0] || 0, y: +m.c[1] || 0, z: +m.c[2] || 0 }); break;
            case 'fb': { const o = this.list.find((q) => q.id === m.id); if (!isHost && o) o.breathT = GARGOYLE.FIRE.T; break; }
            case 'snd': if (!isHost && typeof m.k === 'string' && Array.isArray(m.p)) g.sound?.playGargoyle?.(vec(m.p), m.k, 1); break;
            case 'die': {
                const o = this.list.find((q) => q.id === m.id);
                const p = vec(m.p);
                if (p && !o?.dead) this._shatter(p, o?.scale || 1, !!m.s);
                if (o) { o.dead = true; o.model.visible = false; setTimeout(() => this._remove(o), 50); }
                break;
            }
            default: break;
        }
    }

    dispose() {
        for (const o of [...this.list]) this._remove(o);
        for (const r of [...this.rituals]) this._endRitual(r);
        this.fx.dispose();
        const D = this._debris;
        if (D) { this.game.scene?.remove(D.mesh); D.mesh.dispose?.(); D.mesh.material.dispose(); }
        this._debris = null;
    }
}

/** Its parts for the hands' blows (BodyStrikes): the body and the head (sizes in the model's own metres, ×its scale). */
function gargoyleBodyParts(o) {
    const B = o.model.userData.B;
    const s = 1;
    const parts = [['body', () => B.spine2, [0, 0.0, 0.1], [0.58 * s, 0.7 * s, 0.45 * s]], ['head', () => B.head, [0, 0.1, 0.25], [0.3 * s, 0.28 * s, 0.34 * s]]];
    parts.model = o.model;
    return parts;
}

// pushes, gusts, knockdowns (CreatureImpact): a heavy stone body in the air — it reels and is thrown aside, never falls over
registerKind('G', {
    name: 'gargoyle', faces: 1,
    list: (g) => g.gargoyles?.list || [],
    get: (g, id) => g.gargoyles?.byId(id),
    alive: (c) => !c.dead && c.mode !== 'crumble',
    body: () => 'gargoyle',
    centre: (c, out) => gargoyleCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }), // (its own pitch and roll show the reel)
    head: (c) => c.model.userData.B?.head, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { c.model.position.x += dx; c.model.position.z += dz; },
    toss(g, c, vy) { c.vel.y = Math.max(c.vel.y, vy); },
    hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, Math.min(t, 1.0)); }, // (a flier rights itself quickly)
    frozen: (c) => false,
    noKnock: () => true,
    // water and an earthquake do nothing to a flier; a house's sphere shoves it out, without harm
    immune: (g, c, o) => /^Earthquake/.test(o.spell || '') && c.model.position.y > (g.collision?.groundY?.(c.model.position.x, c.model.position.z) ?? 0) + 2,
    struck(g, c, o) { if (o.kind !== 'fall' && o.spell !== 'Ward') g.gargoyles?._provoked?.(c, o.by ?? null); },
});
