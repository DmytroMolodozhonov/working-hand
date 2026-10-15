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

export function applyVoxelDetail(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSkyComp = SKY_LIGHT.comp;
        shader.uniforms.uWardS = WARD_HIDE.s;
        shader.uniforms.uWardG = WARD_HIDE.g;
        shader.uniforms.uWardK = WARD_HIDE.k;
        shader.uniforms.uWardN = WARD_HIDE.n;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVoxPos;\nvarying vec3 vVoxNormal;\nattribute float voxPat;\nvarying float vVoxPat;\nattribute float voxSky;\nvarying float vVoxSky;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVoxNormal = normalize(mat3(modelMatrix) * normal);\nvVoxPat = voxPat;\nvVoxSky = voxSky;');
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
            .replace('#include <common>', `#include <common>
uniform float uSkyComp;
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
    }
    // soft edge darkening (fake ambient occlusion along block borders)
    vec2 e = min(f, 1.0 - f);
    float edge = smoothstep(0.0, 0.09, min(e.x, e.y));
    // (very light on flat grass so a meadow doesn't look like tiles)
    float edgeAmt = (green || snowy) && n.y > 0.5 ? 0.05 : snowy ? 0.08 : 0.14;
    diffuseColor.rgb *= 1.0 - edgeAmt * mix(0.1, 1.0 - edge, kFine); // (far: the edges' average)
    // far: the patterned blocks (stone, planks, bricks…) take their average tone
    if (pat > 0.5) diffuseColor.rgb = mix(voxBase * 0.86, diffuseColor.rgb, kCoarse);
}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
    float vp = floor(vVoxPat + 0.5);
    if (vp == 11.0 || vp == 12.0) totalEmissiveRadiance += diffuseColor.rgb * 0.9; // lanterns and crystal lamps glow at night
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
