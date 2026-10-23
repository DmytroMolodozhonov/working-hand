/**
 * ImperiusBodies.js — «Империус»: how each kind of creature is driven by the mind in it (ImperiusControl.js).
 *
 * One adapter per system of the game. The creature walks by its OWN legs, speed and collisions — the way its
 * system walks it (a zombie by Zombie.update round the crowd, a person by CastleLife._steer along the walls and
 * up the ledges, a beast by Animals._steer / _body): the mind only says where to («the carrot»: a point ahead in
 * the way the hero's body turned, as far as the walk asks). So it never goes through a wall, a counter, a fence,
 * another creature, never wades into deep water a beast never would — and a stun, the ice, «Даст» still hold it.
 *
 *   list(g, fn)       every creature of the kind that could be taken: fn(c, x, y, z, up)
 *   find(g, id)       the creature by its id (alive or not)
 *   dead(c)           gone for the spell (dead, dying, turned to sand…)
 *   pos(c, out)       its feet
 *   face(c)           where it looks (the game's yaw: forward = (−sin, −cos))
 *   head(c)           the head (its own Object3D: hidden while the eyes are in it; the eyes measured on it)
 *   size(c)           m: its height (the camera behind it, the light's arc)
 *   drive(g, c, I, dt)  this computer's mind drives it: I = {yaw, walk (0…1 — how fast the legs go), run, jump, strike}
 *   follow(g, c, n, dt) the host draws it where its guest's mind put it (n = the last {x, y, z, ry, w, at})
 *   struck(g, c)      → the blow lands now ({reach, dmg}) — the natural blow of the creature, at its own moment
 *   release(g, c)     back to its own mind (its way forgotten: it looks round where it stands)
 *   net(c)            what the guest sends: [x, y, z, ry, w, attacking]
 */

import * as THREE from 'three';
import { ZOMBIE } from '../entities/Zombie.js';
import { SPECIES } from './Animals.js';
import { STATS, WALK, RUN } from './CastleLife.js';
import { wardsOf, pushOut } from './ShieldWalls.js';

const _v = new THREE.Vector3();
const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const turn = (from, to, max) => { const d = wrap(to - from); return from + Math.max(-max, Math.min(max, d)); };

/** How far ahead the carrot is put (m): a walk never reaches it in a frame — the creature keeps walking. */
const CARROT = 6;
/** m: a turn without a walk — the carrot this close, inside the creature's stop: it turns its face, no step. */
const TURN_ONLY = 0.3;

// ============================================================ zombies
const ZOMBIE_R = 0.88; // (Game.ZOMBIE_RADIUS)
const zombies = {
    sys: 'z',
    list(g, fn) { for (const z of g.zombies || []) if (!z.isDead && !z.isDying && z.group?.visible !== false) fn(z, z.group.position.x, z.group.position.y - (z.gOff || 0), z.group.position.z, 3.2 * (z.sizeK || 1)); },
    find(g, id) { return g.zombieById?.get(id) || null; },
    dead(c) { return !!(c.isDead || c.isDying || c.removable); },
    pos(c, out) { return out.set(c.group.position.x, c.group.position.y - (c.gOff || 0), c.group.position.z); },
    face(c) { return wrap(c.group.rotation.y + Math.PI); }, // (a zombie's yaw points along (sin, cos))
    head(c) { return c.head; },
    size(c) { return 3.5 * (c.sizeK || 1); },
    drive(g, z, I, dt) {
        if (!z.steer && g._zombieStep) z.steer = (me, p, ux, uz, d, speed, sdt) => g._zombieStep(me, p, ux, uz, d, speed, sdt);
        const p = z.group.position, fx = -Math.sin(I.yaw), fz = -Math.cos(I.yaw);
        const far = I.walk > 0.02 ? CARROT : TURN_ONLY; // (no walk: only its face turns — it stands)
        z.pace = I.walk > 0.02 ? 0.55 + 0.45 * Math.min(1, I.walk) : 1; // (it shambles slowly or trudges at its full pace — a zombie never runs)
        _v.set(p.x + fx * far, p.y, p.z + fz * far);
        if (I.strike && !z.isAttacking && !(z.attackCd > 0)) { z.attackCd = ZOMBIE.EVERY; z.triggerAttack(); }
        z.attackCd = Math.max(0, (z.attackCd || 0) - dt);
        if (g._zombieSwim?.(z, dt)) return; // (in deep water: it paddles, as on its own)
        z.update(dt, _v, g.camera, g.collision);
        g.collision?.resolveCylinder?.(p, ZOMBIE_R * (z.sizeK || 1), p.y - (z.gOff || 0), 3.5 * (z.sizeK || 1), 1.05);
        const w = wardsOf(g);
        if (w.length) { const o = { x: p.x, y: p.y - (z.gOff || 0), z: p.z }; if (pushOut(o, ZOMBIE_R, w, 1)) { p.x = o.x; p.z = o.z; } }
    },
    follow(g, z, n, dt) {
        z.netTarget = (z.netTarget || new THREE.Vector3()).set(n.x, n.y + (z.gOff || 0), n.z);
        z.netRotY = wrap(n.ry + Math.PI); z.netRotX = 0;
        if (n.atk && !z.isAttacking) z.triggerAttack();
        z.updateRemote(dt, null);
    },
    struck(g, z) {
        if (!z.struck) return null;
        z.struck = false;
        return { reach: ZOMBIE.REACH * (z.sizeK || 1) + 0.6, dmg: 1 };
    },
    release(g, z) { z.pace = 1; z.attackCd = 0; },
    net(z) { const p = z.group.position; return [p.x, p.y - (z.gOff || 0), p.z, wrap(z.group.rotation.y + Math.PI), z._impWalk || 0, z.isAttacking ? 1 : 0]; },
};

