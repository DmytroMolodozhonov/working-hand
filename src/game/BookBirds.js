/**
 * BookBirds.js — book-birds and their books of spells.
 *
 * A few birds that are books: the covers are the wings, the pages flutter.
 * They fly from tree to tree (rarely landing on the ground). Hit one with a
 * spell and it falls — a book lies there, glowing. Take it with the hand: it
 * stays in the hand (the right pocket puts it into a slot). Raise both hands
 * in front to open it, swipe the hand sideways to turn a page; each spread
 * shows one spell (a drawing of the gesture and the words). Reading it
 * teaches the spell — outside creative, building magic is learned only so.
 * Every book holds up to three spells, picked at random (they repeat).
 *
 * Multiplayer: the host flies the birds and decides hits; everybody sees
 * them; a book is taken by whoever reaches it first (the host decides).
 */

import * as THREE from 'three';
import { isLeaves } from '../world/Terrain.js';
import { BUILD_SPELLS } from './Builder.js';

export const BOOK_POOL = ['Gather', 'CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor'];
const BIRDS = 4;
const SPEED = 7;
const COVERS = [0x8e2b2b, 0x2b4f8e, 0x2f6b3a, 0x6b3f8e, 0x8e6a2b];

/** How each spell is done — for the book's pages. */
const HOW = {
    Gather: { words: 'Gather', hand: 'one', text: 'Поднимите руку и укажите на дерево, камень, землю или листву (до 10 м). Скажите «Gather» — магия разберёт это и принесёт в ячейку. Дерево целиком — 20 древесины.' },
    CreateFloor: { words: 'Create a Floor', hand: 'reach', text: 'Выберите ячейку с ресурсом (коснитесь левого кармана). Укажите рукой место и скажите заклинание: появится блок. Тяните руку — пол растёт. Опустите руку или скажите «Stand».' },
    CreateWall: { words: 'Create a Wall', hand: 'wall', text: 'Укажите рукой место стены и скажите заклинание. Ведите руку в сторону и вверх — стена растёт в ширину и в высоту, пока хватает ресурса.' },
    CreateCeiling: { words: 'Create a Ceiling', hand: 'reach', text: 'Укажите рукой место — потолок появится на высоте трёх блоков. Тяните руку — он растёт над вами.' },
    BuildRoof: { words: 'Build a Roof', hand: 'reach', text: 'Укажите место и тяните руку: двускатная крыша растёт ступенями от краёв к коньку.' },
    CreateDoor: { words: 'Create a Door', hand: 'door', text: 'Держите в руке дерево (не меньше 12). Скажите заклинание — кубик станет маленькой дверью. Отводите руку — дверь растёт; покажите, куда её поставить, и скажите «Stand».' },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function rngFrom(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

/** Up to three spells, random but the same on every computer for this id. */
export function bookSpells(id) {
    const r = rngFrom(id * 7919 + 17);
    const n = 1 + Math.floor(r() * 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(BOOK_POOL[Math.floor(r() * BOOK_POOL.length)]);
    return [...new Set(out)];
}

// ---------------------------------------------------------------- models
export function makeBookModel(color) {
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
    const paper = new THREE.MeshLambertMaterial({ color: 0xf3ead2, side: THREE.DoubleSide });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), cover);
    g.add(spine);
    const wing = (sx) => {
        const pivot = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.6), cover);
        board.position.x = sx * 0.21;
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.6), gold);
        trim.position.x = sx * 0.39;
        pivot.add(board, trim);
        g.add(pivot);
        return pivot;
    };
    const left = wing(-1), right = wing(1);
    const pages = [];
    for (let i = 0; i < 4; i++) {
        const pv = new THREE.Group();
        const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.55), paper);
        pg.rotation.x = -Math.PI / 2;
        pg.position.x = (i % 2 ? 1 : -1) * 0.19;
        pv.add(pg);
        g.add(pv);
        pages.push(pv);
    }
    g.userData = { left, right, pages };
    return g;
}

function flap(model, t, amp) {
    const { left, right, pages } = model.userData;
    const a = 0.25 + Math.sin(t) * amp;
    left.rotation.z = a;
    right.rotation.z = -a;
    pages.forEach((p, i) => { p.rotation.z = (i % 2 ? -1 : 1) * (0.15 + Math.sin(t + i) * amp * 0.5); });
}

