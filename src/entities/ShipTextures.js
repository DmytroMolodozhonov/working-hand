/** Baked material maps shared by every ship. Distances are measured along the hull or deck. */
import * as THREE from 'three';
import { createRng } from '../core/math.js';

const W = 1024, H = 512;

function surface(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext('2d');
}

function map(ctx, repeatX, repeatY, color = true) {
    const tex = new THREE.CanvasTexture(ctx.canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    if (color) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.userData = { shared: true };
    return tex;
}

function plankMaps(hull) {
    const ink = surface(W, H), depth = surface(W / 2, H / 2);
    depth.scale(.5, .5);
    const rng = createRng(hull ? 846264 : 653885);
    const n = hull ? 11 : 10, rowH = H / n;
    const palette = hull ? [215, 199, 180] : [234, 222, 205];
    depth.fillStyle = '#858585';
    depth.fillRect(0, 0, W, H);
    const strip = (ctx, x, y, w, h) => {
        for (const off of [-W, 0, W]) ctx.fillRect(x + off, y, w, h);
    };
    for (let row = 0; row < n; row++) {
        const y = row * rowH;
        const offset = Math.floor(W * rng());
        const ends = [0, 210 + rng() * 57, 458 + rng() * 63, 720 + rng() * 82, W];
        for (let i = 0; i < ends.length - 1; i++) {
            const start = offset + ends[i], length = ends[i + 1] - ends[i];
            const tone = (rng() - .5) * (hull ? 34 : 27);
            ink.fillStyle = 'rgb(' + palette.map(c => Math.round(c + tone)).join(',') + ')';
            strip(ink, start, y, length, rowH + .4);
            for (const dx of [-W, 0]) {
                const a = start + dx;
                ink.save();
                ink.beginPath(); ink.rect(a, y, length, rowH); ink.clip();
                const fade = ink.createLinearGradient(a, y, a, y + rowH);
                fade.addColorStop(0, 'rgba(32,27,23,.30)');
                fade.addColorStop(.12, 'rgba(255,248,225,.16)');
                fade.addColorStop(.48, 'rgba(255,255,239,.04)');
                fade.addColorStop(.82, 'rgba(35,28,22,.04)');
                fade.addColorStop(1, 'rgba(35,28,22,.24)');
                ink.fillStyle = fade; ink.fillRect(a, y, length, rowH);
                // The same grain on the two pieces of a plank crossing the atlas boundary.
                const fibers = createRng((row + 11) * 1473 + i * 503 + (hull ? 9 : 51));
                const knotX = length * (.25 + .51 * fibers()), knotY = rowH * (.3 + .44 * fibers());
                for (let k = 0; k < 63; k++) {
                    const v = fibers() * rowH, phase = fibers() * 6.28, wave = .4 + fibers() * 3.3;
                    const deep = Math.exp(-Math.abs(v - knotY) / (rowH * .19));
                    ink.lineWidth = .25 + fibers() * 1.65;
                    ink.strokeStyle = k % 4 ? 'rgba(54,41,31,' + (.055 + fibers() * .2) + ')' : 'rgba(255,245,219,.26)';
                    ink.beginPath();
                    for (let u = 0; u <= length + 7; u += 7) {
                        const curl = Math.sign(v - knotY) * Math.exp(-(((u - knotX) / 25) ** 2)) * deep * 7;
                        ink.lineTo(a + u, y + v + Math.sin(u / 37 + phase) * wave + curl);
                    }
                    ink.stroke();
                }
                if ((row * 11 + i * 23) % 7 < 3) {
                    const kx = a + knotX, ky = y + knotY;
                    for (let j = 3; j <= 16; j += 3) {
                        ink.strokeStyle = 'rgba(59,42,30,.25)';
                        ink.lineWidth = .8;
                        ink.beginPath(); ink.ellipse(kx, ky, j * 1.57, j * .38, -.12, 0, 6.2832); ink.stroke();
                    }
                }
                const weather = ink.createRadialGradient(a + length * .45, y + rowH * .6, 1, a + length * .45, y + rowH * .6, length * .44);
                weather.addColorStop(0, row % 3 === 1 ? 'rgba(255,247,219,.23)' : 'rgba(58,48,34,.16)');
                weather.addColorStop(1, 'rgba(190,160,125,0)');
                ink.fillStyle = weather; ink.fillRect(a, y, length, rowH);
                ink.restore();
            }
        }
        // Draw joints and fasteners over the whole band once all the planks are painted.
        for (const end of ends.slice(0, -1)) {
            const seam = (offset + end) % W;
            ink.fillStyle = 'rgba(37,30,25,.76)';
            strip(ink, seam - .65, y, 1.65, rowH);
            depth.fillStyle = '#393939';
            strip(depth, seam - .65, y, 1.65, rowH);
            for (const side of [-1, 1]) for (const k of [.29, .7]) {
                const x = seam + side * 4.1, yy = y + k * rowH;
                for (const off of [-W, 0, W]) {
                    ink.fillStyle = '#635b50';
                    ink.beginPath(); ink.arc(x + off, yy, 1.28, 0, 6.2832); ink.fill();
                    ink.fillStyle = '#aaa08d';
                    ink.fillRect(x + off - .55, yy - .8, .85, .65);
                }
            }
        }
        ink.fillStyle = 'rgba(46,37,31,.73)';
        ink.fillRect(0, y, W, hull ? 2.2 : 1.45);
        depth.fillStyle = '#343434';
        depth.fillRect(0, y, W, 2);
        depth.fillStyle = '#a3a3a3';
        depth.fillRect(0, y + 2, W, 1.4);
    }
    // Long wear and salt haze are baked across the planks as well as into individual boards.
    for (let i = 0; i < 34; i++) {
        const x = rng() * W, y = rng() * H, radius = 20 + rng() * 84;
        for (const u of [-W, 0, W]) for (const v of [-H, 0, H]) {
            const xx = x + u, yy = y + v;
            if (xx + radius < 0 || xx - radius > W || yy + radius < 0 || yy - radius > H) continue;
            const patch = ink.createRadialGradient(xx, yy, 0, xx, yy, radius);
            patch.addColorStop(0, i % 3 ? 'rgba(255,246,216,.11)' : 'rgba(54,44,38,.15)');
            patch.addColorStop(1, 'rgba(150,135,116,0)');
            ink.fillStyle = patch; ink.fillRect(xx - radius, yy - radius, radius * 2, radius * 2);
        }
    }
    const rx = hull ? 4 / 20 : 4 / 17, ry = hull ? 4 / 6.1 : 4 / 5;
    return { color: map(ink, rx, ry), relief: map(depth, rx, ry, false) };
}

function solidWood() {
    const ink = surface(256, 256), rng = createRng(73061);
    ink.fillStyle = '#d9cbb8';
    ink.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 230; i++) {
        const y = rng() * 256, a = rng() * 4, phase = rng() * 6.2832;
        ink.lineWidth = .3 + rng() * 2.1;
        ink.strokeStyle = i % 4 ? 'rgba(54,41,34,.18)' : 'rgba(255,241,210,.27)';
        for (const offset of [-256, 0, 256]) {
            ink.beginPath();
            for (let x = 0; x <= 256; x += 4) ink.lineTo(x, y + offset + a * Math.sin(x * Math.PI / 128 + phase));
            ink.stroke();
        }
    }
    return map(ink, .6, 1);
}

