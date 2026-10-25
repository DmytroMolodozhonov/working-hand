/**
 * ItemSupport.js — what a loose thing lies on besides the ground: the top of a solid box of the world
 * (a bed, a chest, a stool, a bench). Without it a thing let go over a bed hung in the mattress or sank through.
 */

/** The top of the highest supporting box under (x, z) that is not more than a step above `y`; −Infinity when none. */
export function boxTopUnder(col, x, z, y, step = 0.35) {
    let top = -Infinity;
    if (!col?.queryBoxes) return top;
    const boxes = col.queryBoxes(x, x, z, z);
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.noSupport || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (b.maxY <= y + step && b.maxY > top) top = b.maxY;
    }
    return top;
}
