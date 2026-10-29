/**
 * ImperiusFlyers.js — «Империус Максима»: the magic creatures the mind may go into (ImperiusControl.js), added to the
 * adapters of ImperiusBodies.js — the dragon, the clever owl, the phoenix, the book-bird; and the wings of the pig and
 * the Pegasus (their walking is the animals' adapter; in the Maxima they fly).
 *
 * In the air every one flies by the hero's ARMS (ImperiusFlight.js: a stroke of both arms down — up and forward; the
 * glide between; arms down — down; low and slow — it lands). It turns as the hero's body turns (a great body slower).
 * Nothing is flown through: it keeps above the highest thing under it and ahead (the ground, a hill, a crown, a roof —
 * Animals._floor, as PigFlight and DragonRide do), a wall too tall to climb at once slows it.
 * On the ground: the dragon walks and runs (it must run to take off), the owl and the phoenix hop, the book lies still
 * (a book has no legs: it only flies).
 * The dragon's fire: the caster's long «У» (DragonHowl.js) — its breath goes where the eyes look, as big as the voice.
 */

import * as THREE from 'three';
import { BODIES } from './ImperiusBodies.js';
import { FLYERS, flyStep } from './ImperiusFlight.js';
import { DRAGON } from './DragonKinds.js';
import { dragonBody } from './Dragons.js';
import { BODY_R } from './Crowd.js';
import { flap as bookFlap } from './BookBirds.js';
import { waterAt } from './CreatureSwim.js';
import { seesInvisible } from './Invisibles.js';

const _v = new THREE.Vector3();
const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const turn = (from, to, max) => { const d = wrap(to - from); return from + Math.max(-max, Math.min(max, d)); };

/** The highest thing under (x, z): the ground, a hill, a crown, a roof, a deck — the water's face (a flyer comes down onto it). */
function floorAt(g, x, z) {
    let y;
    if (g.animals?._floor) y = g.animals._floor(x, z);
    else { const c = g.collision; y = c?.groundAt ? c.groundAt(x, z, 1e4) : c?.groundY?.(x, z) ?? 0; }
    const w = waterAt(g.terrain?.data || g.world?.terrain?.data, x, z, y);
    return w ? Math.max(y, w.surface) : y;
}

/**
 * One frame in the air (or taking off / landing) for a winged creature whose place is `p` (its feet), facing `yaw`
 * (forward (−sin, −cos)). st: the flight's state ({air, vf, vy}); P: FLYERS[kind]; clear: m over what is under it;
 * groundSpeed: how fast it runs on the ground now. → the yaw it faces now.
 */
export function flyFrame(g, p, yaw, I, st, P, dt, clear, groundSpeed = 0) {
    const under = floorAt(g, p.x, p.z);
    flyStep(st, P, { stroke: I.stroke || 0, arms: I.arms || '', ground: groundSpeed, alt: st.air ? p.y - under : null, pitch: I.pitch || 0 }, dt);
    if (!st.air) return yaw;
    const ny = turn(yaw, I.yaw, (P.turn || 1) * 1.6 * dt);
    const fx = -Math.sin(ny), fz = -Math.cos(ny);
    const steps = Math.max(1, Math.ceil(Math.max(st.vf, Math.abs(st.vy)) * dt / 0.8));
    for (let i = 0; i < steps; i++) {
        p.x += fx * st.vf * dt / steps; p.z += fz * st.vf * dt / steps; p.y += st.vy * dt / steps;
        // never into anything: the highest thing under it and ahead — it climbs over (or slows at a wall too tall);
        // over flat ground it may come down onto it (a landing: flyStep), clear of it only where the ground rises ahead
        const look = Math.max(clear * 4, st.vf * 0.9);
        const here = floorAt(g, p.x, p.z);
        let top = here;
        for (let k = 1; k <= 4; k++) top = Math.max(top, floorAt(g, p.x + fx * look * k / 4, p.z + fz * look * k / 4));
        const want = top > here + 0.5 ? top + clear : here;
        if (p.y < want) {
            const need = want - p.y;
            p.y = Math.min(want, p.y + Math.max(8, st.vf) * dt / steps);
            if (need > 2) st.vf *= Math.max(0, 1 - 3 * dt / steps);
            if (st.vy < 0) st.vy = 0;
        }
    }
    // no flying into the sky's roof (the hero's own: Flight)
    if (p.y > 900) { p.y = 900; st.vy = Math.min(0, st.vy); }
    // landed on what is under it (its feet on it)
    const u2 = floorAt(g, p.x, p.z);
    if (p.y < u2) p.y = u2;
    return ny;
}

