/**
 * WindowControls.js — the menu is a window of its own: its own «свернуть»,
 * «во весь экран» and «закрыть» buttons (drawn by the game, not by Windows),
 * its own title bar to drag the window by, and the game itself plays full screen.
 *
 * In the game's own app window (shortcut / «Запустить игру.bat») the game's server
 * (/api/window → launcher/zns_window.py, Windows) does it: the window is cut to the page
 * (the Windows title bar and borders are never seen), given the menu's size or the whole
 * screen, moved by the title bar, minimised and closed. No browser full screen there —
 * the browser would bring its frame back when leaving it. In a browser tab: the browser's
 * full screen, and the menu floats in the middle of the page.
 */

async function askServer(action, extra = {}) {
    try {
        const r = await fetch('/api/window', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
        return !!(await r.json()).ok;
    } catch (e) { return false; }
}

/**
 * Resolves once the page has really been put on the screen at its new size: its first paint is reported
 * (Chrome reports it when the frame was presented) and two more frames came — or after `max` ms anyway.
 * (The window shown before that was grey for seconds: the browser's graphics start later than the page.)
 */
export function framePresented(max = 3000) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (how) => {
            if (done) return;
            done = true;
            const fp = performance.getEntriesByType?.('paint')?.[0];
            resolve({ how, t: Math.round(performance.now()), fp: fp ? Math.round(fp.startTime) : null });
        };
        setTimeout(() => finish('timeout'), max);
        const frames = () => requestAnimationFrame(() => requestAnimationFrame(() => finish('paint')));
        try {
            if (performance.getEntriesByType('paint').length) frames();
            else new PerformanceObserver((list, obs) => { obs.disconnect(); frames(); }).observe({ type: 'paint', buffered: true });
        } catch (e) { frames(); }
    });
}

/** The menu window's size (the app window takes exactly this size, without the Windows frame). */
export const MENU_WINDOW = { width: 1180, height: 780 };
/** (sessionStorage: this tab is the game's app window — index.html takes its look before the first paint) */
const APP_KEY = 'zns-app-window';

let appWindow = false;
let appFull = false;
const listeners = new Set();
const changed = () => listeners.forEach((f) => f());
/** The page's size now: the game's server measures the window's frame from it. */
const metrics = () => ({ ...MENU_WINDOW, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio || 1 });

const isFull = (doc) => (appWindow ? appFull : !!doc.fullscreenElement);

async function setAppFull(on) {
    if (await askServer(on ? 'fullscreen' : 'frameless', metrics())) {
        appFull = on;
        document.documentElement.classList.toggle('app-full', on);
        changed();
    }
}

/** Full screen for the game (a click on «Играть» is the user's gesture). Escape stays the game's pause key. */
export async function enterGameFullscreen(doc = document) {
    if (appWindow) { await setAppFull(true); return; }
    try {
        if (!doc.fullscreenElement && doc.documentElement.requestFullscreen) await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // (without this the first Escape would only leave full screen, not open the pause menu)
        await navigator.keyboard?.lock?.(['Escape']);
    } catch (e) { /* not allowed here (a test, an iframe): the game simply stays in its window */ }
}

/** Drag the window by `bar` (the game's own title bar): the mouse's way is sent to the server. */
function dragBy(bar) {
    let last = null;
    let pending = { dx: 0, dy: 0 };
    let sending = false;
    const flush = async () => {
        if (sending || (!pending.dx && !pending.dy)) return;
        sending = true;
        const step = pending;
        pending = { dx: 0, dy: 0 };
        await askServer('moveby', { ...step, dpr: window.devicePixelRatio || 1 });
        sending = false;
        flush();
    };
    bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, a, input, select') || appFull) return;
        last = { x: e.screenX, y: e.screenY };
        bar.setPointerCapture?.(e.pointerId);
        bar.classList.add('dragging');
    });
    bar.addEventListener('pointermove', (e) => {
        if (!last) return;
        // (screen coordinates: they do not change when the window under the mouse moves)
        pending.dx += e.screenX - last.x;
        pending.dy += e.screenY - last.y;
        last = { x: e.screenX, y: e.screenY };
        flush();
    });
    const stop = () => { last = null; bar.classList.remove('dragging'); };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
    bar.addEventListener('lostpointercapture', stop);
}

/**
 * The game's own app window: the game's server cuts the Windows frame away and gives the window the
 * menu's size in the middle of the screen; then the menu fills the window (no empty space around it)
 * and its title bar drags the window. In a browser tab nothing changes (false).
 */
export async function becomeAppWindow({ bar } = {}, doc = document) {
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
        if (i) await new Promise((r) => setTimeout(r, 600)); // (a maximised window is first restored)
        ok = await askServer('frameless', metrics());
    }
    if (!ok) {
        doc.documentElement.classList.remove('app-window'); // (a browser tab after all: index.html guessed from the last time)
        try { sessionStorage.removeItem(APP_KEY); } catch (e) { /* */ }
        return false;
    }
    appWindow = true;
    appFull = false;
    doc.documentElement.classList.add('app-window');
    try { sessionStorage.setItem(APP_KEY, '1'); } catch (e) { /* */ }
    // the window was hidden while the server cut it and gave it its size: it is shown now, with the
    // page already in its final look — never a frame, a strip or a jump
    // (only once a frame of the page is really on the screen: never a grey window)
    framePresented().then((f) => askServer('reveal', { ...f, page: 'game' }));
    for (const b of [].concat(bar || [])) if (b) dragBy(b);
    // the game's full screen covers the taskbar only while the game is in front
    window.addEventListener('focus', () => { if (appFull) askServer('focus'); });
    window.addEventListener('blur', () => { if (appFull) askServer('blur'); });
    changed();
    return true;
}

export function setupWindowControls({ min, full, close, onNote = () => {} }, doc = document) {
    const refresh = () => {
        if (!full) return;
        // (a browser tab already covering the whole screen: no button)
        const coversScreen = !appWindow && !isFull(doc) && window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1;
        full.hidden = coversScreen;
        full.textContent = isFull(doc) ? '🗗' : '⛶';
        full.title = isFull(doc) ? 'Окном' : 'Во весь экран';
        full.setAttribute('aria-label', full.title);
    };
    listeners.add(refresh);
    doc.addEventListener('fullscreenchange', refresh);
    window.addEventListener('resize', refresh);
    refresh();
    if (full) full.onclick = async () => {
        if (appWindow) await setAppFull(!appFull);
        else {
            try { if (doc.fullscreenElement) await doc.exitFullscreen(); else await doc.documentElement.requestFullscreen(); } catch (e) { /* not allowed */ }
        }
        refresh();
    };
    if (min) min.onclick = async () => {
        if (await askServer('minimize')) return;
        if (doc.fullscreenElement) { try { await doc.exitFullscreen(); } catch (e) { /* */ } }
        onNote('Свернуть окно может только окно игры из ярлыка; здесь нажмите Win+D или кнопку «—» браузера');
    };
    if (close) close.onclick = async () => {
        if (appWindow && (await askServer('close'))) return;
        window.close(); // (an app window may close itself)
        await new Promise((r) => setTimeout(r, 250));
        if (doc.visibilityState === 'hidden') return;
        onNote('Эту вкладку браузера закройте сами (Ctrl+W)');
    };
}
