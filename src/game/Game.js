/**
 * Game.js — one play session (creative, survival, custom map or camera test).
 *
 * Owns the scene and every system, runs the frame loop and, in multiplayer,
 * talks to the other players through NetSync. Gameplay rules are the original
 * ones from main.js; see the README for the list of fixes.
 */

import * as THREE from 'three';
import { VoiceGate } from './VoiceGate.js';
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
import { WaterVortex, bubbleLike } from './WaterVortex.js';
import { inStream } from '../fx/InfernoStream.js';
import { Combat, PVP, bombardoDamage } from './Combat.js';
import { Levitation } from './Levitation.js';
import { LevitationMaxima } from './LevitationMaxima.js';
import { Accio } from './Accio.js';
import { Storm, aimedAtSky } from '../fx/Storm.js';
import { Inventory } from './Inventory.js';
import { Builder, BUILD_SPELLS } from './Builder.js';
import { ScrollReading } from './ScrollReading.js';
import { PerfLog } from '../core/PerfLog.js';
import { BookBirds, makeBookModel, SWIFT_PEDESTAL_ID, WARD_PEDESTAL_ID } from './BookBirds.js';
import { RunningBook } from './RunningBook.js';
import { WorldKeeper, restoreWorld, applyPlayerSnapshot } from './WorldSave.js';
import { Quake } from './Quake.js';
import { Swimming } from './Swimming.js';
import { ItemSystem } from './Items.js';
import { WandMagic } from './WandMagic.js';
import { Gear } from './Gear.js';
import { Bleeding } from './Bleeding.js';
import { Dismemberment } from './Dismember.js';
import { Animals, animalModel, goldenTreeModel, bonesModel } from './Animals.js';
import { CastleLife } from './CastleLife.js';
import { Ships } from './Ships.js';
import { DeathSystem } from './Death.js';
import { refusal, HintGate } from './Hints.js';
import { newUid, SPELL_RU, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU, baseSpell, makeItemModel } from './ItemTypes.js';
import { prewarmVillagers } from '../entities/VillagerModel.js';
import { Doors, doorModel } from './Doors.js';
import { Alohomora } from './Alohomora.js';
import { Campfires } from './Campfires.js';
import { Cauldrons } from './Cauldrons.js';
import { Beds } from './Beds.js';
import { Houses } from './Houses.js';
import { Wreck } from './Wreck.js';
import { BurnWreck, burnsInFire } from './BurnWreck.js';
import { WaveAttacks } from './WaveAttack.js';
import { TotalDestruction } from './TotalDestruction.js';
import { LOOT_FOR } from './ItemTypes.js';
import { CircleAttack } from './CircleAttack.js';
import { Inspirius } from './Inspirius.js';
import { Hellfire } from './Hellfire.js';
import { Firefighting } from './Firefighting.js';
import { WaterStorm } from './WaterStorm.js';
import { FallingBlocks } from '../fx/FallingBlocks.js';
import { setNearShadow } from '../core/Shadows.js';
import { SunBeam } from '../fx/SunBeam.js';
import { buildWeapon } from '../entities/WeaponModels.js';
import { Spiders, spiderModel } from './Spider.js';
import { Dragons } from './Dragons.js';
import { Carriages, cartModel } from './Carriages.js';
import { CASTLE_CELL } from '../world/Castles.js';
import { ShipModel } from '../entities/ShipModel.js';
import { buildLayout } from './ShipLayout.js';
import { SHIP_CLASSES } from './ShipTypes.js';
import { dragonModel } from './DragonModel.js';
import { KIND_IDS } from './DragonKinds.js';
import { Travelers } from './Travelers.js';
import { DRAGON_WAND_FIRE } from './DragonKinds.js';
import { Phoenixes, phoenixModel } from './Phoenixes.js';
import { LivingTrees } from './LivingTrees.js';
import { Servants } from './Servants.js';
import { Duel } from './Duel.js';
import { QualityManager, viewDistanceScale } from './Quality.js';
import { FireSystem } from '../world/Fire.js';
import { NetSync } from '../net/NetSync.js';
import { hashString } from '../core/math.js';
import { BLOCK, isCastleBlock, BASE_COLORS, WORLD_GEN, WATER_LEVEL_Y } from '../world/Terrain.js';
import { SeaWaves, WAVES } from '../world/Sea.js';
import { SeaSurface } from '../fx/SeaSurface.js';
import { SurfBoards } from './SurfBoards.js';
import { lookPitch } from '../input/PoseInterpreter.js';
import { headTurnStep, lyingHead } from './HeadTurn.js';
import { heroBody, mountBody, moveSolid } from './BodyContact.js';
import { HandHold } from './HandHold.js';
import { Mana, NOT_SPELLS } from './Mana.js';
import { BodyImpact } from './BodyImpact.js';
import { Knockdown } from './Knockdown.js';
import { UpSpell } from './UpSpell.js';
import { CreatureImpact } from './CreatureImpact.js';
import { HurtFlash } from './HurtFlash.js';
import { ArmorSystem } from './Armor.js';
import { BodyStrikes } from './BodyStrikes.js';
import { HandBlocks } from './HandBlocks.js';
import { SPELL_PHYSICS, blastPush } from './Impact.js';
import { ManaCrystals } from './ManaCrystals.js';
import { HouseWards, isWardSpell, WARD_NAMES, keepIn } from './HouseWards.js';
import { ZombieSpawn, worldLights, litAt } from './ZombieSpawn.js';
import { HouseMagic } from './HouseMagic.js';
import { Drawdown } from './Drawdown.js';
import { Liquidation } from './Liquidation.js';
import { Stitching } from './Stitching.js';
import { Invisibility } from './Invisibility.js';
import { LedgeClimb } from './LedgeClimb.js';
import { Concentration } from './Concentration.js';
import { castingHand, aimedUpOrSelf } from './WandAim.js';