// ============================================================ the dragon
const dragons = {
    sys: 'D',
    list(g, fn) { for (const d of g.dragons?.list || []) if (!d.dead && d.model && !d.tame?.rider) fn(d, d.model.position.x, d.model.position.y, d.model.position.z, 3.2 * (d.size || 1)); },
    find(g, id) { return g.dragons?.list?.find((d) => d.id === id) || null; },
    dead(d) { return !!d.dead; },
    pos(d, out) { return out.copy(d.model.position); },
    face(d) { return d.model.rotation.y; },
    body(d, out) { return dragonBody(d, out); }, // (a great body: aimed at — and measured to — anywhere along it, ImperiusControl._aimed)
    head(d) { return d.model.userData?.head || d.model.userData?.jaw?.parent || null; },
    size(d) { return 5.5 * (d.size || 1); },
    drive(g, d, I, dt) {
        const D = g.dragons, p = d.model.position, s = d.size || 1, col = g.collision;
        d.mode = 'ride'; d.target = null; d.order = null;
        d.t = (d.t || 0) + dt;
        d.stun = Math.max(0, (d.stun || 0) - dt);
        const st = I.fly || (I.fly = { air: d.fly > 0.5, vf: 0, vy: 0 });
        const P = FLYERS.dragon;
        // on its feet: it walks the way it faces, runs when the hero runs (it must run to take off)
        let ground = 0;
        if (!st.air) {
            const top = DRAGON.WALK * (d.react || 1) * 1.15;
            ground = I.walk > 0.02 ? top * (0.4 + 0.6 * Math.min(1, I.run ? I.walk * 1.4 : I.walk * 0.6)) : 0;
            if (d.stun > 0) ground = 0;
            const lair = d.lair ? D.lairs?.get(d.lair)?.L || null : null;
            if (ground > 0) D._walkTo(d, p.x - Math.sin(I.yaw) * 8, p.z - Math.cos(I.yaw) * 8, ground, dt, D.lairAt?.(p, 0) ? lair : null, false, 0);
            else d.model.rotation.y = turn(d.model.rotation.y, I.yaw, DRAGON.TURN * (d.react || 1) * dt);
            col?.resolveCylinder?.(p, 2.2 * s, p.y + 0.3, 5 * s, 1.2);
            let gy = col?.groundAt ? col.groundAt(p.x, p.z, p.y + 2.5) : col?.groundY?.(p.x, p.z) ?? p.y;
            const w = waterAt(g.terrain?.data || g.world?.terrain?.data, p.x, p.z, gy);
            if (w && w.depth >= 2) gy = Math.max(gy, w.surface - 1.2 * s); // (come down on the water: it swims, its back above it — a stroke takes it up again)
            p.y += (gy - p.y) * Math.min(1, dt * 6);
            // (no wings in its own hall nor under a roof: a stroke there is only a stroke)
            const roofed = D.lairAt?.(p, 3) || col?.pointBlocked?.(p.x, p.y + 7 * s, p.z);
            if (roofed && I.stroke) { I.stroke = 0; I.say?.('🐉 Здесь тесно — крылья не раскрыть. Выйдите на открытое место'); }
        }
        const was = st.air;
        if (!st.air && I.stroke && ground < P.takeoff) I.say?.('🐉 Дракону нужно разбежаться — бегите на месте и тогда машите руками', 'run');
        d.model.rotation.y = flyFrame(g, p, d.model.rotation.y, I, st, P, dt, 0.8 * s, ground);
        if (st.took) I.say?.('🐉 Дракон взлетел! Машите руками — выше и быстрее, руки в стороны — парить, руки вниз — снижаться');
        if (was && st.landed) I.say?.('🐉 Посадка');
        d.fly += ((st.air ? 1 : 0) - d.fly) * Math.min(1, dt * 1.5);
        d.vel.set(-Math.sin(d.model.rotation.y) * st.vf, st.vy, -Math.cos(d.model.rotation.y) * st.vf);
        d.bank = Math.max(-0.4, Math.min(0.4, wrap(I.yaw - d.model.rotation.y) * 0.6));
        d.rideWalk = st.air ? 0 : Math.min(1, ground / (DRAGON.WALK * (d.react || 1)));
        // the fire: the long «У» (DragonHowl) — the breath where the eyes look, as big as the voice
        if (I.fire?.start || (I.fire?.on && d.breath?.imp)) {
            const b = d.breath && d.breath.imp ? d.breath : (d.breath = { t: 0, dir: new THREE.Vector3(), imp: true });
            if (I.look) b.dir.copy(I.look).normalize();
            b.k = I.fire.size;
            b.t = Math.min(b.t, 0.2); // (it burns as long as the «У» goes on)
        } else if (d.breath?.imp) d.breath.t = Math.max(d.breath.t, DRAGON.FLAME_TIME); // (the «У» is over: the breath dies away)
        D._animate(d, dt, d.rideWalk);
    },
    follow(g, d, n, dt) {
        const p = d.model.position, k = Math.min(1, dt * 8);
        p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; p.z += (n.z - p.z) * k;
        d.model.rotation.y = turn(d.model.rotation.y, n.ry, dt * 8);
        d.mode = 'ride';
        d.fly += ((n.air ? 1 : 0) - d.fly) * Math.min(1, dt * 2);
        d.rideWalk = n.w;
        if (n.fire) {
            const b = d.breath && d.breath.imp ? d.breath : (d.breath = { t: 0, dir: new THREE.Vector3(), imp: true });
            b.dir.set(n.fire[0], n.fire[1], n.fire[2]).normalize(); b.k = n.fire[3]; b.t = Math.min(b.t, 0.2);
        } else if (d.breath?.imp) d.breath.t = Math.max(d.breath.t, DRAGON.FLAME_TIME);
        d.t = (d.t || 0) + dt;
        g.dragons._animate(d, dt, d.rideWalk || 0);
    },
    struck(g, d, I) {
        if (!I?.strikeNow) return null;
        d.mouthT = 0.4; d.lowerT = 0.4;
        return { reach: 4.5 * (d.size || 1), dmg: DRAGON.BITE };
    },
    release(g, d) {
        d.mode = d.fly > 0.5 ? 'air' : 'landed'; d.target = null; d.rideWalk = 0;
        if (d.breath?.imp) d.breath = null;
        g.dragons?.smash?.forget(d.id);
        d.restT = 5;
    },
    net(d) {
        const p = d.model.position, b = d.breath?.imp ? d.breath : null;
        return [p.x, p.y, p.z, d.model.rotation.y, d.rideWalk || 0, 0, d.fly > 0.5 ? 1 : 0, b ? [b.dir.x, b.dir.y, b.dir.z, b.k || 1] : null];
    },
};

