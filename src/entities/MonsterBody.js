/**
 * MonsterBody.js — тело героя в форме страшного монстра («Пентаграмма страшного монстра», MonsterForm.js).
 *
 * Слова автора: «накачанный монстр, немного похожий на Халка, но не чёрный, скорее как волкодав». Это НЕ отдельное
 * существо: та же модель героя (те же кости — торс, голова на шее, плечи, локти, ладони с пальцами, ноги), только
 * тело на костях другое — бочка грудной клетки, грудные мышцы и кубики пресса, широчайшие, горб трапеций и толстая
 * шея, бицепсы и трицепсы, предплечья в жилах; голова волкодава (длинная морда, тяжёлая челюсть с клыками, нос, торчащие
 * уши, надбровья, горящие янтарные глаза); жёсткая шерсть серо-рыжая на груди и тёмно-бурая по спине, грива по
 * хребту, клочья на предплечьях и икрах; обрывки штанов героя на бёдрах; ладони — тёмная кожа, на пальцах — когти.
 * Руки — те же руки игрока (пальцы следуют камере), всё тело ×7 — масштабом группы героя (MonsterTransform).
 *
 * Дёшево: все части одной кости — одна форма (mergeParts), формы общие для всех монстров (свои и чужие игроки),
 * один материал с вершинными цветами и текстурой шерсти (DataTexture в кэше), глаза — один MeshBasic на обе.
 * Отрисовок: торс, голова, челюсть, глаза, 2 плеча, 2 предплечья, 2 ноги = 10; части героя на это время скрыты
 * (их столько же) — рисуется не больше, чем обычно.
 */

import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { sweep, keys, hideTexture } from '../game/AnimalModels.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
/** Угловое расстояние (рад, со знаком) — кольца sweep идут от −π/2 до 3π/2. */
const ad = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const g1 = (x, w) => Math.exp(-(x * x) / (2 * w * w));
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// окрас волкодава: тёмно-бурая спина, серо-рыжие грудь и бока, светлее на брюхе
const BACK = [0.43, 0.31, 0.22], SIDE = [0.62, 0.48, 0.36], CHEST = [0.74, 0.65, 0.56], MUZZLE = [0.3, 0.24, 0.2];
const CLOTH = [0.27, 0.29, 0.37], HORN = [0.16, 0.13, 0.11], IVORY = [0.93, 0.88, 0.72], GUM = [0.42, 0.12, 0.12];
/** Жёсткая шерсть: клочья по поверхности (детерминированно — у всех монстров одна форма). */
const shag = (t, ang, a = 1) => 0.03 * a * Math.sin(t * 47 + ang * 5) * Math.sin(ang * 13 - t * 21) + 0.012 * a * Math.sin(t * 131 + ang * 29);

/** Цвет атрибутом на всю форму (для конусов-клочьев, когтей, шаров). */
function colored(geo, rgb, shade = null) {
    const g = geo;
    const P = g.getAttribute('position'), c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const k = shade ? shade(P.getX(i), P.getY(i), P.getZ(i)) : 1;
        c[i * 3] = rgb[0] * k; c[i * 3 + 1] = rgb[1] * k; c[i * 3 + 2] = rgb[2] * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.count * 2), 2));
    return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Матрица: из точки `at` в направлении `dir` (ось Y формы смотрит туда), масштаб `sc`. */
function aim(at, dir, sc = [1, 1, 1]) {
    _q.setFromUnitVectors(_up, dir.clone().normalize());
    return new THREE.Matrix4().compose(at, _q, _s.set(sc[0], sc[1], sc[2]));
}
/** Клок шерсти: конус основанием в начале, острием по +Y. */
let _tuft = null;
const tuftGeo = () => _tuft || (_tuft = new THREE.CylinderGeometry(0, 1, 1, 5, 1).translate(0, 0.5, 0));
/** Коготь: изогнутый рог (сужается и загибается к −Z — к ладони). */
let _claw = null;
function clawGeo() {
    if (_claw) return _claw;
    const pts = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push(v3(0, u * 0.13, -0.05 * u * u)); }
    _claw = colored(sweep(pts, (t) => [0.03 * (1 - t * 0.85), 0.034 * (1 - t * 0.85), 0], { rings: 5, sides: 6, uv: [1, 1] }), HORN, (x, y) => 0.8 + 1.4 * y);
    _claw.userData.keep = true;
    return _claw;
}

