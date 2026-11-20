// The author 20.11: while a spell works (concentration, a held spell, Lumos on the wand) the wand cannot be put into the interface; the hint says to stop the spell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../../src/game/Inventory.js';

const make = (g) => { const inv = Object.create(Inventory.prototype); inv.game = { hud: { toast: (t) => g.toasts.push(t) }, ...g }; return inv; };

test('no spell: the wand goes; a held spell, a wand spell, an aimed spell: it does not, with a hint (once in a while)', () => {
    const t = { toasts: [] };
    assert.equal(make({ ...t, focus: { held: () => null } }).wandStowBlock('right'), '');
    const a = make({ ...t, focus: { held: () => 'Levitation' } });
    assert.ok(a.wandStowBlock('right'));
    assert.match(t.toasts[0], /стоп|концентрац/);
    a.wandStowBlock('right'); assert.equal(t.toasts.length, 1, 'the hint is not spammed');
    assert.ok(make({ ...t, focus: { held: () => null }, wandMagic: { active: true } }).wandStowBlock('right'));
    assert.ok(make({ ...t, focus: { held: () => null }, character: { aim: { right: {} } } }).wandStowBlock('right'));
    assert.equal(make({ ...t, focus: { held: () => null }, character: { aim: { left: {} } } }).wandStowBlock('right'), '', 'the other hand\'s aim is not mine');
});

test('a second wand in the OTHER hand (a trophy) can be put away while a spell goes on the casting wand (the author 20.11)', () => {
    const t = { toasts: [] };
    const inv = make({ ...t, focus: { held: () => 'Levitation' }, wandSide: () => 'right', character: { aim: {} } });
    assert.ok(inv.wandStowBlock('right'), 'the casting wand: blocked');
    assert.equal(inv.wandStowBlock('left'), '', 'the other hand\'s wand: free');
    const aimed = make({ ...t, focus: { held: () => null }, wandSide: () => 'right', character: { aim: { left: {} } } });
    assert.ok(aimed.wandStowBlock('left'), 'but one aimed in that hand is still a wand in use');
});
