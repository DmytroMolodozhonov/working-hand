/**
 * LoreLibrary.js — the books of the world's history (LoreBooks.js) on their reading stands: in the library of the
 * wizards' tower and in any site whose record gives `lore` spots (a wizards' town's library). The author: «просто
 * стенды, похожие на божественные, но не божественные. Книги на них не левитируют, а просто лежат открытые.
 * Книгу забрать нельзя — только листать: она как будто прилипла к стенду».
 *
 * A stand is furniture of the place (LoreStand.js): a post of two blocks (the builders lay it) and a sloping board
 * with the open book on it (a model here, the same on every computer — no loose thing, so no hand, Accio,
 * Levitation, Gather, blast or wind can take the book). The pages are turned by a fingertip (BookReading.standStep),
 * each reader their own. NOT a gift of the gods: the post is ordinary blocks; when it is gone (a blast, a quake,
 * fire…) the stand goes with it, its board's box is removed and the book falls (the host lays it as an ordinary
 * loose book on the floor — it is an ordinary book from then on).
 *
 * Made when the place wakes (CastleLife._wake: a player comes near — on every computer), put away when it falls
 * asleep. A stand whose post is gone is not made again (and not saved: the world's blocks tell it).
 */
import * as THREE from 'three';
import { loreForSite, loreItem } from './LoreBooks.js';
import { newUid, makeItemModel, ITEM_SCALE } from './ItemTypes.js';
import { STAND, boardBox, postCell } from '../world/LoreStand.js';
import { mergeParts } from '../core/MergeGeometry.js';
import { setBookAngle, BOOK } from './BookModel.js';
import { makeStandPicture } from './PentagramStand.js';
import { PENT_STAND_FROM_GEN } from '../world/Terrain.js';
import { figureOf } from './PentagramRules.js';

const ON_SPOT = 1.2; // m: a library scroll this near its spot still lies where the library put it
const CHECK_T = 0.5; // s: how often a stand looks at its post (and a place at its land)
const READ_NEAR = 3.4; // m: a stand this near the eyes may have its pages turned
const SHOW_R = 12; // m: a stand this near has its pages painted (one a frame); farther: given back

const HINT_R = 26; // m: walking up this near the door, once a word on what the library is
const _v = new THREE.Vector3();
let _shared = null;
let _sign = null;
let _hinted = false;

/** The sign board over the library's door (one geometry and one material for all libraries; the word is painted once). */
export function sharedSign() {
    if (_sign) return _sign;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#3a2414'); g.addColorStop(0.5, '#4d311b'); g.addColorStop(1, '#2e1c10');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
    x.globalAlpha = 0.18; // (wood grain)
    for (let i = 0; i < 70; i++) { x.fillStyle = i % 2 ? '#000' : '#a0703c'; x.fillRect(0, (i * 37) % 256, 1024, 1 + (i % 3)); }
    x.globalAlpha = 1;
    x.strokeStyle = '#d9a93a'; x.lineWidth = 10; x.strokeRect(12, 12, 1000, 232);
    x.strokeStyle = '#8a6a22'; x.lineWidth = 3; x.strokeRect(26, 26, 972, 204);
    x.textAlign = 'center';
    x.font = 'bold 112px serif';
    x.lineJoin = 'round';
    x.strokeStyle = '#1a0f06'; x.lineWidth = 12; x.strokeText('БИБЛИОТЕКА', 512, 150);
    x.fillStyle = '#f5d36a'; x.fillText('БИБЛИОТЕКА', 512, 150);
    x.fillStyle = '#d9a93a';
    x.font = '70px serif';
    x.fillText('\u{1F4D6}', 84, 150); x.fillText('\u{1F4D6}', 940, 150); // (an open book at each end)
    x.fillStyle = '#e8d49a'; x.font = 'italic 34px serif'; x.fillText('летопись мира — листайте пальцем', 512, 220);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const edge = new THREE.MeshBasicMaterial({ color: 0x2e1c10 });
    _sign = { box: new THREE.BoxGeometry(1, 1, 1), mats: [edge, edge, edge, edge, new THREE.MeshBasicMaterial({ map: t }), edge] };
    _sign.box.userData.shared = true;
    return _sign;
}