// ------------------------------------------------------------ page art
function drawPage(spell, side) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 360;
    const x = c.getContext('2d');
    x.fillStyle = '#f3ead2'; x.fillRect(0, 0, 256, 360);
    x.strokeStyle = '#c9b88f'; x.lineWidth = 3; x.strokeRect(8, 8, 240, 344);
    const how = HOW[spell];
    if (side === 'left') {
        // a little drawing of the gesture: a wizard and his hand
        x.strokeStyle = '#3a2a1a'; x.lineWidth = 4; x.lineCap = 'round';
        x.beginPath(); x.arc(90, 110, 18, 0, Math.PI * 2); x.stroke(); // head
        x.beginPath(); x.moveTo(90, 128); x.lineTo(90, 210); x.lineTo(70, 270); x.moveTo(90, 210); x.lineTo(110, 270); x.stroke();
        x.beginPath(); x.moveTo(90, 150); x.lineTo(60, 190); x.stroke(); // other arm down
        x.beginPath(); x.moveTo(90, 150);
        if (how.hand === 'wall') x.lineTo(150, 115);
        else if (how.hand === 'door') x.lineTo(140, 160);
        else x.lineTo(150, 150);
        x.stroke();
        // what appears
        x.fillStyle = '#8b6b3e';
        if (how.hand === 'wall') { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.fillRect(165 + i * 22, 140 + j * 22, 20, 20); }
        else if (how.hand === 'door') { x.fillRect(170, 150, 40, 80); x.fillStyle = '#d4af37'; x.beginPath(); x.arc(202, 192, 4, 0, 7); x.fill(); }
        else if (how.hand === 'one') { x.fillStyle = '#2f8a2f'; x.fillRect(170, 150, 50, 40); x.fillStyle = '#6b3f1e'; x.fillRect(188, 190, 14, 60); }
        else { for (let i = 0; i < 4; i++) x.fillRect(140 + i * 24, 250, 22, 14); }
        // magic dots
        x.fillStyle = '#9b5bff';
        for (let i = 0; i < 6; i++) x.fillRect(150 + i * 6, 140 - i * 3 + (i % 2) * 6, 4, 4);
        x.fillStyle = '#5a3a1a'; x.font = 'italic 18px serif'; x.textAlign = 'center';
        x.fillText('— жест —', 128, 320);
    } else {
        x.fillStyle = '#5a1a1a'; x.font = 'bold 24px serif'; x.textAlign = 'center';
        x.fillText('«' + how.words + '»', 128, 54);
        x.fillStyle = '#3a2a1a'; x.font = '16px serif'; x.textAlign = 'left';
        const words = how.text.split(' ');
        let line = '', y = 92;
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            if (x.measureText(t).width > 216) { x.fillText(line, 20, y); line = w; y += 21; } else line = t;
        }
        if (line) x.fillText(line, 20, y);
        x.fillStyle = '#7a6a4a'; x.font = 'italic 14px serif'; x.textAlign = 'center';
        x.fillText(BUILD_SPELLS[spell]?.name || spell, 128, 336);
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
}

// ================================================================= manager
export class BookBirds {
    constructor(game) {
        this.game = game;
        this.birds = new Map(); // id -> bird
        this.books = new Map(); // id -> book lying on the ground
        this.learned = new Set();
        this.inHand = null; // {spells, model, open, page}
        this._nextId = 1 + Math.floor(Math.random() * 100000) * 100;
        this._spawnT = 1;
        this._netT = 0;
        this._reader = null;
    }

    get auth() {
        return this.game.authority;
    }

