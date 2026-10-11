import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animalModel, animateLegs, HORSE_COLORS } from '../../src/game/AnimalModels.js';

const boxOf = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };
const meshes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const isInside = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };

// the old box models (before the anatomical ones): min / max of their bounding boxes
const OLD = {
    horse: { min: [-0.4, 0, -1.6], max: [0.4, 2.85, 1.1] },
    pig: { min: [-0.375, 0, -1.01], max: [0.375, 1.1, 0.55] },
    cow: { min: [-0.46, 0, -1.28], max: [0.45, 1.825, 0.75] },
    sheep: { min: [-0.475, 0, -0.98], max: [0.475, 1.4, 0.575] },
};

for (const type of ['horse', 'pig', 'cow', 'sheep']) {
    test(`${type}: named parts — body, neck holding the head, tail, 4 two-segment legs`, () => {
        const g = animalModel(type, HORSE_COLORS[1]);
        const u = g.userData;
        assert.ok(u.body?.isMesh && u.body.name === 'body');
        for (const k of ['neck', 'head', 'tail']) {
            assert.ok(u[k]?.isGroup, k);
            assert.equal(u[k].name, k);
            assert.ok(meshes(u[k]).length > 0, `${k} has shapes`);
            assert.ok(isInside(u[k], g));
        }
        assert.ok(isInside(u.head, u.neck), 'the head hangs on the neck (cut the neck — the head goes with it)');
        assert.equal(u.legs.length, 4);
        assert.deepEqual(u.legs.map((l) => l.userData.front), [true, true, false, false]);
        for (const l of u.legs) {
            assert.ok(l.userData.upper.isMesh && l.userData.upper.parent === l);
            assert.ok(l.userData.lower.isGroup && l.userData.lower.parent === l, 'knee pivot inside the leg');
            assert.ok(meshes(l.userData.lower).length >= 2, 'lower leg + hoof');
            assert.ok(/Leg$/.test(l.name));
        }
        // right legs on +x, left on −x; front legs ahead (−z)
        assert.ok(u.legs[0].position.x > 0 && u.legs[1].position.x < 0);
        assert.ok(u.legs[0].position.z < u.legs[2].position.z);
        assert.ok(meshes(g).length <= 26, `${meshes(g).length} meshes`);
    });

    test(`${type}: stands on its feet and keeps the old size`, () => {
        const g = animalModel(type);
        if (g.userData.saddle) g.userData.saddle.visible = false;
        const b = boxOf(g);
        assert.ok(Math.abs(b.min.y) < 0.02, `feet at ${b.min.y}`);
        const o = OLD[type];
        const oldS = [o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]];
        const s = b.getSize(new THREE.Vector3()).toArray();
        const tol = [0.3, 0.15, 0.3];
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(s[i] / oldS[i] - 1) <= tol[i], `${'xyz'[i]}: ${s[i].toFixed(2)} vs old ${oldS[i]}`);
        assert.ok(Math.abs(b.min.x + b.max.x) < 0.02, 'symmetric');
        // the head is in front, the tail behind
        const head = boxOf(g.userData.head).getCenter(new THREE.Vector3());
        const tail = boxOf(g.userData.tail).getCenter(new THREE.Vector3());
        assert.ok(head.z < -0.6 && tail.z > 0.4, `head ${head.z} tail ${tail.z}`);
    });

    test(`${type}: walking swings the legs and bends the knees; standing still is straight`, () => {
        const g = animalModel(type);
        const legs = g.userData.legs;
        animateLegs(g, 0, 0);
        for (const l of legs) { assert.ok(l.rotation.x === 0 && l.userData.lower.rotation.x === 0); }
        let maxBend = 0;
        for (let t = 0; t < Math.PI * 2; t += 0.2) {
            animateLegs(g, t, 1);
            assert.ok(Math.abs(legs[0].rotation.x + legs[1].rotation.x) < 1e-9, 'diagonal pairs');
            for (const l of legs) {
                const b = l.userData.lower.rotation.x;
                assert.ok(Number.isFinite(b));
                // a front knee takes the hoof back, a hind hock folds it forward — never the wrong way
                if (l.userData.front) assert.ok(b <= 0); else assert.ok(b >= 0);
                maxBend = Math.max(maxBend, Math.abs(b));
            }
            // a hoof never goes into the ground by more than a little
            assert.ok(boxOf(g).min.y > -0.05, `t=${t.toFixed(1)}: ${boxOf(g).min.y}`);
        }
        assert.ok(maxBend > 0.5, `knees bend ${maxBend}`);
    });

    test(`${type}: a new herd reuses the shapes`, () => {
        const a = meshes(animalModel(type)).map((m) => m.geometry);
        const b = meshes(animalModel(type)).map((m) => m.geometry);
        assert.deepEqual(a, b);
    });
}

test('horse: the saddle is at the rider seat height, hidden until ridden; colours', () => {
    const g = animalModel('horse', 0xe8e2d6);
    const s = g.userData.saddle;
    assert.equal(s.visible, false);
    s.visible = true;
    const sb = boxOf(s);
    // Animals._ride puts the rider at 1.95 (× size) above the horse's feet
    assert.ok(sb.max.y > 1.9 && sb.max.y < 2.1, `saddle top ${sb.max.y}`);
    assert.equal(g.userData.body.material.color.getHex(), 0xe8e2d6);
    const other = animalModel('horse', 0x2b2118);
    assert.equal(other.userData.body.material.color.getHex(), 0x2b2118);
    assert.equal(other.userData.body.geometry, g.userData.body.geometry, 'colour is the material, the shape is shared');
    // a long head hanging forward of the chest, ears above it
    const head = boxOf(g.userData.head);
    assert.ok(head.max.y > 2.5 && head.min.z < -1.4, `head ${head.min.z} ${head.max.y}`);
    // long legs: the belly is above the knees
    const belly = boxOf(g.userData.body).min.y;
    const knee = g.userData.legs[0].userData.lower.getWorldPosition(new THREE.Vector3()).y;
    assert.ok(belly > knee + 0.3, `belly ${belly} knee ${knee}`);
});

test('every shape with vertex colours really has them (no black parts)', () => {
    for (const type of ['horse', 'pig', 'cow', 'sheep']) {
        const g = animalModel(type);
        if (g.userData.saddle) g.userData.saddle.visible = true;
        for (const m of meshes(g)) if (m.material.vertexColors) assert.ok(m.geometry.getAttribute('color'), `${type}: ${m.parent.name}`);
    }
});
