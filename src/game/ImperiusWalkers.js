/**
 * ImperiusWalkers.js — «Империус Максима» (and «Империус» for the sailors): the rest of the game's walking creatures the
 * mind may go into, added to the adapters of ImperiusBodies.js (how an adapter works: there).
 *   sp  the giant spider (a boss — the Maxima): her eight legs, her crowd round others, walls stop her
 *   t   a living tree / a risen skeleton (magic — the Maxima): its roots walk, its branch strikes
 *   I   the Ice Castle's creatures (the queen — a boss —, snowmen, ice monsters, «Snowman»'s friends): the castle's own
 *       step (round the others, never into the water, never off a cliff)
 *   s   a sailor (the plain spell; Captain Black Moustache and his skeletons — the Maxima): on the deck, in the ship's own
 *       frame (a moving ship never leaves him behind), the crew's own steering round his mates
 * Each walks by its own legs and speed and is stopped by what stops it on its own.
 */

import * as THREE from 'three';
import { BODIES } from './ImperiusBodies.js';
import { crowdStep } from './CrowdSources.js';
import { BODY_R } from './Crowd.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const turn = (from, to, max) => { const d = wrap(to - from); return from + Math.max(-max, Math.min(max, d)); };
const CARROT = 6;

/**
 * A creature that stands at `model.position`, faces `model.rotation.y` (forward (−sin, −cos)): one step its way,
 * round the others (Crowd.js), never through a wall (Collision), its feet on the ground. → m walked.
 */
function walk(g, c, p, I, speed, r, h, dt, turnRate = 3) {
    const m = c.model;
    m.rotation.y = turn(m.rotation.y, I.yaw, turnRate * dt);
    if (!(speed > 0)) return 0;
    const fx = -Math.sin(m.rotation.y), fz = -Math.cos(m.rotation.y);
    const a = crowdStep(g, c, p, fx, fz, CARROT, { r, speed, dt, look: 2 + r * 2, dy: h * 0.6 });
    if (!a) return 0;
    const x0 = p.x, z0 = p.z;
    p.x += a.x * speed * dt; p.z += a.z * speed * dt;
    g.collision?.resolveCylinder?.(p, r, p.y, h, 1.05);
    const col = g.collision;
    const gy = col?.groundAt ? col.groundAt(p.x, p.z, p.y + 1.2) : col?.groundY?.(p.x, p.z) ?? p.y;
    if (gy - p.y > 1.3) { p.x = x0; p.z = z0; return 0; } // (a ledge too high for its legs)
    p.y += (gy - p.y) * Math.min(1, dt * 8);
    return Math.hypot(p.x - x0, p.z - z0);
}

function modelBody(sys, list, find, o) {
    return {
        sys,
        list(g, fn) { for (const c of list(g)) if (o.free(c)) fn(c, c.model.position.x, c.model.position.y, c.model.position.z, o.up(c)); },
        find,
        dead(c) { return !!(c.dead || c.isDead || c.removable); },
        pos(c, out) { return out.copy(c.model.position); },
        face(c) { return c.model.rotation.y; },
        head(c) { return o.head(c); },
        size(c) { return o.up(c) * 1.1; },
        drive: o.drive,
        follow(g, c, n, dt) {
            const p = c.model.position, k = Math.min(1, dt * 8);
            const step = Math.hypot(n.x - p.x, n.z - p.z) * k;
            p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; p.z += (n.z - p.z) * k;
            c.model.rotation.y = turn(c.model.rotation.y, n.ry, dt * 8);
            o.anim(g, c, dt, step / Math.max(dt, 1e-3), !!n.atk);
        },
        struck: o.struck,
        release: o.release,
        net(c) { const p = c.model.position; return [p.x, p.y, p.z, c.model.rotation.y, c._impWalk || 0, c._impAtk ? 1 : 0]; },
    };
}

// ============================================================ the giant spider
const SPIDER_WALK = 5.2; // m/s: her quick scuttle (the hero runs 9.75)
const spiders = modelBody('sp', (g) => g.spiders?.list || [], (g, id) => g.spiders?.list?.find((s) => s.id === id) || null, {
    free: (s) => !s.dead && s.model && !s.lev,
    up: () => 2.6,
    head: (s) => s.model.userData?.head || null,
    drive(g, s, I, dt) {
        const S = g.spiders;
        s.angry = false; s.goal = null; s.target = null;
        const speed = I.walk > 0.02 ? SPIDER_WALK * (0.4 + 0.6 * Math.min(1, I.walk * 1.4)) : 0;
        const w = walk(g, s, s.model.position, I, speed, BODY_R.spider, 2.4, dt, 2.4);
        s._impWalk = w > 0 ? 1 : 0;
        if (I.strikeNow) { s.holding = true; s._impAtk = 0.5; }
        if (s._impAtk > 0) { s._impAtk -= dt; if (s._impAtk <= 0) s.holding = false; }
        S?._animate?.(s, w > 0 ? 1 : 0, dt);
    },
    anim(g, s, dt, v, atk) { s.holding = atk; g.spiders?._animate?.(s, v > 0.2 ? 1 : 0, dt); },
    struck: (g, s, I) => (I?.strikeNow ? { reach: 4.5, dmg: 6 } : null), // (her fangs)
    release(g, s) { s.holding = false; s.goal = null; s.wanderT = 2; },
});

