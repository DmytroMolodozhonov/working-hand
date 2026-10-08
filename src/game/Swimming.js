/**
 * Swimming.js — deep water, air and «Air Bubble».
 *
 * Shallow water is walked through. Where the water is deeper than the hero's
 * chest you swim: move your LEGS (march / kick in place — the knees going up
 * and down, or running in place) and you float with the head above the
 * water; stop, and you slowly sink to the bottom. Walking / running in place
 * still moves you forward, at half speed.
 *
 * With the head under water the air runs out: 20 seconds, then −1 HP every
 * second until you come up (or die). Air comes back quickly above water.
 *
 * «Air Bubble» (in the water, both hands raised to the head): a bubble of air
 * around the head — you breathe in it for 30 s. «Air Bubble Maxima» (in the
 * water, arms out like a T): a big bubble around the whole body for 90 s.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';

export const AIR_MAX = 20;
const SWIM_DEPTH = 3.2; // water this deep (blocks) lifts you off your feet
const EYES = 2.1; // eyes above the body's origin
const FEET = 1.95;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Swimming {
    constructor(game) {
        this.game = game;
        this.air = AIR_MAX;
        this.swimming = false;
        this.underwater = false;
        this.kick = 0; // 0…1: how hard the legs are moving
        this._knees = { left: false, right: false };
        this._drownT = 0;
        this.bubble = null; // {until, max, mesh}
        this._buildHud();
    }

    /** The water surface (y) and the bottom under (x, z), or null on dry land. */
    waterAt(x, z) {
        const data = this.game.terrain?.data;
        if (!data) return null;
        const ix = Math.round(x), iz = Math.round(z);
        const top = data.topLayer(ix, iz); // highest solid block
        let L = top + 1, n = 0;
        while (n < 12 && data.get(ix, L, iz) === BLOCK.WATER) { L++; n++; }
        if (!n) return null;
        // a layer L spans y from L-1.5 to L-0.5
        return { surface: L - 1.5, bottom: top - 0.5, depth: n };
    }

    update(dt) {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const w = g.flight?.active ? null : this.waterAt(p.x, p.z);
        const pose = g.currentPose;

        // Legs: every knee that goes up (or running in place) is a kick
        if (pose) {
            for (const side of ['left', 'right']) {
                const up = !!pose[side + 'KneeUp'];
                if (up && !this._knees[side]) this.kick = Math.min(1, this.kick + 0.55);
                this._knees[side] = up;
            }
            if (pose.isRunning) this.kick = Math.min(1, this.kick + dt * 2.5);
        }
        this.kick = Math.max(0, this.kick - dt * 0.9);

        this.swimming = !!w && w.depth >= SWIM_DEPTH && p.y - FEET < w.surface;
        if (this.swimming) {
            // floating: the head out of the water; sinking: down to the bottom
            const floatY = w.surface - EYES + 0.55;
            const bottomY = w.bottom + 0.5 + FEET - 0.05;
            const k = this.kick;
            const vy = k > 0.15 ? 2.2 * k : -1.1;
            const y = Math.max(bottomY, Math.min(floatY, p.y + vy * dt));
            ch.swimY = y;
            ch.speedScale = 0.5;
            ch.swimming = true;
        } else {
            ch.swimY = null;
            ch.speedScale = 1;
            ch.swimming = false;
        }

        // Air
        this.underwater = !!w && p.y + EYES < w.surface - 0.05;
        const now = performance.now();
        if (this.bubble && now > this.bubble.until) this._popBubble();
        if (this.underwater && !this.bubble) {
            this.air = Math.max(0, this.air - dt);
            if (this.air <= 0) {
                this._drownT += dt;
                if (this._drownT >= 1) {
                    this._drownT -= 1;
                    if (g.config.mode !== 'creative') {
                        g.hud.setVoice?.('🫧 Нет воздуха! Всплывайте — двигайте ногами!', true);
                        g.damageLocalPlayer(1);
                    }
                }
            }
        } else {
            this.air = Math.min(AIR_MAX, this.air + dt * (this.bubble ? 8 : 5));
            this._drownT = 0;
        }
        if (this.bubble) this._updateBubble(dt);
        this._renderHud();
    }

    // ---------------------------------------------------------- Air Bubble
    /** Returns a hint (string) if it can't be cast now, or null when cast. */
    castBubble(maxima) {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const w = this.waterAt(p.x, p.z);
        if (!w || p.y - FEET > w.surface) return '🫧 «Air Bubble» работает только в воде';
        if (maxima) {
            if (!ch.isTPose()) return '🫧 Для «Air Bubble Максима» разведите руки в стороны, как буква T';
        } else {
            const head = ch.head.getWorldPosition(_v);
            const l = ch.getHandWorldPosition('left', _v2).distanceTo(head);
            const r = ch.getHandWorldPosition('right', new THREE.Vector3()).distanceTo(head);
            if (l > 1.3 || r > 1.3) return '🫧 Для «Air Bubble» поднесите обе руки к голове';
        }
        this._popBubble();
        const radius = maxima ? 2.6 : 1.15;
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 24, 16),
            new THREE.MeshPhongMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide }),
        );
        g.scene.add(mesh);
        this.bubble = { until: performance.now() + (maxima ? 90000 : 30000), max: maxima, mesh, t: 0 };
        this.air = AIR_MAX;
        for (let i = 0; i < 30; i++) g.fx.spark(ch.head.getWorldPosition(_v), 0xe8fbff, 0.12, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.8);
        g.hud.setVoice?.(maxima ? '🫧 Большой воздушный пузырь — 90 секунд' : '🫧 Воздушный пузырь — 30 секунд', true);
        return null;
    }

    _updateBubble(dt) {
        const b = this.bubble;
        const ch = this.game.character;
        b.t += dt;
        const at = b.max ? ch.group.position : ch.head.getWorldPosition(_v);
        b.mesh.position.copy(at);
        if (b.max) b.mesh.position.y += 0.4;
        const s = 1 + Math.sin(b.t * 3) * 0.03;
        b.mesh.scale.setScalar(Math.min(1, b.t * 4) * s);
        const left = (b.until - performance.now()) / 1000;
        b.mesh.material.opacity = left < 5 ? 0.22 * Math.max(0.2, left / 5) * (0.6 + 0.4 * Math.sin(b.t * 12)) : 0.22;
        if (Math.random() < dt * 4) this.game.fx.spark(b.mesh.position.clone().add(_v2.set((Math.random() - 0.5), 0.6, (Math.random() - 0.5))), 0xe8fbff, 0.06, _v2.set(0, 1.5, 0), 1);
    }

    _popBubble() {
        const b = this.bubble;
        if (!b) return;
        this.game.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bubble = null;
    }

    // ------------------------------------------------------------------- HUD
    _buildHud() {
        if (typeof document === 'undefined') return;
        let el = document.getElementById('air-bar');
        if (!el) {
            el = document.createElement('div');
            el.id = 'air-bar';
            document.body.appendChild(el);
        }
        this.hudEl = el;
        this.overlay = document.getElementById('underwater-overlay');
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'underwater-overlay';
            document.body.appendChild(this.overlay);
        }
    }

    _renderHud() {
        if (!this.hudEl) return;
        const show = this.underwater || this.air < AIR_MAX - 0.05;
        this.hudEl.style.display = show ? 'flex' : 'none';
        if (show) {
            const n = Math.ceil(this.air / 2); // 10 bubbles
            const key = n + (this.bubble ? 'b' : '');
            if (key !== this._lastKey) {
                this._lastKey = key;
                this.hudEl.innerHTML = (this.bubble ? '<span class="air-txt">🫧 пузырь</span>' : '') + Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
            }
        }
        this.overlay.style.opacity = this.underwater ? (this.bubble ? '0.35' : '0.6') : '0';
    }

    dispose() {
        this._popBubble();
        if (this.hudEl) this.hudEl.style.display = 'none';
        if (this.overlay) this.overlay.style.opacity = '0';
        const ch = this.game.character;
        if (ch) { ch.swimY = null; ch.speedScale = 1; ch.swimming = false; }
    }
}
