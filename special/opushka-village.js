import * as THREE from 'three';
import { createRng } from '../src/core/math.js';
import { OUTFITS, fitArmor } from './opushka-appearance.js';
import { makePiece, makeRobe } from '../src/game/ArmorTypes.js';

const V3 = THREE.Vector3;
const houses = [
    { dx: -8.5, dz: -2.0, width: 5.6, depth: 4.9, style: 'cottage' },
    { dx: 3.7, dz: 3.0, width: 6.5, depth: 5.2, style: 'hall' },
    { dx: 9.5, dz: -7.1, width: 5.7, depth: 3.8, style: 'workshop' },
];
export const villageClearing = (x, z) => houses.some(({dx, dz, width, depth}) => Math.abs(x - dx) < width / 2 + 2.15 && Math.abs(z - dz) < depth / 2 + 2.7);

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

function roofing(slate) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d'), rand = createRng(slate ? 6061 : 1083);
    g.fillStyle = slate ? '#313a3a' : '#3e2d23';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 10; row++) for (let col = -1; col < 8; col++) {
        const x = col * 37 + (row % 2) * 16, y = row * 25.6, tint = (slate ? 77 : 108) + rand() * 31;
        g.fillStyle = slate ? `rgb(${tint - 9},${tint},${tint + 3})` : `rgb(${tint},${tint * .68},${tint * .47})`;
        g.beginPath();
        g.moveTo(x+1,y);g.lineTo(x+36,y);g.lineTo(x+35-rand()*2,y+23);g.lineTo(x+5,y+25);g.lineTo(x+1,y+22);g.fill();
        g.fillStyle = '#e1cbb324';g.fillRect(x+3,y+1,31,1);
        g.fillStyle = '#191a184d';g.fillRect(x+4,y+21.5,30,3);
        for (let n = 0; n < 13; n++) {
            g.fillStyle = n % 2 ? '#e2d5bd1e' : '#13191425';
            g.fillRect(x+3+rand()*29,y+2+rand()*18,slate?1+rand()*3:0.7,2+rand()*7);
        }
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;map.wrapS = map.wrapT = THREE.RepeatWrapping;map.anisotropy = 4;
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
            tile: material(0xd0bab0, roofing(false)), slate: material(0xb9bebc, roofing(true)), plaster: material(0xcfc3a3),
            dark: material(0x323b34), brass: material(0xa27a45), joinery: material(0xd0c2a4, wood),
            glass: new THREE.MeshPhysicalMaterial({ color: 0xe2ece5, roughness: 0.11, metalness: 0.15,
                transparent: true, opacity: 0.19, depthWrite: false, envMapIntensity: 0.65, side: THREE.DoubleSide }) };
        this.homes = houses.map((plan, id) => this.house(plan, id));
        this.trail();
    }

    piece(home, material, x, y, z, sx, sy, sz, opts = {}) {
        const geometry = opts.geometry || new THREE.BoxGeometry(sx, sy, sz);
        const uv = geometry.attributes.uv;
        for (let i = 0; !opts.geometry && i < uv.count; i++) {
            const face = Math.floor(i / 4), width = face < 2 ? sz : sx, height = face === 2 || face === 3 ? sz : sy;
            const u = uv.getX(i), v = uv.getY(i);
            if (opts.vertical && ![2, 3].includes(face)) uv.setXY(i, v * height / 2.9, u * width / 2.9);
            else uv.setXY(i, u * width / 2.9, v * height / 2.9);
        }
        const mesh = new THREE.Mesh(geometry, this.materials[material]);
        mesh.position.set(home.x + x, home.y + y, home.z + z);
        mesh.rotation.set(opts.pitch || 0, opts.turn || 0, opts.angle || 0);
        mesh.castShadow = material !== 'glass' && Math.max(sx, sy, sz) > 0.30;
        mesh.receiveShadow = material !== 'glass';
        if (material === 'glass') mesh.renderOrder = 2;
        this.api.scene.add(mesh);
        const bounds = new THREE.Box3().setFromObject(mesh);
        const part = { mesh, home, bounds, solid: opts.solid ?? true, roof: !!opts.roof, hp: material === 'stone' ? 2.1 : material === 'glass' ? 0.29 : 1.16, material, broken: false };
        this.parts.push(part);
        return part;
    }

    house(plan, id) {
        const { dx, dz, width, depth, style } = plan;
        const x = this.origin.x + dx, z = this.origin.z + dz, w = width / 2, d = depth / 2;
        const y = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => this.api.ground(x + a * w, z + b * d)))) + 0.13;
        const stone = style === 'hall', shop = style === 'workshop';
        const entrance = stone ? 0 : shop ? -1.36 : 0.78;
        const h = stone ? 3.60 : shop ? 2.28 : 2.65;
        const home = { x, y, z, id, style, width, depth, ruined:false, door: new V3(x + entrance, y, z + d + 0.9) };
        const wall = stone ? 'stone' : 'wood', trim = stone ? 'joinery' : 'beam';
        const add = (mat, a, b, c, u, v, w_, options) => this.piece(home, mat, a, b, c, u, v, w_, options);
        add('stone', 0, -0.52, 0, width + 0.14, 1.03, depth + 0.15, { solid: false });
        add('beam', 0, 0.024, 0, width + 0.05, 0.105, depth + 0.05, { solid: false });
        for (const s of [-1, 1]) {
            for (const half of [-1, 1]) {
                add(wall, s*w,h/2,half*d/2,0.24,h,d+0.02,{vertical:shop});
                add(wall, s*w/2,h/2,-d,w,h,0.24,{vertical:shop});
            }
            add(trim,s*w,h/2,d,0.23,h+0.09,0.29);
            add(trim,s*w,h/2,-d,0.23,h+0.09,0.28);
        }
        const doorHalf = stone ? 0.73 : 0.65, doorTop = stone ? 2.45 : 2.10;
        const windows = stone
            ? [{x:-1.90,w:0.86,base:0.96,top:2.74},{x:1.86,w:0.90,base:0.96,top:2.74}]
            : shop ? [{x:0.71,w:1.26,base:0.83,top:1.88}]
                : [{x:-1.08,w:1.18,base:0.75,top:1.88}];
        const holes = [...windows, { x: entrance, w: doorHalf * 2, base: 0, top: doorTop, door: true }]
            .sort((a, b) => a.x - b.x);
        let cursor = -w;
        for (const hole of holes) {
            const left = hole.x - hole.w / 2;
            if (left > cursor) add(wall,(cursor+left)/2,h/2,d,left-cursor,h,.24,{vertical:shop});
            if (hole.base > 0) add(wall,hole.x,hole.base/2,d,hole.w,hole.base,.25,{vertical:shop});
            add(wall,hole.x,(h+hole.top)/2,d,hole.w,h-hole.top,.25,{vertical:shop});
            if (!hole.door) this.window(home,hole,d,trim,stone);
            cursor = hole.x + hole.w / 2;
        }
        if (cursor < w) add(wall,(cursor+w)/2,h/2,d,w-cursor,h,.24,{vertical:shop});
        add(trim,entrance,doorTop+0.045,d+0.014,doorHalf*2+0.25,0.19,0.36);
        add('wood',entrance-doorHalf+0.029,doorTop*.5,d-.46,.064,doorTop-.08,.92,{vertical:true});
        add('brass',entrance-doorHalf+.085,1.01,d-.18,.095,.14,.064,{solid:false});
        add('stone',entrance,0.10,d+.28,doorHalf*2+.26,.23,.45,{solid:false});
        add('stone',entrance,-.015,d+.63,doorHalf*2+.45,.17,.31,{solid:false});

        if (stone) {
            this.hipRoof(home,w,d,h);
            this.tower(home,2.07,-1.9,h);
            add('joinery',0,h-.30,d+.15,width,.18,.15,{solid:false});
            add('joinery',0,.36,d+.15,width,.17,.15,{solid:false});
        } else if (shop) {
            this.shedRoof(home,w,d,h);
            this.leanTo(home,w-1.34,d,h);
            // A counter and tools built into the workshop's rear wall.
            add('beam',1.24,.83,-d+.54,1.85,.15,.85);
            add('wood',1.24,.38,-d+.54,1.62,.76,.56);
        } else {
            this.gable(home,w,d,h);
            this.porch(home,entrance,d,doorTop);
            add('beam',-w*.63,1.04,d+.24,1.21,.17,.39,{solid:false});
        }
        if (!stone) {
            add('stone',w*.58,h+.89,-d*.58,.46,1.92,.54);
            add('stone',w*.58,h+1.85,-d*.58,.64,.13,.71);
        }
        if (!shop) {
            add('beam',w-.87,.58,-d+.72,1.04,.14,.91);
            add('wood',w-1.38,.29,-d+.69,.11,.57,.71);
            add('wood',w-.36,.29,-d+.69,.11,.57,.71);
        }
        return home;
    }

    window(home, hole, z, trim, tall) {
        const { x, w, base, top } = hole, h = top-base;
        const y = (base+top)/2, bar = tall ? 0.073 : 0.085;
        const add = (mat, a, b, c, u, v, k, opts) => this.piece(home,mat,a,b,c,u,v,k,opts);
        add('glass',x,y,z-.009,w-.045,h-.047,.024,{solid:false});
        for (const s of [-1,1]) add(trim,x+s*w*.49,y,z+.14,bar,h+.15,.14);
        add(trim,x,top,z+.14,w+.12,bar,.17);
        add(trim,x,base,z+.18,w+.18,.092,.23);
        add(trim,x,y,z+.092,bar*.62,h,.062,{solid:false});
        add(trim,x,y+(tall?.32:.09),z+.092,w,bar*.64,.062,{solid:false});
        if (tall) {
            const radius = w*.61;
            const curve = new THREE.TorusGeometry(radius,.095,7,20,Math.PI);
            add('joinery',x,top-.075,z+.179,radius*2,.28,.18,{geometry:curve,solid:false});
        }
    }

    roofFace(home, material, points) {
        const g = new THREE.BufferGeometry(), uv = [];
        const vertices = points.map(p => new V3(...p));
        const origin = vertices[0];
        const center = vertices.reduce((sum,p) => sum.add(p), new V3()).divideScalar(vertices.length);
        const u = vertices[1].clone().sub(origin).normalize();
        const normal = u.clone().cross(vertices.at(-1).clone().sub(origin)).normalize();
        const v = normal.clone().cross(u).normalize();
        for (const vertex of vertices) {
            const q = vertex.clone().sub(origin);
            uv.push(q.dot(u)/2.5,q.dot(v)/2.5);
        }
        g.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(p => p.sub(center).toArray()),3));
        g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        const indices = points.length===3 ? [0,1,2] : [0,1,2,0,2,3];
        if (normal.y < 0) for (let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
        g.setIndex(indices);
        g.computeVertexNormals();
        this.piece(home,material,center.x,center.y,center.z,1,1,1,{geometry:g,roof:true,solid:false});
    }

    gable(home, w, d, h) {
        const ridge=-.59, rise=2.22, eave=w+.43, end=d+.45;
        for (const side of [-1,1]) {
            const midX=(ridge+side*eave)/2, length=Math.hypot(side*eave-ridge,rise+.18);
            const angle=Math.atan2(-side*(rise+.18),Math.abs(side*eave-ridge));
            for (const z of [-end/2,end/2]) this.piece(home,'tile',midX,h+rise/2,z,length,.17,end+.055,{roof:true,angle});
            this.piece(home,'beam',side*eave,h-.066,0,.14,.21,end*2+.14,{roof:true});
        }
        const gable=new THREE.Shape();
        gable.moveTo(-w,h);gable.lineTo(w,h);gable.lineTo(ridge,h+rise);gable.closePath();
        const hole=new THREE.Path();
        hole.moveTo(ridge-.31,h+.34);hole.lineTo(ridge-.31,h+1.03);
        hole.lineTo(ridge+.31,h+1.03);hole.lineTo(ridge+.31,h+.34);hole.closePath();
        gable.holes.push(hole);
        for (const side of [-1,1]) {
            const shape=side>0?gable: new THREE.Shape([new THREE.Vector2(-w,h),new THREE.Vector2(w,h),new THREE.Vector2(ridge,h+rise)]);
            const geometry = new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false});
            const uv=geometry.attributes.uv;
            for (let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2.9,uv.getY(i)/2.9);
            geometry.translate(0,-h-rise*.31,0);
            this.piece(home,'wood',0,h+rise*.31,side*d-.071,1,1,1,{geometry,solid:false});
        }
        this.piece(home,'beam',ridge,h+rise+.045,0,.23,.16,end*2,{roof:true});
        this.window(home,{x:ridge,w:.62,base:h+.34,top:h+1.03},d+.071,'beam',false);
    }

    hipRoof(home,w,d,h) {
        const e=w+.42,l=d+.42,r=1.58,k=.75;
        const a=[-e,h,-l],b=[e,h,-l],c=[e,h,l],d0=[-e,h,l],u=[-k,h+r,0],v=[k,h+r,0];
        for (const points of [[a,b,v,u],[d0,u,v,c],[a,u,d0],[b,c,v]]) this.roofFace(home,'slate',points);
        this.piece(home,'dark',0,h+r,0,1.64,.13,.15,{roof:true});
        this.piece(home,'dark',0,h-.02,-l,e*2,.16,.12,{roof:true});
        this.piece(home,'dark',0,h-.02,l,e*2,.16,.12,{roof:true});
    }

    tower(home,x,z,wallHeight) {
        const radius=.83,height=wallHeight+1.36, sides=10;
        for (let i=0;i<sides;i++) {
            const angle=(i+.5)*Math.PI*2/sides;
            this.piece(home,'stone',x+Math.sin(angle)*radius,height*.5,z+Math.cos(angle)*radius,
                2*radius*Math.tan(Math.PI/sides)+.07,height,.215,{turn:angle});
        }
        const cone=new THREE.ConeGeometry(1.05,1.47,10,1,false);
        this.piece(home,'slate',x,height+.67,z,2.1,1.47,2.1,{geometry:cone,roof:true,solid:false});
        this.piece(home,'brass',x,height+1.50,z,.075,.24,.075,{roof:true,solid:false});
    }

    shedRoof(home,w,d,h) {
        const lean=.20, length=(d+.37)*2, roofY=h+.44;
        for (const side of [-1,1]) {
            this.piece(home,'tile',side*w*.50,roofY,0,w+.51,.15,length,
                {pitch:lean,roof:true});
        }
        this.piece(home,'wood',0,h+.13,-d,w*2,.35,.16,{vertical:true});
        this.piece(home,'beam',0,h+.25,d+.30,w*2+.43,.14,.15,{roof:true});
    }

    porch(home,x,d,top) {
        for (const side of [-1,1]) this.piece(home,'beam',x+side*.85,1.13,d+1.01,.14,2.10,.16);
        this.piece(home,'tile',x,top+.21,d+.63,2.16,.135,1.55,{pitch:.16,roof:true});
        this.piece(home,'beam',x,top+.064,d+1.08,1.97,.14,.14);
        this.piece(home,'beam',x,-.018,d+.79,1.98,.145,1.20,{solid:false});
    }

    leanTo(home,x,d,h) {
        const z=-d-.65;
        this.piece(home,'wood',x,.73,z-.48,1.6,1.48,.13,{vertical:true});
        this.piece(home,'wood',x+.82,.73,z,.13,1.48,.98,{vertical:true});
        this.piece(home,'beam',x-.79,.78,z-.44,.13,1.58,.13);
        this.piece(home,'tile',x,h-.38,z,1.98,.13,1.44,{pitch:-.23,roof:true});
        this.piece(home,'wood',x,.46,z,.87,.47,.59,{vertical:true});
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
        const box = new THREE.Box3(), point = new V3();
        for (const part of this.parts) {
            if (part.broken) continue;
            const hit = ray.intersectBox(box.copy(part.bounds).expandByScalar(radius), point);
            if (hit && part.roof) {
                const caster = new THREE.Raycaster(a, ray.direction, 0, len);
                const surface = caster.intersectObject(part.mesh, false)[0];
                if (!surface) continue;
                hit.copy(surface.point);
            }
            if (!hit) continue;
            const t = a.distanceTo(hit) / len;
            if (t > 1 || result && t >= result.t) continue;
            result = { t, p: hit.clone(), n: a.clone().sub(hit).normalize(), kind: 'house' };
        }
        return result;
    }

    solidAt(x, y, z, radius = 0.24) {
        if (Math.abs(x - this.origin.x) > 16 || Math.abs(z - this.origin.z) > 14) return false;
        for (const part of this.parts) {
            if (part.broken || !part.solid) continue;
            const { min, max } = part.bounds;
            if (x + radius > min.x && x - radius < max.x && z + radius > min.z && z - radius < max.z
                && y + 1.6 > min.y && y + 0.11 < max.y) return true;
        }
        return false;
    }

    floor(x, y, z, base) {
        if (Math.abs(x - this.origin.x) > 16 || Math.abs(z - this.origin.z) > 14) return base;
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
        for (const house of this.homes) {
            if (alarm.has(house.id)) house.ruined = !this.parts.some(part => part.home === house && part.roof && !part.broken);
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
