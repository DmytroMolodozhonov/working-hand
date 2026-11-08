/**
 * TitanRules.js — the Titans: the shards of the gods' power that fell on the planets (pure: tests/unit/titans.test.js).
 * The game side: Titans.js (life, minds, network, save), the bodies: TitanModels.js.
 *
 * The story (CLAUDE.md «Сюжет»): the gods gave their power to the Sun and became mortal; the shards of that power fell on the
 * planets and became TITANS (on the Earth — the god Diabolos, no titan). Kill every titan → become a god: immortal, and the Hall
 * of the Sun opens (Godhood.js).
 * The author (06.11): seven titans — one on every planet but the Earth (there: the god Diabolos) — after the cartoon «Hercules» (rock, fire, ice, wind) and the new «Dune» (the sandworm): the rock titan on
 * Saturn (the biggest), the fire one on Venus, the sandworm on Mars, the ice one on Neptune (Pluto is a dwarf planet), the shade on Uranus, the living storm on Jupiter the iron titan on Mercury
 * («Меркурий это планета, так что должен быть»; none on the Moon — «the Moon is no planet»); names and looks of our own, no copies; a titan's only reward is 1000 mana cells; all of them — 10 000 more and immortality. Their walk shakes the ground
 * round the steps and leaves dents (CLAUDE.md «Титаны»). In the Codex — a section of their own: «Боссы божественного уровня».
 *
 * Measures (from the world's: a block 1 m, the hero 3.5 m, Diabolos 122.5 m): a titan is 70–110 m tall (the hero reaches its ankle),
 * Jupiter's living storm 200 m, the sandworm 300 m long (14 m thick: its mouth swallows a house). Its blows reach far, its steps are slow — one can run from it (the hero runs ~9.75 m/s).
 */

