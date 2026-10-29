/**
 * CanaryRules.js — the Canaries («Канарики»): rules, numbers and the «who / what» table (no THREE: the tests read it).
 *
 * WHO THEY ARE: small (about half a hero), broad, very strong swamp people with canary-yellow crests, living in camps of 3–8 on the marshy shores of lakes. They are
 * not magical and not a «житель»: a creature of the wild, like a boar that throws things. Peaceful until somebody walks into their TERRITORY (25 m round the camp's fire,
 * marked by bone totems at its edge): then the whole camp rages, every canary takes a big boulder in BOTH hands (the camp is full of them), winds up and hurls it —
 * a physical shot: ~8 HP, a hard shove, an arc you can sidestep or hold off with a «Protection». Out of rocks, or with the trespasser up close, a canary punches (−4, a
 * heavy shove). They also throw at whatever else is in their territory (villagers, animals, zombies). They do not leave the camp's neighbourhood (LEASH), do not
 * follow, cannot be tamed. The leader (the first of the camp) dead → the rest flee. They leave hide and bones.
 *
 * NUMBERS are here once; Canaries.js uses them.
 */

export const CANARIES = {
    // --- where they live (generation ≥ CANARIES_FROM_GEN — Terrain.js)
    CELL: 160, // m: a camp may be in a cell of this size
    CHANCE: 0.45, // of the cells that have a marshy shore
    GROUP: { min: 3, max: 8, mode: 5 },
    SHORE_R: [7, 11], // m: rings where the water is looked for round a camp
    SHORE_MIN: 3, // water columns of 24 round it (≥) …
    LAND_MIN: 8, // … and land of 24 (≥) — a shore, not a island or a lake's middle
    FLAT: 2, // layers: the most the ground may rise or fall within 5 m of the fire
    START_FREE: 110, // m from the start place: none (the first minutes are calm)
    LOAD: 150, KEEP: 260, DRAW: 130, ANIM: 70, // m
    // --- the creature
    HP: 40, H: 2.2, R: 0.55, // body radius (m) for walking round and for blows
    WALK: 2.0, RUN: 5.2, CARRY: 1.6, // m/s: a stocky waddle; the hero walks ~4.9 and runs 9.75
    // --- territory and temper
    TERR_R: 25, // m from the fire: a trespasser
    NOTICE_R: 25, // …is noticed within this (a canary sees as far as the territory; an invisible one is not seen)
    LEASH: 36, // m from the fire: the farthest a canary goes (after a target or to fetch a rock)
    FORGET_T: 6, // s without a trespasser in the territory: calm again
    FLEE_T: 9, // s a camp runs after its leader falls
    CALM_COOL: 12, // s: after the fight is over the camp does not throw at once if the trespasser comes back
    // --- the throw
    ROCK_R: [0.44, 0.62], // m: boulders (about a metre across)
    ROCKS: [9, 14], // in a camp
    ROCK_FETCH: 20, // m: the farthest a canary walks for a rock
    ROCK_RESPAWN: 90, // s: a camp with fewer than 4 rocks gets another one lugged in (when nobody is near)
    ROCK_MAX_TOTAL: 160, // thrown boulders kept lying in the world (older ones sink into the ground)
    THROW_SPEED: 22, G: 24, // m/s; m/s² (the game's own): the farthest it reaches on the flat is v²/g ≈ 20 m
    THROW_RANGE: [5, 20], // m: no nearer (it punches), no farther (it walks closer)
    LIFT_T: 0.95, WIND_T: 0.6, THROW_T: 0.42, // s (the poses)
    RELEASE_AT: 0.4, // of THROW_T: the rock leaves the hands
    COOL: [2.6, 4.8], // s between two throws of one canary
    SPREAD: 0.045, // m of error per m of distance (a sidestep still dodges it)
    DMG: 8, // HP (a hero has 20)
    PUSH: 11, // m/s: the shove of the hit (a hero is flung ~2 m)
    SHOVE: { REACH: 2.5, DMG: 4, PUSH: 13, T: 0.55, HIT_AT: 0.5, COOL: 1.6 },
    HIT_STUN: 0.45, // s a canary flinches from a blow
    DEATH_T: 28, // s a body lies before it is taken away
    SIGHT_R: 40, // m: a canary sees a fight (and a rock thrown) this far — the camp joins
    TALK_EVERY: [5, 11], // s between idle mutters
};

/** The hash of a cell → [0, 1) (the same on every computer). */
export const hash = (a, b, seed, salt = 0) => {
    let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed | 0, 1442695041) + Math.imul(salt, 2246822519)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

