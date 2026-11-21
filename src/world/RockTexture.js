import { grain, noise } from './SoilTexture.js';

export const ROCK_SIZE = 256;
export const ROCK_METRES = 9;

const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** A wraparound stone swatch. Alpha carries the fine grain of the soil–rock contact. */
export function rockPixels() {
    const pixels = new Uint8Array(ROCK_SIZE * ROCK_SIZE * 4);
    for (let y = 0; y < ROCK_SIZE; y++) for (let x = 0; x < ROCK_SIZE; x++) {
        const u = x / ROCK_SIZE, v = y / ROCK_SIZE;
        const weather = noise(u * 5, v * 5, 5, 171);
        const warp = noise(u * 9, v * 9, 9, 172);
        const flecks = noise(u * 62, v * 62, 62, 173);
        const grit = grain(x, y, 174);
        const wx = u + (weather - .5) * .16;
        const wy = v + (warp - .5) * .12;
        const slabs = noise(wx * 12, wy * 12, 12, 175);
        const split = noise((wx + wy) * 6, wy * 6, 6, 176);
        const fractureWidth = .012 + .017 * weather;
        const fracture = 1 - smooth(.003, fractureWidth, Math.abs(split - .49));
        const vein = (1 - smooth(.006, .035, Math.abs(split - .535))) * smooth(.27, .57, slabs);
        const bands = Math.sin(2 * Math.PI * (v * 8 + u + (weather - .5) * 1.25 + (slabs - .5) * .22));
        const strata = bands * (4 + 8 * smooth(.4, .68, warp));
        const grains = (flecks - .5) * 23 + (grit - .5) * 13;
        const minerals = vein * (8 + 14 * weather) - fracture * (12 + 25 * slabs)
            + (grit > .975 && flecks > .54 ? 24 : 0) - (grit < .04 && flecks < .5 ? 18 : 0);
        const tone = (weather - .5) * 35 + (slabs - .5) * 40 + strata + grains + minerals;
        const warmth = (warp - .5) * 10 + vein * 5;
        const i = (y * ROCK_SIZE + x) * 4;
        pixels[i] = 132 + tone + warmth;
        pixels[i + 1] = 131 + tone * .97;
        pixels[i + 2] = 128 + tone * .93 - warmth;
        pixels[i + 3] = 35 + slabs * 100 + warp * 85 + flecks * 35;
    }
    return pixels;
}
