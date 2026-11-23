import * as THREE from 'three';
import { createRng } from '../src/core/math.js';

const V3 = THREE.Vector3;

export const OUTFITS = [
    { role: 'wizard', coat: 0x3c603f, skin: 0xb57858, hair: 0x36201a, style: 'shoulder', face: [0.97, 1.05, 1], trim: 0xcab175 },
    { role: 'wizard', coat: 0x6e3241, skin: 0xe4b093, hair: 0xc5b5a0, style: 'braid', face: [0.9, 1.02, 1.02], trim: 0xdbc09d },
    { role: 'knight', coat: 0x334f64, skin: 0xa2674d, hair: 0x2b2622, style: 'cropped', face: [1.08, 0.98, 1.03], trim: 0x9faec0 },
    { role: 'resident', coat: 0x855836, skin: 0xba8863, hair: 0x774426, style: 'swept', face: [1.07, 1.02, 1.01], trim: 0x9b8266 },
    { role: 'resident', coat: 0x4f586c, skin: 0xd6a383, hair: 0x4d271d, style: 'curl', face: [0.92, 0.98, 1.03], trim: 0x9a9da3 },
    { role: 'wizard', coat: 0x34385c, skin: 0xc49476, hair: 0x413025, style: 'swept', face: [1, 1, 1], trim: 0xcab175 },
    { role: 'king', coat: 0x6e292c, skin: 0xbf8566, hair: 0x52443e, style: 'crest', face: [1.1, 1.04, 1], trim: 0xe1c06f },
    { role: 'vizier', coat: 0x514168, skin: 0xa06c48, hair: 0x3e2a24, style: 'bun', face: [0.96, 1.06, 0.95], trim: 0xc5b792 },
    { role: 'knight', coat: 0x5e3640, skin: 0xd2a888, hair: 0x6d4636, style: 'shoulder', face: [1.03, 1.03, 0.98], trim: 0xbbaeb0 },
];

export function heroProfile(look) {
    const base = OUTFITS[5];
    if (!look) return base;
    const styles = ['cropped', 'shoulder', 'bun', 'swept', 'crest', 'bald', 'braid', 'curl'];
    const color = (value, fallback) => Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : fallback;
    const face = Number.isInteger(look.face) ? Math.min(29, Math.max(0, look.face)) : 0;
    return { ...base,
        skin: color(look.skin, base.skin),
        hair: color(look.hairColor, base.hair),
        coat: color(look.topColor, base.coat),
        style: styles[look.hair] || base.style,
        face: [0.93 + (face % 5) * 0.034, 0.97 + Math.floor(face / 6) * 0.024, 1],
    };
}

