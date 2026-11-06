/**
 * PortalLoader.js — the loading of a world as a passage into it (the author 05.11: «загрузка — как водоворот, который засасывает тебя и
 * ведёт в магический мир; интересная, многообразная, не повторяющаяся; плавно, будто из реального мира попал в волшебный; потом раз — и
 * заспавнился»; and the bug: «интерфейс на секунду-две накладывается на загрузку» — the old screen lay UNDER the game's interface, z 1000
 * against the HUD's 1200–3000; this one is over everything).
 *
 * Three acts:
 *  1. THE PULL (open, ~1.4 s): over the menu a swirl opens from the middle, the menu is drawn into it — it shrinks, turns and blurs away;
 *  2. THE PASSAGE (while the world is made): a whirlpool tunnel of living colour — spiral arms of nebula, sparks and star streaks rushing
 *     inward, a white-hot eye far ahead; a ring of runes round the eye lights up rune by rune as the loading goes on; the words of what
 *     is being made and a line of the world's lore under it;
 *  3. THE ARRIVAL (close, ~1.8 s): the rush speeds up, the eye opens in a flash of light that fills the screen — and fades, the world is there.
 * Never the same twice: the palette (of eight), the number of the arms, the way it turns, the pattern's seed, the runes, the order of the lines.
 * Drawn by the graphics card: one full-screen shader on its own small canvas (at ~0.6 of the screen's pixels — the nebula is soft anyway),
 * its own requestAnimationFrame (it stops when the passage is over); no WebGL — a CSS gradient swirl instead. Over everything (z-index), so no part
 * of the game's interface shows through it while the world is made.
 */

import { passageStart, passageTick, passageArrive, passageStop } from '../audio/MagicSound.js';
import { VERT, FRAG, passageSpeed } from './PortalShader.js';

/** Eight palettes (c0 c1 c2 — the arms, the eye's glow, the runes; c3 — the deep tint between the arms). */
export const PALETTES = [
    [[0.42, 0.18, 0.95], [0.25, 0.85, 1.0], [0.95, 0.55, 1.0], [0.12, 0.04, 0.3]], // arcane violet and teal
    [[1.0, 0.45, 0.08], [1.0, 0.85, 0.35], [1.0, 0.3, 0.2], [0.25, 0.04, 0.02]], // the phoenix's fire
    [[0.1, 0.75, 0.4], [0.75, 1.0, 0.5], [0.2, 0.95, 0.85], [0.02, 0.18, 0.1]], // the forest's emerald
    [[0.35, 0.7, 1.0], [0.85, 0.97, 1.0], [0.5, 0.85, 1.0], [0.03, 0.08, 0.22]], // the ice
    [[0.95, 0.2, 0.65], [0.55, 0.3, 1.0], [1.0, 0.75, 0.3], [0.2, 0.02, 0.18]], // the cosmos
    [[0.05, 0.45, 0.8], [0.2, 0.95, 0.9], [0.6, 0.9, 1.0], [0.01, 0.08, 0.18]], // the deep sea
    [[0.9, 0.75, 0.25], [1.0, 0.95, 0.7], [0.55, 0.35, 1.0], [0.18, 0.12, 0.02]], // the gods' gold
    [[0.6, 0.1, 0.25], [0.95, 0.4, 0.55], [0.4, 0.95, 0.75], [0.12, 0.02, 0.06]], // the twilight's wine
];

/** Lines of the world under the runes (atmosphere and gentle hints — never a secret of the game). */
const LORE = [
    'Говорят, фениксы прилетают к тем, кто ранен.', 'В городах волшебников продают зелья — от исцеления до крыльев.', 'Свиток сгорает — знание остаётся.',
    'Котёл любит огонь под собой и чистую воду.', 'Рыцари защищают свои замки до последнего.', 'В глубоких пещерах темно — возьмите «Люмос».',
    'На дне моря спят корабли с сокровищами.', 'Сова видит то, чего не видят люди.', 'Палочка слушается руки, а не слов.',
    'Чем дольше колдуешь, тем больше маны.', 'Лебеди с сиянием над озером — не простые птицы.', 'Чёрная магия оставляет следы на коже.',
    'Хорошему торговцу — честная плата.', 'Злые снеговики приходят с холодом.', 'Не каждое дерево в лесу — просто дерево.',
    'Тот, кто держит слово, обретает друзей.', 'Ночью по улицам ходит стража с факелами.', 'Море бывает спокойным — и бывает очень злым.',
    'Каждый мир — новый. Ни один не повторится.', 'Магия начинается с первого шага.',
];

