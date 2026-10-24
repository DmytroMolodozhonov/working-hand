/**
 * Duel.js — duel magic: spells cast straight at a creature (a wizard or a zombie).
 *
 *   Остолбеней (Stupefy)      the target can't move or cast for 15 s
 *   Авада Кедавра             instant death (green)
 *   Айс                       a spinning ice crystal on a frosty beam: locks the target in ice
 *                             (a wizard 20 s — any hit shatters him —, 5 s in Creative; a creature 8 s)
 *   Вингардиум Левиоса        on a creature: throws it up into the air
 *   Сапира                    a slow, heavy violet charge: 4 HP to a wizard, 10 to a zombie
 *   Экспеллиармус             a crimson charge: the wand (or the sword) flies out of the hand (Expelliarmus.js)
 *   Джолт (Jolt)              a bolt of invisible air: a hard shove straight away from the caster — the
 *                             body flies back, tumbles over in the air, falls, lies a few seconds and
 *                             gets up dizzy (JOLT, JOLT_TARGETS); «Джолт Максима» three times as strong
 *
 * A duel spell is not an instant beam: a crackling, jagged charge flies from
 * the hand (fast, ~0.7 s over 10 m) and acts only when it touches. It flies
 * where the hand points (as the player sees it — in flight too): a creature is
 * its target only when the hand points right at it (a few degrees beside the
 * body at most; the nearest one along that line), and towards it the charge
 * turns a little (AIM.BEND, ~7°, in all) — never round after it. Whatever body
 * it really touches on its way is hit; nothing touched — it flies on straight.
 * Until it touches, the target can:
 *   - raise a shield («Protection») — the charge bursts on it, or
 *   - answer with any duel spell aimed back: the two charges meet and push
 *     against each other. The meeting point slides towards the weaker wizard;
 *     who it reaches loses and gets the other's spell. Strength: fatigue
 *     first, then HP, plus ~10 % luck. Both must keep the hand on the
 *     opponent — a hand taken off stops pushing (the point creeps to you).
 *     To leave safely: first move the hand calmly off the opponent, THEN
 *     flick it (shake the spell off) — the duel ends, nobody is hit.
 *     A flick while still aiming at the opponent (or at yourself) = giving
 *     up: the opponent's spell hits you.
 *
 * Network: the caster announces a charge ('duel'); the target's own computer
 * decides a hit on a wizard (it knows its shield), the host decides zombies
 * and referees duels ('clash' / 'clashend').
 */

import { isSpectator } from './ArenaDome.js';
import * as THREE from 'three';
import { SegmentPool } from '../fx/Particles.js';
import { PVP } from './Combat.js';
import { DAMAGE } from './Damage.js';
import { SLOW } from './Slow.js';
import { sharpJerk } from './Jerk.js';
import { spiderBody, spiderCenter } from './Spider.js';
import { dragonBody, dragonCenter } from './Dragons.js';
import { phoenixBody, phoenixCenter } from './Phoenixes.js';
import { owlBody, owlCenter } from './Owls.js';
import { gargoyleBody, gargoyleCenter } from './GargoyleModel.js';
import { iceBody, iceCenter } from './IceQueen.js';
import { DUEL_SPELL_NAME } from './Mana.js';
import { AvadaLook, AVADA } from '../fx/AvadaLook.js';
import { IceLook } from '../fx/IceLook.js';
import { knockOutOfMyHand, disarmVillager, wizardWandOf } from './Expelliarmus.js';
import { wandPower } from './WandMagic.js';
import { JoltLook } from '../fx/JoltLook.js';
import { DOOR_SPELLS } from './Doors.js';
import { SPELL_PHYSICS } from './Impact.js';
import { kindOf } from './CreatureImpact.js';
import { duelStrength, duelPower } from './WizardAI.js';
import { bodySpan } from './AnimalHerd.js';
import { ROBE_BLOCKS, MAGIC_SET_BLOCKS } from './ArmorTypes.js';
import { isStrongDuel, isIceCharge, clashPower, STRONG } from './StrongSpells.js';
import { manaRules, duelStrengthOf, creativeFiniteMana } from './HeroSetup.js';

/** The duel charges' own cast sounds (SpellMusic FX); the rest — Sapira's. */
const DUEL_FX = { Stupefy: 'fxStupefy', AvadaKedavra: 'fxAvada', Expelliarmus: 'fxExpel', Disarmor: 'fxDisarmor' };
export { JERK, sharpJerk } from './Jerk.js';

const _tipP = new THREE.Vector3(), _tipQ = new THREE.Quaternion(), _tipD = new THREE.Quaternion();
export const DUEL_SPELLS = {
    Stupefy: { color: 0xff3b3b, name: 'Остолбеней' },
    // a poison-green charge: an acid core (never white), a murky swamp-green glow, smoke and sparks (AvadaLook.js);
    // the same green for every wizard (`fixed`: only a slight shade apart, so two of them in a clash still differ)
    AvadaKedavra: { color: AVADA.MURK, name: 'Авада Кедавра', coreColor: AVADA.CORE, core: 0.07, glow: 0.3, light: AVADA.LIGHT, fixed: true },
    // «Айс»: a thin frosty beam (no crackling) with a spinning ice crystal at its head (IceLook.js)
    IceDuel: { color: 0x8fdcff, name: 'Айс', speed: 17, core: 0.035, glow: 0.15, coreColor: 0xf2fbff },
    // («Левиоса» on a wizard is aimed as loosely as at a thing — Levitation.aimWizard: the charge
    //  turns after the body pointed at much more than a fighting spell, so a friend who moves
    //  on, or stands a little beside the hand's line, is still reached)
    LevitateDuel: { color: 0xffd36e, name: 'Вингардиум Левиоса', bend: 0.8, turn: 6 },
    // Slower and thicker: a dark-violet ball of force rolling through the air
    SapiraDuel: { color: 0x8e2de2, name: 'Сапира', speed: 7, core: 0.09, glow: 0.42, coreColor: 0xe6c8ff },
    // «Даст»: a sandy charge — whoever it hits is slowed for 5 s
    SandsDuel: { color: 0xd2b48c, name: 'Даст', speed: 13, coreColor: 0xfff1cf },
    // «Экспеллиармус»: a deep crimson bolt with a white-hot core (Остолбеней is a lighter red)
    Expelliarmus: { color: 0xc8102e, name: 'Экспеллиармус', speed: 16, core: 0.045, glow: 0.2, coreColor: 0xffffff },
    // «Disarmor»: a cold steel-grey bolt — the plain armour flies off the one it touches (Armor.js)
    Disarmor: { color: 0x8fa3b8, name: 'Disarmor', speed: 16, core: 0.04, glow: 0.18, coreColor: 0xf2f6ff },
    // «Джолт»: a short, sharp bolt of invisible air — a pale trembling line, rings of shoved air (JoltLook.js)
    //  (as fast as the other duel charges: there must be time to answer it — or it to answer — and meet: a duel)
    Jolt: { color: 0xa9d6ff, name: 'Джолт', speed: 15.5, core: 0.018, glow: 0.07, coreColor: 0xeaf6ff },
    JoltMaxima: { color: 0xc4e4ff, name: 'Джолт Максима', speed: 15.5, core: 0.026, glow: 0.11, coreColor: 0xffffff },
    // «Айс Максима» (= «Frozen Maxima», «Ice Maxima»): a thicker, brighter frosty beam (StrongMagic.iceCreature)
    IceDuelMaxima: { color: 0x6fc8ff, name: 'Айс Максима', speed: 17, core: 0.05, glow: 0.22, coreColor: 0xffffff },
    // the strong duel spells (StrongSpells.js): the same flying charge — another light, another sound, another harm
    // «Акцентрик»: a lilac charge twisting as it flies
    Accentric: { color: 0xc05cff, name: 'Акцентрик', speed: 15, core: 0.05, glow: 0.3, coreColor: 0xffd6ff, jag: 1.4 },
    // «Пилбидрио»: a straight beam of white-gold light
    Pilbidrio: { color: 0xfff1b0, name: 'Пилбидрио', speed: 20, core: 0.07, glow: 0.34, coreColor: 0xffffff, jag: 0.25 },
    // «Дай»: a black beam (its core drawn over, not added — black stays black) in a dark-violet haze
    Die: { color: 0x3a0060, name: 'Дай', speed: 16, core: 0.085, glow: 0.32, coreColor: 0x000000, fixed: true, light: 0x5a00a0 },
    // «Электром»: real lightning — a jagged crackling line (held on the target afterwards: StrongMagic)
    Electrum: { color: 0x5fc8ff, name: 'Электром', speed: 26, core: 0.04, glow: 0.2, coreColor: 0xffffff, jag: 2.4 },
};

/**
 * «Джолт» / «Джолт Максима» (3× the push): only a shove — no damage of its own (a fall from up
 * high — a cliff, a wall, over a ship's side — hurts as any such fall does).
 *   push / toss  hero m/s away from the caster along the charge / up (Impact.SPELL_PHYSICS):
 *                the body flies several metres back (Maxima: much farther and higher)
 *   down         s it lies at least (creatures then get up by themselves; a player squats and straightens)
 *   turns        how many times the body tumbles over in the air before it lands
 *   daze         s a creature is dizzy afterwards: it reels and staggers about, a wizard aims badly
 *                (a player: the head spins — Knockdown.daze, by how hard the blow was)
 *   things       m/s a loose thing on the charge's way is shoved along it
 */
export const JOLT = {
    Jolt: { ...SPELL_PHYSICS.Jolt, turns: 1, daze: 6, things: 7 },
    JoltMaxima: { ...SPELL_PHYSICS.JoltMaxima, turns: 2, daze: 12, things: 21 },
};
export const isJolt = (spell) => spell === 'Jolt' || spell === 'JoltMaxima';

/**
 * Who / what «Джолт» acts on and how (CLAUDE.md: every creature and thing decided — «no effect» too).
 */
export const JOLT_TARGETS = {
    me: 'my own computer decides (it knows my shield): thrown back, a flip in the air, down; up by a squat; the head spins afterwards',
    players: 'another player: the charge is seen by all, the hit is applied on his own computer (as above)',
    zombies: 'thrown back, tumble, lie, get up by themselves, then stagger about dizzy (host)',
    castlePeople: 'villagers, knights (heavier: fly less), the king, merchants, wizards (a dazed wizard aims badly); a raised shield / the Master\'s dome stops it',
    animals: 'heavy cows and horses fly less; pigs, sheep further; a flying pig / Pegasus is knocked out of the air; a horse with a rider only reels (the rider holds it)',
    sailors: 'on a ship: shoved across the deck in the ship\'s frame — a hard one goes over the side (Sailors.shove)',
    spider: 'too big and too many legs: it only reels back a little and is dazed for a moment (no damage)',
    livingTrees: 'rooted: it only reels (never falls — its own fall is its death); no damage',
    dragon: 'a great heavy body: it only sways a little, the jolt wakes and angers it (no damage) — Dragons.boltHit',
    iceCastle: 'a snowman is thrown back; the queen and her ice monsters only sway (no damage: a spell without a scroll) — IceCastleLife.boltHit',
    blackship: 'Captain Black Moustache: thrown back as a man — unless his rapier beats the charge aside (Sailors.parryBolt); a skeleton: thrown back, no harm (no duel charge harms it — Sailors.pirateBoneDamage)',
    phoenix: 'a light bird: thrown back through the air, tumbling, no damage; an attack (it flies off) — Phoenixes.boltHit',
    owl: 'no effect: a simple charge — the clever owl darts away untouched (and no longer loves the caster) — Owls.boltHit',
    gargoyle: 'a stone body of the infernal gargoyle: «Остолбеней» −6, «Джолт» −8 and a shove, the strong charges hurt, «Айс» slows it, «Авада» does not act (not alive) — Gargoyles.boltHit; a body in every charge\'s way (_bodies)',
    bookBirds: 'knocked out of the air: it falls as a book (as by any charge)',
    servants: 'the same creatures as above (a servant is a zombie, a villager, an animal or a tree)',
    carts: 'no effect on a cart on the road: far too heavy, its horses in the shafts; the charge bursts on its boards (Carriages.js — a mover); its horses and riders: as animals and castle people',
    looseThings: 'shoved along the charge as it passes (where their physics runs)',
    heldThings: 'stay in the hand: a hand opens only when the person opens it',
    world: 'no effect on ships, houses, walls, trees, water, the ground: the charge bursts on the rock / a house\'s sphere',
};

export const DUEL = {
    SPEED: 15, // m/s — fast (≈0.7 s over 10 m), but still visible and answerable
    RANGE: 30, // m
    RANGE_DIE: 50, // m: «Дай» (1000 mana, one charge in a fight) reaches farther than the rest
    CONTACT_ANGLE: 0.9, // rad: hand still on the opponent (~50°: aiming roughly is enough)
    CONTACT_GRACE: 0.25, // s off the opponent before a flick counts as "shaking it off"
    PUSH: 0.16, // how fast the meeting point moves per unit of strength difference
    LUCK: 0.1, // ±10 % random
    STUN_TIME: 15,
    CLASH_FATIGUE: 1, // mana per second while pushing (free world), each side
    MAXIMA_BOOST: 0.05, // «Максима» shouted in a clash: the meeting point goes 5 % of the way a second faster to the opponent (they add up)
    MAXIMA_COST: 5, // mana, at once
    MAXIMA_EVERY: 3, // s: at most once every 3 seconds
    MAXIMA_LIFE: 6, // s: one shout pushes this long, then it is spent (they add up only while they last: a wizard shouting every 3 s no longer buries any strength)
};

/**
 * The extra push of «Максима» shouts in a clash (a's shouts minus b's; only a hand still on the
 * opponent pushes): +5 % of the way a second towards the opponent for each shout.
 */
export function maximaPush(boostA = 0, boostB = 0) {
    return DUEL.MAXIMA_BOOST * (Math.max(0, boostA | 0) - Math.max(0, boostB | 0));
}

/** How many of the shouts (times `t` in the clash's own clock) still push at time `now`. */
export function liveShouts(times, now) {
    let n = 0;
    if (times) for (let i = 0; i < times.length; i++) if (now - times[i] < DUEL.MAXIMA_LIFE) n++;
    return n;
}

/**
 * How fast the meeting point moves for a strength difference `d`: PUSH per unit while it is small,
 * softer as it grows (a much stronger wizard still wins, but in seconds you can see — not at once).
 */
export function clashPush(d) {
    return DUEL.PUSH * d / (1 + 0.5 * Math.abs(d));
}

/** Two charges meet (a duel starts): flying against each other, passing this close. */
export const CLASH = {
    MEET: 1.6, // m between their heads (or a head and the other's beam): the heroes are big, the hands never quite on the line
    FACING: 0.2, // their ways more against each other than this (cos; −0.2 ≈ 100° apart)
    WAIT: 1.5, // s a charge that reached me waits while my own answer flies against it (the host may see them meet a moment later)
};

