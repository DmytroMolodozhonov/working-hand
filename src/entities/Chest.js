/**
 * Chest.js — map chest that opens when the player comes close.
 *
 * Fixes vs. the original:
 *   - the game crashed on opening ("Критическая ошибка (Game Loop)"): open()
 *     handed a bare mesh to Character.equip(), which expects an item;
 *     now the chest spawns a real physical weapon that rises out of the chest,
 *   - the chest is rotated so its front (lid + lock) faces open space, never a
 *     wall, and its collision box rotates with it,
 *   - the lid opens with a smooth eased animation (hinge at the back), with a
 *     little bounce and a sound.
 *
 * Locks (src/game/Alohomora.js): a chest of a village or a castle is locked —
 * the lid only rattles under the hand. «Алохомора» unlocks it: the lid springs
 * up a crack (`picked`), and the hand lifts it (liftTo) the rest of the way.
 */

import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

const SCALE = 3; // (a treasure chest; a household one in a villager's house is smaller — opts.scale)
/** The chest's size in metres per unit of scale: across (its local X), deep (Z), high with the lid shut. */
export const CHEST_W = 1.25, CHEST_D = 0.85, CHEST_H = 0.7;
/** Lid: hinged on its own top-back edge (chest-local y, z), and how far it reaches from there. */
const HINGE_Y = 0.7, HINGE_Z = -0.425;
export const LID_LEN = 0.85;
const _lp = new THREE.Vector3();
const OPEN_ANGLE = Math.PI * 0.62; // ~110°
const OPEN_TIME = 0.9; // seconds
/** The crack a lid springs open to when «Алохомора» unlocks it (rad). */
export const AJAR_ANGLE = 0.16;
/** Lifted by the hand past this angle the lid falls open by itself (rad). */
export const LIFT_OPEN = OPEN_ANGLE * 0.38;

/**
 * The chest's looks (`opts.style`): an ordinary one (oak, black iron, a brass lock), a boss's or a king's
 * (dark red wood, gold, lined with red velvet), a ship's (sea-worn grey oak, rusty iron, tarred inside),
 * the Ice Queen's (frosted pale-blue wood, silver, lined with snow-white); the castles' rooms (generation 8):
 * 'iron' (the strongbox: dark wood, bright steel bands), 'painted' (the clothes chest: teal paint, brass, lined with red
 * cloth), 'crate' (the store crate: pale pine, black nails, no lock plate shine).
 */
export const CHEST_STYLES = ['plain', 'rich', 'pirate', 'ice', 'iron', 'painted', 'crate'];
const LOOK = {
    plain: { wood: 0xb07a45, lid: 0x9c6a3a, metal: 0x3a3836, mShine: 40, lock: 0xc9a14a, inside: 0x7a5a3e, cloth: false },
    rich: { wood: 0x8a3b26, lid: 0x7a3020, metal: 0xd9ad3c, mShine: 90, lock: 0xe8c45a, inside: 0xb0202a, cloth: true, emblem: true },
    pirate: { wood: 0x8c8070, lid: 0x7a6e60, metal: 0x5a3e2c, mShine: 18, lock: 0xa8843c, inside: 0x6a5440, cloth: false, band: true },
    ice: { wood: 0xd4e8f6, lid: 0xc2def2, metal: 0x6f98c0, mShine: 110, lock: 0xeaf6ff, inside: 0xcfe6f7, cloth: true, emblem: true, gloss: 90 },
    iron: { wood: 0x565b64, lid: 0x4a4f58, metal: 0xaab3bd, mShine: 120, lock: 0xd8dde3, inside: 0x34373d, cloth: false, band: true },
    painted: { wood: 0x3d7a78, lid: 0x346b6a, metal: 0xc9a24a, mShine: 70, lock: 0xe6c660, inside: 0x9a2f3c, cloth: true },
    crate: { wood: 0xcaa978, lid: 0xb99868, metal: 0x4a3c2e, mShine: 8, lock: 0x6a5a44, inside: 0x8a7050, cloth: false },
};
/** Body walls: the box is hollow (walls T thick, the floor at FLOOR) — an opened chest is empty inside. */
const T = 0.05, FLOOR = 0.08, BW = 1.2, BD = 0.8, BH = 0.5;
/** The lid (lid-local: its centre 0.1 below the hinge, LID_LEN deep, 0.2 high at its ends, arched ARCH more). */
const LW = 1.25, LH = 0.2, ARCH = 0.05; // (its crown at chest-local y 0.75 — the top of its collision box)
const STRAP_X = 0.3; // (the two iron straps over the lid and down the front and the back)

