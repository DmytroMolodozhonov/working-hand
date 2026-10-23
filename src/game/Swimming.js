/**
 * Swimming.js — deep water, air and «Air Bubble».
 *
 * Shallow water is walked through. Where the water is deeper than the hero's
 * chest you swim — with your ARMS, for real (SwimStroke.js reads the strokes):
 *
 *   On top of the water: the crawl (one arm reaches forward / up and pulls down
 *   to the hip) or the breaststroke (the hands together in front, then both out
 *   wide). Each stroke pushes you forward where you face; the body lies flat in
 *   the water, the legs kick, the hands splash. No strokes: you tread water,
 *   the head above it, and slowly stop.
 *   Diving: look down and stroke. Under the water the breaststroke and the
 *   dolphin pull (both arms down together) push you along where you look (look
 *   down — deeper, up — towards the light); a lone crawl arm does little there.
 *   Without strokes the body slowly floats up; at the top you swim on it again.
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
import { StrokeDetector, SwimMotion, SWIM } from './SwimStroke.js';

export const AIR_MAX = 20;
const SWIM_DEPTH = 3.2; // water this deep (blocks) lifts you off your feet
const EYES = 2.1; // eyes above the body's origin
const FEET = 1.95;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _fogDeep = new THREE.Color(0x0b4f74);

export class Swimming {
    constructor(game) {
        this.game = game;
        this.air = AIR_MAX;
        this.swimming = false;
        this.underwater = false;
        this.strokes = new StrokeDetector(); // the player's real arm strokes
        this.motion = new SwimMotion(); // the body's way through the water
        this.y = null; // where the water holds the body (its origin, the hips)
        this.atTop = true; // on top of the water (false: dived under)
        this._tilted = false; // the body's tilt is mine (lying in the water)
        this._handUp = { left: null, right: null }; // each hand above the water? (a hand going in / out splashes)
        this._bubbleT = 0;
        this.ripples = [];
        this._drownT = 0;
        this.bubble = null; // {until, max, mesh}
        this._buildHud();
    }

    /** The water surface (y) and the bottom under (x, z), or null on dry land. */
    waterAt(x, z, y = null) {
        const data = this.game.terrain?.data;
        if (!data) return null;
        const ix = Math.round(x), iz = Math.round(z);
        let top = data.topLayer(ix, iz); // highest solid block
        let L = top + 1, n = 0;
        while (n < 24 && data.get(ix, L, iz) === BLOCK.WATER) { L++; n++; }
        // under a roof over the water (a pier's deck, a bridge): the water the body is in
        if (!n && y != null) {
            let l = Math.floor(y + 1.5);
            if (data.get(ix, l, iz) !== BLOCK.WATER) l--;
            if (data.get(ix, l, iz) === BLOCK.WATER) {
                let b = l;
                while (b > l - 24 && data.get(ix, b - 1, iz) === BLOCK.WATER) b--;
                top = b - 1;
                L = l;
                while (L < l + 24 && data.get(ix, L, iz) === BLOCK.WATER) L++;
                n = L - b;
            }
        }
        if (!n) return null;
        // a layer L spans y from L-1.5 to L-0.5
        const sea = L === 1 && !!data.isSeaColumn?.(ix, iz);
        // the sea moves: its surface rises and falls with the waves (src/world/Sea.js)
        const wave = sea && this.game.sea ? this.game.sea.height(x, z) : 0;
        return { surface: L - 1.5 + wave, bottom: top - 0.5, depth: n, sea, wave };
    }

    update(dt) {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const S = ch.size || 1; // (the monster form ×7 — MonsterForm.js: deep water comes up to its belt, it wades on)
        const w0 = g.flight?.active ? null : this.waterAt(p.x, p.z, p.y - FEET * S + 0.3);
        const w = w0 && g.ships?.dryAt(p.x, p.y - FEET * S + 0.2, p.z) ? null : w0; // (inside a floating hull it is dry)
        const pose = g.combat?.immobile ? null : g.currentPose; // (frozen in ice: the arms can't swim)

        // on a surfboard: the board holds you up (SurfBoards places the body)
        if (g.boards?.mounted) { this.swimming = false; this.underwater = false; this._leave(dt); this.air = Math.min(AIR_MAX, this.air + dt * 5); this._renderHud(); return; }
        this.swimming = !!w && w.depth >= SWIM_DEPTH * S && p.y - FEET * S < w.surface && !g.up?.rising && !g.levitation?.lifted && !g.ledge?.active; // («Up»: thrown up out of it; «Левиоса»: the caster's hand lifts me out of the water; the palms on the bank: the arms pull me out — LedgeClimb)
        if (this.swimming) this._swim(dt, w, pose);
        else this._leave(dt);
        this._updateRipples(dt);

        // Air (the eyes: lower when the body lies in the water)
        this.underwater = !!w && p.y + EYES * S * Math.cos(this._tilted ? this.motion.tilt : 0) < w.surface - 0.05;
        const now = performance.now();
        if (this.bubble && now > this.bubble.until) this._popBubble();
        if (this.underwater && !this.bubble) {
            this.air = Math.max(0, this.air - dt);
            if (this.air <= 0) {
                this._drownT += dt;
                if (this._drownT >= 1) {
                    this._drownT -= 1;
                    if (g.config.mode !== 'creative') {
                        g.hud.setVoice?.('🫧 Нет воздуха! Всплывайте — посмотрите вверх и гребите руками!', true);
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

    /** In deep water: the arms' strokes move the body (SwimStroke.js); the water holds it. */
    _swim(dt, w, pose) {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const M = this.motion;
        const S = ch.size || 1;
        const bottomY = w.bottom + 0.5 + FEET * S - 0.05;
        // afloat, the eyes stay just above the water: the flatter the body lies, the lower its hips
        const floatY = w.surface + 0.4 - EYES * S * Math.cos(M.tilt);
        if (this.y == null) {
            // just came into the deep water: floating where the body is (it sinks no further)
            this.y = Math.min(p.y, floatY);
            this.atTop = this.y > floatY - 0.6;
            this.strokes.reset();
            if (!this._told) { this._told = true; g.hud.setVoice?.('🏊 Глубоко — плывите руками: кроль (рука вперёд-вверх и вниз к бедру) или брасс (ладони вместе, потом в стороны). Посмотрите вниз и гребите — нырнёте', true); }
        }
        const look = g.smoothHead?.pitch || 0; // (+ up)
        const under = !this.atTop;
        for (const ev of this.strokes.update(dt, pose)) {
            M.stroke(ev, { under, look });
            this._strokeFx(ev, w, under);
        }
        const m = M.step(dt, { under, look });
        if (this.atTop) {
            if (m.up < -0.05) this.y += m.up * dt; // diving
            else this.y += (floatY - this.y) * Math.min(1, dt * 4);
            if (this.y < floatY - 0.6) this.atTop = false;
        } else {
            this.y += m.up * dt;
            if (this.y >= floatY) { this.y = floatY; this.atTop = true; M.pitch = 0; } // up at the light: swimming on top again
        }
        this.y = Math.max(bottomY, Math.min(floatY, this.y));
        // afloat at the top of the sea: the body rises and falls with the waves
        if (w.sea && this.atTop && Math.abs(p.y - this.y) < 2) p.y = this.y;
        this.floatY = floatY;
        ch.swimY = this.y;
        ch.speedScale = 0; // (no walking in deep water: the arms swim)
        ch.swimming = true;
        ch.swimMove = Math.min(1, M.speed / 1.5);
        // the strokes push along the body's front (it turns with the head / body, as on land)
        const yaw = ch.group.rotation.y;
        ch.swimVel = { x: -Math.sin(yaw) * m.forward, z: -Math.cos(yaw) * m.forward };
        this._setTilt(m.tilt);
        this._waterFx(dt, w);
    }

    /** Out of the deep water: the body stands up again (smoothly), nothing swims it any more. */
    _leave(dt) {
        const ch = this.game.character;
        ch.swimY = null;
        ch.speedScale = 1;
        ch.swimming = false;
        ch.swimMove = 0;
        ch.swimVel = null;
        if (this.y != null) {
            this.y = null;
            this.atTop = true;
            this.strokes.reset();
            this.motion.speed = 0;
            this.motion.pitch = 0;
        }
        if (!this._tilted) { this.motion.tilt = SWIM.TILT_IDLE; return; }
        const t = this.motion.tilt = Math.max(0, this.motion.tilt - dt * 3);
        this._setTilt(t);
        if (t <= 0) { this._tilted = false; this.motion.tilt = SWIM.TILT_IDLE; }
    }

    /** Lie in the water: the body tilted, the eyes still looking where the player looks. */
    _setTilt(t) {
        const g = this.game, ch = g.character;
        if (g.flight?.busy || g.boards?.mounted || g.ships?.rigging?.climbing) { this._tilted = false; return; } // (the body is theirs)
        this._tilted = true;
        ch.setFlightTilt(t);
        ch.head.rotation.x += t; // (Game set the head's look this frame; the tilt is taken out of it)
    }

    /** Splashes where a hand goes into the water or comes out; bubbles from the mouth under it. */
    _waterFx(dt, w) {
        const g = this.game, ch = g.character, fx = g.fx;
        if (!fx) return;
        for (const side of ['left', 'right']) {
            const h = ch.getHandWorldPosition(side, _v);
            const up = h.y > w.surface;
            const was = this._handUp[side];
            this._handUp[side] = up;
            const vy = ch.handVelocity?.[side]?.y || 0;
            if (was != null && was !== up && Math.abs(vy) > 0.8 && Math.abs(h.y - w.surface) < 1) {
                this._splash(_v2.set(h.x, w.surface, h.z), Math.min(1.5, Math.abs(vy) / 3));
            }
        }
        const M = this.motion;
        // the legs kick behind a body swimming on top: a little foam at the feet
        if (this.atTop && M.speed > 0.6 && Math.random() < dt * 8 * M.speed / 3) {
            const yaw = ch.group.rotation.y;
            _v.set(ch.group.position.x + Math.sin(yaw) * 1.8, w.surface + 0.05, ch.group.position.z + Math.cos(yaw) * 1.8);
            fx.spark(_v, 0xffffff, 0.1 + Math.random() * 0.08, _v2.set((Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5), 0.4);
        }
        // under the water: the breath goes up in bubbles
        if (this.underwater && !this.bubble) {
            this._bubbleT -= dt;
            if (this._bubbleT <= 0) {
                this._bubbleT = 0.9 + Math.random() * 0.8;
                const mouth = ch.getHeadPosition(_v3);
                for (let i = 0; i < 4; i++) fx.spark(_v.copy(mouth).add(_v2.set((Math.random() - 0.5) * 0.15, i * 0.05, (Math.random() - 0.5) * 0.15)), 0xe8fbff, 0.05 + Math.random() * 0.06, _v2.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4), 1.6);
            }
        }
    }

    /** A stroke: the water swirls at the pulling hands (spray on top, bubbles under). */
    _strokeFx(ev, w, under) {
        const g = this.game, ch = g.character, fx = g.fx;
        if (!fx) return;
        const sides = ev.side ? [ev.side] : ['left', 'right'];
        for (const side of sides) {
            const h = ch.getHandWorldPosition(side, _v3);
            if (under) {
                for (let i = 0; i < 6; i++) fx.spark(_v.copy(h).add(_v2.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), 0xe8fbff, 0.04 + Math.random() * 0.05, _v2.set((Math.random() - 0.5) * 0.8, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8), 1.3);
            } else this._splash(_v.set(h.x, w.surface, h.z), 0.6 + 0.4 * (ev.power || 1));
        }
    }

    _splash(at, k = 1) {
        const fx = this.game.fx;
        const n = Math.round(6 + 8 * k);
        for (let i = 0; i < n; i++) {
            fx.spark(at, i % 3 ? 0xffffff : 0x9fd8ff, 0.07 + Math.random() * 0.1 * k, _v2.set((Math.random() - 0.5) * 2.5 * k, 1.5 + Math.random() * 2.5 * k, (Math.random() - 0.5) * 2.5 * k), 0.45 + Math.random() * 0.25);
        }
        this._ripple(at, k);
    }

    /** A ring on the water, running out and fading. */
    _ripple(at, k = 1) {
        if (!this.game.scene) return;
        let r = this.ripples.find((q) => q.t >= q.life);
        if (!r) {
            if (this.ripples.length >= 16) return;
            const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
            mesh.rotation.x = -Math.PI / 2;
            mesh.renderOrder = 2;
            this.game.scene.add(mesh);
            r = { mesh, t: 0, life: 1 };
            this.ripples.push(r);
        }
        r.t = 0;
        r.life = 1 + 0.4 * k;
        r.size = 1.2 + 1.6 * k;
        r.mesh.position.set(at.x, at.y + 0.04, at.z);
        r.mesh.visible = true;
    }

    _updateRipples(dt) {
        for (const r of this.ripples) {
            if (r.t >= r.life) continue;
            r.t += dt;
            const a = Math.min(1, r.t / r.life);
            r.mesh.scale.setScalar(0.2 + r.size * Math.sqrt(a));
            r.mesh.material.opacity = 0.55 * (1 - a);
            if (a >= 1) r.mesh.visible = false;
        }
    }

    /** Under the water the view is murky and blue (after World set this frame's fog). */
    applyFog() {
        const fog = this.game.scene?.fog;
        if (!fog) return;
        if (this.underwater) {
            if (!this._fogSaved || fog.color.getHex() !== this._fogSet) this._fogSaved = fog.color.clone();
            fog.color.copy(this._fogSaved).lerp(_fogDeep, 0.85);
            this._fogSet = fog.color.getHex();
            fog.near = 0.5;
            fog.far = Math.min(fog.far, this.bubble ? 34 : 26);
        } else if (this._fogSaved) {
            if (fog.color.getHex() === this._fogSet) fog.color.copy(this._fogSaved);
            this._fogSaved = null;
        }
    }

    // ---------------------------------------------------------- Air Bubble
    /** Returns a hint (string) if it can't be cast now, or null when cast. */
    castBubble(maxima) {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const w = this.waterAt(p.x, p.z, p.y - FEET + 0.3);
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
        // the blue haze is about where the CAMERA is: a wave passing over it is under water, a trough over it is air
        // (judged at the body, the view and the haze disagreed when the sea's waves rose and fell around the head)
        const eyeUnder = this._cameraUnderwater();
        this.overlay.style.opacity = eyeUnder ? (this.bubble ? '0.35' : '0.6') : '0';
    }

    /** Is the camera itself under the water's top (a wave counted where the camera is)? */
    _cameraUnderwater() {
        const g = this.game, cam = g.camera;
        if (!cam) return this.underwater;
        const p = cam.getWorldPosition(_v);
        const w = this.waterAt(p.x, p.z);
        return !!w && p.y < w.surface - (w.sea ? 0.03 : 0.15) && p.y > w.bottom; // (a lake's top is drawn a little lower)
    }

    dispose() {
        this._popBubble();
        for (const r of this.ripples) { this.game.scene?.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
        this.ripples = [];
        if (this.hudEl) this.hudEl.style.display = 'none';
        if (this.overlay) this.overlay.style.opacity = '0';
        const ch = this.game.character;
        if (ch) { ch.swimY = null; ch.speedScale = 1; ch.swimming = false; ch.swimVel = null; if (this._tilted) ch.setFlightTilt(0); }
    }
}
