import { describe, it, expect } from 'vitest';
import { pickRevealTarget } from '../../src/game/RevealTarget.js';

const tip = { x: 0, y: 1.5, z: 0 }, fwd = { x: 0, y: 0, z: -1 };
const at = (x, y, z, extra = {}) => ({ pos: { x, y, z }, ...extra });

describe('Reveal: выбор цели', () => {
    it('вещь перед палочкой — она', () => {
        const a = at(0, 1.5, -2, { id: 'a' }), b = at(1.5, 1.5, 0, { id: 'b' });
        expect(pickRevealTarget(tip, fwd, [b, a]).thing.id).toBe('a');
    });
    it('вещь в другой руке — она (когда рядом больше ничего)', () => {
        const hand = at(0.4, 1.2, -0.1, { id: 'hand' });
        expect(pickRevealTarget(tip, fwd, [hand]).thing.id).toBe('hand');
    });
    it('вещь сбоку, палочка в пустоту — вещь рядом', () => {
        const side = at(1.5, 1, 0, { id: 'side' });
        expect(pickRevealTarget(tip, fwd, [side]).thing.id).toBe('side');
    });
    it('ничего рядом — нет вещи (останется своя палочка)', () => {
        expect(pickRevealTarget(tip, fwd, []).thing).toBe(null);
    });
    it('вещь далеко не по лучу — не цель и без подсказки «далеко»', () => {
        const r = pickRevealTarget(tip, fwd, [at(20, 1, 0), at(5, 1, 25, { run: true })]);
        expect(r.thing).toBe(null);
        expect(r.far).toBeUndefined();
    });
    it('бегущая книга далеко, но палочка на неё направлена — «далеко»', () => {
        const r = pickRevealTarget(tip, fwd, [at(0, 1.5, -40, { run: true })]);
        expect(r.thing).toBe(null);
        expect(r.far).toBeCloseTo(40, 0);
    });
});
