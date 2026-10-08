/**
 * ItemTypes.js — what can be found in chests (and what animals drop), their
 * properties and their 3D models. Pure data + THREE models, no game logic.
 *
 * Every item is a small plain object (it travels over the network and into
 * the save): {kind, uid, ...properties}.
 *
 * Magic items have their own advantages (rolled when found), revealed by the
 * wand spell «Раскрой свои секреты»:
 *   wand    — every wand: spells +15% stronger and −15% fatigue; a direction
 *             (duel / destruction / gathering / building: +25% there, building
 *             spends 40% less material); one favourite spell (+40%; for
 *             Protection — holds 40% longer); its own power 1–50% (combat).
 *   weapon  — a magic sword / axe glows a little, hits 1–60% harder and
 *             breaks an ordinary «Protection» it touches.
 *   shield  — wooden / iron / magic; a magic one has its own strength 20–50
 *             that comes back by itself; strong spells break weak shields.
 *   scroll  — burn it: +1–5 max health or +1–10 max strength, for good.
 *   backpack— put it on (hands behind the back): +3–5 slots.
 *   bow     — plain / fine / magic (1–60% stronger), comes with 10 arrows.
 *   hammer  — Thor's hammer: catches lightning in a storm (3 strikes).
 */

import * as THREE from 'three';

export const WAND_DIRS = {
    duel: { name: 'дуэльная', spells: ['Sapira', 'Stupefy', 'AvadaKedavra', 'Levitation'] },
    destroy: { name: 'разрушения', spells: ['Bombardo', 'BombardoMaxima', 'Inferno', 'Thunderwave', 'Earthquake', 'EarthquakeMaxima', 'LightningStrike', 'Sands', 'Ice'] },
    gather: { name: 'собирательства', spells: ['Gather', 'Accio', 'Wind', 'WindMaxima', 'Waterball', 'WaveAttack', 'WaveAttackMaxima'] },
    build: { name: 'строительства', spells: ['CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'WaterForming'] },
};
/** Spells a wand can favour; a Maxima form goes with its base spell. */
export const WAND_FAVOURITES = ['Inferno', 'Thunderwave', 'Sapira', 'Ice', 'Sands', 'Bombardo', 'Earthquake', 'Wind', 'Stupefy', 'AvadaKedavra', 'Levitation', 'Accio', 'Protection', 'LightningStrike', 'WaveAttack', 'Lumos', 'Gather', 'Brainrot'];
export const SPELL_RU = {
    Inferno: 'Инферно', Thunderwave: 'Тандервейв', Sapira: 'Сапира', Ice: 'Айс', Sands: 'Даст', Bombardo: 'Бомбардо', Earthquake: 'Earthquake',
    Wind: 'Вайнд', Stupefy: 'Остолбеней', AvadaKedavra: 'Авада Кедавра', Levitation: 'Вингардиум Левиоса', Accio: 'Акцио', Protection: 'Protection',
    LightningStrike: 'Lightning Strike', WaveAttack: 'Wave Attack', Lumos: 'Люмос', Gather: 'Gather', Brainrot: 'Брейнрот',
};
/** The base spell of a Maxima form (for favourites and directions). */
export const baseSpell = (name) => (name || '').replace(/Maxima$/, '');

export const ITEM_INFO = {
    wand: { name: 'Волшебная палочка', icon: '🪄', weight: 0.15 },
    scroll: { name: 'Свиток', icon: '📜', weight: 0.2 },
    shield: { name: 'Щит', icon: '🛡️', weight: 3 },
    backpack: { name: 'Рюкзак', icon: '🎒', weight: 1.5 },
    bow: { name: 'Лук', icon: '🏹', weight: 1 },
    hammer: { name: 'Молот Тора', icon: '🔨', weight: 4 },
    apple: { name: 'Золотое яблоко', icon: '🍏', weight: 0.2, stack: 10 },
    meat: { name: 'Сырое мясо', icon: '🥩', weight: 0.4, stack: 10 },
    steak: { name: 'Жареный стейк', icon: '🍖', weight: 0.4, stack: 10 },
    book: { name: 'Книга заклинаний', icon: '📖', weight: 0.6 },
};

const SHIELD_KINDS = [
    { name: 'Деревянный щит', color: 0x8b5a2b, rim: 0x5a3a1e },
    { name: 'Железный щит', color: 0x9aa3ad, rim: 0x5b6470 },
    { name: 'Щит рыцаря', color: 0x8e2b2b, rim: 0xd4af37 },
];
const BOW_KINDS = ['Простой лук', 'Охотничий лук', 'Длинный лук'];

let _uid = Math.floor(Math.random() * 1e6);
export const newUid = () => 'i' + (++_uid).toString(36) + Math.floor(Math.random() * 1296).toString(36);

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/** A random wand (unique colour and powers). */
export function rollWand(r = Math.random) {
    const dirs = Object.keys(WAND_DIRS);
    return {
        kind: 'wand', uid: newUid(),
        model: randInt(r, 0, 9),
        color: Math.floor(r() * 0xffffff),
        dir: r() < 0.8 ? pick(r, dirs) : null,
        fav: pick(r, WAND_FAVOURITES),
        power: randInt(r, 1, 50),
    };
}

export function rollLoot(r = Math.random, { cave = true } = {}) {
    const out = [];
    const n = randInt(r, 1, cave ? 3 : 2);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < 0.22) out.push(rollWand(r));
        else if (x < 0.42) out.push(r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) });
        else if (x < 0.55) out.push({ kind: 'weapon', type: r() < 0.5 ? 'sword' : 'axe', magic: r() < 0.6, bonus: randInt(r, 1, 60), uid: newUid() });
        else if (x < 0.67) {
            const t = randInt(r, 0, 2);
            const magic = r() < 0.45;
            out.push({ kind: 'shield', uid: newUid(), type: t, magic, max: magic ? randInt(r, 20, 50) : 0 });
        } else if (x < 0.77) out.push({ kind: 'backpack', uid: newUid(), slots: randInt(r, 3, 5), color: Math.floor(r() * 0xffffff) });
        else if (x < 0.88) out.push({ kind: 'bow', uid: newUid(), type: randInt(r, 0, 2), magic: r() < 0.4, bonus: randInt(r, 1, 60), arrows: 10 });
        else if (x < 0.92) out.push({ kind: 'hammer', uid: newUid(), charges: 0 });
        else out.push({ kind: 'apple', uid: newUid(), count: randInt(r, 1, 3) });
    }
    return out;
}

