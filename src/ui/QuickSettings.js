/**
 * QuickSettings.js — «Быстрые настройки» in the pause menu (Escape in the game).
 *
 * The author: the camera smoothness, the sensitivity, the minimap's size, the slots' size and the hand version can be
 * changed right in the game. They are the SAME settings as in the main menu («Настройки»): one place for the value —
 * the settings' controls (also remembered in 'zns-settings' by main.js) — so a change here is seen there and back, applies at
 * once and is kept. Everyone has their own (nothing goes over the network).
 *
 * The pure part (the table, the limits, the reset, the store rules) has no page in it — tests/unit/settings-sync.test.js.
 */

/** The sliders: id of the settings' control, limits, the usual value, words for the player. */
export const QUICK = [
    { id: 'cam-smooth', label: 'Плавность камеры', min: 0, max: 95, step: 5, def: 70, unit: '%', hint: 'Чем больше, тем мягче и медленнее камера следует за вашими движениями.' },
    { id: 'cam-sens', label: 'Чувствительность', min: 10, max: 100, step: 5, def: 100, unit: '%', hint: 'Чем больше, тем сильнее поворачивается камера от ваших движений.' },
    { id: 'minimap-size', label: 'Размер мини-карты', min: 60, max: 200, step: 10, def: 120, unit: '%', hint: 'Мини-карта в углу экрана.', preview: 'map' },
    { id: 'hotbar-size', label: 'Размер панели предметов', min: 70, max: 160, step: 10, def: 100, unit: '%', hint: 'Ячейки с вещами внизу экрана.', preview: 'bar' },
];
/** The hand versions, in plain words (the value is what the settings' radio buttons carry). */
export const HAND_VERSIONS = [
    { v: 'v2', name: 'V2 — точная' },
    { v: 'v3', name: 'V3 — стабильная' },
    { v: 'v4', name: 'V4 — новая, каждый сустав' },
    { v: 'v5', name: 'V5 — новая, крупный план (видеокарта)' },
];
export const HAND_DEFAULT = 'v3';
export const HAND_WHY_OFF = 'Камера выключена — кисти рук сейчас не распознаются.';

export const quickDef = (id) => QUICK.find((q) => q.id === id) || null;

/** A value kept inside the limits and on the step; junk → the usual value. */
export function quickClamp(id, v) {
    const q = quickDef(id);
    if (!q) return v;
    let n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return q.def;
    n = Math.max(q.min, Math.min(q.max, n));
    n = Math.round((n - q.min) / q.step) * q.step + q.min;
    return Math.max(q.min, Math.min(q.max, n));
}
export const quickIsDefault = (id, v) => quickClamp(id, v) === quickDef(id)?.def;
export const quickText = (id, v) => `${quickClamp(id, v)}${quickDef(id)?.unit || ''}`;
/** The hand version to show: a known one, or the usual. */
export const handClamp = (v) => (HAND_VERSIONS.some((h) => h.v === v) ? v : HAND_DEFAULT);

/**
 * The rules over a store { get(id), set(id, value) } — in the game the store is the settings' controls.
 * set() applies at once (the control's own event) and is kept by the saving of the settings.
 */
export function quickSet(store, id, v) {
    const n = quickClamp(id, v);
    store.set(id, n);
    return n;
}
export const quickReset = (store, id) => quickSet(store, id, quickDef(id).def);
export const quickGet = (store, id) => quickClamp(id, store.get(id));
/** Values from the saved settings (JSON of 'zns-settings') → clamped, so an old or broken record never goes out of the screen. */
export function quickFromSaved(saved) {
    const out = {};
    for (const q of QUICK) out[q.id] = quickClamp(q.id, saved?.[q.id] ?? q.def);
    out.handVersion = handClamp(saved?.handVersion);
    return out;
}
/** Preview size (0–1 of the box) for a slider's value: the little mock-up next to it. */
export const previewScale = (id, v) => {
    const q = quickDef(id);
    return q ? Math.max(0.2, Math.min(1, quickClamp(id, v) / q.max)) : 1;
};

/**
 * Builds the block in `box`. `ctx`: { handOn(): is the camera working, handsNow(): the version now, setHands(v): apply it }.
 * Returns { sync } — call it when the pause menu opens (and it follows the main menu's controls).
 */
