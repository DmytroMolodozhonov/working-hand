import { grain, noise } from './SoilTexture.js';

export const ROCK_SIZE = 256;
export const ROCK_METRES = 9;

const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Fractured, granular bedrock. Alpha shapes the narrow contact with the soil. */
export function rockPixels() {
    const pixels = new Uint8Array(ROCK_SIZE * ROCK_SIZE * 4);
    for (let y = 0; y < ROCK_SIZE; y++) for (let x = 0; x < ROCK_SIZE; x++) {
        const u = x / ROCK_SIZE, v = y / ROCK_SIZE;
        const bed = noise(u * 5, v * 5, 5, 171);
        const warp = noise(u * 9, v * 9, 9, 172);
        const wx = u + (bed - .5) * .16;
        const wy = v + (warp - .5) * .12;
        const facets = noise(wx * 18, wy * 18, 18, 175);
        const aggregate = noise(wx * 38, wy * 38, 38, 179);
        const grains = noise(u * 76, v * 76, 76, 173);
        const grit = grain(x, y, 174);

        const cleft = noise((wx + wy) * 6, wy * 6, 6, 176);
        const fractured = smooth(.30, .58, facets);
        const fissure = (1 - smooth(.003, .023, Math.abs(cleft - .49))) * fractured;
        const lip = (1 - smooth(.004, .025, Math.abs(cleft - .518))) * fractured;
        const ridge = Math.sin(2 * Math.PI * (v * 8 + u + (bed - .5) * 1.35 + (facets - .5) * .34));
        const strata = ridge * (2 + 7 * smooth(.46, .74, warp));
        const crags = (bed - .5) * 16 + (facets - .5) * 22 + (aggregate - .5) * 22 + strata;
        const mineral = (grains - .5) * 25 + (grit - .5) * 11
            + (grit > .96 && grains > .60 ? 16 : 0) - (grit < .07 && grains < .48 ? 13 : 0);
        const tone = crags + mineral + lip * 15 - fissure * 29;
        const cool = (warp - .5) * 5;

        const seam = noise(u * 19, v * 19, 19, 186);
        const seamGrain = noise(u * 53, v * 53, 53, 187);
        const i = (y * ROCK_SIZE + x) * 4;
        pixels[i] = 130 + tone - cool;
        pixels[i + 1] = 131 + tone;
        pixels[i + 2] = 132 + tone * .97 + cool;
        pixels[i + 3] = 128 + (seam - .5) * 152 + (seamGrain - .5) * 78;
    }
    return pixels;
}
