/**
 * Appearance.js — how a hero looks: face, hair, clothes, shoes, hat.
 *
 * A look is a small plain object (saved on the computer, sent to the other
 * players): {skin, face, eyes, brows, hair, hairColor, hat, hatColor, top,
 * topColor, bottom, bottomColor, shoes, shoesColor}. 30 faces, 8 hair
 * styles, 10 hats, 10 tops, 10 bottoms, 10 pairs of shoes; every colour can
 * be chosen. Everything is drawn from code (canvas textures and boxes), no
 * image files.
 */

import * as THREE from 'three';

export const FACE_COUNT = 30;
export const HAIR_STYLES = ['Короткие', 'Длинные', 'Пучок', 'Ёжик', 'Ирокез', 'Лысый', 'Хвост', 'Кудри'];
export const HATS = ['Без шапки', 'Кепка', 'Шапка', 'Шляпа волшебника', 'Цилиндр', 'Корона', 'Капюшон', 'Повязка', 'Ковбойская', 'Шлем'];
export const TOPS = ['Футболка', 'Худи', 'Мантия мага', 'Жилет', 'Куртка', 'Латы', 'Свитер в полоску', 'Туника с поясом', 'Плащ', 'Рубашка с галстуком'];
export const BOTTOMS = ['Джинсы', 'Шорты', 'Юбка', 'Брюки', 'Карго', 'В полоску', 'Килт', 'Леггинсы', 'Поножи', 'Широкие штаны'];
export const SHOES = ['Кеды', 'Сапоги', 'Сандалии', 'Туфли', 'Резиновые сапоги', 'Остроносые', 'Латные', 'Тапочки', 'Высокие кеды', 'Босиком'];
export const SKIN_TONES = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21, 0xfde0d9];

export function defaultLook() {
    return { skin: 0xffdbb4, face: 0, eyes: 0x3b6ea5, brows: 0x4a3728, hair: 0, hairColor: 0x4a3728, hat: 0, hatColor: 0x8e2b2b, top: 0, topColor: 0x3498db, bottom: 0, bottomColor: 0x2c3e50, shoes: 0, shoesColor: 0x333333 };
}

export function randomLook(r = Math.random) {
    const pick = (n) => Math.floor(r() * n);
    // pleasant colours (not too bright, not too grey)
    const col = () => new THREE.Color().setHSL(r(), 0.3 + r() * 0.4, 0.25 + r() * 0.35).getHex();
    const hairCols = [0x2b1d14, 0x4a3728, 0x8b5a2b, 0xd9b46c, 0xe8e2d6, 0xa83e2a, 0x111111];
    return {
        skin: SKIN_TONES[pick(SKIN_TONES.length)], face: pick(FACE_COUNT), eyes: [0x3b6ea5, 0x5a3a1e, 0x2f6b3a, 0x555555][pick(4)], brows: hairCols[pick(hairCols.length)],
        hair: pick(HAIR_STYLES.length), hairColor: hairCols[pick(hairCols.length)], hat: r() < 0.5 ? 0 : pick(HATS.length), hatColor: col(),
        top: pick(TOPS.length), topColor: col(), bottom: pick(BOTTOMS.length), bottomColor: col(), shoes: pick(SHOES.length), shoesColor: col(),
    };
}

const hex = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const shade = (c, k) => { const col = new THREE.Color(c); col.multiplyScalar(k); return hex(col.getHex()); };

