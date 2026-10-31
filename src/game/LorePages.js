/**
 * LorePages.js — the pages of the books of the world's history (LoreBooks.js), drawn on canvases:
 * the title page, the text flowing on from page to page, and the pictures — portraits and scenes
 * painted procedurally (no image files). BookReading turns them as every book's pages.
 *
 * `lorePages(book)` → the page canvases in order (a spread is two of them: left, right). A few
 * canvases of 256×360 and some text: drawn when the book is opened (well under a millisecond each).
 */

export const PAGE = { W: 256, H: 360, X0: 26, X1: 230, Y0: 46, Y1: 324 };
const PAPER = '#f3ead2', EDGE = '#c9b88f', INK = '#3a2a1a', RED = '#5a1a1a', SEPIA = '#7a6a4a';
const FONT = { h: 'bold 19px serif', p: '15px serif', cap: 'italic 14px serif' };
const LH = { h: 25, p: 20 };

function blank() {
    const c = document.createElement('canvas');
    c.width = PAGE.W; c.height = PAGE.H;
    const x = c.getContext('2d');
    x.fillStyle = PAPER; x.fillRect(0, 0, PAGE.W, PAGE.H);
    x.strokeStyle = EDGE; x.lineWidth = 3; x.strokeRect(8, 8, 240, 344);
    return { c, x };
}

/** Words into lines no wider than `w` (the first line `indent` narrower). */
export function wrap(measure, text, w, indent = 0) {
    const out = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (line && measure(t) > w - (out.length ? 0 : indent)) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
}

/**
 * The book's pages laid out: [{pic, caption} | {lines: [{t, font, x, y, center}]}]. `measure(font, s)` → width.
 * Text flows on to the next page; a picture takes a page of its own (after the page it was met on).
 */
export function layout(book, measure) {
    const pages = [], waiting = []; // (a picture met mid-page waits for the page to fill: no half-empty pages)
    let cur = null, y = PAGE.Y0;
    const flush = () => { if (cur && cur.lines.length) pages.push(cur); cur = null; y = PAGE.Y0; pages.push(...waiting.splice(0)); };
    const need = (h) => { if (!cur) { cur = { lines: [] }; y = PAGE.Y0; } if (y + h > PAGE.Y1 && cur.lines.length) { flush(); cur = { lines: [] }; } };
    const W = PAGE.X1 - PAGE.X0;
    for (const pg of book.pages) {
        if (pg.pic) { waiting.push({ pic: pg.pic, caption: pg.caption || '' }); if (!cur || !cur.lines.length) flush(); continue; }
        if (pg.h) {
            const ls = wrap((s) => measure(FONT.h, s), pg.h, W);
            need(LH.h * ls.length + 14);
            if (cur.lines.length) y += 12;
            for (const t of ls) { cur.lines.push({ t, font: FONT.h, color: RED, x: PAGE.W / 2, y, center: true }); y += LH.h; }
            y += 2;
            continue;
        }
        const ls = wrap((s) => measure(FONT.p, s), pg.p || '', W, 14);
        ls.forEach((t, i) => {
            need(LH.p);
            cur.lines.push({ t, font: FONT.p, color: INK, x: PAGE.X0 + (i === 0 ? 14 : 0), y });
            y += LH.p;
        });
        y += 6;
    }
    flush();
    return pages;
}

function titlePage(book) {
    const { c, x } = blank();
    x.textAlign = 'center';
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    x.fillStyle = hex(book.cover);
    x.font = 'bold 24px serif';
    const words = wrap((s) => x.measureText(s).width, book.title, 200);
    words.forEach((t, i) => x.fillText(t, 128, 120 + i * 30));
    const yb = 120 + words.length * 30;
    x.strokeStyle = '#8b6b3e'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(60, yb - 8); x.lineTo(196, yb - 8); x.stroke();
    x.fillStyle = SEPIA; x.font = 'italic 16px serif';
    wrap((s) => x.measureText(s).width, book.sub || '', 200).forEach((t, i) => x.fillText(t, 128, yb + 18 + i * 20));
    // an ornament: a little star of the history books
    x.fillStyle = hex(book.trim);
    star(x, 128, 262, 16, 7, 5);
    x.strokeStyle = '#8b6b3e'; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = SEPIA; x.font = 'italic 13px serif';
    x.fillText('Летопись мира', 128, 318);
    return c;
}

