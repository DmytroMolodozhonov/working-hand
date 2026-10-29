// The Baksadi (the huge violet magic tree with pears) and the wild magic plants (MagicFlora.js): how often, how big, what they give, what acts on them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { appleTreeAt, APPLE_TREES } from '../../src/game/Animals.js';
import { WORLD_GEN, BAKSADI_FROM_GEN } from '../../src/world/Terrain.js';
import { ITEM_INFO, foodHeal, makeItemModel } from '../../src/game/ItemTypes.js';
import { buildTree, TREE_SIZES } from '../../src/world/TreeBuild.js';
import { baksadiTreeModel, pearGeometry } from '../../src/game/AppleTrees.js';
import { FLORA_KINDS, FLORA_ORDER, FLORA_ITEMS, FLORA_OF_ITEM, FLORA_TARGETS, floraGroupIn, floraHarm, FLORA } from '../../src/game/MagicFlora.js';
import { floraBody, floraPick, FLORA_VARIANTS } from '../../src/fx/FloraModels.js';

const count = (gen) => {
    const n = { golden: 0, red: 0, baksadi: 0, none: 0 };
    for (let s = 1; s <= 3; s++) for (let gx = -60; gx < 60; gx++) for (let gz = -30; gz < 30; gz++) n[appleTreeAt(gx, gz, s, gen) || 'none']++;
    return n;
};

test('Baksadi: 30% commoner than the golden apple tree in new worlds (0.195 against 0.15), none in old ones, nothing else moves', () => {
    assert.ok(WORLD_GEN >= BAKSADI_FROM_GEN);
    assert.ok(Math.abs(APPLE_TREES.BAKSADI / APPLE_TREES.GOLDEN - 1.3) < 1e-9);
    const n = count(BAKSADI_FROM_GEN), all = n.golden + n.red + n.baksadi + n.none;
    assert.ok(Math.abs(n.baksadi / n.golden - 1.3) < 0.07, `baksadi/golden ${n.baksadi / n.golden}`);
    assert.ok(Math.abs(n.baksadi / all - APPLE_TREES.BAKSADI) < 0.012);
    const old = count(BAKSADI_FROM_GEN - 1);
    assert.equal(old.baksadi, 0, 'an old world has none');
    // (the same golden / red cells in both: an old world is not changed by a single tree)
    assert.equal(old.golden, n.golden);
    assert.equal(old.red, n.red);
    assert.equal(old.none, n.none + n.baksadi, 'the Baksadi grows only where nothing grew');
    assert.equal(appleTreeAt(7, -3, 42, 11), appleTreeAt(7, -3, 42, 11), 'the same on every computer');
    assert.equal(appleTreeAt(7, -3, 42), appleTreeAt(7, -3, 42, 10), 'a call without the generation is an old world');
});

test('Baksadi: a huge tree — crown 13–20 m wide, 15–22 m tall, a thick trunk, pears within a raised hand\'s reach, gaps in the crown', () => {
    assert.equal(TREE_SIZES[7].name, 'Баксади');
    let good = 0;
    for (let v = 0; v < 12; v++) {
        const t = buildTree(7, v), i = t.info;
        assert.ok(i.H > 14 && i.H < 23, `height ${i.H}`);
        assert.ok(i.W > 13 && i.W < 29, `width ${i.W}`);
        assert.ok(i.trunk.r > 0.4, `trunk ${i.trunk.r}`);
        for (const [, y] of i.apples) assert.ok(y >= 2.9 && y <= 4.9, `pear at ${y}`);
        if (i.apples.length >= 12) good++;
        assert.ok(t.leaf.count > 3000, 'a crown of leaf cards');
        assert.ok(t.leaf.count / 4 < 2300, 'but not a solid wall: the sky shows through');
    }
    assert.ok(good >= 4, 'some shapes with enough pears all round');
    const m = baksadiTreeModel(0.3);
    assert.ok(m.userData.apples.length >= 12 && m.userData.baksadi);
    assert.ok(new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).x > 12);
    // (pears are big enough to see and to grab: about half a metre)
    pearGeometry().computeBoundingBox();
    const bb = pearGeometry().boundingBox;
    assert.ok(bb.max.y - bb.min.y > 0.45 && bb.max.x - bb.min.x < 0.6);
});

test('the Baksadi pear heals more than a golden apple, is eaten like food, is a stable ingredient id', () => {
    assert.equal(foodHeal({ kind: 'baksadi_pear' }), 12);
    assert.ok(foodHeal({ kind: 'baksadi_pear' }) >= foodHeal({ kind: 'apple' }));
    assert.equal(ITEM_INFO.baksadi_pear.name, 'Груша Баксади');
    assert.ok(ITEM_INFO.baksadi_pear.heal > 0, 'edible (Items._eat takes any item with heal)');
    assert.ok(makeItemModel({ kind: 'baksadi_pear' }).children.length);
});