/** Every titan (one per planet). `kit` — its own way to fight (Titans.js), `look` — its body (TitanModels.js). */
// (the author 08.11: the titans' health 1000…1500 — the iron 1170, the stone 1500, the lava 1080, the worm 1250, the ice 1000, the shade 1130, the storm 1420)
export const TITANS = {
    mercury: {
        id: 'mercury', planet: 'mercury', name: 'Железный титан', title: 'Солнечный кузнец',
        about: 'Живёт на Меркурии, ближе всех к Солнцу. Подходить к нему с мечом или топором в руках — плохая затея: оружие можно и не удержать. А если он поворачивается к вам и начинает разгораться светом — уходите в сторону, и побыстрее.',
        height: 80, radius: 10, hp: 1170, walk: 4, kit: 'iron', look: 'iron',
        blow: 15, reach: 30,
        ranged: { every: [7, 11], dmg: 9, r: 3, len: 260, blind: 3 }, // the sun ray (blinds 3 s); the magnet pulls the weapons out of the hands
        magnet: { r: 90, every: [12, 18] },
    },
    saturn: {
        id: 'saturn', planet: 'saturn', name: 'Каменный титан', title: 'Гора, что ходит',
        about: 'Самый огромный из титанов, бродит по облачной равнине Сатурна. Под его шагами дрожит земля, а камни он швыряет так далеко, что держаться на расстоянии мало — надо ещё и двигаться.',
        height: 110, radius: 15, hp: 1500, walk: 3.4, kit: 'rock', look: 'rock',
        blow: 16, reach: 38, // the fist of a boulder / the stomp
        ranged: { every: [7, 11], dmg: 12, r: 8, speed: 36, n: 2 }, // boulders thrown; a stomp raises stone spikes round him
    },
    venus: {
        id: 'venus', planet: 'venus', name: 'Огненный титан', title: 'Живая лава',
        about: 'Живёт на раскалённой Венере. Всё вокруг него горит, а огненные шары он бросает издалека. Не стойте там, куда он смотрит, и не тяните время рядом с ним.',
        height: 75, radius: 9.5, hp: 1080, walk: 4.2, kit: 'fire', look: 'lava',
        blow: 14, reach: 28,
        ranged: { every: [6, 10], dmg: 9, r: 9, speed: 32, n: 3 }, // fireballs; a pool of lava under him
    },
    mars: {
        id: 'mars', planet: 'mars', name: 'Песчаный змей', title: 'Владыка дюн',
        about: 'Его почти не видно: он плывёт под песками Марса и находит вас по шагам. Если земля под ногами загудела — бегите, не оглядываясь. Бить его можно, только пока он над песком.',
        height: 300, radius: 14, hp: 1250, walk: 11, kit: 'worm', look: 'worm', burrows: true,
        blow: 30, reach: 16, // the swallow: in the circle of its mouth when it rises
        ranged: { every: [5, 8], dmg: 10, r: 18 }, // the tail's sweep / a falling wall of sand
    },
    neptune: {
        id: 'neptune', planet: 'neptune', name: 'Ледяной титан', title: 'Страж вечного льда',
        about: 'Живёт среди холода Нептуна. Рядом с ним легко вмёрзнуть в лёд и стать беззащитным, поэтому не стойте на месте и не подпускайте его близко.',
        height: 70, radius: 9, hp: 1000, walk: 3.9, kit: 'frost', look: 'ice',
        blow: 12, reach: 26,
        ranged: { every: [8, 12], dmg: 6, r: 14, freeze: 2.5 }, // a ring of spikes round the foe: −6, frozen 2.5 s; the freezing breath
    },
    uranus: {
        id: 'uranus', planet: 'uranus', name: 'Титан-тень', title: 'Полуночный',
        about: 'На Уране половину жизни стоит ночь, и он прячется в ней. В темноте его не разглядеть, пока он не окажется прямо рядом с вами — а свет для него большая неприятность.',
        height: 85, radius: 10, hp: 1130, walk: 4.4, kit: 'shade', look: 'shade',
        blow: 13, reach: 30,
        ranged: { every: [8, 12], dmg: 8, r: 20, dark: 6 }, // a wave of darkness: −8, the light round the hero gone for 6 s; then he steps through the dark (a blink)
        blink: { every: [9, 14], far: [25, 60] },
    },
    jupiter: {
        id: 'jupiter', planet: 'jupiter', name: 'Титан-вихрь', title: 'Живой смерч',
        about: 'Огромный живой смерч над бурями Юпитера. Подходить к нему опасно: он затягивает к себе и швыряет, а молнии бьют издалека. Держитесь дальше и смотрите, куда он движется.',
        height: 200, radius: 30, hp: 1420, walk: 6, kit: 'storm', look: 'storm', flies: true,
        blow: 10, reach: 40, // the wall of its whirl
        ranged: { every: [3, 5], dmg: 7, r: 4 }, // a lightning bolt
        pull: { r: 140, speed: 6 }, // m/s towards its heart within r
    },
};
export const TITAN_IDS = Object.keys(TITANS);

export const TITAN = {
    CELLS: 1000, // the reward for each (mana cells — Achievements 'titan_<id>')
    GOD_CELLS: 10000, // all of them: 10 000 more — and immortality (Achievements 'godhood', Godhood.js)
    BAR_R: 700, // m: the health bar shows for a fighting titan this near (TitanBar.js)
    ACTIVE_R: 1400, // m: a player on its planet nearer than this — it is in the world (its body, its mind)
    GONE_R: 1800,
    SEE: 320, // m: it notices a player
    LOSE: 700, // m: it gives up and goes home
    HOME_R: 500, // m it wanders round its home
    STEP_T: 1.9, // s between two steps at its walk
    QUAKE_R: 70, // m: a step shakes the ground this far
    KNOCK_R: 22, // m: … and knocks a hero off his feet this near the foot
    STEP_DMG: 3, // HP: a step right by a hero
    DENT_MAX: 160, // dents a titan leaves at most (the world's edits are saved — never without end)
    TURN: 0.5, // rad/s it turns
    BLOW_T: 2.2, // s a blow takes (wind-up → strike)
    BLOW_EVERY: 3.4,
    ROAR_EVERY: [18, 30], // s between its roars in a fight (no words — CLAUDE.md, the author 06.11)
    WAKE_T: 3.2, // s of its waking (it does not strike meanwhile)
    STAGE_T: 3, // s the turn of the body between two stages
    REGEN: 0, // they do not heal (a long fight is won by patience)
};

