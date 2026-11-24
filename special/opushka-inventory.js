import * as THREE from 'three';
import { Inventory, POCKET_STAY, CREATIVE_APPLES, lookSteady, RESOURCE } from '../src/game/Inventory.js';
import { ITEM_INFO, makeItemModel, disposeModel, starterWand } from '../src/game/ItemTypes.js';
import { BACK_HOLD } from '../src/game/BackInteraction.js';
import { BELT_TOP, BELT_TIP, TUCK_LOOK } from '../src/game/WandBelt.js';
import { ItemIcons } from '../src/ui/ItemIcons.js';
import { buildWeapon } from '../src/entities/WeaponModels.js';
import { ARMOR, armorName, wearSpot } from '../src/game/ArmorTypes.js';
import { RigidProp } from '../src/game/RigidProp.js';

const backKinds = new Set(['weapon', 'bow', 'hammer', 'shield', 'backpack']);
const armorSlots = { helmet: 'Шлем', chest: 'Нагрудник', legs: 'Поножи', robe: 'Мантия' };
const drawings = {
    helmet: 'M5 16v-3c0-5 3-8 7-8s7 3 7 8v3l-4 2v-5H9v5z M9 11h6',
    chest: 'M4 8l4-2 4 2 4-2 4 2-2 5v6H6v-6z M9 10l3 2 3-2 M12 12v6',
    legs: 'M5 5h5v12l-1 3H5z M14 5h5v15h-4l-1-3z M6 9h3m6 0h3',
    robe: 'M9 4h6l1 5 3 10H5l3-10z M9 4l3 5 3-5 M12 9v10',
};
const sideOf = (hand) => hand === 'L' ? 'left' : 'right';
const other = (hand) => hand === 'L' ? 'R' : 'L';

export function attachBeltWand(wand, hips, side) {
    const scale = 0.47, top = BELT_TOP.clone(), tip = BELT_TIP.clone();
    if (side === 'L') { top.x *= -1; tip.x *= -1; }
    for (const v of [top, tip]) { v.x *= -scale; v.y *= scale; v.z *= -scale; }
    hips.add(wand);
    const direction = tip.sub(top).normalize();
    wand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    wand.position.copy(top);
}
export function opushkaWand(source) {
    const wand = starterWand();
    if (Number.isInteger(source?.model) && source.model >= 0 && source.model <= 9) wand.model = source.model;
    if (Number.isInteger(source?.color) && source.color >= 0 && source.color <= 0xffffff) wand.color = source.color;
    if (source?.plain === false || wand.model !== 0) wand.plain = false;
    if (source?.dragon === true) wand.dragon = true;
    return wand;
}

export class OpushkaInventory extends Inventory {
    constructor(api) {
        super({ hud: { toast: api.notify } });
        this.api = api;
        this.main = api.main;
        this.off = other(api.main);
        this.held = { L: null, R: null };
        this.equipped = {};
        this.wearTime = { L: 0, R: 0 };
        this.wearReady = { L: true, R: true };
        this.loose = [];
        this.backModels = [];
        this.grip = { L: false, R: false };
        this.pocketTime = 0;
        this.beltTime = 0;
        this.wandReach = false;
        this.beltReady = false;
        this.backTimers = { L: 0, R: 0 };
        this.backReady = { L: false, R: false };
        this.wandStowed = false;
        this.wandItem = api.rig().wandItem;
        this.icons = new ItemIcons(api.renderer, { makeModel: makeItemModel, buildWeapon, dispose: disposeModel,
            onReady: () => this._render() });
        this.toggleWand(true);
        if (api.creative) this.storeItem({ kind: 'apple', count: CREATIVE_APPLES });
        this.icons.warm(this.slots.filter(Boolean));
        this._render();
    }

