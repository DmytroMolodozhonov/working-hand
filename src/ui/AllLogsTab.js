// Settings → «Общие логи»: every journal of the game together by time (core/AllLog.js), with tag ticks,
// a search, a level filter and «copy everything / the last 5 minutes / save to a file». Drawn only while the tab is open.

import { ALL, ALL_LOG, formatEntry, clockOf } from '../core/AllLog.js';

const SHOW_MAX = 1500; // lines drawn at once (the newest of the filtered)
const COLORS = { error: '#ff6b81', warn: '#eccc68', info: '#dfe4ea' };

export function setupAllLogsPanel(doc = document) {
    const box = doc.getElementById('alllog-text');
    const tagsEl = doc.getElementById('alllog-tags');
    if (!box || !tagsEl) return null;
    const search = doc.getElementById('alllog-search');
    const level = doc.getElementById('alllog-level');
    const follow = doc.getElementById('alllog-follow');
    const info = doc.getElementById('alllog-info');
    const off = new Set(); // tags switched off
    let timer = null, shownTags = '';

    const filters = (extra = {}) => ({
        tags: ALL.tagsSeen().filter((t) => !off.has(t)),
        text: search?.value || '',
        minLevel: level?.value || 'info',
        ...extra,
    });

    const drawTags = () => {
        const key = ALL.tagsSeen().join('|');
        if (key === shownTags) return;
        shownTags = key;
        tagsEl.textContent = '';
        for (const t of ALL.tagsSeen()) {
            const l = doc.createElement('label');
            const c = doc.createElement('input');
            c.type = 'checkbox'; c.checked = !off.has(t);
            c.addEventListener('change', () => { if (c.checked) off.delete(t); else off.add(t); draw(); });
            l.append(c, ` ${t}`);
            tagsEl.appendChild(l);
        }
    };

    const draw = () => {
        drawTags();
        const list = ALL.query(filters());
        const tail = list.length > SHOW_MAX ? list.slice(-SHOW_MAX) : list;
        const frag = doc.createDocumentFragment();
        for (const e of tail) {
            const row = doc.createElement('div');
            row.style.color = COLORS[e.level] || COLORS.info;
            row.textContent = formatEntry(e);
            frag.appendChild(row);
        }
        box.textContent = '';
        if (!tail.length) box.textContent = ALL.items.length ? 'По этим условиям ничего нет.' : 'Пока пусто.';
        else box.appendChild(frag);
        if (info) info.textContent = `Показано ${tail.length} из ${list.length}${list.length ? ` (с ${clockOf(list[0].t)})` : ''}; всего в памяти ${ALL.items.length}. Файл zns-all.log лежит рядом с остальными журналами в папке игры (последние ~20 МБ).`;
        if (follow?.checked) box.scrollTop = box.scrollHeight;
    };

    const copy = async (btn, text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = '✅ Скопировано';
        } catch (e) {
            const ta = doc.createElement('textarea');
            ta.value = text; doc.body.appendChild(ta); ta.select();
            let ok = false;
            try { ok = doc.execCommand('copy'); } catch (_) { /* ignore */ }
            ta.remove();
            btn.textContent = ok ? '✅ Скопировано' : 'Не вышло — сохраните в файл';
        }
        setTimeout(() => { btn.textContent = label; }, 2000);
    };

    const bind = (id, fn) => { const b = doc.getElementById(id); const label = b?.textContent; b?.addEventListener('click', () => fn(b, label)); };
    bind('alllog-copy-all', (b, l) => copy(b, ALL.textOf(ALL.query(filters())), l));
    bind('alllog-copy-5', (b, l) => copy(b, ALL.textOf(ALL.query(filters({ sinceMs: ALL_LOG.RECENT_MS }))), l));
    bind('alllog-save', async (b, l) => {
        // the file zns-all.log is written by the game's program; «save» sends what is waiting right now and says where it is
        ALL.flush();
        let where = '';
        try {
            const r = await fetch('/api/logs', { cache: 'no-store' });
            where = ((await r.json()).logs || []).find((x) => x.name === 'zns-all.log')?.path || '';
        } catch (_) { /* no program of ours */ }
        if (where) { b.textContent = '✅ Записано'; if (info) info.textContent = `Файл: ${where}`; }
        else {
            // (no own server: the browser saves a copy)
            const url = URL.createObjectURL(new Blob([ALL.textOf()], { type: 'text/plain;charset=utf-8' }));
            const a = doc.createElement('a'); a.href = url; a.download = 'zns-all.log'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            b.textContent = '✅ Файл скачан';
        }
        setTimeout(() => { b.textContent = l; }, 2500);
    });
    search?.addEventListener('input', draw);
    level?.addEventListener('change', draw);

    // drawn only while the tab is open; every 2 s, not every line
    const tab = doc.querySelector('#tab-settings .sub-tab[data-sub="set-alllog"]');
    const open = () => { draw(); clearInterval(timer); timer = setInterval(() => { if (box.offsetParent) draw(); else { clearInterval(timer); timer = null; } }, 2000); };
    tab?.addEventListener('click', open);
    return { draw };
}
