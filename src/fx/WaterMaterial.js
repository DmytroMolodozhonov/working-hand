/**
 * WaterMaterial.js — living water for the water-bending spells.
 *
 * A plain sphere looks like glass. Real water held by magic never stops
 * moving, so the material (Phong lighting kept) adds in the shaders:
 *   - a surface that keeps rippling and bulging (several travelling waves),
 *     with normals recomputed from the moving surface so highlights slide
 *     over it,
 *   - stretching: when the ball is moved it drags a tail behind and
 *     flattens at the front,
 *   - a bright fresnel rim and edges more opaque than the middle (water
 *     looks thicker at grazing angles),
 *   - moving caustic-like light patches inside.
 * Ice uses the same shape code with time stopped (the water is frozen
 * exactly as it was) and flat shading for a crystalline look.
 */

import * as THREE from 'three';

const NOISE = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform vec3 uStretchDir;
uniform float uStretch;
vec3 waterShape(vec3 p, vec3 ph) {
    vec3 n = normalize(p);
    // each instance (blob) moves on its own
    float t = uTime + dot(ph, vec3(1.37, 0.71, 1.13));
    float w = sin(n.x * 3.1 + t * 2.3) * sin(n.y * 2.7 - t * 1.7) * sin(n.z * 3.3 + t * 2.9);
    w += 0.55 * sin(n.x * 6.3 - t * 3.1 + n.y * 4.0) * sin(n.z * 5.7 + t * 2.2);
    w += 0.25 * sin(n.y * 11.0 + t * 5.3 + n.x * 3.0) * sin(n.z * 9.0 - t * 4.1);
    vec3 q = p * (1.0 + uWobble * w);
    // Drag: the back stretches into a tail, the front flattens a little
    float s = dot(n, uStretchDir);
    q += uStretchDir * uStretch * (s < 0.0 ? s * 1.2 : -s * 0.35);
    return q;
}
`;

/**
 * @param {object} o
 *   ice: frozen look (time stopped, flat shading)
 *   blocks: for instanced formed blocks (small wobble, no sphere maths)
 */
export function createWaterMaterial({ ice = false, blocks = false } = {}) {
    const mat = new THREE.MeshPhongMaterial(ice
        ? { color: 0xa9dcff, emissive: 0x1d4a66, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.84, flatShading: true }
        : { color: 0x3aa0ff, emissive: 0x08264d, specular: 0xffffff, shininess: 130, transparent: true, opacity: 0.6, depthWrite: false });
    const uniforms = {
        uTime: { value: 0 },
        uWobble: { value: ice ? 0.08 : 0.09 },
        uStretchDir: { value: new THREE.Vector3(0, -1, 0) },
        uStretch: { value: 0 },
        uRim: { value: ice ? new THREE.Color(0x9fe6ff) : new THREE.Color(0x6fc3ff) },
    };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${NOISE}\nvarying vec3 vWaterPos;`)
            .replace('#include <beginnormal_vertex>', blocks ? `
                vec3 objectNormal = vec3( normal );
                #ifdef USE_TANGENT
                vec3 objectTangent = vec3( tangent.xyz );
                #endif` : `
                // Normal of the moving surface from two nearby points on it
                vec3 wph = vec3(0.0);
                #ifdef USE_INSTANCING
                wph = instanceMatrix[3].xyz;
                #endif
                vec3 wn = normalize(position);
                vec3 wt1 = normalize(cross(wn, abs(wn.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
                vec3 wt2 = cross(wn, wt1);
                vec3 wp0 = waterShape(position, wph);
                vec3 wp1 = waterShape(position + wt1 * 0.03, wph);
                vec3 wp2 = waterShape(position + wt2 * 0.03, wph);
                vec3 objectNormal = normalize(cross(wp1 - wp0, wp2 - wp0));
                if (dot(objectNormal, wn) < 0.0) objectNormal = -objectNormal;
                #ifdef USE_TANGENT
                vec3 objectTangent = vec3( tangent.xyz );
                #endif`)
            .replace('#include <begin_vertex>', blocks ? `
                vec3 transformed = vec3( position );
                #ifdef USE_INSTANCING
                vec3 wwp = (instanceMatrix * vec4(position, 1.0)).xyz;
                #else
                vec3 wwp = position;
                #endif
                // water held in a shape trembles a little
                transformed += normal * 0.045 * sin(wwp.x * 2.1 + wwp.y * 1.7 + uTime * 3.0) * sin(wwp.z * 1.9 - uTime * 2.4);
                vWaterPos = wwp;` : `
                vec3 transformed = wp0;
                vWaterPos = position;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec3 uRim;\nvarying vec3 vWaterPos;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.2);
                totalEmissiveRadiance += uRim * fres * 0.9;
                // caustic light drifting through the water
                vec3 cp = vWaterPos * 3.0;
                float ca = sin(cp.x * 2.3 + uTime * 1.9) + sin(cp.y * 2.9 - uTime * 1.3) + sin(cp.z * 2.1 + uTime * 2.6);
                totalEmissiveRadiance += vec3(0.25, 0.45, 0.6) * pow(max(0.0, ca / 3.0), 3.0) * ${ice ? '0.25' : '0.9'};
                diffuseColor.a = min(1.0, diffuseColor.a * (0.7 + 0.8 * fres));`);
    };
    // Separate shader programs for the three variants
    mat.customProgramCacheKey = () => `water-${ice ? 'ice' : 'liquid'}-${blocks ? 'blocks' : 'ball'}`;
    return mat;
}
