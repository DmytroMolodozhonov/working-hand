// The merchant's change is laid on the counter after his open hand has been out for a moment, never by magic and never lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleTalk } from '../../src/game/CastleTalk.js';

const mk = (v) => {
    const laid = [];
    const talk = { changes: [{ v, t: 0.9, laid: () => laid.push(1) }], life: { byId: new Map([[v.id, v]]) } };
    return { talk, laid, step: (dt) => CastleTalk.prototype._flushChange.call(talk, dt) };
};

test('change: not at once, after the hand has been out', () => {
    const v = { id: 'm', giveT: 1.8 }, c = mk(v);
    c.step(0.3); assert.equal(c.laid.length, 0, 'the hand is still coming out');
    c.step(0.3); assert.equal(c.laid.length, 0);
    c.step(0.4); assert.equal(c.laid.length, 1, 'laid on the counter');
    c.step(1); assert.equal(c.laid.length, 1, 'only once');
});

test('change: merchant killed / frightened / asleep / gone / enemy — laid at once, nothing lost', () => {
    for (const o of [{ dead: true }, { fleeT: 2 }, { sleep: true }, { foe: true }]) {
        const v = { id: 'm', giveT: 1.8, ...o }, c = mk(v);
        c.step(0.05);
        assert.equal(c.laid.length, 1, JSON.stringify(o));
        assert.equal(v.giveT, 0, 'his hand is down');
    }
    const v = { id: 'm', giveT: 1.8 }, c = mk(v);
    c.talk.life.byId.clear(); c.step(0.05);
    assert.equal(c.laid.length, 1, 'the place went to sleep: laid at once');
});
