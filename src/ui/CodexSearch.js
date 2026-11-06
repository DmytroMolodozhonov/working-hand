/**
 * CodexSearch.js — «🔍 Поиск» (the author 07.11: «поиск по зельям, заклинаниям и лору — в начальном меню и через Escape»).
 * One search line over everything the codex knows: spells, potions (recipes, how to brew, ingredients), pentagrams, the lore
 * («Механика игры»), the bosses and the things. Words typed in any order, any ending («зелье» finds «зелья»), «ё» = «е».
 * Pure part (`codexEntries`, `searchCodex`) works without a page (tests/unit/codex-search.test.js); the view is `renderSearchTab`.
 */
import { SPELLS, ITEMS, MECHANICS, BOSSES, potionEntries, pentagramCards, pentagramCardHtml, card, cardSpell } from './Codex.js';

export const SEARCH_KINDS = [
    { id: 'all', name: '✨ Всё' }, { id: 'spell', name: '📖 Заклинания' }, { id: 'potion', name: '🧪 Зелья' }, { id: 'pent', name: '🩸 Пентаграммы' },
    { id: 'lore', name: '🧩 Лор и механика' }, { id: 'boss', name: '👑 Боссы' }, { id: 'item', name: '🗡️ Вещи' },
];

const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ');
/** Lower case, «ё» = «е», no marks and no extra spaces. */
export const norm = (t) => plain(t).toLowerCase().replace(/ё/g, 'е').replace(/[«»"'“”(),.:;!?—–\-/+*…]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Every entry of the codex: { kind, title, text (plain, for the search), key (normalised), html() (the card, needs a page) }.
 * `ctx`: { can(spell), used(spell), known: Set } — as the pause menu's «Магия» (a hero outside Creative sees only the spells it can say); null — all.
 */
export function codexEntries(ctx = null) {
    const can = ctx?.can || null, used = ctx?.used || null, known = ctx?.known || null;
    const out = [];
    const add = (kind, title, text, html) => out.push({ kind, title, text: plain(text), key: norm(title + ' ' + text), tkey: norm(title), html });
    for (const s of SPELLS) {
        if (can && !can(cardSpell(s))) continue;
        add('spell', s.name, [s.desc, s.say, s.next, s.max, s.magic].filter(Boolean).join(' '), () => card(s, can, used).outerHTML);
    }
    for (const e of potionEntries()) {
        if (e.html) { const title = (/item-name">([^<]*)/.exec(e.html) || [])[1] || 'Зелье'; add('potion', title, e.html, () => e.html); }
        else add('potion', e.item.name, [e.item.desc, e.item.say, e.item.next].filter(Boolean).join(' '), () => card(e.item).outerHTML);
    }
    for (const c of pentagramCards(known)) add('pent', c.name, [c.spell ? `Pentagranium ${c.spell}` : '', c.text, c.cost, c.dark ? 'тёмная чёрная' : 'светлая'].join(' '), () => pentagramCardHtml(c));
    for (const m of MECHANICS) add('lore', m.title, [m.lead, ...m.points].join(' '), () => `<section class="mech-card"><h3 class="mech-title"><span class="mech-icon">${m.icon}</span>${m.title}</h3><p class="mech-lead">${m.lead}</p><ul class="mech-points">${m.points.map((p) => `<li>${p}</li>`).join('')}</ul></section>`);
    for (const b of BOSSES) add('boss', b.name, b.about.join(' '), () => `<section class="mech-card"><h3 class="mech-title"><span class="mech-icon">👑</span>${b.name}</h3>${b.about.map((t) => `<p class="mech-lead">${t}</p>`).join('')}</section>`);
    for (const i of ITEMS) {
        if (i.cat === 'potions') continue; // (the potions are above)
        add('item', i.name, [i.desc, i.say, i.next, i.magic].filter(Boolean).join(' '), () => card(i).outerHTML);
    }
    return out;
}

/** A word's stem for a Russian ending: «зелья» → «зель» (finds «зелье»), short words stay whole. */
export function stem(w) { return w.length >= 7 ? w.slice(0, -2) : w.length >= 5 ? w.slice(0, -1) : w; }

/** The entries that hold every word of the query (any order), best first: the title beats the text. `kind`: 'all' or one of SEARCH_KINDS. */
export function searchCodex(entries, query, kind = 'all') {
    const words = norm(query).split(' ').filter(Boolean).map(stem);
    const pool = entries.filter((e) => kind === 'all' || e.kind === kind);
    if (!words.length) return pool.map((e) => ({ e, score: 0 }));
    const res = [];
    for (const e of pool) {
        let score = 0;
        for (const w of words) {
            if (!e.key.includes(w)) { score = -1; break; }
            score += e.tkey.startsWith(w) ? 6 : e.tkey.includes(w) ? 4 : 1;
        }
        if (score > 0) res.push({ e, score });
    }
    return res.sort((a, b) => b.score - a.score);
}

const SHOWN = 60;
let _q = '', _kind = 'all';
/** The page: a line, the kinds with their counts, the cards found. `box`: the pane's element; `ctx`: as `codexEntries`. */
export function setSearchQuery(q) { _q = String(q || ''); }
export function renderSearchTab(box, ctx = null, focus = true, ext = null) {
    if (!box) return;
    const entries = codexEntries(ctx);
    // (`ext`: the line sits in the window's top bar — the main menu; the pane holds only the kinds and the cards)
    box.innerHTML = `${ext ? '' : '<div class="search-bar"><input type="search" class="search-input" placeholder="🔍 Поиск: заклинание, зелье, ингредиент, босс, слово из лора…" autocomplete="off" spellcheck="false"></div>'}
        <div class="sub-tabs search-kinds"></div><div class="search-note"></div><div class="items-grid search-results"></div>`;
    const input = ext || box.querySelector('.search-input'), kinds = box.querySelector('.search-kinds'), note = box.querySelector('.search-note'), grid = box.querySelector('.search-results');
    input.value = _q;
    if (!ext) for (const ev of ['keydown', 'keyup']) input.addEventListener(ev, (e) => { if (e.key !== 'Escape') e.stopPropagation(); }); // (typed letters must not reach the game — walking, slots, spells; only Escape goes on)
    const draw = () => {
        const all = searchCodex(entries, _q, 'all');
        kinds.innerHTML = '';
        for (const k of SEARCH_KINDS) {
            const b = document.createElement('button');
            b.className = 'sub-tab' + (k.id === _kind ? ' active' : '');
            b.textContent = `${k.name} (${k.id === 'all' ? all.length : all.filter((r) => r.e.kind === k.id).length})`;
            b.onclick = () => { _kind = k.id; draw(); };
            kinds.appendChild(b);
        }
        const found = all.filter((r) => _kind === 'all' || r.e.kind === _kind);
        note.textContent = !_q.trim() ? 'Начните вводить слово — покажу всё, что с ним связано.' : found.length ? (found.length > SHOWN ? `Найдено ${found.length}, показаны первые ${SHOWN}: уточните запрос.` : `Найдено: ${found.length}`) : 'Ничего не нашлось. Попробуйте другое слово или его начало.';
        grid.innerHTML = found.slice(0, SHOWN).map((r) => r.e.html()).join('');
    };
    if (!ext) input.addEventListener('input', () => { _q = input.value; draw(); });
    draw();
    if (focus && !ext) setTimeout(() => input.focus(), 0);
}
