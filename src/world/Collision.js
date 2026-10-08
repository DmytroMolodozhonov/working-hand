/**
 * Collision.js — one place for every static obstacle in the world.
 *
 * Replaces the old per-frame loops over all walls / all table meshes with:
 *   - a grid lookup for map walls (O(1) per query),
 *   - a small spatial hash for boxes (tables, chests, tree trunks),
 *   - terrain columns (mountains, crater walls) queried directly.
 *
 * Everything is axis-aligned and allocation-free in the hot path.
 */

const HASH_CELL = 8;

export class CollisionWorld {
    constructor() {
        this.boxes = new Map(); // id -> box
        this.hash = new Map(); // "cx,cz" -> Set<box>
        this.walls = null; // {cellSize, height, set:Set<"gx,gz">}
        this.terrain = null; // TerrainData-compatible (topLayer)
        this.flatGroundY = -0.5; // where entities stand without terrain (original convention)
        this.floorY = -0.5; // visible floor for physical objects (custom maps draw the floor at 0)
        this._nextId = 1;
        this._tmp = [];
    }

    setTerrain(terrain) {
        this.terrain = terrain;
    }

    setWalls(walls, cellSize, height) {
        const set = new Set();
        for (const w of walls) set.add(Math.round(w.x / cellSize) + ',' + Math.round(w.z / cellSize));
        this.walls = { cellSize, height, set };
    }

    /**
     * Add an axis-aligned box. Returns its id (use removeBox to delete).
     * box: {minX,maxX,minY,maxY,minZ,maxZ, kind?, owner?}
     */
    addBox(box) {
        const id = this._nextId++;
        box.id = id;
        this.boxes.set(id, box);
        this._forCells(box, (key) => {
            if (!this.hash.has(key)) this.hash.set(key, new Set());
            this.hash.get(key).add(box);
        });
        return id;
    }

    removeBox(id) {
        const box = this.boxes.get(id);
        if (!box) return;
        this.boxes.delete(id);
        this._forCells(box, (key) => {
            const set = this.hash.get(key);
            if (set) set.delete(box);
        });
    }

