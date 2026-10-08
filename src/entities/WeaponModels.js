/**
 * WeaponModels.js — realistic procedural sword and axe.
 *
 * Model space: pommel / handle bottom at the origin, weapon points along +Y,
 * the edge plane is XY (blade thickness along Z). All textures are generated
 * at runtime on a canvas (no extra files), and the metal reflects a small
 * generated sky/ground environment so steel looks like steel.
 */

import * as THREE from 'three';

let ENV = null;
let TEX = null;

/**
 * Physics description of each weapon in MODEL units (× scale = metres).
 * Pure data so the physics can be unit-tested without a browser.
 */
export const WEAPON_SPECS = {
    sword: {
        type: 'sword', scale: 2.6, mass: 1.4, damage: 2,
        handle: [0.05, 0.245], // grip range along Y
        bladeStart: 0.32, length: 1.3, // striking part
        handleRadius: 0.025,
        // Collision samples [x, y, z, radius]
        samples: [[0, -0.03, 0, 0.035], [0, 0.15, 0, 0.03], [-0.17, 0.3, 0, 0.03], [0.17, 0.3, 0, 0.03], [0, 0.6, 0, 0.03], [0, 0.95, 0, 0.025], [0, 1.3, 0, 0.012]],
        com: [0, 0.38, 0],
        stiffness: 26,
    },
    axe: {
        type: 'axe', scale: 2.6, mass: 2.2, damage: 3,
        handle: [0.05, 0.36],
        bladeStart: 0.62, length: 0.92,
        handleRadius: 0.036,
        samples: [[0, 0.0, 0, 0.045], [0, 0.45, 0, 0.045], [0.34, 0.68, 0, 0.045], [0.33, 0.88, 0, 0.045], [-0.06, 0.76, 0, 0.045], [0, 0.92, 0, 0.045]],
        com: [0.04, 0.62, 0],
        stiffness: 20,
    },
};

/** Tiny gradient environment (sky above, grass below) for metal reflections. */
export function getEnvMap(renderer) {
    if (ENV || !renderer) return ENV;
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const colors = [];
    const pos = geo.attributes.position;
    const top = new THREE.Color(0xbfe6ff), horizon = new THREE.Color(0xf4f4f0), ground = new THREE.Color(0x4a6b3a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 10;
        if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6));
        else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
        colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pmrem = new THREE.PMREMGenerator(renderer);
    ENV = pmrem.fromScene(scene, 0.02).texture;
    pmrem.dispose();
    geo.dispose();
    return ENV;
}

function canvasTexture(w, h, draw) {
    const canvas = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
}

function textures() {
    if (TEX) return TEX;
    // Brushed steel: fine lengthwise streaks + subtle mottling
    const steel = canvasTexture(64, 512, (ctx, w, h) => {
        ctx.fillStyle = '#c9ced3';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
            const x = Math.random() * w;
            const len = 20 + Math.random() * 120;
            const y = Math.random() * h;
            const v = 170 + Math.floor(Math.random() * 70);
            ctx.strokeStyle = `rgba(${v},${v + 3},${v + 6},0.35)`;
            ctx.lineWidth = Math.random() < 0.8 ? 0.6 : 1.2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5), y + len); ctx.stroke();
        }
        // Fuller (central groove) — darker band running up the blade
        const grad = ctx.createLinearGradient(w * 0.38, 0, w * 0.62, 0);
        grad.addColorStop(0, 'rgba(60,65,72,0)');
        grad.addColorStop(0.5, 'rgba(60,65,72,0.45)');
        grad.addColorStop(1, 'rgba(60,65,72,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(w * 0.38, h * 0.08, w * 0.24, h * 0.72);
        // Bright honed edges
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(0, 0, 3, h);
        ctx.fillRect(w - 3, 0, 3, h);
    });
    // Leather wrap: diagonal strips with stitching
    const leather = canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#3b2314';
        ctx.fillRect(0, 0, w, h);
        for (let i = -h; i < w + h; i += 22) {
            const g = ctx.createLinearGradient(i, 0, i + 18, 0);
            g.addColorStop(0, '#2a170c');
            g.addColorStop(0.5, '#5a3820');
            g.addColorStop(1, '#2a170c');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i + 18, 0); ctx.lineTo(i + 18 + h * 0.6, h); ctx.lineTo(i + h * 0.6, h);
            ctx.closePath(); ctx.fill();
        }
        for (let i = 0; i < 1200; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
        }
    });
    leather.wrapS = leather.wrapT = THREE.RepeatWrapping;
    leather.repeat.set(1, 3);
    // Wood grain for the axe haft
    const wood = canvasTexture(64, 256, (ctx, w, h) => {
        ctx.fillStyle = '#7a4a24';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * w;
            ctx.strokeStyle = `rgba(${60 + Math.random() * 40},${30 + Math.random() * 20},10,0.5)`;
            ctx.lineWidth = 0.5 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            for (let y = 0; y <= h; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 2, y);
            ctx.stroke();
        }
    });
    TEX = { steel, leather, wood };
    return TEX;
}