// ------------------------------------------------------------------ формы (по одной на кость, общие)
let _parts = null;
export function monsterParts() {
    if (_parts) return _parts;
    const P = {};
    // === торс (пространство torso: начало в group y 0,75; герой смотрит в −Z)
    {
        const prof = keys([[0, 0.8, 0.56, 0], [0.18, 0.7, 0.5, 0], [0.42, 0.88, 0.6, 0], [0.66, 1.0, 0.7, -0.02], [0.84, 0.98, 0.62, 0.03], [0.94, 0.78, 0.55, 0.06], [1, 0.56, 0.48, 0.06]]);
        const F = -Math.PI / 2, B = Math.PI / 2; // перед (−Z), спина (+Z)
        const bump = (t, ang) => {
            const f = ad(ang, F), b = ad(ang, B);
            let k = 0;
            k += 0.09 * g1(t - 0.74, 0.07) * (g1(f + 0.5, 0.33) + g1(f - 0.5, 0.33)); // грудные
            k -= 0.03 * g1(t - 0.72, 0.1) * g1(f, 0.1);                            // ложбина между ними
            if (t > 0.2 && t < 0.56) k += 0.032 * Math.max(0, Math.sin((t - 0.2) / 0.36 * Math.PI * 3)) * (g1(f + 0.21, 0.16) + g1(f - 0.21, 0.16)); // пресс
            k -= 0.02 * g1(f, 0.06) * (t > 0.2 && t < 0.6 ? 1 : 0);                 // белая линия
            k += 0.06 * g1(t - 0.56, 0.12) * (g1(ad(ang, 0.3), 0.45) + g1(ad(ang, Math.PI - 0.3), 0.45)); // широчайшие
            k += 0.08 * g1(t - 0.9, 0.07) * g1(b, 0.8);                             // горб трапеций
            k -= 0.03 * g1(b, 0.09) * (t > 0.2 ? 1 : 0);                            // ложбина хребта
            return 1 + k + shag(t, ang, Math.sin(ang) > -0.3 ? 1.2 : 0.5);
        };
        const color = (t, ang) => {
            const f = ad(ang, F), front = g1(f, 1.0);
            let c = mix(mix(SIDE, BACK, g1(ad(ang, B), 1.0)), CHEST, front);
            c = mul(c, 0.9 + 0.12 * Math.sin(t * 61 + ang * 9) * Math.sin(ang * 17));
            // тени между мышцами (швы кожи под шерстью): грудь, пресс, хребет
            const groove = 0.22 * g1(f, 0.07) * (t > 0.2 && t < 0.78 ? 1 : 0) + 0.18 * g1(t - 0.64, 0.025) * g1(f, 0.9) + 0.2 * g1(ad(ang, B), 0.09);
            c = mul(c, 1 - groove);
            // обрывки штанов героя на поясе: рваный край
            const edge = 0.1 + 0.05 * Math.sin(ang * 7) + 0.03 * Math.sin(ang * 19);
            if (t < edge) c = mul(CLOTH, 0.85 + 0.15 * Math.sin(ang * 23 + t * 40));
            return c;
        };
        const body = sweep([v3(0, -1.02, 0.05), v3(0, -0.3, 0), v3(0, 0.4, 0.02), v3(0, 0.95, 0.12)], prof, { rings: 24, sides: 24, color, bump, uv: [3, 3] });
        const neck = sweep([v3(0, 0.78, 0.12), v3(0, 1.12, -0.02), v3(0, 1.42, -0.2)], keys([[0, 0.66, 0.58, 0], [0.5, 0.56, 0.5, 0], [1, 0.46, 0.42, 0]]), {
            rings: 8, sides: 16, uv: [1, 3],
            bump: (t, ang) => 1 + 0.06 * g1(ad(ang, Math.PI / 2), 0.7) + shag(t, ang, 1.4),
            color: (t, ang) => mix(BACK, CHEST, g1(ad(ang, -Math.PI / 2), 0.9) * 0.9),
        });
        const parts = [{ geo: body }, { geo: neck }];
        // грива по хребту и загривку, клочья на плечах
        for (let i = 0; i < 18; i++) {
            const u = i / 17, y = 1.32 - u * 1.2, z = 0.45 + 0.22 * Math.sin(u * Math.PI) - 0.1 * (1 - u), x = 0.12 * Math.sin(i * 2.4);
            const len = 0.42 - 0.22 * u + 0.06 * Math.sin(i * 1.7), r = 0.1 + 0.03 * Math.sin(i * 3.1);
            parts.push({ geo: colored(tuftGeo().clone(), mul(BACK, 0.75 + 0.15 * Math.sin(i))), matrix: aim(v3(x, y, z), v3(x * 0.6, -0.35 - 0.3 * u, 1), [r * 1.5, len * 0.75, r * 0.6]) });
        }
        for (const s of [1, -1]) for (let i = 0; i < 6; i++) {
            const a = i / 5;
            parts.push({ geo: colored(tuftGeo().clone(), mul(SIDE, 0.85)), matrix: aim(v3(s * (0.55 + 0.35 * a), 0.92 - 0.1 * a, 0.15), v3(s * 0.8, -0.2, 0.5), [0.12, 0.2, 0.05]) });
        }
        P.torso = mergeParts(parts);
        for (const g of [body, neck]) g.dispose();
    }
    // === голова волкодава (пространство головы героя: центр головы; глаза героя ≈ (0; 0,05; −0,3))
    {
        const skull = sweep([v3(0, 0.12, 0.48), v3(0, 0.12, 0.02), v3(0, 0.02, -0.55), v3(0, -0.08, -1.08)], keys([[0, 0.44, 0.48, 0], [0.25, 0.55, 0.56, 0.02], [0.5, 0.42, 0.4, -0.04], [0.78, 0.29, 0.27, -0.07], [1, 0.21, 0.19, -0.07]]), {
            rings: 20, sides: 18, uv: [2, 2],
            bump: (t, ang) => {
                const top = ad(ang, Math.PI / 2), bot = ad(ang, -Math.PI / 2);
                let k = 0.14 * g1(t - 0.42, 0.06) * (g1(top + 0.55, 0.3) + g1(top - 0.55, 0.3)); // надбровья
                k += 0.06 * g1(t - 0.18, 0.12) * g1(top, 0.5);                                    // затылочный гребень
                k -= 0.2 * g1(bot, 0.7) * (t > 0.45 ? 1 : 0);                                     // низ морды — под челюсть
                k += 0.08 * g1(t - 0.3, 0.12) * (g1(ad(ang, 0), 0.5) + g1(ad(ang, Math.PI), 0.5)); // скулы
                return 1 + k + shag(t, ang, t < 0.4 ? 1.3 : 0.4);
            },
            color: (t, ang) => {
                let c = mix(mix(SIDE, BACK, g1(ad(ang, Math.PI / 2), 0.7) * 0.7), MUZZLE, Math.min(1, Math.max(0, (t - 0.55) / 0.4)));
                c = mul(c, 0.92 + 0.1 * Math.sin(t * 53 + ang * 11));
                c = mul(c, 1 - 0.3 * g1(t - 0.47, 0.03) * g1(ad(ang, Math.PI / 2), 0.5)); // складка над глазами
                return c;
            },
        });
        const parts = [{ geo: skull }];
        parts.push({ geo: colored(new THREE.SphereGeometry(1, 10, 7), [0.07, 0.06, 0.06], (x, y) => 0.8 + 0.5 * y), matrix: new THREE.Matrix4().compose(v3(0, -0.02, -1.12), _q.identity(), v3(0.15, 0.1, 0.1)) }); // нос
        for (const s of [1, -1]) {
            // уши — торчком, назад и в стороны; внутри темнее
            parts.push({ geo: colored(new THREE.CylinderGeometry(0, 1, 1, 4, 1).translate(0, 0.5, 0), BACK, (x, y, z) => (z > 0 ? 1 : 0.55)), matrix: aim(v3(s * 0.36, 0.48, 0.22), v3(s * 0.45, 1, 0.35), [0.2, 0.62, 0.08]) });
            // верхние клыки и ряд зубов
            parts.push({ geo: colored(new THREE.CylinderGeometry(0, 1, 1, 5, 1).translate(0, 0.5, 0), IVORY, (x, y) => 0.8 + 0.25 * y), matrix: aim(v3(s * 0.16, -0.17, -0.92), v3(0, -1, -0.12), [0.05, 0.26, 0.05]) });
            for (let i = 0; i < 4; i++) parts.push({ geo: colored(new THREE.CylinderGeometry(0, 1, 1, 4, 1).translate(0, 0.5, 0), IVORY), matrix: aim(v3(s * (0.2 - i * 0.012), -0.15, -0.8 + i * 0.13), v3(0, -1, 0), [0.03, 0.09, 0.03]) });
            // брыли и бакенбарды — клочья
            for (let i = 0; i < 5; i++) parts.push({ geo: colored(tuftGeo().clone(), mul(SIDE, 0.9 + 0.05 * i)), matrix: aim(v3(s * 0.48, -0.15 + i * 0.08, 0.05 + i * 0.05), v3(s * 0.7, -0.45, 0.7), [0.12, 0.24, 0.05]) });
        }
        P.head = mergeParts(parts);
        skull.dispose();
        // челюсть (своя кость: открывается в рёве); пасть внутри — тёмно-красная
        const jaw = sweep([v3(0, 0, 0.05), v3(0, -0.06, -0.45), v3(0, -0.04, -0.82)], keys([[0, 0.34, 0.16, 0], [0.5, 0.27, 0.13, 0], [1, 0.17, 0.09, 0]]), {
            rings: 10, sides: 12, uv: [1, 1],
            bump: (t, ang) => 1 + shag(t, ang, 0.5),
            color: (t, ang) => (Math.sin(ang) > 0.55 ? GUM : mul(mix(SIDE, MUZZLE, t), 0.9 + 0.1 * Math.sin(t * 40 + ang * 7))),
        });
        const jp = [{ geo: jaw }];
        for (const s of [1, -1]) {
            jp.push({ geo: colored(new THREE.CylinderGeometry(0, 1, 1, 5, 1).translate(0, 0.5, 0), IVORY), matrix: aim(v3(s * 0.12, 0.06, -0.74), v3(0, 1, -0.1), [0.045, 0.2, 0.045]) });
            for (let i = 0; i < 3; i++) jp.push({ geo: colored(new THREE.CylinderGeometry(0, 1, 1, 4, 1).translate(0, 0.5, 0), IVORY), matrix: aim(v3(s * (0.16 - i * 0.01), 0.06, -0.6 + i * 0.14), v3(0, 1, 0), [0.025, 0.07, 0.025]) });
        }
        P.jaw = mergeParts(jp);
        jaw.dispose();
        P.eyes = mergeParts([-1, 1].map((s) => ({ geo: colored(new THREE.SphereGeometry(1, 8, 6), [1, 1, 1]), matrix: new THREE.Matrix4().compose(v3(s * 0.27, 0.12, -0.5), _q.identity(), v3(0.08, 0.06, 0.06)) })));
    }
    // === плечо (пространство кости: от плечевого сустава по +Z к локтю, 1,0)
    {
        const arm = sweep([v3(0, 0, -0.05), v3(0, 0, 0.5), v3(0, 0, 1.02)], keys([[0, 0.44, 0.44], [0.2, 0.4, 0.42], [0.5, 0.42, 0.47], [0.8, 0.33, 0.36], [1, 0.3, 0.31]]), {
            rings: 14, sides: 16, uv: [1, 2],
            bump: (t, ang) => 1 + 0.13 * g1(t - 0.5, 0.15) * g1(ad(ang, Math.PI / 2), 0.6) + 0.07 * g1(t - 0.35, 0.2) * g1(ad(ang, -Math.PI / 2), 0.7) + shag(t, ang, 0.9),
            color: (t, ang) => mul(mix(SIDE, BACK, g1(ad(ang, -Math.PI / 2), 0.9) * 0.6), (0.92 + 0.1 * Math.sin(t * 44 + ang * 9)) * (1 - 0.15 * g1(t - 0.72, 0.04))),
        });
        const delt = colored(new THREE.SphereGeometry(1, 14, 10), SIDE, (x, y, z) => 0.85 + 0.15 * y + 0.04 * Math.sin(x * 31 + z * 23));
        P.upper = mergeParts([{ geo: arm }, { geo: delt, matrix: new THREE.Matrix4().compose(v3(0, 0.06, 0.08), _q.identity(), v3(0.56, 0.5, 0.58)) }]);
        arm.dispose(); delt.dispose();
    }
    // === предплечье (от локтя по +Z к запястью, 0,9): жилы, клочья по наружной стороне, манжета шерсти у запястья
    {
        const fore = sweep([v3(0, 0, -0.08), v3(0, 0, 0.45), v3(0, 0, 0.88)], keys([[0, 0.34, 0.36], [0.3, 0.39, 0.37], [0.75, 0.3, 0.28], [1, 0.26, 0.24]]), {
            rings: 12, sides: 14, uv: [1, 2],
            bump: (t, ang) => 1 + 0.05 * g1(t - 0.3, 0.15) * g1(ad(ang, 0.4), 0.5) + 0.018 * Math.sin(ang * 6 + t * 3) * (t > 0.3 ? 1 : 0) + shag(t, ang, 1),
            color: (t, ang) => mul(mix(SIDE, BACK, g1(ad(ang, -Math.PI / 2), 0.9) * 0.7), 0.9 + 0.1 * Math.sin(t * 50 + ang * 13)),
        });
        const parts = [{ geo: fore }];
        for (let i = 0; i < 7; i++) parts.push({ geo: colored(tuftGeo().clone(), mul(BACK, 0.85)), matrix: aim(v3(0.05 * Math.sin(i * 2), 0.3, 0.1 + i * 0.1), v3(0, 0.45, 1), [0.11, 0.2, 0.05]) });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; parts.push({ geo: colored(tuftGeo().clone(), mul(SIDE, 0.8)), matrix: aim(v3(Math.cos(a) * 0.25, Math.sin(a) * 0.24, 0.84), v3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 1), [0.08, 0.16, 0.04]) }); }
        P.fore = mergeParts(parts);
        fore.dispose();
    }
    // === нога (пространство тазобедренной кости: от 0 вниз до ступни на −1,95)
    {
        const thigh = sweep([v3(0, 0.18, 0.02), v3(0, -0.5, -0.06), v3(0, -1.0, 0)], keys([[0, 0.56, 0.56], [0.4, 0.5, 0.52], [1, 0.34, 0.36]]), {
            rings: 12, sides: 16, uv: [1, 2],
            bump: (t, ang) => 1 + 0.08 * g1(t - 0.5, 0.18) * g1(ad(ang, Math.PI / 2), 0.6) + shag(t, ang, 0.8),
            color: (t, ang) => {
                const edge = 0.42 + 0.08 * Math.sin(ang * 5) + 0.05 * Math.sin(ang * 13);
                return t < edge ? mul(CLOTH, 0.8 + 0.2 * Math.sin(ang * 21 + t * 33)) : mul(mix(SIDE, BACK, g1(ad(ang, -Math.PI / 2), 0.9) * 0.6), 0.9 + 0.1 * Math.sin(t * 40 + ang * 9));
            },
        });
        const calf = sweep([v3(0, -0.96, 0), v3(0, -1.42, 0.06), v3(0, -1.84, 0.02)], keys([[0, 0.35, 0.37], [0.35, 0.33, 0.4], [1, 0.22, 0.24]]), {
            rings: 10, sides: 14, uv: [1, 2],
            bump: (t, ang) => 1 + 0.12 * g1(t - 0.3, 0.14) * g1(ad(ang, -Math.PI / 2), 0.6) + shag(t, ang, 1.3),
            color: (t, ang) => mul(mix(SIDE, BACK, g1(ad(ang, -Math.PI / 2), 0.9) * 0.7), 0.9 + 0.1 * Math.sin(t * 40 + ang * 11)),
        });
        const foot = sweep([v3(0, -1.86, 0.28), v3(0, -1.9, -0.22), v3(0, -1.88, -0.72)], keys([[0, 0.27, 0.14], [0.5, 0.36, 0.12], [1, 0.3, 0.08]]), {
            rings: 8, sides: 12, uv: [1, 1],
            color: (t, ang) => mul(Math.sin(ang) < -0.6 ? [0.18, 0.15, 0.13] : SIDE, 0.85 + 0.1 * Math.sin(t * 30 + ang * 5)),
        });
        const knee = colored(new THREE.SphereGeometry(1, 10, 8), SIDE, (x, y) => 0.88 + 0.12 * y);
        const parts = [{ geo: thigh }, { geo: calf }, { geo: foot }, { geo: knee, matrix: new THREE.Matrix4().compose(v3(0, -1.0, -0.06), _q.identity(), v3(0.33, 0.3, 0.32)) }];
        for (let i = 0; i < 4; i++) parts.push({ geo: clawGeo().clone(), matrix: new THREE.Matrix4().compose(v3(-0.21 + i * 0.14, -1.9, -0.76), _q.setFromAxisAngle(v3(1, 0, 0), -1.45), v3(1.6, 1.6, 1.6)) });
        for (let i = 0; i < 6; i++) parts.push({ geo: colored(tuftGeo().clone(), mul(BACK, 0.8)), matrix: aim(v3(0.04 * Math.sin(i * 2.2), -1.12 - i * 0.1, 0.36), v3(0, -0.9, 0.55), [0.11, 0.2, 0.05]) });
        P.leg = mergeParts(parts);
        for (const g of [thigh, calf, foot, knee]) g.dispose();
    }
    for (const g of Object.values(P)) g.userData.keep = g.userData.shared = true;
    _parts = P;
    return P;
}