// ============================================================ a living tree / a risen skeleton
const trees = modelBody('t', (g) => g.livingTrees?.list || [], (g, id) => g.livingTrees?.byId?.get(id) || null, {
    free: (t) => !t.isDead && t.model && t.phase === 'alive',
    up: (t) => (t.skel ? 3.4 : 6 * (t.model.userData?.s || 1)),
    head: (t) => t.model.userData?.face || t.model.userData?.head || null,
    drive(g, t, I, dt) {
        if (t.phase !== 'alive') { g.livingTrees?._step?.(t, dt, false); return; }
        const s = t.model.userData?.s || 1;
        const speed = I.walk > 0.02 ? (t.skel ? 2.6 : 2.8) * (I.run ? 1.55 : 1) : 0;
        const w = walk(g, t, t.model.position, I, speed, (t.skel ? 0.5 : 0.95 * s), 3, dt, 3);
        t.speed = w > 0 ? speed : 0;
        t.walkT = (t.walkT || 0) + dt * t.speed * 1.6;
        if (I.strikeNow && !t.swing) { t.swing = { t: 0, imp: true }; t._impAtk = 1; }
        if (t.swing?.imp) { t.swing.t += dt; if (t.swing.t > 0.9) { t.swing = null; t._impAtk = 0; } }
        t._impWalk = w > 0 ? 1 : 0;
    },
    anim(g, t, dt, v) { t.speed = v; t.walkT = (t.walkT || 0) + dt * v * 1.6; },
    struck: (g, t, I) => (I?.strikeNow ? { reach: t.skel ? 2.6 : 4.5, dmg: t.skel ? 2 : 4 } : null), // (a branch slammed down / bony fists)
    release(g, t) { t.swing = null; },
});

// ============================================================ the Ice Castle's creatures
const ice = modelBody('I', (g) => g.iceCastle?.list || [], (g, id) => g.iceCastle?.byIdMap?.get(id) || null, {
    free: (c) => !c.dead && c.model,
    up: (c) => c.h || 3,
    head: (c) => c.model.userData?.head || null,
    drive(g, c, I, dt) {
        const Q = g.iceCastle, p = c.model.position;
        c.target = null; c.roam = null; c.act = null;
        if (I.walk > 0.02) {
            const k = I.run ? 1.35 : 0.8;
            Q?._step?.(c, p.x - Math.sin(I.yaw) * CARROT, p.z - Math.cos(I.yaw) * CARROT, dt, 0, k);
        } else { c.moving = false; c.model.rotation.y = turn(c.model.rotation.y, I.yaw, (c.turn || 3) * dt); }
        const fl = Q?._floor ? Q._floor(p.x, p.z, p.y + 1.05) : p.y;
        if (p.y > fl + 0.02 || c.vy > 0) { c.vy = (c.vy || 0) - 24 * dt; p.y += c.vy * dt; if (p.y <= fl) { p.y = fl; c.vy = 0; } } else { p.y = fl; c.vy = 0; }
        c._impWalk = c.moving ? 1 : 0;
        if (I.strikeNow) c._impAtk = 0.6;
        if (c._impAtk > 0) c._impAtk -= dt;
    },
    anim(g, c, dt, v) { c.moving = v > 0.2; },
    struck: (g, c, I) => (I?.strikeNow ? { reach: (c.r || 1) + 1.6, dmg: c.type === 'queen' ? 8 : c.type === 'monster' ? 6 : 2 } : null),
    release(g, c) { c.moving = false; },
});

