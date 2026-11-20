import * as THREE from 'three';
import { createRng } from '../core/math.js';

const SIZE = 256, maps = new Map();

function grain(ctx, rng, count) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = rng() < .5 ? 'rgba(32,24,17,.19)' : 'rgba(255,248,228,.23)';
        ctx.fillRect(rng() * SIZE, rng() * SIZE, .6 + rng() * 1.6, .6 + rng() * 1.5);
    }
}

function wood(ctx, rng) {
    ctx.fillStyle = '#beb0a0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 110; i++) {
        const y = rng() * SIZE, sway = 1 + rng() * 8, wave = rng() * 6;
        ctx.strokeStyle = i % 3 ? 'rgba(54,37,25,.24)' : 'rgba(253,235,205,.28)';
        ctx.lineWidth = .5 + rng() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 8; x <= SIZE; x += 8) ctx.lineTo(x, y + Math.sin(x / 48 + wave) * sway);
        ctx.stroke();
    }
    for (const [x, y] of [[61, 90], [183, 169]]) {
        for (let r = 3; r < 18; r += 3.2) {
            ctx.strokeStyle = 'rgba(50,34,24,.24)';
            ctx.beginPath();
            ctx.ellipse(x, y, r * 2.45, r * .6, -.13, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.strokeStyle = 'rgba(56,37,22,.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 240);
    grain(ctx, rng, 3900);
}

function fabric(ctx, rng, quilt) {
    ctx.fillStyle = quilt ? '#c5beb0' : '#d3cabe';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const fold = ctx.createLinearGradient(0, 0, SIZE, 48);
    fold.addColorStop(0, 'rgba(41,34,27,.16)');
    fold.addColorStop(.18, 'rgba(255,255,246,.16)');
    fold.addColorStop(.46, 'rgba(70,55,40,.13)');
    fold.addColorStop(.66, 'rgba(255,255,246,.14)');
    fold.addColorStop(1, 'rgba(41,34,27,.16)');
    ctx.fillStyle = fold;
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < SIZE; i += 3) {
        ctx.fillStyle = 'rgba(74,56,44,.15)';
        ctx.fillRect(i, 0, 1, SIZE);
        ctx.fillStyle = 'rgba(253,245,225,.18)';
        ctx.fillRect(0, i, SIZE, 1);
    }
    grain(ctx, rng, 7000);
    if (quilt) {
        ctx.strokeStyle = 'rgba(62,49,37,.23)';
        for (let z = 0; z < SIZE; z += 64) for (let x = 0; x < SIZE; x += 64) {
            const shade = ctx.createRadialGradient(x + 31, z + 29, 2, x + 31, z + 29, 40);
            shade.addColorStop(0, 'rgba(255,250,240,.26)');
            shade.addColorStop(.62, 'rgba(255,250,240,.07)');
            shade.addColorStop(1, 'rgba(54,46,37,.10)');
            ctx.fillStyle = shade;
            ctx.fillRect(x + 1, z + 1, 62, 62);
            ctx.strokeRect(x + 1.5, z + 1.5, 61, 61);
        }
    }
    ctx.strokeStyle = 'rgba(67,53,39,.43)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 244, 244);
    ctx.strokeStyle = 'rgba(255,246,224,.72)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(9, 9, 238, 238);
}

/** A shared baked map for timber, linen or quilted wool. */
export function bedTexture(kind) {
    if (typeof document === 'undefined') return null;
    if (maps.has(kind)) return maps.get(kind);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d'), rng = createRng(96127);
    if (kind === 'wood') wood(ctx, rng);
    else fabric(ctx, rng, kind === 'quilt');
    const map = new THREE.CanvasTexture(canvas);
    map.encoding = THREE.sRGBEncoding;
    map.anisotropy = 4;
    map.userData = { shared: true };
    maps.set(kind, map);
    return map;
}
