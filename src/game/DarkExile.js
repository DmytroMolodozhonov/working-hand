/**
 * DarkExile.js — изгнание чёрного мага из башни волшебников (DarkMagic.js: уровень тьмы 81…100).
 * Герой-изгой в стенах башни: маги гонят его («Уходи»), через `GRACE` секунд маги башни объявляют его врагом
 * (на `HOSTILE_MS`) и защищают башню как от любого нарушителя. Вышел за стены — всё затихает.
 * Малые поселения магов и дома одиночек не изгоняют (там у каждого мага своя терпимость — DarkMagic.tolerance).
 */

import { expelled, EXPEL_LINE } from './DarkMagic.js';
import { effectiveSkin } from './DarkLord.js';

export const EXILE = { EVERY: 0.5, GRACE: 10, SAY_EVERY: 6, LOOK: 40, HOSTILE_MS: 90000 };

export class DarkExile {
    constructor(game) { this.game = game; this._t = 0; this.inside = 0; this._say = 0; }

    update(dt) {
        const g = this.game, L = g.castleLife;
        const lvl = effectiveSkin(g.dark?.skin || 0, g.darkLord?.on); // (по пятнам на теле: DarkMagic.js; у настоящего тёмного мага — всегда 100: DarkLord.js)
        if (lvl <= 80 || !L?.castles) { this.inside = 0; return; }
        this._t -= dt;
        if (this._t > 0) return;
        this._t = EXILE.EVERY;
        const p = g.character?.group?.position;
        if (!p) return;
        let tower = null;
        for (const cs of L.castles.values()) if (cs.awake && cs.def.kind === 'tower' && L._inWalls(cs.def, p)) { tower = cs; break; }
        if (!tower || !expelled(lvl, 'tower')) { this.inside = 0; return; }
        this.inside += EXILE.EVERY;
        this._say -= EXILE.EVERY;
        if (this._say <= 0) {
            this._say = EXILE.SAY_EVERY;
            let best = null, bd = EXILE.LOOK;
            for (const v of tower.active.values()) {
                if (v.dead || !v.wizard) continue;
                const d = Math.hypot(v.x - p.x, v.z - p.z);
                if (d < bd) { bd = d; best = v; }
            }
            if (best) { g.authority ? L._say(best, EXPEL_LINE, 4) : g.hud?.setVoice?.(`🧙 ${best.name || 'Маг'}: «${EXPEL_LINE}»`, true); }
        }
        if (this.inside >= EXILE.GRACE && g.authority) tower.hostile.set(g.localId, Date.now() + EXILE.HOSTILE_MS);
    }
}
