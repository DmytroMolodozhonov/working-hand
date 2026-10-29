/**
 * ItemSwarmRules.js — the shared, pure (no THREE) heart of a SWARM OF THINGS held up by magic.
 * Used by «Вингардиум Левиоса Максима» as the «дирижёр предметов» (ItemSwarm.js); any other spell that
 * wants a crowd of things round the hero (a ground vortex, a stone shield…) uses the same four modes:
 *
 *   train   «паровозик»: the wand leads, the first thing hangs at the wand's point, every next one follows
 *           the one before it at SPACING m, with a lag and a little wave — in the order they were lifted.
 *   orbit   «вихрь»: the hand goes round and round → the things wind round the hero in rings, as fast
 *           as the hand goes (the sign of the turn is the way round).
 *   shield  «щит»: the things close up into a wall between the hero and where the wand points / the threat
 *           comes from; a hit lands IN THE THINGS (`absorb`), not in the hero. A thing that took too much
 *           breaks out of the wall and falls.
 *   launch  «атака»: the things fly one after another at the target (or along the wand), each hits once,
 *           with the damage of its weight × speed (`hitDamage`, capped), and then falls like any thing.
 *
 * Plain {x, y, z} everywhere; the game feeds the world in (`blocked`, `floorY`, `bodies`) and acts on the
 * returned events. The hero is ~3.5 m tall (eyes ≈ 3.4 m, hand ≈ 2 m), a block is 1 m — the distances below
 * are in those metres (CLAUDE.md: sizes from the world's measures).
 */

import { isGodGift } from './ItemTypes.js';

export const SWARM = {
    MAX_ITEMS: 32, // things at once (FPS: each is its own model already in the scene; one cord line joins them)
    PER_ITEM: 0.3, // mana a second for each thing after the first …
    CAP: 8, // … but never more than this extra a second in all (the spell's own 2 a second comes on top)
    RANGE: 40, // m the wand reaches for a thing to take
    CONE: 0.3, // rad round the wand's line (a thing is easy to point at)
    DWELL: 0.3, // s the wand rests on a thing before it joins (sweeping across the ground takes nothing)
    HOLD: 5.5, // m: the head of the train hangs this far in front of the hand
    SPACING: 1.6, // m between the things of the train
    FOLLOW: 6.5, // 1/s: how fast a thing closes on its place (smaller = a longer lag)
    LIFT_RISE: 5, // 1/s: a thing taken low rises onto the train this fast
    BOB: 0.22, // m of bobbing
    WAVE: 0.5, // m of side-to-side wave along the tail
    RING_CAP: 10, // things in one ring
    R0: 3.2, // m: the first ring round the hero (the body is ~1 m wide, the arms 2 m)
    R_GAP: 1.3, // m between rings
    RING_H: 1.3, // m of height between rings
    OMEGA_MIN: 1.6, // rad/s: the ring turns this slowly at least while the vortex holds
    OMEGA_MAX: 13, // rad/s
    TURN_ON: 0.55, // turns a second of the hand that make it a vortex
    TURN_OFF: 0.2, // below this …
    TURN_OFF_T: 0.9, // … for this long → back to the train
    SHIELD_D: 5, // m: the wall hangs this far from the hero's middle
    SHIELD_MIN: 3, // things it takes to make a wall
    SHIELD_GAP: 1.15, // m between the things of the wall
    SHIELD_ARC_MIN: 0.45, // rad: half the width of the smallest wall …
    SHIELD_ARC_MAX: 1.3, // … and of the biggest
    SHIELD_TURN: 6, // 1/s: how fast the wall swings to where the wand points
    LAUNCH_V0: 16, // m/s
    LAUNCH_ACCEL: 30, // m/s²
    LAUNCH_VMAX: 34,
    LAUNCH_GAP: 0.07, // s between the things of a volley
    LAUNCH_LIFE: 2.8, // s in flight at most
    LAUNCH_RANGE: 70, // m
    HOMING: 3.2, // rad/s: how much a flying thing turns towards the one aimed at (never a hard turn)
    HIT_R: 0.55, // m added to a creature's own size
    MAX_DMG: 10, // hearts one thing can do
    G: 22, // m/s² (as everything that falls in the game)
    HOLD_BACK: 0.6, // a thing let go of keeps this much of its speed
};

