import { WATER_KIND } from './opushka-world.js';

const VIEW = 105;
const MAP_UPDATE_MS = 90;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class OpushkaMap {
    constructor(canvas, { heights, forest, water, size, half, step, caves }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.half = half;
        this.step = step;
        this.mouths = caves.systems.map((c) => c.start);
        this.last = -Infinity;
        this.source = document.createElement('canvas');
        this.source.width = this.source.height = size;
        const ctx = this.source.getContext('2d'), pixels = ctx.createImageData(size, size);
        for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
            const i = z * size + x, h = heights[i], f = forest[i];
            const a = heights[z * size + Math.max(0, x - 1)], b = heights[z * size + Math.min(size - 1, x + 1)];
            const c = heights[Math.max(0, z - 1) * size + x], d = heights[Math.min(size - 1, z + 1) * size + x];
            const shade = clamp((a - b) * 2 + (c - d) * 4, -34, 32);
            const peak = clamp((h - 16) / 50, 0, 1), snow = clamp((h - 48) / 30, 0, 1);
            const contour = h > 4 && h % 5 < 0.42 ? 8 : 0;
            const channel = water[i];
            let r = 124 - 58 * f + peak * 18 + 53 * snow, g = 132 - 45 * f + 42 * snow, b0 = 75 - 22 * f + peak * 28 + 57 * snow;
            if (channel) {
                const shallow = 1 - clamp(-h / (channel === WATER_KIND.SEA ? 10 : 4), 0, 1);
                r = 40 + shallow * 29; g = 79 + shallow * 28; b0 = (channel === WATER_KIND.LAKE ? 91 : 104) + shallow * 26;
            } else { r += shade - contour; g += shade - contour; b0 += shade - contour; }
            pixels.data.set([r, g, b0, 255], i * 4);
        }
        ctx.putImageData(pixels, 0, 0);
    }

    draw(player, now = performance.now()) {
        if (now - this.last < MAP_UPDATE_MS) return;
        this.last = now;
        const { ctx, canvas } = this, w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2, span = VIEW * 2 / this.step;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.source, (player.pos.x + this.half) / this.step - span / 2,
            (player.pos.z + this.half) / this.step - span / 2, span, span, 0, 0, w, h);

        for (const mouth of this.mouths) {
            const x = cx + (mouth.x - player.pos.x) * cx / VIEW, y = cy + (mouth.z - player.pos.z) * cy / VIEW;
            if (Math.hypot((x - cx) / cx, (y - cy) / cy) > 0.82) continue;
            ctx.fillStyle = '#191e1b';
            ctx.strokeStyle = '#e5d5ae';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x - 5, y + 3);
            ctx.quadraticCurveTo(x - 5, y - 4, x, y - 6);
            ctx.quadraticCurveTo(x + 5, y - 4, x + 5, y + 3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(cx, cy);
        const vignette = ctx.createRadialGradient(0, 0, 0.58, 0, 0, 1);
        vignette.addColorStop(0, 'rgba(25,31,24,0)');
        vignette.addColorStop(1, 'rgba(25,31,24,.58)');
        ctx.fillStyle = vignette;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.globalCompositeOperation = 'destination-in';
        const edge = ctx.createRadialGradient(0, 0, 0.69, 0, 0, 1);
        edge.addColorStop(0, '#fff');
        edge.addColorStop(0.86, 'rgba(255,255,255,.38)');
        edge.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = edge;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-player.yaw);
        ctx.shadowColor = '#171a13';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#f4e5bd';
        ctx.strokeStyle = '#262820';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(6.7, 7);
        ctx.lineTo(0, 3.5);
        ctx.lineTo(-6.7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