// ================================================================= faces
/** The face (front of the head): 30 = 6 eye styles × 5 mouths, plus details. */
export function drawFace(look, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const s = size / 16; // 16×16 "pixels"
    const px = (cx, cy, w, h, col) => { x.fillStyle = col; x.fillRect(cx * s, cy * s, w * s, h * s); };
    px(0, 0, 16, 16, hex(look.skin));
    // a little shading at the edges
    px(0, 15, 16, 1, shade(look.skin, 0.88)); px(0, 0, 1, 16, shade(look.skin, 0.94)); px(15, 0, 1, 16, shade(look.skin, 0.94));
    const f = look.face || 0;
    const eye = f % 6, mouth = Math.floor(f / 6) % 5;
    const eyeCol = hex(look.eyes ?? 0x3b6ea5);
    const browCol = hex(look.brows ?? 0x4a3728);
    // brows
    if (eye === 3) { px(3, 4, 3, 1, browCol); px(10, 4, 3, 1, browCol); px(5, 5, 1, 1, browCol); px(10, 5, 1, 1, browCol); } // angry
    else if (eye === 4) { px(3, 5, 3, 1, browCol); px(10, 5, 3, 1, browCol); px(3, 4, 1, 1, browCol); px(12, 4, 1, 1, browCol); } // kind
    else px(3, 4, 3, 1, browCol), px(10, 4, 3, 1, browCol);
    // eyes
    const white = '#ffffff';
    switch (eye) {
        case 0: px(3, 6, 3, 2, white); px(10, 6, 3, 2, white); px(4, 6, 2, 2, eyeCol); px(10, 6, 2, 2, eyeCol); break; // looking at you
        case 1: px(4, 6, 2, 2, eyeCol); px(10, 6, 2, 2, eyeCol); px(4, 6, 1, 1, white); px(10, 6, 1, 1, white); break; // round, shiny
        case 2: px(3, 7, 3, 1, '#222'); px(10, 7, 3, 1, '#222'); break; // closed / happy
        case 3: px(3, 6, 3, 2, white); px(10, 6, 3, 2, white); px(4, 7, 1, 1, eyeCol); px(11, 7, 1, 1, eyeCol); break; // angry
        case 4: px(3, 6, 3, 2, white); px(10, 6, 3, 2, white); px(4, 6, 1, 2, eyeCol); px(11, 6, 1, 2, eyeCol); px(3, 8, 3, 1, shade(look.skin, 0.85)); px(10, 8, 3, 1, shade(look.skin, 0.85)); break;
        default: px(3, 6, 3, 3, white); px(10, 6, 3, 3, white); px(4, 7, 2, 2, eyeCol); px(11, 7, 2, 2, eyeCol); px(4, 7, 1, 1, '#000'); px(11, 7, 1, 1, '#000'); break; // big
    }
    // nose
    px(7, 8, 2, 2, shade(look.skin, 0.86));
    // mouth
    const lip = '#9c4a4a';
    switch (mouth) {
        case 0: px(5, 11, 6, 1, lip); px(4, 10, 1, 1, lip); px(11, 10, 1, 1, lip); break; // smile
        case 1: px(6, 11, 4, 1, lip); break; // calm
        case 2: px(5, 11, 6, 2, '#5a1f1f'); px(6, 11, 4, 1, '#ffffff'); break; // grin
        case 3: px(6, 12, 4, 1, lip); px(5, 11, 1, 1, lip); px(10, 11, 1, 1, lip); break; // sad-ish
        default: px(7, 11, 2, 2, '#5a1f1f'); break; // "o"
    }
    // details: freckles, blush, glasses, beard
    if (f % 7 === 3) for (const [a, b] of [[3, 9], [5, 10], [11, 9], [12, 10]]) px(a, b, 1, 1, shade(look.skin, 0.75));
    if (f % 4 === 1) { px(2, 9, 2, 1, 'rgba(255,90,90,0.45)'); px(12, 9, 2, 1, 'rgba(255,90,90,0.45)'); }
    if (f % 9 === 5) { x.strokeStyle = '#222'; x.lineWidth = s * 0.7; x.strokeRect(2.5 * s, 5.5 * s, 4 * s, 3 * s); x.strokeRect(9.5 * s, 5.5 * s, 4 * s, 3 * s); px(6.5, 6.5, 3, 0.6, '#222'); }
    if (f % 10 === 8) { px(3, 12, 10, 3, hex(look.hairColor ?? 0x4a3728)); px(6, 11, 4, 1, hex(look.hairColor ?? 0x4a3728)); px(6, 12, 4, 1, '#5a1f1f'); }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}

