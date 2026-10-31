import { describe, it, expect } from 'vitest';
import { decide, MFEAR, dispelStep, noticeDelay, MONSTER_FEAR_TARGETS } from '../../src/game/MonsterFear.js';

const N = 10000;
const share = (mk, pick) => { let c = 0; for (let i = 0; i < N; i++) if (pick(decide(mk(i)))) c++; return c / N; };
const near = (x, t) => Math.abs(x - t) < 0.015;

describe('MonsterFear — кто бежит от монстра', () => {
    it('рыцари: 25% нападают, 75% бегут', () => {
        expect(near(share((i) => ({ id: 'k' + i, role: 'knight' }), (d) => d.act === 'fight'), 0.25)).toBe(true);
    });
    it('король и визирь всегда бегут', () => {
        expect(share((i) => ({ id: 'x' + i, role: 'king' }), (d) => d.act === 'flee')).toBe(1);
        expect(share((i) => ({ id: 'a' + i, role: 'advisor' }), (d) => d.act === 'flee')).toBe(1);
    });
    it('жители бегут все', () => {
        for (const role of ['farmer', 'builder', 'merchant']) expect(share((i) => ({ id: role + i, role }), (d) => d.act === 'flee')).toBe(1);
    });
    it('волшебники бегут: 90 / 70 / 45 / 0 %', () => {
        const w = (rank) => (i) => ({ id: rank + i, role: 'wizard', wizard: true, rank });
        expect(near(share(w('novice'), (d) => d.act === 'flee'), 0.9)).toBe(true);
        expect(near(share(w('adept'), (d) => d.act === 'flee'), 0.7)).toBe(true);
        expect(near(share(w('teacher'), (d) => d.act === 'flee'), 0.45)).toBe(true);
        expect(near(share(w('elder'), (d) => d.act === 'flee'), 0.45)).toBe(true);
        expect(share(w('master'), (d) => d.act === 'flee')).toBe(0);
    });
    it('знание «Nihilis Atra» (у не убежавших): среднему 35%, высокому 60%, младшему нет, главе всегда', () => {
        // знание считается независимо от бегства: считаем по всем, у кого d.dispel || бежит — смотрим долю знающих среди дерущихся
        const knows = (rank) => { let fight = 0, k = 0; for (let i = 0; i < 40000; i++) { const d = decide({ id: rank + i, role: 'wizard', wizard: true, rank }); if (d.act === 'fight') { fight++; if (d.dispel) k++; } } return fight ? k / fight : 0; };
        expect(Math.abs(knows('adept') - 0.35)).toBeLessThan(0.02);
        expect(Math.abs(knows('teacher') - 0.6)).toBeLessThan(0.02);
        expect(knows('novice')).toBe(0);
        expect(share((i) => ({ id: 'm' + i, role: 'master', wizard: true, rank: 'master' }), (d) => d.dispel && d.act === 'fight')).toBe(1);
    });
    it('решение одно и то же для одного существа (не мигает)', () => {
        const v = { id: 'knight-77', role: 'knight' };
        const a = decide(v);
        for (let i = 0; i < 50; i++) expect(decide(v).act).toBe(a.act);
    });
    it('реакция: маг — по рангу, остальные 0,4…1,4 с', () => {
        expect(noticeDelay({ id: 1, reactLag: { t: 3.3 } })).toBe(3.3);
        for (let i = 0; i < 200; i++) { const t = noticeDelay({ id: 'p' + i }); expect(t >= MFEAR.LAG_OTHER[0] && t <= MFEAR.LAG_OTHER[1]).toBe(true); }
    });
    it('рассеивание: нужна мана и палочка; подходит; ждёт поворота; говорит', () => {
        const base = { mana: 100, noWand: false, stunned: false, dist: 15, facing: true, cd: 0 };
        expect(dispelStep(base)).toBe('cast');
        expect(dispelStep({ ...base, mana: 10 })).toBe('no');
        expect(dispelStep({ ...base, noWand: true })).toBe('no');
        expect(dispelStep({ ...base, dist: 40 })).toBe('approach');
        expect(dispelStep({ ...base, facing: false })).toBe('wait');
        expect(dispelStep({ ...base, cd: 1 })).toBe('wait');
    });
    it('таблица «кто/что» заполнена', () => {
        for (const k of ['villagers', 'knights', 'king', 'wizards', 'animals', 'duel']) expect(MONSTER_FEAR_TARGETS[k].why.length).toBeGreaterThan(5);
    });
});