function textPage(pg, n) {
    const { c, x } = blank();
    for (const l of pg.lines) {
        x.font = l.font; x.fillStyle = l.color;
        x.textAlign = l.center ? 'center' : 'left';
        x.fillText(l.t, l.x, l.y);
    }
    x.textAlign = 'center'; x.fillStyle = SEPIA; x.font = '12px serif';
    x.fillText(String(n), 128, 342);
    return c;
}

function picPage(pg) {
    const { c, x } = blank();
    // the picture in a gilt frame
    const fx = 28, fy = 30, fw = 200, fh = 260;
    x.save();
    x.beginPath(); x.rect(fx, fy, fw, fh); x.clip();
    (PICTURES[pg.pic] || PICTURES.gods)(x, fx, fy, fw, fh);
    x.restore();
    x.strokeStyle = '#b08a3a'; x.lineWidth = 5; x.strokeRect(fx, fy, fw, fh);
    x.strokeStyle = '#6b4f1f'; x.lineWidth = 1.5; x.strokeRect(fx - 4, fy - 4, fw + 8, fh + 8);
    x.textAlign = 'center'; x.fillStyle = SEPIA; x.font = FONT.cap;
    wrap((s) => x.measureText(s).width, pg.caption || '', 210).slice(0, 2).forEach((t, i) => x.fillText(t, 128, 312 + i * 17));
    return c;
}

/**
 * The book's pages in order as drawers (each → its canvas): the title, then the pictures and the text as laid
 * out. Only the layout is done here (measuring words); a page is painted when it is first shown (a picture
 * takes a few ms — all of them at once was a long frame on opening the book).
 */
export function lorePages(book) {
    const m = document.createElement('canvas').getContext('2d');
    const measure = (font, s) => { m.font = font; return m.measureText(s).width; };
    const out = [() => titlePage(book)];
    let n = 1;
    for (const pg of layout(book, measure)) { const k = ++n; out.push(pg.pic ? () => picPage(pg) : () => textPage(pg, k)); }
    if (out.length % 2) out.push(() => { const { c, x } = blank(); x.fillStyle = '#c9b88f'; star(x, 128, 180, 10, 4, 5); x.fill(); return c; }); // (the last spread: an ornament)
    return out;
}

// ------------------------------------------------------------- painting
function star(x, cx, cy, R, r, n) {
    x.beginPath();
    for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r : R;
        x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
}
function grad(x, x0, y0, x1, y1, stops) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([t, col]) => g.addColorStop(t, col));
    return g;
}
function radial(x, cx, cy, r, stops) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach(([t, col]) => g.addColorStop(t, col));
    return g;
}
function ell(x, cx, cy, rx, ry, fill) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); }
function poly(x, pts, fill) { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fillStyle = fill; x.fill(); }
/** Starry sky dots (a fixed little scatter: the same picture every time). */
function stars(x, X, Y, W, H, n, col = '#ffffff') {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    x.fillStyle = col;
    for (let i = 0; i < n; i++) x.fillRect(X + rnd() * W, Y + rnd() * H, rnd() < 0.15 ? 2 : 1, rnd() < 0.15 ? 2 : 1);
}

/**
 * A head and shoulders: robe colour, skin, eyes, hair, beard… `o` = {skin, robe, trim, hair, beard, beardLen,
 * moustache, hat, hatCol, crown, glasses, lips, long (hair down to the shoulders), brows}.
 */
