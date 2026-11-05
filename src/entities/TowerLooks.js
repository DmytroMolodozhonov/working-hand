/**
 * TowerLooks.js — a PREVIEW (not connected): the wizard TOWER's people, TEXTURED (the author: «ты опять текстуры не используешь»): five uniforms for the students and three looks
 * for the Head of the tower, on the hero's model. Same method as MageOutfits.js — rounded prisms wrapping the box limbs, woven wool, velvet, fur, leather and gold thread drawn on canvases.
 * A tower needs ONE uniform type: pick one of the five; all the students then wear it (rank = stripes on the cuffs).
 */

import * as THREE from 'three';
import { woolTex, velvetTex, leatherTex, threadTex } from './MageRobeLook.js';
import { D, robe, hat, skyTex, furTex } from './MageOutfits.js';

export const STUDENT_KINDS = ['u1', 'u2', 'u3', 'u4', 'u5'];
export const MASTER_KINDS = ['m1', 'm2', 'm3'];
export const TOWER_RU = {
    u1: 'Академическая мантия', u2: 'Жилет и школьная роба', u3: 'Плащ-накидка', u4: 'Кафтан на пуговицах', u5: 'Рабочая роба с фартуком',
    m1: 'Верховный маг', m2: 'Белый мудрец', m3: 'Звёздный владыка',
};
const GOLD = () => ({ color: 0xe0b43c, metalness: 0.8, roughness: 0.32 });