/** «Раскрой свои секреты»: what the hologram says about an item. */
export function describeItem(it) {
    if (!it) return null;
    switch (it.kind) {
        case 'wand': {
            const lines = ['Все заклинания на <b>15%</b> сильнее и на <b>15%</b> меньше усталости'];
            if (it.dir) lines.push(`Направление: <b>${WAND_DIRS[it.dir].name}</b> (+25%${it.dir === 'build' ? ', ресурсов на 40% меньше' : ''})`);
            else lines.push('Направление: нет');
            const fav = SPELL_RU[it.fav] || it.fav;
            lines.push(it.fav === 'Protection' ? `Особое заклинание: <b>${fav}</b> — держится на 40% дольше` : `Особое заклинание: <b>${fav}</b> (+40%${['Bombardo', 'Earthquake', 'Wind', 'WaveAttack', 'Protection'].includes(it.fav) ? ', и его Максима' : ''})`);
            lines.push(`Сила палочки: <b>+${it.power}%</b> в бою`);
            return { title: '🪄 Волшебная палочка', color: it.color, lines };
        }
        case 'weapon':
            return it.magic
                ? { title: `✨ Волшебный ${it.type === 'axe' ? 'топор' : 'меч'}`, color: 0x9fd8ff, lines: [`Урон больше на <b>${it.bonus}%</b>`, 'Разбивает обычный «Protection», которого коснётся'] }
                : { title: it.type === 'axe' ? '🪓 Топор' : '🗡️ Меч', color: 0xaaaaaa, lines: ['Обычный, не волшебный'] };
        case 'shield':
            return { title: '🛡️ ' + SHIELD_KINDS[it.type || 0].name + (it.magic ? ' (волшебный)' : ''), color: it.magic ? 0x9fd8ff : 0xaaaaaa, lines: it.magic ? [`Своя сила: <b>${it.max}</b> (восстанавливается)`, 'Держит заклинания и удары; слабый — сильное заклинание его разобьёт'] : ['Держит удары и слабые заклинания', 'Сильное заклинание его разобьёт'] };
        case 'scroll':
            return { title: '📜 Свиток', color: 0xffe9a8, lines: [it.stat === 'hp' ? `Сожгите его: здоровье +<b>${it.amount}</b> навсегда` : `Сожгите его: сила (усталость) +<b>${it.amount}</b> навсегда`] };
        case 'backpack':
            return { title: '🎒 Рюкзак', color: it.color, lines: [`+<b>${it.slots}</b> ячейки, если надеть (руки за спину)`] };
        case 'bow':
            return { title: '🏹 ' + BOW_KINDS[it.type || 0] + (it.magic ? ' (волшебный)' : ''), color: it.magic ? 0x9fd8ff : 0xaaaaaa, lines: [it.magic ? `Стрелы бьют сильнее на <b>${it.bonus}%</b>` : 'Обычный лук', `Стрел: <b>${it.arrows ?? 0}</b> (до 25)`] };
        case 'hammer':
            return { title: '🔨 Молот Тора', color: 0xbfe3ff, lines: ['В грозу поднимите его вверх — в него ударит молния', 'Наведите на цель: молния бьёт туда (до 3 раз)', `Заряды: <b>${it.charges || 0}</b>`] };
        case 'apple': return { title: '🍏 Золотое яблоко', color: 0xffd700, lines: ['Поднесите ко рту: +10 HP', 'Коня можно приручить яблоком'] };
        case 'meat': return { title: '🥩 Сырое мясо', color: 0xd9534f, lines: ['Поднесите ко рту: +2 HP', 'Пожарьте «Инферно» — будет +4'] };
        case 'steak': return { title: '🍖 Стейк', color: 0xb5651d, lines: ['Поднесите ко рту: +4 HP'] };
        default: return { title: ITEM_INFO[it.kind]?.name || 'Предмет', color: 0xaaaaaa, lines: ['Не волшебный'] };
    }
}

