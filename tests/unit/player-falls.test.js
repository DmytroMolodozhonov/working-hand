import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { Levitation, fallDamage } from '../../src/game/Levitation.js';
import { playerFallDamage } from '../../src/game/PlayerFallRules.js';
import { Steadiness } from '../../src/game/Steadiness.js';
import { Knockdown } from '../../src/game/Knockdown.js';

function stepOff(intensity, height = 5, stopInAir = false) {
    const ch = new VoxelCharacter(new T.Scene());
    const ground = { groundY: x => x < 0 ? height : 0 };
    ch.group.position.set(-1, height + PLAYER_GROUND_OFFSET, 0);
    ch.group.rotation.y = -Math.PI / 2;
    ch.onGround = true; ch.setRunning(true, intensity);
    for (let i = 0; i < 600 && !ch.landing; i++) {
        ch.update(1 / 120, ground, true);
        if (stopInAir && !ch.onGround) ch.setRunning(false);
    }
    assert.ok(ch.landing, 'actual character reached the lower cave floor');
    return ch;
}

test('all player height damage is exactly half the previous curve, with NPC damage unchanged', () => {
    for (const h of [2, 3.5, 4, 5, 6, 10, 30, 100]) assert.equal(playerFallDamage(h), fallDamage(h) / 2);
    assert.equal(fallDamage(10), 13);
    assert.equal(playerFallDamage(10), 6.5);
});

test('walking off a real five-block cave ledge is careful; running off the same ledge still hurts', () => {
    const walking = stepOff(0), running = stepOff(1);
    assert.equal(walking.landing.careful, true);
    assert.equal(running.landing.careful, false);
    assert.equal(playerFallDamage(walking.landing.drop, walking.landing), 0);
    assert.equal(playerFallDamage(running.landing.drop, running.landing), 1.5);
    const stopped = stepOff(1, 5, true);
    assert.equal(stopped.landing.careful, false, 'stopping in the air does not turn a run into a careful step');
    assert.ok(playerFallDamage(stopped.landing.drop, stopped.landing) > 0);
});

test('careful stepping cannot protect from high cliffs or forced magical drops; Featherfall remains safe', () => {
    assert.ok(playerFallDamage(12, { careful: true }) > 0);
    assert.equal(playerFallDamage(5, { careful: true }, true), 1.5);
    assert.equal(playerFallDamage(100, { soft: true }, true), 0);
});

test('ordinary and magical landing handlers cannot charge the same fall twice', () => {
    const hits = [], ch = stepOff(1), g = { character: ch, combat: { enabled: true, damage: (...args) => hits.push(args) } };
    const lev = Object.assign(Object.create(Levitation.prototype), { game: g, fallTop: null, myWatch: null });
    lev._ordinaryLanding(); lev._ordinaryLanding();
    assert.deepEqual(hits, [[1.5, null, 'fall']]);
    hits.length = 0; lev._playerLandingSeen = null; lev.fallTop = ch.group.position.y + 5; lev.fallBy = 'foe';
    lev.myWatch = { by: 'foe', since: ch.landing.at - 1, slack: 0 };
    lev._myLanding(); lev._myWatchLanding(); lev._ordinaryLanding();
    assert.deepEqual(hits, [[1.5, 'foe', 'fall']]);
    hits.length = 0; lev._playerLandingSeen = null; ch.swimY = 1;
    lev._ordinaryLanding(); assert.equal(hits.length, 0);
});

test('each completed fall grants +1 once, including a careful step and a magically softened fall', () => {
    const toasts = [], g = { config: { mode: 'survival' }, hud: { toast: t => toasts.push(t) } }, s = new Steadiness(g);
    const L = stepOff(0).landing;
    assert.equal(s.fallLanded(L), true); assert.equal(s.fallLanded(L), false);
    assert.equal(s.fallLanded({ drop: 0, actualDrop: 10, soft: true }), true);
    assert.equal(s.fallLanded({ drop: .1 }), false);
    assert.equal(s.skill, 3); assert.equal(toasts.length, 2);
    s.skill = 99; s.fallLanded({ drop: 100 }); s.fallLanded({ drop: 100 }); assert.equal(s.skill, 100);
});

test('Knockdown consumes a landing reward once even when no injury or knockdown occurs', () => {
    const g = { character: {}, config: { mode: 'survival' }, combat: {}, fx: {} };
    g.steady = new Steadiness(g); const k = new Knockdown(g);
    g.character = stepOff(0);
    k._landing(); k._landing();
    assert.equal(g.steady.skill, 2); assert.equal(k.down, false);
});