/** The size of the group of a camp: mostly `mode`, sometimes fewer / more. */
export function groupSize(gx, gz, seed) {
    const G = CANARIES.GROUP, r = hash(gx, gz, seed, 61);
    let n = G.mode;
    if (r < 0.25) n = G.mode - 1 - (r < 0.1 ? 1 : 0); else if (r > 0.75) n = G.mode + 1 + (r > 0.92 ? 1 : 0);
    return Math.max(G.min, Math.min(G.max, n));
}
/** Does the cell (gx, gz) have a camp, if it has a shore? (the luck; the shore is found on the land itself) */
export const campLuck = (gx, gz, seed) => hash(gx, gz, seed, 17) < CANARIES.CHANCE;
/** The k-th place to try for the camp's fire in a cell: [x, z], 20 m in from the edges. */
export function campCandidate(gx, gz, seed, k) {
    const C = CANARIES.CELL;
    return [gx * C + 20 + hash(gx, gz, seed, 100 + k * 2) * (C - 40), gz * C + 20 + hash(gz, gx, seed, 101 + k * 2) * (C - 40)];
}
/** The members of a camp: [{i, id, x, z, look, leader}] round the fire (5…9 m, spread). */
export function campMembers(def, seed) {
    const n = groupSize(def.gx, def.gz, seed), out = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(def.gx, def.gz, seed, 200 + i) * 0.7, d = 3.2 + hash(def.gx + i, def.gz, seed, 210 + i) * 3.8;
        out.push({ i, id: `cn${def.gx},${def.gz}.${i}`, x: def.x + Math.sin(a) * d, z: def.z + Math.cos(a) * d, look: Math.floor(hash(def.gx, def.gz + i, seed, 220 + i) * 100000), leader: i === 0 });
    }
    return out;
}
/** The boulders of a camp: [{i, id, x, z, r, v (variant), yaw}] scattered 3…17 m from the fire, not on the fire. */
export function campRocks(def, seed) {
    const [lo, hi] = CANARIES.ROCKS, n = lo + Math.floor(hash(def.gx, def.gz, seed, 300) * (hi - lo + 1)), out = [];
    for (let i = 0; i < n; i++) {
        const a = hash(def.gx, def.gz + i, seed, 310 + i) * Math.PI * 2, d = 3 + hash(def.gx + i, def.gz, seed, 330 + i) * 14;
        const r = CANARIES.ROCK_R[0] + (CANARIES.ROCK_R[1] - CANARIES.ROCK_R[0]) * hash(i, def.gx, seed, 350 + i);
        out.push({ i, id: `cr${def.gx},${def.gz}.${i}`, x: def.x + Math.sin(a) * d, z: def.z + Math.cos(a) * d, r, v: i % 3, yaw: a * 3 });
    }
    return out;
}

// ============================================================ the throw
/**
 * The velocity that carries a boulder from `from` {x, y, z} to `to` {x, y, z} at `speed` (m/s) under gravity `g` — the low arc; when it cannot reach
 * at that speed, the 45° arc at the speed it needs (capped ×1.3). `vel` {x, z} is the target's own velocity: aimed where it will be. → {vx, vy, vz, t, ok}
 */
export function solveThrow(from, to, speed = CANARIES.THROW_SPEED, g = CANARIES.G, vel = null, lead = 1) {
    let tx = to.x, tz = to.z, t = 0;
    for (let k = 0; k < 3; k++) { // (the flight time depends on where it lands: a few passes)
        const dx = tx - from.x, dz = tz - from.z, D = Math.hypot(dx, dz) || 1e-3, H = to.y - from.y;
        const disc = speed ** 4 - g * (g * D * D + 2 * H * speed * speed);
        let ang;
        if (disc >= 0) ang = Math.atan2(speed * speed - Math.sqrt(disc), g * D); else ang = Math.PI / 4;
        const sp = disc >= 0 ? speed : Math.min(speed * 1.3, Math.sqrt(g * D / Math.sin(2 * Math.PI / 4) + Math.max(0, H) * g));
        t = D / Math.max(0.1, sp * Math.cos(ang));
        if (vel && lead) { tx = to.x + vel.x * t * lead; tz = to.z + vel.z * t * lead; } else break;
    }
    const dx = tx - from.x, dz = tz - from.z, D = Math.hypot(dx, dz) || 1e-3, H = to.y - from.y;
    const disc = speed ** 4 - g * (g * D * D + 2 * H * speed * speed);
    const ok = disc >= 0, ang = ok ? Math.atan2(speed * speed - Math.sqrt(disc), g * D) : Math.PI / 4;
    const sp = ok ? speed : Math.min(speed * 1.3, Math.sqrt(g * D + Math.max(0, H) * g * 2));
    return { vx: dx / D * sp * Math.cos(ang), vy: sp * Math.sin(ang), vz: dz / D * sp * Math.cos(ang), t, ok };
}
/** A shot's error (m) at distance d: grows with it. */
export const spreadAt = (d) => CANARIES.SPREAD * d;

