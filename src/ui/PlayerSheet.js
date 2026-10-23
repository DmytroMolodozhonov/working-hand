/**
 * PlayerSheet.js — the «🧙 Игрок» tab of the pause menu: who the hero is and what they have (nothing here is invented:
 * a row appears only when the game really has the value).
 *
 *  - The PURE part (no DOM, no THREE — node-testable): `FIELDS` is the table of rows, one line each (section, getter that
 *    returns `{label, value, icon, bar?, tip?}` or null — then the row is not shown). A new thing of the hero
 *    (pentagrams, a mark of broken protection…) is ONE more line in the table. `buildSheet(g, ctx)` → sections.
 *    A missing module (`g.pentagrams`, `g.dark`…) never breaks it: the getter returns null.
 *  - The DOM part (`PlayerSheetView`): cards with icons, a tooltip over a piece of armour / a thing in the hand, and the
 *    3D preview of the hero in a small canvas (own renderer, drawn ONLY while the tab is open; data refreshed on open and
 *    every 0.5 s, only while open).
 */

import { regenCellsK, regenTier, REGEN_PER_100 } from '../game/ManaRegen.js';
import { darkStage } from '../game/DarkMagic.js';
import { ACHIEVEMENTS, ACH_IDS, achBonus } from '../game/Achievements.js';
import { armorName, describeArmor, wornCode, pieceMax } from '../game/ArmorTypes.js';
import { describeEnchant } from '../game/Enchant.js';
import { PENTAGRAMS } from '../game/Pentagrams.js';

const MODE_RU = { creative: '🛠 Творческий', survival: '🌙 Выживание', freeworld: '⚔️ Свободный мир', test: '🧪 Полигон' };
const STAGE_RU = { clean: 'нет', hidden: 'не заметна', scorned: 'презираемый', outcast: 'изгнанник' };
const SLOT_RU = { helmet: 'Шлем', chest: 'Нагрудник', legs: 'Поножи', robe: 'Мантия' };
const SLOTS = ['helmet', 'chest', 'legs', 'robe'];
const HELD_RU = { wand: 'Палочка', weapon: 'Оружие', sword: 'Меч', axe: 'Топор', bow: 'Лук', hammer: 'Молот', shield: 'Щит' };

const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const fmt = (x) => String(Math.round(num(x) * 10) / 10).replace('.', ',');
const manaMax = (g) => (g.combat ? g.combat.maxFatigue || g.combat.fatigue || 0 : null); // (the maximum is set once it grows; before — the start mana)
const row = (label, value, extra = {}) => ({ label, value, ...extra });

/** Sections in order (id → title, icon). */
export const SECTIONS = [
    { id: 'life', title: 'Здоровье и мана', icon: '❤️' },
    { id: 'skills', title: 'Умения', icon: '🏃' },
    { id: 'dark', title: 'Чёрная магия', icon: '🜏' },
    { id: 'magic', title: 'Заклинания', icon: '✨' },
    { id: 'armor', title: 'Броня и руки', icon: '🛡' },
    { id: 'bag', title: 'Вещи и мир', icon: '🎒' },
    { id: 'effects', title: 'Сейчас на мне', icon: '💫' },
];

