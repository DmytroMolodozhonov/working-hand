/**
 * BrewBar.js — the brewing's bar (the author 06.11: «когда зелье варится — плашка по типу плашки маны, только выше: сколько ещё осталось времени, с цифрой, и плашка уходит назад,
 * как у зелья русалки; прогресс — по плашке, а не по подсказкам»). One bar over the mana's, for the nearest cauldron in the hero's reach:
 *   heating   — the water warms on a fire: the bar FILLS to the boil («🔥 Вода греется»);
 *   gathering — the first ingredient is in: the time to throw the rest drains («⏳ Бросьте остальные ингредиенты — 24 с»);
 *   brewing   — the potion brews: the time left drains («🫧 Зелье варится — 1:32»).
 * The state is read from the cauldron's `st` (the host's, or the same clock here on a guest — Cauldrons.update), so it shows on every computer.
 * What may go wrong: no cauldron near / the potion ready or spoiled / the hero far, dead or in another body — the bar hides; no document (tests) — nothing is made.
 */
import { ingCount } from './Potions.js';

const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} с`; };

/** What the bar shows for a brew state → {kind, k (0…1 fill), text} or null. `winMax`: the length of the gathering countdown. */
export function brewBarState(st, fire, winMax = 30) {
    if (!st) return null;
    if (st.phase === 'brewing' && st.dur > 0) {
        const left = Math.max(0, st.dur - (st.t || 0));
        return { kind: 'brew', k: Math.max(0, Math.min(1, left / st.dur)), text: `🫧 Зелье варится — осталось ${fmt(left)}` };
    }
    if (st.phase === 'water' && ingCount(st) > 0 && st.win > 0) {
        return { kind: 'win', k: Math.max(0, Math.min(1, st.win / winMax)), text: `⏳ Бросьте остальные ингредиенты — осталось ${fmt(st.win)}` };
    }
    if (st.phase === 'water' && fire && st.water >= 0.3 && (st.heat || 0) < 1 && !ingCount(st)) {
        return { kind: 'heat', k: Math.max(0, Math.min(1, st.heat || 0)), text: `🔥 Вода греется — ${Math.round((st.heat || 0) * 100)}%` };
    }
    return null;
}

export class BrewBar {
    constructor() { this.el = null; this._kind = ''; this._key = ''; }

    _make() {
        if (this.el || typeof document === 'undefined') return;
        const el = this.el = document.createElement('div');
        el.id = 'brew-bar';
        el.innerHTML = '<div class="bb-cap"></div><div class="bb-track"><div class="bb-fill"></div></div>';
        document.body.appendChild(el);
    }

    /** `s` from brewBarState, or null to hide. */
    show(s) {
        if (!s) { if (this.el && this.el.style.display !== 'none') this.el.style.display = 'none'; return; }
        this._make();
        if (!this.el) return;
        if (this.el.style.display !== 'block') this.el.style.display = 'block';
        const pct = Math.round(s.k * 100), key = s.kind + '|' + s.text + '|' + pct;
        if (key === this._key) return;
        this._key = key;
        if (s.kind !== this._kind) { this._kind = s.kind; this.el.className = 'bb-' + s.kind; }
        this.el.querySelector('.bb-cap').textContent = s.text;
        this.el.querySelector('.bb-fill').style.width = pct + '%';
    }

    dispose() { this.el?.remove(); this.el = null; }
}
