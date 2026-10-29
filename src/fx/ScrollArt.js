/**
 * ScrollArt.js — how a scroll looks inside (the author: «текст внутри свитка — контрастный, красивый, магический:
 * название красивым цветом по школе, буквицы, золотистые руны на краях, бумага с текстурой, потёртостями, печатью,
 * а может «картинка» — иллюстрация заклинания»).
 *
 * Everything is drawn on a 2D canvas context (no DOM here, no THREE): `paintParchment(x, W, H, spec)` — the paper (fibres,
 * stains, creases, burnt edges), a double frame with golden runes along the top and the bottom, the title in the
 * school's colour, a drop cap, the lines, a round picture of the spell (fire, water, ice, lightning, earth, wind, light,
 * life, dark, shield, house, planet, mind, key…) and a wax seal. The caller caches the canvas by `artKey(spec)`
 * (a spell, not a frame): drawing takes a few milliseconds once per kind of scroll.
 * Sizes: the canvas is 1024×440, shown ~2.2 m wide — the smallest text here is 24 px (≈ 33 px on a 1080p screen).
 */

/** The schools: the colour of the title (dark enough to read on the paper), the accent (frames, runes' glow), the seal. */
export const SCHOOLS = {
    fire: { ru: 'Огонь', ink: '#a31d00', accent: '#e8590c', glow: '#ffb347', seal: '#9c1b0e', motif: 'fire' },
    water: { ru: 'Вода', ink: '#0b4f94', accent: '#2a8bd9', glow: '#9fd8ff', seal: '#14518f', motif: 'water' },
    ice: { ru: 'Лёд', ink: '#1a6a8f', accent: '#5cc0e8', glow: '#e4f8ff', seal: '#2a7fa6', motif: 'ice' },
    lightning: { ru: 'Гроза', ink: '#6b4d00', accent: '#e0b400', glow: '#fff3a0', seal: '#7a5b00', motif: 'lightning' },
    earth: { ru: 'Земля', ink: '#6b3f12', accent: '#a0652a', glow: '#d8b480', seal: '#6b3f12', motif: 'earth' },
    wind: { ru: 'Воздух', ink: '#3a5c78', accent: '#7aa6c8', glow: '#eaf4ff', seal: '#456b88', motif: 'wind' },
    life: { ru: 'Жизнь', ink: '#1f6b1d', accent: '#4aa832', glow: '#c6f59a', seal: '#2a7a22', motif: 'life' },
    dark: { ru: 'Тьма', ink: '#7a0a2a', accent: '#a3123e', glow: '#ff5a86', seal: '#5e0a22', motif: 'dark' },
    light: { ru: 'Свет', ink: '#8a5a00', accent: '#e8a800', glow: '#fff0b0', seal: '#9a6a00', motif: 'light' },
    shield: { ru: 'Защита', ink: '#1b4f9e', accent: '#4a8be0', glow: '#bcd8ff', seal: '#1f4f94', motif: 'shield' },
    build: { ru: 'Стройка', ink: '#5c4528', accent: '#9c7b4a', glow: '#e8d2a0', seal: '#5c4528', motif: 'house' },
    space: { ru: 'Небеса', ink: '#3a1f7a', accent: '#6a3fc8', glow: '#c8b0ff', seal: '#3a1f7a', motif: 'planet' },
    mind: { ru: 'Разум', ink: '#7a1f8a', accent: '#b04ad0', glow: '#f0b8ff', seal: '#681f78', motif: 'mind' },
    key: { ru: 'Замки', ink: '#7a4a12', accent: '#b8782a', glow: '#ffd890', seal: '#7a4a12', motif: 'key' },
    mana: { ru: 'Мана', ink: '#1a4f9e', accent: '#3a8cf0', glow: '#a8d4ff', seal: '#1f4f94', motif: 'crystal' },
    heart: { ru: 'Здоровье', ink: '#9c1c2c', accent: '#d8384a', glow: '#ffb0b8', seal: '#8c1624', motif: 'heart' },
    arcane: { ru: 'Магия', ink: '#5a1a1a', accent: '#a7834a', glow: '#ffe9a8', seal: '#7a1f1f', motif: 'star' },
};

