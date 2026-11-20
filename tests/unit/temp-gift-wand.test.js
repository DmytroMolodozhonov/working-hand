// TEMPORARY (delete with TempGiftWand.js when the author says): the lost wand is given once, only in his world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempGiftWand, TEMP_GIFT, giftWand } from '../../src/game/TempGiftWand.js';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const inv = (slots) => ({ slots, uids: new Set(), hasUid(u) { return this.uids.has(u) || this.slots.some((s) => s?.uid === u); }, setExtraSlots(n) { while (this.slots.length < 5 + n) this.slots.push(null); }, _render() {} });
const game = (seed, i) => ({ config: { seed, mode: 'freeworld' }, inventory: i, hud: { toast() {} } });

test('given once in his world: power 49, favourite Bombardo, into a free cell', () => {
    const s = store(), i = inv([{ kind: 'apple' }, null, null, null, null]);
    assert.equal(tempGiftWand(game(TEMP_GIFT.SEED, i), s), true);
    const w = i.slots.find((x) => x?.uid === TEMP_GIFT.UID);
    assert.equal(w.power, 49); assert.equal(w.fav, 'Bombardo'); assert.equal(w.kind, 'wand'); assert.equal(i.ownWand, TEMP_GIFT.UID);
    assert.equal(tempGiftWand(game(TEMP_GIFT.SEED, i), s), false, 'not twice');
    i.slots[1] = null; assert.equal(tempGiftWand(game(TEMP_GIFT.SEED, i), s), false, 'not again even if he threw it away');
});

test('not in any other world, nor in Creative; a full pouch gets a new cell; already there — only marked', () => {
    assert.equal(tempGiftWand(game(1, inv([null])), store()), false);
    const g = game(TEMP_GIFT.SEED, inv([1, 2, 3, 4, 5].map((n) => ({ kind: 'x', n }))));
    assert.equal(tempGiftWand(g, store()), true); assert.equal(g.inventory.slots.length, 6);
    const s = store(), i = inv([giftWand()]);
    assert.equal(tempGiftWand(game(TEMP_GIFT.SEED, i), s), false); assert.ok(s.getItem(TEMP_GIFT.KEY));
    const c = game(TEMP_GIFT.SEED, inv([null])); c.config.mode = 'creative'; assert.equal(tempGiftWand(c, store()), false);
});
