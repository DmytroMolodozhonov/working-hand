/**
 * SunBeam.js — «To the Sun»: a golden beam from the raised hand into the sky,
 * the clouds part round it in a widening bright ring, sun rays pour down and
 * the rain dies away. Everybody near sees it (the spell is sent to all).
 *
 * Made once (so the shaders are compiled with the rest), shown for ~6 s.
 */

import * as THREE from 'three';

const DUR = 6.5;
const SKY = 70; // m above the hand: where the clouds open

export class SunBeam {
    constructor(game) {
        this.game = game;
        this.t = -1;
        const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        this.group = new THREE.Group();
        this.group.visible = false;
        // the beam (wide glow + bright core), its bottom at the hand
        this.glowMat = add(0xffc94a, 0);
        this.coreMat = add(0xfff4c8, 0);
        const beam = new THREE.CylinderGeometry(2.2, 0.9, SKY, 20, 1, true);
        beam.translate(0, SKY / 2, 0);
        const core = new THREE.CylinderGeometry(0.7, 0.3, SKY, 12, 1, true);
        core.translate(0, SKY / 2, 0);
        this.beam = new THREE.Mesh(beam, this.glowMat);
        this.core = new THREE.Mesh(core, this.coreMat);
        this.group.add(this.beam, this.core);
        // the opening in the clouds: a bright widening ring and the sun's disc
        this.ringMat = add(0xffe08a, 0);
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 48), this.ringMat);
        this.ring.rotation.x = Math.PI / 2;
        this.ring.position.y = SKY;
        this.discMat = add(0xfff1b8, 0);
        this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.discMat);
        this.disc.rotation.x = Math.PI / 2;
        this.disc.position.y = SKY + 0.5;
        this.group.add(this.ring, this.disc);
        // sun rays slanting down out of the opening
        this.rayMat = add(0xffd36b, 0);
        const rayGeo = new THREE.PlaneGeometry(3, SKY * 1.1);
        rayGeo.translate(0, -SKY * 0.55, 0);
        this.rays = [];
        for (let i = 0; i < 10; i++) {
            const r = new THREE.Mesh(rayGeo, this.rayMat);
            const a = (i / 10) * Math.PI * 2;
            r.position.set(Math.cos(a) * 12, SKY, Math.sin(a) * 12);
            r.rotation.set(0, -a, 0);
            r.rotateX(0.18);
            this.rays.push(r);
            this.group.add(r);
        }
        game.scene.add(this.group);
    }

    /** The spell at `origin` (the hand). */
    cast(origin) {
        const g = this.game;
        this.t = 0;
        this.group.position.copy(origin);
        this.group.visible = true;
        // the rain stops (the clouds part); the storm clears over ~3 s
        if (g.storm) { g.storm.until = Math.min(g.storm.until, performance.now()); }
        g.fx?.lightFlash?.(origin, 0xffe08a, 6, 0.6, 60);
        g.sound?.playMagic?.();
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            g.fx?.spark(origin, i % 2 ? 0xffe08a : 0xffffff, 0.12, new THREE.Vector3(Math.cos(a) * 2, 4 + Math.random() * 6, Math.sin(a) * 2), 1.2);
        }
    }

    update(dt) {
        if (this.t < 0) return;
        this.t += dt;
        const t = this.t;
        if (t > DUR) { this.t = -1; this.group.visible = false; return; }
        const fadeOut = t > DUR - 1.5 ? (DUR - t) / 1.5 : 1;
        // the beam shoots up in 0.6 s
        const up = Math.min(1, t / 0.6);
        this.beam.scale.set(1 + Math.sin(t * 9) * 0.06, up, 1 + Math.sin(t * 9) * 0.06);
        this.core.scale.set(1, up, 1);
        this.glowMat.opacity = 0.45 * fadeOut;
        this.coreMat.opacity = 0.9 * fadeOut;
        // the clouds open: a ring widening to ~60 m, the sun's disc behind it
        const open = Math.max(0, Math.min(1, (t - 0.5) / 2.5));
        const R = 4 + open * 60;
        this.ring.scale.setScalar(R);
        this.ringMat.opacity = 0.75 * open * fadeOut;
        this.disc.scale.setScalar(4 + open * 14);
        this.discMat.opacity = 0.8 * open * fadeOut;
        // sun rays pour down from the opening
        const rays = Math.max(0, Math.min(1, (t - 1.2) / 1.5));
        this.rayMat.opacity = 0.22 * rays * fadeOut;
        this.rays.forEach((r, i) => {
            const a = (i / 10) * Math.PI * 2 + t * 0.15;
            r.position.set(Math.cos(a) * R * 0.5, SKY, Math.sin(a) * R * 0.5);
            r.rotation.set(0, -a, 0);
            r.rotateX(0.2);
        });
        // sparkles round the caster
        if (Math.random() < dt * 25) {
            const p = this.group.position;
            const a = Math.random() * Math.PI * 2, d = Math.random() * 3;
            this.game.fx?.spark(new THREE.Vector3(p.x + Math.cos(a) * d, p.y + Math.random() * 6, p.z + Math.sin(a) * d), 0xffe08a, 0.1, new THREE.Vector3(0, 3, 0), 1);
        }
    }

    dispose() {
        this.game.scene.remove(this.group);
    }
}
