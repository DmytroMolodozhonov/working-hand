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
 */

export function applyVoxelDetail(material) {
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVoxPos;\nvarying vec3 vVoxNormal;\nattribute float voxPat;\nvarying float vVoxPat;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVoxNormal = normalize(mat3(modelMatrix) * normal);\nvVoxPat = voxPat;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vVoxPos;
varying vec3 vVoxNormal;
varying float vVoxPat;
float vhash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
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
}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec3 n = abs(vVoxNormal);
    // Block-local coordinates on the face (blocks are centred on integers in x/z, layers end at .5 in y)
    vec3 q = vVoxPos + vec3(0.5, 0.5, 0.5);
    vec2 uv = n.y > 0.5 ? q.xz : (n.x > 0.5 ? q.zy : q.xy);
    vec2 cell = floor(uv);
    vec2 f = fract(uv);
    // 8x8 pixels per face
    vec2 px = floor(f * 8.0);
    float r = vhash(vec3(cell * 8.0 + px, floor(dot(q, n))));
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    bool green = diffuseColor.g > diffuseColor.r * 1.15 && diffuseColor.g > diffuseColor.b * 1.1;
    float pat = floor(vVoxPat + 0.5);
    float detail = pat > 0.5 ? 0.0 : (r - 0.5) * 0.08;
    if (pat < 0.5 && green && n.y > 0.5) detail += (r > 0.9 ? 0.07 : 0.0) - (r < 0.08 ? 0.06 : 0.0); // grass speckles
    if (pat < 0.5 && !green && n.y < 0.5 && lum < 0.65) detail += (mod(px.y, 3.0) == 0.0 ? -0.05 : 0.0); // strata on rock/dirt sides
    diffuseColor.rgb *= 1.0 + detail;
    float layerId = floor(dot(q, n));
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
    }
    // soft edge darkening (fake ambient occlusion along block borders)
    vec2 e = min(f, 1.0 - f);
    float edge = smoothstep(0.0, 0.09, min(e.x, e.y));
    // (very light on flat grass so a meadow doesn't look like tiles)
    float edgeAmt = green && n.y > 0.5 ? 0.05 : 0.14;
    diffuseColor.rgb *= 1.0 - edgeAmt + edgeAmt * edge;
}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (floor(vVoxPat + 0.5) == 11.0) totalEmissiveRadiance += diffuseColor.rgb * 0.9; // lanterns glow at night`);
    };
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
    ${kind === 'bark' ? `
    // bark: 6 px per metre across, long vertical grooves, darker knots
    vec2 px = floor(vec2(uv.x * 6.0, uv.y * 3.0));
    float r = thash(vec3(px.x, floor(px.y / 3.0), floor(dot(vTreePos, n) * 2.0)));
    float groove = mod(px.x, 3.0) == 0.0 ? -0.22 : 0.0;
    float knot = thash(vec3(px, 7.0)) > 0.96 ? -0.25 : 0.0;
    float d = (r - 0.5) * 0.18 + groove + knot;
    if (n.y > 0.5) { vec2 c = uv; float ring = fract(length(c) * 3.0); d = ring < 0.2 ? -0.18 : 0.05; }
    diffuseColor.rgb *= 1.0 + d;` : `
    // leaves: 5 px per metre, clusters of light / dark leaves and small dark gaps
    vec2 px = floor(uv * 5.0);
    float r = thash(vec3(px, floor(dot(vTreePos, n) * 2.0)));
    float big = thash(vec3(floor(uv * 1.6), 3.0));
    float d = (r - 0.5) * 0.3 + (big - 0.5) * 0.18;
    if (r > 0.93) d += 0.22;
    if (r < 0.06) d -= 0.35;
    diffuseColor.rgb *= 1.0 + d;`}
}`);
    };
    material.customProgramCacheKey = () => 'tree-detail-' + kind;
    return material;
}
