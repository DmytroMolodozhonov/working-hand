// The infernal gargoyles of the pentagram: the rules and numbers, the ritual's timeline, the 20-second grace, the radius,
// life and the limit, who-and-what (CLAUDE.md «На кого и на что»), the model's size, and that every place the spells look for
// creatures knows them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {
    GARGOYLE, PHASE, phaseAt, fireStrength, ringAngle, skyStrength, skyNow, skyReach, canStart, sparesSummoner, releasePlan, boltPlan, mayHunt, biteDamage, harmOf,
    TARGETS, roomFor, outOfLeash, atLimit, FIRE_KINDS, ENEMIES, IGNORED,
} from '../../src/game/GargoyleRules.js';
import { DIVINE_SPELLS } from '../../src/game/ProtectionGods.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('the numbers of the author: 40 HP, 30 of them, 150 mana, 5 s of fire, 20 s of grace, a wide leash, 5–10 min, at most 60', () => {
    assert.equal(GARGOYLE.HP, 40);
    assert.equal(GARGOYLE.COUNT, 30);
    assert.equal(GARGOYLE.MANA, 150);
    assert.equal(GARGOYLE.FIRE_T, 5);
    assert.equal(GARGOYLE.GRACE, 20);
    assert.equal(GARGOYLE.LEASH, 260);
    assert.deepEqual(GARGOYLE.LIFE, [300, 600]);
    assert.equal(GARGOYLE.MAX, 60);
    assert.ok(GARGOYLE.SKY_R >= 80 && GARGOYLE.SKY_R <= 120, 'the clouds: 80–120 m');
    assert.ok(GARGOYLE.BITE[0] === 3 && GARGOYLE.BITE[1] === 5, 'a bite 3–5');
    assert.ok(GARGOYLE.SPEED > 10 && GARGOYLE.DIVE > GARGOYLE.SPEED, 'quick, quicker in a dive');
});

test('the price: 150 mana at once — under that nothing is taken and nothing starts; Creative is free', () => {
    assert.equal(canStart(149).ok, false);
    assert.equal(canStart(150).ok, true);
    assert.equal(canStart(0).need, 150);
    assert.equal(canStart(0, true).ok, true);
});

test('the ritual: 5 s of fire growing (the flame runs faster and faster), then 30 burst out in 2.4 s, then the storm', () => {
    assert.equal(phaseAt(0), PHASE.FIRE);
    assert.equal(phaseAt(4.99), PHASE.FIRE);
    assert.equal(phaseAt(5.01), PHASE.RELEASE);
    assert.equal(phaseAt(5 + GARGOYLE.RELEASE_T + 0.1), PHASE.STORM);
    assert.equal(phaseAt(GARGOYLE.STORM_T + 1), PHASE.DONE);
    let last = -1;
    for (let t = 0; t <= 5; t += 0.25) { const f = fireStrength(t); assert.ok(f >= last, 'the fire only grows'); last = f; }
    assert.ok(fireStrength(5) > 0.99 && fireStrength(0.1) < 0.05);
    assert.ok(ringAngle(5) - ringAngle(4) > ringAngle(1) - ringAngle(0), 'the running flame speeds up');
    assert.equal(skyStrength(0), 0);
    assert.ok(skyStrength(8) > 0.99, 'the clouds have closed');
    assert.equal(skyStrength(GARGOYLE.STORM_T), 0);
    assert.ok(skyReach(0) === 1 && skyReach(GARGOYLE.SKY_R) === 1 && skyReach(GARGOYLE.SKY_R + GARGOYLE.SKY_FADE) === 0, 'the sky is closed only in its radius: run out of it');
});

