import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundTrust } from '../../src/audio/SpellPhrase.js';

// Journal 21:46 (a fight, speakers 77–89 %, mouth seen moving): the letters of the network were garbage, the spell is mine.
const base = { lips: true, far: 0.85, snr: 24, combat: true };
test('fight: Frozen with garbage letters, lips moving, loud, thin fit — cast', () => {
    assert.equal(soundTrust({ ...base, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: 0.1 }), null);
});
test('fight: Accio / Wind with garbage letters — cast', () => {
    assert.equal(soundTrust({ ...base, spell: 'Accio', canonical: 'акцио', written: 'аб', fit: 0.1 }), null);
    assert.equal(soundTrust({ ...base, spell: 'Wind', canonical: 'вайнд', written: 'аваше се', fit: 0.8 }), null);
});
test('no fight: the same is still refused (talk)', () => {
    assert.notEqual(soundTrust({ ...base, combat: false, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: 0.1 }), null);
});
test('fight, but lips still / quiet / negative fit — refused', () => {
    assert.notEqual(soundTrust({ ...base, lips: false, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: 0.1 }), null);
    assert.notEqual(soundTrust({ ...base, lips: null, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: 0.1 }), null);
    assert.notEqual(soundTrust({ ...base, snr: 8, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: 0.1 }), null);
    assert.notEqual(soundTrust({ ...base, spell: 'Frozen', canonical: 'фрозен', written: 'васи', fit: -0.2 }), null);
});
test('fight: a spell that is not a battle one (Avada, Create a bridge) keeps its checks', () => {
    assert.notEqual(soundTrust({ ...base, spell: 'AvadaKedavra', canonical: 'авада кедавра', written: 'васи', fit: 0.1 }), null);
    assert.notEqual(soundTrust({ ...base, spell: 'CreateBridge', canonical: 'криейт э бридж', written: 'онаше', fit: 0.4 }), null);
});
