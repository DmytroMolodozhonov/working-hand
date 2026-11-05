/**
 * A guest's beams' clash lives on the host's word: when the host goes quiet (left, its «end» lost) the clash ends by itself.
 * A clash left behind blocked every spell for good («Идёт дуэль») — the author: «мы долго играли… перестали работать заклинания».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Duel } from '../../src/game/Duel.js';

test('a guest\'s clash with no word from the host for 3 s is finished', () => {
    const ended = [];
    const c = { a: { by: 'x', id: 1 }, b: { by: 'y', id: 2 }, t: 0, p: 0.5, pNet: null };
    const self = {
        me: 'me', game: { authority: false }, clashes: [c],
        _referee: () => false, _handOf: () => false, _note() {}, _finishClash: (cc, loser) => ended.push([cc, loser]),
    };
    for (let i = 0; i < 20; i++) Duel.prototype._updateClash.call(self, c, 0.1);
    assert.equal(ended.length, 0, 'two seconds of silence: still on');
    for (let i = 0; i < 15; i++) Duel.prototype._updateClash.call(self, c, 0.1);
    assert.ok(ended.length >= 1 && ended[0][1] === null, 'past 3 s: ended, nobody hurt');
});
