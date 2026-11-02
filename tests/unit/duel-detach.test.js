import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, DUEL_SPELLS, wayIsClear } from '../../src/game/Duel.js';
import { DUEL_RANGE } from '../../src/game/DuelRange.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// my shoulder; the arm (+ wand) reaches 2 m forward along −Z (a big hero: a man is ~4 m tall)
const SHOULDER = V(0, 3, 0), TIP = V(0, 3, -2), DIR = V(0, 0, -1);

/** A knight `dist` m before my shoulder (hip 1.95 above his feet), a wall from z0 to z1 (or none). */
function world({ dist = null, wall = null, knightZ = null } = {}) {
    const kz = knightZ ?? (dist !== null ? -dist : null);
    const knights = kz === null ? [] : [{ id: 'k1', isVillager: true, x: 0, y: 0, z: kz, yaw: 0, group: { position: V(0, 1.95, kz) } }];
    const byId = new Map(knights.map((k) => [k.id, k]));
    const anchor = new THREE.Object3D();
    anchor.position.copy(SHOULDER);
    const meGroup = new THREE.Group();
    meGroup.position.set(0, 1.95, 1.2); // (behind the shoulder: my own body is never hit)
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        animals: null, books: null, spiders: null, sync: null, sound: null,
        castleLife: { byId, targets: () => knights, wardOff: () => false },
        terrain: wall ? { data: { isSolidAt: (x, y, z) => z <= wall[0] && z >= wall[1] } } : null,
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {}, flashColor() {} },
        castOrigin: (side, out = new THREE.Vector3()) => out.copy(TIP),
        character: {
            group: meGroup, rightArmAnchor: anchor, leftArmAnchor: anchor,
            isArmRaised: () => true,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.copy(TIP),
            getHandDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.copy(DIR),
        },
        combat: { dead: false, enabled: false, center: (out) => out.copy(meGroup.position), shieldFactor: () => 0 },
        levitation: { liftMe() {} },
        creatureImpact: { spellHit() {} },
    };
    const d = new Duel(g);
    d.drawn = []; d._drawBolt = (spell, from, to) => d.drawn.push({ from: from.clone(), to: to.clone() });
    d._burst = () => {};
    const hits = [];
    d.applyToCreature = (spell, c) => hits.push([spell, c.id]);
    return { g, d, hits };
}


const run = (d, secs = 2, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) d.update(dt); };

const dist = (a, b) => a.distanceTo(b);

test('промах наверняка: через N мс начало луча не зависит от положения палочки, хвост догоняет голову', () => {
    const { d } = world({});
    const b = d.cast('Stupefy', null, 'right', 200);
    run(d, 0.4);
    assert.ok(b.free, 'луч оторван');
    TIP.set(50, 9, 40);
    d.drawn.length = 0;
    run(d, 0.3);
    assert.ok(d.drawn.length > 0);
    for (const s of d.drawn) assert.ok(dist(s.from, TIP) > 30, `начало луча прилипло к палочке: ${s.from.toArray()}`);
    const last = d.drawn[d.drawn.length - 1];
    assert.ok(dist(last.from, last.to) <= 1.0 + 1e-6, `хвост не догнал: ${dist(last.from, last.to)}`);
    assert.ok(Math.abs(last.from.x) < 1e-6 && last.from.z < -2, 'хвост на линии полёта');
    TIP.set(0, 3, -2);
});

test('промах: луч отрывается сразу после выстрела', () => {
    const { d } = world({});
    const b = d.cast('Stupefy', null, 'right', 200);
    run(d, 0.2);
    assert.equal(b.free, true);
});

test('есть цель на линии: луч привязан к палочке, как прежде', () => {
    const { d } = world({ dist: 20 });
    const b = d.cast('Stupefy', null, 'right', 200);
    assert.equal(b.tk, 'v');
    d.drawn.length = 0;
    run(d, 0.3);
    assert.ok(!b.free, 'не оторван');
    for (const s of d.drawn) assert.ok(dist(s.from, TIP) < 1e-6, 'начало луча — на палочке');
});

test('цель стоит рядом с линией (не на ней): луч ещё не отрывается', () => {
    const { d } = world({});
    const k = { id: 'k2', isVillager: true, x: 3, y: 0, z: -15, yaw: 0, group: { position: V(3, 1.95, -15) } };
    d.game.castleLife.targets = () => [k];
    d.game.castleLife.byId = new Map([['k2', k]]);
    const b = d.cast('Stupefy', null, 'right', 200);
    run(d, 0.2);
    assert.ok(!b.free);
});

test('wayIsClear: чисто / занято', () => {
    const body = { a: V(0, 1, -10), b: V(0, 3, -10), r: 0.5 };
    assert.equal(wayIsClear(V(0, 3, 0), V(0, 3, -30), [body]), false);
    assert.equal(wayIsClear(V(0, 3, 0), V(30, 3, 0), [body]), true);
    assert.equal(wayIsClear(V(0, 3, 0), V(0, 3, -30), []), true);
});

test('отрыв — только картинка: попадание в цель то же', () => {
    const { d, hits } = world({ dist: 20 });
    d.cast('Stupefy', null, 'right', 200);
    run(d, 3);
    assert.ok(hits.length >= 1, 'цель поражена');
});