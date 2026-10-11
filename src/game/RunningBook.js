/**
 * RunningBook.js — the running book: a rare, cheerful book on little legs.
 *
 * A closed book (the book-birds' covers, gold trim, cream pages) stands on two
 * thin legs and smiles. It is three times rarer than the book-birds: at most
 * one is about, and after it is gone it takes a long while for the next.
 * It runs from people (fast, but it tires and has to slow down and rest),
 * dodges aside when a hand is about to get it, hides behind trees and rocks,
 * and now and then stops to look around.
 *
 * It is caught only with the hands: a free hand (or both) that CLOSES on it
 * — open fingers, then a fist right on its body as it passes. The one who
 * catches it gets +30% run speed (the book gives its quickness and
 * vanishes in golden sparks). Only once: another book gives nothing more (it
 * wriggles out and runs on). The bonus is kept with the player (the save) and
 * lost on death.
 *
 * It is an animal of Animals.js (type 'runbook'), so blows, arrows, blasts,
 * «Левиоса», «Остолбеней» and the other spells work on it like on any
 * creature; «Акцио» pulls it to the caster (it lands dazed at their feet).
 * Multiplayer: the host runs the book (Animals syncs it), decides catches;
 * the bonus is each player's own.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';

export const RUNNER = {
    BONUS: 0.3, // +30% run speed
    SIZE: 1.6, // the model scale (about the player's knee-to-hip: bend down to catch it)
    SCARE: 13, // m: a person this close — it runs
    CALM: 18, // m: further than this — it calms down
    DODGE: 3.4, // m: a person this close — a quick jump aside
    RUN: 9.5, // m/s fresh (a player runs 7.5)
    WALK: 2.2,
    TIRE: 7, // s of full running empties it
    REST: 5, // s of rest fills it again
    LOOK: 0.6, // s it stops to look around while fleeing
    CHECK: 20, // s between tries to bring one (host)
    CHANCE: 1 / 3, // a third of the tries: three times rarer than the book-birds
    CLOSE_MS: 900, // the hand was open this recently: it is closing on it
};
const COVERS = [0x8e2b2b, 0x2b4f8e, 0x2f6b3a, 0x6b3f8e, 0x8e6a2b];
export const runBookColor = (id) => COVERS[Math.abs(id | 0) % COVERS.length];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ model
/** The body's box in the model (before scaling): a closed book standing up on legs. */
export const BODY = { w: 0.6, h: 0.8, d: 0.2, y0: 0.32 };

/** A book on legs; body along −Z (its face looks forward), feet at y=0. */
export function runningBookModel(color = COVERS[0]) {
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
    const paper = new THREE.MeshLambertMaterial({ color: 0xf3ead2 });
    const black = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const cy = BODY.y0 + BODY.h / 2;
    const body = new THREE.Group();
    body.position.y = cy;
    g.add(body);
    const box = (w, h, d, mat, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        body.add(m);
        return m;
    };
    // the covers (front with the face, back), the pages between, the spine on the left
    const front = box(BODY.w, BODY.h, 0.04, cover, 0, 0, -BODY.d / 2 + 0.02);
    box(BODY.w, BODY.h, 0.04, cover, 0, 0, BODY.d / 2 - 0.02);
    box(BODY.w - 0.06, BODY.h - 0.06, BODY.d - 0.08, paper, 0.03, 0, 0);
    box(0.06, BODY.h, BODY.d, cover, -BODY.w / 2 + 0.03, 0, 0);
    for (const y of [-0.3, 0.3]) box(0.07, 0.05, BODY.d + 0.01, gold, -BODY.w / 2 + 0.03, y, 0);
    box(0.05, BODY.h, 0.045, gold, BODY.w / 2 - 0.025, 0, -BODY.d / 2 + 0.02); // trim on the front edge
    // the face on the front cover: eyes and a wide smile
    const fz = -BODY.d / 2 - 0.005;
    for (const sx of [-0.13, 0.13]) {
        box(0.12, 0.13, 0.02, white, sx, 0.14, fz);
        box(0.06, 0.07, 0.02, black, sx + 0.015, 0.13, fz - 0.01);
    }
    const smile = [[-0.17, 0.0], [-0.12, -0.06], [-0.06, -0.09], [0, -0.1], [0.06, -0.09], [0.12, -0.06], [0.17, 0.0]];
    for (const [x, y] of smile) box(0.065, 0.045, 0.02, black, x, y - 0.06, fz);
    box(0.12, 0.04, 0.02, red, 0, -0.17, fz - 0.002); // the tongue in the smile
    for (const sx of [-0.21, 0.21]) box(0.07, 0.04, 0.02, new THREE.MeshLambertMaterial({ color: 0xf08a8a }), sx, -0.02, fz); // rosy cheeks
    // two legs with little shoes (pivots at the hips)
    const legs = [];
    for (const sx of [-0.14, 0.14]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, BODY.y0, 0);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, BODY.y0, 0.06), black);
        leg.position.y = -BODY.y0 / 2;
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), red);
        shoe.position.set(0, -BODY.y0 + 0.03, -0.03);
        pivot.add(leg, shoe);
        g.add(pivot);
        legs.push(pivot);
    }
    g.userData.legs = legs;
    g.userData.body = body;
    g.userData.front = front;
    g.userData.runbook = true;
    return g;
}

