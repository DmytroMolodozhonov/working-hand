import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bossCries, BOSS_LINES, BOSS, Invisibility } from '../../src/game/Invisibility.js';
import { Storm } from '../../src/fx/Storm.js';

describe('невидимость и боссы', () => {
    it('босс кричит при первом обнаружении, потом не чаще раза в AGAIN_T', () => {
        const m = new Map();
        assert.equal(bossCries(m, 'k', 'p', 0), true);
        assert.equal(bossCries(m, 'k', 'p', 1000), false);
        assert.equal(bossCries(m, 'k', 'p', BOSS.AGAIN_T * 1000 + 1), true);
        assert.equal(bossCries(m, 'other', 'p', 1000), true);
    });
    it('босс видит невидимого и кричит одну из фраз, обычный — не видит', () => {
        const inv = new Invisibility({ localId: 'me' });
        inv.on = true;
        const said = [];
        const pos = { x: 1, y: 0, z: 1 };
        assert.equal(inv.aiPos('me', pos, { key: 'b', x: 0, z: 0, say: (t) => said.push(t) }), pos);
        assert.equal(inv.aiPos('me', pos, true), pos);
        assert.equal(inv.aiPos('me', pos), null);
        assert.equal(said.length, 1);
        assert.ok(BOSS_LINES.includes(said[0]));
    });
});

describe('гроза в пещере', () => {
    const heard = (cave, indoor = 0) => Storm.prototype.heard.call({ game: { world: { cave, indoor } } });
    it('на воле слышно всё, в глубине — ничего, у входа — приглушённо', () => {
        assert.ok(Math.abs(heard(0) - 1) < 1e-6);
        assert.equal(heard(0.96), 0);
        assert.equal(heard(1, 1), 0);
        const mid = heard(0.5);
        assert.ok(mid > 0.1);
        assert.ok(mid < 0.8);
        assert.ok(heard(0.2) > heard(0.6));
    });
});
