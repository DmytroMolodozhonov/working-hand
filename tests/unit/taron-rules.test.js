// The Tarons (TaronRules.js): numbers of the author's words, the table «кто/что», the looks, the camps' regrowth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TARON, TARGETS, harmOf, walkSpeed, sees, withinLeash, swingSide, swingHits, swingDamage, campSize, respawnStep, taronLook, lootRoll, hunterDone, packSlots } from '../../src/game/TaronRules.js';

test('a Taron: 100 HP, twice a man (~7 m), half the player\'s speed, leash 70 m', () => {
    assert.equal(TARON.HP, 100);
    assert.ok(TARON.HEIGHT >= 6.8 && TARON.HEIGHT <= 7.2, 'twice the hero\'s 3.5 m');
    assert.ok(Math.abs(TARON.WALK - TARON.PLAYER_SPEED / 2) < 1e-9);
    assert.ok(walkSpeed(1) <= TARON.PLAYER_SPEED * 0.5 + 1e-9, 'never faster than half');
    assert.ok(walkSpeed(0.1) < walkSpeed(1));
    assert.ok(withinLeash(70) && !withinLeash(70.1));
    assert.ok(sees(39, {}) && !sees(41, {}) && sees(60, { grudge: true }) && !sees(10, { visible: false }));
});

test('the swing: 0.9 s wind-up, ~9 m, 22 blade / 14 + daze hammer, in a cone only', () => {
    assert.equal(TARON.WIND_T, 0.9);
    assert.equal(TARON.BLADE.dmg, 22);
    assert.equal(TARON.HAMMER.dmg, 14);
    assert.ok(TARON.HAMMER.daze > 0);
    assert.ok(swingHits(8.9, 0.5) && !swingHits(9.1, 0) && !swingHits(5, 2.5), 'behind or to the side — a miss');
    let h = 0; for (let i = 0; i < 10000; i++) if (swingSide(i / 10000) === TARON.HAMMER) h++;
    assert.ok(Math.abs(h / 10000 - TARON.HAMMER_SHARE) < 0.01);
    assert.equal(swingDamage(TARON.BLADE, 'player'), 22);
    assert.ok(swingDamage(TARON.BLADE, 'animal') > 22);
});

test('«кто/что»: mortal — fire, blades, black magic kill; hellfire/sun/overgrown do not act; every row has a reason', () => {
    for (const [k, v] of Object.entries(TARGETS)) assert.ok(v.why && v.does, k);
    assert.equal(harmOf('Avada', 0).kill, true, 'black magic works');
    assert.equal(harmOf('Boom', 0).kill, true);
    assert.equal(harmOf('Hellfire', 99).dmg, 0, 'his own fire');
    assert.ok(harmOf('Inferno', 10).dmg === 10);
    assert.ok(harmOf('fist', 10).dmg === 4);
    assert.ok(harmOf('Stupefy', 8).stun > 0 && harmOf('Stupefy', 8).dmg === 0);
    assert.ok(harmOf('Ice', 5).slow > 0 && harmOf('Ice', 5).dmg === 0);
    assert.equal(TARGETS.ToTheSun.does, 'none');
});

test('looks: same seed — same Taron; sizes within ±8 %; variety of colours and horns', () => {
    assert.deepEqual(taronLook(5), taronLook(5));
    const skins = new Set(), horns = new Set();
    for (let i = 0; i < 300; i++) {
        const l = taronLook(i);
        assert.ok(l.size >= 1 - TARON.SIZE_VAR - 1e-9 && l.size <= 1 + TARON.SIZE_VAR + 1e-9);
        skins.add(l.skin); horns.add(l.hornKind);
    }
    assert.ok(skins.size >= 4 && horns.size === 3);
});

test('camps: 3…8; an emptied camp gets +1 every 15 game minutes, never above n; loot and the hunter achievement', () => {
    assert.equal(campSize(1), 3); assert.equal(campSize(99), 8); assert.equal(campSize(5), 5);
    let t = 0, alive = 2, ticks = 0;
    for (let s = 0; s < 3 * 3600 && alive < 5; s += 10) { const r = respawnStep(t, 10, alive, 5); t = r.t; if (r.spawn) { alive++; ticks++; } }
    assert.equal(alive, 5); assert.equal(ticks, 3);
    assert.equal(respawnStep(0, 1e6, 5, 5).spawn, false, 'a full camp does not grow');
    let u = 0; const r = () => ((u = (u * 9301 + 49297) % 233280) / 233280);
    let axes = 0; for (let i = 0; i < 10000; i++) { const l = lootRoll(r); if (l.axe) axes++; assert.ok(l.coins >= 8 && l.coins <= 30 && l.iron >= 1 && l.iron <= 3); }
    assert.ok(Math.abs(axes / 10000 - TARON.LOOT.axe) < 0.03);
    assert.ok(!hunterDone(9) && hunterDone(10));
    assert.ok(packSlots(1, 8) <= TARON.PACK && packSlots(5, 5) >= 1);
});
