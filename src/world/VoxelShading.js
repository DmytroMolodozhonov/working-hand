/**
 * VoxelShading.js — simple but pleasant block textures, without texture files.
 *
 * Added to the terrain's Phong material in the shader (works on greedy-merged
 * faces because everything is computed from the world position):
 *   - a crisp 8×8 "pixel" pattern per block face (like hand-painted voxel
 *     textures): small brightness steps, grass gets light/dark speckles,
 *     sides of rock get horizontal strata,
 *   - soft darkening along every block edge, so each block reads clearly,
 *   - grass blocks: the top edge of the side face stays green (a grass lip).
 *   - castle and village blocks carry a pattern number (vertex attribute
 *     `voxPat`): cut stone, cobbles, bricks, planks, roof tiles, cloth, gold,
 *     straw, furrows, book spines and glowing lanterns.
 *   - a cave's dark: each face carries the daylight reaching it (`voxSky`, Minecraft-like sky
 *     light from Terrain._skyLight); the sun and the sky light it only that much.
 */

import * as THREE from 'three';
import { ULTRA_PARS, addUltraUniforms } from '../fx/UltraUniforms.js';

/**
 * The daylight in the world's lights: `comp` undoes the dimming of the lights round a player deep
 * in a cave (World: their hands, the things by them are dark) for the land itself — the land is as
 * lit as the sky reaches it (each block face's own daylight, `voxSky`), wherever the player is.
 */
export const SKY_LIGHT = { comp: { value: 1 } };

/**
 * Invisible houses («Protection Invisible», HouseWards.js): inside each sphere [x, y, z, r] the blocks
 * above its ground (g) are drawn only for the share k of the pixels (0: not at all — the land drawn
 * over it is seen instead; 1: all of it). The nearest 8, filled in every frame.
 */
/**
 * «Бум» (Boom.js): the ground swelling over the place about to burst and its glowing cracks — in the voxel
 * shader itself (the same compiled program always: only these numbers change). c: (x, z, R, —); k: (lift m,
 * glow 0…1, time s). k = 0: nothing.
 */
export const BOOM_SWELL = {
    c: { value: new THREE.Vector4(0, 0, 1, 0) },
    k: { value: new THREE.Vector3(0, 0, 0) },
};
const BOOM_PARS = 'uniform vec4 uBoomC;\nuniform vec3 uBoomK;';
const BOOM_LIFT = `{
    vec3 bw = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vec2 bq = bw.xz - uBoomC.xy;
    float bd = dot(bq, bq) / (uBoomC.z * uBoomC.z);
    if (uBoomK.x > 0.0 && bd < 1.0) { float f = 1.0 - bd; transformed.y += uBoomK.x * f * f * (0.85 + 0.15 * sin(bw.x * 1.7 + bw.z * 1.3 + uBoomK.z * 37.0)); }
}`;
const BOOM_GLOW = `
if (uBoomK.y > 0.0) {
    vec2 bq = vVoxPos.xz - uBoomC.xy;
    float br = length(bq), reach = uBoomC.z * min(1.0, uBoomK.y * 1.25);
    if (br < reach) {
        float ang = atan(bq.y, bq.x);
        float w = ang * 2.0675 + (vnoise(vec2(br * 0.07, ang * 2.0)) - 0.5) * 1.4; // (13 cracks from the middle, wandering)
        float ray = 1.0 - smoothstep(0.015, 0.06, abs(fract(w) - 0.5) * (0.6 + br / uBoomC.z));
        float net = 1.0 - smoothstep(0.02, 0.08, cobbleEdge(vVoxPos.xz * 0.16 + vec2(vVoxPos.y * 0.05), 3.0));
        float crack = max(ray, net * 0.75) * (1.0 - smoothstep(reach * 0.8, reach, br));
        float pulse = 0.7 + 0.3 * sin(uBoomK.z * 11.0 - br * 0.25);
        totalEmissiveRadiance += (vec3(1.0, 0.38, 0.06) * 2.4 + vec3(1.0, 0.8, 0.45) * crack) * crack * uBoomK.y * pulse;
    }
}`;

/** Hell (HellRealm.js): the time that moves the lava (s) — one number for the whole land; 0 elsewhere (the shader is the same program). */
export const HELL_TIME = { t: { value: 0 } };

export const WARD_HIDE = {
    s: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    g: { value: new Array(8).fill(0) },
    k: { value: new Array(8).fill(1) },
    n: { value: 0 },
};
const WARD_HIDE_PARS = `#include <clipping_planes_pars_fragment>
uniform vec4 uWardS[8];
uniform float uWardG[8];
uniform float uWardK[8];
uniform int uWardN;`;
const WARD_HIDE_FRAG = `#include <clipping_planes_fragment>
for (int i = 0; i < 8; i++) {
    if (i >= uWardN) break;
    vec3 wd = vVoxPos - uWardS[i].xyz;
    if (vVoxPos.y > uWardG[i] && dot(wd, wd) < uWardS[i].w * uWardS[i].w) {
        float wh = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (wh >= uWardK[i]) discard;
    }
}`;