// ============================================================ a bird of the game's kind: the owl, the phoenix
function birdAdapter(sys, list, P, opts) {
    const mm = (m) => (opts.modeMap && opts.modeMap[m]) || m; // (a creature of another look names its poses its own way)
    return {
        sys,
        list(g, fn) { for (const o of list(g)) if (!o.dead && o.model && !o.localHeld && !o.lev) fn(o, o.model.position.x, o.model.position.y, o.model.position.z, opts.up); },
        find(g, id) { return list(g).find((o) => o.id === id) || null; },
        dead(o) { return !!o.dead; },
        pos(o, out) { return out.copy(o.model.position); },
        face(o) { return wrap((o.yaw ?? o.model.rotation.y) + Math.PI); }, // (a bird's yaw points along (sin, cos))
        head(o) { return o.model.userData?.head || null; },
        size() { return opts.size; },
        drive(g, o, I, dt) {
            const p = o.model.position;
            o.state = 'imp'; o.t = 0;
            const st = I.fly || (I.fly = { air: p.y - floorAt(g, p.x, p.z) > 0.6, vf: 0, vy: 0 });
            let ground = 0;
            let yaw = wrap((o.yaw ?? o.model.rotation.y) + Math.PI);
            if (!st.air) {
                // on the ground: hops along (slowly), turns
                yaw = turn(yaw, I.yaw, 3 * dt);
                ground = I.walk > 0.02 ? opts.walk : 0;
                if (ground > 0) { p.x -= Math.sin(yaw) * ground * dt; p.z -= Math.cos(yaw) * ground * dt; }
                g.collision?.resolveCylinder?.(p, opts.r, p.y, opts.up, 1.05);
                const gy = floorAt(g, p.x, p.z);
                p.y += (gy - p.y) * Math.min(1, dt * 8);
            }
            yaw = flyFrame(g, p, yaw, I, st, P, dt, 0.6, 0);
            o.yaw = wrap(yaw + Math.PI); o.model.rotation.y = o.yaw;
            o.vel?.set?.(-Math.sin(yaw) * st.vf, st.vy, -Math.cos(yaw) * st.vf);
            const a = o.a || (o.a = {});
            a.mode = mm(st.air ? (I.stroke || st.vy > 0.8 || st.vf < 2 ? 'flap' : 'glide') : (ground > 0 ? opts.walkMode : 'stand'));
            a.roll = Math.max(-0.6, Math.min(0.6, -wrap(I.yaw - yaw) * 0.8)) * (st.air ? 1 : 0);
            a.pitch = st.air ? Math.max(-0.5, Math.min(0.5, -Math.atan2(st.vy, Math.max(st.vf, 1)) * 0.8)) : 0;
            a.head = 0; a.cock = 0;
            o._impWalk = st.air ? 0 : ground > 0 ? 0.5 : 0;
            o._impAir = st.air ? 1 : 0;
        },
        follow(g, o, n, dt) {
            const p = o.model.position, k = Math.min(1, dt * 8);
            p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; p.z += (n.z - p.z) * k;
            o.yaw = wrap(n.ry + Math.PI); o.model.rotation.y = o.yaw;
            o.state = 'imp';
            const a = o.a || (o.a = {});
            a.mode = mm(n.air ? 'flap' : n.w > 0 ? opts.walkMode : 'stand');
        },
        struck(g, o, I) { return I?.strikeNow ? { reach: opts.reach, dmg: opts.dmg } : null; },
        release(g, o) { o.state = o._impAir ? 'fly' : 'perch'; o.t = 0; if (o.a) o.a.mode = mm(o._impAir ? 'glide' : 'stand'); if (opts.onRelease) opts.onRelease(g, o); },
        net(o) { const p = o.model.position; return [p.x, p.y, p.z, wrap((o.yaw ?? 0) + Math.PI), o._impWalk || 0, 0, o._impAir || 0]; },
    };
}

