/**
 * BootCache.js — what is dear to make and always comes out the same is kept on the disk between starts
 * (the author: «игра запускается постоянно, у меня SSD — почему бы не хранить готовое между запусками»).
 *
 * Only for results that are expensive AND fully decided by their inputs (the synthesized sounds, the detailed hero's
 * shapes, the slots' pictures…). Never for anything of the world's state, a save, the network or the land.
 *
 * Safety (the author: «НЕ СЛОМАТЬ ИГРУ»):
 *   - the key: the kind + a hash of every input + the game's build (BUILD: a hash of all the game's files, from the server)
 *     + FORMAT — a new version of the game never reads an old result: the cache of another build is deleted whole;
 *   - each record carries its kind, key and a checksum of its bytes (FNV-1a over everything): any mismatch, a cut file,
 *     a wrong length → the record is dropped and made again (never shown);
 *   - writing is one put of the whole record (Cache Storage: a record is there whole or not at all — closing the game in
 *     the middle leaves nothing half written);
 *   - a size limit (MAX_BYTES), the oldest records go first;
 *   - any error (no storage, a full disk, read-only, a private window, a broken record) → quietly made again; after a
 *     failed write the cache stops writing for this start (a full disk is not asked again and again);
 *   - off: Settings «Быстрая загрузка (кеш)», the start's parameter `?nocache` (the launcher's `--no-cache`),
 *     `localStorage['zns-boot-cache'] = '0'`; «Очистить кеш» deletes it all.
 *
 * The pure part (records, keys, the checksum, the stats' line) is tested in node (tests/unit/boot-cache.test.js); the
 * store is given (CacheStore below for the browser, a Map in the tests).
 */

export const BOOT = {
    FORMAT: 3, // (the records' layout: raised when it changes — every old record is then of another cache)
    MAX_BYTES: 500 * 1024 * 1024,
    PREFIX: 'zns-boot-',
    MAGIC: 0x424e535a, // ('ZNSB')
    // (what may be kept: a kind not here is never read nor written — a kind that tools/bootcheck.mjs finds different with the
    // cache and without is taken out of this list until it is fixed)
    KINDS: ['sound', 'realbody', 'realwear', 'icon'],
};

// ------------------------------------------------------------------ hashes

/** FNV-1a, 32 bits, over bytes (the keys' small texts). */
export function fnv1a(bytes, h = 0x811c9dc5) {
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}

/**
 * The records' checksum: FNV-1a over 32-bit words (4× fewer steps than over bytes — a record of sounds is ~100 MB) and
 * the tail's bytes; every bit of the record changes it. Little-endian words, the same on every computer that reads them.
 */
export function sum32(bytes, h = 0x811c9dc5) {
    const n4 = bytes.length >> 2;
    if (n4) {
        const words = (bytes.byteOffset & 3) === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, n4) : new Uint32Array(bytes.slice(0, n4 * 4).buffer);
        for (let i = 0; i < n4; i++) { h = Math.imul(h ^ words[i], 0x01000193); h ^= h >>> 13; }
    }
    for (let i = n4 * 4; i < bytes.length; i++) { h = Math.imul(h ^ bytes[i], 0x01000193); }
    return h >>> 0;
}

/** A hash of a string (the keys), 2×32 bits as 16 hex letters (collisions practically never). */
export function hashText(s) {
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a ^= c; a = Math.imul(a, 0x01000193) >>> 0;
        b ^= c; b = Math.imul(b ^ (b >>> 15), 0x2c1b3c6d) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** A stable text of the inputs (the keys of objects sorted: the same inputs → the same key). */
export function stableText(v) {
    if (v == null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return '[' + v.map(stableText).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableText(v[k])).join(',') + '}';
}

/** The key of a result: kind + the hash of its inputs. */
export function cacheKey(kind, inputs) {
    return `${kind}/${hashText(stableText(inputs))}`;
}

// ------------------------------------------------------------------ trees of typed arrays

const TYPES = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray };

