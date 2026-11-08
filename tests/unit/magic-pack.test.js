// Золотой магический рюкзак: «Акцио <вещь>», склад, отказы (MagicPack.js) + модель рюкзаков.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccioName, packAccepts, packPut, packFind, packTake, MAGIC_PACK } from '../../src/game/MagicPack.js';
import { newMagicBackpack, makeItemModel, describeItem, rollKeyItem } from '../../src/game/ItemTypes.js';
import { leatherOf, LEATHER } from '../../src/game/BackpackModel.js';

const it = (kind, extra = {}) => ({ kind, uid: 'u' + Math.random().toString(36).slice(2), ...extra });

test('«Акцио» + название: разбор фразы (и как его пишет распознавание)', () => {
    assert.deepEqual(parseAccioName('Акцио яйцо дракона'), { name: 'яйцо дракона' });
    assert.deepEqual(parseAccioName('акцио'), { name: '' });
    assert.equal(parseAccioName('акцию меч').name, 'меч');
    assert.equal(parseAccioName('ну акцио мне яблоко').name, 'яблоко');
    assert.equal(parseAccioName('привет мир'), null);
    assert.equal(parseAccioName('дай акцио'), null); // (слово заклинания внутри обычной речи — не наше)
});

test('склад: вещь кладётся, находится по названию и достаётся один раз', () => {
    const p = newMagicBackpack();
    const egg = it('dragonEgg', { of: 'green' }), apple = it('apple'), sword = it('weapon', { type: 'sword' });
    for (const x of [apple, egg, sword]) assert.ok(packPut(p, x));
    assert.equal(packFind(p, 'яйцо дракона'), egg);
    assert.equal(packFind(p, 'меч'), sword);
    assert.equal(packTake(p, 'яйцо дракона'), egg);
    assert.equal(packTake(p, 'яйцо дракона'), null, 'второй раз яйца уже нет — «такого предмета нет»');
    assert.equal(p.store.length, 2);
    assert.equal(packFind(p, 'кристалл маны'), null);
    assert.equal(packFind(p, ''), null, 'пустое название ничего не достаёт');
});

test('рюкзак в рюкзак не кладётся; предел вещей; обычный рюкзак ничего не принимает', () => {
    const p = newMagicBackpack();
    assert.equal(packAccepts(p, it('backpack')), false);
    assert.equal(packAccepts({ kind: 'backpack', slots: 4 }, it('apple')), false);
    for (let i = 0; i < MAGIC_PACK.CAP; i++) assert.ok(packPut(p, it('apple')));
    assert.equal(packPut(p, it('apple')), false, 'полный рюкзак отказывает (вещь остаётся у игрока)');
});

test('предмет: описание, цена, модель без картинок (в тесте нет холста)', () => {
    const p = newMagicBackpack();
    assert.equal(p.slots, 0);
    assert.match(describeItem(p).title, /Магический рюкзак/);
    const m = makeItemModel(p), o = makeItemModel({ kind: 'backpack', slots: 4, color: 0x123456, uid: 'x1' });
    let a = 0, b = 0;
    m.traverse(() => a++); o.traverse(() => b++);
    assert.ok(a > 25 && b > 25, `в моделях много деталей (${a}, ${b})`);
});

test('цвет кожи — из набора (кэш материалов не растёт от случайных цветов)', () => {
    for (let i = 0; i < 200; i++) assert.ok(LEATHER.includes(leatherOf(Math.floor(Math.random() * 0xffffff))));
});

// (the author 08.11: the magic backpack is hidden from the game for now — no chest gives one; MAGIC_PACK_ON brings it back)
test('в сундуках магический рюкзак скрыт (MAGIC_PACK_ON = false), обычные есть', () => {
    let n = 0, mag = 0;
    let s = 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 6000; i++) { const x = rollKeyItem(r); if (x.kind === 'backpack') { n++; if (x.magic) { mag++; assert.deepEqual(x.store, []); } } }
    assert.ok(n > 100 && mag === 0, `${mag} из ${n}`);
});
