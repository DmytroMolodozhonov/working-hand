/**
 * Impact.js — what a blow does to a body (pure maths; both ends of the wire and every
 * creature use it). Hero units (≈2.8 per metre), speeds in hero m/s.
 *
 * The outcome comes from the speed the blow gives the body, never from a per-spell flag:
 *   under STAGGER_V nothing, up to KNOCKDOWN_V a stagger (steps back, arms flail), above it the
 *   body is knocked off its feet. Only a few things knock down by their nature (`always`):
 *   Stupefy, Avada, Earthquake (the ground runs away) and Lightning.
 * A heavy body (a cow, a horse, a knight in armour) gets less speed from the same push
 * (v / mass), and four legs stand firmer (QUAD_K on the knockdown threshold).
 */

export const IMPACT = {
    STAGGER_V: 3, KNOCKDOWN_V: 11, CROUCH_K: 1.4, KNOCK_ANY: 18, QUAD_K: 1.5,
    BLOCKED_K: 0.25, BLAST_DOME_K: 0.25, BLAST_SHIELD_K: 0.5, SWIM_K: 0.5,
    // hands
    TOUCH_V: 1.5, PUSH_V: 2, SLAP_V: 3, PUNCH_V: 4,
    FIST_CURL: 0.6, PALM_CURL: 0.35, FIST_R: 0.22, KNUCKLES: 0.3,
    PUSH_GAIN: 0.9, ONE_HAND: 0.6, BODY_GAIN: 0.8, PUNCH_BODY: 0.35, PUNCH_HEAD_BODY: 0.25, SLAP_BODY: 0.15, GUARD_GAIN: 0.2,
    BOTH_WINDOW: 0.15, HAND_COOLDOWN: 0.35, MAX_IMPULSE: 80, REACH_SLACK: 1.5, RATE: 0.12,
    // head jolt
    NECK: 0.6, JOLT_GAIN: 0.9, JOLT_W_MAX: 8, JOLT_MAX: 0.7, JOLT_K: 90, JOLT_ZETA: 0.45, JOLT_TURN: 0.3,
    // falls
    FALL_KNOCK_DROP: 5, FALL_KNOCK_SPEED: 13,
};

/** Fall direction codes on the wire (pose `kd`). 1 = the old quake roll (to the hero's left). */
export const KD = { left: 1, back: 2, front: 3, right: 4 };
export const KD_NAME = [null, 'left', 'back', 'front', 'right'];

/**
 * What a body does with a speed v (|impulse|): 'none' | 'stagger' | 'knockdown' | 'shatter'.
 * m: {dome, blocked, swim, frozen, crouch, mass (1), quad (four legs)}
 */
export function classify(v, m = {}) {
    if (m.dome) return 'none';
    const k = v / (m.mass || 1) * (m.blocked ? IMPACT.BLOCKED_K : 1) * (m.swim ? IMPACT.SWIM_K : 1);
    if (m.frozen) return k >= IMPACT.STAGGER_V ? 'shatter' : 'none';      // (a frozen statue pushed over breaks)
    const kd = IMPACT.KNOCKDOWN_V * (m.crouch ? IMPACT.CROUCH_K : 1) * (m.quad ? IMPACT.QUAD_K : 1);
    if (!m.blocked && !m.swim && k >= kd) return 'knockdown';
    return k >= IMPACT.STAGGER_V ? 'stagger' : 'none';
}

/**
 * Which way a body pushed by (ix, iz) falls: pushed from the front → on its back.
 * yaw: the body's; `faces`: which local axis is its front (−1: −Z as heroes, villagers and
 * animals; +1: +Z as zombies).
 */
export function fallDir(ix, iz, yaw, faces = -1) {
    const fx = faces * Math.sin(yaw), fz = faces * Math.cos(yaw);      // the body's forward
    const fwd = ix * fx + iz * fz;
    const side = ix * -fz + iz * fx;                                     // (its right: forward turned −90°)
    if (Math.abs(fwd) >= Math.abs(side)) return fwd < 0 ? 'back' : 'front';
    return side > 0 ? 'right' : 'left';
}

/** Four-legged bodies fall on a side: the side the push goes to (pushed straight: the nearer one). */
export function quadFallDir(ix, iz, yaw, faces = -1, tie = 1) {
    const fx = faces * Math.sin(yaw), fz = faces * Math.cos(yaw);
    const side = ix * -fz + iz * fx;
    if (Math.abs(side) < 1e-6) return tie > 0 ? 'right' : 'left';
    return side > 0 ? 'right' : 'left';
}

