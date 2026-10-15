/**
 * ProfileTransfer.js — the saves come with the player into the game's own window.
 *
 * The game now opens in a browser process of its own with a profile of its own
 * (launcher/zns_browser.py: its graphics flags always hold, nothing else shares
 * its GPU process). The worlds (IndexedDB «zns-worlds»), the hero and the
 * settings (localStorage) were kept in the user's usual browser profile, so
 * once, the first time the game's own window opens, they are carried over:
 *   1. this window asks the server (/api/profile/transfer);
 *   2. the server opens profile-export.html once in the OLD profile (off the
 *      screen), which reads everything and sends it (exportProfile);
 *   3. this window writes it into its own profile (importProfile) before the
 *      game starts. Nothing is ever overwritten: a world or a setting this
 *      window already has stays; nothing is deleted in the old profile.
 *
 * Values keep their kind (typed arrays, Map, Set, Date) through JSON (pack / unpack).
 */

const WORLDS_DB = 'zns-worlds';
const WORLDS_STORE = 'worlds';
const DONE_KEY = 'zns-profile-transfer'; // (in the new profile: when the saves came)
const WAIT_MS = 8000; // the old profile is waited for so long at most (then: next start; index.html looks for a stuck start at 10 s)

const TYPED = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };

/** A structured-clone value as plain JSON (typed arrays, Map, Set, Date, ArrayBuffer kept). */
export function pack(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? { $t: 'num', v: String(v) } : v;
    if (Array.isArray(v)) return v.map(pack);
    if (v instanceof Date) return { $t: 'Date', v: v.getTime() };
    if (v instanceof Map) return { $t: 'Map', v: [...v].map(([k, x]) => [pack(k), pack(x)]) };
    if (v instanceof Set) return { $t: 'Set', v: [...v].map(pack) };
    if (v instanceof ArrayBuffer) return { $t: 'ArrayBuffer', v: [...new Uint8Array(v)] };
    if (ArrayBuffer.isView(v) && TYPED[v.constructor.name]) return { $t: v.constructor.name, v: Array.from(v) };
    const o = {};
    for (const k of Object.keys(v)) o[k] = pack(v[k]);
    return '$t' in o ? { $t: 'obj', v: o } : o;
}

export function unpack(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(unpack);
    const t = v.$t;
    if (t === 'num') return Number(v.v);
    if (t === 'Date') return new Date(v.v);
    if (t === 'Map') return new Map(v.v.map(([k, x]) => [unpack(k), unpack(x)]));
    if (t === 'Set') return new Set(v.v.map(unpack));
    if (t === 'ArrayBuffer') return new Uint8Array(v.v).buffer;
    if (t && TYPED[t]) return new TYPED[t](v.v);
    const src = t === 'obj' ? v.v : v;
    const o = {};
    for (const k of Object.keys(src)) o[k] = unpack(src[k]);
    return o;
}

function openWorlds() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
        const req = indexedDB.open(WORLDS_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(WORLDS_STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function run(db, mode, fn) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(WORLDS_STORE, mode);
        const req = fn(t.objectStore(WORLDS_STORE));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
    });
}

/** (in the old profile) Everything the game keeps in this browser, as JSON. */
export async function exportProfile() {
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== DONE_KEY) local[k] = localStorage.getItem(k);
    }
    let worlds = [];
    try {
        const db = await openWorlds();
        worlds = (await run(db, 'readonly', (st) => st.getAll())) || [];
        db.close();
    } catch (e) { /* no worlds */ }
    return { v: 1, local, worlds: worlds.map(pack) };
}

/** (in the new profile) Write the old profile's saves in; what is already here stays. → {local, worlds} written. */
export async function importProfile(data) {
    const out = { local: 0, worlds: 0 };
    for (const [k, v] of Object.entries(data?.local || {})) {
        if (typeof v === 'string' && localStorage.getItem(k) === null) { localStorage.setItem(k, v); out.local++; }
    }
    const worlds = (data?.worlds || []).map(unpack).filter((w) => w && w.id != null);
    if (worlds.length) {
        const db = await openWorlds();
        const have = new Set(await run(db, 'readonly', (st) => st.getAllKeys()));
        const add = worlds.filter((w) => !have.has(w.id));
        if (add.length) await run(db, 'readwrite', (st) => { let r; for (const w of add) r = st.put(w); return r; });
        out.worlds = add.length;
        db.close();
    }
    return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * (the game page, before the game starts) In the game's own window, the first time:
 * bring the saves over. Elsewhere (a usual browser, the tests) it does nothing.
 */
export async function transferIntoOwnProfile(loc = location) {
    let own = false;
    try {
        own = new URLSearchParams(loc.search).get('app') === 'own';
        if (own) sessionStorage.setItem('zns-own-profile', '1');
        else own = sessionStorage.getItem('zns-own-profile') === '1';
    } catch (e) { /* no storage */ }
    if (!own) return null;
    try { if (localStorage.getItem(DONE_KEY)) return null; } catch (e) { return null; }
    const ask = async () => {
        const r = await fetch('/api/profile/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        return r.ok ? r.json() : { state: 'none' };
    };
    const end = performance.now() + WAIT_MS;
    let s = await ask();
    while (s.state === 'pending' && performance.now() < end) { await sleep(400); s = await ask(); }
    if (s.state === 'ready' && s.data) {
        const n = await importProfile(s.data);
        localStorage.setItem(DONE_KEY, String(s.data.at || Date.now()));
        console.info(`[Профиль] сохранения перенесены из браузера: миров ${n.worlds}, настроек ${n.local}`);
        return n;
    }
    if (s.state === 'none') localStorage.setItem(DONE_KEY, 'nothing');
    return null; // (pending too long: tried again next start)
}
