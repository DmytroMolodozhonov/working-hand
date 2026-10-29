/**
 * PentagramOfferings.js — what must LIE on a pentagram before its ritual begins (pure, node-testable; the game part is Offerings.js).
 *
 * The author: «К пентаграмме дьявольских горгулий нужно положить на пентаграмму целых 3 мёртвых тела (не скелеты) человекоподобных существ. К пентаграмме
 * большого монстра нужно положить рог Минотавра и одно мёртвое тело (не скелеты). И заплатить столько маны». Only in SURVIVAL (and the free world):
 * in Creative every pentagram works with no conditions at all (the word makes it work, as before).
 *
 *   gargoyles «Pentagranium Gargoylis» — 3 bodies, then 150 mana  → the bodies burn in dark flame, the ritual goes as it always did.
 *   monster   «Pentagranium Monstrum»  — the horn of a Minotaur + 1 body, then 200 mana → they burn, the hero stands in the circle and changes as before.
 *   breakward «Pentagranium Breakward» — 1 body, then 50 mana → it burns, the hero steps into the circle and the protection is broken as before.
 *
 * ONE function says which body fits (`humanoidBody`): a killed man-like creature, never bones (UnitedRules.bodyOk — the united power — asks the same
 * function, with the stricter multiplayer rule it always had).
 *
 * What may go wrong (CLAUDE.md): a body carried away / a thing picked up / the caster killed / the pentagram gone out while the dark flame gathers — the
 * rite is CANCELLED and nothing is lost (the things stay where they lay, unlocked, no mana is taken: the payment is made at the very end, when everything
 * has been checked once more); not enough mana — the things lie there until there is; a wrong thing — the hint says what is wrong, only once per set.
 */

/** Kinds of Death body (Death.js `b.k`) of man-like creatures: v — a villager / knight / wizard / sailor, p — a player, z — a zombie (when it leaves a body). */
export const HUMANOID_KINDS = new Set(['v', 'p', 'z']);

/**
 * Does this body fit a ritual? A killed man-like creature (not bones); never a body holding a hero's own power (`b.lg`: only its owner may take it back).
 * `kinds`: which Death kinds count (the united power takes villagers only: its single-player rule). `playersOnly` (the united power online): only a real player's body — villagers do not fit. → { ok, why? }
 */
export function humanoidBody(b, { playersOnly = false, kinds = HUMANOID_KINDS } = {}) {
    if (!b) return { ok: false, why: playersOnly ? 'Нужно тело убитого игрока' : 'Нужно тело убитого человекоподобного' };
    if (b.bones || b.stage === 'bones') return { ok: false, why: 'Кости не подходят — нужно тело, которое ещё не стало скелетом' };
    if (playersOnly) return b.k === 'p' ? { ok: true } : { ok: false, why: 'В сетевой игре подходит только тело убитого игрока — жители не годятся' };
    if (b.lg) return { ok: false, why: 'В этом теле лежит сила героя — оно не подходит' };
    if (!kinds.has(b.k)) return { ok: false, why: 'Нужно тело человекоподобного: жителя, рыцаря, волшебника, моряка или игрока' };
    return { ok: true };
}

/** What each ritual wants (the numbers of the author). `things`: items lying on the circle; `mana` is paid at the end. */
export const OFFERINGS = {
    gargoyles: { id: 'gargoyles', bodies: 3, things: [], mana: 150, what: 'тела' },
    breakward: { id: 'breakward', bodies: 1, things: [], mana: 50, what: 'тело' }, // (the author, via the main session: «Слом защиты» too wants ONE body)
    monster: { id: 'monster', bodies: 1, things: [{ kind: 'minotaurHorn', name: 'рог Минотавра' }], mana: 200, what: 'рог и тело' },
};

/** The timing of the rite: the dark flame gathers (nothing is spent yet), then the things burn away. */
export const OFFER = { SCAN: 0.35, CHARGE: 3.2, BURN: 2.4, HINT_EVERY: 9000, REACH_K: 0.85 };