    _buildBar() {
        const bar = document.createElement('section');
        bar.id = 'op-pocket';
        bar.setAttribute('aria-label', 'Инвентарь героя');
        this.cells = [];
        this.bar = bar;
        for (let i = 0; i < this.slots.length; i++) this._appendCell();
        document.body.append(bar);
        this.bar = bar;
        const equipment = document.createElement('section');
        equipment.id = 'op-equipment';
        equipment.setAttribute('aria-label', 'Доспехи и мантия');
        this.armorCells = {};
        for (const [slot, label] of Object.entries(armorSlots)) {
            const cell = document.createElement('button');
            cell.className = 'op-cell op-armor-cell';
            cell.type = 'button';
            cell.title = label;
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('aria-hidden', 'true');
            const outline = document.createElementNS(icon.namespaceURI, 'path');
            outline.setAttribute('d', drawings[slot]);
            icon.append(outline);
            cell.append(icon);
            cell.addEventListener('click', () => this.armorAction(slot));
            this.armorCells[slot] = cell;
            equipment.append(cell);
        }
        document.body.append(equipment);
    }

    _appendCell() {
        const index = this.cells.length;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'op-cell';
        cell.addEventListener('click', () => this.select(index));
        this.bar.append(cell);
        this.cells.push(cell);
    }

    _render() {
        this.cells.forEach((cell, i) => {
            const slot = this.slots[i] || (this.heldFrom === i ? this.held?.[this.off]?.item : null);
            const name = slot?.kind === 'res' ? RESOURCE[slot.block]?.name : ITEM_INFO[slot?.kind]?.name;
            const title = slot?.kind === 'weapon' ? (slot.type === 'axe' ? 'Топор' : 'Меч') : name || (slot ? 'Предмет' : 'Пусто');
            cell.replaceChildren();
            const key = document.createElement('span');
            key.className = 'op-key';
            key.textContent = i < 9 ? i + 1 : '';
            cell.append(key);
            const url = this.icons?.url(slot);
            if (url) {
                const img = document.createElement('img');
                img.alt = '';
                img.src = url;
                img.className = 'op-item';
                cell.append(img);
            } else if (slot && slot.kind !== 'wand') {
                cell.append(document.createTextNode(slot.kind === 'res' ? '◆' : Inventory.emojiOf(slot)));
            }
            if (slot?.count > 1) {
                const count = document.createElement('small');
                count.textContent = slot.count;
                cell.append(count);
            }
            cell.title = title;
            cell.setAttribute('aria-label', 'Ячейка ' + (i + 1) + ' · ' + title);
            cell.setAttribute('aria-pressed', String(i === this.selected));
            cell.classList.toggle('op-wand', slot === this.wandItem);
        });
        for (const [slot, cell] of Object.entries(this.armorCells)) {
            const item = this.equipped?.[slot];
            cell.title = item ? armorName(item) : armorSlots[slot];
            cell.setAttribute('aria-label', cell.title);
            cell.classList.toggle('occupied', !!item);
            cell.style.setProperty('--piece', item?.color ? '#' + item.color.toString(16).padStart(6, '0') : '#bfbda9');
        }
    }

    pocketHintInfo() {
        const start = this.lastSlot ?? -1, count = this.slots.length;
        let next = -1;
        for (let k = 1; k <= count; k++) {
            const index = (start + k) % count;
            if (this.slots[index] && this.slots[index] !== this.wandItem) { next = index; break; }
        }
        return { on: true, leftHanded: this.main === 'L', shut: this.api.disabled(),
            wand: this.wandStowed, cells: this.slots.map(Boolean), next, pocketUrl: this.icons.url(this.slots[next]) };
    }

    wandInHand() {
        return !this.wandStowed && !this.api.disarmed();
    }

    toggleWand(initial = false) {
        const rig = this.api.rig(), hand = rig?.fingers?.[this.main];
        if (!hand?.wand || (!initial && this.api.disabled()) || this.api.disarmed()) return false;
        if (this.wandStowed && this.held[this.main]) return false;
        if (!initial && !this.wandStowed && this.api.casting()) {
            this.api.notify('Сначала завершите заклинание');
            return false;
        }
        if (!hand.heldTransform) {
            hand.heldTransform = { position: hand.wand.position.clone(), quaternion: hand.wand.quaternion.clone() };
            hand.normalGrip = hand.grip;
        }
        this.wandStowed = !this.wandStowed;
        if (this.wandStowed) {
            let index = this.slots.findIndex((item, i) => !item && i !== this.heldFrom);
            if (index < 0) {
                index = this.slots.length;
                this.slots.push(null);
                this._appendCell();
            }
            this.slots[index] = this.wandItem;
            attachBeltWand(hand.wand, rig.B.hips, this.main);
            hand.grip = null;
        } else {
            const index = this.slots.indexOf(this.wandItem);
            if (index >= 0) this.slots[index] = null;
            hand.hb.palm.add(hand.wand);
            hand.wand.position.copy(hand.heldTransform.position);
            hand.wand.quaternion.copy(hand.heldTransform.quaternion);
            hand.grip = hand.normalGrip;
        }
        if (!initial) this.api.sound(this.wandStowed ? 'wandPut' : 'wandTake');
        this._render();
        return true;
    }

