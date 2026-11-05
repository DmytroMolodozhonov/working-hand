/**
 * MagicUi.js — the interface as magic, not as an interface (the author 05.11: «вдохновившись водоворотом и цветами — классный интерфейс…
 * чтобы реально как будто он магический; каждая деталь, каждая мелочь — магия, а не интерфейс; звуки уместные и приятные; окно Escape больше»).
 *
 *  - THE LIVING WHIRL behind the main menu and the pause: the loading's passage calmed down — a slow nebula turning round a soft eye, stars
 *    that twinkle; it leans after the cursor, and a click sends a ring of light through it (a ripple). In the pause it takes the palette of the
 *    passage that led into this world. One small canvas, one shader, drawn smaller than the screen (the nebula is soft) and at ≤ 30 frames
 *    a second; it stops when no menu is open; a software renderer gets a still picture now and then.
 *  - SPARKS: a light trail behind the cursor over a menu, a burst where you click, a few motes rising off what you hover. One 2D canvas,
 *    a pool of ≤ 220 sparks, nothing made per frame; asleep when no menu is open.
 *  - SOUNDS (MagicSound.uiSound): hover — a faint glass tick, click — a soft bell, a tab — two bells, a switch/slider — a pluck, «назад/выйти»
 *    — a low bell, the pause opens — a rising swirl of bells, closes — falling. Only over the menus (not the game's own interface).
 *  - the look itself (frames of living colour, rune corners, glowing buttons, the pause's swirl-in) — magic-ui.css.
 * Respects «reduce motion»: no whirl animation (a still frame) and no sparks.
 */

import { uiSound } from '../audio/MagicSound.js';
import { PALETTES } from './PortalLoader.js';