/** Planks with grain, knots and dark seams (greyish: each look tints it) — or velvet. Made once; null in Node. */
let TEX = null;
function textures() {
    if (TEX) return TEX;
    TEX = { planks: null, cloth: null };
    if (typeof document === 'undefined') return TEX;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const S = 256, PL = 4; // (four planks a texture: one texture covers 0.5 m — planks 12.5 cm wide)
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    for (let p = 0; p < PL; p++) {
        const y0 = p * S / PL, h = S / PL, base = 175 + rnd() * 50;
        x.fillStyle = `rgb(${base},${base * 0.97},${base * 0.93})`;
        x.fillRect(0, y0, S, h);
        // the grain: long wavy lines, darker and lighter
        for (let k = 0; k < 14; k++) {
            const yy = y0 + 2 + rnd() * (h - 4), a = 0.03 + rnd() * 0.08, ph = rnd() * 6, amp = 0.6 + rnd() * 2.2;
            x.strokeStyle = rnd() < 0.7 ? `rgba(60,40,25,${a})` : `rgba(255,245,230,${a * 0.8})`;
            x.lineWidth = 0.8 + rnd() * 2.2;
            x.beginPath();
            for (let xx = 0; xx <= S; xx += 8) x.lineTo(xx, yy + Math.sin(xx / 37 + ph) * amp + Math.sin(xx / 11 + ph * 2) * 0.4);
            x.stroke();
        }
        // a knot or two
        for (let k = rnd() < 0.6 ? 1 : 2; k > 0; k--) {
            const kx = rnd() * S, ky = y0 + h * (0.3 + rnd() * 0.4);
            for (let r = 7; r > 0; r -= 1.5) {
                x.strokeStyle = `rgba(70,40,20,${0.12 + (7 - r) * 0.05})`;
                x.lineWidth = 1;
                x.beginPath(); x.ellipse(kx, ky, r * 1.9, r * 0.7, 0, 0, Math.PI * 2); x.stroke();
            }
        }
        // the seam between planks and the plank's worn edges; a butt joint somewhere along it
        x.fillStyle = 'rgba(30,18,10,0.85)'; x.fillRect(0, y0, S, 2);
        x.fillStyle = 'rgba(255,240,220,0.18)'; x.fillRect(0, y0 + 2, S, 1);
        const bx = (rnd() * S) | 0;
        x.fillStyle = 'rgba(30,18,10,0.8)'; x.fillRect(bx, y0, 2, h);
    }
    // nail heads at the joints
    const tex = (cv) => {
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
        return t;
    };
    TEX.planks = tex(c);
    // velvet: fine noise with a soft sheen
    const v = document.createElement('canvas');
    v.width = v.height = 128;
    const y = v.getContext('2d');
    const img = y.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
        const px = (i / 4) % 128, py = (i / 4 / 128) | 0;
        const l = 200 + rnd() * 40 + Math.sin(px / 9 + py / 23) * 10;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = l; img.data[i + 3] = 255;
    }
    y.putImageData(img, 0, 0);
    TEX.cloth = tex(v);
    return TEX;
}

/** UVs from the position in metres along the face (planks run along the chest's width and depth). */
function plankUV(geo, k = 2) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
        if (ny >= nx && ny >= nz) { uv[i * 2] = X * k * 0.5; uv[i * 2 + 1] = Z * k; } // (top / bottom: planks along the width)
        else if (nz >= nx) { uv[i * 2] = X * k * 0.5; uv[i * 2 + 1] = Y * k; } // (front / back)
        else { uv[i * 2] = Z * k * 0.5; uv[i * 2 + 1] = Y * k; } // (the ends)
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
}

