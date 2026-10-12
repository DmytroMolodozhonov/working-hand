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

import * as THREE from 'three';

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
                const sound = new THREE.PositionalAudio(this.audioListener);
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

        for (let i = 0; i < 10; i++) this.voices.push(new THREE.Audio(this.audioListener));
        for (let i = 0; i < 6; i++) this.posVoices.push(new THREE.PositionalAudio(this.audioListener));
        if (this.scene) this.setScene(this.scene);
        this.loaded = true;
        this.playAmbientMusic();
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
        const gain = val / 100;
        for (const item of this.ambientPool) item.sound.setVolume(gain);
        this.globalVolume = gain;
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
        this.spellVolume = val / 100;
    }

    _spell(buffer, volume = 1, rate = 1) {
        this._play(buffer, volume * (this.spellVolume ?? 1), rate, true);
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
    }

    // ------------------------------------------------------------------- SFX
    /** A sound effect (`own`: its volume is already set by its own slider, e.g. spells). */
    _play(buffer, volume = 1, rate = 1, own = false) {
        if (!this.enabled || !buffer || !this.voices.length) return;
        const v = this.voices[this._voiceIdx];
        this._voiceIdx = (this._voiceIdx + 1) % this.voices.length;
        if (v.isPlaying) v.stop();
        v.setBuffer(buffer);
        v.setVolume(volume * (own ? 1 : this.globalVolume));
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
        v.setVolume(volume * this.globalVolume);
        v.position.copy(position);
        v.updateMatrixWorld(true);
        v.play();
    }

    updateAmbient(playerPos, zombies, dt = 1 / 60) {
        if (!this.enabled) return;
        let minDist = Infinity;
        const candidates = [];
        for (const z of zombies) {
            if (z.isDead) continue;
            const dist = playerPos.distanceTo(z.group.position);
            if (dist < minDist) minDist = dist;
            if (dist < 15) candidates.push({ zombie: z, dist });
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
            slot.sound.setVolume(this.globalVolume);
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

    playThunder() { this._spell(this.sounds.thunder, 1.0); }

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
            this._rain = new THREE.Audio(this.audioListener);
            this._rain.setBuffer(buf);
            this._rain.setLoop(true);
            this._rain.setVolume(0);
        }
        const r = this._rain;
        r.setVolume(Math.min(1, k) * 0.9 * this.globalVolume);
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

    /** Water rising out of a river into the ball. */
    playWaterRise() {
        if (!this.context) return;
        if (!this.sounds.waterRise) this.sounds.waterRise = this._synthWater(1.1, false);
        this._spell(this.sounds.waterRise, 0.9, 0.9 + Math.random() * 0.2);
    }

    playSplash() {
        if (!this.context) return;
        if (!this.sounds.splash) this.sounds.splash = this._synthWater(0.7, true);
        this._spell(this.sounds.splash, 1.2, 0.85 + Math.random() * 0.3);
    }

    playChestOpen(position) {
        if (!this.sounds.chest) this.sounds.chest = this._synthCreak();
        this._playAt(this.sounds.chest, position, 1.2, 6);
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

    /** A short dry crack of stone. */
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
