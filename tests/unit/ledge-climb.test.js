// Walking up a one-block step by itself, and climbing out of a small pit with the hands
// (Collision.resolveCylinder/standAt, LedgeClimb.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';
import { LedgeClimb } from '../../src/game/LedgeClimb.js';

/** A voxel terrain: column (ix, iz) → its top layer (top surface y = layer − 0.5); `roof` adds a block high over a column. */
function terrain(top, roof = () => null) {
    const solid = (ix, iz, l) => l <= top(ix, iz) || roof(ix, iz) === l;
    return {
        topLayer: (ix, iz) => roof(ix, iz) ?? top(ix, iz),
        surfaceY: (x, z) => top(Math.round(x), Math.round(z)) - 0.5,
        floorBelow(ix, iz, L) { for (let l = L; l > -10; l--) if (solid(ix, iz, l)) return l; return -10; },
        ceilingAbove(ix, iz, L) { for (let l = L; l < 30; l++) if (solid(ix, iz, l)) return l; return Infinity; },
        solidIn(ix, iz, L0, L1) { for (let l = L0; l <= L1; l++) if (solid(ix, iz, l)) return true; return false; },
    };
}

test('a one-block step is walked onto even while the body still eases up the last one (stairs)', () => {
    const col = new CollisionWorld();
    col.setTerrain(terrain((ix) => (ix <= 0 ? 0 : ix))); // stairs up along +x, a block each
    const pos = new THREE.Vector3(1.6, 0, 0); // the centre on step 1 (top y = 0.5)
    // the feet lag 0.6 behind the floor (the body eases up): the walls' test with the real feet stops
    // at step 2, with the feet on the floor they stand on (Game._feetY) it does not
    const lagging = pos.clone();
    col.resolveCylinder(lagging, 0.48, 0.5 - 0.6, 3.5);
    assert.ok(lagging.x < 1.6, 'the lagging feet: step 2 is a wall (the old trouble)');
    const standing = pos.clone();
    col.resolveCylinder(standing, 0.48, 0.5, 3.5);
    assert.equal(standing.x, 1.6, 'the feet on the floor: step 2 is a step');
    // two blocks up is a wall still
    const wall = new THREE.Vector3(1.6, 0, 0);
    col.setTerrain(terrain((ix) => (ix <= 1 ? 0 : 2)));
    col.resolveCylinder(wall, 0.48, -0.5, 3.5);
    assert.ok(wall.x <= 1.5 - 0.48 + 1e-6, 'a 2-block ledge is not walked through: ' + wall.x);
});

test('a low box (a stone foot, a chest) is a step for a body that stands on boxes; a high one is a wall', () => {
    const col = new CollisionWorld();
    col.addBox({ minX: 1, maxX: 3, minY: -0.5, maxY: 0.3, minZ: -1, maxZ: 1, kind: 'table' });
    col.addBox({ minX: 5, maxX: 7, minY: -0.5, maxY: 1.8, minZ: -1, maxZ: 1, kind: 'table' });
    const a = new THREE.Vector3(1.2, 0, 0);
    col.resolveCylinder(a, 0.48, -0.5, 3.5, 1.05, true);
    assert.equal(a.x, 1.2, 'stepped onto the low box');
    assert.equal(col.standAt(2, 0, -0.5 + 1.1), 0.3, 'and stands on its top');
    const b = new THREE.Vector3(5.2, 0, 0);
    col.resolveCylinder(b, 0.48, -0.5, 3.5, 1.05, true);
    assert.ok(b.x <= 5 - 0.48 + 1e-6, 'the high box is a wall');
    const z = new THREE.Vector3(1.2, 0, 0);
    col.resolveCylinder(z, 0.48, -0.5, 3.5); // (a zombie: boxes are walls, as before)
    assert.ok(z.x <= 1 - 0.48 + 1e-6);
});

/** A small pit: floor top y −0.5 for x ≤ 1, the ground two blocks higher (y 1.5) from x = 2 on. */
function pitGame({ high = 2, roof = false, top = null } = {}) {
    const col = new CollisionWorld();
    col.setTerrain(terrain(top || ((ix) => (ix <= 1 ? 0 : high)), (ix) => (roof && ix >= 2 ? high + 2 : null)));
    const p = new THREE.Vector3(1.0, -0.5 + 2, 0); // standing at the pit's wall (feet −0.5)
    const voice = [];
    const g = {
        collision: col,
        currentPose: {},
        hud: { setVoice: (t) => voice.push(t) },
        character: { group: { position: p }, isCrouching: false, setCrouching() {}, verticalVelocity: 0, swimY: null },
    };
    const L = new LedgeClimb(g);
    const rel = { left: new THREE.Vector3(0.7, 0.05, -0.4), right: new THREE.Vector3(0.7, 0.05, 0.4) }; // the palms at the edge
    const on = { left: true, right: true };
    L.input = (side) => (on[side] ? { G: p.clone().add(rel[side]) } : { G: p.clone().add(new THREE.Vector3(0, -1, side === 'left' ? -0.4 : 0.4)) });
    return { g, L, p, rel, on, voice };
}

