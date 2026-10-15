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

// (a short spell word is a whole word of the line — «ап» is inside «капуста»; a longer one may differ a little:
// «костре» is «костёр» said in a sentence)
const allowed = (n) => (n <= 5 ? 0 : n <= 8 ? 1 : 2);

/** Does the line hold one of the ways that spell is said (SpellSpotter's), near enough to sound like it? */
export function soundsIn(spell, text) {
    const words = norm(text).split(' ');
    const flat = letters(text);
    for (const w of VOCAB) {
        if (w.spell !== spell) continue;
        const p = letters(w.phrase);
        if (!p) continue;
        if (p.length <= 3) { if (words.includes(p)) return true; continue; }
        if (editsInside(p, flat) <= allowed(p.length)) return true;
    }
    return false;
}

/**
 * The game's own line said while the phrase (from…to, performance.now() ms) was heard, with that
 * spell's words in it — or null: then the spell is not the game's voice.
 */
export function gameSaid(spell, from, to) {
    if (!spell) return null;
    for (let i = LINES.length - 1; i >= 0; i--) {
        const l = LINES[i];
        if (l.from - HEARD_BEFORE > to || l.to + HEARD_AFTER < from) continue;
        if (spellsIn(l.text).has(spell) || soundsIn(spell, l.text)) return l.text;
    }
    return null;
}