/** A tree of plain values and typed arrays → {json, arrays}: the arrays apart (copied out of nothing, kept as they are). */
export function packTree(tree) {
    const arrays = [];
    const walk = (v) => {
        if (ArrayBuffer.isView(v)) { arrays.push(v); return { $ta: arrays.length - 1, t: v.constructor.name }; }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
        return v;
    };
    return { json: walk(tree), arrays };
}

/** The other way: {json, arrays} → the tree (the typed arrays of the record). Null when something does not fit. */
export function unpackTree(json, arrays) {
    let bad = false;
    const walk = (v) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$ta === 'number') {
            const a = arrays[v.$ta];
            if (!a || a.constructor.name !== v.t) { bad = true; return null; }
            return a;
        }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
        return v;
    };
    const out = walk(json);
    return bad ? null : out;
}

// ------------------------------------------------------------------ records

const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

/**
 * One record: [magic u32][format u32][header length u32][checksum u32][header JSON][pad to 8][array 0][pad][array 1]…
 * The header: {kind, key, meta, parts: [{t, n}]} (t: the array's type, n: its bytes). The checksum is over every byte after
 * the first 16 (the header, the arrays, the padding).
 * @returns {ArrayBuffer}
 */
export function encodeRecord(kind, key, meta, arrays = []) {
    const parts = arrays.map((a) => ({ t: a.constructor.name, n: a.byteLength }));
    const head = enc.encode(JSON.stringify({ kind, key, meta: meta ?? null, parts }));
    const pad = (n) => (n + 7) & ~7;
    let size = pad(16 + head.length);
    const at = [];
    for (const a of arrays) { at.push(size); size = pad(size + a.byteLength); }
    const buf = new ArrayBuffer(size);
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    u8.set(head, 16);
    arrays.forEach((a, i) => u8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at[i]));
    const sum = sum32(u8.subarray(16)); // (everything after the first 16 bytes: the header, the arrays and the padding between)
    dv.setUint32(0, BOOT.MAGIC, true);
    dv.setUint32(4, BOOT.FORMAT, true);
    dv.setUint32(8, head.length, true);
    dv.setUint32(12, sum, true);
    return buf;
}

/**
 * Read a record back. Anything wrong — another magic or format, a cut record, other kind/key, a checksum that does not
 * match, an unknown array type — gives null (the caller makes it again). The arrays are views of the record's buffer.
 * @returns {{meta: any, arrays: ArrayBufferView[]}|null}
 */
export function decodeRecord(buf, kind, key) {
    try {
        if (!(buf instanceof ArrayBuffer) || buf.byteLength < 16) return null;
        const dv = new DataView(buf), u8 = new Uint8Array(buf);
        if (dv.getUint32(0, true) !== BOOT.MAGIC || dv.getUint32(4, true) !== BOOT.FORMAT) return null;
        const hl = dv.getUint32(8, true), sum0 = dv.getUint32(12, true);
        if (16 + hl > buf.byteLength) return null;
        const headBytes = u8.subarray(16, 16 + hl);
        const head = JSON.parse(dec.decode(headBytes));
        if (head.kind !== kind || head.key !== key || !Array.isArray(head.parts)) return null;
        const pad = (n) => (n + 7) & ~7;
        if (sum32(u8.subarray(16)) !== sum0) return null; // (any byte of the record changed: not read)
        let at = pad(16 + hl);
        const arrays = [];
        for (const p of head.parts) {
            const T = TYPES[p.t];
            if (!T || !(p.n >= 0) || p.n % T.BYTES_PER_ELEMENT || at + p.n > buf.byteLength) return null;
            arrays.push(new T(buf, at, p.n / T.BYTES_PER_ELEMENT));
            at = pad(at + p.n);
        }
        if (at !== buf.byteLength) return null;
        return { meta: head.meta, arrays };
    } catch (e) { return null; }
}

// ------------------------------------------------------------------ the cache

/**
 * @param {object} o
 * @param {{get(name): Promise<ArrayBuffer|null>, put(name, buf, at): Promise<void>, delete(name): Promise<void>, list(): Promise<{name, size, at}[]>}|null} o.store
 * @param {boolean} [o.enabled]
 * @param {number} [o.maxBytes]
 * @param {(s: string) => void} [o.log]
 */
