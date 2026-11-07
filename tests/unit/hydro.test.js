/**
 * «Пентаграмма водяной силы» (Pentagranium Aquaris): hold LIQUID water at the stand (50 mana) → the water spells take their water from the air (not in a desert).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HYDRO, holdsLiquidWater, airWet } from '../../src/game/HydroRules.js';
import { PentagramHydro } from '../../src/game/PentagramHydro.js';
import { pentagramWords } from '../../src/game/PentagramWords.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import '../../src/game/PentagramRules.js';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('the name is heard, the pentagram is white, 50 mana, permanent, with a scroll', () => {
    assert.equal(pentagramWords('пентаграниум акварис'), 'hydro');
    assert.equal(pentagramWords('pentagranium aquaris'), 'hydro');
    const P = PENTAGRAMS.hydro;
    assert.ok(P, 'registered');
    assert.equal(P.dark, false);
    assert.equal(P.cost, HYDRO.COST);
    assert.equal(HYDRO.COST, 50);
    assert.equal(P.permanent, true);
    assert.match(src('src/game/ItemTypes.js'), /pent:hydro/);
});

test('liquid water counts; ice and nothing do not', () => {
    assert.equal(holdsLiquidWater({ ball: { frozen: false } }).ok, true);
    assert.equal(holdsLiquidWater({ storm: true }).ok, true);
    assert.equal(holdsLiquidWater({ wave: true }).ok, true);
    assert.equal(holdsLiquidWater({ vortex: { frozen: false } }).ok, true);
    assert.deepEqual(holdsLiquidWater({ ball: { frozen: true } }), { ok: false, why: 'ice' });
    assert.deepEqual(holdsLiquidWater({}), { ok: false, why: 'none' });
});

test('the air gives water on the Earth, not in a desert, not in hell, not in space', () => {
    assert.equal(airWet({}), null);
    assert.equal(airWet({ desert: true }), 'desert');
    assert.equal(airWet({ hell: true }), 'hell');
    assert.equal(airWet({ offEarth: true }), 'space');
});

function game(held = {}) {
    const said = [];
    const g = {
        combat: { fatigue: 80, _hudKey: 'x', dead: false }, hud: { setVoice: (t) => said.push(t) }, perf: { note() {} },
        water: held.ball ? { state: held.ball } : null, vortex: null, waterStorm: { busy: !!held.storm }, waves: null,
        collision: { groundY: () => 10 }, terrain: { data: { pyr: held.desert ? { sandy: () => true } : null } }, character: { group: { position: { x: 0, y: 12, z: 0 } } }, fx: null,
    };
    g.hydro = new PentagramHydro(g);
    return { g, said };
}
const ctx = (g, mana = 80, hints = []) => ({ m: { x: 0, y: 10, z: 0, r: 3 }, pays: true, mana, hint: (t) => hints.push(t), fx() {} });

test('standing in the circle without water, with ice, or without mana gives nothing and costs nothing', () => {
    let { g } = game();
    const hints = [];
    assert.equal(g.hydro.useCircle(ctx(g, 80, hints)), false);
    assert.equal(g.hydro.on, false);
    assert.equal(g.combat.fatigue, 80);
    ({ g } = game({ ball: { frozen: true } }));
    assert.equal(g.hydro.useCircle(ctx(g, 80, hints)), false);
    assert.ok(hints.some((h) => /лёд/.test(h)));
    ({ g } = game({ ball: { frozen: false } }));
    assert.equal(g.hydro.useCircle(ctx(g, 10, hints)), false, 'not enough mana');
    assert.equal(g.combat.fatigue, 80);
});

test('holding a liquid ball at the stand gives the gift for 50 mana; a second time is refused', () => {
    const { g } = game({ ball: { frozen: false } });
    assert.equal(g.hydro.useCircle(ctx(g)), true);
    assert.equal(g.hydro.on, true);
    assert.equal(g.combat.fatigue, 80 - HYDRO.COST);
    assert.equal(g.hydro.useCircle(ctx(g)), false);
    assert.equal(g.combat.fatigue, 30, 'nothing more is paid');
});

test('with the gift the spells get a stand-in water under the hand / ahead / for the storm; without it nothing', () => {
    let { g } = game({ ball: { frozen: false } });
    assert.equal(g.hydro.spring(0, 0, 14), null, 'no gift yet');
    g.hydro.useCircle(ctx(g));
    const s = g.hydro.spring(1, 2, 14);
    assert.ok(s && s.humid && s.x === 1 && s.z === 2 && s.y >= 10 + HYDRO.RAISE_FLOOR - 1e-6 && s.y <= 14);
    const p = g.hydro.point({ x: 0, y: 12, z: 0 }, { x: 0, y: 0, z: 1 });
    assert.ok(p && p.z > 3);
    const w = g.hydro.stormWater(20);
    assert.equal(w.count, 20);
    assert.equal(w.list.length, 20);
    assert.ok(w.list.every((e) => e === null));
});

test('in a desert the gift gives no water (and says why)', () => {
    const { g, said } = game({ ball: { frozen: false }, desert: true });
    g.hydro.on = true;
    assert.equal(g.hydro.spring(0, 0, 14), null);
    assert.equal(g.hydro.point({ x: 0, y: 12, z: 0 }, { x: 0, y: 0, z: 1 }), null);
    assert.equal(g.hydro.stormWater(20), null);
    assert.ok(said.some((t) => /сухо/.test(t)));
});

test('death takes the gift; the record brings it back', () => {
    const { g } = game();
    g.hydro.on = true;
    const rec = g.hydro.snapshot();
    assert.deepEqual(rec, { h: 1 });
    g.hydro.onDeath();
    assert.equal(g.hydro.on, false);
    assert.equal(g.hydro.snapshot(), null);
    g.hydro.restore(rec);
    assert.equal(g.hydro.on, true);
});

test('the water spells are wired to it (Waterbollow, Wave Attack, Water Vortex, the storm) and the gift is saved', () => {
    assert.match(src('src/game/WaterMagic.js'), /hydro\?\.spring/);
    assert.match(src('src/game/Game.js'), /hydro\?\.point\(o, d\)/);
    assert.match(src('src/game/WaterVortex.js'), /hydro\?\.point\(o, d\)/);
    assert.match(src('src/game/WaterStorm.js'), /hydro\.stormWater/);
    assert.match(src('src/game/Legacy.js'), /hydro/);
    assert.match(src('src/game/WorldSave.js'), /hydro/);
    assert.match(src('src/game/Pentagranium.js'), /m\.pent === 'hydro'/);
});