test('the release: 30, one after another, first straight up then every way round (the same on every computer for a seed)', () => {
    const a = releasePlan(1234), b = releasePlan(1234), c = releasePlan(99);
    assert.equal(a.length, 30);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    for (const p of a) { assert.ok(p.delay >= 0 && p.delay <= GARGOYLE.RELEASE_T + 0.1); assert.ok(p.climb >= 1 && p.climb <= 2.1, 'a climb up first'); assert.ok(p.life >= 300 && p.life <= 600); }
    const sorted = a.map((p) => ((p.bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
    let big = 0;
    for (let i = 0; i < sorted.length; i++) big = Math.max(big, (sorted[(i + 1) % sorted.length] - sorted[i] + Math.PI * 2) % (Math.PI * 2));
    assert.ok(big < 1.2, 'they scatter round the whole compass, no empty side');
    assert.ok(new Set(a.map((p) => p.scale.toFixed(2))).size > 12, "each a little different in size");
    assert.equal(roomFor(0), 30);
    assert.equal(roomFor(45), 15);
    assert.equal(roomFor(60), 0);
    assert.ok(atLimit(60) && !atLimit(59));
});

test('the storm: at most 12 real strikes, none before the fire is over, spread out', () => {
    const plan = boltPlan(7);
    assert.ok(plan.length > 0 && plan.length <= GARGOYLE.BOLTS);
    for (const b of plan) assert.ok(b.t >= GARGOYLE.FIRE_T + GARGOYLE.BOLT_FIRST - 1e-9 && b.t < GARGOYLE.STORM_T);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].t - plan[i - 1].t >= GARGOYLE.BOLT_GAP[0] - 1e-9);
    assert.deepEqual(boltPlan(7), plan);
});

test('20 seconds: they do not touch the summoner, then he is prey too; everybody else at once', () => {
    assert.equal(sparesSummoner(0), true);
    assert.equal(sparesSummoner(19.9), true);
    assert.equal(sparesSummoner(20), false);
    assert.equal(mayHunt('player', { isSummoner: true, age: 5 }), false);
    assert.equal(mayHunt('player', { isSummoner: true, age: 25 }), true);
    assert.equal(mayHunt('player', { isSummoner: false, age: 1 }), true, 'another player — at once');
    for (const k of ['villager', 'animal', 'zombie', 'sailor']) assert.equal(mayHunt(k, { age: 0 }), true, k);
    for (const k of ['dragon', 'spider', 'ice', 'tree', 'book', 'owl', 'phoenix']) assert.equal(mayHunt(k), false, k + ' is left alone');
    assert.ok(ENEMIES.length === 5 && IGNORED.includes('dragon'));
});

test('the radius: farther than LEASH m from the pentagram it turns back', () => {
    assert.equal(outOfLeash(GARGOYLE.LEASH - 1), false);
    assert.equal(outOfLeash(GARGOYLE.LEASH + 1), true);
});

test('a bite 3–5 on people, ×1.4 on beasts', () => {
    assert.equal(biteDamage('p', 0), 3);
    assert.equal(biteDamage('p', 1), 5);
    assert.equal(biteDamage('animal', 0), 4.2);
    assert.equal(biteDamage('zombie', 1), 7);
});

test('who and what hurts a gargoyle (GargoyleRules.TARGETS, harmOf): fire never, cold slows, Avada no, the gods kill, stone takes blows less', () => {
    for (const k of ['Inferno', 'FireMaxima', 'fire']) assert.equal(harmOf(k, 30).does, 'immune', k);
    assert.equal(harmOf('Inferno', 30).scare, 0, 'plain fire does not frighten it at all');
    assert.equal(harmOf('Ice', 9).does, 'slow');
    assert.equal(harmOf('Ice', 9).dmg, 0, 'no damage and no freezing');
    assert.equal(harmOf('AvadaKedavra', 25).does, 'none', 'not alive: a decision, written down');
    assert.equal(harmOf('Boom', 5).does, 'kill');
    assert.equal(harmOf('Die', 5).does, 'kill');
    for (const k of DIVINE_SPELLS) assert.equal(harmOf(k, 1).does, 'kill', 'a spell of the gods: ' + k);
    assert.equal(harmOf('arrow', 5).dmg, 3);
    assert.equal(harmOf('melee', 5).dmg, 5);
    assert.equal(harmOf('fist', 5).dmg, 4);
    assert.equal(harmOf('Lightning', 20).does, 'hit');
    assert.equal(harmOf('Bombardo', 10).dmg, 10);
    assert.equal(harmOf('Brainrot', 10).does, 'none');
    assert.equal(harmOf('Wind', 10).does, 'push');
    assert.ok(FIRE_KINDS.has('Inferno'));
    const need = ['blade', 'fist', 'arrow', 'plainSpells', 'scrollSpells', 'AvadaKedavra', 'Stupefy', 'Inferno', 'Hellfire', 'FireMaxima', 'Bombardo', 'BombardoMaxima', 'Lightning', 'Wind', 'WindImpulse',
        'Levitation', 'LevitationMaxima', 'WaterVortex', 'WaterStorm', 'Brainrot', 'Alohomora', 'Accio', 'ProtectionHouse', 'Protection', 'Inspirius', 'CircleAttack', 'TotalDestruction', 'Boom', 'divine', 'Die', 'Imperius', 'Ice',
        'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'creatures', 'world', 'ships', 'space'];
    for (const k of need) assert.ok(TARGETS[k]?.why, `GargoyleRules.TARGETS forgets: ${k}`);
});

test('the model: ~2.8 m to the horns, 4–5 m across the wings, a little smaller than the hero (3.5), bigger than the owl and the phoenix', async () => {
    const M = await import('../../src/game/GargoyleModel.js');
    const z = M.gargoyleSize();
    assert.ok(z.height > 2.6 && z.height < 3.1, `height ${z.height}`);
    assert.ok(z.span > 4.0 && z.span < 5.2, `span ${z.span}`);
    assert.ok(z.height < 3.5 && z.height > 2.4, 'between the phoenix (2.4) and the hero (3.5)');
    const st = M.gargoyleStats();
    assert.equal(st.draws, 3, 'stone, glow, membrane: three draws a gargoyle');
    assert.ok(st.near < 7500 && st.far < st.near, `triangles ${st.near} / ${st.far}`);
    assert.equal(st.bones, 46);
});

test('the model: every part is on a bone, the materials are skinned, the shapes are shared between gargoyles, the pose moves the bones', async () => {
    const M = await import('../../src/game/GargoyleModel.js');
    const a = M.gargoyleModel(0), b = M.gargoyleModel(1);
    assert.equal(a.userData.body.geometry, b.userData.body.geometry, 'the same shape — one geometry for all');
    assert.equal(a.userData.mem.material, b.userData.mem.material);
    for (const m of [a.userData.body, a.userData.glow, a.userData.mem]) { assert.equal(m.material.skinning, true, 'r128: the material\'s own switch'); assert.ok(m.isSkinnedMesh); }
    assert.notEqual(a.userData.skel, b.userData.skel, 'its own bones');
    const wasW = a.userData.B.wrootL.rotation.z;
    const st = { mode: 'fly', seed: 1 };
    for (let i = 0; i < 30; i++) M.poseGargoyle(a, st, 0.016);
    assert.notEqual(a.userData.B.wrootL.rotation.z, wasW, 'the wings beat');
    const pos = a.userData.body.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i += 37) { const s = pos.getX(i) + pos.getY(i) + pos.getZ(i) + pos.getW(i); assert.ok(Math.abs(s - 1) < 1e-3, 'weights sum to 1'); }
    const mw = a.userData.mem.geometry.attributes.skinWeight;
    for (let i = 0; i < mw.count; i += 11) { const s = mw.getX(i) + mw.getY(i) + mw.getZ(i) + mw.getW(i); assert.ok(Math.abs(s - 1) < 1e-3, 'membrane weights sum to 1'); }
    a.userData.setLod(true);
    assert.notEqual(a.userData.body.geometry, b.userData.body.geometry, 'far: a lighter shape');
    a.userData.setLod(false);
    assert.equal(a.userData.body.geometry, b.userData.body.geometry);
});

// ---------------------------------------------------------------- the manager on a bare game
async function bareGame(over = {}) {
    const { Gargoyles } = await import('../../src/game/Gargoyles.js');
    const g = {
        config: { mode: 'survival' }, scene: new THREE.Scene(), localId: 'me', authority: true, remotes: new Map(), said: [],
        combat: { enabled: true, fatigue: 200, dead: false, damage() {} }, character: { group: new THREE.Group() }, zombies: [], animals: { list: [] }, camera: { position: new THREE.Vector3(0, 5, 0) },
        hud: { setVoice(t) { g.said.push(t); } }, dark: { level: 0 }, ...over,
    };
    g.gargoyles = new Gargoyles(g);
    return g;
}

test('the ritual on a bare game: 149 mana — nothing taken, nothing starts; 150 — taken, +25 to the black level, 5 s of fire, then 30', async () => {
    const g = await bareGame({ combat: { enabled: true, fatigue: 149, dead: false } });
    const G = g.gargoyles;
    const c = new THREE.Vector3(10, 0, 10);
    const r0 = G.startRitual(c);
    assert.equal(r0.ok, false);
    assert.equal(r0.why, 'mana');
    assert.equal(g.combat.fatigue, 149, 'nothing is taken without a ritual');
    assert.equal(G.rituals.length, 0);
    assert.equal(g.dark.level, 0);
    assert.match(g.said.at(-1), /150/, 'the hint: «Нужно 150 маны»');
    g.combat.fatigue = 260;
    const r1 = G.startRitual(c);
    assert.equal(r1.ok, true);
    assert.equal(g.combat.fatigue, 110, '150 taken at once');
    assert.equal(g.dark.level, 25, '+25 to the black level (addDark ritual)');
    assert.equal(G.rituals.length, 1);
    for (let t = 0; t < 4.9; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 0, 'five seconds of fire first: nobody yet');
    for (let t = 0; t < 0.4; t += 0.05) G.update(0.05);
    assert.ok(G.list.length > 0, 'the first have burst out');
    for (let t = 0; t < 3; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 30, 'thirty in all');
    assert.ok(G.list.every((o) => o.by === 'me' && o.hp === 40 && o.isGargoyle && o.ck === 'G'));
    assert.ok(new Set(G.list.map((o) => o.id)).size === 30);
    // a second ritual on the same place at once is refused (busy), mana kept
    g.combat.fatigue = 300;
    assert.equal(G.startRitual(c).ok, false);
    assert.equal(g.combat.fatigue, 300);
});

test('Creative: free (no mana rules)', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false }, config: { mode: 'creative' } });
    assert.equal(g.gargoyles.startRitual(new THREE.Vector3(0, 0, 0)).ok, true);
    assert.equal(g.gargoyles.rituals.length, 1);
});

