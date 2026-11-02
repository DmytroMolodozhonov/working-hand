// «Protection Maxima»: the dome covers the whole body down to the feet and up over the head — the castle wizard's (ShieldBounce.NPC_SHIELD) as the player's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_SHIELD } from '../../src/game/ShieldBounce.js';
import { PVP } from '../../src/game/Combat.js';
import { PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';

const HERO_TOP = 4.7; // m over the feet: the head with a wizard's hat (the wand is at 3.4, the eyes ~3.6)
test('the player\'s dome: centre feet + 2.55, covers feet … over the head', () => {
    const feetToCentre = PLAYER_GROUND_OFFSET + 0.6;
    // (Combat.center: the body's origin + 0.6; the origin is 2.0 over the feet)
    assert.ok(feetToCentre - PVP.DOME_R <= 0.1, 'reaches the feet');
    assert.ok(feetToCentre + PVP.DOME_R >= HERO_TOP, 'closes over the head');
});
test('a castle wizard\'s dome: the same — the whole body and the hat inside, not only to the shoulders', () => {
    const lo = NPC_SHIELD.DOME_UP - NPC_SHIELD.DOME_R, hi = NPC_SHIELD.DOME_UP + NPC_SHIELD.DOME_R;
    assert.ok(lo <= 0.1, `reaches the feet (${lo})`);
    assert.ok(hi >= HERO_TOP + 0.5, `over the head with room (${hi})`);
    // at the head's height the sphere is still wide enough for the head (radius ≥ 0.6 m at HERO_TOP)
    const r = Math.sqrt(NPC_SHIELD.DOME_R ** 2 - (HERO_TOP - NPC_SHIELD.DOME_UP) ** 2);
    assert.ok(r >= 1.5, `at the hat's height the dome is ${r.toFixed(2)} m wide round the head`);
    assert.ok(Math.abs(NPC_SHIELD.DOME_UP - (PLAYER_GROUND_OFFSET + 0.6)) < 0.1, 'the same middle as a player\'s dome');
});

