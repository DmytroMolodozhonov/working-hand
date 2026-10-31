// Settings → «Журнал»: what the game and its launcher wrote (read through server.py /api/logs),
// and the «this window is open» line the app launcher watches (it quits when no window is left).

export function keepLauncherAlive() {
    if (typeof EventSource === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
    try { return new EventSource('/api/alive'); } catch (e) { return null; }
}

/**
 * @param {Document} [doc]
 * @param {() => ({name, title, text}|null)} [live]  the spell journal of this game (shown when there is no file)
 */
export const ALL_ITEM = '__all';

export function setupLogPanel(doc = document, live = null, all = null) {
    const sel = doc.getElementById('log-file');
    const pre = doc.getElementById('log-text');
    const where = doc.getElementById('log-path');
    const refresh = doc.getElementById('log-refresh');
    const copy = doc.getElementById('log-copy');
    if (!sel || !pre) return null;
    let logs = [];

    const show = () => {
        if (sel.value === ALL_ITEM && all) { all.show(); return; }
        all?.hide();
        const l = logs.find((x) => x.name === sel.value) || logs[0];
        pre.textContent = l ? (l.text || '(пока пусто)') : 'Журнал пока пуст.';
        pre.scrollTop = pre.scrollHeight;
        // (where the file is: it can be sent as it is)
        if (where) where.textContent = l?.path ? `Файл: ${l.path}` : l ? 'Файла нет — нажмите «Скопировать» и пришлите текст.' : '';
    };
    const load = async () => {
        pre.textContent = 'Загружаю…';
        let failed = false;
        try {
            const r = await fetch('/api/logs', { cache: 'no-store' });
            logs = (await r.json()).logs || [];
        } catch (e) {
            logs = [];
            failed = true;
        }
        // the spell journal of this game, when the file isn't there (yet)
        const mem = live?.();
        if (mem && !logs.some((l) => l.name === mem.name && l.text)) logs = [mem, ...logs.filter((l) => l.name !== mem.name)];
        if (failed && !logs.length && !all) { pre.textContent = 'Журнал недоступен (игра открыта не через свой сервер).'; return; }
        const keep = sel.value;
        sel.textContent = '';
        if (all) {
            const o = doc.createElement('option');
            o.value = ALL_ITEM; o.textContent = 'Общие логи';
            sel.appendChild(o);
        }
        for (const l of logs) {
            const o = doc.createElement('option');
            o.value = l.name;
            o.textContent = `${l.title} (${l.name})`;
            sel.appendChild(o);
        }
        if (logs.some((l) => l.name === keep) || (all && keep === ALL_ITEM)) sel.value = keep;
        show();
    };
    sel.addEventListener('change', show);
    refresh?.addEventListener('click', () => (sel.value === ALL_ITEM && all ? all.draw() : load()));
    copy?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(sel.value === ALL_ITEM && all ? all.text() : pre.textContent);
            copy.textContent = '✅ Скопировано';
        } catch (e) {
            const range = doc.createRange();
            range.selectNodeContents(pre);
            const s = getSelection();
            s.removeAllRanges();
            s.addRange(range);
            copy.textContent = 'Выделено — нажмите Ctrl+C';
        }
        setTimeout(() => { copy.textContent = '📋 Скопировать'; }, 2000);
    });
    // loaded when the tab is opened (and again with «Обновить»)
    doc.querySelector('#tab-settings .sub-tab[data-sub="set-log"]')?.addEventListener('click', load);
    doc.querySelector('#tab-settings')?.addEventListener('click', (e) => { if (e.target.closest?.('.sub-tab') && !e.target.closest('[data-sub="set-log"]')) all?.hide(); });
    return { load };
}
