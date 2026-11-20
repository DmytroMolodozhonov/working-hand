import * as THREE from 'three';
import { createRng } from '../core/math.js';

// A repeat contains eight courses of long boards. The shader sets their size in metres.
function paintWood(ctx, size) {
    ctx.fillStyle = '#cacaca';
    ctx.fillRect(0, 0, size, size);
    const rng = createRng(643127);
    const height = size / 8;
    for (let row = 0; row < 8; row++) {
        const y = row * height;
        const offset = Math.floor(rng() * size);
        const split = size * (0.35 + rng() * 0.30);
        const boards = [[offset, split], [offset + split, size - split]];
        for (const [start, length] of boards) {
            const tone = Math.round(193 + rng() * 35);
            const seed = Math.floor(rng() * 0x100000000);
            for (const shift of [-size, 0]) {
                const x = start + shift;
                const wood = createRng(seed);
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, length, height);
                ctx.clip();
                const bevel = ctx.createLinearGradient(x, y, x, y + height);
                bevel.addColorStop(0, `rgb(${tone + 15},${tone + 15},${tone + 15})`);
                bevel.addColorStop(.16, `rgb(${tone},${tone},${tone})`);
                bevel.addColorStop(.84, `rgb(${tone - 3},${tone - 3},${tone - 3})`);
                bevel.addColorStop(1, `rgb(${tone - 31},${tone - 31},${tone - 31})`);
                ctx.fillStyle = bevel;
                ctx.fillRect(x, y, length, height);

                const knotX = length * (.24 + wood() * .5), knotY = height * (.29 + wood() * .42);
                const knot = wood() < .7;
                for (let i = 0; i < 112; i++) {
                    const v = wood() * height, wave = .5 + wood() * 2.1, phase = wood() * Math.PI * 2;
                    ctx.lineWidth = .3 + wood() * 1.15;
                    ctx.strokeStyle = i % 4 ? `rgba(37,32,26,${.07 + wood() * .16})` : 'rgba(255,251,235,.24)';
                    ctx.beginPath();
                    for (let u = 0; u < length + 6; u += 6) {
                        const bend = knot ? Math.sign(v - knotY) * 8 * Math.exp(-(((u - knotX) / 21) ** 2) - Math.abs(v - knotY) / 8) : 0;
                        ctx.lineTo(x + u, y + v + wave * Math.sin(u / 23 + phase) + bend);
                    }
                    ctx.stroke();
                }
                if (knot) {
                    for (const radius of [4, 8, 13]) {
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(60,48,35,.24)';
                        ctx.beginPath();
                        ctx.ellipse(x + knotX, y + knotY, radius, 1.4 + radius * .23, -.18, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
                ctx.fillStyle = 'rgba(49,41,33,.58)';
                ctx.fillRect(x, y, 1.4, height);
                ctx.restore();
            }
        }
        ctx.fillStyle = 'rgba(56,46,36,.54)';
        ctx.fillRect(0, y, size, 1.7);
    }
}

let texture;
export function buildingWoodTexture() {
    if (typeof document === 'undefined') return null;
    if (!texture) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        paintWood(canvas.getContext('2d'), canvas.width);
        texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        texture.userData = { shared: true };
    }
    return texture;
}
