/**
 * Zombie.js — enemy AI and visuals.
 *
 * Same look, speeds, damage rules and animations as the original. Rewritten
 * for performance:
 *   - geometries are shared by all zombies (only small per-zombie materials for
 *     the red hit flash / ice tint),
 *   - sand / ice-shatter / flying limbs / blood go through pooled FX systems
 *     instead of hundreds of meshes with their own requestAnimationFrame loops,
 *   - corpses are cleaned up after a while (endless waves no longer slow down),
 *   - zero allocations in update().
 */

import * as THREE from 'three';

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        head: new THREE.BoxGeometry(1.2, 1.2, 1.2),
        eye: new THREE.BoxGeometry(0.2, 0.2, 0.1),
        arm: new THREE.BoxGeometry(0.4, 1.2, 0.4),
        body: new THREE.BoxGeometry(1.2, 1.5, 0.8),
        leg: new THREE.BoxGeometry(0.5, 1.2, 0.5),
        crystal: new THREE.ConeGeometry(0.1, 0.3, 4),
        eyeMat: new THREE.MeshBasicMaterial({ color: 0xFF0000 }),
        crystalMat: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 }),
        crystalMatSolid: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 1.0 }),
    };
    return SHARED;
}

const SKIN = 0x6DA36D, SHIRT = 0x5D4037, PANTS = 0x212121;
const ICE = new THREE.Color(0xaaddff);
const _v = new THREE.Vector3();
const _partVel = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

export const ZOMBIE_GROUND_OFFSET = 1.0; // original y=0.5 with ground at -0.5
export const CORPSE_LIFETIME = 25;

