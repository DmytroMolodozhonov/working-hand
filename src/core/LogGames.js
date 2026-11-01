/**
 * LogGames.js — a journal text → games. Every new game writes a line «=== игра началась …» (spells, hands…) or
 * «=== старт …» (performance diary); the file puts it into a frame of «═══» with empty lines around (server.py),
 * the old files have just the line. One pure splitter for every journal: Settings → Журнал shows each game as its
 * own block (sticky header, «Скопировать эту игру»), «Общие логи» also (the line there carries a time and a tag).
 */

export const RULE = '═'.repeat(64);
const START_RE = /=== (?:игра началась|старт)(?![а-яё])/;
const RULE_RE = /^═{8,}\s*$/;
const CLOCK_RE = /^(\d\d):(\d\d):(\d\d)(?:\.\d+)?\b/;
const MODES = [
    [/ад\b|hell/i, 'Ад'], [/дуэл|арен/i, 'Дуэль'], [/творч|creative/i, 'Творческий'],
    [/выжив|survival/i, 'Выживание'], [/свобод|free/i, 'Свободный'],
];

/** The file framing of a start line (server.py does the same in Python). */
export function frameStart(line) { return `\n${RULE}\n${line}\n${RULE}\n\n`; }

export function isStartLine(line) { return START_RE.test(line); }

/** «01.11.2026, 12:37:28» or «01.11.2026 12:37:28» in a line → ms, or null. */
export function startedAtOf(line) {
    const m = /(\d\d)\.(\d\d)\.(\d{4}),?\s+(\d\d):(\d\d):(\d\d)/.exec(line);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : null;
}

/** The mode / map the start line (or the first lines of the game) tell about, or ''. */
export function modeOf(head, next = '') {
    const m = /режим\s+([^\s|,;]+)/i.exec(head) || /режим\s*[:=]\s*([^\s|,;]+)/i.exec(next);
    let name = m ? m[1] : '';
    for (const [re, label] of MODES) if (name && re.test(name)) { name = label; break; }
    const map = /(?<![а-яё])(?:карта|мир|место)\s*[:=«"]\s*([^»"|;\n]{1,40})/i.exec(head + ' ' + next);
    return [name, map ? map[1].trim() : ''].filter(Boolean).join(' · ');
}

const secOf = (line) => { const m = CLOCK_RE.exec(line); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };

/**
 * → [{ index, head, startedAt, mode, from, to, lineCount, durationMs, text }] oldest first.
 * Text before the first start line (a cut file) is a game of its own with head ''. `text` is built lazily by `gameText`.
 * `from`/`to` are line numbers (to excluded) into `lines`.
 */
export function splitGames(text) {
    const lines = String(text ?? '').split('\n');
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('===') || !START_RE.test(lines[i])) continue;
        starts.push(i > 0 && RULE_RE.test(lines[i - 1]) ? i - 1 : i);
        // (header index is kept for the head text)
        starts[starts.length - 1] = { at: starts[starts.length - 1], head: i };
    }
    const games = [];
    const first = starts.length ? starts[0].at : lines.length;
    if (lines.slice(0, first).some((l) => l.trim())) games.push(make(lines, 0, first, -1));
    starts.forEach((s, k) => games.push(make(lines, s.at, k + 1 < starts.length ? starts[k + 1].at : lines.length, s.head)));
    games.forEach((g, i) => { g.index = i; });
    return { lines, games };
}

function make(lines, from, to, headAt) {
    let end = to;
    while (end > from && !lines[end - 1].trim()) end--; // (the empty lines before the next frame are the gap, not the game)
    const head = headAt >= 0 ? lines[headAt].trim() : '';
    let n = 0, firstSec = null, lastSec = null;
    for (let i = from; i < end; i++) {
        if (!lines[i].trim() || RULE_RE.test(lines[i])) continue;
        n++;
        const s = secOf(lines[i]);
        if (s != null) { if (firstSec == null) firstSec = s; lastSec = s; }
    }
    let dur = firstSec != null && lastSec != null ? (lastSec - firstSec) * 1000 : null;
    if (dur != null && dur < 0) dur += 86400000; // (past midnight)
    return {
        index: 0, head, from, to: end, lineCount: n, durationMs: dur,
        startedAt: head ? startedAtOf(head) : null,
        mode: head ? modeOf(head, lines.slice(headAt + 1, headAt + 6).join(' ')) : '',
    };
}

export const gameText = (parsed, g) => parsed.lines.slice(g.from, g.to).join('\n').replace(/^\n+/, '');

/** «1 ч 05 мин», «12 мин 03 с», «45 с», or ''. */
export function durationLabel(ms) {
    if (ms == null) return '';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} с`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} мин ${String(s % 60).padStart(2, '0')} с` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;
}

/** The title of a game block. */
export function gameTitle(g, total) {
    const when = g.startedAt ? new Date(g.startedAt).toLocaleString('ru-RU') : '';
    const parts = [g.head ? `Игра ${g.index + 1} из ${total}${when ? ` — ${when}` : ''}` : 'Начало журнала (до первой игры)'];
    if (g.mode) parts.push(g.mode);
    const d = durationLabel(g.durationMs);
    if (d) parts.push(d);
    parts.push(`${g.lineCount} строк`);
    return parts.join(' · ');
}

/** Copy with a way out: clipboard, then a hidden field; → true when copied. Never throws (a browser may forbid it). */
export async function copyText(doc, text) {
    try {
        if (globalThis.navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (_) { /* denied: the old way */ }
    try {
        const ta = doc.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        doc.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = doc.execCommand('copy'); } catch (_) { /* ignore */ }
        ta.remove();
        return ok;
    } catch (_) { return false; }
}