export class BootCache {
    constructor({ store = null, enabled = true, maxBytes = BOOT.MAX_BYTES, log = null, now = () => Date.now() } = {}) {
        this.store = store;
        this.enabled = !!(enabled && store);
        this.maxBytes = maxBytes;
        this.log = log;
        this.now = now;
        this.writable = true;
        this.stats = {}; // (kind → {hit, miss, bad, put, bytes, ms})
        this.why = enabled ? (store ? '' : 'нет хранилища') : 'выключен';
    }

    _s(kind) { return this.stats[kind] || (this.stats[kind] = { hit: 0, miss: 0, bad: 0, put: 0, bytes: 0, ms: 0 }); }

    /** A kept result, or null (missing / broken / off). A broken record is deleted. */
    async get(kind, key) {
        if (!this.enabled || !BOOT.KINDS.includes(kind)) return null;
        const s = this._s(kind), t = Date.now();
        try {
            const buf = await this.store.get(key);
            if (!buf) { s.miss++; return null; }
            const r = decodeRecord(buf, kind, key);
            if (!r) { s.bad++; s.miss++; this.store.delete(key).catch(() => {}); return null; }
            s.hit++; s.bytes += buf.byteLength;
            return r;
        } catch (e) { s.miss++; return null; } finally { s.ms += Date.now() - t; }
    }

    /** Keep a result (quietly nothing when off, or when a write failed before in this start). */
    async put(kind, key, meta, arrays) {
        if (!this.enabled || !this.writable || !BOOT.KINDS.includes(kind)) return false;
        try {
            const buf = encodeRecord(kind, key, meta, arrays);
            await this.store.put(key, buf, this.now());
            const s = this._s(kind); s.put++;
            return true;
        } catch (e) {
            this.writable = false; // (a full disk, read-only, a private window: not asked again this start)
            this.why = 'запись не удалась: ' + (e?.name || e?.message || e);
            this.log?.(`⚡ Кеш: ${this.why} — дальше этот запуск без записи`);
            return false;
        }
    }

    /** A tree of typed arrays (packTree) kept / read back. */
    async getTree(kind, key) {
        const r = await this.get(kind, key);
        if (!r) return null;
        const t = unpackTree(r.meta, r.arrays);
        if (!t) { this._s(kind).bad++; return null; }
        return t;
    }

    putTree(kind, key, tree) {
        const p = packTree(tree);
        return this.put(kind, key, p.json, p.arrays);
    }

    /** Over the limit: the oldest records go until it fits. @returns the bytes kept */
    async trim() {
        if (!this.enabled) return 0;
        try {
            const all = await this.store.list();
            let total = all.reduce((a, r) => a + (r.size || 0), 0);
            if (total <= this.maxBytes) return total;
            all.sort((a, b) => (a.at || 0) - (b.at || 0));
            for (const r of all) {
                if (total <= this.maxBytes * 0.8) break;
                await this.store.delete(r.name);
                total -= r.size || 0;
            }
            return total;
        } catch (e) { return 0; }
    }

    /** One line for the journal: «⚡ Кеш: звуки 120/0, тело героя 1/0 … 34 МБ прочитано, 0,4 с». */
    line() {
        if (!this.enabled) return `⚡ Кеш: ${this.why || 'выключен'}`;
        const NAMES = { sound: 'звуки', realbody: 'тело героя', realwear: 'одежда героя', icon: 'иконки' };
        const parts = [];
        let bytes = 0, ms = 0;
        for (const [k, s] of Object.entries(this.stats)) {
            parts.push(`${NAMES[k] || k} ${s.hit} из кеша / ${s.miss} заново${s.bad ? ` (${s.bad} битых)` : ''}`);
            bytes += s.bytes; ms += s.ms;
        }
        return `⚡ Кеш: ${parts.join(', ') || 'пусто'}; прочитано ${(bytes / 1048576).toFixed(1)} МБ за ${(ms / 1000).toFixed(2).replace('.', ',')} с${this.writable ? '' : '; ' + this.why}`;
    }
}

// ------------------------------------------------------------------ the browser's store (Cache Storage)

