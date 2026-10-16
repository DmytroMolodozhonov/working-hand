/**
 * Hud.js — in-game HUD, damage flash, FPS counter and minimap.
 * DOM elements are looked up once (the original queried them every frame).
 */

const MINIMAP_WINDOW = 128; // m of terrain drawn around the player
const CAVE_WINDOW = 96; // m of a cave drawn around the player (the cave map: 4 px a metre)
const MINIMAP_W = 240, MINIMAP_H = 160; // the map's own units (drawn bigger by the size setting)
const HEARD_WORDS = 4;       // the «heard words» line keeps only the newest few words
const HINT_MS = 5000;        // a hint (the message line) fades after this long…
const HINT_AGAIN_MS = 8000;  // …and the very same one is not shown again before this
const HEARD_FADE_MS = 1500;  // …and fades this long after the microphone goes quiet

/** The last `n` words of what the microphone heard (the newest ones). */
export function lastWords(text, n = HEARD_WORDS) {
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    return words.slice(-n).join(' ');
}
import { BLOCK, BASE_COLORS, CHUNK, chunkKey, isPlanetBlock } from '../world/Terrain.js';
import { CAVE_MAP, columnLook, WALL, PIT } from '../game/CaveMap.js';

/**
 * The minimap's size, % of 240 × 160 (settings → «Размер мини-карты»): the same picture,
 * bigger and sharp. 120% by default.
 */
export function setMinimapSize(pct) {
    if (pct != null) setMinimapSize.pct = pct;
    // (never over the slots at the bottom in a small window: at most ~36% of its width, half its height)
    const fit = Math.min((window.innerWidth || 1280) * 0.36 / MINIMAP_W, (window.innerHeight || 800) * 0.5 / MINIMAP_H);
    const k = Math.max(0.6, Math.min(3, fit, (+setMinimapSize.pct || 120) / 100));
    const box = document.getElementById('minimap-container'), cvs = document.getElementById('minimap');
    if (!box || !cvs) return;
    const w = Math.round(MINIMAP_W * k), h = Math.round(MINIMAP_H * k), dpr = Math.min(2, window.devicePixelRatio || 1);
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    document.documentElement.style.setProperty('--minimap-h', h + 'px');
}

if (typeof window !== 'undefined') window.addEventListener?.('resize', () => { if (setMinimapSize.pct) setMinimapSize(); });

