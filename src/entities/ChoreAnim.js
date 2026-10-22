/**
 * ChoreAnim.js — how a villager's body does its chore (src/game/Chores.js), and the things of it.
 *
 * Like the hoe in the field: the arms, the back, the legs do the work — the hammer goes up and
 * comes down on the roof, the axe splits the log on the block (the halves fly apart at the blow),
 * the broom sweeps from side to side, the hands pass the ball and it flies in an arc to the other
 * one's hands, the book is held in both hands and a page turned by the right one, the wand
 * stirs and the ladle goes round with it…
 *
 * The things: shapes of boxes, shared by every villager (VillagerModel's shape cache — one
 * shape per kind of thing, whatever the number of people), one material for all (no new
 * shader). They stand on the villager's own ground (the model's `root`: y 0 = the feet,
 * forward = −Z), so a far person (drawn as one shape) shows none of them.
 *
 * Each chore: `pose(m, T, t, dt)` sets the targets of the body (VillagerModel.update's T) and
 * returns how fast the body follows them; `after(m, t, dt)` moves the things (once the body
 * is posed). A sound moment (a blow, a catch, a bubble) — `m.choreBeat`.
 */

import { CHORES } from '../game/Chores.js';

// ---------------------------------------------------------------- shapes
const WOOD = 0x8a5a2b, DARK = 0x5a3a1e, IRON = 0x4a4f57, STEEL = 0x9aa3ad, STRAW = 0xd8b45a;
function b(L, w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) { L.push(w, h, d, x, y, z, c, rx, ry, rz); }
const box = (fn) => { const L = []; fn(L); return L; };

/** Held in the right hand (grip at 0, along +Y); `hang` — hangs from the hand (a bucket). */
export const HAND = {
    hammer: { boxes: box((L) => { b(L, 0.1, 1.0, 0.1, 0, 0.25, 0, WOOD); b(L, 0.24, 0.24, 0.6, 0, 0.78, -0.05, IRON); }) },
    axe: { boxes: box((L) => { b(L, 0.1, 1.9, 0.1, 0, 0.55, 0, WOOD); b(L, 0.08, 0.55, 0.5, 0, 1.35, -0.28, STEEL); b(L, 0.12, 0.22, 0.18, 0, 1.35, 0.1, IRON); }) },
    broom: { boxes: box((L) => { b(L, 0.09, 2.7, 0.09, 0, 0.75, 0, WOOD); b(L, 0.2, 0.14, 0.2, 0, 2.1, 0, 0x7a4a20); b(L, 0.75, 0.55, 0.2, 0, 2.4, 0, STRAW); }) },
    bucket: { hang: true, boxes: box((L) => { b(L, 0.05, 0.05, 0.5, 0, 0.02, 0, IRON); b(L, 0.05, 0.36, 0.05, 0, -0.16, -0.24, IRON); b(L, 0.05, 0.36, 0.05, 0, -0.16, 0.24, IRON); b(L, 0.5, 0.48, 0.5, 0, -0.56, 0, WOOD); b(L, 0.54, 0.06, 0.54, 0, -0.42, 0, IRON); b(L, 0.42, 0.04, 0.42, 0, -0.34, 0, 0x6fb7e8); }) },
    basket: { hang: true, boxes: box((L) => { b(L, 0.06, 0.06, 0.48, 0, 0.02, 0, WOOD); b(L, 0.06, 0.32, 0.06, 0, -0.14, -0.21, WOOD); b(L, 0.06, 0.32, 0.06, 0, -0.14, 0.21, WOOD); b(L, 0.46, 0.38, 0.6, 0, -0.5, 0, 0xb07d3a); b(L, 0.4, 0.06, 0.54, 0, -0.32, 0, 0xe0c060); }) },
    pouch: { hang: true, boxes: box((L) => { b(L, 0.16, 0.1, 0.14, 0, -0.1, 0, 0x6b3e1e); b(L, 0.3, 0.32, 0.26, 0, -0.32, 0, 0x8b5a2b); b(L, 0.12, 0.12, 0.04, 0, -0.32, -0.14, 0xd4af37); }) },
    cup: { boxes: box((L) => { b(L, 0.1, 0.16, 0.1, 0, 0.0, 0, DARK); b(L, 0.3, 0.36, 0.3, 0, 0.12, -0.2, WOOD); b(L, 0.24, 0.03, 0.24, 0, 0.29, -0.2, 0x6fb7e8); }) },
    rod: { boxes: box((L) => { b(L, 0.1, 0.5, 0.1, 0, 0.0, 0, DARK); b(L, 0.2, 0.2, 0.12, 0.12, 0.25, 0, IRON); b(L, 0.06, 3.6, 0.06, 0, 2.0, 0, 0xa07040); b(L, 0.04, 0.4, 0.04, 0, 3.95, 0, 0x8a6030); }) },
    rag: { boxes: box((L) => { b(L, 0.34, 0.12, 0.36, 0, 0.05, -0.08, 0xd8d0b8); b(L, 0.2, 0.2, 0.06, 0, 0.18, -0.1, 0xc8c0a8); }) },
};
/** The thing in the hand per chore (none: the hand is free / the wizard's own wand). */
export const CHORE_HAND = { roof: 'hammer', chop: 'axe', sweep: 'broom', carryWater: 'bucket', feed: 'basket', haggle: 'pouch', drink: 'cup', fish: 'rod', windows: 'rag' };
/** The chores where the villager's own tool (a hoe, a basket, a wand) is put away. Wizards keep the wand for magic. */
export const KEEP_WAND = new Set(['potion', 'dummy', 'levbooks', 'plants']);
/** Sat (on a bench, in the air): the legs bent, not standing on the feet. */
export const SIT_CHORES = new Set(['read', 'lute', 'meditate']);

