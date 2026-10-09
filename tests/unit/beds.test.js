import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, bedColorHex, BED_COLORS, checkRecipe, planConsumption, countMaterials, everyoneAsleep } from '../../src/game/BedRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('beds: colour words in Russian and English', () => {
    assert.equal(parseColor('поменяй цвет на синий'), 'blue');
    assert.equal(parseColor('Change a color red'), 'red');
    assert.equal(parseColor('Чейндж э колор красный'), 'red');
    assert.equal(parseColor('поменяй цвет на зелёный'), 'green');
    assert.equal(parseColor('change a color yellow'), 'yellow');
    assert.equal(parseColor('цвет жёлтый'), 'yellow');
    assert.equal(parseColor('поменяй цвет на голубой'), 'cyan');
    assert.equal(parseColor('change a color light blue'), 'cyan');
    assert.equal(parseColor('цвет фиолетовый'), 'purple');
    assert.equal(parseColor('розовый'), 'pink');
    assert.equal(parseColor('оранжевую'), 'orange');
    assert.equal(parseColor('сделай чёрной'), 'black');
    assert.equal(parseColor('white'), 'white');
    assert.equal(parseColor('белую'), 'white');
    assert.equal(parseColor('поменяй цвет'), null);
    assert.equal(parseColor('Change a color'), null);
    assert.equal(parseColor(''), null);
    // «синий» is not found inside other words
    assert.equal(parseColor('косинус'), null);
    assert.equal(bedColorHex('blue'), BED_COLORS.blue.hex);
    assert.equal(bedColorHex('nonsense'), BED_COLORS.white.hex);
    assert.equal(bedColorHex(0x123456), 0x123456);
});

test('beds: the spell words', () => {
    for (const t of ['Create a Bed', 'create a bed', 'Крейт э бед', 'крейт э бэд', 'создай кровать', 'Сделай кровать', 'кровать']) assert.equal(matchSpell(t), 'CreateBed', t);
    for (const t of ['Change a color blue', 'Change a colour red', 'поменяй цвет на красный', 'Чейндж э колор синий', 'перекрась в зелёный', 'чейндж э колор']) assert.equal(matchSpell(t), 'ChangeColor', t);
    // the old spells are still themselves
    assert.equal(matchSpell('Create a Door'), 'CreateDoor');
    assert.equal(matchSpell('Create a Floor'), 'CreateFloor');
    assert.equal(matchSpell('Бомбардо'), 'Bombardo');
    assert.equal(matchSpell('Инферно'), 'Inferno');
    // «обед» / «победа» alone are not a bed
    assert.notEqual(matchSpell('обед'), 'CreateBed');
    assert.notEqual(matchSpell('победа'), 'CreateBed');
});

test('beds: the recipe — 4 logs and 3 wool lying together', () => {
    const logs = (n, uid = 'l' + n) => ({ kind: 'logs', count: n, uid });
    const wool = (uid) => ({ kind: 'wool', count: 1, uid });
    assert.deepEqual(countMaterials([logs(4), wool('a'), wool('b'), { kind: 'apple', count: 3 }]), { logs: 4, wool: 2 });
    const ok = checkRecipe([logs(4), wool('a'), wool('b'), wool('c')]);
    assert.equal(ok.ok, true);
    assert.equal(ok.message, null);
    const noWool = checkRecipe([logs(4), wool('a')]);
    assert.equal(noWool.ok, false);
    assert.match(noWool.message, /Нужно ещё: 2 клубка шерсти \(/);
    const noLogs = checkRecipe([logs(2, 'x'), wool('a'), wool('b'), wool('c')]);
    assert.equal(noLogs.ok, false);
    assert.match(noLogs.message, /Нужно ещё: 2 бревна \(/);
    assert.match(checkRecipe([logs(3), wool('a')]).message, /1 бревно и 2 клубка шерсти/);
    const nothing = checkRecipe([]);
    assert.equal(nothing.ok, false);
    assert.match(nothing.message, /нет материалов/);
    // using up: whole piles first; a bigger pile is used partly, the rest stays
    const plan = planConsumption([logs(3, 'p'), logs(4, 'q'), wool('a'), wool('b'), wool('c'), wool('d')]);
    assert.deepEqual(plan.filter((s) => s.kind === 'logs'), [{ uid: 'q', kind: 'logs', take: 4, left: 0 }]);
    assert.equal(plan.filter((s) => s.kind === 'wool').length, 3);
    const part = planConsumption([logs(6, 'big'), wool('a'), wool('b'), wool('c')]);
    assert.deepEqual(part[0], { uid: 'big', kind: 'logs', take: 4, left: 2 });
    assert.equal(planConsumption([logs(3), wool('a'), wool('b'), wool('c')]), null);
});

test('beds: the night passes only when every living player sleeps', () => {
    assert.equal(everyoneAsleep([{ lying: true, still: 3.2 }]), true);
    assert.equal(everyoneAsleep([{ lying: true, still: 1 }]), false);
    assert.equal(everyoneAsleep([{ lying: false, still: 9 }]), false);
    assert.equal(everyoneAsleep([{ lying: true, still: 5 }, { lying: false, still: 0 }]), false);
    assert.equal(everyoneAsleep([{ lying: true, still: 5 }, { dead: true, lying: false }]), true);
    assert.equal(everyoneAsleep([{ dead: true }]), false);
    assert.equal(everyoneAsleep([]), false);
});
