/**
 * BlastWardNpc.js — which wizards of the world have the pentagram of protection from blasts («Pentagranium Murus», ResistRules.js) on them.
 * The author 08.11: «колдун башни волшебников — у него 100 % будет эта защита; сильный маг — 80 %; средний — 60 %; слабый — 40 %».
 *
 *   the head of the tower («master»)            100 %
 *   a strong wizard («teacher», «elder»)         80 %
 *   a middle wizard («adept»)                    60 %
 *   a weak wizard («novice», a pupil)            40 %
 *
 * Decided once for each wizard, from his id (the same on every computer, the same after a save): a wizard either has the ward or has not.
 * The ward does to him what it does to the player (ResistRules.blastFactor): «Бомбарда» / «Бомбарда Максима» do no harm, «Бум» / «Инспириус» / a cannonball — half.
 * (CastleLife.hit calls `npcBlastFactor`; the push of a blast stays — only the harm is cut.) Not wizards (villagers, knights) have no such ward.
 */
import { blastFactor } from './ResistRules.js';

export const BLAST_WARD_CHANCE = { master: 1, teacher: 0.8, elder: 0.8, adept: 0.6, novice: 0.4 };

const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** The rank that counts (the head of the tower by his role, else his rank; no rank — a middle wizard). */
export function wardRank(v) {
    if (!v) return null;
    if (v.role === 'master') return 'master';
    return v.rank || (v.wizard ? 'adept' : null);
}

/** Has this wizard the ward? (stable for him: the id decides) */
export function hasBlastWard(v) {
    if (!v || !v.wizard) return false;
    const c = BLAST_WARD_CHANCE[wardRank(v)];
    if (!c) return false;
    return c >= 1 || hashOf(v.id + ':blastward') < c;
}

/** How much of a blow of `kind` gets through to this person: 1 (all) unless he is a wizard with the ward. */
export const npcBlastFactor = (v, kind) => (kind && hasBlastWard(v) ? blastFactor(kind) : 1);
