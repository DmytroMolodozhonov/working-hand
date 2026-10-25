/**
 * HoloText.js — the words of the «Раскрой свои секреты» hologram, as plain text.
 *
 * Lines of describeItem carry a little markup (<b>…</b>, <b style="…">, <small …>): the canvas
 * cannot draw tags, so every line is cut into plain pieces (bold or not) and any other tag or
 * entity is removed — no raw HTML ever reaches the card. A spell the thing teaches or favours gets
 * its description from the spell book (Codex.js «Заклинания»): what it is good for → how to use it.
 */
import { SPELLS } from '../ui/Codex.js';
import { matchSpell } from '../fx/SpellManager.js';

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g, (_, e) => (e === '#39' ? "'" : ENTITIES[e]));

/** One line → [{ text, bold }]: <b …> bold, every other tag dropped, entities decoded. */
export function holoParts(line) {
    const out = [];
    let bold = false;
    for (const tok of String(line ?? '').split(/(<\/?[a-zA-Z][^<>]*>)/)) {
        if (!tok) continue;
        const tag = /^<(\/?)([a-zA-Z]+)[^<>]*>$/.exec(tok);
        if (tag) { if (tag[2].toLowerCase() === 'b') bold = !tag[1]; continue; }
        const text = decode(tok).replace(/[<>]/g, '');
        if (text) out.push({ text, bold });
    }
    return out;
}

/** The plain text of a line (title too). */
export const holoPlain = (line) => holoParts(line).map((p) => p.text).join('');

let _byId = null;
/** The description of the spell in the spell book (a Maxima form is told by its base card), or null. */
export function spellDescription(id) {
    if (!id) return null;
    if (!_byId) {
        _byId = new Map();
        for (const s of SPELLS) { const k = s.name.split(' / ').map((n) => matchSpell(n)).find(Boolean); if (k && !_byId.has(k)) _byId.set(k, s); }
    }
    const card = _byId.get(id) || _byId.get(String(id).replace(/Maxima$/, ''));
    return card?.desc ? card : null;
}

/** The hologram text of a thing, plus the description of the spell it is about (a scroll, a wand's favourite). */
export function withSpellDescription(info, item) {
    if (!info || !item) return info;
    const id = item.kind === 'scroll' && item.stat === 'spell' ? item.spell : item.kind === 'wand' ? item.fav : null;
    const card = spellDescription(id);
    if (!card) return info;
    const head = item.kind === 'wand' ? `Особое заклинание — <b>${card.name}</b>:` : `<b>${card.name}</b>:`;
    return { ...info, lines: [...info.lines, `${head} ${card.desc}`] };
}
