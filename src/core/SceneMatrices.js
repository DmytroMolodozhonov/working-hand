/**
 * SceneMatrices — the scene's matrices each frame, only where they are needed.
 *
 * three.js (r128) recomputes the world matrix of EVERY object of the scene each frame, hidden ones too: in a castle
 * with 60 people that was ~3700 objects (after a battle, bodies and things — 7000–10000), a quarter of the drawing's
 * processor time (the author's journal: «графика» 15–28 ms with 500–1000 draws). Here:
 *  - a hidden branch (visible = false) is not recomputed — it is not drawn and casts no shadow; the moment it is shown
 *    it is recomputed with the rest (marked). A part hidden by FarShape (userData.farHid) IS recomputed: it is a bone
 *    of the one shape that draws it;
 *  - a branch marked userData.matFrozen (a person out of the picture whose pose waits — CastleLife) keeps its matrices
 *    as they were: nobody sees it, and the moment it comes into view the mark is gone and it is recomputed at once;
 *  - the scene itself never moves (scene.matrixAutoUpdate = false — Game): its children are not forced, so a still
 *    thing (matrixAutoUpdate = false) costs nothing.
 * Code that needs a hidden object's place asks getWorldPosition / updateWorldMatrix (they recompute from the parents),
 * as everywhere in three.js; the world's ray tests are on the blocks (TerrainData.raycast), not on the meshes.
 */
import * as THREE from 'three';

let installed = false;

/** On by default; window.__ZNS_ALL_MATRICES__ = true before the start — the old way (to compare). */
export function installSceneMatrices() {
    if (installed || (typeof window !== 'undefined' && window.__ZNS_ALL_MATRICES__)) return;
    installed = true;
    const base = THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld = function updateMatrixWorld(force) {
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
            if (this.parent === null) this.matrixWorld.copy(this.matrix);
            else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            this.matrixWorldNeedsUpdate = false;
            force = true;
        }
        const ch = this.children;
        for (let i = 0, n = ch.length; i < n; i++) {
            const c = ch[i];
            const ud = c.userData;
            if ((c.visible || ud.farHid) && !ud.matFrozen) c.updateMatrixWorld(force);
            else c.matrixWorldNeedsUpdate = true; // (recomputed the moment it is shown again)
        }
    };
    THREE.Object3D.prototype.updateMatrixWorld.base = base;
}