    // ------------------------------------------------------------ birds
    _perchNear(from, minD, maxD) {
        const g = this.game;
        const r = Math.random;
        // a spawn tree crown, or a voxel tree's leaves; now and then the ground
        const trees = (g.world.trees || []).filter((t) => t.alive && !t.burning && !t.burnt && Math.hypot(t.x - from.x, t.z - from.z) > minD && Math.hypot(t.x - from.x, t.z - from.z) < maxD);
        if (trees.length && r() < 0.85) {
            const t = trees[Math.floor(r() * trees.length)];
            const v = new THREE.Vector3(t.x + (r() - 0.5) * 2, 11.6, t.z + (r() - 0.5) * 2);
            v.support = { tree: t };
            return v;
        }
        const data = g.terrain?.data;
        for (let i = 0; i < 24 && data; i++) {
            const a = r() * Math.PI * 2, d = minD + r() * (maxD - minD);
            const x = Math.round(from.x + Math.cos(a) * d), z = Math.round(from.z + Math.sin(a) * d);
            const top = data.topLayer(x, z);
            if (isLeaves(data.get(x, top, z))) { const v = new THREE.Vector3(x, top - 0.3, z); v.support = { cell: [x, top, z] }; return v; }
        }
        const a = r() * Math.PI * 2, d = minD + r() * (maxD - minD);
        const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
        return new THREE.Vector3(x, g.collision.groundY(x, z) + 0.2, z); // rarely: the ground
    }

    _spawnBird(id = null, pos = null) {
        const g = this.game;
        id = id ?? this._nextId++;
        const model = makeBookModel(COVERS[id % COVERS.length]);
        model.scale.setScalar(1.4);
        g.scene.add(model);
        const me = g.character.group.position;
        const at = pos || this._perchNear(me, 25, 60);
        model.position.copy(at);
        const b = { id, model, isBird: true, support: at.support || null, state: 'perch', t: Math.random() * 3, wait: 2 + Math.random() * 5, from: at.clone(), to: at.clone(), ctrl: at.clone(), hp: 2, vy: 0, flapT: Math.random() * 6 };
        this.birds.set(id, b);
        return b;
    }

    _removeBird(b) {
        this.game.scene.remove(b.model);
        b.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
        this.birds.delete(b.id);
    }

    /** Spells / blasts: is a bird hit? (authority only) */
    hitAt(p, radius, by) {
        if (!this.auth) return;
        for (const b of this.birds.values()) {
            if (b.state === 'fall') continue;
            if (b.model.position.distanceTo(p) < radius + 0.6) this._damage(b, 2);
        }
    }

    hitRay(o, d, length, width) {
        if (!this.auth) return;
        for (const b of this.birds.values()) {
            if (b.state === 'fall') continue;
            const to = _v1.subVectors(b.model.position, o);
            const along = to.dot(d);
            if (along < 0 || along > length) continue;
            if (to.addScaledVector(d, -along).length() < width + 0.6) this._damage(b, 2);
        }
    }

    /** (host) A charge / an arrow hit a bird. */
    hitBird(b, n = 2) { if (this.auth && b && b.state !== 'fall') this._damage(b, n); }

    _damage(b, n) {
        b.hp -= n;
        for (let i = 0; i < 12; i++) this.game.fx.spark(b.model.position, 0xf3ead2, 0.12, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.8);
        if (b.hp <= 0) { b.state = 'fall'; b.vy = 1; }
    }

    /** Is the branch the bird sits on still there (a tree burnt / blown away — no)? */
    _supported(b) {
        const s = b.support;
        if (!s) return true;
        if (s.tree) return !!s.tree.alive && !s.tree.burning && !s.tree.burnt;
        if (s.cell) { const data = this.game.terrain?.data; return !data || isLeaves(data.get(s.cell[0], s.cell[1], s.cell[2])); }
        return true;
    }

