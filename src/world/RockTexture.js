import { grain, noise } from './SoilTexture.js';

export const ROCK_SIZE = 256;
export const ROCK_METRES = 9;

const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Seamless fine-grained limestone. The alpha channel shapes the edge where soil meets rock. */
export function rockPixels() {
    const pixels = new Uint8Array(ROCK_SIZE * ROCK_SIZE * 4);
    for (let y = 0; y < ROCK_SIZE; y++) for (let x = 0; x < ROCK_SIZE; x++) {
        const u = x / ROCK_SIZE, v = y / ROCK_SIZE;
        const lift = noise(u * 4, v * 4, 4, 181);
        const patches = noise(u * 9, v * 9, 9, 182);
        const sand = noise(u * 74, v * 74, 74, 183);
        const grit = grain(x, y, 184);

        // Low-contrast bedding planes, broken into shorter runs by a slow change in layer height.
        const bed = v * 9 + u + (lift - .5) * .55;
        const edge = bed - Math.floor(bed);
        const line = (1 - smooth(.012, .08, edge)) * smooth(.30, .67, patches);
        const step = smooth(.06, .18, edge) * (1 - smooth(.67, .99, edge));
        const cleft = Math.abs(noise(u * 12 + v * 6, v * 6, 6, 185) - .51);
        const fracture = (1 - smooth(.003, .035, cleft)) * smooth(.52, .73, lift);
        const tone = (lift - .5) * 15 + (patches - .5) * 13 + step * 7 - line * 14 - fracture * 18
            + (sand - .5) * 8 + (grit - .5) * 4;

        const seam = noise(u * 19, v * 19, 19, 186);
        const seamGrain = noise(u * 53, v * 53, 53, 187);
        const i = (y * ROCK_SIZE + x) * 4;
        pixels[i] = 141 + tone;
        pixels[i + 1] = 147 + tone;
        pixels[i + 2] = 151 + tone;
        pixels[i + 3] = 128 + (seam - .5) * 152 + (seamGrain - .5) * 78;
    }
    return pixels;
}
