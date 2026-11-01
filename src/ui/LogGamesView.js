// Settings → «Журнал»: a journal drawn as games — each with a sticky header (date, mode, length, lines) and
// «Скопировать эту игру». Splitting is done once when the journal is opened (core/LogGames.js); a game with a huge
// body draws only its newest lines (the copy still takes all of it). No textarea, nothing per line but plain text nodes.

import { splitGames, gameText, gameTitle, copyText } from '../core/LogGames.js';

export const BODY_MAX = 3000; // lines of one game drawn at once

const flash = (btn, label, ok) => {
    btn.textContent = ok ? '✅ Скопировано' : 'Не вышло — выделите и Ctrl+C';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = label; }, 1500);
};

/** Wire a button: click → copy `getText()` → «Скопировано» for 1.5 s. */
export function bindCopy(doc, btn, getText) {
    if (!btn) return;
    const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    btn.onclick = async () => {
        const t = getText();
        flash(btn, label, !!t && await copyText(doc, t));
    };
}

/**
 * @param {HTMLElement} box
 * @param {string} text
 * @param {{ rowStyle?: (lineNo:number)=>string|undefined }} [opt]  colours per line (then the body is drawn as rows)
 * → { games, lastText(), allText(), parsed }
 */
export function renderGames(doc, box, text, opt = {}) {
    const parsed = splitGames(text);
    const { games } = parsed;
    box.textContent = '';
    const frag = doc.createDocumentFragment();
    games.forEach((g) => {
        const head = doc.createElement('div');
        head.className = 'log-game-head';
        head.style.cssText = 'position:sticky;top:-10px;z-index:1;display:flex;gap:10px;align-items:center;justify-content:space-between;'
            + 'margin:14px 0 6px;padding:7px 10px;background:#1e3a5f;border-left:5px solid #54a0ff;border-radius:6px;'
            + 'font-size:0.95rem;font-weight:700;color:#fff;white-space:normal';
        const title = doc.createElement('span');
        title.textContent = gameTitle(g, games.length);
        const btn = doc.createElement('button');
        btn.className = 'menu-btn';
        btn.style.cssText = 'padding:4px 10px;font-size:0.8rem;flex:none';
        btn.textContent = '📋 Скопировать эту игру';
        bindCopy(doc, btn, () => gameText(parsed, g));
        head.append(title, btn);
        frag.appendChild(head);

        const from = Math.max(g.from, g.to - BODY_MAX);
        if (from > g.from) {
            const cut = doc.createElement('div');
            cut.style.cssText = 'color:#a4b0be;font-style:italic';
            cut.textContent = `… показаны последние ${BODY_MAX} строк из ${g.to - g.from}; «Скопировать эту игру» берёт всё`;
            frag.appendChild(cut);
        }
        if (opt.rowStyle) {
            for (let i = from; i < g.to; i++) {
                const row = doc.createElement('div');
                const c = opt.rowStyle(i);
                if (c) row.style.color = c;
                row.textContent = parsed.lines[i];
                frag.appendChild(row);
            }
        } else {
            frag.appendChild(doc.createTextNode(parsed.lines.slice(from, g.to).join('\n') + '\n'));
        }
    });
    if (!games.length) frag.appendChild(doc.createTextNode(String(text || '').trim() ? text : ''));
    box.appendChild(frag);
    return {
        parsed,
        games,
        lastText: () => (games.length ? gameText(parsed, games[games.length - 1]) : String(text ?? '')),
        allText: () => String(text ?? ''),
    };
}