/** «640 м» / «1,2 км». */
function distText(m) {
    return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`;
}

/** A place's picture, centred at (0, 0), about `s` tall: a castle (towers, walls, a gate) or a wizards' tower. */
function placeIcon(ctx, kind, s) {
    const u = s / 20;
    ctx.save();
    ctx.scale(u, u);
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    if (kind === 'grave') {
        // a cross and a rounded headstone
        ctx.fillStyle = '#d8d8e0'; ctx.strokeStyle = '#111';
        ctx.beginPath(); ctx.rect(-8, -8, 3, 16); ctx.rect(-12, -4, 11, 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(1, 9); ctx.lineTo(1, -2); ctx.arc(5.5, -2, 4.5, Math.PI, 0); ctx.lineTo(10, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'ice') {
        // the Ice Castle: a glowing six-armed snowflake
        ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2, x = Math.cos(a) * 9, y = Math.sin(a) * 9;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
            const bx = Math.cos(a) * 5.5, by = Math.sin(a) * 5.5;
            for (const s of [-0.8, 0.8]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + s) * 3, by + Math.sin(a + s) * 3); ctx.stroke(); }
        }
    } else if (kind === 'tower') {
        // a slim stone tower with a pointed violet roof and a gold star on top
        ctx.fillStyle = '#cfc6e6'; ctx.strokeStyle = '#2a1f45';
        ctx.beginPath(); ctx.rect(-3.5, -3, 7, 13); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7b4fd0';
        ctx.beginPath(); ctx.moveTo(-6, -2.5); ctx.lineTo(0, -12); ctx.lineTo(6, -2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath(); ctx.arc(0, -12.5, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a1f45';
        ctx.fillRect(-1, 1, 2, 3); // (a window)
    } else {
        // a castle: two towers with merlons, a wall between them, a dark gate
        ctx.fillStyle = '#e2dccd'; ctx.strokeStyle = '#3a3428';
        ctx.beginPath();
        ctx.moveTo(-10, 9); ctx.lineTo(-10, -7); ctx.lineTo(-8, -7); ctx.lineTo(-8, -9); ctx.lineTo(-6.5, -9); ctx.lineTo(-6.5, -7); ctx.lineTo(-5, -7); ctx.lineTo(-5, -9); ctx.lineTo(-3.5, -9);
        ctx.lineTo(-3.5, -2); ctx.lineTo(-2, -2); ctx.lineTo(-2, -4); ctx.lineTo(-0.7, -4); ctx.lineTo(-0.7, -2); ctx.lineTo(0.7, -2); ctx.lineTo(0.7, -4); ctx.lineTo(2, -4); ctx.lineTo(2, -2); ctx.lineTo(3.5, -2);
        ctx.lineTo(3.5, -9); ctx.lineTo(5, -9); ctx.lineTo(5, -7); ctx.lineTo(6.5, -7); ctx.lineTo(6.5, -9); ctx.lineTo(8, -9); ctx.lineTo(8, -7); ctx.lineTo(10, -7); ctx.lineTo(10, 9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3a3428';
        ctx.beginPath(); ctx.moveTo(-2.5, 9); ctx.lineTo(-2.5, 4); ctx.arc(0, 4, 2.5, Math.PI, 0); ctx.lineTo(2.5, 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d33f3f'; // (a flag)
        ctx.beginPath(); ctx.moveTo(-6.75, -9); ctx.lineTo(-6.75, -14); ctx.lineTo(-3, -12.5); ctx.lineTo(-6.75, -11); ctx.fill();
    }
    ctx.restore();
}

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
            manaNum: document.getElementById('mana-num'),
            manaCur: document.getElementById('mana-cur'),
            manaMax: document.getElementById('mana-max'),
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
        this._hudOn = !!visible;
        this.el.fps?.classList.toggle('hidden', !(visible && this._fpsOn));
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
        this._lastFps = null;
    }

    /** The FPS number (top left): shown or not, twice the size in Creative. */
    setFpsShown(on, big = false) {
        this._fpsOn = !!on;
        this.el.fps.classList.toggle('hidden', !(on && this._hudOn));
        this.el.fps.classList.toggle('big', !!big);
    }

    setFps(fps) {
        if (fps === this._lastFps) return;
        this._lastFps = fps;
        this.el.fps.innerText = `FPS: ${fps}`;
        this.el.fps.style.color = fps > 50 ? '#00ff00' : (fps > 25 ? '#ffff00' : '#ff0000');
    }

    /** Свободный мир: fatigue bar (white, bottom). */
    setFatigue(value, max) {
        const el = this.el;
        if (!el.fatigue) return;
        el.fatigue.classList.remove('hidden');
        el.fatigueFill.style.width = `${Math.max(0, (value / max) * 100)}%`;
        el.fatigueFill.classList.toggle('low', value < max * 0.3);
        el.fatigue.style.setProperty?.('--mana-marks', String(Math.max(1, max / 5))); // (a mark every 5 mana, whatever the maximum)
        el.fatigueText.textContent = `🔷 Мана: ${Math.floor(value)}/${Math.floor(max)}`;
        if (el.manaNum) {
            el.manaNum.classList.remove('hidden');
            el.manaCur.textContent = String(Math.max(0, Math.floor(value)));
            el.manaMax.textContent = String(Math.floor(max));
            el.manaNum.classList.toggle('low', value < max * 0.3);
        }
    }

    /**
     * «Мы вас поняли, но маны недостаточно»: the bar and its figures flash red and shudder (Combat.check).
     * A CSS animation, restarted by taking the class off and on.
     */
    manaShort() {
        for (const e of [this.el.fatigue, this.el.manaNum]) {
            if (!e) continue;
            e.classList.remove('short');
            void e.offsetWidth; // (restart the animation)
            e.classList.add('short');
            clearTimeout(e._shortT);
            e._shortT = setTimeout(() => e.classList.remove('short'), 900);
        }
    }

    hidePvp() {
        this.el.fatigue?.classList.add('hidden');
        this.el.manaNum?.classList.add('hidden');
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

    /**
     * Dizzy after a fall (0 … 1): the game picture blurred (not the HUD), a dark wavering edge,
     * and a faint ringing in the ears after a hard one. Cheap: touched only when it changes.
     */
    setDizzy(k, canvas) {
        k = Math.max(0, Math.min(1, k || 0));
        if (Math.abs(k - (this._dizzyK || 0)) < 0.02 && (k > 0 || !this._dizzyK)) return;
        this._dizzyK = k;
        if (canvas?.style) canvas.style.filter = k > 0.02 ? `blur(${(k * 2.2).toFixed(2)}px) saturate(${(1 - 0.3 * k).toFixed(2)})` : '';
        let v = this._dizzyEl;
        if (!v && k > 0 && typeof document !== 'undefined') {
            v = this._dizzyEl = document.createElement('div');
            v.id = 'dizzy-overlay';
            v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;'
                + 'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(25,10,35,0.75) 100%);';
            document.body.appendChild(v);
        }
        if (v) v.style.opacity = (k * 0.8).toFixed(2);
        this._ringing(k);
    }

    _ringing(k) {
        const g = k > 0.45 ? (k - 0.45) * 0.02 : 0;              // (only a hard fall rings, and faintly)
        try {
            if (g > 0 && !this._ring && typeof AudioContext !== 'undefined') {
                const ac = this._ringAc || (this._ringAc = new AudioContext());
                const o = ac.createOscillator(), gain = ac.createGain();
                o.frequency.value = 3600; gain.gain.value = 0;
                o.connect(gain).connect(ac.destination); o.start();
                this._ring = { o, gain, ac };
            }
            if (this._ring) {
                this._ring.gain.gain.setTargetAtTime(g, this._ring.ac.currentTime, 0.3);
                if (g === 0) { const r = this._ring; this._ring = null; r.o.stop(r.ac.currentTime + 1.5); }
            }
        } catch { this._ring = null; }
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

    /**
     * The duel's balance at the top of the screen: my colour against theirs, my
     * share of the beam (0…1; more than half — I am winning). null hides it.
     */
    setDuelBar(d) {
        let el = this._duelEl;
        if (!d) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = this._duelEl = document.createElement('div');
            el.id = 'hud-duel';
            el.style.cssText = 'position:fixed;left:50%;top:96px;transform:translateX(-50%);z-index:61;pointer-events:none;width:min(420px,70vw);height:16px;border-radius:9px;overflow:hidden;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 12px rgba(0,0,0,.6);background:#222;display:flex';
            el.innerHTML = '<div class="me" style="height:100%"></div><div style="width:4px;height:100%;background:#fff;box-shadow:0 0 8px #fff"></div><div class="them" style="flex:1;height:100%"></div>';
            document.body.appendChild(el);
        }
        const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
        el.style.display = 'flex';
        const me = el.querySelector('.me'), them = el.querySelector('.them');
        me.style.width = `${Math.round(Math.max(0, Math.min(1, d.share)) * 100)}%`;
        me.style.background = hex(d.me);
        them.style.background = hex(d.them);
    }

    /**
     * The message line. A game message (why I fell, why a spell did not work…) is a HINT: big and
     * bold for a player a few metres from the screen, at the top (not where spells are aimed, not over
     * the bars or the minimap), and it fades by itself after HINT_MS; a new one replaces it, the same
     * one is not shown again for a while. «ЖДУ КОМАНДУ» stays the small indicator it was.
     */
    setVoice(html, show = true) {
        const v = this.el.voice;
        if (!v) return;
        const now = performance.now();
        if (show) {
            const hint = !!html && !html.includes('ЖДУ КОМАНДУ');
            if (hint && this.hintFilter && !this.hintFilter(html)) return; // (a spell's advice waits: was it really cast? — Game._castWithHints)
            if (html === this._lastVoice) {
                // the same line again: an indicator just stays; a hint only after a while (no flicker)
                if (!hint || now - this._voiceAt < HINT_AGAIN_MS) { if (!hint || v.classList.contains('on')) this._showVoice(v, hint); return; }
            }
            v.innerHTML = html; this._lastVoice = html; this._voiceAt = now;
            this._showVoice(v, hint);
            clearTimeout(this._voiceTimer);
            if (hint) this._voiceTimer = setTimeout(() => { v.classList.remove('on'); this._voiceTimer = setTimeout(() => { if (!v.classList.contains('on')) { v.style.display = 'none'; } }, 450); }, HINT_MS);
        } else {
            if (v.classList.contains('hint') && v.classList.contains('on')) return; // (a hint still being read fades by itself)
            v.classList.add('hidden');
            v.classList.remove('on');
            v.style.display = 'none';
        }
    }

    _showVoice(v, hint) {
        v.classList.remove('hidden');
        v.classList.toggle('hint', hint);
        v.style.display = 'block';
        v.classList.add('on');
    }

    /**
     * The live words the microphone is catching. Only in Creative (it is partly a developer
     * mode); elsewhere nothing is shown. Big, bold, only the newest few words, and it fades
     * shortly after the speech stops. Game messages stay in their own line (`setVoice`).
     */
    heard(text, creative) {
        let el = this._heardEl;
        if (!creative) { if (el) { el.classList.remove('on'); el.textContent = ''; } return; }
        const words = lastWords(text);
        if (!words) return;
        if (!el) {
            el = this._heardEl = document.createElement('div');
            el.id = 'voice-heard';
            document.body.appendChild(el);
        }
        el.textContent = words;
        el.classList.add('on');
        clearTimeout(this._heardTimer);
        this._heardTimer = setTimeout(() => el.classList.remove('on'), HEARD_FADE_MS);
    }

    /** ms since the message line was last written. */
    voiceAge() {
        return performance.now() - (this._voiceAt ?? -1e9);
    }

    /** A hint is on the screen now (still being read). */
    hintShowing() {
        const v = this.el.voice;
        return !!v && v.classList.contains('hint') && v.classList.contains('on');
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
        // In flight the window moves every few frames: what it already shows is moved over and
        // only the new strip is worked out (each pixel depends only on its own place in the world)
        const sx = cx - ti.cx, sz = cz - ti.cz;
        // (a changed world — a crater, a wall, a house rising: only the chunks that changed are drawn
        // again, when the world says which — d.mapDirty; too many at once: all of it)
        const changed = ti.version !== d.version ? d.mapDirty : null;
        const partial = changed && changed.size < 64 && ti.version != null;
        const shift = ti.cx != null && (ti.version === d.version || partial) && Math.abs(sx) < size && Math.abs(sz) < size;
        const touched = partial && changed.size ? new Set(changed) : null;
        if (d.mapDirty) d.mapDirty.clear();
        if (shift) {
            const S1 = size + 1;
            const ox = Math.max(0, sx), oz = Math.max(0, sz), w = size - Math.abs(sx), h = size - Math.abs(sz);
            const dx = Math.max(0, -sx), dz = Math.max(0, -sz);
            const tmpH = ti.tmpH || (ti.tmpH = new Int16Array(H.length));
            const tmpP = ti.tmpP || (ti.tmpP = new Uint8ClampedArray(px.length));
            tmpH.set(H); tmpP.set(px);
            for (let z = 0; z <= h; z++) H.set(tmpH.subarray((z + oz) * S1 + ox, (z + oz) * S1 + ox + w + 1), (z + dz) * S1 + dx);
            for (let z = 0; z < h; z++) px.set(tmpP.subarray(((z + oz) * size + ox) * 4, ((z + oz) * size + ox + w) * 4), ((z + dz) * size + dx) * 4);
        }
        // (land not made yet — in a fast flight it is being made in a worker — is not made here for the
        // map: it stays plain green this time, and is drawn when it is there — it and the pixels next to it)
        const ckey = (wx, wz) => chunkKey(Math.floor(wx / CHUNK), Math.floor(wz / CHUNK));
        const have = (wx, wz) => d.hasChunk(Math.floor(wx / CHUNK), Math.floor(wz / CHUNK));
        const before = shift && (ti.missing?.size || touched) ? new Set([...(ti.missing || []), ...(touched || [])]) : null;
        const later = ti.missing = new Set();
        // (the window's columns to work out again: the strip that came in, the chunks that changed or were
        // missing — and the pixel east and south of them: a pixel's shade looks at its west and north)
        const S1 = size + 1;
        const redo = ti.redo || (ti.redo = new Uint8Array(S1 * S1));
        redo.fill(shift ? 0 : 1);
        if (shift) {
            const x0 = Math.max(0, -sx), x1 = size - Math.max(0, sx), z0 = Math.max(0, -sz), z1 = size - Math.max(0, sz);
            for (let z = -1; z < size; z++) for (let x = -1; x < size; x++) if (x < x0 || x >= x1 || z < z0 || z >= z1) redo[(z + 1) * S1 + x + 1] = 1;
            if (before) for (const k of before) {
                const kcx = Math.floor(k / 0x10000) - 0x8000, kcz = (k % 0x10000) - 0x8000; // (chunkKey back)
                const ax = Math.max(-1, kcx * CHUNK - (cx - half)), bx = Math.min(size - 1, kcx * CHUNK + CHUNK - (cx - half)); // (+1: the pixel east of it)
                const az = Math.max(-1, kcz * CHUNK - (cz - half)), bz = Math.min(size - 1, kcz * CHUNK + CHUNK - (cz - half));
                for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) redo[(z + 1) * S1 + x + 1] = 1;
            }
        }
        const fresh = (x, z) => redo[(z + 1) * S1 + x + 1] === 1;
        let missing = false;
        for (let z = -1; z < size; z++) for (let x = -1; x < size; x++) {
            if (!fresh(x, z)) continue;
            const wx = cx - half + x, wz = cz - half + z;
            if (have(wx, wz)) H[(z + 1) * (size + 1) + (x + 1)] = d.topLayer(wx, wz);
            else { H[(z + 1) * (size + 1) + (x + 1)] = 0; missing = true; later.add(ckey(wx, wz)); }
        }
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                if (!fresh(x, z)) continue;
                const wx = cx - half + x, wz = cz - half + z;
                const top = H[(z + 1) * (size + 1) + (x + 1)];
                const i = (z * size + x) * 4;
                if (missing && !have(wx, wz)) { px[i] = 0x4C; px[i + 1] = 0xAF; px[i + 2] = 0x50; px[i + 3] = 255; continue; }
                let col, shade = 1;
                // water above the ground?
                let depth = 0;
                while (depth < 8 && d.get(wx, top + 1 + depth, wz) === BLOCK.WATER) depth++;
                if (depth) {
                    col = 0x3a8fd8;
                    shade = 1.1 - depth * 0.08;
                } else {
                    const bt = d.get(wx, top, wz);
                    col = isPlanetBlock(bt) ? d.faceColor(bt, wx, top, wz, true) : BASE_COLORS[bt] ?? 0x4CAF50; // (another planet's ground: its own colours)
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

    /**
     * The cave map's picture round (cx, cz) at the hero's level L: what they have seen of the cave —
     * the floor light (lighter higher, darker lower), the rock dark, the rest dark as night (not seen).
     * Only what changed is worked out: newly seen columns, the strip that came in when the window moved;
     * a whole new picture (another level, a dug wall) a little a frame (≤ 1.5 ms), from the middle out.
     */
    _renderCaveWindow(cave, cx, cz) {
        const N = CAVE_WINDOW, half = N / 2, mem = cave.mem, d = cave.data;
        let ci = this.caveImage;
        if (!ci) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = N;
            const ctx = canvas.getContext('2d');
            ci = this.caveImage = { canvas, ctx, img: ctx.createImageData(N, N), redo: new Uint8Array(N * N), todo: 0, tmp: null };
        }
        const px = ci.img.data, redo = ci.redo;
        const FOG = [10, 10, 15];
        const fog = (i) => { px[i] = FOG[0]; px[i + 1] = FOG[1]; px[i + 2] = FOG[2]; px[i + 3] = 255; };
        let dirty = false;
        const levelMoved = ci.L == null || Math.abs(cave.L - ci.L) >= 2;
        if (ci.cx == null || levelMoved || mem.redraw || ci.ver !== d.version || Math.abs(cx - ci.cx) >= N || Math.abs(cz - ci.cz) >= N) {
            // (all anew: the seen columns are worked out a little a frame; the rest is dark at once)
            for (let i = 0; i < N * N; i++) { fog(i * 4); redo[i] = mem.has(cx - half + (i % N), cz - half + Math.floor(i / N)) ? 1 : 0; }
            ci.todo = 1;
            ci.L = cave.L; ci.ver = d.version; mem.redraw = false; mem.fresh.length = 0;
            dirty = true;
        } else if (cx !== ci.cx || cz !== ci.cz) {
            // (moved on: what is shown is moved over, only the strip that came in is worked out)
            const sx = cx - ci.cx, sz = cz - ci.cz;
            const tmp = ci.tmp || (ci.tmp = new Uint8ClampedArray(px.length));
            const tr = ci.tmpR || (ci.tmpR = new Uint8Array(N * N));
            tmp.set(px); tr.set(redo);
            for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
                const ox = x + sx, oz = z + sz, i = z * N + x;
                if (ox >= 0 && ox < N && oz >= 0 && oz < N) {
                    const j = oz * N + ox;
                    px[i * 4] = tmp[j * 4]; px[i * 4 + 1] = tmp[j * 4 + 1]; px[i * 4 + 2] = tmp[j * 4 + 2]; px[i * 4 + 3] = 255;
                    redo[i] = tr[j];
                } else { fog(i * 4); redo[i] = mem.has(cx - half + x, cz - half + z) ? 1 : 0; if (redo[i]) ci.todo = 1; }
            }
            dirty = true;
        }
        ci.cx = cx; ci.cz = cz;
        const pixel = (x, z) => {
            const wx = cx - half + x, wz = cz - half + z, i = (z * N + x) * 4;
            const k = columnLook(d, wx, wz, cave.L);
            let r, g, b;
            if (k === WALL) { r = 74; g = 68; b = 60; }
            else if (k === PIT) { r = 26; g = 30; b = 40; }
            else if (d.get(wx, cave.L + k, wz) === BLOCK.WATER) { r = 58; g = 111; b = 160; }
            else {
                const sh = Math.max(0.45, Math.min(1.25, 1 + k * 0.08)); // (higher: lighter; down a slope: darker)
                r = 206 * sh; g = 194 * sh; b = 166 * sh;
            }
            px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
        };
        // newly seen columns (just those)
        const f = mem.fresh;
        for (let j = 0; j < f.length; j += 2) {
            const x = f[j] - (cx - half), z = f[j + 1] - (cz - half);
            if (x < 0 || x >= N || z < 0 || z >= N) continue;
            pixel(x, z); redo[z * N + x] = 0; dirty = true;
        }
        f.length = 0;
        // the columns waiting (a whole new picture, a strip): a little a frame
        if (ci.todo) {
            const t0 = performance.now();
            let left = false;
            for (let i = 0; i < N * N; i++) {
                if (!redo[i]) continue;
                pixel(i % N, Math.floor(i / N)); redo[i] = 0; dirty = true;
                if ((i & 63) === 0 && performance.now() - t0 > 1.5) { left = true; break; }
            }
            ci.todo = left ? 1 : 0;
        }
        if (dirty) ci.ctx.putImageData(ci.img, 0, 0);
    }

    drawMinimap(charPos, rotY, world, zombies, others = [], server = null, castles = [], cave = null) {
        const ctx = this.mmCtx;
        if (!ctx) return;
        const cvs = this.el.minimap;
        // (drawn in the map's own 240 × 160 units; the canvas may be bigger — «Размер мини-карты»)
        const zoom = cvs.width / MINIMAP_W;
        ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
        const W = MINIMAP_W, Hh = MINIMAP_H;
        const hw = W / 2, hh = Hh / 2;
        const scale = cave ? CAVE_MAP.SCALE : 2.0;
        ctx.clearRect(0, 0, W, Hh);
        ctx.fillStyle = cave ? '#0a0a0f' : '#4CAF50';
        ctx.fillRect(0, 0, W, Hh);
        ctx.save();
        ctx.translate(hw, hh);

        if (cave) return this._drawCaveMap(ctx, cave, charPos, rotY, zombies, others, scale, hw, hh);
        if (this.terrain) {
            // Redrawn only after changes to the world or when the player moved to another 16 m cell
            const cx = Math.round(charPos.x / 16) * 16, cz = Math.round(charPos.z / 16) * 16;
            const ti = this.terrainImage;
            let arrived = false; // (land that was missing on the map is made now)
            if (ti?.missing?.size) for (const k of ti.missing) if (this.terrain.data.chunks.has(k)) { arrived = true; break; }
            if (!ti || ti.cx !== cx || ti.cz !== cz || ti.version !== this.terrain.data.version || arrived) this._renderTerrainWindow(cx, cz);
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
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round'; // (an outlined letter has no spikes)
        const label = (text, x, y) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); };
        // Castles and wizards' towers: their picture in a round badge — at the place when it is on
        // the map; far ones on the edge, pointing the way, with the distance in big letters
        const BADGE = 13;
        const bigLabel = (text, x, y) => {
            ctx.font = 'bold 18px sans-serif';
            const w = ctx.measureText(text).width;
            const tx = Math.max(-hw + w / 2 + 3, Math.min(hw - w / 2 - 3, x)), ty = Math.max(-hh + 17, Math.min(hh - 4, y));
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
            ctx.strokeText(text, tx, ty); ctx.fillText(text, tx, ty);
            ctx.font = 'bold 12px sans-serif';
        };
        const badge = (x, y, kind, a = null) => {
            const ring = kind === 'tower' ? '#b48be0' : kind === 'ice' ? '#9fe3ff' : '#ffd76a';
            if (a != null) {
                // the pointer: which way the place is
                ctx.save(); ctx.translate(x, y); ctx.rotate(a);
                ctx.fillStyle = ring; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(BADGE + 7, 0); ctx.lineTo(BADGE - 1, -6); ctx.lineTo(BADGE - 1, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
            ctx.fillStyle = 'rgba(18, 12, 40, 0.88)'; ctx.strokeStyle = ring; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, BADGE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.save(); ctx.translate(x, y + 1); placeIcon(ctx, kind, 19); ctx.restore();
        };
        this.minimapCastles = [];
        // village graveyards: a small cross-and-headstone badge, only when it is on the map
        for (const c of castles) {
            if (c.icon !== '✝') continue;
            const gx = (c.x - charPos.x) * scale, gz = (c.z - charPos.z) * scale;
            if (!inside(gx, gz, 10)) {
                // beyond the edge: a small pointer on the edge of the map with the distance
                const d = Math.hypot(gx, gz) / scale;
                if (d > 450) continue;
                const a = Math.atan2(gz, gx), m = 16;
                const k = Math.min((hw - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
                const bx = Math.cos(a) * k, by = Math.sin(a) * k;
                ctx.fillStyle = 'rgba(30, 30, 36, 0.9)'; ctx.strokeStyle = '#b8b8c4'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.save(); ctx.translate(bx, by + 1); placeIcon(ctx, 'grave', 14); ctx.restore();
                label(distText(d), bx - Math.cos(a) * 24, by - Math.sin(a) * 14 + 4);
                continue;
            }
            ctx.fillStyle = 'rgba(30, 30, 36, 0.9)'; ctx.strokeStyle = '#b8b8c4'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(gx, gz, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.save(); ctx.translate(gx, gz + 1); placeIcon(ctx, 'grave', 14); ctx.restore();
            label('Кладбище', gx, Math.max(-hh + 12, gz - 13));
        }
        // (the Ice Castle — once seen — always among them, however many castles are nearer)
        const shown = castles.filter((q) => q.icon !== '✝' && q.icon !== '❄').slice(0, 3);
        for (const q of castles) if (q.icon === '❄') shown.push(q);
        for (const c of shown) {
            const cx = (c.x - charPos.x) * scale, cz = (c.z - charPos.z) * scale;
            const icon = c.icon || '🏰'; // (🧙 a wizards' tower)
            const kind = icon === '🧙' ? 'tower' : icon === '❄' ? 'ice' : 'castle';
            this.minimapCastles.push(icon === '🏰' ? c.name : `${icon} ${c.name}`);
            if (inside(cx, cz, BADGE)) {
                badge(cx, cz, kind);
                label(c.name.replace(/^(Замок|Крепость|Академия) /, ''), cx, Math.max(-hh + 12, cz - BADGE - 4));
            } else {
                const a = Math.atan2(cz, cx);
                const m = BADGE + 9;
                const k = Math.min((hw - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
                const bx = Math.cos(a) * k, by = Math.sin(a) * k;
                badge(bx, by, kind, a);
                // the distance: next to the badge, towards the middle of the map
                const up = by > 0 ? -BADGE - 6 : BADGE + 19;
                bigLabel(distText(Math.hypot(cx, cz) / scale), bx - Math.cos(a) * 30, by + up);
            }
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
                bigLabel(`🚩 ${distText(Math.hypot(sx, sz) / scale)}`, tx, ty + 6);
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

    /**
     * The minimap in a cave (CaveMap.js): the cave from above at the hero's level, only what they have
     * seen; the ways out, the chests and crystals seen, zombies seen, the other players, me.
     * (ctx: translated to the middle, saved — restored here)
     */
    _drawCaveMap(ctx, cave, charPos, rotY, zombies, others, scale, hw, hh) {
        const mem = cave.mem;
        const cx = Math.round(charPos.x / 8) * 8, cz = Math.round(charPos.z / 8) * 8;
        this._renderCaveWindow(cave, cx, cz);
        const ci = this.caveImage, half = CAVE_WINDOW / 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ci.canvas, (ci.cx - half - charPos.x - 0.5) * scale, (ci.cz - half - charPos.z - 0.5) * scale, CAVE_WINDOW * scale, CAVE_WINDOW * scale);
        const inside = (x, y, m = 0) => Math.abs(x) < hw - m && Math.abs(y) < hh - m;
        const at = (x, z) => [(x - charPos.x) * scale, (z - charPos.z) * scale];
        const label = (text, x, y) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); };
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        // the crystals seen: a blue diamond
        if (cave.crystals) for (const cl of cave.crystals.values()) {
            if (!cl || !mem.has(cl.data.x, cl.data.z)) continue;
            const [x, y] = at(cl.data.x, cl.data.z);
            if (!inside(x, y, 4)) continue;
            ctx.fillStyle = '#5fd3ff'; ctx.strokeStyle = '#06324a'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // the chests seen: a little chest (grey when opened)
        for (const c of cave.chests) {
            const p = c.mesh.position;
            if (!mem.has(p.x, p.z)) continue;
            const [x, y] = at(p.x, p.z);
            if (!inside(x, y, 5)) continue;
            ctx.fillStyle = c.isOpen ? '#7d7466' : '#c88a2e'; ctx.strokeStyle = '#2b1a05'; ctx.lineWidth = 1.2;
            ctx.fillRect(x - 5, y - 3.5, 10, 7); ctx.strokeRect(x - 5, y - 3.5, 10, 7);
            ctx.fillStyle = '#ffd76a'; ctx.fillRect(x - 1, y - 1.5, 2, 3);
        }
        // zombies seen (their place opened)
        ctx.fillStyle = '#e74c3c'; ctx.strokeStyle = '#4a0000'; ctx.lineWidth = 1;
        for (const z of zombies) {
            if (z.isDead) continue;
            const q = z.group.position;
            if (!mem.has(q.x, q.z)) continue;
            const [x, y] = at(q.x, q.z);
            if (inside(x, y)) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        }
        // the ways out: a green door with «Выход»; the nearest one, beyond the map, by a pointer on its edge
        let near = null, nd = Infinity;
        for (const w of mem.ways) {
            const [x, y] = at(w.x, w.z);
            if (inside(x, y, 8)) {
                ctx.fillStyle = '#7ee08a'; ctx.strokeStyle = '#0c3b14'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#0c3b14'; ctx.fillRect(x - 2, y - 3, 4, 6);
                label('Выход', x, Math.max(-hh + 12, y - 9));
                nd = -1;
            } else if (nd >= 0) {
                const dd = Math.hypot(x, y);
                if (dd < nd) { nd = dd; near = [x, y]; }
            }
        }
        if (near && nd >= 0) {
            const a = Math.atan2(near[1], near[0]);
            const k = Math.min((hw - 9) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - 9) / Math.max(1e-6, Math.abs(Math.sin(a))));
            ctx.save(); ctx.translate(Math.cos(a) * k, Math.sin(a) * k); ctx.rotate(a);
            ctx.fillStyle = '#7ee08a'; ctx.strokeStyle = '#0c3b14'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
            const tx = Math.max(-hw + 34, Math.min(hw - 34, Math.cos(a) * (k - 18))), ty = Math.max(-hh + 10, Math.min(hh - 4, Math.sin(a) * (k - 16) + 3));
            label(`Выход ${Math.round(nd / scale)} м`, tx, ty);
        }
        // other players: a dot in their colour with the name (an arrow on the edge when far)
        for (const o of others) {
            const [x, y] = at(o.x, o.z);
            const col = o.color != null ? '#' + o.color.toString(16).padStart(6, '0') : '#3498db';
            const name = (o.name || '').slice(0, 8);
            if (inside(x, y, 6)) {
                ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                if (name) label(name, x, y - 7);
            } else {
                const a = Math.atan2(y, x);
                const k = Math.min((hw - 9) / Math.max(1e-6, Math.abs(Math.cos(a))), (hh - 9) / Math.max(1e-6, Math.abs(Math.sin(a))));
                ctx.save(); ctx.translate(Math.cos(a) * k, Math.sin(a) * k); ctx.rotate(a);
                ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
        }
        // me: a white arrow
        ctx.rotate(-rotY);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        // «Пещера» at the top: the map shows the cave
        ctx.font = 'bold 11px sans-serif';
        const text = '⛏ Пещера';
        const w = ctx.measureText(text).width + 14;
        ctx.fillStyle = 'rgba(15, 15, 25, 0.75)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(4, 4, w, 18, 9); else ctx.rect(4, 4, w, 18); // (top left: the way-out pointer may be at the top)
        ctx.fill();
        ctx.fillStyle = '#e8dcc0';
        ctx.textAlign = 'center';
        ctx.fillText(text, 4 + w / 2, 17);
        this.minimapCastles = [];
    }
}