export class Zombie {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} startPos
     * @param {number|string} id
     * @param {object} ctx  {fx, sound}
     */
    constructor(scene, startPos, id, ctx = {}) {
        this.scene = scene;
        this.id = id;
        this.ctx = ctx;
        this.group = new THREE.Group();
        this.group.position.set(startPos.x, 0.5, startPos.z);
        this.group.scale.set(1, 1.12, 1);

        this.baseSpeed = 3.5;
        this.speed = this.baseSpeed;
        this.health = 5;
        this.isDead = false;
        this.isDying = false;
        this.velocity = new THREE.Vector3();
        this.vy = 0; // vertical speed (thrown by explosions, stepping off ledges)
        this.rotVelocity = new THREE.Vector3();
        this.bodyParts = [];
        this.materials = [];
        this.createBody();
        scene.add(this.group);

        this.damageCooldown = 0;
        this.hitFlashTimer = 0;
        this.walkCycle = 0;
        this.isSleeping = false;
        this.isFrozen = false;
        this.frozenTimer = 0;
        this.freezeProgress = 0;
        this.isStunned = false;
        this.stunTimer = 0;
        this.iceCrystals = new THREE.Group();
        this.group.add(this.iceCrystals);
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.attackAnimProgress = 0;
        this.animVariation = Math.random() * 10;
        this.lastDistSq = Infinity;
        this.corpseTimer = 0;
        this.removable = false;
        this._skipAccum = 0;
        this.remote = false; // true on multiplayer clients (host simulates)
        this.limbMask = 0; // bit 0 head, 1 lArm, 2 rArm, 3 lLeg, 4 rLeg (severed)
    }

    _mat(color) {
        const m = new THREE.MeshLambertMaterial({ color });
        m.userData.origColor = color;
        this.materials.push(m);
        return m;
    }

    createBody() {
        const g = shared();
        this.head = new THREE.Mesh(g.head, this._mat(SKIN));
        this.head.position.y = 2.1;
        this.group.add(this.head);
        this.bodyParts.push(this.head);

        const leftEye = new THREE.Mesh(g.eye, g.eyeMat);
        leftEye.position.set(-0.25, 0.1, 0.6);
        this.head.add(leftEye);
        const rightEye = new THREE.Mesh(g.eye, g.eyeMat);
        rightEye.position.set(0.25, 0.1, 0.6);
        this.head.add(rightEye);
        this.eyes = [leftEye, rightEye];

        const shirt = this._mat(SHIRT);
        this.leftArm = new THREE.Mesh(g.arm, shirt);
        this.leftArm.position.set(-0.7, 1.4, 0.5);
        this.leftArm.rotation.x = -Math.PI / 2;
        this.group.add(this.leftArm);
        this.bodyParts.push(this.leftArm);
        this.rightArm = new THREE.Mesh(g.arm, shirt);
        this.rightArm.position.set(0.7, 1.4, 0.5);
        this.rightArm.rotation.x = -Math.PI / 2;
        this.group.add(this.rightArm);
        this.bodyParts.push(this.rightArm);

        this.body = new THREE.Mesh(g.body, shirt);
        this.body.position.y = 0.75;
        this.group.add(this.body);
        this.bodyParts.push(this.body);

        const pants = this._mat(PANTS);
        this.leftLeg = new THREE.Mesh(g.leg, pants);
        this.leftLeg.position.set(-0.3, 0, 0);
        this.group.add(this.leftLeg);
        this.bodyParts.push(this.leftLeg);
        this.rightLeg = new THREE.Mesh(g.leg, pants);
        this.rightLeg.position.set(0.3, 0, 0);
        this.group.add(this.rightLeg);
        this.bodyParts.push(this.rightLeg);
    }

    setSleeping(sleeping) { this.isSleeping = sleeping; }

    _setColor(hex) {
        for (const m of this.materials) m.color.setHex(hex);
    }

    _restoreColor() {
        for (const m of this.materials) {
            _c.setHex(m.userData.origColor);
            if (this.freezeProgress > 0) _c.lerp(ICE, Math.min(1, this.freezeProgress));
            m.color.copy(_c);
        }
    }

    /**
     * @param {number} dt
     * @param {THREE.Vector3|null} targetPos  nearest player position
     * @param {THREE.Camera|null} camera
     * @param {CollisionWorld|null} collision
     */
    update(dt, targetPos, camera, collision) {
        const pos = this.group.position;
        this.lastDistSq = targetPos ? pos.distanceToSquared(targetPos) : Infinity;
        const ground = collision ? collision.groundY(pos.x, pos.z) : -0.5;

        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        this._spinHalo(dt);
        // Blown by «Вайнд»: slides away, slowing down (also when stunned or frozen)
        if (this.windVel && !this.isDead && !this.isDying) {
            pos.addScaledVector(this.windVel, dt);
            this.windVel.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
            if (this.windVel.lengthSq() < 0.05) this.windVel = null;
            // carried by the wind: can't walk until it calms down
            else if (this.windVel.lengthSq() > 2.25) { this._settleY(dt, ground); return; }
        }
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }

        if (this.isDying) {
            this.deathAnimTimer -= dt;
            const targetRot = -Math.PI / 2;
            this.group.rotation.x += (targetRot - this.group.rotation.x) * 5 * dt;
            const restY = ground + 0.8;
            if (pos.y > restY) {
                this.vy -= 25 * dt;
                pos.y = Math.max(restY, pos.y + Math.min(this.vy, -2) * dt);
            } else { pos.y = restY; this.vy = 0; }
            pos.addScaledVector(this.velocity, dt);
            this.velocity.multiplyScalar(0.95);
            if (this.deathAnimTimer <= 0) {
                this.isDying = false;
                this.group.rotation.x = targetRot;
                pos.y = restY;
            }
            return;
        }

        if (this.isDead) {
            // Corpse: lie for a while, then sink into the ground and get removed.
            if (!this.group.visible) { this.removable = this.corpseTimer > 6; this.corpseTimer += dt; return; }
            this.corpseTimer += dt;
            if (this.corpseTimer > CORPSE_LIFETIME) {
                pos.y -= dt * 0.6;
                if (this.corpseTimer > CORPSE_LIFETIME + 4) this.removable = true;
            }
            return;
        }

        if (this.isFrozen) {
            this.frozenTimer -= dt;
            if (this.frozenTimer <= 0) this.unfreeze();
            return;
        }
        // «Остолбеней»: stands still
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            if (pos.y > ground + 1.0 + 0.01) { this.vy = (this.vy || 0) - 25 * dt; pos.y = Math.max(ground + 1.0, pos.y + this.vy * dt); }
            return;
        }

        if (this.isSleeping) {
            if (targetPos && Math.sqrt(this.lastDistSq) < 15) this.isSleeping = false;
            else return;
        }

        // Far zombies think less often (original optimisation, now time-correct)
        if (this.lastDistSq > 1600) {
            this._skipAccum += dt;
            if (this._skipAccum < 0.08) return;
            dt = Math.min(0.2, this._skipAccum);
        }
        this._skipAccum = 0;

        if (this.isStunned) {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) {
                this.isStunned = false;
            } else {
                this.head.rotation.y += dt * 15;
                this.head.rotation.z = Math.sin(performance.now() * 0.01) * 0.3;
                this.leftLeg.rotation.x *= 0.9;
                this.rightLeg.rotation.x *= 0.9;
                this.leftArm.rotation.x *= 0.9;
                this.rightArm.rotation.x *= 0.9;
                pos.addScaledVector(this.velocity, dt);
                this.velocity.multiplyScalar(0.9);
                this._settleY(dt, ground);
                return;
            }
        }

        pos.addScaledVector(this.velocity, dt);
        this.velocity.multiplyScalar(0.9);
        this._settleY(dt, ground);

        this.group.rotation.z += this.rotVelocity.z * dt;
        this.group.rotation.x += this.rotVelocity.x * dt;
        this.rotVelocity.multiplyScalar(0.9);
        if (this.velocity.lengthSq() < 0.01) {
            this.group.rotation.z *= 0.9;
            this.group.rotation.x *= 0.9;
            this.head.rotation.x *= 0.9;
            this.body.rotation.x *= 0.9;
        }

        if (targetPos && this.velocity.lengthSq() < 0.25) {
            _v.subVectors(targetPos, pos);
            _v.y = 0;
            const distance = _v.length();
            if (Number.isFinite(distance)) {
                if (distance > 1.8) {
                    if (distance > 0.1) _v.divideScalar(distance);
                    pos.addScaledVector(_v, this.speed * dt);
                    this.group.lookAt(targetPos.x, pos.y, targetPos.z);
                    this.group.rotation.x = 0;
                    this.group.rotation.z = 0;
                    this.walkCycle += dt * 10;
                    this._animateWalk();
                } else {
                    this.leftLeg.rotation.x *= 0.9;
                    this.rightLeg.rotation.x *= 0.9;
                }
            }
        }

        // Hide the head when it would clip through the FPV camera
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            if (close && this.head.visible) { this.head.visible = false; this.wasHeadHiddenByCamera = true; }
            else if (!close && this.wasHeadHiddenByCamera) { this.head.visible = !(this.limbMask & 1); this.wasHeadHiddenByCamera = false; }
        }

        if (this.isAttacking) this._animateAttack(dt, targetPos);
    }

    /** Stand on the ground, or fly/fall with gravity when thrown or stepping off a ledge. */
    _settleY(dt, ground) {
        const pos = this.group.position;
        const floor = ground + ZOMBIE_GROUND_OFFSET;
        if (this.vy !== 0 || pos.y > floor + 0.05) {
            this.vy -= 25 * dt;
            pos.y += this.vy * dt;
            if (pos.y <= floor) { pos.y = floor; this.vy = 0; }
        } else {
            pos.y = floor;
        }
    }

    _animateWalk() {
        const swing = Math.sin(this.walkCycle + this.animVariation) * 0.5;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        this.leftArm.rotation.x = -Math.PI / 2 + Math.sin(this.walkCycle * 0.8) * 0.2;
        this.rightArm.rotation.x = -Math.PI / 2 + Math.cos(this.walkCycle * 0.8) * 0.2;
        this.head.rotation.y = Math.sin(this.walkCycle * 0.5) * 0.1;
    }

    _animateAttack(dt, targetPos) {
        this.attackAnimProgress += dt * 5;
        if (this.attackAnimProgress > 1.0) {
            this.isAttacking = false;
            this.attackAnimProgress = 0;
        }
        const lunge = Math.sin(this.attackAnimProgress * Math.PI);
        const close = targetPos && this.group.position.distanceTo(targetPos) < 1.5;
        this.group.translateZ(lunge * (close ? 0.05 : 0.15));
        this.head.rotation.x = lunge * 0.5;
        this.leftArm.rotation.x = -Math.PI / 2 - lunge;
        this.rightArm.rotation.x = -Math.PI / 2 - lunge;
    }

    triggerAttack() {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.attackAnimProgress = 0;
    }

    /**
     * @param {number} amount
     * @param {boolean} isWeapon
     * @param {THREE.Vector3} [hitDir]  direction of the blow (physical knockback)
     * @param {function} [rand]  random source (host passes Math.random; events are replicated)
     * @returns {object} what happened (for network replication)
     */
    /**
     * @param {object} [hit] where a blade hit: {y: height above the zombie's origin,
     *   side: -1 left / +1 right, speed: m/s} — that part is cut off and flies along the blow
     */
    takeDamage(amount, isWeapon, hitDir = null, rand = Math.random, hit = null) {
        const result = { severed: -1, decap: false, died: false, shattered: false };
        if (this.isDead) return result;
        if (this.isFrozen) {
            this.shatter();
            result.shattered = true;
            return result;
        }
        this.health -= amount;
        this.damageCooldown = 0.4;
        this.isAttacking = false;
        this.attackAnimProgress = 0;
        this.isSleeping = false;

        this.hitFlashTimer = 0.15;
        this._setColor(0xff0000);

        if (isWeapon && hit) {
            // The part the blade went through; a faster swing cuts more surely
            const vel = _partVel.set(0, 0, 0);
            if (hitDir) vel.set(hitDir.x, 0, hitDir.z).normalize().multiplyScalar(4 + hit.speed * 0.9);
            vel.y = 5 + hit.speed * 0.4;
            const chance = Math.min(1, Math.max(0.15, (hit.speed - 4) / 8));
            if (hit.y > 1.8) {
                if (rand() < chance || this.health <= 0) { this.decapitate(vel); result.decap = true; this.health = Math.min(this.health, 0); }
            } else if (rand() < chance) {
                const right = hit.side > 0;
                const bit = hit.y > 0.95 ? (right ? 4 : 2) : (right ? 16 : 8);
                result.severed = this.severLimb(rand, (this.limbMask & bit) ? -1 : bit, vel);
            }
            if (this.health <= 0 && !result.decap) { this.decapitate(vel); result.decap = true; }
        } else if (isWeapon) {
            if (this.health <= 0) {
                this.decapitate();
                result.decap = true;
            } else if (rand() > 0.5) {
                result.severed = this.severLimb(rand);
            }
        }

        // Knockback: backwards from facing (original), or along the physical blow.
        if (hitDir) _v.set(hitDir.x, 0, hitDir.z).normalize();
        else _v.set(0, 0, -1).applyQuaternion(this.group.quaternion);
        this.velocity.addScaledVector(_v, 3.9);
        this.isStunned = true;
        this.stunTimer = 1.0;
        this.rotVelocity.z = (rand() - 0.5) * 10;
        this.rotVelocity.x = -(rand() * 5);
        if (this.head.visible) this.head.rotation.x = -Math.PI / 4;
        this.body.rotation.x = -Math.PI / 6;

        if (this.health <= 0) {
            this.velocity.addScaledVector(_v, isWeapon ? 8.0 : 5.0);
            this.die();
            result.died = true;
        }
        return result;
    }

    decapitate(vel = null) {
        if (this.limbMask & 1) return;
        this.limbMask |= 1;
        this.head.visible = false;
        this._spawnPart('head', vel);
        this._blood(2.1, 15);
    }

    severLimb(rand = Math.random, forced = -1, vel = null) {
        const limbs = [
            { bit: 2, part: this.leftArm, y: 1.4, type: 'arm' },
            { bit: 4, part: this.rightArm, y: 1.4, type: 'arm' },
            { bit: 8, part: this.leftLeg, y: 0.5, type: 'leg' },
            { bit: 16, part: this.rightLeg, y: 0.5, type: 'leg' },
        ];
        const alive = limbs.filter((l) => !(this.limbMask & l.bit));
        if (alive.length === 0) return -1;
        const chosen = forced >= 0 ? limbs.find((l) => l.bit === forced) : alive[Math.floor(rand() * alive.length)];
        if (!chosen || (this.limbMask & chosen.bit)) return -1;
        this.limbMask |= chosen.bit;
        chosen.part.visible = false;
        this._spawnPart(chosen.type, vel);
        if (chosen.type === 'leg') this.speed = Math.max(0.5, this.speed - 1.0);
        this._blood(chosen.y, 8);
        return chosen.bit;
    }

    _spawnPart(type, vel = null) {
        const fx = this.ctx.fx;
        if (!fx) return;
        const startY = type === 'head' ? 2.1 : type === 'arm' ? 1.4 : 0.5;
        fx.flyingPart(type, this.group.position.x, this.group.position.y + startY, this.group.position.z, vel);
    }

    _blood(localY, count) {
        const fx = this.ctx.fx;
        if (!fx) return;
        _v.set(0, localY, 0);
        this.group.localToWorld(_v);
        fx.blood(_v, count);
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.isDying = true;
        this.deathAnimTimer = 0.6;
        this.isAttacking = false;
        this.isStunned = false;
        this.corpseTimer = 0;
        if (this.ctx.sound) this.ctx.sound.playDeath(this.group.position);
    }

    turnToSand() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.sandBurst(this.group.position);
    }

    applyChill(amount) {
        if (this.isDead || this.isFrozen) return;
        this.freezeProgress = (this.freezeProgress || 0) + amount;
        this.speed = Math.max(0, this.baseSpeed * (1.0 - this.freezeProgress));
        if (this.hitFlashTimer <= 0) this._restoreColor();
        if (Math.random() < amount * 10) this.spawnIceCrystalOnBody();
        const s = 0.5 + this.freezeProgress;
        for (const c of this.iceCrystals.children) c.scale.lerp(_v.set(s, s, s), 0.1);
        if (this.freezeProgress >= 1.0) this.freeze();
    }

    spawnIceCrystalOnBody() {
        const g = shared();
        const mesh = new THREE.Mesh(g.crystal, g.crystalMat);
        const angle = Math.random() * Math.PI * 2;
        const height = Math.random() * 2.0;
        mesh.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
        mesh.lookAt(_v.set(0, height, 0));
        mesh.rotateX(-Math.PI / 2);
        mesh.rotation.x += (Math.random() - 0.5);
        mesh.scale.set(0.1, 0.1, 0.1);
        this.iceCrystals.add(mesh);
    }

    freeze() {
        if (this.isFrozen || this.isDead) return;
        this.isFrozen = true;
        this.frozenTimer = 120;
        const g = shared();
        for (const c of this.iceCrystals.children) c.material = g.crystalMatSolid;
    }

    unfreeze() {
        this.isFrozen = false;
        this.freezeProgress = 0;
        this.speed = this.baseSpeed;
        this.iceCrystals.clear();
        this._restoreColor();
    }

    shatter() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.iceShatter(this.group.position);
        if (this.ctx.sound) this.ctx.sound.playFrozenHit();
    }

    // ------------------------------------------------------------- «Брейнрот»
    /** Under a wizard's spell: violet eyes and a hypnotic ring turning over the head. */
    setThrall(on) {
        if (!!on === !!this.isThrall) return;
        this.isThrall = !!on;
        const g = shared();
        if (!g.thrallEye) g.thrallEye = new THREE.MeshBasicMaterial({ color: 0xd65bff });
        for (const e of this.eyes || []) e.material = on ? g.thrallEye : g.eyeMat;
        if (on && !this.halo) {
            if (!g.haloGeo) g.haloGeo = new THREE.TorusGeometry(0.55, 0.07, 6, 28);
            if (!g.haloMat) g.haloMat = new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
            this.halo = new THREE.Mesh(g.haloGeo, g.haloMat);
            this.halo.position.y = 3.0;
            this.halo.rotation.x = Math.PI / 2;
            this.group.add(this.halo);
        }
        if (this.halo) this.halo.visible = !!on;
    }

    _spinHalo(dt) {
        if (!this.halo || !this.halo.visible) return;
        this.halo.rotation.z += dt * 3;
        this.halo.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.12);
    }

    // ------------------------------------------------------------- networking
    serialize() {
        const p = this.group.position;
        const r = (v) => Math.round(v * 100) / 100;
        let flags = 0;
        if (this.isDead) flags |= 1;
        if (this.isFrozen) flags |= 2;
        if (this.isStunned) flags |= 4;
        if (this.isSleeping) flags |= 8;
        if (this.isAttacking) flags |= 16;
        if (!this.group.visible) flags |= 32;
        if (this.isThrall) flags |= 64;
        return [this.id, r(p.x), r(p.y), r(p.z), r(this.group.rotation.y), flags, this.limbMask, r(this.freezeProgress), r(this.group.rotation.x)];
    }

    /** Client side: apply host snapshot (positions are interpolated by the caller). */
    applySnapshot(s) {
        const flags = s[5];
        const wasDead = this.isDead;
        this.isDead = !!(flags & 1);
        this.isStunned = !!(flags & 4);
        this.isSleeping = !!(flags & 8);
        if ((flags & 16) && !this.isAttacking) this.triggerAttack();
        if ((flags & 32) && this.group.visible) this.group.visible = false;
        this.setThrall(!!(flags & 64));
        const frozen = !!(flags & 2);
        if (frozen && !this.isFrozen) { this.freezeProgress = 1; this.freeze(); this._restoreColor(); }
        else if (!frozen && this.isFrozen) this.unfreeze();
        else if (!frozen && Math.abs(s[7] - this.freezeProgress) > 0.05) { this.freezeProgress = s[7]; this._restoreColor(); }
        if (this.isDead && !wasDead) this.corpseTimer = 0;
        this.netTarget = this.netTarget || new THREE.Vector3();
        this.netTarget.set(s[1], s[2], s[3]);
        this.netRotY = s[4];
        this.netRotX = s[8] || 0;
    }

    /** Client-side visual update: interpolate towards host state and animate. */
    updateRemote(dt, camera) {
        this._spinHalo(dt);
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }
        if (!this.netTarget) return;
        const pos = this.group.position;
        const k = Math.min(1, dt * 12);
        const moved = Math.hypot(this.netTarget.x - pos.x, this.netTarget.z - pos.z);
        if (moved > 8) pos.copy(this.netTarget); else pos.lerp(this.netTarget, k);
        let dRot = this.netRotY - this.group.rotation.y;
        while (dRot > Math.PI) dRot -= Math.PI * 2;
        while (dRot < -Math.PI) dRot += Math.PI * 2;
        this.group.rotation.y += dRot * k;
        this.group.rotation.x += (this.netRotX - this.group.rotation.x) * k;
        if (this.isDead || this.isFrozen) return;
        if (this.isStunned) { this.head.rotation.y += dt * 15; return; }
        if (moved > 0.02) { this.walkCycle += dt * 10; this._animateWalk(); }
        if (this.isAttacking) this._animateAttack(dt, null);
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            this.head.visible = !close && !(this.limbMask & 1);
        }
    }

    dispose() {
        this.scene.remove(this.group);
        for (const m of this.materials) m.dispose();
        this.iceCrystals.clear();
    }
}