// ============================================================ castle / village people, wizards, travellers
const people = {
    sys: 'v',
    list(g, fn) { for (const v of g.castleLife?.byId?.values?.() || []) if (!v.dead && v.group?.visible !== false && !v.handLink) fn(v, v.x, v.y, v.z, 3.4); },
    find(g, id) { return g.castleLife?.byId?.get(id) || null; },
    dead(c) { return !!c.dead; },
    pos(c, out) { return out.set(c.x, c.y, c.z); },
    face(c) { return c.yaw || 0; },
    head(c) { return c.model?.head || null; },
    size(c) { return c.wizard ? 4.0 : 3.6; },
    drive(g, v, I, dt) {
        const L = g.castleLife;
        if (!L) return;
        v.seated = false; v.chore = null; v.path = null; v.spot = null; v.order = null; v.foe = null; v.fear = 0; v.fleeT = 0; v.talking = 0;
        // (stunned, frozen, thrown, lifted, swimming, climbing a ledge: its own body does that — as on its own)
        if (v.stunT > 0 || v.vy || v.lev || v.climb || v.flinchT > 0) { L._think(v, dt); return; }
        if (L._swim?.(v, dt)) return;
        const speed = I.walk > 0.02 ? WALK + (RUN - WALK) * Math.min(1, I.run ? I.walk : 0) : 0;
        v._impWalk = speed > 0 ? Math.min(1, speed / RUN) : 0;
        if (speed > 0) L._steer(v, v.x - Math.sin(I.yaw) * CARROT, v.z - Math.cos(I.yaw) * CARROT, speed, dt, 0);
        else { v.speed = 0; v.yaw = turn(v.yaw || 0, I.yaw, dt * 6); }
        L._ground(v);
        if (I.strike && v.mode !== 'attack' && !(v._impCd > 0)) { v._impCd = 1.1; v.mode = 'attack'; v._impAtkT = 0.75; }
        v._impCd = Math.max(0, (v._impCd || 0) - dt);
        if (v._impAtkT > 0) { v._impAtkT -= dt; v.speed = 0; if (v._impAtkT > 0) return; }
        v.mode = v.speed > WALK + 0.1 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
    },
    follow(g, v, n, dt) {
        const k = Math.min(1, dt * 10);
        const d = Math.hypot(n.x - v.x, n.z - v.z);
        v.x += (n.x - v.x) * k; v.y += (n.y - v.y) * k; v.z += (n.z - v.z) * k;
        v.yaw = turn(v.yaw || 0, n.ry, dt * 10);
        v.speed = n.w * RUN;
        v.mode = n.atk ? 'attack' : d > 0.02 || v.speed > 0 ? (v.speed > WALK + 0.1 ? 'run' : 'walk') : 'idle';
    },
    struck(g, v) {
        if (!v.model?.strikeNow) return null;
        const base = STATS[v.role]?.dmg ?? (v.wizard ? 1 : 1);
        return { reach: 3.4, dmg: v.disarmed ? 1 : base };
    },
    release(g, v) { v.mode = 'idle'; v.speed = 0; v.path = null; v._impAtkT = 0; },
    net(v) { return [v.x, v.y, v.z, v.yaw || 0, v._impWalk || 0, v.mode === 'attack' ? 1 : 0]; },
};

