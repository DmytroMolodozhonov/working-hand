// «Axis» (TimeTurn.js): the word, the price, the turn's maths (the Earth and a planet), the animation's end state, the hooks, the temple's pedestal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { TURN, TURN_TARGETS, easeTurn, solveTurn, earthTurn, earthIsDay, TimeTurn } from '../../src/game/TimeTurn.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { spaceSpellBlock } from '../../src/game/Space.js';
import { hellSpellBlock } from '../../src/game/HellRules.js';
import { TEMPLE_SCROLLS } from '../../src/world/GodsTemple.js';
import { sunAt } from '../../src/world/World.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Axis» («Аксис») узнаётся; «Акцио» и речь — нет', () => {
    for (const w of ['Axis', 'аксис', 'Эксис']) assert.equal(matchSpell(w), 'Axis', w);
    for (const w of ['акцио', 'accio', 'привет', 'ось', 'аксиома', 'такси']) assert.notEqual(matchSpell(w), 'Axis', w);
    assert.equal(matchSpell('Акцио'), 'Accio');
});

test('цена 2000, божественное, свиток в храме; в космосе и в аду не колдуется', () => {
    assert.equal(SPELL_COST.Axis, 2000);
    assert.ok(GOD_SPELLS.has('Axis') && TEMPLE_SCROLLS.includes('Axis'));
    assert.match(spaceSpellBlock('Axis', 'space', 'space'), /суток/);
    assert.equal(spaceSpellBlock('Axis', 'earth', 'air'), null);
    assert.equal(spaceSpellBlock('Axis', 'mars', 'air'), null);
    assert.match(hellSpellBlock('Axis'), /суток нет/);
});

test('мягкий старт и конец: ease 0 → 0, 1 → 1, монотонно, плавно у краёв', () => {
    assert.equal(easeTurn(0), 0); assert.equal(easeTurn(1), 1); assert.equal(easeTurn(-3), 0); assert.equal(easeTurn(7), 1);
    let prev = 0;
    for (let u = 0; u <= 1; u += 0.02) { const e = easeTurn(u); assert.ok(e >= prev - 1e-12); prev = e; }
    assert.ok(easeTurn(0.05) < 0.01 && easeTurn(0.95) > 0.99, 'медленно трогается и мягко садится');
});

test('Земля: из любого часа дня — вперёд до глубокой ночи, из ночи — до полного дня; результат действительно ночь / день', () => {
    const v = new THREE.Vector3();
    for (let p = 0; p < 1; p += 0.025) {
        const day = earthIsDay(p), f = earthTurn(p, day);
        assert.ok(f != null && f > 0 && f <= 1, `phase ${p}: ${f}`);
        const e = sunAt(p + f, v);
        if (day) assert.ok(e <= TURN.NIGHT + 1e-6, `к ночи: ${e}`); else assert.ok(e >= TURN.DAY - 1e-6, `ко дню: ${e}`);
        assert.ok(f < 0.75, 'не больше трёх четвертей суток');
    }
});

test('solveTurn: ищет вперёд; нет решения — null', () => {
    assert.equal(solveTurn(() => 0.9, true), null, 'Солнце не заходит — ночи не будет');
    assert.equal(solveTurn(() => -0.9, false), null, 'не восходит');
    const f = solveTurn((x) => Math.cos(x * Math.PI * 2), true);
    assert.ok(f > 0.3 && f < 0.7);
});

function fakeGame() {
    const calls = [];
    const g = {
        calls, localId: 'me', dayStart: 1000000, scene: new THREE.Scene(),
        dayPhase() { return (((Date.now() - this.dayStart) / TURN.DAY_CYCLE_MS) % 1 + 1) % 1; },
        world: { setDayPhase: (p) => calls.push(['phase', p]) },
        hud: { setVoice: (t) => calls.push(t) }, fx: null, sound: { playSpellFx() {} }, mana: { success: () => calls.push('first') },
        space: { realm: 'earth', offEarth: false, planets: { get: () => null, bySlot: () => null } },
        hellGate: { inHell: false }, character: { group: { position: new THREE.Vector3() } },
    };
    return g;
}

test('анимация: за 10 с часы Земли уходят вперёд ровно на f суток и останавливаются; мир перерисовывается', () => {
    const g = fakeGame(); const T = new TimeTurn(g);
    const d0 = g.dayStart;
    T.start(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, 1, -1), 'me');
    assert.equal(T.anims.length, 1);
    let t = 0; while (T.turning && t < 30) { T.update(1 / 30); t += 1 / 30; }
    assert.ok(Math.abs(t - TURN.DUR) < 0.2, 'длится ~10 с: ' + t);
    assert.ok(Math.abs((d0 - g.dayStart) - 0.4 * TURN.DAY_CYCLE_MS) < 1, 'ровно 0,4 суток: ' + (d0 - g.dayStart));
    assert.ok(g.calls.some((c) => Array.isArray(c) && c[0] === 'phase'));
    assert.ok(g.calls.includes('first'), 'первая смена суток — ячейки маны');
    assert.equal(T.group.visible, false);
});

test('планета: вращение её собственное (spinShift в секундах её времени), чужие планеты не трогает', () => {
    const g = fakeGame();
    const mars = { id: 'mars', slot: 3, day: 88642 }, venus = { id: 'venus', slot: 1, day: -20000000 };
    g.space.planets = { get: (id) => (id === 'mars' ? mars : id === 'venus' ? venus : null), bySlot: (s) => (s === 3 ? mars : s === 1 ? venus : null) };
    g.space.realm = 'mars'; g.space.offEarth = true;
    const T = new TimeTurn(g);
    T.start(new THREE.Vector3(), new THREE.Vector3(0.25, -1, 3), 'me');
    for (let i = 0; i < 400; i++) T.update(1 / 30);
    assert.ok(Math.abs(mars.spinShift - 0.25 * 88642) < 1, 'Марс на четверть суток: ' + mars.spinShift);
    assert.equal(venus.spinShift, undefined, 'Венера не тронута');
    const before = g.dayStart;
    assert.equal(before, 1000000, 'часы Земли не тронуты');
    // ретроградная: сдвиг всё равно «вперёд по её времени» (секунды положительные)
    T.start(new THREE.Vector3(), new THREE.Vector3(0.1, 1, 1), 'me');
    g.space.realm = 'venus';
    for (let i = 0; i < 400; i++) T.update(1 / 30);
    assert.ok(venus.spinShift > 0 && Math.abs(venus.spinShift - 0.1 * 20000000) < 10, 'Венера: ' + venus.spinShift);
});

test('таблица «кто/что», подключение: Game, Space (вращение планеты), храм', () => {
    for (const [k, v] of Object.entries(TURN_TARGETS)) assert.ok(v.does && v.why.length > 8, k);
    const game = src('src/game/Game.js'), space = src('src/game/Space.js'), sm = src('src/fx/SpellManager.js');
    assert.match(game, /this\.timeTurn = new TimeTurn\(this\)/);
    assert.match(game, /name === 'Axis'\) return this\.timeTurn\.cast\(isFinal\)/);
    assert.match(game, /axis: \(o, d, casterId\) => this\.timeTurn\?\.start/);
    assert.match(game, /this\.timeTurn\?\.update\(dt\)/);
    assert.match(space, /def\.spinShift/);
    assert.match(sm, /case 'Axis'/);
});
