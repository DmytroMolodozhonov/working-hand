// «Битва существ» (BrawlRules.js): the teams, the field, the foe search, the mage's distance, the winner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, teamOfMaster, masterOfTeam, otherTeam, FIGHTERS, fighterDef, FIGHTER_GROUPS, pickEnemy, winnerOf, placePoints, BRAWL, foeId, foeRef, isMage, teamAt, onSide, customFighter, MAX_CUSTOM_MANA } from '../../src/game/BrawlRules.js';
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
        if (f.kind === 'v') assert.ok(f.role || f.elemental, f.id);
        if (f.rank) assert.ok(WIZ_RANKS[f.rank], 'a rank the game knows: ' + f.rank);
    }
    for (const g of ['Нежить', 'Люди', 'Маги', 'Маги стихий', 'Животные']) assert.ok(FIGHTER_GROUPS.includes(g), g);
    assert.equal(fighterDef('nope'), null);
    // (the four elemental mages are the game's REAL ones — their own brain, not a bolt of a colour)
    for (const el of ['fire', 'water', 'earth', 'air']) { assert.equal(fighterDef(el).elemental, el); assert.ok(!fighterDef(el).caster, el); }
});

test('the foe is the nearest of the OTHER team', () => {
    const list = [{ k: 'z', id: 1, team: 'A', x: 1, z: 0 }, { k: 'z', id: 2, team: 'B', x: 10, z: 0 }, { k: 'a', id: 3, team: 'B', x: 4, z: 0 }];
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, list).id, 3);
    assert.equal(pickEnemy('B', { x: 0, z: 0 }, list).id, 1);
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, [list[0]]), null, 'nobody of the other team');
    assert.equal(pickEnemy('A', { x: 0, z: 0 }, []), null);
});

test('a foe id for the mages\' real brains goes there and back; a player\'s id is no foe of this kind', () => {
    assert.deepEqual(foeRef(foeId('z', 12)), { k: 'z', id: 12 });
    assert.deepEqual(foeRef(foeId('a', 7)), { k: 'a', id: 7 });
    assert.deepEqual(foeRef(foeId('v', 'brawlfield:3')), { k: 'v', id: 'brawlfield:3' });
    assert.equal(foeRef('p1'), null);
    assert.equal(foeRef(null), null);
    assert.equal(foeRef('bf|x|1'), null);
});

test('every mage (ordinary and elemental) is run by his own brain; the others are servants of their team', () => {
    for (const id of ['novice', 'wizard', 'archmage', 'fire', 'water', 'earth', 'air']) assert.ok(isMage(fighterDef(id)), id);
    for (const id of ['zombie', 'knight', 'cow', 'pig', 'sheep', 'horse']) assert.ok(!isMage(fighterDef(id)), id);
    assert.ok(!isMage(null));
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

test('the team is the SIDE of the field: left red, right blue, nobody on the strip between them', () => {
    const h = BRAWL.STRIP / 2;
    assert.equal(teamAt(-20), 'A');
    assert.equal(teamAt(20), 'B');
    assert.equal(teamAt(0), null);
    assert.equal(teamAt(-h + 0.01), null);
    assert.equal(teamAt(h - 0.01), null);
    assert.equal(teamAt(-h - 0.01), 'A');
    assert.equal(teamAt(h + 0.01), 'B');
});

test('a group put near the strip never crosses it', () => {
    const h = BRAWL.STRIP / 2;
    for (let k = 0; k < 40; k++) {
        for (const q of placePoints(-h - 1.2, 3, 5, Math.random, 'A')) assert.ok(teamAt(q.x) === 'A', 'A stays left: ' + q.x);
        for (const q of placePoints(h + 1.2, 3, 5, Math.random, 'B')) assert.ok(teamAt(q.x) === 'B', 'B stays right: ' + q.x);
    }
    assert.ok(onSide(0, 'A') < -h && onSide(0, 'B') > h);
    assert.equal(onSide(5, null), 5);
});

test('teams are two and distinct', () => {
    assert.notEqual(TEAMS.A.color, TEAMS.B.color);
    assert.notEqual(TEAMS.A.label, TEAMS.B.label);
});

test('a custom fighter keeps his own mana and element without editing the roster presets', () => {
    const fire = customFighter('fire', { name: 'Искра', mana: 137 });
    assert.deepEqual([fire.label, fire.elemental, fire.mana], ['Искра', 'fire', 137]);
    assert.equal(fighterDef('fire').mana, 400);
    assert.equal(customFighter('water', { mana: 0 }).mana, 0);
    assert.equal(customFighter('wizard', { mana: -53 }).mana, 0);
    assert.equal(customFighter('wizard', { mana: 2001 }).mana, MAX_CUSTOM_MANA);
    assert.equal(customFighter('knight', { mana: 40 }).mana, undefined);
});
