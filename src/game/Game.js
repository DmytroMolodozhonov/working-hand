/**
 * Game.js — one play session (creative, survival, custom map or camera test).
 *
 * Owns the scene and every system, runs the frame loop and, in multiplayer,
 * talks to the other players through NetSync. Gameplay rules are the original
 * ones from main.js; see the README for the list of fixes.
 */

import { marketDef, buildMarketStall } from './CreativeMarket.js';
import { guestDef } from './CreativeGuest.js';
import { deepAt, swimStep, SWIMMERS, splashes } from './CreatureSwim.js';
import { crowdStep, spotTaken } from './CrowdSources.js';
import { wardsOf, pushOut } from './ShieldWalls.js';
import { BODY_R } from './Crowd.js';
import * as THREE from 'three';
import { VoiceGate } from './VoiceGate.js';
import { VoxelWorld, MAP_CELL } from '../world/World.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET, BODY_H, CROUCH } from '../entities/Character.js';
import { Zombie, ZOMBIE } from '../entities/Zombie.js';
import { Chest, chestSamples } from '../entities/Chest.js';
import { Effects } from '../fx/Effects.js';
import { SpellManager, matchSpell } from '../fx/SpellManager.js';
import { SpellLog } from '../core/SpellLog.js';
import { LONGER_OF } from '../audio/SpellSpotter.js';
import { WeaponSystem } from './Weapons.js';
import { FlightController, FLIGHT } from './Flight.js';
import { PoseSmoother } from '../input/PoseSmoother.js';
import { WaterMagic } from './WaterMagic.js';
import { WaterVortex, bubbleLike } from './WaterVortex.js';
import { inStream } from '../fx/InfernoStream.js';
import { Combat, PVP, bombardoDamage, sampleShieldModels } from './Combat.js';
import { isDivine } from './ProtectionGods.js';
import { chestCoins } from './CastleTreasure.js';
import { scaleCoins } from './CoinScale.js';
import { DAMAGE, blastDamage } from './Damage.js';
const BLAST = DAMAGE.BlastPeak, LIGHTNING = DAMAGE.Lightning;
import { Levitation } from './Levitation.js';
import { LevitationMaxima } from './LevitationMaxima.js';
import { Accio, accioCatcher } from './Accio.js';
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
import { Animals, animalModel, goldenTreeModel, baksadiModel, bonesModels } from './Animals.js';
import { PEGASUS_COATS, PEGASUS_COLOR } from './AnimalModels.js';
import { FarShape, skinnedSamples } from '../core/FarShape.js';
import { installSceneMatrices } from '../core/SceneMatrices.js';
import { updateFarBatches, resetFarBatches } from '../core/FarBatch.js';
import { CastleLife } from './CastleLife.js';
import { ArenaDuels } from './ArenaDuels.js';
import { Ships } from './Ships.js';
import { sailorModels, setCrewless } from './Sailors.js';
import { DeathSystem } from './Death.js';
import { refusal, HintGate } from './Hints.js';
import { ITEM_INFO, newUid, SPELL_RU, SCROLL_RIBBON_RU, baseSpell, makeItemModel, disposeModel as disposeItemModel, rollWand, spellScroll } from './ItemTypes.js';
import { prewarmVillagers, villagerMaterials } from '../entities/VillagerModel.js';
import { Doors, doorModel } from './Doors.js';
import { Alohomora } from './Alohomora.js';
import { Campfires } from './Campfires.js';
import { LanternLights } from './LanternLights.js';
import { FireLights } from './FireLights.js';
import { Cauldrons } from './Cauldrons.js';
import { Beds } from './Beds.js';
import { Houses } from './Houses.js';
import { BuildingFx } from './BuildingFx.js';
import { WizVillages } from './WizVillages.js';
import { Wreck } from './Wreck.js';
import { BurnWreck, burnsInFire } from './BurnWreck.js';
import { logStackModel } from './LogModel.js';
import { WaveAttacks } from './WaveAttack.js';
import { TotalDestruction } from './TotalDestruction.js';
import { LOOT_FOR } from './ItemTypes.js';
import { scrollKnown, knownScrollKeys } from './SpellBook.js';
import { CircleAttack } from './CircleAttack.js';
import { Inspirius } from './Inspirius.js';
import { Boom } from './Boom.js';
import { Hellfire } from './Hellfire.js';
import { Firefighting } from './Firefighting.js';
import { WindRing } from './WindRing.js';
import { Burning } from './Burning.js';
import { WaterStorm } from './WaterStorm.js';
import { FallingBlocks } from '../fx/FallingBlocks.js';
import { SmokeSwipe } from './SmokeSwipe.js';
import { Settling } from '../world/Collapse.js';
import { prepareStructure } from '../world/Structure.js';
import { setNearShadow } from '../core/Shadows.js';
import { SunBeam } from '../fx/SunBeam.js';
import { SunContest } from './SunContest.js';
import { buildWeapon } from '../entities/WeaponModels.js';
import { ItemIcons } from '../ui/ItemIcons.js';
import { Spiders, spiderModel } from './Spider.js';
import { captureLegacy, wipeHero } from './Legacy.js';
import { BreakwardMark } from './BreakwardMark.js';
import { Steadiness } from './Steadiness.js';
import { MonsterTransform } from './MonsterTransform.js';
import { monsterSamples } from '../entities/MonsterBody.js';
import { DarkHero, onDarkCast } from './DarkMagic.js';
import { DarkExile } from './DarkExile.js';
import { darkSamples } from '../entities/DarkSkin.js';
import { DarkLordLife } from './DarkLordLife.js';
import { darkLordSamples } from '../fx/DarkLordFx.js';
import { lordSamples } from '../entities/DarkLordLook.js';
import { CaveMemory, CaveExplorer } from './CaveMap.js';
import { IceCastleLife } from './IceQueen.js';
import { Temple } from './Temple.js';
import { LoreLibrary } from './LoreLibrary.js';
import { Blackbeard } from './Blackbeard.js';
import { FleetOrders } from './FleetOrders.js';
import { sampleIceModels, iceQueenModel, snowmanModel, iceMonsterModel } from './IceModels.js';
import { Dragons } from './Dragons.js';
import { DragonRide } from './DragonRide.js';
import { ImperiusControl } from './ImperiusControl.js';
import { pulse as imperiusPulse } from '../entities/ImperiusEyes.js';
import { Carriages, cartModel } from './Carriages.js';
import { CASTLE_CELL } from '../world/Castles.js';
import { ShipModel, barrierParts } from '../entities/ShipModel.js';
import { buildLayout } from './ShipLayout.js';
import { SHIP_CLASSES } from './ShipTypes.js';
import { dragonModel } from './DragonModel.js';
import { KIND_IDS } from './DragonKinds.js';
import { Travelers } from './Travelers.js';
import { DRAGON_WAND_FIRE } from './DragonKinds.js';
import { Phoenixes, phoenixModel } from './Phoenixes.js';
import { Owls } from './Owls.js';
import { Canaries } from './Canaries.js';
import { Plants } from './Plants.js';
import { MagicFloraLife } from './MagicFloraLife.js';
import { plantSamples } from '../fx/PlantModels.js';
import { Gargoyles } from './Gargoyles.js';
import { LivingTrees } from './LivingTrees.js';
import { Servants } from './Servants.js';
import { Duel, duelRange } from './Duel.js';
import { QualityManager, viewDistanceScale } from './Quality.js';
import { Ultra } from './Ultra.js';
import { FireSystem } from '../world/Fire.js';
import { NetSync } from '../net/NetSync.js';
import { hashString } from '../core/math.js';
import { BLOCK, isCastleBlock, BASE_COLORS, WORLD_GEN, FURNISH_FROM_GEN, BUILDINGS_FROM_GEN, SPAWN_MAPS_FROM_GEN, HOUSE_SIZE_FROM_GEN, DUNGEON_FROM_GEN, GHOST_CASTLE_FROM_GEN, ARENA_ENTRIES_FROM_GEN, ARENA_X2_FROM_GEN, ICE_ARENA_FROM_GEN, WATER_LEVEL_Y, TEST_CAVE, TEST_DRAGON_SPOT } from '../world/Terrain.js';
import { SeaWaves, WAVES } from '../world/Sea.js';
import { SeaSurface } from '../fx/SeaSurface.js';
import { SurfBoards } from './SurfBoards.js';
import { lookPitch } from '../input/PoseInterpreter.js';
import { headTurnStep, lyingHead } from './HeadTurn.js';
import { heroBody, mountBody, moveSolid } from './BodyContact.js';
import { HandHold } from './HandHold.js';
import { Mana, NOT_SPELLS, SAME_SPELL } from './Mana.js';
import { heroOf, manaRules } from './HeroSetup.js';
import { BossRetry } from './BossRetry.js';
import { HeroApply } from './HeroApply.js';
import { knows as knowsSpellOf, howLearned, teachKey } from './SpellBook.js';
import { Achievements } from './Achievements.js';
import { BodyImpact } from './BodyImpact.js';
import { thunderZone, clearWay, roofAbove } from './ThunderWave.js';
import { Knockdown } from './Knockdown.js';
import { UpSpell } from './UpSpell.js';
import { CreatureImpact } from './CreatureImpact.js';
import { StrongMagic } from './StrongMagic.js';
import { isStrongDuel, confusedMiss } from './StrongSpells.js';
import { HurtFlash } from './HurtFlash.js';
import { ArmorSystem } from './Armor.js';
import { BodyStrikes } from './BodyStrikes.js';
import { HandBlocks } from './HandBlocks.js';
import { SPELL_PHYSICS, blastPush } from './Impact.js';
import { ManaCrystals } from './ManaCrystals.js';
import { HouseWards, isWardSpell, WARD_NAMES, keepIn } from './HouseWards.js';
import { ZombieSpawn, worldLights, litAt, inSunlight, ZSPAWN, lightLevel } from './ZombieSpawn.js';
import { HouseMagic } from './HouseMagic.js';
import { CastleMagic } from './CastleMagic.js';
import { DivineCreation } from './DivineCreation.js';
import { CustomPlants } from './CustomPlants.js';
import { CustomCreatures } from './CustomCreatures.js';
import { IceMagic } from './IceMagic.js';
import { Space } from './Space.js';
import { PlanetMagic, PLANET_SPELLS } from './PlanetMagic.js';
import { PlanetDestroy } from './PlanetDestroy.js';
import { Drawdown } from './Drawdown.js';
import { Liquidation } from './Liquidation.js';
import { Stitching } from './Stitching.js';
import { Bridge } from './Bridge.js';
import { Groundprud } from './Groundprud.js';
import { Invisibility } from './Invisibility.js';
import { VisibleGodi } from './VisibleGodi.js';
import { Pentagranium } from './Pentagranium.js';
import { SecondSight } from './SecondSight.js';
import { GhostCastleLife } from './GhostCastleLife.js';
import { SpencerBirds } from './SpencerBirds.js';
import { Ghosts } from './Ghosts.js';
import { BeslanGrass } from './BeslanGrass.js';
import { UnitedPower } from './UnitedPower.js';
import { Vitality } from './Vitality.js';
import { GroundVortex } from './GroundVortex.js';
import { SeeThroughFx } from '../fx/SeeThroughFx.js';
import { SteamBodies } from '../fx/SteamFx.js';
import { Fireworks } from './Fireworks.js';
import { Nihilis } from './Nihilis.js';
import { EnchantCircles } from './EnchantCircles.js';
import { glowSamples } from '../fx/EnchantGlow.js';
import { LedgeClimb } from './LedgeClimb.js';
import { JUMP_ASSIST, ledgePush } from './Jump.js';
import { Concentration } from './Concentration.js';
import { bareGate, BARE_HINT } from './BareHand.js';
import { CrossedShield } from './CrossedArms.js';
import { CastHints } from './CastHints.js';
import { netLog } from '../net/Network.js';
import { castingHand, aimedUpOrSelf, pointsUp } from './WandAim.js';
import { restartsCreative } from './CreativeRestart.js';

const SPELL_COOLDOWN = 1000;
/** The duel's one-word spells: cast the moment they are heard — no wait for a «… Максима» (NativeVoice.DUEL_FAST). */
const DUEL_FAST = new Set(['Jolt', 'Sapira', 'Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Disarmor', 'Ice', 'Sands']);
/** s: «Левиоса» heard again this soon after it lifted something (or sent a charge) is the same phrase */
const LEV_SAME_PHRASE = 2.5;
const WATER_COOLDOWN = 600; // ms between water commands («максима» can be repeated)
const BOMBARDO_WAIT = 700; // ms to wait for «…Максима» after an unfinished «Бомбардо»
// Mana: spells that may still fail after they are paid for — they report their own success (Mana.js)
const MANA_LATER = new Set(['GroundVortex', 'Imperius', 'ImperiusMaxima', 'BrainrotMaxima', 'CreatePlanet', 'PlanetLiquidation', 'EnlargePlanet', 'TerraformPlanet', 'LevitationSuperMaxima', 'IceCastle', 'IceBridge', 'Inferno', 'Hellfire', 'WaterVortexSuperMaxima', 'Bombardo', 'BombardoMaxima', 'Accio', 'LightningStrike', 'TotalDestruction', 'TotalDestructionMaxima', 'Inspirius', 'Boom', 'Sapira', 'Sands', 'Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Jolt', 'JoltMaxima', 'Firefighting', 'FirefightingMaxima', 'CreateHouse', 'ImproveHouse', 'CreateCastle', 'DivineCreation', 'Liquidation', 'LiquidationMaxima', 'Fireworks', 'VisibleGodi']);
const PLAYER_RADIUS = 0.48;
export const DAY_CYCLE_MS = 24 * 60 * 1000;
const ZOMBIE_RADIUS = 0.88;
/** The Creative test dragon: on its own peak of the test mountain, away from the queen's ice castle (Terrain.TEST_DRAGON_SPOT). */
const TEST_DRAGON = { id: 'ctest-dragon', ...TEST_DRAGON_SPOT };
/** A zombie in deep water: floats like a person (its chest at the top), slow, any bank of a step it climbs; no air to run out. */
const ZOMBIE_SWIM = { ...SWIMMERS.person, speed: 0.9, float: 2.1, air: Infinity }; // (float: the feet this far under the top — the water at its chest)
/** What a zombie notices: hears a player this near (m), sees him this far with nothing between, follows him this far. */
export const ZSENSE = { HEAR: 10, SEE: 34, LOSE: 48, ROAM: 7, SCENT: 90 }; // (SCENT: it drifts towards the living this near)
const BLOCK_COLORS = { [BLOCK.GRASS]: 0x4CAF50, [BLOCK.DIRT]: 0x7a5230, [BLOCK.STONE]: 0x8a8a8a, [BLOCK.SNOW]: 0xf2f6f8 };