const bench = (L) => { b(L, 2.4, 0.18, 0.95, 0, 0.82, 0.2, WOOD); b(L, 0.18, 0.75, 0.8, -1.0, 0.38, 0.2, DARK); b(L, 0.18, 0.75, 0.8, 1.0, 0.38, 0.2, DARK); };
const hen = (c) => box((L) => {
    b(L, 0.4, 0.38, 0.6, 0, 0.42, 0, c); b(L, 0.1, 0.22, 0.08, -0.1, 0.12, 0, 0xd9a03a); b(L, 0.1, 0.22, 0.08, 0.1, 0.12, 0, 0xd9a03a);
    b(L, 0.26, 0.28, 0.26, 0, 0.72, -0.3, c); b(L, 0.08, 0.14, 0.16, 0, 0.92, -0.3, 0xd03030); b(L, 0.1, 0.08, 0.14, 0, 0.68, -0.48, 0xe0a030);
    b(L, 0.3, 0.3, 0.2, 0, 0.6, 0.32, c, -0.5);
});
const bookShape = (c) => box((L) => { b(L, 0.62, 0.14, 0.82, 0, 0, 0, c); b(L, 0.56, 0.1, 0.8, 0.03, 0, 0, 0xf2ead0); });

/**
 * The things of each chore: part name → { boxes, at: [x, y, z], torso?: on the body }.
 * Built once per model per chore (shapes shared); `after` moves the moving ones.
 */