// ================================================================== models
const _mat = new Map();
function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!_mat.has(key)) {
        const m = opts.standard ? new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.4, metalness: opts.metal ?? 0.6, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1 }) : new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? 0x000000 });
        m.userData.shared = true;
        _mat.set(key, m);
    }
    return _mat.get(key);
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
const cyl = (r1, r2, h, m, x = 0, y = 0, z = 0, seg = 8) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); c.position.set(x, y, z); return c; };

/**
 * Ten wand designs (the colour is each wand's own): along +Y, the tip at y≈0.62.
 */
function wandModel(it) {
    const g = new THREE.Group();
    const col = new THREE.Color(it.color ?? 0x8b5a2b);
    const wood = mat(col.clone().multiplyScalar(0.55).getHex());
    const light = mat(col.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex());
    const gold = mat(0xd4af37, { standard: true, metal: 0.9, rough: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.5) });
    const m = it.model ?? 0;
    // handle
    g.add(cyl(0.035, 0.04, 0.2, wood, 0, 0.1));
    if (m % 3 === 0) g.add(cyl(0.045, 0.045, 0.03, gold, 0, 0.21));
    if (m === 1 || m === 6) { g.add(cyl(0.046, 0.046, 0.025, light, 0, 0.05)); g.add(cyl(0.046, 0.046, 0.025, light, 0, 0.15)); }
    // shaft
    const shaft = cyl(0.016, 0.03, 0.42, m === 4 ? light : wood, 0, 0.41);
    g.add(shaft);
    if (m === 2 || m === 7) for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 8), gold); k.rotation.x = Math.PI / 2; k.position.y = 0.26 + i * 0.06; g.add(k); }
    if (m === 3 || m === 8) for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), wood)).position.set(0, 0.3 + i * 0.11, 0);
    if (m === 5) { const spiral = new THREE.Mesh(new THREE.TorusKnotGeometry(0.03, 0.006, 40, 4, 1, 8), light); spiral.scale.set(1, 6, 1); spiral.position.y = 0.4; g.add(spiral); }
    // tip
    if (m === 4 || m === 9) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), glow); c.position.y = 0.64; g.add(c); }
    else if (m === 6) { const f1 = cyl(0.008, 0.012, 0.08, wood, 0.02, 0.65); f1.rotation.z = -0.4; const f2 = f1.clone(); f2.position.x = -0.02; f2.rotation.z = 0.4; g.add(f1, f2); }
    else g.add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), glow)).position.set(0, 0.625, 0);
    g.userData.tipY = 0.65;
    return g;
}

function scrollModel() {
    const g = new THREE.Group();
    const paper = mat(0xf3e2b3);
    const r = cyl(0.06, 0.06, 0.36, paper);
    r.rotation.z = Math.PI / 2;
    g.add(r);
    const ribbon = cyl(0.064, 0.064, 0.05, mat(0x8e2b2b));
    ribbon.rotation.z = Math.PI / 2;
    g.add(ribbon);
    for (const s of [-1, 1]) { const e = cyl(0.03, 0.03, 0.06, mat(0x5a3a1e), s * 0.21, 0); e.rotation.z = Math.PI / 2; g.add(e); }
    return g;
}

function shieldModel(it) {
    const g = new THREE.Group();
    const k = SHIELD_KINDS[it.type || 0];
    const face = it.type === 0 ? cyl(0.42, 0.42, 0.06, mat(k.color), 0, 0, 0, 16) : box(0.7, 0.85, 0.06, mat(k.color));
    if (it.type === 0) face.rotation.x = Math.PI / 2;
    g.add(face);
    const rim = it.type === 0 ? new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 20), mat(k.rim)) : box(0.74, 0.06, 0.08, mat(k.rim), 0, 0.42);
    g.add(rim);
    if (it.type !== 0) { g.add(box(0.74, 0.06, 0.08, mat(k.rim), 0, -0.42)); g.add(box(0.06, 0.9, 0.08, mat(k.rim), 0.36, 0)); g.add(box(0.06, 0.9, 0.08, mat(k.rim), -0.36, 0)); }
    if (it.type === 2) { g.add(box(0.08, 0.6, 0.07, mat(0xd4af37), 0, 0, 0.01)); g.add(box(0.45, 0.08, 0.07, mat(0xd4af37), 0, 0.1, 0.01)); }
    if (it.type === 0) for (let i = -1; i <= 1; i++) g.add(box(0.02, 0.8, 0.07, mat(0x5a3a1e), i * 0.2, 0, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(k.rim))).position.z = 0.04;
    if (it.magic) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }));
        g.add(halo);
        g.userData.halo = halo;
    }
    return g;
}

