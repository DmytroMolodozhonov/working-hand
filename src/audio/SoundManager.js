/**
 * SoundManager.js — music + sound effects.
 *
 * Same files, volumes and music logic (ambient tracks cycling, battle music
 * crossfade when zombies are near) as the original. Changes:
 *   - effects play through a fixed pool of voices (the original created a new
 *     audio node for every hit and never released it),
 *   - positional sounds are actually placed in the scene (death sounds were
 *     always played at the world origin before),
 *   - the explosion / cast sounds for «Бомбардо» are synthesised in code,
 *   - a missing or broken file no longer disables all sound.
 */

import { ARENA_SOUNDS, synthArena } from './ArenaSounds.js';
import { synthOwl, OWL_SOUNDS } from './OwlSounds.js';
import { synthSpencer, SPENCER_SOUNDS } from './SpencerSounds.js';
import { synthGhost, GHOST_SOUND_IDS } from './GhostSounds.js';
import { synthGargoyle, GARGOYLE_SOUNDS } from './GargoyleSounds.js';
import { synthDragon, DRAGON_SOUNDS } from './DragonSounds.js';
import { synthDevil, DEVIL_SOUNDS } from './DiabolosSounds.js';
import { synthPlant, PLANT_SOUNDS } from './PlantSounds.js';
import { synthCanary, CANARY_SOUNDS } from './CanarySounds.js';
import { synthTaron, TARON_SOUNDS } from './TaronSounds.js';
import { synthThrow, THROW_SOUNDS } from './ThrowSounds.js';
import { synthGrab, GRAB_SOUNDS } from './GrabSounds.js';
import * as THREE from 'three';
import { houseTheme, houseThemeBreak } from './HouseTheme.js';

const FILES = [
    { key: 'ambient', path: 'sounds/Звук зомби.wav' },
    { key: 'death', path: 'sounds/Звук смерти зомби.wav' },
    { key: 'h1', path: 'sounds/Звук удара зомби 1.wav' },
    { key: 'h2', path: 'sounds/Звук удара зомби2.wav' },
    { key: 'h3', path: 'sounds/Звук удара зомби3.wav' },
    { key: 'thunder', path: 'sounds/Резкий удар молнии.wav' },
    { key: 'inferno', path: 'sounds/Огненой эффект.wav' },
    { key: 'sapira', path: 'sounds/Сапира.wav' },
    { key: 'ice', path: 'sounds/Заморозка.wav' },
    { key: 'sand', path: 'sounds/Рассыпаться в песок.wav' },
    { key: 'shatter', path: 'sounds/Разбитие зомби.wav' },
    { key: 'm1', path: 'music/Музыка1.mp3' },
    { key: 'm2', path: 'music/Музыка2.mp3' },
    { key: 'battle', path: 'music/Музыка для начала битвы.mp3' },
];

/** Runs a sound-making generator to its end (when it is needed now). */
import { SPACE_SOUNDS } from './SpaceSounds.js';
import { SPELL_GEN, SPELL_SOUND, HELD_SOUND, SPELL_SR, RELEASE } from './SpellMusic.js';

function finish(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }

/** m: a zombie this near is heard growling (Звук зомби.wav, from its start, from where it stands). */
export const ZOMBIE_HEAR = 8;

export class SoundManager {
    constructor(camera) {
        this.camera = camera;
        this.audioListener = new THREE.AudioListener();
        camera.add(this.audioListener);
        this.sounds = { death: null, thunder: null, inferno: null, sapira: null, hits: [], ice: null, sand: null, shatter: null };
        this.music = { ambient: [], battle: null, current: null, currentIndex: 0, state: 'idle', volume: 0.2 };
        this.battleTimer = 0;
        this.isBattleMode = false;
        this.ambientPool = [];
        this.maxAmbient = 3;
        this.enabled = true;
        this.ambientEnabled = true; // "Звуки рычания" setting (zombie growls only)
        this.globalVolume = 0.2; // (all sounds start at 20%: the settings sliders)
        // All effects, including spells, share a live master gain. Music and speech remain independent.
        this.effectsGain = this.context.createGain();
        this.effectsGain.gain.value = this.globalVolume;
        this.effectsGain.connect(this.audioListener.getInput());
        const listener = this.audioListener;
        this.effectsListener = {
            context: this.context, getInput: () => this.effectsGain,
            get timeDelta() { return listener.timeDelta; },
        };
        this.talkVolume = 0.4; // the villagers' voices: their own slider («Громкость голосов жителей», 40% — twice the old loudness)
        this.audioLoader = new THREE.AudioLoader();
        this.voices = [];
        this.posVoices = [];
        this._voiceIdx = 0;
        this._posIdx = 0;
        this.loaded = false;
        this.scene = null;
    }

    get context() {
        return this.audioListener.context;
    }

    async loadSounds(onProgress) {
        let done = 0;
        const results = {};
        await Promise.all(FILES.map(async (f) => {
            try {
                results[f.key] = await this.loadBuffer(encodeURI(f.path));
            } catch (e) {
                console.warn('[Sound] could not load', f.path, e?.message || e);
            }
            done++;
            if (onProgress) onProgress(done / FILES.length);
        }));

        if (results.ambient) {
            for (let i = 0; i < this.maxAmbient; i++) {
                const sound = new THREE.PositionalAudio(this.effectsListener);
                sound.setBuffer(results.ambient);
                sound.setRefDistance(2);
                sound.setLoop(true);
                sound.setVolume(1.0);
                this.ambientPool.push({ sound, activeObject: null });
            }
        }
        this.sounds.death = results.death || null;
        this.sounds.hits = [results.h1, results.h2, results.h3].filter(Boolean);
        this.sounds.thunder = results.thunder || null;
        this.sounds.inferno = results.inferno || null;
        this.sounds.sapira = results.sapira || null;
        this.sounds.ice = results.ice || null;
        this.sounds.sand = results.sand || null;
        this.sounds.shatter = results.shatter || null;
        this.music.ambient = [results.m1, results.m2].filter(Boolean);
        this.music.battle = results.battle || null;
        this.sounds.explosion = this._synthExplosion();
        this.sounds.cast = this._synthWhoosh();
        this.sounds.noMana = this._synthNoMana(); // (made now, never at the first «не хватает маны»)

        for (let i = 0; i < 10; i++) this.voices.push(new THREE.Audio(this.effectsListener));
        for (let i = 0; i < 6; i++) this.posVoices.push(new THREE.PositionalAudio(this.effectsListener));
        if (this.scene) this.setScene(this.scene);
        this.loaded = true;
        this.prepareSpellMusic(); // (starts the worker now: ready long before the loading screen ends)
        this.playAmbientMusic();
        // (the tune of «Create a House» and the other long sounds: made on the loading screen — warmAll)
    }

    /**
     * Every sound otherwise made the first time it is heard (or a little a frame in the first seconds
     * of play — each of them a frozen frame: a 10 s hum, a choir, a blast), made now, on the loading
     * screen, with pauses between pieces so the loading screen still moves. Once per session (kept).
     */
    async warmAll(onProgress) {
        if (!this.context || !this.loaded || this._allWarm) return;
        const pause = () => new Promise((r) => setTimeout(r, 0));
        let n = 0;
        while (this.prewarmStep()) { onProgress?.(Math.min(0.6, ++n / 20)); await pause(); }
        this.prepareHouseTheme(); this.prepareCastleTheme(); onProgress?.(0.7);
        for (let L = 2; L <= 5; L++) this.prepareHouseTheme(10, L); // («Improve a House»: in workers, ready long before) await pause(); // (the castle's long tune: in a worker)
        while (!this.prepareCircleAttack()) await pause();
        onProgress?.(0.85);
        while (!this.prepareInspirius()) await pause();
        while (!this.prepareBoom()) await pause(); // («Бум»: the swelling groan and the blast with its long echo)
        onProgress?.(0.9);
        // (the spells' tunes and effects: in a worker since loadSounds — SpellMusic.js; not ready yet — at most
        // a moment more: the rest come in play, only put into buffers then, no synthesis in a frame)
        await Promise.race([this.prepareSpellMusic(pause), new Promise((r) => setTimeout(r, 1500))]);
        onProgress?.(1);
        this._allWarm = true;
    }

