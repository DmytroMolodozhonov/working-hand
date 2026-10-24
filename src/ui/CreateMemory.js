/**
 * CreateMemory.js — окно «Создать мир» помнит, что игрок выбрал в прошлый раз, ОТДЕЛЬНО для каждого режима
 * (Творческий, Выживание, Свободный мир, Карты): настройки героя Творческого, «Гладкий мир», последняя карта.
 * Хранится в кэше браузера (localStorage); если кэш недоступен — просто не запоминается.
 */
const KEY = 'zns-create-';
const LAST = 'zns-create-last';

export class CreateMemory {
    constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) { this.s = storage; }

    /** Что запомнено для режима (`null` — ничего). */
    load(mode) {
        try { const v = JSON.parse(this.s?.getItem(KEY + mode) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
    }

    /** Слить новые значения с запомненными для режима. */
    save(mode, patch) {
        try { this.s?.setItem(KEY + mode, JSON.stringify({ ...(this.load(mode) || {}), ...patch })); } catch (e) { /* (private mode: just not remembered) */ }
    }

    /** Какой режим выбран был последним (из `allowed`). */
    lastMode(allowed) {
        try { const m = this.s?.getItem(LAST); return allowed.includes(m) ? m : null; } catch (e) { return null; }
    }

    setLastMode(mode) { try { this.s?.setItem(LAST, mode); } catch (e) { /* not remembered */ } }
}
