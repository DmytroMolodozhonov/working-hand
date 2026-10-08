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
 */

export function applyVoxelDetail(material) {
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vVoxPos;\nvarying vec3 vVoxNormal;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVoxNormal = normalize(mat3(modelMatrix) * normal);');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vVoxPos;
varying vec3 vVoxNormal;
float vhash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
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
    float detail = (r - 0.5) * 0.08;
    if (green && n.y > 0.5) detail += (r > 0.9 ? 0.07 : 0.0) - (r < 0.08 ? 0.06 : 0.0); // grass speckles
    if (!green && n.y < 0.5 && lum < 0.65) detail += (mod(px.y, 3.0) == 0.0 ? -0.05 : 0.0); // strata on rock/dirt sides
    diffuseColor.rgb *= 1.0 + detail;
    // soft edge darkening (fake ambient occlusion along block borders)
    vec2 e = min(f, 1.0 - f);
    float edge = smoothstep(0.0, 0.09, min(e.x, e.y));
    // (very light on flat grass so a meadow doesn't look like tiles)
    float edgeAmt = green && n.y > 0.5 ? 0.05 : 0.14;
    diffuseColor.rgb *= 1.0 - edgeAmt + edgeAmt * edge;
}`);
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
