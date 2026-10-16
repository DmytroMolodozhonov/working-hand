// «Бум» («Boom», Boom.js + BoomCarve.js): a mountain torn apart from inside — its words (never from talk), its
// price and scroll, its crater dug a piece at a time (the same however it is cut into frames), its table of
// who and what, the network and the save.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchSpell, boomWords } from '../../src/fx/SpellManager.js';
import { spellPhrase } from '../../src/audio/SpellPhrase.js';
import { BOOM, BOOM_TARGETS, boomDamage, boomThrow, boomFront, boomBlock, boomTarget } from '../../src/game/Boom.js';
import { boomJob, boomStep, runBoom, boomFloor, BOOM_SHAPE } from '../../src/world/BoomCarve.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { GOD_SPELLS, firstSpellGain } from '../../src/game/Mana.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { spaceSpellBlock } from '../../src/game/Space.js';
import { ON_DRAGON } from '../../src/game/DragonKinds.js';
import { TARGETS as PHX } from '../../src/game/Phoenixes.js';
import { TARGETS as OWL } from '../../src/game/Owls.js';
import { DANGERS } from '../../src/game/Danger.js';
import { aliveDamage } from '../../src/game/LivingTrees.js';
import { pirateBoneDamage } from '../../src/game/Sailors.js';
import { SCROLL_KINDS, isCold } from '../../src/game/IceQueen.js';
import { inBoomCrater, stillStanding } from '../../src/game/Rebuild.js';

test('the words: «Boom», «Бум», «Бумм» on their own cast it; «бум» in ordinary talk never does', () => {
    for (const t of ['Boom', 'бум', 'Бум!', 'бумм', 'Буум', 'ну, бум', 'бум бум']) assert.equal(matchSpell(t), 'Boom', t);
    for (const t of ['бумага', 'бумеранг', 'и тут бум — всё упало', 'бум бум бум бум', 'бумажный самолёт', 'я сказал бум и ничего', 'буря', 'бомба', 'бумбокс']) {
        assert.notEqual(matchSpell(t), 'Boom', t);
    }
    assert.equal(boomWords('бум, давай'), true);
    assert.equal(boomWords('давай поиграем в бум'), false);
    // the phrase filter: alone it is the spell; inside a sentence it is talk
    assert.equal(spellPhrase('бум', { final: true }).ok, true);
    assert.equal(spellPhrase('вот это был бум вчера', { final: true }).name === 'Boom' && spellPhrase('вот это был бум вчера', { final: true }).ok, false);
});

test('only from the scroll of the gods\' temple (its fifth pedestal), 750 mana, +100 cells the first time', () => {
    assert.equal(SPELL_COST.Boom, 750);
    assert.equal(BOOM.COST, 750);
    assert.ok(SCROLL_SPELL_COLOR.Boom, 'known only from a burnt scroll outside Creative');
    assert.ok(GOD_SPELLS.has('Boom'));
    assert.equal(firstSpellGain('Boom'), 100);
    assert.equal(TEMPLE_SCROLLS[4], 'Boom');
    const plan = templePlan(1);
    assert.equal(plan.pedestals.length, TEMPLE_SCROLLS.length); // (one pedestal for each scroll of the gods)
    assert.equal(plan.pedestals[4].spell, 'Boom');
    assert.equal(boomBlock({ enabled: true, mana: 749 }), 'mana');
    assert.equal(boomBlock({ enabled: true, mana: 750 }), null);
    assert.equal(boomBlock({ enabled: false, mana: 0 }), null, 'Creative: free');
});

test('ten times «Inspirius»: death in the crater, a weaker shock wave round it; the closer, the further thrown', () => {
    assert.equal(boomDamage(10), 1000);
    assert.equal(boomDamage(BOOM.R), 1000);
    assert.equal(boomDamage(BOOM.R + 10), 150);
    assert.equal(boomDamage(120), 40);
    assert.equal(boomDamage(BOOM.HARM_R + 1), 0);
    assert.ok(boomThrow(10).speed > boomThrow(100).speed);
    assert.equal(boomFront(BOOM.SHOCK_T), BOOM.HARM_R);
    // the bowl: deepest in the middle, rising to the rim
    assert.equal(boomFloor(0, 10), 10 - BOOM_SHAPE.DEPTH);
    assert.equal(boomFloor(BOOM_SHAPE.R, 10), 10 + BOOM_SHAPE.RISE);
});

