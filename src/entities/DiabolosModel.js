/**
 * DiabolosModel.js — модель Дьяволоса, огромного прикованного дьявола ада (DiabolosRules.js — правила, Diabolos.js — игра).
 *
 * Слова автора: «типичный дьявол, но с ОГРОМНЫМИ РОГАМИ, очень УПИТАННЫЙ, с КОПЫТАМИ… ОДНО КОПЫТО ПРИКОВАНО: большая ЦЕПЬ…
 * чтобы ЭПИЧНО выглядел». Анатомия: круглое тяжёлое брюхо со складками и пупком, обвисшая грудь, горб трапеций, короткая
 * толстая шея с подгрудком; козлиные (пальцеходящие) ноги в жёсткой чёрной шерсти, раздвоенные копыта с кольцами роста и
 * шпорами; руки толще бёдер героя ×35, пальцы с чёрными когтями; голова — широкая бычья морда, тяжёлые надбровья,
 * светящиеся глаза со зрачком-щелью, острые уши с надрывами, клыки и кабаньи бивни, козлиная бородка; огромные рога барана,
 * закрученные спиралью, с кольцами нароста и сколами, светлые у корня и чёрные к острию; на спине — костяные шипы по хребту;
 * пояс из клёпаных железных пластин с черепом-пряжкой и рваная кожаная набедренная повязка; ржавые кандалы на запястьях
 * с обрывками цепей; на ЛЕВОМ копыте — кованый браслет с ушком, к нему идёт цепь (Diabolos.js: звенья — InstancedMesh).
 * Кожа — шейдером (поры, складки, трещины с раскалённым светом изнутри, ярче, когда он зол) — на видеокарте, без текстур.
 *
 * Мерки: форма строится ростом DEVIL.MODEL_H = 3,5 (как герой; макушка 3,5, копыта на 0), группа ×35 → 122,5 м
 * (DiabolosRules: монстр пентаграммы 24,5 м × 5). Смотрит в −Z, как герой.
 *
 * Дёшево: каждая кость — одна форма на материал (mergeParts), формы общие (одна на игру), на FarShape (части — кости,
 * двигает видеокарта): кожа (свой шейдер), «твёрдое» (рога, копыта, когти, зубы, железо — цвет в вершинах) и свечение
 * (глаза, пасть) — 3 отрисовки; цепь — 4-я, якорь — 5-я.
 */

import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { sweep, keys } from '../game/AnimalModels.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const g1 = (x, w) => Math.exp(-(x * x) / (2 * w * w));
const ad = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

// окрас: угольно-красная кожа, светлее и краснее на брюхе и груди, темнее по спине; чёрная шерсть на ногах
const SKIN = [0.46, 0.11, 0.07], BELLY = [0.62, 0.2, 0.12], BACKC = [0.2, 0.07, 0.05], SCAR = [0.74, 0.42, 0.33], BURN = [0.1, 0.05, 0.04];
const FUR = [0.1, 0.075, 0.065], FUR2 = [0.17, 0.11, 0.08];
const HORN0 = [0.66, 0.58, 0.44], HORN1 = [0.07, 0.055, 0.045], HOOF = [0.08, 0.07, 0.065], CLAW = [0.06, 0.05, 0.05];
const TOOTH = [0.84, 0.77, 0.58], IRON = [0.2, 0.19, 0.19], RUST = [0.42, 0.22, 0.12], LEATHER = [0.22, 0.13, 0.09], BONE = [0.7, 0.64, 0.5];
const GLOW = [1, 0.62, 0.16];

/** Цвет в вершины (все части формы с цветом — mergeParts берёт общие атрибуты). */
function tint(geo, f) {
    const P = geo.getAttribute('position'), c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const k = typeof f === 'function' ? f(P.getX(i), P.getY(i), P.getZ(i)) : f;
        c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.deleteAttribute('uv');
    return geo;
}
/** Сфера-эллипсоид с выпуклостями: center, radii, bump(nx, ny, nz) → множитель, color(x,y,z) → rgb. */
function blob(c, r, { bump = null, color = SKIN, w = 28, h = 20 } = {}) {
    const g = new THREE.SphereGeometry(1, w, h);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
        const nx = P.getX(i), ny = P.getY(i), nz = P.getZ(i);
        const k = bump ? bump(nx, ny, nz) : 1;
        P.setXYZ(i, c[0] + nx * r[0] * k, c[1] + ny * r[1] * k, c[2] + nz * r[2] * k);
    }
    g.computeVertexNormals();
    return tint(g, color);
}
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
/** Матрица: из точки `at` осью Y формы в направлении `dir`, масштаб `sc`. */
function aim(at, dir, sc = [1, 1, 1], spin = 0) {
    _q.setFromUnitVectors(_up, dir.clone().normalize());
    if (spin) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, spin));
    return new THREE.Matrix4().compose(at, _q, new THREE.Vector3(sc[0], sc[1], sc[2]));
}
/** Конус острием по +Y (шерсть, шипы, зубы). */
const coneGeo = (s = 6) => new THREE.CylinderGeometry(0, 1, 1, s, 2).translate(0, 0.5, 0);
/** Изогнутый рог/коготь/бивень вдоль кривой: от корня r0 к острию, кольца нароста и сколы. */
function hornAlong(pts, r0, { rings = 30, sides = 12, ridges = 0, chips = 0, c0 = HORN0, c1 = HORN1, tipK = 0.05, seed = 1 } = {}) {
    const g = sweep(pts, (t) => { const r = r0 * (1 - t * (1 - tipK)) ** 0.9; return [r, r * 0.92, 0]; }, {
        rings, sides,
        bump: (t, ang) => {
            let k = 1;
            if (ridges) k += 0.07 * Math.max(0, Math.sin(t * ridges * Math.PI)) ** 3 * (1 - t * 0.6); // кольца нароста
            if (ridges) k += 0.02 * Math.sin(ang * 3 + t * 7);
            for (let i = 0; i < chips; i++) { const ct = 0.25 + 0.65 * hash(seed * 7 + i), ca = TAU * hash(seed * 13 + i); k -= 0.22 * g1(t - ct, 0.018) * g1(ad(ang, ca), 0.45); } // сколы
            return k;
        },
        color: (t, ang) => {
            let c = mix(c0, c1, Math.min(1, t ** 1.3 * 1.1));
            if (ridges) c = mul(c, 0.82 + 0.22 * Math.max(0, Math.sin(t * ridges * Math.PI)) ** 2);
            c = mul(c, 0.9 + 0.1 * Math.sin(t * 90 + ang * 5) * Math.sin(ang * 11)); // волокна рога
            for (let i = 0; i < chips; i++) { const ct = 0.25 + 0.65 * hash(seed * 7 + i); if (Math.abs(t - ct) < 0.02) c = mix(c, [0.86, 0.8, 0.66], 0.5); } // свежий скол светлее
            return c;
        },
    });
    return g;
}

// ------------------------------------------------------------------ скелет (позы стоя, в единицах формы)
/** Суставы стоя (единицы формы: рост 3,5; ноги на 0; смотрит в −Z). */
export const JOINTS = {
    hips: [0, 1.5, 0.02], spine: [0, 1.82, 0.04], chest: [0, 2.32, 0.06], neck: [0, 2.86, 0.0], head: [0, 3.06, -0.06], jaw: [0, 3.06, -0.1],
    eyeL: [-0.12, 3.24, -0.33], pupL: [-0.12, 3.24, -0.36], browL: [-0.13, 3.31, -0.33], earL: [-0.22, 3.3, 0.02], maw: [0, 3.0, -0.3],
    lip: [0, 3.02, -0.42], nose: [0, 2.99, -0.46], tongue1: [0, 2.965, -0.16], tongue2: [0, 2.965, -0.28], tongue3: [0, 2.965, -0.38],
    shL: [-0.74, 2.7, 0.08], elL: [-0.92, 2.0, 0.14], wrL: [-0.96, 1.36, 0.02], haL: [-0.96, 1.36, 0.02],
    thL: [-0.33, 1.48, 0.02], knL: [-0.35, 1.03, -0.16], hoL: [-0.36, 0.6, 0.15], feL: [-0.37, 0.17, -0.02],
    tail: [0, 1.42, 0.5], tail2: [0, 1.22, 0.72], tail3: [0, 1.0, 0.82],
};
for (const k of Object.keys(JOINTS)) if (k.endsWith('L')) { const j = JOINTS[k]; JOINTS[k.slice(0, -1) + 'R'] = [-j[0], j[1], j[2]]; }
const PARENT = {
    hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', maw: 'jaw',
    eyeL: 'head', pupL: 'eyeL', eyeR: 'head', pupR: 'eyeR', browL: 'head', browR: 'head', earL: 'head', earR: 'head', lip: 'head', nose: 'head',
    tongue1: 'jaw', tongue2: 'tongue1', tongue3: 'tongue2',
    shL: 'chest', elL: 'shL', wrL: 'elL', haL: 'wrL', shR: 'chest', elR: 'shR', wrR: 'elR', haR: 'wrR',
    thL: 'hips', knL: 'thL', hoL: 'knL', feL: 'hoL', thR: 'hips', knR: 'thR', hoR: 'knR', feR: 'hoR',
    tail: 'hips', tail2: 'tail', tail3: 'tail2',
};
const ORDER = Object.keys(PARENT);
/** Ушко кандалов на левом копыте — в единицах формы, стоя (к нему крепится цепь). */
export const EYELET = [-0.37, 0.27, 0.12];

