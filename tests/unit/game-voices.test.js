// The game's own voices from the speakers (a merchant, a guard, a wizard) never cast a spell from my hand:
// the game knows what its villagers said and when (src/audio/GameVoices.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { aired, clearAired, gameSaid, editsInside } from '../../src/audio/GameVoices.js';

test('a spell\'s words in a villager\'s line, heard while it sounded, are the villager\'s', () => {
    clearAired();
    aired('Возьми поджаренный хлеб, он прямо с костра!', 1000, 3500);
    aired('Осторожно, огонь!', 10000, 11000);
    assert.ok(gameSaid('Fire', 3000, 3600), '«костра» is «костёр» — Fire');
    assert.ok(gameSaid('Inferno', 10500, 11200), '«огонь» — Inferno');
    // (heard a little after the line ended: the sound card and the room's echo)
    assert.ok(gameSaid('Fire', 4000, 4300));
});

test('my own spell is mine: another spell, or the same one said long after the line', () => {
    clearAired();
    aired('Возьми поджаренный хлеб, он прямо с костра!', 1000, 3500);
    assert.equal(gameSaid('Bombardo', 2000, 2600), null, 'the merchant said no «Бомбардо»');
    assert.equal(gameSaid('Fire', 8000, 8600), null, 'said 4.5 s after the line');
    assert.equal(gameSaid('Fire', 0, 600), null, 'said before the line');
});

test('a short spell word is a whole word of the line («ап» is not inside «капуста»)', () => {
    clearAired();
    aired('Капуста свежая, лук и репа!', 0, 3000);
    assert.equal(gameSaid('Up', 1000, 1400), null);
    aired('Ап! Вставай!', 5000, 6000);
    assert.ok(gameSaid('Up', 5200, 5600));
});

test('letters a little off still count: a swap of two neighbours is one change', () => {
    assert.equal(editsInside('костер', 'возьмикостре'), 1);
    assert.equal(editsInside('бомбардо', 'кричалбомбарда'), 1);
    assert.equal(editsInside('файр', 'фаер'), 1);
    assert.equal(editsInside('ап', 'капуста'), 0);
});
