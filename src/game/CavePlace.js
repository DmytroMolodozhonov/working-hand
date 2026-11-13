/** Being below a cave's natural surface survives a shaft opened to the sky.
 * The caller must already be inside a known cave system: a building roof or open field is not a cave.
 * heightAt is the original terrain recipe, unlike topLayer which moves down when the roof is dug out.
 */
export function belowCaveSurface(t, x, z, feetY) {
    if (!t?.heightAt || !Number.isFinite(feetY)) return false;
    const layer = t.heightAt(Math.round(x), Math.round(z));
    return Number.isFinite(layer) && layer - 0.5 - feetY >= 3;
}
