/**
 * HurtFx.js — what the hero's body tells the eyes and the ears when it is hit or nearly dead (the author 21.11: «больше интересных эффектов,
 * когда игрока бьют, или осталось мало хп: сердцебиение на заднем плане, экран красный и так далее»):
 *
 *   LOW HEALTH (below LOW_AT of the hearts, stronger as it falls — `lowK`):
 *     · a heartbeat in the background — «тук-тук» (a low thump and a softer second one) that quickens from ~70 to ~150 beats a minute;
 *     · the red edges of the screen throb with every beat, the corners go dark (a tunnel), the colour drains away (a grey layer in the
 *       «saturation» blend), and at the very last hearts the whole picture breathes;
 *   A BLOW (`hit`): a red arc on the edge of the screen towards the one who struck (turned by where the head looks), a flare that fades, drops
 *       of blood on the screen that run down (the colour by what hurt: ember, frost, green for Avada), the camera's jolt by the blow's weight,
 *       a short deafened «thump» of its own — and the heart answers with a beat at once.
 *
 * One small canvas (a quarter of the screen's size, drawn only while something is on it), one grey layer, one synthesised thump — no new lights,
 * no textures, no allocation in the frame. Off: settings → «Игра» → «Эффекты ранений». Pure rules at the top (tested).
 */

export const HURT = {
    LOW_AT: 0.5, // below this share of health the body begins to show it
    BPM: [68, 150], // heartbeats a minute: from the first sign to the last heart
    FLARE_T: 0.7, // s a blow's red flare lasts
    ARC_T: 1.5, // s a direction arc lasts
    SPLAT_T: 4.5, // s a drop of blood stays
    MAX_SPLATS: 14,
    MAX_ARCS: 4,
    SCALE: 4, // the canvas is this many times smaller than the screen
};

/** How near to death: 0 (healthy enough) … 1 (the last heart). */
export const lowK = (hp, maxHp) => {
    if (!(maxHp > 0) || !(hp > 0)) return 0;
    const f = Math.max(0, Math.min(1, hp / maxHp));
    return Math.max(0, Math.min(1, (HURT.LOW_AT - f) / HURT.LOW_AT));
};

/** Seconds between heartbeats at nearness `k` to death. */
export const beatEvery = (k) => 60 / (HURT.BPM[0] + (HURT.BPM[1] - HURT.BPM[0]) * Math.max(0, Math.min(1, k)));

/** How hard a blow of `amount` health was to a body of `maxHp`: 0.15 (a scratch) … 1 (a crushing one). */
export const blowWeight = (amount, maxHp) => Math.max(0.15, Math.min(1, amount / Math.max(8, (maxHp || 20) * 0.4)));

/** The colour (r,g,b text) of what hurt: ember, frost, lightning, the green of Avada, else blood. */
export function blowColour(kind) {
    const k = String(kind || '');
    if (/avada/i.test(k)) return { c: '40,220,100', blood: false };
    if (/ice|frozen|frost|айс/i.test(k)) return { c: '150,210,255', blood: false };
    if (/thunder|lightning|jolt|sapira|storm|кидариус|kidar/i.test(k)) return { c: '210,225,255', blood: false };
    if (/fire|inferno|burn|hell|lava|serpent|bombardo|boom|blast|cannon/i.test(k)) return { c: '255,130,30', blood: false };
    return { c: '190,10,20', blood: true };
}

/** The angle on the screen (rad: 0 = ahead/up, + clockwise to the right) towards a point (dx, dz) from me, the head looking along (fx, fz). */
export function blowAngle(dx, dz, fx, fz) {
    const fl = Math.hypot(fx, fz) || 1;
    const f = [fx / fl, fz / fl]; // (the right hand of a look (fx, fz) on the ground is (−fz, fx))
    const ahead = dx * f[0] + dz * f[1], right = dx * (-f[1]) + dz * f[0];
    return Math.atan2(right, ahead);
}

let _beatCtxFail = false;