export const PROPS = {
    yoga: { mat: { boxes: box((L) => b(L, 1.3, 0.06, 3.3, 0, 0.03, -0.3, 0x7a4a9a)) } },
    roof: {
        ladder: {
            boxes: box((L) => {
                const a = -0.18; // (leaning on the wall: the top 1.15 m nearer to it)
                for (const x of [-0.6, 0.6]) b(L, 0.13, 6.5, 0.13, x, 3.2, -0.1 - 3.2 * 0.18, WOOD, a);
                for (let y = 0.45; y < 6.2; y += 0.62) b(L, 1.2, 0.1, 0.12, 0, y, -0.1 - y * 0.18, DARK);
            }),
        },
    },
    chop: {
        stump: { boxes: box((L) => { b(L, 1.1, 0.9, 1.1, 0, 0.45, -1.75, 0x6b4a2a); b(L, 1.0, 0.04, 1.0, 0, 0.91, -1.75, 0xc8a070); b(L, 0.5, 0.5, 2.0, 1.4, 0.25, -1.4, WOOD, 0, 0.5); b(L, 0.5, 0.5, 2.0, 1.5, 0.75, -1.5, 0x7a4a22, 0, 0.6); }) },
        log: { boxes: box((L) => { b(L, 0.5, 0.9, 0.5, 0, 0.45, 0, WOOD); b(L, 0.4, 0.04, 0.4, 0, 0.91, 0, 0xc8a070); }), at: [0, 0.92, -1.75] },
        halfA: { boxes: box((L) => b(L, 0.24, 0.9, 0.5, 0, 0.45, 0, WOOD)), at: [-0.13, 0.92, -1.75] },
        halfB: { boxes: box((L) => b(L, 0.24, 0.9, 0.5, 0, 0.45, 0, WOOD)), at: [0.13, 0.92, -1.75] },
    },
    laundry: {
        line: { boxes: box((L) => { for (const x of [-2.3, 2.3]) b(L, 0.16, 4.3, 0.16, x, 2.15, -1.75, DARK); b(L, 4.6, 0.04, 0.04, 0, 4.1, -1.75, 0xe8e0c8); b(L, 0.7, 0.45, 0.6, 1.4, 0.23, -0.2, 0xb07d3a); b(L, 0.6, 0.12, 0.5, 1.4, 0.48, -0.2, 0xf0f0f0); }) },
        cloths: { boxes: box((L) => { b(L, 1.0, 1.4, 0.04, -1.5, -0.72, 0, 0xf4f2ec); b(L, 0.75, 0.95, 0.04, -0.3, -0.5, 0, 0x4f6a8a); b(L, 1.2, 1.7, 0.04, 0.95, -0.87, 0, 0xc0504a); }), at: [0, 4.08, -1.75] },
    },
    feed: {
        hen0: { boxes: hen(0xf4f0e8), at: [-0.7, 0, -1.9] },
        hen1: { boxes: hen(0xa0602a), at: [0.6, 0, -2.4] },
        hen2: { boxes: hen(0xe8dcc0), at: [0.1, 0, -1.4] },
        grain: { boxes: box((L) => { for (let i = 0; i < 9; i++) b(L, 0.07, 0.07, 0.07, ((i * 37) % 9 - 4) * 0.09, ((i * 53) % 7 - 3) * 0.06, ((i * 71) % 5 - 2) * 0.1, 0xe8c040); }) },
    },
    ball: { ball: { boxes: box((L) => { b(L, 0.42, 0.42, 0.42, 0, 0, 0, 0xd04a2a); b(L, 0.44, 0.1, 0.44, 0, 0, 0, 0xf2e6c0); }) } },
    fish: {
        line: { boxes: box((L) => b(L, 0.025, 1, 0.025, 0, -0.5, 0, 0xe8e8e8)) },
        float: { boxes: box((L) => { b(L, 0.16, 0.16, 0.16, 0, 0, 0, 0xd03030); b(L, 0.12, 0.1, 0.12, 0, 0.12, 0, 0xf4f4f4); }) },
        fishy: { boxes: box((L) => { b(L, 0.16, 0.6, 0.3, 0, -0.3, 0, 0xa8b8c8); b(L, 0.06, 0.2, 0.3, 0, -0.66, 0, 0x8898a8); }) },
        pail: { boxes: box((L) => { b(L, 0.6, 0.5, 0.6, 1.0, 0.25, 0.3, 0x8a5a2b); b(L, 0.5, 0.04, 0.5, 1.0, 0.48, 0.3, 0x5a7a9a); }) },
    },
    read: { bench: { boxes: box(bench) }, book: { boxes: box((L) => { b(L, 0.95, 0.06, 0.7, 0, 0, 0, 0x6a2a2a); b(L, 0.88, 0.06, 0.64, 0, 0.05, 0, 0xf2ead0); }), at: [0, 2.3, -0.95] }, page: { boxes: box((L) => b(L, 0.42, 0.02, 0.62, -0.21, 0, 0, 0xfaf4e0)), at: [0, 2.39, -0.95] } },
    windows: { pail: { boxes: box((L) => { b(L, 0.55, 0.5, 0.55, 1.05, 0.25, -0.35, 0x8a5a2b); b(L, 0.6, 0.06, 0.6, 1.05, 0.4, -0.35, IRON); b(L, 0.45, 0.04, 0.45, 1.05, 0.46, -0.35, 0x8fc8e8); }) } },
    sack: { sack: { boxes: box((L) => { b(L, 0.95, 0.95, 0.7, 0, 0.47, -1.1, 0xc8b080); b(L, 0.4, 0.2, 0.3, 0, 1.02, -1.1, 0xa89060); }) } },
    carrySack: { sack: { torso: true, boxes: box((L) => { b(L, 1.0, 0.75, 0.8, 0.55, 1.05, 0.2, 0xc8b080, 0, 0, -0.25); b(L, 0.35, 0.25, 0.3, 0.1, 1.2, 0.2, 0xa89060); }) } },
    lute: {
        bench: { boxes: box(bench) },
        lute: { torso: true, boxes: box((L) => { b(L, 0.75, 0.85, 0.28, 0.28, 0.25, -0.5, 0xb87a3a, 0, 0, 0.9); b(L, 0.18, 0.18, 0.05, 0.28, 0.25, -0.65, 0x3a2414); b(L, 0.12, 1.15, 0.1, -0.3, 0.65, -0.5, DARK, 0, 0, 0.9); b(L, 0.2, 0.3, 0.12, -0.78, 0.98, -0.5, DARK, 0, 0, 0.9); }) },
    },
    // ---- the wizards
    potion: {
        pot: { boxes: box((L) => {
            b(L, 1.5, 1.0, 1.5, 0, 0.75, -1.8, 0x23262b); b(L, 1.7, 0.14, 1.7, 0, 1.28, -1.8, 0x34383e);
            for (const [x, z] of [[-0.55, -1.25], [0.55, -1.25], [0, -2.35]]) b(L, 0.18, 0.4, 0.18, x, 0.2, z, 0x23262b);
            b(L, 1.25, 0.06, 1.25, 0, 1.3, -1.8, 0x58d858); b(L, 0.9, 0.12, 0.25, 0, 0.08, -1.8, 0x6b3e1e, 0, 0.6); b(L, 0.5, 0.25, 0.5, 0, 0.18, -1.8, 0xffa030);
        }) },
        ladle: { boxes: box((L) => { b(L, 0.08, 1.5, 0.08, 0, 0.45, 0, WOOD, 0, 0, 0); b(L, 0.26, 0.12, 0.26, 0, -0.3, 0, DARK); }), at: [0, 1.25, -1.8] },
        bubbles: { boxes: box((L) => { b(L, 0.16, 0.16, 0.16, -0.3, 0, 0.2, 0x90ff90); b(L, 0.12, 0.12, 0.12, 0.25, 0.2, -0.15, 0xb0ffb0); b(L, 0.1, 0.1, 0.1, 0.05, 0.4, 0.3, 0x90ff90); }), at: [0, 1.35, -1.8] },
    },
    dummy: {
        dummy: { boxes: box((L) => {
            b(L, 0.2, 2.6, 0.2, 0, 1.3, 0, DARK); b(L, 1.2, 0.2, 1.2, 0, 0.1, 0, WOOD);
            b(L, 1.05, 1.4, 0.55, 0, 2.85, 0, STRAW); b(L, 2.1, 0.22, 0.22, 0, 3.25, 0, STRAW); b(L, 0.62, 0.62, 0.55, 0, 3.9, 0, 0xe8cc80);
            b(L, 0.5, 0.5, 0.04, 0, 2.95, -0.29, 0xc0392b); b(L, 0.25, 0.25, 0.05, 0, 2.95, -0.3, 0xf4f2ec);
        }), at: [0, 0, -4.3] },
        spark: { boxes: box((L) => { b(L, 0.24, 0.24, 0.24, 0, 0, 0, 0xfff070, 0.6, 0.6, 0); b(L, 0.14, 0.14, 0.4, 0, 0, 0.2, 0xffd040); }) },
    },
    levbooks: { b0: { boxes: bookShape(0x6a2a2a) }, b1: { boxes: bookShape(0x2a4a6a) }, b2: { boxes: bookShape(0x3a6a2a) } },
    plants: {
        pots: { boxes: box((L) => { for (const x of [-1.05, 0, 1.05]) { b(L, 0.6, 0.55, 0.6, x, 0.28, -1.7, 0xa0522d); b(L, 0.5, 0.05, 0.5, x, 0.56, -1.7, 0x3a2a1a); } }) },
        p0: { boxes: box((L) => { b(L, 0.08, 0.9, 0.08, 0, 0.45, 0, 0x2f7a3a); b(L, 0.5, 0.06, 0.2, 0.18, 0.5, 0, 0x3fae5a, 0, 0, 0.4); b(L, 0.34, 0.34, 0.34, 0, 1.0, 0, 0x7ff7ff); }), at: [-1.05, 0.58, -1.7] },
        p1: { boxes: box((L) => { b(L, 0.08, 1.1, 0.08, 0, 0.55, 0, 0x2f7a3a); b(L, 0.45, 0.06, 0.2, -0.16, 0.6, 0, 0x3fae5a, 0, 0, -0.4); b(L, 0.4, 0.3, 0.4, 0, 1.2, 0, 0xff8cf0); }), at: [0, 0.58, -1.7] },
        p2: { boxes: box((L) => { b(L, 0.08, 0.8, 0.08, 0, 0.4, 0, 0x2f7a3a); b(L, 0.3, 0.3, 0.3, 0, 0.9, 0, 0xd8ff6a); b(L, 0.2, 0.2, 0.2, 0.2, 0.6, 0, 0xd8ff6a); }), at: [1.05, 0.58, -1.7] },
    },
    meditate: {
        s0: { boxes: box((L) => b(L, 0.42, 0.34, 0.38, 0, 0, 0, 0x8a8a8a, 0.3, 0.2)) },
        s1: { boxes: box((L) => b(L, 0.32, 0.3, 0.36, 0, 0, 0, 0x6a7a8a, 0.1, 0.5)) },
        s2: { boxes: box((L) => b(L, 0.5, 0.3, 0.4, 0, 0, 0, 0x9a9080, 0.4, 0.1)) },
        s3: { boxes: box((L) => b(L, 0.3, 0.26, 0.3, 0, 0, 0, 0x7a7a9a, 0.2, 0.7)) },
    },
};

