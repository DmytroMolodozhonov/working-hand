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
export const TITANS = {
    mercury: {
        id: 'mercury', planet: 'mercury', name: 'Железный титан', title: 'Солнечный кузнец',
        about: 'Живёт на Меркурии, ближе всех к Солнцу. Подходить к нему с мечом или топором в руках — плохая затея: оружие можно и не удержать. А если он поворачивается к вам и начинает разгораться светом — уходите в сторону, и побыстрее.',
        height: 80, radius: 10, hp: 3400, walk: 4, kit: 'iron', look: 'iron',
        blow: 15, reach: 30,
        ranged: { every: [7, 11], dmg: 9, r: 3, len: 260, blind: 3 }, // the sun ray (blinds 3 s); the magnet pulls the weapons out of the hands
        magnet: { r: 90, every: [12, 18] },
    },
    saturn: {
        id: 'saturn', planet: 'saturn', name: 'Каменный титан', title: 'Гора, что ходит',
        about: 'Самый огромный из титанов, бродит по облачной равнине Сатурна. Под его шагами дрожит земля, а камни он швыряет так далеко, что держаться на расстоянии мало — надо ещё и двигаться.',
        height: 110, radius: 15, hp: 4200, walk: 3.4, kit: 'rock', look: 'rock',
        blow: 16, reach: 38, // the fist of a boulder / the stomp
        ranged: { every: [7, 11], dmg: 12, r: 8, speed: 36, n: 2 }, // boulders thrown; a stomp raises stone spikes round him
    },
    venus: {
        id: 'venus', planet: 'venus', name: 'Огненный титан', title: 'Живая лава',
        about: 'Живёт на раскалённой Венере. Всё вокруг него горит, а огненные шары он бросает издалека. Не стойте там, куда он смотрит, и не тяните время рядом с ним.',
        height: 75, radius: 9.5, hp: 3200, walk: 4.2, kit: 'fire', look: 'lava',
        blow: 14, reach: 28,
        ranged: { every: [6, 10], dmg: 9, r: 9, speed: 32, n: 3 }, // fireballs; a pool of lava under him
    },
    mars: {
        id: 'mars', planet: 'mars', name: 'Песчаный змей', title: 'Владыка дюн',
        about: 'Его почти не видно: он плывёт под песками Марса и находит вас по шагам. Если земля под ногами загудела — бегите, не оглядываясь. Бить его можно, только пока он над песком.',
        height: 300, radius: 14, hp: 3600, walk: 11, kit: 'worm', look: 'worm', burrows: true,
        blow: 30, reach: 16, // the swallow: in the circle of its mouth when it rises
        ranged: { every: [5, 8], dmg: 10, r: 18 }, // the tail's sweep / a falling wall of sand
    },
    neptune: {
        id: 'neptune', planet: 'neptune', name: 'Ледяной титан', title: 'Страж вечного льда',
        about: 'Живёт среди холода Нептуна. Рядом с ним легко вмёрзнуть в лёд и стать беззащитным, поэтому не стойте на месте и не подпускайте его близко.',
        height: 70, radius: 9, hp: 3000, walk: 3.9, kit: 'frost', look: 'ice',
        blow: 12, reach: 26,
        ranged: { every: [8, 12], dmg: 6, r: 14, freeze: 2.5 }, // a ring of spikes round the foe: −6, frozen 2.5 s; the freezing breath
    },
    uranus: {
        id: 'uranus', planet: 'uranus', name: 'Титан-тень', title: 'Полуночный',
        about: 'На Уране половину жизни стоит ночь, и он прячется в ней. В темноте его не разглядеть, пока он не окажется прямо рядом с вами — а свет для него большая неприятность.',
        height: 85, radius: 10, hp: 3300, walk: 4.4, kit: 'shade', look: 'shade',
        blow: 13, reach: 30,
        ranged: { every: [8, 12], dmg: 8, r: 20, dark: 6 }, // a wave of darkness: −8, the light round the hero gone for 6 s; then he steps through the dark (a blink)
        blink: { every: [9, 14], far: [25, 60] },
    },
    jupiter: {
        id: 'jupiter', planet: 'jupiter', name: 'Титан-вихрь', title: 'Живой смерч',
        about: 'Огромный живой смерч над бурями Юпитера. Подходить к нему опасно: он затягивает к себе и швыряет, а молнии бьют издалека. Держитесь дальше и смотрите, куда он движется.',
        height: 200, radius: 30, hp: 4000, walk: 6, kit: 'storm', look: 'storm', flies: true,
        blow: 10, reach: 40, // the wall of its whirl
        ranged: { every: [3, 5], dmg: 7, r: 4 }, // a lightning bolt
        pull: { r: 140, speed: 6 }, // m/s towards its heart within r
    },
};
export const TITAN_IDS = Object.keys(TITANS);

export const TITAN = {
    CELLS: 1000, // the reward for each (mana cells — Achievements 'titan_<id>')
    GOD_CELLS: 10000, // all of them: 10 000 more — and immortality (Achievements 'godhood', Godhood.js)
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
    SAY_EVERY: [16, 28],
    REGEN: 0, // they do not heal (a long fight is won by patience)
};

/** Words in their fights (Russian, shown and spoken — slow, deep). The story is told by pictures, not by gods; a titan only rages. */
export const TITAN_LINES = {
    wake: ['Кто… ступил… на мою землю?', 'Маленький… смертный…', 'Я помню… Солнце…'],
    fight: ['Ты — пыль.', 'Я был богом… и буду.', 'Твоя магия — искра. Я — пламя.', 'Беги… если можешь.'],
    hurt: ['Это… больно.', 'Сила… уходит…'],
    death: ['Наконец… покой…', 'Верни… меня… Солнцу…'],
};

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
