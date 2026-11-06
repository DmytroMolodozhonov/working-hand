/**
 * PharaohRules.js — Pharaoh Sandy's numbers (Фараон Песчаный, the mummy king of the great pyramid), what hurts him and how much, his sounds-as-words,
 * the sleeping mummies', the skeleton-mummies' and the traps' rules (pure: tests/unit/pharaoh.test.js). The game side: PharaohLife.js; the pyramids: src/world/Pyramids.js.
 *
 * The author (06.11): the mummy of the pyramid, 250 HP, a staff he can fight with when disturbed; he does not talk — only strange phrases in an
 * unknown Egyptian tongue. His magic is the tomb's own — sand and locusts and the tomb's curse — no wand. Guards: mummies sleeping in plain
 * sarcophagi in the rooms (they wake and climb out when somebody comes near — the player SEES it), and skeleton-mummies in the middle pyramid's maze
 * (the black ship's skeletons' logic, wrapped in bandages). «Nihilis Atra» (the spell that scatters darkness) hurts him twice as much; dark magic half.
 * Killing him: +150 mana cells (Achievements 'pharaoh'); the great sarcophagus' chests hold the pyramid's treasure.
 */

import { DARK_SPELLS } from './DarkMagic.js';

export const PHARAOH = {
    HP: 250,
    STAFF: 12, // HP a blow of the staff takes
    REACH: 3.9, // m: the staff reaches this far
    COOL: 1.9, // s between two blows
    WALK: 2.2, RUN: 4.3, // m/s: a mummy king is not quick
    SEE: 46, // m: he sees a foe this near
    LEASH: 80, // m from the sarcophagus: he goes back and lies down when nobody is nearer
    WAKE_R: 9, // m: a hero this near his sarcophagus wakes him (the tomb's curse: his chests too)
    WAKE_DELAY: 5, // s after the pyramid is plainly attacked (a blast in the burial chamber) until he rises
    RISE_T: 4.5, // s: the lid slides, he sits up and steps out
    SAND_WAVE: { R: 17, DMG: 8, COOL: 9, WINDUP: 1.3, PUSH: 9 }, // the sand rushes out from his feet in a ring along the floor
    LOCUSTS: { N: 16, T: 13, BITE: 1, COOL: 1.8, SPEED: 6.5, EVERY: 22, FROM: 5 }, // a swarm of locusts: each bites at most once in COOL
    CURSE: { T: 8, DPS: 1, EVERY: 28, SLOW: 0.55 }, // the tomb's curse on one foe: −1 HP/s and slowed for T s
    SAY_EVERY: [8, 15],
    MANA_CELLS: 150,
};
export const MUMMY = {
    HP: 14, DMG: 3, COOL: 1.5, SEE: 16, LEASH: 55, WALK: 3.0, RUN: 5.0, REACH: 2.4,
    WAKE_R: 7.5, // m: a hero this near a plain sarcophagus wakes the mummy in it
    RISE_T: 2.8, // s: the lid goes aside, the mummy rises and steps out — in sight
    NOISE_R: 22, // m: a fight / a blast this near wakes the sleepers of that room
};
export const GUARD = { HP: 14, DMG: 3, COOL: 1.4, SEE: 18, LEASH: 24, WALK: 3.2, RUN: 5.0, REACH: 2.3 };
export const TRAPS = {
    DARTS: { DMG: 4, COOL: 7, SPAN: 8, T: 0.9 }, // the plate in the small pyramid: a volley from the walls
    SAND: { HOLD: 0.35, WAVE: 14, DROP: 7 }, // the false floor: stood on for HOLD s, then it goes in a wave (cells per s), a fall of DROP blocks
};
export const JEWEL_RANGE = [40, 160]; // coins a small gold jewel is worth to a merchant (the pure gold: «за хорошие деньги»)

/** What a spell does to the pharaoh (HP taken from a blow of `dmg`): dark magic half, «Nihilis» twice, the gods' spells all. */
export function pharaohDamage(spell, dmg, god = false) {
    if (!(dmg > 0)) return 0;
    if (god) return dmg;
    if (spell && /^Nihilis/.test(spell)) return dmg * 2;
    if (spell && DARK_SPELLS.has(spell)) return dmg * 0.5;
    return dmg;
}

/** A duel charge's blow on the pharaoh, a mummy or a skeleton-mummy (the same scale as the creatures' — Damage.js). */
export const BOLT_DMG = { AvadaKedavra: 25, Sapira: 10, Stupefy: 4, Jolt: 6, JoltMaxima: 12, Ice: 5, IceMaxima: 10, Expelliarmus: 2, Bombardo: 8, BombardoMaxima: 16, Nihilis: 9, Sectura: 12, Liquidation: 3 };

/** His phrases: no tongue of ours — the strange syllables of a dead language (shown and half-whispered). */
export const LINES = {
    wake: ['Рэ-ну-ан… нэб-ра сэ-нет!', 'Аху-ра… ам-ту… хэм-ка!', 'Сэт-ра ам-хэ-ру, нэ-фер-ти!'],
    attack: ['Ку-рэ-ту ан-ха-ру!', 'Хэ-ру-сэм сэ-бэ-хет!', 'Ам-мут-ра, ам-мут-ра!'],
    sand: ['Ша-ху-ра ам-сэ-нэт!', 'Сэ-пэр-ра хэ-кау!'],
    locust: ['Нэ-пэ-ра ху-ра-ам-ти…', 'Ай-ра ксе-пэр-ра!'],
    curse: ['Тэ-мэ-ху нэб-ра ан-сэт.', 'Ху-ка пэ-ра ам-хэ-ру…'],
    hurt: ['Аха!', 'Нэ-ху-ра!', 'Ма-ам-ту…'],
    death: ['Рэ… нэб-ра… ан-ху…', 'Пэ-ру-ам… сэт-нэ-фер…'],
};

/** A fight's next move (pure): 'wave' | 'locust' | 'curse' | 'staff' | 'walk'. s: {dist, waveCool, locustCool, curseCool, facing, hpK}. */
export function fightMove(s) {
    if (s.dist <= PHARAOH.REACH * 0.9 && s.cool <= 0 && s.facing) return 'staff';
    if (s.waveCool <= 0 && s.dist <= PHARAOH.SAND_WAVE.R * 0.8) return 'wave';
    if (s.locustCool <= 0 && s.dist >= PHARAOH.LOCUSTS.FROM) return 'locust';
    if (s.curseCool <= 0 && s.dist >= 6) return 'curse';
    return 'walk';
}

/** May this locust bite now (its last bite at `last`, the clock `now`, both in s)? */
export const locustMayBite = (last, now) => !(now - (last ?? -1e9) < PHARAOH.LOCUSTS.COOL);

/** Is somebody stepping on the false floor (feet over the patch, on the floor, not flying)? */
export function onSandTrap(T, x, z, y, floorY) {
    return x >= T.minX - 0.2 && x <= T.maxX + 0.2 && z >= T.minZ - 0.2 && z <= T.maxZ + 0.2 && Math.abs(y - floorY) < 1.6;
}
