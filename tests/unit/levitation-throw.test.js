import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation, THROW, impactDamage } from '../../src/game/Levitation.js';

/**
 * A body thrown by «Левиоса»: it flies by its own weight (here: moved by the test as its own
 * physics would), and the blow it strikes — the ground, a wall, another creature — knocks it down
 * and hurts it by its speed. Flat ground at y 0.
 */
function world() {
    const applied = [], hits = [];
    const vill = (id, role, x, z) => ({ id, role, x, y: 0, z, isVillager: true, mode: 'idle' });
    const knight = vill('c:1', 'knight', 0, -8);
    const farmer = vill('c:2', 'farmer', 6, -8);
    const g = {
        localId: 'me', authority: true, remotes: new Map(),
        zombies: [], zombieById: new Map(),
        collision: { surfaceY: () => 0, groundY: () => 0 },
        castleLife: { byId: new Map([[knight.id, knight], [farmer.id, farmer]]), hit: (v, d, dir, by) => hits.push({ id: v.id, d, by }) },
        creatureImpact: { apply: (c, o) => { applied.push({ id: c.id, o }); return 'knockdown'; } },
        duel: {
            // (villagers as the duel sees them: feet to head)
            _bodies: () => [knight, farmer].map((v) => ({ kind: 'v', id: v.id, a: new THREE.Vector3(v.x, v.y + 0.7, v.z), b: new THREE.Vector3(v.x, v.y + 3.95, v.z), r: 0.7 })),
        },
        fx: { spark() {} },
    };
    const lev = new Levitation(g);
    // the knight let go up there, flying with (vx, vy) — moved each frame as CastleLife._fallStep would
    const thrown = (v, vel, y0) => {
        v.y = y0;
        v.lev = { by: 'me', vel: vel.clone().divideScalar(1.5), top: y0, target: new THREE.Vector3() };
        lev.carried.set('v:' + v.id, { ck: 'v', c: v });
        lev.letGo('v', v, false);
        for (let i = 0; i < 600 && lev.falls.length; i++) {
            const dt = 1 / 60;
            if (v.vy) {
                v.y += v.vy * dt; v.vy -= 22 * dt;
                v.x += (v.vx || 0) * dt; v.z += (v.vz || 0) * dt;
                if (v.wall != null && v.x > v.wall) { v.x = v.wall; v.vx = 0; }
                if (v.y <= 0 && v.vy < 0) { v.y = 0; v.vy = 0; v.vx = 0; v.vz = 0; }
            }
            lev.update(dt);
        }
    };
    return { g, lev, knight, farmer, applied, hits, thrown };
}

test('the blow\'s speed decides the hurt: a light throw is harmless, a hard one costs hearts', () => {
    assert.equal(impactDamage(5), 0);
    assert.equal(impactDamage(THROW.HURT_V), 0);
    assert.ok(impactDamage(16) >= 5 && impactDamage(25) > impactDamage(16));
});

test('a knight thrown hard from up high: he waves his arms flying, is knocked down rolling and loses hearts', () => {
    const { knight, applied, hits, thrown } = world();
    let flailed = false;
    const real = knight;
    Object.defineProperty(real, 'flyFlail', { set(v) { if (v) flailed = true; this._ff = v; }, get() { return this._ff; }, configurable: true });
    thrown(knight, new THREE.Vector3(0, 6, -6), 8);
    assert.ok(flailed, 'arms and legs going in the air');
    const k = applied.find((a) => a.id === knight.id);
    assert.ok(k?.o.always?.down >= 1.5, 'knocked off his feet');
    assert.ok(k.o.tumble, 'it rolls over');
    assert.ok(hits.find((h) => h.id === knight.id)?.d >= 5, 'hurt by the blow');
});

test('let go just above the ground with no swing: it only lands', () => {
    const { knight, applied, hits, thrown } = world();
    thrown(knight, new THREE.Vector3(0, 0, 0), 0.4);
    assert.equal(applied.length, 0);
    assert.equal(hits.length, 0);
});

test('thrown against a wall: the wall stops it — knocked down and hurt by the speed it struck with', () => {
    const { knight, applied, hits, thrown } = world();
    knight.wall = 3;
    thrown(knight, new THREE.Vector3(20, 3, 0), 2);
    assert.ok(knight.x <= 3);
    assert.ok(applied.find((a) => a.id === knight.id), 'knocked down');
    assert.ok(hits.find((h) => h.id === knight.id)?.d > 0, 'hurt');
});

test('thrown into another person: that one is knocked down too', () => {
    const { knight, farmer, applied, thrown } = world();
    thrown(knight, new THREE.Vector3(18, 2, 0), 1.5);
    assert.ok(applied.find((a) => a.id === farmer.id && a.o.always), 'the farmer knocked off his feet');
    assert.ok(applied.find((a) => a.id === knight.id), 'and the knight himself');
});
