/**
 * TreeMaterials.js — the THREE side of the new trees (TreeBuild.js shapes, TreeLeaves.js pictures): the leaf
 * atlas texture, the bark and leaf materials, the geometries of every shape (cached: one per kind × variant ×
 * near/far, never a new one per tree).
 *
 * The leaves are lit the same from both sides (a leaf card seen from behind is not dark — light comes
 * through real leaves too), sway in the wind in the vertex shader (the crown's top most, the trunk not at
 * all; it fades out far away), and are cut out by the picture's alpha (also in the shadow).
 */
import * as THREE from 'three';
import { buildTree, ATLAS_CELLS, BARK_CELL } from './TreeBuild.js';
import { drawLeafAtlas, bleedLeafPixels, LEAF_ATLAS } from './TreeLeaves.js';
import { applySkyComp } from './VoxelShading.js';

export const TREE_WIND = { time: { value: 0 }, strength: { value: 1 } };
/** The golden apple tree's light (Animals.js pulses it: soft by day, bright by night). */
export const GOLD_GLOW = { value: 0.5 };

let _atlas = null;
/** The leaf pictures (made once: on the loading screen — Game.prewarm). */
export function leafAtlas() {
    if (_atlas) return _atlas;
    const W = LEAF_ATLAS.CELL * LEAF_ATLAS.KINDS, H = LEAF_ATLAS.CELL;
    if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return (_atlas = new THREE.DataTexture(new Uint8Array([90, 140, 60, 255]), 1, 1, THREE.RGBAFormat)); // (no canvas: a test in node)
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = cv.getContext('2d');
    drawLeafAtlas(ctx);
    const px = bleedLeafPixels(ctx.getImageData(0, 0, W, H).data, W, H);
    // (rows flipped: v = 0 at a card's bottom — the picture's bottom row)
    const data = new Uint8Array(px.length);
    for (let y = 0; y < H; y++) data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return (_atlas = tex);
}

/** The wind in the vertex shader: `sway` (0 at the foot … 1 at the top) moves a point, each tree its own way. */
const SWAY_VERT = `
{
    vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    wp0 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    #endif
    float ph = wp0.x * 0.13 + wp0.z * 0.11;
    float w = sin(uTreeWind * 1.1 + ph) + 0.4 * sin(uTreeWind * 2.3 + ph * 1.7 + wp0.y * 0.3);
    float s = sway * uTreeWindK;
    transformed.x += s * w * 0.22;
    transformed.z += s * cos(uTreeWind * 0.9 + ph * 1.3) * 0.16;
    transformed.y += s * w * 0.03;
}`;

function addSway(shader) {
    shader.uniforms.uTreeWind = TREE_WIND.time;
    shader.uniforms.uTreeWindK = TREE_WIND.strength;
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTreeWind;\nuniform float uTreeWindK;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + SWAY_VERT);
}

/**
 * The trees' one material (bark and leaves — the bark's points take the atlas's plain cell): lit per pixel like the
 * land's blocks (Phong, the same dull shine as TerrainView's), with the sun's shadows on it; the leaf cards lit alike
 * from both sides (light comes through real leaves — a card seen from behind is not black), cut out by the picture's
 * alpha, swaying. The bark gets its own relief in the shader: long plates up the stem with dark cracks between them,
 * lighter ridges (fading out far away, no flicker). glow: the golden apple tree's leaves shine with their own colour
 * (GOLD_GLOW), day and night.
 */
