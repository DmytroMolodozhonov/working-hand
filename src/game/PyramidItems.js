/**
 * PyramidItems.js — the pyramids' gold (Pharaoh Sandy, Pyramids.js): small jewels that go into a pocket or a backpack and sell for good money (a scarab,
 * an ankh, a bracelet, a necklace) and two big treasures that are carried in the hands (a golden mask, a golden cat idol — a pocket is too small for them).
 * The models are in the gate's spirit (docs/rules/texture-style.md): beaten gold with inlay of lapis, turquoise and carnelian, many small parts, shared shapes.
 */
import * as THREE from 'three';

export const JEWEL_SMALL = ['goldScarab', 'goldAnkh', 'goldBracelet', 'goldNecklace'];
export const JEWEL_BIG = ['goldMask', 'goldIdol'];
export const isJewel = (k) => JEWEL_SMALL.includes(k) || JEWEL_BIG.includes(k);
export const JEWEL_INFO = {
    goldScarab: { name: 'Золотой скарабей', icon: '🪲', weight: 0.3, stack: 6 },
    goldAnkh: { name: 'Золотой анкх', icon: '☥', weight: 0.35, stack: 6 },
    goldBracelet: { name: 'Золотой браслет', icon: '📿', weight: 0.4, stack: 6 },
    goldNecklace: { name: 'Золотое ожерелье', icon: '📿', weight: 0.5, stack: 6 },
    goldMask: { name: 'Золотая маска', icon: '🎭', weight: 5 },
    goldIdol: { name: 'Золотой идол-кошка', icon: '🐈', weight: 5 },
};
/** What a merchant pays for a piece (pure gold: «за хорошие деньги»). */
export const JEWEL_VALUE = { goldScarab: 90, goldAnkh: 120, goldBracelet: 150, goldNecklace: 175, goldMask: 900, goldIdol: 750 };
export const jewelText = (k) => ({
    goldScarab: 'Скарабей из чистого золота с синим камнем на спинке. Купцы платят за такой хорошие деньги',
    goldAnkh: 'Золотой знак жизни с бирюзой. Чистое золото — купец оценит',
    goldBracelet: 'Тяжёлый золотой браслет с лазуритом и сердоликом',
    goldNecklace: 'Ожерелье из золотых бусин с маленьким скарабеем. Дорогая вещь',
    goldMask: 'Большая золотая маска с полосатым убором. В карман не влезет — заведите руку с ней за плечо',
    goldIdol: 'Золотая кошка — священный зверь древних. Тяжёлая; в карман не влезет, несите в руках',
}[k] || '');

