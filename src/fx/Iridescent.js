/**
 * Iridescent.js — a shimmering material (the clever owl's plumage, its feather — Owls.js): the colour
 * runs through the rainbow with the angle of view and slowly with the time, like a soap bubble or a
 * peacock's neck. No light of its own; one clock uniform for all (IR.uIrTime — the owls move it), so
 * the shader is compiled once (Game.prewarm) and never rebuilt.
 */

import * as THREE from 'three';

/** The shimmer's clock (one for every owl and every feather: one uniform, the shader never rebuilt). */
export const IR = { uIrTime: { value: 0 }, uIrGlow: { value: 0.1 } };

/**
 * A material whose colour shimmers through the rainbow with the angle of view and slowly with the
 * time (thin-film like a soap bubble, a peacock's neck): `k` how much, the base colour under it.
 */
export function irMaterial(color, k, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25, ...extra });
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uIrTime = IR.uIrTime;
        shader.uniforms.uIrGlow = IR.uIrGlow;
        shader.fragmentShader = 'uniform float uIrTime;\nuniform float uIrGlow;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            {
                vec3 Vw = normalize(vViewPosition);
                float fr = 1.0 - abs(dot(normal, Vw));
                float h = uIrTime * 0.04 + fr * 0.85 + dot(normal, vec3(0.13, 0.21, 0.07));
                vec3 ir = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.45 + 1.25 * ir), ${k.toFixed(2)});
                totalEmissiveRadiance += ir * (0.04 + fr * fr * 0.5) * uIrGlow * ${(k * 2).toFixed(2)};
            }
            #include <emissivemap_fragment>`);
    };
    m.customProgramCacheKey = () => 'owlIr' + k.toFixed(2) + (extra.vertexColors ? 'v' : '') + (extra.side === THREE.DoubleSide ? 'd' : '');
    m.userData.shared = true;
    return m;
}