/** A spell → its school (the ones without a row fall back by their name, then to «Магия»). */
const SCHOOL_OF = {
    Hellfire: 'fire', ToTheSun: 'fire', Boom: 'fire', BombardoMaxima: 'fire', Bombardo: 'fire', Fire: 'fire', FireMaxima: 'fire', CircleAttack: 'fire', Fireworks: 'fire',
    FirefightingMaxima: 'water', LetItRain: 'water', Waterball: 'water', AirBubble: 'water', WaveAttack: 'water', WaterVortex: 'water', WaterVortexSuperMaxima: 'water', CreateBoard: 'water',
    IceMaxima: 'ice', IceCastle: 'ice', IceBridge: 'ice', Snowman: 'ice', Pilbidrio: 'ice', Frozen: 'ice',
    LightningStrike: 'lightning', Thunderwave: 'lightning', Electrum: 'lightning', JoltMaxima: 'lightning', Jolt: 'lightning',
    GroundVortex: 'earth', Groundprud: 'earth', Drawdown: 'earth', EarthquakeMaxima: 'earth', Earthquake: 'earth', LiquidationMaxima: 'earth', Breakthrough: 'earth', Unfurl: 'earth',
    WindImpulse: 'wind', LevitationMaxima: 'wind', LevitationSuperMaxima: 'wind', Levitation: 'wind', Wind: 'wind', Flight: 'wind',
    Alive: 'life', Overgrown: 'life', OvergrownMaxima: 'life',
    AvadaKedavra: 'dark', Die: 'dark', TotalDestruction: 'dark', Accentric: 'dark', GiveMyPower: 'dark', Invisibility: 'dark', Pentagranium: 'dark',
    LumosFollowing: 'light', Lumos: 'light', Inspirius: 'light', ProtectionGods: 'light', ProtectionGodsMaxima: 'light', VisibleGodi: 'light',
    ProtectionMaxima: 'shield', Protection: 'shield',
    CreateHouse: 'build', ImproveHouse: 'build', CreateCastle: 'build',
    CreatePlanet: 'space', EnlargePlanet: 'space', TerraformPlanet: 'space', PlanetLiquidation: 'space',
    Imperius: 'mind', ImperiusMaxima: 'mind', Brainrot: 'mind', BrainrotMaxima: 'mind',
    AlohomaraMaxima: 'key', Alohomara: 'key',
};

/** The school of a scroll item ({stat, spell, pent}). */
export function schoolOf(item) {
    if (!item) return 'arcane';
    if (item.stat === 'pentagram') return 'dark';
    if (item.stat === 'fatigue' || item.stat === 'mana') return 'mana';
    if (item.stat === 'hp') return 'heart';
    if (item.stat === 'flight') return 'wind';
    const sp = String(item.spell || '');
    if (SCHOOL_OF[sp]) return SCHOOL_OF[sp];
    if (/fire|flame|bomb|burn|sun/i.test(sp)) return 'fire';
    if (/water|wave|rain|bubble/i.test(sp)) return 'water';
    if (/ice|snow|frost|frozen/i.test(sp)) return 'ice';
    if (/light|volt|thunder|jolt|electr/i.test(sp)) return 'lightning';
    if (/ground|earth|stone|quake/i.test(sp)) return 'earth';
    if (/wind|levit|fly|flight|air/i.test(sp)) return 'wind';
    if (/protect|shield/i.test(sp)) return 'shield';
    if (/house|castle|build/i.test(sp)) return 'build';
    if (/planet/i.test(sp)) return 'space';
    return 'arcane';
}

/** What makes two scrolls look alike: the cache key (a kind of scroll, never a frame). */
export const artKey = (spec) => `${spec.school}|${spec.title}|${(spec.lines || []).map((l) => l.map((p) => (p.bold ? '*' : '') + p.text).join('')).join('¶')}`;

