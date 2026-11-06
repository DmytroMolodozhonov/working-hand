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

/** The figure (the main menu): one shape for the buttons and the panel; the buttons' side a shade deeper; the arc between them a seam of light. */
function makeFigure() {
    const id = 'ar' + (++uid);
    const svg = svgEl('svg', { class: 'ar-stage', 'aria-hidden': 'true' });
    const defs = svgEl('defs');
    const lin = (gid, x1, y1, x2, y2, stops) => { const g = svgEl('linearGradient', { id: gid, x1, y1, x2, y2 }); for (const [o, c, a] of stops) g.appendChild(svgEl('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })); defs.appendChild(g); };
    const rad = (gid, cx, cy, r, stops) => { const g = svgEl('radialGradient', { id: gid, cx, cy, r }); for (const [o, c, a] of stops) g.appendChild(svgEl('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })); defs.appendChild(g); };
    lin(id + 'f', '0', '0', '0.25', '1', [['0', '#24165c', 0.72], ['1', '#0d0828', 0.8]]);
    rad(id + 'a', '0.32', '0.5', '0.5', [['0', '#b06bff', 0.20], ['1', '#b06bff', 0]]);
    rad(id + 'b', '0.95', '0.05', '0.55', [['0', '#7ee8ff', 0.10], ['1', '#7ee8ff', 0]]);
    lin(id + 'l', '0', '0', '1', '0', [['0', '#0a0620', 0.55], ['1', '#160d40', 0.35]]);
    lin(id + 's', '0', '0', '0', '1', [['0', '#ffd76a', 0.0], ['0.12', '#ffd76a', 0.9], ['0.5', '#c9a4ff', 1], ['0.88', '#7ee8ff', 0.9], ['1', '#7ee8ff', 0.0]]);
    lin(id + 'r', '0', '0', '1', '1', [['0', '#ffd76a', 0.55], ['0.4', '#a78bff', 0.45], ['1', '#7ee8ff', 0.35]]);
    const cp = svgEl('clipPath', { id: id + 'c' }); const cpp = svgEl('path'); cp.appendChild(cpp); defs.appendChild(cp);
    svg.appendChild(defs);
    const P = (a) => { const e = svgEl('path', a); svg.appendChild(e); return e; };
    svg._shape = [P({ fill: `url(#${id}f)` }), P({ fill: `url(#${id}a)` }), P({ fill: `url(#${id}b)` }), cpp];
    svg._left = P({ fill: `url(#${id}l)`, 'clip-path': `url(#${id}c)` });
    svg._arcGlow = P({ fill: 'none', stroke: `url(#${id}s)`, 'stroke-width': '9', 'stroke-opacity': '0.22', 'stroke-linecap': 'round' });
    svg._arc = P({ fill: 'none', stroke: `url(#${id}s)`, 'stroke-width': '2', 'stroke-linecap': 'round' });
    svg._rim = P({ fill: 'none', stroke: `url(#${id}r)`, 'stroke-width': '1.4' });
    return svg;
}

/** What each section is, in a few words under its name (the tall buttons say what is behind them). */
const CAPTIONS = {
    'tab-game': 'Свой мир — продолжить или начать новый', 'tab-mp': 'Вместе с друзьями', 'tab-character': 'Лицо, волосы, одежда героя',
    'tab-spells': 'Заклинания, зелья, пентаграммы', 'tab-mechanics': 'Как устроен мир', 'tab-settings': 'Звук, камера, графика, голос',
};

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
                if (it.content) { it.stage = makeFigure(); el.insertBefore(it.stage, it.content); this.ro.observe(it.content); }
                // the buttons: a big sign, the name and a line of what is behind it
                for (const b of el.querySelectorAll('.tabs .tab-btn')) {
                    if (b.querySelector('.ar-txt')) continue;
                    const t = b.textContent.trim(), m = t.match(/^(\S+)\s+(.*)$/u);
                    const ico = m && !/[А-Яа-яA-Za-z]/.test(m[1]) ? m[1] : '', name = ico ? m[2] : t;
                    b.textContent = '';
                    if (ico) { const i = document.createElement('span'); i.className = 'ar-ico'; i.textContent = ico; b.appendChild(i); }
                    const tx = document.createElement('span'); tx.className = 'ar-txt';
                    const n = document.createElement('b'); n.textContent = name; tx.appendChild(n);
                    const cap = CAPTIONS[b.dataset.tab];
                    if (cap) { const sm = document.createElement('small'); sm.textContent = cap; tx.appendChild(sm); }
                    b.appendChild(tx);
                }
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
        const d = outline(w, h, { inset: 3, rad: Math.min(40, h * 0.07), amp: 1.1, seed: it.seed, step: 10 }); // (a calm living edge — no wobble)
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
            const B = Math.min(70, tabs.offsetWidth * 0.24); // (its depth in the middle)
            const mid = (yT + yB) / 2, half = (yB - yT) / 2;
            const arcX = (y) => { const u = Math.max(-1, Math.min(1, (y - mid) / half)); return xE - B * Math.sqrt(1 - u * u); };
            // the buttons: each cut along the arc (its own clip-path in its own coordinates)
            for (const b of btns) {
                // (a button's offsets count from its offsetParent — the list itself when it is positioned: into the window's coordinates,
                //  else the button's light ran ~30 px past the arc — the author saw it on a press)
                const op = b.offsetParent === el ? null : b.offsetParent;
                const bt = b.offsetTop + (op ? op.offsetTop : 0), bh = b.offsetHeight, bl = b.offsetLeft + (op ? op.offsetLeft : 0), pts = ['0px 0px'];
                for (let k = 0; k <= 10; k++) { const y = bt + bh * k / 10; pts.push(`${(arcX(y) - 1 - bl).toFixed(1)}px ${(y - bt).toFixed(1)}px`); }
                pts.push(`0px ${bh}px`);
                b.style.clipPath = `polygon(${pts.join(',')})`;
            }
            // the figure: one calm shape round the buttons and the panel; the buttons' side deeper; the arc a seam of light
            const L = tabs.offsetLeft, R = c.offsetLeft + c.offsetWidth, sw = R - L, sh = yB - yT;
            const ds = outline(sw, sh, { inset: 1, rad: 26, amp: 0, step: 8 });
            const arcPts = []; for (let k = 0; k <= 40; k++) { const y = yT + sh * k / 40; arcPts.push(`${(arcX(y) - L).toFixed(1)} ${(y - yT).toFixed(1)}`); }
            const arcD = 'M' + arcPts.join(' L');
            Object.assign(it.stage.style, { left: L + 'px', top: yT + 'px', width: sw + 'px', height: sh + 'px' });
            it.stage.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
            for (const p of it.stage._shape) p.setAttribute('d', ds);
            it.stage._left.setAttribute('d', `M0 0 L${arcPts.join(' L')} L0 ${sh} Z`);
            it.stage._arcGlow.setAttribute('d', arcD); it.stage._arc.setAttribute('d', arcD);
            it.stage._rim.setAttribute('d', ds);
        }
    }
}
