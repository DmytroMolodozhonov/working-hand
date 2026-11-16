/**
 * UltraWater.js — the lakes' and rivers' water (the sea has its own surface: SeaSurface.js), every quality (the author 05.11: «озёра и
 * реки… не в том же стиле, всё-таки они не море»):
 *   - a LAKE is still: a mirror — the sky and the shores reflected strongly at a glancing look (the Fresnel law), clear looking down,
 *     only the faintest ripples drifting over it, the sun's glitter small and sharp; near the eye the water darker green-brown;
 *   - a RIVER flows: its face colour carries the way it runs (Terrain._flowOf: r, g the direction, b = 1 the mark); ripples, bright
 *     streaks and threads of foam slide downstream at the current's speed, the riffles break white here and there (where the bed is
 *     rough), the water murkier green; the sky's reflection broken by the current.
 * «Ультра качество» adds the rain's rings. Added to the material's own program at loading.
 */
import * as THREE from 'three';
import { ULTRA_PARS, addUltraUniforms } from './UltraUniforms.js';

// One small shared noise map, made once. Two filtered reads replace the river's repeating stripes;
// no new draw calls, render passes or per-frame texture work (128² RGBA, ~85 KB with mipmaps).
let rippleMap;
function ripples() {
    if (rippleMap) return rippleMap;
    const data = new Uint8Array(128 * 128 * 4);
    let seed = 17321;
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed >>> 24; }
    const t = rippleMap = new THREE.DataTexture(data, 128, 128, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
}

const COLOR_FRAG = `#include <color_fragment>
// (a river's face colour is its flow, not a colour: its own murky green instead)
#if defined( USE_COLOR )
fwFall = (vColor.b > 0.0059 && vColor.b < 0.0098) ? 1.0 : 0.0; // (a waterfall's sheet: blue byte 2; the red byte is its phase)
fwPhase = vColor.r * 9.0;
fwRiver = (vColor.b < 0.0059 && fwFall < 0.5) ? 1.0 : 0.0;
if (fwFall > 0.5) { diffuseColor.rgb = vec3(0.5, 0.74, 0.82); }
if (fwRiver > 0.5) { fwFlow = normalize(vColor.rg * 2.0 - 1.0 + vec2(1e-4)); diffuseColor.rgb = vec3(0.16, 0.3, 0.27); }
#endif
`;