/** Swept fist (radius r) a→b, in a box's own frame (centre 0, half extents): first entry or null. */
export function segmentBox(a, b, half, r = 0) {
    let t0 = 0, t1 = 1, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
        const h = half[k] + r, d = b[k] - a[k];
        if (Math.abs(d) < 1e-9) { if (a[k] < -h || a[k] > h) return null; continue; }
        let ta = (-h - a[k]) / d, tb = (h - a[k]) / d, s = -1;
        if (ta > tb) { const x = ta; ta = tb; tb = x; s = 1; }
        if (ta > t0) { t0 = ta; axis = k; sign = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) return null;
    }
    const n = [0, 0, 0];
    if (axis < 0) {                                                        // a already inside: the nearest face
        let best = Infinity;
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { const dd = half[k] + r - s * a[k]; if (dd < best) { best = dd; n.fill(0); n[k] = s; } }
        return { t: 0, n, inside: true };
    }
    n[axis] = sign;                                                        // outward normal of the entered face
    return { t: t0, n, inside: false };
}

/** Head spin (rad/s, head frame) from a blow at lp (head frame, centre 0) along unit dir at `speed`: torque about the neck. */
export function headKick(lp, dir, speed) {
    const rx = lp[0], ry = lp[1] + IMPACT.NECK, rz = lp[2], k = IMPACT.JOLT_GAIN * speed;
    let wx = (ry * dir[2] - rz * dir[1]) * k, wy = (rz * dir[0] - rx * dir[2]) * k, wz = (rx * dir[1] - ry * dir[0]) * k;
    const m = Math.hypot(wx, wy, wz);
    if (m > IMPACT.JOLT_W_MAX) { const s = IMPACT.JOLT_W_MAX / m; wx *= s; wy *= s; wz *= s; }
    return { pitch: wx, yaw: wy, roll: wz };                               // (a hero's face looks −Z: a jab from the front pitches it up)
}

/** Damped spring per axis: the head snaps and comes back (frame-rate independent). */
export class HeadJolt {
    constructor() { this.a = [0, 0, 0]; this.w = [0, 0, 0]; }            // [pitch, yaw, roll]
    kick({ pitch = 0, yaw = 0, roll = 0 }) { this.w[0] += pitch; this.w[1] += yaw; this.w[2] += roll; }
    step(dt) {
        const K = IMPACT.JOLT_K, c = 2 * IMPACT.JOLT_ZETA * Math.sqrt(K), n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
            this.w[k] += (-K * this.a[k] - c * this.w[k]) * h;
            this.a[k] = Math.max(-IMPACT.JOLT_MAX, Math.min(IMPACT.JOLT_MAX, this.a[k] + this.w[k] * h));
        }
        return this;
    }
    get pitch() { return this.a[0]; } get yaw() { return this.a[1]; } get roll() { return this.a[2]; }
    get busy() { return Math.abs(this.a[0]) + Math.abs(this.a[1]) + Math.abs(this.a[2]) + 0.05 * (Math.abs(this.w[0]) + Math.abs(this.w[1]) + Math.abs(this.w[2])) > 1e-3; }
    reset() { this.a.fill(0); this.w.fill(0); }
}

// ================================================================ spells
/**
 * The physical effect of every spell (null = nothing physical: light, building, healing…).
 * push: hero m/s at the source; range: linear falloff 1−0.6·d/range; always: knocks down by its nature;
 * down: s lying at least; jolt: head kick (rad/s); toss: up m/s; blast: speed from the blast (blastPush);
 * wet: water (a soft landing, never hurts).
 */
