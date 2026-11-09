/** Fixed-size angular meter: a still wand's jitter, separately from the wrist's position. */
const DEG = 180 / Math.PI;
const angle = (dot) => Math.acos(Math.min(1, Math.max(-1, dot))) * DEG;
export class AimShake {
    constructor() { this.reset(); }
    reset() { this.on = false; this.mx = this.my = this.mz = this.px = this.py = this.pz = 0; this.n = 0; this.s2 = 0; this.jump = 0; }
    step(x, y, z, dt) {
        const len = Math.hypot(x, y, z);
        if (!(len > 0) || !(dt > 0) || dt > 0.5) { this.reset(); return; }
        x /= len; y /= len; z /= len;
        if (!this.on) { this.on = true; this.mx = this.px = x; this.my = this.py = y; this.mz = this.pz = z; return; }
        const step = angle(x * this.px + y * this.py + z * this.pz);
        this.px = x; this.py = y; this.pz = z;
        const k = 1 - Math.exp(-dt / 0.3), ox = this.mx, oy = this.my, oz = this.mz;
        this.mx += (x - this.mx) * k; this.my += (y - this.my) * k; this.mz += (z - this.mz) * k;
        const ml = Math.hypot(this.mx, this.my, this.mz);
        if (!(ml > 0)) { this.reset(); return; }
        this.mx /= ml; this.my /= ml; this.mz /= ml;
        if (angle(this.mx * ox + this.my * oy + this.mz * oz) / dt > 20) return; // deliberate turning, not still aim
        const a = angle(x * this.mx + y * this.my + z * this.mz);
        this.n++; this.s2 += a * a; this.jump = Math.max(this.jump, step);
    }
    take() {
        const r = { n: this.n, degrees: this.n ? Math.sqrt(this.s2 / this.n) : 0, jump: this.jump };
        this.n = 0; this.s2 = 0; this.jump = 0;
        return r;
    }
}