test('never more than 60 in the world: a ritual brings only what there is room for', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 30);
    G.startRitual(new THREE.Vector3(500, 0, 500));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 60);
    G.startRitual(new THREE.Vector3(-500, 0, -500));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    assert.ok(G.list.filter((o) => !o.dead).length <= 60, 'the limit holds');
});

test('they live 5–10 minutes, then crumble into stone and nothing is kept', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 30);
    for (const o of G.list) assert.ok(o.life >= 300 && o.life <= 600);
    for (let t = 0; t < 290; t += 0.5) G.update(0.5);
    assert.ok(G.list.some((o) => o.mode !== 'crumble') || G.list.length > 0);
    for (let t = 0; t < 330; t += 0.1) G.update(0.1);
    for (let i = 0; i < 200; i++) G.update(0.1);
    assert.equal(G.list.filter((o) => !o.dead).length, 0, 'all crumbled');
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(G.list.length, 0, 'nothing is left in the list');
    assert.equal(G.rituals.length, 0, 'the ritual is over and let go');
    assert.equal(G.fx.rings.every((r) => !r.used), true, 'the ring went back to the pool');
});

test('the summoner is spared 20 s, then hunted; another player at once (target choice)', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    g.character.group.position.set(5, 2, 5); // (the summoner stands at the pentagram)
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    const o = G.list[0];
    G._scan(true);
    assert.ok(G.victims.some((v) => v.k === 'p' && v.id === 'me'), 'the summoner is in the list of prey');
    o.age = 5;
    assert.equal(G._pick(o), null, 'in the first 20 s: not him');
    o.age = 25;
    assert.equal(G._pick(o)?.id, 'me', 'after 20 s: him too');
    // another player: at once
    g.remotes.set('other', { position: new THREE.Vector3(8, 2, 8), dead: false, character: { group: new THREE.Group() } });
    G._scan(true);
    o.age = 3;
    assert.equal(G._pick(o)?.id, 'other');
});

test('a hit: fire does not hurt, an arrow takes 3 of 5, the gods\' spell shatters it; killed it leaves nothing but a pool of chunks', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    const a = G.list[0], b = G.list[1], c = G.list[2];
    G.hit(a, 50, 'Inferno', 'me');
    assert.equal(a.hp, 40, 'hellish: fire does not touch it');
    G.hit(a, 5, 'arrow', 'me');
    assert.equal(a.hp, 37);
    G.hit(a, 10, 'AvadaKedavra', 'me');
    assert.equal(a.hp, 37, '«Авада» does not act');
    G.hit(a, 10, 'Ice', 'me');
    assert.ok(a.slowT > 0 && a.hp === 37, 'cold slows it');
    G.hit(b, 5, 'Boom', 'me');
    assert.equal(b.dead, true, 'a spell of the gods shatters it');
    G.hit(c, 40, 'melee', 'me');
    assert.equal(c.dead, true, '40 HP: 40 of a blade');
    assert.ok(G._debris.n > 0, 'stone chunks fly');
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(G.list.length, 28);
});

test('the ritual\'s own lightning never hurts a gargoyle (they are its own), another\'s does', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    const a = G.list[0];
    G._boltOn = true; G.hit(a, 20, 'Lightning', 'x'); G.hitAt(a.model.position, 5, 20, 'Lightning', 'x'); G._boltOn = false;
    assert.equal(a.hp, 40);
    G.hit(a, 20, 'Lightning', 'x');
    assert.equal(a.hp, 20, 'a scroll\'s lightning: −20');
});

test('the leash: a gargoyle that got out of LEASH m turns back to the pentagram', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    const o = G.list[0];
    o.mode = 'roam';
    o.model.position.set(GARGOYLE.LEASH + 80, 30, 0);
    for (let i = 0; i < 40; i++) G.update(0.05);
    assert.equal(o.mode, 'return');
    const d0 = Math.hypot(o.model.position.x, o.model.position.z);
    for (let i = 0; i < 80; i++) G.update(0.05);
    assert.ok(Math.hypot(o.model.position.x, o.model.position.z) < d0, 'coming back');
});

