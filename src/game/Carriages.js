/**
 * Carriages.js — carts on the roads of the world (the author: «a horse pulls a cart; two
 * wizards sit in it, one drives the horse, they carry a chest of valuables. The same, only a
 * less magical cart — with ordinary people going to town. People's carts more often, the
 * wizards' a little rarer. So that the world seems alive.»). Travelers.js decides who goes
 * where; this file is the cart itself:
 *
 *  - a real wooden body on four wheels (they turn with the way it rolls), shafts, a bench in
 *    front, benches along the sides, a chest in the back. The wizards' carriage: dark violet
 *    with gold, a canvas hood over the chest, two lanterns with a cold blue light, a pair of
 *    horses. The people's cart: plain boards, sacks and a barrel, one horse;
 *  - the horses are REAL horses of Animals.js harnessed to the shafts (a.cart): they walk at
 *    their places, their legs go with the cart's speed; everything that works on a horse works
 *    on them. A dead horse, or one torn out of the harness (lifted by «Левиоса», thrown by a
 *    blast farther than the traces reach) — the cart stands;
 *  - solid: a mover of the CollisionWorld (like a ship) — players, animals, zombies, living
 *    trees are pushed out of its box and can stand on its floor; arrows, charges and thrown
 *    things hit it (pointBlocked / sphereDepth); the castle people step round it (CastleLife).
 *    A rider on it is not pushed (they sit on its benches: Travelers puts them there);
 *  - the driver stops for somebody standing in the way; slopes, water, trees and walls are
 *    looked for ahead (wayFree) and gone round.
 *
 * On WHOM and on WHAT it acts / what acts on it (CLAUDE.md «кто/что × как действует»):
 *  - the cart (wood): blasts («Бомбардо», «… Максима», any Game.explode) and lightning break it
 *    (its HP), and set it on fire; the «Инферно» stream, «Fire Maxima» and other fire set it on
 *    fire — it burns its HP away, the riders jump off; burnt or broken: it is a wreck (no wheels,
 *    tilted), the chest falls out onto the ground. Rays (Сапира, Тандервейв, Ice…) chip it.
 *    A blade or a fist — no harm (thick oak boards, iron bands): not a weapon target.
 *    «Левиоса» — не действует: a cart with its horses in the shafts is far too heavy.
 *    Wind, blast waves, water vortexes — do not move it (heavy, its wheels braked by the horses),
 *    but water puts its fire out.
 *  - the horses, the people on it, the chest: see above (they are creatures / a chest of their own).
 *  - Danger.js: a burning or broken cart is a blast/fire near the people (castleLife.alarm).
 *
 * Network: the host decides (moves the carts, their HP, fire, wrecks) and sends 'cart' messages
 * (~5 a second); guests draw them where the host says. The horses and the riders come with the
 * animals' and the villagers' own messages; the chest with the chests'.
 */

import * as THREE from 'three';
import { Chest } from '../entities/Chest.js';
import { BLOCK } from '../world/Terrain.js';

export const CART = {
    LEN: 6.6, WID: 3.6, FLOOR: 1.75, SIDE: 0.85, WHEEL_R: 1.2,
    HORSE_Z: -(6.6 / 2 + 3.3), // local z of the horses (forward is −z)
    HP: 70, WALK: 2.1, TROT: 4.6, TURN_R: 9, // m/s; the tightest turn (m)
    BENCH: 0.7, // the seats over the floor
    BURN: 18, BURN_DPS: 2.5, // s a fire lasts on it; HP it takes a second
    WRECK_GONE: 300, // s a wreck lies there
    HARNESS: 4, // m: a horse moved farther than this from its place is out of the harness
};

/** The seats (local x, z, yaw against the cart, seat height over the floor): the driver first. */
export const SEATS = [
    { x: -0.55, z: -CART.LEN / 2 + 0.75, yaw: 0, y: CART.BENCH + 0.15 }, // the driver (the front bench)
    { x: 0.75, z: -CART.LEN / 2 + 0.75, yaw: 0, y: CART.BENCH + 0.15 },
    { x: -1.2, z: -0.15, yaw: -Math.PI / 2, y: CART.BENCH }, // the side benches, facing in
    { x: 1.2, z: -0.15, yaw: Math.PI / 2, y: CART.BENCH },
];
const CHEST_AT = { x: 0, z: CART.LEN / 2 - 1.35 };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = { x: 0, z: 0 };

/** local (x, z) of a cart at (px, pz) turned `yaw` → world (forward is local −z). */
export function cartToWorld(px, pz, yaw, lx, lz, out = { x: 0, z: 0 }) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.x = px + lx * c + lz * s;
    out.z = pz - lx * s + lz * c;
    return out;
}
/** world → local of a cart. */
export function worldToCart(px, pz, yaw, x, z, out = { x: 0, z: 0 }) {
    const c = Math.cos(yaw), s = Math.sin(yaw), dx = x - px, dz = z - pz;
    out.x = dx * c - dz * s;
    out.z = dx * s + dz * c;
    return out;
}

