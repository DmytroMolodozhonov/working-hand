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
import { Combat, PVP, bombardoDamage } from './Combat.js';
import { Levitation } from './Levitation.js';
import { Accio } from './Accio.js';
import { Storm } from '../fx/Storm.js';
import { Inventory } from './Inventory.js';
import { Builder, BUILD_SPELLS } from './Builder.js';
import { BookBirds, makeBookModel } from './BookBirds.js';
import { WorldKeeper, restoreWorld, applyPlayerSnapshot } from './WorldSave.js';
import { Swimming } from './Swimming.js';
import { ItemSystem } from './Items.js';
import { WandMagic } from './WandMagic.js';
import { Gear } from './Gear.js';
import { Bleeding } from './Bleeding.js';
import { Animals, animalModel, goldenTreeModel, bonesModel } from './Animals.js';
import { CastleLife } from './CastleLife.js';
import { newUid } from './ItemTypes.js';
import { prewarmVillagers } from '../entities/VillagerModel.js';
import { Doors, doorModel } from './Doors.js';
import { Spiders, spiderModel } from './Spider.js';
import { Duel } from './Duel.js';
import { QualityManager } from './Quality.js';
import { FireSystem } from '../world/Fire.js';
import { NetSync } from '../net/NetSync.js';
import { hashString } from '../core/math.js';
import { BLOCK } from '../world/Terrain.js';

