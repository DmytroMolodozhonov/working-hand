import test from 'node:test';
import assert from 'node:assert/strict';
import { Wanted, wantedLevel, wantedTactics, wreckPoints, WANTED } from '../../src/game/Wanted.js';
import { TerrainData } from '../../src/world/Terrain.js';
import { doorHeld } from '../../src/game/Wreck.js';
import { TARGETS } from '../../src/game/Alohomora.js';

test('wanted: a blast or a kill — they stun; five killed — «Авада Кедавра»; it fades with time', () => {
    const w = new Wanted();
    assert.equal(w.level('p', 0), 0);
    w.add('p', wreckPoints(30), 0); // a blast in the tower
    assert.equal(w.level('p', 1), 1, 'one blast: as before (stun, freeze)');
    assert.equal(wantedTactics(1).avada, 0);
    for (let i = 0; i < 5; i++) w.add('p', 'kill', 2 + i);
    assert.equal(w.level('p', 8), 3, 'five killed');
    assert.ok(wantedTactics(3, 'teacher').avada > 0 && wantedTactics(3, 'student').avada === 0);
    assert.equal(wantedTactics(3).mercy, false);
    // calm for long: it goes down, at last to nothing
    const later = 8 + WANTED.CALM + 400;
    assert.ok(w.level('p', later) < 3);
    assert.equal(w.level('p', later + 2000), 0);
    assert.equal(w.level('other', 8), 0, 'each player his own');
    assert.equal(wantedLevel(WANTED.LEVELS[2]), 2);
});

test('wizard tower: a closed great door in the doorway; the wizards lock their doors', () => {
    const t = new TerrainData();
    t.generate({ seed: 12345, mountains: true });
    let w = null;
    for (let gz = -8; gz < 8 && !w; gz++) for (let gx = -8; gx < 8 && !w; gx++) w = t.towers.cellOf(gx, gz);
    const tower = w.houses.find((h) => h.kind === 'tower');
    assert.ok(tower.doorRec, 'the academy has a door');
    assert.ok(doorHeld(t, tower.doorRec), 'it hangs in its doorway');
    assert.equal(TARGETS.wizardDoor.plain, 'unlock');
});

test('blame: nobody reads minds — a tree woken unseen is blamed on the tree; a seen cast or a plain sight tells', async () => {
    const { knowsCulprit, spellFamily } = await import('../../src/game/Blame.js');
    // the player far off, unseen: nobody knows (the tree is the enemy)
    assert.equal(knowsCulprit({ via: 'alive', seesPlayer: false }), false);
    // seen, but 20 m from the tree: a villager doesn't connect them; a wizard neither
    assert.equal(knowsCulprit({ via: 'alive', seesPlayer: true, dPlayer: 15, dSource: 20 }), false);
    assert.equal(knowsCulprit({ via: 'alive', wizard: true, seesPlayer: true, dPlayer: 15, dSource: 20 }), false);
    // right by the tree, steering it: a wizard understands, a villager doesn't
    assert.equal(knowsCulprit({ via: 'alive', wizard: true, seesPlayer: true, dPlayer: 15, dSource: 5 }), true);
    assert.equal(knowsCulprit({ via: 'alive', seesPlayer: true, dPlayer: 15, dSource: 5 }), false);
    // saw him cast «Alive»: knows
    assert.equal(knowsCulprit({ via: spellFamily('Alive'), sawCast: true }), true);
    // a direct blow: seen in sight; at night the sight is short
    assert.equal(knowsCulprit({ seesPlayer: true, dPlayer: 25 }), true);
    assert.equal(knowsCulprit({ seesPlayer: true, dPlayer: 25, night: true }), false);
    assert.equal(spellFamily('InfernoMaxima'), 'fire');
});
