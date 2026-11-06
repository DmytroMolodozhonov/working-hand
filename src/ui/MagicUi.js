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
import { arcaneShapes } from './ArcaneShapes.js';
import { MagicPainter, UI_PAL } from './MagicPainter.js';

const MENUS = '#main-menu, #pause-menu, #death-screen, #game-over, #victory-screen';
const HOVERABLE = 'button, .tab-btn, .pause-tab, .sub-tab, a[href], [role="tab"], label, select, summary, .world-card, .save-card';
const BACKS = /pause-exit-btn|pause-continue-btn|back|close|cancel/i;

export class MagicUi {
    constructor() {
        this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.host = null;
        this._hovered = null;
        this._build();
        this._bind();
        this._watch();
    }

    /** The pause shows the colours of the passage that led into this world (null — the interface's own). */
    setWorldPalette(p) { this.worldPal = p || null; if (this.host?.id === 'pause-menu') this._post({ type: 'host', on: true, kind: 'pause', pal: this.worldPal || UI_PAL }); }

    /** The drawing: in its own thread when the browser can (magicui.worker.js), else here (MagicPainter on the page). */
    _build() {
        const cv = document.createElement('canvas');
        cv.className = 'mu-whirl';
        this.cv = cv;
        const sc = document.createElement('canvas');
        sc.className = 'mu-sparks';
        sc.setAttribute('aria-hidden', 'true');
        document.body.appendChild(sc);
        this.sc = sc;
        const size = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 };
        if (typeof Worker === 'function' && cv.transferControlToOffscreen && sc.transferControlToOffscreen && !globalThis.__ZNS_MAGIC_NO_WORKER__) {
            try {
                const g = cv.transferControlToOffscreen(), s2 = sc.transferControlToOffscreen();
                const w = new Worker(new URL('./magicui.worker.js', import.meta.url), { type: 'module' });
                w.onmessage = (e) => { if (e.data?.type === 'ready' && !e.data.ok) { console.warn('MagicUi: the drawing thread has no WebGL —', e.data.why || ''); cv.classList.add('mu-flat'); } };
                w.onerror = (e) => { console.warn('MagicUi: the drawing thread failed —', e?.message || e); cv.classList.add('mu-flat'); };
                w.postMessage({ type: 'init', gl: g, sparks: s2, ...size, reduce: this.reduce, hq: !!globalThis.__muHQ }, [g, s2]);
                this.worker = w;
            } catch (e) { console.warn('MagicUi: no drawing thread —', e?.message || e); this.worker = null; }
        }
        if (!this.worker) {
            this.painter = new MagicPainter(cv, sc, { reduce: this.reduce, hq: !!globalThis.__muHQ });
            this.painter.setSize(size.w, size.h, size.dpr);
            if (!this.painter.gl) cv.classList.add('mu-flat'); // (no WebGL: the CSS gradient of theme.css stays)
        }
        addEventListener('resize', () => this._post({ type: 'size', w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }));
    }

    /** A word to the drawing (its thread, or the painter here — then its frames run on this page while a menu is open). */
    _post(m) {
        if (this.worker) { this.worker.postMessage(m); return; }
        const P = this.painter;
        if (!P) return;
        switch (m.type) {
            case 'size': P.setSize(m.w, m.h, m.dpr); break;
            case 'host': P.setHost(m.on, m.kind, m.pal); break;
            case 'ptr': P.pointer(m.x, m.y); break;
            case 'trail': P.trail(m.x, m.y, m.dx, m.dy); break;
            case 'motes': P.motes(m.x, m.y); break;
            case 'burst': P.burst(m.x, m.y); break;
        }
        if (P.on && !this._raf) { P._last = 0; const loop = (t) => { this._raf = 0; if (P.frame(t)) this._raf = requestAnimationFrame(loop); }; this._raf = requestAnimationFrame(loop); }
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
    /** The running ring of colour round each window (put in once; a window made later gets it at its first showing). */
    _rings() {
        for (const el of document.querySelectorAll('#main-menu > .menu-container, #pause-menu .pause-box, .death-box')) {
            if (el.querySelector(':scope > .mu-ring')) continue;
            const r = document.createElement('span');
            r.className = 'mu-ring'; r.setAttribute('aria-hidden', 'true');
            r.appendChild(document.createElement('i'));
            el.appendChild(r);
        }
    }

    _sync() {
        this._rings();
        try { (this.shapes ||= arcaneShapes()).apply(); } catch (e) { console.warn('ArcaneShapes:', e?.message || e); }
        const host = this._which();
        if (host !== this.host) {
            this.host = host;
            if (host) host.insertBefore(this.cv, host.firstChild); else this.cv.remove();
            const pause = host?.id === 'pause-menu';
            this._post({ type: 'host', on: !!host, kind: pause ? 'pause' : 'main', pal: pause ? (this.worldPal || UI_PAL) : UI_PAL });
        }
        this.sc.style.display = host && !this.reduce ? 'block' : 'none';
    }

    _bind() {
        const inMenu = (el) => el && el.closest && el.closest(MENUS);
        document.addEventListener('pointermove', (e) => {
            if (!this.host) return;
            const dx = e.clientX - (this._px ?? e.clientX), dy = e.clientY - (this._py ?? e.clientY);
            this._px = e.clientX; this._py = e.clientY;
            this._post({ type: 'ptr', x: e.clientX, y: e.clientY });
            if (!this.reduce && dx * dx + dy * dy > 9) this._post({ type: 'trail', x: e.clientX, y: e.clientY, dx, dy });
        }, { passive: true });
        document.addEventListener('pointerover', (e) => {
            if (!this.host) return;
            const el = e.target.closest?.(HOVERABLE);
            if (!el || el === this._hovered || !inMenu(el)) { if (!el) this._hovered = null; return; }
            this._hovered = el;
            if (el.disabled) return;
            uiSound('hover');
            // (from the pointer: reading the element's box here forced the page to lay itself out on every hover — a hitch)
            if (!this.reduce) this._post({ type: 'motes', x: e.clientX, y: e.clientY });
        }, { passive: true });
        document.addEventListener('pointerdown', (e) => {
            if (!this.host || !inMenu(e.target)) return;
            this._post({ type: 'burst', x: e.clientX, y: e.clientY }); // (a ring of light through the whirl and a burst of sparks)
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
    }
}