/** Where a charge goes: along the hand; a target only right on that line, and only a small correction towards it. */
export const AIM = {
    // (a real camera hand is never exactly on a small, moving target — a flying book, a running
    //  animal: the help is noticeable, but a hand pointing well beside it still misses)
    CONE: 0.12, // rad (~7°): how far beside a body the hand may point and still mean it
    BEND: 0.21, // rad (~12°): the most a charge ever turns off the line it was cast along
    TURN: 3.2, // rad/s: how fast it turns while correcting (it finds the target quickly)
};

/** Body sizes (metres) as a charge touches them: a line a–b and a radius around it. */
export const BODY = {
    HERO: { DOWN: 1.3, UP: 2.15, R: 0.7 }, // a wizard: from the soles (2.0 below the body origin) to the hair (2.85 above), along the body
    ZOMBIE: { DOWN: -0.1, UP: 2.0, R: 0.7 },
    VILLAGER: { DOWN: 1.25, UP: 2.0, R: 0.7 },
    BIRD: 0.8, // (a flapping book: its wings reach out further than its covers)
};

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _bx = new THREE.Vector3();
const _ch = new THREE.Vector3(), _cd = new THREE.Vector3(), _co = new THREE.Vector3();

/**
 * Where the line from `o` along the unit direction `d` (forwards only) comes closest to
 * the segment a–b: {along: how far along the line, k: 0…1 on the segment, dist: how close}.
 */
export function rayToSegment(o, d, a, b, out = {}) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
    const B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz;
    const D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let k = 0;
    const den = C - B * B;
    if (C > 1e-9) k = den > 1e-9 ? clamp01((E - B * D) / den) : 0;
    const t = Math.max(0, k * B - D);
    if (C > 1e-9) k = clamp01((E + t * B) / C);
    const px = wx + t * d.x - k * ux, py = wy + t * d.y - k * uy, pz = wz + t * d.z - k * uz;
    out.along = t;
    out.k = k;
    out.dist = Math.sqrt(px * px + py * py + pz * pz);
    return out;
}

/**
 * Where the segment p–q (a charge's move this frame) comes closest to the segment a–b:
 * {s: 0…1 on p–q, k: 0…1 on a–b, dist}.
 */
export function segmentToSegment(p, q, a, b, out = {}) {
    const d1x = q.x - p.x, d1y = q.y - p.y, d1z = q.z - p.z;
    const d2x = b.x - a.x, d2y = b.y - a.y, d2z = b.z - a.z;
    const rx = p.x - a.x, ry = p.y - a.y, rz = p.z - a.z;
    const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
    const F = d2x * rx + d2y * ry + d2z * rz;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let s = 0, k = 0;
    if (A <= 1e-12 && E <= 1e-12) { s = 0; k = 0; }
    else if (A <= 1e-12) { s = 0; k = clamp01(F / E); }
    else {
        const C = d1x * rx + d1y * ry + d1z * rz;
        if (E <= 1e-12) { k = 0; s = clamp01(-C / A); }
        else {
            const Bv = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = A * E - Bv * Bv;
            s = den > 1e-12 ? clamp01((Bv * F - C * E) / den) : 0;
            k = (Bv * s + F) / E;
            if (k < 0) { k = 0; s = clamp01(-C / A); }
            else if (k > 1) { k = 1; s = clamp01((Bv - C) / A); }
        }
    }
    const px = rx + d1x * s - d2x * k, py = ry + d1y * s - d2y * k, pz = rz + d1z * s - d2z * k;
    out.s = s;
    out.k = k;
    out.dist = Math.sqrt(px * px + py * py + pz * pz);
    return out;
}

/**
 * The body the hand points at: the line from `o` along `d` passes it within AIM.CONE
 * plus the body's own angular size (a big body is easier to point at), and of those the
 * nearest along the line. bodies: [{a, b, r, …}]. → {body, along, k, dist, miss} | null
 * (miss: how far beside the body the line goes, rad; 0 = right through it).
 */
/** How far a duel charge of this spell flies, m. */
export const duelRange = (spell) => (spell === 'Die' ? DUEL.RANGE_DIE : DUEL.RANGE);

export function pickBody(o, d, bodies, range = DUEL.RANGE) {
    let best = null;
    const c = {};
    for (const body of bodies) {
        rayToSegment(o, d, body.a, body.b, c);
        if (c.along < 0.5 || c.along > range) continue;
        if (Math.atan2(c.dist, c.along) > AIM.CONE + Math.atan2(body.r, c.along)) continue;
        if (!best || c.along < best.along) best = { body, along: c.along, k: c.k, dist: c.dist, miss: Math.max(0, Math.atan2(c.dist - body.r, c.along)) };
    }
    return best;
}

/**
 * A flying charge corrects its way a little: `dir` turns towards `want` by at most `step`
 * rad now, and never more than `maxBend` off the line it was cast along (`d0`), however
 * far its target is. Unit vectors; `dir` is changed and returned.
 */
export function bendToward(dir, d0, want, step, maxBend = AIM.BEND) {
    const ang = dir.angleTo(want);
    if (ang > 1e-7 && step > 0) {
        _bx.crossVectors(dir, want);
        if (_bx.lengthSq() > 1e-14) dir.applyAxisAngle(_bx.normalize(), Math.min(step, ang));
    }
    const off = dir.angleTo(d0);
    if (off > maxBend) {
        _bx.crossVectors(d0, dir);
        if (_bx.lengthSq() > 1e-14) dir.copy(d0).applyAxisAngle(_bx.normalize(), maxBend);
        else dir.copy(d0);
    }
    return dir.normalize();
}

/** The first of `bodies` the move p→q touches: {body, s (0…1 along the move), k} | null. */
export function firstTouched(p, q, bodies) {
    let best = null;
    const c = {};
    for (const body of bodies) {
        segmentToSegment(p, q, body.a, body.b, c);
        if (c.dist > body.r) continue;
        if (!best || c.s < best.s) best = { body, s: c.s, k: c.k };
    }
    return best;
}

const _v1 = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _vFrom = new THREE.Vector3();
const _vPass = new THREE.Vector3();
const _armSh = new THREE.Vector3(), _armTip = new THREE.Vector3(), _armC = {};
/**
 * The line of the arm (Duel.armStart): a body counts when it comes this close to it (× its
 * radius: the arm going into its body anywhere, its edge too — a charge flying there would hit
 * it as well; a man beside the arm is not hit); the spell then starts BACK m before it (rays
 * look only forwards from their start).
 */
export const ARM = { BODY: 1, BACK: 0.3 };
const _c2 = new THREE.Color();
const _da = new THREE.Vector3(), _db = new THREE.Vector3(), _dd = new THREE.Vector3(), _ds = new THREE.Vector3(), _du = new THREE.Vector3();

/** The wand a castle wizard holds: a student's plain wooden one, the others' a real (random) one. */
// (a wizard in a magic robe has a fine wand: strong, +35–50 % power)
let nextId = 1;

/** Marker colours of wizards in a clash (blue, orange, magenta, green): who is who. */
export const DUEL_MARK = [0x2f7dff, 0xff8a1a, 0xff2fd0, 0x3dff6e];
/** The two wizards' marker slots: their own, never the same. */
export function markSlots(sa, sb) { return [sa, sb === sa ? (sa + 1) % DUEL_MARK.length : sb]; }
/** From A's side: lead −1…1 (+ = A is winning), push −1…1 (who pushes harder right now). */
export function clashLead(p, v) {
    return { lead: Math.max(-1, Math.min(1, (p - 0.5) * 2)), push: Math.max(-1, Math.min(1, (v || 0) / 0.12)) };
}
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _mA = new THREE.Vector3(), _mB = new THREE.Vector3();
let _ringGeo = null;

export class Duel {
    constructor(game) {
        this.game = game;
        this.bolts = new Map(); // id -> bolt
        // real light of the flying charges (cave walls, ground, creatures): a few lights reused for the nearest charges
        this.boltLights = [0, 1, 2].map(() => new THREE.PointLight(0xffffff, 0, 16, 2));
        for (const l of this.boltLights) game.scene?.add(l);
        this.clashes = []; // {a, b, p, ...}
        this._t = 0;
        // Crackling charges: a thin bright core + a soft glow, one pair per spell AND
        // wizard: the same spell looks a bit different for each player (own shade and
        // core colour), so two charges pushing against each other stay apart
        this.pools = {};
        for (const key of Object.keys(DUEL_SPELLS)) this._pool(key, 0);
        // Glowing "centre of force" where two charges meet
        this._orbs = [];
        this._orbsUsed = 0;
        this.markPools = {}; // the thin core of each wizard's beam, in their marker colour
        this.jerk = { left: [], right: [] }; // hand history for "giving up"
        this.log = []; // last duel events (for testing / debugging)
        this.ice = new IceLook(game); // how «Айс» looks
        this.jolt = new JoltLook(game); // how «Джолт» looks
        this.avada = new AvadaLook(game); // how «Авада Кедавра» looks
    }

    /** 0..3: this wizard's colour signature (same on every computer). */
    _slot(by) {
        const p = this.game.net?.players?.get?.(by);
        if (p && Number.isFinite(p.color)) return p.color % 4;
        let h = 0;
        for (const ch of String(by)) h = (h * 31 + ch.charCodeAt(0)) | 0;
        return Math.abs(h) % 4;
    }

    /** Colours of `spell` cast by wizard `by`: {glow, core}. */
    colors(spell, by) {
        const slot = typeof by === 'number' ? by : this._slot(by);
        const s = DUEL_SPELLS[spell];
        const shift = [0, 0.085, -0.085, 0.17][slot] * (s.fixed ? 0.15 : 1);
        const glow = new THREE.Color(s.color).offsetHSL(shift, 0, slot ? 0.04 : 0).getHex();
        const core = slot === 0 || s.fixed ? (s.coreColor || 0xffffff) : [0xffffff, 0xfff08a, 0x9ff3ff, 0xffb3ec][slot];
        return { glow, core };
    }

