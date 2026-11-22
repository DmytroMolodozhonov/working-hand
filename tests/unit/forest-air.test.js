// The forest's light and air (ForestAir.js): shafts, haze, motes, leaves — only by day in a forest, eased in and out, few instances.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ForestAir } from '../../src/game/ForestAir.js';

function fake(over = {}) {
    const H = () => 10; H.water = 0;
    const world = { _night: 0, storm: 0, _sunTrue: new THREE.Vector3(0.4, 0.7, 0.3).normalize(), forestHaze: 0, terrain: { data: { lush: true, heightAt: H } } };
    return { scene: null, gen: 36, isNight: false, world, nature: { habitat: { forest: true } }, dayPhase: () => 0.3, _inCave: false, camera: null, ...over };
}
const run = (a, sec, pos = { x: 0, y: 11, z: 0 }) => { for (let i = 0; i < sec * 30; i++) a.update(1 / 30, pos); };

test('by day in a forest: haze thickens, shafts / motes / leaves appear, all within their limits and above the ground', () => {
    const g = fake(), a = new ForestAir(g);
    run(a, 8);
    assert.ok(a.k > 0.9, 'eased in: ' + a.k);
    assert.ok(g.world.forestHaze > 0.4 && g.world.forestHaze <= 1, 'the world is hazy: ' + g.world.forestHaze);
    assert.equal(a.shafts.count, 14); assert.equal(a.motes.count, 70);
    assert.ok(a.leafMeshes.reduce((s, m) => s + m.count, 0) >= 20 && a.leafMeshes.every((m) => m.count <= 8));
    for (const q of a.M) assert.ok(Number.isFinite(q.x + q.y + q.z) && Math.hypot(q.x, q.z) < 40);
    for (const l of a.L) assert.ok(l.y > 9 && l.y < 30, 'a leaf in the air above the floor ' + l.y);
    assert.ok(a.shaftMat.opacity > 0.1 && a.shaftMat.opacity < 0.5);
});

test('dawn is mistier than noon; the night, a storm, a cave, an old world and a clearing take it away', () => {
    const noon = fake(), dawn = fake({ dayPhase: () => 0.02 });
    const a = new ForestAir(noon), b = new ForestAir(dawn); run(a, 8); run(b, 8);
    assert.ok(noon.world.forestHaze < dawn.world.forestHaze, 'dawn mistier: ' + noon.world.forestHaze + ' < ' + dawn.world.forestHaze);
    for (const [name, over] of [['storm', { world: { ...fake().world, storm: 1 } }], ['cave', { _inCave: true }], ['old world', { gen: 35 }], ['clearing', { nature: { habitat: { forest: false } } }]]) {
        const g = fake(over), x = new ForestAir(g); run(x, 8);
        assert.ok(x.k < 0.05 && !x.group.visible, name + ' → nothing');
        assert.ok(!(g.world.forestHaze > 0.02), name + ': no haze');
    }
    const n = fake(); n.world._night = 1; const nn = new ForestAir(n); run(nn, 8); assert.ok(nn.k < 0.05, 'night → nothing');
});

test('leaving the forest fades it away gently, not at once', () => {
    const g = fake(), a = new ForestAir(g); run(a, 8);
    g.nature.habitat.forest = false; run(a, 1);
    assert.ok(a.k > 0.2 && a.k < 0.95, 'still fading: ' + a.k);
    run(a, 12); assert.ok(a.k < 0.02 && g.world.forestHaze < 0.02);
});
