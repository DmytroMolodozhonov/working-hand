/**
 * Combat.js — the «Свободный мир» rules: players fight each other with spells.
 *
 *   Health      20 HP (red bar at the top), like on the maps. Every spell hurts players too.
 *               At 0 HP you are out: back to the menu.
 *   Mana        30 points (the bar at the bottom, «Мана»; in the code still
 *               `fatigue`), +1 per second. Every spell costs mana; without
 *               enough the spell fails. The maximum grows: see Mana.js.
 *   Protection  arm stretched out + «Protection»: a blue shield in front of
 *               the hand. 5 mana at once, then it holds while there is mana:
 *               0.5 a second, none comes back meanwhile. A sharp jerk of the
 *               shield arm or «стоп» puts it out sooner. It is bound to the hand
 *               it was cast with: another spell cast from that hand (the wand
 *               hand) breaks it — hold it with the other hand and cast with the wand.
 *               Spells cast straight at you bounce off it; a Bombardo blast next
 *               to you still hurts, but half as much.
 *   Protection Maxima  arms out in a T + «Protection Maxima»: a dome around
 *               the whole body (blast damage −75 %): 20 mana at once, then 1 a
 *               second until «стоп» or the mana is gone. Not bound to a hand.
 *   Every spell a shield (hand or dome) stops costs its holder HALF of that
 *   spell's own mana (shieldHitCost: «Авада Кедавра» 25 → 12.5). Not enough
 *   mana left: the shield shatters and that spell goes on through as if there
 *   were no shield. Arrows (and other things flying) bounce off it (ShieldBounce.js)
 *   — they cost no mana. Shields work and are visible in every mode;
 *   HP/mana rules only in the free world.
 *   Freezing    the ice beam freezes players too (5 s in the beam, keep
 *               running and it breaks). A frozen player can't move or cast
 *               for 20 s — and ANY hit shatters them, whatever their HP.
 *
 * Every computer decides about its OWN player (it knows exactly where it
 * stands, where its shield points, whether it is frozen): spells are
 * replayed on every machine anyway, so a hit costs no extra network traffic.
 * Melee hits on other players are sent to them ('phit').
 */

import * as THREE from 'three';
import { sharpJerk } from './Jerk.js';
import { spellPush } from './Impact.js';
import { DAMAGE, blastDamage } from './Damage.js';
import { SLOW } from './Slow.js';
import { regenCellsK, regenTier, regenLine } from './ManaRegen.js';
import { PGODS, isDivine, isMagicKind, godsKeepsOff, ALL_ROUND, payDivine, BREAKS_GODS } from './ProtectionGods.js';

export const PVP = {
    MAX_HP: 20,
    MAX_FATIGUE: 30,
    FATIGUE_REGEN: 1, // per second
    SHIELD_HOLD_MAX: Infinity, // s a «Protection» / its dome holds where there is no mana to spend (Creative): until «стоп»
    SHIELD_DRAIN: 0.5, // mana a second a held «Protection» takes
    DOME_DRAIN: 1, // … and «Protection Maxima»
    SHIELD_SCALE: 1.5, // the hand shield's size (m; 30 % bigger than it was: 1.15)
    DOME_R: 2.6, // the dome's radius (m)
    BEAM_GAP: 1.5, // s: a flame / a beam held on the shield is one spell (paid once) until it stops this long
    FREEZE_TIME: 20,
    CHILL_TIME: 5, // s in the ice beam to freeze
    INFERNO_TICK: 0.6, // s between Inferno damage ticks
};

/** Fatigue cost of each spell (stronger = more tiring). */
export const SPELL_COST = {
    Protection: 5,
    ProtectionMaxima: 20,
    ProtectionGods: 100, // the gods' shield: then 3 a second while it holds (ProtectionGods.js; the author: 100 + 3)
    ProtectionGodsMaxima: 300, // … its dome: then 5 a second (the author: 300 + 5)
    Bombardo: 15,
    BombardoMaxima: 25,
    Thunderwave: 40, // (the author: very strong — 40 a cast; it hits everyone in the zone at once)
    Sapira: 20,
    Inferno: 10,
    Fire: 4, // a campfire
    Firefighting: 5, // a burst of water: puts fire out (Firefighting.js)
    FirefightingMaxima: 20, // … a hose held 5 s: it drowns even the Hellfire
    Unfurl: 6, // a ship's sails let down (all of them at once)
    Furl: 3, // rolled up
    Ice: 5, // «Айс» = «Frozen» (one spell): a charge — 10 s in ice, −3 HP/s (StrongSpells.js)
    IceMaxima: 20, // «Айс Максима» = «Frozen Maxima»: −10 HP/s, at the part of the body pointed at
    Sands: 8,
    Flight: 10,
    Up: 7, // get up / leap out of the water
    Waterball: 5,
    Maxima: 4,
    WaterForming: 5,
    Frozen: 5,
    Levitation: 6,
    LevitationMaxima: 50, // «Вингардиум Левиоса Максима»: 50 at once, then 2 a second while it holds (LevitationMaxima.js)
    Accio: 5,
    Alohomora: 5, // a lock opens (Alohomora.js)
    Lock: 3, // an open door shuts and locks (Alohomora.js: Lock)
    AlohomoraMaxima: 25, // … a strong lock: the gates of a throne room
    Wind: 8,
    Brainrot: 15,
    BrainrotMaxima: 30, // «Brain Rot Maxima» (the dragons — DragonTame.js): once to cast, then 0,5 a second to hold it
    LightningStrike: 25,
    ToTheSun: 12,
    GiveMyPower: 50, // your power back from your own skeleton (Legacy.js; the author: 50)
    CreatePlanet: 500, EnlargePlanet: 100, TerraformPlanet: 1000, LevitationSuperMaxima: 100, // the gods' scrolls (PlanetMagic.js; the author: 500, 100, 1000; the Super Maxima then 3 a second)
    LetItRain: 20,
    Earthquake: 10,
    EarthquakeMaxima: 25,
    WindMaxima: 20,
    Overgrown: 10, // creatures thrown apart (Overgrown.js)
    OvergrownMaxima: 20,
    Stupefy: 12,
    Expelliarmus: 12, // the wand flies out of the target's hand (Expelliarmus.js)
    Disarmor: 12, // the plain steel flies off the target (Armor.js)
    SuitUp: 5, // all the armour on at once (Armor.js; known without a scroll)
    Jolt: 5, // a bolt of air: the target is thrown back and falls (Duel.JOLT)
    JoltMaxima: 15, // … three times as strong (and three times the cost)
    ProtectionHouse: 20, // a house's sphere of protection (HouseWards.js)
    WardGrow: 3, // … each metre its dome grows while the hand is on it (1 m a second; «Maxima»: 2)
    ProtectionInvisible: 15, // the protected house is not seen from far
    WardDispel: 5, // takes down my own sphere (twice said)
    ProtectionHouseGrant: 5, // a friend may come into the house
    StrengthenHouse: 5, // «Strengthen House»: the least to begin — then 5 a second while the beam feeds the sphere (nothing at once; HouseWards.js)
    AvadaKedavra: 25,
    // the strong duel spells (StrongSpells.js)
    Accentric: 50, // «Акцентрик»: the haze — −40 over 8 s, a minute lost
    Pilbidrio: 100, // «Пилбидрио»: −80, the body burst at ≤ 80
    Electrum: 50, // «Электром»: then 3 a second while the lightning is held
    Die: 1000, // «Дай»: the gods' — +10 a second while its beam fights in a clash
    WaveAttack: 8,
    WaveAttackMaxima: 18,
    AirBubble: 4,
    AirBubbleMaxima: 10,
    Hammer: 7,
    Breakthrough: 10,
    BreakthroughMaxima: 20,
    Lumos: 2,
    LumosMaxima: 4,
    LumosFlashlight: 3, // (the Lumos' modes: once)
    LumosAhead: 3,
    LumosFollowing: 15, // (then 0.1 a second: WandMagic.FOLLOW)
    CreateBed: 6,
    CreateHouse: 20, // a house by magic: then 0.5 a second for its 10 s (HouseMagic.js; each level of «Improve a House» twice as much)
    CreateCastle: 500, // a whole castle by magic, at once (CastleMagic.js pays it itself; Creative: free)
    ImproveHouse: 40, // (level 2; 80, 160, 320 for the next — HouseMagic pays it itself)
    ChangeColor: 2,
    WaterVortex: 25, // very strong: a whole vortex of water (see WaterVortex.js)
    VortexBubble: 0, // «Bubble» on the one the vortex hit: part of the vortex (already paid)
    FireMaxima: 20, // the only way out of the vortex's ice
    Snowman: 30, // a friendly snowman out of snow (instant; nobody's — IceQueen.castSnowman)
    Alive: 25, // a living tree (then it drains the mana while it lives)
    AliveMaxima: 50, // twice «Alive»: every grave of a graveyard / the trees round (each then drains 1 mana a second)
    TotalDestruction: 80, // the whole area falls into ruins (only with a mana maximum of 100+)
    TotalDestructionMaxima: 160, // twice as strong (only with a mana maximum of 200+)
    CircleAttack: 80, // a great wave all round the wizard — as «Total Destruction» (a mana maximum of 100+; CircleAttack.js)
    CircleAttackMaxima: 160, // … much stronger (a mana maximum of 200+)
    Inspirius: 500, // the mightiest: 500 at once, only with the wand (Inspirius.js)
    PlanetLiquidation: 1500, // «Planet Liquidation»: a planet blown up — 1500 + the planet's mass (PlanetDoom.massCost: check / pay `extra`)
    Boom: 750, // «Бум»: a mountain torn apart from inside — the scroll of the gods' temple (Boom.js)
    WaterVortexSuperMaxima: 80, // the great water storm: 2 a second while held, «стоп» 50 (only with a mana maximum of 100+; WaterStorm.js)
    WindImpulse: 10, // a ring of air: everybody within 3 m pushed away (only from a scroll — WindImpulse.js)
    WindImpulseMaxima: 40, // … within 9 m
    Drawdown: 5, // the ground sinks where the hand points; then 1 a second while it holds (Drawdown.js)
    DrawdownMaxima: 20, // … a wider bowl; then 2 a second
    Liquidation: 10, // a splash: a thing crumbles into dust, the living −3 HP (Liquidation.js)
    LiquidationMaxima: 25, // … magic things too
    Stitching: 7, // a passage sewn shut with stones of its walls (Stitching.js)
    CreateBridge: 10, // planks over a river or a ravine, 2–40 m, +0.5 mana a metre beyond 16 (Bridge.js; no scroll)
    Groundprud: 10, // «Groundprud»: the ground rises into a wall 7×2×5 where the wand points (Groundprud.js; a scroll)
    Fireworks: 15, // once, at the start (the author: «снимается 15 маны»); the 10 s that follow cost nothing (Fireworks.js; no scroll)
    Invisibility: 20, // nobody sees me; then 1 a second (only from a scroll — Invisibility.js)
    Hellfire: 80, // «Let the Hellfire Come»: then 2 a second while held (only with a mana maximum of 100+; Hellfire.js)
    IceCastle: 500, // «Create an Ice Castle»: a stamp, then the hands raise it (IceMagic.js; free in Creative)
    IceBridge: 50, // «Ice Bridge»: an arch of ice after the hand (IceMagic.js)
    FlyingMaxima: 30, // «Flying Maxima»: up out of the air into space (Space.js; then breathing there: 0.5 a second)
};