/** A shade per vertex: the inside is darker the deeper (no light gets down there). */
function shade(geo, fn) {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const l = fn(p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = l; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
}

/** The lid's profile (lid-local z, y): flat ends, an arched top; `e` — puffed out by that (an iron strap over it). */
function lidShape(e = 0, bottom = -LH / 2) {
    const hz = LID_LEN / 2 + e, top = LH / 2 + e, sh = new THREE.Shape();
    sh.moveTo(-hz, bottom);
    sh.lineTo(hz, bottom);
    sh.lineTo(hz, top);
    const N = 10;
    for (let i = 1; i < N; i++) { const t = i / N, z = hz - t * 2 * hz; sh.lineTo(z, top + (ARCH + e * 0.3) * Math.sin(t * Math.PI)); }
    sh.lineTo(-hz, top);
    return sh;
}

/** A shape of the lid's profile `width` wide across the chest (lid-local, centred on x). */
function lidSolid(shape, width) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(-Math.PI / 2); // (shape x → lid-local z, the depth → across the chest)
    g.translate(width / 2, 0, 0);
    return g;
}

/** The lid's top point (lid-local y) above lid-local z. */
const archY = (z, e = 0) => LH / 2 + e + (ARCH + e * 0.3) * Math.sin((1 - (z + LID_LEN / 2 + e) / (LID_LEN + 2 * e)) * Math.PI);

