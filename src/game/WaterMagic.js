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
import { WaterFlow, WaterSpray } from '../fx/WaterFlow.js';

export const WATER = {
    REACH: 6, // m from the spot in front of the hand to the water
    ABOVE_MAX: 4.5, // m: that spot must be this close above the surface
    HOLD: 1.8, // m between the palm and the ball's surface (magic, not in the hand)
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
        // The water that moves: streams rising from the river, currents running over the ball, the water
        // pouring out of it into a shape (continuous flowing tubes — WaterFlow.js), drops and mist
        this.flow = new WaterFlow(this.scene, { maxVerts: 26000, radial: 10 });
        this.spray = new WaterSpray(this.scene, 900);
        this._pts = [];
        // Hidden ice ball so its shader is compiled during loading (no hitch on «Frozen»)
        this.iceTemplate = new THREE.Mesh(this.ballGeo, this.iceMat);
        this.iceTemplate.visible = false;
        this.scene.add(this.iceTemplate);

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
            // Ice is heavy: the frozen shape falls as one piece and stays where it lands
            this._dropShape(blobs);
            for (const b of blobs) if (Math.random() < 0.3) this._sparkle(_v1.set(b.x, b.y, b.z), 3);
        }
        s.formed = [];
        this._syncFormed();
        s.forming = false;
        this.frozenAt = performance.now();
        if (s.volume >= 0.3 && s.phase === 'held') {
            // The frozen ball can't be held by water magic any more: it drops
            const iceMat = this._freezeShape(this.liquidMat);
            this._sparkle(s.pos, 30);
            const ball = { pos: s.pos.clone(), vel: new THREE.Vector3(0, -0.5, 0), r: radiusOf(s.volume), frozen: true, local: true, mat: iceMat };
            this._spawnFalling(ball);
            if (this.game.sync) this.game.sync.waterDrop(ball);
        }
        this._end();
        if (this.game.sound) this.game.sound.playIce?.();
        return null;
    }

    /** A frozen shape falling as one rigid piece until it touches ground or ice. */
    _dropShape(blobs) {
        const piece = { blobs: blobs.map((b) => ({ ...b })), vy: 0, t: 0 };
        piece.mesh = new THREE.InstancedMesh(this.blobGeo, this.iceShapeMat, piece.blobs.length);
        piece.mesh.frustumCulled = false;
        piece.mesh.castShadow = true;
        this.scene.add(piece.mesh);
        this._syncPiece(piece);
        (this.fallingShapes || (this.fallingShapes = [])).push(piece);
    }

    _syncPiece(piece) {
        piece.blobs.forEach((b, i) => {
            _m.makeScale(b.r, b.r, b.r).setPosition(b.x, b.y, b.z);
            piece.mesh.setMatrixAt(i, _m);
        });
        piece.mesh.instanceMatrix.needsUpdate = true;
    }

    _updateFallingShapes(dt) {
        const list = this.fallingShapes;
        if (!list || !list.length) return;
        const t = this.terrain;
        const col = this.game.collision;
        for (let i = list.length - 1; i >= 0; i--) {
            const piece = list[i];
            piece.t += dt;
            piece.vy -= 18 * dt;
            let dy = piece.vy * dt;
            // How far can it fall before some blob touches the ground / solid ice / water bottom?
            let landed = false;
            for (const b of piece.blobs) {
                const ground = col.surfaceY(b.x, b.z);
                const bottom = b.y - b.r * 0.85;
                if (bottom + dy <= ground) { dy = Math.max(dy, ground - bottom); landed = true; }
                if (t && t.isSolidAt(b.x, bottom + dy, b.z) && bottom > ground + 0.1) { dy = 0; landed = true; }
            }
            for (const b of piece.blobs) b.y += dy;
            this._syncPiece(piece);
            if (landed || piece.t > 6) {
                list.splice(i, 1);
                this.scene.remove(piece.mesh);
                piece.mesh.dispose?.();
                this._splash(_v1.set(piece.blobs[0].x, piece.blobs[0].y - piece.blobs[0].r, piece.blobs[0].z), 0.8, 10);
                if (this.game.sound) this.game.sound.playFrozenHit?.();
                this.game.placeIce(piece.blobs);
            }
        }
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
        this.flow.begin(dt);
        if (this.state) this._updateHeld(dt);
        this._updateFalling(dt);
        this._updateFallingShapes(dt);
        this._drawFormed(dt);
        this.flow.end();
        this.spray.update(dt, this.game.camera);
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
            // the water is pulled out of the river: a twisting stream from the surface up into the ball
            // (the ball is the head of that stream and grows as it comes)
            this._showColumn(s.source, s.pos, Math.max(0.1, radiusOf(WATER.START_VOLUME) * 0.5 * (1 - e * 0.5)), 0.15);
            if (Math.random() < 0.6) this._drop(s.source, 0.3, _v2.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2));
            if (Math.random() < 0.15) this.spray.add(s.source.x, s.source.y + 0.1, s.source.z, 0, 0.3, 0, 0.8, 1.1, 1);
            if (k >= 1) s.phase = 'held';
        } else {
            // Follow the hand smoothly — a big ball is heavy and drifts after it more slowly
            s.pos.lerp(target, 1 - Math.exp(-dt * (s.frozen ? 10 : 9 / (1 + radiusOf(s.shown) * 0.9))));
            if (this._jerked(dt)) { this.drop(); return; }

            // Growing: «Максима» stream or the second hand feeding
            let feedFrom = null;
            if (s.streamT > 0) {
                s.streamT -= dt;
                feedFrom = s.streamFrom;
                if (!feedFrom) this._condense(s.pos, r, s.streamT);
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
                        this.flow.stream(s.feedSource, oh, 0.1, { lift: 1 + 0.08 * s.feedSource.distanceTo(oh), strands: 1, speed: 8, phase: 1 });
                        this.flow.stream(oh, s.pos, 0.09, { lift: 0.15, strands: 0, speed: 6, phase: 2 });
                    }
                }
            }
            s.feeding = Math.max(0, s.feeding - dt);
            if (feedFrom) this._showColumn(feedFrom, s.pos, (0.22 + r * 0.12) * Math.min(1, s.streamT * 2));

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
                this._currents(s.pos, rr);
                if (Math.random() < 0.12) this._drop(s.pos, rr, _v2.set((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2));
            }
        } else {
            this.core.visible = false;
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
            s.pourT = 0.3; // (the water visibly pours out of the ball into the shape — _drawFormed)
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

    /**
     * The ball is never still water: currents run over its surface (thin streams spiralling round it),
     * now and then one lifts off a little and is pulled back in.
     */
    _currents(c, r) {
        const P = this._pts, t = this._t;
        const n = 2 + Math.min(2, Math.floor(r));
        for (let k = 0; k < n; k++) {
            const tilt = 0.7 + k * 0.9, spin = t * (1.6 + 0.3 * k) + k * 2.1;
            const lift = 1.06 + 0.12 * Math.max(0, Math.sin(t * 0.9 + k * 2.3)) ** 4;
            const ct = Math.cos(tilt), st = Math.sin(tilt);
            P.length = 13;
            for (let j = 0; j < 13; j++) {
                const a = spin + j * 0.26;
                const x = Math.cos(a) * r * lift, y0 = Math.sin(a * 2 + k) * r * 0.12, z = Math.sin(a) * r * lift;
                const o = P[j] || (P[j] = { x: 0, y: 0, z: 0 });
                o.x = c.x + x; o.y = c.y + y0 * ct - z * st * 0.6; o.z = c.z + z * ct + y0 * st;
            }
            this.flow.tube(P, 0.025 + r * 0.07, { speed: r * 2.5, foam: 0.3, offset: k * 2 });
        }
    }

    /** Formed water: the pieces poured one after another are joined into continuous flowing bands. */
    _drawFormed(dt) {
        const s = this.state;
        if (!s) return;
        const P = this._pts;
        const f = s.formed;
        let pi = 0, rad = this._rad || (this._rad = []);
        rad.length = 0;
        const flush = () => {
            if (pi >= 2) { P.length = pi; this.flow.tube(P, rad, { speed: 0.6, foam: 0.15 }); }
            pi = 0; rad.length = 0;
        };
        for (let i = 0; i < f.length; i++) {
            const b = f[i], p = f[i - 1];
            if (p && Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) > (b.r + p.r) * 1.3) flush();
            const o = P[pi] || (P[pi] = { x: 0, y: 0, z: 0 });
            o.x = b.x; o.y = b.y; o.z = b.z; pi++;
            rad.push(b.r * 0.82);
            if (pi >= 60) { flush(); const o2 = P[0]; o2.x = b.x; o2.y = b.y; o2.z = b.z; pi = 1; rad.push(b.r * 0.82); }
        }
        flush();
        if (s.pourT > 0 && s.lastBlob && !s.frozen) {
            s.pourT -= dt;
            this.flow.stream(s.pos, s.lastBlob, Math.max(0.08, radiusOf(s.shown) * 0.3), { lift: 0.1, strands: 1, speed: 6 });
        }
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
        this.liquidMat.userData.uniforms.uStretch.value = 0;
        this._ballVel.set(0, 0, 0);
        this._syncFormed();
    }

    // ============================================================ dropped balls
    _spawnFalling(b) {
        const mesh = new THREE.Mesh(this.ballGeo, b.mat || (b.frozen ? this.iceMat : this.dropMat));
        mesh.scale.setScalar(b.r);
        mesh.position.copy(b.pos);
        mesh.renderOrder = 2;
        this.scene.add(mesh);
        const f = { ...b, mesh };
        this.falling.push(f);
        return f;
    }

    /** A remote player dropped their ball (visual + same physics here). */
    remoteDrop(m) {
        const b = this._spawnFalling({ pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), r: m.r, frozen: !!m.f, local: false });
        if (b) b.by = m.by;
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

            this._ballHitsBodies(b);
            // a house's sphere of protection: the ball bounces off it (HouseWards.js)
            const prevPos = _v2.copy(b.pos).addScaledVector(b.vel, -dt);
            const ward = this.game.wards?.segmentHit(prevPos, b.pos);
            if (ward) {
                const n = _v1.set(ward.x - prevPos.x, ward.y - prevPos.y, ward.z - prevPos.z);
                const w = this.game.wards.hitSegment(prevPos, b.pos)?.w;
                if (w) n.set(ward.x - w.c.x, ward.y - w.c.y, ward.z - w.c.z).normalize();
                b.pos.copy(ward);
                b.vel.reflect(n).multiplyScalar(0.5);
            }
            // over a standing cauldron's opening: it pours in (Cauldrons.js; ice does not)
            if (this.game.cauldrons?.catchBall(b)) { this.falling.splice(i, 1); this._remove(b.mesh); continue; }
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

    /**
     * A thrown / dropped ball hits a body on its way: water shoves (a stagger, never harm), ice hits
     * hard (a big ball throws off the feet). My body: from another player's ball; creatures: on the host.
     */
    _ballHitsBodies(b) {
        const g = this.game;
        if (b.vel.length() <= 3) return;
        if (b.local && !b.by) b.by = g.localId;
        const push = () => b.vel.clone().setY(0).setLength(b.frozen ? (b.r >= 1.2 ? 12 : 6) : 4);
        const name = b.frozen ? (b.r >= 1.2 ? 'IceBallBig' : 'IceBall') : 'WaterHit';
        if (b.frozen && g.authority) g.books?.iceAt?.(b.pos, b.r); // (an ice ball brings down even the book of protection)
        if (!b.local && !b._hitMe && g.impact && g.combat && !g.combat.dead && g.combat.center(_v1).distanceTo(b.pos) < b.r + 0.8) {
            b._hitMe = true;
            const res = g.impact.apply({ v: push(), from: b.pos.clone(), by: b.by || null, spell: name, jolt: b.frozen ? 1.5 : 0.5, noShield: false });
            if (b.frozen && res !== 'blocked' && g.combat.enabled) g.combat.damage(Math.round(3 + 3 * b.r), b.by || null, 'IceBall');
        }
        if (g.authority && g.creatureImpact) {
            b._hitC = b._hitC || new Set();
            g.creatureImpact.spellArea(name, b.by || g.localId, (p) => (p.distanceTo(b.pos) < b.r + 1.1 ? push() : null),
                { from: b.pos.clone(), skip: (c) => b._hitC.has(c), each: (c) => b._hitC.add(c) });
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
    /** The water that stops an «Инферно» flame: {x, y, z, r} of every ball (mine, others', flying, lying). */
    spheres(out = []) {
        const s = this.state;
        if (s && s.volume >= 0.05) {
            out.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, r: radiusOf(s.shown) });
            for (const b of s.formed || []) out.push({ x: b.x, y: b.y, z: b.z, r: b.r });
        }
        for (const m of this.remotes.values()) out.push({ x: m.position.x, y: m.position.y, z: m.position.z, r: m.scale.x });
        for (const b of this.falling) out.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, r: b.r });
        for (const b of this.resting) out.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, r: b.r });
        return out;
    }

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
    /** A stream of water from `a` up into the ball (out of the river, or the «Максима» stream). */
    _showColumn(a, b, radius, lift = 0.6) {
        this.flow.stream(a, b, radius, { lift, strands: 2, speed: 8 });
    }

    _drop(pos, spread, vel) {
        this.spray.add(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread,
            vel.x, vel.y, vel.z, 0.07 + Math.random() * 0.07, 0.5 + Math.random() * 0.4);
    }

    /** «Максима» far from water: the water condenses out of the air — thin streams curl in from all round. */
    _condense(pos, r, left = 1) {
        const t = this._t, k = Math.min(1, left / 0.9);
        for (let i = 0; i < 6; i++) {
            const a = i * 1.047 + t * 0.7, e = Math.sin(i * 2.1) * 0.8;
            const R = r + 0.4 + 2.2 * k;
            _v2.set(pos.x + Math.cos(a) * Math.cos(e) * R, pos.y + Math.sin(e) * R, pos.z + Math.sin(a) * Math.cos(e) * R);
            this.flow.stream(_v2, pos, 0.035 + 0.04 * (1 - k), { lift: 0.4 * Math.sin(i), strands: 0, speed: 5, foam: 0.4, phase: i });
        }
        if (Math.random() < 0.3) this.spray.add(pos.x + (Math.random() - 0.5) * 4, pos.y + (Math.random() - 0.5) * 3, pos.z + (Math.random() - 0.5) * 4, 0, 0, 0, 0.9, 0.8, 1);
    }

    _splash(pos, size, count) {
        this.spray.burst(pos.x, pos.y + 0.1, pos.z, count, 1.5 + 3 * size, 3 + 4 * Math.sqrt(size), 0.1 + 0.03 * size);
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
        for (const o of [this.ball, this.core, this.iceTemplate, this.formedMesh, this.iceMesh]) this.scene.remove(o);
        this.flow.dispose();
        this.spray.dispose();
        this.ballGeo.dispose();
        this.blobGeo.dispose();
        this.iceShapeMat.dispose();
        for (const m of [...this._mats, this.iceMat]) m.dispose();
    }
}