/** The stand's board and post cap (one geometry per material, merged; made once for all stands). */
function sharedStand() {
    if (_shared) return _shared;
    const { BOARD_Y, TILT, BOARD_W: W, BOARD_L: Ln, BOARD_T: T, POST_H } = STAND;
    const board = new THREE.Matrix4().compose(new THREE.Vector3(0, BOARD_Y, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), TILT), new THREE.Vector3(1, 1, 1));
    const onBoard = (x, y, z, w, h, d) => ({ geo: new THREE.BoxGeometry(w, h, d), matrix: board.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)) });
    const wood = mergeParts([
        onBoard(0, 0, 0, W, T, Ln), // the board
        onBoard(0, T / 2 + 0.04, Ln / 2 - 0.04, W, 0.08, 0.08), // the lip at the reader's (lower) edge
        onBoard(0, T / 2 + 0.05, -Ln / 2 + 0.04, W, 0.1, 0.08), // the rib at the upper edge
        onBoard(-W / 2 + 0.03, T / 2 + 0.03, 0, 0.06, 0.06, Ln - 0.1),
        onBoard(W / 2 - 0.03, T / 2 + 0.03, 0, 0.06, 0.06, Ln - 0.1),
    ]);
    const stone = mergeParts([
        { geo: new THREE.BoxGeometry(1.1, 0.12, 1.1), pos: [0, POST_H + 0.06, 0] }, // the cap over the post
        { geo: new THREE.BoxGeometry(0.46, 0.2, 0.46), pos: [0, POST_H + 0.2, 0] }, // the neck under the board
    ]);
    for (const g of [wood, stone]) g.userData.shared = true;
    _shared = {
        wood, stone,
        woodMat: new THREE.MeshLambertMaterial({ color: 0x4a3322 }), // (dark wood, not gold: no glow of the gods)
        stoneMat: new THREE.MeshLambertMaterial({ color: 0x4b4852 }),
    };
    return _shared;
}

/** A stand's model (the board on its cap; the post itself is blocks). Local +Z is the reader's side. */
export function makeStandModel() {
    const sh = sharedStand();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(sh.wood, sh.woodMat), new THREE.Mesh(sh.stone, sh.stoneMat));
    g.userData.keep = true;
    return g;
}

/** Where the open book lies on the board (the stand's frame): its middle and its turn (spine up the slope, pages up). */
export function bookPoseOnStand(pos = new THREE.Vector3(), quat = new THREE.Quaternion()) {
    const sc = ITEM_SCALE.book || 1.6, { TILT, BOARD_Y, BOARD_T } = STAND;
    const lift = BOARD_T / 2 + BOOK.B * sc + 0.004; // (the covers' back rests on the board)
    pos.set(0, BOARD_Y + Math.cos(TILT) * lift, Math.sin(TILT) * lift);
    quat.setFromAxisAngle(_v.set(1, 0, 0), TILT - Math.PI / 2);
    return { pos, quat };
}

function disposeBook(m) {
    m.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.userData?.shared) o.geometry.dispose();
        for (const mat of [].concat(o.material)) mat.dispose();
    });
}

export class LoreLibrary {
    constructor(game) {
        this.game = game;
        this.sites = new Map(); // site id → {def, stands: [stand | null] by spot, left: spots not made yet}
        this.broken = new Set(); // 'site:i': the stand is gone (its book was let fall)
        this._t = 0;
    }

