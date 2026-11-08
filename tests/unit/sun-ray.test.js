// «Sun Ray» (SunRay.js, SunRayRules.js): the word, the price, the power by the planet's place, the charge, the beam's hits, the hooks, the temple's pedestal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { SUNRAY, sunPower, planetIndex, sunPowerAt, angleDeg, packPower, unpackPower, SUNRAY_TARGETS } from '../../src/game/SunRayRules.js';
import { SunRay } from '../../src/game/SunRay.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HELD, CONC_SPELLS } from '../../src/game/Concentration.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { PLANETS } from '../../src/world/Planets.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Sun Ray» («Сан Рей») узнаётся; соседние заклинания и речь — нет', () => {
    for (const w of ['Sun Ray', 'sunray', 'санрей', 'сан рей', 'Санрэй', 'сан рэй']) assert.equal(matchSpell(w), 'SunRay', w);
    for (const w of ['to the sun', 'ту зе сан', 'sands', 'санд', 'даст', 'ray', 'рей', 'привет']) assert.notEqual(matchSpell(w), 'SunRay', w);
    assert.equal(matchSpell('to the sun'), 'ToTheSun');
});

test('цена 500; удерживаемое (заряд в палочке; «Атак» разрешён); божественное; свиток — тринадцатый на постаменте', () => {
    assert.equal(SPELL_COST.SunRay, 500);
    assert.ok(HELD.SunRay && CONC_SPELLS.has('SunRay') && HELD.SunRay.own.includes('Attack'));
    assert.ok(GOD_SPELLS.has('SunRay'));
    assert.equal(TEMPLE_SCROLLS[12], 'SunRay');
    const plan = templePlan();
    assert.equal(plan.pedestals.length, TEMPLE_SCROLLS.length);
    const ps = plan.pedestals.find((p) => p.spell === 'SunRay');
    assert.ok(ps);
    for (const q of plan.pedestals) if (q !== ps) assert.ok(Math.hypot(q.x - ps.x, q.z - ps.z) >= 1.9, 'постаменты не слиплись: ' + q.spell);
});

test('сила: Меркурий 1000, Венера 800, Земля 600, Марс 400, Юпитер 200, дальше 0 («не достаёт до Солнца»); Луна — как Земля', () => {
    const list = PLANETS.map((p) => ({ ...p }));
    const at = (id) => sunPowerAt(list, id);
    assert.deepEqual(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].map(at), [1000, 800, 600, 400, 200, 0, 0, 0, 0]);
    assert.equal(at('moon'), 600, 'Луна — как Земля');
    assert.equal(at('nowhere'), 0);
    assert.equal(sunPower(0), 1000); assert.equal(sunPower(5), 0); assert.equal(sunPower(9), 0);
    // созданная планета встаёт в список по орбите: между Венерой и Землёй — всё после неё сдвигается
    const mine = [...list, { id: 'p1', kind: 'rocky', a: (list.find((p) => p.id === 'venus').a + list.find((p) => p.id === 'earth').a) / 2 }];
    assert.equal(planetIndex(mine, 'p1'), 2); assert.equal(sunPowerAt(mine, 'p1'), 600); assert.equal(sunPowerAt(mine, 'earth'), 400);
});

test('угол палочки к Солнцу; мощность едет в длине направления и читается обратно', () => {
    assert.ok(angleDeg({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }) < 1e-6);
    assert.ok(Math.abs(angleDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }) - 90) < 1e-6);
    for (const p of [0, 200, 400, 600, 800, 1000]) assert.equal(unpackPower(packPower(p)), p);
    assert.equal(unpackPower(packPower(600) + 0.0004), 600, 'пережило округление пакета');
    assert.ok(SUNRAY.REACH >= 300 && SUNRAY.CHARGE_T >= 2);
});

function fakeGame(over = {}) {
    const calls = [];
    const g = {
        calls, localId: 'me', remotes: new Map(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), authority: true,
        hud: { setVoice: (t) => calls.push(t) }, fx: null, sound: { playSpellFx() {}, playThunder() {} }, sync: { spell: () => calls.push('sync'), stopSpells: () => calls.push('sync-stop') },
        spells: { cast: (n) => calls.push('cast:' + n) },
        character: { group: { position: new THREE.Vector3(0, 10, 0) }, isArmRaised: () => true },
        combat: { check: () => null, pay: () => calls.push('pay') }, mana: { success: () => calls.push('first') },
        space: { realm: 'earth', offEarth: false },
        world: { trueSun: (o) => o.set(0, 0.8, 0.6).normalize() },
        hellGate: { inHell: false }, storm: { raining: false, k: 0 }, collision: { ceilingAt: () => Infinity },
        titans: { hit: (T, dmg, spell, by, kind) => calls.push(['titan', dmg, spell, kind]), byId: (id) => ({ id }) },
        zombieById: new Map(), castleLife: { alarm() {} },
        duel: { _bodies: () => [], _creature: () => null, applyToCreature: (...a) => calls.push(['burn', a[0], a[2]]) },
        ...over,
    };
    return g;
}