    _forCells(box, fn) {
        const cx0 = Math.floor(box.minX / HASH_CELL), cx1 = Math.floor(box.maxX / HASH_CELL);
        const cz0 = Math.floor(box.minZ / HASH_CELL), cz1 = Math.floor(box.maxZ / HASH_CELL);
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cx + ',' + cz);
    }

    /** Boxes whose XZ footprint intersects the query rectangle. Reuses an internal array. */
    queryBoxes(minX, maxX, minZ, maxZ) {
        const out = this._tmp;
        out.length = 0;
        const cx0 = Math.floor(minX / HASH_CELL), cx1 = Math.floor(maxX / HASH_CELL);
        const cz0 = Math.floor(minZ / HASH_CELL), cz1 = Math.floor(maxZ / HASH_CELL);
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const set = this.hash.get(cx + ',' + cz);
                if (!set) continue;
                for (const b of set) {
                    if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
                    if (!out.includes(b)) out.push(b);
                }
            }
        }
        return out;
    }

    /** Ground (walkable surface) height at x,z ignoring boxes. */
    groundY(x, z) {
        return this.terrain ? this.terrain.surfaceY(x, z) : this.flatGroundY;
    }

    /**
     * The floor under a body whose feet can reach up to `reachY` (a step):
     * a ceiling, a roof or a cave above is not «ground».
     */
    groundAt(x, z, reachY) {
        if (!this.terrain || !this.terrain.floorBelow) return this.groundY(x, z);
        return this.terrain.floorBelow(Math.round(x), Math.round(z), Math.floor(reachY + 1.5)) - 0.5;
    }

    /** Visible floor / terrain height for physical objects (weapons, debris). */
    surfaceY(x, z) {
        return this.terrain ? this.terrain.surfaceY(x, z) : this.floorY;
    }

    /**
     * Highest supporting surface under a point that is not above `fromY`+tolerance
     * (terrain or the top of a box such as a table). Used by items / debris.
     */
    supportY(x, z, fromY, radius = 0) {
        let y = this.surfaceY(x, z);
        const boxes = this.queryBoxes(x - radius, x + radius, z - radius, z + radius);
        for (const b of boxes) {
            if (b.noSupport) continue;
            if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue;
            if (b.maxY <= fromY + 0.35 && b.maxY > y) y = b.maxY;
        }
        return y;
    }

    /**
     * Push a vertical cylinder (centre pos.x/pos.z, radius, feet..feet+height)
     * out of every obstacle. Mutates pos. Returns true if anything was hit.
     * stepHeight: terrain ledges up to this height can be walked onto.
     */
    resolveCylinder(pos, radius, feetY, height, stepHeight = 1.05) {
        let hit = false;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;

            // 1) Map walls (grid cells)
            if (this.walls) {
                const cs = this.walls.cellSize;
                const gx0 = Math.round((pos.x - radius - cs / 2) / cs), gx1 = Math.round((pos.x + radius + cs / 2) / cs);
                const gz0 = Math.round((pos.z - radius - cs / 2) / cs), gz1 = Math.round((pos.z + radius + cs / 2) / cs);
                for (let gz = gz0; gz <= gz1; gz++) {
                    for (let gx = gx0; gx <= gx1; gx++) {
                        if (!this.walls.set.has(gx + ',' + gz)) continue;
                        if (pushOutOfRect(pos, radius, gx * cs - cs / 2, gx * cs + cs / 2, gz * cs - cs / 2, gz * cs + cs / 2)) moved = true;
                    }
                }
            }

            // 2) Boxes (tables, chests, trunks) that overlap our vertical span
            const boxes = this.queryBoxes(pos.x - radius, pos.x + radius, pos.z - radius, pos.z + radius);
            for (let i = 0; i < boxes.length; i++) {
                const b = boxes[i];
                if (b.maxY <= feetY + 0.05 || b.minY >= feetY + height) continue;
                if (pushOutOfRect(pos, radius, b.minX, b.maxX, b.minZ, b.maxZ)) moved = true;
            }

            // 3) Terrain columns higher than a step
            if (this.terrain) {
                const ix0 = Math.round(pos.x - radius), ix1 = Math.round(pos.x + radius);
                const iz0 = Math.round(pos.z - radius), iz1 = Math.round(pos.z + radius);
                for (let iz = iz0; iz <= iz1; iz++) {
                    for (let ix = ix0; ix <= ix1; ix++) {
                        const top = this.terrain.topLayer(ix, iz) - 0.5;
                        if (top <= feetY + stepHeight) continue;
                        // something above the step — but is it in the way of the body (not a ceiling over the head)?
                        if (this.terrain.solidIn && !this.terrain.solidIn(ix, iz, Math.ceil(feetY + stepHeight + 0.5 + 1e-3), Math.floor(feetY + height + 1.5 - 1e-3))) continue;
                        if (pushOutOfRect(pos, radius, ix - 0.5, ix + 0.5, iz - 0.5, iz + 0.5)) moved = true;
                    }
                }
            }

            if (!moved) break;
            hit = true;
        }
        return hit;
    }

    /** Is a world point inside any solid obstacle? (projectiles, line of sight) */
    pointBlocked(x, y, z) {
        if (this.walls && y < this.walls.height) {
            const cs = this.walls.cellSize;
            if (this.walls.set.has(Math.round(x / cs) + ',' + Math.round(z / cs))) return true;
        }
        const boxes = this.queryBoxes(x, x, z, z);
        for (const b of boxes) {
            if (y >= b.minY && y <= b.maxY) return true;
        }
        if (y < this.surfaceY(x, z)) return true;
        return false;
    }

    /** Line of sight between two points (sampled; cheap and good enough). */
    lineOfSight(ax, ay, az, bx, by, bz, step = 1.0) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const n = Math.max(1, Math.ceil(len / step));
        for (let i = 1; i < n; i++) {
            const t = i / n;
            if (this.pointBlocked(ax + dx * t, ay + dy * t, az + dz * t)) return false;
        }
        return true;
    }

    clear() {
        this.boxes.clear();
        this.hash.clear();
        this.walls = null;
        this.terrain = null;
    }
}

/** Push circle out of rectangle along the axis of least penetration. */
export function pushOutOfRect(pos, r, minX, maxX, minZ, maxZ) {
    // Closest point on rect to circle centre
    const cx = pos.x < minX ? minX : pos.x > maxX ? maxX : pos.x;
    const cz = pos.z < minZ ? minZ : pos.z > maxZ ? maxZ : pos.z;
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = r - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        return true;
    }
    // Centre inside the rectangle: exit through the nearest side.
    const left = pos.x - minX, right = maxX - pos.x, back = pos.z - minZ, front = maxZ - pos.z;
    const m = Math.min(left, right, back, front);
    if (m === left) pos.x = minX - r;
    else if (m === right) pos.x = maxX + r;
    else if (m === back) pos.z = minZ - r;
    else pos.z = maxZ + r;
    return true;
}
