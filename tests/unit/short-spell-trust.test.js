import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundTrust } from '../../src/audio/SpellPhrase.js';

test('Ahead with matching letters and moving lips passes at a thin fit', () => {
    assert.equal(soundTrust({ spell: 'LumosAhead', canonical: 'эхед', written: 'эхит', fit: 0.1, lips: true }), null);
    assert.equal(soundTrust({ spell: 'LumosAhead', canonical: 'эхед', written: 'эхит', fit: 0, lips: true }), null);
});
test('Fire with matching letters and moving lips passes at a thin fit', () => {
    assert.equal(soundTrust({ spell: 'Fire', canonical: 'файр', written: 'фаер', fit: 0.1, lips: true }), null);
});
test('without seen lips Ahead still needs the short margin', () => {
    assert.notEqual(soundTrust({ spell: 'LumosAhead', canonical: 'эхед', written: 'эхит', fit: 0.1, lips: null }), null);
});
test('quiet Fire with still lips and unlike letters is still refused', () => {
    assert.notEqual(soundTrust({ spell: 'Fire', canonical: 'файр', written: 'ое', fit: 0, lips: false }), null);
});
test('speakers playing still require a clear fit', () => {
    assert.notEqual(soundTrust({ spell: 'Fire', canonical: 'файр', written: 'фаер', fit: 0.2, lips: true, far: 0.6 }), null);
});
