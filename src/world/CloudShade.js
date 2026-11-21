/**
 * CloudShade.js — the shadows of clouds drifting over the land (the author 21.11: «на простор, на поляну… слишком игрушечно»):
 * by day wide soft patches of shade slide slowly over the meadows, the hills and the woods, as under a real summer sky —
 * the land is never lit all alike. Only the sun's light is dimmed there (the sky's light stays): the same as a real cloud.
 * Pure shader (a two-octave noise of the world's x, z moving with the wind): no texture, no extra draw, nothing in the frame
 * but two numbers. World.update moves it; at night, in hell, in caves, off the Earth `k` is 0 (no cost: the branch skips it).
 */
export const CLOUD_SHADE = { t: { value: 0 }, k: { value: 0 } };

/** How strong by day (0…1: the share of the sun's light a cloud's shadow takes away) and how fast it drifts (m/s). */
export const CLOUD_RULES = { K: 0.5, SPEED: 2.6, SIZE: 85 };

export const CLOUD_SHADE_GLSL = /* glsl */ `
uniform float uCloudT;
uniform float uCloudK;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudShade(vec2 xz) {
    if (uCloudK <= 0.0) return 1.0;
    vec2 p = (xz + vec2(uCloudT * ${CLOUD_RULES.SPEED.toFixed(2)}, uCloudT * ${(CLOUD_RULES.SPEED * 0.37).toFixed(2)})) / ${CLOUD_RULES.SIZE.toFixed(1)};
    float n = cloudNoise(p) * 0.62 + cloudNoise(p * 2.7 + 5.3) * 0.28 + cloudNoise(p * 7.1 - 2.1) * 0.1;
    return 1.0 - uCloudK * smoothstep(0.5, 0.7, n);
}
`;

/** Puts the two numbers into a shader (onBeforeCompile). */
export function addCloudUniforms(shader) {
    shader.uniforms.uCloudT = CLOUD_SHADE.t;
    shader.uniforms.uCloudK = CLOUD_SHADE.k;
}

/** Each frame (World.update): the drift, and how strong — by the day's light, none at night / in hell / under ground. */
export function stepClouds(dt, day, on) {
    CLOUD_SHADE.t.value = (CLOUD_SHADE.t.value + dt) % 100000;
    const want = on ? CLOUD_RULES.K * Math.max(0, Math.min(1, day)) : 0;
    const k = CLOUD_SHADE.k.value;
    CLOUD_SHADE.k.value = k + (want - k) * Math.min(1, dt * 0.8);
    if (CLOUD_SHADE.k.value < 0.002) CLOUD_SHADE.k.value = 0;
}
