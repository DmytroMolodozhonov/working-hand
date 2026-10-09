/**
 * Shadows only near the player: every caster is drawn a second time into
 * the shadow map, so the far ones (people, animals, chests…) don't cast.
 */

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
