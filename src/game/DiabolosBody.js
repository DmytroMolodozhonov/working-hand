/**
 * DiabolosBody.js — настоящее тело Дьяволоса для коллизий (жалоба автора: «я лечу — и пролетаю СКВОЗЬ Дьяволоса»).
 *
 * Тело — набор капсул `DEVIL_BODY` по костям его позы (брюхо, грудь, плечи, шея, голова и морда, рога спиралью, руки, кулаки, ноги, копыта, хвост),
 * в единицах формы стоя (DiabolosModel.JOINTS, рост 3,5 → ×DEVIL.SCALE). Каждый кадр (`update`) концы капсул переводятся в мир по матрицам костей
 * (сидит, бьёт, тянется рукой — тело там, где нарисовано; дальний «прокси» `_farProxy` ставится ПОСЛЕ этого и коллизию не трогает).
 *
 * Тело — «двигающийся кусок мира» (Collision.addMover, как корабли): `resolveCylinder` (ходьба игрока, зомби, существ) упирается в него,
 * `pointBlocked` (полёт игрока, вещи, снаряды, лучи) — тоже, `groundAt` даёт встать на его копыто/плечо/голову. Летящего игрока, дракона,
 * горгулий, вещи и цепь (её звенья) отдельно выталкивает `pushOut` (3D: вдоль нормали, скорость в тело гасится — скольжение по коже).
 */
import * as THREE from 'three';
import { JOINTS } from '../entities/DiabolosModel.js';

/** Капсулы: [кость A, точка A (форма, стоя)], [кость B, точка B], радиус (форма). Точки на суставах — сами суставы. */
const J = (b) => [b, JOINTS[b]];
const P = (b, x, y, z) => [b, [x, y, z]];
function hornCaps(s) {
    const out = [], pts = [];
    for (let i = 0; i <= 16; i += 2) { // (та же спираль, что у модели: DiabolosModel «рога барана»)
        const u = i / 16, a = u * Math.PI * 1.55, R = 0.42 * (1 - 0.35 * u);
        pts.push([s * (0.2 + 0.12 * u + 0.5 * u + 0.08 * Math.sin(a)), 3.36 + R * Math.sin(a) * 0.95 + 0.12 * u, 0.02 + R * (1 - Math.cos(a)) * 0.9 - 0.75 * u * u, 0.13 * (1 - 0.6 * u)]);
    }
    for (let i = 0; i + 1 < pts.length; i++) out.push({ a: P('head', ...pts[i].slice(0, 3)), b: P('head', ...pts[i + 1].slice(0, 3)), r: Math.max(pts[i][3], 0.05), part: 'horn' });
    return out;
}
export const DEVIL_BODY = (() => {
    const B = [
        { a: P('hips', -0.22, 1.5, 0.06), b: P('hips', 0.22, 1.5, 0.06), r: 0.4, part: 'pelvis' },
        { a: P('hips', -0.18, 1.8, -0.02), b: P('hips', 0.18, 1.8, -0.02), r: 0.42, part: 'belly' },
        { a: P('spine', -0.24, 2.14, 0.02), b: P('spine', 0.24, 2.14, 0.02), r: 0.46, part: 'belly' },
        { a: P('chest', -0.44, 2.52, 0.04), b: P('chest', 0.44, 2.52, 0.04), r: 0.48, part: 'chest' },
        { a: P('chest', -0.36, 2.84, 0.1), b: P('chest', 0.36, 2.84, 0.1), r: 0.3, part: 'chest' },
        { a: P('neck', 0, 2.78, 0.05), b: P('neck', 0, 3.1, -0.07), r: 0.34, part: 'neck' },
        { a: P('head', 0, 3.2, 0.1), b: P('head', 0, 3.18, -0.22), r: 0.28, part: 'head' },
        { a: P('head', 0, 3.14, -0.25), b: P('head', 0, 3.02, -0.44), r: 0.17, part: 'head' }, // морда
        { a: P('tail', 0, 1.42, 0.5), b: J('tail2'), r: 0.08, part: 'tail' },
        { a: J('tail2'), b: J('tail3'), r: 0.07, part: 'tail' },
        ...hornCaps(-1), ...hornCaps(1),
    ];
    for (const s of ['L', 'R']) {
        const k = s === 'L' ? -1 : 1;
        B.push(
            { a: P('chest', k * 0.78, 2.7, 0.08), b: J('sh' + s), r: 0.34, part: 'shoulder' },
            { a: J('sh' + s), b: J('el' + s), r: 0.28, part: 'arm' },
            { a: J('el' + s), b: J('wr' + s), r: 0.2, part: 'arm' },
            { a: J('wr' + s), b: P('ha' + s, JOINTS['ha' + s][0], JOINTS['ha' + s][1] - 0.22, JOINTS['ha' + s][2] - 0.06), r: 0.17, part: 'fist' },
            { a: J('th' + s), b: J('kn' + s), r: 0.32, part: 'leg' },
            { a: J('kn' + s), b: J('ho' + s), r: 0.19, part: 'leg' },
            { a: J('ho' + s), b: J('fe' + s), r: 0.14, part: 'leg' },
            { a: P('fe' + s, JOINTS['fe' + s][0], 0.12, -0.08), b: P('fe' + s, JOINTS['fe' + s][0], 0.12, 0.08), r: 0.13, part: 'hoof' },
        );
    }
    return B;
})();

