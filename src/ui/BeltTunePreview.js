/**
 * BeltTunePreview.js — the picture in settings → «Игра» → «Пояс»: the player seen from the front, the places of the things' pocket
 * and of the wand on the belt, where they are now (solid) and where the game made them (dashed). Mirrored for a left-hander.
 * The numbers are torso heights, as in PoseInterpreter (BODY_TUNE) — the same places the camera reads and the camera window shows.
 */
import { OFF_POCKET, BELT_AT, tuneOffsets, BODY_TUNE } from '../input/PoseInterpreter.js';

const HW = 0.37; // (the hip joints' half spread, torso heights — as an average body)

/** The places' centres and half-widths in picture units (x: torso heights to the viewer's right, from the belt's middle). Pure. */
export function beltPlaces(leftHanded = false, tune = tuneOffsets()) {
    const sgn = leftHanded ? -1 : 1; // (a right-hander's leading hip is the picture's LEFT: the camera sees the player mirrored)
    const hipX = -sgn * HW; // (the leading hip)
    const pocketC = (OFF_POCKET[0] + OFF_POCKET[1]) / 2, pocketHalf = (OFF_POCKET[1] - OFF_POCKET[0]) / 2;
    const wandC = (BELT_AT.u[0] + BELT_AT.u[1]) / 2, wandHalf = (BELT_AT.u[1] - BELT_AT.u[0]) / 2;
    return {
        pocket: { x: hipX - sgn * (pocketC + tune.pocket), half: pocketHalf, dy: 0 }, // (drawn on the belt: both places at one level — the zones' heights differ a little, the picture is a scheme)
        wand: { x: sgn * (wandC + tune.wand), half: wandHalf, dy: 0 },
    };
}

export function drawBeltTune(canvas, leftHanded = false) {
    const c = canvas?.getContext?.('2d');
    if (!c) return;
    const W = canvas.width, H = canvas.height, k = H * 0.56, cx = W / 2, top = H * 0.08; // (k px per torso height)
    c.clearRect(0, 0, W, H);
    const Y = (dy) => top + k * (1 + dy); // (dy 0 = the belt; shoulders at the top)
    // the body: shoulders, torso, hips, legs
    c.lineWidth = 2; c.strokeStyle = '#8fa0c8'; c.fillStyle = 'rgba(120,140,200,.18)';
    c.beginPath(); c.moveTo(cx - 0.62 * k, top + 6); c.lineTo(cx + 0.62 * k, top + 6); c.lineTo(cx + 0.45 * k, Y(0) + 0.1 * k); c.lineTo(cx - 0.45 * k, Y(0) + 0.1 * k); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, top - 4, 0.17 * k, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(cx - 0.37 * k, Y(0) + 0.1 * k); c.lineTo(cx - 0.34 * k, H - 4); c.moveTo(cx + 0.37 * k, Y(0) + 0.1 * k); c.lineTo(cx + 0.34 * k, H - 4); c.stroke();
    c.strokeStyle = '#c9a15a'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 0.45 * k, Y(0)); c.lineTo(cx + 0.45 * k, Y(0)); c.stroke(); // the belt
    const zero = beltPlaces(leftHanded, { pocket: 0, wand: 0 }), now = beltPlaces(leftHanded, tuneOffsets());
    const zone = (pl, color, dash) => {
        c.save(); c.setLineDash(dash ? [4, 4] : []); c.lineWidth = dash ? 1.5 : 2.5; c.strokeStyle = color;
        c.beginPath(); c.ellipse(cx + pl.x * k, Y(pl.dy), Math.max(8, pl.half * k), 0.13 * k, 0, 0, 7); if (!dash) { c.fillStyle = color.replace('1)', '.28)'); c.fill(); } c.stroke(); c.restore();
    };
    zone(zero.pocket, 'rgba(160,220,255,1)', true); zone(zero.wand, 'rgba(255,215,106,1)', true);
    zone(now.pocket, 'rgba(160,220,255,1)', false); zone(now.wand, 'rgba(255,215,106,1)', false);
    c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#e8f0ff';
    c.fillText('ячейка', cx + now.pocket.x * k, Y(now.pocket.dy) + 0.13 * k + 11);
    c.fillText('палочка', cx + now.wand.x * k, Y(now.wand.dy) + 0.13 * k + 11);
    c.fillStyle = '#9fb0d8'; c.fillText(BODY_TUNE.shift || BODY_TUNE.gap ? 'пунктир — по умолчанию' : 'по умолчанию', cx, H - 3);
}