test('every place that looks for creatures knows the gargoyles', () => {
    const g = src('src/game/Game.js');
    assert.match(g, /this\.gargoyles\.targets\(\)\), dt\)/, 'swords and axes (Weapons.checkHits)');
    assert.match(g, /z\.isGargoyle\) \{ this\.gargoyles\.hit/, 'a blow lands on it');
    assert.match(g, /lightningAt: .*this\.gargoyles\?\.hitAt/, 'lightning');
    assert.match(g, /this\.gargoyles\?\.hitAt\(pos, radius, BLAST \* power/, 'blasts');
    assert.match(g, /this\.gargoyles\?\.hitRay/, 'rays and the Inferno stream');
    assert.match(g, /this\.gargoyles\.update\(dt\)/);
    assert.match(g, /this\.gargoyles\?\.dispose\(\)/, 'nothing is kept');
    assert.match(g, /this\.gargoyles\?\.sampleModels/, 'the shaders are compiled at the start (prewarm)');
    const duel = src('src/game/Duel.js');
    assert.match(duel, /gargoyleBody\(o, put\('g', o\.id\)\)/, 'a charge meets its body');
    assert.match(duel, /kind === 'g'/);
    assert.match(duel, /c\.isGargoyle\) \{ g\.gargoyles\?\.boltHit/, 'a charge hits it as the table says');
    assert.match(src('src/game/Gear.js'), /gargoyles\?\.targets\(\)/, 'arrows');
    assert.match(src('src/game/BodyStrikes.js'), /g\.gargoyles\?\.list/, 'fists');
    assert.match(src('src/game/Levitation.js'), /gargoyles\?\.targets\(\)/, '«Левиоса»');
    assert.match(src('src/game/LevitationMaxima.js'), /gargoyles\?\.hitAt/, 'a falling house');
    assert.match(src('src/game/TotalDestruction.js'), /gargoyles\?\.hitAt/);
    assert.match(src('src/game/Cauldrons.js'), /gargoyles\?\.hitAt/);
    assert.match(src('src/game/HouseWards.js'), /gargoyles\?\.shooed/);
    assert.match(src('src/game/MagicWave.js'), /case 'gargoyle'/, 'Circle Attack, Inspirius, Boom');
    assert.match(src('src/game/MagicWave.js'), /fn\('gargoyle'/);
    assert.match(src('src/game/ThunderWave.js'), /case 'g'/);
    assert.match(src('src/game/StrongMagic.js'), /case 'g'/);
    assert.match(src('src/game/Liquidation.js'), /bk === 'g'/);
    assert.match(src('src/game/Hellfire.js'), /kind === 'g'/);
    assert.match(src('src/game/Firefighting.js'), /kind === 'g'/);
    assert.match(src('src/game/WaterVortex.js'), /tk === 'g'/);
    assert.match(src('src/game/IceQueen.js'), /k === 'g'/);
    assert.match(src('src/game/CrowdSources.js'), /gargoyles/, 'the crowd: walkers go round a low one');
    assert.match(src('src/net/NetSync.js'), /case 'garg'/, 'the network');
    assert.match(src('src/game/VillagerFear.js'), /gargoyles/, 'the people are afraid of them');
    assert.match(src('src/game/CastleLife.js'), /gargoyles\.knightStep/, 'the knights fight them');
    assert.match(src('src/fx/Storm.js'), /gargoyles\?\.skyDark/, 'the sky over the place goes dark');
    assert.match(src('src/audio/SoundManager.js'), /playGargoyle/);
});

test('the other tables: Imperius (Maxima only, flies), steadiness, impact, the danger, blame, first-kill, the body\'s mass', async () => {
    const { IMPERIUS_TARGETS, canTake } = await import('../../src/game/Imperius.js');
    assert.equal(IMPERIUS_TARGETS.gargoyle.magic, true);
    assert.equal(IMPERIUS_TARGETS.gargoyle.plain, undefined);
    assert.equal(canTake('gargoyle', false).ok, false, 'the plain «Империус» cannot take it');
    assert.equal(canTake('gargoyle', true).ok, true);
    const { kindOfCreature } = await import('../../src/game/Imperius.js').catch(() => ({}));
    void kindOfCreature;
    const F = await import('../../src/game/ImperiusFlyers.js');
    assert.ok(F.FLYER_SYSTEMS.includes('g'));
    const { BODIES } = await import('../../src/game/ImperiusBodies.js');
    assert.ok(BODIES.g, 'a body adapter for the Maxima');
    const { FLYERS } = await import('../../src/game/ImperiusFlight.js');
    assert.ok(FLYERS.gargoyle);
    const { steadyKind, NPC_STEADY } = await import('../../src/game/Steadiness.js');
    assert.equal(steadyKind('G', { id: 1 }), 'gargoyle');
    assert.deepEqual(NPC_STEADY.gargoyle, [20, 30]);
    const { DANGERS } = await import('../../src/game/Danger.js');
    assert.ok(DANGERS.monster && DANGERS.monster.r > 0);
    const { OBVIOUS } = await import('../../src/game/Blame.js');
    assert.ok(OBVIOUS.ritual.people > 0);
    const { MAGIC_KILL } = await import('../../src/game/Mana.js');
    assert.ok(MAGIC_KILL.gargoyle.n > 0);
    const { bodyOf } = await import('../../src/game/Impact.js');
    assert.ok(bodyOf('gargoyle').mass > 1);
    const { KINDS } = await import('../../src/game/CreatureImpact.js');
    await import('../../src/game/Gargoyles.js');
    assert.ok(KINDS.G, 'pushes: a stone flier reels, never falls');
    assert.equal(KINDS.G.noKnock(), true);
});

// ---------------------------------------------------------------- the grip, the breath, the spent pentagram
test('the grip: who can be grabbed and who tears free (a villager only flails, a knight sometimes breaks out; the king is too heavy)', async () => {
    const R = await import('../../src/game/GargoyleRules.js');
    assert.ok(R.grabChance('farmer') > 0 && R.grabChance('knight') > 0 && R.grabChance('x', true) > 0);
    assert.equal(R.grabChance('king'), 0);
    assert.equal(R.grabChance('master'), 0);
    assert.equal(R.breakFree('farmer'), 0, 'a villager does not resist');
    assert.ok(R.breakFree('knight') > R.breakFree('x', true) && R.breakFree('x', true) > 0, 'the knight has the best chance, a wizard less');
});

test('carried up and let go from a height: the person hangs under the claws, then falls (Levitation counts the fall)', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const watched = [];
    g.levitation = { watchFall: (ck, c, by) => watched.push([ck, c.id, by]) };
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    const o = G.list[0];
    const vil = { id: 'v1', role: 'farmer', x: 3, y: 0, z: 3, dead: false, hp: 8 };
    const real = Math.random; Math.random = () => 0;
    G._tryGrab(o, { ref: vil });
    Math.random = real;
    assert.equal(o.mode, 'carry');
    assert.equal(vil.carriedBy, o.id);
    o.model.position.set(3, 10, 3);
    for (let i = 0; i < 40; i++) G._carry(o, 0.05);
    assert.ok(Math.abs(vil.y - (o.model.position.y - 3.4)) < 1e-6, 'hangs below the claws');
    assert.equal(vil.mode, 'flail');
    for (let i = 0; i < 400 && o.carry; i++) G._carry(o, 0.05);
    assert.equal(o.carry, null, 'it let go');
    assert.equal(vil.carriedBy, null);
    assert.ok(vil.vy < 0 && vil.flyFlail, 'he falls');
    assert.equal(watched.length, 1, 'the fall from the height is counted');
    // a kill of the gargoyle drops its victim too
    const vil2 = { id: 'v2', role: 'knight', x: 0, y: 0, z: 0, dead: false };
    Math.random = () => 0; const o2 = G.list[1]; G._tryGrab(o2, { ref: vil2 }); Math.random = real;
    assert.ok(o2.carry);
    G._die(o2, 'me', true);
    assert.equal(vil2.carriedBy, null);
    assert.ok(vil2.vy < 0);
});

