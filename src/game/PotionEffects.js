/**
 * PotionEffects.js — the timed effects of the potions (the author 05.11: «скрытие личности 24 минуты, ослепительность 24 минуты, удача на
 * 12 игровых часов, дыхание под водой на игровой день, обнуление эффектов»). Rules and numbers here (pure, Node-testable); the game part is
 * the small class at the end (`g.potionFx`): its timers, what each effect touches, the save, death.
 *
 *   disguise     another face and clothes for 24 min: nobody knows you — a deed seen is not yours (Audacity.deed, the wanted), the
 *                villagers' memory of you is not called up; the others in the game see the other look too (the look goes by the network).
 *   dazzle       24 min: friendship and love bend three times as easily (RelationsLife.bump — only the rises).
 *   luck         12 game hours (= 12 min): every spell of yours +5…85 % stronger, a new roll each time (WandMagic.power).
 *   waterbreath  a game day (= 24 min): under water the air never runs out (Swimming).
 *   dragon       10 min: the hero IS a dragon (DragonForm.js — run, take off, breathe fire), then a man again where the dragon stands.
 *   reset        every effect of a potion above ends at once (not the cure of the dark mage — that one is no «effect»).
 *
 * What may go wrong (CLAUDE.md): drunk twice — the time starts again (never two at once); the hero dies — every effect ends (death takes all);
 * the game is left and loaded — the time left is kept (snapshot); disguised and the effect ends in a village — the old face comes back
 * (`look` kept); disguised in multiplayer — the others get the new look and then the old one again; luck with no wand — still a spell.
 */

/** The day of the game is 24 min (DayCycle): one game hour = 60 s. */
export const GAME_HOUR_S = 60;

/** Each timed effect: how long (s), its name for the player, its icon. */
export const POTION_FX = {
    disguise: { s: 24 * 60, ru: 'Скрытие личности', icon: '🎭' },
    dazzle: { s: 24 * 60, ru: 'Ослепительность', icon: '✨' },
    luck: { s: 12 * GAME_HOUR_S, ru: 'Удача', icon: '🍀' },
    waterbreath: { s: 24 * GAME_HOUR_S, ru: 'Дыхание под водой', icon: '🫧' },
    dragon: { s: 600, ru: 'Превращение в дракона', icon: '🐉' },
    mermaid: { s: 12 * 60, ru: 'Русалка', icon: '🧜' }, // (Mermaid.js: a fish's tail for the legs, breath under the water, the tail drives the body — «стоп» does not end it: no spell) // (DragonForm.js: the body becomes a dragon — 10 min, not dark magic)
};

/** Friendship / love rise this many times faster under «Ослепительность». */
export const DAZZLE_K = 3;
/** «Удача»: a spell's strength ×(1 + LUCK.MIN … 1 + LUCK.MAX), a new roll each cast. */
export const LUCK = { MIN: 0.05, MAX: 0.85 };

/** The luck's roll: rng() in [0, 1) → the strength's factor. */
export const luckFactor = (rng = Math.random) => 1 + LUCK.MIN + (LUCK.MAX - LUCK.MIN) * rng();

/** A relation's change {s, f, l} under dazzle: the rises of friendship and love ×DAZZLE_K, the falls and the obedience as they are. */
export function dazzleBump(d) {
    if (!d) return d;
    const out = { ...d };
    if (out.f > 0) out.f *= DAZZLE_K;
    if (out.l > 0) out.l *= DAZZLE_K;
    return out;
}

export class PotionEffects {
    constructor(game) {
        this.game = game;
        this.left = {}; // id → seconds left
        this._look = null; // (disguise: the hero's own look, to come back)
        this._hudT = 0;
    }

    has(id) { return (this.left[id] || 0) > 0; }

    /** A potion drunk: its effect starts (again, from the full time). Returns the line for the player. */
    start(id) {
        const D = POTION_FX[id];
        if (!D) return null;
        const was = this.has(id);
        this.left[id] = D.s;
        if (id === 'disguise' && !was) this._disguise(true);
        if (id === 'dragon' && !was) this.game.dragonForm?.begin?.();
        const min = Math.round(D.s / 60);
        return `${D.icon} ${D.ru} — ${min} мин`;
    }

    /** «Обнуление»: every effect ends now. True if one was on. */
    resetAll(why = 'reset') {
        let any = false;
        for (const id of Object.keys(this.left)) if (this.has(id)) { any = true; this._end(id, why); }
        return any;
    }

    _end(id, why) {
        this.left[id] = 0;
        if (id === 'disguise') this._disguise(false);
        if (id === 'dragon') { this.game.dragonForm?.end?.(); return; } // (it says its own line)
        if (why !== 'dead' && why !== 'reset') this.game.hud?.setVoice?.(`${POTION_FX[id]?.icon || '🧪'} ${POTION_FX[id]?.ru || 'Зелье'}: действие закончилось`, true);
    }

    /** Disguise on / off: another look (random, whole), the old one kept; the others see it (the look goes by the network). */
    _disguise(on) {
        const g = this.game, ch = g.character;
        if (!ch?.setLook) return;
        if (on) {
            this._look = ch.look ? JSON.parse(JSON.stringify(ch.look)) : null;
            const look = this._randomLook?.() || null;
            if (look) ch.setLook(look);
        } else if (this._look) {
            ch.setLook(this._look);
            this._look = null;
        }
        g.sync?.sendLook?.();
    }

    /** The effect gone without its ending (the dragon of the form killed, the host refused): the clock stops, nothing else. */
    cancel(id) { if (this.left[id] > 0) this.left[id] = 0; }

    /** Every frame. */
    update(dt) {
        if (this._dragonLater && this.game.dragonForm && this.game.character && this.game.dragons) { // (loaded in the form: on the ground, the dragon again — the time left)
            const t = this.game.terrain?.data, p = this.game.character.group.position;
            if (!t?.landMade || t.landMade(p.x, p.z)) { this._dragonLater = false; this.game.dragonForm.restoreLanded(); if (this.has('dragon')) this.game.dragonForm.begin({ now: true }); } // (loaded mid-form: no second change — CLAUDE.md)
        }
        for (const id of Object.keys(this.left)) {
            if (!(this.left[id] > 0)) continue;
            this.left[id] -= dt;
            if (this.left[id] <= 0) this._end(id, 'time');
        }
    }

    /** Death takes everything (CLAUDE.md «умер — всё»). */
    onDeath() { this.resetAll('dead'); }

    /** For «Удача» (WandMagic.power): ×1 without it. */
    luckK(rng = Math.random) { return this.has('luck') ? luckFactor(rng) : 1; }

    snapshot() {
        const out = {};
        for (const [id, s] of Object.entries(this.left)) if (s > 0) out[id] = Math.round(s);
        return Object.keys(out).length ? { left: out, look: this._look || undefined } : null;
    }

    restore(s) {
        if (!s?.left) return;
        for (const [id, v] of Object.entries(s.left)) if (POTION_FX[id] && v > 0) this.left[id] = v;
        if (this.has('dragon')) this._dragonLater = true;
        if (this.has('disguise') && s.look) this._look = s.look; // (the face under the disguise: back when it ends)
    }
}