const MENUS = '#main-menu, #pause-menu, #death-screen, #game-over, #victory-screen';
const HOVERABLE = 'button, .tab-btn, .pause-tab, .sub-tab, a[href], [role="tab"], label, select, summary, .world-card, .save-card';
const BACKS = /pause-exit-btn|pause-continue-btn|back|close|cancel/i;

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision mediump float;
uniform vec2 uRes, uM; uniform float uT, uSeed;
uniform vec4 uR0, uR1, uR2;
uniform vec3 uC0, uC1, uC2, uC3;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; } return v; }
vec3 pal(float t){ t = fract(t); return t < 0.333 ? mix(uC0, uC1, t * 3.0) : t < 0.666 ? mix(uC1, uC2, (t - 0.333) * 3.0) : mix(uC2, uC0, (t - 0.666) * 3.0); }
float rip(vec4 R, vec2 p, inout vec2 d){
  if (R.w <= 0.0) return 0.0;
  vec2 rp = p - R.xy; float rr = length(rp) + 1e-4;
  float k = exp(-pow((rr - R.z * 0.9) * 11.0, 2.0)) * R.w * exp(-R.z * 1.7);
  d += rp / rr * k * 0.06;
  return k;
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 d = p - uM * 0.1;                                   // (the eye leans after the cursor)
  float g = rip(uR0, p, d) + rip(uR1, p, d) + rip(uR2, p, d); // (rings of light from the clicks)
  float r = length(d), a = atan(d.y, d.x);
  float sw = a + 1.7 * log(r + 0.08) + uT * 0.07;
  vec2 q = vec2(cos(sw), sin(sw));
  float n1 = fbm(q * 1.4 + vec2(r * 1.3 - uT * 0.05, uT * 0.03) + uSeed);
  float n2 = fbm(d * 2.3 + n1 * 1.6 + vec2(uT * 0.02, -uT * 0.015));
  float arms = 0.5 + 0.5 * sin(sw * 3.0 + n1 * 4.0 - r * 3.0);
  float band = smoothstep(0.3, 1.0, arms) * (0.4 + 0.7 * n2);
  vec3 col = pal(n1 * 0.8 + r * 0.2 + uT * 0.008) * band * 0.8;
  col += uC3 * 0.42 * (1.0 - band);
  col += pal(n2 + 0.3) * pow(n2, 3.0) * 0.75;
  col += mix(uC1, vec3(1.0, 0.97, 0.9), 0.45) * exp(-r * 4.5) * (0.3 + 0.06 * sin(uT * 0.9));
  // stars: still points that twinkle
  vec2 sp = p * 46.0, si = floor(sp); float sh = h21(si + 3.1);
  float st = step(0.975, sh) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5)) * (0.55 + 0.45 * sin(uT * (1.0 + sh * 3.0) + sh * 60.0));
  col += mix(vec3(1.0), uC1, 0.3) * st * 0.9;
  col += mix(uC2, vec3(1.0), 0.3) * g * 0.75;
  col *= smoothstep(1.55, 0.15, length(p)) * 0.78 + 0.22;
  gl_FragColor = vec4(col, 1.0);
}`;

/** The interface's own palette: the game's violet and teal with a touch of gold (theme.css --ui-violet, --ui-cyan, --ui-gold). */
const UI_PAL = [[0.45, 0.3, 1.0], [0.42, 0.88, 1.0], [1.0, 0.78, 0.4], [0.07, 0.035, 0.2]];
const SPARK_COLORS = ['#ffe9a8', '#a78bff', '#7ee8ff', '#ff9ad5', '#ffffff'];
const N_SPARKS = 220;

export class MagicUi {
    constructor() {
        this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.pal = UI_PAL;
        this.seed = Math.random() * 40;
        this.t = 0; this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
        this.rips = [[0, 0, 9, 0], [0, 0, 9, 0], [0, 0, 9, 0]]; this.ripI = 0;
        this.sp = Array.from({ length: N_SPARKS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, c: '#fff' }));
        this.spI = 0;
        this._raf = 0; this._last = 0; this._lastGl = 0;
        this.host = null;
        this._hovered = null;
        this._build();
        this._bind();
        this._watch();
    }

    /** The pause shows the colours of the passage that led into this world (null — the interface's own). */
    setWorldPalette(p) { this.worldPal = p || null; if (this.host?.id === 'pause-menu') this.pal = this.worldPal || UI_PAL; }

    _build() {
        const cv = document.createElement('canvas');
        cv.className = 'mu-whirl';
        this.cv = cv;
        const gl = cv.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
        if (gl) {
            try {
                const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
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
                for (const n of ['uRes', 'uM', 'uT', 'uSeed', 'uR0', 'uR1', 'uR2', 'uC0', 'uC1', 'uC2', 'uC3']) this.U[n] = gl.getUniformLocation(pr, n);
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                const ren = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
                this.soft = /swiftshader|llvmpipe|software|basic render/i.test(ren);
                this.gl = gl;
            } catch (e) { console.warn('MagicUi: no shader —', e?.message || e); this.gl = null; }
        }
        if (!this.gl) cv.classList.add('mu-flat'); // (no WebGL: the CSS gradient of theme.css stays)
        const sc = document.createElement('canvas');
        sc.className = 'mu-sparks';
        sc.setAttribute('aria-hidden', 'true');
        document.body.appendChild(sc);
        this.sc = sc;
        this.sx = sc.getContext('2d');
    }

    /** Which menu is open (the whirl lives behind it): the pause over the game, else the main menu, else none. */
    _which() {
        const pm = document.getElementById('pause-menu');
        if (pm && !pm.classList.contains('hidden')) return pm;
        const mm = document.getElementById('main-menu');
        if (mm && !mm.classList.contains('hidden') && mm.offsetParent !== null) return mm;
        return null;
    }

    _watch() {
        const pm = document.getElementById('pause-menu');
        let wasOpen = pm && !pm.classList.contains('hidden');
        const mo = new MutationObserver(() => {
            const open = pm && !pm.classList.contains('hidden');
            if (open !== wasOpen) {
                wasOpen = open;
                uiSound(open ? 'open' : 'close');
                if (open) { pm.classList.remove('mu-in'); void pm.offsetWidth; pm.classList.add('mu-in'); }
            }
            this._sync();
        });
        for (const id of ['pause-menu', 'main-menu']) { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }); }
        this._sync();
    }

    /** The whirl moves to the open menu (or sleeps). */
    _sync() {
        const host = this._which();
        if (host !== this.host) {
            this.host = host;
            if (host) {
                host.insertBefore(this.cv, host.firstChild);
                this.pal = host.id === 'pause-menu' ? (this.worldPal || UI_PAL) : UI_PAL;
            } else this.cv.remove();
        }
        this.sc.style.display = host && !this.reduce ? 'block' : 'none';
        if (host && !this._raf) { this._last = 0; this._raf = requestAnimationFrame((t) => this._frame(t)); }
    }

    _bind() {
        const inMenu = (el) => el && el.closest && el.closest(MENUS);
        document.addEventListener('pointermove', (e) => {
            if (!this.host) return;
            this.tmx = (e.clientX / innerWidth) * 2 - 1; this.tmy = -((e.clientY / innerHeight) * 2 - 1);
            if (this.reduce) return;
            const dx = e.clientX - (this._px ?? e.clientX), dy = e.clientY - (this._py ?? e.clientY);
            this._px = e.clientX; this._py = e.clientY;
            const v = Math.hypot(dx, dy);
            if (v > 3) for (let i = 0, n = Math.min(3, 1 + (v / 18) | 0); i < n; i++) this._spark(e.clientX - dx * Math.random(), e.clientY - dy * Math.random(), (Math.random() - 0.5) * 30 - dx * 0.6, (Math.random() - 0.5) * 30 - dy * 0.6 - 10, 0.5 + Math.random() * 0.5, 1 + Math.random() * 1.6);
        }, { passive: true });
        document.addEventListener('pointerover', (e) => {
            if (!this.host) return;
            const el = e.target.closest?.(HOVERABLE);
            if (!el || el === this._hovered || !inMenu(el)) { if (!el) this._hovered = null; return; }
            this._hovered = el;
            if (el.disabled) return;
            uiSound('hover');
            if (!this.reduce) {
                const b = el.getBoundingClientRect();
                for (let i = 0; i < 5; i++) this._spark(b.left + Math.random() * b.width, b.bottom - 2, (Math.random() - 0.5) * 20, -30 - Math.random() * 40, 0.7 + Math.random() * 0.6, 1 + Math.random() * 1.4);
            }
        }, { passive: true });
        document.addEventListener('pointerdown', (e) => {
            if (!this.host || !inMenu(e.target)) return;
            // a ring of light through the whirl and a burst of sparks
            const R = this.rips[this.ripI]; this.ripI = (this.ripI + 1) % 3;
            const m = Math.min(innerWidth, innerHeight);
            R[0] = (e.clientX - innerWidth / 2) / m; R[1] = -(e.clientY - innerHeight / 2) / m; R[2] = 0; R[3] = 1;
            if (!this.reduce) for (let i = 0; i < 26; i++) {
                const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 170;
                this._spark(e.clientX, e.clientY, Math.cos(a) * s, Math.sin(a) * s - 20, 0.5 + Math.random() * 0.7, 1.2 + Math.random() * 2);
            }
        }, { passive: true });
        document.addEventListener('click', (e) => {
            if (!this.host) return;
            const el = e.target.closest?.('button, .tab-btn, .pause-tab, .sub-tab, a[href], summary, .world-card, .save-card');
            if (!el || !inMenu(el) || el.disabled) return;
            const tab = el.matches('.tab-btn, .pause-tab, .sub-tab, [role="tab"]');
            uiSound(tab ? 'tab' : BACKS.test(el.id || '') || BACKS.test(el.className || '') ? 'back' : 'click');
        }, true);
        document.addEventListener('change', (e) => {
            if (!this.host || !inMenu(e.target)) return;
            if (e.target.matches('input[type="checkbox"], input[type="radio"], select, input[type="range"]')) uiSound('toggle');
        }, true);
        document.addEventListener('input', (e) => {
            if (!this.host || !inMenu(e.target) || !e.target.matches('input[type="range"]')) return;
            const now = performance.now();
            if (now - (this._rangeAt || 0) > 90) { this._rangeAt = now; uiSound('hover'); } // (a slider ticks as it moves, softly)
        }, true);
        addEventListener('resize', () => { this._sized = false; });
    }

    _spark(x, y, vx, vy, life, s) {
        const p = this.sp[this.spI]; this.spI = (this.spI + 1) % N_SPARKS;
        p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.s = s;
        p.c = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0];
    }

    _frame(now) {
        this._raf = 0;
        if (!this.host || !this.host.isConnected || this.host.classList.contains('hidden')) { this._sync(); if (!this.host) { this._clearSparks(); return; } }
        const dt = Math.min(0.1, this._last ? (now - this._last) / 1000 : 0.016);
        this._last = now;
        this.t += dt;
        this.mx += (this.tmx - this.mx) * Math.min(1, dt * 2.2); this.my += (this.tmy - this.my) * Math.min(1, dt * 2.2);
        for (const R of this.rips) if (R[3] > 0) { R[2] += dt; if (R[2] > 2.5) R[3] = 0; }
        this._drawWhirl(now);
        this._drawSparks(dt);
        this._raf = requestAnimationFrame((t) => this._frame(t));
    }

    _drawWhirl(now) {
        const gl = this.gl;
        if (!gl) return;
        // (≤ 30 a second; a software renderer — a still picture twice a second; «reduce motion» — a still picture)
        const soft = this.soft && !globalThis.__muHQ; // (__muHQ: the screenshots' stand wants the real picture)
        const gap = soft ? 500 : 33;
        if (now - this._lastGl < gap || (this.reduce && this._drawn)) return;
        this._lastGl = now;
        const sc = soft ? 0.2 : this.host.id === 'pause-menu' ? 0.38 : 0.5;
        const w = Math.max(2, Math.round(innerWidth * sc)), h = Math.max(2, Math.round(innerHeight * sc));
        if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; gl.viewport(0, 0, w, h); }
        const U = this.U, P = this.pal;
        gl.uniform2f(U.uRes, w, h); gl.uniform2f(U.uM, this.mx, this.my); gl.uniform1f(U.uT, this.t); gl.uniform1f(U.uSeed, this.seed);
        gl.uniform4fv(U.uR0, this.rips[0]); gl.uniform4fv(U.uR1, this.rips[1]); gl.uniform4fv(U.uR2, this.rips[2]);
        gl.uniform3fv(U.uC0, P[0]); gl.uniform3fv(U.uC1, P[1]); gl.uniform3fv(U.uC2, P[2]); gl.uniform3fv(U.uC3, P[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this._drawn = true;
    }

    _drawSparks(dt) {
        if (this.reduce) return;
        const c = this.sx, cv = this.sc, dpr = Math.min(2, devicePixelRatio || 1);
        if (!this._sized || cv.width !== Math.round(innerWidth * dpr)) { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); this._sized = true; }
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, innerWidth, innerHeight);
        c.globalCompositeOperation = 'lighter';
        let any = false;
        for (const p of this.sp) {
            if (!p.on) continue;
            p.life -= dt;
            if (p.life <= 0) { p.on = false; continue; }
            any = true;
            p.vx *= 1 - dt * 2.4; p.vy = p.vy * (1 - dt * 2.4) - 18 * dt; // (sparks rise and slow — light, not dust)
            p.x += p.vx * dt; p.y += p.vy * dt;
            const k = p.life / p.max, tw = 0.7 + 0.3 * Math.sin((p.x + p.y) * 0.3 + this.t * 20);
            c.globalAlpha = k * tw;
            c.fillStyle = p.c;
            const s = p.s * (0.5 + k * 0.8);
            c.beginPath(); c.arc(p.x, p.y, s * 2.6, 0, 6.283); c.globalAlpha = k * 0.18; c.fill(); // (a halo)
            c.globalAlpha = k * tw;
            c.beginPath(); c.arc(p.x, p.y, s, 0, 6.283); c.fill();
            if (p.s > 2.2) { c.fillRect(p.x - s * 3, p.y - 0.4, s * 6, 0.8); c.fillRect(p.x - 0.4, p.y - s * 3, 0.8, s * 6); } // (a star's cross on the big ones)
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        this._anySparks = any;
    }

    _clearSparks() {
        for (const p of this.sp) p.on = false;
        this.sx.clearRect(0, 0, this.sc.width, this.sc.height);
    }
}
