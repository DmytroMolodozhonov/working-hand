import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lateInSpeech } from '../../src/audio/SpellPhrase.js';

test('a spell repeated three times arriving late still casts', () => {
    assert.equal(lateInSpeech('Inferno', 'инферно', { native: true, to: 0, written: 'инферно инферно инферно' }, 6750), null);
});
test('a spell inside long talk arriving late is still refused', () => {
    assert.notEqual(lateInSpeech('AvadaKedavra', 'авада кедавра', { native: true, to: 0, written: 'о смотри видишь как круто я проиграл абадакида ин' }, 7800), null);
});
