// The body's answer to blows and to nearly dying (the author 21.11): heartbeat, red edges, blood, the blow's direction — HurtFx.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HurtFx, HURT, lowK, beatEvery, blowWeight, blowAngle, blowColour } from '../../src/game/HurtFx.js';

test('low health: nothing while healthy enough, stronger as it falls, the heart quickens', () => {
    assert.equal(lowK(20, 20), 0);
    assert.equal(lowK(10, 20), 0, 'half: not yet');
    assert.ok(lowK(6, 20) > 0.3 && lowK(2, 20) > lowK(6, 20) && lowK(1, 20) <= 1);
    assert.equal(lowK(0, 20), 0, 'dead: no heart to show');
    assert.ok(beatEvery(0) > beatEvery(0.5) && beatEvery(0.5) > beatEvery(1));
    assert.ok(Math.abs(60 / beatEvery(0) - HURT.BPM[0]) < 1e-6 && Math.abs(60 / beatEvery(1) - HURT.BPM[1]) < 1e-6);
});

test('a blow: its weight, its colour, the arc points to where it came from (turned by the look)', () => {
    assert.ok(blowWeight(1, 20) < blowWeight(8, 20) && blowWeight(100, 20) === 1 && blowWeight(0.1, 20) >= 0.15);
    assert.equal(blowColour('Inferno').blood, false);
    assert.equal(blowColour('melee').blood, true);
    assert.match(blowColour('avada').c, /^40,/);
    // looking along −z (fx 0, fz −1): a foe ahead (−z) → 0; at the right hand (+x) → +π/2; behind → π; at the left → −π/2
    const A = (dx, dz) => blowAngle(dx, dz, 0, -1);
    assert.ok(Math.abs(A(0, -5)) < 1e-9);
    assert.ok(Math.abs(A(5, 0) - Math.PI / 2) < 1e-9, 'the right hand');
    assert.ok(Math.abs(Math.abs(A(0, 5)) - Math.PI) < 1e-9, 'behind');
    assert.ok(Math.abs(A(-5, 0) + Math.PI / 2) < 1e-9, 'the left hand');
    // turned to look along +x: a foe at +x is ahead
    assert.ok(Math.abs(blowAngle(5, 0, 1, 0)) < 1e-9);
});

function fakeGame(hp = 20) {
    const pos = { x: 0, y: 0, z: 0 };
    return {
        combat: { enabled: true, dead: false, hp, maxHp: 20 }, fx: { shake: 0 }, localId: 'me', isDeadLocal: false,
        character: { group: { position: pos } }, camera: { quaternion: { x: 0, y: 0, z: 0, w: 1 } },
        remotes: new Map([['foe', { position: { x: 0, y: 0, z: -6 } }]]), sound: null,
    };
}

test('a blow: flare, a direction arc, drops of blood, the camera jolts; all of it fades by itself', () => {
    const g = fakeGame(14), h = new HurtFx(g);
    h.hit(6, 'foe', 'melee');
    assert.ok(h.flare > 0.3 && h.arcs.length === 1 && h.splats.length >= 2);
    assert.ok(Math.abs(h.arcs[0].a) < 1e-9, 'the foe is ahead');
    assert.ok(g.fx.shake > 0.2);
    for (let i = 0; i < 40 * 8; i++) h.update(1 / 40);
    assert.equal(h.flare, 0); assert.equal(h.arcs.length, 0); assert.equal(h.splats.length, 0);
});

test('limits, the dead, the off switch', () => {
    const g = fakeGame(3), h = new HurtFx(g);
    for (let i = 0; i < 100; i++) h.hit(9, 'foe', 'melee');
    assert.ok(h.splats.length <= HURT.MAX_SPLATS && h.arcs.length <= HURT.MAX_ARCS);
    g.combat.dead = true;
    const h2 = new HurtFx(g); h2.hit(5, 'foe', 'melee');
    assert.equal(h2.arcs.length, 0, 'a dead body shows nothing');
    const h3 = new HurtFx(fakeGame()); h3.hit(0, 'foe', 'melee');
    assert.equal(h3.flare, 0, 'no harm — no effect');
    // low health eases in, healed — eases out
    const g4 = fakeGame(3), h4 = new HurtFx(g4);
    for (let i = 0; i < 80; i++) h4.update(1 / 40);
    assert.ok(h4.k > 0.5);
    g4.combat.hp = 20;
    for (let i = 0; i < 400; i++) h4.update(1 / 40);
    assert.equal(h4.k, 0);
});