/** The table of rows. get(g, ctx) → row | null | [rows]. ctx: { spells: [names of spells with cards], armorOnly } */
export const FIELDS = [
    { id: 'hp', section: 'life', get: (g) => g.combat && row('Здоровье', `${fmt(g.combat.hp)} / ${fmt(g.combat.maxHp || 20)}`, { icon: '❤️', bar: [g.combat.hp, g.combat.maxHp || 20, '#e74c3c'] }) },
    { id: 'mana', section: 'life', get: (g) => {
        const c = g.combat; if (!c) return null;
        const max = manaMax(g);
        return row('Мана', `${fmt(c.fatigue)} / ${fmt(max)}`, { icon: '🔷', bar: [c.fatigue, max, '#4aa3ff'] });
    } },
    { id: 'cells', section: 'life', get: (g) => manaMax(g) != null ? row('Ячейки маны', fmt(manaMax(g)), { icon: '🔹', tip: 'Максимум маны: сколько можно накопить' }) : null },
    { id: 'regen', section: 'life', get: (g) => {
        const max = manaMax(g); if (max == null) return null;
        const tier = regenTier(max), ach = g.achievements?.regenK || 1;
        const k = regenCellsK(max) * ach;
        return row('Восстановление маны', `×${fmt(k)}`, { icon: '♻️', tip: `+${Math.round(REGEN_PER_100 * 100)}% за каждые 100 ячеек (ступень ${tier})${ach > 1 ? `, ачивки ×${fmt(ach)}` : ''}` });
    } },
    { id: 'tier', section: 'life', get: (g) => manaMax(g) != null ? row('Ступень силы', String(regenTier(manaMax(g))), { icon: '🪜' }) : null },

    { id: 'steady', section: 'skills', get: (g) => g.steady ? row('Устойчивость', `${g.steady.effective} / 100`, { icon: '⚖️', bar: [g.steady.effective, 100, '#c9a35a'], tip: 'Шанс устоять на ногах от сбивающих заклинаний' }) : null },
    { id: 'runbook', section: 'skills', get: (g) => { const b = num(g.character?.runBonus, 1); return b > 1.001 ? row('Бег с книгой', `+${Math.round((b - 1) * 100)}% скорости`, { icon: '📗' }) : null; } },
    { id: 'ach', section: 'skills', get: (g) => {
        const a = g.achievements; if (!a || a.off) return null;
        const bonus = achBonus(a.done);
        return row('Ачивки', `${a.done.size} / ${ACH_IDS.length}`, { icon: '🏆', tip: `Ячейки маны от ачивок: +${bonus.mana}`, chips: ACHIEVEMENTS.map((x) => ({ icon: x.icon, title: x.title, on: a.done.has(x.id) })) });
    } },
    { id: 'high', section: 'skills', get: (g) => g.achievements?.high ? row('Статус', 'Высший маг', { icon: '🌟' }) : null },

    { id: 'darkLevel', section: 'dark', get: (g) => (g.dark && g.dark.level > 0) ? row('Уровень чёрного мага', `${g.dark.level} / 100`, { icon: '🜏', bar: [g.dark.level, 100, '#8a5bd1'] }) : null },
    { id: 'darkSkin', section: 'dark', get: (g) => (g.dark && g.dark.skin > 0) ? row('Потемнение кожи', `${g.dark.skin} / 100`, { icon: '🩶' }) : null },
    { id: 'darkStage', section: 'dark', get: (g) => (g.dark && g.dark.skin > 0) ? row('Как видят волшебники', STAGE_RU[darkStage(g.dark.skin)] || '', { icon: '👁' }) : null },

    { id: 'spells', section: 'magic', get: (g, ctx) => {
        const names = ctx?.spells; if (!names || !g.canSaySpell) return null;
        const n = names.filter((s) => g.canSaySpell(s)).length;
        return row('Выучено заклинаний', `${n} / ${names.length}`, { icon: '📖', link: 'codex', tip: 'Все они — в «Справочнике»' });
    } },
    { id: 'flightMax', section: 'magic', get: (g) => g.knowsSpell && g.knowsSpell('FlyingMaxima') ? row('Дар богов', 'Flying Maxima — полёт в космос', { icon: '🪽' }) : null },
    { id: 'gmp', section: 'magic', get: (g) => g.bonus?.spells?.GiveMyPower ? row('Дар', 'Give Me My Power — забрать свою силу', { icon: '💀' }) : null },
    { id: 'pentagrams', section: 'magic', get: (g) => {
        // the drawings the hero knows: a burnt scroll (bonus.spells[scroll]); the break-ward one has its own flag; Creative — all
        const list = Object.values(PENTAGRAMS).filter((d) => g.config?.mode === 'creative' || g.bonus?.spells?.[d.scroll] || g.pentagranium?.seen?.has(d.id) || (d.id === 'breakward' && g.breakward?.known)).map((d) => d.title);
        return list.length ? row('Пентаграммы', list.join(', '), { icon: '⛧', tip: 'Выученные рисунки' }) : null;
    } },
    { id: 'breakMark', section: 'dark', get: (g) => g.breakward?.marked ? row('Метка слома защиты', 'на теле до смерти', { icon: '⛧' }) : null },

    ...SLOTS.map((slot) => ({ id: 'worn-' + slot, section: 'armor', get: (g) => {
        const it = g.armor?.worn?.[slot]; if (!it) return null;
        const hp = it.kind === 'armor' ? `${Math.round(it.hp ?? pieceMax(it))} / ${pieceMax(it)}` : (it.magic ? 'волшебная' : 'обычная');
        return row(SLOT_RU[slot], armorName(it), { icon: slot === 'helmet' ? '🪖' : slot === 'chest' ? '🛡' : slot === 'legs' ? '🦵' : '🧥', value2: hp, item: it, itemType: 'armor', ench: !!it.ench });
    } })),
    { id: 'held', section: 'armor', get: (g) => {
        const out = [];
        for (const side of ['right', 'left']) {
            const it = g.items?.held?.[side]?.item; if (!it) continue;
            out.push(row(side === 'right' ? 'В правой руке' : 'В левой руке', HELD_RU[it.kind] || it.kind, { icon: '✋', item: it, itemType: 'held', ench: !!it.ench }));
        }
        return out;
    } },

    { id: 'coins', section: 'bag', get: (g) => g.inventory?.coins ? row('Монеты', String(g.inventory.coins()), { icon: '🪙' }) : null },
    { id: 'mode', section: 'bag', get: (g) => g.config?.mode ? row('Режим', MODE_RU[g.config.mode] || g.config.mode, { icon: '🌍' }) : null },
    { id: 'time', section: 'bag', get: (g) => {
        if (!g.dayCycle || !g.dayPhase) return null;
        const p = g.dayPhase(), hour = Math.floor(((p * 24) + 6) % 24), min = Math.floor((p * 24 * 60) % 60);
        return row('Время суток', `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} · ${p < 0.75 ? 'день' : 'ночь'}`, { icon: p < 0.75 ? '☀️' : '🌙' });
    } },
    { id: 'where', section: 'bag', get: (g) => { const p = g.character?.group?.position; return p ? row('Где я', `${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`, { icon: '📍' }) : null; } },

    { id: 'fx-frozen', section: 'effects', get: (g) => g.combat?.frozenLeft > 0 ? row('Заморозка', `${fmt(g.combat.frozenLeft)} с`, { icon: '🧊' }) : null },
    { id: 'fx-slow', section: 'effects', get: (g) => g.combat?.slowLeft > 0 ? row('Замедление', `${fmt(g.combat.slowLeft)} с`, { icon: '🐌' }) : null },
    { id: 'fx-stun', section: 'effects', get: (g) => g.combat?.stunLeft > 0 ? row('Оглушение', `${fmt(g.combat.stunLeft)} с`, { icon: '💫' }) : null },
    { id: 'fx-burn', section: 'effects', get: (g) => g.burning?.me?.left > 0 ? row('Горение', `${fmt(g.burning.me.left)} с`, { icon: '🔥' }) : null },
    { id: 'fx-imperius', section: 'effects', get: (g) => g.imperius?.active ? row('Под Империусом', 'ваш разум в другом теле', { icon: '👁' }) : null },
];

