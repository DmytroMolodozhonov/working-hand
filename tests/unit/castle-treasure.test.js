// A king's fortune: 500…1500 in all, the king's own pouch and the castle's chests sharing it (CastleTreasure.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { castleFortune, treasureShares, chestCoins, kingPurse, isKingsCastle, TREASURE } from '../../src/game/CastleTreasure.js';

const castle = (id, rooms) => ({ id, king: 'Король', chests: rooms.map((room, i) => ({ id: id + ':' + i, room })) });

test('the fortune is 500…1500, the same for the same castle, and varies between castles', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
        const f = castleFortune('c' + i + '_' + (i * 7));
        assert.ok(f >= TREASURE.MIN && f <= TREASURE.MAX, f);
        assert.equal(f, castleFortune('c' + i + '_' + (i * 7)));
        seen.add(Math.floor(f / 100));
    }
    assert.ok(seen.size >= 9, 'spread over the whole range');
});

test('the king\'s pouch and the chests add up to the fortune exactly; each chest is a part, none holds it all', () => {
    for (let i = 0; i < 100; i++) {
        const d = castle('c' + i, ['treasury', 'vault', 'study', 'king', 'bedroom', 'library', 'bedroom']);
        const t = treasureShares(d);
        const sum = [...t.byId.values()].reduce((a, b) => a + b, 0);
        assert.equal(sum + t.purse, t.fortune);
        assert.ok(t.purse > 0 && t.purse < t.fortune * 0.2);
        for (const v of t.byId.values()) assert.ok(v >= TREASURE.MIN_CHEST && v < t.fortune, 'a part');
        assert.ok(chestCoins(d, d.chests[0]) >= chestCoins(d, d.chests[4]), 'the treasury holds more than a bedroom');
    }
});

test('not a king\'s castle (a tower, a hamlet), and the port\'s stores: no share', () => {
    assert.equal(isKingsCastle({ id: 'x', king: 'Мастер', kind: 'tower', chests: [] }), false);
    assert.equal(isKingsCastle({ id: 'h', king: '', kind: 'hamlet', chests: [] }), false);
    assert.equal(chestCoins({ id: 'h', king: '', kind: 'hamlet', chests: [{ id: 1, room: 'x' }] }, { id: 1 }), null);
    const d = castle('c9', ['treasury', 'port']);
    assert.equal(chestCoins(d, d.chests[1]), null);
    assert.equal(kingPurse({ id: 'h', kind: 'hamlet' }), null);
    assert.ok(kingPurse(d) > 0);
});
