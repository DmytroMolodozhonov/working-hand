/**
 * Breakthrough — a two-hand rising gesture lifts the local ground into a solid wall.
 * Normal: 7×2 columns, about 6 blocks high with a ragged crest; Maxima: 9×2, about 8 high.
 * Both grow in one second, middle outwards, from each column's own material. The GPU mesh
 * rises smoothly while ordinary saved/networked voxels take over. Occupied columns wait,
 * then skip the rest above the obstruction: nobody is buried, pushed or damaged.
 * Water, ships, foreign wards, enchanted stone and god gifts refuse; caves use their own floor.
 * Player casts require the gesture in Game. NPCs lacking Cardilon use this wall against bombs.
 * The player owns their edits; the host owns NPC edits. Other peers draw the rise only.
 */

import * as THREE from 'three';
import { BLOCK, isLeaves, isWood, isPlanetBlock } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { occupied } from './Stitching.js';
import { voxelGeometry, voxelMaterial } from './LevitationMaxima.js';

export const BREAKTHROUGH = {
    W: 7, T: 2, H: 6, // blocks: width, thickness, height (the hero is ~3.5 m; the author: one block higher than 5)
    GROW: 1, // s from the first block to the last (the author: twice as fast; the earth is seen to rise smoothly meanwhile)
    WAIT: 1.5, // s a block waits for a body to step aside
    SEND: 0.12, // s: the blocks laid go out together
    STEP: 3, // blocks: the ground under a column at most this far from the spot's level (no pillars over a cliff)
    SCREE: 0.28, // chance of a lump of rubble on a free place at the foot
};

