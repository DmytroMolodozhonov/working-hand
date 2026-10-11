/**
 * Mana.js — the blue bar at the bottom («Мана», internally still Combat.fatigue).
 *
 *   30 mana to start, +1 a second back. Every spell costs mana (Combat.SPELL_COST).
 *   The MAXIMUM grows with practice:
 *     +1  for every spell that really worked (Leviosa lifted something, Bombardo
 *         exploded, a shield went up, Accio brought the thing, a duel charge hit…)
 *     +3  more the first time each STRONG spell works (every Maxima form, Avada
 *         Kedavra, Lightning Strike, Thunderwave…) — once per spell, for good
 *     +5  for winning a real duel (the clash won and the opponent killed by it)
 *     +20 for killing the giant spider (to the one who struck the last blow)
 *     +5  for every mana crystal broken with both hands
 *   A burnt strength scroll still adds its points for good. On death all the growth
 *   is lost: the maximum is 30 again (plus the scrolls). In Creative mana never limits.
 *
 * ONE hook for every spell: `game.mana.success(name)` — call it where the code knows
 * the spell worked (Game.castLocalSpell already does it for spells that always work
 * once paid for; a spell that may still fail reports it itself).
 */

export const MANA = {
    BASE: 30,
    SUCCESS: 1, // every spell that worked
    STRONG_FIRST: 3, // the first success of each strong spell
    DUEL_WIN: 5,
    SPIDER: 20,
    CRYSTAL: 5,
};

/** Strong spells: their first success gives +3 more (once). */
export const STRONG_SPELLS = new Set([
    'AvadaKedavra', 'LightningStrike', 'Thunderwave', 'WaterVortex', 'Alive',
]);

/** Every Maxima form is strong too. */
export function isStrongSpell(name) {
    return !!name && (STRONG_SPELLS.has(name) || /Maxima$/.test(name));
}

/** A duel charge's name → the spell it came from. */
export const DUEL_SPELL_NAME = { SapiraDuel: 'Sapira', IceDuel: 'Ice', LevitateDuel: 'Levitation', Stupefy: 'Stupefy', AvadaKedavra: 'AvadaKedavra' };

/** Not spells (or nothing worked): never grow the maximum. */
const NOT_SPELLS = new Set(['Stand', 'Stop', 'Pause', 'Nox', 'Attack', 'Reveal']);

export class Mana {
    constructor(game) {
        this.game = game;
        this.growth = 0; // grown with practice (lost on death)
        this.strongUsed = new Set(); // strong spells whose first success was already counted
        this.log = []; // (tests) the last few gains
    }

    get combat() { return this.game.combat; }

    /** The bar's maximum now. */
    get max() { return this.combat?.maxFatigue || MANA.BASE; }

    get value() { return this.combat?.fatigue ?? MANA.BASE; }

    /**
     * A spell really worked: +1 to the maximum (+3 more the first time a strong one works).
     * @returns {number} how much the maximum grew
     */
    success(name) {
        if (!name || NOT_SPELLS.has(name)) return 0;
        let n = MANA.SUCCESS;
        const strong = isStrongSpell(name) && !this.strongUsed.has(name);
        if (strong) { this.strongUsed.add(name); n += MANA.STRONG_FIRST; }
        this.grow(n, strong ? 'strong' : 'spell', name);
        if (strong) this._say(`🔷 Новое сильное заклинание! Мана +${n} к максимуму`);
        return n;
    }

    /** A real duel won: the clash and the opponent killed by it. */
    duelWon() {
        this.grow(MANA.DUEL_WIN, 'duel');
        this._say(`🔷 Победа в дуэли! Мана +${MANA.DUEL_WIN} к максимуму`);
    }

    /** The giant spider killed by me. */
    spiderKilled() {
        this.grow(MANA.SPIDER, 'spider');
        this._say(`🔷 Паучиха повержена! Мана +${MANA.SPIDER} к максимуму`);
    }

    /** A mana crystal broken with both hands. */
    crystal() {
        this.grow(MANA.CRYSTAL, 'crystal');
        this._say(`💎 Кристалл маны! Мана +${MANA.CRYSTAL} к максимуму`);
    }

    /** The maximum grows (and the mana in it with it). */
    grow(n, why = 'spell', name = null) {
        if (!(n > 0)) return;
        this.growth += n;
        this.combat?.addMaxFatigue?.(n);
        this.log.push({ why, name, n });
        if (this.log.length > 20) this.log.shift();
        if (this.combat) this.combat._hudKey = ''; // (the bar shows the new maximum at once)
    }

    /** Death: all the growth is lost — back to 30 (plus the burnt scrolls). */
    onDeath() {
        const c = this.combat;
        if (c && this.growth) {
            c.maxFatigue = Math.max(MANA.BASE, (c.maxFatigue || MANA.BASE) - this.growth);
            c.fatigue = Math.min(c.fatigue, c.maxFatigue);
            c._hudKey = '';
        }
        this.growth = 0;
    }

    /** Kept with the player (world save, multiplayer). */
    snapshot() {
        return { growth: this.growth, strong: [...this.strongUsed] };
    }

    restore(s) {
        if (!s) return;
        if (Array.isArray(s.strong)) for (const k of s.strong) this.strongUsed.add(String(k));
        const g = Math.max(0, Math.min(10000, Number(s.growth) || 0));
        if (g > this.growth) this.grow(g - this.growth, 'restore');
    }

    _say(text) {
        const hud = this.game.hud;
        if (!this.combat?.enabled) return; // (no mana rules outside the free world)
        if (hud?.toast) hud.toast(text);
        else hud?.setVoice?.(text, true);
    }
}
