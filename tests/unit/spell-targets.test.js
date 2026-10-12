// Every spell reaches every kind of creature: a new kind of creature added to the game (sailors were
// once forgotten — «Авада Кедавра» flew through them) must be added at EVERY place spells look for
// their targets. This test reads those places and fails if one of them misses a kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The body of a method / an object-literal hook `name` in a source text (up to its closing brace). */
function body(text, start) {
    const i = text.indexOf(start);
    assert.ok(i >= 0, `not found: ${start}`);
    let depth = 0, j = text.indexOf('{', i);
    for (let k = j; k < text.length; k++) {
        if (text[k] === '{') depth++;
        else if (text[k] === '}' && --depth === 0) return text.slice(i, k + 1);
    }
    return text.slice(i);
}

/** The kinds of creatures (CLAUDE.md: «персонажи» — all living things) and how each is named in code. */
const KINDS = {
    zombies: /zombies|zombieById/,
    'castle people (villagers, knights, the king, wizards)': /castleLife/,
    animals: /animals/,
    'sailors (ships\' crews)': /ships\??\.crew/,
    'the giant spider': /spiders/,
    'living trees': /livingTrees/,
    'book-birds': /books/,
    dragons: /dragons/,
};

const check = (where, text, kinds) => {
    const miss = kinds.filter((k) => !KINDS[k].test(text));
    assert.deepEqual(miss, [], `${where} forgets: ${miss.join(', ')}`);
};
const ALL = Object.keys(KINDS);

test('duel charges («Авада Кедавра», «Остолбеней», «Сапира»…) can touch every creature', () => {
    const d = src('src/game/Duel.js');
    check('Duel._bodies (what a charge can hit)', body(d, '    _bodies(skip = null) {'), ALL);
    check('Duel._creature (a hit creature found again)', body(d, '    _creature(kind, id) {'), ALL.filter((k) => !/zombies|spider|dragons/.test(k)));
    // (a dragon is found again as its own kind 'D', like the spider 's')
    assert.match(body(d, '    _bodyOf(kind, id, e) {'), /dragons\?\.byId/);
});

