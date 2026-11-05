// The sea's creatures (SeaLife.js, SeaModels.js; animals of Animals.js): sharks, dolphins and the magic glowfin — only in the deep sea
// (never a lake); they keep in the water, never through the bottom; the shark bites only one who hurt it, never one out of the water; a dolphin
// is harmless and curious; the glowfin darts off and, killed, drops its tail (the potion of the mermaid); a dead one floats belly up.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS, SPECIES } from '../../src/game/Animals.js';
import { animalModel } from '../../src/game/AnimalModels.js';
import { SEA_LIFE, seaSiteAt, deepSeaAt, band, isSeaType } from '../../src/game/SeaLife.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { ITEM_INFO, makeItemModel } from '../../src/game/ItemTypes.js';
import { animalMagicKind } from '../../src/game/Mana.js';
import { canTake, kindOf } from '../../src/game/Imperius.js';

/** The sea: x > 0 — 12 layers of water over a floor at layer 0; a lake (x < −100) 12 deep too but no sea; land between. */
const SEA = (x) => x > 0, LAKE = (x) => x < -100;
function terrain() {
    return {
        get(x, y, z) { if (SEA(x) || LAKE(x)) return y <= 0 ? BLOCK.STONE : y <= 12 ? BLOCK.WATER : 0; return y <= 13 ? BLOCK.GRASS : 0; },
        topLayer(x) { return SEA(x) || LAKE(x) ? 0 : 13; },
        floorBelow(x) { return SEA(x) || LAKE(x) ? 0 : 13; },
        landMade: () => true,
        isSeaColumn: (x) => SEA(x),
    };
}
function fakeGame() {
    const scene = new THREE.Scene();
    const items = [];
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'me', scene, seed: 7,
        character: { group: new THREE.Group(), isCrouching: false },
        terrain: { data: terrain() },
        collision: { groundY: () => 0.5, groundAt: () => 0.5, resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false, hp: 100, maxHp: 100 },
        knockback: { add() {} }, bitten: 0, damageLocalPlayer() { g.bitten++; },
        items: { spawnLoose: (it, p) => items.push({ it, p: p.clone() }) }, dropped: items,
        sound: { playSea() {}, playSwan() {} },
    };
    g.character.group.position.set(-50, 15, -500);
    HERDS.GONE = 1e9;
    const A = new Animals(g);
    A.enabled = true;
    A._spawnT = 1e9; A._treeT = 1e9; A._migT = 1e9;
    return { g, A };
}
const step = (A, secs, dt = 1 / 20) => { for (let t = 0; t < secs; t += dt) A.update(dt); };

test('the models: true lengths (shark 6 m, dolphin 4.6, glowfin 3.6), tails that bend, the glowfin lit', () => {
    for (const [type, len] of [['shark', 6], ['dolphin', 4.6], ['glowfin', 3.6]]) {
        const m = animalModel(type);
        m.scale.setScalar(SPECIES[type].size);
        m.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
        assert.ok(s.z > len * 0.95 && s.z < len * (type === 'glowfin' ? 1.7 : 1.45), `${type} length ${s.z.toFixed(2)}`); // (the glowfin's three streamers trail past its tail)
        assert.ok(m.userData.tail && m.userData.tailFin, type + ' tail');
        assert.ok(isSeaType(type));
    }
    let lit = false;
    animalModel('glowfin').traverse((o) => { if (o.material?.emissiveIntensity > 0.2) lit = true; });
    assert.ok(lit, 'the glowfin glows');
    assert.ok(animalModel('shark').userData.jaw, 'a jaw to bite');
});

test('places: only the deep sea, never a lake; some of each kind across the world', () => {
    const t = terrain();
    assert.ok(deepSeaAt(t, 50, 0));
    assert.equal(deepSeaAt(t, -150, 0), null, 'a lake is no sea');
    assert.equal(deepSeaAt(t, -50, 0), null, 'land');
    const kinds = { shark: 0, dolphin: 0, glowfin: 0 };
    for (let gx = -60; gx < 60; gx++) for (let gz = -60; gz < 60; gz++) { const s = seaSiteAt(gx, gz, 7); if (s) kinds[s.type]++; }
    assert.ok(kinds.dolphin > kinds.shark && kinds.shark > kinds.glowfin && kinds.glowfin > 0, JSON.stringify(kinds));
});

