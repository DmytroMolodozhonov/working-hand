// Plant creatures (PlantLife.js, Plants.js): how often they grow, in what groups, whom they prick / eat, what they leave,
// and that every place spells look for targets knows them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    PLANT_KINDS, APPLE, EAT, plantGroupAt, plantGroupIn, plantGear, thornsPrick, swallowVerdict, plantDamage, PLANT_TARGETS, DROP_STACK, TREE_TYPICAL_H,
} from '../../src/game/PlantLife.js';
import { appleTreeAt, APPLE_TREES } from '../../src/game/Animals.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';
import { WORLD_GEN, PLANTS_FROM_GEN } from '../../src/world/Terrain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const count = (fn) => { let n = 0; for (let seed = 1; seed <= 12; seed++) for (let gx = -40; gx < 40; gx++) for (let gz = -40; gz < 40; gz++) if (fn(gx, gz, seed)) n++; return n; };

test('the apple trees\' rate in PlantLife is the real one', () => {
    assert.equal(APPLE.CELL, 110);
    assert.ok(Math.abs(APPLE.RATE - (APPLE_TREES.GOLDEN + APPLE_TREES.RED)) < 1e-9);
});

test('telewilpins grow 0.6× as often as apple trees, carnivorous heads 0.5×', () => {
    const apples = count((gx, gz, s) => appleTreeAt(gx, gz, s));
    const tele = count((gx, gz, s) => plantGroupAt('telewilpin', gx, gz, s));
    const head = count((gx, gz, s) => plantGroupAt('carnivore', gx, gz, s));
    assert.ok(Math.abs(tele / apples - 0.6) < 0.05, `telewilpin ${tele / apples}`);
    assert.ok(Math.abs(head / apples - 0.5) < 0.05, `carnivore ${head / apples}`);
});

test('groups: telewilpins about 5, heads 2–5; far enough apart; the same every time', () => {
    for (const [kind, lo, hi] of [['telewilpin', 4, 6], ['carnivore', 2, 5]]) {
        const K = PLANT_KINDS[kind];
        let n = 0, sum = 0;
        for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) {
            const d = plantGroupIn(kind, gx, gz, 77);
            if (!d) continue;
            n++; sum += d.members.length;
            assert.ok(d.members.length >= lo && d.members.length <= hi, `${kind} group of ${d.members.length}`);
            for (let i = 0; i < d.members.length; i++) for (let j = i + 1; j < d.members.length; j++) {
                const a = d.members[i], b = d.members[j];
                assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= K.group.gap - 1e-9, `${kind} members too close`);
            }
            assert.deepEqual(plantGroupIn(kind, gx, gz, 77), d);
        }
        assert.ok(n > 100);
        if (kind === 'telewilpin') assert.ok(sum / n > 4.6 && sum / n < 5.4, `mean ${sum / n}`);
        else assert.ok(sum / n >= 2.4 && sum / n <= 3.6, `mean ${sum / n}`);
    }
});

test('size: a head is about half a tree (the world\'s trees are 14–25 m)', () => {
    const [a, b] = PLANT_KINDS.carnivore.height;
    assert.ok(a > TREE_TYPICAL_H * 0.4 && b < TREE_TYPICAL_H * 0.6, `${a}…${b} vs ${TREE_TYPICAL_H}`);
    assert.ok(PLANT_KINDS.telewilpin.height[0] > 4);
});

test('only worlds of generation ≥ PLANTS_FROM_GEN have them (older worlds stay as they were)', () => {
    assert.ok(WORLD_GEN >= PLANTS_FROM_GEN);
    assert.match(src('src/game/Plants.js'), /\(g\.gen \?\? 1\) >= PLANTS_FROM_GEN/);
});

test('thorns: a full steel set (helmet + breastplate + greaves, plain or magic) is not pricked; a robe and cloth are not steel', () => {
    const plain = (piece) => ({ kind: 'armor', piece, magic: false }), magic = (piece) => ({ kind: 'armor', piece, magic: true });
    assert.equal(thornsPrick({}), true);
    assert.equal(thornsPrick({ helmet: plain('helmet'), chest: plain('chest') }), true, 'two pieces are not a set');
    assert.equal(thornsPrick({ helmet: plain('helmet'), chest: plain('chest'), legs: plain('legs') }), false);
    assert.equal(thornsPrick({ helmet: magic('helmet'), chest: magic('chest'), legs: magic('legs') }), false);
    assert.equal(thornsPrick({ helmet: plain('helmet'), chest: magic('chest'), legs: plain('legs') }), false, 'plain and magic mixed');
    assert.equal(thornsPrick({ robe: { kind: 'robe', magic: true }, chest: plain('chest'), legs: plain('legs') }), true, 'a robe is no helmet');
});