    /** The place is near now: its stands (every computer; the land under them may not be made yet — update tries again). */
    wake(def) {
        if (this.sites.has(def.id)) return;
        const list = loreForSite(def);
        // (worlds of generation 10+: the last stand of the library shows the drawing of the teleportation pentagram instead of a book — PentagramStand.js)
        const spots = def?.lore || [];
        if ((this.game.gen ?? 1) >= PENT_STAND_FROM_GEN && spots.length && figureOf('teleport')) {
            const at = spots[spots.length - 1];
            if (list.length >= spots.length) list[spots.length - 1] = { pent: 'teleport', at };
            else list.push({ pent: 'teleport', at: spots[list.length] || at });
        }
        if (!list.length) return;
        this.sites.set(def.id, { def, list, sign: this._makeSign(def), stands: list.map(() => null), done: list.map(() => false) });
        this._make(this.sites.get(def.id));
    }

    /** The board with the word «Библиотека» over the door of a settlement's library (def.library.sign: its place; null where there is none). */
    _makeSign(def) {
        const at = def?.library?.sign, g = this.game;
        if (!at || !g.scene || typeof document === 'undefined') return null;
        const S = sharedSign();
        const m = new THREE.Mesh(S.box, S.mats);
        m.scale.set(8, 2, 0.12);
        m.position.set(at.x, at.y, at.z);
        m.rotation.y = at.yaw;
        m.userData.keep = true;
        g.scene.add(m);
        return m;
    }

    /** The place is far: its stands are put away (made again on waking, if their posts still stand). */
    sleep(def) {
        const S = this.sites.get(def.id);
        if (!S) return;
        for (const st of S.stands) if (st) this._remove(st);
        if (S.sign) this.game.scene?.remove(S.sign);
        this.sites.delete(def.id);
    }

    _data() {
        return this.game.world?.terrain?.data || this.game.terrain?.data || null;
    }

    /** Is the stand's post (two blocks) still there? null: its land is not made on this computer yet. */
    _posted(spot) {
        const data = this._data();
        if (!data?.get) return true; // (no world — a test)
        const [ix, iz, L] = postCell(spot);
        if (data.hasChunk && !data.hasChunk(ix >> 5, iz >> 5)) return null;
        return data.get(ix, L, iz) !== 0 && data.get(ix, L + 1, iz) !== 0;
    }

    _make(S) {
        const g = this.game;
        S.list.forEach(({ id, at, pent }, i) => {
            if (S.done[i]) return;
            const key = S.def.id + ':' + i;
            if (this.broken.has(key)) { S.done[i] = true; return; }
            const post = this._posted(at);
            if (post === null) return; // (later)
            S.done[i] = true;
            if (!post || !g.scene) return; // (the post is gone: no stand — the book is wherever it fell)
            const group = makeStandModel();
            group.position.set(at.x, at.y, at.z);
            group.rotation.y = at.face || 0;
            if (pent) { // (the drawing of a pentagram on the board: nothing to take, nothing to turn)
                const pic = makeStandPicture(pent);
                group.add(pic);
                g.scene.add(group);
                group.updateMatrixWorld(true);
                S.stands[i] = { key, id: pent, pent, spot: at, group, book: pic, item: null, s: null, boxId: g.collision?.addBox ? g.collision.addBox({ ...boardBox({ ...at, face: at.face || 0 }), kind: 'table' }) : null };
                return;
            }
            const item = loreItem(id, 'lore:' + key);
            const book = makeItemModel(item);
            const sc = ITEM_SCALE.book || 1.6;
            book.scale.setScalar(sc);
            bookPoseOnStand(book.position, book.quaternion);
            setBookAngle(book, Math.PI);
            group.add(book);
            g.scene.add(group);
            group.updateMatrixWorld(true);
            const st = { key, id, spot: at, group, book, item, s: null, boxId: g.collision?.addBox ? g.collision.addBox({ ...boardBox({ ...at, face: at.face || 0 }), kind: 'table' }) : null };
            S.stands[i] = st;
        });
        S.complete = S.done.every(Boolean);
    }

    _remove(st) {
        const g = this.game;
        if (!st.pent) this.game.books?.reading?.standClose(st.s);
        st.s = null;
        if (st.boxId != null) g.collision?.removeBox(st.boxId);
        g.scene?.remove(st.group);
        if (!st.pent) disposeBook(st.book); // (the picture's texture, material and shape are shared by all the stands)
    }

