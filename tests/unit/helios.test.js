// «Helios» (Helios.js): the gods' artificial Sun on a planet — the word, the price, the light, the concentration, the hooks, the temple's pedestal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { HELIOS, HELIOS_TARGETS, lightShare, sunSize, followStep, Helios } from '../../src/game/Helios.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HELD, CONC_SPELLS } from '../../src/game/Concentration.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { SPELL_RU } from '../../src/game/ItemTypes.js';
import { spaceSpellBlock } from '../../src/game/Space.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Helios» узнаётся; обычная речь и соседние заклинания — нет', () => {
    for (const w of ['Helios', 'гелиос', 'хелиос', 'Гелиас', 'хэлиос']) assert.equal(matchSpell(w), 'Helios', w);
    for (const w of ['привет', 'ад', 'hell', 'hellfire', 'хелло', 'гелий', 'гели']) assert.notEqual(matchSpell(w), 'Helios', w);
});

test('цена 500 + 3 в секунду; удерживаемое; божественное (свиток из Храма богов); имя', () => {
    assert.equal(SPELL_COST.Helios, 500);
    assert.equal(HELIOS.DRAIN, 3);
    assert.ok(HELD.Helios && CONC_SPELLS.has('Helios'));
    assert.ok(GOD_SPELLS.has('Helios'), 'заклинание богов');
    assert.equal(SPELL_RU.Helios, 'Helios');
    assert.equal(TEMPLE_SCROLLS[11], 'Helios');
});

test('только на планетах: на Земле и в космосе — отказ с причиной, на планете — можно', () => {
    assert.match(spaceSpellBlock('Helios', 'earth', 'air'), /Земле/);
    assert.match(spaceSpellBlock('Helios', 'space', 'space'), /планет/);
    for (const where of ['mercury', 'mars', 'venus', 'neptune']) assert.equal(spaceSpellBlock('Helios', where, where === 'mercury' ? 'none' : 'air'), null, where);
});

test('свет: полный до R_FULL, плавно к нулю у R_FADE; Солнце загорается и гаснет плавно', () => {
    assert.equal(lightShare(0), 1); assert.equal(lightShare(HELIOS.R_FULL), 1); assert.equal(lightShare(HELIOS.R_FADE), 0); assert.equal(lightShare(5000), 0);
    let prev = 1;
    for (let d = HELIOS.R_FULL; d <= HELIOS.R_FADE; d += 20) { const k = lightShare(d); assert.ok(k <= prev + 1e-9 && k >= 0); prev = k; }
    assert.equal(sunSize(0, null), 0);
    assert.ok(sunSize(HELIOS.IGNITE + 1, null) > 0.99, 'горит');
    assert.ok(sunSize(5, 0) > 0.99 && sunSize(5, HELIOS.FADE) === 0, 'гаснет за FADE');
    assert.ok(sunSize(5, HELIOS.FADE / 2) < 0.5 && sunSize(5, 0.3) > sunSize(5, 1.5), 'монотонно');
});

test('Солнце идёт за заклинателем не быстрее FOLLOW и не перелетает', () => {
    let [x, z] = [0, 0];
    for (let i = 0; i < 60; i++) [x, z] = followStep(x, z, 1000, 0, 1 / 30);
    assert.ok(x <= HELIOS.FOLLOW * 2 + 1e-6 && x > 10, 'за 2 с: ' + x);
    const [a, b] = followStep(5, 5, 5.2, 5, 1);
    assert.ok(a <= 5.2 + 1e-9 && b === 5);
    assert.deepEqual(followStep(3, 4, 3, 4, 0.1), [3, 4]);
});

