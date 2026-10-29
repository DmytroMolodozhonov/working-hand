/**
 * SunBeam.js — «To the Sun»: a golden beam from the raised hand into the sky,
 * the clouds part round it in a widening bright ring, sun rays pour down and
 * the rain dies away. Everybody near sees it (the spell is sent to all).
 *
 * Made once (so the shaders are compiled with the rest), shown for ~6 s.
 *
 * The beam FOLLOWS the wand (the author: it used to stand where it was cast while the caster walked on): every frame it takes the
 * caster's wand tip and direction again — mine from `castingHand`, another player's from `game.handPose`. Against the black clouds of
 * the gargoyle ritual (SunContest.js) it is held and fights: it reaches up to the cloud deck, burns a ragged golden hole in it and
 * the clouds press back; `fight(len, stress)` is that, kept alive by the caster's messages.
 */

import * as THREE from 'three';
import { castingHand } from '../game/WandAim.js';

const DUR = 6.5;
const SKY = 70; // m above the hand: where the clouds open (the column's own length; `len` stretches it up to the cloud deck)
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

export class SunBeam {
    constructor(game) {
        this.game = game;
        this.t = -1;
        this.follow = null; // {by, side}: whose wand it follows
        this.len = SKY; // m: how long the beam is now
        this.fightAt = 0; // performance.now() of the last «it fights the clouds» message (it stays on while they keep coming)
        this.fightK = 0; // how hard the clouds press back (0…1)
        const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        this.group = new THREE.Group();
        this.group.visible = false;
        // ONE column of light from the hand: soft layers of the same straight shape, one inside the
        // other (bright in the middle, fading to the edge), so it reads as a single beam, not two
        this.glowMat = add(0xffc94a, 0);
        this.coreMat = add(0xfff4c8, 0);
        const column = (r) => { const g = new THREE.CylinderGeometry(r, r, SKY, 20, 1, true); g.translate(0, SKY / 2, 0); return g; };
        this.layers = Array.from({ length: 10 }, (_, i) => ({ mesh: new THREE.Mesh(column(1.8 - i * 0.16), i < 5 ? this.glowMat : this.coreMat) }));
        this.layers.forEach((l) => this.group.add(l.mesh));
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

    /** The spell at `origin` (the hand); `by`/`side`: whose wand it follows from now on (none: it stands where it was cast). */
    cast(origin, by = null, side = null) {
        const g = this.game;
        this.t = 0;
        this.len = SKY;
        this.fightAt = 0;
        this.follow = by && side ? { by, side } : null;
        this.group.position.copy(origin);
        this.group.quaternion.identity();
        this.group.visible = true;
        // cast on a ship's deck: the beam stays on the deck as the ship sails on
        g.ships?.pin(this.group, () => this.t >= 0 && this.group.visible);
        // the rain stops (the clouds part); the storm clears over ~3 s
        if (g.storm) g.storm.clearSky();
        g.fx?.lightFlash?.(origin, 0xffe08a, 6, 0.6, 60);
        g.sound?.playMagic?.();
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            g.fx?.spark(origin, i % 2 ? 0xffe08a : 0xffffff, 0.12, new THREE.Vector3(Math.cos(a) * 2, 4 + Math.random() * 6, Math.sin(a) * 2), 1.2);
        }
    }

    /** Is the beam held on the clouds of the ritual now (the caster's messages come)? */
    get fighting() { return this.t >= 0 && performance.now() - this.fightAt < 700; }

    /** The beam fights the clouds: it is `len` m long (up to the deck), they press back with `stress` 0…1. Called by the caster's computer and by its messages. */
    fight(len, stress) {
        this.fightAt = performance.now();
        this.fightK = stress;
        this.len = Math.max(8, Math.min(260, len));
        if (this.t < 0) { this.t = 1.2; this.group.visible = true; }
    }

    /** The wand moved: the beam goes with it (a tip and a direction; the direction is kept in the upper half of the sky). */
    _followWand() {
        const g = this.game, f = this.follow;
        if (!f) return;
        let o = null, d = null;
        if (f.by === g.localId || f.by === 'local') {
            const h = castingHand(g);
            if (h) { o = h.origin; d = h.dir; }
        } else {
            const h = g.handPose?.(f.by, f.side);
            if (h) { o = h.origin; d = h.dir; }
        }
        if (!o || !d) return;
        _p.copy(o); _d.copy(d).normalize();
        if (_d.y < 0.05) _d.y = 0.05; // (a beam into the ground makes no sense: the lowest it goes is the horizon)
        _d.normalize();
        this.group.position.lerp(_p, 0.85);
        _q.setFromUnitVectors(UP, _d);
        this.group.quaternion.slerp(_q, 0.5);
    }

    update(dt) {
        if (this.t < 0) return;
        this.t += dt;
        this._followWand();
        const fight = this.fighting;
        if (fight) this.t = Math.min(this.t, DUR - 1.6); // (held on the clouds: it does not fade while the struggle goes on)
        else if (this.fightAt) { this.fightAt = 0; this.len = SKY; this.t = Math.min(this.t, 3.2); this.fightK = 0; } // (the struggle is over: the beam opens up and fades as it always does)
        const t = this.t;
        if (t > DUR) { this.t = -1; this.group.visible = false; this.follow = null; return; }
        const fadeOut = t > DUR - 1.5 ? (DUR - t) / 1.5 : 1;
        // the beam shoots up in 0.6 s
        const up = Math.min(1, t / 0.6) * (this.len / SKY);
        const w = 1 + Math.sin(t * 9) * 0.05;
        for (const l of this.layers) l.mesh.scale.set(w, up, w);
        this.glowMat.opacity = 0.07 * fadeOut;
        this.coreMat.opacity = 0.11 * fadeOut;
        // the clouds open: a ring widening to ~60 m, the sun's disc behind it
        // (against the black clouds: only the hole the beam burns — a pulsing ring of about HOLE_R m, the rest of the deck stays closed)
        const open = fight ? 1 : Math.max(0, Math.min(1, (t - 0.5) / 2.5));
        const R = fight ? 8 + Math.sin(t * (6 + 5 * this.fightK)) * 1.6 * (1 - 0.4 * this.fightK) : 4 + open * 60;
        this.ring.position.y = this.len; this.disc.position.y = this.len + 0.5;
        this.ring.scale.setScalar(R);
        this.ringMat.opacity = 0.75 * open * fadeOut;
        this.disc.scale.setScalar(fight ? R * 0.7 : 4 + open * 14);
        this.discMat.opacity = 0.8 * open * fadeOut;
        // sun rays pour down from the opening
        const rays = Math.max(0, Math.min(1, (t - 1.2) / 1.5));
        this.rayMat.opacity = 0.22 * rays * fadeOut;
        this.rays.forEach((r, i) => {
            const a = (i / 10) * Math.PI * 2 + t * 0.15;
            r.position.set(Math.cos(a) * R * 0.5, this.len, Math.sin(a) * R * 0.5);
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