const SPELL_COOLDOWN = 1000;
/** s: «Левиоса» heard again this soon after it lifted something (or sent a charge) is the same phrase */
const LEV_SAME_PHRASE = 2.5;
const WATER_COOLDOWN = 600; // ms between water commands («максима» can be repeated)
const BOMBARDO_WAIT = 700; // ms to wait for «…Максима» after an unfinished «Бомбардо»
// Mana: spells that may still fail after they are paid for — they report their own success (Mana.js)
const MANA_LATER = new Set(['Inferno', 'Hellfire', 'WaterVortexSuperMaxima', 'Bombardo', 'BombardoMaxima', 'Accio', 'LightningStrike', 'TotalDestruction', 'TotalDestructionMaxima', 'Inspirius', 'Sapira', 'Sands', 'Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Jolt', 'JoltMaxima', 'Firefighting', 'FirefightingMaxima', 'CreateHouse', 'ImproveHouse', 'Liquidation', 'LiquidationMaxima']);
const PLAYER_RADIUS = 0.48;
export const DAY_CYCLE_MS = 24 * 60 * 1000;
const ZOMBIE_RADIUS = 0.88;
const BLOCK_COLORS = { [BLOCK.GRASS]: 0x4CAF50, [BLOCK.DIRT]: 0x7a5230, [BLOCK.STONE]: 0x8a8a8a, [BLOCK.SNOW]: 0xf2f6f8 };

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Game {
    /**
     * @param {object} deps {renderer, camera, poseService, voice, sound, hud, net, ui}
     */
    constructor(deps) {
        Object.assign(this, deps);
        this.active = false;
        this.currentPose = null;
        this.voiceGate = new VoiceGate(); // is it me who said the spell (my lips moved)?
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
        // death hooks (Death.js): push (info) => … to run when my player dies / comes back
        this.onDeath = [];
        // «Инферно»'s stream burns: (o, d, len, casterId) => true if something caught fire (e.g. a living tree)
        this.onFlame = [];
        this.onRespawn = [];
        this.cameraBaseRotation = 0;
        this.smoothHead = { yaw: 0, pitch: 0 };
        this.yawNeutral = 0; // head yaw that counts as "straight ahead" (drifting camera)
        this._headTurn = { neutral: 0 };
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
        // world generation: a new world is the newest kind; a saved world and a guest keep theirs
        this.config.gen = this.gen = config.gen ?? (config.saved ? (config.saved.gen ?? 1) : WORLD_GEN);

        progress(62, 'Создание мира...');
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 80);
        this.scene.add(this.camera);

        const isTest = config.mode === 'test';
        this.world = new VoxelWorld(this.scene, {
            seed: this.seed,
            mountains: (config.mode === 'creative' || config.mode === 'freeworld') && !config.map,
            map: config.map || null,
            seas: this.gen >= 2, // (generation 2: seas, sea castles, deeper bedrock)
            testGround: this.gen >= 3 && config.mode === 'creative' && !config.map, // (a river by the pedestals, a castle close by)
            deepCaves: this.gen >= 4, // (caves as in Minecraft: winding, branching, deep)
            lush: this.gen >= 5, // (the new landscape: big mountains, kinds of land, colours — Landscape.js)
        });
        this.world.setNightMode(config.mode === 'survival' && !isTest);
        this.world.viewDistance = viewDistanceScale(config.viewDistance); // «Прорисовка мира» (this computer only)
        // Day and night (creative / free world): 24 min — 12 min day, 12 min night.
        // Everyone in a game shares the host's clock (sent in the welcome message).
        this.dayCycle = !config.map && !isTest && (config.mode === 'creative' || config.mode === 'freeworld');
        // a fresh world starts in the morning; Creative — in the full day (the author: «просто обычный день»)
        this.dayStart = Date.now() - DAY_CYCLE_MS * (config.mode === 'creative' ? 0.3 : 0.04);
        if (this.dayCycle) this.world.setDayPhase(this.dayPhase());
        this.collision = this.world.collision;
        this.terrain = this.world.terrain;
        // the sea (generation-2 worlds): its waves, the same on every computer (src/world/Sea.js)
        const seas = this.terrain?.data?.seas;
        // (what the terrain made of a column: land, sea, or a castle's harbour — calm behind its breakwater)
        this.sea = seas ? new SeaWaves(seas, () => this.seaTime(), (ix, iz) => { const d = this.terrain.data, h = d.heightAt; h(ix, iz); if (!h.sea) return false; return d.castles?.landAt?.(ix, iz)?.harbour ? 'harbour' : true; }) : null;
        this.seaSurface = this.sea && !isTest ? new SeaSurface(this) : null; // the moving sea surface (drawn)
        this.hud.setTerrain(this.terrain);

        this.fx = new Effects(this.scene, this.collision);
        this.spells = new SpellManager(this.scene, this.fx, {
            zombies: () => this.zombies,
            authoritative: () => this.authority,
            damage: (z, amount, isWeapon, dir) => this.damageZombie(z, amount, isWeapon, dir, null),
            sand: (z) => this.sandZombie(z),
            chill: (z, amt) => z.applyChill(amt),
            explode: (p, r, casterId, power) => this.explode(p, r, casterId, power),
            wave: (name, o, d, ph, by) => this.waves.onNet(name, o, d, ph, by), // («Wave Attack»: WaveAttack.js)
            success: (casterId, name) => { if (casterId === this.localId || casterId === 'local') this.mana?.success(name); }, // (mana: my spell worked)
            handPose: (casterId, side) => this.handPose(casterId, side),
            players: (casterId) => this._spellPlayers(casterId),
            weapons: () => this.weapons.weapons,
            blowMe: (casterId, origin, pushAt, name) => this._blowMe(casterId, origin, pushAt, name),
            creatures: (name, casterId, pushAt, opts) => this.creatureImpact.spellArea(name, casterId, pushAt, opts),
            fallWatch: (ck, c, casterId) => this.levitation.watchFall(ck, c, casterId), // («Overgrown»: a fall from up high hurts)
            scatterCrew: (origin, pushAt, casterId) => this.ships?.crew.scatter?.(origin, pushAt, casterId),
            quakeMe: (casterId, origin, reached, power, dir) => this._quakeMe(casterId, origin, reached, power, dir),
            quakeGround: (x, z, power, side) => this.quake.breakGround(x, z, power, side), // (Quake.js: the ground breaks along the crack)
            quakeShake: (front, power) => { this.quake.shake(front, power); if (this.authority && (this._quakeAlarmT || 0) < performance.now() - 500) { this._quakeAlarmT = performance.now(); this.castleLife?.alarm(front, 'quake', null, power > 1 ? 9 : 6); } }, // (…and shakes under whoever is near the wave; the people near take fright)
            storm: (origin) => this.storm?.start(origin, 13),
            sun: (origin) => this.sun?.cast(origin),
            rain: () => this.storm?.startRain(), // («Let it rain»: the whole world, everybody sees it)
            lightningAt: (point, casterId) => { point = this._wardLightning(point, casterId); this.storm?.endIn(3); this.books?.hitAt(point, 3); this.houses?.hitAt(point, 3); this.animals?.hitAt(point, 3, 12, casterId); if (this.authority) { this.castleLife?.alarm(point, 'blast', casterId, 3); this.spiders?.hitAt(point, 3, 20, 'Lightning', casterId); this.phoenixes?.hitAt(point, 3, 20, 'Lightning', casterId); this.dragons?.hitAt(point, 3, 40, 'Lightning', casterId); this.dragons?.noise(point, casterId); this.castleLife?.hitAt(point, 3, 12, casterId); this.livingTrees?.hitAt(point, 3, 20, 'Lightning'); this.ships?.lightningAt(point, casterId); this.ships?.crew.hitAt(point, 3, 12, casterId); this.carriages?.hitAt(point, 3, 30, casterId, 'lightning'); } },
            birdRay: (o, d, len, width, name) => {
                len = this.wards?.clipRay(o, d, len) ?? len; // (a house's sphere stops it from outside)
                this.books?.hitRay(o, d, len, width);
                this.houses?.hitRay(o, d, len, width);
                this.animals?.hitRay(o, d, len, width, 3, this.localId, name);
                if (this.authority) this.spiders?.hitRay(o, d, len, width, name === 'Inferno' ? 8 : name === 'Thunderwave' ? 8 : 5, name);
                if (this.authority) { this.dragons?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); if (name === 'Thunderwave') this.dragons?.noise(o); } // (dragons: fire does nothing — DragonKinds.ON_DRAGON)
                if (this.authority) this.phoenixes?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); // (fire and ice: no harm to a phoenix — Phoenixes.TARGETS)
                if (this.authority) this.castleLife?.hitRay(o, d, len, width, name === 'Inferno' ? 6 : 4, this.localId);
                if (this.authority) this.ships?.crew.hitRay(o, d, len, width, name === 'Inferno' ? 6 : 4, this.localId); // (the ships' crews)
                if (this.authority) this.carriages?.hitRay(o, d, len, width, name === 'Thunderwave' ? 6 : 3, this.localId, name === 'Inferno'); // (the carts on the roads: wood — chipped, fire sets them burning)
            },
            ignite: (o, d, len) => { this.fire.igniteAlong(o, d, len); this.animals?.burnAlong(o, d, len); if (this.authority) this.livingTrees?.burnAlong(o, d, len); },
            // «Инферно» (src/fx/InfernoStream.js): what its stream burns, what stops it, its mana
            burn: (o, d, len, casterId) => this._burnRay(o, d, len, casterId),
            fireBoost: (casterId) => this.fireBoost(casterId), // (the dragon's wand: fire spells +60%)
            waters: () => this._flameWaters(),
            firefight: (sp, dt) => this.firefighting?.act(sp, dt), // («Firefighting»: the spray puts fire out — Firefighting.js)
            blockAt: (x, y, z) => this._flameBlock(x, y, z),
            // a house's sphere of protection (HouseWards.js): spells from outside stop at it
            wardClip: (o, d, len) => this.wards?.clipRay(o, d, len) ?? len,
            wardHit: (a, b) => this.wards?.segmentHit(a, b) || null,
            shielded: (from, to) => !!this.wards?.shields(from, to),
            drain: (casterId, mana, dt) => (casterId === this.localId || casterId === 'local' ? this.combat.drain(mana, dt) : true),
            flameOut: (casterId) => { if (casterId === this.localId || casterId === 'local') { this.hud.setVoice('🔥 Пламя погасло — мана кончилась', true); this.sync?.stopSpells?.(); } },
            doors: (vAt, from) => this.doors?.blow(vAt, from), // (a gust / a burst swings the doors' leaves: Doors.blow)
            windShips: (o, d, power, casterId) => this.ships?.windGust(o, d, power, casterId), // (Wind fills the sails)
            impulseWorld: (name, origin, r, pushAt, casterId) => this._impulseWorld(name, origin, r, pushAt, casterId), // («Wind Impulse»: things, book-birds)
            drawdown: (name, at, casterId) => this.drawdown?.start(name, at, casterId),
            liquidation: (name, o, d, casterId) => this.liquidation?.fly(name, o, d, casterId),
            stitching: (o, d, casterId) => this.stitching?.sew(o, d, casterId),
            collision: this.collision,
            terrain: () => this.terrain,
            leavesAt: (x, y, z) => !!this.world.leavesAt?.(x, y, z), // (the start-area trees' crowns stop a «Бомбардо»)
        });
        if (this.sound) {
            this.sound.setScene(this.scene);
            this.spells.setSoundManager(this.sound);
        }

        // Player
        this.character = new VoxelCharacter(this.scene);
        this.character.stepBoxes = true; // (my hero walks up onto a low box — a stone foot, a chest — as onto a step)
        this.character.setHandVersion(config.handVersion || 'v3');
        this.character.setHandQuality(config.handQuality || 'high');
        this.character.setFirstPerson(this.cameraMode === 'fpv' && !isTest);
        this.character.setShowHands(!!config.showHands);
        if (isTest) this.character.group.position.set(10, 1.5, 10);
        else if (config.look) this.character.setLook(config.look); // the hero made in «Персонаж»

        this.weapons = new WeaponSystem(this);
        this.water = new WaterMagic(this);
        this.vortex = new WaterVortex(this); // «Water Vortex» (+ «Bubble», «Frozen») and «Fire Maxima»
        this.waterStorm = new WaterStorm(this); // «Water Vortex Super Maxima»: a great storm of water held and steered by the wand
        this.combat = new Combat(this); // Свободный мир: HP, fatigue, shields, freezing
        this.mana = new Mana(this); // the mana bar's maximum grows with practice (Mana.js)
        // pushes, staggers, knockdowns, head jolts: my body (BodyImpact + Knockdown), every creature (CreatureImpact)
        this.impact = new BodyImpact(this);
        this.knock = new Knockdown(this);
        this.up = new UpSpell(this); // «Up»: get up from the ground / leap out of the water
        this.creatureImpact = new CreatureImpact(this);
        this.hurtFlash = new HurtFlash(this); // (wounded creatures glow red for a moment)
        this.strikes = new BodyStrikes(this); // my real hands striking bodies (players and creatures)
        this.handBlocks = new HandBlocks(this); // hands never go into blocks: a counter, a wall, a table
        this.ledge = new LedgeClimb(this); // out of a pit / up a ledge: palms on the edge, pulled down
        this._headBase = { yaw: 0, pitch: 0 };
        this.quake = new Quake(this); // «Earthquake»: creatures thrown, the ground breaking, shaking (Quake.js)
        this.drawdown = new Drawdown(this); // «Drawdown»: the ground sinks where the wand points (Drawdown.js)
        this.liquidation = new Liquidation(this); // «Liquidation»: a splash — a thing crumbles into dust (Liquidation.js)
        this.stitching = new Stitching(this); // «Stitching»: a passage sewn shut with stones (Stitching.js)
        this.invis = new Invisibility(this); // «Invisibility»: nobody sees me (Invisibility.js)
        this.levitation = new Levitation(this); // «Вингардиум Левиоса»
        this.levMax = new LevitationMaxima(this); // «Вингардиум Левиоса Максима» (houses, trees, ships, groups)
        this.accio = new Accio(this); // «Акцио»: a thing flies into the hand
        this.storm = new Storm(this); // «Lightning Strike» weather
        this.sun = new SunBeam(this); // «To the Sun»: the clouds part, the rain stops
        this.inventory = new Inventory(this); // five slots under the fatigue bar
        this.inventory._buildWeapon = buildWeapon; // (models of the weapons seen on the back)
        this.inventory._makeItemModel = makeItemModel;
        this.inventory.show(config.mode !== 'test');
        this.builder = new Builder(this); // «Gather», floors, walls, ceilings, roofs
        this.books = isTest ? null : new BookBirds(this); // book-birds: building spells are learned from their books
        this.runner = new RunningBook(this); // the rare running book: caught by hand — +30% run speed
        this.scrolls = new ScrollReading(this); // a scroll opened with both hands and read
        this.swim = new Swimming(this); // deep water: swimming, air, «Air Bubble»
        this.items = new ItemSystem(this); // wands, scrolls, shields, backpacks, bows, food… in the world and the hands
        this.armor = new ArmorSystem(this); // armour and robes: put on by hand / «Suit Up», «Disarmor» (Armor.js)
        this.wandMagic = new WandMagic(this); // a wand: stronger spells, «Люмос», drawing, «Раскрой свои секреты»
        this.gear = new Gear(this); // shields, the bow, Thor's hammer, thunderstorms
        this.bleeding = new Bleeding(this); // blades stuck in bodies, blood, «Rescue»
        this.dismember = new Dismemberment(this); // a blade's edge cuts off arms, legs, heads (any creature)
        this.animals = new Animals(this); // cows, pigs, sheep, horses; golden apple trees
        this.castleLife = new CastleLife(this); // the people of the castles
        this.carriages = new Carriages(this); // carts and the wizards' carriages on the roads (Carriages.js)
        this.travelers = new Travelers(this); // the people of the roads: wanderers, knights errant, carts (Travelers.js)
        this.ships = new Ships(this); // the ships of the sea castles: decks, sails, the wheel, crews, cannons
        this.onFlame.push((o, d, len, casterId) => this.ships.igniteAlong(o, d, len, casterId)); // («Инферно» sets sails and decks on fire)
        this.onFlame.push((o, d, len, casterId) => this._flameBurnsPaper(o, d, len, casterId)); // (scrolls and books in it burn)
        this.death = new DeathSystem(this); // bodies → bones; everything drops at the body
        this.doors = new Doors(this); // «Create a Door», opening by the handle
        this.locks = new Alohomora(this); // «Алохомора»: locked chests, house doors, the gates of throne rooms
        this.boards = new SurfBoards(this); // surfboards: «Create a Board», carried by hand, ridden on waves
        this.campfires = new Campfires(this); // «Fire»: campfires, firewood, cooking (its one light is made before prewarm)
        this.crystals = new ManaCrystals(this); // mana crystals deep in caves (their one light too)
        this.cauldrons = new Cauldrons(this); // big cauldrons: water, things thrown in, brewing potions
        this.beds = new Beds(this); // beds, «Create a Bed», «Change a color», sleeping through the night
        this.houses = new Houses(this); // village houses near the players: doors, glass, beds, chests, families, pens
        this.wards = new HouseWards(this); // «Protection House»: a house's sphere of protection (HouseWards.js)
        this.houseMagic = new HouseMagic(this); // «Create a House», «Improve a House» (HouseMagic.js)
        // after a blast: what hangs in the air falls (src/world/Collapse.js), doors / beds / chests / glass too
        this.wreck = new Wreck(this);
        this.burnWreck = new BurnWreck(this); // a house burning down: what loses its support falls, chests burn (BurnWreck.js)
        this.waves = new WaveAttacks(this); // «Wave Attack»: a real wave raised from the water, aimed by the hand
        this.destruction = new TotalDestruction(this); // «Total Destruction»: the area falls into ruins
        this.circleAttack = new CircleAttack(this); // «Circle Attack» / «… Maxima»: a great wave all round the wizard (arms in a T)
        this.inspirius = new Inspirius(this); // «Inspirius»: the ball of electric light from the wand — the mightiest blast
        this.hellfire = new Hellfire(this); // «Let the Hellfire Come»: a huge fire held and steered by the wand
        this.firefighting = new Firefighting(this); // «Firefighting» / «… Maxima»: water from the hand puts fire out (the Hellfire too)
        this.falling = this.world.terrain ? new FallingBlocks(this.scene, this.world.terrain) : null;
        if (this.falling) this.falling.onLand = (f) => this._fallLanded(f);
        this.spiders = new Spiders(this); // the night boss: a giant spider
        this.dragons = new Dragons(this); // dragons: in their lairs high in the mountains, now and then flying over the world
        this.zombieSpawn = new ZombieSpawn(this); // zombies come out of the dark: caves, the night (ZombieSpawn.js)
        this.phoenixes = new Phoenixes(this); // phoenixes: rare fire birds in the sky; they heal the wounded (Phoenixes.js)
        this.servants = new Servants(this); // «Брейнрот» servants of any kind: follow their master, fight for them
        this.livingTrees = new LivingTrees(this); // «Alive»: a tree comes alive and obeys its caster
        this.focus = new Concentration(this); // the rule of concentration: one held spell at a time (Concentration.js)
        this.lightning = null; // my «Lightning Strike» in progress
        this.duel = new Duel(this); // duel magic: charges at creatures, duels
        this.handHold = new HandHold(this); // handshakes, holding and leading by the hand
        this.fire = new FireSystem(this); // burning trees
        {
            // every spell's fire (the Inferno stream, Hellfire's blaze and ring, a fire-breath) roasts the meat in it
            const F = this.fire, ig = F.ignite.bind(F), al = F.igniteAlong.bind(F);
            F.ignite = (p, r = 1.5) => { this.campfires?.roastIn((q) => q.distanceTo(p) <= r + 0.4); return ig(p, r); };
            F.igniteAlong = (o, d, len) => { this.campfires?.roastIn((q) => inStream(o, d, len, q, 0.5)); return al(o, d, len); };
        }
        this.fire.onCastleBurn = (x, L, z) => this._castleBurnt(x, L, z);
        this.fire.onBlockGone = (x, L, z) => this.burnWreck?.blockGone(x, L, z);
        // Adaptive graphics (resolution, shadows, view distance) for a steady frame rate
        this.quality = new QualityManager(this.renderer, config.graphics ?? 'auto');
        this.perf = config.mode === 'test' ? null : new PerfLog(this); // the performance diary (zns-perf.log)
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
            this.keeper = new WorldKeeper(this, sv ? { id: sv.id, name: sv.name, mode: sv.mode, seed: sv.seed, created: sv.created, players: sv.players, gen: sv.gen ?? 1, createdVersion: sv.createdVersion } : { name: config.worldName });
            if (sv) {
                restoreWorld(this, sv, THREE);
                applyPlayerSnapshot(this, this.keeper.playerFor(this.net?.pid, this.keeper.myName, { self: true }));
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
            // (their handles float at the shoulder of a hero standing at the pedestal's foot: where the hand reaches)
            const s1 = this.world.createPedestal(-7, pz);
            this.weapons.spawnHovering('axe', new THREE.Vector3(-7, s1 + 0.9, pz), 'tA', { byHandle: true });
            const s2 = this.world.createPedestal(7, pz);
            this.weapons.spawnHovering('sword', new THREE.Vector3(7, s2 + 0.9, pz), 'tS', { byHandle: true });
            this.fixedWeapons = ['tA', 'tS'];
            // Creative: one more sword just like it, on its own pedestal (the end of the bows' row)
            if (config.mode === 'creative') {
                const s3 = this.world.createPedestal(17.5, -12);
                this.weapons.spawnHovering('sword', new THREE.Vector3(17.5, s3 + 0.9, -12), 'tS2', { byHandle: true });
                this.fixedWeapons.push('tS2');
            }
            // Creative: a surfboard to try, standing in the ground by the pedestals (the same id on every computer)
            if (config.mode === 'creative') this.boards.spawn({ id: 'cboard0', wood: 0, st: 'stand', p: [-12, this.collision.groundY(-12, -9) + 4.4 * 0.38, -9], yaw: 0 });
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
                    this.items.spawnLoose(it, new THREE.Vector3(x, top + 0.9, z), { hover: true, broadcast: false }); // (at the shoulder of one standing at its foot)
                });
                // …and a wand, scrolls (the spell scrolls, health), the swift book of «Флайн» and a book of building spells
                const magic = [
                    { kind: 'wand', uid: 'cw0', color: 0x8e5bd8, model: 4, fav: 'Inferno', power: 30, dir: 'destroy' },
                    { kind: 'scroll', uid: 'cr1', stat: 'spell', spell: 'LightningStrike' },
                    { kind: 'scroll', uid: 'cr2', stat: 'spell', spell: 'Thunderwave' },
                    { kind: 'scroll', uid: 'cr3', stat: 'hp', amount: 3 },
                    { kind: 'crystal', uid: 'cmc0', count: 1 }, // a mana crystal (break it with both hands)
                ];
                magic.forEach((it, i) => {
                    const x = -12.5 + i * 5, z = -18;
                    const top = this.world.createPedestal(x, z);
                    this.items.spawnLoose(it, new THREE.Vector3(x, top + 0.9, z), { hover: true, broadcast: false }); // (at the shoulder of one standing at its foot)
                });
                const bx = -12.5 + magic.length * 5, bz = -18;
                const btop = this.world.createPedestal(bx, bz);
                this.books?.placeBook(new THREE.Vector3(bx, btop + 1.0, bz), 777001);
                const sx = bx + 5, stop = this.world.createPedestal(sx, bz);
                this.books?.placeBook(new THREE.Vector3(sx, stop + 1.0, bz), SWIFT_PEDESTAL_ID); // (the swift book: «Флайн»)
                const wx = sx + 5, wtop = this.world.createPedestal(wx, bz);
                this.books?.placeBook(new THREE.Vector3(wx, wtop + 1.0, bz), WARD_PEDESTAL_ID); // (the book of protection: «Защита дома»)
                // potions: a cauldron to try (water from the lake with «Waterbollow»), flasks and the
                // healing potion's ingredients (a golden apple, a mana crystal) on pedestals beside it
                this.cauldrons?.spawn({ id: 'ccaul0', x: 20, y: this.collision.groundY(20, -3), z: -3, yaw: 0 });
                const potionKit = [
                    { kind: 'flask', uid: 'cfl0', count: 3 },
                    { kind: 'apple', uid: 'cap0', count: 1 },
                    { kind: 'crystal', uid: 'cmc1', count: 1 },
                ];
                potionKit.forEach((it, i) => {
                    const x = 24.5, z = -9 + i * 5;
                    const top = this.world.createPedestal(x, z);
                    this.items.spawnLoose(it, new THREE.Vector3(x, top + 0.9, z), { hover: true, broadcast: false });
                });
                // a chest to try things with: it opens as you come, and fills up again once you walk away
                const cx = 12, cz = -6;
                const chest = new Chest(this.scene, new THREE.Vector3(cx, this.collision.groundY(cx, cz), cz), 'loot', -Math.PI / 2, 'creative-test');
                chest.mesh.updateMatrixWorld(true);
                chest.boxId = this.collision.addBox(chest.getCollisionBox());
                chest.refill = true;
                this.chests.push(chest);
                // a training dummy: a plain zombie that only stands (see _updateDummy)
                if (this.authority) this.dummyHome = { x: 0, z: -10 };
            }
        }
    }

    /** Creative training dummy: a normal zombie (same hits, same cuts) that never walks, bites or leaves; a new whole one stands up a few seconds after it falls. */
    _updateDummy(dt) {
        const h = this.dummyHome;
        if (!h || !this.authority || this.config.mode !== 'creative') return;
        let d = this.dummy;
        if (d && !this.zombieById.has(d.id)) d = this.dummy = null;
        if (d && d.isDead) {
            this._dummyGone = (this._dummyGone || 0) + dt;
            if (this._dummyGone < 4) return;
            this.removeZombie(d);
            d = this.dummy = null;
        }
        if (!d) {
            this._dummyGone = 0;
            const y = (this.collision?.groundY ? this.collision.groundY(h.x, h.z) : -0.5) + 1.0;
            d = this.dummy = this._createZombie(new THREE.Vector3(h.x, y, h.z));
            d.setDummy();
            d.group.rotation.y = 0;
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

    /**
     * Original frontal spawn: 50–80 m ahead of the player within ±45° (Хардкор's hordes, the
     * Creative slider) — never by a light (a campfire, a «Люмос»: ZombieSpawn.litAt).
     */
    spawnZombieWave() {
        const ch = this.character;
        const lights = worldLights(this);
        let x, z;
        for (let k = 0; k < 8; k++) {
            const angle = ch.group.rotation.y + Math.PI + (Math.random() - 0.5) * (Math.PI / (k < 4 ? 2 : 1));
            const dist = 50 + Math.random() * 30;
            x = ch.group.position.x + Math.sin(angle) * dist;
            z = ch.group.position.z + Math.cos(angle) * dist;
            // Keep inside the small world of «Хардкор» and out of mountains (the endless worlds: anywhere)
            if (this.config.mode === 'survival') {
                x = Math.max(-115, Math.min(115, x));
                z = Math.max(-115, Math.min(115, z));
                if (this.terrain) {
                    for (let i = 0; i < 12 && this.terrain.topLayer(Math.round(x), Math.round(z)) > 1; i++) {
                        x *= 0.85; z *= 0.85;
                    }
                }
            }
            if (!litAt(lights, x, ch.group.position.y, z)) break;
        }
        const y = this.config.mode === 'survival' || !this.terrain ? 0.5 : this.terrain.surfaceY(x, z) + 0.5;
        return this._createZombie(new THREE.Vector3(x, y, z));
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
        this.invis?.noted(this.localId); // (a blow gives an invisible me away: about where)
        if (z.isPlayer) { this.combat.hitRemote(z, dmg, !!weapon?.magic, isWeapon ? hit : null); return; }
        if (z.isAnimal) { this.animals.hit(z, dmg, dir, this.localId); return; }
        if (z.isVillager) { this.castleLife.hit(z, dmg, dir, this.localId, { magic: !!weapon?.magic, weapon: !!isWeapon, hard: !!hit?.hard }); return; }
        if (z.isSailor) { this.ships.crew.hit(z, dmg, dir, this.localId, { magic: !!weapon?.magic, weapon: !!isWeapon }); return; }
        if (z.isDragon) { this.dragons.hit(z, dmg, isWeapon ? 'melee' : 'fist'); return; } // (its scales: a third of a blade's damage)
        if (z.isBoss) { this.spiders.hit(z, dmg, 'melee'); return; }
        if (z.isPhoenix) { this.phoenixes.hit(z, dmg, isWeapon ? 'melee' : 'punch', this.localId); return; }
        if (z.isLivingTree) { this.livingTrees.hit(z, dmg, 'melee'); return; } // (only fire hurts it)
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
        this.perf?.note(`взрыв r${radius.toFixed(0)}${power > 1 ? ' максима' : ''}`);
        // a wand makes my Bombardo destroy more
        if ((casterId === 'local' || casterId === this.localId) && this._lastSpell && performance.now() - this._lastSpell.at < 6000) radius *= 1 + (this._lastSpell.pw - 1) * 0.5;
        const keep = this.wards?.keepFor(pos, radius) || [];
        this.applyExplosion(pos, radius, true, power, casterId, keep);
        this.explosions.push({ p: [pos.x, pos.y, pos.z], r: radius, ...(keep.length ? { k: keep } : {}) }); // (k: the houses' spheres it could not eat into)
        // («Бомбардо» cracks a house's sphere — three break it —, «Бомбардо Максима» breaks it at once)
        if (power >= 1) this.wards?.struck(pos, radius, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId === 'local' ? this.localId : casterId);
        if (this.sync) this.sync.explosion(pos, radius, power, casterId);
    }

    /** A falling piece of a building hit the ground: dust, the broken blocks fly, who was under it is hurt. */
    _fallLanded(f) {
        if (!f.landed.length && !f.broken.length) return;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, sx = 0, sy = 0, sz = 0;
        const all = f.landed.length ? f.landed : f.broken.map(([x, L, z, t]) => [x, L - f.d, z, t]);
        for (const [x, L, z] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, L - 1.5); sx += x; sy += L - 1; sz += z; }
        const c = new THREE.Vector3(sx / all.length, sy / all.length, sz / all.length);
        const debris = f.broken.map(([x, L, z, t]) => ({ x, y: L - f.d - 1, z, color: BASE_COLORS[t] ?? 0x888888 }));
        for (let i = 0; i < Math.min(40, all.length); i++) { const [x, L, z] = all[Math.floor(Math.random() * all.length)]; debris.push({ x, y: y0 + 0.2, z, color: 0x9a8f80, size: 0.6 }); }
        this.fx.debrisFrom(debris, new THREE.Vector3(c.x, y0 + 0.5, c.z), 160);
        this.sound?.playExplosion?.(c, this.character.group.position, Math.min(0.6, 0.1 + f.d * 0.04));
        // whoever stood under it (a body is ~4.6 m tall)
        const dmg = Math.min(14, Math.round(2 + f.d * 1.2));
        const r = Math.max(x1 - x0, z1 - z0) / 2 + 0.6;
        const me = this.character.group.position;
        const under = (p, h = 4.6) => p.x > x0 - 0.6 && p.x < x1 + 0.6 && p.z > z0 - 0.6 && p.z < z1 + 0.6 && p.y > y0 - h - 1 && p.y < y0 + 1.5;
        if (under({ x: me.x, y: me.y - 1.95, z: me.z }) && !this.isDeadLocal) {
            if (this.combat?.enabled) this.combat.damage(dmg, null, 'collapse'); else this.damageLocalPlayer?.(dmg);
            this.hud?.setVoice?.(`🧱 На вас обрушилось: −${dmg}`, true);
        }
        if (this.authority) {
            const at = new THREE.Vector3(c.x, y0 - 1, c.z);
            this.castleLife?.hitAt(at, r, dmg, null);
            this.animals?.hitAt?.(at, r, dmg, null);
        }
        this.wreck?.afterBlast(c, r);
    }

    /** Visual + world part of an explosion (runs on every machine). */
    applyExplosion(pos, radius, authoritative, power = 1, casterId = null, keep = undefined) {
        // `power` times the energy: damage × power, thrown objects × √power speed
        const push = Math.sqrt(power);
        // (a house's sphere of protection: the blast doesn't eat into it from outside)
        const out = this.world.explode(pos, radius, keepIn(keep ?? this.wards?.keepFor(pos, radius)));
        const meSafe = !!this.wards?.shields(pos, this.combat.center(_v3));
        for (const f of out.falls || []) this.falling?.add(f); // (a roof without walls comes down)
        this.wreck?.afterBlast(pos, radius, power);
        // a blast in a castle or a village: the guards hear it (and want to know who)
        if (authoritative) {
            let wrecked = 0;
            for (const b of out.blocks) if (isCastleBlock(b.type)) wrecked++;
            this.castleLife?.damaged(pos, casterId === 'local' || !casterId ? this.localId : casterId, wrecked, true, { r: radius });
        }
        const debris = [];
        for (const b of out.blocks) debris.push({ x: b.x, y: b.y, z: b.z, color: BLOCK_COLORS[b.type] ?? BASE_COLORS[b.type] ?? 0x7a5230 });
        for (const p of out.props) debris.push(p);
        this.fx.explosion(pos, radius, power);
        this.water.explode(pos, radius);
        // A blast sets the trees around it on fire
        this.fire.ignite(pos, radius + 2);
        this.books?.hitAt(pos, radius + 1);
        this.houses?.hitAt(pos, radius);
        if (authoritative && power >= 1) this.livingTrees?.hitAt(pos, radius, 8 * power, power > 1 ? 'BombardoMaxima' : 'Bombardo'); // (a burst tears a living tree apart — not a cannonball)
        if (authoritative) { this.animals?.hitAt(pos, radius, 6 * power, casterId); this.spiders?.hitAt(pos, radius, 12 * power, 'Bombardo', casterId); this.phoenixes?.hitAt(pos, radius, 10 * power, 'Bombardo', casterId); this.dragons?.hitAt(pos, radius, 12 * power, 'Bombardo', casterId); this.dragons?.noise(pos, casterId); this.castleLife?.hitAt(pos, radius, 8 * power, casterId); this.ships?.blast(pos, radius, power, casterId); this.ships?.crew.hitAt(pos, radius, 8 * power, casterId); this.carriages?.hitAt(pos, radius, 25 * power, casterId, 'blast'); }
        if (!meSafe) this.combat.explosion(pos, radius, power, casterId === 'local' ? this.localId : casterId);
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
        this.boards?.blast(pos, radius, power);
        this.cauldrons?.blast(pos, radius, power); // (a cauldron near the blast is thrown aside, knocked over)
        // the blast's wave swings the doors round it (those right at it are broken: Wreck.afterBlast)
        const wave = radius + 8 * push;
        this.doors?.blow((p) => { const d = _v2.subVectors(p, pos).setY(0); const L = d.length(); return L > wave || L < 1e-3 ? null : d.multiplyScalar(26 * push * (1 - L / wave) / L); }, pos);
        if (dPlayer < radius + 3 && !meSafe) {
            // thrown by the blast: near it off the feet (and up into the air), further a stagger
            const k = 1 - dPlayer / (radius + 3);
            const name = power > 1 ? 'BombardoMaxima' : 'Bombardo';
            _v1.set(pp.x - pos.x, 0, pp.z - pos.z);
            if (_v1.lengthSq() < 1e-6) _v1.set(0, 0, 1);
            _v1.normalize().multiplyScalar(blastPush(dPlayer, radius, power));
            this.impact.apply({ v: _v1.clone(), from: pos.clone(), by: casterId === 'local' ? this.localId : casterId, spell: name, cause: power < 1 ? 'cannon' : null, blast: true,
                toss: k > 0.35 && !this.flight.active ? 10 * k * push : 0, jolt: SPELL_PHYSICS[name].jolt * k, down: SPELL_PHYSICS[name].down });
        }
        // My own Bombardo too close to me hurts me too — the closer, the worse
        // (point-blank can kill). Not in creative. Other players' blasts: Combat.explosion.
        if ((casterId === 'local' || casterId === this.localId) && !meSafe) {
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
            // every creature near it: off its feet or reeling (zombies and animals are already thrown above / by Animals)
            const name = power > 1 ? 'BombardoMaxima' : 'Bombardo';
            this.creatureImpact.spellArea(name, casterId, (p) => {
                const d = p.distanceTo(pos);
                if (d > radius + 3) return null;
                const v = new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z);
                if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
                return v.normalize().multiplyScalar(blastPush(d, radius, power));
            }, { from: pos.clone(), noSlide: (c) => !c.isVillager });
        }
    }

    // ================================================================= chests
    _updateChests(dt) {
        if (!this.chests.length) return;
        const players = this._playerPositions();
        const ids = [this.localId, ...this.remotes.keys()];
        const me = this.character.group.position;
        for (const chest of this.chests) {
            chest.update(dt);
            // (chests stand in rooms and houses: drawn only near, shadows only very near)
            const cp0 = chest.mesh.position;
            const dd = Math.abs(cp0.x - me.x) + Math.abs(cp0.z - me.z);
            chest.mesh.visible = dd < 45;
            if (chest.mesh.visible) setNearShadow(chest.mesh, dd < 20);
            // the creative test chest: shut and full again a while after everybody walked away
            if (chest.refill && chest.isOpen && !chest.animating && this.authority) {
                const far = players.every((p) => Math.hypot(p.x - chest.mesh.position.x, p.z - chest.mesh.position.z) > 10);
                chest.awayT = far ? (chest.awayT || 0) + dt : 0;
                if (chest.awayT > 4) { chest.awayT = 0; chest.close(); }
            }
            if (chest.isOpen || chest.locked || !this.authority) continue; // (castle chests: locked while the king lives)
            const cp = chest.getPosition();
            for (let i = 0; i < players.length; i++) {
                const p = players[i];
                const dx = p.x - cp.x, dz = p.z - cp.z;
                if (dx * dx + dz * dz < 4.5 * 4.5 + 9) {
                    this.openChest(chest, null, ids[i]);
                    break;
                }
            }
        }
    }

    /** A chest's pouch of coins (a castle's treasury holds much more; a poor house — little or nothing). */
    _chestPouch(chest) {
        const coins = chest.cart ? (chest.cart.magic ? 60 + Math.floor(Math.random() * 140) : 10 + Math.floor(Math.random() * 40)) : chest.house ? (chest.house.rich ? 20 + Math.floor(Math.random() * 70) : Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 15))
            : chest.ship ? (chest.local?.room === 'captain' ? 60 + Math.floor(Math.random() * 120) : 10 + Math.floor(Math.random() * 40))
            : chest.castle ? 40 + Math.floor(Math.random() * (chest.room === 'treasury' || chest.room === 'vault' ? 260 : 120)) : 5 + Math.floor(Math.random() * 30);
        return coins > 0 ? [{ kind: 'coins', uid: newUid(), count: coins }] : [];
    }

    /**
     * (host) A chest that was never opened burnt down (BurnWreck.js): its things are rolled as on
     * opening; what burns is gone, the rest (coins, steel, magic things…) lies in the ashes.
     */
    spillBurntChest(chest, rp) {
        if (chest.store) { if (this.authority) this.houseMagic?.chestBurnt(chest, rp); return; } // (a magic house's chest: what was put in it)
        if (!this.authority || chest.itemType !== 'loot' || chest.ship) return;
        const testing = this.config.mode === 'creative' && /^(cvtest|creative-test)/.test(String(chest.id));
        const L0 = new Set(this.items.loose.keys()), W0 = new Set(this.weapons.weapons);
        this.items.lootChest(rp, Math.random, chest.house || null, chest.room === 'port' ? 'port' : null, { chest, extra: this._chestPouch(chest), key: testing ? 1 : undefined });
        for (const [uid, L] of [...this.items.loose]) {
            if (L0.has(uid)) continue;
            if (burnsInFire(L.item)) { this.items.removeLoose(uid); this.sync?.itemGone?.(uid, null, null); continue; }
            L.hover = null; L.rise = null; // (it falls into the ashes)
            L.model.position.y = rp.y + 0.2;
            L.vel.set((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2);
        }
        for (const w of this.weapons.weapons) if (!W0.has(w) && w.hover) { w.hover = null; w.position.y = rp.y + 0.3; w.wake?.(); }
    }

    openChest(chest, rewardId = null, by = null) {
        if (!chest.open()) return;
        if (this.sound) this.sound.playChestOpen(chest.getPosition());
        // a magic house's chest: what was put into it rises out of it (HouseMagic.js)
        if (chest.store) { if (this.authority) { this.houseMagic.chestOpened(chest); this.sync?.chestOpenedLoot?.(chest); } return; }
        const id = rewardId || `c${chest.id}`;
        if (chest.itemType === 'loot') {
            // a cave chest: wands, scrolls, shields… float up out of it
            if (this.authority) {
                chest.mesh.updateMatrixWorld(true);
                const rp = chest.getRewardPosition(new THREE.Vector3());
                // (who opens it: his mana maximum — «Inspirius»' scroll is only for 500+)
                const opener = by && by !== this.localId ? this.remotes.get(by) : null;
                LOOT_FOR.maxMana = opener ? (opener.maxMana || 0) : (this.combat?.maxFatigue || 0);
                const pouch = this._chestPouch(chest);
                if (!chest.ship) pouch.push(...(this.houseMagic?.scrollFor(by) || [])); // (the first «Create a House» scroll of each player is easy to find)
                if (chest.ship) {
                    chest._openedBy = by; this.ships.lootChest(chest, rp); // (a ship's chest: often a fishing rod)
                    for (const it of pouch) this.items.spawnLoose(it, rp.clone().add(new THREE.Vector3(0, 1.1, 0)), { hover: true, rise: true }); // (within the hand's reach)
                } else {
                    // (Creative: the test cave's chests and the test chest by the pedestals always hold a precious thing — to try things out)
                    const testing = this.config.mode === 'creative' && /^(cvtest|creative-test)/.test(String(chest.id));
                    this.items.lootChest(rp, Math.random, chest.house || null, chest.room === 'port' ? 'port' : null, { chest, extra: pouch, key: testing ? 1 : undefined });
                } // (a port chest: the sailors' stores; all in one row along the chest, within reach)
                // (a house chest opening is no theft by itself: taking a thing out of it is — Items.pickUp)
                LOOT_FOR.maxMana = 0;
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
                // (a cave system: a chest in each of its chambers that has one; an old cave: one in its chamber)
                const spots = cv.chests || [{ x: cv.kx + 0.5, y: cv.F, z: cv.kz + 0.5, a: Math.atan2(cv.ex - cv.kx, cv.ez - cv.kz) }];
                spots.forEach((sp0, k) => {
                    const sp = cv.segs && t.chestSpot ? t.chestSpot(sp0) : sp0; // (never stuck in the rock)
                    if (!sp) return;
                    const id = k ? cv.id + ':' + k : cv.id;
                    const chest = new Chest(this.scene, new THREE.Vector3(sp.x, sp.y, sp.z), 'loot', sp.a, id);
                    chest.mesh.updateMatrixWorld(true);
                    chest.boxId = this.collision.addBox(chest.getCollisionBox());
                    this.chests.push(chest);
                    if (this._openedChests?.has(id)) chest.setOpenInstant();
                    if (this.authority && this.config.mode === 'freeworld') {
                        const n = 2 + ((cv.r + k) % 3);
                        for (let i = 0; i < n; i++) {
                            const a = (i / n) * Math.PI * 2;
                            const z = this._createZombie(new THREE.Vector3(sp.x + Math.cos(a) * 3, sp.y - 0.5, sp.z + Math.sin(a) * 3));
                            z.setSleeping?.(true);
                        }
                    }
                });
            }
        }
        // darkness: rock above the head
        const head = Math.floor(p.y + 2.4 + 1.5);
        // rock above the head here and around (so the light doesn't flicker at the edges)
        let n = 0;
        for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (t.solidIn(Math.round(p.x) + dx, Math.round(p.z) + dz, head, head + 14)) n++;
        const covered = n >= 3 ? 1 : 0;
        // under the roof of a castle or a village house: lit rooms (lanterns, windows), not a dark cave
        const built = covered && !!(t.sites || t.castles)?.landAt(Math.round(p.x), Math.round(p.z)); // (castles and wizards' towers)
        // in a cave: as dark as the daylight reaching the head (the mouth lit, deeper in dark — the
        // same light as the rock round it, Terrain._skyLight); elsewhere under a roof: dark
        const sky = t.skyAt ? t.skyAt(p.x, p.y + 1.2, p.z) : 1;
        const dark = sky < 1 ? 1 - sky : covered && !built ? 1 : 0;
        this._caveK = (this._caveK || 0) + (dark - (this._caveK || 0)) * Math.min(1, dt * 1.5);
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
        // (an invisible player: where they were last noticed, for a few seconds — Invisibility.aiPos)
        const seen = (id, pos) => (this.invis ? this.invis.aiPos(id, pos) : pos);
        let best = seen(this.localId, this.character.group.position), bestId = this.localId, bestD = best ? p.distanceToSquared(best) : Infinity;
        if (this.isDeadLocal) { best = null; bestD = Infinity; }
        for (const [id, r] of this.remotes) {
            if (r.dead) continue;
            const rp = seen(id, r.position);
            if (!rp) continue;
            const d = p.distanceToSquared(rp);
            if (d < bestD) { bestD = d; best = rp; bestId = id; }
        }
        return best ? { pos: best, id: bestId, distSq: bestD } : null;
    }

    /** Where my spell leaves `side`: the wand's tip when the wand is in that hand, else the hand. */
    castOrigin(side, out = new THREE.Vector3()) {
        const w = this.items?.heldOf('wand');
        return w && w.side === side ? this.wandMagic.tip(out) : this.character.getHandWorldPosition(side, out);
    }

    handPose(casterId, side) {
        if (casterId === 'local' || casterId === this.localId) {
            return { origin: this.castOrigin(side), dir: this.character.getHandDirection(side) };
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
            this.runner?.onDeath();
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
        const paid = this.combat.paidCount || 0;
        this._manaLater = false;
        const name = this._castLocalSpell(text, isFinal);
        if (name) this._castAt = performance.now(); // (the wand never leaves the hand while a spell is going: spellBusy)
        // another spell from the wand that holds my «Protection»: it knocks the shield down (Combat.castFrom) — except Lumos: a light on the wand tip is no spell in the way
        if (name && name !== 'Protection' && name !== 'ProtectionMaxima' && name !== 'Lumos' && name !== 'LumosMaxima' && !NOT_SPELLS.has(name) && name !== 'Maxima') this.combat.castFrom(this.wandSide());
        if (name && name !== 'Invisibility' && name !== 'Stand') this.invis?.noted(this.localId); // (a spell gives an invisible caster away: about where)
        // mana: a spell paid for that always works counts at once; the others report it themselves when they work
        if (name && (this.combat.paidCount || 0) > paid && !this._manaLater && !MANA_LATER.has(name)) this.mana?.success(name);
        return name;
    }

    /** The hand holding a wand (null: none). While a wand is held, every spell is cast with that hand. */
    wandSide() {
        return this.items?.heldOf?.('wand')?.side || null;
    }

    /** A spell of mine is going (or was just cast): the wand stays in the hand whatever the hand does. */
    spellBusy() {
        if (performance.now() - (this._castAt || -1e9) < 4000) return true;
        // (Lumos lit, or just thrown by a flick: that flick throws the light, never the wand)
        if (this.wandMagic?.light || performance.now() - (this.wandMagic?._thrownAt || -1e9) < 1500) return true;
        return !!(this.hellfire?.busy || this.waterStorm?.busy || this.vortex?.busy || this.water?.active || this.levitation?.active || this.levMax?.active || this.accio?.active || this.waves?.busy || this.lightning || this.wandMagic?.drawing);
    }

    _castLocalSpell(text, isFinal = true) {
        if (!this.active) return null;
        let name = matchSpell(text);
        // the vortex waits for «Bubble»: a word that sounds like it is it (the recognizer writes it many ways)
        if (this.vortex?.bubbleOpen?.() && name !== 'AirBubble' && (!name || name === 'Sands' || name === 'Sapira') && bubbleLike(text)) name = 'AirBubble';
        if (!name && isFinal && this.vortex?.bubbleOpen?.()) this.hud.setVoice(`🫧 Слышу «${String(text).slice(0, 40)}» — для шара скажите «Bubble» или «Пузырь»`, true);
        if (!name) return null;
        if (this.combat.dead) return null;
        if (!this.knowsSpell(name)) {
            if (isWardSpell(name)) { if (isFinal) this._why('wardUnknown', name); return null; }
            const base = SCROLL_SPELL_COLOR[name] ? name : baseSpell(name), ru = SPELL_RU[base] || name, ribbon = SCROLL_RIBBON_RU[base];
            if (isFinal) this.hud.setVoice(`📜 «${ru}» вы ещё не знаете. Найдите в сундуке <b>свиток «${ru}»</b>${ribbon ? ` (${ribbon} лента)` : ''} и сожгите его «Инферно»`, true);
            return null;
        }
        // the rule of concentration: while a spell is held no other works — first «стоп» (Concentration.js;
        // the held spell's own words, Lumos, Nox, «стоп», the shield are free; Creative too)
        if (this.focus.gate(name, isFinal, !!BUILD_SPELLS[name])) return null;
        // «Water Vortex», its «Bubble» / «Frozen», «Fire Maxima» (and nothing else from inside its ice)
        const vx = this.vortex.voice(name, text, isFinal);
        if (vx !== undefined) return vx;
        if (this.combat.frozen || this.combat.stunned) { this.hud.setVoice(this.combat.check(name), true); return null; }
        // both hands cut off: no spell (the stump still stops the blood with «Rescue»)
        if (this.character.handLost?.('left') && this.character.handLost?.('right') && name !== 'Rescue' && name !== 'Stand') { if (isFinal) this.hud.setVoice('🩸 Без рук колдовать нельзя', true); return null; }
        // «Up»: a raised hand, lying (get up) or in the water (leap out)
        if (name === 'Up') return this.up.cast(isFinal);
        // lying on the ground: look, aim, shield and cast — but no flying off or stamping the ground
        if (this.knock.down && /^(Flight|Earthquake|Breakthrough)/.test(name)) { if (isFinal) this.hud.setVoice('🧍 Сначала встаньте', true); return null; }
        // «Stand» places a door / finishes a building; «стоп» also ends every spell still going
        // (before the duel's block: nothing may keep you from stopping your own spells)
        if (name === 'Stand') {
            if (this.wards?.setting) { this.wards.fix(); return 'Stand'; } // («стоп»: my house's dome stays as big as it grew)
            const placed = !!this.doors?.stand?.() || (this.builder.build ? (this.builder.finish(), true) : false);
            const stopped = (!placed || /стоп|stop/i.test(text)) && this.stopSpells();
            return placed ? 'Stand' : stopped ? 'Stop' : null;
        }
        // «Паузин» in the air: hover; «Флайн» while hovering: fly on (no new take-off)
        if (name === 'Pause') {
            if (this.flight.pause()) { this.hud.setVoice('🛑 Паузин — вы парите на месте. Скажите «Флайн», чтобы лететь дальше', true); return 'Pause'; }
            if (isFinal) this.hud.setVoice('«Паузин» работает только в полёте', true);
            return null;
        }
        if (name === 'Flight' && this.flight.hovering) { this.flight.resume(); return 'Flight'; }
        // Shield: arm stretched out (or a T for Maxima), not raised to the face
        if (name === 'Protection' || name === 'ProtectionMaxima') return this._castProtection(name, isFinal);
        // «Максима» while my house's dome grows: it grows twice as fast (before the water's / the duel's)
        if (name === 'Maxima' && this.wards?.setting && !this._inDuel()) return this._castWard('WardGrow', isFinal);
        // «Максима» alone during my clash: more push (−5 mana, +5 %, once every 3 s — Duel.js)
        if (name === 'Maxima' && this._inDuel() && !this.water?.active) return this.duel.maxima(isFinal);
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
            // my servants (a living tree, «Брейнрот») go for the one the hand points at
            if (this.levitation.state?.kind !== 'weapon' && this.servants.hasServants(this.localId)) return this._commandAttack(isFinal);
            const hint = this.levitation.attack();
            if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
            return 'Attack';
        }
        if (name === 'CreateBed' || name === 'ChangeColor') return this.beds.cast(name, text, isFinal);
        if (name === 'CreateHouse' || name === 'ImproveHouse') return this.houseMagic.cast(name, isFinal); // (HouseMagic.js)
        if (isWardSpell(name)) return this._castWard(name, isFinal, text); // «Защита дома» (HouseWards.js)
        // the spell's strength with the wand in the hand (used by damage while it acts)
        this._lastSpell = { name, pw: this.wandMagic.power(name), at: performance.now() };
        this.perf?.note('заклинание ' + name);
        this.noteCaster(name, this.localId);
        // Inferno with a scroll (or a spell book) in the hand burns it: its power is yours
        if (name === 'Inferno' && this.items.heldOf('scroll')) { this.items.burnHeldScroll(); return 'Inferno'; }
        if (name === 'Inferno' && this.burnHeldBook()) return 'Inferno';
        // Duel magic: a charge flies at the creature the hand points at
        // Duel spells need a raised, pointing hand: the word alone (e.g. a friend's voice
        // reaching this microphone) never fires them while the arms hang down
        // «Айс» is a duel spell too («Frozen» without a water ball as well) — but with a water ball it
        // freezes the water, and right after freezing water the ice words belong to the water
        let ice = false;
        if ((name === 'Ice' || name === 'Frozen') && !this.water.active) {
            if (performance.now() - (this.water.frozenAt || -1e9) < 4000) return null;
            ice = true;
        }
        // («Джолт» alone, still being spoken: wait — it may yet be «Джолт Максима»)
        if (name === 'Jolt' && !isFinal) return null;
        // («Firefighting» alone, still being spoken: it may yet be «Firefighting Maxima»)
        if (name === 'Firefighting' && !isFinal) return null;
        // «Suit Up»: the best armour of the slots and of what lies near — on at once (Armor.js)
        if (name === 'SuitUp') return this.armor.suitUp(isFinal);
        const duelSpell = name === 'Sapira' ? 'SapiraDuel' : name === 'Sands' ? 'SandsDuel' : ice ? 'IceDuel' : (name === 'Stupefy' || name === 'AvadaKedavra' || name === 'Expelliarmus' || name === 'Disarmor' || name === 'Jolt' || name === 'JoltMaxima') ? name : null;
        if (duelSpell) {
            const aim = this.duel.pickSide(false);
            const side = aim ? aim.side : this.wandSide() || (this.character.isArmRaised(this.magicHand || this.lastMagicHand || 'right') ? (this.magicHand || this.lastMagicHand || 'right') : (this.wandSide() || ['right', 'left'].find((s) => this.character.isArmRaised(s))));
            if (!side || !this.character.isArmRaised(side)) {
                if (isFinal) this.hud.setVoice('✋ Поднимите руку и направьте её на цель — тогда заклинание сработает', true);
                return null;
            }
            return this._castDuel(ice ? 'Ice' : name, duelSpell, isFinal, aim || null, side); // («Frozen» without water costs what «Айс» costs)
        }
        if (name === 'Accio') return this._castAccio(isFinal);
        if (name === 'Alohomora' || name === 'AlohomoraMaxima') return this.locks.cast(name, isFinal); // (a lock the hand points at — Alohomora.js)
        if (name === 'Unfurl' || name === 'UnfurlMaxima' || name === 'Furl') return this.ships ? this.ships.castSails(name, text, isFinal) : null; // (a ship's sails)
        if (name === 'Fire') return isFinal ? this.campfires.cast(isFinal) : null; // (unfinished «Fire…»: it may be «Fire Maxima»)
        if (name === 'Wind' || name === 'WindMaxima' || name === 'Overgrown' || name === 'OvergrownMaxima') return this._castWind(name, isFinal);
        if (name === 'Brainrot') return this._castBrainrot(isFinal);
        if (name === 'Alive') return this.livingTrees.cast(isFinal);
        if (name === 'LightningStrike') return this._castLightning(isFinal);
        if (name === 'TotalDestruction' || name === 'TotalDestructionMaxima') return this.destruction.cast(isFinal, name);
        if (name === 'CircleAttack' || name === 'CircleAttackMaxima') return this.circleAttack.cast(isFinal, name);
        if (name === 'Inspirius') return this.inspirius.cast(isFinal);
        if (name === 'Hellfire') return this.hellfire.cast(isFinal);
        if (name === 'WaterVortexSuperMaxima') return this.waterStorm.cast(isFinal);
        if (name === 'ToTheSun') return this._castSun(isFinal);
        if (name === 'LetItRain') return this._castRain(isFinal);
        if (BUILD_SPELLS[name]) return this._castBuild(name, isFinal);
        if (name === 'Earthquake' || name === 'EarthquakeMaxima') return this._castEarthquake(name, isFinal);
        // «Вингардиум Левиоса Максима»: a group, a tree, a house, a ship (LevitationMaxima.js)
        if (name === 'LevitationMaxima') return this.levMax.cast(isFinal);
        if (name === 'WindImpulse' || name === 'WindImpulseMaxima') return this._castImpulse(name, isFinal);
        if (name === 'Drawdown' || name === 'DrawdownMaxima') return this.drawdown.cast(name, isFinal);
        if (name === 'Liquidation' || name === 'LiquidationMaxima') return this.liquidation.cast(name, isFinal);
        if (name === 'Stitching') return this.stitching.cast(isFinal);
        if (name === 'Invisibility') return this.invis.cast(isFinal);
        // Levitation: point the hand at an object or a living body (a wizard: a duel spell)
        if (name === 'Levitation') {
            // The same phrase heard again — the microphone repeats an unfinished phrase many times
            // while it is still being said, and gives the final one later — is not a new
            // «Левиоса»: it must not let go of what that phrase has just lifted (a wizard lifted
            // by the charge was set down again at once: he only "jumped"), nor send a second
            // charge after the first. Letting go takes a new phrase.
            const L = this.levitation;
            if (performance.now() - (this._levDuelAt || -1e9) < LEV_SAME_PHRASE * 1000) return null;
            if (L.active && L.state.age < LEV_SAME_PHRASE) return null;
            // (a wizard: a charge flies — the duel decides; an animal / zombie / villager is lifted like a thing)
            // (a wizard pointed at right on the line — or as loosely as at a thing, when no thing
            //  is pointed at more truly: Levitation.aimWizard; a fighting spell's narrow aim alone
            //  missed a friend a little beside the hand's line, and «Левиоса» then lifted nothing)
            const aim = L.active ? null : this.duel.pickSide(true) || L.aimWizard();
            if (aim && aim.t.kind === 'p') {
                const r = this._castDuel('Levitation', 'LevitateDuel', isFinal, aim);
                if (r) this._levDuelAt = performance.now();
                return r;
            }
            return this._castLevitation(isFinal);
        }
        // Water bending: the hand is at the water / holding the ball, not raised to the face
        const waterName = this._waterSpell(name);
        if (waterName) return this._castWater(waterName, text, isFinal);
        if (name === 'Maxima') { if (isFinal) this._why('maximaAlone'); return null; }
        const recent = this.isMagicActive || Date.now() - this.lastMagicTime < 1500;
        // Flight has its own gesture (both arms up) — checked in startFlight
        if (!recent && name !== 'Flight') { if (isFinal) this._why('handDown', name); return null; }
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
        if (now - this.lastSpellCastTime < SPELL_COOLDOWN) { if (isFinal && !early) this._why('cooldown'); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        if (name === 'Flight' && !this.startFlight()) return null;
        this.combat.pay(name);
        this._interimCast = isFinal ? null : { name, at: now };
        this.lastSpellCastTime = now;
        if (name === 'Flight') return name;
        const side = this.wandSide() || this.magicHand || this.lastMagicHand || 'right';
        const origin = this.castOrigin(side);
        const dir = this.character.getHandDirection(side);
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        return name;
    }

    /**
     * A recognized spell that did not work, and why (Hints.refusal), on the message line —
     * once per reason every two seconds (the recognizer repeats a phrase many times).
     */
    _why(code, name = null) {
        const gate = this._hintGate || (this._hintGate = new HintGate(2000));
        if (!gate.pass(code)) return;
        const text = refusal(code, { name: name ? SPELL_RU[baseSpell(name)] || name : null });
        if (text) this.hud.setVoice(text, true);
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

    /**
     * «Protection House» (with «Maxima» its dome grows twice as fast; a «Максима» alone while it
     * grows does the same), «Protection Invisible», «Protection House Grant»: once per phrase (the
     * recognizer repeats an unfinished phrase).
     */
    _castWard(name, isFinal, text = '') {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastWardCast?.[name] || 0) < (name === 'WardGrow' ? 600 : 1500)) return null;
        const r = name === 'WardGrow' ? this.wards.maxima() : this.wards.cast(name, isFinal, /макс|max|мах/i.test(text || ''));
        if (!r) return null;
        (this._lastWardCast || (this._lastWardCast = {}))[name] = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return r;
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

    /**
     * «Стоп»: what is still going stops — the shield, a lifted thing (it falls), a water
     * ball, an air bubble, a wave, Lumos and drawing, a hologram, a summoning, the flight
     * (it lands), flames / ice beams / the storm held in the hands. True if anything did.
     */
    stopSpells() {
        const done = [];
        const W = this.wandMagic;
        if (this.combat.dropShield('🛑 Стоп — щит снят')) done.push('щит');
        if (this.levitation.active) { this.levitation.release(false); done.push('Левиоса'); }
        if (this.levMax?.stop()) done.push('Левиоса Максима'); // (what it holds falls)
        if (this.water?.active) { this.water.drop(); done.push('водяной шар'); }
        if (this.vortex?.stop()) done.push('водоворот');
        const hf = this.hellfire?.sayStop(); // («стоп» costs 50 mana for it)
        if (hf === true) done.push('адский огонь');
        const ws = this.waterStorm?.sayStop(); // (and 50 for the water storm)
        if (ws === true) done.push('водяная буря');
        if (this.swim?.bubble) { this.swim._popBubble(); done.push('пузырь'); }
        if (this.waves?.stop()) done.push('волна');
        if (W?._nox(false)) done.push('Люмос'); // (the tip and the thrown light)
        if (W?.drawing && W.drawing.until > performance.now()) { W.drawing.until = 0; done.push('рисование'); }
        if (W?.holo) { W._closeHolo(); done.push('тайны'); }
        if (this.accio?.stop()) done.push('Акцио');
        if (this.flight?.busy && this.flight.state !== 'landing') { this.flight.land('stop'); done.push('полёт'); }
        if (this.lightning) { if (this.lightning.hammer) this.gear?.hammerResult(false); this.lightning = null; this.hud.setTimer?.(null); done.push('молния'); }
        if (this.spells.stopBy(this.localId)) done.push('огонь / луч');
        if (this.livingTrees?.stopMine()) done.push('живое дерево');
        if (this.ships?.stopWind()) done.push('ветер в паруса');
        if (this.invis?.stop()) done.push('невидимость');
        if (!done.length) return false;
        this.sync?.stopSpells?.();
        if ((hf === true || ws === true) && done.length === 1) return true; // (its own words: the fire left / the water fallen)
        this.hud.setVoice(`🛑 Стоп: ${done.join(', ')}`, true);
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
        this._manaLater = true; // (mana: counted when the charge hits — Duel.js)
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
        return (this.spiders ? this.spiders.list : []).concat(this.dragons ? this.dragons.list : []); // (and the dragons)
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
                this.mana?.success(p.name);
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
        this.castleLife?.alarm({ x: cx, y: ch.group.position.y - 1.95, z: cz }, 'quake', this.localId, width / 2); // (earth rising out of the ground: the people near run)
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
        // whoever stands there (creatures, players) is thrown back — on every computer (WallRise)
        const o = new THREE.Vector3(cx, ch.group.position.y - 1.5, cz), wd = new THREE.Vector3(fx, 0, fz), wn = max ? 'WallRiseMaxima' : 'WallRise';
        this.spells.cast(wn, o, wd, null, this.localId);
        if (this.sync) this.sync.spell(wn, o, wd, null);
        this.hud.setVoice(max ? '🪨 BREAKTHROUGH МАКСИМА!' : '🪨 Breakthrough!', true);
    }

    /** Is my charge in a duel right now? */
    /**
     * In a fight right now (no time for talk): hurt a moment ago, a duel, knights or a castle against
     * me, a ship's crew against me, a creature that fights coming at me. → the microphone hears spells.
     */
    inFight() {
        const now = performance.now(), me = this.localId, p = this.character.group.position;
        if (now - (this.combat?.hurtAt || -1e9) < 8000) return true;
        if (this.duel && this._inDuel()) return true;
        for (const cs of this.castleLife?.castles?.values?.() || []) {
            if (cs.hostile?.get(me) > Date.now()) return true;
            for (const v of cs.active?.values?.() || []) if (!v.dead && v.foe === me && Math.hypot(v.x - p.x, v.z - p.z) < 30) return true;
        }
        for (const s of this.ships?.awake || []) if (s.hostile?.get(me) > now && Math.hypot(s.pose.x - p.x, s.pose.z - p.z) < 80) return true;
        for (const z of this.zombies || []) if (!z.isDead && !z.dummy && z.group.position.distanceTo(p) < 12) return true;
        return false;
    }

    _inDuel() {
        const me = this.localId;
        return this.duel.clashes.some((c) => c.a?.by === me || c.b?.by === me);
    }

    /**
     * «Wave Attack»: stand by the water and point the hand AT the water, say it: the water
     * rises there into a wave (WaveAttack.js) — then show it where to go with the hand and
     * push it (or hold the hand still on the place a moment).
     */
    _castWave(name, isFinal) {
        if (!isFinal && name === 'WaveAttack') return null; // (wait for a possible «Максима»)
        if (this.waves.busy) return null;
        const ch = this.character;
        const side = (this.wandSide() || ['right', 'left'].find((s) => ch.isArmRaised(s))) || this.magicHand || 'right';
        const o = this.castOrigin(side);
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
        // it faces away from me at first
        const me = ch.group.position;
        let lx = src.x - me.x, lz = src.z - me.z;
        if (Math.hypot(lx, lz) < 0.3) { lx = d.x; lz = d.z; }
        this.waves.raise(name, side, src, new THREE.Vector3(lx, 0, lz), d);
        this.hud.setVoice('🌊 Вода поднимается в волну… покажите рукой, куда ей идти, и толкните её рукой (или задержите руку)', true);
        return name;
    }

    _castWind(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        // «Вайнд…» / «Overgrown…» heard while the phrase goes on: wait for a possible «Максима»
        if ((name === 'Wind' || name === 'Overgrown') && !isFinal) return null;
        const over = name.startsWith('Overgrown'); // (the same hand and the same way of aiming: «Overgrown» throws apart)
        const key = over ? '_lastOvergrown' : '_lastWind';
        if (now - (this[key] || 0) < 900) return null;
        const ch = this.character;
        const pref = this.magicHand || this.lastMagicHand || 'right';
        const side = this.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        if (!side) { if (isFinal) this.hud.setVoice(over ? '🌿 Поднимите руку и направьте её на тех, кого разбросать, — и скажите «Overgrown»' : '🌬️ Поднимите руку и направьте её туда, куда дуть, — и скажите «Вайнд»', true); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const origin = this.castOrigin(side);
        const dir = ch.getHandDirection(side);
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        this.combat.pay(name);
        this[key] = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    /**
     * «Брейнрот»: no hand needed — the creature you look at (or the nearest one): a zombie,
     * an animal, a villager / a knight, somebody else's living tree — becomes your servant
     * for a while: it follows you, fights your enemies and goes for whom «Атак» points at.
     */
    _castBrainrot(isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === 'Brainrot' && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastBrainrot || 0) < 1200) return null;
        const head = this.character.head.getWorldPosition(new THREE.Vector3());
        const look = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        let best = null;
        const consider = (k, id, pos, up) => {
            const to = _v1.copy(pos).add(_v2.set(0, up, 0)).sub(head);
            const d = to.length();
            if (d > 30) return;
            const ang = look.angleTo(to.normalize());
            const score = (ang < 0.5 ? ang * 4 : 10 + d * 0.2 + ang) + d * 0.04;
            if (ang > 0.5 && d > 10) return;
            if (!best || score < best.score) best = { k, id, pos, up, score, d };
        };
        for (const z of this.zombies) if (!z.isDead && !z.isDying && !z.isThrall) consider('z', z.id, z.group.position, 1.4);
        for (const a of this.animals?.targets() || []) if (a.servantOf !== this.localId) consider('a', a.id, a.group.position, 1);
        for (const v of this.castleLife?.targets() || []) if (v.servantOf !== this.localId) consider('v', v.id, new THREE.Vector3(v.x, v.y, v.z), 2.4);
        for (const t of this.livingTrees?.targets() || []) if (t.master !== this.localId) consider('t', t.id, t.model.position, 5);
        // a dragon: «Брейнрот» does not work on it (its mind is far too strong — DragonKinds.ON_DRAGON)
        for (const d of this.dragons?.targets() || []) consider('D', d.id, d.model.position, 3 * d.size);
        if (best?.k === 'D') { if (isFinal) this.hud.setVoice('🐉 Разум дракона слишком силён — «Брейнрот» на него не действует', true); return null; }
        // (a phoenix obeys nobody: «Брейнрот» does not act on it — Phoenixes.TARGETS)
        for (const f of this.phoenixes?.targets() || []) consider('f', f.id, f.model.position, 1.2);
        if (best?.k === 'f') { if (isFinal) this.hud.setVoice('🔥 Феникс никому не подчиняется — «Брейнрот» на него не действует', true); return null; }
        if (!best) { if (isFinal) this.hud.setVoice('🌀 Посмотрите на существо (зомби, животное, жителя, рыцаря, живое дерево — не дальше 30 м) и скажите «Брейнрот»', true); return null; }
        const tired = this.combat.check('Brainrot');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('Brainrot');
        this._lastBrainrot = now;
        this._interimCast = isFinal ? null : { name: 'Brainrot', at: now };
        // Rings from above the head to the creature (the vector's length = the distance)
        const origin = head.add(_v1.set(0, 1.3, 0));
        const vec = _v2.copy(best.pos).add(_v1.set(0, best.up, 0)).sub(origin);
        this.spells.cast('Brainrot', origin, vec.clone(), null, this.localId);
        if (this.sync) this.sync.spell('Brainrot', origin, vec, null);
        const { k, id } = best;
        const arrive = Math.round(Math.min(2500, (vec.length() / 11) * 1000 + 300));
        setTimeout(() => {
            if (this.authority) this.servants.make(k, id, this.localId);
            else if (this.sync) this.sync.brainrot(id, k);
        }, arrive);
        return 'Brainrot';
    }

    /** «Атак» with servants: the hand points at someone — all my servants go for them. */
    _commandAttack(isFinal) {
        const aim = this.duel.pickSide(false);
        const t = aim?.t;
        if (!t || t.kind === 'b') { if (isFinal) this.hud.setVoice('✋ Направьте руку на того, кого атаковать, и скажите «Атак»', true); return null; }
        const target = { k: t.kind, id: t.id };
        if (this.authority) this.servants.command(this.localId, target);
        else this.sync?.servantAttack?.(target.k, target.id);
        this.hud.setVoice('⚔️ Атак! Ваши слуги идут в бой', true);
        return 'Attack';
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

    /**
     * «Wind Impulse» / «… Maxima» (only from a scroll): the wand (the hand) raised UP — or turned at
     * oneself — and the words: a ring of air out of me in every direction (WindImpulse.js).
     */
    _castImpulse(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (name === 'WindImpulse' && !isFinal) return null; // (wait: maybe «… Максима»)
        if (now - (this._lastImpulse || 0) < 1200) return null;
        const hand = castingHand(this);
        if (!hand || !aimedUpOrSelf(this, hand)) { if (isFinal) this.hud.setVoice('💨 Поднимите палочку (руку) <b>вверх</b> и скажите «Wind Impulse»', true); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const origin = this.combat.center(new THREE.Vector3());
        this.spells.cast(name, origin, _v1.set(0, 1, 0), hand.side, this.localId);
        if (this.sync) this.sync.spell(name, origin, _v1.set(0, 1, 0), hand.side);
        this.combat.pay(name);
        this._lastImpulse = now;
        this._interimCast = isFinal ? null : { name, at: now };
        return name;
    }

    /** «Wind Impulse» on the world round `origin` (every computer: SpellManager.castImpulse): book-birds, things. */
    _impulseWorld(name, origin, r, pushAt, casterId) {
        if (this.authority) {
            // things lying about (the host owns their physics)
            for (const L of this.items?.loose?.values() || []) {
                if (L.hover && L.rise != null) continue; // (still rising out of a chest)
                const v = pushAt(L.model.position);
                if (!v) continue;
                L.hover = null; L.rest = false; L.sentRest = false;
                L.vel.addScaledVector(v, 0.7);
                L.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
            }
            this.books?.hitAt?.(origin, r, casterId, 'wind'); // (a light book-bird in the gust falls; the book of protection doesn't)
        }
    }

    /** Another wizard's quake ran under me: I fall for a few seconds and get hurt. */
    _quakeMe(casterId, origin, reached, power, dir = null) {
        if (casterId === 'local' || casterId === this.localId) return false;
        const c = this.combat;
        if (!c.enabled || c.dead || this.flight.active) return false;
        if (!reached(this.character.group.position)) return false;
        if (c.shield && c.shield.type === 2 && c.shield.left > 0 && c._blocked(origin, power > 1 ? 'EarthquakeMaxima' : 'Earthquake')) return true; // the dome holds (out of mana: shattered)
        // the ground runs away under the feet along the wave: the body falls back against it (hands stay free)
        const max = power > 1;
        const d = (dir || _v1.subVectors(this.character.group.position, origin)).clone().setY(0);
        if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
        this.impact.apply({ v: d.normalize().multiplyScalar(max ? -5 : -3), from: null, by: casterId,
            spell: max ? 'EarthquakeMaxima' : 'Earthquake', always: { down: max ? 2.5 : 1.5 }, toss: max ? 6 : 4 });
        this.fx.shake = Math.max(this.fx.shake, 1.2);
        c.damage(max ? 9 : 3, casterId, 'Earthquake');
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
        this.hud.setVoice('⛈️ Небо темнеет...', true);
        return 'LightningStrike';
    }

    // ============================================================ To the Sun
    /** «To the Sun»: a hand raised to the sky, in the rain — the clouds part and the rain stops. */
    _castSun(isFinal) {
        const raining = this.storm && (this.storm.k > 0.2 || performance.now() < this.storm.until);
        if (!raining) { if (isFinal) this.hud.setVoice('☀️ «To the Sun» работает только во время дождя', true); return null; }
        const ch = this.character;
        let side = null;
        for (const s of ['right', 'left']) {
            if (!ch.isArmRaised(s)) continue;
            const d = ch.getHandDirection(s, _v1);
            const anchor = s === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
            const arm = ch.getHandWorldPosition(s, _v2).sub(anchor.getWorldPosition(new THREE.Vector3())).normalize();
            if (d.y > 0.5 || arm.y > 0.6) { side = s; break; }
        }
        if (!side && !ch.areBothHandsUp()) { if (isFinal) this.hud.setVoice('☀️ Поднимите руку к небу и скажите «To the Sun»', true); return null; }
        side = side || 'right';
        const tired = this.combat.check('ToTheSun');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('ToTheSun');
        const o = this.castOrigin(side);
        this.spells.cast('ToTheSun', o, _v1.set(0, 1, 0), side, this.localId);
        if (this.sync) this.sync.spell('ToTheSun', o, _v1.set(0, 1, 0), side);
        this.hud.setVoice('☀️ <span style="color:#ffd36b">To the Sun!</span> Тучи расходятся, дождь стихает', true);
        return 'ToTheSun';
    }

    /**
     * «Let it rain» (20): the hand — or the wand in it — pointed up to the sky + the words.
     * A stream of magic goes up from it and a thunderstorm comes for 2 game hours (2 minutes).
     */
    _castRain(isFinal) {
        const ch = this.character;
        const w = this.items?.heldOf('wand');
        let side = null;
        for (const s of w ? [w.side, w.side === 'left' ? 'right' : 'left'] : ['right', 'left']) {
            if (!ch.isArmRaised(s)) continue;
            const d = w && w.side === s ? (this.wandMagic.tip(_v2, _v1), _v1) : ch.getHandDirection(s, _v1);
            if (aimedAtSky(d)) { side = s; break; }
        }
        if (!side) { if (isFinal) this.hud.setVoice('🌧️ Направьте руку (или палочку) <b>вверх, к небу</b> и скажите «Let it rain»', true); return null; }
        const tired = this.combat.check('LetItRain');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('LetItRain');
        const o = this.castOrigin(side);
        this.spells.cast('LetItRain', o, _v1.set(0, 1, 0), side, this.localId);
        if (this.sync) this.sync.spell('LetItRain', o, _v1.set(0, 1, 0), side);
        if (this.sound) this.sound.playBombardoCast();
        this.hud.setVoice('🌧️ <span style="color:#9fd4ff">Let it rain!</span> Небо затягивают тучи — гроза на 2 часа', true);
        return 'LetItRain';
    }

    /** Creatures the lightning can be aimed at (everything alive). */
    _lightningTargets() {
        const out = [];
        for (const z of this.zombies) if (!z.isDead && !z.isThrall) out.push({ pos: z.group.position, key: 'z' + z.id, up: 1.2 });
        for (const [id, r] of this.remotes) if (!r.dead) out.push({ pos: r.position, key: 'p' + id, up: 0.5 });
        for (const b of this.bosses || []) if (!b.dead) out.push({ pos: b.position, key: 'b' + b.id, up: 2.6 * (b.size || 1) }); // (the middle of its body)
        for (const a of this.animals?.targets() || []) out.push({ pos: a.group.position, key: 'a' + a.id, up: 0.8 * a.group.scale.y });
        for (const v of this.castleLife?.targets() || []) out.push({ pos: v.group.position, key: 'v' + v.id, up: 0.5 });
        return out;
    }

    /** A hand stretched out forward, about level (where the lightning goes). */
    _handLevel(side, outDir) {
        const ch = this.character;
        const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        anchor.updateMatrixWorld(true);
        const shoulder = anchor.getWorldPosition(_v1);
        const v = ch.getHandWorldPosition(side, _v2).sub(shoulder);
        const len = v.length();
        if (len < 1.2 || Math.abs(v.y / len) > 0.5) return false;
        ch.getHandDirection(side, outDir);
        return true;
    }

    _updateLightning(dt) {
        const L = this.lightning;
        if (!L) { this.hud.setTimer?.(null); return; }
        L.t += dt;
        const ch = this.character;
        if (L.phase === 'gather') {
            // a moment of gathering clouds — then the bolt comes down into the raised hands
            if (L.t >= 0.6) {
                L.phase = 'hold';
                L.t = 0;
                L.side = this.magicHand || this.lastMagicHand || 'right';
                const p = ch.group.position;
                this.spells.cast('LightningCatch', p, _v1.set(0, 1, 0), L.side, this.localId);
                if (this.sync) this.sync.spell('LightningCatch', p, _v1.set(0, 1, 0), L.side);
                this.spells.cast('LightningHold', p, _v1.set(0, 1, 0), L.side, this.localId);
                if (this.sync) this.sync.spell('LightningHold', p, _v1.set(0, 1, 0), L.side);
                this.hud.setVoice('⚡ Молния в ваших руках! Опустите руки и направьте их на цель', true);
            }
            return;
        }
        const HOLD = 8;
        // Lowered hands pointing forward release it: at the creature in that direction, or wherever they point
        let side = null;
        const dir = new THREE.Vector3();
        for (const s of [L.side, L.side === 'right' ? 'left' : 'right']) if (this._handLevel(s, dir)) { side = s; break; }
        L.levelT = side ? (L.levelT || 0) + dt : 0;
        this.hud.setTimer?.(1 - L.t / HOLD, side ? '🎯' : '⚡', Math.ceil(HOLD - L.t), side ? Math.min(1, L.levelT / 0.25) : 0);
        if (side && L.levelT >= 0.25) {
            this.lightning = null;
            if (L.hammer) this.gear.hammerResult(true);
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            let best = null;
            for (const t of this._lightningTargets()) {
                const tp = _v1.copy(t.pos).add(_v2.set(0, t.up, 0));
                const to = tp.clone().sub(hand);
                const d = to.length();
                if (d > 50 || d < 1.5) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang < 0.38 && (!best || ang + d * 0.004 < best.score)) best = { score: ang + d * 0.004, point: t.pos.clone() };
            }
            let point = best?.point;
            if (!point) {
                const hit = this.terrain?.raycast(hand, dir, 50);
                point = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : hand.clone().addScaledVector(dir, 30);
            }
            const back = hand.clone().sub(point);
            this.spells.cast('LightningBeam', point, back, null, this.localId);
            if (this.sync) this.sync.spell('LightningBeam', point, back, null);
            this.hud.setVoice('⚡ <span style="color:#9fd8ff">LIGHTNING STRIKE!</span>', true);
            if (!L.hammer) this.mana?.success('LightningStrike'); // (mana: the lightning went where it was aimed)
            return;
        }
        if (L.t >= HOLD && L.hammer) {
            // the hammer's lightning is lost (it never hurts its holder)
            this.lightning = null;
            this.gear.hammerResult(false);
            return;
        }
        if (L.t >= HOLD) {
            // Held too long: it strikes you
            this.lightning = null;
            const point = ch.group.position.clone();
            this.spells.cast('LightningHit', point, _v1.set(0, -1, 0), null, this.localId);
            if (this.sync) this.sync.spell('LightningHit', point, _v1.set(0, -1, 0), null);
            if (this.combat.enabled) this.combat.damage(10, null, 'Lightning');
            else this.damageLocalPlayer(6);
            this.hud.setVoice('⚡ Вы слишком долго держали молнию — она ударила в вас!', true);
        }
    }

    /** «Gather» and the building spells (learned from books outside creative). */
    _castBuild(name, isFinal) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interimCast = null; return null; }
        if (now - (this._lastBuild || 0) < 900) return null;
        if (!this.builder.knows(name)) {
            if (isFinal) this.hud.setVoice(name === 'CreateBoard' ? '🏄 «Create a Board» ещё не изучено — найдите его в книге птицы или сожгите свиток' : `📖 «${BUILD_SPELLS[name].name}» ещё не изучено — найдите его в книге птицы`, true);
            return null;
        }
        if (this.combat.enabled && this.combat.fatigue < BUILD_SPELLS[name].cost) { this.hud.toast?.('😮‍💨 Не хватает маны'); return null; }
        let hint;
        // «Gather» at a carcass (meat) or a golden tree (apples)
        if (name === 'Gather') {
            const side = (this.wandSide() || ['right', 'left'].find((sd) => this.character.isArmRaised(sd))) || 'right';
            // things lying about (at a body): all of them into the slots (Death.js)
            const loot = this.death?.gatherAt(this.character.getHandWorldPosition(side), this.character.getHandDirection(side));
            if (loot && loot.startsWith('✨')) { this.hud.setVoice(loot, true); this._lastBuild = now; if (this.combat.enabled) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost); return 'Gather'; }
            // a cluster of mana crystals: all of it into the slots
            const cr = this.crystals?.gatherAt(this.castOrigin(side), this.character.getHandDirection(side), side);
            if (cr && cr.startsWith('🎒')) { if (isFinal) this.hud.setVoice(cr, true); return null; }
            if (cr) {
                this.hud.setVoice(cr, true);
                if (this.combat.enabled) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost);
                this.mana?.success('Gather');
                this._lastBuild = now;
                return 'Gather';
            }
            const got = this.animals.gatherAt(this.character.getHandWorldPosition(side), this.character.getHandDirection(side));
            if (got && !got.startsWith('🍏')) { this.hud.setVoice(got, true); this._lastBuild = now; return 'Gather'; }
            if (got) { if (isFinal) this.hud.setVoice(got, true); return null; }
        }
        if (name === 'Gather') hint = this.builder.gather();
        else if (name === 'CreateDoor') hint = this.doors ? this.doors.create() : '🚪 Двери скоро будут';
        else if (name === 'CreateBoard') hint = this.boards.create();
        else hint = this.builder.start(name);
        if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
        if (this.combat.enabled) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost);
        this.mana?.success(name); // (mana: gathered / the building started)
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
            // its master's «Атак» target, else another zombie, else whoever attacks the master
            const e = this.servants.enemyFor({ k: 'z', id: z.id }, z.thrallOwner, zp, 40);
            const ep = e ? this.servants.find(e.k, e.id) : null;
            if (ep && e.k === 'z') return { pos: ep.group.position, zombie: ep, distSq: zp.distanceToSquared(ep.group.position) };
            if (ep) { const pos = this.servants.pos(e.k, e.id).clone(); return { pos, foe: e, distSq: zp.distanceToSquared(pos) }; }
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
    _blowMe(casterId, origin, pushAt, name = 'Wind') {
        if (casterId === 'local' || casterId === this.localId || this.combat.dead) return;
        if (this.wards?.shields(origin, this.combat.center(_v3))) return; // (in a protected house)
        const v = pushAt(this.combat.center(new THREE.Vector3()));
        if (!v) return;
        // (a shield turned to it holds most of it: felt, the shield arm pushed back, never a fall)
        if (this.combat.shieldFactor(origin) >= 1) this.combat._blocked(origin, name);
        if (this.boards?.mounted && !this.boards.onPush(v)) return; // (on a surfboard: a push along the board just rides on)
        const P = SPELL_PHYSICS[name] || {};
        this.impact.apply({ v: v.clone(), from: origin, by: casterId, spell: name, jolt: P.jolt || 0 });
        if (name.startsWith('Overgrown')) this.levitation.watchMyFall(casterId); // (thrown off a ledge: the fall hurts)
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
            const side = (this.wandSide() || ['right', 'left'].find((sd) => this.character.isArmRaised(sd))) || 'right';
            if (this.doors.tryLift(side)) { this.combat.pay('Levitation'); this._lastLevitate = now; return 'Levitation'; }
            this.hud.setVoice(hint, true);
            return null;
        }
        if (!wasActive) this.combat.pay('Levitation');
        this._lastLevitate = now;
        this._interimCast = isFinal ? null : { name: 'Levitation', at: now };
        return 'Levitation';
    }

    /**
     * How much stronger a FIRE spell of `casterId` is (DragonKinds.FIRE_SPELLS): 1.6 with the dragon's
     * wand in their hand, else 1 (the wand's +15% and the rest go through wandPower / _lastSpell).
     * Its mana stays the same.
     */
    fireBoost(casterId) {
        if (casterId == null || casterId === 'local' || casterId === this.localId) return this.items?.wand?.dragon ? DRAGON_WAND_FIRE : 1;
        return this.remotes?.get(casterId)?.dragonWand ? DRAGON_WAND_FIRE : 1;
    }

    /** Targets for spells cast by `casterId` (players hit each other only in the free world). */
    /** «Инферно»: the stream burns what it reaches. True if something burnt. */
    _burnRay(o, d, len, casterId) {
        let hit = false;
        if (this.fire?.igniteAlong(o, d, len)) hit = true; // trees, dry blocks
        if (this.animals?.burnAlong(o, d, len, casterId)) hit = true;
        this.books?.hitRay(o, d, len, 0.8, 'fire'); // (book-birds fall — the book of protection too: fire)
        this.houses?.hitRay(o, d, len, 0.6); // (glass breaks)
        if (this.authority) {
            if (this.spiders?.hitRay(o, d, len, 0.6, 2, 'Inferno')) hit = true;
            this.dragons?.hitRay(o, d, len, 0.6, 2, 'Inferno', casterId); // (a dragon does not care about fire: no burn, nothing «worked»)
            this.phoenixes?.hitRay(o, d, len, 0.6, 0, 'Inferno', casterId); // (fire: no harm to a phoenix, but an attack)
            if (this.castleLife?.hitRay(o, d, len, 0.4, 1, casterId)) hit = true; // villagers, knights, wizards
            if (this.livingTrees?.burnAlong(o, d, len, casterId)) hit = true; // (fire is what kills a living tree)
            if (this.carriages?.burnAlong(o, d, len, casterId)) hit = true; // (a cart on the road catches fire)
        }
        for (const f of this.onFlame) { try { if (f(o, d, len, casterId)) hit = true; } catch (e) { console.warn('onFlame', e); } }
        return hit;
    }

    /**
     * «Инферно» reaches a scroll or a book — in my hands (every computer: its own player's hands) or
     * lying in the world (the host): it burns. A scroll burnt by my own flame gives me its power.
     */
    _flameBurnsPaper(o, d, len, casterId) {
        const items = this.items;
        if (!items) return false;
        const mine = casterId === this.localId || casterId === 'local';
        const paper = (it) => it && (it.kind === 'scroll' || it.kind === 'book');
        let hit = false;
        const burnt = (p, it, mineToo) => { hit = true; this._paperBurnt(p, it, mineToo); };
        for (const side of ['left', 'right']) {
            const h = items.held[side];
            if (!h || !paper(h.item) || !h.model) continue;
            const p = h.model.getWorldPosition(_v1);
            if (!inStream(o, d, len, p, 0.45)) continue;
            const it = items.releaseHand(side);
            if (it) burnt(p.clone(), it, mine);
        }
        if (this.authority) {
            for (const L of [...items.loose.values()]) {
                if (!paper(L.item) || L.lev || L.accio) continue;
                const p = L.model.position;
                if (!inStream(o, d, len, p, 0.5)) continue;
                const at = p.clone();
                const it = items.removeLoose(L.item.uid);
                this.sync?.itemGone?.(L.item.uid, null, null);
                if (!it) continue;
                burnt(at, it, mine);
                // (another player's flame burnt a scroll / a book lying here: its power is theirs)
                if (!mine) this._sendBurnt(casterId, it);
            }
            // the book-birds' books lying on the ground or on a pedestal
            for (const { at, item } of this.books?.burnAlong((p) => inStream(o, d, len, p, 0.6)) || []) {
                burnt(at, item, mine);
                if (!mine) this._sendBurnt(casterId, item);
            }
        }
        return hit;
    }

    /** (host) Another player's flame burnt a scroll or a book here: its power is theirs. */
    _sendBurnt(to, it) {
        if (it.kind === 'scroll' || (it.kind === 'book' && !it.runbook)) this.sync?.net?.send({ t: 'sburn', to, item: it }, true);
    }

    /**
     * A scroll or a book burnt at `p`: fire, ash; burnt by me (`mine`) — its power is mine
     * (a scroll's bonus, a book's spells: the swift book's «Флайн» is learned only so).
     */
    _paperBurnt(p, it, mine) {
        for (let i = 0; i < 30; i++) this.fx.spark(p, i % 3 ? 0xff8a1a : 0xffe066, 0.12, _v2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.9);
        for (let i = 0; i < 10; i++) this.fx.spark(p, 0x3a3330, 0.1, _v2.set((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), 1.4); // (ash)
        this.fx.lightFlash?.(p, 0xff8a1a, 1.5, 0.3, 8);
        if (it.kind === 'scroll' && mine) this.items.applyScroll(it);
        else if (it.kind === 'book' && mine && this.books) this.books.learnBurnt(it);
        else if (it.kind === 'book') this.hud.toast?.('📕🔥 Книга сгорела', 2000);
        else this.hud.toast?.('📜🔥 Свиток сгорел', 2000);
    }

    /** «Инферно» said with a spell book in the hand: it burns there, its spells are mine. */
    burnHeldBook() {
        const h = this.items?.heldOf('book');
        if (!h || h.item.runbook) return false;
        const p = (this.items.held[h.side]?.model || this.character.group).getWorldPosition(new THREE.Vector3());
        const reading = !!this.books?.readingSide;
        const it = this.items.releaseHand(h.side);
        if (reading) this.books.reading._end?.(true); // (open in the hands: it burns there)
        if (!it) return false;
        this._paperBurnt(p, it, true);
        return true;
    }

    /**
     * A scroll or a spell book held in a fire (a campfire's flames, a burning tree or block)
     * catches fire after a moment: it burns, and its power is mine (I put it there).
     */
    _heldPaperInFire(dt) {
        const items = this.items;
        if (!items) return;
        this._paperFireT = this._paperFireT || { left: 0, right: 0 };
        for (const side of ['left', 'right']) {
            const h = items.held[side];
            const it = h?.item;
            const p = h?.model && (it?.kind === 'scroll' || (it?.kind === 'book' && !it.runbook)) ? h.model.getWorldPosition(_v1) : null;
            const hot = p && (this.campfires?._fireAt?.(p, 1.4, 2.6, true) || this.fire?.burningAt?.(p, 1.2));
            if (!hot) { this._paperFireT[side] = 0; continue; }
            this._paperFireT[side] += dt;
            if (Math.random() < dt * 10) this.fx.spark(p, 0xff8a1a, 0.06, _v2.set((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), 0.4);
            if (this._paperFireT[side] < 0.8) continue;
            this._paperFireT[side] = 0;
            const at = p.clone();
            const reading = it.kind === 'book' && !!this.books?.readingSide;
            const gone = items.releaseHand(side);
            if (reading) this.books.reading._end?.(true);
            if (gone) this._paperBurnt(at, gone, true);
        }
    }

    /** Water that stops a flame: water balls (held, flying, lying, other players'), the vortex's water. */
    _flameWaters() {
        const out = [];
        this.water?.spheres?.(out);
        this.vortex?.spheres?.(out);
        this.waterStorm?.spheres?.(out); // (the great water storm puts out fire, the Hellfire too)
        return out;
    }

    /** The world's block at a point, for the flame: 'water' | 'solid' | null. */
    _flameBlock(x, y, z) {
        const data = this.terrain?.data;
        if (!data) return null;
        const ix = Math.round(x), iz = Math.round(z), L = Math.floor(y + 1.5);
        const b = data.get(ix, L, iz);
        if (b === BLOCK.WATER) return 'water';
        // the moving sea surface (waves above the still water blocks)
        if (this.sea && L >= 1 && data.isSeaColumn?.(ix, iz) && y < WATER_LEVEL_Y + this.sea.height(x, z)) return 'water';
        if (b && b !== BLOCK.AIR && b !== BLOCK.WHEAT && b !== BLOCK.FLOWERS && b !== BLOCK.VEG) return 'solid'; // (the flame goes over plants)
        return null;
    }

    _spellPlayers(casterId) {
        const c = this.combat;
        if (!c.enabled) return [];
        const out = [];
        const me = this.localId;
        // (in a protected house: a spell from outside doesn't reach me — nor the others inside)
        const from = this.wards?.list.size ? this.wards.casterAt(casterId) : null;
        const safe = (p) => !!from && this.wards.shields(from, p);
        if (!c.dead && casterId !== 'local' && casterId !== me && !safe(c.center())) {
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
            if (id === casterId || r.dead || safe(r.position)) continue;
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
        const manaMax = this.mana?.max; // (told to the others: a duel won against me is worth this much)
        this.mana?.onDeath(); // all the mana grown with practice is lost
        this.runner?.onDeath(); // (the running book's quickness is lost)
        this.death?.playerDied(byId, text); // the body stays, everything drops (Death.js); game.onDeath hooks
        if (this.sync) this.sync.died(byId, manaMax);
        this.castleLife?.playerDied(this.localId);
        this.ships?.onLocalDeath(); // (lets go of a ship's wheel)
        this.hud.setStatus('');
        if (this.flight.busy) this.flight.land('dead');
        this.boards?.dropAll('dead');
        this.weapons.releaseAll?.();
        this.ui.died?.(text, () => this.respawn());
    }

    /** Back into the game: full health, a new place near the start. */
    respawn() {
        const ch = this.character;
        this.bleeding?.clearCuts(ch);
        this.dismember?.resetLocal(); // (cut-off arms / legs / the head: whole again)
        this.combat.revive();
        this.playerHP = this.maxHP;
        this.isDeadLocal = false;
        const p = ch.group.position;
        // at my bed (the last one I lay in), standing beside it, looking away from it
        const home = this.beds?.respawnSpot();
        if (home?.spot) {
            p.set(home.spot.x, home.spot.y + PLAYER_GROUND_OFFSET + 0.1, home.spot.z);
            ch.group.rotation.set(0, home.spot.ry, 0);
        } else {
            if (this.config.map && this.world.mapResult?.playerSpawn) p.copy(this.world.mapResult.playerSpawn);
            else {
                const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
                p.x = Math.cos(a) * d;
                p.z = Math.sin(a) * d;
            }
            p.y = this.collision.groundY(p.x, p.z) + 2.5;
            if (home?.gone) this.hud.setVoice('🛏️ Ваша кровать разрушена — вы возродились в обычном месте', true);
            else if (home?.blocked) this.hud.setVoice('🛏️ У вашей кровати нет свободного места — вы возродились в обычном месте', true);
        }
        ch.verticalVelocity = 0;
        this.knockback.set(0, 0, 0);
        this.knock.reset();
        this.up?.reset();
        this.impact.reset();
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.inventory?.ensureStarterWand();
        this.death?.respawned(); // game.onRespawn hooks
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
        if (name === 'Fire') { this.campfires._lastCast = 0; return this.campfires.cast(true, true); }
        if (name === 'Wind' || name === 'WindMaxima' || name === 'Overgrown' || name === 'OvergrownMaxima') {
            this._lastWind = this._lastOvergrown = 0;
            const origin = this.character.getHandWorldPosition('right');
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.spells.cast(name, origin, dir, 'right', this.localId);
            if (this.sync) this.sync.spell(name, origin, dir, 'right');
            return name;
        }
        if (name === 'SuitUp') return this.armor.suitUp(true);
        if (name === 'Stupefy' || name === 'AvadaKedavra' || name === 'Expelliarmus' || name === 'Disarmor' || name === 'Jolt' || name === 'JoltMaxima') { this._lastDuelCast = 0; return this._castDuel(name, name, true); }
        if (name === 'Sapira') { this._lastDuelCast = 0; return this._castDuel('Sapira', 'SapiraDuel', true); }
        if (name === 'Sands') { this._lastDuelCast = 0; return this._castDuel('Sands', 'SandsDuel', true); }
        if (name === 'Ice' || name === 'Frozen') { this._lastDuelCast = 0; return this._castDuel('Ice', 'IceDuel', true); }
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
        this.voiceGate.noteFace(performance.now(), poseData?.mouth ?? null);
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
        for (const m of this.cauldrons?.sampleModels?.() || []) zoo.add(m); // (a cauldron's iron, rust, liquid, bubbles; a flask)
        for (const t of ['cow', 'pig', 'sheep', 'horse']) zoo.add(animalModel(t, 0x6b3f1e));
        // (every look of a pig and a cow: each paints its own hide picture the first time — a herd
        // met in flight made the frame wait for them)
        for (let k = 1; k <= 4; k++) zoo.add(animalModel('pig', k), animalModel('cow', k));
        zoo.add(goldenTreeModel(), bonesModel(), spiderModel(), phoenixModel(), doorModel(0x8b5a2b), doorModel(0x7a4f2a), this.campfires.sampleModel());
        for (const m of this.beds?.sampleModels?.() || []) zoo.add(m);
        for (const v of prewarmVillagers()) zoo.add(v);
        // what a flight comes upon (a harbour's ships, a dragon over the mountains, carts on the roads, a
        // dragon's gold): their shaders compiled now — the first one seen in flight froze the picture
        try {
            const cls = Object.keys(SHIP_CLASSES)[0];
            if (this.ships && cls) zoo.add(new ShipModel(buildLayout(cls), { color: 0x8a5a33, name: 'prewarm' }).group);
            for (const k of KIND_IDS) zoo.add(dragonModel(k));
            zoo.add(cartModel(false), cartModel(true));
        } catch (e) { /* (a model that can't be made here: compiled on first sight, as before) */ }
        const box = new THREE.BoxGeometry(1, 1, 1);
        for (const m of [new THREE.MeshLambertMaterial(), new THREE.MeshPhongMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshStandardMaterial()]) {
            const im = new THREE.InstancedMesh(box, m, 1); // (instanced, without per-instance colours: coins, cannon balls, blocks)
            im.setMatrixAt(0, new THREE.Matrix4());
            zoo.add(im);
        }
        zoo.add(new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x5b4630 })));
        zoo.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, depthWrite: false })));
        zoo.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
        this.scene.add(zoo);
        this.renderer.compile(this.scene, this.camera);
        // draw once to each side (behind the loading screen): every chunk's and model's buffers and
        // textures go to the graphics card now, not in the first seconds of play
        const q = this.camera.quaternion.clone(), cp = this.camera.position.clone();
        this.camera.position.copy(this.character.group.position).y += 1.7;
        for (let k = 0; k < 4; k++) {
            this.camera.quaternion.setFromEuler(new THREE.Euler(-0.15, k * Math.PI / 2, 0, 'YXZ'));
            this.camera.updateMatrixWorld(true);
            this.renderer.render(this.scene, this.camera);
        }
        this.camera.quaternion.copy(q);
        this.camera.position.copy(cp);
        this.camera.updateMatrixWorld(true);
        this.scene.remove(zoo);
        // (geometries only: many of these materials are shared caches used later — disposing them would recompile)
        zoo.traverse((o) => { if (o.isMesh && !o.geometry.userData?.keep) o.geometry.dispose(); });
        for (const o of hidden) o.visible = false;
        this.flashlight.intensity = savedIntensity;
        this.prewarmedPrograms = this.renderer.info.programs.length;
    }

    /**
     * Loading screen: build the whole world within the chosen draw distance around
     * the player now (with progress), so the first seconds of play are smooth.
     */
    async loadNearby(progress = () => {}) {
        const t = this.world?.terrain;
        if (!t) return;
        const p = this.character.group.position;
        this.world.update(p, 0); // (the fog and the chunk radius from the settings)
        // a world with day and night starts in the morning haze, which clears in the first minute:
        // build as far as the full day shows now (the extra ring is kept: no streaming then)
        if (this.dayCycle) t.viewDistance = Math.max(t.viewDistance, 90 * (this.world.viewScale ?? 1) * (this.world.viewDistance ?? 1) + 32);
        await t.flushAroundAsync(p.x, p.z, (f) => progress(f));
    }

    start() {
        this.active = true;
        this.lastTime = performance.now();
        this.inventory?.ensureStarterWand(); // (every wizard has a wand — the plain wooden one at least)
        // Creative: a pouch of 100 coins on the belt to start with (once; a world played before keeps its own coins)
        if (this.config.mode === 'creative' && !this._playerRestored && !this._startCoins && this.inventory?.purse && this.inventory.coins() === 0) {
            this._startCoins = true;
            this.inventory.purse.add(100);
        }
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
            // the pause menu (alone in the world): the picture stays, time stands still
            if (this.paused) { this.lastTime = performance.now(); this.renderer.render(this.scene, this.camera); return; }
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
            const ai = ps && (ps.holistic || ps.runner) && ps.lastSendEnd > this._frameEnd - 5 && ps.lastSendEnd - ps.lastSendStart > 30; // (only when it shares the game's thread)
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
            const fps = Math.round(this.fpsFrames / this.fpsAccum);
            if (this.poseService) this.poseService.gameFps = fps; // (the camera network eases off when the game is slow)
            // what takes the frame's time (shown when it is slow): the heaviest part, the network (camera AI), draw calls
            let slow = '';
            if (fps < 45) {
                let worst = null;
                for (const [k, v] of Object.entries(parts)) if (!worst || v > worst[1]) worst = [k, v];
                const ai = this.poseService?.holistic ? this.poseService.stats.avgCost : 0;
                slow = `тяжелее всего: ${worst ? `${worst[0]} ${worst[1].toFixed(0)} мс` : '—'}${ai > 4 ? `, нейросеть ${ai.toFixed(0)} мс` : ''}, вызовов ${this.renderer.info.render.calls}`;
            }
            this.hud.setFps(fps, aiFps, this.quality.current.name,
                sp && t0 - sp.at < 6000 ? `рывок ${Math.round(sp.ms)} мс: ${sp.reason}` : slow);
            this.fpsAccum = 0;
            this.fpsFrames = 0;
        }

        const isTest = this.config.mode === 'test';
        this.ships?.update(dt); // ships move first and carry everyone standing on them
        this._updatePlayer(dt);
        this.ledge.update(dt); // (palms on a ledge's edge, pulled down: the body up — before the hands are stopped at the rock)
        this.handBlocks.update(); // (the arms posed: a hand at a counter or a wall stops on it — before anything is reached)
        this._updateChests(dt);
        if (!isTest) this._checkVictory();
        mark('игрок');

        this.levitation.update(dt);
        this.levMax?.update(dt);
        this.accio.update(dt);
        this.inventory.update(dt);
        this.builder.update(dt);
        this.swim.update(dt);
        this.boards?.update(dt); // (before the items and the weapons: a hand on a board holds nothing else)
        this.items.update(dt);
        this.items.updateRemote();
        this.armor.update(dt);
        this.death.update(dt);
        this.books?.update(dt); // (after the items: an open book leaves the fist for both hands)
        this.wards?.update(dt);
        this.houseMagic?.update(dt);
        this.ships?.rigging.updateBody(dt); // (hanging on a ship's rope ladder: the body where the hands hold)
        this.ships?.helm.updateHands(); // (a hand on a ship's wheel sits on its rim; a free one never goes through it)
        this.scrolls.update(dt);
        this.wandMagic.update(dt);
        this.gear.update(dt);
        this.bleeding.update(dt);
        this.animals.update(dt);
        this.runner.update(dt);
        this.travelers?.update(dt); // (the people of the roads: before the people move — the riders sit where their cart is)
        this.carriages?.update(dt);
        this.castleLife.update(dt);
        this.doors.update(dt);
        this.locks.update(dt);
        this.campfires.update(dt);
        this.cauldrons?.update(dt);
        this._heldPaperInFire(dt); // (a scroll or a book held in a fire burns)
        this.crystals?.update(dt);
        this.beds.update(dt);
        this.houses.update(dt);
        this.spiders.update(dt);
        this.dragons.update(dt);
        this.phoenixes.update(dt);
        this.livingTrees.update(dt);
        this.focus.update(); // (death, a stun, the ice, a fall: what I hold stops; the mark on the screen)
        this.servants.update(dt);
        this.invis?.update(dt);
        this._updateCaves(dt);
        this.keeper?.update(dt);
        this.storm.update(dt);
        this.sun.update(dt);
        this._updateLightning(dt);
        this.waves.update(dt);
        this._updateBreakthrough(dt);
        this.duel.update(dt);
        this.duel.updateVisuals(dt);
        this.fire.update(dt);
        this.burnWreck?.update(dt);
        this.weapons.update(dt, { allowGrab: !(this.combat.dead || this.isDeadLocal) }); // (the dead don't take things)
        this.water.update(dt);
        this.combat.update(dt);
        this.vortex.update(dt);
        this.hellfire?.update(dt);
        this.waterStorm?.update(dt);
        this.strikes.update(dt); // fists, slaps, pushes, shoves: real contact only
        mark('магия и оружие');
        if (this.playerAttackCooldown > 0) this.playerAttackCooldown -= dt;
        this._updateZombies(dt);
        this.creatureImpact.update(dt); // (after every creature moved: their falls and staggers are drawn on top)
        this.weapons.checkHits(this.zombies.concat(this.combat.enabled ? this.combat.meleeTargets() : [], this.animals.targets(), this.spiders.targets(), this.dragons.targets(), this.phoenixes.targets(), this.castleLife.targets(), this.livingTrees.targets(), this.ships ? this.ships.crew.targets() : []), dt);
        this.dismember.update(dt);
        this.hurtFlash?.update(dt); // (a creature that lost HP glows red a moment — every computer sees it)
        mark('зомби');

        this.spells.update(dt);
        this._updateMagicGesture();
        this._updatePendingSpell();
        if (!isTest) this._spawnWaves(dt);

        for (const r of this.remotes.values()) r.update(dt, this.ships);
        this.handBlocks.updateRemotes(); // (their hands neither go into the walls here)
        this.handHold.update(dt); // (hands holding hands: after the others' arms are set)
        this._keepBodiesApart(); // (again: the others have moved; before my place is sent)
        this.ships?.attach(); // (who stands on which ship now)
        if (this.sync) this.sync.update(dt);
        mark('мультиплеер');

        this.fx.update(dt);
        // See further while flying (smoothly), terrain streams in around the player
        this._viewBoost = (this._viewBoost || 0) + ((this.flight.active ? 1 : 0) - (this._viewBoost || 0)) * Math.min(1, dt * 0.8);
        this.world.update(this.character.group.position, this._viewBoost);
        this.swim.applyFog(); // (under the water: murky and blue)
        this.falling?.update(Math.min(0.05, dt));
        this.destruction?.update(Math.min(0.05, dt));
        this.circleAttack?.update(dt);
        this.inspirius?.update(dt);
        if (this.dayCycle && this.frameCount % 15 === 0) this.world.setDayPhase(this.dayPhase());
        this.world.followShadow(this.character.group.position, this._viewBoost, (this._shadowLook || (this._shadowLook = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(this.camera.quaternion));
        this.seaSurface?.update(dt, this.character.group.position);
        mark('мир');
        this._updateCamera(dt);

        // (the castles and towers ahead: made a little a frame before the minimap and the people want them)
        if (this.frameCount % 3 === 1) this.world.terrain?.warmSites?.(this.character.group.position.x, this.character.group.position.z, 900 + CASTLE_CELL, CASTLE_CELL);
        if (this.frameCount % 5 === 0) {
            const cp = this.character.group.position;
            const others = [...this.remotes].filter(([id, r]) => !r.dead && !this.invis?.hidden(id)).map(([, r]) => r).map((r) => ({ x: r.position.x, z: r.position.z, name: r.name, color: r.color }));
            // on a server: its name on the map and a mark at its start point
            const online = this.net && this.net.active;
            const server = online ? { name: (this.net.isHost ? this.net.info?.name : this.net.serverName) || 'Сервер', players: this.remotes.size + 1, home: this.world.mapResult?.playerSpawn || { x: 0, z: 0 } } : null;
            const castleIdx = this.world.terrain?.data?.sites || this.world.terrain?.data?.castles; // (castles and wizards' towers)
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
        this.perf?.frame(deltaTime * 1000, parts);

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
                const targetPitch = lookPitch(pose.headRotation.pitch * s.sensitivity); // (tilt the head back: straight up)
                // Per-frame smoothing tuned at 60 FPS, scaled so 144 Hz screens behave the same
                const alpha = frameAlpha(pose.isRunning && !flying ? Math.min(s.smoothness, 0.1) : s.smoothness, dt);
                // (a broken frame — NaN — must not poison the head for the rest of the game)
                if (Number.isFinite(targetYaw)) this.smoothHead.yaw += (targetYaw - this.smoothHead.yaw) * alpha;
                if (Number.isFinite(targetPitch)) this.smoothHead.pitch += (targetPitch - this.smoothHead.pitch) * alpha;
                // lying on the ground / in a bed: the head looks round freely, the body never spins with it
                const lying = this.knock.down || !!this.beds?.lying;
                this._lieK = (this._lieK || 0) + ((lying ? 1 : 0) - (this._lieK || 0)) * Math.min(1, dt * 3);
                if (lying) { /* (the body stays as it lies; "straight" is kept for when it stands up) */ }
                else if (s.drifting) {
                    // Past a dead zone the head turns the body; "straight ahead" adapts slowly to
                    // where the player really looks, but only while not turning (HeadTurn.js)
                    const turn = headTurnStep(this._headTurn, this.smoothHead.yaw, dt);
                    this.yawNeutral = this._headTurn.neutral;
                    this.cameraBaseRotation += turn.rate * dt;
                    ch.setBodyRotation(this.cameraBaseRotation);
                } else if (pose.bodyRotation !== undefined && !flying) {
                    this.smoothBody += (pose.bodyRotation - this.smoothBody) * alpha;
                    ch.setBodyRotation(this.smoothBody);
                }
                const hb = lyingHead(this.smoothHead.yaw - (s.drifting ? this.yawNeutral : 0), this.smoothHead.pitch, this._lieK);
                this._headBase.yaw = hb.yaw;
                this._headBase.pitch = hb.pitch;
            }
            ch.updateArmsLookAt(pose, dt);
            const down = this.knock.down; // (lying: no walking, no crouching — the squat is read to get up)
            ch.setCrouching(flying || down ? false : pose.isCrouching);
            ch.setRunning(flying || down ? false : pose.isRunning, pose.runIntensity);
        }
        // the head: the tracked turn + a blow's jolt (lying face down: the cheek on the ground, the eyes along it)
        const J = this._jolt = this.impact.step(dt);
        if (!flying) {
            ch.updateHeadRotation(this._headBase.yaw + J.yaw + (this.knock.down && this.knock.dir === 'front' ? 1.1 : 0), this._headBase.pitch + J.pitch);
            ch.head.rotation.z = J.roll;
        }
        this.knock.update(dt); // (before ch.update: knockedDown / fallDir this frame)
        this.up.update(dt); // («Up» out of the water: the arc's sideways part)
        if (this.config.mode === 'test' && this.testState === 'setup') ch.setRunning(false);

        if (flying) this._updateFlight(dt, pose);
        if (iced) ch.setRunning(false);
        ch.update(dt, this.collision, !flight.active && !this.animals?.riding && !this.spiders?.held && !this.beds?.lying && !this.levitation.lifted && !this.boards?.mounted && !this.ships?.rigging.climbing && !this.ledge?.active); // (on a rope ladder, on a ledge's edge the hands hold the body)

        // Explosion knockback (decays; a body lying on the ground slides less far) — in short steps
        // against the walls: a blast throws the body at the rock, never into it (a cave, a house)
        if (this.knockback.lengthSq() > 0.0001) {
            const n = Math.max(1, Math.ceil(this.knockback.length() * dt / 0.25));
            const solid = !flight.active && !this.beds?.lying && !this.boards?.mounted;
            for (let i = 0; i < n; i++) {
                const was = _v1.copy(ch.group.position);
                ch.group.position.addScaledVector(this.knockback, dt / n);
                if (!solid) continue;
                this.collision.resolveCylinder(ch.group.position, PLAYER_RADIUS, this._feetY(ch.group.position), 3.5, 1.05, true);
                if (this._bodyInRock(ch.group.position)) { ch.group.position.copy(was); this.knockback.set(0, 0, 0); break; } // (against the rock: it stops there)
            }
            // (thrown through the air — «Джолт»: only the air slows it until it lands)
            this.knockback.multiplyScalar(Math.max(0, 1 - (this.knock.flyT > 0 ? 1 : this.knock.down ? 8 : 4) * dt));
        }
        // dizzy after a fall: the walk wavers from side to side (the view sways too: below)
        const dizzy = this.knock?.dizzy || 0;
        if (dizzy > 0.05 && ch.isRunning && !this.knock.down && !flight.active && ch.swimY == null) {
            const t = performance.now() / 1000, yaw = ch.group.rotation.y;
            const w = (Math.sin(t * 1.7) * 0.8 + Math.sin(t * 0.9 + 1) * 0.5) * 1.8 * dizzy * dt;
            ch.group.position.x += Math.cos(yaw) * w; ch.group.position.z -= Math.sin(yaw) * w; // (the body's right)
        }

        // Collisions: walls, tables, chests, trunks, mountains (in flight: see _updateFlight)
        if (!flight.active && !this.beds?.lying && !this.boards?.mounted) {
            // (a step up to one block high is walked onto by itself: the feet are on the floor they
            // stand on, even while the body still eases up the last step — _feetY)
            this.collision.resolveCylinder(ch.group.position, PLAYER_RADIUS, this._feetY(ch.group.position), 3.5, 1.05, true);
            // a market counter: the body stays a little before it, where the hands reach its top (CastleTalk)
            if (this.castleLife?.talk?.keepOffCounters?.(ch.group.position, PLAYER_RADIUS, this._feetY(ch.group.position))) this.collision.resolveCylinder(ch.group.position, PLAYER_RADIUS, this._feetY(ch.group.position), 3.5, 1.05, true);
            // never inside the rock (tossed up under an overhang, the walls' push would carry the body
            // on through the stone, block by block): back where it last stood free
            if (this._bodyInRock(ch.group.position)) {
                if (this._lastFree && this._lastFree.distanceToSquared(ch.group.position) < 400) { ch.group.position.copy(this._lastFree); this.knockback.set(0, 0, 0); if (ch.verticalVelocity > 0) ch.verticalVelocity = 0; }
            } else (this._lastFree || (this._lastFree = new THREE.Vector3())).copy(ch.group.position);
        }
        this._keepInsideMap(ch.group.position);
        // a house's sphere of protection: only its owner and the ones let in come through (HouseWards.js)
        if (this.wards?.list.size && !this.isDeadLocal) this.wards.keepOut(ch.group.position, ch.group.position.y - PLAYER_GROUND_OFFSET, 3.5, dt);
        // Other players are solid: stopped here already, before the things in my hands are put
        // into them (a sword, an apple, a book follow the hand as it is now); once more after
        // the horse, Leviosa and the other players have moved this frame (see update).
        this._keepBodiesApart();
    }

    /**
     * Other players are solid. After whatever has moved me (walking, running, a blast,
     * flight, the horse, Leviosa — it runs after each of them; once more changes nothing),
     * my body goes from where it stood to where it wants to be in short steps and never
     * into anybody's body as drawn on this screen:
     * it stops against them and slides along (BodyContact.js). Every computer does this
     * for its own hero, so it holds both ways. Riding, it is the horse that is stopped.
     */
    _keepBodiesApart() {
        const ch = this.character;
        const me = ch.group.position;
        const horse = this.animals?.riding || null;
        const mover = horse ? horse.group.position : me;
        const S = this._solid || (this._solid = { from: { x: 0, z: 0 }, has: false, mover: null, others: [], at: {}, to: {} });
        // (dead, lying in a bed, in a spider's legs: the body is not mine to move)
        const free = !(this.combat.dead || this.isDeadLocal || this.beds?.lying || this.spiders?.held);
        const others = free ? this._otherBodies(S.others) : null;
        if (others && others.length) {
            const up = _v1.set(0, 1, 0).applyQuaternion(ch.group.quaternion);
            const yaw = ch.group.rotation.y;
            const crouch = ch.isCrouching;
            const size = horse ? horse.model?.scale?.x || 2.3 : 0;
            const ground = horse ? horse.group.position.y - 0.5 : 0, top = me.y + 2.85;
            const bodyAt = horse
                ? (x, z, out) => mountBody(x, ground, z, horse.group.rotation.y, size, top, out)
                : (x, z, out) => heroBody(x, me.y, z, yaw, up, crouch, out);
            S.to.x = mover.x; S.to.z = mover.z;
            const res = moveSolid(S.has && S.mover === mover ? S.from : null, S.to, bodyAt, others, S.at);
            if (res.x !== mover.x || res.z !== mover.z) {
                const bx = mover.x, bz = mover.z;
                mover.x = res.x; mover.z = res.z;
                // walls and terrain still win (the other player's own computer moves them out)
                const col = this.collision;
                if (horse) {
                    col.resolveCylinder(mover, 0.7, mover.y - 0.5, 2.5, 1.2);
                    me.x = mover.x; me.z = mover.z;
                } else if (this.flight.active) {
                    if (col.pointBlocked(me.x, me.y, me.z) || col.pointBlocked(me.x, me.y + 1.2, me.z)) { me.x = bx; me.z = bz; }
                } else {
                    col.resolveCylinder(me, PLAYER_RADIUS, this._feetY(me), 3.5, 1.05, true);
                }
                this._keepInsideMap(me);
            }
        }
        S.from.x = mover.x; S.from.z = mover.z;
        S.has = free;
        S.mover = mover;
    }

    /** The other players' bodies where this screen draws them (reused objects). */
    _otherBodies(list) {
        list.length = 0;
        if (!this.remotes.size) return list;
        let riders = null;
        for (const a of this.animals?.list || []) if (a.rider && !a.dead) (riders || (riders = new Map())).set(a.rider, a);
        // A wizard I hold up with Leviosa floats where my hand puts them, and it is their
        // computer that keeps their body out of mine: mine is not shoved by the one I hold
        // (or my hand, and they with it, would push me on and on).
        const lev = this.levitation?.state;
        const held = lev?.kind === 'player' ? lev.id : null;
        const pool = this._bodyPool || (this._bodyPool = []);
        let i = 0;
        for (const [id, r] of this.remotes) {
            if (r.dead || !r.target || id === held) continue;
            const b = pool[i] || (pool[i] = {});
            list[i++] = b;
            const p = r.position;
            const horse = riders?.get(id);
            if (horse) mountBody(horse.group.position.x, horse.group.position.y - 0.5, horse.group.position.z, horse.group.rotation.y, horse.model?.scale?.x || 2.3, p.y + 2.85, b);
            else heroBody(p.x, p.y, p.z, r.character.group.rotation.y, _v2.set(0, 1, 0).applyQuaternion(r.character.group.quaternion), r.character.isCrouching, b);
            // (on the very same spot the two computers part opposite ways)
            const f = b.fallback || (b.fallback = { x: 0, z: 0 });
            f.x = String(this.localId) < String(id) ? 1 : -1;
            f.z = 0;
        }
        list.length = i;
        return list;
    }

    _keepInsideMap(p) {
        // Maps have an edge; the open world is endless
        if (!this.world.isMap) return;
        p.x = Math.max(-119, Math.min(119, p.x));
        p.z = Math.max(-119, Math.min(119, p.z));
    }

    /** Where we are in the day: 0–0.75 day (18 hours), 0.75–1 night (6 hours). */
    dayPhase() {
        return (((Date.now() - this.dayStart) / DAY_CYCLE_MS) % 1 + 1) % 1;
    }

    /** The wave clock (s): the same on every computer (it runs from the shared dayStart), wraps seamlessly. */
    seaTime() {
        const P = WAVES.PERIOD * 1000;
        return ((((Date.now() - this.dayStart) % P) + P) % P) / 1000;
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
        ch.flightView = view; // (a hand pointed at the screen points along this view: getPointingDirection)

        if (!flight.active) {
            if (flight.state === 'idle') { ch.flying = false; ch.setFlightTilt(0); ch.flightView = 0; }
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
    /** «Флайн» is known: everywhere but «Выживание», where only the swift book-bird's book teaches it (an old scroll of flight too). */
    knowsFlight() {
        return this.config.mode !== 'freeworld' || !!this.bonus?.flight || !!this.books?.learned?.has('Flight');
    }

    /** Who last cast a fire / blast spell (a castle that catches fire blames them). */
    noteCaster(name, by) {
        if (by != null && name !== 'Invisibility') this.invis?.noted(by); // (an invisible caster: the world knows about where)
        if (/^(Inferno|Fire|Bombardo|Lightning|Earthquake)/.test(name || '')) this._fireBy = { by, at: performance.now() };
        if (this.authority) this.castleLife?.witnessCast?.(by, name); // (who of the people saw this cast: Blame.js)
    }

    /** A castle / village block burnt down: the guards come; the last fire-caster near is blamed. */
    _castleBurnt(x, L, z) {
        const now = performance.now();
        if (now - (this._burnNoteAt || 0) < 1500) return;
        this._burnNoteAt = now;
        const f = this._fireBy;
        const by = f && now - f.at < 120000 ? f.by : null;
        this.castleLife?.damaged({ x, y: L - 1, z }, by, 1, false, { r: 8, via: 'fire' }); // (a house burning: its whole place; whose fire — only who saw the cast knows)
    }

    /** Lightning at a protected house from outside: it strikes the top of its sphere (and wears it down). */
    _wardLightning(point, casterId) {
        const W = this.wards;
        if (!W?.list.size) return point;
        for (const w of W.list.values()) {
            const from = W.casterAt(casterId);
            if (Math.hypot(point.x - w.c.x, point.z - w.c.z) > w.r + 1 || (from && Math.hypot(from.x - w.c.x, from.y - w.c.y, from.z - w.c.z) < w.r)) continue;
            const top = new THREE.Vector3(point.x, 0, point.z);
            const h = w.r * w.r - (point.x - w.c.x) ** 2 - (point.z - w.c.z) ** 2;
            top.y = w.c.y + Math.sqrt(Math.max(0, h)) + 0.6;
            W.struck(top, 1, 'LightningStrike'); // (it only flashes: lightning doesn't break it)
            return top;
        }
        return point;
    }

    /** Outside Creative «Lightning Strike», «Thunderwave», «To the Sun», «Let it rain» and «Авада Кедавра» are learnt from a burnt scroll only. */
    knowsSpell(name) {
        const base = baseSpell(name);
        const m = this.config.mode;
        // «Защита дома»: only from the book of protection (the dark-blue book-bird) — everybody knows it in Creative
        if (isWardSpell(base)) return m === 'creative' || m === 'test' || !!this.books?.learned?.has(base);
        const key = SCROLL_SPELL_COLOR[name] ? name : base; // («Алохомора Максима»: its own scroll — the plain one is known)
        if (!SCROLL_SPELL_COLOR[key]) return true;
        return m === 'creative' || m === 'test' || !!this.bonus?.spells?.[key];
    }

    startFlight(force = false) {
        if (this.flight.active) return false;
        if (this.knock?.down) return false; // (get up first)
        if (this.levitation.lifted) return false; // (held up by another wizard's Leviosa)
        if (!force && !this.knowsFlight()) {
            this.hud.setVoice('📘 В «Выживании» летать нельзя, пока не сожжёте <b>быструю летающую книгу</b> (голубую, с серебром): собьёте её, возьмите и скажите «Инферно»', true);
            return false;
        }
        this.boards?.dropAll('fly'); // (off the board first; the board stays where it is)
        // Maps (labyrinths etc.) are meant to be walked: no flying over the walls
        if (this.world.isMap) {
            this.hud.setVoice('🚫 На картах «Флайн» не работает — только в режимах «Творческий», «Хардкор» и «Выживание»', true);
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
        const survival = this.config.mode === 'survival' || !!this.config.map;

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            if (!this.authority) {
                // Multiplayer guest: the host moves zombies; we only animate them
                // and report our own punches.
                z.updateRemote(dt, this.camera);
                if (z.isDead && z.removable) { this.removeZombie(z); continue; }
                continue; // (my fists: BodyStrikes — only a real blow that reaches the body)
            }
            // held up by «Вингардиум Левиоса»: Levitation carries it (it can't walk or bite)
            if (z.lev) { z._spinHalo?.(dt); continue; }
            const target = z.dummy ? null : this._zombieTarget(z);
            z.update(dt, target ? target.pos : null, this.camera, this.collision);
            if (z.dummy && !z.isDead && !z.isFrozen && !z.isStunned && !(z.stunTimer > 0)) {
                // pushed by a blow, it steps back to its place (stands on the spot)
                const hm = this.dummyHome, k = Math.min(1, dt * 4);
                z.group.position.x += (hm.x - z.group.position.x) * k;
                z.group.position.z += (hm.z - z.group.position.z) * k;
            }
            if (z.removable) { this.removeZombie(z); continue; }
            if (z.isDead || z.isSleeping) continue;

            this.collision.resolveCylinder(z.group.position, ZOMBIE_RADIUS * z.sizeK, z.group.position.y - z.gOff, 3.5 * z.sizeK, 1.05);

            // Player–zombie separation (local player)
            const dx = charPos.x - z.group.position.x, dz = charPos.z - z.group.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 1.3 * z.sizeK && dist > 1e-4) {
                const overlap = 1.3 * z.sizeK - dist;
                charPos.x += (dx / dist) * overlap * 0.6;
                charPos.z += (dz / dist) * overlap * 0.6;
                z.group.position.x -= (dx / dist) * overlap * 0.4;
                z.group.position.z -= (dz / dist) * overlap * 0.4;
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
            // a servant zombie's blow at another creature (an animal, a villager, a living tree, a wizard)
            if (target && target.foe && target.distSq < 5.3) {
                const now = Date.now();
                if (now - (z.lastAttackTime || 0) > 900) {
                    z.lastAttackTime = now;
                    z.triggerAttack();
                    this.servants.damage(target.foe, 2, _v1.subVectors(target.pos, z.group.position).setY(0).normalize().clone(), z.thrallOwner);
                }
                continue;
            }
            if (target && (target.zombie || target.follow || target.foe)) continue;

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

    _spawnWaves(dt) {
        if (!this.authority || this.config.map) return;
        this._updateDummy(dt);
        this.zombieSpawn?.update(dt); // (zombies out of the dark: caves, the night — ZombieSpawn.js)
        if (this.config.mode === 'creative') {
            const desired = this.config.zombieCount || 0;
            let live = 0;
            for (const z of this.zombies) if (!z.isDead && !z.dummy) live++;
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

    /**
     * The magic gesture: an arm lifted ~30° from hanging is enough (measured on the camera
     * picture — PoseInterpreter.armLift); without it, the old rule (wrist near the face).
     */
    _raisedHand() {
        const lift = this.currentPose?.armLift;
        if (!lift) return this.character.isHandRaised();
        const NEED = 0.12; // (~28°)
        const l = lift.left > NEED, r = lift.right > NEED;
        if (!l && !r) return null;
        const side = l && r ? (lift.left >= lift.right ? 'left' : 'right') : l ? 'left' : 'right';
        return { side, bothLevel: l && r && Math.abs(lift.left - lift.right) < 0.25 };
    }

    _updateMagicGesture() {
        const loading = this.ui.isLoading && this.ui.isLoading();
        // Only when a person is actually tracked (no "raised hands" from the default pose)
        const tracked = this.currentPose && this.currentPose.hasPose;
        const res = tracked && (this.config.mode !== 'test' || this.testState === 'fpv') ? this._raisedHand() : null;
        if (res && !loading) {
            // a wand in a hand: the magic is always that hand's (the other hand never casts)
            const side = this.wandSide() || res.side;
            this.magicHand = side;
            this.lastMagicHand = side;
            this.lastMagicTime = Date.now();
            const label = res.bothLevel ? 'ОБЕ' : res.side.toUpperCase();
            if (!this.isMagicActive) {
                this.isMagicActive = true;
                this.hud.setVoice(`🎤 <span style="color:#55efc4">ЖДУ КОМАНДУ (${label})</span>`);
                if (this.voice) this.voice.start();
            } else if (this.hud.voiceText().includes('ЖДУ КОМАНДУ') || (this.hud.voiceAge() > 2500 && !this.hud.hintShowing?.())) {
                // (a fresh game message — «Не хватает маны», a spell result — stays readable until it fades)
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
            _v2.copy(ch.group.position).add(_v1.set(0, 2, 0));
            // reading the open book: over the shoulder, the pages filling the view
            const rc = this.books?.readCam || this.scrolls?.readCam;
            this._readK = (this._readK || 0) + ((rc ? rc.k : 0) - (this._readK || 0)) * Math.min(1, dt * 6);
            if (rc) { this._readFrom = (this._readFrom || new THREE.Vector3()).copy(rc.from); this._readAt = (this._readAt || new THREE.Vector3()).copy(rc.at); }
            if (this._readK > 0.001 && this._readFrom) {
                this.camera.position.lerp(this._readFrom, this._readK);
                _v2.lerp(this._readAt, this._readK);
            }
            this.camera.lookAt(_v2);
            if (this._jolt) { this.camera.rotateY(this._jolt.yaw * 0.5); this.camera.rotateX(this._jolt.pitch * 0.5); }
        }
        if (this.fx.shake > 0) {
            const s = this.fx.shake * 0.25;
            this.camera.position.x += (Math.random() - 0.5) * s;
            this.camera.position.y += (Math.random() - 0.5) * s;
            this.camera.position.z += (Math.random() - 0.5) * s;
        }
        // the head spinning after a fall (Knockdown.dizzy): a slow, gentle sway; the blur is the Hud's
        const dz = this.knock?.dizzy || 0;
        if (dz > 0.001) {
            const t = performance.now() / 1000;
            this.camera.rotateZ(Math.sin(t * 0.8) * 0.05 * dz);
            this.camera.rotateX(Math.sin(t * 0.53 + 1) * 0.02 * dz);
            this.camera.rotateY(Math.sin(t * 0.37 + 2) * 0.03 * dz);
        }
        this.hud?.setDizzy?.(dz, this.renderer?.domElement);
        if (this.config.mode !== 'test') this._cameraOutOfRock(ch);
        this.camera.updateMatrixWorld(true);
    }

    /** Is the body's own column rock where the body is (above a step, up to the head)? */
    /**
     * My feet for the walls' test. Standing, they are on the floor under me even while the body
     * still eases up onto a step it has just walked onto (Character.update): otherwise, going up
     * stairs or a slope, the next step looks like a wall to the lagging feet and stops the walk.
     */
    _feetY(p) {
        const ch = this.character;
        const f = p.y - PLAYER_GROUND_OFFSET + (ch.isCrouching ? 1.0 : 0);
        if (!ch.onGround || ch.swimY != null || this.flight?.active || this.ledge?.active) return f;
        return Math.max(f, Math.min(ch.groundY, f + 1.05));
    }

    _bodyInRock(p) {
        const T = this.terrain;
        if (!T?.solidIn) return false;
        const feet = this._feetY(p);
        return T.solidIn(Math.round(p.x), Math.round(p.z), Math.ceil(feet + 1.05 + 0.5 + 1e-3), Math.floor(feet + 3.5 + 1.5 - 1e-3));
    }

    /**
     * The eye never inside the rock (thrown against a cave wall, lying with the head at the rock,
     * a shake, the camera behind the back in a tunnel): it comes in towards the body until clear.
     */
    _cameraOutOfRock(ch) {
        const t = this.terrain?.data;
        if (!t?.raycast) return;
        const from = _v2.copy(ch.group.position);
        from.y += this.knock?.down ? 0.4 : 1.2;
        if (this.collision.pointBlocked(from.x, from.y, from.z)) return; // (the body itself stuck: nothing better to do)
        const to = this.camera.position, d = _v1.subVectors(to, from), len = d.length();
        if (len < 1e-3) return;
        d.divideScalar(len);
        const hit = t.raycast(from, d, len + 0.25);
        if (hit && hit.dist < len + 0.25) to.copy(from).addScaledVector(d, Math.max(0, hit.dist - 0.25));
    }

    // ================================================================ cleanup
    dispose() {
        this.stop();
        this.ships?.dispose();
        this.inventory?.dispose();
        this.books?.dispose();
        this.scrolls?.dispose();
        this.swim?.dispose();
        this.seaSurface?.dispose();
        this.items?.dispose();
        this.wandMagic?.dispose();
        this.vortex?.dispose();
        this.hellfire?.dispose();
        this.waterStorm?.dispose();
        this.gear?.dispose();
        this.bleeding?.dispose();
        this.animals?.dispose();
        this.castleLife?.dispose();
        this.death?.dispose();
        this.doors?.dispose();
        this.boards?.dispose();
        this.campfires?.dispose();
        this.cauldrons?.dispose();
        this.crystals?.dispose();
        this.houses?.dispose();
        this.beds?.dispose();
        this.spiders?.dispose();
        this.dragons?.dispose();
        this.travelers?.dispose();
        this.carriages?.dispose();
        this.phoenixes?.dispose();
        this.livingTrees?.dispose();
        this.servants?.dispose();
        this.circleAttack?.clear();
        this.inspirius?.clear();
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
            surf: this.boards?.debugState() || null,
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