function fakeGame() {
    const calls = [];
    return {
        calls, localId: 'me', remotes: new Map(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        hud: { setVoice: (t) => calls.push(t) }, fx: null, sound: null, sync: { stopSpells: () => calls.push('sync-stop') },
        character: { group: { position: new THREE.Vector3(100, 10, 50) }, isArmRaised: () => true },
        combat: { drain: () => true, enabled: true, fatigue: 500, check: () => null, pay: () => calls.push('pay') },
        space: { offEarth: true, realm: 'mercury', planets: new Map([['mercury', {}]]) }, mana: { success() {} },
    };
}

test('своё Солнце: lightAt даёт свет и направление К Солнцу; чужое тоже; погасло — света нет', () => {
    const g = fakeGame(); const H = new Helios(g);
    assert.equal(H.lightAt(100, 10, 50), null);
    H.fire({ x: 100, y: 8, z: 50 }, new THREE.Vector3(0, 1, 0), 'me', 'right');
    for (let i = 0; i < 200; i++) H.update(1 / 30);
    const L = H.lightAt(100, 10, 50);
    assert.ok(L && L.k > 0.99 && L.dir.y > 0.9, JSON.stringify(L));
    const far = H.lightAt(100 + HELIOS.R_FADE + 50, 10, 50);
    assert.equal(far, null, 'далеко — своего света планеты');
    g.remotes.set('b', { position: new THREE.Vector3(700, 10, 50) });
    H.fire({ x: 700, y: 8, z: 50 }, new THREE.Vector3(0, 1, 0), 'b', 'right');
    for (let i = 0; i < 200; i++) H.update(1 / 30);
    const L2 = H.lightAt(700, 10, 50);
    assert.ok(L2 && L2.k > 0.99 && L2.dir.x < 0.2, 'у второго — своё Солнце над ним');
    // «стоп» второго и своего
    H.stopBy('b'); H.stop('stop');
    for (let i = 0; i < 300; i++) H.update(1 / 30);
    assert.equal(H.suns.size, 0, 'оба погасли');
    assert.equal(H.on, false);
    assert.equal(H.lightAt(100, 10, 50), null);
});

test('своё Солнце гаснет, когда кончилась мана, а на Земле / в космосе — сразу', () => {
    const g = fakeGame(); const H = new Helios(g);
    H.fire({ x: 100, y: 8, z: 50 }, new THREE.Vector3(0, 1, 0), 'me', 'right');
    g.combat.drain = () => false;
    H.update(1 / 30);
    assert.equal(H.on, false, 'мана кончилась');
    assert.ok(g.calls.some((c) => /Мана кончилась/.test(c)));
    const g2 = fakeGame(); const H2 = new Helios(g2);
    H2.fire({ x: 0, y: 8, z: 0 }, new THREE.Vector3(0, 1, 0), 'me', 'right');
    g2.space.realm = 'earth'; g2.space.offEarth = false;
    H2.update(1 / 30);
    assert.equal(H2.on, false, 'на Земле нельзя держать');
});

test('cast: на Земле / в космосе — подсказка, мана не списана; на планете без поднятой руки — тоже', () => {
    const g = fakeGame(); const H = new Helios(g);
    g.space.realm = 'earth'; g.space.offEarth = false;
    assert.equal(H.cast(true), null); assert.ok(!g.calls.includes('pay'));
    g.space.realm = 'space'; g.space.offEarth = true;
    assert.equal(H.cast(true), null); assert.ok(!g.calls.includes('pay'));
});

test('таблица «кто/что» заполнена', () => {
    for (const [k, v] of Object.entries(HELIOS_TARGETS)) assert.ok(v.does && v.why.length > 8, k);
    for (const k of ['world', 'players', 'zombies', 'titans', 'earth', 'space', 'fire']) assert.ok(HELIOS_TARGETS[k], k);
});

test('подключено: Game, сеть, концентрация, небо планеты, титаны, постамент в храме', () => {
    const game = src('src/game/Game.js'), net = src('src/net/NetSync.js'), conc = src('src/game/Concentration.js'), space = src('src/game/Space.js'), tit = src('src/game/Titans.js');
    assert.match(game, /this\.helios = new Helios\(this\)/);
    assert.match(game, /name === 'Helios'\) return this\.helios\.cast\(isFinal\)/);
    assert.match(game, /helios: \(o, d, casterId, side\) => this\.helios\?\.fire/);
    assert.match(game, /this\.helios\?\.stop\('stop'\)/);
    assert.match(game, /this\.helios\?\.update\(dt\)/);
    assert.match(net, /g\.helios\?\.stopBy\(m\.by\)/);
    assert.match(net, /game\.helios\?\.stopBy\(id\)/);
    assert.match(conc, /g\.helios\?\.on\) return 'Helios'/);
    assert.match(space, /g\.helios\?\.lightAt/);
    assert.match(tit, /helios\?\.lightAt/);
    const plan = templePlan();
    assert.equal(plan.pedestals.length, TEMPLE_SCROLLS.length);
    assert.ok(plan.pedestals.some((p) => p.spell === 'Helios'));
    const ps = plan.pedestals.filter((p) => p.spell === 'Helios')[0];
    for (const q of plan.pedestals) if (q !== ps) assert.ok(Math.hypot(q.x - ps.x, q.z - ps.z) >= 1.9, 'постаменты не слиплись: ' + q.spell);
});