export function avatarHair(head, profile, seed, light = false) {
    if (profile.style === 'bald') return [];
    const rand = createRng(seed);
    const color = new THREE.Color(profile.hair), locks = [];
    const material = new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, sheen: 0.8, sheenColor: color.clone().multiplyScalar(1.3) });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, 1.51), material);
    cap.scale.set(0.085, 0.104, 0.100);
    cap.position.set(0, 0.109, -0.011);
    cap.rotation.x = -0.24;
    cap.castShadow = true;
    head.add(cap);

    const count = light ? 18 : profile.style === 'braid' ? 31 : 34;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI + (rand() - 0.5) * 0.16;
        const rear = Math.max(0, -Math.sin(angle));
        const side = Math.abs(Math.cos(angle));
        const front = Math.max(0, Math.sin(angle));
        const pivot = new THREE.Group();
        pivot.position.set(Math.cos(angle) * 0.073, 0.152 + rand() * 0.037, -0.013 + Math.sin(angle) * 0.082);
        head.add(pivot);
        const length = ['cropped', 'bun', 'crest'].includes(profile.style) ? 0.031 + rear * 0.02
            : profile.style === 'swept' ? 0.05 + front * 0.024 + rear * 0.03
                : 0.06 + (rear * 0.17 + side * 0.10) * (profile.style === 'braid' ? 0.58 : 1);
        const curl = profile.style === 'curl' ? 0.023 : 0.006;
        const points = [];
        for (let j = 0; j <= 6; j++) {
            const t = j / 6;
            points.push(new V3(
                Math.cos(angle) * Math.sin(t * 2) * 0.016 + Math.sin(t * 6.5 + angle) * curl * t,
                -length * t,
                Math.sin(angle) * Math.sin(t * 2.2) * 0.024 - rear * t * 0.034 + Math.sin(t * 8) * curl * t,
            ));
        }
        const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.008 + rand() * 0.006, 5, false);
        const lock = new THREE.Mesh(geometry, material);
        lock.castShadow = true;
        pivot.add(lock);
        locks.push({ pivot, length, phase: rand() * 6.28, x: 0, z: 0, vx: 0, vz: 0 });
    }
    if (profile.style === 'bun' || profile.style === 'crest') {
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), material);
        const bun = profile.style === 'bun';
        tuft.position.set(0, bun ? 0.169 : 0.215, bun ? -0.107 : -0.013);
        tuft.scale.set(bun ? 0.047 : 0.027, bun ? 0.047 : 0.062, bun ? 0.046 : 0.075);
        tuft.castShadow = true;
        head.add(tuft);
    }
    if (profile.style === 'braid') {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.115, -0.10);
        head.add(pivot);
        for (let i = 0; i < 3; i++) {
            const points = Array.from({ length: 21 }, (_, j) => {
                const t = j / 20, a = t * 18 + i * 2.094;
                return new V3(Math.cos(a) * 0.013 * (1 - t * 0.45), -0.29 * t, Math.sin(a) * 0.013 - t * 0.016);
            });
            pivot.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.011, 6), material));
        }
        locks.push({ pivot, length: 0.3, phase: 1.2, x: 0, z: 0, vx: 0, vz: 0 });
    }
    return locks;
}

export function moveHair(locks, dt, time, wind, acceleration, prone) {
    const step = Math.min(dt, 0.045);
    if (!(step > 0)) return;
    for (const lock of locks) {
        const gain = Math.min(0.55, lock.length * 2.1);
        const x = Math.max(-0.63, Math.min(0.63, gain * (wind.y * Math.sin(time * 3 + lock.phase) + acceleration.z * 0.065 + prone * 1.7)));
        const z = Math.max(-0.53, Math.min(0.53, gain * (wind.x * Math.cos(time * 2.8 + lock.phase) - acceleration.x * 0.065)));
        lock.vx += ((x - lock.x) * 105 - lock.vx * 16) * step;
        lock.vz += ((z - lock.z) * 105 - lock.vz * 16) * step;
        lock.x += lock.vx * step; lock.z += lock.vz * step;
        lock.pivot.rotation.set(lock.x, 0, lock.z);
    }
}

export function fitArmor(rig, slot, item) {
    rig.armor ||= {};
    const old = rig.armor[slot] || [];
    old.forEach(mesh => {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    rig.armor[slot] = [];
    if (!item) return;
    const plate = (bone, dimensions, position, steel, shin = false) => {
        const geometry = shin ? new THREE.CylinderGeometry(dimensions[0], dimensions[2], dimensions[1], 10, 2, true, 0, Math.PI * 1.35)
            : new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, slot === 'helmet' ? Math.PI * 0.57 : Math.PI);
        const material = new THREE.MeshStandardMaterial({ color: item.magic ? 0x879eb0 : steel, metalness: 0.76, roughness: item.magic ? 0.28 : 0.5 });
        const mesh = new THREE.Mesh(geometry, material);
        if (!shin) mesh.scale.set(...dimensions);
        mesh.position.set(...position);
        bone.add(mesh);
        mesh.castShadow = mesh.receiveShadow = true;
        rig.armor[slot].push(mesh);
    };
    if (slot === 'helmet') plate(rig.B.head, [0.10, 0.12, 0.115], [0, 0.105, -0.007], 0x818482);
    if (slot === 'chest') {
        plate(rig.B.chest, [0.174, 0.17, 0.083], [0, 0, 0.063], 0x838789);
        for (const side of ['L', 'R']) plate(rig.B['ua' + side], [0.076, 0.069, 0.075], [0, -0.008, 0], 0xa49a82);
    }
    if (slot === 'legs') for (const side of ['L', 'R']) plate(rig.B['sn' + side], [0.069, 0.26, 0.054], [0, -0.16, 0.006], 0x7d8180, true);
}