    _updateBird(b, dt) {
        const m = b.model;
        b.t += dt;
        if (b.state === 'perch') {
            b.flapT += dt * 2;
            flap(m, b.flapT, 0.12);
            b.checkT = (b.checkT || 0) - dt;
            if (b.checkT <= 0) { b.checkT = 0.4; if (!this._supported(b)) b.t = b.wait; } // (the leaves are gone: off it flies)
            if (b.t > b.wait) {
                b.state = 'fly';
                b.t = 0;
                b.from.copy(m.position);
                b.to = this._perchNear(m.position, 12, 40);
                b.toSupport = b.to.support || null;
                b.ctrl.copy(b.from).lerp(b.to, 0.5);
                b.ctrl.y = Math.max(b.from.y, b.to.y) + 5 + Math.random() * 5;
                b.dur = b.from.distanceTo(b.to) / SPEED;
            }
        } else if (b.state === 'fly') {
            b.flapT += dt * 11;
            flap(m, b.flapT, 0.55);
            const k = Math.min(1, b.t / b.dur);
            const p = _v1.copy(b.from).multiplyScalar((1 - k) * (1 - k)).addScaledVector(b.ctrl, 2 * (1 - k) * k).addScaledVector(b.to, k * k);
            const dir = _v2.subVectors(p, m.position);
            if (dir.lengthSq() > 1e-6) m.rotation.y = Math.atan2(dir.x, dir.z);
            m.position.copy(p);
            if (k >= 1) { b.state = 'perch'; b.t = 0; b.wait = 3 + Math.random() * 6; b.support = b.toSupport || null; b.checkT = 0; }
        } else if (b.state === 'fall') {
            b.vy -= 15 * dt;
            m.position.y += b.vy * dt;
            m.rotation.x += dt * 6;
            m.rotation.z += dt * 4;
            if (Math.random() < 0.4) this.game.fx.spark(m.position, 0xf3ead2, 0.1, _v2.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 1.2);
            const ground = this.game.collision.groundY(m.position.x, m.position.z) + 0.15;
            if (m.position.y <= ground) {
                m.position.y = ground;
                this._becomeBook(b);
            }
        }
    }

    _becomeBook(b) {
        this.birds.delete(b.id);
        const m = b.model;
        m.rotation.set(0, m.rotation.y, 0);
        flap(m, 0, 0);
        m.userData.left.rotation.z = 0.02;
        m.userData.right.rotation.z = -0.02;
        const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.05;
        m.add(glow);
        this.books.set(b.id, { id: b.id, model: m, glow, t: 0, spells: bookSpells(b.id) });
        this.game.hud.toast?.('📖 Книга упала на землю — возьмите её рукой');
    }

    /** A book lying somewhere (a creative pedestal): taken by hand like a fallen one. */
    placeBook(pos, id) {
        if (this.books.has(id)) return;
        const m = makeBookModel(COVERS[id % COVERS.length]);
        m.scale.setScalar(1.4);
        m.position.copy(pos);
        flap(m, 0, 0);
        m.userData.left.rotation.z = 0.02;
        m.userData.right.rotation.z = -0.02;
        this.game.scene.add(m);
        const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.05;
        m.add(glow);
        this.books.set(id, { id, model: m, glow, t: 0, spells: bookSpells(id) });
    }

    // ------------------------------------------------------------ books
    _updateBooks(dt) {
        const g = this.game;
        for (const bk of this.books.values()) {
            bk.t += dt;
            bk.glow.material.opacity = 0.35 + Math.sin(bk.t * 3) * 0.25;
            if (Math.random() < 0.08) g.fx.spark(bk.model.position, 0xffe9a8, 0.07, _v1.set(0, 0.8, 0), 0.8);
        }
        if (this.inHand || g.combat.dead) return;
        // A hand that reaches a book takes it
        for (const side of ['right', 'left']) {
            if (g.weapons.hands[side].held) continue;
            const hand = g.character.getHandWorldPosition(side, _v1);
            for (const bk of this.books.values()) {
                if (bk.model.position.distanceTo(hand) < 1.3) {
                    if (this.auth) this._take(bk.id, g.localId);
                    else if (!bk.asked) { bk.asked = true; g.sync?.bookTake?.(bk.id); setTimeout(() => { bk.asked = false; }, 2000); }
                    return;
                }
            }
        }
    }

    /** The host gives the book to the first one who reached it. */
    _take(id, toId) {
        const bk = this.books.get(id);
        if (!bk) return;
        this._removeBook(bk);
        if (this.game.sync) this.game.sync.bookGone?.(id, toId);
        if (toId === this.game.localId) this.takeIntoHand({ kind: 'book', spells: bk.spells, id });
    }

    /** (guests) The host gave a book away. */
    netGone(id, toId) {
        const bk = this.books.get(id);
        if (bk) this._removeBook(bk);
        if (toId === this.game.localId) this.takeIntoHand({ kind: 'book', spells: bookSpells(id), id });
    }

    _removeBook(bk) {
        this.books.delete(bk.id);
        this.game.scene.remove(bk.model);
        bk.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
    }