    armorAction(slot) {
        if (this.api.disabled()) return false;
        const next = this.held[this.off]?.item;
        if (slot === 'robe' && next?.kind === 'robe' || next?.kind === 'armor' && next.piece === slot) return this.wear(this.off, slot);
        const old = this.equipped[slot];
        if (!old || !this.takeInHand(old, this.off)) return false;
        delete this.equipped[slot];
        this.api.fit(slot, null);
        this._render();
        return true;
    }

    wear(hand, slot) {
        const next = this.release(hand);
        const old = this.equipped[slot];
        this.equipped[slot] = next;
        this.api.fit(slot, next);
        if (old) this.takeInHand(old, hand);
        this.selected = -1;
        this.api.sound('put');
        this._render();
        return true;
    }

    itemModel(item) {
        const appearance = item.kind === 'res' ? { kind: 'blocks', color: RESOURCE[item.block]?.color } : item;
        const model = item.kind === 'weapon' ? buildWeapon(item.type, this.api.renderer).group : makeItemModel(appearance);
        model.scale.multiplyScalar(0.48);
        model.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
        return model;
    }

    takeInHand(item, hand) {
        const palm = this.api.rig()?.fingers?.[hand]?.hb.palm;
        if (!palm || this.held[hand] || (hand === this.main && this.wandInHand())) return false;
        const model = this.itemModel(item);
        palm.add(model);
        model.position.set(hand === 'L' ? -0.035 : 0.035, -0.065, 0);
        this.held[hand] = { item, model };
        return true;
    }

    release(hand) {
        const held = this.held[hand];
        if (!held) return null;
        this.held[hand] = null;
        if (hand === this.off) this.heldFrom = null;
        held.model.removeFromParent();
        disposeModel(held.model);
        return held.item;
    }

    putInPocket() {
        const held = this.held[this.off], slot = this.heldFrom;
        if (!held) return true;
        if (backKinds.has(held.item.kind)) {
            this.api.notify('Уберите этот предмет за плечо');
            return false;
        }
        if (!this.canStore(held.item)) {
            this.api.notify('В кармане нет свободной ячейки');
            return false;
        }
        if (Number.isInteger(slot) && !this.slots[slot]) this.slots[slot] = this.release(this.off);
        else this.storeItem(this.release(this.off));
        this.selected = -1;
        this._render();
        return true;
    }

    select(index) {
        if (this.api.disabled() || index >= this.slots.length) return false;
        if (this.slots[index] === this.wandItem) return this.toggleWand();
        if (this.heldFrom === index) return this.putInPocket();
        if (index >= 0 && !this.slots[index]) return false;
        if (!this.putInPocket()) return false;
        if (index < 0) return true;
        const item = this.slots[index];
        if (!this.takeInHand(item, this.off)) return false;
        this.slots[index] = null;
        this.heldFrom = this.selected = this.lastSlot = index;
        this.api.sound('switch');
        this._render();
        return true;
    }

    cycle() {
        for (let k = 1; k <= this.slots.length; k++) {
            const i = ((this.lastSlot ?? -1) + k) % this.slots.length;
            if (this.slots[i] && this.slots[i] !== this.wandItem) return this.select(i);
        }
        if (this.heldFrom == null) this.api.notify('Карман пуст');
        return false;
    }

    putOnBack(hand) {
        const held = this.held[hand], empty = this.back.indexOf(null);
        if (held && backKinds.has(held.item.kind) && empty >= 0) {
            const item = this.release(hand), rig = this.api.rig();
            this.back[empty] = item;
            const model = this.itemModel(item);
            model.position.set((empty - 0.5) * 0.23, 0.04, -0.20);
            model.rotation.z = (empty - 0.5) * 0.9;
            rig.B.chest.add(model);
            this.backModels[empty] = model;
        } else if (!held) {
            const i = this.back.findIndex(Boolean);
            if (i < 0 || !this.takeInHand(this.back[i], hand)) return false;
            this.back[i] = null;
            this.backModels[i]?.removeFromParent();
            disposeModel(this.backModels[i]);
            this.backModels[i] = null;
        } else return false;
        this.api.sound('switch');
        return true;
    }

