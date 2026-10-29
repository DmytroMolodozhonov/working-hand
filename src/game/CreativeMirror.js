/**
 * CreativeMirror.js — a tall mirror by Творческий's start: to see oneself — the whole body, every pose of the arms
 * and fingers, every face the camera reads (the «Реалистичный» hero most of all; the standard one too).
 *
 * The stand: a stone plinth with a moulded edge (6 × 1.6 m, 0.8 high), on it an antique gilded frame 5 × 8 m
 * (the world's metres: the hero, 4.7 m, is seen whole with room over his head): mouldings in steps, a bead row round
 * the glass, rosettes at the corners, a crest with a shell on top, scrolled brackets at the feet, a dark wooden back.
 * The frame and the plinth are one shape per material (merged); the stand is solid (a box in the world's collision)
 * and a gift of the gods (`godGift`: no spell breaks or moves it).
 *
 * The glass: a real reflection — the scene once more from the mirrored eye (the camera reflected in the glass's
 * plane, the near plane on the glass — Reflector's oblique clip) into a picture half the screen's size, ~30 times a
 * second, only while the mirror is on the screen, in front of the eye and nearer than REACH; the picture is made when
 * one comes near and freed when one goes away. That pass skips the grass and the glass itself, keeps the old sun's
 * shadow, sees one's own head (camera layer 1: hidden only from one's own first-person eyes).
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const MIRROR = {
    AT: { x: -17, z: 2 }, // (west of the start, its glass facing it: +x)
    W: 5, H: 8, PLINTH_H: 0.8, // (the frame's outside; the plinth under it)
    REACH: 25, // m: farther — no reflection drawn (the glass shows its last picture dimmed)
    HZ: 30, // reflections a second
    SCALE: 0.5, // of the screen's size
};

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _l = new THREE.Vector3();
const _r = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), _sz = new THREE.Vector2();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sphere = new THREE.Sphere();

let _mats = null;
function materials() {
    if (_mats) return _mats;
    const gold = new THREE.MeshPhongMaterial({ color: 0xc9a24a, specular: 0x8a6a2a, shininess: 46, emissive: 0x1a1206 });
    gold.onBeforeCompile = (sh) => {
        // (old gilding: darker in the hollows of the carving, worn lighter on the edges, a little green-brown in the cracks)
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vP;
float gh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y), mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float g1 = gn(vP * 14.0), g2 = gn(vP * 55.0);
diffuseColor.rgb *= 0.78 + 0.3 * g1 + 0.08 * g2;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.14), smoothstep(0.72, 0.9, gn(vP * 6.0 + 3.0)) * 0.35);`);
    };
    gold.customProgramCacheKey = () => 'mirror-gold-1';
    const wood = new THREE.MeshLambertMaterial({ color: 0x3a2415 });
    const stone = new THREE.MeshPhongMaterial({ color: 0xa8a294, specular: 0x111111, shininess: 6 });
    stone.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vP;
float sh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh3(i), sh3(i + vec3(1,0,0)), f.x), mix(sh3(i + vec3(0,1,0)), sh3(i + vec3(1,1,0)), f.x), f.y), mix(mix(sh3(i + vec3(0,0,1)), sh3(i + vec3(1,0,1)), f.x), mix(sh3(i + vec3(0,1,1)), sh3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float m1 = sn(vP * 3.0), m2 = sn(vP * 17.0), vein = 1.0 - smoothstep(0.0, 0.04, abs(sn(vP * vec3(2.0, 5.0, 2.0)) - 0.5));
diffuseColor.rgb *= 0.82 + 0.16 * m1 + 0.08 * m2 - 0.1 * vein;`);
    };
    stone.customProgramCacheKey = () => 'mirror-stone-1';
    const glass = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tMirror: { value: null }, uMat: { value: new THREE.Matrix4() }, uOn: { value: 0 }, uFade: { value: 1 } }]),
        vertexShader: /* glsl */`
            uniform mat4 uMat;
            varying vec4 vUv;
            varying vec2 vLoc;
            #include <fog_pars_vertex>
            void main() {
                vUv = uMat * vec4(position, 1.0);
                vLoc = uv;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: /* glsl */`
            uniform sampler2D tMirror;
            uniform float uOn, uFade;
            varying vec4 vUv;
            varying vec2 vLoc;
            #include <fog_pars_fragment>
            float mh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float mn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
            void main() {
                vec3 c = vec3(0.32, 0.36, 0.4);
                if (uOn > 0.5) c = texture2DProj(tMirror, vUv).rgb;
                // old silvering: a faint cool tint, a few dim spots and a darker rim near the frame
                vec2 e = min(vLoc, 1.0 - vLoc);
                float rim = smoothstep(0.0, 0.06, min(e.x, e.y * 0.6));
                float spots = smoothstep(0.86, 0.97, mn(vLoc * vec2(14.0, 22.0))) * (1.0 - rim);
                c *= vec3(0.95, 0.975, 1.0) * mix(0.86, 1.0, rim) * (1.0 - spots * 0.12) * uFade;
                gl_FragColor = vec4(c, 1.0);
                #include <fog_fragment>
            }`,
        fog: true,
    });
    glass.name = 'mirror-glass';
    _mats = { gold, wood, stone, glass };
    for (const m of Object.values(_mats)) m.userData.shared = true;
    return _mats;
}

// ------------------------------------------------------------------ the model
/** A moulding: a profile [[out, depth], …] swept round a rectangle (w × h, centred), as boxes per side. */
function moulding(parts, mat, w, h, steps) {
    for (const [inset, t, d, z] of steps) {
        const ww = w - 2 * inset, hh = h - 2 * inset;
        for (const [sx, sy, bw, bh] of [[0, hh / 2 - t / 2, ww, t], [0, -hh / 2 + t / 2, ww, t], [ww / 2 - t / 2, 0, t, hh - 2 * t], [-ww / 2 + t / 2, 0, t, hh - 2 * t]]) {
            const g = new THREE.BoxGeometry(bw, bh, d);
            g.translate(sx, sy, z);
            parts.push({ geo: g, mat });
        }
    }
}

/** The mirror on its stand: a group (its glass faces its +z), its glass mesh, its world box. */
export function mirrorModel() {
    const M = materials(), parts = [];
    const W = MIRROR.W, Hh = MIRROR.H, P = MIRROR.PLINTH_H;
    const g = new THREE.Group();
    // ---- the plinth: a base, a body, a moulded top
    const add = (geo, mat, x, y, z) => { geo.translate(x, y, z); parts.push({ geo, mat }); };
    add(new THREE.BoxGeometry(6.2, 0.22, 1.8), M.stone, 0, 0.11, 0);
    add(new THREE.BoxGeometry(5.8, 0.42, 1.5), M.stone, 0, 0.43, 0);
    add(new THREE.BoxGeometry(6.0, 0.08, 1.65), M.stone, 0, 0.68, 0);
    add(new THREE.BoxGeometry(6.1, 0.06, 1.72), M.stone, 0, 0.77, 0);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.12, 0.14, 0.42, 14), M.stone, sx * 2.75, 0.43, 0.72);
    // ---- the frame: stepped mouldings, the back board
    const cy = P + Hh / 2;
    const frame = [];
    moulding(frame, M.gold, W, Hh, [[0, 0.16, 0.34, 0], [0.12, 0.14, 0.42, 0.03], [0.24, 0.1, 0.36, 0.06], [0.33, 0.05, 0.3, 0.1]]);
    for (const f of frame) { f.geo.translate(0, cy, 0); parts.push(f); }
    add(new THREE.BoxGeometry(W - 0.3, Hh - 0.3, 0.06), M.wood, 0, cy, -0.12);
    // the bead row round the glass
    const gw = W - 0.76, gh = Hh - 0.76;
    const bead = (x, y) => add(new THREE.SphereGeometry(0.035, 8, 6), M.gold, x, y, 0.18);
    for (let i = 0; i <= 40; i++) { const t = i / 40 - 0.5; bead(t * gw, cy + gh / 2); bead(t * gw, cy - gh / 2); }
    for (let i = 1; i < 64; i++) { const t = i / 64 - 0.5; bead(gw / 2, cy + t * gh); bead(-gw / 2, cy + t * gh); }
    // rosettes at the corners: petals round a boss
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = sx * (W / 2 - 0.16), y = cy + sy * (Hh / 2 - 0.16);
        add(new THREE.SphereGeometry(0.11, 14, 10), M.gold, x, y, 0.2);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, pg = new THREE.SphereGeometry(0.07, 10, 8); pg.scale(1.6, 0.8, 0.6); pg.rotateZ(a); add(pg, M.gold, x + Math.cos(a) * 0.13, y + Math.sin(a) * 0.13, 0.17); }
    }
    // the crest: an arched pediment with a shell and two scrolls
    const crestY = P + Hh;
    const arch = new THREE.TorusGeometry(1.25, 0.09, 10, 40, Math.PI);
    add(arch, M.gold, 0, crestY - 0.55, 0.05);
    add(new THREE.BoxGeometry(2.8, 0.18, 0.3), M.gold, 0, crestY - 0.02, 0.05);
    for (let k = 0; k < 11; k++) { const a = Math.PI * (0.08 + 0.84 * k / 10), rib = new THREE.CylinderGeometry(0.025, 0.05, 0.62, 8); rib.translate(0, 0.31, 0); rib.rotateZ(a - Math.PI / 2); add(rib, M.gold, 0, crestY + 0.05, 0.12); }
    add(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, 0, crestY + 0.05, 0.12);
    for (const sx of [-1, 1]) { const sc = new THREE.TorusGeometry(0.22, 0.06, 8, 24, Math.PI * 1.5); sc.rotateZ(sx > 0 ? 0 : Math.PI / 2); add(sc, M.gold, sx * 1.4, crestY + 0.12, 0.06); }
    add(new THREE.SphereGeometry(0.1, 12, 10), M.gold, 0, crestY + 0.72, 0.1); // (the finial)
    // the feet: scrolled brackets holding the frame on the plinth
    for (const sx of [-1, 1]) {
        const sc = new THREE.TorusGeometry(0.28, 0.08, 8, 24, Math.PI);
        sc.rotateY(Math.PI / 2);
        add(sc, M.gold, sx * (W / 2 - 0.35), P + 0.28, 0.25);
        add(new THREE.BoxGeometry(0.3, 0.5, 0.5), M.gold, sx * (W / 2 - 0.35), P + 0.25, 0.0);
    }
    // (one shape per material: three draws for the whole stand)
    const byMat = new Map();
    for (const q of parts) { if (!byMat.has(q.mat)) byMat.set(q.mat, []); byMat.get(q.mat).push({ geo: q.geo }); }
    for (const [mat, list] of byMat) {
        const m = new THREE.Mesh(mergeParts(list), mat);
        for (const q of list) q.geo.dispose();
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
    }
    // ---- the glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), M.glass);
    glass.position.set(0, cy, 0.16);
    glass.name = 'mirror-glass';
    g.add(glass);
    g.userData.godGift = true; // (a gift of the gods: no spell breaks or moves it)
    g.name = 'creative-mirror';
    return { group: g, glass };
}

/** For Game.prewarm: the frame's and the glass's programs. */
export function mirrorSamples() {
    const M = materials(), out = [];
    for (const m of [M.gold, M.wood, M.stone, M.glass]) out.push(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m));
    return out;
}

// ------------------------------------------------------------------ in the game
export class CreativeMirror {
    constructor(game, at = MIRROR.AT) {
        this.game = game;
        const { group, glass } = mirrorModel();
        this.group = group; this.glass = glass;
        const y = game.collision?.groundY ? game.collision.groundY(at.x, at.z) + 0.5 : 0;
        group.position.set(at.x, y, at.z);
        group.rotation.y = Math.PI / 2; // (its glass to +x: towards the start)
        game.scene.add(group);
        group.updateMatrixWorld(true);
        // solid: the plinth and the frame (rotated: its width along z)
        this.boxId = game.collision?.addBox?.({ minX: at.x - 0.9, maxX: at.x + 0.9, minY: y, maxY: y + MIRROR.PLINTH_H + MIRROR.H + 0.8, minZ: at.z - 3.1, maxZ: at.z + 3.1, kind: 'mirror', godGift: true });
        this.cam = new THREE.PerspectiveCamera();
        this.cam.layers.enable(1); // (one's own head: in the mirror it is there)
        this.rt = null;
        this._at = -1;
        this.stats = { passes: 0, rtMade: 0, rtFreed: 0 };
    }

    /** Before the main picture: the reflection, when it is due and the mirror is seen. */
    render(now = performance.now() / 1000) {
        const g = this.game, r = g.renderer, cam = g.camera;
        if (!r || !cam) return;
        const u = this.glass.material.uniforms;
        this.glass.getWorldPosition(_p);
        cam.getWorldPosition(_c);
        _r.extractRotation(this.glass.matrixWorld);
        _n.set(0, 0, 1).applyMatrix4(_r);
        const dist = _c.distanceTo(_p);
        const front = _t.subVectors(_c, _p).dot(_n) > 0.05;
        // seen? (in the camera's frustum, near, from the front)
        _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_pm);
        _sphere.center.copy(_p); _sphere.radius = 4.6;
        const seen = front && dist < MIRROR.REACH && _frustum.intersectsSphere(_sphere);
        if (!seen) {
            if (this.rt && dist > MIRROR.REACH + 8) { this.rt.dispose(); this.rt = null; this.stats.rtFreed++; u.uOn.value = 0; u.tMirror.value = null; }
            return;
        }
        if (this.rt && now - this._at < 1 / MIRROR.HZ) return;
        this._at = now;
        r.getDrawingBufferSize(_sz);
        const w = Math.max(64, Math.round(_sz.x * MIRROR.SCALE)), h = Math.max(64, Math.round(_sz.y * MIRROR.SCALE));
        if (!this.rt) { this.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }); this.rt.texture.generateMipmaps = false; this.stats.rtMade++; }
        else if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
        // the eye mirrored in the glass's plane (Reflector)
        const vc = this.cam;
        _t.subVectors(_p, _c).reflect(_n).negate().add(_p);
        _r.extractRotation(cam.matrixWorld);
        _l.set(0, 0, -1).applyMatrix4(_r).add(_c);
        const target = _l.subVectors(_p, _l).reflect(_n).negate().add(_p);
        vc.position.copy(_t);
        vc.up.set(0, 1, 0).applyMatrix4(_r).reflect(_n);
        vc.lookAt(target);
        vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = 0.1; vc.far = Math.min(cam.far, 160);
        vc.updateProjectionMatrix();
        vc.updateMatrixWorld(true);
        u.uMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(this.glass.matrixWorld);
        // the near plane on the glass (an oblique clip: nothing behind the mirror comes into it)
        _plane.setFromNormalAndCoplanarPoint(_n, _p).applyMatrix4(vc.matrixWorldInverse);
        _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
        const pm = vc.projectionMatrix.elements;
        _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
        _clip.multiplyScalar(2 / _clip.dot(_q));
        pm[2] = _clip.x; pm[6] = _clip.y; pm[10] = _clip.z + 1 - 0.003; pm[14] = _clip.w;
        // the pass: no grass, no glass, the old shadow
        const grass = g.world?.grass, ultra = g.ultra?.grass?.group;
        const gv = grass?.visible, uv = ultra?.visible;
        if (grass) grass.visible = false;
        if (ultra) ultra.visible = false;
        this.glass.visible = false;
        const prevT = r.getRenderTarget(), auto = r.autoClear, sa = r.shadowMap.autoUpdate, sn = r.shadowMap.needsUpdate;
        r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
        r.setRenderTarget(this.rt);
        r.autoClear = true;
        try { r.render(g.scene, vc); } finally {
            r.setRenderTarget(prevT);
            r.autoClear = auto;
            r.shadowMap.autoUpdate = sa; r.shadowMap.needsUpdate = sn;
            this.glass.visible = true;
            if (grass) grass.visible = gv;
            if (ultra) ultra.visible = uv;
        }
        u.tMirror.value = this.rt.texture;
        u.uOn.value = 1;
        this.stats.passes++;
    }

    dispose() {
        this.group.parent?.remove(this.group);
        if (this.boxId != null) this.game.collision?.removeBox?.(this.boxId);
        this.rt?.dispose();
        this.rt = null;
    }
}
