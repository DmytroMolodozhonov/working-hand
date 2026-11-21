/**
 * WorldSaveWorker.js — the autosave's heavy half, off the game's thread (the author 21.11: «мини-фризы»: the world's save every 8 s
 * took 75–110 ms in the frame — the journal's «тяжёлый кадр: система keeper»; two full copies of the world — the disk backup's
 * text and the browser database's structured clone — were made by the game thread).
 *
 * The game thread now only makes the world's text (JSON) once; here: the text goes to the disk backup (/api/worlds) and, parsed,
 * into the browser's database (the same database and store as WorldSave.js). Answer: {n, browser, disk}.
 * No imports: a plain module worker.
 */
const DB_NAME = 'zns-worlds', STORE = 'worlds';
let db = null;
function open() {
    if (db) return db;
    db = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        const timer = setTimeout(() => reject(new Error('World database open timed out')), 10000);
        req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
        req.onerror = () => { clearTimeout(timer); reject(req.error); };
        req.onblocked = () => { clearTimeout(timer); reject(new Error('World database is blocked')); };
    });
    db.catch(() => { db = null; });
    return db;
}
const putBrowser = (obj) => open().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(obj);
    const timer = setTimeout(() => { try { t.abort(); } catch (e) { /* */ } reject(new Error('World transaction timed out')); }, 10000);
    t.oncomplete = () => { clearTimeout(timer); resolve(true); };
    t.onerror = t.onabort = () => { clearTimeout(timer); reject(t.error || new Error('World transaction aborted')); };
}));
const putDisk = async (json, disk) => {
    if (!disk) return null;
    const r = await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('World backup HTTP ' + r.status);
    return true;
};

self.onmessage = async (e) => {
    const { n, json, disk } = e.data || {};
    let obj = null;
    try { obj = JSON.parse(json); } catch (err) { self.postMessage({ n, browser: false, disk: false, error: 'bad json' }); return; }
    const [b, d] = await Promise.allSettled([putBrowser(obj), putDisk(json, disk)]);
    self.postMessage({ n, browser: b.status === 'fulfilled', disk: disk ? d.status === 'fulfilled' : null, error: [b.reason, d.reason].filter(Boolean).map((x) => String(x?.message || x)).join('; ') || undefined });
};
