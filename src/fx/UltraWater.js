/**
 * UltraWater.js — water in «Ультра качество» (the sea's waves, lakes and rivers): the sky mirrored
 * in it (strong at a glancing look, clear water looking down — the Fresnel law), small ripples
 * running over it, the sun's (or moon's) glittering path, and rings of rain drops in a storm.
 * Added to the material's own program at loading (`uUltraOn` = 0: skipped).
 */
import { ULTRA_PARS, addUltraUniforms } from './UltraUniforms.js';

const WATER_FRAG = `
if (uUltraOn > 0.5) {
    vec3 uwN = normalize((vec4(normal, 0.0) * viewMatrix).xyz); // (view → world)
    uwN.y = abs(uwN.y);
    vec2 up = vUltraWorld.xz;
    float ut = uUltraTime;
    vec2 g = vec2(cos(dot(up, vec2(0.9, 0.4)) * 2.3 + ut * 1.9), cos(dot(up, vec2(-0.5, 0.8)) * 2.9 + ut * 2.3)) * 0.05
        + vec2(sin(dot(up, vec2(0.3, -1.1)) * 5.1 - ut * 3.1), sin(dot(up, vec2(1.2, 0.7)) * 4.3 + ut * 2.7)) * 0.028
        + vec2(sin(dot(up, vec2(2.1, 1.3)) * 9.0 + ut * 4.3), cos(dot(up, vec2(-1.7, 2.2)) * 8.0 - ut * 3.9)) * 0.012;
    g += ultraRain(up, ut) * 0.14 * uUltraWet;
    vec3 un = normalize(uwN + vec3(g.x, 0.0, g.y));
    vec3 uV = normalize(vUltraWorld - cameraPosition);
    float ufr = 0.02 + 0.98 * pow(1.0 - clamp(dot(-uV, un), 0.0, 1.0), 5.0);
    vec3 uR = reflect(uV, un);
    uR.y = abs(uR.y);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * mix(1.0, 0.85, ufr), ultraSky(uR), clamp(ufr * 1.1, 0.0, 0.82));
    float usg = max(dot(uR, normalize(uUltraSunDir)), 0.0);
    gl_FragColor.rgb += uUltraSunCol * (pow(usg, 900.0) * 7.0 + pow(usg, 80.0) * 0.35) * uUltraSunVis;
    gl_FragColor.a = mix(gl_FragColor.a, 1.0, ufr * 0.6);
}
#include <fog_fragment>`;

/** Adds the ultra water to a Phong water material (keeps its own onBeforeCompile and cache key). */
export function applyUltraWater(material) {
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (before) before.call(material, shader, renderer);
        addUltraUniforms(shader);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vUltraWorld;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvUltraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vUltraWorld;\n' + ULTRA_PARS)
            .replace('#include <fog_fragment>', WATER_FRAG);
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (key ? key() : material.type) + '-ultraw';
    return material;
}