    placeLoose(item, position, offsetY = 0, onTake = null) {
        const model = this.itemModel(item);
        model.position.copy(position);
        model.position.y += offsetY;
        this.api.scene.add(model);
        const entry={item,model,onTake};
        this.loose.push(entry);
        return entry;
    }

    scatterArmor(items,position) {
        items.forEach((item,i)=>{
            const a=(i+.5)*Math.PI*.69;
            const p=position.clone().add(new THREE.Vector3(Math.sin(a)*.31,.49+i*.10,Math.cos(a)*.31));
            const entry=this.placeLoose(item,p);
            entry.body=new RigidProp(entry.model,{vel:new THREE.Vector3(Math.sin(a)*1.5,1.7,Math.cos(a)*1.5),spin:new THREE.Vector3(.58,.42,i*.41)});
        });
    }

    stepLoose(dt) {
        this.looseWorld ||= {ground:(x,z,y)=>this.api.floor(x,z,y-.39),blocked:this.api.blocked};
        for(const item of this.loose){
            if(item.body&&item.model.position.distanceToSquared(this.api.player().pos)<65**2)item.body.step(dt,this.looseWorld);
        }
    }

    stripArmor() {
        const removed=[];
        for(const [slot,item] of Object.entries(this.equipped)){
            if(!item||item.magic)continue;
            this.equipped[slot]=null;
            this.api.fit(slot,null);
            removed.push(item);
        }
        this.scatterArmor(removed,this.api.player().pos);
        if(removed.length)this._render();
        return removed.length>0;
    }

    suitUp() {
        const p=this.api.player().pos;
        let count=0;
        for(let i=this.loose.length-1;i>=0;i--){
            const entry=this.loose[i],it=entry.item;
            const slot=it.kind==='robe'?'robe':it.kind==='armor'?it.piece:null;
            if(!slot||this.equipped[slot]||entry.onTake||entry.model.position.distanceToSquared(p)>3.4**2)continue;
            this.equipped[slot]=it;
            this.api.fit(slot,it);
            entry.model.removeFromParent();
            disposeModel(entry.model);
            this.loose.splice(i,1);
            count++;
        }
        if(count)this._render();
        return count>0;
    }

    removeLoose(uid) {
        const i = this.loose.findIndex((entry) => entry.item.uid === uid);
        if (i < 0) return;
        const [{model}] = this.loose.splice(i,1);
        model.removeFromParent();
        disposeModel(model);
    }

    pickNear(hand, position) {
        let at = -1, best = 0.24 ** 2;
        this.loose.forEach(({ model }, i) => {
            const distance = model.position.distanceToSquared(position);
            if (distance < best) { at = i; best = distance; }
        });
        if (at < 0) return false;
        const entry = this.loose[at];
        if (entry.onTake) return entry.onTake(hand,entry);
        if (!this.takeInHand(entry.item, hand)) return false;
        this.loose.splice(at, 1);
        entry.model.removeFromParent();
        disposeModel(entry.model);
        this.api.sound('switch');
        return true;
    }

    callLoose(origin, direction, obstructed) {
        let target=null,score=Infinity;
        for(const item of this.loose){
            if(item.onTake)continue;
            const diff=item.model.position.clone().sub(origin),t=diff.dot(direction);
            if(t<.13||t>13)continue;
            const side=diff.addScaledVector(direction,-t).length();
            if(side>.34+t*.066||obstructed(origin,item.model.position))continue;
            const rank=t+side*4;
            if(rank<score){score=rank;target=item;}
        }
        return !!target&&this.pickNear(this.off,target.model.position);
    }