function sailcloth() {
    const ink = surface(512, 512), rng = createRng(6072);
    for (let panel = 0; panel < 7; panel++) {
        const x = panel * 512 / 7, w = 512 / 7, s = 217 + Math.round(rng() * 26);
        ink.fillStyle = 'rgb(' + [s, s - 4, s - 14].join(',') + ')';
        ink.fillRect(x, 0, w + .4, 512);
        const fold = ink.createLinearGradient(x, 0, x + w, 0);
        fold.addColorStop(0, 'rgba(67,59,43,.31)');
        fold.addColorStop(.16, 'rgba(255,251,232,.25)');
        fold.addColorStop(.66, 'rgba(255,252,233,.03)');
        fold.addColorStop(1, 'rgba(77,63,48,.20)');
        ink.fillStyle = fold; ink.fillRect(x, 0, w, 512);
        ink.fillStyle = 'rgba(66,58,44,.48)'; ink.fillRect(x, 0, 1.2, 512);
        ink.fillStyle = 'rgba(94,82,63,.46)';
        for (let j = 2; j < 512; j += 7) ink.fillRect(x + 4, j, 1, 3);
    }
    for (let i = 0; i < 512; i += 2) {
        ink.fillStyle = 'rgba(92,75,54,.11)'; ink.fillRect(i, 0, 1, 512);
        ink.fillStyle = 'rgba(255,252,237,.15)'; ink.fillRect(0, i, 512, 1);
    }
    const wear = ink.createLinearGradient(0, 0, 0, 512);
    wear.addColorStop(0, 'rgba(87,72,54,.19)');
    wear.addColorStop(.13, 'rgba(255,250,231,.05)');
    wear.addColorStop(.65, 'rgba(106,90,66,0)');
    wear.addColorStop(1, 'rgba(112,95,66,.24)');
    ink.fillStyle = wear; ink.fillRect(0, 0, 512, 512);
    ink.strokeStyle = 'rgba(76,65,47,.47)'; ink.lineWidth = 3;
    for (const y of [6, 72, 505]) {
        ink.beginPath(); ink.moveTo(0, y); ink.lineTo(512, y); ink.stroke();
    }
    for (let x = 10; x < 512; x += 18) {
        ink.fillStyle = 'rgba(109,87,61,.66)'; ink.fillRect(x, 73, 1.8, 10 + rng() * 6);
    }
    return map(ink, 1, 1);
}

function forgedIron() {
    const ink = surface(128, 128), rng = createRng(72412);
    ink.fillStyle = '#b0ada6'; ink.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1200; i++) {
        const x = rng() * 128, y = rng() * 128, w = .5 + rng() * 2.2;
        ink.fillStyle = i % 3 ? 'rgba(56,45,34,.17)' : 'rgba(237,230,204,.24)';
        ink.fillRect(x, y, w, w * .54);
    }
    return map(ink, 2, 2);
}

let materials;
export function shipTextures() {
    if (typeof document === 'undefined') return {};
    return materials ??= { hull: plankMaps(true), deck: plankMaps(false), timber: solidWood(), sail: sailcloth(), iron: forgedIron() };
}
