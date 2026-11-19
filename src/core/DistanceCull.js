/**
 * DistanceCull.js — what is wholly behind the haze is not drawn (the author 19.11: «даже в обычном режиме — оптимизация того, что не видно»).
 *
 * The fog hides everything beyond `fog.far` (the background is the fog's colour), yet houses, ships, herds, far shapes kept drawing there: in the lite
 * measure 12 of the 22 heaviest things of the scene were 90–360 m away, behind a 45 m haze. Every CHECK_S the scene's top-level objects farther than
 * `fogFar + HIDE` are hidden (`visible = false`) and shown again when nearer than `fogFar + SHOW` (a gap: no flicker at the border).
 *   • only what THIS module hid is ever shown again (an object that its owner hid for its own reasons stays hidden);
 *   • not lights, not the camera, not the big shared things drawn from the middle (terrain, sea, flora, sky…: `SKIP_NAMES`), not what is marked `userData.noCull`;
 *   • not what is farther than FAR_LIMIT (planets, stars, the sun and moon: they are not behind the haze, they are the sky);
 *   • an object's size is not known from its pivot: HIDE leaves a margin for a big one (a castle's pivot at its corner).
 * Pure decision (`decide`) is tested; `DistanceCull.update` walks the scene.
 */
export const CULL = { HIDE: 90, SHOW: 60, FAR_LIMIT: 1500, CHECK_S: 0.3 };
export const SKIP_NAMES = new Set(['terrain', 'sea', 'magicFlora', 'sky', 'sun', 'moon', 'stars', 'clouds', 'space']);

/** d: distance from the hero (m), fogFar: where the haze ends, hidden: is it hidden by us now? → 'hide' | 'show' | null. */
export function decide(d, fogFar, hidden) {
    if (!(fogFar > 0)) return hidden ? 'show' : null; // (no fog: everything back)
    if (!hidden) return d > fogFar + CULL.HIDE && d < CULL.FAR_LIMIT ? 'hide' : null;
    return d <= fogFar + CULL.SHOW || d >= CULL.FAR_LIMIT ? 'show' : null;
}

export class DistanceCull {
    constructor() { this.t = 0; this.mine = new Set(); this.stats = { hidden: 0 }; this.enabled = true; }

    update(dt, scene, fx, fy, fz, fogFar) {
        this.t -= dt;
        if (this.t > 0) return;
        this.t = CULL.CHECK_S;
        if (!this.enabled || !scene) { this.showAll(); return; }
        for (const o of scene.children) {
            if (o.isLight || o.isCamera || o.userData?.noCull || SKIP_NAMES.has(o.name)) continue;
            const hidden = this.mine.has(o);
            if (!hidden && !o.visible) continue; // (hidden by its owner: not ours)
            const dx = o.position.x - fx, dz = o.position.z - fz, d = Math.sqrt(dx * dx + dz * dz);
            const a = decide(d, fogFar, hidden);
            if (a === 'hide') { o.visible = false; this.mine.add(o); }
            else if (a === 'show') { o.visible = true; this.mine.delete(o); }
        }
        // (objects removed from the scene while hidden)
        if (this.mine.size > 0) for (const o of this.mine) if (!o.parent) this.mine.delete(o);
        this.stats.hidden = this.mine.size;
    }

    showAll() { for (const o of this.mine) o.visible = true; this.mine.clear(); this.stats.hidden = 0; }
}