// ============================================================ animals (cows, sheep, horses, pigs on foot…)
const animals = {
    sys: 'a',
    list(g, fn) { for (const a of g.animals?.list || []) if (!a.dead && a.group && !a.rider && !a.cart && !a.mount && !a.lev) fn(a, a.group.position.x, a.group.position.y - 0.5, a.group.position.z, 1.8 * (SPECIES[a.type]?.size || 1)); },
    find(g, id) { return g.animals?.byId?.get(id) || null; },
    dead(c) { return !!c.dead; },
    pos(c, out) { return out.set(c.group.position.x, c.group.position.y - 0.5, c.group.position.z); },
    face(c) { return c.group.rotation.y; },
    head(c) { return c.model?.userData?.head || null; },
    size(c) { return 1.6 * (SPECIES[c.type]?.size || 1); },
    drive(g, a, I, dt) {
        const A = g.animals, S = SPECIES[a.type] || SPECIES.cow, p = a.group.position;
        if (!A) return;
        if (I.wings?.(g, a, I, dt)) return; // («Империус Максима»: a pig / the Pegasus in the air — by the arms, ImperiusFlyers.animalWings)
        a.state = 'graze'; a.attacker = null; a.idle = 'stand'; a.lie = 0;
        if (a.fly) { a.fly = null; a.airborne = true; a.flyCode = 4; } // (a pig in the air when taken: the plain spell does not hold its wings — it falls, and walks)
        a.t = (a.t || 0) + dt;
        if (a.stunT > 0) { A._think(a, dt); return; } // (stunned / thrown: its own body)
        if (A._swim?.(a, dt)) return;
        const speed = I.walk > 0.02 ? S.speed + (S.run - S.speed) * Math.min(1, I.run ? I.walk : 0) : 0;
        a.target.set(p.x - Math.sin(I.yaw) * CARROT, p.y, p.z - Math.cos(I.yaw) * CARROT);
        if (speed > 0) A._steer(a, dt, speed, false);
        else { a.spd = Math.max(0, (a.spd || 0) - dt * 5); a.group.rotation.y = turn(a.group.rotation.y, I.yaw, dt * 2.6); }
        // a jump: a hop (a horse clears a fence; the others a little)
        if (I.jump && !a.airborne) { a.vel = a.vel || new THREE.Vector3(); a.vel.y = a.type === 'horse' ? 9 : 6; a.vel.x -= Math.sin(a.group.rotation.y) * a.spd * 0.4; a.vel.z -= Math.cos(a.group.rotation.y) * a.spd * 0.4; a.airborne = true; }
        // the butt / the kick: a lunge forward, the head down — the blow lands in the middle of it
        if (I.strike && !(a._impCd > 0)) { a._impCd = 1.2; a._impAtkT = 0.45; a.vel = a.vel || new THREE.Vector3(); a.vel.x -= Math.sin(a.group.rotation.y) * 3; a.vel.z -= Math.cos(a.group.rotation.y) * 3; }
        a._impCd = Math.max(0, (a._impCd || 0) - dt);
        a._impLand = false;
        if (a._impAtkT > 0) { const was = a._impAtkT; a._impAtkT -= dt; if (was > 0.22 && a._impAtkT <= 0.22) a._impLand = true; }
        a._impWalk = Math.min(1, (a.spd || 0) / Math.max(1, S.run));
        A._body(a, dt);
        if (a.type === 'runbook') g.runner?.animateRemote?.(a, dt); // (a running book's own little legs — RunningBook.js)
        else A._animate(a, Math.min(1, (a.spd || 0) / 5), dt);
    },
    follow(g, a, n, dt) {
        const p = a.group.position, k = Math.min(1, dt * 10);
        const step = Math.hypot(n.x - p.x, n.z - p.z) * k;
        p.x += (n.x - p.x) * k; p.y += (n.y + 0.5 - p.y) * k; p.z += (n.z - p.z) * k;
        a.group.rotation.y = turn(a.group.rotation.y, n.ry, dt * 10);
        a.walkT = (a.walkT || 0) + step * 2.2;
        a.spd = step / Math.max(1e-3, dt);
        if (a.type === 'runbook') g.runner?.animateRemote?.(a, dt);
        else g.animals?._animate?.(a, Math.min(1, n.w * 1.5), dt);
    },
    struck(g, a) {
        if (!a._impLand) return null;
        a._impLand = false;
        const S = SPECIES[a.type] || SPECIES.cow;
        return { reach: 1.6 * S.size + 0.9, dmg: S.dmg };
    },
    release(g, a) { a.target?.copy?.(a.group.position); a.state = 'graze'; a.spd = 0; a._impAtkT = 0; },
    net(a) { const p = a.group.position; return [p.x, p.y - 0.5, p.z, a.group.rotation.y, a._impWalk || 0, a._impAtkT > 0 ? 1 : 0]; },
};

/** Every adapter by its system key (the Maxima's own — dragons, owls, books… — are added by ImperiusFlyers.js). */
export const BODIES = { z: zombies, v: people, a: animals };

/** The eyes of a creature (a world point), measured once on its head: the front of the head, a little above its middle. */
export function eyeOffset(head) {
    if (!head) return null;
    head.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(head);
    if (box.isEmpty()) return new THREE.Vector3();
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    c.y += s.y * 0.18;
    return head.worldToLocal(c);
}
