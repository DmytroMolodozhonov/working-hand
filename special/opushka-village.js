import * as THREE from 'three';
import { createRng } from '../src/core/math.js';
import { OUTFITS, fitArmor } from './opushka-appearance.js';
import { makePiece, makeRobe } from '../src/game/ArmorTypes.js';

const V3 = THREE.Vector3;
const houses = [[-8, -3, 5.6, 4.6, false], [3.5, 3, 6.8, 5.0, true], [9, -6.2, 4.8, 4.2, false]];
export const villageClearing = (x, z) => houses.some(([dx, dz, w, d]) => Math.abs(x - dx) < w / 2 + 1.6 && Math.abs(z - dz) < d / 2 + 1.65);

function siding(stone, seed) {
    const rand = createRng(seed);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = stone ? '#5e594f' : '#493228';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
        let x = stone ? -rand() * 75 : 0;
        do {
            const width = stone ? 26 + rand() * 66 : 256;
            const grey = Math.round((stone ? 124 : 110) + rand() * 35);
            ctx.fillStyle = stone ? `rgb(${grey},${grey - 7},${grey - 17})` : `rgb(${grey},${grey * 0.72},${grey * 0.46})`;
            ctx.fillRect(x, row * 32 + 1, width - (stone ? 3 : 0), 29);
            ctx.fillStyle = '#eee4cc38';
            ctx.fillRect(x + 2, row * 32 + 2, width - 4, 2);
            ctx.fillStyle = '#25211943';
            ctx.fillRect(x + 1, row * 32 + 27, width - 3, 3);
            x += width;
        } while (x < 256);
    }
    for (let i = 0; i < 5200; i++) {
        ctx.fillStyle = rand() > 0.5 ? '#21190d20' : '#f1e1bb20';
        const x = rand() * 256, y = rand() * 256;
        ctx.fillRect(x, y, 1 + rand() * (stone ? 5 : 37), 1 + rand() * (stone ? 2 : 0.25));
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    return map;
}

