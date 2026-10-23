/**
 * EnchantGlow.js — the look of an enchanted thing («Пентаграмма зачарования», Enchant.js): a thin shell of
 * light with a pattern of runes round it, in the colour of its level (lilac, violet, gold, pearly white; a
 * higher level — a brighter shell and a second, counter-turning pattern). No new light: the shells are additive
 * meshes of ONE shared sphere and four shared materials (made once, texture in the cache), so a hundred
 * enchanted things cost a hundred small draws and never a shader. Used by makeItemModel (in the hand, on the
 * ground), Weapon (the blade) and ArmorLook (the body). `glowSamples()` goes to Game.prewarm.
 */
import * as THREE from 'three';
import { ENCHANT_TIERS } from '../game/Enchant.js';

let _geo = null, _tex = null;
const _mats = [];
const _box = new THREE.Box3(), _size = new THREE.Vector3(), _ctr = new THREE.Vector3();

/** The rune pattern: a band of angular signs, thin lines, a few sparks (drawn once, 256×128). */
function runeTexture() {
    if (_tex) return _tex;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round';
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let row = 0; row < 3; row++) {
        const y0 = 22 + row * 40;
        g.globalAlpha = 0.45; g.beginPath(); g.moveTo(0, y0 + 18); g.lineTo(256, y0 + 18); g.stroke();
        g.globalAlpha = 0.9;
        for (let i = 0; i < 8; i++) { // a rune: 3–4 strokes in a 20×22 cell
            const x = 8 + i * 31 + rnd() * 4, n = 3 + (rnd() * 2 | 0);
            g.beginPath();
            let px = x, py = y0 + (rnd() * 18);
            g.moveTo(px, py);
            for (let k = 0; k < n; k++) { px = x + rnd() * 20; py = y0 + rnd() * 22; g.lineTo(px, py); }
            g.stroke();
            if (rnd() < 0.4) { g.beginPath(); g.arc(x + 10, y0 + 28 + rnd() * 3, 1.6, 0, 6.3); g.fill(); }
        }
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) { g.globalAlpha = 0.4 + rnd() * 0.6; g.fillRect(rnd() * 256, rnd() * 128, 2, 2); }
    _tex = new THREE.CanvasTexture(c);
    _tex.wrapS = _tex.wrapT = THREE.RepeatWrapping;
    _tex.repeat.set(2, 1);
    return _tex;
}

export function glowMaterial(tier) {
    const t = Math.max(0, Math.min(3, tier | 0));
    if (!_mats[t]) {
        _mats[t] = new THREE.MeshBasicMaterial({ map: runeTexture(), color: ENCHANT_TIERS[t].color, transparent: true, opacity: 0.2 + t * 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
        _mats[t].userData.shared = true;
    }
    return _mats[t];
}

function shellGeo() {
    if (!_geo) { _geo = new THREE.SphereGeometry(1, 14, 10); _geo.userData.shared = true; }
    return _geo;
}

/** One shell round `size` (a Vector3 box) centred at `ctr`; a higher level adds a second one turned the other way. */
export function glowShell(tier, size, ctr) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(shellGeo(), glowMaterial(tier));
    m.scale.set(size.x * 0.62, size.y * 0.62, size.z * 0.62);
    m.renderOrder = 5; m.frustumCulled = true;
    g.add(m);
    if (tier >= 2) {
        const m2 = new THREE.Mesh(shellGeo(), glowMaterial(tier));
        m2.scale.copy(m.scale).multiplyScalar(0.86);
        m2.rotation.set(0.6, 1.2, 0.3);
        m2.renderOrder = 5;
        g.add(m2);
    }
    g.position.copy(ctr);
    g.userData.enchGlow = true;
    return g;
}

/** Put the shell on a model (a thing in the hand / on the ground): its box at the identity transform. */
export function addEnchantGlow(model, ench) {
    if (!ench || model.userData.enchGlow) return model;
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    if (_box.isEmpty()) return model;
    _box.getSize(_size); _box.getCenter(_ctr);
    // (the model is still unscaled and at the origin here: its box is its own space)
    const g = glowShell(ench.tier, _size, _ctr);
    model.add(g);
    model.userData.enchGlow = g;
    return model;
}

/** The body: a shell round the torso and one round the head (Character parts, ~1.5 × 1.9 and 1.7). */
export function addBodyGlow(ch, tier, list) {
    const mk = (parent, sx, sy, sz, cy) => {
        if (!parent) return;
        const g = glowShell(tier, _size.set(sx, sy, sz), _ctr.set(0, cy, 0));
        parent.add(g);
        list?.push(g);
    };
    mk(ch.torso, 1.9, 2.3, 1.4, 0.1);
    mk(ch.head, 1.9, 1.9, 1.9, 0.25);
}

/** The shells for Game.prewarm: all four levels (the same material shaders, compiled before play). */
export function glowSamples() {
    const out = [];
    for (let t = 0; t < 4; t++) out.push(glowShell(t, _size.set(1, 1, 1), _ctr.set(0, 0, 0)));
    return out;
}
