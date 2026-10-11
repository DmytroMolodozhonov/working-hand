/**
 * WindowControls.js — the menu is a window of its own: its own «свернуть»,
 * «во весь экран» and «закрыть» buttons (drawn by the game, not by Windows),
 * and the game itself goes full screen when it starts.
 *
 * Minimise / close: the game's window is asked to close itself first
 * (window.close() works for the launcher's app window); the game's server
 * (/api/window, Windows) minimises or closes the window in front only when
 * it is the game's own window.
 */

async function askServer(action, extra = {}) {
    try {
        const r = await fetch('/api/window', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
        return !!(await r.json()).ok;
    } catch (e) { return false; }
}

const isFull = (doc) => !!doc.fullscreenElement;

/** Full screen for the game (a click on «Играть» is the user's gesture). Escape stays the game's pause key. */
export async function enterGameFullscreen(doc = document) {
    if (appWindow) askServer('framed'); // (the whole window again: nothing of the game may be cut away)
    try {
        if (!isFull(doc) && doc.documentElement.requestFullscreen) await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // (without this the first Escape would only leave full screen, not open the pause menu)
        await navigator.keyboard?.lock?.(['Escape']);
    } catch (e) { /* not allowed here (a test, an iframe): the game simply stays in its window */ }
}

/** The menu window's size (the app window takes exactly this size, without the Windows frame). */
export const MENU_WINDOW = { width: 1180, height: 780 };

let appWindow = false;
/** The page's size now: the game's server measures the window's frame from it and cuts the frame away. */
const metrics = () => ({ ...MENU_WINDOW, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio || 1 });

/**
 * The game's own app window (from the shortcut / «Запустить игру.bat»): the game's server cuts the
 * Windows title bar and borders away and gives the window the menu's size; then the menu fills the
 * window (no empty space around it) and its title bar moves the window. In a browser tab nothing
 * changes. Full screen for the game takes the cut away; back in the menu it is cut again.
 */
export async function becomeAppWindow({ bar } = {}, doc = document) {
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
        if (i) await new Promise((r) => setTimeout(r, 600)); // (a maximised window is first restored)
        ok = await askServer('frameless', metrics());
    }
    if (!ok) return false;
    appWindow = true;
    doc.documentElement.classList.add('app-window');
    bar?.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button, a, input, select') || isFull(doc)) return;
        askServer('drag');
    });
    doc.addEventListener('fullscreenchange', () => {
        if (!isFull(doc)) setTimeout(() => askServer('frameless', metrics()), 300); // (after Chrome has put the window back)
    });
    return true;
}

export function setupWindowControls({ min, full, close, onNote = () => {} }, doc = document) {
    const refresh = () => {
        if (!full) return;
        // (the launcher opens the window already full screen, with no way back to a smaller window: no button then)
        const coversScreen = !isFull(doc) && window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1;
        full.hidden = coversScreen;
        full.textContent = isFull(doc) ? '🗗' : '⛶';
        full.title = isFull(doc) ? 'Окном' : 'Во весь экран';
        full.setAttribute('aria-label', full.title);
    };
    doc.addEventListener('fullscreenchange', refresh);
    window.addEventListener('resize', refresh);
    refresh();
    if (full) full.onclick = async () => {
        try { if (isFull(doc)) await doc.exitFullscreen(); else await doc.documentElement.requestFullscreen(); } catch (e) { /* not allowed */ }
        refresh();
    };
    if (min) min.onclick = async () => {
        if (await askServer('minimize')) return;
        if (isFull(doc)) { try { await doc.exitFullscreen(); } catch (e) { /* */ } }
        onNote('Свернуть окно может только окно игры из ярлыка; здесь нажмите Win+D или кнопку «—» браузера');
    };
    if (close) close.onclick = async () => {
        window.close(); // the launcher's app window closes itself
        await new Promise((r) => setTimeout(r, 250));
        if (doc.visibilityState === 'hidden') return;
        if (await askServer('close')) return;
        onNote('Эту вкладку браузера закройте сами (Ctrl+W)');
    };
}
