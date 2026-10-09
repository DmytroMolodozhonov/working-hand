/**
 * Hud.js — in-game HUD, damage flash, FPS counter and minimap.
 * DOM elements are looked up once (the original queried them every frame).
 */

const MINIMAP_WINDOW = 128; // m of terrain drawn around the player
import { BLOCK, BASE_COLORS } from '../world/Terrain.js';

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
        const gpu = globalThis.__zns?.gpu;
        this.el.fps.innerText = `FPS: ${fps}` + (aiFps ? ` | ИИ: ${aiFps}` : '') + (quality ? ` | графика: ${quality}` : '') + (spike ? ` | ${spike}` : '')
            + (gpu?.short && !this.minimal ? ` | ${gpu.weak ? '⚠️ ' : ''}${gpu.short}` : '');
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
    /**
     * The world from above, in its real colours: grass, sand, rock, snow,
     * water (darker where deep), the crowns of trees — with soft shading so
     * hills and mountains stand out.
     */
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
            ti = this.terrainImage = { canvas, ctx, img: ctx.createImageData(size, size), heights: new Int16Array((size + 1) * (size + 1)) };
        }
        const px = ti.img.data;
        const H = ti.heights;
        for (let z = -1; z < size; z++) for (let x = -1; x < size; x++) H[(z + 1) * (size + 1) + (x + 1)] = d.topLayer(cx - half + x, cz - half + z);
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const wx = cx - half + x, wz = cz - half + z;
                const top = H[(z + 1) * (size + 1) + (x + 1)];
                const i = (z * size + x) * 4;
                let col, shade = 1;
                // water above the ground?
                let depth = 0;
                while (depth < 8 && d.get(wx, top + 1 + depth, wz) === BLOCK.WATER) depth++;
                if (depth) {
                    col = 0x3a8fd8;
                    shade = 1.1 - depth * 0.08;
                } else {
                    col = BASE_COLORS[d.get(wx, top, wz)] ?? 0x4CAF50;
                    // hill shading: light from the north-west
                    const hw = H[(z + 1) * (size + 1) + x], hn = H[z * (size + 1) + (x + 1)];
                    shade = 1 + Math.max(-0.25, Math.min(0.25, ((top - hw) + (top - hn)) * 0.07)) + Math.min(0.15, Math.max(0, top) * 0.004);
                }
                px[i] = Math.min(255, ((col >> 16) & 255) * shade);
                px[i + 1] = Math.min(255, ((col >> 8) & 255) * shade);
                px[i + 2] = Math.min(255, (col & 255) * shade);
                px[i + 3] = 255;
            }
        }
        ti.ctx.putImageData(ti.img, 0, 0);
        ti.cx = cx;
        ti.cz = cz;
        ti.version = d.version;
    }

    drawMinimap(charPos, rotY, world, zombies, others = [], server = null, castles = []) {
        const ctx = this.mmCtx;
        if (!ctx) return;
        const cvs = this.el.minimap;
        const W = cvs.width, Hh = cvs.height;
        const hw = W / 2, hh = Hh / 2;
        const scale = 2.0;
        ctx.clearRect(0, 0, W, Hh);
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 0, W, Hh);
        ctx.save();
        ctx.translate(hw, hh);

        if (this.terrain) {
            // Redrawn only after changes to the world or when the player moved to another 16 m cell
            const cx = Math.round(charPos.x / 16) * 16, cz = Math.round(charPos.z / 16) * 16;
            const ti = this.terrainImage;
            if (!ti || ti.cx !== cx || ti.cz !== cz || ti.version !== this.terrain.data.version) this._renderTerrainWindow(cx, cz);
            const t = this.terrainImage;
            const half = MINIMAP_WINDOW / 2;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(t.canvas, (t.cx - half - charPos.x - 0.5) * scale, (t.cz - half - charPos.z - 0.5) * scale, MINIMAP_WINDOW * scale, MINIMAP_WINDOW * scale);
        }
        const inside = (x, y, m = 0) => Math.abs(x) < hw - m && Math.abs(y) < hh - m;

        // the round trees near the start (the voxel ones are already in the picture)
        if (world && world.trees) {
            for (const t of world.trees) {
                if (t.alive === false) continue;
                const dx = (t.x - charPos.x) * scale, dy = (t.z - charPos.z) * scale;
                if (!inside(dx, dy)) continue;
                ctx.fillStyle = '#1f6b24';
                ctx.beginPath(); ctx.arc(dx, dy, 4.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2e8b2e';
                ctx.beginPath(); ctx.arc(dx - 1, dy - 1, 3, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.fillStyle = '#e74c3c';
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 1;
        for (const z of zombies) {
            if (z.isDead) continue;
            const zx = (z.group.position.x - charPos.x) * scale, zz = (z.group.position.z - charPos.z) * scale;
            if (inside(zx, zz)) { ctx.beginPath(); ctx.arc(zx, zz, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        }
        // Other players: a dot in their colour with the name; beyond the edge of the
        // map an arrow on the edge shows which way to look (with the distance)
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        const label = (text, x, y) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); };
        // Castles: a little castle with the name; far ones — an arrow on the edge with the distance
        const edgeArrow = (dx, dy, fill, stroke, text) => {
            const a = Math.atan2(dy, dx);
            const k = Math.min((hw - 9) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - 9) / Math.max(1e-6, Math.abs(Math.sin(a))));
            ctx.save();
            ctx.translate(Math.cos(a) * k, Math.sin(a) * k);
            ctx.rotate(a);
            ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
            const tx = Math.max(-hw + 36, Math.min(hw - 36, Math.cos(a) * (k - 16))), ty = Math.max(-hh + 10, Math.min(hh - 4, Math.sin(a) * (k - 16) + 3));
            label(text, tx, ty);
        };
        this.minimapCastles = [];
        for (const c of castles.slice(0, 2)) {
            const cx = (c.x - charPos.x) * scale, cz = (c.z - charPos.z) * scale;
            this.minimapCastles.push(c.name);
            if (inside(cx, cz, 10)) {
                // (the walls are drawn by the terrain picture already: just the name)
                label('🏰 ' + c.name.replace(/^(Замок|Крепость) /, ''), cx, Math.max(-hh + 12, cz - 10));
            } else edgeArrow(cx, cz, '#c9c4b8', '#3b3b3b', `🏰 ${Math.round(Math.hypot(cx, cz) / scale)} м`);
        }
        // The server: a flag at its start point (an arrow on the edge when far)
        this.minimapServer = server ? server.name : null;
        if (server && server.home) {
            const sx = (server.home.x - charPos.x) * scale, sz = (server.home.z - charPos.z) * scale;
            const sname = String(server.name || 'Сервер').slice(0, 14);
            if (inside(sx, sz, 8)) {
                ctx.strokeStyle = '#3b2a10'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(sx, sz + 6); ctx.lineTo(sx, sz - 10); ctx.stroke();
                ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sx, sz - 10); ctx.lineTo(sx + 10, sz - 6.5); ctx.lineTo(sx, sz - 3); ctx.closePath(); ctx.fill(); ctx.stroke();
                label('🏰 ' + sname, sx, sz + 17);
            } else {
                const a = Math.atan2(sz, sx);
                const k = Math.min((hw - 9) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - 9) / Math.max(1e-6, Math.abs(Math.sin(a))));
                ctx.save();
                ctx.translate(Math.cos(a) * k, Math.sin(a) * k);
                ctx.rotate(a);
                ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
                const tx = Math.max(-hw + 36, Math.min(hw - 36, Math.cos(a) * (k - 16))), ty = Math.max(-hh + 10, Math.min(hh - 4, Math.sin(a) * (k - 16) + 3));
                label(`🏰 ${Math.round(Math.hypot(sx, sz) / scale)} м`, tx, ty);
            }
        }
        for (const o of others) {
            const ox = (o.x - charPos.x) * scale, oz = (o.z - charPos.z) * scale;
            const col = o.color != null ? '#' + o.color.toString(16).padStart(6, '0') : '#3498db';
            const name = (o.name || '').slice(0, 8);
            if (inside(ox, oz, 6)) {
                ctx.fillStyle = col;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(ox, oz, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                if (name) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(name, ox, oz - 7); ctx.fillText(name, ox, oz - 7); }
            } else {
                const a = Math.atan2(oz, ox);
                // where the direction leaves the rectangle
                const k = Math.min((hw - 9) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - 9) / Math.max(1e-6, Math.abs(Math.sin(a))));
                ctx.save();
                ctx.translate(Math.cos(a) * k, Math.sin(a) * k);
                ctx.rotate(a);
                ctx.fillStyle = col;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
                const tx = Math.max(-hw + 30, Math.min(hw - 30, Math.cos(a) * (k - 16))), ty = Math.max(-hh + 10, Math.min(hh - 4, Math.sin(a) * (k - 16) + 3));
                const dist = Math.round(Math.hypot(ox, oz) / scale);
                ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
                ctx.strokeText(`${name} ${dist} м`, tx, ty);
                ctx.fillText(`${name} ${dist} м`, tx, ty);
            }
        }
        // me: a white arrow with a dark outline
        ctx.rotate(-rotY);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        // which server I am on: a badge at the top of the map
        if (server) {
            const text = `🌐 ${String(server.name || 'Сервер').slice(0, 18)} · 👥 ${server.players}`;
            ctx.font = 'bold 11px sans-serif';
            const w = ctx.measureText(text).width + 14;
            ctx.fillStyle = 'rgba(15, 25, 40, 0.72)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(hw - w / 2, 4, w, 18, 9); else ctx.rect(hw - w / 2, 4, w, 18);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(text, hw, 17);
        }
    }
}
