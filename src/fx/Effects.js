/**
 * Effects.js — every visual effect of the game behind one object.
 * All buffers, meshes and lights are created once at load time.
 */

import * as THREE from 'three';
import { ParticlePool, SegmentPool, CurvedBeam } from './Particles.js';

const _v = new THREE.Vector3();

export class Effects {
    /**
     * @param {THREE.Scene} scene
     * @param {CollisionWorld} collision  (for ground heights)
     */
    constructor(scene, collision) {
        this.scene = scene;
        this.collision = collision;
        const ground = (x, z) => collision.surfaceY(x, z);

        this.sparks = new ParticlePool(scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 3000, transparent: true });
        this.glow = new ParticlePool(scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 600, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        this.sand = new ParticlePool(scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 2000, ground, friction: 0.8 });
        this.shards = new ParticlePool(scene, { geometry: new THREE.ConeGeometry(0.4, 1, 4), capacity: 500, transparent: true, gravity: -9.8, ground, friction: 0.5 });
        this.debris = new ParticlePool(scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 1600, lit: true, gravity: -22, ground, bounce: 0.25, friction: 0.6 });
        this.smoke = new ParticlePool(scene, { geometry: new THREE.BoxGeometry(1, 1, 1), capacity: 700, transparent: true, depthWrite: false });
        this.bolts = new SegmentPool(scene, { capacity: 240, radius: 0.15, color: 0xaaddff });

        this.iceBeams = [0, 1, 2, 3].map(() => new CurvedBeam(scene));
        this._beamInUse = new Set();

        // Straight beams (ice miss + sapira), reused
        const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
        unitCyl.translate(0, 0.5, 0);
        this.straight = [];
        for (let i = 0; i < 6; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
            const mesh = new THREE.Mesh(unitCyl, mat);
            mesh.visible = false;
            mesh.frustumCulled = false;
            scene.add(mesh);
            this.straight.push({ mesh, life: 0, max: 1, onUpdate: null });
        }

        // Flash light: always present (intensity 0 when idle) so adding a light
        // never forces every material to recompile mid-fight.
        this.flash = new THREE.PointLight(0xaaddff, 0, 50);
        this.flash.position.set(0, -1000, 0);
        scene.add(this.flash);
        this.flashLife = 0;
        this.flashMax = 1;
        this.flashPeak = 0;

        this._initBlood(scene);
        this._initFlyingParts(scene);
        this.shake = 0;
    }

    // ---------------------------------------------------------------- blood
    _initBlood(scene) {
        const count = 5000;
        this.bloodCount = count;
        this.bloodPos = new Float32Array(count * 3);
        this.bloodVel = new Float32Array(count * 3);
        this.bloodLife = new Float32Array(count);
        for (let i = 0; i < count; i++) this.bloodPos[i * 3 + 1] = -1000;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.bloodPos, 3).setUsage(THREE.DynamicDrawUsage));
        this.bloodPoints = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x880000, size: 0.15 }));
        this.bloodPoints.frustumCulled = false;
        scene.add(this.bloodPoints);
        this._bloodCursor = 0;
        this._bloodActive = 0;
    }

    blood(pos, count) {
        let spawned = 0;
        for (let k = 0; k < this.bloodCount && spawned < count; k++) {
            const i = (this._bloodCursor + k) % this.bloodCount;
            if (this.bloodLife[i] > 0) continue;
            this.bloodLife[i] = 2.0 + Math.random() * 2.5;
            this.bloodPos[i * 3] = pos.x; this.bloodPos[i * 3 + 1] = pos.y; this.bloodPos[i * 3 + 2] = pos.z;
            this.bloodVel[i * 3] = (Math.random() - 0.5) * 4;
            this.bloodVel[i * 3 + 1] = Math.random() * 6;
            this.bloodVel[i * 3 + 2] = (Math.random() - 0.5) * 4;
            spawned++;
            this._bloodCursor = i + 1;
        }
        this._bloodActive += spawned;
    }

    _updateBlood(dt) {
        if (this._bloodActive <= 0) return;
        let alive = 0;
        const p = this.bloodPos, v = this.bloodVel, l = this.bloodLife;
        for (let i = 0; i < this.bloodCount; i++) {
            if (l[i] <= 0) continue;
            l[i] -= dt;
            const i3 = i * 3;
            v[i3 + 1] -= 15 * dt;
            p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
            const gy = this.collision.surfaceY(p[i3], p[i3 + 2]) + 0.05;
            if (p[i3 + 1] < gy) {
                p[i3 + 1] = gy;
                v[i3] *= 0.8; v[i3 + 2] *= 0.8; v[i3 + 1] = 0;
            }
            if (l[i] <= 0) p[i3 + 1] = -1000; else alive++;
        }
        this._bloodActive = alive;
        this.bloodPoints.geometry.attributes.position.needsUpdate = true;
    }

    // --------------------------------------------------------- flying limbs
    _initFlyingParts(scene) {
        const defs = {
            head: { geo: new THREE.BoxGeometry(1.0, 1.0, 1.0), mat: new THREE.MeshLambertMaterial({ color: 0x6DA36D }), size: 0.5 },
            arm: { geo: new THREE.BoxGeometry(0.35, 1.0, 0.35), mat: new THREE.MeshLambertMaterial({ color: 0x5D4037 }), size: 0.2 },
            leg: { geo: new THREE.BoxGeometry(0.4, 1.0, 0.4), mat: new THREE.MeshLambertMaterial({ color: 0x212121 }), size: 0.2 },
        };
        this.partDefs = defs;
        this.parts = [];
        for (const type of Object.keys(defs)) {
            for (let i = 0; i < 12; i++) {
                const mesh = new THREE.Mesh(defs[type].geo, defs[type].mat);
                mesh.visible = false;
                mesh.castShadow = true;
                scene.add(mesh);
                this.parts.push({ type, mesh, life: 0, vel: new THREE.Vector3(), rotVel: new THREE.Vector3() });
            }
        }
    }

    flyingPart(type, x, y, z) {
        let slot = this.parts.find((p) => p.type === type && p.life <= 0);
        if (!slot) {
            // Recycle the oldest part of that type
            slot = this.parts.filter((p) => p.type === type).sort((a, b) => a.life - b.life)[0];
        }
        slot.life = 5.0;
        slot.mesh.visible = true;
        slot.mesh.position.set(x, y, z);
        slot.mesh.rotation.set(0, 0, 0);
        slot.vel.set((Math.random() - 0.5) * 20, 10 + Math.random() * 10, (Math.random() - 0.5) * 20);
        slot.rotVel.set((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25);
    }

    _updateParts(dt) {
        for (const p of this.parts) {
            if (p.life <= 0) continue;
            p.life -= dt;
            if (p.life <= 0) { p.mesh.visible = false; continue; }
            p.vel.y -= 15 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.rotVel.x * dt;
            p.mesh.rotation.y += p.rotVel.y * dt;
            p.mesh.rotation.z += p.rotVel.z * dt;
            const gy = this.collision.surfaceY(p.mesh.position.x, p.mesh.position.z) + this.partDefs[p.type].size;
            if (p.mesh.position.y < gy) {
                p.mesh.position.y = gy;
                p.vel.y *= -0.3;
                p.vel.x *= 0.7;
                p.vel.z *= 0.7;
                p.rotVel.multiplyScalar(0.8);
            }
        }
    }

    // ---------------------------------------------------------- composites
    /** Original spawnParticle(pos, color, size, vel, life) semantics. */
    spark(pos, color, size, vel, life) {
        this.sparks.spawn(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, color, size, life);
    }

    sandBurst(center) {
        // Zombie crumbles into sand (original: 400 cubes falling and spreading)
        for (let i = 0; i < 400; i++) {
            this.sand.spawn(
                center.x + (Math.random() - 0.5) * 1.0,
                center.y + Math.random() * 2.0,
                center.z + (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 2, -Math.random() * 5, (Math.random() - 0.5) * 2,
                0xd2b48c, 0.15, 1.0 + Math.random() * 0.4, { shrink: 0, fade: false, spin: 0 },
            );
        }
    }

    iceShatter(center) {
        for (let i = 0; i < 50; i++) {
            this.shards.spawn(
                center.x + (Math.random() - 0.5) * 1.0,
                center.y + Math.random() * 2.0,
                center.z + (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 10, Math.random() * 5, (Math.random() - 0.5) * 10,
                0xaaddff, 0.5, 1.3, { shrink: 0, fade: true, spin: 6 },
            );
        }
    }

    /** Destroyed terrain blocks / props fly apart. */
    debrisFrom(items, center, maxCount = 260) {
        const step = Math.max(1, Math.ceil(items.length / maxCount));
        for (let i = 0; i < items.length; i += step) {
            const b = items[i];
            const color = b.color ?? b.faceColor ?? 0x7a5230;
            const dx = b.x - center.x, dy = b.y - center.y, dz = b.z - center.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            const power = 9 + Math.random() * 7;
            const pieces = b.size && b.size > 1 ? 3 : 2;
            for (let k = 0; k < pieces; k++) {
                this.debris.spawn(
                    b.x + (Math.random() - 0.5) * 0.6, b.y + (Math.random() - 0.5) * 0.6, b.z + (Math.random() - 0.5) * 0.6,
                    (dx / d) * power + (Math.random() - 0.5) * 5, (dy / d) * power * 0.6 + 6 + Math.random() * 7, (dz / d) * power + (Math.random() - 0.5) * 5,
                    color, (b.size || 1) * (0.35 + Math.random() * 0.3), 2.5 + Math.random() * 2.0,
                    { shrink: 0.12, fade: false, spin: 10 },
                );
            }
        }
    }

    explosion(center, radius) {
        // Fireball
        for (let i = 0; i < 90; i++) {
            const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
            const sp = 6 + Math.random() * 14;
            const vx = Math.sin(b) * Math.cos(a) * sp, vy = Math.cos(b) * sp, vz = Math.sin(b) * Math.sin(a) * sp;
            const colors = [0xffffff, 0xffe08a, 0xffa020, 0xff5a00, 0xd02000];
            this.glow.spawn(center.x, center.y, center.z, vx, vy, vz, colors[(Math.random() * colors.length) | 0], 0.6 + Math.random() * 1.2, 0.35 + Math.random() * 0.45, { shrink: 0.9, spin: 6 });
        }
        // Smoke
        for (let i = 0; i < 45; i++) {
            const g = 120 + Math.floor(Math.random() * 70); // light-to-mid grey smoke
            this.smoke.spawn(
                center.x + (Math.random() - 0.5) * radius, center.y + Math.random() * radius * 0.6, center.z + (Math.random() - 0.5) * radius,
                (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3,
                (g << 16) | (g << 8) | g, 1.0 + Math.random() * 1.6, 1.8 + Math.random() * 1.5, { shrink: -0.35, spin: 1.5 },
            );
        }
        this.lightFlash(center, 0xffaa55, 6, 0.35, radius * 8);
    }

    lightFlash(pos, color, intensity, life, distance = 50) {
        this.flash.color.setHex(color);
        this.flash.position.copy(pos);
        this.flash.distance = distance;
        this.flashPeak = intensity;
        this.flash.intensity = intensity;
        this.flashLife = life;
        this.flashMax = life;
    }

    /** Ice beam / straight beam helpers */
    acquireIceBeam() {
        for (const b of this.iceBeams) {
            if (!this._beamInUse.has(b)) { this._beamInUse.add(b); return b; }
        }
        return null;
    }

    releaseIceBeam(b) {
        if (!b) return;
        b.hide();
        this._beamInUse.delete(b);
    }

    straightBeam(start, end, radius, color, opacity, life, onUpdate = null, blending = THREE.NormalBlending) {
        let slot = this.straight.find((s) => s.life <= 0) || this.straight[0];
        const m = slot.mesh;
        _v.subVectors(end, start);
        const len = _v.length();
        m.position.copy(start);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.normalize());
        m.scale.set(radius, len, radius);
        m.material.color.setHex(color);
        m.material.opacity = opacity;
        m.material.blending = blending;
        m.userData.baseOpacity = opacity;
        m.userData.baseRadius = radius;
        m.visible = true;
        slot.life = life;
        slot.max = life;
        slot.onUpdate = onUpdate;
        return slot;
    }

    update(dt) {
        this.sparks.update(dt);
        this.glow.update(dt);
        this.sand.update(dt);
        this.shards.update(dt);
        this.debris.update(dt);
        this.smoke.update(dt);
        this.bolts.update(dt);
        this._updateBlood(dt);
        this._updateParts(dt);
        for (const s of this.straight) {
            if (s.life <= 0) continue;
            s.life -= dt;
            if (s.onUpdate) s.onUpdate(s, dt);
            else s.mesh.material.opacity = s.mesh.userData.baseOpacity * Math.max(0, s.life / s.max);
            if (s.life <= 0) s.mesh.visible = false;
        }
        if (this.flashLife > 0) {
            this.flashLife -= dt;
            this.flash.intensity = Math.max(0, this.flashPeak * (this.flashLife / this.flashMax));
            if (this.flashLife <= 0) this.flash.intensity = 0;
        }
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    clear() {
        for (const p of [this.sparks, this.glow, this.sand, this.shards, this.debris, this.smoke]) p.clear();
        this.bolts.clear();
        for (const b of this.iceBeams) this.releaseIceBeam(b);
        for (const s of this.straight) { s.life = 0; s.mesh.visible = false; }
        for (const p of this.parts) { p.life = 0; p.mesh.visible = false; }
        this.bloodLife.fill(0);
        for (let i = 0; i < this.bloodCount; i++) this.bloodPos[i * 3 + 1] = -1000;
        this.flash.intensity = 0;
    }
}
