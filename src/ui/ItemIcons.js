/**
 * ItemIcons.js — the pictures of the things in the slots under the fatigue bar (and in the «hand» cell).
 *
 * The author: «многие обозначаются просто как смайлики, а должны обозначаться прямо как предметы, которыми
 * они являются — палочки-то волшебные разные бывают». So each thing is shown as itself: a small picture of
 * its own 3D model (ItemTypes.makeItemModel / WeaponModels.buildWeapon) with its colours and materials —
 * the wand of its wood and shape, a scroll with its ribbon, a potion of its colour, the sword or the axe…
 *
 * Made once per LOOK of a thing (iconKey: its kind and the few whole-number / name properties its model is
 * drawn by — never fractional numbers or ids, so the cache stays small) and kept as a data URL:
 *   - the common ones on the loading screen (warm: Game.warmUp);
 *   - a new look met in play — queued and made one by one, a couple of milliseconds a frame at most
 *     (update(budget)): until then the slot shows the old emoji.
 * Drawn with the game's own renderer into a small render target (the materials' shaders are the ones
 * compiled while loading: the icon scene's lights are made once, never changed).
 */

import * as THREE from 'three';

/** The properties a thing's model is drawn by (all whole numbers, flags or names). */
const LOOK = ['model', 'color', 'plain', 'staff', 'dragon', 'type', 'magic', 'spell', 'stat', 'piece', 'named', 'archmage', 'of', 'rec', 'ward', 'swift', 'cooked'];

/** At most this many pictures are kept (a look not seen for long is made again if it comes back). */
export const ICON_CACHE_MAX = 160;

/**
 * The picture's key: one per look (two wands of other woods — two keys; two pouches of other counts — one).
 * Pure (tests). null: nothing to draw.
 */
export function iconKey(it) {
    if (!it || !it.kind) return null;
    let k = it.kind;
    if (it.kind === 'book') return k + '|' + (it.ward || it.spells?.includes?.('ProtectionHouse') ? 'w' : it.swift || it.spells?.includes?.('Flight') ? 's' : Math.abs(it.id | 0 || 1) % 64);
    if (it.kind === 'coins') return k + (it.magic ? '|m' : ''); // (its count only changes its size)
    if (it.kind === 'weapon') return k + '|' + (it.type || 'sword');
    for (const p of LOOK) {
        const v = it[p];
        if (v == null || v === false) continue;
        // (numbers: whole ones only — a colour, a model number; a fraction is never a key)
        if (typeof v === 'number') { if (Number.isInteger(v)) k += '|' + p + v; continue; }
        if (typeof v === 'string' && v.length <= 40) k += '|' + p + v;
        else if (v === true) k += '|' + p;
    }
    return k;
}

const _b = new THREE.Box3();

/** The box of what is really seen of a model (not its hidden parts, a glow round it, a light's place). */
function seenBox(root, out) {
    out.makeEmpty();
    root.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        const mt = o.material;
        if (mt && (mt.blending === THREE.AdditiveBlending || (mt.transparent && mt.opacity < 0.35) || mt.visible === false)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        out.union(_b);
    });
    return out;
}

const SIZE = 160; // px drawn (then made smaller: smooth edges)
const OUT = 80; // px of the picture

export class ItemIcons {
    /**
     * `renderer` — the game's WebGLRenderer; `makeModel(it)` → THREE.Object3D; `buildWeapon(type, renderer)` →
     * {group}; `dispose(model)`; `onReady()` — called when new pictures are ready (the slots are drawn again).
     */
    constructor(renderer, { makeModel, buildWeapon = null, dispose = null, onReady = null } = {}) {
        this.renderer = renderer;
        this.makeModel = makeModel;
        this.buildWeapon = buildWeapon;
        this.dispose = dispose;
        this.onReady = onReady;
        this.cache = new Map(); // key -> data URL
        this.queue = [];
        this.queued = new Set();
        this.failed = new Set(); // (a model that cannot be drawn: the emoji stays)
        this._scene = null;
    }

    /** The picture of this thing (a data URL), or null — then it is made soon (the emoji meanwhile). */
    url(it) {
        const k = iconKey(it);
        if (!k) return null;
        const u = this.cache.get(k);
        if (u) return u;
        if (!this.queued.has(k) && !this.failed.has(k) && this.renderer) {
            this.queued.add(k);
            this.queue.push({ k, it: { ...it } });
        }
        return null;
    }

    /** Make the queued pictures, `budget` ms at most this frame (at least one). */
    update(budget = 2) {
        if (!this.queue.length) return 0;
        const t0 = performance.now();
        let n = 0;
        while (this.queue.length && (n === 0 || performance.now() - t0 < budget)) {
            const { k, it } = this.queue.shift();
            this.queued.delete(k);
            if (!this.cache.has(k)) this._make(k, it);
            n++;
        }
        if (n) this.onReady?.();
        return n;
    }