/** Sections with rows (empty ones dropped). */
export function buildSheet(g, ctx = {}) {
    const by = new Map(SECTIONS.map((s) => [s.id, { ...s, rows: [] }]));
    for (const f of FIELDS) {
        let r = null;
        try { r = f.get(g || {}, ctx); } catch (e) { r = null; } // (a half-built module never breaks the sheet)
        for (const x of [].concat(r || []).filter(Boolean)) by.get(f.section).rows.push({ id: f.id, ...x });
    }
    return [...by.values()].filter((s) => s.rows.length);
}

/** The hero's name (the nickname of the made hero). */
export const heroName = (g, fallback = 'Герой') => String(g?.net?.name || g?.config?.name || fallback);

/** The tooltip text of a thing: [title, lines…] (HTML), or null. */
export function itemTip(r) {
    const it = r?.item; if (!it) return null;
    const lines = [];
    let title;
    if (r.itemType === 'armor') {
        const d = describeArmor(it);
        title = d.title; lines.push(...d.lines);
        if (it.kind === 'armor') lines.unshift(`Защита: <b>${Math.round(it.hp ?? pieceMax(it))}</b> из ${pieceMax(it)}`);
    } else {
        title = HELD_RU[it.kind] || it.kind;
        if (it.magic) lines.push('Волшебная вещь');
    }
    const e = describeEnchant(it);
    if (e) { lines.push(`<span style="color:#${(e.color >>> 0).toString(16).padStart(6, '0')}">${e.title}</span>`, ...e.lines.filter(Boolean)); }
    return { title, lines };
}

export { wornCode };

