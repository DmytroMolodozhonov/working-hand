/**
 * Trees.js — the real trees of the worlds made with them (`realTrees`, every world made from now on): drawn, hit, burnt, felled and
 * carried like the start area's trees always were (World.trees), but all over the world.
 *
 * Where they stand comes with the land (`chunk.trees`, made in the terrain workers by the block trees' own rules —
 * Terrain._meshTree); what they look like is one of TreeBuild's shapes per kind (TREE_GEN.VARIANTS), turned, sized
 * and tinted for each tree. A chunk's trees join `world.trees` when its land is drawn and leave when it goes; what
 * happened to a tree (taken, burnt, carried) is kept by its id, so it is the same when its land comes back.
 *
 * Drawing: one instanced mesh per shape for the bark and one for the leaves, shared by every tree of that shape —
 * the detailed shape near (NEAR m), a light one far away (the same tree, fewer branches and leaves); the lists are
 * remade only when the player has moved or turned, or a tree changed — not every frame. Shadows near only.
 * Collision: the trunk is solid (a box round it, up to where the branches begin — walk under the crown); the
 * crown is a few spheres that stop flying spells (World.leavesAt), not the player.
 */
import * as THREE from 'three';
import { TREE_GEN } from './TreeBuild.js';
import { sharedTreeMaterials, treeGeometry } from './TreeMaterials.js';

export const TREES = {
    NEAR: 64, // m: the detailed shape within this
    FAR_SHAPES: 6, // far shapes per kind (a far tree takes the one of its variant % FAR_SHAPES)
    REGISTER_MS: 1.2, // ms a frame for taking new chunks' trees in
    MOVE: 2.5, // m the player moves before the lists are remade
    TURN: 0.06, // rad the view turns before the lists are remade
    REMAKE_S: 0.6, // and at least this often
    CHAR: 0x3a3029, // a burnt trunk
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), _c = new THREE.Color(), _dir = new THREE.Vector3();

export class WorldTrees {
    /** @param {import('./World.js').World} world */
    constructor(world) {
        this.world = world;
        this.scene = world.scene;
        this.collision = world.collision;
        const M = sharedTreeMaterials();
        this.bark = M.bark;
        this.leaves = M.leaves;
        this.depth = M.depth;
        this.group = new THREE.Group();
        this.group.name = 'trees';
        this.scene.add(this.group);
        this.byId = new Map(); // id → tree (registered: in world.trees)
        this.byChunk = new Map(); // chunk key → [trees]
        this.gone = new Set(); // ids taken away (Gather, blown up, come alive…)
        this.burnt = new Set(); // ids burnt down (the trunk stands, charred)
        this.moved = new Map(); // id → [x, y, z, dir] (carried by «Левиоса Максима»)
        this.meshes = new Map(); // shape key → {wood, leaf, n}
        this._dirty = true;
        this._t = 0;
        this._at = new THREE.Vector3(1e9, 0, 1e9);
        this._look = new THREE.Vector3();
        this.stats = { registered: 0, drawn: 0, near: 0, shapes: 0 };
    }

    // ------------------------------------------------------------------ the trees in the world
    /** A tree record (the World.trees format) from a chunk's entry or a start-area tree. */
    _make(e) {
        const g = treeGeometry(e.kind, e.v, false).info;
        const s = e.s || 1;
        const t = {
            mesh: true, index: e.id, id: e.id, x: e.x, y: e.y, z: e.z, kind: e.kind, v: e.v, scale: s, turn: e.turn || 0, tint: e.tint || 1,
            alive: true, boxId: null, crown: null, h: g.H * s, c0: Math.max(3.5, g.crown.lowest * s), r: Math.max(0.28, g.trunk.r * s),
            spheres: g.spheres, fallen: null, matrix: new THREE.Matrix4(), fixed: !!e.fixed,
        };
        return t;
    }

    /** Put a tree in the world: its collision, its crown's box, in world.trees. */
    _add(t) {
        const was = this.moved.get(t.id);
        if (was) Object.assign(t, { x: was[0], y: was[1], z: was[2], fallen: was[3] || null, moved: true });
        if (this.burnt.has(t.id)) t.burnt = true;
        this._place(t);
        this.byId.set(t.id, t);
        const W = this.world.trees;
        t._slot = W.length;
        W.push(t);
        this._dirty = true;
    }

    _remove(t) {
        if (t.boxId != null) { this.collision.removeBox(t.boxId); t.boxId = null; }
        const W = this.world.trees, i = t._slot;
        if (W[i] === t) { const last = W.pop(); if (last !== t) { W[i] = last; last._slot = i; } }
        this.byId.delete(t.id);
        this._dirty = true;
    }

