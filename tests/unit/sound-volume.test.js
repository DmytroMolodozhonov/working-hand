import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SoundManager } from '../../src/audio/SoundManager.js';
import { Hud } from '../../src/ui/Hud.js';

const param = (value = 0) => ({ value, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
const node = () => ({ connections: [], gain: param(1), frequency: param(), detune: param(), playbackRate: param(1),
    connect(n) { this.connections.push(n); return n; }, disconnect() {}, start() {}, stop() {},
    setPosition() {}, setOrientation() {},
});
const context = { currentTime: 1, sampleRate: 8000, destination: node(), listener: { setPosition() {}, setOrientation() {} },
    createGain: node, createBufferSource: node, createPanner: node, createOscillator: node,
    createBuffer(ch, len, rate) { return { duration: len / rate, getChannelData: () => new Float32Array(len) }; },
};
THREE.AudioContext.setContext(context);
const make = () => { const s = new SoundManager(new THREE.PerspectiveCamera()); s.loaded = true; s.voices = [new THREE.Audio(s.effectsListener)]; s.posVoices = [new THREE.PositionalAudio(s.effectsListener)]; return s; };
const routes = (s, v) => assert.ok(v.gain.connections.includes(s.effectsGain), 'effect goes through the general sound control');

test('general sound volume scales and mutes existing spell voices, positional effects, themes and held loops', () => {
    const s = make(), b = { duration: 10 }, p = new THREE.Vector3(); s.setSpellVolume(50);
    s._spell(b, 0.8); routes(s, s.voices[0]); assert.equal(s.voices[0].getVolume(), 0.4);
    s._spellAt(b, p, 0.6); routes(s, s.posVoices[0]); assert.equal(s.posVoices[0].getVolume(), 0.3);
    s.sounds.thBoom = b; s.spellCast('Boom', p); routes(s, s._spellTheme);
    s.sounds.loopFlight = b; s._loop('flight', 'loopFlight', 0.4); routes(s, s._loops.flight);
    s.sounds.houseTheme100_1 = b; s.playHouseTheme(p); routes(s, s._theme);
    s.setVolume(0); assert.equal(s.effectsGain.gain.value, 0);
    for (const v of [...s.voices, ...s.posVoices, s._theme, s._spellTheme, s._loops.flight]) assert.equal(v.isPlaying, true, 'changing volume does not replay or stop the source');
    s.setVolume(50); assert.equal(s.effectsGain.gain.value, 0.5); assert.equal(s.voices[0].getVolume() * s.effectsGain.gain.value, 0.2);
});

test('ordinary effects are scaled once while music and resident speech keep independent volume', () => {
    const s = make(), b = { duration: 1 };
    s.setVolume(50); s._play(b, 0.8); assert.equal(s.voices[0].getVolume(), 0.8);
    assert.equal(s.voices[0].getVolume() * s.effectsGain.gain.value, 0.4);
    s.setMusicVolume(70); s.setTalkVolume(60); s.startTrack(b, 'ambient');
    assert.ok(s.music.current.gain.connections.includes(s.audioListener.getInput()));
    assert.ok(!s.music.current.gain.connections.includes(s.effectsGain));
    s.setVolume(0); assert.equal(s.music.current.getVolume(), 0.7); assert.equal(s.talkVolume, 0.6);
    s.setVolume(100); s.setSpellVolume(0); s._spell(b); assert.equal(s.voices[0].getVolume(), 0);
    s._play(b, 0.8); assert.equal(s.voices[0].getVolume(), 0.8);
});

test('sound settings clamp to 0–100 and injury ringing follows general sound volume', () => {
    const s = make(); assert.equal(s.effectsGain.gain.value, 0.2);
    for (const [input, value] of [[-10, 0], [200, 1], ['bad', 0], [25, 0.25]]) { s.setVolume(input); assert.equal(s.effectsGain.gain.value, value); }
    const hud = { getSound: () => s }; Hud.prototype._ringing.call(hud, 0.9);
    assert.ok(hud._ring); assert.ok(hud._ring.gain.connections.includes(s.effectsGain));
});

test('playing positional effects schedule finite panner times using the real listener frame interval', () => {
    const s = make(), v = s.posVoices[0], times = [];
    for (const name of ['positionX', 'positionY', 'positionZ', 'orientationX', 'orientationY', 'orientationZ']) {
        v.panner[name] = { linearRampToValueAtTime(value, time) { assert.ok(Number.isFinite(value)); assert.ok(Number.isFinite(time)); times.push(time); } };
    }
    s.audioListener.timeDelta = 0.016;
    v.setBuffer({ duration: 1 }); v.play(); v.updateMatrixWorld(true);
    assert.equal(times.length, 6); assert.ok(times.every(t => t === 1.016));
    times.length = 0; s.audioListener.timeDelta = 0.02; v.updateMatrixWorld(true);
    assert.ok(times.every(t => t === 1.02)); assert.equal(times.length, 6);
});