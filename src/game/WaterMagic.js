/**
 * WaterMagic.js — water bending.
 *
 *   «Waterbollow»  hand close to a river/lake: water rises smoothly out of it
 *                  into a ball that floats in front of the palm and follows
 *                  the hand while it moves calmly.
 *   «Максима»      (said on its own, as many times as you like) the ball pulls
 *                  in more water and grows, up to a maximum.
 *   second hand    an open second hand next to the ball feeds it with water
 *                  from the nearest river/lake, no words needed.
 *   «Water forming» liquid water only: the ball itself is the clay — where you
 *                  lead it, water flows out of it and stays hanging in the
 *                  air as one living, merging mass (walls, towers, whole
 *                  buildings). It costs the ball's water: the ball shrinks and
 *                  can run dry; feed it to keep building.
 *   «Frozen»       freezes the ball and everything formed exactly in its
 *                  shape: solid ice (you can't walk through it, you can stand
 *                  on it). Ice can't be formed any more.
 *   sharp move     a fast, far jerk of the hand drops the spell: liquid water
 *                  falls and splashes (into a river it just becomes river
 *                  again, unfrozen formed blocks collapse); an ice ball falls,
 *                  splashes into the water and stays there (or on the ground).
 */

import * as THREE from 'three';
import { BLOCK, WATER_LEVEL_Y } from '../world/Terrain.js';
import { createWaterMaterial } from '../fx/WaterMaterial.js';

export const WATER = {
    REACH: 6, // m from the spot in front of the hand to the water
    ABOVE_MAX: 4.5, // m: that spot must be this close above the surface
    HOLD: 0.85, // m between the palm and the ball's surface (magic, not in the hand)
    START_VOLUME: 2, // m³ (one formed block = 1 m³)
    MAXIMA_ADD: 4,
    MAX_VOLUME: 60,
    FEED_RATE: 1.6, // m³/s through the second hand
    FEED_REACH: 1.6, // second hand this close to the ball
    FEED_SOURCE: 30, // m: water must be this close to feed / grow
    RISE_TIME: 1.1, // s
    DROP_DISTANCE: 0.75, // m the hand moves within DROP_WINDOW → spell dropped
    DROP_WINDOW: 0.25, // s
    GRACE: 0.8, // s after the spell starts before a jerk counts
    MAX_RESTING: 16, // ice balls left in the world
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export const radiusOf = (volume) => Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));

export class WaterMagic {
    /**
     * @param {object} game  Game (scene, terrain, collision, fx, character, zombies, sound, hud, sync)
     */
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.state = null;
        this.falling = []; // dropped balls in the air
        this.resting = []; // ice balls left in the world
        this.remotes = new Map(); // playerId -> mesh (other players' balls)
        this._t = 0;