// ---------------------------------------------------------------- motion
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, c, k) => a + (c - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
/** Did time pass the moment `at` (0…1) of a cycle of `period` s between t0 and t? */
const passed = (t0, t, period, at) => Math.floor(t / period - at) > Math.floor(t0 / period - at);
const SIT = (T, low = -1.0) => { T.lL = T.lR = Math.PI / 2; T.kL = T.kR = -Math.PI / 2; T.bounce = low; };
/** Where the pair stands (ChoreAnim's ball flies between them). */
export const BALL_D = CHORES.ball.pair;
const PLUCK = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];

const POSE = {
    yoga(m, T, t) {
        const k = Math.floor(t / 7) % 4;
        T.headY = 0;
        if (k === 0) { T.aLX = T.aRX = 3.0; T.aLZ = 0.16; T.aRZ = -0.16; T.headX = 0.25; T.hx = 0.08; m._legZ = 0; }
        else if (k === 1) { T.hx = -1.25; T.aLX = T.aRX = 1.25; T.headX = -0.3; T.kL = T.kR = -0.08; m._legZ = 0; }
        else if (k === 2) { T.lL = 0.25; T.kL = -1.9; T.aLX = T.aRX = 2.95; T.aLZ = 0.2; T.aRZ = -0.2; T.headX = 0.1; m._legZ = -0.85; }
        else { T.lL = 0.55; T.kL = -0.65; T.lR = -0.5; T.aLX = T.aRX = 1.57; T.aLZ = -1.45; T.aRZ = 1.45; T.headY = 0.7; T.hy = 0.25; m._legZ = 0; }
        return 2.5;
    },
    exercise(m, T, t) {
        if (Math.floor(t / 6) % 2 === 0) {
            const s = (1 - Math.cos(t * 2.9)) / 2; // squats
            T.lL = T.lR = 1.15 * s; T.kL = T.kR = -1.95 * s; T.hx = -0.3 * s; T.aLX = T.aRX = 1.55 * s; m._legZ = 0;
        } else {
            const u = (1 - Math.cos(t * 6.3)) / 2; // jumping jacks
            T.aLX = T.aRX = 0.15; T.aLZ = -0.06 - 2.9 * u; T.aRZ = 0.06 + 2.9 * u;
            T.bounce = 0.22 * Math.abs(Math.sin(t * 3.15)); m._legZ = -0.28 * u;
        }
        return 16;
    },
    roof(m, T, t, dt) {
        m._lift = 1.25;
        const burst = t % 6.8 < 4.8;
        const P = 0.8, p = (t / P) % 1;
        const u = !burst ? 0.3 : p < 0.6 ? ease(p / 0.6) : 1 - ease((p - 0.6) / 0.4);
        T.aRX = lerp(2.35, 2.95, u); T.wrist = lerp(-3.2, -2.2, u); T.aRZ = -0.12;
        T.aLX = 2.3; T.aLZ = 0.12; T.headX = 0.45; T.hx = 0.05;
        if (burst && passed(t - dt, t, P, 0.98)) m.choreBeat = 'hammer';
        return 40;
    },
    chop(m, T, t, dt) {
        const P = 1.7, p = (t / P) % 1;
        const u = p < 0.55 ? ease(p / 0.55) : p < 0.68 ? 1 - (p - 0.55) / 0.13 : 0;
        T.aRX = lerp(0.85, 3.0, u); T.wrist = lerp(-2.8, -1.8, u);
        T.aLX = T.aRX * 0.95; T.aLZ = 0.35; T.aRZ = -0.3;
        T.hx = p > 0.55 && p < 0.85 ? -0.45 : -0.1; T.headX = -0.3;
        T.lL = 0.25; T.lR = -0.2;
        if (passed(t - dt, t, P, 0.68)) m.choreBeat = 'chop';
        return 30;
    },
    water(m, T, t) {
        const c = Math.sin(t * 4);
        T.aLX = 2.3 + 0.5 * c; T.aRX = 2.3 - 0.5 * c; T.aLZ = 0.15; T.aRZ = -0.15;
        T.hx = -0.15 + 0.1 * Math.abs(c); T.headX = -0.35;
        return 14;
    },
    drink(m, T, t) {
        const p = t % 6;
        if (p < 2.5) { T.aRX = 2.35; T.aRZ = -0.55; T.wrist = -1.75; T.headX = 0.35; }
        else { T.aRX = 0.55; T.wrist = -1.3; T.headY = Math.sin(t * 0.8) * 0.4; }
        T.aLX = 0.9; T.aLZ = 0.2;
        return 6;
    },
    laundry(m, T, t) {
        const p = t % 7;
        if (p < 4.5) { T.aLX = T.aRX = 2.75; T.aLZ = 0.2; T.aRZ = -0.2; T.hy = Math.sin(t * 0.6) * 0.35; T.headX = 0.4; }
        else { T.hx = -1.0; T.aRX = 1.3; T.aRZ = 0.3; T.aLX = 1.1; T.hy = -0.45; T.headX = -0.3; }
        return 5;
    },
    sweep(m, T, t, dt) {
        const s = Math.sin(t * 3.2);
        T.aRX = 0.75; T.aRZ = -0.25 + s * 0.15; T.wrist = -2.7;
        T.aLX = 1.15; T.aLZ = 0.45; T.hy = s * 0.35; T.hx = -0.25; T.headX = -0.3;
        if (Math.sign(Math.sin((t - dt) * 3.2)) !== Math.sign(s)) m.choreBeat = 'sweep';
        return 14;
    },
    feed(m, T, t) {
        const P = 1.6, p = (t / P) % 1;
        if (p < 0.3) { T.aLX = 0.4; T.aLZ = 0.45; T.hy = -0.2; }
        else if (p < 0.5) { const k = ease((p - 0.3) / 0.2); T.aLX = lerp(0.4, 1.7, k); T.aLZ = lerp(0.45, -0.45, k); T.hy = lerp(-0.2, 0.15, k); }
        else { T.aLX = 1.2; T.aLZ = -0.3; T.hy = 0.1; }
        T.aRX = 0.35; T.aRZ = 0.12; T.headX = -0.35; T.hx = -0.1;
        return 12;
    },
    haggle(m, T, t) {
        const p = t % 5;
        if (p < 2) { T.aLX = 1.7; T.aLZ = -0.6; T.aRX = 1.5; T.aRZ = 0.5; T.headY = Math.sin(t * 9) * 0.35; T.hx = 0.12; }
        else if (p < 3.5) { T.aLX = 1.6; T.aLZ = 0.1; T.headX = -0.1 + Math.sin(t * 6) * 0.1; }
        else { T.aRX = 1.05; T.aRZ = -0.6; T.aLX = 0.6; T.headX = Math.sin(t * 2) * 0.1; }
        return 12;
    },
    argue(m, T, t) {
        const t2 = t + m.choreSide * 2; // (the two not in step: one shouts while the other throws up the arms)
        if (t2 % 4 < 1) { T.aLX = T.aRX = 2.8; T.aLZ = -0.5; T.aRZ = 0.5; T.headX = 0.3; T.hx = 0.1; }
        else {
            T.aRX = 1.9 + 0.35 * Math.sin(t * 11); T.aRZ = -0.25; T.wrist = -1.6; // (the fist shaken)
            T.aLX = 1.0 + 0.7 * Math.max(0, Math.sin(t2 * 2.1)); T.aLZ = -0.5;
            T.hx = -0.18; T.headX = -0.1 + 0.12 * Math.sin(t * 7);
        }
        T.headY = Math.sin(t2 * 1.3) * 0.15;
        T.bounce = 0.12 * Math.max(0, Math.sin(t2 * 5));
        return 22;
    },
    ball(m, T) {
        const p = m._ballP;
        if (p < 0.12) { const k = p / 0.12; T.aRX = lerp(2.5, 1.4, k); T.aLX = 1.0; }
        else if (p < 0.5) { T.aRX = 0.6; T.aLX = 0.5; }
        else if (p < 0.85) { T.aLX = T.aRX = 1.6; T.aLZ = 0.25; T.aRZ = -0.25; }
        else { const k = (p - 0.85) / 0.15; T.aRX = lerp(1.6, 2.5, ease(k)); T.aLX = lerp(1.6, 1.0, k); T.hy = -0.2 * k; }
        T.headX = 0.1;
        return 18;
    },
    fish(m, T, t, dt) {
        const p = t % 18;
        if (p < 1.2) { T.aRX = 2.6; T.wrist = -1.2; }
        else if (p < 1.7) { T.aRX = 0.95; T.wrist = -1.6; }
        else if (p >= 10 && p < 11) { T.aRX = 1.8; T.wrist = -1.7; }
        else { T.aRX = 1.0 + (p > 8 && p < 10 ? Math.sin(t * 25) * 0.05 : 0); T.wrist = -1.6; }
        T.aLX = T.aRX + 0.1; T.aLZ = 0.4; T.aRZ = -0.1; T.headX = -0.35;
        if (passed(t - dt, t, 18, 10 / 18)) m.choreBeat = 'splash';
        return 10;
    },
    read(m, T, t) {
        SIT(T);
        const p = t % 8;
        T.aLX = 1.05; T.aLZ = 0.38; T.aRX = p < 0.7 ? 1.3 : 1.05; T.aRZ = p < 0.7 ? -0.6 : -0.38;
        T.headX = -0.45; T.hx = 0.05; T.headY = 0;
        return 8;
    },
    windows(m, T, t, dt) {
        const p = t % 9;
        if (p < 1.5) { T.hx = -0.9; T.aRX = 0.7; T.aRZ = 0.45; T.wrist = -1.4; T.headX = -0.2; }
        else {
            const w = t * 4;
            T.aRX = 1.6 + 0.35 * Math.sin(w); T.aRZ = -0.1 + 0.3 * Math.cos(w); T.wrist = -2.9;
            T.aLX = 0.3; T.aLZ = -0.3;
            if (passed(t - dt, t, Math.PI, 0)) m.choreBeat = 'wipe';
        }
        return 14;
    },
    sack(m, T) { T.hx = -0.9; T.aLX = T.aRX = 1.0; T.aLZ = 0.2; T.aRZ = -0.2; T.kL = T.kR = -0.4; T.lL = T.lR = 0.25; T.headX = -0.2; return 8; },
    lute(m, T, t, dt) {
        SIT(T);
        T.aRX = 0.85 + Math.sin(t * 12) * 0.12; T.aRZ = -0.45;
        T.aLX = 1.35; T.aLZ = -0.25; T.headX = -0.2; T.headY = Math.sin(t * 1.5) * 0.2;
        if (passed(t - dt, t, 0.45, 0)) { m.choreBeat = 'pluck'; m.choreNote = PLUCK[(m._pluckI = ((m._pluckI || 0) + 1) % PLUCK.length)]; }
        return 20;
    },
    potion(m, T, t, dt) {
        const w = t * 2.4;
        T.aRX = 1.2 + 0.15 * Math.sin(w); T.aRZ = -0.2 * Math.cos(w); T.wrist = -Math.PI;
        const pinch = t % 8 < 1.2;
        T.aLX = pinch ? 1.5 : 0.4; T.aLZ = pinch ? 0.3 : -0.2;
        T.hx = -0.25; T.headX = -0.35;
        if (passed(t - dt, t, 1.5, 0)) m.choreBeat = 'bubble';
        return 14;
    },
    dummy(m, T, t, dt) {
        const P = 2.2, p = (t / P) % 1;
        T.aRX = Math.PI / 2 + 0.05; T.aRZ = 0.05; T.wrist = -Math.PI - (p < 0.08 ? 0.35 : 0);
        T.aLX = 0.35; T.aLZ = -0.25; T.hx = -0.05;
        if (passed(t - dt, t, P, 0.12)) m.choreBeat = 'zap';
        return 26;
    },
    levbooks(m, T, t, dt) {
        T.aRX = 2.4 + 0.15 * Math.sin(t * 1.8); T.aRZ = 0.15 * Math.cos(t * 1.8); T.wrist = -Math.PI;
        T.aLX = 0.5; T.aLZ = -0.3; T.headX = 0.4;
        if (passed(t - dt, t, 5, 0)) m.choreBeat = 'magic';
        return 8;
    },
    plants(m, T, t, dt) {
        T.hx = -0.45; T.aRX = 0.95; T.wrist = -Math.PI; T.hy = Math.sin(t * 0.5) * 0.45;
        T.aLX = t % 6 < 1.5 ? 1.0 : 0.3; T.aLZ = 0.2; T.headX = -0.4;
        if (passed(t - dt, t, 6, 0)) m.choreBeat = 'magic';
        return 6;
    },
    meditate(m, T, t) {
        SIT(T, -1.15 + 0.55 + 0.15 * Math.sin(t * 1.2));
        T.lL = T.lR = 1.4; T.kL = T.kR = -2.5; m._legZ = -0.55;
        T.aLX = T.aRX = 0.75; T.aLZ = -0.4; T.aRZ = 0.4; T.headX = -0.15; T.headY = 0;
        return 3;
    },
};

