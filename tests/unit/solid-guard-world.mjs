/**
 * A tiny house for the solid-guard tests and the bench: floor top y = 0.5 (layer 2 is the first air layer), walls as terrain blocks,
 * a bed (collision box 2.5 × 5.5 × 1.0), a chest, a cupboard (blocks), a door gap in the south wall, a stair-step of blocks.
 */
export const FLOOR = 0.5;
export function house({ w = 11, d = 9, bed = true, chest = true, cupboard = true, door = true } = {}) {
    const blocks = new Set();
    const key = (x, z, l) => x + ',' + z + ',' + l;
    // walls: every cell outside the room, 8 layers high (2..9); a door gap 3 wide in the south wall (z = d+1) at x 5..7, 6 high
    for (let x = 0; x <= w + 1; x++) for (let z = 0; z <= d + 1; z++) {
        const inside = x >= 1 && x <= w && z >= 1 && z <= d;
        if (inside) continue;
        for (let l = 2; l <= 9; l++) {
            if (door && z === d + 1 && x >= 5 && x <= 7 && l <= 7) continue;
            blocks.add(key(x, z, l));
        }
    }
    if (cupboard) for (let l = 2; l <= 4; l++) for (let x = w - 1; x <= w; x++) blocks.add(key(x, 3, l)); // a cupboard of blocks against the east wall
    for (let i = 0; i < 4; i++) for (let l = 2; l < 2 + i + 1; l++) for (let z = 4; z <= 6; z++) blocks.add(key(4 + i, z, l)); // steps
    const boxes = [];
    if (bed) boxes.push({ minX: 1, maxX: 3.5, minZ: 1, maxZ: 6.5, minY: FLOOR, maxY: FLOOR + 1.0, kind: 'bed' });
    if (chest) boxes.push({ minX: 7, maxX: 9, minZ: 7.2, maxZ: 8.4, minY: FLOOR, maxY: FLOOR + 1.3, kind: 'chest' });
    const list = [];
    return {
        blocks, boxes, w, d,
        world: {
            boxes(a, b, c, e) { list.length = 0; for (const x of boxes) if (!(x.maxX < a || x.minX > b || x.maxZ < c || x.minZ > e)) list.push(x); return list; },
            solid(ix, iz, lo, hi) { for (let l = lo; l <= hi; l++) if (blocks.has(key(ix, iz, l))) return true; return false; },
            floor(x, z, reachY) {
                // the floor is the top of the highest stair block under the point that the feet reach, else the room floor
                const ix = Math.round(x), iz = Math.round(z);
                let top = FLOOR;
                for (let l = 2; l <= 9; l++) if (blocks.has(key(ix, iz, l)) && l - 0.5 <= reachY + 0.01 && l - 0.5 > top) top = l - 0.5;
                return top;
            },
        },
    };
}
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
