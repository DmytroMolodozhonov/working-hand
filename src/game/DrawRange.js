/**
 * How far people (and other creatures) are drawn: as far as the world itself — «Прорисовка мира»
 * (TerrainView.viewDistance). A mountain you can see has the people on it seen too (the author:
 * «NPC и игроки — высший приоритет прорисовки»). Far ones are made cheap, never invisible:
 * near — as is; middle — one merged shape; distant — the same shape, the pose renewed rarely.
 */
export const DRAW = {
    MARGIN: 40, // m: a little further than the land under them
    MIN: 220, // m: whatever the settings say, a person this near is always drawn
    CAM_FAR: 990, // m: the camera's far plane is 1000
    DISTANT: 130, // m: from here — the pose renewed rarely, no bubble and bar (but a fighter stays whole)
    DISTANT_STEP: 0.3, // s between poses of a distant person
};

/** The distance, m, up to which creatures are drawn, for the world's `viewDistance`. */
export function drawRange(viewDistance) {
    const v = Number.isFinite(viewDistance) ? viewDistance : 0;
    return Math.min(DRAW.CAM_FAR, Math.max(DRAW.MIN, v + DRAW.MARGIN));
}

/** 'none' | 'near' | 'far' (one merged shape) | 'distant' — for a creature `d` m away; a fighter is never cheapened. */
export function drawLevel(d, range, { foe = false, shadowNear = 45 } = {}) {
    if (d >= range) return 'none';
    if (foe) return 'near';
    if (d <= shadowNear) return 'near';
    return d > DRAW.DISTANT ? 'distant' : 'far';
}
