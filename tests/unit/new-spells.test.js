// «Wind Impulse», «Drawdown», «Liquidation», «Stitching», «Invisibility»: words, costs, and the pure rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { impulsePush } from '../../src/game/WindImpulse.js';
import { bowlDepth, sinkColumn } from '../../src/game/Drawdown.js';
import { blockVerdict, liquidationNeedsMaxima } from '../../src/game/Liquidation.js';
import { findPassage } from '../../src/game/Stitching.js';
import { cluePos } from '../../src/game/Invisibility.js';
import { pointsUp, pointsAtSelf } from '../../src/game/WandAim.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the words: each spell (and its «Максима»), never mixed up with «Вайнд», «Protection Invisible», «Lightning Writing»', () => {
    const want = {
        'вайнд импульс': 'WindImpulse', 'wind impulse maxima': 'WindImpulseMaxima', 'винд импульс максима': 'WindImpulseMaxima',
        'дравдаун': 'Drawdown', 'дродаун максима': 'DrawdownMaxima', 'draw down': 'Drawdown',
        'ликвидейшн': 'Liquidation', 'liquidation maxima': 'LiquidationMaxima', 'стичинг': 'Stitching', 'ститчинг': 'Stitching',
        'инвизибл': 'Invisibility', 'invisibility': 'Invisibility',
        'вайнд': 'Wind', 'вайнд максима': 'WindMaxima', 'протекшн инвизибл': 'ProtectionInvisible', 'лайтнинг райтинг': 'Draw', 'земля проседает': null,
    };
    for (const [w, s] of Object.entries(want)) assert.equal(matchSpell(w), s, w);
});

test('mana and scrolls as the author said', () => {
    assert.deepEqual([SPELL_COST.WindImpulse, SPELL_COST.WindImpulseMaxima, SPELL_COST.Drawdown, SPELL_COST.DrawdownMaxima, SPELL_COST.Liquidation, SPELL_COST.LiquidationMaxima, SPELL_COST.Stitching, SPELL_COST.Invisibility], [10, 40, 5, 20, 10, 25, 7, 20]);
    assert.ok(SCROLL_SPELL_COLOR.WindImpulse && SCROLL_SPELL_COLOR.Invisibility, 'Wind Impulse and Invisibility: only from a scroll');
    assert.ok(!SCROLL_SPELL_COLOR.Stitching && !SCROLL_SPELL_COLOR.Drawdown && !SCROLL_SPELL_COLOR.Liquidation);
});

test('«Wind Impulse»: away from the caster in every direction, 3 m (Maxima 9 m)', () => {
    const o = new THREE.Vector3(0, 1, 0);
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [1.4, -1.4]]) {
        const v = impulsePush('WindImpulse', o, new THREE.Vector3(x, 1, z));
        assert.ok(v && v.x * x + v.z * z > 0 && v.y > 0, `${x},${z}`);
    }
    assert.equal(impulsePush('WindImpulse', o, new THREE.Vector3(4, 1, 0)), null);
    assert.ok(impulsePush('WindImpulseMaxima', o, new THREE.Vector3(8, 1, 0)));
    assert.ok(impulsePush('WindImpulse', o, new THREE.Vector3(1, 1, 0)).length() > impulsePush('WindImpulse', o, new THREE.Vector3(2.5, 1, 0)).length());
});

test('«Drawdown»: a bowl that deepens; the whole column goes down — the house on it too', () => {
    assert.ok(bowlDepth('Drawdown', 0, 3) === 3 && bowlDepth('Drawdown', 0, 1) === 1 && bowlDepth('Drawdown', 4, 3) === 0);
    assert.ok(bowlDepth('DrawdownMaxima', 5, 5) > 0 && bowlDepth('Drawdown', 0, 99) === 6);
    // a column: stone ≤ 0, dirt 1, grass 2, a wall (brick) 3–4 standing on it
    const col = { 0: BLOCK.STONE, 1: BLOCK.DIRT, 2: BLOCK.GRASS, 3: BLOCK.BRICK, 4: BLOCK.BRICK };
    const get = (x, L) => (L in col ? col[L] : L < 0 ? BLOCK.STONE : BLOCK.AIR);
    const s = sinkColumn(get, 0, 0, 4);
    const after = { ...col };
    for (const [, L, , t] of s.edits) after[L] = t;
    assert.deepEqual([after[1], after[2], after[3], after[4]], [BLOCK.GRASS, BLOCK.BRICK, BLOCK.BRICK, BLOCK.AIR]);
    assert.equal(sinkColumn((x, L) => (L === 2 ? BLOCK.GRASS : L === 3 ? BLOCK.WATER : L < 2 ? BLOCK.DIRT : BLOCK.AIR), 0, 0, 2), null, 'a lake\'s bed stays');
});

test('«Liquidation»: dust for the plain, «Максима» for the magic, nothing for the living', () => {
    assert.equal(blockVerdict(BLOCK.BRICK, false), 'dust');
    assert.equal(blockVerdict(BLOCK.ARCANE, false), 'maxima');
    assert.equal(blockVerdict(BLOCK.ARCANE, true), 'dust');
    assert.equal(blockVerdict(BLOCK.WOOD, true), 'alive');
    assert.equal(blockVerdict(BLOCK.BEDROCK, true), 'none');
    assert.ok(!liquidationNeedsMaxima({ kind: 'cheese' }) && !liquidationNeedsMaxima({ kind: 'weapon', magic: false }));
    assert.ok(liquidationNeedsMaxima({ kind: 'wand' }) && liquidationNeedsMaxima({ kind: 'weapon', magic: true }) && liquidationNeedsMaxima({ kind: 'potion' }));
});

test('«Stitching»: a doorway in a wall is sewn with the wall\'s stone; open air is not', () => {
    // a brick wall along z at x = 5 (layers 1…4), a doorway 1×2 at z = 0 (layers 1, 2); the ground ≤ 0
    const get = (x, L, z) => {
        if (L <= 0) return BLOCK.STONE;
        if (x === 5 && L <= 4 && Math.abs(z) <= 6 && !(z === 0 && L <= 2)) return BLOCK.BRICK;
        return BLOCK.AIR;
    };
    const o = new THREE.Vector3(0, 1.2, 0), d = new THREE.Vector3(1, 0, 0);
    const f = findPassage(get, o, d);
    assert.equal(f.block, BLOCK.BRICK);
    assert.deepEqual(f.cells.map((c) => [c.x, c.L, c.z]), [[5, 1, 0], [5, 2, 0]]);
    assert.equal(findPassage(() => BLOCK.AIR, o, d).why, 'open');
});

test('«Invisibility»: the minds see an invisible player only where they did something, for a while; the wand up or at oneself', () => {
    const p = new THREE.Vector3(1, 0, 1), c = { pos: new THREE.Vector3(5, 0, 5), until: 100 };
    assert.equal(cluePos(false, p, null, 0), p);
    assert.equal(cluePos(true, p, null, 0), null);
    assert.equal(cluePos(true, p, c, 50), c.pos);
    assert.equal(cluePos(true, p, c, 150), null);
    assert.ok(pointsUp(new THREE.Vector3(0, 1, 0)) && !pointsUp(new THREE.Vector3(1, 0, 0)));
    assert.ok(pointsAtSelf(new THREE.Vector3(0, 1, -0.5), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
});