export class HurtFx {
    constructor(game) {
        this.game = game;
        this.k = 0; // nearness to death now (eased)
        this.flare = 0;
        this.flareCol = '190,10,20';
        this.pulse = 0; // the beat's throb 0…1
        this._beatT = 0.5;
        this._dub = -1;
        this.arcs = [];
        this.splats = [];
        this.canvas = null; this.ctx = null; this.gray = null;
        this._shown = false;
        this._w = 0; this._h = 0;
    }

    get on() { return typeof document === 'undefined' ? true : document.getElementById('hurt-fx-toggle')?.checked !== false; }

    _build() {
        if (this.canvas || typeof document === 'undefined') return;
        const c = this.canvas = document.createElement('canvas');
        c.id = 'hurt-fx';
        c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1400;display:none;';
        document.body.appendChild(c);
        this.ctx = c.getContext('2d');
        const g = this.gray = document.createElement('div');
        g.id = 'hurt-gray';
        g.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1399;display:none;background:#8a8a8a;mix-blend-mode:saturation;';
        document.body.appendChild(g);
    }

    _size() {
        const w = Math.max(64, Math.ceil(innerWidth / HURT.SCALE)), h = Math.max(48, Math.ceil(innerHeight / HURT.SCALE));
        if (w !== this._w || h !== this._h) { this._w = this.canvas.width = w; this._h = this.canvas.height = h; }
    }

