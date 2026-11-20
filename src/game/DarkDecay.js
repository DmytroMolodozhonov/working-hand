// DarkDecay.js — чёрная магия понемногу уходит (автор 20.11): за каждые 24 минуты (игровые сутки) НАСТОЯЩЕЙ игры уровень чёрной магии падает на 1 (кожа — вместе с ним).
// Не засчитывается: пауза, свёрнутая вкладка, смерть, космос/ад не мешают, но стояние на месте и «кружение у костра» — нет (проверка небольшая: за последние 30 с
// герой должен был пройти не меньше ~15 м вширь). На 100-м уровне («настоящий тёмный маг») правило НЕ действует.
import { DARK, addDark } from './DarkMagic.js';

export const DECAY = { DAY_S: 24 * 60, STEP_S: 2, WINDOW_S: 30, MIN_SPREAD: 15, MIN_SAMPLES: 6 };

/** Чистая часть: учёт «живого» времени. feed(x, z, ok, dt) → сколько ПОЛНЫХ суток накопилось сейчас (0 или 1). */
export class ActivityClock {
    constructor() { this.t = 0; this.samples = []; this.active = 0; }
    feed(x, z, ok, dt) {
        this.t += dt;
        if (this.t < DECAY.STEP_S) return 0;
        const step = this.t; this.t = 0;
        if (!ok) { this.samples.length = 0; return 0; } // (пауза / не в игре: окно начинается заново)
        this.samples.push([x, z]);
        const max = Math.ceil(DECAY.WINDOW_S / DECAY.STEP_S);
        while (this.samples.length > max) this.samples.shift();
        if (this.samples.length < DECAY.MIN_SAMPLES) return 0;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [a, b] of this.samples) { if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < z0) z0 = b; if (b > z1) z1 = b; }
        if (Math.max(x1 - x0, z1 - z0) < DECAY.MIN_SPREAD) return 0; // (стоит или кружит на месте — время не идёт)
        this.active += step;
        if (this.active >= DECAY.DAY_S) { this.active -= DECAY.DAY_S; return 1; }
        return 0;
    }
}

/** Игровая часть: вызывается каждый кадр; -1 к уровню за каждые сутки живой игры. */
export class DarkDecay {
    constructor(game) { this.game = game; this.clock = new ActivityClock(); }
    update(dt) {
        const g = this.game, h = g?.dark;
        if (!h || !(h.level > 0) || h.level >= DARK.MAX) { this.clock.samples.length = 0; return; } // (чисто / 100-й уровень: правило не действует)
        const p = g.character?.group?.position;
        const ok = !!p && !g.paused && !g.isDeadLocal && !g.combat?.dead && !(typeof document !== 'undefined' && document.hidden) && g.revealed !== false;
        if (this.clock.feed(p?.x || 0, p?.z || 0, ok, dt) > 0) {
            const was = h.level;
            addDark(h, -1, 'day');
            g.hud?.setVoice?.(`🜏 Чёрная магия понемногу уходит: уровень ${h.level} (был ${was})`, true);
        }
    }
}