/** Damage a spell does to me is the one every creature takes (Damage.js); here only the kinds that have a number. */
const HIT_DAMAGE = { Inferno: 1, IceBall: 3, Thunderwave: DAMAGE.Thunderwave, Sapira: DAMAGE.Sapira, Lightning: DAMAGE.Lightning, Sands: DAMAGE.Sands, Liquidation: DAMAGE.Liquidation };

/** Bombardo damage by distance from the centre of the blast — the same for every body (Damage.blastDamage). */
export const bombardoDamage = blastDamage;

/**
 * «Protection» / «Protection Maxima» — what they stop and what it costs (CLAUDE.md: every creature and
 * thing decided, «no effect» too). The cost is the HOLDER's mana: half of the stopped spell's own.
 * Who decides: a player's own computer (it knows its shield; the others see it — and see it
 * shatter — by serialize()); a castle wizard's — the host (WizardFight.shieldPays).
 */
export const PROTECTION_TARGETS = {
    holders: 'players (every mode; mana rules only in the free world) and the castle wizards (hand shield in the free hand, the Master\'s dome); no other creature casts it',
    duelCharges: 'Остолбеней, Авада Кедавра (−12,5), Айс, Левиоса, Сапира, Даст, Экспеллиармус, Джолт: stopped — half of their mana each',
    spells: 'Сапира, Даст, ice balls, lightning, the ice beam / Inferno / Вайнд (a held flame or beam is paid once), Fire Maxima, Water Vortex, Earthquake (the dome): stopped — half their mana',
    blasts: 'Бомбардо (Максима), Total Destruction: a hand shield facing it −50 %, the dome −75 % — for half the spell\'s mana; out of mana the whole blast',
    thunderwave: 'Тандервейв бьёт сверху: обычный Protection и щит в руке его НЕ останавливают (урон проходит); Protection Maxima (купол) и щит богов — останавливают, за полцены заклинания',
    outOfMana: 'the shield shatters (its pieces fly, everybody sees it) and the spell that broke it goes on as if there were no shield',
    arrows: 'mirrored off the disc / the dome (ShieldBounce.js) — no mana: an arrow is no spell; the shooter\'s own shield lets his arrow out',
    thrownThings: 'a thing thrown fast bounces off it the same way (Items.js) — no mana',
    creatures: 'a zombie\'s, a knight\'s, an animal\'s, the spider\'s, a dragon\'s blow or fire, a phoenix\'s fire: the shield facing it holds — no mana (no spell)',
    magicBlade: 'a magic sword / axe breaks a hand shield it touches',
    sameHand: 'another spell cast from the hand (the wand) that holds the «Protection» knocks it down; the dome is in no hand',
    houses: 'a house\'s sphere («Protection House») is another magic: none of this applies to it (HouseWards.js)',
    gods: '«Protection Gods» (… Maxima) — the same shield, golden: every spell not of the gods held for nothing, the gods\' ones for half their price × the share of the blow (ProtectionGods.PROTECTION_GODS_TARGETS)',
};

/** The name a hit's kind is paid by (SPELL_COST): a duel charge, a ball, a bolt. */
const HIT_SPELL = {
    IceBall: 'Ice', IceDuel: 'Ice', IceDuelMaxima: 'IceMaxima', SapiraDuel: 'Sapira', SandsDuel: 'Sands', LevitateDuel: 'Levitation',
    Lightning: 'LightningStrike', Bombardo: 'Bombardo', BombardoMax: 'BombardoMaxima',
};
/** Not spells (a ball bounced off, a blow): a shield stops them for nothing. */
const NOT_A_SPELL = new Set(['Bounce', 'melee', 'arrow', 'web', 'poison', 'bite', 'dragonFire', 'phoenixFire', 'Cannon']);
/**
 * What a blast does to a body: its own harm, a cannonball's, the pieces of what it broke falling (a house, a gate),
 * a thing crashing down. A dome («Protection Maxima», «Protection Gods Maxima») is proof against all of it — the
 * author: «если ты совершил какой-то взрыв, они защищают тебя от обломков и от ударной волны» (mine too).
 */
export const BLAST_HARM = new Set(['Bombardo', 'BombardoMaxima', 'Cannon', 'collapse', 'crush']);
/** Kinds that keep touching the shield while held (a flame, a beam, a wind): paid once a spell. */
const BEAM_KINDS = new Set(['Electrum', 'Inferno', 'Ice', 'Wind', 'WindMaxima', 'Overgrown', 'OvergrownMaxima', 'Fire', 'FireMaxima', 'Hellfire', 'WaterVortex']);

/**
 * What a spell stopped by a «Protection» / «Protection Maxima» costs the one holding it:
 * half of that spell's own mana (the author's rule: «Авада Кедавра» 25 → 12.5).
 */
export function shieldHitCost(kind) {
    if (!kind || NOT_A_SPELL.has(kind)) return 0;
    const cost = SPELL_COST[HIT_SPELL[kind] || kind];
    return (cost ?? 10) / 2; // (an unnamed spell: as an ordinary one, 10)
}

const SHIELD_LEVEL = 0.15; // m: one hand this much higher than the other — the shield goes up at it (Combat._shieldSide)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// Shared shield / ice-shell visuals (local and remote players)
let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const gridMat = new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xbfe9ff, emissive: 0x1d4a66, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
    // the gods' shield (ProtectionGods.js): gold, brighter, a second ring and a crown of rays round it, a halo
    const gold = (c, o, extra = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });
    const goldShieldMat = gold(PGODS.GOLD, 0.4), goldRingMat = gold(PGODS.GOLD_LIGHT, 0.9), goldDomeMat = gold(PGODS.GOLD, 0.2), goldHaloMat = gold(PGODS.GOLD_DEEP, 0.12);
    const goldRayMat = gold(PGODS.GOLD_LIGHT, 0.55);
    const goldGridMat = new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    // (the rays: 12 thin spikes round the disc, one shape)
    const rays = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, L = i % 2 ? 0.32 : 0.5;
        const p = new THREE.PlaneGeometry(0.05, L).translate(0, 1.12 + L / 2, 0).rotateZ(a);
        rays.push(p);
    }
    const rayGeo = mergeFlat(rays);
    SHARED = {
        goldShieldMat, goldRingMat, goldDomeMat, goldHaloMat, goldRayMat, goldGridMat, rays: rayGeo,
        disc: curvedShield(),
        ring: new THREE.TorusGeometry(1.0, 0.04, 6, 48),
        hex: onShield(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.8, 6))),
        flat: new THREE.CircleGeometry(1.0, 40), // (the gods' halo behind it; the shards)
        dome: new THREE.SphereGeometry(1, 32, 20),
        domeGrid: new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)),
        shell: new THREE.IcosahedronGeometry(1, 1),
        spike: new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
        shieldMat, ringMat, domeMat, gridMat, iceMat,
    };
    return SHARED;
}