// ------------------------------------------------------------- pure helpers
/** Speed for how rested it is (stamina 0…1): fresh it outruns a player, tired it is easy to reach. */
export function runSpeed(stamina) {
    const s = Math.max(0, Math.min(1, stamina));
    return RUNNER.RUN * (0.45 + 0.55 * s);
}

/** Stamina after dt seconds running (k 0…1 of full speed) or resting. */
export function staminaStep(stamina, dt, running) {
    return Math.max(0, Math.min(1, stamina + (running ? -dt * running / RUNNER.TIRE : dt / RUNNER.REST)));
}

/**
 * A place to hide from the threat: behind the obstacle (a tree, a rock…) that is
 * near the book and not towards the threat. obstacles: [{x, z, r}]. Null if none fits.
 */
export function hideSpot(book, threat, obstacles, maxD = 14) {
    let best = null, bestS = Infinity;
    for (const o of obstacles) {
        const db = Math.hypot(o.x - book.x, o.z - book.z);
        if (db > maxD) continue;
        const dt = Math.hypot(o.x - threat.x, o.z - threat.z);
        if (dt < db) continue; // (it would run at the person)
        const s = db - 0.6 * dt;
        if (s < bestS) { bestS = s; best = o; }
    }
    if (!best) return null;
    let dx = best.x - threat.x, dz = best.z - threat.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const k = (best.r || 0.5) + 1.3;
    return { x: best.x + dx * k, z: best.z + dz * k, from: best };
}

/** Is a point behind the obstacle as seen from the threat (the line of sight passes the obstacle)? */
export function hidden(book, threat, o) {
    const ax = book.x - threat.x, az = book.z - threat.z;
    const L2 = ax * ax + az * az;
    if (L2 < 1e-6) return false;
    const t = ((o.x - threat.x) * ax + (o.z - threat.z) * az) / L2;
    if (t <= 0 || t >= 1) return false;
    const px = threat.x + ax * t - o.x, pz = threat.z + az * t - o.z;
    return Math.hypot(px, pz) < (o.r || 0.5) + 0.3;
}

/**
 * Is a palm on the book's body? In the book's own frame: within its box (a hand's
 * thickness around it). pos — the book's feet, yaw — its turn, size — its scale.
 */
export function palmOnBook(palm, pos, yaw, size = RUNNER.SIZE) {
    const dx = palm.x - pos.x, dz = palm.z - pos.z;
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const ly = palm.y - pos.y - (BODY.y0 + BODY.h / 2) * size;
    return Math.abs(lx) < (BODY.w / 2) * size + 0.25 && Math.abs(ly) < (BODY.h / 2) * size + 0.25 && Math.abs(lz) < (BODY.d / 2) * size + 0.3;
}

/**
 * A hand closes on something: fingers now closed, and they were open a moment ago
 * (in time, or in frames — a slow computer draws few frames a second).
 */
export function closing(curl, lastOpenMs, nowMs, framesSinceOpen = Infinity) {
    return curl > 0.55 && (nowMs - lastOpenMs < RUNNER.CLOSE_MS || framesSinceOpen <= 12);
}