/** ON WHOM AND ON WHAT (CLAUDE.md). The wall is blocks laid on the ground; it never strikes. */
export const BREAKTHROUGH_TARGETS = {
    me: { does: 'none', why: 'колдующего не задевает: стена растёт на расстоянии от 2 м; если он стоит на её месте — блок ждёт' },
    players: { does: 'wait', why: 'блок не кладётся в игрока: ждёт 1,5 с, потом это место пропускается (и всё, что над ним в столбце); никого не толкает и не ранит' },
    zombies: { does: 'wait', why: 'в тело блок не кладётся; зомби упирается в стену и обходит её (коллизия блоков)' },
    castlePeople: { does: 'wait', why: 'жителей не пугает и не задевает (стена — не опасность, не тревога); они обходят её, пути пересчитываются; строители замка её не убирают' },
    animals: { does: 'wait', why: 'в животное блок не кладётся; животные обходят стену' },
    sailors: { does: 'none', why: 'корабль — не земля: на палубе стена не растёт' },
    spider: { does: 'wait', why: 'в паучиху блок не кладётся' },
    livingTrees: { does: 'wait', why: 'в живое дерево блок не кладётся; столбец с деревом над землёй пропускается' },
    bookBirds: { does: 'none', why: 'летают — не касается' },
    iceCastle: { does: 'wait', why: 'Королеву, снеговиков, ледяных монстров не задевает; блок ждёт, пока уйдут' },
    vampire: { does: 'wait', why: 'графа, стражей и мышей не задевает; блок ждёт, пока уйдут' },
    titan: { does: 'wait', why: 'титана не задевает; блок ждёт, пока он уйдёт' },
    pharaoh: { does: 'wait', why: 'фараона, мумий и стражей не задевает; блок ждёт, пока уйдут' },
    blackship: { does: 'none', why: 'капитан и скелеты на корабле в море — там нет земли, стена не растёт' },
    dragon: { does: 'wait', why: 'в дракона блок не кладётся; дракон огнём и телом ломает такую стену как любые блоки' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    canary: { does: 'none', why: 'не касается' },
    taron: { does: 'none', why: 'не касается' },
    spencer: { does: 'none', why: 'не касается' },
    ghost: { does: 'none', why: 'не касается: призрак бестелесный' },
    custom: { does: 'none', why: 'не касается' },
    gargoyle: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'вырастает из материала земли под каждым столбцом (камень, песок, земля с травой, снег, гравий, порода планеты); обычные блоки мира: их ломают «Бомбардо», «Gather», Total Destruction и так далее' },
    items: { does: 'lift', why: 'вещи на земле под стеной поднимаются на её верх, а не остаются замурованными' },
    water: { does: 'none', why: 'из воды стена не растёт: столбцы над водой пропускаются, если вся полоса на воде — «там вода»' },
    ground: { does: 'build', why: 'стена растёт в четырёх метрах перед колдующим после поднятия обеих рук; нужна свободная земля' },
    trees: { does: 'none', why: 'деревья не трогает; из дерева не строит — столбец над стволом пропускается' },
    houses: { does: 'none', why: 'стены домов и замков не ломает и не задевает; столбцы, где занято, пропускаются' },
    ships: { does: 'none', why: 'палуба — не земля, корабль не блоки мира' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не растёт (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'дары богов (храм, пьедесталы) не подчиняются: столбцы над ними не растут' },
    enchanted: { does: 'none', why: 'заколдованный камень (арены, башни волшебников) не слушается: столбцы над ним не растут' },
    space: { does: 'none', why: 'в космосе под ногами нет земли (spaceSpellBlock); на планетах работает из их породы' },
    spells: { does: 'block', why: 'заряды дуэли, стрелы и лучи упираются в твёрдые блоки стены; взрыв ломает те блоки, что попали в круг' },
};

const free = (t) => t === BLOCK.AIR;
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The wall's material over a ground block `b`, or null when that block is not earth to build of (the caller looks lower). */
export function wallMaterial(b) {
    if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.STONE || b === BLOCK.SNOW || b === BLOCK.SAND || b === BLOCK.GRAVEL || b === BLOCK.DEEPSTONE) return b;
    if (b === BLOCK.FARMLAND || b === BLOCK.PATH) return BLOCK.DIRT;
    if (isPlanetBlock(b)) return b;
    return null;
}
/** The material a column takes from the ground at layer g (the block, else the ones under it up to 6 down, else earth). */
export function columnMaterial(get, x, g, z) {
    for (let k = 0; k <= 6; k++) {
        const b = get(x, g - k, z);
        if (isWood(b) || isLeaves(b)) continue;
        const m = wallMaterial(b);
        if (m != null) return m;
    }
    return BLOCK.DIRT;
}

/** One column's height in blocks: 5, ±1 at the two edges, a block short here and there inside. Same seed → same crest. */
export function columnHeight(seed, x, z, w, height = BREAKTHROUGH.H) {
    const r = hash(seed, x, z), edge = Math.abs(w) >= 3;
    if (edge) return height + (r < 0.4 ? -1 : r > 0.8 ? 1 : 0);
    return height - (r < 0.25 ? 1 : 0);
}

/**
 * The wall for the spot A ({x, z, L: the ground layer there}) and the way f ({x, z}, flat, unit: from the caster):
 * {cells: [[x, L, z, block, t, col, k]…], cols, w, h} | {why: 'holy' | 'water' | 'none'}.
 * get(x, L, z) → block; top(x, z) → the highest solid layer; gift(x, L, z) → a gift of the gods.
 * t = the second (0…GROW) the cell appears; col = the column (`next` is the layer it needs next); k = its layer in it.
 */
