import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';
import { Carriages, CART, wayFree, cartToWorld } from '../../src/game/Carriages.js';
import { Travelers, ROAD, pickKind } from '../../src/game/Travelers.js';
import { BLOCK } from '../../src/world/Terrain.js';

/** Flat dry ground (layer 0) with optional walls: the carts and the people of the roads on it. */
function fakeGame({ walls = [] } = {}) {
    const solid = (ix, iz) => walls.some((w) => ix >= w.x0 && ix <= w.x1 && iz >= w.z0 && iz <= w.z1);
    const data = {
        floorBelow: () => 0, topLayer: (ix, iz) => (solid(ix, iz) ? 6 : 0),
        solidIn: (ix, iz, L0, L1) => solid(ix, iz) && L0 <= 6 && L1 >= 1,
        get: () => BLOCK.AIR, isSeaColumn: () => false,
    };
    const scene = new THREE.Scene();
    const collision = new CollisionWorld();
    let nid = 1;
    const said = [];
    const g = {
        authority: true, localId: 'me', scene, collision, isNight: false, remotes: new Map(), chests: [],
        world: { terrain: { data } }, fx: { spark() {} }, hud: { setVoice() {} },
        character: { group: new THREE.Group() }, isDeadLocal: false,
        animals: {
            list: [], byId: new Map(),
            _spawn(type, pos, o) { const a = { id: nid++, type, group: new THREE.Group(), walkT: 0, hp: 50, dead: false }; a.group.position.copy(pos); this.list.push(a); this.byId.set(a.id, a); return a; },
            _remove(a) { this.list.splice(this.list.indexOf(a), 1); this.byId.delete(a.id); },
            _animate() {}, _look: (o) => o.set(0, 0, -1),
        },
    };
    // the castle people, as little as the roads need
    const L = g.castleLife = {
        enabled: true, byId: new Map(), runtimes: new Map(), states: new Map(), said, scared: [],
        index: { towers: { wanderDef: (gx, gz, type) => ({ id: type + gx + '_' + gz, kind: type === 'wk' ? 'errant' : type === 'wc' ? 'folk' : 'wander', x: 0, z: 0 }) }, near: () => [], landAt: () => null },
        _players: () => [{ id: 'me', p: g.character.group.position }],
        _playerPos: (id) => (id === 'me' ? g.character.group.position : null),
        _runtime(def) { let cs = this.runtimes.get(def.id); if (!cs) this.runtimes.set(def.id, (cs = { def, active: new Map(), hostile: new Map() })); return cs; },
        state(id) { let s = this.states.get(id); if (!s) this.states.set(id, (s = { killed: new Set() })); return s; },
        _activate(cs, idx, at, job) {
            const role = cs.def.kind === 'errant' ? 'knight' : cs.def.kind === 'wander' ? 'wanderer' : 'farmer';
            const v = { id: cs.def.id + ':' + idx, cs, idx, role, wizard: role === 'wanderer', x: at.x, y: at.y, z: at.z, yaw: at.yaw, hp: 10, dead: false, job, walk: 2.3, speed: 0 };
            cs.active.set(idx, v); this.byId.set(v.id, v);
            return v;
        },
        _deactivate(v) { v.cs.active.delete(v.idx); this.byId.delete(v.id); v.removable = true; },
        _steer(v, tx, tz, speed, dt, stopAt = 0) {
            const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
            if (d <= stopAt) { v.speed = 0; return d; }
            const s = Math.min(d - stopAt, speed * dt);
            v.x += dx / d * s; v.z += dz / d * s; v.speed = speed; v.yaw = Math.atan2(-dx, -dz);
            return d;
        },
        _ground(v) { v.y = -0.5; },
        _say(v, t) { said.push(t); },
        _fights: (v) => v.role === 'knight' || v.role === 'wanderer',
        fright: { scare(v, kind, pos, by) { v.fear = { danger: { by } }; L.scared.push(v.id); } },
    };
    g.carriages = new Carriages(g);
    g.travelers = new Travelers(g);
    return { g, L, carts: g.carriages, T: g.travelers };
}
/** The host's frame: the roads, then the people (their own step for the travellers). */
function run(g, secs, each, dt = 1 / 20) {
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
        g.travelers.update(dt);
        g.carriages.update(dt);
        for (const v of [...g.castleLife.byId.values()]) if (!v.dead && !v.foe && !v.fear) g.travelers.step(v, dt);
        if (each && each(i * dt) === false) return;
    }
}