/** A material of the open world (trees, grass, water): lit by the sky as it is, wherever the player stands. */
export function applySkyComp(material) {
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (before) before.call(material, shader, renderer);
        shader.uniforms.uSkyComp = SKY_LIGHT.comp;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uSkyComp;')
            .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directDiffuse *= uSkyComp;\nreflectedLight.indirectDiffuse *= uSkyComp;');
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (key ? key() : material.type) + '-sky';
    return material;
}

const WET_FRAG = `
if (uUltraOn > 0.5 && uUltraWet > 0.01) {
    vec3 wn = normalize(vVoxNormal);
    float wet = uUltraWet * smoothstep(0.55, 0.95, wn.y) * smoothstep(0.6, 0.95, vVoxSky);
    if (wet > 0.005) {
        float puddle = smoothstep(0.5, 0.72, vnoise(vVoxPos.xz * 0.23) * 0.7 + vnoise(vVoxPos.xz * 0.9) * 0.3);
        vec2 rt = ultraRain(vVoxPos.xz, uUltraTime) * 0.1 * puddle;
        vec3 n2 = normalize(wn + vec3(rt.x, 0.0, rt.y));
        vec3 wV = normalize(vVoxPos - cameraPosition);
        float fr = 0.03 + 0.97 * pow(1.0 - clamp(dot(-wV, n2), 0.0, 1.0), 5.0);
        vec3 wR = reflect(wV, n2);
        gl_FragColor.rgb *= 1.0 - 0.28 * wet;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, ultraSky(wR) * 0.8, clamp(fr * wet * (0.35 + 0.65 * puddle), 0.0, 0.75));
        float ws = max(dot(wR, normalize(uUltraSunDir)), 0.0);
        gl_FragColor.rgb += uUltraSunCol * pow(ws, 160.0) * 1.5 * wet * uUltraSunVis;
    }
}
#include <fog_fragment>`;