// ================================================================== system
export class RunningBook {
    constructor(game) {
        this.game = game;
        this._checkT = 8;
        this._open = { left: -1e9, right: -1e9 };
        this._openF = { left: -1e9, right: -1e9 };
        this._frame = 0;
        this._toldT = -1e9;
        this._asked = new Map(); // id -> time a guest asked the host to catch it
    }

    get auth() { return this.game.authority; }
    get enabled() { return !!this.game.animals?.enabled; }

    /** My bonus (+0.3) or 0. */
    get bonus() { return this.game.bonus?.run || 0; }

    /** The living running books. */
    books() {
        return (this.game.animals?.list || []).filter((a) => a.type === 'runbook' && !a.dead);
    }

    // ------------------------------------------------------------ spawn (host)
    /** Bring one somewhere around (dist m from me), or at `pos`. */
    spawnNear(dist = 40, pos = null) {
        const g = this.game, A = g.animals;
        if (!A) return null;
        const me = g.character.group.position;
        let p = pos;
        for (let i = 0; i < 12 && !p; i++) {
            const a = Math.random() * Math.PI * 2;
            const x = me.x + Math.cos(a) * dist, z = me.z + Math.sin(a) * dist;
            const t = g.terrain?.data;
            if (t) {
                const top = t.topLayer(Math.round(x), Math.round(z));
                if (t.get(Math.round(x), top + 1, Math.round(z)) === BLOCK.WATER || t.get(Math.round(x), top, Math.round(z)) === BLOCK.WATER) continue;
                if (t.castles?.landAt?.(Math.round(x), Math.round(z))) continue;
            }
            p = new THREE.Vector3(x, g.collision.groundY(x, z) + 0.5, z);
        }
        if (!p) return null;
        return A._spawn('runbook', p);
    }

