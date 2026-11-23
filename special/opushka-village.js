import * as THREE from 'three';
import { createRng } from '../src/core/math.js';
import { OUTFITS, fitArmor } from './opushka-appearance.js';
import { makePiece, makeRobe } from '../src/game/ArmorTypes.js';
import { RigidProp } from '../src/game/RigidProp.js';
import { CASTLE_PLAN, CASTLE_HOUSES, MARKET_SITE, TOWN_PATHS, buildOpushkaCastle } from './opushka-castle.js';
import { stallTrades, SHOPS } from '../src/game/MarketGoods.js';
import { VillagerBrain } from '../src/game/VillagerBrain.js';
import { SpeechBubble } from '../src/ui/SpeechBubble.js';

const V3 = THREE.Vector3;
const houses = [
    { dx: -8.5, dz: -2.0, width: 5.6, depth: 4.9, style: 'cottage' },
    { dx: 3.7, dz: 3.0, width: 6.5, depth: 5.2, style: 'hall' },
    { dx: 9.5, dz: -7.1, width: 5.7, depth: 3.8, style: 'workshop' },
];
const sites = [...houses, CASTLE_PLAN, ...CASTLE_HOUSES, MARKET_SITE];
export const villageClearing = (x, z) => sites.some(({dx, dz, width, depth}) => Math.abs(x - dx) < width / 2 + 2.15 && Math.abs(z - dz) < depth / 2 + 2.7);