    _pool(spell, by) {
        const slot = typeof by === 'number' ? by : this._slot(by);
        const key = spell + '|' + slot;
        if (!this.pools[key]) {
            const s = DUEL_SPELLS[spell];
            const c = this.colors(spell, slot);
            this.pools[key] = {
                core: new SegmentPool(this.game.scene, { capacity: 200, radius: s.core || 0.055, color: c.core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
                glow: new SegmentPool(this.game.scene, { capacity: 200, radius: s.glow || 0.24, color: c.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }),
            };
            // («Авада»: its acid core drawn over, not added — added to a bright day it washes out pale yellow-white;
            //  and its true poison green, not toned down — the same variant for every slot: one shader, built at the start)
            if (s.fixed) { const m = this.pools[key].core.mat; m.blending = THREE.NormalBlending; m.toneMapped = false; }
        }
        return this.pools[key];
    }

    get me() {
        return this.game.localId;
    }

    // ============================================================ targets
    /** Where my spell leaves this hand (the wand's tip, else the hand) and where the hand points. */
    _myRay(side, outPos, outDir) {
        const g = this.game, ch = g.character;
        if (g.castOrigin) g.castOrigin(side, outPos);
        else ch.getHandWorldPosition(side, outPos);
        // (as the player sees it: in flight without the body's forward tilt)
        if (ch.getPointingDirection) ch.getPointingDirection(side, outDir);
        else ch.getHandDirection(side, outDir);
        return outDir;
    }

    /**
     * Where a spell really leaves the hand: the wand's tip (`tip`) — unless the line of the arm,
     * from the shoulder (`from`) to that tip, already goes into somebody standing close (the tip
     * in them, or pushed right through them) or into a wall (the hand pushed into a block). Then
     * it leaves just before that body / wall: it hits them, never flies on from their far side.
     * `tip` is moved; true when it was. (`skip`: the caster — never his own body, nor the horse
     * he rides.) For every kind of spell: duel charges, «Бомбардо», rays (Game.spellStart).
     */
    armStart(from, tip, skip = this.me) {
        const h = this._armHit(from, tip, skip);
        if (!h) return false;
        tip.lerpVectors(from, tip, Math.max(0, h.s - h.back / h.len));
        return true;
    }

    /**
     * What the arm (shoulder `from` → wand's tip `tip`) goes into first: a body (`body`: its
     * kind and id — the tip in it, or pushed through it), or a wall / a door's leaf (`body` null:
     * nobody behind a wall is ever touched). {s (0…1 along the arm), back, len, body} | null
     */
    _armHit(from, tip, skip = this.me) {
        const len = from.distanceTo(tip);
        if (!(len > 1e-4) || len > 4) return null;
        const g = this.game;
        const horse = skip === this.me ? g.animals?.riding?.id : undefined;
        let s = 2, back = ARM.BACK, hit = null;
        for (const body of this._bodies(skip)) {
            if (body.kind === 'a' && body.id === horse) continue;
            segmentToSegment(from, tip, body.a, body.b, _armC);
            if (_armC.dist <= body.r * ARM.BODY && _armC.s < s) { s = _armC.s; hit = body; }
        }
        // a wall / a floor in the arm's way (looked at every 5 cm), and a door's leaf
        const t = g.terrain?.data;
        if (t) {
            const n = Math.ceil(len / 0.05);
            for (let i = 1; i <= n && i / n < s; i++) {
                const k = i / n;
                if (t.isSolidAt(from.x + (tip.x - from.x) * k, from.y + (tip.y - from.y) * k, from.z + (tip.z - from.z) * k)) { s = k; back = 0.05; hit = null; break; }
            }
        }
        const dh = g.doors?.segmentHit(from, tip);
        if (dh && dh.s < s) { s = dh.s; back = 0.05; hit = null; }
        if (s > 1) return null;
        return { s, back, len, body: hit ? { kind: hit.kind, id: hit.id } : null };
    }

    /**
     * Point blank: the creature my arm with the wand already goes into (it came right up to me —
     * the tip in its body, or through it), not behind a wall: {kind, id} | null. Every spell aimed
     * at a creature takes this one first (the line of the hand, starting beyond it, would miss it).
     */
    pointBlank(side) {
        const g = this.game, ch = g.character;
        const anchor = side === 'left' ? ch?.leftArmAnchor : ch?.rightArmAnchor;
        if (!anchor?.getWorldPosition) return null;
        const tip = g.castOrigin ? g.castOrigin(side, _armTip) : ch.getHandWorldPosition(side, _armTip);
        return this._armHit(anchor.getWorldPosition(_armSh), tip, this.me)?.body || null;
    }

    /**
     * The first body (any creature: knights, villagers, animals, sailors, trees, the spider…) the
     * move p→q touches — the point on the move, or null. (`noPlayers`: players are looked at by the
     * caller.) For things flying that are not duel charges: «Бомбардо»'s orb (SpellManager).
     */
    touchOnWay(p, q, skip = null, noPlayers = false) {
        let best = null;
        const horse = skip === this.me ? this.game.animals?.riding?.id : undefined;
        for (const body of this._bodies(skip)) {
            if ((noPlayers && body.kind === 'p') || (body.kind === 'a' && body.id === horse)) continue;
            segmentToSegment(p, q, body.a, body.b, _armC);
            if (_armC.dist <= body.r && (!best || _armC.s < best.s)) best = { s: _armC.s };
        }
        return best ? new THREE.Vector3().lerpVectors(p, q, best.s) : null;
    }

    /** My wand's tip (`out`, from castOrigin) pulled back along my arm by armStart. */
    myStart(side, out) {
        const ch = this.game.character;
        const anchor = side === 'left' ? ch?.leftArmAnchor : ch?.rightArmAnchor;
        if (anchor?.getWorldPosition) this.armStart(anchor.getWorldPosition(_armSh), out);
        return out;
    }

    /**
     * The creature this hand points at: a wizard, a zombie, an animal, a castle person or a
     * book-bird right on the line of the hand (see pickBody). {kind, id, dist, miss} | null
     */
    findTarget(side, range = DUEL.RANGE) {
        // (one standing right up against me, the wand in him: him — wherever the hand's line goes on)
        const pb = this.pointBlank(side);
        if (pb) return { kind: pb.kind, id: pb.id, dist: 0, miss: 0 };
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        this._myRay(side, o, d);
        const hit = pickBody(o, d, this._bodies(this.me), range);
        return hit ? { kind: hit.body.kind, id: hit.body.id, dist: hit.along, miss: hit.miss } : null;
    }

    /**
     * Every body a charge can touch (`skip`: the caster — never his own), as capsules
     * {kind, id, a, b, r}. (The entries are reused: read them before the next call.)
     */
    _bodies(skip = null) {
        const g = this.game;
        const pool = this._bpool || (this._bpool = []);
        const out = [];
        const put = (kind, id) => {
            let e = pool[out.length];
            if (!e) e = pool[out.length] = { kind, id, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
            e.kind = kind; e.id = id;
            out.push(e);
            return e;
        };
        if (skip !== this.me && g.character && !g.combat?.dead && !g.isDeadLocal) this._heroBody(g.character.group, put('p', this.me));
        for (const [id, r] of g.remotes || []) if (!r.dead && id !== skip) this._heroBody(r.character.group, put('p', id));
        for (const z of g.zombies || []) if (!z.isDead) this._tipped(z, this._zombieBody(z, put('z', z.id)));
        // animals and castle people are creatures too (Авада, Остолбеней… work on them)
        for (const a of g.animals?.targets() || []) this._roundBody('a', a, put('a', a.id));
        for (const v of g.castleLife?.targets(DUEL.RANGE_DIE + 5) || []) if (v.id !== skip && !isSpectator(v)) this._tipped(v, this._villagerBody(v, put('v', v.id))); // (never the wizard who cast it)
        // the ships' crews (on their decks, or swimming)
        for (const v of g.ships?.crew.byId.values() || []) if (!v.dead && v.id !== skip) this._tipped(v, this._villagerBody(v, put('c', v.id))); // (never Captain Black Moustache by the charge he beat back himself)
        for (const t of g.livingTrees?.targets() || []) this._treeBody(t, put('t', t.id));
        for (const bd of g.books?.birds?.values() || []) if (bd.state !== 'fall') this._roundBody('b', bd, put('b', bd.id));
        // the giant spider: its whole (big) body, nose to tail
        for (const sp of g.spiders?.targets() || []) spiderBody(sp, put('s', sp.id));
        // dragons: their great bodies (DragonKinds.ON_DRAGON: «Авада» only wounds them…)
        for (const dr of g.dragons?.targets() || []) dragonBody(dr, put('D', dr.id));
        // phoenixes (in the air or on the ground): their body from the tail to the breast
        for (const f of g.phoenixes?.targets() || []) phoenixBody(f, put('f', f.id));
        // clever owls: a small body (only «Авада Кедавра», a scroll's, hurts one — Owls.boltHit)
        for (const o of g.owls?.targets() || []) owlBody(o, put('o', o.id));
        // infernal gargoyles: a big body (a charge is no match for a flier that dodges — it hits as it hits: Gargoyles.boltHit)
        for (const o of g.gargoyles?.targets() || []) gargoyleBody(o, put('g', o.id));
        // the Ice Castle's creatures: the queen, the snowmen, the ice monsters (IceQueen.iceBolt says what a charge does)
        for (const c of g.iceCastle?.targets() || []) iceBody(c, put('I', c.id));
        // plant creatures (telewilpins, carnivorous heads): a charge hits the stem and the head (Plants.boltHit says what it does)
        for (const p of g.plants?.near || []) if (!p.dead) this._plantBody(p, put('P', p.id));
        return out;
    }

    /** One creature's body (as in _bodies), or null when it is gone. */
    _bodyOf(kind, id, e) {
        const g = this.game;
        e.kind = kind; e.id = id;
        if (kind === 'p') {
            if (id === this.me) return g.combat?.dead || g.isDeadLocal ? null : this._heroBody(g.character.group, e);
            const r = g.remotes?.get(id);
            return r && !r.dead ? this._heroBody(r.character.group, e) : null;
        }
        if (kind === 'z') {
            const z = g.zombieById?.get(id);
            return z && !z.isDead ? this._tipped(z, this._zombieBody(z, e)) : null;
        }
        if (kind === 's') { const sp = g.spiders?.byId(id); return sp ? spiderBody(sp, e) : null; }
        if (kind === 'D') { const dr = g.dragons?.byId(id); return dr ? dragonBody(dr, e) : null; }
        if (kind === 'f') { const f = g.phoenixes?.byId(id); return f ? phoenixBody(f, e) : null; }
        if (kind === 'o') { const o = g.owls?.byId(id); return o ? owlBody(o, e) : null; }
        if (kind === 'g') { const o = g.gargoyles?.byId(id); return o ? gargoyleBody(o, e) : null; }
        if (kind === 'I') { const c = g.iceCastle?.byId(id); return c ? iceBody(c, e) : null; }
        if (kind === 'P') { const p = g.plants?.byId.get(id); return p && !p.dead ? this._plantBody(p, e) : null; }
        const c = this._creature(kind, id);
        if (!c) return null;
        return kind === 'v' || kind === 'c' ? this._tipped(c, this._villagerBody(c, e)) : kind === 't' ? this._treeBody(c, e) : this._roundBody(kind, c, e);
    }

    /** A plant's body for a charge: the line from its foot to its top (the head's hinge), as thick as the stem and the bloom/jaws. */
    _plantBody(p, e) {
        const g = this.game;
        e.a.set(p.x, p.y + 0.3, p.z);
        g.plants._top(p, e.b);
        e.r = (p.kind === 'carnivore' ? 1.1 : 0.7) * p.s;
        return e;
    }

    /** A wizard's hero: along the body (upright, or lying flat flying like Superman). */
    _heroBody(group, e) {
        const up = _sa.set(0, 1, 0).applyQuaternion(group.quaternion);
        e.a.copy(group.position).addScaledVector(up, -BODY.HERO.DOWN);
        e.b.copy(group.position).addScaledVector(up, BODY.HERO.UP);
        e.r = BODY.HERO.R;
        return e;
    }

    /**
     * A creature knocked over / thrown (CreatureImpact tips its model on a pivot at the feet) is seen
     * lying or slanting, so the body a charge can touch lies the same way: the standing capsule `e`
     * is turned about that pivot (a charge at a body lying on the ground must not fly through it).
     */
    _tipped(c, e) {
        const piv = c.group?.userData?.impPivot || c.model?.root;
        if (!piv || Math.abs(piv.rotation.x) + Math.abs(piv.rotation.z) < 0.05) return e;
        piv.getWorldPosition(_tipP);
        if (piv.parent) piv.parent.getWorldQuaternion(_tipQ); else _tipQ.identity();
        _tipD.copy(_tipQ).multiply(piv.quaternion).multiply(_tipQ.invert());
        e.a.sub(_tipP).applyQuaternion(_tipD).add(_tipP);
        e.b.sub(_tipP).applyQuaternion(_tipD).add(_tipP);
        return e;
    }

    _zombieBody(z, e) {
        const p = z.group.position;
        e.a.set(p.x, p.y - BODY.ZOMBIE.DOWN, p.z);
        e.b.set(p.x, p.y + BODY.ZOMBIE.UP, p.z);
        e.r = BODY.ZOMBIE.R;
        return e;
    }

    _villagerBody(v, e) {
        // (the model's origin is the hip, as the player's: the feet 1.95 below it)
        const p = v.group ? v.group.position : _sb.set(v.x, v.y + 1.95, v.z);
        e.a.set(p.x, p.y - BODY.VILLAGER.DOWN, p.z);
        e.b.set(p.x, p.y + BODY.VILLAGER.UP, p.z);
        e.r = BODY.VILLAGER.R;
        return e;
    }

    /** A living tree: from its root feet up into its crown. */
    _treeBody(t, e) {
        const p = t.model.position, s = t.model.userData.s || 1;
        e.a.set(p.x, p.y + 0.5, p.z);
        e.b.set(p.x, p.y + 8.5 * s, p.z);
        e.r = 1.1 * s;
        return e;
    }

    /** An animal / a book-bird: a ball round its middle. */
    _roundBody(kind, c, e) {
        if (kind === 'a' && c.bodyH) {
            // (the grown bronze bull / the ram turned minotaur: its real tall body, not the sheep's ball)
            const s = bodySpan(c, {});
            e.r = s.r;
            e.a.set(s.x, s.bot + s.r, s.z);
            e.b.set(s.x, Math.max(s.bot + s.r, s.top - s.r), s.z);
            return e;
        }
        this._creaturePoint(c, e.a);
        e.b.copy(e.a);
        e.r = kind === 'a' ? this._animalBody(c).r : BODY.BIRD;
        return e;
    }

    /**
     * Which hand casts: a raised one pointing right at a creature (the spell hand when
     * both do). A hand hanging along the body points at nothing — in the air it would
     * point at whatever is below.
     */
    pickSide(preferPlayers = false, range = DUEL.RANGE) {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || g.dom || 'right';
        let best = null;
        const wand = g.wandSide?.(); // (a wand in a hand: only that hand casts)
        for (const side of wand ? [wand] : [pref, pref === 'right' ? 'left' : 'right']) {
            if (ch.isArmRaised && !ch.isArmRaised(side)) continue;
            const t = this.findTarget(side, range);
            if (!t || (preferPlayers && t.kind !== 'p')) continue;
            // (the hand pointing more truly at its target)
            if (!best || t.miss < best.t.miss - 0.005) best = { side, t };
        }
        return best;
    }

    /** The creature a raised hand points at farther than the spell reaches: its distance (m), else null. */
    farTarget(range) {
        const g = this.game, ch = g.character;
        const wand = g.wandSide?.();
        let best = null;
        for (const side of wand ? [wand] : ['right', 'left']) {
            if (ch.isArmRaised && !ch.isArmRaised(side)) continue;
            const o = new THREE.Vector3(), d = new THREE.Vector3();
            this._myRay(side, o, d);
            const hit = pickBody(o, d, this._bodies(this.me), 400);
            if (hit && hit.along > range && (!best || hit.along < best)) best = hit.along;
        }
        return best;
    }

    /** The middle of an animal / a villager (where a charge flies). */
    _creaturePoint(c, out) {
        if (c.isBird) return out.copy(c.model.position);
        if (c.isPhoenix) return phoenixCenter(c, out);
        if (c.isOwl) return owlCenter(c, out);
        if (c.isGargoyle) return gargoyleCenter(c, out);
        if (c.isLivingTree) return out.copy(c.model.position).add(_v2.set(0, 4.5 * (c.model.userData.s || 1), 0));
        if (c.isAnimal) return out.copy(c.group.position).add(_v2.set(0, this._animalBody(c).y, 0));
        return out.set(c.x, c.y + 2.4, c.z);
    }

    /** The middle of an animal's body above its feet and how big it is (measured once from the model). */
    _animalBody(a) {
        if (!a._body) {
            const box = new THREE.Box3().setFromObject(a.model || a.group);
            const size = box.getSize(new THREE.Vector3());
            a._body = { y: (box.min.y + box.max.y) / 2 - a.group.position.y, r: Math.max(0.6, Math.max(size.x, size.y, size.z) * 0.45) };
        }
        return a._body;
    }

    _creature(kind, id) {
        const g = this.game;
        if (kind === 'a') { const a = g.animals?.byId.get(id); return a && !a.dead ? a : null; }
        if (kind === 'v') { const v = g.castleLife?.byId.get(id); return v && !v.dead ? v : null; }
        if (kind === 'b') { const b = g.books?.birds?.get(id); return b && b.state !== 'fall' ? b : null; }
        if (kind === 't') { const t = g.livingTrees?.byId.get(id); return t && !t.isDead ? t : null; }
        if (kind === 'c') { const c = g.ships?.crew.byId.get(id); return c && !c.dead ? c : null; }
        if (kind === 'f') return g.phoenixes?.byId(id) || null; // (a phoenix)
        if (kind === 'o') return g.owls?.byId(id) || null; // (a clever owl)
        if (kind === 'g') return g.gargoyles?.byId(id) || null; // (an infernal gargoyle)
        if (kind === 'P') { const p = g.plants?.byId.get(id); return p && !p.dead ? p : null; } // (a plant creature)
        return null;
    }

    _targetPos(b, out) {
        const g = this.game;
        if (b.tk === 'a' || b.tk === 'v' || b.tk === 'b' || b.tk === 't' || b.tk === 'c' || b.tk === 'f' || b.tk === 'o') { const c = this._creature(b.tk, b.tid); return c ? this._creaturePoint(c, out) : null; }
        if (b.tk === 's') { const sp = g.spiders?.byId(b.tid); return sp ? spiderCenter(sp, out) : null; }
        if (b.tk === 'D') { const dr = g.dragons?.byId(b.tid); return dr ? dragonCenter(dr, out) : null; }
        if (b.tk === 'I') { const c = g.iceCastle?.byId(b.tid); return c ? iceCenter(c, out) : null; }
        if (b.tk === 'p') {
            if (b.tid === this.me) return g.combat.center(out);
            const r = g.remotes.get(b.tid);
            return r ? out.copy(r.position).add(_v2.set(0, 0.6, 0)) : null;
        }
        if (b.tk === 'z') {
            const z = g.zombieById.get(b.tid);
            return z && !z.isDead ? out.copy(z.group.position).add(_v2.set(0, 1.0, 0)) : null;
        }
        return null;
    }

    _handOf(by, side, outPos, outDir) {
        const g = this.game;
        if (by === this.me) {
            this._myRay(side, outPos, outDir);
            return true;
        }
        const r = g.remotes.get(by);
        if (!r) {
            // a tower's wizard: the tip of its wand
            const v = g.castleLife?.byId.get(by);
            if (!v?.wizard || v.dead) return false;
            v.model.getWandTip(outPos);
            v.model.getWandDir(outDir);
            return true;
        }
        const hp = r.handPose(side);
        outPos.copy(hp.origin);
        outDir.copy(hp.dir);
        return true;
    }

    // =============================================================== cast
    /**
     * Cast a duel spell from my hand: it flies where the hand points.
     * @param {string} spell  key of DUEL_SPELLS
     * @param {object} [aim] {side, t} from pickSide (else: from the spell hand, at whatever it points at)
     */
    cast(spell, aim = null, handSide = null) {
        const side = aim ? aim.side : (handSide || this.game.magicHand || this.game.lastMagicHand || this.game.dom || 'right');
        const origin = new THREE.Vector3(), dir = new THREE.Vector3();
        this._myRay(side, origin, dir);
        // somebody standing so close that the wand's tip is in them (or through them), a wall the
        // hand is pushed into: the charge leaves right before them — it hits them, never flies on behind
        this.myStart(side, origin);
        // the body it may turn a little towards: the one pointed at — and where on it
        // the line of the hand comes closest (the head, the legs…)
        let tk = 'n', tid = null, ak = 0.5;
        const t = aim ? aim.t : (() => { const f = pickBody(origin, dir, this._bodies(this.me)); return f ? { kind: f.body.kind, id: f.body.id } : null; })();
        const body = t ? this._bodyOf(t.kind, t.id, this._tmpBody()) : null;
        if (body) { tk = t.kind; tid = t.id; ak = rayToSegment(origin, dir, body.a, body.b).k; }
        // («Левиоса» lifts the body by its middle: pointed at the feet, it must not dive into the ground beside them)
        if (spell === 'LevitateDuel') ak = Math.max(0.3, Math.min(0.75, ak));
        const b = this._addBolt({ id: `${this.me}:${nextId++}`, by: this.me, spell, side, tk, tid, ak, o: origin, d: dir });
        b.aim = tk === 'p' ? tid : null; // (whom it was cast at: Leviosa tells why it did not lift them)
        const g = this.game;
        if (g.sync) g.sync.duelCast(b);
        if (isIceCharge(spell)) { g.sound?.playIce?.(); this.ice.cast(origin, dir); return b; }
        // the strong charges: their sound comes from the card (SpellMusic.SPELL_SOUND — Game.castLocalSpell); a flash here
        if (isStrongDuel(spell)) {
            const col = this.colors(spell, this.me).glow;
            this._burst(origin, spell === 'Die' ? 0x6a1ab0 : col, 22);
            if (spell === 'Die') g.strong?.terror(origin, this.me); // (cast near people: they run in terror)
            else g.fx.lightFlash(origin, col, 2.5, 0.25, 12);
            return b;
        }
        if (isJolt(spell)) { g.sound?.playJolt?.(spell === 'JoltMaxima', false); this.jolt.hit(origin, dir, false); return b; }
        if (spell === 'AvadaKedavra') { this.avada.cast(origin, dir); return b; } // (a poison-green flash, a terrible sound)
        // (each charge its own sound — SpellMusic: a red zap, a dark whoosh, a whip crack…; the others: Sapira's)
        if (g.sound && !g.sound.playSpellFx?.(DUEL_FX[spell], origin)) g.sound.playSapira?.();
        // the spell leaves the hand with a flash
        const col = this.colors(spell, this.me).glow;
        this._burst(origin, col, 18);
        g.fx.lightFlash(origin, col, 2.5, 0.25, 12);
        return b;
    }

    /** A charge announced by another player. */
    remoteCast(m) {
        const had = this.bolts.get(m.id);
        if (had) { if (m.s === 'JoltMaxima' && had.spell === 'Jolt') had.spell = m.s; return; } // (it became «Джолт Максима»: upgradeJolt)
        if (m.up) return; // (an upgrade of a charge already gone here: nothing new flies)
        const b = this._addBolt({ id: m.id, by: m.by, spell: m.s, side: m.side, tk: m.tk || 'n', tid: m.tid ?? null, ak: m.ak ?? 0.5, o: new THREE.Vector3(...m.o), d: new THREE.Vector3(...m.d) });
        if (b.spell === 'AvadaKedavra') this.avada.cast(b.o, b.dir); // (seen and heard here as at the caster's)
    }

    /** A duel charge of someone else is flying at me (an answer can't wait for the end of the phrase). */
    underFire() {
        for (const b of this.bolts.values()) if (b.by !== this.me && b.state === 'flying' && b.tk === 'p' && b.tid === this.me) return true;
        return false;
    }

    /**
     * «Джолт…» was cast before the phrase ended (an answer to a charge flying at me) and the phrase ended
     * as «Джолт Максима»: my charge just cast (still flying or already in a clash) becomes the Maxima.
     * @returns {boolean} false: no such charge any more
     */
    upgradeJolt(maxAge = 3) {
        let mine = null;
        for (const b of this.bolts.values()) if (b.by === this.me && b.spell === 'Jolt' && b.age < maxAge && (!mine || b.age < mine.age)) mine = b;
        if (!mine) return false;
        mine.spell = 'JoltMaxima';
        mine.up = 1;
        this.game.sync?.duelCast(mine);
        return true;
    }

    _addBolt(o) {
        const b = {
            ...o,
            front: o.o.clone(),
            dir: o.d.clone().normalize(),
            d0: o.d.clone().normalize(), // the line of the hand it was cast along (it never turns far from it)
            ak: o.ak ?? 0.5,
            traveled: 0,
            state: 'flying',
            age: 0,
            clash: null,
        };
        this.bolts.set(b.id, b);
        this.game.arenaDuels?.logCast?.(b); // (the arena's duel journal: who cast what — ArenaDuels.logCast)
        return b;
    }

    _tmpBody() {
        return this._tb || (this._tb = { kind: 'n', id: null, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 });
    }

    /** The point on its target a charge corrects its way towards (follows the body), or null. */
    _aimPoint(b, out) {
        const body = b.tk !== 'n' ? this._bodyOf(b.tk, b.tid, this._tmpBody()) : null;
        return body ? out.copy(body.a).lerp(body.b, b.ak) : null;
    }

    /** The nearest flying charges light their surroundings in their own colour (every client lights the bolts it sees). */
    _placeBoltLights() {
        const cam = this.game.camera?.position, cave = this.game.world?.cave || 0;
        const fly = [];
        for (const b of this.bolts.values()) if (b.state === 'flying') fly.push(b);
        if (cam && fly.length > this.boltLights.length) fly.sort((a, b) => a.front.distanceToSquared(cam) - b.front.distanceToSquared(cam));
        this.boltLights.forEach((light, i) => {
            const b = fly[i];
            if (!b) { light.intensity = 0; return; }
            light.color.setHex(DUEL_SPELLS[b.spell]?.light ?? this.colors(b.spell, b.by).glow);
            light.position.copy(b.front);
            light.intensity = (b.spell === 'AvadaKedavra' ? 5 : b.spell === 'Die' ? 3 : 9) * (1 + 0.5 * cave); // (a softer green: a strong one bleaches the grass yellow)
            light.distance = 16 + 8 * cave;
            light.decay = 2 - 0.75 * cave;
        });
    }

    // ============================================================= update
    update(dt) {
        this._t += dt;
        this._dt = dt;
        // segments live exactly one frame, whatever the frame rate
        this._segLife = dt + 1e-4;
        this._trackHands();
        for (const b of [...this.bolts.values()]) this._updateBolt(b, dt);
        this._placeBoltLights();
        if (this._referee()) this._detectClashes();
        for (const c of [...this.clashes]) this._updateClash(c, dt);
        if (this._won) this._wonAlive();
    }

    /** Am I the one deciding zombies and duels? (host, or alone) */
    _referee() {
        return this.game.authority;
    }

    _updateBolt(b, dt) {
        b.age += dt;
        if (b.state === 'clash') return;
        if (b.age > 14) { this._end(b, 'fizzle'); return; }
        const origin = b._origin || (b._origin = new THREE.Vector3());
        const hdir = b._hdir || (b._hdir = new THREE.Vector3());
        if (!this._handOf(b.by, b.side, origin, hdir)) origin.copy(b.o);
        if (b.state === 'flying' && !this._fly(b, dt)) return;
        this._drawBolt(b.spell, origin, b.front, b.by);
        if (b.state === 'arrived') this._arrive(b, dt);
    }

    /**
     * One step of a flying charge: along the line of the hand, correcting its way a little
     * towards its target (never round after it), until it touches a body (→ 'arrived'),
     * the ground, or flies out of range. false: it is gone.
     */
    _fly(b, dt) {
        const g = this.game;
        if (b.tk !== 'n') {
            const tp = this._aimPoint(b, _v3);
            const want = tp ? _v2.subVectors(tp, b.front) : null;
            // the target is gone, or the charge has flown past it: it just flies on straight
            if (!want || want.dot(b.d0) <= 0) { b.tk = 'n'; b.tid = null; }
            else { const sp = DUEL_SPELLS[b.spell]; bendToward(b.dir, b.d0, want.normalize(), (sp?.turn || AIM.TURN) * dt, sp?.bend ?? AIM.BEND); }
        }
        const step = (DUEL_SPELLS[b.spell]?.speed || DUEL.SPEED) * dt;
        const from = _vFrom.copy(b.front);
        (b.prev || (b.prev = new THREE.Vector3())).copy(from);
        b.front.addScaledVector(b.dir, step);
        b.traveled += step;
        // a house's sphere of protection: the charge bursts on it from outside (HouseWards.js)
        // (the strong ones take it down — Pilbidrio −80, Accentric −5/s up to 40, Electrum held on it: HouseWards.chargeHit)
        const ward = g.wards?.segmentHit(from, b.front, isStrongDuel(b.spell) ? b.spell : null, b.by);
        if (ward) {
            b.front.copy(ward);
            if (b.spell === 'Electrum' && b.by === this.me && g.wards.lastHit) g.strong?.startElectrum(b.side, 'W', g.wards.lastHit.id, ward);
            this._end(b, 'blocked');
            return false;
        }
        // the magic dome over a duel arena: a charge crossing its skin bursts on it — the stands behind are never touched (ArenaDome.js)
        const dome = g.arenaDuels?.domeBlock?.(from, b.front);
        if (dome) { b.front.set(dome.x, dome.y, dome.z); this._end(b, 'blocked'); return false; }
        // (book-birds are bodies like any other creature: touched below, not by a blast radius)
        if (g.authority && g.spiders?.boltAt(b.front, b.spell, b.by)) { this._end(b, 'fizzle'); return false; }
        if (isJolt(b.spell)) this._joltThings(b, from);
        if (g.authority && g.dragons?.boltAt(b.front, b.spell, b.by)) { this._end(b, 'fizzle'); return false; }
        // a door's leaf on its way: no charge goes through a door — «Джолт» shoves it (it swings open, or shut,
        // as hard as the charge: Doors.impulse; a locked one only rattles); the others burst on the wood
        const dh = g.doors?.segmentHit(from, b.front);
        if (dh && !firstTouched(from, _v3.lerpVectors(from, b.front, dh.s), this._bodies(b.by))) {
            b.front.lerpVectors(from, b.front, dh.s);
            if (isJolt(b.spell)) g.doors.impulse(dh.door, _v3.copy(b.dir).multiplyScalar(DOOR_SPELLS[b.spell]), dh.k);
            this._end(b, 'fizzle');
            return false;
        }
        // it hits the first body it really touches on its way (along the whole step: at a
        // low FPS a charge moves a metre and more per frame) — its target or anybody else
        // a wall or a floor on this step's way (looked at every 0.3 m): nothing behind it is touched
        const wallS = this._wallOnWay(from, b.front);
        const hit = firstTouched(from, b.front, this._bodies(b.by));
        // (host) a player's charge flying close past people: a threat — they flinch, turn, look for who (Startle.js)
        if (g.authority && !b.npc) this._passBy(b, from, Math.min(1, wallS, hit ? hit.s : 1), hit?.body);
        // the strong charges burst on a ship's hull, a mast, a sail (StrongSpells: «не действует» on ships); the black ship's barrier flares
        if (isStrongDuel(b.spell) && g.ships?.segmentHit) {
            const sh = g.ships.segmentHit(from, b.front);
            if (sh && (!hit || sh.s < hit.s) && sh.s < wallS) {
                b.front.lerpVectors(from, b.front, sh.s);
                if (sh.ship?.cls?.magic && !sh.ship.owner && sh.ship.pose?.toLocal) { const l = new THREE.Vector3(); sh.ship.pose.toLocal(b.front.x, b.front.y, b.front.z, l); g.ships.curseSpark?.(sh.ship, l.x, l.y, l.z); } // (Ships.isCursed)
                this._end(b, 'fizzle');
                return false;
            }
        }
        if (hit && hit.s > wallS) { b.front.lerpVectors(from, b.front, wallS); this._end(b, 'fizzle'); return false; }
        if (hit) {
            b.front.lerpVectors(from, b.front, hit.s);
            b.prev.copy(b.front);
            b.state = 'arrived';
            b.tk = hit.body.kind;
            b.tid = hit.body.id;
            if (b.aim && b.by === this.me && b.spell === 'LevitateDuel' && !(b.tk === 'p' && b.tid === b.aim)) g.levitation?.missed?.(b.aim, 'levBlocked');
            b.waitT = 0;
            this._note({ ev: 'touch', id: b.id, kind: b.tk, tid: b.tid });
            return true;
        }
        if (wallS <= 1) b.front.lerpVectors(from, b.front, wallS);
        if (b.traveled > duelRange(b.spell) || wallS <= 1) { this._end(b, 'fizzle'); return false; }
        return true;
    }

    /** (host) The people this step of charge `b` passed close by (up to `s` of it; not `hitBody`): startled. */
    _passBy(b, from, s, hitBody) {
        const g = this.game;
        const to = _vPass.lerpVectors(from, b.front, s);
        const hitV = hitBody?.kind === 'v' ? hitBody.id : null, hitC = hitBody?.kind === 'c' ? hitBody.id : null;
        g.castleLife?.passBy?.(from, to, b.by, b.o, hitV);
        g.ships?.crew?.passBy?.(from, to, b.by, b.o, hitC);
    }

    /**
     * Where on the segment a→b (0…1) the first solid block is; 2 — none. (Doors: segmentHit above.)
     * (CLAUDE.md: a charge never goes through a wall or a floor — whoever casts it.)
     */
    _wallOnWay(a, b) {
        const g = this.game, t = g.terrain?.data;
        if (!t) return 2;
        const len = a.distanceTo(b);
        const n = Math.max(1, Math.ceil(len / 0.3));
        for (let i = 1; i <= n; i++) {
            const k = i / n;
            const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
            if (t.isSolidAt(x, y, z)) return k;
        }
        return 2;
    }

    /** The charge touched a body: who decides what happens? */
    _arrive(b, dt) {
        if (b.tk === 'p' && b.tid === this.me) { this._arriveAtMe(b); return; } // (my own computer: it knows my shield)
        if (b.tk === 'z' && this._referee()) { this._arriveAtZombie(b); return; }
        if ((b.tk === 'a' || b.tk === 'v' || b.tk === 'b' || b.tk === 't' || b.tk === 'c' || b.tk === 'f' || b.tk === 'o') && this._referee()) { this._arriveAtCreature(b); return; }
        if (b.tk === 's' && this._referee()) { const sp = this.game.spiders?.byId(b.tid); this._end(b, 'fizzle'); if (sp) this.game.spiders.boltHit(sp, b.spell, b.by, b.front); return; }
        if (b.tk === 'D' && this._referee()) { const dr = this.game.dragons?.byId(b.tid); this._end(b, 'fizzle'); if (dr) this.game.dragons.boltHit(dr, b.spell, b.by, b.front); return; }
        if (b.tk === 'I' && this._referee()) { const c = this.game.iceCastle?.byId(b.tid); this._end(b, 'hit'); if (c) this.game.iceCastle.boltHit(c, b.spell, b.by, b.front); return; }
        // another computer decides (the wizard it touched, or the host): wait for its word
        b.waitT += dt;
        if (b.waitT > 2) this._end(b, 'fizzle', false);
    }

    _arriveAtMe(b) {
        if (!b.noted) { b.noted = true; this._note({ ev: 'arrive', id: b.id, by: b.by }); }
        const g = this.game;
        // Answered with a charge flying against it? Then the referee may start a duel — wait
        // (a little: over the network it sees the two meet a moment later)
        b.meWait = (b.meWait || 0) + (this._dt || 0);
        for (const o of this.bolts.values()) {
            if (o.by !== this.me || (o.state !== 'flying' && o.state !== 'arrived')) continue;
            if (o.state === 'flying' && o.tk === 'p' && o.tid === b.by) return;
            if (b.meWait < CLASH.WAIT && o.dir.dot(b.dir) <= -CLASH.FACING) return;
        }
        const caster = this._handOf(b.by, b.side, _v1, _v2) ? _v1.clone() : b.o;
        // «Дай»: no «Protection», no armour holds it — but the gods' shield: the first blow breaks it (no death, no mana)
        if (b.spell === 'Die') {
            const s = g.combat.shield;
            if (s?.gods && s.left > 0 && (s.type === 2 || g.combat.shieldFactor(caster) >= 1)) {
                g.combat._shatter('💥 «Дай» разбил божественную защиту! Второй удар убьёт');
                this._end(b, 'blocked');
                return;
            }
            this._end(b, 'hit');
            this.applyToMe(b.spell, b.by, b.side);
            return;
        }
        // (my «Protection» pays half of the charge's mana; out of mana it shatters and the charge goes on)
        if (g.combat.shieldFactor(caster) >= 1 && g.combat._blocked(caster, b.spell)) {
            this._end(b, 'blocked');
            return;
        }
        this._end(b, 'hit');
        this.applyToMe(b.spell, b.by, b.side);
    }

    _arriveAtZombie(b) {
        const z = this.game.zombieById.get(b.tid);
        this._end(b, 'hit');
        if (z) this.applyToZombie(b.spell, z, b.by, b.o);
    }

    _arriveAtCreature(b) {
        const c = this._creature(b.tk, b.tid);
        // Captain Black Moustache: his rapier up before him — he may beat the charge aside (Sailors.parryBolt)
        if (c?.isSailor && c.role === 'blackbeard' && b.spell !== 'Die' && this.game.ships?.crew.parryBolt(c, _v3.copy(b.front).addScaledVector(b.dir, -6))) { this._deflect(b, c); return; } // (where it comes from: along its own way)
        this._end(b, 'hit');
        if (c) this.applyToCreature(b.spell, c, b.by, b.o, this._partOf(b, c));
    }

    /** Where on the body a charge hit: {ak (0…1 from the head end), low (below the body's middle), point}. */
    _partOf(b, c, kind = b.tk) {
        const body = this._bodyOf(kind, b.tid ?? c?.id, this._tmpBody());
        if (!body) return { ak: b.ak ?? 0.5, low: false, point: b.front };
        const ak = segmentToSegment(b.front, b.front, body.a, body.b).k;
        return { ak, low: b.front.y < body.a.y + (body.b.y - body.a.y) * ak - body.r * 0.35, point: b.front.clone() };
    }

    /** Duel's kind letter of a creature object. */
    _kindOf(c) {
        return c.isSailor ? 'c' : c.isVillager ? 'v' : c.isAnimal ? 'a' : c.isBird ? 'b' : c.isLivingTree ? 't' : c.isPhoenix ? 'f' : c.isOwl ? 'o' : c.isGargoyle ? 'g' : null;
    }

    /**
     * (host) Captain Black Moustache beat the charge aside with his rapier: it ends where it met the blade (the
     * caster sees it blocked) and flies on from there as a new charge of the same spell — back the way it came,
     * thrown to one side and a little up: it may hit whoever is there (the caster too), or fly off over the sea.
     */
    _deflect(b, c) {
        const g = this.game;
        const p = b.front.clone();
        this._end(b, 'blocked');
        g.sound?.playClang?.(0.9);
        this._burst(p, 0xfff1b0, 16);
        g.fx?.lightFlash?.(p, this.colors(b.spell, b.by).glow, 2.5, 0.2, 14);
        const back = _v1.copy(b.dir).negate().setY(0);
        if (back.lengthSq() < 1e-6) back.set(1, 0, 0);
        back.normalize();
        const k = (Math.random() - 0.5) * 1.8; // (beaten to one side or the other)
        const d = new THREE.Vector3(back.x - back.z * k, 0.12 + Math.random() * 0.3, back.z + back.x * k).normalize();
        const o = p.clone().addScaledVector(d, 1.4);
        const nb = this._addBolt({ id: `${c.id}:p${nextId++}`, by: c.id, spell: b.spell, side: 'right', tk: 'n', tid: null, ak: 0.5, o, d });
        if (g.sync) g.sync.duelCast(nb);
        return nb;
    }

    /** A duel spell landed on an animal or a castle villager (decided by the host). */
    applyToCreature(spell, c, byId, from = null, part = null) {
        const g = this.game;
        const src = from || this._casterAt(byId, c);
        const p = this._creaturePoint(c, _v1);
        this._hitBurst(spell, p, 30);
        // a spell at a person is an attack, hurt or not (Остолбеней, Левиоса, Пески, a robe or a shield that took it…):
        // he turns to it and, seeing who, fights or runs; not seeing — he searches (Startle.js; a hurt one: hit → _offence too)
        if (g.authority && c.isSailor) g.ships?.crew?.startle?.(c, byId, src, { hit: true });
        else if (g.authority && c.isVillager) g.castleLife?.startle?.(c, byId, src, { hit: true });
        // «Дай»: through any shield, dome or robe — dead at once (StrongMagic.annihilate)
        if (spell === 'Die' && g.strong?.hitCreature(this._kindOf(c), c, spell, byId, { src })) return;
        if (c.isVillager && g.castleLife?.wardOff?.(c, src, spell)) return; // (a raised shield / the Master's dome took it)
        // a wizard in a magic robe: the simplest magic (and «Disarmor») does nothing on him (ArmorTypes.ROBE_BLOCKS)
        if (c.isVillager && ((c.robe && ROBE_BLOCKS.has(spell)) || (c.magicSet && !c.stripped && MAGIC_SET_BLOCKS.has(spell)))) {
            this._burst(p, 0xc39bff, 20);
            // («Disarmor»: the robe stays on, but the bolt still throws him back as a «Джолт» does)
            if (spell === 'Disarmor') { g.castleLife?._say?.(c, 'Мою мантию так не снять!', 3); this._joltCreature(c, 'Jolt', src, byId); }
            return;
        }
        // the strong charges and the ice (StrongMagic: Accentric, Pilbidrio, Electrum, «Айс» / «Frozen» and its Maxima)
        if ((isStrongDuel(spell) || isIceCharge(spell)) && g.strong?.hitCreature(this._kindOf(c), c, spell, byId, { src, ak: part?.ak, low: part?.low, point: part?.point })) return;
        // a book-bird: any charge knocks it out of the air (it falls as a book)
        // («Левиоса» doesn't hurt: the bird is only jolted and flies on)
        // (the book of protection: every duel charge — «Авада» too — bounces off its aura: BookBirds)
        if (c.isBird) { if (spell !== 'LevitateDuel' || c.ward) g.books.hitBird(c, 99); return; }
        // a phoenix: each charge as Phoenixes.TARGETS says («Авада» −25, «Остолбеней» drops it, «Айс» melts…)
        if (c.isPhoenix) { g.phoenixes?.boltHit(c, spell, byId); return; }
        // a clever owl: «Авада Кедавра» (a scroll's) −25; every other charge — it darts away (Owls.TARGETS)
        if (c.isOwl) { g.owls?.boltHit(c, spell, byId); return; }
        // a plant creature: fire burns it, cold shatters a flower / freezes a head, «Авада» and the simplest charges do nothing (Plants.boltHit)
        if (c.isPlantBody) { g.plants?.boltHit(c, spell, byId); return; }
        // an infernal gargoyle: each charge as GargoyleRules.TARGETS says; «Джолт» shoves it too (a flier: it reels, never falls)
        if (c.isGargoyle) { g.gargoyles?.boltHit(c, spell, byId); if (isJolt(spell)) this._joltCreature(c, spell, src, byId); return; }
        // a living tree: no duel spell hurts it (only fire does) — «Авада Кедавра» neither
        // («Экспеллиармус»: it has nothing in its hands to knock out — no effect)
        // («Джолт»: no damage — a rooted tree only reels from the shove: below)
        if (c.isLivingTree && !isJolt(spell)) { if (spell !== 'Expelliarmus' && spell !== 'Disarmor') g.livingTrees.hit(c, spell === 'AvadaKedavra' ? 999 : 10, spell, byId); return; }
        if (isJolt(spell)) { this._joltCreature(c, spell, src, byId); return; }
        // a skeleton of the black ship: dead already — «Авада Кедавра» finds no life in it (Sailors.SKELETON_AVADA),
        // and like a living tree no duel charge harms it (only fire, the mighty spells, what breaks bones — Sailors.pirateBoneDamage)
        if (c.isSailor && c.role === 'skeleton') { this._burst(p, spell === 'AvadaKedavra' ? AVADA.CORE : 0xe2d9bf, 24); g.ships?.crew.provoke(c.crew || c.ship, byId === 'local' ? g.localId : byId, null); return; }
        const hit = (dmg, opts = {}) => (c.isAnimal ? g.animals.hit(c, dmg, null, byId) : c.isSailor ? g.ships.crew.hit(c, dmg, null, byId, { spell: true, ...opts }) : g.castleLife.hit(c, dmg, null, byId, { spell: true, ...opts }));
        if (spell === 'AvadaKedavra') {
            hit(DAMAGE.AvadaKedavra, { pierce: true }); // (not a killing curse: −25 HP at once, no armour stops it)
            if (!c.dead) g.creatureImpact?.spellHit(c, 'AvadaKedavra', src, byId); // (thrown on its back)
        } else if (spell === 'Stupefy') {
            c.stunT = DUEL.STUN_TIME;
            // falls stiff on its back and lies while the spell holds it (then gets up by itself)
            g.creatureImpact?.spellHit(c, 'Stupefy', src, byId, null, { down: DUEL.STUN_TIME });
        } else if (spell === 'LevitateDuel') {
            if (c.isAnimal) g.animals.push(c, _v2.set(0, 13, 0), 2.5);
            else { c.stunT = 3; c.vy = 11; }
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 3, 0.4, 20);
            hit(DAMAGE.Sapira);
            if (!c.dead) g.creatureImpact?.spellHit(c, 'SapiraDuel', src, byId);
        } else if (spell === 'SandsDuel') {
            c.slowT = Math.max(c.slowT || 0, SLOW.TIME);
            this._sand(p);
            if (!c.dead) g.creatureImpact?.spellHit(c, 'SandsDuel', src, byId);
        } else if (spell === 'Expelliarmus') {
            // a wizard's wand / a knight's sword flies off; everybody else (animals, sailors,
            // villagers with tools, an unarmed one) is only jolted back a little
            const out = !c.isAnimal && !c.isSailor ? disarmVillager(g, c, wizardWandOf) : null;
            // knocking the wand / the sword out is an attack: he (and whoever saw it) fights the one who did it —
            // a wizard runs for his wand first (WizardLife._fetchWand), then turns on him
            if (out) hit(0, { kind: 'Expelliarmus' });
            if (out === 'wand') this.game.castleLife?._say?.(c, 'Моя палочка!', 3);
            g.creatureImpact?.spellHit(c, 'Expelliarmus', src, byId);
        } else if (spell === 'Disarmor') {
            // a knight's / the king's plates, a wizard's plain robe fly off as things (Armor.js); the others only reel
            // …and the bolt throws the one it hit back off the feet, tumbling, as «Джолт» does (the author: «так реалистичнее»)
            if (c.isVillager && !c.isSailor) g.armor?.stripVillager(c, byId);
            if (!c.dead) this._joltCreature(c, 'Jolt', src, byId);
        }
    }

    /** Where the caster's hand is (for the way a spell pushes): their hand, or a step before the target. */
    _casterAt(byId, target) {
        const out = new THREE.Vector3();
        if (this._handOf(byId, 'right', out, new THREE.Vector3())) return out;
        return out.copy(target.group?.position || new THREE.Vector3()).add(new THREE.Vector3(0, 0, -3));
    }

    // ============================================================ effects
    /** A duel spell landed on my wizard. */
    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 30) this.log.shift();
    }

