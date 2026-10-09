/**
 * SpeechBubble.js — a comic text bubble above a 3D character.
 *
 * A THREE.Sprite with its own small CanvasTexture (512×256, redrawn only in
 * show()). The bottom tip of the bubble's tail is anchored at
 * worldPos + offsetY, so pass the centre of the speaker's head to update().
 * Add `bubble.sprite` to the scene once; it hides itself when not talking.
 *
 * In node (no `document`) it is a no-op with the same API: nothing is drawn,
 * the sprite never becomes visible, but `visible` still tells whether the
 * bubble is "speaking" (handy for game logic tests).
 */

import * as THREE from 'three';

const W = 512, H = 256; // power-of-two canvas
const FONT = 'bold 28px sans-serif';
const NAME_FONT = 'bold 22px sans-serif';
const LINE_H = 34;
const NAME_H = 28;
const PAD = 18;
const TAIL = 24;
const MAX_CHARS = 28;
const MAX_LINES = 4;
const PX = 0.0105; // world metres per canvas pixel (2 lines ≈ 1.2 m tall)
const FAR = 30; // hidden beyond this distance
const FAR_SHOUT = 85; // a shout (a battle cry) is seen this far
const NEAR_SCALE_D = 12; // beyond this the bubble grows to stay readable
const FADE_IN = 0.2, FADE_OUT = 0.4;

const css = (c, def) => (c == null ? def : typeof c === 'number' ? '#' + (c >>> 0 & 0xffffff).toString(16).padStart(6, '0') : String(c));

/** Word-wrap to at most `maxChars` per line (and the pixel width if `measure` given). */
export function wrapText(text, maxChars = MAX_CHARS, maxLines = MAX_LINES, measure = null, maxWidth = Infinity) {
    const fits = (s) => s.length <= maxChars && (!measure || measure(s) <= maxWidth);
    const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let cur = '';
    for (let w of words) {
        // break words that are too long on their own
        while (!fits(w)) {
            let n = Math.min(w.length - 1, maxChars - 1);
            while (n > 1 && !fits(w.slice(0, n) + '-')) n--;
            if (cur) { lines.push(cur); cur = ''; }
            lines.push(w.slice(0, n) + '-');
            w = w.slice(n);
        }
        const next = cur ? cur + ' ' + w : w;
        if (fits(next)) cur = next;
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (last.length && !fits(last + '…')) last = last.slice(0, -1);
        lines[maxLines - 1] = last.trimEnd() + '…';
    }
    return lines;
}

