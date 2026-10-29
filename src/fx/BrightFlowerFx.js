/**
 * BrightFlowerFx.js — draws every Brightflower («Ярколето») near the player with four instanced draws, whatever their number:
 *   stems (+ leaves, calyx)   the petals (they open and close in the vertex shader)   the flame in the cup   the glowing heart.
 * The processor writes one small matrix per flower and per shape and one `open` / `flame` number; the video card turns every petal
 * about its own hinge, makes the stem sway and the flame dance (one shared clock) — a meadow of them costs ~4 draws.
 * No lights here: the flame asks FireLights for a glow (BrightFlower.js).
 */
import * as THREE from 'three';
import { BF, stemGeometry, petalGeometry, flameGeometry, coreGeometry, petalTexture } from './BrightFlowerModel.js';

export const BRIGHT_CLOCK = { t: { value: 0 }, glow: { value: 1 } };

const ROT = `vec3 bfRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
vec2 bfSway(float sw, float ph, float amp) { return vec2(sin(uBT * 1.3 + ph) * 3.0 * amp + 0.3 * amp * sin(uBT * 3.1 + ph * 2.0), cos(uBT * 1.1 + ph * 1.3) * 3.0 * amp) * sw; }`;

/** The vertex/fragment changes of each kind of shape, as a material patch. */
function patch(mat, kind) {
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uBT = BRIGHT_CLOCK.t;
        sh.uniforms.uBGlow = BRIGHT_CLOCK.glow;
        let v = 'uniform float uBT;\nattribute float aPh;\n' + ROT + '\n';
        if (kind === 'petal') {
            v += 'attribute vec3 aHinge; attribute vec3 aAxis; attribute float aClose; attribute float aOpen;\n';
            sh.vertexShader = v + sh.vertexShader
                .replace('#include <beginnormal_vertex>', `float bfAng = aClose > 0.001 ? (1.0 - aOpen) * aClose + 0.035 * aOpen * sin(uBT * 1.6 + aPh + aHinge.x * 7.0 + aHinge.z * 5.0) : 0.0;
                    vec3 objectNormal = bfRot(normal, aAxis, bfAng);`)
                .replace('#include <begin_vertex>', `vec3 transformed = aHinge + bfRot(position - aHinge, aAxis, bfAng);
                    transformed.xz += bfSway(1.0, aPh, 0.04);`);
            sh.fragmentShader = 'uniform float uBGlow;\n' + sh.fragmentShader
                .replace('#include <map_fragment>', '#include <map_fragment>\n float bfVein = texelColor.a; diffuseColor.a = 1.0;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.5, 0.1) * bfVein * uBGlow;');
        } else if (kind === 'stem') {
            sh.vertexShader = v + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                transformed.xz += bfSway(pow(clamp(position.y / ${BF.STEM_H.toFixed(2)}, 0.0, 1.0), 1.7), aPh, 0.04);`);
        } else if (kind === 'flame') {
            v += 'attribute float aFlame;\n';
            sh.vertexShader = v + sh.vertexShader
                .replace('#include <color_vertex>', `#include <color_vertex>
                    vColor *= 0.82 + 0.18 * sin(uBT * 19.0 + aPh * 3.0 + position.y * 6.0);`)
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                    float fh = clamp(position.y / 1.4, 0.0, 1.0);
                    transformed.xz *= clamp(aFlame * 4.0, 0.0, 1.0);
                    transformed.y *= aFlame;
                    transformed.x += sin(uBT * 7.0 + position.y * 5.0 + aPh) * 0.07 * fh * fh * (0.4 + aFlame * 0.6) + sin(uBT * 13.0 + aPh * 2.0) * 0.02 * fh;
                    transformed.z += cos(uBT * 6.0 + position.y * 4.0 + aPh * 1.3) * 0.07 * fh * fh;
                    transformed.xz += bfSway(1.0, aPh, 0.04);`);
        } else { // core
            sh.vertexShader = v + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.xz += bfSway(1.0, aPh, 0.04);');
        }
    };
    mat.customProgramCacheKey = () => 'bright-' + kind;
    return mat;
}

let _mats = null;
export function brightMaterials() {
    if (_mats) return _mats;
    _mats = {
        stem: patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'stem'),
        petal: patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: petalTexture(), emissive: 0x401002, emissiveIntensity: 0.55 }), 'petal'),
        flame: patch(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: true }), 'flame'),
        core: patch(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'core'),
    };
    return _mats;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _c = new THREE.Color(), _qy = new THREE.Quaternion();

