/**
 * SpellLog.js — the spell journal: every phrase the voice heard and what came of it.
 *
 * The author: «Нужно делать подробные логи в журнале — какие заклинания я произношу». One line per
 * phrase: when, the words as heard (finished or still being said, how sure, how loud over the noise),
 * where they came from (the player's microphone / the game's own voice / the speakers), which spell
 * that is (or none) and the outcome: it worked — or why not (busy holding another spell, no mana, no
 * target, not here, talk…). Kept small (CappedLog) and written to zns-spells.log next to the game
 * (server.py /api/spelllog) — Settings → Журнал → «Заклинания», a file the player can just send.
 */

import { CappedLog } from './CappedLog.js';

export const SPELL_LOG_MAX = 600;

const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const num = (x, d = 0) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toString() : null);

/**
 * One phrase → its line (pure: tests).
 * @param {{at?: Date, text: string, isFinal?: boolean, meta?: object, source?: string, spell?: string|null,
 *          ok?: boolean, why?: string, note?: string}} e
 */
export function formatEntry(e) {
    const m = e.meta || {};
    const parts = [];
    parts.push(e.isFinal === false ? (m.settled ? 'фраза ещё идёт, но заклинание уже сказано' : 'промежуточная') : 'конец фразы');
    parts.push(m.native ? 'нейросеть на компьютере' : 'распознавание браузера');
    if (m.native) {
        if (m.sure) parts.push('узнано по звуку');
        if (Number.isFinite(m.fit)) parts.push(`запас ${m.fit >= 0 ? '+' : ''}${num(m.fit, 1)}`);
        if (m.written && m.written !== e.text) parts.push(`буквами: «${String(m.written).slice(0, 60)}»`);
        if (Number.isFinite(m.extra) && m.extra > 0) parts.push(`букв вокруг ${m.extra}`);
    }
    if (Number.isFinite(m.peak)) parts.push(`громкость ${num(m.peak)} дБ`);
    if (Number.isFinite(m.snr)) parts.push(`над шумом ${num(m.snr)} дБ${m.snr < 10 ? ' (шумно!)' : m.snr < 16 ? ' (шумновато)' : ''}`);
    else if (Number.isFinite(m.floor)) parts.push(`шум ${num(m.floor)} дБ`);
    if (m.far > 0) parts.push(`колонки звучали ${Math.round(m.far * 100)}% времени`);
    if (m.native) parts.push(m.aec ? 'звук колонок убирается из микрофона' : 'звук колонок НЕ убирается (лучше наушники)');
    if (m.src === 'aec') parts.push('читался очищенный звук');
    // whose voice: the camera saw the mouth move with it (or not), running in front of the camera
    if (m.lips === true) parts.push('губы двигались — ваш голос');
    else if (m.lips === false) parts.push('губы НЕ двигались');
    if (m.running) parts.push('на бегу');
    if (m.gameLine) parts.push(`в это время голос игры: «${String(m.gameLine).slice(0, 50)}»`);
    const src = e.source ? ` [${e.source}]` : '';
    const fast = e.ok && Number.isFinite(m.lag) ? ` за ${Math.round(m.lag)} мс после последней буквы${Number.isFinite(m.fromStart) ? ` (${Math.round(m.fromStart)} мс от начала слова)` : ''}` : '';
    const spell = e.spell ? ` → ${e.spell}` : ' → заклинания нет';
    const out = e.ok ? ` → ✅ сработало${fast}` : e.why ? ` → ❌ ${e.why}` : '';
    const note = e.note ? ` (${e.note})` : '';
    return `${clock(e.at || new Date())} 🎙️ «${String(e.text ?? '').slice(0, 120)}» (${parts.join(', ')})${src}${spell}${out}${note}`;
}

export class SpellLog {
    constructor({ send = true } = {}) {
        this.lines = new CappedLog(SPELL_LOG_MAX);
        this.send = send;
        this._sendFailed = 0;
        this._push(`=== игра началась ${new Date().toLocaleString('ru-RU')} — журнал заклинаний: что услышано и что из этого вышло`);
    }

    /** A phrase and its outcome (see formatEntry). → the line */
    add(e) {
        const line = formatEntry(e);
        this._push(line);
        return line;
    }

    /** A line of its own (the voice switched, the microphone changed…). */
    note(text) { this._push(`${clock(new Date())} ${text}`); }

    _push(line) {
        this.lines.push(line);
        if (!this.send || this._sendFailed > 3 || typeof fetch === 'undefined' || globalThis.__ZNS_NO_PERFLOG__) return;
        fetch('/api/spelllog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) })
            .then((r) => { if (!r.ok) this._sendFailed++; })
            .catch(() => { this._sendFailed++; });
    }

    /** Everything so far (Settings → Журнал, when there is no file). */
    text() { return this.lines.join('\n'); }
}
