/**
 * SwanModel.js — the swans of the marshy lakes (Animals.js, type 'swan'; SwanLife.js — how they live): a mute swan's shape.
 *
 * Sizes (the world's measures: a block 1 m, the hero ~3.5 m; real swans ×2 as all the animals): the model is in its own units and
 * scaled by SPECIES.swan.size (2.0) — the body 0.96 long (1.9 m), 0.44 wide (0.9 m); the waterline at y = WATERLINE (0.14), the back
 * 0.45 (0.6 m over the water), the head held ~1.4 m over the water, the bill 0.26 m; a wingspan of ~4.3 m spread.
 * On land it stands on short black legs (the feet at y = 0) — on the water they paddle under it.
 *
 * Not a balloon: the body a boat-like sweep — a full high breast, a flat back, the rear rising to a short pointed tail; rows of
 * feathers in its shading (lighter crests, darker between), a greyer, water-stained belly; the neck an S, thick at the root and slim
 * under the head; the head a little wedge, the bill orange with a black knob at its base, a black nail at its tip and a black mask
 * from the eye to the bill; webbed feet (three toes and the webs). The wings: the feathered pig wing of the kit (morph: folded ⇄
 * spread ⇄ the tips bent), bigger, white — folded they lie over the sides as a swan's do.
 *
 * The magic swan (1 in 3): a pearly coat with a soft play of blue-violet and gold over the feathers, a faint glow of its own, a
 * pale-gold bill with a silver-blue knob and eyes of light — it is told from a plain one across a lake.
 * Shapes are shared by every swan of a look (the kit's cache); the materials too.
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from './AnimalModels.js';

/** The waterline in the model's units (scaled by the swan's size): the body sits this deep. */
export const WATERLINE = 0.14;

const _mats = new Map();
function mat(key, make) { let m = _mats.get(key); if (!m) { m = make(); _mats.set(key, m); } return m; }

/** The swan's own coat colours: (t along the body 0 tail … 1 breast, the angle round it, the point) → rgb. */
function coat(magic) {
    return (t, ang, p) => {
        // feather rows: light crests, darker between them, running back and round the body
        const rows = Math.sin(t * 64 + Math.sin(ang * 2) * 2) * Math.sin(ang * 13 + t * 7);
        let v = 0.94 + 0.035 * rows;
        // the belly under the water greyer and a little stained
        const low = K.smooth(0.2, 0.08, p.y);
        let c = [v, v * 0.99, v * 0.965];
        c = K.mix(c, [0.78, 0.79, 0.76], 0.55 * low);
        if (magic) {
            // the pearly play of colours: blue-violet and gold drifting along and round
            const h = Math.sin(t * 7.3 + ang * 1.7), q = Math.sin(t * 4.1 - ang * 2.3 + 1.2);
            c = K.mix(c, [0.82 + 0.1 * q, 0.86, 1.0], 0.35 * (0.5 + 0.5 * h));
            c = K.mix(c, [1.0, 0.93, 0.74], 0.22 * Math.max(0, q));
        }
        return c;
    };
}

function bodyMat(magic) {
    return mat('body' + magic, () => {
        const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
        if (magic) { m.emissive = new THREE.Color(0x9fc8ff); m.emissiveIntensity = 0.16; } // (a faint light of its own — never a shine)
        return m;
    });
}

