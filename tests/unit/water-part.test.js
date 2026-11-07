// «Aquadivide» (WaterPart.js): the water stands aside — the word, the price, the window geometry, the carving, the hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PART, PART_TARGETS, inWindow, turnAxis, windowCells, waterRun, WaterPart } from '../../src/game/WaterPart.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { HELD, CONC_SPELLS } from '../../src/game/Concentration.js';
import { SPELL_RU } from '../../src/game/ItemTypes.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Aquadivide» узнаётся, обычная речь и Aquambula — нет', () => {
    for (const w of ['Aquadivide', 'аквадивиде', 'аквадивайд', 'акводивиде']) assert.equal(matchSpell(w), 'WaterPart', w);
    for (const w of ['вода', 'аква', 'divide', 'разделить воду', 'Aquambula']) assert.notEqual(matchSpell(w), 'WaterPart', w);
    assert.equal(matchSpell('Aquambula'), 'WaterWalk');
});

test('цена: 300 маны сразу и 3 в секунду; концентрация; со свитка', () => {
    assert.equal(SPELL_COST.WaterPart, 300);
    assert.equal(PART.DRAIN, 3);
    assert.ok(HELD.WaterPart && CONC_SPELLS.has('WaterPart'));
    assert.equal(SPELL_RU.WaterPart, 'Aquadivide');
    assert.ok(PART.AHEAD <= 100 && PART.WIDTH >= 9, 'у моря есть граница, тропа не уже человека (3,5 м) ×2');
});

test('окно: впереди, сзади и по бокам — в пределах; дальше — вода', () => {
    // герой в (0,0), ось +x
    assert.ok(inWindow(0, 0, 1, 0, PART.AHEAD - 1, 0));
    assert.ok(!inWindow(0, 0, 1, 0, PART.AHEAD + 1, 0));
    assert.ok(inWindow(0, 0, 1, 0, -(PART.BEHIND - 1), 0));
    assert.ok(!inWindow(0, 0, 1, 0, -(PART.BEHIND + 1), 0), 'позади вода сомкнулась');
    assert.ok(inWindow(0, 0, 1, 0, 5, PART.WIDTH / 2 - 0.1));
    assert.ok(!inWindow(0, 0, 1, 0, 5, PART.WIDTH / 2 + 0.1));
    // повёрнутая ось: +z
    assert.ok(inWindow(0, 0, 0, 1, 0, 10) && !inWindow(0, 0, 0, 1, 10, 0));
});

test('клетки окна: все внутри окна, число ≈ площади, ограничено', () => {
    const cells = windowCells(100, 100, 0.6, 0.8);
    assert.ok(cells.length > 0);
    for (const c of cells) assert.ok(inWindow(100, 100, 0.6, 0.8, c.x, c.z));
    const area = PART.WIDTH * (PART.AHEAD + PART.BEHIND);
    assert.ok(cells.length > area * 0.85 && cells.length < area * 1.15, cells.length + ' vs ' + area);
    assert.ok(cells.length <= PART.MAX_COLS, 'одно окно не больше предела колонок');
});

test('ось поворачивается не быстрее предела и остаётся единичной', () => {
    const t = turnAxis(1, 0, 0, 1, 0.2);
    assert.ok(Math.abs(Math.atan2(t.az, t.ax) - 0.2) < 1e-9);
    assert.ok(Math.abs(Math.hypot(t.ax, t.az) - 1) < 1e-9);
    const u = turnAxis(1, 0, 1, 0, 0.5);
    assert.ok(Math.abs(u.ax - 1) < 1e-9);
    const w = turnAxis(-1, 0.001, 0, -1, 10); // через ±π
    assert.ok(Math.abs(w.ax) < 1e-6 && Math.abs(w.az + 1) < 1e-6);
});

function fakeData() {
    const m = new Map(); const k = (x, y, z) => x + ',' + y + ',' + z;
    return {
        m, bed: 0, refuse: new Set(),
        topLayer() { return this.bed; },
        landMade() { return true; },
        isSeaColumn() { return false; },
        get(x, y, z) { return m.get(k(x, y, z)) ?? (y <= this.bed ? BLOCK.STONE : BLOCK.AIR); },
        set(x, y, z, v) { if (this.refuse.has(x + ',' + z)) return; m.set(k(x, y, z), v); },
    };
}
function fakeGame(data) {
    const said = [];
    return {
        said, localId: 'me', remotes: new Map(), terrain: { data }, spells: { cast() {} },
        combat: { drain: () => true, fatigue: 500, enabled: true }, hud: { setVoice: (t) => said.push(t) },
        character: { group: { position: { x: 0, y: 12, z: 0 } }, isArmRaised: () => true },
        mana: { success() {} }, fx: null, sound: null, sync: { waterPartAxis() {}, stopSpells() {} },
    };
}
function lake(data, x0, x1, z0, z1, depth) { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 1; y <= depth; y++) data.m.set(x + ',' + y + ',' + z, BLOCK.WATER); }

test('вода в колонке: непрерывный столб над дном; нет воды — null', () => {
    const d = fakeData(); lake(d, 0, 0, 0, 0, 5);
    assert.deepEqual(waterRun(d, 0, 0), { bot: 1, top: 5 });
    assert.equal(waterRun(d, 1, 1), null);
});

