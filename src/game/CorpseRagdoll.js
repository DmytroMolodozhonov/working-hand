/** Dead humanoids keep a numerical doll after settling, while carried, and after release. */
import * as THREE from 'three';
import { Ragdoll, makeSpec, P } from './Ragdoll.js';
import { fromModel, toModel, fromRig, toRig } from './RagdollPose.js';
import { guardWorld } from './SolidGuard.js';

const _head = new THREE.Vector3();
const _pt = new Float64Array(3), _pin = new Float64Array(6);
const PLAYER_SPEC = makeSpec({ rest: [
    [0, 4.05, 0], [-0.7, 3.2, 0], [0.7, 3.2, 0], [-0.3, 1.95, 0], [0.3, 1.95, 0],
    [-0.7, 1.3, 0], [0.7, 1.3, 0], [-0.3, 0.95, 0], [-0.3, 0.22, 0], [0.3, 0.95, 0], [0.3, 0.22, 0],
], r: [0.68, 0.32, 0.32, 0.35, 0.35, 0.25, 0.25, 0.3, 0.25, 0.3, 0.25] });

/** Clone map resolves real joints, including unnamed groups; never infer joints from child indices. */
export function playerCorpseRig(ch, clones) {
    const c = {};
    for (const key of ['group', 'torso', 'head', 'leftArmAnchor', 'rightArmAnchor', 'leftElbowAnchor', 'rightElbowAnchor', 'leftLegPivot', 'rightLegPivot']) c[key] = clones ? clones.get(ch[key]) : ch[key];
    const neck = new THREE.Group(); neck.position.set(0, 0.75, 0); c.torso.add(neck);
    c.head.position.y -= 0.75; neck.add(c.head);
    const own = [];
    const knees = [splitLeg(c.leftLegPivot, own), splitLeg(c.rightLegPivot, own)];
    const points = [
        [P.HEAD, c.head, 0, 0, 0], [P.SHL, c.leftArmAnchor, 0, 0, 0], [P.SHR, c.rightArmAnchor, 0, 0, 0],
        [P.HIPL, c.leftLegPivot, 0, 0, 0], [P.HIPR, c.rightLegPivot, 0, 0, 0],
        [P.HNL, c.leftElbowAnchor, 0, 0, 0.9], [P.HNR, c.rightElbowAnchor, 0, 0, 0.9],
        [P.KNL, knees[0], 0, 0, 0], [P.FTL, knees[0], 0, -0.73, 0],
        [P.KNR, knees[1], 0, 0, 0], [P.FTR, knees[1], 0, -0.73, 0],
    ];
    const limbs = [
        { obj: c.leftArmAnchor, from: P.SHL, to: P.HNL, rest: [0, 0, 1] },
        { obj: c.rightArmAnchor, from: P.SHR, to: P.HNR, rest: [0, 0, 1] },
        { obj: c.leftLegPivot, from: P.HIPL, to: P.KNL, rest: [0, -1, 0] },
        { obj: knees[0], from: P.KNL, to: P.FTL, rest: [0, -1, 0] },
        { obj: c.rightLegPivot, from: P.HIPR, to: P.KNR, rest: [0, -1, 0] },
        { obj: knees[1], from: P.KNR, to: P.FTR, rest: [0, -1, 0] },
    ];
    // NPC dolls have one arm segment too: straighten the forearms so their mesh follows that segment.
    c.leftElbowAnchor.quaternion.identity(); c.rightElbowAnchor.quaternion.identity();
    const rig = { spec: PLAYER_SPEC, root: () => c.group, hipLocal: [0, 0, 0],
        stiff: () => [c.torso, c.leftElbowAnchor, c.rightElbowAnchor],
        head: () => ({ obj: neck, rest: [0, 1, 0] }), headCenter: c.head, limbs: () => limbs, points: () => points };
    return { rig, own };
}

/** Cut a copied leg's visible surfaces at its knee, preserving UVs, colours, clothing and armour. Once per corpse. */
function splitLeg(leg, own) {
    const knee = new THREE.Group(); knee.position.y = -1;
    leg.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(leg.matrixWorld).invert(), matrix = new THREE.Matrix4();
    const meshes = []; leg.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
        matrix.multiplyMatrices(inv, mesh.matrixWorld);
        const geo = mesh.geometry.clone().applyMatrix4(matrix);
        for (const lower of [false, true]) {
            const clipped = clip(geo, lower);
            if (!clipped) continue;
            if (lower) clipped.translate(0, 1, 0);
            own.push(clipped);
            const part = new THREE.Mesh(clipped, mesh.material);
            part.visible = mesh.visible; part.castShadow = mesh.castShadow; part.receiveShadow = mesh.receiveShadow;
            (lower ? knee : leg).add(part);
        }
        geo.dispose(); mesh.parent.remove(mesh);
    }
    leg.add(knee);
    return knee;
}

