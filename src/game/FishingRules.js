/**
 * FishingRules.js — fishing: the rules (pure numbers; the rod, the float and the line themselves — Fishing.js, the models — FishingRodModel.js).
 *
 * The author 07.11: «технология удочки… в творческом режиме отдельный мини-причал для рыбаков, там можно бесплатно взять удочку — чтобы я протестировал».
 * The principle of the game: «с помощью рук ты можешь делать всё то же, что в жизни» — so nothing here is a button or a timer pretending to be a hand:
 *   - CAST: the rod is swung forward and stopped — the float flies off the rod's tip with the speed the tip had at the top of the swing (`castVelocity`);
 *     a slow wave of the rod throws nothing, a hard whip throws far (the tip's speed, the angle of the swing — the arc).
 *   - BITE: the float dips and rings spread; the hook is set by a jerk of the rod UP / BACK within `BITE.WINDOW` s (`isStrike`) — too early or too late: nothing.
 *   - FIGHT: the fish pulls, the line is taut; the rod is pumped — lifted (the line comes in) and lowered (the slack is wound up while it goes down) —
 *     `fightStep`; pulled too hard — the line snaps (`FIGHT.SNAP`), left slack too long — the hook falls out.
 * What is caught is a real fish of the sea's hundred (ReefFish.FISH_SPECIES): the kind by the water's depth and by where it is (the sea, a lake).
 *
 * ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»): FISHING_TARGETS below. Checked by tests/unit/fishing.test.js.
 */

export const FISHING = {
    ROD_LEN: 2.1, // model units (×ITEM_SCALE.fishingRod in the hand: ~4.4 m — the hero is ~3.5 m, the rod is two bodies' long)
    TIP_Y: 2.1,
    HANG: 1.1, // m: the float hangs this far under the tip on the short line (nothing cast)
    CAST_V: 4.2, // m/s: the tip must move this fast forward for the swing to be a cast
    CAST_GAIN: 1.55, // the float leaves faster than the tip (the rod's whip + the line's slip)
    CAST_MAX: 30, // m/s
    CAST_MIN: 7, // m/s: even a feeble swing throws it this far
    UP_BIAS: 0.18, // a little loft added to the throw (the line leaves over the top guide)
    CAST_END: 0.72, // the swing is over (the line is let go) when the tip is this share of its peak speed
    G: 15, // m/s² on the float (a light thing in the air: less than a stone)
    DRAG: 0.05, // air
    LINE_MAX: 62, // m of line on the reel
    LAND_WAIT: 1.4, // s the float lies on dry ground before it is wound back by itself
    FLOAT_R: 0.2, // m: the float's body
    RETRIEVE_T: 0.9, // s the float flies back to the rod (a free line wound up)
    RETRIEVE_V: 3.2, // m/s: the rod tip pulled away this fast with nothing on the hook — the line is wound in
    // a wait for a bite
    BITE: { WAIT: [4.5, 15], WINDOW: 1.7, TUG: 0.35, STRIKE_UP: 2.6, STRIKE_BACK: 3.2, FIRST_TUG: 0.5 },
    // the fish on the line
    FIGHT: {
        CATCH_AT: 2.6, // m of line (rod tip to the float) at which a tired fish is landed
        TIRED: 0.62, // stamina below it: it can be landed
        SNAP: 1.0, SNAP_T: 0.55, // tension ≥ 1 for this long — the line snaps
        SLACK: 0.12, SLACK_T: 2.6, // tension < 0.12 for this long — the hook falls out
        PUMP_GAIN: 0.55, REEL_GAIN: 0.85, PUMP_MAX: 6, DOWN_MAX: 4,
        SWEET: [0.3, 0.9], TIRE: 0.14, REST: 0.07,
        BURST: 0.7, // how much the run comes in bursts
    },
};

/** Where the float is: 'rig' stowed before a cast, 'cast' in the air, 'float' on the water, 'ground' on dry land, 'bite' dipped under, 'fight' a fish on the line, 'back' winding in. */
export const STATES = ['rig', 'cast', 'float', 'ground', 'bite', 'fight', 'back'];

/** The velocity (m/s) the float leaves with: from the tip's velocity at the top of the swing and the way the hero faces. null — not a cast (a slow wave). Pure. */
export function castVelocity(tipV, face, K = FISHING) {
    const sp = Math.hypot(tipV.x, tipV.y, tipV.z);
    if (sp < K.CAST_V) return null;
    const fl = Math.hypot(face.x, face.z) || 1, fx = face.x / fl, fz = face.z / fl;
    const fwd = (tipV.x * fx + tipV.z * fz) / sp; // the swing's share along where the hero looks
    if (fwd < 0.25) return null; // a backswing, a wave to the side: not a cast
    const v = Math.min(K.CAST_MAX, Math.max(K.CAST_MIN, sp * K.CAST_GAIN));
    // the direction: the swing's own, a little loft, never into the ground
    let dx = tipV.x / sp, dy = tipV.y / sp + K.UP_BIAS, dz = tipV.z / sp;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    return { x: dx * v, y: Math.max(dy * v, v * 0.12), z: dz * v, speed: v };
}

