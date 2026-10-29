/**
 * Ghosts.js — the ghosts of the Castle of Ghosts (rules and numbers: GhostRules.js; the look: fx/GhostFx.js; the castle's loose things: fx/GhostProps.js).
 *
 * The author: «В замке обитают призраки: страшные, но относительно безобидные. Их нельзя уничтожить — можно изгнать «Nihilis Atra» или сдуть «Wind» /
 * «Wind Maxima» (улетают, испугавшись). Overgrown против них не работает. Призраки больше исполняют роль страхов: страшные звуки; появляются неожиданно
 * из-за угла; исчезают; что-то странное двигается — например, стул… Внешне — простыня, летает. Единственный вредный момент: призрак пролетает сквозь
 * тебя — −1 ХП и охлаждение на несколько секунд; редко; не попытка убийства; призраки пугаются тебя, сами не взаимодействуют».
 *
 * A «scare director», not a fight. Every seer's computer has ITS OWN ghosts for ITS hero (nothing about them goes over the network, no host: the castle's
 * blocks exist only in a seer's land, so only a seer's computer can steer inside it); a friend's «Nihilis Atra» / «Wind» is replayed on every computer
 * and drives out that computer's ghosts (Nihilis.fire → `exorcise`). Harm (−1 HP, the chill) only ever hits the local hero.
 *   - GHOST.MIN…MAX ghosts while the seer is in / near a shown castle (`game.ghostCastle`: `.site`, `.inside(pos)`); nothing exists elsewhere.
 *   - Every GHOST.SCARE_GAP s one scare by the weights of SCARES: «peek» (out of a corner 8–22 m off, a look at you, gone), «cross» (darts across the
 *     passage ahead), «behind» (a whisper and a cold breath at your back, never nearer than AFRAID + 1 m), «sound» (only a sound from a spot),
 *     «chair» (the poltergeist: GhostProps — a chair slides / rocks, a candle goes out), «through» (rare: straight through you — −1 HP and the chill).
 *   - They fear the hero: come within GHOST.AFRAID m, or look straight at one for ~1.5 s, and it recoils and melts away. They never chase, never block
 *     a way (they melt rather than stand in a doorway), never pass through a wall (a blocked way: it melts and comes elsewhere) — only through you.
 *
 * ON WHOM / ON WHAT (CLAUDE.md): GhostRules.GHOST_WORLD (creatures) and GHOST_SPELLS (spells) — `hit` reads them. Decided here, with the reasons:
 *   - villagers' alarms: Danger.js is NOT called — the people of the world do not see the castle or its ghosts (castlePeople: none);
 *   - «Империус»: a ghost cannot be taken — it has no body and no will (GHOST_SPELLS.Imperius); nothing here offers a ghost to game.imperius;
 *   - a duel charge (`boltHit`) follows GHOST_SPELLS: it flies through a ghost, except what drives ghosts away;
 *   - a god's spell (ProtectionGods.isDivine) scatters them for GHOST.DIVINE s (not for ever: a ghost cannot be destroyed).
 *
 * What can go wrong (CLAUDE.md «а если…»): the seer loses the sight / dies / goes off the Earth — everything is put away AT ONCE (nothing seen,
 * nothing piles up); sleeps / walks out / the castle goes out of the land (chunks evicted: its blocks read as «not made» = solid, the site goes) —
 * the ghosts melt (FADE_OUT) and are put away; a duel, the arena, «Империус», flight, space, a frozen hero, low health — never a pass-through
 * (`canHarm`); «Империус» — no scares at all (the mind is elsewhere); a teleport far away — ghosts left behind melt at once; two spells at once — the
 * strongest verdict wins (exorcise > scatter > blown > scared), times never shrink; a ghost driven out stays out for its time even if the castle
 * unloads and comes back (`_exiles`); a chair never moves into a block, a doorway, onto the hero or another thing (GhostProps.freeAt).
 */
import * as THREE from 'three';
import { GHOST, SCARES, ghostSpell, NO_EFFECT_HINT, awayFor, between, mayFlyThrough } from './GhostRules.js';
import { ghostAlpha, seesInvisible } from './Invisibles.js';
import { inCone, NIHIL } from './NihilisRules.js';
import { isDivine } from './ProtectionGods.js';
import { GhostFx } from '../fx/GhostFx.js';
import { GhostProps } from '../fx/GhostProps.js';

const FEET = 2.0; // (Character.PLAYER_GROUND_OFFSET: the hero's feet are this far under his group's point)
const EYE = 3.4; // m over the feet
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _look = new THREE.Vector3(), _cam = new THREE.Vector3(), _eye = new THREE.Vector3();
const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const RANK = { scared: 1, blown: 2, scatter: 3, exorcise: 4 };
const SOUNDS_ONLY = ['steps', 'whisper', 'cry', 'knock', 'laugh', 'door'];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The ghost's body as a capsule (world): from just over its hem to its head; r = GHOST.FOOT. */
export function ghostBody(o, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const h = Math.min(o.size, GHOST.BODY_H + 0.6);
    out.a.set(o.pos.x, o.pos.y + 0.4, o.pos.z);
    out.b.set(o.pos.x, o.pos.y + h - 0.3, o.pos.z);
    out.r = GHOST.FOOT;
    return out;
}

/** The distance from a point to a segment a–b. */
function segDist(p, a, b) {
    _u.subVectors(b, a);
    const l2 = _u.lengthSq();
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, _w.subVectors(p, a).dot(_u) / l2)) : 0;
    return _w.copy(a).addScaledVector(_u, t).distanceTo(p);
}

