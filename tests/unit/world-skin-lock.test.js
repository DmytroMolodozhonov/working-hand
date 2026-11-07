// Скин закреплён за картой (автор 07.11): герой, с которым игрок вошёл в карту, остаётся в ней; новый выбор в «Персонаже» — только для новых карт.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playerSnapshot, applyPlayerSnapshot } from '../../src/game/WorldSave.js';

const fakeGame = (look) => ({
    config: { look: { skin: 'new' } },
    character: { look, group: { position: { x: 1, y: 2, z: 3, set(x, y, z) { Object.assign(this, { x, y, z }); }, copy() {} }, rotation: {} }, setLook(l) { this.look = l; } },
    sync: { n: 0, sendLook() { this.n++; } },
});

test('the skin is saved with the player and comes back over a newly picked one', () => {
    const g1 = fakeGame({ skin: 'old', hair: 3 });
    const snap = playerSnapshot(g1);
    assert.deepEqual(snap.look, { skin: 'old', hair: 3 }, 'the look is in the snapshot');
    assert.notEqual(snap.look, g1.character.look, 'a copy, not the live object');
    const g2 = fakeGame({ skin: 'new' }); // (the player picked another hero in «Персонаж» after)
    applyPlayerSnapshot(g2, JSON.parse(JSON.stringify(snap)));
    assert.deepEqual(g2.character.look, { skin: 'old', hair: 3 }, 'the world keeps its skin');
    assert.deepEqual(g2.config.look, { skin: 'old', hair: 3 });
    assert.equal(g2.sync.n, 1, 'the others are told how the hero looks');
});

test('an old save without a skin changes nothing (the look then in use is kept and saved next time)', () => {
    const g = fakeGame({ skin: 'new' });
    applyPlayerSnapshot(g, { slots: [] });
    assert.deepEqual(g.character.look, { skin: 'new' });
    assert.equal(g.sync.n, 0);
});
