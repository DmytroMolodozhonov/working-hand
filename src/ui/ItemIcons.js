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

    /**
     * Make the queued pictures, `budget` ms at most this frame (at least one). In play a picture is made in two steps
     * (WebGL2): this frame it is drawn and its pixels are asked for — without waiting (a pixel buffer and a fence); a
     * later frame, when the video card has done it, they are taken and the picture is packed by the browser off the
     * frame (toBlob). Read at once (readRenderTargetPixels) the processor waited for the card to finish everything it
     * had — the frame's whole picture too — and then packed a PNG: a frame of 46–140 ms each time a new wand came into
     * the hand (a duel's «Акцио»), in «магия и оружие».
     */
    update(budget = 2) {
        if (this._pending && !this._poll()) return 0; // (the card has not done the last one yet: nothing new meanwhile)
        if (!this.queue.length) return 0;
        const t0 = performance.now();
        let n = 0;
        while (this.queue.length && !this._pending && (n === 0 || performance.now() - t0 < budget)) {
            const { k, it } = this.queue.shift();
            if (!this.cache.has(k)) this._make(k, it);
            if (!this._pending) this.queued.delete(k);
            n++;
        }
        if (n && !this._pending) this.onReady?.();
        return n;
    }

    /** The loading screen: these things' pictures made now, all of them (Game.warmUp) — read at once, it may wait. */
    warm(items) {
        for (const it of items) this.url(it);
        this._sync = true;
        try { this.update(Infinity); } finally { this._sync = false; }
    }

    /** The asked-for pixels of the picture being made: ready → taken, the picture packed (→ true: the next may start). */
    _poll() {
        const P = this._pending, gl = this.renderer.getContext();
        if (gl.isContextLost()) { this._pending = null; this.queued.delete(P.k); return true; } // (the card's buffers are gone: made again when asked)
        if (gl.getSyncParameter(P.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return false; // (never read before: that is the very wait this avoids)
        this._pending = null;
        gl.deleteSync(P.sync);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, P.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._buf);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.deleteBuffer(P.pbo);
        this.queued.delete(P.k);
        try { this._pack(P.k, true); } catch (e) { console.warn('[ItemIcons]', P.k, e); this.failed.add(P.k); }
        return true;
    }

    _store(k, url) {
        this.cache.set(k, url);
        if (this.cache.size > ICON_CACHE_MAX) {
            const old = this.cache.keys().next().value, u = this.cache.get(old);
            this.cache.delete(old);
            if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u); // (a picture already shown stays shown)
        }
    }

    /** The same, a few pictures at a time with the thread given back between (the loading screen stays alive). */
    async warmAsync(items, budget = 12) {
        for (const it of items) this.url(it);
        while (this.queue.length) {
            this.update(budget);
            await new Promise((r) => setTimeout(r, 0));
        }
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
            if (!this._draw(made.m, k)) { this.failed.add(k); return; }
        } catch (e) {
            console.warn('[ItemIcons]', k, e);
            this.failed.add(k);
        } finally {
            if (made?.m) { made.m.parent?.remove(made.m); if (!made.keep) this.dispose?.(made.m); }
        }
    }

    /**
     * One model into a picture: turned so its long side goes across the cell, a little from above. → false: nothing to
     * draw. The picture comes into the cache at once (the loading screen, no WebGL2) or a few frames later (_poll).
     */
    _draw(m, k) {
        const r = this.renderer, scene = this._scene, cam = this._cam;
        const pivot = new THREE.Group();
        const pos = m.position.clone(), quat = m.quaternion.clone();
        m.position.set(0, 0, 0);
        m.quaternion.identity();
        pivot.add(m);
        const box = new THREE.Box3();
        pivot.updateMatrixWorld(true);
        seenBox(m, box);
        if (box.isEmpty()) { pivot.remove(m); m.position.copy(pos); m.quaternion.copy(quat); return false; }
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
        const gl = r.getContext();
        const later = !this._sync && r.capabilities?.isWebGL2 && typeof gl.fenceSync === 'function';
        try {
            r.setRenderTarget(this._rt);
            r.setClearColor(0x000000, 0);
            r.autoClear = true;
            r.clear();
            r.render(scene, cam);
            if (later) {
                // (asked for, not waited for: the pixels go into a buffer of the card's; a fence says when they are there)
                const pbo = gl.createBuffer();
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
                gl.bufferData(gl.PIXEL_PACK_BUFFER, SIZE * SIZE * 4, gl.STREAM_READ);
                gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, 0);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                gl.flush();
                this._pending = { k, pbo, sync, t: performance.now() };
            } else r.readRenderTargetPixels(this._rt, 0, 0, SIZE, SIZE, this._buf);
        } finally {
            r.setRenderTarget(prevRT);
            r.setClearColor(prevColor, prevAlpha);
            r.autoClear = prevAuto;
            scene.remove(pivot);
            pivot.remove(m);
            m.position.copy(pos);
            m.quaternion.copy(quat);
        }
        if (!later) this._pack(k, false);
        return true;
    }

    /**
     * The read pixels (this._buf) into the cell's picture. `later`: packed by the browser off the frame (toBlob — the
     * canvas is copied at the call), the cache and the slots get it when it is ready; else at once (a data URL).
     */
    _pack(k, later) {
        // (made half as big here, on the processor, each picture's pixel the mean of four — weighed by how opaque they are, as a
        // smooth scale draws it — and turned up the right way (the GL picture is upside down); the small canvas lives in the
        // processor's memory (willReadFrequently): no call waits on the video card, as a card-backed canvas's drawImage did)
        const out = this._ctx || (this._ctx = this._out.getContext('2d', { willReadFrequently: true }));
        const img = this._img || (this._img = out.createImageData(OUT, OUT)), d = img.data, b = this._buf, row = SIZE * 4;
        for (let y = 0; y < OUT; y++) {
            const r0 = (SIZE - 1 - 2 * y) * row, r1 = r0 - row;
            for (let x = 0; x < OUT; x++) {
                const i0 = r0 + x * 8, i1 = r1 + x * 8;
                const a0 = b[i0 + 3], a1 = b[i0 + 7], a2 = b[i1 + 3], a3 = b[i1 + 7], a = a0 + a1 + a2 + a3, o = (y * OUT + x) * 4;
                if (a === 0) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
                for (let c = 0; c < 3; c++) d[o + c] = (b[i0 + c] * a0 + b[i0 + 4 + c] * a1 + b[i1 + c] * a2 + b[i1 + 4 + c] * a3) / a;
                d[o + 3] = (a + 2) >> 2;
            }
        }
        out.putImageData(img, 0, 0);
        if (!later || typeof this._out.toBlob !== 'function') { this._store(k, this._out.toDataURL('image/png')); if (later) this.onReady?.(); return; }
        this._out.toBlob((blob) => {
            if (!blob) { this.failed.add(k); return; }
            this._store(k, URL.createObjectURL(blob));
            this.onReady?.();
        }, 'image/png');
    }

    dispose() {
        const P = this._pending;
        if (P) { const gl = this.renderer.getContext(); gl.deleteSync(P.sync); gl.deleteBuffer(P.pbo); this._pending = null; }
        this._rt?.dispose();
        this.cache.clear();
        this.queue.length = 0;
        this.queued.clear();
    }
}
