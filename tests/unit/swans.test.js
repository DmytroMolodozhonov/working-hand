// The swans of the lakes (SwanLife.js, SwanModel.js; an animal of Animals.js): the model's sizes, one in three magic, where they live
// (still fresh water, not the sea, not a puddle), they float and keep to the water, a person near — they fly off over to the water
// (or hiss and bite), killed — their wings fall off (the magic pair only off a magic swan), the carcass floats.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS, SPECIES } from '../../src/game/Animals.js';
import { animalModel, animateWings } from '../../src/game/AnimalModels.js';
import { SWAN, swanSiteAt, swanMagic, lakeAt, floatY } from '../../src/game/SwanLife.js';
import { WATERLINE } from '../../src/game/SwanModel.js';
import { waterAt } from '../../src/game/CreatureSwim.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { siteAt } from '../../src/game/HerdSites.js';
import { ITEM_INFO, makeItemModel } from '../../src/game/ItemTypes.js';
import { animalMagicKind } from '../../src/game/Mana.js';
import { IMPERIUS_TARGETS, kindOf } from '../../src/game/Imperius.js';

/** Two round lakes (3 layers of water over a floor at layer 0) on land 3 layers high; a sea strip far east. */
const LAKES = [{ x: 0, z: 0, r: 20 }, { x: 90, z: 0, r: 20 }];
const inLake = (x, z) => LAKES.some((L) => Math.hypot(x - L.x, z - L.z) < L.r);
function terrain() {
    return {
        get(x, y, z) {
            if (inLake(x, z) || x > 300) return y <= 0 ? BLOCK.STONE : y <= 3 ? BLOCK.WATER : 0;
            return y <= 3 ? BLOCK.GRASS : 0;
        },
        topLayer(x, z) { return inLake(x, z) || x > 300 ? 0 : 3; },
        floorBelow(x, z) { return inLake(x, z) || x > 300 ? 0 : 3; },
        landMade: () => true,
        isSeaColumn: (x) => x > 300,
    };
}
function fakeGame() {
    const scene = new THREE.Scene();
    const t = terrain();
    const items = [];
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'me', scene, seed: 7,
        character: { group: new THREE.Group(), isCrouching: false },
        terrain: { data: t },
        collision: { groundY: (x, z) => (inLake(x, z) ? -0.5 : 2.5), groundAt: (x, z) => (inLake(x, z) ? -0.5 : 2.5), resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false },
        knockback: { add() {} }, bitten: 0, damageLocalPlayer() { g.bitten++; },
        items: { spawnLoose: (it, p) => items.push({ it, p: p.clone() }) }, dropped: items,
        sound: { playSwan() {} },
    };
    g.character.group.position.set(-200, 4, -200);
    HERDS.GONE = 1e9;
    const A = new Animals(g);
    A.enabled = true;
    A._spawnT = 1e9; A._treeT = 1e9; A._migT = 1e9;
    return { g, A, t };
}
function seeded(seed, fn) {
    const rnd = Math.random;
    let x = seed >>> 0;
    Math.random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    try { return fn(); } finally { Math.random = rnd; }
}
const run = (A, secs, each, dt = 1 / 30) => { for (let i = 0, n = Math.round(secs / dt); i < n; i++) { A.update(dt); if (each && each(i * dt) === false) return; } };

test('the model: a mute swan by the world\'s measures — ~1.9 m body, the head ~1.4 m over the water, a ~4 m span; the magic one glows', () => {
    for (const c of [1, 2]) {
        const m = animalModel('swan', c);
        m.scale.setScalar(SPECIES.swan.size);
        m.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
        assert.ok(s.z > 2.3 && s.z < 3.1, `bill to tail ${s.z.toFixed(2)} m`);
        const overWater = b.max.y - WATERLINE * SPECIES.swan.size;
        assert.ok(overWater > 1.1 && overWater < 1.7, `the head over the water ${overWater.toFixed(2)} m (the hero 3.5 m)`);
        animateWings(m, 1, 0);
        m.updateMatrixWorld(true);
        // (the morph-spread wing: measured by its tip — the shared shape's box is the folded one)
        const w = m.userData.wings[0];
        assert.equal(m.userData.wings.length, 2);
        assert.ok(w.userData.mesh.morphTargetInfluences[0] === 1, 'the wings spread');
        assert.equal(!!m.userData.magicSwan, c === 2);
        assert.ok(m.userData.legs.length === 2 && m.userData.neck && m.userData.head && m.userData.tail);
    }
    const plain = animalModel('swan', 1), magic = animalModel('swan', 2);
    assert.ok(magic.userData.body.material.emissive.getHex() !== 0 && plain.userData.body.material.emissive.getHex() === 0, 'the magic swan has a faint light of its own');
});