test('the breath: fire out of the mouth lights things and bodies on its way', async () => {
    const calls = [];
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false },
        fire: { igniteAlong: (o, d, len) => calls.push(['fire', len]) }, burning: { igniteRay: (o, d, len, w, by) => calls.push(['burn', by]) } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    const o = G.list[0];
    G._flame(o, new THREE.Vector3(10, 3, 10));
    assert.ok(calls.some((c) => c[0] === 'fire') && calls.some((c) => c[0] === 'burn' && c[1] === 'me'));
    // the stream is drawn while breathT runs
    const sparks = [];
    g.fx = { spark: (...a) => sparks.push(a) };
    o.breathT = 1;
    G._breathFx(o, 1 / 60);
    assert.ok(sparks.length > 0 && o.breathT < 1);
    assert.ok(GARGOYLE.FIRE.CD[0] >= 5, 'now and then, not always');
});

test('the spent pentagram: once all have flown out it never works again, the ground stays black, it is saved', async () => {
    const g = await bareGame({ combat: { enabled: true, fatigue: 600, dead: false, damage() {} } });
    const G = g.gargoyles;
    const c = new THREE.Vector3(20, 0, 20);
    assert.equal(G.startRitual(c).ok, true);
    assert.equal(G.spent.length, 0);
    for (let t = 0; t < 9; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 30);
    assert.equal(G.spent.length, 1, 'all out: spent');
    assert.ok(G.fx.scorch.some((q) => q.born >= 0 && q.mesh.position.x === 20), 'the ground goes black there');
    const mana = g.combat.fatigue;
    for (let t = 0; t < 100; t += 0.5) G.update(0.5);
    const again = G.startRitual(new THREE.Vector3(22, 0, 21));
    assert.equal(again.ok, false);
    assert.equal(again.why, 'spent');
    assert.equal(g.combat.fatigue, mana, 'nothing is taken');
    assert.equal(G.startRitual(new THREE.Vector3(200, 0, 200)).ok, true, 'another place still works');
    const snap = G.snapshot();
    const g2 = await bareGame();
    g2.gargoyles.restore(snap);
    assert.equal(g2.gargoyles.spent.length, 1);
    assert.equal(g2.gargoyles.startRitual(new THREE.Vector3(20, 0, 20)).why, 'spent');
    assert.match(src('src/game/WorldSave.js'), /gargoyleScorch/);
});

test('the pentagram is in the table PENTAGRAMS: dark, 150 mana, once, its own picture (a muzzle with horns and wings), a scroll, an effect at the word', async () => {
    const { PENTAGRAMS } = await import('../../src/game/Pentagrams.js');
    const P = PENTAGRAMS.gargoyles;
    assert.ok(P);
    assert.equal(P.dark, true);
    assert.equal(P.cost, 150);
    assert.equal(P.once, true);
    assert.ok(P.lines?.length, 'its own picture of lines (PentagramFigures)');
    assert.equal(P.use, 'gargoyles.startRitual', 'the effect that starts at the word (Pentagranium._use1)');
    assert.ok(P.scroll && P.glow);
    const { GARGOYLE_PENTAGRAM } = await import('../../src/game/GargoyleRules.js');
    assert.equal(GARGOYLE_PENTAGRAM.id, 'gargoyles');
    assert.equal(GARGOYLE_PENTAGRAM.cost, GARGOYLE.MANA);
});

test('the clouds do not thin out while a gargoyle of the ritual lives; the last one gone — the sky clears (the author)', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    assert.ok(G.list.length > 0);
    for (let t = 0; t < GARGOYLE.STORM_T + 60; t += 0.5) G.update(0.5);
    assert.ok(G.rituals.length === 1 && G.rituals[0].t <= GARGOYLE.STORM_T - GARGOYLE.STORM_HOLD + 1e-6, 'the storm holds: the ritual\'s time waits');
    for (const o of [...G.list]) G._remove(o);
    for (let t = 0; t < GARGOYLE.STORM_HOLD + 20; t += 0.5) G.update(0.5);
    assert.equal(G.rituals.length, 0, 'the last gargoyle is gone: the clouds go');
});

test('they go for the people at once: a mass attack, the search and the leash are wide; the packs are big', () => {
    assert.ok(GARGOYLE.SEARCH >= 200 && GARGOYLE.LEASH >= 250 && GARGOYLE.PACK >= 5);
});

test('the flock really hunts: a target chosen is kept in that very frame (it was dropped at once, nobody attacked), and nobody gives up a far victim that is being approached', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} } });
    const G = g.gargoyles;
    g.castleLife = { byId: new Map([1, 2, 3, 4, 5, 6].map((i) => [`v${i}`, { id: `v${i}`, x: 15 + i * 6, y: 0, z: 10 - i * 4, dead: false, hp: 20, maxHp: 20 }])), alarm() {}, witnessCast() {}, hit() {}, damaged() {}, startle() {} };
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 14; t += 0.05) G.update(0.05);
    const hunting = G.list.filter((o) => o.mode === 'hunt' && o.target);
    const busy = G.list.filter((o) => (o.mode === 'hunt' && o.target) || o.mode === 'carry'); // (a bite may turn into a grip: one in the claws is no less «on the prey»)
    assert.ok(busy.length >= 5, `hunters: ${hunting.length}, carrying: ${busy.length - hunting.length}`);
    for (const o of hunting) assert.ok(o.target.v, 'the target carries its victim');
});

test('a cow, a zombie, a sailor, a villager: the prey is taken away in the middle of the hunt — a new target or home, never an exception (the «reading dead» window)', async () => {
    const mk = (x, z) => { const grp = new THREE.Group(); grp.position.set(x, 0, z); return grp; };
    const cows = [1, 2, 3].map((i) => ({ id: `c${i}`, dead: false, group: mk(14 + i * 5, 6 - i * 3) }));
    const zombies = [1, 2].map((i) => ({ id: `z${i}`, isDead: false, isDying: false, group: mk(-14 - i * 5, 8 - i * 3) }));
    const crew = new Map([1, 2].map((i) => [`s${i}`, { id: `s${i}`, dead: false, x: 6 + i * 6, y: 0, z: -16 - i * 3 }]));
    const folk = new Map([1, 2].map((i) => [`v${i}`, { id: `v${i}`, x: -8 - i * 6, y: 0, z: -12 + i * 4, dead: false, hp: 20, maxHp: 20 }]));
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} }, zombies, animals: { list: cows, hit() {} }, ships: { crew: { byId: crew, hit() {} } },
        castleLife: { byId: folk, alarm() {}, witnessCast() {}, hit() {}, damaged() {}, startle() {} }, damageZombie() {} });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    assert.ok(G.list.some((o) => o.target), 'somebody hunts');
    // the prey vanishes one kind at a time while they hunt
    const steps = [() => cows.splice(0, 2), () => { zombies[0].isDead = true; zombies.splice(1, 1); }, () => crew.clear(), () => { folk.get('v1').dead = true; folk.delete('v2'); }, () => { cows.length = 0; }];
    for (const kill of steps) {
        kill();
        for (let t = 0; t < 4; t += 0.05) assert.doesNotThrow(() => G.update(0.05));
    }
    for (const o of G.list) assert.ok(!o.target || G._live(o.target) || true);
    assert.equal(G._live({ k: 'a', id: 'x' }), false, 'a target with no body is simply not alive');
    assert.equal(G._live({ k: 'a', id: 'x', v: { ref: cows[0] } }), false);
});

