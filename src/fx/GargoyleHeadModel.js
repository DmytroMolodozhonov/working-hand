/**
 * GargoyleHeadModel.js — «Голова горгульи» (вещь: ключ возврата из ада — HellRules.HEAD). Отбитая каменная голова той же красной породы, что и горгульи
 * (их текстура: камень с тлеющими прожилками — GargoyleModel.gargoyleTextures): вытянутая морда с ноздрями, тяжёлые надбровья, скулы, приоткрытая пасть
 * с клыками, острые уши, два рога назад-вверх, тлеющие глаза и неровный скол шеи снизу. Размер вещи в руке/на земле ~0,6 м модели × ITEM_SCALE 2 ≈ 1,2 м
 * (сама горгулья ~4–5 м: голова ~1/4 роста). Формы — общие (кэш, userData.shared), части одного материала слиты (MergeGeometry.mergeParts): 3 отрисовки.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { gargoyleTextures } from '../game/GargoyleModel.js';

let _S = null;

/** A tapered horn curving back and up: rings along a curve, radius r0 → 0. */
function hornGeo(r0, len, bend, seg = 10, rad = 7) {
    const pos = [], idx = [], uv = [];
    for (let i = 0; i <= seg; i++) {
        const t = i / seg, r = r0 * (1 - t) ** 0.9 + 0.004;
        const cx = 0, cy = len * t, cz = -bend * t * t; // (sweeps back as it rises)
        for (let j = 0; j <= rad; j++) {
            const a = (j / rad) * Math.PI * 2;
            const ridge = 1 + 0.12 * Math.sin(t * 40) * (1 - t); // (the rings of a horn)
            pos.push(cx + Math.cos(a) * r * ridge, cy, cz + Math.sin(a) * r * ridge);
            uv.push(j / rad, t);
        }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
        const a = i * (rad + 1) + j, b = a + rad + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

/** The skull: a sphere pushed into a gargoyle's face — snout forward (+z), brows, cheeks, the broken neck below. */
function skullGeo() {
    const g = new THREE.SphereGeometry(0.2, 30, 22);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        let { x, y, z } = v;
        const f = Math.max(0, z / 0.2); // (0 at the back … 1 at the front)
        z += 0.13 * f * f * (1 - Math.max(0, y / 0.2) * 0.6); // the snout
        y -= 0.05 * f * f; // (the snout droops)
        x *= 1 - 0.32 * f * f; // (narrower at the muzzle)
        const brow = Math.exp(-((y - 0.07) ** 2) / 0.0012) * f; y += 0.025 * brow; z += 0.03 * brow; // heavy brows
        const cheek = Math.exp(-((y + 0.02) ** 2) / 0.002) * Math.max(0, 1 - Math.abs(z - 0.08) / 0.12); x *= 1 + 0.18 * cheek; // cheekbones
        if (y < -0.12) { const k = (y + 0.12) / 0.08; y = -0.12 + k * 0.08 * 0.35 + 0.012 * Math.sin(x * 70) * Math.cos(z * 60); } // the broken neck: flat, jagged
        const knob = 0.006 * Math.sin(x * 61 + z * 13) * Math.sin(y * 47); // (the stone's bumps)
        const n = Math.hypot(x, y, z) || 1;
        p.setXYZ(i, x + (x / n) * knob, y + (y / n) * knob, z + (z / n) * knob);
    }
    g.computeVertexNormals();
    return g;
}

function shared() {
    if (_S) return _S;
    const tx = gargoyleTextures();
    const stone = new THREE.MeshLambertMaterial({ color: 0xe8c0b2, map: tx?.stone || null, emissive: tx ? 0xffffff : 0x1a0400, emissiveMap: tx?.glow || null, emissiveIntensity: 0.8 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a1410 }); // (the mouth's dark, the nostrils)
    const glow = new THREE.MeshBasicMaterial({ color: 0xff7a1c });
    for (const m of [stone, dark, glow]) m.userData.shared = true;
    const jaw = new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    const fang = new THREE.ConeGeometry(0.014, 0.06, 6);
    const ear = new THREE.ConeGeometry(0.035, 0.13, 5);
    const parts = [
        { geo: skullGeo() },
        { geo: jaw, pos: [0, -0.07, 0.16], rot: [0.32, 0, 0], scale: [0.8, 0.55, 1.15] }, // the lower jaw, a little open
        { geo: hornGeo(0.045, 0.26, 0.16), pos: [0.1, 0.13, -0.02], rot: [-0.3, 0, -0.45] },
        { geo: hornGeo(0.045, 0.26, 0.16), pos: [-0.1, 0.13, -0.02], rot: [-0.3, 0, 0.45] },
        { geo: ear, pos: [0.17, 0.06, -0.05], rot: [0.2, 0, -1.2] },
        { geo: ear, pos: [-0.17, 0.06, -0.05], rot: [0.2, 0, 1.2] },
    ];
    for (const sx of [-1, 1]) {
        parts.push({ geo: fang, pos: [0.045 * sx, -0.06, 0.29], rot: [Math.PI, 0, 0] }); // upper fangs
        parts.push({ geo: fang, pos: [0.03 * sx, -0.075, 0.26], rot: [0.15, 0, 0], scale: [0.8, 0.7, 0.8] }); // lower ones
    }
    for (let i = 0; i < 4; i++) parts.push({ geo: fang, pos: [-0.025 + i * 0.017, -0.055, 0.3], rot: [Math.PI, 0, 0], scale: [0.6, 0.45, 0.6] }); // small teeth
    const head = mergeParts(parts);
    const mouth = mergeParts([
        { geo: new THREE.SphereGeometry(0.06, 12, 8), pos: [0, -0.055, 0.23], scale: [1, 0.35, 1.1] },
        { geo: new THREE.SphereGeometry(0.014, 6, 4), pos: [0.025, 0.0, 0.33] }, { geo: new THREE.SphereGeometry(0.014, 6, 4), pos: [-0.025, 0.0, 0.33] }, // nostrils
    ]);
    const eyes = mergeParts([{ geo: new THREE.SphereGeometry(0.022, 8, 6), pos: [0.07, 0.045, 0.2] }, { geo: new THREE.SphereGeometry(0.022, 8, 6), pos: [-0.07, 0.045, 0.2] }]);
    for (const geo of [head, mouth, eyes]) geo.userData.shared = true;
    _S = { head, mouth, eyes, stone, dark, glow };
    return _S;
}

/** The head as a thing (centre of the skull at the origin, the face along +z). */
export function gargoyleHeadModel() {
    const S = shared(), g = new THREE.Group();
    g.add(new THREE.Mesh(S.head, S.stone), new THREE.Mesh(S.mouth, S.dark), new THREE.Mesh(S.eyes, S.glow));
    for (const c of g.children) { c.castShadow = true; c.userData.shared = true; }
    g.position.y = 0;
    return g;
}