test('«Атак» без заряда — не наше (undefined: пусть идёт обычное «Атак»)', () => {
    const g = fakeGame(); const S = new SunRay(g);
    assert.equal(S.attack(true), undefined);
});

test('заклинание на Сатурне/в космосе/в аду — подсказка, мана цела', () => {
    const g = fakeGame({ space: { realm: 'saturn', offEarth: true, planets: { list: PLANETS.map((p) => ({ ...p })), get: () => ({}) }, localSun: () => new THREE.Vector3(0, 1, 0), now: () => 0 } });
    const S = new SunRay(g);
    // (castingHand needs a real wand: the hint paths before it are what is checked)
    assert.equal(S.powerHere(), 0);
    g.space.realm = 'space'; assert.equal(S.powerHere(), 0); assert.equal(S.cast(true), null);
    g.space.realm = 'mercury'; assert.equal(S.powerHere(), 1000);
    g.hellGate.inHell = true; assert.equal(S.cast(true), null);
    assert.ok(!g.calls.includes('pay'));
});

test('луч: хост жжёт титана уроном планеты, существ — дотла, игроков не трогает; не-хост сам не жжёт', () => {
    const g = fakeGame({ duel: { _bodies: () => [
        { kind: 'W', id: 't1', a: new THREE.Vector3(0, 0, 30), b: new THREE.Vector3(0, 40, 30), r: 9 },
        { kind: 'v', id: 'v1', a: new THREE.Vector3(0.5, 0, 12), b: new THREE.Vector3(0.5, 2, 12), r: 0.5 },
        { kind: 'p', id: 'friend', a: new THREE.Vector3(0, 0, 20), b: new THREE.Vector3(0, 2, 20), r: 0.5 },
        { kind: 'v', id: 'v2', a: new THREE.Vector3(60, 0, 20), b: new THREE.Vector3(60, 2, 20), r: 0.5 },
    ], _creature: () => ({}), applyToCreature: (...a) => g.calls.push(['burn', a[0], a[2]]) } });
    const S = new SunRay(g);
    const B = { by: 'me', o: new THREE.Vector3(0, 1, 0), d: new THREE.Vector3(0, 0, 1), power: 800 };
    S._damage(B);
    assert.ok(g.calls.some((c) => c[0] === 'titan' && c[1] === 800 && c[2] == null && c[3] === 'SunRay'), 'титан: урон 800, вид SunRay: ' + JSON.stringify(g.calls));
    assert.ok(g.calls.some((c) => c[0] === 'burn' && c[1] === 'Die'), 'житель сожжён');
    assert.equal(g.calls.filter((c) => c[0] === 'burn').length, 1, 'сожжён один: игрок не тронут, далёкий мимо');
    g.calls.length = 0; g.authority = false; S._damage(B);
    assert.equal(g.calls.length, 0, 'гость не решает');
});

test('таблица «кто/что», подключение: Game, сеть, концентрация, храм', () => {
    for (const [k, v] of Object.entries(SUNRAY_TARGETS)) assert.ok(v.does && v.why.length > 8, k);
    for (const k of ['titans', 'players', 'zombies', 'sun', 'space', 'hell']) assert.ok(SUNRAY_TARGETS[k], k);
    const game = src('src/game/Game.js'), net = src('src/net/NetSync.js'), conc = src('src/game/Concentration.js'), sm = src('src/fx/SpellManager.js');
    assert.match(game, /this\.sunRay = new SunRay\(this\)/);
    assert.match(game, /name === 'SunRay'\) return this\.sunRay\.cast\(isFinal\)/);
    assert.match(game, /name === 'Attack' && this\.sunRay\?\.charged/);
    assert.match(game, /sunRayFire: \(o, d, casterId, side\) =>/);
    assert.match(game, /this\.sunRay\?\.update\(dt\)/);
    assert.match(net, /g\.sunRay\?\.stopBy\(m\.by\)/);
    assert.match(conc, /g\.sunRay\?\.busy\) return 'SunRay'/);
    assert.match(sm, /case 'SunRayFire'/);
    assert.match(src('src/game/Titans.js'), /titanResist/);
});