/** A shape with extra per-flower numbers (instanced attributes `aPh`, and `aOpen` / `aFlame`). */
function instanced(base, mat, extra) {
    const geo = base.clone();
    const attrs = {};
    for (const k of ['aPh', ...extra]) { attrs[k] = new THREE.InstancedBufferAttribute(new Float32Array(BF.CAP), 1); attrs[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, attrs[k]); }
    const mesh = new THREE.InstancedMesh(geo, mat, BF.CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.attrs = attrs;
    return mesh;
}

export class BrightFlowerFx {
    constructor(scene) {
        const M = brightMaterials();
        this.stem = instanced(stemGeometry(), M.stem, []);
        this.stem.castShadow = true;
        this.petal = instanced(petalGeometry(), M.petal, ['aOpen']);
        this.flame = instanced(flameGeometry(), M.flame, ['aFlame']);
        this.flame.renderOrder = 3;
        this.core = instanced(coreGeometry(), M.core, []);
        this.core.setColorAt(0, _c.set(1, 1, 1));
        this.root = new THREE.Group();
        this.root.name = 'brightFlowers';
        this.root.add(this.stem, this.petal, this.flame, this.core);
        scene?.add(this.root);
        this.n = 0;
    }

    /**
     * Draw these flowers this frame. Each: {x, y, z (foot), yaw, s (size), open 0…1, flame 0…1.6, dx, dy, dz (where the cup looks:
     * a unit vector; up when calm), ph (phase), heat 0…1 (the heart's brightness)}.
     */
    draw(list, t, night = 0) {
        BRIGHT_CLOCK.t.value = t;
        BRIGHT_CLOCK.glow.value = 0.9 + 0.55 * night + 0.12 * Math.sin(t * 2.3);
        const n = Math.min(BF.CAP, list.length), A = this.petal.userData.attrs, F = this.flame.userData.attrs, S = this.stem.userData.attrs, C = this.core.userData.attrs;
        for (let i = 0; i < n; i++) {
            const f = list[i];
            _qy.setFromAxisAngle(_up, f.yaw);
            // the stem: foot, yaw, size
            _m.compose(_p.set(f.x, f.y, f.z), _qy, _s.set(f.s, f.s, f.s));
            this.stem.setMatrixAt(i, _m);
            S.aPh.array[i] = f.ph;
            // the head: at the neck, looking along (dx, dy, dz)
            _d.set(f.dx, f.dy, f.dz);
            _q.setFromUnitVectors(_up, _d).multiply(_qy);
            _p.set(f.x, f.y + BF.STEM_H * f.s, f.z);
            _m.compose(_p, _q, _s.set(f.s, f.s, f.s));
            this.petal.setMatrixAt(i, _m); this.core.setMatrixAt(i, _m);
            A.aPh.array[i] = f.ph; A.aOpen.array[i] = f.open; C.aPh.array[i] = f.ph;
            _m.compose(_p, _q, _s.set(f.s, f.s, f.s)); // (the flame's height comes from `aFlame`)
            this.flame.setMatrixAt(i, _m);
            F.aPh.array[i] = f.ph; F.aFlame.array[i] = f.flame;
            const k = 0.35 + 0.65 * f.heat;
            this.core.setColorAt(i, _c.setRGB(k, k, k));
        }
        for (const m of [this.stem, this.petal, this.flame, this.core]) {
            m.count = n; m.instanceMatrix.needsUpdate = true;
            for (const a of Object.values(m.userData.attrs)) a.needsUpdate = true;
        }
        if (this.core.instanceColor) this.core.instanceColor.needsUpdate = true;
        this.n = n;
        this.root.visible = n > 0;
    }

    /** One of each shape (for the shader warm-up: Game.prewarm). */
    sampleModel() {
        const g = new THREE.Group(), M = brightMaterials();
        for (const [geo, mat] of [[stemGeometry(), M.stem], [petalGeometry(), M.petal], [flameGeometry(), M.flame], [coreGeometry(), M.core]]) {
            const gg = geo.clone();
            const names = mat === M.petal ? ['aPh', 'aOpen'] : mat === M.flame ? ['aPh', 'aFlame'] : ['aPh'];
            for (const k of names) gg.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
            const m = new THREE.InstancedMesh(gg, mat, 1);
            m.setMatrixAt(0, _m.identity());
            if (mat === M.core) m.setColorAt(0, _c.set(1, 1, 1));
            m.frustumCulled = false;
            g.add(m);
        }
        return g;
    }

    dispose() {
        this.root.parent?.remove(this.root);
        for (const m of [this.stem, this.petal, this.flame, this.core]) { m.geometry.dispose(); m.dispose?.(); }
    }
}
