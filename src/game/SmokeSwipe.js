/**
 * SmokeSwipe.js — a wizard turns a wave of smoke aside with one stroke of the wand: from above downwards, aslant. No words, no scroll —
 * known from the very start (the author), 3 mana a stroke. The smoke is thrown along the stroke's side and a little down, strongest near the
 * wand (WizardMind.smokeStroke / smokeKick — the numbers and the check, node-tested); only the hand that holds the wand does it.
 *
 * ON WHOM AND ON WHAT (CLAUDE.md): it moves only SMOKE (the particles of a fire, the Hellfire, a burning house) — no creature, no flame, no
 * block, no spell is touched; nothing is pushed, nothing hurt. It does not put a fire out (that is «Firefighting»).
 * The castle wizards do the same stroke (WizardLife._smoke: FX.SWIPE, seen — and applied to the smoke — on every computer).
 * Not cast under «Imperius», in a space without air (no smoke there), nor with the wand not in the hand.
 */

import * as THREE from 'three';
import { SMOKE, smokeStroke, smokeKick } from './WizardMind.js';

const _tip = new THREE.Vector3();

export class SmokeSwipe {
    constructor(game) {
        this.game = game;
        this.hist = []; // {t, x, y, z} of the wand's tip, the last MAX_T seconds
        this.cd = 0;
        this.log = [];
    }

    /** Throw the smoke round (x, y, z) along a stroke (the same for the hero and a wizard; every computer for its own smoke). */
    static sweep(fx, x, y, z, stroke) {
        if (!fx?.smoke || !stroke) return 0;
        return fx.smoke.impulse(x, y, z, SMOKE.R, (d, ax, az, out) => !!smokeKick(stroke, d, ax, az, out));
    }

    update(dt) {
        const g = this.game, fx = g.fx;
        this.cd -= dt;
        // no smoke about — nothing to sweep, and nothing is watched (a stroke is only looked for when smoke is near)
        if (!fx?.smoke || fx.smoke.active < 6 || g.isDeadLocal || g.combat?.dead || g.imperius?.active || g.spellBusy?.()) { this.hist.length = 0; return; } // (a spell is held or just cast — the hand is busy with it: no stroke)
        const w = g.items?.heldOf?.('wand');
        if (!w) { this.hist.length = 0; return; }
        if (!g.wandMagic?.tip?.(_tip)) { this.hist.length = 0; return; }
        const t = performance.now() / 1000;
        this.hist.push({ t, x: _tip.x, y: _tip.y, z: _tip.z });
        while (this.hist.length && t - this.hist[0].t > SMOKE.MAX_T) this.hist.shift();
        if (this.cd > 0 || this.hist.length < 3) return;
        // the smoke must be within reach of the wand
        if (!fx.smoke.countNear(_tip.x, _tip.y, _tip.z, SMOKE.R)) return;
        // the best start in the window: the stroke is the longest run that goes down and aslant fast enough
        for (const a of this.hist) {
            const st = smokeStroke(_tip.x - a.x, _tip.y - a.y, _tip.z - a.z, t - a.t);
            if (!st) continue;
            const c = g.combat;
            if (c?.manaOn && c.fatigue < SMOKE.COST) return; // (no mana: no stroke; nothing is said — it is not a spell the hero speaks)
            c?.drain?.(SMOKE.COST, 0);
            this.cd = SMOKE.CD;
            this.hist.length = 0;
            const mid = { x: (_tip.x + a.x) / 2, y: (_tip.y + a.y) / 2, z: (_tip.z + a.z) / 2 };
            const n = SmokeSwipe.sweep(fx, mid.x, mid.y, mid.z, st);
            // the trace of the stroke: a short bright line in the air
            for (let i = 0; i <= 6; i++) fx.spark?.(new THREE.Vector3(a.x + (_tip.x - a.x) * i / 6, a.y + (_tip.y - a.y) * i / 6, a.z + (_tip.z - a.z) * i / 6), 0xbfe9ff, 0.07, new THREE.Vector3(0, 0, 0), 0.45);
            g.sound?.playSpellFx?.('fxVacuum', _tip, 0.35, 1.4);
            this.log.push({ ev: 'swipe', n, speed: Math.round(st.speed * 10) / 10 });
            if (this.log.length > 20) this.log.shift();
            return;
        }
    }
}
