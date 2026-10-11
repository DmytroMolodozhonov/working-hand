// Settings → «Журнал»: what the game and its launcher wrote (read through server.py /api/logs),
// and the «this window is open» line the app launcher watches (it quits when no window is left).

export function keepLauncherAlive() {
    if (typeof EventSource === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
    try { return new EventSource('/api/alive'); } catch (e) { return null; }
}

export function setupLogPanel(doc = document) {
    const sel = doc.getElementById('log-file');
    const pre = doc.getElementById('log-text');
    const refresh = doc.getElementById('log-refresh');
    const copy = doc.getElementById('log-copy');
    if (!sel || !pre) return null;
    let logs = [];

    const show = () => {
        const l = logs.find((x) => x.name === sel.value) || logs[0];
        pre.textContent = l ? (l.text || '(пока пусто)') : 'Журнал пока пуст.';
        pre.scrollTop = pre.scrollHeight;
    };
    const load = async () => {
        pre.textContent = 'Загружаю…';
        try {
            const r = await fetch('/api/logs', { cache: 'no-store' });
            logs = (await r.json()).logs || [];
        } catch (e) {
            logs = [];
            pre.textContent = 'Журнал недоступен (игра открыта не через свой сервер).';
            return;
        }
        const keep = sel.value;
        sel.textContent = '';
        for (const l of logs) {
            const o = doc.createElement('option');
            o.value = l.name;
            o.textContent = `${l.title} (${l.name})`;
            sel.appendChild(o);
        }
        if (logs.some((l) => l.name === keep)) sel.value = keep;
        show();
    };
    sel.addEventListener('change', show);
    refresh?.addEventListener('click', load);
    copy?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(pre.textContent);
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
    return { load };
}
