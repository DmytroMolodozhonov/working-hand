/**
 * UltraUniforms.js — the numbers «Ультра качество» shares with the world's shaders.
 *
 * The sky, the sea, the lakes, the land and the grass always carry the ultra code in their (one,
 * compiled-at-loading) programs; it runs only while `on` is 1 — switching the mode changes these
 * numbers, never a shader (no rebuild, no stutter). With the mode off the branch is skipped.
 * Filled each frame by Ultra.js (only while on).
 */
import * as THREE from 'three';

export const ULTRA = {
    on: { value: 0 },
    time: { value: 0 },
    wet: { value: 0 }, // rain on the land: 0 dry … 1 soaked (dries slowly after the rain)
    zenith: { value: new THREE.Color(0x2f6fd8) },
    horizon: { value: new THREE.Color(0xcfe8ff) },
    sunDir: { value: new THREE.Vector3(0.45, 0.6, 0.35) }, // the sun, or the moon at night (the light in the sky)
    sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    sunVis: { value: 1 }, // how much of it shines (0 behind rain clouds, under the horizon)
    player: { value: new THREE.Vector3(0, -1e4, 0) }, // (the grass bends away from the feet)
};

/** The uniforms' GLSL declarations (one line each, for onBeforeCompile). */
export const ULTRA_PARS = `
uniform float uUltraOn;
uniform float uUltraTime;
uniform float uUltraWet;
uniform vec3 uUltraZenith;
uniform vec3 uUltraHorizon;
uniform vec3 uUltraSunDir;
uniform vec3 uUltraSunCol;
uniform float uUltraSunVis;
uniform vec3 uUltraPlayer;
// the sky seen in a mirror (water, wet stones): its gradient and the sun's glow
vec3 ultraSky(vec3 r) {
    vec3 c = mix(uUltraHorizon, uUltraZenith, pow(clamp(r.y, 0.0, 1.0), 0.5));
    float s = max(dot(r, normalize(uUltraSunDir)), 0.0);
    return c + uUltraSunCol * (pow(s, 12.0) * 0.35) * uUltraSunVis;
}
float ultraHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// rain drops falling in a puddle: rings spreading from random points (a normal's tilt)
vec2 ultraRain(vec2 p, float t) {
    vec2 tilt = vec2(0.0);
    for (int k = 0; k < 2; k++) {
        vec2 q = p * (2.2 + float(k) * 1.3) + float(k) * 7.31;
        vec2 cell = floor(q), f = fract(q) - 0.5;
        float h = ultraHash(cell + float(k) * 13.0);
        vec2 o = vec2(ultraHash(cell + 3.1), ultraHash(cell + 5.7)) - 0.5;
        vec2 d = f - o * 0.6;
        float ph = fract(t * (0.9 + h * 0.6) + h);
        float r = length(d);
        float ring = sin((r - ph * 0.45) * 55.0) * (1.0 - ph) * smoothstep(ph * 0.45 + 0.08, ph * 0.45, r) * smoothstep(0.0, 0.05, r);
        tilt += d / max(r, 1e-3) * ring;
    }
    return tilt;
}
`;

/** Puts the ultra uniforms into a shader (onBeforeCompile). */
export function addUltraUniforms(shader) {
    shader.uniforms.uUltraOn = ULTRA.on;
    shader.uniforms.uUltraTime = ULTRA.time;
    shader.uniforms.uUltraWet = ULTRA.wet;
    shader.uniforms.uUltraZenith = ULTRA.zenith;
    shader.uniforms.uUltraHorizon = ULTRA.horizon;
    shader.uniforms.uUltraSunDir = ULTRA.sunDir;
    shader.uniforms.uUltraSunCol = ULTRA.sunCol;
    shader.uniforms.uUltraSunVis = ULTRA.sunVis;
    shader.uniforms.uUltraPlayer = ULTRA.player;
}
