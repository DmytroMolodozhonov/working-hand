// Every counter has a goods part and an empty plate for the coins (StallZones.js, the author 19.11: not only the wizards' lane — everywhere).
import test from 'node:test';
import assert from 'node:assert/strict';
import { zonesOf, payPoint, PAY_BLOCKS } from '../../src/game/StallZones.js';

const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, top: 10 });
const area = (r) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);

test('a counter is split on its long side: the last blocks are the plate, the rest is for the goods; they do not overlap and cover the counter', () => {
    for (const c of [rect(0, 4, 0, 1), rect(0, 1, 0, 4), rect(0, 5, 0, 1), rect(3, 3, 0, 3), rect(0, 2, 0, 1)]) {
        const z = zonesOf({ counter: c });
        assert.ok(z.pay, JSON.stringify(c));
        assert.equal(area(z.goods) + area(z.pay), area(c), 'together the whole counter');
        const ov = Math.min(z.goods.x1, z.pay.x1) >= Math.max(z.goods.x0, z.pay.x0) && Math.min(z.goods.z1, z.pay.z1) >= Math.max(z.goods.z0, z.pay.z0);
        assert.equal(ov, false, 'the plate is empty of goods');
        assert.equal(z.goods.top, 10); assert.equal(z.pay.top, 10);
    }
    assert.equal(PAY_BLOCKS(2), 0); assert.equal(PAY_BLOCKS(3), 1); assert.equal(PAY_BLOCKS(4), 2); assert.equal(PAY_BLOCKS(7), 2);
});

test('a too small counter is not split (the goods lie as before); a counter built with its own plate keeps it', () => {
    const z = zonesOf({ counter: rect(0, 1, 0, 0) });
    assert.equal(z.pay, null); assert.deepEqual(z.goods, rect(0, 1, 0, 0));
    const own = zonesOf({ counter: rect(0, 6, 0, 2), goodsRect: rect(0, 3, 0, 2), payRect: rect(4, 6, 0, 2) });
    assert.ok(own.explicit); assert.deepEqual(own.pay, rect(4, 6, 0, 2));
    assert.equal(zonesOf({}).goods, null);
});

test('the plate\'s middle: a point on the counter top (where the pouch of a sale is laid)', () => {
    const p = payPoint({ counter: rect(0, 4, 0, 1) });
    assert.deepEqual(p, { x: 3.5, y: 10, z: 0.5 });
    assert.equal(payPoint({ counter: rect(0, 1, 0, 0) }), null);
});
