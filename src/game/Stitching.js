/**
 * Stitching.js — «Stitching» (7 mana, no scroll): a passage the hand points at is sewn shut.
 *
 * The raised hand (the wand) points at a hole — a tunnel of a cave, a doorway without a door, a
 * gap in a wall, a hole in a floor. The magic looks along the hand for the NARROWEST empty
 * cross-section that is closed all round by material (rock, stone, brick, planks…): that is the
 * passage (a doorway 3×5, a hole blown by «Бомбардо», a cave's tunnel ~5 m across). If the emptiness
 * is not closed all round (open air, a field, a hall too wide), the magic does not work — and the
 * hint says why. Then stones of the same material as round the hole are torn off the walls and
 * close it like a camera's iris: from every side at once, ring after ring from the edge to the middle
 * along a spiral, threads of light stitching them, the outline shimmering — the last one shuts the
 * middle with a flash (irisOrder). What is laid is an ordinary solid block of the
 * world: nobody walks or shoots through it, «Бомбардо» and the rest break it like any wall.
 *
 * Who decides: the spell goes to everybody ('spell') and every computer sees the stones fly; the
 * caster's computer lays the blocks (Builder._sendEdits — everybody gets them, they are saved). A
 * stone waits while somebody stands in its place (never laid into a body) and is left out when
 * they don't move away.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS, isLeaves } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';

export const STITCH = {
    REACH: 14, // m along the hand
    NEAR: 1.2, // m: never the cross-section the caster stands in
    // a passage this big at most (a cave's tunnel is ~5 m across: ~80 cells); a wider emptiness is no
    // passage — a hall, a field (the author: «главное, чтобы пустота окружалась материалом»)
    MAX_CELLS: 140,
    WIDE: 600, // (only to tell «too wide» from «not closed at all» in the hint)
    // the hand is never exact (the camera, the wand in the fingers): the magic looks round its line too
    CONE: [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6], [-12, 0], [12, 0], [0, -12], [0, 12], [-8, -8], [8, -8], [-8, 8], [8, 8]],
    STEP: 0.14, // s between two stones (a big passage: faster, the whole of it in ~6 s)
    FLY: 0.45, // s a stone flies
};

/** Not material to sew with (but still a border of the emptiness: a carpet, a lantern, a fence…). */
const NOT_MATERIAL = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.ICE_SHAPE, BLOCK.FENCE, BLOCK.FLOWERS, BLOCK.WHEAT, BLOCK.VEG, BLOCK.LANTERN,
    BLOCK.CARPET_RED, BLOCK.CARPET_BLUE, BLOCK.CARPET_GREEN, BLOCK.CARPET_PURPLE, BLOCK.ARCANE_LAMP, BLOCK.ARCANE_LAMP_VIOLET, BLOCK.POTION, BLOCK.BOOKS, BLOCK.GOLD,
    BLOCK.CLOTH_WHITE, BLOCK.CLOTH_YELLOW, BLOCK.HAY]);
const open = (t) => t === BLOCK.AIR;
const material = (t) => !NOT_MATERIAL.has(t) && !isLeaves(t);
/** Natural ground turns to the rock under it when it walls a passage (grass is no wall). */
const AS_WALL = { [BLOCK.GRASS]: BLOCK.DIRT, [BLOCK.FARMLAND]: BLOCK.DIRT, [BLOCK.PATH]: BLOCK.DIRT, [BLOCK.SNOW]: BLOCK.STONE };

/** A world point → its cell (Terrain: block (x, L, z) fills y ∈ [L−1.5, L−0.5]). */
export const cellOf = (p) => ({ x: Math.round(p.x), L: Math.floor(p.y + 1.5), z: Math.round(p.z) });

/** The planes a cross-section may lie in: 'x' / 'z' fixed (an opening in a wall, a tunnel), 'y' (a hole in a floor). */
const PLANES = ['x', 'z', 'y'];
const NORMAL = { x: [1, 0, 0], z: [0, 0, 1], y: [0, 1, 0] };

