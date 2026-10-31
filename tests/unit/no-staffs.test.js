// (the author: «посохи убрать, остался только Ледяной Жезл»)
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollWand, starterWand, retireScroll, retireScrollsIn, retireStaff, ITEM_INFO, wandValue } from '../../src/game/ItemTypes.js';
import { WIZARD_ROLES } from '../../src/game/WizardAI.js';
import { TOOLS, villagerLook, VillagerModel } from '../../src/entities/VillagerModel.js';
import { stewardLook } from '../../src/game/ArenaDuels.js';
import { WAND_TOOLS, rollWizardWand } from '../../src/game/Expelliarmus.js';

test('no wand is rolled as a staff', () => {
    for (let i = 0; i < 300; i++) assert.ok(!rollWand().staff);
    assert.ok(!starterWand().staff);
});

test('an old staff becomes an ordinary wand with all its properties', () => {
    const old = { kind: 'wand', uid: 'u1', staff: true, plain: false, power: 31, dir: 'fire', fav: ['Fire'], color: 0x336699, model: 4, ench: { sum: 2 } };
    const copy = JSON.parse(JSON.stringify(old));
    retireScroll(old);
    assert.ok(!('staff' in old));
    delete copy.staff;
    assert.deepEqual(old, copy);
    const save = { hero: { hands: [{ kind: 'wand', staff: true, power: 5 }], bag: [{ kind: 'apple' }] }, chests: [[{ kind: 'wand', staff: true }]], bodies: [{ lg: { items: [{ kind: 'wand', staff: true }] } }] };
    assert.equal(retireScrollsIn(save), 3);
    assert.ok(!JSON.stringify(save).includes('staff'));
    assert.equal(retireStaff(null), null);
});

test('old staff price = ordinary wand price', () => assert.equal(wandValue({ kind: 'wand', power: 10, dir: 'fire' }), 290));

test('the Ice Rod stays', () => assert.ok(ITEM_INFO.iceRod));

test('wizards, wanderers, teachers and the steward hold a wand', () => {
    assert.ok(!TOOLS.includes('staff'));
    assert.deepEqual([...WAND_TOOLS], ['wand']);
    for (const role of WIZARD_ROLES) for (let s = 0; s < 6; s++) assert.equal(villagerLook(s, role).tool, 'wand', role);
    assert.equal(stewardLook(1, false, 0x884422).tool, 'wand');
    const m = new VillagerModel({ ...villagerLook(3, 'wanderer'), tool: 'staff' }); // (an old saved look)
    assert.equal(m.toolKind, 'wand');
});

test('a wanderer rolls an ordinary (non-plain) wand', () => {
    const w = rollWizardWand({ role: 'wanderer', model: { toolKind: 'wand' } });
    assert.equal(w.kind, 'wand'); assert.ok(!w.staff && !w.plain);
});