function bust(x, cx, cy, s, o) {
    // the shoulders and the robe
    poly(x, [[cx - 78 * s, cy + 150 * s], [cx - 64 * s, cy + 62 * s], [cx - 22 * s, cy + 40 * s], [cx + 22 * s, cy + 40 * s], [cx + 64 * s, cy + 62 * s], [cx + 78 * s, cy + 150 * s]], o.robe);
    if (o.trim) { x.strokeStyle = o.trim; x.lineWidth = 4 * s; x.beginPath(); x.moveTo(cx - 20 * s, cy + 42 * s); x.lineTo(cx, cy + 150 * s); x.lineTo(cx + 20 * s, cy + 42 * s); x.stroke(); }
    // long hair behind
    if (o.long) poly(x, [[cx - 34 * s, cy - 20 * s], [cx - 44 * s, cy + 70 * s], [cx - 20 * s, cy + 58 * s], [cx + 20 * s, cy + 58 * s], [cx + 44 * s, cy + 70 * s], [cx + 34 * s, cy - 20 * s]], o.hair);
    // the neck and the face
    x.fillStyle = o.skin; x.fillRect(cx - 9 * s, cy + 18 * s, 18 * s, 26 * s);
    ell(x, cx, cy, 30 * s, 38 * s, o.skin);
    // hair on top
    if (o.hair && !o.hat) { x.beginPath(); x.ellipse(cx, cy - 14 * s, 32 * s, 26 * s, 0, Math.PI, Math.PI * 2); x.fillStyle = o.hair; x.fill(); }
    // eyes, brows
    const ey = cy - 4 * s;
    for (const k of [-1, 1]) {
        ell(x, cx + k * 11 * s, ey, 5 * s, 3.2 * s, '#ffffff');
        ell(x, cx + k * 11 * s, ey, 2.4 * s, 2.6 * s, o.eyes || '#3a2a1a');
        x.strokeStyle = o.brows || o.hair || '#3a2a1a'; x.lineWidth = 2.4 * s;
        x.beginPath(); x.moveTo(cx + k * 5 * s, ey - 8 * s); x.lineTo(cx + k * 17 * s, ey - (o.proud ? 11 : 9) * s); x.stroke();
    }
    if (o.glasses) { x.strokeStyle = '#8a7a50'; x.lineWidth = 1.6 * s; for (const k of [-1, 1]) { x.beginPath(); x.arc(cx + k * 11 * s, ey, 7 * s, 0, Math.PI * 2); x.stroke(); } x.beginPath(); x.moveTo(cx - 4 * s, ey); x.lineTo(cx + 4 * s, ey); x.stroke(); }
    // nose, mouth
    x.strokeStyle = 'rgba(90,50,30,0.6)'; x.lineWidth = 1.6 * s;
    x.beginPath(); x.moveTo(cx, ey + 2 * s); x.lineTo(cx - 3 * s, ey + 15 * s); x.lineTo(cx + 2 * s, ey + 16 * s); x.stroke();
    x.strokeStyle = o.lips || '#8a3a2a'; x.lineWidth = 2 * s;
    x.beginPath(); x.moveTo(cx - 7 * s, cy + 22 * s); x.quadraticCurveTo(cx, cy + (o.smile ? 27 : 24) * s, cx + 7 * s, cy + 22 * s); x.stroke();
    // the beard, the moustache
    if (o.beard) {
        const L = (o.beardLen || 40) * s;
        poly(x, [[cx - 28 * s, cy + 6 * s], [cx - 22 * s, cy + 30 * s + L * 0.4], [cx, cy + 34 * s + L], [cx + 22 * s, cy + 30 * s + L * 0.4], [cx + 28 * s, cy + 6 * s], [cx + 14 * s, cy + 28 * s], [cx - 14 * s, cy + 28 * s]], o.beard);
    }
    if (o.moustache) {
        x.fillStyle = o.moustache;
        for (const k of [-1, 1]) { x.beginPath(); x.moveTo(cx, cy + 17 * s); x.quadraticCurveTo(cx + k * 14 * s, cy + 12 * s, cx + k * 30 * s, cy + 24 * s); x.quadraticCurveTo(cx + k * 14 * s, cy + 22 * s, cx, cy + 21 * s); x.fill(); }
    }
    // the hat / crown
    if (o.hat === 'wizard') {
        poly(x, [[cx - 46 * s, cy - 22 * s], [cx + 46 * s, cy - 22 * s], [cx + 12 * s, cy - 40 * s], [cx + 20 * s, cy - 120 * s], [cx - 14 * s, cy - 40 * s]], o.hatCol);
        ell(x, cx, cy - 24 * s, 50 * s, 8 * s, o.hatCol);
        x.fillStyle = '#ffd76a'; star(x, cx + 2 * s, cy - 62 * s, 8 * s, 3.5 * s, 5);
    } else if (o.hat === 'tricorn') {
        poly(x, [[cx - 52 * s, cy - 18 * s], [cx, cy - 30 * s], [cx + 52 * s, cy - 18 * s], [cx + 30 * s, cy - 58 * s], [cx - 30 * s, cy - 58 * s]], '#141418');
        x.strokeStyle = '#c9a227'; x.lineWidth = 2.5 * s; x.beginPath(); x.moveTo(cx - 50 * s, cy - 19 * s); x.lineTo(cx, cy - 31 * s); x.lineTo(cx + 50 * s, cy - 19 * s); x.stroke();
        x.fillStyle = '#f0f0f0'; ell(x, cx, cy - 42 * s, 6 * s, 6 * s, '#f0f0f0'); // (a little skull on it)
        x.fillStyle = '#141418'; x.fillRect(cx - 3 * s, cy - 43 * s, 2 * s, 2 * s); x.fillRect(cx + 1 * s, cy - 43 * s, 2 * s, 2 * s);
    } else if (o.crown === 'ice') {
        x.fillStyle = 'rgba(210,240,255,0.95)';
        for (let i = -3; i <= 3; i++) poly(x, [[cx + i * 10 * s - 5 * s, cy - 30 * s], [cx + i * 10 * s, cy - (52 - Math.abs(i) * 6) * s], [cx + i * 10 * s + 5 * s, cy - 30 * s]], 'rgba(200,236,255,0.95)');
        x.strokeStyle = '#7fc8f0'; x.lineWidth = 1.5 * s; x.beginPath(); x.moveTo(cx - 36 * s, cy - 30 * s); x.lineTo(cx + 36 * s, cy - 30 * s); x.stroke();
    }
}