    update(dt, pose, directions) {
        if (!pose?.hasPose || this.api.disabled() || pose.isRunning || this.api.player().flying) {
            this.pocketTime = this.beltTime = 0;
            this.backTimers.L = this.backTimers.R = 0;
            this.beltReady = this.wandReach = false;
            this.bar.classList.remove('at-pocket');
            this.bar.classList.remove('at-wand');
            this.backReady.L = this.backReady.R = false;
            return;
        }
        const rig = this.api.rig(), player = this.api.player(), down = lookSteady(this._look, player.pitch < -0.22, dt);
        const pocket = pose.pocket?.off === true || pose.purse?.off === true && (!!this.held[this.off] || this.pocketUsed);
        this.bar.classList.toggle('at-pocket', pocket);
        if (!pocket) { this.pocketTime = 0; this.pocketUsed = false; }
        else {
            if (!this.pocketTime) this.api.sound('enter');
            this.pocketTime += dt;
            if (!this.pocketUsed && down && this.pocketTime >= 0.26) {
                this.pocketUsed = true;
                this.pocketTime = 0;
                if (this.held[this.off]) this.putInPocket(); else this.cycle();
            } else if (this.pocketTime >= POCKET_STAY) {
                this.pocketUsed = true;
                this.pocketTime = 0;
                this.cycle();
            }
        }
        const belt = pose.belt?.[sideOf(this.main)];
        const wand = rig?.fingers?.[this.main]?.wand;
        this.bar.classList.toggle('at-wand', !!belt?.near);
        if (!belt?.near) {
            this.wandReach = false;
            this.beltTime = 0;
            this.beltReady = true;
        } else if (down && this.beltReady && wand) {
            const direction = new THREE.Vector3(0, 1, 0).transformDirection(wand.matrixWorld);
            if (!this.wandStowed && belt.at && direction.y < TUCK_LOOK) {
                this.beltTime += dt;
                if (this.beltTime >= 0.22 && this.toggleWand()) this.beltReady = false;
            } else this.beltTime = 0;
            if (!this.grip[this.main] && directions[this.main]?.hand) this.wandReach = true;
        }
        for (const hand of ['L', 'R']) {
            const dir = directions[hand];
            if (!dir.hand || !dir.curl || !rig?.fingers?.[hand]) { this.grip[hand] = null; continue; }
            const curl = (dir.curl[0] + dir.curl[3] + dir.curl[6] + dir.curl[9]) / 4;
            const closed = this.grip[hand] ? curl > 0.43 : curl > 0.67;
            const closedNow = closed && this.grip[hand] === false, openedNow = !closed && this.grip[hand] === true;
            this.grip[hand] = closed;
            const palm = rig.fingers[hand].hb.palm;
            const position = palm.getWorldPosition(new THREE.Vector3());
            const local = rig.root.worldToLocal(position.clone());
            const item = this.held[hand]?.item, slot = item?.kind === 'robe' ? 'robe' : item?.kind === 'armor' ? item.piece : null;
            const touch = pose.bodyTouch?.[sideOf(hand)];
            const legacyHand = { x: -local.x * 2.3, y: (local.y - 0.90) * 2.3, z: -local.z * 2.3 };
            if (slot && touch && wearSpot(item.kind, item.piece, legacyHand, touch)) {
                if (this.wearReady[hand] && (this.wearTime[hand] += dt) >= ARMOR.WEAR_T) {
                    this.wearReady[hand] = false;
                    this.wear(hand, slot);
                    continue;
                }
            } else { this.wearTime[hand] = 0; this.wearReady[hand] = true; }
            const behind = local.z < -0.15 && local.y > 1.16;
            if (!behind) { this.backTimers[hand] = 0; this.backReady[hand] = true; }
            else if (this.backReady[hand] && (this.backTimers[hand] += dt) >= BACK_HOLD) {
                this.backReady[hand] = false;
                this.putOnBack(hand);
            }
            if (hand === this.main && belt?.near && this.wandStowed && down && closedNow && this.wandReach && this.beltReady) {
                if (this.toggleWand()) this.beltReady = false;
            } else if (closedNow && !(hand === this.off && pocket) && !behind && !(hand === this.main && belt?.near)) {
                if (!this.pickNear(hand, position)) this.api.touch?.(hand,position);
            } else if (openedNow && this.held[hand] && !behind && !(hand === this.off && pocket) && !this.api.reading?.(hand)) {
                const item=this.release(hand);
                if(!this.api.pay?.(item,position)){
                    position.y = this.api.floor(position.x, position.z, position.y) + 0.12;
                    this.placeLoose(item, position);
                }
                this.selected = -1;
                this._render();
            }
        }
    }
}