export const SPELL_PHYSICS = {
    Lumos: null, LumosMaxima: null, Nox: null, Draw: null, Reveal: null, Accio: null, Alohomora: null, AlohomoraMaxima: null, Lock: null, /* (a lock opens / Lock shuts a door: nobody is pushed — Alohomora.js TARGETS) */ ChangeColor: null, CreateBed: null,
    Gather: null, CreateFloor: null, CreateWall: null, CreateCeiling: null, BuildRoof: null, CreateDoor: null, CreateBoard: null, CreateCastle: null, /* (the castle waits for bodies to go — nobody is pushed: CastleMagic.js) */ Stand: null,
    Brainrot: null, BrainrotMaxima: null, /* (no push: it calms) */ Imperius: null, ImperiusMaxima: null, /* (the mind goes in — no push: Imperius.js) */ ToTheSun: null, GiveMyPower: null, CreatePlanet: null, EnlargePlanet: null, TerraformPlanet: null, LevitationSuperMaxima: null, PlanetLiquidation: null, /* (the gods' scrolls: only planets — nobody is pushed, PlanetMagic.js) */ LetItRain: null, Storm: null, LightningCatch: null, LightningHold: null, Rescue: null, Pause: null, Flight: null, Up: null,
    AirBubble: null, AirBubbleMaxima: null, Waterball: null, Maxima: null, WaterForming: null, Frozen: null,
    Protection: null, ProtectionMaxima: null, ProtectionGods: null, ProtectionGodsMaxima: null, /* (the gods' shield pushes nobody: ProtectionGods.js) */ ProtectionHouse: null, ProtectionInvisible: null, ProtectionHouseGrant: null, WardDispel: null, WardGrow: null, // (a house's sphere pushes only who walks into it: HouseWards.js)
    Levitation: null, LevitationMaxima: null, /* (lifts — no push: LevitationMaxima.js) */ LevitateDuel: null, Ice: null, IceDuel: null, IceMaxima: null, IceDuelMaxima: null, Hammer: null,
    // (the strong duel spells push nobody: a haze, a beam of light that bursts or not, a lightning, the black light — StrongMagic)
    Accentric: null, Pilbidrio: null, Electrum: null, Die: null,
    Disarmor: null, // (its throw is «Джолт»'s own — Duel._joltCreature / applyToMe)
    Fire: { push: 0, jolt: 0.6 },
    Inferno: { push: 1.5, jolt: 0.6 },
    Ward: { push: 7, jolt: 1.5 }, // (a house's barrier shoves back the one who pushes on it: HouseWards.js)
    Hellfire: { push: 0, jolt: 0.8 }, // (it burns, it does not push: Hellfire.js)
    Sands: { push: 5, jolt: 2.5 }, SandsDuel: { push: 5, jolt: 2.5 }, // («Даст»: a light puff — the head jolts, the legs slow down: Slow.js)
    Wind: { push: 26, range: 14, jolt: 1 }, WindMaxima: { push: 78, range: 24, jolt: 2 }, // (on bodies: twice its push on things — SpellManager.castWind)
    // («Overgrown»: thrown apart to the sides and up — never hurts by itself; Overgrown.js)
    Overgrown: { push: 16, range: 16, toss: 5, jolt: 1 }, OvergrownMaxima: { push: 32, range: 24, toss: 10, jolt: 2 },
    // (a real wave: it sweeps a body off its feet and carries it — WaveAttack.js; a heavy cow only staggers)
    // (a wall of water knocks everyone it covers off the feet — a knight in armour too, not only a reel)
    WaveAttack: { push: 13, toss: 3.5, wet: true, always: true, down: 1.5 }, WaveAttackMaxima: { push: 20, toss: 4.7, wet: true, always: true, down: 2.5 },
    Thunderwave: { push: 20, thunder: true, jolt: 3 },
    Sapira: { push: 12, jolt: 3 }, SapiraDuel: { push: 12, jolt: 3 },
    Expelliarmus: { push: 3, jolt: 2 }, // (a jolt; what it really does is knock the wand out: Expelliarmus.js)
    // («Джолт»: a bolt of air — off the feet, thrown back and up, a tumble in the air (Duel.JOLT);
    //  the toss stays under a hurting fall's height on flat ground: only a real drop hurts)
    Jolt: { push: 20, always: true, down: 2.5, toss: 7, jolt: 3 }, JoltMaxima: { push: 60, always: true, down: 4, toss: 11, jolt: 5 },
    Stupefy: { push: 4, always: true, down: 1.5 }, AvadaKedavra: { push: 3, always: true, down: 1.5 },
    Bombardo: { blast: true, jolt: 3, down: 1.5 }, BombardoMaxima: { blast: true, jolt: 4, down: 2.5 },
    Earthquake: { push: 3, always: true, down: 1.5, toss: 4 }, EarthquakeMaxima: { push: 5, always: true, down: 2.5, toss: 6 },
    TotalDestruction: { push: 6, always: true, down: 3, toss: 6, jolt: 3 }, // (the ground jumps, the walls fall)
    TotalDestructionMaxima: { push: 9, always: true, down: 6, toss: 8.5, jolt: 4 },
    // (the great waves throw by distance themselves — CircleAttack.circleThrow / Inspirius.inspiriusThrow: the closer, the further)
    CircleAttack: { push: 10, always: true, down: 3, toss: 8, jolt: 3 }, CircleAttackMaxima: { push: 15, always: true, down: 4, toss: 12, jolt: 4 },
    Inspirius: { push: 25, always: true, down: 5, toss: 16, jolt: 5 },
    Boom: { push: 30, always: true, down: 6, toss: 18, jolt: 6 }, // («Бум»: Boom.boomThrow — the closer, the further)
    Lightning: { push: 8, always: true, down: 2, jolt: 2 }, LightningStrike: { push: 8, always: true, down: 2, jolt: 2 },
    Breakthrough: { push: 8, toss: 6 }, BreakthroughMaxima: { push: 12, toss: 8 },
    WallRise: { push: 8, toss: 6 }, WallRiseMaxima: { push: 12, toss: 8 },
    Attack: { push: 6, jolt: 1.5 },
    // (the vortex pushes by its own volume — WaterVortex.pushOf — and throws off the feet when big)
    WaterVortex: { push: 0, own: true, wet: true }, WaterVortexSuperMaxima: { push: 0, own: true, wet: true }, VortexBubble: null, FireMaxima: { push: 0, jolt: 0.6 },
    Firefighting: { push: 1.5, wet: true }, FirefightingMaxima: { push: 3, wet: true }, // (water from the hand: a light shove, no harm — Firefighting.js)
    Alive: null, // (a tree comes alive: nobody is pushed by the spell itself)
    RodFrozen: null, RodIce: null, // (the Ice Rod: ice round a body / on a surface — nobody pushed)
    Snowman: null, // (snow rolls into a snowman where the hand points: nobody is pushed)
    Unfurl: null, Furl: null, // (a ship's sails: they move the ship, not bodies)
    // («Wind Impulse»: a ring of air from the caster, pushes straight away — WindImpulse.impulsePush gives the push)
    // (everybody in the ring is thrown off the feet and up a little — knights in plain armour too)
    WindImpulse: { push: 22, range: 3, always: true, down: 1.5, toss: 4, jolt: 1.5 }, WindImpulseMaxima: { push: 34, range: 9, always: true, down: 2, toss: 6, jolt: 2.5 },
    // («Drawdown»: the ground sinks — bodies stand on it and go down with it, nobody is pushed;
    //  «Stitching»: stones laid where nobody stands; «Invisibility»: nobody sees — Drawdown.js / Stitching.js / Invisibility.js)
    Drawdown: null, DrawdownMaxima: null, Stitching: null, Invisibility: null, CreateBridge: null, Groundprud: null, /* (the ground rises where nobody stands — Groundprud.js) */ // («Create a Bridge»: planks laid where nobody stands — Bridge.js)
    GroundVortex: { push: 7, jolt: 0.3 }, GroundShield: null, /* (a flying block of the earth vortex: GroundVortex.js; the shield word pushes nobody) */
    VisibleGodi: null, // («Visible Godi»: a look through a wall — pushes nobody, VisibleGodi.js)
    Fireworks: null, // («Fireworks»: sparks high up — they push and hurt nobody, Fireworks.js)
    Liquidation: { push: 2, jolt: 1.5 }, LiquidationMaxima: { push: 2, jolt: 1.5 }, // (a splash: −3 HP, a little shove — Liquidation.js)
    IceBall: { push: 6, jolt: 1.5 }, IceBallBig: { push: 12, jolt: 2 }, WaterHit: { push: 4, wet: true },
};

