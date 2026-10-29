// The bird of Spencer (SpencerBirds.js, SpencerRules.js, fx/InvisibleModels.js): invisible, rose-pink and glowing; born only near a hero who sees the
// invisible; killed — one invisible feather; «who / what» for every spell; the model's size and look; the market sells the feather.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { SpencerBirds, spencerBody } from '../../src/game/SpencerBirds.js';
import { SPENCER, verdict, GENTLE, DUEL_DEADLY, SPENCER_TARGETS } from '../../src/game/SpencerRules.js';
import { spencerBirdModel, poseSpencer, spencerMaterial, GHOST } from '../../src/fx/InvisibleModels.js';
import { wizardGood } from '../../src/game/WizardMarket.js';
import { BOSS_LINES } from '../../src/game/Invisibility.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

function world({ sees = true, authority = true, remotes = [] } = {}) {
    const added = new Set(), loose = [], said = [];
    const scene = { add: (o) => added.add(o), remove: (o) => added.delete(o) };
    const g = {
        scene, authority, localId: 'me', config: { mode: 'freeworld' }, duelOnly: false,
        sight: { sees }, remotes: new Map(remotes.map((r) => [r.id, r])), isDeadLocal: false, combat: { dead: false },
        character: { group: { position: new THREE.Vector3(0, 10, 0) } },
        collision: { groundY: () => 10 }, animals: { _floor: () => 10 },
        terrain: { data: { landMade: () => true, topLayer: () => 10, get: () => 0 } },
        items: { spawnLoose: (it, p, o) => loose.push({ it, p }) },
        hud: { setVoice: (t) => said.push(t) }, fx: { spark() {} }, sound: { playSpencer() {}, calls: 0 },
        world: { nightAmount: 0 }, sync: null, imperius: null,
    };
    return { g, added, loose, said };
}

test('the rules: tiny (3 HP), as many as the book-birds (4 near a hero, a try every 6 s), a feather when it dies', () => {
    assert.equal(SPENCER.HP, 3); assert.equal(SPENCER.NEAR, 4); assert.equal(SPENCER.SPAWN_T, 6); assert.equal(SPENCER.FEATHERS, 1);
    assert.equal(verdict('melee', 3), 'die'); assert.equal(verdict('arrow', 5), 'die'); assert.equal(verdict('Inferno', 3), 'die');
    assert.equal(verdict('melee', 1), 'hurt'); assert.equal(verdict('melee', 0), 'flee');
    for (const k of GENTLE) assert.equal(verdict(k, 40), 'flee', k + ' only startles');
    assert.ok(DUEL_DEADLY.has('AvadaKedavra') && !DUEL_DEADLY.has('Expelliarmus'));
    for (const k of ['melee', 'arrow', 'blast', 'fire', 'cold', 'lightning', 'duel', 'wind', 'levitation', 'water', 'imperius', 'brainrot', 'protection']) assert.ok(SPENCER_TARGETS[k]?.why, k);
});

test('born ONLY near a player who sees the invisible; never near one who does not', () => {
    const blind = world({ sees: false });
    const B0 = new SpencerBirds(blind.g);
    for (let i = 0; i < 40; i++) B0.update(1);
    assert.equal(B0.list.length, 0, 'nobody sees: no bird at all');
    const w = world({ sees: true });
    const B = new SpencerBirds(w.g);
    for (let i = 0; i < 80; i++) B.update(1);
    assert.ok(B.list.length >= 1 && B.list.length <= SPENCER.NEAR, `${B.list.length} birds near the seer`);
    for (const o of B.list) assert.ok(Math.hypot(o.model.position.x, o.model.position.z) < SPENCER.FORGET, 'near him');
});

test('a friend who sees (in a game with friends) is enough: the host makes birds round the friend, not round himself', () => {
    const w = world({ sees: false, remotes: [{ id: 'f', sees: true, position: new THREE.Vector3(400, 10, 0), dead: false }] });
    const B = new SpencerBirds(w.g);
    for (let i = 0; i < 80; i++) B.update(1);
    assert.ok(B.list.length >= 1);
    assert.ok(B.list.every((o) => Math.abs(o.model.position.x - 400) < SPENCER.FORGET), 'all round the friend');
});

test('drawn only for the one who sees: invisible to everybody else; see-through and shimmering for the one who does', () => {
    const w = world({ sees: false, remotes: [{ id: 'f', sees: true, position: new THREE.Vector3(20, 10, 0), dead: false }] }); // (a friend who sees keeps the bird in the world)
    const B = new SpencerBirds(w.g);
    const o = B.spawn(new THREE.Vector3(5, 14, 5));
    B.update(0.1);
    assert.equal(o.model.visible, false, 'invisible to me');
    w.g.sight.sees = true;
    B.update(0.1);
    assert.equal(o.model.visible, true, 'seen');
    const a = spencerMaterial().opacity;
    assert.ok(a > 0.79 && a < 0.91, 'about 85 %: ' + a);
    assert.equal(GHOST.ALPHA, 0.85);
    w.g.sight.sees = false; B.update(0.1);
    assert.equal(o.model.visible, false, 'lost the sight (a death): gone from my eyes at once');
});