/** Mana a second the things cost besides the spell's own: moderate each, never past the cap. */
export function swarmDrain(n) {
    return Math.min(SWARM.CAP, SWARM.PER_ITEM * Math.max(0, n - 1));
}

/**
 * «На кого и на что» (CLAUDE.md) — what a swarm does to every creature and thing, in the modes that touch
 * them (a launched thing; a wall that takes a spell). «Не действует» is a decision too, with its reason.
 * tests/unit/object-swarm.test.js and spell-targets.test.js read it.
 */
export const SWARM_TARGETS = {
    me: { why: 'свой же — нет: рой послушен своему колдуну; снаряд колдуна его рой не задевает' },
    players: { why: 'другие игроки: вещь бьёт по массе × скорости (хост решает, компьютер игрока знает свой щит — Protection/доспехи гасят); рой других игроков видят все' },
    zombies: { why: 'ранит (масса × скорость, потолок MAX_DMG) и толкает (CreatureImpact), тяжёлое валит с ног' },
    castlePeople: { why: 'жители, рыцари, король, волшебники: ранит и толкает; броня рыцаря гасит; жители пугаются (castleLife.alarm); волшебник вещи не отбивает' },
    animals: { why: 'ранит и толкает; не опасно для крупного скота — ушиб, а не смерть' },
    sailors: { why: 'моряки: ранит и толкает; капитан Чёрные Усы и скелеты — как моряки (скелеты от тяжёлого рассыпаются)' },
    spider: { why: 'гигантская паучиха: вещь отскакивает — слишком крупная, ранит только огонь и заклинания' },
    livingTrees: { why: 'живое дерево: вещь отскакивает, его ранит только огонь' },
    bookBirds: { why: 'книги-птицы: не задеваются (они летят сами, вещь пролетает мимо)' },
    phoenix: { why: 'феникс: вещь пролетает мимо — он уворачивается' },
    owl: { why: 'сова: вещь пролетает мимо — она вспархивает раньше' },
    canary: { why: 'канарик: залп вещей ранит и толкает как удар; лагерь сердится на колдующего' },
    spencer: { why: 'птичка Спенсера: вещь пролетает мимо — она вспархивает раньше' },
    gargoyle: { why: 'горгулья: вещь, пролетевшая в залпе, ранит её как удар (×1); щит из вещей её укус не держит — только «Protection»' },
    dragon: { why: 'дракон: вещь отскакивает от шкуры; дракон не оружие и не злится на вещь' },
    iceCastle: { why: 'Ледяная Королева, снеговики и ледяные монстры: вещь отскакивает (холод и магия держат их); не повреждают' },
    ships: { why: 'вещи летят в координатах мира: палуба и борт корабля — препятствие, вещь падает на палубу или за борт; чужой корабль не повреждается' },
    looseThings: { why: 'берутся все вещи на земле (не дары богов, не товар на прилавке, не лежащие в котле, не на «Акцио»); оружие, книги и книги-птицы берёт обычная «Левиоса»' },
    godGifts: { why: 'не берутся: дары богов (пьедесталы, Ледяной Жезл, свитки храма) — никакое заклинание их не двигает' },
    world: { why: 'вещи не проходят сквозь землю, стены, двери, дома и палубы: упираются и падают; блоки земли не берутся (это «Ground Vortex»)' },
    shield: { why: 'щит принимает дуэльные заряды и снаряды, что летят В колдуна из-за стены; каждая вещь держит удар ограниченно, потом выбита и падает; божественные заклинания и взрывы сзади щит не держит' },
};