const SHARED = {}; // (per look: its shapes and materials, made once — four looks, never more)
function shared(style) {
    if (SHARED[style]) return SHARED[style];
    const L = LOOK[style] || LOOK.plain, X = textures();
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const rivet = new THREE.SphereGeometry(0.014, 6, 4);
    const M = {
        // (lit per pixel, each light with its own shadow: a Lambert chest lit by «Люмос» in a cave
        // caught the sun's shadow map — black blots — and lit its big faces only at their corners)
        wood: new THREE.MeshPhongMaterial({ color: L.wood, map: X.planks, bumpMap: X.planks, bumpScale: 0.25, shininess: L.gloss || 8, specular: L.gloss ? 0x556677 : 0x161210 }),
        lidWood: new THREE.MeshPhongMaterial({ color: L.lid, map: X.planks, bumpMap: X.planks, bumpScale: 0.25, shininess: L.gloss || 8, specular: L.gloss ? 0x556677 : 0x161210 }),
        inside: new THREE.MeshPhongMaterial({ color: L.inside, map: L.cloth ? X.cloth : X.planks, vertexColors: true, shininess: L.cloth ? 4 : 2, specular: 0x080606 }),
        metal: new THREE.MeshPhongMaterial({ color: L.metal, shininess: L.mShine, specular: style === 'rich' ? 0x997733 : style === 'ice' ? 0xffffff : 0x555555 }),
        lock: new THREE.MeshPhongMaterial({ color: L.lock, shininess: 80, specular: 0x998855 }),
    };
    // ---- the body: an open box of planks (walls T thick, a floor), its corners at chest-local y 0..BH
    const wood = [
        { geo: box(BW, BH, T), pos: [0, BH / 2, BD / 2 - T / 2] }, { geo: box(BW, BH, T), pos: [0, BH / 2, -BD / 2 + T / 2] },
        { geo: box(T, BH, BD - 2 * T), pos: [BW / 2 - T / 2, BH / 2, 0] }, { geo: box(T, BH, BD - 2 * T), pos: [-BW / 2 + T / 2, BH / 2, 0] },
        { geo: box(BW - 2 * T, FLOOR, BD - 2 * T), pos: [0, FLOOR / 2, 0] },
        // (a plinth round the foot and a rim round the top: thicker boards)
        { geo: box(BW + 0.02, 0.06, BD + 0.02), pos: [0, 0.03, 0] },
    ];
    const body = plankUV(mergeParts(wood), 1.5); // (three wide planks up a wall)
    // ---- inside: walls and floor lined (dark planks / velvet), shaded deeper down
    const iw = BW - 2 * T - 0.004, id = BD - 2 * T - 0.004, ih = BH - FLOOR;
    const plane = (w, h) => new THREE.PlaneGeometry(w, h);
    const inside = shade(plankUV(mergeParts([
        { geo: plane(iw, id), pos: [0, FLOOR + 0.002, 0], rot: [-Math.PI / 2, 0, 0] },
        { geo: plane(iw, ih), pos: [0, FLOOR + ih / 2, -id / 2], rot: [0, 0, 0] },
        { geo: plane(iw, ih), pos: [0, FLOOR + ih / 2, id / 2], rot: [0, Math.PI, 0] },
        { geo: plane(id, ih), pos: [-iw / 2, FLOOR + ih / 2, 0], rot: [0, Math.PI / 2, 0] },
        { geo: plane(id, ih), pos: [iw / 2, FLOOR + ih / 2, 0], rot: [0, -Math.PI / 2, 0] },
        // (the keyhole: a black slot in the lock plate — dark as the inside)
        { geo: box(0.022, 0.05, 0.004), pos: [0, 0.31, BD / 2 + 0.017] },
        { geo: new THREE.CylinderGeometry(0.017, 0.017, 0.004, 8), pos: [0, 0.34, BD / 2 + 0.017], rot: [Math.PI / 2, 0, 0] },
    ]), 3), (x, y, z) => z > BD / 2 ? 0.04 : y < FLOOR + 0.01 ? 0.32 - 0.12 * (Math.abs(x) / (iw / 2)) * (Math.abs(z) / (id / 2)) : 0.3 + 0.7 * ((y - FLOOR) / ih) ** 1.4);
    // ---- the body's iron: corner angles, straps down the front and back, a band round the foot,
    //      the handles at the ends, rivets; its lock plate
    const met = [];
    const o = 0.006; // (stands off the wood: flush faces flickered)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        met.push({ geo: box(0.1, BH - 0.02, 0.012), pos: [sx * (BW / 2 - 0.05 + o), BH / 2 + 0.01, sz * (BD / 2 + o)] });
        met.push({ geo: box(0.012, BH - 0.02, 0.1), pos: [sx * (BW / 2 + o), BH / 2 + 0.01, sz * (BD / 2 - 0.05 + o)] });
        for (const yy of [0.09, 0.25, 0.42]) {
            met.push({ geo: rivet, pos: [sx * (BW / 2 - 0.03), yy, sz * (BD / 2 + 0.013)] });
            met.push({ geo: rivet, pos: [sx * (BW / 2 + 0.013), yy, sz * (BD / 2 - 0.03)] });
        }
        // the corner caps of the plinth
        met.push({ geo: box(0.07, 0.07, 0.07), pos: [sx * (BW / 2 - 0.02), 0.035, sz * (BD / 2 - 0.02)], scale: [1.15, 1, 1.15] });
    }
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
        met.push({ geo: box(0.07, BH - 0.02, 0.012), pos: [sx * STRAP_X, BH / 2 + 0.01, sz * (BD / 2 + o)] });
        for (const yy of [0.1, 0.24, 0.38]) met.push({ geo: rivet, pos: [sx * STRAP_X, yy, sz * (BD / 2 + 0.013)] });
    }
    // under the body: the straps go round the bottom
    for (const sx of [-1, 1]) met.push({ geo: box(0.07, 0.012, BD + 0.024), pos: [sx * STRAP_X, -0.004, 0] });
    if (L.band) for (const sz of [-1, 1]) met.push({ geo: box(BW + 0.024, 0.045, 0.012), pos: [0, 0.2, sz * (BD / 2 + o)] }); // (a ship's chest: one more band, against the knocks)
    // the handles: a mount plate and a hanging ring at each end
    const ring = new THREE.TorusGeometry(0.075, 0.013, 6, 12, Math.PI);
    for (const sx of [-1, 1]) {
        met.push({ geo: box(0.014, 0.07, 0.2), pos: [sx * (BW / 2 + 0.008), 0.37, 0] });
        met.push({ geo: ring, pos: [sx * (BW / 2 + 0.03), 0.37, 0], rot: [0, Math.PI / 2, Math.PI] });
        for (const zz of [-0.075, 0.075]) met.push({ geo: rivet, pos: [sx * (BW / 2 + 0.016), 0.37, zz] });
    }
    const metal = mergeParts(met);
    const lockPlate = mergeParts([
        { geo: box(0.17, 0.17, 0.012), pos: [0, 0.34, BD / 2 + 0.01] },
        ...[[-0.065, 0.405], [0.065, 0.405], [-0.065, 0.275], [0.065, 0.275]].map(([x, y]) => ({ geo: rivet, pos: [x, y, BD / 2 + 0.017], scale: [0.8, 0.8, 0.8] })),
    ]);
    // ---- the lid (lid-local: its centre at the lid mesh's place, (0, −0.1, LID_LEN/2) from the hinge)
    const lid = plankUV(lidSolid(lidShape(0), LW));
    const lidMet = [];
    for (const sx of [-1, 1]) {
        lidMet.push({ geo: lidSolid(lidShape(0.008, -LH / 2 + 0.002), 0.07), pos: [sx * STRAP_X, 0, 0] });
        // rivets along the strap, over the arch
        for (let i = 0; i <= 6; i++) {
            const z = -LID_LEN / 2 + 0.06 + i * (LID_LEN - 0.12) / 6;
            lidMet.push({ geo: rivet, pos: [sx * STRAP_X, archY(z, 0.008) + 0.002, z] });
        }
        // the lid's end corners: little angle caps; the hinges at the back (their barrels on the hinge line)
        for (const sz of [-1, 1]) {
            lidMet.push({ geo: box(0.09, LH - 0.02, 0.012), pos: [sx * (LW / 2 - 0.045 + o), 0, sz * (LID_LEN / 2 + o)] });
            lidMet.push({ geo: box(0.012, LH - 0.02, 0.09), pos: [sx * (LW / 2 + o), 0, sz * (LID_LEN / 2 - 0.045 + o)] });
        }
        lidMet.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), pos: [sx * 0.42, LH / 2, -LID_LEN / 2], rot: [0, 0, Math.PI / 2] });
        lidMet.push({ geo: box(0.1, 0.012, 0.16), pos: [sx * 0.42, archY(-LID_LEN / 2 + 0.08) + 0.004, -LID_LEN / 2 + 0.08] });
    }
    // a band along the front and the back of the lid, over the joint
    for (const sz of [-1, 1]) lidMet.push({ geo: box(LW + 0.02, 0.04, 0.012), pos: [0, -LH / 2 + 0.025, sz * (LID_LEN / 2 + o)] });
    if (L.emblem) { // (a boss's chest: a medallion on top between the straps)
        lidMet.push({ geo: new THREE.CylinderGeometry(0.09, 0.09, 0.016, 16), pos: [0, archY(0) + 0.006, 0] });
        lidMet.push({ geo: box(0.11, 0.02, 0.11), pos: [0, archY(0) + 0.012, 0], rot: [0, Math.PI / 4, 0] });
    }
    const lidMetal = mergeParts(lidMet);
    // the hasp: hangs from the lid's front over the lock plate (lid-local)
    const hasp = mergeParts([
        { geo: box(0.08, 0.18, 0.014), pos: [0, -LH / 2 - 0.02, LID_LEN / 2 + 0.014] },
        { geo: new THREE.TorusGeometry(0.022, 0.007, 5, 10), pos: [0, -LH / 2 - 0.1, LID_LEN / 2 + 0.024] },
        ...[0.03, -0.05].map((y) => ({ geo: rivet, pos: [0, y, LID_LEN / 2 + 0.021], scale: [0.8, 0.8, 0.8] })),
    ]);
    // its underside: lined like the inside (seen when the lid is up)
    const lidIn = shade(plankUV(mergeParts([{ geo: plane(LW - 0.08, LID_LEN - 0.08), pos: [0, -LH / 2 - 0.002, 0], rot: [Math.PI / 2, 0, 0] }]), 3), () => 0.55);
    const S = { ...M, geo: { body, inside, metal, lockPlate, lid, lidMetal, hasp, lidIn } };
    for (const g of Object.values(S.geo)) g.userData.shared = true; // (Game.prewarm's samples leave them)
    for (const g of [rivet, ring]) g.dispose();
    SHARED[style] = S;
    return S;
}

