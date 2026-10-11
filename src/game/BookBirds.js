/**
 * BookBirds.js — book-birds and their books of spells.
 *
 * A few birds that are books: the covers are the wings, the pages flutter.
 * They fly from tree to tree (rarely landing on the ground). Hit one with a
 * spell and it falls — a book lies there, glowing. Take it with the hand: it
 * is held by its spine in the fist like any thing (thrown, put into a slot,
 * given away). It is opened and read with the hands like a real book
 * (BookReading.js): the other hand takes the cover, the hands apart open it,
 * a fingertip turns the pages; each spread shows one spell (a drawing of the
 * gesture and the words). Reading it teaches the spell — outside creative,
 * building magic is learned only so.
 * Every book holds up to three spells, picked at random (they repeat).
 *
 * The swift book-bird: a sky-blue book with silver trim and a light-blue trail.
 * It flies the same way, only twice as fast (and its wings beat faster); it is
 * met four times more rarely than an ordinary one. Its book holds one spell
 * only — «Флайн»: reading it is the one way to learn to fly (in «Выживание»).
 * Its id tells it apart (≥ SWIFT_ID), so every computer knows it is the swift one.
 *
 * Multiplayer: the host flies the birds and decides hits; everybody sees
 * them; a book is taken by whoever reaches it first (the host decides).
 */

import * as THREE from 'three';
import { isLeaves } from '../world/Terrain.js';
import { BookReading, bookSpellName } from './BookReading.js';
import { SWIFT_COVER, SWIFT_TRIM } from './BookModel.js';

export { bookSpellName };