/**
 * How far (m, up to `dist`) the way is free from (x, z) along (dx, dz): firm ground that does not
 * rise or fall more than `rise` blocks a metre, no water, no trunk, wall or rock at body height,
 * no castle or tower land (but `into` — the site where they go). `half`: half the width to check.
 */
export function wayFree(game, x, z, dx, dz, dist, o = {}) {
    const t = game.world?.terrain?.data;
    if (!t?.floorBelow) return dist;
    const idx = t.sites || t.castles;
    const rise = o.rise ?? 1, half = o.half ?? 0, clear = o.clear ?? 3;
    const sides = half ? [0, -half, half] : [0];
    let prev = o.fromL ?? null;
    if (prev == null) { const f0 = t.floorBelow(Math.round(x), Math.round(z), t.topLayer(Math.round(x), Math.round(z))); prev = f0; }
    for (let s = 1; s <= dist; s++) {
        let centre = prev;
        for (const sd of sides) {
            const px = x + dx * s - dz * sd, pz = z + dz * s + dx * sd;
            const ix = Math.round(px), iz = Math.round(pz);
            const f = t.floorBelow(ix, iz, prev + rise);
            if (f < prev - Math.max(2, rise + 1)) return s - 1; // (a drop)
            if (t.solidIn(ix, iz, f + 1, f + clear)) return s - 1; // (a step too high, a trunk, a wall)
            if (t.get(ix, f + 1, iz) === BLOCK.WATER || t.isSeaColumn?.(ix, iz)) return s - 1;
            if (o.avoidLand && idx?.landAt) { const land = idx.landAt(ix, iz); if (land && land.castle?.id !== o.into) return s - 1; }
            if (!sd) centre = f;
        }
        prev = centre;
    }
    return dist;
}

// ------------------------------------------------------------------ the model
const _mats = new Map();
const lam = (hex, o = {}) => {
    const k = hex + JSON.stringify(o);
    if (!_mats.has(k)) _mats.set(k, new THREE.MeshLambertMaterial({ color: hex, ...o }));
    return _mats.get(k);
};
const box = (parent, w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
};

/** A wheel: a rim, a hub and spokes (turns about its local x). */
function wheel(mat, iron, r) {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.07, 0.09, 6, 22), iron);
    rim.rotation.y = Math.PI / 2;
    g.add(rim);
    const felloe = new THREE.Mesh(new THREE.TorusGeometry(r - 0.18, 0.08, 5, 22), mat);
    felloe.rotation.y = Math.PI / 2;
    g.add(felloe);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10), iron);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 8; i++) {
        const sp = box(g, 0.07, r * 2 - 0.4, 0.09, 0, 0, 0, mat);
        sp.rotation.x = (i / 8) * Math.PI;
    }
    return g;
}

