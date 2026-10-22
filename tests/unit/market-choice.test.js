// Buying at a counter: the merchant asks «which one?» and never guesses; the holograms over the goods.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseGood, labelGoods, askLine, leftToRight, nameScore, goodScore, describe, LABEL } from '../../src/game/MarketChoice.js';

// a counter long in x (5 × 2), the buyer stands at +z
const STALL = { counter: { x0: 0, x1: 5, z0: 0, z1: 2, top: 2 }, front: { x: 2.5, z: 6 } };
const good = (uid, item, price, x) => ({ uid, item, price, name: item.kind, pos: { x, y: 2, z: 1 } });
const wands = () => [good('a', { kind: 'wand' }, 100, 0.8), good('b', { kind: 'wand' }, 500, 2.5), good('c', { kind: 'wand' }, 900, 4.2)];

test('three wands + «палочку»: a question, nothing bought', () => {
    const r = chooseGood('палочку', wands(), STALL);
    assert.equal(r.good, undefined);
    assert.equal(r.ask.length, 3);
    assert.equal(askLine(r.ask, labelGoods(STALL, wands())), 'Какую именно — первую, вторую или третью?');
    for (const t of ['самую сильную палочку', 'среднюю палочку', 'вот эту']) assert.ok(!chooseGood(t, wands(), STALL)?.good, t);
});

test('the answer picks that very good (by uid, its own price)', () => {
    const goods = wands(), pend = ['a', 'b', 'c'];
    assert.equal(chooseGood('вторую', goods, STALL, pend).good.uid, 'b');
    assert.equal(chooseGood('вторую', goods, STALL, pend).good.price, 500);
    assert.equal(chooseGood('третью', goods, STALL, pend).good.uid, 'c');
    assert.equal(chooseGood('первую пожалуйста', goods, STALL, pend).good.uid, 'a');
    assert.equal(chooseGood('2', goods, STALL, pend).good.uid, 'b');
    assert.equal(chooseGood('три', goods, STALL, pend).good.uid, 'c');
    assert.equal(chooseGood('левую', goods, STALL, pend).good.uid, 'a');
    assert.equal(chooseGood('среднюю', goods, STALL, pend).good.uid, 'b');
    assert.equal(chooseGood('правую', goods, STALL, pend).good.uid, 'c');
    assert.deepEqual(chooseGood('ну не знаю', goods, STALL, pend).ask.map((g) => g.uid), pend, 'not understood: asks again, sells nothing');
    assert.equal(chooseGood('вторую палочку', goods, STALL).good.uid, 'b', 'the number said at once');
});

test('left to right is the buyer\'s: the buyer at -z sees x reversed; a counter long in z', () => {
    const goods = wands();
    assert.deepEqual(leftToRight(STALL, goods).map((g) => g.uid), ['a', 'b', 'c']);
    const back = { counter: STALL.counter, front: { x: 2.5, z: -6 } };
    assert.deepEqual(leftToRight(back, goods).map((g) => g.uid), ['c', 'b', 'a']);
    const tall = { counter: { x0: 0, x1: 2, z0: 0, z1: 5, top: 2 }, front: { x: 6, z: 2.5 } }; // buyer at +x faces -x: his right is -z
    const g2 = [1, 2, 3].map((n) => ({ uid: 'u' + n, item: { kind: 'wand' }, pos: { x: 1, z: n } }));
    assert.deepEqual(leftToRight(tall, g2).map((g) => g.uid), ['u3', 'u2', 'u1']);
});

