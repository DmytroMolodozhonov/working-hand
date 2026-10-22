// A dead animal leaves its own skeleton, sized from the living model: 90–105 % of its length and height.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boneFit, hasSkeleton, animalBonesModel, SKELETON_KINDS } from '../../src/game/AnimalBones.js';

for (const type of SKELETON_KINDS) {
    test(`${type}: skeleton fits the living animal (90–105 % of length and height), feet on the ground`, () => {
        const { model, bones } = boneFit(type);
        const ratio = (a, b) => (a.max[b] - a.min[b]);
        const lenR = ratio(bones, 'z') / ratio(model, 'z'), hR = ratio(bones, 'y') / ratio(model, 'y');
        assert.ok(lenR >= 0.9 && lenR <= 1.05, `${type} length ${lenR}`);
        assert.ok(hR >= 0.9 && hR <= 1.05, `${type} height ${hR}`);
        assert.ok(Math.abs(bones.min.y) < 1e-6, 'standing on the ground');
        assert.ok(bones.max.x - bones.min.x <= model.max.x - model.min.x + 0.3, 'not wider than the animal');
        const m = animalBonesModel(type);
        assert.equal(m.children.length, 1, 'one draw call');
        assert.equal(animalBonesModel(type).children[0].geometry, m.children[0].geometry, 'shape shared');
    });
}
test('owls, birds and the running book leave no skeleton', () => {
    for (const t of ['owl', 'runbook', 'bird']) { assert.equal(hasSkeleton(t), false); assert.equal(animalBonesModel(t), null); }
});
