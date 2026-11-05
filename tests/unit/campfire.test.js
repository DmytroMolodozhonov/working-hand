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

test('«Fire» на котёл: палочка, направленная на стоящий котёл, выбирает его; на котёл над огнём/в воздухе/в стороне — нет', async () => {
    const { Campfires } = await import('../../src/game/Campfires.js');
    const THREE = await import('three');
    const mk = (cauldrons) => ({ game: { cauldrons: { list: new Map(cauldrons.map((c) => [c.id, c])), upright: (c) => !c.lev && c.tilt < 0.2 }, character: {
        getHandWorldPosition: (s, v) => v.set(0, 3, 0), getHandDirection: (s, v) => v.set(0, -0.2, 1),
    } } });
    const aim = (o) => Campfires.prototype._cauldronAim.call(o, 'right');
    const c = { id: 'a', x: 0, y: 0.6, z: 10, tilt: 0 };
    assert.equal(aim(mk([c])), c);
    assert.equal(aim(mk([{ ...c, x: 6 }])), null, 'в стороне');
    assert.equal(aim(mk([{ ...c, fire: 'f1' }])), null, 'уже над костром');
    assert.equal(aim(mk([{ ...c, lev: true }])), null, 'в воздухе');
    assert.equal(aim(mk([{ ...c, z: 40 }])), null, 'дальше 25 м');
    void THREE;
});
