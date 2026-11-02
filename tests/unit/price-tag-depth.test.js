// The traders' price cards and hologram labels are depth-tested: a wall, a counter or a person in front of them hides them (not drawn through objects).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CastleTalk: price card and label materials test depth (nothing is seen through objects)', () => {
    const src = fs.readFileSync(new URL('../../src/game/CastleTalk.js', import.meta.url), 'utf8');
    const mats = src.match(/new THREE\.SpriteMaterial\(\{[^}]*\}\)/g) || [];
    const tagMats = mats.filter((m) => /polygonOffsetFactor: -4/.test(m));
    assert.ok(tagMats.length >= 2, 'the card and the label');
    for (const m of tagMats) assert.match(m, /depthTest: true/, m);
});
