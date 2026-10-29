// Every sound has its volume group of the settings (the author: «звуки не регулируются в настройках — например,
// разрушение домов»): the table is src/audio/SoundGroups.js. A new sound without a group fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { SoundManager } from '../../src/audio/SoundManager.js';
import { GROUPS, METHOD_GROUP } from '../../src/audio/SoundGroups.js';

const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const param = (value = 0) => ({ value, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
const node = () => ({ connections: [], gain: param(1), frequency: param(), detune: param(), playbackRate: param(1),
    connect(n) { this.connections.push(n); return n; }, disconnect() {}, start() {}, stop() {}, setPosition() {}, setOrientation() {} });
const context = { currentTime: 1, sampleRate: 8000, destination: node(), listener: { setPosition() {}, setOrientation() {} },
    createGain: node, createBufferSource: node, createPanner: node, createOscillator: node, createBiquadFilter: node,
    createBuffer(ch, len, rate) { return { duration: len / rate, getChannelData: () => new Float32Array(len), copyToChannel() {} }; } };
THREE.AudioContext.setContext(context);

const SOUND_METHOD = /^(play|spell(?!HasCastSound)|ward|space|breakHouse)/;
const methods = () => Object.getOwnPropertyNames(SoundManager.prototype).filter((m) => SOUND_METHOD.test(m) && !/^(prepare|_)/.test(m));

test('every SoundManager sound method is in the group table, and every group has its slider in the settings', () => {
    const missing = methods().filter((m) => !METHOD_GROUP[m]);
    assert.deepEqual(missing, [], 'no volume group for: ' + missing.join(', ') + ' — add it to src/audio/SoundGroups.js');
    for (const [m, g] of Object.entries(METHOD_GROUP)) {
        assert.ok(GROUPS[g], `${m}: unknown group «${g}»`);
        assert.equal(typeof SoundManager.prototype[m], 'function', `${m} is in the table but is not a method`);
    }
    const html = read('index.html');
    for (const [g, { slider, label }] of Object.entries(GROUPS)) {
        assert.match(html, new RegExp(`id="${slider}"`), `${g}: no slider #${slider}`);
        assert.ok(html.includes(label), `${g}: no label «${label}»`);
    }
});

test('no audio source outside the volume buses: only SoundManager and Speech make sound, and each goes through its group', () => {
    const allowed = new Set(['SoundManager.js', 'Speech.js']);
    const hit = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL('../../' + dir, import.meta.url), { withFileTypes: true })) {
            const path = dir + '/' + e.name;
            if (e.isDirectory()) { walk(path); continue; }
            if (!/\.(js|mjs)$/.test(e.name) || allowed.has(e.name) || /VoiceService|vendor/.test(path)) continue;
            if (/new Audio\(|createBufferSource|createOscillator|\.destination\b|new THREE\.(Positional)?Audio\(|speechSynthesis/.test(read(path))) hit.push(path);
        }
    };
    walk('src');
    // (the injury ringing in the HUD is the one outside source — it joins the effects bus, which its own test checks)
    assert.deepEqual(hit.filter((p) => p !== 'src/ui/Hud.js'), [], 'plays sound outside the volume groups');
    const hud = read('src/ui/Hud.js');
    assert.ok(/connect\(sound\.effectsGain\)/.test(hud), 'HUD ringing must join effectsGain');
    // inside SoundManager: only music tracks use the bare listener; everything else the effects bus
    const sm = read('src/audio/SoundManager.js');
    const bare = [...sm.matchAll(/new THREE\.(?:Positional)?Audio\(this\.audioListener\)/g)];
    assert.equal(bare.length, 2, 'only the two music tracks (startTrack, crossfadeTo) may use the bare listener');
    assert.ok(!/ctx\.destination|context\.destination/.test(sm), 'a source straight into the speakers skips every slider');
});

test('probe: every sound method plays through the effects bus, and spell-group ones also scale with the spell slider', () => {
    const s = new SoundManager(new THREE.PerspectiveCamera()); s.loaded = true;
    s.voices = [...Array(10)].map(() => new THREE.Audio(s.effectsListener));
    s.posVoices = [...Array(6)].map(() => new THREE.PositionalAudio(s.effectsListener));
    const buf = { duration: 1 };
    s.sounds = new Proxy(s.sounds, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? buf : undefined) });
    s.setVolume(100); s.setSpellVolume(0);
    const p = new THREE.Vector3(1, 2, 3);
    const audios = () => {
        const out = new Set(), seen = new Set();
        const walk = (o, d = 0) => {
            if (!o || typeof o !== 'object' || seen.has(o) || d > 3 || o === s.scene || o === s.camera || o === s.audioListener) return;
            seen.add(o);
            if (o instanceof THREE.Audio) { out.add(o); return; }
            for (const k of Object.keys(o)) walk(o[k], d + 1);
        };
        walk(s); return out;
    };
    for (const m of methods()) {
        if (METHOD_GROUP[m] === 'music') continue;
        for (const v of audios()) if (v.isPlaying) v.stop();
        for (const v of audios()) v.setVolume(1);
        for (const args of [[p], [p, 'hoot'], ['boom', p], ['Boom', p], [1, p], ['iceBell', p], ['wood', p], ['x', 1], [p, 1], []]) { try { s[m](...args); } catch (e) { /* wrong args for this method */ } }
        const played = [...audios()].filter((v) => v.isPlaying);
        for (const v of played) {
            assert.equal(v.listener, s.effectsListener, `${m}: plays outside the effects bus`);
            if (METHOD_GROUP[m] === 'spells' && m !== 'spaceQuiet') assert.ok(!(v.getVolume() > 0), `${m}: ignores the «заклинания» slider`);
        }
    }
});

test('collapse of buildings: the fall sounds follow the general sound slider (and only there)', () => {
    const s = new SoundManager(new THREE.PerspectiveCamera()); s.loaded = true;
    s.posVoices = [new THREE.PositionalAudio(s.effectsListener)]; s.voices = [new THREE.Audio(s.effectsListener)];
    s.sounds.collapse = { duration: 1 }; s.sounds.groan = { duration: 1 }; s.sounds.crack = { duration: 1 };
    s.setSpellVolume(0); s.setVolume(40);
    s.playCollapse(new THREE.Vector3(), 40); s.playGiveWay(new THREE.Vector3(), 40);
    assert.ok(s.posVoices[0].isPlaying);
    assert.ok(s.posVoices[0].gain.connections.includes(s.effectsGain));
    assert.ok(s.posVoices[0].getVolume() > 0, 'the spell slider must not mute a collapse');
    assert.equal(s.effectsGain.gain.value, 0.4);
    s.setVolume(0); assert.equal(s.effectsGain.gain.value, 0);
});

test('the speech of the people has its own slider (Speech master = talkVolume)', () => {
    assert.ok(/master:\s*\(\)\s*=>\s*this\.game\.sound\?\.talkVolume/.test(read('src/game/CastleTalk.js')));
});
