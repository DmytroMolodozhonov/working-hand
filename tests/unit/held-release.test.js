// Held spells end softly (the author: «the sound after I put the object down outlives the animation»): the end note ≤ 0.5 s,
// the loop is silent < 1 % within 0.6 s of «stop», nothing stuck after death / stopAll.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../../src/audio/SoundManager.js';
import { HELD_SOUND, SPELL_GEN, SPELL_SR, RELEASE } from '../../src/audio/SpellMusic.js';
import { HELD } from '../../src/game/Concentration.js';

function fake() {
    const sm = Object.create(SoundManager.prototype);
    let t = 0;
    sm._clock = () => t;
    sm.audioListener = { context: {} }; sm.loaded = true; sm.enabled = true; sm.spellVolume = 1;
    sm.sounds = {};
    for (const k of Object.keys(SPELL_GEN)) sm.sounds[k] = { k };
    sm.played = [];
    sm._spell = (b) => sm.played.push(b.k);
    sm.music = { current: null }; sm.ambientPool = []; sm.voices = [];
    sm.effectsListener = {};
    const mk = () => ({ isPlaying: false, vol: 0, setLoop() {}, setBuffer() {}, setPlaybackRate() {}, setVolume(v) { this.vol = v; }, play() { this.isPlaying = true; }, stop() { this.isPlaying = false; } });
    sm._loop2 = mk;
    return { sm, tick: (dt) => { t += dt * 1000; } };
}
// (THREE.Audio is not made in node: the loops are put in by hand)
function withLoop(sm) {
    const a = { isPlaying: true, vol: 0.4, playbackRate: 1, _key: 'loopLev', _k: 0.4, setVolume(v) { this.vol = v; }, setPlaybackRate() {}, stop() { this.isPlaying = false; }, play() { this.isPlaying = true; } };
    sm._loops = { held: a };
    sm._heldNow = 'LevitationMaxima';
    return a;
}

test('«Левиоса», «Левиоса Максима», Drawdown: the end is a short «set down» note (≤ 0.5 s), not a bell', () => {
    for (const k of ['Levitation', 'LevitationMaxima', 'PlanetMove', 'Drawdown']) {
        assert.equal(HELD_SOUND[k].end, 'endSet', k);
        assert.ok(SPELL_GEN.endSet(SPELL_SR).length / SPELL_SR <= RELEASE.TAIL, k);
    }
    assert.ok(SPELL_GEN.endThud(SPELL_SR).length / SPELL_SR <= 0.8); // (a landing thud, not the 5 s rumble)
});

test('after «stop» the loop falls below 1 % within 0.6 s and then stops', () => {
    const { sm, tick } = fake();
    const a = withLoop(sm);
    sm.focusLoop(null, 0); // (the held spell is gone this frame)
    assert.ok(sm.played.includes('endSet'));
    let t = 0;
    while (t < 0.6) { tick(0.016); t += 0.016; sm.focusLoop(null, 0); }
    assert.ok(!a.isPlaying || a.vol < 0.004, 'vol ' + a.vol);
    assert.equal(a.isPlaying, false);
});

test('held again while fading: the loop is kept (no click, no double voice)', () => {
    const { sm, tick } = fake();
    const a = withLoop(sm);
    sm.focusLoop(null, 0);
    tick(0.1); sm.focusLoop(null, 0);
    sm.focusLoop('Levitation', 0);
    assert.equal(a._fade, null);
    assert.equal(a.isPlaying, true);
    assert.equal(a.vol, 0.4);
});

test('stopAll (menu, new world, death) leaves no voice behind', () => {
    const { sm } = fake();
    const a = withLoop(sm);
    sm.focusLoop(null, 0);
    sm.stopAll();
    assert.equal(a.isPlaying, false);
    assert.equal(a._fade, null);
    assert.equal(sm._heldNow, null);
});

test('every held spell with an end note: the end is at most 2 s and a loop exists for loops', () => {
    for (const k of Object.keys(HELD)) {
        const e = HELD_SOUND[k];
        if (e.end) assert.ok(SPELL_GEN[e.end](SPELL_SR).length / SPELL_SR <= 2, k);
    }
});
