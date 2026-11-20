/** Seamless world-space soil swatch. The game and the material preview use the same pixels. */
export const SOIL_SIZE = 512;
export const SOIL_METRES = 10;

function grain(x, y, salt) {
    let h = Math.imul(x + 137, 374761393) ^ Math.imul(y - 159, 668265263) ^ Math.imul(salt, 2246822519);
    h = Math.imul(h ^ (h >>> 15), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (n, period) => ((n % period) + period) % period;

function noise(x, y, period, salt) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = wrap(ix, period), x1 = (x0 + 1) % period;
    const y0 = wrap(iy, period), y1 = (y0 + 1) % period;
    const a = grain(x0, y0, salt), b = grain(x1, y0, salt);
    const c = grain(x0, y1, salt), d = grain(x1, y1, salt);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function soilPixels() {
    const pixels = new Uint8Array(SOIL_SIZE * SOIL_SIZE * 4);
    for (let y = 0; y < SOIL_SIZE; y++) for (let x = 0; x < SOIL_SIZE; x++) {
        const u = x / SOIL_SIZE, v = y / SOIL_SIZE;
        const warpX = u + (noise(u * 5, v * 5, 5, 1) - .5) * .074;
        const warpY = v + (noise(u * 5, v * 5, 5, 2) - .5) * .085;
        const clay = noise(warpX * 8, warpY * 8, 8, 3);
        const clods = noise(warpX * 28, warpY * 28, 28, 4);
        const fines = noise(u * 135, v * 135, 135, 5);
        const pores = grain(x, y, 6);
        const xr = (u + .003) * 54, yr = (v - .004) * 54;
        const sx = Math.floor(xr), sy = Math.floor(yr);
        const px = wrap(sx, 54), py = wrap(sy, 54);
        const dx = xr - sx - .5 - (grain(px, py, 7) - .5) * .27;
        const dy = yr - sy - .5 - (grain(px, py, 8) - .5) * .25;
        const radius = .12 + grain(px, py, 9) * .23;
        const distance = Math.hypot(dx, dy * 1.28) / radius;
        const stone = grain(px, py, 10) > .57 ? Math.max(0, 1 - distance) : 0;
        const tint = (clay - .5) * 26 + (clods - .5) * 29 + (fines - .5) * 27 + (pores - .5) * 14;
        const grit = (pores < .028 ? -17 : pores > .982 ? 20 : 0) + stone * (38 - 21 * dy / radius);
        const i = (y * SOIL_SIZE + x) * 4;
        pixels[i] = 112 + tint + grit + (clay - .5) * 10;
        pixels[i + 1] = 81 + tint * .87 + grit;
        pixels[i + 2] = 58 + tint * .71 + grit * 1.04 + (.5 - clay) * 10;
        pixels[i + 3] = 255;
    }
    return pixels;
}