/**
 * The hand shield is CURVED like a real one (the author): a cap of a sphere, its rim a circle of radius 1 at z = 0,
 * bulging out towards +z (the side it faces) by SHIELD_BOW.
 */
const SHIELD_CAP = 0.62; // rad: the cap's half-angle
const SHIELD_RS = 1 / Math.sin(SHIELD_CAP), SHIELD_BOW = SHIELD_RS * (1 - Math.cos(SHIELD_CAP));
/** How far forward the shield's face is at distance `r` from its middle (0 at the rim). */
const bowAt = (r) => Math.sqrt(Math.max(0, SHIELD_RS * SHIELD_RS - r * r)) - SHIELD_RS * Math.cos(SHIELD_CAP);
function curvedShield() {
    const g = new THREE.SphereGeometry(SHIELD_RS, 40, 10, 0, Math.PI * 2, 0, SHIELD_CAP);
    g.rotateX(Math.PI / 2); // (its pole from +y to +z)
    g.translate(0, 0, -SHIELD_RS * Math.cos(SHIELD_CAP));
    return g;
}
/** Lines laid on the shield's face (the hexagon). */
function onShield(geo) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, bowAt(Math.hypot(p.getX(i), p.getY(i))) + 0.01);
    p.needsUpdate = true;
    return geo;
}

/** A few plain (non-indexed after toNonIndexed) geometries of position only → one (the rays of the gods' shield). */
function mergeFlat(list) {
    const parts = list.map((g) => g.index ? g.toNonIndexed() : g);
    let n = 0;
    for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return out;
}

/** One small mesh of each of the shields' materials (Game.prewarm: compiled at loading, never in a frame). */
export function sampleShieldModels() {
    const S = shared();
    return [S.shieldMat, S.ringMat, S.domeMat, S.goldShieldMat, S.goldRingMat, S.goldDomeMat, S.goldHaloMat, S.goldRayMat, S.iceMat].map((m) => new THREE.Mesh(S.disc, m))
        .concat([new THREE.LineSegments(S.hex, S.gridMat), new THREE.LineSegments(S.hex, S.goldGridMat)]);
}

/** Shield + ice shell meshes for one player (local or remote). */
export class CombatVisuals {
    constructor(scene) {
        const S = shared();
        this.scene = scene;
        this.hand = new THREE.Group();
        const disc = new THREE.Mesh(S.disc, S.shieldMat);
        const ring = new THREE.Mesh(S.ring, S.ringMat);
        const hex = new THREE.LineSegments(S.hex, S.gridMat);
        this.hand.add(disc, ring, hex);
        this.handRing = ring;
        this.handHex = hex;
        this.dome = new THREE.Group();
        this.dome.add(new THREE.Mesh(S.dome, S.domeMat));
        this.domeGrid = new THREE.LineSegments(S.domeGrid, S.gridMat);
        this.domeGrid.scale.setScalar(1.01);
        this.dome.add(this.domeGrid);
        // the gods' shield and dome (ProtectionGods.js): gold, a second ring turning the other way, a crown of rays, a halo
        this.gHand = new THREE.Group();
        this.gHandRing = new THREE.Mesh(S.ring, S.goldRingMat);
        this.gHandRing2 = new THREE.Mesh(S.ring, S.goldRingMat);
        this.gHandRing2.scale.setScalar(0.72);
        this.gHandRing2.position.z = bowAt(0.72); // (on the curved face)
        this.gHandHex = new THREE.LineSegments(S.hex, S.goldGridMat);
        this.gRays = new THREE.Mesh(S.rays, S.goldRayMat);
        this.gHalo = new THREE.Mesh(S.flat, S.goldHaloMat);
        this.gHalo.position.z = -0.03;
        this.gHalo.scale.setScalar(1.55);
        this.gHand.add(new THREE.Mesh(S.disc, S.goldShieldMat), this.gHandRing, this.gHandRing2, this.gHandHex, this.gRays, this.gHalo);
        this.gDome = new THREE.Group();
        this.gDomeGrid = new THREE.LineSegments(S.domeGrid, S.goldGridMat);
        this.gDomeGrid.scale.setScalar(1.01);
        this.gDomeGrid2 = new THREE.LineSegments(S.domeGrid, S.goldGridMat);
        this.gDomeGrid2.scale.setScalar(0.97);
        this.gDomeHalo = new THREE.Mesh(S.dome, S.goldHaloMat);
        this.gDomeHalo.scale.setScalar(1.12);
        this.gDome.add(new THREE.Mesh(S.dome, S.goldDomeMat), this.gDomeGrid, this.gDomeGrid2, this.gDomeHalo);
        // the ice shell: a faceted block round the body with crystal spikes sticking out of it
        this.shell = new THREE.Group();
        const block = new THREE.Mesh(S.shell, S.iceMat);
        block.scale.set(1.3, 2.3, 1.3);
        this.shell.add(block);
        for (let i = 0; i < 12; i++) {
            const a = i * 2.4, y = ((i * 7) % 12) / 11 * 1.6 - 0.8; // (spread all round, top to bottom)
            const u = _v1.set(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y));
            const spike = new THREE.Mesh(S.spike, S.iceMat);
            spike.position.set(u.x * 1.15, u.y * 2.05, u.z * 1.15);
            spike.quaternion.setFromUnitVectors(_v2.set(0, 1, 0), _v3.set(u.x / 1.3, u.y / 2.3, u.z / 1.3).normalize());
            const w = 0.13 + (i % 3) * 0.05;
            spike.scale.set(w, 0.45 + (i % 4) * 0.15, w);
            this.shell.add(spike);
        }
        for (const o of [this.hand, this.dome, this.shell, this.gHand, this.gDome]) {
            o.visible = false;
            o.renderOrder = 4;
            scene.add(o);
        }
        this._t = 0;
        this.shards = []; // (a shattered shield's pieces flying apart)
    }

    /**
     * The shield shatters (out of mana): its pieces fly apart and fade. type 1 the hand
     * shield at `at` facing `dir`; 2 the dome round `at`.
     */
    shatter(type, at, dir = null, gods = false) {
        const S = shared();
        const geo = S.shard || (S.shard = new THREE.CircleGeometry(0.22, 3)); // (pieces: flat triangles)
        const n = type === 2 ? 26 : 16;
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(geo, (gods ? S.goldShieldMat : S.shieldMat).clone()); // (the gods' one: golden pieces)
            m.material.opacity = 0.75;
            const u = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
            if (type === 2) m.position.copy(at).addScaledVector(u, PVP.DOME_R * 0.95);
            else {
                m.position.copy(at).add(_v1.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.3));
                if (dir) u.addScaledVector(dir, 1.2).normalize();
            }
            m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            m.renderOrder = 4;
            this.scene.add(m);
            this.shards.push({ m, v: u.multiplyScalar(2.5 + Math.random() * 3.5), w: (Math.random() - 0.5) * 14, life: 0.9 });
        }
    }

    _updateShards(dt) {
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.life -= dt;
            if (s.life <= 0) { this.scene.remove(s.m); s.m.material.dispose(); this.shards.splice(i, 1); continue; }
            s.v.y -= 6 * dt;
            s.m.position.addScaledVector(s.v, dt);
            s.m.rotation.x += s.w * dt; s.m.rotation.y += s.w * 0.7 * dt;
            s.m.material.opacity = 0.75 * Math.min(1, s.life / 0.5);
        }
    }

    /**
     * @param {number} dt
     * @param {object} st {shield: 0|1|2, shieldLeft, frozen:boolean}
     * @param {object} body {center:Vector3, hand:Vector3, dir:Vector3}
     */
    update(dt, st, body) {
        this._t += dt;
        if (this.shards.length) this._updateShards(dt);
        if (st.gods) this.hand.visible = this.dome.visible = false;
        else this.gHand.visible = this.gDome.visible = false;
        if (st.gods) { this._updateGods(dt, st, body); this._shell(dt, st, body); return; }
        const showHand = st.shield === 1 && st.shieldLeft > 0;
        this.hand.visible = showHand;
        this._handAge = showHand ? (this._handAge || 0) + dt : 0;
        if (showHand) {
            // (grows in as it is cast; fades in the last third of a second)
            const k = Math.max(0.05, Math.min(1, st.shieldLeft / 0.35, this._handAge / 0.25 + 0.2));
            this.hand.position.copy(body.hand).addScaledVector(body.dir, 0.45);
            this.hand.lookAt(_v1.copy(this.hand.position).add(body.dir));
            this.hand.scale.setScalar(PVP.SHIELD_SCALE * k);
            this.handRing.rotation.z = this._t * 2;
            this.handHex.rotation.z = -this._t * 1.3;
        }
        const showDome = st.shield === 2 && st.shieldLeft > 0;
        this.dome.visible = showDome;
        this._domeAge = showDome ? (this._domeAge || 0) + dt : 0;
        if (showDome) {
            const k = Math.max(0.05, Math.min(1, st.shieldLeft / 0.35, this._domeAge / 0.25 + 0.2));
            this.dome.position.copy(body.center);
            this.dome.scale.setScalar(PVP.DOME_R * k * (1 + 0.03 * Math.sin(this._t * 6)));
            this.domeGrid.rotation.set(this._t * 0.4, this._t * 0.6, 0);
        }
        this._shell(dt, st, body);
    }

    /** The gods' shield / dome: golden, breathing light, its rings and rays turning (ProtectionGods.js). */
    _updateGods(dt, st, body) {
        const t = this._t;
        const showHand = st.shield === 1 && st.shieldLeft > 0;
        this.gHand.visible = showHand;
        this._handAge = showHand ? (this._handAge || 0) + dt : 0;
        if (showHand) {
            const k = Math.max(0.05, Math.min(1, st.shieldLeft / 0.35, this._handAge / 0.3 + 0.15));
            this.gHand.position.copy(body.hand).addScaledVector(body.dir, 0.45);
            this.gHand.lookAt(_v1.copy(this.gHand.position).add(body.dir));
            this.gHand.scale.setScalar(PVP.SHIELD_SCALE * k * (1 + 0.025 * Math.sin(t * 5)));
            this.gHandRing.rotation.z = t * 1.6;
            this.gHandRing2.rotation.z = -t * 2.4;
            this.gHandHex.rotation.z = -t * 0.9;
            this.gRays.rotation.z = t * 0.5;
            this.gRays.scale.setScalar(1 + 0.08 * Math.sin(t * 3.3));
            this.gHalo.scale.setScalar(1.5 + 0.12 * Math.sin(t * 2.1));
        }
        const showDome = st.shield === 2 && st.shieldLeft > 0;
        this.gDome.visible = showDome;
        this._domeAge = showDome ? (this._domeAge || 0) + dt : 0;
        if (showDome) {
            const k = Math.max(0.05, Math.min(1, st.shieldLeft / 0.35, this._domeAge / 0.35 + 0.15));
            this.gDome.position.copy(body.center);
            this.gDome.scale.setScalar(PVP.DOME_R * k * (1 + 0.03 * Math.sin(t * 4)));
            this.gDomeGrid.rotation.set(t * 0.3, t * 0.5, 0);
            this.gDomeGrid2.rotation.set(-t * 0.45, -t * 0.2, t * 0.3);
            this.gDomeHalo.scale.setScalar(1.1 + 0.05 * Math.sin(t * 2.3));
        }
        // (the gold breathes: the shared materials shine brighter and softer in turn — the same on every shield)
        if (showHand || showDome) {
            const S = shared(), b = 0.5 + 0.5 * Math.sin(t * 2.6);
            S.goldShieldMat.opacity = 0.32 + 0.14 * b;
            S.goldDomeMat.opacity = 0.15 + 0.1 * b;
            S.goldHaloMat.opacity = 0.08 + 0.1 * (1 - b);
            S.goldRayMat.opacity = 0.4 + 0.3 * b;
        }
    }

    /** The ice shell of «Айс». */
    _shell(dt, st, body) {
        this.shell.visible = !!st.frozen;
        this._iceAge = st.frozen ? (this._iceAge || 0) + dt : 0;
        if (st.frozen) {
            // (the ice grows round the body in a quarter of a second)
            const k = Math.min(1, this._iceAge / 0.25);
            this.shell.position.copy(body.center);
            this.shell.scale.setScalar(0.3 + 0.7 * (1 - (1 - k) * (1 - k)));
        }
    }

    dispose() {
        for (const o of [this.hand, this.dome, this.shell, this.gHand, this.gDome]) this.scene.remove(o);
        for (const s of this.shards) { this.scene.remove(s.m); s.m.material.dispose(); }
        this.shards = [];
    }
}