export function applyVoxelDetail(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSkyComp = SKY_LIGHT.comp;
        shader.uniforms.uWardS = WARD_HIDE.s;
        shader.uniforms.uWardG = WARD_HIDE.g;
        shader.uniforms.uWardK = WARD_HIDE.k;
        shader.uniforms.uWardN = WARD_HIDE.n;
        shader.uniforms.uBoomC = BOOM_SWELL.c;
        shader.uniforms.uBoomK = BOOM_SWELL.k;
        shader.uniforms.uHellT = HELL_TIME.t;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVoxPos;\nvarying vec3 vVoxNormal;\nattribute float voxPat;\nvarying float vVoxPat;\nattribute float voxSky;\nvarying float vVoxSky;\n' + BOOM_PARS)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BOOM_LIFT + '\nvVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVoxNormal = normalize(mat3(modelMatrix) * normal);\nvVoxPat = voxPat;\nvVoxSky = voxSky;');
        // a cave's dark: the sun and the sky's light (ambient, hemisphere) reach a face only as far as
        // the daylight gets in; a lamp, «Люмос», a fire light it fully
        const lightsBegin = THREE.ShaderChunk.lights_fragment_begin.replace(
            'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );',
            'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );\n\t\tdirectLight.color *= vVoxSky * uSkyComp;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <clipping_planes_pars_fragment>', WARD_HIDE_PARS)
            .replace('#include <clipping_planes_fragment>', WARD_HIDE_FRAG)
            .replace('#include <lights_fragment_begin>', lightsBegin)
            .replace('#include <lights_fragment_maps>', '#if defined( RE_IndirectDiffuse )\n\tirradiance *= vVoxSky * uSkyComp;\n#endif\n#include <lights_fragment_maps>')
            .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + BOOM_GLOW)
            .replace('#include <common>', `#include <common>
${BOOM_PARS}
uniform float uSkyComp;
uniform float uHellT;
float hellE = 0.0; // (hell's glowing blocks: how much and what colour they shine — set by the pattern, read by the emissive part)
vec3 hellC = vec3(0.0);
varying float vVoxSky;
varying vec3 vVoxPos;
varying vec3 vVoxNormal;
varying float vVoxPat;
float vhash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// smooth value noise over the ground (the grass's patches and shimmer of colour, generation 5)
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = vhash(vec3(i, 5.0)), b = vhash(vec3(i + vec2(1.0, 0.0), 5.0));
    float c = vhash(vec3(i + vec2(0.0, 1.0), 5.0)), d = vhash(vec3(i + vec2(1.0, 1.0), 5.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// distance to the nearest edge of a jittered cell grid (cobbles)
float cobbleEdge(vec2 p, float layer) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 c = o + vec2(vhash(vec3(i + o, layer)), vhash(vec3(i + o, layer + 7.0))) * 0.8 + 0.1;
        float d = length(c - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return d2 - d1;
}
// the Ice Castle's floor (pattern 16): how much of a snowflake drawn every 3 m lies at this point (0…1)
float snowflakeAt(vec2 uv) {
    vec2 c = fract(uv / 3.0) - 0.5;
    float r = length(c), a = atan(c.y, c.x);
    float sec = 1.0471976;
    float aa = mod(a + sec * 0.5, sec) - sec * 0.5;
    vec2 q = vec2(cos(aa), sin(aa)) * r;
    float arm = (1.0 - smoothstep(0.01, 0.026, abs(q.y))) * step(r, 0.43);
    float br = 0.0;
    for (int k = 0; k < 2; k++) {
        float o = k == 0 ? 0.2 : 0.31;
        float vv = abs(abs(q.y) - (q.x - o) * 0.85);
        br = max(br, (1.0 - smoothstep(0.008, 0.022, vv)) * step(o, q.x) * step(q.x, o + 0.09));
    }
    float hex = 1.0 - smoothstep(0.008, 0.024, abs(r * cos(aa) - 0.1));
    return max(max(arm, br), hex * step(r, 0.13));
}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec3 n = abs(vVoxNormal);
    // Block-local coordinates on the face (blocks are centred on integers in x/z, layers end at .5 in y)
    vec3 q = vVoxPos + vec3(0.5, 0.5, 0.5);
    vec2 uv = n.y > 0.5 ? q.xz : (n.x > 0.5 ? q.zy : q.xy);
    vec2 cell = floor(uv);
    vec2 f = fract(uv);
    // How many metres of the face one screen pixel covers. Far away the small pattern gets
    // smaller than a pixel and would flicker at the slightest move of the camera: it fades
    // into its average colour instead (fine pixels first, then stones / planks / bricks).
    vec2 fw = fwidth(uv);
    float fp = max(fw.x, fw.y);
    float kFine = 1.0 - smoothstep(0.05, 0.14, fp);
    float kCoarse = 1.0 - smoothstep(0.07, 0.22, fp);
    vec3 voxBase = diffuseColor.rgb;
    // Which block (across the face) the face belongs to: taken half a block inside it. The face
    // itself lies exactly on a whole number there, and floor() of the interpolated position
    // jumped between the two neighbouring layers pixel by pixel — the pattern of two different
    // blocks showed through each other in flickering patches (planks, stones, cobbles…).
    float layerId = floor(dot(q - 0.5 * vVoxNormal, n));
    // 8x8 pixels per face
    vec2 px = floor(f * 8.0);
    float r = vhash(vec3(cell * 8.0 + px, layerId));
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float pat = floor(vVoxPat + 0.5);
    // generation 5's grass (pattern 14): grass whatever its colour (golden steppe, autumn, moonlit teal)
    bool lushGrass = pat == 14.0;
    if (lushGrass) pat = 0.0;
    // snow (pattern 17): soft, without the pixels' grain — wind-blown drifts in faint waves, a
    // glitter of crystals in the light; on a side a thin crust under the top
    bool snowy = pat == 17.0;
    if (snowy) {
        pat = 0.0;
        vec2 sp = n.y > 0.5 ? q.xz : vec2(uv.x, q.y * 2.0);
        float drift = vnoise(sp * vec2(0.9, 2.6) + 3.0) * 0.6 + vnoise(sp * 2.3 - 11.0) * 0.4;
        diffuseColor.rgb *= 0.95 + 0.07 * drift;
        float spark = vhash(vec3(floor(uv * 16.0), layerId + 23.0));
        if (spark > 0.985) diffuseColor.rgb *= 1.0 + 0.1 * kFine;
        if (n.y < 0.5 && fract(q.y) > 0.86) diffuseColor.rgb *= 1.03; // (the crust of the top on the side)
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 1.0) * lum, 0.12 * (1.0 - n.y)); // (bluish in the shade of a side)
    }
    bool green = lushGrass ? n.y > 0.5 : diffuseColor.g > diffuseColor.r * 1.15 && diffuseColor.g > diffuseColor.b * 1.1;
    if (lushGrass && n.y < 0.5) {
        // the side of a grass block: earth, the grass of the top hanging over its edge in a ragged fringe
        float fy = fract(q.y);
        float fringe = 0.74 + 0.16 * vhash(vec3(floor(f.x * 8.0) + cell.x * 8.0, cell.y, layerId + 11.0));
        // (far away a step's side is mostly the grass hanging over it: the slopes don't stripe brown)
        if (fy < mix(0.42, fringe, kFine)) diffuseColor.rgb = vec3(0.42, 0.29, 0.165) * (0.92 + 0.16 * vhash(vec3(cell, layerId + 3.0)));
        else diffuseColor.rgb *= 0.86;
    }
    if (lushGrass && n.y > 0.5) {
        // patches of lighter and darker grass, warmer and cooler, a few metres to tens of metres across —
        // a meadow shimmers from above instead of lying one flat colour (the land's own colour is the vertex's)
        vec2 gp = q.xz;
        float g1 = vnoise(gp / 9.0), g2 = vnoise(gp / 3.3 + 17.0), g3 = vnoise(gp / 26.0 - 31.0);
        diffuseColor.rgb *= 1.0 + (g1 - 0.5) * 0.24 + (g2 - 0.5) * 0.1 * (0.4 + 0.6 * kCoarse);
        diffuseColor.rgb *= mix(vec3(0.9, 1.0, 1.1), vec3(1.1, 1.03, 0.82), smoothstep(0.2, 0.8, g3)); // (cool … warm)
    }
    float detail = pat > 0.5 ? 0.0 : (r - 0.5) * (snowy ? 0.02 : 0.08);
    if (pat < 0.5 && green && n.y > 0.5) detail += (r > 0.9 ? 0.07 : 0.0) - (r < 0.08 ? 0.06 : 0.0); // grass speckles
    if (pat < 0.5 && !green && n.y < 0.5 && lum < 0.65) detail += (mod(px.y, 3.0) == 0.0 ? -0.05 : 0.0); // strata on rock/dirt sides
    diffuseColor.rgb *= 1.0 + detail * kFine;
    if (pat == 1.0) {
        // cut stone: blocks half a metre high, every row shifted by half
        vec2 s = n.y > 0.5 ? uv : uv * vec2(1.0, 2.0);
        float row = floor(s.y);
        s.x += mod(row, 2.0) * 0.5;
        vec2 g = fract(s), id = floor(s);
        float m = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y) * (n.y > 0.5 ? 1.0 : 0.5));
        float tone = vhash(vec3(id, layerId));
        diffuseColor.rgb *= (1.0 + (tone - 0.5) * 0.18 + (r - 0.5) * 0.05) * (m < 0.035 ? 0.62 : 1.0);
    } else if (pat == 2.0) {
        // cobbles: round stones with dark gaps
        float e = cobbleEdge(uv * 3.0, layerId);
        float tone = vhash(vec3(floor(uv * 3.0), layerId + 3.0));
        diffuseColor.rgb *= (1.0 + (tone - 0.5) * 0.22) * (0.6 + 0.4 * smoothstep(0.03, 0.12, e));
    } else if (pat == 3.0) {
        // bricks: four rows per block, light mortar
        vec2 s = uv * vec2(2.0, 4.0);
        s.x += mod(floor(s.y), 2.0) * 0.5;
        vec2 g = fract(s);
        float m = min(min(g.x, 1.0 - g.x) * 0.5, min(g.y, 1.0 - g.y) * 0.25);
        diffuseColor.rgb *= 1.0 + (vhash(vec3(floor(s), layerId)) - 0.5) * 0.2;
        if (m < 0.018) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.75, 0.7), 0.85);
    } else if (pat == 4.0) {
        // planks: four boards per block with seams, grain and staggered ends
        vec2 s = n.y > 0.5 ? uv.yx : uv;
        float board = floor(s.y * 4.0);
        float along = s.x + vhash(vec3(board, layerId, 1.0)) * 3.0;
        float gy = fract(s.y * 4.0), gx = fract(along / 2.0);
        float grain = sin(along * 23.0 + vhash(vec3(board, layerId, 2.0)) * 6.0) * 0.04;
        diffuseColor.rgb *= (1.0 + (vhash(vec3(board, floor(along / 2.0), layerId)) - 0.5) * 0.16 + grain) * (gy < 0.08 || gx < 0.015 ? 0.7 : 1.0);
    } else if (pat == 5.0) {
        // roof tiles: rows of rounded tiles, darker at the lower edge of each row
        vec2 s = uv * vec2(3.0, 3.0);
        s.x += mod(floor(s.y), 2.0) * 0.5;
        vec2 g = fract(s);
        float edge = smoothstep(0.0, 0.35, g.y) * (1.0 - 0.25 * pow(abs(g.x - 0.5) * 2.0, 3.0));
        diffuseColor.rgb *= (0.72 + 0.32 * edge) * (1.0 + (vhash(vec3(floor(s), layerId)) - 0.5) * 0.14);
    } else if (pat == 6.0) {
        // cloth / carpet: a fine weave and a border
        vec2 w = floor(uv * 16.0);
        diffuseColor.rgb *= 1.0 + (mod(w.x + w.y, 2.0) - 0.5) * 0.06 + (r - 0.5) * 0.04;
        vec2 g = fract(uv);
        if (n.y > 0.5 && (min(g.x, 1.0 - g.x) < 0.07 || min(g.y, 1.0 - g.y) < 0.07)) diffuseColor.rgb *= 0.8;
    } else if (pat == 7.0) {
        // gold: bright bands and sparkles
        diffuseColor.rgb *= 1.05 + 0.12 * sin((uv.x + uv.y) * 9.0) + (r > 0.93 ? 0.25 : 0.0);
    } else if (pat == 8.0) {
        // straw / hay / wheat: thin stalks
        float st = vhash(vec3(floor(uv.x * 16.0), floor(uv.y * 3.0), layerId));
        diffuseColor.rgb *= 0.85 + st * 0.3;
    } else if (pat == 9.0) {
        // ploughed field: furrows
        diffuseColor.rgb *= n.y > 0.5 ? (mod(floor(uv.x * 4.0), 2.0) == 0.0 ? 0.75 : 1.08) : 0.9;
    } else if (pat == 10.0) {
        // bookshelf: shelves of coloured spines
        if (n.y > 0.5) diffuseColor.rgb *= 0.9;
        else {
            float shelf = fract(uv.y * 2.0);
            float spine = floor(uv.x * 7.0);
            vec3 tint = vec3(0.5 + vhash(vec3(spine, floor(uv.y * 2.0), 1.0)), 0.4 + vhash(vec3(spine, floor(uv.y * 2.0), 2.0)) * 0.8, 0.4 + vhash(vec3(spine, floor(uv.y * 2.0), 3.0)));
            diffuseColor.rgb = shelf < 0.12 ? diffuseColor.rgb * 0.6 : diffuseColor.rgb * tint * (fract(uv.x * 7.0) < 0.1 ? 0.6 : 1.0);
        }
    } else if (pat == 11.0) {
        // lantern: a glowing pane in a dark frame
        vec2 g = fract(uv);
        if (min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) < 0.12) diffuseColor.rgb *= 0.25;
    } else if (pat == 12.0) {
        // crystal lamp: faceted bands
        diffuseColor.rgb *= 0.8 + 0.4 * step(0.5, fract((uv.x + uv.y) * 2.0));
    } else if (pat == 15.0) {
        // glacier ice (the Ice Castle): big facets of lighter and deeper blue, a few white cracks
        float fac = vhash(vec3(floor(uv * 1.5), layerId + 7.0));
        float band = step(0.5, fract((uv.x * 0.7 - uv.y * 1.3) * 1.2 + fac));
        diffuseColor.rgb *= 0.86 + 0.24 * fac + 0.07 * band;
        float ck = abs(fract((uv.x + 0.6 * uv.y) * 1.1 + fac * 2.0) - 0.5);
        if (ck < 0.018) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.99, 1.0), 0.65 * kFine);
    } else if (pat == 16.0) {
        // the snowflake floor: frosty ice, a glowing snowflake every 3 m
        diffuseColor.rgb *= 0.94 + 0.08 * vhash(vec3(cell, layerId + 2.0));
        if (n.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.99, 1.0), snowflakeAt(uv) * 0.9 * kCoarse);
    } else if (pat == 13.0) {
        // runes: a faint glowing circle cut into dark stone
        float ring = 1.0 - smoothstep(0.02, 0.04, abs(length(f - 0.5) - 0.32));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.75, 1.0), ring * 0.7);
    } else if (pat >= 23.0 && pat < 31.0) {
        // HELL (HellLand.js): the patterns of its stone, the lava and the bone
        if (pat == 23.0) {
            // black columnar basalt: on top the polygon tops of the columns, on the sides tall columns with cross-fractures; ash in the joints
            if (n.y > 0.5) {
                float e = cobbleEdge(uv * 0.85, layerId + 31.0);
                float tone = vhash(vec3(floor(uv * 0.85), layerId + 3.0));
                diffuseColor.rgb *= (0.82 + 0.3 * tone) * (0.55 + 0.45 * smoothstep(0.02, 0.09, e));
            } else {
                float cx = uv.x * 1.6 + 0.35 * vnoise(vec2(uv.x * 0.7, layerId * 0.37));
                float col = fract(cx), id = floor(cx);
                float joint = smoothstep(0.0, 0.06, col) * smoothstep(1.0, 0.94, col);
                float frac = 1.0 - (1.0 - smoothstep(0.0, 0.04, abs(fract(q.y * 0.5 + vhash(vec3(id, 2.0, 9.0))) - 0.5) - 0.46)) * 0.6;
                diffuseColor.rgb *= (0.78 + 0.34 * vhash(vec3(id, layerId * 0.1, 4.0))) * (0.5 + 0.5 * joint) * frac;
                diffuseColor.rgb += vec3(0.05, 0.012, 0.0) * (1.0 - smoothstep(0.0, 2.0, fract(q.y / 9.0) * 9.0)); // (warm light from below on the foot of a cliff)
            }
            if (r > 0.992) diffuseColor.rgb += vec3(0.08, 0.02, 0.0) * kFine; // (a glint of glassy grain)
        } else if (pat == 24.0) {
            // obsidian: glassy black with violet depth, conchoidal ripples and a cold sheen, sharp light edges of its fractures
            float rip = sin((uv.x * 0.9 - uv.y * 1.4) * 7.0 + vnoise(uv * 1.3 + layerId) * 6.0);
            diffuseColor.rgb *= 0.75 + 0.18 * rip;
            diffuseColor.rgb += vec3(0.05, 0.025, 0.09) * smoothstep(0.6, 1.0, rip);
            float ed = abs(fract((uv.x + 0.37 * uv.y) * 0.6 + vhash(vec3(cell, layerId + 2.0))) - 0.5);
            if (ed < 0.012) diffuseColor.rgb += vec3(0.16, 0.12, 0.2) * kFine;
        } else if (pat == 25.0) {
            // red-hot rock: a dark cooled crust broken into plates, molten light in every crack, a breathing glow
            float e = cobbleEdge(uv * 1.4, layerId + 17.0);
            float crack = 1.0 - smoothstep(0.015, 0.11, e);
            float pulse = 0.75 + 0.25 * sin(uHellT * 1.7 + vnoise(uv * 0.4) * 9.0);
            vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.75, 0.25), crack * crack);
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.7 + 0.5 * vhash(vec3(floor(uv * 1.4), layerId))), hot, crack * 0.9);
            hellE = crack * pulse * 1.3 + 0.08; hellC = hot;
        } else if (pat == 26.0) {
            // ash: soft grey drifts, fine speckles, now and then a tiny ember
            float drift = vnoise(uv * vec2(0.6, 1.8) + layerId) * 0.6 + vnoise(uv * 3.1) * 0.4;
            diffuseColor.rgb *= 0.86 + 0.24 * drift;
            if (r > 0.995) { diffuseColor.rgb = vec3(1.0, 0.45, 0.1); hellE = 0.9 * kFine; hellC = vec3(1.0, 0.4, 0.08); }
        } else if (pat == 27.0) {
            // LAVA: molten rock flowing — bright yellow-orange veins between drifting dark skins on top; on the falls' sides it pours down in streaks
            vec2 lp = n.y > 0.5 ? q.xz * 0.22 : vec2(uv.x * 0.5, q.y * 0.12 + uHellT * 0.55);
            vec2 fl = n.y > 0.5 ? vec2(uHellT * 0.045, uHellT * 0.03) : vec2(0.0);
            float a = vnoise(lp + fl) * 0.6 + vnoise(lp * 2.7 - fl * 1.7 + 3.0) * 0.4;
            float b = vnoise(lp * 6.3 + fl * 3.0 + 11.0);
            float skin = smoothstep(0.46, 0.66, a) * (n.y > 0.5 ? 1.0 : 0.4); // (the cooler crust)
            float vein = 1.0 - smoothstep(0.0, 0.12, abs(a - 0.5));
            vec3 hot = mix(vec3(0.85, 0.2, 0.02), vec3(1.0, 0.72, 0.26), vein * 0.75 + b * 0.2);
            if (n.y < 0.5) hot = mix(hot, vec3(1.0, 0.95, 0.6), smoothstep(0.75, 1.0, b)); // (the pour: white-hot streaks)
            diffuseColor.rgb = mix(hot, vec3(0.16, 0.05, 0.03), skin * 0.85);
            hellE = (1.0 - skin * 0.85) * (0.95 + 0.15 * sin(uHellT * 2.3 + a * 12.0)); hellC = hot;
        } else if (pat == 28.0) {
            // the titans' bone: old ivory, long fibres, porous pits, dark cracks, soot from below
            float fib = vnoise(vec2(uv.x * 9.0, uv.y * 0.8) + layerId) * 0.5 + 0.5 * vnoise(uv * 2.0);
            diffuseColor.rgb *= 0.8 + 0.28 * fib;
            if (vhash(vec3(floor(uv * 5.0), layerId + 8.0)) > 0.9) diffuseColor.rgb *= 0.6 + 0.4 * kFine * 0.0 + 0.4 * (1.0 - kFine); // (pits)
            float ck = abs(fract(uv.x * 0.7 + uv.y * 0.3 + vhash(vec3(cell, 1.0)) * 2.0) - 0.5);
            if (ck < 0.015) diffuseColor.rgb *= 0.55;
            diffuseColor.rgb *= 0.85 + 0.15 * smoothstep(0.0, 1.0, fract(q.y * 0.25));
        } else if (pat == 29.0) {
            // black dressed stone (roads, bridges, the pillar): big blocks, worn edges, a dull red heat in the joints
            vec2 s = n.y > 0.5 ? uv * vec2(0.9, 0.6) : uv * vec2(0.9, 2.0);
            s.x += mod(floor(s.y), 2.0) * 0.5;
            vec2 g = fract(s), id = floor(s);
            float m = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
            float tone = vhash(vec3(id, layerId + 6.0));
            diffuseColor.rgb *= (0.78 + 0.35 * tone) * (0.9 + 0.1 * vnoise(uv * 4.0));
            if (m < 0.035) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.055, 0.05), 0.8); if (vhash(vec3(id, layerId + 13.0)) > 0.86) { hellE = 0.18 * (1.0 - smoothstep(0.0, 0.035, m)); hellC = vec3(0.9, 0.2, 0.04); } } // (ash in the joints; here and there a seam still smoulders)
            if (n.y > 0.5 && m > 0.04 && m < 0.08) diffuseColor.rgb *= 1.12; // (the worn rims)
        } else {
            // forged iron: dark, hammered, rivets every half metre, blue-violet heat tint and rust
            vec2 g = fract(uv * 2.0);
            float riv = 1.0 - smoothstep(0.08, 0.14, length(g - 0.5));
            float ham = vnoise(uv * 6.0 + layerId) * 0.5 + vnoise(uv * 15.0) * 0.5;
            diffuseColor.rgb *= 0.7 + 0.35 * ham + 0.3 * riv;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.16, 0.08), 0.35 * smoothstep(0.55, 0.85, vnoise(uv * 1.2 + 5.0)));
            diffuseColor.rgb += vec3(0.04, 0.03, 0.08) * smoothstep(0.4, 1.0, vnoise(uv * 0.8));
        }
    } else if (pat >= 18.0 && pat < 23.0) {
        // the Castle of Ghosts: black stone with a faint chill of violet in it, see-through by 15 % (the dither below)
        if (pat == 18.0) {
            // black ashlar: big stones in half-metre rows, pale hairline cracks, rain streaks down the sides, a few glints
            vec2 s = n.y > 0.5 ? uv : uv * vec2(1.0, 2.0);
            s.x += mod(floor(s.y), 2.0) * 0.5;
            vec2 g = fract(s), id = floor(s);
            float m = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y) * (n.y > 0.5 ? 1.0 : 0.5));
            float t2 = vhash(vec3(id, layerId + 9.0));
            diffuseColor.rgb *= (0.8 + t2 * 0.55) * (m < 0.045 ? 0.5 : 1.0);
            float ck = abs(fract(g.x * 0.8 + g.y * 1.9 + t2 * 3.0) - 0.5);
            if (t2 > 0.72 && ck < 0.025) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.37, 0.48), 0.6 * kFine);
            if (n.y < 0.5) diffuseColor.rgb *= 0.88 + 0.24 * vnoise(vec2((q.x + q.z) * 2.6, q.y * 0.3));
            if (r > 0.985) diffuseColor.rgb += vec3(0.07, 0.06, 0.15) * kFine;
        } else if (pat == 19.0) {
            // black brick: four courses a block, grey-violet mortar, here and there a lighter or scorched brick
            vec2 s = uv * vec2(2.0, 4.0);
            s.x += mod(floor(s.y), 2.0) * 0.5;
            vec2 g = fract(s);
            float m = min(min(g.x, 1.0 - g.x) * 0.5, min(g.y, 1.0 - g.y) * 0.25);
            float t2 = vhash(vec3(floor(s), layerId + 4.0));
            diffuseColor.rgb *= 0.75 + t2 * 0.6;
            if (m < 0.02) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.2, 0.27), 0.9);
            if (t2 > 0.93) diffuseColor.rgb += vec3(0.05, 0.04, 0.08);
        } else if (pat == 20.0) {
            // a floor of black and dark-violet tiles, worn in the middle of each, with pale seams
            vec2 g = fract(uv), id = floor(uv);
            float chk = mod(id.x + id.y, 2.0);
            float wear = vnoise(uv * 3.0 + layerId) * 0.25;
            diffuseColor.rgb *= (chk < 0.5 ? 0.78 : 1.18) + wear - 0.1;
            float m = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
            if (m < 0.035) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.4), 0.7);
            if (n.y > 0.5 && vhash(vec3(id, layerId + 17.0)) > 0.9) diffuseColor.rgb *= 0.8; // (dusty tiles)
        } else if (pat == 21.0) {
            // slate: rows of pointed scales, each row darker below, a green-grey chill in the shade
            vec2 s = uv * vec2(3.0, 3.0);
            s.x += mod(floor(s.y), 2.0) * 0.5;
            vec2 g = fract(s);
            float tip = smoothstep(0.0, 0.5, g.y) * (1.0 - 0.35 * pow(abs(g.x - 0.5) * 2.0, 2.0));
            diffuseColor.rgb *= (0.62 + 0.55 * tip) * (0.85 + 0.3 * vhash(vec3(floor(s), layerId + 1.0)));
        } else {
            // candle-glow / mirror panel: a pale cold glow in a dark frame, with a cross of mullions
            vec2 g = fract(uv);
            float fr = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
            float mull = min(abs(g.x - 0.5), abs(g.y - 0.5));
            diffuseColor.rgb *= fr < 0.1 ? 0.2 : (mull < 0.025 ? 0.35 : 0.75 + 0.25 * vnoise(uv * 4.0 + layerId));
        }
    }
    // soft edge darkening (fake ambient occlusion along block borders)
    vec2 e = min(f, 1.0 - f);
    float edge = smoothstep(0.0, 0.09, min(e.x, e.y));
    // (very light on flat grass so a meadow doesn't look like tiles)
    float edgeAmt = (green || snowy) && n.y > 0.5 ? 0.05 : snowy ? 0.08 : 0.14;
    diffuseColor.rgb *= 1.0 - edgeAmt * mix(0.1, 1.0 - edge, kFine); // (far: the edges' average)
    // far: the patterned blocks (stone, planks, bricks…) take their average tone
    if (pat > 0.5) diffuseColor.rgb = mix(voxBase * 0.86, diffuseColor.rgb, kCoarse);
    // the Castle of Ghosts is ~15 % see-through (the author): every seventh pixel or so of its black stone is left out, in an even, fine scatter — near enough to see it
    if (pat >= 18.0 && pat < 23.0 && kCoarse > 0.5 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < 0.15) discard;
}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
    float vp = floor(vVoxPat + 0.5);
    if (vp == 11.0 || vp == 12.0) totalEmissiveRadiance += diffuseColor.rgb * 0.9; // lanterns and crystal lamps glow at night
    else if (vp >= 22.5 && vp < 30.5) totalEmissiveRadiance += hellC * hellE; // hell: the lava, the red-hot cracks, the embers in the ash and the joints
    else if (vp >= 17.5 && vp < 21.5) totalEmissiveRadiance += vec3(0.032, 0.03, 0.058) + diffuseColor.rgb * 0.1; // the Castle of Ghosts: a cold glimmer from within, so its black stone is never quite lost in the dark
    else if (vp >= 21.5 && vp < 22.5) totalEmissiveRadiance += diffuseColor.rgb * 1.1; // candle-glow and mirror panels shine pale
    else if (vp == 15.0) totalEmissiveRadiance += diffuseColor.rgb * 0.16; // glacier ice glows from within
    else if (vp == 16.0) {
        vec3 sn = abs(vVoxNormal);
        totalEmissiveRadiance += diffuseColor.rgb * (0.2 + (sn.y > 0.5 ? 0.6 * snowflakeAt((vVoxPos + vec3(0.5)).xz) : 0.0));
    }
    else if (vp == 13.0) {
        vec3 rn = abs(vVoxNormal);
        vec3 rq = vVoxPos + vec3(0.5);
        vec2 rf = fract(rn.y > 0.5 ? rq.xz : (rn.x > 0.5 ? rq.zy : rq.xy));
        float ring = 1.0 - smoothstep(0.02, 0.04, abs(length(rf - 0.5) - 0.32));
        totalEmissiveRadiance += diffuseColor.rgb * 0.5 * ring; // runes glow faintly
    }
}`);
    };
    const detail = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        detail(shader, renderer);
        // «Ультра качество», in the rain: the open ground darkens and shines wet, puddles mirror the sky
        addUltraUniforms(shader);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + ULTRA_PARS)
            .replace('#include <fog_fragment>', WET_FRAG);
    };
    material.extensions = { ...(material.extensions || {}), derivatives: true }; // (fwidth on WebGL1)
    material.customProgramCacheKey = () => 'voxel-detail';
    return material;
}

