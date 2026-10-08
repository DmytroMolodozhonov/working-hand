/**
 * Game.js — one play session (creative, survival, custom map or camera test).
 *
 * Owns the scene and every system, runs the frame loop and, in multiplayer,
 * talks to the other players through NetSync. Gameplay rules are the original
 * ones from main.js; see the README for the list of fixes.
 */

import * as THREE from 'three';
import { VoxelWorld, MAP_CELL } from '../world/World.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { Zombie } from '../entities/Zombie.js';
import { Chest } from '../entities/Chest.js';
import { Effects } from '../fx/Effects.js';
import { SpellManager, matchSpell } from '../fx/SpellManager.js';
import { WeaponSystem } from './Weapons.js';
import { NetSync } from '../net/NetSync.js';
import { hashString } from '../core/math.js';
import { BLOCK } from '../world/Terrain.js';

const SPELL_COOLDOWN = 1000;
const PLAYER_RADIUS = 0.48;
const ZOMBIE_RADIUS = 0.88;
const BLOCK_COLORS = { [BLOCK.GRASS]: 0x4CAF50, [BLOCK.DIRT]: 0x7a5230, [BLOCK.STONE]: 0x8a8a8a, [BLOCK.SNOW]: 0xf2f6f8 };

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Game {
    /**
     * @param {object} deps {renderer, camera, poseService, voice, sound, hud, net, ui}
     */
    constructor(deps) {
        Object.assign(this, deps);
        this.active = false;
        this.currentPose = null;
        this.firstPoseReceived = false;
        this.zombies = [];
        this.zombieById = new Map();
        this.chests = [];
        this.remotes = new Map();
        this.nextZombieId = 1;
        this.playerHP = 20;
        this.maxHP = 20;
        this.killCount = 0;
        this.punchCount = 0;
        this.playerAttackCooldown = 0;
        this.lastSpawnTime = 0;
        this.isMagicActive = false;
        this.magicHand = null;
        this.lastMagicTime = 0;
        this.lastSpellCastTime = 0;
        this.cameraBaseRotation = 0;
        this.smoothHead = { yaw: 0, pitch: 0 };
        this.smoothBody = 0;
        this.knockback = new THREE.Vector3();
        this.frameCount = 0;
        this.fpsAccum = 0;
        this.fpsFrames = 0;
        this.lastTime = performance.now();
        this.lastRender = 0;
        this.explosions = []; // world edits (for late joiners)
        this.cameraOffset = new THREE.Vector3(0, 4, 10);
        this.settings = { smoothness: 0.3, sensitivity: 1.0, drifting: true };
        this._raf = 0;
        this.stats = { frameMs: 0, worstFrameMs: 0, frames: 0, longFrames: 0 };
    }

    now() {
        return performance.now();
    }

    get authority() {
        return !this.net || !this.net.active || this.net.isHost;
    }

    get localId() {
        return this.net && this.net.active ? this.net.localId : 'local';
    }

    // =================================================================== setup
    /**
     * @param {object} config  {mode, map, zombieCount, fpsLimit, cameraMode, showHands, handVersion, handQuality, seed}
     * @param {function} progress  (percent, text)
     */
    async init(config, progress = () => {}) {
        this.config = config;
        this.cameraMode = config.cameraMode || 'fpv';
        this.seed = config.seed ?? (config.map ? hashString(config.map.name || 'map') : (Math.random() * 1e9) >>> 0);
        this.config.seed = this.seed;

        progress(62, 'Создание мира...');
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 80);
        this.scene.add(this.camera);

        const isTest = config.mode === 'test';
        this.world = new VoxelWorld(this.scene, {
            seed: this.seed,
            mountains: config.mode === 'creative' && !config.map,
            map: config.map || null,
        });
        this.world.setNightMode(config.mode === 'survival' && !isTest);
        this.collision = this.world.collision;
        this.terrain = this.world.terrain;
        this.hud.setTerrain(this.terrain);

        this.fx = new Effects(this.scene, this.collision);
        this.spells = new SpellManager(this.scene, this.fx, {
            zombies: () => this.zombies,
            authoritative: () => this.authority,
            damage: (z, amount, isWeapon, dir) => this.damageZombie(z, amount, isWeapon, dir, null),
            sand: (z) => this.sandZombie(z),
            chill: (z, amt) => z.applyChill(amt),
            explode: (p, r, casterId) => this.explode(p, r, casterId),
            handPose: (casterId, side) => this.handPose(casterId, side),
            collision: this.collision,
            terrain: () => this.terrain,
        });
        if (this.sound) {
            this.sound.setScene(this.scene);
            this.spells.setSoundManager(this.sound);
        }

        // Player
        this.character = new VoxelCharacter(this.scene);
        this.character.setHandVersion(config.handVersion || 'v3');
        this.character.setHandQuality(config.handQuality || 'high');
        this.character.setFirstPerson(this.cameraMode === 'fpv' && !isTest);
        this.character.setShowHands(!!config.showHands);
        if (isTest) this.character.group.position.set(10, 1.5, 10);

        this.weapons = new WeaponSystem(this);
        this.weapons.onHit = (z, dmg, dir, isWeapon) => this.onLocalHit(z, dmg, dir, isWeapon);

        // Flashlight: always present (intensity 0 when off) so toggling never recompiles shaders.
        this.flashlight = new THREE.SpotLight(0xffffff, 0);
        this.flashlight.angle = Math.PI / 3;
        this.flashlight.penumbra = 1.0;
        this.flashlight.decay = 2;
        this.flashlight.distance = 60;
        this.flashlight.castShadow = config.mode === 'survival';
        this.flashlight.shadow.bias = -0.0001;
        this.flashlight.shadow.mapSize.set(1024, 1024);
        this.camera.add(this.flashlight);
        this.flashlight.target.position.set(0, 0, -5);
        this.camera.add(this.flashlight.target);
        if (config.mode === 'survival') this.flashlight.intensity = 2;

        this.maxHP = 20;
        this.playerHP = this.maxHP;

        progress(66, 'Расстановка объектов...');
        if (!isTest) this._populate(config);

        this.net && this.net.active ? (this.sync = new NetSync(this, this.net)) : (this.sync = null);

        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.hud.setHpVisible(config.mode !== 'creative');
        this.hud.setMultiplayer(null);
    }

    _populate(config) {
        this.lastSpawnTime = performance.now();
        if (config.map) {
            const r = this.world.mapResult;
            if (r.playerSpawn) this.character.group.position.copy(r.playerSpawn);
            this.winPoint = r.winPoint;
            // Zombies and chests: the host (or single player) owns them
            if (this.authority) {
                for (const pos of r.zombieSpawns) {
                    const z = this._createZombie(pos);
                    z.setSleeping(true);
                }
            }
            r.chests.forEach((c, i) => {
                const pos = c.position.clone();
                pos.y = 0;
                const chest = new Chest(this.scene, pos, c.item, c.facing, i);
                chest.mesh.updateMatrixWorld(true);
                chest.boxId = this.collision.addBox(chest.getCollisionBox());
                this.chests.push(chest);
            });
        } else {
            if (this.authority) {
                const n = config.mode === 'creative' ? (config.zombieCount || 0) : 1;
                for (let i = 0; i < n; i++) this.spawnZombieWave();
            }
            // Tables with an axe and a sword (same places as before)
            const tableZ = -5.0;
            const s1 = this.world.createTable(-7, tableZ);
            this.weapons.spawnLying('axe', -7, s1, tableZ, Math.PI / 4, 'tA');
            const s2 = this.world.createTable(7, tableZ);
            this.weapons.spawnLying('sword', 7, s2, tableZ, -Math.PI / 4, 'tS');
        }
    }

    // ================================================================ zombies
    _createZombie(pos, id = null) {
        const zid = id ?? this.nextZombieId++;
        const z = new Zombie(this.scene, pos, zid, { fx: this.fx, sound: this.sound });
        this.zombies.push(z);
        this.zombieById.set(zid, z);
        return z;
    }

    /** Original frontal spawn: 50–80 m ahead of the player within ±45°. */
    spawnZombieWave() {
        const ch = this.character;
        const angle = ch.group.rotation.y + Math.PI + (Math.random() - 0.5) * (Math.PI / 2);
        const dist = 50 + Math.random() * 30;
        let x = ch.group.position.x + Math.sin(angle) * dist;
        let z = ch.group.position.z + Math.cos(angle) * dist;
        // Keep inside the world and out of mountains
        x = Math.max(-115, Math.min(115, x));
        z = Math.max(-115, Math.min(115, z));
        if (this.terrain) {
            for (let i = 0; i < 12 && this.terrain.topLayer(Math.round(x), Math.round(z)) > 1; i++) {
                x *= 0.85; z *= 0.85;
            }
        }
        return this._createZombie(new THREE.Vector3(x, 0.5, z));
    }

    removeZombie(z) {
        const i = this.zombies.indexOf(z);
        if (i >= 0) this.zombies.splice(i, 1);
        this.zombieById.delete(z.id);
        z.dispose();
    }

    /** Authoritative damage. `by` = player id that dealt it (for kill counting). */
    damageZombie(z, amount, isWeapon, dir, by) {
        if (z.isDead) return null;
        const res = z.takeDamage(amount, isWeapon, dir);
        if (this.sound) {
            if (res.shattered) { /* zombie plays the shatter sound */ } else this.sound.playHit();
        }
        if (this.sync) this.sync.zombieHit(z, res, by);
        if (res.died && (by === this.localId || by === 'local')) this.killCount++;
        return res;
    }

    sandZombie(z) {
        if (z.isDead) return;
        z.turnToSand();
        if (this.sync) this.sync.zombieSand(z);
    }

    /** The local player's weapon/fist hit something. */
    onLocalHit(z, dmg, dir, isWeapon) {
        this.punchCount++;
        if (this.authority) {
            this.damageZombie(z, dmg, isWeapon, dir, this.localId);
        } else {
            // Immediate feedback, the host decides the outcome
            z.hitFlashTimer = 0.15;
            z._setColor(0xff0000);
            if (this.sound) z.isFrozen ? this.sound.playFrozenHit() : this.sound.playHit();
            this.sync.sendHit(z, dmg, dir, isWeapon);
        }
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
    }

    // ============================================================== explosion
    /** Authoritative explosion (Bombardo): destroys world + damages + replicates. */
    explode(pos, radius, casterId) {
        this.applyExplosion(pos, radius, true);
        this.explosions.push({ p: [pos.x, pos.y, pos.z], r: radius });
        if (this.sync) this.sync.explosion(pos, radius);
    }

    /** Visual + world part of an explosion (runs on every machine). */
    applyExplosion(pos, radius, authoritative) {
        const out = this.world.explode(pos, radius);
        const debris = [];
        for (const b of out.blocks) debris.push({ x: b.x, y: b.y, z: b.z, color: BLOCK_COLORS[b.type] ?? 0x7a5230 });
        for (const p of out.props) debris.push(p);
        this.fx.explosion(pos, radius);
        this.fx.debrisFrom(debris, pos);
        if (this.sound) this.sound.playExplosion(pos, this.character.group.position);

        // Weapons nearby wake up and get thrown
        for (const w of this.weapons.weapons) {
            const d = w.position.distanceTo(pos);
            if (d > radius + 5 || w.holder) continue;
            w.hover = null;
            w.wake();
            _v1.subVectors(w.position, pos).setY(0).normalize().multiplyScalar(Math.max(0, 14 - d * 2));
            _v1.y += Math.max(0, 9 - d);
            if (!w.remoteTarget) {
                w.velocity.add(_v1);
                w.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
            }
        }

        // Player knockback + camera shake
        const pp = this.character.group.position;
        const dPlayer = _v2.set(pp.x - pos.x, (pp.y - 1.5) - pos.y, pp.z - pos.z).length();
        this.fx.shake = Math.max(this.fx.shake, Math.max(0, 1.2 - dPlayer / 30));
        if (dPlayer < radius + 3) {
            _v1.set(pp.x - pos.x, 0, pp.z - pos.z).normalize().multiplyScalar((radius + 3 - dPlayer) * 4);
            this.knockback.add(_v1);
        }

        if (authoritative) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const zp = z.group.position;
                const d = _v1.set(zp.x - pos.x, zp.y + 0.5 - pos.y, zp.z - pos.z).length();
                const blast = radius + 3;
                if (d > blast) continue;
                const dmg = Math.max(2, Math.round(8 * (1 - d / blast)));
                const dir = _v2.set(zp.x - pos.x, 0, zp.z - pos.z).normalize().clone();
                this.damageZombie(z, dmg, false, dir, null);
                z.velocity.addScaledVector(dir, 10 * (1 - d / blast));
            }
        }
    }

    // ================================================================= chests
    _updateChests(dt) {
        if (!this.chests.length) return;
        const players = this._playerPositions();
        for (const chest of this.chests) {
            chest.update(dt);
            if (chest.isOpen || !this.authority) continue;
            const cp = chest.getPosition();
            for (const p of players) {
                const dx = p.x - cp.x, dz = p.z - cp.z;
                if (dx * dx + dz * dz < 4.5 * 4.5 + 9) {
                    this.openChest(chest);
                    break;
                }
            }
        }
    }

    openChest(chest, rewardId = null) {
        if (!chest.open()) return;
        if (this.sound) this.sound.playChestOpen(chest.getPosition());
        const id = rewardId || `c${chest.id}`;
        if (this.authority) {
            chest.mesh.updateMatrixWorld(true);
            const pos = chest.getRewardPosition(new THREE.Vector3());
            pos.y += 2.2;
            const w = this.weapons.spawnHovering(chest.itemType, pos, id);
            if (this.sync) this.sync.chestOpened(chest, w);
        }
    }

    // ============================================================== players
    _playerPositions() {
        const list = [this.character.group.position];
        for (const r of this.remotes.values()) list.push(r.position);
        return list;
    }

    /** Nearest player position to a point (zombie AI target). Returns {pos, id}. */
    nearestPlayer(p) {
        let best = this.character.group.position, bestId = this.localId, bestD = p.distanceToSquared(best);
        if (this.isDeadLocal) { best = null; bestD = Infinity; }
        for (const [id, r] of this.remotes) {
            if (r.dead) continue;
            const d = p.distanceToSquared(r.position);
            if (d < bestD) { bestD = d; best = r.position; bestId = id; }
        }
        return best ? { pos: best, id: bestId, distSq: bestD } : null;
    }

    handPose(casterId, side) {
        if (casterId === 'local' || casterId === this.localId) {
            return { origin: this.character.getHandWorldPosition(side), dir: this.character.getHandDirection(side) };
        }
        const r = this.remotes.get(casterId);
        return r ? r.handPose(side) : null;
    }

    damageLocalPlayer(amount) {
        if (this.isDeadLocal || this.config.mode === 'creative') return;
        this.playerHP -= amount;
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.hud.damageFlash();
        if (this.sound) this.sound.playHit();
        if (this.playerHP <= 0) {
            this.isDeadLocal = true;
            this.ui.gameOver(this.killCount, this.punchCount);
            this.stop();
        }
    }

    // ================================================================= spells
    /** Voice command while the hand is raised. Returns the spell name or null. */
    castLocalSpell(text) {
        if (!this.active) return null;
        const recent = this.isMagicActive || Date.now() - this.lastMagicTime < 1500;
        if (!recent) return null;
        const name = matchSpell(text);
        if (!name) return null;
        const now = Date.now();
        if (now - this.lastSpellCastTime < SPELL_COOLDOWN) return null;
        this.lastSpellCastTime = now;
        const side = this.magicHand || this.lastMagicHand || 'right';
        const origin = this.character.getHandWorldPosition(side);
        const dir = this.character.getHandDirection(side);
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        return name;
    }

    /** Debug keys: cast in the camera direction. */
    castDebug(name) {
        const origin = this.character.getHandWorldPosition('right');
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.spells.cast(name, origin, dir, 'right', this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, 'right');
    }

    toggleFlashlight() {
        this.flashlight.intensity = this.flashlight.intensity > 0 ? 0 : (this.config.mode === 'survival' ? 2 : 1.5);
    }

    // =================================================================== loop
    setPose(poseData) {
        this.currentPose = poseData;
        this.firstPoseReceived = true;
    }

    start() {
        this.active = true;
        this.lastTime = performance.now();
        this.renderer.compile(this.scene, this.camera);
        const loop = (t) => {
            if (!this.active) return;
            this._raf = requestAnimationFrame(loop);
            const limit = this.config.fpsLimit || 0;
            if (limit > 0 && t - this.lastRender < 1000 / limit - 1.5) return;
            this.lastRender = t;
            try {
                this.frame();
            } catch (e) {
                // Log and keep running: one bad frame must never kill the session.
                this._errors = (this._errors || 0) + 1;
                console.error('[Game] frame error', e);
                if (this._errors > 120) {
                    this.stop();
                    this.ui.fatal?.(e);
                }
            }
        };
        this._raf = requestAnimationFrame(loop);
    }

    stop() {
        this.active = false;
        cancelAnimationFrame(this._raf);
        if (this.voice) this.voice.stop();
    }

    frame() {
        const t0 = performance.now();
        const deltaTime = (t0 - this.lastTime) / 1000;
        this.lastTime = t0;
        const dt = Math.min(deltaTime, 0.1);
        this.frameCount++;

        // FPS counter (rolling)
        this.fpsAccum += deltaTime;
        this.fpsFrames++;
        if (this.fpsFrames >= 20) {
            this.hud.setFps(Math.round(this.fpsFrames / this.fpsAccum));
            this.fpsAccum = 0;
            this.fpsFrames = 0;
        }

        const isTest = this.config.mode === 'test';
        this._updatePlayer(dt);
        this._updateChests(dt);
        if (!isTest) this._checkVictory();

        this.weapons.update(dt);
        if (this.playerAttackCooldown > 0) this.playerAttackCooldown -= dt;
        this._updateZombies(dt);
        this.weapons.checkHits(this.zombies, dt);

        this.spells.update(dt);
        this._updateMagicGesture();
        if (!isTest) this._spawnWaves();

        for (const r of this.remotes.values()) r.update(dt);
        if (this.sync) this.sync.update(dt);

        this.fx.update(dt);
        this.world.update();
        this._updateCamera(dt);

        if (this.frameCount % 5 === 0) {
            const cp = this.character.group.position;
            const others = [...this.remotes.values()].map((r) => r.position);
            this.hud.drawMinimap(cp, this.character.group.rotation.y, this.world, this.zombies, others);
            if (this.sound && this.sound.loaded) this.sound.updateAmbient(cp, this.zombies, dt * 5);
        }

        this.renderer.render(this.scene, this.camera);

        const ms = performance.now() - t0;
        this.stats.frames++;
        this.stats.frameMs = this.stats.frameMs * 0.95 + ms * 0.05;
        if (ms > this.stats.worstFrameMs) this.stats.worstFrameMs = ms;
        if (ms > 50) this.stats.longFrames++;
    }

    _updatePlayer(dt) {
        const ch = this.character;
        const pose = this.currentPose;
        const s = this.settings;
        if (pose) {
            if (pose.headRotation) {
                const targetYaw = pose.headRotation.yaw * s.sensitivity;
                const targetPitch = pose.headRotation.pitch * s.sensitivity;
                const alpha = pose.isRunning ? Math.min(s.smoothness, 0.1) : s.smoothness;
                this.smoothHead.yaw += (targetYaw - this.smoothHead.yaw) * alpha;
                this.smoothHead.pitch += (targetPitch - this.smoothHead.pitch) * alpha;
                if (s.drifting) {
                    if (Math.abs(this.smoothHead.yaw) > 0.1) this.cameraBaseRotation += this.smoothHead.yaw * 0.1;
                    ch.setBodyRotation(this.cameraBaseRotation);
                    ch.updateHeadRotation(this.smoothHead.yaw, this.smoothHead.pitch);
                } else {
                    ch.updateHeadRotation(this.smoothHead.yaw, this.smoothHead.pitch);
                    if (pose.bodyRotation !== undefined) {
                        this.smoothBody += (pose.bodyRotation - this.smoothBody) * alpha;
                        ch.setBodyRotation(this.smoothBody);
                    }
                }
            }
            ch.updateArmsLookAt(pose);
            ch.setCrouching(pose.isCrouching);
            ch.setRunning(pose.isRunning, pose.runIntensity);
        }
        if (this.config.mode === 'test' && this.testState === 'setup') ch.setRunning(false);

        ch.update(dt, this.collision, true);

        // Explosion knockback (decays)
        if (this.knockback.lengthSq() > 0.0001) {
            ch.group.position.addScaledVector(this.knockback, dt);
            this.knockback.multiplyScalar(Math.max(0, 1 - 4 * dt));
        }

        // Collisions: walls, tables, chests, trunks, mountains
        const feet = ch.group.position.y - PLAYER_GROUND_OFFSET + (ch.isCrouching ? 1.0 : 0);
        this.collision.resolveCylinder(ch.group.position, PLAYER_RADIUS, feet, 3.5);
        // Stay inside the world
        ch.group.position.x = Math.max(-119, Math.min(119, ch.group.position.x));
        ch.group.position.z = Math.max(-119, Math.min(119, ch.group.position.z));
    }

    _checkVictory() {
        if (!this.winPoint || !this.authority) return;
        for (const [id, p] of [[this.localId, this.character.group.position], ...[...this.remotes].map(([rid, r]) => [rid, r.position])]) {
            const dx = p.x - this.winPoint.x, dz = p.z - this.winPoint.z;
            if (Math.sqrt(dx * dx + dz * dz) < 2.0 + MAP_CELL * 0.3) {
                const score = this.killCount * 100 + this.playerHP * 50;
                if (this.sync) this.sync.victory(id);
                this.victory(score);
                return;
            }
        }
    }

    victory(score) {
        if (!this.active) return;
        this.stop();
        this.ui.victory(score);
    }

    _updateZombies(dt) {
        const ch = this.character;
        const charPos = ch.group.position;
        const pose = this.currentPose;
        const isPunching = !!(pose && pose.isPunching);
        const hasWeapon = this.weapons.hasWeapon();
        const survival = this.config.mode === 'survival' || !!this.config.map;

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            if (!this.authority) {
                z.updateRemote(dt, this.camera);
                if (z.isDead && z.removable) this.removeZombie(z);
                continue;
            }
            const target = this.nearestPlayer(z.group.position);
            z.update(dt, target ? target.pos : null, this.camera, this.collision);
            if (z.removable) { this.removeZombie(z); continue; }
            if (z.isDead || z.isSleeping) continue;

            this.collision.resolveCylinder(z.group.position, ZOMBIE_RADIUS, z.group.position.y - 1.0, 3.5, 1.05);

            // Player–zombie separation (local player)
            const dx = charPos.x - z.group.position.x, dz = charPos.z - z.group.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 1.3 && dist > 1e-4) {
                const overlap = 1.3 - dist;
                charPos.x += (dx / dist) * overlap * 0.6;
                charPos.z += (dz / dist) * overlap * 0.6;
                z.group.position.x -= (dx / dist) * overlap * 0.4;
                z.group.position.z -= (dz / dist) * overlap * 0.4;
            }

            // Fists (original rule: fast wrist + zombie within 3 m, no weapon in hand)
            if (isPunching && !hasWeapon && z.damageCooldown <= 0 && this.playerAttackCooldown <= 0 && dist < 3.0) {
                this.playerAttackCooldown = 0.5;
                const dir = _v1.set(-dx, 0, -dz).normalize().clone();
                this.onLocalHit(z, 1, dir, false);
                if (!z.isDead) z.group.position.addScaledVector(dir, 0.3);
            }

            // Zombie bites (survival / maps)
            if (survival && target && target.distSq < 4.0) {
                const now = Date.now();
                if (now - (z.lastAttackTime || 0) > 1000) {
                    z.lastAttackTime = now;
                    z.triggerAttack();
                    if (target.id === this.localId) this.damageLocalPlayer(1);
                    else if (this.sync) this.sync.bite(target.id);
                }
            }
        }

        // Zombie–zombie separation (throttled)
        if (this.authority && this.frameCount % 4 === 0) {
            const zs = this.zombies;
            for (let i = 0; i < zs.length; i++) {
                const a = zs[i];
                if (a.isDead || a.lastDistSq > 900) continue;
                for (let j = i + 1; j < zs.length; j++) {
                    const b = zs[j];
                    if (b.isDead || b.lastDistSq > 900) continue;
                    const dx = b.group.position.x - a.group.position.x, dz = b.group.position.z - a.group.position.z;
                    if (Math.abs(dx) >= 1.3 || Math.abs(dz) >= 1.3) continue;
                    const dSq = dx * dx + dz * dz;
                    if (dSq >= 1.69) continue;
                    const d = Math.sqrt(dSq) || 0.1;
                    const ov = (1.3 - d) * 0.5;
                    b.group.position.x += (dx / d) * ov; b.group.position.z += (dz / d) * ov;
                    a.group.position.x -= (dx / d) * ov; a.group.position.z -= (dz / d) * ov;
                }
            }
        }
    }

    _spawnWaves() {
        if (!this.authority || this.config.map) return;
        if (this.config.mode === 'creative') {
            const desired = this.config.zombieCount || 0;
            let live = 0;
            for (const z of this.zombies) if (!z.isDead) live++;
            if (live < desired && Math.random() < 0.02) this.spawnZombieWave();
        } else if (this.config.mode === 'survival') {
            let live = 0;
            for (const z of this.zombies) if (!z.isDead) live++;
            if (performance.now() - this.lastSpawnTime > 5000 && live < 20) {
                this.lastSpawnTime = performance.now();
                this.spawnZombieWave();
                this.spawnZombieWave();
            }
        }
    }

    _updateMagicGesture() {
        const loading = this.ui.isLoading && this.ui.isLoading();
        // Only when a person is actually tracked (no "raised hands" from the default pose)
        const tracked = this.currentPose && this.currentPose.hasPose;
        const res = tracked && (this.config.mode !== 'test' || this.testState === 'fpv') ? this.character.isHandRaised() : null;
        if (res && !loading) {
            this.magicHand = res.side;
            this.lastMagicHand = res.side;
            this.lastMagicTime = Date.now();
            const label = res.bothLevel ? 'ОБЕ' : res.side.toUpperCase();
            if (!this.isMagicActive) {
                this.isMagicActive = true;
                this.hud.setVoice(`🎤 <span style="color:#55efc4">ЖДУ КОМАНДУ (${label})</span>`);
                if (this.voice) this.voice.start();
            } else if (!this.hud.voiceText().includes('СЛЫШУ')) {
                this.hud.setVoice(`🎤 <span style="color:#55efc4">ЖДУ КОМАНДУ (${label})</span>`);
            }
        } else if (this.isMagicActive && Date.now() - this.lastMagicTime > 1200) {
            this.isMagicActive = false;
            this.hud.setVoice('', false);
            if (this.voice && !this.ui.isMenuVoiceActive?.()) this.voice.stop();
            this.magicHand = null;
        }
    }

    _updateCamera(dt) {
        const ch = this.character;
        if (this.config.mode === 'test') {
            if (this.testState === 'setup') {
                this.orbit?.update();
                if (this.testMarker) this.testMarker.visible = true;
            } else if (this.testMarker) {
                this.testMarker.visible = false;
                this.testMarker.getWorldPosition(this.camera.position);
                ch.head.getWorldQuaternion(this.camera.quaternion);
            }
        } else if (this.cameraMode === 'fpv') {
            ch.getHeadPosition(this.camera.position);
            ch.getHeadQuaternion(this.camera.quaternion);
        } else {
            _v1.copy(this.cameraOffset).applyAxisAngle(_v2.set(0, 1, 0), ch.group.rotation.y).add(ch.group.position);
            this.camera.position.lerp(_v1, 0.1);
            this.camera.lookAt(_v2.copy(ch.group.position).add(_v1.set(0, 2, 0)));
        }
        if (this.fx.shake > 0) {
            const s = this.fx.shake * 0.25;
            this.camera.position.x += (Math.random() - 0.5) * s;
            this.camera.position.y += (Math.random() - 0.5) * s;
            this.camera.position.z += (Math.random() - 0.5) * s;
        }
        this.camera.updateMatrixWorld(true);
    }

    // ================================================================ cleanup
    dispose() {
        this.stop();
        if (this.sync) this.sync.dispose();
        this.sync = null;
        for (const r of this.remotes.values()) r.dispose();
        this.remotes.clear();
        if (this.camera) {
            if (this.flashlight) { this.camera.remove(this.flashlight); this.camera.remove(this.flashlight.target); }
        }
        if (this.sound) this.sound.stopAll();
        this.weapons?.clear();
        this.scene?.traverse((o) => {
            if (o.isMesh || o.isPoints || o.isInstancedMesh) {
                o.geometry?.dispose?.();
                const m = o.material;
                if (Array.isArray(m)) m.forEach((x) => x.dispose());
                else m?.dispose?.();
            }
        });
        this.scene = null;
    }

    // ============================================================ test hooks
    /** Small read-only snapshot for automated tests. */
    debugState() {
        const p = this.character.group.position;
        return {
            active: this.active,
            mode: this.config.mode,
            player: [p.x, p.y, p.z],
            hp: this.playerHP,
            kills: this.killCount,
            punches: this.punchCount,
            zombies: this.zombies.map((z) => ({ id: z.id, dead: z.isDead, hp: z.health, pos: [z.group.position.x, z.group.position.y, z.group.position.z] })),
            chests: this.chests.map((c) => ({ id: c.id, open: c.isOpen, progress: c.openProgress, rotY: c.mesh.rotation.y, lidX: c.lidGroup.rotation.x })),
            weapons: this.weapons.weapons.map((w) => ({ id: w.id, type: w.type, held: w.holder ? w.holder.side : null, sleeping: w.sleeping, pos: [w.position.x, w.position.y, w.position.z] })),
            remotes: [...this.remotes.entries()].map(([id, r]) => ({ id, name: r.name, pos: [r.position.x, r.position.y, r.position.z] })),
            explosions: this.explosions.length,
            stats: { ...this.stats, fx: { sparks: this.fx.sparks.active, debris: this.fx.debris.active } },
        };
    }
}
