/**
 * AllLog.js — «Общие логи»: ONE journal with every tag together, by time (performance, spells, voice,
 * villagers, hands, items, network, errors…). Settings → Журнал → «Общие логи» shows it with tag
 * filters, a search and «copy everything / the last 5 minutes / save to a file».
 *
 * The other journals keep working as they were (their own files); each of them also drops its line
 * here (`allLog(tag, text)`). Memory is capped (CappedLog); the file zns-all.log is written in batches
 * every few seconds (server.py /api/alllog, trimmed there to the last ~20 MB), never in the frame.
 * Sound and words of the voice are NOT written here beyond what the spell journal already writes.
 */

import { CappedLog } from './CappedLog.js';

export const ALL_LOG = {
    MAX: 6000, // entries kept in memory
    LINE: 1200, // chars of one entry
    FLUSH_MS: 3000, // the file is written in batches this often
    BATCH_MAX: 400, // lines of one batch (the rest waits for the next)
    PENDING_MAX: 3000, // lines waiting for a server that does not answer: the oldest are dropped
    FAIL_MAX: 4, // so many failed sends in a row: stop sending (the memory journal stays)
    SAME_MS: 1500, // the very same line from the same tag within this time is written once («×N»)
    RECENT_MS: 5 * 60 * 1000, // «the last 5 minutes»
};

export const TAGS = ['Производительность', 'Заклинания', 'Голос', 'Жители', 'Руки', 'Предметы', 'Сеть', 'Удары', 'Ошибки', 'Игра'];
export const LEVELS = { info: 0, warn: 1, error: 2 };

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const clockOf = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`; };

/** error / warn / info by the words of the line (the old journals carry no level). */
export function guessLevel(text) {
    const s = String(text);
    if (/❌|🛑|\b(error|exception|failed|uncaught)\b|ошибк|не удалось|сбой|упал[аио]? /i.test(s)) return 'error';
    if (/⚠|рывки:|не выпал|не засчитан|отказ|потерян|пропал[аио]? кисть|залип|предупрежд|медленн|задержк/i.test(s)) return 'warn';
    return 'info';
}

/** One entry → its line of text (the same for the screen, the clipboard and the file). */
export function formatEntry(e) {
    const mark = e.level === 'error' ? '‼' : e.level === 'warn' ? '⚠' : '·';
    return `${clockOf(e.t)} ${mark} [${e.tag}] ${e.text}${e.n > 1 ? ` (×${e.n})` : ''}`;
}

export class AllLog {
    constructor({ max = ALL_LOG.MAX, send = false, now = () => Date.now() } = {}) {
        this.items = new CappedLog(max);
        this.send = send;
        this._now = now;
        this.pending = [];
        this._fails = 0;
        this._timer = null;
        this._last = null;
    }

    /** → the entry (or the earlier same one, when it repeats at once). */
    add(tag, text, level = null) {
        const t = this._now();
        const body = String(text ?? '').replace(/[\r\n]+/g, ' ').slice(0, ALL_LOG.LINE);
        if (!body) return null;
        const last = this._last;
        if (last && last.tag === tag && last.text === body && t - last.t < ALL_LOG.SAME_MS) {
            last.n++;
            return last;
        }
        const e = { t, tag: String(tag || 'Игра'), level: level || guessLevel(body), text: body, n: 1 };
        this._last = e;
        this.items.push(e);
        if (this.send) this._queue(e);
        return e;
    }

    /**
     * Entries by the filters: `tags` (a Set/array; none = all), `text` (case-insensitive), `sinceMs` (the last N ms),
     * `minLevel` ('info'|'warn'|'error'). In time order.
     */
    query({ tags = null, text = '', sinceMs = 0, minLevel = 'info' } = {}) {
        const set = tags ? new Set(tags) : null;
        const q = String(text || '').trim().toLowerCase();
        const from = sinceMs > 0 ? this._now() - sinceMs : 0;
        const lv = LEVELS[minLevel] ?? 0;
        return this.items.filter((e) => (!set || set.has(e.tag)) && e.t >= from && (LEVELS[e.level] ?? 0) >= lv
            && (!q || e.text.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q)));
    }

    textOf(list = this.items) { return list.map(formatEntry).join('\n'); }

    tagsSeen() { return [...new Set([...TAGS, ...this.items.map((e) => e.tag)])]; }

    // ---- the file: batches, never one request per line
    _queue(e) {
        this.pending.push(formatEntry(e));
        if (this.pending.length > ALL_LOG.PENDING_MAX) this.pending.splice(0, this.pending.length - ALL_LOG.PENDING_MAX);
        if (!this._timer && typeof setTimeout === 'function') {
            this._timer = setTimeout(() => { this._timer = null; this.flush(); }, ALL_LOG.FLUSH_MS);
        }
    }

    /** Take the next batch (tests, and the sending). */
    drain() { return this.pending.splice(0, ALL_LOG.BATCH_MAX); }

    flush({ beacon = false } = {}) {
        if (!this.pending.length || this._fails > ALL_LOG.FAIL_MAX || typeof fetch === 'undefined' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
        const lines = this.drain();
        const body = JSON.stringify({ lines });
        try {
            if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
                navigator.sendBeacon('/api/alllog', new Blob([body], { type: 'application/json' }));
            } else {
                fetch('/api/alllog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
                    .then((r) => { if (r.ok) this._fails = 0; else this._fails++; })
                    .catch(() => { this._fails++; });
            }
        } catch (_) { this._fails++; }
        if (this.pending.length && !this._timer && typeof setTimeout === 'function') {
            this._timer = setTimeout(() => { this._timer = null; this.flush(); }, ALL_LOG.FLUSH_MS);
        }
    }
}

/** The game's one journal. In the unit tests nothing is sent (no page). */
export const ALL = new AllLog({ send: typeof window !== 'undefined' && !globalThis.__ZNS_NO_PERFLOG__ });

/** A line into «Общие логи». Cheap; call it on changes, not every frame. */
export function allLog(tag, text, level = null) {
    try { return ALL.add(tag, text, level); } catch (_) { return null; }
}

let _hooked = false;
/** Errors of the page and the end of the page (the last batch goes out with the beacon). Once. */
export function hookAllLog() {
    if (_hooked || typeof window === 'undefined') return;
    _hooked = true;
    let n = 0, windowStart = 0;
    const err = (text) => {
        const now = Date.now();
        if (now - windowStart > 1000) { windowStart = now; n = 0; }
        if (++n <= 3) allLog('Ошибки', text, 'error'); // (an error in every frame is 3 lines a second, not 60)
    };
    window.addEventListener('error', (ev) => err(`${ev.message || 'ошибка'}${ev.filename ? ` (${String(ev.filename).split('/').slice(-2).join('/')}:${ev.lineno})` : ''}`));
    window.addEventListener('unhandledrejection', (ev) => err(`необработанный отказ: ${String(ev.reason?.message || ev.reason).slice(0, 300)}`));
    window.addEventListener('pagehide', () => ALL.flush({ beacon: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ALL.flush({ beacon: true }); });
}
