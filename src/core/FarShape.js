/**
 * FarShape — a model of many moving parts drawn far away as ONE shape per material (its parts, posed as they are now,
 * put into a shared buffer), like a far person (VillagerModel.setFar). An animal is ~22 parts (legs in joints, head,
 * ears, tail…) — 22 draws; a herd far off took more of the frame's drawing than the land under it. Near it is drawn
 * as it is; far away the copy is remade only when its pose is renewed (rarely, by the caller) — nobody sees the
 * difference at that distance. The copy casts no shadow (far: no shadow anyway — Shadows.js).
 *
 *   const far = new FarShape(model);
 *   far.set(true);   // far: the parts hidden, the copy shown, posed as now
 *   far.refresh();   // after the pose changed
 *   far.set(false);  // near again: the parts as they were
 * Parts with `userData.farOne` (the copy itself) or `userData.noFar` are left out; a part the game shows or hides while
 * far is taken in / left out at the next refresh.
 */
import * as THREE from 'three';

const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

export class FarShape {
    /** @param {THREE.Object3D} root the model (its group: the copy is its child) */
    constructor(root) {
        this.root = root;
        this.on = false;
        this.parts = []; // the meshes hidden for the copy
        this.buckets = []; // [{mat, parts, mesh}]
        this._sig = '';
    }

    /** The parts drawn now (shown, with their ancestors up to the root). */
    _shown(out) {
        out.length = 0;
        const R = this.root;
        R.traverse((o) => {
            if (!o.isMesh || o.userData.farOne || o.userData.noFar || o.isInstancedMesh || o.isSkinnedMesh) return;
            for (let q = o; q && q !== R; q = q.parent) if (!q.visible && !(q === o && this.parts.includes(o))) return;
            if (!o.geometry?.attributes?.position || !o.geometry.attributes.normal || Array.isArray(o.material)) return;
            out.push(o);
        });
        return out;
    }

    set(on) {
        if (on === this.on) return;
        if (!on) {
            this.on = false;
            this._n = 0; // (next time: the parts looked at anew)
            for (const p of this.parts) p.visible = true;
            this.parts.length = 0;
            for (const b of this.buckets) b.mesh.visible = false;
            return;
        }
        this.on = true;
        this.refresh();
    }

    /** The copy made again from the parts as they are posed now. */
    refresh() {
        if (!this.on) return;
        // (which parts are shown: looked at again now and then — the pose is renewed far more often than a part comes or goes)
        this._n = (this._n || 0) + 1;
        if (this._n % 8 === 1) {
            const list = this._shown(this._list || (this._list = []));
            // (a part whose joint the game hid while far: out of the copy, its own flag given back — the joint keeps it hidden)
            for (const p of this.parts) if (!list.includes(p)) p.visible = true;
            this.parts.length = 0;
            for (const p of list) { this.parts.push(p); p.visible = false; }
            // which parts in which bucket (by material) — remade only when that changed
            let sig = '';
            for (const p of list) sig += p.geometry.id + ':' + p.material.id + ',';
            if (sig !== this._sig) { this._sig = sig; this._build(list); }
        }
        this.root.updateMatrixWorld(true);
        _inv.copy(this.root.matrixWorld).invert();
        for (const b of this.buckets) {
            const P = b.mesh.geometry.attributes.position, N = b.mesh.geometry.attributes.normal, pa = P.array, na = N.array;
            let vo = 0;
            for (const m of b.parts) {
                const e = _m.multiplyMatrices(_inv, m.matrixWorld).elements;
                const G = m.geometry, sp = G.attributes.position.array, sn = G.attributes.normal.array, n = G.attributes.position.count;
                for (let i = 0; i < n; i++) {
                    const k = i * 3, o = (vo + i) * 3, x = sp[k], y = sp[k + 1], z = sp[k + 2], a = sn[k], bb = sn[k + 1], c = sn[k + 2];
                    pa[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
                    pa[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
                    pa[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
                    // (scaled parts: the normal is made unit length again)
                    let nx = e[0] * a + e[4] * bb + e[8] * c, ny = e[1] * a + e[5] * bb + e[9] * c, nz = e[2] * a + e[6] * bb + e[10] * c;
                    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                    na[o] = nx / l; na[o + 1] = ny / l; na[o + 2] = nz / l;
                }
                vo += n;
            }
            P.needsUpdate = true;
            N.needsUpdate = true;
            b.mesh.visible = true;
        }
    }

    _build(list) {
        const by = new Map();
        for (const p of list) { let a = by.get(p.material); if (!a) by.set(p.material, (a = [])); a.push(p); }
        const old = this.buckets;
        this.buckets = [];
        for (const [mat, parts] of by) {
            let nv = 0, ni = 0;
            for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
            const colors = !!mat.vertexColors; // (a part without colours: white — the material's own colour)
            const uvs = !!mat.map && parts.every((m) => m.geometry.attributes.uv);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
            geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
            const col = colors ? new Float32Array(nv * 3) : null, uv = uvs ? new Float32Array(nv * 2) : null;
            const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
            let vo = 0, io = 0;
            for (const m of parts) {
                const G = m.geometry, n = G.attributes.position.count;
                if (col) { const c = G.attributes.color; if (!c) col.fill(1, vo * 3, (vo + n) * 3); else if (c.itemSize === 3) col.set(c.array.subarray(0, n * 3), vo * 3); else for (let i = 0; i < n; i++) { col[(vo + i) * 3] = c.getX(i); col[(vo + i) * 3 + 1] = c.getY(i); col[(vo + i) * 3 + 2] = c.getZ(i); } }
                if (uv) uv.set(G.attributes.uv.array.subarray(0, n * 2), vo * 2);
                if (G.index) { const I = G.index.array; for (let i = 0; i < G.index.count; i++) idx[io++] = I[i] + vo; } else for (let i = 0; i < n; i++) idx[io++] = vo + i;
                vo += n;
            }
            if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
            if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
            // (whatever the pose: the model's own size round its centre)
            const r = (this.root.userData.farRadius || 4) / Math.max(1e-3, this.root.scale.x);
            geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, r * 0.4, 0), r);
            const reuse = old.find((b) => b.mesh.material === mat && !b.taken);
            let mesh;
            if (reuse) { reuse.taken = true; mesh = reuse.mesh; mesh.geometry.dispose(); mesh.geometry = geo; } else {
                mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.raycast = () => {}; // (the parts are what is hit)
                mesh.userData.farOne = true;
                mesh.userData.noHurtFlash = true;
                this.root.add(mesh);
            }
            this.buckets.push({ mat, parts, mesh });
        }
        for (const b of old) if (!b.taken) { this.root.remove(b.mesh); b.mesh.geometry.dispose(); }
        for (const b of old) delete b.taken;
    }

    /** The copy taken away for good (the model removed). */
    dispose() {
        this.set(false);
        for (const b of this.buckets) { this.root.remove(b.mesh); b.mesh.geometry.dispose(); }
        this.buckets.length = 0;
        this._sig = '';
    }
}
