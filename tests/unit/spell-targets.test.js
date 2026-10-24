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
    owls: /owls/,
    'the Ice Castle (queen, snowmen, ice monsters)': /iceCastle/,
};

const check = (where, text, kinds) => {
    const miss = kinds.filter((k) => !KINDS[k].test(text));
    assert.deepEqual(miss, [], `${where} forgets: ${miss.join(', ')}`);
};
const ALL = Object.keys(KINDS);

test('duel charges («Авада Кедавра», «Остолбеней», «Сапира»…) can touch every creature', () => {
    const d = src('src/game/Duel.js');
    check('Duel._bodies (what a charge can hit)', body(d, '    _bodies(skip = null) {'), ALL);
    check('Duel._creature (a hit creature found again)', body(d, '    _creature(kind, id) {'), ALL.filter((k) => !/zombies|spider|dragons|Ice Castle/.test(k)));
    // (an Ice Castle creature is found again as its own kind 'I', and answers a charge itself)
    assert.match(body(d, '    _bodyOf(kind, id, e) {'), /iceCastle\?\.byId/);
    assert.match(d, /iceCastle\.boltHit/);
    // (a dragon is found again as its own kind 'D', like the spider 's')
    assert.match(body(d, '    _bodyOf(kind, id, e) {'), /dragons\?\.byId/);
    assert.match(body(d, '    applyToCreature(spell, c, byId, from = null, part = null, opts = null) {'), /phoenixes\?\.boltHit/, 'a duel charge on a phoenix: Phoenixes.boltHit');
});

