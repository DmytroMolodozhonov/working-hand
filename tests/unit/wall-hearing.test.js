import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CastleLife } from '../../src/game/CastleLife.js';
import { CastleTalk } from '../../src/game/CastleTalk.js';

// A villager behind a wall: my voice, my look and my spells give him nothing (the author: «через стену никак не может взаимодействовать»).
const mkLife = (sees) => {
    const L = Object.create(CastleLife.prototype);
    const decisions = [];
    L.game = { localId: 'me', collision: { lineOfSight: () => sees.v }, remotes: new Map(), character: { group: { position: { x: 0, y: 2, z: 0 } } } };
    L.alog = { decision: (v, t) => decisions.push(t) };
    L._playerPos = () => ({ x: 0, y: 2, z: 0 });
    L.decisions = decisions;
    return L;
};

describe('talk through a wall', () => {
    it('a wall: after a moment of grace the talk ends and he does not face me', () => {
        const s = { v: false }, L = mkLife(s);
        const v = { x: 3, y: 0, z: 0, talking: 4, talkTo: 'me' };
        assert.equal(L._talkBlind(v, 0.3), true);
        assert.equal(v.talking, 4); // (grace)
        assert.equal(L._talkBlind(v, 0.5), true);
        assert.equal(v.talking, 0);
        assert.equal(L.decisions.length, 1);
    });
    it('an open view: he talks as before', () => {
        const L = mkLife({ v: true });
        const v = { x: 3, y: 0, z: 0, talking: 4, talkTo: 'me' };
        assert.equal(L._talkBlind(v, 1), false);
        assert.equal(v.talking, 4);
    });
    it('«the nearest» / «all» never pick one behind a wall', () => {
        const s = { v: false }, L = mkLife(s);
        const v = { id: 'a', x: 2, y: 0, z: 0, cs: { def: {} } };
        const T = Object.create(CastleTalk.prototype);
        T.life = Object.assign(L, { byId: new Map([['a', v]]) });
        T.game = L.game; T.attention = null;
        T.game.character.group.rotation = { y: 0 };
        assert.equal(T._nearest(null, 7), null);
        s.v = true;
        assert.equal(T._nearest(null, 7), v);
    });
});