const _g = {};
const _m = {};
const shared = (o) => { o.userData = { ...(o.userData || {}), shared: true, keep: true }; return o; };
const geo = (k, make) => _g[k] || (_g[k] = shared(make()));
const gold = () => _m.gold || (_m.gold = shared(new THREE.MeshStandardMaterial({ color: 0xffd45a, roughness: 0.26, metalness: 0.85, emissive: 0x5a3a00, emissiveIntensity: 0.5 })));
const stone = (c) => _m['s' + c] || (_m['s' + c] = shared(new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.1, emissive: c, emissiveIntensity: 0.18 })));
const LAPIS = 0x2a4fd0, TURQ = 0x2aa89a, CARN = 0xc03a2a;
const add = (g, geoo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geoo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
const SPH = () => geo('jSph', () => new THREE.SphereGeometry(1, 12, 9));
const BOX = () => geo('jBox', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo('jCyl', () => new THREE.CylinderGeometry(1, 1, 1, 10));
const CONE = () => geo('jCone', () => new THREE.ConeGeometry(1, 1, 8));
const TOR = (r, t) => geo(`jTor${r}_${t}`, () => new THREE.TorusGeometry(r, t, 8, 24));

export function jewelModel(kind) {
    const g = new THREE.Group();
    g.name = kind;
    switch (kind) {
        case 'goldScarab': {
            add(g, SPH(), gold(), 0, 0, 0, 0.1, 0.055, 0.14); // the shell
            add(g, SPH(), gold(), 0, 0.008, -0.14, 0.05, 0.04, 0.04); // the head
            add(g, BOX(), stone(0x7a5a10), 0, 0.054, 0.0, 0.004, 0.004, 0.26); // the shell's seam
            add(g, SPH(), stone(LAPIS), 0, 0.058, 0.02, 0.035, 0.014, 0.05); // the stone on its back
            for (const s of [-1, 1]) for (const z of [-0.06, 0.0, 0.07]) add(g, CYL(), gold(), s * 0.1, -0.02, z, 0.008, 0.07, 0.008, 0, 0, s * 1.0);
            for (const s of [-1, 1]) add(g, SPH(), stone(CARN), s * 0.02, 0.02, -0.17, 0.011, 0.011, 0.011);
            break;
        }
        case 'goldAnkh': {
            add(g, TOR(0.07, 0.016), gold(), 0, 0.1, 0, 1, 1.25, 1);
            add(g, BOX(), gold(), 0, -0.04, 0, 0.034, 0.22, 0.026);
            add(g, BOX(), gold(), 0, 0.02, 0, 0.17, 0.034, 0.026);
            add(g, SPH(), stone(TURQ), 0, 0.02, 0.016, 0.016, 0.016, 0.01);
            add(g, SPH(), stone(LAPIS), 0, -0.1, 0.016, 0.013, 0.013, 0.01);
            break;
        }
        case 'goldBracelet': {
            add(g, TOR(0.085, 0.022), gold(), 0, 0, 0, 1, 1, 1.4, Math.PI / 2, 0, 0);
            for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; add(g, SPH(), stone(i % 2 ? CARN : LAPIS), Math.sin(a) * 0.085, 0, -Math.cos(a) * 0.085 - 0.002, 0.02, 0.02, 0.016); }
            break;
        }
        case 'goldNecklace': {
            for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; add(g, SPH(), i % 3 === 0 ? stone(TURQ) : gold(), Math.cos(a) * 0.1, 0.0, Math.sin(a) * 0.1 * 1.15, 0.016, 0.016, 0.016); }
            add(g, SPH(), gold(), 0, 0, 0.125, 0.034, 0.022, 0.044);
            add(g, SPH(), stone(LAPIS), 0, 0.016, 0.125, 0.016, 0.01, 0.022);
            break;
        }
        case 'goldMask': {
            add(g, SPH(), gold(), 0, 0, 0, 0.17, 0.22, 0.12); // the face
            for (const s of [-1, 1]) {
                add(g, SPH(), stone(0x0a0a10), s * 0.065, 0.045, -0.1, 0.03, 0.016, 0.01);
                add(g, SPH(), stone(LAPIS), s * 0.065, 0.045, -0.108, 0.016, 0.008, 0.006);
                add(g, BOX(), stone(0x0a0a10), s * 0.075, 0.075, -0.108, 0.05, 0.008, 0.006, 0, 0, s * 0.2);
            }
            add(g, BOX(), gold(), 0, -0.02, -0.115, 0.016, 0.07, 0.02); // the nose
            add(g, BOX(), stone(CARN), 0, -0.1, -0.1, 0.05, 0.012, 0.01); // the lips
            // the nemes: lapis and gold stripes over the head and down each side, a cobra on the brow, the braided beard
            for (let i = 0; i < 9; i++) { const c = i % 2 ? gold() : stone(LAPIS); add(g, BOX(), c, -0.16 + i * 0.04, 0.17, -0.02, 0.04, 0.05, 0.2, 0.2, 0, 0); }
            for (const s of [-1, 1]) for (let i = 0; i < 6; i++) add(g, BOX(), i % 2 ? gold() : stone(LAPIS), s * 0.22, -0.03 - i * 0.05, -0.02, 0.05, 0.05, 0.12);
            add(g, CONE(), gold(), 0, 0.23, -0.12, 0.016, 0.07, 0.016);
            add(g, BOX(), stone(LAPIS), 0, -0.22, -0.09, 0.04, 0.12, 0.03);
            break;
        }
        case 'goldIdol': {
            add(g, CYL(), gold(), 0, 0.0, 0, 0.1, 0.22, 0.1); // the seated body
            add(g, SPH(), gold(), 0, 0.2, -0.01, 0.085, 0.08, 0.085); // the head
            for (const s of [-1, 1]) { add(g, CONE(), gold(), s * 0.055, 0.3, -0.01, 0.026, 0.09, 0.02); add(g, SPH(), stone(TURQ), s * 0.034, 0.21, -0.085, 0.014, 0.01, 0.006); }
            add(g, BOX(), stone(LAPIS), 0, 0.1, -0.095, 0.1, 0.022, 0.014); // a collar
            add(g, CONE(), gold(), 0.06, -0.02, 0.07, 0.034, 0.16, 0.034, 0.9, 0, 0); // the tail curled round
            add(g, BOX(), gold(), 0, -0.13, 0, 0.14, 0.03, 0.14); // the plinth
            break;
        }
        default: break;
    }
    return g;
}
const BIG_SCALE = { goldMask: 1.5, goldIdol: 1.4 };
/** The model scaled as the hand holds it. */
export function jewelModelScaled(kind) { const m = jewelModel(kind); const s = BIG_SCALE[kind] || 1.3; m.scale.setScalar(s); return m; }
