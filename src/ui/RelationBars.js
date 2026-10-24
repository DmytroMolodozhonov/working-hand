/**
 * RelationBars.js — the Sims-like bars over the person I talk to: Подчинение, Дружба, Любовь (src/game/Relations.js). One sprite for
 * the whole game, moved to the person (the author: «взаимоотношения будет видно… плюс три к дружбе… если там ноль, то ничего не
 * пишется — полоса появляется, только когда у тебя есть взаимоотношения»). A bar at zero is not drawn at all. The picture is redrawn
 * only when something changed (the numbers or a fading "+3").
 */

import * as THREE from 'three';

const W = 256, ROW = 30, PAD = 8;
const COLORS = { sub: ['#3b6fb5', '#b5423b'], fr: ['#3ba55c', '#b5423b'], lv: ['#e0558f', '#e0558f'] };

export class RelationBars {
    constructor(scene) {
        this.scene = scene;
        this.sprite = null;
        this.key = '';
        this.flash = []; // {key, d, t}
        this.shownFor = null;
    }

    _make() {
        if (this.sprite || typeof document === 'undefined') return !!this.sprite;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = ROW * 3 + PAD * 2;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
        sprite.renderOrder = 999;
        sprite.visible = false;
        this.scene.add(sprite);
        this.canvas = canvas; this.tex = tex; this.sprite = sprite;
        return true;
    }

    /** A change to show ("+3" by the bar): kinds 'sub' | 'fr' | 'lv'. */
    pop(key, d) {
        if (!d) return;
        this.flash.push({ key, d, t: 2.6 });
        if (this.flash.length > 6) this.flash.shift();
        this.key = '';
    }

    /**
     * Each frame: show `bars` ([{key,label,value}], empty → hidden) over the point (x, y, z), or hide (bars null).
     */
    update(dt, bars, x, y, z, id) {
        if (!this.sprite && !(bars && bars.length) && !this.flash.length) return;
        for (const f of this.flash) f.t -= dt;
        this.flash = this.flash.filter((f) => f.t > 0);
        const rows = bars ? bars.slice() : [];
        // (a bar that just changed from zero to something: drawn while its "+3" flies, even if the number rounds to 0)
        if (!rows.length) { if (this.sprite) this.sprite.visible = false; return; }
        if (!this._make()) return;
        const key = `${id}|${rows.map((r) => r.key + r.value).join(',')}|${this.flash.map((f) => f.key + f.d + Math.ceil(f.t * 2)).join(',')}`;
        if (key !== this.key) { this.key = key; this._draw(rows); }
        this.sprite.visible = true;
        this.sprite.position.set(x, y, z);
        this.sprite.scale.set(3.4, 3.4 * this.canvas.height / W, 1);
    }

    _draw(rows) {
        const c = this.canvas.getContext('2d');
        const h = rows.length * ROW + PAD * 2;
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const y0 = this.canvas.height - h;
        c.fillStyle = 'rgba(16,14,20,0.72)';
        c.beginPath(); c.roundRect?.(2, y0, W - 4, h, 10); if (!c.roundRect) c.rect(2, y0, W - 4, h); c.fill();
        c.font = 'bold 15px sans-serif'; c.textBaseline = 'middle';
        rows.forEach((r, i) => {
            const y = y0 + PAD + i * ROW + ROW / 2;
            c.fillStyle = '#e8e2d4'; c.textAlign = 'left';
            c.fillText(r.label, 14, y);
            // the bar: from the middle, to the right (good) or to the left (bad); love only to the right
            const bx = 112, bw = 100, bh = 12;
            c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(bx, y - bh / 2, bw, bh);
            const neg = r.value < 0, cols = COLORS[r.key] || COLORS.fr;
            c.fillStyle = neg ? cols[1] : cols[0];
            if (r.key === 'lv') c.fillRect(bx, y - bh / 2, bw * r.value / 100, bh);
            else if (neg) c.fillRect(bx + bw / 2 + bw / 2 * r.value / 100, y - bh / 2, -bw / 2 * r.value / 100, bh);
            else c.fillRect(bx + bw / 2, y - bh / 2, bw / 2 * r.value / 100, bh);
            if (r.key !== 'lv') { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(bx + bw / 2 - 1, y - bh / 2 - 2, 2, bh + 4); }
            c.fillStyle = '#fff'; c.textAlign = 'left';
            c.fillText(String(r.value), bx + bw + 8, y);
            // a fading change
            const f = this.flash.filter((q) => q.key === r.key).pop();
            if (f) { c.fillStyle = f.d > 0 ? '#ffe27a' : '#ff8a7a'; c.globalAlpha = Math.min(1, f.t); c.fillText((f.d > 0 ? '+' : '') + f.d, bx + bw + 40, y); c.globalAlpha = 1; }
        });
        this.tex.needsUpdate = true;
    }

    dispose() {
        if (!this.sprite) return;
        this.scene.remove(this.sprite);
        this.sprite.material.map?.dispose(); this.sprite.material.dispose();
        this.sprite = null;
    }
}
