/** Mineral-stained bones discovered by digging in a cave floor. There are no collectible items. */
import { createRng, hashString } from '../core/math.js';
import { BLOCK, CHUNK, MIN_LAYER } from './Terrain.js';

export const BONE_CHANCE = .20;

export function buryCaveBones(chunk, cave, seed) {
    if (!cave.start || cave.lair || !/^cv(?:test|[hm]?-?\d+_)/.test(cave.id)) return;
    const rng = createRng(hashString(cave.id + ':bones') ^ seed);
    if (rng() >= BONE_CHANCE && !cave.test) return;
    const angle = rng() * Math.PI * 2, d = cave.r * (.38 + rng() * .20);
    const x = Math.round(cave.kx + Math.cos(angle) * d), z = Math.round(cave.kz + Math.sin(angle) * d);
    const lx = x - chunk.cx * CHUNK, lz = z - chunk.cz * CHUNK;
    const layer = cave.F - 1;
    if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || layer <= MIN_LAYER) return;
    const stride = CHUNK * CHUNK, i = (layer - MIN_LAYER) * stride + lz * CHUNK + lx, b = chunk.blocks;
    if ((b[i] !== BLOCK.STONE && b[i] !== BLOCK.DIRT) ||
        (b[i + stride] !== BLOCK.STONE && b[i + stride] !== BLOCK.DIRT) || b[i + 2 * stride] !== BLOCK.AIR) return;
    b[i] = rng() < .4 ? BLOCK.BURIED_SKELETON : BLOCK.BURIED_BONES;
}

/** Two silhouettes in one painted atlas, with chipped tips, porous grain and packed earth in the gaps. */
export function paintCaveBones(canvas) {
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let variant = 0; variant < 2; variant++) {
        const rng = createRng(68114 + variant);
        ctx.save();
        ctx.translate(64 + variant * 128, 61);
        ctx.rotate(variant ? -.23 : .30);
        ctx.lineCap = 'round';
        const bone = (x, y, x1, y1, radius) => {
            for (const [stroke, extra, offset] of [['#514130', 2.5, 1.8], ['#a39170', .5, 0], ['#c7b991', -1.1, -.7]]) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = radius * 2 + extra;
                ctx.beginPath(); ctx.moveTo(x + offset, y + offset); ctx.lineTo(x1 + offset, y1 + offset); ctx.stroke();
            }
            ctx.fillStyle = '#cbbe9b';
            for (const [a, b] of [[x, y], [x1, y1]]) {
                ctx.beginPath(); ctx.ellipse(a, b, radius + 1, radius + .4, .5, 0, 2 * Math.PI); ctx.fill();
            }
        };
        ctx.fillStyle = '#6e5842';
        ctx.beginPath(); ctx.ellipse(1, -37, 11, 10, .2, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#cebc95';
        ctx.beginPath(); ctx.ellipse(0, -38, 9, 9, .2, 0, 2 * Math.PI); ctx.fill();
        ctx.fillRect(-5, -33, 10, 7);
        ctx.fillStyle = '#554435';
        for (const x of [-4, 4]) {
            ctx.beginPath(); ctx.ellipse(x, -37, 2.5, 3, .25, 0, 2 * Math.PI); ctx.fill();
        }
        bone(0, -23, 0, 11, 2);
        for (const side of [-1, 1]) {
            bone(side * 2, -21, side * 12, -18, 1.6);
            for (let i = 0; i < 5; i++) {
                const y = -17 + i * 4;
                ctx.strokeStyle = i % 2 ? '#b7a587' : '#cebf9c';
                ctx.lineWidth = 2.6;
                ctx.beginPath(); ctx.moveTo(side * 2, y);
                ctx.quadraticCurveTo(side * (19 - i * .7), y - 2, side * (11 - i), y + 7);
                ctx.stroke();
            }
            bone(side * 13, -18, side * 19, 1 + side * 2, 2);
            if (!variant || side === 1) bone(side * 19, 4, side * 24, 17, 1.8);
            if (!variant) {
                bone(side * 2, 11, side * 8, 17, 3);
                bone(side * 8, 17, side * 11, 32 + side, 2.9);
                bone(side * 11, 36 + side, side * 14, 49, 2);
            }
        }
        if (variant) { bone(6, 16, 22, 28, 2.1); bone(-29, 18, -22, 23, 1.4); }
        ctx.globalCompositeOperation = 'source-atop';
        for (let i = 0; i < 270; i++) {
            ctx.fillStyle = rng() < .55 ? 'rgba(67,46,30,.28)' : 'rgba(234,216,169,.32)';
            const x = (rng() - .5) * 62, y = (rng() - .5) * 102;
            ctx.fillRect(x, y, .6 + rng() * 1.9, .6 + rng() * 1.7);
        }
        ctx.restore();
    }
}
