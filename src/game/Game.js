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
import { FlightController } from './Flight.js';
import { PoseSmoother } from '../input/PoseSmoother.js';
import { WaterMagic } from './WaterMagic.js';
import { Combat, PVP } from './Combat.js';
import { Levitation } from './Levitation.js';
import { NetSync } from '../net/NetSync.js';
import { hashString } from '../core/math.js';
import { BLOCK } from '../world/Terrain.js';

const SPELL_COOLDOWN = 1000;
const WATER_COOLDOWN = 600; // ms between water commands («максима» can be repeated)
const BOMBARDO_WAIT = 700; // ms to wait for «…Максима» after an unfinished «Бомбардо»
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
        this.poseSmoother = new PoseSmoother();
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
        this.flight = new FlightController();
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
            mountains: (config.mode === 'creative' || config.mode === 'freeworld') && !config.map,
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
            explode: (p, r, casterId, power) => this.explode(p, r, casterId, power),
            handPose: (casterId, side) => this.handPose(casterId, side),
            players: (casterId) => this._spellPlayers(casterId),
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
        this.water = new WaterMagic(this);
        this.combat = new Combat(this); // Свободный мир: HP, fatigue, shields, freezing
        this.levitation = new Levitation(this); // «Вингардиум Левиоса»
        this.iceCells = []; // ice built with «Water forming» + «Frozen» (sent to late joiners)
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

        if (this.combat.enabled) { this.maxHP = PVP.MAX_HP; this.playerHP = PVP.MAX_HP; } else this.hud.hidePvp();
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
        } else if (config.mode === 'freeworld') {
            // Free world: no tables; players appear around spawn, not on top of each other
            const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
            this.character.group.position.x = Math.cos(a) * d;
            this.character.group.position.z = Math.sin(a) * d;
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
        if (z.isPlayer) { this.combat.hitRemote(z, dmg); return; }
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
    /**
     * Authoritative explosion (Bombardo): destroys world + damages + replicates.
     * @param {number} [power] 1 = Bombardo, 3 = Bombardo Maxima
     */
    explode(pos, radius, casterId, power = 1) {
        this.applyExplosion(pos, radius, true, power, casterId);
        this.explosions.push({ p: [pos.x, pos.y, pos.z], r: radius });
        if (this.sync) this.sync.explosion(pos, radius, power, casterId);
    }

    /** Visual + world part of an explosion (runs on every machine). */
    applyExplosion(pos, radius, authoritative, power = 1, casterId = null) {
        // `power` times the energy: damage × power, thrown objects × √power speed
        const push = Math.sqrt(power);
        const out = this.world.explode(pos, radius);
        const debris = [];
        for (const b of out.blocks) debris.push({ x: b.x, y: b.y, z: b.z, color: BLOCK_COLORS[b.type] ?? 0x7a5230 });
        for (const p of out.props) debris.push(p);
        this.fx.explosion(pos, radius, power);
        this.water.explode(pos, radius);
        this.combat.explosion(pos, radius, power, casterId === 'local' ? this.localId : casterId);
        this.fx.debrisFrom(debris, pos, power > 1 ? 480 : 260);
        if (this.sound) this.sound.playExplosion(pos, this.character.group.position, power);

        // Weapons nearby wake up and get thrown
        for (const w of this.weapons.weapons) {
            const d = w.position.distanceTo(pos);
            if (d > radius + 5 || w.holder) continue;
            w.hover = null;
            w.wake();
            _v1.subVectors(w.position, pos).setY(0).normalize().multiplyScalar(Math.max(0, 14 - d * 2 / push) * push);
            _v1.y += Math.max(0, 9 - d / push) * push;
            if (!w.remoteTarget) {
                w.velocity.add(_v1);
                w.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
            }
        }

        // Player knockback + camera shake
        const pp = this.character.group.position;
        const dPlayer = _v2.set(pp.x - pos.x, (pp.y - 1.5) - pos.y, pp.z - pos.z).length();
        this.fx.shake = Math.max(this.fx.shake, Math.max(0, (power > 1 ? 2 : 1.2) - dPlayer / (power > 1 ? 45 : 30)));
        if (dPlayer < radius + 3) {
            _v1.set(pp.x - pos.x, 0, pp.z - pos.z).normalize().multiplyScalar((radius + 3 - dPlayer) * 4 * push);
            this.knockback.add(_v1);
        }

        if (authoritative) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const zp = z.group.position;
                const d = _v1.set(zp.x - pos.x, zp.y + 0.5 - pos.y, zp.z - pos.z).length();
                const blast = radius + 3;
                if (d > blast) continue;
                const dmg = Math.max(2, Math.round(8 * power * (1 - d / blast)));
                const dir = _v2.set(zp.x - pos.x, 0, zp.z - pos.z).normalize().clone();
                this.damageZombie(z, dmg, false, dir, null);
                // Thrown through the air, not just slid along the ground
                z.velocity.addScaledVector(dir, 12 * push * (1 - d / blast));
                z.vy = Math.max(z.vy || 0, (4 + 10 * (1 - d / blast)) * push);
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
    /**
     * Voice command while the hand is raised. Returns the spell name or null.
     * @param {string} text  what the microphone heard
     * @param {boolean} [isFinal]  false for an unfinished (interim) phrase
     */
    castLocalSpell(text, isFinal = true) {
        if (!this.active) return null;
        let name = matchSpell(text);
        if (!name) return null;
        if (this.combat.dead) return null;
        if (this.combat.frozen) { this.hud.setVoice(this.combat.check(name), true); return null; }
        // Shield: arm stretched out (or a T for Maxima), not raised to the face
        if (name === 'Protection' || name === 'ProtectionMaxima') return this._castProtection(name, isFinal);
        // Levitation: point the hand at the object
        if (name === 'Levitation') return this._castLevitation(isFinal);
        // Water bending: the hand is at the water / holding the ball, not raised to the face
        const waterName = this._waterSpell(name);
        if (waterName) return this._castWater(waterName, text, isFinal);
        if (name === 'Frozen') name = 'Ice';
        if (name === 'Maxima') return null;
        const recent = this.isMagicActive || Date.now() - this.lastMagicTime < 1500;
        // Flight has its own gesture (both arms up) — checked in startFlight
        if (!recent && name !== 'Flight') return null;
        const now = Date.now();
        // «Бомбардо…» heard while the phrase is still going: wait a moment,
        // the player may be saying «Бомбардо Максима».
        if (name === 'Bombardo' && !isFinal) {
            if (!this._pendingBombardo && now - this.lastSpellCastTime >= SPELL_COOLDOWN) {
                this._pendingBombardo = { at: now };
                setTimeout(() => this._updatePendingSpell(), BOMBARDO_WAIT + 5);
            }
            return null;
        }
        // The microphone's final version of a phrase that was already cast
        // from its unfinished version: don't cast it a second time.
        const early = this._interimCast;
        if (isFinal && early && now - early.at < 3000) {
            if (early.name === name) { this._interimCast = null; return null; }
        }
        if (name === 'Bombardo' || name === 'BombardoMaxima') this._pendingBombardo = null;
        if (now - this.lastSpellCastTime < SPELL_COOLDOWN) return null;
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        if (name === 'Flight' && !this.startFlight()) return null;
        this.combat.pay(name);
        this._interimCast = isFinal ? null : { name, at: now };
        this.lastSpellCastTime = now;
        if (name === 'Flight') return name;
        const side = this.magicHand || this.lastMagicHand || 'right';
        const origin = this.character.getHandWorldPosition(side);
        const dir = this.character.getHandDirection(side);
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        return name;
    }

    /** Which voice commands go to the water ball. */
    _waterSpell(name) {
        if (name === 'Waterball' || name === 'WaterForming') return name;
        if (!this.water.active) return null;
        if (name === 'Maxima') return 'Maxima';
        if (name === 'Frozen' || name === 'Ice') return 'Frozen';
        return null;
    }

    _castWater(name, text, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastWaterCast || 0) < WATER_COOLDOWN) return null;
        let hint = this.combat.check(name);
        if (hint) { this.hud.setVoice(hint, true); return null; }
        if (name === 'Waterball') {
            hint = this.water.start();
            // «Waterbollow Максима» in one breath
            if (!hint && /макс|max/i.test(text)) this.water.maxima();
        } else if (name === 'Maxima') hint = this.water.maxima();
        else if (name === 'WaterForming') hint = this.water.form();
        else if (name === 'Frozen') hint = this.water.freeze();
        if (hint) {
            this.hud.setVoice(hint.startsWith('💧') || hint.startsWith('🧊') ? hint : '💧 ' + hint, true);
            this._flightMsgUntil = performance.now() + 2500;
            return null;
        }
        this._lastWaterCast = now;
        this.combat.pay(name);
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    _castProtection(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastShieldCast || 0) < 800) return null;
        const hint = this.combat.castProtection(name === 'ProtectionMaxima');
        if (hint) { this.hud.setVoice(hint, true); return null; }
        this._lastShieldCast = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    _castLevitation(isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === 'Levitation' && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastLevitate || 0) < 900) return null;
        const tired = this.levitation.active ? null : this.combat.check('Levitation');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const wasActive = this.levitation.active;
        const hint = this.levitation.cast();
        if (hint) { this.hud.setVoice(hint, true); return null; }
        if (!wasActive) this.combat.pay('Levitation');
        this._lastLevitate = now;
        this._interimCast = isFinal ? null : { name: 'Levitation', at: now };
        return 'Levitation';
    }

    /** Targets for spells cast by `casterId` (players hit each other only in the free world). */
    _spellPlayers(casterId) {
        const c = this.combat;
        if (!c.enabled) return [];
        const out = [];
        const me = this.localId;
        if (!c.dead && casterId !== 'local' && casterId !== me) {
            out.push({
                local: true,
                id: me,
                center: () => c.center(),
                hit: (kind, from, push) => (kind === 'Bounce' ? c.shieldFactor(from) >= 1 && (c._blocked(from), false) : c.hitBySpell(kind, from, casterId, push)),
                blocks: (from) => c.shieldFactor(from) >= 1,
                chill: (amount, from) => c.chillBy(amount, from, casterId),
            });
        }
        for (const [id, r] of this.remotes) {
            if (id === casterId || r.dead) continue;
            out.push({
                local: false,
                id,
                center: () => r.position.clone().add(_v1.set(0, 0.6, 0)),
                hit: (kind, from) => { if (r.shieldBlocks(from)) r.showBlock(from, this.fx); return true; },
                blocks: (from) => r.shieldBlocks(from),
                chill: () => true,
            });
        }
        return out;
    }

    playerName(id) {
        if (id === this.localId) return this.net?.name || 'Вы';
        return this.remotes.get(id)?.name || null;
    }

    /** My player was killed in the free world: show it, then back to the menu. */
    onLocalDeath(text, byId) {
        if (this.sync) this.sync.died(byId);
        this.hud.setStatus('');
        this.ui.died?.(text);
    }

    /** Frozen water shapes become part of the world (and are synced). */
    placeIce(blobs) {
        const r3 = (v) => Math.round(v * 100) / 100;
        const list = blobs.map((b) => ({ x: r3(b.x), y: r3(b.y), z: r3(b.z), r: r3(b.r) }));
        this.applyIce(list);
        if (this.sync) this.sync.ice(list);
    }

    applyIce(blobs) {
        const t = this.terrain?.data;
        if (!t) return;
        const shapes = blobs.filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.r) && b.r > 0 && b.r < 3);
        for (const b of shapes) {
            // solid inside (can't walk through, can stand on it); drawn as the smooth frozen shape
            for (const [x, L, z] of WaterMagic.cellsOf(b)) {
                const cur = t.get(x, L, z);
                if (cur === BLOCK.AIR || cur === BLOCK.WATER) t.set(x, L, z, BLOCK.ICE_SHAPE);
            }
        }
        this.water.addIceShapes(shapes);
        for (const b of shapes) this.iceCells.push(b);
    }

    /** A «Бомбардо» that was not followed by «Максима» goes off now. */
    _updatePendingSpell() {
        const p = this._pendingBombardo;
        if (!p || !this.active || Date.now() - p.at < BOMBARDO_WAIT) return;
        this._pendingBombardo = null;
        this.lastMagicTime = Date.now(); // the hand was raised when the word started
        if (this.castLocalSpell('бомбардо', true)) {
            // The microphone will still send the finished «бомбардо»: ignore it then
            this._interimCast = { name: 'Bombardo', at: Date.now() };
            this.hud.setVoice('✨ <span style="color:#55efc4">BOMBARDO</span>');
        }
    }

    /** Debug keys: cast in the camera direction. */
    castDebug(name) {
        if (name === 'Flight') { this.flight.active ? this.flight.land('debug') : this.startFlight(true); return; }
        if (this._waterSpell(name)) { this._lastWaterCast = 0; return this._castWater(this._waterSpell(name), '', true); }
        if (name === 'Protection' || name === 'ProtectionMaxima') { this._lastShieldCast = 0; return this._castProtection(name, true); }
        if (name === 'Levitation') { this._lastLevitate = 0; return this._castLevitation(true); }
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
        this.poseSmoother.push(poseData);
        this.currentPose = this.poseSmoother.sample();
        this.firstPoseReceived = true;
    }

    clearPose() {
        this.poseSmoother.reset();
        this.currentPose = null;
    }

    /**
     * Compile every shader the session can ever need NOW (during loading):
     * effects that are hidden until first use would otherwise compile in the
     * middle of a fight and freeze the game for a moment.
     */
    prewarm() {
        const hidden = [];
        this.scene.traverse((o) => {
            if ((o.isMesh || o.isPoints || o.isSprite) && !o.visible) { hidden.push(o); o.visible = true; }
        });
        const savedIntensity = this.flashlight.intensity;
        this.renderer.compile(this.scene, this.camera);
        for (const o of hidden) o.visible = false;
        this.flashlight.intensity = savedIntensity;
        this.prewarmedPrograms = this.renderer.info.programs.length;
    }

    start() {
        this.active = true;
        this.lastTime = performance.now();
        this.prewarm();
        // The microphone listens all game long: shield (arm forward), water
        // (hand towards a river) and flight (arms up) don't raise a hand to
        // the face. Each spell checks its own gesture.
        if (this.voice && this.config.mode !== 'test') this.voice.start();
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
            const ps = this.poseSmoother;
            const aiFps = ps.lastPushAt && t0 - ps.lastPushAt < 1000 ? Math.round(1000 / ps.interval) : 0;
            this.hud.setFps(Math.round(this.fpsFrames / this.fpsAccum), aiFps);
            this.fpsAccum = 0;
            this.fpsFrames = 0;
        }

        const isTest = this.config.mode === 'test';
        this._updatePlayer(dt);
        this._updateChests(dt);
        if (!isTest) this._checkVictory();

        this.levitation.update(dt);
        this.weapons.update(dt);
        this.water.update(dt);
        this.combat.update(dt);
        this.combat.updatePunches(!!(this.currentPose && this.currentPose.isPunching));
        if (this.playerAttackCooldown > 0) this.playerAttackCooldown -= dt;
        this._updateZombies(dt);
        this.weapons.checkHits(this.combat.enabled ? this.zombies.concat(this.combat.meleeTargets()) : this.zombies, dt);

        this.spells.update(dt);
        this._updateMagicGesture();
        this._updatePendingSpell();
        if (!isTest) this._spawnWaves();

        for (const r of this.remotes.values()) r.update(dt);
        if (this.sync) this.sync.update(dt);

        this.fx.update(dt);
        // See further while flying (smoothly), terrain streams in around the player
        this._viewBoost = (this._viewBoost || 0) + ((this.flight.active ? 1 : 0) - (this._viewBoost || 0)) * Math.min(1, dt * 0.8);
        this.world.update(this.character.group.position, this._viewBoost);
        this.world.followShadow(this.character.group.position);
        this._updateCamera(dt);

        if (this.frameCount % 5 === 0) {
            const cp = this.character.group.position;
            const others = [...this.remotes.values()].map((r) => r.position);
            this.hud.drawMinimap(cp, this.character.group.rotation.y, this.world, this.zombies, others);
            if (this.sound && this.sound.loaded) this.sound.updateAmbient(cp, this.zombies, dt * 5);
        }

        const logic = performance.now() - t0;
        this.stats.logicMs = (this.stats.logicMs || logic) * 0.95 + logic * 0.05;
        if (logic > (this.stats.worstLogicMs || 0)) this.stats.worstLogicMs = logic;

        this.renderer.render(this.scene, this.camera);

        const ms = performance.now() - t0;
        this.stats.frames++;
        this.stats.frameMs = this.stats.frameMs * 0.95 + ms * 0.05;
        if (ms > this.stats.worstFrameMs) this.stats.worstFrameMs = ms;
        if (ms > 50) this.stats.longFrames++;
    }

    _updatePlayer(dt) {
        const ch = this.character;
        // Blend between camera results so motion stays fluid at any frame rate
        if (this.poseSmoother.to) this.currentPose = this.poseSmoother.sample();
        // Frozen in ice (free world): the body can't move at all
        const iced = this.combat.frozen || this.combat.dead;
        const pose = iced ? null : this.currentPose;
        const s = this.settings;
        const flight = this.flight;
        const flying = flight.busy;
        if (pose) {
            if (pose.headRotation) {
                const targetYaw = pose.headRotation.yaw * s.sensitivity;
                const targetPitch = pose.headRotation.pitch * s.sensitivity;
                // Per-frame smoothing tuned at 60 FPS, scaled so 144 Hz screens behave the same
                const alpha = frameAlpha(pose.isRunning && !flying ? Math.min(s.smoothness, 0.1) : s.smoothness, dt);
                this.smoothHead.yaw += (targetYaw - this.smoothHead.yaw) * alpha;
                this.smoothHead.pitch += (targetPitch - this.smoothHead.pitch) * alpha;
                if (s.drifting) {
                    if (Math.abs(this.smoothHead.yaw) > 0.1) this.cameraBaseRotation += this.smoothHead.yaw * 6 * dt; // 0.1 per frame at 60 FPS
                    ch.setBodyRotation(this.cameraBaseRotation);
                } else if (pose.bodyRotation !== undefined && !flying) {
                    this.smoothBody += (pose.bodyRotation - this.smoothBody) * alpha;
                    ch.setBodyRotation(this.smoothBody);
                }
                ch.updateHeadRotation(this.smoothHead.yaw, this.smoothHead.pitch);
            }
            ch.updateArmsLookAt(pose, dt);
            ch.setCrouching(flying ? false : pose.isCrouching);
            ch.setRunning(flying ? false : pose.isRunning, pose.runIntensity);
        }
        if (this.config.mode === 'test' && this.testState === 'setup') ch.setRunning(false);

        if (flying) this._updateFlight(dt, pose);
        if (iced) ch.setRunning(false);
        ch.update(dt, this.collision, !flight.active);

        // Explosion knockback (decays)
        if (this.knockback.lengthSq() > 0.0001) {
            ch.group.position.addScaledVector(this.knockback, dt);
            this.knockback.multiplyScalar(Math.max(0, 1 - 4 * dt));
        }

        // Collisions: walls, tables, chests, trunks, mountains (in flight: see _updateFlight)
        if (!flight.active) {
            const feet = ch.group.position.y - PLAYER_GROUND_OFFSET + (ch.isCrouching ? 1.0 : 0);
            this.collision.resolveCylinder(ch.group.position, PLAYER_RADIUS, feet, 3.5);
        }
        // Maps have an edge; the open world is endless
        if (this.world.isMap) {
            ch.group.position.x = Math.max(-119, Math.min(119, ch.group.position.x));
            ch.group.position.z = Math.max(-119, Math.min(119, ch.group.position.z));
        }
    }

    /** «Флайн»: Superman flight steered by the torso. */
    _updateFlight(dt, pose) {
        const ch = this.character;
        const flight = this.flight;
        const out = flight.update(dt, {
            armsUp: ch.areBothHandsUp(),
            torso: pose ? pose.torso : null,
            headPitch: this.smoothHead.pitch,
        });
        ch.flying = flight.active;
        ch.setFlightTilt(out.tilt);
        // The head looks where we fly (counter the body tilt)
        const view = flight.active ? Math.max(-1.0, Math.min(0.35, out.pitch)) : 0;
        ch.head.rotation.x = this.smoothHead.pitch + out.tilt + view;

        if (!flight.active) {
            if (flight.state === 'idle') { ch.flying = false; ch.setFlightTilt(0); }
            return;
        }

        // Turning with the torso
        if (out.yawRate) {
            if (this.settings.drifting) this.cameraBaseRotation += out.yawRate * dt;
            else this.smoothBody += out.yawRate * dt;
            ch.setBodyRotation(this.settings.drifting ? this.cameraBaseRotation : this.smoothBody);
        }

        const p = ch.group.position;
        const yaw = ch.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const px = p.x, py = p.y, pz = p.z;
        p.x += fx * out.forward * dt;
        p.z += fz * out.forward * dt;
        p.y = Math.min(110, p.y + out.up * dt);

        // Terrain ahead: a slope we can glide up (follow the relief); a cliff,
        // wall or tree trunk stops us and costs speed.
        const ahead = 1.4;
        const blocked = () => this.collision.pointBlocked(p.x, p.y, p.z) || this.collision.pointBlocked(p.x + fx * ahead, p.y, p.z + fz * ahead);
        if (blocked()) {
            const clear = Math.max(this.collision.groundY(p.x, p.z), this.collision.groundY(p.x + fx * ahead, p.z + fz * ahead)) + 2.1;
            const rise = clear - p.y;
            if (rise > 0 && rise < out.forward * dt * 1.6 + 0.6) {
                p.y = clear; // glide up the slope
                if (blocked()) { p.x = px; p.z = pz; flight.speed *= 0.35; }
            } else {
                p.x = px; p.z = pz;
                if (this.collision.pointBlocked(p.x, p.y, p.z)) p.y = Math.max(p.y, py);
                flight.speed *= 0.35;
            }
        }

        // Ground: diving into it lands, otherwise we skim above it
        const ground = this.collision.groundY(p.x, p.z);
        const altitude = p.y - ground;
        if (flight.touchGround(altitude)) {
            this.hud.setVoice('🦸 Приземление', true);
            this._flightMsgUntil = performance.now() + 1500;
            if (this.sound) this.sound.playBombardoCast();
        } else if (altitude < 1.6 + 0.4) {
            p.y = ground + 2.0;
        }

        // Speed lines
        if (flight.speed > 10 && this.cameraMode === 'fpv') {
            const n = flight.speed > 20 ? 3 : 1;
            for (let i = 0; i < n; i++) {
                const ox = (Math.random() - 0.5) * 7, oy = (Math.random() - 0.5) * 4, oz = (Math.random() - 0.5) * 7;
                _v1.set(p.x + fx * 9 + ox, p.y + 1.5 + oy, p.z + fz * 9 + oz);
                _v2.set(-fx * flight.speed * 0.8, -out.up * 0.8, -fz * flight.speed * 0.8);
                this.fx.spark(_v1, 0xffffff, 0.07, _v2, 0.35);
            }
        }
    }

    /** Start the flight spell (arms must be up). Returns true when it started. */
    startFlight(force = false) {
        if (this.flight.active) return false;
        const armsUp = this.character.areBothHandsUp() || Date.now() - (this._armsUpAt || 0) < 1500;
        if (!force && !armsUp) {
            this.hud.setVoice('🦸 Для полёта поднимите <b>обе руки вверх</b> и скажите «Флайн»', true);
            return false;
        }
        this.flight.start();
        this.character.flying = true;
        if (this.sound) this.sound.playBombardoCast();
        this.fx.lightFlash(this.character.group.position, 0x9fd8ff, 1.5, 0.4, 25);
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            _v1.copy(this.character.group.position).add(_v2.set(Math.cos(a) * 1.2, -1.8, Math.sin(a) * 1.2));
            this.fx.spark(_v1, 0xdff4ff, 0.25, _v2.set(Math.cos(a) * 6, 1 + Math.random() * 2, Math.sin(a) * 6), 0.6);
        }
        return true;
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
                // Multiplayer guest: the host moves zombies; we only animate them
                // and report our own punches.
                z.updateRemote(dt, this.camera);
                if (z.isDead && z.removable) { this.removeZombie(z); continue; }
                if (z.isDead) continue;
                const gdx = charPos.x - z.group.position.x, gdz = charPos.z - z.group.position.z;
                const gdist = Math.sqrt(gdx * gdx + gdz * gdz);
                if (isPunching && !hasWeapon && this.playerAttackCooldown <= 0 && gdist < 3.0) {
                    this.playerAttackCooldown = 0.5;
                    this.onLocalHit(z, 1, _v1.set(-gdx, 0, -gdz).normalize().clone(), false);
                }
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
            this.magicHand = null;
        }
        // Remember when both arms were up (the flight word may come a moment later)
        if (tracked && this.character.areBothHandsUp()) this._armsUpAt = Date.now();
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
            this.camera.position.lerp(_v1, frameAlpha(0.1, dt));
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
            flight: { state: this.flight.state, speed: this.flight.speed, tilt: this.flight.tilt, pitch: this.flight.pitch },
            stats: { ...this.stats, fx: { sparks: this.fx.sparks.active, debris: this.fx.debris.active } },
        };
    }
}

/** Convert a per-frame blend factor (at 60 FPS) to this frame's duration. */
function frameAlpha(alpha, dt) {
    return 1 - Math.pow(1 - Math.min(1, alpha), Math.min(0.1, dt) * 60);
}
