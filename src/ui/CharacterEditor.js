/**
 * CharacterEditor.js — the «Персонаж» tab: make your own heroes.
 *
 * Choose a face (30), hair, a hat, a top, bottoms and shoes (10 each) and
 * every colour. Several heroes can be kept (on this computer); the one with
 * the star is the one you play — on a server the others see it too.
 */

import * as THREE from 'three';
import { VoxelCharacter } from '../entities/Character.js';
import { defaultLook, randomLook, FACE_COUNT, HAIR_STYLES, HATS, TOPS, BOTTOMS, SHOES, SKIN_TONES } from '../entities/Appearance.js';

const KEY = 'zns-characters';

function load() {
    try {
        const d = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (d && Array.isArray(d.list) && d.list.length) return d;
    } catch (e) { /* fresh */ }
    const first = { id: 'c' + Date.now().toString(36), name: 'Мой герой', look: defaultLook() };
    return { list: [first], active: first.id };
}

function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ }
}

/** The look of the hero to play now. */
export function activeLook() {
    const d = load();
    return (d.list.find((c) => c.id === d.active) || d.list[0]).look;
}

const hex = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export class CharacterEditor {
    constructor(root) {
        this.root = root;
        this.data = load();
        this.editing = this.data.active;
        this._built = false;
        this._raf = null;
        this.yaw = Math.PI - 0.5; // the face towards you
    }

    get current() {
        return this.data.list.find((c) => c.id === this.editing) || this.data.list[0];
    }

    _build() {
        this._built = true;
        this.root.innerHTML = `
            <div class="ce-layout">
                <div class="ce-preview-col">
                    <canvas id="ce-canvas" width="300" height="420"></canvas>
                    <div class="ce-hint">Потяните, чтобы повернуть</div>
                </div>
                <div class="ce-controls">
                    <div class="ce-heroes" id="ce-heroes"></div>
                    <div class="mp-row">
                        <input type="text" id="ce-name" maxlength="20" placeholder="Имя героя">
                        <button class="mp-btn" id="ce-new">➕ Новый</button>
                        <button class="mp-btn mp-btn-grey" id="ce-random">🎲 Случайный</button>
                        <button class="mp-btn mp-btn-grey" id="ce-del">🗑</button>
                    </div>
                    <div id="ce-options" class="ce-options"></div>
                </div>
            </div>`;
        const canvas = this.root.querySelector('#ce-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(32, 300 / 420, 0.1, 100);
        this.camera.position.set(0, 1.6, 12);
        this.camera.lookAt(0, 0.9, 0);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(3, 6, 8);
        this.scene.add(sun);
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.2, 32), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
        floor.position.y = -2.15;
        this.scene.add(floor);
        this.hero = new VoxelCharacter(this.scene, { remote: true });
        this.hero.setShowHands(true);
        this.hero.group.position.set(0, 0, 0);
        // arms hanging down a little forward
        this.hero.leftArmAnchor.rotation.set(1.35, 0, 0.12);
        this.hero.rightArmAnchor.rotation.set(1.35, 0, -0.12);
        this.hero.leftElbowAnchor.rotation.set(-0.35, 0, 0);
        this.hero.rightElbowAnchor.rotation.set(-0.35, 0, 0);
        // drag to turn
        let drag = null;
        canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; this._dragging = true; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', (e) => { if (drag != null) { this.yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
        canvas.addEventListener('pointerup', () => { drag = null; this._dragging = false; });
        this.root.querySelector('#ce-new').onclick = () => {
            const c = { id: 'c' + Date.now().toString(36), name: 'Герой ' + (this.data.list.length + 1), look: randomLook() };
            this.data.list.push(c);
            this.editing = c.id;
            this._changed();
        };
        this.root.querySelector('#ce-random').onclick = () => { this.current.look = randomLook(); this._changed(); };
        this.root.querySelector('#ce-del').onclick = () => {
            if (this.data.list.length <= 1) return;
            if (!confirm('Удалить героя «' + this.current.name + '»?')) return;
            this.data.list = this.data.list.filter((c) => c.id !== this.editing);
            if (!this.data.list.some((c) => c.id === this.data.active)) this.data.active = this.data.list[0].id;
            this.editing = this.data.active;
            this._changed();
        };
        this.root.querySelector('#ce-name').oninput = (e) => { this.current.name = e.target.value.slice(0, 20) || 'Герой'; save(this.data); this._renderHeroes(); };
    }

    _changed() {
        save(this.data);
        this._renderHeroes();
        this._renderOptions();
        this.hero.setLook(this.current.look);
        this.root.querySelector('#ce-name').value = this.current.name;
    }

    _renderHeroes() {
        const box = this.root.querySelector('#ce-heroes');
        box.innerHTML = this.data.list.map((c) => `
            <div class="ce-hero ${c.id === this.editing ? 'sel' : ''}" data-id="${c.id}">
                <span class="ce-star" title="Играть этим героем">${c.id === this.data.active ? '★' : '☆'}</span>
                <span class="ce-hname">${esc(c.name)}</span>
            </div>`).join('');
        for (const el of box.querySelectorAll('.ce-hero')) {
            el.onclick = (e) => {
                const id = el.dataset.id;
                if (e.target.classList.contains('ce-star')) this.data.active = id;
                this.editing = id;
                this._changed();
            };
        }
    }

    _renderOptions() {
        const L = this.current.look;
        const box = this.root.querySelector('#ce-options');
        const stepper = (key, label, names, count) => {
            const n = names ? names.length : count;
            const v = L[key] ?? 0;
            return `<div class="ce-row"><span class="ce-label">${label}</span>
                <button class="ce-arrow" data-k="${key}" data-d="-1" data-n="${n}">◀</button>
                <span class="ce-val">${names ? names[v] : (v + 1) + ' / ' + n}</span>
                <button class="ce-arrow" data-k="${key}" data-d="1" data-n="${n}">▶</button></div>`;
        };
        const color = (key, label) => `<label class="ce-color"><input type="color" data-c="${key}" value="${hex(L[key] ?? 0)}"> ${label}</label>`;
        box.innerHTML = `
            <h4 class="menu-h4">Лицо и волосы</h4>
            ${stepper('face', 'Лицо', null, FACE_COUNT)}
            <div class="ce-row"><span class="ce-label">Кожа</span>${SKIN_TONES.map((c) => `<button class="ce-skin ${c === L.skin ? 'sel' : ''}" data-skin="${c}" style="background:${hex(c)}"></button>`).join('')}</div>
            <div class="ce-colors">${color('eyes', 'Глаза')}${color('brows', 'Брови')}${color('hairColor', 'Волосы')}</div>
            ${stepper('hair', 'Причёска', HAIR_STYLES)}
            ${stepper('hat', 'Головной убор', HATS)}
            <div class="ce-colors">${color('hatColor', 'Цвет убора')}</div>
            <h4 class="menu-h4">Одежда</h4>
            ${stepper('top', 'Верх', TOPS)}
            ${stepper('bottom', 'Низ', BOTTOMS)}
            ${stepper('shoes', 'Обувь', SHOES)}
            <div class="ce-colors">${color('topColor', 'Верх')}${color('bottomColor', 'Низ')}${color('shoesColor', 'Обувь')}</div>`;
        for (const b of box.querySelectorAll('.ce-arrow')) {
            b.onclick = () => {
                const k = b.dataset.k, n = +b.dataset.n;
                L[k] = (((L[k] ?? 0) + +b.dataset.d) % n + n) % n;
                this._changed();
            };
        }
        for (const b of box.querySelectorAll('.ce-skin')) b.onclick = () => { L.skin = +b.dataset.skin; this._changed(); };
        for (const inp of box.querySelectorAll('input[type=color]')) {
            inp.oninput = () => { L[inp.dataset.c] = parseInt(inp.value.slice(1), 16); save(this.data); this.hero.setLook(L); };
        }
    }

    show() {
        if (!this._built) this._build();
        this._changed();
        if (this._raf) return;
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            // (turns only when the player drags it)
            this.hero.group.rotation.y = this.yaw;
            // the preview stops by itself when its tab is not on screen (a second 3D view costs FPS)
            if (!this.root.offsetParent) { this.hide(); return; }
            this.renderer.render(this.scene, this.camera);
        };
        loop();
    }

    hide() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
    }
}
