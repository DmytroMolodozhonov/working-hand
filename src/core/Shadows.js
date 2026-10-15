/**
 * Shadows only near the player: every caster is drawn a second time into
 * the shadow map, so the far ones (people, animals, chests…) don't cast.
 */
import * as THREE from 'three';

export const SHADOW_NEAR = 30; // m

/** Turn an object's shadows on / off (remembers which meshes cast at all). */
export function setNearShadow(obj, on) {
    if (obj.userData._shadowOn === on) return;
    obj.userData._shadowOn = on;
    obj.traverse((m) => {
        if (!m.isMesh) return;
        if (m.userData._cs === undefined) m.userData._cs = m.castShadow;
        m.castShadow = on && m.userData._cs;
    });
}

/**
 * The sun's shadow covers only a box around the player. Three.js cuts the
 * shadow off with a hard straight line at the box's edge, and in fast flight
 * that line sweeps over a village: the shadows "draw themselves" strip by
 * strip. Instead, the shadow fades out smoothly over the last part of the box,
 * so new shadows come in softly (like things out of the fog), with no line.
 * Patches the shader text once, before any material is compiled.
 */
export const SHADOW_EDGE_FADE = 0.15; // part of the box (on each side) where the shadow fades in
const END = '\t\t}\n\t\treturn shadow;\n\t}\n\tvec2 cubeToUV';
export function patchShadowEdgeFade(chunks = THREE.ShaderChunk) {
    const src = chunks && chunks.shadowmap_pars_fragment;
    if (typeof src !== 'string' || src.includes('zns_edge') || !src.includes(END)) return false;
    chunks.shadowmap_pars_fragment = src.replace(END,
        '\t\t\tvec2 zns_edge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );\n' +
        `\t\t\tshadow = mix( 1.0, shadow, smoothstep( 0.0, ${SHADOW_EDGE_FADE.toFixed(3)}, min( zns_edge.x, zns_edge.y ) ) );\n` +
        END);
    return true;
}
patchShadowEdgeFade();
