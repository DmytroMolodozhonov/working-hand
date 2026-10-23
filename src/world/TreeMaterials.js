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
import { buildTree } from './TreeBuild.js';
import { drawLeafAtlas, bleedLeafPixels, LEAF_ATLAS } from './TreeLeaves.js';

export const TREE_WIND = { time: { value: 0 }, strength: { value: 1 } };

let _atlas = null;
/** The leaf pictures (made once: on the loading screen — Game.prewarm). */
export function leafAtlas() {
    if (_atlas) return _atlas;
    const W = LEAF_ATLAS.CELL * LEAF_ATLAS.KINDS, H = LEAF_ATLAS.CELL;
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

/** Bark: vertex colours, lit as usual, swaying with the crown. */
export function barkMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (shader) => addSway(shader);
    m.customProgramCacheKey = () => 'tree-bark';
    return m;
}

/** Leaves: the atlas, cut out by its alpha, both sides lit alike, swaying. */
export function leafMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
        addSway(shader);
        shader.fragmentShader = shader.fragmentShader
            .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront')
            .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront');
    };
    m.customProgramCacheKey = () => 'tree-leaf';
    return m;
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
    g.userData.shared = true; // (one per shape: never disposed with a tree)
    return g;
}

/** A shape's geometries (made once, kept: 5 kinds × VARIANTS × 2 — a fixed number). */
export function treeGeometry(kind, variant, far = false) {
    const key = kind * 1000 + variant * 2 + (far ? 1 : 0);
    let e = _geo.get(key);
    if (!e) {
        const t = buildTree(kind, variant, { far });
        e = { wood: toGeometry(t.wood), leaf: toGeometry(t.leaf), info: t.info };
        _geo.set(key, e);
    }
    return e;
}