        // Living water (see WaterMaterial.js): each use has its own uniforms
        this.liquidMat = createWaterMaterial(); // the ball in hand (stretches when moved)
        this.dropMat = createWaterMaterial(); // falling water, droplets
        this.remoteMat = createWaterMaterial(); // other players' balls
        this.blockMat = createWaterMaterial({ blocks: true }); // formed blocks, rising column
        this.iceMat = createWaterMaterial({ ice: true });
        this.dropMat.userData.uniforms.uStretch.value = 0.35;
        this._mats = [this.liquidMat, this.dropMat, this.remoteMat, this.blockMat];
        this.ballGeo = new THREE.SphereGeometry(1, 48, 32);
        this._ballVel = new THREE.Vector3();
        this._prevBall = new THREE.Vector3();
        this.ball = new THREE.Mesh(this.ballGeo, this.liquidMat);
        this.ball.visible = false;
        this.ball.renderOrder = 2;
        this.scene.add(this.ball);
        // Brighter current swirling inside the ball
        const coreMat = createWaterMaterial();
        coreMat.color.setHex(0x2f8fff);
        coreMat.blending = THREE.AdditiveBlending;
        coreMat.opacity = 0.2;
        coreMat.userData.uniforms.uWobble.value = 0.28; // a churning current, not a sphere
        coreMat.userData.uniforms.uTime.value = 17.3;
        this._mats.push(coreMat);
        this.core = new THREE.Mesh(this.ballGeo, coreMat);
        this.core.visible = false;
        this.core.renderOrder = 3;
        this.scene.add(this.core);
        // Droplets that orbit the ball, break away and get pulled back
        this.droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.dropMat, 18);
        this.droplets.count = 0;
        this.droplets.visible = false;
        this.droplets.frustumCulled = false;
        this.droplets.renderOrder = 2;
        this.scene.add(this.droplets);
        this._dropSeeds = Array.from({ length: 18 }, (_, i) => ({ a: Math.random() * 6.28, e: (Math.random() - 0.5) * 2.2, sp: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.28, sz: 0.5 + Math.random() * 0.8, i }));
        // Hidden ice ball so its shader is compiled during loading (no hitch on «Frozen»)
        this.iceTemplate = new THREE.Mesh(this.ballGeo, this.iceMat);
        this.iceTemplate.visible = false;
        this.scene.add(this.iceTemplate);

        // Water column rising from the river into the ball / feeding stream
        const col = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
        col.translate(0, 0.5, 0);
        col.rotateX(Math.PI / 2); // along +Z
        this.column = new THREE.Mesh(col, this.blockMat);
        this.column.visible = false;
        this.column.renderOrder = 2;
        this.scene.add(this.column);

        // Formed water: overlapping living blobs that read as one flowing mass
        this.blobGeo = new THREE.SphereGeometry(1, 28, 18);
        this.blobMat = createWaterMaterial(); // liquid (still moving)
        this.blobMat.userData.uniforms.uWobble.value = 0.12;
        this._mats.push(this.blobMat);
        this.formedMesh = new THREE.InstancedMesh(this.blobGeo, this.blobMat, 800);
        this.formedMesh.count = 0;
        this.formedMesh.visible = false;
        this.formedMesh.frustumCulled = false;
        this.formedMesh.renderOrder = 2;
        this.scene.add(this.formedMesh);
        // Frozen shapes left in the world (everyone's), one instanced mesh
        this.iceShapeMat = createWaterMaterial({ ice: true });
        this.iceShapeMat.userData.uniforms.uWobble.value = 0.16;
        this.iceShapeMat.userData.uniforms.uTime.value = 5.0;
        this.iceShapes = []; // {x, y, z, r}
        this.iceMesh = new THREE.InstancedMesh(this.blobGeo, this.iceShapeMat, 4000);
        this.iceMesh.count = 0;
        this.iceMesh.visible = false;
        this.iceMesh.frustumCulled = false;
        this.iceMesh.castShadow = true;
        this.scene.add(this.iceMesh);
    }

    get active() {
        return !!this.state;
    }

    get terrain() {
        return this.game.terrain ? this.game.terrain.data : null;
    }

    // ================================================================ voice
    /**
     * «Waterbollow»: starts from whichever hand is next to water.
     * @returns {string|null} null on success, otherwise a hint for the player
     */
    start() {
        if (this.state) return 'Водный шар уже в руке';
        const t = this.terrain;
        if (!t) return 'Здесь нет воды';
        const ch = this.game.character;
        // The casting hand is the one stretched out (roughly horizontally)
        // towards the water — like every other spell, not just the lower one.
        let best = null;
        for (const side of ['right', 'left']) {
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            const spot = hand.clone().addScaledVector(dir, WATER.HOLD + 0.8);
            const src = t.findWaterSurface(spot.x, spot.z, WATER.REACH);
            if (!src) continue;
            const above = spot.y - src.y;
            if (above > WATER.ABOVE_MAX || above < -2) continue;
            const toWater = _v1.set(src.x - hand.x, 0, src.z - hand.z);
            const flat = _v2.set(dir.x, 0, dir.z);
            const pointing = toWater.lengthSq() > 0.01 && flat.lengthSq() > 0.01 ? flat.normalize().dot(toWater.normalize()) : 0;
            let score = src.dist * 0.25 + Math.abs(dir.y) * 1.5 + (1 - pointing) * 0.8;
            if (!ch.isArmExtended?.(side)) score += 1.5;
            if (this.game.magicHand === side || this.game.lastMagicHand === side) score -= 0.4;
            if (!best || score < best.score) best = { side, src, score };
        }
        if (!best) return '💧 Вытяните руку <b>в сторону реки или озера</b> (вода не дальше ~6 м) и скажите «Waterbollow»';
        const src = new THREE.Vector3(best.src.x, best.src.y, best.src.z);
        this.state = {
            side: best.side,
            phase: 'rising',
            t: 0,
            age: 0,
            frozen: false,
            forming: false,
            volume: WATER.START_VOLUME,
            shown: 0.15, // displayed volume (grows smoothly)
            pos: src.clone(),
            source: src,
            formed: [], // blobs {x, y, z, r} still liquid
            lastBlob: null,
            lastPos: null,
            history: [], // [{t, x, y, z}] hand positions relative to the body
            feeding: 0,
        };
        this._splash(src, 1.0, 18);
        if (this.game.sound) this.game.sound.playWaterRise?.();
        return null;
    }

    /** «Максима»: more water into the ball (only liquid). */
    maxima() {
        const s = this.state;
        if (!s) return 'Сначала поднимите воду: «Waterbollow»';
        if (s.frozen) return 'Лёд уже не растёт';
        if (s.volume >= WATER.MAX_VOLUME) return '💧 Шар уже максимальный';
        s.volume = Math.min(WATER.MAX_VOLUME, s.volume + WATER.MAXIMA_ADD);
        const src = this.terrain?.findWaterSurface(s.pos.x, s.pos.z, WATER.FEED_SOURCE);
        s.streamFrom = src ? new THREE.Vector3(src.x, src.y, src.z) : null;
        s.streamT = 0.9;
        if (this.game.sound) this.game.sound.playWaterRise?.();
        return null;
    }

    /** «Water forming»: the liquid ball becomes a brush. */
    form() {
        const s = this.state;
        if (!s) return 'Сначала поднимите воду: «Waterbollow»';
        if (s.frozen) return '🧊 Изо льда формировать нельзя, только из жидкой воды';
        s.forming = true;
        s.lastBlob = null;
        s.lastPos = s.pos.clone();
        return null;
    }

    /** «Frozen»: freeze the ball and everything formed. */
    freeze() {
        const s = this.state;
        if (!s) return 'Нечего замораживать';
        if (s.frozen && !s.formed.length) return 'Уже лёд';
        const blobs = s.formed;
        if (blobs.length) {
            this.game.placeIce(blobs);
            for (const b of blobs) if (Math.random() < 0.3) this._sparkle(_v1.set(b.x, b.y, b.z), 3);
        }
        s.formed = [];
        this._syncFormed();
        s.forming = false;
        if (s.volume >= 0.3) {
            s.frozen = true;
            this.ball.material = this._freezeShape(this.liquidMat);
            this.core.visible = false;
            this.droplets.visible = false;
            this._sparkle(s.pos, 30);
        } else {
            this._end();
        }
        if (this.game.sound) this.game.sound.playIce?.();
        return null;
    }

    /** A new ice material holding the water exactly in its current shape. */
    _freezeShape(fromMat) {
        const m = createWaterMaterial({ ice: true });
        const a = fromMat.userData.uniforms, b = m.userData.uniforms;
        b.uTime.value = a.uTime.value;
        b.uWobble.value = a.uWobble.value * 1.4; // a bit sharper, crystal-like
        b.uStretchDir.value.copy(a.uStretchDir.value);
        b.uStretch.value = a.uStretch.value;
        return m;
    }

    // ============================================================== update
    update(dt) {
        this._t += dt;
        for (const m of this._mats) m.userData.uniforms.uTime.value += dt;
        if (this.state) this._updateHeld(dt);
        this._updateFalling(dt);
    }

    _handTarget(side, out) {
        const ch = this.game.character;
        const s = this.state;
        const hand = ch.getHandWorldPosition(side, _v2);
        const dir = ch.getHandDirection(side, _v3);
        const r = radiusOf(s ? s.shown : 1);
        // about a metre in front of the palm: held by magic, not in the hand
        return out.copy(hand).addScaledVector(dir, WATER.HOLD + r).addScaledVector(UP, r * 0.15);
    }

    _updateHeld(dt) {
        const s = this.state;
        const ch = this.game.character;
        const t = this.terrain;
        s.age += dt;
        s.shown += (s.volume - s.shown) * Math.min(1, dt * 3);
        const r = radiusOf(s.shown);
        const target = this._handTarget(s.side, _v1);

        if (s.phase === 'rising') {
            s.t += dt;
            const k = Math.min(1, s.t / WATER.RISE_TIME);
            const e = k * k * (3 - 2 * k);
            s.pos.copy(s.source).lerp(target, e);
            s.shown = WATER.START_VOLUME * (0.08 + 0.92 * e);
            this._showColumn(s.source, s.pos, radiusOf(s.shown) * 0.45 * (1 - e * 0.6));
            if (Math.random() < 0.8) this._drop(s.source, 0.2, _v2.set(0, 4 + Math.random() * 3, 0));
            if (k >= 1) { s.phase = 'held'; this.column.visible = false; }
        } else {
            // Follow the hand smoothly — a big ball is heavy and drifts after it more slowly
            s.pos.lerp(target, 1 - Math.exp(-dt * (s.frozen ? 10 : 9 / (1 + radiusOf(s.shown) * 0.9))));
            if (this._jerked(dt)) { this.drop(); return; }

            // Growing: «Максима» stream or the second hand feeding
            let feedFrom = null;
            if (s.streamT > 0) {
                s.streamT -= dt;
                feedFrom = s.streamFrom;
                if (!feedFrom) this._condense(s.pos, r);
            }
            if (!s.frozen && s.volume < WATER.MAX_VOLUME) {
                const other = s.side === 'left' ? 'right' : 'left';
                const oh = ch.getHandWorldPosition(other, _v3);
                const open = ch.getGripCurl(other) < 0.4;
                if (open && oh.distanceTo(s.pos) < WATER.FEED_REACH + r) {
                    if (!s.feedSource || s.feedCheck <= 0) {
                        const src = t?.findWaterSurface(s.pos.x, s.pos.z, WATER.FEED_SOURCE);
                        s.feedSource = src ? new THREE.Vector3(src.x, src.y, src.z) : null;
                        s.feedCheck = 1.0;
                    }
                    s.feedCheck -= dt;
                    if (s.feedSource) {
                        s.volume = Math.min(WATER.MAX_VOLUME, s.volume + WATER.FEED_RATE * dt);
                        s.feeding = 0.2;
                        // water flows from the river to the open hand and into the ball
                        if (Math.random() < 0.7) this._flowParticle(s.feedSource, oh);
                        if (Math.random() < 0.7) this._flowParticle(oh, s.pos);
                    }
                }
            }
            s.feeding = Math.max(0, s.feeding - dt);
            if (feedFrom) {
                this._showColumn(feedFrom, s.pos, 0.22 + r * 0.12);
            } else {
                this.column.visible = false;
            }

            if (s.forming && !s.frozen) this._form();
        }

        // Ball look: living water (shader) + inner current + droplets
        const ball = this.ball;
        const vis = s.volume >= 0.05;
        ball.visible = vis;
        if (vis) {
            const rr = radiusOf(s.shown);
            ball.position.copy(s.pos);
            ball.scale.setScalar(rr);
            if (!s.frozen) {
                const u = this.liquidMat.userData.uniforms;
                // Stretch along the movement (a tail drags behind)
                if (dt > 0) {
                    _v2.subVectors(s.pos, this._prevBall).divideScalar(dt);
                    if (_v2.lengthSq() < 400) this._ballVel.lerp(_v2, Math.min(1, dt * 6));
                }
                const sp = this._ballVel.length();
                if (sp > 0.05) u.uStretchDir.value.copy(this._ballVel).divideScalar(sp);
                u.uStretch.value += (Math.min(0.55, sp * 0.09) - u.uStretch.value) * Math.min(1, dt * 5);
                // calmer when big, livelier while forming / growing
                u.uWobble.value = (s.forming ? 0.13 : 0.085) + (s.streamT > 0 || s.feeding > 0 ? 0.04 : 0);
                this.core.visible = true;
                this.core.position.copy(s.pos);
                this.core.scale.setScalar(rr * (0.55 + 0.06 * Math.sin(this._t * 2.7)));
                this.core.rotation.set(this._t * 0.9, -this._t * 1.3, this._t * 0.5);
                this._updateDroplets(s.pos, rr);
                if (Math.random() < 0.12) this._drop(s.pos, rr, _v2.set((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2));
            }
        } else {
            this.core.visible = false;
            this.droplets.visible = false;
        }
        this._prevBall.copy(s.pos);
        if (!vis && !s.formed.length && s.phase === 'held') this._end();
    }

    /** A fast, far movement of the holding hand (relative to the body). */
    _jerked(dt) {
        const s = this.state;
        const ch = this.game.character;
        const hand = ch.getHandWorldPosition(s.side, _v2).sub(ch.group.position);
        const now = this._t;
        s.history.push({ t: now, x: hand.x, y: hand.y, z: hand.z });
        while (s.history.length && now - s.history[0].t > WATER.DROP_WINDOW) s.history.shift();
        if (s.age < WATER.GRACE) return false;
        const old = s.history[0];
        const moved = Math.hypot(hand.x - old.x, hand.y - old.y, hand.z - old.z);
        return moved > WATER.DROP_DISTANCE;
    }

    /**
     * Water forming: the ball pours itself out along its path. Each piece is a
     * living blob overlapping the last one, so the result is one flowing mass.
     */
    _form() {
        const s = this.state;
        const t = this.terrain;
        if (!t) return;
        const r = radiusOf(s.shown);
        const br = Math.min(1.1, Math.max(0.45, 0.3 + r * 0.38)); // thickness of the "wall"
        const cost = (4 / 3) * Math.PI * br * br * br * 0.5; // overlapping blobs share water
        const from = s.lastPos || s.pos;
        const len = from.distanceTo(s.pos);
        const steps = Math.max(1, Math.ceil(len / 0.2));
        const pp = this.game.character.group.position;
        for (let i = 1; i <= steps && s.volume >= cost; i++) {
            _v2.copy(from).lerp(s.pos, i / steps);
            if (s.lastBlob && _v2.distanceTo(s.lastBlob) < br * 0.7) continue;
            // never inside the player, never inside rock
            if (Math.hypot(_v2.x - pp.x, _v2.z - pp.z) < 0.7 + br && _v2.y > pp.y - 2.6 && _v2.y < pp.y + 1.4) continue;
            if (t.isSolidAt(_v2.x, _v2.y, _v2.z)) continue;
            const b = { x: _v2.x, y: _v2.y, z: _v2.z, r: br * (0.9 + Math.random() * 0.2) };
            s.formed.push(b);
            s.lastBlob = _v2.clone();
            s.volume -= cost;
            s.shown = Math.min(s.shown, s.volume + 0.3);
            // the water visibly flows out of the ball into the shape
            for (let k = 0; k < 3; k++) this._flowParticle(s.pos, _v3.set(b.x, b.y, b.z));
        }
        s.lastPos = s.pos.clone();
        this._syncFormed();
    }

    /** Solid cells inside a frozen blob (for walking into / standing on it). */
    static cellsOf(b) {
        const out = [];
        const R = b.r * 0.85;
        for (let x = Math.floor(b.x - b.r); x <= Math.ceil(b.x + b.r); x++) {
            for (let z = Math.floor(b.z - b.r); z <= Math.ceil(b.z + b.r); z++) {
                for (let L = Math.floor(b.y - b.r + 1.5); L <= Math.ceil(b.y + b.r + 1.5); L++) {
                    const cy = L - 1;
                    if ((x - b.x) ** 2 + (cy - b.y) ** 2 + (z - b.z) ** 2 <= R * R) out.push([x, L, z]);
                }
            }
        }
        if (!out.length) out.push([Math.round(b.x), Math.floor(b.y + 1.5), Math.round(b.z)]);
        return out;
    }

    /** Frozen water shapes join the world (mine or another player's). */
    addIceShapes(blobs) {
        for (const b of blobs) this.iceShapes.push({ x: b.x, y: b.y, z: b.z, r: b.r });
        this._syncIce();
    }

    _syncIce() {
        const m = this.iceMesh;
        const n = Math.min(this.iceShapes.length, m.instanceMatrix.count);
        for (let i = 0; i < n; i++) {
            const b = this.iceShapes[this.iceShapes.length - n + i];
            _m.makeScale(b.r, b.r, b.r).setPosition(b.x, b.y, b.z);
            m.setMatrixAt(i, _m);
        }
        m.count = n;
        m.visible = n > 0;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere?.();
    }

    /** Droplets circling the ball; now and then one flies off and is pulled back. */
    _updateDroplets(c, r) {
        const m = this.droplets;
        const n = Math.min(m.instanceMatrix.count, 6 + Math.floor(r * 6));
        const t = this._t;
        for (let i = 0; i < n; i++) {
            const d = this._dropSeeds[i];
            const a = d.a + t * d.sp;
            const e = d.e + Math.sin(t * 0.7 + d.ph) * 0.4;
            // breaking away: a slow pulse pushes the droplet out, then back
            const away = Math.max(0, Math.sin(t * 0.9 + d.ph * 3)) ** 6;
            const R = r * (1.12 + 0.12 * Math.sin(t * 1.7 + d.ph) + 0.9 * away);
            const sz = r * 0.07 * d.sz * (1 - 0.4 * away) + 0.03;
            _v2.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(R).add(c);
            _m.makeScale(sz, sz, sz).setPosition(_v2);
            m.setMatrixAt(i, _m);
        }
        m.count = n;
        m.visible = true;
        m.instanceMatrix.needsUpdate = true;
    }

    _syncFormed() {
        const s = this.state;
        const m = this.formedMesh;
        let i = 0;
        if (s) {
            for (const b of s.formed) {
                if (i >= m.instanceMatrix.count) break;
                _m.makeScale(b.r, b.r, b.r).setPosition(b.x, b.y, b.z);
                m.setMatrixAt(i++, _m);
            }
        }
        m.count = i;
        m.visible = i > 0;
        m.instanceMatrix.needsUpdate = true;
    }

    /** Let go: the ball falls (and unfrozen formed water collapses). */
    drop() {
        const s = this.state;
        if (!s) return;
        if (s.formed.length) {
            // unfrozen water collapses
            let n = 0;
            for (const b of s.formed) if (n++ < 80) this._splash(_v1.set(b.x, b.y - b.r, b.z), 0.6, 4);
            s.formed = [];
            this._syncFormed();
            if (this.game.sound) this.game.sound.playSplash?.();
        }
        if (s.volume >= 0.3 && s.phase === 'held') {
            const ch = this.game.character;
            const vel = ch.handVelocity?.[s.side] ? ch.handVelocity[s.side].clone().multiplyScalar(0.35) : new THREE.Vector3();
            const ball = { pos: s.pos.clone(), vel, r: radiusOf(s.volume), frozen: s.frozen, local: true, mat: s.frozen ? this.ball.material : null };
            this._spawnFalling(ball);
            if (this.game.sync) this.game.sync.waterDrop(ball);
        } else if (s.phase === 'rising') {
            this._splash(s.pos, 0.6, 10);
        }
        this._end();
    }

    _end() {
        this.state = null;
        this.ball.visible = false;
        this.ball.material = this.liquidMat;
        this.core.visible = false;
        this.droplets.visible = false;
        this.liquidMat.userData.uniforms.uStretch.value = 0;
        this._ballVel.set(0, 0, 0);
        this.column.visible = false;
        this._syncFormed();
    }

    // ============================================================ dropped balls
    _spawnFalling(b) {
        const mesh = new THREE.Mesh(this.ballGeo, b.mat || (b.frozen ? this.iceMat : this.dropMat));
        mesh.scale.setScalar(b.r);
        mesh.position.copy(b.pos);
        mesh.renderOrder = 2;
        this.scene.add(mesh);
        this.falling.push({ ...b, mesh });
    }

    /** A remote player dropped their ball (visual + same physics here). */
    remoteDrop(m) {
        this._spawnFalling({ pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), r: m.r, frozen: !!m.f, local: false });
    }

    _updateFalling(dt) {
        const t = this.terrain;
        const col = this.game.collision;
        for (let i = this.falling.length - 1; i >= 0; i--) {
            const b = this.falling[i];
            b.vel.y -= 18 * dt;
            b.pos.addScaledVector(b.vel, dt);
            b.mesh.position.copy(b.pos);
            if (b.frozen) b.mesh.rotation.x += dt * 2;

            // Ice ball hits zombies on the way down
            if (b.frozen && b.local && b.vel.length() > 3) {
                for (const z of this.game.zombies) {
                    if (z.isDead || z._iceHit === b) continue;
                    const zp = z.group.position;
                    if (Math.hypot(zp.x - b.pos.x, zp.z - b.pos.z) < b.r + 0.7 && b.pos.y < zp.y + 2.6 && b.pos.y > zp.y - 1.2) {
                        z._iceHit = b;
                        this.game.onLocalHit(z, Math.round(3 + b.r * 3), _v1.copy(b.vel).setY(0).normalize(), false);
                    }
                }
            }

            const inWater = t && t.isWaterAt(b.pos.x, b.pos.y - b.r * 0.5, b.pos.z);
            const ground = col.surfaceY(b.pos.x, b.pos.z);
            if (inWater) {
                this._splash(_v1.set(b.pos.x, WATER_LEVEL_Y, b.pos.z), 1 + b.r, 25 + b.r * 15);
                if (this.game.sound) this.game.sound.playSplash?.();
                this.falling.splice(i, 1);
                if (b.frozen) {
                    // The ice ball stays in the water (mostly under the surface)
                    b.pos.y = Math.max(ground + b.r * 0.8, WATER_LEVEL_Y - b.r * 0.55);
                    this._rest(b);
                } else this._remove(b.mesh); // just becomes part of the river again
            } else if (b.pos.y - b.r * 0.85 <= ground || (b.vel.y < 0 && col.pointBlocked(b.pos.x, b.pos.y - b.r, b.pos.z))) {
                this.falling.splice(i, 1);
                if (b.frozen) {
                    b.pos.y = Math.max(b.pos.y, ground + b.r * 0.85);
                    this._sparkle(b.pos, 10);
                    if (this.game.sound) this.game.sound.playFrozenHit?.();
                    this._rest(b);
                } else {
                    this._splash(_v1.set(b.pos.x, ground, b.pos.z), 1 + b.r, 30 + b.r * 15);
                    if (this.game.sound) this.game.sound.playSplash?.();
                    this._remove(b.mesh);
                }
            } else if (b.pos.y < -60) {
                this.falling.splice(i, 1);
                this._remove(b.mesh);
            }
        }
    }

    /** An ice ball left in the world: solid (players and zombies bump into it). */
    _rest(b) {
        b.mesh.position.copy(b.pos);
        b.mesh.scale.setScalar(b.r);
        const r = b.r * 0.8;
        b.boxId = this.game.collision.addBox({ minX: b.pos.x - r, maxX: b.pos.x + r, minY: b.pos.y - b.r, maxY: b.pos.y + b.r * 0.9, minZ: b.pos.z - r, maxZ: b.pos.z + r, kind: 'ice' });
        this.resting.push(b);
        while (this.resting.length > WATER.MAX_RESTING) this._shatter(this.resting.shift());
    }

    _shatter(b) {
        this.game.collision.removeBox(b.boxId);
        this._sparkle(b.pos, 20);
        this._remove(b.mesh);
    }

    /** Bombardo shatters ice balls and frozen shapes in range. */
    explode(pos, radius) {
        const before = this.iceShapes.length;
        this.iceShapes = this.iceShapes.filter((b) => {
            const hit = Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z) < radius + b.r * 0.5;
            if (hit && Math.random() < 0.4) this._sparkle(_v1.set(b.x, b.y, b.z), 6);
            return !hit;
        });
        if (this.iceShapes.length !== before) this._syncIce();
        for (let i = this.resting.length - 1; i >= 0; i--) {
            const b = this.resting[i];
            if (b.pos.distanceTo(pos) < radius + b.r + 1) {
                this.resting.splice(i, 1);
                this._shatter(b);
            }
        }
    }

    _remove(mesh) {
        this.scene.remove(mesh);
    }

    // ============================================================= network
    /** Compact state of the ball in hand for other players (null = none). */
    serialize() {
        const s = this.state;
        if (!s || s.volume < 0.05) return null;
        const r2 = (v) => Math.round(v * 100) / 100;
        return [r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), r2(radiusOf(s.shown)), s.frozen ? 1 : 0];
    }

    applyRemote(id, st) {
        let mesh = this.remotes.get(id);
        if (!st) {
            if (mesh) { this.scene.remove(mesh); this.remotes.delete(id); }
            return;
        }
        if (!mesh) {
            mesh = new THREE.Mesh(this.ballGeo, this.remoteMat);
            mesh.renderOrder = 2;
            this.scene.add(mesh);
            this.remotes.set(id, mesh);
            mesh.position.set(st[0], st[1], st[2]);
        }
        mesh.material = st[4] ? this.iceMat : this.remoteMat;
        mesh.position.lerp(_v1.set(st[0], st[1], st[2]), 0.5);
        mesh.scale.setScalar(st[3]);
    }

    // ============================================================= visuals
    _showColumn(a, b, radius) {
        const c = this.column;
        const len = a.distanceTo(b);
        if (len < 0.05) { c.visible = false; return; }
        c.visible = true;
        c.position.copy(a);
        c.lookAt(b);
        c.scale.set(radius, radius, len);
    }

    _drop(pos, spread, vel) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        fx.sparks.spawn(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread,
            vel.x, vel.y, vel.z, Math.random() < 0.5 ? 0x7cc4ff : 0xbfe6ff, 0.08 + Math.random() * 0.08, 0.5 + Math.random() * 0.4, { gravity: -12 });
    }

    _flowParticle(from, to) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        const d = _v2.subVectors(to, from);
        const life = 0.45;
        fx.sparks.spawn(from.x, from.y, from.z, d.x / life, d.y / life + 2, d.z / life, 0x7cc4ff, 0.12 + Math.random() * 0.08, life, { gravity: -8 });
    }

    _condense(pos, r) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * Math.PI;
        const R = r + 2.5;
        const ox = Math.cos(a) * Math.cos(e) * R, oy = Math.sin(e) * R, oz = Math.sin(a) * Math.cos(e) * R;
        fx.sparks.spawn(pos.x + ox, pos.y + oy, pos.z + oz, -ox * 2.5, -oy * 2.5, -oz * 2.5, 0xbfe6ff, 0.1, 0.4, {});
    }

    _splash(pos, size, count) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3 * size;
            fx.sparks.spawn(pos.x + Math.cos(a) * 0.3 * size, pos.y + 0.1, pos.z + Math.sin(a) * 0.3 * size,
                Math.cos(a) * sp, 3 + Math.random() * 5 * Math.sqrt(size), Math.sin(a) * sp,
                Math.random() < 0.5 ? 0x7cc4ff : 0xe6f6ff, 0.1 + Math.random() * 0.12, 0.6 + Math.random() * 0.5, { gravity: -14 });
        }
    }

    _sparkle(pos, count) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        for (let i = 0; i < count; i++) {
            fx.sparks.spawn(pos.x + (Math.random() - 0.5) * 1.5, pos.y + (Math.random() - 0.5) * 1.5, pos.z + (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0xe8fbff, 0.08 + Math.random() * 0.08, 0.5, { gravity: -6 });
        }
    }

    dispose() {
        this._end();
        for (const b of [...this.falling, ...this.resting]) this._remove(b.mesh);
        for (const m of this.remotes.values()) this.scene.remove(m);
        this.falling = [];
        this.resting = [];
        this.remotes.clear();
        for (const o of [this.ball, this.core, this.droplets, this.iceTemplate, this.column, this.formedMesh, this.iceMesh]) this.scene.remove(o);
        this.ballGeo.dispose();
        this.column.geometry.dispose();
        this.blobGeo.dispose();
        this.iceShapeMat.dispose();
        this.droplets.geometry.dispose();
        for (const m of [...this._mats, this.iceMat]) m.dispose();
    }
}