// ---------------------------------------------------------------------------------------------------- small helpers
/** A seeded generator, so a given scroll is always drawn the same way. */
function rngOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The paper: a warm gradient, darker toward the rollers, fibres, stains, creases, burnt edges. */
function paper(x, W, H, rnd) {
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#c9a76a'); g.addColorStop(0.07, '#ecd9a6'); g.addColorStop(0.5, '#f4e8c2'); g.addColorStop(0.93, '#ecd9a6'); g.addColorStop(1, '#c9a76a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // fibres
    for (let i = 0; i < 520; i++) {
        const px = rnd() * W, py = rnd() * H, len = 6 + rnd() * 22, a = rnd() * Math.PI;
        x.strokeStyle = `rgba(${120 + rnd() * 40 | 0},${90 + rnd() * 30 | 0},${40 + rnd() * 20 | 0},${0.03 + rnd() * 0.06})`;
        x.lineWidth = 0.6 + rnd() * 0.8;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
    }
    // stains (tea-coloured blotches with a darker rim)
    for (let i = 0; i < 6; i++) {
        const px = 80 + rnd() * (W - 160), py = 40 + rnd() * (H - 80), r = 24 + rnd() * 60;
        const sg = x.createRadialGradient(px, py, r * 0.2, px, py, r);
        sg.addColorStop(0, 'rgba(150,105,45,0.0)'); sg.addColorStop(0.75, 'rgba(150,105,45,0.07)'); sg.addColorStop(0.92, 'rgba(110,70,25,0.14)'); sg.addColorStop(1, 'rgba(110,70,25,0)');
        x.fillStyle = sg; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    // creases (a fold or two, with a light edge beside the dark one)
    for (let i = 0; i < 3; i++) {
        const px = 120 + rnd() * (W - 240);
        x.strokeStyle = 'rgba(90,60,25,0.16)'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 14, H * 0.3, px - 12, H * 0.7, px + 6, H); x.stroke();
        x.strokeStyle = 'rgba(255,250,230,0.25)';
        x.beginPath(); x.moveTo(px + 2, 0); x.bezierCurveTo(px + 16, H * 0.3, px - 10, H * 0.7, px + 8, H); x.stroke();
    }
    // burnt, worn edges
    const e = 26;
    for (const [x0, y0, x1, y1] of [[0, 0, 0, e], [0, H, 0, H - e], [0, 0, e, 0], [W, 0, W - e, 0]]) {
        const eg = x.createLinearGradient(x0, y0, x1, y1);
        eg.addColorStop(0, 'rgba(70,40,12,0.38)'); eg.addColorStop(1, 'rgba(70,40,12,0)');
        x.fillStyle = eg;
        if (x0 === 0 && x1 === 0) x.fillRect(0, Math.min(y0, y1), W, e); else x.fillRect(Math.min(x0, x1), 0, e, H);
    }
}

/** A made-up rune: a stave with a few strokes (no font needed), `s` high. */
function rune(x, cx, cy, s, rnd) {
    x.beginPath();
    x.moveTo(cx, cy - s / 2); x.lineTo(cx, cy + s / 2);
    const n = 1 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
        const y0 = cy - s / 2 + rnd() * s * 0.6, dy = (rnd() - 0.4) * s * 0.5, dir = rnd() < 0.5 ? -1 : 1;
        x.moveTo(cx, y0); x.lineTo(cx + dir * s * (0.2 + rnd() * 0.22), y0 + dy);
        if (rnd() < 0.35) { x.moveTo(cx, y0 + s * 0.3); x.lineTo(cx - dir * s * 0.2, y0 + s * 0.3 + dy * 0.6); }
    }
    x.stroke();
}

/** A band of golden runes (glowing a little), at height `cy`, between x0 and x1. */
function runeBand(x, x0, x1, cy, S, rnd) {
    x.save();
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let px = x0; px <= x1; px += 22) {
        x.shadowColor = S.glow; x.shadowBlur = 9;
        x.strokeStyle = '#b8862a'; x.lineWidth = 2.6;
        rune(x, px, cy, 15 + rnd() * 3, rnd);
        x.shadowBlur = 0;
        x.strokeStyle = '#f2d27a'; x.lineWidth = 1.1;
        x.save(); x.translate(-0.4, -0.4); rune(x, px, cy, 15, rngOf('r' + px + cy)); x.restore();
    }
    x.restore();
}

/** Word-wrapped lines: parts [{text, bold}] → rows [{x, y, text, bold}] within [x0, x1], from y, step `lh`; first rows may be indented. */
function layout(x, lines, fontPx, x0, x1, y0, lh, gap, indentRows = 0, indent = 0) {
    const rows = [];
    let y = y0, row = 0;
    for (const parts of lines) {
        let px = x0 + (row < indentRows ? indent : 0);
        let started = false;
        for (const { text, bold } of parts) {
            x.font = (bold ? 'bold ' : '') + fontPx + 'px serif';
            for (const word of text.split(/(\s+)/)) {
                if (!word) continue;
                const w = x.measureText(word).width;
                if (px + w > x1 && started) { y += lh; row++; px = x0 + (row < indentRows ? indent : 0); if (!word.trim()) continue; }
                if (!word.trim() && !started) continue;
                rows.push({ x: px, y, text: word, bold });
                px += w; started = true;
            }
        }
        y += lh + gap; row += 1;
    }
    return { rows, bottom: y };
}

// ---------------------------------------------------------------------------------------------------- pictures
const TAU = Math.PI * 2;
/** The glow behind a picture. */
function halo(x, cx, cy, r, color) {
    const g = x.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, color + 'cc'); g.addColorStop(0.55, color + '44'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
}