const L = {
    u1(d) { // an academic robe: a white yoke and collar, a house crest on the chest, a pointed blue hat
        const r = robe(d, { color: 0x24408a, trim: 0xe8e8f4, motif: 'star', layers: 5, hem: -2.1, flare: 0.5, bell: 0.4 });
        const T = d.ch.torso, white = d.lam(0xeeeef6, woolTex()), g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 });
        d.rb(T, white, 1.56, 0.4, 1.12, 0, 0.74, 0); d.rb(T, white, 0.62, 0.18, 0.5, 0, 0.98, -0.1);
        d.rb(T, d.lam(0xeeeef6, woolTex()), 0.46, 0.52, 0.06, 0.3, 0.2, -0.52); d.rb(T, d.lam(0x24408a, velvetTex()), 0.34, 0.4, 0.07, 0.3, 0.2, -0.55); d.bx(T, g, 0.14, 0.14, 0.06, 0.3, 0.2, -0.6, 0, 0, Math.PI / 4);
        hat(d, { color: 0x1c3070, trim: 0x14143a, motif: 'star', brim: 2.2, high: 2.4, bend: 0.4 });
    },
    u2(d) { // a school robe: white shirt, black velvet vest, red tie, pleated knee-length robe, an academic cap with a tassel
        const r = robe(d, { color: 0x2a2e3a, trim: 0xb02a30, motif: 'star', layers: 4, hem: -1.9, flare: 0.35, bell: 0 });
        const T = d.ch.torso, shirt = d.lam(0xf2efe6, woolTex()), vest = d.lam(0x16181e, velvetTex()), tie = d.lam(0xb02a30, velvetTex()), g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 });
        d.rb(T, shirt, 1.5, 1.2, 1.04, 0, 0.2, 0); d.rb(T, shirt, 0.9, 0.3, 0.8, 0, 0.84, 0); d.bx(T, shirt, 0.3, 0.2, 0.08, -0.22, 0.74, -0.52, 0.4, 0, 0.5); d.bx(T, shirt, 0.3, 0.2, 0.08, 0.22, 0.74, -0.52, 0.4, 0, -0.5);
        for (const sx of [-1, 1]) d.rb(T, vest, 0.5, 1.15, 0.1, sx * 0.4, 0.1, -0.52);
        d.bx(T, tie, 0.18, 1.0, 0.07, 0, 0.1, -0.58); d.bx(T, tie, 0.22, 0.2, 0.08, 0, 0.66, -0.56); for (const y of [0.36, 0.02, -0.28]) d.ball(T, g, 0.045, 0.5, y, -0.56);
        const board = d.lam(0x1a1c24, woolTex()), H = d.ch.head;
        d.rb(H, board, 1.42, 0.34, 1.42, 0, 0.82, 0); d.rb(H, board, 2.1, 0.1, 2.1, 0, 1.06, 0); d.ball(H, g, 0.1, 0, 1.14, 0); d.bx(H, tie, 0.06, 0.6, 0.06, 0.9, 0.78, 0); d.ball(H, tie, 0.1, 0.9, 0.46, 0);
    },
    u3(d) { // a capelet over a tunic: a green wool cape to the elbows with a leaf trim, a wooden clasp, a green pointed hat
        const r = robe(d, { color: 0x6a4a2a, trim: 0x2a4a2a, motif: 'leaf', layers: 5, hem: -2.0, flare: 0.45, bell: 0.2 });
        const T = d.ch.torso, cape = d.lam(0x3f6b3a, woolTex()), th = d.lam(0xffffff, threadTex('leaf'), { alphaTest: 0.4, transparent: true }), wood = d.lam(0x8a6a3a, leatherTex());
        d.rb(T, cape, 1.9, 0.8, 1.3, 0, 0.5, 0.02); d.rb(T, d.lam(0x2a4a2a, velvetTex()), 1.94, 0.14, 1.34, 0, 0.12, 0.02);
        d.bx(T, th, 1.9, 0.14, 0.02, 0, 0.12, -0.67); d.ball(T, wood, 0.12, 0, 0.8, -0.62); d.rb(T, wood, 0.1, 0.5, 0.1, 0.5, -0.84, -0.52, 0, 0, 0.1);
        hat(d, { color: 0x2f5a2f, trim: 0x2a4a2a, motif: 'leaf', brim: 2.1, high: 2.3, bend: 0.5 });
    },
    u4(d) { // a double-breasted velvet coat: two rows of gold buttons, a stand collar, gold shoulder tabs, a soft beret
        const r = robe(d, { color: 0x4a2a7a, trim: 0xe0b43c, motif: 'star', layers: 5, hem: -2.15, flare: 0.4, bell: 0.2, map: velvetTex() });
        const T = d.ch.torso, g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 }), vel = d.lam(0x3a1f66, velvetTex());
        d.rb(T, vel, 1.0, 0.36, 0.9, 0, 0.84, 0); for (const sx of [-1, 1]) for (const y of [0.5, 0.2, -0.1, -0.4]) d.ball(T, g, 0.06, sx * 0.24, y, -0.54);
        d.bx(T, d.lam(0x2a1450, velvetTex()), 0.06, 1.5, 0.04, 0, 0.04, -0.53); for (const sx of [-1, 1]) d.rb(T, g, 0.56, 0.1, 0.34, sx * 0.62, 0.78, 0);
        const H = d.ch.head, m = d.lam(0x3a1f66, velvetTex()); d.rb(H, m, 1.56, 0.22, 1.56, 0, 0.8, 0); d.rb(H, d.lam(0x4a2a7a, velvetTex()), 1.4, 0.24, 1.4, 0.12, 1.0, 0); d.rb(H, m, 0.14, 0.2, 0.14, 0.12, 1.18, 0); d.bx(H, g, 0.16, 0.16, 0.06, -0.5, 0.84, -0.8, 0, 0, Math.PI / 4);
    },
    u5(d) { // a work robe: rolled sleeves (bare forearms), a leather apron with pockets and tools, a soft floppy hat
        const r = robe(d, { color: 0x7a6a52, trim: 0x4a3a2a, motif: 'leaf', layers: 4, hem: -1.95, flare: 0.4, bell: 0 });
        const T = d.ch.torso, lea = d.lam(0x6a4a2a, leatherTex()), lea2 = d.lam(0x5a3a1e, leatherTex()), g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 });
        d.rb(T, lea, 1.0, 2.1, 0.08, 0, -0.5, -0.58); for (const sx of [-1, 1]) d.rb(T, lea, 0.14, 0.7, 0.06, sx * 0.34, 0.5, -0.56); d.rb(T, lea2, 0.56, 0.4, 0.1, 0, -0.4, -0.64);
        d.bx(T, g, 0.07, 0.5, 0.05, 0.16, -0.3, -0.72); d.bx(T, d.lam(0x2a2a6a, woolTex()), 0.12, 0.12, 0.05, -0.14, -0.34, -0.7); d.bx(T, d.lam(0x2a2a6a, woolTex()), 0.2, 0.2, 0.04, 0.5, 0.4, -0.52, 0, 0, 0.3);
        const H = d.ch.head, m = d.lam(0x5a4a38, woolTex()); d.rb(H, m, 1.9, 0.08, 1.9, 0, 0.66, 0); d.rb(H, m, 1.36, 0.36, 1.36, 0, 0.88, 0); d.rb(H, m, 1.1, 0.3, 1.1, 0.1, 1.16, 0.06); d.rb(H, m, 0.8, 0.26, 0.8, 0.3, 1.4, 0.14); d.rb(H, lea2, 1.4, 0.12, 1.4, 0, 0.78, 0);
    },
    m1(d) { // the High Mage: a deep-purple robe, an ermine mantle, a gold-embroidered front, a long cape, a chain with a medallion, a tall star hat
        const r = robe(d, { color: 0x3a1d5e, trim: 0x1a1240, motif: 'star', layers: 6, hem: -2.35, flare: 0.8, bell: 1 });
        const T = d.ch.torso, fur = d.lam(0xffffff, furTex()), g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 }), cape = d.lam(0x2a1450, velvetTex()), th = d.lam(0xffffff, threadTex('star'), { alphaTest: 0.4, transparent: true });
        d.rb(T, cape, 1.5, 2.9, 0.1, 0, -0.9, 0.62, 0.04); d.rb(T, g, 1.54, 0.07, 0.14, 0, -2.3, 0.64);
        d.rb(T, fur, 2.0, 0.5, 1.3, 0, 0.76, 0.02); for (let q = -4; q <= 4; q++) d.bx(T, d.lam(0x111111), 0.1, 0.2, 0.04, q * 0.2, 0.6, -0.66);
        d.bx(T, d.lam(0x2a1450, velvetTex()), 0.4, 2.3, 0.05, 0, -0.5, -0.64); d.bx(T, th, 0.4, 2.3, 0.02, 0, -0.5, -0.67);
        d.bx(T, g, 0.34, 0.34, 0.07, 0, 0.1, -0.7, 0, 0, Math.PI / 4); d.bx(T, d.std(0xd02050, { roughness: 0.2, emissive: 0xc01040, emissiveIntensity: 0.7 }), 0.16, 0.16, 0.08, 0, 0.1, -0.74, 0, 0, Math.PI / 4);
        hat(d, { color: 0x2a1450, trim: 0x1a1240, motif: 'star', brim: 2.5, high: 3.0, bend: 0.5 });
        const beard = d.lam(0xece8e0, woolTex()); for (let i = 0; i < 4; i++) d.rb(d.ch.head, beard, 0.9 - i * 0.16, 0.34, 0.3, 0, -0.5 - i * 0.28, -0.6 - i * 0.04);
    },
    m2(d) { // the White Sage: white wool and gold velvet, a tall gold collar behind the head, a sun on the sash, a gold circlet on a white hood
        const r = robe(d, { color: 0xeee8d8, trim: 0xe0b43c, motif: 'star', layers: 6, hem: -2.35, flare: 0.8, bell: 1 });
        const T = d.ch.torso, gold = d.lam(0xe0b43c, velvetTex()), g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 }), wool = d.lam(0xf4f0e4, woolTex());
        d.rb(T, gold, 1.56, 0.4, 1.1, 0, 0.76, 0); d.rb(T, gold, 1.1, 1.3, 0.14, 0, 1.3, 0.5); d.rb(T, wool, 0.8, 0.9, 0.12, 0, 1.4, 0.58);
        d.bx(T, gold, 0.5, 2.3, 0.05, 0, -0.5, -0.64); d.bx(T, wool, 0.3, 2.3, 0.06, 0, -0.5, -0.68); d.put(T, geo_disk(), g, 0.4, 0.06, 0.4, 0, 0.1, -0.72, Math.PI / 2);
        d.rb(T, wool, 1.5, 2.6, 0.1, 0, -0.8, 0.6, 0.03);
        const H = d.ch.head; d.rb(H, wool, 1.58, 1.5, 0.2, 0, 0.1, 0.76); for (const sx of [-1, 1]) d.rb(H, wool, 0.2, 1.4, 1.6, sx * 0.78, 0.1, 0.06); d.rb(H, wool, 1.6, 0.3, 1.6, 0, 0.84, 0.04);
        d.rb(H, g, 1.5, 0.12, 1.5, 0, 0.7, -0.02); for (let i = 0; i < 5; i++) d.bx(H, g, 0.14, 0.36, 0.14, -0.5 + i * 0.25, 0.94, -0.7);
        const beard = d.lam(0xf4f0e8, woolTex()); for (let i = 0; i < 4; i++) d.rb(H, beard, 0.9 - i * 0.16, 0.34, 0.3, 0, -0.5 - i * 0.28, -0.6 - i * 0.04);
    },
    m3(d) { // the Star Lord: a midnight robe sprinkled with stars, a tall pointed collar, a crescent crown, a flowing cape
        const r = robe(d, { color: 0x1c2064, trim: 0x14143a, motif: 'star', layers: 6, hem: -2.35, flare: 0.85, bell: 1, map: skyTex() });
        const T = d.ch.torso, g = d.std(GOLD().color, { metalness: 0.8, roughness: 0.32 }), night = d.lam(0x14184a, skyTex()), cape = d.lam(0x0e1038, skyTex());
        d.rb(T, cape, 1.6, 3.0, 0.1, 0, -0.9, 0.62, 0.04); d.rb(T, night, 1.96, 0.42, 1.3, 0, 0.76, 0.02);
        for (const sx of [-1, 1]) d.rb(T, night, 0.44, 1.1, 0.16, sx * 0.64, 1.26, 0.5, 0, 0, sx * -0.2);
        d.put(T, geo_arc(), g, 0.5, 0.5, 0.9, 0.06, 0.14, -0.7, 0, 0, Math.PI * 0.6);
        const H = d.ch.head, m = d.lam(0x1c2064, skyTex());
        d.rb(H, m, 1.46, 0.4, 1.46, 0, 0.86, 0); d.rb(H, m, 1.1, 0.3, 1.1, 0, 1.2, 0.04); d.rb(H, m, 0.8, 0.3, 0.8, 0, 1.5, 0.1); d.rb(H, g, 1.5, 0.1, 1.5, 0, 0.7, 0);
        d.put(H, geo_arc(), g, 1.0, 1.0, 1.4, 0, 2.05, 0, 0, 0, Math.PI * 0.55); d.bx(H, g, 0.2, 0.2, 0.2, 0.0, 2.45, 0.04, 0, 0, Math.PI / 4);
        const beard = d.lam(0xece8e0, woolTex()); for (let i = 0; i < 4; i++) d.rb(H, beard, 0.9 - i * 0.16, 0.34, 0.3, 0, -0.5 - i * 0.28, -0.6 - i * 0.04);
    },
};
const _g = {};
const geo_disk = () => _g.disk || (_g.disk = new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
const geo_arc = () => _g.arc || (_g.arc = new THREE.TorusGeometry(0.5, 0.09, 8, 24, Math.PI * 1.25));

/** Dress a hero in a tower look (a student's uniform 'u1'…'u5' or the Master's 'm1'…'m3'). */
export function dressTower(ch, kind) {
    ch._armorParts = [];
    L[kind](new D(ch));
    return ch;
}
