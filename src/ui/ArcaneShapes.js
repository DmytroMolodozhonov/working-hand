/**
 * ArcaneShapes.js — the outlines of the magic interface (the author 06.11, with a drawing: «интерфейс не должен быть такой ровный, он
 * может быть кривой… вот как оно устроено: кнопки столбиком слева, а большая панель справа своим краем выгибается дугой в их сторону,
 * такой изгиб идёт по кнопкам; рамка не ровная»).
 *
 *  - the window (the main menu, the pause): a hand-drawn outline — its edges gently wave (no straight line anywhere), filled with
 *    the whirl's nebula, a rim of gold-violet-teal-rose light, and the running ring of colour (magic-ui.css .mu-ring) follows it;
 *  - the main menu's stage: the panel of the chosen section, its left edge one big arc bulging towards the buttons — the arc cuts
 *    the buttons' ends (the top and bottom ones long, the middle ones shorter), exactly as in the drawing.
 * Drawn once as SVG and only redrawn when a window changes its size (ResizeObserver): nothing of it moves per frame, so it costs
 * nothing while the menus are open. The shape of the window also clips its contents (clip-path), so the nebula never shows past it.
 */

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** A soft waving offset along the outline (deterministic per window: `seed`). */
const wave = (t, seed, amp) => amp * (Math.sin(t * 0.021 + seed) * 0.6 + Math.sin(t * 0.0537 + seed * 2.3) * 0.3 + Math.sin(t * 0.11 + seed * 0.7) * 0.1);

/**
 * The points round a rounded box `w × h`, `inset` from its edge, corners of radius `rad`, waving by `amp`; `left(y)` — an optional
 * left edge (x as a function of y), for the stage's arc.
 */
function outline(w, h, { inset = 4, rad = 34, amp = 3.5, seed = 1, left = null, step = 9 } = {}) {
    const pts = [];
    const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
    let s = 0;
    const push = (x, y, nx, ny) => { const d = wave(s, seed, amp); pts.push([x + nx * d, y + ny * d]); s += step; };
    const corner = (cx, cy, a0) => { for (let k = 1; k < 8; k++) { const a = a0 + (k / 8) * Math.PI / 2; push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, Math.cos(a), Math.sin(a)); } };
    const lx = left ? left : () => x0;
    const topL = lx(y0);
    // top edge (left → right)
    for (let x = topL + (left ? 0 : rad); x < x1 - rad; x += step) push(x, y0, 0, -1);
    corner(x1 - rad, y0 + rad, -Math.PI / 2);
    for (let y = y0 + rad; y < y1 - rad; y += step) push(x1, y, 1, 0);
    corner(x1 - rad, y1 - rad, 0);
    const botL = lx(y1);
    for (let x = x1 - rad; x > botL + (left ? 0 : rad); x -= step) push(x, y1, 0, 1);
    if (left) {
        for (let y = y1; y > y0; y -= step) push(lx(y), y, -1, 0);
    } else {
        corner(x0 + rad, y1 - rad, Math.PI / 2);
        for (let y = y1 - rad; y > y0 + rad; y -= step) push(x0, y, -1, 0);
        corner(x0 + rad, y0 + rad, Math.PI);
    }
    return 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L') + ' Z';
}

