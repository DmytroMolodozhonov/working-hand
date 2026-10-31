import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_INFO, describeItem, rollWand } from '../../src/game/ItemTypes.js';

// «Раскрой свои секреты» должно отвечать на ЛЮБОЙ вид вещи.
test('describeItem answers for every item kind', () => {
    for (const kind of Object.keys(ITEM_INFO)) {
        const d = describeItem({ kind, uid: 1, count: 1, type: 0, piece: 'chest', max: 10, rec: 'heal', color: 1 });
        assert.ok(d && d.title && d.lines?.length, `no answer for ${kind}`);
    }
    for (const kind of ['weapon', 'sword', 'axe', 'rope', 'rod', 'key']) {
        const d = describeItem({ kind, type: 'sword' });
        assert.ok(d && d.title && d.lines?.length, `no answer for ${kind}`);
    }
});

test('plain and rolled wands are described (no staffs any more)', () => {
    assert.ok(describeItem({ kind: 'wand', plain: true }).lines.length);
    assert.ok(describeItem(rollWand()).lines.length >= 4);
});

test('an ordinary thing says it is not magic', () => {
    assert.match(describeItem({ kind: 'cannonball' }).lines.join(' '), /не магическая/);
});