/** The cart's shape: magic — the wizards' carriage; else the people's cart. Origin on the ground under the middle. */
export function cartModel(magic) {
    const g = new THREE.Group();
    g.name = magic ? 'wizardCarriage' : 'cart';
    g.rotation.order = 'YXZ';
    const L = CART.LEN, W = CART.WID, F = CART.FLOOR;
    const wood = lam(magic ? 0x3b2350 : 0x7a5530), dark = lam(magic ? 0x241433 : 0x5a3d22), iron = lam(magic ? 0xc9a23a : 0x3d3a36);
    const body = new THREE.Group();
    g.add(body);
    g.userData.body = body;
    // the floor, the sides, the front and the tailboard
    box(body, W, 0.2, L, 0, F - 0.1, 0, dark);
    box(body, 0.14, CART.SIDE, L, -W / 2 + 0.07, F + CART.SIDE / 2, 0, wood);
    box(body, 0.14, CART.SIDE, L, W / 2 - 0.07, F + CART.SIDE / 2, 0, wood);
    box(body, W, CART.SIDE + 0.3, 0.14, 0, F + (CART.SIDE + 0.3) / 2, -L / 2 + 0.07, wood);
    box(body, W, CART.SIDE, 0.14, 0, F + CART.SIDE / 2, L / 2 - 0.07, wood);
    // the rims of the sides (gold on the carriage)
    box(body, 0.2, 0.08, L, -W / 2 + 0.07, F + CART.SIDE, 0, iron);
    box(body, 0.2, 0.08, L, W / 2 - 0.07, F + CART.SIDE, 0, iron);
    // the beams under it and the axles
    box(body, 0.25, 0.25, L - 0.4, -W / 2 + 0.6, F - 0.32, 0, dark);
    box(body, 0.25, 0.25, L - 0.4, W / 2 - 0.6, F - 0.32, 0, dark);
    const axZ = [-L / 2 + 1.25, L / 2 - 1.25];
    for (const z of axZ) box(body, W + 0.5, 0.2, 0.2, 0, CART.WHEEL_R, z, iron);
    // the benches: the driver's in front, the sides
    box(body, W - 0.4, 0.14, 0.7, 0, F + CART.BENCH + 0.08, -L / 2 + 0.75, wood);
    box(body, 0.6, 0.14, 2.6, -1.25, F + CART.BENCH - 0.07, -0.15, wood);
    box(body, 0.6, 0.14, 2.6, 1.25, F + CART.BENCH - 0.07, -0.15, wood);
    // the shafts to the horse(s) and the yoke bar
    const shaftX = magic ? [-2.25, 2.25] : [-0.95, 0.95];
    for (const x of shaftX) {
        const s = box(body, 0.13, 0.13, 6.4, x, F - 0.05, -L / 2 - 3.0, dark);
        s.rotation.x = -0.05;
    }
    if (magic) box(body, 0.16, 0.16, 6.4, 0, F - 0.05, -L / 2 - 3.0, dark);
    box(body, shaftX[1] - shaftX[0] + 0.3, 0.12, 0.12, 0, F + 0.15, -L / 2 - 5.6, iron);
    // the wheels
    const wheels = [];
    for (const z of axZ) for (const sx of [-1, 1]) {
        const w = wheel(dark, iron, CART.WHEEL_R);
        w.position.set(sx * (W / 2 + 0.22), CART.WHEEL_R, z);
        body.add(w);
        wheels.push(w);
    }
    g.userData.wheels = wheels;
    if (magic) {
        // the hood over the chest: canvas over three hoops, with stars
        const hood = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, 2.7, 16, 1, true, -Math.PI / 2, Math.PI), lam(0x2b2f6e, { side: THREE.DoubleSide }));
        hood.rotation.x = Math.PI / 2;
        hood.position.set(0, F + CART.SIDE, L / 2 - 1.45);
        hood.castShadow = true;
        body.add(hood);
        const star = lam(0xf2d66b, { emissive: 0x6a5410 });
        for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + (i % 5 + 0.5) / 5 * Math.PI;
            const s = box(body, 0.16, 0.16, 0.16, Math.sin(a) * (W / 2 + 0.02), F + CART.SIDE + Math.cos(a) * (W / 2 + 0.02), L / 2 - 2.5 + (i > 4 ? 1.6 : 0.6), star);
            s.rotation.set(a, 0.6, 0.78);
        }
        // the lanterns at the front corners: a cold blue light
        const glass = lam(0x9fd2ff, { emissive: 0x4fa8ff });
        const lamps = [];
        for (const sx of [-1, 1]) {
            box(body, 0.1, 1.3, 0.1, sx * (W / 2 - 0.1), F + CART.SIDE + 0.5, -L / 2 + 0.15, iron);
            lamps.push(box(body, 0.32, 0.4, 0.32, sx * (W / 2 - 0.1), F + CART.SIDE + 1.3, -L / 2 + 0.15, glass));
        }
        // (where their light shines from: the one light of all carriages — Carriages.light — comes here
        // for the nearest one at night; a light of its own would change the count of lights, and every
        // lit shader in the world would be compiled again the moment a carriage came in sight)
        const lightAt = new THREE.Object3D();
        lightAt.position.set(0, F + CART.SIDE + 1.4, -L / 2 + 0.2);
        body.add(lightAt);
        g.userData.lamps = lamps;
        g.userData.lightAt = lightAt;
    } else {
        // the people's load: sacks and a barrel behind the benches
        const sack = lam(0xc9b48a), barrel = lam(0x6b4423);
        for (const [x, z] of [[-1.0, 1.0], [-0.95, 1.75], [1.0, 1.55]]) { const s = box(body, 0.9, 0.7, 0.75, x, F + 0.35, z, sack); s.rotation.y = x * 0.3; }
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), barrel);
        b.position.set(1.0, F + 0.5, 0.75);
        body.add(b);
    }
    return g;
}

// ------------------------------------------------------------------ the mover (collision)
/** The cart's box for the CollisionWorld (an oriented box: pushes bodies out, they stand on its floor). */
class CartCollider {
    constructor(c) { this.c = c; }

    _local(x, z) { const c = this.c; return worldToCart(c.x, c.z, c.yaw, x, z, this._l || (this._l = { x: 0, z: 0 })); }

    hasXZ(x, z, pad = 0) {
        const c = this.c;
        const r = CART.LEN / 2 + pad + 0.5;
        return Math.abs(x - c.x) < r && Math.abs(z - c.z) < r;
    }

    _inside(lx, lz, pad = 0) { return Math.abs(lx) < CART.WID / 2 + pad && Math.abs(lz) < CART.LEN / 2 + pad; }

    /** The top of the floor (or of a side) under a body that can reach it. */
    floorAt(x, z, reachY) {
        const c = this.c, l = this._local(x, z);
        if (!this._inside(l.x, l.z)) return null;
        const top = c.y + this._floorY(l);
        return top <= reachY + 0.05 ? top : null;
    }