    /** The post is gone: the stand falls with it and the book drops to the floor as an ordinary loose book (the host lays it). */
    _break(S, i) {
        const st = S.stands[i];
        const at = st.book.getWorldPosition(new THREE.Vector3());
        this._remove(st);
        S.stands[i] = null;
        this.broken.add(st.key);
        if (st.pent) return; // (a picture: nothing falls)
        const g = this.game;
        if (g.authority && g.items) g.items.spawnLoose(loreItem(st.id, 'lore' + newUid()), at.setY(at.y + 0.1), { quat: st.group.getWorldQuaternion(new THREE.Quaternion()) });
    }

    update(dt) {
        const g = this.game;
        if (!this.sites.size) return;
        this._t += dt;
        if (this._t >= CHECK_T) {
            this._t = 0;
            for (const S of this.sites.values()) {
                if (!S.complete) this._make(S);
                S.stands.forEach((st, i) => { if (st && this._posted(st.spot) === false) this._break(S, i); });
            }
        }
        const reading = g.books?.reading;
        const eye = g.character?.head?.getWorldPosition?.(_v);
        if (eye && !_hinted) { // (walking up to a library's door: once, what it is)
            for (const S of this.sites.values()) {
                const d = S.def.library?.door;
                if (d && Math.hypot(d.x - eye.x, d.z - eye.z) < HINT_R) {
                    _hinted = true;
                    g.hud?.setVoice?.('📖 Библиотека: на аналоях лежат книги об истории мира — листайте их пальцем', true);
                    break;
                }
            }
        }
        if (!reading || !eye) return;
        let nearest = null, nd = READ_NEAR, opened = false;
        for (const S of this.sites.values()) {
            for (const st of S.stands) {
                if (!st) continue;
                if (st.pent) { this._look(st, eye); continue; } // (a painted board: only looked at)
                const d = st.book.getWorldPosition(this._p || (this._p = new THREE.Vector3())).distanceTo(eye);
                if (d < nd) { nd = d; nearest = st; }
                if (d < SHOW_R) {
                    if (!st.s && !opened) { st.s = reading.standOpen(st.book, st.item); opened = true; } // (one painted at a frame)
                } else if (st.s) {
                    reading.standClose(st.s);
                    st.s = null;
                }
            }
        }
        for (const S of this.sites.values()) for (const st of S.stands) if (st?.s) reading.standStep(st.s, dt, st === nearest);
    }

    /** Walking up to the painted board: once a word on what it is and how the drawing is learnt. */
    _look(st, eye) {
        if (st.told) return;
        const p = st.group.getWorldPosition(this._p || (this._p = new THREE.Vector3()));
        if (Math.hypot(p.x - eye.x, p.z - eye.z) > 3.4 || Math.abs(p.y - eye.y) > 5) return;
        st.told = true;
        const g = this.game;
        g.hud?.setVoice?.('🌀 На стенде нарисована пентаграмма телепортации. Смотреть на неё может каждый, но выучить её можно, только сжигая свиток с ней', true);
    }

    sampleModels() {
        const m = makeStandModel();
        if (typeof document !== 'undefined') { const S = sharedSign(); m.add(new THREE.Mesh(S.box, S.mats)); }
        if (figureOf('teleport')) { const pic = makeStandPicture('teleport'); pic.position.x = 3; m.add(pic); }
        const b = makeItemModel(loreItem('coprus', 'sample'));
        bookPoseOnStand(b.position, b.quaternion);
        b.scale.setScalar(ITEM_SCALE.book || 1.6);
        setBookAngle(b, Math.PI);
        m.add(b);
        return [m];
    }
}

/** Is this loose thing a library's thing still lying where the library put it (a scroll on the table)? (WorldSave does not keep those.) */
export function onSpot(L) {
    return !!L?.shelfAt && L.model.position.distanceTo(L.shelfAt) < ON_SPOT;
}
