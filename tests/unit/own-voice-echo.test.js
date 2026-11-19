// The game's own voice coming back through the microphone is not mine (SpellPhrase.ownVoiceEcho, the author 19.11: the merchant answered himself).
// The cases are from the author's journal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownVoiceEcho, ECHO_SNR } from '../../src/audio/SpellPhrase.js';

test('his own words heard back: not mine (even garbled), the journal\'s «а гость здравствуй» over «А, гость. Здравствуй.»', () => {
    assert.ok(ownVoiceEcho('а гость здравствуй', { native: true, far: 0.34, snr: 11 }, 'А, гость. Здравствуй.'));
    assert.ok(ownVoiceEcho('здравствуй', { native: true }, 'А, гость. Здравствуй.'), 'the words alone are enough');
});

test('a quiet copy while the speakers played: «положите пять» (−68 dB, 47 % of the phrase) over «Ставка пятьдесят монет»', () => {
    assert.ok(ownVoiceEcho('положите пять', { native: true, far: 0.47, snr: 6 }, 'Хорошо! Младший волшебник. Ставка пятьдесят монет:'));
    assert.ok(ownVoiceEcho('ставка пятьдесят', { native: true, far: 0.37, snr: 7 }, 'Хорошо! Младший волшебник. Ставка пятьдесят монет:'));
});

test('me: my mouth moved with it, no game voice sounded, loud enough, or the speakers did not play — it is mine', () => {
    const line = 'Ставка пятьдесят монет';
    assert.equal(ownVoiceEcho('хочу сделать ставку на младшего', { native: true, far: 0.08, snr: 49 }, line), null, 'loud, the speakers hardly played');
    assert.equal(ownVoiceEcho('положите пять', { native: true, far: 0.47, snr: 6 }, line, true), null, 'the camera saw my mouth move');
    assert.equal(ownVoiceEcho('положите пять', { native: true, far: 0.47, snr: 6 }, null), null, 'no game voice then');
    assert.equal(ownVoiceEcho('положите пять', { native: true, far: 0.1, snr: 6 }, line), null, 'the speakers were quiet: my own whisper');
    assert.equal(ownVoiceEcho('', {}, line), null);
    assert.ok(ECHO_SNR > 0);
});