    /** A book (from the ground or a slot) is in the right hand, closed. */
    takeIntoHand(item) {
        if (this.inHand) this.putAway();
        const model = makeBookModel(COVERS[(item.id || 1) % COVERS.length]);
        model.scale.setScalar(0.9);
        this.game.scene.add(model);
        this.inHand = { item, model, open: 0, page: 0, read: new Set() };
        this.game.hud.toast?.('📖 Книга в руке: поднимите обе руки перед собой — она откроется', 2500);
    }

    /** Out of the hand (into a slot): returns the inventory item. */
    putAway() {
        const h = this.inHand;
        if (!h) return null;
        this._closeReader();
        this.game.scene.remove(h.model);
        h.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
        this.inHand = null;
        return h.item;
    }

    // ------------------------------------------------------------ reading
    _updateHeld(dt) {
        const h = this.inHand;
        if (!h) return;
        const g = this.game;
        const ch = g.character;
        const reading = ch.isArmRaised('left') && ch.isArmRaised('right') && ch.getHandWorldPosition('left', _v1).distanceTo(ch.getHandWorldPosition('right', _v2)) > 0.7;
        h.open += ((reading ? 1 : 0) - h.open) * Math.min(1, dt * 5);
        if (h.open > 0.5) this._showReader(dt);
        else this._closeReader();
        // the closed book sits in the right hand
        const grip = ch.getGripObject('right');
        grip.getWorldPosition(h.model.position);
        h.model.position.y += 0.15;
        h.model.rotation.set(0, ch.group.rotation.y, 0);
        h.model.visible = h.open < 0.5;
    }