/** ms a frame the checks of the buildings after a change may take (Structure.js — the rest goes on next frame). */
const SETTLE_MS = 2;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _castSnd = new THREE.Vector3(); // (where my spell sounds from: SoundManager.spellCast)
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

    /** The hero's gravity (1 = Earth): one multiplier for falling, jumping and walking — Jump.js says how to change it. */
    get gravityK() { return this.character?.gravityK ?? 1; }
    set gravityK(k) { if (this.character) this.character.gravityK = Math.max(0.05, +k || 1); }

    /**
     * A spell of the gods (ProtectionGods.isDivine) said on the Earth in a multiplayer game whose world was made without
     * «Божественные заклинания на Земле»: forbidden. «Flying Maxima» is not — it is the way off the Earth, into space.
     */
    _godsBanned(name) {
        if (!this.sync || this.config?.godsOnEarth || name === 'FlyingMaxima' || !isDivine(name)) return false;
        return (this.space?.realm ?? 'earth') === 'earth';
    }

    get authority() {
        return !this.net || !this.net.active || this.net.isHost;
    }

    /** The leading hand (Настройки: Правша / Левша): the wand is taken from the belt by it, the coin pouches and the pocket are on its side, it casts when no hand says otherwise. */
    get dom() { return this.settings?.leftHanded ? 'left' : 'right'; }
    get off() { return this.settings?.leftHanded ? 'right' : 'left'; }

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
        // («Гладкий мир» ticked when the world is made: generation 6 — ramps and slabs, BlockShapes.js; else generation 5, as before)
        this.config.gen = this.gen = config.gen ?? (config.saved ? (config.saved.gen ?? 1) : config.smooth ? WORLD_GEN : 5);
        // (multiplayer: the gods' spells on the Earth — the host's choice when the world was made, kept with it; off by default)
        this.config.godsOnEarth = !!(config.godsOnEarth ?? config.saved?.godsOnEarth);
        // «Настройки героя» Творческого мира (HeroSetup.js): записаны в мире; у старого мира их нет — всё как было раньше
        this.config.hero = config.mode === 'creative' ? (config.hero ?? config.saved?.hero ?? undefined) : undefined;
        this.hero = heroOf(this.config);
        // the duel-only start («Перед дуэлью на арене»): the world is the arena — no creatures, no ships, no villagers' talk or voices (the author: «можно отключить всё, что не касается дуэли»)
        this.duelOnly = config.mode === 'creative' && this.hero.spawn === 'arena';
        { const mm = document.getElementById('minimap-container'); if (mm) mm.style.display = this.duelOnly ? 'none' : ''; } // (the duel arena has no use for a map)
        setCrewless(config.mode === 'creative' && this.hero.noCrew); // (ships without sailors: Sailors.crewRoster)
        // real trees, not blocks (TreeBuild.js, Trees.js): every world made from now on, smooth or not; a saved world keeps
        // what it was made with (its felled and burnt trees lie on those), a guest takes the host's
        this.config.realTrees = !!(config.realTrees ?? (config.saved ? config.saved.realTrees : !config.map));

        progress(62, 'Создание мира...');
        resetFarBatches(); // (the last game's batched shapes: let go)
        installSceneMatrices(); // (hidden branches and people out of the picture: their matrices are not recomputed each frame)
        this.scene = new THREE.Scene();
        this.scene.matrixAutoUpdate = false; // (the scene never moves: its still things are not forced to recompute)
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
            slopes: this.gen >= 6, // (ramps and slabs in the land and the buildings — BlockShapes.js)
            wizHuts: this.gen >= 7, // (the lone wizards' houses roomy — Hamlets.js)
            furnish: this.gen >= FURNISH_FROM_GEN, // (the castles' rooms furnished, more chests — CastleFurniture.js)
            buildings: this.gen >= BUILDINGS_FROM_GEN, // (different buildings in the settlements — Buildings.js)
            apart: this.gen >= SPAWN_MAPS_FROM_GEN, // (the Creative bosses' places apart: the dragon's lair, the far ice castle, the spider's den — Terrain.SPAWN_MAPS_FROM_GEN)
            bigHouses: this.gen >= HOUSE_SIZE_FROM_GEN, // (the villagers' homes roomy, the rich in two floors — Castles.buildHouseBig)
            dungeons: this.gen >= DUNGEON_FROM_GEN, // (the ruins and the underground dungeons — Dungeons.js)
            ghostCastle: this.gen >= GHOST_CASTLE_FROM_GEN, // (the Castle of Ghosts — only a hero who sees the invisible has it in his land: GhostCastleLife.js)
            iceArena: this.gen >= ICE_ARENA_FROM_GEN, // (the Ice Queen's palace on the great ice arena — IceCastle.ICE_CASTLE.ARENA)
            arenaX2: this.gen >= ARENA_X2_FROM_GEN, // (the duel arenas twice as wide — DuelArenas.ARENA_X2)
            arenaEntries: this.gen >= ARENA_ENTRIES_FROM_GEN, // (the duel arenas' visitors' stair and the steward's stall — DuelArenas.entries)
            bigArena: config.mode === 'creative' && this.hero?.spawn === 'arena', // (the duel-only start: its arena is 2.4× bigger — DuelArenas.ARENA_BIG)
            meshTrees: this.config.realTrees, // (real trees, not blocks — TreeBuild.js, Trees.js)
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
            // the first creature (not a player: those have their shields — SpellManager) the move p→q touches: the point, or null
            bodyOnWay: (p, q, casterId) => this.duel?.touchOnWay(p, q, casterId === 'local' ? this.localId : casterId, true) || null,
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
            quakeShake: (front, power, casterId) => { this.quake.shake(front, power); this.crystals?.hitAt(front, power > 1 ? 5 : 3.5, casterId, 'Earthquake', 30); /* (the rock shakes: crystals in a cave under the wave crack) */ if (this.authority && (this._quakeAlarmT || 0) < performance.now() - 500) { this._quakeAlarmT = performance.now(); this.castleLife?.alarm(front, 'quake', null, power > 1 ? 9 : 6); } }, // (…and shakes under whoever is near the wave; the people near take fright)
            storm: (origin) => this.storm?.start(origin, 13),
            sun: (origin, by, side) => this.sun?.cast(origin, by, side),
            rain: () => this.storm?.startRain(), // («Let it rain»: the whole world, everybody sees it)
            lightningAt: (point, casterId) => { if (this.temple?.wards(point, 3)) { this.temple.wardHit(point, 3); return; } point = this._wardLightning(point, casterId); this.storm?.endIn(3); this.books?.hitAt(point, 3); this.houses?.hitAt(point, 3); this.ghosts?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); if (this.authority) { this.customCreatures?.hitAt(point, 3, LIGHTNING, 'LightningStrike', casterId); this.customPlants?.hitAt(point, 3, LIGHTNING, 'LightningStrike', casterId); } this.animals?.hitAt(point, 3, LIGHTNING, casterId); if (this.authority) { this.castleLife?.alarm(point, 'blast', casterId, 3); this.crystals?.hitAt(point, 3, casterId, 'Lightning'); this.spiders?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.phoenixes?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.owls?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.spencers?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.plants?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.canaries?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.flora?.hitAt(point, 3, LIGHTNING, 'Lightning'); this.gargoyles?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.dragons?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.dragons?.noise(point, casterId); this.iceCastle?.hitAt(point, 3, LIGHTNING, 'Lightning', casterId); this.iceCastle?.attacked?.(point, 3, casterId); this.castleLife?.hitAt(point, 3, LIGHTNING, casterId); this.livingTrees?.hitAt(point, 3, LIGHTNING, 'Lightning'); this.ships?.lightningAt(point, casterId); this.ships?.crew.hitAt(point, 3, LIGHTNING, casterId, 'Lightning'); this.carriages?.hitAt(point, 3, 30, casterId, 'lightning'); } },
            thunder: (o, d, casterId, deal) => thunderZone(this, o, d, casterId, deal), // («Thunderwave»: the creatures in its zone — ThunderWave.js)
            clearWay: (a, b) => clearWay(this, a, b),
            roofAt: (x, y, z) => roofAbove(this, x, y, z), // («Thunderwave»: a roof over the point takes the bolt)
            roofHint: () => { if (this._roofHinted) return; this._roofHinted = true; this.hud?.setVoice?.('⚡ Гром ударил в крышу: под крышей Thunderwave не достанет цель — выйдите на открытое место', true); },
            birdRay: (o, d, len, width, name) => {
                len = this.wards?.clipRay(o, d, len) ?? len; // (a house's sphere stops it from outside)
                if (name === 'Thunderwave') { // (the creatures are hit by the zone — ThunderWave.js; the ray only breaks glass and chips carts)
                    this.houses?.hitRay(o, d, len, width);
                    if (this.authority) this.carriages?.hitRay(o, d, len, width, 6, this.localId, false);
                    return;
                }
                this.books?.hitRay(o, d, len, width);
                this.houses?.hitRay(o, d, len, width);
                if (name === 'Inferno') this.burning?.igniteRay(o, d, len, width, this.localId); // (the stream sets whoever it touches alight: Burning.js)
                this.animals?.hitRay(o, d, len, width, 3, this.localId, name);
                if (this.authority) this.spiders?.hitRay(o, d, len, width, name === 'Inferno' ? 8 : name === 'Thunderwave' ? 8 : 5, name);
                if (this.authority) { this.dragons?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); if (name === 'Thunderwave') this.dragons?.noise(o); } // (dragons: fire does nothing — DragonKinds.ON_DRAGON)
                if (this.authority) this.phoenixes?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); // (fire and ice: no harm to a phoenix — Phoenixes.TARGETS)
                if (this.authority) this.customPlants?.hitRay(o, d, len, width, 5, name); // (plants of one's own: fire burns them, a blast breaks them — CustomPlants.PLANT_TARGETS)
                if (this.authority) this.flora?.hitRay(o, d, len, width, 5, name); // (wild plants: fire burns, cold does nothing — MagicFlora.floraHarm)
                if (this.authority) this.customCreatures?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name, this.localId); // (creatures of one's own: CustomCreatures.hit)
                if (this.authority) this.canaries?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name, this.localId); // (the swamp Canaries: a ray hurts them; the camp turns on the caster — Canaries.js)
                if (this.authority) this.plants?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); // (plants: a ray cuts them; cold kills a flower, freezes a head)
                this.ghosts?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name, this.localId); // (a ghost of the Castle of Ghosts: nothing but the wind / the scares act on it — GhostRules.ghostSpell)
                if (this.authority) this.spencers?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); // (the invisible bird: any real harm kills it — SpencerRules.verdict)
                if (this.authority) this.owls?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); this.gargoyles?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name); // (an owl: only a scroll's ray hurts it — «Тандервейв»; the rest it darts away from — Owls.TARGETS)
                if (this.authority) this.iceCastle?.hitRay(o, d, len, width, name === 'Thunderwave' ? 8 : 5, name, this.localId); // (the Ice Castle: by IceQueen.iceDamage — fire melts, the plain spells nothing on the queen)
                if (this.authority) { // («Вайнд» is a harmless gust: it pushes the people — CreatureImpact — and never hurts or alarms them: CastleLife.windRay)
                    if (name === 'Wind' || name === 'WindMaxima') this.castleLife?.windRay(o, d, len, width, this.localId, name);
                    else this.castleLife?.hitRay(o, d, len, width, name === 'Inferno' ? 6 : 4, this.localId);
                }
                if (this.authority) this.ships?.crew.hitRay(o, d, len, width, name === 'Inferno' ? 6 : 4, this.localId, name); // (the ships' crews; a black ship's skeleton — by the kind: Sailors.pirateBoneDamage)
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
            windGhosts: (o, d, power, casterId) => { this.ghosts?.blow(o, d, power, casterId === 'local' ? this.localId : casterId, power > 1); }, // («Wind» / «Wind Maxima» blow the ghosts of the Castle of Ghosts away — Ghosts.blow; they come back later)
            ghostsAim: (o, d, range, name, casterId) => { this.ghosts?.hitRay(o, d, range, 1.2, 0, name, casterId === 'local' ? this.localId : casterId); }, // («Overgrown» at a ghost: does not work — GhostRules; the caster is told once)
            windRingBegin: (o, by) => this.windRing?.begin(o, by), // («Вайнд Максима» up: the wave that puts fires out — WindRing.js)
            windRingStep: (sp, dt) => this.windRing?.step(sp, dt),
            impulseWorld: (name, origin, r, pushAt, casterId) => this._impulseWorld(name, origin, r, pushAt, casterId), // («Wind Impulse»: things, book-birds)
            drawdown: (name, at, casterId) => this.drawdown?.start(name, at, casterId),
            liquidation: (name, o, d, casterId) => this.liquidation?.fly(name, o, d, casterId),
            stitching: (o, d, casterId) => this.stitching?.sew(o, d, casterId),
            bridge: (o, d, casterId) => this.bridge?.grow(o, d, casterId),
            groundprud: (o, d, casterId) => this.groundprud?.grow(o, d, casterId),
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
        // (my hands: each drawn as one shape per material, the finger bones moved by the video card — FarShape; ~44 draws
        // every frame were the hands' segments. Hidden by camera layers, so the game's own `visible`/layers stay the truth)
        this._handOnes = [this.character.leftSimplifiedHand, this.character.rightSimplifiedHand].filter(Boolean).map((h) => {
            h.group.userData.farRadius = 3; // (with a staff or a sword in it)
            const f = new FarShape(h.group, { cache: false, hide: 'layers' });
            f.set(true);
            return f;
        });
        if (isTest) this.character.group.position.set(10, 1.5, 10);
        else if (config.look) this.character.setLook(config.look); // the hero made in «Персонаж»

        this.weapons = new WeaponSystem(this);
        this.water = new WaterMagic(this);
        this.vortex = new WaterVortex(this); // «Water Vortex» (+ «Bubble», «Frozen») and «Fire Maxima»
        this.waterStorm = new WaterStorm(this); // «Water Vortex Super Maxima»: a great storm of water held and steered by the wand
        this.combat = new Combat(this); // Свободный мир: HP, fatigue, shields, freezing
        this.steady = new Steadiness(this); // the skill «Устойчивость» 1…100: grows by running over rough ground (Steadiness.js)
        this.darkExile = new DarkExile(this); // башня гонит чёрного мага 81+ (DarkExile.js)
        this.dark = new DarkHero(this); // уровень чёрной магии 0…100 (DarkMagic.js)
        this.darkLord = new DarkLordLife(this); // «настоящий тёмный маг»: на 100 уровне превращение, наряд, проклятие на доспехах, зелье (DarkLord.js)
        this.bossRetry = new BossRetry(this); // a fall in a fight with a boss at the chosen start: the window to try again (BossRetry.js)
        this.heroApply = new HeroApply(this); // «Настройки героя» Творческого мира (HeroApply.js)
        this.breakward = new BreakwardMark(this); // метка «слом защиты» (пентаграмма breakward: Breakward.js)
        this.monster = new MonsterTransform(this); // «Пентаграмма страшного монстра»: ×7, 10 минут (MonsterForm.js)
        this.mana = new Mana(this); // the mana bar's maximum grows with practice (Mana.js)
        this.achievements = new Achievements(this); // the five deeds and the status «Высший маг» (kept on death)
        // pushes, staggers, knockdowns, head jolts: my body (BodyImpact + Knockdown), every creature (CreatureImpact)
        this.impact = new BodyImpact(this);
        this.knock = new Knockdown(this);
        this.up = new UpSpell(this); // «Up»: get up from the ground / leap out of the water
        this.creatureImpact = new CreatureImpact(this);
        this.strong = new StrongMagic(this); // the strong duel spells and the new ice: what they do (StrongMagic.js)
        this.hurtFlash = new HurtFlash(this); // (wounded creatures glow red for a moment)
        this.strikes = new BodyStrikes(this); // my real hands striking bodies (players and creatures)
        this.handBlocks = new HandBlocks(this); // hands never go into blocks: a counter, a wall, a table
        this.ledge = new LedgeClimb(this); // out of a pit / up a ledge: palms on the edge, pulled down
        this._headBase = { yaw: 0, pitch: 0 };
        this.quake = new Quake(this); // «Earthquake»: creatures thrown, the ground breaking, shaking (Quake.js)
        this.drawdown = new Drawdown(this); // «Drawdown»: the ground sinks where the wand points (Drawdown.js)
        this.liquidation = new Liquidation(this); // «Liquidation»: a splash — a thing crumbles into dust (Liquidation.js)
        this.stitching = new Stitching(this); // «Stitching»: a passage sewn shut with stones (Stitching.js)
        this.groundprud = new Groundprud(this); // «Groundprud»: the ground rises into a wall (Groundprud.js)
        this.bridge = new Bridge(this); // «Create a Bridge»: planks over a river or a ravine (Bridge.js)
        this.invis = new Invisibility(this); // «Invisibility»: nobody sees me (Invisibility.js)
        this.groundVortex = new GroundVortex(this); // «Ground Vortex»: the earth rises and circles the hero (GroundVortex.js)
        this.sight = new SecondSight(this); // the gifts of the white pentagrams of sight: the night eyes, the sight of the invisible (SecondSight.js)
        this.ghostCastle = new GhostCastleLife(this); // the Castle of Ghosts: in the land only while the hero sees the invisible; its chests, who vanishes in it (GhostCastleLife.js)
        this.pentagranium = new Pentagranium(this); // «Pentagranium <Name>»: a pentagram laid where the wand points (it draws itself) and the rite over a wizard's body (Pentagranium.js)
        this.visibleGodi = new VisibleGodi(this); // «Visible Godi»: a cloud on the screen shows what is behind a wall (VisibleGodi.js; the picture: seeFx)
        this.vitality = new Vitality(this); // «Пентаграмма чудовищной живучести» (`Pentagranium Sanguinis`): the blood of a body killed by black magic → maximum health (Vitality.js)
        this.united = new UnitedPower(this); // «Пентаграмма объединённой силы» (`Pentagranium Unitas`): two things of one kind into one (UnitedPower.js)
        this.enchantCircles = new EnchantCircles(this); // «Пентаграмма зачарования»: the permanent circles and the rite (EnchantCircles.js, Enchant.js)
        this.nihilis = new Nihilis(this); // «Nihilis Atra»: a cone of light scatters black magic (Nihilis.js)
        this.fireworks = new Fireworks(this); // «Fireworks»: 10 s of salvos over the wand, seen from far (Fireworks.js, FireworksFx.js)
        this.levitation = new Levitation(this); // «Вингардиум Левиоса»
        this.levMax = new LevitationMaxima(this); // «Вингардиум Левиоса Максима» (houses, trees, ships, groups)
        this.accio = new Accio(this); // «Акцио»: a thing flies into the hand
        this.storm = new Storm(this); // «Lightning Strike» weather
        this.sun = new SunBeam(this); // «To the Sun»: the clouds part, the rain stops
        this.sunContest = new SunContest(this); // …and against the black clouds of the gargoyle ritual it fights them (SunContest.js)
        this.inventory = new Inventory(this); // five slots under the fatigue bar
        this.inventory._buildWeapon = buildWeapon; // (models of the weapons seen on the back)
        this.inventory._makeItemModel = makeItemModel;
        // the slots' pictures: each thing as itself, a small picture of its own model (ItemIcons.js)
        this.itemIcons = this.renderer ? new ItemIcons(this.renderer, { makeModel: makeItemModel, buildWeapon, dispose: disposeItemModel, onReady: () => { this.inventory._hk = null; this.inventory._render(); } }) : null;
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
        this.arenaDuels = new ArenaDuels(this); // the duel arenas: the fans, the duels, the sign-up (ArenaDuels.js)
        this.carriages = new Carriages(this); // carts and the wizards' carriages on the roads (Carriages.js)
        this.travelers = new Travelers(this); // the people of the roads: wanderers, knights errant, carts (Travelers.js)
        this.ships = new Ships(this); // the ships of the sea castles: decks, sails, the wheel, crews, cannons
        this.onFlame.push((o, d, len, casterId) => this.ships.igniteAlong(o, d, len, casterId)); // («Инферно» sets sails and decks on fire)
        this.onFlame.push((o, d, len, casterId) => this._flameBurnsPaper(o, d, len, casterId)); // (scrolls and books in it burn)
        this.death = new DeathSystem(this); // bodies → bones; everything drops at the body
        this.doors = new Doors(this); // «Create a Door», opening by the handle
        this.locks = new Alohomora(this); // «Алохомора»: locked chests, house doors, the gates of throne rooms
        this.boards = new SurfBoards(this); // surfboards: «Create a Board», carried by hand, ridden on waves
        this.fireLights = new FireLights(this); // firelight: a few warm lights at the nearest fires (made before prewarm; FireLights.js)
        this.campfires = new Campfires(this); // «Fire»: campfires, firewood, cooking (their light: fireLights)
        this.crystals = new ManaCrystals(this); // mana crystals deep in caves (their one light too)
        this.caveMap = new CaveMemory(); // what the hero has seen of the caves (the cave map — CaveMap.js)
        this.caveEyes = new CaveExplorer(this.caveMap);
        this.lanterns = new LanternLights(this); // the houses' lamps shine: lights at the nearest lanterns (made before prewarm too)
        this.cauldrons = new Cauldrons(this); // big cauldrons: water, things thrown in, brewing potions
        this.beds = new Beds(this); // beds, «Create a Bed», «Change a color», sleeping through the night
        this.houses = new Houses(this); // village houses near the players: doors, glass, beds, chests, families, pens
        this.buildingFx = new BuildingFx(this); // the mill's sails, the church bell, the chimneys' smoke, the anvil (generation 11: Buildings.js)
        this.wizVillages = new WizVillages(this); // the wizards' settlements: the central fire, the statue's plaque, the library's scrolls (WizVillages.js)
        this.wards = new HouseWards(this); // «Protection House»: a house's sphere of protection (HouseWards.js)
        this.houseMagic = new HouseMagic(this); // «Create a House», «Improve a House» (HouseMagic.js)
        this.castleMagic = new CastleMagic(this); // «Create a Castle» (CastleMagic.js)
        this.divine = new DivineCreation(this); // «Да пусть создастся …»: the gods make what is described (DivineCreation.js)
        this.iceMagic = new IceMagic(this); // «Create an Ice Castle», «Ice Bridge» (IceMagic.js)
        this.space = new Space(this); // «Космос»: Flying Maxima, the Solar System, the planets (Space.js, world/Planets.js)
        this.planetMagic = new PlanetMagic(this); // the gods' scrolls: «Create a Planet», «Enlarge Planet», «Terraform Planet», «Wingardium Leviosa Super Maxima»
        // after a blast: what hangs in the air falls (src/world/Collapse.js), doors / beds / chests / glass too
        this.wreck = new Wreck(this);
        this.burnWreck = new BurnWreck(this); // a house burning down: what loses its support falls, chests burn (BurnWreck.js)
        this.waves = new WaveAttacks(this); // «Wave Attack»: a real wave raised from the water, aimed by the hand
        this.destruction = new TotalDestruction(this); // «Total Destruction»: the area falls into ruins
        this.circleAttack = new CircleAttack(this); // «Circle Attack» / «… Maxima»: a great wave all round the wizard (arms in a T)
        this.inspirius = new Inspirius(this); // «Inspirius»: the ball of electric light from the wand — the mightiest blast
        this.planetDestroy = new PlanetDestroy(this); // «Planet Liquidation»: a planet blown up — the sixth scroll of the gods' library
        this.boom = new Boom(this); // «Бум»: a mountain (a castle) torn apart from inside — the fifth scroll of the gods' library
        this.hellfire = new Hellfire(this); // «Let the Hellfire Come»: a huge fire held and steered by the wand
        this.smokeSwipe = new SmokeSwipe(this); // a stroke of the wand (down, aslant) turns a wave of smoke aside: 3 mana, no words, from the start
        this.windRing = new WindRing(this);
        this.burning = new Burning(this); // a creature ON FIRE: burns for a while, put out by «Firefighting» up / water (Burning.js)
        this.firefighting = new Firefighting(this); // «Firefighting» / «… Maxima»: water from the hand puts fire out (the Hellfire too)
        this.falling = this.world.terrain ? new FallingBlocks(this.scene, this.world.terrain) : null;
        if (this.falling) { this.falling.onLand = (f) => this._fallLanded(f); this.falling.onStart = (f) => this._fallStarted(f); }
        // (the buildings round a change are looked at a little each frame, in the order of the changes — Structure.js)
        const tdata = this.world.terrain?.data;
        if (tdata) { tdata.settling = new Settling(); tdata.settling.onFalls = (falls) => this._collapsed(falls); }
        this.spiders = new Spiders(this); // the night boss: a giant spider
        this.dragons = new Dragons(this); // dragons: in their lairs high in the mountains, now and then flying over the world
        this.dragonRide = new DragonRide(this); // «Brain Rot Maxima»: the calmed dragon, riding it (DragonRide.js)
        this.imperius = new ImperiusControl(this); // «Империус» / «… Максима»: the mind in another body (ImperiusControl.js)
        this.fleet = new FleetOrders(this); // the king commands the crew of his own ship: guns, boarding, sails (FleetOrders.js)
        this.blackbeard = new Blackbeard(this); // Captain Black Moustache's black ship: one in the world, out on the open sea (Blackbeard.js)
        this.iceCastle = new IceCastleLife(this); // the one Ice Castle of the world: the Ice Queen, her snowmen and ice monsters, the Ice Rod (IceQueen.js)
        this.loreLibrary = new LoreLibrary(this); // the books of the world's history in the libraries (LoreBooks.js)
        this.temple = new Temple(this); // the abandoned Temple of the Gods (Venus — GodsTemple.js; Creative test on Earth: temple.placeTest())
        this.zombieSpawn = new ZombieSpawn(this); // zombies come out of the dark: caves, the night (ZombieSpawn.js)
        this.gargoyles = new Gargoyles(this); // the infernal gargoyles of the pentagram: not met anywhere else; 30 at a ritual (Gargoyles.js)
        this.flora = new MagicFloraLife(this); // wild magic plants: glowcaps, giant ferns, azure bushes, sun-herbs, frost crystal-trees (MagicFlora.js; worlds of BAKSADI_FROM_GEN and newer)
        this.plants = new Plants(this); // plant creatures: telewilpins (thorny red glowing flowers) and carnivorous heads (Plants.js)
        this.customPlants = new CustomPlants(this); // plants of one's own («Да пусть создастся дерево / цветок …»: CustomPlants.js)
        this.customCreatures = new CustomCreatures(this); // creatures of one's own («Да пусть создастся существо …»: CustomCreatures.js)
        this.canaries = new Canaries(this); // the swamp Canaries: small strong people who hurl boulders at trespassers (Canaries.js)
        this.spencers = new SpencerBirds(this); // the invisible bird of Spencer: pink and glowing, seen only by one who sees the invisible (SpencerBirds.js)
        this.ghosts = new Ghosts(this); // the ghosts of the Castle of Ghosts: scares for one who sees the invisible, each seer's own, never over the network (Ghosts.js)
        this.beslan = new BeslanGrass(this); // Beslan's grass: grows for one who sees the invisible (BeslanGrass.js)
        this.owls = new Owls(this); // clever owls: curious, fed with meat they love you and lead you to a boss once (Owls.js)
        this.phoenixes = new Phoenixes(this); // phoenixes: rare fire birds in the sky; they heal the wounded (Phoenixes.js)
        this.servants = new Servants(this); // «Брейнрот» servants of any kind: follow their master, fight for them
        this.livingTrees = new LivingTrees(this); // «Alive»: a tree comes alive and obeys its caster
        this.crossedShield = new CrossedShield(this); // «Protection» by crossing the arms before the chest (CrossedArms.js)
        this.focus = new Concentration(this); // the rule of concentration: one held spell at a time (Concentration.js)
        this.lightning = null; // my «Lightning Strike» in progress
        this.duel = new Duel(this); // duel magic: charges at creatures, duels
        this.handHold = new HandHold(this); // handshakes, holding and leading by the hand
        this.fire = new FireSystem(this); // burning trees
        {
            // every spell's fire (the Inferno stream, Hellfire's blaze and ring, a fire-breath) roasts the meat in it
            const F = this.fire, ig = F.ignite.bind(F), al = F.igniteAlong.bind(F);
            F.ignite = (p, r = 1.5) => { this.campfires?.roastIn((q) => q.distanceTo(p) <= r + 0.4); this.burnWreck?.igniteLoose(p, r); return ig(p, r); };
            F.igniteAlong = (o, d, len) => { this.campfires?.roastIn((q) => inStream(o, d, len, q, 0.5)); this._igniteLogsAlong(o, d, len); return al(o, d, len); };
        }
        this.fire.onCastleBurn = (x, L, z) => this._castleBurnt(x, L, z);
        this.fire.onBlockGone = (x, L, z, t) => this.burnWreck?.blockGone(x, L, z, t);
        // Adaptive graphics (resolution, shadows, view distance) for a steady frame rate
        this.quality = new QualityManager(this.renderer, config.graphics ?? 'auto');
        this.perf = config.mode === 'test' ? null : new PerfLog(this); // the performance diary (zns-perf.log)
        this.spellLog = new SpellLog({ send: config.mode !== 'test' }); // every phrase heard and what came of it (zns-spells.log)
        if (typeof window !== 'undefined' && window.__ZNS_FIXED_QUALITY__) this.quality.auto = false; // (tests: software rendering would keep stepping it down)
        this.quality.ultra = Ultra.wanted(config.ultra); // (decided before the first apply: the shadows' kind is fixed then)
        this.quality.apply(this.world);
        this.ultra = new Ultra(this); // «Ультра качество»: an addition, switched on the go (Ultra.js)
        this.ultra.set(this.quality.ultra);
        this.steam = new SteamBodies(this); // «Visible Godi»'s steam, mine and other heroes' (SteamFx.js)
        this.seeFx = new SeeThroughFx(this); // «Visible Godi»'s cloud: one shader made now, drawn only while the spell is on (SeeThroughFx.js)
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

        if (this.combat.enabled) { this.maxHP = this.combat.maxHp || PVP.MAX_HP; this.playerHP = this.maxHP; } else this.hud.hidePvp();
        this.hud.setMinimal?.(this.combat.enabled); // Свободный мир: only HP, fatigue and FPS on screen
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.hud.setHpVisible(config.mode !== 'creative' || this.combat.enabled); // (Creative with «Обычное здоровье»: the hearts show)
        this.hud.setMultiplayer(null);

        // The world is saved by itself on the host's (or single player's) computer
        if (!isTest && !config.map && this.authority) {
            const sv = config.saved;
            this.keeper = new WorldKeeper(this, sv ? { id: sv.id, name: sv.name, mode: sv.mode, seed: sv.seed, created: sv.created, players: sv.players, gen: sv.gen ?? 1, createdVersion: sv.createdVersion, fav: sv.fav } : { name: config.worldName });
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
                const n = config.mode === 'creative' ? 0 : 1; // (Творческий: its zombies come out of the dark — _spawnWaves)
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
                    { kind: 'scroll', uid: 'cr3', stat: 'spell', spell: 'ToTheSun' },
                    { kind: 'crystal', uid: 'cmc0', count: 1 }, // a mana crystal (take it in the hand and squeeze: +1 cell of mana)
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
                // a city merchant's stall to try buying and selling (CreativeMarket.js; the same place everywhere)
                const mdef = marketDef(this.collision.groundY(0, 13));
                buildMarketStall(this, mdef);
                this.castleLife.addSite(mdef);
                // a plain villager to talk to near the start: the quick talk, orders, the net (CreativeGuest.js)
                this.castleLife.addSite(guestDef(this.collision.groundY(-8, 6)));
                // a training dummy: a plain zombie that only stands (see _updateDummy)
                if (this.authority) this.dummyHome = { x: 0, z: -10 };
            }
        }
    }

    /**
     * Creative (the author's exception, for trying things — «Империус Максима», «Брейнрот Максима», fights): a dragon asleep
     * on its own peak of the test mountain left of the pedestals (Terrain.TEST_DRAGON_SPOT, away from the ice castle). A real dragon (it wakes, fights,
     * flies); gone — killed, flown off far, taken away — another lies there again a while later.
     */
    _updateTestDragon(dt) {
        const D = this.dragons;
        if (!D?.enabled || this.config.mode !== 'creative' || !this.world?.terrain?.data?.test) return; // (a world with the test ground: generation 3+)
        if (this.world.terrain.data.apart) return; // (generation 11: the dragon sleeps in its own lair, far from the Ice Queen — Terrain.SPAWN_MAPS_FROM_GEN)
        this._tdT = (this._tdT ?? 3) - dt;
        if (this._tdT > 0) return;
        this._tdT = 5;
        const at = TEST_DRAGON;
        const land = this.terrain?.data;
        if (land?.landMade && !land.landMade(at.x, at.z)) return; // (its mountain not made yet: wait for the workers)
        const d = D.list.find((q) => q.id === TEST_DRAGON.id);
        if (d && !d.dead && Math.hypot(d.model.position.x - at.x, d.model.position.z - at.z) < 260) { this._tdGone = 0; return; }
        if (d && !d.dead && (d.imp || d.tame)) return; // (a mind in it / it is ridden: it is where it is)
        this._tdGone = (this._tdGone || 0) + 5;
        if (d && !d.dead && this._tdGone < 60) return; // (flown off: a minute for it to come back by itself)
        if (d && d.dead && this._tdGone < 30) return; // (killed: another in half a minute)
        if (spotTaken(this, at.x, at.z, at.r, d)) return; // (somebody stands on its peak: no two creatures in one place — try again)
        if (d) D._remove?.(d);
        this._tdGone = 0;
        const y = this.collision.groundAt ? this.collision.groundAt(at.x, at.z, 1e4) : this.collision.groundY(at.x, at.z);
        const nd = D.spawn({ id: TEST_DRAGON.id, kind: KIND_IDS[Math.floor(Math.random() * KIND_IDS.length)], react: 1, flame: 1, pos: new THREE.Vector3(at.x, y, at.z), yaw: at.yaw, mode: 'sleep' });
        nd.restT = 999; // (asleep on its peak until somebody wakes it)
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
    /**
     * A zombie's step (crowd: round the others). Deep water: they don't walk into it after anyone;
     * thrown in, they don't breathe and don't float — they trudge along the bottom, slowly (CreatureSwim.js).
     */
    _zombieStep(me, p, ux, uz, d, speed, dt) {
        let st = crowdStep(this, me, p, ux, uz, d, { r: BODY_R.zombie * (me.sizeK || 1), speed, dt });
        if (!st) return st;
        st = this._zombieRound(me, p, st, dt);
        if (!st) return st;
        const t = this.terrain?.data;
        if (!t) return st;
        const feet = p.y - 1;
        if (deepAt(t, p.x, p.z, feet)) { const o = this._zStep || (this._zStep = { x: 0, z: 0 }); o.x = st.x * 0.45; o.z = st.z * 0.45; return o; }
        if (deepAt(t, p.x + st.x * 0.9, p.z + st.z * 0.9, feet)) return null; // (the bank: it stops at the water)
        return st;
    }

    /**
     * A wall, a rock, a pedestal, a chest in its way (not a body — the crowd sees those): it feels ahead and goes
     * round, keeping to the side it chose for a while (no dithering at a corner). A step of one block it climbs.
     */
    _zombieRound(z, p, st, dt) {
        const c = this.collision;
        if (!c?.pointBlocked) return st;
        const feet = p.y - z.gOff;
        const R = 0.5 * (z.sizeK || 1); // (its shoulders: the middle and both sides of the body feel ahead)
        const shut = (dx, dz) => {
            for (const k of [0.7, 1.3]) for (const w of [0, R, -R]) {
                const x = p.x + dx * k - dz * w, y = p.z + dz * k + dx * w;
                if (c.pointBlocked(x, feet + 1.3, y) || c.pointBlocked(x, feet + 2.3, y)) return true;
            }
            return false;
        };
        z._sideT = Math.max(0, (z._sideT || 0) - dt);
        if (!shut(st.x, st.z) && !(z._sideT > 0)) return st;
        const o = z._round || (z._round = { x: 0, z: 0 });
        const side = z._side || (Math.random() < 0.5 ? 1 : -1);
        for (const sg of [side, -side]) for (const a of [0.5, 0.9, 1.3, 1.7, 2.2]) { // (its side first, all the way round it)
            const ca = Math.cos(a * sg), sa = Math.sin(a * sg), dx = st.x * ca - st.z * sa, dz = st.x * sa + st.z * ca;
            if (shut(dx, dz)) continue;
            if (!(z._sideT > 0) || sg !== z._side) { z._side = sg; z._sideT = 1.2; }
            o.x = dx; o.z = dz;
            return o;
        }
        if (!shut(st.x, st.z)) { z._sideT = 0; return st; }
        z._side = -side; // (shut all round on this side: next time the other way)
        return null;
    }

    /**
     * (host) A zombie in deep water (thrown in, a bank gave way under it): it doesn't walk the bottom (the author:
     * «зомби ходит под водой» — no). The body comes up, the head over the water, the arms paddling, and it
     * makes for the nearest place it can get out (CreatureSwim.swimStep / findExit), slowly; it doesn't breathe,
     * so it never drowns. Out — it climbs on the bank and goes on. → true while it swims.
     */
    _zombieSwim(z, dt) {
        const t = this.terrain?.data;
        if (!t || z.isDead || z.isFrozen || z.lev) return false;
        const p = z.group.position;
        const b = this._zSwimB || (this._zSwimB = { x: 0, y: 0, z: 0, yaw: 0 });
        b.x = p.x; b.y = p.y - z.gOff; b.z = p.z; b.yaw = z.yaw;
        const sw = z._swim || (z._swim = {});
        const x0 = p.x, z0 = p.z;
        const r = swimStep(b, sw, ZOMBIE_SWIM, { t, legH: 0.9 }, dt);
        if (!r) { z.swimming = false; return false; }
        if (r.out) { p.set(r.out.x, r.out.y + z.gOff + 0.05, r.out.z); z.vy = 0; z.swimming = false; return true; } // (pulled out on the bank)
        z.swimming = true;
        p.x = b.x; p.z = b.z; p.y = b.y + z.gOff; z.vy = 0;
        const mx = p.x - x0, mz = p.z - z0;
        if (mx * mx + mz * mz > 1e-8) z.turnTo(Math.atan2(mx, mz), dt);
        // arms paddling in front, legs kicking
        const k = (sw.t || 0) * 5;
        z._setArm(z.leftArm, -Math.PI / 2 + Math.sin(k) * 0.35);
        z._setArm(z.rightArm, -Math.PI / 2 - Math.sin(k) * 0.35);
        z._setLegs(Math.sin(k * 0.8) * 0.3);
        splashes(this, p.x, b.y + ZOMBIE_SWIM.float, p.z, dt, false, sw);
        return true;
    }

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

    /**
     * A zombie's blow reached me: hurt (2 of the 20 HP of «Выживание»; 1 in «Хардкор» and the maps;
     * nothing in «Творческий») and shoved a little along the blow. (On a guest: the host's 'bite'.)
     */
    zombieHitsMe(dir) {
        if (this.isDeadLocal || this.combat?.dead) return;
        if (this.combat?.enabled) this.combat.damage(2, null, 'zombie');
        else this.damageLocalPlayer(1);
        if (dir && this.knockback && !this.flight?.active) { this.knockback.x += dir.x * 3; this.knockback.z += dir.z * 3; }
    }

    /** (host) By day in the sunlight a zombie smokes and burns: −1 health every 1.5 s, then ash. */
    _zombieSun(z, dt) {
        if (z.dummy || z.isThrall || this.config.map || z.isFrozen) { z.burning = 0; return; }
        z._sunT = (z._sunT || 0) - dt;
        if (z._sunT <= 0) { z._sunT = 0.5; z._inSun = inSunlight(this, z.group.position.x, z.group.position.y - z.gOff, z.group.position.z); }
        if (!z._inSun) { z._burnT = 0; return; }
        z.burning = 0.6;
        z._burnT = (z._burnT || 0) + dt;
        if (z._burnT < 1.5) return;
        z._burnT = 0;
        z.health -= 1;
        z.hitFlashTimer = 0.15; z._setColor(0xff5522);
        if (z.health <= 0) this.sandZombie(z); // (burnt down: a puff of ash)
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
        z.hunting = true; // (a blow: it turns on whoever is near — _zombieSenses)
        // my spells with a wand in the hand hit harder
        if (!isWeapon && by == null && this._lastSpell && performance.now() - this._lastSpell.at < 6000) amount *= this._lastSpell.pw;
        const res = z.takeDamage(amount, isWeapon, dir, Math.random, hit);
        if (this.sound) {
            if (res.shattered) { /* zombie plays the shatter sound */ } else this.sound.playHit();
        }
        if (this.sync) this.sync.zombieHit(z, res, by);
        if (res.died && (by === this.localId || by === 'local')) { this.killCount++; const zp = z.group?.position || z.position; if (zp) this.castleLife?.rel?.foeSlain(zp, this.localId); } // (the people saw it: they are grateful — Relations.js)
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
        if (z.isSailor) { this.ships.crew.hit(z, dmg, dir, this.localId, { magic: !!weapon?.magic, weapon: !!isWeapon, kind: isWeapon ? 'melee' : 'fist' }); return; }
        if (z.isDragon) { this.dragons.hit(z, dmg, isWeapon ? 'melee' : 'fist'); return; } // (its scales: a third of a blade's damage)
        if (z.isBoss) { this.spiders.hit(z, dmg, 'melee'); return; }
        if (z.isIce) { this.iceCastle.hit(z, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (the Ice Castle's creatures: IceQueen.iceDamage)
        if (z.isPhoenix) { this.phoenixes.hit(z, dmg, isWeapon ? 'melee' : 'punch', this.localId); return; }
        if (z.isGargoyle) { this.gargoyles.hit(z, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (stone: a blow hurts it, a fist less — GargoyleRules.TARGETS)
        if (z.isPlant) { this.plants.hit(z.plant, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (a telewilpin / a carnivorous head: a blade hurts, a fist hardly — PlantLife.plantDamage)
        if (z.isCustom) { this.customCreatures.hit(z, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (a creature of one's own: CustomCreatures.hit)
        if (z.isCanary) { this.canaries.hit(z, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (a canary: a blade hurts, a fist little — the camp turns on you: Canaries.hit)
        if (z.isSpencer) { this.spencers.hit(z, dmg, isWeapon ? 'melee' : 'punch', this.localId); return; } // (a blow kills the little bird — SpencerRules.verdict)
        if (z.isOwl) { this.owls.hit(z, dmg, isWeapon ? 'melee' : 'punch', this.localId); return; } // (quicker than a hand: it dodges — Owls.TARGETS)
        if (z.isLivingTree) { this.livingTrees.hit(z, dmg, isWeapon ? 'melee' : 'fist', this.localId); return; } // (a tree: only fire hurts it; a skeleton's bones break)
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

    /**
     * The building round a change gave way (Structure.js, worked out a little each frame by data.settling — the same
     * on every computer): its pieces are seen coming down round after round; the people near take fright and the
     * builders put it back later (Rebuild.js: «fall» — Danger.js).
     */
    _collapsed(falls) {
        let n = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0;
        for (const f of falls) {
            this.falling?.add(f);
            for (const [x, L, z] of f.cells) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; y += L - 1; }
        }
        if (!n) return;
        this.perf?.note(`обрушение: ${n} блоков, ${Math.max(...falls.map((f) => f.stage || 0))} волн`);
        if (this.authority) this.castleLife?.damaged(_v1.set((x0 + x1) / 2, y / n, (z0 + z1) / 2), null, n, true, { r: Math.max(x1 - x0, z1 - z0) / 2 + 4, kind: 'fall' });
    }

    /** A piece of a chain gives way (FallingBlocks: its round came): the stone groans and cracks, dust trickles from it. */
    _fallStarted(f) {
        const cells = f.cells;
        if (!cells.length) return;
        let sx = 0, sy = 0, sz = 0;
        for (const [x, L, z] of cells) { sx += x; sy += L - 1; sz += z; }
        const c = _v1.set(sx / cells.length, sy / cells.length, sz / cells.length);
        this.sound?.playGiveWay?.(c, cells.length);
        for (let i = 0; i < Math.min(24, cells.length); i++) {
            const [x, L, z] = cells[(i * 7919) % cells.length];
            this.fx.smoke?.spawn(x + (Math.random() - 0.5), L - 1.5, z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.4, -0.6 - Math.random(), (Math.random() - 0.5) * 0.4, 0xb8ad9a, 0.5 + Math.random() * 0.5, 1.2, { shrink: -0.6 });
        }
    }

    /**
     * A falling piece of a building hit the ground (or a block burst under its load): the blow and the hail of stones
     * heard, a cloud of dust rolls out low along the ground and rises, the broken blocks fly; whoever is under it —
     * the players, the people, the animals, the zombies, the sailors — is hurt and knocked off the feet (CreatureImpact).
     */
    _fallLanded(f) {
        if (!f.landed.length && !f.broken.length) return;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, sx = 0, sy = 0, sz = 0;
        const all = f.landed.length ? f.landed : f.broken.map(([x, L, z, t]) => [x, L - f.d, z, t]);
        for (const [x, L, z] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, L - 1.5); sx += x; sy += L - 1; sz += z; }
        const c = new THREE.Vector3(sx / all.length, sy / all.length, sz / all.length);
        const debris = f.broken.map(([x, L, z, t]) => ({ x, y: L - f.d - 1, z, color: BASE_COLORS[t] ?? 0x888888 }));
        for (let i = 0; i < Math.min(40, all.length); i++) { const [x, , z] = all[Math.floor(Math.random() * all.length)]; debris.push({ x, y: y0 + 0.2, z, color: 0x9a8f80, size: 0.6 }); }
        this.fx.debrisFrom(debris, new THREE.Vector3(c.x, y0 + 0.5, c.z), 160);
        // the dust: a low ring rolling out from under it, a cloud rising over it, fine grit falling back
        const size = f.cells.length, R = Math.max(x1 - x0, z1 - z0) / 2 + 1;
        const puffs = Math.min(70, 10 + size);
        for (let i = 0; i < puffs; i++) {
            const a = (i / puffs) * Math.PI * 2 + Math.random() * 0.4, out = 2.5 + Math.random() * 3 + Math.min(4, f.d * 0.25);
            this.fx.smoke?.spawn(c.x + Math.cos(a) * R * 0.7, y0 + 0.4 + Math.random() * 0.6, c.z + Math.sin(a) * R * 0.7, Math.cos(a) * out, 0.3 + Math.random() * 0.5, Math.sin(a) * out,
                [0xa89e8c, 0xc2b8a5, 0x8c8272][i % 3], 1.1 + Math.random() * 1.4, 2.2 + Math.random() * 1.6, { shrink: -0.9 });
            if (i % 2 === 0) this.fx.smoke?.spawn(c.x + (Math.random() - 0.5) * R, y0 + 1 + Math.random() * 2, c.z + (Math.random() - 0.5) * R, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8,
                0xb3a994, 1.4 + Math.random() * 1.6, 3 + Math.random() * 2, { shrink: -0.7 });
        }
        for (let i = 0; i < Math.min(60, size * 2); i++) this.fx.sand?.spawn(c.x + (Math.random() - 0.5) * R * 2, y0 + 1.5 + Math.random() * 3, c.z + (Math.random() - 0.5) * R * 2, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0x7d7465, 0.12 + Math.random() * 0.12, 1.5 + Math.random());
        this.sound?.playCollapse?.(c, size);
        this.fx.shake = Math.max(this.fx.shake, Math.min(0.8, size / 400 + f.d * 0.02) * Math.max(0, 1 - c.distanceTo(this.character.group.position) / 40));
        // whoever stood under it (a body is ~4.6 m tall)
        const dmg = Math.min(14, Math.round(2 + f.d * 1.2 + Math.min(6, size / 60)));
        const r = Math.max(x1 - x0, z1 - z0) / 2 + 0.6;
        const me = this.character.group.position;
        const under = (p, h = 4.6) => p.x > x0 - 0.6 && p.x < x1 + 0.6 && p.z > z0 - 0.6 && p.z < z1 + 0.6 && p.y > y0 - h - 1 && p.y < y0 + 1.5;
        if (under({ x: me.x, y: me.y - 1.95, z: me.z }) && !this.isDeadLocal) {
            if (this.combat?.blastProof?.()) this.hud?.setVoice?.('🛡️ Обломки отскочили от купола', true); // (a dome: what falls does not reach me)
            else {
                if (this.combat?.enabled) this.combat.damage(dmg, null, 'collapse'); else this.damageLocalPlayer?.(dmg);
                this.hud?.setVoice?.(`🧱 На вас обрушилось: −${dmg}`, true);
                // (knocked down and pushed out from under it)
                _v2.set(me.x - c.x, 0, me.z - c.z);
                if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0);
                this.knockback?.add?.(_v2.normalize().multiplyScalar(4 + Math.min(6, f.d * 0.5)));
            }
        }
        if (this.authority) {
            const at = new THREE.Vector3(c.x, y0 - 1, c.z);
            this.castleLife?.hitAt(at, r, dmg, null);
            this.animals?.hitAt?.(at, r, dmg, null);
            this.ships?.crew.hitAt?.(at, r, dmg, null, 'collapse');
            for (const z of this.zombies) if (!z.isDead && under({ x: z.group.position.x, y: z.group.position.y - 1.95, z: z.group.position.z })) this.damageZombie(z, dmg, true, _v2.set(z.group.position.x - c.x, 0, z.group.position.z - c.z).normalize(), null);
            // (the bodies under it are thrown down and out from under it — CreatureImpact, every kind of creature)
            this.creatureImpact?.spellArea?.('collapse', null, (p) => {
                if (!under({ x: p.x, y: p.y - 1, z: p.z }, 5)) return null;
                const v = _v3.set(p.x - c.x, 0, p.z - c.z);
                if (v.lengthSq() < 0.01) v.set(1, 0, 0);
                return v.normalize().multiplyScalar(5 + Math.min(6, f.d * 0.5));
            }, { down: 2 });
        }
        this.wreck?.afterBlast(c, r);
    }

    /** Visual + world part of an explosion (runs on every machine). */
    applyExplosion(pos, radius, authoritative, power = 1, casterId = null, keep = undefined) {
        // (the Gods' temple — CLAUDE.md «Дары богов»: the blast stops on its golden ward — seen and heard,
        //  nothing within its bounds breaks, nobody there flies or is hurt)
        if (this.temple?.wards(pos, radius)) { this.temple.wardHit(pos, radius); this.sound?.playExplosion?.(pos, this.character.group.position, Math.min(1, 0.4 * power)); return; }
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
        if (authoritative && power >= 1) this.livingTrees?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo'); // (a burst tears a living tree apart — not a cannonball)
        if (authoritative) { this.customCreatures?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.customPlants?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.animals?.hitAt(pos, radius, BLAST * power, casterId); this.spiders?.hitAt(pos, radius, BLAST * power, 'Bombardo', casterId); this.phoenixes?.hitAt(pos, radius, BLAST * power, 'Bombardo', casterId); this.owls?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.spencers?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.plants?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.canaries?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.flora?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo'); this.gargoyles?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.dragons?.hitAt(pos, radius, BLAST * power, 'Bombardo', casterId); this.dragons?.noise(pos, casterId); this.iceCastle?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); this.iceCastle?.attacked?.(pos, radius, casterId); this.castleLife?.hitAt(pos, radius, BLAST * power, casterId); this.ships?.blast(pos, radius, power, casterId); this.ships?.crew.hitAt(pos, radius, BLAST * power, casterId, power > 1 ? 'BombardoMaxima' : 'Bombardo'); this.carriages?.hitAt(pos, radius, 25 * power, casterId, 'blast'); this.crystals?.hitAt(pos, radius, casterId, power > 1 ? 'BombardoMaxima' : 'Bombardo'); }
        this.ghosts?.hitAt(pos, radius, BLAST * power, power > 1 ? 'BombardoMaxima' : 'Bombardo', casterId); // (a ghost of the Castle of Ghosts: local to every seer's computer, so not only the host — GhostRules)
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
        if ((casterId === 'local' || casterId === this.localId) && !meSafe && !this.combat.blastProof?.()) { // (under a dome: my own blast does not reach me)
            const self = Math.round(bombardoDamage(this.combat.center(_v2).distanceTo(pos), radius, power));
            if (self > 0 && (this.config.mode !== 'creative' || this.combat.enabled)) {
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
                const dmg = Math.max(2, Math.round(blastDamage(d, radius, power)));
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
            if (chest.isOpen || chest.locked || (!this.authority && !chest.localOnly)) continue; // (castle chests: locked while the king lives)
            const cp = chest.getPosition();
            for (let i = 0; i < (chest.localOnly ? 1 : players.length); i++) { // (a ghosts' chest: only my own hero opens it — the first of `players` is mine)
                const p = players[i];
                const dx = p.x - cp.x, dz = p.z - cp.z;
                if (dx * dx + dz * dz < (chest.ship ? 2.6 * 2.6 : 4.5 * 4.5 + 9)) { // (a ship's chest: only when you really stand by it — walking past the deck did «open» it and the crew cried «thief»)
                    this.openChest(chest, null, ids[i]);
                    break;
                }
            }
        }
    }

    /**
     * A chest's pouch of coins. The author: «в сундуках — от 5 до 300, рандомно» (the cave chests were 5–34, the pouches came
     * with 7 or 13): the cave chests hold 5…300; the houses — poor 5…50, rich 50…500; a king's castle — its part of the king's
     * fortune (500…1500 in all, CastleTreasure.js). The boss chests (dragon, Ice Queen, the captain), carts, ships — as they were.
     */
    _chestPouch(chest) {
        const plain = () => 5 + Math.floor(Math.random() * 296); // 5…300
        const share = chest.castle ? chestCoins(chest.castle, chest) : null; // (a king's castle: its chest's part of the king's fortune 500…1500 — CastleTreasure.js)
        const coins = share != null ? share : scaleCoins(chest.cart ? (chest.cart.magic ? 60 + Math.floor(Math.random() * 140) : 10 + Math.floor(Math.random() * 40)) : chest.house ? (chest.house.rich ? 50 + Math.floor(Math.random() * 451) : 5 + Math.floor(Math.random() * 46)) // (a rich house 50…500, a poor one 5…50)
            : chest.ship ? (chest.local?.room === 'captain' ? 60 + Math.floor(Math.random() * 120) : 10 + Math.floor(Math.random() * 40))
            : chest.room === 'dragon' ? 400 + Math.floor(Math.random() * 600)
            : chest.room === 'iceQueen' ? 250 + Math.floor(Math.random() * 350)
            : chest.castle ? 40 + Math.floor(Math.random() * (chest.room === 'treasury' || chest.room === 'vault' ? 260 : chest.room === 'study' ? 200 : 120)) : plain());
        return coins > 0 ? [{ kind: 'coins', uid: newUid(), count: coins }] : [];
    }

    /**
     * (host) A chest that was never opened burnt down (BurnWreck.js): its things are rolled as on
     * opening; what burns is gone, the rest (coins, steel, magic things…) lies in the ashes.
     */
    /** (host) The logs lying in a stream of fire catch fire (BurnWreck.igniteLoose). */
    _igniteLogsAlong(o, d, len) {
        if (!this.authority || !this.items?.loose?.size || !this.burnWreck) return;
        for (const L of this.items.loose.values()) if (!L.hover && L.item.kind === 'logs' && inStream(o, d, len, L.model.position, 0.6)) this.burnWreck.igniteLoose(L.model.position, 0.2);
    }

    spillBurntChest(chest, rp, burn = true) { // (burn false: «Liquidation Максима» crumbled it — nothing burns, all falls out)
        if (chest.store) { if (this.authority) (chest.store.divine ? this.divine : chest.store.castle ? this.castleMagic : this.houseMagic)?.chestBurnt(chest, rp); return; } // (a magic house's chest: what was put in it)
        if (!this.authority || chest.itemType !== 'loot' || chest.ship) return;
        const testing = this.config.mode === 'creative' && /^(cvtest|creative-test)/.test(String(chest.id));
        const L0 = new Set(this.items.loose.keys()), W0 = new Set(this.weapons.weapons);
        this.items.lootChest(rp, Math.random, chest.house || null, chest.room === 'port' ? 'port' : null, { chest, extra: this._chestPouch(chest), key: testing ? 1 : undefined });
        for (const [uid, L] of [...this.items.loose]) {
            if (L0.has(uid)) continue;
            if (burn && burnsInFire(L.item)) { this.items.removeLoose(uid); this.sync?.itemGone?.(uid, null, null); continue; }
            L.hover = null; L.rise = null; // (it falls into the ashes)
            L.model.position.y = rp.y + 0.2;
            L.vel.set((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2);
        }
        for (const w of this.weapons.weapons) if (!W0.has(w) && w.hover) { w.hover = null; w.position.y = rp.y + 0.3; w.wake?.(); }
    }

    /**
     * «Свиток, который вы уже знаете, больше не выпадет» (SpellBook.scrollKnown): the test for the one who opens a chest / stocks a shop — me
     * (`by` null: what I burnt and learnt) or a friend (the keys his computer told me: RemoteAvatar.known). null: nothing is excluded (Creative, a stranger).
     */
    knownScrollFn(by = null) {
        if (this.config?.mode === 'creative' || this.config?.mode === 'test') return null; // (Creative knows everything: the scrolls stay as they were)
        let keys;
        if (by && by !== this.localId) keys = this.remotes?.get(by)?.known || null;
        else keys = this.myScrollKeys();
        return keys ? (it) => scrollKnown(it, keys) : null;
    }

    /** The keys of the scrolls I know (also told to the others, NetSync). */
    myScrollKeys() {
        return knownScrollKeys({ spells: this.bonus?.spells, learned: this.books?.learned, pent: this.pentagranium?.seen?.set });
    }

    openChest(chest, rewardId = null, by = null) {
        if (!chest.open()) return;
        if (this.sound) this.sound.playChestOpen(chest.getPosition());
        // a magic house's chest: what was put into it rises out of it (HouseMagic.js)
        if (chest.store) { if (this.authority) { (chest.store.divine ? this.divine : chest.store.castle ? this.castleMagic : this.houseMagic).chestOpened(chest); this.sync?.chestOpenedLoot?.(chest); } return; }
        const id = rewardId || `c${chest.id}`;
        if (chest.itemType === 'loot') {
            // a cave chest: wands, scrolls, shields… float up out of it
            if (this.authority || chest.localOnly) {
                chest.mesh.updateMatrixWorld(true);
                const rp = chest.getRewardPosition(new THREE.Vector3());
                // (who opens it: his mana maximum — «Inspirius»' scroll is only for 500+)
                const opener = by && by !== this.localId ? this.remotes.get(by) : null;
                LOOT_FOR.maxMana = opener ? (opener.maxMana || 0) : (this.combat?.maxFatigue || 0);
                LOOT_FOR.known = this.knownScrollFn(opener ? by : null); // (a scroll the opener already knows is not in the chest: rolled now, for him)
                const pouch = this._chestPouch(chest);
                if (!chest.ship) pouch.push(...(this.houseMagic?.scrollFor(by) || [])); // (the first «Create a House» scroll of each player is easy to find)
                if (chest.ship) {
                    chest._openedBy = by; this.ships.lootChest(chest, rp, Math.max(1, 3 - pouch.length)); // (a ship's chest: often a fishing rod)
                    for (const it of pouch) this.items.spawnLoose(it, rp.clone().add(new THREE.Vector3(0, 1.1, 0)), { hover: true, rise: true }); // (within the hand's reach)
                } else {
                    // (Creative: the test cave's chests and the test chest by the pedestals always hold a precious thing — to try things out)
                    const testing = this.config.mode === 'creative' && /^(cvtest|creative-test)/.test(String(chest.id));
                    this.items.lootChest(rp, Math.random, chest.house || null, chest.room === 'port' ? 'port' : null, { chest, extra: pouch, key: testing ? 1 : undefined });
                } // (a port chest: the sailors' stores; all in one row along the chest, within reach)
                // (a house chest opening is no theft by itself: taking a thing out of it is — Items.pickUp)
                LOOT_FOR.maxMana = 0; LOOT_FOR.known = null;
                if (this.sync && !chest.localOnly) this.sync.chestOpenedLoot?.(chest);
            }
            return;
        }
        if (this.authority) {
            chest.mesh.updateMatrixWorld(true);
            const pos = chest.getRewardPosition(new THREE.Vector3());
            pos.y += 2.2;
            if (this.inventory?.hasWeaponId(id) || this.weapons.byId.has(id)) return; // (its weapon is already taken — in a cell or lying about)
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
            this._caveSys = false; // (a cave system round the hero: the cave map may be wanted — _updateCaveMap)
            let built = false;
            for (const cv of t.cavesNear(p.x, p.z, 90, true).concat(t.lairsNear ? t.lairsNear(p.x, p.z, 90, true) : [], t.densNear ? t.densNear(p.x, p.z, 90) : [], t.dungeonsNear ? t.dungeonsNear(p.x, p.z, 90, true) : [])) {
                if (cv.x0 != null ? ((cv.kind !== 'dungeon' && cv.kind !== 'ghostcastle') || cv.under) && p.x > cv.x0 - 8 && p.x < cv.x1 + 8 && p.z > cv.z0 - 8 && p.z < cv.z1 + 8 : Math.hypot(cv.kx - p.x, cv.kz - p.z) < cv.r + 30) this._caveSys = true;
                if (this._caveChests.has(cv.id)) continue;
                // (a cave system: a chest in each of its chambers that has one; an old cave: one in its chamber)
                const spots = cv.chests || [{ x: cv.kx + 0.5, y: cv.F, z: cv.kz + 0.5, a: Math.atan2(cv.ex - cv.kx, cv.ez - cv.kz) }];
                // (its chambers' land must be made already: fitting a chest reads the blocks round it — not made here in a frame)
                if (t.landMade && !spots.every((sp) => t.landMade(sp.x - 4, sp.z - 4) && t.landMade(sp.x + 4, sp.z + 4) && t.landMade(sp.x - 4, sp.z + 4) && t.landMade(sp.x + 4, sp.z - 4))) continue;
                if (built) { this._caveT = 0.1; continue; } // (one cave's chests a frame: the next one at the next look)
                built = true;
                this._caveChests.add(cv.id);
                spots.forEach((sp0, k) => {
                    const sp = cv.segs && t.chestSpot ? t.chestSpot(sp0) : sp0; // (never stuck in the rock)
                    if (!sp) return;
                    const id = k ? cv.id + ':' + k : cv.id;
                    const chest = new Chest(this.scene, new THREE.Vector3(sp.x, sp.y, sp.z), 'loot', sp.a, id, { style: sp0.look || (sp0.boss ? 'rich' : 'plain') });
                    if (sp0.boss) chest.room = sp0.boss; // (a dragon's chest: the hoard's treasure — Items.lootChest)
                    if (cv.kind === 'ghostcastle') chest.localOnly = true; // (the Castle of Ghosts exists only in a seer's land: each seer opens his own chest, for himself — GhostCastleLife.js)
                    if (sp0.flavor) { chest.dungeonFlavor = sp0.flavor; chest.dungeonSize = cv.size; } // (a ruin's chest: magical or plain things — ItemTypes.rollDungeonLoot)
                    chest.mesh.updateMatrixWorld(true);
                    chest.boxId = this.collision.addBox(chest.getCollisionBox());
                    chest.cave = cv.id; // (put away again when the player is far — _unloadCaves)
                    this.chests.push(chest);
                    if (this._openedChests?.has(id)) chest.setOpenInstant();
                    // (one zombie by a chest every other chamber — only in the real dark of the cave, never a group, never
                    // a lit chamber by day; it wanders by its chest, not asleep standing — _zombieTarget)
                    if (this.authority && this.config.mode === 'freeworld' && !cv.lair && (cv.r + k) % 2 === 0 && t.skyAt &&
                        lightLevel(t.skyAt(sp.x, sp.y, sp.z), this.zombieSpawn?.night() ?? 0) <= ZSPAWN.DARK &&
                        !this.zombies.some((o) => !o.isDead && Math.hypot(o.group.position.x - sp.x, o.group.position.z - sp.z) < ZSPAWN.APART)) {
                        const z = this._createZombie(new THREE.Vector3(sp.x + 2.5, sp.y - 0.5, sp.z));
                        z.caveGuard = cv.id; // (by its chest: put away with it)
                    }
                });
            }
        }
        if (this._caveChests?.size && (this._caveUnloadT = (this._caveUnloadT || 0) - dt) <= 0) { this._caveUnloadT = 5; this._unloadCaves(p); }
        // darkness: rock above the head
        const head = Math.floor(p.y + 2.4 + 1.5);
        // rock above the head here and around (so the light doesn't flicker at the edges)
        let n = 0;
        for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (t.solidIn(Math.round(p.x) + dx, Math.round(p.z) + dz, head, head + 14)) n++;
        const covered = n >= 3 ? 1 : 0;
        // under the roof of a castle or a village house: lit rooms (lanterns, windows), not a dark cave
        // (castles and wizards' towers; the houses made by magic — HouseMagic._hookLight)
        // (a hall made by magic may be very high — «Create a Castle»'s throne hall: its roof ~30 m up)
        const magicRoom = !!t.litLand?.(Math.round(p.x), Math.round(p.z)) && (covered || t.solidIn(Math.round(p.x), Math.round(p.z), head, head + 40));
        // (held a moment after the last frame it was true: a jump to the ceiling, a step over a doorway, an edge of the roof
        // must not switch the room's light off and on)
        this._builtT = magicRoom || (covered && !!(t.sites || t.castles)?.landAt(Math.round(p.x), Math.round(p.z))) ? 0.4 : Math.max(0, (this._builtT || 0) - dt);
        const built = this._builtT > 0;
        // in a cave: as dark as the daylight reaching the head (the mouth lit, deeper in dark — the
        // same light as the rock round it, Terrain._skyLight); elsewhere under a roof: dark
        const sky = t.skyAt ? t.skyAt(p.x, p.y + 1.2, p.z) : 1;
        const dark = sky < 1 ? 1 - sky : covered && !built ? 1 : 0;
        this._caveK = (this._caveK || 0) + (dark - (this._caveK || 0)) * Math.min(1, dt * 1.5);
        this._indoorK = (this._indoorK || 0) + ((built ? 1 : 0) - (this._indoorK || 0)) * Math.min(1, dt * 1.5);
        this.world.setCave?.(this._caveK);
        this.world.setIndoor?.(this._indoorK);
        this._updateCaveMap(dt, p, !built && !!this._caveSys && (covered || sky < 0.9));
    }

    /**
     * The cave map (CaveMap.js): in a cave the minimap shows what the hero has seen of it; the eyes
     * open the cave round them a few rays a frame; where they went in / came out is remembered.
     */
    _updateCaveMap(dt, p, cave) {
        if (!this.caveMap || this.space?.offEarth) { this._inCave = false; return; }
        // (in after a moment, out after a second: never flickering at the mouth)
        this._caveHold = cave ? Math.min(0.3, (this._caveHold || 0) + dt) : Math.max(-1, Math.min(0, this._caveHold || 0) - dt);
        const was = !!this._inCave;
        if (!was && this._caveHold >= 0.3 && !this.flight?.active) this._inCave = true;
        else if (was && this._caveHold <= -1) this._inCave = false;
        if (this._inCave !== was && this._caveOut) this.caveMap.addWay(this._caveOut.x, this._caveOut.z); // (the way in: the last place outside)
        if (!cave) (this._caveOut || (this._caveOut = { x: 0, z: 0 })).x = p.x, this._caveOut.z = p.z;
        if (this._inCave && this.playerHP > 0) {
            this.caveEyes.step(this.terrain.data, p.x, p.y, p.z);
            if (!this.flight?.active) this.caveMap.walk(p.x, p.z); // (the trail on the cave map: where I walked)
        }
    }

    /**
     * The caves' chests (and their sleeping guards) far behind every player are put away — as the houses'
     * chests are: a long flight over the world otherwise left every cave's chest in the scene, each looked
     * at every frame. An opened one stays opened (_openedChests); come back and it is put there again.
     */
    _unloadCaves(p) {
        const FAR = 260;
        const players = this._playerPositions();
        const far = (x, z) => players.every((q) => Math.abs(q.x - x) > FAR || Math.abs(q.z - z) > FAR);
        const gone = new Set();
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const c = this.chests[i];
            if (c.cave == null || c.animating) continue;
            const cp = c.mesh.position;
            if (!far(cp.x, cp.z)) { gone.delete(c.cave); continue; }
            if (c.isOpen) (this._openedChests = this._openedChests || new Set()).add(c.id);
            if (c.boxId != null) this.collision.removeBox(c.boxId);
            c.dispose();
            this.chests.splice(i, 1);
            gone.add(c.cave);
        }
        if (!gone.size) return;
        for (const id of gone) this._caveChests.delete(id);
        if (this.authority) for (const z of [...this.zombies]) if (z.caveGuard != null && gone.has(z.caveGuard) && !z.hunting && !z.isDead) this.removeZombie(z);
    }

    // ============================================================== players
    /** Does this computer run the Earth's life for other players while my hero is off it (the host)? */
    _earthNeeded() {
        if (!this.net?.active || !this.authority) return false;
        for (const r of this.remotes.values()) if (!r.dead && r.position.y < 30000 && r.position.x < 240000) return true;
        return false;
    }

    _playerPositions() {
        const list = this.space?.offEarth ? [] : [this.character.group.position]; // (off the Earth: not here for its creatures)
        for (const r of this.remotes.values()) list.push(r.position);
        return list;
    }

    /** Nearest player position to a point (zombie AI target). Returns {pos, id}. */
    nearestPlayer(p) {
        // (an invisible player: where they were last noticed, for a few seconds — Invisibility.aiPos)
        const seen = (id, pos) => (this.invis ? this.invis.aiPos(id, pos) : pos);
        let best = seen(this.localId, this.character.group.position), bestId = this.localId, bestD = best ? p.distanceToSquared(best) : Infinity;
        if (this.isDeadLocal || this.space?.offEarth) { best = null; bestD = Infinity; }
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

    /**
     * Where a one-shot spell («Бомбардо», a ray, the wind…) leaves `side`: castOrigin — pulled back
     * along the arm when the wand's tip is already in somebody standing close, or in a wall (Duel.armStart).
     */
    spellStart(side, out = new THREE.Vector3()) {
        this.castOrigin(side, out);
        return this.duel ? this.duel.myStart(side, out) : out;
    }

    handPose(casterId, side) {
        if (casterId === 'local' || casterId === this.localId) {
            return { origin: this.castOrigin(side), dir: this.character.getHandDirection(side) };
        }
        const r = this.remotes.get(casterId);
        return r ? r.handPose(side) : null;
    }

    damageLocalPlayer(amount, kind = null) {
        if (!this.isDeadLocal && amount > 0) this.imperius?.interruptByDamage?.(amount, kind); // («Империус»: harm to the body — the mind back at once; in Creative too, where nobody is hurt)
        if (this.isDeadLocal || this.config.mode === 'creative') return;
        const mon = this.monster?.active ? this.monster : null; // (the monster form: MonsterForm.spellOnMonster)
        if (mon) { amount = mon.filterDamage(amount, kind, null); if (!(amount > 0)) return; }
        this.playerHP -= amount;
        if (mon && this.playerHP <= 0) { mon.fell(null, kind); return; }
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
        // (a phrase still being said waits only for a longer spell the hero knows — «Бомбардо» with no «Бомбардо
        // Максима» learnt yet has nothing to wait for: it is as good as said; Creative knows them all)
        if (!isFinal) { const sp = matchSpell(text), longer = sp && LONGER_OF.get(sp); if (longer && ![...longer].some((l) => this.knowsSpell(l))) isFinal = true; }
        const paid = this.combat.paidCount || 0;
        this._manaLater = false;
        this.lastCastWhy = null; // (why it did not work — the spell journal: set where a spell is refused)
        const name = this._castWithHints(text, isFinal);
        if (name) { this._castAt = performance.now(); this._castName = name; } // (the wand never leaves the hand while a spell is going: spellBusy; a thrown Lumos waits after another spell's gesture: WandMagic)
        // its sound (SpellMusic.SPELL_SOUND: a tune for the great ones, a short effect for the others) — the others hear it too
        if (name && this.sound?.spellHasCastSound?.(name)) {
            const at = _castSnd.copy(this.character.group.position);
            at.y += 1.4;
            this.sound.spellCast(name, at);
            this.sync?.castSound?.(name, at);
        }
        // (how late after the word was said the spell came — the journal, zns-perf.log: «голос»)
        const vm = this._voiceMeta;
        if (name && vm && Number.isFinite(vm.to)) {
            const lag = performance.now() - vm.to;
            if (lag >= 0 && lag < 6000) { const v = this.stats.voice || (this.stats.voice = { n: 0, sum: 0, max: 0, final: 0 }); v.n++; v.sum += lag; v.max = Math.max(v.max, lag); if (isFinal && !vm.settled) v.final++; }
            this._voiceMeta = null;
        }
        // another spell from the wand that holds my «Protection»: it knocks the shield down (Combat.castFrom) — except Lumos: a light on the wand tip is no spell in the way
        if (name && !/^Protection(Gods)?(Maxima)?$/.test(name) && !/^Lumos/.test(name) && !NOT_SPELLS.has(name) && name !== 'Maxima') this.combat.castFrom(this.wandSide());
        if (name && name !== 'Invisibility' && name !== 'Stand' && name !== 'VisibleGodi') this.invis?.noted(this.localId); // (a spell gives an invisible caster away: about where)
        // mana: a spell paid for that always works counts at once; the others report it themselves when they work
        if (name && (this.combat.paidCount || 0) > paid && !this._manaLater && !MANA_LATER.has(name)) this.mana?.success(name);
        return name;
    }

    /**
     * The hands and the game at this moment, for the spell journal when a spell was refused (SpellLog.castContextLine).
     */
    castContext() {
        const ch = this.character, ps = this.poseSmoother, now = performance.now();
        const lift = this.currentPose?.armLift;
        const raised = ch ? ['left', 'right'].filter((s) => { try { return ch.isArmRaised(s); } catch (e) { return false; } }) : [];
        const aim = this.campfires?.lastAim;
        return {
            lift: lift ? { left: lift.left, right: lift.right } : null,
            raised: raised.map((s) => (s === 'left' ? 'левая' : 'правая')),
            magic: !!this.isMagicActive,
            hand: this.magicHand ? (this.magicHand === 'left' ? 'левая' : 'правая') : null,
            poseAge: ps?.lastPushAt ? now - ps.lastPushAt : null,
            poseGap: ps?.lastPushAt ? ps.interval : null,
            fps: this.fpsNow ?? null,
            frameMs: this.stats?.frameMs ?? null,
            aim: aim && now - aim.at < 4000 ? { ...aim, age: now - aim.at } : null,
            mana: manaRules(this) ? this.combat.fatigue : null,
            held: this.focus?.held?.() || null,
        };
    }

    /**
     * The spell's advice («поднимите руку…», «скажите «…»») reaches the screen only when the player was
     * really casting (CastHints): talk where a spell's word slipped in gives none — that goes to the journal.
     * The advice is held back while the phrase is worked out; a spell that went off shows its own lines.
     */
    _castWithHints(text, isFinal) {
        const name = this._castWithHints0(text, isFinal);
        if (name) try { this.castleLife?.rel?.sawCast(name); } catch (e) { console.warn('[Relations]', e); } // (who sees a spell knows what the hero can do)
        return name;
    }

    _castWithHints0(text, isFinal) {
        const hud = this.hud;
        if (!hud || hud.hintFilter) return this._castLocalSpell(text, isFinal);
        const held = [];
        hud.hintFilter = (html) => { held.push(html); return false; };
        let name = null;
        try { name = this._castLocalSpell(text, isFinal); } finally { hud.hintFilter = null; }
        if (!held.length) return name;
        const html = held[held.length - 1];
        if (!name && !this.lastCastWhy) this.lastCastWhy = String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const ch = this.character;
        const now = Date.now();
        const intent = !!(this.isMagicActive || now - (this.lastMagicTime || 0) < 2500 || now - (this._armsUpAt || 0) < 2500 || ch?.isTPose?.() || ch?.isArmsSpread?.());
        const talking = !intent && !!this.castleLife?.talk?._listener?.();
        const hints = this._castHints || (this._castHints = new CastHints());
        if (name) { hud.setVoice(html, true); return name; } // (the spell went off: its own line about it)
        const v = hints.phrase({ text, name: matchSpell(text), isFinal, intent, talking });
        if (v.ok && hints.pass(html)) hud.setVoice(html, true);
        else if (!v.ok && isFinal) netLog(`🎙️ подсказка не показана (${v.why}): «${String(text).slice(0, 60)}» → ${String(html).replace(/<[^>]+>/g, '')}`);
        return name;
    }

    /**
     * While I speak (or raise the hand to cast), the game's own voices (villagers, the Ice Queen, sailors…) go quiet: the microphone
     * must hear my spell, not her «Твоя магия здесь бессильна!» over it. «I speak»: my voice in the
     * microphone with the speakers' sound taken out (native), or my lips moving (the camera) — never the
     * plain microphone level, which the speakers themselves would raise.
     */
    _duckVoices() {
        const sp = this.castleLife?.talk?.speech;
        if (!sp?.duck) return;
        const now = performance.now();
        if (now - (this._duckCheckAt || 0) < 100) return;
        this._duckCheckAt = now;
        if (this.voiceGate.lipsMoved(now, 700) === true) { this._speakingAt = now; this._voicedAt = now; }
        // (and while the hand is raised for magic: a spell is about to be said — at the wizards' tower the
        // villagers' and the wizards' voices filled the quiet after my word, and the spell came 2–3 s late)
        if (this.isMagicActive) this._speakingAt = now;
        const at = Math.max(this._speakingAt || -1e9, this.voice?.speakingAt || -1e9);
        // (a villager answers my words — said after I stopped: no quiet for it; I speak again — quiet again)
        // (my voice heard by the cleaned microphone tells the moment I stopped; the lips' window only tells «lately»)
        const spoke = this.voice?.aec ? this.voice.speakingAt || -1e9 : at - 700;
        const answering = (this.castleLife?.talk?.replyAt || -1e9) > spoke;
        // (his answer is playing: a little of his own voice gets past the echo canceller and «I speak» flickered —
        // he went quieter and louder by turns. While he answers only my mouth really moving with a loud voice stops him)
        // (a villager's ANSWER to me is never made quiet by a raised hand — the author: «голоса жителей до сотки, но я их плохо слышу»:
        // the hands are up much of the time, and every answer played at 18 %, swelling and falling as the arms moved. Only my real
        // voice — the mouth moving with a loud sound — stops him)
        if (sp._current?.opts?.reply) {
            const barge = this.voiceGate.lipsMoved(now, 500) === true && now - (this.voice?.speakingAt || -1e9) < 300;
            if (!barge) { sp.duck(false); return; }
            this._speakingAt = now; this._voicedAt = now;
        }
        // (the other voices, with only a hand raised and nobody speaking: half quiet, not nearly silent)
        const voicedAt = Math.max(this._voicedAt || -1e9, this.voice?.speakingAt || -1e9);
        const handOnly = now - voicedAt >= 900;
        sp.duck(now - at < 900 && !(answering && !this.isMagicActive), handOnly ? 0.55 : undefined);
        if (sp._ducked) this._duckedAt = now;
    }

    /** Were the game's voices quiet (ducked) at page time t? Then a spell heard then is mine, not theirs. */
    voicesDucked(t) {
        return Number.isFinite(this._duckedAt) && this._duckedAt >= t - 300;
    }

    /** The hand holding a wand (null: none). While a wand is held, every spell is cast with that hand. */
    wandSide() {
        if (this.monster?.hidesWand) return null; // (the monster form: no wand in the hand — MonsterForm.js)
        return this.items?.heldOf?.('wand')?.side || null;
    }

    /** A spell of mine is going (or was just cast): the wand stays in the hand whatever the hand does. */
    spellBusy() {
        if (performance.now() - (this._castAt || -1e9) < 4000) return true;
        // (Lumos lit, or just thrown by a flick: that flick throws the light, never the wand)
        if (this.wandMagic?.light || performance.now() - (this.wandMagic?._thrownAt || -1e9) < 1500) return true;
        return !!(this.wards?.setting || this.wards?.feeding || this.planetMagic?.busy || this.hellfire?.busy || this.waterStorm?.busy || this.vortex?.busy || this.water?.active || this.levitation?.active || this.levMax?.active || this.accio?.active || this.waves?.busy || this.lightning || this.wandMagic?.drawing);
    }

    /** «Вы ещё не знаете …» — where it is learned (a scroll and its ribbon, a book-bird's book, the mana). */
    _unknownHint(name) {
        const key = teachKey(name), ru = SPELL_RU[name] || SPELL_RU[key] || name, sru = SPELL_RU[key] || ru, ribbon = SCROLL_RIBBON_RU[key];
        const how = howLearned(name);
        if (how === 'mana') return `✨ «${ru}» откроется, когда у вас будет 1000 ячеек маны`;
        if (name === 'Flight') return '📘 Вы ещё не знаете «Флайн» — сожгите <b>быструю летающую книгу</b> (голубую, с серебром)';
        if (how === 'book') return `📖 Вы ещё не знаете «${ru}» — найдите его в книге птицы-книги`;
        return `📜 Вы ещё не знаете «${ru}» — найдите <b>свиток «${sru}»</b>${ribbon ? ` (${ribbon} лента)` : ''} и сожгите его «Инферно»`;
    }

    _castLocalSpell(text, isFinal = true) {
        if (!this.active) return null;
        // («у-у-у» in a dragon of «Империус Максима»: its fire — not a spell, not talk: DragonHowl)
        if (this.imperius?.heardPhrase(text)) return null;
        // («Назови …» right after «Create a Planet»: the new planet's name — not a spell, PlanetMagic.tryName)
        if (this.planetMagic?._naming && this.planetMagic.tryName(text, isFinal)) return null;
        // (the phrase after a lone «Да пусть создастся»: what the gods are to make — DivineCreation.hearDesc)
        if (this.divine?.listening && !matchSpell(text)) { const heard = this.divine.hearDesc(text, isFinal); if (heard) return heard === true ? null : heard; }
        let name = matchSpell(text);
        // «Айс Максима» with water in the hands: the water's «Frozen» (one spell, both words — StrongSpells.js)
        if (name === 'IceMaxima' && (this.water?.active || this.vortex?.state)) name = 'Frozen';
        // «Дай» only when the phrase is over: never from an unfinished one (an everyday word — StrongSpells.dieWords)
        if (name === 'Die' && !isFinal) return null;
        // the vortex waits for «Bubble»: a word that sounds like it is it (the recognizer writes it many ways)
        if (this.vortex?.bubbleOpen?.() && name !== 'AirBubble' && (!name || name === 'Sands' || name === 'Sapira') && bubbleLike(text)) name = 'AirBubble';
        if (!name && isFinal && this.vortex?.bubbleOpen?.()) this.hud.setVoice(`🫧 Слышу «${String(text).slice(0, 40)}» — для шара скажите «Bubble» или «Пузырь»`, true);
        if (!name) return null;
        if (this.combat.dead) { this.lastCastWhy = 'вы мертвы'; return null; }
        // the monster form: no wand, no spells — only «стоп» to stop what is mine (MonsterForm.MONSTER_BLOCKS)
        if (this.monster?.active && !(name === 'Stand' && /стоп|stop/i.test(text))) {
            if (isFinal) this.hud.setVoice('🐺 В облике монстра колдовать нельзя — палочки нет', true);
            this.lastCastWhy = 'в облике монстра колдовать нельзя';
            return null;
        }
        // «стоп» takes off any «Protection» of mine first — either hand, plain or the gods', the dome — whatever else it meets below
        if (name === 'Stand' && /стоп|stop/i.test(text) && this.combat.shield) { this.combat.dropShield('🛑 Стоп — щит снят'); this.sync?.stopSpells?.(); }
        // «Shield» / «Щит» with a swarm of things up: the things close into a wall (ItemSwarm.shield) — not the hand shield
        if ((name === 'Protection' || name === 'GroundShield') && this.levMax?.swarm?.active) { const r = this.levMax.swarm.shield(isFinal); if (r !== undefined) return r; }
        if (!this.knowsSpell(name)) {
            if (isWardSpell(name)) { if (isFinal) this._why('wardUnknown', name); return null; }
            if (isFinal) this.hud.setVoice(this._unknownHint(name), true); // (no mana spent)
            this.lastCastWhy = 'это заклинание вы ещё не знаете';
            return null;
        }
        // «Protection…», «Бомбардо…» with nothing after them yet: «… Хаус», «… Максима» may still come
        // (NativeVoice: more) — the voice tells again once it can't; only a duel answer under fire can't wait
        if (!isFinal && this._voiceMeta?.more && !DUEL_FAST.has(name)) { this.lastCastWhy = 'ждём, не будет ли продолжения («… Хаус», «… Максима»)'; return null; }
        // the rule of concentration: while a spell is held no other works — first «стоп» (Concentration.js;
        // the held spell's own words, Lumos, Nox, «стоп», the shield are free; Creative too)
        if (this.focus.gate(name, isFinal, !!BUILD_SPELLS[name])) return null;
        // no wand in the hand: only «Акцио» and «Protection» (BareHand.js) — until the white pentagram «Pentagranium Palmaris» is done; Creative is free
        if (!bareGate(name, { hasWand: !!this.wandSide(), creative: this.config.mode === 'creative' || this.config.mode === 'test', bareMaster: !!this.pentagranium?.bare }).ok) {
            this.lastCastWhy = BARE_HINT;
            if (isFinal && !this._bareHinted) { this._bareHinted = true; this.hud.setVoice(BARE_HINT, true, true); } // (large, once a session)
            return null;
        }
        // «Water Vortex», its «Bubble» / «Frozen», «Fire Maxima» (and nothing else from inside its ice)
        const gvx = this.groundVortex.voice(name, text, isFinal);
        if (gvx !== undefined) return gvx;
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
            if (this.wards?.setting || this.wards?.feeding) { this.wards.fix(); return 'Stand'; } // («стоп»: my house's dome stays as big as it grew)
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
        // multiplayer without «Божественные заклинания на Земле»: on the Earth the gods forbid their spells
        if (this._godsBanned(name)) { if (isFinal) this.hud.setVoice('⚡ Боги наложили запрет на использование божественных заклинаний на Земле', true); return null; }
        // «Flying Maxima»: out of the air, into space (Space.js) — only in flight
        if (name === 'FlyingMaxima') {
            const tired = this.combat.check(name);
            if (tired) { if (isFinal) this.hud.setVoice(tired, true); return null; }
            const r = this.space.cast(isFinal);
            if (r) this.combat.pay(name);
            return r;
        }
        // the gods' scrolls: the planets (PlanetMagic.js) — in space or on a planet
        if (PLANET_SPELLS.includes(name)) return this.planetMagic.cast(name, isFinal);
        if (name === 'PlanetLiquidation') return this.planetDestroy.cast(isFinal); // (instant: the magic let go does the rest — PlanetDestroy.js)
        // off the Earth some spells have nothing to work with: no air for fire, no water, no ground in space (Space.js)
        const offEarth = this.space?.spellBlocked(name);
        if (offEarth) { if (isFinal) this.hud.setVoice(offEarth, true); return null; }
        // Shield: arm stretched out (or a T for Maxima), not raised to the face
        if (name === 'Protection' || name === 'ProtectionMaxima') return this._castProtection(name, isFinal);
        // «Protection Gods» / «… Maxima»: the gods' shield, the same gesture — golden (ProtectionGods.js; works in space too)
        if (name === 'ProtectionGods' || name === 'ProtectionGodsMaxima') return this._castProtection(name, isFinal);
        // «Максима» while my house's dome grows: it grows twice as fast (before the water's / the duel's)
        if (name === 'Maxima' && this.wards?.setting && !this._inDuel()) return this._castWard('WardGrow', isFinal);
        // «Максима» said alone just after the hand shield went up («Протекшн… Максима» heard as two phrases): the
        // shield grows into its dome — «Protection Maxima» / «Protection Gods Maxima» (arms spread, known, paid as one)
        if (name === 'Maxima' && this.combat.shield?.type === 1 && Date.now() - (this._lastShieldCast || 0) < 4000 && !this._inDuel()) {
            const dome = this.combat.shield.gods ? 'ProtectionGodsMaxima' : 'ProtectionMaxima';
            if (this.knowsSpell(dome)) return this._castProtection(dome, isFinal);
        }
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
        if (name === 'Lumos' || name === 'LumosMaxima' || name === 'LumosFlashlight' || name === 'LumosAhead' || name === 'LumosFollowing' || name === 'Nox' || name === 'Draw' || name === 'Reveal') return this.wandMagic.cast(name, isFinal);
        if (name === 'Rescue') return this.bleeding.rescue(isFinal);
        if (name === 'Breakthrough' || name === 'BreakthroughMaxima') return this._castBreakthrough(name, isFinal);
        if (name === 'Attack') {
            // the Ice Rod: the snowmen go for whom it points at (IceQueen.rodAttack)
            if (this.iceCastle?.myRod() && this.iceCastle.rodAttack(isFinal)) return 'Attack';
            // the calmed dragon: sent only at one it is already angry at (DragonRide.attack)
            if (this.dragonRide?.active) { const dr = this.dragonRide.attack(isFinal); if (dr !== undefined) return dr; }
            // the swarm of things («Левиоса Максима»): a volley at the one the wand points at
            if (this.levMax?.swarm?.active) { const r = this.levMax.swarm.attack(isFinal); if (r) return r; return null; }
            // my servants (a living tree, «Брейнрот») go for the one the hand points at
            if (this.levitation.state?.kind !== 'weapon' && this.servants.hasServants(this.localId)) return this._commandAttack(isFinal);
            const hint = this.levitation.attack();
            if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
            return 'Attack';
        }
        if (name === 'CreateBed' || name === 'ChangeColor') return this.beds.cast(name, text, isFinal);
        if (name === 'CreateHouse' || name === 'ImproveHouse') return this.houseMagic.cast(name, isFinal); // (HouseMagic.js)
        if (name === 'CreateCastle') return this.castleMagic.cast(name, isFinal); // (CastleMagic.js)
        if (name === 'DivineCreation') return this.divine.cast(isFinal, text); // («Да пусть создастся …»: the description is the phrase's own — DivineCreation.js)
        if (name === 'IceCastle' || name === 'IceBridge') return this.iceMagic.cast(name, isFinal); // (IceMagic.js)
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
        // the Ice Rod in the hand: «Frozen» is its word — it freezes the creature it points at through any
        // armour, or lays ice where it points (IceQueen.rodFrozen)
        if (name === 'Frozen' && !this.water.active && this.iceCastle?.myRod()) return this.iceCastle.rodFrozen(isFinal);
        let ice = false;
        if ((name === 'Ice' || name === 'Frozen' || name === 'IceMaxima') && !this.water.active) {
            if (performance.now() - (this.water.frozenAt || -1e9) < 4000) return null;
            ice = true;
        }
        // («Джолт» flies at once — a duel is won by milliseconds (the author); a «…Максима» after it makes the
        //  charge already flying the Maxima: _joltUpgrade)
        if (name === 'JoltMaxima' && this._joltUpgrade()) return name;
        // («Firefighting» alone, still being spoken: it may yet be «Firefighting Maxima»)
        if (name === 'Firefighting' && !isFinal) return null;
        // «Suit Up»: the best armour of the slots and of what lies near — on at once (Armor.js)
        if (name === 'SuitUp') return this.armor.suitUp(isFinal);
        // «Disarmor» with the wand (the hand) held up to the sky: off ME — my plain steel and a plain robe (Armor.disarmSelf)
        if (name === 'Disarmor') { const h = castingHand(this); if (h && pointsUp(h.dir)) return this.armor.disarmSelf(isFinal); }
        // «Liquidation» at a creature the raised hand points at is a DUEL charge (Duel.js: it flies, meets other charges in a clash,
        // «Protection» stops it; it crumbles what the one hit holds in his hand — HeldBreak.js; the Maxima's loser loses his wand);
        // at a thing, a block, nothing — the splash (Liquidation.js). The same words either way: where the hand points decides.
        if (name === 'Liquidation' || name === 'LiquidationMaxima') {
            if (name === 'Liquidation' && !isFinal) return null; // (wait: maybe «… Максима»)
            const laim = this.duel.pickSide(false, duelRange(name));
            if (laim) return this._castDuel(name, name === 'Liquidation' ? 'LiquidationDuel' : 'LiquidationMaximaDuel', isFinal, laim, laim.side);
        }
        const duelSpell = name === 'Sapira' ? 'SapiraDuel' : name === 'Sands' ? 'SandsDuel' : ice ? (name === 'IceMaxima' ? 'IceDuelMaxima' : 'IceDuel') : isStrongDuel(name) ? name : (name === 'Stupefy' || name === 'AvadaKedavra' || name === 'Expelliarmus' || name === 'Disarmor' || name === 'Jolt' || name === 'JoltMaxima') ? name : null;
        if (duelSpell) {
            const reach = duelRange(name);
            const aim = this.duel.pickSide(false, reach);
            const side = aim ? aim.side : this.wandSide() || (this.character.isArmRaised(this.magicHand || this.lastMagicHand || this.dom) ? (this.magicHand || this.lastMagicHand || this.dom) : (this.wandSide() || [this.dom, this.off].find((s) => this.character.isArmRaised(s))));
            if (!side || !this.character.isArmRaised(side)) {
                if (isFinal) this.hud.setVoice('✋ Поднимите руку и направьте её на цель — тогда заклинание сработает', true);
                return null;
            }
            // «Дай»: only at a target the raised hand (the wand) points right at — never cast into the air (StrongSpells.js)
            if (!aim) {
                // heard, hand raised, but nothing within reach: too far (the creature is there, beyond the range) or no target — no charge, no mana
                const far = isFinal && !(this._interimCast && Date.now() - this._interimCast.at < 3000) ? this.duel.farTarget(reach) : null;
                if (far != null) { this.lastCastWhy = 'цель слишком далеко'; this._why('tooFar', name, { dist: Math.round(far), range: reach }); return null; }
                if (name === 'Die') { this.lastCastWhy = '«Дай»: рука не наведена на цель'; if (isFinal) this._why('noTarget', name, { what: 'неё' }); return null; }
            }
            return this._castDuel(ice ? (name === 'IceMaxima' ? 'IceMaxima' : 'Ice') : name, duelSpell, isFinal, aim || null, side); // («Frozen» without water costs what «Айс» costs)
        }
        if (name === 'Accio') return this._castAccio(isFinal);
        if (name === 'Alohomora' || name === 'AlohomoraMaxima') return this.locks.cast(name, isFinal); // (a lock the hand points at — Alohomora.js)
        if (name === 'Lock') return this.locks.castLock(isFinal); // (the door the hand points at shuts and locks — Alohomora.js)
        if (name === 'Unfurl' || name === 'Furl') return this.ships ? this.ships.castSails(name, text, isFinal) : null; // (a ship's sails)
        if (name === 'Fire') return isFinal ? this.campfires.cast(isFinal) : null; // (unfinished «Fire…»: it may be «Fire Maxima»)
        if (name === 'Wind' || name === 'WindMaxima' || name === 'Overgrown' || name === 'OvergrownMaxima') return this._castWind(name, isFinal);
        if (name === 'Brainrot') return this._castBrainrot(isFinal);
        if (name === 'Imperius' || name === 'ImperiusMaxima') return this.imperius.cast(name, isFinal); // (the mind into the creature pointed at — ImperiusControl.js)
        if (name === 'BrainrotMaxima') return this.dragonRide.cast(isFinal); // (a dragon calmed, ridden — DragonRide.js; every other creature: «Брейнрот»)
        if (name === 'Snowman') return this.iceCastle.castSnowman(isFinal); // (a friendly snowman out of the snow pointed at — IceQueen.js)
        if (name === 'Alive' || name === 'AliveMaxima') return isFinal ? this.livingTrees.cast(isFinal, name === 'AliveMaxima') : null; // (unfinished «Alive…»: it may be «Alive Maxima»)
        if (name === 'LightningStrike') return this._castLightning(isFinal);
        if (name === 'TotalDestruction' || name === 'TotalDestructionMaxima') return this.destruction.cast(isFinal, name);
        if (name === 'CircleAttack' || name === 'CircleAttackMaxima') return this.circleAttack.cast(isFinal, name);
        if (name === 'Inspirius') return this.inspirius.cast(isFinal);
        if (name === 'Boom') return this.boom.cast(isFinal);
        if (name === 'Hellfire') return this.hellfire.cast(isFinal);
        if (name === 'WaterVortexSuperMaxima') return this.waterStorm.cast(isFinal);
        if (name === 'ToTheSun') return this._castSun(isFinal);
        if (name === 'GiveMyPower') return this._castGiveMyPower(isFinal);
        if (name === 'LetItRain') return this._castRain(isFinal);
        if (BUILD_SPELLS[name]) return this._castBuild(name, isFinal);
        if (name === 'Earthquake' || name === 'EarthquakeMaxima') return this._castEarthquake(name, isFinal);
        // «Вингардиум Левиоса Максима»: a group, a tree, a house, a ship (LevitationMaxima.js)
        if (name === 'LevitationMaxima') return this.levMax.cast(isFinal);
        if (name === 'WindImpulse' || name === 'WindImpulseMaxima') return this._castImpulse(name, isFinal);
        if (name === 'Drawdown' || name === 'DrawdownMaxima') return this.drawdown.cast(name, isFinal);
        if (name === 'Liquidation' || name === 'LiquidationMaxima') return this.liquidation.cast(name, isFinal);
        if (name === 'Stitching') return this.stitching.cast(isFinal);
        if (name === 'CreateBridge') return this.bridge.cast(isFinal);
        if (name === 'Groundprud') return this.groundprud.cast(isFinal);
        if (name === 'Invisibility') return this.invis.cast(isFinal);
        if (name === 'VisibleGodi') return this.visibleGodi.cast(isFinal);
        if (name === 'Pentagranium') return this.pentagranium.cast(isFinal, text); // («Pentagranium <Name>»: the pentagram named in the phrase, laid where the wand points — Pentagranium.js)
        if (name === 'Fireworks') return this.fireworks.cast(isFinal);
        if (name === 'Nihilis') return this.nihilis.cast(isFinal); // (a cone of light against black magic — Nihilis.js; instant, white magic)
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
        if (!recent && name !== 'Flight') {
            this.lastCastWhy = `рука не поднята: жест не виден уже ${Math.round(Date.now() - this.lastMagicTime)} мс (нужно не дольше 1500 мс)`;
            if (isFinal) this._why('handDown', name);
            return null;
        }
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
            if (early.name === name) { this.lastCastWhy = 'эта фраза уже сработала (промежуточная версия)'; this._interimCast = null; return null; }
        }
        if (name === 'Bombardo' || name === 'BombardoMaxima') this._pendingBombardo = null;
        if (now - this.lastSpellCastTime < SPELL_COOLDOWN) { this.lastCastWhy = `пауза между заклинаниями: прошло ${now - this.lastSpellCastTime} мс из ${SPELL_COOLDOWN}`; if (isFinal && !early) this._why('cooldown'); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        if (name === 'Flight' && !this.startFlight()) return null;
        this.combat.pay(name);
        this._interimCast = isFinal ? null : { name, at: now };
        this.lastSpellCastTime = now;
        if (name === 'Flight') return name;
        const side = this.wandSide() || this.magicHand || this.lastMagicHand || this.dom;
        let origin = this.spellStart(side);
        let dir = this.character.getHandDirection(side);
        // «Firefighting» with the wand raised UP (or at oneself): the air round ME vanishes — whoever burns near goes out (Firefighting._air)
        if (name === 'Firefighting' || name === 'FirefightingMaxima') {
            const hand = castingHand(this);
            if (hand && aimedUpOrSelf(this, hand)) { origin = this.combat.center(new THREE.Vector3()); dir = new THREE.Vector3(0, 1, 0); }
        }
        this.spells.cast(name, origin, dir, side, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, side);
        return name;
    }

    /**
     * A recognized spell that did not work, and why (Hints.refusal), on the message line —
     * once per reason every two seconds (the recognizer repeats a phrase many times).
     */
    _why(code, name = null, extra = null) {
        const gate = this._hintGate || (this._hintGate = new HintGate(2000));
        const text = refusal(code, { ...extra, name: name ? SPELL_RU[baseSpell(name)] || name : null });
        // (the journal gets the reason every time — the screen's hint is held back by the gate, the journal's line is not)
        if (text && !this.lastCastWhy) this.lastCastWhy = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!gate.pass(code + (name || ''))) return;
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
        if (now - (this._lastShieldCast || 0) < 800 && this._lastShieldName === name) return null; // (a longer phrase heard after — «… Gods», «… Maxima» — goes on)
        const hint = this.combat.castProtection(/Maxima$/.test(name), name.startsWith('ProtectionGods'));
        if (hint) { this.hud.setVoice(hint, true); return null; }
        this._lastShieldCast = now;
        this._lastShieldName = name;
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
        if (this.imperius?.stop('stop')) done.push('Империус'); // (the mind flies back into its own body)
        if (this.combat.dropShield('🛑 Стоп — щит снят')) done.push('щит');
        if (this.levitation.active) { this.levitation.release(false); done.push('Левиоса'); }
        if (this.levMax?.stop()) done.push('Левиоса Максима'); // (what it holds falls)
        const pm = !!this.planetMagic?.stop(); // (the planet stays on its new orbit)
        if (pm) done.push('Левиоса Супер Максима');
        if (this.water?.active) { this.water.drop(); done.push('водяной шар'); }
        if (this.vortex?.stop()) done.push('водоворот');
        const hf = this.hellfire?.sayStop(); // («стоп» is free for it)
        if (hf === true) done.push('адский огонь');
        const ws = this.waterStorm?.sayStop(); // (and 50 for the water storm)
        if (ws === true) done.push('водяная буря');
        if (this.swim?.bubble) { this.swim._popBubble(); done.push('пузырь'); }
        if (this.waves?.stop()) done.push('волна');
        // (the Lumos is not stopped by «стоп» — only «Нокс» puts it out: the author)
        if (W?.drawing && W.drawing.until > performance.now()) { W.drawing.until = 0; done.push('рисование'); }
        if (W?.holo) { W._closeHolo(); done.push('тайны'); }
        if (this.accio?.stop()) done.push('Акцио');
        if (this.flight?.busy && this.flight.state !== 'landing' && !pm) { this.flight.land('stop'); done.push('полёт'); } // («стоп» letting a planet go: the flight goes on)
        if (this.lightning) { if (this.lightning.hammer) this.gear?.hammerResult(false); this.lightning = null; this.hud.setTimer?.(null); done.push('молния'); }
        if (this.spells.stopBy(this.localId)) done.push('огонь / луч');
        if (this.strong?.stopElectrum('stop')) done.push('Электром');
        if (this.dragonRide?.stop('stop')) done.push('дракон'); // («Брейнрот Максима»: let go — in the air it lands gently)
        if (this.livingTrees?.stopMine()) done.push('живое дерево');
        if (this.ships?.stopWind()) done.push('ветер в паруса');
        if (this.invis?.stop()) done.push('невидимость');
        if (this.groundVortex?.stop('stop')) done.push('Ground Vortex');
        if (this.visibleGodi?.stop('stop')) done.push('Visible Godi');
        if (this.sunContest?.stop('stop')) done.push('To the Sun');
        if (this.fireworks?.stop('stop')) done.push('салют');
        if (this.iceMagic?.stopMine('stop')) done.push('ледяная магия'); // (what has grown stays)
        if (!done.length) return false;
        this.sync?.stopSpells?.();
        if ((hf === true || ws === true || pm) && done.length === 1) return true; // (its own words: the fire left / the water fallen / the planet's new orbit)
        this.hud.setVoice(`🛑 Стоп: ${done.join(', ')}`, true);
        return true;
    }

    /** Duel spell: costs fatigue, flies to the pointed-at creature (or straight ahead). */
    /**
     * «Джолт» already flew before the phrase ended (an answer: Duel.underFire) and the phrase is «Джолт Максима»:
     * that charge becomes the Maxima (the rest of its mana is paid; none left — it stays a «Джолт») — never a
     * second charge. false: no such early «Джолт» (an ordinary cast).
     */
    _joltUpgrade() {
        const early = this._interimCast;
        if (!early || early.name !== 'Jolt' || Date.now() - early.at > 3000) return false;
        this._interimCast = null;
        const extra = this.combat.costOf('JoltMaxima') - this.combat.costOf('Jolt');
        if (manaRules(this) && this.combat.fatigue < extra) return true; // (no mana for more: it stays a «Джолт»)
        if (this.duel.upgradeJolt() && manaRules(this)) this.combat.fatigue = Math.max(0, this.combat.fatigue - extra);
        return true;
    }

    _castDuel(costName, spell, isFinal, aim = undefined, side = null) {
        const now = Date.now();
        const early = this._interimCast;
        if (isFinal && early && early.name === costName && now - early.at < 3000) { this._interimCast = null; return null; }
        if (!isFinal && early && early.name === costName && now - early.at < 3000) return null; // (the same phrase still being heard: no second charge)
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
        return (this.spiders ? this.spiders.list : []).concat(this.dragons ? this.dragons.list : [], this.iceCastle ? this.iceCastle.list : []); // (and the dragons, the Ice Castle's creatures)
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
        const side = (this.wandSide() || [this.dom, this.off].find((s) => ch.isArmRaised(s))) || this.magicHand || this.dom;
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
        const pref = this.magicHand || this.lastMagicHand || this.dom;
        const side = this.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        if (!side) { if (isFinal) this.hud.setVoice(over ? '🌿 Поднимите руку и направьте её на тех, кого разбросать, — и скажите «Overgrown»' : '🌬️ Поднимите руку и направьте её туда, куда дуть, — и скажите «Вайнд»', true); return null; }
        const tired = this.combat.check(name);
        if (tired) { this.hud.setVoice(tired, true); return null; }
        // «Вайнд Максима» with the wand raised up (or at oneself): a ring of wind out of me that also puts out fires (WindRing.js)
        if (name === 'WindMaxima') {
            const hand = castingHand(this);
            if (hand && aimedUpOrSelf(this, hand)) {
                const c = this.combat.center(new THREE.Vector3());
                this.spells.cast(name, c, _v1.set(0, 1, 0), hand.side, this.localId);
                if (this.sync) this.sync.spell(name, c, _v1.set(0, 1, 0), hand.side);
                this.combat.pay(name);
                this[key] = now;
                this._interimCast = isFinal ? null : { name, at: now };
                return name;
            }
        }
        const origin = this.spellStart(side);
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
     * an animal, somebody else's living tree — becomes your servant
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
        if (best?.k === 'D') { if (isFinal) this.hud.setVoice('🐉 Разум дракона слишком силён для «Брейнрот» — его успокаивает только «Брейнрот Максима»', true); return null; }
        // (a phoenix obeys nobody: «Брейнрот» does not act on it — Phoenixes.TARGETS)
        for (const f of this.phoenixes?.targets() || []) consider('f', f.id, f.model.position, 1.2);
        if (best?.k === 'f') { if (isFinal) this.hud.setVoice('🔥 Феникс никому не подчиняется — «Брейнрот» на него не действует', true); return null; }
        // (an owl is far too clever: «Брейнрот» does not act on it — Owls.TARGETS; the gargoyles obey the pentagram, not the caster — GargoyleRules.TARGETS)
        for (const o of this.owls?.targets() || []) consider('o', o.id, o.model.position, 0.6);
        // (the invisible bird of Spencer is too small for orders: «Брейнрот» does not act on it — SpencerRules.SPENCER_TARGETS.brainrot)
        for (const o of this.spencers?.targets() || []) consider('sx', o.id, o.model.position, 0.5);
        if (best?.k === 'sx') { if (isFinal) this.hud.setVoice('🪶 Птичка слишком мала — «Брейнрот» на неё не действует', true); return null; }
        if (best?.k === 'o') { if (isFinal) this.hud.setVoice('🦉 Сова слишком умна — «Брейнрот» на неё не действует', true); return null; }
        // (the swamp Canaries: a stubborn mind — «Брейнрот» does not take it)
        for (const c of this.canaries?.targets() || []) consider('N', c.id, c.model.position, 1.2);
        // (a creature of one's own: «Брейнрот» calms a hostile one for a minute — CustomCreatures.calm)
        for (const c of this.customCreatures?.targets() || []) consider('C', c.id, c.model.position, c.D.H * 0.5);
        if (best?.k === 'C') { const cc = this.customCreatures.byId(best.id); if (cc) { if (this.authority) this.customCreatures.calm(cc, 60); if (isFinal) this.hud.setVoice(`🌀 «${cc.recipe.name}» успокоилось на минуту`, true); } return 'Brainrot'; }
        if (best?.k === 'N') { if (isFinal) this.hud.setVoice('🪨 Упрямый разум канарика «Брейнрот» не берёт', true); return null; }
        // (the Ice Castle's creatures: the queen's will holds them — the rod alone commands the snowmen)
        for (const c of this.iceCastle?.targets() || []) consider('I', c.id, c.model.position, c.h * 0.5);
        if (best?.k === 'I') { if (isFinal) this.hud.setVoice('❄️ Ледяную магию «Брейнрот» не берёт — снеговиками управляет только Ледяной Жезл', true); return null; }
        if (best?.k === 'v') { if (isFinal) this.hud.setVoice('🌀 «Брейнрот» не действует на человекоподобных: жителей, рыцарей и волшебников', true); return null; }
        if (!best) { if (isFinal) this.hud.setVoice('🌀 Посмотрите на существо (зомби, животное, чужое живое дерево — не дальше 30 м) и скажите «Брейнрот»', true); return null; }
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
        if (!t || t.kind === 'b') {
            // (no creature: the hand at the ground sends the living trees there)
            const o = new THREE.Vector3(), d = new THREE.Vector3();
            this.duel._myRay(aim?.side || this.magicHand || this.lastMagicHand || this.dom || 'right', o, d);
            const cell = this.builder?._hitCell?.(o, d, 60);
            if (cell?.point && this.livingTrees?.mine().length) {
                if (this.authority) this.servants.commandPoint(this.localId, cell.point.x, cell.point.z);
                else this.sync?.servantAttack?.(null, null, cell.point.x, cell.point.z);
                this.hud.setVoice('🌳 Деревья идут туда, куда вы показали', true);
                return 'Attack';
            }
            if (isFinal) this.hud.setVoice('✋ Направьте руку на того, кого атаковать, и скажите «Атак»', true);
            return null;
        }
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
        c.damage(max ? DAMAGE.EarthquakeMaxima : DAMAGE.Earthquake, casterId, 'Earthquake');
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
    /**
     * «To the Sun»: a hand raised to the sky, in the rain — the clouds part and the rain stops; the beam goes with the wand.
     * Under the BLACK CLOUDS of the gargoyle ritual (raining or not) it fights them instead (SunContest.js): held, the wand on the clouds.
     */
    _castSun(isFinal) {
        const raining = this.storm && (this.storm.k > 0.2 || performance.now() < this.storm.until);
        const here = this.character?.group?.position;
        const black = !!(here && this.gargoyles?.cloudsOver(here));
        if (this.sunContest?.active) { if (isFinal) this.hud.setVoice('☀️ Луч уже борется с тучами — «стоп», чтобы закончить', true); return null; }
        if (!raining && !black) { if (isFinal) this.hud.setVoice('☀️ «To the Sun» работает во время дождя и против чёрных туч горгулий', true); return null; }
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
        side = side || this.dom;
        const tired = this.combat.check('ToTheSun');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('ToTheSun');
        const o = this.castOrigin(side);
        this.spells.cast('ToTheSun', o, _v1.set(0, 1, 0), side, this.localId);
        if (this.sync) this.sync.spell('ToTheSun', o, _v1.set(0, 1, 0), side);
        if (black && this.sunContest?.start()) {
            this.hud.setVoice('☀️ <span style="color:#ffd36b">To the Sun!</span> Луч бьёт в чёрные тучи — они сопротивляются. Держите палочку на них', true);
        } else this.hud.setVoice('☀️ <span style="color:#ffd36b">To the Sun!</span> Тучи расходятся, дождь стихает', true);
        return 'ToTheSun';
    }

    /**
     * «Give Me My Power» (50, only from its scroll): the raised hand (the wand) pointed at my own
     * skeleton — the body where my power stayed when I died — gives all of it back (Legacy.js).
     * Nothing else: another's body, a creature, a thing — it does not work on them.
     */
    _castGiveMyPower(isFinal) {
        if (!isFinal) return null;
        const ch = this.character;
        const side = this.wandSide() || [this.dom, this.off].find((s) => ch.isArmRaised(s));
        if (!side || !ch.isArmRaised(side)) { this.hud.setVoice('✋ Поднимите руку и направьте её на свой скелет — тогда «Give Me My Power» сработает', true); return null; }
        const b = this.death?.legacyAimed(this.castOrigin(side), ch.getHandDirection(side, new THREE.Vector3()));
        if (!b) { this.hud.setVoice('💀 Направьте руку на свой скелет — там, где вы погибли и где осталась ваша сила', true); return null; }
        const tired = this.combat.check('GiveMyPower');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        this.combat.pay('GiveMyPower');
        this.death.takeLegacy(b);
        onDarkCast(this, 'GiveMyPower'); // (чёрная магия: всегда +1)
        return 'GiveMyPower';
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
                L.side = this.magicHand || this.lastMagicHand || this.dom;
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
            if (this.combat.enabled) this.combat.damage(DAMAGE.Lightning, null, 'Lightning');
            else this.damageLocalPlayer(DAMAGE.Lightning);
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
            if (isFinal) this.hud.setVoice(this._unknownHint(name), true);
            return null;
        }
        if (manaRules(this) && this.combat.fatigue < BUILD_SPELLS[name].cost) { this.hud.toast?.('😮‍💨 Не хватает маны'); return null; }
        let hint;
        // «Gather» at a carcass (meat) or a golden tree (apples)
        if (name === 'Gather') {
            const side = (this.wandSide() || [this.dom, this.off].find((sd) => this.character.isArmRaised(sd))) || this.dom;
            // a thing lying about (armour, a weapon, food, a scroll…) pointed at by the wand or a raised hand wins
            // over the blocks under / behind it: it goes into the free hand — never the one with the wand or a sword
            // (Accio's rule: accioCatcher), both busy — into a slot; the rest around it (a body's) into the slots (Death.js)
            const rays = [...new Set([side, this.dom, this.off])].filter((sd) => sd === side || this.character.isArmRaised(sd))
                .map((sd) => ({ o: this.castOrigin(sd), d: this.character.getHandDirection(sd) }));
            const free = (sd) => !this.weapons.hands[sd].held && !this.items?.held[sd] && !this.boards?.handBusy?.(sd);
            const loot = this.death?.gatherAt(rays, null, accioCatcher(free, this.dom));
            if (loot && loot.startsWith('✨')) { this.hud.setVoice(loot, true); this._lastBuild = now; if (manaRules(this)) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost); return 'Gather'; }
            // a cluster of mana crystals: all of it into the slots
            const cr = this.crystals?.gatherAt(this.castOrigin(side), this.character.getHandDirection(side), side);
            if (cr && cr.startsWith('🎒')) { if (isFinal) this.hud.setVoice(cr, true); return null; }
            if (cr) {
                this.hud.setVoice(cr, true);
                if (manaRules(this)) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost);
                this.mana?.success('Gather');
                this._lastBuild = now;
                return 'Gather';
            }
            const flo = this.flora?.gatherAt(this.character.getHandWorldPosition(side), this.character.getHandDirection(side));
            if (flo) { this.hud.setVoice(flo, true); if (flo.startsWith('✨')) this._lastBuild = now; return flo.startsWith('✨') ? 'Gather' : null; }
            const got = this.animals.gatherAt(this.character.getHandWorldPosition(side), this.character.getHandDirection(side));
            if (got && !got.startsWith('🍏')) { this.hud.setVoice(got, true); this._lastBuild = now; return 'Gather'; }
            if (got) { if (isFinal) this.hud.setVoice(got, true); return null; }
        }
        if (name === 'Gather') hint = this.builder.gather();
        else if (name === 'CreateDoor') hint = this.doors ? this.doors.create() : '🚪 Двери скоро будут';
        else if (name === 'CreateBoard') hint = this.boards.create();
        else hint = this.builder.start(name);
        if (hint) { if (isFinal) this.hud.setVoice(hint, true); return null; }
        if (manaRules(this)) this.combat.fatigue = Math.max(0, this.combat.fatigue - BUILD_SPELLS[name].cost);
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
        const player = this._zombieSenses(z, this.nearestPlayer(zp));
        let best = null, bd = 10 * 10;
        for (const o of this.zombies) {
            if (!o.isThrall || o.isDead || o.isDying) continue;
            const d = zp.distanceToSquared(o.group.position);
            if (d < bd) { bd = d; best = o; }
        }
        if (best && (!player || bd < player.distSq)) return { pos: best.group.position, zombie: best, distSq: bd };
        return player || this._zombieWander(z);
    }

    /**
     * What a zombie notices (ZSENSE): it hears a player within HEAR m, sees one within SEE m if nothing is in between
     * (a wall, a hill — Collision.lineOfSight); once after him, it keeps on up to LOSE m. A blow wakes it at once
     * (damageZombie). Not noticed — null (it wanders). In «Хардкор» and on the maps they always know where you are.
     */
    _zombieSenses(z, player) {
        if (!player) { z.hunting = false; return null; }
        if (this.config.mode === 'survival' || this.config.map) { z.hunting = true; return player; }
        const d = Math.sqrt(player.distSq);
        if (z.hunting) { if (d < ZSENSE.LOSE) return player; z.hunting = false; }
        if (d < ZSENSE.HEAR) { z.hunting = true; return player; }
        if (d < ZSENSE.SEE) {
            z._seeT = (z._seeT || 0) - (this._zdt || 1 / 60);
            if (z._seeT <= 0) { // (it looks again every 0.3 s: a ray isn't cast every frame)
                z._seeT = 0.3;
                const p = z.group.position, q = player.pos;
                z._saw = !this.collision?.lineOfSight || this.collision.lineOfSight(p.x, p.y + 1.1, p.z, q.x, q.y - 0.3, q.z, 0.8);
            }
            if (z._saw) { z.hunting = true; return player; }
        }
        return null;
    }

    /** Nobody noticed: it shambles about slowly round where it came out (a new spot every few seconds). */
    _zombieWander(z) {
        const p = z.group.position;
        if (!z.home) z.home = { x: p.x, z: p.z };
        const w = z.wander || (z.wander = { pos: new THREE.Vector3(), t: 0, wander: true, distSq: 0 });
        const dt = this._zdt || 1 / 60;
        w.t -= dt;
        if (w.t <= 0 || Math.hypot(w.pos.x - p.x, w.pos.z - p.z) < ZOMBIE.STOP + 0.2) {
            // (it scents the living: with a player within SCENT it shambles on his way — the next spot ahead of it,
            // turned a little either side; nobody about — round where it came out)
            const pl = this.nearestPlayer(p);
            if (pl && pl.distSq < ZSENSE.SCENT ** 2) {
                const a = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z) + (Math.random() - 0.5) * 1.6, r = 4 + Math.random() * 5;
                w.pos.set(p.x + Math.sin(a) * r, p.y, p.z + Math.cos(a) * r);
                z.home.x = w.pos.x; z.home.z = w.pos.z;
            } else {
                const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * ZSENSE.ROAM;
                w.pos.set(z.home.x + Math.cos(a) * r, p.y, z.home.z + Math.sin(a) * r);
            }
            w.t = 4 + Math.random() * 6; // (s; a pause before it sets off)
            w.rest = 1 + Math.random() * 3;
        }
        if (w.rest > 0) { w.rest -= dt; return null; } // (stands a moment, swaying — then goes on)
        w.distSq = p.distanceToSquared(w.pos);
        return w;
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
        if (isFinal && early && early.name === 'Accio' && now - early.at < 3000) { this.lastCastWhy = 'эта фраза уже сработала (промежуточная версия)'; this._interimCast = null; return null; }
        if (now - (this._lastAccio || 0) < 900 || this.accio.active) { this.lastCastWhy = this.accio.active ? 'предыдущий «Акцио» ещё летит / не закончился' : 'пауза между «Акцио» (0,9 с)'; return null; }
        const tired = this.combat.check('Accio');
        if (tired) { this.hud.setVoice(tired, true); return null; }
        const hint = this.accio.cast();
        if (hint) { if (!this.lastCastWhy) this.lastCastWhy = String(hint).replace(/^🪄\s*/, ''); if (isFinal) this.hud.setVoice(hint, true); return null; }
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
            const side = (this.wandSide() || [this.dom, this.off].find((sd) => this.character.isArmRaised(sd))) || this.dom;
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
            this.owls?.hitRay(o, d, len, 0.6, 0, 'Inferno', casterId);
            this.canaries?.hitRay(o, d, len, 0.6, 2, 'Inferno', casterId); // (a canary burns and runs: Canaries.hit — fire)
            this.spencers?.hitRay(o, d, len, 0.6, 3, 'Inferno', casterId); this.ghosts?.hitRay(o, d, len, 0.6, 3, 'Inferno', casterId); // (a ghost: fire does nothing — GhostRules) // (fire burns the invisible bird: its feather falls)
            this.customCreatures?.hitRay(o, d, len, 0.6, 2, 'Inferno', casterId);
            this.customPlants?.hitRay(o, d, len, 0.6, 2, 'Inferno'); // (a plant of one's own burns) // (a creature of one's own burns, unless it breathes fire)
            this.plants?.hitRay(o, d, len, 0.6, 4, 'Inferno', casterId); // (fire: plants burn fast)
            this.flora?.hitRay(o, d, len, 0.6, 4, 'Inferno'); // (the wild plants burn too)
            this.gargoyles?.hitRay(o, d, len, 0.6, 0, 'Inferno', casterId); // (hellish: fire does not touch a gargoyle, but it is an attack) // (an owl: no scroll's spell — it darts away)
            if (this.iceCastle?.hitRay(o, d, len, 0.6, 3, 'Inferno', casterId)) hit = true; // (the Ice Castle's creatures: fire is what they fear — ×2)
            if (this.castleLife?.hitRay(o, d, len, 0.4, 1, casterId)) hit = true; // villagers, knights, wizards
            if (this.livingTrees?.burnAlong(o, d, len, casterId)) hit = true; // (fire is what kills a living tree)
            if (this.carriages?.burnAlong(o, d, len, casterId)) hit = true; // (a cart on the road catches fire)
        }
        if (this.iceCastle?.meltRay(o, d, len, 1, casterId ?? null)) hit = true; // (the Ice Castle's ice melts in the flame)
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
        if (!h) return false; // (the running book too: paper — it burns, nothing learned)
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
            const p = h?.model && (it?.kind === 'scroll' || it?.kind === 'book') ? h.model.getWorldPosition(_v1) : null;
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
        // One owned capsule per descriptor, refreshed from the actual pose on every update.
        // Duel's pooled body list must not be retained by a flying spell.
        const bodyOf = (id) => {
            const body = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
            return () => this.duel?._bodyOf('p', id, body) || null;
        };
        if (!c.dead && casterId !== 'local' && casterId !== me && !safe(c.center())) {
            out.push({
                local: true,
                id: me,
                center: () => c.center(),
                body: bodyOf(me),
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
                body: bodyOf(id),
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
        this.monster?.end('dead', true); // (death: the monster form is gone at once — MonsterForm.js)
        this.burning?.onDeath?.(); // (death puts the fire out)
        const manaMax = this.mana?.max; // (told to the others: a duel won against me is worth this much)
        // (the author: «умер — всё»: the hero starts anew in the same world; all they grew lies in the body — Legacy.js)
        // («Дай» dissolved me: no body — the old power is gone for good, nobody can take it back: StrongMagic)
        const legacy = this.config.mode !== 'creative' && this._deathHow !== 'annihilate' ? captureLegacy(this) : null;
        this.mana?.onDeath(); // all the mana grown with practice is lost
        if (this.config.mode !== 'creative') {
            this.achievements?.onDeath(); // … the achievements with their mana cells
            wipeHero(this); // … the burnt scrolls and the books' spells
        }
        this.runner?.onDeath(); // (the running book's quickness is lost)
        this.death?.playerDied(byId, text, legacy); // the body stays (with the legacy), everything drops (Death.js); game.onDeath hooks
        if (this.sync) this.sync.died(byId, manaMax, this._deathKind);
        this._deathKind = null;
        this.castleLife?.playerDied(this.localId);
        this.ships?.onLocalDeath(); // (lets go of a ship's wheel)
        this.hud.setStatus('');
        if (this.flight.busy) this.flight.land('dead');
        this.boards?.dropAll('dead');
        this.weapons.releaseAll?.();
        this.ui.died?.(text, () => this.respawn());
    }

    /**
     * Turn the hero to face `yaw` (a rotation.y: he looks along −sin, −cos) and keep it: the body follows `cameraBaseRotation` / `smoothBody`
     * every frame, so setting `rotation.y` alone is undone at the next frame (the view spun back).
     */
    faceYaw(yaw) {
        this.cameraBaseRotation = yaw; this.smoothBody = yaw;
        this.character.setBodyRotation(yaw);
    }

    /** Back into the game: full health, a new place near the start. */
    respawn() {
        if (restartsCreative(this) && this.ui.restartCreative) return this.ui.restartCreative(this);
        const ch = this.character;
        this.bleeding?.clearCuts(ch);
        this.dismember?.resetLocal(); // (cut-off arms / legs / the head: whole again)
        this.strong?.reset(); // (no haze, no ice, no lightning held)
        this.combat.revive();
        this.heroApply?.respawn(); // (Creative: the hero's settings again)
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
        this.wandMagic?._nox(false); // (died: the Lumos went out — the tip, the thrown light, the following one)
        this.impact.reset();
        this.hud.update(this.playerHP, this.maxHP, this.killCount, this.punchCount);
        this.inventory?.ensureStarterWand();
        this.space?.onRespawn(); // (back on the Earth: nothing of space left on)
        this.death?.respawned(); // game.onRespawn hooks
        if (this.sync) this.sync.respawned();
        for (let i = 0; i < 30; i++) this.fx.spark(_v1.copy(p).add(_v2.set(0, -1, 0)), i % 2 ? 0xffffff : 0x9fd8ff, 0.15, _v2.set((Math.random() - 0.5) * 4, Math.random() * 5, (Math.random() - 0.5) * 4), 0.7);
    }

    /** Frozen water shapes become part of the world (and are synced). */
    placeIce(blobs) {
        const r3 = (v) => Math.round(v * 100) / 100;
        const list = blobs.map((b) => ({ x: r3(b.x), y: r3(b.y), z: r3(b.z), r: r3(b.r) }));
        this.applyIce(list);
        if (this.sync) this.sync.iceBlocks(list);
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
        if (name === 'FlyingMaxima') { if (!this.flight.active) this.startFlight(true); this.flight.state = 'cruise'; this.space?.cast(true); this.space?._beginAscend(true); return; }
        if (this._waterSpell(name)) { this._lastWaterCast = 0; return this._castWater(this._waterSpell(name), '', true); }
        if (/^Protection(Gods)?(Maxima)?$/.test(name)) { this._lastShieldCast = 0; return this._castProtection(name, true); }
        if (name === 'Levitation') { this._lastLevitate = 0; return this._castLevitation(true); }
        if (name === 'Accio') { this._lastAccio = 0; return this._castAccio(true); }
        if (name === 'Fire') { this.campfires._lastCast = 0; return this.campfires.cast(true, true); }
        if (name === 'Wind' || name === 'WindMaxima' || name === 'Overgrown' || name === 'OvergrownMaxima') {
            this._lastWind = this._lastOvergrown = 0;
            const origin = this.character.getHandWorldPosition(this.dom);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.spells.cast(name, origin, dir, this.dom, this.localId);
            if (this.sync) this.sync.spell(name, origin, dir, this.dom);
            return name;
        }
        if (name === 'SuitUp') return this.armor.suitUp(true);
        if (name === 'Stupefy' || name === 'AvadaKedavra' || name === 'Expelliarmus' || name === 'Disarmor' || name === 'Jolt' || name === 'JoltMaxima') { this._lastDuelCast = 0; return this._castDuel(name, name, true); }
        if (name === 'Sapira') { this._lastDuelCast = 0; return this._castDuel('Sapira', 'SapiraDuel', true); }
        if (name === 'Sands') { this._lastDuelCast = 0; return this._castDuel('Sands', 'SandsDuel', true); }
        if (name === 'Frozen' && this.iceCastle?.myRod()) return this.iceCastle.rodFrozen(true); // (the Ice Rod's word)
        if (name === 'Ice' || name === 'Frozen') { this._lastDuelCast = 0; return this._castDuel('Ice', 'IceDuel', true); }
        if (name === 'IceMaxima') { this._lastDuelCast = 0; return this._castDuel('IceMaxima', 'IceDuelMaxima', true); }
        if (isStrongDuel(name)) { this._lastDuelCast = 0; return this._castDuel(name, name, true); }
        const origin = this.character.getHandWorldPosition(this.dom);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.spells.cast(name, origin, dir, this.dom, this.localId);
        if (this.sync) this.sync.spell(name, origin, dir, this.dom);
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

    /** Things whose slot pictures are made while loading (ItemIcons.warm): every kind, the wands of every shape, what I carry. */
    _iconSamples() {
        const out = [];
        for (let m = 0; m < 10; m++) out.push({ ...rollWand(), model: m }); // (every shape of wand; a new wood's colour is made in play)
        out.push({ kind: 'wand', plain: true, model: 0, color: 0x8b5a2b }, { kind: 'weapon', type: 'sword' }, { kind: 'weapon', type: 'axe' }, spellScroll('Bombardo'));
        for (const kind of ['apple', 'redApple', 'baksadi_pear', 'glowcap_mushroom', 'fern_frond', 'azure_berry', 'sun_herb', 'frost_shard', 'meat', 'steak', 'coins', 'bread', 'cheese', 'pie', 'wool', 'logs', 'crystal', 'flask', 'cannonball', 'arrows', 'web', 'glass', 'backpack', 'bow', 'shield', 'hammer', 'book', 'potion', 'phoenixFeather', 'owlFeather', 'spencerFeather', 'beslanGrass', 'telewilpinLeaf', 'carnivoreHead', 'brightCore', 'canaryHide', 'bone']) out.push({ kind });
        out.push({ kind: 'coins', magic: true }, { kind: 'armor', piece: 'helmet' }, { kind: 'armor', piece: 'chest' }, { kind: 'robe', magic: true });
        for (const s of this.inventory?.slots || []) if (s) out.push(s);
        for (const sd of ['left', 'right']) { const h = this.items?.held[sd]; if (h) out.push(h.item); }
        return out;
    }

    /** The scene to the screen: the usual way, or with the «Ультра качество» picture. */
    _draw() {
        if (!this.ultra?.render()) this.renderer.render(this.scene, this.camera);
        this.seeFx?.render(); // («Visible Godi»: the cloud over the picture — nothing when the spell is off)
    }

    /**
     * Compile every shader the session can ever need NOW (during loading):
     * effects that are hidden until first use would otherwise compile in the
     * middle of a fight and freeze the game for a moment.
     */
    prewarm() {
        const run = this._prewarmRun();
        for (;;) { const r = run.next(); if (r.done) break; }
    }

    /**
     * The same warm-up, in pieces on the loading screen (the author, 29.10: «при заходе в Творческий страница не отвечала ~3 минуты»:
     * every shader and buffer of the game went to the video card in ONE task of the main thread — on a slower card or driver
     * minutes, and the browser offered to kill the page). Now each group of samples is compiled and drawn by itself, and the
     * thread is given back (the loading screen moves, the page answers) after every group.
     */
    async prewarmAsync(progress = () => {}) {
        if (this._prewarmed) return;
        const run = this._prewarmRun();
        let steps = 0;
        for (;;) {
            const r = run.next();
            if (r.done) break;
            steps++;
            progress(Math.min(0.99, steps / (r.value?.of || 40)));
            await new Promise((res) => setTimeout(res, 0));
        }
        progress(1);
    }

    *_prewarmRun() {
        if (this._prewarmed) return;
        this._prewarmed = true;
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
        for (const m of this.world.forest?.sampleModels?.() || []) zoo.add(m); // (the real trees' bark and leaves, their shadow)
        for (const m of chestSamples()) zoo.add(m); // (every look of a chest: plain, a boss's, a ship's, the Ice Queen's)
        for (const m of this.cauldrons?.sampleModels?.() || []) zoo.add(m); // (a cauldron's iron, rust, liquid, bubbles; a flask)
        for (const m of this.doors?.sampleModels?.() || []) zoo.add(m); // (the keep's forged-iron gates: their iron, steel, rust and the plates' textures — GateModel.js)
        for (const m of this.castleLife?.talk?.signs?.sampleModels?.() || []) zoo.add(m); // (the «Скупка» plaques of the buyers)
        for (const m of this.wizVillages?.sampleModels?.() || []) zoo.add(m); // (the plaque on Coprus the Clever's pedestal)
        for (const m of this.loreLibrary?.sampleModels?.() || []) zoo.add(m); // (the reading stand with its book)
        for (const m of this.buildingFx?.sampleModels?.() || []) zoo.add(m); // (a mill's sails, a church bell)
        for (const t of ['cow', 'pig', 'sheep', 'horse']) zoo.add(animalModel(t, 0x6b3f1e));
        for (let i = 0; i < PEGASUS_COATS.length; i++) zoo.add(animalModel('horse', PEGASUS_COLOR - 5 + i)); // (the Pegasus of some herds, every coat's hair picture made now)
        // (each animal as the video card draws it — one shape per material moved by its parts, FarShape: the skinned
        // shaders, with and without the shadow, and the kinds' shapes made now — not when the first herd comes into view)
        for (const m of [...['cow', 'pig', 'sheep', 'horse'].map((t) => animalModel(t, 0x6b3f1e)), animalModel('horse', PEGASUS_COLOR - 5), ...[1, 2, 3, 4].flatMap((k) => [animalModel('pig', k), animalModel('cow', k)])]) {
            new FarShape(m).set(true);
            zoo.add(m);
        }
        // (every look of a pig and a cow: each paints its own hide picture the first time — a herd
        // met in flight made the frame wait for them)
        for (let k = 1; k <= 4; k++) zoo.add(animalModel('pig', k), animalModel('cow', k));
        zoo.add(...this.flora?.sample() || [], ...[goldenTreeModel(), goldenTreeModel(true), baksadiModel()].map((m) => { new FarShape(m).set(true); return m; }), ...bonesModels(), spiderModel(), phoenixModel(), doorModel(0x8b5a2b), doorModel(0x7a4f2a), doorModel(0xcdeffd, { gate: true, ice: true }), doorModel(0x5b6068, { metal: true }), doorModel(0x5a3a1e, { gate: true }), this.campfires.sampleModel());
        for (const m of sampleIceModels()) zoo.add(m); // (the Ice Castle: the queen, snowmen, monsters, the chandelier, shots, spikes, the rod)
        for (const m of [iceQueenModel(), snowmanModel(), iceMonsterModel()]) { new FarShape(m).set(true); zoo.add(m); } // (as the video card draws them: one shape each — FarShape)
        for (const m of darkSamples()) zoo.add(m); // (чёрная магия: маска меток и дымок — DarkSkin.js)
        for (const m of [...darkLordSamples(), ...lordSamples()]) zoo.add(m); // («настоящий тёмный маг»: шар тьмы, воронка, круг рун, наряд — DarkLordFx.js, DarkLordLook.js)
        zoo.add(monsterSamples()); // («Пентаграмма страшного монстра»: шерсть, глаза, когти — MonsterBody.js)
        for (const m of this.beds?.sampleModels?.() || []) zoo.add(m);
        for (const m of this.enchantCircles?.sampleModels?.() || []) zoo.add(m); // (the enchanting circle, its column and rune rings)
        for (const m of glowSamples()) zoo.add(m); // (the rune shell of an enchanted thing)
        zoo.add(logStackModel(0x8b5a2b, 1)); // (a log in the hand: bark and rings — LogModel.js)
        for (const m of this.gargoyles?.sampleModels?.() || []) zoo.add(m); // (the gargoyle's skinned stone, glow and membrane; the ritual's flame wall, glow and cloud)
        for (const m of this.customPlants?.sampleModels?.() || []) zoo.add(m); // (a plant of one's own: its lit body, its glow)
        for (const m of this.customCreatures?.sampleModels?.() || []) zoo.add(m); // (a creature of one's own: its skin, plain colours, glowing eyes, a see-through wing)
        for (const m of this.spencers?.sampleModels?.() || []) zoo.add(m); // (the rose bird, its halo and the see-through material — only a seer ever has them in play, but the shader is compiled now)
        for (const m of this.ghosts?.sampleModels?.() || []) zoo.add(m); // (the sheet-ghost's outside and inside, the castle's chairs and candles, the flame — GhostFx.js, GhostProps.js)
        for (const m of this.beslan?.sampleModels?.() || []) zoo.add(m); // (Beslan's grass: its shader)
        for (const m of this.owls?.sampleModels?.() || []) zoo.add(m); // (the owl's shimmering plumage; its feather shares it)
        zoo.add(this.plants.sampleModels()); // (the Brightflower: stems, petals that open in the shader, flame, heart — BrightFlowerFx)
        zoo.add(plantSamples()); // (telewilpins and carnivorous heads: stems, petals, jaws, tendrils, the glow sprites — Plants.js)
        for (const m of this.wards?.sampleModels?.() || []) zoo.add(m); // (the dome of «Protection House»)
        for (const m of sampleShieldModels()) zoo.add(m); // (the shields: «Protection», and the gods' golden one — ProtectionGods.js)
        for (const m of this.iceMagic?.sampleModels?.() || []) zoo.add(m); // (the gloss of a castle of ice)
        for (const m of this.temple?.sampleModels?.() || []) zoo.add(m); // (the Temple of the Gods: its stone, marble, gold, books, sand, cobwebs, light)
        for (const m of this.boom?.sampleModels?.() || []) zoo.add(m); // («Бум»: its flying rocks, its shock ring)
        for (const m of this.ultra?.sampleModels?.() || []) zoo.add(m); // («Ультра качество»: the soft lawn)
        if (this.world.terrain?.flora) zoo.add(this.world.terrain.flora.sampleModel()); // (the meadows' tall grass and flowers)
        for (const m of this.pentagranium?.sampleModels?.() || []) zoo.add(m); // («Пентаграниум»: the trail's ribbons, the figure's and the glow's shaders)
        for (const m of this.groundVortex?.sampleModels?.() || []) zoo.add(m); // (the blocks of «Ground Vortex»)
        for (const m of this.groundprud?.sampleModels?.() || []) zoo.add(m); // (the earth of «Groundprud» rising out of the ground)
        for (const m of this.levMax?.sampleModels?.() || []) zoo.add(m); // (blocks carried by «Левиоса Максима», a living tree of its own blocks)
        for (const v of prewarmVillagers()) zoo.add(v);
        for (const m of skinnedSamples(villagerMaterials())) zoo.add(m); // (people far off as one shape moved by the video card: its shaders — FarShape)
        // (every thing lying about — and the swords and axes — as the video card draws them: one shape each (Items.oneShape,
        // Weapon); their skinned shaders made now, not when a battle's loot first falls)
        for (const kind of Object.keys(ITEM_INFO)) {
            try { const m = makeItemModel({ kind, uid: 'prewarm' }); if (m?.isObject3D) { m.userData.farRadius = 2.5; new FarShape(m, { cache: false }).set(true); zoo.add(m); } } catch (e) { /* (a thing that needs more than its kind) */ }
        }
        for (const t of ['sword', 'axe']) { try { const { group } = buildWeapon(t, this.renderer); new FarShape(group, { cache: false }).set(true); zoo.add(group); } catch (e) { /* (no model here) */ } }
        // what a flight comes upon (a harbour's ships, a dragon over the mountains, carts on the roads, a
        // dragon's gold): their shaders compiled now — the first one seen in flight froze the picture
        try {
            const cls = Object.keys(SHIP_CLASSES)[0];
            if (this.ships && cls) zoo.add(new ShipModel(buildLayout(cls), { color: 0x8a5a33, name: 'prewarm' }).group);
            if (this.ships && cls) zoo.add(new ShipModel(buildLayout(cls), { look: 'black', name: 'prewarm' }).group); // (the black ship's deck, black flag, green fire)
            { const B = barrierParts(); zoo.add(new THREE.Mesh(B.shell, B.shellMat), new THREE.Mesh(B.ring, B.ringMat)); } // (its magic barrier's flash)
            for (const v of sailorModels()) zoo.add(v.group); // (Captain Black Moustache, his skeletons)
            for (const k of KIND_IDS) { const dm = dragonModel(k); new FarShape(dm).set(true); zoo.add(dm); } // (drawn by the video card as one shape: its skinned shaders)
            zoo.add(cartModel(false), cartModel(true));
        } catch (e) { /* (a model that can't be made here: compiled on first sight, as before) */ }
        const box = new THREE.BoxGeometry(1, 1, 1);
        for (const m of [new THREE.MeshLambertMaterial(), new THREE.MeshPhongMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshStandardMaterial()]) {
            const im = new THREE.InstancedMesh(box, m, 1); // (instanced, without per-instance colours: coins, cannon balls, blocks)
            im.setMatrixAt(0, new THREE.Matrix4());
            zoo.add(im);
            // (and with them — each copy its own colour: sparks, the start's trees, falling blocks… — a shader of its own,
            // which was compiled the first time the player turned round in Creative: a freeze of ~0.1–0.3 s)
            const ic = new THREE.InstancedMesh(box, m, 1);
            ic.setMatrixAt(0, new THREE.Matrix4());
            ic.setColorAt(0, new THREE.Color(1, 1, 1));
            zoo.add(ic);
        }
        zoo.add(new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x5b4630 })));
        zoo.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, depthWrite: false })));
        zoo.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
        // the samples in groups of a few: each group alone on the scene (the rest hidden, the lights stay: the same shaders) is
        // compiled and drawn to each side, then the thread is given back; first the world itself (its hidden things made visible)
        const q = this.camera.quaternion.clone(), cp = this.camera.position.clone();
        const hideRest = [];
        const sides = () => {
            this.camera.position.copy(this.character.group.position).y += 1.7;
            for (let k = 0; k < 4; k++) {
                this.camera.quaternion.setFromEuler(new THREE.Euler(-0.15, k * Math.PI / 2, 0, 'YXZ'));
                this.camera.updateMatrixWorld(true);
                this.renderer.render(this.scene, this.camera);
            }
        };
        const PER = 4; // (samples in a group)
        const parts = [...zoo.children];
        const of = this._pwOf = 6 + Math.ceil(parts.length / PER); // (+ the world's own and the last few)
        try {
            this.renderer.compile(this.scene, this.camera);
            sides(); // (the world: every chunk's and model's buffers and textures)
            yield { of };
            this.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.visible) { o.visible = false; hideRest.push(o); } }); // (not the groups: a light inside one must stay on, or the shaders differ)
            this.scene.add(zoo);
            zoo.remove(...parts);
            for (let i = 0; i < parts.length; i += PER) {
                const part = parts.slice(i, i + PER);
                zoo.add(...part);
                sides();
                zoo.remove(...part);
                yield { of };
            }
        } finally {
            for (const c of hideRest) c.visible = true;
            this.camera.quaternion.copy(q);
            this.camera.position.copy(cp);
            this.camera.updateMatrixWorld(true);
            this.scene.remove(zoo);
        }
        // (geometries only: many of these materials are shared caches used later — disposing them would recompile)
        zoo.traverse((o) => { if (o.isMesh && !o.geometry.userData?.keep && !o.geometry.userData?.shared) o.geometry.dispose(); });
        for (const o of hidden) o.visible = false;
        this.flashlight.intensity = savedIntensity;
        this.space?.prewarm(this.renderer); // (every shader of space: the planets, the Sun, the rings, the stars)
        yield { of: this._pwOf };
        this.seeFx?.prewarm(); // («Visible Godi»: the cloud's shader)
        yield { of: this._pwOf };
        this.arenaDuels?.prewarm(); // (the lit places of a duel: three small shaders)
        yield { of: this._pwOf };
        this.divine?.fx2?.warm?.(); // (the card's point size: asked once here, not in a night flight)
        this.ultra?.prewarm(); // («Ультра качество»: the picture's glow, rays, mist and tone — even with it off: switched on later, no stutter)
        yield { of: this._pwOf };
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

    /**
     * Loading screen: what the first seconds of play would otherwise make in a frame — the long
     * sounds (SoundManager.warmAll) and the looks of Circle Attack and Inspirius (their shaders).
     */
    async warmUp(progress = () => {}) {
        try { await this.sound?.warmAll?.(progress); } catch (e) { console.warn('[Game] sounds warm-up', e); }
        // the slots' pictures of the things met most (and of what the hero carries now): made on the loading screen
        try { await this.itemIcons?.warmAsync(this._iconSamples()); } catch (e) { console.warn('[Game] icons warm-up', e); }
        // the ships of a harbour by the start: made and woken now (in play — up to 50 ms a frame each)
        try {
            const sh = this.ships;
            if (sh?.enabled && typeof sh._scan === 'function') {
                for (let i = 0; i < 60; i++) {
                    sh._scanT = 1;
                    sh._scan();
                    if (sh._scanT >= 1) break; // (nothing left for later)
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
        } catch (e) { console.warn('[Game] ships warm-up', e); }
        // (the Ice Castle's place and plan in this computer's world: a search over the land, made on first look —
        // the first frames of play froze on it)
        // (the world's one tower and the settlement by the start: found now — the minimap always shows them)
        try { const st = this.world?.terrain?.data; st?.towers?.only?.(); st?.villages?.spawnVillage?.(); } catch (e) { /* (only a head start) */ }
        try { this.world?.terrain?.data?.spiderDen?.(); } catch (e) { /* (the spider's cave in worlds with the places apart: made now, not in a frame of play) */ }
        try { void this.world?.terrain?.data?.iceCastle?.plan; } catch (e) { /* (only a head start) */ }
        try { if (this.circleAttack && !this.circleAttack._warmed) this.circleAttack._warm(); } catch (e) { /* (only a head start) */ }
        try { if (this.inspirius && !this.inspirius._warmed) this.inspirius._warm(); } catch (e) { /* (only a head start) */ }
        try { this.boom?.warm(); } catch (e) { /* (only a head start) */ }
        try { prepareStructure(); } catch (e) { /* (only a head start) */ } // (the buffers of the checks of the buildings — Structure.js)
        // (real trees: every shape made now — a few ms each; not over a new forest in flight)
        try { const f = this.world?.forest; if (f) for (const step of f.warmSteps()) { step(); await new Promise((r) => setTimeout(r, 0)); } } catch (e) { console.warn('[Game] trees warm-up', e); }
    }

    start() {
        this.active = true;
        this.lastTime = performance.now();
        this.inventory?.ensureStarterWand(); // (every wizard has a wand — the plain wooden one at least)
        // Creative: 100 coins in the pouch to start with (once; a world played before keeps its own coins). The pouch itself
        // every hero has from the start (Inventory.ensureStarterWand → CoinBelt.ensure), in every mode.
        if (this.config.mode === 'creative' && !this._startCoins && this.inventory?.purse) {
            this._startCoins = true;
            if (!this._playerRestored && this.inventory.coins() === 0) { this.inventory.purse.add(100); this.inventory._render?.(); }
        }
        this.heroApply.start(); // (Creative: the mana cells, the armour and robe, the dark level… from the world's settings)
        this.prewarm(); // (already done on the loading screen — prewarmAsync — then this does nothing)
        this.lastTime = performance.now(); // (the shaders compiled behind the loading screen are not the first frame's time)
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
            if (this.paused) { this.lastTime = performance.now(); this._draw(); return; }
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
        if (this.revealed === false) reason += ' (за экраном загрузки)'; // (main.js: not seen by the player)
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
            this.fpsNow = fps; // (the spell journal: how smooth the game was when a spell was refused)
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
        this.space?.beginFrame(); // (which world the hero is in: the Earth, space, another planet — Space.js)
        // off the Earth (space, another planet) the Earth's own life waits — unless this computer runs it
        // for other players still there (the host): then it goes on, without me in it (_playerPositions)
        const earth = !this.space?.offEarth || this._earthNeeded();
        if (earth && !this.duelOnly) {
            this.ships?.update(dt); // ships move first and carry everyone standing on them
            this.fleet?.update(dt);
            this.blackbeard?.update(dt); // (the black ship's mind: its course, its guns, its grapnels, its boarders)
        }
        this._updatePlayer(dt);
        this.imperius?.afterPlayer(dt); // («Империус»: the body asked for a walk — the creature walks; the body stays)
        this.ledge.update(dt); // (palms on a ledge's edge, pulled down: the body up — before the hands are stopped at the rock)
        this.handBlocks.update(); // (the arms posed: a hand at a counter or a wall stops on it — before anything is reached)
        this._updateChests(dt);
        if (!isTest) this._checkVictory();
        mark('игрок');

        this.darkLord.update(dt); // (the turning into a true dark mage: the rite holds the body in the air — before the character moves)
        this.levitation.update(dt);
        if (earth) this.levMax?.update(dt);
        else if (this.levMax?.swarm?.active) { this.levMax.swarm.release(false); this.levMax.mine = null; } // (off the Earth the things are let go)
        this.accio.update(dt);
        this.inventory.update(dt);
        this.itemIcons?.update(1.5); // (a new look's picture: one by one, ~1.5 ms a frame at most)
        this.builder.update(dt);
        this.swim.update(dt);
        if (earth) this.boards?.update(dt); // (before the items and the weapons: a hand on a board holds nothing else)
        this.items.update(dt);
        this.items.updateRemote();
        this.armor.update(dt);
        this.achievements.update();
        this.death.update(dt);
        this.books?.update(dt); // (after the items: an open book leaves the fist for both hands)
        this.loreLibrary?.update(dt); // (the books on the reading stands: their pages turned by a finger)
        if (earth) this.wards?.update(dt);
        this.houseMagic?.update(dt);
        this.castleMagic?.update(dt);
        this.divine?.update(dt);
        this.iceMagic?.update(dt);
        if (earth) this.ships?.rigging.updateBody(dt); // (hanging on a ship's rope ladder: the body where the hands hold)
        if (earth) this.ships?.helm.updateHands(); // (a hand on a ship's wheel sits on its rim; a free one never goes through it)
        this.scrolls.update(dt);
        this.wandMagic.update(dt);
        this.gear.update(dt);
        this.bleeding.update(dt);
        const duelOnly = this.duelOnly; // (the duel-only start: no animals, no roads' people, no zombies, no bosses — only the arena)
        if (earth && !duelOnly) this.animals.update(dt);
        if (earth) this.runner.update(dt);
        if (earth && !duelOnly) this.travelers?.update(dt); // (the people of the roads: before the people move — the riders sit where their cart is)
        if (earth && !duelOnly) this.carriages?.update(dt);
        if (earth) this.castleLife.update(dt);
        if (earth) this.arenaDuels?.update(dt); // (the duel arenas: after the people moved)
        if (earth) this.doors.update(dt);
        if (earth) this.locks.update(dt);
        if (earth && !duelOnly) this.campfires.update(dt);
        if (earth && !duelOnly) this.lanterns?.update(dt);
        if (earth && !duelOnly) this.cauldrons?.update(dt);
        if (earth) this.liquidation?.update(dt); // (what «Liquidation» crumbled stays gone when a house / a cave makes it again)
        this._heldPaperInFire(dt); // (a scroll or a book held in a fire burns)
        if (earth && !duelOnly) this.crystals?.update(dt);
        if (earth) this.beds.update(dt);
        if (earth) { this.houses.update(dt); this.buildingFx?.update(dt); }
        if (earth && !duelOnly) this.wizVillages?.update(dt);
        if (earth && !duelOnly) this.spiders.update(dt);
        if (earth && !duelOnly) this.dragons.update(dt);
        this.dragonRide.update(dt, earth);
        this.imperius.update(dt); // (after the creatures moved: the link, the mana, the passage of the mind)
        if (this.imperius.active || this.remotes.size) imperiusPulse(performance.now() / 1000); // (the white eyes breathe)
        if (earth && !duelOnly) this.iceCastle.update(dt);
        this.temple?.update(dt); // (the Gods' temple: on Venus)
        if (earth && !duelOnly) this.phoenixes.update(dt);
        if (earth && !duelOnly) this.owls.update(dt);
        if (earth && !duelOnly) this.canaries.update(dt);
        if (earth && !duelOnly) { this.spencers.update(dt); this.beslan.update(dt); }
        this.ghosts?.update(dt); // (everywhere: off the Earth / in the duel-only start it puts its ghosts away by itself)
        if (!duelOnly) { this.customCreatures?.update(dt); this.customPlants?.update(dt); } // (creatures of one's own: on the Earth and the planets with air)
        if (earth && !duelOnly) this.plants.update(dt);
        if (earth && !duelOnly) this.flora?.update(dt);
        if (earth && !duelOnly) { // (one system's fault must not end the game: the full stack goes to the console, the game goes on)
            try { this.gargoyles.update(dt); } catch (e) { if ((this._gargErr = (this._gargErr || 0) + 1) <= 5) console.error('[Gargoyles] update error', e); }
        }
        if (earth && !duelOnly) this.livingTrees.update(dt);
        this.focus.update(); // (death, a stun, the ice, a fall: what I hold stops; the mark on the screen)
        this._duckVoices();
        // (a duel going on or a charge flying at me: the duel's words are cast at once — NativeVoice.duelHot)
        if (this.voice?.native) this.voice.native.duelHot = !!(this._inDuel?.() || this.duel?.underFire?.());
        if (this.voice?.native && !this.voice.native.knows) this.voice.native.knows = (spell) => this.knowsSpell(spell);
        if (earth && !duelOnly) this.servants.update(dt);
        this.invis?.update(dt);
        this.sight?.update(dt);
        this.ghostCastle?.update(dt);
        this.groundVortex?.update(dt);
        this.visibleGodi?.update(dt);
        this.pentagranium?.update(dt);
        this.steam?.update(dt);
        this.fireworks?.update(dt);
        this.enchantCircles?.update(dt);
        this.united?.update(dt);
        this.vitality?.update(dt);
        if (earth && !duelOnly) this._updateCaves(dt);
        this.keeper?.update(dt);
        this.heroApply?.step(dt); // (Creative: the hero's chosen place to appear at — HeroApply.requestSpawn)
        this.storm.update(dt);
        this.sun.update(dt);
        this.sunContest?.update(dt);
        this._updateLightning(dt);
        this.waves.update(dt);
        this._updateBreakthrough(dt);
        this.duel.update(dt);
        this.strong.update(dt); // (after the duel: the held «Электром» is drawn with the charges' pools)
        this.duel.updateVisuals(dt);
        this.fire.update(dt);
        this.fireLights?.update(dt); // (after every fire asked for its light this frame)
        if (earth) this.burnWreck?.update(dt);
        this.weapons.update(dt, { allowGrab: !(this.combat.dead || this.isDeadLocal || this.imperius?.busy || this.imperius?.puppet) }); // (the dead don't take things; nor a body whose mind is elsewhere / held by another's — «Империус»)
        this.water.update(dt);
        this.crossedShield.update(dt);
        this.combat.update(dt);
        this.ghosts?.afterCombat(); // (a ghost's chill slows the legs: after Combat set their speed for this frame)
        this.vortex.update(dt);
        this.hellfire?.update(dt);
        this.smokeSwipe?.update(dt);
        this.burning?.update(dt);
        this.waterStorm?.update(dt);
        this.planetMagic?.update(dt); // (a planet held by «Wingardium Leviosa Super Maxima» follows the hand)
        this.planetDestroy?.update(dt); // («Planet Liquidation»: the warnings, the blast, the host taking the planet away)
        this.strikes.update(dt); // fists, slaps, pushes, shoves: real contact only
        mark('магия и оружие');
        if (this.playerAttackCooldown > 0) this.playerAttackCooldown -= dt;
        if (earth) this._updateZombies(dt);
        this.creatureImpact.update(dt); // (after every creature moved: their falls and staggers are drawn on top)
        this.weapons.checkHits(this.zombies.concat(this.plants.targets(), this.combat.enabled ? this.combat.meleeTargets() : [], this.animals.targets(), this.spiders.targets(), this.dragons.targets(), this.phoenixes.targets(), this.castleLife.targets(), this.spencers.targets(), this.livingTrees.targets(), this.ships ? this.ships.crew.targets() : [], this.owls.targets(), this.iceCastle.targets(), this.gargoyles.targets(), this.canaries.targets(), this.customCreatures.targets()), dt);
        this.dismember.update(dt);
        this.hurtFlash?.update(dt); // (a creature that lost HP glows red a moment — every computer sees it)
        mark('зомби');

        this.spells.update(dt);
        this._updateMagicGesture();
        this._updatePendingSpell();
        if (!isTest && earth && !duelOnly) this._spawnWaves(dt);

        for (const r of this.remotes.values()) r.update(dt, this.ships, this.space);
        this.voiceChat?.frame(dt); // (the players' voice chat: where each friend is heard, the «говорит» marks — VoiceChat.js)
        this.handBlocks.updateRemotes(); // (their hands neither go into the walls here)
        this.handHold.update(dt); // (hands holding hands: after the others' arms are set)
        this._keepBodiesApart(); // (again: the others have moved; before my place is sent)
        this.ships?.attach(); // (who stands on which ship now)
        if (this.sync) this.sync.update(dt);
        mark('мультиплеер');

        this.fx.update(dt);
        this.mana?.update(dt); // (the beaten wizard's power flying to me)
        mark('эффекты'); // (sparks, smoke, flashes — apart from «мир», the land and its pieces)
        // See further while flying (smoothly), terrain streams in around the player
        this._viewBoost = (this._viewBoost || 0) + ((this.flight.active ? 1 : this.monster?.viewBoost || 0) - (this._viewBoost || 0)) * Math.min(1, dt * 0.8); // (a 24 m monster sees further too)
        // (in space no ground is streamed: the land is where it was — Space.js streams the place it falls to)
        // («Империус»: the eyes are in the creature, up to 1800 m off — the world streams round it, not round the body left standing)
        const focus = this.imperius?.focusPos?.(this._focusV || (this._focusV = new THREE.Vector3())) || this.character.group.position;
        if (!this.space?.inSpace) this.world.update(focus, this._viewBoost);
        this.world.forest?.update(dt, this.character.group.position, this.camera); // (the real trees — Trees.js)
        this.swim.applyFog(); // (under the water: murky and blue)
        this.world.terrain?.data?.settling?.step(SETTLE_MS); // (what the last changes left too weak gives way: Structure.js)
        this.falling?.update(Math.min(0.05, dt));
        this.destruction?.update(Math.min(0.05, dt));
        this.circleAttack?.update(dt);
        this.inspirius?.update(dt);
        this.boom?.update(dt);
        if (this.dayCycle && this.frameCount % 15 === 0) this.world.setDayPhase(this.dayPhase());
        this.world.followShadow(focus, this._viewBoost, (this._shadowLook || (this._shadowLook = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(this.camera.quaternion));
        this.seaSurface?.update(dt, focus);
        this.space?.afterWorld(dt); // (the sky, the light and the air of space / another planet; the breathing; the Sun's heat)
        this.space?.uploadStep(); // (a planet's map from the worker: one a frame to the video card)
        if (this.frameCount % 60 === 7) { this.space?.checkUnlock(); if (this.frameCount > 900 && this.space?.knows()) this.space.prepare(); }
        mark('мир');
        this._updateCamera(dt);

        // (the sounds made on first use: made ahead, one every half second, after the first seconds of play)
        if (!this._soundsWarm && this.frameCount > 240 && this.frameCount % 30 === 0) this._soundsWarm = !(this.sound?.prewarmStep?.() ?? false);
        // (the castles and towers ahead: made a little a frame before the minimap and the people want them)
        if (this.frameCount % 3 === 1 && !this.duelOnly) { // (the duel-only start: no far sites are planned, no minimap drawn — only the arena)
            const wp = this.character.group.position, vil = this.world.terrain?.data?.villages;
            this.world.terrain?.warmSites?.(wp.x, wp.z, 900 + CASTLE_CELL, CASTLE_CELL);
            // (a wizards' settlement may be further: look as far as the nearest known one — the workers make the cells)
            const reach = vil ? Math.min(2200, vil.mapReach(wp)) : 0;
            if (reach > 900 + CASTLE_CELL) this.world.terrain?.warmSites?.(wp.x, wp.z, reach, CASTLE_CELL);
        }
        if (this.frameCount % 5 === 0 && this.space?.inSpace) this.space.drawMap(this.hud); // (the map of the Solar System)
        else if (this.frameCount % 5 === 0 && !this.duelOnly) {
            const cp = this.character.group.position;
            const others = [...this.remotes].filter(([id, r]) => !r.dead && !this.invis?.hidden(id)).map(([, r]) => r).map((r) => ({ x: r.position.x, z: r.position.z, name: r.name, color: r.color }));
            // on a server: its name on the map and a mark at its start point
            const online = this.net && this.net.active;
            const server = online && !this.space?.offEarth ? { name: (this.net.isHost ? this.net.info?.name : this.net.serverName) || 'Сервер', players: this.remotes.size + 1, home: this.world.mapResult?.playerSpawn || { x: 0, z: 0 } } : null;
            const castleIdx = this.world.terrain?.data?.sites || this.world.terrain?.data?.castles; // (castles and wizards' towers)
            let castles = castleIdx && !this.space?.offEarth ? castleIdx.nearestForMap(cp) : [];
            if (this.iceCastle?.mapMark && !this.space?.offEarth) castles = castles.concat([this.iceCastle.mapMark]); // (the Ice Castle: only once seen)
            if (this.space?.offEarth) castles = this.space.mapMarks(); // (on another planet: its own marks — the Gods' temple on Venus)
            // (in a cave: the cave as far as the hero has seen it — CaveMap.js)
            const cave = this._inCave ? { mem: this.caveMap, L: Math.floor(cp.y + 1.51), data: this.terrain.data, chests: this.chests.filter((c) => c.cave != null), crystals: this.crystals?.clusters } : null;
            const hm = this.houseMagic, me = hm && !this.space?.offEarth ? hm._key('local') : null;
            const houses = me ? [...hm.list.values()].map((h) => ({ x: h.x, z: h.z, mine: h.owner === me })) : [];
            this.hud.drawMinimap(cp, this.character.group.rotation.y, this.world, this.zombies, others, server, castles, cave, houses);
            if (this.sound && this.sound.loaded) this.sound.updateAmbient(cp, this.zombies, dt * 5);
        }

        this.quality.update(deltaTime);
        const logic = performance.now() - t0;
        this.stats.logicMs = (this.stats.logicMs || logic) * 0.95 + logic * 0.05;
        if (logic > (this.stats.worstLogicMs || 0)) this.stats.worstLogicMs = logic;

        mark('прочее');
        this.ultra?.update(deltaTime); // («Ультра качество»: nothing when off)
        for (const f of this._handOnes || []) f.check(); // (a finger hidden, a thing taken into the hand: the hand's one shape follows)
        updateFarBatches(this.scene, this.renderer, dt); // (people, animals, bodies, things of one look near each other: one draw — FarBatch)
        if (!this.space?.render()) this._draw(); // (space: its own picture first — Space.render)
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
            ch.setStoop(flying || down || this.animals?.riding || this.dragonRide?.busy || this.boards?.mounted ? 0 : pose.stoop); // (bent a little: lower — under a low roof, StoopReader)
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

        if (this.space?.handles) this.space.update(dt, pose); // (the climb to space, space, the fall back: Space.js)
        else if (flying) this._updateFlight(dt, pose);
        if (iced) ch.setRunning(false);
        this._jumpStep(pose);
        this.steady.step(dt);
        this.darkExile.update(dt);
        this.monster.update(dt); // (the monster form: the size, the clock, the steps, the fists — before the body walks)
        if (this.dark.skin !== this._darkShown) { this._darkShown = this.dark.skin; this.character?.setDarkLevel?.(this.dark.skin); } // (метки тьмы на моём теле)
        this.imperius?.input(dt); // («Империус»: the walk, the turn, a jump, a blow — the creature's; the body's own legs stop)
        const walkFromX = ch.group.position.x, walkFromZ = ch.group.position.z;
        ch.update(dt, this.collision, !flight.active && !this.animals?.riding && !this.dragonRide?.busy && !this.spiders?.held && !this.beds?.lying && !this.levitation.lifted && !this.darkLord.lifting && !this.boards?.mounted && !this.ships?.rigging.climbing && !this.ledge?.active); // (on a rope ladder, on a ledge's edge the hands hold the body)
        this._snowSteps(ch);
        // a fast run on a slow frame: the step is walked in short pieces against the walls, so a
        // thin wall or a door is never jumped over between two frames (the push-out below decides the rest)
        const walkDX = ch.group.position.x - walkFromX, walkDZ = ch.group.position.z - walkFromZ;
        const walkD = Math.hypot(walkDX, walkDZ);
        if (walkD > 0.25 && walkD < 5 && !flight.active && !this.beds?.lying && !this.boards?.mounted) {
            const n = Math.ceil(walkD / 0.25);
            ch.group.position.x = walkFromX; ch.group.position.z = walkFromZ;
            for (let i = 0; i < n; i++) {
                ch.group.position.x += walkDX / n; ch.group.position.z += walkDZ / n;
                this._resolveMe(ch.group.position);
            }
        }

        // Explosion knockback (decays; a body lying on the ground slides less far) — in short steps
        // against the walls: a blast throws the body at the rock, never into it (a cave, a house)
        if (this.knockback.lengthSq() > 0.0001) {
            const n = Math.max(1, Math.ceil(this.knockback.length() * dt / 0.25));
            const solid = !flight.active && !this.beds?.lying && !this.boards?.mounted;
            for (let i = 0; i < n; i++) {
                const was = _v1.copy(ch.group.position);
                ch.group.position.addScaledVector(this.knockback, dt / n);
                if (!solid) continue;
                this._resolveMe(ch.group.position);
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
            this._resolveMe(ch.group.position);
            // a market counter: the body stays a little before it, where the hands reach its top (CastleTalk)
            if (this.castleLife?.talk?.keepOffCounters?.(ch.group.position, PLAYER_RADIUS, this._feetY(ch.group.position))) this._resolveMe(ch.group.position);
            // never inside the rock (tossed up under an overhang, the walls' push would carry the body
            // on through the stone, block by block): back where it last stood free
            if (this._bodyInRock(ch.group.position)) {
                if (this._lastFree && this._lastFree.distanceToSquared(ch.group.position) < 400) { ch.group.position.copy(this._lastFree); this.knockback.set(0, 0, 0); if (ch.verticalVelocity > 0) ch.verticalVelocity = 0; }
            } else (this._lastFree || (this._lastFree = new THREE.Vector3())).copy(ch.group.position);
            ch.roofNeed = this._roofNeed(ch.group.position); // (rock right over the head: the body stays low under it)
        } else ch.roofNeed = 0;
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
                    this._resolveMe(me);
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
            c.fatigue = Math.max(0, c.fatigue - (flight.hovering ? FLIGHT.HOVER_COST : FLIGHT.COST) * dt);
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
        const ceil = flight.fast ? this.space.fastCeiling(p) : 110; // («Flying Maxima»: higher, up to where the sky ends — Space.fastCeiling)
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dist), Math.abs(climb)) / 0.5)); // (every half metre: even at 160 m/s no ridge is jumped)
        for (let i = 0; i < steps; i++) {
            const px = p.x, py = p.y, pz = p.z;
            p.x += fx * dist / steps;
            p.z += fz * dist / steps;
            p.y = Math.min(ceil, p.y + climb / steps);
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
        return this.knowsSpell('Flight');
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

    /** Does the hero know this spell? One answer for everything (SpellBook.js: what is known from the start, the rest from scrolls and books). */
    knowsSpell(name) {
        if (name === 'Pentagranium') return this.pentagranium.known().length > 0; // (no spell of its own: each pentagram is learnt by burning ITS scroll; Creative knows all)
        return knowsSpellOf(SAME_SPELL[name] || name, { mode: this.config.mode, hero: this.config.mode === 'creative' ? this.hero : null, spells: this.bonus?.spells, learned: this.books?.learned, flight: this.bonus?.flight });
    }

    /** Can the hero say this spell now (the pause menu's spell book outside Creative)? The same checks the cast makes. */
    canSaySpell(name) {
        if (!name) return false;
        if (name === 'FlyingMaxima') return this.knowsFlight() && this.knowsSpell(name);
        return this.knowsSpell(name);
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
        this._zdt = dt;
        const ch = this.character;
        const charPos = ch.group.position;
        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            // («Империус»: a mind in it — mine drives it, a guest's is drawn where it is — ImperiusControl.step)
            if (z.imp && (this.authority || z.imp.mine) && this.imperius?.step('z', z, dt)) { if (z.removable) this.removeZombie(z); continue; }
            if (!this.authority) {
                // Multiplayer guest: the host moves zombies; we only animate them
                // and report our own punches.
                z.updateRemote(dt, this.camera);
                if (z.isDead && z.removable) { this.removeZombie(z); continue; }
                continue; // (my fists: BodyStrikes — only a real blow that reaches the body)
            }
            // held up by «Вингардиум Левиоса»: Levitation carries it (it can't walk or bite)
            if (z.lev) { z._spinHalo?.(dt); continue; }
            const zland = this.terrain?.data; // (its land is not made yet — the workers bring it: it waits, instead of making the ground here in a frame)
            if (zland?.landMade && !zland.landMade(z.group.position.x, z.group.position.z)) continue;
            const target = z.dummy ? null : this._zombieTarget(z);
            if (!z.steer) z.steer = (me, p, ux, uz, d, speed, sdt) => this._zombieStep(me, p, ux, uz, d, speed, sdt);
            if (this._zombieSwim(z, dt)) continue; // (in deep water: up at the top, paddling to the bank — not along the bottom)
            z.update(dt, target ? target.pos : null, this.camera, this.collision);
            if (z.dummy && this.dummyHome && !z.isDead && !z.isFrozen && !z.isStunned && !(z.stunTimer > 0)) { // (a guest has the host's dummy, not its place: the frame broke on every frame)
                // pushed by a blow, it steps back to its place (stands on the spot)
                const hm = this.dummyHome, k = Math.min(1, dt * 4);
                z.group.position.x += (hm.x - z.group.position.x) * k;
                z.group.position.z += (hm.z - z.group.position.z) * k;
            }
            if (z.removable) { this.removeZombie(z); continue; }
            if (z.isDead || z.isSleeping) continue;

            this.collision.resolveCylinder(z.group.position, ZOMBIE_RADIUS * z.sizeK, z.group.position.y - z.gOff, 3.5 * z.sizeK, 1.05);
            // (a player's shield / dome: it presses against it, never in — ShieldWalls.js)
            const zw = wardsOf(this);
            if (zw.length) {
                const zp = z.group.position, o = this._wardZ || (this._wardZ = { x: 0, y: 0, z: 0 });
                o.x = zp.x; o.y = zp.y - z.gOff; o.z = zp.z;
                if (pushOut(o, ZOMBIE_RADIUS * z.sizeK, zw, 1)) { zp.x = o.x; zp.z = o.z; }
            }

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


            // in the sunlight by day: it smokes and burns down to ash (ZombieSpawn.inSunlight)
            this._zombieSun(z, dt);
            if (z.isDead) continue;

            // Its blow (ZOMBIE): it comes up close, turns its face to the target, raises its arms and brings
            // them down — the blow lands when the arms come down, if the target is still there (step back — missed).
            // Whom: a servant of «Брейнрот» — the zombie / creature its master set it on; the others — the
            // players (and a servant zombie close by). Bites hurt in «Выживание», «Хардкор» and the maps;
            // in «Творческий» nobody is hurt (damageLocalPlayer), but it still swings.
            z.pace = target?.wander ? 0.45 : 1; // (wandering: a slow shamble)
            if (!target || target.follow || target.wander) continue;
            const reach = target.zombie || target.foe ? 0.3 : 0;
            z.attackCd = Math.max(0, (z.attackCd || 0) - dt);
            if (!z.isAttacking && z.attackCd <= 0 && z.reaches(target.pos, reach - 0.3)) { // (it starts the swing well in reach)
                z.attackCd = ZOMBIE.EVERY;
                z.triggerAttack();
            }
            if (!z.struck) continue;
            z.struck = false;
            if (!z.reaches(target.pos, reach + 0.3)) continue; // (it stepped back in time)
            if (confusedMiss(z)) continue; // (lost in Accentric's haze: the blow goes past — StrongSpells)
            const dir = _v1.subVectors(target.pos, z.group.position).setY(0).normalize().clone();
            if (target.zombie) {
                target.zombie.damageCooldown = 0;
                this.damageZombie(target.zombie, z.isThrall ? 2 : 1, false, dir, z.isThrall ? z.thrallOwner : null);
            } else if (target.foe) this.servants.damage(target.foe, 2, dir, z.thrallOwner);
            else if (target.id === this.localId) this.zombieHitsMe(dir);
            else if (this.sync) this.sync.bite(target.id, dir);
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
        if (!this.authority || this.config.map || this.duelOnly) return;
        this._updateDummy(dt);
        this._updateTestDragon(dt);
        this.zombieSpawn?.update(dt); // (zombies out of the dark: caves, the night — ZombieSpawn.js)
        if (this.config.mode === 'creative') {
            const desired = this.config.zombieCount || 0;
            let live = 0;
            for (const z of this.zombies) if (!z.isDead && !z.dummy) live++;
            // (the slider: how many there may be — but they too come only out of the dark: a cave, the night;
            // by day on the open ground none comes, as in «Выживание» — ZombieSpawn.trySpawn)
            const zs = this.zombieSpawn;
            if (zs && live < desired && !(zs._gap > 0) && Math.random() < 0.02 && !this.isDeadLocal && zs.trySpawn(this.character.group.position, undefined, undefined, true)) zs._gap = ZSPAWN.GAP[0] + Math.random() * (ZSPAWN.GAP[1] - ZSPAWN.GAP[0]); // (one at a time, as in «Выживание»)
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
            _v1.copy(this.cameraOffset).multiplyScalar(ch.size || 1).applyAxisAngle(_v2.set(0, 1, 0), ch.group.rotation.y).add(ch.group.position);
            this.camera.position.lerp(_v1, frameAlpha(0.1, dt));
            _v2.copy(ch.group.position).add(_v1.set(0, 2 * (ch.size || 1), 0));
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
        if (this.config.mode !== 'test' && !this.imperius?.viewing) this._cameraOutOfRock(ch);
        this.imperius?.camera(this.camera, dt); // («Империус»: the creature's eyes — or the way there along the light)
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
        const S = ch.size || 1; // (the monster form ×7: MonsterForm.js)
        const f = p.y - (PLAYER_GROUND_OFFSET - CROUCH.DROP * (ch.lowK || 0)) * S;
        if (!ch.onGround || ch.swimY != null || this.flight?.active || this.ledge?.active) return f;
        return Math.max(f, Math.min(ch.groundY, f + 1.05 * S));
    }

    /** Walking on snow: a soft crunch at every step (a step is ~0.8 m walking, longer running). */
    /**
     * A real jump (JumpReader: the whole body went up in the picture): the hero jumps as high as
     * the person did (and the planet's gravity lets) — not in flight, in water, lying, stunned, in a
     * bed, on a horse (a jump by a horse gets on it: Animals), hanging on a ledge or a rope ladder.
     * The landing: a little shake and a thud (a hard one knocks over — Knockdown).
     */
    _jumpStep(pose) {
        const ch = this.character, J = pose?.jump;
        if (J && J.jumps !== this._jumpSeen) {
            const first = this._jumpSeen == null;
            this._jumpSeen = J.jumps;
            const busy = this.flight.busy || ch.swimY != null || ch.swimming || this.knock.down || this.knock.flyT > 0
                || this.combat.immobile || this.isDeadLocal || this.beds?.lying || this.animals?.riding || this.animals?.horseNear?.() || this.dragonRide?.busy || this.dragonRide?.mountable?.()
                || this.spiders?.held || this.levitation.lifted || this.boards?.mounted || this.ships?.rigging.climbing || this.ledge?.active || this.imperius?.busy || this.imperius?.puppet
                || (this.config.mode === 'test' && this.testState === 'setup');
            const went = !first && !busy && ch.onGround && ch.jump(J.strength);
            if (went) { this._jumpAt = J.at; this._jumpOnto(); }
            if (!first) this.perf?.note(`прыжок: сила ${J.strength.toFixed(2)}, ${went ? 'прыгнул' : `не прыгнул (${busy ? 'занят' : ch.onGround ? 'мало силы' : 'не на земле'})`}${went && (ch.jumpVel.x || ch.jumpVel.z) ? `, толчок к уступу ${Math.hypot(ch.jumpVel.x, ch.jumpVel.z).toFixed(1)}` : ''}`); // (the journal: why a jump did not work)
        } else if (J && J.air && ch.jumpAir && J.at === this._jumpAt) ch.jumpBoost(J.strength); // (it went up higher)
        const L = ch.landing;
        if (L && L.at !== this._landSeen) {
            this._landSeen = L.at;
            if (L.drop > 0.3 && ch.swimY == null) {
                this.fx.shake = Math.max(this.fx.shake || 0, Math.min(0.35, 0.06 + L.speed / 45));
                this.sound?.playLand?.(Math.min(1, 0.3 + L.speed / 14));
            }
        }
    }

    /**
     * A jump right in front of a ledge (a wall of up to two blocks, room on its top): the hero
     * jumps up onto it, forward with the jump as a person does — the legs push off towards it.
     * Too low a jump: the rock stops the body (Collision) and it lands back where it stood.
     */
    _jumpOnto() {
        const ch = this.character, T = this.collision?.terrain, p = ch.group.position;
        if (!T?.topLayer || Math.hypot(ch.jumpVel.x, ch.jumpVel.z) > 2 || (ch.size || 1) > 1.01) return; // (a run carries it on already; a monster steps over by itself)
        const push = ledgePush(T, p.x, p.z, p.y - PLAYER_GROUND_OFFSET, ch.group.rotation.y, PLAYER_RADIUS);
        if (push) { ch.jumpVel.x = push.x; ch.jumpVel.z = push.z; }
    }

    _snowSteps(ch) {
        const p = ch.group.position, last = this._stepAt || (this._stepAt = p.clone());
        const d = Math.hypot(p.x - last.x, p.z - last.z);
        if (!ch.onGround || ch.swimY != null || d > 4) { last.copy(p); return; }
        if (d < 0.8 + 0.5 * (ch.runIntensity || 0)) return;
        last.copy(p);
        const data = this.terrain?.data;
        if (data && data.get(Math.round(p.x), Math.round(ch.groundY + 0.5), Math.round(p.z)) === BLOCK.SNOW) this.sound?.playSnowStep?.(ch.isCrouching ? 0.5 : 1);
    }

    _bodyInRock(p) {
        const T = this.terrain;
        if (!T?.solidIn) return false;
        const feet = this._feetY(p);
        // (over a step it stands on: from that step's top — the walls' test does the same, Collision)
        const S = this.character.size || 1;
        const ix = Math.round(p.x), iz = Math.round(p.z), reach = Math.floor(feet + 1.05 * S + 0.5 + 1e-9);
        const stand = T.floorBelow ? Math.max(feet, T.floorBelow(ix, iz, reach) - 0.5) : feet;
        return T.solidIn(ix, iz, reach + 1, Math.floor(stand + (this.character.bodyHeight?.(true) ?? BODY_H) + 1.5 - 1e-3));
    }

    /** My body out of the walls (bent down: lower — Character.bodyHeight; the head ducks a little under rock). */
    _resolveMe(p) {
        const ch = this.character;
        // (another player's «Protection» — his shield, his dome: solid, I don't walk through it — ShieldWalls.js)
        const w = wardsOf(this);
        if (w.length) {
            const o = this._wardP || (this._wardP = { x: 0, y: 0, z: 0 });
            o.x = p.x; o.y = this._feetY(p); o.z = p.z;
            if (pushOut(o, PLAYER_RADIUS * (ch.size || 1), w, 1, 'me')) { p.x = o.x; p.z = o.z; }
        }
        // (the monster form: its body first smashes what it can — walls, fences, trees — and what stays is a wall: MonsterTransform)
        if (this.monster?.active) this.monster.smashAt(p);
        const S = ch.size || 1;
        return this.collision.resolveCylinder(p, PLAYER_RADIUS * S, this._feetY(p), ch.bodyHeight?.() ?? BODY_H, (1.05 + (ch.jumpAir ? JUMP_ASSIST : 0)) * S, true, ch.bodyHeight?.(true) ?? BODY_H);
    }

    /**
     * How much lower (0…1, × CROUCH.DROP) the rock right over the body keeps it: the columns under
     * the body (Collision lets it in under rock a bent body fits under), each from the floor it
     * would stand on there. Character.update keeps the body that low — it cannot stand up into it.
     */
    _roofNeed(p) {
        const T = this.terrain, ch = this.character;
        if (!T?.ceilingAbove || !T.floorBelow || !ch.onGround || ch.swimY != null || (ch.size || 1) > 1.01) return 0; // (a monster does not stoop: it breaks the roof)
        const feet = this._feetY(p), reach = Math.floor(feet + 1.05 + 0.5 + 1e-9), r = PLAYER_RADIUS - 0.02;
        let need = 0;
        for (let iz = Math.round(p.z - r); iz <= Math.round(p.z + r); iz++) {
            for (let ix = Math.round(p.x - r); ix <= Math.round(p.x + r); ix++) {
                const dx = Math.max(ix - 0.5 - p.x, 0, p.x - ix - 0.5), dz = Math.max(iz - 0.5 - p.z, 0, p.z - iz - 0.5);
                if (dx * dx + dz * dz >= r * r) continue; // (the body is not over this column)
                if (T.topLayer && T.topLayer(ix, iz) <= reach) continue; // (open sky)
                const L = T.ceilingAbove(ix, iz, reach + 1);
                if (L === Infinity) continue;
                const stand = Math.max(feet, T.floorBelow(ix, iz, reach) - 0.5);
                need = Math.max(need, (BODY_H - (L - 1.5 - stand)) / CROUCH.DROP);
            }
        }
        return Math.max(0, Math.min(1, need));
    }

    /**
     * The eye never inside the rock (thrown against a cave wall, lying with the head at the rock,
     * a shake, the camera behind the back in a tunnel): it comes in towards the body until clear.
     */
    _cameraOutOfRock(ch) {
        const t = this.terrain?.data;
        if (!t?.raycast) return;
        const from = _v2.copy(ch.group.position);
        from.y += (this.knock?.down ? 0.4 : 1.2) * (ch.size || 1);
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
        this.voiceChat?.dispose(); // (the calls end, the microphone is let go)
        this.voiceChat = null;
        this.monster?.dispose(); // (leaving: the form taken off first — the man's place and health are saved)
        this.ships?.dispose();
        this.inventory?.dispose();
        this.books?.dispose();
        this.scrolls?.dispose();
        this.swim?.dispose();
        this.seaSurface?.dispose();
        this.steam?.dispose();
        this.groundVortex?.dispose();
        this.seeFx?.dispose();
        this.ultra?.dispose();
        this.items?.dispose();
        this.wandMagic?.dispose();
        this.vortex?.dispose();
        this.hellfire?.dispose();
        this.burning?.dispose();
        this.waterStorm?.dispose();
        this.gear?.dispose();
        this.bleeding?.dispose();
        this.animals?.dispose();
        this.castleLife?.dispose();
        this.death?.dispose();
        this.doors?.dispose();
        this.boards?.dispose();
        this.campfires?.dispose();
        this.lanterns?.dispose();
        this.cauldrons?.dispose();
        this.crystals?.dispose();
        this.houses?.dispose();
        this.buildingFx?.dispose();
        this.beds?.dispose();
        this.spiders?.dispose();
        this.dragons?.dispose();
        this.iceCastle?.dispose();
        this.temple?.dispose();
        this.fleet?.dispose();
        this.blackbeard?.dispose();
        this.travelers?.dispose();
        this.carriages?.dispose();
        this.phoenixes?.dispose();
        this.owls?.dispose();
        this.canaries?.dispose();
        this.spencers?.dispose();
        this.ghosts?.dispose();
        this.beslan?.dispose();
        this.sight?.dispose();
        this.ghostCastle?.dispose();
        this.customCreatures?.dispose();
        this.customPlants?.dispose();
        this.plants?.dispose();
        this.flora?.dispose();
        this.gargoyles?.dispose();
        this.livingTrees?.dispose();
        this.servants?.dispose();
        this.circleAttack?.clear();
        this.inspirius?.clear();
        this.boom?.dispose();
        this.planetDestroy?.dispose();
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
            space: this.space ? { state: this.space.state, realm: this.space.realm, P: { ...this.space.P }, speed: this.space.speed, knows: this.space.knows() } : null,
            stats: { ...this.stats, fx: { sparks: this.fx.sparks.active, debris: this.fx.debris.active } },
        };
    }
}

/** Convert a per-frame blend factor (at 60 FPS) to this frame's duration. */
function frameAlpha(alpha, dt) {
    return 1 - Math.pow(1 - Math.min(1, alpha), Math.min(0.1, dt) * 60);
}
