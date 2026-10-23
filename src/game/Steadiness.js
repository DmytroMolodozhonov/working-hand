/**
 * Steadiness.js — the skill «Устойчивость» (1 … 100). Not magic: just how well the hero keeps their feet.
 *
 *  - It grows by running over rough ground: slopes, steep climbs and descents, rocks and ledges, uneven earth
 *    (flat running counts a little, a steep scramble fully). `need(n)` metres of «rough running» give +1; the hero
 *    reads «+1 к устойчивости». Nothing heavy: a few additions a frame.
 *  - It is the chance to stay on the feet when a SPELL would knock the hero down (BodyImpact, Levitation's throws,
 *    the water vortex) or when a hard landing from a short drop would (Knockdown._landing): 1 → 1 %, 100 → 100 %.
 *    Held = no fall; the shove and the toss are halved (the body still reels — `HELD_PUSH_K`).
 *  - It does not help against (the author): the gods' spells (`isDivine`), «Wind Maxima», «Inspirius»
 *    (it only reaches the hero inside its blast); «Bombardo Maxima» takes 60 % of it (skill × 0.4); a fall from
 *    ≥ 5 m (`IMPACT.FALL_KNOCK_DROP` — a deep pit, a cave: not a matter of steadiness); a cannonball and hands/
 *    horns/swords (no spell: only spells are resisted); «Авада» crumples the body (it is no push).
 *  - On rough ground a steady hero runs faster: up to +30 % at 100 (`runK`); it never slows a clumsy one.
 *  - Creative: no skill is needed there — counts as 100 (nothing knocks the hero over but the exceptions above).
 *  - Death takes it like the other growth (Legacy: captureLegacy / wipeHero / absorbLegacy); «Give Me My Power»
 *    brings back the body's value (REPLACES, not adds). Saved with the hero (WorldSave `steady`).
 * Each player has their own, counted on their own computer (the knockdown is local to its owner anyway).
 */

import { isDivine } from './ProtectionGods.js';
import { IMPACT } from './Impact.js';

export const STEADY = {
    MIN: 1, MAX: 100,
    NEED_BASE: 300, NEED_STEP: 8, // metres of rough running for +1 at skill n: 300 + 8n (≈ 69 000 m for 1 → 100)
    FLAT_W: 0.12, // a metre of flat running counts this much; a steep one counts 1
    STEEP_AT: 0.6, // slope (rise / run) from which the ground counts as fully rough
    RUN_BONUS: 0.3, // + this much speed on the roughest ground at 100
    SMOOTH: 0.4, // s: how fast «rough ground now» follows the ground
    HELD_PUSH_K: 0.5, // a held blow still moves the body this much
    BOMBARDO_MAXIMA_K: 0.4, // «Bombardo Maxima» takes 60 % of the skill
    NEVER: new Set(['WindMaxima', 'Inspirius']),
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const clampSkill = (s) => clamp(Math.floor(Number.isFinite(+s) ? +s : 1), STEADY.MIN, STEADY.MAX);

/** Metres of rough running for the next +1 at skill `n`. */
export const needFor = (n) => STEADY.NEED_BASE + STEADY.NEED_STEP * clampSkill(n);

/**
 * The chance (0 … 1) to stay on the feet. `kind`: the spell (null: no spell — a hit that steadiness does not resist);
 * `drop`: the fall in metres (a landing), `cause`: 'cannon'…
 */
export function holdChance(skill, kind = null, { drop = 0, cause = null, spell = true } = {}) {
    if (drop >= IMPACT.FALL_KNOCK_DROP) return 0;                  // (a deep fall: no steadiness helps)
    if (spell && (!kind || cause === 'cannon')) return 0;          // (a blow, a ball, a beast: not a spell)
    if (kind) {
        if (STEADY.NEVER.has(kind) || isDivine(kind)) return 0;
    }
    const p = clampSkill(skill) / STEADY.MAX;
    return kind === 'BombardoMaxima' ? p * STEADY.BOMBARDO_MAXIMA_K : p;
}

/** How rough the ground is for a step: 0 flat … 1 steep (rise over run). */
export const roughOf = (rise, run) => (run > 1e-3 ? clamp((Math.abs(rise) / run) / STEADY.STEEP_AT, 0, 1) : 0);

export class Steadiness {
    constructor(game) {
        this.game = game;
        this.skill = STEADY.MIN;
        this.acc = 0; // metres of rough running towards the next +1
        this.rough = 0; // smoothed roughness under the feet now, 0 … 1
        this._x = null; this._z = null; this._gy = null;
    }

    /** The skill as the rules see it (Creative: 100). */
    get effective() { return this.game.config?.mode === 'creative' ? STEADY.MAX : this.skill; }

    /** Does the hero stay on their feet? opts: see holdChance. */
    holds(kind, opts = {}, rnd = Math.random) {
        const p = holdChance(this.effective, kind, opts);
        return p > 0 && rnd() < p;
    }

    /** Run speed on rough ground: 1 … 1.3. */
    runK() { return 1 + STEADY.RUN_BONUS * ((this.skill - 1) / (STEADY.MAX - 1)) * this.rough; }

    /** Every frame: the way run over the ground is counted. */
    step(dt) {
        const g = this.game, ch = g.character;
        if (!ch || !(dt > 0)) return;
        const p = ch.group.position, gy = ch.groundY;
        const px = this._x, pz = this._z, pg = this._gy;
        this._x = p.x; this._z = p.z; this._gy = gy;
        const k = Math.min(1, dt / STEADY.SMOOTH);
        const ok = ch.isRunning && ch.onGround && ch.swimY == null && !g.knock?.down && !g.flight?.busy && !g.animals?.riding && !g.dragonRide?.busy
            && !g.levitation?.lifted && !g.boards?.mounted && !g.isDeadLocal && !g.beds?.lying && !g.combat?.dead;
        if (!ok || px == null || pg == null || !Number.isFinite(gy)) { this.rough += (0 - this.rough) * k; ch.steadyK = 1; return; }
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d > 3) { ch.steadyK = 1; return; } // (carried away: not a run)
        const r = roughOf(gy - pg, d);
        this.rough += (r - this.rough) * k;
        ch.steadyK = this.runK();
        if (g.config?.mode === 'creative' || this.skill >= STEADY.MAX) return;
        this.acc += d * (STEADY.FLAT_W + (1 - STEADY.FLAT_W) * this.rough);
        while (this.acc >= needFor(this.skill) && this.skill < STEADY.MAX) {
            this.acc -= needFor(this.skill);
            this.skill++;
            g.hud?.toast ? g.hud.toast('+1 к устойчивости') : g.hud?.setVoice?.('+1 к устойчивости', true);
        }
    }

    onDeath() { this.skill = STEADY.MIN; this.acc = 0; this.rough = 0; }

    snapshot() { return this.skill > STEADY.MIN || this.acc > 0 ? { skill: this.skill, acc: Math.round(this.acc) } : null; }

    /** Put a saved / legacy value on (REPLACES: the new life's growth is given up). */
    restore(s) {
        this.skill = clampSkill(s?.skill);
        this.acc = this.skill >= STEADY.MAX ? 0 : clamp(Number(s?.acc) || 0, 0, needFor(this.skill) - 1);
    }
}
