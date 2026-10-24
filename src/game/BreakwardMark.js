/**
 * BreakwardMark.js — метка «слом защиты» на герое (игровая часть; правила и числа — Breakward.js).
 *
 *  ОДНОРАЗОВАЯ (слова автора): после успешного `activate()` (вернул null) вызывающий гасит и убирает пентаграмму (`PENTAGRAMS.breakward.once`).
 *  activate()  — встал на пентаграмму `breakward` (рисунок выучен: `learn()` — сожжённый свиток), заплатил 50 маны:
 *                метка + тёмная вспышка; +1 к чёрному уровню (`addDark(hero, 1, 'ritual')`). Метка уже есть — ничего не делает.
 *  cellMax()   — вместо максимума маны в проверке «нужно N ячеек»: с меткой хватает любого (кроме заклинаний богов).
 *  afterPay()  — после оплаты заклинания, шедшего в обход ячеек: 23 % «беда» (отмена / дикий взрыв / палочка).
 *  drain hooks — `Combat.drain` вызывает `holdDry()`, когда мана кончилась у удерживаемого заклинания: оно не обрывается,
 *                полоска чёрная, `step()` бросает кубик каждые 5 с.
 * Смерть снимает метку (`onDeath`, зельем не снять); сохраняется в сохранении игрока (snapshot/restore). Каждому своё: только локальный герой.
 * Эффект виден только как индикатор в HUD (метка невидима другим); вспышка и звук — дёшево, из пула частиц.
 */
import { manaRules } from './HeroSetup.js';
import { BREAKWARD, BlackBar, breakwardMishap, canBypass, deficitOf, holdOutcome, MARK_HINT, MARK_NOTE, BLACK_HINT } from './Breakward.js';
import * as THREE from 'three';
import { addDark } from './DarkMagic.js';

const _v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const DRY_MS = 250; // «мана кончилась» держится столько после последнего drain

export class BreakwardMark {
    constructor(game, rng = Math.random) {
        this.game = game; this.rng = rng;
        this.marked = false;
        this.known = false; // рисунок выучен (свиток сожжён)
        this.bar = new BlackBar();
        this._dry = false; this._dryT = -1e9; this._shown = '';
    }

    get holding() { return this.marked && performance.now() - this._dryT < DRY_MS; }

    /** Свиток сожжён: рисунок известен. */
    learn() { if (this.known) return false; this.known = true; this.game.hud?.toast?.('🜏 Рисунок пентаграммы слома защиты запомнился'); return true; }

    /** Встал на пентаграмму. @returns {string|null} почему нельзя, иначе null */
    activate() {
        const g = this.game, c = g.combat;
        if (this.marked) { g.hud?.toast?.('🜏 Защита уже сломана'); return 'защита уже сломана'; } // (одноразовая: мана не списывается, пентаграмма не гаснет)
        if (!this.known && !(c && !c.enabled)) return 'рисунок не выучен'; // (в Творческом известно всё)
        if (manaRules(this.game)) {
            if (c.check?.('Breakward')) return 'мало маны';
            c.fatigue = Math.max(0, c.fatigue - BREAKWARD.COST); // (цена — 50)
            c._hudKey = '';
        }
        this.marked = true;
        addDark(g.dark || g, BREAKWARD.DARK, BREAKWARD.DARK_WHY);
        this._flash(g.character?.group?.position);
        g.hud?.toast?.(`🜏 ${MARK_HINT}`);
        g.hud?.setVoice?.(MARK_NOTE, true);
        this._hud();
        return null;
    }

    /** Максимум маны для проверки «нужно `need` ячеек». */
    cellMax(kind, need, have) {
        if (!this.marked || !canBypass(kind)) return have;
        return Math.max(have || 0, need || 0);
    }