export const BOOK_POOL = ['Gather', 'CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'CreateBoard'];
const BIRDS = 4;
const SPEED = 7;
const COVERS = [0x8e2b2b, 0x2b4f8e, 0x2f6b3a, 0x6b3f8e, 0x8e6a2b];

/** The swift book-bird (it teaches «Флайн»): twice as fast, four times rarer than an ordinary one. */
export const SWIFT = {
    SPEED: SPEED * 2,
    CHANCE: 1 / 5, // of the birds that appear: one swift for four ordinary ones
    COVER: SWIFT_COVER, // sky blue
    TRIM: SWIFT_TRIM, // silver
};
export const SWIFT_ID = 900000000;
/** Is this book-bird (or its book) the swift one? */
export const isSwiftId = (id) => +id >= SWIFT_ID;
/** The Creative pedestal's swift book (the same id on every computer). */
export const SWIFT_PEDESTAL_ID = SWIFT_ID + 777002;
/** A bird's speed along its path (m/s). */
export const birdSpeed = (id) => (isSwiftId(id) ? SWIFT.SPEED : SPEED);
/** A new bird: the swift one now and then (SWIFT.CHANCE). */
export const rollSwift = (r = Math.random) => r() < SWIFT.CHANCE;

/** How each spell is done — for the book's pages. */
const HOW = {
    Gather: { words: 'Gather', hand: 'one', text: 'Поднимите руку и укажите на дерево, камень, землю или листву (до 10 м). Скажите «Gather» — магия разберёт это и принесёт в ячейку. Дерево целиком — 20 древесины.' },
    CreateFloor: { words: 'Create a Floor', hand: 'reach', text: 'Выберите ячейку с ресурсом (коснитесь левого кармана). Укажите рукой место и скажите заклинание: появится блок. Тяните руку — пол растёт. Опустите руку или скажите «Stand».' },
    CreateWall: { words: 'Create a Wall', hand: 'wall', text: 'Укажите рукой место стены и скажите заклинание. Ведите руку в сторону и вверх — стена растёт в ширину и в высоту, пока хватает ресурса.' },
    CreateCeiling: { words: 'Create a Ceiling', hand: 'reach', text: 'Укажите рукой место — потолок появится на высоте трёх блоков. Тяните руку — он растёт над вами.' },
    BuildRoof: { words: 'Build a Roof', hand: 'reach', text: 'Укажите место и тяните руку: двускатная крыша растёт ступенями от краёв к коньку.' },
    CreateBoard: { words: 'Create a Board', hand: 'board', text: 'Поднимите руку, покажите на дерево и скажите заклинание — ствол станет доской для волн. Несите её двумя руками за края или под мышкой. Положите на воду и разожмите руки. Поднимите колено над доской и опустите ногу — вы на доске; другой ногой гребите. Волна подхватила — встаньте обеими ногами; наклон влево-вправо поворачивает.' },
    Flight: { words: 'Флайн', hand: 'up', text: 'Поднимите обе руки вверх и скажите «Флайн» — вы взлетите. Рулите корпусом: наклон вперёд — вниз, назад — вверх, повороты плечами. «Паузин» — парить на месте. Приземление — направьте себя в землю. Полёт тратит ману.' },
    CreateDoor: { words: 'Create a Door', hand: 'door', text: 'Держите в руке дерево (не меньше 12). Скажите заклинание — кубик станет маленькой дверью. Отводите руку — дверь растёт; покажите, куда её поставить, и скажите «Stand».' },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function rngFrom(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

/** Up to three spells, random but the same on every computer for this id. */
export function bookSpells(id) {
    if (isSwiftId(id)) return ['Flight']; // (the swift book: only «Флайн»)
    const r = rngFrom(id * 7919 + 17);
    const n = 1 + Math.floor(r() * 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(BOOK_POOL[Math.floor(r() * BOOK_POOL.length)]);
    return [...new Set(out)];
}

// ---------------------------------------------------------------- models
export function makeBookModel(color, trimColor = 0xd4af37) {
    const g = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color });
    const gold = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.3, metalness: 0.8 });
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

/** The book-bird's model for this id (the swift one: sky blue with silver trim). */
export function bookModelFor(id) {
    return isSwiftId(id) ? makeBookModel(SWIFT.COVER, SWIFT.TRIM) : makeBookModel(COVERS[id % COVERS.length]);
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
        if (how.hand === 'up') { x.beginPath(); x.moveTo(90, 150); x.lineTo(65, 95); x.stroke(); } // (both arms up)
        else { x.beginPath(); x.moveTo(90, 150); x.lineTo(60, 190); x.stroke(); } // other arm down
        x.beginPath(); x.moveTo(90, 150);
        if (how.hand === 'up') x.lineTo(115, 95);
        else if (how.hand === 'wall') x.lineTo(150, 115);
        else if (how.hand === 'door') x.lineTo(140, 160);
        else x.lineTo(150, 150);
        x.stroke();
        // what appears
        x.fillStyle = '#8b6b3e';
        if (how.hand === 'wall') { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.fillRect(165 + i * 22, 140 + j * 22, 20, 20); }
        else if (how.hand === 'door') { x.fillRect(170, 150, 40, 80); x.fillStyle = '#d4af37'; x.beginPath(); x.arc(202, 192, 4, 0, 7); x.fill(); }
        else if (how.hand === 'board') {
            // a tree, an arrow, a surfboard with its fins
            x.fillStyle = '#2f8a2f'; x.fillRect(160, 120, 30, 26); x.fillStyle = '#6b3f1e'; x.fillRect(170, 146, 10, 40);
            x.strokeStyle = '#9b5bff'; x.beginPath(); x.moveTo(185, 196); x.lineTo(200, 214); x.stroke();
            x.fillStyle = '#b07c45'; x.beginPath(); x.ellipse(205, 250, 14, 44, 0.2, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#5a3a1a'; x.fillRect(208, 288, 4, 10);
        } else if (how.hand === 'up') {
            // the wizard rising: little wind lines under the feet, a cloud aside
            x.strokeStyle = '#7fc8f0'; x.lineWidth = 3;
            for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(72 + i * 18, 290); x.lineTo(72 + i * 18, 305); x.stroke(); }
            x.fillStyle = '#cfe8f7'; x.beginPath(); x.arc(185, 120, 18, 0, 7); x.arc(208, 125, 14, 0, 7); x.arc(165, 128, 12, 0, 7); x.fill();
        } else if (how.hand === 'one') { x.fillStyle = '#2f8a2f'; x.fillRect(170, 150, 50, 40); x.fillStyle = '#6b3f1e'; x.fillRect(188, 190, 14, 60); }
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
        x.fillText(bookSpellName(spell), 128, 336);
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
        this.reading = new BookReading(game, this, drawPage); // the book in the hands, like a real one
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
        id = id ?? (rollSwift() ? SWIFT_ID + this._nextId++ : this._nextId++);
        const model = bookModelFor(id);
        model.scale.setScalar(1.4);
        g.scene.add(model);
        const me = g.character.group.position;
        const at = pos || this._perchNear(me, 25, 60);
        model.position.copy(at);
        const b = { id, model, isBird: true, swift: isSwiftId(id), support: at.support || null, state: 'perch', t: Math.random() * 3, wait: 2 + Math.random() * 5, from: at.clone(), to: at.clone(), ctrl: at.clone(), hp: 2, vy: 0, flapT: Math.random() * 6 };
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
                b.dur = b.from.distanceTo(b.to) / birdSpeed(b.id);
            }
        } else if (b.state === 'fly') {
            b.flapT += dt * (b.swift ? 22 : 11);
            if (b.swift) this._trail(b);
            flap(m, b.flapT, 0.55);
            const k = Math.min(1, b.t / b.dur);
            const p = _v1.copy(b.from).multiplyScalar((1 - k) * (1 - k)).addScaledVector(b.ctrl, 2 * (1 - k) * k).addScaledVector(b.to, k * k);
            const dir = _v2.subVectors(p, m.position);
            if (dir.lengthSq() > 1e-6) m.rotation.y = Math.atan2(dir.x, dir.z);
            m.position.copy(p);
            if (k >= 1) { b.state = 'perch'; b.t = 0; b.wait = 3 + Math.random() * 6; b.support = b.toSupport || null; b.checkT = 0; }
        } else if (b.state === 'held') {
            // caught by «Вингардиум Левиоса»: it hangs where the hand holds it, flapping to get free
            b.flapT += dt * 16;
            flap(m, b.flapT, 0.7);
            // (held by another player's hand that went silent: it gets free)
            if (b.heldBy && performance.now() - (b.heldSeen || 0) > 3000) this.holdBird(b, false, b.heldBy);
            if (Math.random() < 0.25) this.game.fx.spark(m.position, Math.random() < 0.5 ? 0xffe9a8 : 0xc9a8ff, 0.07, _v2.set(0, 0.5, 0), 0.5);
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

    /** The swift bird's light-blue trail behind it. */
    _trail(b) {
        if (Math.random() < 0.6) this.game.fx?.spark?.(b.model.position, Math.random() < 0.5 ? 0x9fd8ff : 0xe8f6ff, 0.08, _v2.set(0, 0.2, 0), 0.6);
    }

    /**
     * «Вингардиум Левиоса» caught a bird (on) — it hangs and flaps where the hand holds it —
     * or let it go: it flies off to a tree (it is not hurt).
     */
    holdBird(b, on, by = null) {
        if (!b || b.state === 'fall') return;
        if (!this.auth && !by) { this.game.sync?.birdHold(b.id, on); b.localHeld = on; } // (the host flies the birds)
        if (on) { b.state = 'held'; b.t = 0; b.heldBy = by; b.heldSeen = performance.now(); return; }
        if (b.state !== 'held') return;
        b.heldBy = null;
        b.state = 'perch';
        b.t = b.wait = 0; // (off at once)
        b.support = null;
    }

    /** (the levitating hand) Where the caught bird is now. */
    heldAt(b, pos) {
        if (this.auth) return;
        this._heldNetT = (this._heldNetT || 0) - 1;
        if (this._heldNetT <= 0) { this._heldNetT = 6; this.game.sync?.birdAt(b.id, pos); }
    }

    /** A book let go in the air (after «Левиоса»): it falls to the ground. */
    dropBook(bk, vel) {
        bk.fallV = vel ? vel.clone() : new THREE.Vector3();
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
        this.game.hud.toast?.(isSwiftId(b.id) ? '📘 Быстрая книга упала на землю — возьмите её рукой: в ней «Флайн»!' : '📖 Книга упала на землю — возьмите её рукой');
    }

    /** A book lying somewhere (a creative pedestal): taken by hand like a fallen one. */
    placeBook(pos, id) {
        if (this.books.has(id)) return;
        const m = bookModelFor(id);
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

    /** «Флайн» read in the swift book: flying is known for good (kept with the player's bonuses). */
    learnFlight() {
        const g = this.game;
        g.bonus = { ...(g.bonus || {}), flight: true };
    }

    // ------------------------------------------------------------ books
    _updateBooks(dt) {
        const g = this.game;
        for (const bk of this.books.values()) {
            bk.t += dt;
            if (bk.fallV && !bk.lev && !bk.accio) {
                // falling after being let go in the air
                bk.fallV.y -= 14 * dt;
                bk.model.position.addScaledVector(bk.fallV, dt);
                const ground = g.collision.groundY(bk.model.position.x, bk.model.position.z) + 0.15;
                if (bk.model.position.y <= ground) { bk.model.position.y = ground; bk.fallV = null; bk.model.rotation.set(0, bk.model.rotation.y, 0); }
            }
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
        g.items?._gotItem({ kind: 'book', uid: 'book' + id, id, spells, ...(isSwiftId(id) ? { swift: true } : {}) }, side);
        g.hud.toast?.('📖 Книга в руке: возьмите её второй рукой за край обложки и разведите руки — она раскроется', 3000);
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
    /** Held open by the hands (BookReading): the hand that owns it, the camera to the pages. */
    get readingSide() { return this.reading.readingSide; }
    get readCam() { return this.reading.readCam; }

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
            else if (b.localHeld) { b.flapT += dt * 16; flap(b.model, b.flapT, 0.7); } // (my «Левиоса» holds it here)
            else this._followNet(b, dt);
        }
        this._updateBooks(dt);
        this.reading.update(dt);
        // the host tells everybody where the birds are
        if (this.auth && g.sync) {
            this._netT -= dt;
            if (this._netT <= 0) {
                this._netT = 0.2;
                const r = (v) => Math.round(v * 100) / 100;
                g.sync.birds?.([...this.birds.values()].map((b) => [b.id, r(b.model.position.x), r(b.model.position.y), r(b.model.position.z), r(b.model.rotation.y), b.state === 'fly' ? 1 : b.state === 'fall' ? 2 : b.state === 'held' ? 3 : 0]),
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
        b.flapT += dt * (b.net.st === 1 ? (b.swift ? 22 : 11) : b.net.st === 3 ? 16 : 2);
        if (b.swift && b.net.st === 1) this._trail(b);
        flap(b.model, b.flapT, b.net.st === 1 ? 0.55 : b.net.st === 3 ? 0.7 : 0.12);
    }

    dispose() {
        this.reading.dispose();
        for (const b of [...this.birds.values()]) this._removeBird(b);
        for (const bk of [...this.books.values()]) this._removeBook(bk);
    }
}