export class Ghosts {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.clock = 0; // s
        this.rnd = Math.random; // (tests replace it)
        this.fx = new GhostFx(GHOST.MAX + 2);
        this.props = new GhostProps(game, game.scene);
        this.active = false;
        this.site = null;
        this.inside = false;
        this._want = 0;
        this._exiles = []; // [{until, why}] ghosts driven out: they stay out though the castle unloads
        this._scareT = between(GHOST.SCARE_GAP);
        this._lastThrough = -1e9; this._throughGap = between(GHOST.THROUGH_GAP);
        this._propNext = 0;
        this._hintT = -1e9;
        this._bellT = 40 + 40 * Math.random();
        this._droneK = 0;
        this.chill = 0; // s of the cold left on the hero
        this._slowSet = null; this._slowBase = 1;
        this._breathT = 0;
        this._n = 0;
        this._added = false;
        this.log = []; // (tests, the journal) what happened
    }

    _note(e) { this.log.push({ t: Math.round(this.clock * 10) / 10, ...e }); if (this.log.length > 80) this.log.shift(); }

    /** For Game.prewarm: the sheet's outside and inside, the things' material and the flame — compiled at load, never in flight. */
    sampleModels() { return [...GhostFx.samples(), ...GhostProps.samples()]; }

    // ------------------------------------------------------------------ lists
    targets() { return this.list.filter((o) => !o.away && o.alpha > 0.2); }
    byId(id) { return this.list.find((o) => o.id === id) || null; }

    _make() {
        const model = new THREE.Object3D(); // (a thin proxy: not in the scene — the look is GhostFx's one mesh)
        model.name = 'ghost';
        const o = {
            id: 'gh' + (++this._n).toString(36) + Math.floor(this.rnd() * 1e6).toString(36), ck: 'G', isGhost: true,
            model, group: model, hp: Infinity, dead: false, get isDead() { return false; },
            get position() { return this.model.position; },
            pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: this.rnd() * TAU, size: between(GHOST.SIZE, this.rnd()), hover: between(GHOST.HEIGHT, this.rnd()),
            phase: this.rnd() * 20, seed: this.rnd(), pose: 0, trail: 1, fade: 0, fadeTo: 0, fadeRate: 1, diss: 0, alpha: 0,
            away: false, awayT: 0, awayWhy: null, state: 'lurk', plan: null, t: 0, gaze: 0,
            bodyCapsule: (out) => ghostBody(o, out),
        };
        model.userData.ghost = o;
        return o;
    }

    // ------------------------------------------------------------------ the world: blocks, floors, sight
    _solid(x, y, z) {
        const data = this.game.terrain?.data;
        if (!data) return false;
        if (data.landMade && !data.landMade(x, z)) return true; // (the land is not made / was dropped: never go there)
        return !!data.isSolidAt?.(x, y, z);
    }

    /** Is the room for a ghost's body (hem at y, `size` tall) free of blocks? */
    _bodyFree(x, y, z, size) {
        for (const h of [0.35, size * 0.5, size * 0.9]) {
            if (this._solid(x, y + h, z)) return false;
            for (const [ox, oz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) if (this._solid(x + ox, y + h, z + oz)) return false;
        }
        return true;
    }

    /** The free line between two points (blocks only; the ghosts' sight and the hero's). */
    _los(a, b, step = 0.5) {
        const d = a.distanceTo(b), n = Math.max(1, Math.ceil(d / step));
        for (let i = 1; i < n; i++) { const k = i / n; if (this._solid(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)) return false; }
        return true;
    }

    /** The floor under a point (its top surface) within 12 m, or null. */
    _floorAt(x, y0, z) {
        if (this._solid(x, y0, z)) return null;
        for (let y = y0; y > y0 - 12; y -= 0.25) if (this._solid(x, y, z)) return Math.floor(y + 1.5) - 0.5;
        return null;
    }

    /** The free height over a floor (to the ceiling), at most 12 m. */
    _roomAt(x, floor, z) {
        for (let y = floor + 0.3; y < floor + 12; y += 0.25) if (this._solid(x, y, z)) return Math.floor(y + 1.5) - 1.5 - floor;
        return 12;
    }

    /** Sets a ghost's size and hover to fit the room at (x, floor, z): false when it does not fit at all. */
    _fit(o, x, floor, z, { low = false } = {}) {
        const room = this._roomAt(x, floor, z);
        const size = Math.min(between(GHOST.SIZE, this.rnd()), room - 0.8);
        if (size < 2.6) return false;
        const hover = low ? Math.min(0.5, room - size - 0.3) : Math.min(between(GHOST.HEIGHT, this.rnd()), room - size - 0.3);
        if (hover < 0.15) return false;
        o.size = size; o.hover = hover; o.floor = floor;
        return true;
    }

    /** A doorway / a narrow passage at a point (walls close on both sides): a ghost never lingers there. */
    _narrow(x, y, z) {
        const near = (dx, dz) => this._solid(x + dx * 1.4, y, z + dz * 1.4) || this._solid(x + dx * 2.4, y, z + dz * 2.4);
        return (near(1, 0) && near(-1, 0)) || (near(0, 1) && near(0, -1));
    }

    // ------------------------------------------------------------------ the hero
    get me() { return this.game.character?.group?.position || null; }
    _feet() { return this.me.y - FEET; }
    _eyeOf(out) { const me = this.me; return out.set(me.x, me.y - FEET + EYE, me.z); }
    /** Where the hero looks (a unit vector). */
    _lookDir(out) {
        const cam = this.game.camera;
        if (cam?.getWorldDirection) return cam.getWorldDirection(out);
        const yaw = this.game.character?.group?.rotation?.y || 0;
        return out.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    _flatLook(out) { this._lookDir(out); out.y = 0; if (out.lengthSq() < 1e-6) out.set(0, 0, 1); return out.normalize(); }
    _isMe(by) { const g = this.game; return by === undefined || by === 'local' || by === 'H' || (by != null && by === g.localId); }
    _at(by) {
        const g = this.game;
        if (this._isMe(by)) return this.me;
        return g.remotes?.get?.(by)?.position || null;
    }
    _hp() { const g = this.game, c = g.combat; return c?.enabled ? { hp: c.hp, max: c.maxHp || 20 } : { hp: g.playerHP ?? 20, max: g.maxHP || 20 }; }

    /** Is the hero somewhere a ghost may pass through him (never a fight, a duel, another body, the air, space, ice, a ritual, low health)? */
    canHarm() {
        const g = this.game, c = g.combat;
        if (!this.me || g.isDeadLocal || c?.dead) return false;
        if (g.beds?.lying || g.beds?.sleeping) return false;
        if (g._inDuel?.() || g.duel?.underFire?.() || g.arenaDuels?.mode) return false;
        if (g.imperius?.busy || g.imperius?.puppet) return false;
        if (g.flight?.busy || g.flight?.active || g.dragonRide?.busy) return false;
        if (g.space?.offEarth) return false;
        if (c?.frozen || g.monster?.active || g.darkLord?.lifting) return false; // (a frozen hero: any blow shatters him — never)
        const { hp, max } = this._hp();
        return mayFlyThrough({ hp, maxHp: max, since: Infinity, roll: 0 });
    }

    // ------------------------------------------------------------------ is there a castle to haunt?
    /** The castle the ghosts haunt now, or null; `hard`: put away at once (no sight, dead, off the Earth), not melt. */
    _wanted() {
        const g = this.game, me = this.me;
        if (!me) return { site: null, hard: true };
        if (!seesInvisible(g) || g.isDeadLocal || g.combat?.dead || g.space?.offEarth || g.duelOnly) return { site: null, hard: true };
        const gc = g.ghostCastle, site = gc?.site || null;
        if (!site || site.shown === false) return { site: null, hard: false };
        if (g.beds?.lying) return { site: null, hard: false, props: site };
        const near = gc.inside?.(me) || (site.covers ? site.covers(me.x, me.z, GHOST.NEAR) : true);
        return { site: near ? site : null, hard: false, props: site };
    }

    // ------------------------------------------------------------------ the frame
    update(dt) {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        this.clock += dt;
        const g = this.game;
        const W = this._wanted();
        // the castle's things: shown while the castle is (and the seer sees)
        this.props.setSite(W.props || W.site || null);
        if (this.me) this.props.update(dt, this.me, this.clock);
        if (W.hard && (this.list.length || this.active)) this.putAway();
        else if (!W.site && this.active) this._meltAll();
        else if (W.site) this._activate(W.site);
        this.inside = !!(W.site && g.ghostCastle?.inside?.(this.me));
        // the ghosts
        if (this.list.length) {
            const director = this.active && this.inside && !(g.imperius?.busy || g.imperius?.puppet);
            if (director) this._scareTick(dt);
            for (const o of this.list) this._step(o, dt);
            if (!this.active && this.list.every((o) => o.fade <= 0.001)) this.putAway();
        }
        this._ambience(dt);
        if (this.chill > 0) this._chillTick(dt);
        this._draw();
        this.afterCombat(); // (also called by Game right after Combat.update — Combat sets the legs' speed every frame)
    }

    _activate(site) {
        if (this.active && this.site === site) return;
        if (this.active && this.site !== site) this.putAway();
        this.active = true;
        this.site = site;
        this._want = GHOST.MIN + Math.floor(this.rnd() * (GHOST.MAX - GHOST.MIN + 1));
        this._exiles = this._exiles.filter((e) => e.until > this.clock);
        // the driven-out ones come back as away ghosts (their time goes on); the rest lurk
        for (const e of this._exiles) { if (this.list.length >= GHOST.MAX) break; const o = this._make(); o.away = true; o.awayT = e.until - this.clock; o.awayWhy = e.why; o.state = 'banished'; this.list.push(o); }
        this._exiles.length = 0;
        while (this.list.length < Math.min(GHOST.MAX, Math.max(this._want, this.list.length))) this.list.push(this._make());
        this._scareT = Math.min(this._scareT, 4 + 4 * this.rnd()); // (the first scare not long after coming in)
        if (this._lastThrough < this.clock - 1e8) this._lastThrough = this.clock; // (never a pass-through in the first gap of a visit)
        this._note({ ev: 'on', n: this.list.length });
    }

    /** Leaving: every ghost melts away (then putAway). */
    _meltAll() {
        this.active = false;
        for (const o of this.list) { o.plan = null; if (o.state !== 'banished') o.state = 'melt'; o.fadeTo = 0; o.fadeRate = 1 / GHOST.FADE_OUT; }
    }

    /** Everything gone at once: no ghosts, nothing drawn, the drone silent (the driven-out ones remembered). */
    putAway() {
        for (const o of this.list) if (o.away && o.awayT > 0 && (o.awayWhy === 'exorcise' || o.awayWhy === 'scatter')) this._exiles.push({ until: this.clock + o.awayT, why: o.awayWhy });
        if (this._exiles.length > GHOST.MAX) this._exiles.splice(0, this._exiles.length - GHOST.MAX);
        this.list.length = 0;
        this.active = false;
        this.site = null;
        this.fx.hide();
        if (this._droneK > 0) { this._droneK = 0; this.game.sound?.ghostDrone?.(0); }
        this._note({ ev: 'away' });
    }

    // ------------------------------------------------------------------ the director
    _scareTick(dt) {
        this._scareT -= dt;
        if (this._scareT > 0) return;
        this._scareT = between(GHOST.SCARE_GAP, this.rnd());
        let sum = 0; for (const s of SCARES) sum += s.w;
        let r = this.rnd() * sum, id = 'sound';
        for (const s of SCARES) { if ((r -= s.w) <= 0) { id = s.id; break; } }
        if (!this.run(id) && !this.run('sound')) this._note({ ev: 'quiet' });
    }

    /** One scare now (the director, tests). @returns true if it happened. */
    run(id) {
        const me = this.me;
        if (!me || !this.active) return false;
        switch (id) {
            case 'sound': return this._sound();
            case 'chair': return this._chair();
            case 'through': return this._mayThrough() ? this._through() : this.run('cross');
            case 'peek': return this._peek();
            case 'cross': return this._cross();
            case 'behind': return this._behind();
        }
        return false;
    }

    _free() { return this.list.find((o) => o.state === 'lurk' && !o.away && o.fade <= 0.001) || null; }

    _mayThrough() {
        if (!this.canHarm()) return false;
        const { hp, max } = this._hp();
        return mayFlyThrough({ hp, maxHp: max, since: this.clock - this._lastThrough, gap: this._throughGap, roll: this.rnd() });
    }

    /** A place for a sound: a spot of the castle 6–25 m off, else a point round the hero. */
    _sound() {
        const me = this.me, spots = this.site?.spots || [];
        let at = null;
        for (let k = 0; k < 8 && spots.length; k++) {
            const s = spots[Math.floor(this.rnd() * spots.length)], d = hdist(s, me);
            if (d > 6 && d < 25) { at = _v.set(s.x, s.y + 2, s.z); break; }
        }
        if (!at) { const a = this.rnd() * TAU, d = 8 + this.rnd() * 14; at = _v.set(me.x + Math.cos(a) * d, this._feet() + 2, me.z + Math.sin(a) * d); }
        const id = SOUNDS_ONLY[Math.floor(this.rnd() * SOUNDS_ONLY.length)];
        this._snd(id, at, 0.9);
        this._note({ ev: 'scare', id: 'sound', s: id });
        return true;
    }

    _chair() {
        if (this.clock < this._propNext) return false;
        const r = this.props.poltergeist(this.me, this._flatLook(_look), this.rnd);
        if (!r) return false;
        this._propNext = this.clock + between(GHOST.PROP_GAP, this.rnd());
        this._snd(r.what === 'out' ? 'fade' : r.what === 'rock' ? 'knock' : 'scrape', _v.set(r.x, r.y, r.z), r.what === 'out' ? 0.6 : 1);
        this._note({ ev: 'scare', id: 'chair', what: r.what, kind: r.kind });
        return true;
    }

    /** Puts a lurking ghost at a hem point and starts its plan. */
    _start(o, x, floor, z, plan, { low = false } = {}) {
        if (!this._fit(o, x, floor, z, { low })) return false;
        o.pos.set(x, floor + o.hover, z);
        if (!this._bodyFree(o.pos.x, o.pos.y, o.pos.z, o.size)) return false;
        o.vel.set(0, 0, 0); o.diss = 0; o.gaze = 0; o.t = 0; o.pose = 0.1;
        o.state = 'scare'; o.plan = plan;
        o.fadeTo = plan.alpha ?? 1; o.fadeRate = 1 / (plan.fadeIn ?? GHOST.FADE_IN);
        this._note({ ev: 'scare', id: plan.type, gid: o.id });
        return true;
    }

    _peek() {
        const o = this._free();
        if (!o) return false;
        const me = this.me, feet = this._feet(), eye = this._eyeOf(_eye);
        const spots = (this.site?.spots || []).filter((s) => { const d = hdist(s, me); return d > 8 && d < 22 && Math.abs(s.y - feet) < 4; });
        const tries = [];
        for (let k = 0; k < 10 && spots.length; k++) tries.push(spots[Math.floor(this.rnd() * spots.length)]);
        for (let k = 0; k < 8; k++) { const a = this.rnd() * TAU, d = 10 + this.rnd() * 11; tries.push({ x: me.x + Math.cos(a) * d, y: feet, z: me.z + Math.sin(a) * d }); }
        for (const s of tries) {
            const floor = this._floorAt(s.x, s.y + 1.5, s.z);
            if (floor == null || Math.abs(floor - feet) > 4) continue;
            if (this._los(eye, _v.set(s.x, floor + 2.5, s.z))) continue; // (it must come out of hiding: not seen where it starts)
            // the corner: step towards the hero until he would see it (never nearer than AFRAID + 2, never in a doorway)
            const dx = me.x - s.x, dz = me.z - s.z, dl = Math.hypot(dx, dz);
            let reveal = null;
            for (let st = 1; st <= 7; st += 0.5) {
                const x = s.x + dx / dl * st, z = s.z + dz / dl * st;
                if (Math.hypot(me.x - x, me.z - z) < GHOST.AFRAID + 2) break;
                if (this._solid(x, floor + 1, z) || this._solid(x, floor + 3, z)) break;
                if (this._los(eye, _w.set(x, floor + 2.5, z))) { if (!this._narrow(x, floor + 1.5, z)) reveal = { x, z }; break; }
            }
            if (!reveal) continue;
            if (this._start(o, s.x, floor, s.z, { type: 'peek', from: new THREE.Vector3(s.x, 0, s.z), to: new THREE.Vector3(reveal.x, 0, reveal.z), stage: 'in', hold: 1.2 + this.rnd() * 0.9 })) {
                if (this.rnd() < 0.5) this._snd('whisper', o.pos, 0.8);
                return true;
            }
        }
        return false;
    }

    _cross() {
        const o = this._free();
        if (!o) return false;
        const me = this.me, feet = this._feet(), eye = this._eyeOf(_eye), f = this._flatLook(_look);
        for (let k = 0; k < 6; k++) {
            const ahead = 7 + this.rnd() * 6, side = this.rnd() < 0.5 ? -1 : 1;
            const cx = me.x + f.x * ahead, cz = me.z + f.z * ahead;
            const floor = this._floorAt(cx, feet + 1.5, cz);
            if (floor == null || Math.abs(floor - feet) > 1.5) continue;
            if (!this._los(eye, _v.set(cx, floor + 2.5, cz))) continue;
            // how far the passage goes on either side (≤ 7 m)
            const px = -f.z, pz = f.x;
            const reach = (s) => { let L = 0; for (let d = 0.5; d <= 7; d += 0.5) { if (this._solid(cx + px * s * d, floor + 1, cz + pz * s * d) || this._solid(cx + px * s * d, floor + 3, cz + pz * s * d)) break; L = d; } return L; };
            const a = reach(-side), b = reach(side);
            if (a + b < 4) continue;
            const sx = cx - px * side * Math.max(0, a - 0.6), sz = cz - pz * side * Math.max(0, a - 0.6);
            const ex = cx + px * side * Math.max(0, b - 0.6), ez = cz + pz * side * Math.max(0, b - 0.6);
            if (this._start(o, sx, floor, sz, { type: 'cross', to: new THREE.Vector3(ex, 0, ez), fadeIn: 0.3 })) {
                this._snd(this.rnd() < 0.5 ? 'fade' : 'whisper', o.pos, 0.8);
                return true;
            }
        }
        return false;
    }

    _behind() {
        const o = this._free();
        if (!o) return false;
        const me = this.me, feet = this._feet(), f = this._flatLook(_look);
        for (let k = 0; k < 6; k++) {
            const back = GHOST.AFRAID + 1 + this.rnd() * 1.5, sw = (this.rnd() - 0.5) * 2;
            const x = me.x - f.x * back - f.z * sw, z = me.z - f.z * back + f.x * sw;
            if (Math.hypot(x - me.x, z - me.z) < GHOST.AFRAID + 1) continue;
            const floor = this._floorAt(x, feet + 1.5, z);
            if (floor == null || Math.abs(floor - feet) > 1) continue;
            if (!this._los(_v.set(me.x, feet + 2, me.z), _w.set(x, floor + 2, z))) continue; // (no wall between)
            if (this._start(o, x, floor, z, { type: 'behind', hold: 1.6 + this.rnd() * 0.8, alpha: 0.75 })) {
                this._snd('whisper', o.pos, 1);
                this._breath(4);
                return true;
            }
        }
        return false;
    }

    _through() {
        const o = this._free();
        if (!o) return false;
        const me = this.me, feet = this._feet(), f = this._flatLook(_look);
        const mid = _u.set(me.x, feet + 2, me.z).clone();
        for (let k = 0; k < 5; k++) {
            const a = (this.rnd() - 0.5) * 0.9, c = Math.cos(a), s = Math.sin(a);
            const dx = f.x * c - f.z * s, dz = f.z * c + f.x * s; // (from ahead, a little to one side)
            const d0 = 9 + this.rnd() * 3, x = me.x + dx * d0, z = me.z + dz * d0;
            const floor = this._floorAt(x, feet + 1.5, z);
            if (floor == null || Math.abs(floor - feet) > 1) continue;
            if (!this._los(_v.set(x, floor + 2, z), mid)) continue;
            if (this._start(o, x, feet, z, { type: 'through', dir: new THREE.Vector3(-dx, 0, -dz), harmed: false, passed: false, fadeIn: 0.45 }, { low: true })) {
                this._lastThrough = this.clock;
                this._throughGap = between(GHOST.THROUGH_GAP, this.rnd());
                this._snd('wail', o.pos, 0.7);
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ one ghost
    _step(o, dt) {
        o.t += dt;
        // its fade (in / out)
        if (o.fade < o.fadeTo) o.fade = Math.min(o.fadeTo, o.fade + dt * o.fadeRate);
        else if (o.fade > o.fadeTo) o.fade = Math.max(o.fadeTo, o.fade - dt * o.fadeRate);
        const me = this.me;
        if (o.away) {
            o.awayT -= dt;
            this._banishedStep(o, dt);
            if (o.awayT <= 0 && o.fade <= 0.001) { o.away = false; o.awayWhy = null; o.state = 'lurk'; o.diss = 0; o.plan = null; this._note({ ev: 'back', gid: o.id }); }
        } else if (o.state === 'scare' && me) {
            // a teleport / the hero far away: gone at once
            if (hdist(o.pos, me) > 60) { this._toLurk(o); }
            else this._plan(o, dt);
        } else if (o.state === 'recoil' && me) {
            _v.set(o.pos.x - me.x, 0, o.pos.z - me.z);
            if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
            _v.normalize().multiplyScalar(GHOST.SPEED * 1.6);
            o.vel.lerp(_v, 1 - Math.exp(-dt * 6));
            this._advance(o, dt, false);
            o.pose = Math.min(1, o.pose + dt * 2);
            if (o.fade <= 0.001) this._toLurk(o);
        } else if (o.state === 'melt') {
            o.vel.multiplyScalar(Math.exp(-dt * 2));
            this._advance(o, dt, false);
            if (o.fade <= 0.001) this._toLurk(o);
        }
        // the look of it: a lazy bob, the yaw
        o.trail = 0.6 + Math.min(1.2, o.vel.length() / 6);
        const bob = Math.sin(this.clock * 1.3 + o.seed * 9) * 0.12;
        o.model.position.set(o.pos.x, o.pos.y + bob + o.size * 0.5, o.pos.z);
        o.alpha = o.fade * ghostAlpha(this.clock, o.seed) * (1 - o.diss);
        o.model.visible = o.alpha > 0.05;
    }

    _toLurk(o) { o.state = 'lurk'; o.plan = null; o.fade = 0; o.fadeTo = 0; o.vel.set(0, 0, 0); o.pose = 0; o.gaze = 0; }

    /** It recoils from the hero and melts (they fear him). */
    _recoil(o, why) {
        if (o.state !== 'scare') return;
        o.state = 'recoil'; o.plan = null;
        o.fadeTo = 0; o.fadeRate = 1 / (GHOST.FADE_OUT * 0.6);
        if (this.rnd() < 0.5) this._snd('fade', o.pos, 0.6);
        this._note({ ev: 'recoil', gid: o.id, why });
    }

    /** Moves by its velocity unless a wall is there: @returns false when blocked (it stays). */
    _advance(o, dt, strict = true) {
        const nx = o.pos.x + o.vel.x * dt, ny = o.pos.y + o.vel.y * dt, nz = o.pos.z + o.vel.z * dt;
        if (!this._bodyFree(nx, ny, nz, o.size)) { o.vel.multiplyScalar(0.3); return false; }
        if (strict && o.plan?.type !== 'through') { // (never nearer the hero than AFRAID by its own going)
            const me = this.me;
            if (me && Math.hypot(nx - me.x, nz - me.z) < GHOST.AFRAID && Math.hypot(nx - me.x, nz - me.z) < Math.hypot(o.pos.x - me.x, o.pos.z - me.z)) { this._recoil(o, 'near'); return false; }
        }
        o.pos.set(nx, ny, nz);
        return true;
    }

    _steer(o, tx, tz, speed, dt, k = 3) {
        _v.set(tx - o.pos.x, 0, tz - o.pos.z);
        const d = _v.length();
        if (d > 1e-3) _v.multiplyScalar(Math.min(speed, d * 2 + 0.4) / d); else _v.set(0, 0, 0);
        o.vel.lerp(_v, 1 - Math.exp(-dt * k));
        o.vel.y = (o.floor + o.hover - o.pos.y) * 2;
        return d;
    }

    _face(o, x, z, dt, k = 4) { o.yaw += angDiff(o.yaw, Math.atan2(x - o.pos.x, z - o.pos.z)) * Math.min(1, dt * k); }

    _plan(o, dt) {
        const P = o.plan, me = this.me;
        if (!P) { this._toLurk(o); return; }
        // they fear the hero: too near, or stared at
        if (P.type !== 'through') {
            const d = Math.hypot(o.pos.x - me.x, o.pos.z - me.z);
            if (d < GHOST.AFRAID && Math.abs(o.pos.y + o.size * 0.5 - this._feet() - 2) < 5) { this._recoil(o, 'near'); return; }
            if (o.fade > 0.4 && (o._losT = (o._losT || 0) - dt) <= 0) {
                o._losT = 0.2;
                const eye = this._eyeOf(_eye), look = this._lookDir(_look);
                _v.copy(o.model.position).sub(eye);
                const dist = _v.length();
                o._seen = dist > 0.1 && _v.dot(look) / dist > GHOST.GAZE_COS && this._los(eye, o.model.position);
            }
            if (o._seen) o.gaze += dt; else o.gaze = Math.max(0, o.gaze - dt * 0.5);
            if (o.gaze > (P.type === 'behind' ? 0.4 : 1.5)) { this._recoil(o, 'gaze'); return; }
        }
        switch (P.type) {
            case 'peek': {
                if (P.stage === 'in') {
                    const d = this._steer(o, P.to.x, P.to.z, GHOST.SPEED, dt);
                    this._face(o, me.x, me.z, dt, 2);
                    if (!this._advance(o, dt) && o.state === 'scare') { this._recoil(o, 'wall'); return; }
                    if (d < 0.4) { P.stage = 'look'; P.t = 0; }
                } else if (P.stage === 'look') {
                    P.t += dt;
                    this._steer(o, P.to.x, P.to.z, 0.5, dt);
                    this._advance(o, dt);
                    this._face(o, me.x, me.z, dt, 5);
                    o.pose = Math.min(0.7, o.pose + dt);
                    if (P.t > P.hold) { P.stage = 'out'; o.fadeTo = 0; o.fadeRate = 1 / GHOST.FADE_OUT; }
                } else {
                    this._steer(o, P.from.x, P.from.z, GHOST.SPEED * 0.8, dt);
                    this._face(o, o.pos.x + o.vel.x, o.pos.z + o.vel.z, dt);
                    this._advance(o, dt);
                    o.pose = Math.max(0, o.pose - dt);
                    if (o.fade <= 0.001) this._toLurk(o);
                }
                break;
            }
            case 'cross': {
                const d = this._steer(o, P.to.x, P.to.z, GHOST.DART, dt, 6);
                this._face(o, o.pos.x + o.vel.x, o.pos.z + o.vel.z, dt, 8);
                o.pose = 0.3;
                const ok = this._advance(o, dt);
                if (o.state !== 'scare') return;
                if (d < 1.2 || !ok || o.t > 3) { o.fadeTo = 0; o.fadeRate = 1 / 0.35; }
                if (o.fadeTo === 0 && o.fade <= 0.001) this._toLurk(o);
                break;
            }
            case 'behind': {
                o.vel.multiplyScalar(Math.exp(-dt * 3));
                o.vel.y = (o.floor + o.hover - o.pos.y) * 2;
                this._advance(o, dt);
                this._face(o, me.x, me.z, dt, 5);
                o.pose = Math.min(1, o.pose + dt * 0.8);
                if (o.t > P.hold && o.fadeTo > 0) { o.fadeTo = 0; o.fadeRate = 1 / GHOST.FADE_OUT; }
                if (o.fadeTo === 0 && o.fade <= 0.001) this._toLurk(o);
                break;
            }
            case 'through': {
                const speed = GHOST.SPEED * 2.2;
                if (!P.passed) { _v.set(me.x - o.pos.x, 0, me.z - o.pos.z); if (_v.lengthSq() > 0.01) P.dir.copy(_v.normalize()); }
                _v.copy(P.dir).multiplyScalar(speed);
                o.vel.lerp(_v, 1 - Math.exp(-dt * 5));
                o.vel.y = (this._feet() + 0.4 - o.pos.y) * 2; // (low: the sheet takes the whole body)
                this._face(o, me.x, me.z, dt, 6);
                o.pose = Math.min(1, o.pose + dt * 2);
                if (!this._advance(o, dt)) { o.fadeTo = 0; o.fadeRate = 1 / 0.4; }
                const d = Math.hypot(o.pos.x - me.x, o.pos.z - me.z);
                if (!P.harmed && d < 0.9) { P.harmed = true; P.passed = true; if (this.canHarm()) this._hurt(); else this._note({ ev: 'through-spared' }); }
                if (P.passed && d > 4) { o.fadeTo = 0; o.fadeRate = 1 / 0.6; }
                if (o.t > 5) { o.fadeTo = 0; o.fadeRate = 1 / 0.5; P.passed = true; }
                if (o.fadeTo === 0 && o.fade <= 0.001) this._toLurk(o);
                break;
            }
        }
    }

    // ------------------------------------------------------------------ the one harm
    _hurt() {
        const g = this.game, c = g.combat;
        const dmg = GHOST.THROUGH_DMG;
        if (c?.enabled) c.damage?.(dmg, null, 'ghost'); else g.damageLocalPlayer?.(dmg, 'ghost');
        this.chill = GHOST.CHILL;
        this._snd('chill', this.me, 1);
        this._breath(8);
        g.hud?.setVoice?.('👻 Сквозь вас пролетел призрак: −1 ❤ и холод на несколько секунд', true);
        this._note({ ev: 'through', dmg });
    }

    _chillTick(dt) {
        this.chill = Math.max(0, this.chill - dt);
        const hud = this.game.hud, k = this.chill / GHOST.CHILL;
        hud?.setFrozenOverlay?.(Math.max(this.game.combat?.chill || 0, 0.45 * k));
        if ((this._breathT -= dt) <= 0) { this._breathT = 0.7; this._breath(3); }
    }

    /** The legs are slowed by the cold (Character.slowScale; Combat sets it every frame, so this goes after it). */
    afterCombat() {
        const ch = this.game.character;
        if (!ch) return;
        if (this.chill > 0) {
            const cur = ch.slowScale ?? 1;
            const base = this._slowSet != null && cur === this._slowSet ? this._slowBase : cur;
            this._slowBase = base;
            this._slowSet = ch.slowScale = base * GHOST.CHILL_SLOW;
        } else if (this._slowSet != null) {
            if (ch.slowScale === this._slowSet) ch.slowScale = this._slowBase;
            this._slowSet = null;
        }
    }

    /** A cold breath before the hero's face (white puffs). */
    _breath(n) {
        const fx = this.game.fx, me = this.me;
        if (!fx?.spark || !me) return;
        const f = this._flatLook(_look);
        _v.set(me.x + f.x * 0.5, this._feet() + 3.15, me.z + f.z * 0.5);
        for (let i = 0; i < n; i++) fx.spark(_v, i % 2 ? 0xdfeeff : 0xffffff, 0.06 + this.rnd() * 0.05, _w.set(f.x * 0.6 + (this.rnd() - 0.5) * 0.3, 0.15 + this.rnd() * 0.2, f.z * 0.6 + (this.rnd() - 0.5) * 0.3), 0.9 + this.rnd() * 0.5);
    }

    // ------------------------------------------------------------------ spells
    _verdict(kind) {
        if (kind === 'Imperius' || kind === 'ImperiusMaxima') return ghostSpell('Imperius'); // (no body, no will: never taken — even by the gods' «Империус Максима»)
        return ghostSpell(kind, { divine: isDivine(kind) });
    }

    _hint(by) {
        if (!this._isMe(by) || this.clock - this._hintT < 20) return;
        this._hintT = this.clock;
        this.game.hud?.setVoice?.(NO_EFFECT_HINT, true);
    }

    /** Any harm / spell on a ghost: decided by GhostRules.GHOST_SPELLS. @returns the verdict ('exorcise' | 'blown' | 'scared' | 'scatter' | 'none'). */
    hit(o, dmg, kind, by) {
        if (!o || !this.list.includes(o)) return 'none';
        const v = this._verdict(kind);
        this._note({ ev: 'hit', gid: o.id, kind, does: v.does });
        switch (v.does) {
            case 'exorcise': this._banish(o, 'exorcise', false, this._at(by)); break;
            case 'blown': this._banish(o, 'blown', kind === 'WindMaxima' || kind === 'Wind Maxima', this._at(by)); break;
            case 'scared': this._banish(o, 'scared', /Maxima/.test(String(kind)), this._at(by)); break;
            case 'scatter': this._banish(o, 'scatter', false, this._at(by)); break;
            default: if (o.alpha > 0.2) this._hint(by);
        }
        return v.does;
    }

    hitAt(p, radius, dmg, kind, by) {
        let any = false;
        for (const o of this.targets()) {
            const c = ghostBody(o, _cap);
            if (segDist(p, c.a, c.b) < radius + c.r && this.hit(o, dmg, kind, by) !== 'none') any = true;
        }
        return any;
    }

    /** A ray / a beam: @returns true if it drove a ghost away (a bodiless ghost does not stop anything else). */
    hitRay(org, d, len, width, dmg, kind, by) {
        let any = false;
        for (const o of this.targets()) {
            const b = ghostBody(o, _cap);
            let hit = false;
            for (let k = 0; k <= 4 && !hit; k++) {
                const q = _v.lerpVectors(b.a, b.b, k / 4);
                const along = _w.subVectors(q, org).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _w.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit && this.hit(o, dmg, kind, by) !== 'none') any = true;
        }
        return any;
    }

    /** A duel charge touched it: it flies through unless the spell drives ghosts away (GHOST_SPELLS). @returns true if the ghost took it. */
    boltHit(o, spell, by) { return this.hit(o, 0, spell, by) !== 'none'; }

    /** «Nihilis Atra»'s cone (every computer: Nihilis.fire): every ghost in it wails and dissolves. @returns how many. */
    exorcise({ o, d, range = NIHIL.RANGE, by } = {}) {
        if (!o || !d) return 0;
        let n = 0;
        for (const g of this.list) {
            if (g.awayWhy === 'exorcise' || g.fade <= 0.05) continue;
            if (inCone(o, d, g.model.position, GHOST.FOOT + 0.6, range) < 0) continue;
            this._banish(g, 'exorcise', false, o);
            n++;
        }
        if (n) this._note({ ev: 'exorcise', n, by });
        return n;
    }

    /**
     * «Wind» / «Wind Maxima»: the ghosts in the gust fly away in fright and melt (back after GHOST.BLOWN s, ×2.2 strong).
     * `dir` (unit): a cone along it; null or straight up/down — a ring round `origin` (the wind ring: SpellManager passes up). `power`: the spell's
     * (1 «Wind», 2 «Wind Maxima», 3 the ring) — the reach goes by `strong`.
     */
    blow(origin, dir, power = 1, by, strong = false) {
        if (!origin) return 0;
        if (dir && Math.abs(dir.y) > 0.95) dir = null;
        const reach = (strong ? 36 : 24) * (dir ? 1 : 0.8);
        let n = 0;
        for (const g of this.list) {
            if (g.fade <= 0.05 || (g.away && RANK[g.awayWhy] > RANK.blown)) continue;
            const p = g.model.position;
            _v.subVectors(p, origin);
            if (dir) {
                const along = _v.dot(dir);
                if (along < -1 || along > reach) continue;
                const off = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
                if (off > 2.2 + Math.max(0, along) * 0.45) continue;
            } else if (_v.length() > reach) continue;
            this._banish(g, 'blown', strong, origin, dir);
            n++;
        }
        return n;
    }

    /** «Circle Attack», «Inspirius», a bright «Lumos»: the ghosts within r vanish for a while. */
    scare(p, r, strong = false) {
        if (!p) return 0;
        let n = 0;
        for (const g of this.list) {
            if (g.fade <= 0.05 || (g.away && RANK[g.awayWhy] > RANK.scared)) continue;
            if (g.model.position.distanceTo(p) > r + GHOST.FOOT) continue;
            this._banish(g, 'scared', strong, p);
            n++;
        }
        return n;
    }

    /** Away for its time (the strongest verdict wins; the time never shrinks), with its own way of going. */
    _banish(o, why, strong = false, from = null, dir = null) {
        if (o.away && RANK[o.awayWhy] > RANK[why]) return;
        const t = awayFor(why, strong);
        o.awayT = Math.max(o.away ? o.awayT : 0, t);
        o.away = true; o.awayWhy = why; o.state = 'banished'; o.plan = null; o.ban = { t: 0 };
        const pos = o.model.position;
        if (why === 'blown') {
            if (dir) _v.copy(dir); else if (from) _v.subVectors(pos, from); else _v.set(Math.sin(o.yaw), 0, Math.cos(o.yaw));
            _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
            o.vel.copy(_v.normalize().multiplyScalar(strong ? 22 : 14)); o.vel.y = 1.5;
            o.fadeTo = 0; o.fadeRate = 1 / 1.3; o.pose = 1;
            this._snd('wail', pos, 0.6);
        } else if (why === 'scared') {
            const me = this.me;
            if (from || me) _v.subVectors(pos, from || me); else _v.set(1, 0, 0);
            _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
            o.vel.copy(_v.normalize().multiplyScalar(6));
            o.fadeTo = 0; o.fadeRate = 1 / 0.35;
            this._snd('fade', pos, 0.8);
        } else { // exorcise / scatter: it wails and dissolves upward in glowing holes
            o.vel.set(0, 0.6, 0);
            o.fadeTo = o.fade; o.pose = 1;
            o.ban.dur = why === 'exorcise' ? 2.2 : 0.8;
            this._snd('wail', pos, 1);
            const fx = this.game.fx;
            if (fx?.spark && this.game.sight?.sees) for (let i = 0; i < 26; i++) fx.spark(pos, i % 3 ? 0xcfe6ff : 0x8fb8ff, 0.07 + 0.08 * this.rnd(), _w.set((this.rnd() - 0.5) * 2.5, 0.6 + this.rnd() * 2, (this.rnd() - 0.5) * 2.5), 1 + this.rnd());
        }
        this._note({ ev: 'banish', gid: o.id, why, t: Math.round(o.awayT) });
    }

    _banishedStep(o, dt) {
        const B = o.ban || (o.ban = { t: 0 });
        B.t += dt;
        if (o.fade <= 0.001 && !(o.diss > 0 && o.diss < 1)) { o.vel.set(0, 0, 0); return; }
        if (o.awayWhy === 'exorcise' || o.awayWhy === 'scatter') {
            o.diss = Math.min(1, B.t / (B.dur || 1));
            o.pos.addScaledVector(o.vel, dt); // (rising: no wall test needed — it is coming apart)
            if (o.diss >= 1) { o.fade = 0; o.fadeTo = 0; }
            return;
        }
        o.vel.multiplyScalar(Math.exp(-dt * 0.8));
        this._advance(o, dt, false);
        this._face(o, o.pos.x - o.vel.x, o.pos.z - o.vel.z, dt, 6); // (looking back at what frightened it)
    }

    // ------------------------------------------------------------------ sounds, look
    _snd(id, pos, vol = 1) {
        if (!pos || !seesInvisible(this.game)) return;
        this.game.sound?.playGhost?.(pos, id, vol);
    }

    _ambience(dt) {
        const g = this.game;
        const want = this.inside && this.active ? 0.38 : 0;
        const k = this._droneK + (want - this._droneK) * Math.min(1, dt * 0.8);
        const next = Math.abs(k - want) < 0.005 ? want : k;
        if (next !== this._droneK) { this._droneK = next; g.sound?.ghostDrone?.(next); }
        if (this.inside && this.active && (this._bellT -= dt) <= 0) {
            this._bellT = 45 + 55 * this.rnd();
            const me = this.me, a = this.rnd() * TAU;
            this._snd('bell', _v.set(me.x + Math.cos(a) * 35, me.y + 20, me.z + Math.sin(a) * 35), 0.7);
        }
    }

    _draw() {
        const g = this.game;
        const any = this.list.some((o) => o.fade > 0.01);
        if (!any || !seesInvisible(g)) { this.fx.hide(); return; }
        if (!this._added && g.scene) { g.scene.add(this.fx.mesh); this._added = true; }
        const cam = g.camera?.getWorldPosition ? g.camera.getWorldPosition(_cam) : null;
        const list = this._drawList || (this._drawList = []);
        list.length = 0;
        for (const o of this.list) {
            if (o.fade <= 0.01) continue;
            const v = o._dv || (o._dv = { pos: new THREE.Vector3(), lean: new THREE.Vector3() });
            v.pos.set(o.pos.x, o.model.position.y - o.size * 0.5, o.pos.z);
            v.lean.copy(o.vel);
            v.yaw = o.yaw; v.size = o.size; v.phase = o.phase; v.fade = o.fade * (1 - 0.15 * o.diss); v.pose = o.pose; v.seed = o.seed; v.trail = o.trail; v.diss = o.diss * 0.95;
            list.push(v);
        }
        this.fx.draw(list, cam, this.clock, ghostAlpha(this.clock, 0.4), 0.92);
    }

    dispose() {
        this.putAway();
        this.props.dispose();
        this.fx.dispose();
        if (this._slowSet != null && this.game.character) { this.game.character.slowScale = this._slowBase; this._slowSet = null; }
    }
}