export function breakthroughPlan(get, top, A, f, seed = 1, gift = null, max = false) {
    const sx = -f.z, sz = f.x, G = max ? { ...BREAKTHROUGH, W: 9, H: 8 } : BREAKTHROUGH;
    const cols = new Map(); // "x,z" → column
    const half = (G.W - 1) / 2;
    const nw = Math.round(G.W / 0.35);
    for (let i = 0; i <= nw; i++) {
        const w = -half + (G.W - 1) * i / nw;
        for (let t = 0; t <= G.T - 1 + 0.01; t += 0.5) {
            const x = Math.round(A.x + sx * w + f.x * t), z = Math.round(A.z + sz * w + f.z * t);
            const k = x + ',' + z;
            if (!cols.has(k)) cols.set(k, { x, z, w: Math.round(w) });
        }
    }
    let holy = 0, wet = 0;
    const list = [], cells = [];
    for (const c of cols.values()) {
        const g = top(c.x, c.z);
        const b = get(c.x, g, c.z);
        if (isEnchanted(b) || (gift && gift(c.x, g, c.z))) { holy++; continue; }
        if (b === BLOCK.WATER || get(c.x, g + 1, c.z) === BLOCK.WATER) { wet++; continue; }
        if (Math.abs(g - A.L) > G.STEP || !free(get(c.x, g + 1, c.z))) continue;
        c.g = g; c.mat = columnMaterial(get, c.x, g, c.z);
        c.h = columnHeight(seed, c.x, c.z, c.w, G.H);
        c.next = 0; c.dead = false;
        list.push(c);
    }
    if (!list.length) return { why: holy ? 'holy' : wet ? 'water' : 'none' };
    const rise = G.GROW * 0.62, lead = G.GROW - rise;
    for (const c of list) {
        const delay = c.delay = lead * Math.min(1, Math.abs(c.w) / half);
        for (let k = 0; k < c.h; k++) {
            const L = c.g + 1 + k;
            if (!free(get(c.x, L, c.z))) break;
            const block = c.mat === BLOCK.GRASS ? (k === c.h - 1 ? BLOCK.GRASS : BLOCK.DIRT) : c.mat; // (grass: earth under a cap of grass)
            cells.push([c.x, L, c.z, block, delay + rise * (k + 1) / c.h, c, k]);
        }
    }
    // a little scree at the foot: single lumps in front of and behind the wall, on free ground of the same level
    const seen = new Set([...cols.keys()]);
    for (const c of list) {
        for (const [dx, dz] of [[f.x, f.z], [-f.x, -f.z]]) {
            const x = Math.round(c.x + dx * 1.2), z = Math.round(c.z + dz * 1.2), key = x + ',' + z;
            if (seen.has(key)) continue;
            seen.add(key);
            if (hash(seed + 7, x, z) > G.SCREE) continue;
            const g = top(x, z);
            if (Math.abs(g - c.g) > 0 || !free(get(x, g + 1, z)) || isEnchanted(get(x, g, z)) || (gift && gift(x, g, z)) || get(x, g + 1, z) === BLOCK.WATER) continue;
            const col = { x, z, w: c.w, g, mat: columnMaterial(get, x, g, z), h: 1, next: 0, dead: false };
            cells.push([x, g + 1, z, col.mat, G.GROW * 0.85 + hash(seed, z, x) * 0.15, col, 0]);
        }
    }
    cells.sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    return { cells, cols: list, w: G.W, h: G.H };
}

/** Why it cannot grow — the hint for the player. */
export function breakthroughHint(why) {
    if (why === 'ward') return '🛡️ Здесь чужая защита дома — стену не поднять';
    if (why === 'ship') return '⚓ Корабль — не земля: стена здесь не растёт';
    if (why === 'holy') return '🧱 Заколдованный камень и дары богов не слушаются — «Breakthrough» здесь не поднять';
    if (why === 'water') return '🌊 Из воды стена не растёт — найдите сухую землю';
    if (why === 'unknown') return '🧱 Там земля ещё не готова — подождите секунду';
    return '🧱 Здесь негде поднять стену — встаньте перед свободным участком земли';
}

/**
 * The top of a column as THIS wall sees it, near the layer L0 the wand shows (a cave: the floor under the ceiling, not the
 * surface above it — the same slip as «Breakthrough»'s, the author's «в пещере не работает»; open ground: the usual top).
 */