test('what goes on the roads: people\'s carts more often than the wizards\' carriages, both quite often', () => {
    let n = { folkCart: 0, wizCart: 0, wizards: 0, knights: 0 };
    let i = 0;
    const rnd = () => ((i++ * 0.6180339887) % 1);
    for (let k = 0; k < 4000; k++) n[pickKind(false, rnd)]++;
    assert.ok(n.folkCart > n.wizCart && n.wizCart > 400, JSON.stringify(n));
    assert.ok(n.wizards > 600 && n.knights > 600, 'wanderers and knights errant are met too');
    // (the old plan for the wanderers: 0.06 a try — now at least twice as often)
    assert.ok(ROAD.CHANCE >= 0.12);
});

test('a cart drives to its goal on its own wheels: the horses in front at the shafts, it turns no tighter than it can', () => {
    const { g, carts } = fakeGame();
    const c = carts.spawn(true, 0, 0, 0);
    assert.equal(c.horses.length, 2, 'the wizards\' carriage: a pair of horses');
    assert.ok(c.chest && c.chest.locked && g.chests.includes(c.chest), 'a locked chest in it');
    for (let i = 0; i < 200; i++) { carts.drive(c, 0, -200, CART.WALK, 0.05); }
    assert.ok(c.z < -15 && Math.abs(c.x) < 1, `it went ahead (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
    const h = carts.horsesOf(c)[0];
    const at = cartToWorld(c.x, c.z, c.yaw, h.cart.hx, CART.HORSE_Z);
    assert.ok(Math.hypot(h.group.position.x - at.x, h.group.position.z - at.z) < 0.01, 'the horse walks at its place');
    assert.ok(h.walkT > 10, 'its legs go');
});

test('the cart is solid: a body is pushed out of it, can stand on its floor; a rider\'s seat is above the floor', () => {
    const { g, carts } = fakeGame();
    const c = carts.spawn(false, 0, 0, 0);
    const p = new THREE.Vector3(0.5, 0, 0.3);
    g.collision.resolveCylinder(p, 0.6, -0.5, 3.5);
    assert.ok(Math.abs(p.x) >= CART.WID / 2 + 0.59 || Math.abs(p.z) >= CART.LEN / 2 + 0.59, `pushed out (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
    const top = g.collision.groundAt(0, 0, c.y + CART.FLOOR + 0.5);
    assert.ok(Math.abs(top - (c.y + CART.FLOOR)) < 0.05, 'standing on its floor');
    assert.ok(g.collision.pointBlocked(CART.WID / 2 - 0.05, c.y + CART.FLOOR + 0.4, 0), 'its side stops an arrow');
    assert.ok(!g.collision.pointBlocked(0, c.y + CART.FLOOR + 0.4, 0), 'over the floor inside: open');
    const s = carts.seatPos(c, 0, {});
    assert.ok(s.y > c.y + CART.FLOOR, 'the seat is on the bench');
});

test('a cart goes round a wall in its way (and never through it)', () => {
    const { carts, g } = fakeGame({ walls: [{ x0: -6, x1: 6, z0: -32, z1: -30 }] });
    const c = carts.spawn(false, 0, 0, 0);
    let through = false;
    for (let i = 0; i < 1400 && c.z > -60; i++) {
        carts.drive(c, 0, -200, CART.WALK, 0.05);
        if (c.z < -29 && c.z > -33 && Math.abs(c.x) < 7) through = true;
    }
    assert.ok(!through, 'never through the wall');
    assert.ok(c.z < -40, `past it (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
    assert.ok(wayFree(g, 0, 0, 0, -1, 40) < 31, 'the wall is seen ahead');
});

test('a people\'s cart: they sit and ride; attacked — it stops, they jump down and run; calm — back on the cart and on their way', () => {
    const { g, L, T } = fakeGame();
    g.character.group.position.set(40, 0, 0);
    const P = T.spawnNear('folkCart', { at: { x: 0, z: 0 }, dest: { x: 0, z: -400, r: 10, into: null } });
    assert.ok(P && P.cart && P.members.length >= 2);
    assert.ok(P.members.every((v) => v.seated && v.job === 'cart'));
    const z0 = P.cart.z;
    run(g, 5);
    assert.ok(P.cart.z < z0 - 5, 'they ride');
    const s = g.carriages.seatPos(P.cart, 0, {});
    assert.ok(Math.hypot(P.members[0].x - s.x, P.members[0].z - s.z) < 0.01, 'the driver on his seat');
    T.trouble(P, 'me');
    assert.equal(P.state, 'trouble');
    assert.ok(P.members.every((v) => !v.seated), 'they jumped down');
    assert.equal(L.scared.length, P.members.length, 'the people run (not fight)');
    const zStop = P.cart.z;
    run(g, 3);
    assert.ok(Math.abs(P.cart.z - zStop) < 1.5, 'the cart stopped');
    for (const v of P.members) v.fear = null; // (the fear is over)
    run(g, ROAD.CALM + 8);
    assert.equal(P.state, 'go');
    assert.ok(P.members.every((v) => v.seated), 'back on the cart');
    assert.ok(P.cart.z < zStop - 2, 'and on their way');
});

test('the wizards\' carriage: attacked — the wizards get down and fight for the chest; forcing the chest is an attack too', () => {
    const { g, T } = fakeGame();
    g.character.group.position.set(10, 0, 0);
    const P = T.spawnNear('wizCart', { at: { x: 0, z: 0 }, dest: { x: 0, z: -400, r: 10, into: null } });
    assert.ok(P.cart.magic);
    run(g, 1);
    P.cart.chest.picked = true; // («Алохомора» on its lock)
    run(g, 0.5);
    assert.equal(P.state, 'trouble');
    assert.ok(P.members.every((v) => v.foe === 'me'), 'the wizards turn on me');
    assert.ok(P.cs.hostile.get('me') > Date.now());
});

test('knights errant and wandering wizards walk on foot to where they go; far from everybody — gone', () => {
    const { g, L, T } = fakeGame();
    g.character.group.position.set(0, 0, 0);
    const P = T.spawnNear('knights', { at: { x: 0, z: 90 }, dest: { x: 0, z: -300, r: 10, into: null } });
    assert.ok(P && !P.cart && P.members.every((v) => v.role === 'knight' && v.job === 'road'));
    run(g, 20);
    assert.ok(P.members[0].z < 70, `they walk (${P.members[0].z.toFixed(1)})`);
    g.character.group.position.set(0, 0, 2000);
    run(g, 0.5);
    assert.ok(!T.parties.size && !L.byId.size, 'gone out of sight');
});

test('an apple tree (a model with a collision box, not blocks) in the way: the cart drives round it, never through; the walkers see it too', () => {
    const { g, carts } = fakeGame();
    g.collision.addBox({ minX: -0.45, maxX: 0.45, minY: -0.5, maxY: 4, minZ: -25.45, maxZ: -24.55, kind: 'tree', noSupport: true });
    assert.ok(wayFree(g, 0, 0, 0, -1, 40, { half: 0.5 }) < 26, 'the walkers\' look ahead sees the trunk');
    const c = carts.spawn(false, 0, 0, 0);
    let through = false;
    for (let i = 0; i < 1400 && c.z > -50; i++) {
        carts.drive(c, 0, -200, CART.WALK, 0.05);
        // (the trunk inside the cart's box?)
        const dx = 0 - c.x, dz = -25 - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
        if (Math.abs(dx * cs - dz * sn) < CART.WID / 2 && Math.abs(dx * sn + dz * cs) < CART.LEN / 2) through = true;
    }
    assert.ok(!through, 'never through the tree');
    assert.ok(c.z < -35, `past it (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
});

test('the wizards\' carriage: its hood arches up over the chest, the stars lie on the canvas (nothing hangs in the air)', async () => {
    const { cartModel } = await import('../../src/game/Carriages.js');
    const m = cartModel(true);
    m.updateMatrixWorld(true);
    const hood = m.userData.body.children.find((o) => o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.openEnded);
    const box = new THREE.Box3().setFromObject(hood);
    assert.ok(box.min.y >= CART.FLOOR + CART.SIDE - 0.05 && box.max.y > CART.FLOOR + CART.SIDE + CART.WID / 2 - 0.1, `up (${box.min.y.toFixed(2)}…${box.max.y.toFixed(2)})`);
    const top = CART.FLOOR + CART.SIDE + CART.WID / 2 + 0.2;
    m.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); assert.ok(b.max.y <= top + 0.6, `${o.geometry.type} at ${b.max.y.toFixed(2)}`); } });
});