export class SpeechBubble {
    /** @param {{offsetY?: number}} [opts]  height of the tail tip above worldPos (default 1.1 m above the head centre) */
    constructor(opts = {}) {
        this.offsetY = opts.offsetY ?? 1.1;
        this.text = '';
        this.name = '';
        this._time = 0; // seconds left
        this._alpha = 0;
        this._baseW = W * PX;
        this._baseH = H * PX;
        this._headless = typeof document === 'undefined';
        if (this._headless) {
            this.canvas = null;
            this.texture = null;
            this.material = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false });
        } else {
            this.canvas = document.createElement('canvas');
            this.canvas.width = W;
            this.canvas.height = H;
            this.ctx = this.canvas.getContext('2d');
            this.texture = new THREE.CanvasTexture(this.canvas);
            this.texture.minFilter = THREE.LinearMipmapLinearFilter;
            this.texture.magFilter = THREE.LinearFilter;
            this.material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, opacity: 0, depthTest: true, depthWrite: false });
        }
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.name = 'speech-bubble';
        this.sprite.center.set(0.5, 0); // anchored at the bottom (the tail tip)
        this.sprite.renderOrder = 999;
        this.sprite.visible = false;
        this.sprite.frustumCulled = false;
        this.sprite.scale.set(this._baseW, this._baseH, 1);
    }

    /** Is the bubble speaking (shown or fading out)? */
    get visible() { return this._time > 0 || this._alpha > 0.01; }

    /**
     * @param {string} text
     * @param {{name?: string, seconds?: number, color?: number|string}} [o]  color: the name line / border tint
     */
    show(text, { name = '', seconds = 5, color, shout = false } = {}) {
        this.shout = !!shout; // (a battle cry: bigger, seen from much farther)
        this.text = String(text ?? '');
        this.name = name ? String(name) : '';
        this._time = Math.max(0.1, seconds);
        if (!this._headless) this._draw(color);
    }

    hide() { this._time = 0; }

    _draw(color) {
        const x = this.ctx;
        x.clearRect(0, 0, W, H);
        x.font = FONT;
        const lines = wrapText(this.text, MAX_CHARS, MAX_LINES, (s) => x.measureText(s).width, W - 2 * PAD - 8);
        let textW = 0;
        for (const l of lines) textW = Math.max(textW, x.measureText(l).width);
        if (this.name) { x.font = NAME_FONT; textW = Math.max(textW, x.measureText(this.name).width); }
        const bw = Math.min(W - 6, Math.max(120, textW + 2 * PAD));
        const bh = PAD * 2 + lines.length * LINE_H + (this.name ? NAME_H : 0);
        const bx = (W - bw) / 2, by = H - TAIL - bh - 3;
        const edge = css(color, '#2b2f36');
        // bubble with a tail pointing down at the centre
        const r = 22;
        x.beginPath();
        x.moveTo(bx + r, by);
        x.arcTo(bx + bw, by, bx + bw, by + bh, r);
        x.arcTo(bx + bw, by + bh, bx, by + bh, r);
        x.lineTo(W / 2 + 16, by + bh);
        x.lineTo(W / 2, H - 3);
        x.lineTo(W / 2 - 16, by + bh);
        x.arcTo(bx, by + bh, bx, by, r);
        x.arcTo(bx, by, bx + bw, by, r);
        x.closePath();
        x.fillStyle = 'rgba(255,255,255,0.95)';
        x.fill();
        x.lineWidth = this.shout ? 8 : 4;
        x.strokeStyle = this.shout ? '#b3261e' : edge;
        x.stroke();
        // text
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        let y = by + PAD;
        if (this.name) {
            x.font = NAME_FONT;
            x.fillStyle = css(color, '#2e6db4');
            x.fillText(this.name, W / 2, y + NAME_H / 2 - 2);
            y += NAME_H;
        }
        x.font = FONT;
        x.fillStyle = '#1e2228';
        for (const l of lines) { x.fillText(l, W / 2, y + LINE_H / 2); y += LINE_H; }
        this.texture.needsUpdate = true;
    }

    /**
     * @param {number} dt
     * @param {THREE.Vector3} worldPos  e.g. the speaker's head centre (VillagerModel.getHeadWorldPosition)
     * @param {THREE.Camera} [camera]   for distance scaling / hiding
     */
    update(dt, worldPos, camera) {
        dt = dt > 0 ? Math.min(dt, 0.25) : 0;
        if (this._time > 0) {
            this._time = Math.max(0, this._time - dt);
            this._alpha = Math.min(1, this._alpha + dt / FADE_IN);
        } else if (this._alpha > 0) {
            this._alpha = Math.max(0, this._alpha - dt / FADE_OUT);
        }
        const s = this.sprite;
        if (this._headless || this._alpha <= 0.01 || !worldPos) { s.visible = false; return; }
        s.position.set(worldPos.x, worldPos.y + this.offsetY, worldPos.z);
        let k = 1;
        if (camera) {
            camera.getWorldPosition(_cam);
            const d = _cam.distanceTo(s.position);
            if (d > (this.shout ? FAR_SHOUT : FAR)) { s.visible = false; return; }
            k = Math.min(this.shout ? 4 : 2.2, Math.max(1, d / NEAR_SCALE_D)) * (this.shout ? 1.3 : 1);
        }
        s.scale.set(this._baseW * k, this._baseH * k, 1);
        this.material.opacity = this._alpha;
        s.visible = true;
    }

    dispose() {
        this.sprite.parent?.remove(this.sprite);
        this.texture?.dispose();
        this.material.dispose();
    }
}

const _cam = new THREE.Vector3();
