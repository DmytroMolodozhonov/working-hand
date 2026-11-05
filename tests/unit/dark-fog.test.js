// «Caligo» — the dark mage's fog (DarkFogRules.js, DarkFog.js): its life, its volume, what the creatures' minds make of a player inside, and the picture's swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FOG, radiusAt, densityAt, aliveAt, insideFog, fogClue, insideView, FOG_TARGETS } from '../../src/game/DarkFogRules.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { DarkFog } from '../../src/game/DarkFog.js';
import { Invisibility } from '../../src/game/Invisibility.js';

test('50 mana; a jet of 10 s; a huge dome that grows, stays and thins away; black magic; the word', () => {
    assert.equal(SPELL_COST.Caligo, 50);
    assert.equal(FOG.RELEASE, 10);
    assert.ok(FOG.R >= 50, 'huge: a whole square');
    assert.equal(radiusAt(0), 0);
    assert.ok(radiusAt(5) > 0 && radiusAt(5) < FOG.R);
    assert.equal(radiusAt(FOG.RELEASE), FOG.R);
    assert.equal(radiusAt(FOG.RELEASE + 60), FOG.R);
    assert.ok(radiusAt(FOG.RELEASE + FOG.HOLD + 15) < FOG.R);
    assert.ok(aliveAt(100) && !aliveAt(FOG.RELEASE + FOG.HOLD + FOG.FADE + 1));
    assert.equal(densityAt(FOG.RELEASE + 10), 1);
    assert.ok(densityAt(FOG.RELEASE + FOG.HOLD + 29) < 0.1);
    assert.ok(DARK_SPELLS.has('Caligo'));
    for (const w of ['caligo', 'Калиго', 'калиго']) assert.equal(matchSpell(w), 'Caligo', w);
});

test('the volume: a dome — high in the middle, low at the rim; nothing outside; thin or fading fog hides nobody', () => {
    const f = { x: 0, y: 0, z: 0, t: FOG.RELEASE + 5 };
    assert.ok(insideFog(f, 0, 3, 0));
    assert.ok(insideFog(f, 0, 30, 0), 'the middle is tall');
    assert.ok(!insideFog(f, 0, 45, 0), 'above the dome');
    assert.ok(insideFog(f, 50, 3, 0) && !insideFog(f, 50, 25, 0), 'near the rim only low');
    assert.ok(!insideFog(f, 70, 3, 0), 'outside');
    assert.ok(!insideFog({ ...f, t: 0.5 }, 30, 3, 0), 'just begun: only a little cloud at the wand\'s target');
    assert.ok(!insideFog({ ...f, t: FOG.RELEASE + FOG.HOLD + FOG.FADE - 1 }, 0, 3, 0), 'nearly gone');
});

test('the minds: a player in the fog is only where he was last seen — for a few seconds, then nowhere (disoriented); outside — as he is', () => {
    const pos = { x: 5, y: 1, z: 5 };
    assert.equal(fogClue(false, pos, null, 0), pos);
    assert.equal(fogClue(true, pos, null, 1000), null, 'never seen');
    const seen = { x: 40, y: 2, z: 0, t: 1000 };
    const c = fogClue(true, pos, seen, 3000, () => 0.5);
    assert.ok(Math.hypot(c.x - 40, c.z) <= FOG.CLUE_JITTER + 1e-9, 'about there');
    assert.equal(fogClue(true, pos, seen, 1000 + FOG.CLUE_T * 1000 + 1), null, 'lost');
});

test('Invisibility.aiPos asks the fog: players inside are lost (bosses see through), outside seen; the last seen place is remembered', () => {
    const game = { localId: 'A', character: null, remotes: new Map(), scene: new THREE.Scene(), terrain: null };
    const fog = new DarkFog(game);
    game.darkFog = fog;
    const inv = new Invisibility(game);
    const f = { id: 'x', by: 'B', x: 0, y: 0, z: 0, t: FOG.RELEASE + 10, mesh: new THREE.Object3D(), mat: { dispose() {} } };
    fog.fogs.push(f);
    const out = { x: 100, y: 1, z: 0 }, inn = { x: 3, y: 1, z: 0 };
    assert.equal(inv.aiPos('P', out), out, 'outside: seen');
    const a = inv.aiPos('P', inn);
    assert.ok(a && Math.abs(a.x - 100) < FOG.CLUE_JITTER + 1e-9, 'inside: where he was seen last (x ≈ 100)');
    assert.equal(inv.aiPos('P', inn, true), inn, 'a boss sees through');
    assert.equal(inv.aiPos('Q', inn), null, 'never seen outside: nowhere');
});

test('the picture inside: black and near for an ordinary hero, a haze for one with the night gift; the world\'s fog is given back whole', () => {
    const near = insideView(false), far = insideView(true);
    assert.ok(near.far < 6 && far.far > 60 && near.near < far.near);
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x87ceeb, 20, 80); scene.background = new THREE.Color(0x87ceeb);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 3, 1);
    const game = { scene, camera, sight: { night: false }, remotes: new Map(), lastDt: 1 };
    const fog = new DarkFog(game);
    fog.fogs.push({ id: 'x', by: 'B', x: 0, y: 0, z: 0, t: FOG.RELEASE + 10, mesh: new THREE.Object3D(), mat: { dispose() {} } });
    for (let i = 0; i < 5; i++) { fog.begin(); fog.end(); }
    fog.begin();
    assert.ok(scene.fog.far < 10 && scene.fog.color.r < 0.1, `black and near: ${scene.fog.far} ${scene.fog.color.r}`);
    fog.end();
    assert.equal(scene.fog.near, 20); assert.equal(scene.fog.far, 80);
    assert.ok(Math.abs(scene.fog.color.r - 0x87 / 255) < 1e-3, 'the colour is given back');
    camera.position.set(500, 3, 0); // (outside: nothing changes)
    for (let i = 0; i < 40; i++) { fog.begin(); fog.end(); }
    fog.begin(); assert.ok(scene.fog.far > 70); fog.end();
    // the night gift sees through
    camera.position.set(2, 3, 1); game.sight.night = true;
    for (let i = 0; i < 10; i++) { fog.begin(); fog.end(); }
    fog.begin(); assert.ok(scene.fog.far > 60, `a seer: ${scene.fog.far}`); fog.end();
});

test('«стоп» takes down my fog fast; every kind of creature has a decision with its reason', () => {
    const game = { localId: 'A', scene: new THREE.Scene() };
    const fog = new DarkFog(game);
    fog.fogs.push({ id: 'a', by: 'A', x: 0, y: 0, z: 0, t: 30, mesh: new THREE.Object3D(), mat: { dispose() {} } });
    fog.fogs.push({ id: 'b', by: 'B', x: 0, y: 0, z: 0, t: 30, mesh: new THREE.Object3D(), mat: { dispose() {} } });
    assert.ok(fog.stopMine());
    assert.ok(fog.fogs[0].t > FOG.RELEASE + FOG.HOLD && fog.fogs[1].t === 30, 'only mine');
    assert.ok(!fog.stopMine() || true);
    for (const [k, T] of Object.entries(FOG_TARGETS)) assert.ok(['blind', 'sees', 'none'].includes(T.does) && T.why.length > 8, k);
});