// ------------------------------------------------------------------ формы по костям
let _parts = null;
/** {bone: {skin, hard, glow}} — геометрии в мировых координатах позы стоя (потом сдвигаются к суставу). */
function build() {
    if (_parts) return _parts;
    const S = {}, H = {}, G = {};
    const put = (M, bone, geo, matrix = null) => { (M[bone] || (M[bone] = [])).push(matrix ? { geo, matrix } : { geo }); };
    const skinShade = (base) => (x, y, z) => {
        // спина темнее, брюхо светлее; пятна ожогов и светлые шрамы
        let c = mix(base, BACKC, Math.max(0, Math.min(1, (z - 0.05) * 2.2)));
        c = mul(c, 0.86 + 0.18 * hash(Math.floor(x * 9) * 31 + Math.floor(y * 9) * 7 + Math.floor(z * 9)));
        const burn = g1(Math.sin(x * 5.1 + y * 3.3) + Math.cos(z * 4.7 - y * 2.1) - 1.4, 0.25);
        c = mix(c, BURN, burn * 0.55);
        return c;
    };
    const scarLines = (c, x, y, z) => {
        // шрамы: три косые полосы на груди, рубец через брюхо, ожог на плече (светлая натянутая кожа)
        const s1 = g1((y - 2.45) + (x + 0.2) * 0.8, 0.012) * (z < 0 && x > -0.5 && x < 0.15 ? 1 : 0);
        const s2 = g1((y - 2.33) + (x + 0.15) * 0.8, 0.01) * (z < 0 && x > -0.45 && x < 0.1 ? 1 : 0);
        const s3 = g1((y - 2.21) + (x + 0.1) * 0.8, 0.012) * (z < 0 && x > -0.35 && x < 0.15 ? 1 : 0);
        const s4 = g1((y - 1.75) - (x - 0.1) * 0.35, 0.014) * (z < -0.3 && x > -0.25 && x < 0.5 ? 1 : 0);
        return mix(c, SCAR, Math.min(1, s1 + s2 + s3 + s4));
    };

    // ===== брюхо и таз (hips): огромное круглое брюхо, складки, пупок
    put(S, 'hips', blob([0, 1.86, -0.16], [0.72, 0.66, 0.62], {
        w: 40, h: 30,
        bump: (nx, ny, nz) => {
            let k = 1 + 0.06 * g1(ny + 0.45, 0.2) * (nz < 0 ? 1 : 0.3);                           // свисает вниз
            k -= 0.05 * g1(ny + 0.15, 0.035) * Math.max(0, -nz);                                   // складка под пупком
            k -= 0.03 * g1(ny - 0.35, 0.04) * Math.max(0, -nz);                                    // складка над ним
            k -= 0.12 * g1(nx, 0.05) * g1(ny + 0.02, 0.05) * Math.max(0, -nz) ** 4;               // пупок
            return k;
        },
        color: (x, y, z) => scarLines(skinShade(BELLY)(x, y, z), x, y, z),
    }));
    put(S, 'hips', blob([0, 1.48, 0.06], [0.66, 0.38, 0.5], { color: skinShade(SKIN) })); // таз
    put(S, 'hips', blob([-0.26, 1.42, 0.3], [0.32, 0.36, 0.3], { color: skinShade(BACKC) })); // ягодицы
    put(S, 'hips', blob([0.26, 1.42, 0.3], [0.32, 0.36, 0.3], { color: skinShade(BACKC) }));
    // пояс из клёпаных железных пластин, череп-пряжка
    for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU, rx = 0.74, rz = 0.63, x = Math.sin(a) * rx, z = -Math.cos(a) * rz - 0.06;
        const plate = tint(new THREE.BoxGeometry(0.26, 0.17, 0.05), (px, py) => mix(IRON, RUST, 0.3 + 0.6 * hash(i * 3 + Math.floor(py * 40)))).rotateY(-a);
        put(H, 'hips', plate.translate(x, 1.36 + 0.02 * Math.sin(a * 2), z));
        for (const dy of [-0.05, 0.05]) put(H, 'hips', tint(new THREE.SphereGeometry(0.022, 6, 4), IRON).translate(x * 1.05, 1.36 + dy, z * 1.05 - 0.003));
    }
    {   // череп-пряжка (кость) под брюхом
        const at = [0, 1.36, -0.73];
        put(H, 'hips', blob(at, [0.12, 0.11, 0.08], { color: BONE, bump: (nx, ny, nz) => 1 - 0.25 * g1(ny - 0.2, 0.15) * g1(Math.abs(nx) - 0.4, 0.15) * Math.max(0, -nz) }));
        put(H, 'hips', blob([at[0], at[1] - 0.09, at[2] + 0.01], [0.08, 0.05, 0.06], { color: mul(BONE, 0.85) }));
        for (const s of [-1, 1]) put(H, 'hips', blob([s * 0.045, at[1] + 0.02, at[2] - 0.07], [0.03, 0.035, 0.02], { color: [0.04, 0.02, 0.02] })); // глазницы
        for (const s of [-1, 1]) put(H, 'hips', hornAlong([v3(s * 0.08, at[1] + 0.07, at[2]), v3(s * 0.16, at[1] + 0.15, at[2] - 0.02), v3(s * 0.17, at[1] + 0.25, at[2] + 0.02)], 0.02, { rings: 8, sides: 6, c0: BONE, c1: [0.25, 0.2, 0.15] }));
    }
    // рваная кожаная повязка: передний и задний лоскуты
    for (const [zz, sgn] of [[-0.62, -1], [0.62, 1]]) {
        const flap = new THREE.PlaneGeometry(0.62, 0.55, 8, 6);
        const P = flap.getAttribute('position');
        for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i);
            const rag = y < -0.2 ? 0.06 * Math.sin(x * 37) + 0.04 * Math.sin(x * 91) : 0;
            P.setXYZ(i, x * (1 + 0.15 * (0.28 - y)), y + rag + 1.06, zz + sgn * (0.06 + 0.12 * (0.28 - y) ** 2) + 0.02 * Math.sin(x * 9));
        }
        flap.computeVertexNormals();
        put(H, 'hips', tint(flap, (x, y) => mul(LEATHER, 0.7 + 0.35 * hash(Math.floor(x * 30) + Math.floor(y * 30) * 17))));
    }
    // хребет-шипы низ спины
    for (let i = 0; i < 3; i++) put(H, 'hips', tint(coneGeo(), (x, y) => mix(BONE, HORN1, y)), aim(v3(0, 1.62 + i * 0.1, 0.52 - i * 0.02), v3(0, 0.4, 1), [0.04, 0.12, 0.04]));

    // ===== середина (spine): верх брюха, бока, «ручки любви»
    put(S, 'spine', blob([0, 2.12, -0.04], [0.76, 0.5, 0.56], {
        w: 36, h: 24,
        bump: (nx, ny, nz) => 1 + 0.06 * g1(ny + 0.3, 0.25) * g1(Math.abs(nx) - 0.9, 0.2) - 0.03 * g1(ny - 0.1, 0.05) * Math.max(0, -nz),
        color: (x, y, z) => scarLines(skinShade(mix(SKIN, BELLY, 0.5))(x, y, z), x, y, z),
    }));
    for (let i = 0; i < 4; i++) put(H, 'spine', tint(coneGeo(), (x, y) => mix(BONE, HORN1, y)), aim(v3(0, 1.95 + i * 0.12, 0.52), v3(0, 0.3, 1), [0.05, 0.16 + i * 0.02, 0.05]));

    // ===== грудь и плечи (chest): широкая грудь, обвисшие грудные, горб трапеций
    put(S, 'chest', blob([0, 2.5, 0.04], [0.86, 0.5, 0.55], {
        w: 40, h: 28,
        bump: (nx, ny, nz) => {
            let k = 1;
            k += 0.1 * g1(ny + 0.2, 0.25) * (g1(nx - 0.45, 0.22) + g1(nx + 0.45, 0.22)) * Math.max(0, -nz); // грудные (обвисли)
            k -= 0.04 * g1(nx, 0.06) * Math.max(0, -nz);                                                    // ложбина
            k += 0.12 * g1(ny - 0.7, 0.3) * Math.max(0, nz) * g1(nx, 0.6);                                  // горб трапеций
            k -= 0.03 * g1(nx, 0.05) * Math.max(0, nz) * (ny < 0.6 ? 1 : 0);                                // ложбина хребта
            return k;
        },
        color: (x, y, z) => {
            let c = scarLines(skinShade(SKIN)(x, y, z), x, y, z);
            for (const s of [-1, 1]) c = mix(c, [0.3, 0.08, 0.06], g1(Math.hypot(x - s * 0.38, y - 2.33), 0.04) * (z < 0 ? 1 : 0)); // соски
            return c;
        },
    }));
    put(S, 'chest', blob([0, 2.82, 0.1], [0.6, 0.24, 0.42], { color: skinShade(BACKC) })); // трапеции
    for (const s of [-1, 1]) put(S, 'chest', blob([s * 0.72, 2.7, 0.08], [0.3, 0.3, 0.32], { color: skinShade(SKIN) })); // дельты
    // шипы по хребту — выше и длиннее к загривку
    for (let i = 0; i < 6; i++) put(H, 'chest', tint(coneGeo(), (x, y) => mix(BONE, HORN1, y * 1.2)), aim(v3(0, 2.3 + i * 0.1, 0.55 - Math.max(0, i - 3) * 0.04), v3(0, 0.5, 1), [0.06, 0.2 + i * 0.04, 0.06]));
    // клочья шерсти на груди и плечах
    for (let i = 0; i < 26; i++) {
        const a = hash(i * 5.1) * TAU, u = hash(i * 9.7);
        const x = Math.cos(a) * 0.3 * u, y = 2.42 + Math.sin(a) * 0.18 * u;
        put(S, 'chest', tint(coneGeo(4), mul(FUR, 1 + hash(i) * 0.4)), aim(v3(x, y, -0.5 + 0.08 * u), v3(x * 0.4, -0.6, -1), [0.03, 0.09, 0.015]));
    }

    // ===== шея (neck): толстая, с подгрудком
    put(S, 'neck', sweep([v3(0, 2.72, 0.06), v3(0, 2.96, -0.02), v3(0, 3.12, -0.08)], keys([[0, 0.42, 0.36, 0], [0.5, 0.36, 0.34, 0], [1, 0.3, 0.3, 0]]), {
        rings: 10, sides: 22,
        bump: (t, ang) => 1 + 0.18 * g1(ad(ang, -Math.PI / 2), 0.5) * g1(t - 0.55, 0.25) + 0.03 * Math.sin(t * 30) * g1(ad(ang, -Math.PI / 2), 0.4),
        color: (t, ang) => mix(SKIN, BACKC, g1(ad(ang, Math.PI / 2), 0.9) * 0.8),
    }));

    // ===== голова (head): бычья морда, надбровья, уши, рога
    {
        const head = sweep([v3(0, 3.2, 0.14), v3(0, 3.24, -0.05), v3(0, 3.14, -0.3), v3(0, 3.02, -0.46)], keys([
            [0, 0.2, 0.22, 0], [0.18, 0.28, 0.28, 0.02], [0.45, 0.3, 0.25, 0], [0.7, 0.24, 0.18, -0.02], [0.88, 0.19, 0.14, -0.02], [1, 0.14, 0.11, -0.02]]), {
            rings: 28, sides: 28,
            bump: (t, ang) => {
                const up = ad(ang, Math.PI / 2), sideR = ad(ang, 0), sideL = ad(ang, Math.PI);
                let k = 1;
                k += 0.18 * g1(t - 0.47, 0.06) * (g1(up - 0.55, 0.3) + g1(up + 0.55, 0.3));   // тяжёлые надбровья
                k -= 0.14 * g1(t - 0.53, 0.05) * (g1(up - 0.75, 0.2) + g1(up + 0.75, 0.2));   // глазницы
                k += 0.1 * g1(t - 0.6, 0.08) * (g1(sideR + 0.3, 0.3) + g1(sideL - 0.3, 0.3)); // скулы
                k += 0.06 * g1(t - 0.3, 0.1) * g1(up, 0.4);                                    // лобная кость
                k -= 0.05 * g1(t - 0.75, 0.15) * g1(up, 0.25);                                 // переносица
                k += 0.12 * g1(t - 0.97, 0.04) * (g1(up - 0.45, 0.25) + g1(up + 0.45, 0.25));  // ноздри (крылья)
                k += 0.025 * Math.sin(t * 60) * g1(t - 0.85, 0.1) * g1(up, 0.5);               // морщины на носу
                return k;
            },
            color: (t, ang) => {
                const up = ad(ang, Math.PI / 2);
                let c = mix(SKIN, BACKC, g1(up, 0.8) * Math.max(0, 0.5 - t) * 1.6);
                c = mix(c, [0.08, 0.02, 0.02], g1(t - 0.53, 0.04) * (g1(up - 0.75, 0.2) + g1(up + 0.75, 0.2))); // тень в глазницах
                c = mix(c, [0.05, 0.02, 0.02], g1(t - 0.99, 0.02) * (g1(up - 0.45, 0.2) + g1(up + 0.45, 0.2)));  // ноздри
                c = mix(c, SCAR, g1(t - 0.62 - (up - 0.6) * 0.25, 0.012) * g1(up - 0.6, 0.5));                    // шрам через глаз
                return mul(c, 0.9 + 0.12 * Math.sin(t * 77 + ang * 13) * Math.sin(ang * 7));
            },
        });
        put(S, 'head', head);
        // уши: острые, с надрывом
        for (const s of [-1, 1]) {
            const ear = sweep([v3(s * 0.22, 3.3, 0.02), v3(s * 0.38, 3.36, 0.06), v3(s * 0.56, 3.42, 0.14)], (t) => [0.08 * (1 - t) + 0.005, 0.02, 0], { rings: 8, sides: 8,
                bump: (t, ang) => 1 - (s > 0 ? 0.6 * g1(t - 0.6, 0.05) * g1(ad(ang, 0), 0.6) : 0), color: (t) => mix(SKIN, [0.3, 0.05, 0.04], t) });
            put(S, s < 0 ? 'earL' : 'earR', ear);
        }
        // бородка (козлиная) — на челюсти; брови-гребни — шерсть
        for (let i = 0; i < 10; i++) for (const s of [-1, 1]) put(S, 'head', tint(coneGeo(4), FUR), aim(v3(s * (0.08 + i * 0.02), 3.36 - i * 0.004, -0.27 - i * 0.004), v3(s * 0.8, 0.3, -0.2), [0.02, 0.07, 0.012]));
        // ГЛАВНОЕ: рога барана — спираль наружу-назад-вниз-вперёд, длиной ~1,6 формы (≈ 55 м), кольца и сколы
        for (const s of [-1, 1]) {
            const pts = [];
            for (let i = 0; i <= 16; i++) {
                const u = i / 16, a = u * Math.PI * 1.55; // полтора оборота спирали
                const R = 0.42 * (1 - 0.35 * u);
                pts.push(v3(s * (0.2 + 0.12 * u + 0.5 * u + 0.08 * Math.sin(a)), 3.36 + R * Math.sin(a) * 0.95 + 0.12 * u, 0.02 + R * (1 - Math.cos(a)) * 0.9 - 0.75 * u * u));
            }
            put(H, 'head', hornAlong(pts, 0.13, { rings: 48, sides: 14, ridges: 22, chips: 4, seed: s > 0 ? 3 : 8, tipK: 0.04 }));
        }
        // верхние клыки
        for (const s of [-1, 1]) put(H, 'head', hornAlong([v3(s * 0.1, 3.0, -0.4), v3(s * 0.11, 2.92, -0.41), v3(s * 0.1, 2.86, -0.4)], 0.025, { rings: 6, sides: 8, c0: TOOTH, c1: mul(TOOTH, 0.7), tipK: 0.1 }));
        for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3; put(H, 'head', tint(coneGeo(5), TOOTH), aim(v3(s * (0.03 + k * 0.025), 3.0, -0.44 + k * 0.03), v3(0, -1, 0), [0.012, 0.04, 0.012])); }
        // кольцо в носу (ржавое)
        const ring = tint(new THREE.TorusGeometry(0.05, 0.012, 6, 16), RUST).rotateY(Math.PI / 2);
        put(H, 'nose', ring.translate(0, 2.98, -0.47));
        // ноздри: раздуваются (кость носа), тёмные провалы с жаром внутри
        for (const s of [-1, 1]) {
            put(S, 'nose', blob([s * 0.055, 3.01, -0.455], [0.045, 0.03, 0.035], { color: mul(SKIN, 0.85), w: 12, h: 8 }));
            put(G, 'nose', blob([s * 0.055, 3.0, -0.485], [0.016, 0.01, 0.006], { color: [0.9, 0.3, 0.05], w: 8, h: 6 }));
        }
        // верхняя губа (кость lip): поднимается в оскал — открывает клыки; морщины над ней
        put(S, 'lip', blob([0, 3.0, -0.415], [0.17, 0.035, 0.06], { color: (x, y) => mul(SKIN, 0.85 + 2 * Math.max(0, Math.sin(y * 300)) ** 6 * 0.2), bump: (nx, ny) => 1 - 0.15 * Math.max(0, -ny), w: 18, h: 10 }));
    }
    // глаза: светятся, зрачок-щель (тёмная «твёрдая» щель поверх)
    for (const s of [-1, 1]) {
        const sd = s < 0 ? 'L' : 'R';
        put(G, 'eye' + sd, blob([s * 0.12, 3.24, -0.33], [0.055, 0.04, 0.035], { color: GLOW, w: 12, h: 8 }));
        put(H, 'pup' + sd, blob([s * 0.12, 3.24, -0.364], [0.008, 0.032, 0.006], { color: [0.03, 0.01, 0.0], w: 6, h: 6 }));
        // веки: тяжёлые складки кожи над глазом (опускаются вместе с бровью — кость брови)
        put(S, 'brow' + sd, blob([s * 0.125, 3.3, -0.335], [0.085, 0.03, 0.05], { color: mul(SKIN, 0.8), w: 14, h: 8 }));
        // брови: костяной валик с жёсткой щетиной — главная часть мимики (хмурится, удивляется, вскидывает одну)
        put(S, 'brow' + sd, blob([s * 0.13, 3.325, -0.33], [0.1, 0.03, 0.045], { color: BACKC, w: 14, h: 8 }));
        for (let i = 0; i < 7; i++) put(S, 'brow' + sd, tint(coneGeo(4), mul(FUR, 0.8 + hash(i * 3 + (s > 0 ? 9 : 0)) * 0.5)), aim(v3(s * (0.05 + i * 0.022), 3.345 + i * 0.004, -0.35), v3(s * 0.9, 0.5, -0.1), [0.012, 0.06 + i * 0.006, 0.008]));
    }
    // ===== челюсть (jaw): тяжёлая, бивни вверх, бородка
    {
        const jaw = sweep([v3(0, 3.0, -0.02), v3(0, 2.93, -0.2), v3(0, 2.94, -0.41)], keys([[0, 0.25, 0.1, 0], [0.5, 0.2, 0.08, 0], [1, 0.13, 0.06, 0]]), {
            rings: 12, sides: 18, color: (t, ang) => mix(SKIN, BACKC, g1(ad(ang, -Math.PI / 2), 0.8) * 0.5),
        });
        put(S, 'jaw', jaw);
        for (const s of [-1, 1]) put(H, 'jaw', hornAlong([v3(s * 0.12, 2.96, -0.34), v3(s * 0.15, 3.06, -0.37), v3(s * 0.13, 3.15, -0.36)], 0.035, { rings: 8, sides: 8, c0: TOOTH, c1: mul(TOOTH, 0.62), tipK: 0.08 }));
        for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3; put(H, 'jaw', tint(coneGeo(5), TOOTH), aim(v3(s * (0.03 + k * 0.03), 2.97, -0.41 + k * 0.035), v3(0, 1, 0), [0.012, 0.035, 0.012])); }
        for (let i = 0; i < 12; i++) { const x = (hash(i * 3) - 0.5) * 0.16; put(S, 'jaw', tint(coneGeo(4), mul(FUR, 0.9 + hash(i) * 0.5)), aim(v3(x, 2.9, -0.36 + hash(i * 7) * 0.08), v3(x, -1, -0.3), [0.02, 0.18 + hash(i * 5) * 0.12, 0.015])); }
    }
    // пасть изнутри: жар (свечение, раздувается перед огнём — кость maw)
    put(G, 'maw', blob([0, 3.0, -0.3], [0.12, 0.05, 0.12], { color: [1, 0.36, 0.06], w: 12, h: 8 }));
    // язык: длинный, мясистый, тёмно-красный, с бороздой посередине и сосочками; на конце — раздвоен (три кости: гнётся и извивается)
    {
        const TONG = [0.5, 0.06, 0.08], TIP = [0.35, 0.03, 0.06];
        const seg = (z0, z1, w0, w1, c) => sweep([v3(0, 2.965, z0), v3(0, 2.966, (z0 + z1) / 2), v3(0, 2.965, z1)], (t) => [w0 + (w1 - w0) * t, (w0 + (w1 - w0) * t) * 0.35, 0], {
            rings: 8, sides: 14,
            bump: (t, a) => 1 - 0.25 * g1(ad(a, Math.PI / 2), 0.25) + 0.04 * Math.sin(t * 40 + a * 9), // (борозда сверху, бугорки)
            color: (t, a) => mul(c, 0.8 + 0.3 * Math.max(0, Math.sin(t * 70 + a * 11)) ** 3 - 0.2 * g1(ad(a, Math.PI / 2), 0.25)) });
        put(S, 'tongue1', seg(-0.14, -0.29, 0.075, 0.065, TONG));
        put(S, 'tongue2', seg(-0.27, -0.39, 0.065, 0.05, TONG));
        put(S, 'tongue3', seg(-0.37, -0.45, 0.05, 0.04, mix(TONG, TIP, 0.5)));
        for (const s of [-1, 1]) put(S, 'tongue3', hornAlong([v3(s * 0.012, 2.965, -0.44), v3(s * 0.035, 2.966, -0.5), v3(s * 0.05, 2.968, -0.55)], 0.022, { rings: 6, sides: 8, c0: TIP, c1: [0.25, 0.02, 0.04], tipK: 0.15 })); // (раздвоенный кончик)
    }

    // ===== руки: плечо, предплечье (кандалы), кисть с когтями
    for (const sd of ['L', 'R']) {
        const s = sd === 'L' ? -1 : 1;
        const sh = JOINTS['sh' + sd], el = JOINTS['el' + sd], wr = JOINTS['wr' + sd];
        put(S, 'sh' + sd, sweep([v3(sh[0], sh[1] + 0.05, sh[2]), v3((sh[0] + el[0]) / 2 + s * 0.04, (sh[1] + el[1]) / 2, sh[2] + 0.02), v3(el[0], el[1], el[2])],
            keys([[0, 0.3, 0.3, 0], [0.45, 0.27, 0.29, 0], [1, 0.2, 0.21, 0]]), { rings: 14, sides: 20,
                bump: (t, ang) => 1 + 0.12 * g1(t - 0.45, 0.2) * g1(ad(ang, -Math.PI / 2), 0.6) + 0.06 * g1(t - 0.4, 0.2) * g1(ad(ang, Math.PI / 2), 0.6),
                color: (t, ang) => mul(mix(SKIN, BACKC, g1(ad(ang, Math.PI / 2), 1) * 0.6), 0.9 + 0.1 * Math.sin(t * 50 + ang * 8)) }));
        put(S, 'el' + sd, sweep([v3(el[0], el[1] + 0.04, el[2]), v3((el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2 - 0.02), v3(wr[0], wr[1], wr[2])],
            keys([[0, 0.22, 0.22, 0], [0.3, 0.24, 0.21, 0], [1, 0.15, 0.13, 0]]), { rings: 12, sides: 18,
                bump: (t, ang) => 1 + 0.03 * Math.sin(ang * 6 + t * 4) * g1(t - 0.4, 0.3), color: (t, ang) => mix(SKIN, BACKC, g1(ad(ang, Math.PI / 2), 1) * 0.5) }));
        // ржавые кандалы на запястье + обрывок цепи (3 звена висят)
        const cuff = new THREE.CylinderGeometry(0.2, 0.2, 0.17, 20, 1, true);
        put(H, 'el' + sd, tint(cuff, (x, y, z) => mix(IRON, RUST, 0.25 + 0.6 * hash(Math.floor(Math.atan2(z, x) * 6) + Math.floor(y * 30)))).translate(wr[0], wr[1] + 0.14, wr[2]));
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; put(H, 'el' + sd, tint(new THREE.SphereGeometry(0.025, 6, 4), IRON).translate(wr[0] + Math.cos(a) * 0.205, wr[1] + 0.14, wr[2] + Math.sin(a) * 0.205)); }
        for (let i = 0; i < 3; i++) {
            const link = tint(new THREE.TorusGeometry(0.06, 0.018, 6, 12).scale(0.7, 1.25, 1), mix(IRON, RUST, 0.5)).rotateY(i % 2 ? Math.PI / 2 : 0.2);
            put(H, 'el' + sd, link.translate(wr[0] + s * 0.18, wr[1] + 0.06 - i * 0.12, wr[2] + 0.04));
        }
        // кисть: ладонь, 4 толстых пальца (полусогнуты), большой палец, чёрные когти
        put(S, 'ha' + sd, blob([wr[0], wr[1] - 0.17, wr[2] - 0.02], [0.13, 0.19, 0.08], { color: skinShade(SKIN) }));
        for (let f = 0; f < 4; f++) {
            const fx = wr[0] + s * (-0.08 + f * 0.055), fy = wr[1] - 0.34, fz = wr[2] - 0.05 + (f - 1.5) * 0.0;
            const pts = [v3(fx, fy + 0.02, fz), v3(fx, fy - 0.1, fz - 0.03), v3(fx, fy - 0.17, fz - 0.09)];
            put(S, 'ha' + sd, sweep(pts, (t) => [0.034 * (1 - t * 0.3), 0.036 * (1 - t * 0.3), 0], { rings: 6, sides: 8, color: (t) => mix(SKIN, BACKC, t * 0.4),
                bump: (t) => 1 + 0.15 * g1(t - 0.45, 0.08) }));
            put(H, 'ha' + sd, hornAlong([v3(fx, fy - 0.17, fz - 0.09), v3(fx, fy - 0.2, fz - 0.15), v3(fx, fy - 0.17, fz - 0.21)], 0.025, { rings: 6, sides: 6, c0: CLAW, c1: [0.02, 0.02, 0.02], tipK: 0.05 }));
        }
        const tx = wr[0] - s * 0.13;
        put(S, 'ha' + sd, sweep([v3(tx, wr[1] - 0.1, wr[2] - 0.05), v3(tx - s * 0.05, wr[1] - 0.22, wr[2] - 0.12), v3(tx - s * 0.03, wr[1] - 0.3, wr[2] - 0.17)], (t) => [0.04 * (1 - t * 0.3), 0.04, 0], { rings: 6, sides: 8, color: SKIN.length ? () => SKIN : null }));
        put(H, 'ha' + sd, hornAlong([v3(tx - s * 0.03, wr[1] - 0.3, wr[2] - 0.17), v3(tx - s * 0.02, wr[1] - 0.36, wr[2] - 0.2), v3(tx, wr[1] - 0.38, wr[2] - 0.17)], 0.028, { rings: 6, sides: 6, c0: CLAW, c1: [0.02, 0.02, 0.02] }));
    }

    // ===== ноги: козлиные, в шерсти; копыта раздвоенные с кольцами роста и шпорами
    for (const sd of ['L', 'R']) {
        const s = sd === 'L' ? -1 : 1;
        const th = JOINTS['th' + sd], kn = JOINTS['kn' + sd], ho = JOINTS['ho' + sd], fe = JOINTS['fe' + sd];
        const fur = (rgb) => (t, ang) => mul(mix(rgb, FUR2, 0.3 * Math.max(0, Math.sin(ang * 3 + t * 9))), 0.8 + 0.3 * hash(Math.floor(t * 40) * 13 + Math.floor((ang + 4) * 6)));
        const shag = (t, ang) => 1 + 0.06 * Math.sin(t * 61 + ang * 7) * Math.sin(ang * 17 - t * 23) + 0.03 * Math.sin(t * 151 + ang * 31);
        put(S, 'th' + sd, sweep([v3(th[0], th[1] + 0.12, th[2]), v3((th[0] + kn[0]) / 2 + s * 0.05, (th[1] + kn[1]) / 2, (th[2] + kn[2]) / 2 - 0.04), v3(kn[0], kn[1], kn[2])],
            keys([[0, 0.38, 0.4, 0], [0.5, 0.33, 0.33, 0], [1, 0.2, 0.2, 0]]), { rings: 14, sides: 22, bump: (t, ang) => shag(t, ang) * (1 + 0.08 * g1(t - 0.4, 0.2) * g1(ad(ang, -Math.PI / 2), 0.7)), color: fur(FUR) }));
        put(S, 'kn' + sd, sweep([v3(kn[0], kn[1] + 0.05, kn[2]), v3((kn[0] + ho[0]) / 2, (kn[1] + ho[1]) / 2, (kn[2] + ho[2]) / 2), v3(ho[0], ho[1], ho[2])],
            keys([[0, 0.2, 0.21, 0], [0.4, 0.18, 0.22, 0], [1, 0.12, 0.13, 0]]), { rings: 10, sides: 16, bump: shag, color: fur(FUR) }));
        put(S, 'ho' + sd, sweep([v3(ho[0], ho[1] + 0.03, ho[2]), v3((ho[0] + fe[0]) / 2, (ho[1] + fe[1]) / 2, (ho[2] + fe[2]) / 2), v3(fe[0], fe[1], fe[2])],
            keys([[0, 0.12, 0.12, 0], [0.7, 0.09, 0.09, 0], [1, 0.12, 0.11, 0]]), { rings: 10, sides: 14, bump: shag, color: fur(mul(FUR, 0.9)) }));
        // космы шерсти над копытом
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; put(S, 'ho' + sd, tint(coneGeo(4), mul(FUR2, 0.8 + hash(i * 3) * 0.4)), aim(v3(fe[0] + Math.cos(a) * 0.11, fe[1] + 0.08, fe[2] + Math.sin(a) * 0.11), v3(Math.cos(a), -1.4, Math.sin(a)), [0.025, 0.13, 0.012])); }
        // копыто: два пальца, кольца роста, тёмный рог; шпоры сзади
        for (const t of [-1, 1]) {
            const cx = fe[0] + t * 0.065, cz = fe[2] - 0.06;
            const toe = blob([cx, 0.08, cz], [0.07, 0.09, 0.15], {
                w: 16, h: 12,
                bump: (nx, ny, nz) => (ny < -0.6 ? 0.9 : 1) * (1 + 0.15 * Math.max(0, -nz) * (ny > 0 ? 0 : 1)) - (nx * t < -0.6 ? 0.1 : 0), // срез к щели между пальцами
                color: (x, y) => mul(HOOF, 0.8 + 0.5 * Math.max(0, Math.sin(y * 140)) ** 4),
            });
            put(H, 'fe' + sd, toe);
            put(H, 'fe' + sd, blob([fe[0] + t * 0.06, 0.13, fe[2] + 0.1], [0.025, 0.04, 0.03], { color: HOOF, w: 8, h: 6 })); // шпоры
        }
    }
    // кандалы на ЛЕВОМ копыте: кованый браслет с клёпками и ушком под цепь
    {
        const fe = JOINTS.feL, y = 0.27;
        const band = new THREE.CylinderGeometry(0.16, 0.17, 0.14, 24, 1, true);
        put(H, 'hoL', tint(band, (x, yy, z) => mix(IRON, RUST, 0.2 + 0.7 * hash(Math.floor(Math.atan2(z, x) * 5) * 3 + Math.floor(yy * 50)))).translate(fe[0], y, fe[2] + 0.01));
        put(H, 'hoL', tint(new THREE.TorusGeometry(0.165, 0.025, 6, 24).rotateX(Math.PI / 2), IRON).translate(fe[0], y + 0.07, fe[2] + 0.01));
        put(H, 'hoL', tint(new THREE.TorusGeometry(0.165, 0.025, 6, 24).rotateX(Math.PI / 2), IRON).translate(fe[0], y - 0.07, fe[2] + 0.01));
        for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; put(H, 'hoL', tint(new THREE.SphereGeometry(0.022, 6, 4), mix(IRON, RUST, 0.3)).translate(fe[0] + Math.cos(a) * 0.168, y, fe[2] + 0.01 + Math.sin(a) * 0.168)); }
        put(H, 'hoL', tint(new THREE.TorusGeometry(0.06, 0.024, 8, 16), mix(IRON, RUST, 0.4)).rotateY(0.3).translate(EYELET[0], EYELET[1], EYELET[2] + 0.06)); // ушко
    }

    // ===== хвост: короткий, толстый, с кистью
    put(S, 'tail', sweep([v3(0, 1.45, 0.45), v3(0, 1.34, 0.62), v3(0, 1.22, 0.72)], (t) => [0.09 * (1 - t * 0.4), 0.09 * (1 - t * 0.4), 0], { rings: 6, sides: 10, color: () => BACKC }));
    put(S, 'tail2', sweep([v3(0, 1.22, 0.72), v3(0, 1.1, 0.8), v3(0, 1.0, 0.82)], (t) => [0.055 * (1 - t * 0.4), 0.055, 0], { rings: 6, sides: 8, color: () => BACKC }));
    for (let i = 0; i < 16; i++) { const a = hash(i * 4.3) * TAU; put(S, 'tail3', tint(coneGeo(4), mul(FUR, 0.8 + hash(i) * 0.6)), aim(v3(0, 1.0, 0.82), v3(Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5 + 0.2), [0.03, 0.2 + hash(i * 2) * 0.08, 0.02])); }

    _parts = { S, H, G };
    return _parts;
}

