import { WATER_KIND } from './opushka-world.js';

const VIEW = 105;
const MAP_UPDATE_MS = 90;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class OpushkaMap {
    constructor(canvas, { heights, forest, water, size, half, step, caves, buildings = () => [], chests = () => [] }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.half = half;
        this.step = step;
        this.mouths = caves.systems.map((c) => c.start);
        this.last = -Infinity;
        this.buildings = buildings;
        this.chests = chests;
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
        const cx = w / 2, cy = h / 2, scale = cx / VIEW;
        const span = VIEW * 2 / this.step, heightSpan = span * h / w;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 9);
        ctx.clip();
        ctx.fillStyle = '#292f26';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(this.source, (player.pos.x + this.half) / this.step - span / 2,
            (player.pos.z + this.half) / this.step - heightSpan / 2, span, heightSpan, 0, 0, w, h);

        const edge = ctx.createLinearGradient(0, 0, 0, h);
        edge.addColorStop(0, 'rgba(24,28,22,.20)');
        edge.addColorStop(0.2, 'rgba(24,28,22,0)');
        edge.addColorStop(0.8, 'rgba(24,28,22,0)');
        edge.addColorStop(1, 'rgba(24,28,22,.24)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, w, h);
        const at = (x, z) => [cx + (x - player.pos.x) * scale, cy + (z - player.pos.z) * scale];
        for (const mouth of this.mouths) {
            const [x, y] = at(mouth.x, mouth.z);
            if (x < 4 || x > w-4 || y < 4 || y > h-4) continue;
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
        for (const house of this.buildings()) {
            const [x, y] = at(house.x, house.z);
            const width = Math.max(10, house.width * scale), height = Math.max(8, house.depth * scale);
            if (x < -width || x > w + width || y < -height || y > h + height) continue;
            ctx.fillStyle = house.ruined ? '#746f5a' : house.style === 'hall' || house.style === 'castle' ? '#bcb7a6' : '#b98154';
            ctx.strokeStyle = house.ruined ? '#c0ad8b' : '#f0d9ad';
            ctx.lineWidth = 1.7;
            ctx.setLineDash(house.ruined ? [2, 2] : []);
            ctx.fillRect(x-width/2,y-height/2,width,height);
            ctx.strokeRect(x-width/2,y-height/2,width,height);
            ctx.setLineDash([]);
            if (!house.ruined) {
                ctx.fillStyle = '#4e4436';
                ctx.fillRect(x-1.15,y+height/2-2,2.3,2.6);
            }
        }
        for (const chest of this.chests()) {
            if (Math.abs(chest.y - player.pos.y) > 3) continue;
            const [x,y] = at(chest.x,chest.z);
            if (x < 3 || x > w-3 || y < 3 || y > h-3) continue;
            ctx.fillStyle = chest.open ? '#777362' : '#f2c56c';
            ctx.strokeStyle = '#423326';
            ctx.lineWidth=1.5;
            ctx.fillRect(x-3.3,y-2.8,6.6,5.6);
            ctx.strokeRect(x-3.3,y-2.8,6.6,5.6);
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(220,208,173,.38)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 9);
        ctx.stroke();

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