/** Is this swing a strike (setting the hook)? The tip moved UP or BACK (away from the water's side) fast. `tipV` {x,y,z}, `back` — the unit vector from the float to the hero. Pure. */
export function isStrike(tipV, back, K = FISHING) {
    const up = tipV.y;
    const away = tipV.x * back.x + tipV.z * back.z;
    return up >= K.BITE.STRIKE_UP || away >= K.BITE.STRIKE_BACK;
}

/**
 * Which kind bites. `species` = FISH_SPECIES; `w` = {depth (m of water), sea: bool}; `rnd` a random in [0,1). Weighted: the small reef fish plenty, the big ones rarer,
 * the magic ones rare; a fish lives at its depth (a kind that lives deeper than the water is not there). A lake or a river: only the mullets (they go up the rivers).
 * Returns the species (never null: a sardine at the worst).
 */
export function pickSpecies(species, w, rnd = Math.random) {
    const pool = [];
    let total = 0;
    for (const s of species) {
        if (!w.sea && s.arch !== FRESH_ARCH) continue;
        if (s.depth[0] - 1 > w.depth) continue; // lives deeper than this water is
        let k = 1 / (0.35 + s.len * 1.6); // the small ones plenty
        if (s.len > 0.8) k *= 0.45;
        if (s.magic) k *= 0.12;
        const fit = s.depth[0] <= w.depth && s.depth[1] + 6 >= w.depth ? 1 : 0.4;
        k *= fit;
        pool.push([s, k]); total += k;
    }
    if (!pool.length) return species.find((s) => s.arch === FRESH_ARCH) || species[0];
    let x = rnd() * total;
    for (const [s, k] of pool) { x -= k; if (x <= 0) return s; }
    return pool[pool.length - 1][0];
}
export const FRESH_ARCH = 18; // the mullet's place in ReefFish.ARCH (a test keeps it so)

/** The caught fish's length (m): the kind's own length ±30 %. */
export const fishLength = (sp, rnd = Math.random) => Math.round(sp.len * (0.75 + 0.55 * rnd()) * 100) / 100;
/** Its weight (kg), by length: a fish is a flattened ellipsoid — about 8 kg for a metre of fish. */
export const fishWeight = (len, h = 1) => Math.max(0.01, Math.round(8 * len ** 3 * (0.7 + 0.3 * h) * 100) / 100);
/** Strength (m/s it runs) and stamina of a hooked fish, by the kind's size. */
export function fishStrength(sp, len, rnd = Math.random) {
    const base = 1.1 + 4.2 * Math.min(1, len / 1.2);
    return { strength: base * (0.85 + 0.3 * rnd()) * (sp.magic ? 1.25 : 1), stamina: 1 };
}
/** The money value of a fish (coins): by weight, the magic ones dear. */
export const fishValue = (it) => Math.max(1, Math.round(2 + (it.weight ?? fishWeight(it.len || 0.3)) * 3 * (it.magic ? 4 : 1)));

/** A fish as a thing (an inventory item): the kind's id, its size, raw. */
export function makeFishItem(sp, len, uid) {
    return { kind: 'fish', uid, species: sp.id, len, weight: fishWeight(len, sp.h), cooked: false, magic: !!sp.magic };
}

/** The wait (s) before the next bite. */
export const biteWait = (rnd = Math.random, K = FISHING) => K.BITE.WAIT[0] + rnd() * (K.BITE.WAIT[1] - K.BITE.WAIT[0]);

/**
 * One step of the fight (dt s). `f` = {line (m, rod tip → float), strength, stamina 0…1, t, snapT, slackT, tension, phase}; `tipAway` — how fast the rod tip moves away
 * from the float, m/s (+: the rod is lifted — pumping; −: the rod comes down — the slack is wound up). → 'caught' | 'snapped' | 'slack' | 'escaped' | null. Mutates `f`.
 */