/** «тело / тела / тел» for a number. */
export const bodiesWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'тело' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'тела' : 'тел');

/**
 * Is everything there? `pent`: 'gargoyles' | 'monster'; `bodies`: the Death bodies lying still in the circle; `things`: [{uid, item}] lying still in it.
 * → { ok, bodies: [the ones used], things: [the ones used], text?: what to tell the person, bad?: a wrong body's reason }. Pure.
 */
export function assess(pent, { bodies = [], things = [] } = {}, { playersOnly = false } = {}) {
    const need = OFFERINGS[pent];
    if (!need) return { ok: true, bodies: [], things: [] };
    const good = [], wrong = [];
    for (const b of bodies) { const r = humanoidBody(b, { playersOnly }); if (r.ok) good.push(b); else wrong.push(r.why); }
    const used = good.slice(0, need.bodies);
    const usedThings = [], missing = [];
    for (const t of need.things) {
        const L = things.find((x) => x.item?.kind === t.kind && (x.item.count ?? 1) >= 1 && !usedThings.includes(x));
        if (L) usedThings.push(L); else missing.push(t.name);
    }
    const lack = need.bodies - used.length;
    if (!lack && !missing.length) return { ok: true, bodies: used, things: usedThings };
    const parts = [];
    if (missing.length) parts.push(`нужен ${missing.join(', ')}: положите на пентаграмму`);
    if (lack > 0) parts.push(`положите на пентаграмму ещё ${lack} ${bodiesWord(lack)} убитых человекоподобных (не кости)`);
    const text = parts.join('; ').replace(/^./, (c) => c.toUpperCase());
    return { ok: false, bodies: used, things: usedThings, text, bad: wrong[0] || null };
}

/** Texts for the person. */
export const OFFER_HINT = {
    noMana: (n, have) => `Всё готово, но не хватает маны: нужно ${n}, у вас ${Math.floor(have)} — подождите, пока наберётся: вещи лежат на пентаграмме`,
    start: '🜏 Тёмное пламя собирается над пентаграммой…',
    cancelGone: '🜏 Обряд прерван: пентаграмма погасла — ничего не потрачено, всё осталось на земле',
    cancelMoved: '🜏 Обряд прерван: кто-то унёс то, что лежало на пентаграмме — ничего не потрачено',
    cancelDead: '🜏 Обряд прерван — ничего не потрачено',
    cancelMana: '🜏 Обряд прерван: маны не хватило к концу — ничего не потрачено, всё осталось на земле',
};

/** ON WHOM / ON WHAT (CLAUDE.md): what these two ritual conditions do to the creatures and things around. */
export const OFFERING_TARGETS = {
    me: { does: 'pay', why: 'колдующий кладёт на круг тела (и рог), платит ману в самом конце; умер или ушла пентаграмма — ничего не потеряно' },
    players: { does: 'look', why: 'остальные видят тёмное пламя и сгорание тел (сообщение pgm ofr); тело игрока в сетевой игре тоже подходит (кроме тела с силой героя в нём)' },
    bodies: { does: 'consume', why: 'тела убитых человекоподобных (житель, рыцарь, волшебник, моряк, игрок; кости и тело с силой героя — нет) сгорают в тёмном пламени; число: горгульи 3, монстр 1, слом защиты 1' },
    items: { does: 'consume', why: 'рог Минотавра (только для монстра) сгорает; остальные вещи на круге не трогаются' },
    zombies: { does: 'none', why: 'мёртвый зомби лежит не как тело (Death.js): на круге не считается; если зомби оставит тело (kind z) — он годится' },
    castlePeople: { does: 'alarm', why: 'чёрная магия: жители пугаются (castleLife.alarm "dark")' },
    animals: { does: 'none', why: 'тела животных, драконов, пауков не годятся — только человекоподобные' },
    spells: { does: 'none', why: 'заклинания и удары сквозь пентаграмму идут как обычно' },
    creative: { does: 'none', why: 'в Творческом условий нет: пентаграмма работает по слову, как все' },
};