    _floorY(l) { return CART.FLOOR + (this.c.wreck ? -0.6 : 0) + l.z * Math.sin(this.c.pitch || 0) * -1 + l.x * Math.sin(this.c.roll || 0); }

    pushCylinder(pos, r, feetY, h) {
        const c = this.c, l = this._local(pos.x, pos.z);
        if (!this._inside(l.x, l.z, r)) return false;
        const floor = c.y + this._floorY(l);
        if (feetY >= floor - 0.15) return false; // (standing on it)
        if (feetY + h <= c.y + 0.3) return false;
        // out through the nearest side
        const ex = CART.WID / 2 + r - Math.abs(l.x), ez = CART.LEN / 2 + r - Math.abs(l.z);
        if (ex < ez) l.x = Math.sign(l.x || 1) * (CART.WID / 2 + r);
        else l.z = Math.sign(l.z || 1) * (CART.LEN / 2 + r);
        const w = cartToWorld(c.x, c.z, c.yaw, l.x, l.z);
        pos.x = w.x; pos.z = w.z;
        return true;
    }

    pointBlocked(x, y, z) {
        const c = this.c, l = this._local(x, z);
        if (!this._inside(l.x, l.z)) return false;
        const floor = c.y + this._floorY(l);
        if (y < c.y + 0.4 || y > floor + CART.SIDE + (c.magic && l.z > CART.LEN / 2 - 2.9 ? CART.WID / 2 : 0)) return false;
        if (y <= floor) return true; // (the body under the floor, the wheels)
        // (above the floor only the sides, the front, the tailboard; the hood over the chest)
        if (c.magic && l.z > CART.LEN / 2 - 2.9) return true;
        return Math.abs(l.x) > CART.WID / 2 - 0.2 || Math.abs(l.z) > CART.LEN / 2 - 0.2;
    }

    sphereDepth(p, r, n) {
        const c = this.c, l = this._local(p.x, p.z);
        const floor = c.y + this._floorY(l);
        if (p.y - r > floor + CART.SIDE || p.y + r < c.y + 0.4) return -1;
        const dx = CART.WID / 2 + r - Math.abs(l.x), dz = CART.LEN / 2 + r - Math.abs(l.z);
        if (dx <= 0 || dz <= 0) return -1;
        if (dx < dz) { const w = cartToWorld(0, 0, c.yaw, Math.sign(l.x || 1), 0); n.set(w.x, 0, w.z); return dx; }
        const w = cartToWorld(0, 0, c.yaw, 0, Math.sign(l.z || 1)); n.set(w.x, 0, w.z);
        return dz;
    }
}