export function fightStep(f, dt, tipAway, K = FISHING.FIGHT, catchAt = K.CATCH_AT) {
    f.t += dt;
    const burst = 1 + K.BURST * Math.sin(f.t * 2.3 + (f.seed || 0)) * Math.sin(f.t * 0.9 + 1.7); // (runs and rests)
    const run = f.strength * (0.08 + 0.92 * f.stamina ** 1.5) * Math.max(0.1, burst); // (a tired fish hardly pulls)
    const pull = Math.min(K.PUMP_MAX, Math.max(0, tipAway));
    const down = Math.min(K.DOWN_MAX, Math.max(0, -tipAway));
    // the line: the fish takes it out; the lifted rod brings it in; the lowered one winds up the slack
    f.line += run * dt * (0.75 - 0.3 * f.stamina);
    f.line -= pull * K.PUMP_GAIN * dt * (1.15 - 0.6 * f.stamina);
    f.line -= down * K.REEL_GAIN * dt;
    if (f.line < 0.5) f.line = 0.5;
    // the tension: the fish's run + the hand against it, over what the line stands (a thin line: 2.2 × the fish's strength)
    f.tension = (run * 0.9 + pull * 0.9) / (f.strength * 2.2 + 0.4);
    if (f.tension > K.SNAP) f.snapT += dt; else f.snapT = Math.max(0, f.snapT - dt * 0.8);
    if (f.tension < K.SLACK) f.slackT += dt; else f.slackT = Math.max(0, f.slackT - dt * 1.5);
    // the fish tires while it is held in the sweet spot, rests when the line is slack
    if (f.tension >= K.SWEET[0] && f.tension <= K.SWEET[1]) f.stamina = Math.max(0, f.stamina - K.TIRE * dt);
    else if (f.tension < K.SLACK) f.stamina = Math.min(1, f.stamina + K.REST * dt);
    if (f.snapT >= K.SNAP_T) return 'snapped';
    if (f.slackT >= K.SLACK_T) return 'slack';
    if (f.line > FISHING.LINE_MAX) return 'escaped';
    if (f.line <= catchAt && f.stamina <= K.TIRED) return 'caught';
    return null;
}
/** A fight's start: the line out is the distance to the float. */
export const newFight = (line, strength, stamina = 1, seed = Math.random() * 6) => ({ line, strength, stamina, t: 0, snapT: 0, slackT: 0, tension: 0, seed });

/** How much the rod bends (0 … 1) for the tension (the picture: a loaded rod arcs, a free one is straight). */
export const rodBend = (tension) => Math.min(1, Math.max(0, tension) * 0.9);

/** ON WHOM / ON WHAT — what fishing does (CLAUDE.md «кто/что × как действует»). */
export const FISHING_TARGETS = {
    water: { does: 'fish', why: 'в море (и в гавани) клюёт любая из ста рыб по глубине; в озёрах и реках — только кефаль; в луже глубже метра — тоже; воды нет — поплавок лежит на земле и сам возвращается' },
    lava: { does: 'none', why: 'в аду лава: поплавок не ныряет, рыбы нет; удочка там просто палка' },
    land: { does: 'none', why: 'на суше поплавок просто ложится на землю и через пару секунд сам наматывается' },
    players: { does: 'none', why: 'крючок не цепляет игроков и их вещи: леска проходит сквозь людей (никому не больно); другие видят удочку в вашей руке' },
    creatures: { does: 'none', why: 'поплавок не задевает зомби, жителей, зверей и корабли — это не оружие; леска не ловит плывущих (рыбы моря — только та, что клюнула)' },
    ships: { does: 'none', why: 'с палубы корабля ловить можно: поплавок падает в воду рядом; сам корабль леска не держит' },
    swimming: { does: 'ok', why: 'плывя, удочку держать можно, забросить — нельзя (руки в воде заняты греблей: заброс по скорости руки не засчитывается)' },
    cast: { does: 'hand', why: 'заброс — настоящий взмах: скорость кончика удочки в вперёд определяет полёт поплавка; слабый взмах — недалеко, резкий — далеко' },
    bite: { does: 'hand', why: 'поклёвку видно по поплавку (нырнул, круги); подсечка — рывок удочки вверх/на себя в окно ~1,7 с' },
    fight: { does: 'hand', why: 'вываживание: удочку поднимают (леска идёт к вам) и опускают (слабину выбирают сами); дёрнули слишком резко — леска рвётся, слабая — рыба срывается' },
    drop: { does: 'safe', why: 'бросили/спрятали удочку во время рыбалки: поплавок мгновенно наматывается, рыба уходит; при смерти и выходе — то же; вещи не теряются' },
    network: { does: 'visual', why: 'видна только удочка в руке; леску и поплавок каждый считает у себя (улов — личная вещь того, кто поймал)' },
    night: { does: 'ok', why: 'ловится и ночью (магические рыбы светятся в воде)' },
};
