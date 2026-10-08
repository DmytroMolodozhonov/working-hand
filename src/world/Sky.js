/**
 * Sky.js — a painted sky instead of a flat grey-blue ball.
 *
 * One big sphere that travels with the player, drawn by a small shader:
 *   - a gradient from deep blue overhead to a bright, warm horizon,
 *   - the sun (direction of the scene's sunlight) with a soft glow,
 *   - soft clouds that slowly drift (a few layers of noise),
 *   - at night: a dark sky, a moon and twinkling stars.
 * The fog uses the horizon colour, so far mountains melt into the sky.
 */

import * as THREE from 'three';

export const SKY_DAY = {
    zenith: new THREE.Color(0x2f6fd8),
    horizon: new THREE.Color(0xcfe8ff),
    ground: new THREE.Color(0x9fc6e8),
    fog: 0xc3e0fb,
};

export const SKY_NIGHT = {
    zenith: new THREE.Color(0x02040a),
    horizon: new THREE.Color(0x0b1424),
    ground: new THREE.Color(0x05080f),
    fog: 0x05070c,
};

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uNight;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}

void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Sky gradient (a little brighter and warmer right at the horizon)
    vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
    col = mix(col, uGround, smoothstep(0.0, -0.25, h));
    float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
    // Sun: glow + disc (moon at night)
    vec3 sunCol = mix(vec3(1.0, 0.93, 0.78), vec3(0.75, 0.82, 1.0), uNight);
    col += sunCol * pow(sunAmt, 8.0) * mix(0.35, 0.08, uNight);
    col += sunCol * pow(sunAmt, 64.0) * mix(0.6, 0.15, uNight);
    col = mix(col, sunCol * mix(1.6, 0.9, uNight), smoothstep(0.9985, 0.9992, sunAmt));
    // Clouds: projected on a high flat layer, drifting
    if (h > 0.01) {
        vec2 uv = d.xz / (h + 0.08) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float c = fbm(uv);
        c = smoothstep(0.48, 0.78, c) * smoothstep(0.01, 0.22, h);
        vec3 cloudLit = mix(vec3(1.0), vec3(1.0, 0.95, 0.88), pow(sunAmt, 4.0));
        vec3 cloudCol = mix(cloudLit, vec3(0.25, 0.28, 0.35), uNight * 0.85);
        if (c > 0.002) {
            float shade = 0.82 + 0.18 * fbm(uv * 1.7 + 3.0);
            col = mix(col, cloudCol * shade, c * mix(0.85, 0.35, uNight));
        }
    }
    // Stars at night
    if (uNight > 0.01 && h > 0.0) {
        vec2 sp = d.xz / (h + 0.3) * 120.0;
        float s = step(0.9975, hash(floor(sp)));
        float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp)) * 40.0);
        col += vec3(s * tw) * uNight * smoothstep(0.0, 0.3, h);
    }
    gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
    constructor(scene) {
        this.uniforms = {
            uZenith: { value: SKY_DAY.zenith.clone() },
            uHorizon: { value: SKY_DAY.horizon.clone() },
            uGround: { value: SKY_DAY.ground.clone() },
            uSunDir: { value: new THREE.Vector3(0.45, 0.6, 0.35) },
            uTime: { value: 0 },
            uNight: { value: 0 },
        };
        const mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
        });
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
        this.mesh.renderOrder = -10;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    get position() {
        return this.mesh.position;
    }

    setNight(night) {
        const p = night ? SKY_NIGHT : SKY_DAY;
        this.uniforms.uZenith.value.copy(p.zenith);
        this.uniforms.uHorizon.value.copy(p.horizon);
        this.uniforms.uGround.value.copy(p.ground);
        this.uniforms.uNight.value = night ? 1 : 0;
    }

    setSunDirection(v) {
        this.uniforms.uSunDir.value.copy(v).normalize();
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
    }
}
