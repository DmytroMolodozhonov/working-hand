// «Левиоса Максима»: что берёт луч палочки — дерево важнее земли под ним (слова автора: «поднялась ЗЕМЛЯ под деревом»).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LevitationMaxima } from '../../src/game/LevitationMaxima.js';
import { LivingTrees } from '../../src/game/LivingTrees.js';
import { BLOCK } from '../../src/world/Terrain.js';

/** A flat grass world (ground layer 0, top at y −0.5…) with trunks and crowns; ray hits the first solid block. */
function setup(trees = [], extra = []) {
    const m = new Map();
    const set = (x, L, z, t) => m.set(x + ',' + L + ',' + z, t);
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { set(x, 0, z, BLOCK.GRASS); set(x, -1, z, BLOCK.DIRT); }
    for (const [tx, tz] of trees) {
        for (let L = 1; L <= 6; L++) set(tx, L, tz, BLOCK.WOOD);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let L = 5; L <= 8; L++) if (!(dx === 0 && dz === 0 && L < 7)) set(tx + dx, L, tz + dz, BLOCK.LEAVES);
    }
    for (const [x, L, z, t] of extra) set(x, L, z, t);
    const data = {
        get: (x, L, z) => m.get(x + ',' + L + ',' + z) || BLOCK.AIR,
        raycast(o, d, max) {
            for (let t = 0; t <= max; t += 0.1) {
                const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
                if (data.get(Math.round(x), Math.floor(y + 1.5), Math.round(z)) !== BLOCK.AIR) return { x, y, z };
            }
            return null;
        },
    };
    const builder = {
        data,
        _hitCell(o, d, max = 10) {
            const hit = data.raycast(o, d, max);
            if (!hit) return null;
            const x = Math.round(hit.x + d.x * 0.05), L = Math.floor(hit.y + d.y * 0.05 + 1.5), z = Math.round(hit.z + d.z * 0.05);
            return { x, L, z, type: data.get(x, L, z), point: new THREE.Vector3(hit.x, hit.y, hit.z) };
        },
        _treeOnRay: () => null,
    };
    const game = { builder, world: { terrain: { data } }, remotes: new Map() };
    game.livingTrees = Object.create(LivingTrees.prototype);
    game.livingTrees.game = game;
    const lev = Object.create(LevitationMaxima.prototype);
    lev.game = game;
    lev._bodies = () => [];
    lev.swarm = { pickThing: () => null };
    return lev;
}
const aim = (from, to) => ({ o: new THREE.Vector3(...from), d: new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize() });

test('ствол дерева, луч в ствол → дерево', () => {
    const lev = setup([[10, 0]]);
    const { o, d } = aim([0, 3.5, 0], [10, 3.5, 0]);
    assert.equal(lev.pick(o, d)?.desc?.k, 'tree');
});

test('луч «чуть вниз» — попадает в землю у подножия: берётся ДЕРЕВО, не земля', () => {
    const lev = setup([[10, 0]]);
    for (const toY of [0.2, -0.3, 0.8]) {
        const { o, d } = aim([0, 3.5, 0], [10, toY, 0]);
        assert.equal(lev.pick(o, d)?.desc?.k, 'tree', 'toY ' + toY);
    }
});

test('луч в землю далеко от дерева → земля', () => {
    const lev = setup([[10, 0]]);
    const { o, d } = aim([0, 3.5, 0], [0, 0, 14]);
    assert.equal(lev.pick(o, d)?.desc?.k, 'earth');
});

test('густой лес: берётся то дерево, на которое направлена палочка', () => {
    const lev = setup([[10, 0], [10, 7], [10, -7]]);
    const { o, d } = aim([0, 3.5, 0], [10, 0.5, 0]);
    const r = lev.pick(o, d);
    assert.equal(r?.desc?.k, 'tree');
    assert.ok(Math.abs(r.desc.c[2]) <= 2, 'the middle tree, not a neighbour: ' + r.desc.c);
});

test('постройка (стена) под лучом остаётся стеной, а не деревом за ней', () => {
    const wall = [];
    for (let L = 1; L <= 4; L++) for (let z = -2; z <= 2; z++) wall.push([6, L, z, BLOCK.PLANKS]);
    const lev = setup([[10, 0]], wall);
    const { o, d } = aim([0, 1.5, 0], [10, 1.5, 0]);
    assert.equal(lev.pick(o, d)?.desc?.k, 'wall');
});
