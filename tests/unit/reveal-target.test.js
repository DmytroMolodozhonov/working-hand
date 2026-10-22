import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickRevealTarget } from '../../src/game/RevealTarget.js';

const tip = { x: 0, y: 1.5, z: 0 }, fwd = { x: 0, y: 0, z: -1 };
const at = (x, y, z, extra = {}) => ({ pos: { x, y, z }, ...extra });

describe('Reveal: выбор цели', () => {
    it('вещь перед палочкой — она', () => {
        const a = at(0, 1.5, -2, { id: 'a' }), b = at(1.5, 1.5, 0, { id: 'b' });
        assert.equal(pickRevealTarget(tip, fwd, [b, a]).thing.id, 'a');
    });
    it('вещь в другой руке — она (когда рядом больше ничего)', () => {
        const hand = at(0.4, 1.2, -0.1, { id: 'hand' });
        assert.equal(pickRevealTarget(tip, fwd, [hand]).thing.id, 'hand');
    });
    it('вещь сбоку, палочка в пустоту — вещь рядом', () => {
        const side = at(1.5, 1, 0, { id: 'side' });
        assert.equal(pickRevealTarget(tip, fwd, [side]).thing.id, 'side');
    });
    it('ничего рядом — нет вещи (останется своя палочка)', () => {
        assert.equal(pickRevealTarget(tip, fwd, []).thing, null);
    });
    it('вещь далеко не по лучу — не цель и без подсказки «далеко»', () => {
        const r = pickRevealTarget(tip, fwd, [at(20, 1, 0), at(5, 1, 25, { run: true })]);
        assert.equal(r.thing, null);
        assert.equal(r.far, undefined);
    });
    it('бегущая книга далеко, но палочка на неё направлена — «далеко»', () => {
        const r = pickRevealTarget(tip, fwd, [at(0, 1.5, -40, { run: true })]);
        assert.equal(r.thing, null);
        assert.ok(Math.abs(r.far - 40) < 0.5);
    });
});