export class Combat {
    /** @param {Game} game */
    constructor(game) {
        this.game = game;
        this.enabled = game.config.mode === 'freeworld';
        this.hp = PVP.MAX_HP;
        this.fatigue = this.maxFatigue || PVP.MAX_FATIGUE;
        this.shield = null; // {type: 1 hand | 2 dome, side, left}
        this.frozenLeft = 0;
        this.frozenBy = null;
        this.chill = 0;
        this.chillTimer = 0;
        this.dead = false;
        this.infernoCooldown = 0;
        // Shields work (and are visible) in every mode; damage rules only in the free world
        this.visuals = game.scene ? new CombatVisuals(game.scene) : null;
        this.targets = new Map(); // remote id -> melee target (for weapons/fists)
        this._hudKey = '';
    }

    /** Back to life (respawn): full health and strength, no ice / stun / shield. */
    revive() {
        this.hp = this.maxHp || PVP.MAX_HP;
        this.fatigue = this.maxFatigue || PVP.MAX_FATIGUE;
        this.shield = null;
        this.frozenLeft = 0;
        this.frozenBy = null;
        this.chill = 0;
        this.stunLeft = 0;
        this.encased = false;
        this.slowLeft = 0;
        if (this.game.character) this.game.character.slowScale = 1;
        this.dead = false;
        if (this.game.knock) this.game.knock.reset(); else this.game.character.knockedDown = false;
        this.game.hud.setStatus?.('');
        this.game.hud.setFrozenOverlay?.(0);
        this._hudKey = '';
    }

    get frozen() {
        return this.frozenLeft > 0;
    }

    /** Stunned by «Остолбеней»: can't move or cast (no ice, hits are normal). */
    get stunned() {
        return this.stunLeft > 0;
    }

    /** Frozen or stunned: the body can't move. */
    get immobile() {
        return this.frozen || this.stunned || this.dead || this.webbed || this.encased; // (encased: in the vortex's ice bubble)
    }

    stun(seconds, byId, kind = 'stupefy') {
        if (this.godsKeepsOff(kind)) return; // (the gods' dome: no spell knocks me down — ProtectionGods.js)
        this.stunLeft = Math.max(this.stunLeft || 0, seconds);
        this.stunBy = byId;
        this.stunKind = kind;
        if (this.game.flight?.busy) this.game.flight.land('stunned');
        if (this.game.water?.active) this.game.water.drop();
        if (this.game.levitation?.active) this.game.levitation.release(false);
    }

    /** «Даст»: sand in the eyes and the joints — slowed for a while (every mode). */
    slow(seconds = SLOW.TIME, byId = null) {
        if (this.godsKeepsOff('Sands')) return; // (the gods' dome: no sand gets in)
        this.slowLeft = Math.max(this.slowLeft || 0, seconds);
        this.slowBy = byId;
        if (this.game.character) this.game.character.slowScale = SLOW.SCALE;
        this._hudKey = '';
    }

    // ================================================================ fatigue
    /** Can I cast this now? null = yes, otherwise a hint for the player. */
    check(name, extra = 0) {
        if (this.dead) return '💀';
        if (this.frozen) { if (this.game) this.game.lastCastWhy = 'вы заморожены'; return `🧊 Вы заморожены — разморозка через ${Math.ceil(this.frozenLeft)} с`; }
        if (this.stunned) { if (this.game) this.game.lastCastWhy = 'вы оглушены'; return `💫 Вы оглушены — ещё ${Math.ceil(this.stunLeft)} с`; }
        if (!this.enabled) return null;
        const cost = this.costOf(name, extra);
        if (this.fatigue < cost) {
            const msg = `😮‍💨 Не хватает маны: нужно ${cost}, есть ${Math.floor(this.fatigue)}`;
            if (this.game) this.game.lastCastWhy = msg.slice(3); // (the spell journal)
            this.game.hud?.toast?.(msg); // a short note that fades by itself
            // «heard you, but no mana»: the mana bar flashes red and shudders, and a short sound (once a moment)
            const t = performance.now();
            if (t - (this._noManaAt || -1e9) > 700) { this._noManaAt = t; this.game.hud?.manaShort?.(); this.game.sound?.playNoMana?.(); }
            return msg;
        }
        return null;
    }

    /** Pay the fatigue of a spell that was cast. */
    /** Fatigue a spell costs (a wand in the hand saves 15%). */
    costOf(name, extra = 0) {
        const base = ((SPELL_COST[name] ?? 5) + extra) * (this.game.armor?.stat('cost') ?? 1); // (a named armour's perk: spells cheaper; extra — a price that depends: «Planet Liquidation»'s planet)
        const w = this.game.items?.wand;
        return w && !w.plain && !/^(TotalDestruction|CircleAttack|Inspirius|Boom|PlanetLiquidation|Hellfire|WaterVortexSuperMaxima|CreatePlanet|EnlargePlanet|TerraformPlanet|LevitationSuperMaxima|ProtectionGods|Die$|ProtectionHouse|ProtectionInvisible|WardDispel|WardGrow|LevitationMaxima)/.test(name) ? Math.round(base * 0.85 * 10) / 10 : base; // (the plain wooden wand saves nothing)
    }

    pay(name, extra = 0) {
        this.paidCount = (this.paidCount || 0) + 1; // (mana: a spell that was paid for may count as a success)
        if (this.enabled) this.fatigue = Math.max(0, this.fatigue - this.costOf(name, extra));
    }