test('blasts, rays and lightning reach every creature', () => {
    const g = src('src/game/Game.js');
    const blast = g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode(')));
    check('Game.explode (Bombardo and other blasts)', blast, ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons']);
    check('the «birdRay» hook (Sapira, Thunderwave, Ice… rays)', body(g, 'birdRay: (o, d, len, width, name) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons']);
    check('the «lightningAt» hook', body(g, 'lightningAt: (point, casterId) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons']);
    check('the «Инферно» stream (Game._burnRay)', body(g, '    _burnRay(o, d, len, casterId) {'), ['the giant spider', 'dragons']);
});

test('pushes, knockdowns and gusts («Вайнд», blasts, blows) know every creature (CreatureImpact kinds)', async () => {
    // (Sailors.js registers its kind when it is loaded — as it is in the game)
    await import('../../src/game/Sailors.js');
    const { KINDS: K } = await import('../../src/game/CreatureImpact.js');
    const names = Object.values(K).map((k) => k.name);
    for (const n of ['zombie', 'villager', 'animal', 'tree', 'sailor']) assert.ok(names.includes(n), `CreatureImpact has no «${n}» kind (spells would not push it)`);
    // dragons are not a CreatureImpact kind (never knocked down): spellArea sways them itself
    const ci = src('src/game/CreatureImpact.js');
    assert.match(ci.slice(ci.indexOf('    spellArea('), ci.indexOf('    spellHit(')), /dragons\?\.push/);
});

test('a house\'s sphere of protection («Protection House») keeps every creature out and stops spells everywhere they look for targets', () => {
    const w = src('src/game/HouseWards.js');
    // creatures: every CreatureImpact kind (zombies, villagers, animals, living trees, sailors…) and the spider
    check('HouseWards._creatures (who is pushed back out)', body(w, '    _creatures(dt) {'), ['the giant spider', 'dragons']);
    assert.match(body(w, '    _creatures(dt) {'), /Object\.keys\(KINDS\)/, 'every CreatureImpact kind is pushed out');
    // the places spells look for their targets know the sphere
    const g = src('src/game/Game.js');
    assert.match(body(g, 'birdRay: (o, d, len, width, name) =>'), /wards\?\.clipRay/, 'rays stop at it');
    assert.match(body(g, 'lightningAt: (point, casterId) =>'), /_wardLightning/, 'lightning strikes its top');
    assert.match(g.slice(g.indexOf('    applyExplosion('), g.indexOf('this.combat.explosion(', g.indexOf('    applyExplosion('))), /keepFor/, 'blasts keep what is inside');
    assert.match(body(src('src/game/Duel.js'), '    _fly(b, dt) {'), /wards\?\.segmentHit/, 'duel charges burst on it');
    assert.match(body(src('src/game/CreatureImpact.js'), '    apply(c, o) {'), /wards\?\.shields/, 'pushes (wind, blasts, waves) don\'t reach inside');
    assert.match(src('src/game/Levitation.js'), /!b\.ward/, '«Левиоса» does not catch the book of protection');
    // the book of protection: only fire and ice bring it down
    const bb = src('src/game/BookBirds.js');
    assert.match(body(bb, '    _damage(b, n, kind = null) {'), /wardBookFalls\(kind\)/);
    assert.match(body(g, '    _burnRay(o, d, len, casterId) {'), /hitRay\(o, d, len, 0\.8, 'fire'\)/, '«Инферно» is fire');
    assert.match(src('src/game/Hellfire.js'), /hitAt\?\.\(f\.c, f\.R, by, 'fire'\)/, '«Let the Hellfire Come» is fire');
    assert.match(src('src/game/WaterMagic.js'), /books\?\.iceAt/, 'an ice ball');
});

test('«Раскрой свои секреты» and «Акцио» see the running book (a creature and a book at once) and lying books', () => {
    const reveal = body(src('src/game/WandMagic.js'), '    reveal() {');
    assert.match(reveal, /runner/, 'Reveal: the running book');
    assert.match(reveal, /books\?\.books/, 'Reveal: book-birds\' books lying about');
    const accio = body(src('src/game/Accio.js'), '    cast() {');
    assert.match(accio, /accioToHand/, 'Accio: the running book into the free hand');
});

test('«Алохомора» decides every creature and every lock (Alohomora.js TARGETS — «не действует» is written too, with why)', async () => {
    const { TARGETS } = await import('../../src/game/Alohomora.js');
    // (the creatures of KINDS, as TARGETS names them; and the players themselves)
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon' };
    for (const k of ALL) assert.ok(TARGETS[names[k]]?.why, `Alohomora forgets: ${k}`);
    for (const k of ['players', 'settlementChest', 'caveChest', 'shipChest', 'villagerDoor', 'throneGate', 'playerDoor', 'world']) assert.ok(TARGETS[k]?.why, k);
});

test('«Джолт» decides every creature and thing (Duel.JOLT_TARGETS — «не действует» is written too, with why)', async () => {
    const { JOLT_TARGETS } = await import('../../src/game/Duel.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon' };
    for (const k of ALL) assert.ok(JOLT_TARGETS[names[k]], `«Джолт» forgets: ${k}`);
    for (const k of ['me', 'players', 'servants', 'looseThings', 'heldThings', 'world']) assert.ok(JOLT_TARGETS[k], k);
    assert.match(src('src/game/Spider.js'), /spell === 'Jolt'/, 'the spider answers «Джолт» itself');
    assert.match(src('src/game/Dragons.js'), /spell === 'Jolt'/, 'a dragon answers «Джолт» itself');
});

test('dragons: every other place spells and blows look for targets knows them (CLAUDE.md «на кого и на что»)', () => {
    const has = (f, re, why) => assert.match(src(f), re, `${f}: ${why}`);
    has('src/game/Gear.js', /dragons\?\.targets\(\)/, 'arrows hit a dragon');
    has('src/game/Game.js', /z\.isDragon\) \{ this\.dragons\.hit/, 'swords, axes, fists hit a dragon');
    has('src/game/Game.js', /this\.dragons\.targets\(\)/, 'blades look for dragons');
    has('src/game/Game.js', /best\?\.k === 'D'/, '«Брейнрот» refuses a dragon');
    has('src/game/Levitation.js', /kind: 'dragon'/, '«Левиоса» can\'t lift a dragon');
    has('src/game/WaterVortex.js', /b\.kind === 'D'\) \{ this\._endFlight/, 'the vortex\'s water only splashes on a dragon');
    has('src/game/WaterVortex.js', /b\.kind === 'D'\) \{ g\.dragons/, '«Fire Maxima» — fire: nothing');
    has('src/game/Hellfire.js', /b\.kind === 'D'/, 'the Hellfire — fire: nothing');
    has('src/game/Servants.js', /dragons/, 'servants fight dragons');
    has('src/game/TotalDestruction.js', /dragons\?\.hitAt/, '«Total Destruction»');
    has('src/game/Cauldrons.js', /dragons\?\.hitAt/, 'a cauldron\'s blast');
    has('src/game/WaveAttack.js', /dragons\?\.list/, 'a wave splashes on it');
    has('src/game/Accio.js', /dragon/, '«Акцио» (written: no)');
});
