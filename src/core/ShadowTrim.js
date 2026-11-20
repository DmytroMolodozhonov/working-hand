/**
 * ShadowTrim.js — the hero's own shadow is drawn with few draws (the author 14.11: «FPS не должен проседать»).
 *
 * Found by `creativebench --hero`: the dressed hero is ~140 parts and ~90 of them cast shadows, and he is always inside the sun's shadow box —
 * the shadow pass drew all ~90 every frame (a quarter of all the draws of the frame, each a call into the driver). Small details — a buckle,
 * a coin of the belt, a strand of hair, a ring, a finger's bone — cast a shadow nobody can tell from the body's: the skill «optimization»
 * already says «мелкие детали (меньше ~0,3 м) castShadow = false». Here every part of the hero that is smaller than `MIN` metres in its longest
 * side stops casting; the big ones stay (the body, the head, the limbs, a cloak, a robe, a hat's brim: the silhouette is the same). The
 * body's own boxes are all bigger than that. Looked at again now and then (`EVERY` s): a new coat, a new armour piece, a picked-up thing
 * gets its own small parts trimmed too.
 *
 * Skinned / instanced parts (FarShape) are not touched: they are one draw already.
 */
import * as THREE from 'three';

export const SHADOW_TRIM = { MIN: 0.9, EVERY: 1 };
const _sz = new THREE.Vector3();

/** Every small casting part under `root` stops casting. → how many were switched off this time (pure but for the meshes). */
export function trimShadowCasters(root, min = SHADOW_TRIM.MIN) {
    let off = 0;
    root.traverse((m) => {
        if (!m.isMesh || !m.castShadow || m.isSkinnedMesh || m.isInstancedMesh || m.name === 'head-shadow' || m.userData.keepShadow) return; // (keepShadow: a part that is small in itself but scaled up by its parent — the wings: the author 20.11, no wing shadow in flight)
        let big = m.userData._shadowBig;
        if (big === undefined) {
            const g = m.geometry;
            if (!g) return;
            if (!g.boundingBox) g.computeBoundingBox();
            g.boundingBox.getSize(_sz);
            big = m.userData._shadowBig = Math.max(_sz.x * Math.abs(m.scale.x), _sz.y * Math.abs(m.scale.y), _sz.z * Math.abs(m.scale.z)) >= min;
        }
        if (!big) { m.castShadow = false; off++; }
    });
    return off;
}