test('who and what: every creature, the ships, the black ship, the gods\' gifts, space — written, with why', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragons', 'phoenixes', 'owls', 'livingTrees', 'bookBirds', 'iceCastle',
        'ground', 'houseSphere', 'ships', 'items', 'water', 'blackship', 'godGifts', 'space', 'fire']) assert.ok(BOOM_TARGETS[k], k);
    assert.ok(ON_DRAGON.Boom?.why && PHX.Boom?.why && OWL.Boom?.why);
    assert.ok(DANGERS.boom?.ru && DANGERS.boom.r >= 50);
    assert.equal(aliveDamage('Boom', 30), 30, 'a living tree is torn apart');
    assert.equal(pirateBoneDamage('Boom', 30, true), 30, 'the skeletons\' bones break');
    assert.ok(SCROLL_KINDS.has('Boom') && !isCold('Boom'), 'the Ice Queen: not cold — as on anyone');
    assert.ok(spaceSpellBlock('Boom', 'space', 'space'), 'open space: nothing to burst');
    assert.equal(spaceSpellBlock('Boom', 'mars', 'none'), null, 'on a planet without air: it works');
    assert.equal(spaceSpellBlock('Boom', 'venus', 'none'), null);
    const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    const b = src('src/game/Boom.js');
    assert.match(b, /castleLife\?\.alarm\(c, 'boom'/, 'the villagers\' fear');
    assert.match(b, /eachBody\(g/, 'every creature (MagicWave.eachBody)');
    assert.match(b, /ships\?\.boom\?\.\(/, 'the ships');
    assert.match(b, /temple\?\.wards\?\./, 'the gods\' temple: the golden ward');
    assert.match(src('src/game/Ships.js'), /boom\(pos, R, by\) \{\s*this\._divine = true/, 'the black ship: its curse does not hold against a spell of the gods');
    assert.match(src('src/net/NetSync.js'), /case 'bum'/);
    assert.match(src('src/net/NetSync.js'), /if \(e\.boom\) runBoom/);
    assert.match(src('src/game/WorldSave.js'), /if \(e\.boom\) runBoom/);
    assert.match(src('src/game/Game.js'), /boom\?\.sampleModels/, 'its look compiled at loading');
});

/** A small world: flat land at layer 4 (block centres at y ≤ 3) and a stone hill in the middle; the sea at x < −40. */
function world() {
    const t = new TerrainData();
    t.generate({ seed: 1, mountains: false });
    for (let x = -90; x <= 90; x++) for (let z = -90; z <= 90; z++) {
        for (let L = -6; L <= 60; L++) t.set(x, L, z, BLOCK.AIR);
        const h = 4 + Math.max(0, Math.round(40 - Math.hypot(x, z) * 0.9));
        for (let L = -6; L <= h; L++) t.set(x, L, z, x < -40 && L > -3 && L <= 0 ? BLOCK.WATER : x < -40 && L > -3 ? BLOCK.AIR : BLOCK.STONE);
    }
    return t;
}

test('the crater: the hill gone, a bowl under the land, the sea in it; the same however the frames cut it, and a save gives the same', () => {
    const e = { p: [0, 20, 0], b: 3, r: BOOM_SHAPE.R };
    const a = world(), b = world(), c = world();
    const ja = boomJob(a, e);
    let frames = 0;
    while (!boomStep(ja, 0.05)) frames++; // (tiny budgets: many frames)
    assert.ok(frames > 3, 'done a piece at a time');
    const jb = boomJob(b, e);
    boomStep(jb, Infinity);
    runBoom(c, e);
    assert.ok(ja.removed > 50000, 'a whole hill: ' + ja.removed);
    for (const [x, z] of [[0, 0], [20, -10], [-30, 25], [50, 5], [-50, 0], [70, 0]]) {
        for (let L = -8; L <= 50; L++) {
            assert.equal(a.get(x, L, z), b.get(x, L, z), `${x},${L},${z}`);
            assert.equal(a.get(x, L, z), c.get(x, L, z), `${x},${L},${z} (replayed)`);
        }
    }
    // the middle: nothing above the bowl's floor — no peak left hanging
    assert.ok(a.topLayer(0, 0) - 1 <= boomFloor(0, 3) + 1, 'the middle: ' + a.topLayer(0, 0));
    assert.ok(a.topLayer(0, 0) < 4, 'below the land round it');
    // outside the crater the land stands
    assert.ok(a.topLayer(88, 0) >= 4);
    // the sea came into the part of the bowl under its level (by the shore)
    let wet = 0;
    for (let x = -56; x <= -30; x++) for (let L = -6; L <= 0; L++) if (a.get(x, L, 0) === BLOCK.WATER) wet++;
    assert.ok(wet > 10, 'the sea in the crater: ' + wet);
});

test('the target: any land — a hill (its middle inside it), plain land (torn right where the hand points, under the ground); the sky is not', () => {
    const t = world();
    const T = boomTarget(t, { x: 120, y: 30, z: 0 }, { x: -1, y: -0.05, z: 0 });
    assert.ok(!T.why, 'the hill');
    assert.ok(Math.abs(T.c.x) < 25 && Math.abs(T.c.z) < 5, 'its middle near the hill\'s middle: ' + JSON.stringify(T.c));
    assert.ok(T.c.y > T.base && T.c.y < 4 + 40, 'inside it, half-way up');
    const F = boomTarget(t, { x: 80, y: 10, z: 80 }, { x: 0, y: -1, z: 0 });
    assert.ok(!F.why && F.flat, 'plain land is a target too');
    assert.ok(Math.abs(F.c.x - 80) < 1 && Math.abs(F.c.z - 80) < 1, 'right where the hand points');
    assert.ok(F.c.y < 3, 'its middle under the ground: ' + F.c.y);
    assert.equal(boomTarget(t, { x: 0, y: 200, z: 0 }, { x: 0, y: 1, z: 0 }).why, 'none');
});

test('the builders never build over a «Бум» crater; a rebuilt block in it counts as gone', () => {
    const booms = [{ boom: 1, p: [0, 10, 0], b: 3, r: 56 }];
    assert.equal(inBoomCrater(booms, '10,30,10'), true);
    assert.equal(inBoomCrater(booms, '95,5,0'), false);
    assert.deepEqual(stillStanding([[5, 40, 5, 20, 0]], booms), []);
});

test('a spell of the gods: every boss is open to it (the author: «на то они и божественные»)', async () => {
    const { iceDamage } = await import('../../src/game/IceQueen.js');
    for (const k of GOD_SPELLS) assert.equal(iceDamage('queen', k, 50), 50, `the Ice Queen takes ${k}`);
    const { Ships } = await import('../../src/game/Ships.js');
    const S = Object.create(Ships.prototype);
    const black = { cls: { magic: true }, taken: false };
    const cursed = S._cursed(black);
    S._divine = true;
    assert.equal(S._cursed(black), false, 'the black ship\'s curse does not hold against a spell of the gods');
    S._divine = false;
    assert.equal(S._cursed(black), cursed);
});

test('every boss is open to the spells of the gods: the dragon (no scales hold), the spider (no «it doesn\'t care»)', async () => {
    const { dragonDamage, isGodSpell } = await import('../../src/game/DragonKinds.js');
    for (const k of GOD_SPELLS) { assert.ok(isGodSpell(k), k); assert.equal(dragonDamage(k, 40).dmg, 40, `the dragon takes ${k}`); }
    assert.equal(dragonDamage('Inferno', 40).dmg, 0, 'fire still nothing to it');
    const src = fs.readFileSync(new URL('../../src/game/Spider.js', import.meta.url), 'utf8');
    assert.match(src, /!isGodSpell\(kind\) && \(kind === 'Ice'/);
});
