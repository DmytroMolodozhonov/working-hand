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
/** A cell's key: a number, not a string (the people's steps ask thousands of times a frame — no garbage). ±8000 km. */
const cellKey = (cx, cz) => cx * 2097152 + cz;

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
        // moving pieces of the world (ships, the gangplank): see src/game/ShipCollision.js
        this.movers = [];
    }

    addMover(m) { if (!this.movers.includes(m)) this.movers.push(m); }

    removeMover(m) { const i = this.movers.indexOf(m); if (i >= 0) this.movers.splice(i, 1); }

    /** The highest mover floor (a deck) under x,z reachable from reachY above `y`, else y. */
    _moverFloor(x, z, reachY, y) {
        for (let i = 0; i < this.movers.length; i++) {
            const m = this.movers[i];
            if (!m.hasXZ(x, z)) continue;
            const f = m.floorAt(x, z, reachY);
            if (f !== null && f > y) y = f;
        }
        return y;
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
            if (set) { set.delete(box); if (!set.size) this.hash.delete(key); } // (no empty cells left over the whole world)
        });
    }

    _forCells(box, fn) {
        const cx0 = Math.floor(box.minX / HASH_CELL), cx1 = Math.floor(box.maxX / HASH_CELL);
        const cz0 = Math.floor(box.minZ / HASH_CELL), cz1 = Math.floor(box.maxZ / HASH_CELL);
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cellKey(cx, cz));
    }

    /** Boxes whose XZ footprint intersects the query rectangle. Reuses an internal array. */
    queryBoxes(minX, maxX, minZ, maxZ) {
        const out = this._tmp;
        out.length = 0;
        const cx0 = Math.floor(minX / HASH_CELL), cx1 = Math.floor(maxX / HASH_CELL);
        const cz0 = Math.floor(minZ / HASH_CELL), cz1 = Math.floor(maxZ / HASH_CELL);
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const set = this.hash.get(cellKey(cx, cz));
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
        // (over a slab or a ramp: its surface right there — up a ramp the floor rises smoothly)
        const T = this.terrain;
        const y = !T || !T.floorBelow ? this.groundY(x, z) : T.floorAt ? T.floorAt(x, z, reachY) : T.floorBelow(Math.round(x), Math.round(z), Math.floor(reachY + 1.5)) - 0.5;
        return this.movers.length ? this._moverFloor(x, z, reachY, y) : y;
    }

    /** Is the point inside the world's rock (not a box, not open air in a cave)? */
    inRock(x, y, z) {
        if (!this.terrain?.blockAt || y >= this.surfaceY(x, z)) return false;
        return this.terrain.occupied ? this.terrain.occupied(x, y, z) : this.terrain.blockAt(Math.round(x), Math.floor(y + 1.5), Math.round(z)) !== 0;
    }

    /**
     * A point that got into rock (a thing dropped against a cave wall, a body that died against it) goes to the
     * nearest free place beside it at its own height — sideways, never up to the surface. Mutates pos.
     * Returns false when nothing free is near (it then stays where it is).
     */
    pushOutOfRock(pos) {
        if (!this.inRock(pos.x, pos.y, pos.z)) return true;
        for (let r = 0.5; r <= 3; r += 0.5) {
            for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2, x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
                if (!this.inRock(x, pos.y, z)) { pos.x = x; pos.z = z; return true; }
            }
        }
        return false;
    }

    /**
     * The underside of the rock (a cave roof, a ceiling) above a body over x,z whose head is at
     * `headY` or above it — the head may rise to it, never into it. Infinity: the open sky.
     */
    ceilingAt(x, z, headY) {
        let c = Infinity;
        if (this.terrain?.ceilingY) c = this.terrain.ceilingY(x, z, headY); // (under an upside-down ramp: its underside there)
        else if (this.terrain?.ceilingAbove) {
            const L = this.terrain.ceilingAbove(Math.round(x), Math.round(z), Math.floor(headY + 1.5));
            if (L !== Infinity) c = L - 1.5;
        }
        // (a static mover with roofs — the Temple of the Gods: its ceilings too)
        for (let i = 0; i < this.movers.length; i++) {
            const m = this.movers[i];
            if (m.ceilingAt && m.hasXZ(x, z)) c = Math.min(c, m.ceilingAt(x, z, headY));
        }
        return c;
    }

    /**
     * Like groundAt, but the top of a solid box under the point (a low stone foot, a chest, a bed)
     * is a floor too when the feet reach it — what a body that steps onto boxes stands on.
     */
    standAt(x, z, reachY) {
        let y = this.groundAt(x, z, reachY);
        const boxes = this.queryBoxes(x, x, z, z);
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (b.noSupport || b.maxY > reachY || b.maxY <= y) continue;
            if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
            y = b.maxY;
        }
        return y;
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
        return this.movers.length ? this._moverFloor(x, z, fromY + 0.35, y) : y;
    }

    /**
     * Push a vertical cylinder (centre pos.x/pos.z, radius, feet..feet+height)
     * out of every obstacle. Mutates pos. Returns true if anything was hit.
     * stepHeight: terrain ledges up to this height can be walked onto.
     * stepBoxes: solid boxes as low as a step can be walked onto too (the body then stands on
     * them: standAt) — only for a body whose ground knows boxes (the player).
     * rockHeight: the height against the world's blocks (the player's head ducks a little by itself
     * under a rock just too low — Character.bodyHeight; the body then goes lower: Game._roofNeed).
     */
    resolveCylinder(pos, radius, feetY, height, stepHeight = 1.05, stepBoxes = false, rockHeight = height) {
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
                if (stepBoxes && !b.noSupport && b.maxY <= feetY + stepHeight) continue; // (a step up onto it)
                if (pushOutOfRect(pos, radius, b.minX, b.maxX, b.minZ, b.maxZ)) moved = true;
            }

            // 3) Terrain columns higher than a step
            if (this.terrain) {
                const ix0 = Math.round(pos.x - radius), ix1 = Math.round(pos.x + radius);
                const iz0 = Math.round(pos.z - radius), iz1 = Math.round(pos.z + radius);
                for (let iz = iz0; iz <= iz1; iz++) {
                    for (let ix = ix0; ix <= ix1; ix++) {
                        // (a ramp: its surface where the body meets it — one rising away is walked up, not a wall)
                        const top = this.terrain.topNear ? this.terrain.topNear(ix, iz, pos.x, pos.z) : this.terrain.topLayer(ix, iz) - 0.5;
                        if (top <= feetY + stepHeight) continue;
                        // something above the step — but is it in the way of the body (not a ceiling over the head)?
                        // The body over this column stands on its floor (a step up): the room is measured from
                        // there — a step under a low roof is a wall, not a place the body is shoved off sideways
                        // once it is on it (a cave's mounds under its ragged roof: stuck and sliding).
                        if (this.terrain.solidIn) {
                            const reach = Math.floor(feetY + stepHeight + 0.5 + 1e-9);
                            const stand = this.terrain.floorBelow ? Math.max(feetY, this.terrain.floorBelow(ix, iz, reach) - 0.5) : feetY;
                            if (!this.terrain.solidIn(ix, iz, reach + 1, Math.floor(stand + rockHeight + 1.5 - 1e-3))) continue;
                        }
                        if (pushOutOfRect(pos, radius, ix - 0.5, ix + 0.5, iz - 0.5, iz + 0.5)) moved = true;
                    }
                }
            }

            // 4) Ships: their rails, masts, bulkheads… (a body inside stays inside)
            for (let i = 0; i < this.movers.length; i++) {
                const m = this.movers[i];
                if (m.hasXZ(pos.x, pos.z, radius) && m.pushCylinder(pos, radius, feetY, height, stepHeight)) moved = true;
            }

            if (!moved) break;
            hit = true;
        }
        return hit;
    }

    /** The added box a world point is in (a cauldron, a chest, a bed, a door…), or null. */
    boxAt(x, y, z) {
        for (const b of this.queryBoxes(x, x, z, z)) if (y >= b.minY && y <= b.maxY) return b;
        return null;
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
        // under the ground's top — unless it is open air there (a cave, a tunnel, under a ledge):
        // a light thrown in a cave flies on, it does not stick at the hand
        if (y < this.surfaceY(x, z) && (!this.terrain?.blockAt || (this.terrain.occupied ? this.terrain.occupied(x, y, z) : this.terrain.blockAt(Math.round(x), Math.floor(y + 1.5), Math.round(z)) !== 0))) return true;
        for (let i = 0; i < this.movers.length; i++) {
            const m = this.movers[i];
            if (m.hasXZ(x, z) && m.pointBlocked(x, y, z)) return true;
        }
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
        this.movers = [];
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
