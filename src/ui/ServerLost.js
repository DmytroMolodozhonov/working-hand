/**
 * ServerLost.js — the game's program on this computer (the launcher / server.py) is gone while the
 * window is open (it was closed, it crashed, the port was freed for another program): the window says
 * so plainly instead of breaking quietly, and comes back by itself once the game is started again on
 * the same address. (The next start by the icon also closes such old windows: launcher/zns_window.py.)
 */

const CHECK_MS = 2000;
const LOST_AFTER = 2; // refused checks in a row (nothing listens on the address any more)
const SILENT_MS = 20000; // or no answer at all for this long (a busy program still answers within that)

/**
 * (pure) The server is lost: refused twice in a row, or silent for SILENT_MS. A check that only waited too
 * long is not «lost»: while a villager thinks and speaks the window has many requests open to the game's
 * program and the browser queues the check behind them — the window once said «Игра закрылась» then and
 * reloaded the game in the middle of the talk.
 */
export function lostAfter(fails, silentMs = 0) { return fails >= LOST_AFTER || silentMs >= SILENT_MS; }

/** (pure) Back after being lost: reload only if it is another start of the program (or not known). */
export function shouldReload(bootBefore, bootNow) { return !bootBefore || !bootNow || bootBefore !== bootNow; }

/** {ok, boot} — ok: the game answered; refused: nothing answered at once (not a mere wait). */
async function alive() {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl?.abort(), 6000);
    try {
        const r = await fetch('/api/ping', { cache: 'no-store', signal: ctl?.signal });
        const j = await r.json();
        return { ok: j?.zns === 'zns-game', boot: j?.boot || '' };
    } catch (e) {
        return { ok: false, refused: e?.name !== 'AbortError' };
    } finally { clearTimeout(t); }
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
    let fails = 0, okAt = Date.now(), boot = '';
    let lost = false;
    const tick = async () => {
        const a = await alive();
        if (a.ok) { fails = 0; okAt = Date.now(); } else if (a.refused) fails++;
        if (!lost && !a.ok && lostAfter(fails, Date.now() - okAt)) {
            lost = true;
            console.warn('[server] the game\'s program on this computer does not answer');
            overlay(doc).style.display = 'grid';
        } else if (a.ok) {
            if (lost) {
                if (shouldReload(boot, a.boot)) { location.reload(); return; } // (started again on this address: the game comes back)
                lost = false; // (the same program, only busy for a while: the game goes on as it was)
                overlay(doc).style.display = 'none';
                console.warn('[server] the game\'s program answers again (it was only busy)');
            }
            boot = a.boot || boot;
        }
        setTimeout(tick, CHECK_MS);
    };
    setTimeout(tick, CHECK_MS);
}