function backpackModel(it) {
    const g = new THREE.Group();
    const c = mat(it.color ?? 0x7a4a24);
    const dark = mat(new THREE.Color(it.color ?? 0x7a4a24).multiplyScalar(0.6).getHex());
    g.add(box(0.7, 0.85, 0.35, c));
    g.add(box(0.72, 0.25, 0.37, dark, 0, 0.32, 0.01));
    g.add(box(0.5, 0.3, 0.12, dark, 0, -0.15, 0.22));
    g.add(box(0.08, 0.08, 0.05, mat(0xd4af37), 0, 0.22, 0.2));
    return g;
}

function bowModel(it) {
    const g = new THREE.Group();
    const wood = mat(it.magic ? 0x6b3f8e : [0x8b5a2b, 0x5a3a1e, 0x7a4a24][it.type || 0]);
    const n = 9, R = it.type === 2 ? 0.75 : 0.6;
    for (let i = 0; i < n; i++) {
        const a = -0.9 + (1.8 * i) / (n - 1);
        const seg = box(0.05, (R * 1.9) / n + 0.02, 0.05, wood, Math.cos(a) * R * 0.35 - R * 0.35, Math.sin(a) * R, 0);
        seg.rotation.z = a;
        g.add(seg);
    }
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2 * Math.sin(0.9) * R, 4), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
    string.position.x = Math.cos(0.9) * R * 0.35 - R * 0.35;
    g.add(string);
    g.userData.string = string;
    if (it.magic) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc39bff }))).position.set(-0.02, 0, 0);
    return g;
}

export function arrowModel() {
    const g = new THREE.Group();
    g.add(cyl(0.012, 0.012, 0.8, mat(0x8b5a2b), 0, 0));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat(0x9aa3ad, { standard: true }));
    tip.position.y = 0.44;
    g.add(tip);
    for (let i = 0; i < 3; i++) { const f = box(0.004, 0.12, 0.05, mat(0xf2f2f2), 0, -0.34); f.rotation.y = (i * Math.PI * 2) / 3; g.add(f); }
    return g;
}

function hammerModel() {
    const g = new THREE.Group();
    g.add(cyl(0.035, 0.035, 0.45, mat(0x5a3a1e), 0, 0.22));
    g.add(box(0.36, 0.22, 0.22, mat(0xb8c2cc, { standard: true, metal: 0.95, rough: 0.25 }), 0, 0.5));
    g.add(cyl(0.04, 0.04, 0.05, mat(0xd4af37, { standard: true }), 0, 0.02));
    return g;
}

function appleModel() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffd700, { standard: true, metal: 0.7, rough: 0.3, emissive: 0x332200 })));
    g.add(cyl(0.008, 0.008, 0.06, mat(0x5a3a1e), 0, 0.12));
    const leaf = box(0.06, 0.01, 0.03, mat(0x2e8b2e), 0.03, 0.13);
    g.add(leaf);
    return g;
}

function meatModel(cooked) {
    const g = new THREE.Group();
    g.add(box(0.26, 0.1, 0.18, mat(cooked ? 0x8b4513 : 0xd9534f)));
    g.add(box(0.2, 0.02, 0.14, mat(cooked ? 0x5a2d0c : 0xf2b8b5), 0, 0.055));
    g.add(cyl(0.025, 0.025, 0.14, mat(0xf2efe6), 0.17, 0)).rotation.z = Math.PI / 2;
    return g;
}

export function makeItemModel(it) {
    switch (it.kind) {
        case 'wand': return wandModel(it);
        case 'scroll': return scrollModel(it);
        case 'shield': return shieldModel(it);
        case 'backpack': return backpackModel(it);
        case 'bow': return bowModel(it);
        case 'hammer': return hammerModel(it);
        case 'apple': return appleModel(it);
        case 'meat': return meatModel(false);
        case 'steak': return meatModel(true);
        default: { const g = new THREE.Group(); g.add(box(0.3, 0.3, 0.3, mat(0xaaaaaa))); return g; }
    }
}

export function disposeModel(m) {
    m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!o.material.userData.shared) o.material.dispose?.(); } });
}
