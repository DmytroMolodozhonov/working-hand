import * as THREE from 'three';
import { Chest, CHEST_W, CHEST_D, CHEST_H } from '../src/entities/Chest.js';
import { createRng, hashString } from '../src/core/math.js';
import { CHEST_THINGS, freshScrolls, rollLoot } from '../src/game/ItemTypes.js';
import { crystalCluster, CRYSTAL } from '../src/game/ManaCrystals.js';
import { OPUSHKA_SEED } from './opushka-world.js';

const V3 = THREE.Vector3;
const SCALE = 1.45;
const OPEN_DISTANCE = 2.5;
const BUILD_DISTANCE = 30;

export class OpushkaCaveLoot {
    constructor(caves, api) {
        this.caves = caves;
        this.api = api;
        this.records = new Map();
        this.clusters = new Map();
        this.opened = new Map();
        this.taken = new Set();
        this.pending = new Set();
        this.scanAt = 0;
        for (const cv of caves.systems) {
            for (const [i, spot] of (cv.chests || []).entries()) {
                const id = cv.id + ':' + i;
                const pos = this.chestFloor(spot);
                if (!pos) continue;
                this.records.set(id, { id, pos, yaw: spot.a || 0, chest: null, item: null });
            }
            const raw = crystalCluster(cv, OPUSHKA_SEED, caves.height);
            if (raw) for (const crystal of raw.crystals) {
                const point = new V3(crystal.x, crystal.y, crystal.z), axis = new V3(crystal.ax, crystal.ay, crystal.az);
                let supported = false;
                for (let i = -8; i <= 8; i++) {
                    const root = point.clone().addScaledVector(axis, i * 0.11);
                    const tip = root.clone().addScaledVector(axis, 0.45);
                    if (caves.density(root.x,root.y,root.z) < 0 || caves.density(tip.x,tip.y,tip.z) >= 0) continue;
                    point.copy(root);supported = true;break;
                }
                if (supported) this.clusters.set(crystal.id, { ...crystal, point, axis, mesh: null });
            }
        }
        this.crystalMat = new THREE.MeshStandardMaterial({ color: 0x57a3d9, roughness: 0.24,
            metalness: 0.24, emissive: 0x176ca3, emissiveIntensity: 1.9, flatShading: true });
        this.crystalGeo = new THREE.CylinderGeometry(0, 1, 1, 6, 1);
        this.light = new THREE.PointLight(0x6eb7ff, 0, 6, 2);
        api.scene.add(this.light);
    }