// ============================================================ sailors (on their ship's deck, in its own frame)
const sailors = {
    sys: 's',
    list(g, fn) { for (const v of g.ships?.crew?.byId?.values?.() || []) if (!v.dead && !v.lev && !v.overboard && v.ship) fn(v, v.x, v.y, v.z, 3.4); },
    find(g, id) { return g.ships?.crew?.byId?.get(id) || null; },
    dead(v) { return !!v.dead || !!v.removable; },
    pos(v, out) { return out.set(v.x, v.y, v.z); },
    face(v) { return (v.ship?.st?.yaw || 0) + (v.lyaw || 0); },
    head(v) { return v.model?.head || null; },
    size() { return 3.6; },
    drive(g, v, I, dt) {
        const C = g.ships?.crew, s = v.ship;
        if (!C || !s) return;
        v.foe = null; v.order = null; v.spot = null;
        if (v.overboard || v.stunT > 0 || v.braceT > 0) { C._think(v, s, dt); return; } // (in the water / stunned: his own body does that)
        const want = wrap(I.yaw - (s.st?.yaw || 0));
        if (I.walk > 0.02) {
            const speed = I.run ? 4.6 : 2.2;
            v.lyaw = turn(v.lyaw || 0, want, 8 * dt);
            C._steer(v, s, v.l.x - Math.sin(v.lyaw) * CARROT, v.l.z - Math.cos(v.lyaw) * CARROT, speed, dt);
            v.lyaw = turn(v.lyaw || 0, want, 8 * dt);
        } else { v.speed = 0; v.lyaw = turn(v.lyaw || 0, want, 6 * dt); }
        C._ground?.(v, s);
        if (I.strikeNow && v.mode !== 'attack' && !(v._impCd > 0)) { v._impCd = 1.1; v._impAtkT = 0.75; }
        v._impCd = Math.max(0, (v._impCd || 0) - dt);
        if (v._impAtkT > 0) { v._impAtkT -= dt; v.mode = 'attack'; v.speed = 0; return; }
        v.mode = v.speed > 3 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        v._impWalk = v.speed > 0 ? Math.min(1, v.speed / 4.6) : 0;
    },
    follow(g, v, n, dt) {
        const k = Math.min(1, dt * 10);
        v.l.x += (n.x - v.l.x) * k; v.l.y += (n.y - v.l.y) * k; v.l.z += (n.z - v.l.z) * k; // (the deck's own frame: what the guest sent)
        v.lyaw = turn(v.lyaw || 0, n.ry, dt * 10);
        v.speed = n.w * 4.6;
        v.mode = n.atk ? 'attack' : v.speed > 3 ? 'run' : v.speed > 0.05 ? 'walk' : 'idle';
    },
    struck(g, v) { return v.model?.strikeNow ? { reach: 3.2, dmg: v.role === 'blackbeard' ? 6 : 2 } : null; },
    release(g, v) { v.mode = 'idle'; v.speed = 0; v._impAtkT = 0; },
    net(v) { return [v.l.x, v.l.y, v.l.z, v.lyaw || 0, v._impWalk || 0, v.mode === 'attack' ? 1 : 0]; },
};

// ============================================================ the swamp canaries (plain «Империус»: not magical)
const canaries = modelBody('ca', (g) => g.canaries?.list || [], (g, id) => g.canaries?.byId(id) || null, {
    free: (c) => !c.dead && c.model && !c.lev,
    up: () => 2.2,
    head: (c) => c.model.userData?.head || null,
    drive(g, c, I, dt) {
        const C = g.canaries;
        c.target = null; c.wander = null; c.flee = null;
        if (c.stun > 0) { c.stun -= dt; c.mode = 'flinch'; c.speed = 0; return; }
        const speed = I.walk > 0.02 ? (I.run ? 5.2 : 2.0) * (0.4 + 0.6 * Math.min(1, I.walk * 1.4)) : 0;
        const w = walk(g, c, c.model.position, I, speed, BODY_R.canary, 2.2, dt, 4);
        c.speed = w > 0 ? speed / 5.2 : 0;
        c.walk += w * 4.2;
        c.mode = w > 0 ? (I.run ? 'run' : 'walk') : 'idle';
        if (I.strikeNow && !(c._impCd > 0)) { c._impCd = 1.1; c._impAtk = 0.55; c.stT = 0; }
        c._impCd = Math.max(0, (c._impCd || 0) - dt);
        if (c._impAtk > 0) { c._impAtk -= dt; c.stT += dt; c.mode = 'shove'; }
        c._impWalk = w > 0 ? 1 : 0;
        C?._animate?.(c, dt, 0);
    },
    anim(g, c, dt, v, atk) { c.speed = Math.min(1.4, v / 5.2); c.mode = atk ? 'shove' : v > 3 ? 'run' : v > 0.2 ? 'walk' : 'idle'; c.walk += v * dt * 4.2; if (atk) c.stT = (c.stT || 0) + dt; g.canaries?._animate?.(c, dt, 0); },
    struck: (g, c, I) => (I?.strikeNow ? { reach: 2.7, dmg: 4 } : null), // (its fist — Canaries SHOVE)
    release(g, c) { c.speed = 0; c.mode = 'idle'; c._impAtk = 0; g.canaries?._set?.(c, 'idle'); },
});