test('раздвижка: вода уходит сверху вниз, дно остаётся; стоп — сомкнулась, лишнего не залито', () => {
    const d = fakeData(); lake(d, -30, 80, -10, 10, 6);
    const g = fakeGame(d); const W = new WaterPart(g);
    W.fire({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 'me', 'right');
    let now = performance.now();
    for (let i = 0; i < 40; i++) { now += 150; W._rescan(now); W._stepCols(now); }
    assert.equal(d.get(5, 3, 0), BLOCK.AIR, 'в полосе воды нет');
    assert.equal(d.get(5, 0, 0), BLOCK.STONE, 'дно на месте');
    assert.equal(d.get(5, 3, 8), BLOCK.WATER, 'за краем полосы вода стоит стеной');
    assert.equal(d.get(PART.AHEAD + 5, 3, 0), BLOCK.WATER, 'дальше предела — море');
    d.m.set('5,9,0', BLOCK.STONE); // брошенный в коридор камень
    W.stopBy('me');
    for (let i = 0; i < 40; i++) { now += 200; W._stepCols(now); }
    assert.equal(d.get(5, 3, 0), BLOCK.WATER, 'вода сомкнулась');
    assert.equal(d.get(5, 9, 0), BLOCK.STONE, 'чужое не затёрто');
    assert.equal(W.cols.size, 0, 'ничего не осталось');
});

test('идёт герой — позади закрывается, впереди открывается; два заклинателя — колонка держится, пока кому-то нужна', () => {
    const d = fakeData(); lake(d, -80, 120, -10, 10, 4);
    const g = fakeGame(d); const W = new WaterPart(g);
    W.fire({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 'me', 'right');
    let now = 1e6;
    const run = () => { for (let i = 0; i < 30; i++) { now += 150; W._rescan(now); W._stepCols(now); } };
    run();
    assert.equal(d.get(-10, 2, 0), BLOCK.AIR);
    W.parts.get('me').px = 60; run();
    assert.equal(d.get(-10, 2, 0), BLOCK.WATER, 'позади сомкнулась');
    assert.equal(d.get(100, 2, 0), BLOCK.AIR, 'впереди открылась');
    // второй игрок рядом с первым окном
    g.remotes.set('b', { position: { x: -5, z: 0 } });
    W.fire({ x: -5, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 'b', 'right');
    run();
    assert.equal(d.get(-10, 2, 0), BLOCK.AIR, 'нужна второму — открыта');
    W.stopBy('b'); run();
    assert.equal(d.get(-10, 2, 0), BLOCK.WATER);
});

test('земля Храма богов (set отказывает) — колонка не трогается и не мучается бесконечно', () => {
    const d = fakeData(); lake(d, -30, 80, -10, 10, 3); d.refuse.add('5,0');
    const g = fakeGame(d); const W = new WaterPart(g);
    W.fire({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 'me', 'right');
    let now = 1e6;
    for (let i = 0; i < 30; i++) { now += 150; W._rescan(now); W._stepCols(now); }
    assert.equal(d.get(5, 3, 0), BLOCK.WATER);
    assert.equal(d.get(6, 3, 0), BLOCK.AIR);
});

test('dispose возвращает всю воду', () => {
    const d = fakeData(); lake(d, -30, 80, -10, 10, 3);
    const g = fakeGame(d); const W = new WaterPart(g);
    W.fire({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 'me', 'right');
    let now = 1e6;
    for (let i = 0; i < 20; i++) { now += 150; W._rescan(now); W._stepCols(now); }
    W.dispose();
    for (let x = -10; x < 60; x++) for (let y = 1; y <= 3; y++) assert.equal(d.get(x, y, 0), BLOCK.WATER);
});

test('таблица «кто/что» заполнена, у каждого — причина', () => {
    for (const [k, v] of Object.entries(PART_TARGETS)) assert.ok(v.does && v.why && v.why.length > 8, k);
    for (const k of ['water', 'me', 'players', 'zombies', 'animals', 'ships', 'wards', 'gods', 'space']) assert.ok(PART_TARGETS[k], k);
});

test('подключено: Game, сеть, море, стоп, концентрация, свиток', () => {
    const game = src('src/game/Game.js'), net = src('src/net/NetSync.js'), conc = src('src/game/Concentration.js'), sea = src('src/fx/SeaSurface.js');
    assert.match(game, /this\.waterPart = new WaterPart\(this\)/);
    assert.match(game, /name === 'WaterPart'\) return this\.waterPart\.cast\(isFinal\)/);
    assert.match(game, /waterPart: \(o, d, casterId, side\) => this\.waterPart\?\.fire/);
    assert.match(game, /this\.waterPart\?\.stop\('stop'\)/);
    assert.match(game, /this\.waterPart\?\.update\(dt\)/);
    assert.match(net, /case 'wpat'/);
    assert.match(net, /g\.waterPart\?\.stopBy\(m\.by\)/);
    assert.match(conc, /g\.waterPart\?\.on\) return 'WaterPart'/);
    assert.match(sea, /setCuts\(list\)/);
    assert.match(src('src/game/ItemTypes.js'), /\['WaterPart', 1\.2\]/);
});
