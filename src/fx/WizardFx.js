/**
 * WizardFx.js — what the wizards' small magic looks like (on every computer).
 *
 * The host decides what a wizard does and sends it as bits (`v.fx`, in the
 * villagers' network list); here every computer draws it from the wizard's own
 * wand tip: Lumos (a glow at the tip), Leviosa (a book / an apple / a feather
 * floating before the wand — or rising a little and dropping: a failed try),
 * sparks at a training dummy, a trail drawn in the air, bubbling potions, a
 * shield of light, the Master's dome, the smoke of a blink. Nothing here hits
 * anything or goes over the network: it is only seen.
 *
 * Everything is made at the start (pools), so nothing compiles a shader mid-game.
 */

import * as THREE from 'three';
import { makeBookModel } from '../game/BookBirds.js';
import { makeItemModel } from '../game/ItemTypes.js';

export const FX = { LUMOS: 1, SHIELD: 2, DOME: 4, LEV: 8, SPARK: 16, DRAW: 32, CAST: 64, BLINK: 128, OFFER: 256, BREW: 512, LEVFAIL: 1024 };
const NEAR = 40; // m: farther wizards' small magic is not drawn
const PROPS = 6;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

function glowTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(220,240,255,0.8)'); g.addColorStop(1, 'rgba(160,200,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

export class WizardFx {
    constructor(game) {
        this.game = game;
        const scene = game.scene;
        this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdff2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        this.glows = [];
        // floating things for Leviosa practice (made now: prewarm compiles them)
        this.props = [];
        for (let i = 0; i < PROPS; i++) {
            let m;
            if (i % 3 === 0) m = makeBookModel(i ? 0x2b5f8e : 0x8e2b2b);
            else if (i % 3 === 1) m = makeItemModel({ kind: 'apple' });
            else {
                // a feather
                m = new THREE.Group();
                const mat = new THREE.MeshLambertMaterial({ color: 0xf4f0e6 });
                const vane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.02), mat);
                vane.rotation.z = 0.3;
                m.add(vane);
            }
            m.visible = false;
            m.userData.wizProp = true;
            scene.add(m);
            this.props.push({ model: m, by: null });
        }
        // shields of light and the Master's dome (pooled)
        this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        this.shieldGeo = new THREE.CircleGeometry(1.4, 24);
        this.domeMat = new THREE.MeshBasicMaterial({ color: 0xc58bff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        this.domeGeo = new THREE.SphereGeometry(3.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
        this.shields = [];
        this.domes = [];
        for (let i = 0; i < 2; i++) { this._shield(); this._dome(); this._glow(); }
        this._t = 0;
    }

    _glow() {
        const s = new THREE.Sprite(this.glowMat);
        s.scale.setScalar(1.1);
        s.visible = false;
        this.game.scene.add(s);
        this.glows.push(s);
        return s;
    }

    _shield() {
        const m = new THREE.Mesh(this.shieldGeo, this.shieldMat);
        m.visible = false;
        this.game.scene.add(m);
        this.shields.push(m);
        return m;
    }

    _dome() {
        const m = new THREE.Mesh(this.domeGeo, this.domeMat);
        m.visible = false;
        this.game.scene.add(m);
        this.domes.push(m);
        return m;
    }

    /** A puff of violet smoke (a blink: the Master vanishes here and appears there). */
    smoke(p) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < 26; i++) fx.spark(_v.set(p.x + (Math.random() - 0.5) * 1.5, p.y + 0.5 + Math.random() * 4, p.z + (Math.random() - 0.5) * 1.5), i % 2 ? 0xc58bff : 0x6a2c91, 0.25 + Math.random() * 0.2, _d.set((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2), 0.9);
    }

    /** Every frame: the magic of the wizards near me. */
    update(dt, wizards, dummiesOf) {
        this._t += dt;
        const t = this._t;
        const me = this.game.character?.group.position;
        if (!me) return;
        let gi = 0, si = 0, di = 0;
        for (const p of this.props) p.used = false;
        const fx = this.game.fx;
        for (const v of wizards) {
            const f = v.fx | 0;
            if (!f || v.dead || !v.group.visible) continue;
            if (Math.hypot(v.x - me.x, v.z - me.z) > NEAR) continue;
            const m = v.model;
            const tip = m.getWandTip(_v);
            const dir = m.getWandDir(_d);
            if (f & FX.LUMOS) {
                const s = this.glows[gi] || this._glow();
                gi++;
                s.position.copy(tip);
                s.scale.setScalar(1.0 + Math.sin(t * 9 + v.x) * 0.08);
                s.visible = true;
                if (fx && Math.random() < dt * 4) fx.spark(tip, 0xeaf6ff, 0.08, _w.set((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)), 0.4);
            }
            if (f & (FX.LEV | FX.LEVFAIL)) {
                let p = this.props.find((q) => q.by === v.id && !q.used) || this.props.find((q) => !q.used && (!q.by || !wizards.some((o) => o.id === q.by && ((o.fx | 0) & (FX.LEV | FX.LEVFAIL)))));
                if (p) {
                    if (p.by !== v.id) { p.by = v.id; p.t0 = t; }
                    p.used = true;
                    const age = t - p.t0;
                    // in front of the wand, a little above it, swaying
                    _w.copy(tip).addScaledVector(dir, 2.2);
                    if (f & FX.LEVFAIL) {
                        // it rises a bit, wobbles — and drops
                        const up = age < 0.8 ? age / 0.8 * 0.5 : Math.max(-1.6, 0.5 - (age - 1.4) * (age - 1.4) * 4 * (age > 1.4 ? 1 : 0));
                        _w.y += up + (age < 1.4 ? Math.sin(age * 25) * 0.08 : 0);
                    } else _w.y += 0.6 + 0.25 * Math.sin(t * 2 + v.x);
                    p.model.position.copy(_w);
                    p.model.rotation.set(Math.sin(t * 1.3) * 0.3, t * 0.8, Math.sin(t * 1.7) * 0.2);
                    p.model.visible = true;
                    if (fx && Math.random() < dt * 6) fx.spark(_w, 0xffd36e, 0.07, _u.set((Math.random() - 0.5) * 0.5, -0.3, (Math.random() - 0.5) * 0.5), 0.5);
                }
            }
            if (f & FX.SPARK) {
                // practice at a training dummy: crackling sparks from the wand
                const dm = dummiesOf?.(v);
                const to = dm ? _w.set(dm.x, dm.top - 1.5, dm.z) : _w.copy(tip).addScaledVector(dir, 4);
                this.game.duel?._drawBolt?.('Stupefy', tip, to, v.id);
            }
            if (f & FX.DRAW && fx) {
                // a glowing line drawn in the air
                for (let k = 0; k < 2; k++) fx.spark(tip, 0x9ff3ff, 0.09, _w.set(0, 0.05, 0), 0.9);
            }
            if (f & FX.BREW && fx && Math.random() < dt * 10) {
                _w.copy(tip).addScaledVector(dir, 1.2);
                _w.y -= 1.8;
                fx.spark(_w, Math.random() < 0.5 ? 0x5dff8a : 0xb6ffcb, 0.12, _u.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4), 0.8);
            }
            if (f & FX.SHIELD) {
                const s = this.shields[si] || this._shield();
                si++;
                const yaw = v.yaw;
                s.position.set(v.x - Math.sin(yaw) * 1.3, v.y + 2.6, v.z - Math.cos(yaw) * 1.3);
                s.rotation.set(0, yaw, 0);
                s.material.opacity = 0.3 + 0.08 * Math.sin(t * 12);
                s.visible = true;
            }
            if (f & FX.DOME) {
                const dmh = this.domes[di] || this._dome();
                di++;
                dmh.position.set(v.x, v.y - 0.2, v.z);
                dmh.scale.setScalar(1 + 0.03 * Math.sin(t * 6));
                dmh.visible = true;
            }
        }
        for (let i = gi; i < this.glows.length; i++) this.glows[i].visible = false;
        for (let i = si; i < this.shields.length; i++) this.shields[i].visible = false;
        for (let i = di; i < this.domes.length; i++) this.domes[i].visible = false;
        for (const p of this.props) if (!p.used) { p.model.visible = false; p.by = null; }
    }
}