// ============================================================== textures
function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
}

/** Front / back / side textures of the body for a top. */
function topTextures(look) {
    const col = hex(look.topColor);
    const dark = shade(look.topColor, 0.7);
    const light = shade(look.topColor, 1.25);
    const t = look.top || 0;
    const front = canvasTex(24, 30, (x, w, h) => {
        x.fillStyle = col; x.fillRect(0, 0, w, h);
        x.fillStyle = hex(look.skin);
        if (t === 0 || t === 6 || t === 7) x.fillRect(9, 0, 6, 3); // collar opening
        if (t === 1) { x.fillStyle = dark; x.fillRect(5, 18, 14, 6); x.fillStyle = light; x.fillRect(10, 0, 1, 10); x.fillRect(13, 0, 1, 10); } // hoodie pocket + strings
        if (t === 2) { x.fillStyle = '#d4af37'; x.fillRect(11, 0, 2, h); for (let i = 3; i < h; i += 6) x.fillRect(9, i, 6, 1); } // robe trim
        if (t === 3) { x.fillStyle = '#f2f2ee'; x.fillRect(8, 0, 8, h); x.fillStyle = dark; x.fillRect(11, 4, 2, 2); x.fillRect(11, 12, 2, 2); x.fillRect(11, 20, 2, 2); } // vest over shirt
        if (t === 4) { x.fillStyle = '#eeeeee'; x.fillRect(9, 0, 6, h); x.fillStyle = dark; x.fillRect(7, 0, 2, h); x.fillRect(15, 0, 2, h); } // open jacket
        if (t === 5) { x.fillStyle = '#b8c2cc'; x.fillRect(0, 0, w, h); x.fillStyle = '#8a94a0'; x.fillRect(0, 10, w, 2); x.fillRect(0, 20, w, 2); x.fillStyle = col; x.fillRect(9, 2, 6, 14); } // armour + tabard
        if (t === 6) { x.fillStyle = light; for (let y = 4; y < h; y += 6) x.fillRect(0, y, w, 3); } // stripes
        if (t === 7) { x.fillStyle = '#5a3a1e'; x.fillRect(0, 20, w, 3); x.fillStyle = '#d4af37'; x.fillRect(10, 20, 4, 3); } // belt
        if (t === 8) { x.fillStyle = dark; x.fillRect(0, 0, 4, h); x.fillRect(w - 4, 0, 4, h); x.fillStyle = '#d4af37'; x.fillRect(10, 1, 4, 3); } // cloak clasp
        if (t === 9) { x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, w, h); x.fillStyle = col; x.fillRect(11, 2, 2, 3); x.fillRect(10, 5, 4, 14); x.fillStyle = dark; x.fillRect(11, 19, 2, 2); } // shirt + tie
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, h - 2, w, 2);
    });
    const back = canvasTex(24, 30, (x, w, h) => {
        x.fillStyle = t === 5 ? '#b8c2cc' : t === 9 ? '#f2f2ee' : col; x.fillRect(0, 0, w, h);
        if (t === 1) { x.fillStyle = dark; x.fillRect(4, 0, 16, 7); } // the hood lying on the back
        if (t === 6) { x.fillStyle = light; for (let y = 4; y < h; y += 6) x.fillRect(0, y, w, 3); }
        if (t === 7) { x.fillStyle = '#5a3a1e'; x.fillRect(0, 20, w, 3); }
    });
    const side = canvasTex(16, 30, (x, w, h) => {
        x.fillStyle = t === 5 ? '#b8c2cc' : t === 9 ? '#f2f2ee' : col; x.fillRect(0, 0, w, h);
        if (t === 6) { x.fillStyle = light; for (let y = 4; y < h; y += 6) x.fillRect(0, y, w, 3); }
        if (t === 7) { x.fillStyle = '#5a3a1e'; x.fillRect(0, 20, w, 3); }
    });
    return { front, back, side };
}

