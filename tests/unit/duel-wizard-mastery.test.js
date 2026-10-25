import test from 'node:test';
import assert from 'node:assert/strict';
import { Duel } from '../../src/game/Duel.js';

function duel() {
    const wizards = new Map([
        ['novice', { wizard: true, entry: { rank: 'novice' }, role: 'student', mana: 50, hp: 14, maxHp: 14 }],
        ['adept', { wizard: true, rank: 'adept', role: 'adept', mana: 100, hp: 20, maxHp: 20 }],
        ['teacher', { wizard: true, entry: { rank: 'teacher' }, role: 'teacher', mana: 200, hp: 24, maxHp: 24 }],
        ['master', { wizard: true, role: 'master', mana: 500, hp: 32, maxHp: 32 }],
    ]);
    return Object.assign(Object.create(Duel.prototype), {
        game: {
            localId: 'me', mana: { mastery: 17 }, config: { mode: 'freeworld' },
            castleLife: { byId: wizards }, combat: { enabled: true },
            remotes: new Map([['friend', { mastery: 31 }]]),
        },
    });
}

test('wizard mastery resolves entry rank, legacy rank and role without a ReferenceError', () => {
    const d = duel();
    for (const [id, expected] of [['novice', 25], ['adept', 50], ['teacher', 100], ['master', 250]]) {
        assert.equal(d._mastery(id), expected, id);
    }
    assert.equal(d._mastery('me'), 17);
    assert.equal(d._mastery('friend'), 31);
    assert.equal(d._mastery('unknown'), 0);
});

test('a full-health arena wizard beam clash includes mastery in strength', () => {
    const d = duel();
    assert.equal(d._strength('adept', 0, 'me'), 150);
    assert.equal(d._strength('master', 0, 'me'), 750);
});