test('out of a small pit by the hands: both palms on the edge, pulled down — up and over onto the top', () => {
    const { L, p, rel, voice } = pitGame();
    L.update(1 / 60);
    assert.ok(L.climb && L.climb.holds.left && L.climb.holds.right, 'both palms on the edge');
    assert.ok(voice.some((v) => /обе ладони/.test(v)), 'a hint on the try: ' + voice);
    // the arms pull down towards the body, as far as they go (the hands at the hips)
    let t = 0;
    for (let i = 0; i < 240 && t < 1; i++) {
        rel.left.y = rel.right.y = Math.max(-1.7, 0.05 - i * 0.03);
        L.update(1 / 60);
        if (!L.climb) t = 1;
    }
    assert.ok(!L.climb, 'climbed out');
    assert.ok(Math.abs(p.y - (1.5 + 2)) < 1e-6, 'standing on the top: ' + p.y);
    assert.ok(p.x > 1.5, 'over the edge, on the rock: ' + p.x);
});

test('one hand can not lift the body; a ledge too high or with no room on top is not climbed', () => {
    {
        const { L, p, rel, on } = pitGame();
        on.left = false;
        for (let i = 0; i < 60; i++) { rel.right.y = 0.05 - i * 0.03; L.update(1 / 60); }
        assert.ok(Math.abs(p.y - 1.5) < 1e-6, 'one hand: the body stays down');
    }
    {
        const { L, rel } = pitGame({ high: 5 }); // five blocks up: the arms stretched up (palms ~4.7 over the feet) fall short
        rel.left.y = rel.right.y = 2.7;
        L.update(1 / 60);
        assert.ok(!L.climb, 'too high');
    }
    {
        const { L } = pitGame({ roof: true });
        L.update(1 / 60);
        assert.ok(!L.climb, 'no room to stand on top');
    }
});

/** Palms put on the edge at `y` (over the feet), then pulled down to the hips and lower: climbed out? */
function pullOut(L, rel, y) {
    rel.left.y = rel.right.y = y - 2;
    L.update(1 / 60);
    if (!(L.climb?.holds.left && L.climb?.holds.right)) return false;
    for (let i = 0; i < 400 && L.climb; i++) {
        rel.left.y = rel.right.y = Math.max(-1.7, y - 2 - i * 0.03);
        L.update(1 / 60);
    }
    return !L.climb;
}

test('out of a deeper pit (three, four blocks — as deep as the raised arms reach) the same way', () => {
    for (const high of [3, 4]) {
        const { L, p, rel } = pitGame({ high });
        assert.ok(pullOut(L, rel, high + 0.05), `climbed out of ${high} blocks`);
        assert.ok(Math.abs(p.y - (high - 0.5 + 2)) < 1e-6 && p.x > 1.5, `on the top: ${p.x}, ${p.y}`);
    }
});

test('an uneven, broken edge (a crack): one palm a block higher than the other still holds — up onto it', () => {
    // the edge at x = 2: 2 blocks up where z < 0 (the left palm), 3 blocks up where z ≥ 0 (the right)
    const { L, p, rel } = pitGame({ top: (ix, iz) => (ix <= 1 ? 0 : iz < 0 ? 2 : 3) });
    rel.left.y = 2.05 - 2; rel.right.y = 3.05 - 2;
    L.update(1 / 60);
    assert.ok(L.climb?.holds.left && L.climb?.holds.right, 'both palms hold, each on its own column');
    for (let i = 0; i < 400 && L.climb; i++) {
        rel.left.y = Math.max(-1.7, 0.05 - i * 0.03); rel.right.y = Math.max(-1.7, 1.05 - i * 0.03);
        L.update(1 / 60);
    }
    assert.ok(!L.climb, 'climbed out');
    assert.ok(p.x > 1.5 && p.y >= 1.5 + 2 - 1e-6, `on the broken top: ${p.x}, ${p.y}`);
});

test('afloat in a deep pit of water: the palms on the bank, the same pull — out of the water', () => {
    const { g, L, p, rel } = pitGame({ high: 5 });
    g.character.swimY = p.y; // (the water holds the body: the bank five blocks over the feet — out of reach on foot)
    assert.ok(pullOut(L, rel, 4.7), 'pulled out onto the bank');
    assert.ok(Math.abs(p.y - (4.5 + 2)) < 1e-6, 'standing on it: ' + p.y);
});