// (the invisible bird of Spencer — SpencerBirds.js: «Максима» only; only one who sees the invisible can find it with the eyes; its poses are its own: fly / glide / perch / hop)
const spencers = birdAdapter('sx', (g) => g.spencers?.list || [], FLYERS.spencer, { up: 0.5, size: 0.9, walk: 1.6, walkMode: 'hop', r: 0.3, reach: 1.2, dmg: 1, modeMap: { flap: 'fly', stand: 'perch' } });
const spencerList = spencers.list;
spencers.list = (g, fn) => { if (seesInvisible(g)) spencerList.call(spencers, g, fn); }; // (the eyes find it only if they see the invisible; the host still finds a guest's bird by its id)
const owls = birdAdapter('o', (g) => g.owls?.list || [], FLYERS.owl, { up: 0.8, size: 1.3, walk: 1.3, walkMode: 'hop', r: 0.35, reach: 1.4, dmg: 2 });
// (an infernal gargoyle — Gargoyles.js: «Максима» only; flaps are 'fly', the ground is a hover; released it goes back to its hunt: its mind and its pentagram's leash)
const gargoyles = birdAdapter('g', (g) => g.gargoyles?.list || [], FLYERS.gargoyle, { up: 1.4, size: 2.4, walk: 3.5, walkMode: 'walk', r: 0.8, reach: 2.6, dmg: 4, modeMap: { flap: 'fly', stand: 'hover', walk: 'hover', hop: 'hover' }, onRelease: (g, o) => { o.mode = 'roam'; o.goal = null; o.target = null; } });
const phoenixes = birdAdapter('f', (g) => g.phoenixes?.list || [], FLYERS.phoenix, { up: 1.1, size: 1.8, walk: 1.3, walkMode: 'walk', r: 0.45, reach: 1.8, dmg: 4 });