/*
 * They do NOT speak (the author 06.11: «не должны разговаривать как дьявол, но и не банальные»): a titan tells what it is by its body —
 * its life while no one is near (each its own, seen from afar), its waking, its roar, its blows seen coming, its wounds on the body, the
 * three stages of its fight (each with a new way to fight and a turn of the body between) and its staggering when struck hard and fast.
 *
 *   IRON (Mercury)   at peace: hammers on its anvil-rock (the clang heard far). Its mirror gathers the Sun — no ray where the Sun is down.
 *                    In the sunlight it heats (red-hot): then cold and water crack it (×2.5). The magnet tears the weapons out of the
 *                    hands — they fall by its feet. Stage 2: the clap (a ring of sparks along the ground); 3: both fists into the ground —
 *                    molten iron runs.
 *   ROCK (Saturn)    at peace: sits, a hill among hills; one who comes near sees the hill stand up. Tears a boulder out of the ground (a
 *                    real pit stays) and throws it. Stage 2: curls into a boulder and rolls at the foe; its stones break off as it is
 *                    hurt; 3: tears out a stone pillar — a club.
 *   LAVA (Venus)     at peace: sits in its lava lake and pours lava over itself. Hot — fast and burning; water and ice crust it (slow;
 *                    then blasts break the crust ×2) — crusted, it goes back to the lake to heat (a frozen lake does not heat it).
 *                    Stage 2: the eruption (geysers running at the foe); 3: the rain of fire.
 *   WORM (Mars)      hears steps: one who stands or creeps is not found; a loud blast elsewhere lures it there; never rises out of rock.
 *                    It swallows (dark inside, then spat out); a spell into the open mouth hurts it most. Stage 3: it leaps out whole and
 *                    falls head first on the foe.
 *   ICE (Neptune)    at peace: a still guard with its spear, breathing frost. Its steps leave ice; the frost breath; a cage of ice round
 *                    the foe (real blocks — break them). Stage 2: grows a shell of ice — only fire melts it; 3: the blizzard.
 *   SHADE (Uranus)   looked at in a light it freezes, its arms over its face (and is hurt fully); turned from — it creeps near, silent.
 *                    Its dark puts out the lights. Stage 2: shadows of itself (they melt in light; the true one does not).
 *   STORM (Jupiter)  draws in and throws; a spot of light on the ground before each lightning; its calm eye — the heart inside hurt ×3,
 *                    but none stays in long; the wind's spells feed it (it grows). Stage 2: throws what it has drawn up; 3: three whirls.
 */

/** The stages of a titan's fight by its health: 1 (full) · 2 (≤ 2/3) · 3 (≤ 1/3). */
export const titanStage = (hp, hpMax) => (hp > hpMax * (2 / 3) ? 1 : hp > hpMax / 3 ? 2 : 3);

/**
 * Staggering: so much harm (a part of its health) within WINDOW s — it reels (the walkers fall on one knee, the worm thrashes on the
 * sand, the storm sags) for T s; blows on it then MUL more. Not again for COOL s.
 */
export const STAGGER = { WINDOW: 4, PART: 0.07, T: 4.5, MUL: 1.5, COOL: 14 };
/** The harm in the window after a new blow: {sum, stagger} (`log` — [t, dmg] pairs, kept short). */
export function staggerAfter(log, t, dmg, hpMax, coolUntil = 0) {
    log.push([t, dmg]);
    while (log.length && log[0][0] < t - STAGGER.WINDOW) log.shift();
    let sum = 0;
    for (const e of log) sum += e[1];
    const stagger = t >= coolUntil && sum >= hpMax * STAGGER.PART;
    if (stagger) log.length = 0;
    return { sum, stagger };
}

