/**
 * PentagramStand.js — the picture of a public pentagram on a reading stand (the author: the drawing of the teleportation pentagram stands
 * in the wizards' towns and the tower: «рисунок виден на нём сразу, но срисовать «в зачёт» нельзя, пока не сожжён её свиток»).
 * The stand is the library's stand (LoreStand.js / LoreLibrary.js: a post of blocks, a sloping board); here the board carries a big painted
 * picture instead of a book: the circle and the figure, its name, and what to do to learn it. Looking at it teaches nothing — only a burnt
 * scroll does (Pentagranium.learnFigure). Made for worlds of generation PENT_STAND_FROM_GEN and later (Terrain.js): the last stand of every
 * library holds it. One texture and one material for all the stands (a few figures at most).
 */
import * as THREE from 'three';
import { figureOf, figureLines } from './PentagramRules.js';
import { STAND } from '../world/LoreStand.js';

export const STAND_PICTURE = { W: 1.62, H: 1.08 }; // m: the picture on the board (the board is 1.8 × 1.25)

const _cache = new Map();

/** The painted board of figure `id` (a canvas texture): parchment, the circle, the lines and the corners, the name and what to do. */
function pictureTexture(id) {
    const P = figureOf(id);
    const c = document.createElement('canvas');
    c.width = 972; c.height = 648;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 972, 648);
    g.addColorStop(0, '#e8d8b0'); g.addColorStop(0.5, '#f3e6c4'); g.addColorStop(1, '#dcc89a');
    x.fillStyle = g; x.fillRect(0, 0, 972, 648);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${110 + (i * 37) % 60},${80 + (i * 11) % 40},${40 + (i * 7) % 30},0.05)`; x.fillRect((i * 97) % 972, (i * 53) % 648, 2 + (i % 6), 1 + (i % 3)); }
    x.strokeStyle = '#7a5a2a'; x.lineWidth = 6; x.strokeRect(14, 14, 944, 620);
    x.strokeStyle = '#a7834a'; x.lineWidth = 2; x.strokeRect(26, 26, 920, 596);
    const ink = '#' + (P?.ink ?? 0x4a78c8).toString(16).padStart(6, '0');
    const cx = 640, cy = 330, R = 220;
    x.strokeStyle = '#2a2018'; x.lineWidth = 9; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 7;
    for (const poly of figureLines(id)) {
        x.beginPath();
        poly.forEach((p, i) => { const px = cx + p[0] * R, py = cy - p[1] * R; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
        x.closePath(); x.stroke();
    }
    x.strokeStyle = ink; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    for (const poly of figureLines(id)) {
        x.beginPath();
        poly.forEach((p, i) => { const px = cx + p[0] * R, py = cy - p[1] * R; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
        x.closePath(); x.stroke();
        x.fillStyle = ink;
        for (const p of poly) { x.beginPath(); x.arc(cx + p[0] * R, cy - p[1] * R, 9, 0, Math.PI * 2); x.fill(); }
    }
    x.fillStyle = '#3a2a18'; x.textAlign = 'left';
    x.font = 'bold 40px serif';
    const words = (P?.ru || 'Пентаграмма').split(' ');
    let line = '', y = 100;
    for (const w of words) { if (x.measureText(line + w).width > 330) { x.fillText(line, 60, y); y += 46; line = ''; } line += w + ' '; }
    x.fillText(line, 60, y);
    x.font = '27px serif'; x.fillStyle = '#4a3a28';
    const text = ['Рисунок для всех: смотрите,', 'как выглядит эта пентаграмма.', '', 'Создать её можно, только выучив:', 'найдите её свиток и сожгите', 'его («Инферно»). Потом скажите,', 'направив палочку на землю:', '', '«Pentagranium Teleportis».'];
    y += 70;
    for (const t of text) { x.fillText(t, 60, y); y += 38; }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}

/** The board's picture as a mesh in the stand's frame (add it to the stand's group): shared texture, material and geometry. */
export function makeStandPicture(id) {
    let S = _cache.get(id);
    if (!S) {
        const geo = new THREE.PlaneGeometry(STAND_PICTURE.W, STAND_PICTURE.H);
        geo.userData.shared = true; geo.userData.keep = true;
        const mat = new THREE.MeshLambertMaterial({ map: pictureTexture(id) });
        mat.userData.shared = true;
        S = { geo, mat };
        _cache.set(id, S);
    }
    const frame = new THREE.Group();
    frame.position.set(0, STAND.BOARD_Y, 0);
    frame.rotation.x = STAND.TILT; // (the board's frame: lies on the board, the reader's edge the lower one)
    const m = new THREE.Mesh(S.geo, S.mat);
    m.rotation.x = -Math.PI / 2; // (the picture's top toward the upper edge, its face up)
    m.position.y = STAND.BOARD_T / 2 + 0.006;
    frame.add(m);
    frame.userData.pentagram = id;
    return frame;
}
