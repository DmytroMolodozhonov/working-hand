/**
 * Vigor.js — «Зелье крепкого здоровья» (recipe 'vigor': рог минотавра + жареное мясо + сыр; the author 06.11: «позволяет сделать не 20 хп, а 30 — на 10 больше; готовится один раз, выпивается
 * один раз; эффект навсегда»). Drunk: the maximum health +10 for good — the same «cells of health» as the rites' (`g.bonus.hp`: saved with the world, taken by a death like all growth,
 * brought back by «Give Me My Power» — Legacy.js); `g.bonus.vigor` remembers that the potion has been drunk, so it works ONCE (a second flask is refused, not wasted — Items._drink asks `cantDrink`).
 * «А если»: no combat health (Creative's default: no health bar) — the number grows all the same (g.maxHP) and is there when a mode with health comes; death — the potion is gone with the rest
 * (a new life may drink another); «Give Me My Power» — the maximum and the flag come back together (never twice); a stack of flasks — one is drunk, the others stay.
 */
export const VIGOR = { GAIN: 10 };

export class Vigor {
    constructor(game) { this.game = game; }

    /** Why it cannot be drunk (null: it can). */
    cantDrink() {
        return this.game.bonus?.vigor ? '💪 Вы уже пили такое зелье — крепче вы не станете' : null;
    }

    /** Drunk: +10 to the maximum health for good. @returns the new maximum */
    drink(n = VIGOR.GAIN) {
        const g = this.game;
        const B = g.bonus || (g.bonus = { hp: 0, fatigue: 0 });
        B.hp = (B.hp || 0) + n;
        B.vigor = 1;
        if (g.combat?.enabled) { g.combat.addMaxHp(n); g.maxHP = g.combat.maxHp; g.playerHP = g.combat.hp; }
        else { g.maxHP += n; g.playerHP += n; g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
        g.perf?.note?.(`💪 Зелье крепкого здоровья: максимум здоровья +${n}`);
        return g.maxHP;
    }
}