/** The sandworm's ear: how far it hears a player (m) — by his speed (a runner far, one who creeps hardly, one who stands not at all). */
export function wormHears(speed, crouching = false) {
    if (!(speed > 0.4)) return 0;
    const k = Math.min(1, speed / 6);
    return TITAN.SEE * (crouching ? 0.08 : 0.2 + 0.8 * k);
}
/** A blast heard by the worm from this far (a Bombardo, a lightning, a thrown boulder): it goes there. */
export const WORM_LURE_R = 600;

/** The shade moves only when no one looks at it in a light: `looks` — [{dot (view · to it), lit}] of the players near. */
export function shadeFrozen(looks) {
    for (const l of looks) if (l.lit && l.dot > 0.82) return true;
    return false;
}

/** Heat (lava, iron) — what a blow of this kind does with it: {mul, cool} (cool — how much heat it takes away). */
export const COLD_RE = /Ice|Frozen|cold|Water|Wave|Firefighting|Drawdown|Aqua|Snow/;
export const BLUNT_RE = /Bombardo|Earthquake|Pilbidrio|Thunder|blast|melee|Jolt/;
export function heatBlow(look, heat, kind) {
    const k = String(kind || '');
    if (look === 'lava') {
        if (COLD_RE.test(k)) return { mul: heat > 0.4 ? 2 : 1, cool: 0.22 }; // (hot: water bursts into steam and hurts; it cools)
        if (heat < 0.4 && BLUNT_RE.test(k)) return { mul: 2, cool: 0 }; // (the crust breaks)
        return { mul: 1, cool: 0 };
    }
    if (look === 'iron') {
        if (heat > 0.7 && COLD_RE.test(k)) return { mul: 2.5, cool: 0.35 }; // (red-hot iron quenched: it cracks)
        return { mul: 1, cool: 0 };
    }
    return { mul: 1, cool: 0 };
}
/** The lava titan's heat over dt: in its lake it heats fast (not when the lake is frozen), out of it — slowly. */
export const lavaHeatStep = (heat, dt, inLake, lakeFrozen) => Math.min(1, heat + dt * (inLake && !lakeFrozen ? 0.25 : 0.012));
/** The iron titan's heat over dt: under a high Sun it heats, in the dark it cools. `sun` — the Sun's elevation (−1…1). */
export const ironHeatStep = (heat, dt, sun) => Math.max(0, Math.min(1, heat + dt * (sun > 0.15 ? 0.03 * sun : -0.02)));
/** Crusted (slow, dark): the lava titan below this heat. */
export const LAVA_CRUST = 0.4;

/** The ice titan's shell (stage 2): its strength (a part of the health); fire takes FIRE_MUL of a blow, the rest SHELL_MUL. */
export const ICE_SHELL = { PART: 0.15, FIRE_MUL: 3, OTHER_MUL: 0.25, FIRE_RE: /fire|Fire|Inferno|Hellfire|Burn|Lava|Sun/ };
/** A blow on the shell: {shell (left), through (what reaches the body)} */
export function shellBlow(shell, dmg, kind) {
    if (!(shell > 0)) return { shell: 0, through: dmg };
    const fire = ICE_SHELL.FIRE_RE.test(String(kind || ''));
    const eat = dmg * (fire ? ICE_SHELL.FIRE_MUL : ICE_SHELL.OTHER_MUL);
    if (eat < shell) return { shell: shell - eat, through: fire ? 0 : dmg * 0.1 };
    return { shell: 0, through: (eat - shell) / (fire ? ICE_SHELL.FIRE_MUL : ICE_SHELL.OTHER_MUL) };
}

/** The storm: its calm eye (a part of its radius); its heart there takes HEART_MUL; one inside is thrown out after EYE_T s. */
export const STORM_EYE = { PART: 0.4, HEART_MUL: 3, EYE_T: 4, GROW: 0.06, GROW_MAX: 1.5, WIND_RE: /Wind|Tornado|Storm|Gust/ };
/** The worm's open mouth: a blow there (when it is up) — MOUTH_MUL. */
export const WORM_MOUTH_MUL = 2.5;
/** Pieces of the rock titan breaking off as it is hurt: how many have fallen at this health (of `n`). */
export const rockChips = (hp, hpMax, n) => Math.max(0, Math.min(n, Math.floor((1 - hp / hpMax) * (n + 1))));

