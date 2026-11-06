/**
 * magicui.worker.js — the magic interface's drawing in its own thread (the author 06.11: «подтормаживает… может, потому что на
 * процессоре»): the whirl behind the menus (WebGL — the graphics card) and the sparks over them, on OffscreenCanvases handed over by
 * MagicUi. The page's thread only tells it what happens (the cursor, a click, which menu is open) — the buttons stay quick.
 *
 * Messages: init {gl, sparks, w, h, dpr, reduce, hq} · size {w, h, dpr} · host {on, kind, pal} · ptr {x, y} · trail {x, y, dx, dy} ·
 * motes {x, y} · burst {x, y}.
 */
import { MagicPainter } from './MagicPainter.js';

let P = null, raf = 0;
const nextFrame = (f) => (typeof self.requestAnimationFrame === 'function' ? self.requestAnimationFrame(f) : setTimeout(() => f(performance.now()), 16));
const loop = (t) => { raf = 0; if (P && P.frame(t)) raf = nextFrame(loop); };
const wake = () => { if (P && P.on && !raf) { P._last = 0; raf = nextFrame(loop); } };

self.onmessage = (e) => {
    const m = e.data || {};
    try {
        switch (m.type) {
            case 'init':
                P = new MagicPainter(m.gl, m.sparks, { reduce: m.reduce, hq: m.hq });
                P.setSize(m.w, m.h, m.dpr);
                self.postMessage({ type: 'ready', ok: !!P.gl });
                break;
            case 'size': P?.setSize(m.w, m.h, m.dpr); break;
            case 'host': P?.setHost(m.on, m.kind, m.pal); break;
            case 'ptr': P?.pointer(m.x, m.y); break;
            case 'trail': P?.trail(m.x, m.y, m.dx, m.dy); break;
            case 'motes': P?.motes(m.x, m.y); break;
            case 'burst': P?.burst(m.x, m.y); break;
        }
        wake();
    } catch (err) { self.postMessage({ type: 'ready', ok: false, why: String(err?.message || err) }); }
};
