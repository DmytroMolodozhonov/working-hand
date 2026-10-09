/**
 * BookBirds.js — book-birds and their books of spells.
 *
 * A few birds that are books: the covers are the wings, the pages flutter.
 * They fly from tree to tree (rarely landing on the ground). Hit one with a
 * spell and it falls — a book lies there, glowing. Take it with the hand: it
 * is held by its spine in the fist like any thing (thrown, put into a slot,
 * given away). Raise both hands in front: it opens between them, twice as
 * big, the pages to the reader; swipe the right hand sideways to turn a page; each spread
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
import { BOOK, setBookOpen } from './BookModel.js';
import { ITEM_SCALE } from './ItemTypes.js';

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
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3(), _v8 = new THREE.Vector3(), _v9 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();

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
        this._read = null; // the book being read: {model, item, open, page, tex…}
        this.readingSide = null;
        this.readCam = null; // {at, from, k}: the camera over the shoulder to the pages
        this._nextId = 1 + Math.floor(Math.random() * 100000) * 100;
        this._spawnT = 1;
        this._netT = 0;
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
        if (g.combat.dead || !g.items) return;
        // A free hand that reaches a book takes it
        for (const side of ['right', 'left']) {
            if (g.weapons.hands[side].held || g.items.held[side]) continue;
            const hand = g.character.getHandWorldPosition(side, _v1);
            for (const bk of this.books.values()) {
                if (bk.model.position.distanceTo(hand) < 1.3) {
                    if (this.auth) this._take(bk.id, g.localId, side);
                    else if (!bk.asked) { bk.asked = true; g.sync?.bookTake?.(bk.id); setTimeout(() => { bk.asked = false; }, 2000); }
                    return;
                }
            }
        }
    }

    /** The host gives the book to the first one who reached it. */
    _take(id, toId, side = 'right') {
        const bk = this.books.get(id);
        if (!bk) return;
        this._removeBook(bk);
        if (this.game.sync) this.game.sync.bookGone?.(id, toId);
        if (toId === this.game.localId) this._toHand(id, bk.spells, side);
    }

    /** (guests) The host gave a book away. */
    netGone(id, toId) {
        const bk = this.books.get(id);
        if (bk) this._removeBook(bk);
        if (toId === this.game.localId) this._toHand(id, bookSpells(id), this.game.items?.held.right ? 'left' : 'right');
    }

    /** The book is a thing like any other now: in the fist, thrown, put into a slot, given away. */
    _toHand(id, spells, side) {
        const g = this.game;
        g.items?._gotItem({ kind: 'book', uid: 'book' + id, id, spells }, side);
        g.hud.toast?.('📖 Книга в руке: поднимите обе руки перед собой — она откроется', 2500);
    }

    _removeBook(bk) {
        this.books.delete(bk.id);
        this.game.scene.remove(bk.model);
        bk.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
    }

    /** The book in my hands, if any (it is held as an item). */
    get inHand() {
        return this.game.items?.heldOf('book') || null;
    }

    // ------------------------------------------------------------ reading
    /**
     * Both hands up in front and apart: the book leaves the fist, opens between
     * the hands and grows twice as big; its pages look at the reader, the camera
     * comes over the shoulder to them. A swipe of the right hand turns a page.
     */
    _updateHeld(dt) {
        const g = this.game;
        const hb = this.inHand;
        const r = this._read;
        if (!hb || (r && r.model !== hb.model)) this._stopReading(!hb || !hb.model.parent);
        if (!hb) return;
        const ch = g.character;
        const hl = ch.getHandWorldPosition('left', _v1), hr = ch.getHandWorldPosition('right', _v2);
        const want = !g.combat.dead && ch.isArmRaised('left') && ch.isArmRaised('right') && hl.distanceTo(hr) > 0.7 && this._inFront(hl) && this._inFront(hr);
        const R = this._read || (this._read = { model: hb.model, item: hb.item, open: 0, page: 0, tex: null, turning: null, c: null, q: new THREE.Quaternion() });
        R.open += ((want ? 1 : 0) - R.open) * Math.min(1, dt * 5);
        if (!want && R.open < 0.02) { this._stopReading(false); return; }
        this.readingSide = hb.side;
        const m = hb.model;
        // where: between the hands; facing: the reader's eyes (over the shoulder in the third person)
        // (a little beyond the hands, so that the arms hold it from below and don't hide the pages)
        const c = _v3.addVectors(hl, hr).multiplyScalar(0.5);
        const eye = this._eye(_v4);
        c.addScaledVector(_v5.subVectors(c, eye).setY(0).normalize(), 0.7);
        c.y += 0.45;
        if (!R.c) R.c = c.clone(); else R.c.lerp(c, Math.min(1, dt * 10));
        const n = _v5.subVectors(eye, R.c).normalize();
        const up = _v6.set(0, 1, 0).addScaledVector(n, -n.y);
        if (up.lengthSq() < 1e-4) up.set(0, 0, -1); else up.normalize();
        const x = _v7.crossVectors(up, n);
        _m4.makeBasis(x, up, n);
        _q.setFromRotationMatrix(_m4);
        R.q.slerp(_q, R.qSet ? Math.min(1, dt * 10) : 1);
        R.qSet = true;
        const k = R.open;
        m.position.lerp(R.c, k);
        m.quaternion.slerp(R.q, k);
        const base = ITEM_SCALE.book || 1.6;
        m.scale.setScalar(base * (1 + k)); // twice as big when open
        setBookOpen(m, k);
        if (k > 0.35) this._pages(dt, R);
        // the camera: over the shoulder to the pages, so that they fill most of the view
        if (g.cameraMode !== 'fpv') {
            const width = 2 * (BOOK.W + BOOK.T + BOOK.B) * base * 2;
            const cam = g.camera;
            const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
            const vfov = THREE.MathUtils.degToRad(cam.fov);
            const dist = Math.max(width / 0.68 / (2 * Math.tan(hfov / 2)), BOOK.H * base * 2 / 0.68 / (2 * Math.tan(vfov / 2)));
            this.readCam = { at: R.c, from: _v8.copy(R.c).addScaledVector(n, dist), k: Math.min(1, k * 1.2) };
        } else this.readCam = null;
    }

    /** A hand up in front of the body (not hanging at the side): at the chest or higher, ahead of it. */
    _inFront(p) {
        const ch = this.game.character;
        ch.group.updateMatrixWorld(true);
        const l = _v9.copy(p).applyMatrix4(_m4.copy(ch.group.matrixWorld).invert());
        return l.y > 0.45 && l.z < -0.25; // (the body looks along −Z; shoulders at y 1.25)
    }

    /** Where the reader looks from: the head (first person) or above and behind it. */
    _eye(out) {
        const g = this.game, ch = g.character;
        ch.head.getWorldPosition(out);
        if (g.cameraMode === 'fpv') return out;
        const yaw = ch.group.rotation.y;
        return out.add(_v9.set(Math.sin(yaw) * 1.4, 1.1, Math.cos(yaw) * 1.4)); // (the body looks along −Z)
    }

    /** The spread on the pages; reading it teaches its spell; a swipe turns a page. */
    _pages(dt, R) {
        const g = this.game;
        const spells = R.item.spells || [];
        const b = R.model.userData.book;
        if (!b || !spells.length) return;
        if (!R.tex) {
            // every page drawn once; the page faces show them, bright to read
            R.tex = spells.map((s) => ({ left: drawPage(s, 'left'), right: drawPage(s, 'right') }));
            R.matL = new THREE.MeshBasicMaterial({ map: R.tex[0].left });
            R.matR = new THREE.MeshBasicMaterial({ map: R.tex[0].right });
            b.faceL.material = R.matL;
            b.faceR.material = R.matR;
            R.page = Math.min(R.page, spells.length - 1);
            this._setSpread(R, R.page);
        }
        // turn a page: swipe the right hand sideways (in the view)
        const ch = g.character;
        const v = ch.handVelocity.right;
        const side = v.dot(_v1.set(1, 0, 0).applyQuaternion(g.camera.quaternion));
        const now = performance.now();
        if (!R.turning && now - (R.turnedAt || 0) > 700) {
            if (side < -2.2 && R.page < spells.length - 1) { R.turnedAt = now; this._turn(R, +1); }
            else if (side > 2.2 && R.page > 0) { R.turnedAt = now; this._turn(R, -1); }
        }
        // the sheet that turns: it swings over the spine
        const tu = R.turning;
        if (tu) {
            tu.t += dt * 2.2;
            const a = Math.min(1, tu.t);
            const e = a * a * (3 - 2 * a);
            tu.sheet.rotation.y = (tu.dir > 0 ? -1 : 1) * Math.PI * e;
            if (a >= 1) {
                R.model.remove(tu.pv);
                tu.pv.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                R.turning = null;
                this._setSpread(R, R.page);
            }
        }
        // reading a spread teaches its spell
        const s = spells[R.page];
        if (s && !this.learned.has(s) && R.open > 0.8 && !R.turning) {
            this.learned.add(s);
            g.hud.toast?.(`📖 Изучено заклинание: «${BUILD_SPELLS[s]?.name || s}»`, 2500);
            g.fx.lightFlash?.(R.c, 0xffe9a8, 2, 0.3, 10);
        }
    }

    _setSpread(R, page, only = null) {
        const t = R.tex[page];
        if (!t) return;
        if (only !== 'right') { R.matL.map = t.left; R.matL.needsUpdate = true; }
        if (only !== 'left') { R.matR.map = t.right; R.matR.needsUpdate = true; }
        this.game.hud.setVoice?.(`📖 Страница ${page + 1} из ${R.tex.length} — проведите правой рукой в сторону, чтобы перелистнуть`, true);
    }

    /** A sheet swings over the spine: it carries the old page on its front and the new one on its back. */
    _turn(R, dir) {
        const { W, H, T } = BOOK;
        const old = R.tex[R.page], next = R.tex[R.page + dir];
        const arc = new THREE.Group(); // (squashed towards the reader: the sheet swings low over the book)
        arc.position.z = T + 0.004;
        arc.scale.z = 0.3;
        const pv = new THREE.Group();
        arc.add(pv);
        const geo = () => new THREE.PlaneGeometry(W - 0.03, H - 0.04);
        const sx = dir > 0 ? 1 : -1;
        const front = new THREE.Mesh(geo(), new THREE.MeshBasicMaterial({ map: dir > 0 ? old.right : old.left }));
        front.position.x = sx * (W / 2 + T - 0.005);
        const back = new THREE.Mesh(geo(), new THREE.MeshBasicMaterial({ map: dir > 0 ? next.left : next.right }));
        back.position.x = front.position.x;
        back.rotation.y = Math.PI;
        back.position.z = -0.001;
        pv.add(front, back);
        R.model.add(arc);
        R.turning = { pv: arc, sheet: pv, t: 0, dir };
        R.page += dir;
        // the page under the sheet shows the new spread at once; the other one when the sheet lands
        this._setSpread(R, R.page, dir > 0 ? 'right' : 'left');
    }

    /** Back into the fist (or the book is gone: thrown, in a slot, given away). */
    _stopReading(gone) {
        const R = this._read;
        this.readingSide = null;
        this.readCam = null;
        if (!R) return;
        this._read = null;
        const b = R.model.userData.book;
        if (R.turning) { R.model.remove(R.turning.pv); R.turning.pv.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
        if (R.tex) {
            if (b && !gone) { b.faceL.material = b.paper; b.faceR.material = b.paper; }
            if (b && gone) b.paper.dispose();
            R.matL.dispose(); R.matR.dispose();
            for (const t of R.tex) { t.left.dispose(); t.right.dispose(); }
        }
        if (!gone) { setBookOpen(R.model, 0); R.model.scale.setScalar(ITEM_SCALE.book || 1.6); }
        const hud = this.game.hud;
        if (hud._lastVoice?.startsWith?.('📖 Страница')) hud.setVoice('', false);
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
        this._stopReading(true);
        for (const b of [...this.birds.values()]) this._removeBird(b);
        for (const bk of [...this.books.values()]) this._removeBook(bk);
    }
}
