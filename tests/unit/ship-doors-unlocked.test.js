// The ships' doors (and the gates of an ice castle made by magic) are not a castle's locked gates:
// the crew walked into a "locked" ship door for ever and its clang rang over the whole start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Alohomora } from '../../src/game/Alohomora.js';

test('a ship door / a magic ice castle gate is not locked; a castle gate still is', () => {
    const A = new Alohomora({ castleLife: { state: () => null }, iceCastle: { state: {} } });
    assert.equal(A.doorLocked({ id: 'ship1:dr0L', gen: true, banded: true, ship: {} }), false);
    assert.equal(A.doorLocked({ id: 'ic1gL', gen: true, banded: true, ice: true }), false);
    assert.equal(A.doorLocked({ id: 'k1gL', gen: true, gate: true, castle: 'k1' }), true);
    for (const f of ['src/game/Ships.js', 'src/game/IceMagic.js']) assert.doesNotMatch(readFileSync(f, 'utf8'), /doors\??\._place\??\.?\(\{[^\n]*gate: true/, f);
});