function siding(stone, seed, castle = false) {
    const rand = createRng(seed);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = castle ? '#3d3d36' : stone ? '#5e594f' : '#493228';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
        let x = stone ? -rand() * 75 : 0;
        do {
            const width = stone ? 26 + rand() * 66 : 256;
            const grey = Math.round((castle ? 86 : stone ? 124 : 110) + rand() * (castle ? 54 : 35));
            ctx.fillStyle = stone ? `rgb(${grey},${grey - 4},${grey - 12})` : `rgb(${grey},${grey * 0.72},${grey * 0.46})`;
            ctx.fillRect(x, row * 32 + 1, width - (stone ? 3 : 0), 29);
            ctx.fillStyle = '#eee4cc38';
            ctx.fillRect(x + 2, row * 32 + 2, width - 4, 2);
            ctx.fillStyle = '#25211943';
            ctx.fillRect(x + 1, row * 32 + 27, width - 3, 3);
            x += width;
        } while (x < 256);
    }
    if(castle)for(let i=0;i<320;i++){
        const x=rand()*256,y=rand()*256,r=3+rand()*19;
        const stain=ctx.createRadialGradient(x,y,0,x,y,r);
        stain.addColorStop(0,i%4?'#28282037':'#63623b61');
        stain.addColorStop(1,'#28282000');
        ctx.fillStyle=stain;ctx.fillRect(x-r,y-r,r*2,r*2);
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
        this.doors = [];
        this.people = [];
        this.stalls = [];
        this.bubbles = new Set();
        this.dirtyBatches = new Set();
        this.rand = createRng(20311);
        const wood = siding(false, 22), stones = siding(true, 92), rubble = siding(true, 701, true);
        const material = (color, map = null) => new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 0.062, roughness: 0.87 });
        this.materials = { wood: material(0xf6ce9b, wood), stone: material(0xe5decb, stones), beam: material(0x4c3325, wood),
            tile: material(0xd0bab0, roofing(false)), slate: material(0xb9bebc, roofing(true)), plaster: material(0xcfc3a3),
            dark: material(0x323b34), brass: material(0xa27a45), joinery: material(0xd0c2a4, wood),
            banner: new THREE.MeshStandardMaterial({ color: 0x783240, roughness: .92, side: THREE.DoubleSide }),
            castleRock: material(0xb9ad96, rubble), castleDressed: material(0xc8c0a9, rubble),
            castleShadow: material(0x8d8679, rubble), marketCloth: material(0xc0a883),
            glass: new THREE.MeshPhysicalMaterial({ color: 0xe2ece5, roughness: 0.11, metalness: 0.15,
                transparent: true, opacity: 0.19, depthWrite: false, envMapIntensity: 0.65, side: THREE.DoubleSide }) };
        this.homes = houses.map((plan, id) => this.house(plan, id));
        this.castle=buildOpushkaCastle(this,CASTLE_PLAN,this.homes.length);
        this.homes.push(this.castle);
        for(const plan of CASTLE_HOUSES)this.homes.push(this.house(plan,this.homes.length));
        this.market();
        this.debrisWorld = {
            ground: (x,z,y) => this.floor(x,y-.37,z,api.ground(x,z), .07),
            blocked: (x,y,z) => this.collisionBoxes(x,x,z,z).some(b => y > b.minY && y < b.maxY),
        };
        this.trail();
        this.makeIndex();
        this.batchBuildings();
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
        const masonry = material.startsWith('castle');
        const part = { mesh, home, bounds, solid: opts.solid ?? true, roof: !!opts.roof,
            hp: masonry ? 3.5 : material === 'stone' ? 2.1 : material === 'glass' ? 0.29 : 1.16,
            material, broken: false, supports: opts.supports || null, precise:opts.turn||opts.angle||opts.round,
            footprint:opts.round ? {radius:opts.round} : opts.turn ? {hx:sx/2,hz:sz/2,c:Math.cos(opts.turn),s:Math.sin(opts.turn)} : null };
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
        this.door(home,entrance,d,doorHalf,doorTop,stone);
        add('stone',entrance,0.10,d+.28,doorHalf*2+.26,.23,.45,{solid:false});
        add('stone',entrance,-.015,d+.63,doorHalf*2+.45,.17,.31,{solid:false});

        if (stone) {
            this.hipRoof(home,w,d,h);
            this.tower(home,2.23,-1.73,h);
            this.stoneWing(home,-w,d);
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
        this.yard(home,w,d,shop);
        return home;
    }

    door(home, x, z, half, height, stone, base = 0) {
        const width=half*2-.065;
        const part=this.piece(home,'wood',x-half+.037,base+height*.5,z+.018,width,height-.09,.102,{vertical:true});
        part.mesh.geometry.translate(width*.5,0,0);
        const railMat=this.materials[stone?'joinery':'beam'];
        const rails=new THREE.Mesh(new THREE.BoxGeometry(width-.10,.09,.054),railMat);
        const lower=rails.clone();
        rails.position.set(width*.5,height*.32,.075);
        lower.position.set(width*.5,-height*.32,.075);
        part.mesh.add(rails,lower);
        const latch=new THREE.Mesh(new THREE.TorusGeometry(.062,.017,7,18),this.materials.brass);
        latch.position.set(width-.14,-.12,.085);
        part.mesh.add(latch);
        part.mesh.updateMatrixWorld(true);
        part.bounds.setFromObject(part.mesh);
        part.precise=true;
        this.doors.push({part,handle:latch,angle:0,goal:0,last:-Infinity});
    }

    toggleDoor(door, point) {
        if(door.part.broken || performance.now()-door.last<520)return false;
        const base=door.part.mesh.position;
        door.goal=door.goal?0:point.z>=base.z?1.43:-1.43;
        door.last=performance.now();
        this.api.sound?.('door',base);
        return true;
    }

    touchDoor(point) {
        for(const door of this.doors){
            if(!door.part.broken&&door.handle.getWorldPosition(new V3()).distanceToSquared(point)<.29**2)return this.toggleDoor(door,point);
        }
        return false;
    }

    windDoor(origin,direction) {
        let best=null,dist=3.5;
        for(const door of this.doors){
            if(door.part.broken)continue;
            const target=door.handle.getWorldPosition(new V3()), delta=target.sub(origin);
            const d=delta.length();
            if(d>=dist || (d>.6&&direction.angleTo(delta)>1.1))continue;
            const wall=this.trace(origin,door.handle.getWorldPosition(new V3()),0);
            if(wall&&wall.part!==door.part&&wall.p.distanceTo(origin)<d-.24)continue;
            best=door;dist=d;
        }
        return !!best&&this.toggleDoor(best,origin);
    }

    stoneWing(home,w,d) {
        const x=w-1.16,z=d-.75,h=2.66,wide=1.98,deep=2.26;
        const corner=this.piece(home,'stone',x-wide*.50-.09,h*.50,z,.25,h,deep+.18);
        this.piece(home,'stone',x,h*.50,z+deep*.50,wide,h,.25);
        this.piece(home,'stone',x,h*.50,z-deep*.50,wide,h,.25);
        this.piece(home,'stone',x,-.40,z,wide+.22,.82,deep+.12,{solid:false});
        const a=[x-wide*.66,h,z-deep*.68],b=[x+wide*.66,h+.50,z-deep*.68],
              c=[x+wide*.66,h+.50,z+deep*.68],d0=[x-wide*.66,h,z+deep*.68];
        this.roofFace(home,'slate',[a,b,c,d0]);
        this.piece(home,'joinery',x-wide*.56,h-.11,z,.16,.19,deep*1.2,{roof:true});
        corner.mesh.name='annex-stone-wall';
        for(let i=0;i<3;i++)this.piece(home,'stone',x-.1,.14-i*.105,d+.65+i*.36,2.65+i*.2,.23,.38,{solid:false});
    }

    yard(home,w,d,shop) {
        const px=shop?w*.63:-w*.60,z=d+.65;
        this.piece(home,'beam',px,.36,z,1.31,.13,.43,{solid:false});
        for(const side of [-1,1])this.piece(home,'stone',px+side*.44,.15,z,.14,.32,.36,{solid:false});
        for(let i=0;i<3;i++){
            const bx=(shop?1:-1)*(w+.33+i*.41),bz=d-.34+(i%2)*.44;
            const g=new THREE.DodecahedronGeometry(.29,1);
            g.scale(.97,.79,1.07);
            this.piece(home,'dark',bx,.37,bz,.55,.4,.56,{geometry:g,solid:false});
        }
        if(!shop){
            for(let i=0;i<4;i++){
                const bx=w+.24+i*.26,bz=-d*.46,zOff=(i%2)*.08;
                this.piece(home,'beam',bx,.17+zOff,bz,.28,.29,1.06,{solid:false});
            }
        }
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
        return this.piece(home,material,center.x,center.y,center.z,1,1,1,{geometry:g,roof:true,solid:false});
    }

    nearSite(loX,hiX,loZ,hiZ) {
        return sites.some(({dx,dz,width,depth})=>{
            const x=this.origin.x+dx,z=this.origin.z+dz,rx=width/2+3,rz=depth/2+3;
            return hiX>=x-rx&&loX<=x+rx&&hiZ>=z-rz&&loZ<=z+rz;
        });
    }

    makeIndex() {
        this.cells=new Map();
        for(const part of this.parts){
            if(this.doors.some(d=>d.part===part))continue;
            const {min,max}=part.bounds;
            for(let z=Math.floor(min.z/5);z<=Math.floor(max.z/5);z++)for(let x=Math.floor(min.x/5);x<=Math.floor(max.x/5);x++){
                const key=z*4096+x;let list=this.cells.get(key);
                if(!list)this.cells.set(key,list=[]);
                list.push(part);
            }
        }
    }

    batchBuildings() {
        if(!this.api.mergeGeometries)return;
        const batches=new Map();
        for(const part of this.parts){
            const {mesh}=part;
            if(mesh.children.length||mesh.material.transparent)continue;
            const {x,z}=mesh.position,g=mesh.geometry;
            const key=[part.material,mesh.castShadow,Math.floor(x/15),Math.floor(z/15),!!g.index,Object.keys(g.attributes).join(',')].join(':');
            const batch=batches.get(key)||{parts:[],combined:null};
            batch.parts.push(part);
            batches.set(key,batch);
        }
        for(const batch of batches.values()){
            if(batch.parts.length<2)continue;
            for(const part of batch.parts){
                part.batch=batch;
                part.batchGeometry=part.mesh.geometry.clone().applyMatrix4(part.mesh.matrixWorld);
                part.mesh.removeFromParent();
            }
            this.rebuildBatch(batch);
        }
    }

    rebuildBatch(batch) {
        const live=batch.parts.filter(p=>!p.broken);
        if(batch.combined){
            batch.combined.removeFromParent();
            batch.combined.geometry.dispose();
            batch.combined=null;
        }
        if(!live.length)return;
        const model=live[0].mesh,geometry=this.api.mergeGeometries(live.map(p=>p.batchGeometry));
        if(!geometry){
            for(const part of live){part.batch=null;part.batchGeometry.dispose();part.batchGeometry=null;this.api.scene.add(part.mesh);}
            return;
        }
        const combined=batch.combined=new THREE.Mesh(geometry,model.material);
        combined.castShadow=model.castShadow;
        combined.receiveShadow=model.receiveShadow;
        this.api.scene.add(combined);
    }

    candidates(loX,hiX,loZ,hiZ) {
        const found=new Set();
        for(let z=Math.floor(loZ/5);z<=Math.floor(hiZ/5);z++)for(let x=Math.floor(loX/5);x<=Math.floor(hiX/5);x++){
            for(const part of this.cells.get(z*4096+x)||[])found.add(part);
        }
        for(const {part} of this.doors)if(part.bounds.max.x>=loX&&part.bounds.min.x<=hiX&&part.bounds.max.z>=loZ&&part.bounds.min.z<=hiZ)found.add(part);
        return found;
    }

    inFootprint(part,x,z,margin) {
        const f=part.footprint;
        if(!f)return true;
        const dx=x-part.mesh.position.x,dz=z-part.mesh.position.z;
        if(f.radius)return dx*dx+dz*dz<(f.radius+margin)**2;
        return Math.abs(dx*f.c-dz*f.s)<f.hx+margin&&Math.abs(dx*f.s+dz*f.c)<f.hz+margin;
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
        const start = this.api.spawn, end = this.homes[1].door;
        this.path([start,start.clone().lerp(end,.5).add(new V3(1.5,0,0)),end],1.35);
        for(const {wide,points} of TOWN_PATHS){
            this.path(points.map(([x,z])=>new V3(this.origin.x+x,0,this.origin.z+z)),wide);
        }
    }

    path(points, width) {
        const route=new THREE.CatmullRomCurve3(points),length=route.getLength(),steps=Math.ceil(length/.48);
        const positions=[],indices=[],colors=[];
        for(let i=0;i<=steps;i++){
            const t=i/steps,p=route.getPointAt(t),d=route.getTangentAt(t);
            const w=width*(.36+.10*Math.sin(t*9.1)+this.rand()*.1);
            for(const side of [-1,1]){
                const x=p.x+d.z*w*side,z=p.z-d.x*w*side;
                positions.push(x,this.api.ground(x,z)+.034,z);
                const tint=.135+this.rand()*.038+(width>1.8?.015:0);
                colors.push(tint,tint*.73,tint*.53);
            }
            if(i){const a=i*2-2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
        }
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
        this.pathMaterial ||= new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.98});
        const mesh=new THREE.Mesh(g,this.pathMaterial);mesh.receiveShadow=true;this.api.scene.add(mesh);
    }

    market() {
        const {dx,dz,width,depth}=MARKET_SITE,x=this.origin.x+dx,z=this.origin.z+dz;
        const home={id:this.homes.length,x,z,y:0,width,depth,style:'market',door:new V3(x,this.api.ground(x,z),z+3)};
        this.homes.push(home);
        const trades=stallTrades('opushka-castle',3);
        const add=(...args)=>this.piece(home,...args);
        for(const [i,trade] of trades.entries()){
            const px=-6.2+i*6.3,pz=.45+Math.sin(i*2.2)*1.4,base=this.api.ground(x+px,z+pz);
            const post=(a,b)=>add('beam',px+a,base+1.12,pz+b,.13,2.35,.14);
            const posts=[post(-1.35,-.95),post(1.35,-.95),post(-1.35,1.03),post(1.35,1.03)];
            const counter=add(i===1?'stone':'wood',px,base+.76,pz+.45,2.42,.32,.87);
            add('beam',px,base+.31,pz+.45,2.05,.69,.68,{supports:[counter]});
            const awning=i%2?'marketCloth':'banner';
            add(awning,px,base+2.4,pz-.04,3.14,.07,2.50,{pitch:.12-i*.10,solid:false,roof:true,supports:posts});
            add(awning,px,base+2.29,pz+1.19,3.13,.21,.045,{solid:false,supports:posts});
            add('wood',px+1.66,base+.34,pz-.61,.51,.69,.57);
            this.stalls.push({home,trade,counter,top:counter.bounds.max.y,x:x+px,z:z+pz+.45});
        }
        const wellX=-11.2,wellZ=2.9,base=this.api.ground(x+wellX,z+wellZ);
        const ring=new THREE.CylinderGeometry(.98,.98,.68,13,1,true);
        ring.scale(1,1,.94);
        add('stone',wellX,base+.33,wellZ,2,.68,2,{geometry:ring,round:.98});
        add('dark',wellX,base+.09,wellZ,1.64,.07,1.55,{geometry:new THREE.CylinderGeometry(.84,.84,.07,13)});
        add('beam',wellX-.62,base+1.22,wellZ,.13,2.10,.16);
        add('beam',wellX+.62,base+1.22,wellZ,.13,2.10,.16);
        add('beam',wellX,base+1.78,wellZ,1.45,.18,.18);
        add('brass',wellX+.23,base+1.09,wellZ,.027,1.23,.027,{solid:false});
        add('wood',wellX+.23,base+.57,wellZ,.32,.36,.32,{geometry:new THREE.CylinderGeometry(.19,.14,.36,10)});
        for(const [n,kind] of ['smith','tavern'].entries()){
            const house=this.homes[n===0?5:6];
            const ax=house.x-x-1.8,az=house.door.z-z+.85,h=this.api.ground(x+ax,z+az);
            const counter=add('wood',ax,h+.72,az,2.10,.31,.72);
            add('beam',ax,h+.31,az,1.86,.66,.54,{supports:[counter]});
            this.stalls.push({home:house,trade:SHOPS[kind],counter,top:counter.bounds.max.y,x:x+ax,z:z+az});
        }
        const cottage=this.homes[4];
        const px=cottage.x-x-3.25,pz=cottage.z-z+3.5,soil=this.api.ground(x+px,z+pz);
        for(let row=-1;row<=1;row++){
            add('dark',px+row*.49,soil+.035,pz,.33,.105,2.66,{solid:false,turn:.28});
            for(let i=0;i<5;i++){
                const g=new THREE.IcosahedronGeometry(.16,1);g.scale(1,.66,1);
                add('marketCloth',px+row*.49,soil+.13,pz+(i-2)*.45,.31,.22,.31,{geometry:g,solid:false});
            }
        }
        add('wood',px-.95,soil+.34,pz,.13,.71,3.13,{solid:false,turn:.24});
    }

    stock(inventory) {
        this.inventory=inventory;
        for(let counter=0;counter<this.stalls.length;counter++){
            const stall=this.stalls[counter];
            stall.goods=stall.trade.goods.map((good,index)=>{
                const uid='castle-market:'+counter+':'+index,position=new V3(stall.x+(index-1)*.65,stall.top+.13,stall.z);
                inventory.placeLoose({...good,uid},position,0,()=>{
                    if(stall.counter.broken)return false;
                    this.api.notify?.(good.price+' монет · положите мешочек на прилавок рядом с товаром');
                    return false;
                });
                return {good,uid,position,sold:false};
            });
        }
        inventory.storeItem({kind:'coins',count:80});
    }

    pay(item,p) {
        if(item.kind!=='coins')return false;
        const stall=this.stalls.find(s=>!s.counter.broken&&Math.abs(p.x-s.x)<1.27&&Math.abs(p.z-s.z)<.56&&Math.abs(p.y-s.top)<.46);
        if(!stall)return false;
        const offer=stall.goods?.filter(o=>!o.sold).sort((a,b)=>Math.abs(a.position.x-p.x)-Math.abs(b.position.x-p.x))[0];
        if(!offer){this.api.notify?.('На прилавке всё продано');return false;}
        const {good,uid,position}=offer;
        if(item.count<good.price){this.api.notify?.('Нужно '+good.price+' монет');return false;}
        item.count-=good.price;
        offer.sold=true;
        if(stall.seller)stall.seller.brain.memory.trades++;
        this.inventory.removeLoose(uid);
        const {price,...paid}=good;
        this.inventory.placeLoose(paid,position.clone().add(new V3(0,0,.33)),0);
        if(item.count)this.inventory.placeLoose(item,p.clone().setY(stall.top+.12).add(new V3(0,0,.16)),0);
        this.api.notify?.('Куплено за '+price+' монет');
        return true;
    }

    hear(text) {
        const eye=this.api.player().pos.clone().add(new V3(0,1.45,0));
        const last=this.talkTo;
        const person=this.people.filter(p=>!p.dead&&!p.rig.limp&&p.pos.distanceToSquared(eye)<4.7**2).sort((a,b)=>
            a.pos.distanceToSquared(eye)-b.pos.distanceToSquared(eye)||(a===last?-1:0))[0];
        if(!person)return;
        const answer=person.brain.hear(text,{now:performance.now(),selfId:'me',danger:person.alert>0});
        if(answer.action==='follow')person.follow=true;
        else if(answer.action==='stop_follow')person.follow=false;
        if(!answer.reply)return;
        this.talkTo=person;
        if(!person.bubble){
            person.bubble=new SpeechBubble({offsetY:.14});
            this.api.scene.add(person.bubble.sprite);
        }
        this.bubbles.add(person);
        person.bubble.show(answer.reply,{name:person.name,seconds:Math.min(9,3.2+answer.reply.length*.035)});
    }

    trace(a, b, radius) {
        if (!this.nearSite(Math.min(a.x,b.x)-radius,Math.max(a.x,b.x)+radius,Math.min(a.z,b.z)-radius,Math.max(a.z,b.z)+radius)) return null;
        let result = null;
        const delta = b.clone().sub(a), len = delta.length();
        if (len < 0.0001) return result;
        const ray = new THREE.Ray(a, delta.divideScalar(len));
        const box = new THREE.Box3(), point = new V3();
        for (const part of this.candidates(Math.min(a.x,b.x)-radius,Math.max(a.x,b.x)+radius,Math.min(a.z,b.z)-radius,Math.max(a.z,b.z)+radius)) {
            if (part.broken) continue;
            const hit = ray.intersectBox(box.copy(part.bounds).expandByScalar(radius), point);
            if (hit && (part.roof || part.precise)) {
                const caster = new THREE.Raycaster(a, ray.direction, 0, len);
                const surface = caster.intersectObject(part.mesh, false)[0];
                if (!surface) continue;
                hit.copy(surface.point);
            }
            if (!hit) continue;
            const t = a.distanceTo(hit) / len;
            if (t > 1 || result && t >= result.t) continue;
            result = { t, p: hit.clone(), n: a.clone().sub(hit).normalize(), kind: 'house', part };
        }
        return result;
    }

    solidAt(x, y, z, radius = 0.24) {
        if (!this.nearSite(x-radius,x+radius,z-radius,z+radius)) return false;
        for (const part of this.candidates(x-radius,x+radius,z-radius,z+radius)) {
            if (part.broken || !part.solid) continue;
            const { min, max } = part.bounds;
            if (x + radius > min.x && x - radius < max.x && z + radius > min.z && z - radius < max.z
                && y + 1.6 > min.y && y + 0.11 < max.y && this.inFootprint(part,x,z,radius)) return true;
        }
        return false;
    }

    collisionBoxes(loX, hiX, loZ, hiZ) {
        if (!this.nearSite(loX,hiX,loZ,hiZ)) return [];
        const result = [];
        for (const part of this.candidates(loX,hiX,loZ,hiZ)) {
            if (part.broken || !part.solid || part.roof) continue;
            const { min, max } = part.bounds;
            if (hiX < min.x || loX > max.x || hiZ < min.z || loZ > max.z) continue;
            if(!this.inFootprint(part,(loX+hiX)*.5,(loZ+hiZ)*.5,Math.max(hiX-loX,hiZ-loZ)*.5))continue;
            result.push({ minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z });
        }
        return result;
    }

    floor(x, y, z, base, reach = .38) {
        if (!this.nearSite(x,x,z,z)) return base;
        for (const part of this.candidates(x,x,z,z)) {
            if (part.broken || part.roof) continue;
            const { min, max } = part.bounds, top = max.y;
            if (top <= y + reach && top > base && x >= min.x && x <= max.x && z >= min.z && z <= max.z&&this.inFootprint(part,x,z,0)) base = top;
        }
        return base;
    }

    blast(point, force, radius) {
        const alarm = new Set();
        for (const part of this.candidates(point.x-radius,point.x+radius,point.z-radius,point.z+radius)) {
            if (part.broken) continue;
            const distance = part.bounds.distanceToPoint(point);
            if (distance >= radius) continue;
            part.hp -= force * (1 - distance / radius);
            if (part.hp <= 0) this.breakPiece(part, point);
            alarm.add(part.home.id);
        }
        for (const part of this.parts) {
            if (part.broken || !alarm.has(part.home.id)) continue;
            if (part.supports) {
                const needed=part.supports.length>=3?2:1;
                if(part.supports.filter(s=>!s.broken).length<needed)this.breakPiece(part,point,true);
                continue;
            }
            if (!part.roof || part.home.style==='castle') continue;
            const support = this.parts.filter(other => other.home === part.home && !other.broken && !other.roof && other.bounds.max.y >= part.home.y + 2.05);
            if (support.length <= 5) this.breakPiece(part, point, true);
        }
        for (const house of this.homes) {
            if (alarm.has(house.id)) house.ruined = !this.parts.some(part => part.home === house && part.roof && !part.broken);
        }
        for(const batch of this.dirtyBatches)this.rebuildBatch(batch);
        this.dirtyBatches.clear();
        return alarm;
    }

    breakPiece(part, point, unsupported = false) {
        part.broken = true;
        if(part.batch){
            this.dirtyBatches.add(part.batch);
            part.batchGeometry.dispose();
            part.batchGeometry=null;
            this.api.scene.add(part.mesh);
        }
        const stall=this.stalls.find(s=>s.counter===part);
        for(const offer of stall?.goods||[]) if(!offer.sold)this.inventory?.removeLoose(offer.uid);
        const vel = part.mesh.position.clone().sub(point).normalize().multiplyScalar(unsupported ? .65 : 2.7);
        vel.y = unsupported ? -.34 : vel.y + 2.4 + this.rand() * 2;
        const spin = new V3(.6+this.rand()*2.5,.7-this.rand()*1.4,this.rand()-.5);
        this.debris.push({ body: new RigidProp(part.mesh, { vel, spin }), time: 0 });
    }

    async populate() {
        const kits = [0,1,2,3,4,6,7,8].map(i=>({i,profile:OUTFITS[i],home:this.homes[i>=6?3:i<3?i%2:2]}));
        const names=['Родерик','Агата','Кадвин','Мартин','Айлин','','Эдгар','Ровена','Бран'];
        const sellerNames=['Элвин','Марта','Томас','Хью','Рут'];
        this.stalls.forEach((stall,i)=>kits.push({i:9+i,name:sellerNames[i],profile:{...OUTFITS[i%2?4:3],role:'merchant',
            coat:[0x514637,0x695766,0x657250,0x45362c,0x61534d][i],style:['swept','bun','cropped','bald','braid'][i]},home:stall.home,stall}));
        this.homes.slice(4,8).forEach((home,i)=>kits.push({i:14+i,name:['Гвин','Беатрис','Эдвин','Сибил'][i],
            profile:{...OUTFITS[i%2?4:3],coat:[0x77604a,0x48665b,0x5d565a,0x725349][i],style:['curl','shoulder','crest','bun'][i]},home}));
        for (const {i,profile,home,stall,name=names[i]} of kits) {
            const seller=stall?new V3(stall.x,0,stall.z-.77):null;
            if(seller)seller.y=this.api.ground(seller.x,seller.z);
            const court = i===6 ? home.throne.clone() : i===7 ? home.advisor.clone() : seller;
            const p = court || home.door.clone().add(new V3((i % 2) * 1.7 - 0.7, 0, (i < 3 ? 1.4 : 2.1) + i * 0.23));
            if(!court)p.y = this.api.ground(p.x, p.z);
            const mage = ['wizard','vizier'].includes(profile.role);
            const rig = await this.api.avatar(mage ? 'R' : null, profile, true, i * 8191 + 312);
            const arm = () => ({ ok: false, hand: false, u: new V3(), f: new V3(), h: new V3(), n: new V3(1, 0, 0) });
            rig.arms = { dirs: { L: arm(), R: arm() }, solve() {} };
            const person = { id: 'resident-' + i, rig, profile, name, home, hp: profile.role === 'knight' ? 36 : 25,
                maxMana: i === 1 ? 100 : 60, mana: i === 1 ? 100 : 60, waypoint: p.clone(), change: i * 1.2,
                pos: p, vel: new V3(), faceYaw: 0, yaw: Math.PI, pitch: 0, grounded: true, vy: 0, justLanded: 0,
                crouch: false, airStyle: 'tuck', view: 'third', landT: 0, jumpPrep: 0, alert: 0, castDelay: i * 0.5, raise: 0, hurt: 0,
                patrol: court?.clone(), mage, stall };
            const role=profile.role==='vizier'?'advisor':profile.role==='resident'||profile.role==='wizard'?'farmer':profile.role;
            person.brain=new VillagerBrain({id:person.id,name,role,castleName:'Серый Кряж',kingName:'Эдгар',female:profile===OUTFITS[1]||name==='Ровена'||i%2===1},
                ()=>({castleName:'Серый Кряж',kingName:'Эдгар',timeOfDay:'day',danger:person.alert>0,trade:stall?.trade?.ru}));
            if(stall)stall.seller=person;
            if (profile.role === 'knight') {
                for (const slot of ['helmet', 'chest', 'legs']) fitArmor(rig, slot, makePiece(slot));
            }
            if (mage) {
                rig.colors.coat.value.setHex(profile.coat);
            }
            if (profile.role==='king') {
                const crown=new THREE.Mesh(new THREE.CylinderGeometry(.107,.094,.055,9,1,true),this.materials.brass);
                crown.position.y=.195;
                rig.B.head.add(crown);
                for(let j=0;j<9;j++){
                    const tip=new THREE.Mesh(new THREE.ConeGeometry(.022,.041,4),this.materials.brass);
                    const a=j*Math.PI*2/9;
                    tip.position.set(Math.sin(a)*.102,.231,Math.cos(a)*.102);
                    rig.B.head.add(tip);
                }
            }
            this.people.push(person);
        }
    }

    hit(person, damage, direction, caster, {push=0,up=0,stun=0,freeze=0} = {}) {
        if (person.dead) {
            if (push>1) this.api.fall?.(person.rig,person,direction,push);
            return;
        }
        person.hp -= damage;
        person.alert = 18;
        person.brain?.feel(caster,-12);
        person.caster = caster;
        person.hurt = Math.max(person.hurt, stun, freeze, push ? .65 : 0);
        if (direction.lengthSq()<.001) direction = new V3(-Math.sin(person.faceYaw),0,-Math.cos(person.faceYaw));
        if (push) {
            person.vel.addScaledVector(direction, push);
            person.vy = Math.max(person.vy,up);
            person.grounded = false;
        }
        if (person.hp <= 0) {
            person.dead = true;
            if (!push) person.vel.addScaledVector(direction, 1.75);
        }
        if (person.dead || push >= 4.5 || stun > 0) {
            person.down = Math.max(person.down || 0, stun, push >= 4.5 ? 2.4 : 0);
            this.api.fall?.(person.rig,person,direction,push || (person.dead ? 2.1 : 1.4));
        }
    }

    update(dt) {
        const player = this.api.player();
        for (const door of this.doors) {
            if (door.part.broken || door.angle===door.goal) continue;
            const k=1-Math.exp(-dt*9);
            door.angle+=(door.goal-door.angle)*k;
            if(Math.abs(door.angle-door.goal)<.006)door.angle=door.goal;
            door.part.mesh.rotation.y=door.angle;
            door.part.mesh.updateMatrixWorld(true);
            door.part.bounds.setFromObject(door.part.mesh);
        }
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
            if (rig.limp) {
                person.down -= dt;
                if (!person.dead && person.down<=0) this.api.recover?.(rig,person);
                this.api.stepLimp(rig, dt, person);
                this.api.animate(rig, dt, 0, person);
                continue;
            }
            if (person.dead) {
                this.api.animate(rig, dt, 0, person);
                continue;
            }
            const enemy = person.alert && this.api.body(person.caster);
            const distance = enemy ? enemy.distanceTo(pos) : Infinity;
            person.change -= dt;
            if (person.change <= 0 || !enemy && person.waypoint.distanceToSquared(pos) < 0.4) {
                const a = this.rand() * Math.PI * 2, r = person.patrol ? .25+this.rand()*.9 : 1.5 + this.rand() * 5;
                const center = person.patrol || person.home.door;
                person.waypoint.set(center.x + Math.cos(a) * r, pos.y, center.z + Math.sin(a) * r);
                person.change = 3 + this.rand() * 8;
            }
            const walk = person.waypoint.clone().sub(pos).setY(0);
            if (enemy) {
                walk.copy(enemy).sub(pos).setY(0).normalize();
                if (profile.role === 'resident' || person.stall || distance < 3) walk.negate();
                else if (person.mage && distance < 10) walk.multiplyScalar(0.04);
            } else {
                if(person.follow)walk.copy(player.pos).sub(pos).setY(0).multiplyScalar(walk.lengthSq()>.16?1:.4);
                if(person.stall)walk.copy(person.patrol).sub(pos).setY(0).multiplyScalar(.85);
                walk.clampLength(0,1);
            }
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
            const casting = enemy && person.mage && distance > 2.5 && distance < 16 && person.castDelay <= 0 && person.mana >= 8;
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
        for(const person of this.bubbles){
            person.bubble.update(dt,person.rig.B.head.getWorldPosition(new V3()),this.api.camera());
            if(!person.bubble.visible)this.bubbles.delete(person);
        }
        this.debris = this.debris.filter(part => {
            part.time += dt;
            part.body.step(dt,this.debrisWorld);
            if (part.time < 9 || !part.body.sleeping && part.time < 15) return true;
            const mesh = part.body.obj;
            mesh.removeFromParent();
            mesh.traverse(child=>child.geometry?.dispose());
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