const MOTIFS = {
    fire(x, cx, cy, r) {
        for (const [k, c0, c1] of [[1, '#c42800', '#ff8a1c'], [0.72, '#ff7a14', '#ffd23f'], [0.42, '#ffd23f', '#fff6c8']]) {
            const g = x.createLinearGradient(cx, cy + r * k, cx, cy - r * k);
            g.addColorStop(0, c0); g.addColorStop(1, c1);
            x.fillStyle = g; x.beginPath();
            x.moveTo(cx, cy - r * 1.05 * k);
            x.bezierCurveTo(cx + r * 0.25 * k, cy - r * 0.55 * k, cx + r * 0.85 * k, cy - r * 0.2 * k, cx + r * 0.6 * k, cy + r * 0.45 * k);
            x.bezierCurveTo(cx + r * 0.5 * k, cy + r * 0.95 * k, cx - r * 0.5 * k, cy + r * 0.95 * k, cx - r * 0.6 * k, cy + r * 0.45 * k);
            x.bezierCurveTo(cx - r * 0.75 * k, cy, cx - r * 0.2 * k, cy - r * 0.35 * k, cx, cy - r * 1.05 * k);
            x.fill();
        }
        x.fillStyle = '#ffb347';
        for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.42; x.beginPath(); x.arc(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.1 - r * 0.1, 2 + (i % 3), 0, TAU); x.fill(); }
    },
    water(x, cx, cy, r) {
        const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
        g.addColorStop(0, '#9fe0ff'); g.addColorStop(0.6, '#2a8bd9'); g.addColorStop(1, '#0b4f94');
        x.fillStyle = g; x.beginPath();
        x.moveTo(cx, cy - r);
        x.bezierCurveTo(cx + r * 0.2, cy - r * 0.5, cx + r * 0.75, cy - r * 0.05, cx + r * 0.62, cy + r * 0.35);
        x.bezierCurveTo(cx + r * 0.5, cy + r * 0.85, cx - r * 0.5, cy + r * 0.85, cx - r * 0.62, cy + r * 0.35);
        x.bezierCurveTo(cx - r * 0.75, cy - r * 0.05, cx - r * 0.2, cy - r * 0.5, cx, cy - r);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(cx - r * 0.25, cy + r * 0.05, r * 0.09, r * 0.25, 0.3, 0, TAU); x.fill();
        x.strokeStyle = '#2a8bd9'; x.lineWidth = 3; x.lineCap = 'round';
        for (let i = 0; i < 3; i++) { x.globalAlpha = 1 - i * 0.28; x.beginPath(); x.ellipse(cx, cy + r * 1.0, r * (0.7 + i * 0.28), r * (0.12 + i * 0.04), 0, 0, TAU); x.stroke(); }
        x.globalAlpha = 1;
    },
    ice(x, cx, cy, r) {
        x.strokeStyle = '#2a7fa6'; x.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            x.save(); x.translate(cx, cy); x.rotate(i * TAU / 6);
            x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -r); x.stroke();
            x.lineWidth = 3.5;
            for (const t of [0.4, 0.68]) { x.beginPath(); x.moveTo(0, -r * t); x.lineTo(-r * 0.26, -r * (t + 0.2)); x.moveTo(0, -r * t); x.lineTo(r * 0.26, -r * (t + 0.2)); x.stroke(); }
            x.restore();
        }
        x.fillStyle = '#e4f8ff'; x.strokeStyle = '#2a7fa6'; x.lineWidth = 3;
        x.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; x.lineTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2); } x.closePath(); x.fill(); x.stroke();
    },
    lightning(x, cx, cy, r) {
        const pts = [[0.1, -1.05], [-0.45, 0.05], [-0.02, 0.05], [-0.2, 1.05], [0.5, -0.2], [0.06, -0.2], [0.42, -1.05]];
        x.shadowColor = '#ffe45a'; x.shadowBlur = 16;
        const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
        g.addColorStop(0, '#fff7b0'); g.addColorStop(1, '#e0a400');
        x.fillStyle = g; x.strokeStyle = '#7a5b00'; x.lineWidth = 3; x.lineJoin = 'round';
        x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(cx + a * r, cy + b * r) : x.moveTo(cx + a * r, cy + b * r))); x.closePath(); x.fill(); x.shadowBlur = 0; x.stroke();
    },
    earth(x, cx, cy, r) {
        const peaks = [[-0.9, 0.7, -0.5, -0.2, '#8a5a2b'], [-0.2, 0.7, 0.2, -0.95, '#a0652a'], [0.5, 0.7, 0.85, -0.1, '#7a4a1e']];
        for (const [x0, y0, x1, y1, c] of peaks) {
            x.fillStyle = c; x.beginPath(); x.moveTo(cx + x0 * r - r * 0.5, cy + y0 * r); x.lineTo(cx + x1 * r, cy + y1 * r); x.lineTo(cx + x0 * r + r * 0.6, cy + y0 * r); x.closePath(); x.fill();
            x.strokeStyle = 'rgba(40,20,5,0.55)'; x.lineWidth = 2; x.stroke();
        }
        x.strokeStyle = 'rgba(40,20,5,0.6)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(cx - r * 0.05, cy - r * 0.2); x.lineTo(cx - r * 0.18, cy + r * 0.2); x.lineTo(cx + r * 0.02, cy + r * 0.45); x.stroke();
        x.fillStyle = '#6b3f12'; x.fillRect(cx - r * 1.2, cy + r * 0.7, r * 2.4, r * 0.22);
    },
    wind(x, cx, cy, r) {
        x.strokeStyle = '#3a5c78'; x.lineWidth = 6; x.lineCap = 'round';
        for (const [dy, len, curl] of [[-0.5, 1.1, 0.34], [0, 1.4, 0.42], [0.5, 0.95, 0.3]]) {
            x.beginPath();
            x.moveTo(cx - r * len * 0.8, cy + dy * r);
            x.bezierCurveTo(cx - r * 0.1, cy + dy * r - r * 0.18, cx + r * len * 0.6, cy + dy * r + r * 0.1, cx + r * len * 0.75, cy + dy * r - r * curl * 0.5);
            x.arc(cx + r * len * 0.75 - r * curl * 0.5, cy + dy * r - r * curl * 0.5, r * curl * 0.5, 0, -Math.PI * 1.35, true);
            x.stroke();
        }
    },
    life(x, cx, cy, r) {
        x.fillStyle = '#6b4a22'; x.fillRect(cx - r * 0.09, cy + r * 0.1, r * 0.18, r * 0.8);
        for (const [dx, dy, rr, c] of [[0, -0.3, 0.6, '#2a7a22'], [-0.45, -0.05, 0.42, '#3a9a2c'], [0.45, -0.05, 0.42, '#3a9a2c'], [0, -0.6, 0.38, '#5ac040']]) {
            x.fillStyle = c; x.beginPath(); x.arc(cx + dx * r, cy + dy * r, rr * r, 0, TAU); x.fill();
        }
        x.strokeStyle = 'rgba(20,60,15,0.7)'; x.lineWidth = 2.5;
        x.beginPath(); x.arc(cx, cy - r * 0.3, r * 0.6, 0, TAU); x.stroke();
        x.fillStyle = '#c6f59a'; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(cx + Math.cos(i * 1.7) * r * 0.55, cy - r * 0.3 + Math.sin(i * 2.3) * r * 0.4, 4, 2.4, i, 0, TAU); x.fill(); }
    },
    dark(x, cx, cy, r) {
        x.fillStyle = '#e8dccb'; x.strokeStyle = '#2a0610'; x.lineWidth = 3.5;
        x.beginPath(); x.ellipse(cx, cy - r * 0.15, r * 0.78, r * 0.8, 0, 0, TAU); x.fill(); x.stroke();
        x.fillRect(cx - r * 0.42, cy + r * 0.45, r * 0.84, r * 0.5); x.strokeRect(cx - r * 0.42, cy + r * 0.45, r * 0.84, r * 0.5);
        x.fillStyle = '#2a0610';
        for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(cx + sx * r * 0.34, cy - r * 0.15, r * 0.2, r * 0.24, 0, 0, TAU); x.fill(); }
        x.beginPath(); x.moveTo(cx, cy + r * 0.12); x.lineTo(cx - r * 0.1, cy + r * 0.34); x.lineTo(cx + r * 0.1, cy + r * 0.34); x.closePath(); x.fill();
        x.lineWidth = 2.4; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx + i * r * 0.16, cy + r * 0.5); x.lineTo(cx + i * r * 0.16, cy + r * 0.93); x.stroke(); }
        x.fillStyle = '#ff2a5a'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(cx + sx * r * 0.34, cy - r * 0.15, r * 0.06, 0, TAU); x.fill(); }
    },
    light(x, cx, cy, r) {
        x.strokeStyle = '#e8a800'; x.lineWidth = 5; x.lineCap = 'round';
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16, a0 = r * (i % 2 ? 0.72 : 0.64), a1 = r * (i % 2 ? 1.0 : 1.18); x.beginPath(); x.moveTo(cx + Math.cos(a) * a0, cy + Math.sin(a) * a0); x.lineTo(cx + Math.cos(a) * a1, cy + Math.sin(a) * a1); x.stroke(); }
        const g = x.createRadialGradient(cx - r * 0.15, cy - r * 0.15, r * 0.1, cx, cy, r * 0.6);
        g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#ffc21a');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 0.58, 0, TAU); x.fill(); x.strokeStyle = '#9a6a00'; x.lineWidth = 3; x.stroke();
    },
    shield(x, cx, cy, r) {
        const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        g.addColorStop(0, '#6aa6f0'); g.addColorStop(1, '#1b3f86');
        x.fillStyle = g; x.strokeStyle = '#d8b04a'; x.lineWidth = 5; x.lineJoin = 'round';
        x.beginPath(); x.moveTo(cx - r * 0.75, cy - r * 0.8); x.lineTo(cx + r * 0.75, cy - r * 0.8); x.lineTo(cx + r * 0.75, cy + r * 0.05); x.quadraticCurveTo(cx + r * 0.7, cy + r * 0.7, cx, cy + r * 1.0); x.quadraticCurveTo(cx - r * 0.7, cy + r * 0.7, cx - r * 0.75, cy + r * 0.05); x.closePath(); x.fill(); x.stroke();
        x.strokeStyle = '#f2d27a'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx, cy - r * 0.7); x.lineTo(cx, cy + r * 0.8); x.moveTo(cx - r * 0.6, cy - r * 0.15); x.lineTo(cx + r * 0.6, cy - r * 0.15); x.stroke();
    },
    house(x, cx, cy, r) {
        x.fillStyle = '#b8955a'; x.strokeStyle = '#3a2812'; x.lineWidth = 3.5; x.lineJoin = 'round';
        x.fillRect(cx - r * 0.7, cy - r * 0.15, r * 1.4, r * 0.95); x.strokeRect(cx - r * 0.7, cy - r * 0.15, r * 1.4, r * 0.95);
        x.fillStyle = '#9c2a1c'; x.beginPath(); x.moveTo(cx - r * 0.88, cy - r * 0.1); x.lineTo(cx, cy - r * 0.95); x.lineTo(cx + r * 0.88, cy - r * 0.1); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#4a3016'; x.fillRect(cx - r * 0.16, cy + r * 0.25, r * 0.32, r * 0.55);
        x.fillStyle = '#ffd86a'; for (const sx of [-1, 1]) x.fillRect(cx + sx * r * 0.45 - r * 0.1, cy + r * 0.05, r * 0.2, r * 0.2);
        x.fillStyle = '#6b6b72'; x.fillRect(cx + r * 0.38, cy - r * 0.85, r * 0.16, r * 0.45);
    },
    planet(x, cx, cy, r) {
        const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 0.75);
        g.addColorStop(0, '#9a7af0'); g.addColorStop(1, '#2a1670');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 0.62, 0, TAU); x.fill();
        x.strokeStyle = '#d8c0ff'; x.lineWidth = 5; x.beginPath(); x.ellipse(cx, cy, r * 1.15, r * 0.3, -0.35, 0, TAU); x.stroke();
        x.fillStyle = '#f2d27a'; for (const [dx, dy] of [[-1, -0.85], [0.95, -0.7], [0.8, 0.85], [-0.95, 0.6], [0.1, -1.05]]) { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, rr = i % 2 ? 2.2 : 5.5; x.lineTo(cx + dx * r + Math.cos(a) * rr, cy + dy * r + Math.sin(a) * rr); } x.closePath(); x.fill(); }
    },
    mind(x, cx, cy, r) {
        x.strokeStyle = '#681f78'; x.lineWidth = 5; x.fillStyle = '#f7e9ff';
        x.beginPath(); x.moveTo(cx - r * 1.1, cy); x.quadraticCurveTo(cx, cy - r * 0.95, cx + r * 1.1, cy); x.quadraticCurveTo(cx, cy + r * 0.95, cx - r * 1.1, cy); x.closePath(); x.fill(); x.stroke();
        const g = x.createRadialGradient(cx, cy, 2, cx, cy, r * 0.42);
        g.addColorStop(0, '#2a0a38'); g.addColorStop(0.5, '#b04ad0'); g.addColorStop(1, '#681f78');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 0.42, 0, TAU); x.fill();
        x.strokeStyle = '#f0b8ff'; x.lineWidth = 2.5; x.beginPath(); for (let t = 0; t < 12; t += 0.2) { const rr = t / 12 * r * 0.38; x.lineTo(cx + Math.cos(t * 1.6) * rr, cy + Math.sin(t * 1.6) * rr); } x.stroke();
    },
    key(x, cx, cy, r) {
        x.strokeStyle = '#4a2c08'; x.lineWidth = 3.5; x.fillStyle = '#e0a83a'; x.lineJoin = 'round';
        x.beginPath(); x.arc(cx - r * 0.55, cy - r * 0.35, r * 0.4, 0, TAU); x.fill(); x.stroke();
        x.fillStyle = '#f8f0dc'; x.beginPath(); x.arc(cx - r * 0.55, cy - r * 0.35, r * 0.16, 0, TAU); x.fill(); x.stroke();
        x.fillStyle = '#e0a83a'; x.beginPath(); x.rect(cx - r * 0.3, cy - r * 0.2, r * 1.1, r * 0.2); x.fill(); x.stroke();
        for (const [dx, h] of [[0.45, 0.4], [0.7, 0.28]]) { x.beginPath(); x.rect(cx + dx * r - r * 0.05, cy, r * 0.14, r * h); x.fill(); x.stroke(); }
    },
    crystal(x, cx, cy, r) {
        const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        g.addColorStop(0, '#d8f0ff'); g.addColorStop(0.5, '#3a8cf0'); g.addColorStop(1, '#14408f');
        x.fillStyle = g; x.strokeStyle = '#14408f'; x.lineWidth = 3.5; x.lineJoin = 'round';
        x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.6, cy - r * 0.2); x.lineTo(cx + r * 0.4, cy + r * 0.8); x.lineTo(cx - r * 0.4, cy + r * 0.8); x.lineTo(cx - r * 0.6, cy - r * 0.2); x.closePath(); x.fill(); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cx - r * 0.6, cy - r * 0.2); x.lineTo(cx + r * 0.6, cy - r * 0.2); x.moveTo(cx, cy - r); x.lineTo(cx - r * 0.12, cy + r * 0.8); x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.2, cy + r * 0.8); x.stroke();
    },
    heart(x, cx, cy, r) {
        const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
        g.addColorStop(0, '#ff7a86'); g.addColorStop(1, '#8c1624');
        x.fillStyle = g; x.strokeStyle = '#5a0c16'; x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(cx, cy + r * 0.95); x.bezierCurveTo(cx - r * 1.5, cy - r * 0.1, cx - r * 0.7, cy - r * 1.0, cx, cy - r * 0.3); x.bezierCurveTo(cx + r * 0.7, cy - r * 1.0, cx + r * 1.5, cy - r * 0.1, cx, cy + r * 0.95); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(cx - r * 0.45, cy - r * 0.35, r * 0.14, r * 0.26, 0.6, 0, TAU); x.fill();
    },
    star(x, cx, cy, r) {
        x.fillStyle = '#e8c24a'; x.strokeStyle = '#7a5410'; x.lineWidth = 3.5; x.lineJoin = 'round';
        x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke();
    },
};