test('labels: unique sorts by key name, repeats by number in the right gender, mixed counters each their own way', () => {
    const L = labelGoods(STALL, wands());
    assert.deepEqual([...L.values()].map((x) => x.text), ['Первая палочка', 'Вторая палочка', 'Третья палочка']);
    const armour = [good('h1', { kind: 'armor', piece: 'helmet' }, 1, 0.8), good('h2', { kind: 'armor', piece: 'helmet' }, 1, 2.5), good('l1', { kind: 'armor', piece: 'legs' }, 1, 4)];
    assert.deepEqual([...labelGoods(STALL, armour).values()].map((x) => x.text), ['Первый шлем', 'Второй шлем', 'Поножи']);
    const robes = [good('r1', { kind: 'robe' }, 1, 1), good('r2', { kind: 'robe' }, 1, 3)];
    assert.deepEqual([...labelGoods(STALL, robes).values()].map((x) => x.text), ['Первая мантия', 'Вторая мантия']);
    const mixed = [good('f', { kind: 'phoenixFeather' }, 380, 0.5), good('p1', { kind: 'potion', rec: 'heal' }, 50, 1.5), good('fl', { kind: 'flask' }, 15, 2.5), good('w', { kind: 'web' }, 150, 3.5), good('p2', { kind: 'potion', rec: 'invis' }, 350, 4.5)];
    assert.deepEqual([...labelGoods(STALL, mixed).values()].map((x) => x.text), ['Перо феникса', 'Первое зелье лечения', 'Колба', 'Паутина', 'Второе зелье невидимости']);
    const wm = [good('w1', { kind: 'wand' }, 1, 1), good('w2', { kind: 'wand' }, 1, 2), good('s', { kind: 'scroll' }, 1, 3)];
    assert.deepEqual([...labelGoods(STALL, wm).values()].map((x) => x.text), ['Первая палочка', 'Вторая палочка', 'Свиток']);
});

test('a unique good is bought by its key word without a question; a key label names its own good', () => {
    const goods = [good('f', { kind: 'phoenixFeather' }, 380, 1), good('p1', { kind: 'potion', rec: 'heal' }, 50, 2), good('w', { kind: 'web' }, 150, 3)];
    assert.equal(chooseGood('перо феникса', goods, STALL).good.uid, 'f');
    assert.equal(chooseGood('паутину', goods, STALL).good.uid, 'w');
    const kinds = ['wand', 'scroll', 'shield', 'bow', 'apple', 'redApple', 'meat', 'steak', 'book', 'arrows', 'bread', 'cheese', 'pie', 'wool', 'flask', 'potion', 'web', 'glass', 'crystal', 'phoenixFeather', 'owlFeather', 'minotaurHorn', 'robe'];
    for (const k of kinds) { const it = { kind: k }; assert.ok(nameScore(describe(it).name, it) > 0, `${k}: «${describe(it).name}» is understood`); }
    for (const piece of ['helmet', 'chest', 'legs']) { const it = { kind: 'armor', piece }; assert.ok(goodScore(describe(it).name, it) > 0, piece); }
    assert.equal(goodScore('шлем', { kind: 'armor', piece: 'legs' }), 0, '«шлем» does not name the leggings');
});

test('golden and plain apple: «яблоко» asks (no more «the cheaper»), «золотое яблоко» does not', () => {
    const goods = [good('r1', { kind: 'redApple' }, 2, 0.8), good('g', { kind: 'apple' }, 30, 2.5), good('r2', { kind: 'redApple' }, 2, 4.2)];
    assert.equal(chooseGood('яблоко', goods, STALL).good, undefined);
    assert.equal(chooseGood('золотое яблоко', goods, STALL).good.uid, 'g');
    assert.equal(askLine(chooseGood('яблоко', goods, STALL).ask, labelGoods(STALL, goods)), 'Какое именно — первое, второе или третье?');
});

test('label sizes (metres): readable from 3–4 m, clear of neighbours and the awning', () => {
    const card = { w: 0.46, h: 0.26 };
    const centre = LABEL.UP, bottom = centre - LABEL.H / 2, cardTop = card.h / 2;
    assert.ok(LABEL.W >= 1.0 && LABEL.W <= 1.4 && LABEL.H >= 0.25 && LABEL.H <= 0.35);
    assert.ok(centre >= 0.35 && centre <= 0.5, 'centre above the price card');
    assert.ok(bottom > cardTop, 'does not cover the card');
    assert.ok(1.7 > LABEL.W, 'three goods along a 5 m counter (step ~1.7 m) do not overlap');
    // highest case: a tall good (card centre 1.6 m over the counter at 2 m) — awning at 7 m
    assert.ok(2 + 1.6 + centre + LABEL.H / 2 < 7);
});