/** What a spell does to a titan: the gods' spells ×3 (they are the gods' own power), «Дай» a third of the titan at most — never at once. */
export function titanDamage(spell, dmg, { god = false, hpMax = 3000 } = {}) {
    if (spell === 'Die') return hpMax / 3; // («Дай» kills any creature at once — a titan is no creature but a shard of the gods: a third)
    if (!(dmg > 0)) return 0;
    if (god) return dmg * 3;
    return dmg;
}

/** A duel charge's blow (the scale of the creatures — Damage.js / VampireRules.BOLT_DMG). */
export const TITAN_BOLT = { AvadaKedavra: 25, Sapira: 10, Stupefy: 3, Jolt: 6, JoltMaxima: 12, Ice: 4, IceMaxima: 10, Expelliarmus: 1, Bombardo: 10, BombardoMaxima: 20, Nihilis: 4, Sectura: 14, Liquidation: 2, Electrum: 30, Pilbidrio: 30 };

/** A titan's own immunities (its planet's nature) — the multiplier of a blow of this kind. */
export function titanResist(id, kind) {
    const k = String(kind || '');
    if (id === 'venus') { if (/fire|Fire|Inferno|Hellfire|lava|Burn/.test(k)) return 0; if (/Ice|Frozen|cold|Water|Wave|Firefighting|Drawdown/.test(k)) return 2; } // (lava: water and ice cool it)
    if (id === 'neptune') { if (/Ice|Frozen|cold/.test(k)) return 0; if (/fire|Fire|Inferno|Hellfire|Burn/.test(k)) return 2; } // (ice: fire melts it)
    if (id === 'jupiter') { if (/Wind|Tornado|Lightning|Thunder|Storm/.test(k)) return 0; if (/blade|melee|arrow/.test(k)) return 0.4; } // (it IS the storm; a blade cuts wind)
    if (id === 'mercury') { if (/Bombardo|Lightning|Thunder|Electrum/.test(k)) return 1.6; if (/blade|melee|arrow/.test(k)) return 0.2; if (/fire|Fire|Inferno/.test(k)) return 0.3; } // (sun-forged iron)
    if (id === 'uranus') { if (/Lumos|fire|Fire|Inferno|Lightning|Sun|Light/.test(k)) return 1.5; } // (light hurts the shade)
    if (id === 'saturn') { if (/Bombardo|Lightning|Earthquake|Pilbidrio/.test(k)) return 1.5; if (/blade|melee|arrow/.test(k)) return 0.3; } // (stone: blasts chip it, blades glance off)
    return 1;
}

/** The sandworm under the sand: nothing reaches it (only when it has risen — `up`). */
export const wormHittable = (up) => !!up;

/** The next move of a titan: 'blow' near and facing, 'ranged' when its kit is ready, else 'walk' to the foe / 'home'. */
export function titanMove(s) {
    if (!s.foe) return s.farHome ? 'home' : 'wander';
    if (s.dist <= s.reach && s.facing && s.blowCool <= 0) return 'blow';
    if (s.rangedCool <= 0 && s.facing && s.dist > s.reach * 0.6 && s.dist < TITAN.SEE) return 'ranged';
    if (s.dist > s.reach * 0.8) return 'walk';
    return 'turn';
}

/** All titans dead? (`dead` — a set / array of titan ids) */
export function allTitansDead(dead) {
    const s = dead instanceof Set ? dead : new Set(dead || []);
    return TITAN_IDS.every((id) => s.has(id));
}

/** The step's ground shake at a distance (0 … 1). */
export const quakeAt = (d) => (d >= TITAN.QUAKE_R ? 0 : (1 - d / TITAN.QUAKE_R) ** 1.5);
