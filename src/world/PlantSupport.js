import { BLOCK } from './Terrain.js';

/** Check the floor at the root's elevation, without loading new land or using a roof above it. */
export function hasPlantSupport(terrain, x, y, z, tolerance = .30) {
    const ix = Math.round(x), iz = Math.round(z);
    if (!terrain || (terrain.landMade && !terrain.landMade(ix, iz))) return true;
    if (terrain.floorAt) return terrain.floorAt(x, z, y + .48) >= y - tolerance;
    if (!terrain.get) return true;
    const block = terrain.get(ix, Math.round(y + .5), iz);
    return block !== BLOCK.AIR && block !== BLOCK.WATER;
}

/** Roots can stick out over an edge, provided some of the trunk still has a footing. */
export function hasTreeSupport(terrain, tree) {
    const { x, z } = tree, y = tree.y ?? -.5;
    if (hasPlantSupport(terrain, x, y, z, .55)) return true;
    if (tree.fallen) {
        const sign = tree.fallen.startsWith('-') ? -1 : 1;
        const alongX = tree.fallen.endsWith('x');
        for (const fraction of [.35, .7, 1]) {
            const d = (tree.c0 || 4) * fraction * sign;
            if (hasPlantSupport(terrain, x + (alongX ? d : 0), y, z + (alongX ? 0 : d), .55)) return true;
        }
        return false;
    }
    const r = tree.r || .45;
    return hasPlantSupport(terrain, x - r * .65, y, z, .55) || hasPlantSupport(terrain, x + r * .65, y, z, .55)
        || hasPlantSupport(terrain, x, y, z - r * .65, .55) || hasPlantSupport(terrain, x, y, z + r * .65, .55);
}
