/**
 * Hud.js — in-game HUD, damage flash, FPS counter and minimap.
 * DOM elements are looked up once (the original queried them every frame).
 */

export class Hud {
    constructor() {
        this.el = {
            hud: document.getElementById('hud'),
            hpText: document.getElementById('hp-text'),
            hpFill: document.getElementById('hp-bar-fill'),
            hpContainer: document.getElementById('hp-container'),
            kills: document.getElementById('kill-count'),
            punches: document.getElementById('punch-count'),
            fps: document.getElementById('fps-counter'),
            flash: document.getElementById('damage-flash'),
            voice: document.getElementById('voice-debug'),
            mp: document.getElementById('mp-hud'),
            minimap: document.getElementById('minimap'),
        };
        this.mmCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
        this.terrainImage = null;
        this._lastFps = -1;
        this._lastVoice = '';
    }

    show(visible) {
        this.el.hud.classList.toggle('hidden', !visible);
    }

    setHpVisible(v) {
        this.el.hpContainer?.classList.toggle('hidden', !v);
    }

    update(hp, maxHp, kills, punches) {
        this.el.hpText.textContent = `HP: ${hp}/${maxHp}`;
        this.el.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
        this.el.kills.textContent = kills;
        this.el.punches.textContent = punches;
    }

    setFps(fps, aiFps = 0) {
        const key = fps * 1000 + aiFps;
        if (key === this._lastFps) return;
        this._lastFps = key;
        // "ИИ" = how many times per second the camera pose is recognised
        this.el.fps.innerText = aiFps ? `FPS: ${fps} | ИИ: ${aiFps}` : `FPS: ${fps}`;
        this.el.fps.style.color = fps > 50 ? '#00ff00' : (fps > 25 ? '#ffff00' : '#ff0000');
    }

    damageFlash() {
        const f = this.el.flash;
        if (!f) return;
        f.classList.remove('hidden');
        f.classList.remove('active');
        void f.offsetWidth;
        f.classList.add('active');
    }

    setVoice(html, show = true) {
        const v = this.el.voice;
        if (!v) return;
        if (show) {
            v.classList.remove('hidden');
            v.style.display = 'block';
            if (html !== this._lastVoice) { v.innerHTML = html; this._lastVoice = html; }
        } else {
            v.classList.add('hidden');
            v.style.display = 'none';
        }
    }

    voiceText() {
        return this.el.voice ? this.el.voice.innerHTML : '';
    }

    setMultiplayer(html) {
        if (!this.el.mp) return;
        if (!html) { this.el.mp.classList.add('hidden'); return; }
        this.el.mp.classList.remove('hidden');
        if (this.el.mp.innerHTML !== html) this.el.mp.innerHTML = html;
    }

    /** Pre-render the terrain height map once (mountains drawn grey). */
    setTerrain(terrain) {
        this.terrainImage = null;
        if (!terrain) return;
        const d = terrain.data;
        const size = d.size;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const top = d.topLayer(x - d.half, z - d.half);
                const i = (z * size + x) * 4;
                if (top >= 1) {
                    const v = Math.min(255, 90 + top * 7);
                    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 150;
                } else if (top < 0) {
                    img.data[i] = 60; img.data[i + 1] = 40; img.data[i + 2] = 20; img.data[i + 3] = 150;
                } else {
                    img.data[i + 3] = 0;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        this.terrainImage = { canvas, half: d.half, version: d.version, terrain };
    }

    drawMinimap(charPos, rotY, world, zombies, others = []) {
        const ctx = this.mmCtx;
        if (!ctx) return;
        const cvs = this.el.minimap;
        const W = cvs.width;
        const radius = W / 2;
        const scale = 2.0;
        ctx.clearRect(0, 0, W, W);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, W);
        ctx.save();
        ctx.translate(radius, radius);

        if (this.terrainImage) {
            // Refresh after explosions (cheap: only when terrain changed)
            if (this.terrainImage.version !== this.terrainImage.terrain.data.version) this.setTerrain(this.terrainImage.terrain);
            const ti = this.terrainImage;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(ti.canvas, (-ti.half - charPos.x - 0.5) * scale, (-ti.half - charPos.z - 0.5) * scale, ti.canvas.width * scale, ti.canvas.height * scale);
        }

        ctx.fillStyle = '#2ecc71';
        if (world && world.trees) {
            for (const t of world.trees) {
                if (t.alive === false) continue;
                const dx = (t.x - charPos.x) * scale, dy = (t.z - charPos.z) * scale;
                if (dx * dx + dy * dy < radius * radius) { ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill(); }
            }
        }
        ctx.fillStyle = '#e74c3c';
        for (const z of zombies) {
            if (z.isDead) continue;
            const zx = (z.group.position.x - charPos.x) * scale, zz = (z.group.position.z - charPos.z) * scale;
            if (zx * zx + zz * zz < radius * radius) { ctx.beginPath(); ctx.arc(zx, zz, 3, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.fillStyle = '#3498db';
        for (const o of others) {
            const ox = (o.x - charPos.x) * scale, oz = (o.z - charPos.z) * scale;
            if (ox * ox + oz * oz < radius * radius) { ctx.beginPath(); ctx.arc(ox, oz, 4, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.rotate(-rotY);
        ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
        ctx.restore();
    }
}
