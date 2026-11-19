// CounterTrays.js — the rune tray on a counter's coin plate (StallZones.js): a flat, softly glowing violet plate with a golden rune circle and a low rim,
// drawn on the counters that are not built with a plate of their own blocks (the wizards' lane of generation ≥ 34 has one). One shared texture, one
// material, one unit geometry (scaled), a mesh per stall near the player — put away when the place goes to sleep (CastleLife._sleep). A picture only:
// no collision, it does not change how things lie (the coin lies on the counter under it, 3 cm lower).
import * as THREE from 'three';
import { zonesOf } from './StallZones.js';

let _mat = null, _rimMat = null, _geo = null;
function mats() {
    if (_mat) return { mat: _mat, rim: _rimMat, geo: _geo };
    let map = null;
    if (typeof document !== 'undefined') {
        const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
        const x = cv.getContext('2d');
        const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
        g.addColorStop(0, '#5a2f8a'); g.addColorStop(0.7, '#3a1d63'); g.addColorStop(1, '#27143f');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
        x.strokeStyle = '#e7c35a'; x.lineWidth = 3;
        x.beginPath(); x.arc(S / 2, S / 2, 40, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.arc(S / 2, S / 2, 30, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * 30, S / 2 + Math.sin(a) * 30); x.lineTo(S / 2 + Math.cos(a + Math.PI / 3) * 30, S / 2 + Math.sin(a + Math.PI / 3) * 30); x.stroke(); }
        x.fillStyle = '#f4dd8a'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.arc(S / 2 + Math.cos(a) * 40, S / 2 + Math.sin(a) * 40, 2.6, 0, Math.PI * 2); x.fill(); }
        x.strokeStyle = '#cfa8ff'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(S / 2, S / 2 - 14); x.lineTo(S / 2 + 12, S / 2 + 10); x.lineTo(S / 2 - 12, S / 2 + 10); x.closePath(); x.stroke();
        map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
    }
    _mat = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : 0x4a2a78, emissive: 0x2a1450, emissiveIntensity: 0.55 });
    _rimMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a, emissive: 0x1a1008 });
    _geo = new THREE.BoxGeometry(1, 1, 1);
    _geo.userData = { shared: true, keep: true };
    return { mat: _mat, rim: _rimMat, geo: _geo };
}

export class CounterTrays {
    constructor(game) { this.game = game; this.map = new Map(); }

    /** The tray of a stall (key: its record key), made once while the place is awake. No tray where the plate is real blocks. */
    ensure(key, stall) {
        if (this.map.has(key)) return;
        const z = zonesOf(stall);
        if (!z.pay || z.explicit) { this.map.set(key, null); return; }
        const { mat, rim, geo } = mats(), P = z.pay, g = new THREE.Group();
        const w = P.x1 - P.x0 + 1, d = P.z1 - P.z0 + 1;
        const plate = new THREE.Mesh(geo, mat); plate.scale.set(w - 0.3, 0.05, d - 0.3); plate.position.y = 0.03; g.add(plate);
        // (a low rim along the plate's edges: the long outer side and the two ends; the side towards the goods is open)
        const along = (stall.counter.x1 - stall.counter.x0) >= (stall.counter.z1 - stall.counter.z0);
        const edge = (sx, sz, px, pz) => { const m = new THREE.Mesh(geo, rim); m.scale.set(sx, 0.13, sz); m.position.set(px, 0.07, pz); g.add(m); };
        if (along) { edge(0.1, d - 0.3, w / 2 - 0.2, 0); edge(w - 0.3, 0.1, 0, d / 2 - 0.2); edge(w - 0.3, 0.1, 0, -d / 2 + 0.2); }
        else { edge(w - 0.3, 0.1, 0, d / 2 - 0.2); edge(0.1, d - 0.3, w / 2 - 0.2, 0); edge(0.1, d - 0.3, -w / 2 + 0.2, 0); }
        g.position.set((P.x0 + P.x1) / 2, P.top + 0.005, (P.z0 + P.z1) / 2);
        g.userData.shared = true;
        this.game.scene.add(g);
        this.map.set(key, g);
    }

    drop(key) { const g = this.map.get(key); if (g) this.game.scene.remove(g); this.map.delete(key); }
    dropAll() { for (const k of [...this.map.keys()]) this.drop(k); }
    /** A sample for the loading screen (the material's shader). */
    sampleModel() { const { mat, geo } = mats(); const m = new THREE.Mesh(geo, mat); m.scale.setScalar(0.01); return m; }
}