test('one in three is magic (the author: half as many as the plain ones); places of their own roll, mostly pairs', () => {
    let m = 0;
    for (let id = 1; id <= 3000; id++) if (swanMagic(id, 7)) m++;
    assert.ok(m / 3000 > 0.28 && m / 3000 < 0.39, `magic ${m}`);
    let n = 0, pairs = 0, herds = 0;
    for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) {
        const s = swanSiteAt(gx, gz, 7);
        if (siteAt(gx, gz, 7)) herds++;
        if (!s) continue;
        n++;
        if (s.n === 2) pairs++;
        assert.ok(s.n >= SWAN.MIN && s.n <= SWAN.MAX && s.key[0] === 's' && s.swans);
    }
    assert.ok(n / 3600 > 0.45 && n / 3600 < 0.65, `swan places tried ${n}`);
    assert.ok(pairs / n > 0.4, 'mostly pairs');
    assert.ok(herds > 0, 'the other herds are still there (their own roll)');
});

test('where they live: still fresh water deep enough with open water round — not the land, not the bank, not the sea', () => {
    const t = terrain();
    assert.ok(lakeAt(t, 0, 0), 'the middle of a lake');
    assert.equal(lakeAt(t, 50, 0), null, 'the land');
    assert.equal(lakeAt(t, 18, 0), null, 'too near the bank');
    assert.equal(lakeAt(t, 320, 0), null, 'the sea');
    assert.equal(floatY(2.5), 2.5 + 0.5 - WATERLINE * SWAN.SIZE);
});

test('a flock floats and keeps to the water; someone comes near — they run along the water and fly off, landing on water', () => seeded(5, () => {
    const { g, A, t } = fakeGame();
    const site = { gx: 0, gz: 0, n: 2, swans: true, x: 0, z: 0, key: 's0,0' };
    const flock = A.swans.spawnFlock(site);
    assert.equal(flock.length, 2);
    for (const s of flock) assert.ok(Math.abs(s.group.position.y - floatY(2.5)) < 0.05, 'afloat at the waterline');
    // calm for a while: never on the land, always afloat
    run(A, 30, () => {
        for (const s of flock) {
            const p = s.group.position;
            assert.ok(inLake(p.x, p.z), `on the water (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
            assert.ok(Math.abs(p.y - floatY(2.5)) < 0.1, 'afloat');
        }
    });
    assert.ok(flock.some((s) => Math.hypot(s.group.position.x, s.group.position.z) > 0.5), 'they glide about');
    // somebody walks up to them (and nobody of them is the angry one)
    SWAN.AGGRO = 0;
    const p0 = flock[0].group.position;
    g.character.group.position.set(p0.x + 5, 4, p0.z);
    let flew = false;
    const landed = new Set();
    run(A, 40, () => {
        for (const s of flock) {
            if (s.fly) flew = true;
            if (flew && !s.fly && s.onWater) landed.add(s.id);
        }
        if (flew) g.character.group.position.set(-200, 4, -200);
        if (landed.size === flock.length) return false;
    });
    SWAN.AGGRO = 0.3;
    assert.ok(flew, 'they flew off');
    for (const s of flock) {
        const p = s.group.position;
        assert.ok(inLake(p.x, p.z), `landed on the water (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
        assert.ok(waterAt(t, p.x, p.z, p.y), 'afloat again');
    }
}));

test('the angry one hisses, raises its wings and bites (turned to the one it bites)', () => seeded(9, () => {
    const { g, A } = fakeGame();
    const s = A._spawnSwan(10, floatY(2.5), 0, {});
    SWAN.AGGRO = 1;
    g.character.group.position.set(14, 4, 0); // (on the water's edge? no: in the lake, wading — near enough)
    let raised = false;
    run(A, 12, () => { if ((s.flyCode & 7) === 5) raised = true; });
    SWAN.AGGRO = 0.3;
    assert.equal(s.state === 'attack' || g.bitten > 0, true);
    assert.ok(raised, 'the wings raised in threat');
    assert.ok(g.bitten > 0, 'it bit');
}));

test('killed: its wings fall off — the magic pair only off a magic swan; the carcass floats; mana for the magic one; «Империус»', () => {
    const { g, A } = fakeGame();
    const plain = A._spawn('swan', new THREE.Vector3(0, floatY(2.5), 0), { color: 1 });
    const magic = A._spawn('swan', new THREE.Vector3(6, floatY(2.5), 0), { color: 2 });
    assert.equal(animalMagicKind(plain), null);
    assert.equal(animalMagicKind(magic), 'magicSwan');
    assert.equal(kindOf('a', plain), 'swan');
    assert.equal(kindOf('a', magic), 'magicSwan');
    assert.ok(IMPERIUS_TARGETS.swan.plain && IMPERIUS_TARGETS.magicSwan.magic);
    A.hit(plain, 99, null, 'me');
    A.hit(magic, 99, null, 'me');
    assert.deepEqual(g.dropped.map((d) => d.it.kind).sort(), ['magicSwanWings', 'swanWings']);
    for (const k of ['swanWings', 'magicSwanWings']) { assert.ok(ITEM_INFO[k]?.name); assert.ok(makeItemModel({ kind: k })); }
    run(A, 3);
    for (const s of [plain, magic]) assert.ok(Math.abs(s.group.position.y - 2.5) < 0.6, `the carcass floats (${s.group.position.y.toFixed(2)})`);
});
