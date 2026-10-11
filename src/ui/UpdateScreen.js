/**
 * UpdateScreen.js — the game gets another version while it runs (the launcher does the work,
 * launcher/zns_launcher.py → /__launcher/update), behind a loading window:
 *   - the menu opens and a newer version is out: it is downloaded at once (no «please restart»);
 *   - a friend's server runs another version: exactly that one is downloaded, then the game
 *     joins the server by itself.
 * Without the launcher (an old start from a .bat) nothing can be downloaded here: false.
 */

const REJOIN = 'zns-rejoin';
const TRIED = 'zns-update-tried';

/** Can this game download a version while it runs? */
export async function canUpdate() {
    try {
        const r = await fetch('/__launcher/update', { cache: 'no-store' });
        if (!r.ok) return false;
        const s = await r.json();
        return typeof s?.state === 'string';
    } catch (e) {
        return false;
    }
}

function overlay(title) {
    let el = document.getElementById('update-screen');
    if (!el) {
        el = document.createElement('div');
        el.id = 'update-screen';
        el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(8,6,20,.92);color:#f4ecff;font:600 18px system-ui,sans-serif;text-align:center';
        el.innerHTML = `<div style="width:min(520px,86vw)">
            <div style="font-size:42px;margin-bottom:10px">✨</div>
            <div class="us-title" style="font-size:22px;margin-bottom:16px"></div>
            <div style="height:12px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden">
                <div class="us-bar" style="height:100%;width:2%;background:linear-gradient(90deg,#8e5bd8,#ffd36e);transition:width .2s"></div>
            </div>
            <div class="us-detail" style="margin-top:10px;font-size:13px;font-weight:400;opacity:.7;min-height:18px;word-break:break-all"></div>
        </div>`;
        document.body.appendChild(el);
    }
    el.querySelector('.us-title').textContent = title;
    return el;
}

/**
 * Download a version now (sha: the whole commit id or its first letters; '' = the newest),
 * showing the loading window. → true when it is in place (reload the page then).
 */
export async function runUpdate(sha = '', title = 'Скачиваю новую версию игры…') {
    const el = overlay(title);
    const bar = el.querySelector('.us-bar'), detail = el.querySelector('.us-detail');
    try {
        const r = await fetch('/__launcher/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha }) });
        const j = await r.json();
        if (!j?.ok) throw new Error('занято');
        const t0 = performance.now();
        for (;;) {
            await new Promise((res) => setTimeout(res, 300));
            const s = await (await fetch('/__launcher/update', { cache: 'no-store' })).json();
            bar.style.width = `${Math.round(Math.max(0.02, Math.min(1, s.progress || 0)) * 100)}%`;
            detail.textContent = s.detail || '';
            if (s.state === 'done') {
                el.querySelector('.us-title').textContent = 'Готово! Запускаю…';
                return true;
            }
            if (s.state === 'fail') throw new Error(s.error || 'не вышло');
            if (performance.now() - t0 > 15 * 60 * 1000) throw new Error('слишком долго');
        }
    } catch (e) {
        el.remove();
        console.warn('[update]', e);
        return false;
    }
}

/**
 * The menu just opened: a newer version is out → get it at once and reload.
 * (Never while a friend's server is being joined with its own version; never twice for the
 * same version in a row — no reload loop if something goes wrong.)
 */
export async function updateIfNewer(info) {
    if (!info?.latest || !info.have || info.latest === info.have) return false;
    if (pendingRejoin(false)) return false;
    try {
        if (sessionStorage.getItem(TRIED) === info.latest) return false;
        sessionStorage.setItem(TRIED, info.latest);
    } catch (e) { /* ignore */ }
    if (!(await canUpdate())) return false;
    if (await runUpdate('', 'Вышла новая версия — скачиваю…')) { location.reload(); return true; }
    return false;
}

/** Remember to join this server again after the page reloads with its version. */
export function rememberRejoin(join) {
    try { sessionStorage.setItem(REJOIN, JSON.stringify({ ...join, at: Date.now() })); } catch (e) { /* ignore */ }
}

/** A join waiting for the reload (taken: forgotten at once). */
export function pendingRejoin(take = true) {
    try {
        const j = JSON.parse(sessionStorage.getItem(REJOIN) || 'null');
        if (take) sessionStorage.removeItem(REJOIN);
        return j && Date.now() - j.at < 10 * 60 * 1000 && j.code ? j : null;
    } catch (e) {
        return null;
    }
}