    // ------------------------------------------------------------ the brain (host)
    _threats(a) {
        const g = this.game;
        const out = [];
        if (!g.isDeadLocal && !g.combat?.dead) out.push({ id: g.localId, p: g.character.group.position });
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) out.push({ id, p: r.position });
        const p = a.group.position;
        let best = null, bd = Infinity;
        for (const t of out) {
            let d = Math.hypot(t.p.x - p.x, t.p.z - p.z);
            if (a.attacker && t.id === a.attacker && a.stateT > 0) d *= 0.6; // (the one who hit it is scarier)
            if (d < bd) { bd = d; best = t; }
        }
        return best ? { ...best, d: Math.hypot(best.p.x - p.x, best.p.z - p.z) } : null;
    }

    _obstacles(p) {
        const g = this.game;
        const out = [];
        for (const t of g.world?.trees || []) if (t.alive && !t.burnt && Math.abs(t.x - p.x) < 16 && Math.abs(t.z - p.z) < 16) out.push({ x: t.x, z: t.z, r: 0.8 });
        // rocks, walls, houses: a column of blocks clearly higher than the ground here
        const data = g.terrain?.data;
        if (data) {
            const here = data.topLayer(Math.round(p.x), Math.round(p.z));
            for (let i = 0; i < 16; i++) {
                const ang = (i / 16) * Math.PI * 2, d = 3 + (i % 4) * 2.5;
                const x = Math.round(p.x + Math.cos(ang) * d), z = Math.round(p.z + Math.sin(ang) * d);
                if (data.topLayer(x, z) - here >= 2) out.push({ x, z, r: 0.7 });
            }
        }
        return out;
    }

    /** One step of a running book's mind (Animals calls it for the host; after a stun). */
    think(a, dt) {
        const g = this.game, A = g.animals;
        const p = a.group.position;
        const rb = a.rb || (a.rb = { stamina: 1, mode: 'look', t: 0, lookT: 2 + Math.random() * 3, dodgeT: 0, dodge: null, hide: null, obsT: 0, obs: [], fleeT: 0, zig: Math.random() * 6 });
        if (a.damageCooldown > 0) a.damageCooldown -= dt;
        if (a.stateT > 0) a.stateT -= dt;
        rb.t += dt;
        rb.dodgeT -= dt;
        rb.obsT -= dt;
        if (rb.obsT <= 0) { rb.obsT = 1; rb.obs = this._obstacles(p); }
        const th = this._threats(a);
        let speed = 0, dir = null, face = null;
        const scared = th && (th.d < RUNNER.SCARE || (rb.mode !== 'look' && th.d < RUNNER.CALM) || (a.stateT > 0 && th.id === a.attacker));
        if (rb.dodge && rb.dodge.t > 0) {
            // a quick jump aside (a hand was about to get it)
            rb.dodge.t -= dt;
            dir = _v2.set(rb.dodge.x, 0, rb.dodge.z);
            speed = RUNNER.RUN * 1.25;
            rb.stamina = staminaStep(rb.stamina, dt, 1.5);
        } else if (scared) {
            rb.dodge = null;
            const away = _v.set(p.x - th.p.x, 0, p.z - th.p.z);
            if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
            away.normalize();
            if (th.d < RUNNER.DODGE && rb.dodgeT <= 0 && rb.stamina > 0.1) {
                // sideways, to the side it already leans to (a person can't follow so fast)
                const side = Math.random() < 0.5 ? 1 : -1;
                rb.dodge = { x: -away.z * side + away.x * 0.4, z: away.x * side + away.z * 0.4, t: 0.4 };
                const l = Math.hypot(rb.dodge.x, rb.dodge.z);
                rb.dodge.x /= l; rb.dodge.z /= l;
                rb.dodgeT = 1.6 + Math.random();
                a.state = 'run';
                this._animate(a, dt, 1);
                A._body(a, dt);
                return;
            }
            // somewhere to hide close by? behind it, out of sight
            if (!rb.hide || rb.t > 6) {
                rb.t = 0;
                rb.hide = th.d > 5 ? hideSpot(p, th.p, rb.obs) : null;
            }
            if (rb.hide && hidden(p, th.p, rb.hide.from) && Math.hypot(rb.hide.x - p.x, rb.hide.z - p.z) < 1.2 && th.d > 6) {
                // hidden: it sits still and peeks out
                rb.mode = 'hide';
                face = _v2.set(th.p.x - p.x, 0, th.p.z - p.z);
                rb.stamina = staminaStep(rb.stamina, dt, 0);
            } else {
                rb.mode = 'flee';
                rb.fleeT += dt;
                // now and then it stops for a moment and looks back (if the person is not too close)
                if (rb.fleeT > 3.5 + (a.id % 3) && th.d > 8 && rb.stamina > 0.2) { rb.fleeT = -RUNNER.LOOK; }
                if (rb.fleeT < 0) {
                    face = _v2.set(th.p.x - p.x, 0, th.p.z - p.z);
                    rb.stamina = staminaStep(rb.stamina, dt, 0);
                } else {
                    if (rb.hide) dir = _v2.set(rb.hide.x - p.x, 0, rb.hide.z - p.z);
                    else {
                        // away, zig-zagging a little
                        rb.zig += dt * 2.4;
                        const z = Math.sin(rb.zig) * 0.45;
                        dir = _v2.set(away.x - away.z * z, 0, away.z + away.x * z);
                    }
                    speed = runSpeed(rb.stamina);
                    rb.stamina = staminaStep(rb.stamina, dt, 1);
                }
            }
        } else {
            // calm: it walks about a little and looks around
            rb.mode = 'look';
            rb.hide = null;
            rb.fleeT = 0;
            rb.stamina = staminaStep(rb.stamina, dt, 0);
            rb.lookT -= dt;
            if (rb.lookT <= 0) {
                rb.lookT = 2 + Math.random() * 4;
                if (Math.random() < 0.5) { const ang = Math.random() * Math.PI * 2; a.target.set(p.x + Math.cos(ang) * 4, p.y, p.z + Math.sin(ang) * 4); rb.walk = true; }
                else { rb.walk = false; rb.lookYaw = a.group.rotation.y + (Math.random() - 0.5) * 2.4; }
            }
            if (rb.walk && Math.hypot(a.target.x - p.x, a.target.z - p.z) > 0.5) { dir = _v2.set(a.target.x - p.x, 0, a.target.z - p.z); speed = RUNNER.WALK; }
            else if (rb.lookYaw != null) a.group.rotation.y += (rb.lookYaw - a.group.rotation.y) * Math.min(1, dt * 3);
        }
        if (dir && speed > 0 && dir.lengthSq() > 1e-6) {
            dir.normalize();
            this._turn(a, dir, dt, 10);
            p.addScaledVector(dir, speed * dt);
        } else if (face && face.lengthSq() > 1e-6) this._turn(a, face.normalize(), dt, 6);
        a.state = speed > 0 ? 'run' : 'graze';
        if (rb.stamina < 0.15 && speed > 0 && Math.random() < dt * 2) g.fx?.spark(_v.copy(p).setY(p.y + 1.6), 0xffffff, 0.06, _v.set(0, 0.6, 0), 0.5); // (puffing)
        this._animate(a, dt, speed / RUNNER.RUN);
        A._body(a, dt);
    }

    _turn(a, dir, dt, rate) {
        const want = Math.atan2(-dir.x, -dir.z);
        let dy = want - a.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        a.group.rotation.y += dy * Math.min(1, dt * rate);
    }

    /** Little legs (fast steps), the body bobs; tired it leans and sways. */
    _animate(a, dt, k) {
        a.walkT += dt * (4 + 18 * k);
        const sw = Math.sin(a.walkT) * 0.9 * Math.min(1, k * 2);
        const legs = a.model.userData.legs;
        if (legs) { legs[0].rotation.x = sw; legs[1].rotation.x = -sw; }
        const body = a.model.userData.body;
        if (body) {
            body.position.y = BODY.y0 + BODY.h / 2 + Math.abs(Math.sin(a.walkT)) * 0.05 * Math.min(1, k * 2);
            body.rotation.x = -0.15 * k; // leaning into the run
            body.rotation.z = (a.rb?.stamina ?? 1) < 0.2 ? Math.sin(a.walkT * 0.5) * 0.08 : 0;
        }
    }

    /** (guests) the legs move while the host says it runs. */
    animateRemote(a, dt) {
        this._animate(a, dt, a.netMoving ? 0.8 : 0);
    }

    // ------------------------------------------------------------ catching
    /** My hands: a free hand that closes on a running book catches it. */
    _hands() {
        const g = this.game;
        const ch = g.character;
        if (!g.currentPose || g.combat?.dead || g.isDeadLocal || !ch.getGripCurl) return;
        const now = performance.now();
        const books = this.books();
        this._frame++;
        for (const side of ['right', 'left']) {
            const curl = ch.getGripCurl(side);
            if (curl < 0.35) { this._open[side] = now; this._openF[side] = this._frame; }
            if (!books.length) continue;
            if (g.weapons?.hands?.[side]?.held || g.items?.held?.[side] || g.books?.reading?.handBusy?.(side)) continue;
            if (!closing(curl, this._open[side], now, this._frame - this._openF[side])) continue;
            const palm = ch.getHandWorldPosition(side, _v);
            for (const a of books) {
                if (!palmOnBook(palm, a.group.position, a.group.rotation.y, RUNNER.SIZE)) continue;
                this._open[side] = this._openF[side] = -1e9; // (one closing — one catch)
                this.caughtByMe(a, side);
                return;
            }
        }
    }

    /** My hand got one. */
    caughtByMe(a, side = 'right') {
        const g = this.game;
        if (this.bonus > 0) {
            // only once: it wriggles out of the fingers and runs on
            if (performance.now() - this._toldT > 3000) { this._toldT = performance.now(); g.hud?.toast?.('📕 Вы уже получили быстроту от бегущей книги — вторая больше не даёт. Она вырвалась!', 3000); }
            if (this.auth) this._wriggle(a);
            return;
        }
        if (this.auth) { this._caught(a, g.localId); return; }
        const t = this._asked.get(a.id) ?? -1e9;
        if (performance.now() - t < 1500) return;
        this._asked.set(a.id, performance.now());
        g.sync?.net?.send({ t: 'rbcatch', id: a.id });
    }

    _wriggle(a) {
        const g = this.game;
        const me = g.character.group.position;
        const away = _v2.set(a.group.position.x - me.x, 0, a.group.position.z - me.z);
        if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
        away.normalize().multiplyScalar(6).setY(3);
        g.animals.push(a, away, 0.3);
        if (a.rb) { a.rb.mode = 'flee'; a.rb.dodgeT = 0; }
    }

    /** (host) `who` caught the book: it gives its quickness and vanishes. */
    _caught(a, who) {
        const g = this.game, A = g.animals;
        if (!a || a.dead || !A?.byId.has(a.id)) return;
        const p = a.group.position;
        for (let i = 0; i < 40; i++) g.fx?.spark(_v.copy(p).setY(p.y + 1), i % 2 ? 0xffd23f : 0xfff2a8, 0.12, _v2.set((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 1);
        if (a.lev) { if (g.levitation?._endCarry) g.levitation._endCarry('a', a); else a.lev = null; } // (caught out of «Левиоса»'s hold)
        A._remove(a);
        this._checkT = RUNNER.CHECK * 3; // (the next one only after a long while)
        if (who === g.localId) this.grant();
        else g.sync?.net?.send({ t: 'rbgot', to: who, id: a.id }, true);
    }

    /** +30% run speed (once). */
    grant() {
        const g = this.game;
        if (this.bonus > 0) return false;
        g.bonus = { ...(g.bonus || {}), run: RUNNER.BONUS };
        g.hud?.toast?.('👟 Вы поймали бегущую книгу! Она отдала вам свою быстроту: бег на 30% быстрее (пока вы живы)', 4000);
        g.sound?.playWhoosh?.();
        this._apply();
        return true;
    }

    /** Death takes the bonus away. */
    onDeath() {
        const g = this.game;
        if (!g.bonus?.run) return;
        const b = { ...g.bonus };
        delete b.run;
        g.bonus = Object.keys(b).length ? b : null;
        this._apply();
    }

    _apply() {
        const ch = this.game.character;
        if (ch) ch.runBonus = 1 + this.bonus;
    }

    // ------------------------------------------------------------ «Акцио»
    /** Running books a raised hand can summon (for Accio.js). */
    accioTargets() {
        return this.books().map((a) => ({ a, pos: _centre(a) }));
    }

    /** «Акцио» on a running book: it is pulled through the air to the caster's feet, dazed. */
    accio(a, handPos) {
        const g = this.game;
        if (!this.auth) { g.sync?.net?.send({ t: 'rbaccio', id: a.id, p: [handPos.x, handPos.y, handPos.z] }); return; }
        this._pull(a, handPos);
    }

    _pull(a, to) {
        const g = this.game;
        if (!a) return; // (alive, or a dead body of any animal: «Акцио» pulls it all the same)
        const p = a.group.position;
        const d = _v.set(to.x - p.x, 0, to.z - p.z);
        const L = d.length();
        if (L > 1e-3) d.multiplyScalar(Math.max(0, L - 1.5) / L);
        // a hop that lands about 1.5 m short of the hand (flight time ~ 2·vy/g)
        const vy = 7, T = (2 * vy) / 22;
        a.vel = new THREE.Vector3();
        g.animals.push(a, new THREE.Vector3(d.x / T, vy, d.z / T), T + 1.5);
        a.airborne = true;
        for (let i = 0; i < 16; i++) g.fx?.spark(p, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
    }

    // ------------------------------------------------------------ network
    onNet(m) {
        const g = this.game, A = g.animals;
        const isHost = g.sync?.net?.isHost;
        if (m.t === 'rbcatch' && isHost) this._caught(A?.byId.get(m.id), m.from);
        else if (m.t === 'rbgot' && m.to === g.localId) this.grant();
        else if (m.t === 'rbaccio' && isHost && Array.isArray(m.p)) {
            const a = A?.byId.get(m.id);
            if (a && (a.type === 'runbook' || a.dead)) this._pull(a, new THREE.Vector3(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0));
        }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        this._apply();
        if (!this.enabled) return;
        if (this.auth) {
            this._checkT -= dt;
            if (this._checkT <= 0) {
                this._checkT = RUNNER.CHECK;
                if (!this.books().length && Math.random() < RUNNER.CHANCE) this.spawnNear(30 + Math.random() * 25);
            }
        } else for (const a of this.books()) this.animateRemote(a, dt);
        this._hands();
    }
}

function _centre(a) {
    return new THREE.Vector3(a.group.position.x, a.group.position.y + (BODY.y0 + BODY.h / 2) * RUNNER.SIZE, a.group.position.z);
}
