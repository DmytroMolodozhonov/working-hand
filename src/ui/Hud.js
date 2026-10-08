/**
 * Hud.js — in-game HUD, damage flash, FPS counter and minimap.
 * DOM elements are looked up once (the original queried them every frame).
 */

const MINIMAP_WINDOW = 128; // m of terrain drawn around the player
const BLOCK_LEAVES = 7; // Terrain BLOCK.LEAVES

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
            fatigue: document.getElementById('fatigue-container'),
            fatigueFill: document.getElementById('fatigue-fill'),
            fatigueText: document.getElementById('fatigue-text'),
            status: document.getElementById('pvp-status'),
            frozen: document.getElementById('frozen-overlay'),
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

    /**
     * Свободный мир: a clean screen — no kill / punch counters, and the corner
     * shows only «FPS: N».
     */
    setMinimal(on) {
        this.minimal = !!on;
        for (const id of ['kill-count', 'punch-count']) {
            const p = document.getElementById(id)?.parentElement;
            if (p) p.style.display = on ? 'none' : '';
        }
        this._lastFps = null;
    }

    setFps(fps, aiFps = 0, quality = '', spike = '') {
        if (this.minimal) { aiFps = 0; quality = ''; spike = ''; }
        const key = `${fps}|${aiFps}|${quality}|${spike}`;
        if (key === this._lastFps) return;
        this._lastFps = key;
        // "ИИ" = how many times per second the camera pose is recognised; then the graphics level
        this.el.fps.innerText = `FPS: ${fps}` + (aiFps ? ` | ИИ: ${aiFps}` : '') + (quality ? ` | графика: ${quality}` : '') + (spike ? ` | ${spike}` : '');
        this.el.fps.style.color = fps > 50 ? '#00ff00' : (fps > 25 ? '#ffff00' : '#ff0000');
    }

    /** Свободный мир: fatigue bar (white, bottom). */
    setFatigue(value, max) {
        const el = this.el;
        if (!el.fatigue) return;
        el.fatigue.classList.remove('hidden');
        el.fatigueFill.style.width = `${Math.max(0, (value / max) * 100)}%`;
        el.fatigueFill.classList.toggle('low', value < max * 0.3);
        el.fatigueText.textContent = `⚡ Усталость: ${Math.floor(value)}/${max}`;
    }

    hidePvp() {
        this.el.fatigue?.classList.add('hidden');
        this.setStatus('');
        this.setFrozenOverlay(0);
    }

    setStatus(html) {
        const el = this.el.status;
        if (!el) return;
        el.classList.toggle('hidden', !html);
        if (html && el.innerHTML !== html) el.innerHTML = html;
    }

    setFrozenOverlay(k) {
        if (this.el.frozen) this.el.frozen.style.opacity = String(Math.max(0, Math.min(1, k)));
    }

    /** A coloured flash around the screen (green for Avada Kedavra). */
    flashColor(color) {
        const f = this.el.flash;
        if (!f) return;
        f.style.boxShadow = `inset 0 0 160px ${color}`;
        this.damageFlash();
        setTimeout(() => { f.style.boxShadow = ''; }, 900);
    }

    damageFlash() {
        const f = this.el.flash;
        if (!f) return;
        f.classList.remove('hidden');
        f.classList.remove('active');
        void f.offsetWidth;
        f.classList.add('active');
    }

    /**
     * A short message under the health bar that fades by itself (e.g. «нет сил»):
     * small, see-through and never in the way of the game.
     */
    toast(text, ms = 1600) {
        let el = this._toastEl;
        if (!el) {
            el = this._toastEl = document.createElement('div');
            el.id = 'hud-toast';
            el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:60;pointer-events:none;'
                + 'padding:5px 14px;border-radius:14px;background:rgba(0,0,0,.45);color:#fff;font-size:15px;'
                + 'transition:opacity .35s;opacity:0;white-space:nowrap';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
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

    /** «Подключился: Имя» at the bottom left (above the minimap); fades after a few seconds. */
    notify(text, ms = 5000) {
        let box = this._notifyBox;
        if (!box) {
            box = this._notifyBox = document.createElement('div');
            box.id = 'hud-notify';
            document.body.appendChild(box);
        }
        const item = document.createElement('div');
        item.className = 'hud-notify-item';
        item.textContent = text;
        box.appendChild(item);
        while (box.children.length > 5) box.firstChild.remove();
        setTimeout(() => { item.style.opacity = '0'; }, ms);
        setTimeout(() => item.remove(), ms + 600);
    }

    /**
     * A round timer at the bottom right (e.g. «Lightning Strike»): `frac` of the
     * time left (null hides it), an icon, the seconds, and an inner "aim" ring.
     */
    setTimer(frac, icon = '⚡', secs = 0, lock = 0) {
        let el = this._timerEl;
        if (frac == null) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = this._timerEl = document.createElement('div');
            el.id = 'hud-timer';
            el.innerHTML = '<div class="ring"></div><div class="lock"></div><div class="icon"></div><div class="secs"></div>';
            document.body.appendChild(el);
        }
        el.style.display = 'block';
        const deg = Math.max(0, Math.min(1, frac)) * 360;
        const low = frac < 0.35;
        el.querySelector('.ring').style.background = `conic-gradient(${low ? '#ff5a5a' : '#7fd3ff'} ${deg}deg, rgba(255,255,255,0.12) ${deg}deg)`;
        el.querySelector('.lock').style.background = lock > 0 ? `conic-gradient(#ffe066 ${lock * 360}deg, transparent ${lock * 360}deg)` : 'transparent';
        el.querySelector('.icon').textContent = icon;
        el.querySelector('.secs').textContent = secs > 0 ? secs : '';
        el.classList.toggle('low', low);
    }

    setMultiplayer(html) {
        if (!this.el.mp) return;
        if (!html) { this.el.mp.classList.add('hidden'); return; }
        this.el.mp.classList.remove('hidden');
        if (this.el.mp.innerHTML !== html) this.el.mp.innerHTML = html;
    }

    /** Terrain for the minimap (the world is endless: a window around the player is drawn). */
    setTerrain(terrain) {
        this.terrainImage = null;
        this.terrain = terrain || null;
    }

    /** Pre-render the height map around (cx, cz) — mountains grey, trees green, craters brown. */
    _renderTerrainWindow(cx, cz) {
        const d = this.terrain.data;
        const size = MINIMAP_WINDOW;
        const half = size / 2;
        let ti = this.terrainImage;
        if (!ti) {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ti = this.terrainImage = { canvas, ctx, img: ctx.createImageData(size, size) };
        }
        const px = ti.img.data;
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const wx = cx - half + x, wz = cz - half + z;
                const top = d.topLayer(wx, wz);
                const i = (z * size + x) * 4;
                if (top >= 1) {
                    if (d.get(wx, top, wz) === BLOCK_LEAVES) {
                        px[i] = 34; px[i + 1] = 139; px[i + 2] = 34; px[i + 3] = 170;
                    } else {
                        const v = Math.min(255, 90 + top * 6);
                        px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 150;
                    }
                } else if (top < 0) {
                    px[i] = 60; px[i + 1] = 40; px[i + 2] = 20; px[i + 3] = 150;
                } else {
                    px[i + 3] = 0;
                }
            }
        }
        ti.ctx.putImageData(ti.img, 0, 0);
        ti.cx = cx;
        ti.cz = cz;
        ti.version = d.version;
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

        if (this.terrain) {
            // Redrawn only after explosions or when the player moved to another 16 m cell
            const cx = Math.round(charPos.x / 16) * 16, cz = Math.round(charPos.z / 16) * 16;
            const ti = this.terrainImage;
            if (!ti || ti.cx !== cx || ti.cz !== cz || ti.version !== this.terrain.data.version) this._renderTerrainWindow(cx, cz);
            const t = this.terrainImage;
            const half = MINIMAP_WINDOW / 2;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(t.canvas, (t.cx - half - charPos.x - 0.5) * scale, (t.cz - half - charPos.z - 0.5) * scale, MINIMAP_WINDOW * scale, MINIMAP_WINDOW * scale);
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
        // Other players: a dot in their colour with the name; beyond the edge of the
        // map an arrow on the rim shows which way to look (with the distance)
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        for (const o of others) {
            const ox = (o.x - charPos.x) * scale, oz = (o.z - charPos.z) * scale;
            const col = o.color != null ? '#' + o.color.toString(16).padStart(6, '0') : '#3498db';
            const name = (o.name || '').slice(0, 8);
            const d2 = ox * ox + oz * oz;
            if (d2 < (radius - 6) * (radius - 6)) {
                ctx.fillStyle = col;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(ox, oz, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                if (name) { ctx.fillStyle = '#fff'; ctx.fillText(name, ox, oz - 7); }
            } else {
                const a = Math.atan2(oz, ox);
                const r = radius - 9;
                ctx.save();
                ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
                ctx.rotate(a);
                ctx.fillStyle = col;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
                const tx = Math.cos(a) * (r - 18), ty = Math.sin(a) * (r - 18) + 3;
                const dist = Math.round(Math.sqrt(d2) / scale);
                ctx.fillStyle = '#fff';
                ctx.fillText(`${name} ${dist} м`, tx, ty);
            }
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.rotate(-rotY);
        ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
        ctx.restore();
    }
}