test('far from every seer the birds are put away (nothing piles up); the seer dead — the same', () => {
    const w = world({ sees: true });
    const B = new SpencerBirds(w.g);
    const o = B.spawn(new THREE.Vector3(5, 14, 5));
    B.update(0.1); assert.equal(B.list.length, 1);
    w.g.character.group.position.set(2000, 10, 0);
    B.update(0.1); assert.equal(B.list.length, 0, 'left behind');
    w.g.character.group.position.set(0, 10, 0);
    B.spawn(new THREE.Vector3(5, 14, 5)); w.g.isDeadLocal = true; B.update(0.1);
    assert.equal(B.list.length, 0, 'no seer alive: no bird');
    void o;
});

test('killed: ONE feather, once (two blasts at once change nothing); the feather is a thing of the game', () => {
    const w = world({ sees: true });
    const B = new SpencerBirds(w.g);
    const o = B.spawn(new THREE.Vector3(5, 14, 5));
    B.hit(o, 3, 'melee', 'me');
    B.hit(o, 3, 'Bombardo', 'me');
    assert.equal(o.dead, true);
    assert.equal(w.loose.length, 1, 'one feather');
    assert.equal(w.loose[0].it.kind, 'spencerFeather'); assert.equal(w.loose[0].it.count, 1);
    assert.ok(w.said.some((t) => t.includes('перо')));
});

test('every harm: blasts, rays, arrows\' hits, duel charges, thunder kill; a gust and a lift only startle', () => {
    const w = world({ sees: true });
    const B = new SpencerBirds(w.g);
    const mk = () => { const o = B.spawn(new THREE.Vector3(5, 14, 5)); B.update(0.01); return o; };
    let o = mk(); B.hitAt(new THREE.Vector3(5, 14, 5), 3, 20, 'Bombardo', 'me'); assert.ok(o.dead, 'a blast');
    o = mk(); B.hitAt(new THREE.Vector3(60, 14, 5), 3, 20, 'Bombardo', 'me'); assert.ok(!o.dead, 'a far blast');
    const org = new THREE.Vector3(-5, 14, 5), d = new THREE.Vector3(1, 0, 0);
    assert.ok(B.hitRay(org, d, 30, 0.6, 5, 'Sapira', 'me'), 'a ray along it'); assert.ok(o.dead);
    o = mk(); B.boltHit(o, 'AvadaKedavra', 'me'); assert.ok(o.dead, 'a deadly charge');
    o = mk(); B.boltHit(o, 'Expelliarmus', 'me'); assert.ok(!o.dead && o.state === 'flee', 'a disarming charge: startled');
    o = mk(); B.hit(o, 40, 'Wind', 'me'); assert.ok(!o.dead && o.state === 'flee', 'a gust');
    o = mk(); B.hit(o, 0, 'Levitation', 'me'); assert.ok(!o.dead && o.state === 'flee', 'a lift slips');
    o = mk(); B.hit(o, 1, 'melee', 'me'); assert.ok(!o.dead && o.hp < 3, 'a weak blow hurts');
    const c = spencerBody(o); assert.ok(c.r > 0.2 && c.a.distanceTo(c.b) > 0.3);
});

test('a guest sends its harm to the host (the host decides); the host\'s list is followed by the guest', () => {
    const sent = [];
    const w = world({ sees: true, authority: false });
    w.g.sync = { net: { send: (m) => sent.push(m) } };
    const B = new SpencerBirds(w.g);
    B.onNet({ op: 's', l: [['b1', 3, 14, 3, 0, 0, 0, 1, 3]] }, false);
    assert.equal(B.list.length, 1);
    B.hit(B.list[0], 3, 'melee');
    assert.equal(sent.at(-1).t, 'spx'); assert.equal(sent.at(-1).op, 'hit'); assert.equal(B.list[0].dead, false, 'not dead until the host says');
    B.onNet({ op: 'die', id: 'b1', p: [3, 14, 3] }, false);
    assert.equal(B.list[0].dead, true);
    B.onNet({ op: 's', l: [] }, false);
    // (the host stops listing a bird: the guest drops its copy)
    const w2 = world({ sees: true, authority: false });
    const B2 = new SpencerBirds(w2.g);
    B2.onNet({ op: 's', l: [['x', 1, 14, 1, 0, 0, 0, 1, 3]] }, false); B2.onNet({ op: 's', l: [] }, false);
    assert.equal(B2.list.length, 0);
});

