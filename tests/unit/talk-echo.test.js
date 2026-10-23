// The villagers' own voice in the microphone (the author's journal: a phrase heard half his — «я человек
// простойдел свое а ты можешь со мной пойти»; a lone «дай» from his «Дай подумать…» cast the killing «Дай»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleTalk, spellsIn } from '../../src/game/CastleTalk.js';
import { VoiceGate } from '../../src/game/VoiceGate.js';

test('a spell that is one word of a villager line is noted as his (never cast from my hand by its echo)', () => {
    assert.ok(spellsIn('Дай подумать…').has('Die'));
    assert.ok(spellsIn('Приходит зомби к королю: «Дай мозгов!»').has('Die'));
    assert.equal(spellsIn('Здравствуй! Я Тихон!').size, 0);
    const gate = new VoiceGate();
    gate.noteRemote('Die', 1000);
    // (even with my lips moving lately — I was talking to him — the everyday word from his line is not cast)
    gate.lipsMoved = () => true;
    assert.equal(gate.check('Die', 2000).ok, false);
    assert.equal(gate.check('Jolt', 2000).ok, true);
});

test('his words caught with mine in one phrase are taken out; my own words stay', () => {
    const t = Object.create(CastleTalk.prototype);
    const now = performance.now();
    t._spoken = [{ text: 'Мудрёно говоришь. Я человек простой.', at: now }, { text: 'Интересно говоришь.', at: now }];
    assert.equal(t._unecho('я человек простойдел свое а ты можешь со мной пойти'), 'свое а ты можешь со мной пойти');
    assert.equal(t._unecho('меня зовут дима'), 'меня зовут дима');
    assert.equal(t._unecho('интересно говоришь'), '');
});
