/**
 * AvadaLook.js — how «Авада Кедавра» looks (the author: «ядовито-зелёным, и звук — явно страшным»).
 *
 *   cast    a poison-green flash at the wand: a cone of acid sparks, a puff of green murk, the
 *           surroundings lit green for a moment (the one shared flash light — Effects.lightFlash)
 *   flight  the charge flickers ominously (its murky glow breathes), a smoky green trail with
 *           sparks drifts off its head
 *   hit     a bright green flash, a ring of green «poison» rolling out, a cloud that thins away;
 *           whoever it touches is lit green for a moment
 * The same for my casts, the wizards' (WizardFight) and the other players' (Duel.remoteCast).
 * Visual + sound only: what the spell does is decided in Duel.js. No own materials or lights:
 * the shared particle pools of Effects (nothing to prewarm, nothing piles up).
 */

/** The poison greens: an acid core, a lighter spark, a murky swamp glow, a dark smoke. */
// (the light a little bluer than the charge: on yellow-green grass a strong 0x2bff00 light turns yellow, not green)
export const AVADA = { CORE: 0x39ff14, ACID: 0x1cff08, SPARK: 0x5cff3a, MURK: 0x077a14, SMOKE: 0x0f3a12, LIGHT: 0x00ff2a, HUD: 'rgba(43, 255, 0, 0.7)' };

export class AvadaLook {
    constructor(game) {
        this.game = game;
        this._trailT = 0;
    }

    /** The charge leaves the wand at `o` along `d` (heard by everyone near). */
    cast(o, d, sound = true) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        const dx = d?.x || 0, dy = d?.y || 0, dz = d?.z || 0;
        for (let i = 0; i < 26; i++) {
            const sp = 4 + Math.random() * 9;
            fx.glow?.spawn(o.x, o.y, o.z, dx * sp + (Math.random() - 0.5) * 4, dy * sp + (Math.random() - 0.5) * 4, dz * sp + (Math.random() - 0.5) * 4,
                i % 3 ? AVADA.ACID : AVADA.MURK, 0.12 + Math.random() * 0.14, 0.25 + Math.random() * 0.2, { shrink: 1.4, spin: 6 });
        }
        for (let i = 0; i < 14; i++) fx.sparks?.spawn(o.x, o.y, o.z, (Math.random() - 0.5) * 6, (Math.random() - 0.2) * 5, (Math.random() - 0.5) * 6, i % 2 ? AVADA.CORE : AVADA.SPARK, 0.08 + Math.random() * 0.08, 0.4);
        for (let i = 0; i < 5; i++) {
            fx.smoke?.spawn(o.x + (Math.random() - 0.5) * 0.3, o.y + (Math.random() - 0.5) * 0.3, o.z + (Math.random() - 0.5) * 0.3,
                dx * 1.5 + (Math.random() - 0.5), 0.6 + Math.random() * 0.6, dz * 1.5 + (Math.random() - 0.5), AVADA.SMOKE, 0.18 + Math.random() * 0.16, 0.9 + Math.random() * 0.5, { shrink: -0.5, spin: 1 });
        }
        fx.lightFlash(o, AVADA.LIGHT, 3.5, 0.35, 20);
        if (sound) g.sound?.playSpellFx?.('fxAvada', o, 1.05);
    }

    /** One frame of flight: the head at `p` flying along `d`; `pool` the charge's segments (its glow breathes). */
    trail(p, d, pool, dt) {
        const fx = this.game.fx;
        if (pool?.glow?.mat) pool.glow.mat.opacity = 0.42 + 0.22 * Math.abs(Math.sin(performance.now() * 0.013)) + 0.12 * Math.random();
        if (!fx) return;
        this._trailT += dt;
        while (this._trailT > 1 / 40) { // (~40 puffs a second, whatever the frame rate)
            this._trailT -= 1 / 40;
            fx.smoke?.spawn(p.x - d.x * 0.3 + (Math.random() - 0.5) * 0.25, p.y - d.y * 0.3 + (Math.random() - 0.5) * 0.25, p.z - d.z * 0.3 + (Math.random() - 0.5) * 0.25,
                (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? AVADA.SMOKE : AVADA.MURK, 0.09 + Math.random() * 0.09, 0.6 + Math.random() * 0.4, { shrink: -0.35, spin: 1 });
            if (Math.random() < 0.6) fx.glow?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2.5 - d.x, (Math.random() - 0.5) * 2.5 - d.y, (Math.random() - 0.5) * 2.5 - d.z,
                AVADA.ACID, 0.06 + Math.random() * 0.06, 0.3 + Math.random() * 0.2, { shrink: 0.6, spin: 4 });
        }
    }

    /** Where it lands at `p`: `n` ≥ 30 a hit (a body), less — on a wall, a shield, out of range. */
    hit(p, n = 30) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        const k = Math.min(1.4, n / 30);
        for (let i = 0; i < 36 * k; i++) {
            const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), sp = 3 + Math.random() * 8;
            fx.glow?.spawn(p.x, p.y, p.z, Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp,
                i % 4 ? AVADA.ACID : AVADA.MURK, 0.2 + Math.random() * 0.3, 0.3 + Math.random() * 0.3, { shrink: 1.1, spin: 5 });
        }
        if (n >= 30) { // the ring of poison rolling out
            for (let i = 0; i < 40; i++) {
                const a = (i / 40) * Math.PI * 2, sp = 7 + Math.random() * 1.5;
                fx.glow?.spawn(p.x, p.y, p.z, Math.cos(a) * sp, 0.2 + Math.random() * 0.4, Math.sin(a) * sp, i % 3 ? AVADA.CORE : AVADA.MURK, 0.22, 0.45, { shrink: 0.9, spin: 2 });
            }
        }
        for (let i = 0; i < 14 * k; i++) fx.sparks?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 7, (Math.random() - 0.3) * 6, (Math.random() - 0.5) * 7, i % 2 ? AVADA.CORE : AVADA.SPARK, 0.1 + Math.random() * 0.1, 0.5);
        for (let i = 0; i < 10 * k; i++) {
            fx.smoke?.spawn(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6, i % 2 ? AVADA.SMOKE : AVADA.MURK, 0.22 + Math.random() * 0.25, 1.4 + Math.random() * 0.8, { shrink: -0.45, spin: 1 });
        }
        // (whoever it touches: lit green for a moment)
        fx.lightFlash(p, AVADA.LIGHT, n >= 30 ? 4.5 + 2 * (k - 1) : 2.5, n >= 30 ? 0.55 : 0.3, n >= 30 ? 28 : 16);
        g.sound?.playSpellFx?.('fxAvadaHit', p, n >= 30 ? 1.1 : 0.55);
    }
}