// ============================================================ the book-birds (a book has no legs: on the ground it lies)
const books = {
    sys: 'b',
    list(g, fn) { for (const b of g.books?.birds?.values?.() || []) if (b.state !== 'fall' && !b.localHeld && !b.held) fn(b, b.model.position.x, b.model.position.y, b.model.position.z, 0.3); },
    find(g, id) { return g.books?.birds?.get?.(id) || null; },
    dead(b) { return b.state === 'fall' || !!b.gone; },
    pos(b, out) { return out.copy(b.model.position); },
    face(b) { return wrap(b.model.rotation.y + Math.PI); },
    head() { return null; },
    size() { return 0.9; },
    drive(g, b, I, dt) {
        const p = b.model.position;
        b.state = 'imp';
        const st = I.fly || (I.fly = { air: p.y - floorAt(g, p.x, p.z) > 0.4, vf: 0, vy: 0 });
        let yaw = wrap(b.model.rotation.y + Math.PI);
        if (!st.air) yaw = turn(yaw, I.yaw, 1.5 * dt); // (on the ground it only turns a little, shuffling its pages)
        yaw = flyFrame(g, p, yaw, I, st, FLYERS.bookbird, dt, 0.4, 0);
        b.model.rotation.y = wrap(yaw + Math.PI);
        b.flapT = (b.flapT || 0) + dt * (st.air ? (I.stroke ? 22 : st.vy > 0 ? 14 : 6) : 1.5);
        bookFlap?.(b.model, b.flapT, st.air ? (I.stroke ? 0.65 : 0.4) : 0.08);
        b._impAir = st.air ? 1 : 0;
    },
    follow(g, b, n, dt) {
        const p = b.model.position, k = Math.min(1, dt * 8);
        p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; p.z += (n.z - p.z) * k;
        b.model.rotation.y = wrap(n.ry + Math.PI);
        b.state = 'imp';
        b.flapT = (b.flapT || 0) + dt * (n.air ? 14 : 1.5);
        bookFlap?.(b.model, b.flapT, n.air ? 0.5 : 0.08);
    },
    struck(g, b, I) { return I?.strikeNow ? { reach: 1.2, dmg: 1 } : null; }, // (a book's corner)
    release(g, b) { b.state = b._impAir ? 'fly' : 'perch'; b.t = 0; b.from?.copy?.(b.model.position); b.to?.copy?.(b.model.position); b.ctrl?.copy?.(b.model.position); b.wait = 1; },
    net(b) { const p = b.model.position; return [p.x, p.y, p.z, wrap(b.model.rotation.y + Math.PI), 0, 0, b._impAir || 0]; },
};

BODIES.D = dragons;
BODIES.o = owls;
BODIES.sx = spencers;
BODIES.g = gargoyles;
BODIES.f = phoenixes;
BODIES.b = books;

/** (the animals' adapter) a pig / the Pegasus in the Maxima: in the air its wings, by the arms. → true while it flies. */
export function animalWings(g, a, I, dt) {
    const kind = a.pegasus ? 'pegasus' : a.type === 'pig' ? 'pig' : null;
    if (!kind || !I.maxima) return false;
    const p = a.group.position, st = I.fly || (I.fly = { air: false, vf: 0, vy: 0 });
    const P = FLYERS[kind];
    if (!st.air && !(I.stroke > 0)) return false; // (on its legs: the animals' own walking)
    const ground = st.air ? 0 : a.spd || 0;
    const foot = { x: p.x, y: p.y - 0.5, z: p.z };
    const yaw = flyFrame(g, foot, a.group.rotation.y, I, st, P, dt, 0.5, ground);
    if (!st.air && !st.landed) return false;
    p.set(foot.x, foot.y + 0.5, foot.z);
    a.group.rotation.y = yaw;
    a.vel?.set?.(0, 0, 0); a.airborne = false; a.spd = st.vf;
    a.flyCode = st.air ? (I.stroke || st.vy > 0.5 ? 1 : 2) : 0; // (the wings: 1 beating, 2 spread in a glide — Animals._pigBody / PigFlight.wingTick, the Pegasus' model)
    a.bank = Math.max(-0.5, Math.min(0.5, -wrap(I.yaw - yaw) * 0.7)); a.pitch = Math.max(-0.3, Math.min(0.3, st.vy * 0.05));
    a.fly = null;
    a.walkT = (a.walkT || 0) + dt * (st.air ? 0 : 2);
    a._impAir = st.air ? 1 : 0;
    g.animals?._animate?.(a, 0, dt);
    return st.air;
}

/** (tests) the bodies of the Maxima. */
export const FLYER_SYSTEMS = ['D', 'o', 'f', 'b', 'g', 'sx'];
export { BODY_R };
