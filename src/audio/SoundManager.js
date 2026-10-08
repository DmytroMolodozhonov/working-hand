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
        this.music = { ambient: [], battle: null, current: null, currentIndex: 0, state: 'idle', volume: 0.5 };
        this.battleTimer = 0;
        this.isBattleMode = false;
        this.ambientPool = [];
        this.maxAmbient = 3;
        this.enabled = true;
        this.ambientEnabled = true; // "Звуки рычания" setting (zombie growls only)
        this.globalVolume = 1.0;
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

    setMusicVolume(val) {
        const gain = val / 100;
        this.music.volume = gain;
        if (this.music.current) this.music.current.setVolume(gain);
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

    _playAt(buffer, position, volume = 1, refDistance = 5) {
        if (!this.enabled || !buffer || !this.posVoices.length) return;
        const v = this.posVoices[this._posIdx];
        this._posIdx = (this._posIdx + 1) % this.posVoices.length;
        if (v.isPlaying) v.stop();
        v.setBuffer(buffer);
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

    playFrozenHit() {
        if (this.sounds.shatter) this._play(this.sounds.shatter, 1.2);
        else this.playHit();
    }

    playDeath(position) {
        this._playAt(this.sounds.death, position, 1.5, 5);
    }

    playThunder() { this._play(this.sounds.thunder, 1.0); }
    playInferno() { this._play(this.sounds.inferno, 0.8); }
    playSapira() { this._play(this.sounds.sapira, 1.0); }
    playWhoosh() { this.playSand(); }

    playSand() {
        if (this.sounds.sand) this._play(this.sounds.sand, 1.0);
        else if (this.sounds.inferno) this._play(this.sounds.inferno, 0.5, 2.0);
    }

    playIce() { this._play(this.sounds.ice, 1.4); }
    playBombardoCast() { this._play(this.sounds.cast, 0.9); }

    playExplosion(position, listenerPos) {
        if (!this.sounds.explosion) return;
        const d = listenerPos ? position.distanceTo(listenerPos) : 0;
        const vol = Math.max(0.15, 1.6 - d / 40);
        this._play(this.sounds.explosion, vol, 0.95 + Math.random() * 0.1);
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