export const PICTURES = {
    /** Coprus the Clever: proud, in a crimson robe, a wand in his hand; a beaten dragon behind him. */
    coprus(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#f0a050'], [0.55, '#c0502a'], [1, '#3a1a14']]); x.fillRect(X, Y, W, H);
        // the dragon's dark silhouette, its head down
        const dx = X + 120, dy = Y + 70;
        poly(x, [[dx - 90, dy + 40], [dx - 40, dy - 30], [dx, dy - 10], [dx + 30, dy - 60], [dx + 60, dy - 20], [dx + 90, dy + 30], [dx + 40, dy + 10], [dx, dy + 40]], 'rgba(40,20,20,0.75)');
        poly(x, [[dx + 60, dy + 20], [dx + 95, dy + 60], [dx + 70, dy + 70], [dx + 50, dy + 40]], 'rgba(40,20,20,0.75)');
        // the wand
        x.strokeStyle = '#4a2a14'; x.lineWidth = 4; x.beginPath(); x.moveTo(X + 34, Y + H - 40); x.lineTo(X + 52, Y + H - 110); x.stroke();
        ell(x, X + 52, Y + H - 114, 8, 8, radial(x, X + 52, Y + H - 114, 10, [[0, '#ffffff'], [0.4, '#ffd76a'], [1, 'rgba(255,160,40,0)']]));
        bust(x, X + 110, Y + 125, 0.9, { skin: '#e8b88a', robe: '#7a1414', trim: '#d4af37', hair: '#2a1a10', beard: '#2a1a10', beardLen: 14, eyes: '#2a2a40', proud: true, lips: '#7a2a20' });
    },
    /** Jovalilius Pravdius Notan: an old wise man, a long white beard, glasses, a blue starry hat; a goblet. */
    jovalilius(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#2a3a6a'], [1, '#101830']]); x.fillRect(X, Y, W, H);
        stars(x, X, Y, W, 110, 40, '#dfe8ff');
        // bookshelves behind
        for (let i = 0; i < 9; i++) { x.fillStyle = ['#7a2a2a', '#2a5a3a', '#6a5a2a', '#3a3a7a'][i % 4]; x.fillRect(X + 6 + i * 21, Y + 180, 15, 44); }
        x.fillStyle = '#4a3020'; x.fillRect(X, Y + 224, W, 8);
        bust(x, X + 100, Y + 135, 0.85, { skin: '#f0c8a8', robe: '#3b4fa8', trim: '#d8c060', hair: '#f4f4f4', beard: '#f4f4f4', beardLen: 70, brows: '#e0e0e0', glasses: true, hat: 'wizard', hatCol: '#2b3f9a', eyes: '#3a6aa0', smile: true });
        // a little goblet in his hand (only a herb drink, they say)
        poly(x, [[X + 160, Y + 220], [X + 176, Y + 220], [X + 172, Y + 236], [X + 164, Y + 236]], '#c9a227');
        x.fillStyle = '#c9a227'; x.fillRect(X + 167, Y + 236, 2, 10); x.fillRect(X + 162, Y + 246, 12, 3);
    },
    /** Liliazina: a beautiful sorceress, long auburn hair, a sea-blue gown, ribbons of water round her. */
    liliazina(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#bfe6f0'], [0.6, '#5aa8c8'], [1, '#1a4a6a']]); x.fillRect(X, Y, W, H);
        bust(x, X + 100, Y + 120, 0.85, { skin: '#f6d3bc', robe: '#1f7a9a', trim: '#bfefff', hair: '#a0401f', long: true, eyes: '#2a7a6a', lips: '#c0505a', smile: true, brows: '#7a3018' });
        // ribbons of water
        x.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
            x.strokeStyle = `rgba(${200 - k * 30},${240 - k * 10},255,0.8)`; x.lineWidth = 5 - k;
            x.beginPath();
            for (let t = 0; t <= 1.001; t += 0.05) {
                const a = t * Math.PI * 3 + k * 2, r = 70 + 18 * Math.sin(t * 6 + k);
                const px = X + 100 + Math.cos(a) * r, py = Y + 150 - t * 120 + Math.sin(a) * 20;
                t ? x.lineTo(px, py) : x.moveTo(px, py);
            }
            x.stroke();
        }
        for (let i = 0; i < 14; i++) ell(x, X + 20 + ((i * 53) % 160), Y + 20 + ((i * 37) % 120), 2.5, 3.5, 'rgba(230,250,255,0.9)');
        x.lineCap = 'butt';
    },
    /** Diabolos: a horned giant chained by the hoof in the dark under the world, a red glow far below (an engraving). */
    diabolos(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#120508'], [0.7, '#3a0c10'], [1, '#7a1a12']]); x.fillRect(X, Y, W, H);
        ell(x, X + W / 2, Y + H, 130, 70, radial(x, X + W / 2, Y + H, 140, [[0, 'rgba(255,120,40,0.7)'], [1, 'rgba(120,20,10,0)']]));
        const cx = X + W / 2;
        // the sleeping giant: a hunched shoulder, a bowed head, two horns
        poly(x, [[cx - 80, Y + 250], [cx - 70, Y + 150], [cx - 40, Y + 110], [cx + 40, Y + 110], [cx + 72, Y + 160], [cx + 84, Y + 250]], '#0a0305');
        ell(x, cx, Y + 100, 30, 34, '#0a0305');
        poly(x, [[cx - 22, Y + 82], [cx - 50, Y + 40], [cx - 56, Y + 20], [cx - 36, Y + 52], [cx - 10, Y + 70]], '#1a0a0c');
        poly(x, [[cx + 22, Y + 82], [cx + 50, Y + 40], [cx + 56, Y + 20], [cx + 36, Y + 52], [cx + 10, Y + 70]], '#1a0a0c');
        x.strokeStyle = 'rgba(200,120,70,0.5)'; x.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(cx - 70 + i * 17, Y + 140 + (i % 3) * 8); x.lineTo(cx - 60 + i * 17, Y + 240); x.stroke(); } // (engraving hatching)
        // the chain: links down from the hoof to a ring in the rock
        for (let i = 0; i < 9; i++) { x.strokeStyle = '#a89070'; x.lineWidth = 3; x.beginPath(); x.ellipse(cx + 60 + i * 2, Y + 200 + i * 6, 6, 3.5, i % 2 ? 0.2 : 1.3, 0, Math.PI * 2); x.stroke(); }
        stars(x, X, Y, W, 60, 14, '#c88a60');
    },
    /** The chain by the hoof: a hoof, heavy links, the ring in the stone. */
    diabolosChain(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#1a0a0c'], [1, '#4a1410']]); x.fillRect(X, Y, W, H);
        poly(x, [[X + 40, Y + 40], [X + 90, Y + 30], [X + 110, Y + 100], [X + 60, Y + 120]], '#0a0305');
        x.fillStyle = '#c8a050'; x.fillRect(X + 56, Y + 112, 50, 8); // the cuff
        for (let i = 0; i < 8; i++) { x.strokeStyle = i % 2 ? '#b09a7a' : '#8a7458'; x.lineWidth = 5; x.beginPath(); x.ellipse(X + 90 + i * 12, Y + 130 + i * 12, 12, 6, i % 2 ? 0.4 : 1.2, 0, Math.PI * 2); x.stroke(); }
        ell(x, X + 190, Y + 232, 22, 22, '#2a2a30'); ell(x, X + 190, Y + 232, 12, 12, '#0a0a10');
    },
    /** The high gods: golden figures of light over Venus, the Sun, the planets. */
    gods(x, X, Y, W, H) {
        x.fillStyle = '#05060f'; x.fillRect(X, Y, W, H);
        stars(x, X, Y, W, H, 90);
        ell(x, X + 20, Y + 20, 46, 46, radial(x, X + 20, Y + 20, 50, [[0, '#fff7d0'], [0.4, '#ffcf4a'], [1, 'rgba(255,140,30,0)']]));
        // Venus
        ell(x, X + 100, Y + 210, 70, 70, radial(x, X + 80, Y + 190, 90, [[0, '#f6e0a0'], [0.6, '#d8a85a'], [1, '#7a5a2a']]));
        x.strokeStyle = 'rgba(255,240,200,0.35)'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(X + 100, Y + 210, 66 - i * 4, 20 + i * 14, 0.2, 0, Math.PI * 2); x.stroke(); }
        // the gods: three tall figures of golden light
        for (const [fx, sc] of [[X + 60, 0.8], [X + 100, 1], [X + 140, 0.8]]) {
            const fy = Y + 130;
            ell(x, fx, fy - 40 * sc, 30 * sc, 60 * sc, radial(x, fx, fy - 40 * sc, 60 * sc, [[0, 'rgba(255,240,180,0.9)'], [1, 'rgba(255,200,80,0)']]));
            poly(x, [[fx - 12 * sc, fy], [fx - 6 * sc, fy - 60 * sc], [fx + 6 * sc, fy - 60 * sc], [fx + 12 * sc, fy]], '#ffe9a0');
            ell(x, fx, fy - 68 * sc, 7 * sc, 8 * sc, '#fff4c8');
        }
        // a little Earth and Mars
        ell(x, X + 175, Y + 60, 10, 10, '#3a7ad0'); ell(x, X + 178, Y + 58, 4, 3, '#4a9a4a');
        ell(x, X + 160, Y + 100, 6, 6, '#c0502a');
    },
    /** The Ice Queen: pale, white hair, a crown of ice, a gown of frost, snow falling; her castle far off. */
    iceQueen(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#dff4ff'], [0.5, '#8ac0e0'], [1, '#2a4a7a']]); x.fillRect(X, Y, W, H);
        poly(x, [[X + 140, Y + 120], [X + 152, Y + 60], [X + 160, Y + 80], [X + 170, Y + 40], [X + 182, Y + 84], [X + 192, Y + 70], [X + 200, Y + 120]], 'rgba(230,248,255,0.85)'); // (her castle)
        bust(x, X + 95, Y + 125, 0.85, { skin: '#eaf2fa', robe: '#9fd0f0', trim: '#ffffff', hair: '#f8fcff', long: true, eyes: '#4aa0e0', lips: '#7aa8d0', crown: 'ice', brows: '#c0d8f0' });
        for (let i = 0; i < 40; i++) ell(x, X + ((i * 47) % W), Y + ((i * 71) % H), 1.6, 1.6, 'rgba(255,255,255,0.9)');
    },
    /** The Ice Rod: a gift of the gods — a staff of blue ice with a great crystal, a glow round it. */
    iceRod(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#0e1a30'], [1, '#2a4a70']]); x.fillRect(X, Y, W, H);
        stars(x, X, Y, W, H, 30, '#cfe8ff');
        const cx = X + W / 2;
        ell(x, cx, Y + 62, 60, 60, radial(x, cx, Y + 62, 64, [[0, 'rgba(220,245,255,0.95)'], [0.4, 'rgba(120,200,255,0.5)'], [1, 'rgba(60,120,200,0)']]));
        x.fillStyle = grad(x, cx - 6, 0, cx + 6, 0, [[0, '#7fb8e0'], [0.5, '#e8f8ff'], [1, '#6aa0d0']]);
        x.fillRect(cx - 5, Y + 80, 10, 170);
        for (const yy of [120, 170, 220]) poly(x, [[cx - 12, Y + yy], [cx, Y + yy - 8], [cx + 12, Y + yy], [cx, Y + yy + 8]], '#bfefff');
        poly(x, [[cx, Y + 18], [cx + 20, Y + 50], [cx + 12, Y + 88], [cx - 12, Y + 88], [cx - 20, Y + 50]], '#dff6ff');
        poly(x, [[cx, Y + 18], [cx + 20, Y + 50], [cx, Y + 60]], '#9fd8ff');
        poly(x, [[cx, Y + 60], [cx + 12, Y + 88], [cx - 12, Y + 88]], '#7fc0f0');
    },
    /** Captain Black Moustache: a tricorn, a huge black moustache and beard, a red coat, his rapier. */
    blackbeard(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#4a5a7a'], [0.6, '#2a3040'], [1, '#141820']]); x.fillRect(X, Y, W, H);
        // the sea and a mast behind
        x.fillStyle = '#1a2a40'; x.fillRect(X, Y + 170, W, 90);
        x.fillStyle = '#3a2a1a'; x.fillRect(X + 160, Y, 8, 200);
        // the rapier
        x.strokeStyle = '#d8dde6'; x.lineWidth = 3; x.beginPath(); x.moveTo(X + 30, Y + 250); x.lineTo(X + 70, Y + 60); x.stroke();
        x.strokeStyle = '#c9a227'; x.lineWidth = 4; x.beginPath(); x.arc(X + 32, Y + 238, 9, 0, Math.PI * 2); x.stroke();
        bust(x, X + 108, Y + 125, 0.88, { skin: '#d8a882', robe: '#8a1a1a', trim: '#c9a227', hair: '#101010', beard: '#101010', beardLen: 30, moustache: '#080808', hat: 'tricorn', eyes: '#202020', brows: '#080808', proud: true });
    },
    /** The black ship: bigger than any other, black sails, skeletons at the rails, on a dark sea. */
    blackShip(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#3a3a5a'], [0.55, '#6a5a7a'], [0.56, '#1a2a3a'], [1, '#0a1420']]); x.fillRect(X, Y, W, H);
        ell(x, X + 160, Y + 40, 18, 18, 'rgba(240,240,220,0.9)'); // (the moon)
        // the hull
        poly(x, [[X + 14, Y + 150], [X + 186, Y + 150], [X + 170, Y + 190], [X + 30, Y + 190]], '#0c0c10');
        poly(x, [[X + 150, Y + 150], [X + 196, Y + 132], [X + 186, Y + 150]], '#0c0c10');
        // masts and black sails
        for (const [mx, h] of [[X + 60, 110], [X + 105, 130], [X + 148, 100]]) {
            x.fillStyle = '#1a1410'; x.fillRect(mx - 2, Y + 150 - h, 4, h);
            poly(x, [[mx - 26, Y + 160 - h], [mx + 26, Y + 160 - h], [mx + 22, Y + 130 - h * 0.35], [mx - 22, Y + 130 - h * 0.35]], '#202028');
            poly(x, [[mx - 22, Y + 136 - h * 0.3], [mx + 22, Y + 136 - h * 0.3], [mx + 18, Y + 142], [mx - 18, Y + 142]], '#18181e');
        }
        // the skull flag
        x.fillStyle = '#000'; x.fillRect(X + 107, Y + 18, 22, 14); ell(x, X + 118, Y + 25, 4, 4, '#eee');
        // skeletons at the rail
        for (let i = 0; i < 6; i++) { const sx = X + 36 + i * 24; ell(x, sx, Y + 140, 4, 4.5, '#e8e4d8'); x.fillStyle = '#e8e4d8'; x.fillRect(sx - 1, Y + 144, 2, 6); }
        // the waves
        x.strokeStyle = 'rgba(160,190,220,0.5)'; x.lineWidth = 2;
        for (let r = 0; r < 4; r++) { x.beginPath(); for (let i = 0; i <= 20; i++) { const px = X + i * 10, py = Y + 200 + r * 16 + Math.sin(i * 1.3 + r) * 3; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    },
    /** Flying Maxima: a wizard flying up through space, a golden trail, the planets below. */
    flyingMaxima(x, X, Y, W, H) {
        x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#02030a'], [0.7, '#141a40'], [1, '#2a5a9a']]); x.fillRect(X, Y, W, H);
        stars(x, X, Y, W, H, 110);
        // the round Earth below
        ell(x, X + 100, Y + H + 120, 190, 160, radial(x, X + 70, Y + H, 220, [[0, '#6ab0f0'], [0.5, '#2a6ab0'], [1, '#0a2a5a']]));
        x.strokeStyle = 'rgba(160,210,255,0.6)'; x.lineWidth = 4; x.beginPath(); x.ellipse(X + 100, Y + H + 120, 192, 162, 0, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
        ell(x, X + 170, Y + 50, 14, 14, radial(x, X + 166, Y + 46, 16, [[0, '#f6e0a0'], [1, '#b08040']])); // (Venus)
        ell(x, X + 30, Y + 80, 8, 8, '#c0502a'); // (Mars)
        // the golden trail, the flyer
        x.strokeStyle = 'rgba(255,207,74,0.8)'; x.lineWidth = 6; x.lineCap = 'round';
        x.beginPath(); x.moveTo(X + 40, Y + 230); x.quadraticCurveTo(X + 80, Y + 160, X + 120, Y + 110); x.stroke();
        x.strokeStyle = 'rgba(255,240,190,0.9)'; x.lineWidth = 2; x.stroke();
        x.lineCap = 'butt';
        const fx = X + 126, fy = Y + 100;
        poly(x, [[fx - 8, fy + 30], [fx, fy - 4], [fx + 10, fy - 2], [fx + 6, fy + 34]], '#3a2a8a'); // (the robe)
        ell(x, fx + 5, fy - 10, 6, 7, '#f0c8a8');
        poly(x, [[fx - 2, fy - 14], [fx + 12, fy - 14], [fx + 10, fy - 34]], '#2b2f9a');
        x.strokeStyle = '#3a2a8a'; x.lineWidth = 4; x.beginPath(); x.moveTo(fx + 4, fy); x.lineTo(fx + 22, fy - 22); x.stroke(); // (an arm up)
        ell(x, fx + 24, fy - 24, 9, 9, radial(x, fx + 24, fy - 24, 10, [[0, '#ffffff'], [1, 'rgba(255,207,74,0)']]));
    },
};