/** Runes: a glyph is a few strokes on a stem — drawn, never a font (so they look the same on every computer). */
function drawRunes(ctx, R, n, seed, color, glow) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.translate(Math.cos(a) * R, Math.sin(a) * R);
        ctx.rotate(a + Math.PI / 2);
        const h = 30, w = 12;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2); // (the stem)
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) {
            const y0 = -h / 2 + rnd() * h * 0.7, side = rnd() < 0.5 ? -1 : 1, kind = rnd();
            if (kind < 0.45) { ctx.moveTo(0, y0); ctx.lineTo(side * w, y0 + h * 0.3); } // (a twig)
            else if (kind < 0.75) { ctx.moveTo(0, y0); ctx.lineTo(side * w, y0 + h * 0.15); ctx.lineTo(0, y0 + h * 0.3); } // (a hook)
            else { ctx.moveTo(-w * 0.8, y0); ctx.lineTo(w * 0.8, y0 + h * 0.35); } // (a cross-stroke)
        }
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

export class PortalLoader {
    constructor() {
        this.el = null;
        this.on = false;
        this.prog = 0; this.shown = 0;
        this.open = 0; this.out = 0;
        this.phase = 'off';
        this._raf = 0;
    }

    _build() {
        const root = document.createElement('div');
        root.id = 'portal-loader';
        root.innerHTML = `
            <canvas class="pl-gl"></canvas>
            <div class="pl-css"></div>
            <div class="pl-ring"><canvas class="pl-runes dim"></canvas><canvas class="pl-runes lit"></canvas></div>
            <div class="pl-text"><div class="pl-title">Волшебство только начинается</div><div class="pl-status"></div><div class="pl-lore"></div></div>`;
        document.body.appendChild(root);
        this.el = root;
        this.cv = root.querySelector('.pl-gl');
        this.status = root.querySelector('.pl-status');
        this.lore = root.querySelector('.pl-lore');
        this.ring = root.querySelector('.pl-ring');
        this.dimC = root.querySelector('.pl-runes.dim');
        this.litC = root.querySelector('.pl-runes.lit');
        this._gl();
    }

    _gl() {
        // the whirl in its own thread (portal.worker.js): it turns smoothly while the page's thread makes the world (the author 06.11:
        // «подтормаживает сильно» — drawn here, it stood still between the loading's long tasks). No OffscreenCanvas — drawn here.
        if (typeof Worker === 'function' && this.cv.transferControlToOffscreen && !globalThis.__ZNS_PORTAL_NO_WORKER__) {
            try {
                const off = this.cv.transferControlToOffscreen();
                const w = new Worker(new URL('./portal.worker.js', import.meta.url), { type: 'module' });
                w.onmessage = (e) => { if (e.data?.type === 'ready' && !e.data.ok) { console.warn('PortalLoader: the whirl\'s thread has no WebGL —', e.data.why || ''); this.el.classList.add('no-gl'); } };
                w.onerror = (e) => { console.warn('PortalLoader: the whirl\'s thread failed —', e?.message || e); this.el.classList.add('no-gl'); };
                w.postMessage({ type: 'init', canvas: off, w: window.innerWidth, h: window.innerHeight }, [off]);
                addEventListener('resize', () => w.postMessage({ type: 'size', w: window.innerWidth, h: window.innerHeight }));
                this.worker = w; this.gl = null;
                return;
            } catch (e) { console.warn('PortalLoader: no thread for the whirl —', e?.message || e); this.worker = null; }
        }
        const gl = this.cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' });
        if (!gl) { this.gl = null; this.el.classList.add('no-gl'); return; }
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        try {
            const pr = gl.createProgram();
            gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
            gl.useProgram(pr);
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(pr, 'p');
            gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            this.U = {};
            for (const n of ['uRes', 'uT', 'uOpen', 'uOut', 'uProg', 'uDir', 'uArms', 'uSeed', 'uC0', 'uC1', 'uC2', 'uC3']) this.U[n] = gl.getUniformLocation(pr, n);
            this.gl = gl;
            // (a software renderer — no real graphics card — would spend the very processor the world is made on: a small, slow picture there)
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            const ren = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
            this.soft = /swiftshader|llvmpipe|software|basic render/i.test(ren);
        } catch (e) {
            console.warn('PortalLoader: no shader —', e?.message || e);
            this.gl = null; this.el.classList.add('no-gl');
        }
    }