    chestFloor(spot) {
        const { x, y, z, a = 0 } = spot;
        const floor = this.caves.floor(x, z, y + 1.1);
        if (Math.abs(floor - y) > 2.4) return null;
        const height = CHEST_H * SCALE;
        for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
            const dx = u * CHEST_W * SCALE / 2, dz = v * CHEST_D * SCALE / 2;
            const px = x + dx * Math.cos(a) + dz * Math.sin(a), pz = z - dx * Math.sin(a) + dz * Math.cos(a);
            if (this.caves.density(px, floor + .22, pz) >= 0 || this.caves.density(px, floor + height + .19, pz) >= 0) return null;
        }
        return new V3(x, floor + .05, z);
    }

    clear(a, b) {
        const d = a.distanceTo(b), point = new V3();
        for (let t = .25; t < d - .10; t += .19) {
            point.copy(a).lerp(b, t / d);
            if (this.caves.density(point.x,point.y,point.z) > 0.05) return false;
        }
        return true;
    }

    canOpen(player, record) {
        if (!player || record.pos.distanceToSquared(player) > OPEN_DISTANCE ** 2) return false;
        const eye = player.clone().add(new V3(0,1.32,0)), lid = record.pos.clone().add(new V3(0,.68,0));
        return this.clear(eye,lid);
    }

    update(dt) {
        const position = this.api.player().pos;
        if ((this.scanAt -= dt) <= 0) {
            this.scanAt = .37;
            for (const r of this.records.values()) {
                const close = r.pos.distanceToSquared(position) < BUILD_DISTANCE ** 2;
                if (close && !r.chest) this.mount(r);
                else if (!close && r.chest) {
                    r.chest.dispose();r.chest=null;
                    r.loot?.forEach(item=>this.api.inventory.removeLoose(item.uid));
                }
            }
            for (const c of this.clusters.values()) {
                const near = c.point.distanceToSquared(position) < 22 ** 2;
                if (near && !c.mesh && !this.taken.has(c.id)) {
                    const mesh = c.mesh = new THREE.Mesh(this.crystalGeo,this.crystalMat);
                    const length=Math.min(.93, c.h*.75);
                    mesh.position.copy(c.point).addScaledVector(c.axis,length*.45);
                    mesh.quaternion.setFromUnitVectors(new V3(0,1,0),c.axis);
                    mesh.scale.set(c.r*.8,length,c.r*.8);
                    this.api.scene.add(mesh);
                } else if (!near && c.mesh) { c.mesh.removeFromParent();c.mesh=null; }
            }
        }
        const net = this.api.net();
        for (const r of this.records.values()) {
            if (!r.chest) continue;
            r.chest.update(dt);
            if (!this.opened.has(r.id) && this.canOpen(position, r)) {
                if (net?.isClient) {
                    const now=performance.now();
                    if (now-(r.asked ?? -Infinity)>1000) {r.asked=now;net.send({ t:'oploot-ask',id:r.id });}
                } else this.open(r,position);
            }
        }
        let nearest = null, dist = 5.5 ** 2;
        for (const c of this.clusters.values()) {
            if (!c.mesh) continue;
            const sq = c.mesh.position.distanceToSquared(position);
            if (sq < dist) { nearest = c;dist = sq;}
        }
        this.light.intensity = nearest ? 3.1 : 0;
        if (nearest) this.light.position.copy(nearest.mesh.position);
    }

    mount(record) {
        const chest = record.chest = new Chest(this.api.scene,record.pos,'loot',record.yaw,record.id,{ scale:SCALE });
        if (this.opened.has(record.id)) chest.setOpenInstant();
        if (record.loot) this.showLoot(record, record.loot);
    }

    open(record, player) {
        if (this.opened.has(record.id) || !this.canOpen(player,record)) return;
        const rand = createRng(hashString(record.id) ^ OPUSHKA_SEED);
        const loot = rollLoot(rand,{ deep:true,count:CHEST_THINGS-1 });
        loot.push({ kind:'coins',count:5+Math.floor(rand()*296) });
        freshScrolls(loot,rand,this.api.knowsScroll);
        loot.forEach((it,i)=>{it.uid='cave:'+record.id+':'+i;});
        const msg={ t:'oploot-chest',id:record.id,loot };
        this.message(msg);
        this.api.net()?.send(msg);
    }

    showLoot(record, loot) {
        const { yaw, pos }=record;
        const across = new V3(Math.cos(yaw),0,-Math.sin(yaw)), front = new V3(Math.sin(yaw),0,Math.cos(yaw));
        for (const [index,item] of loot.entries()) {
            if (this.taken.has(item.uid) || this.api.inventory.loose.some(entry=>entry.item.uid===item.uid)) continue;
            const point=pos.clone().addScaledVector(across,(index-(loot.length-1)/2)*.37).addScaledVector(front,.18);
            point.y+=SCALE*.62+.38;
            this.api.inventory.placeLoose(item,point,item.kind==='weapon'?.15:0, (hand,entry)=>this.take(hand,entry));
        }
    }

    take(hand, entry) {
        if (this.pending.has(entry.item.uid)) return false;
        const net=this.api.net();
        if (net?.isClient) {
            this.pending.add(entry.item.uid);
            setTimeout(()=>this.pending.delete(entry.item.uid),700);
            net.send({t:'oploot-take',id:entry.item.uid,h:hand});
            return false;
        }
        if (!this.api.inventory.takeInHand(entry.item,hand)) return false;
        this.publishTaken(entry.item.uid);
        return true;
    }

    publishTaken(id, by = null) {
        this.message({t:'oploot-gone',id,by});
        this.api.net()?.send({t:'oploot-gone',id,by});
    }

    hand(hand, pos) {
        let nearest=null, distance=CRYSTAL.TOUCH**2;
        for (const c of this.clusters.values()) {
            if (!c.mesh) continue;
            const sq=c.mesh.position.distanceToSquared(pos);
            if (sq<distance && this.clear(pos,c.mesh.position)) {nearest=c;distance=sq;}
        }
        if (!nearest) return false;
        this.breakCrystal(nearest, this.api.player().pos);
        return true;
    }

    breakCrystal(c, position) {
        if (!c.mesh || c.point.distanceToSquared(position)>5**2) return;
        const net=this.api.net();
        if(net?.isClient){net.send({t:'oploot-gem',id:c.id});return;}
        this.publishTaken(c.id,net?.localId||'me');
    }

    blast(p, radius, by) {
        if (this.api.net()?.isClient) return;
        for (const c of this.clusters.values()) {
            if (this.taken.has(c.id) || c.point.distanceToSquared(p) > radius ** 2) continue;
            this.publishTaken(c.id,by);
        }
    }

    sync(id) {
        const net = this.api.net();
        for (const message of this.opened.values()) net?.sendTo(id, { ...message, from:'H' });
        if (this.taken.size) net?.sendTo(id,{t:'oploot-gone',ids:[...this.taken],from:'H'});
    }

    message(m) {
        const net=this.api.net();
        if (m.t==='oploot-ask' && net?.isHost) {
            const r=this.records.get(m.id);
            if (r) this.open(r,this.api.remote(m.from));
        } else if (m.t==='oploot-gem' && net?.isHost) {
            const c=this.clusters.get(m.id), pos=this.api.remote(m.from);
            if(c&&pos&&!this.taken.has(m.id)&&c.point.distanceToSquared(pos)<2.25**2
                &&this.clear(pos.clone().add(new V3(0,1.1,0)),c.point.clone().addScaledVector(c.axis,.35)))this.publishTaken(m.id,m.from);
        } else if (m.t==='oploot-take' && net?.isHost) {
            if (this.taken.has(m.id) || !['L','R'].includes(m.h)) return;
            const pos=this.api.remote(m.from);
            if(!pos||typeof m.id!=='string'||!m.id.startsWith('cave:'))return;
            const r=this.records.get(m.id.slice(5,m.id.lastIndexOf(':')));
            const item=r?.loot?.find(x=>x.uid===m.id);
            if(!item||r.pos.distanceToSquared(pos)>2.25**2||!this.canOpen(pos,r))return;
            this.publishTaken(m.id);
            net.sendTo(m.from,{t:'oploot-grant',from:'H',id:m.id,loot:item,h:m.h});
        } else if (m.t==='oploot-grant') {
            this.pending.delete(m.id);
            if (!this.api.inventory.takeInHand(m.loot,m.h) && !this.api.inventory.storeItem(m.loot)) {
                this.api.inventory.placeLoose(m.loot,this.api.player().pos,.2);
            }
        } else if (m.t==='oploot-chest') {
            const r=this.records.get(m.id);
            if (!r || this.opened.has(m.id)) return;
            this.opened.set(m.id,m);r.loot=m.loot;
            if (r.chest) {r.chest.open();this.showLoot(r,m.loot);}
        } else if (m.t==='oploot-gone') for (const id of m.ids || [m.id]) {
            if(this.taken.has(id))continue;
            this.taken.add(id);
            const c=this.clusters.get(id);
            if (c?.mesh) {c.mesh.removeFromParent();c.mesh=null;}
            if(c&&m.by===(net?.localId||'me'))this.api.crystal(c.point);
            this.api.inventory.removeLoose(id);
        }
    }

    mapChests() {
        return [...this.records.values()].map(r=>({x:r.pos.x,y:r.pos.y,z:r.pos.z,open:this.opened.has(r.id)}));
    }
}
