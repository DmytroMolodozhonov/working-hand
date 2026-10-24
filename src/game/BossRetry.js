/**
 * BossRetry.js — «повторить бой с боссом» (Творческий, старт у босса): по аналогии с дуэльным режимом.
 *
 * Автор: «если он проигрывает, он заново спавнится на том месте рядом с боссом, и у него опять панелька выбора магии… я должен много
 * итераций сделать — каждый раз меня спавнить, чтобы я заново начинал эту битву».
 *
 * Герой, начавший мир у босса (гора дракона, Ледяная Королева, замок короля, башня волшебников, логово паучихи, чёрный корабль), падает в бою —
 * смерти нет (ни экрана смерти, ни тела, ни потерянных вещей): мир на паузе, окно «Хотите попробовать ещё раз?» с теми же настройками героя,
 * что при создании мира (мана, броня, здоровье, дуэльная сила…). «Начать заново» — настройки применены, мана и здоровье полные, герой снова
 * на месте старта рядом с боссом (`HeroApply.requestSpawn`), дракон — новый (остальных боссов мир возвращает сам: Ледяная Королева
 * оживает, чёрный корабль плывёт дальше; их здоровье этим не сбрасывается). «Выйти в меню» — как в паузе: мир сохраняется.
 */
import { DuelEndUi } from '../ui/DuelEndUi.js';

/** Места старта, где работает повтор боя (дуэли — своя система, ArenaDuels). */
export const BOSS_STARTS = Object.freeze(['dragon', 'queen', 'castle', 'tower', 'spider', 'blackship']);
export const isBossStart = (id) => BOSS_STARTS.includes(id);

export class BossRetry {
    constructor(game) { this.game = game; this.ui = new DuelEndUi(); this.busy = false; }

    /** Идёт ли в этом мире повтор боя: Творческий, старт у босса. */
    get on() { const g = this.game; return g.config?.mode === 'creative' && isBossStart(g.hero?.spawn); }

    /**
     * (Combat.die) Герой должен был погибнуть: не гибнет — окно выбора. true — обработано.
     */
    intercept() {
        const g = this.game;
        if (!this.on || this.busy || g.net?.active) return false;
        this.busy = true;
        g.combat.revive();
        g.paused = true; // (the whole world stands still while the window is open)
        this.ui.showAgain({
            hero: { ...g.hero }, title: 'Вы пали. Хотите попробовать ещё раз?', go: 'Начать бой заново',
            onStart: (hero) => this._again(hero),
            onExit: () => { g.paused = false; this.busy = false; document.getElementById('pause-exit-btn')?.click(); },
        });
        return true;
    }

    _again(hero) {
        const g = this.game;
        g.hero = hero;
        if (g.config) g.config.hero = hero; // (kept with the world)
        g.heroApply?.resetToSettings?.();
        this._resetBoss(hero.spawn);
        g.heroApply?.requestSpawn?.(); // (back to the place by the boss)
        g.paused = false;
        this.busy = false;
    }

    /** Босс — заново, где это просто: дракон горы убирается, и через несколько секунд на пике ложится новый. */
    _resetBoss(spawn) {
        const g = this.game;
        if (spawn !== 'dragon' || !g.dragons) return;
        const d = g.dragons.list?.find((q) => q.id === 'ctest-dragon'); // (Game.TEST_DRAGON)
        if (d && !d.dead) g.dragons._remove?.(d);
        g._tdGone = 60; g._tdT = 0; // (Game._updateTestDragon: no dragon of the mountain now — a new one at once)
    }
}
