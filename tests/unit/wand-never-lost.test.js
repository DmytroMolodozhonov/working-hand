// «Палочка в основной руке пропала, когда вторая появилась в дочерней» — вещь не должна теряться никогда.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../../src/game/Inventory.js';
import { ItemSystem as Items } from '../../src/game/Items.js';
import { starterWand, rollWand } from '../../src/game/ItemTypes.js';

function rig(slots = [null, null, null, null, null], held = {}) {
    const loose = new Map();
    const game = { items: { held: { left: null, right: null, ...held }, loose, releaseHand(side) { const h = this.held[side]; this.held[side] = null; return h?.item || null; } }, weapons: { hands: { left: {}, right: {} } }, hud: { toast() {} }, config: {} };
    const inv = Object.create(Inventory.prototype);
    Object.assign(inv, { game, slots, selected: -1, inHand: null, _render() {}, purse: { ensure() {} } });
    return { game, inv, loose };
}
const H = (item) => ({ item });

test('своя палочка вернулась в дочернюю руку — замена в основной руке НЕ пропадает', () => {
    const stand = { ...starterWand(), spare: true };
    const own = rollWand();
    const { inv, game } = rig([], { right: H(stand) });
    inv.slots = [null, null, null, null, null];
    inv.ownWand = own.uid;
    inv.gotWand(own);
    assert.equal(game.items.held.right.item, stand, 'палочка в руке на месте');
    assert.ok(!stand.spare, 'обычная палочка, не «замена»');
});

test('замена в ячейке по-прежнему уходит (две палочки в ячейках не копятся)', () => {
    const stand = { ...starterWand(), spare: true };
    const own = rollWand();
    const { inv } = rig([stand, null, null, null, null]);
    inv.ownWand = own.uid;
    assert.equal(inv.gotWand(own), true);
    assert.equal(inv.slots[0], null);
});

test('ячейка не теряет вещь, если рука отказала', () => {
    const a = rollWand();
    const { inv, game } = rig([a, null, null, null, null]);
    game.items.takeIntoHand = () => false;
    assert.equal(inv._fromSlot(0, 'left'), false);
    assert.equal(inv.slots[0], a);
    inv.selected = 0;
    inv._takeIntoHand('left');
    assert.equal(inv.slots[0], a);
});

test('сторож: исчезнувшая вещь замечена, перенос — нет', () => {
    const a = rollWand(), b = rollWand();
    const { inv, game, loose } = rig([null, null, null, null, null], { right: H(a), left: H(b) });
    const lines = [];
    const orig = console.info; console.info = (...x) => lines.push(x.join(' '));
    try {
        inv.watch('тест-перенос', () => { game.items.held.left = null; loose.set(b.uid, {}); });
        assert.equal(lines.filter((l) => l.includes('потеряна')).length, 0);
        inv.watch('тест-потеря', () => { game.items.held.right = null; });
        assert.equal(lines.filter((l) => l.includes('потеряна') && l.includes('тест-потеря')).length, 1);
    } finally { console.info = orig; }
});

test('подбор: обе руки заняты и ячейки полны — вещь падает на землю, а не исчезает', () => {
    const full = [1, 2, 3, 4, 5].map(() => rollWand());
    const { inv, game } = rig(full, { right: H(rollWand()), left: H(rollWand()) });
    const dropped = [];
    const items = Object.create(Items.prototype);
    Object.assign(items, game.items, { game: Object.assign(game, { inventory: inv, character: { group: { position: { clone: () => ({ add: () => ({}) }) } } }, beds: null, hud: { setVoice() {}, toast() {} } }), spawnLoose: (it) => dropped.push(it), held: game.items.held, loose: game.items.loose });
    const w = rollWand();
    items._gotItem(w, 'left');
    assert.deepEqual(dropped, [w]);
});