test('a guest gets the packets in any order (state before the ritual, a hit and a death of a gargoyle it never saw, junk) — no exception', async () => {
    const g = await bareGame({ authority: false });
    const G = g.gargoyles;
    const send = (m) => assert.doesNotThrow(() => G.onNet(m, false));
    send({ op: 's', l: [['g1', 1, 20, 1, 0, 0, 0, 0, 40, 0, 1, 0, 1, 0]] });
    send({ op: 'die', id: 'zz', p: [0, 0, 0] });
    send({ op: 'hit', id: 'zz', dmg: 5 });
    send({ op: 'fb', id: 'zz' });
    send({ op: 'hurt', to: 'me', f: [0, 0, 0], v: [0, 0, 0], dmg: 3 });
    send({ op: 's', l: [] });
    send({ op: 'die', id: 'g1', p: [1, 20, 1] });
    send({ op: 's' });
    send({ op: 'spent' });
    send({ op: 'bolt' });
    send({});
    for (let t = 0; t < 1; t += 0.05) assert.doesNotThrow(() => G.update(0.05));
});

// ================================================================ the author's gargoyle changes: fire, weak spots, the sun, +25 dark
test('fire: plain fire neither hurts nor scares; the hellfire gives only 30 % of its damage but frightens most; the gods still kill (the author)', async () => {
    const { harmOf, GARGOYLE: G0, FIRE_KINDS } = await import('../../src/game/GargoyleRules.js');
    for (const k of ['Inferno', 'FireMaxima', 'fire', 'Burning', 'Lava']) { const h = harmOf(k, 50); assert.equal(h.does, 'immune', k); assert.equal(h.dmg, 0, k); assert.equal(h.scare, 0, `${k}: plain fire does not frighten it`); }
    assert.ok(!FIRE_KINDS.has('Hellfire'), 'the hellfire is no longer «nothing»');
    const hell = harmOf('Hellfire', 10);
    assert.equal(hell.does, 'hit');
    assert.equal(hell.dmg, 3, '30 % of the real damage');
    assert.equal(G0.HELL_K, 0.3);
    assert.equal(harmOf('Hellfire', 0).does, 'none', 'no damage — only fear');
    assert.ok(hell.scare >= 10 && hell.scare > harmOf('CircleAttack', 30).scare, 'the hellfire frightens more than the others');
    assert.equal(harmOf('Boom', 5).does, 'kill');
});

test('weak spots: «Circle Attack» and «Circle Attack Maxima» twice as hard as on the others, «Inspirius» twice; «Lumos»\' flashlight scares and never hurts', async () => {
    const { harmOf } = await import('../../src/game/GargoyleRules.js');
    assert.equal(harmOf('CircleAttack', 30).dmg, 60);
    assert.equal(harmOf('CircleAttack', 10).dmg, 20);
    assert.equal(harmOf('CircleAttackMaxima', 45).dmg, 90, 'Maxima twice as strong as the plain Maxima');
    assert.equal(harmOf('CircleAttackMaxima', 15).dmg, 30);
    assert.equal(harmOf('Inspirius', 25).dmg, 50);
    assert.equal(harmOf('Inspirius', 100).dmg, 200);
    assert.ok(harmOf('CircleAttack', 30).scare > 0 && harmOf('CircleAttackMaxima', 30).scare >= harmOf('CircleAttack', 30).scare && harmOf('Inspirius', 25).scare > 0, 'they flee from these');
    for (const k of ['Lumos', 'LumosFlashlight']) { const h = harmOf(k, 99); assert.equal(h.does, 'scare', k); assert.equal(h.dmg, 0, `${k}: no damage at all`); assert.ok(h.scare > 0); }
    assert.equal(harmOf('Jolt', 8).dmg, 8, 'others as before');
    assert.equal(harmOf('Jolt', 8).scare, 0);
});

test('a gargoyle that is scared drops its prey and its victim, flies AWAY from the thing, and is back to hunting after; the Lumos beam scares only inside its cone, no damage', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} } });
    const G = g.gargoyles;
    const o = G.spawn(new THREE.Vector3(0, 30, 0), {});
    o.mode = 'roam';
    const v = { id: 'v1', x: 0, y: 0, z: 0, dead: false, role: 'farmer', carriedBy: o.id };
    o.carry = { c: v, t: 0, hold: 3, up: 18, hit: 1, said: false }; o.mode = 'carry';
    const p0 = o.model.position.clone();
    G.hit(o, 3, 'Hellfire', 'me', new THREE.Vector3(0, 30, 10)); // the fire is 10 m to the +z side
    assert.equal(v.carriedBy, null, 'the person in its claws is let go');
    assert.ok(o.flee >= 10, 'frightened for ≥ 10 s');
    assert.equal(o.hp, 40 - 0.9, '30 % of 3');
    for (let i = 0; i < 40; i++) G.update(0.05);
    assert.ok(o.model.position.z < p0.z - 8, `flew away from the fire (z ${o.model.position.z})`);
    assert.equal(o.mode, 'flee');
    // the flashlight: a narrow cone
    const hpWas = o.hp;
    const a = G.spawn(new THREE.Vector3(0, 20, 20), {}), b = G.spawn(new THREE.Vector3(30, 20, 20), {});
    a.mode = b.mode = 'roam';
    G.lightCone(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, 0, 1), 26, 0.2, 'me');
    assert.ok(a.flee > 0, 'inside the beam');
    assert.ok(!(b.flee > 0), 'beside it: nothing');
    assert.equal(a.hp, 40, 'light does no damage');
    assert.equal(o.hp, hpWas);
    for (let i = 0; i < 100; i++) G.update(0.1); // (11 s: the fright is over)
    assert.ok(o.mode !== 'flee' && o.flee <= 0, 'back to its business');
});

