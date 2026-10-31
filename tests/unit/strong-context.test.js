import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundTrust, lateInSpeech, repeatedSpell } from '../../src/audio/SpellPhrase.js';

const avada = { spell: 'AvadaKedavra', canonical: 'авада кедавра', written: 'авада кедавра', lips: true, snr: 14, handAimed: true, known: true };
test('Avada, wand aimed, lips moving, loud enough: +0.5 passes (was 0.6)', () => {
    assert.equal(soundTrust({ ...avada, fit: 0.5 }), null);
});
test('Avada +0.1 «авада кидал» still refused', () => {
    assert.notEqual(soundTrust({ ...avada, written: 'авада кидал', fit: 0.1 }), null);
});
test('without the aimed wand / lips / not known / quiet: the old +0.6', () => {
    assert.notEqual(soundTrust({ ...avada, handAimed: false, fit: 0.5 }), null);
    assert.notEqual(soundTrust({ ...avada, lips: null, fit: 0.5 }), null);
    assert.notEqual(soundTrust({ ...avada, known: false, fit: 0.5 }), null);
    assert.notEqual(soundTrust({ ...avada, snr: 5, fit: 0.5 }), null);
});
test('quiet Avada at +0.4 with letters not like it stays refused (16:07:48)', () => {
    assert.notEqual(soundTrust({ ...avada, written: 'а', snr: 11, fit: 0.4 }), null);
});
test('talk with the word «Авада» (no aimed wand) never casts it', () => {
    assert.notEqual(soundTrust({ ...avada, handAimed: false, written: 'авада', fit: 0.4 }), null);
});
test('a spell said again and again is one spell, not a long speech', () => {
    assert.equal(repeatedSpell('авладыки тавр аватар авлатавр', 'авада кедавра'), true);
    assert.equal(repeatedSpell('ну авада кедавра давай авада кедавра', 'авада кедавра'), true);
    assert.equal(repeatedSpell('я думаю что сегодня хорошая погода и авада кедавра', 'авада кедавра'), false);
    const meta = { native: true, to: 0, written: 'авладыки тавр аватар авлатавр' };
    assert.equal(lateInSpeech('AvadaKedavra', 'авада кедавра', meta, 5486), null);
});
test('real long speech around the spell is still late', () => {
    const meta = { native: true, to: 0, written: 'валим валим слушай ты видел как круто авада кедавра ин' };
    assert.notEqual(lateInSpeech('AvadaKedavra', 'авада кедавра', meta, 5000), null);
});