/** Why a loose thing (Items.loose entry `L`) cannot join; null when it can. */
export function itemRefusal(L, ctx = {}) {
    if (!L || !L.item) return 'нет такой вещи';
    if (isGodGift(L.item)) return 'дар богов — её не двигает никакая магия';
    if (L.item.shop && !L.item.shop.paid) return 'товар не оплачен';
    if (L.lev || L.swarm) return 'уже поднята';
    if (L.accio || L.asked) return 'её уже зовёт другое заклинание';
    if (L.inCaul) return 'лежит в котле';
    if (L.away) return 'слишком далеко';
    if (ctx.held && ctx.held.has?.(L.item.uid)) return 'в руке';
    return null;
}

/** The thing the wand points at best (smallest miss), or null: items [{id, x, y, z, r}], hand and unit dir. */
export function aimedAt(items, hand, dir, { range = SWARM.RANGE, cone = SWARM.CONE } = {}) {
    let best = null;
    for (const it of items) {
        const tx = it.x - hand.x, ty = it.y - hand.y, tz = it.z - hand.z;
        const d = Math.hypot(tx, ty, tz);
        if (d > range || d < 0.3) continue;
        const cos = (tx * dir.x + ty * dir.y + tz * dir.z) / d;
        const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
        const r = it.r ?? 0.4;
        if (ang > cone + Math.atan2(r, d)) continue;
        const score = Math.max(0, ang - Math.atan2(r, d)) * 10 + d * 0.01;
        if (!best || score < best.score) best = { id: it.id, score, d };
    }
    return best;
}

/** Damage of a thing of `weight` (ItemTypes weight) flying at `speed` m/s: whole hearts, at least 1, never over MAX_DMG. */
export function hitDamage(weight, speed) {
    return Math.max(1, Math.min(SWARM.MAX_DMG, Math.round(0.5 * (weight || 1) * speed * speed / 25)));
}

/** How hard a thing's blow shoves (hero m/s, along the flight) — a heavy one more, never over 7. */
export function hitPush(weight, speed) {
    return Math.min(7, 1.5 + (weight || 1) * speed * 0.1);
}

/** How much of a wall-thing's strength a blow of this kind takes (1 = the thing breaks out). */
export const ABSORB = { weak: 0.34, normal: 0.5, strong: 1, huge: 3 };
const STRONG = new Set(['AvadaKedavra', 'BombardoMaxima', 'Bombardo', 'Hellfire', 'Thunderwave', 'Electrum', 'Inferno', 'LightningStrike', 'Boom', 'WaterVortex', 'FireMaxima', 'punch', 'bite', 'dragonFire']);
const WEAK = new Set(['Sands', 'Sapira', 'Ice', 'Frozen', 'Jolt', 'Stupefy', 'Expelliarmus', 'Disarmor', 'snow', 'web', 'poison']);
export function absorbOf(kind) {
    if (/Maxima$/.test(kind || '') && !STRONG.has(kind)) return ABSORB.strong;
    if (STRONG.has(kind)) return ABSORB.strong;
    if (WEAK.has(kind)) return ABSORB.weak;
    return ABSORB.normal;
}
/** Divine blows (the gods' spells) are not held by things: the wall is swept away (ProtectionGods.isDivine decides who). */
export function wallBreaks(divine) {
    return !!divine;
}

/** How wide the wall is (half the angle, rad) for n things. */
export function wallHalfArc(n) {
    return Math.max(SWARM.SHIELD_ARC_MIN, Math.min(SWARM.SHIELD_ARC_MAX, 0.25 + 0.06 * n));
}

/** Slots of the wall: [{u (rad off the wall's middle), v (m up from the hero's middle)}] — rows of an arc. */
export function wallSlots(n) {
    const half = wallHalfArc(n);
    const cols = Math.max(1, Math.min(n, Math.round((2 * half * SWARM.SHIELD_D) / SWARM.SHIELD_GAP)));
    const rows = Math.ceil(n / cols);
    const out = [];
    for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const inRow = Math.min(cols, n - r * cols);
        const u = inRow === 1 ? 0 : (c / (inRow - 1) - 0.5) * 2 * half * (inRow / cols);
        out.push({ u, v: (r - (rows - 1) / 2) * SWARM.SHIELD_GAP + 0.6 });
    }
    return out;
}

