/**
 * VampireRules.js — Count Sracula's numbers, what hurts him and how much, his words, his bats' and guards' rules (pure: tests/unit/vampire.test.js).
 * The game side: VampireLife.js; the castle: src/world/VampireCastle.js.
 *
 * The author (01.11): 200 HP, killed as any creature (Avada too); no wand — he fights by rushes and bites: a sharp dash in, a blow (−10),
 * a quick leap back; otherwise he moves rather slowly. He can turn into a bat (bigger than his bats, drawn otherwise) for 20 s, then he must
 * turn back. He sleeps in his coffin; he wakes when the castle is plainly damaged or an attack begins (the bats first). A guest who slipped in
 * unseen and does not attack finds him peaceful at first: he talks, irritated, asks / threatens him to leave, and attacks if he stays. He
 * talks in the fight too. Dark-magic spells hurt him half; the spell that scatters darkness («Nihilis Atra») twice (#1174, as the mummy).
 * Fifty bats round the castle: a bite −1, each bat at most once in 10 s; they never come back once killed. Ten skeleton guards (the black
 * ship's skeletons, dressed anew). Killing him: +150 mana cells; the clouds over his land can be scattered only after.
 */

import { DARK_SPELLS } from './DarkMagic.js';

export const VAMPIRE = {
    HP: 200,
    BLOW: 10, // HP a rush's blow / bite takes
    WALK: 2.4, // m/s: he moves «rather slowly»
    RUSH: 17, // m/s: the dash in
    RUSH_FROM: 13, // m: he dashes from this near
    RUSH_T: 0.75, // s the dash lasts at most
    LEAP: 11, // m/s: the leap back
    LEAP_T: 0.55,
    RECOVER: [1.4, 2.8], // s he stalks between rushes
    REACH: 2.4, // m: a blow lands this near
    BAT_T: 20, // s in the bat's shape (then he must turn back)
    BAT_EVERY: 32, // s at least between two turnings
    BAT_SPEED: 13, // m/s the bat flies
    BAT_SWOOP: 2.6, // s between the bat's swoops
    TURN_T: 1.1, // s a turning takes (smoke, the body folding into the bat / out of it)
    PARLEY_WARN: 9, // s between his warnings to a guest who came in peace
    PARLEY_MAX: 34, // s: then he attacks a guest who stayed
    PARLEY_CLOSE: 3.2, // m: a guest who comes this close is attacked at once
    WAKE_R: 9, // m: a guest this near the coffin wakes him
    WAKE_DELAY: 6, // s after an attack on his castle until he rises
    LEASH: 90, // m from the castle: he goes back to his coffin when nobody is nearer
    SAY_EVERY: [9, 16], // s between his words in a fight
    MANA_CELLS: 150,
};

export const BATS = {
    N: 50,
    HP: 1,
    BITE: 1, // HP a bite takes
    COOL: 10, // s: one bat bites at most once in this
    SEE: 34, // m: a bat sees a hero this near (out of the keep)
    LOSE: 70, // m: the swarm gives up
    SPEED: 9, // m/s
    SPAN: 0.8, // m: a bat's wings (the hero is ~3.5 m)
    SAY_COOL: 6,
};

export const GUARDS = {
    N: 10,
    HP: 14,
    DMG: 3,
    COOL: 1.4,
    SEE: 20, // m
    LEASH: 40, // m from the post
    WALK: 3.4, RUN: 5.2,
    REACH: 2.3,
};

/** What a spell does to the count (HP taken from a blow of `dmg`): dark magic half, «Nihilis» twice, the gods' spells all. */
export function vampDamage(spell, dmg, god = false) {
    if (!(dmg > 0)) return 0;
    if (god) return dmg;
    if (spell && /^Nihilis/.test(spell)) return dmg * 2;
    if (spell && DARK_SPELLS.has(spell)) return dmg * 0.5;
    return dmg;
}

/** A duel charge's blow on the count, a guard or a bat (the same scale as the creatures' — Damage.js). */
export const BOLT_DMG = { AvadaKedavra: 25, Sapira: 10, Stupefy: 4, Jolt: 6, JoltMaxima: 12, Ice: 5, IceMaxima: 10, Expelliarmus: 2, Bombardo: 8, BombardoMaxima: 16, Nihilis: 9, Sectura: 12, Liquidation: 3 };

/** His words (Russian: shown and spoken). */
export const LINES = {
    wake: ['Кто посмел потревожить мой сон?..', 'Шум… в моём замке. Как невежливо.', 'Сто лет тишины — и вот вы.'],
    parley: ['Вы вошли в мой дом без приглашения. Уходите — пока я вежлив.', 'Я не люблю гостей. Особенно живых. Покиньте замок.', 'Вам здесь не рады. Ступайте прочь — я не повторю дважды.'],
    warn: ['Моё терпение кончается.', 'Я сказал — прочь.', 'Последний раз прошу: уходите.'],
    attack: ['Что ж. Вы сами выбрали.', 'Тогда вы останетесь здесь навсегда.', 'Как жаль. Вы были почти учтивы.'],
    taunt: ['Медленно. Слишком медленно.', 'Ваша кровь пахнет страхом.', 'Я видел королей, что бежали быстрее.', 'Ещё ближе… вот так.', 'Ночь длинная. Мне некуда спешить.'],
    hurt: ['Ах!.. Наглец.', 'Это было больно. Я запомню.', 'Неплохо… для смертного.'],
    bat: ['Попробуйте поймать!', 'Ночь — моя.'],
    back: ['Довольно игр.'],
    leave: ['Так-то лучше. Не возвращайтесь.'],
    death: ['Нет… свет… не может быть…', 'Я… вернусь… пылью…'],
    sunBlocked: '☁️ Тучи не расходятся: кто-то удерживает магию туч над этой землёй',
};

/** A fight's next move (pure): {mode, t} from his state. me: {dist (m to the target), cool (s till he may rush), hpK (hp / max), batCool, high (target off the ground)}. */
export function fightMove(s) {
    if (s.batCool <= 0 && (s.hpK < 0.6 || s.high || s.dist > 26)) return 'bat';
    if (s.cool <= 0 && s.dist <= VAMPIRE.RUSH_FROM && s.facing) return 'rush';
    if (s.dist > VAMPIRE.RUSH_FROM * 0.8) return 'walk';
    return 'stalk';
}

/** May this bat bite now (its last bite at `last`, the clock `now`, both in s)? */
export const batMayBite = (last, now) => !(now - (last ?? -1e9) < BATS.COOL);

/** The dark sky over his land: 0 … `k` by the distance from the castle (DARK_R, then thinning over FADE). */
export function darkAt(d, R, fade, k = 0.82) {
    if (d <= R) return k;
    if (d >= R + fade) return 0;
    const t = 1 - (d - R) / fade;
    return k * t * t * (3 - 2 * t);
}