export class OpushkaVillage {
    constructor(api, origin) {
        this.api = api;
        this.origin = origin;
        this.parts = [];
        this.debris = [];
        this.people = [];
        this.rand = createRng(20311);
        const wood = siding(false, 22), stones = siding(true, 92);
        const material = (color, map = null) => new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 0.062, roughness: 0.87 });
        this.materials = { wood: material(0xf6ce9b, wood), stone: material(0xe5decb, stones), beam: material(0x4c3325, wood),
            tile: material(0x5c3c30, wood), slate: material(0x4b5256, stones), plaster: material(0xd5c6a9),
            dark: material(0x2b322b), brass: material(0xb48e57), glass: material(0x8eaa9c) };
        this.homes = houses.map(([dx, dz, w, d, stone], id) => this.house(dx, dz, w, d, stone, id));
        this.trail();
    }

    piece(home, material, x, y, z, sx, sy, sz, opts = {}) {
        const geometry = new THREE.BoxGeometry(sx, sy, sz);
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
            const face = Math.floor(i / 4), width = face < 2 ? sz : sx, height = face === 2 || face === 3 ? sz : sy;
            uv.setXY(i, uv.getX(i) * width / 2.9, uv.getY(i) * height / 2.9);
        }
        const mesh = new THREE.Mesh(geometry, this.materials[material]);
        mesh.position.set(home.x + x, home.y + y, home.z + z);
        mesh.rotation.z = opts.angle || 0;
        mesh.castShadow = mesh.receiveShadow = true;
        this.api.scene.add(mesh);
        const bounds = new THREE.Box3().setFromObject(mesh);
        const part = { mesh, home, bounds, solid: opts.solid ?? true, roof: !!opts.roof, hp: material === 'stone' ? 2.1 : 1.17, material, broken: false };
        this.parts.push(part);
        return part;
    }

    house(dx, dz, width, depth, stone, id) {
        const x = this.origin.x + dx, z = this.origin.z + dz;
        const y = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => this.api.ground(x + a * width * 0.5, z + b * depth * 0.5)))) + 0.13;
        const home = { x, y, z, id, door: new V3(x, y, z + depth * 0.5 + 0.75) };
        const wall = stone ? 'stone' : 'wood', roof = stone ? 'slate' : 'tile', h = stone ? 2.85 : 2.56, w = width / 2, d = depth / 2;
        this.piece(home, 'stone', 0, -0.42, 0, width + 0.05, 0.84, depth + 0.05, { solid: false });
        this.piece(home, 'beam', 0, -0.025, 0, width + 0.08, 0.12, depth + 0.08, { solid: false });
        for (const s of [-1, 1]) {
            const frontMiddle = (w + 0.61) * 0.5;
            for (const e of [-1, 1]) {
                this.piece(home, wall, s * w, h * 0.5, e * d * 0.5, 0.24, h, d + 0.06);
                this.piece(home, wall, e * width * 0.25, h * 0.5, -d, width * 0.5, h, 0.24);
                this.piece(home, 'beam', s * w, h * 0.5, e * d, 0.25, h + 0.1, 0.25);
            }
            this.piece(home, wall, s * frontMiddle, 0.35, d, w - 0.61, 0.7, 0.24);
            this.piece(home, wall, s * frontMiddle, h - 0.28, d, w - 0.61, 0.56, 0.24);
            for (const a of [-1, 1]) this.piece(home, wall, s * frontMiddle + a * (w - 0.61) * 0.35, h * 0.5 - 0.1, d, (w - 0.61) * 0.30, h - 0.88, 0.24);
            this.piece(home, 'glass', s * frontMiddle, h * 0.5 - 0.04, d + 0.05, (w - 0.61) * 0.43, 1.16, 0.088, { solid: false });
            this.piece(home, 'beam', s * frontMiddle, h * 0.5 - 0.04, d + 0.14, 0.06, 1.18, 0.077);
            this.piece(home, 'beam', s * frontMiddle, h * 0.5 - 0.04, d + 0.14, (w - 0.61) * 0.47, 0.05, 0.077);
        }
        this.piece(home, 'beam', 0, h - 0.18, d, 1.43, 0.38, 0.27);
        this.piece(home, 'wood', -0.586, 1.08, d - 0.55, 0.095, 2.11, 1.02);
        this.piece(home, 'stone', 0, -0.02, d + 0.33, 1.49, 0.18, 0.57, { solid: false });
        const rise = 1.38, angle = Math.atan2(rise, w + 0.30);
        for (const s of [-1, 1]) for (const zSection of [-1, 1]) {
            this.piece(home, roof, s * (w + 0.32) * 0.50, h + rise * 0.5, zSection * (d + 0.31) * 0.5,
                Math.hypot(w + 0.33, rise), 0.16, d + 0.38, { roof: true, angle: -s * angle });
        }
        for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
            const span = width * (1 - (i + 1) / 5.5);
            this.piece(home, wall, 0, h + 0.13 + i * rise / 5, s * d, span, rise / 5 + 0.02, 0.26);
        }
        this.piece(home, 'stone', w * 0.71, h + 0.7, -d * 0.55, 0.56, 1.58, 0.56);
        this.piece(home, 'stone', w * 0.71, h + 1.53, -d * 0.55, 0.74, 0.15, 0.70);
        this.piece(home, 'beam', w - 0.72, 0.62, -d + 0.64, 0.84, 0.12, 0.75);
        return home;
    }

    trail() {
        const near = this.api.spawn;
        const end = this.homes[1].door;
        const geometry = new THREE.PlaneGeometry(1.42, 1, 1, 1);
        geometry.rotateX(-Math.PI / 2);
        const positions = [], indices = [], tint = [];
        for (let i = 0; i <= 49; i++) {
            const t = i / 49, x = near.x + (end.x - near.x) * t + Math.sin(t * Math.PI) * 2.6;
            const z = near.z + (end.z - near.z) * t;
            for (const s of [-1, 1]) {
                const vx = x + s * (0.55 + this.rand() * 0.14);
                positions.push(vx, this.api.ground(vx, z) + 0.025, z);
                const n = 0.30 + this.rand() * 0.075;
                tint.push(n, n * 0.78, n * 0.54);
            }
            if (i) {
                const a = i * 2 - 2;
                indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const path = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
        path.receiveShadow = true;
        this.api.scene.add(path);
    }

    trace(a, b, radius) {
        let result = null;
        const delta = b.clone().sub(a), len = delta.length();
        if (len < 0.0001) return result;
        const ray = new THREE.Ray(a, delta.divideScalar(len));
        for (const part of this.parts) {
            if (part.broken) continue;
            const hit = ray.intersectBox(part.bounds.clone().expandByScalar(radius), new V3());
            if (!hit) continue;
            const t = a.distanceTo(hit) / len;
            if (t > 1 || result && t >= result.t) continue;
            result = { t, p: hit, n: a.clone().sub(hit).normalize(), kind: 'house' };
        }
        return result;
    }

    solidAt(x, y, z, radius = 0.24) {
        for (const part of this.parts) {
            if (part.broken || !part.solid) continue;
            const { min, max } = part.bounds;
            if (x + radius > min.x && x - radius < max.x && z + radius > min.z && z - radius < max.z
                && y + 1.6 > min.y && y + 0.11 < max.y) return true;
        }
        return false;
    }

    floor(x, y, z, base) {
        for (const part of this.parts) {
            if (part.broken || part.roof) continue;
            const { min, max } = part.bounds, top = max.y;
            if (top <= y + 0.38 && top > base && x >= min.x && x <= max.x && z >= min.z && z <= max.z) base = top;
        }
        return base;
    }

    blast(point, force, radius) {
        const alarm = new Set();
        for (const part of this.parts) {
            if (part.broken) continue;
            const distance = part.bounds.distanceToPoint(point);
            if (distance >= radius) continue;
            part.hp -= force * (1 - distance / radius);
            if (part.hp <= 0) this.breakPiece(part, point);
            alarm.add(part.home.id);
        }
        for (const part of this.parts) {
            if (!part.roof || part.broken || !alarm.has(part.home.id)) continue;
            const support = this.parts.filter(other => other.home === part.home && !other.broken && !other.roof && other.bounds.max.y >= part.home.y + 2.05);
            if (support.length <= 5) this.breakPiece(part, point);
        }
        return alarm;
    }

    breakPiece(part, point) {
        part.broken = true;
        const v = part.mesh.position.clone().sub(point).normalize().multiplyScalar(2.7);
        v.y += 2.4 + this.rand() * 2;
        this.debris.push({ mesh: part.mesh, v, time: 0, angular: 0.6 + this.rand() * 2.5 });
    }

    async populate() {
        const kits = [0, 1, 2, 3, 4];
        for (const i of kits) {
            const profile = OUTFITS[i], home = this.homes[i < 3 ? i % 2 : 2];
            const p = home.door.clone().add(new V3((i % 2) * 1.7 - 0.7, 0, (i < 3 ? 1.4 : 2.1) + i * 0.23));
            p.y = this.api.ground(p.x, p.z);
            const rig = await this.api.avatar(profile.role === 'wizard' ? 'R' : null, profile, true, i * 8191 + 312);
            const arm = () => ({ ok: false, hand: false, u: new V3(), f: new V3(), h: new V3(), n: new V3(1, 0, 0) });
            rig.arms = { dirs: { L: arm(), R: arm() }, solve() {} };
            const person = { id: 'resident-' + i, rig, profile, home, hp: profile.role === 'knight' ? 36 : 25,
                maxMana: i === 1 ? 100 : 60, mana: i === 1 ? 100 : 60, waypoint: p.clone(), change: i * 1.2,
                pos: p, vel: new V3(), faceYaw: 0, yaw: Math.PI, pitch: 0, grounded: true, vy: 0, justLanded: 0,
                crouch: false, airStyle: 'tuck', view: 'third', landT: 0, jumpPrep: 0, alert: 0, castDelay: i * 0.5, raise: 0, hurt: 0 };
            if (profile.role === 'knight') {
                for (const slot of ['helmet', 'chest', 'legs']) fitArmor(rig, slot, makePiece(slot));
            }
            if (profile.role === 'wizard') {
                rig.colors.coat.value.setHex(profile.coat);
            }
            this.people.push(person);
        }
    }

    hit(person, damage, direction, caster, reaction = 0) {
        if (person.dead) return;
        person.hp -= damage;
        person.alert = 18;
        person.caster = caster;
        person.hurt = Math.max(person.hurt, reaction);
        if (reaction) {
            person.vel.addScaledVector(direction, reaction * 2.7);
            person.vy = 1.4;
            person.grounded = false;
        }
        if (person.hp <= 0) {
            person.dead = true;
            person.fall = 0;
        }
    }

    update(dt) {
        const player = this.api.player();
        for (const person of this.people) {
            const { pos, vel, profile, rig } = person;
            const nearby = pos.distanceToSquared(player.pos) < 100 ** 2;
            rig.holder.visible = nearby;
            if (!nearby) { if (rig.cape) rig.cape.mesh.visible = false; continue; }
            person.hurt = Math.max(0, person.hurt - dt);
            person.alert = Math.max(0, person.alert - dt);
            person.castDelay = Math.max(0, person.castDelay - dt);
            person.raise = Math.max(0, person.raise - dt);
            rig.arms.dirs.R.ok = person.raise > 0;
            person.landT = Math.max(0, person.landT - dt);
            person.mana = Math.min(person.maxMana, person.mana + dt * 2.1);
            if (person.dead) {
                person.fall = Math.min(1, person.fall + dt * 2.6);
                rig.holder.rotation.order = 'YXZ';
                rig.holder.rotation.x = -person.fall * Math.PI * 0.47;
                this.api.animate(rig, dt, 0, person);
                continue;
            }
            const enemy = person.alert && this.api.body(person.caster);
            const distance = enemy ? enemy.distanceTo(pos) : Infinity;
            person.change -= dt;
            if (person.change <= 0 || !enemy && person.waypoint.distanceToSquared(pos) < 0.4) {
                const a = this.rand() * Math.PI * 2, r = 1.5 + this.rand() * 5;
                person.waypoint.set(person.home.door.x + Math.cos(a) * r, pos.y, person.home.door.z + Math.sin(a) * r);
                person.change = 3 + this.rand() * 8;
            }
            const walk = person.waypoint.clone().sub(pos).setY(0);
            if (enemy) {
                walk.copy(enemy).sub(pos).setY(0).normalize();
                if (profile.role === 'resident' || distance < 3) walk.negate();
                else if (profile.role === 'wizard' && distance < 10) walk.multiplyScalar(0.04);
            } else walk.clampLength(0, 1);
            const speed = enemy ? 3.25 : 1.04;
            const goal = vel.clone().lerp(walk.multiplyScalar(speed), 1 - Math.exp(-dt * 4));
            if (person.hurt <= 0) vel.copy(goal);
            else vel.multiplyScalar(Math.exp(-dt * 2.6));
            const nx = pos.x + vel.x * dt, nz = pos.z + vel.z * dt;
            const floor = this.floor(nx, pos.y, nz, this.api.ground(nx, nz));
            if (!this.solidAt(nx, pos.y, nz) && floor - pos.y < 0.66) {
                if (floor - pos.y > 0.2 && person.grounded) {
                    person.vy = 2.7; person.grounded = false; person.airStyle = 'leap';
                }
                pos.x = nx; pos.z = nz;
            } else {
                person.change = 0;
                vel.multiplyScalar(0.15);
            }
            person.justLanded = 0;
            if (!person.grounded) {
                person.vy -= dt * 9.8; pos.y += person.vy * dt;
                if (pos.y <= floor && person.vy < 0) {
                    person.grounded = true; person.justLanded = person.vy; person.vy = 0; person.landT = 0.15;
                }
            }
            if (person.grounded) {
                const footing = this.floor(pos.x, pos.y, pos.z, this.api.ground(pos.x, pos.z));
                if (pos.y - footing > 0.34) person.grounded = false;
                else pos.y = footing;
            }
            const face = enemy && profile.role !== 'resident' ? enemy.clone().sub(pos) : vel;
            if (Math.hypot(face.x, face.z) > 0.2) {
                const yaw = Math.atan2(face.x, face.z);
                person.faceYaw += Math.atan2(Math.sin(yaw - person.faceYaw), Math.cos(yaw - person.faceYaw)) * (1 - Math.exp(-dt * 5));
                person.yaw = person.faceYaw + Math.PI;
            }
            const casting = enemy && profile.role === 'wizard' && distance > 2.5 && distance < 16 && person.castDelay <= 0 && person.mana >= 8;
            if (casting) {
                const aim = enemy.clone().add(new V3(0, 1.08, 0)).sub(pos).add(new V3(0, -1.3, 0))
                    .normalize().applyAxisAngle(new V3(0, 1, 0), -person.faceYaw);
                const arm = rig.arms.dirs.R;
                arm.ok = true;
                arm.u.copy(aim).add(new V3(-0.1, -0.29, 0)).normalize();
                arm.f.copy(aim);
                person.raise = 0.5;
            }
            this.api.animate(rig, dt, vel.length(), person);
            if (casting) {
                if (this.api.cast(person, enemy, 'Jolt')) { person.mana -= 8; person.castDelay = 2 + this.rand() * 1.5; }
                else person.castDelay = 0.55;
            }
        }
        this.debris = this.debris.filter(part => {
            part.time += dt;
            part.v.y -= dt * 9.8;
            part.mesh.rotation.x += part.angular * dt;
            part.mesh.position.addScaledVector(part.v, dt);
            const p = part.mesh.position;
            const floor = this.api.ground(p.x, p.z);
            if (p.y < floor + 0.12) { p.y = floor + 0.12; part.v.multiplyScalar(0.3); }
            if (part.time < 5) return true;
            part.mesh.removeFromParent();
            part.mesh.geometry.dispose();
            return false;
        });
    }

    putTestGear(inventory) {
        const home = this.homes[1];
        const table = new V3(home.x + 1.7, home.y + 0.77, home.z - 1.7);
        inventory.placeLoose(makePiece('helmet'), table);
        inventory.placeLoose(makePiece('chest'), table.clone().add(new V3(-0.72, 0, 0)));
        inventory.placeLoose(makePiece('legs'), table.clone().add(new V3(-1.4, 0, 0)));
        inventory.placeLoose({ ...makeRobe(false, this.rand), color: 0x68432f }, table.clone().add(new V3(-2.11, 0, 0)));
    }
}