function legTexture(look) {
    const col = hex(look.bottomColor);
    const dark = shade(look.bottomColor, 0.7);
    const light = shade(look.bottomColor, 1.3);
    const b = look.bottom || 0;
    return canvasTex(8, 40, (x, w, h) => {
        x.fillStyle = col; x.fillRect(0, 0, w, h);
        if (b === 0) { x.fillStyle = light; x.fillRect(0, 0, 1, h); x.fillStyle = dark; x.fillRect(0, 2, w, 1); } // jeans seam
        if (b === 1 || b === 2 || b === 6) { x.fillStyle = hex(look.skin); x.fillRect(0, b === 1 ? 14 : 18, w, h); } // shorts / skirt / kilt: bare legs below
        if (b === 4) { x.fillStyle = dark; x.fillRect(1, 14, 6, 6); } // cargo pocket
        if (b === 5) { x.fillStyle = light; for (let y = 0; y < h; y += 5) x.fillRect(0, y, w, 2); }
        if (b === 6) { x.fillStyle = dark; for (let i = 0; i < 18; i += 4) { x.fillRect(0, i, w, 1); x.fillRect(i % 8, 0, 1, 18); } }
        if (b === 7) { x.fillStyle = light; x.fillRect(0, 0, w, 1); }
        if (b === 8) { x.fillStyle = '#b8c2cc'; x.fillRect(0, 16, w, 22); x.fillStyle = '#8a94a0'; x.fillRect(0, 24, w, 1); x.fillRect(0, 32, w, 1); }
    });
}

// ================================================================= apply
const _box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