/** A round medallion with the picture of the spell. */
function medallion(x, cx, cy, R, S) {
    halo(x, cx, cy, R * 1.25, S.glow);
    const g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
    g.addColorStop(0, 'rgba(255,248,226,0.95)'); g.addColorStop(1, 'rgba(228,205,150,0.85)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
    x.lineWidth = 4; x.strokeStyle = S.accent; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
    x.lineWidth = 1.6; x.strokeStyle = '#b8862a'; x.beginPath(); x.arc(cx, cy, R - 7, 0, TAU); x.stroke();
    x.save(); x.beginPath(); x.arc(cx, cy, R - 9, 0, TAU); x.clip();
    (MOTIFS[S.motif] || MOTIFS.star)(x, cx, cy, R * 0.62);
    x.restore();
}

/** A wax seal with a little star. */
function seal(x, cx, cy, r, S) {
    x.save(); x.shadowColor = 'rgba(40,10,5,0.5)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
    x.fillStyle = S.seal; x.beginPath();
    for (let i = 0; i < 28; i++) { const a = i * TAU / 28, rr = r * (i % 2 ? 0.93 : 1.04); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill(); x.restore();
    x.strokeStyle = 'rgba(255,225,200,0.55)'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, r * 0.68, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(255,225,200,0.85)'; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, rr = i % 2 ? r * 0.22 : r * 0.5; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill();
}

// ---------------------------------------------------------------------------------------------------- the whole page
/**
 * Paints a scroll's face.
 * @param x 2D context  @param W,H canvas size (1024×440)
 * @param spec { school, title, lines: [[{text, bold}]], note, picture: false|true, dark: false }
 *   `picture: false` — no medallion (the text takes the whole width); `custom(x, rect)` — draws its own picture in {cx, cy, R}.
 */
export function paintParchment(x, W, H, spec) {
    const S = SCHOOLS[spec.school] || SCHOOLS.arcane;
    const rnd = rngOf(artKey(spec));
    paper(x, W, H, rnd);
    // frame: a double line, the golden runes along the top and the bottom
    x.strokeStyle = S.accent; x.lineWidth = 4; x.strokeRect(34, 14, W - 68, H - 28);
    x.strokeStyle = 'rgba(160,120,50,0.8)'; x.lineWidth = 1.5; x.strokeRect(43, 23, W - 86, H - 46);
    x.fillStyle = S.accent; for (const [px, py] of [[34, 14], [W - 34, 14], [34, H - 14], [W - 34, H - 14]]) { x.beginPath(); x.arc(px, py, 6, 0, TAU); x.fill(); }
    runeBand(x, 70, W - 70, 33, S, rngOf(spec.school + 'top'));
    runeBand(x, 70, W - 70, H - 33, S, rngOf(spec.school + 'bot'));
    // the title in the school's colour, with a golden flourish under it
    const pic = spec.picture !== false;
    const tx = pic ? (70 + (W - 300)) / 2 : W / 2; // (the middle of the text column)
    x.textAlign = 'center';
    let tp = 44;
    const maxW = pic ? W - 380 : W - 160;
    x.font = `bold ${tp}px serif`;
    while (tp > 30 && x.measureText(spec.title).width > maxW) { tp -= 2; x.font = `bold ${tp}px serif`; }
    x.lineJoin = 'round'; x.lineWidth = 5; x.strokeStyle = 'rgba(255,248,226,0.9)'; x.strokeText(spec.title, tx, 88);
    x.fillStyle = S.ink; x.fillText(spec.title, tx, 88);
    x.strokeStyle = '#b8862a'; x.lineWidth = 2;
    const fw = Math.min(maxW, x.measureText(spec.title).width) / 2 + 20;
    x.beginPath(); x.moveTo(tx - fw, 102); x.quadraticCurveTo(tx - fw / 2, 96, tx, 102); x.quadraticCurveTo(tx + fw / 2, 108, tx + fw, 102); x.stroke();
    x.fillStyle = '#b8862a'; x.beginPath(); x.moveTo(tx, 96); x.lineTo(tx + 6, 102); x.lineTo(tx, 108); x.lineTo(tx - 6, 102); x.closePath(); x.fill();
    // the lines (a drop cap in the first), the text column shrinks if there is a picture
    x.textAlign = 'left';
    const x0 = 78, x1 = pic ? W - 300 : W - 78;
    // (a short first line — the kind of the spell — is a subtitle; the first long paragraph gets the drop cap: its first
    // letter is taken out of the text and set in a frame at the left)
    const plainLen = (l) => l.reduce((n, p) => n + p.text.length, 0);
    let lines = spec.lines.map((l) => l.map((p) => ({ ...p })));
    const bi = lines.findIndex((l) => plainLen(l) >= 45);
    const subs = bi > 0 ? lines.slice(0, bi) : [];
    if (bi > 0) lines = lines.slice(bi);
    let y = 142;
    for (const l of subs) {
        x.font = 'italic 27px serif'; x.fillStyle = S.accent === '#e8a800' ? S.ink : S.ink; x.textAlign = 'center';
        x.fillText(l.map((p) => p.text).join(''), tx, y + 4); y += 34;
    }
    x.textAlign = 'left';
    const top = y + 18;
    let cap = '';
    if (bi >= 0) {
        const p = lines[0].find((q) => q.text.trim());
        if (p) { const k = p.text.search(/\S/); cap = p.text[k]; p.text = p.text.slice(k + 1); }
    }
    let font = 30, L;
    for (; font >= 24; font -= 2) { L = layout(x, lines, font, x0, x1, top, Math.round(font * 1.3), Math.round(font * 0.4), cap ? 2 : 0, 64); if (L.bottom <= H - 78) break; }
    if (cap) {
        const y = top;
        x.fillStyle = 'rgba(255,248,226,0.75)'; x.strokeStyle = S.accent; x.lineWidth = 2.5;
        x.fillRect(x0, y - font * 0.85, 56, 64); x.strokeRect(x0, y - font * 0.85, 56, 64);
        x.strokeStyle = '#b8862a'; x.lineWidth = 1; x.strokeRect(x0 + 4, y - font * 0.85 + 4, 48, 56);
        x.font = 'bold 54px serif'; x.fillStyle = S.ink; x.textAlign = 'center'; x.fillText(cap, x0 + 28, y + 30);
        x.textAlign = 'left';
    }
    for (const r of L.rows) {
        x.font = (r.bold ? 'bold ' : '') + font + 'px serif';
        x.fillStyle = r.bold ? S.ink : '#2b1d10';
        x.fillText(r.text, r.x, r.y);
    }
    // the picture, the seal, the footnote
    if (pic) {
        const mx = W - 150, my = 215;
        if (spec.custom) spec.custom(x, { cx: mx, cy: my, R: 100, S }); else medallion(x, mx, my, 100, S);
        seal(x, mx + 62, my + 108, 26, S);
    } else seal(x, W - 100, H - 78, 26, S);
    if (spec.note) {
        x.font = 'italic 24px serif'; x.fillStyle = '#5a4526'; x.textAlign = 'center';
        x.fillText(spec.note, pic ? tx : W / 2, H - 56);
    }
    return S;
}
