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
    phoenixes: /phoenix/i,
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
    assert.match(body(d, '    applyToCreature(spell, c, byId, from = null) {'), /phoenixes\?\.boltHit/, 'a duel charge on a phoenix: Phoenixes.boltHit');
});

test('blasts, rays and lightning reach every creature', () => {
    const g = src('src/game/Game.js');
    const blast = g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode(')));
    check('Game.explode (Bombardo and other blasts)', blast, ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes']);
    check('the «birdRay» hook (Sapira, Thunderwave, Ice… rays)', body(g, 'birdRay: (o, d, len, width, name) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes']);
    check('the «lightningAt» hook', body(g, 'lightningAt: (point, casterId) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes']);
    check('the «Инферно» stream (Game._burnRay)', body(g, '    _burnRay(o, d, len, casterId) {'), ['the giant spider', 'dragons', 'phoenixes']);
});

test('pushes, knockdowns and gusts («Вайнд», blasts, blows) know every creature (CreatureImpact kinds)', async () => {
    // (Sailors.js registers its kind when it is loaded — as it is in the game)
    await import('../../src/game/Sailors.js');
    await import('../../src/game/Phoenixes.js');
    const { KINDS: K } = await import('../../src/game/CreatureImpact.js');
    const names = Object.values(K).map((k) => k.name);
    for (const n of ['zombie', 'villager', 'animal', 'tree', 'sailor', 'phoenix']) assert.ok(names.includes(n), `CreatureImpact has no «${n}» kind (spells would not push it)`);
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

test('«Reveal» and «Акцио» see the running book (a creature and a book at once) and lying books', () => {
    const reveal = body(src('src/game/WandMagic.js'), '    reveal() {');
    assert.match(reveal, /runner/, 'Reveal: the running book');
    assert.match(reveal, /books\?\.books/, 'Reveal: book-birds\' books lying about');
    const accio = body(src('src/game/Accio.js'), '    cast() {');
    assert.match(accio, /accioToHand/, 'Accio: the running book into the free hand');
});

test('«Алохомора» decides every creature and every lock (Alohomora.js TARGETS — «не действует» is written too, with why)', async () => {
    const { TARGETS } = await import('../../src/game/Alohomora.js');
    // (the creatures of KINDS, as TARGETS names them; and the players themselves)
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix' };
    for (const k of ALL) assert.ok(TARGETS[names[k]]?.why, `Alohomora forgets: ${k}`);
    for (const k of ['players', 'settlementChest', 'caveChest', 'shipChest', 'villagerDoor', 'throneGate', 'playerDoor', 'world']) assert.ok(TARGETS[k]?.why, k);
});

test('«Джолт» decides every creature and thing (Duel.JOLT_TARGETS — «не действует» is written too, with why)', async () => {
    const { JOLT_TARGETS } = await import('../../src/game/Duel.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix' };
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

test('«Firefighting» decides every creature and thing (Firefighting.FIREFIGHT_TARGETS — «не действует» is written too, with why)', async () => {
    const { FIREFIGHT_TARGETS: T } = await import('../../src/game/Firefighting.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix' };
    assert.match(src('src/game/Firefighting.js'), /dragons\?\.list/, 'the dragons\' breath goes out');
    for (const k of ALL) assert.ok(T[names[k]]?.why, `«Firefighting» forgets: ${k}`);
    for (const k of ['me', 'players', 'servants', 'campfires', 'trees', 'blocks', 'inferno', 'fireMaxima', 'hellfire', 'hellfireLeft', 'ships', 'items', 'water', 'ground']) assert.ok(T[k]?.why, k);
});

test('the phoenix: blades, arrows, fists, «Левиоса», water, fire and «Брейнрот» know it; its table says what each does', async () => {
    const { TARGETS } = await import('../../src/game/Phoenixes.js');
    for (const k of ['blade', 'fist', 'arrow', 'AvadaKedavra', 'Stupefy', 'IceDuel', 'Inferno', 'Hellfire', 'FireMaxima', 'Bombardo', 'Lightning', 'Wind', 'Levitation',
        'WaterVortex', 'WaterStorm', 'Brainrot', 'Alohomora', 'Accio', 'ProtectionHouse', 'Protection', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'world']) {
        assert.ok(TARGETS[k]?.why, `Phoenixes.TARGETS forgets: ${k}`);
    }
    const g = src('src/game/Game.js');
    assert.match(g, /phoenixes\.targets\(\), this\.castleLife\.targets\(\)/, 'swords and axes (Weapons.checkHits)');
    assert.match(body(g, '    onLocalHit(z, dmg, dir, isWeapon, hit = null, weapon = null) {'), /isPhoenix/, 'a blow lands on it');
    assert.match(body(g, '    _castBrainrot(isFinal) {'), /phoenixes/, '«Брейнрот» says it does not act');
    assert.match(src('src/game/Gear.js'), /phoenixes\?\.targets\(\)/, 'arrows');
    assert.match(body(src('src/game/BodyStrikes.js'), '    _targets() {'), /phoenixes/, 'fists and pushes');
    assert.match(body(src('src/game/Levitation.js'), '    _candidates() {'), /phoenixes/, '«Левиоса»');
    assert.match(src('src/game/WaterVortex.js'), /phoenixes\?\.watered/, '«Water Vortex»');
    assert.match(src('src/game/WaveAttack.js'), /phoenixes\?\.watered/, 'waves');
    assert.match(src('src/game/Hellfire.js'), /kind === 'f'/, '«Let the Hellfire Come»');
    assert.match(src('src/game/TotalDestruction.js'), /phoenixes\?\.hitAt/, '«Total Destruction»');
    assert.match(src('src/net/NetSync.js'), /case 'phx'/, 'the network');
});

test('«Circle Attack» and «Inspirius»: their waves reach every creature; their tables say what they do to everyone and everything', async () => {
    // (MagicWave.eachBody: where both waves look for whom to hurt and throw)
    check('MagicWave.eachBody (Circle Attack, Inspirius)', body(src('src/game/MagicWave.js'), 'export function eachBody(g, fn) {'), ALL);
    const hb = body(src('src/game/MagicWave.js'), 'export function hitBody(');
    for (const k of ['zombie', 'villager', 'animal', 'sailor', 'spider', 'dragon', 'phoenix', 'tree', 'book']) assert.match(hb, new RegExp(`case '${k}'`), `hitBody forgets ${k}`);
    const { CIRCLE_TARGETS } = await import('../../src/game/CircleAttack.js');
    const { INSPIRIUS_TARGETS } = await import('../../src/game/Inspirius.js');
    for (const T of [CIRCLE_TARGETS, INSPIRIUS_TARGETS]) {
        for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragons', 'phoenixes', 'livingTrees', 'bookBirds', 'ground', 'houseSphere', 'ships', 'items', 'water']) assert.ok(T[k], k);
    }
    // a dragon and a phoenix know them by name; the people fear them; the network carries them
    const { ON_DRAGON } = await import('../../src/game/DragonKinds.js');
    const { TARGETS } = await import('../../src/game/Phoenixes.js');
    for (const n of ['CircleAttack', 'Inspirius']) { assert.ok(ON_DRAGON[n]?.why, n); assert.ok(TARGETS[n]?.why, n); }
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.circle?.ru && DANGERS.inspirius?.ru);
    assert.match(src('src/game/CircleAttack.js'), /castleLife\?\.alarm\(d\.p, 'circle'/);
    assert.match(src('src/game/Inspirius.js'), /castleLife\?\.alarm\(p, 'inspirius'/);
    const net = src('src/net/NetSync.js');
    assert.match(net, /case 'circ'/);
    assert.match(net, /case 'insp'/);
});
