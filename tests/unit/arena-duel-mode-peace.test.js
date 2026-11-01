/**
 * The duel mode («Перед дуэлью»): every spell is allowed and nobody turns hostile (the author: «другие волшебники просто НЕ ДОЛЖНЫ нападать вообще»).
 * Run: node --test tests/unit/arena-duel-mode-peace.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';

const AD = ArenaDuels.prototype;

test('peace(): only while the duel mode runs', () => {
    assert.equal(AD.peace.call({ mode: null }), false);
    assert.equal(AD.peace.call({ mode: { arenaId: 'a' } }), true);
});

test('_calmDown wipes anger, fear and search of any wizard', () => {
    const v = { foe: 'local', grudge: { id: 'local' }, fleeFrom: 'local', fleeAt: { x: 1, z: 1 }, fear: {}, lesson: {}, hunt: {}, fleeT: 9, investigate: { x: 1 } };
    AD._calmDown.call({}, v);
    assert.equal(v.foe, null); assert.equal(v.grudge, null); assert.equal(v.fleeT, 0); assert.equal(v.investigate, null); assert.equal(v.fleeFrom, null);
});

test('step(): in the mode a fan with foe/fear stays a fan (not released from the arena)', () => {
    const A = { duel: null, id: 'a' };
    const self = { mode: { arenaId: 'a' }, list: new Map([['a', A]]), life: null, _calmDown: AD._calmDown, _fan: () => true };
    const v = { arena: { id: 'a', kind: 'fan' }, foe: 'local', fleeT: 5, investigate: { x: 1 } };
    assert.equal(AD.step.call(self, v, 0.05), true);
    assert.equal(v.arena?.kind, 'fan');
    assert.equal(v.foe, null);
});

test('the crimes and moods are switched off in the mode: deed, alarm, damaged, startle, relations', () => {
    const cl = fs.readFileSync(new URL('../../src/game/CastleLife.js', import.meta.url), 'utf8');
    for (const fn of ['deed(by, kind, extra = 0) {', 'alarm(pos, kind, by = null, r = null) {', 'damaged(pos, by, blocks, loud = true,']) {
        const i = cl.indexOf(fn); assert.ok(i > 0, fn);
        assert.match(cl.slice(i, i + 400), /arenaDuels\?\.peace\?\.\(\)/, fn);
    }
    const j = cl.indexOf('    startle(v, by, from');
    assert.match(cl.slice(j, j + 400), /arenaDuels\?\.peace\?\.\(\)/);
    const rl = fs.readFileSync(new URL('../../src/game/RelationsLife.js', import.meta.url), 'utf8');
    assert.match(rl.slice(rl.indexOf('    bump(v, pid, d'), rl.indexOf('    bump(v, pid, d') + 300), /arenaDuels\?\.peace\?\.\(\)/);
});

test('one opponent at a time: a leftover duellist is released before the next comes', () => {
    const src = fs.readFileSync(new URL('../../src/game/ArenaDuels.js', import.meta.url), 'utf8');
    assert.match(src, /one opponent at a time/);
});
