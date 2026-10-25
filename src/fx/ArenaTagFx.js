/**
 * ArenaTagFx.js — the sign over a duellist at the arena (ArenaTag.js; Creative only): big, readable from the stands, above
 * his head. One sprite and one small canvas per sign (two at most per computer, kept and reused); the picture is redrawn only
 * when its numbers change; no light, no new materials after the first.
 */
import * as THREE from 'three';
import { RANK_COLOR, tagKey } from '../game/ArenaTag.js';

class Sign {
    constructor(scene) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512; this.canvas.height = 192;
        this.tex = new THREE.CanvasTexture(this.canvas);
        this.tex.colorSpace = THREE.SRGBColorSpace;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
        this.sprite.scale.set(8, 3, 1);
        this.sprite.renderOrder = 999;
        this.sprite.visible = false;
        this.key = '';
        scene.add(this.sprite);
    }

    draw(t) {
        const k = tagKey(t);
        if (k === this.key) return;
        this.key = k;
        const c = this.canvas.getContext('2d'), col = RANK_COLOR[t.rank] || '#fff';
        c.clearRect(0, 0, 512, 192);
        c.fillStyle = 'rgba(14,10,28,0.72)'; c.strokeStyle = col; c.lineWidth = 6;
        c.beginPath(); c.roundRect(6, 6, 500, 180, 28); c.fill(); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = col; c.font = 'bold 62px sans-serif'; c.fillText(t.title, 256, 50);
        // the mana bar and its numbers
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(30, 96, 452, 26);
        c.fillStyle = '#3d8bff'; c.fillRect(30, 96, 452 * (t.max > 0 ? Math.min(1, t.mana / t.max) : 0), 26);
        c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.fillText(`Мана ${t.mana} / ${t.max}`, 256, 109);
        c.fillStyle = '#ffe28a'; c.font = 'bold 36px sans-serif'; c.fillText(`Сила ${t.power} · мастерство ${t.mastery}`, 256, 156);
        this.tex.needsUpdate = true;
    }

    dispose(scene) { scene.remove(this.sprite); this.tex.dispose(); this.sprite.material.dispose(); }
}

export class ArenaTagFx {
    constructor(game) { this.game = game; this.signs = []; }

    /** `list`: [{tag, x, y, z}] to show (at most 2); the rest hidden. */
    show(list) {
        const sc = this.game.scene;
        for (let i = 0; i < Math.max(list.length, this.signs.length); i++) {
            const it = list[i];
            if (!it) { if (this.signs[i]) this.signs[i].sprite.visible = false; continue; }
            if (!this.signs[i]) { if (typeof document === 'undefined') return; this.signs[i] = new Sign(sc); }
            const s = this.signs[i];
            s.draw(it.tag);
            s.sprite.position.set(it.x, it.y + 8, it.z);
            s.sprite.visible = true;
        }
    }

    dispose() { for (const s of this.signs) s.dispose(this.game.scene); this.signs.length = 0; }
}