test('blasts, rays and lightning reach every creature', () => {
    const g = src('src/game/Game.js');
    const blast = g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode(')));
    check('Game.explode (Bombardo and other blasts)', blast, ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
    check('the «birdRay» hook (Sapira, Thunderwave, Ice… rays)', body(g, 'birdRay: (o, d, len, width, name) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
    check('the «lightningAt» hook', body(g, 'lightningAt: (point, casterId) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds', 'dragons', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
    check('the «Инферно» stream (Game._burnRay)', body(g, '    _burnRay(o, d, len, casterId) {'), ['the giant spider', 'dragons', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
});

test('«Thunderwave» zone (ThunderWave.js) hits every creature kind', () => {
    check('ThunderWave.strike', src('src/game/ThunderWave.js'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'living trees', 'book-birds', 'dragons', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
});

test('pushes, knockdowns and gusts («Вайнд», blasts, blows) know every creature (CreatureImpact kinds)', async () => {
    // (Sailors.js registers its kind when it is loaded — as it is in the game)
    await import('../../src/game/Sailors.js');
    await import('../../src/game/Phoenixes.js');
    await import('../../src/game/Owls.js');
    await import('../../src/game/IceQueen.js');
    const { KINDS: K } = await import('../../src/game/CreatureImpact.js');
    const names = Object.values(K).map((k) => k.name);
    for (const n of ['zombie', 'villager', 'animal', 'tree', 'sailor', 'phoenix', 'owl', 'ice']) assert.ok(names.includes(n), `CreatureImpact has no «${n}» kind (spells would not push it)`);
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
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    for (const k of ALL) assert.ok(TARGETS[names[k]]?.why, `Alohomora forgets: ${k}`);
    for (const k of ['players', 'settlementChest', 'caveChest', 'shipChest', 'villagerDoor', 'throneGate', 'playerDoor', 'world']) assert.ok(TARGETS[k]?.why, k);
});

test('«Вингардиум Левиоса Максима» decides every creature and thing (LevitationMaxima.MAXIMA_TARGETS) and lifts every kind it says it lifts', async () => {
    const { MAXIMA_TARGETS: T } = await import('../../src/game/LevitationMaxima.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    for (const k of ALL) assert.ok(T[names[k]]?.why, `«Левиоса Максима» forgets: ${k}`);
    const m = src('src/game/LevitationMaxima.js');
    check('LevitationMaxima._bodies (who rises in a group)', body(m, '    _bodies() {'), ALL.filter((k) => !/book-birds|dragons|phoenixes|owls|Ice Castle/.test(k)));
    check('LevitationMaxima.crush (who is under what falls)', body(m, '    crush(b, dmg, by, kind, ship = null) {'), ['zombies', 'castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'phoenixes', 'owls', 'the Ice Castle (queen, snowmen, ice monsters)']);
});

test('«Джолт» decides every creature and thing (Duel.JOLT_TARGETS — «не действует» is written too, with why)', async () => {
    const { JOLT_TARGETS } = await import('../../src/game/Duel.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
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
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    assert.match(src('src/game/Firefighting.js'), /dragons\?\.list/, 'the dragons\' breath goes out');
    for (const k of ALL) assert.ok(T[names[k]]?.why, `«Firefighting» forgets: ${k}`);
    for (const k of ['me', 'players', 'servants', 'campfires', 'trees', 'blocks', 'inferno', 'fireMaxima', 'hellfire', 'hellfireLeft', 'ships', 'items', 'water', 'ground']) assert.ok(T[k]?.why, k);
});

test('burning on the body decides every creature and thing (Burning.BURN_TARGETS)', async () => {
    const { BURN_TARGETS: T } = await import('../../src/game/Burning.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    for (const k of ALL) assert.ok(T[names[k]]?.why, `burning forgets: ${k}`);
    for (const k of ['me', 'players', 'servants', 'blackship', 'items', 'ships', 'water', 'ground', 'space']) assert.ok(T[k]?.why, k);
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
    for (const k of ['zombie', 'villager', 'animal', 'sailor', 'spider', 'dragon', 'phoenix', 'owl', 'tree', 'book', 'ice']) assert.match(hb, new RegExp(`case '${k}'`), `hitBody forgets ${k}`);
    const { CIRCLE_TARGETS } = await import('../../src/game/CircleAttack.js');
    const { INSPIRIUS_TARGETS } = await import('../../src/game/Inspirius.js');
    for (const T of [CIRCLE_TARGETS, INSPIRIUS_TARGETS]) {
        for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragons', 'phoenixes', 'owls', 'livingTrees', 'bookBirds', 'iceCastle', 'ground', 'houseSphere', 'ships', 'items', 'water']) assert.ok(T[k], k);
    }
    // a dragon and a phoenix know them by name; the people fear them; the network carries them
    const { ON_DRAGON } = await import('../../src/game/DragonKinds.js');
    const { TARGETS } = await import('../../src/game/Phoenixes.js');
    for (const n of ['CircleAttack', 'Inspirius']) { assert.ok(ON_DRAGON[n]?.why, n); assert.ok(TARGETS[n]?.why, n); }
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.circle?.ru && DANGERS.inspirius?.ru);
    assert.match(src('src/game/CircleAttack.js'), /castleLife\?\.alarm\(d\.p, 'circle'/);
    assert.match(src('src/game/Inspirius.js'), /castleLife\?\.alarm\(p, 'inspirius'/);
    // the ball never flies through a creature or a ship: it touches every body (Duel._bodies) and every ship
    const ins = src('src/game/Inspirius.js');
    assert.match(body(ins, '    _touch(a, b, o) {'), /inspiriusBodies\(/);
    assert.match(body(ins, '    _touch(a, b, o) {'), /ships\?\.segmentHit/);
    assert.match(body(ins, 'export function inspiriusBodies('), /_bodies/);
    assert.match(body(ins, '    explode(p, by) {'), /ships\?\.shock/);
    const net = src('src/net/NetSync.js');
    assert.match(net, /case 'circ'/);
    assert.match(net, /case 'insp'/);
});

test('carts on the roads (Carriages.js, Travelers.js): blasts, rays, lightning, «Инферно», water, «Алохомора», «Джолт» know them', async () => {
    const g = src('src/game/Game.js');
    const blast = g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode(')));
    assert.match(blast, /carriages\?\.hitAt/, 'Game.explode breaks a cart');
    assert.match(body(g, 'birdRay: (o, d, len, width, name) =>'), /carriages\?\.hitRay/, 'rays chip a cart');
    assert.match(body(g, 'lightningAt: (point, casterId) =>'), /carriages\?\.hitAt/, 'lightning breaks a cart');
    assert.match(body(g, '    _burnRay(o, d, len, casterId) {'), /carriages\?\.burnAlong/, '«Инферно» sets a cart on fire');
    assert.match(src('src/game/Firefighting.js'), /carriages\?\.douse/, 'water puts a burning cart out');
    const { TARGETS, chestKind } = await import('../../src/game/Alohomora.js');
    assert.equal(chestKind({ cart: { id: 'k1' } }), 'cartChest');
    assert.equal(TARGETS.cartChest.plain, 'unlock');
    const { JOLT_TARGETS } = await import('../../src/game/Duel.js');
    assert.ok(JOLT_TARGETS.carts);
    const { FIREFIGHT_TARGETS } = await import('../../src/game/Firefighting.js');
    assert.ok(FIREFIGHT_TARGETS.carts?.why);
    // the horses are real animals; the riders real castle people (every spell finds them there)
    assert.match(src('src/game/Carriages.js'), /animals\._spawn\('horse'/);
    assert.match(src('src/game/Travelers.js'), /L\._activate\(cs, i/);
});

test('«Create a House» waits for every kind of body before it puts a block where one stands', () => {
    const h = src('src/game/HouseMagic.js');
    // (every creature kind of CreatureImpact.KINDS, the players too)
    assert.match(body(h, '    _bodies() {'), /Object\.values\(KINDS\)/);
    assert.match(body(h, '    _bodies() {'), /remotes/);
    const ci = src('src/game/CreatureImpact.js');
    for (const k of ['zombies', 'castleLife', 'animals']) assert.ok(ci.includes(k), k);
});

test('«Wind Impulse», «Drawdown», «Liquidation», «Stitching», «Invisibility», «Fireworks», «Visible Godi», «Ground Vortex», «Пентаграниум» decide every creature and thing (their TARGETS — «не действует» is written too, with why)', async () => {
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    const tables = {
        'Wind Impulse': [(await import('../../src/game/WindImpulse.js')).IMPULSE_TARGETS, ['me', 'players', 'servants', 'looseThings', 'heldThings', 'doors', 'ships', 'world']],
        'Wind Maxima up': [(await import('../../src/game/WindRing.js')).WIND_RING_TARGETS, ['me', 'players', 'servants', 'campfires', 'trees', 'blocks', 'inferno', 'fireMaxima', 'hellfire', 'hellfireLeft', 'carts', 'ships', 'doors', 'items', 'water', 'ground', 'godGifts', 'space', 'burningBodies']],
        Drawdown: [(await import('../../src/game/Drawdown.js')).DRAWDOWN_TARGETS, ['me', 'players', 'blocks', 'trees', 'furniture', 'looseThings', 'water', 'ships', 'ward']],
        Liquidation: [(await import('../../src/game/Liquidation.js')).LIQUIDATION_TARGETS, ['me', 'players', 'servants', 'looseThings', 'heldThings', 'blocks', 'trees', 'furniture', 'ships', 'water', 'ground']],
        Stitching: [(await import('../../src/game/Stitching.js')).STITCH_TARGETS, ['me', 'players', 'blocks', 'houses', 'caves', 'open', 'water', 'ships', 'ward']],
        'Create a Bridge': [(await import('../../src/game/Bridge.js')).BRIDGE_TARGETS, ['me', 'players', 'blocks', 'gap', 'water', 'trees', 'houses', 'ships', 'ward', 'godGift', 'fire', 'blast']],
        'Groundprud': [(await import('../../src/game/Groundprud.js')).GROUNDPRUD_TARGETS, ['me', 'players', 'blocks', 'items', 'water', 'ground', 'trees', 'houses', 'ships', 'ward', 'godGift', 'enchanted', 'space', 'spells', 'blackship']],
        'Ground Vortex': [(await import('../../src/game/GroundVortexRules.js')).GROUND_VORTEX_TARGETS, ['me', 'players', 'blocks', 'items', 'water', 'ground', 'trees', 'houses', 'ships', 'ward', 'godGift', 'enchanted', 'space', 'spells', 'concentration', 'blackship']],
        Fireworks: [(await import('../../src/game/Fireworks.js')).FIREWORKS_TARGETS, ['me', 'players', 'servants', 'sleepers', 'looseThings', 'houses', 'ships', 'ward', 'godGift', 'enchanted', 'blackship', 'water', 'space']],
        Invisibility: [(await import('../../src/game/Invisibility.js')).INVIS_TARGETS, ['me', 'players', 'servants', 'spells', 'hits', 'things']],
        'Visible Godi': [(await import('../../src/game/VisibleGodi.js')).VISIBLE_TARGETS, ['me', 'players', 'servants', 'bosses', 'blocks', 'doors', 'ships', 'water', 'ward', 'godGift', 'enchanted', 'blackship', 'space', 'spells', 'concentration']],
        'Пентаграниум': [(await import('../../src/game/PentagramRules.js')).PENTAGRAM_TARGETS, ['me', 'players', 'bodies', 'items', 'blocks', 'water', 'ground', 'ward', 'godGift', 'enchanted', 'space', 'spells', 'blackship']],
        'Ice Castle / Ice Bridge': [(await import('../../src/game/IceMagic.js')).ICE_MAGIC_TARGETS, ['me', 'players', 'blocks', 'trees', 'water', 'houses', 'ships', 'fire', 'looseThings', 'ward']],
    };
    for (const [spell, [T, things]] of Object.entries(tables)) {
        for (const k of ALL) assert.ok(T[names[k]]?.why, `«${spell}» forgets: ${k}`);
        for (const k of things) assert.ok(T[k]?.why, `«${spell}» forgets: ${k}`);
    }
    // where they look for their targets: every creature (CreatureImpact for the push, Duel._bodies for the splash)
    assert.match(src('src/fx/SpellManager.js'), /castImpulse[\s\S]*?this\.hooks\.creatures\(name/, '«Wind Impulse» pushes every CreatureImpact kind (dragons sway)');
    const liq = src('src/game/Liquidation.js');
    assert.match(liq, /duel\?\._bodies\(casterId\)/, '«Liquidation» finds every living body');
    for (const k of ['zombieById', 'spiders', 'dragons', 'phoenixes', 'owls', 'books', 'livingTrees', 'animals', 'ships\\?\\.crew', 'castleLife', 'iceCastle']) assert.match(liq, new RegExp(k), `«Liquidation» hurts: ${k}`);
    // the minds of the world ask where an invisible player is
    for (const f of ['src/game/CastleLife.js', 'src/game/Dragons.js', 'src/game/Spider.js', 'src/game/Phoenixes.js', 'src/game/Owls.js', 'src/game/Animals.js', 'src/game/Sailors.js', 'src/game/IceQueen.js']) assert.match(src(f), /invis\.aiPos/, `${f}: an invisible player`);
    assert.match(body(src('src/game/Game.js'), '    nearestPlayer(p) {'), /aiPos/, 'zombies: an invisible player');
});

test('«Disarmor» decides every creature and thing (ArmorTypes.DISARMOR_TARGETS — «не действует» is written too, with why)', async () => {
    const { DISARMOR_TARGETS: T } = await import('../../src/game/ArmorTypes.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    for (const k of ALL) assert.ok(T[names[k]]?.why, `«Disarmor» forgets: ${k}`);
    for (const k of ['me', 'players', 'servants', 'looseThings', 'world']) assert.ok(T[k]?.why, k);
    assert.match(src('src/game/Spider.js'), /spell === 'Disarmor'/, 'the spider answers «Disarmor» itself');
    assert.match(src('src/game/Dragons.js'), /spell === 'Disarmor'/, 'a dragon answers «Disarmor» itself');
    assert.match(src('src/game/Phoenixes.js'), /spell === 'Disarmor'/, 'a phoenix answers «Disarmor» itself');
    assert.match(body(src('src/game/Duel.js'), '    applyToCreature(spell, c, byId, from = null, part = null, opts = null) {'), /stripVillager/, 'knights / wizards stripped by the host');
});

test('a skeleton raised from a grave («Alive» at a graveyard) is one of the living trees: every place that finds them finds it', () => {
    const lt = src('src/game/LivingTrees.js');
    assert.match(body(lt, '    spawn(d, owner, id = null) {'), /skeletonModel\(/, 'LivingTrees.spawn makes skeletons');
    assert.match(body(lt, '    hit(t, dmg, kind = null, by = null) {'), /_hitSkel/, 'its own damage rules');
    const sk = src('src/game/Skeletons.js');
    assert.match(sk, /SKEL_DUEL_IMMUNE/, '«Авада» and the duel charges: written down why not');
});

test('the Ice Castle\'s creatures: every place that finds targets knows them; their table says what acts on them and what the Ice Rod\'s «Frozen» does', async () => {
    const { ICE_TARGETS } = await import('../../src/game/IceQueen.js');
    for (const k of ['fire', 'scrollSpells', 'plainSpells', 'blade', 'arrow', 'fist', 'ice', 'push', 'levitation', 'water',
        'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'livingTrees', 'spider', 'dragon', 'phoenix', 'owl', 'bookBirds', 'iceCreatures', 'ground', 'items', 'ships', 'houseSphere']) assert.ok(ICE_TARGETS[k]?.why, `IceQueen.ICE_TARGETS forgets: ${k}`);
    const has = (f, re, why) => assert.match(src(f), re, `${f}: ${why}`);
    const g = src('src/game/Game.js');
    has('src/game/Game.js', /z\.isIce\) \{ this\.iceCastle\.hit/, 'swords, axes, fists');
    has('src/game/Game.js', /this\.iceCastle\.targets\(\)(, this\.gargoyles\.targets\(\))?\), dt\)/, 'blades look for them');
    has('src/game/Gear.js', /iceCastle\?\.targets\(\)/, 'arrows');
    has('src/game/BodyStrikes.js', /iceCastle/, 'fists and pushes');
    has('src/game/Levitation.js', /iceCreature/, '«Левиоса» says no');
    has('src/game/WaterVortex.js', /b\.kind === 'I'/, 'water and «Fire Maxima»');
    has('src/game/Hellfire.js', /b\.kind === 'I'/, 'the Hellfire');
    has('src/game/TotalDestruction.js', /iceCastle\?\.hitAt/, '«Total Destruction»');
    has('src/game/Cauldrons.js', /iceCastle\?\.hitAt/, 'a cauldron\'s blast');
    has('src/game/WaveAttack.js', /iceCastle\?\.list/, 'waves');
    has('src/game/Servants.js', /iceCastle/, 'servants fight them');
    has('src/game/CrowdSources.js', /iceCastle/, 'the crowd: walkers go round them');
    has('src/net/NetSync.js', /case 'ice'/, 'the network');
    has('src/game/WorldSave.js', /iceCastle/, 'the save');
    assert.match(body(g, '    _burnRay(o, d, len, casterId) {'), /iceCastle\?\.meltRay/, 'fire melts the palace');
    assert.ok(g.includes("_castBrainrot") && /best\?\.k === 'I'/.test(g), '«Брейнрот» says no');
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.ice?.ru, 'the villagers fear the ice magic');
});

test('Captain Black Moustache and his skeletons (ships.crew): the parry, the skeletons\' bones, every blow says its kind', () => {
    const d = src('src/game/Duel.js');
    assert.match(body(d, '    _arriveAtCreature(b) {'), /parryBolt/, 'a duel charge at the captain: his rapier may beat it aside');
    assert.match(body(d, '    applyToCreature(spell, c, byId, from = null, part = null, opts = null) {'), /role === 'skeleton'/, 'a duel charge at a skeleton: no harm');
    const sl = src('src/game/Sailors.js');
    assert.match(sl.slice(sl.indexOf('    hit(v, dmg, dir, by, opts = {}) {'), sl.indexOf('    remoteHit(m) {')), /pirateBoneDamage/);
    const g = src('src/game/Game.js');
    assert.match(body(g, 'lightningAt: (point, casterId) =>'), /crew\.hitAt\([^)]*'Lightning'\)/);
    assert.match(body(g, 'birdRay: (o, d, len, width, name) =>'), /crew\.hitRay\([^)]*, name\)/);
    assert.match(g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode('))), /crew\.hitAt\([^;]*Bombardo/);
    for (const f of ['TotalDestruction', 'Hellfire', 'Cannons', 'MagicWave', 'LevitationMaxima', 'Cauldrons']) assert.match(src(`src/game/${f}.js`), /crew\??\.(hitAt|hit)\??\.?\([^;]*(kind|'|HELLFIRE|d\.name)/, `${f}: its kind to the crew`);
});

test('the clever owl: every place blows, arrows, spells, water, fire and «Брейнрот» look for targets knows it; its table says what each does', async () => {
    const { TARGETS } = await import('../../src/game/Owls.js');
    for (const k of ['blade', 'fist', 'arrow', 'plainSpells', 'scrollSpells', 'AvadaKedavra', 'Stupefy', 'Inferno', 'Hellfire', 'FireMaxima', 'Bombardo', 'BombardoMaxima', 'Lightning', 'Wind', 'WindImpulse',
        'Levitation', 'LevitationMaxima', 'WaterVortex', 'WaterStorm', 'Brainrot', 'Alohomora', 'Accio', 'ProtectionHouse', 'Inspirius', 'CircleAttack', 'TotalDestruction',
        'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragon', 'livingTrees', 'bookBirds', 'phoenix', 'iceCastle', 'world', 'ships', 'space']) {
        assert.ok(TARGETS[k]?.why, `Owls.TARGETS forgets: ${k}`);
    }
    const g = src('src/game/Game.js');
    assert.match(g, /this\.owls\.targets\(\), this\.iceCastle\.targets\(\)(, this\.gargoyles\.targets\(\))?\), dt\)/, 'swords and axes (Weapons.checkHits)');
    assert.match(body(g, '    onLocalHit(z, dmg, dir, isWeapon, hit = null, weapon = null) {'), /isOwl/, 'a blow lands on it');
    assert.match(body(g, '    _castBrainrot(isFinal) {'), /owls/, '«Брейнрот» says it does not act');
    assert.match(src('src/game/Gear.js'), /owls\?\.targets\(\)/, 'arrows');
    assert.match(body(src('src/game/BodyStrikes.js'), '    _targets() {'), /owls/, 'fists and pushes');
    assert.match(body(src('src/game/Levitation.js'), '    _candidates() {'), /owls/, '«Левиоса»');
    assert.match(src('src/game/WaterVortex.js'), /owls\?\.watered/, '«Water Vortex»');
    assert.match(src('src/game/Hellfire.js'), /kind === 'o'/, '«Let the Hellfire Come»');
    assert.match(src('src/game/TotalDestruction.js'), /owls\?\.hitAt/, '«Total Destruction»');
    assert.match(src('src/game/Cauldrons.js'), /owls\?\.hitAt/, 'a cauldron');
    assert.match(src('src/game/HouseWards.js'), /owls\?\.shooed/, 'a house\'s sphere');
    assert.match(src('src/game/CrowdSources.js'), /owls/, 'the crowd: walkers go round a sitting owl');
    assert.match(src('src/net/NetSync.js'), /case 'owl'/, 'the network');
    assert.match(src('src/main.js'), /owls\?\.claims/, 'the voice: its words are no spell and no talk');
});

test('«Бум»: the mountain torn from inside reaches every creature (MagicWave.eachBody); its table says what it does to everyone and everything', async () => {
    const b = src('src/game/Boom.js');
    assert.match(body(b, '    _after(b, dt) {'), /eachBody\(g, /, 'every creature');
    assert.match(body(b, '    _after(b, dt) {'), /hitBody\(/);
    const { BOOM_TARGETS } = await import('../../src/game/Boom.js');
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'dragons', 'phoenixes', 'owls', 'livingTrees', 'bookBirds', 'iceCastle', 'ground', 'houseSphere', 'ships', 'items', 'water', 'blackship', 'godGifts', 'space']) assert.ok(BOOM_TARGETS[k], k);
    const { ON_DRAGON } = await import('../../src/game/DragonKinds.js');
    const { TARGETS } = await import('../../src/game/Phoenixes.js');
    const { TARGETS: OWLS } = await import('../../src/game/Owls.js');
    assert.ok(ON_DRAGON.Boom?.why && TARGETS.Boom?.why && OWLS.Boom?.why);
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.boom?.ru);
    assert.match(b, /castleLife\?\.alarm\(c, 'boom'/);
    assert.match(body(b, '    _burst(b) {'), /ships\?\.boom/);
    assert.match(src('src/net/NetSync.js'), /case 'bum'/);
});

test('«Protection Gods» (… Maxima): its table decides who and what; every place a spell reaches the player asks it', async () => {
    const { PROTECTION_GODS_TARGETS: T } = await import('../../src/game/ProtectionGods.js');
    for (const k of ['holders', 'me', 'players', 'duelCharges', 'blasts', 'rays', 'beasts', 'iceQueen', 'bosses', 'things', 'creatures', 'world', 'houseSphere', 'space']) assert.ok(T[k], k);
    const c = src('src/game/Combat.js');
    for (const m of ['    damage(amount, byId, kind) {', '    stun(seconds, byId, kind', '    freeze(byId, time', '    slow(seconds', '    _payHit(kind) {', '    explosion(pos, radius, power, byId) {']) assert.match(body(c, m), /gods|godsKeepsOff|godsHit/, m);
    assert.match(body(src('src/game/BodyImpact.js'), '    apply(o) {'), /_godsHold/, 'pushes and falls');
    assert.match(src('src/game/Boom.js'), /godsHit\(BOOM\.NAME/, '«Бум» pays the gods\' shield');
    assert.match(src('src/game/PlanetDestroy.js'), /godsHit\('PlanetLiquidation'/, '«Planet Liquidation» pays the gods\' shield');
    assert.match(src('src/game/Levitation.js'), /shield\?\.gods/, '«Левиоса» does not lift who is under it');
});

test('the strong duel spells and the new ice decide every creature and thing (StrongSpells — «не действует» is written too, with why); every place a charge lands asks StrongMagic', async () => {
    const S = await import('../../src/game/StrongSpells.js');
    const names = { zombies: 'zombies', 'castle people (villagers, knights, the king, wizards)': 'castlePeople', animals: 'animals', 'sailors (ships\' crews)': 'sailors', 'the giant spider': 'spider', 'living trees': 'livingTrees', 'book-birds': 'bookBirds', dragons: 'dragon', phoenixes: 'phoenix', owls: 'owl', 'the Ice Castle (queen, snowmen, ice monsters)': 'iceCastle' };
    for (const [spell, T] of Object.entries({ Accentric: S.ACCENTRIC_TARGETS, Pilbidrio: S.PILBIDRIO_TARGETS, Die: S.DIE_TARGETS, Electrum: S.ELECTRUM_TARGETS, Ice: S.ICE_SPELL_TARGETS })) {
        for (const k of ALL) assert.ok(T[names[k]]?.why, `«${spell}» forgets: ${k}`);
        for (const k of ['me', 'players', 'servants', 'world', 'space']) assert.ok(T[k]?.why, `«${spell}» forgets: ${k}`);
    }
    assert.ok(S.DIE_TARGETS.titans?.why && S.DIE_TARGETS.godGifts?.why, '«Дай»: the titans and the gods\' gifts');
    const d = src('src/game/Duel.js');
    assert.match(body(d, '    applyToCreature(spell, c, byId, from = null, part = null, opts = null) {'), /strong\?\.hitCreature/);
    assert.match(body(d, '    applyToZombie(spell, z, byId, from = null) {'), /strong\?\.hitCreature\('z'/);
    assert.match(body(d, '    applyToMe(spell, byId, side = \'right\', opts = null) {'), /strong\?\.hitMe/);
    for (const f of ['src/game/Dragons.js', 'src/game/Spider.js', 'src/game/IceQueen.js']) assert.match(src(f), /strong\?\.boltHit\?\.\('[DsI]'/, `${f} asks StrongMagic`);
    const sm = src('src/game/StrongMagic.js');
    for (const k of ['zombieById', 'castleLife', 'ships\\?\\.crew', 'animals', 'livingTrees', 'spiders', 'dragons', 'iceCastle', 'phoenixes', 'owls', 'books']) assert.match(body(sm, '    _hurt(k, c, dmg, spell, by) {') + body(sm, '    _vanish(k, id) {') + sm, new RegExp(k), `StrongMagic forgets ${k}`);
    // a dragon, a phoenix, an owl know them by name; the people fear «Дай»
    const { ON_DRAGON } = await import('../../src/game/DragonKinds.js');
    for (const n of ['Accentric', 'Pilbidrio', 'Electrum', 'Die', 'IceMaxima']) assert.ok(ON_DRAGON[n]?.why, n);
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.die?.ru);
});

test('«Brain Rot Maxima» (DragonTame.js): every kind of creature and thing is decided with its reason; the dragon is the one it takes; the code that must know it knows it', async () => {
    const { TARGETS, TAME } = await import('../../src/game/DragonTame.js');
    for (const k of ['dragons', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'phoenix', 'owls', 'iceCastle', 'players', 'servants', 'items', 'world', 'space'])
        assert.ok(TARGETS[k]?.why && TARGETS[k].does, `DragonTame.TARGETS forgets: ${k}`);
    assert.equal(TARGETS.dragons.does, 'takes');
    for (const [k, t] of Object.entries(TARGETS)) if (k !== 'dragons') assert.equal(t.does, 'none', k);
    assert.equal(TAME.COST_PER_S, 0.5);
    const g = src('src/game/Game.js');
    assert.match(g, /name === 'BrainrotMaxima'\) return this\.dragonRide\.cast/, 'the cast goes to DragonRide');
    assert.match(g, /dragonRide\?\.stop\('stop'\)/, '«стоп» lets the dragon go');
    assert.match(src('src/game/Concentration.js'), /DragonTame: \{/, 'a held spell (concentration)');
    assert.match(src('src/game/Space.js'), /name === 'BrainrotMaxima'/, 'space says why not');
    const d = src('src/game/Dragons.js');
    assert.match(d, /_offend\(d, who/, 'an offence is remembered');
    assert.match(body(d, '    _breathe(d, dt) {'), /b\.ride/, 'an ordered fire burns only its target');
    assert.match(body(d, '    _think(d, dt) {'), /d\.tame\?\.rider/, 'a ridden dragon is flown by its rider');
});

test('a living creature stays a target in every STATE (thrown, lying, stunned, far): the body follows the tipped model (Duel._tipped), the people list reaches «Дай»', () => {
    const d = src('src/game/Duel.js');
    const bodies = body(d, '    _bodies(skip = null) {');
    for (const k of ["this._tipped(z, this._zombieBody", "this._tipped(v, this._villagerBody(v, put('v'", "this._tipped(v, this._villagerBody(v, put('c'"]) assert.ok(bodies.includes(k), `_bodies forgets the tipped body: ${k}`);
    assert.match(bodies, /castleLife\?\.targets\(DUEL\.RANGE_DIE/, 'castle people as far as «Дай» reaches');
    assert.match(src('src/game/CastleLife.js'), /targets\(reach = 40\)/);
    // (the real matrix, with real models: tests/unit/duel-creature-states.test.js)
});

test('«Империус» / «… Максима» (Imperius.js): every kind of creature is decided — taken by the plain one, only by the Maxima, or why not; the code that must know it knows it', async () => {
    const { IMPERIUS_TARGETS, kindOf } = await import('../../src/game/Imperius.js');
    // every creature of the game has its row (KINDS above — and the players)
    const rows = {
        zombies: ['zombie'], 'castle people (villagers, knights, the king, wizards)': ['villager', 'knight', 'king', 'wizard', 'towerHead'], animals: ['cow', 'sheep', 'horse', 'pig', 'pegasus', 'runbook', 'guardBeast'],
        'sailors (ships\' crews)': ['sailor', 'blackbeard', 'pirateSkeleton'], 'the giant spider': ['spider'], 'living trees': ['tree', 'skeleton'], 'book-birds': ['bookbird'], dragons: ['dragon'],
        phoenixes: ['phoenix'], owls: ['owl'], 'the Ice Castle (queen, snowmen, ice monsters)': ['snowman', 'iceMonster', 'iceQueen'],
    };
    for (const k of ALL) {
        assert.ok(rows[k], `Imperius: no rows for ${k}`);
        for (const r of rows[k]) assert.ok(IMPERIUS_TARGETS[r], `IMPERIUS_TARGETS forgets ${r} (${k})`);
    }
    assert.ok(IMPERIUS_TARGETS.player?.player, 'another player: only the Maxima');
    for (const s of ['z', 'v', 'a', 's', 'D', 'sp', 'b', 'o', 'f', 't', 'I', 'pl']) assert.ok(kindOf(s, {}), `kindOf knows the system «${s}»`);
    const g = src('src/game/Game.js');
    assert.match(g, /name === 'Imperius' \|\| name === 'ImperiusMaxima'\) return this\.imperius\.cast/, 'the cast goes to ImperiusControl');
    assert.match(g, /z\.imp && .*this\.imperius\?\.step\('z'/, 'the zombies\' loop gives a taken zombie to the mind in it');
    assert.match(src('src/game/CastleLife.js'), /imperius\?\.step\('v'/, 'the people\'s loop too');
    assert.match(src('src/game/Animals.js'), /imperius\?\.step\('a'/, 'the animals\' loop too');
    assert.match(src('src/game/Concentration.js'), /Imperius: \{/, 'a held spell (concentration)');
    assert.match(src('src/game/Space.js'), /name === 'Imperius'/, 'space says why not');
});

test('the conductor of things («Левиоса Максима» на вещь): answers for every creature, and the wall is asked by Combat', () => {
    const sw = src('src/game/ItemSwarm.js'), os = src('src/game/ItemSwarmRules.js'), cb = src('src/game/Combat.js');
    // a flying thing looks for creatures in the duel's list of bodies and hurts every kind that can be hurt
    assert.match(sw, /duel\?\._bodies/);
    for (const kind of ["'z'", "'v'", "'a'", "'c'", "'p'"]) assert.ok(sw.includes(kind), `the volley forgets the kind ${kind}`);
    assert.match(sw, /creatureImpact\?\.apply/);
    assert.match(sw, /levitation\?\._hurt/);
    // each kind of creature has its answer in the table
    for (const k of ['zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'dragon', 'iceCastle', 'players', 'owl', 'phoenix', 'bookBirds']) assert.match(os, new RegExp('    ' + k + ': \\{ why'), k);
    // the wall: asked by every spell's shield question
    assert.match(body(cb, '    shieldFactor(from) {'), /swarm\?\.faces/);
    assert.match(body(cb, '    _blocked(from, kind = null) {'), /swarm\.took/);
});
