/**
 * HandSmooth.js — «Плавность камеры» for the hands and the wand too (the author: «нет плавности»; the setting used to steady
 * only the head's view). 0 % — as quick as the camera can (every tremble shown), 100 % — as smooth as it gets (slower);
 * the default 70 % is the balance the pointing bench chose (tools/handbench/pointbench.mjs: the still wand's tremble
 * ≤ ~0.3°, a careful aim close behind). It scales the cut-offs of the hand's filter (TrackingGuard.HandFilter) and of the
 * wand's own steadying (V5WandAim.AimSteady) — both read their numbers every picture / frame, so it works at once.
 */
import { HandStabilizer } from './TrackingGuard.js';
import { V5_WAND } from '../game/V5WandAim.js';

const BASE = { hand: { ...HandStabilizer.params }, wand: { ...V5_WAND.STEADY } };
export const HAND_SMOOTH_DEFAULT = 70;

/** The cut-offs' factor for the setting (0…100 %): 1 at the default, ×4 at 0 %, ×0.55 at 100 %. */
export function smoothFactor(v) {
    const s = Math.max(0, Math.min(100, Number.isFinite(+v) ? +v : HAND_SMOOTH_DEFAULT)) / 100;
    return Math.pow(2, (HAND_SMOOTH_DEFAULT / 100 - s) * 2.86);
}

/** Apply the setting (0…100 %) to new and running filters; `poseService` — its two hands' filters now. */
export function setHandSmoothness(v, poseService = null) {
    const f = smoothFactor(v);
    HandStabilizer.params = { ...BASE.hand, minCutoff: BASE.hand.minCutoff * f, dead: (BASE.hand.dead ?? 0.3) / Math.sqrt(f) };
    V5_WAND.STEADY.minCutoff = BASE.wand.minCutoff * f;
    V5_WAND.STEADY.dead = BASE.wand.dead / Math.sqrt(f);
    for (const side of ['left', 'right']) {
        const flt = poseService?.handGuards?.[side]?.filter;
        if (flt) { flt.minCutoff = HandStabilizer.params.minCutoff; flt.dead = HandStabilizer.params.dead; }
    }
    return f;
}
