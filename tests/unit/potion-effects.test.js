/**
 * The timed potions (the author 05.11): disguise 24 min, dazzle 24 min (friendship/love ×3), luck 12 game hours (+5…85 % a spell),
 * breath under water a game day, the reset of them all. Every recipe is three things and unique; death and the reset end them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, matchRecipe } from '../../src/game/Potions.js';
import { PotionEffects, POTION_FX, dazzleBump, luckFactor, LUCK } from '../../src/game/PotionEffects.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';

test('each new recipe: three real things, found by itself and by nothing else', () => {
    for (const id of ['disguise', 'dazzle', 'luck', 'waterbreath', 'potionreset']) {
        const r = RECIPES.find((x) => x.id === id);
        assert.ok(r, id);
        const kinds = Object.keys(r.ingredients);
        assert.equal(kinds.length, 3, id);
        for (const k of kinds) assert.ok(ITEM_INFO[k], `${id}: ${k} is a thing of the game`);
        assert.equal(matchRecipe(r.ingredients)?.id, id);
    }
    const keys = RECIPES.map((r) => Object.keys(r.ingredients).sort().join('+'));
    assert.equal(new Set(keys).size, keys.length, 'no two recipes of the same things');
});

test('the times: 24 min, 24 min, 12 game hours, a game day', () => {
    assert.equal(POTION_FX.disguise.s, 1440);
    assert.equal(POTION_FX.dazzle.s, 1440);
    assert.equal(POTION_FX.luck.s, 720);
    assert.equal(POTION_FX.waterbreath.s, 1440);
});

test('start, run out, drink again (the time anew), the reset, death; disguise puts the old face back', () => {
    const looks = [];
    const g = { character: { look: { hair: 1 }, setLook(l) { this.look = l; looks.push(l); } }, hud: { setVoice() {} } };
    const P = new PotionEffects(g);
    P._randomLook = () => ({ hair: 7 });
    assert.ok(P.start('disguise'));
    assert.equal(g.character.look.hair, 7);
    P.update(1000); P.start('disguise');
    assert.equal(P.left.disguise, 1440, 'drunk again: the full time');
    P.update(1441);
    assert.ok(!P.has('disguise'));
    assert.equal(g.character.look.hair, 1, 'its own face back');
    P.start('luck'); P.start('dazzle');
    assert.ok(P.resetAll() && !P.has('luck') && !P.has('dazzle'));
    P.start('waterbreath'); P.onDeath();
    assert.ok(!P.has('waterbreath'), 'death takes it');
});

test('dazzle triples the rises of friendship and love only; luck is +5…85 %', () => {
    assert.deepEqual(dazzleBump({ s: 2, f: 3, l: -1 }), { s: 2, f: 9, l: -1 });
    assert.ok(Math.abs(luckFactor(() => 0) - (1 + LUCK.MIN)) < 1e-9);
    assert.ok(luckFactor(() => 0.999999) <= 1 + LUCK.MAX);
    const P = new PotionEffects({});
    assert.equal(P.luckK(), 1);
    P.left.luck = 10;
    assert.ok(P.luckK(() => 0.5) > 1);
});

test('the save keeps the time left and the face under the disguise', () => {
    const P = new PotionEffects({ character: { look: { a: 1 }, setLook() {} } });
    P._randomLook = () => ({ a: 2 });
    P.start('disguise');
    const snap = JSON.parse(JSON.stringify(P.snapshot()));
    const Q = new PotionEffects({});
    Q.restore(snap);
    assert.ok(Q.has('disguise') && Q._look.a === 1);
});