let _mats = null;
/** Один материал шерсти на всех монстров + горящие глаза. */
export function monsterMaterials() {
    if (_mats) return _mats;
    const fur = hideTexture('monster-fur', { mottle: 0.32, warm: 0.06, spots: 0, spotC: [1, 1, 1], hairs: 7000, hairLen: [3, 10], pale: 0.38 }, 66617);
    _mats = {
        fur: new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: fur }),
        eyes: new THREE.MeshBasicMaterial({ color: 0xffb02a }),
        claw: new THREE.MeshLambertMaterial({ color: 0x2a211c }),
    };
    for (const m of Object.values(_mats)) m.userData.keep = true;
    return _mats;
}

const HAND_K = 1.55; // ладони больше (запястье зверя толще): палец следует камере как всегда
const HIDE_SKIN = 0x5a4636; // тёмная кожа ладоней

/**
 * Тело монстра на костях героя `ch` (VoxelCharacter): создаётся один раз на героя, потом только включается.
 */
export class MonsterLook {
    constructor(ch) {
        this.ch = ch;
        this.on = false;
        this.beast = 0;
        this._jawOpen = 0;
        const P = monsterParts(), M = monsterMaterials();
        const mk = (geo, mat, parent, name, shadow = true) => {
            const m = new THREE.Mesh(geo, mat);
            m.name = name; m.castShadow = shadow; m.visible = false;
            parent.add(m);
            return m;
        };
        this.torso = mk(P.torso, M.fur, ch.torso, 'monster-torso');
        // голова — на торсе, там же, где голова героя, и поворачивается как она (сама голова героя скрыта целиком)
        this.headPivot = new THREE.Group();
        this.headPivot.name = 'monster-head';
        this.headPivot.visible = false;
        ch.torso.add(this.headPivot);
        this.head = mk(P.head, M.fur, this.headPivot, 'monster-skull');
        this.head.visible = true;
        this.jawPivot = new THREE.Group();
        this.jawPivot.position.set(0, -0.17, -0.12);
        this.headPivot.add(this.jawPivot);
        this.jaw = mk(P.jaw, M.fur, this.jawPivot, 'monster-jaw');
        this.jaw.visible = true;
        this.eyes = mk(P.eyes, M.eyes, this.headPivot, 'monster-eyes', false);
        this.eyes.visible = true;
        // (первое лицо: голова на слое 1, её тень — невидимой коробкой на слое 0, как у героя)
        this.headShadow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.9), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        this.headShadow.position.set(0, 0, -0.35);
        this.headShadow.castShadow = true;
        this.headShadow.name = 'monster-head-shadow';
        this.headPivot.add(this.headShadow);
        this.upper = [mk(P.upper, M.fur, ch.leftArmAnchor, 'monster-upper'), mk(P.upper, M.fur, ch.rightArmAnchor, 'monster-upper')];
        this.fore = [mk(P.fore, M.fur, ch.leftElbowAnchor, 'monster-fore'), mk(P.fore, M.fur, ch.rightElbowAnchor, 'monster-fore')];
        this.legs = [mk(P.leg, M.fur, ch.leftLegPivot, 'monster-leg'), mk(P.leg, M.fur, ch.rightLegPivot, 'monster-leg')];
        this.legs[0].position.x = -0.12; this.legs[1].position.x = 0.12; // (шире стойка: бёдра толще)
        this.legs[1].scale.x = -1; // (зеркально: когти и клочья — наружу)
        this.upper[0].scale.x = -1; this.fore[0].scale.x = -1;
        this._hidden = [];
    }

    /** Все части героя, которые на это время прячутся (тело, голова целиком, руки, ноги, одежда, доспехи). */
    _heroParts() {
        const ch = this.ch, out = [ch.body, ch.head];
        const own = (o) => o.isMesh && !String(o.name).startsWith('monster');
        for (const a of [ch.leftArmAnchor, ch.rightArmAnchor, ch.leftElbowAnchor, ch.rightElbowAnchor, ch.leftLegPivot, ch.rightLegPivot]) for (const c of a.children) if (own(c)) out.push(c);
        for (const p of [...(ch._lookParts || []), ...(ch._armorParts || [])]) if (p.parent && p.parent !== ch.head) out.push(p);
        return out;
    }

    /** Включить/выключить тело монстра. */
    setOn(on) {
        on = !!on;
        if (on === this.on) return;
        this.on = on;
        const ch = this.ch;
        if (on) {
            this._hidden = this._heroParts().filter((m) => m.visible);
            for (const m of this._hidden) m.visible = false;
            this._hands(true);
        } else {
            for (const m of this._hidden) m.visible = true;
            this._hidden = [];
            this._hands(false);
        }
        for (const m of [this.torso, ...this.upper, ...this.fore, ...this.legs]) m.visible = on;
        this.headPivot.visible = on;
        this.layers();
    }

    /** Первое лицо: своя голова не видна своей камере (слой 1), её тень — видна (как у героя). */
    layers() {
        const fpv = !!this.ch._fpv && !this.ch.remote;
        const layer = fpv ? 1 : 0;
        for (const m of [this.head, this.jaw, this.eyes]) m.layers.set(layer);
        this.headShadow.layers.set(0);
        this.headShadow.visible = fpv;
    }

    /** Ладони больше и тёмные, ногти — когти (и всё обратно). */
    _hands(on) {
        const ch = this.ch, M = monsterMaterials();
        for (const h of [ch.leftSimplifiedHand, ch.rightSimplifiedHand, ch.leftDetailedHand, ch.rightDetailedHand]) {
            if (!h?.group) continue;
            const s = h.group.scale;
            if (on) { h._monsterScale = s.clone(); s.multiplyScalar(HAND_K); } else if (h._monsterScale) { s.copy(h._monsterScale); h._monsterScale = null; }
            if (h.material?.color) {
                if (on) { h._monsterSkin = h.material.color.getHex(); h.setSkin?.(HIDE_SKIN); } else if (h._monsterSkin != null) { h.setSkin?.(h._monsterSkin); h._monsterSkin = null; }
            }
            // ногти → когти (та же отрисовка: меняется форма и материал ногтя)
            for (const f of Object.values(h.fingerMeshes || {})) {
                const tip = f[2]?.pivot;
                const nail = tip?.children.find((c) => c.isMesh && c.material === h.nailMat);
                if (!nail) continue;
                if (on) {
                    nail.userData.was = { geo: nail.geometry, mat: nail.material, y: nail.position.y, z: nail.position.z };
                    nail.geometry = clawGeo(); nail.material = M.claw;
                    nail.position.y = f[2].mesh.position.y * 1.7; nail.position.z = 0;
                } else if (nail.userData.was) {
                    const w = nail.userData.was;
                    nail.geometry = w.geo; nail.material = w.mat; nail.position.y = w.y; nail.position.z = w.z;
                    nail.userData.was = null;
                }
            }
        }
    }

    /**
     * Каждый кадр, пока тело на: голова следует голове героя, мускулы — степени превращения `beast` (0…1),
     * пасть — рёву (`roar` 0…1), дыхание (грудь ходит).
     */
    update(dt, beast = 1, roar = 0) {
        if (!this.on) return;
        const ch = this.ch;
        this.headPivot.position.copy(ch.head.position);
        this.headPivot.quaternion.copy(ch.head.quaternion);
        this._jawOpen += (Math.max(roar, 0.06) - this._jawOpen) * Math.min(1, dt * 10);
        this.jawPivot.rotation.x = -this._jawOpen * 0.55; // (вниз: перед челюсти опускается)
        this.beast = beast;
        const t = performance.now() / 1000;
        const breath = 1 + 0.025 * Math.sin(t * 1.6);
        const k = 0.55 + 0.45 * beast; // мускулы наливаются
        this.torso.scale.set(k * breath, 0.85 + 0.15 * beast, k * breath);
        for (let i = 0; i < 2; i++) {
            const sx = i === 0 ? -1 : 1;
            this.upper[i].scale.set(sx * k, k, 1);
            this.fore[i].scale.set(sx * k, k, 1);
            this.legs[i].scale.set((i === 1 ? -1 : 1) * k, 1, k);
        }
        this.headPivot.scale.setScalar(0.75 + 0.25 * beast);
    }

    dispose() {
        this.setOn(false);
        for (const m of [this.torso, ...this.upper, ...this.fore, ...this.legs]) m.parent?.remove(m);
        this.headPivot.parent?.remove(this.headPivot);
        this.headShadow.geometry.dispose();
        this.headShadow.material.dispose();
    }
}

/** (Game.prewarm) Шейдеры монстра собираются на загрузке: образец каждого материала. */
export function monsterSamples() {
    const P = monsterParts(), M = monsterMaterials(), g = new THREE.Group();
    g.add(new THREE.Mesh(P.torso, M.fur), new THREE.Mesh(P.eyes, M.eyes), new THREE.Mesh(clawGeo(), M.claw));
    return g;
}
