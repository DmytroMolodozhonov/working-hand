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
    if (id === 'Pentagranium') return { name: 'Pentagranium', desc: 'Создаёт на земле пентаграмму для обряда. Каждую фигуру нужно выучить с её собственного свитка; создание круга стоит 50 маны, а условия и цена обряда зависят от фигуры.' };
    if (!_byId) {
        _byId = new Map();
        for (const s of SPELLS) { const k = s.name.split(' / ').map((n) => matchSpell(n)).find(Boolean); if (k && !_byId.has(k)) _byId.set(k, s); }
    }
    const card = _byId.get(id) || _byId.get(String(id).replace(/Maxima$/, ''));
    return card?.desc ? card : null;
}

/** The hologram text of a thing, plus the description of the spell it is about (a scroll, a wand's favourite). */
export function withSpellDescription(info, item, concise = false) {
    if (!info || !item) return info;
    const id = item.kind === 'scroll' && item.stat === 'spell' ? item.spell : item.kind === 'wand' ? item.fav : null;
    const card = spellDescription(id);
    if (!card) return info;
    const head = item.kind === 'wand' ? `Особое заклинание — <b>${card.name}</b>:` : `<b>${card.name}</b>:`;
    const desc = concise ? (card.desc.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || card.desc) : card.desc;
    const lines = [...info.lines];
    const note = item.kind === 'scroll' && lines.at(-1)?.startsWith('Сожгите свиток') ? lines.pop() : null;
    lines.push(`${head} ${desc}`);
    if (note) lines.push(note);
    return { ...info, lines };
}

/** The hologram card's width in metres: HOLO_SCREEN of the screen width seen from `dist` (author: clear, not the whole screen). */
export const HOLO_SCREEN = 0.28;
export function holoWidth(dist, fov = 75, aspect = 16 / 9) {
    const screenW = 2 * Math.tan((fov * Math.PI) / 360) * aspect * Math.max(0.3, dist);
    return Math.min(4.5, Math.max(0.45, screenW * HOLO_SCREEN));
}