/**
 * Simple textures for the spawn-area trees (instanced boxes, no files):
 * bark — vertical grooves and knots on the trunk; leaves — a pixel pattern
 * of lighter and darker leaf clusters with small gaps.
 */
export function applyTreeDetail(material, kind) {
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vTreePos;\nvarying vec3 vTreeNormal;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreePos = transformed;\nvTreeNormal = normal;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vTreePos;
varying vec3 vTreeNormal;
float thash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec3 n = abs(vTreeNormal);
    vec2 uv = n.y > 0.5 ? vTreePos.xz : (n.x > 0.5 ? vTreePos.zy : vTreePos.xy);
    // (far away the leaf / bark pixels are smaller than a screen pixel: their average, no flicker)
    vec2 fw = fwidth(uv);
    float kFine = 1.0 - smoothstep(0.08, 0.22, max(fw.x, fw.y));
    ${kind === 'bark' ? `
    // bark: 6 px per metre across, long vertical grooves, darker knots
    vec2 px = floor(vec2(uv.x * 6.0, uv.y * 3.0));
    float r = thash(vec3(px.x, floor(px.y / 3.0), floor(dot(vTreePos, n) * 2.0)));
    float groove = mod(px.x, 3.0) == 0.0 ? -0.22 : 0.0;
    float knot = thash(vec3(px, 7.0)) > 0.96 ? -0.25 : 0.0;
    float d = (r - 0.5) * 0.18 + groove + knot;
    if (n.y > 0.5) { vec2 c = uv; float ring = fract(length(c) * 3.0); d = ring < 0.2 ? -0.18 : 0.05; }
    diffuseColor.rgb *= 1.0 + mix(-0.07, d, kFine);` : `
    // leaves: 5 px per metre, clusters of light / dark leaves and small dark gaps
    vec2 px = floor(uv * 5.0);
    float r = thash(vec3(px, floor(dot(vTreePos, n) * 2.0)));
    float big = thash(vec3(floor(uv * 1.6), 3.0));
    float d = (r - 0.5) * 0.3 + (big - 0.5) * 0.18;
    if (r > 0.93) d += 0.22;
    if (r < 0.06) d -= 0.35;
    diffuseColor.rgb *= 1.0 + mix((big - 0.5) * 0.18, d, kFine);`}
}`);
    };
    material.extensions = { ...(material.extensions || {}), derivatives: true }; // (fwidth on WebGL1)
    material.customProgramCacheKey = () => 'tree-detail-' + kind;
    return material;
}
