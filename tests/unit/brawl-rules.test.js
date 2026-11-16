// «Битва существ» (BrawlRules.js): the teams, the field, the foe search, the mage's distance, the winner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, teamOfMaster, masterOfTeam, otherTeam, FIGHTERS, fighterDef, FIGHTER_GROUPS, pickEnemy, casterMove, winnerOf, placePoints, BRAWL } from '../../src/game/BrawlRules.js';
import { WIZ_RANKS } from '../../src/game/WizardAI.js';

test('a team is a pseudo-master and back; a real player is no team', () => {
    for (const t of ['A', 'B']) assert.equal(teamOfMaster(masterOfTeam(t)), t);
    assert.equal(teamOfMaster('p1'), null);
    assert.equal(teamOfMaster(null), null);
    assert.equal(teamOfMaster('brawl:Z'), null);
    assert.equal(otherTeam('A'), 'B');
});

test('every fighter has a name, an icon, a group, and a real way to be made', () => {
    const ids = new Set();
    for (const f of FIGHTERS) {
        assert.ok(f.label && f.icon && f.group, f.id);
        assert.ok(!ids.has(f.id), 'unique ' + f.id); ids.add(f.id);
        assert.ok(['z', 'a', 'v'].includes(f.kind));
        if (f.kind === 'a') assert.ok(f.type, f.id);
        if (f.kind === 'v') assert.ok(f.role, f.id);
        if (f.rank) assert.ok(WIZ_RANKS[f.rank], 'a rank the game knows: ' + f.rank);
        if (f.caster) assert.ok(f.caster.dmg > 0 && f.caster.every > 0 && f.caster.color, f.id);
    }
    for (const g of ['Нежить', 'Люди', 'Маги', 'Маги стихий', 'Животные']) assert.ok(FIGHTER_GROUPS.includes(g), g);
    assert.equal(fighterDef('nope'), null);
    for (const el of ['fire', 'water', 'earth', 'air']) assert.equal(fighterDef(el).caster.element, el);
});

test('the foe is the nearest of the OTHER team', () => {
    const list = [{ k: 'z', id: 1, team: 'A', x: 1, z: 0 }, { k: 'z', id: 2, team: 'B', x: 10, z: 0 }, { k: 'a', id: 3, team: 'B', x: 4, z: 0 }];
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, list).id, 3);
    assert.equal(pickEnemy('B', { x: 0, z: 0 }, list).id, 1);
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, [list[0]]), null, 'nobody of the other team');
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, []), null);
});

test('a mage closes in, holds and casts, or steps back by the distance', () => {
    assert.equal(casterMove(30), 'close');
    assert.equal(casterMove(BRAWL.KEEP[1] + 0.1), 'close');
    assert.equal(casterMove(12), 'hold');
    assert.equal(casterMove(3), 'back');
});

test('the winner: not before the start, none while both live, a draw when nobody is left', () => {
    assert.equal(winnerOf({ A: 3, B: 0 }, false), null);
    assert.equal(winnerOf({ A: 3, B: 2 }, true), null);
    assert.equal(winnerOf({ A: 3, B: 0 }, true), 'A');
    assert.equal(winnerOf({ A: 0, B: 1 }, true), 'B');
    assert.equal(winnerOf({ A: 0, B: 0 }, true), 'draw');
});

test('a click puts one; Shift a group round it; never beyond the field', () => {
    assert.deepEqual(placePoints(5, 6, 1), [{ x: 5, z: 6 }]);
    const g = placePoints(0, 0, 5);
    assert.equal(g.length, 5);
    for (const p of g) assert.ok(Math.hypot(p.x, p.z) < BRAWL.GROUP_R * 1.3);
    for (const p of placePoints(100, 0, 5)) assert.ok(Math.hypot(p.x, p.z) <= BRAWL.EDGE + 1e-9);
    assert.ok(Math.hypot(...Object.values(placePoints(-90, 90, 1)[0])) <= BRAWL.EDGE + 1e-9);
});

test('teams are two and distinct', () => {
    assert.notEqual(TEAMS.A.color, TEAMS.B.color);
    assert.notEqual(TEAMS.A.label, TEAMS.B.label);
});
