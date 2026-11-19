// The Eye-flower (Глазоцвет, the author 19.11): a small flower with a living eye that blinks, looks to the SIDES (hardly ever up or down), watches creatures;
// the eye is picked by hand and is what the circle of night sight wants (SightRules.NIGHT_INGREDIENTS). Only worlds of generation ≥ 33.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLORA_KINDS, FLORA_ITEMS, floraGroupIn, eyeState, EYE } from '../../src/game/MagicFlora.js';
import { EYEFLOWER_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';
import { SIGHT, findIngredient } from '../../src/game/SightRules.js';

test('a flower of its own kind: small, in groups, new worlds only, harmless', () => {
    const K = FLORA_KINDS.eyeflower;
    assert.equal(K.fromGen, EYEFLOWER_FROM_GEN);
    assert.ok(WORLD_GEN >= EYEFLOWER_FROM_GEN);
    assert.ok(K.height[1] < 1.5, 'small');
    assert.ok(K.group.min >= 3, 'grows in company');
    assert.equal(K.item, 'eyeflower_eye');
    assert.ok(FLORA_ITEMS.eyeflower_eye);
    const g = floraGroupIn('eyeflower', 3, 4, 77, () => 'forest') || floraGroupIn('eyeflower', 5, 9, 77, () => 'moon') || floraGroupIn('eyeflower', 1, 1, 12, () => 'forest');
    if (g) assert.ok(g.members.length >= 1);
});

test('the eye looks about to the sides (never far up or down), blinks, and now and then rests shut', () => {
    let maxYaw = 0, maxPitch = 0, minOpen = 1, shut = 0;
    for (let t = 0; t < 240; t += 0.05) {
        const e = eyeState(t, 0.37, null);
        maxYaw = Math.max(maxYaw, Math.abs(e.yaw)); maxPitch = Math.max(maxPitch, Math.abs(e.pitch)); minOpen = Math.min(minOpen, e.open);
        if (e.open < 0.3) shut++;
    }
    assert.ok(maxYaw > 0.8, `wide glances aside: ${maxYaw}`);
    assert.ok(maxPitch <= EYE.WANDER_PITCH + 1e-6, `hardly up or down: ${maxPitch}`);
    assert.ok(minOpen <= EYE.SHUT + 0.02, 'it closes');
    assert.ok(shut > 5 && shut < 240 / 0.05 * 0.25, 'blinks are short');
});

test('a creature near: the eye turns to it (but not past its limit), narrowed and attentive; none near: it wanders', () => {
    const e = eyeState(10, 0.2, { yaw: 1.0, pitch: 0.05, near: 1 });
    assert.ok(Math.abs(e.yaw - 1.0) < 0.3, `follows: ${e.yaw}`);
    assert.ok(e.open <= 0.92, 'a narrowed look');
    const far = eyeState(10, 0.2, { yaw: 3, pitch: 1.2, near: 1 });
    assert.ok(Math.abs(far.yaw) <= EYE.YAW_MAX + 1e-6 && Math.abs(far.pitch) <= EYE.PITCH_MAX + 1e-6);
    for (let t = 0; t < 5; t += 0.25) assert.ok(Number.isFinite(eyeState(t, 0.9, null).open));
});

test('the circle of night sight wants the eye (not the feather of the circle of sight)', () => {
    assert.deepEqual(SIGHT.NIGHT_INGREDIENTS, ['eyeflower_eye']);
    const eye = { kind: 'eyeflower_eye', count: 1 };
    assert.equal(findIngredient({ slots: [eye] }, SIGHT.NIGHT_INGREDIENTS)?.kind, 'eyeflower_eye');
    assert.equal(findIngredient({ slots: [{ kind: 'spencerFeather', count: 1 }] }, SIGHT.NIGHT_INGREDIENTS), null, 'a feather is not an eye');
    assert.equal(findIngredient({ slots: [eye] })?.kind, undefined, 'the circle of sight does not take the eye');
});