    /**
     * A held spell (the «Инферно» flame) takes `amount` mana now; over its `dt` seconds no
     * mana comes back either (like a held «Protection»).
     * @returns {boolean} false when there is no mana left (or I can't cast any more): it goes out
     */
    drain(amount, dt = 0) {
        if (this.dead || this.frozen || this.stunned) return false;
        if (!this.enabled) return true;
        if (this.fatigue <= 0) return false;
        this.fatigue = Math.max(0, this.fatigue - amount - PVP.FATIGUE_REGEN * dt);
        return true;
    }

    /** A burnt scroll: more strength for good. */
    /** A new hundred of mana cells reached: the hero is told his mana now comes back faster (not at a load, not when it falls). */
    _regenTierCheck() {
        const t = regenTier(this.maxFatigue);
        if (this._regenTier == null) { this._regenTier = t; return; }
        if (t > this._regenTier) this.game.hud?.setVoice?.(regenLine(t), true);
        this._regenTier = t;
    }

    addMaxFatigue(n) {
        this.maxFatigue = (this.maxFatigue || PVP.MAX_FATIGUE) + n;
        this.fatigue = Math.min(this.maxFatigue, this.fatigue + n);
    }

    /** Food, a bed…: healed by n, never above the maximum. @returns how much it really healed */
    heal(n) {
        if (this.dead || !(n > 0)) return 0;
        const max = this.maxHp || PVP.MAX_HP;
        const was = this.hp;
        this.hp = Math.min(max, this.hp + n);
        this._hudKey = '';
        return this.hp - was;
    }