    /**
     * Заклинание `kind` (требует `need` ячеек) оплачено — а не было ли ячеек ПО ПРАВИЛАМ? Если не хватало — 23 % беды.
     * @param {{x:number,y:number,z:number}|null} aim куда колдовали
     * @returns {boolean} true: заклинание НЕ срабатывает (вызывающий возвращает null)
     */
    afterPay(kind, need, aim = null) {
        const c = this.game.combat;
        if (!this.marked || !manaRules(this.game) || !canBypass(kind)) return false;
        const m = breakwardMishap(deficitOf(c.maxFatigue || 30, need), this.rng);
        if (!m) return false;
        this.game.hud?.setVoice?.(`🜏 ${m.hint}`, true);
        this.game.hud?.toast?.(`🜏 ${m.hint}`);
        const g = this.game, me = g.character?.group?.position;
        if (!me) return true;
        if (m.kind === 'wild') {
            const t = aim || me;
            let x = t.x, z = t.z;
            if (m.mode === 'shift') { x += Math.cos(m.ang) * m.dist; z += Math.sin(m.ang) * m.dist; }
            else if (m.mode === 'near') { const dx = t.x - me.x, dz = t.z - me.z, L = Math.hypot(dx, dz) || 1; x = me.x + dx / L * m.dist; z = me.z + dz / L * m.dist; }
            g.explode?.(new THREE.Vector3(x, t.y, z), Math.max(3, 8 * m.power), 'local', 1);
        } else if (m.kind === 'wand') this._wandBlast();
        return true;
    }

    // ---- удерживаемое: мана кончилась ----
    /** `Combat.drain` дошёл до нуля с меткой: заклинание держится дальше (true). */
    holdDry() {
        if (!this.marked) return false;
        this._dry = true; this._dryT = performance.now();
        return true;
    }

    step(dt) {
        const c = this.game.combat;
        if (!this.marked || !c) return;
        const dry = this._dry; this._dry = false;
        const ev = this.bar.step(dt, dry, this.rng, true);
        for (const e of ev) {
            if (e.hit) this._holdBlow(e.outcome);
        }
        this._hud();
    }

    _holdBlow(o) {
        const g = this.game;
        g.hud?.setVoice?.(`🜏 ${o.hint}`, true);
        g.hud?.toast?.(`🜏 ${o.hint}`);
        g.focus?.lose?.('stun'); // (концентрация сорвана, как оглушением: всё удерживаемое прекращается)
        this._dryT = -1e9;
        if (o.blast) this._flash(g.character?.group?.position, true);
        if (o.kind === 'wand') this._wandBlast(false);
        else if (o.blast) this._blastAtHero(o.blast);
        if (o.knock) this._knock();
    }

    _blastAtHero(k) {
        const me = this.game.character?.group?.position;
        if (me) this.game.explode?.(new THREE.Vector3(me.x, me.y - 2, me.z), 4 * k + 2, 'local', 1);
    }

    _wandBlast(withKnock = true) {
        const g = this.game, it = g.items;
        for (const side of ['right', 'left']) {
            if (it?.held?.[side]?.item?.kind === 'wand') it.releaseHand(side); // (палочка взорвалась — её нет)
        }
        this._blastAtHero(0.5);
        this._flash(g.character?.group?.position, true);
        if (withKnock) this._knock();
    }

    _knock() {
        const g = this.game;
        g.knock?.knock?.({ dir: 'back', down: 2, by: null, kind: 'Breakward', toss: 6, strength: 0.7, fly: true, tumble: 1 });
    }

    _flash(p, big = false) {
        const g = this.game;
        if (!p) return;
        const n = big ? 24 : 14; // (тёмно-багровая вспышка, из пула частиц)
        for (let i = 0; i < n; i++) g.fx?.spark?.(p, i % 3 ? 0x8a0f24 : 0x1a0008, 0.14 + Math.random() * 0.1, _v.set((Math.random() - 0.5) * 7, (Math.random() - 0.2) * 6, (Math.random() - 0.5) * 7), 0.6);
        g.sound?.playRumble?.(p, p);
    }

    _hud() {
        const hud = this.game.hud;
        const key = `${this.marked ? 1 : 0}|${this.bar.black ? Math.floor(this.bar.pct) : -1}`;
        if (key === this._shown) return;
        this._shown = key;
        hud?.setBreakward?.(this.marked, this.bar.black ? this.bar.pct : null);
        this.game.combat && (this.game.combat._hudKey = '');
        if (this.bar.black && this.bar.pct <= 1.001) hud?.toast?.(`🜏 ${BLACK_HINT}`);
    }

    // ---- смерть, сохранение ----
    onDeath() { this.marked = false; this.bar.reset(); this._dry = false; this._shown = ''; this._hud(); }
    snapshot() { return this.marked || this.known ? { m: this.marked ? 1 : 0, k: this.known ? 1 : 0 } : null; }
    restore(s) { this.marked = !!s?.m; this.known = !!s?.k; this.bar.reset(); this._shown = ''; this._hud(); }
}
