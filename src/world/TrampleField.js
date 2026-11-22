/**
 * TrampleField.js — the grass remembers who went through it (the author 21.11: «когда игрок идёт, это влияет на них — они колышутся…
 * следы ног, взаимодействие игроков с землёй»). A small square map round the player (128 × 128 cells of 0.375 m — 48 m across):
 * each cell holds which way its grass is pressed and how hard. Every walker (the hero, the other players, the villagers, the
 * animals) presses the grass under and round its feet — aside from its body and along its way; behind it the grass stays bent and
 * flattened and slowly stands up again (`RISE` s). The grass's vertex shader (Flora.js) reads the map: no extra draw.
 * The map is a living texture by nature (16 KB, sent to the card only on the frames something is pressed or still rising).
 */
import * as THREE from 'three';

export const TRAMPLE = {
    N: 128, // cells a side
    CELL: 0.375, // m
    RISE: 7, // s: the grass stands up again (to ~1/e)
    RECENTRE: 8, // m: the map moves with the player in whole cells when he is this far from its middle
};

export class TrampleField {
    constructor() {
        const N = TRAMPLE.N;
        this.data = new Uint8Array(N * N * 4);
        for (let i = 0; i < N * N; i++) { this.data[i * 4] = 128; this.data[i * 4 + 1] = 128; }
        this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
        this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
        this.tex.needsUpdate = true;
        this.ox = 0; this.oz = 0; // the map's corner in the world (m), on the cell grid
        this.uniforms = { tex: { value: this.tex }, origin: { value: new THREE.Vector3(0, 0, N * TRAMPLE.CELL) } };
        this.active = 0; // (cells still bent: 0 — nothing to send)
        this._acc = 0;
    }

    /** The map's middle follows the player in whole cells (the cells keep their place in the world). */
    follow(x, z) {
        const N = TRAMPLE.N, C = TRAMPLE.CELL, half = N * C / 2;
        if (Math.abs(x - (this.ox + half)) < TRAMPLE.RECENTRE && Math.abs(z - (this.oz + half)) < TRAMPLE.RECENTRE) return;
        const nx = Math.round((x - half) / C) * C, nz = Math.round((z - half) / C) * C;
        const sx = Math.round((nx - this.ox) / C), sz = Math.round((nz - this.oz) / C);
        const d = this.data, old = d.slice();
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const si = i + sx, sj = j + sz, o = (j * N + i) * 4;
            if (si >= 0 && sj >= 0 && si < N && sj < N) { const p = (sj * N + si) * 4; d[o] = old[p]; d[o + 1] = old[p + 1]; d[o + 2] = old[p + 2]; d[o + 3] = old[p + 3]; }
            else { d[o] = 128; d[o + 1] = 128; d[o + 2] = 0; d[o + 3] = 0; }
        }
        this.ox = nx; this.oz = nz;
        this.uniforms.origin.value.set(nx, nz, N * C);
        this.tex.needsUpdate = true;
    }

    /** A walker presses the grass: feet at (x, z), body radius r (m), moving (vx, vz) m/s. Returns true if any cell changed. */
    press(x, z, r, vx = 0, vz = 0) {
        const N = TRAMPLE.N, C = TRAMPLE.CELL, d = this.data;
        const R = r * 1.35, ci = (x - this.ox) / C, cj = (z - this.oz) / C, rc = R / C;
        if (ci < -rc || cj < -rc || ci > N + rc || cj > N + rc) return false;
        const sp = Math.hypot(vx, vz), mx = sp > 0.2 ? vx / sp : 0, mz = sp > 0.2 ? vz / sp : 0;
        let changed = false;
        for (let j = Math.max(0, Math.floor(cj - rc)); j <= Math.min(N - 1, Math.ceil(cj + rc)); j++) {
            for (let i = Math.max(0, Math.floor(ci - rc)); i <= Math.min(N - 1, Math.ceil(ci + rc)); i++) {
                const dx = (i + 0.5) * C + this.ox - x, dz = (j + 0.5) * C + this.oz - z, dd = Math.hypot(dx, dz);
                if (dd > R) continue;
                const f = 1 - dd / R, k = Math.min(255, Math.round(255 * Math.min(1, f * 1.6)));
                const o = (j * N + i) * 4;
                if (k <= d[o + 3]) continue;
                // aside from the body, and along the way the walker goes (a trail lies flat in its direction)
                let bx = dd > 1e-3 ? dx / dd : mx, bz = dd > 1e-3 ? dz / dd : mz;
                bx = bx * 0.65 + mx * 0.6; bz = bz * 0.65 + mz * 0.6;
                const bl = Math.hypot(bx, bz) || 1;
                d[o] = Math.round(128 + 127 * bx / bl); d[o + 1] = Math.round(128 + 127 * bz / bl);
                d[o + 3] = k;
                changed = true;
            }
        }
        if (changed) { this.active = 1; this.tex.needsUpdate = true; }
        return changed;
    }

    /** Each frame: the bent grass slowly stands up (the work only while something is bent; the cells in steps of a few frames). */
    rise(dt) {
        if (!this.active) return;
        this._acc += dt;
        if (this._acc < 0.1) return;
        const k = Math.exp(-this._acc / TRAMPLE.RISE), d = this.data, n = d.length;
        this._acc = 0;
        let any = 0;
        for (let o = 3; o < n; o += 4) {
            const a = d[o];
            if (!a) continue;
            const b = Math.floor(a * k);
            d[o] = b < 3 ? 0 : b;
            any |= d[o];
        }
        this.active = any ? 1 : 0;
        this.tex.needsUpdate = true;
    }

    dispose() { this.tex.dispose(); }
}

/** The shader's part: the press at a world point (xy — the way it is bent, z — how hard 0…1). */
export const TRAMPLE_GLSL = /* glsl */ `
uniform sampler2D uTrample;
uniform vec3 uTrampleO;
vec3 trampleAt(vec2 xz) {
    vec2 uv = (xz - uTrampleO.xy) / uTrampleO.z;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
    vec4 t = texture2D(uTrample, uv);
    return vec3(t.rg * 2.0 - 1.0, t.a);
}
`;
