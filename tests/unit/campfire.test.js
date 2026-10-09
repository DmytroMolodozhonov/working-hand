import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { cookItem, canCook, addWoodTime, flameSize, burnText, CAMPFIRE } from '../../src/game/Campfires.js';

test('«Fire» words make a campfire, Inferno stays Inferno', () => {
    for (const w of ['Fire', 'fire', 'Файр', 'файр!', 'Фаер', 'фаир', 'Костёр', 'костер', 'разожги костёр']) assert.equal(matchSpell(w), 'Fire', w);
    for (const w of ['инферно', 'Инферно', 'inferno', 'огонь']) assert.equal(matchSpell(w), 'Inferno', w);
    // the other spells keep their words
    assert.equal(matchSpell('бомбардо'), 'Bombardo');
    assert.equal(matchSpell('айс'), 'Ice');
    assert.equal(matchSpell('сапира'), 'Sapira');
    assert.equal(matchSpell('stand'), 'Stand');
    assert.equal(matchSpell('вайнд'), 'Wind');
    assert.equal(SPELL_COST.Fire, 4);
});

test('cookItem: meat becomes a steak, a fish gets cooked once, other things stay', () => {
    const meat = { kind: 'meat', uid: 'a', count: 2 };
    assert.equal(canCook(meat), true);
    assert.equal(cookItem(meat), true);
    assert.deepEqual(meat, { kind: 'steak', uid: 'a', count: 2 });
    assert.equal(cookItem(meat), false, 'a steak is already cooked');
    const fish = { kind: 'fish', species: 'карась', weight: 0.8, cooked: false };
    assert.equal(cookItem(fish), true);
    assert.equal(fish.cooked, true);
    assert.equal(fish.kind, 'fish');
    assert.equal(cookItem(fish), false);
    for (const it of [{ kind: 'apple' }, { kind: 'wand' }, null, undefined]) assert.equal(cookItem(it), false);
});

test('burn time: 3 minutes, +1 minute per wood, at most 10, embers light up again', () => {
    assert.equal(CAMPFIRE.BURN, 180);
    assert.equal(addWoodTime(180), 240);
    assert.equal(addWoodTime(180, 3), 360);
    assert.equal(addWoodTime(590), CAMPFIRE.MAX);
    assert.equal(addWoodTime(-5), 60, 'embers: wood lights them up');
    assert.equal(flameSize(180), 1);
    assert.ok(flameSize(10) < 1 && flameSize(10) > 0, 'flames shrink near the end');
    assert.equal(flameSize(0), 0);
    assert.equal(flameSize(-3), 0);
    assert.equal(burnText(150), '2 мин 30 с');
    assert.equal(burnText(60), '1 мин');
    assert.equal(burnText(42), '42 с');
});