/** The webbed foot: three toes fanning forward and the webs between them (flat, a little cupped); its heel at 0, toes along −Z. */
function footGeo() {
    return K.cached('swanFoot', () => {
        const pos = [], idx = [];
        const toes = [-0.42, 0, 0.42]; // (spread angles)
        const L = 0.085;
        pos.push(0, 0, 0); // heel
        for (const a of toes) {
            for (let i = 1; i <= 3; i++) { const k = i / 3, l = L * k; pos.push(Math.sin(a) * l, -0.004 * k + 0.006 * Math.sin(Math.PI * k), -Math.cos(a) * l); }
        }
        // the webs: between toe 0–1 and 1–2, a slight sag (cupped)
        const toe = (j, i) => 1 + j * 3 + (i - 1);
        for (let j = 0; j < 2; j++) {
            idx.push(0, toe(j, 1), toe(j + 1, 1));
            for (let i = 1; i < 3; i++) idx.push(toe(j, i), toe(j, i + 1), toe(j + 1, i), toe(j + 1, i), toe(j, i + 1), toe(j + 1, i + 1));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    });
}

/** A swan: color 1 — plain, 2 — magic. Body along −Z, the feet at y = 0, the named parts as the other animals' (AnimalModels.js). */
export function swanModel(color = 1) {
    const magic = color === 2;
    const g = new THREE.Group();
    g.name = magic ? 'swanMagic' : 'swan';
    const legs = [];
    const skin = bodyMat(magic);
    const paint = coat(magic);
    const white = mat('white' + magic, () => magic ? Object.assign(new THREE.MeshLambertMaterial({ color: 0xf2f4ff, vertexColors: true }), { emissive: new THREE.Color(0x9fc8ff), emissiveIntensity: 0.16 }) : new THREE.MeshLambertMaterial({ color: 0xf7f6f1, vertexColors: true }));
    // the body: a boat-like sweep from the tail (t 0, z +0.5) to the breast (t 1, z −0.46)
    const body = K.mesh(g, K.cached('swanBody' + magic, () => {
        const k = K.keys([
            [0.00, 0.41, 0.34, 0.03],
            [0.06, 0.41, 0.25, 0.10],
            [0.18, 0.44, 0.14, 0.19],
            [0.40, 0.455, 0.095, 0.22],
            [0.62, 0.455, 0.095, 0.22],
            [0.82, 0.43, 0.12, 0.20],
            [0.94, 0.39, 0.17, 0.15],
            [1.00, 0.35, 0.24, 0.06],
        ]);
        return K.sweep([K.v3(0, 0, 0.5), K.v3(0, 0, -0.46)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; }, {
            rings: 34, sides: 20, color: paint,
            // (the wings' shoulders over the back, a soft keel under the breast: not a smooth egg)
            bump: (t, ang) => 1 + 0.03 * Math.exp(-(((t - 0.62) / 0.12) ** 2)) * Math.max(0, Math.sin(ang)) + 0.012 * Math.sin(t * 64 + ang * 13),
        });
    }), skin);

    // the neck: an S — forward from the breast, up and a little back, then the head forward
    const neck = K.group(g, 'neck', 0, 0.36, -0.38);
    const neckPts = [K.v3(0, 0, 0), K.v3(0, 0.09, -0.08), K.v3(0, 0.21, -0.07), K.v3(0, 0.31, -0.01), K.v3(0, 0.39, -0.06), K.v3(0, 0.42, -0.13)];
    K.mesh(neck, K.cached('swanNeck' + magic, () => K.sweep(neckPts, K.keys([[0, 0.088, 0.1, 0], [0.2, 0.066, 0.072, 0], [0.5, 0.05, 0.054, 0], [0.8, 0.046, 0.05, 0], [1, 0.05, 0.052, 0]]), {
        rings: 22, sides: 10, color: (t, ang, p) => { const c = paint(0.9, ang, { y: 0.4 }); const f = 1 - 0.035 * Math.sin(t * 40) * Math.sin(ang * 6); return [c[0] * f, c[1] * f, c[2] * f]; },
    })), white);
    // the head: a small wedge, the bill forward and a little down
    const head = K.group(neck, 'head', 0, 0.42, -0.13);
    head.rotation.x = -0.3;
    K.mesh(head, K.cached('swanHead' + magic, () => K.sweep([K.v3(0, 0.005, 0.045), K.v3(0, 0.01, -0.04), K.v3(0, -0.004, -0.115)], K.keys([[0, 0.04, 0.042, 0], [0.4, 0.05, 0.05, 0.004], [1, 0.032, 0.03, -0.004]]), {
        rings: 10, sides: 10, color: (t, ang) => paint(0.95, ang, { y: 0.4 }),
    })), white);
    const billHex = magic ? 0xeec871 : 0xe0702a;
    const bill = K.mesh(head, K.cached('swanBill', () => K.sweep([K.v3(0, -0.006, -0.11), K.v3(0, -0.016, -0.18), K.v3(0, -0.028, -0.245)], K.keys([[0, 0.03, 0.024, 0], [0.5, 0.022, 0.016, 0], [1, 0.012, 0.009, 0]]), {
        rings: 10, sides: 8, color: (t, ang) => { const top = 0.5 + 0.5 * Math.sin(ang); const v = 0.86 + 0.14 * top; return [v, v * (0.96 + 0.04 * top), v * 0.95]; }, // (the ridge lighter, the gape darker)
    })), K.lamV(billHex));
    bill.name = 'bill';
    const dark = magic ? K.lam(0x5b6fa8) : K.lam(0x161414);
    K.blob(head, dark, 0.02, 0.022, 0.03, 0, 0.012, -0.112, false); // the knob at the bill's base
    K.blob(head, dark, 0.009, 0.006, 0.012, 0, -0.024, -0.246, false); // the nail at its tip
    const eyeMat = magic ? mat('eyeMagic', () => new THREE.MeshBasicMaterial({ color: 0x9ef0ff })) : K.lam(0x0c0a0a);
    for (const s of [1, -1]) {
        const mask = K.blob(head, dark, 0.008, 0.016, 0.032, 0.03 * s, -0.002, -0.1, false); // the black lores, eye to bill
        mask.rotation.x = 0.25;
        K.blob(head, eyeMat, 0.009, 0.01, 0.01, 0.036 * s, 0.012, -0.07, false);
    }

    // the tail: a short pointed fan, raised
    const tail = K.group(g, 'tail', 0, 0.38, 0.48);
    for (let i = -2; i <= 2; i++) {
        const f = K.blob(tail, white, 0.032, 0.012, 0.075, i * 0.022, 0.008 - Math.abs(i) * 0.004, 0.04 - Math.abs(i) * 0.01);
        f.rotation.y = i * 0.18; f.rotation.x = -0.25;
    }

    // the legs: short and black, set back under the body; webbed feet
    const legMat = K.lam(magic ? 0x2a2e3a : 0x262427);
    const up = [[0, 0.032, 0.036], [1, 0.022, 0.024]], low = [[0, 0.02, 0.022], [1, 0.016, 0.017]];
    for (const s of [1, -1]) {
        const l = K.leg(g, legs, s > 0 ? 'legRight' : 'legLeft', 0.12 * s, WATERLINE, 0.1, false, 'swanLeg', [0.015, 0.07, up], [0.008, 0.066, low], [0.018, 0.006, magic ? 0x2a2e3a : 0x262427], legMat);
        K.mesh(l.userData.lower, footGeo(), legMat, 0, -0.068, 0.012, false);
    }

    // the wings: folded over the sides (the kit's feathered wing, bigger and white)
    const wings = [];
    const feather = magic ? K.wingMat(0xeef3ff, 0x9fc8ff) : K.wingMat(0xf9f8f4);
    for (const s of [1, -1]) {
        const w = K.group(g, s > 0 ? 'wingRight' : 'wingLeft', 0.19 * s, 0.43, -0.2);
        w.scale.set(0.82 * s, 0.5, 0.82); // (folded: the feathers lie close over the flank, not a fringe hanging down; spread the wing lies flat — y barely matters)
        w.rotation.order = 'ZYX';
        w.userData.side = s;
        const m = K.mesh(w, K.pigWingGeo(), feather);
        m.name = 'wing';
        w.userData.mesh = m;
        wings.push(w);
    }
    const out = K.finish(g, { body, neck, head, tail, legs, wings, look: magic ? 2 : 1, swan: true, magicSwan: magic });
    out.userData.grazePitch = -1.3; // (dabbling: the head down into the water)
    return out;
}

/**
 * A swan's two wings as a thing (an item: 'swanWings' / 'magicSwanWings' — the potion of wings wants the magic ones): the pair of the
 * kit's feathered wings, half spread, crossed at the shoulder and tied with a twine; the magic pair pearly with a faint light and a few
 * motes of light along the feathers. ~0.5 long (ItemTypes.ITEM_SCALE makes it ~1 m in the hand).
 */
export function swanWingsItemModel(magic = false) {
    const g = new THREE.Group();
    g.name = magic ? 'magicSwanWings' : 'swanWings';
    const feather = magic ? K.wingMat(0xeef3ff, 0x9fc8ff) : K.wingMat(0xf9f8f4);
    // ONE bundle (the author 06.11: «выглядит ужасно, состоит из двух элементов»): the two wings are laid together, root to root, tips together, back to back
    // like a closed book, bound with two leather straps with brass buckles and a knot — one object, not two floating wings.
    for (const s of [1, -1]) {
        const w = new THREE.Group();
        w.scale.set(0.42 * s, 0.42, 0.42);
        w.position.x = 0.012 * s;
        w.rotation.set(-Math.PI / 2 + 0.05 * s, 0, 0.04 * s); // (the span along the item's length, the wings nearly parallel: a slight fan only at the tips)
        const m = new THREE.Mesh(K.pigWingGeo(), feather);
        m.morphTargetInfluences = [0.2, 0.05]; // (folded: the feathers close up)
        m.castShadow = true;
        w.add(m);
        g.add(w);
    }
    const strap = K.lam(0x6a4a2a), brass = K.lam(0xc9a23a);
    const band = K.cached('swanBand', () => new THREE.BoxGeometry(0.07, 0.014, 0.05));
    const buckle = K.cached('swanBuckle', () => new THREE.BoxGeometry(0.02, 0.022, 0.056));
    for (const z of [-0.06, -0.2]) { // (two straps round the bundle)
        const b1 = new THREE.Mesh(band, strap); b1.position.set(0, 0, z); b1.scale.set(1.05, 1, 1); g.add(b1);
        const b2 = new THREE.Mesh(band, strap); b2.position.set(0, 0.02, z); b2.scale.set(0.9, 1, 1); g.add(b2);
        const bk = new THREE.Mesh(buckle, brass); bk.position.set(0.02, 0.012, z); g.add(bk);
    }
    const knot = new THREE.Mesh(K.cached('swanKnot', () => new THREE.SphereGeometry(0.014, 7, 5)), strap); knot.position.set(-0.025, 0.014, -0.06); g.add(knot);
    if (magic) {
        const mote = mat('mote', () => new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.85, depthWrite: false }));
        const r = K.rng(77);
        for (let i = 0; i < 9; i++) {
            const d = K.mesh(g, K.ball(5, 4), mote, (r() - 0.5) * 0.4, 0.02 + r() * 0.05, -0.05 - r() * 0.4, false);
            d.scale.setScalar(0.006 + r() * 0.006);
        }
    }
    return g;
}