    /** A burnt health scroll: more health for good (and that much healed at once). */
    addMaxHp(n) {
        this.maxHp = (this.maxHp || PVP.MAX_HP) + n;
        if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + n);
        this._hudKey = '';
    }

    spend(name) {
        const hint = this.check(name);
        if (!hint) this.pay(name);
        return hint;
    }

    // ============================================================ protection
    /**
     * «Protection» (arm stretched out) / «Protection Maxima» (T-pose).
     * @returns {string|null} hint when the gesture is wrong
     */
    /**
     * The hand «Protection» goes up at (the author): with a wand — AT THE WAND (its tip); at the other hand only when
     * that hand is raised higher than the wand's (by SHIELD_LEVEL). No wand: the higher hand; both at one height —
     * a stretched one, else the one reaching furthest.
     */
    _shieldSide() {
        const ch = this.game.character;
        const wand = this.game.wandSide?.();
        const ry = ch.getHandWorldPosition('right', _v1).y, ly = ch.getHandWorldPosition('left', _v1).y;
        // (the author: «щит идёт из палочки; из руки — только когда я поднимаю выше другую руку, где нет палочки»)
        if (wand) {
            const other = wand === 'right' ? 'left' : 'right', oy = other === 'right' ? ry : ly, wy = wand === 'right' ? ry : ly;
            return oy - wy > SHIELD_LEVEL ? other : wand;
        }
        if (Math.abs(ry - ly) > SHIELD_LEVEL) return ry > ly ? 'right' : 'left';
        const side = ch.isArmExtended('right') ? 'right' : ch.isArmExtended('left') ? 'left' : null;
        if (side) return side;
        const reach = (sd) => ch.getHandWorldPosition(sd, _v1).distanceTo(ch.group.position);
        return reach('right') >= reach('left') ? 'right' : 'left';
    }

    /** Where the hand shield stands on `side`: at the wand's tip when the wand is in that hand, else at the hand. */
    shieldAt(side, out = new THREE.Vector3()) {
        const g = this.game;
        const r = g.castOrigin ? g.castOrigin(side, out) : null;
        return r && Number.isFinite(r.x) ? r : g.character.getHandWorldPosition(side, out);
    }

    castProtection(maxima, gods = false) {
        const ch = this.game.character;
        if (gods) return this._castGods(maxima);
        if (this.shield?.gods) return '✨ Вы уже под божественной защитой — она держит больше любого щита';
        if (maxima) {
            if (!(ch.isArmsSpread ? ch.isArmsSpread() : ch.isTPose())) return '🛡️ Для «Protection Maxima» разведите руки <b>в стороны, как буква T</b>';
            if (this.shield?.type === 2) return null; // (already round me: nothing more to pay)
            const swap = this._swapRefund();
            const hint = this.spend('ProtectionMaxima');
            if (hint) return hint;
            this._refund(swap);
            this.game.mana?.success('ProtectionMaxima'); // (the dome is up)
            // it holds while there is mana: 1 a second, until «стоп» (not bound to a hand: the wand casts on)
            this.shield = { type: 2, side: 'right', left: this.enabled ? this.fatigue / PVP.DOME_DRAIN : PVP.SHIELD_HOLD_MAX, drain: PVP.DOME_DRAIN, age: 0 };
            this.game.spiders?.onDome(); // the only way out of the spider's fangs
            if (this.enabled) this.game.hud?.setVoice?.('🛡️ Купол держится, пока есть мана (−1 в секунду). Каждое отражённое заклинание — половина его цены. Снять — «стоп»', true);
        } else {
            if (this.shield?.type === 2) return '🛡️ Вы уже под куполом «Protection Maxima»';
            const wand = this.game.wandSide?.();
            const side = this._shieldSide();
            if (this.shield?.type === 1) return null; // (already holding one: nothing more to pay)
            const hint = this.spend('Protection');
            if (hint) return hint;
            this.game.mana?.success('Protection'); // (the shield is up)
            // it holds while there is mana: 0.5 a second (a wand favouring it: 0.5/1.4 a second);
            // off sooner with a sharp jerk of the shield arm or «стоп»
            const fav = this.game.items?.wand?.fav === 'Protection' ? 1.4 : 1;
            const drain = PVP.SHIELD_DRAIN / fav;
            this.shield = { type: 1, side, left: this.enabled ? this.fatigue / drain : PVP.SHIELD_HOLD_MAX, drain, age: 0, wand: side === wand };
            if (wand && side === wand) this.game.hud?.setVoice?.('🛡️ Щит в руке с палочкой: любое другое заклинание этой палочкой собьёт его. Держите щит другой рукой', true);
            else if (this.enabled) this.game.hud?.setVoice?.('🛡️ Щит держится, пока есть мана (−0,5 в секунду). Каждое отражённое заклинание — половина его цены', true);
        }
        if (this.game.sound) this.game.sound.playIce?.();
        return null;
    }

    /**
     * «Protection Gods» (arm stretched out) / «… Maxima» (T-pose): the gods' shield (ProtectionGods.js) — the same
     * gesture and shield as «Protection», golden; 100 / 300 mana at once, then 3 / 5 a second (Creative: free).
     */
    _castGods(maxima) {
        const ch = this.game.character, name = maxima ? 'ProtectionGodsMaxima' : 'ProtectionGods';
        let side = 'right';
        if (maxima) {
            if (!(ch.isArmsSpread ? ch.isArmsSpread() : ch.isTPose())) return '✨ Для «Protection Gods Maxima» разведите руки <b>в стороны, как буква T</b>';
            if (this.shield?.gods && this.shield.type === 2) return null; // (already round me)
        } else {
            if (this.shield?.gods && this.shield.type === 2) return '✨ Вы уже под божественным куполом';
            if (this.shield?.gods) return null; // (already holding it)
            side = this._shieldSide(); // (as «Protection»: the higher hand)
        }
        const swap = this._swapRefund();
        const hint = this.spend(name);
        if (hint) return hint;
        this._refund(swap);
        this.game.mana?.success(name); // (the first time: +100 cells — a gift of the gods, Mana.GOD_SPELLS)
        const drain = maxima ? PGODS.DRAIN_MAX : PGODS.DRAIN;
        // (an ordinary shield held now gives way to it)
        this.shield = { type: maxima ? 2 : 1, side, left: this.enabled ? this.fatigue / drain : PVP.SHIELD_HOLD_MAX, drain, age: 0, gods: true, wand: !maxima && side === this.game.wandSide?.() };
        if (maxima) this.game.spiders?.onDome(); // (the spider's fangs let go, as for any dome)
        const at = maxima ? this.center(_v1) : this.shieldAt(side, _v1);
        this.game.fx?.lightFlash?.(at, PGODS.GOLD, 3, 0.4, 20);
        for (let i = 0; i < 30; i++) this.game.fx?.spark?.(at, i % 3 ? PGODS.GOLD : 0xffffff, 0.18, _v2.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), 0.8);
        if (this.enabled) this.game.hud?.setVoice?.(maxima ? '✨ Божественный купол: ни одно заклинание, кроме божественных, не пройдёт. −5 маны в секунду. Снять — «стоп»' : '✨ Божественный щит: ни одно заклинание, кроме божественных, не пройдёт. −3 маны в секунду. Снять — «стоп» или рывком руки', true);
        return null;
    }

    /**
     * Does the gods' shield keep a kind of harm off me, with no direction known (Combat.damage / stun / freeze /
     * slow)? The dome: every spell not of the gods; the hand shield: those that strike all round (ProtectionGods).
     */
    godsKeepsOff(kind) {
        return godsKeepsOff(this.shield, kind);
    }

    /**
     * The gods' shield is struck by a spell of the gods (`kind` — its name): it holds, and takes from my mana
     * half of `price` (that spell's own: SPELL_COST, unless given — «Planet Liquidation» + the planet's mass)
     * × `share`, the part of the blow that would have reached me (ProtectionGods.divineHitCost). Not enough
     * mana: it breaks — the rest goes on. `from`: where it came from (the hand shield must face it; null: all round).
     * @returns {number} the share of the blow that goes on to me (1: there was no gods' shield to stop it; 0: all held)
     */
    godsHit(kind, from = null, share = 1, price = null) {
        const s = this.shield;
        if (!s?.gods || !(s.left > 0) || this.dead) return 1;
        if (s.type === 1 && from && this.shieldFactor(from) < 1) return 1; // (from behind the hand)
        const k = Math.max(0, Math.min(1, share));
        if (BREAKS_GODS.has(kind)) { this.breakGods(); return 0; } // («Дай»: the first blow breaks it — no death, no mana; the next one gets through)
        if (!isDivine(kind)) { this._godsFx(from); return 0; } // (any other spell: held for nothing)
        if (!this.enabled) { this._godsFx(from); return 0; } // (Creative: no mana rules)
        const r = payDivine(this.fatigue, price ?? SPELL_COST[kind] ?? 0, k);
        this.fatigue = r.mana;
        if (r.pass > 0) { this._shatter('💥 Божественная защита сломалась — не хватило маны удержать заклинание богов!'); return r.pass; }
        this._godsFx(from, '✨ Божественная защита сдержала заклинание богов');
        return 0;
    }

    /**
     * The gods' shield is broken off now (a spell that breaks it — ProtectionGods.BREAKS_GODS, «Дай»): no mana taken,
     * nothing else happens to me this time; its golden pieces fly (everybody sees them). @returns {boolean} it was up
     */
    breakGods(text = '💥 Божественная защита разбита! Следующий удар пройдёт') {
        if (!this.shield?.gods) return false;
        this._shatter(text);
        return true;
    }

    /** The gods' shield held something: gold sparks where it touched, its gold light flaring. */
    _godsFx(from, text = '✨ Божественная защита сдержала заклинание') {
        const s = this.shield, fx = this.game.fx;
        if (!s || !fx) return;
        const now = performance.now();
        if (now - (this._godsFxAt || 0) < 120) return; // (a beam held on it: not a shower every frame)
        this._godsFxAt = now;
        const c = this.center(_v1);
        const at = s.type === 2 ? (from ? c.addScaledVector(_v2.subVectors(from, c).normalize(), PVP.DOME_R * 0.95) : c) : this.shieldAt(s.side, _v1);
        for (let i = 0; i < 28; i++) fx.spark(at, i % 3 ? PGODS.GOLD : 0xffffff, 0.16, _v3.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.5);
        fx.lightFlash?.(at, PGODS.GOLD, 2.5, 0.25, 16);
        if (now - (this._godsSayAt || 0) > 1500) { this._godsSayAt = now; this.game.hud?.setVoice?.(text, true); }
        this.game.sound?.playFrozenHit?.();
    }

    /**
     * A hand shield put up a moment ago (the first words of a longer phrase: «Protection…» → «… Maxima» / «… Gods»)
     * is taken over by the longer spell: its price comes back. @returns {string|null} what to give back
     */
    _swapRefund() {
        const s = this.shield;
        return s && s.type === 1 && (s.age || 0) < 3 ? (s.gods ? 'ProtectionGods' : 'Protection') : null;
    }

    _refund(name) {
        if (name && this.enabled) this.fatigue = Math.min(this.maxFatigue || PVP.MAX_FATIGUE, this.fatigue + this.costOf(name));
    }

    /** A held «Protection»: a sharp jerk of the shield arm puts it out (not a small move). */
    _shieldJerk(dt) {
        const s = this.shield;
        if (!s || s.type !== 1) return;
        s.age = (s.age || 0) + dt;
        if (s.age > 0.6 && sharpJerk(this.game.duel?.jerk?.[s.side])) this.dropShield('🛡️ Вы сбросили щит');
    }

    /** The shield goes out now («стоп», a jerk). */
    dropShield(text = '🛡️ Щит снят') {
        if (!this.shield) return false;
        this.shield = null;
        this.game.hud.setVoice(text, true);
        return true;
    }

    /**
     * Another spell was just cast from `side` (Game.castLocalSpell): a «Protection» held in that
     * same hand is knocked down by it (the wand can't hold the shield and cast another spell).
     * The dome («Maxima») is not in a hand: it stays.
     */
    castFrom(side) {
        const s = this.shield;
        if (!s || s.type !== 1 || !side || s.side !== side) return false;
        this._shatter('🛡️ Заклинание из той же руки сбило щит. Держите «Protection» другой рукой', false);
        return true;
    }

    /** The shield breaks: its pieces fly apart (seen by everybody: serialize()'s counter). */
    _shatter(text, sound = true) {
        const s = this.shield;
        if (!s) return;
        const ch = this.game.character;
        if (this.visuals) {
            if (s.type === 2) this.visuals.shatter(2, this.center(_v1), null, !!s.gods);
            else this.visuals.shatter(1, this.shieldAt(s.side, _v1).addScaledVector(ch.getHandDirection(s.side, _v2), 0.45), _v2, !!s.gods);
        }
        const at = s.type === 2 ? this.center(_v1) : this.shieldAt(s.side, _v1);
        this.game.fx?.lightFlash?.(at, s.gods ? PGODS.GOLD : 0x6fc3ff, 3, 0.3, 18);
        this.shield = null;
        this.brokeN = ((this.brokeN || 0) + 1) % 100;
        if (text) this.game.hud.setVoice(text, true);
        if (sound) this.game.sound?.playFrozenHit?.();
    }

    /**
     * A spell of `kind` is stopped by my «Protection» / «Maxima»: it costs half of its mana.
     * @returns {boolean} true: held (paid); false: not enough mana — the shield shattered, the spell goes on
     */
    _payHit(kind) {
        if (this.shield?.gods) return this.godsHit(kind, null, 1) <= 0; // (the gods' shield: held — only the gods' own spells cost: ProtectionGods.js)
        if (!this.enabled || !this.shield) return true;
        let cost = shieldHitCost(kind);
        if (cost > 0 && BEAM_KINDS.has(kind)) {
            // (a flame / a beam keeps touching it: one spell, paid once, while it doesn't stop)
            const now = performance.now(), m = this._beamAt || (this._beamAt = {});
            if (now - (m[kind] || -1e9) < PVP.BEAM_GAP * 1000) cost = 0;
            m[kind] = now;
        }
        if (cost <= 0) return true;
        if (this.fatigue >= cost) { this.fatigue -= cost; return true; }
        this.fatigue = 0;
        this._shatter('💥 Щит разбит — не хватило маны, чтобы удержать заклинание!');
        return false;
    }

    /** Does my shield stop something coming from `from`? 1 = fully, 0 = no. */
    shieldFactor(from) {
        const s = this.shield;
        if (!s || s.left <= 0) return this.game.gear?.shieldFaces(from) ? 1 : 0; // a shield in the hand
        if (s.type === 1 && this.game.gear?.shieldFaces(from)) return 1;
        if (s.type === 2) return 1;
        const ch = this.game.character;
        const hand = this.shieldAt(s.side, _v1);
        const dir = ch.getHandDirection(s.side, _v2);
        const toAttacker = _v3.subVectors(from, hand).normalize();
        return dir.dot(toAttacker) > 0.25 ? 1 : 0;
    }

    /**
     * Something was stopped by a shield (shieldFactor said so): the sparks — and a «Protection»
     * pays half of the spell's mana for it (_payHit).
     * @returns {boolean} true: it held; false: it shattered now (out of mana) — the spell goes on to me
     */
    _blocked(from, kind = null) {
        if ((!this.shield || this.shield.left <= 0) && this.game.gear?.shieldFaces(from)) { this.game.gear.shieldTook(kind || 'Sapira'); return true; }
        if (!this.shield) return false;
        if (!this._payHit(kind)) return false;
        if (this.shield?.gods) return true; // (its own gold sparks: godsHit)
        const c = this.center(_v1);
        const fx = this.game.fx;
        const at = this.shield.type === 2 ? c.addScaledVector(_v2.subVectors(from, c).normalize(), 2.4) : this.shieldAt(this.shield.side, _v1);
        for (let i = 0; i < 25; i++) fx.spark(at, i % 2 ? 0x9fd8ff : 0xffffff, 0.15, _v3.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.4);
        fx.lightFlash(at, 0x6fc3ff, 2, 0.2, 15);
        this.game.hud.setVoice('🛡️ Щит отразил заклинание!', true);
        if (this.game.sound) this.game.sound.playFrozenHit?.();
        return true;
    }

    // ============================================================== incoming
    /** Body centre of my player. */
    center(out = new THREE.Vector3()) {
        return out.copy(this.game.character.group.position).add(_v3.set(0, 0.6, 0));
    }

    /**
     * A spell hits me. kind: Inferno | Thunderwave | Sapira | Sands | IceBall
     * @returns {boolean} false when the shield stopped it
     */
    hitBySpell(kind, from, byId, push = null) {
        if (!this.enabled || this.dead) return false;
        // «Thunderwave» comes from ABOVE: an ordinary «Protection» (and a shield in the hand) does not stop it — only the dome (Protection Maxima) and the gods' shield
        const s0 = this.shield, fromAbove = kind === 'Thunderwave' && !(s0 && s0.left > 0 && (s0.type === 2 || s0.gods));
        if (!fromAbove && this.shieldFactor(from) >= 1 && this._blocked(from, kind)) {
            // (still felt: the shield arm is pushed back, the body slides a little — never a fall)
            if (this.game.impact && kind !== 'Bounce' && !this.shield?.gods) this.game.impact.apply({ v: push ? push.clone() : this._pushOf(kind, from), from, by: byId, spell: kind });
            return false;
        }
        // worn armour / a robe (Armor.js): the simplest magic bounces off a magic robe / the whole magic set
        if (this.game.armor?.guard(kind)) return false;
        if (kind === 'Inferno') {
            if (this.infernoCooldown > 0) return true;
            this.infernoCooldown = PVP.INFERNO_TICK;
        }
        // (fire from a wizard holding the dragon's wand burns 60% harder: Game.fireBoost)
        this.damage((HIT_DAMAGE[kind] ?? 2) * (kind === 'Inferno' ? this.game.fireBoost?.(byId) ?? 1 : 1), byId, kind);
        if (kind === 'Inferno' && !this.dead) this.game.burning?.ignite('p', this.game.localId, byId); // (the stream sets me alight)
        // its physical effect: a push, a stagger, off the feet (BodyImpact; SPELL_PHYSICS when no push is given)
        if (this.game.impact) this.game.impact.spellHit(kind, from, byId, push);
        else if (push) this.game.knockback.add(push);
        return true;
    }

    /** The push a spell gives me from `from` (Impact.SPELL_PHYSICS). */
    _pushOf(kind, from) {
        const me = this.center(new THREE.Vector3());
        const v = me.clone().sub(from).setY(0);
        if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
        return v.normalize().multiplyScalar(spellPush(kind, me.distanceTo(from)));
    }

    /**
     * The ice beam is on me.
     * @returns {boolean} false when blocked (the beam breaks)
     */
    chillBy(amount, from, byId) {
        if (!this.enabled || this.dead) return false;
        if (this.shieldFactor(from) >= 1 && this._blocked(from, 'Ice')) return false;
        if (this.game.armor?.guard('chill')) return false; // (a magic robe / the whole magic set: the cold does not take)
        if (this.frozen) return true;
        this.chill = Math.min(1, this.chill + amount);
        this.chillTimer = 0.4;
        if (this.chill >= 1) this.freeze(byId);
        return true;
    }

    freeze(byId, time = PVP.FREEZE_TIME) {
        if (this.godsKeepsOff('Frozen')) return; // (the gods' dome: no ice takes me)
        this.chill = 0;
        this.frozenLeft = Math.max(this.frozenLeft, time);
        this.frozenBy = byId;
        this.shield = null;
        if (this.game.levitation?.active) this.game.levitation.release(false); // (a frozen hand holds nothing)
        if (this.game.flight?.busy) this.game.flight.land('frozen');
        if (this.game.water?.active) this.game.water.drop();
        if (this.game.sound) this.game.sound.playIce?.();
    }

    /** Bombardo next to me: damage by distance, the shield takes part of it. */
    explosion(pos, radius, power, byId) {
        if (!this.enabled || this.dead) return;
        if (byId && byId === this.game.localId) return; // your own blast doesn't hurt you
        const d = this.center(_v1).distanceTo(pos);
        let dmg = bombardoDamage(d, radius, power);
        if (dmg <= 0) return;
        const s = this.shield;
        const kind = power < 1 ? 'Cannon' : power > 1 ? 'BombardoMaxima' : 'Bombardo'; // (a cannonball's blast is no spell)
        if (s?.gods && s.left > 0 && isMagicKind(kind)) { this.godsHit(kind, null); return; } // (the gods' shield: a blast all round — held, no mana)
        // the dome: the blast does not get in at all (an ordinary one pays half the spell's mana; a cannonball — nothing)
        if (s && s.left > 0 && s.type === 2 && this._payHit(kind)) { this._blastFx(pos); return; }
        if (this.shield && s.left > 0 && s.type !== 2 && this.shieldFactor(pos) >= 1 && this._payHit(power > 1 ? 'BombardoMaxima' : 'Bombardo')) {
            dmg *= s.type === 2 ? 0.25 : 0.5; // (out of mana: it shattered — the whole blast)
        }
        dmg = Math.round(dmg);
        if (dmg > 0) this.damage(dmg, byId, kind === 'Cannon' ? 'Cannon' : 'Bombardo');
    }

    /** A dome up now: proof against blasts, their wave and the pieces they throw (BLAST_HARM). */
    blastProof() {
        const s = this.shield;
        return !!s && s.type === 2 && s.left > 0 && !this.dead;
    }

    /** A blast broke on my dome: sparks where it struck it (gold for the gods' one). */
    _blastFx(from) {
        const s = this.shield, fx = this.game.fx;
        if (!s || !fx) return;
        const c = this.center(_v2), at = c.addScaledVector(_v3.subVectors(from, c).normalize(), PVP.DOME_R * 0.95);
        for (let i = 0; i < 24; i++) fx.spark(at, i % 2 ? (s.gods ? PGODS.GOLD : 0x9fd8ff) : 0xffffff, 0.15, _v3.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.45);
        fx.lightFlash?.(at, s.gods ? PGODS.GOLD : 0x6fc3ff, 2, 0.25, 16);
    }

    /** Someone hit me with a fist or a weapon. A frozen player shatters. */
    meleeHit(dmg, byId, magic = false, cut = null) {
        if (!this.enabled || this.dead) return;
        // a shield in the hand turned to the attacker takes the blow
        const att = this.game.remotes?.get(byId)?.position;
        if (att && this.game.gear?.shieldFaces(att)) { this.game.gear.shieldTook('melee'); return false; }
        // a magic weapon breaks an ordinary «Protection» it touches
        if (magic && this.shield && this.shield.type === 1 && !this.shield.gods) { // (the gods' one it does not: ProtectionGods.js)
            this.shield = null; // (for good: a held shield would come back from the strength left)
            this.game.hud.setVoice?.('💥 Волшебное оружие разбило ваш щит!', true);
            const p = this.center(_v1);
            for (let i = 0; i < 25; i++) this.game.fx.spark(p, 0x7fd8ff, 0.12, _v2.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.6);
        }
        if (this.frozen) { this.die(byId, 'shatter'); return; }
        this.damage(dmg, byId, 'melee');
        // a slash with a blade leaves a light cut (heals by itself)
        if (cut && !this.dead) this.game.bleeding?.cut(cut);
        return true;
    }

    damage(amount, byId, kind) {
        if (this.dead) return;
        if (this.godsKeepsOff(kind)) { this._godsFx(null); return; } // (the gods' shield: no spell but the gods' own gets through — ProtectionGods.js)
        if (BLAST_HARM.has(kind) && this.blastProof()) return; // (a dome: no blast, no falling pieces get in — mine either)
        // Any hit on a frozen player shatters them, whatever their HP
        // (the ice's own bite while it holds — «Айс» −3/s, «Айс Максима» −10/s — is not a blow: StrongMagic)
        if (this.frozen && kind !== 'Inferno' && kind !== 'iceBite') { this.die(byId, 'shatter'); return; }
        // worn armour takes its share; a robe / a named armour's perks soften it (Armor.js)
        if (this.game.armor) { amount = this.game.armor.absorb(amount, kind); if (!(amount > 0)) return; }
        this.hp = Math.max(0, this.hp - amount);
        this.hurtAt = performance.now(); // (in a fight: the microphone listens for spells — main.js)
        this.game.castleLife?.guard?.masterHurt(this.game.localId, byId, kind); // (my knights, if I am a king: whoever did it is their first enemy — Bodyguard.js)
        this.game.hud.damageFlash();
        if (this.game.sound) this.game.sound.playHit();
        if (this.hp <= 0) this.die(byId, kind);
    }

    die(byId, how) {
        if (this.dead) return;
        this.dead = true;
        this.game.levitation?.dropMe?.(false);
        this.hp = 0;
        const name = byId ? this.game.playerName(byId) : null;
        const text = how === 'avada'
            ? `💚 Авада Кедавра. ${name ? `Вас победил ${name}` : 'Вы погибли'}`
            : how === 'decap'
            ? `🗡️ ${name ? `${name} отрубил вам голову` : 'Вам отрубили голову'}`
            : how === 'pilbidrio'
            ? `✨💥 ${name ? `${name} разорвал вас «Пилбидрио»` : 'Вас разорвало «Пилбидрио»'}`
            : how === 'die'
            ? `🖤 «Дай». ${name ? `${name} испепелил вас` : 'Вас испепелило'} — ни тела, ни вещей, прежняя сила потеряна навсегда`
            : how === 'shatter'
            ? `🧊💥 ${name ? `${name} разбил вас` : 'Вас разбили'}, пока вы были заморожены`
            : `💀 ${name ? `Вас победил ${name}` : 'Вы погибли'}`;
        if (how === 'shatter') {
            const c = this.center(_v1);
            for (let i = 0; i < 60; i++) this.game.fx.spark(c, 0xd6f3ff, 0.25, _v2.set((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12), 1.0);
        }
        this.game.onLocalDeath(text, byId);
    }

    // ================================================================ update
    update(dt) {
        if (this.slowLeft > 0) {
            this.slowLeft = Math.max(0, this.slowLeft - dt);
            const ch = this.game.character;
            if (ch) ch.slowScale = this.slowLeft > 0 ? SLOW.SCALE : 1;
            if (!this.stunned && !this.frozen) this.game.hud.setStatus?.(this.slowLeft > 0 ? `🏜️ Даст: песок в глазах — вы замедлены ещё <b>${Math.ceil(this.slowLeft)}</b> с` : '');
        }
        if (this.stunLeft > 0) {
            this.stunLeft = Math.max(0, this.stunLeft - dt);
            const left = `<b>${Math.ceil(this.stunLeft)}</b> с`;
            this.game.hud.setStatus(this.stunLeft > 0
                ? (this.stunKind === 'quake' ? `🌋 Вас сбило землетрясением — встанете через ${left}` : this.stunKind === 'water' ? `🌊 Вас сбило водой — встанете через ${left}` : this.stunKind === 'fall' ? `🦵 Вы упали — встанете через ${left}` : `💫 Остолбеней! Вы не можете двигаться ещё ${left}`)
                : '');
            if (this.stunLeft <= 0 && (this.stunKind === 'quake' || this.stunKind === 'water' || this.stunKind === 'fall')) this.game.character.knockedDown = false;
        }
        if (!this.enabled) {
            // Other modes: only the shield and the ice of «Айс» (no HP / fatigue rules)
            if (this.frozenLeft > 0) {
                this.frozenLeft = Math.max(0, this.frozenLeft - dt);
                const hud = this.game.hud;
                hud.setStatus?.(this.frozen ? `🧊 Вас заморозили «Айсом» — разморозка через <b>${Math.ceil(this.frozenLeft)}</b> с` : '');
                hud.setFrozenOverlay?.(this.frozen ? 1 : 0);
                if (!this.frozen) hud.setVoice?.('🧊 Вы разморозились', true);
            }
            if (this.shield) { this.shield.left -= dt; this._shieldJerk(dt); if (this.shield && this.shield.left <= 0) this.shield = null; }
            this._updateVisuals(dt);
            return;
        }
        // (a held «Protection» or a living tree spends the strength instead of it coming back)
        const holding = this.shield?.drain != null;
        const tree = !!this.game.livingTrees?.draining;
        // (a held «Protection» spends the strength instead of it coming back)
        if (!this.dead && !holding && !tree) this.fatigue = Math.min(this.maxFatigue || PVP.MAX_FATIGUE, this.fatigue + PVP.FATIGUE_REGEN * (this.game.armor?.stat('manaRegen') ?? 1) * (this.game.achievements?.regenK ?? 1) * regenCellsK(this.maxFatigue) * dt); // (achievements: +15 % each, «Высший маг» +100 %; every 100 cells of the maximum +10 %: ManaRegen.js)
        this._regenTierCheck();
        if (holding) {
            this.fatigue = Math.max(0, this.fatigue - this.shield.drain * dt);
            this.shield.left = this.fatigue / this.shield.drain;
            this._shieldJerk(dt);
            if (this.shield && this.fatigue <= 0) this._shatter(this.shield.gods ? '✨ Божественная защита погасла — мана кончилась' : this.shield.type === 2 ? '🛡️ Купол рассыпался — мана кончилась' : '🛡️ Щит рассыпался — мана кончилась');
        } else if (this.shield) { this.shield.left -= dt; if (this.shield.left <= 0) this.shield = null; }
        if (this.frozenLeft > 0) {
            this.frozenLeft = Math.max(0, this.frozenLeft - dt);
            if (this.frozenLeft === 0) this.game.hud.setVoice('🧊 Вы разморозились', true);
        }
        this.chillTimer -= dt;
        if (this.chillTimer <= 0 && this.chill > 0) this.chill = Math.max(0, this.chill - dt * 0.3);
        this.infernoCooldown -= dt;
        for (const t of this.targets.values()) t.damageCooldown -= dt;
        this.game.character.slowScale = this.frozen ? 0 : (1 - 0.6 * this.chill) * (this.slowLeft > 0 ? SLOW.SCALE : 1); // (the ice beam's cold slows the legs; «Даст»'s sand too)

        this._updateVisuals(dt);
        this._hud();
    }

    /** My own shield / ice shell. */
    _updateVisuals(dt) {
        if (!this.visuals) return;
        const ch = this.game.character;
        const side = this.shield?.side || 'right';
        this.visuals.update(dt, this.state(), {
            center: this.center(_v1).clone(),
            hand: this.shieldAt(side, new THREE.Vector3()), // (at the wand's tip when it is in that hand)
            dir: ch.getHandDirection(side, new THREE.Vector3()),
        });
    }

    _hud() {
        const hud = this.game.hud;
        const key = `${this.hp}|${Math.floor(this.fatigue)}|${Math.ceil(this.frozenLeft)}|${Math.round(this.chill * 10)}|${Math.ceil(this.stunLeft || 0)}`;
        if (key === this._hudKey) return;
        this._hudKey = key;
        hud.update(this.hp, this.maxHp || PVP.MAX_HP, this.game.killCount, this.game.punchCount);
        hud.setFatigue(this.fatigue, this.maxFatigue || PVP.MAX_FATIGUE);
        if (this.stunned) return; // the stun message is shown by update()
        hud.setStatus(this.frozen
            ? `🧊 Вас заморозили! Разморозка через <b>${Math.ceil(this.frozenLeft)}</b> с. Любой удар сейчас смертелен`
            : this.chill > 0.05 ? `❄️ Вас замораживают: ${Math.round(this.chill * 100)}% — убегайте из луча!` : '');
        hud.setFrozenOverlay(this.frozen ? 1 : this.chill);
    }

    /** Sent to other players with the pose (shield and ice shell are visible to all). */
    state() {
        return {
            shield: this.shield ? this.shield.type : 0,
            side: this.shield ? this.shield.side : 'right',
            shieldLeft: this.shield ? Math.min(this.shield.left, 1e6) : 0, // (Creative's endless one: a number the network can carry)
            gods: !!this.shield?.gods, // (the gods' shield: gold — ProtectionGods.js)
            frozen: this.frozen,
        };
    }

    serialize() {
        if (!this.enabled && !this.shield && !this.frozen) return null; // (the ice shell of «Айс» is seen in every mode)
        const s = this.shield;
        return [s ? s.type : 0, s && s.side === 'left' ? 1 : 0, s ? Math.round(s.left * 10) / 10 : 0, Math.ceil(this.frozenLeft), this.brokeN || 0, s?.gods ? 1 : 0, s?.wand ? 1 : 0]; // (the 5th: how many times it shattered — the others see the pieces; the 6th: the gods' shield, gold; the 7th: at the wand's tip)
    }

    // ============================================================ melee out
    /** Fake "zombie" objects for remote players so weapons can hit them. */
    meleeTargets() {
        if (!this.enabled) return [];
        const out = [];
        for (const [id, r] of this.game.remotes) {
            if (r.dead) continue;
            let t = this.targets.get(id);
            if (!t) {
                t = { isPlayer: true, id, isDead: false, damageCooldown: 0, group: r.character.group };
                this.targets.set(id, t);
            }
            t.group = r.character.group;
            out.push(t);
        }
        return out;
    }

    /** The weapons' / fists' target object of a remote player (made on first use). */
    meleeTarget(id) {
        let t = this.targets.get(id);
        const r = this.game.remotes.get(id);
        if (!t) { t = { isPlayer: true, id, isDead: false, damageCooldown: 0, group: r?.character.group }; this.targets.set(id, t); }
        if (r) t.group = r.character.group;
        return t;
    }

    /** My fist or weapon hit another player (extra: the blow itself — BodyStrikes). */
    hitRemote(target, dmg, magic = false, hit = null, extra = null) {
        if (target.damageCooldown > 0) { if (extra && this.game.sync?.playerPush) this.game.sync.playerPush(target.id, extra); return; }
        target.damageCooldown = 0.45;
        if (this.game.sync) this.game.sync.playerHit(target.id, dmg, magic, hit, extra);
        const p = _v1.copy(target.group.position).add(_v2.set(0, 1.2, 0));
        for (let i = 0; i < 8; i++) this.game.fx.spark(p, 0xff3030, 0.15, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.4);
        if (this.game.sound) this.game.sound.playHit();
    }

    dispose() {
        this.visuals?.dispose();
    }
}