export function setupQuickSettings(box, ctx, doc = document) {
    const store = {
        get: (id) => doc.getElementById(id)?.value,
        set: (id, v) => { const el = doc.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); },
    };
    box.innerHTML = '';
    const title = doc.createElement('div');
    title.className = 'pause-quick-title';
    title.textContent = 'Быстрые настройки';
    box.appendChild(title);
    const stop = (el) => el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); }); // (keys on a control must not reach the game)
    const rows = [];
    for (const q of QUICK) {
        if (!doc.getElementById(q.id)) continue;
        const row = doc.createElement('div'); row.className = 'pause-audio-row';
        const lab = doc.createElement('label'); lab.className = 'pause-audio-label'; lab.textContent = q.label;
        const line = doc.createElement('div'); line.className = 'pause-audio-ctl';
        const ctl = doc.createElement('input'); ctl.type = 'range'; ctl.min = q.min; ctl.max = q.max; ctl.step = q.step; ctl.id = 'pause-quick-' + q.id;
        lab.htmlFor = ctl.id;
        const val = doc.createElement('span'); val.className = 'pause-audio-val';
        const reset = doc.createElement('button'); reset.type = 'button'; reset.className = 'pause-quick-reset'; reset.textContent = 'Сбросить'; reset.title = `Вернуть ${q.def}${q.unit}`;
        let prev = null;
        if (q.preview) { prev = doc.createElement('span'); prev.className = 'pause-quick-prev pause-quick-prev-' + q.preview; prev.appendChild(doc.createElement('i')); }
        const paint = () => {
            const v = quickGet(store, q.id);
            ctl.value = String(v); val.textContent = quickText(q.id, v); reset.disabled = quickIsDefault(q.id, v);
            if (prev) prev.firstChild.style.transform = `scale(${previewScale(q.id, v)})`;
        };
        ctl.addEventListener('input', () => { quickSet(store, q.id, ctl.value); paint(); });
        reset.addEventListener('click', () => { quickReset(store, q.id); paint(); });
        stop(ctl); stop(reset);
        line.append(...[prev, ctl, val, reset].filter(Boolean));
        const hint = doc.createElement('div'); hint.className = 'pause-audio-hint'; hint.textContent = q.hint;
        row.append(lab, line, hint); box.appendChild(row);
        rows.push(paint);
    }
    // the hand version: choose, then «Применить» (the camera program may be reopened for V4/V5) — no leaving the world
    const hrow = doc.createElement('div'); hrow.className = 'pause-audio-row';
    const hlab = doc.createElement('label'); hlab.className = 'pause-audio-label'; hlab.textContent = 'Версия кистей рук';
    const hline = doc.createElement('div'); hline.className = 'pause-audio-ctl pause-radios';
    const radios = {};
    for (const h of HAND_VERSIONS) {
        const l = doc.createElement('label'); const r = doc.createElement('input');
        r.type = 'radio'; r.name = 'pause-quick-hand'; r.value = h.v; stop(r);
        r.addEventListener('change', () => paintHands());
        l.append(r, h.name); hline.appendChild(l); radios[h.v] = r;
    }
    const apply = doc.createElement('button'); apply.type = 'button'; apply.className = 'pause-quick-apply'; apply.textContent = 'Применить'; stop(apply);
    const reset = doc.createElement('button'); reset.type = 'button'; reset.className = 'pause-quick-reset'; reset.textContent = 'Сбросить'; reset.title = 'Вернуть V3'; stop(reset);
    const btns = doc.createElement('div'); btns.className = 'pause-audio-ctl'; btns.append(apply, reset);
    const hhint = doc.createElement('div'); hhint.className = 'pause-audio-hint';
    hrow.append(hlab, hline, btns, hhint); box.appendChild(hrow);
    const picked = () => Object.keys(radios).find((v) => radios[v].checked) || handClamp(ctx.handsNow());
    function paintHands() {
        const on = !!ctx.handOn(), now = handClamp(ctx.handsNow()), pick = picked();
        for (const v in radios) radios[v].disabled = !on;
        apply.disabled = !on || pick === now;
        reset.disabled = !on || now === HAND_DEFAULT;
        hhint.textContent = !on ? HAND_WHY_OFF : (pick !== now ? 'Нажмите «Применить» — программа камеры перезапустится, из мира выходить не нужно.' : '');
    }
    const choose = (v) => { for (const k in radios) radios[k].checked = k === v; };
    apply.addEventListener('click', () => { ctx.setHands(picked()); choose(handClamp(ctx.handsNow())); paintHands(); });
    reset.addEventListener('click', () => { ctx.setHands(HAND_DEFAULT); choose(HAND_DEFAULT); paintHands(); });
    // the hero's model: the standard one or the detailed one (RealisticBody) — at once, as in «Настройки»
    const mrow = doc.createElement('div'); mrow.className = 'pause-audio-row';
    const mlab = doc.createElement('label'); mlab.className = 'pause-audio-label'; mlab.textContent = 'Модель героя';
    const mline = doc.createElement('div'); mline.className = 'pause-audio-ctl pause-radios';
    const mradios = {};
    for (const [v, name] of [['std', 'Стандартная'], ['real', 'Детальная']]) {
        const l = doc.createElement('label'); const r = doc.createElement('input');
        r.type = 'radio'; r.name = 'pause-quick-model'; r.value = v; stop(r);
        r.addEventListener('change', () => { if (r.checked) ctx.setHero?.(v); });
        l.append(r, name); mline.appendChild(l); mradios[v] = r;
    }
    const mhint = doc.createElement('div'); mhint.className = 'pause-audio-hint';
    mhint.textContent = 'Детальная — тот же герой, но гибкий, как человек: гнётся в спине, шее, локтях и коленях, лицо повторяет вашу мимику.';
    if (ctx.heroNow) { mrow.append(mlab, mline, mhint); box.appendChild(mrow); }
    const paintModel = () => { const now = ctx.heroNow?.() === 'real' ? 'real' : 'std'; for (const k in mradios) mradios[k].checked = k === now; };
    const sync = () => { for (const p of rows) p(); choose(handClamp(ctx.handsNow())); paintHands(); paintModel(); };
    sync();
    return { sync };
}