/** While carrying (walking home): the arms hold the thing, the legs walk on. */
const CARRY = {
    carryWater(m, T) { T.aRX = 0.05 + T.aRX * 0.2; T.aRZ = 0.3; T.aLZ = -0.35; T.hy = 0.08; },
    carrySack(m, T) { T.aRX = 2.8; T.aRZ = 0.1; T.wrist = -1.6; T.hx -= 0.15; T.hy = 0.1; },
};

/** (VillagerModel.update, mode 'chore') The body's targets for the chore; returns the rate. */
export function choreBody(m, key, T, t, dt) {
    m._lift = 0; m._legZ = 0;
    if (key === 'ball') m._ballP = ((performance.now() / 1000 / 2.4) + (m.choreSide ? 0.5 : 0)) % 1;
    const fn = POSE[key];
    return fn ? fn(m, T, t, dt) : 10;
}

/** (walking) A carried thing: the arms hold it. */
export function carryBody(m, key, T) { CARRY[key]?.(m, T); }

/** After the body is posed: the things move (book pages, a log split, a ball, stones in the air…). */
export function choreThings(m, key, t, dt, V) {
    const P = m._chores?.[key]?.parts;
    if (!P) return;
    if (key === 'ball' || key === 'fish' || key === 'dummy') m.props.updateWorldMatrix(true, false); // (hand → ground: this frame's places)
    const ph = (period, off = 0) => ((t + off) / period) % 1;
    switch (key) {
        case 'chop': {
            const p = ph(1.7);
            const split = p >= 0.68;
            P.log.visible = !split;
            P.halfA.visible = P.halfB.visible = split;
            if (split) {
                const k = clamp01((p - 0.68) / 0.18);
                P.halfA.position.set(-0.13 - 0.9 * k, 0.92 - 0.92 * k, -1.75); P.halfA.rotation.z = 1.4 * k;
                P.halfB.position.set(0.13 + 0.9 * k, 0.92 - 0.92 * k, -1.75); P.halfB.rotation.z = -1.4 * k;
            }
            break;
        }
        case 'laundry': P.cloths.rotation.x = Math.sin(t * 1.7) * 0.12; break;
        case 'feed': {
            for (let i = 0; i < 3; i++) P['hen' + i].rotation.x = -0.6 * Math.max(0, Math.sin(t * 5 + i * 2.1)) ** 4;
            const p = ph(1.6);
            P.grain.visible = p > 0.45 && p < 0.85;
            if (P.grain.visible) { const k = (p - 0.45) / 0.4; P.grain.position.set(-0.6 + 0.4 * k, lerp(2.4, 0.05, k * k), lerp(-0.9, -2.0, k)); }
            break;
        }
        case 'ball': {
            const p = m._ballP, o = P.ball;
            if (p < 0.35) {
                const k = p / 0.35;
                o.visible = true;
                o.position.set(lerp(0.8, -0.8, k), lerp(4.1, 3.3, k) + 2.0 * 4 * k * (1 - k), lerp(-0.8, -(BALL_D - 1.18), k));
                o.rotation.x = k * 6;
            } else if (p >= 0.85) {
                m.handSlot.getWorldPosition(V); m.props.worldToLocal(V);
                o.visible = true; o.position.set(V.x, V.y + 0.1, V.z - 0.15);
            } else o.visible = false;
            if (m._ballPrev != null && m._ballPrev < 0.85 && p >= 0.85) m.choreBeat = 'catch';
            m._ballPrev = p;
            break;
        }
        case 'fish': {
            // the line hangs from the rod's tip to the water (under the pier)
            m.handSlot.updateWorldMatrix(true, false);
            V.set(0, 4.15, 0); m.handSlot.localToWorld(V); m.props.worldToLocal(V);
            const p = t % 18;
            const caught = p >= 10 && p < 14;
            const bottom = caught ? V.y - 1.4 : -1.6 + (p > 8 && p < 10 ? Math.sin(t * 20) * 0.12 - 0.15 : Math.sin(t * 2) * 0.05);
            const len = Math.max(0.2, V.y - bottom);
            P.line.position.set(V.x, V.y, V.z); P.line.scale.y = len;
            P.float.position.set(V.x, bottom, V.z); P.float.visible = !caught;
            P.fishy.visible = caught; P.fishy.position.set(V.x, bottom, V.z); P.fishy.rotation.y = Math.sin(t * 9) * 0.5;
            break;
        }
        case 'read': {
            const p = t % 8;
            P.page.rotation.z = p < 0.7 ? -Math.PI * ease(p / 0.7) : 0;
            P.book.rotation.x = P.page.rotation.x = 0.85;
            break;
        }
        case 'potion': {
            const a = t * 2.4;
            P.ladle.position.set(Math.cos(a) * 0.35, 1.25, -1.8 + Math.sin(a) * 0.35);
            P.ladle.rotation.z = Math.cos(a) * 0.25; P.ladle.rotation.x = -Math.sin(a) * 0.25;
            const k = ph(1.5);
            P.bubbles.position.y = 1.3 + k * 0.5; P.bubbles.scale.setScalar(1 - k * 0.7);
            break;
        }
        case 'dummy': {
            const p = ph(2.2);
            const fly = p < 0.12;
            P.spark.visible = fly;
            if (fly) {
                m.getWandTip(V); m.props.worldToLocal(V);
                const k = p / 0.12;
                P.spark.position.set(lerp(V.x, 0, k), lerp(V.y, 2.95, k), lerp(V.z, -4.2, k));
            }
            const hit = p >= 0.12 ? (p - 0.12) * 2.2 : 1e3;
            P.dummy.rotation.x = hit < 3 ? 0.25 * Math.exp(-hit * 1.6) * Math.cos(hit * 9) : 0;
            break;
        }
        case 'levbooks':
            for (let i = 0; i < 3; i++) {
                const a = t * 0.9 + i * 2.094, o = P['b' + i];
                o.position.set(Math.cos(a) * 1.15, 4.5 + Math.sin(t * 1.6 + i) * 0.25, -1.4 + Math.sin(a) * 1.15);
                o.rotation.set(Math.sin(t + i) * 0.4, -a, 0.3);
            }
            break;
        case 'plants':
            for (let i = 0; i < 3; i++) P['p' + i].scale.setScalar(1 + 0.07 * Math.sin(t * 2.2 + i * 1.7));
            break;
        case 'meditate': {
            const y = 0.95 + 0.55 + 0.15 * Math.sin(t * 1.2);
            for (let i = 0; i < 4; i++) {
                const a = t * 0.6 + i * Math.PI / 2, o = P['s' + i];
                o.position.set(Math.cos(a) * 1.8, y + 0.6 + Math.sin(t * 1.3 + i * 1.7) * 0.3, Math.sin(a) * 1.8);
                o.rotation.y = a;
            }
            break;
        }
        default: break;
    }
}