function clip(geo, lower) {
    const names = Object.keys(geo.attributes), sizes = names.map(n => geo.attributes[n].itemSize);
    const pos = geo.attributes.position, index = geo.index, count = index ? index.count : pos.count;
    const arrays = names.map(() => []), groups = [];
    let start = 0, material = -1;
    for (let t = 0; t < count; t += 3) {
        const mi = geo.groups.find(g => t >= g.start && t < g.start + g.count)?.materialIndex || 0;
        if (mi !== material) { if (material >= 0) groups.push([start, arrays[0].length / sizes[0] - start, material]); start = arrays[0].length / sizes[0]; material = mi; }
        const tri = [];
        for (let j = 0; j < 3; j++) { const i = index ? index.getX(t + j) : t + j; tri.push(names.map((n, a) => Array.from({ length: sizes[a] }, (_, k) => geo.attributes[n].array[i * sizes[a] + k]))); }
        const polygon = [], pi = names.indexOf('position');
        for (let j = 0; j < 3; j++) {
            const a = tri[j], b = tri[(j + 1) % 3], da = a[pi][1] + 1, db = b[pi][1] + 1;
            const ai = lower ? da <= 0 : da >= 0, bi = lower ? db <= 0 : db >= 0;
            if (ai) polygon.push(a);
            if (ai !== bi) { const k = da / (da - db); polygon.push(a.map((v, n) => v.map((x, q) => x + (b[n][q] - x) * k))); }
        }
        for (let j = 1; j + 1 < polygon.length; j++) for (const v of [polygon[0], polygon[j], polygon[j + 1]]) for (let a = 0; a < names.length; a++) arrays[a].push(...v[a]);
    }
    if (!arrays[0].length) return null;
    groups.push([start, arrays[0].length / sizes[0] - start, material]);
    const out = new THREE.BufferGeometry();
    names.forEach((n, i) => out.setAttribute(n, new THREE.Float32BufferAttribute(arrays[i], sizes[i])));
    for (const [s, n, m] of groups) if (n) out.addGroup(s, n, m);
    out.computeBoundingSphere();
    return out;
}

export class CorpseRagdoll {
    constructor(b, rig = null) {
        this.b = b; this.rig = rig;
        this.doll = new Ragdoll(rig?.spec);
        this.read(); this.doll.launch(0, 0, 0, 0);
    }

    read() { if (this.rig) fromRig(this.doll, this.rig, this.b); else fromModel(this.doll, this.b.model.userData.vm); }
    draw() {
        const b = this.b, d = this.doll;
        // Keep the outer pivot near the doll for culling, targeting, save coordinates and network precision.
        d.at(P.PELVIS, _pt);
        b.model.position.set(_pt[0], _pt[1], _pt[2]); b.model.quaternion.identity();
        b.x = _pt[0]; b.y = _pt[1]; b.z = _pt[2];
        if (this.rig) {
            toRig(d, this.rig, b);
            d.at(P.HEAD, _pt);
            const head = this.rig.headCenter;
            head.position.copy(head.parent.worldToLocal(_head.set(_pt[0], _pt[1], _pt[2])));
        } else toModel(d, b.model.userData.vm);
    }
    step(g, dt) { const active = !this.doll.asleep; this.doll.step(guardWorld(g), dt); if (active || !this.doll.asleep) this.draw(); return active || !this.doll.asleep; }
    hold(g, at, dt) {
        const d = this.doll, k = 1 - Math.exp(-14 * dt); d.at(P.CHEST, _pt);
        const dx = (at.x - _pt[0]) * k, dy = (at.y - _pt[1]) * k, dz = (at.z - _pt[2]) * k;
        for (let i = 0; i < 33; i += 3) for (let j = 0; j < 3; j++) { const v = j === 0 ? dx : j === 1 ? dy : dz; d.x[i + j] += v; d.o[i + j] += v; }
        for (let i = 0; i < 6; i++) _pin[i] = d.x[3 + i];
        d.asleep = false; d.age = Math.min(d.age, 1); d.step(guardWorld(g), dt);
        for (let i = 0; i < 6; i++) d.x[3 + i] = d.o[3 + i] = _pin[i];
        this.draw();
    }
    release(v) { if (v) this.doll.push(v.x, v.y, v.z); this.doll.wake(); }
    pack() {
        const b = this.b;
        return Array.from(this.doll.x, (v, i) => Math.round((v - (i % 3 === 0 ? b.x : i % 3 === 1 ? b.y : b.z)) * 1000) / 1000);
    }
    apply(points) {
        if (!Array.isArray(points) || points.length !== 33 || !points.every(v => Number.isFinite(v) && Math.abs(v) < 20)) return false;
        const b = this.b, d = this.doll;
        for (let i = 0; i < 33; i++) d.x[i] = d.o[i] = points[i] + (i % 3 === 0 ? b.x : i % 3 === 1 ? b.y : b.z);
        d.asleep = true; this.draw(); return true;
    }
}
