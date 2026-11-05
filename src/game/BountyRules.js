/**
 * BountyRules.js — «розыск»: the hunters for the head of one who did heavy crimes in a settlement (pure, node-testable; Bounty.js runs it).
 *
 * The author (05.11): «если ты натворил в городе — массовое убийство, — за тобой пошлют охотников за головами, 2–3, на конях или пешком;
 * повторно, а не один раз; но только то поселение, где ты накосячил. Одно убийство — не пошлют». «Только когда явно видно лицо, когда ты
 * явно не скрываешься: невидимого не узнают; шлем до некоторой степени скрывает личность». «Шанс, что тебя найдут, — 50 % от редкости
 * появления феникса; маги находят на 15 % лучше; в пещерах не найдут — разве что видели, как ты туда забежал; в своём доме — 70 % от
 * феникса: они стучатся, не врываются — сначала мирно, вдруг ты обычный гражданин». Охотники бывают мирные и немирные.
 */

import { PHOENIX } from './Phoenixes.js';

export const BOUNTY = {
    WANTED: 3, // heat from which a settlement sends hunters (3 people killed before eyes that knew the face; a chief counts 3)
    KILL: 1, CHIEF: 3, // heat for a killing / for the king, the elder, the tower's head
    FACE_R: 22, // m: a witness farther than this does not make out the face
    HELMET_KNOWN: 0.35, // a helmet on: the share of witnesses who still know the face
    OPEN: 0.5, HOME: 0.7, // × the phoenix's chance a roll: out in the open, in one's own house
    MAGE: 1.15, // the wizards' hunters find one 15 % better
    ROLL: [PHOENIX.SPAWN_MIN, PHOENIX.SPAWN_MAX], // s between the rolls (as the phoenix's)
    BASE: PHOENIX.SPAWN_CHANCE, // the phoenix's chance a roll
    PARTY: [2, 3],
    MOUNTED: 0.5,
    PEACEFUL: 0.5, PEACEFUL_HOT: 0.25, HOT: 8, // a party that first talks; with this much heat — mostly not
    FINE_PER: 350, // coins of the ransom a point of heat (the peaceful ones take it and let one go)
    TALK_S: 30, // s the peaceful ones wait for the answer
    KNOCK_S: 90, // s they knock at a house's door before going away
    HUNT_S: 12 * 60, // s a hunt lasts at most
    SEEN_CAVE_S: 12, // s: the hunters saw one run into a cave this lately — they go in after him
    FIND_R: 12, // m: the hunters stop before the one they found
};

/** Kinds of places that keep a record of crimes (a road's travellers belong to no settlement). */
export const SETTLED = new Set(['castle', 'village', 'wizvillage', 'tower', 'hamlet']);
export const settled = (def) => !!def && (SETTLED.has(def.kind) || (!def.kind && !!def.name));
/** The wizards' places send wizards. */
export const mageSite = (def) => !!def && (def.kind === 'wizvillage' || def.kind === 'tower' || !!def.mage);

/**
 * Does this witness know the face? `w` {dist}; `hero` {invisible, disguised, helmet}; `r` a random 0…1.
 * Invisible / disguised (the potion of another face) — never; too far — no; a helmet — only HELMET_KNOWN of them.
 */
export function knowsFace(w, hero, r = Math.random()) {
    if (!w || hero?.invisible || hero?.disguised) return false;
    if ((w.dist ?? 0) > BOUNTY.FACE_R) return false;
    if (hero?.helmet) return r < BOUNTY.HELMET_KNOWN;
    return true;
}

/** Heat a crime adds: a killing (a chief — more); nothing when no witness knew the face. */
export function crimeHeat(killed, chief, knownBy) {
    if (!killed || knownBy <= 0) return 0;
    return chief ? BOUNTY.CHIEF : BOUNTY.KILL;
}

export const wanted = (rec) => !!rec && rec.heat >= BOUNTY.WANTED;

/**
 * A roll's chance that the hunters find one: `where` 'open' | 'home' | 'cave'; `seenInto` — they saw him run into the cave; `mage` — wizards.
 */
export function findChance(where, mage = false, seenInto = false) {
    if (where === 'cave' && !seenInto) return 0;
    const k = where === 'home' ? BOUNTY.HOME : BOUNTY.OPEN;
    return BOUNTY.BASE * k * (mage ? BOUNTY.MAGE : 1);
}

/** The party sent: {n, mounted, peaceful, kind} (kind — Travelers' kinds: knights / wizards, on foot or riding). */
export function partyFor(rec, where, r = Math.random) {
    const n = BOUNTY.PARTY[0] + (r() < (rec.heat >= BOUNTY.HOT ? 0.75 : 0.4) ? 1 : 0);
    const mounted = r() < BOUNTY.MOUNTED;
    const peaceful = where === 'home' ? true : r() < (rec.heat >= BOUNTY.HOT ? BOUNTY.PEACEFUL_HOT : BOUNTY.PEACEFUL);
    const kind = rec.mage ? (mounted ? 'wizRider' : 'wizards') : (mounted ? 'knightRider' : 'knights');
    return { n, mounted, peaceful, kind };
}

export const fineOf = (rec) => Math.max(500, Math.round((rec.heat * BOUNTY.FINE_PER) / 50) * 50);

const norm = (t) => ' ' + String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
/** The answer to the hunters' demand: 'pay' | 'refuse' | null. */
export function huntAnswer(text) {
    const t = norm(text);
    if (/( не (заплачу|буду|отдам|пойду)| нет | никогда| отвали| пошли вон| убирайтесь)/.test(t)) return 'refuse';
    if (/( заплачу| плачу| заплатить| держи| возьмите| согласен| согласна| хорошо| ладно| сдаюсь| да )/.test(t)) return 'pay';
    return null;
}

export const HUNT_LINES = {
    demand: (place, n, fine) => `Именем «${place}»! За тобой ${n} ${n === 1 ? 'смерть' : n < 5 ? 'смерти' : 'смертей'}. Заплати ${fine} монет — и мы уйдём. Иначе пойдём по-плохому.`,
    attack: ['Вот он! Взять его!', 'За «{place}»! Окружай!', 'Это он — убийца! В бой!'],
    knock: ['Откройте! Нам нужно поговорить.', 'Именем «{place}» — откройте дверь!', 'Хозяин, выйди. Разговор есть.'],
    paid: 'Выкуп принят. Свободен — но больше не попадайся.',
    noCoins: (need) => `Этого мало — не хватает ${need}. Тогда по-плохому!`,
    gaveUp: 'Ушёл… Ничего, найдём в другой раз.',
    leaveDoor: 'Никого… Вернёмся позже.',
};