    /** Its matrix, its trunk's box, its crown's box — standing at (x, y, z), or lying felled towards t.fallen. */
    _place(t) {
        const s = t.scale, dir = t.fallen;
        _q.setFromAxisAngle(_y, t.turn);
        t.matrix.compose(_p.set(t.x, t.y, t.z), _q, _s.set(s, s, s));
        if (t.boxId != null) { this.collision.removeBox(t.boxId); t.boxId = null; }
        if (dir) {
            const dx = dir === 'x' ? 1 : dir === '-x' ? -1 : 0, dz = dir === 'z' ? 1 : dir === '-z' ? -1 : 0;
            const R = _m.makeRotationAxis(_dir.set(dz, 0, -dx), Math.PI / 2);
            const fell = new THREE.Matrix4().makeTranslation(t.x, t.y + t.r, t.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-t.x, -t.y, -t.z));
            t.matrix.premultiply(fell);
            const along = (a0, a1, w) => (dx ? { minX: t.x + Math.min(a0 * dx, a1 * dx), maxX: t.x + Math.max(a0 * dx, a1 * dx), minZ: t.z - w, maxZ: t.z + w }
                : { minX: t.x - w, maxX: t.x + w, minZ: t.z + Math.min(a0 * dz, a1 * dz), maxZ: t.z + Math.max(a0 * dz, a1 * dz) });
            if (t.alive) t.boxId = this.collision.addBox({ ...along(-0.5, t.c0, t.r), minY: t.y, maxY: t.y + t.r * 2, kind: 'tree', noSupport: true });
            const cw = (t.h - t.c0) * 0.5;
            t.crown = t.burnt ? null : { ...along(t.c0, t.h, cw), minY: t.y, maxY: t.y + cw * 2 };
            return;
        }
        // the trunk: solid up to where the branches begin (walk under the crown); a box round its foot
        if (t.alive) t.boxId = this.collision.addBox({ minX: t.x - t.r, maxX: t.x + t.r, minY: t.y - 0.5, maxY: t.y + Math.min(t.c0, 6), minZ: t.z - t.r, maxZ: t.z + t.r, kind: 'tree', noSupport: true });
        // the crown: the box round its leaf clusters (turned with the tree: its widest reach any way)
        let rx = 0, y0 = Infinity, y1 = -Infinity;
        for (const [x, y, z, r] of t.spheres) { rx = Math.max(rx, Math.hypot(x, z) + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); }
        rx *= t.scale;
        t.crown = t.burnt || !t.spheres.length ? null : { minX: t.x - rx, maxX: t.x + rx, minY: t.y + Math.max(t.c0, y0 * t.scale), maxY: t.y + y1 * t.scale, minZ: t.z - rx, maxZ: t.z + rx };
    }

    /** Is (x, y, z) in this tree's leaves (one of its clusters)? — the crown stops flying spells, not the player. */
    leavesHit(t, x, y, z) {
        const c = t.crown;
        if (!c || x < c.minX || x > c.maxX || y < c.minY || y > c.maxY || z < c.minZ || z > c.maxZ) return false;
        if (t.fallen) return true;
        // (into the tree's own frame: turned back, scaled back)
        const s = t.scale, dx = (x - t.x) / s, dy = (y - t.y) / s, dz = (z - t.z) / s;
        const cs = Math.cos(-t.turn), sn = Math.sin(-t.turn);
        const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs; // (rotation about y by turn, inverted)
        for (const [sx, sy, sz, r] of t.spheres) {
            const ex = lx - sx, ey = dy - sy, ez = lz - sz;
            if (ex * ex + ey * ey + ez * ez <= r * r) return true;
        }
        return false;
    }

    /** A place on top of one of a tree's leaf clusters (a book-bird sits there). */
    perch(t, rnd = Math.random) {
        const sp = t.spheres.filter((s) => s[1] > t.c0 / t.scale);
        const [x, y, z, r] = sp.length ? sp[Math.floor(rnd() * sp.length)] : [0, t.h / t.scale, 0, 0];
        return new THREE.Vector3(x, y + r * 0.7, z).applyMatrix4(t.matrix);
    }

    /** The start area's trees of a world of real trees: real trees too (World.createTrees picks their places). */
    addFixed(list) {
        for (const e of list) {
            if (this.gone.has(e.id)) continue;
            const t = this._make({ ...e, fixed: true });
            this._add(t);
        }
    }

    // ------------------------------------------------------------------ what happens to them
    /** «Gather», a blast, «Alive»…: the tree is gone (for good: its id is remembered). */
    removeTree(t) {
        if (!t.alive) return;
        t.alive = false;
        this.gone.add(t.id);
        this.moved.delete(t.id);
        if (t.boxId != null) { this.collision.removeBox(t.boxId); t.boxId = null; }
        t.crown = null;
        this._dirty = true;
    }

    /** A tree already gone (a save / the host's word) — maybe its land is not here yet: it stays gone when it comes. */
    goneById(id) {
        this.gone.add(id);
        const t = this.byId.get(id);
        if (t && t.alive) this.removeTree(t);
    }

    /** Burnt down: the crown is gone, the trunk stands charred. */
    burnTree(t) {
        t.burnt = true;
        this.burnt.add(t.id);
        t.crown = null;
        this._dirty = true;
    }

    /** Carried and put down at (x, y, z), standing or lying towards dir. */
    placeTree(t, x, y, z, dir = null) {
        Object.assign(t, { x, y, z, fallen: dir || null, alive: true, moved: true });
        this.gone.delete(t.id);
        this.moved.set(t.id, [x, y, z, dir || 0]);
        this._place(t);
        if (!this.byId.has(t.id)) this._add(t);
        this._dirty = true;
    }

    /** A carried tree from a save / the host (its land may not be here yet: then it is put down when it comes). */
    movedById(id, x, y, z, dir) {
        const t = this.byId.get(id);
        if (t) this.placeTree(t, x, y, z, dir || null);
        else this.moved.set(id, [x, y, z, dir || 0]);
    }

    /** Sink a tree by dy (the ground under it went down: «Drawdown»). */
    shift(t, dy) {
        t.y += dy;
        this._place(t);
        this._dirty = true;
    }

    /**
     * A tree's own model as it is drawn: [{geometry, material, matrix, color, depth}] — the trunk, then the crown —
     * for a copy of it (carried by «Левиоса Максима», come alive — LivingTrees).
     */
    parts(t, matrix = t.matrix) {
        const g = treeGeometry(t.kind, t.v, false);
        const tint = _c.setScalar(t.tint).clone();
        const out = [{ geometry: g.wood, material: this.bark, matrix: matrix.clone(), color: t.burnt ? new THREE.Color(TREES.CHAR) : null }];
        if (!t.burnt) out.push({ geometry: g.leaf, material: this.leaves, matrix: matrix.clone(), color: tint, depth: this.depth });
        return out;
    }

    /** A standing tree's matrix at another place (its turn and size kept). */
    matrixAt(t, x, y, z) {
        _q.setFromAxisAngle(_y, t.turn);
        return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(t.scale, t.scale, t.scale));
    }

    // ------------------------------------------------------------------ every frame
    /**
     * Take the trees of the chunks just drawn in, let go of those whose land went away, and (when the player moved,
     * turned, or a tree changed) remake what is drawn.
     */
    update(dt, focus, camera) {
        const terrain = this.world.terrain;
        if (terrain && focus) this._stream(terrain);
        this._t += dt;
        if (!camera) return;
        camera.getWorldDirection(_dir);
        const moved = this._at.distanceToSquared(camera.position) > TREES.MOVE * TREES.MOVE || this._look.angleTo(_dir) > TREES.TURN;
        if (!this._dirty && !moved && this._t < TREES.REMAKE_S) return;
        this._at.copy(camera.position);
        this._look.copy(_dir);
        this._t = 0;
        this._dirty = false;
        this._draw(camera);
    }

    _stream(terrain) {
        const data = terrain.data, t0 = performance.now();
        // the land that went away: its trees go (a carried tree stays where it was put)
        for (const [key, list] of this.byChunk) {
            if (terrain.meshes.has(key)) continue;
            for (const t of list) if (!t.moved && this.byId.get(t.id) === t) this._remove(t);
            this.byChunk.delete(key);
        }
        // the land just drawn: its trees come (a few chunks a frame)
        for (const [key, e] of terrain.meshes) {
            if (this.byChunk.has(key)) continue;
            const c = data.chunks.get(key);
            if (!c) continue;
            const list = [];
            for (const it of c.trees || []) {
                if (this.gone.has(it.id) || this.byId.has(it.id)) continue;
                const t = this._make(it);
                this._add(t);
                list.push(t);
            }
            this.byChunk.set(key, list);
            if (performance.now() - t0 > TREES.REGISTER_MS) break;
        }
        this.stats.registered = this.byId.size;
    }

    /** One shape's instanced meshes (made when first needed; grown ×2 when full). */
    _shape(kind, v, far, need) {
        const key = kind * 1000 + v * 2 + (far ? 1 : 0);
        let e = this.meshes.get(key);
        if (e && e.cap >= need) return e;
        const cap = Math.max(16, e ? e.cap * 2 : 16, need);
        if (e) { this.group.remove(e.wood, e.leaf); e.wood.dispose(); e.leaf.dispose(); }
        const g = treeGeometry(kind, v, far);
        const wood = new THREE.InstancedMesh(g.wood, this.bark, cap);
        const leaf = new THREE.InstancedMesh(g.leaf, this.leaves, cap);
        for (const m of [wood, leaf]) {
            m.frustumCulled = false; // (culled here, tree by tree)
            m.castShadow = !far;
            m.receiveShadow = m === wood;
            m.count = 0;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.setColorAt(0, _c.setScalar(1)); // (instanceColor made: the tint, the char)
            m.userData.shared = true;
            m.raycast = () => {};
            this.group.add(m);
        }
        leaf.customDepthMaterial = this.depth;
        e = { wood, leaf, cap, key };
        this.meshes.set(key, e);
        return e;
    }

    _draw(camera) {
        _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _fr.setFromProjectionMatrix(_pm);
        const far = (this.scene.fog?.far || 300) + 20, cx = camera.position.x, cz = camera.position.z;
        // which trees, in which shape
        const lists = this._lists || (this._lists = new Map());
        for (const l of lists.values()) l.length = 0;
        let drawn = 0, near = 0;
        for (const t of this.world.trees) {
            if (!t.mesh || !t.alive) continue;
            const dx = t.x - cx, dz = t.z - cz, d2 = dx * dx + dz * dz;
            if (d2 > far * far) continue;
            _sph.center.set(t.x, t.y + t.h * 0.5, t.z);
            _sph.radius = t.h * 0.75 + 4;
            if (!_fr.intersectsSphere(_sph)) continue;
            const isFar = d2 > TREES.NEAR * TREES.NEAR;
            const v = isFar ? t.v % TREES.FAR_SHAPES : t.v;
            const key = t.kind * 1000 + v * 2 + (isFar ? 1 : 0);
            let l = lists.get(key);
            if (!l) lists.set(key, (l = []));
            l.push(t);
            drawn++;
            if (!isFar) near++;
        }
        for (const [key, e] of this.meshes) if (!(lists.get(key)?.length)) { e.wood.count = 0; e.leaf.count = 0; }
        for (const [key, l] of lists) {
            if (!l.length) continue;
            const kind = Math.floor(key / 1000), v = (key % 1000) >> 1, isFar = (key & 1) === 1;
            const e = this._shape(kind, v, isFar, l.length);
            let nl = 0;
            for (let i = 0; i < l.length; i++) {
                const t = l[i];
                e.wood.setMatrixAt(i, t.matrix);
                e.wood.setColorAt(i, t.burnt ? _c.setHex(TREES.CHAR) : _c.setScalar(1));
                if (!t.burnt) {
                    e.leaf.setMatrixAt(nl, t.matrix);
                    e.leaf.setColorAt(nl, _c.setScalar(t.tint));
                    nl++;
                }
            }
            e.wood.count = l.length;
            e.leaf.count = nl;
            for (const m of [e.wood, e.leaf]) {
                m.instanceMatrix.needsUpdate = true;
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            }
        }
        this.stats.drawn = drawn;
        this.stats.near = near;
        this.stats.shapes = lists.size;
    }

    /** One tree of each shape, to compile the shaders on the loading screen (Game.prewarm). */
    sampleModels() {
        const out = [];
        const g = treeGeometry(0, 0, false);
        const w = new THREE.InstancedMesh(g.wood, this.bark, 1), l = new THREE.InstancedMesh(g.leaf, this.leaves, 1);
        l.customDepthMaterial = this.depth;
        for (const m of [w, l]) { m.setMatrixAt(0, _m.makeTranslation(0, -1000, 0)); m.castShadow = true; m.frustumCulled = false; m.userData.shared = true; out.push(m); }
        return out;
    }

    /**
     * Make every shape's geometry now (the loading screen): ~120 shapes, a few ms each — not in the middle of a
     * flight over a new forest.
     */
    warmSteps() {
        const out = [];
        for (let k = 0; k < TREE_GEN.KINDS; k++) for (let v = 0; v < TREE_GEN.VARIANTS; v++) out.push(() => { treeGeometry(k, v, false); if (v < TREES.FAR_SHAPES) treeGeometry(k, v, true); });
        return out;
    }

    dispose() {
        for (const e of this.meshes.values()) { e.wood.dispose(); e.leaf.dispose(); }
        this.meshes.clear();
        this.scene.remove(this.group);
    }
}