/**
 * The records in the browser's Cache Storage (on the disk of the game's own browser profile: it lives between starts).
 * One cache per build: `zns-boot-<build>`; the caches of other builds are deleted when it opens.
 */
export class CacheStore {
    constructor(build) {
        this.name = BOOT.PREFIX + build;
        this._c = null;
    }

    static available() {
        try { return typeof caches !== 'undefined' && typeof caches.open === 'function' && typeof Response !== 'undefined'; } catch (e) { return false; }
    }

    async _cache() {
        if (this._c) return this._c;
        this._c = caches.open(this.name);
        // (another build's records: never read again — gone)
        caches.keys().then((ks) => { for (const k of ks) if (k.startsWith(BOOT.PREFIX) && k !== this.name) caches.delete(k); }).catch(() => {});
        return this._c;
    }

    _url(name) { return '/__zns-boot/' + name; }

    async get(name) {
        const c = await this._cache();
        const r = await c.match(this._url(name));
        if (!r) return null;
        return r.arrayBuffer();
    }

    async put(name, buf, at) {
        const c = await this._cache();
        await c.put(this._url(name), new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'x-zns-size': String(buf.byteLength), 'x-zns-at': String(at) } }));
    }

    async delete(name) {
        const c = await this._cache();
        await c.delete(this._url(name));
    }

    async list() {
        const c = await this._cache();
        const out = [];
        for (const req of await c.keys()) {
            const r = await c.match(req);
            const name = new URL(req.url).pathname.replace('/__zns-boot/', '');
            out.push({ name, size: +(r?.headers.get('x-zns-size') || 0), at: +(r?.headers.get('x-zns-at') || 0) });
        }
        return out;
    }
}

/** «Очистить кеш»: every build's records. */
export async function clearBootCaches() {
    if (!CacheStore.available()) return 0;
    let n = 0;
    for (const k of await caches.keys()) if (k.startsWith(BOOT.PREFIX)) { await caches.delete(k); n++; }
    return n;
}

/** Is the cache on? (the settings' flag, the start's parameter) — pure: given the storage value and the page's query. */
export function bootCacheWanted(stored, query = '') {
    if (/(^|[?&])no-?cache(=|&|$)/i.test(query || '')) return false;
    return stored !== '0';
}

// ------------------------------------------------------------------ the page's one cache

/** The page's cache (off until initBootCache: the tests, a tool page, a worker never touch the disk). */
export let bootCache = new BootCache({ store: null, enabled: false });
let _init = null;

/**
 * Open the page's cache once (main.js, at the menu): the build from the server (/api/version), the settings' flag, the
 * start's parameter. Without the server's build (another server, an old one) → off: never a result of an unknown version.
 * @returns {Promise<BootCache>}
 */
export function initBootCache({ log = null } = {}) {
    if (_init) return _init;
    _init = (async () => {
        let stored = null;
        try { stored = localStorage.getItem('zns-boot-cache'); } catch (e) { /* no storage */ }
        const query = typeof location !== 'undefined' ? location.search : '';
        if (!bootCacheWanted(stored, query)) { bootCache = new BootCache({ store: null, enabled: false }); bootCache.why = 'выключен (настройки или --no-cache)'; return bootCache; }
        if (!CacheStore.available()) { bootCache = new BootCache({ store: null }); bootCache.why = 'браузер не даёт хранилище'; return bootCache; }
        let build = '';
        try {
            const r = await Promise.race([fetch('/api/version', { cache: 'no-store' }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))]);
            build = (await r.json())?.build || '';
        } catch (e) { /* no server's build */ }
        if (!/^[0-9a-f]{8,40}$/.test(build)) { bootCache = new BootCache({ store: null }); bootCache.why = 'нет версии сборки от сервера'; return bootCache; }
        bootCache = new BootCache({ store: new CacheStore(hashText(build + '|' + BOOT.FORMAT)), log });
        bootCache.build = build;
        return bootCache;
    })();
    return _init;
}

/** The cache when it is open (null before initBootCache resolved — the caller makes its result as before). */
export async function readyBootCache() {
    if (!_init) return null;
    try { const c = await _init; return c.enabled ? c : null; } catch (e) { return null; }
}
