import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Game, READY } from '../../src/game/Game.js';

const make = (o = {}) => ({ world: { terrain: { settled: () => o.ground ?? true } }, _prewarmed: o.shaders ?? true, _calmFrames: o.calm ?? 30, perf: { note: mock.fn() }, ...o.extra });
const ask = (g, since = performance.now(), opts) => Game.prototype.readyToShow.call(g, since, opts);

describe('Game.readyToShow — экран загрузки закрывается, только когда игра готова', () => {
    it('всё готово — можно', () => assert.equal(ask(make()).ok, true));
    it('чанки ещё строятся — нельзя, и этап «Мир»', () => { const r = ask(make({ ground: false })); assert.equal(r.ok, false); assert.match(r.text, /^Мир/); });
    it('шейдеры не собраны — нельзя', () => assert.equal(ask(make({ shaders: false })).ok, false));
    it('кадры рваные (не 30 подряд) — нельзя', () => assert.equal(ask(make({ calm: READY.CALM_FRAMES - 1 })).ok, false));
    it('шкала растёт честно: 0 → 1', () => {
        assert.equal(ask(make({ ground: false, shaders: false, calm: 0 })).frac, 0);
        assert.ok(Math.abs(ask(make({ ground: true, shaders: false, calm: 0 })).frac - 1 / 3) < 1e-9);
        assert.equal(ask(make()).frac, 1);
    });
    it('тесты с программной отрисовкой не ждут плавности, но ждут мир', () => {
        assert.equal(ask(make({ calm: 0 }), performance.now(), { needCalm: false }).ok, true);
        assert.equal(ask(make({ calm: 0, ground: false }), performance.now(), { needCalm: false }).ok, false);
    });
    it('предохранитель: через 45 с закрывается и пишет в журнал, что не готово', () => {
        const g = make({ ground: false });
        const r = ask(g, performance.now() - (READY.MAX_S + 1) * 1000);
        assert.equal(r.ok, true);
        assert.match(r.why, /мир/);
        assert.equal(g.perf.note.mock.callCount(), 1);
        ask(g, performance.now() - (READY.MAX_S + 1) * 1000);
        assert.equal(g.perf.note.mock.callCount(), 1); // (once)
    });
});