/** One chest of each look (Game.prewarm): their shaders compiled at loading. */
export function chestSamples() {
    return CHEST_STYLES.map((st) => {
        const c = new Chest(null, new THREE.Vector3(), 'loot', 0, 'prewarm', { style: st });
        return c.mesh;
    });
}

const easeOutBack = (t) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Chest {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position  floor position (y is the floor level)
     * @param {string} itemType  'sword' | 'axe'
     * @param {number} facing  rotation.y so the front (+Z) faces open space
     * @param {string|number} id
     * @param {{scale?: number, style?: string}} [opts]  scale: its size (3 — a treasure chest);
     *        style: its look — CHEST_STYLES ('plain', a boss's 'rich', a ship's 'pirate', the Ice Queen's 'ice')
     */
    constructor(scene, position, itemType, facing = 0, id = 0, opts = {}) {
        this.scale = opts.scale || SCALE;
        this.style = LOOK[opts.style] ? opts.style : 'plain';
        this.scene = scene;
        this.id = id;
        this.itemType = itemType || 'sword';
        this.isOpen = false;
        this.openProgress = 0;
        this.animating = false;
        this.itemSpawned = false;
        this.locked = false; // (a settlement's chest: src/game/Alohomora.js)
        this.openMax = OPEN_ANGLE; // (against a wall: the lid stops on it — setWallGap)
        this.picked = false; // unlocked by «Алохомора»: the lid stands open a crack, the hand lifts it
        this.fromAngle = 0; // where the opening starts (a lid already lifted by the hand)
        this.shakeT = 0;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.mesh.rotation.y = facing;
        this.mesh.scale.setScalar(this.scale);
        this.createModel();
        scene?.add(this.mesh);
    }

    createModel() {
        const s = shared(this.style), G = s.geo;
        const part = (geo, mat, parent = this.mesh) => {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true;
            m.receiveShadow = true;
            parent.add(m);
            return m;
        };
        part(G.body, s.wood); // (planks: four walls, a floor, a plinth — hollow)
        part(G.inside, s.inside).castShadow = false; // (dark inside, visible once the lid is up)
        part(G.metal, s.metal); // (the iron: corners, straps, handles, rivets)
        part(G.lockPlate, s.lock);

        // Lid pivots on its top-back edge (the hinges): opened, it goes no further back than
        // the chest's back, so a chest standing at a wall opens without going into it
        this.lidGroup = new THREE.Group();
        this.lidGroup.position.set(0, HINGE_Y, HINGE_Z);
        this.lid = part(G.lid, s.lidWood, this.lidGroup);
        this.lid.position.set(0, -0.1, LID_LEN / 2);
        for (const [g, m] of [[G.lidMetal, s.metal], [G.hasp, s.lock], [G.lidIn, s.inside]]) part(g, m, this.lidGroup).position.copy(this.lid.position);
        this.mesh.add(this.lidGroup);
    }

    /**
     * The chest stands `gap` metres in front of a wall: the lid opens until it leans on it
     * (a thrown-back lid would go into the wall).
     */
    setWallGap(gap) {
        const c = -gap / this.scale / LID_LEN; // (cos of the angle past which the lid's front edge reaches the wall)
        this.openMax = Math.min(OPEN_ANGLE, Math.PI / 2 + Math.asin(Math.max(0, Math.min(1, -c))));
    }

    /** Axis-aligned collision box (rotates with the chest). */
    getCollisionBox() {
        const w = CHEST_W * this.scale / 2, d = CHEST_D * this.scale / 2;
        const quarter = Math.round(this.mesh.rotation.y / (Math.PI / 2));
        const swap = Math.abs(quarter) % 2 === 1;
        const hx = swap ? d : w, hz = swap ? w : d;
        const p = this.mesh.position;
        return { minX: p.x - hx, maxX: p.x + hx, minY: p.y - 0.5, maxY: p.y + 0.75 * this.scale, minZ: p.z - hz, maxZ: p.z + hz, kind: 'chest', chest: this }; // (chest: a shut one stops the hand — HandBlocks)
    }

    /** World position where the reward appears (just above the opening). */
    getRewardPosition(out = new THREE.Vector3()) {
        return out.set(0, 0.62, 0).applyMatrix4(this.mesh.matrixWorld);
    }

    getPosition() {
        return this.mesh.position;
    }

    /** Start opening. Returns true if it actually started now. */
    open() {
        if (this.isOpen) return false;
        this.isOpen = true;
        this.animating = true;
        this.fromAngle = -this.lidGroup.rotation.x;
        this.openProgress = this.fromAngle > 0.05 ? 0.15 : 0; // (lifted by the hand / unlocked: no unlock shake)
        return true;
    }

    /** «Алохомора»: the lock clicks open, the lid springs up a crack. */
    setAjar() {
        this.picked = true;
        if (!this.isOpen && -this.lidGroup.rotation.x < AJAR_ANGLE) this.lidGroup.rotation.x = -AJAR_ANGLE;
    }

    /** The hand lifts (or lowers) the lid of an unlocked chest; true when it is up far enough to fall open. */
    liftTo(angle) {
        if (this.isOpen) return false;
        const a = Math.max(AJAR_ANGLE, Math.min(this.openMax, angle));
        this.lidGroup.rotation.x = -a;
        return a >= LIFT_OPEN;
    }

    /** The lid of a locked chest tried by the hand: it rattles. */
    rattle() { this.shakeT = 0.3; }

    /** The angle round the lid's hinge (chest-local y, z from the hinge) of a world point, and its distance. */
    hingeOf(p, out = {}) {
        const l = this.mesh.worldToLocal(_lp.copy(p));
        const dy = l.y - HINGE_Y, dz = l.z - HINGE_Z;
        out.angle = Math.atan2(dy, dz);
        out.r = Math.hypot(dy, dz) * this.scale;
        out.x = l.x * this.scale;
        return out;
    }

    /** The world point of the lid's front edge (where the fingers go under it). */
    lidEdge(out = new THREE.Vector3()) {
        this.lid.updateWorldMatrix(true, false);
        return out.set(0, 0, 0.42).applyMatrix4(this.lid.matrixWorld);
    }

    /** Shut it again (the creative test chest refills): the lid comes down. */
    close() {
        this.isOpen = false;
        this.fromAngle = 0;
        this.animating = false;
        this.openProgress = 0;
        this.lidGroup.rotation.x = 0;
    }

    /** Apply an already-open state instantly (late multiplayer join). */
    setOpenInstant() {
        this.isOpen = true;
        this.animating = false;
        this.openProgress = 1;
        this.lidGroup.rotation.x = -this.openMax;
    }

    update(dt) {
        if (this.shakeT > 0) {
            this.shakeT -= dt;
            this.lidGroup.rotation.x = this.shakeT > 0 ? -Math.abs(Math.sin(this.shakeT * 70)) * 0.03 : 0;
        }
        if (!this.animating) return;
        this.openProgress = Math.min(1, this.openProgress + dt / OPEN_TIME);
        const t = this.openProgress;
        // Short "unlock" shake, then the lid swings open with a soft overshoot.
        if (t < 0.15) {
            this.lidGroup.rotation.x = -0.04 * Math.sin(t * 120);
        } else {
            const k = (t - 0.15) / 0.85;
            const a0 = this.fromAngle || 0;
            this.lidGroup.rotation.x = -(a0 + (this.openMax - a0) * easeOutBack(k));
        }
        if (t >= 1) {
            this.lidGroup.rotation.x = -this.openMax;
            this.animating = false;
        }
    }

    dispose() {
        this.scene?.remove(this.mesh);
    }
}