test('the model: anatomy and sizes (the hero is ~3.5 m, a block 1 m); pink; a halo; shared shapes', () => {
    const m = spencerBirdModel();
    poseSpencer(m, { mode: 'fly' }, 0.016);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > 0.9 && size.x < 1.6, 'wingspan ~1.1–1.5 m: ' + size.x);
    assert.ok(size.z > 1.0 && size.z < 2.0, 'with its long streamers ~1.5 m: ' + size.z);
    assert.ok(size.y > 0.4 && size.y < 1.0);
    let verts = 0, meshes = 0;
    m.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; } });
    assert.ok(verts > 3000, 'many fine details: ' + verts); assert.ok(meshes <= 5, 'few draw calls: ' + meshes);
    // pink: the vertex colours lean red-magenta (r high, g low, b mid)
    let r = 0, gg = 0, b = 0, n = 0;
    m.traverse((o) => { if (o.isMesh) { const c = o.geometry.attributes.color; for (let i = 0; i < c.count; i += 7) { r += c.getX(i); gg += c.getY(i); b += c.getZ(i); n++; } } });
    assert.ok(r / n > 0.75 && gg / n < 0.6 && b / n > 0.4 && b / n < 0.9, `rose: ${(r / n).toFixed(2)} ${(gg / n).toFixed(2)} ${(b / n).toFixed(2)}`);
    const m2 = spencerBirdModel();
    assert.equal(m.children[0].children[0].geometry, m2.children[0].children[0].geometry, 'shared shapes: every bird');
    assert.equal(spencerMaterial().transparent, true);
    assert.ok(spencerMaterial().emissiveIntensity >= 0.2 && spencerMaterial().emissive.r > 0.9, 'it glows rose (softer by day, stronger at night)');
    // the poses are different (perched wings fold)
    const wingFly = m.userData.wings[0].root.rotation.z;
    for (let i = 0; i < 40; i++) poseSpencer(m, { mode: 'perch', fold: undefined }, 0.05);
    assert.ok(m.userData.wings[0].root.rotation.z < wingFly - 0.5, 'folded on the perch');
});

test('the feather is sold in the market of magic things — rarely, at a sensible price', () => {
    let n = 0, total = 0;
    for (let i = 0; i < 4000; i++) { const g = wizardGood('curios', 2, i); total++; if (g?.item?.kind === 'spencerFeather') { n++; assert.ok(g.price >= 150 && g.price <= 400, 'price ' + g.price); } }
    assert.ok(n > 0, 'it is sometimes there'); assert.ok(n / total < 0.15, 'but rarely: ' + (n / total).toFixed(3));
});

test('the wiring: every place where spells look for targets knows the bird (the «who / what» of CLAUDE.md)', () => {
    const g = src('src/game/Game.js');
    assert.match(g, /this\.spencers\?\.hitAt\(pos, radius, BLAST \* power/, 'blasts');
    assert.match(g, /this\.spencers\?\.hitAt\(point, 3, LIGHTNING/, 'lightning');
    assert.match(g, /this\.spencers\?\.hitRay\(o, d, len, width/, 'rays (birdRay)');
    assert.match(g, /this\.spencers\?\.hitRay\(o, d, len, 0\.6, 3, 'Inferno'/, 'the Inferno stream');
    assert.match(g, /z\.isSpencer\) \{ this\.spencers\.hit/, 'a blow');
    assert.match(g, /this\.spencers\.targets\(\), this\.livingTrees\.targets\(\)/, 'swords and axes');
    assert.match(g, /consider\('sx'/, '«Брейнрот» says it does not act');
    assert.match(src('src/game/Gear.js'), /g\.spencers\?\.targets\(\)/, 'arrows');
    assert.match(src('src/game/BodyStrikes.js'), /g\.spencers\?\.list/, 'fists');
    assert.match(src('src/game/Levitation.js'), /g\.spencers\?\.targets\(\)/, '«Левиоса»');
    assert.match(src('src/game/Duel.js'), /g\.spencers\?\.targets\(\)[^]*spencerBody/, 'duel charges (bodies)');
    assert.match(src('src/game/Duel.js'), /c\.isSpencer\) \{ g\.spencers\?\.boltHit/, 'duel charges (the answer)');
    for (const [f, re] of [['ThunderWave', /spencers/], ['MagicWave', /spencers/], ['Liquidation', /spencers/], ['Hellfire', /spencers/], ['TotalDestruction', /spencers/], ['WaterVortex', /spencers/], ['Firefighting', /spencers/], ['StrongMagic', /spencers/], ['IceQueen', /spencers/], ['MonsterTransform', /spencers/]]) assert.match(src(`src/game/${f}.js`), re, f);
    assert.match(src('src/game/ImperiusFlyers.js'), /BODIES\.sx = spencers/, 'a mind can go into it («Империус Максима»)');
    assert.match(src('src/net/NetSync.js'), /case 'spx'/, 'the net');
    assert.ok(Array.isArray(BOSS_LINES));
});
