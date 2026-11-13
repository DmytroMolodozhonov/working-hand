/** Synchronous death checkpoint: a reload must not trust an older live world/host snapshot. */
const STORE = 'zns-death-checkpoints';

function key(g) {
    const world = g.keeper?.id || g.config?.saved?.id || g.net?.code;
    return world ? `${world}:${g.seed ?? g.config?.seed ?? ''}:${g.net?.pid || 'me'}` : null;
}

function read() {
    try {
        const value = JSON.parse(globalThis.localStorage?.getItem(STORE) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    catch { return {}; }
}

export function rememberDeath(g, player) {
    const k = key(g);
    if (!k) return;
    try {
        const all = read();
        delete all[k];
        all[k] = player;
        const keys = Object.keys(all);
        while (keys.length > 32) delete all[keys.shift()];
        globalThis.localStorage?.setItem(STORE, JSON.stringify(all));
    } catch { /* Storage unavailable: normal world/network save still runs. */ }
}

export function deathCheckpoint(g) {
    const k = key(g);
    return k ? read()[k] || null : null;
}

export function forgetDeath(g) {
    const k = key(g);
    if (!k) return;
    try {
        const all = read();
        delete all[k];
        globalThis.localStorage?.setItem(STORE, JSON.stringify(all));
    } catch { /* Storage unavailable. */ }
}
