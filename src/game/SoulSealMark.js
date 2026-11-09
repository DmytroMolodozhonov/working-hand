/** One small shared white seal stays on the corpse and later on its bones. No light per body. */
import * as THREE from 'three';
const geo = new THREE.BoxGeometry(0.65, 0.045, 0.09);
const mat = new THREE.MeshBasicMaterial({ color: 0xffe8a1 });
geo.userData.shared = true; mat.userData.shared = true;
export function markSoulSeal(b) {
    if (!b.seal) return;
    const root = b.model || b.bones?.children[0];
    if (!root || b.sealVisual?.parent === root) return;
    b.sealVisual?.parent?.remove(b.sealVisual);
    const g = b.sealVisual = new THREE.Group();
    g.name = 'soul-seal'; g.position.y = b.model ? 0.6 : 0.48;
    for (const angle of [0, Math.PI / 2, Math.PI / 4]) { const m = new THREE.Mesh(geo, mat); m.rotation.y = angle; g.add(m); }
    root.add(g);
    b.one?.check(true); b.bonesOne?.check(true);
}