// ============================================================ who / what
/**
 * ON WHOM AND ON WHAT (CLAUDE.md «кто/что»). Columns: `is` — how a canary treats the kind, `hit` — how the kind's things act on a canary.
 * Spells / blows: «не действует» is written with its reason.
 */
export const CANARY_TARGETS = {
    me: { does: 'throws', why: 'я: вошёл в их территорию (25 м от костра) — весь лагерь швыряет в меня валуны (−8 ❤, сильный толчок; уклониться шагом в сторону или поднять «Protection»); вплотную бьют кулаком (−4)' },
    players: { does: 'throws', why: 'другие игроки — то же; каждый компьютер решает про СВОЕГО игрока, хост ведёт канариков и сообщает о броске всем' },
    zombies: { does: 'throws', why: 'зомби в их территории — цель, как и всякий чужой; валун бьёт зомби как существо' },
    castlePeople: { does: 'throws', why: 'жители, рыцари, волшебники, забредшие в территорию, — цель; рыцари видят их как опасность жителям (Danger) и идут бить' },
    animals: { does: 'throws', why: 'животные в территории — цель; камень бьёт их (−8)' },
    sailors: { does: 'none', why: 'моряки на кораблях — не на болоте' },
    spider: { does: 'none', why: 'гигантскую паучиху канарики обходят: она слишком велика, камни ей нипочём' },
    livingTrees: { does: 'none', why: 'ожившие деревья слишком велики; камни их не берут' },
    bookBirds: { does: 'none', why: 'книги-птицы летают выше броска' },
    dragons: { does: 'flee', why: 'дракон над лагерем — канарики прячутся (бегут), не бросают' },
    phoenixes: { does: 'none', why: 'феникс в небе' },
    owls: { does: 'none', why: 'сова не в территории: она летает' },
    iceCastle: { does: 'throws', why: 'снеговики и ледяные монстры в территории — цель (камень их крошит); Королеву канарики не знают' },
    gargoyle: { does: 'flee', why: 'адская горгулья — канарики бегут от неё в тростники' },
    plants: { does: 'none', why: 'растения канарики не трогают; Ярколето сердится и жжёт их — они обходят' },
    items: { does: 'none', why: 'вещи на земле им не нужны' },
    // how things act on a canary
    blade: { does: 'hurts', why: 'меч / топор / копьё — урон как есть (HP 40); удар сердит весь лагерь' },
    fist: { does: 'weak', why: 'кулак — слабо (×0,4)' },
    arrow: { does: 'hurts', why: 'стрела — урон как есть; лагерь сердится' },
    blast: { does: 'hurts', why: 'Бомбардо — урон взрывом, толчок и падение; Максима — вдвое' },
    fire: { does: 'burns', why: 'огонь — горят и бегут к воде (Burning), −2 ❤/с' },
    cold: { does: 'slows', why: 'лёд / Frozen — замирает на время (как любое существо)' },
    avada: { does: 'kills', why: '«Авада Кедавра» (со свитка) убивает; не магические — пострадавший зол, но их щиты не особенные' },
    alive: { does: 'none', why: '«Alive» — на деревья; канарик — не дерево' },
    shield: { does: 'blocks', why: 'камень — физический снаряд: «Protection» держит его (не магический щит: без маны за камень и без особого эффекта)' },
    gods: { does: 'kills', why: 'заклинания богов — убивают; «Inspirius» тоже' },
    imperius: { does: 'takes', why: '«Империус» (простой) берёт канарика: он не магический' },
};

/** The sounds a canary makes (CanarySounds.js): [kind] → what it is. */
export const CANARY_VOICES = { grr: '«Грр!» — завидел чужака', ha: '«Ха!» — бросок', lift: 'кряхтение при подъёме камня', hurt: 'крик от удара', die: 'последний вздох', mutter: 'довольное бормотание в лагере', thud: 'валун ударил о землю', hit: 'валун попал по телу', whoosh: 'камень летит' };