test('the head\'s meal: no armour — eaten; a breastplate — spat out after trying; a magic robe — spat out at once; a plain robe — no protection; an animal — eaten', () => {
    const plain = (piece) => ({ kind: 'armor', piece });
    assert.equal(swallowVerdict(plantGear({})), 'eat');
    assert.equal(swallowVerdict(plantGear({ robe: { kind: 'robe', magic: false } })), 'eat', 'an ordinary robe is only clothes');
    assert.equal(swallowVerdict(plantGear({ chest: plain('chest') })), 'tire');
    assert.equal(swallowVerdict(plantGear({ chest: { kind: 'armor', piece: 'chest', magic: true } })), 'tire');
    assert.equal(swallowVerdict(plantGear({ robe: { kind: 'robe', magic: true } })), 'spit');
    assert.equal(swallowVerdict(plantGear({ robe: { kind: 'robe', magic: true }, chest: plain('chest') })), 'spit', 'the magic robe wins');
    assert.equal(swallowVerdict(null), 'eat', 'an animal cannot defend itself');
    assert.ok(EAT.SPIT_ARMOUR >= 6 && EAT.SPIT_ARMOUR <= 8);
    assert.equal(EAT.BITES, 3);
});

test('what hurts a plant: a blade yes, a fist little, fire fast, blast kills, cold does no HP (it freezes / shatters), «Авада» nothing', () => {
    assert.equal(plantDamage('melee', 3), 3);
    assert.ok(plantDamage('fist', 2) < 2);
    assert.ok(plantDamage('Inferno', 0.5) >= 4);
    assert.ok(plantDamage('Bombardo', 2) >= PLANT_KINDS.telewilpin.hp);
    assert.equal(plantDamage('Frozen', 5), 0);
    assert.equal(plantDamage('AvadaKedavra', 20), 0);
    assert.ok(plantDamage('Inspirius', 1) >= PLANT_KINDS.carnivore.hp, 'a god\'s spell kills');
});

test('what they leave: a leaf / a head, stacking 10 in one slot', () => {
    assert.equal(PLANT_KINDS.telewilpin.drop, 'telewilpinLeaf');
    assert.equal(PLANT_KINDS.carnivore.drop, 'carnivoreHead');
    assert.equal(DROP_STACK, 10);
    for (const k of ['telewilpinLeaf', 'carnivoreHead']) {
        assert.equal(ITEM_INFO[k].stack, 10);
        assert.ok(ITEM_INFO[k].name);
    }
});

test('«кто/что»: the table names every creature of the game', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragons', 'phoenixes', 'owls', 'iceCastle', 'gargoyle']) assert.ok(PLANT_TARGETS[k]?.why, k);
    assert.equal(PLANT_TARGETS.animals.does, 'both');
});

test('every place spells and blows look for targets knows the plants', () => {
    const g = src('src/game/Game.js');
    assert.match(g, /plants\?\.hitAt\(pos, radius/, 'Game.explode');
    assert.match(g, /plants\?\.hitAt\(point, 3/, 'lightningAt');
    assert.match(g, /plants\?\.hitRay\(o, d, len, width/, 'birdRay');
    assert.match(g, /plants\?\.hitRay\(o, d, len, 0\.6, 4, 'Inferno'/, 'the Inferno stream');
    assert.match(g, /zombies\.concat\(this\.plants\.targets\(\)/, 'weapons');
    assert.match(g, /z\.isPlant/, 'onLocalHit');
    const d = src('src/game/Duel.js');
    assert.match(d, /plants\?\.near[\s\S]{0,80}_plantBody/, 'Duel._bodies');
    assert.match(d, /isPlantBody[\s\S]{0,60}boltHit/, 'Duel.applyToCreature');
    assert.match(src('src/game/MagicWave.js'), /fn\('plant'/, 'Circle Attack / Inspirius');
    assert.match(src('src/game/CrowdSources.js'), /g\.plants\?\.near/, 'walkers go round');
    assert.match(src('src/net/NetSync.js'), /case 'plant'/, 'network');
    assert.match(src('src/game/Combat.js'), /this\.eaten/, 'the hold');
    assert.match(src('src/game/Animals.js'), /a\.plantHeld/, 'a held animal does not walk off');
});

test('Codex describes both plants and both things', () => {
    const c = src('src/ui/Codex.js');
    for (const w of ['Телевильпины', 'Плотоядная голова', 'Листок телевильпина', 'Головка плотоядной']) assert.ok(c.includes(w), w);
});
