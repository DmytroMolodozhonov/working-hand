/**
 * LogModel.js — a real log (a trunk piece with bark and rings on its ends) for the wood in the hand and in the slots.
 * The author: «Когда я держу эти брёвна, они показываются как кубик из дерева, а должна быть текстура как бревна».
 * Sizes (a world block is 1 m): a log ≈ 1 m long, 0.26 m across. One geometry, one texture per wood colour (cached by colour — a handful).
 */
import * as THREE from 'three';

export const LOG = { LEN: 1.0, R: 0.13, SIDES: 10 };
const _cache = new Map(); // wood colour -> {side, cap}
let _geo = null;

function canvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

/** Bark: dark vertical furrows on the wood colour; the end: pale rings. */
function textures(color) {
    let t = _cache.get(color);
    if (t) return t;
    const base = new THREE.Color(color);
    const hex = (c) => '#' + c.getHexString();
    const bark = canvas(64, 64), ring = canvas(64, 64);
    t = { side: null, cap: null };
    if (bark) {
        const x = bark.getContext('2d');
        x.fillStyle = hex(base); x.fillRect(0, 0, 64, 64);
        let s = (color * 2654435761) >>> 0;
        const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < 26; i++) {
            const px = rnd() * 64, w = 1 + rnd() * 2.5, y0 = rnd() * 64, h = 14 + rnd() * 40;
            x.fillStyle = hex(base.clone().multiplyScalar(0.45 + rnd() * 0.3));
            x.fillRect(px, y0, w, h); x.fillRect(px, y0 - 64, w, h);
        }
        t.side = new THREE.CanvasTexture(bark);
        t.side.wrapS = t.side.wrapT = THREE.RepeatWrapping;
        t.side.colorSpace = THREE.SRGBColorSpace;
        const r = ring.getContext('2d');
        r.fillStyle = hex(base.clone().lerp(new THREE.Color(0xf0d9a8), 0.6)); r.fillRect(0, 0, 64, 64);
        r.strokeStyle = hex(base.clone().lerp(new THREE.Color(0xf0d9a8), 0.25)); r.lineWidth = 1.5;
        for (let k = 4; k < 32; k += 5) { r.beginPath(); r.arc(32, 32, k, 0, Math.PI * 2); r.stroke(); }
        t.cap = new THREE.CanvasTexture(ring);
        t.cap.colorSpace = THREE.SRGBColorSpace;
    }
    t.mats = [
        new THREE.MeshLambertMaterial({ color: t.side ? 0xffffff : color, map: t.side }),
        new THREE.MeshLambertMaterial({ color: t.cap ? 0xffffff : color, map: t.cap }),
        new THREE.MeshLambertMaterial({ color: t.cap ? 0xffffff : color, map: t.cap }),
    ];
    _cache.set(color, t);
    return t;
}

/** A group of 1–3 logs lying along X (a stack: side by side / one on top). */
export function logStackModel(color = 0x8b5a2b, count = 1) {
    _geo = _geo || new THREE.CylinderGeometry(LOG.R, LOG.R, LOG.LEN, LOG.SIDES, 1);
    const t = textures(color);
    const g = new THREE.Group();
    const spots = [[0, 0, 0], [0, 0, 0.25], [0, 0.22, 0.125]].slice(0, Math.max(1, Math.min(3, count)));
    spots.forEach(([x, y, z], i) => {
        const m = new THREE.Mesh(_geo, t.mats);
        m.rotation.z = Math.PI / 2;
        m.rotation.x = i * 0.7; // (a little uneven)
        m.position.set(x, y, z - (spots.length > 1 ? 0.125 : 0));
        m.userData.sharedGeo = true;
        g.add(m);
    });
    return g;
}

const _icons = new Map();
/** A picture of a log for a slot (data URL; '' without a document). */
export function logIconUrl(color) {
    if (_icons.has(color)) return _icons.get(color);
    const c = canvas(48, 48);
    let url = '';
    if (c) {
        const x = c.getContext('2d');
        const base = new THREE.Color(color), hex = (k) => '#' + k.getHexString();
        x.save(); x.translate(24, 24); x.rotate(-0.5);
        x.fillStyle = hex(base); x.fillRect(-18, -8, 30, 16);
        x.fillStyle = hex(base.clone().multiplyScalar(0.55));
        for (const dy of [-5, -1, 3, 6]) x.fillRect(-18, dy, 30, 1.5);
        x.fillStyle = hex(base.clone().lerp(new THREE.Color(0xf0d9a8), 0.6));
        x.beginPath(); x.ellipse(12, 0, 4, 8, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = hex(base.clone().multiplyScalar(0.8)); x.lineWidth = 1;
        x.beginPath(); x.ellipse(12, 0, 2, 4.5, 0, 0, Math.PI * 2); x.stroke();
        x.restore();
        url = c.toDataURL();
    }
    _icons.set(color, url);
    return url;
}