    /** The loading screen: these things' pictures made now, all of them (Game.warmUp). */
    warm(items) {
        for (const it of items) this.url(it);
        this.update(Infinity);
    }

    _setup() {
        if (this._scene) return;
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.62));
        const key = new THREE.DirectionalLight(0xffffff, 0.95);
        key.position.set(1.2, 2, 2.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xbfd4ff, 0.35);
        rim.position.set(-2, 0.5, -1.5);
        scene.add(rim);
        this._scene = scene;
        this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
        this._rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { format: THREE.RGBAFormat });
        this._buf = new Uint8Array(SIZE * SIZE * 4);
        this._big = document.createElement('canvas');
        this._big.width = this._big.height = SIZE;
        this._out = document.createElement('canvas');
        this._out.width = this._out.height = OUT;
    }

    _model(it) {
        if (it.kind === 'weapon') {
            if (!this.buildWeapon) return null;
            if (!this._weapons) this._weapons = new Map(); // (a sword and an axe: their models kept — two at most)
            let m = this._weapons.get(it.type);
            if (!m) { m = this.buildWeapon(it.type || 'sword', this.renderer).group; this._weapons.set(it.type, m); }
            return { m, keep: true };
        }
        return { m: this.makeModel(it), keep: false };
    }

    _make(k, it) {
        let made = null;
        try {
            if (typeof document === 'undefined') return;
            this._setup();
            made = this._model(it);
            if (!made?.m) { this.failed.add(k); return; }
            const url = this._draw(made.m);
            if (!url) { this.failed.add(k); return; }
            this.cache.set(k, url);
            if (this.cache.size > ICON_CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
        } catch (e) {
            console.warn('[ItemIcons]', k, e);
            this.failed.add(k);
        } finally {
            if (made?.m) { made.m.parent?.remove(made.m); if (!made.keep) this.dispose?.(made.m); }
        }
    }

    /** One model into a picture: turned so its long side goes across the cell, a little from above. */
    _draw(m) {
        const r = this.renderer, scene = this._scene, cam = this._cam;
        const pivot = new THREE.Group();
        const pos = m.position.clone(), quat = m.quaternion.clone();
        m.position.set(0, 0, 0);
        m.quaternion.identity();
        pivot.add(m);
        const box = new THREE.Box3();
        pivot.updateMatrixWorld(true);
        seenBox(m, box);
        if (box.isEmpty()) { pivot.remove(m); m.position.copy(pos); m.quaternion.copy(quat); return null; }
        const s = box.getSize(new THREE.Vector3());
        // a long thing (a wand, a sword, a scroll, a staff) lies aslant; the rest — a little turned, seen from above
        const long = Math.max(s.x, s.y, s.z), across = Math.max(1e-3, Math.min(s.x, s.y, s.z));
        if (long / across > 2.6) {
            if (s.y >= s.x && s.y >= s.z) pivot.rotation.set(0.2, 0.5, -0.78);
            else if (s.x >= s.z) pivot.rotation.set(0.35, 0.3, 0.6);
            else pivot.rotation.set(0.35, Math.PI / 2 + 0.3, 0.6);
        } else pivot.rotation.set(0.45, -0.55, 0);
        scene.add(pivot);
        pivot.updateMatrixWorld(true);
        seenBox(m, box);
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const half = Math.max(size.x, size.y) * 0.56 || 0.5;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; // (round the camera, which is set over the middle)
        cam.position.set(c.x, c.y, box.max.z + 5);
        cam.near = 0.01; cam.far = 10 + size.z;
        cam.lookAt(c.x, c.y, c.z);
        cam.updateProjectionMatrix();
        const prevRT = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
        const prevAuto = r.autoClear;
        try {
            r.setRenderTarget(this._rt);
            r.setClearColor(0x000000, 0);
            r.autoClear = true;
            r.clear();
            r.render(scene, cam);
            r.readRenderTargetPixels(this._rt, 0, 0, SIZE, SIZE, this._buf);
        } finally {
            r.setRenderTarget(prevRT);
            r.setClearColor(prevColor, prevAlpha);
            r.autoClear = prevAuto;
            scene.remove(pivot);
            pivot.remove(m);
            m.position.copy(pos);
            m.quaternion.copy(quat);
        }
        // (the GL picture is upside down)
        const ctx = this._big.getContext('2d'), img = ctx.createImageData(SIZE, SIZE), row = SIZE * 4;
        for (let y = 0; y < SIZE; y++) img.data.set(this._buf.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
        ctx.putImageData(img, 0, 0);
        const out = this._out.getContext('2d');
        out.clearRect(0, 0, OUT, OUT);
        out.imageSmoothingEnabled = true;
        out.imageSmoothingQuality = 'high';
        out.drawImage(this._big, 0, 0, OUT, OUT);
        return this._out.toDataURL('image/png');
    }

    dispose() {
        this._rt?.dispose();
        this.cache.clear();
        this.queue.length = 0;
        this.queued.clear();
    }
}