function svgEl(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

/** The fill and the rim of a shape: the whirl's nebula and a ribbon of its colours. */
function makeSvg(cls, kind) {
    const id = 'ar' + (++uid);
    const svg = svgEl('svg', { class: cls, 'aria-hidden': 'true' });
    const defs = svgEl('defs');
    const lin = (gid, x1, y1, x2, y2, stops) => { const g = svgEl('linearGradient', { id: gid, x1, y1, x2, y2 }); for (const [o, c, a] of stops) g.appendChild(svgEl('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })); defs.appendChild(g); };
    const rad = (gid, cx, cy, r, stops) => { const g = svgEl('radialGradient', { id: gid, cx, cy, r }); for (const [o, c, a] of stops) g.appendChild(svgEl('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })); defs.appendChild(g); };
    if (kind === 'stage') {
        lin(id + 'f', '0', '0', '0.3', '1', [['0', '#2a1a6e', 0.62], ['1', '#0c0726', 0.74]]);
        rad(id + 'a', '0.08', '0.5', '0.55', [['0', '#ff6ec8', 0.20], ['1', '#ff6ec8', 0]]);
        rad(id + 'b', '0.85', '0.1', '0.6', [['0', '#7ee8ff', 0.12], ['1', '#7ee8ff', 0]]);
    } else {
        lin(id + 'f', '0', '0', '0.35', '1', [['0', '#1e1350', 0.95], ['1', '#09051a', 0.96]]);
        rad(id + 'a', '0.05', '0.0', '0.8', [['0', '#7b5cff', 0.38], ['1', '#7b5cff', 0]]);
        rad(id + 'b', '1.0', '1.0', '0.75', [['0', '#3cc8ff', 0.18], ['1', '#3cc8ff', 0]]);
    }
    lin(id + 'r', '0', '0', '1', '1', [['0', '#ffd76a', 0.95], ['0.32', '#a78bff', 0.9], ['0.62', '#7ee8ff', 0.7], ['1', '#ff7ac8', 0.9]]);
    svg.appendChild(defs);
    const paths = [
        svgEl('path', { fill: `url(#${id}f)` }),
        svgEl('path', { fill: `url(#${id}a)` }),
        svgEl('path', { fill: `url(#${id}b)` }),
        svgEl('path', { fill: 'none', stroke: `url(#${id}r)`, 'stroke-width': '7', 'stroke-opacity': '0.16', 'stroke-linejoin': 'round' }), // (the glow)
        svgEl('path', { fill: 'none', stroke: `url(#${id}r)`, 'stroke-width': kind === 'stage' ? '1.8' : '2.2', 'stroke-linejoin': 'round' }),
    ];
    for (const p of paths) svg.appendChild(p);
    svg._paths = paths;
    return svg;
}

const ringMask = (w, h, d) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='${NS}' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><path d='${d}' fill='none' stroke='#000' stroke-width='3.2' stroke-linejoin='round'/></svg>`)}")`;

export class ArcaneShapes {
    constructor() {
        this.items = new Map();
        this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { for (const e of es) this._redraw(e.target); }) : null;
    }

    /** Give the windows their shapes (again for a window made later: it is called at every showing of a menu). */
    apply() {
        if (!this.ro) return;
        for (const el of document.querySelectorAll('#main-menu > .menu-container, #pause-menu .pause-box')) {
            if (this.items.has(el)) continue;
            const frame = makeSvg('ar-frame', 'frame');
            el.insertBefore(frame, el.firstChild);
            el.classList.add('ar-shaped');
            const it = { frame, seed: 1 + this.items.size * 2.7, stage: null, content: null };
            if (el.matches('#main-menu > .menu-container')) {
                it.content = el.querySelector(':scope > .tab-content');
                if (it.content) { it.stage = makeSvg('ar-stage', 'stage'); el.insertBefore(it.stage, it.content); this.ro.observe(it.content); }
            }
            this.items.set(el, it);
            this.ro.observe(el);
        }
    }

    _redraw(target) {
        const el = this.items.has(target) ? target : [...this.items.keys()].find((k) => this.items.get(k).content === target);
        const it = el && this.items.get(el);
        if (!it) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        if (w < 40 || h < 40) return;
        const d = outline(w, h, { inset: 3, rad: Math.min(46, h * 0.08), amp: 3.2, seed: it.seed, step: 10 });
        it.frame.setAttribute('viewBox', `0 0 ${w} ${h}`);
        it.frame.setAttribute('width', w); it.frame.setAttribute('height', h);
        for (const p of it.frame._paths) p.setAttribute('d', d);
        el.style.clipPath = `path('${d}')`;
        const ring = el.querySelector(':scope > .mu-ring');
        if (ring) { const m = ringMask(w, h, d); ring.style.webkitMaskImage = ring.style.maskImage = m; ring.classList.add('ar-masked'); }
        // the figure (the author's drawing): the buttons fill the height on the left and their right ends ARE one arc; the section's
        // panel starts right at that arc. One arc for both: x(y) — in the container's coordinates.
        if (it.stage && it.content) {
            const c = it.content, tabs = el.querySelector('.tabs');
            const wide = innerWidth > 600 && tabs && getComputedStyle(tabs).flexDirection === 'column';
            it.stage.style.display = wide ? '' : 'none';
            const btns = tabs ? [...tabs.querySelectorAll('.tab-btn')].filter((b) => b.offsetParent) : [];
            if (!wide) { for (const b of btns) b.style.clipPath = ''; return; }
            const yT = Math.min(tabs.offsetTop, c.offsetTop), yB = Math.max(tabs.offsetTop + tabs.offsetHeight, c.offsetTop + c.offsetHeight);
            const xE = tabs.offsetLeft + tabs.offsetWidth; // (where the arc meets the top and the bottom)
            const B = Math.min(96, tabs.offsetWidth * 0.32); // (its depth in the middle)
            const mid = (yT + yB) / 2, half = (yB - yT) / 2, GAP = 5;
            const arcX = (y) => { const u = Math.max(-1, Math.min(1, (y - mid) / half)); return xE - B * Math.sqrt(1 - u * u); };
            // the buttons: each cut along the arc (its own clip-path in its own coordinates)
            for (const b of btns) {
                const bt = b.offsetTop, bh = b.offsetHeight, bl = b.offsetLeft, pts = ['0px 0px'];
                for (let k = 0; k <= 10; k++) { const y = bt + bh * k / 10; pts.push(`${(arcX(y) - GAP - bl).toFixed(1)}px ${(y - bt).toFixed(1)}px`); }
                pts.push(`0px ${bh}px`);
                b.style.clipPath = `polygon(${pts.join(',')})`;
            }
            // the panel: from the arc to the right edge of the section, top and bottom with the buttons
            const L = xE - B + GAP, R = c.offsetLeft + c.offsetWidth, sw = R - L + 2, sh = yB - yT;
            const lx = (yl) => arcX(yl + yT) + GAP - L;
            const ds = outline(sw, sh, { inset: 1, rad: 30, amp: 1.6, seed: it.seed + 5, left: lx, step: 8 });
            Object.assign(it.stage.style, { left: L + 'px', top: yT + 'px', width: sw + 'px', height: sh + 'px' });
            it.stage.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
            for (const p of it.stage._paths) p.setAttribute('d', ds);
        }
    }
}
