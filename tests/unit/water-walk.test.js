// «Aquambula» (WaterWalk.js): walking on the water — the numbers, the word, the floor, the concentration, the hooks, the scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WALK, waterFloor, lowManaWarn, WALK_TARGETS, WaterWalk } from '../../src/game/WaterWalk.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HELD, CONC_SPELLS } from '../../src/game/Concentration.js';
import { SPELL_RU } from '../../src/game/ItemTypes.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Aquambula» узнаётся, обычная речь его не колдует', () => {
    for (const w of ['Aquambula', 'аквамбула', 'аквамбулу', 'акваМбулла']) assert.equal(matchSpell(w), 'WaterWalk', w);
    for (const w of ['вода', 'аква', 'аквариум', 'акула', 'ходить по воде', 'ambulance']) assert.notEqual(matchSpell(w), 'WaterWalk', w);
});

test('цена: 50 маны сразу и 1 в секунду; удерживаемое (концентрация); только со свитка', () => {
    assert.equal(SPELL_COST.WaterWalk, 50);
    assert.equal(WALK.DRAIN, 1);
    assert.ok(HELD.WaterWalk && CONC_SPELLS.has('WaterWalk'), 'берёт концентрацию');
    assert.equal(SPELL_RU.WaterWalk, 'Aquambula');
});

test('пол из воды: поверхность, если она в пределах досягаемости ног (или чуть выше — пловца поднимает), иначе нет', () => {
    assert.equal(waterFloor(10, 10.5), 10);
    assert.equal(waterFloor(10, 10), 10);
    assert.equal(waterFloor(12, 10), 12, 'пловца поднимает к поверхности');
    assert.equal(waterFloor(10 + WALK.LIFT + 1, 10), null, 'слишком глубоко — ноги на дне');
    assert.equal(waterFloor(undefined, 10), null);
});

test('предупреждение о нехватке маны над глубокой водой — один раз', () => {
    assert.equal(lowManaWarn(5, true, false), true);
    assert.equal(lowManaWarn(5, true, true), false);
    assert.equal(lowManaWarn(5, false, false), false, 'не над глубиной — молчим');
    assert.equal(lowManaWarn(40, true, false), false);
    assert.equal(lowManaWarn(0, true, false), false);
});

function fakeGame(over = {}) {
    const ch = { group: { position: { x: 0, y: 1.95 + 5, z: 0 } }, onGround: true, _planar: { x: 0, z: 0 }, waterFloor: null, isArmRaised: () => false, flying: false };
    const said = [];
    const g = { character: ch, hud: { setVoice: (t) => said.push(t) }, perf: { note() {} }, combat: { dead: false, enabled: true, fatigue: 100, check: () => null, pay() { g.combat.fatigue -= 50; }, drain(a) { g.combat.fatigue -= a; return g.combat.fatigue > 0; } },
        swim: { waterAt: () => ({ surface: 5, depth: 6 }) }, sound: { playSpellFx() {} }, mana: { success() { g.first = true; } }, said, ...over };
    return g;
}

test('заклинание: включается (50 маны, Character.waterFloor), держится, тратит ману, «стоп» и мана отпускают', () => {
    const g = fakeGame();
    g.fx = null;
    const W = new WaterWalk(g);
    // нужна поднятая палочка (WandAim.castingHand): без неё — подсказка и ничего не списано
    assert.equal(W.cast(true), null); assert.equal(g.combat.fatigue, 100); assert.equal(W.on, false);
    W.set(true);
    assert.equal(W.on, true); assert.equal(typeof g.character.waterFloor, 'function');
    assert.equal(g.character.waterFloor(0, 0, 5.5), 5, 'пол — поверхность воды');
    W.update(1);
    assert.ok(Math.abs(g.combat.fatigue - 99) < 1e-9, 'по одной мане в секунду');
    assert.ok(g.first, 'первый настоящий шаг по воде засчитан');
    g.combat.fatigue = 0.5;
    W.update(1);
    assert.equal(W.on, false, 'мана кончилась — отпустило'); assert.equal(g.character.waterFloor, null);
    assert.match(g.said.at(-1), /Мана кончилась/);
    W.set(true); assert.equal(W.stop('stop'), true); assert.equal(W.stop('stop'), false);
});

test('смерть и полёт отпускают воду; плывущего (swimming) не держит, пока заклинание включено', () => {
    const g = fakeGame(); const W = new WaterWalk(g);
    W.set(true); g.combat.dead = true; W.update(0.1); assert.equal(W.on, false);
    const g2 = fakeGame(); const W2 = new WaterWalk(g2);
    W2.set(true); g2.flight = { active: true }; W2.update(0.1); assert.equal(W2.on, false);
});

test('подключено: пол в Character, не плывёт в Swimming, Game, концентрация, «стоп», сохранение не нужно', () => {
    assert.match(src('src/entities/Character.js'), /this\.waterFloor\(px, pz, reach\)/);
    assert.match(src('src/game/Swimming.js'), /!g\.waterWalk\?\.on/);
    const game = src('src/game/Game.js');
    assert.match(game, /this\.waterWalk = new WaterWalk\(this\)/);
    assert.match(game, /name === 'WaterWalk'\) return this\.waterWalk\.cast\(isFinal\)/);
    assert.match(game, /this\.waterWalk\?\.update\(dt\)/);
    assert.match(game, /this\.waterWalk\?\.stop\('stop'\)/);
    const conc = src('src/game/Concentration.js');
    assert.match(conc, /g\.waterWalk\?\.on\) return 'WaterWalk'/);
    assert.match(conc, /g\.waterWalk\?\.stop\?\.\('focus'\)/);
});

test('таблица «кто/что» заполнена для всех', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'ships', 'water', 'spells']) assert.ok(WALK_TARGETS[k]?.why, k);
});
