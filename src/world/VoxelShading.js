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
