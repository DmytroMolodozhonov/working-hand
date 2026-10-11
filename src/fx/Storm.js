/**
 * Storm.js — the weather of «Lightning Strike» and «Let it rain».
 *
 * The world slowly darkens (5 s), rain pours around the player and far
 * lightning flickers; when the storm is over it clears up again. Everybody
 * within reach of the caster sees it.
 * «Let it rain» calls a real thunderstorm: dark clouds, the hiss of the rain,
 * drops splashing on the ground, far lightning (Thor's hammer catches it too) —
 * over the whole world, for 2 game hours (2 minutes).
 */

import * as THREE from 'three';

const DROPS = 700;
const BOX = { x: 44, y: 30, z: 44 };
/** «Let it rain»: 2 game hours (a game day is 24 minutes: an hour is a minute). */
export const RAIN_SECONDS = 120;
/** «Let it rain» needs the hand / wand pointed up to the sky: at least ~45° above the horizon. */
export const SKY_AIM = 0.7;
export function aimedAtSky(dir) {
    return !!dir && dir.y >= SKY_AIM;
}

const _p = new THREE.Vector3();
const _vel = new THREE.Vector3();

export class Storm {
    constructor(game) {
        this.game = game;
        this.k = 0;
        this.until = 0; // a thunderstorm (with lightning) until then
        this.rainUntil = 0; // «Let it rain» (a thunderstorm too, the whole world) until then
        this._flashT = 0;
        this._splashT = 0;
        const pos = new Float32Array(DROPS * 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false }));
        this.rain.frustumCulled = false;
        this.rain.visible = false;
        this.drops = [];
        for (let i = 0; i < DROPS; i++) this.drops.push({ x: (Math.random() - 0.5) * BOX.x, y: Math.random() * BOX.y, z: (Math.random() - 0.5) * BOX.z, v: 26 + Math.random() * 10 });
        game.scene.add(this.rain);
    }

    get active() {
        return this.k > 0.01 || this.raining;
    }

    /** It rains (a thunderstorm or «Let it rain»). */
    get raining() {
        const now = performance.now();
        return now < this.until || now < this.rainUntil;
    }

    /** A thunderstorm (lightning): «Lightning Strike», the weather or «Let it rain». */
    get thunder() {
        return this.raining;
    }

    /** «Let it rain»: rain everywhere for `seconds` (default 2 game hours). */
    startRain(seconds = RAIN_SECONDS) {
        this.rainUntil = Math.max(this.rainUntil, performance.now() + seconds * 1000);
    }

    /** The rain still to come (s), for a player who joins. */
    rainLeft() {
        return Math.max(0, Math.round((this.rainUntil - performance.now()) / 1000));
    }

    /** «To the Sun»: the clouds part, the rain and the storm stop. */
    clearSky() {
        const now = performance.now();
        this.until = Math.min(this.until, now);
        this.rainUntil = Math.min(this.rainUntil, now);
    }

    /** A storm over `origin` for `seconds` (ignored when far away). */
    start(origin, seconds) {
        const me = this.game.character.group.position;
        if (origin && me.distanceTo(origin) > 110) return;
        this.until = Math.max(this.until, performance.now() + seconds * 1000);
    }

    /** Clears up a little sooner (the lightning has struck). */
    endIn(seconds) {
        this.until = Math.min(this.until, performance.now() + seconds * 1000);
    }

    update(dt) {
        const now = performance.now();
        const want = now < this.until || now < this.rainUntil ? 1 : 0;
        if (want === 0 && this.k <= 0) { if (this._sound) { this._sound = false; this.game.sound?.setRain?.(0); } return; }
        // darkens over ~5 s, clears over ~3 s
        this.k = this.k < want ? Math.min(want, this.k + dt / 5) : Math.max(want, this.k - dt / 3);
        this.game.world.setStorm(this.k);
        // under a roof / deep in a cave no rain falls on you (it is heard, more softly)
        const w = this.game.world;
        const open = 1 - Math.max(w.cave || 0, w.indoor || 0);
        const wet = Math.max(0, Math.min(1, (this.k - 0.1) / 0.5));
        this.game.sound?.setRain?.(wet * (0.35 + 0.65 * open));
        this._sound = wet > 0;
        // Rain around the camera
        const cam = this.game.camera.position;
        const on = this.k > 0.15 && open > 0.05;
        this.rain.visible = on;
        if (on) {
            this.rain.material.opacity = Math.min(0.55, (this.k - 0.15) * 0.8) * open;
            const a = this.rain.geometry.attributes.position.array;
            const slant = 0.12;
            for (let i = 0; i < DROPS; i++) {
                const d = this.drops[i];
                d.y -= d.v * dt;
                if (d.y < -4) { d.y += BOX.y; d.x = (Math.random() - 0.5) * BOX.x; d.z = (Math.random() - 0.5) * BOX.z; }
                const x = cam.x + d.x, y = cam.y + d.y - 6, z = cam.z + d.z;
                a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z;
                a[i * 6 + 3] = x + slant; a[i * 6 + 4] = y + 0.9; a[i * 6 + 5] = z;
            }
            this.rain.geometry.attributes.position.needsUpdate = true;
            // drops splash on the ground around the player
            this._splashT += dt * 60 * wet * open;
            const fx = this.game.fx;
            while (this._splashT >= 1 && fx) {
                this._splashT -= 1;
                const x = cam.x + (Math.random() - 0.5) * 24, z = cam.z + (Math.random() - 0.5) * 24;
                const gy = w.groundY?.(x, z);
                if (gy == null || !isFinite(gy) || Math.abs(gy - cam.y) > 14) continue;
                _p.set(x, gy + 0.03, z);
                for (let j = 0; j < 2; j++) {
                    _vel.set((Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
                    fx.spark(_p, 0xc8d6e6, 0.05, _vel, 0.22);
                }
            }
        }
        // Far lightning now and then
        if (this.k > 0.7 && this.thunder) {
            this._flashT -= dt;
            if (this._flashT <= 0) {
                this._flashT = 1.2 + Math.random() * 2.5;
                const p = new THREE.Vector3(cam.x + (Math.random() - 0.5) * 120, cam.y + 40, cam.z + (Math.random() - 0.5) * 120);
                this.game.fx.lightFlash(p, 0xcfe0ff, 4, 0.18, 200);
                if (this.game.sound && Math.random() < 0.6) setTimeout(() => this.game.sound?.playThunder?.(), 400 + Math.random() * 900);
            }
        }
    }
}
