// The player's own tuning of the pocket's and the wand's places (the author 20.11: settings → «Игра» → «Пояс»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_TUNE, setBodyTune, tuneOffsets, TUNE_MAX, bodyPlaces } from '../../src/input/PoseInterpreter.js';
import { PocketHints, placesFrom } from '../../src/input/PocketHints.js';
import { beltPlaces } from '../../src/ui/BeltTunePreview.js';

test('zero tuning changes nothing; the offsets are clamped; the pocket and the wand move apart with the gap', () => {
    setBodyTune(0, 0);
    assert.deepEqual(tuneOffsets(), { pocket: 0, wand: 0 });
    setBodyTune(5, 5);
    assert.equal(BODY_TUNE.shift, TUNE_MAX); assert.equal(BODY_TUNE.gap, TUNE_MAX);
    setBodyTune(0, 0.2);
    const o = tuneOffsets();
    assert.ok(o.pocket > 0 && o.wand > 0 && Math.abs(o.pocket - 0.1) < 1e-9);
    setBodyTune(0.1, 0);
    const s = tuneOffsets();
    assert.ok(s.pocket > 0 && s.wand < 0, 'a shift moves both the same way along the belt');
    setBodyTune(0, 0);
});

test('the preview and the camera hints agree: the places move by the same amount', () => {
    const a = beltPlaces(false, { pocket: 0, wand: 0 }), b = beltPlaces(false, { pocket: 0.1, wand: -0.1 });
    assert.ok(Math.abs(Math.abs(b.pocket.x - a.pocket.x) - 0.1) < 1e-9 && Math.abs(Math.abs(b.wand.x - a.wand.x) - 0.1) < 1e-9);
    const l = beltPlaces(true, { pocket: 0.1, wand: -0.1 });
    assert.ok(Math.sign(l.pocket.x - beltPlaces(true, { pocket: 0, wand: 0 }).pocket.x) === -Math.sign(b.pocket.x - a.pocket.x), 'a left-hander is mirrored');
});
