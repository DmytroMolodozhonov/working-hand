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
import { ULTRA_PARS, addUltraUniforms } from './UltraUniforms.js';

const COLOR_FRAG = `#include <color_fragment>
// (a river's face colour is its flow, not a colour: its own murky green instead)
#if defined( USE_COLOR )
fwRiver = vColor.b < 0.02 ? 1.0 : 0.0;
if (fwRiver > 0.5) { fwFlow = normalize(vColor.rg * 2.0 - 1.0 + vec2(1e-4)); diffuseColor.rgb = vec3(0.16, 0.3, 0.27); }
#endif
`;

const WATER_FRAG = `
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
        g = (F * sin(q.y * 3.1 + sin(q.x * 1.7) * 1.2) * 0.07 + S * sin(q.x * 4.3 + q.y * 0.9) * 0.03)
          + (F * sin(q.y * 7.7 + q.x * 2.1 - ut * 1.1) * 0.03);
        // threads of foam and the riffles' white water, carried along
        float th = sin(q.x * 6.0 + sin(q.y * 0.7) * 2.0) * 0.5 + 0.5;
        float rif = sin(q.y * 0.9 + sin(q.x * 0.6) * 3.0) * sin(q.x * 1.3 + 1.7) ;
        foam = smoothstep(0.93, 1.0, th) * (0.4 + 0.6 * smoothstep(0.2, 0.8, rif)) + smoothstep(0.75, 0.95, rif) * 0.35 * (0.5 + 0.5 * sin(q.y * 9.0));
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
    vec3 body = gl_FragColor.rgb * (fwRiver > 0.5 ? 1.0 : mix(vec3(1.0), vec3(0.75, 0.85, 0.7), 0.4)); // (a lake's water: darker green-brown in itself)
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
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vUltraWorld;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvUltraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vUltraWorld;\nfloat fwRiver = 0.0;\nvec2 fwFlow = vec2(0.0, 1.0);\n' + ULTRA_PARS)
            .replace('#include <color_fragment>', COLOR_FRAG)
            .replace('#include <fog_fragment>', WATER_FRAG);
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (key ? key() : material.type) + '-freshw2';
    return material;
}