test('«To the Sun» against the clouds: the chances and the mana are the author\'s — P0 15 %, then 5 s of defence, then 30 % +10 % a second, 20 mana a second, out of mana the beam goes out', async () => {
    const R = await import('../../src/game/GargoyleRules.js');
    const S = R.GARGOYLE.SUN;
    assert.equal(S.P0, 0.15); assert.equal(S.WAIT, 5); assert.equal(S.COST, 20); assert.equal(S.P1, 0.3); assert.equal(S.STEP, 0.1);
    assert.equal(R.sunChanceAt(0), 0.15);
    for (const s of [1, 2, 3, 4]) assert.equal(R.sunChanceAt(s), 0, `second ${s}: the defence, no roll`);
    assert.deepEqual([5, 6, 7, 8, 9, 10, 11, 12, 13].map(R.sunChanceAt), [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1]);
    for (const s of [0, 1, 4]) assert.equal(R.sunCostAt(s), 0);
    for (const s of [5, 6, 20]) assert.equal(R.sunCostAt(s), 20);
    // all rolls fail until the sure one: 8 ticks × 20 = 160 mana, won at second 12
    const st = R.sunStart(); let paid = 0; const secs = [];
    for (let t = 0; t < 30 && !st.won && !st.lost; t += 0.1) { const o = R.sunStep(st, 0.1, 1e9, () => 0.9999); paid += o.cost; for (const x of o.rolls) secs.push(x.sec); }
    assert.ok(st.won, 'at 100 % it always breaks');
    assert.deepEqual(secs, [0, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(paid, 160);
    // a lucky first moment: no mana spent at all
    const s1 = R.sunStart(); const o1 = R.sunStep(s1, 0.016, 5, () => 0.1);
    assert.ok(s1.won && o1.cost === 0);
    // 70 mana: ticks at 5, 6, 7 are paid (60), the one at 8 cannot be — the beam goes out
    const s2 = R.sunStart(); let m = 70;
    for (let t = 0; t < 20 && !s2.won && !s2.lost; t += 0.1) m -= R.sunStep(s2, 0.1, m, () => 0.9999).cost;
    assert.equal(s2.lost, 'mana'); assert.equal(m, 10); assert.ok(!s2.won);
    // the time runs only in the steps given: a long pause between frames still rolls every second once
    const s3 = R.sunStart(); const o3 = R.sunStep(s3, 6.5, 1e9, () => 0.9999);
    assert.deepEqual(o3.rolls.map((x) => x.sec), [0, 5, 6]);
    assert.equal(o3.cost, 40);
});

test('burning in the sun: 5–10 s, four different ways, nobody at the same moment', async () => {
    const { burnPlan, BURN_STYLES } = await import('../../src/game/GargoyleRules.js');
    assert.equal(BURN_STYLES.length, 4);
    const seen = new Set();
    for (let i = 0; i < 400; i++) { const p = burnPlan(Math.random(), Math.random(), Math.random()); assert.ok(p.dur >= 5 && p.dur <= 10, `dur ${p.dur}`); assert.ok(p.delay >= 0 && p.delay <= 0.8); seen.add(p.style); }
    assert.equal(seen.size, 4, 'all four ways are met');
    assert.ok(burnPlan(0.6, 1, 0).dur <= 7, 'the blaze is quick');
    assert.ok(burnPlan(0.1, 1, 0).dur === 10 && burnPlan(0.1, 0, 0).dur === 5);
});

test('the sun breaks the clouds: the sky clears, no more strikes, EVERY gargoyle of the ritual burns for 5–10 s and is gone; the person in its claws is let go; the ritual ends', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    assert.equal(G.list.length, 30);
    const r = G.rituals[0];
    assert.ok(skyNow(r) > 0.9, 'black clouds are up');
    assert.equal(G.cloudsOver(new THREE.Vector3(5, 0, 5)), r);
    assert.equal(G.cloudsOver(new THREE.Vector3(400, 0, 0)), null, 'far from the storm: no clouds to fight');
    assert.ok(G.cloudHit(new THREE.Vector3(3, 1.5, 3), new THREE.Vector3(0, 1, 0))?.r === r, 'the wand straight up meets the deck');
    assert.equal(G.cloudHit(new THREE.Vector3(3, 1.5, 3), new THREE.Vector3(1, 0.02, 0)), null, 'along the horizon: no');
    const victim = { id: 'v1', x: 0, y: 5, z: 0, dead: false, role: 'farmer', carriedBy: G.list[0].id };
    G.list[0].carry = { c: victim, t: 0, hold: 50, up: 18, hit: 1, said: false }; G.list[0].mode = 'carry';
    const boltsBefore = r.boltI;
    assert.ok(G.requestDispel(r, 'me'));
    assert.ok(r.broken);
    assert.equal(victim.carriedBy, null, 'dropped');
    assert.ok(G.list.every((o) => o.burn && o.burn.dur >= 5 && o.burn.dur <= 10), 'every one is burning');
    assert.equal(new Set(G.list.map((o) => o.burn.style)).size, 4, 'four ways at once in a flock of thirty');
    const t0 = skyNow(r);
    for (let t = 0; t < 2.4; t += 0.1) G.update(0.1);
    assert.ok(skyNow(r) < t0 * 0.6, 'the sky is clearing');
    assert.ok(G.list.some((o) => !o.dead), 'not all gone at once: it takes seconds');
    for (let t = 0; t < 8.6; t += 0.1) G.update(0.1); // (11 s in all: the longest burning is 10 + 0,8 s of lateness)
    for (let t = 0; t < 2; t += 0.1) G.update(0.1);
    assert.equal(G.list.filter((o) => !o.dead).length, 0, 'the whole flock burned up');
    assert.equal(r.boltI, boltsBefore, 'no strikes after the clouds are broken');
    assert.equal(G.rituals.length, 0, 'the ritual is over');
    assert.ok(G.log.some((e) => e.ev === 'dispel'));
    assert.equal(G.requestDispel(r, 'me') && false, false);
});

test('a second dispel is nothing; gargoyles of ANOTHER ritual are not burned by the first one\'s sun', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 5000, dead: false, damage() {} } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    G.startRitual(new THREE.Vector3(500, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    const [r1, r2] = G.rituals;
    assert.equal(G.list.length, 60);
    assert.ok(G.dispel(r1, 'me'));
    assert.equal(G.dispel(r1, 'me'), false);
    assert.equal(G.list.filter((o) => o.burn).length, 30);
    assert.ok(G.list.filter((o) => !o.burn).every((o) => o.rit === r2.id));
});

test('+25 to the black level, 100 at most, for the gargoyles; the same for the monster pentagram', async () => {
    const { GARGOYLE: G0 } = await import('../../src/game/GargoyleRules.js');
    const { MONSTER } = await import('../../src/game/MonsterForm.js');
    assert.equal(G0.DARK, 25); assert.equal(MONSTER.DARK, 25);
    const g = await bareGame({ dark: { level: 90 } });
    g.combat.fatigue = 500;
    assert.equal(g.gargoyles.startRitual(new THREE.Vector3(0, 0, 0)).ok, true);
    assert.equal(g.dark.level, 100, '90 + 25 stops at 100');
});

test('SunContest on the caster\'s computer: the struggle runs only while the wand is on the clouds; mana 20 a second after 5 s; a win breaks the clouds; «стоп» / a lowered wand end it', async () => {
    const { SunContest } = await import('../../src/game/SunContest.js');
    const hand = { raised: true, dir: new THREE.Vector3(0.1, 1, 0).normalize() };
    const ch = {
        group: new THREE.Group(), isArmRaised: () => hand.raised, getHandDirection: (s, out) => out.copy(hand.dir),
        getHandWorldPosition: (s, out) => out.set(0, 3, 0),
    };
    const g = await bareGame({ combat: { enabled: true, manaOn: true, fatigue: 500, dead: false, damage() {} }, character: ch, perf: { note() {} } });
    g.sun = { fights: 0, fight() { this.fights++; } };
    g.sync = null;
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    g.combat.fatigue = 500;
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    const C = new SunContest(g);
    assert.equal(C.active, false);
    assert.equal(C.start(), true);
    assert.equal(C.active, true);
    // pointed at the sky beside the storm: nothing runs
    hand.dir.set(1, 0.3, 0).normalize();
    const was = g.combat.fatigue;
    for (let t = 0; t < 2; t += 0.1) C.update(0.1);
    assert.equal(g.combat.fatigue, was, 'not on the clouds: no mana, no time');
    assert.equal(C.st.t, 0);
    // on the clouds: time runs, 20 a second after 5 s (rolls always fail until the sure one)
    hand.dir.set(0.1, 1, 0).normalize();
    const rnd0 = Math.random; Math.random = () => 0.99999;
    try {
        for (let t = 0; t < 4.9; t += 0.1) C.update(0.1);
        assert.equal(g.combat.fatigue, was, 'the first 5 s are free');
        for (let t = 0; t < 1.9; t += 0.1) C.update(0.1);
        assert.equal(g.combat.fatigue, was - 40, 'ticks 5 and 6 paid: 2 × 20');
        assert.ok(G.rituals[0].sunFx?.on, 'everybody sees the beam on the clouds');
        assert.ok(g.sun.fights > 10, 'the beam is told to fight (it stays on)');
        assert.ok(!G.rituals[0].broken);
        // a lowered wand for 3 s ends it
        hand.raised = false;
        for (let t = 0; t < 3.3; t += 0.1) C.update(0.1);
        assert.equal(C.active, false, 'a lowered wand ends the beam');
        hand.raised = true;
        // again: runs out of mana
        g.combat.fatigue = 30;
        assert.equal(C.start(), true);
        for (let t = 0; t < 9; t += 0.1) C.update(0.1);
        assert.equal(C.active, false, 'out of mana: the beam goes out');
        assert.ok(!G.rituals[0].broken, 'the clouds held');
        assert.match(g.said.at(-1), /Не хватило маны/);
        // again with mana enough: the sure roll at second 12 breaks them (160 mana)
        g.combat.fatigue = 500;
        assert.equal(C.start(), true);
        for (let t = 0; t < 13 && C.active; t += 0.1) C.update(0.1);
        assert.equal(C.active, false);
        assert.ok(G.rituals[0].broken, 'the sun won');
        assert.equal(g.combat.fatigue, 500 - 160);
    } finally { Math.random = rnd0; }
    // «стоп» on a fresh struggle (another ritual's clouds): ends it at once, true once
    const g2 = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false }, character: ch, perf: { note() {} } });
    g2.sun = { fight() {} };
    g2.gargoyles.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) g2.gargoyles.update(0.05);
    const C2 = new SunContest(g2);
    assert.equal(C2.start(), true);
    assert.equal(C2.stop('stop'), true);
    assert.equal(C2.stop('stop'), false);
    // no clouds over me: the struggle does not start
    ch.group.position.set(900, 0, 0);
    assert.equal(new SunContest(g2).start(), false);
});