export function leafMaterial({ glow = false } = {}) {
    const m = new THREE.MeshPhongMaterial({ vertexColors: true, map: leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, shininess: 8, specular: 0x111111 });
    m.onBeforeCompile = (shader) => {
        addSway(shader);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vTreeP;\nvarying float vTreeBark;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeP = position;\nvTreeBark = uv.x > ' + (BARK_CELL / ATLAS_CELLS).toFixed(4) + ' ? 1.0 : 0.0;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vTreeP;
varying float vTreeBark;
float treeHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
            // (a leaf card from behind: lit as from the front — no back-face flip of the normal)
            .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\ngeometryNormal = normal;')
            .replace('#include <color_fragment>', `#include <color_fragment>
if (vTreeBark > 0.5) {
    // bark: plates elongated up the stem, cracks between them, each plate its own shade; far away the average
    vec3 q = vec3(vTreeP.x * 7.0, vTreeP.y * 1.7, vTreeP.z * 7.0);
    vec3 cell = floor(q), f = fract(q);
    float plate = treeHash(cell);
    float edge = min(min(f.x, 1.0 - f.x), min(f.z, 1.0 - f.z));
    float crack = 1.0 - smoothstep(0.02, 0.16, edge);
    float rowCut = 1.0 - smoothstep(0.0, 0.06, min(f.y, 1.0 - f.y));
    float grain = treeHash(floor(vTreeP * vec3(22.0, 4.0, 22.0)));
    float fw = max(max(fwidth(q.x), fwidth(q.z)), fwidth(q.y));
    float near = 1.0 - smoothstep(0.35, 0.9, fw);
    float k = 1.0 + near * ((plate - 0.5) * 0.26 + (grain - 0.5) * 0.12 - crack * 0.42 - rowCut * 0.18);
    diffuseColor.rgb *= mix(0.92, k, near);
}`);
        if (glow) {
            shader.uniforms.uGoldGlow = GOLD_GLOW;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uGoldGlow;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.85, 0.45) * uGoldGlow * (vTreeBark > 0.5 ? 0.25 : 1.0);');
        }
    };
    m.customProgramCacheKey = () => (glow ? 'tree-leaf-gold' : 'tree-leaf');
    return m;
}

let _shared = null;
/** The trees' materials, made once and shared by every tree (the world's, the apple trees, a tree come alive). */
export function sharedTreeMaterials() {
    if (_shared) return _shared;
    const leaves = applySkyComp(leafMaterial());
    // (the bark is drawn with the leaves' material too — its points take the atlas's plain cell: one shader for a tree)
    return (_shared = { leaves, bark: leaves, gold: applySkyComp(leafMaterial({ glow: true })), depth: leafDepthMaterial() });
}

/** The shadow of the leaves: cut out like them (not square cards), swaying the same. */
export function leafDepthMaterial() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafAtlas(), alphaTest: 0.42 });
    m.onBeforeCompile = (shader) => addSway(shader);
    m.customProgramCacheKey = () => 'tree-leaf-depth';
    return m;
}

const _geo = new Map(); // "kind:variant:far" → {wood, leaf, info}
function toGeometry(a) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(a.sway, 1));
    if (a.uv) g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
    g.setIndex(new THREE.BufferAttribute(a.index, 1));
    g.computeBoundingSphere();
    g.userData.shared = g.userData.keep = true; // (one per shape: never disposed with a tree)
    return g;
}

/** Two parts' arrays as one (the second's points after the first's). */
function joinParts(a, b) {
    const cat = (x, y, T) => { const o = new T(x.length + y.length); o.set(x); o.set(y, x.length); return o; };
    const n = a.count + b.count;
    const index = n > 65535 ? new Uint32Array(a.index.length + b.index.length) : new Uint16Array(a.index.length + b.index.length);
    index.set(a.index);
    for (let i = 0; i < b.index.length; i++) index[a.index.length + i] = b.index[i] + a.count;
    return { pos: cat(a.pos, b.pos, Float32Array), nor: cat(a.nor, b.nor, Float32Array), col: cat(a.col, b.col, Float32Array), sway: cat(a.sway, b.sway, Float32Array), uv: cat(a.uv, b.uv, Float32Array), index, count: n };
}

/** A shape's geometries (made once, kept: 5 kinds × VARIANTS × 2 — a fixed number). */
export function treeGeometry(kind, variant, far = false) {
    const lod = far === true ? 1 : far | 0; // (0 near, 1 far, 2 very far — TreeBuild)
    far = lod;
    const key = kind * 1000 + variant * 3 + lod;
    let e = _geo.get(key);
    if (!e) {
        const t = buildTree(kind, variant, { far });
        // full: the bark and the leaves in one shape (one material, the atlas's plain cell for the bark) — one draw a shape
        e = { wood: toGeometry(t.wood), leaf: toGeometry(t.leaf), full: toGeometry(joinParts(t.wood, t.leaf)), info: t.info };
        _geo.set(key, e);
    }
    return e;
}