/** Dress a VoxelCharacter in a look (can be called again to change it). */
export function applyLook(ch, look) {
    look = { ...defaultLook(), ...(look || {}) };
    ch.look = look;
    // remove the extras of the previous look
    for (const m of ch._lookParts || []) { m.parent?.remove(m); m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose?.(); } }); }
    ch._lookParts = [];
    const add = (parent, obj) => { parent.add(obj); ch._lookParts.push(obj); return obj; };
    const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

    // ---- head: face on the front (−Z), skin elsewhere
    const skin = mat(look.skin);
    const face = new THREE.MeshLambertMaterial({ map: drawFace(look) });
    ch.head.material = [skin, skin, skin, skin, skin, face];
    // the old hair slab goes; new hair
    if (ch._oldHair === undefined) { ch._oldHair = ch.head.children.find((c) => c.isMesh && c.geometry?.parameters?.height === 0.4) || null; }
    if (ch._oldHair) ch._oldHair.visible = false;
    const hairMat = mat(look.hairColor);
    const H = ch.head;
    switch (look.hair) {
        case 0: add(H, _box(1.28, 0.3, 1.28, hairMat, 0, 0.6, 0.02)); add(H, _box(1.28, 0.5, 0.2, hairMat, 0, 0.3, 0.58)); break;
        case 1: add(H, _box(1.3, 0.32, 1.3, hairMat, 0, 0.6, 0.02)); add(H, _box(1.3, 1.4, 0.25, hairMat, 0, -0.1, 0.6)); add(H, _box(0.12, 1.1, 1.1, hairMat, 0.64, 0.0, 0.08)); add(H, _box(0.12, 1.1, 1.1, hairMat, -0.64, 0.0, 0.08)); break;
        case 2: add(H, _box(1.28, 0.3, 1.28, hairMat, 0, 0.6, 0.02)); add(H, _box(0.5, 0.5, 0.5, hairMat, 0, 0.85, 0.35)); break;
        case 3: for (let i = 0; i < 9; i++) add(H, _box(0.25, 0.35, 0.25, hairMat, ((i % 3) - 1) * 0.4, 0.7 + (i % 2) * 0.08, (Math.floor(i / 3) - 1) * 0.4)); add(H, _box(1.26, 0.2, 1.26, hairMat, 0, 0.58, 0)); break;
        case 4: add(H, _box(0.3, 0.5, 1.2, hairMat, 0, 0.8, 0.05)); break;
        case 5: break;
        case 6: add(H, _box(1.28, 0.3, 1.28, hairMat, 0, 0.6, 0.02)); add(H, _box(0.3, 0.9, 0.3, hairMat, 0, 0.1, 0.78)); break;
        default: for (let i = 0; i < 12; i++) add(H, _box(0.42, 0.42, 0.42, hairMat, Math.cos(i / 12 * Math.PI * 2) * 0.5, 0.55 + (i % 2) * 0.1, Math.sin(i / 12 * Math.PI * 2) * 0.5 + 0.1)); add(H, _box(1.2, 0.3, 1.2, hairMat, 0, 0.7, 0)); break;
    }
    // ---- hat
    const hatMat = mat(look.hatColor);
    const hatDark = mat(new THREE.Color(look.hatColor).multiplyScalar(0.6).getHex());
    switch (look.hat) {
        case 1: add(H, _box(1.32, 0.3, 1.32, hatMat, 0, 0.75, 0)); add(H, _box(1.0, 0.08, 0.6, hatDark, 0, 0.62, -0.85)); break;
        case 2: add(H, _box(1.34, 0.45, 1.34, hatMat, 0, 0.72, 0)); add(H, _box(0.3, 0.25, 0.3, hatDark, 0, 1.05, 0)); break;
        case 3: { add(H, _box(1.8, 0.1, 1.8, hatMat, 0, 0.62, 0)); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 6), hatMat); cone.position.set(0, 1.35, 0.1); cone.rotation.x = 0.15; add(H, cone); add(H, _box(1.3, 0.12, 1.3, mat(0xd4af37), 0, 0.72, 0)); break; }
        case 4: add(H, _box(1.6, 0.08, 1.6, hatMat, 0, 0.62, 0)); add(H, _box(1.0, 0.95, 1.0, hatMat, 0, 1.12, 0)); add(H, _box(1.04, 0.15, 1.04, mat(0x8e2b2b), 0, 0.75, 0)); break;
        case 5: { const g = mat(0xd4af37); add(H, _box(1.3, 0.25, 1.3, g, 0, 0.72, 0)); for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.6]]) add(H, _box(0.18, 0.3, 0.18, g, x, 0.98, z)); add(H, _box(0.12, 0.12, 0.05, mat(0xd9534f), 0, 0.75, -0.66)); break; }
        case 6: add(H, _box(1.42, 0.25, 1.42, hatMat, 0, 0.7, 0.05)); add(H, _box(0.12, 1.2, 1.3, hatMat, 0.68, 0.05, 0.08)); add(H, _box(0.12, 1.2, 1.3, hatMat, -0.68, 0.05, 0.08)); add(H, _box(1.42, 1.25, 0.12, hatMat, 0, 0.05, 0.7)); break;
        case 7: add(H, _box(1.3, 0.16, 1.3, hatMat, 0, 0.42, 0)); break;
        case 8: add(H, _box(2.0, 0.08, 2.0, hatMat, 0, 0.62, 0)); add(H, _box(1.1, 0.5, 1.1, hatMat, 0, 0.88, 0)); add(H, _box(1.14, 0.1, 1.14, hatDark, 0, 0.7, 0)); break;
        case 9: { const steel = mat(0xb8c2cc); add(H, _box(1.38, 0.5, 1.38, steel, 0, 0.62, 0)); add(H, _box(0.12, 0.8, 0.12, steel, 0, 0.3, -0.7)); add(H, _box(0.2, 0.35, 0.2, hatMat, 0, 1.0, 0.1)); break; }
        default: break;
    }
    // ---- top: textured body, sleeves; robe / cloak extras
    const tt = topTextures(look);
    const sideM = new THREE.MeshLambertMaterial({ map: tt.side });
    const sideM2 = new THREE.MeshLambertMaterial({ map: tt.side });
    const topM = mat(look.top === 5 ? 0xb8c2cc : look.top === 9 ? 0xf2f2ee : look.topColor);
    ch.body.material = [sideM, sideM2, topM, topM, new THREE.MeshLambertMaterial({ map: tt.back }), new THREE.MeshLambertMaterial({ map: tt.front })];
    const sleeve = look.top === 5 ? 0xb8c2cc : look.top === 9 ? 0xf2f2ee : look.topColor;
    for (const anchor of [ch.leftArmAnchor, ch.rightArmAnchor]) { const up = anchor.children[0]; if (up?.isMesh) up.material = mat(sleeve); }
    const longSleeves = [1, 2, 4, 5, 6, 8, 9].includes(look.top);
    for (const elbow of [ch.leftElbowAnchor, ch.rightElbowAnchor]) { const fore = elbow.children.find((c) => c.isMesh); if (fore) fore.material = mat(longSleeves ? sleeve : look.skin); }
    if (look.top === 2) add(ch.torso, _box(1.3, 1.1, 0.9, mat(look.topColor), 0, -1.25, 0)); // the robe goes down to the knees
    if (look.top === 8) { const cape = _box(1.3, 2.6, 0.08, mat(new THREE.Color(look.topColor).multiplyScalar(0.8).getHex()), 0, -0.55, 0.46); add(ch.torso, cape); }
    if (look.top === 5) { add(ch.torso, _box(0.55, 0.3, 0.6, mat(0x9aa3ad), 0.7, 0.7, 0)); add(ch.torso, _box(0.55, 0.3, 0.6, mat(0x9aa3ad), -0.7, 0.7, 0)); } // shoulder plates
    if (look.top === 1) add(ch.torso, _box(0.9, 0.35, 0.3, mat(new THREE.Color(look.topColor).multiplyScalar(0.7).getHex()), 0, 0.72, 0.42)); // hood on the back
    // ---- bottoms
    const legTex = legTexture(look);
    for (const pivot of [ch.leftLegPivot, ch.rightLegPivot]) {
        const leg = pivot.children.find((c) => c.isMesh);
        if (leg) leg.material = new THREE.MeshLambertMaterial({ map: legTex });
    }
    if (look.bottom === 2 || look.bottom === 6) add(ch.group, _box(1.25, 0.75, 0.85, mat(look.bottomColor), 0, -0.3, 0)); // skirt / kilt
    if (look.bottom === 9) for (const pivot of [ch.leftLegPivot, ch.rightLegPivot]) add(pivot, _box(0.62, 1.4, 0.62, mat(look.bottomColor), 0, -0.75, 0));
    // ---- shoes (at the feet, the leg bottom is at y −1.95 of the pivot)
    const shoeCol = look.shoes === 9 ? look.skin : look.shoesColor;
    const shoeM = mat(shoeCol);
    const soleM = mat(look.shoes === 0 || look.shoes === 8 ? 0xf2f2ee : 0x222222);
    for (const pivot of [ch.leftLegPivot, ch.rightLegPivot]) {
        const s = look.shoes;
        if (s === 9) continue;
        const h = s === 1 || s === 4 ? 0.7 : s === 8 ? 0.45 : s === 2 || s === 7 ? 0.12 : 0.25;
        const long = s === 5 ? 0.85 : 0.7;
        add(pivot, _box(0.56, h, long, s === 6 ? mat(0xb8c2cc) : shoeM, 0, -1.95 + h / 2, -0.08));
        add(pivot, _box(0.58, 0.06, long + 0.02, soleM, 0, -1.92, -0.08));
        if (s === 5) add(pivot, _box(0.3, 0.12, 0.25, shoeM, 0, -1.75, -0.5));
    }
    // ---- hands: skin colour
    for (const h of [ch.leftSimplifiedHand, ch.rightSimplifiedHand, ch.leftDetailedHand, ch.rightDetailedHand]) h?.setSkin?.(look.skin);
}