    /** A new passage: its own palette, arms, turn, runes and lines. */
    _roll() {
        const r = Math.random;
        this.pal = PALETTES[Math.floor(r() * PALETTES.length)];
        this.arms = 2 + Math.floor(r() * 5);
        this.dir = r() < 0.5 ? -1 : 1;
        this.seed = r() * 100;
        this.runeSeed = Math.floor(r() * 1e9);
        this.lines = LORE.slice().sort(() => r() - 0.5);
        this.li = 0;
        const c = this.pal[2].map((x) => Math.round(x * 255)).join(',');
        this.el.style.setProperty('--pl-rune', `rgb(${c})`);
        this.el.style.setProperty('--pl-c0', `rgb(${this.pal[0].map((x) => Math.round(x * 255)).join(',')})`);
        this.el.style.setProperty('--pl-c3', `rgb(${this.pal[3].map((x) => Math.round(x * 255)).join(',')})`);
        this.el.style.setProperty('--pl-spin', this.dir > 0 ? '-1turn' : '1turn'); // (the runes turn the way the whirl's stream turns: +angle in the shader = against the clock on the screen)
    }

    _runes() {
        const S = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.6), R = S * 0.435, n = 24 + Math.floor((this.runeSeed % 9));
        for (const [cv, glow, alpha] of [[this.dimC, false, 0.28], [this.litC, true, 1]]) {
            cv.width = cv.height = S;
            const x = cv.getContext('2d');
            x.clearRect(0, 0, S, S);
            x.translate(S / 2, S / 2);
            x.globalAlpha = alpha;
            drawRunes(x, R, n, this.runeSeed, getComputedStyle(this.el).getPropertyValue('--pl-rune') || '#c8a0ff', glow);
        }
        this.ring.style.width = this.ring.style.height = S + 'px';
    }

    /** Start the passage over the menu (`menu` — the element drawn into the swirl). */
    start(menu = null) {
        if (!this.el) this._build();
        this._roll();
        this.el.classList.remove('done', 'arrive');
        this.el.style.display = 'block';
        this.el.style.opacity = '1';
        this.prog = 0; this.shown = 0; this.open = 0; this.out = 0;
        this.phase = 'open';
        this.t0 = performance.now(); this.tOpen = this.t0;
        this.status.textContent = '';
        this._lore(true);
        this._runes();
        this.menu = menu;
        if (menu) { // (the menu is drawn into the whirl: it shrinks, turns and melts)
            menu.classList.remove('hidden');
            menu.style.transition = 'transform 1.4s cubic-bezier(.6,0,.9,.6), filter 1.4s, opacity 1.4s';
            requestAnimationFrame(() => { menu.style.transform = `scale(0.12) rotate(${this.dir * 75}deg)`; menu.style.filter = 'blur(8px) saturate(1.6)'; menu.style.opacity = '0'; });
        }
        this.on = true;
        this.tt = 0; this._lastT = 0;
        this.worker?.postMessage({ type: 'start', pal: this.pal, dir: this.dir, arms: this.arms, seed: this.seed });
        passageStart((this.pal === PALETTES[0] ? 0 : PALETTES.indexOf(this.pal) / PALETTES.length));
        if (!this._raf) this._raf = requestAnimationFrame((t) => this._frame(t));
    }

    _lore(first = false) {
        const line = this.lines[this.li++ % this.lines.length];
        if (first) { this.lore.textContent = line; this.loreAt = performance.now(); return; }
        this.lore.classList.add('fade');
        setTimeout(() => { this.lore.textContent = line; this.lore.classList.remove('fade'); }, 500);
        this.loreAt = performance.now();
    }

    /** The loading's progress (0…100) and its words. */
    progress(pct, text) {
        this.prog = Math.max(this.prog, Math.min(1, (pct || 0) / 100));
        this.worker?.postMessage({ type: 'prog', v: this.prog });
        void text; // (no words nor numbers of the loading: the passage itself shows it — the author)
    }

    /** The world is ready: the arrival — the flash — and the passage is gone. `done` when it is quite gone. */
    finish(done) {
        if (!this.on) { done?.(); return; }
        this.phase = 'arrive'; this.tOut = performance.now(); this.prog = 1;
        this.el.classList.add('arrive');
        this.worker?.postMessage({ type: 'arrive' });
        this._done = done;
        passageArrive();
    }

    /** Words over the passage (an error): it stays until the page goes. */
    message(text) { if (!this.el) this._build(); this.status.textContent = text; this.el.classList.add('err'); passageStop(); }

    _frame(now) {
        this._raf = 0;
        if (!this.on) return;
        const t = (now - this.t0) / 1000;
        // (the passage speeds up as the world comes near: the whirl's own clock runs faster with the progress — and faster still at the arrival)
        const dts = Math.min(0.1, (now - (this._lastT || now)) / 1000); this._lastT = now;
        this.tt = (this.tt || 0) + dts * passageSpeed(t, this.shown, this.out);
        passageTick(this.shown);
        this.open = Math.min(1, (now - this.tOpen) / 1400);
        if (this.open >= 1 && this.menu) { this.menu.classList.add('hidden'); this.menu.style.transform = ''; this.menu.style.filter = ''; this.menu.style.opacity = ''; this.menu.style.transition = ''; this.menu = null; }
        this.shown += (this.prog - this.shown) * 0.06;
        if (this.phase === 'arrive') {
            this.out = Math.min(1, (now - this.tOut) / 1500);
            if (this.out >= 1) {
                const k = Math.min(1, (now - this.tOut - 1500) / 900);
                this.el.style.opacity = String(1 - k); // (the light thins: the world is there)
                if (k >= 1) { this._stop(); return; }
            }
        }
        if (now - this.loreAt > 5200 && this.phase !== 'arrive') this._lore();
        // the runes' ring: lit as far round as the loading has gone (a conic mask), turning slowly the way the whirl turns
        this.litC.style.webkitMaskImage = this.litC.style.maskImage = `conic-gradient(#000 ${this.shown * 360}deg, transparent ${this.shown * 360 + 0.5}deg)`;
        this.ring.style.transform = `translate(-50%, -50%) scale(${1 + this.out * 2.5})`; // (its turning — CSS, runs while the page is busy)
        this.ring.style.opacity = String(Math.min(1, this.open * 1.5) * (1 - this.out));
        const gl = this.gl;
        if (this.worker) { /* (drawn in its own thread) */ } else if (gl) {
            this._skip = ((this._skip || 0) + 1) % (this.soft ? 6 : 1); // (soft: a picture every 6th frame)
            if (this._skip) { this._raf = requestAnimationFrame((tt) => this._frame(tt)); return; }
            // (the GPU's own budget: if a frame of the whirl comes slow, it is drawn smaller — the nebula is soft, the loading goes first)
            const dtf = now - (this._lastF || now); this._lastF = now;
            this.scale = this.scale || (this.soft ? 0.18 : 0.5);
            const sc = this.scale, w = Math.max(2, Math.round(window.innerWidth * sc)), h = Math.max(2, Math.round(window.innerHeight * sc));
            if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; gl.viewport(0, 0, w, h); }
            const U = this.U, P = this.pal;
            gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uT, this.tt); gl.uniform1f(U.uOpen, this.open); gl.uniform1f(U.uOut, this.out);
            gl.uniform1f(U.uProg, this.shown); gl.uniform1f(U.uDir, this.dir); gl.uniform1f(U.uArms, this.arms); gl.uniform1f(U.uSeed, this.seed);
            gl.uniform3fv(U.uC0, P[0]); gl.uniform3fv(U.uC1, P[1]); gl.uniform3fv(U.uC2, P[2]); gl.uniform3fv(U.uC3, P[3]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        } else {
            this.el.style.setProperty('--pl-open', String(this.open));
        }
        this._raf = requestAnimationFrame((tt) => this._frame(tt));
    }

    _stop() {
        this.on = false;
        this.phase = 'off';
        this.el.style.display = 'none';
        this.el.classList.add('done');
        this.worker?.postMessage({ type: 'stop' });
        const d = this._done; this._done = null;
        d?.();
    }
}