export const BODY = {
    REACH: 150,      // м — дальше от его места (по земле) ничего не проверяем (рост 122, рога и руки в стороны)
    SKIN: 0.05,      // м — зазор после выталкивания (не дрожит на коже)
    SLIDE: 0.15,     // доля скорости вдоль кожи, теряемая при касании (трение: скользит, не прилипает)
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/** Ближайшие точки отрезков p1–q1 и p2–q2 → квадрат расстояния; s, t — доли (в `o`). */
export function segSeg(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z, o) {
    const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z, d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
    const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s = 0, t = 0;
    if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; }
    else if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
            s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
        }
    }
    o.s = s; o.t = t;
    o.x1 = p1x + d1x * s; o.y1 = p1y + d1y * s; o.z1 = p1z + d1z * s;
    o.x2 = p2x + d2x * t; o.y2 = p2y + d2y * t; o.z2 = p2z + d2z * t;
    const dx = o.x1 - o.x2, dy = o.y1 - o.y2, dz = o.z1 - o.z2;
    return dx * dx + dy * dy + dz * dz;
}

/** Тело в мире: капсулы (Float64Array: ax ay az bx by bz r на каждую), рамка, проверки. Один на Дьяволоса. */
export class DevilBody {
    constructor(scale) {
        this.scale = scale;
        this.n = DEVIL_BODY.length;
        this.c = new Float64Array(this.n * 7);
        this.on = false;
        this.box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
        this._o = {};
        this.hits = 0; // (журнал: сколько раз кого-то выталкивало)
    }

    /** Капсулы из позы модели (кости — дети `model`; модель стоит на своём настоящем месте и в настоящем масштабе). */
    update(model) {
        const bones = model?.userData?.bones;
        if (!bones) { this.on = false; return; }
        model.updateMatrixWorld(true);
        const c = this.c, S = this.scale, bx = this.box;
        bx.x0 = bx.y0 = bx.z0 = Infinity; bx.x1 = bx.y1 = bx.z1 = -Infinity;
        for (let i = 0; i < this.n; i++) {
            const e = DEVIL_BODY[i], o = i * 7;
            this._pt(bones, e.a, _a); this._pt(bones, e.b, _b);
            c[o] = _a.x; c[o + 1] = _a.y; c[o + 2] = _a.z; c[o + 3] = _b.x; c[o + 4] = _b.y; c[o + 5] = _b.z; c[o + 6] = e.r * S;
            const r = e.r * S;
            bx.x0 = Math.min(bx.x0, _a.x - r, _b.x - r); bx.x1 = Math.max(bx.x1, _a.x + r, _b.x + r);
            bx.y0 = Math.min(bx.y0, _a.y - r, _b.y - r); bx.y1 = Math.max(bx.y1, _a.y + r, _b.y + r);
            bx.z0 = Math.min(bx.z0, _a.z - r, _b.z - r); bx.z1 = Math.max(bx.z1, _a.z + r, _b.z + r);
        }
        this.on = true;
    }
    _pt(bones, [bone, p], out) {
        const j = JOINTS[bone], g = bones[bone];
        return out.set(p[0] - j[0], p[1] - j[1], p[2] - j[2]).applyMatrix4(g.matrixWorld);
    }
    /** Капсула i: {a, b, r} (для отладки и тестов). */
    capsule(i, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
        const c = this.c, o = i * 7;
        out.a.set(c[o], c[o + 1], c[o + 2]); out.b.set(c[o + 3], c[o + 4], c[o + 5]); out.r = c[o + 6]; out.part = DEVIL_BODY[i].part;
        return out;
    }

