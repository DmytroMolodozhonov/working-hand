import * as THREE from 'three';
import { createRng } from '../src/core/math.js';
import { OUTFITS, fitArmor } from './opushka-appearance.js';
import { makePiece, makeRobe } from '../src/game/ArmorTypes.js';
import { RigidProp } from '../src/game/RigidProp.js';

const V3 = THREE.Vector3;
const houses = [
    { dx: -8.5, dz: -2.0, width: 5.6, depth: 4.9, style: 'cottage' },
    { dx: 3.7, dz: 3.0, width: 6.5, depth: 5.2, style: 'hall' },
    { dx: 9.5, dz: -7.1, width: 5.7, depth: 3.8, style: 'workshop' },
];
const castlePlan = { dx: -1, dz: -33, width: 20, depth: 17 };
const sites = [...houses, castlePlan];
export const villageClearing = (x, z) => sites.some(({dx, dz, width, depth}) => Math.abs(x - dx) < width / 2 + 2.15 && Math.abs(z - dz) < depth / 2 + 2.7);

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
        this.doors = [];
        this.people = [];
        this.rand = createRng(20311);
        const wood = siding(false, 22), stones = siding(true, 92);
        const material = (color, map = null) => new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 0.062, roughness: 0.87 });
        this.materials = { wood: material(0xf6ce9b, wood), stone: material(0xe5decb, stones), beam: material(0x4c3325, wood),
            tile: material(0xd0bab0, roofing(false)), slate: material(0xb9bebc, roofing(true)), plaster: material(0xcfc3a3),
            dark: material(0x323b34), brass: material(0xa27a45), joinery: material(0xd0c2a4, wood),
            banner: new THREE.MeshStandardMaterial({ color: 0x783240, roughness: .92, side: THREE.DoubleSide }),
            glass: new THREE.MeshPhysicalMaterial({ color: 0xe2ece5, roughness: 0.11, metalness: 0.15,
                transparent: true, opacity: 0.19, depthWrite: false, envMapIntensity: 0.65, side: THREE.DoubleSide }) };
        this.homes = houses.map((plan, id) => this.house(plan, id));
        this.homes.push(this.castle(castlePlan, this.homes.length));
        this.debrisWorld = {
            ground: (x,z,y) => this.floor(x,y-.37,z,api.ground(x,z), .07),
            blocked: (x,y,z) => this.collisionBoxes(x,x,z,z).some(b => y > b.minY && y < b.maxY),
        };
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
        const part = { mesh, home, bounds, solid: opts.solid ?? true, roof: !!opts.roof, hp: material === 'stone' ? 2.1 : material === 'glass' ? 0.29 : 1.16,
            material, broken: false, supports: opts.supports || null };
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

    door(home, x, z, half, height, stone) {
        const width=half*2-.065;
        const part=this.piece(home,'wood',x-half+.037,height*.5,z+.018,width,height-.09,.102,{vertical:true});
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

    castle(plan,id) {
        const { dx,dz,width,depth } = plan;
        const x=this.origin.x+dx,z=this.origin.z+dz,w=width/2,d=depth/2;
        const y=this.api.ground(x,z+d+1) + .11;
        const home={x,y,z,id,style:'castle',width,depth,ruined:false,door:new V3(x,y,z+d+1.15)};
        const add=(...args)=>this.piece(home,...args);
        const foundation=(px,pz,sx,sz)=>{
            const base=this.api.ground(x+px,z+pz)-.24;
            const tall=Math.max(.24,y-base);
            return add('stone',px,-tall/2,pz,sx,tall,sz,{solid:false});
        };
        const masonry=(px,pz,sx,sz,levels=3)=>{
            let support=foundation(px,pz,sx,sz);
            for(let n=0;n<levels;n++)support=add('stone',px,(n+.5)*1.2,pz,sx,1.204,sz,{supports:[support]});
            return support;
        };
        const parapet=(px,pz,sx,sz)=>{
            const wall=masonry(px,pz,sx,sz);
            add('joinery',px,3.68,pz,sx+.12,.22,sz+.12,{supports:[wall]});
            const alongX=sx>sz, count=Math.max(1,Math.floor(Math.max(sx,sz)/1.02));
            for(let n=0;n<count;n++){
                const shift=(n+.5-count/2)*.97;
                add('stone',px+(alongX?shift:0),4.02,pz+(alongX?0:shift),alongX?.52:sx,.62,alongX?sz:.52,{supports:[wall]});
            }
            return wall;
        };
        for(let n=-2;n<=2;n++)parapet(n*3.7,-d,3.71,.68);
        for(const s of [-1,1]){
            for(let n=-1;n<=1;n++)parapet(s*w,n*4.55,.72,4.56);
            parapet(s*3.32,d,3.35,.78);
            parapet(s*6.98,d,3.99,.78);
            for(const back of [-1,1]){
                const tx=s*w,tz=back*d;
                const tower=masonry(tx,tz,3.0,3.02,back>0?5:4);
                const crown=back>0?6:4.8,m=crown+.16;
                add('joinery',tx,crown-.14,tz,3.31,.28,3.31,{supports:[tower]});
                const xx=tx,zz=tz,sz=1.85,top=[xx,m+2.1,zz];
                for(let i=0;i<4;i++){
                    const angles=[-Math.PI*.75,-Math.PI*.25,Math.PI*.25,Math.PI*.75];
                    const pt=a=>[xx+Math.cos(a)*sz*1.42,m,zz+Math.sin(a)*sz*1.42];
                    this.roofFace(home,'slate',[pt(angles[i]),pt(angles[(i+1)%4]),top]).supports=[tower];
                }
                if(back>0){
                    add('banner',tx,crown-1.8,tz+1.56,.78,1.7,.024,{solid:false,supports:[tower]});
                    add('brass',tx,crown-.97,tz+1.61,1.0,.07,.09,{solid:false,supports:[tower]});
                }
            }
        }
        const a=add('stone',-1.68,1.8,d,.62,3.6,.84), b=add('stone',1.68,1.8,d,.62,3.6,.84);
        add('stone',0,3.52,d,2.83,.67,.86,{supports:[a,b]});
        this.door(home,0,d,1.35,3.18,true);
        for(let i=0;i<3;i++)add('stone',0,.06-i*.12,d+.45+i*.40,3.02,.24,.44,{solid:false});
        const hallZ=-3.65;
        const back=masonry(0,hallZ-2.32,7.4,.44);
        const east=masonry(3.7,hallZ,.43,4.66),west=masonry(-3.7,hallZ,.43,4.66);
        const front=[-1,1].map(s=>masonry(s*2.65,hallZ+2.32,2.1,.43));
        const frontTop=add('stone',0,3.3,hallZ+2.32,3.22,.6,.43,{supports:front});
        const hallSupports=[back,east,west,frontTop];
        this.roofFace(home,'slate',[[-4.03,3.59,hallZ-2.6],[-4.03,3.59,hallZ+2.6],[0,5.07,hallZ+2.6],[0,5.07,hallZ-2.6]]).supports=hallSupports;
        this.roofFace(home,'slate',[[0,5.07,hallZ-2.6],[0,5.07,hallZ+2.6],[4.03,3.59,hallZ+2.6],[4.03,3.59,hallZ-2.6]]).supports=hallSupports;
        add('stone',0,.15,hallZ,7.22,.3,4.5,{solid:false});
        add('banner',0,.313,hallZ+.4,1.42,.02,3.7,{solid:false});
        add('stone',0,.39,hallZ-1.51,2.6,.26,1.2,{solid:false});
        add('joinery',0,.85,hallZ-1.55,.84,.45,.76);
        add('beam',0,1.28,hallZ-1.92,.82,1.12,.11);
        add('brass',0,1.87,hallZ-1.92,.91,.095,.14);
        return home;
    }

    nearSite(loX,hiX,loZ,hiZ) {
        return sites.some(({dx,dz,width,depth})=>{
            const x=this.origin.x+dx,z=this.origin.z+dz,rx=width/2+3,rz=depth/2+3;
            return hiX>=x-rx&&loX<=x+rx&&hiZ>=z-rz&&loZ<=z+rz;
        });
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
        if (!this.nearSite(Math.min(a.x,b.x)-radius,Math.max(a.x,b.x)+radius,Math.min(a.z,b.z)-radius,Math.max(a.z,b.z)+radius)) return null;
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
            result = { t, p: hit.clone(), n: a.clone().sub(hit).normalize(), kind: 'house', part };
        }
        return result;
    }

    solidAt(x, y, z, radius = 0.24) {
        if (!this.nearSite(x-radius,x+radius,z-radius,z+radius)) return false;
        for (const part of this.parts) {
            if (part.broken || !part.solid) continue;
            const { min, max } = part.bounds;
            if (x + radius > min.x && x - radius < max.x && z + radius > min.z && z - radius < max.z
                && y + 1.6 > min.y && y + 0.11 < max.y) return true;
        }
        return false;
    }

    collisionBoxes(loX, hiX, loZ, hiZ) {
        if (!this.nearSite(loX,hiX,loZ,hiZ)) return [];
        const result = [];
        for (const part of this.parts) {
            if (part.broken || !part.solid || part.roof) continue;
            const { min, max } = part.bounds;
            if (hiX < min.x || loX > max.x || hiZ < min.z || loZ > max.z) continue;
            result.push({ minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z });
        }
        return result;
    }

    floor(x, y, z, base, reach = .38) {
        if (!this.nearSite(x,x,z,z)) return base;
        for (const part of this.parts) {
            if (part.broken || part.roof) continue;
            const { min, max } = part.bounds, top = max.y;
            if (top <= y + reach && top > base && x >= min.x && x <= max.x && z >= min.z && z <= max.z) base = top;
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
        return alarm;
    }

    breakPiece(part, point, unsupported = false) {
        part.broken = true;
        const vel = part.mesh.position.clone().sub(point).normalize().multiplyScalar(unsupported ? .65 : 2.7);
        vel.y = unsupported ? -.34 : vel.y + 2.4 + this.rand() * 2;
        const spin = new V3(.6+this.rand()*2.5,.7-this.rand()*1.4,this.rand()-.5);
        this.debris.push({ body: new RigidProp(part.mesh, { vel, spin }), time: 0 });
    }

    async populate() {
        const kits = [0,1,2,3,4,6,7,8];
        for (const i of kits) {
            const profile = OUTFITS[i], home = this.homes[i>=6?3:i<3?i%2:2];
            const court = i===6 ? new V3(home.x,home.y+.3,home.z-4.45) : i===7 ? new V3(home.x+1.85,home.y+.3,home.z-3.9) : null;
            const p = court || home.door.clone().add(new V3((i % 2) * 1.7 - 0.7, 0, (i < 3 ? 1.4 : 2.1) + i * 0.23));
            if(!court)p.y = this.api.ground(p.x, p.z);
            const mage = ['wizard','vizier'].includes(profile.role);
            const rig = await this.api.avatar(mage ? 'R' : null, profile, true, i * 8191 + 312);
            const arm = () => ({ ok: false, hand: false, u: new V3(), f: new V3(), h: new V3(), n: new V3(1, 0, 0) });
            rig.arms = { dirs: { L: arm(), R: arm() }, solve() {} };
            const person = { id: 'resident-' + i, rig, profile, home, hp: profile.role === 'knight' ? 36 : 25,
                maxMana: i === 1 ? 100 : 60, mana: i === 1 ? 100 : 60, waypoint: p.clone(), change: i * 1.2,
                pos: p, vel: new V3(), faceYaw: 0, yaw: Math.PI, pitch: 0, grounded: true, vy: 0, justLanded: 0,
                crouch: false, airStyle: 'tuck', view: 'third', landT: 0, jumpPrep: 0, alert: 0, castDelay: i * 0.5, raise: 0, hurt: 0,
                patrol: court?.clone(), mage };
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
                if (profile.role === 'resident' || distance < 3) walk.negate();
                else if (person.mage && distance < 10) walk.multiplyScalar(0.04);
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