/** The 4 neighbours of a cell inside its plane. */
function around(c, plane) {
    if (plane === 'x') return [[c.x, c.L + 1, c.z], [c.x, c.L - 1, c.z], [c.x, c.L, c.z + 1], [c.x, c.L, c.z - 1]];
    if (plane === 'z') return [[c.x, c.L + 1, c.z], [c.x, c.L - 1, c.z], [c.x + 1, c.L, c.z], [c.x - 1, c.L, c.z]];
    return [[c.x + 1, c.L, c.z], [c.x - 1, c.L, c.z], [c.x, c.L, c.z + 1], [c.x, c.L, c.z - 1]];
}

/**
 * The emptiness of one cross-section round `start` (flood inside the plane):
 * {cells, walls} when it is closed all round (by material, or a carpet / a lantern at its edge);
 * {why: 'open'} when it runs further than `max` cells; {why: 'water'} when water is at its edge.
 */
export function crossSection(get, start, plane, max = STITCH.MAX_CELLS) {
    if (!open(get(start.x, start.L, start.z))) return { why: 'none' };
    const seen = new Set([`${start.x},${start.L},${start.z}`]);
    const cells = [start], walls = new Map();
    for (let i = 0; i < cells.length; i++) {
        for (const [x, L, z] of around(cells[i], plane)) {
            const k = `${x},${L},${z}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const t = get(x, L, z);
            if (open(t)) {
                cells.push({ x, L, z });
                if (cells.length > max) return { why: 'open', cells: null, flooded: cells };
            } else if (t === BLOCK.WATER) return { why: 'water', cells: null, flooded: cells };
            else if (material(t)) walls.set(t, (walls.get(t) || 0) + 1);
        }
    }
    if (!walls.size) return { why: 'open', cells: null, flooded: cells }; // (nothing but carpets and lanterns round it: no hold for the magic)
    return { cells, walls };
}

/**
 * A passage leads somewhere: there is emptiness on both sides of the cross-section (a doorway,
 * a tunnel, a hole through a wall or a floor) — not a niche in a wall, not the bottom of a pit.
 */
export function throughBothSides(get, cells, plane) {
    const [nx, ny, nz] = NORMAL[plane];
    let front = 0, back = 0;
    for (const c of cells) {
        if (open(get(c.x + nx, c.L + ny, c.z + nz))) front++;
        if (open(get(c.x - nx, c.L - ny, c.z - nz))) back++;
    }
    return front > 0 && back > 0;
}

/** The material of the walls round it (the most common; ground as the rock it is). */
export function materialOf(walls) {
    let best = BLOCK.STONE, n = -1;
    for (const [t, k] of walls) if (k > n) { best = t; n = k; }
    return AS_WALL[best] ?? best;
}

const _dir = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();

/**
 * The passage to sew: along the hand AND a little round it (STITCH.CONE — the hand is never exact),
 * every empty cell up to the first wall is tried in all three planes; of the cross-sections that are
 * closed all round and lead through (both sides open), the narrowest wins (a doorway seen from a
 * room is narrower than the room), the nearer to the hand's own line on a tie.
 * get(x, L, z) → block. → {cells, block, plane} | {why: 'none' | 'open' | 'wide' | 'water' | 'niche'}
 */
export function findPassage(get, o, d, { reach = STITCH.REACH, near = STITCH.NEAR, max = STITCH.MAX_CELLS } = {}) {
    const tried = new Set();
    const why = { open: 0, wide: 0, water: 0, niche: 0, seen: 0 };
    const keyOf = (plane, q) => `${plane}|${q.x},${q.L},${q.z}`;
    let wideTried = false;
    let best = null;
    _ax.crossVectors(d, _up);
    if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0);
    _ax.normalize();
    STITCH.CONE.forEach(([yaw, pitch], ray) => {
        _dir.copy(d).applyAxisAngle(_up, yaw * Math.PI / 180).applyAxisAngle(_ax, pitch * Math.PI / 180).normalize();
        for (let t = near; t <= reach; t += 0.25) {
            _p.copy(o).addScaledVector(_dir, t);
            const c = cellOf(_p);
            const b = get(c.x, c.L, c.z);
            if (!open(b)) { if (b === BLOCK.WATER) why.water++; break; } // (the wall behind: look no further along this line)
            why.seen++;
            for (const plane of PLANES) {
                if (tried.has(keyOf(plane, c))) continue;
                const s = crossSection(get, c, plane, max);
                // (every cell this flood went through gives the same answer in this plane: never tried again)
                for (const q of s.cells || s.flooded || [c]) tried.add(keyOf(plane, q));
                if (!s.cells) {
                    if (s.why === 'water') why.water++;
                    else if (ray === 0 && plane !== 'y' && !wideTried && s.flooded) { wideTried = true; if (crossSection(get, c, plane, STITCH.WIDE).cells) why.wide++; else why.open++; }
                    else why.open++;
                    continue;
                }
                if (!throughBothSides(get, s.cells, plane)) { why.niche++; continue; }
                const score = s.cells.length * (1 + 0.02 * Math.hypot(yaw, pitch)) + t * 0.01;
                if (!best || score < best.score) best = { ...s, plane, score };
            }
        }
    });
    if (!best) return { why: !why.seen ? 'none' : why.water ? 'water' : why.wide ? 'wide' : why.niche && !why.open ? 'niche' : 'open' };
    // stone by stone: from the bottom up, along the row
    const cells = best.cells.slice().sort((a, b) => a.L - b.L || a.x - b.x || a.z - b.z);
    return { cells, block: materialOf(best.walls), plane: best.plane };
}

/** What to tell the caster when no passage is found (findPassage's `why`). */
export function stitchHint(why) {
    switch (why) {
        case 'none': return '🧵 Палочка упирается в стену — направьте её в сам проход (в дыру, в проём), не дальше 14 м';
        case 'wide': return `🧵 Проход слишком широкий — сшить можно проход до ${STITCH.MAX_CELLS} блоков в сечении (примерно 10 × 14). Направьте палочку на место поуже`;
        case 'water': return '🧵 В проходе вода — его не сшить';
        case 'niche': return '🧵 Это ниша, а не проход: за ней нет пустоты. Направьте палочку на дыру насквозь (проём, тоннель)';
        default: return '🧵 Пустота здесь не окружена со всех сторон камнем или стеной — магия не работает. Направьте палочку на проём в стене или на проход пещеры';
    }
}

/**
 * The order the stones close the passage in, like a camera's iris: ring 0 — the cells at the edge of
 * the hole — first, then the next ring in, … the middle last; round each ring along a spiral (by the
 * angle round the middle). Each stone comes from the wall straight out from the middle behind its
 * place, and is stitched by a thread to its neighbour further out (or the wall). Pure: tested.
 * → {stones: [{c, to, from, anchor, ring, at}], mid, normal, u, v, edge, T}
 */
export function irisOrder(get, cells, plane) {
    const key = (c) => `${c.x},${c.L},${c.z}`;
    const inside = new Map(cells.map((c) => [key(c), c]));
    const ring = new Map();
    let front = cells.filter((c) => around(c, plane).some(([x, L, z]) => !inside.has(`${x},${L},${z}`)));
    for (const c of front) ring.set(key(c), 0);
    for (let r = 1; front.length; r++) {
        const next = [];
        for (const c of front) for (const [x, L, z] of around(c, plane)) {
            const k = `${x},${L},${z}`;
            if (inside.has(k) && !ring.has(k)) { ring.set(k, r); next.push(inside.get(k)); }
        }
        front = next;
    }
    const at = (c) => new THREE.Vector3(c.x, c.L - 1, c.z);
    const mid = new THREE.Vector3();
    for (const c of cells) mid.add(at(c));
    mid.divideScalar(cells.length);
    const normal = new THREE.Vector3(...NORMAL[plane]);
    const u = plane === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const rings = Math.max(...ring.values()) + 1;
    const T = Math.min(5, Math.max(1.6, cells.length * STITCH.STEP)); // (about as long as stone by stone took)
    const ringT = (T * 0.75) / rings, sweep = T * 0.25;
    const stones = cells.map((c) => {
        const to = at(c), r = ring.get(key(c));
        const off = to.clone().sub(mid);
        const ang = Math.atan2(off.dot(v), off.dot(u)); // −π…π round the middle
        const out = off.lengthSq() > 1e-6 ? off.clone().normalize() : u.clone();
        // from the wall behind its place: out past the edge of the hole, a little off the plane
        const span = (rings - r) + 1.5 + Math.random() * 1.2;
        const from = to.clone().addScaledVector(out, span).addScaledVector(normal, (Math.random() - 0.5) * 1.2);
        // the thread: to its neighbour one ring out (or, at the edge, to the wall just outside)
        let anchor = to.clone().addScaledVector(out, 1);
        for (const [x, L, z] of around(c, plane)) {
            const k = `${x},${L},${z}`;
            if (ring.has(k) && ring.get(k) === r - 1) { anchor = at(inside.get(k)); break; }
        }
        return { c, to, from, anchor, ring: r, at: r * ringT + ((ang + Math.PI) / (2 * Math.PI)) * sweep };
    });
    stones.sort((a, b) => a.at - b.at);
    // the outline of the hole (for its shimmer): the outer face of every edge stone
    const edge = stones.filter((s) => s.ring === 0).map((s) => s.to.clone().addScaledVector(s.to.clone().sub(mid).normalize(), 0.5));
    return { stones, mid, normal, u, v, edge, T };
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). Stitching lays stones; it never strikes.
 */
export const STITCH_TARGETS = {
    me: { does: 'none', why: 'колдующего не замуровывает: проход ищется не ближе 1.2 м, а камень не ложится туда, где стоит тело' },
    players: { does: 'wait', why: 'камень не кладётся в игрока: ждёт, пока он отойдёт (не ушёл — это место остаётся пустым)' },
    zombies: { does: 'wait', why: 'так же: в тело камень не ложится; заделанный проход зомби не проходят (коллизия блоков)' },
    castlePeople: { does: 'wait', why: 'жителей, рыцарей не замуровывает; закрытый проход — стена для них' },
    animals: { does: 'wait', why: 'так же — ждёт, пока отойдут' },
    sailors: { does: 'none', why: 'корабль — не блоки мира: проход в корабле не сшивается' },
    spider: { does: 'wait', why: 'паучиха большая — камни не ложатся в её тело' },
    livingTrees: { does: 'wait', why: 'в живое дерево камень не кладётся' },
    bookBirds: { does: 'none', why: 'летают — их не касается' },
    iceCastle: { does: 'wait', why: 'в ледяное существо камень не кладётся — шов ждёт, пока оно уйдёт' },
    dragon: { does: 'wait', why: 'в дракона камень не кладётся; вход в логово можно сшить, если дракон не в нём (вход шире 140 блоков в сечении не сшивается)' },
    phoenix: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'проход закладывается блоками того же камня / кирпича / дерева, что вокруг; это обычная твёрдая стена — Бомбардо и другие её ломают' },
    houses: { does: 'build', why: 'проём без двери в доме или в стене замка заделывается; дверь, если стоит, — не пустота: её не сшить' },
    caves: { does: 'build', why: 'проход пещеры заделывается камнем пещеры' },
    open: { does: 'none', why: 'пустота не окружена материалом (открытое поле, небо, зал шире 140 блоков в сечении) или это ниша без прохода — магия не работает, подсказка говорит почему' },
    water: { does: 'none', why: 'проход, где стоит вода, не сшивается (вода — не пустота и не опора для камня)' },
    ships: { does: 'none', why: 'корабль — не блоки мира' },
    ward: { does: 'none', why: 'дом под чужой сферой защиты не трогает (HouseWards.forbids)' },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Stitching {
    constructor(game) {
        this.game = game;
        this._geo = null;
    }

    _get() {
        const data = this.game.terrain?.data;
        return data ? (x, L, z) => data.get(x, L, z) : null;
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        const now = performance.now();
        if (now - (this._lastAt || -1e9) < 1500) return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!side || !ch.isArmRaised(side)) return hint('🧵 Поднимите руку (палочку), направьте её на проход — и скажите «Stitching»');
        const get = this._get();
        if (!get) return null;
        // (aimed by the wand itself when it is in the hand: where its tip points, not the palm)
        const aim = castingHand(g);
        const origin = aim?.side === side ? aim.origin : g.castOrigin(side);
        const dir = aim?.side === side ? aim.dir : ch.getHandDirection(side);
        const found = findPassage(get, origin, dir);
        if (!found.cells) return hint(stitchHint(found.why));
        if (g.wards?.forbids?.(origin, _v.set(found.cells[0].x, found.cells[0].L - 1, found.cells[0].z))) return hint('🛡️ Этот дом под защитой — сшить нельзя');
        const tired = g.combat.check('Stitching');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Stitching');
        this._lastAt = now;
        g.spells.cast('Stitching', origin, dir, side, g.localId);
        g.sync?.spell('Stitching', origin, dir, side);
        return 'Stitching';
    }

    /**
     * (every computer) the passage closes like a camera's iris: stones torn out of the walls round it
     * fly in from every side at once, ring after ring from the edge to the middle along a spiral,
     * threads of light stitching each to the one beside it; the last one shuts the middle — a flash.
     * The caster's computer lays them as blocks of the world.
     */
    sew(origin, dir, casterId) {
        const g = this.game;
        const get = this._get();
        if (!get) return;
        const found = findPassage(get, origin, dir.clone().normalize());
        if (!found.cells) return;
        const mine = casterId === g.localId || casterId === 'local';
        const color = BASE_COLORS[found.block] ?? 0x8a8a8a;
        const iris = irisOrder(get, found.cells, found.plane);
        const n = iris.stones.length;
        const mid = iris.mid;
        // one draw for all the flying stones; one for all the threads
        if (!this._geo) this._geo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
        const mat = new THREE.MeshLambertMaterial({ color, emissive: 0x6a5cff, emissiveIntensity: 0.45 });
        const rocks = new THREE.InstancedMesh(this._geo, mat, n);
        rocks.frustumCulled = false;
        const hide = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < n; i++) rocks.setMatrixAt(i, hide);
        g.scene.add(rocks);
        const lineGeo = new THREE.BufferGeometry();
        const linePos = new Float32Array(n * 6);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0xc9bfff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const threads = new THREE.LineSegments(lineGeo, lineMat);
        threads.frustumCulled = false;
        g.scene.add(threads);
        const stones = iris.stones.map((st) => ({ ...st, laid: false, waitT: 0, started: false }));
        g.sound?.playWhoosh?.();
        g.fx.lightFlash?.(mid, 0x8f80ff, 2.5, 0.4, 14);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
        let t = 0, closed = false;
        g.spells.spells.push({
            life: iris.T + STITCH.FLY + 3, // (+3 s: a stone waits for a body to step aside)
            onUpdate: (spell, dt) => {
                t += dt;
                let left = 0, lines = 0;
                // the outline of the hole shimmers while it closes
                for (let k = 0; k < 3; k++) {
                    const b = iris.edge[(Math.random() * iris.edge.length) | 0];
                    if (b) g.fx.spark(b, Math.random() < 0.5 ? 0xb9a8ff : 0xe6e0ff, 0.06, _v.set(0, 0, 0), 0.35);
                }
                for (let i = 0; i < n; i++) {
                    const s = stones[i];
                    if (s.laid) continue;
                    left++;
                    const lt = t - s.at;
                    if (lt < 0) continue;
                    if (!s.started) { // (torn out of the wall: a puff of grit)
                        s.started = true;
                        for (let k = 0; k < 5; k++) g.fx.spark(s.from, color, 0.08, _v.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2), 0.45);
                    }
                    const k = Math.min(1, lt / STITCH.FLY);
                    const e = k * k * (3 - 2 * k);
                    // a petal of the iris: in along a curve — it swings round the middle as it closes in
                    const sw = (1 - e) * 0.9;
                    pos.lerpVectors(s.from, s.to, e);
                    pos.sub(mid).applyAxisAngle(iris.normal, sw).add(mid);
                    e3.set((1 - e) * 3, (1 - e) * 2, 0);
                    q.setFromEuler(e3);
                    sc.setScalar(0.35 + 0.65 * e);
                    m4.compose(pos, q, sc);
                    rocks.setMatrixAt(i, k < 1 ? m4 : hide);
                    // the thread of light that stitches it to the stone (or the wall) beside it
                    if (k < 1) {
                        const a = s.anchor, o = lines * 6;
                        linePos[o] = pos.x; linePos[o + 1] = pos.y; linePos[o + 2] = pos.z;
                        linePos[o + 3] = a.x; linePos[o + 4] = a.y; linePos[o + 5] = a.z;
                        lines++;
                        if (Math.random() < 0.25) g.fx.spark(pos, 0xd8d0ff, 0.05, _v.set(0, 0, 0), 0.3);
                        continue;
                    }
                    // in place: never into a body — it waits for it to step aside
                    if (this._occupied(s.c)) { s.waitT += dt; if (s.waitT < 3) { rocks.setMatrixAt(i, hide); continue; } s.laid = true; continue; }
                    s.laid = true;
                    this._lay(s, found.block, mine, color);
                }
                rocks.instanceMatrix.needsUpdate = true;
                lineGeo.setDrawRange(0, lines * 2);
                lineGeo.attributes.position.needsUpdate = true;
                lineMat.opacity = 0.6 + 0.35 * Math.sin(t * 30);
                // the iris shuts: a flash in the middle and a ring of sparks
                if (!left && !closed) {
                    closed = true;
                    g.fx.lightFlash?.(mid, 0xb8a8ff, 5, 0.5, 22);
                    for (let k = 0; k < 36; k++) {
                        const a = (k / 36) * Math.PI * 2;
                        _w.copy(iris.u).multiplyScalar(Math.cos(a) * 3).addScaledVector(iris.v, Math.sin(a) * 3);
                        g.fx.spark(mid, k % 2 ? 0xd8d0ff : 0x9f8cff, 0.09, _w, 0.5);
                    }
                    g.sound?.playSeal?.(mid); // (stone meeting stone, a soft low chime — not a duel charge's sound)
                    spell.life = 0;
                }
            },
            onEnd: () => {
                g.scene.remove(rocks); g.scene.remove(threads);
                rocks.dispose?.(); mat.dispose(); lineGeo.dispose(); lineMat.dispose();
            },
        });
    }

    /** The stone is in: a seam of light round it; the caster's computer makes it a block of the world. */
    _lay(s, block, mine, color) {
        const g = this.game;
        for (let i = 0; i < 8; i++) g.fx.spark(s.to, i % 2 ? 0xd8d0ff : color, 0.07, _v.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), 0.35);
        g.sound?.playStep?.();
        if (!mine) return;
        const data = g.terrain?.data;
        if (!data || data.get(s.c.x, s.c.L, s.c.z) !== BLOCK.AIR) return;
        data.set(s.c.x, s.c.L, s.c.z, block);
        g.builder?._sendEdits([[s.c.x, s.c.L, s.c.z, block]]);
    }

    /** Somebody's body is in this cell (the players, every creature Duel._bodies knows). */
    _occupied(c) {
        const g = this.game;
        const lo = c.L - 1.5, hi = c.L - 0.5;
        for (const e of g.duel?._bodies?.() || []) {
            const yl = Math.min(e.a.y, e.b.y) - e.r, yh = Math.max(e.a.y, e.b.y) + e.r;
            if (yh < lo || yl > hi) continue;
            const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
            if (Math.abs(mx - c.x) < 0.5 + e.r && Math.abs(mz - c.z) < 0.5 + e.r) return true;
        }
        return false;
    }
}
