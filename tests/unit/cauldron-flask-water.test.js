// The author 20.11: a flask near the pot never falls from the hand; the water in a pot is full or none (an old part-filled pot is full); a ready potion is dipped at any level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Cauldrons } from '../../src/game/Cauldrons.js';
import { CAULDRON } from '../../src/game/Potions.js';

function pot(water, phase = 'empty') {
    const g = { storm: null, campfires: { list: new Map() }, hud: {}, sync: null, water: null };
    const C = Object.create(Cauldrons.prototype);
    g.authority = true; C.game = g; C.list = new Map(); C._send = () => {}; C._event = () => {}; C._fireUnder = () => null; C.upright = () => true; C.fy = () => 0;
    const c = { id: 1, x: 0, y: 0, z: 0, tilt: 0, slide: { lengthSq: () => 0 }, myMoveAt: -1e9, moverAt: -1e9, st: { phase, water, heat: 0, t: 0, dur: 0, win: 0 } };
    C.list.set(1, c); return { C, c };
}

test('flaskZone: the ring round the pot holds a flask; a real throw is let go only outside the opening', () => {
    const { C } = pot(0);
    assert.equal(C.flaskZone({ x: CAULDRON.R_IN + 1.5, y: 2, z: 0 }), true, 'beside the pot: kept');
    assert.equal(C.flaskZone({ x: CAULDRON.R_IN + 1.5, y: 2, z: 0 }, true), false, 'a throw from beside it may go');
    assert.equal(C.flaskZone({ x: 0, y: CAULDRON.H + 0.3, z: 0 }, true), true, 'over the opening: even a throw is kept');
    assert.equal(C.flaskZone({ x: 30, y: 2, z: 0 }), false);
});

test('water is full or none: a part-filled pot is made full', () => {
    const { C, c } = pot(0.4);
    C._hostStep(c, 0.016, 0);
    assert.equal(c.st.water, CAULDRON.FULL);
    const e = pot(0); e.C._hostStep(e.c, 0.016, 0); assert.equal(e.c.st.water, 0, 'an empty one stays empty');
});

test('a fire under a brewing pot does not burn down (magic fire); a pot that is not brewing holds nothing', () => {
    const b = pot(6, 'brewing'); b.c.fire = 'f1';
    assert.equal(b.C.brewNeedsFire('f1'), true);
    const w = pot(6, 'water'); w.c.fire = 'f1'; w.c.st.win = 12;
    assert.equal(w.C.brewNeedsFire('f1'), true, 'the countdown for the ingredients counts');
    w.c.st.win = 0; assert.equal(w.C.brewNeedsFire('f1'), false, 'just water: the fire burns down as any');
    const r = pot(6, 'ready'); r.c.fire = 'f1'; assert.equal(r.C.brewNeedsFire('f1'), false, 'a ready potion needs no fire');
    assert.equal(b.C.brewNeedsFire('other'), false);
});