    // ------------------------------------------------------------------ the blow
    /** (Combat.damage) The hero was hurt for `amount`; `byId` struck, of `kind`. */
    hit(amount, byId, kind) {
        const g = this.game;
        if (!this.on || !(amount > 0) || g.combat?.dead) return;
        this._build();
        const w = blowWeight(amount, g.combat?.maxHp);
        const col = blowColour(kind);
        this.flare = Math.max(this.flare, 0.3 + 0.55 * w);
        this.flareCol = col.c;
        // towards whoever struck, as the head looks
        const from = this._posOf(byId);
        if (from && g.camera) {
            const me = g.character?.group?.position;
            if (me) {
                const q = g.camera.quaternion; // (the look's direction on the ground: (0,0,−1) turned by the camera)
                const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
                const a = blowAngle(from.x - me.x, from.z - me.z, fx, fz);
                if (Math.hypot(from.x - me.x, from.z - me.z) > 0.8) this.arcs.push({ a, t: 0, w, c: col.c });
            }
        } else this.arcs.push({ a: null, t: 0, w, c: col.c }); // (no one to point at: the whole edge)
        if (this.arcs.length > HURT.MAX_ARCS) this.arcs.shift();
        // drops on the glass: more with a heavier blow (frost and ember leave a few specks)
        const n = Math.min(HURT.MAX_SPLATS, 1 + Math.round(w * (col.blood ? 6 : 2.5)));
        for (let i = 0; i < n && this.splats.length < HURT.MAX_SPLATS; i++) {
            const side = Math.random();
            const x = side < 0.35 ? Math.random() * 0.22 : side < 0.7 ? 0.78 + Math.random() * 0.22 : Math.random();
            const y = side < 0.7 ? Math.random() : Math.random() < 0.5 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2;
            this.splats.push({ x, y, r: 0.006 + Math.random() * 0.018 * (0.5 + w), t: 0, c: col.c, drip: 0.01 + Math.random() * 0.05, seed: Math.random() });
        }
        // the body's jolt and the ears' thump
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.12 + 0.5 * w);
        this._thump(0.5 + 0.5 * w, 46, 0.16);
        this._beatT = Math.min(this._beatT, 0.35); // (the heart answers at once)
    }

    _posOf(id) {
        const g = this.game;
        if (id == null || id === g.localId) return null;
        const r = g.remotes?.get?.(id)?.position;
        if (r) return r;
        const v = g.castleLife?.byId?.get?.(id);
        if (v && Number.isFinite(v.x)) return v;
        const z = g.zombies?.find?.((q) => q.id === id);
        return z?.group?.position || null;
    }

    // ------------------------------------------------------------------ the heart
    _thump(vol, f0 = 52, len = 0.2) {
        try {
            const s = this.game.sound, ctx = s?.context;
            if (!s || !ctx || !s.enabled || ctx.state === 'closed' || _beatCtxFail) return;
            const t = ctx.currentTime, o = ctx.createOscillator(), gn = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(f0 * 1.5, t);
            o.frequency.exponentialRampToValueAtTime(Math.max(24, f0 * 0.62), t + len);
            gn.gain.setValueAtTime(0.0001, t);
            gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
            gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
            o.connect(gn).connect(s.effectsGain || ctx.destination);
            o.start(t); o.stop(t + len + 0.05);
        } catch (e) { _beatCtxFail = true; }
    }

    // ------------------------------------------------------------------ the frame
    update(dt) {
        const g = this.game, c = g.combat;
        const alive = !!c?.enabled && !c.dead && !g.isDeadLocal && this.on;
        const want = alive ? lowK(c.hp, c.maxHp) : 0;
        this.k += (want - this.k) * Math.min(1, dt * (want > this.k ? 3 : 1.2));
        if (this.k < 0.01 && want === 0) this.k = 0;
        for (const a of this.arcs) a.t += dt;
        this.arcs = this.arcs.filter((a) => a.t < HURT.ARC_T);
        for (const s of this.splats) { s.t += dt; s.y += s.drip * dt * Math.min(1, s.t / 1.2); }
        this.splats = this.splats.filter((s) => s.t < HURT.SPLAT_T);
        this.flare = Math.max(0, this.flare - dt / HURT.FLARE_T);
        const active = this.k > 0 || this.flare > 0 || this.arcs.length || this.splats.length;
        if (!active) { if (this._shown) this._hide(); return; }
        if (!alive && !this.flare && !this.arcs.length && !this.splats.length) return;
        this._build();
        if (!this.canvas) return; // (no screen: a test)
        if (!this._shown) { this.canvas.style.display = 'block'; this._shown = true; }
        // the heart
        if (this.k > 0.02) {
            this._beatT -= dt;
            if (this._beatT <= 0) {
                this._beatT = beatEvery(this.k);
                this.pulse = 1; this._dub = 0.2 + 0.08 * (1 - this.k);
                this._thump(0.22 + 0.5 * this.k, 54, 0.2);
            }
            if (this._dub >= 0) { this._dub -= dt; if (this._dub < 0) { this.pulse = Math.max(this.pulse, 0.65); this._thump(0.14 + 0.3 * this.k, 62, 0.16); } }
        }
        this.pulse *= Math.exp(-dt * 7);
        this._draw();
        if (this.gray) {
            const gk = this.k > 0.05 ? Math.min(0.85, this.k * 0.9) : 0;
            this.gray.style.display = gk > 0 ? 'block' : 'none';
            if (gk > 0) this.gray.style.opacity = String(gk.toFixed(2));
        }
    }

    _hide() {
        this._shown = false;
        if (this.canvas) this.canvas.style.display = 'none';
        if (this.gray) this.gray.style.display = 'none';
        this.pulse = 0;
    }

    _draw() {
        this._size();
        const x = this.ctx, W = this._w, H = this._h, k = this.k, cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
        x.clearRect(0, 0, W, H);
        // the throbbing red edges and the dark tunnel of a failing body
        if (k > 0) {
            const a = (0.18 + 0.5 * k) * (0.6 + 0.4 * this.pulse + 0.15 * Math.sin(performance.now() * 0.0015));
            const g = x.createRadialGradient(cx, cy, R * (0.78 - 0.4 * k - 0.1 * this.pulse), cx, cy, R * 1.02);
            g.addColorStop(0, 'rgba(120,0,8,0)');
            g.addColorStop(0.6, `rgba(150,4,14,${(a * 0.55).toFixed(3)})`);
            g.addColorStop(1, `rgba(40,0,4,${Math.min(0.95, a * 1.5).toFixed(3)})`);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
        // a blow's flare
        if (this.flare > 0) {
            const f = this.flare, g = x.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.0);
            g.addColorStop(0, `rgba(${this.flareCol},0)`);
            g.addColorStop(1, `rgba(${this.flareCol},${Math.min(0.85, f).toFixed(3)})`);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
        // arcs towards the blows
        for (const ar of this.arcs) {
            const life = 1 - ar.t / HURT.ARC_T, al = Math.min(1, life * 1.6) * (0.35 + 0.5 * ar.w);
            if (ar.a == null) { x.strokeStyle = `rgba(${ar.c},${(al * 0.6).toFixed(3)})`; x.lineWidth = 3 + 6 * ar.w; x.strokeRect(1, 1, W - 2, H - 2); continue; }
            const ex = cx + Math.sin(ar.a) * cx * 0.92, ey = cy - Math.cos(ar.a) * cy * 0.92;
            const g = x.createRadialGradient(ex, ey, 1, ex, ey, 22 + 26 * ar.w);
            g.addColorStop(0, `rgba(${ar.c},${al.toFixed(3)})`);
            g.addColorStop(1, `rgba(${ar.c},0)`);
            x.fillStyle = g; x.beginPath(); x.arc(ex, ey, 22 + 26 * ar.w, 0, 6.2832); x.fill();
        }
        // drops that run down the glass: an uneven blot with satellites, a thin tapering trail that ends in a bead, a darker heart and a glint
        for (const s of this.splats) {
            const al = Math.min(1, (1 - s.t / HURT.SPLAT_T) * 1.5), px = s.x * W, py = s.y * H, r = s.r * W;
            const sd = s.seed * 1000;
            const rnd = (i) => { const v = Math.sin(sd + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
            x.fillStyle = `rgba(${s.c},${(al * 0.78).toFixed(3)})`;
            // the trail (tapering down), its bead at the end
            const len = Math.min(H * 0.35, r * 2.2 + s.t * 7 * (0.5 + rnd(1))), tw = Math.max(0.5, r * 0.32);
            x.beginPath(); x.moveTo(px - tw, py); x.lineTo(px + tw, py); x.lineTo(px + tw * 0.25, py + len); x.lineTo(px - tw * 0.25, py + len); x.closePath(); x.fill();
            x.beginPath(); x.ellipse(px, py + len, tw * 0.9, tw * 1.3, 0, 0, 6.2832); x.fill();
            // the blot: an uneven body of overlapping ellipses and flung-off drops
            for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(px + (rnd(i + 2) - 0.5) * r * 0.9, py + (rnd(i + 7) - 0.5) * r * 0.8, r * (0.45 + rnd(i + 11) * 0.5), r * (0.35 + rnd(i + 17) * 0.45), rnd(i + 23) * 3, 0, 6.2832); x.fill(); }
            for (let i = 0; i < 7; i++) { const an = rnd(i + 31) * 6.2832, d = r * (1.0 + rnd(i + 41) * 1.5); x.beginPath(); x.arc(px + Math.cos(an) * d, py + Math.sin(an) * d * 0.85, Math.max(0.5, r * (0.1 + rnd(i + 51) * 0.22)), 0, 6.2832); x.fill(); }
            x.fillStyle = `rgba(60,0,4,${(al * 0.45).toFixed(3)})`;
            x.beginPath(); x.ellipse(px, py, r * 0.38, r * 0.3, 0.4, 0, 6.2832); x.fill();
            x.fillStyle = `rgba(255,220,220,${(al * 0.35).toFixed(3)})`;
            x.beginPath(); x.ellipse(px - r * 0.25, py - r * 0.25, r * 0.12, r * 0.08, -0.6, 0, 6.2832); x.fill();
        }
    }

    /** Respawn / a new game: nothing left over. */
    reset() { this.k = 0; this.flare = 0; this.arcs.length = 0; this.splats.length = 0; this._hide(); }

    dispose() { this.canvas?.remove(); this.gray?.remove(); this.canvas = this.gray = null; }
}