    // ---------------------------------------------------------------- как кусок мира (Collision.addMover)
    hasXZ(x, z, pad = 0) {
        const b = this.box;
        return this.on && !this.paused && x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
    }
    /** Точка внутри тела? */
    pointBlocked(x, y, z) {
        const b = this.box;
        if (!this.on || this.paused || y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
        const c = this.c, o2 = this._o;
        for (let i = 0; i < this.n; i++) {
            const o = i * 7, r = c[o + 6];
            if (segSeg(x, y, z, x, y, z, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5], o2) < r * r) return true;
        }
        return false;
    }
    /** Верх тела под (x, z), до которого дотягиваются ноги (`reachY`): стоять на копыте, плече, голове. null — нет. */
    floorAt(x, z, reachY) {
        if (!this.hasXZ(x, z)) return null;
        const c = this.c;
        let best = null;
        for (let i = 0; i < this.n; i++) {
            const o = i * 7, r = c[o + 6];
            const ax = c[o], ay = c[o + 1], az = c[o + 2], dx = c[o + 3] - ax, dy = c[o + 4] - ay, dz = c[o + 5] - az;
            const L2 = dx * dx + dz * dz;
            let t = L2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const hx = ax + dx * t - x, hz = az + dz * t - z, h2 = hx * hx + hz * hz;
            if (h2 >= r * r) continue;
            const top = ay + dy * t + Math.sqrt(r * r - h2);
            if (top <= reachY + 0.05 && (best === null || top > best)) best = top;
        }
        return best;
    }
    /** Шар (вещь, оружие — Weapon.contactAgainstWorld): глубина в теле, нормаль наружу в `n`. */
    sphereDepth(p, r, n) {
        const b = this.box;
        if (!this.on || this.paused || p.y < b.y0 - r || p.y > b.y1 + r) return 0;
        const c = this.c, o2 = this._o;
        let best = 0;
        for (let i = 0; i < this.n; i++) {
            const o = i * 7, R = c[o + 6] + r;
            const d2 = segSeg(p.x, p.y, p.z, p.x, p.y, p.z, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5], o2);
            if (d2 >= R * R) continue;
            const d = Math.sqrt(d2), depth = R - d;
            if (depth <= best) continue;
            best = depth;
            if (d > 1e-6) n.set((o2.x1 - o2.x2) / d, (o2.y1 - o2.y2) / d, (o2.z1 - o2.z2) / d); else n.set(0, 1, 0);
        }
        return best;
    }
    /** Вертикальный цилиндр (ходьба): выталкивание вбок; на то, что ниже шага, — встаёт (floorAt). */
    pushCylinder(pos, radius, feetY, height, step = 1.05) {
        return this._push(pos, radius, feetY + Math.min(step, height * 0.5), feetY + height, true, null);
    }

    /**
     * Тело (вертикальная капсула от feet до feet + h, радиус rad) вне его кожи: 3D-выталкивание вдоль нормали; `vel` (Vector3) — гасится часть
     * скорости в тело (скольжение по коже). `from` — где было тело в прошлом кадре: быстрый полёт сквозь тонкое место (рог, хвост) не проскакивает.
     * → true, если касался.
     */
    pushOut(pos, rad, feet, h, vel = null, from = null) {
        if (!this.on) return false;
        let swept = false;
        if (from) {
            const dx = pos.x - from.x, dy = pos.y - from.y, dz = pos.z - from.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (L > rad) { // (прошёл больше своего радиуса за кадр: ищем первое касание на пути)
                const n = Math.min(40, Math.ceil(L / Math.max(0.5, rad)));
                const off = feet - pos.y;
                for (let k = 1; k <= n; k++) {
                    const x = from.x + dx * k / n, y = from.y + dy * k / n, z = from.z + dz * k / n;
                    if (this._touch(x, y + off, z, rad, h)) { pos.x = x; pos.y = y; pos.z = z; // (первое касание на пути: дальше _push выталкивает вдоль нормали — скольжение, а не залипание)
                         feet = pos.y + off; swept = true; if (vel) { const L2 = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, vn = (vel.x * dx + vel.y * dy + vel.z * dz) / L2; if (vn > 0) { vel.x -= vn * dx / L2; vel.y -= vn * dy / L2; vel.z -= vn * dz / L2; } } break; }
                }
            }
        }
        return this._push(pos, rad, feet + rad, feet + Math.max(h - rad, rad), false, vel) || swept;
    }
    _touch(x, feet, z, rad, h) {
        const b = this.box;
        if (x < b.x0 - rad || x > b.x1 + rad || z < b.z0 - rad || z > b.z1 + rad || feet > b.y1 + rad || feet + h < b.y0 - rad) return false;
        const c = this.c, o2 = this._o, y0 = feet + rad, y1 = feet + Math.max(h - rad, rad);
        for (let i = 0; i < this.n; i++) {
            const o = i * 7, R = c[o + 6] + rad;
            if (segSeg(x, y0, z, x, y1, z, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5], o2) < R * R) return true;
        }
        return false;
    }
    _push(pos, rad, y0, y1, flat, vel) {
        if (!this.on) return false;
        const b = this.box;
        if (pos.x < b.x0 - rad || pos.x > b.x1 + rad || pos.z < b.z0 - rad || pos.z > b.z1 + rad || y0 > b.y1 + rad || y1 < b.y0 - rad) return false;
        const c = this.c, o2 = this._o;
        let hit = false;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (let i = 0; i < this.n; i++) {
                const o = i * 7, R = c[o + 6] + rad;
                const d2 = segSeg(pos.x, y0, pos.z, pos.x, y1, pos.z, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5], o2);
                if (d2 >= R * R) continue;
                let nx = o2.x1 - o2.x2, ny = flat ? 0 : o2.y1 - o2.y2, nz = o2.z1 - o2.z2;
                let L = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (L < 1e-6) { // (точно на оси: наружу от середины капсулы, вбок)
                    nx = pos.x - (c[o] + c[o + 3]) / 2; nz = pos.z - (c[o + 2] + c[o + 5]) / 2; ny = 0; L = Math.hypot(nx, nz);
                    if (L < 1e-6) { nx = 1; nz = 0; L = 1; }
                }
                nx /= L; ny /= L; nz /= L;
                let push;
                if (flat) { // (вбок, как от стены: столько, чтобы по горизонтали выйти из капсулы на этой высоте)
                    const dy = o2.y1 - o2.y2;
                    push = Math.sqrt(Math.max(0, R * R - dy * dy)) - L + BODY.SKIN;
                } else push = R - Math.sqrt(d2) + BODY.SKIN;
                if (push <= 0) continue;
                pos.x += nx * push; pos.z += nz * push;
                if (!flat) { pos.y += ny * push; y0 += ny * push; y1 += ny * push; }
                if (vel) {
                    const vn = vel.x * nx + vel.y * ny + vel.z * nz;
                    if (vn < 0) { vel.x -= vn * nx; vel.y -= vn * ny; vel.z -= vn * nz; vel.multiplyScalar(1 - BODY.SLIDE); }
                }
                moved = true;
            }
            if (!moved) break;
            hit = true;
        }
        if (hit) this.hits++;
        return hit;
    }
}

/** Таблица «кто/что» для его тела (CLAUDE.md). */
export const BODY_TARGETS = {
    player: 'не проходит: идёт — упирается (Collision mover), летит — выталкивается вдоль кожи и скользит (Diabolos.pushOut в Game)',
    dragon: 'дракон (и всадник на нём) не пролетает сквозь — выталкивается (Dragons → diabolos.pushOut)',
    creatures: 'жители, Тароны, зомби, звери — resolveCylinder упирается в него, как в стену; горгульи ада облетают (pushOut)',
    items: 'вещи и оружие — pointBlocked: падают на него/отскакивают, не пролетают',
    bolts: 'заряды дуэли — по-прежнему его капсула (Duel «Y»): попали — злят',
    chain: 'цепь мягко отталкивает игрока (Diabolos._chainPush), сквозь звенья не пройти',
    own: 'свои шары и струя — по своим правилам (вылетают из пасти/рук, тело их не гасит)',
};
