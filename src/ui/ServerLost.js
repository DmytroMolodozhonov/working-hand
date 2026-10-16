/**
 * ServerLost.js — the game's program on this computer (the launcher / server.py) is gone while the
 * window is open (it was closed, it crashed, the port was freed for another program): the window says
 * so plainly instead of breaking quietly, and comes back by itself once the game is started again on
 * the same address. (The next start by the icon also closes such old windows: launcher/zns_window.py.)
 */

const CHECK_MS = 2000;
const LOST_AFTER = 2; // failed checks in a row

/** (pure) The server is lost after so many failed checks in a row. */
export function lostAfter(fails) { return fails >= LOST_AFTER; }

async function alive() {
    try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = setTimeout(() => ctl?.abort(), 1500);
        const r = await fetch('/api/ping', { cache: 'no-store', signal: ctl?.signal });
        clearTimeout(t);
        const j = await r.json();
        return j?.zns === 'zns-game';
    } catch (e) { return false; }
}

function overlay(doc) {
    let el = doc.getElementById('server-lost');
    if (el) return el;
    el = doc.createElement('div');
    el.id = 'server-lost';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;place-items:center;background:rgba(11,8,32,0.92);color:#ece8ff;font:16px "Segoe UI",system-ui,sans-serif;text-align:center';
    el.innerHTML = '<div style="max-width:520px;padding:24px"><div style="font-size:22px;color:#f5c84c;margin-bottom:12px">Игра на компьютере закрылась</div>'
        + '<div style="color:#a79fcf;line-height:1.5">Запустите игру ещё раз значком на рабочем столе — всё откроется само.<br>Это окно оживёт, как только игра снова запустится.</div>'
        + '<button style="margin-top:18px;font:inherit;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#ece8ff;cursor:pointer">Закрыть окно</button></div>';
    el.querySelector('button').onclick = () => window.close();
    doc.body.appendChild(el);
    return el;
}

export function watchServer(doc = document) {
    if (!/^https?:$/.test(location.protocol)) return;
    let fails = 0;
    let lost = false;
    const tick = async () => {
        const ok = await alive();
        fails = ok ? 0 : fails + 1;
        if (!lost && lostAfter(fails)) {
            lost = true;
            console.warn('[server] the game\'s program on this computer does not answer');
            overlay(doc).style.display = 'grid';
        } else if (lost && ok) {
            location.reload(); // (started again on this address: the game comes back)
            return;
        }
        setTimeout(tick, CHECK_MS);
    };
    setTimeout(tick, CHECK_MS);
}