test('wild plants: every kind has a shape of the right size, finite and with its picked part; items have stable ids', () => {
    const H = { glowcap: [1.2, 2.2], giantfern: [3.4, 5.2], azureberry: [1.3, 2.2], sunherb: [0.8, 1.6], frostcrystal: [3, 5.2] };
    for (const kind of FLORA_ORDER) {
        const K = FLORA_KINDS[kind];
        for (let v = 0; v < FLORA_VARIANTS; v++) {
            const g = floraBody(kind, v);
            assert.ok(g.attributes.position.array.every(Number.isFinite), `${kind} ${v} finite`);
            g.computeBoundingBox();
            const h = g.boundingBox.max.y;
            assert.ok(h >= H[kind][0] && h <= H[kind][1], `${kind} ${v} height ${h}`);
            assert.ok(g.userData.picks.length >= 3, `${kind} has parts to pick`);
            assert.ok(g.attributes.position.count < 4500, `${kind} is cheap: ${g.attributes.position.count} vertices`);
        }
        assert.ok(floraPick(kind).attributes.position.count > 20);
        assert.ok(ITEM_INFO[K.item], `${kind} gives ${K.item}`);
        assert.equal(FLORA_OF_ITEM[K.item], kind);
        assert.ok(makeItemModel({ kind: K.item }).children.length);
    }
    assert.deepEqual(Object.keys(FLORA_ITEMS).sort(), ['azure_berry', 'frost_shard', 'fern_frond', 'glowcap_mushroom', 'sun_herb'].sort());
    assert.ok(foodHeal({ kind: 'azure_berry' }) > 0 && !ITEM_INFO.glowcap_mushroom.heal);
});

test('wild plants: placed by the land, deterministic, the same on every computer; groups of the right size', () => {
    const land = (b) => () => b;
    let n = 0, a = [];
    for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) {
        const g1 = floraGroupIn('glowcap', gx, gz, 7, land('forest')), g2 = floraGroupIn('glowcap', gx, gz, 7, land('forest'));
        assert.deepEqual(g1, g2);
        assert.equal(floraGroupIn('glowcap', gx, gz, 7, land('steppe')), null, 'a glowcap grows only in dark woods');
        assert.equal(floraGroupIn('frostcrystal', gx, gz, 7, land('jungle')), null);
        if (g1) { n++; a.push(g1.members.length); for (const m of g1.members) assert.match(m.id, /^glowcap:/); }
    }
    assert.ok(Math.abs(n / 3600 - FLORA_KINDS.glowcap.biomes.forest) < 0.05, `forest chance ${n / 3600}`);
    assert.ok(Math.min(...a) >= 1 && Math.max(...a) <= FLORA_KINDS.glowcap.group.max);
    // (members keep their distance)
    const g = floraGroupIn('sunherb', 0, 0, 3, land('meadow')) || floraGroupIn('sunherb', 1, 0, 3, land('meadow')) || floraGroupIn('sunherb', 2, 2, 3, land('meadow'));
    if (g) for (const p of g.members) for (const q of g.members) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= FLORA_KINDS.sunherb.group.gap - 1.5);
    assert.ok(FLORA.LOAD >= 100 && FLORA.MAX_PER_KIND <= 120, 'a limited number is drawn');
});

test('wild plants: fire burns them (the crystal tree melts), blasts and the gods\' spells destroy, cold, Alive, Overgrown, Avada do nothing — and every creature kind has a row', () => {
    for (const kind of FLORA_ORDER) {
        assert.equal(floraHarm(kind, 'Bombardo'), 'destroy');
        assert.equal(floraHarm(kind, 'BombardoMaxima'), 'destroy');
        assert.equal(floraHarm(kind, 'TotalDestruction'), 'destroy');
        assert.equal(floraHarm(kind, 'Inspirius'), 'destroy');
        for (const cold of ['Ice', 'Frozen', 'Snowman', 'cold']) assert.equal(floraHarm(kind, cold), 'none', `${kind} ${cold}`);
        for (const none of ['Alive', 'Overgrown', 'AvadaKedavra', 'Wind', 'Stupefy']) assert.equal(floraHarm(kind, none), 'none');
    }
    for (const kind of ['glowcap', 'giantfern', 'azureberry', 'sunherb']) { assert.equal(floraHarm(kind, 'Inferno'), 'burn'); assert.equal(floraHarm(kind, 'Lightning'), 'burn'); }
    assert.equal(floraHarm('frostcrystal', 'Inferno'), 'melt');
    assert.equal(floraHarm('frostcrystal', 'Lightning'), 'destroy');
    for (const who of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragons', 'phoenixes', 'owls', 'iceCastle', 'gargoyle', 'items']) {
        assert.ok(FLORA_TARGETS[who]?.why, `a decision for ${who}`);
    }
});

test('wild plants: the game places, picks and burns them (hooks in Game.js and the network); worlds before BAKSADI_FROM_GEN have none', () => {
    const g = fs.readFileSync('src/game/Game.js', 'utf8');
    for (const re of [/this\.flora = new MagicFloraLife/, /flora\?\.update\(dt\)/, /flora\?\.hitAt\(pos, radius/, /flora\?\.hitAt\(point, 3/, /flora\?\.hitRay\(o, d, len, width, 5, name\)/, /flora\?\.hitRay\(o, d, len, 0\.6, 4, 'Inferno'\)/, /flora\?\.gatherAt/, /flora\?\.dispose/, /flora\?\.sample/]) assert.match(g, re);
    const n = fs.readFileSync('src/net/NetSync.js', 'utf8');
    for (const t of ['flpick', 'flgone', 'flkill']) assert.ok(n.includes(`'${t}'`), t);
    const life = fs.readFileSync('src/game/MagicFloraLife.js', 'utf8');
    assert.match(life, /BAKSADI_FROM_GEN/);
    assert.match(life, /landMade/, 'the land is never made in the frame');
    assert.match(life, /BUDGET_MS/, 'placed within a time budget');
});
