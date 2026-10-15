/**
 * GameVoices.js — what the game itself said aloud, and when: the villagers', sailors', wizards' voices
 * (src/audio/Speech.js). The microphone hears the speakers too. A spell's word in their line — a
 * merchant's «…поджаренный на костре» («костёр» is Fire), a guard's «Осторожно, огонь!» (Inferno), a
 * wizard's «Бомбардо!» — must never cast from my hand: whatever hears the voice (the network on this
 * computer or the browser's), and whether or not the speakers' sound is taken out of the microphone.
 *
 *   aired(text, from, to)        a line goes out of the speakers (performance.now() ms) → its record
 *   gameSaid(spell, from, to)    did the game say that spell's words while the phrase was heard? → the line
 */

import { matchSpell } from '../fx/SpellManager.js';
import { VOCAB } from './SpellSpotter.js';

const LINES = []; // {text, from, to}
/** ms the microphone may hear a line before / after the time it was played (the sound card, the room's echo) */
export const HEARD_BEFORE = 250;
export const HEARD_AFTER = 900;

/** A line goes out of the speakers from `from` to `to` (performance.now() ms). → its record (`to` may be moved). */
export function aired(text, from, to) {
    const rec = { text: String(text || ''), from, to };
    LINES.push(rec);
    while (LINES.length > 80 || (LINES.length && LINES[0].to < from - 30000)) LINES.shift();
    return rec;
}

export function clearAired() { LINES.length = 0; }

const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (t) => norm(t).replace(/[^а-я]/g, '');

/** The spells a line says in its words: any 1–4 of its words in a row, as the game's matcher reads them. */
export function spellsIn(text) {
    const w = norm(text).split(' ').filter(Boolean);
    const out = new Set();
    for (let i = 0; i < w.length; i++) {
        for (let n = 1; n <= 4 && i + n <= w.length; n++) {
            const s = matchSpell(w.slice(i, i + n).join(' '));
            if (s) out.add(s);
        }
    }
    return out;
}

/** Fewest letter changes (a swap of two neighbours is one) to find `p` somewhere inside `s`. */
export function editsInside(p, s) {
    const n = p.length, m = s.length;
    if (!n) return 0;
    // rows over p, columns over s; a start anywhere in s costs nothing, an end anywhere too
    let pp = new Int32Array(m + 1), prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
    for (let i = 1; i <= n; i++) {
        cur[0] = i;
        for (let j = 1; j <= m; j++) {
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (p[i - 1] === s[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && p[i - 1] === s[j - 2] && p[i - 2] === s[j - 1]) v = Math.min(v, pp[j - 2] + 1);
            cur[j] = v;
        }
        const t = pp; pp = prev; prev = cur; cur = t;
    }
    let best = n;
    for (let j = 0; j <= m; j++) if (prev[j] < best) best = prev[j];
    return best;
}

// (anywhere in the line, across its words too — «приятного аппетита» holds «ап», «не продаётся» «даст»,
// «на костре» «костёр»: the network hears them there. It only matters while that line sounds.)
const allowed = (n) => (n <= 3 ? 0 : n <= 8 ? 1 : 2);

/** Does the line hold one of the ways that spell is said (SpellSpotter's), near enough to sound like it? */
export function soundsIn(spell, text) {
    const flat = letters(text);
    for (const w of VOCAB) {
        if (w.spell !== spell) continue;
        const p = letters(w.phrase);
        if (p && editsInside(p, flat) <= allowed(p.length)) return true;
    }
    return false;
}

/** The game's lines sounding while the phrase (from…to, performance.now() ms) was heard. */
function sounding(from, to) {
    const out = [];
    for (let i = LINES.length - 1; i >= 0; i--) {
        const l = LINES[i];
        if (l.from - HEARD_BEFORE > to || l.to + HEARD_AFTER < from) continue;
        out.push(l);
    }
    return out;
}

/**
 * The game's own line said while the phrase (from…to, performance.now() ms) was heard, with that
 * spell's words in it — or null: then the spell is not the game's voice.
 */
export function gameSaid(spell, from, to) {
    if (!spell) return null;
    for (const l of sounding(from, to)) if (spellsIn(l.text).has(spell) || soundsIn(spell, l.text)) return l.text;
    return null;
}

/** How much better than needed a spell must fit (SpellSpotter: avg − threshold) while a villager speaks… */
export const GAME_FIT = 0.7;
/** …a short word («ап», «айс») more still. */
export const GAME_FIT_SHORT = 0.3;

/**
 * Is this spell the game's own voice? → the line it came from, or null (it is mine).
 *  - its words were in a line the game said while the phrase was heard (whatever heard it);
 *  - or, heard by the network on this computer (which tells how well the spell fit), a line was
 *    sounding then and the spell was only just made out: «Жареный стейк» heard as «файр», «Стой!» as
 *    «стоп». A spell I really say fits far better. Tested with no speakers' copy at all (the worst
 *    setup): of 1300 of the game's lines heard by the microphone 131 read as a spell — none casts now;
 *    of 400 spells said over a villager's voice 86% still cast (said at any other time: all, as before).
 * @param {string} spell  the spell (matchSpell)
 * @param {{from:number, to:number, native?:boolean, sure?:boolean, fit?:number, len?:number}} heard
 */
export function fromGame(spell, { from, to, native = false, sure = false, fit = NaN, len = 0 } = {}) {
    if (!spell) return null;
    const lines = sounding(from, to);
    if (!lines.length) return null;
    for (const l of lines) if (spellsIn(l.text).has(spell) || soundsIn(spell, l.text)) return l.text;
    if (!native) return null;
    // (not the spell's own sound, only the written words — a villager's)
    if (!sure) return lines[0].text;
    return Number.isFinite(fit) && fit >= GAME_FIT + (len <= 3 ? GAME_FIT_SHORT : 0) ? null : lines[0].text;
}
