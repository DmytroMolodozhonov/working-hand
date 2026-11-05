// Плашка варки (BrewBar.js): что она показывает по состоянию котла — нагрев растёт, ожидание ингредиентов и варка убывают; готовое/жижа — скрыта.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brewBarState } from '../../src/game/BrewBar.js';
import { newBrew } from '../../src/game/Potions.js';

test('варка: убывает и пишет «осталось 1:32»', () => {
    const st = { ...newBrew(), phase: 'brewing', dur: 120, t: 28 };
    const s = brewBarState(st, true);
    assert.equal(s.kind, 'brew'); assert.ok(Math.abs(s.k - 92 / 120) < 1e-9); assert.match(s.text, /1:32/);
    st.t = 119.2; assert.match(brewBarState(st, true).text, /1 с/);
});
test('ожидание остальных ингредиентов — убывает от окна; нагрев — растёт; пустое/готовое/жижа — без плашки', () => {
    const w = { ...newBrew(), phase: 'water', water: 6, ings: { apple: 1 }, win: 15 };
    const a = brewBarState(w, true, 30); assert.equal(a.kind, 'win'); assert.equal(a.k, 0.5); assert.match(a.text, /15 с/);
    const h = { ...newBrew(), phase: 'water', water: 6, heat: 0.4 };
    const b = brewBarState(h, true); assert.equal(b.kind, 'heat'); assert.equal(b.k, 0.4);
    assert.equal(brewBarState(h, false), null, 'без огня — нет нагрева');
    for (const ph of ['ready', 'sludge', 'empty', 'crumble']) assert.equal(brewBarState({ ...newBrew(), phase: ph }, true), null);
    assert.equal(brewBarState(null, true), null);
});