    loadBuffer(path) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(path, resolve, undefined, reject);
        });
    }

    setScene(scene) {
        this.scene = scene;
        for (const item of this.ambientPool) scene.add(item.sound);
        for (const v of this.posVoices) scene.add(v);
    }

    setVolume(val) {
        this.globalVolume = Math.max(0, Math.min(100, Number(val) || 0)) / 100;
        this.effectsGain.gain.setValueAtTime(this.globalVolume, this.context.currentTime);
    }

    /** The voices of the people (villagers, sailors, the advisor…), 0..100. */
    setTalkVolume(val) {
        this.talkVolume = Math.max(0, Math.min(100, Number(val) || 0)) / 100;
    }

    setMusicVolume(val) {
        const gain = val / 100;
        this.music.volume = gain;
        if (this.music.current) this.music.current.setVolume(gain);
    }

    /** Volume of the spell sounds (0..100), separate from zombies and music. */
    setSpellVolume(val) {
        this.spellVolume = Math.max(0, Math.min(100, Number(val) || 0)) / 100;
    }

    _spell(buffer, volume = 1, rate = 1) {
        this._play(buffer, volume * (this.spellVolume ?? 1), rate);
    }

    /** A spell's sound at a place: the «заклинания» slider × the general «звуки» bus (SoundGroups.js). */
    _castAt(buffer, position, volume = 1, refDistance = 5, rate = 1) {
        this._playAt(buffer, position, volume * (this.spellVolume ?? 1), refDistance, rate);
    }

    async resume() {
        if (this.context.state === 'suspended') {
            try { await this.context.resume(); } catch (e) { /* user gesture needed */ }
        }
    }

    // ----------------------------------------------------------------- music
    playAmbientMusic() {
        if (!this.enabled || !this.music.ambient.length) return;
        this.startTrack(this.music.ambient[this.music.currentIndex % this.music.ambient.length], 'ambient');
    }

    startTrack(buffer, type) {
        if (this.music.current && this.music.current.isPlaying) this.music.current.stop();
        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(buffer);
        sound.setLoop(type === 'battle');
        sound.setVolume(this.music.volume);
        sound.play();
        if (type === 'ambient') sound.onEnded = () => this._nextAmbient(sound);
        this.music.current = sound;
        this.music.state = type;
    }

    _nextAmbient(sound) {
        sound.isPlaying = false;
        if (this.music.state === 'ambient' && this.music.current === sound) {
            this.music.currentIndex = (this.music.currentIndex + 1) % this.music.ambient.length;
            this.playAmbientMusic();
        }
    }

    updateMusic(dt, nearestZombieDist) {
        if (!this.enabled) return;
        const BATTLE_RANGE = 20.0, BATTLE_END_DELAY = 20.0;
        if (nearestZombieDist < BATTLE_RANGE) {
            this.battleTimer = BATTLE_END_DELAY;
            if (!this.isBattleMode) {
                this.isBattleMode = true;
                this.crossfadeTo('battle', 3.0);
            }
        } else if (this.battleTimer > 0) {
            this.battleTimer -= dt;
        } else if (this.isBattleMode) {
            this.isBattleMode = false;
            this.crossfadeTo('ambient', 5.0);
        }
    }

    crossfadeTo(targetState, duration) {
        const nextBuffer = targetState === 'battle' ? this.music.battle : this.music.ambient[this.music.currentIndex % Math.max(1, this.music.ambient.length)];
        if (!nextBuffer) return;
        const ctx = this.context;
        const next = new THREE.Audio(this.audioListener);
        next.setBuffer(nextBuffer);
        next.setLoop(targetState === 'battle');
        next.setVolume(0);
        next.play();
        if (targetState === 'ambient') next.onEnded = () => this._nextAmbient(next);
        next.gain.gain.setValueAtTime(0, ctx.currentTime);
        next.gain.gain.linearRampToValueAtTime(this.music.volume, ctx.currentTime + duration);
        const old = this.music.current;
        if (old && old.isPlaying) {
            old.gain.gain.cancelScheduledValues(ctx.currentTime);
            old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
            old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
            setTimeout(() => { if (old.isPlaying) old.stop(); old.disconnect?.(); }, duration * 1000 + 50);
        }
        this.music.current = next;
        this.music.state = targetState;
    }

    stopAll() {
        if (this.music.current && this.music.current.isPlaying) this.music.current.stop();
        this.music.state = 'idle';
        for (const item of this.ambientPool) if (item.sound.isPlaying) item.sound.stop();
        for (const v of this.voices) if (v.isPlaying) v.stop();
        for (const a of Object.values(this._loops || {})) { a._fade = null; if (a.isPlaying) a.stop(); } // (the held spells' loops, space's pad)
        if (this._spellTheme?.isPlaying) this._spellTheme.stop();
        this._heldNow = null;
    }

    // ------------------------------------------------------------------- SFX
    /** Local source intensity; the effects bus applies the general sound setting once. */
    _play(buffer, volume = 1, rate = 1) {
        if (!this.enabled || !buffer || !this.voices.length) return;
        const v = this.voices[this._voiceIdx];
        this._voiceIdx = (this._voiceIdx + 1) % this.voices.length;
        if (v.isPlaying) v.stop();
        v.setBuffer(buffer);
        v.setVolume(volume);
        v.setPlaybackRate(rate);
        v.play();
    }

    _playAt(buffer, position, volume = 1, refDistance = 5, rate = 1) {
        if (!this.enabled || !buffer || !this.posVoices.length) return;
        const v = this.posVoices[this._posIdx];
        this._posIdx = (this._posIdx + 1) % this.posVoices.length;
        if (v.isPlaying) v.stop();
        v.setBuffer(buffer);
        v.setPlaybackRate(rate);
        v.setRefDistance(refDistance);
        v.setVolume(volume);
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    updateAmbient(playerPos, zombies, dt = 1 / 60) {
        if (!this.enabled) return;
        let minDist = Infinity;
        const candidates = [];
        for (const z of zombies) {
            if (z.isDead || z.dummy) continue; // (the training dummy is silent: no growls, no battle music)
            const dist = playerPos.distanceTo(z.group.position);
            if (dist < minDist) minDist = dist;
            // (the author: a zombie coming up is heard ~8 m off — it starts growling there; it keeps on to 10 m, so it doesn't flicker)
            const playing = this.ambientPool.some((sl) => sl.activeObject === z);
            if (dist < (playing ? ZOMBIE_HEAR + 2 : ZOMBIE_HEAR)) candidates.push({ zombie: z, dist });
        }
        this.updateMusic(dt, minDist);
        if (!this.ambientPool.length) return;
        if (!this.ambientEnabled) candidates.length = 0;
        candidates.sort((a, b) => a.dist - b.dist);
        const active = new Set();
        for (const item of candidates.slice(0, this.maxAmbient)) {
            const z = item.zombie;
            active.add(z);
            let slot = this.ambientPool.find((s) => s.activeObject === z) || this.ambientPool.find((s) => s.activeObject === null);
            if (!slot) continue;
            slot.activeObject = z;
            slot.sound.position.copy(z.group.position);
            slot.sound.updateMatrixWorld(true);
            if (!slot.sound.isPlaying) slot.sound.play();
            slot.sound.setVolume(1);
        }
        for (const slot of this.ambientPool) {
            if (!slot.activeObject || !active.has(slot.activeObject) || slot.activeObject.isDead) {
                if (slot.sound.isPlaying) slot.sound.stop();
                slot.activeObject = null;
            }
        }
    }

    playHit() {
        if (!this.sounds.hits.length) return;
        this.hitIndex = ((this.hitIndex ?? -1) + 1) % this.sounds.hits.length;
        this._play(this.sounds.hits[this.hitIndex], 1.0);
    }

    /** Blade on blade: a ringing metal clang (made here, no file needed). `power` 0..1. */
    playClang(power = 0.6) {
        if (!this.enabled) return;
        if (!this._clangBuf) {
            const ctx = this.context;
            if (!ctx) return;
            const rate = ctx.sampleRate, len = Math.floor(rate * 0.9);
            const buf = ctx.createBuffer(1, len, rate);
            const d = buf.getChannelData(0);
            // the modes of a free metal bar ring at these inharmonic ratios
            const f0 = 1180;
            const modes = [[1, 0.55, 0.5], [2.756, 0.35, 0.32], [5.404, 0.22, 0.18], [8.933, 0.12, 0.1], [1.012, 0.25, 0.45]];
            let seed = 7;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                let s = 0;
                for (const [r, a, decay] of modes) s += a * Math.exp(-t / decay) * Math.sin(2 * Math.PI * f0 * r * t);
                s += rnd() * 0.8 * Math.exp(-t / 0.006); // the hit itself
                d[i] = Math.tanh(s * 1.2) * 0.8;
            }
            this._clangBuf = buf;
        }
        this._play(this._clangBuf, 0.45 + 0.6 * Math.min(1, power), 0.85 + Math.random() * 0.35);
    }

    /**
     * A forged-iron gate (the keep's gates, GateModel.js): a deep ring of heavy metal with a low boom and a short grating of
     * the hinges (made here, no file). `power` 0..1: a latch clicking is quiet, a slam or a blast against the gate rings long.
     */
    playIronGate(power = 0.6) {
        if (!this.enabled) return;
        const buf = this.sounds.ironGate || (this.sounds.ironGate = this._synthIronGate());
        if (buf) this._play(buf, 0.4 + 0.65 * Math.min(1, power), 0.9 + Math.random() * 0.2);
    }

    _synthIronGate() {
        const ctx = this.context;
        if (!ctx) return null;
        const rate = ctx.sampleRate, len = Math.floor(rate * 1.6);
        const buf = ctx.createBuffer(1, len, rate);
        const d = buf.getChannelData(0);
        // a big plate rings low: inharmonic modes round 210 Hz, long decay; the bars add a higher, shorter ring
        const f0 = 210;
        const modes = [[1, 0.6, 0.9], [2.32, 0.4, 0.6], [4.1, 0.28, 0.38], [6.7, 0.18, 0.22], [9.4, 0.1, 0.12], [1.006, 0.35, 0.8]];
        let seed = 11;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / rate;
            let s = 0;
            for (const [r, a, decay] of modes) s += a * Math.exp(-t / decay) * Math.sin(2 * Math.PI * f0 * r * t);
            s += 0.8 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * 62 * t); // the boom of the leaf
            s += rnd() * 0.7 * Math.exp(-t / 0.008); // the hit
            lp += (rnd() - lp) * 0.08; // the hinges grating: low-passed noise that wavers
            s += lp * 0.35 * Math.exp(-t / 0.35) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 17 * t));
            d[i] = Math.tanh(s * 1.1) * 0.8;
        }
        return buf;
    }

    /** Coins jingling in a pouch (tied onto the belt): a few small clinks (made here). */
    playCoins() {
        if (!this.enabled) return;
        if (!this._coinBuf) {
            const ctx = this.context;
            if (!ctx) return;
            const rate = ctx.sampleRate, len = Math.floor(rate * 0.5);
            const buf = ctx.createBuffer(1, len, rate);
            const d = buf.getChannelData(0);
            let seed = 11;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            for (let k = 0; k < 7; k++) { // (each clink: a small coin's ring, quickly gone)
                const at = Math.floor(rate * (0.01 + rnd() * 0.3)), f = 3200 + rnd() * 2600, a = 0.25 + rnd() * 0.3;
                for (let i = at; i < len; i++) {
                    const t = (i - at) / rate;
                    d[i] += a * Math.exp(-t / 0.045) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.31 * t));
                }
            }
            for (let i = 0; i < len; i++) d[i] = Math.tanh(d[i]) * 0.7;
            this._coinBuf = buf;
        }
        this._play(this._coinBuf, 0.5, 0.9 + Math.random() * 0.2);
    }

    /** A bow being drawn: a short creak of wood and string (made here). `k` 0..1: how hard. */
    playBowDraw(k = 0.5) {
        if (!this.enabled) return;
        if (!this._creakBuf) {
            const ctx = this.context;
            if (!ctx) return;
            const rate = ctx.sampleRate, len = Math.floor(rate * 0.35);
            const buf = ctx.createBuffer(1, len, rate);
            const d = buf.getChannelData(0);
            let seed = 11, lp = 0;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                // stick-slip: little clicks ~70 a second, rising, filtered dull
                const click = Math.max(0, Math.sin(2 * Math.PI * (60 + 40 * t) * t)) ** 12;
                lp += (rnd() * click - lp) * 0.18;
                d[i] = lp * 3 * Math.min(1, t / 0.03) * Math.min(1, (0.35 - t) / 0.08);
            }
            this._creakBuf = buf;
        }
        this._play(this._creakBuf, 0.25 + 0.35 * Math.min(1, k), 0.9 + 0.2 * k);
    }

    /** A bow's string let go: a low twang and the thump of the arrow leaving (made here). `power` 0..1. */
    playBowRelease(power = 1) {
        if (!this.enabled) return;
        if (!this._twangBuf) {
            const ctx = this.context;
            if (!ctx) return;
            const rate = ctx.sampleRate, len = Math.floor(rate * 0.6);
            const buf = ctx.createBuffer(1, len, rate);
            const d = buf.getChannelData(0);
            // a plucked string (Karplus–Strong) ~120 Hz
            const N = Math.round(rate / 120), ring = new Float32Array(N);
            let seed = 5;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
            for (let i = 0; i < N; i++) ring[i] = rnd();
            for (let i = 0, j = 0; i < len; i++, j = (j + 1) % N) {
                const nx = (j + 1) % N;
                const v = ring[j];
                ring[j] = 0.497 * (ring[j] + ring[nx]);
                const t = i / rate;
                d[i] = Math.tanh((v * 0.7 + rnd() * Math.exp(-t / 0.01) * 0.6) * 1.3) * 0.8;
            }
            this._twangBuf = buf;
        }
        this._play(this._twangBuf, 0.35 + 0.6 * Math.min(1, power), 0.95 + Math.random() * 0.1);
    }

    playFrozenHit() {
        if (this.sounds.shatter) this._play(this.sounds.shatter, 1.2);
        else this.playHit();
    }

    playDeath(position) {
        this._playAt(this.sounds.death, position, 1.5, 5);
    }

    playThunder(volume = 1) { this._spell(this.sounds.thunder, volume); }

    /** The rain's hiss (0 = silent … 1 = pouring): a looped noise of many small drops. */
    setRain(k) {
        if (!this.enabled || !this.voices.length) return;
        if (!this._rain) {
            if (k <= 0.01) return;
            const ctx = this.context;
            const sr = ctx.sampleRate, len = Math.floor(sr * 4);
            const buf = ctx.createBuffer(1, len, sr);
            const d = buf.getChannelData(0);
            let lp = 0, drip = 0, df = 2000;
            for (let i = 0; i < len; i++) {
                const n = Math.random() * 2 - 1;
                lp += (n - lp) * 0.35;
                if (Math.random() < 0.0012) { drip = 0.6 + Math.random() * 0.4; df = 1200 + Math.random() * 2600; }
                drip *= 0.996;
                d[i] = lp * 0.5 + Math.sin(2 * Math.PI * df * i / sr) * drip * 0.12;
            }
            // (no click where the loop wraps)
            for (let i = 0; i < 2000; i++) { const a = i / 2000; d[i] = d[i] * a + d[len - 2000 + i] * (1 - a); }
            this._rain = new THREE.Audio(this.effectsListener);
            this._rain.setBuffer(buf);
            this._rain.setLoop(true);
            this._rain.setVolume(0);
        }
        const r = this._rain;
        r.setVolume(Math.min(1, k) * 0.9);
        if (k > 0.01 && !r.isPlaying) { try { r.play(); } catch (e) { /* not resumed yet */ } }
        else if (k <= 0.01 && r.isPlaying) r.stop();
    }
    playInferno() { this._spell(this.sounds.inferno, 0.8); }
    playSapira() { this._spell(this.sounds.sapira, 1.0); }
    playWhoosh() { this.playSand(); }

    playSand() {
        if (this.sounds.sand) this._spell(this.sounds.sand, 1.0);
        else if (this.sounds.inferno) this._spell(this.sounds.inferno, 0.5, 2.0);
    }

    playIce() { this._spell(this.sounds.ice, 1.4); }

    /**
     * «Джолт»: a short, sharp whoosh of shoved air (cast), or a deep thump on the body (impact)
     * — made here, no file needed; «Максима» louder and deeper.
     */
    playJolt(maxima = false, impact = false) {
        if (!this.enabled || !this.context) return;
        const key = impact ? '_joltThump' : '_joltWhoosh';
        if (!this[key]) {
            const ctx = this.context, rate = ctx.sampleRate, len = Math.floor(rate * (impact ? 0.45 : 0.32));
            const buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0);
            let seed = impact ? 11 : 5, lp = 0, ph = 0;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                if (impact) {
                    // a falling low thud and a puff of air
                    ph += 2 * Math.PI * (40 + 110 * Math.exp(-t / 0.05)) / rate;
                    lp += (rnd() - lp) * 0.08;
                    d[i] = Math.tanh((Math.sin(ph) * Math.exp(-t / 0.12) * 1.3 + lp * 2.2 * Math.exp(-t / 0.04)) * 1.2) * 0.85;
                } else {
                    // filtered noise rushing past: swells fast, cuts off
                    lp += (rnd() - lp) * (0.05 + 0.25 * Math.min(1, t / 0.12));
                    const env = Math.min(1, t / 0.03) * Math.exp(-Math.max(0, t - 0.05) / 0.07);
                    d[i] = lp * env * 2.2;
                }
            }
            this[key] = buf;
        }
        this._spell(this[key], (impact ? 1.0 : 0.8) * (maxima ? 1.5 : 1), (maxima ? 0.75 : 1) * (0.95 + Math.random() * 0.1));
    }
    playBombardoCast() { this._spell(this.sounds.cast, 0.9); }

    playExplosion(position, listenerPos, power = 1) {
        if (!this.sounds.explosion) return;
        const big = power > 1;
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        const vol = Math.max(0.15, (big ? 2.2 : 1.6) - d / (big ? 60 : 40));
        // A bigger blast sounds deeper
        this._spell(this.sounds.explosion, vol, (big ? 0.7 : 0.95) + Math.random() * 0.1);
    }

    /** «Total Destruction»: the ground rumbles deeper and louder for a few seconds. */
    playRumble(position, listenerPos) {
        if (!this.context) return;
        if (!this.sounds.rumble) this.sounds.rumble = this._synthRumble(5);
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.rumble, Math.max(0.12, 1.9 - d / 70), 0.9 + Math.random() * 0.1);
    }

    /**
     * «Circle Attack»: its own music — a choir of light swells while the golden ball grows
     * (dark at first, then lifting into a triumphant major chord), drums as the ground breaks.
     */
    playCircleAttack(position, listenerPos, max = false) {
        if (!this.context) return;
        if (!this.sounds.circleAttack) this.sounds.circleAttack = this._synthCircleAttack();
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.circleAttack, Math.max(0.2, (max ? 2.2 : 1.8) - d / 90), max ? 0.94 : 1);
        this.playRumble(position, listenerPos);
    }

    _synthCircleAttack() { return finish(this._synthCircleAttackGen()); }
    _synthMegaBlast(seconds) { return finish(this._synthMegaBlastGen(seconds)); }

    /** A long sound made ahead, a few ms a frame (never one long frame): @returns true when it is made. */
    _prepare(key, make, budgetMs = 3) {
        if (!this.context || this.sounds[key]) return true;
        const gens = this._gens || (this._gens = {});
        const gen = gens[key] || (gens[key] = make());
        const t0 = performance.now();
        let r;
        do { r = gen.next(); } while (!r.done && performance.now() - t0 < budgetMs);
        if (!r.done) return false;
        this.sounds[key] = r.value;
        delete gens[key];
        return true;
    }

    /**
     * The sounds made the first time they are heard, made ahead instead — one a call (the game calls it
     * every few frames once it runs): their first use froze a frame (a house's 10 s hum, its chord…).
     * @returns true while there is more to make.
     */
    prewarmStep() {
        if (!this.context || !this.loaded) return true;
        const list = this._warmList || (this._warmList = [
            ['house_wood', () => this._synthKnock(170, 0.3)], ['house_block', () => this._synthKnock(320, 0.12)],
            ['house_sand', () => this._synthSizzle(0.9)], ['magic', () => this._synthChime([880, 1320, 1760], 0.9, 6)],
            ['chest', () => this._synthCreak()], ['crack', () => this._synthCrack()], ['splash', () => this._synthWater(0.7, true)], ['bubblePop', () => this._synthBubblePop()],
            ['waterRise', () => this._synthWater(1.1, false)], ['houseDone', () => this._synthChime([392, 523, 659, 784, 1047], 2.2, 2.2)],
            ['rumble', () => this._synthRumble(5)], ['houseHum100', () => this._synthHum(10)], ['houseBreak', () => this._synthHouseBreak()],
            ['ironGate', () => this._synthIronGate()], // (the keep's forged gates — GateModel.js)
            ['collapse', () => this._synthCollapse()], ['groan', () => this._synthGroan()], // (a building giving way, coming down — Structure.js)
            ['wardHum', () => this._synthWardHum()], ['wardClick', () => this._synthKnock(1400, 0.07)], ['wardChime', () => this._synthChime([1047, 1568, 2093], 1.2, 4)],
            ['seal', () => this._synthKnock(90, 0.5)], ['boneClack', () => this._synthKnock(820, 0.09)], ['sealChime', () => this._synthChime([392, 587, 784], 1.4, 3.5)],
            ['snowStep', () => this._synthSnowStep()], ['land', () => this._synthKnock(55, 0.22)], ['giantStep', () => this._synthGiantStep()], // (the monster form's steps — MonsterForm.js) ['snowman', () => this._synthSnowman()], ['house_stone', () => this._synthKnock(110, 0.35)],
            // («Create an Ice Castle», «Ice Bridge» — IceMagic.js)
            ['iceBell', () => this._synthIceBell()], ['iceFloor', () => this._synthIceFloor(2.6)],
            ['iceDone', () => this._synthChime([523, 659, 784, 1047, 1319, 1568, 2093], 3.2, 1.5)], ['iceChime', () => this._synthChime([1568, 2093, 2637, 3136], 1.4, 3)],
            // (the Temple of the Gods — Temple.js: the wind outside, the halls' quiet echo, the scrolls' chime)
            ['templeWind', () => this._synthTempleWind(8)], ['templeHall', () => this._synthTempleHall(9)], ['templeChime', () => this._synthChime([1319, 1760, 2349, 2637], 2.4, 1.6)],
            // (the clever owl — Owls.js: hoots, wings, a contented trill, the hearts' chime)
            ...OWL_SOUNDS.map((k) => ['owl_' + k, () => synthOwl(this.context, k)]),
            // (the invisible bird of Spencer — SpencerBirds.js: a chirp, a trill, small wings)
            ...SPENCER_SOUNDS.map((k) => ['spencer_' + k, () => synthSpencer(this.context, k)]),
            // (the Castle of Ghosts — Ghosts.js: steps, whispers, a cry, knocks, a chair's scrape, the wail, a child's laugh, the chill, a far bell, a door, the hum)
            ...GHOST_SOUND_IDS.map((k) => ['ghost_' + k, () => synthGhost(this.context, k)]),
            // (the infernal gargoyles and their ritual — Gargoyles.js: growls, shrieks, wings, bites, stone falling apart, the hellfire's swell)
            ...GARGOYLE_SOUNDS.map((k) => ['garg_' + k, () => synthGargoyle(this.context, k)]),
            // (the dragon in a fight — Dragons.js: steps, the landing, wing-beats, the roar, bite, claws, tail)
            ...DRAGON_SOUNDS.map((k) => ['drg_' + k, () => synthDragon(this.context, k)]),
            // (Дьяволос — Diabolos.js: храп, топот, цепь, рёв, огонь, шары, хлопок, тема босса — хор и барабаны)
            ...DEVIL_SOUNDS.map((k) => ['dvl_' + k, () => synthDevil(this.context, k)]),
            ...PLANT_SOUNDS.map((k) => ['plant_' + k, () => synthPlant(this.context, k)]),
            // (the Canaries — Canaries.js: snarls, shouts, grunts, a boulder's thud and the air it cuts)
            ...CANARY_SOUNDS.map((k) => ['canary_' + k, () => synthCanary(this.context, k)]),
            ...TARON_SOUNDS.map((k) => ['taron_' + k, () => synthTaron(this.context, k)]),
            // (the people's chores — Chores.js: the axe, the broom, a ball caught, the lute, a potion's bubble)
            ['chore_chop', () => this._synthKnock(140, 0.28)], ['chore_sweep', () => this._synthSizzle(0.32)], ['chore_catch', () => this._synthKnock(240, 0.1)],
            ['chore_pluck', () => this._synthPluck(330, 0.9)], ['chore_bubble', () => this._synthKnock(520, 0.12)],
            // (the settlements' buildings — BuildingFx.js: the church's big bell, the chapel's small one, the blow on the smith's anvil)
            ['bell_big', () => this._synthBell(196, 6.5)], ['bell_small', () => this._synthBell(330, 4.5)], ['anvil', () => this._synthAnvil()],
            // (the duel arena — ArenaDuels.js: the stands' roar and groan, the gong, «3-2-1», the fanfare, applause)
            ...ARENA_SOUNDS.map((k) => ['arena_' + k, () => synthArena(this.context, k)]),
            // (a thing thrown and landing — Items / ThrowModel: the air it cuts, its knock on the ground by its stuff, water)
            ...THROW_SOUNDS.map((k) => ['thr_' + k, () => synthThrow(this.context, k)]),
            // (the monster's paw and the body in it — MonsterGrab.js: the fingers closing, the squeeze, the crunch)
            ...GRAB_SOUNDS.map((k) => ['grab_' + k, () => synthGrab(this.context, k)]),
        ]);
        while (list.length) {
            const [key, make] = list.shift();
            if (!this.sounds[key]) { this.sounds[key] = make(); return list.length > 0; }
        }
        return false;
    }

    /**
     * «Космос» (Space.js): its sounds made ahead, a few ms a frame — call every frame until true
     * (SpaceSounds.js: the climb, the fall into the air, Venus' wind, the Sun's heat, the gift, a chime).
     */
    prepareSpace() {
        if (!this.context) return true;
        for (const [key, gen] of Object.entries(SPACE_SOUNDS)) if (!this.sounds[key] && !this._prepare(key, () => gen(this.context), 2)) return false;
        return true;
    }

    /** One of space's sounds (not where it is: the hero's own — the climb, the burning air, the gift). */
    playSpace(kind, volume = 1, rate = 1) {
        if (!this.context || !this.sounds[kind]) return;
        this._spell(this.sounds[kind], volume, rate);
    }

    /** The silence of space: the music fades away there (and comes back off it). */
    spaceQuiet(on) {
        if (this.context && this.loaded) this._loop('space', on && this.enabled ? 'spaceAmb' : null, 0.5); // (space is not dead silent: a far quiet pad — SpellMusic.spaceAmb)
        const cur = this.music?.current;
        if (!this.context || !cur?.gain) return;
        const t = this.context.currentTime, g = cur.gain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(on ? 0 : this.music.volume, t + (on ? 2.5 : 4));
    }

    /** A looping sound of space (Venus' wind, the Sun's heat) at loudness k (0: stopped). */
    spaceLoop(kind, k) {
        if (!this.enabled || !this.context || !this.sounds[kind]) return;
        const loops = this._spaceLoops || (this._spaceLoops = {});
        let a = loops[kind];
        if (!a) {
            if (k <= 0.01) return;
            a = loops[kind] = new THREE.Audio(this.effectsListener);
            a.setBuffer(this.sounds[kind]);
            a.setLoop(true);
        }
        a.setVolume(Math.min(1.2, k));
        if (k > 0.01 && !a.isPlaying) { try { a.play(); } catch (e) { /* not resumed yet */ } }
        else if (k <= 0.01 && a.isPlaying) a.stop();
    }

    // ------------------------------------------------ the spells' own sounds (SpellMusic.js)
    /**
     * The spells' tunes, effects and loops: made in a worker (never in a frame), here only put into
     * buffers. Without a worker: one a pause of the loading screen. @returns a promise (once, kept).
     */
    prepareSpellMusic(pause = null) {
        if (!this.context) return Promise.resolve();
        if (this._spellMusic) return this._spellMusic;
        const keys = Object.keys(SPELL_GEN);
        const put = (key, data) => { const b = this.context.createBuffer(1, data.length, SPELL_SR); b.copyToChannel(data, 0); this.sounds[key] = b; };
        const t0 = performance.now();
        const here = async () => { // (no worker: made here, one sound a pause)
            const wait = pause || (() => new Promise((r) => setTimeout(r, 0)));
            for (const k of keys) { if (!this.sounds[k]) put(k, SPELL_GEN[k](SPELL_SR)); await wait(); }
        };
        this._spellMusic = new Promise((resolve) => {
            let w = null;
            const done = () => { this.spellMusicMs = Math.round(performance.now() - t0); resolve(); };
            try { w = new Worker(new URL('./spellMusic.worker.js', import.meta.url), { type: 'module' }); } catch (e) { w = null; }
            if (!w) { here().then(done); return; }
            const timer = setTimeout(() => { w.terminate(); here().then(done); }, 15000); // (a stuck worker: made here)
            w.onmessage = (e) => {
                const m = e.data || {};
                if (m.key && m.data) put(m.key, m.data);
                if (m.done) { clearTimeout(timer); w.terminate(); done(); }
            };
            w.onerror = () => { clearTimeout(timer); w.terminate(); here().then(done); };
            w.postMessage({ sr: SPELL_SR });
        });
        return this._spellMusic;
    }

    /** A spell sound at a place (heard by everyone near, fainter far away) at the spells' loudness; no place — the caster's own. */
    _spellAt(buffer, position, volume = 1, refDistance = 8, rate = 1) {
        if (!this.enabled || !buffer) return;
        if (!position || !this.posVoices.length) { this._spell(buffer, volume, rate); return; }
        const v = this.posVoices[this._posIdx];
        this._posIdx = (this._posIdx + 1) % this.posVoices.length;
        if (v.isPlaying) v.stop();
        v.setBuffer(buffer);
        v.setPlaybackRate(rate);
        v.setRefDistance(refDistance);
        v.setVolume(volume * (this.spellVolume ?? 1));
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    /** One of the spells' effects far away (the fireworks' boom): `ref` the distance up to which it is loud. */
    playSpellFxAt(key, position, volume = 1, rate = 1, ref = 8) {
        if (!this.context || !this.sounds[key] || !position) return false;
        this._spellAt(this.sounds[key], position, volume, ref, rate);
        return true;
    }

    /** One of the spells' effects (SpellMusic FX: 'fxStupefy', 'fxWind'…) — at `position`, or the caster's own. */
    playSpellFx(key, position = null, volume = 1, rate = 1) {
        if (!this.context || !this.sounds[key]) return false;
        this._spellAt(this.sounds[key], position, volume, 8, rate * (0.97 + Math.random() * 0.06));
        return true;
    }

    /**
     * A spell worked (`name` — matchSpell's): its sound from the card SPELL_SOUND — a tune (the great spells,
     * its own voice: one at a time, loud far round, a little under «Create a House»'s) and / or a short effect.
     * Played for my casts and for the others' (NetSync 'csnd') at the caster's place. @returns true if any.
     */
    spellCast(name, position) {
        const e = SPELL_SOUND[name];
        if (!e || !this.enabled || !this.context || !this.loaded) return false;
        const rate = e.rate || 1, now = performance.now();
        if (name === 'Stop') this._stopAt = now;
        // (the same spell heard again at once — an unfinished phrase and then its final one: one sound)
        const last = this._castSnd || (this._castSnd = new Map());
        const key = name + ':' + (position ? Math.round(position.x) + ',' + Math.round(position.z) : '');
        if (now - (last.get(key) || -1e9) < 2500) return false;
        if (last.size > 32) last.clear();
        last.set(key, now);
        if (e.cast && this.sounds[e.cast]) this._spellAt(this.sounds[e.cast], position, 1, 8, rate * (0.97 + Math.random() * 0.06));
        const buf = e.theme && this.sounds[e.theme];
        if (buf) {
            if (!this._spellTheme) { this._spellTheme = new THREE.PositionalAudio(this.effectsListener); this.scene?.add(this._spellTheme); }
            const v = this._spellTheme;
            if (v.isPlaying) v.stop();
            v.setBuffer(buf);
            v.setPlaybackRate(rate);
            v.setRefDistance(22);
            v.setVolume(Math.min(1.1, 1.5 * (this.spellVolume ?? 1)));
            if (position) { v.position.copy(position); v.updateMatrixWorld(true); }
            v.play();
        }
        return !!(buf || e.cast);
    }

    /** Does this spell's sound go from SoundManager.spellCast (and so over the network)? */
    spellHasCastSound(name) { const e = SPELL_SOUND[name]; return !!(e && (e.cast || e.theme)); }

    /**
     * Every frame (Concentration.update): the quiet loop of the spell I hold (`held` — a HELD key, or null)
     * and its end sound when it stops; `flight` 0…1 — the wind of my flight (0: not flying / no air).
     */
    focusLoop(held, flight = 0) {
        if (!this.context || !this.loaded) return;
        const was = this._heldNow || null;
        if (held !== was) {
            this.releaseHeld(was);
            this._heldNow = held;
        }
        const h = HELD_SOUND[held];
        this._loop('held', this.enabled && h?.loop ? h.loop : null, 0.4, h?.rate || 1);
        this._loop('flight', this.enabled && flight > 0.02 ? 'loopFlight' : null, 0.5 * Math.min(1, flight), 0.8 + 0.4 * Math.min(1, flight));
        this.tickLoops();
    }

    /**
     * A held spell ends (let go, fell, «стоп», mana, death): its end note plays at once and the loop fades out
     * in RELEASE.FADE s (the same for every held spell; the loop is tied to the act of holding, not to its sample).
     */
    releaseHeld(kind) {
        const prev = HELD_SOUND[kind];
        if (!prev) return;
        const stopped = prev.end === 'fxStop' && this._now() - (this._stopAt || -1e9) < 800; // («стоп» rang already)
        if (prev.end && !stopped && this.sounds[prev.end]) this._spell(this.sounds[prev.end], 0.8, prev.rate && prev.end !== 'endSet' ? prev.rate : 1);
        const a = this._loops?.held;
        if (a?.isPlaying && !a._fade) a._fade = { t0: this._now(), k: a._k ?? 0.4 };
    }

    _now() { return this._clock ? this._clock() : performance.now(); }

    /** Every frame: the loops that are fading out go quieter and stop (so nothing is cut off, and nothing stays). */
    tickLoops() {
        const now = this._now();
        for (const a of Object.values(this._loops || {})) {
            const f = a._fade;
            if (!f) continue;
            const u = (now - f.t0) / (RELEASE.FADE * 1000);
            if (u >= 1) { a._fade = null; a._k = 0; if (a.isPlaying) a.stop(); continue; }
            a.setVolume(f.k * (1 - u) * (1 - u) * (this.spellVolume ?? 1));
        }
    }

    /** «Да пусть создастся»: the gods think — their soft choir, as loud as `k` (0…1: near the place; 0 — silent). */
    creationHum(k) { if (this.context && this.loaded) this._loop('creation', this.enabled && k > 0.01 ? 'loopGenesisEpic' : null, 1.8 * Math.min(1, k)); } // («Да пусть создастся»: its epic tune, louder as the creation goes — DivineCreation)

    /** Hell around the hero (HellRealm.js): its hot wind and the lava's rumble, as loud as `k` (0…1; 0 — silent). */
    hellHum(k) { if (this.context && this.loaded) this._loop('hell', this.enabled && k > 0.01 ? 'loopHell' : null, 0.8 * Math.min(1, k)); }

    /** The divine sword near me: its quiet shining hum, as loud as `k` (0…1, by distance; 0 — silent). DivineSwordFx. */
    divineHum(k) { if (this.context && this.loaded) this._loop('divine', this.enabled && k > 0.01 ? 'loopDivineHum' : null, 0.5 * Math.min(1, k)); }

    /** A named looping voice playing sound `key` (null: stopped) at loudness `k` and `rate`. */
    _loop(slot, key, k, rate = 1) {
        const loops = this._loops || (this._loops = {});
        let a = loops[slot];
        if (!key || !this.sounds[key]) {
            // (stopped: it fades out — RELEASE.FADE — instead of being cut off)
            if (a?.isPlaying && !a._fade) a._fade = { t0: this._now(), k: a._k ?? k };
            return;
        }
        if (!a) { a = loops[slot] = new THREE.Audio(this.effectsListener); a.setLoop(true); }
        if (a._fade && a._key === key && a.isPlaying) { // (the same sound asked for again while it fades: it is held again)
            a._fade = null;
        } else if (a._fade) { a._fade = null; if (a.isPlaying) a.stop(); }
        if (a._key !== key) { if (a.isPlaying) a.stop(); a.setBuffer(this.sounds[key]); a._key = key; }
        a._k = k;
        a.setVolume(k * (this.spellVolume ?? 1));
        if (a.playbackRate !== rate) a.setPlaybackRate(rate);
        if (!a.isPlaying) { try { a.play(); } catch (e) { /* not resumed yet */ } }
    }

    /** A tree / a house comes down: one short low thud (never the 5 s rumble: it outlived the fall). */
    playLandThud(position, listenerPos) {
        if (!this.context || !this.sounds.endThud) return false;
        const d = listenerPos && position ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.endThud, Math.max(0.15, 1.6 - d / 70), 0.95 + Math.random() * 0.1);
        return true;
    }

    /** «Circle Attack»'s music made ahead (early in the game, not on the first cast): call every frame until true. */
    prepareCircleAttack() { return this._prepare('circleAttack', () => this._synthCircleAttackGen()); }

    /** «Inspirius»' sounds made ahead, a little a frame: @returns true when all are made. */
    prepareInspirius() {
        if (!this.context) return true;
        if (!this.sounds.inspCast) { this.sounds.inspCast = this._synthElectric(1.4, true); return false; }
        if (!this.sounds.inspZap) { this.sounds.inspZap = this._synthElectric(0.3, false); return false; }
        return this._prepare('inspBlast', () => this._synthMegaBlastGen(6));
    }

    /** «Inspirius»: the ball leaves the wand — a rising electric whine and crackle. */
    playInspiriusCast(position, listenerPos) {
        if (!this.context) return;
        if (!this.sounds.inspCast) this.sounds.inspCast = this._synthElectric(1.4, true);
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.inspCast, Math.max(0.15, 1.6 - d / 50), 0.95 + Math.random() * 0.1);
    }

    /** «Inspirius»: the ball crackles as it flies by. */
    playInspiriusZap(position) {
        if (!this.context) return;
        if (!this.sounds.inspZap) this.sounds.inspZap = this._synthElectric(0.3, false);
        this._castAt(this.sounds.inspZap, position, 1.4, 7, 0.8 + Math.random() * 0.5);
    }

    /** «Inspirius»: the burst — a blinding crack, a colossal boom, a long rolling thunder. */
    playInspiriusBlast(position, listenerPos) {
        if (!this.context) return;
        if (!this.sounds.inspBlast) this.sounds.inspBlast = this._synthMegaBlast(6);
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.inspBlast, Math.max(0.4, 3 - d / 120), 0.95 + Math.random() * 0.05);
        if (this.sounds.explosion) this._spell(this.sounds.explosion, Math.max(0.3, 2.4 - d / 90), 0.55);
    }

    /** «Бум»'s sounds made ahead (a few ms at a time): @returns true when both are made. */
    prepareBoom() {
        if (!this.context) return true;
        if (!this._prepare('boomSwell', () => this._synthBoomSwellGen(1.6))) return false;
        return this._prepare('boomBlast', () => this._synthBoomBlastGen(11));
    }

    /** «Бум»: the mountain groans and grinds from inside, louder and lower, as it swells. */
    playBoomSwell(position, listenerPos) {
        if (!this.context || !this.sounds.boomSwell) return; // (made on the loading screen — never in a frame)
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.boomSwell, Math.max(0.35, 2.2 - d / 160), 1);
    }

    /** «Бум»: the burst — the deepest blow there is, the roar of the rock, its echo rolling back from far away. */
    playBoomBlast(position, listenerPos) {
        if (!this.context || !this.sounds.boomBlast) return;
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        this._spell(this.sounds.boomBlast, Math.max(0.5, 3.2 - d / 200), 1);
        if (this.sounds.explosion) this._spell(this.sounds.explosion, Math.max(0.3, 2.4 - d / 120), 0.4);
    }

    * _synthBoomSwellGen(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, lp2 = 0, ph = 0, ph2 = 0, snap = 0;
        for (let i = 0; i < len; i++) {
            if ((i & 8191) === 0 && i) yield;
            const t = i / sr, u = t / seconds;
            const n = Math.random() * 2 - 1;
            lp += (n - lp) * 0.02; lp2 += (lp - lp2) * 0.03;
            ph += (22 + 16 * u) / sr; ph2 += (47 + 30 * u * u) / sr;
            const sub = Math.sin(2 * Math.PI * ph) * (0.3 + 0.7 * u);
            const groan = (Math.sin(2 * Math.PI * ph2) + 0.4 * Math.sin(4 * Math.PI * ph2) + 0.2 * Math.sin(6 * Math.PI * ph2)) * 0.35 * u * (0.7 + 0.3 * Math.sin(t * 13));
            const grind = lp2 * 18 * (0.2 + 0.8 * u);
            if (Math.random() < 0.0009 * (0.3 + u)) snap = 1; // (the rock cracking inside)
            const crack = snap > 0.01 ? n * snap * 0.6 : 0;
            snap *= 0.993;
            const env = Math.min(1, t * 6) * Math.min(1, (seconds - t) * 30);
            d[i] = Math.max(-1, Math.min(1, (sub * 0.6 + groan + grind + crack) * env * 0.8));
        }
        return buf;
    }

    * _synthBoomBlastGen(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const dry = new Float32Array(len);
        let lp = 0, lp2 = 0, lp3 = 0, ph = 0, thump = 0, thumpF = 40, tph = 0;
        for (let i = 0; i < len; i++) {
            if ((i & 8191) === 0 && i) yield;
            const t = i / sr;
            const n = Math.random() * 2 - 1;
            lp += (n - lp) * 0.05; lp2 += (lp - lp2) * 0.03; lp3 += (lp2 - lp3) * 0.02;
            ph += (34 - 16 * Math.min(1, t / 2.5)) / sr;
            const crack = n * Math.exp(-t * 30) * 0.8;
            const blow = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 0.55) * 1.1; // (the deepest: felt more than heard)
            const roar = lp2 * 9 * Math.exp(-t * 0.9) + lp3 * 22 * Math.exp(-t * 0.35) * Math.min(1, t / 0.4);
            // the rocks coming down all round, for seconds
            if (t > 1.2 && t < 8 && Math.random() < 0.00025) { thump = 0.4 + Math.random() * 0.6; thumpF = 35 + Math.random() * 50; }
            tph += thumpF / sr;
            const fall = thump > 0.01 ? (Math.sin(2 * Math.PI * tph) * 0.8 + lp * 3) * thump * Math.exp(-t * 0.18) : 0;
            thump *= 0.9993;
            dry[i] = crack + blow + roar + fall;
        }
        // the echo from the mountains round: the blow comes back again and again, lower and later
        for (const [at, k] of [[0.9, 0.42], [1.9, 0.3], [3.1, 0.22], [4.6, 0.15], [6.4, 0.1]]) {
            const o = Math.floor(at * sr);
            let e = 0;
            for (let i = o; i < len; i++) { e += (dry[i - o] - e) * 0.08; d[i] += e * k * 2.2; }
            yield;
        }
        for (let i = 0; i < len; i++) {
            const t = i / sr, env = Math.min(1, t * 500) * Math.min(1, (seconds - t) / 2.5);
            d[i] = Math.max(-1, Math.min(1, (dry[i] + d[i]) * env * 0.75));
        }
        return buf;
    }

    /** (made a piece at a time — `yield` between pieces — so it can be made over many frames) */
    * _synthCircleAttackGen() {
        const ctx = this.context, sr = ctx.sampleRate, T = 7.6, len = Math.floor(sr * T);
        const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
        // one period of a «choir» voice (soft harmonics), read by phase
        const W = 2048, wave = new Float32Array(W);
        for (let i = 0; i < W; i++) { const a = (i / W) * Math.PI * 2; wave[i] = Math.sin(a) + 0.5 * Math.sin(2 * a) + 0.33 * Math.sin(3 * a) + 0.18 * Math.sin(4 * a) + 0.1 * Math.sin(5 * a) + 0.06 * Math.sin(6 * a); }
        const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
        // D minor → B♭ → D major (the light breaks through)
        const chords = [[0, 2.5, [50, 53, 57, 62]], [2.5, 4.6, [46, 50, 53, 58]], [4.6, T, [50, 54, 57, 62, 69]]];
        const ph = new Float64Array(64);
        for (let i = 0; i < len; i++) {
            if ((i & 4095) === 0 && i) yield;
            const t = i / sr;
            let v = 0, k = 0;
            for (const [a, b, notes] of chords) {
                const fadeIn = Math.min(1, (t - a + 0.35) / 0.35), fadeOut = Math.min(1, (b + 0.35 - t) / 0.35);
                const env = Math.max(0, Math.min(fadeIn, fadeOut));
                for (const n of notes) {
                    for (let c = 0; c < 3; c++, k++) {
                        if (env <= 0) continue;
                        const f = hz(n) * (1 + (c - 1) * 0.004) * (1 + 0.006 * Math.sin(2 * Math.PI * (5 + c * 0.7) * t));
                        ph[k] = (ph[k] + f / sr) % 1;
                        v += wave[(ph[k] * W) | 0] * env * 0.05;
                    }
                }
            }
            // it swells, then holds, then fades
            const swell = Math.min(1, 0.25 + t / 3) * Math.min(1, (T - t) / 1.2);
            v *= swell;
            // the drums as the ground breaks
            for (const h of [0, 1.2, 2.5, 3.5, 4.6, 5.3, 6.0]) {
                const dt = t - h;
                if (dt >= 0 && dt < 0.9) v += Math.sin(2 * Math.PI * (55 - 20 * dt) * dt) * Math.exp(-dt * 5) * 0.55 + (Math.random() * 2 - 1) * Math.exp(-dt * 30) * 0.12;
            }
            // bells of light rising when the major chord comes
            if (t > 4.6) {
                const step = Math.floor((t - 4.6) / 0.18), dt = (t - 4.6) - step * 0.18;
                const bell = [74, 78, 81, 86, 90, 93][step % 6];
                v += Math.sin(2 * Math.PI * hz(bell) * dt) * Math.exp(-dt * 9) * 0.12 * Math.min(1, (T - t) / 1.2);
            }
            out[i] = Math.max(-1, Math.min(1, v));
        }
        return buf;
    }

    /** Electric crackle (rising: the whine of the ball being born). */
    _synthElectric(seconds, rising) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let prev = 0, burst = 0, ph = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            if (Math.random() < 0.004) burst = 0.6 + Math.random() * 0.4;
            burst *= 0.9993;
            const n = Math.random() * 2 - 1, hp = n - prev; prev = n; // (crackle: the high part of noise)
            const f = rising ? 180 + 1600 * (t / seconds) ** 2 : 900;
            ph += f / sr;
            const whine = Math.sin(2 * Math.PI * ph) * (rising ? 0.25 : 0.1) * (0.6 + 0.4 * Math.sin(t * 90));
            const env = Math.min(1, t / 0.02) * Math.min(1, (seconds - t) / (rising ? 0.3 : 0.1));
            d[i] = Math.max(-1, Math.min(1, (hp * burst * 0.7 + whine + (rising ? Math.sin(2 * Math.PI * 45 * t) * 0.3 * (t / seconds) : 0)) * env));
        }
        return buf;
    }

    /** The mightiest blast: a crack, a colossal boom, thunder rolling away, the magic singing down. */
    * _synthMegaBlastGen(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, lp2 = 0, ph = 0;
        for (let i = 0; i < len; i++) {
            if ((i & 8191) === 0 && i) yield;
            const t = i / sr;
            const n = Math.random() * 2 - 1;
            lp += (n - lp) * 0.04;
            lp2 += (lp - lp2) * 0.04;
            const crack = n * Math.exp(-t * 40) * 0.9;
            const boom = lp * 6 * Math.exp(-t * 1.6) + Math.sin(2 * Math.PI * (38 - 12 * Math.min(1, t)) * t) * Math.exp(-t * 0.9) * 0.9;
            const roll = lp2 * 14 * (0.6 + 0.4 * Math.sin(t * 5.3) * Math.sin(t * 2.1)) * Math.exp(-t * 0.5) * Math.min(1, t / 0.3);
            ph += (2200 * Math.exp(-t * 1.4) + 120) / sr; // (the magic singing down)
            const sing = Math.sin(2 * Math.PI * ph) * 0.18 * Math.exp(-t * 0.8) * (0.5 + 0.5 * Math.sin(t * 60));
            const env = Math.min(1, t * 400) * Math.min(1, (seconds - t) / 1.5);
            d[i] = Math.max(-1, Math.min(1, (crack + boom + roll + sing) * env));
        }
        return buf;
    }

    /** Stone cracking (a wall about to give way). */
    playCrack(position, volume = 1) {
        if (!this.context) return;
        if (!this.sounds.crack) this.sounds.crack = this._synthCrack();
        this._playAt(this.sounds.crack, position, volume, 8);
    }

    /** A builder's hammer on stone / wood (the castle being repaired — Rebuild.js). */
    playHammer(position, volume = 1) {
        if (!this.context) return;
        if (!this.sounds.hammer) {
            const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 0.22);
            const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                lp += ((Math.random() * 2 - 1) - lp) * 0.5;
                // a sharp knock: a click, a short ring of iron, a dull wooden body
                const s = lp * Math.exp(-t * 90) * 1.2 + Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-t * 40) * 0.35 + Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t * 28) * 0.6;
                d[i] = Math.max(-1, Math.min(1, s * Math.min(1, t * 4000)));
            }
            this.sounds.hammer = buf;
        }
        this._playAt(this.sounds.hammer, position, volume, 6, 0.9 + Math.random() * 0.25);
    }

    /**
     * A chore heard (Chores.js — the people's day): 'chop' the axe in the log, 'sweep' / 'wipe' the broom / the rag,
     * 'catch' a ball caught, 'pluck' a lute's string (`note` semitones up), 'bubble' a potion, 'zap' / 'magic' a small
     * spell, 'splash' a fish out of the water. Made ahead (prewarmStep); quiet, and not more than a few a second
     * (the voices are kept for the fights and the spells).
     */
    playChore(beat, position, volume = 1, note = 0) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const now = performance.now();
        if (now - (this._choreAt || 0) < 220) return;
        this._choreAt = now;
        const r = () => 0.9 + Math.random() * 0.2;
        switch (beat) {
            case 'chop': if (this.sounds.chore_chop) this._playAt(this.sounds.chore_chop, position, 0.9 * volume, 6, r()); break;
            case 'sweep': if (this.sounds.chore_sweep) this._playAt(this.sounds.chore_sweep, position, 0.25 * volume, 3, r()); break;
            case 'wipe': if (this.sounds.chore_sweep) this._playAt(this.sounds.chore_sweep, position, 0.18 * volume, 3, 1.5 * r()); break;
            case 'catch': if (this.sounds.chore_catch) this._playAt(this.sounds.chore_catch, position, 0.5 * volume, 4, r()); break;
            case 'pluck': if (this.sounds.chore_pluck) this._playAt(this.sounds.chore_pluck, position, 0.45 * volume, 5, Math.pow(2, note / 12)); break;
            case 'bubble': if (this.sounds.chore_bubble) this._playAt(this.sounds.chore_bubble, position, 0.3 * volume, 4, 0.7 + Math.random() * 0.6); break;
            case 'splash': if (this.sounds.splash) this._playAt(this.sounds.splash, position, 0.35 * volume, 5, 1.3 * r()); break;
            case 'zap': case 'magic': if (this.sounds.magic) this._playAt(this.sounds.magic, position, (beat === 'zap' ? 0.3 : 0.18) * volume, 5, beat === 'zap' ? 1.4 : 1); break;
            default: break;
        }
    }

    /**
     * A church bell: the partials of a cast bell (hum, prime, tierce, quint, nominal, and higher ones) — the low ones ring long, the high
     * ones soon die — each a hair out of tune with its twin so that the sound slowly beats; a short knock at the start.
     */
    _synthBell(f0, seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const P = 2 * Math.PI;
        const parts = [[0.5, 0.45, 0.55], [1, 1, 0.75], [1.2, 0.6, 1.0], [1.5, 0.42, 1.3], [2, 0.7, 1.6], [2.5, 0.28, 2.4], [3, 0.2, 3.0], [4, 0.14, 4.2], [5.2, 0.08, 6]];
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            for (const [k, a, dec] of parts) {
                v += Math.sin(P * f0 * k * t) * a * Math.exp(-t * dec);
                v += Math.sin(P * f0 * k * 1.004 * t + 0.7) * a * 0.5 * Math.exp(-t * dec * 1.1); // (the twin: the beat)
            }
            const knock = Math.exp(-t * 90) * (Math.random() * 2 - 1) * 0.5;
            d[i] = (v * 0.22 + knock) * Math.min(1, t * 1500) * Math.min(1, (len - i) / (sr * 0.4));
        }
        return buf;
    }

    /** One blow of a hammer on an anvil: a bright ring that dies in half a second. */
    _synthAnvil() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 0.7);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const P = 2 * Math.PI;
        const parts = [[1, 1, 7], [2.32, 0.55, 11], [4.18, 0.3, 17], [6.7, 0.15, 26]];
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            for (const [k, a, dec] of parts) v += Math.sin(P * 1180 * k * t) * a * Math.exp(-t * dec);
            d[i] = (v * 0.3 + (Math.random() * 2 - 1) * Math.exp(-t * 220) * 0.6) * Math.min(1, t * 2500) * Math.min(1, (len - i) / (sr * 0.1));
        }
        return buf;
    }

    /** A sound of a settlement's building at a place (BuildingFx.js): the bell, the anvil. */
    playBuilding(key, position, volume = 1, ref = 8, rate = 1) {
        if (!this.enabled || !this.context || !this.loaded || !this.sounds[key]) return;
        this._playAt(this.sounds[key], position, volume, ref, rate);
    }

    /** A plucked string (Karplus–Strong): the lute of a villager playing on a bench. */
    _synthPluck(f, seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const n = Math.max(2, Math.round(sr / f)), ring = new Float32Array(n);
        for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
        for (let i = 0, k = 0; i < len; i++, k = (k + 1) % n) {
            const a = ring[k], b = ring[(k + 1) % n];
            ring[k] = (a + b) * 0.5 * 0.996;
            d[i] = a * 0.6 * Math.min(1, (len - i) / (sr * 0.05));
        }
        return buf;
    }

    /** Water rising out of a river into the ball. */
    playWaterRise() {
        if (!this.context) return;
        if (!this.sounds.waterRise) this.sounds.waterRise = this._synthWater(1.1, false);
        this._spell(this.sounds.waterRise, 0.9, 0.9 + Math.random() * 0.2);
    }

    /** A water ball lets go (Water Vortex: «стоп» over a hanging ball): a soft «блуп» and a spill with drops — made ahead (prewarmStep). */
    playBubblePop(position = null, volume = 1) {
        if (!this.context) return;
        if (!this.sounds.bubblePop) this.sounds.bubblePop = this._synthBubblePop();
        const rate = 0.92 + Math.random() * 0.16;
        if (position) this._castAt(this.sounds.bubblePop, position, 1.1 * volume, 7, rate);
        else this._spell(this.sounds.bubblePop, 1.1 * volume, rate);
    }

    playSplash() {
        if (!this.context) return;
        if (!this.sounds.splash) this.sounds.splash = this._synthWater(0.7, true);
        this._spell(this.sounds.splash, 1.2, 0.85 + Math.random() * 0.3);
    }

    /** A splash at a place in the world (water pouring into a ship's hole): it fades with the distance. */
    playSplashAt(position, volume = 1) {
        if (!this.context) return;
        if (!this.sounds.splash) this.sounds.splash = this._synthWater(0.7, true);
        this._playAt(this.sounds.splash, position, volume, 6, 0.85 + Math.random() * 0.3);
    }

    playChestOpen(position) {
        if (!this.sounds.chest) this.sounds.chest = this._synthCreak();
        this._playAt(this.sounds.chest, position, 1.2, 6);
    }

    // --------------------------------------------- «Create a House» (HouseMagic.js)
    /** A short bright sparkle of magic (a spell takes hold); at a place it fades with the distance. */
    playMagic(position = null, volume = 1) {
        if (!this.enabled || !this.context) return;
        if (!this.sounds.magic) this.sounds.magic = this._synthChime([880, 1320, 1760], 0.9, 6);
        if (position) this._castAt(this.sounds.magic, position, volume, 8, 0.95 + Math.random() * 0.1);
        else this._spell(this.sounds.magic, 0.7 * volume);
    }

    /**
     * The magic of a house: a deep hum growing for `seconds` round the place (its own voice — the short
     * sounds of the building never cut it), heard by everyone near, fainter far away.
     */
    playHouseHum(position, seconds = 10) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const key = 'houseHum' + Math.round(seconds * 10);
        if (!this.sounds[key]) this.sounds[key] = this._synthHum(seconds);
        if (!this._hum) { this._hum = new THREE.PositionalAudio(this.effectsListener); this.scene?.add(this._hum); }
        const v = this._hum;
        if (v.isPlaying) v.stop();
        v.setBuffer(this.sounds[key]);
        v.setRefDistance(12);
        v.setVolume(0.9 * (this.spellVolume ?? 1));
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    /**
     * The ice of «Create an Ice Castle» / «Ice Bridge» (IceMagic.js): 'iceBell' (one crystal note —
     * `rate` makes the rising tune), 'iceFloor' (the frost running from the foot), 'iceCrack', 'iceDone',
     * 'iceChime'. Made ahead (prewarmStep); heard by everyone near.
     */
    playIce(kind, position, volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !this.loaded || !position) return;
        const key = kind === 'iceCrack' ? 'crack' : kind;
        if (!this.sounds[key]) {
            const make = { iceBell: () => this._synthIceBell(), iceFloor: () => this._synthIceFloor(2.6), crack: () => this._synthCrack(),
                iceDone: () => this._synthChime([523, 659, 784, 1047, 1319, 1568, 2093], 3.2, 1.5), iceChime: () => this._synthChime([1568, 2093, 2637, 3136], 1.4, 3) }[key];
            if (!make) return;
            this.sounds[key] = make();
        }
        this._castAt(this.sounds[key], position, volume, key === 'iceFloor' || key === 'iceDone' ? 14 : 9, kind === 'iceCrack' ? 1.6 + Math.random() * 0.6 : rate);
    }

    /**
     * The Temple of the Gods (Temple.js): the wind outside (`wind` 0…1) and the quiet echo of its halls
     * (`hall` 0…1) — two loops, made ahead (prewarmStep); both 0 — silent.
     */
    templeAmbience(wind, hall) {
        if (!this.context) return;
        const amb = this._templeAmb || (this._templeAmb = {});
        for (const [key, k] of [['templeWind', wind], ['templeHall', hall]]) {
            let a = amb[key];
            const want = this.enabled && this.loaded ? k : 0;
            if (want <= 0.01) { if (a?.isPlaying) a.stop(); continue; }
            if (!this.sounds[key]) continue; // (not made yet: comes a moment later)
            if (!a) { a = amb[key] = new THREE.Audio(this.effectsListener); a.setBuffer(this.sounds[key]); a.setLoop(true); }
            a.setVolume(want * 0.45);
            if (!a.isPlaying) a.play();
        }
    }

    /** A scroll of the temple's library rings softly (a high chime) where it floats. */
    playTempleChime(position) {
        if (!this.enabled || !this.context || !this.loaded || !this.sounds.templeChime) return;
        this._playAt(this.sounds.templeChime, position, 0.35, 5, 0.94 + Math.random() * 0.12);
    }

    /** The wind of Venus round the ruin: a low roar rising and falling, a thin whistle in the cracks (it loops). */
    _synthTempleWind(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds), fade = Math.floor(sr * 0.6);
        const raw = new Float32Array(len + fade);
        let lp = 0, lp2 = 0, ph = 0;
        for (let i = 0; i < raw.length; i++) {
            const t = i / sr;
            const gust = 0.55 + 0.3 * Math.sin(2 * Math.PI * t / seconds) + 0.15 * Math.sin(2 * Math.PI * 3 * t / seconds + 1);
            lp += ((Math.random() * 2 - 1) - lp) * (0.02 + 0.02 * gust);
            lp2 += (lp - lp2) * 0.08;
            ph += (2 * Math.PI * (620 + 140 * Math.sin(2 * Math.PI * 2 * t / seconds))) / sr;
            raw[i] = (lp2 * 3.2 + Math.sin(ph) * 0.025 * gust * gust) * gust;
        }
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const k = i < fade ? i / fade : 1;
            d[i] = Math.max(-1, Math.min(1, raw[i] * k + (i < fade ? raw[len + i] * (1 - k) : 0)));
        }
        return buf;
    }

    /** Inside the temple: a hushed hall — a low air tone and now and then a far drop or a stone ticking, echoed. */
    _synthTempleHall(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, lp2 = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            lp += ((Math.random() * 2 - 1) - lp) * 0.01;
            lp2 += (lp - lp2) * 0.02;
            d[i] = lp2 * 2.5 + Math.sin(2 * Math.PI * 55 * t) * 0.012 + Math.sin(2 * Math.PI * 82.5 * t) * 0.008;
        }
        const ticks = [[0.9, 1900], [3.7, 1250], [6.2, 2400]];
        for (const [at, f] of ticks) {
            for (let e = 0; e < 6; e++) { // (the echo: the same, later and softer)
                const i0 = Math.floor((at + e * 0.31) * sr) % len, amp = 0.09 * Math.pow(0.5, e);
                for (let k = 0; k < sr * 0.15; k++) { const tk = k / sr; d[(i0 + k) % len] += Math.sin(2 * Math.PI * f * tk) * Math.exp(-tk * 40) * amp; }
            }
        }
        for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i]));
        return buf;
    }

    /** A crystal bell: a clear note (C6) with the glassy inharmonic partials of a struck ice rod, a long shimmer. */
    _synthIceBell() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 1.6);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const f = 1046.5, P = 2 * Math.PI;
        const parts = [[1, 1, 3], [2.76, 0.35, 5], [5.4, 0.18, 8], [8.93, 0.08, 12], [1.003, 0.5, 2.6]];
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            for (const [k, a, dec] of parts) v += Math.sin(P * f * k * t) * a * Math.exp(-t * dec);
            d[i] = v * Math.min(1, t * 900) * 0.3;
        }
        return buf;
    }

    /** The frost spreading: a shimmering sweep of tiny crystal notes rising over a hiss of ice, `seconds` long. */
    _synthIceFloor(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const P = 2 * Math.PI;
        const notes = [];
        for (let k = 0; k < 26; k++) notes.push({ at: (k / 26) * seconds * 0.85 + Math.random() * 0.05, f: 1200 * Math.pow(2, (k / 26) * 1.6 + Math.random() * 0.15) });
        let lp = 0, hp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 6) * Math.min(1, (seconds - t) * 3);
            lp += ((Math.random() * 2 - 1) - lp) * 0.6;
            hp = lp - hp * 0.2; // (a bright hiss: the crackle of freezing)
            d[i] = hp * 0.12 * env * (0.6 + 0.4 * Math.sin(P * 13 * t));
        }
        for (const n of notes) { // (each note only over its own half second)
            const i0 = Math.floor(n.at * sr), i1 = Math.min(len, i0 + Math.floor(sr * 0.5));
            for (let i = i0; i < i1; i++) { const tk = (i - i0) / sr; d[i] += Math.sin(P * n.f * tk) * Math.exp(-tk * 9) * 0.22; }
        }
        for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i]));
        return buf;
    }

    /** The hum stops (the magic broke). */
    stopHouseHum() { if (this._hum?.isPlaying) this._hum.stop(); }

    /**
     * «Protection House»: the dome's quiet hum while it grows (looped) at `position`; `k` its loudness
     * (0: silent), `rate` its pitch (higher as it grows).
     */
    wardHum(position, k, rate = 1) {
        if (!this.context) return;
        const v = this._wardHumV;
        if (!(k > 0) || !this.enabled || !this.loaded) { if (v?.isPlaying) v.stop(); return; }
        if (!this.sounds.wardHum) this.sounds.wardHum = this._synthWardHum();
        if (!v) { this._wardHumV = new THREE.PositionalAudio(this.effectsListener); this.scene?.add(this._wardHumV); return this.wardHum(position, k, rate); }
        if (!v.isPlaying) { v.setBuffer(this.sounds.wardHum); v.setLoop(true); v.setRefDistance(10); v.play(); }
        v.setVolume(0.7 * k * (this.spellVolume ?? 1));
        v.setPlaybackRate(rate);
        if (position) { v.position.copy(position); v.updateMatrixWorld(true); }
    }

    /** «стоп» on a growing dome: a click and a bright chime — it is set. */
    playWardSet(position) {
        if (!this.enabled || !this.context || !this.loaded) return;
        if (this._wardHumV?.isPlaying) this._wardHumV.stop();
        if (!this.sounds.wardClick) this.sounds.wardClick = this._synthKnock(1400, 0.07);
        if (!this.sounds.wardChime) this.sounds.wardChime = this._synthChime([1047, 1568, 2093], 1.2, 4);
        this._castAt(this.sounds.wardClick, position, 1.2, 10);
        this._castAt(this.sounds.wardChime, position, 0.8, 12);
    }

    /** A 2 s loop of a soft magic hum (every tone whole cycles in it: no seam where it loops). */
    _synthWardHum() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 2);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const P = 2 * Math.PI;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const trem = 0.75 + 0.25 * Math.sin(P * 3 * t);
            const v = Math.sin(P * 110 * t) * 0.35 + Math.sin(P * 110.5 * t) * 0.3 + Math.sin(P * 220 * t) * 0.12
                + Math.sin(P * 660 * t) * 0.06 * (0.5 + 0.5 * Math.sin(P * 5 * t)) + Math.sin(P * 1320 * t) * 0.03 * Math.sin(P * 2 * t) ** 2;
            d[i] = v * trem * 0.6;
        }
        return buf;
    }

    /** The tune of the house magic (HouseTheme.js) for `seconds` and a level, made once (≈70 ms — made ahead in idle time). */
    _houseTheme(seconds, level) {
        const key = 'houseTheme' + Math.round(seconds * 10) + '_' + level;
        if (!this.sounds[key]) {
            const sr = 24000; // (the bells and the harp need no more: made twice as fast; played at the context's rate)
            const data = houseTheme(sr, seconds, level);
            const buf = this.context.createBuffer(1, data.length, sr);
            buf.copyToChannel(data, 0);
            this.sounds[key] = buf;
        }
        return this.sounds[key];
    }

    /** Make the tune ahead (no hitch when a house is made): level 1 here, the others in a worker. */
    prepareHouseTheme(seconds = 10, level = 1) {
        if (!this.context) return;
        if (level === 1) this._houseTheme(seconds, level);
        else this._themeWorker('houseTheme' + Math.round(seconds * 10) + '_' + level, seconds, level);
    }

    /** A long tune made in a worker (theme.worker.js), never in a frame: in this.sounds[key] when ready. */
    _themeWorker(key, seconds, level) {
        const busy = this._themeBusy || (this._themeBusy = new Set());
        if (!this.context || this.sounds[key] || busy.has(key)) return;
        busy.add(key);
        const sr = 24000;
        try {
            const w = new Worker(new URL('./theme.worker.js', import.meta.url), { type: 'module' });
            w.onmessage = (e) => {
                const data = e.data?.data;
                if (data) { const buf = this.context.createBuffer(1, data.length, sr); buf.copyToChannel(data, 0); this.sounds[key] = buf; }
                busy.delete(key);
                w.terminate();
            };
            w.onerror = () => { busy.delete(key); w.terminate(); };
            w.postMessage({ sr, seconds, level });
        } catch (e) { busy.delete(key); } // (no worker: the level-1 tune plays)
    }

    /**
     * The main tune of the house magic from the place of the house: grows with it for `seconds`, its last
     * chord rings exactly when the house is done. One at a time (its own voice; a new one replaces it).
     */
    playHouseTheme(position, seconds = 10, level = 1) {
        if (!this.enabled || !this.context || !this.loaded) return;
        // (levels 2–5: made ahead in a worker — not ready yet, the first level's tune; its synthesis in a frame froze it)
        const L = Math.max(1, Math.min(5, level | 0)), key = 'houseTheme' + Math.round(seconds * 10) + '_' + L;
        let buf = this.sounds[key];
        if (!buf) { if (L > 1) this.prepareHouseTheme(seconds, L); buf = this._houseTheme(seconds, 1); }
        if (!this._theme) { this._theme = new THREE.PositionalAudio(this.effectsListener); this.scene?.add(this._theme); }
        const v = this._theme;
        this._themeRun = (this._themeRun || 0) + 1;
        if (v.isPlaying) v.stop();
        v.gain.gain.cancelScheduledValues(this.context.currentTime);
        v.setBuffer(buf);
        // (louder than at first — the author: «it's quiet»: ~+4 dB, and loud as far as 26 m from the house;
        // capped so the loudest setting never clips)
        v.setRefDistance(26);
        v.setVolume(Math.min(1.15, 1.8) * (this.spellVolume ?? 1));
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    /** «Create a Castle»'s tune (the house's theme over 30 s, its grandest form): made ahead in a worker. */
    prepareCastleTheme(seconds = 30) { this._themeWorker('castleTheme' + seconds, seconds, 5); }

    /** The castle's tune from its place: the long one when ready (else the house's grandest, shorter). */
    playCastleTheme(position, seconds = 30) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const buf = this.sounds['castleTheme' + seconds];
        if (!buf) { this.prepareCastleTheme(seconds); this.playHouseTheme(position, 10, 1); return; } // (the house's tune, made ahead)
        if (!this._theme) { this._theme = new THREE.PositionalAudio(this.effectsListener); this.scene?.add(this._theme); }
        const v = this._theme;
        this._themeRun = (this._themeRun || 0) + 1;
        if (v.isPlaying) v.stop();
        v.gain.gain.cancelScheduledValues(this.context.currentTime);
        v.setBuffer(buf);
        v.setRefDistance(40); // (a castle: loud far round it)
        v.setVolume(Math.min(1.15, 1.8) * (this.spellVolume ?? 1));
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    /** The magic broke: the tune dies away on a sour falling chord (never plays on). */
    breakHouseTheme(position) {
        const v = this._theme;
        if (!v?.isPlaying || !this.context) return;
        const run = this._themeRun, now = this.context.currentTime;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.12);
        setTimeout(() => { if (this._themeRun === run && v.isPlaying) v.stop(); }, 700);
        if (!this.sounds.houseBreak) this.sounds.houseBreak = this._synthHouseBreak();
        this._castAt(this.sounds.houseBreak, position || v.position, 1.2, 14);
    }

    _synthHouseBreak() {
        const sr = 24000, data = houseThemeBreak(sr), buf = this.context.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        return buf;
    }

    /** «Stitching»: the stone iris shuts — a deep thud of stone meeting stone under a soft, low chime. */
    playSeal(position, volume = 1) {
        if (!this.enabled || !this.context) return;
        if (!this.sounds.seal) this.sounds.seal = this._synthKnock(90, 0.5);
        if (!this.sounds.sealChime) this.sounds.sealChime = this._synthChime([392, 587, 784], 1.4, 3.5);
        this._castAt(this.sounds.seal, position, 1.4 * volume, 10, 0.95 + Math.random() * 0.1);
        this._castAt(this.sounds.sealChime, position, 0.55 * volume, 10, 1);
    }

    /** The house's sounds while it rises: 'wood' a log knocking into place, 'sand' the sand melting into glass, 'block' a block laid. */
    playHouseBit(kind, position, volume = 1) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const key = 'house_' + kind;
        if (!this.sounds[key]) this.sounds[key] = kind === 'wood' ? this._synthKnock(170, 0.3) : kind === 'sand' ? this._synthSizzle(0.9) : kind === 'stone' ? this._synthKnock(110, 0.35) : this._synthKnock(320, 0.12);
        this._castAt(this.sounds[key], position, volume, kind === 'block' ? 6 : 8, 0.85 + Math.random() * 0.3);
    }

    /** The house is done: a warm rising chord. */
    playHouseDone(position) {
        if (!this.enabled || !this.context || !this.loaded) return;
        if (!this.sounds.houseDone) this.sounds.houseDone = this._synthChime([392, 523, 659, 784, 1047], 2.2, 2.2);
        if (this._hum?.isPlaying) this._hum.stop();
        this._castAt(this.sounds.houseDone, position, 0.8, 14); // (over the tune's own last chord: the same C major)
    }

    /** Notes struck one after another and ringing (a chime); `decay` per second. */
    _synthChime(freqs, seconds, decay) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const gap = Math.min(0.12, seconds / (freqs.length * 3));
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            freqs.forEach((f, k) => {
                const tk = t - k * gap;
                if (tk < 0) return;
                const e = Math.min(1, tk * 400) * Math.exp(-tk * decay);
                v += (Math.sin(2 * Math.PI * f * tk) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * tk)) * e;
            });
            d[i] = Math.max(-1, Math.min(1, v * 0.28 * Math.min(1, (seconds - t) * 8)));
        }
        return buf;
    }

    /** A hum of magic growing over `seconds`: low drones beating, a shimmer rising, the wind of the whirl. */
    _synthHum(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, ph1 = 0, ph2 = 0, ph3 = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr, u = t / seconds;
            const env = Math.min(1, t * 2) * (0.35 + 0.65 * u) * Math.min(1, (seconds - t) * 4);
            ph1 += (2 * Math.PI * (70 + 30 * u)) / sr;
            ph2 += (2 * Math.PI * (70.7 + 30.5 * u)) / sr;
            ph3 += (2 * Math.PI * (440 + 440 * u * u)) / sr;
            lp += ((Math.random() * 2 - 1) - lp) * (0.03 + 0.05 * u);
            const shimmer = Math.sin(ph3) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 6 * t)) * 0.12 * u;
            d[i] = Math.max(-1, Math.min(1, (Math.sin(ph1) * 0.45 + Math.sin(ph2) * 0.35 + shimmer + lp * 1.6 * (0.4 + u)) * env));
        }
        return buf;
    }

    /** A wooden knock (a log, a block put down): a short click and a dull ringing body at `f` Hz. */
    _synthKnock(f, seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            lp += ((Math.random() * 2 - 1) - lp) * 0.4;
            const s = lp * Math.exp(-t * 120) + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 22) * 0.8 + Math.sin(2 * Math.PI * f * 2.7 * t) * Math.exp(-t * 45) * 0.25;
            d[i] = Math.max(-1, Math.min(1, s * Math.min(1, t * 3000)));
        }
        return buf;
    }

    /** A bone knocking into its place / onto the ground (the risen dead — Skeletons.js): a dry, light clack. */
    /**
     * A thing leaves the hand fast (Items._letGo): the air it cuts — louder and higher the faster; a long thing spinning
     * whirls. Only past ~4 m/s; made ahead (prewarmStep), never in the moment.
     */
    playThrow(speed, shape = 'round', position = null) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const buf = this.sounds[shape === 'long' ? 'thr_whirl' : 'thr_whoosh'];
        if (!buf) return;
        const k = Math.min(1, Math.max(0, (speed - 4) / 18));
        const vol = 0.25 + 0.55 * k, rate = 0.85 + 0.45 * k + (Math.random() - 0.5) * 0.08;
        if (position) this._playAt(buf, position, vol, 6, rate); else this._play(buf, vol * 0.8, rate);
    }

    /** A thrown / dropped thing hits the ground or a wall ('round' | 'long' | 'flat' | 'soft' | 'clink' | 'splash') at `speed` m/s. */
    playItemHit(kind, speed, position) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const key = { round: 'thr_thump', long: 'thr_clack', flat: 'thr_slap', soft: 'thr_thud', clink: 'thr_clink', splash: 'thr_splash' }[kind] || 'thr_thud';
        const buf = this.sounds[key];
        if (!buf || !position) return;
        const k = Math.min(1, speed / 14);
        this._playAt(buf, position, 0.25 + 0.6 * k, 5, 0.9 + Math.random() * 0.2);
    }

    /** The monster's paw (MonsterGrab.js): 'grab' | 'squeeze' | 'crunch' — made ahead (prewarmStep). */
    playGrab(kind, position, volume = 1) {
        if (!this.enabled || !this.context || !this.loaded) return;
        const buf = this.sounds['grab_' + kind];
        if (!buf || !position) return;
        this._playAt(buf, position, Math.min(1, 0.8 * volume), 10, 0.9 + Math.random() * 0.2);
    }

    playBoneClack(position, volume = 1) {
        if (!this.enabled || !this.context || !this.loaded) return;
        if (!this.sounds.boneClack) this.sounds.boneClack = this._synthKnock(820, 0.09);
        this._playAt(this.sounds.boneClack, position, 0.7 * volume, 8, 0.85 + Math.random() * 0.35);
    }

    /** Landing after a jump / a drop: a dull thud of the feet (made ahead: prewarmStep). */
    playLand(volume = 1) {
        if (!this.context) return;
        if (!this.sounds.land) this.sounds.land = this._synthKnock(55, 0.22);
        this._play(this.sounds.land, 0.6 * volume, 0.9 + Math.random() * 0.2);
    }

    /**
     * A step of the monster form (MonsterForm.js, ×7): a deep thud the ground answers — the foot's blow (25–32 Hz),
     * the earth crunching under it, a short rumble rolling away; at `position`, heard far (the others too).
     */
    playGiantStep(position, volume = 1) {
        if (!this.enabled || !this.context || !this.loaded) return;
        if (!this.sounds.giantStep) this.sounds.giantStep = this._synthGiantStep();
        if (position) this._playAt(this.sounds.giantStep, position, 1.3 * volume, 30, 0.88 + Math.random() * 0.2);
        else this._play(this.sounds.giantStep, 0.9 * volume, 0.88 + Math.random() * 0.2);
    }

    _synthGiantStep() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 0.9);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, lp2 = 0, ph = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = 32 - 9 * Math.min(1, t * 3); // (the thud's pitch sinks as the ground gives)
            ph += (2 * Math.PI * f) / sr;
            lp += ((Math.random() * 2 - 1) - lp) * 0.06;  // the rumble (low noise)
            lp2 += ((Math.random() * 2 - 1) - lp2) * 0.5; // the crunch (the earth, the stones under the foot)
            const thud = Math.sin(ph) * Math.exp(-t * 6) * 1.1;
            const crunch = lp2 * Math.exp(-t * 28) * 0.45 * (0.6 + 0.4 * Math.sin(t * 310));
            const roll = lp * 2.2 * Math.exp(-t * 3.2) * Math.min(1, t * 20);
            d[i] = Math.max(-1, Math.min(1, (thud + crunch + roll) * Math.min(1, t * 2500) * 0.85));
        }
        return buf;
    }

    /** A step on snow: a soft muffled crunch (the crystals giving under the foot). */
    playSnowStep(volume = 1) {
        if (!this.context) return;
        if (!this.sounds.snowStep) this.sounds.snowStep = this._synthSnowStep();
        this._play(this.sounds.snowStep, 0.55 * volume, 0.85 + Math.random() * 0.3);
    }

    /** «Snowman»: the snow rolls into three balls (soft crunches) — then a merry ring as it comes alive. */
    playSnowman(position) {
        if (!this.enabled || !this.context) return;
        if (!this.sounds.snowman) this.sounds.snowman = this._synthSnowman();
        this._castAt(this.sounds.snowman, position, 1.3, 9, 1);
    }

    _synthSnowman() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 4.2);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        // soft crunches while the balls roll and settle (0 … 2.8 s), a little louder as each lands
        let lp = 0, lp2 = 0, grain = 0;
        for (let i = 0; i < Math.floor(sr * 2.9); i++) {
            const t = i / sr;
            const land = [0.9, 1.75, 2.55].reduce((m, a) => Math.max(m, t >= a ? Math.exp(-(t - a) * 12) : 0), 0);
            const env = Math.min(1, t * 6) * (0.35 + 0.25 * Math.abs(Math.sin(t * 9)) + 0.7 * land);
            lp += ((Math.random() * 2 - 1) - lp) * 0.2;
            lp2 += (lp - lp2) * 0.3;
            if (Math.random() < 0.01) grain = (Math.random() * 2 - 1) * 0.8;
            grain *= 0.93;
            d[i] = (lp2 * 1.1 + grain * 0.45) * env * 0.7;
        }
        // the merry ring: bells rising (it comes alive), then a little blink-ting
        const notes = [[2.9, 784], [3.0, 988], [3.1, 1175], [3.2, 1568], [3.65, 2093]];
        for (const [at, f] of notes) {
            const i0 = Math.floor(at * sr);
            for (let i = i0; i < len; i++) {
                const t = (i - i0) / sr;
                const e = Math.min(1, t * 400) * Math.exp(-t * 4.5);
                d[i] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * t)) * e * 0.22;
            }
        }
        for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i] * Math.min(1, (len - i) / (sr * 0.1))));
        return buf;
    }

    _synthSnowStep() {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * 0.26);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let lp = 0, lp2 = 0, grain = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 90) * Math.exp(-t * 14);
            lp += ((Math.random() * 2 - 1) - lp) * 0.22; // (muffled: no hiss)
            lp2 += (lp - lp2) * 0.3;
            if (Math.random() < 0.012) grain = (Math.random() * 2 - 1) * 0.9; // (the crunch: many tiny cracks)
            grain *= 0.93;
            d[i] = Math.max(-1, Math.min(1, (lp2 * 1.3 + grain * 0.5) * env));
        }
        return buf;
    }

    /** Sand melting into glass: a soft hiss with crackles. */
    _synthSizzle(seconds) {
        const ctx = this.context, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let prev = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.sin(Math.PI * t / seconds) ** 1.5;
            const w = Math.random() * 2 - 1, hp = w - prev; prev = w; // (bright: a hiss)
            const crackle = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 2 : 0;
            d[i] = Math.max(-1, Math.min(1, (hp * 0.35 + crackle) * env));
        }
        return buf;
    }

    // ------------------------------------------------------- synthesised
    _synthExplosion() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 1.8);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let lp = 0, lp2 = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 200) * Math.exp(-t * 3.2);
            const white = Math.random() * 2 - 1;
            lp += (white - lp) * (0.06 + 0.25 * Math.exp(-t * 8)); // bright crack, then rumble
            lp2 += (lp - lp2) * 0.08;
            const boom = Math.sin(2 * Math.PI * (55 - 25 * t) * t) * Math.exp(-t * 4);
            d[i] = Math.max(-1, Math.min(1, (lp * 2.2 + lp2 * 1.5 + boom * 0.9) * env));
        }
        return buf;
    }

    /** A deep rumble that grows (the ground shaking before everything comes down). */
    _synthRumble(seconds) {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let lp = 0, lp2 = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t / (seconds * 0.7)) ** 1.5 * Math.min(1, (seconds - t) * 3);
            lp += ((Math.random() * 2 - 1) - lp) * 0.02;
            lp2 += (lp - lp2) * 0.05;
            const sub = Math.sin(2 * Math.PI * (32 + 6 * Math.sin(t * 7)) * t) * (0.6 + 0.4 * Math.sin(t * 23));
            d[i] = Math.max(-1, Math.min(1, (lp2 * 9 + sub * 0.5) * env));
        }
        return buf;
    }

    /**
     * A piece of a building comes down (Structure.js / FallingBlocks): the deep blow of the mass hitting the ground,
     * the crash of it breaking, a hail of stones knocking about it, the dust's rumble dying away (3 s).
     */
    _synthCollapse() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 3);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let seed = 91, lp = 0, lp2 = 0, lp3 = 0;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        // the stones: short knocks, thick at the blow, a trickle after
        const knocks = [];
        for (let k = 0; k < 170; k++) {
            const t = k < 110 ? Math.pow(rnd(), 2.2) * 0.9 : 0.4 + Math.pow(rnd(), 1.6) * 2.3;
            knocks.push({ i: Math.floor(t * sr), f: 220 + rnd() * 1400, dec: 28 + rnd() * 45, a: (k < 110 ? 0.35 : 0.18) * (0.4 + rnd()) });
        }
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const w = rnd() * 2 - 1;
            lp += (w - lp) * (0.05 + 0.3 * Math.exp(-t * 10)); // the crash: bright at the blow, then dull
            lp2 += (lp - lp2) * 0.06;
            lp3 += (w - lp3) * 0.012; // the rumble of the dust
            const boom = Math.sin(2 * Math.PI * (58 - 26 * Math.min(t, 1)) * t) * Math.exp(-t * 3.8);
            const crash = (lp * 1.8 + lp2 * 1.4) * Math.min(1, t * 300) * Math.exp(-t * 2.6);
            const rumble = lp3 * 7 * Math.min(1, t * 6) * Math.exp(-t * 0.9);
            d[i] = boom * 0.85 + crash + rumble;
        }
        for (const k of knocks) for (let j = 0; j < sr * 0.12 && k.i + j < len; j++) {
            const t = j / sr;
            d[k.i + j] += Math.sin(2 * Math.PI * k.f * t) * Math.exp(-t * k.dec) * k.a * (1 - Math.exp(-t * 4000));
        }
        for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i]));
        return buf;
    }

    /** …and as it gives way: stone grinding on stone, a groan that rises and snaps (0.9 s). */
    _synthGroan() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.9);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let seed = 17, lp = 0, ph = 0;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = 46 + 30 * t + 6 * Math.sin(t * 31);
            ph += 2 * Math.PI * f / sr;
            const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1; // (a rough, buzzing tone: grinding)
            lp += ((rnd() * 2 - 1) - lp) * 0.08;
            const env = Math.min(1, t * 5) * (t < 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) * 12));
            const grit = lp * (0.6 + 0.4 * Math.sin(t * 90 + Math.sin(t * 13) * 3));
            const snap = t > 0.74 ? (rnd() * 2 - 1) * Math.exp(-(t - 0.74) * 40) * 1.4 : 0;
            d[i] = Math.max(-1, Math.min(1, (saw * 0.35 + grit * 0.9) * env + snap));
        }
        return buf;
    }

    /** A piece of a building lands (`size`: blocks): louder and deeper the bigger it is. */
    playCollapse(position, size = 10) {
        if (!this.enabled || !this.context) return;
        if (!this.sounds.collapse) this.sounds.collapse = this._synthCollapse();
        const k = Math.min(1, Math.sqrt(size) / 14);
        this._playAt(this.sounds.collapse, position, 0.5 + 1.6 * k, 8 + 22 * k, 1.15 - 0.35 * k + Math.random() * 0.06);
    }

    /** A piece of a building gives way (the start of its fall). */
    playGiveWay(position, size = 10) {
        if (!this.enabled || !this.context) return;
        if (!this.sounds.groan) this.sounds.groan = this._synthGroan();
        if (!this.sounds.crack) this.sounds.crack = this._synthCrack();
        const k = Math.min(1, Math.sqrt(size) / 14);
        this._playAt(this.sounds.groan, position, 0.4 + 0.9 * k, 6 + 16 * k, 1.1 - 0.3 * k);
        this._playAt(this.sounds.crack, position, 0.6 + 0.8 * k, 8 + 14 * k, 0.8 + Math.random() * 0.2);
    }

    /** A short dry crack of stone. */
    /** «Heard you, but no mana»: a soft spark that fizzles out — two falling tones and a little hiss (0.35 s). */
    _synthNoMana() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.35);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let seed = 5, lp = 0, ph = 0;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = t < 0.12 ? 520 : 330; // (down a step: «нет»)
            ph += 2 * Math.PI * f * (1 - t * 0.6) / sr;
            const env = Math.min(1, t * 400) * Math.exp(-((t < 0.12 ? t : t - 0.12)) * 14) * (t < 0.12 ? 1 : 0.85);
            lp += (rnd() - lp) * 0.25;
            d[i] = Math.max(-1, Math.min(1, (Math.sin(ph) * 0.45 + Math.sin(ph * 2.01) * 0.12 + lp * 0.18 * Math.exp(-t * 9)) * env));
        }
        return buf;
    }

    /** The «не хватает маны» sound. */
    playNoMana() { if (this.sounds.noMana) this._play(this.sounds.noMana, 0.55); }

    _synthCrack() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.35);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 2000) * Math.exp(-t * 18);
            lp += ((Math.random() * 2 - 1) - lp) * 0.35;
            d[i] = Math.max(-1, Math.min(1, (lp * 1.6 + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 30) * 0.5) * env));
        }
        return buf;
    }

    /** Bubbly water noise: a rising gurgle, or a short splash. */
    _synthWater(seconds, splash) {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let lp = 0, bubble = 0, bf = 300, bt = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = splash ? Math.min(1, t * 300) * Math.exp(-t * 7) : Math.sin(Math.PI * t / seconds) ** 2;
            lp += ((Math.random() * 2 - 1) - lp) * (splash ? 0.5 : 0.12);
            // random bubbles: short chirps rising in pitch
            if (t >= bt) { bt = t + 0.02 + Math.random() * 0.06; bf = 250 + Math.random() * 700; bubble = 1; }
            bubble *= 0.9993;
            bf *= 1.00012;
            const b = Math.sin(2 * Math.PI * bf * t) * bubble * 0.35;
            d[i] = Math.max(-1, Math.min(1, (lp * (splash ? 1.4 : 0.6) + b) * env));
        }
        return buf;
    }

    /** A soft «блуп» (a short falling tone, no click) over a slow lowpassed spill, then drops plinking one by one. */
    _synthBubblePop() {
        const ctx = this.context;
        const sr = ctx.sampleRate, seconds = 1.5, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const drops = [];
        for (let k = 0; k < 9; k++) drops.push({ t: 0.12 + k * 0.1 + Math.random() * 0.08, f: 900 + Math.random() * 1100, a: 0.05 + Math.random() * 0.07 });
        let lp = 0, ph = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            // the «блуп»: 560 → 190 Hz in 0.2 s, a soft start and end
            const bl = t < 0.22 ? Math.min(1, t / 0.012) * Math.exp(-t * 11) : 0;
            ph += 2 * Math.PI * (190 + 370 * Math.exp(-t * 16)) / sr;
            // the spill: lowpassed noise that swells a little and thins out
            lp += ((Math.random() * 2 - 1) - lp) * 0.16;
            const sp = Math.min(1, t / 0.06) * Math.exp(-t * 3.4) * 0.5;
            let x = Math.sin(ph) * bl * 0.55 + lp * sp * 1.1;
            for (const dr of drops) {
                const u = t - dr.t;
                if (u > 0 && u < 0.09) x += Math.sin(2 * Math.PI * dr.f * (1 + 0.5 * u * 8) * u) * Math.min(1, u / 0.004) * Math.exp(-u * 50) * dr.a;
            }
            d[i] = Math.max(-0.95, Math.min(0.95, x)) * Math.min(1, (seconds - t) / 0.1);
        }
        return buf;
    }

    _synthWhoosh() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.6);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.sin(Math.PI * Math.min(1, t / 0.6)) ** 2;
            lp += ((Math.random() * 2 - 1) - lp) * (0.05 + 0.3 * t);
            d[i] = lp * env * 1.8 + Math.sin(2 * Math.PI * (180 + 500 * t) * t) * env * 0.15;
        }
        return buf;
    }

    /** A pig's oink at a place (rate > 1: a squeal); far off it is faint (refDistance). */
    playOink(position, volume = 1, refDistance = 6, rate = 1) {
        if (!this.enabled || !this.loaded) return;
        if (!this.sounds.oink) this.sounds.oink = [this._synthOink(0), this._synthOink(1)];
        this._playAt(this.sounds.oink[Math.floor(Math.random() * 2)], position, volume, refDistance, rate);
    }

    /** The clever owl (Owls.js): 'hoot' | 'sad' | 'wings' | 'coo' | 'chime' — made ahead (prewarmStep). */
    playOwl(position, kind = 'hoot') {
        if (!this.enabled || !this.context) return;
        const key = 'owl_' + kind;
        if (!this.sounds[key]) { if (!OWL_SOUNDS.includes(kind)) return; this.sounds[key] = synthOwl(this.context, kind); }
        this._playAt(this.sounds[key], position, kind === 'wings' ? 0.7 : 1, kind === 'wings' ? 6 : 12, 0.95 + Math.random() * 0.1);
    }

    /** The bird of Spencer (SpencerBirds.js): 'chirp' | 'trill' | 'wings' — made ahead (prewarmStep). Only a seer ever asks for it. */
    playSpencer(position, kind = 'chirp') {
        if (!this.enabled || !this.context || !position) return;
        const key = 'spencer_' + kind;
        if (!this.sounds[key]) { if (!SPENCER_SOUNDS.includes(kind)) return; this.sounds[key] = synthSpencer(this.context, kind); }
        this._playAt(this.sounds[key], position, kind === 'wings' ? 0.5 : 0.9, kind === 'wings' ? 5 : 14, 0.96 + Math.random() * 0.1);
    }

    /**
     * The Castle of Ghosts (Ghosts.js): one of GhostRules.GHOST_SOUNDS at a place — made ahead (prewarmStep). Only a seer ever asks for it.
     * The whisper and the chill are close (a short reach), the bell and the cry carry far through the halls.
     */
    playGhost(position, id = 'whisper', volume = 1) {
        if (!this.enabled || !this.context || !position || id === 'drone') return;
        const key = 'ghost_' + id;
        if (!this.sounds[key]) { if (!GHOST_SOUND_IDS.includes(id)) return; this.sounds[key] = synthGhost(this.context, id); }
        const far = { bell: 40, cry: 18, wail: 14, laugh: 12, steps: 10, knock: 10, door: 10, scrape: 7, fade: 6, whisper: 4, chill: 3 }[id] || 8;
        this._playAt(this.sounds[key], position, volume, far, (id === 'bell' ? 0.97 : 0.92) + Math.random() * (id === 'bell' ? 0.06 : 0.16));
    }

    /** The castle's low hum while the hero is inside (`k` 0…1; 0 — stopped). One looping voice, never more (made ahead: until then silent). */
    ghostDrone(k) {
        if (!this.context) return;
        const want = this.enabled && this.loaded ? k : 0;
        let a = this._ghostDrone;
        if (want <= 0.01) { if (a?.isPlaying) a.stop(); return; }
        if (!this.sounds.ghost_drone) return;
        if (!a) { a = this._ghostDrone = new THREE.Audio(this.effectsListener); a.setBuffer(this.sounds.ghost_drone); a.setLoop(true); }
        a.setVolume(want * 0.5);
        if (!a.isPlaying) { try { a.play(); } catch (e) { /* not resumed yet */ } }
    }

    /** The infernal gargoyles (Gargoyles.js): 'roar' | 'screech' | 'wings' | 'bite' | 'crumble' | 'shatter' | 'ignite' | 'burst' — made ahead (prewarmStep). */
    playGargoyle(position, kind = 'roar', volume = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'garg_' + kind;
        if (!this.sounds[key]) { if (!GARGOYLE_SOUNDS.includes(kind)) return; this.sounds[key] = synthGargoyle(this.context, kind); }
        const far = kind === 'sunBang' ? 180 : kind === 'thunder' || kind === 'groan' ? 130 : kind === 'ignite' || kind === 'burst' ? 60 : kind === 'screech' || kind === 'roar' ? 22 : kind === 'crumble' ? 16 : 10;
        this._playAt(this.sounds[key], position, volume, far, 0.94 + Math.random() * 0.12);
    }

    /** The dragon in a fight (Dragons.js): 'step' | 'land' | 'wing' | 'roar' | 'bite' | 'claw' | 'tail' at a place — made ahead (prewarmStep). */
    playDragon(position, kind = 'roar', volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'drg_' + kind;
        if (!this.sounds[key]) { if (!DRAGON_SOUNDS.includes(kind)) return; this.sounds[key] = synthDragon(this.context, kind); }
        const far = kind === 'roar' || kind === 'land' ? 40 : kind === 'step' ? 22 : 16;
        this._playAt(this.sounds[key], position, volume, far, rate * (0.95 + Math.random() * 0.1));
    }

    /** Дьяволос (Diabolos.js): 'snore' | 'step' | 'slam' | 'chain' | 'roar' | 'inhale' | 'fire' | 'ball' | 'boom' | 'clap' — в месте; сделано заранее (prewarmStep). */
    playDevil(position, kind = 'roar', volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'dvl_' + kind;
        if (!this.sounds[key]) return; // (не готово — не синтезируем в кадре)
        const far = kind === 'roar' || kind === 'boom' || kind === 'slam' ? 140 : kind === 'step' || kind === 'snore' ? 70 : kind === 'chain' ? 40 : 60;
        this._playAt(this.sounds[key], position, volume, far, rate * (0.96 + Math.random() * 0.08));
    }

    /** Тема Дьяволоса: хор (k — громкость: тихо, пока он спит рядом) и барабаны боя (`fight`). */
    devilTheme(k, fight) {
        if (!this.context || !this.loaded) return;
        this._loop('devil', this.enabled && k > 0.01 ? 'dvl_theme' : null, 0.5 * Math.min(1, k));
        this._loop('devilDrum', this.enabled && fight && k > 0.01 ? 'dvl_drums' : null, 0.55 * Math.min(1, k));
    }

    /** The plant creatures (Plants.js): 'rustle' | 'prick' | 'lash' | 'snap' | 'chomp' | 'gulp' | 'spit' | 'burn' | 'fall' at a place — made ahead (prewarmStep). */
    playPlant(position, kind = 'rustle', volume = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'plant_' + kind;
        if (!this.sounds[key]) { if (!PLANT_SOUNDS.includes(kind)) return; this.sounds[key] = synthPlant(this.context, kind); }
        this._playAt(this.sounds[key], position, volume, kind === 'snap' || kind === 'fall' || kind === 'chomp' ? 22 : 12, 0.94 + Math.random() * 0.12);
    }

    /** The Canaries (Canaries.js): a voice or a boulder's noise at a place; `rate` — the canary's own pitch (a big one low, a young one high). */
    playCanary(position, kind = 'mutter', volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'canary_' + kind;
        if (!this.sounds[key]) { if (!CANARY_SOUNDS.includes(kind)) return; this.sounds[key] = synthCanary(this.context, kind); }
        this._playAt(this.sounds[key], position, volume, kind === 'thud' || kind === 'grr' || kind === 'hit' ? 30 : 18, rate * (0.96 + Math.random() * 0.08));
    }

    /** The Tarons (Taron.js): a roar, a heavy step, the axe-hammer's wind-up and blow at a place — made ahead (prewarmStep). */
    playTaron(position, kind = 'grunt', volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'taron_' + kind;
        if (!this.sounds[key]) { if (!TARON_SOUNDS.includes(kind)) return; this.sounds[key] = synthTaron(this.context, kind); }
        this._playAt(this.sounds[key], position, volume, kind === 'roar' || kind === 'blade' || kind === 'hammer' || kind === 'die' ? 60 : kind === 'step' ? 45 : 30, rate * (0.96 + Math.random() * 0.08));
    }

    /** The duel arena (ArenaDuels.js): 'cheer' | 'groan' | 'gong' | 'beep' | 'fanfare' | 'clap' at a place — made ahead (prewarmStep). */
    playArena(position, kind, volume = 1, rate = 1) {
        if (!this.enabled || !this.context || !position) return;
        const key = 'arena_' + kind;
        if (!this.sounds[key]) { if (!ARENA_SOUNDS.includes(kind)) return; this.sounds[key] = synthArena(this.context, kind); }
        const far = kind === 'cheer' || kind === 'groan' || kind === 'clap' ? 26 : kind === 'gong' ? 30 : 14; // (the whole stands: heard round the arena)
        this._playAt(this.sounds[key], position, volume, far, rate * (kind === 'cheer' || kind === 'clap' ? 0.94 + Math.random() * 0.12 : 1));
    }

    /** The phoenix's soft healing song (a few warm, clear notes rising) at a place. */
    playPhoenixSong(position) {
        if (!this.enabled || !this.context) return;
        if (!this._phxSong) this._phxSong = this._synthPhoenix(true);
        this._playAt(this._phxSong, position, 1.1, 14, 1);
    }

    /** The phoenix's cry: a high clear call sliding up (startled, flying off, diving). */
    playPhoenixCry(position, rate = 1) {
        if (!this.enabled || !this.context) return;
        if (!this._phxCry) this._phxCry = this._synthPhoenix(false);
        this._playAt(this._phxCry, position, 1.2, 20, rate);
    }

    /** song: five notes of a pentatonic tune, each a pure tone with a soft vibrato and a ring; cry: one bright glide. */
    _synthPhoenix(song) {
        const ctx = this.context;
        const sr = ctx.sampleRate, dur = song ? 2.6 : 0.9, len = Math.floor(sr * dur);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const notes = song ? [[0, 587.3], [0.38, 659.3], [0.76, 784.0], [1.14, 880.0], [1.6, 1174.7]] : [[0, 1250]];
        for (const [at, f] of notes) {
            const i0 = Math.floor(at * sr), nd = song ? 1.0 : dur;
            let ph = 0;
            for (let i = i0; i < Math.min(len, i0 + Math.floor(nd * sr)); i++) {
                const t = (i - i0) / sr;
                const env = Math.min(1, t * (song ? 18 : 30)) * Math.exp(-t * (song ? 2.6 : 3.5));
                const fr = song ? f * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t)) : f * (1 + 0.9 * Math.min(1, t / 0.35)) * (1 + 0.02 * Math.sin(2 * Math.PI * 9 * t));
                ph += fr / sr;
                d[i] += env * (0.5 * Math.sin(2 * Math.PI * ph) + 0.18 * Math.sin(4 * Math.PI * ph) + 0.07 * Math.sin(6 * Math.PI * ph));
            }
        }
        for (let i = 0; i < len; i++) d[i] = Math.tanh(d[i] * 1.1) * 0.6;
        return buf;
    }

    /** A nasal grunt: a buzzing low voice through the snout, two or three short pulses. */
    _synthOink(kind) {
        const ctx = this.context;
        const sr = ctx.sampleRate, dur = kind ? 0.42 : 0.3, len = Math.floor(sr * dur);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let ph = 0, lp = 0, bp1 = 0, bp2 = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const pulses = kind ? Math.max(0, Math.sin(Math.PI * t / 0.14)) : Math.max(0, Math.sin(Math.PI * t / 0.15));
            const env = Math.min(1, t * 40) * Math.exp(-t * 3) * (0.4 + 0.6 * pulses);
            const f0 = (kind ? 150 : 125) - 50 * t / dur;
            ph += f0 / sr;
            const buzz = (ph % 1) < 0.3 ? 1 : -0.4; // (a rough pulse: the voice)
            const noise = Math.random() * 2 - 1;
            // two crude resonances (the snout) by one-pole filters
            bp1 += (buzz - bp1) * 0.12;
            bp2 += (buzz + noise * 0.4 - bp2) * 0.35;
            lp += ((bp1 * 0.7 + (bp2 - bp1) * 0.5) - lp) * 0.5;
            d[i] = lp * env * 0.7;
        }
        return buf;
    }

    _synthCreak() {
        const ctx = this.context;
        const sr = ctx.sampleRate, len = Math.floor(sr * 0.8);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 20) * Math.exp(-t * 2.5);
            const f = 90 + 40 * Math.sin(t * 9);
            const saw = ((t * f) % 1) * 2 - 1;
            d[i] = saw * env * 0.35 * (0.6 + 0.4 * Math.sin(t * 160));
        }
        return buf;
    }
}