export const thunderPush = (d) => 20 * Math.max(0.1, 1 - 0.9 * d / 40);

/** The push a spell gives at distance d (hero m/s). */
export function spellPush(name, d = 0) {
    const P = SPELL_PHYSICS[name];
    if (!P) return 0;
    if (P.thunder) return thunderPush(d);
    if (P.blast) return blastPush(d, name === 'BombardoMaxima' ? 6.24 : 3.6, name === 'BombardoMaxima' ? 3 : 1);
    return (P.push || 0) * (P.range ? Math.max(0, 1 - 0.6 * d / P.range) : 1);
}

/** Blast speed (as Game.applyExplosion). */
export const blastPush = (d, radius, power) => Math.max(0, (radius + 3 - d) * 4 * Math.sqrt(power));

/** What a spell does to a body at distance d: 'none' | 'stagger' | 'knockdown' (| 'shatter'). */
export function spellOutcome(name, d = 0, m = {}) {
    const P = SPELL_PHYSICS[name];
    if (!P) return 'none';
    if (P.always) return m.dome || m.blocked ? 'none' : 'knockdown';
    return classify(spellPush(name, d), m);
}

// ============================================================ creatures
/**
 * How heavy and steady each creature is (mass: the same push moves it 1/mass as fast;
 * quad: four legs). Unknown kinds count as a person.
 */
export const CREATURE_BODY = {
    zombie: { mass: 1 },
    person: { mass: 1 }, knight: { mass: 1.4 }, king: { mass: 1.3 }, wizard: { mass: 1 },
    cow: { mass: 2.2, quad: true }, horse: { mass: 2.4, quad: true }, pig: { mass: 1.1, quad: true }, sheep: { mass: 1, quad: true },
    tree: { mass: 3.5 },
    phoenix: { mass: 0.4 }, // (a bird half a hero tall, hollow bones: a gust throws it far)
    snowman: { mass: 0.8 }, iceQueen: { mass: 3 }, iceMonster: { mass: 7 }, // (the Ice Castle: IceQueen.js)
};
export const bodyOf = (kind) => CREATURE_BODY[kind] || CREATURE_BODY.person;