// ================================================================== DOM part
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class PlayerSheetView {
    /** @param {HTMLElement} root  @param {() => any} getGame  @param {{ spells?: string[], look?: () => any, openCodex?: () => void, makeCharacter?: Function }} opts */
    constructor(root, getGame, opts = {}) {
        this.root = root; this.getGame = getGame; this.opts = opts;
        this.open = false; this._timer = null; this._raf = null; this._key = '';
    }

    show() {
        this.open = true;
        if (!this._built) this._build();
        this.refresh(true);
        clearInterval(this._timer);
        this._timer = setInterval(() => this.refresh(), 500);
        this._startPreview();
    }

    hide() {
        this.open = false;
        clearInterval(this._timer); this._timer = null;
        this._stopPreview();
    }

    _build() {
        this._built = true;
        this.root.innerHTML = `
            <div class="ps-layout">
                <div class="ps-hero">
                    <canvas class="ps-canvas" width="240" height="340"></canvas>
                    <div class="ps-name"></div>
                    <div class="ps-sub"></div>
                </div>
                <div class="ps-cards"></div>
            </div>
            <div class="ps-tip hidden"></div>`;
        this.canvas = this.root.querySelector('.ps-canvas');
        this.cards = this.root.querySelector('.ps-cards');
        this.tip = this.root.querySelector('.ps-tip');
        this.yaw = Math.PI - 0.5;
        let drag = null;
        this.canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
        this.canvas.addEventListener('pointermove', (e) => { if (drag != null) { this.yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
        this.canvas.addEventListener('pointerup', () => { drag = null; });
        this.cards.addEventListener('pointermove', (e) => this._hover(e));
        this.cards.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
        this.cards.addEventListener('click', (e) => { if (e.target.closest('[data-ps-link="codex"]')) this.opts.openCodex?.(); });
    }

    _hover(e) {
        const el = e.target.closest('[data-ps-tip]');
        if (!el) { this.tip.classList.add('hidden'); return; }
        const t = this._tips?.[+el.dataset.psTip];
        if (!t) { this.tip.classList.add('hidden'); return; }
        this.tip.innerHTML = `<b>${t.title}</b>${t.lines.map((l) => `<div>${l}</div>`).join('')}`;
        const box = this.root.getBoundingClientRect();
        this.tip.style.left = Math.min(box.width - 260, Math.max(4, e.clientX - box.left + 14)) + 'px';
        this.tip.style.top = Math.max(4, e.clientY - box.top + 14) + 'px';
        this.tip.classList.remove('hidden');
    }

    refresh(force = false) {
        const g = this.getGame(); if (!g || !this._built) return;
        const sections = buildSheet(g, { spells: this.opts.spells });
        this._tips = [];
        const html = sections.map((s) => `
            <section class="ps-card">
                <h3>${s.icon} ${s.title}</h3>
                ${s.rows.map((r) => this._rowHtml(r)).join('')}
            </section>`).join('');
        if (force || html !== this._key) { // (the page is rebuilt only when a number really changed)
            this._key = html;
            this.cards.innerHTML = html;
        }
        this.root.querySelector('.ps-name').textContent = heroName(g, this.opts.name?.() || 'Герой');
        this.root.querySelector('.ps-sub').textContent = MODE_RU[g.config?.mode] || '';
        this._syncLook(g);
    }

    _rowHtml(r) {
        const tipIdx = r.item ? (this._tips.push(itemTip(r)), this._tips.length - 1) : -1;
        const bar = r.bar ? `<div class="ps-bar"><i style="width:${Math.max(0, Math.min(100, (r.bar[0] / Math.max(1, r.bar[1])) * 100))}%;background:${r.bar[2]}"></i></div>` : '';
        const chips = r.chips ? `<div class="ps-chips">${r.chips.map((c) => `<span class="ps-chip ${c.on ? 'on' : ''}" title="${esc(c.title)}">${c.icon}</span>`).join('')}</div>` : '';
        const title = r.tip && !r.item ? ` title="${esc(r.tip)}"` : '';
        const link = r.link ? ` data-ps-link="${r.link}"` : '';
        return `<div class="ps-row${r.ench ? ' ench' : ''}${r.link ? ' link' : ''}"${title}${link}${tipIdx >= 0 ? ` data-ps-tip="${tipIdx}"` : ''}>
            <span class="ps-ico">${r.icon || ''}</span><span class="ps-label">${esc(r.label)}</span>
            <span class="ps-value">${esc(r.value)}${r.value2 ? `<small>${esc(r.value2)}</small>` : ''}</span>${bar}${chips}</div>`;
    }

    // ---- the 3D preview: its own small renderer, alive only while the tab is open
    async _startPreview() {
        if (this._raf || !this.opts.makeCharacter) return;
        try {
            if (!this._pv) this._pv = await this.opts.makeCharacter(this.canvas);
            if (!this.open || !this._pv) return;
            const loop = () => {
                if (!this.open) { this._raf = null; return; }
                this._pv.hero.group.rotation.y = this.yaw;
                this._pv.renderer.render(this._pv.scene, this._pv.camera);
                this._raf = requestAnimationFrame(loop);
            };
            this._syncLook(this.getGame(), true);
            this._raf = requestAnimationFrame(loop);
        } catch (e) { this._pv = null; /* no 3D: the data is still there */ }
    }

    _syncLook(g, force = false) {
        const pv = this._pv; if (!pv || !g) return;
        const code = JSON.stringify([wornCode(g.armor?.worn || {}), g.dark?.skin || 0, g.config?.look ? 1 : 0]);
        if (!force && code === this._lookKey) return;
        this._lookKey = code;
        const look = g.config?.look || this.opts.look?.();
        if (look) pv.hero.setLook(look);
        pv.dress?.(pv.hero, wornCode(g.armor?.worn || {}));
        pv.hero.setDarkLevel?.(g.dark?.skin || 0);
    }

    _stopPreview() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._pv) { this._pv.dispose?.(); this._pv = null; this._lookKey = ''; } // (the GL context is given back: nothing is kept in the background)
    }
}