// ------------------------------------------------------------------ the system
export class Carriages {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id → cart
        this._netT = 0;
        this._nextId = 1;
        this.log = []; // (tests: what happened)
        // ONE cold blue light for the nearest wizards' carriage at night: made now, before the shaders are compiled
        if (game.scene && typeof THREE.PointLight === 'function') {
            this.light = new THREE.PointLight(0x7fc0ff, 0, 12, 2);
            this.light.castShadow = false;
            game.scene.add(this.light);
        }
    }

    get auth() { return this.game.authority; }

    /**
     * (host) A new cart at (x, z) facing `yaw`: magic — the wizards' carriage (two horses), else
     * the people's cart (one). Returns the cart; Travelers puts the people on it.
     */
    spawn(magic, x, z, yaw, o = {}) {
        const g = this.game;
        const id = o.id ?? ('k' + (g.localId || 'h') + '_' + (this._nextId++));
        if (this.list.has(id)) return this.list.get(id);
        const model = cartModel(magic);
        g.scene.add(model);
        const c = {
            id, magic, model, x, z, y: this._ground(x, z, null), yaw, pitch: 0, roll: 0, spd: 0, roll0: 0,
            hp: CART.HP, burnT: 0, wreck: false, wreckT: 0, horses: [], seats: SEATS.map(() => null),
            stopT: 0, net: null, hitBy: null, hitAt: 0,
        };
        c.collider = new CartCollider(c);
        g.collision?.addMover?.(c.collider);
        this.list.set(id, c);
        // the chest (a real one: «Алохомора» opens it; the reward floats up out of it)
        if (g.chests) {
            const ch = new Chest(g.scene, new THREE.Vector3(x, c.y + CART.FLOOR, z), 'loot', yaw + Math.PI, 'cart:' + id, { scale: 1.6 });
            ch.locked = true;
            ch.cart = { id, magic };
            g.chests.push(ch);
            c.chest = ch;
        }
        // the horses (host: real animals of Animals.js, harnessed)
        if (this.auth && g.animals?._spawn && !o.noHorses) {
            const xs = magic ? [-1.15, 1.15] : [0];
            for (const hx of xs) {
                const p = cartToWorld(x, z, yaw, hx, CART.HORSE_Z);
                const a = g.animals._spawn('horse', new THREE.Vector3(p.x, this._ground(p.x, p.z, null), p.z), { yaw, color: magic ? 0x1d1a1f : undefined });
                if (a.pegasus) a.pegasus = false;
                a.cart = { id, hx };
                c.horses.push(a.id);
            }
        }
        this._place(c, 0);
        return c;
    }

    _ground(x, z, y) {
        const col = this.game.collision;
        if (!col) return 0;
        if (y == null || !col.groundAt) return col.groundY(x, z);
        // (its own floor is not the ground under it)
        const t = this.game.world?.terrain?.data;
        if (t?.floorBelow) return t.floorBelow(Math.round(x), Math.round(z), Math.floor(y + 2.6)) - 0.5;
        return col.groundY(x, z);
    }

    horsesOf(c) { return c.horses.map((id) => this.game.animals?.byId.get(id)).filter(Boolean); }

    /** Can it go (a living horse in the harness, not broken)? */
    canGo(c) {
        if (c.wreck) return false;
        const hs = this.horsesOf(c);
        return hs.length > 0 && hs.every((a) => !a.dead && a.cart?.id === c.id && !a.lev && !(a.stunT > 0));
    }

    /** World position of a seat (feet on the seat: y is the seat's top). */
    seatPos(c, i, out = {}) {
        const s = SEATS[i];
        const w = cartToWorld(c.x, c.z, c.yaw, s.x, s.z);
        out.x = w.x; out.z = w.z;
        out.y = c.y + CART.FLOOR + s.y - s.z * Math.sin(c.pitch) + s.x * Math.sin(c.roll);
        out.yaw = c.yaw + s.yaw;
        return out;
    }

    /** Where a rider gets down (beside its seat, on the ground). */
    exitPos(c, i, out = {}) {
        const s = SEATS[i];
        const side = s.x < 0 ? -1 : 1;
        const w = cartToWorld(c.x, c.z, c.yaw, side * (CART.WID / 2 + 1.1), s.z);
        out.x = w.x; out.z = w.z; out.y = this._ground(w.x, w.z, c.y);
        return out;
    }

    /**
     * (host) Drive one step towards (tx, tz) at speed `want` (0: stop). Returns the distance left.
     * It turns no tighter than CART.TURN_R, goes round what is in the way (wayFree), waits for
     * a body standing in front of the horses.
     */
    drive(c, tx, tz, want, dt, o = {}) {
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (!this.canGo(c)) want = 0;
        c.thinkT = (c.thinkT || 0) - dt;
        if (c.thinkT <= 0 && want > 0) {
            c.thinkT = 0.5;
            c.aim = this._chooseHeading(c, tx, tz, o);
        }
        // somebody in front of the horses: wait
        if (want > 0 && this._blockedAhead(c)) { want = 0; c.waitT = (c.waitT || 0) + dt; } else c.waitT = 0;
        if (c.aim == null) want = 0;
        // speed up / slow down like a horse
        const acc = want > c.spd ? 1.2 : 2.5;
        c.spd += Math.max(-acc * dt, Math.min(acc * dt, want - c.spd));
        if (c.spd < 0.02 && want === 0) c.spd = 0;
        if (c.spd > 0 && c.aim != null) {
            let da = c.aim - c.yaw;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const maxTurn = (c.spd / CART.TURN_R) * dt;
            c.yaw += Math.max(-maxTurn, Math.min(maxTurn, da));
            // (still turning hard: slower)
            const step = c.spd * dt * (Math.abs(da) > 0.6 ? 0.6 : 1);
            const nx = c.x - Math.sin(c.yaw) * step, nz = c.z - Math.cos(c.yaw) * step;
            if (wayFree(this.game, c.x, c.z, -Math.sin(c.yaw), -Math.cos(c.yaw), 2, { half: CART.WID / 2, rise: 1, avoidLand: true, into: o.into })) { c.x = nx; c.z = nz; c.roll0 += step; }
            else { c.spd = 0; c.thinkT = 0; c.stuckT = (c.stuckT || 0) + dt; }
        }
        this._place(c, dt);
        return d;
    }

    /** The way to go: straight at the goal if free, else the nearest free way to it (or null). */
    _chooseHeading(c, tx, tz, o) {
        const direct = Math.atan2(-(tx - c.x), -(tz - c.z));
        const look = Math.min(18, Math.max(6, Math.hypot(tx - c.x, tz - c.z)));
        let best = null, bs = -Infinity;
        for (const off of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8]) {
            const a = direct + off;
            const free = wayFree(this.game, c.x, c.z, -Math.sin(a), -Math.cos(a), look, { half: CART.WID / 2 + 0.3, rise: 1, avoidLand: true, into: o.into });
            let turnCost = a - c.yaw;
            while (turnCost > Math.PI) turnCost -= Math.PI * 2;
            while (turnCost < -Math.PI) turnCost += Math.PI * 2;
            const s = free * 2 - Math.abs(off) * 6 - Math.abs(turnCost) * 2;
            if (free >= Math.min(look, 6) && s > bs) { bs = s; best = a; }
        }
        return best;
    }

    /** A body (a player, a person, an animal that is not its own horse) right in front of the horses. */
    _blockedAhead(c) {
        const g = this.game;
        const f = cartToWorld(c.x, c.z, c.yaw, 0, CART.HORSE_Z - 4.2);
        const near = (x, z, r) => Math.hypot(x - f.x, z - f.z) < 2.6 + r;
        const me = g.character?.group.position;
        if (me && !g.isDeadLocal && near(me.x, me.z, 0.6)) return true;
        for (const r of g.remotes?.values() || []) if (!r.dead && r.position && near(r.position.x, r.position.z, 0.6)) return true;
        for (const v of g.castleLife?.byId.values() || []) if (!v.dead && !v.seated && near(v.x, v.z, 0.5)) return true;
        for (const a of g.animals?.list || []) if (!a.dead && a.cart?.id !== c.id && near(a.group.position.x, a.group.position.z, 1)) return true;
        return false;
    }

    /** Puts the cart on the ground (pitch, roll), its wheels, its horses, its chest. */
    _place(c, dt) {
        const L = CART.LEN, W = CART.WID;
        const h = (lx, lz) => { const w = cartToWorld(c.x, c.z, c.yaw, lx, lz); return this._ground(w.x, w.z, c.y); };
        if (!c.net) {
            const f = h(0, -L / 2 + 1.2), b = h(0, L / 2 - 1.2), l = h(-W / 2, 0), r = h(W / 2, 0);
            const gy = Math.max((f + b) / 2, (l + r) / 2, h(0, 0) - 0.3);
            c.y = dt ? c.y + (gy - c.y) * Math.min(1, dt * 8) : gy;
            const tp = Math.atan2(f - b, L - 2.4), tr = Math.atan2(r - l, W);
            c.pitch += (Math.max(-0.35, Math.min(0.35, tp)) - c.pitch) * Math.min(1, (dt || 1) * 6);
            c.roll += (Math.max(-0.3, Math.min(0.3, tr)) - c.roll) * Math.min(1, (dt || 1) * 6);
        }
        const m = c.model;
        m.position.set(c.x, c.y + (c.wreck ? -0.6 : 0), c.z);
        m.rotation.set(c.wreck ? c.pitch + 0.12 : c.pitch, c.yaw, c.wreck ? c.roll + 0.25 : c.roll);
        for (const w of m.userData.wheels) w.rotation.x = -c.roll0 / CART.WHEEL_R;
        if (c.chest && !c.chestOut) {
            const p = cartToWorld(c.x, c.z, c.yaw, CHEST_AT.x, CHEST_AT.z);
            c.chest.mesh.position.set(p.x, c.y + CART.FLOOR - CHEST_AT.z * Math.sin(c.pitch) + (c.wreck ? -0.6 : 0), p.z);
            c.chest.mesh.rotation.set(0, c.yaw + Math.PI, 0);
        }
        if (this.auth) this._leadHorses(c, dt);
    }

    /** (host) The harnessed horses walk at their places in front of the cart; torn away — they are free. */
    _leadHorses(c, dt) {
        const A = this.game.animals;
        if (!A) return;
        for (const a of this.horsesOf(c)) {
            if (a.cart?.id !== c.id) continue;
            const p = cartToWorld(c.x, c.z, c.yaw, a.cart.hx, CART.HORSE_Z);
            const hp = a.group.position;
            if (a.dead) continue;
            // (lifted by «Левиоса», thrown by a blast too far: the traces tear, the horse is free)
            if (a.lev || Math.hypot(hp.x - p.x, hp.z - p.z) > CART.HARNESS || c.wreck) { this.unharness(c, a); continue; }
            if (a.stunT > 0 || a.vy) continue; // (knocked down: Animals moves it)
            const step = Math.hypot(p.x - hp.x, p.z - hp.z);
            hp.x = p.x; hp.z = p.z;
            hp.y = this._ground(p.x, p.z, hp.y);
            a.group.rotation.y = c.yaw;
            a.walkT += step * 1.6;
            a.spd = dt ? step / dt : 0;
            a.state = 'harness';
            a.pose = 0;
            A._animate?.(a, Math.min(1, a.spd / 6), dt);
        }
    }

    /** The horse out of the harness: a free horse again (it runs off when scared). */
    unharness(c, a) {
        if (!a.cart || a.cart.id !== c.id) return;
        a.cart = null;
        a.state = 'flee'; a.stateT = 6;
        c.horses = c.horses.filter((id) => id !== a.id);
        this.log.push({ ev: 'loose', id: c.id, horse: a.id });
    }

    // ---------------------------------------------------------------- damage
    /** (host) Something hurt the cart: `fire` sets it burning. by: who did it. */
    damage(c, dmg, by = null, o = {}) {
        if (!c || c.wreck) return;
        c.hp -= dmg;
        if (o.fire) c.burnT = Math.max(c.burnT, CART.BURN);
        if (by != null) { c.hitBy = by; c.hitAt = performance.now(); }
        this.game.travelers?.cartHit?.(c, by);
        for (let i = 0; i < 5; i++) this.game.fx?.spark?.(_v.set(c.x, c.y + CART.FLOOR + 0.5, c.z), 0x7a5530, 0.1, _w.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.7);
        if (c.hp <= 0) this.wreck(c, by);
    }

    /** (host) Broken or burnt: it lies there, the chest falls out, the horses run off. */
    wreck(c, by = null) {
        if (c.wreck) return;
        c.wreck = true; c.wreckT = 0; c.spd = 0; c.hp = 0;
        for (const a of this.horsesOf(c)) this.unharness(c, a);
        this._dropChest(c);
        this.log.push({ ev: 'wreck', id: c.id });
        const g = this.game;
        g.castleLife?.alarm?.({ x: c.x, y: c.y, z: c.z }, 'blast', by, 4);
        g.travelers?.cartHit?.(c, by);
    }

    /** The chest out on the ground beside the wreck (a chest of its own now, solid). */
    _dropChest(c) {
        const ch = c.chest;
        if (!ch || c.chestOut) return;
        c.chestOut = true;
        const p = cartToWorld(c.x, c.z, c.yaw, 0, CART.LEN / 2 + 1.4);
        const y = this._ground(p.x, p.z, c.y);
        ch.mesh.position.set(p.x, y, p.z);
        ch.mesh.rotation.set(0, c.yaw + Math.PI, 0);
        ch.mesh.updateMatrixWorld(true);
        if (this.game.collision?.addBox) ch.boxId = this.game.collision.addBox(ch.getCollisionBox());
    }

    /** (host) A blast / lightning at `pos`. */
    hitAt(pos, radius, dmg, by = null, kind = 'blast') {
        for (const c of this.list.values()) {
            const d = Math.hypot(c.x - pos.x, c.z - pos.z) - CART.LEN / 2;
            if (d > radius + 1 || Math.abs(c.y + 1.5 - pos.y) > radius + 4) continue;
            const k = Math.max(0.3, 1 - Math.max(0, d) / (radius + 1));
            this.damage(c, dmg * k, by, { fire: kind === 'lightning' || (kind === 'blast' && Math.random() < 0.4) });
        }
    }

    /** (host) A ray along o + d·[0, len]: the first cart it meets (rays chip it; fire sets it burning). True if hit. */
    hitRay(o, d, len, width, dmg, by = null, fire = false) {
        let hit = false;
        for (const c of this.list.values()) {
            if (c.wreck) continue;
            _v.set(c.x - o.x, c.y + CART.FLOOR + 0.6 - o.y, c.z - o.z);
            const along = _v.dot(d);
            if (along < 0 || along > len) continue;
            const off = _v.addScaledVector(d, -along).length();
            if (off > width + CART.WID / 2 + 0.6) continue;
            this.damage(c, dmg, by, { fire });
            hit = true;
        }
        return hit;
    }

    /** «Инферно» and other flames along a ray: the cart catches fire. */
    burnAlong(o, d, len, by = null) {
        if (!this.auth) return false;
        return this.hitRay(o, d, len, 0.8, 2, by, true);
    }

    /** (host) Water over a place (Firefighting, a water ball…): a burning cart there goes out. @returns how many */
    douse(p, r) {
        let n = 0;
        for (const c of this.list.values()) if (c.burnT > 0 && Math.hypot(p.x - c.x, p.z - c.z) < r + CART.LEN / 2) { c.burnT = 0; n++; }
        return n;
    }

    /** Is (x, z) at a body's feet `y` inside a cart (not up on its floor)? For the castle people's steps. */
    blocksAt(x, z, y) {
        for (const c of this.list.values()) {
            if (Math.abs(x - c.x) > CART.LEN || Math.abs(z - c.z) > CART.LEN) continue;
            const l = worldToCart(c.x, c.z, c.yaw, x, z, _l);
            if (Math.abs(l.x) < CART.WID / 2 + 0.45 && Math.abs(l.z) < CART.LEN / 2 + 0.45 && y < c.y + CART.FLOOR - 0.3) return true;
        }
        return false;
    }

    /** The cart of a horse / of a chest (or null). */
    ofHorse(a) { return a?.cart ? this.list.get(a.cart.id) || null : null; }

    remove(c) {
        const g = this.game;
        g.collision?.removeMover?.(c.collider);
        g.scene.remove(c.model);
        c.model.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); });
        if (c.chest) {
            if (c.chest.boxId != null) g.collision?.removeBox?.(c.chest.boxId);
            c.chest.dispose();
            const k = g.chests?.indexOf(c.chest) ?? -1;
            if (k >= 0) g.chests.splice(k, 1);
        }
        if (this.auth) for (const a of this.horsesOf(c)) if (a.cart?.id === c.id) g.animals._remove(a);
        this.list.delete(c.id);
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        if (this.light) this.light.intensity = 0;
        if (!this.list.size) return;
        let lit = null, litD = Infinity;
        const me = g.character?.group?.position;
        for (const c of [...this.list.values()]) {
            if (this.auth) {
                // fire: it burns its HP away; water puts it out
                if (c.burnT > 0) {
                    c.burnT -= dt;
                    if (this._wet(c)) c.burnT = 0;
                    c.hp -= CART.BURN_DPS * dt;
                    c.fireAlarmT = (c.fireAlarmT || 0) - dt;
                    if (c.fireAlarmT <= 0) { c.fireAlarmT = 3; g.castleLife?.alarm?.({ x: c.x, y: c.y, z: c.z }, 'fire', c.hitBy, 5); }
                    if (c.hp <= 0) this.wreck(c, c.hitBy);
                }
                if (c.wreck) {
                    c.wreckT += dt;
                    if (c.wreckT > CART.WRECK_GONE && !this._seen(c)) { this.remove(c); continue; }
                    this._place(c, dt);
                }
            } else if (c.net) {
                // (guests: where the host says)
                const k = Math.min(1, dt * 8);
                const n = c.net;
                const before = Math.hypot(c.x - n.x, c.z - n.z);
                c.x += (n.x - c.x) * k; c.z += (n.z - c.z) * k; c.y += (n.y - c.y) * k;
                let da = n.yaw - c.yaw;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                c.yaw += da * k; c.pitch += (n.pitch - c.pitch) * k; c.roll += (n.roll - c.roll) * k;
                c.roll0 += before * k;
                this._place(c, dt);
                this._guestHorses(c);
            }
            // the flames on it (every computer)
            if (c.burnT > 0 && Math.random() < dt * 30) {
                const p = cartToWorld(c.x, c.z, c.yaw, (Math.random() - 0.5) * CART.WID, (Math.random() - 0.5) * CART.LEN);
                g.fx?.spark?.(_v.set(p.x, c.y + CART.FLOOR + Math.random() * 1.2, p.z), Math.random() < 0.6 ? 0xff7a1a : 0xffd04a, 0.14, _w.set((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), 0.7);
            }
            // the carriage's lanterns: lit at night
            const ud = c.model.userData;
            if (ud.lightAt && g.isNight && !c.wreck && me) {
                const d = Math.hypot(c.x - me.x, c.z - me.z);
                if (d < litD) { litD = d; lit = ud.lightAt; }
            }
        }
        if (lit && this.light) {
            lit.getWorldPosition(this.light.position);
            this.light.intensity = 1.2;
        }
        this._netSend(dt);
    }

    /** Is water on it (a water ball, a vortex, rain does not count)? */
    _wet(c) {
        const ws = this.game._flameWaters?.() || [];
        for (const s of ws) if (s && s.p && Math.hypot(s.p.x - c.x, s.p.z - c.z) < CART.LEN / 2 + (s.r || 1)) return true;
        return false;
    }

    _seen(c) {
        const g = this.game;
        const me = g.character?.group.position;
        if (me && Math.hypot(me.x - c.x, me.z - c.z) < 160) return true;
        for (const r of g.remotes?.values() || []) if (r.position && Math.hypot(r.position.x - c.x, r.position.z - c.z) < 160) return true;
        return false;
    }

    // ---------------------------------------------------------------- network
    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync?.net) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.2;
        const r = (x) => Math.round(x * 100) / 100;
        const l = [];
        for (const c of this.list.values()) l.push([c.id, c.magic ? 1 : 0, r(c.x), r(c.y), r(c.z), r(c.yaw), r(c.pitch), r(c.roll), Math.round(c.hp), (c.burnT > 0 ? 1 : 0) | (c.wreck ? 2 : 0) | (c.chestOut ? 4 : 0), c.horses]);
        g.sync.net.send({ t: 'cart', l });
    }

    /** (guests) The host's carts. */
    onNet(m) {
        if (this.auth || m.t !== 'cart') return;
        const seen = new Set();
        for (const [id, magic, x, y, z, yaw, pitch, roll, hp, fl, horses] of m.l || []) {
            seen.add(id);
            let c = this.list.get(id);
            if (!c) { c = this.spawn(!!magic, x, z, yaw, { id, noHorses: true }); c.y = y; c.pitch = pitch; c.roll = roll; }
            c.net = { x, y, z, yaw, pitch, roll };
            c.hp = hp; c.burnT = fl & 1 ? 1 : 0;
            if (fl & 2) c.wreck = true;
            if (fl & 4 && !c.chestOut) this._dropChest(c);
            c.horses = horses || [];
        }
        for (const c of [...this.list.values()]) if (!seen.has(c.id)) this.remove(c);
    }

    /** (guests) The horses in the harness: nobody mounts them, they are known to be the cart's. */
    _guestHorses(c) {
        for (const a of this.horsesOf(c)) if (!a.cart) a.cart = { id: c.id, hx: 0 };
    }

    dispose() { for (const c of [...this.list.values()]) this.remove(c); }
}
