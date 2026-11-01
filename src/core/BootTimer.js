/**
 * BootTimer.js — where the seconds of a start go (the author: «очень детально проработай систему БЫСТРОЙ ЗАГРУЗКИ»).
 *
 * The path «программа → меню → вход в мир → первый кадр → можно играть» is split into stages; each stage says how long it
 * took (wall clock, from performance.now()). Stages may overlap (things started in parallel): `begin(name)` / `end(name)`,
 * or `span(name, promise)`. One line goes to the journal at the end («⏱ загрузка: …»), and window.__zns.boot keeps the table
 * (tools/entrybench.mjs prints it). Pure logic: no THREE, no DOM (tested in node).
 */

export class BootTimer {
    constructor(now = () => performance.now()) {
        this.now = now;
        this.t0 = now();
        this.open = new Map(); // (name → start)
        this.rows = []; // ({name, at, ms})
        this.notes = [];
    }

    /** Restart the clock (a new entry into a world: the table of the last one is forgotten). */
    reset() { this.t0 = this.now(); this.open.clear(); this.rows.length = 0; this.notes.length = 0; }

    begin(name) { this.open.set(name, this.now()); }

    end(name) {
        const s = this.open.get(name);
        if (s == null) return 0;
        this.open.delete(name);
        const ms = this.now() - s;
        this.rows.push({ name, at: s - this.t0, ms });
        return ms;
    }

    /** Time a promise (or an async function) as a stage; the value is passed through, errors too. */
    async span(name, p) {
        this.begin(name);
        try { return await (typeof p === 'function' ? p() : p); } finally { this.end(name); }
    }

    /** A stage measured elsewhere (e.g. from the page's start to the menu). */
    add(name, ms, at = 0) { this.rows.push({ name, at, ms }); }

    note(text) { if (this.notes.length < 20) this.notes.push(String(text)); }

    total() { return this.now() - this.t0; }

    /** One line for the journal: «⏱ загрузка 12,3 с: звуки 1,2 · мир 3,4 · …». */
    line(title = 'загрузка') {
        const f = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
        // (short enough not to be cut in the console: the stages in the order they began, only those of 0,3 s and more;
        // «∥» — went on at the same time as the others; the inner steps «· …» are left out — their sum is their stage)
        const parts = this.rows.filter((r) => r.ms >= 300 && !r.name.startsWith('·')).sort((a, b) => a.at - b.at)
            .map((r) => `${r.name.replace(' (параллельно)', '∥').replace(/ \(.*\)$/, '')} ${f(r.ms)}`);
        return `⏱ ${title} ${f(this.total())} с: ${parts.join(' · ')}${this.notes.length ? ' | ' + this.notes.join('; ') : ''}`;
    }

    table() { return { total: this.total(), rows: this.rows.map((r) => ({ ...r })), notes: [...this.notes] }; }
}

/** The one timer of the page (main.js and Game share it). */
export const bootTimer = new BootTimer();
