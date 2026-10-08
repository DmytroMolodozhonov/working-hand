/**
 * Storm.js — the weather of «Lightning Strike».
 *
 * The world slowly darkens (5 s), rain pours around the player and far
 * lightning flickers; when the storm is over it clears up again. Everybody
 * within reach of the caster sees it.
 */

import * as THREE from 'three';

const DROPS = 700;
const BOX = { x: 44, y: 30, z: 44 };

export class Storm {
    constructor(game) {
        this.game = game;
        this.k = 0;
        this.until = 0;
        this._flashT = 0;
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
        return this.k > 0.01 || performance.now() < this.until;
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
        const want = performance.now() < this.until ? 1 : 0;
        if (want === 0 && this.k <= 0) return;
        // darkens over ~5 s, clears over ~3 s
        this.k = want ? Math.min(1, this.k + dt / 5) : Math.max(0, this.k - dt / 3);
        this.game.world.setStorm(this.k);
        // Rain around the camera
        const cam = this.game.camera.position;
        const on = this.k > 0.15;
        this.rain.visible = on;
        if (on) {
            this.rain.material.opacity = Math.min(0.55, (this.k - 0.15) * 0.8);
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
        }
        // Far lightning now and then
        if (this.k > 0.7) {
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
