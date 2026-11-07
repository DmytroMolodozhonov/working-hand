/**
 * SchoolCoach.js — the magic coach of «Акселдорф» (the author 07.11: «тележка была очень маленькая, явно не магическая»): a great closed
 * coach that drives ITSELF — no horses, no driver; midnight-blue lacquer with gilt mouldings, a vaulted roof with a gilt rail and a trunk,
 * warm lit windows, two coach lamps, tall spoked wheels with a ring of cold blue runes that glow brighter as they turn, a lantern floating
 * over the empty driver's bench, sparks trailing behind. A thing of the scene only (School.js moves it along the road): no physics of its own.
 * Measures from the world's: the hero 3.5 m — the cabin 3.1 × 4.4 m, 2.9 m high inside its walls, the roof's ridge ≈ 5.3 m; rear wheels Ø 2.7 m.
 * Cheap: the parts of one material merged (MergeGeometry), four materials shared by every coach; only the wheels and the door move.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

const C = { lacquer: 0x14204a, lacquer2: 0x0e1736, gold: 0xc9a14a, gold2: 0x9c7a32, wood: 0x2a1a10, iron: 0x24262b, trunk: 0x4a2e1a, seat: 0x5a1626 };
const _c = new THREE.Color();
function tint(geo, hex, jitter = 0.03, seed = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    _c.setHex(hex);
    for (let i = 0; i < n; i++) { const k = 1 + jitter * Math.sin(i * 12.9898 + seed * 78.233); a[i * 3] = _c.r * k; a[i * 3 + 1] = _c.g * k; a[i * 3 + 2] = _c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 16) => new THREE.CylinderGeometry(r0, r1, h, s);
const P = (geo, hex, pos, rot, scale) => ({ geo: tint(geo, hex, 0.03, pos[0] * 3 + pos[2]), pos, rot: rot || undefined, scale: scale || undefined });

const CAB = { w: 3.1, h: 2.9, l: 4.4, y0: 1.75 }; // the cabin: width, wall height, length, its floor over the ground

function bodyParts() {
    const o = [], y0 = CAB.y0, yt = y0 + CAB.h, hw = CAB.w / 2, hl = CAB.l / 2;
    // the chassis, the perch and the springs
    o.push(P(box(1.0, 0.28, 7.4), C.wood, [0, 1.25, 0]));
    for (const z of [-2.5, 2.3]) { o.push(P(box(2.9, 0.22, 0.3), C.iron, [0, 1.15, z])); }
    for (const sx of [-1, 1]) for (const z of [-1.6, 1.6]) o.push(P(new THREE.TorusGeometry(0.42, 0.06, 6, 14, Math.PI), C.gold2, [sx * 1.05, 1.55, z], [0, Math.PI / 2, 0], [1, 0.55, 1]));
    // the cabin: a lacquered box with panels (raised frames), a darker plinth
    o.push(P(box(CAB.w, CAB.h, CAB.l), C.lacquer, [0, y0 + CAB.h / 2, 0]));
    o.push(P(box(CAB.w + 0.1, 0.35, CAB.l + 0.1), C.lacquer2, [0, y0 + 0.17, 0]));
    // the vaulted roof (a half-cylinder along the coach) and its overhang
    o.push(P(new THREE.CylinderGeometry(hw + 0.15, hw + 0.15, CAB.l + 0.5, 20, 1, false, -Math.PI / 2, Math.PI), C.lacquer2, [0, yt, 0], [Math.PI / 2, 0, 0], [1, 1, 0.42]));
    o.push(P(box(CAB.w + 0.4, 0.14, CAB.l + 0.6), C.lacquer2, [0, yt + 0.02, 0]));
    // the trunk and the luggage on the roof
    o.push(P(box(1.6, 0.7, 1.4), C.trunk, [0, yt + 0.95, 0.9]));
    o.push(P(box(1.0, 0.45, 0.9), C.trunk, [0.2, yt + 0.85, -0.6], [0, 0.25, 0]));
    // the driver's bench in front (empty: the coach drives itself) with its velvet cushion and footboard
    o.push(P(box(2.2, 0.25, 1.0), C.wood, [0, 3.05, -hl - 0.65]));
    o.push(P(box(2.0, 0.14, 0.85), C.seat, [0, 3.24, -hl - 0.65]));
    o.push(P(box(2.0, 0.12, 0.8), C.wood, [0, 2.2, -hl - 1.4], [0.5, 0, 0]));
    o.push(P(box(0.18, 1.2, 0.18), C.wood, [-0.9, 2.55, -hl - 0.65])); o.push(P(box(0.18, 1.2, 0.18), C.wood, [0.9, 2.55, -hl - 0.65]));
    // the step under each door
    for (const sx of [-1, 1]) o.push(P(box(0.6, 0.08, 0.9), C.iron, [sx * (hw + 0.35), 1.2, 0]));
    // the wheels' axles
    o.push(P(cyl(0.12, 0.12, 3.6, 8), C.iron, [0, 1.3, 1.9], [0, 0, Math.PI / 2]));
    o.push(P(cyl(0.12, 0.12, 3.4, 8), C.iron, [0, 1.0, -2.2], [0, 0, Math.PI / 2]));
    return o;
}
function goldParts() {
    const o = [], y0 = CAB.y0, yt = y0 + CAB.h, hw = CAB.w / 2, hl = CAB.l / 2;
    // the mouldings: round the cabin's edges, the panels on its sides, the waist line
    for (const y of [y0 + 0.36, y0 + 1.3, yt - 0.05]) { o.push(P(box(CAB.w + 0.06, 0.07, 0.07), C.gold, [0, y, -hl - 0.02])); o.push(P(box(CAB.w + 0.06, 0.07, 0.07), C.gold, [0, y, hl + 0.02])); for (const sx of [-1, 1]) o.push(P(box(0.07, 0.07, CAB.l + 0.06), C.gold, [sx * (hw + 0.02), y, 0])); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(P(box(0.08, CAB.h, 0.08), C.gold, [sx * (hw + 0.03), y0 + CAB.h / 2, sz * (hl + 0.03)]));
    for (const sx of [-1, 1]) for (const z of [-1.55, 1.55]) { // (the panels before and behind the door: a gilt frame with a diamond in it)
        o.push(P(box(0.05, 0.85, 0.05), C.gold2, [sx * (hw + 0.04), y0 + 0.85, z - 0.35])); o.push(P(box(0.05, 0.85, 0.05), C.gold2, [sx * (hw + 0.04), y0 + 0.85, z + 0.35]));
        o.push(P(box(0.05, 0.3, 0.3), C.gold, [sx * (hw + 0.05), y0 + 0.85, z], [Math.PI / 4, 0, 0]));
    }
    // the roof's rail with little finials, the ridge's crest
    for (const sx of [-1, 1]) o.push(P(cyl(0.04, 0.04, CAB.l, 6), C.gold, [sx * (hw - 0.2), yt + 0.55, 0], [Math.PI / 2, 0, 0]));
    for (const sx of [-1, 1]) for (const z of [-hl + 0.1, 0, hl - 0.1]) { o.push(P(cyl(0.03, 0.03, 0.45, 6), C.gold, [sx * (hw - 0.2), yt + 0.33, z])); o.push(P(new THREE.SphereGeometry(0.08, 8, 6), C.gold, [sx * (hw - 0.2), yt + 0.6, z])); }
    // the emblem on each door: a gilt eight-pointed star in a ring (the school's own sign — no crest of any book)
    for (const sx of [-1, 1]) {
        o.push(P(new THREE.TorusGeometry(0.32, 0.035, 6, 20), C.gold, [sx * (hw + 0.07), y0 + 0.82, 0], [0, Math.PI / 2, 0]));
        for (let k = 0; k < 4; k++) o.push(P(box(0.04, 0.5, 0.06), C.gold, [sx * (hw + 0.08), y0 + 0.82, 0], [k * Math.PI / 4, 0, 0]));
    }
    // the lamps' brackets, the floating lantern's ring
    for (const sx of [-1, 1]) o.push(P(box(0.08, 0.6, 0.08), C.gold2, [sx * (hw + 0.1), yt - 0.5, -hl - 0.1]));
    return o;
}
function glassParts() { // the lit windows and the lamps' glass (warm), drawn bright in the dusk
    const o = [], y0 = CAB.y0, hw = CAB.w / 2, hl = CAB.l / 2;
    for (const sx of [-1, 1]) for (const z of [-1.55, 1.55]) o.push(P(box(0.03, 0.85, 0.75), 0xffc97a, [sx * (hw + 0.01), y0 + 2.05, z]));
    for (const sz of [-1, 1]) o.push(P(box(1.5, 0.7, 0.03), 0xffc97a, [0, y0 + 2.05, sz * (hl + 0.01)]));
    for (const sx of [-1, 1]) o.push(P(box(0.34, 0.5, 0.34), 0xffe2a8, [sx * (hw + 0.1), y0 + CAB.h - 0.1, -hl - 0.15]));
    return o;
}
function wheelParts(R) {
    const o = [];
    o.push(P(new THREE.TorusGeometry(R, 0.1, 8, 28), C.gold2, [0, 0, 0], [0, Math.PI / 2, 0]));
    o.push(P(new THREE.TorusGeometry(R - 0.12, 0.06, 6, 28), C.wood, [0, 0, 0], [0, Math.PI / 2, 0]));
    for (let k = 0; k < 12; k++) o.push(P(box(0.07, R * 1.9, 0.07), C.wood, [0, 0, 0], [k * Math.PI / 12, 0, 0]));
    o.push(P(cyl(0.22, 0.22, 0.36, 12), C.gold, [0, 0, 0], [0, 0, Math.PI / 2]));
    return o;
}

let _M = null;
function mats() {
    if (_M) return _M;
    _M = {
        body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15 }),
        gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85, emissive: 0x2a1a04 }),
        glass: new THREE.MeshBasicMaterial({ vertexColors: true }),
        rune: new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        glow: new THREE.SpriteMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex() }),
    };
    for (const [k, m] of Object.entries(_M)) m.name = 'schoolCoach_' + k;
    return _M;
}
function glowTex() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,220,160,0.6)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
let _G = null;
function geos() {
    if (_G) return _G;
    _G = { body: mergeParts(bodyParts()), gold: mergeParts(goldParts()), glass: mergeParts(glassParts()), wheelB: mergeParts(wheelParts(1.35)), wheelF: mergeParts(wheelParts(1.0)),
        runeB: new THREE.TorusGeometry(0.85, 0.035, 6, 32), runeF: new THREE.TorusGeometry(0.62, 0.03, 6, 28),
        door: mergeParts([P(box(0.08, 2.35, 1.2), C.lacquer, [0, 0, 0.6]), P(box(0.1, 0.06, 1.1), C.gold, [0.02, 0.7, 0.6]), P(box(0.1, 0.06, 1.1), C.gold, [0.02, -0.7, 0.6]), P(box(0.05, 0.75, 0.7), 0xffc97a, [0.04, 0.45, 0.6])]) };
    return _G;
}

export class SchoolCoach {
    constructor(scene) {
        const G = geos(), M = mats();
        this.group = new THREE.Group(); this.group.name = 'schoolCoach';
        this.group.add(new THREE.Mesh(G.body, M.body), new THREE.Mesh(G.gold, M.gold), new THREE.Mesh(G.glass, M.glass));
        this.wheels = [];
        for (const [x, y, z, back] of [[-1.75, 1.35, 1.9, 1], [1.75, 1.35, 1.9, 1], [-1.6, 1.0, -2.2, 0], [1.6, 1.0, -2.2, 0]]) {
            const w = new THREE.Group(); w.position.set(x, y, z);
            w.add(new THREE.Mesh(back ? G.wheelB : G.wheelF, M.body));
            const rune = new THREE.Mesh(back ? G.runeB : G.runeF, M.rune); rune.rotation.y = Math.PI / 2; rune.position.x = Math.sign(x) * 0.12; w.add(rune);
            this.group.add(w); this.wheels.push({ g: w, R: back ? 1.35 : 1.0 });
        }
        // the door on the right (+x): it opens outward on its front hinge
        this.door = new THREE.Group(); this.door.position.set(CAB.w / 2 + 0.05, CAB.y0 + 1.25, -0.6);
        this.door.add(new THREE.Mesh(G.door, M.body)); this.group.add(this.door);
        // the lantern floating over the driver's bench, the coach lamps' glow
        this.lantern = new THREE.Sprite(M.glow); this.lantern.scale.set(1.4, 1.4, 1); this.lantern.position.set(0, 4.3, -CAB.l / 2 - 0.8); this.group.add(this.lantern);
        for (const sx of [-1, 1]) { const s = new THREE.Sprite(M.glow); s.scale.set(1.1, 1.1, 1); s.position.set(sx * (CAB.w / 2 + 0.1), CAB.y0 + CAB.h - 0.1, -CAB.l / 2 - 0.2); this.group.add(s); }
        this.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        scene.add(this.group);
        this.scene = scene;
        this.spin = 0; this.t = 0; this.doorK = 0; this.doorWant = 0;
    }

    /** Where it stands (x, y the ground, z) facing `yaw` (forward −z); `speed` m/s turns the wheels and lights the runes. */
    set(x, y, z, yaw, speed, dt) {
        this.t += dt;
        const bob = Math.sin(this.t * 7) * 0.025 * Math.min(1, speed / 3); // (a soft sway on its springs)
        this.group.position.set(x, y + bob, z); this.group.rotation.y = yaw;
        this.spin += speed * dt;
        for (const w of this.wheels) w.g.rotation.x = -this.spin / w.R;
        mats().rune.opacity = 0.45 + Math.min(0.5, speed * 0.12) + Math.sin(this.t * 3) * 0.05;
        this.lantern.position.y = 4.3 + Math.sin(this.t * 1.7) * 0.12;
        this.doorK += (this.doorWant - this.doorK) * Math.min(1, dt * 3);
        this.door.rotation.y = -this.doorK * 1.6;
    }
    openDoor(on = true) { this.doorWant = on ? 1 : 0; }
    /** The step by the door (where one gets out), world coordinates. */
    exitAt(out = new THREE.Vector3()) { return out.set(CAB.w / 2 + 1.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y).add(this.group.position); }
    dispose() { this.scene.remove(this.group); } // (the shapes and materials are shared: kept)
}

/** Samples for the prewarm: the coach's materials. */
export function coachSamples() { const s = new THREE.Scene(); const c = new SchoolCoach(s); return [c.group]; }