test('they keep in the water: never above the surface (but a dolphin\'s leap), never into the bottom', () => {
    const { g, A } = fakeGame();
    const sh = A._spawn('shark', new THREE.Vector3(60, 6, 0), {});
    const d = A._spawn('dolphin', new THREE.Vector3(80, 10, 0), {});
    sh.home = { x: 60, z: 0 }; d.home = { x: 80, z: 0 };
    let leapt = false;
    for (let i = 0; i < 1200; i++) {
        A.update(1 / 20);
        for (const a of [sh, d]) {
            const y = a.group.position.y;
            assert.ok(y > 0.5, `${a.type} into the bottom: ${y}`);
            if (a.leap) leapt = true; else assert.ok(y < 12.6, `${a.type} over the water: ${y}`);
            assert.ok(a.group.position.x > 0, 'stays in the sea');
        }
    }
    assert.ok(leapt, 'a dolphin leaps now and then');
});

test('the shark leaves a swimmer alone — it bites only one who hurt it, never one on the land; a dolphin never bites', () => {
    // (the author 05.11: «акулы нападают только тогда, когда ты на них нападаешь» — it used to hunt any swimmer within 32 m)
    const { g, A } = fakeGame();
    const sh = A._spawn('shark', new THREE.Vector3(30, 6, 0), {});
    sh.home = { x: 30, z: 0 };
    g.character.group.position.set(40, 8, 0); // (in the water)
    step(A, 20);
    assert.equal(g.bitten, 0, 'a swimmer passing by: left alone');
    sh.state = 'attack'; sh.attacker = g.localId ?? 'local'; sh.stateT = 15; // (hurt by me: Animals.hit)
    step(A, 14);
    assert.ok(g.bitten > 0, 'bitten in the water');
    const n = g.bitten;
    g.character.group.position.set(-50, 15, 0); // (on the land)
    step(A, 15);
    assert.equal(g.bitten, n, 'out of the water: safe');
    const { g: g2, A: A2 } = fakeGame();
    const d = A2._spawn('dolphin', new THREE.Vector3(30, 9, 0), {});
    d.home = { x: 30, z: 0 };
    g2.character.group.position.set(36, 10, 0);
    step(A2, 20);
    assert.equal(g2.bitten, 0);
});

test('the glowfin: magic, darts off from a person; killed — its tail drops; a dead fish floats belly up; no «Империус» into them', () => {
    const { g, A } = fakeGame();
    const f = A._spawn('glowfin', new THREE.Vector3(30, 3, 0), {});
    f.home = { x: 30, z: 0 };
    assert.equal(animalMagicKind(f), 'glowfin');
    g.character.group.position.set(34, 4, 0);
    step(A, 1);
    assert.equal(f.state, 'flee');
    A.hit(f, 99, null, 'me');
    assert.ok(f.dead);
    assert.equal(g.dropped[0]?.it.kind, 'glowfinTail');
    assert.ok(ITEM_INFO.glowfinTail && makeItemModel({ kind: 'glowfinTail' }));
    step(A, 12);
    assert.ok(f.group.position.y > 11 && Math.abs(f.group.rotation.z - Math.PI) < 0.3, 'floats up belly up');
    for (const type of ['shark', 'dolphin', 'glowfin']) assert.equal(canTake(kindOf('a', { type }), true).ok, false, type);
    assert.equal(SEA_LIFE.BITE > 0, true);
    const [lo, hi] = band('glowfin', { surface: 12.5, bottom: 0.5, depth: 12 });
    assert.ok(hi - lo <= 5, 'the glowfin keeps near the bottom');
});