/** Long tapered blade with a diamond cross-section and a real point. */
function bladeGeometry(len, baseHalfW, thick, pointLen) {
    // Cross-section points (x, z): edge, spine front, edge, spine back
    const rings = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = t * len;
        const toPoint = Math.max(0, (y - (len - pointLen)) / pointLen);
        const taper = 1 - 0.28 * t;
        const hw = baseHalfW * taper * (1 - Math.pow(toPoint, 1.15));
        const th = thick * (1 - 0.4 * t) * (1 - 0.85 * toPoint);
        rings.push({ y, hw: Math.max(hw, 0.0005), th: Math.max(th, 0.0004) });
    }
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        const v = i / (rings.length - 1);
        // 4 points per ring: +x edge, +z spine, -x edge, -z spine (each face gets own verts for flat shading)
        pos.push(r.hw, r.y, 0, 0, r.y, r.th, -r.hw, r.y, 0, 0, r.y, -r.th);
        uv.push(1, v, 0.5, v, 0, v, 0.5, v);
    }
    for (let i = 0; i < rings.length - 1; i++) {
        const a = i * 4, b = (i + 1) * 4;
        for (let k = 0; k < 4; k++) {
            const k2 = (k + 1) % 4;
            idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
        }
    }
    // Tip cap
    const last = (rings.length - 1) * 4;
    pos.push(0, len + 0.002, 0);
    uv.push(0.5, 1);
    const tip = pos.length / 3 - 1;
    for (let k = 0; k < 4; k++) idx.push(last + k, tip, last + (k + 1) % 4);
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return geo;
}

/**
 * Build the visual for a weapon type. Returns {group, spec}.
 * spec describes physics in MODEL units (multiply by spec.scale for world).
 */
export function buildWeapon(type, renderer) {
    const env = getEnvMap(renderer);
    const tex = textures();
    const group = new THREE.Group();
    group.name = type;

    if (type === 'axe') {
        const haftMat = new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.75, metalness: 0.0 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, map: tex.steel, roughness: 0.38, metalness: 0.9, envMap: env, envMapIntensity: 1.0 });
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.9, 12), haftMat);
        haft.position.y = 0.45;
        group.add(haft);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.32, 12), new THREE.MeshStandardMaterial({ map: tex.leather, roughness: 0.9 }));
        grip.position.y = 0.2;
        group.add(grip);
        // Axe head: wedge-shaped bit with a bearded curve
        const shape = new THREE.Shape();
        shape.moveTo(0.02, -0.06);
        shape.lineTo(0.12, -0.05);
        shape.quadraticCurveTo(0.2, -0.13, 0.33, -0.16);
        shape.quadraticCurveTo(0.38, 0.0, 0.33, 0.12);
        shape.quadraticCurveTo(0.22, 0.08, 0.12, 0.05);
        shape.lineTo(0.02, 0.06);
        shape.lineTo(-0.06, 0.05);
        shape.lineTo(-0.06, -0.05);
        shape.closePath();
        // A real wedge: thick at the eye, thinning to a sharp edge at the bit
        const headGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 12 });
        const pos = headGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const t = Math.min(1, Math.max(0, (x - 0.06) / 0.28));
            const k = 1 - 0.94 * t * t * (3 - 2 * t); // smooth taper to ~3 mm
            pos.setZ(i, 0.025 + (z - 0.025) * k);
        }
        headGeo.computeVertexNormals();
        const head = new THREE.Mesh(headGeo, steelMat);
        // the honed edge catches the light
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.12, metalness: 1.0, envMap: env, envMapIntensity: 1.4 });
        const edgeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.33, -0.16, 0.025), new THREE.Vector3(0.385, -0.02, 0.025), new THREE.Vector3(0.33, 0.12, 0.025));
        const edge = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 16, 0.004, 4, false), edgeMat);
        head.add(edge);
        head.position.set(0, 0.76, -0.025);
        group.add(head);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), steelMat);
        cap.position.y = 0.9;
        group.add(cap);
        group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        return { group, spec: WEAPON_SPECS.axe };
    }

    // ---------------------------------------------------------------- sword
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, map: tex.steel, roughness: 0.22, metalness: 0.95, envMap: env, envMapIntensity: 1.15 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb8892f, roughness: 0.35, metalness: 0.85, envMap: env });
    const leatherMat = new THREE.MeshStandardMaterial({ map: tex.leather, roughness: 0.92, metalness: 0.0 });

    const blade = new THREE.Mesh(bladeGeometry(1.0, 0.052, 0.014, 0.16), steelMat);
    blade.position.y = 0.3;
    group.add(blade);

    // Ricasso / blade root
    const root = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.026), steelMat);
    root.position.y = 0.3;
    group.add(root);

    // Crossguard: slightly curved quillons with rounded tips
    const guardCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.17, 0.3, 0), new THREE.Vector3(-0.08, 0.277, 0),
        new THREE.Vector3(0, 0.272, 0), new THREE.Vector3(0.08, 0.277, 0), new THREE.Vector3(0.17, 0.3, 0),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(guardCurve, 24, 0.018, 8, false), brassMat));
    for (const x of [-0.17, 0.17]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), brassMat);
        knob.position.set(x, 0.3, 0);
        group.add(knob);
    }
    const guardBlock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.05), brassMat);
    guardBlock.position.y = 0.272;
    group.add(guardBlock);

    // Grip with leather wrap and a slight swell in the middle
    const gripGeo = new THREE.LatheGeometry([
        new THREE.Vector2(0.021, 0.035), new THREE.Vector2(0.025, 0.1),
        new THREE.Vector2(0.026, 0.16), new THREE.Vector2(0.024, 0.22), new THREE.Vector2(0.021, 0.255),
    ], 16);
    group.add(new THREE.Mesh(gripGeo, leatherMat));
    // Ferrule rings
    for (const y of [0.04, 0.252]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16), brassMat);
        ring.position.y = y;
        group.add(ring);
    }
    // Pommel (scent-stopper shape)
    const pommel = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0.001, -0.035), new THREE.Vector2(0.03, -0.025), new THREE.Vector2(0.038, 0.0),
        new THREE.Vector2(0.03, 0.022), new THREE.Vector2(0.016, 0.034),
    ], 16), brassMat);
    pommel.position.y = 0.0;
    group.add(pommel);

    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return { group, spec: WEAPON_SPECS.sword };
}
