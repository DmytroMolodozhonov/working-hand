// «Tornado» (the author 05.11): «заклинание, которое вызывает смерч, 300 маны; палочку на небо; обязательно в море — на озере не сработает;
// смерчи всё равно уходят — не более 12 игровых часов». The words; the price; only at sea with deep water ahead; the spout called comes
// down there, wanders round its place, never lives over 12 game hours (and the storms' own — far less); dies in the shallows.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SKY_SPELLS } from '../../src/game/SkyRules.js';
import { SEA_SCROLLS } from '../../src/game/ItemTypes.js';
import { OceanStorm, OCEAN_STORM } from '../../src/game/OceanStorm.js';
import { SeaIndex, SeaWaves } from '../../src/world/Sea.js';
import { OCEAN, spoutsOf } from '../../src/world/OceanWeather.js';

test('the words, the price, the sky, the scroll at sea', () => {
    for (const w of ['торнадо', 'Tornado', 'торнада']) assert.equal(matchSpell(w), 'Tornado', w);
    assert.notEqual(matchSpell('тонна до'), 'Tornado');
    assert.equal(SPELL_COST.Tornado, 300);
    assert.ok(SKY_SPELLS.Tornado?.needs);
    assert.ok(SEA_SCROLLS.includes('Tornado'));
});

function game(clock) {
    const idx = new SeaIndex(777);
    const sea = new SeaWaves(idx, () => 0);
    return { g: { sea, seed: 777, weatherClock: clock, scene: new THREE.Scene() }, idx, s0: idx.nearest(0, 0, 8) };
}

test('only at sea: on the land / a lake — no; deep water ahead — the place; shallow ahead — no', () => {
    const { g, idx, s0 } = game(1000);
    const os = new OceanStorm(g);
    const land = idx.pointAt(s0, 0.3, -60), atSea = idx.pointAt(s0, 0.3, 150);
    assert.equal(os.seaHere(land), false);
    assert.equal(os.placeFor(land, 0), null, 'on the land');
    assert.equal(os.seaHere(atSea), true);
    // facing out to sea (towards the middle) — a place over deep water
    const yaw = Math.atan2(-(s0.x - atSea.x), -(s0.z - atSea.z));
    const at = os.placeFor(atSea, yaw);
    assert.ok(at && idx.signedDist(at.x, at.z) >= OCEAN_STORM.SUMMON_MIN_S);
    // at the edge of the water facing the shore: too shallow ahead
    const edge = idx.pointAt(s0, 0.3, 3);
    assert.equal(os.placeFor(edge, Math.atan2(-(edge.x - s0.x), -(edge.z - s0.z))), null);
});

test('the spout called: it comes down, wanders round its place, gone after 12 game hours at most; the storms\' own live far less', () => {
    const { g, idx, s0 } = game(1000);
    const os = new OceanStorm(g);
    const at = idx.pointAt(s0, 0.3, 250);
    os.summon(at, 'me');
    os.summon(at, 'me'); // (the same packet twice: one spout)
    assert.equal(os.summoned.length, 1);
    const at_ = (t) => { const out = []; os._summonedAt(t, out); return out[0]; };
    assert.ok(at_(1001).k < 0.2, 'it starts coming down');
    const mid = at_(1000 + 300);
    assert.ok(mid.k > 0.9 && Math.hypot(mid.x - at.x, mid.z - at.z) < 80, 'it stays round its place');
    assert.ok(at_(1000 + OCEAN_STORM.SUMMON_LIFE - 2).k < 0.3, 'it fades at the end');
    assert.equal(at_(1000 + OCEAN_STORM.SUMMON_LIFE + 1), undefined, 'gone');
    assert.equal(os.summoned.length, 0);
    assert.ok(OCEAN_STORM.SUMMON_LIFE <= 12 * 60, '≤ 12 game hours');
    assert.ok(OCEAN.LIFE[1] <= 12 * 60);
    for (let t = 0; t < 86400; t += 600) for (const s of spoutsOf(idx, s0, 777, t)) assert.ok(s.life <= 12 * 60);
});
