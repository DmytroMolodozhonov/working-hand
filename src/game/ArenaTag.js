/**
 * ArenaTag.js — the sign over an arena duellist (the author, Creative only): his kind («Младший», «Средний», «Сильный»,
 * «Глава башни»), his mana now / his cells, his duel strength — alive: the mana goes down as he casts. Pure: the values come
 * from the same sources the fight uses (his rank — WizardAI.WIZ_RANKS, his mana and health, the strength — WizardAI.duelStrength,
 * which is what Duel._strength gives for a wizard, without the luck). ArenaDuels sends it, ArenaTagFx draws it.
 */
import { duelStrength } from './WizardAI.js';

export const RANK_TITLE = { novice: 'Младший', adept: 'Средний', teacher: 'Сильный', elder: 'Сильный', master: 'Глава башни' };
export const RANK_COLOR = { novice: '#9fe3a0', adept: '#8ec5ff', teacher: '#ffb35c', elder: '#ffb35c', master: '#ff7ad9' };

/** Is the sign shown in this mode? Only in «Творческий». */
export const tagShown = (mode) => mode === 'creative';

/** The values of a wizard's sign: {id, rank, title, mana, max, power}. */
export function tagOf(v) {
    const rank = v.rank || v.entry?.rank || 'adept';
    return {
        id: v.id, rank, title: RANK_TITLE[rank] || RANK_TITLE.adept,
        mana: Math.max(0, Math.round(v.mana ?? 0)), max: Math.round(v.maxMana ?? 0),
        power: Math.round(duelStrength(v.role, v.mana ?? 0, v.hp ?? 0, 0, v.maxHp)),
    };
}

/** What redraws the sign: only a change of these. */
export const tagKey = (t) => `${t.rank}|${t.mana}|${t.max}|${t.power}`;