const WATER_FRAG = `
if (fwFall > 0.5) {
    // A WATERFALL's sheet: streaks that run down at two speeds, bright broken ribs, foam where it lands, a milky body
    vec3 fN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    vec2 tang = normalize(vec2(-fN.z, fN.x) + vec2(1e-4));
    float along = dot(vUltraWorld.xz, tang), fy = vUltraWorld.y, ft = uUltraTime;
    vec4 fa = texture2D(uFreshRipple, vec2(along * 0.31 + fwPhase, fy * 0.05 + ft * 0.85));
    vec4 fb = texture2D(uFreshRipple, vec2(along * 0.83 + 3.1 + fwPhase * 0.3, fy * 0.1 + ft * 1.6));
    vec4 fc = texture2D(uFreshRipple, vec2(along * 2.1 - fwPhase, fy * 0.22 + ft * 2.7));
    float streak = fa.r * 0.5 + fb.g * 0.3 + fc.b * 0.2;
    float rib = smoothstep(0.46, 0.8, streak);
    float foot = 1.0 - smoothstep(0.4, 2.6, fy + 0.5);
    float lit = 0.72 + 0.28 * max(0.0, uUltraSunCol.r * uUltraSunVis + 0.45);
    vec3 fdeep = vec3(0.42, 0.68, 0.78), fpale = vec3(0.93, 0.98, 1.0);
    vec3 fcol = mix(fdeep, fpale, clamp(rib * 0.9 + 0.12 + foot * 0.4, 0.0, 1.0));
    fcol = mix(fcol, vec3(1.0), foot * (0.35 + 0.5 * fb.r));
    gl_FragColor = vec4(fcol * lit, clamp(0.5 + rib * 0.42 + foot * 0.3, 0.0, 0.96));
} else
{
    vec3 uwN = normalize((vec4(normal, 0.0) * viewMatrix).xyz); // (view → world)
    bool top = uwN.y > 0.5;
    uwN.y = abs(uwN.y);
    vec2 up = vUltraWorld.xz;
    float ut = uUltraTime;
    vec2 g;
    float foam = 0.0;
    if (fwRiver > 0.5) {
        // the current: everything slides downstream (≈ 1.6 m/s), stretched along the flow
        vec2 F = fwFlow, S = vec2(-F.y, F.x);
        vec2 q = vec2(dot(up, S), dot(up, F) - ut * 1.6);
        vec4 broad = texture2D(uFreshRipple, q * vec2(0.055, 0.022));
        vec4 fine = texture2D(uFreshRipple, q * vec2(0.19, 0.11) + broad.rg * 0.035 + vec2(0.13, ut * 0.001));
        vec2 tilt = (broad.rg - 0.5) * 0.055 + (fine.rg - 0.5) * 0.025;
        g = S * tilt.x + F * tilt.y;
        // Sparse broken foam patches, never continuous parallel white ribs across the river.
        foam = smoothstep(0.74, 0.94, broad.b) * smoothstep(0.65, 0.9, fine.b) * 0.22;
        if (!top) foam *= 0.3;
    } else {
        // the lake: the faintest drifting ripples — a mirror
        g = vec2(cos(dot(up, vec2(0.9, 0.4)) * 1.3 + ut * 0.6), cos(dot(up, vec2(-0.5, 0.8)) * 1.7 + ut * 0.7)) * 0.012
          + vec2(sin(dot(up, vec2(0.3, -1.1)) * 3.1 - ut * 1.1), sin(dot(up, vec2(1.2, 0.7)) * 2.7 + ut * 0.9)) * 0.007;
    }
    if (uUltraOn > 0.5) g += ultraRain(up, ut) * 0.14 * uUltraWet;
    vec3 un = normalize(uwN + vec3(g.x, 0.0, g.y));
    vec3 uV = normalize(vUltraWorld - cameraPosition);
    float ufr = 0.02 + 0.98 * pow(1.0 - clamp(dot(-uV, un), 0.0, 1.0), 5.0);
    vec3 uR = reflect(uV, un);
    uR.y = abs(uR.y);
    float mirror = fwRiver > 0.5 ? 0.6 : 0.92; // (a still lake mirrors the most)
    vec3 body = gl_FragColor.rgb * (fwRiver > 0.5 ? vec3(1.0) : vec3(0.62, 0.74, 0.65)); // (darker lake water; the sky still reflects at grazing angles)
    gl_FragColor.rgb = mix(body * mix(1.0, 0.85, ufr), ultraSky(uR), clamp(ufr * (fwRiver > 0.5 ? 0.9 : 1.15), 0.0, mirror));
    float usg = max(dot(uR, normalize(uUltraSunDir)), 0.0);
    gl_FragColor.rgb += uUltraSunCol * (pow(usg, fwRiver > 0.5 ? 300.0 : 1400.0) * (fwRiver > 0.5 ? 3.0 : 8.0) + pow(usg, 80.0) * 0.25) * uUltraSunVis;
    vec3 foamC = vec3(0.86, 0.92, 0.9) * (0.45 + 0.55 * max(0.0, uUltraSunCol.r * uUltraSunVis + 0.35));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, foamC, clamp(foam, 0.0, 0.8));
    gl_FragColor.a = clamp(mix(gl_FragColor.a, 1.0, ufr * 0.6 + foam * 0.6), 0.0, 1.0);
}
#include <fog_fragment>`;

/** The lakes' and rivers' water on a Phong water material (keeps its own onBeforeCompile and cache key). */
export function applyUltraWater(material) {
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (before) before.call(material, shader, renderer);
        addUltraUniforms(shader);
        shader.uniforms.uFreshRipple = { value: ripples() };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vUltraWorld;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvUltraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform sampler2D uFreshRipple;\nvarying vec3 vUltraWorld;\nfloat fwRiver = 0.0;\nfloat fwFall = 0.0;\nfloat fwPhase = 0.0;\nvec2 fwFlow = vec2(0.0, 1.0);\n' + ULTRA_PARS)
            .replace('#include <color_fragment>', COLOR_FRAG)
            .replace('#include <fog_fragment>', WATER_FRAG);
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (key ? key() : material.type) + '-freshw4';
    return material;
}
