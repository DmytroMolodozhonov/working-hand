/**
 * TalkAcks.js — the villagers' quick words: «Слушаюсь!», «Есть поднять паруса!», «К оружию!», «Ага…».
 * A person answers an order at once — with a word, a nod, a step — and only then (if at all) at length.
 * These words are short, said by role and situation, and MADE IN EACH VILLAGER'S VOICE IN ADVANCE
 * (CastleTalk._prepareFillers → Speech.prepare): heard the moment the order is understood, not after the
 * voice network has made them (0.7–1.2 s on a processor — measured, tools/talkbench.mjs).
 *
 * Pure: the lines, chosen by what was said and who hears it. [man's form, woman's form] or one string.
 */

import { ORDER_LINES } from './TalkActions.js';

const pick = (a, rng = Math.random) => a[Math.floor(rng() * a.length) % a.length];
const form = (l, female) => (Array.isArray(l) ? l[female ? 1 : 0] : l);

/** A ship's crew: the boatswain / a sailor answers each order in its own words. */
export const CREW_ACKS = {
    sails: ['Есть поднять паруса!', 'Паруса ставим!', 'Все наверх, паруса ставить!', 'Есть, капитан!'],
    helm: ['Есть право руля!', 'Есть, к повороту!', 'Есть, капитан! Поворачиваем!', 'Руль на борт!'],
    cannons: ['Пушки к бою!', 'Заряжаем!', 'Есть, к орудиям!', 'Порох, ядра — живо!'],
    fire: ['Пли!', 'Есть огонь!', 'Огонь!', 'Залп!'],
    board: ['На абордаж!', 'Кошки за борт!', 'За мной, братва!', 'Есть на абордаж!'],
    retreat: ['Есть отбой!', 'Отставить! Есть!', 'Есть, капитан!'],
    any: ['Есть!', 'Есть, капитан!', 'Так точно!', 'Слушаюсь!'],
};

/** Knights and the king's men: a short soldier's word for each order (the longer line may follow). */
const KNIGHT = {
    gather_army: ['Есть! Строимся!', 'К бою готовы!', 'Слушаюсь! Все ко мне!', 'Есть, Ваше Величество!'],
    attack: ['В атаку!', 'Есть! Вперёд!', 'За короля!', 'Бей их!'],
    defend_castle: ['Все на стены!', 'Есть! К воротам!', 'Держать ворота!'],
    stay: ['Есть отбой!', 'Есть, вольно!', 'Отставить! Есть!'],
    dismiss: ['Слушаюсь.', 'Как прикажете.', 'Уходим.'],
    short: ['Есть!', 'Слушаюсь!', 'Так точно!', 'Иду!'],
};

/** In danger (zombies at the gate, a fire, a fight): short, to the point. */
export const PANIC = {
    knight: ['К оружию!', 'Прикрою!', 'Они у ворот!', 'Держись!'],
    common: [['Бежим!', 'Бежим!'], 'Они у ворот!', ['Спасите!', 'Спасите!'], 'Ой, беда!'],
};

/**
 * What a villager says at once to the player's quick word (an order, a crew order, a «стой»).
 * `ready(line)`: the lines already made in his voice — taken first (heard at once).
 */
export function ackFor({ order = null, role = 'farmer', king = false, danger = false, female = false } = {}, rng = Math.random, ready = null) {
    const choose = (pool) => {
        const lines = pool.map((l) => form(l, female));
        const made = ready ? lines.filter((l) => { try { return ready(l); } catch (_) { return false; } }) : [];
        return pick(made.length ? made : lines, rng);
    };
    const o = String(order || '');
    if (o.startsWith('crew:') || role === 'sailor' || role === 'captain' || role === 'boatswain') {
        const k = o.startsWith('crew:') ? o.slice(5) : 'any';
        return choose(CREW_ACKS[k] || CREW_ACKS.any);
    }
    const soldier = role === 'knight' || role === 'advisor';
    if (!king && ['gather_army', 'attack', 'defend_castle', 'dismiss'].includes(o)) {
        // (not the king: no obedience — a refusal, as quick)
        return choose(ORDER_LINES.refuse[role] || ORDER_LINES.refuse.common);
    }
    if (danger && !soldier && o !== 'stay') return choose(PANIC.common);
    if (soldier && KNIGHT[o]) return choose(KNIGHT[o]);
    if (soldier) return choose(KNIGHT.short);
    return choose(['Иду!', 'Сейчас!', ['Понял!', 'Поняла!'], 'Ага!', 'Хорошо!']);
}

/** Every quick word a villager of this role may need (made in his voice in advance; a few — the cache is small). */
export function ackPool({ role = 'farmer', king = false, female = false } = {}) {
    const out = new Set();
    const add = (l) => out.add(form(l, female));
    if (role === 'sailor' || role === 'captain' || role === 'boatswain') {
        for (const k of ['sails', 'helm', 'cannons', 'fire', 'board', 'retreat', 'any']) CREW_ACKS[k].slice(0, k === 'any' ? 2 : 1).forEach(add);
        return [...out];
    }
    if (role === 'knight' || role === 'advisor') {
        if (king) for (const k of Object.keys(KNIGHT)) KNIGHT[k].slice(0, 1).forEach(add);
        else (ORDER_LINES.refuse[role] || ORDER_LINES.refuse.common).slice(0, 2).forEach(add);
        PANIC.knight.slice(0, 1).forEach(add);
        return [...out];
    }
    ['Иду!', 'Сейчас!', ['Понял!', 'Поняла!']].forEach(add);
    PANIC.common.slice(0, 2).forEach(add);
    return [...out];
}