const SPELL_COOLDOWN = 1000;
const WATER_COOLDOWN = 600; // ms between water commands («максима» can be repeated)
const BOMBARDO_WAIT = 700; // ms to wait for «…Максима» after an unfinished «Бомбардо»
const PLAYER_RADIUS = 0.48;
export const DAY_CYCLE_MS = 24 * 60 * 1000;
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
        this.yawNeutral = 0; // head yaw that counts as "straight ahead" (drifting camera)
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
        // Day and night (creative / free world): 24 min — 12 min day, 12 min night.
        // Everyone in a game shares the host's clock (sent in the welcome message).
        this.dayCycle = !config.map && !isTest && (config.mode === 'creative' || config.mode === 'freeworld');
        this.dayStart = Date.now() - DAY_CYCLE_MS * 0.04; // a fresh world starts in the morning
        if (this.dayCycle) this.world.setDayPhase(this.dayPhase());
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
            weapons: () => this.weapons.weapons,
            blowMe: (casterId, origin, pushAt) => this._blowMe(casterId, origin, pushAt),
            quakeMe: (casterId, origin, reached, power) => this._quakeMe(casterId, origin, reached, power),
            storm: (origin) => this.storm?.start(origin, 13),
            lightningAt: (point, casterId) => { this.storm?.endIn(3); this.books?.hitAt(point, 3); this.animals?.hitAt(point, 3, 12, casterId); if (this.authority) { this.spiders?.hitAt(point, 3, 20, 'Lightning'); this.castleLife?.hitAt(point, 3, 12, casterId); } },
            birdRay: (o, d, len, width, name) => {
                this.books?.hitRay(o, d, len, width);
                this.animals?.hitRay(o, d, len, width, 3, this.localId);
                if (this.authority) this.spiders?.hitRay(o, d, len, width, name === 'Inferno' ? 8 : name === 'Thunderwave' ? 8 : 5, name);
                if (this.authority) this.castleLife?.hitRay(o, d, len, width, name === 'Inferno' ? 6 : 4, this.localId);
            },
            ignite: (o, d, len) => { this.fire.igniteAlong(o, d, len); this.animals?.burnAlong(o, d, len); },
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
        else if (config.look) this.character.setLook(config.look); // the hero made in «Персонаж»

        this.weapons = new WeaponSystem(this);
        this.water = new WaterMagic(this);
        this.combat = new Combat(this); // Свободный мир: HP, fatigue, shields, freezing
        this.levitation = new Levitation(this); // «Вингардиум Левиоса»
        this.accio = new Accio(this); // «Акцио»: a thing flies into the hand
        this.storm = new Storm(this); // «Lightning Strike» weather
        this.inventory = new Inventory(this); // five slots under the fatigue bar
        this.inventory.show(config.mode !== 'test');
        this.builder = new Builder(this); // «Gather», floors, walls, ceilings, roofs
        this.books = isTest ? null : new BookBirds(this); // book-birds: building spells are learned from their books
        this.swim = new Swimming(this); // deep water: swimming, air, «Air Bubble»
        this.items = new ItemSystem(this); // wands, scrolls, shields, backpacks, bows, food… in the world and the hands
        this.wandMagic = new WandMagic(this); // a wand: stronger spells, «Люмос», drawing, «Раскрой свои секреты»
        this.gear = new Gear(this); // shields, the bow, Thor's hammer, thunderstorms
        this.bleeding = new Bleeding(this); // blades stuck in bodies, blood, «Rescue»
        this.animals = new Animals(this); // cows, pigs, sheep, horses; golden apple trees
        this.castleLife = new CastleLife(this); // the people of the castles
        this.doors = new Doors(this); // «Create a Door», opening by the handle
        this.spiders = new Spiders(this); // the night boss: a giant spider
        this.lightning = null; // my «Lightning Strike» in progress
        this.duel = new Duel(this); // duel magic: charges at creatures, duels
        this.fire = new FireSystem(this); // burning trees
        // Adaptive graphics (resolution, shadows, view distance) for a steady frame rate
        this.quality = new QualityManager(this.renderer, config.graphics ?? 'auto');
        if (typeof window !== 'undefined' && window.__ZNS_FIXED_QUALITY__) this.quality.auto = false; // (tests: software rendering would keep stepping it down)
        this.quality.apply(this.world);
        this.iceCells = []; // ice built with «Water forming» + «Frozen» (sent to late joiners)
        this.weapons.onHit = (z, dmg, dir, isWeapon, w, hit) => this.onLocalHit(z, isWeapon && w ? dmg * (w.damageScale || 1) : dmg, dir, isWeapon, hit, w);

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
        this.hud.setMinimal?.(this.combat.enabled); // Свободный мир: only HP, fatigue and FPS on screen
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.hud.setHpVisible(config.mode !== 'creative');
        this.hud.setMultiplayer(null);

        // The world is saved by itself on the host's (or single player's) computer
        if (!isTest && !config.map && this.authority) {
            const sv = config.saved;
            this.keeper = new WorldKeeper(this, sv ? { id: sv.id, name: sv.name, mode: sv.mode, seed: sv.seed, created: sv.created, players: sv.players } : { name: config.worldName });
            if (sv) {
                restoreWorld(this, sv, THREE);
                applyPlayerSnapshot(this, sv.players?.[this.keeper.myName]);
                this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
            }
        }
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
            // An axe and a sword floating by magic over two pedestals (same places as the old tables)
            const pz = -5.0;
            const s1 = this.world.createPedestal(-7, pz);
            this.weapons.spawnHovering('axe', new THREE.Vector3(-7, s1 + 1.3, pz), 'tA');
            const s2 = this.world.createPedestal(7, pz);
            this.weapons.spawnHovering('sword', new THREE.Vector3(7, s2 + 1.3, pz), 'tS');
            // Creative: bows and shields of every kind on pedestals too
            if (config.mode === 'creative') {
                const gear = [
                    { kind: 'bow', uid: 'cb0', type: 0, magic: false, bonus: 0, arrows: 25 },
                    { kind: 'bow', uid: 'cb1', type: 1, magic: false, bonus: 0, arrows: 25 },
                    { kind: 'bow', uid: 'cb2', type: 2, magic: true, bonus: 35, arrows: 25 },
                    { kind: 'shield', uid: 'cs0', type: 0, magic: false, max: 0 },
                    { kind: 'shield', uid: 'cs1', type: 1, magic: false, max: 0 },
                    { kind: 'shield', uid: 'cs2', type: 2, magic: true, max: 40 },
                ];
                gear.forEach((it, i) => {
                    const x = -12.5 + i * 5, z = -12;
                    const top = this.world.createPedestal(x, z);
                    this.items.spawnLoose(it, new THREE.Vector3(x, top + 1.3, z), { hover: true, broadcast: false });
                });
            }
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
    damageZombie(z, amount, isWeapon, dir, by, hit = null) {
        if (z.isDead) return null;
        // my spells with a wand in the hand hit harder
        if (!isWeapon && by == null && this._lastSpell && performance.now() - this._lastSpell.at < 6000) amount *= this._lastSpell.pw;
        const res = z.takeDamage(amount, isWeapon, dir, Math.random, hit);
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
    onLocalHit(z, dmg, dir, isWeapon, hit = null, weapon = null) {
        if (z.isPlayer) { this.combat.hitRemote(z, dmg, !!weapon?.magic, isWeapon ? hit : null); return; }
        if (z.isAnimal) { this.animals.hit(z, dmg, dir, this.localId); return; }
        if (z.isVillager) { this.castleLife.hit(z, dmg, dir, this.localId, { magic: !!weapon?.magic }); return; }
        if (z.isBoss) { this.spiders.hit(z, dmg, 'melee'); return; }
        this.punchCount++;
        if (this.authority) {
            this.damageZombie(z, dmg, isWeapon, dir, this.localId, hit);
        } else {
            // Immediate feedback, the host decides the outcome
            z.hitFlashTimer = 0.15;
            z._setColor(0xff0000);
            if (this.sound) z.isFrozen ? this.sound.playFrozenHit() : this.sound.playHit();
            this.sync.sendHit(z, dmg, dir, isWeapon, hit);
        }
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
    }

    // ============================================================== explosion
    /**
     * Authoritative explosion (Bombardo): destroys world + damages + replicates.
     * @param {number} [power] 1 = Bombardo, 3 = Bombardo Maxima
     */
    explode(pos, radius, casterId, power = 1) {
        // a wand makes my Bombardo destroy more
        if ((casterId === 'local' || casterId === this.localId) && this._lastSpell && performance.now() - this._lastSpell.at < 6000) radius *= 1 + (this._lastSpell.pw - 1) * 0.5;
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
        // A blast sets the trees around it on fire
        this.fire.ignite(pos, radius + 2);
        this.books?.hitAt(pos, radius + 1);
        if (authoritative) { this.animals?.hitAt(pos, radius, 6 * power, casterId); this.spiders?.hitAt(pos, radius, 12 * power, 'Bombardo'); this.castleLife?.hitAt(pos, radius, 8 * power, casterId); }
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
            // Close to the centre: also thrown up into the air
            const k = 1 - dPlayer / (radius + 3);
            if (k > 0.35 && !this.flight.active) {
                const ch = this.character;
                ch.group.position.y += 0.7;
                ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, 10 * k * push);
                ch.onGround = false;
            }
        }
        // My own Bombardo too close to me hurts me too — the closer, the worse
        // (point-blank can kill). Not in creative. Other players' blasts: Combat.explosion.
        if (casterId === 'local' || casterId === this.localId) {
            const self = Math.round(bombardoDamage(this.combat.center(_v2).distanceTo(pos), radius, power));
            if (self > 0 && this.config.mode !== 'creative') {
                if (this.combat.enabled) this.combat.damage(self, null, 'Bombardo');
                else this.damageLocalPlayer(self);
            }
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
            if (chest.isOpen || chest.locked || !this.authority) continue; // (castle chests: locked while the king lives)
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
        if (chest.itemType === 'loot') {
            // a cave chest: wands, scrolls, shields… float up out of it
            if (this.authority) {
                chest.mesh.updateMatrixWorld(true);
                const rp = chest.getRewardPosition(new THREE.Vector3());
                this.items.lootChest(rp);
                // a pouch of coins too (a castle's treasury holds much more)
                const coins = chest.castle ? 40 + Math.floor(Math.random() * (chest.room === 'treasury' ? 260 : 120)) : 5 + Math.floor(Math.random() * 30);
                this.items.spawnLoose({ kind: 'coins', uid: newUid(), count: coins }, rp.clone().add(new THREE.Vector3(0, 3.2, 0)), { hover: true });
                if (this.sync) this.sync.chestOpenedLoot?.(chest);
            }
            return;
        }
        if (this.authority) {
            chest.mesh.updateMatrixWorld(true);
            const pos = chest.getRewardPosition(new THREE.Vector3());
            pos.y += 2.2;
            const w = this.weapons.spawnHovering(chest.itemType, pos, id);
            if (this.sync) this.sync.chestOpened(chest, w);
        }
    }

    /**
     * Caves: a chest in every cave chamber (and sleeping zombies in the dark,
     * in «Свободный мир»); the light fades inside.
     */
    _updateCaves(dt) {
        const t = this.terrain?.data;
        if (!t || !t.cavesNear || this.config.map || this.config.mode === 'test') return;
        const p = this.character.group.position;
        this._caveT = (this._caveT || 0) - dt;
        if (this._caveT <= 0) {
            this._caveT = 1;
            this._caveChests = this._caveChests || new Set();
            for (const cv of t.cavesNear(p.x, p.z, 90)) {
                if (this._caveChests.has(cv.id)) continue;
                this._caveChests.add(cv.id);
                const pos = new THREE.Vector3(cv.kx + 0.5, cv.F, cv.kz + 0.5);
                const chest = new Chest(this.scene, pos, 'loot', Math.atan2(cv.ex - cv.kx, cv.ez - cv.kz), cv.id);
                chest.mesh.updateMatrixWorld(true);
                chest.boxId = this.collision.addBox(chest.getCollisionBox());
                this.chests.push(chest);
                if (this._openedChests?.has(cv.id)) chest.setOpenInstant();
                if (this.authority && this.config.mode === 'freeworld') {
                    const n = 2 + (cv.r % 3);
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * Math.PI * 2;
                        const zp = new THREE.Vector3(cv.kx + Math.cos(a) * 3.5, cv.F - 0.5, cv.kz + Math.sin(a) * 3.5);
                        const z = this._createZombie(zp);
                        z.setSleeping?.(true);
                    }
                }
            }
        }
        // darkness: rock above the head
        const head = Math.floor(p.y + 2.4 + 1.5);
        // rock above the head here and around (so the light doesn't flicker at the edges)
        let n = 0;
        for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (t.solidIn(Math.round(p.x) + dx, Math.round(p.z) + dz, head, head + 14)) n++;
        const covered = n >= 3 ? 1 : 0;
        // under the roof of a castle or a village house: lit rooms (lanterns, windows), not a dark cave
        const built = covered && !!t.castles?.landAt(Math.round(p.x), Math.round(p.z));
        this._caveK = (this._caveK || 0) + ((covered && !built ? 1 : 0) - (this._caveK || 0)) * Math.min(1, dt * 1.5);
        this._indoorK = (this._indoorK || 0) + ((built ? 1 : 0) - (this._indoorK || 0)) * Math.min(1, dt * 1.5);
        this.world.setCave?.(this._caveK);
        this.world.setIndoor?.(this._indoorK);
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
            // Multiplayer: the game (and the host's room) goes on — wait to respawn
            if (this.net && this.net.active) { this.onLocalDeath('💀 Вас убили', null); return; }
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
        if (this.combat.frozen || this.combat.stunned) { this.hud.setVoice(this.combat.check(name), true); return null; }
        // «Паузин» in the air: hover; «Флайн» while hovering: fly on (no new take-off)
        if (name === 'Pause') {
            if (this.flight.pause()) { this.hud.setVoice('🛑 Паузин — вы парите на месте. Скажите «Флайн», чтобы лететь дальше', true); return 'Pause'; }
            if (isFinal) this.hud.setVoice('«Паузин» работает только в полёте', true);
            return null;
        }
        if (name === 'Flight' && this.flight.hovering) { this.flight.resume(); return 'Flight'; }
        // Shield: arm stretched out (or a T for Maxima), not raised to the face
        if (name === 'Protection' || name === 'ProtectionMaxima') return this._castProtection(name, isFinal);
        // In a duel nothing else can be cast (only the shield, with the other hand)
        if (this._inDuel()) { if (isFinal) this.hud.setVoice('⚡ Идёт дуэль — другие заклинания не работают (только «Protection» второй рукой)', true); return null; }
        if (name === 'AirBubble' || name === 'AirBubbleMaxima') {
            const tired = this.combat.check(name);
            if (tired) { this.hud.setVoice(tired, true); return null; }
            const hint = this.swim.castBubble(name === 'AirBubbleMaxima');
            if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
            this.combat.pay(name);
            return name;
        }
        if (name === 'WaveAttack' || name === 'WaveAttackMaxima') return this._castWave(name, isFinal);
        if (name === 'Lumos' || name === 'LumosMaxima' || name === 'Nox' || name === 'Draw' || name === 'Reveal') return this.wandMagic.cast(name, isFinal);
        if (name === 'Rescue') return this.bleeding.rescue(isFinal);
        if (name === 'Breakthrough' || name === 'BreakthroughMaxima') return this._castBreakthrough(name, isFinal);
        if (name === 'Attack') {
            const hint = this.levitation.attack();
            if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
            return 'Attack';
        }
        // the spell's strength with the wand in the hand (used by damage while it acts)
        this._lastSpell = { name, pw: this.wandMagic.power(name), at: performance.now() };
        // Inferno with a scroll in the hand burns it: its power is yours
        if (name === 'Inferno' && this.items.heldOf('scroll')) { this.items.burnHeldScroll(); return 'Inferno'; }
        // Duel magic: a charge flies at the creature the hand points at
        // Duel spells need a raised, pointing hand: the word alone (e.g. a friend's voice
        // reaching this microphone) never fires them while the arms hang down
        const duelSpell = name === 'Sapira' ? 'SapiraDuel' : (name === 'Stupefy' || name === 'AvadaKedavra') ? name : null;
        if (duelSpell) {
            const aim = this.duel.pickSide(false);
            const side = aim ? aim.side : (this.character.isArmRaised(this.magicHand || this.lastMagicHand || 'right') ? (this.magicHand || this.lastMagicHand || 'right') : ['right', 'left'].find((s) => this.character.isArmRaised(s)));
            if (!side || !this.character.isArmRaised(side)) {
                if (isFinal) this.hud.setVoice('✋ Поднимите руку и направьте её на цель — тогда заклинание сработает', true);
                return null;
            }
            return this._castDuel(name, duelSpell, isFinal, aim || null, side);
        }
        // Ice / levitation aimed at a wizard become duel spells
        if ((name === 'Ice' || name === 'Frozen') && performance.now() - (this.water.frozenAt || -1e9) > 4000) {
            const aim = this.water.active ? null : this.duel.pickSide(true);
            if (aim) return this._castDuel('Ice', 'IceDuel', isFinal, aim);
        }
        if (name === 'Accio') return this._castAccio(isFinal);
        if (name === 'Wind' || name === 'WindMaxima') return this._castWind(name, isFinal);
        if (name === 'Brainrot') return this._castBrainrot(isFinal);
        if (name === 'LightningStrike') return this._castLightning(isFinal);
        if (name === 'Stand') {
            if (this.doors?.stand?.()) return 'Stand';
            if (this.builder.build) { this.builder.finish(); return 'Stand'; }
            return null;
        }
        if (BUILD_SPELLS[name]) return this._castBuild(name, isFinal);
        if (name === 'Earthquake' || name === 'EarthquakeMaxima') return this._castEarthquake(name, isFinal);
        // Levitation: point the hand at an object (or a creature: a duel spell)
        if (name === 'Levitation') {
            const aim = this.levitation.active ? null : this.duel.pickSide(false);
            if (aim && (aim.t.kind === 'p' || this._creatureCloserThanObject(aim))) return this._castDuel('Levitation', 'LevitateDuel', isFinal, aim);
            return this._castLevitation(isFinal);
        }
        // Water bending: the hand is at the water / holding the ball, not raised to the face
        const waterName = this._waterSpell(name);
        if (waterName) return this._castWater(waterName, text, isFinal);
        if (name === 'Frozen') name = 'Ice';
        // «Frozen» / ice words right after freezing water belong to the water — never an ice beam
        if (name === 'Ice' && performance.now() - (this.water.frozenAt || -1e9) < 4000) return null;
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

    /** Is the pointed-at creature closer than any loose object (so levitation lifts the creature)? */
    _creatureCloserThanObject(aim) {
        const hand = this.character.getHandWorldPosition(aim.side);
        for (const w of this.weapons.weapons) if (!w.holder && w.position.distanceTo(hand) < aim.t.dist) return false;
        for (const b of this.water.resting) if (b.pos.distanceTo(hand) < aim.t.dist) return false;
        return true;
    }

    /** Duel spell: costs fatigue, flies to the pointed-at creature (or straight ahead). */
    _castDuel(costName, spell, isFinal, aim = undefined, side = null) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === costName && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastDuelCast || 0) < 900) return null;
        const tired = this.combat.check(costName);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const target = aim === undefined ? this.duel.pickSide(false) : aim;
        this.duel.cast(spell, target, side);
        this.combat.pay(costName);
        this._lastDuelCast = now;
        this._interimCast = isFinal ? null : { name: costName, at: now };
        return costName;
    }

    /** «Вайнд» / «Вайнд Максима»: from the raised hand, where it points. */
    /**
     * «Breakthrough»: both arms a little below the horizon in front of you,
     * then raise them together (within 3 s) while saying the word — a wall of
     * earth and stone rises out of the ground in front of you.
     * «Breakthrough Максима»: a wall twice as wide and higher.
     */
    /** The night boss (the lightning can be aimed at it too). */
    get bosses() {
        return this.spiders ? this.spiders.list : [];
    }

    _castBreakthrough(name, isFinal) {
        if (!isFinal && name === 'Breakthrough') return null; // (wait for «Максима»)
        if (this._bt?.pending) return null;
        const now = performance.now();
        const B = this._bt || (this._bt = {});
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        if (now - (B.riseAt || 0) < 2000) { this.combat.pay(name); this._raiseWall(name === 'BreakthroughMaxima'); B.riseAt = 0; return name; }
        if (now - (B.lowAt || 0) < 3000) {
            B.pending = { name, until: now + 3000 };
            this.hud.setVoice('🪨 Теперь поднимите обе руки вместе!', true);
            return name;
        }
        if (isFinal) this.hud.setVoice('🪨 «Breakthrough»: опустите обе руки чуть ниже горизонта перед собой, потом поднимите их вместе и скажите слово', true);
        return null;
    }

    _updateBreakthrough(dt) {
        const B = this._bt || (this._bt = {});
        const ch = this.character;
        const now = performance.now();
        if (this.currentPose) {
            ch.group.updateMatrixWorld(true);
            const inv = new THREE.Matrix4().copy(ch.group.matrixWorld).invert();
            const l = ch.getHandWorldPosition('left', new THREE.Vector3()).applyMatrix4(inv);
            const r = ch.getHandWorldPosition('right', new THREE.Vector3()).applyMatrix4(inv);
            const shoulder = 1.25; // shoulder height in body space
            const low = (h) => h.y < shoulder - 0.15 && h.y > shoulder - 1.1 && h.z < -0.5;
            const up = (h) => h.y > shoulder - 0.05;
            if (low(l) && low(r)) B.lowAt = now;
            else if (up(l) && up(r) && now - (B.lowAt || 0) < 3000 && !B.upNow) { B.riseAt = now; B.upNow = true; }
            if (!(up(l) && up(r))) B.upNow = false;
        }
        if (B.pending) {
            if (now - (B.riseAt || 0) < 800) {
                const p = B.pending;
                B.pending = null;
                this.combat.pay(p.name);
                this._raiseWall(p.name === 'BreakthroughMaxima');
            } else if (now > B.pending.until) { B.pending = null; this.hud.setVoice('🪨 Не успели поднять руки', true); }
        }
        // the wall rises row by row
        const W = B.rising;
        if (W) {
            W.t += dt;
            const rows = Math.min(W.height, Math.floor(W.t / (0.9 / W.height)) + 1);
            while (W.done < rows) {
                const L = W.done;
                const edits = [];
                for (const c of W.cols) {
                    const type = L === W.height - 1 ? BLOCK.DIRT : BLOCK.STONE;
                    edits.push([c.x, c.base + L, c.z, type]);
                    this.builder.data?.set(c.x, c.base + L, c.z, type);
                    if (Math.random() < 0.5) this.fx.spark(new THREE.Vector3(c.x, c.base + L - 1, c.z), 0x8a7a5a, 0.2, new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.9);
                }
                this.builder._sendEdits(edits);
                W.done++;
            }
            if (W.done >= W.height) B.rising = null;
        }
    }

    _raiseWall(max) {
        const ch = this.character;
        const yaw = ch.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const sx = -fz, sz = fx; // sideways
        const width = max ? 9 : 5, height = max ? 5 : 3;
        const dist = max ? 4 : 3.5;
        const cx = ch.group.position.x + fx * dist, cz = ch.group.position.z + fz * dist;
        const cols = [];
        const seen = new Set();
        for (let i = 0; i < width; i++) {
            const o = i - (width - 1) / 2;
            for (const t of [0, 0.5]) { // two cells thick where it runs diagonally
                const x = Math.round(cx + sx * o + fx * t), z = Math.round(cz + sz * o + fz * t);
                const k = x + ',' + z;
                if (seen.has(k)) continue;
                seen.add(k);
                cols.push({ x, z, base: this.terrain.data.topLayer(x, z) + 1 });
            }
        }
        this._bt.rising = { cols, height, done: 0, t: 0 };
        this.fx.explosion?.(new THREE.Vector3(cx, ch.group.position.y - 1.5, cz), 1.5, 0.4);
        if (this.sound) this.sound.playExplosion?.(new THREE.Vector3(cx, ch.group.position.y, cz), ch.group.position, 0.3);
        // creatures standing there are thrown back
        for (const z of this.zombies) {
            if (z.isDead) continue;
            const d = Math.hypot(z.group.position.x - cx, z.group.position.z - cz);
            if (d < width / 2 + 1) { z.windVel = (z.windVel || new THREE.Vector3()).add(new THREE.Vector3(fx * 8, 0, fz * 8)); z.vy = Math.max(z.vy || 0, 6); }
        }
        this.hud.setVoice(max ? '🪨 BREAKTHROUGH МАКСИМА!' : '🪨 Breakthrough!', true);
    }

    /** Is my charge in a duel right now? */
    _inDuel() {
        const me = this.localId;
        return this.duel.clashes.some((c) => c.a?.by === me || c.b?.by === me);
    }

    /**
     * «Wave Attack»: stand by the water and point the hand AT the water, say it;
     * the water rises — then turn the hand to the one you want to wash away
     * (and hold it there a moment): the wave rolls to them. Harmless.
     */
    _castWave(name, isFinal) {
        if (!isFinal && name === 'WaveAttack') return null; // (wait for a possible «Максима»)
        if (this._wave) return null;
        const ch = this.character;
        const side = ['right', 'left'].find((s) => ch.isArmRaised(s)) || this.magicHand || 'right';
        const o = ch.getHandWorldPosition(side);
        const d = ch.getHandDirection(side);
        // the hand must point at water nearby
        let src = null;
        const t = this.terrain?.data;
        for (let k = 0.5; k < 14 && t; k += 0.5) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            if (t.get(Math.round(x), Math.floor(y + 1.5), Math.round(z)) === BLOCK.WATER) { src = new THREE.Vector3(x, y, z); break; }
            if (t.isSolidAt?.(x, y, z)) break;
        }
        if (!src) { if (isFinal) this.hud.setVoice('🌊 Встаньте у воды и покажите рукой прямо НА воду — тогда скажите «Wave Attack»', true); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay(name);
        this._wave = { name, side, src, t: 0, still: 0, last: d.clone() };
        this.hud.setVoice('🌊 Вода поднимается… наведите руку на цель и задержите', true);
        return name;
    }

    _updateWave(dt) {
        const W = this._wave;
        if (!W) return;
        const ch = this.character;
        W.t += dt;
        // the water bulges where it will start
        if (Math.random() < 0.7) this.fx.spark(W.src, 0x9fd8ff, 0.18, new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.6);
        const d = ch.getHandDirection(W.side);
        const moved = d.angleTo(W.last);
        W.last.copy(d);
        W.still = moved < 0.6 * dt * 2 ? W.still + dt : 0;
        const awayFromWater = W.t > 0.6;
        if (!(awayFromWater && (W.still > 0.45 || W.t > 4))) return;
        // the target: the creature the hand points at, or the ground the hand points to
        const o = ch.getHandWorldPosition(W.side);
        const aim = this.duel.pickSide(false);
        let target = aim ? this.duel._targetPos({ tk: aim.t.kind, tid: aim.t.id }, new THREE.Vector3()) : null;
        if (!target) {
            target = o.clone().addScaledVector(d, 18);
            target.y = this.collision.groundY(target.x, target.z);
        }
        const vec = target.clone().sub(W.src);
        this.spells.cast(W.name, W.src, vec, W.side, this.localId);
        if (this.sync) this.sync.spell(W.name, W.src, vec, W.side);
        this.hud.setVoice('🌊 Волна!', true);
        this._wave = null;
    }

    _castWind(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        // «Вайнд…» heard while the phrase goes on: wait for a possible «Максима»
        if (name === 'Wind' && !isFinal) return null;
        if (now - (this._lastWind || 0) < 900) return null;
        const ch = this.character;
        const pref = this.magicHand || this.lastMagicHand || 'right';
        const side = ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s));
        if (!side) { if (isFinal) this.hud.setVoice('🌬️ Поднимите руку и направьте её туда, куда дуть, — и скажите «Вайнд»', true); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const origin = ch.getHandWorldPosition(side);
        const dir = ch.getHandDirection(side);
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        this.combat.pay(name);
        this._lastWind = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    /**
     * «Брейнрот»: no hand needed — the zombie you look at (or the nearest one)
     * becomes your servant for a while: it fights the other zombies, and they fight it.
     */
    _castBrainrot(isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === 'Brainrot' && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastBrainrot || 0) < 1200) return null;
        const head = this.character.head.getWorldPosition(new THREE.Vector3());
        const look = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        let best = null;
        for (const z of this.zombies) {
            if (z.isDead || z.isDying || z.isThrall) continue;
            const to = _v1.copy(z.group.position).add(_v2.set(0, 1.4, 0)).sub(head);
            const d = to.length();
            if (d > 30) continue;
            const ang = look.angleTo(to.normalize());
            const score = (ang < 0.5 ? ang * 4 : 10 + d * 0.2 + ang) + d * 0.04;
            if (ang > 0.5 && d > 10) continue;
            if (!best || score < best.score) best = { z, score, d };
        }
        if (!best) { if (isFinal) this.hud.setVoice('🌀 Посмотрите на зомби (не дальше 30 м) и скажите «Брейнрот»', true); return null; }
        const tired = this.combat.check('Brainrot');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('Brainrot');
        this._lastBrainrot = now;
        this._interimCast = isFinal ? null : { name: 'Brainrot', at: now };
        // Rings from above the head to the zombie (the vector's length = the distance)
        const origin = head.add(_v1.set(0, 1.3, 0));
        const vec = _v2.copy(best.z.group.position).add(_v1.set(0, 1.4, 0)).sub(origin);
        this.spells.cast('Brainrot', origin, vec.clone(), null, this.localId);
        if (this.sync) this.sync.spell('Brainrot', origin, vec, null);
        const zid = best.z.id;
        const arrive = Math.round(Math.min(2500, (vec.length() / 11) * 1000 + 300));
        setTimeout(() => {
            if (this.authority) this.applyBrainrot(zid, this.localId);
            else if (this.sync) this.sync.brainrot(zid);
        }, arrive);
        return 'Brainrot';
    }

    /**
     * «Earthquake»: lift a leg and stomp, both hands pointing where the quake
     * should run. (If the camera doesn't see the legs, the hands are enough.)
     */
    _castEarthquake(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (name === 'Earthquake' && !isFinal) return null; // wait: maybe «…Максима»
        if (now - (this._lastQuake || 0) < 1500) return null;
        const ch = this.character;
        const hint = (t) => { if (isFinal) this.hud.setVoice(t, true); return null; };
        if (!ch.isArmRaised('left') || !ch.isArmRaised('right')) return hint('🌋 Поднимите <b>обе руки</b> в сторону удара, топните ногой и скажите «Earthquake»');
        const pose = this.currentPose || {};
        const t = performance.now();
        const legsVisible = pose.legsSeenAt && t - pose.legsSeenAt < 3000;
        if (legsVisible && !(pose.stompAt && t - pose.stompAt < 2500)) return hint('🌋 Поднимите ногу и <b>топните</b> — и сразу скажите «Earthquake»');
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const dir = ch.getHandDirection('left').add(ch.getHandDirection('right')).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y));
        dir.normalize();
        const origin = ch.group.position.clone();
        origin.y = this.collision.surfaceY(origin.x, origin.z);
        this.spells.cast(name, origin, dir, 'right', this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, 'right');
        this.fx.shake = Math.max(this.fx.shake, name === 'EarthquakeMaxima' ? 1.4 : 0.8);
        this.combat.pay(name);
        this._lastQuake = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    /** Another wizard's quake ran under me: I fall for a few seconds and get hurt. */
    _quakeMe(casterId, origin, reached, power) {
        if (casterId === 'local' || casterId === this.localId) return false;
        const c = this.combat;
        if (!c.enabled || c.dead || this.flight.active) return false;
        if (!reached(this.character.group.position)) return false;
        if (c.shield && c.shield.type === 2 && c.shield.left > 0) { c._blocked(origin); return true; } // the dome holds
        c.stun(power > 1 ? 4 : 2.5, casterId, 'quake');
        this.character.knockedDown = true;
        this.fx.shake = Math.max(this.fx.shake, 1.2);
        c.damage(power > 1 ? 9 : 3, casterId, 'Earthquake');
        return true;
    }

    // ============================================================ Lightning Strike
    /**
     * «Lightning Strike» (25): arms up + the words. 5 s the storm gathers, then the
     * lightning comes down into your hands; within 5 s point it calmly at a
     * creature (hold the aim ~0.5 s) — or it strikes you.
     */
    _castLightning(isFinal) {
        if (this.lightning) return null;
        const armsUp = this.character.areBothHandsUp() || Date.now() - (this._armsUpAt || 0) < 1500;
        if (!armsUp) { if (isFinal) this.hud.setVoice('⛈️ Поднимите <b>обе руки вверх</b> и скажите «Lightning Strike»', true); return null; }
        const tired = this.combat.check('LightningStrike');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('LightningStrike');
        const p = this.character.group.position.clone();
        this.spells.cast('Storm', p, _v1.set(0, 1, 0), null, this.localId);
        if (this.sync) this.sync.spell('Storm', p, _v1.set(0, 1, 0), null);
        this.lightning = { phase: 'gather', t: 0, aimT: 0, aim: null };
        this.hud.setVoice('⛈️ Буря собирается... держитесь!', true);
        return 'LightningStrike';
    }

    /** Creatures the lightning can be aimed at. */
    _lightningTargets() {
        const out = [];
        for (const z of this.zombies) if (!z.isDead && !z.isThrall) out.push({ pos: z.group.position, key: 'z' + z.id });
        for (const [id, r] of this.remotes) if (!r.dead) out.push({ pos: r.position, key: 'p' + id });
        for (const b of this.bosses || []) if (!b.dead) out.push({ pos: b.position, key: 'b' + b.id });
        return out;
    }

    _updateLightning(dt) {
        const L = this.lightning;
        if (!L) { this.hud.setTimer?.(null); return; }
        L.t += dt;
        if (L.phase === 'gather') {
            this.hud.setTimer?.(1 - L.t / 5, '⛈️', Math.ceil(5 - L.t));
            if (L.t >= 5) {
                L.phase = 'hold';
                L.t = 0;
                L.side = this.magicHand || this.lastMagicHand || 'right';
                this.spells.cast('LightningHold', this.character.group.position, _v1.set(0, 1, 0), L.side, this.localId);
                if (this.sync) this.sync.spell('LightningHold', this.character.group.position, _v1.set(0, 1, 0), L.side);
                this.fx.lightFlash(this.character.getHandWorldPosition(L.side), 0xdde8ff, 6, 0.3, 40);
                this.hud.setVoice('⚡ Молния в руках! Плавно наведите руку на цель — у вас 5 секунд', true);
            }
            return;
        }
        // Aiming: the hand that points best at a creature; hold it there ~0.5 s
        const ch = this.character;
        let best = null;
        for (const side of ['right', 'left']) {
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            for (const t of this._lightningTargets()) {
                const to = _v2.copy(t.pos).add(_v1.set(0, 1, 0)).sub(hand);
                const d = to.length();
                if (d > 45 || d < 1.5) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang < 0.22 && (!best || ang < best.ang)) best = { key: t.key, pos: t.pos, ang, side };
            }
        }
        if (best && L.aim === best.key) L.aimT += dt;
        else { L.aim = best ? best.key : null; L.aimT = 0; }
        this.hud.setTimer?.(1 - L.t / 5, best ? '🎯' : '⚡', Math.ceil(5 - L.t), best ? Math.min(1, L.aimT / 0.5) : 0);
        if (best && L.aimT >= 0.5) {
            this.lightning = null;
            if (L.hammer) this.gear.hammerResult(true);
            const point = best.pos.clone();
            this.spells.cast('LightningHit', point, _v1.set(0, -1, 0), null, this.localId);
            if (this.sync) this.sync.spell('LightningHit', point, _v1.set(0, -1, 0), null);
            this.hud.setVoice('⚡ <span style="color:#9fd8ff">LIGHTNING STRIKE!</span>', true);
            return;
        }
        if (L.t >= 5 && L.hammer) {
            // the hammer's lightning is lost (it never hurts its holder)
            this.lightning = null;
            this.gear.hammerResult(false);
            return;
        }
        if (L.t >= 5) {
            // Too late: it strikes you
            this.lightning = null;
            const point = ch.group.position.clone();
            this.spells.cast('LightningHit', point, _v1.set(0, -1, 0), null, this.localId);
            if (this.sync) this.sync.spell('LightningHit', point, _v1.set(0, -1, 0), null);
            if (this.combat.enabled) this.combat.damage(10, null, 'Lightning');
            else this.damageLocalPlayer(6);
            this.hud.setVoice('⚡ Не успели навести — молния ударила в вас!', true);
        }
    }

    /** «Gather» and the building spells (learned from books outside creative). */
    _castBuild(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastBuild || 0) < 900) return null;
        if (!this.builder.knows(name)) {
            if (isFinal) this.hud.setVoice(`📖 «${BUILD_SPELLS[name].name}» ещё не изучено — найдите его в книге птицы`, true);
            return null;
        }
        if (this.combat.enabled && this.combat.fatigue < BUILD_SPELLS[name].cost) { this.hud.toast?.('😮‍💨 Не хватает сил'); return null; }
        let hint;
        // «Gather» at a carcass (meat) or a golden tree (apples)
        if (name === 'Gather') {
            const side = ['right', 'left'].find((sd) => this.character.isArmRaised(sd)) || 'right';
            const got = this.animals.gatherAt(this.character.getHandWorldPosition(side), this.character.getHandDirection(side));
            if (got && !got.startsWith('🍏')) { this.hud.setVoice(got, true); this._lastBuild = now; return 'Gather'; }
            if (got) { if (isFinal) this.hud.setVoice(got, true); return null; }
        }
        if (name === 'Gather') hint = this.builder.gather();
        else if (name === 'CreateDoor') hint = this.doors ? this.doors.create() : '🚪 Двери скоро будут';
        else hint = this.builder.start(name);
        if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
        if (this.combat.enabled) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost);
        this._lastBuild = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    /** The zombie becomes `by`'s servant for 45 s (authority: host / single player). */
    applyBrainrot(zid, by) {
        const z = this.zombieById.get(zid);
        if (!z || z.isDead) return;
        z.setThrall(true);
        z.thrallOwner = by;
        z.thrallUntil = performance.now() + 45000;
        z.isSleeping && z.setSleeping?.(false);
        for (let i = 0; i < 24; i++) this.fx.spark(_v1.copy(z.group.position).add(_v2.set(0, 2.2, 0)), i % 2 ? 0xd65bff : 0xff7bff, 0.15, _v2.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.7);
    }

    /** Where a zombie goes: a servant hunts the other zombies, the others go for a servant close by. */
    _zombieTarget(z) {
        const zp = z.group.position;
        if (z.isThrall) {
            if (performance.now() > z.thrallUntil) { z.setThrall(false); return this._zombieTarget(z); }
            let best = null, bd = 40 * 40;
            for (const o of this.zombies) {
                if (o === z || o.isDead || o.isDying || o.isThrall) continue;
                const d = zp.distanceToSquared(o.group.position);
                if (d < bd) { bd = d; best = o; }
            }
            if (best) return { pos: best.group.position, zombie: best, distSq: bd };
            // nobody to fight: stays near its master (not too close)
            const owner = z.thrallOwner === this.localId ? this.character.group.position : this.remotes.get(z.thrallOwner)?.position;
            if (owner && zp.distanceToSquared(owner) > 16) return { pos: owner, follow: true, distSq: zp.distanceToSquared(owner) };
            return null;
        }
        const player = this.nearestPlayer(zp);
        let best = null, bd = 10 * 10;
        for (const o of this.zombies) {
            if (!o.isThrall || o.isDead || o.isDying) continue;
            const d = zp.distanceToSquared(o.group.position);
            if (d < bd) { bd = d; best = o; }
        }
        if (best && (!player || bd < player.distSq)) return { pos: best.group.position, zombie: best, distSq: bd };
        return player;
    }

    /** Another wizard's «Вайнд» reached me: blown away (no harm; a shield stops it). */
    _blowMe(casterId, origin, pushAt) {
        if (casterId === 'local' || casterId === this.localId || this.combat.dead) return;
        const v = pushAt(this.combat.center(new THREE.Vector3()));
        if (!v) return;
        if (this.combat.shieldFactor(origin) >= 1) { this.combat._blocked(origin); return; }
        if (this.flight.active) { this.knockback.add(v); return; }
        this.knockback.add(_v1.copy(v).setY(0));
        const ch = this.character;
        if (v.y > 2) { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, v.y); ch.onGround = false; }
    }

    _castAccio(isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === 'Accio' && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastAccio || 0) < 900 || this.accio.active) return null;
        const tired = this.combat.check('Accio');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const hint = this.accio.cast();
        if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
        this.combat.pay('Accio');
        this._lastAccio = now;
        this._interimCast = isFinal ? null : { name: 'Accio', at: now };
        return 'Accio';
    }

    _castLevitation(isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === 'Levitation' && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastLevitate || 0) < 900) return null;
        const tired = this.levitation.active ? null : this.combat.check('Levitation');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const wasActive = this.levitation.active;
        // a door being carried: put it down; a door pointed at: lift it
        if (this.doors.carried) { this.doors._putDown(); this._lastLevitate = now; return 'Levitation'; }
        const hint = this.levitation.cast();
        if (hint) {
            const side = ['right', 'left'].find((sd) => this.character.isArmRaised(sd)) || 'right';
            if (this.doors.tryLift(side)) { this.combat.pay('Levitation'); this._lastLevitate = now; return 'Levitation'; }
            this.hud.setVoice(hint, true);
            return null;
        }
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

    /**
     * My player was killed: a dark screen «Вас убили» with «Возродиться». The
     * game goes on (a host's death never closes the room for the others).
     */
    onLocalDeath(text, byId) {
        if (this.sync) this.sync.died(byId);
        this.castleLife?.playerDied(this.localId);
        this.hud.setStatus('');
        if (this.flight.busy) this.flight.land('dead');
        this.weapons.releaseAll?.();
        this.ui.died?.(text, () => this.respawn());
    }

    /** Back into the game: full health, a new place near the start. */
    respawn() {
        const ch = this.character;
        this.bleeding?.clearCuts(ch);
        this.combat.revive();
        this.playerHP = this.maxHP;
        this.isDeadLocal = false;
        const p = ch.group.position;
        if (this.config.map && this.world.mapResult?.playerSpawn) p.copy(this.world.mapResult.playerSpawn);
        else {
            const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
            p.x = Math.cos(a) * d;
            p.z = Math.sin(a) * d;
        }
        p.y = this.collision.groundY(p.x, p.z) + 2.5;
        ch.verticalVelocity = 0;
        this.knockback.set(0, 0, 0);
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        if (this.sync) this.sync.respawned();
        for (let i = 0; i < 30; i++) this.fx.spark(_v1.copy(p).add(_v2.set(0, -1, 0)), i % 2 ? 0xffffff : 0x9fd8ff, 0.15, _v2.set((Math.random() - 0.5) * 4, Math.random() * 5, (Math.random() - 0.5) * 4), 0.7);
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
        if (name === 'Accio') { this._lastAccio = 0; return this._castAccio(true); }
        if (name === 'Wind' || name === 'WindMaxima') {
            this._lastWind = 0;
            const origin = this.character.getHandWorldPosition('right');
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.spells.cast(name, origin, dir, 'right', this.localId);
            if (this.sync) this.sync.spell(name, origin, dir, 'right');
            return name;
        }
        if (name === 'Stupefy' || name === 'AvadaKedavra') { this._lastDuelCast = 0; return this._castDuel(name, name, true); }
        if (name === 'Sapira') { this._lastDuelCast = 0; return this._castDuel('Sapira', 'SapiraDuel', true); }
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
        // things that appear only later (book-birds, bubbles, waves, items): one sample each
        const zoo = new THREE.Group();
        zoo.position.copy(this.character.group.position);
        zoo.add(makeBookModel(0x8e2b2b));
        const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        zoo.add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 8), glow));
        zoo.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshPhongMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide })));
        zoo.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')) })));
        for (const m of this.items?.sampleModels?.() || []) zoo.add(m);
        for (const t of ['cow', 'pig', 'sheep', 'horse']) zoo.add(animalModel(t, 0x6b3f1e));
        zoo.add(goldenTreeModel(), bonesModel(), spiderModel(), doorModel(0x8b5a2b));
        for (const v of prewarmVillagers()) zoo.add(v);
        zoo.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, depthWrite: false })));
        zoo.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
        this.scene.add(zoo);
        this.renderer.compile(this.scene, this.camera);
        this.scene.remove(zoo);
        // (geometries only: many of these materials are shared caches used later — disposing them would recompile)
        zoo.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
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

    /**
     * Freeze detector: a frame that came late gets a reason (shown next to the
     * FPS), so a stutter can be traced on the player's own computer.
     */
    _noteSpike(gapMs, now) {
        if (gapMs < 70 || !this._frameEnd || !this._parts) return;
        let reason = null, worst = 0;
        for (const [name, ms] of Object.entries(this._parts)) if (ms > worst) { worst = ms; reason = name; }
        if (worst < 35) {
            // The previous frame itself was quick: something ran between frames
            const ps = this.poseService;
            const ai = ps && ps.lastSendEnd > this._frameEnd - 5 && ps.lastSendEnd - ps.lastSendStart > 30;
            reason = ai ? 'нейросеть камеры' : 'браузер (память/вкладка)';
        }
        this.stats.spike = { ms: gapMs, reason, at: now };
        const log = this.stats.spikes || (this.stats.spikes = []);
        log.push({ ms: Math.round(gapMs), reason, t: Math.round(now) });
        if (log.length > 30) log.shift();
    }

    frame() {
        const t0 = performance.now();
        const deltaTime = (t0 - this.lastTime) / 1000;
        this.lastTime = t0;
        const dt = Math.min(deltaTime, 0.1);
        this.frameCount++;
        this._noteSpike(deltaTime * 1000, t0);
        const parts = this._parts || (this._parts = {});
        let tm = t0;
        const mark = (name) => { const n = performance.now(); parts[name] = n - tm; tm = n; };

        // FPS counter (rolling)
        this.fpsAccum += deltaTime;
        this.fpsFrames++;
        if (this.fpsFrames >= 20) {
            const ps = this.poseSmoother;
            const aiFps = ps.lastPushAt && t0 - ps.lastPushAt < 1000 ? Math.round(1000 / ps.interval) : 0;
            const sp = this.stats.spike;
            this.hud.setFps(Math.round(this.fpsFrames / this.fpsAccum), aiFps, this.quality.current.name,
                sp && t0 - sp.at < 6000 ? `рывок ${Math.round(sp.ms)} мс: ${sp.reason}` : '');
            this.fpsAccum = 0;
            this.fpsFrames = 0;
        }

        const isTest = this.config.mode === 'test';
        this._updatePlayer(dt);
        this._updateChests(dt);
        if (!isTest) this._checkVictory();
        mark('игрок');

        this.levitation.update(dt);
        this.accio.update(dt);
        this.inventory.update(dt);
        this.builder.update(dt);
        this.books?.update(dt);
        this.swim.update(dt);
        this.items.update(dt);
        this.items.updateRemote();
        this.wandMagic.update(dt);
        this.gear.update(dt);
        this.bleeding.update(dt);
        this.animals.update(dt);
        this.castleLife.update(dt);
        this.doors.update(dt);
        this.spiders.update(dt);
        this._updateCaves(dt);
        this.keeper?.update(dt);
        this.storm.update(dt);
        this._updateLightning(dt);
        this._updateWave(dt);
        this._updateBreakthrough(dt);
        this.duel.update(dt);
        this.duel.updateVisuals(dt);
        this.fire.update(dt);
        this.weapons.update(dt);
        this.water.update(dt);
        this.combat.update(dt);
        this.combat.updatePunches();
        mark('магия и оружие');
        if (this.playerAttackCooldown > 0) this.playerAttackCooldown -= dt;
        this._updateZombies(dt);
        this.weapons.checkHits(this.zombies.concat(this.combat.enabled ? this.combat.meleeTargets() : [], this.animals.targets(), this.spiders.targets(), this.castleLife.targets()), dt);
        mark('зомби');

        this.spells.update(dt);
        this._updateMagicGesture();
        this._updatePendingSpell();
        if (!isTest) this._spawnWaves();

        for (const r of this.remotes.values()) r.update(dt);
        if (this.sync) this.sync.update(dt);
        mark('мультиплеер');

        this.fx.update(dt);
        // See further while flying (smoothly), terrain streams in around the player
        this._viewBoost = (this._viewBoost || 0) + ((this.flight.active ? 1 : 0) - (this._viewBoost || 0)) * Math.min(1, dt * 0.8);
        this.world.update(this.character.group.position, this._viewBoost);
        if (this.dayCycle && this.frameCount % 15 === 0) this.world.setDayPhase(this.dayPhase());
        this.world.followShadow(this.character.group.position);
        mark('мир');
        this._updateCamera(dt);

        if (this.frameCount % 5 === 0) {
            const cp = this.character.group.position;
            const others = [...this.remotes.values()].filter((r) => !r.dead).map((r) => ({ x: r.position.x, z: r.position.z, name: r.name, color: r.color }));
            // on a server: its name on the map and a mark at its start point
            const online = this.net && this.net.active;
            const server = online ? { name: (this.net.isHost ? this.net.info?.name : this.net.serverName) || 'Сервер', players: this.remotes.size + 1, home: this.world.mapResult?.playerSpawn || { x: 0, z: 0 } } : null;
            const castleIdx = this.world.terrain?.data?.castles;
            const castles = castleIdx ? castleIdx.nearestForMap(cp) : [];
            this.hud.drawMinimap(cp, this.character.group.rotation.y, this.world, this.zombies, others, server, castles);
            if (this.sound && this.sound.loaded) this.sound.updateAmbient(cp, this.zombies, dt * 5);
        }

        this.quality.update(deltaTime);
        const logic = performance.now() - t0;
        this.stats.logicMs = (this.stats.logicMs || logic) * 0.95 + logic * 0.05;
        if (logic > (this.stats.worstLogicMs || 0)) this.stats.worstLogicMs = logic;

        mark('прочее');
        this.renderer.render(this.scene, this.camera);
        mark('графика');
        this._frameEnd = performance.now();

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
        const iced = this.combat.immobile;
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
                    // "Straight ahead" adapts slowly to where the player really looks (camera beside
                    // the screen), so a small constant head turn doesn't spin the view.
                    const off = this.smoothHead.yaw - this.yawNeutral;
                    if (Math.abs(off) < 0.3) this.yawNeutral += off * Math.min(1, dt * 0.12);
                    // Turning speed grows smoothly past the dead zone, with a cap
                    const DEAD = 0.15;
                    const over = Math.abs(off) - DEAD;
                    if (over > 0) this.cameraBaseRotation += Math.sign(off) * Math.min(2.2, over * 4) * dt;
                    ch.setBodyRotation(this.cameraBaseRotation);
                } else if (pose.bodyRotation !== undefined && !flying) {
                    this.smoothBody += (pose.bodyRotation - this.smoothBody) * alpha;
                    ch.setBodyRotation(this.smoothBody);
                }
                ch.updateHeadRotation(this.smoothHead.yaw - (s.drifting ? this.yawNeutral : 0), this.smoothHead.pitch);
            }
            ch.updateArmsLookAt(pose, dt);
            ch.setCrouching(flying ? false : pose.isCrouching);
            ch.setRunning(flying ? false : pose.isRunning, pose.runIntensity);
        }
        if (this.config.mode === 'test' && this.testState === 'setup') ch.setRunning(false);

        if (flying) this._updateFlight(dt, pose);
        if (iced) ch.setRunning(false);
        ch.update(dt, this.collision, !flight.active && !this.animals?.riding && !this.spiders?.held);

        // Explosion knockback (decays)
        if (this.knockback.lengthSq() > 0.0001) {
            ch.group.position.addScaledVector(this.knockback, dt);
            this.knockback.multiplyScalar(Math.max(0, 1 - 4 * dt));
        }

        // Other players are solid: you can't walk through them
        if (!flight.active) this._pushOutOfPlayers(ch.group.position);

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

    _pushOutOfPlayers(me) {
        const MIN = 1.2; // two bodies (1.2 m wide) side by side
        for (const r of this.remotes.values()) {
            if (r.dead) continue;
            const p = r.position;
            if (Math.abs(p.y - me.y) > 2.5) continue; // one above the other (jumping, flying)
            let dx = me.x - p.x, dz = me.z - p.z;
            const d = Math.hypot(dx, dz);
            if (d >= MIN) continue;
            if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
            me.x = p.x + dx * MIN;
            me.z = p.z + dz * MIN;
        }
    }

    /** Where we are in the day: 0–0.5 day, 0.5–1 night. */
    dayPhase() {
        return (((Date.now() - this.dayStart) / DAY_CYCLE_MS) % 1 + 1) % 1;
    }

    /** Is it night now (spiders come out)? */
    get isNight() {
        return this.dayCycle ? this.world.nightAmount > 0.6 : this.config.mode === 'survival';
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

        // Flying costs strength (free world): more than it comes back; at 0 the hero falls
        const c = this.combat;
        if (c.enabled) {
            c.fatigue = Math.max(0, c.fatigue - (flight.hovering ? 1.8 : 2.5) * dt);
            if (c.fatigue <= 0) {
                flight.land('tired');
                this.hud.toast?.('😮‍💨 Нет сил лететь — вы падаете!', 2200);
                return;
            }
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
        // Move in small steps (a fast flight must not jump through a ridge in
        // one frame), checking the whole body — legs, chest and the head with
        // the camera — and a bit ahead, so the view never enters a mountain.
        const ahead = 1.4;
        const col = this.collision;
        const bodyBlocked = (x, y, z) => col.pointBlocked(x, y, z) || col.pointBlocked(x, y + 1.2, z) || col.pointBlocked(x, y + 2.4, z);
        const blocked = () => bodyBlocked(p.x, p.y, p.z) || bodyBlocked(p.x + fx * ahead, p.y, p.z + fz * ahead);
        const dist = out.forward * dt, climb = out.up * dt;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dist), Math.abs(climb)) / 0.5));
        for (let i = 0; i < steps; i++) {
            const px = p.x, py = p.y, pz = p.z;
            p.x += fx * dist / steps;
            p.z += fz * dist / steps;
            p.y = Math.min(110, p.y + climb / steps);
            if (climb > 0 && bodyBlocked(p.x, p.y, p.z)) { p.y = py; } // a ceiling / overhang above
            if (!blocked()) continue;
            // Terrain ahead: a slope we can glide up (follow the relief); a cliff,
            // wall or tree trunk stops us and costs speed.
            const clear = Math.max(col.groundY(p.x, p.z), col.groundY(p.x + fx * ahead, p.z + fz * ahead)) + 2.1;
            const rise = clear - p.y;
            if (rise > 0 && rise < Math.abs(dist / steps) * 1.6 + 0.6) {
                p.y = clear; // glide up the slope
                if (!blocked()) continue;
            }
            p.x = px; p.z = pz;
            if (bodyBlocked(p.x, p.y, p.z)) p.y = Math.max(p.y, py);
            flight.speed *= 0.35;
            break;
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
    /** «Флайн» is known: everywhere but «Свободный мир», where only a scroll of flight teaches it. */
    knowsFlight() {
        return this.config.mode !== 'freeworld' || !!this.bonus?.flight;
    }

    startFlight(force = false) {
        if (this.flight.active) return false;
        if (!force && !this.knowsFlight()) {
            this.hud.setVoice('📜 В «Свободном мире» летать нельзя, пока не найдёте в сундуке <b>Свиток полёта</b> (и не сожжёте его «Инферно»)', true);
            return false;
        }
        // Maps (labyrinths etc.) are meant to be walked: no flying over the walls
        if (this.world.isMap) {
            this.hud.setVoice('🚫 На картах «Флайн» не работает — только в Творчестве, Выживании и Свободном мире', true);
            return false;
        }
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
            const target = this._zombieTarget(z);
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

            // Zombie against zombie («Брейнрот»: the servant and the others fight)
            if (target && target.zombie && target.distSq < 5.3) {
                const now = Date.now();
                if (now - (z.lastAttackTime || 0) > 900) {
                    z.lastAttackTime = now;
                    z.triggerAttack();
                    const dir = _v1.subVectors(target.zombie.group.position, z.group.position).setY(0).normalize().clone();
                    target.zombie.damageCooldown = 0;
                    this.damageZombie(target.zombie, z.isThrall ? 2 : 1, false, dir, z.isThrall ? z.thrallOwner : null);
                }
                continue;
            }
            if (target && (target.zombie || target.follow)) continue;

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
        this.inventory?.dispose();
        this.books?.dispose();
        this.swim?.dispose();
        this.items?.dispose();
        this.wandMagic?.dispose();
        this.gear?.dispose();
        this.bleeding?.dispose();
        this.animals?.dispose();
        this.castleLife?.dispose();
        this.doors?.dispose();
        this.spiders?.dispose();
        if (this.keeper) { this.keeper.save(); this.keeper.dispose(); }
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