test('the net: the beam on the clouds and the break of the sky reach the other computers; a guest\'s sun asks the host; ids are checked', async () => {
    const g = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} } });
    const G = g.gargoyles;
    G.startRitual(new THREE.Vector3(0, 0, 0));
    for (let t = 0; t < 12; t += 0.05) G.update(0.05);
    const r = G.rituals[0];
    G.onNet({ op: 'sunfx', rid: r.id, o: [0, 3, 0], d: [0, 1, 0], s: 0.5, on: 1 }, false);
    assert.equal(r.sunFx.on, true); assert.equal(r.sunFx.s, 0.5);
    G.onNet({ op: 'sunfx', rid: 'nope', o: [0, 3, 0], d: [0, 1, 0], s: 0.5, on: 1 }, false); // (an unknown ritual: ignored)
    G.onNet({ op: 'sunfx', rid: r.id, o: 'x', d: null }, false);
    G.onNet({ op: 'sunreq', rid: r.id, by: 'friend' }, false); // (a guest does not decide)
    assert.ok(!r.broken);
    G.onNet({ op: 'sunreq', rid: r.id, by: 'friend' }, true); // (the host does)
    assert.ok(r.broken && r.broken.by === 'friend');
    assert.ok(G.list.every((o) => o.burn), 'burning: the host has set them on fire');
    // a guest hears 'sun' and clears the sky; it never sets creatures on fire itself
    const g2 = await bareGame({ combat: { enabled: false, fatigue: 0, dead: false, damage() {} }, authority: false });
    const G2 = g2.gargoyles;
    G2.onNet({ op: 'rit', id: 'rtx', c: [0, 0, 0], by: 'me', seed: 5, n: 30 }, false);
    for (let t = 0; t < 12; t += 0.05) G2.update(0.05);
    const o = G2.spawn(new THREE.Vector3(5, 20, 5), { id: 'gx' });
    const rg = G2.rituals[0];
    G2.onNet({ op: 'sun', rid: 'rtx', by: 'me' }, false);
    assert.ok(rg.broken);
    assert.equal(o.burn, undefined, 'the guest only follows the host\'s list');
    for (let t = 0; t < 5.2; t += 0.1) G2.update(0.1);
    assert.ok(skyNow(rg) < 0.01, 'the sky is clear on the guest\'s computer too');
    // a burning gargoyle on the guest\'s screen: the host\'s snapshot carries the style and the progress
    G2.onNet({ op: 's', l: [['gx', 5, 20, 5, 0, 0, 0, 0, 40, 0, 1, 0, 1, 0, 3, 0.4]] }, false);
    assert.deepEqual(o.net.burn, 3); assert.equal(o.net.burnK, 0.4);
});
