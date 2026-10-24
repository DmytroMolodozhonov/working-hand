/**
 * HeroApply.js — «Настройки героя» Творческого мира, применённые к герою (правила и числа — HeroSetup.js).
 *
 * - `start()`: после загрузки мира. Мана (ячейки) — правило мира, действует всегда (ячейки + выжженные свитки силы);
 *   остальное — начальное: броня, мантия, чёрная магия, метка слома — только если это новый герой этого мира
 *   (вернувшийся с сохранением остаётся таким, каким ушёл); заклинания, дуэльная сила и устойчивость не «выдаются» —
 *   они читаются из `game.hero` на месте (SpellBook.knows, Duel._strength, Steadiness.effective).
 * - `respawn()`: смерть в Творческом (космос и т.п.) — герой возрождается с настройками заново.
 */

import { creativeFiniteMana } from './HeroSetup.js';
import { makePiece, makeRobe, PIECES } from './ArmorTypes.js';
import { clampDark } from './DarkMagic.js';

export class HeroApply {
    constructor(game) { this.game = game; }

    get on() { return this.game.config?.mode === 'creative'; }

    /** Ячейки маны: конечная мана в Творческом — своё число (+ свитки силы); бесконечная — как было. */
    applyMana() {
        const g = this.game, c = g.combat;
        if (!this.on || !c || !creativeFiniteMana(g)) return;
        c.maxFatigue = g.hero.cells + (g.bonus?.fatigue || 0) + (g.mana?.growth || 0); // (the cells set + burnt scrolls + what spells grew)
        c.fatigue = Math.min(c.fatigue ?? c.maxFatigue, c.maxFatigue);
        c._hudKey = ''; c._manaKey = '';
    }

    /** Броня и мантия: в пустые места (то, что герой уже носит, не трогаем). */
    dress() {
        const a = this.game.armor, h = this.game.hero;
        if (!a || !h) return;
        if (h.armor) for (const p of PIECES) if (!a.worn[p]) a.wear(makePiece(p, { magic: true }), { quiet: true });
        if (h.robe && !a.worn.robe) a.wear(makeRobe(true), { quiet: true });
    }

    /** Новый герой этого мира: начальные значения. */
    initial() {
        const g = this.game, h = g.hero;
        this.dress();
        if (h.dark > 0 && g.dark) {
            const n = clampDark(h.dark);
            if (n > g.dark.level) g.dark.restore({ level: n, skin: n }); // (quietly: no «something dark stirs» at the world's start)
        }
        if (h.breakward && g.breakward && !g.breakward.marked) { g.breakward.marked = true; g.breakward.known = true; g.breakward._hud?.(); }
    }

    start() {
        if (!this.on) return;
        this.applyMana();
        if (!this.game._playerRestored) this.initial();
    }

    respawn() {
        if (!this.on) return;
        const g = this.game, c = g.combat;
        this.applyMana();
        if (c && creativeFiniteMana(g)) c.fatigue = c.maxFatigue;
        g.dark?.onDeath?.();
        g.breakward?.onDeath?.();
        this.initial();
    }
}