export function groundTopNear(data, L0) {
    return (a, b) => {
        const t = data.topLayer(a, b);
        if (t <= L0 + 3) return t;
        const c = data.get(a, L0 + 3, b);
        if (c !== BLOCK.AIR && c !== BLOCK.WATER) return t; // (a hill, a cliff ahead: its top, as before)
        return data.floorBelow ? data.floorBelow(a, b, L0 + 3) : t;
    };
}

/**
 * The earth rising out of the ground (every computer): the wall's own blocks, drawn with the world's block material
 * (VoxelShading — the same stone / earth / sand / grass textures as the blocks laid; the patterns stay on the blocks as
 * they move, LevitationMaxima.voxelMaterial), pushed up out of the ground by a vertex shift: one mesh, one draw call.
 * The shift of each column: its delay and depth are vertex attributes, the time one uniform of the material.
 */
function riseMaterial() {
    const mat = voxelMaterial(new THREE.Vector3(0, -1.5, 0));
    const base = mat.onBeforeCompile;
    const T = { value: 0 }, DUR = { value: 1 };
    mat.onBeforeCompile = (shader, r) => {
        base(shader, r);
        shader.uniforms.uRiseT = T;
        shader.uniforms.uRiseDur = DUR;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uRiseT;\nuniform float uRiseDur;\nattribute float riseDelay;\nattribute float riseDepth;')
            .replace('#include <project_vertex>', 'float rp = clamp((uRiseT - riseDelay) / uRiseDur, 0.0, 1.0);\ntransformed.y -= (1.0 - (1.0 - (1.0 - rp) * (1.0 - rp))) * riseDepth;\n#include <project_vertex>');
    };
    mat.customProgramCacheKey = () => 'breakthrough-rise';
    mat.userData.rise = { T, DUR };
    return mat;
}
/** The geometry of the columns [[col, cells]…] (cells: [x, L, z, block]); col.delay / col.h give the shift. */
function riseGeometry(cols, data) {
    const pos = [], nor = [], colr = [], pat = [], sky = [], dl = [], dp = [], idx = [];
    for (const [c, cells] of cols) {
        const g = voxelGeometry(cells.map((a) => [a[0], a[1], a[2], a[3]]), 0, 0, 0, data);
        const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('color'), V = g.getAttribute('voxPat'), K = g.getAttribute('voxSky'), I = g.index;
        const o = pos.length / 3;
        for (let i = 0; i < P.count; i++) {
            pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); colr.push(C.getX(i), C.getY(i), C.getZ(i));
            pat.push(V.getX(i)); sky.push(K.getX(i)); dl.push(c.delay || 0); dp.push((c.h || 1) + 0.8);
        }
        for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + o);
        g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('voxPat', new THREE.Float32BufferAttribute(pat, 1));
    geo.setAttribute('voxSky', new THREE.Float32BufferAttribute(sky, 1));
    geo.setAttribute('riseDelay', new THREE.Float32BufferAttribute(dl, 1));
    geo.setAttribute('riseDepth', new THREE.Float32BufferAttribute(dp, 1));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return geo;
}
const sparkColor = (b) => (b === BLOCK.SAND ? 0xe6d8a0 : b === BLOCK.SNOW ? 0xf4f8ff : b === BLOCK.GRASS ? 0x7fbf5a : b === BLOCK.DIRT ? 0x8a6a44 : 0xb8b4aa);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Breakthrough {
    constructor(game) {
        this.game = game;
        this._lastAt = -1e9;
    }

    get data() { return this.game.terrain?.data || null; }

    /** A wall a few steps ahead, on the actual floor (including caves), never inside a foreign ward or ship. */
    prepare(p, f, max = false) {
        const g = this.game, data = this.data;
        if (!data || g.space?.realm === 'space') return { why: 'none' };
        const length = Math.hypot(f.x, f.z);
        if (length < 0.01) return { why: 'none' };
        f = { x: f.x / length, z: f.z / length };
        const x = Math.round(p.x + f.x * 4), z = Math.round(p.z + f.z * 4);
        if (data.landMade && !data.landMade(x, z)) return { why: 'unknown' };
        const top = groundTopNear(data, Math.round(p.y));
        const A = { x, z, L: top(x, z) }, o = new THREE.Vector3(x, A.L, z), d = new THREE.Vector3(f.x, 0, f.z);
        if (g.wards?.forbids?.(p, o)) return { why: 'ward' };
        if (g.ships?.footprintAt?.(x, A.L - 1, z)) return { why: 'ship' };
        const seed = (x * 73856093) ^ (z * 19349663) ^ Math.round(f.x * 100) * 83492791;
        const plan = breakthroughPlan((x, L, z) => data.get(x, L, z), top, A, f, seed, data.godGiftAt?.bind(data), max);
        return plan.cells ? { o, d, plan } : plan;
    }

    /** Called only after Game has recognized the player's two-hand rising gesture. */
    cast(max = false) {
        const g = this.game, now = performance.now();
        if (now - this._lastAt < 1500) return null;
        const ch = g.character, yaw = ch.group.rotation.y;
        const feet = ch.group.position.clone(); feet.y -= 1.5;
        const at = this.prepare(feet, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, max);
        if (!at.plan) { g.hud.setVoice(breakthroughHint(at.why), true); return null; }
        const name = max ? 'BreakthroughMaxima' : 'Breakthrough', tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(name); this._lastAt = now;
        this.grow(at.o, at.d, g.localId, at.plan, max);
        g.sync?.spell(max ? 'WallRiseMaxima' : 'WallRise', at.o, at.d, null);
        return name;
    }

    /**
     * (every computer) The ground rises: block after block, from the middle to the edges and from the bottom up,
     * in dust and crumbs; the caster's computer lays the blocks. o: the spot (x, ground layer, z); d: the way from the caster.
     */
    grow(o, d, casterId, plan = null, max = false) {
        const g = this.game;
        const data = this.data;
        if (!data) return;
        const A = { x: Math.round(o.x), L: Math.round(o.y), z: Math.round(o.z) };
        const h = Math.hypot(d.x, d.z) || 1, f = { x: d.x / h, z: d.z / h };
        if (!plan) {
            const seed = (A.x * 73856093) ^ (A.z * 19349663) ^ Math.round(f.x * 100) * 83492791;
            plan = breakthroughPlan((x, L, z) => data.get(x, L, z), groundTopNear(data, A.L), A, f, seed, data.godGiftAt ? (x, L, z) => data.godGiftAt(x, L, z) : null, max);
        }
        if (!plan.cells) return;
        g.sound?.playSpellFxAt?.('fxStone', o, max ? 0.85 : 1, 1, 28);
        const mine = casterId === g.localId || casterId === 'local' || (g.authority && g.castleLife?.byId?.has(casterId));
        const cells = plan.cells.map((c) => ({ c, wait: 0, done: false }));
        const out = [];
        const flush = () => {
            if (!out.length) return;
            g.builder?._sendEdits(out.splice(0));
            g.castleLife?.breakWays?.({ x: A.x, y: A.L, z: A.z }, 6); // (the ways of the people round it are worked out again)
        };
        // the earth itself rises, smoothly, out of the ground: the wall's own blocks with the world's textures (the blocks laid under it show when it goes)
        const cs = plan.cols, n = cs.length;
        const rise = BREAKTHROUGH.GROW * 0.62, HOLD = 1.2;
        let mesh = null, mat = null;
        if (g.scene && n) {
            const byCol = new Map();
            for (const c of plan.cells) { if (!byCol.has(c[5])) byCol.set(c[5], []); byCol.get(c[5]).push(c); }
            for (const [c] of byCol) if (c.delay == null) c.delay = BREAKTHROUGH.GROW * 0.35; // (the foot's lumps of rubble)
            mat = riseMaterial();
            mat.userData.rise.DUR.value = rise;
            mesh = new THREE.Mesh(riseGeometry(byCol, data), mat);
            mesh.position.y = -1.5;
            mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
            g.scene.add(mesh);
        }
        const dust = () => {
            for (let k = 0; k < 4; k++) {
                const c = cs[(Math.random() * n) | 0];
                if (!c || t < c.delay || t > c.delay + rise + 0.15) continue;
                const pr = Math.min(1, (t - c.delay) / rise), col = sparkColor(c.mat);
                g.fx.spark(_v.set(c.x + (Math.random() - 0.5), c.g - 0.4, c.z + (Math.random() - 0.5)), 0xc9b48a, 0.26, _w.set((Math.random() - 0.5) * 3.2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 3.2), 0.8);
                g.fx.spark(_v.set(c.x + (Math.random() - 0.5), c.g - 0.5 + c.h * (1 - (1 - pr) * (1 - pr)), c.z + (Math.random() - 0.5)), col, 0.13, _w.set((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2.4, (Math.random() - 0.5) * 2.4), 0.6);
            }
        };
        const dropRise = () => { if (!mesh) return; g.scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); mesh = null; };
        let t = 0, sendT = 0, finished = false, first = true, doneAt = 0;
        g.spells.spells.push({
            life: BREAKTHROUGH.GROW + BREAKTHROUGH.WAIT + HOLD + 1.5,
            onUpdate: (spell, dt) => {
                t += dt;
                let left = 0;
                for (const e of cells) {
                    if (e.done) continue;
                    const [x, L, z, block, at, col, k] = e.c;
                    if (at > t) { left++; continue; }
                    if (col.dead) { e.done = true; continue; } // (a cell below was left out: this one would hang)
                    if (col.next !== k) { left++; continue; } // (the one under it is still to come)
                    if (occupied(g, { x, L, z })) {
                        e.wait += dt;
                        if (e.wait < BREAKTHROUGH.WAIT) { left++; continue; }
                        col.dead = true; e.done = true; continue;
                    }
                    e.done = true; col.next++;
                    if (!mine || !free(data.get(x, L, z))) continue;
                    data.set(x, L, z, block);
                    out.push([x, L, z, block]);
                    this._liftThings(x, L, z, col.g + col.h);
                    if (first && (casterId === g.localId || casterId === 'local')) { first = false; g.mana?.success?.(max ? 'BreakthroughMaxima' : 'Breakthrough'); }
                }
                sendT += dt;
                if (sendT >= BREAKTHROUGH.SEND) { sendT = 0; flush(); }
                if (mesh) { mat.userData.rise.T.value = t; dust(); }
                if (!left && t >= BREAKTHROUGH.GROW && !finished) {
                    finished = true; doneAt = t;
                    flush();
                    g.sound?.playStep?.();
                }
                if (finished && t >= doneAt + HOLD) { dropRise(); spell.life = 0; } // (the blocks are in the picture by now)
            },
            onEnd: () => { flush(); dropRise(); },
        });
    }

    /** One sample of the rising earth for Game.prewarm: its shader (instanced + per-instance colour) is compiled on loading. */
    sampleModels() {
        const c = { delay: 0, h: 1 };
        return [new THREE.Mesh(riseGeometry(new Map([[c, [[0, 0, 0, BLOCK.STONE], [0, 1, 0, BLOCK.GRASS]]]]), null), riseMaterial())];
    }

    /** (the caster's computer, who owns the things) Things lying in the cell come up on the top of the wall. */
    _liftThings(x, L, z, topLayer) {
        const loose = this.game.items?.loose;
        if (!loose) return;
        for (const it of loose.values()) {
            const p = it.model?.position;
            if (!p || Math.abs(p.x - x) > 0.6 || Math.abs(p.z - z) > 0.6 || p.y > L - 0.4 || p.y < L - 1.6) continue;
            p.y = topLayer - 0.5 + 0.12; // (on the top of the column's last block)
            it.rest = false; it.sentRest = false;
        }
    }
}