// ------------------------------------------------------------------ материалы
const DEVIL_U = { uTime: { value: 0 }, uHeat: { value: 0.35 } };
let _mats = null;
/** Кожа: поры, складки, трещины с жаром изнутри (шейдер — узор по координатам формы, на видеокарте). */
function devilMats() {
    if (_mats) return _mats;
    const skin = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x000000 });
    skin.name = 'diabolos-skin';
    skin.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = DEVIL_U.uTime; sh.uniforms.uHeat = DEVIL_U.uHeat;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDp;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDp = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vDp; uniform float uTime; uniform float uHeat;
float dh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float dfbm(vec3 p){ return 0.5 * dn(p) + 0.25 * dn(p * 2.03) + 0.125 * dn(p * 4.01); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float dSkin = clamp((vColor.r - vColor.g) * 4.0, 0.0, 1.0);
float dN = dfbm(vDp * 7.0);
float dPore = smoothstep(0.62, 0.8, dn(vDp * 70.0));
float dWr = smoothstep(0.45, 0.5, abs(fract(dfbm(vDp * vec3(3.0, 11.0, 3.0)) * 6.0) - 0.5));
diffuseColor.rgb *= (0.82 + 0.34 * dN) * (1.0 - 0.22 * dPore * dSkin) * (1.0 - 0.12 * dWr * dSkin);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float dC = abs(dfbm(vDp * 3.2 + vec3(7.1)) - 0.5);
float dCrack = (1.0 - smoothstep(0.0, 0.018, dC)) * dSkin * smoothstep(0.35, 0.6, dfbm(vDp * 1.3 + vec3(3.3)));
float dPulse = 0.65 + 0.35 * sin(uTime * 2.1 + dN * 9.0);
totalEmissiveRadiance += vec3(1.0, 0.32, 0.04) * dCrack * dPulse * (0.3 + 1.1 * uHeat) + vec3(0.25, 0.04, 0.0) * dCrack * dCrack;`);
    };
    skin.customProgramCacheKey = () => 'diabolos-skin';
    const hard = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    hard.name = 'diabolos-hard';
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    glow.name = 'diabolos-glow';
    const chain = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    chain.name = 'diabolos-chain';
    for (const m of [skin, hard, glow, chain]) m.userData.shared = true;
    _mats = { skin, hard, glow, chain };
    return _mats;
}
/** Жар кожи (0…1: спит — тлеет, в ярости — горит) и время пульса — общие для всех копий формы. */
export function devilHeat(heat, t) { DEVIL_U.uHeat.value = heat; DEVIL_U.uTime.value = t; }

let _geo = null;
function boneGeos() {
    if (_geo) return _geo;
    const P = build(), out = {};
    for (const b of ORDER) {
        const j = JOINTS[b];
        const one = (list) => { if (!list?.length) return null; const g = mergeParts(list); g.translate(-j[0], -j[1], -j[2]); g.computeBoundingSphere(); g.userData.keep = true; return g; };
        out[b] = { skin: one(P.S[b]), hard: one(P.H[b]), glow: one(P.G[b]) };
    }
    _geo = out;
    return out;
}

/**
 * Новая модель (группа: ноги на её y, смотрит в −Z; масштаб — DEVIL.SCALE снаружи). userData.bones — суставы по именам,
 * userData.rest — их положения стоя.
 */
export function diabolosModel() {
    const G = boneGeos(), M = devilMats();
    const root = new THREE.Group();
    root.name = 'diabolos';
    const bones = {}, rest = {};
    for (const b of ORDER) {
        const j = JOINTS[b], p = PARENT[b], pj = p ? JOINTS[p] : [0, 0, 0];
        const g = new THREE.Group();
        g.name = 'dv_' + b;
        g.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
        rest[b] = g.position.clone();
        (p ? bones[p] : root).add(g);
        bones[b] = g;
        for (const k of ['skin', 'hard', 'glow']) {
            const geo = G[b][k];
            if (!geo) continue;
            const m = new THREE.Mesh(geo, M[k]);
            m.castShadow = k !== 'glow'; m.receiveShadow = k === 'skin';
            g.add(m);
        }
    }
    root.userData.bones = bones;
    root.userData.rest = rest;
    return root;
}

// ------------------------------------------------------------------ цепь (звено) и якорь
let _link = null;
/** Звено цепи (метры: длина 3,6, ширина 2,1, проволока 0,5 м), ржавчина пятнами, потёртые до металла бока. */
export function chainLinkGeo() {
    if (_link) return _link;
    const g = new THREE.TorusGeometry(1, 0.27, 10, 26);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        // овал звена: середина вытянута (прямые бока), края скруглены
        const sy = y * 1.25 + Math.sign(y) * Math.max(0, Math.abs(y) - 0.3) * 0.4;
        P.setXYZ(i, x * 0.78, sy, z * 0.95);
    }
    g.computeVertexNormals();
    tint(g, (x, y, z) => {
        const n = hash(Math.floor(x * 5) * 7 + Math.floor(y * 5) * 13 + Math.floor(z * 5) * 3);
        const worn = Math.abs(x) > 0.75 ? 0.5 : 0; // (там, где звенья трутся — блестящий металл)
        return mix(mix(IRON, RUST, 0.3 + 0.6 * n), [0.46, 0.45, 0.44], worn);
    });
    _link = g;
    _link.userData.keep = true;
    return g;
}
let _anchor = null;
/** Якорь: кованая плита с клёпками, вбитая скоба и толстое кольцо (метры; кольцо — там, где начинается цепь). */
export function anchorModel() {
    if (!_anchor) {
        const parts = [];
        const plate = tint(new THREE.BoxGeometry(9, 1.4, 9), (x, y, z) => mix(IRON, RUST, 0.3 + 0.6 * hash(Math.floor(x) * 11 + Math.floor(z) * 3)));
        parts.push({ geo: plate, pos: [0, 0.2, 0] });
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; parts.push({ geo: tint(new THREE.SphereGeometry(0.45, 8, 6), IRON), pos: [Math.cos(a) * 3.6, 0.95, Math.sin(a) * 3.6] }); }
        parts.push({ geo: tint(new THREE.TorusGeometry(2.0, 0.55, 10, 22, Math.PI), mix(IRON, RUST, 0.4)), pos: [0, 0.9, 0] }); // скоба
        parts.push({ geo: tint(new THREE.TorusGeometry(2.2, 0.6, 10, 24), mix(IRON, RUST, 0.55)), pos: [0, 3.0, 0], rot: [0, Math.PI / 2, 0] }); // кольцо
        parts.push({ geo: tint(new THREE.CylinderGeometry(1.2, 1.6, 6, 10), (x, y) => mix([0.16, 0.13, 0.12], [0.3, 0.27, 0.25], hash(Math.floor(y * 3)))), pos: [0, -2.6, 0] }); // штырь в скале
        _anchor = mergeParts(parts);
        _anchor.userData.keep = true;
    }
    const m = new THREE.Mesh(_anchor, devilMats().hard);
    m.castShadow = true; m.receiveShadow = true;
    return m;
}
/** Материал цепи (Diabolos.js делает InstancedMesh). */
export const chainMaterial = () => devilMats().chain;

// ------------------------------------------------------------------ позы
const _e = new THREE.Euler(), _t = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const ang = (y, z) => Math.atan2(-z, -y); // угол «от вертикали вниз к −Z (вперёд)»
const LEG = {};
for (const sd of ['L', 'R']) {
    const th = JOINTS['th' + sd], kn = JOINTS['kn' + sd], fe = JOINTS['fe' + sd];
    const a = Math.hypot(kn[1] - th[1], kn[2] - th[2]), b = Math.hypot(fe[1] - kn[1], fe[2] - kn[2]);
    LEG[sd] = { a, b, pa: ang(kn[1] - th[1], kn[2] - th[2]), pb: ang(fe[1] - kn[1], fe[2] - kn[2]) };
}

/**
 * Нога sd ('L'|'R'): копыто (сустав fe) в точку `tgt` (координаты формы, относительно группы-корня; ноль — земля
 * под серединой стоя), колено вперёд (пальцеходящая нога: голень и плюсна — одно звено). Копыто ровно по земле.
 */
function legIK(B, sd, tx, ty, tz, hipsPitch, toe = 0) {
    const L = LEG[sd], thigh = B['th' + sd], hips = B.hips;
    // цель в системе таза (поворот таза — только наклон по x)
    const cp = Math.cos(hipsPitch), sp = Math.sin(hipsPitch);
    const hx = hips.position.y + thigh.position.y * cp - thigh.position.z * sp, hz = hips.position.z + thigh.position.y * sp + thigh.position.z * cp;
    let dy = ty - hx, dz = tz - hz;
    const c = Math.cos(-hipsPitch), s = Math.sin(-hipsPitch);
    const ly = dy * c - dz * s, lz = dy * s + dz * c;
    dy = ly; dz = lz;
    let d = Math.hypot(dy, dz);
    d = Math.max(Math.abs(L.a - L.b) + 0.01, Math.min(L.a + L.b - 0.002, d));
    const av = ang(dy, dz);
    const beta = Math.acos(Math.max(-1, Math.min(1, (L.a * L.a + d * d - L.b * L.b) / (2 * L.a * d))));
    const gam = Math.acos(Math.max(-1, Math.min(1, (L.b * L.b + d * d - L.a * L.a) / (2 * L.b * d))));
    const thA = av + beta, loA = av - gam;
    thigh.rotation.set(thA - L.pa, 0, 0);
    B['kn' + sd].rotation.set(loA - L.pb - (thA - L.pa), 0, 0);
    B['ho' + sd].rotation.set(0, 0, 0);
    B['fe' + sd].rotation.set(-(hipsPitch + thigh.rotation.x + B['kn' + sd].rotation.x) + toe, 0, 0);
}

/**
 * Поза (каждый кадр, когда в кадре; вдали — реже). P:
 *   sit 0…1 (сидит на земле), sleep 0…1 (голова на грудь, глаза закрыты), t (время, с), breath 0…1 (глубина дыхания),
 *   walk {ph (фаза шага), k (0…1)}, look {yaw, pitch} (рад, голова к цели), jaw 0…1, maw 0…1 (жар в пасти),
 *   armL/armR {raise 0…1, fwd 0…1, slam 0…1, grab 0…1}, clap 0…1, lean (наклон вперёд, рывок), strain 0…1 (тянет цепь),
 *   stretch 0…1 (потягивается), eyes 0…1 (открыты), fireAim (рад, наклон головы при огне)
 */
export function poseDiabolos(model, P) {
    const B = model.userData.bones, R = model.userData.rest;
    const sit = P.sit || 0, sl = P.sleep || 0, t = P.t || 0;
    const br = Math.sin(t * (sl > 0.5 ? 0.9 : 1.6)) * (0.5 + 0.5 * (P.breath ?? 0.6));
    const walk = P.walk?.k || 0, ph = P.walk?.ph || 0;
    // таз: стоя 1,5; сидя на земле 0,52 (зад на земле), качается при шаге
    const hipY = R.hips.y * (1 - sit) + 0.52 * sit - walk * 0.03 * Math.abs(Math.cos(ph)) + (P.strain || 0) * -0.05;
    const hipsPitch = -0.12 * sit - (P.lean || 0) * 0.22 - (P.strain || 0) * 0.3; // (− вперёд: поворот по x «+» откидывает назад)
    B.hips.position.set(R.hips.x + walk * 0.04 * Math.sin(ph), hipY, R.hips.z + (P.strain || 0) * -0.12);
    B.hips.rotation.set(hipsPitch, walk * 0.08 * Math.sin(ph), walk * 0.05 * Math.sin(ph));
    // спина и грудь: дыхание (брюхо и грудь раздуваются), сидя — сутулится вперёд
    const hunch = sit * 0.42 + sl * 0.12;
    B.spine.rotation.set(-hunch * 0.5 + (P.stretch || 0) * 0.25, 0, 0);
    // смех трясёт брюхо (shake), пожатие плеч (shrug)
    const sh = (P.shake || 0) * Math.sin(t * 23) * 0.025, shr = P.shrug || 0;
    B.spine.scale.set(1 + br * 0.018 + sh, 1 - sh * 0.5, 1 + br * 0.03 + sh * 1.4);
    B.chest.rotation.set(-hunch * 0.45 + (P.stretch || 0) * 0.3 - (P.lean || 0) * 0.25 + (P.inhale || 0) * 0.15, (P.look?.yaw || 0) * 0.25, 0);
    B.chest.scale.set(1 + br * 0.02, 1 + br * 0.01, 1 + br * 0.025);
    // голова: к цели (шея и голова делят поворот), во сне — на грудь
    const ly = Math.max(-0.9, Math.min(0.9, P.look?.yaw || 0)), lp = Math.max(-0.6, Math.min(0.7, P.look?.pitch || 0));
    const HD = P.head || {}, hy = HD.yaw || 0, hp = HD.pitch || 0, hr = HD.roll || 0;
    B.neck.rotation.set(-sl * 0.45 + lp * 0.4 + (P.inhale || 0) * 0.35 + hp * 0.4, ly * 0.35 + hy * 0.4, hr * 0.3);
    B.head.rotation.set(-sl * 0.25 + lp * 0.55 + (P.fireAim || 0) + (P.inhale || 0) * 0.3 + hp * 0.6, ly * 0.4 + hy * 0.6, Math.sin(t * 0.37) * 0.03 * sl + hr * 0.7);
    B.chest.position.y = R.chest.y + shr * 0.06; // (плечи вверх)
    B.jaw.rotation.set(-(P.jaw || 0) * 0.55 - sl * 0.05 * (0.5 + 0.5 * Math.sin(t * 0.9)), 0, 0);
    // мимика (P.face): брови, веки каждого глаза, зрачки, уши, оскал, ноздри, язык
    const F = P.face || {};
    const eo = Math.max(0.04, P.eyes ?? 1);
    const lidL = Math.max(0.04, eo * (F.lidL ?? F.lid ?? 1)), lidR = Math.max(0.04, eo * (F.lidR ?? F.lid ?? 1));
    B.eyeL.scale.set(1, lidL, 1); B.eyeR.scale.set(1, lidR, 1);
    const pw = F.pupil ?? 1;
    B.pupL.scale.set(pw, 1, 1); B.pupR.scale.set(pw, 1, 1);
    for (const sd of ['L', 'R']) {
        const s = sd === 'L' ? -1 : 1;
        const br = (F.brow ?? 0) + (sd === 'L' ? F.browL ?? 0 : F.browR ?? 0); // −1 нахмурен … +1 вскинут
        const bb = B['brow' + sd], r = R['brow' + sd];
        bb.position.set(r.x, r.y + br * 0.03 - (1 - Math.min(1, sd === 'L' ? lidL : lidR)) * 0.012, r.z);
        bb.rotation.set(-br * 0.12, 0, s * ((F.tilt ?? 0) * 0.35 - Math.min(0, br) * 0.25)); // (хмурится — внутренние концы вниз; tilt — «домиком»)
        const ear = (F.ear ?? 0) + (sd === 'L' ? F.earL ?? 0 : F.earR ?? 0); // −1 прижаты назад … +1 торчком вперёд
        B['ear' + sd].rotation.set(0, s * ear * 0.5, s * ear * 0.25 + Math.sin(t * 0.7 + s) * 0.03);
    }
    B.lip.rotation.set(-(F.snarl ?? 0) * 0.35, 0, 0);
    B.lip.position.set(R.lip.x, R.lip.y + (F.snarl ?? 0) * 0.025, R.lip.z);
    B.nose.scale.set(1 + (F.nostril ?? 0) * 0.35, 1 + (F.nostril ?? 0) * 0.15, 1);
    // язык: out 0…1 — высунут (длиннее, вперёд), wag — болтает (вбок/вверх-вниз), curl — облизывается (кончик вверх)
    const to = F.tongue ?? 0, wag = F.wag ?? 0, lick = F.lick ?? 0;
    B.tongue1.position.set(R.tongue1.x, R.tongue1.y - to * 0.02, R.tongue1.z - to * 0.2);
    B.tongue1.scale.set(1, 1, 1 + to * 0.6);
    B.tongue1.rotation.set(to * 0.25 + Math.sin(t * 9) * wag * 0.15, Math.sin(t * 7) * wag * 0.35, 0);
    B.tongue2.rotation.set(Math.sin(t * 9 + 1) * wag * 0.35 - lick * 0.8, Math.sin(t * 7 + 1) * wag * 0.45, 0);
    B.tongue3.rotation.set(Math.sin(t * 9 + 2) * wag * 0.45 - lick * 0.9, Math.sin(t * 7 + 2) * wag * 0.6, 0);
    const mw = P.maw || 0;
    B.maw.scale.set(0.3 + mw * 1.4, 0.3 + mw * 1.6, 0.3 + mw * 1.4);
    // руки
    for (const sd of ['L', 'R']) {
        const s = sd === 'L' ? -1 : 1, A = (sd === 'L' ? P.armL : P.armR) || {};
        const swing = walk * 0.35 * Math.sin(ph + (sd === 'L' ? 0 : Math.PI));
        const raise = A.raise || 0, fwd = A.fwd || 0, slam = A.slam || 0, grab = A.grab || 0, clap = P.clap || 0;
        // сидя: предплечья лежат на коленях; стоя: висят, чуть в стороны (брюхо мешает)
        let sx = -swing + sit * 0.75 + fwd * 1.3 + raise * 2.6 - slam * 2.2 + grab * 1.2 + clap * 1.35 + (P.stretch || 0) * 2.4;
        let sz = s * (0.18 + 0.1 * sit - raise * 0.25 + clap * -0.1 + (P.stretch || 0) * 0.35 + (P.strain || 0) * 0.25);
        const sy = s * (clap * 0.7 + grab * 0.15);
        let el = 0.35 + sit * 0.55 + raise * 0.6 - slam * 0.3 + grab * 0.5 + clap * 0.2 - (P.stretch || 0) * 0.2, ha = -0.1 + grab * 0.6 + slam * 0.3, hz = s * clap * 0.6;
        // поступок (DiabolosActs): углы рук напрямую — плавно поверх обычной позы (P.actW — вес поступка)
        const rot = A.rot, w = rot ? (P.actW ?? 1) : 0;
        if (w > 0) {
            sx += ((rot.sx ?? sx) - sx) * w;
            sz += (s * (rot.ab ?? 0.18) - sz) * w;
            el += ((rot.el ?? el) - el) * w;
            ha += ((rot.ha ?? ha) - ha) * w;
        }
        B['sh' + sd].rotation.set(sx, sy + (rot ? s * (rot.tw || 0) * w : 0), sz + s * shr * 0.12);
        B['el' + sd].rotation.set(el, 0, s * 0.05);
        B['wr' + sd].rotation.set(0, 0, 0);
        B['ha' + sd].rotation.set(ha, hz, 0);
        B['ha' + sd].scale.setScalar(1);
    }
    // ноги: копыта на земле. Стоя — под бёдрами, шаг — дуга; сидя — вперёд, колени вверх
    for (const sd of ['L', 'R']) {
        const fe = JOINTS['fe' + sd], s = sd === 'L' ? 0 : Math.PI;
        const p = ph + s;
        const stride = walk * 0.42, lift = walk * 0.18 * Math.max(0, Math.sin(p));
        const tz = fe[2] - Math.cos(p) * stride * (1 - sit) - sit * 0.95 - (P.strain || 0) * (sd === 'L' ? -0.25 : 0.2);
        const tx = fe[0] * (1 + sit * 0.35);
        const ty = fe[1] + lift * (1 - sit) + (P.stomp && sd === 'R' ? P.stomp * 0.7 : 0);
        B['th' + sd].rotation.order = 'XYZ';
        legIK(B, sd, tx, ty, tz, hipsPitch);
        B['th' + sd].rotation.z = (sd === 'L' ? -1 : 1) * (0.06 + sit * 0.22);
    }
    // хвост: качается, сидя — лежит на земле
    const tl = 1 + (P.tail || 0) * 3; // (поступок: хвост хлещет)
    B.tail.rotation.set(-0.7 * sit + Math.sin(t * 0.8) * 0.12, Math.sin(t * 0.6 * tl) * 0.25 * tl * (1 - sl * 0.7 * (P.tail ? 0 : 1)), 0);
    B.tail2.rotation.set(0.2 + Math.sin(t * 0.8 + 0.6) * 0.15, Math.sin(t * 0.6 + 0.5) * 0.3, 0);
    B.tail3.rotation.set(Math.sin(t * 0.8 + 1.2) * 0.2, 0, 0);
}

/** Мировая точка ушка кандалов на левом копыте (после позы и updateMatrixWorld модели). */
export function eyeletWorld(model, out) {
    const fe = model.userData.bones.feL, j = JOINTS.feL;
    return out.set(EYELET[0] - j[0], EYELET[1] - j[1], EYELET[2] + 0.06 - j[2]).applyMatrix4(fe.matrixWorld);
}
/** Мировая точка пасти (огонь, шары). */
export function mouthWorld(model, out) {
    const m = model.userData.bones.maw;
    return out.set(0, -0.02, -0.12).applyMatrix4(m.matrixWorld);
}
/** Мировая точка кулака. */
export function fistWorld(model, sd, out) {
    return out.set(0, -0.3, -0.08).applyMatrix4(model.userData.bones['ha' + sd].matrixWorld);
}
/** Мировая точка копыта. */
export function hoofWorld(model, sd, out) { return out.set(0, -0.1, -0.06).applyMatrix4(model.userData.bones['fe' + sd].matrixWorld); }

export const DIABOLOS_BONES = ORDER;