    _showReader(dt) {
        const h = this.inHand;
        const g = this.game;
        const spells = h.item.spells;
        if (!this._reader) {
            const r = new THREE.Group();
            const mk = () => new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            r.userData = { left: mk(), right: mk(), turning: null };
            r.userData.left.position.set(-0.175, 0, 0);
            r.userData.right.position.set(0.175, 0, 0);
            const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.54), new THREE.MeshBasicMaterial({ color: COVERS[(h.item.id || 1) % COVERS.length] }));
            cover.position.z = -0.005;
            r.add(cover, r.userData.left, r.userData.right);
            r.position.set(0, -0.12, -0.75);
            r.rotation.x = -0.35;
            g.camera.add(r);
            this._reader = r;
            this._setSpread(0);
        }
        // turn a page: swipe the right hand sideways (in the view)
        const ch = g.character;
        const v = ch.handVelocity.right;
        const camRight = _v3.set(1, 0, 0).applyQuaternion(g.camera.quaternion);
        const side = v.dot(camRight);
        const now = performance.now();
        if (now - (h.turnedAt || 0) > 700) {
            if (side < -2.2 && h.page < spells.length - 1) { h.turnedAt = now; this._turn(+1); }
            else if (side > 2.2 && h.page > 0) { h.turnedAt = now; this._turn(-1); }
        }
        // the page that turns: a curling sheet sweeping over the spine
        const tu = this._reader.userData.turning;
        if (tu) {
            tu.t += dt * 2.5;
            const a = Math.min(1, tu.t) * Math.PI;
            tu.mesh.rotation.y = tu.dir > 0 ? -a : a;
            tu.mesh.position.x = Math.cos(a) * 0.17 * (tu.dir > 0 ? 1 : -1);
            tu.mesh.position.z = Math.sin(a) * 0.08;
            if (tu.t >= 1) { this._reader.remove(tu.mesh); tu.mesh.geometry.dispose(); tu.mesh.material.dispose(); this._reader.userData.turning = null; }
        }
        // reading a spread teaches its spell
        const s = spells[h.page];
        if (s && !this.learned.has(s)) {
            this.learned.add(s);
            g.hud.toast?.(`📖 Изучено заклинание: «${BUILD_SPELLS[s]?.name || s}»`, 2500);
            g.fx.lightFlash?.(ch.getHandWorldPosition('right'), 0xffe9a8, 2, 0.3, 10);
        }
    }

    _setSpread(page) {
        const h = this.inHand;
        const s = h.item.spells[page];
        const ud = this._reader.userData;
        for (const [k, mesh] of [['left', ud.left], ['right', ud.right]]) {
            mesh.material.map?.dispose();
            mesh.material.map = drawPage(s, k);
            mesh.material.needsUpdate = true;
        }
        this.game.hud.setVoice?.(`📖 Страница ${page + 1} из ${h.item.spells.length} — проведите рукой в сторону, чтобы перелистнуть`, true);
    }

    _turn(dir) {
        const h = this.inHand;
        const ud = this._reader.userData;
        // the sheet that flips (it carries the old page while turning)
        const src = dir > 0 ? ud.right : ud.left;
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48, 8, 1), new THREE.MeshBasicMaterial({ map: src.material.map ? src.material.map.clone() : null, side: THREE.DoubleSide }));
        if (sheet.material.map) sheet.material.map.needsUpdate = true;
        sheet.position.copy(src.position);
        sheet.position.z = 0.003;
        this._reader.add(sheet);
        ud.turning = { mesh: sheet, t: 0, dir };
        h.page += dir;
        this._setSpread(h.page);
    }

    _closeReader() {
        if (!this._reader) return;
        const r = this._reader;
        this.game.camera.remove(r);
        r.traverse((o) => { if (o.isMesh) { o.material.map?.dispose(); o.material.dispose(); o.geometry.dispose(); } });
        this._reader = null;
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        if (this.auth) {
            // keep a few birds around the player
            const me = g.character.group.position;
            for (const b of [...this.birds.values()]) if (b.state !== 'fall' && b.model.position.distanceTo(me) > 130) this._removeBird(b);
            this._spawnT -= dt;
            if (this._spawnT <= 0 && this.birds.size < BIRDS) { this._spawnT = 6; this._spawnBird(); }
        }
        for (const b of [...this.birds.values()]) {
            if (this.auth || b.state === 'fall') this._updateBird(b, dt);
            else this._followNet(b, dt);
        }
        this._updateBooks(dt);
        this._updateHeld(dt);
        // the host tells everybody where the birds are
        if (this.auth && g.sync) {
            this._netT -= dt;
            if (this._netT <= 0) {
                this._netT = 0.2;
                const r = (v) => Math.round(v * 100) / 100;
                g.sync.birds?.([...this.birds.values()].map((b) => [b.id, r(b.model.position.x), r(b.model.position.y), r(b.model.position.z), r(b.model.rotation.y), b.state === 'fly' ? 1 : b.state === 'fall' ? 2 : 0]),
                    [...this.books.values()].map((k) => [k.id, r(k.model.position.x), r(k.model.position.y), r(k.model.position.z)]));
            }
        }
    }

    // ------------------------------------------------------------ network (guests)
    applyNet(birds, books) {
        const seen = new Set();
        for (const [id, x, y, z, ry, st] of birds || []) {
            seen.add(id);
            let b = this.birds.get(id);
            if (!b) b = this._spawnBird(id, new THREE.Vector3(x, y, z));
            b.net = { p: new THREE.Vector3(x, y, z), ry, st };
            if (st === 2 && b.state !== 'fall') { b.state = 'fall'; b.vy = 1; }
        }
        for (const b of [...this.birds.values()]) if (!seen.has(b.id) && b.state !== 'fall') this._removeBird(b);
        const seenBooks = new Set();
        for (const [id, x, y, z] of books || []) {
            seenBooks.add(id);
            if (this.books.has(id)) continue;
            const b = this.birds.get(id) || this._spawnBird(id, new THREE.Vector3(x, y, z));
            b.model.position.set(x, y, z);
            this._becomeBook(b);
        }
        for (const bk of [...this.books.values()]) if (!seenBooks.has(bk.id)) this._removeBook(bk);
    }

    _followNet(b, dt) {
        if (!b.net) return;
        const k = Math.min(1, dt * 6);
        b.model.position.lerp(b.net.p, k);
        b.model.rotation.y = b.net.ry;
        b.flapT += dt * (b.net.st === 1 ? 11 : 2);
        flap(b.model, b.flapT, b.net.st === 1 ? 0.55 : 0.12);
    }

    dispose() {
        this.putAway();
        for (const b of [...this.birds.values()]) this._removeBird(b);
        for (const bk of [...this.books.values()]) this._removeBook(bk);
    }
}