    applyToMe(spell, byId, side = 'right') {
        this._note({ ev: 'hitMe', spell, byId });
        const g = this.game;
        const c = g.combat;
        const p = c.center(_v1);
        this._hitBurst(spell, p, 40);
        // the way the charge pushes: from the caster's hand to me
        const hand = new THREE.Vector3();
        const from = this._handOf(byId, side || 'right', hand, new THREE.Vector3()) ? hand : null;
        const push = (k) => { const d = p.clone().sub(from || p.clone().add(_v2.set(0, 0, -1).applyAxisAngle(_v3.set(0, 1, 0), g.character.group.rotation.y))).setY(0); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); return d.normalize().multiplyScalar(k); };
        // «Disarmor»: my plain steel flies off (magic stays); my armour / robe may turn the simplest magic away (Armor.js)
        if (spell === 'Disarmor') {
            g.armor?.disarmorMe(byId);
            // thrown back off the feet, a flip in the air, down — as by «Джолт»
            const J = JOLT.Jolt;
            g.hud.flashColor?.('rgba(200, 230, 255, 0.45)');
            g.impact?.apply({ v: push(J.push), from, by: byId, spell: 'Jolt', jolt: J.jolt, always: { down: J.down }, toss: J.toss, fly: true, tumble: J.turns, noShield: true });
            g.levitation?.watchMyFall?.(byId, 0.7 + J.toss * J.toss / 40 + 1.45);
            return;
        }
        // «Дай»: no armour, no robe, not even the High Mage's suit holds it (the gods' shield was asked on arrival)
        if (spell === 'Die' && g.strong?.hitMe(spell, byId, side)) return;
        if (g.armor?.guard(spell)) return;
        // the strong charges and the ice (StrongMagic.hitMe)
        if ((isStrongDuel(spell) || isIceCharge(spell)) && g.strong?.hitMe(spell, byId, side)) return;
        if (spell === 'AvadaKedavra') {
            g.hud.flashColor?.(AVADA.HUD); // (the green flash itself: _hitBurst → AvadaLook.hit)
            // the body crumples back (off the feet; up again by a squat)
            g.knock?.knock({ dir: 'back', down: 1.5, by: byId, kind: 'avada', strength: 0.5 });
            // (not a killing curse: −25 HP at once)
            if (c.enabled) c.damage(DAMAGE.AvadaKedavra, byId, 'AvadaKedavra');
            else g.hud.setVoice('💚 Авада Кедавра попала в вас: −25 HP (здесь не ранит)', true);
        } else if (spell === 'Stupefy') {
            c.stun(DUEL.STUN_TIME, byId);
            // falls stiff on the back (the shield was checked on arrival); once the stun ends — the get-up squat
            g.impact?.apply({ v: push(4), from, by: byId, spell: 'Stupefy', always: { down: 1.5 }, noShield: true });
        } else if (spell === 'LevitateDuel') {
            // Lifted like a thing: my body hangs in front of the caster's hand and follows it
            // (until they let go — a fall from up there hurts — or my «Protection» breaks it)
            g.levitation.liftMe(byId, side || 'right');
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 4, 0.4, 20);
            g.hud.flashColor?.('rgba(142, 45, 226, 0.6)');
            if (c.enabled) c.damage(DAMAGE.Sapira, byId, 'Sapira');
            else g.hud.setVoice('💜 Сапира попала в вас', true);
            g.impact?.apply({ v: push(12), from, by: byId, spell: 'SapiraDuel', jolt: 3, noShield: true });
        } else if (spell === 'SandsDuel') {
            this._sand(p);
            g.hud.flashColor?.('rgba(210, 180, 140, 0.6)');
            c.slow(SLOW.TIME, byId);
            if (c.enabled && DAMAGE.Sands > 0) c.damage(DAMAGE.Sands, byId, 'Sands');
            else g.hud.setVoice('🏜️ Даст попал в вас: песок в глазах — 5 секунд вы медленнее', true);
            g.impact?.apply({ v: push(5), from, by: byId, spell: 'SandsDuel', jolt: 2.5, noShield: true });
        } else if (spell === 'Expelliarmus') {
            g.hud.flashColor?.('rgba(200, 16, 46, 0.45)');
            // the wand (else the sword) flies out of my hand: a real throw, it lands somewhere about
            const out = knockOutOfMyHand(g);
            this._note({ ev: 'disarmed', out });
            g.hud.setVoice(out === 'wand' ? '🪄 Экспеллиармус! Ваша палочка отлетела — подберите её'
                : out === 'weapon' ? '🪄 Экспеллиармус! Оружие вылетело из руки — подберите его'
                    : '🪄 Экспеллиармус! В руке ничего не было — вас только толкнуло', true);
            g.impact?.apply({ v: push(3), from, by: byId, spell: 'Expelliarmus', jolt: 2, noShield: true });
        } else if (isJolt(spell)) {
            // thrown back off the feet, a flip in the air, down; the head spins afterwards (Knockdown.daze)
            const J = JOLT[spell];
            g.hud.flashColor?.('rgba(200, 230, 255, 0.45)');
            g.fx.shake = Math.max(g.fx.shake || 0, spell === 'JoltMaxima' ? 1 : 0.6);
            g.impact?.apply({ v: push(J.push), from, by: byId, spell, jolt: J.jolt, always: { down: J.down }, toss: J.toss, fly: true, tumble: J.turns, noShield: true });
            // (thrown off a cliff / a wall / overboard: that fall hurts — not the throw's own arc,
            //  lifted 0.7, up toss²/40 and landing lying 1.45 lower: Knockdown / Character)
            g.levitation?.watchMyFall?.(byId, 0.7 + J.toss * J.toss / 40 + 1.45);
        }
    }

    applyToZombie(spell, z, byId, from = null) {
        const g = this.game;
        const src = from || this._casterAt(byId, z);
        const p = _v1.copy(z.group.position).add(_v2.set(0, 1, 0));
        this._hitBurst(spell, p, 30);
        if ((isStrongDuel(spell) || isIceCharge(spell)) && g.strong?.hitCreature('z', z, spell, byId, { src })) return;
        if (spell === 'AvadaKedavra') {
            g.damageZombie(z, 25, false, _v2.set(0, 0, 1), byId); // (−25 HP, not certain death)
            if (!z.isDead) g.creatureImpact?.spellHit(z, 'AvadaKedavra', src, byId);
        } else if (spell === 'Stupefy') {
            z.stunTimer = DUEL.STUN_TIME;
            g.creatureImpact?.spellHit(z, 'Stupefy', src, byId, null, { down: DUEL.STUN_TIME });
        } else if (spell === 'LevitateDuel') {
            z.vy = Math.max(z.vy || 0, 13);
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 3, 0.4, 20);
            g.damageZombie(z, 10, true, _v2.set(0, 0, 1), byId);
            if (!z.isDead) g.creatureImpact?.spellHit(z, 'SapiraDuel', src, byId);
        } else if (spell === 'SandsDuel') {
            z.slowT = Math.max(z.slowT || 0, SLOW.TIME);
            this._sand(p);
            if (!z.isDead) g.creatureImpact?.spellHit(z, 'SandsDuel', src, byId);
        } else if (spell === 'Expelliarmus') {
            g.creatureImpact?.spellHit(z, 'Expelliarmus', src, byId); // (no wand, no weapon: a small push)
        } else if (spell === 'Disarmor') {
            this._joltCreature(z, 'Jolt', src, byId); // (no armour to take: only thrown back as by «Джолт»)
        } else if (isJolt(spell)) {
            this._joltCreature(z, spell, src, byId);
        }
    }

    /**
     * (host) «Джолт» on a creature: shoved straight away from the caster, thrown up, a tumble in
     * the air, down for a while, then up by itself and dizzy (CreatureImpact: tumble, daze).
     */
    _joltCreature(c, spell, src, byId) {
        const g = this.game, J = JOLT[spell];
        const ck = kindOf(c);
        const p = c.group ? _v3.copy(c.group.position) : this._creaturePoint(c, _v3);
        const v = new THREE.Vector3(p.x - src.x, 0, p.z - src.z);
        if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
        v.normalize().multiplyScalar(J.push);
        g.creatureImpact?.apply(c, { v, by: byId, spell, jolt: J.jolt, from: src, always: { down: J.down }, toss: J.toss, fly: true, tumble: J.turns, daze: J.daze });
        if (ck) g.levitation?.watchFall?.(ck, c, byId); // (thrown off a cliff / a wall: that fall hurts)
    }

    /** «Джолт» flying past loose things: the air shoves them along (where their physics runs). */
    _joltThings(b, from) {
        const list = this.game.spells?.hooks?.weapons?.() || [];
        if (!list.length) return;
        const J = JOLT[b.spell];
        const seen = b.shoved || (b.shoved = new Set());
        for (const w of list) {
            if (w.holder || w.remoteTarget || seen.has(w) || !w.position || !w.velocity) continue;
            // (the closest point of the charge's step to the thing)
            const seg = _v1.subVectors(b.front, from), L2 = seg.lengthSq();
            const k = L2 > 1e-9 ? Math.max(0, Math.min(1, _v2.subVectors(w.position, from).dot(seg) / L2)) : 0;
            if (_v2.copy(from).addScaledVector(seg, k).distanceTo(w.position) > 0.9) continue;
            seen.add(w);
            w.hover = null;
            w.wake?.();
            w.velocity.addScaledVector(b.dir, J.things).y += J.things * 0.25;
            w.angularVelocity?.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        }
    }

    /** A puff of sand where «Даст» hit. */
    _sand(p) {
        const g = this.game;
        for (let i = 0; i < 24; i++) g.fx.spark(p, i % 3 ? 0xd2b48c : 0xf3e2b3, 0.14, _v2.set((Math.random() - 0.5) * 4, Math.random() * 2.5, (Math.random() - 0.5) * 4), 1.0);
    }

    _end(b, res, broadcast = true) {
        if (!this.bolts.has(b.id)) return;
        this.bolts.delete(b.id);
        if (res === 'hit' && b.by === this.me) this._manaHit(b.spell);
        if (res === 'hit' && b.by === this.me && b.spell === 'Electrum') this.game.strong?.startElectrum(b.side, b.tk, b.tid); // (now the lightning is held on it)
        if (res === 'blocked' || res === 'fizzle') this._hitBurst(b.spell, b.front, 15);
        // (my «Левиоса» at a wizard: why it did not lift them — a house's sphere, or it flew past)
        if (b.aim && b.by === this.me && b.spell === 'LevitateDuel' && res !== 'hit') this.game.levitation?.missed?.(b.aim, res === 'blocked' ? 'levWard' : 'levMiss');
        if (broadcast && this.game.sync && (b.by === this.me || res === 'hit' || res === 'blocked')) this.game.sync.duelEnd(b.id, res);
    }

    /** Another computer finished a charge (hit / blocked / fizzled). */
    remoteEnd(id, res) {
        const b = this.bolts.get(id);
        if (!b) return;
        this.bolts.delete(id);
        if (res === 'hit' && b.by === this.me) this._manaHit(b.spell);
        if (res === 'hit' && b.by === this.me && b.spell === 'Electrum') this.game.strong?.startElectrum(b.side, b.tk, b.tid);
        // (my «Левиоса»: the wizard's own computer found it on its shield)
        if (res === 'blocked' && b.aim && b.by === this.me && b.spell === 'LevitateDuel') this.game.levitation?.missed?.(b.aim, 'levShield');
        this._hitBurst(b.spell, b.front, res === 'hit' ? 30 : 15);
        // (another computer froze a creature: its ice is seen here too)
        if (res === 'hit' && isIceCharge(b.spell) && (b.tk === 'a' || b.tk === 'v' || b.tk === 'c') && !(b.tk === 'v' && this._creature('v', b.tid)?.role === 'master')) this._encase(b.tk, b.tid, STRONG.Ice.time);
        this.clashes = this.clashes.filter((c) => c.a !== b && c.b !== b);
    }

    // ============================================================= duels
    /**
     * Two duel charges of two wizards meet: any two spells (not only aimed at each other —
     * the hand a little beside the body still counts) flying against each other whose heads
     * pass close, or one's head is already on the other's beam (over the network a friend's
     * charge is seen a little late: by then they may have crossed). They push from there.
     */
    _detectClashes() {
        const list = this._clashable || (this._clashable = []);
        list.length = 0;
        for (const b of this.bolts.values()) if (b.state === 'flying' || (b.state === 'arrived' && b.tk === 'p')) list.push(b);
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                let a = list[i], b = list[j];
                if (a.by === b.by || a.state === 'clash' || b.state === 'clash') continue;
                if (a.npc && b.npc && !this.game.arenaDuels?.pair(a.by, b.by)) continue; // (two wizards of a tower never fight each other — but at the arena (ArenaDuels.js); a wizard's charge and a player's — a duel)
                if (a.id > b.id) [a, b] = [b, a]; // (the same order on every computer)
                const m = this._meeting(a, b, _v1);
                if (!m) continue;
                const ha = this._handOf(a.by, a.side, _v2, _v3) ? _v2 : a.o;
                const hb = this._handOf(b.by, b.side, _sb, _v3) ? _sb : b.o;
                const ab = _cd.subVectors(hb, ha);
                const len2 = ab.lengthSq();
                const p = Math.min(0.9, Math.max(0.1, len2 > 1e-6 ? _co.subVectors(m, ha).dot(ab) / len2 : 0.5));
                this._startClash(a, b, p);
                if (this.game.sync) this.game.sync.duelClash(a.id, b.id, p);
            }
        }
    }

    /** Where two charges meet (into `out`), or null: they fly against each other and pass close. */
    _meeting(a, b, out) {
        if (a.dir.dot(b.dir) > -CLASH.FACING) return null; // (not against each other: crossing on their ways elsewhere)
        const c = {};
        // the heads' moves this frame pass each other (fast charges at a low FPS jump past)
        segmentToSegment(a.prev || a.front, a.front, b.prev || b.front, b.front, c);
        if (c.dist < CLASH.MEET) return out.copy(a.prev || a.front).lerp(a.front, c.s);
        // one head is already on the other's beam (hand → head): they crossed a moment ago
        for (const [x, y] of [[a, b], [b, a]]) {
            const h = y._origin && y._origin.lengthSq() > 0 ? y._origin : y.o;
            segmentToSegment(x.front, x.front, h, y.front, c);
            if (c.dist < CLASH.MEET) return out.copy(x.front);
        }
        // a wizard's answer to this very charge (WizardFight._counter): their heads have passed each other
        if (a.vs === b.id || b.vs === a.id) {
            if (_dd.subVectors(b.front, a.front).dot(a.dir) <= 0.3) return out.copy(a.front).lerp(b.front, 0.5);
        }
        // charges aimed at each other: their ways together already span the gap
        if (a.tk === 'p' && b.tk === 'p' && a.tid === b.by && b.tid === a.by) {
            const L = this._casterDistance(a.by, b.by);
            if (L != null && a.traveled + b.traveled >= L - 0.6) return out.copy(a.front).lerp(b.front, 0.5);
        }
        return null;
    }

    _casterDistance(x, y) {
        const px = this._playerPos(x, new THREE.Vector3());
        const py = this._playerPos(y, new THREE.Vector3());
        return px && py ? px.distanceTo(py) : null;
    }

    _playerPos(id, out) {
        if (id === this.me) return this.game.combat.center(out);
        const r = this.game.remotes.get(id);
        return r ? out.copy(r.position).add(_v2.set(0, 0.6, 0)) : null;
    }

    /** A tower's / the arena's wizard's chest (for the hand-on-him test of a beam clash); null — not a wizard. */
    _wizardPos(id, out) {
        const w = this._npcWizard(id);
        return w ? out.set(w.x, w.y + 2.6, w.z) : null;
    }

    _startClash(a, b, p) {
        this._note({ ev: 'clashStart', a: a.id, b: b.id, p });
        if (this.clashes.some((c) => c.a === a || c.b === b || c.a === b || c.b === a)) return;
        a.state = 'clash';
        b.state = 'clash';
        this.clashes.push({ a, b, p, t: 0, luckA: 0, luckB: 0, luckT: 0, lostA: 0, lostB: 0, v: 0, k: 3, pNet: null, rings: [], ringT: 0, marks: this._marks(a.by, b.by) });
        if (this.game.sound) this.game.sound.playThunder?.();
        if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ ДУЭЛЬ! Держите руку на сопернике', true);
    }

    /** The referee's view of a message from the host. */
    remoteClash(m) {
        const a = this.bolts.get(m.a), b = this.bolts.get(m.b);
        if (!a || !b) return;
        let c = this.clashes.find((x) => x.a === a && x.b === b);
        if (!c) { this._startClash(a, b, m.p); c = this.clashes.find((x) => x.a === a && x.b === b); }
        // (glides to the host's value — it comes 10 times a second — instead of jumping)
        if (c) { c.pNet = m.p; c.v = m.v ?? 0; c.k = m.k ?? 3; }
    }

    _marks(aBy, bBy) {
        const [ma, mb] = markSlots(this._slot(aBy), this._slot(bBy));
        return [DUEL_MARK[ma], DUEL_MARK[mb]];
    }

    _markPool(hex) {
        return this.markPools[hex] || (this.markPools[hex] = new SegmentPool(this.game.scene, { capacity: 120, radius: 0.045, color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
    }

    /** A tower's wizard (or a wandering one) in a duel: the castle person, else null. */
    _npcWizard(id) {
        const v = this.game.castleLife?.byId?.get(id);
        return v?.wizard ? v : null;
    }

    /**
     * Strength in a duel — ONE scale for players and wizards (WizardAI.duelPower): mana now, health, a
     * little luck. In Creative mana never runs out: a player there is as strong in mana as his opponent
     * (the author's rule); in «Выживание» and «Хардкор» alike — the mana left now (not the cells).
     */
    _strength(id, luck, opId = null) {
        const g = this.game;
        const w = this._npcWizard(id);
        if (w) return duelStrength(w.role, w.mana, w.hp, luck, w.maxHp); // (a wizard: his own mana now, his health — WizardAI)
        const free = !!g.combat?.enabled;
        // Творческий (the author): mana there is endless — in a duel a player is exactly as strong in mana
        // as his opponent (a wizard: the wizard's mana now; another player: both the same — the larger).
        // Only with «Бесконечная мана» ticked. With it off («ячеек N») the duel goes by the survival rules below:
        // the mana he has now (+ the duel mastery), his health, a little luck — the author: «выставляю ману, чтобы она играла роль».
        if (g.config?.mode === 'creative' && opId != null && !creativeFiniteMana(g)) {
            const ow = this._npcWizard(opId);
            const mana = ow ? ow.mana : Math.max(this._playerMana(id), this._playerMana(opId));
            const full = duelPower(mana + this._mastery(id), 1, luck);
            return id === this.me && g.hero?.duelPower != null ? duelStrengthOf(g.hero, full) + luck : full; // (the hero's «Дуэльная сила» — a number of the same scale, HeroSetup.js; none = full)
        }
        // «Выживание» and «Хардкор» (the maps too) — the same (the author): the mana LEFT now and the health now
        let mana = 30, hp = PVP.MAX_HP, maxHp = PVP.MAX_HP;
        if (id === this.me) {
            const c = g.combat;
            mana = c.fatigue ?? 30;
            if (free) { hp = c.hp; maxHp = c.maxHp || PVP.MAX_HP; } else { hp = g.playerHP ?? PVP.MAX_HP; maxHp = g.maxHP || PVP.MAX_HP; }
        } else {
            const r = g.remotes.get(id);
            if (r) { mana = r.fatigue ?? 30; hp = r.hp ?? PVP.MAX_HP; }
        }
        mana += this._mastery(id); // («дуэльное мастерство»: never spent — counted as if it were mana, Mana.masteryWon)
        return duelPower(mana, hp / maxHp, luck);
    }

    /**
     * How much stronger this one's duel spell is with the wand in his hand — the same as for every spell
     * (WandMagic.wandPower): ×1.15, a duel wand +25 %, its favourite spell +40 %, its own power +1…50 %.
     * A bare hand ×1; a wizard: his own wand (none — knocked out — ×1); another player: his, by the network.
     */
    _wandK(id, spell) {
        const name = DUEL_SPELL_NAME[spell] || spell;
        if (id === this.me) return wandPower(this.game.items?.wand || null, name);
        const w = this._npcWizard(id);
        if (w) return w.noWand ? 1 : wandPower(wizardWandOf(w), name);
        return wandPower(this.game.remotes.get(id)?.wand || null, name);
    }

    /** A player's «дуэльное мастерство» (mine — Mana.mastery; another's — by the network). */
    _mastery(id) {
        if (id === this.me) return this.game.mana?.mastery || 0;
        return this.game.remotes?.get(id)?.mastery || 0;
    }

    /** A player's whole store of mana (its cells): Creative's duel against another player. */
    _playerMana(id) {
        const g = this.game;
        if (id === this.me) return Math.max(g.combat?.fatigue ?? 0, g.combat?.maxFatigue || 30);
        const r = g.remotes.get(id);
        return r ? Math.max(r.fatigue ?? 30, r.maxMana ?? 30) : 30;
    }

    /** Is this wizard still holding the duel (hand on the opponent)? jerk = gave up sharply. */
    _contact(id, bolt, opponentId) {
        if (id === this.me) {
            // (own vectors: _playerPos writes into _v2 — the hand's direction must survive it)
            const hand = _ch, dir = this._myRay(bolt.side, _ch, _cd);
            // (the one I push against: another player, or a wizard of a tower / the arena — his place, not «nobody» — else my hand would be off him and push for nothing)
            const op = this._playerPos(opponentId, _co) || this._wizardPos(opponentId, _co);
            // («Дай» with no mana left to hold its beam: it stops pushing)
            const ok = op && !(bolt.spell === 'Die' && manaRules(this.game) && this.game.combat.fatigue <= 0) ? dir.angleTo(op.sub(hand).normalize()) < DUEL.CONTACT_ANGLE : false;
            return { ok, jerk: this._jerked(bolt.side) };
        }
        const w = this._npcWizard(id);
        if (w) {
            const c = this.clashes.find((x) => x.a === bolt || x.b === bolt);
            const share = !c ? 0.5 : c.a === bolt ? c.p : 1 - c.p;
            return this.game.castleLife.wizards.fight.clashHold(w, share);
        }
        const r = this.game.remotes.get(id);
        if (!r || r.dead) return { ok: false, jerk: true };
        return { ok: r.duelContact !== 0, jerk: r.duelJerk === 1 };
    }

    _updateClash(c, dt) {
        const g = this.game;
        const { a, b } = c;
        c.t += dt;
        if (!this._referee() && c.pNet != null) c.p += (c.pNet + c.v * 0.05 - c.p) * Math.min(1, dt * 10);
        // Draw both charges up to the meeting point
        const ha = new THREE.Vector3(), hb = new THREE.Vector3(), d = new THREE.Vector3();
        const okA = this._handOf(a.by, a.side, ha, d), okB = this._handOf(b.by, b.side, hb, d);
        if (okA && okB) {
            const m = ha.clone().lerp(hb, c.p);
            // each wizard's beam has a thin core of their own marker colour (the glow keeps the spell's)
            this._drawBolt(a.spell, ha, m, a.by, this._markPool(c.marks[0]));
            this._drawBolt(b.spell, hb, m, b.by, this._markPool(c.marks[1]));
            // («Джолт» in a duel: no sparks — the air trembles along the beam and rings of shoved air roll from the point)
            for (const [x, h] of [[a, ha], [b, hb]]) if (isJolt(x.spell)) this.jolt.clash(x, h, m, x.spell === 'JoltMaxima', dt);
            if (Math.random() < 0.7 && !(isJolt(a.spell) && isJolt(b.spell))) this._burst(m, c.marks[Math.random() < 0.5 ? 0 : 1], 3);
            // each wand hand glows in its owner's colour: a colour is a person
            if (Math.random() < 0.6) { g.fx.spark(ha, c.marks[0], 0.2, _v3.set(0, 0.6, 0), 0.25); g.fx.spark(hb, c.marks[1], 0.2, _v3.set(0, 0.6, 0), 0.25); }
            // where they meet: who is winning, and who pushes now
            this._showMarker(c, ha, hb, m, dt);
            a.front.copy(m);
            b.front.copy(m);
        }
        if (a.by === this.me || b.by === this.me) {
            const mineA = a.by === this.me;
            g.hud.setDuelBar?.({ me: c.marks[mineA ? 0 : 1], them: c.marks[mineA ? 1 : 0], share: mineA ? c.p : 1 - c.p, mastery: g.mana?.mastery ?? 0, power: mineA ? c.pwA : c.pwB });
            this._barNow = true;
        }
        // Fatigue drains while pushing (free world)
        if ((a.by === this.me || b.by === this.me) && manaRules(g)) { // (the free world, and Creative with a finite mana)
            const mine = a.by === this.me ? a : b;
            // («Дай» in a clash: +10 mana a second while its beam fights)
            g.combat.fatigue = Math.max(0, g.combat.fatigue - (DUEL.CLASH_FATIGUE + (mine.spell === 'Die' ? STRONG.Die.drain : 0)) * dt);
        }
        if (!this._referee()) return;

        c.luckT -= dt;
        if (c.luckT <= 0) {
            c.luckT = 0.5;
            c.luckA = (Math.random() * 2 - 1) * DUEL.LUCK;
            c.luckB = (Math.random() * 2 - 1) * DUEL.LUCK;
        }
        const ca = this._contact(a.by, a, b.by), cb = this._contact(b.by, b, a.by);
        c.lostA = ca.ok ? 0 : c.lostA + dt;
        c.lostB = cb.ok ? 0 : c.lostB + dt;
        // A hand off the opponent doesn't push at all
        // (the strong charges push harder: Accentric ×1.2, Pilbidrio ×1.4, «Дай» ×5 — StrongSpells.CLASH_POWER)
        // (the wand counts as everywhere: +15 % and its own bonuses — WandMagic.wandPower)
        const sa = ca.ok ? this._strength(a.by, c.luckA, b.by) * clashPower(a.spell) * this._wandK(a.by, a.spell) : 0;
        const sb = cb.ok ? this._strength(b.by, c.luckB, a.by) * clashPower(b.spell) * this._wandK(b.by, b.spell) : 0;
        c.pwA = sa; c.pwB = sb; // (what each side pushes with now: the bar shows mine)
        const S = c.stat || (c.stat = { n: 0, sa: 0, sb: 0, ca: 0, cb: 0 }); // (for the duel journal: what each side really pushed with)
        S.n++; S.sa += sa; S.sb += sb; S.ca += ca.ok ? 1 : 0; S.cb += cb.ok ? 1 : 0;
        c.v = clashPush(sa - sb) + maximaPush(ca.ok ? liveShouts(c.shoutsA, c.t) : 0, cb.ok ? liveShouts(c.shoutsB, c.t) : 0);
        c.k = (ca.ok ? 1 : 0) | (cb.ok ? 2 : 0);
        c.p = Math.min(1, Math.max(0, c.p + c.v * dt + (Math.random() - 0.5) * 0.02));

        // Leaving: hand calmly off the opponent first, then a flick = the duel just ends;
        // a flick straight from aiming (no calm move away first) = giving up
        let loser = null, dissolve = false;
        if (c.p >= 1) loser = b.by;
        else if (c.p <= 0) loser = a.by;
        else if (ca.jerk) { if (c.lostA > DUEL.CONTACT_GRACE) dissolve = true; else loser = a.by; }
        else if (cb.jerk) { if (c.lostB > DUEL.CONTACT_GRACE) dissolve = true; else loser = b.by; }

        c.sendT = (c.sendT || 0) - dt;
        if (c.sendT <= 0 && g.sync) { c.sendT = 0.1; g.sync.duelClash(a.id, b.id, c.p, c.v, c.k); }
        if (loser || dissolve) {
            this._note({ ev: 'clashEnd', loser, dissolve, p: Math.round(c.p * 100) / 100, lostA: c.lostA, lostB: c.lostB, jerkA: ca.jerk, jerkB: cb.jerk, a: a.by, b: b.by });
            g.arenaDuels?.logClash?.(c, loser, dissolve);
            this._finishClash(c, loser);
            if (g.sync) g.sync.duelClashEnd(a.id, b.id, loser);
        }
    }

    // ============================================================ «Максима»
    /**
     * «Максима» shouted alone during my clash: −5 mana at once, +5 % to my push in this
     * clash (it adds up), at most once every 3 s. The host does the push maths: a guest tells it.
     * @returns {string|null} 'Maxima' when it worked
     */
    maxima(isFinal = true) {
        const g = this.game;
        const c = this.clashes.find((x) => x.a.by === this.me || x.b.by === this.me);
        if (!c) return null;
        const now = performance.now();
        if (now - (this._maximaAt || -1e9) < DUEL.MAXIMA_EVERY * 1000) {
            if (isFinal) g.hud.setVoice(`⚡ «Максима» — не чаще раза в ${DUEL.MAXIMA_EVERY} секунды`, true);
            return null;
        }
        const cm = g.combat;
        if (manaRules(g) && cm.fatigue < DUEL.MAXIMA_COST) {
            const msg = `😮‍💨 Не хватает маны: нужно ${DUEL.MAXIMA_COST}, есть ${Math.floor(cm.fatigue)}`;
            if (isFinal) g.hud.setVoice(msg, true);
            return null;
        }
        this._maximaAt = now;
        if (manaRules(g)) cm.fatigue = Math.max(0, cm.fatigue - DUEL.MAXIMA_COST);
        this.applyMaxima(c.a.id, c.b.id, this.me);
        g.sync?.duelMaxima?.(c.a.id, c.b.id);
        return 'Maxima';
    }

    /** (everybody) a wizard shouted «Максима» in this clash: the host counts it; all see the pulse. */
    applyMaxima(aId, bId, by) {
        const c = this.clashes.find((x) => x.a.id === aId && x.b.id === bId);
        if (!c || (by !== c.a.by && by !== c.b.by)) return false;
        const A = by === c.a.by;
        if (this._referee()) {
            // (the host keeps the 3-second limit too: a guest can't push more often)
            const key = A ? 'maxAtA' : 'maxAtB';
            if (c.t - (c[key] ?? -1e9) < DUEL.MAXIMA_EVERY - 0.25) return false;
            c[key] = c.t;
            if (A) { c.boostA = (c.boostA || 0) + 1; (c.shoutsA || (c.shoutsA = [])).push(c.t); } else { c.boostB = (c.boostB || 0) + 1; (c.shoutsB || (c.shoutsB = [])).push(c.t); }
        }
        c.pulse = { t: 0, side: A ? 0 : 1 };
        this._note({ ev: 'maxima', by, boostA: c.boostA || 0, boostB: c.boostB || 0 });
        const g = this.game;
        if (g.sound) g.sound.playThunder?.();
        if (by === this.me) g.hud.setVoice('⚡ <b>МАКСИМА!</b> Ваш напор сильнее', true);
        else if (c.a.by === this.me || c.b.by === this.me) g.hud.setVoice('⚡ Соперник крикнул «Максима» — держитесь!', true);
        return true;
    }

    _finishClash(c, loser) {
        this.clashes = this.clashes.filter((x) => x !== c);
        const { a, b } = c;
        this.bolts.delete(a.id);
        this.bolts.delete(b.id);
        const winnerBolt = loser === a.by ? b : loser === b.by ? a : null;
        this._burst(a.front, winnerBolt && c.marks ? c.marks[winnerBolt === a ? 0 : 1] : 0xffffff, 40);
        if (!winnerBolt) {
            if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ Дуэль прервана — никто не пострадал', true);
            return;
        }
        // a wizard of a tower lost: the player's spell reaches him (the host decides the castle people)
        const lw = this._referee() ? this._npcWizard(loser) : null;
        if (lw && !lw.dead) this.applyToCreature(winnerBolt.spell, lw, winnerBolt.by);
        if (loser === this.me) this.applyToMe(winnerBolt.spell, winnerBolt.by, winnerBolt.side);
        else if (winnerBolt.by === this.me) {
            this.game.hud.setVoice(`⚡ Вы победили в дуэли: ${DUEL_SPELLS[winnerBolt.spell].name}!`, true);
            this._manaHit(winnerBolt.spell); // (my charge reached them)
            if (winnerBolt.spell === 'Electrum') this.game.strong?.startElectrum(winnerBolt.side, lw ? 'v' : 'p', loser);
            this._won = { id: loser, at: performance.now() }; // (mana if it kills them: a duel won)
        }
    }

    /** Mana: my duel charge hit (the first time for this spell: its bonus, Mana.js). */
    _manaHit(spell) {
        this.game.mana?.success(DUEL_SPELL_NAME[spell] || spell);
    }

    /**
     * Someone I killed died (a player, or an NPC wizard — the host tells me): a clash I just won
     * against them = a real duel won (mana: 45% of their maximum above 30, at least +1; without a clash: 25%).
     */
    opponentDied(id, oppMax = 30, pos = null) {
        const w = this._won;
        if (!w || w.id !== id || performance.now() - w.at > 8000) {
            this.game.mana?.killWon(oppMax, id, pos); // (killed some other way: 25%)
            return false;
        }
        this._won = null;
        this.game.mana?.duelWon(oppMax, id, pos);
        return true;
    }

    /** A clash I won, and the opponent still alive 8 s later: a duel won without a kill (+1…+3). */
    _wonAlive() {
        const w = this._won;
        if (!w || performance.now() - w.at <= 8000) return;
        this._won = null;
        this.game.mana?.duelWonAlive(w.id);
    }

    remoteClashEnd(m) {
        const a = this.bolts.get(m.a), b = this.bolts.get(m.b);
        const c = this.clashes.find((x) => (a && (x.a === a || x.b === a)) || (b && (x.a === b || x.b === b)));
        if (c) { this._finishClash(c, m.loser); return; }
        // The duel ended before this computer even saw it start: both charges are gone anyway
        this.bolts.delete(m.a);
        this.bolts.delete(m.b);
        if (m.loser === this.me) {
            const w = a && a.by !== this.me ? a : b && b.by !== this.me ? b : null;
            if (w) this.applyToMe(w.spell, w.by, w.side);
        }
    }

    // ============================================================ hands
    _trackHands() {
        const ch = this.game.character;
        // in the body's own turn: turning round with the arm out is no jerk of the hand
        const inv = ch.group.quaternion ? _qInv.copy(ch.group.quaternion).invert() : null;
        for (const side of ['left', 'right']) {
            const h = ch.getHandWorldPosition(side, _v1).sub(ch.group.position);
            if (inv) h.applyQuaternion(inv);
            const list = this.jerk[side];
            list.push({ t: this._t, x: h.x, y: h.y, z: h.z });
            while (list.length && this._t - list[0].t > 0.5) list.shift();
        }
    }

    /** A real sharp jerk of this hand just now (see sharpJerk). */
    _jerked(side) {
        return sharpJerk(this.jerk[side]);
    }

    /** For the pose message: am I holding my duels? [contact, jerk] */
    myContact() {
        for (const c of this.clashes) {
            const mine = c.a.by === this.me ? c.a : c.b.by === this.me ? c.b : null;
            if (!mine) continue;
            const other = mine === c.a ? c.b.by : c.a.by;
            const r = this._contact(this.me, mine, other);
            return [r.ok ? 1 : 0, r.jerk ? 1 : 0];
        }
        return null;
    }

    // =========================================================== visuals
    /** A jagged, flickering electric charge from a to b. */
    _drawBolt(spell, from, to, by, core = null) {
        if (!DUEL_SPELLS[spell]) return;
        if (isIceCharge(spell)) { this._drawIce(from, to, by, core, spell); return; }
        if (isJolt(spell)) { this._drawJolt(spell, from, to, by, core); return; }
        const pool = this._pool(spell, by);
        const col = this.colors(spell, by).glow;
        // own copies: the caller may pass the shared temp vectors
        const a = _da.copy(from), b = _db.copy(to);
        const len = a.distanceTo(b);
        if (len < 0.05) return;
        const n = Math.max(3, Math.min(24, Math.round(len * 1.6)));
        const dir = _dd.subVectors(b, a).divideScalar(len);
        const side = _ds.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _du.crossVectors(dir, side).normalize();
        let prev = a.clone();
        const amp = Math.min(0.35, 0.08 + len * 0.02) * (DUEL_SPELLS[spell].jag ?? 1);
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const p = a.clone().lerp(b, t);
            if (i < n) {
                const k = Math.sin(Math.PI * t);
                p.addScaledVector(side, (Math.random() - 0.5) * 2 * amp * k).addScaledVector(up, (Math.random() - 0.5) * 2 * amp * k);
            }
            (core || pool.core).add(prev, p, this._segLife || 0.05);
            pool.glow.add(prev, p, this._segLife || 0.05);
            prev = p;
        }
        if (spell === 'AvadaKedavra' && !core) { this.avada.trail(b, dir, pool, this._dt || 1 / 60); return; } // (its own smoke and sparks)
        // bright head, and a glow at the hand it comes from
        if (Math.random() < 0.8) this.game.fx.spark(b, col, 0.22, _v1.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), 0.25);
        if (Math.random() < 0.5) this.game.fx.spark(a, col, 0.12, _v1.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5), 0.2);
    }

    /** «Айс»: a thin, nearly straight frosty beam (no crackling); IceLook adds the threads, the snow and the crystal. */
    _drawIce(from, to, by, core = null, spell = 'IceDuel') {
        const pool = this._pool(spell, by);
        const a = _da.copy(from), b = _db.copy(to);
        const len = a.distanceTo(b);
        if (len < 0.05) return;
        const n = Math.max(2, Math.min(16, Math.round(len)));
        const dir = _dd.subVectors(b, a).divideScalar(len);
        const side = _ds.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _du.crossVectors(dir, side).normalize();
        const prev = _v3.copy(a), p = _v2;
        for (let i = 1; i <= n; i++) {
            p.copy(a).lerp(b, i / n);
            if (i < n) p.addScaledVector(side, (Math.random() - 0.5) * 0.03).addScaledVector(up, (Math.random() - 0.5) * 0.03);
            (core || pool.core).add(prev, p, this._segLife || 0.05);
            pool.glow.add(prev, p, this._segLife || 0.05);
            prev.copy(p);
        }
        this.ice?.beam(a, b, this._segLife || 0.05, !core);
    }

    /** «Джолт»: a pale, nearly straight line of trembling air; the rings of shoved air are JoltLook's. */
    _drawJolt(spell, from, to, by, core = null) {
        const pool = this._pool(spell, by);
        const a = _da.copy(from), b = _db.copy(to);
        const len = a.distanceTo(b);
        if (len < 0.05) return;
        const n = Math.max(2, Math.min(12, Math.round(len * 0.8)));
        const dir = _dd.subVectors(b, a).divideScalar(len);
        const side = _ds.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _du.crossVectors(dir, side).normalize();
        const prev = _v3.copy(a), p = _v2;
        for (let i = 1; i <= n; i++) {
            p.copy(a).lerp(b, i / n);
            // (the air trembles: a fine ripple, not a crackle — held in a duel, it shakes harder)
            const amp = core ? 0.06 : 0.025;
            if (i < n) p.addScaledVector(side, Math.sin(this._t * 60 + i * 2.1) * amp).addScaledVector(up, Math.cos(this._t * 47 + i * 1.7) * amp);
            (core || pool.core).add(prev, p, this._segLife || 0.05);
            if (core || i > n - 3) pool.glow.add(prev, p, this._segLife || 0.05); // (flying: only the head is a little brighter; in a duel the whole beam)
            prev.copy(p);
        }
        if (!core) this.jolt.trail(b, dir, spell === 'JoltMaxima', this._dt || 1 / 60);
    }

    /** Where a charge hits / bursts: «Айс» shatters into ice, «Джолт» rings of air, the others spark. */
    _hitBurst(spell, p, n) {
        if (isJolt(spell)) { this.jolt.hit(p, _v1.set(0, 0, 1), spell === 'JoltMaxima'); if (n >= 30) this.game.sound?.playJolt?.(spell === 'JoltMaxima', true); return; }
        if (isIceCharge(spell)) this.ice?.shatter(p, (n / 30) * (spell === 'IceDuelMaxima' ? 1.5 : 1));
        else if (spell === 'Die') this._burst(p, 0x6a1ab0, n); // (a dark-violet spray: black light adds nothing)
        else if (spell === 'AvadaKedavra') this.avada.hit(p, n); // (the green flash, the ring of poison, the sound)
        else this._burst(p, DUEL_SPELLS[spell].color, n);
    }

    /** A creature locked in ice (it follows the body; breaks when the time is up or it is gone). */
    _encase(kind, id, T) {
        if (!this.ice) return;
        const e = { kind, id, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
        this.ice.encase(`${kind}:${id}`, (out) => {
            const body = this._bodyOf(kind, id, e);
            if (!body) return null;
            out.copy(body.a).lerp(body.b, 0.5);
            return { center: out, rx: body.r * 1.15, ry: body.a.distanceTo(body.b) / 2 + body.r };
        }, T);
    }

    _burst(p, color, n) {
        const fx = this.game.fx;
        for (let i = 0; i < n; i++) fx.spark(p, i % 3 ? color : 0xffffff, 0.12 + Math.random() * 0.1, _v1.set((Math.random() - 0.5) * 7, (Math.random() - 0.3) * 6, (Math.random() - 0.5) * 7), 0.5);
    }

    /**
     * Where two charges meet: a ball split in two — each half in its wizard's own
     * colour, facing them; the winner's half swells, the loser's shrinks (a hand
     * off the opponent: its half goes dim); a white core between; and rings in the
     * colour of whoever pushes harder right now roll towards the one giving way.
     */
    _showMarker(c, ha, hb, m, dt) {
        let mk = this._orbs[this._orbsUsed];
        if (!mk) {
            const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
            const half = new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
            mk = { a: new THREE.Mesh(half, mat(0.9)), b: new THREE.Mesh(half, mat(0.9)), core: new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(1)), rings: [] };
            mk.a.renderOrder = mk.b.renderOrder = mk.core.renderOrder = 5;
            this.game.scene.add(mk.a, mk.b, mk.core);
            this._orbs.push(mk);
        }
        this._orbsUsed++;
        const [colA, colB] = c.marks;
        const { lead, push } = clashLead(c.p, c.v);
        const toB = _mB.subVectors(hb, ha).normalize(), toA = _mA.copy(toB).negate();
        let pulse = 1 + Math.sin(c.t * 18) * 0.12;
        // «Максима»: the shouter's half flares up for half a second
        let flareA = 0, flareB = 0;
        if (c.pulse) {
            c.pulse.t += dt;
            const k = Math.max(0, 1 - c.pulse.t / 0.5);
            if (c.pulse.side === 0) flareA = k; else flareB = k;
            pulse += 0.5 * k;
            if (k <= 0) c.pulse = null;
        }
        for (const o of [mk.a, mk.b, mk.core]) { o.position.copy(m); o.visible = true; }
        mk.a.quaternion.setFromUnitVectors(_Y, toA);
        mk.b.quaternion.setFromUnitVectors(_Y, toB);
        mk.a.scale.setScalar(pulse * (1 + 0.45 * lead) * (1 + 0.6 * flareA));
        mk.b.scale.setScalar(pulse * (1 - 0.45 * lead) * (1 + 0.6 * flareB));
        mk.core.scale.setScalar(pulse);
        mk.a.material.color.setHex(colA);
        mk.b.material.color.setHex(colB);
        mk.a.material.opacity = c.k & 1 ? 0.9 : 0.3;
        mk.b.material.opacity = c.k & 2 ? 0.9 : 0.3;
        c.ringT -= dt;
        if (Math.abs(push) > 0.08 && c.ringT <= 0) {
            c.ringT = 0.45 - 0.3 * Math.abs(push);
            c.rings.push({ t: 0, to: push > 0 ? 'b' : 'a', col: push > 0 ? colA : colB });
        }
        c.rings = c.rings.filter((r) => (r.t += dt) < 0.6);
        let i = 0;
        for (const r of c.rings) {
            let ring = mk.rings[i++];
            if (!ring) {
                ring = new THREE.Mesh(_ringGeo || (_ringGeo = new THREE.TorusGeometry(0.34, 0.035, 6, 28)), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
                ring.renderOrder = 5;
                this.game.scene.add(ring);
                mk.rings.push(ring);
            }
            const k = r.t / 0.6, dir = r.to === 'a' ? toA : toB, hand = r.to === 'a' ? ha : hb;
            ring.position.copy(m).addScaledVector(dir, k * Math.min(1.6, m.distanceTo(hand) * 0.4)); // (never up to the face)
            ring.quaternion.setFromUnitVectors(_Z, dir);
            ring.scale.setScalar(1 + k * 0.9);
            ring.material.color.setHex(r.col);
            ring.material.opacity = 0.9 * (1 - k);
            ring.visible = true;
        }
        for (; i < mk.rings.length; i++) mk.rings[i].visible = false;
        c.view = { colA, colB, lead, push, rings: c.rings.length };
    }

    /** Called by the effects' update (segment pools fade the flicker). */
    updateVisuals(dt) {
        for (const p of Object.values(this.pools)) { p.core.update(dt); p.glow.update(dt); }
        this.ice?.update(dt);
        this.jolt?.update(dt);
        for (const p of Object.values(this.markPools)) p.update(dt);
        // markers of duels that ended this frame disappear
        for (let i = this._orbsUsed; i < this._orbs.length; i++) { const o = this._orbs[i]; o.a.visible = o.b.visible = o.core.visible = false; for (const r of o.rings) r.visible = false; }
        this._orbsUsed = 0;
        if (this._barOn && !this._barNow) this.game.hud.setDuelBar?.(null);
        this._barOn = this._barNow;
        this._barNow = false;
    }
}