// ============================================================ the Tarons of the underworld («Империус Максима» only: a heavy stubborn mind)
const tarons = modelBody('ta', (g) => g.tarons?.list || [], (g, id) => g.tarons?.byId(id) || null, {
    free: (c) => !c.dead && c.model && !c.lev,
    up: () => 6,
    head: (c) => c.model.userData?.head || null,
    drive(g, c, I, dt) {
        const T = g.tarons;
        c.target = null; c.wander = null;
        if (c.stun > 0) { c.stun -= dt; c.mode = 'flinch'; c.speed = 0; return; }
        const speed = I.walk > 0.02 ? 2.45 * (0.4 + 0.6 * Math.min(1, I.walk * 1.4)) : 0; // (still HALF the player's speed, whoever drives him)
        const w = walk(g, c, c.model.position, I, speed, BODY_R.taron, 8, dt, 6);
        c.speed = w > 0 ? speed : 0;
        c.walk += w * 1.1;
        c.mode = w > 0 ? 'walk' : 'idle';
        if (I.strikeNow && !(c._impCd > 0)) { c._impCd = 2.2; c._impAtk = 1.4; c.stT = 0; c.side = Math.random() < 0.35 ? 'hammer' : 'blade'; c.p = 0; }
        c._impCd = Math.max(0, (c._impCd || 0) - dt);
        if (c._impAtk > 0) { c._impAtk -= dt; c.stT += dt; c.mode = c.stT < 0.9 ? 'windup' : 'swing'; c.p = c.stT < 0.9 ? c.stT / 0.9 : Math.min(1, (c.stT - 0.9) / 0.5); if (!c._hitDone && c.stT >= 1.2) { c._hitDone = true; T?._strike?.(c); } }
        else c._hitDone = false;
        c._impWalk = w > 0 ? 1 : 0;
        T?._animate?.(c, dt, 0);
    },
    anim(g, c, dt, v, atk) { c.speed = v; c.mode = atk ? 'swing' : v > 0.2 ? 'walk' : 'idle'; c.walk += v * dt * 1.1; if (atk) { c.stT = (c.stT || 0) + dt; c.p = Math.min(1, c.stT / 0.5); } g.tarons?._animate?.(c, dt, 0); },
    struck: (g, c, I) => (I?.strikeNow ? { reach: 7, dmg: 22 } : null), // (his axe-hammer)
    release(g, c) { c.speed = 0; c.mode = 'idle'; c._impAtk = 0; g.tarons?._set?.(c, 'idle'); },
});

BODIES.sp = spiders;
BODIES.ta = tarons;
BODIES.t = trees;
BODIES.I = ice;
BODIES.s = sailors;
BODIES.ca = canaries;

// ============================================================ creatures of one's own («Да пусть создастся»: «Империус Максима» only)
const customs = modelBody('C', (g) => g.customCreatures?.list || [], (g, id) => g.customCreatures?.byId(id) || null, {
    free: (c) => !c.dead && c.born >= 1 && !c.lev,
    up: (c) => c.D.top * c.scale,
    head: (c) => c.model.userData?.head || null,
    drive(g, c, I, dt) {
        c.foe = null; c.goal = null; c.state = 'idle'; c.flying = false;
        if (c.stunT > 0) { c.a.speed = 0; c.a.mode = 'idle'; return; }
        const top = c.speeds.ground * (c.slowT > 0 ? 0.45 : 1);
        const speed = I.walk > 0.02 ? top * (I.run ? 1.3 : 0.6) * (0.4 + 0.6 * Math.min(1, I.walk * 1.4)) : 0;
        const w = walk(g, c, c.model.position, I, speed, c.r, Math.max(0.5, c.h), dt, 4);
        c.yaw = c.model.rotation.y;
        c.a.mode = w > 0 ? 'walk' : 'idle'; c.a.speed = w > 0 ? speed : 0;
        c._impWalk = w > 0 ? 1 : 0;
        if (I.strikeNow && !(c._impCd > 0)) { c._impCd = 1.2; c._impAtk = 0.5; c.a.bite = 1; }
        c._impCd = Math.max(0, (c._impCd || 0) - dt);
        if (c._impAtk > 0) c._impAtk -= dt;
    },
    anim(g, c, dt, v, atk) { c.a.mode = v > 0.2 ? 'walk' : 'idle'; c.a.speed = v; if (atk) c.a.bite = 1; c.yaw = c.model.rotation.y; },
    struck: (g, c, I) => (I?.strikeNow ? { reach: c.r + 1.6, dmg: Math.max(1, Math.min(8, Math.round(2 + c.D.H * 1.2))) } : null), // (its bite — CustomCreatures._hunt)
    release(g, c) { c.a.speed = 0; c.a.mode = 'idle'; c._impAtk = 0; c.state = 'idle'; },
});
BODIES.C = customs;

/** (tests) the walkers added here. */
export const WALKER_SYSTEMS = ['sp', 't', 'I', 's', 'ca', 'ta'];
export { THREE };