/** Rings of the vortex: [{ring, k (place in it), cnt (things in it)}] — filled from the inner ring out. */
export function ringSlots(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const ring = Math.floor(i / SWARM.RING_CAP);
        const cnt = Math.min(SWARM.RING_CAP, n - ring * SWARM.RING_CAP);
        out.push({ ring, k: i - ring * SWARM.RING_CAP, cnt });
    }
    return out;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class SwarmSim {
    constructor() {
        this.members = []; // in the order they were lifted: {id, x, y, z, vx, vy, vz, ph, hp, fly}
        this.mode = 'train';
        this.spin = 0; // rad: how far the rings have turned
        this.wallYaw = 0; // rad (atan2(x, z)): where the wall is
        this.t = 0;
        this._slow = 0;
        this._volley = []; // [{m, at}] things waiting for their turn to fly
    }

    get size() { return this.members.length; }
    has(id) { return this.members.some((m) => m.id === id); }
    flying() { return this.members.filter((m) => m.fly); }

    /** A thing joins at `p`. → false when full / already in. */
    add(id, p) {
        if (this.members.length >= SWARM.MAX_ITEMS || this.has(id)) return false;
        this.members.push({ id, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, ph: Math.random() * 6.283, hp: 1, fly: null });
        return true;
    }

    /** A thing leaves (taken by a hand, burnt…). → it (or null). */
    remove(id) {
        const i = this.members.findIndex((m) => m.id === id);
        if (i < 0) return null;
        this._volley = this._volley.filter((v) => v.m.id !== id);
        return this.members.splice(i, 1)[0];
    }

    /** The wall (or anything) is up with enough things in it. */
    wallUp() { return this.mode === 'shield' && this.members.filter((m) => !m.fly).length >= SWARM.SHIELD_MIN; }

    /** Does the wall stand between the hero and a threat at direction (dx, dz) from the hero? */
    faces(dx, dz) {
        if (!this.wallUp()) return false;
        const half = wallHalfArc(this.members.length);
        return Math.abs(wrap(Math.atan2(dx, dz) - this.wallYaw)) <= half + 0.12;
    }

    /**
     * The wall takes a blow from direction (dx, dz): the thing in line takes `power` (ABSORB) of its strength.
     * → {m, broke}: the thing that took it and whether it broke out of the wall (it falls then); null when no wall.
     */
    absorb(dx, dz, power = ABSORB.normal) {
        if (!this.wallUp()) return null;
        const slots = wallSlots(this.members.length);
        const want = wrap(Math.atan2(dx, dz) - this.wallYaw);
        let best = null, bi = -1;
        this.members.forEach((m, i) => {
            if (m.fly || !slots[i]) return;
            const d = Math.abs(slots[i].u - want);
            if (!best || d < best.d) { best = { m, d }; bi = i; }
        });
        if (!best) return null;
        best.m.hp -= power;
        best.m.kick = 1; // (the game jolts it)
        const broke = best.m.hp <= 0;
        if (broke) {
            // out of the wall: thrown back a little, then it falls
            best.m.fly = null;
            best.m.out = true;
            const s = Math.hypot(dx, dz) || 1;
            best.m.vx = -dx / s * 5; best.m.vz = -dz / s * 5; best.m.vy = 3;
        }
        return { m: best.m, broke };
    }

    /**
     * One frame. `I`: {head, body (the hero's middle), omega (rad/s, signed), wandYaw (where the wand points, rad),
     * blocked(x,y,z), floorY(x,z,y), bodies [{id, kind, x, y, z, r}], aim {x,y,z}|null, dir {x,y,z}|null} → events
     * [{type:'hit', m, body, v}, {type:'land', m, how}].
     */
    step(dt, I) {
        const ev = [];
        this.t += dt;
        const ms = this.members;
        // the volley: a thing at a time leaves the swarm
        if (this._volley.length) {
            for (let i = this._volley.length - 1; i >= 0; i--) {
                const v = this._volley[i];
                if (this.t < v.at) continue;
                this._volley.splice(i, 1);
                this._release(v.m, I);
            }
        }
        const live = ms.filter((m) => !m.fly && !m.out);
        if (this.mode === 'orbit') {
            const om = Math.sign(I.omega || 1) * Math.max(SWARM.OMEGA_MIN, Math.min(SWARM.OMEGA_MAX, Math.abs(I.omega || 0)));
            this.spin += om * dt;
        }
        if (this.mode === 'shield') this.wallYaw = wrap(this.wallYaw + wrap((I.wandYaw ?? this.wallYaw) - this.wallYaw) * (1 - Math.exp(-dt * SWARM.SHIELD_TURN)));
        const slotsR = this.mode === 'orbit' ? ringSlots(live.length) : null;
        const slotsW = this.mode === 'shield' ? wallSlots(live.length) : null;
        const nRings = slotsR ? Math.ceil(live.length / SWARM.RING_CAP) : 0;
        let prev = null;
        live.forEach((m, i) => {
            if (this.mode !== 'orbit' && m.oa !== undefined) m.oa = undefined;
            const g = { x: m.x, y: m.y, z: m.z };
            let k = 1 - Math.exp(-dt * SWARM.FOLLOW);
            if (this.mode === 'train') {
                if (!prev) {
                    g.x = I.head.x; g.y = I.head.y + Math.sin(this.t * 1.3 + m.ph) * SWARM.BOB; g.z = I.head.z;
                } else {
                    let dx = m.x - prev.x, dy = m.y - prev.y, dz = m.z - prev.z;
                    let d = Math.hypot(dx, dy, dz);
                    if (d < 1e-3) { dx = 0; dy = 0; dz = -1; d = 1; }
                    const s = SWARM.SPACING / d;
                    g.x = prev.x + dx * s; g.y = prev.y + dy * s; g.z = prev.z + dz * s;
                    // a wave along the tail, across the way it goes
                    const w = Math.sin(this.t * 2 + i * 0.9 + m.ph) * SWARM.WAVE * Math.min(1, i / 4);
                    g.x += -dz / d * w; g.z += dx / d * w;
                    g.y += Math.sin(this.t * 1.4 + i * 0.7 + m.ph) * SWARM.BOB * 0.6;
                }
                // (a thing taken low rises onto the train first, then follows it)
                k = Math.min(1, k * (1 + (i === 0 ? 0.3 : 0)));
            } else if (this.mode === 'orbit') {
                // polar, not a position that chases a moving point (that spirals inwards the faster it goes):
                // the angle follows its slot, the radius and the height settle onto theirs
                const sl = slotsR[i];
                const ta = this.spin + (sl.k / sl.cnt) * Math.PI * 2 + sl.ring * 0.9;
                const tr = SWARM.R0 + sl.ring * SWARM.R_GAP;
                const ty = I.body.y + (sl.ring - (nRings - 1) / 2) * SWARM.RING_H + 0.4 + Math.sin(this.t * 2.2 + m.ph) * SWARM.BOB;
                if (m.oa === undefined) { m.oa = Math.atan2(m.z - I.body.z, m.x - I.body.x); m.or = Math.hypot(m.x - I.body.x, m.z - I.body.z); }
                m.oa += wrap(ta - m.oa) * (1 - Math.exp(-dt * 3));
                m.or += (tr - m.or) * (1 - Math.exp(-dt * 4));
                g.x = I.body.x + Math.cos(m.oa) * m.or;
                g.z = I.body.z + Math.sin(m.oa) * m.or;
                g.y = ty;
                k = 1; // (it is already where the polar place says; only the height eases below)
            } else if (this.mode === 'shield') {
                const sl = slotsW[i];
                const a = this.wallYaw + sl.u;
                g.x = I.body.x + Math.sin(a) * SWARM.SHIELD_D;
                g.z = I.body.z + Math.cos(a) * SWARM.SHIELD_D;
                g.y = I.body.y + sl.v + Math.sin(this.t * 2.6 + m.ph) * SWARM.BOB * 0.5;
                k = 1 - Math.exp(-dt * 10);
            }
            const ox = m.x, oy = m.y, oz = m.z;
            const ky = this.mode === 'train' ? 1 - Math.exp(-dt * SWARM.LIFT_RISE) : this.mode === 'orbit' ? 1 - Math.exp(-dt * 6) : k;
            this._move(m, ox + (g.x - ox) * k, oy + (g.y - oy) * Math.max(k, ky), oz + (g.z - oz) * k, I);
            m.vx = (m.x - ox) / Math.max(dt, 1e-4); m.vy = (m.y - oy) / Math.max(dt, 1e-4); m.vz = (m.z - oz) / Math.max(dt, 1e-4);
            prev = m;
        });
        // knocked out of the wall: falls
        for (const m of ms) if (m.out) this._fall(m, dt, I, ev);
        // flying things
        for (const m of ms) if (m.fly) this._flight(m, dt, I, ev);
        return ev;
    }

    /** Move a held thing to (x, y, z): the world stops it (slides along a wall, never under the ground). */
    _move(m, x, y, z, I) {
        if (I.blocked && I.blocked(x, y, z)) {
            if (!I.blocked(x, m.y, m.z)) { m.x = x; }
            if (!I.blocked(m.x, m.y, z)) { m.z = z; }
            if (!I.blocked(m.x, y, m.z)) { m.y = y; }
        } else { m.x = x; m.y = y; m.z = z; }
        if (I.floorY) { const f = I.floorY(m.x, m.z, m.y) + 0.55; if (m.y < f) m.y = f; }
    }

    /** «Атак»: every free thing flies at `aim` (or along `dir`), one after another. → how many. */
    launch(I, bodyId = null) {
        const free = this.members.filter((m) => !m.fly && !m.out);
        free.forEach((m, i) => this._volley.push({ m, at: this.t + i * SWARM.LAUNCH_GAP }));
        this._aim = { aim: I.aim || null, dir: I.dir || null, bodyId };
        this.mode = 'launch';
        return free.length;
    }

    _release(m, I) {
        const A = this._aim || {};
        let dx, dy, dz;
        if (A.aim) { dx = A.aim.x - m.x; dy = A.aim.y - m.y; dz = A.aim.z - m.z; }
        else if (A.dir) { dx = A.dir.x; dy = A.dir.y; dz = A.dir.z; }
        else { dx = 0; dy = 0; dz = 1; }
        const d = Math.hypot(dx, dy, dz) || 1;
        m.fly = { t: 0, d: 0, v: SWARM.LAUNCH_V0, dx: dx / d, dy: dy / d, dz: dz / d, bodyId: A.bodyId, hit: false, aim: A.aim ? { ...A.aim } : null };
    }

    _flight(m, dt, I, ev) {
        const F = m.fly;
        F.t += dt;
        F.v = Math.min(SWARM.LAUNCH_VMAX, F.v + SWARM.LAUNCH_ACCEL * dt);
        // a small correction towards the one aimed at (never a hard turn)
        const tgt = F.bodyId != null ? (I.bodies || []).find((b) => b.id === F.bodyId) : null;
        if (tgt || F.aim) {
            const ax = (tgt ? tgt.x : F.aim.x) - m.x, ay = (tgt ? tgt.y : F.aim.y) - m.y, az = (tgt ? tgt.z : F.aim.z) - m.z;
            const ad = Math.hypot(ax, ay, az);
            if (ad > 1.5) {
                const k = Math.min(1, SWARM.HOMING * dt);
                F.dx += (ax / ad - F.dx) * k; F.dy += (ay / ad - F.dy) * k; F.dz += (az / ad - F.dz) * k;
                const n = Math.hypot(F.dx, F.dy, F.dz) || 1;
                F.dx /= n; F.dy /= n; F.dz /= n;
            }
        }
        const dist = F.v * dt;
        const steps = Math.max(1, Math.ceil(dist / 0.4));
        for (let s = 0; s < steps; s++) {
            const nx = m.x + F.dx * dist / steps, ny = m.y + F.dy * dist / steps, nz = m.z + F.dz * dist / steps;
            if (I.blocked && I.blocked(nx, ny, nz)) { this._land(m, ev, 'wall', F); return; }
            if (I.floorY && ny < I.floorY(nx, nz, ny) + 0.15) { this._land(m, ev, 'ground', F); return; }
            m.x = nx; m.y = ny; m.z = nz;
            F.d += dist / steps;
            // a creature on the way (not the hero's own)
            for (const b of I.bodies || []) {
                if (b.id === I.selfId) continue;
                if (Math.hypot(b.x - m.x, b.z - m.z) > b.r + SWARM.HIT_R) continue;
                if (m.y < b.y - (b.hy ?? 1.6) - SWARM.HIT_R || m.y > b.y + (b.hy ?? 1.6) + SWARM.HIT_R) continue;
                F.hit = true;
                ev.push({ type: 'hit', m, body: b, v: F.v, dir: { x: F.dx, y: F.dy, z: F.dz } });
                this._land(m, ev, 'creature', F, b);
                return;
            }
        }
        m.vx = F.dx * F.v; m.vy = F.dy * F.v; m.vz = F.dz * F.v;
        if (F.t > SWARM.LAUNCH_LIFE || F.d > SWARM.LAUNCH_RANGE) this._land(m, ev, 'spent', F);
    }

    /** The flight ends: the thing is no longer the swarm's, it falls on its own from here. */
    _land(m, ev, how, F, body = null) {
        const keep = how === 'creature' ? -0.15 : how === 'spent' ? 0.3 : -0.25;
        m.vx = F.dx * F.v * keep; m.vy = how === 'spent' ? F.dy * F.v * 0.3 : 2; m.vz = F.dz * F.v * keep;
        m.fly = null;
        m.done = true; // (the game takes it out of the swarm and lets it fall)
        ev.push({ type: 'land', m, how, body });
    }

    _fall(m, dt, I, ev) {
        m.vy -= SWARM.G * dt;
        const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt, nz = m.z + m.vz * dt;
        if (!(I.blocked && I.blocked(nx, ny, nz))) { m.x = nx; m.y = ny; m.z = nz; } else { m.vx *= -0.3; m.vz *= -0.3; }
        if (I.floorY && m.y < I.floorY(m.x, m.z, m.y) + 0.15) { m.done = true; ev.push({ type: 'land', m, how: 'ground' }); }
    }

    /**
     * Take the swarm apart: every thing is let go. `gentle` (set down) → they settle; otherwise they keep the
     * swing they had. → [{m, vx, vy, vz}] (the game gives each back to the world's physics).
     */
    drop(gentle) {
        const out = this.members.map((m) => ({
            m,
            vx: gentle ? 0 : (m.fly ? m.vx : m.vx * SWARM.HOLD_BACK),
            vy: gentle ? 0 : (m.fly ? m.vy : m.vy * SWARM.HOLD_BACK),
            vz: gentle ? 0 : (m.fly ? m.vz : m.vz * SWARM.HOLD_BACK),
        }));
        this.members = [];
        this._volley = [];
        return out;
    }
}

/** The hand's turn rate decides the mode: a vortex on a fast steady circle, back to the train when it stops. */
export class ModeKeeper {
    constructor() { this.off = 0; }
    /** → 'orbit' | 'train' for a swarm that is in `mode` (shield / launch are not changed by the hand), given the hand's turns a second. */
    next(mode, rate, dt) {
        if (mode === 'shield' || mode === 'launch') return mode;
        const r = Math.abs(rate);
        if (mode === 'train') { this.off = 0; return r >= SWARM.TURN_ON ? 'orbit' : 'train'; }
        if (r < SWARM.TURN_OFF) { this.off += dt; if (this.off >= SWARM.TURN_OFF_T) { this.off = 0; return 'train'; } } else this.off = 0;
        return 'orbit';
    }
}
