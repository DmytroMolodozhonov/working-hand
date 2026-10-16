/**
 * PlanetMagic.js — the four spells of the gods' scrolls (the library of the Gods' temple on Venus):
 * «Create a Planet», «Enlarge Planet», «Terraform Planet», «Wingardium Leviosa Super Maxima».
 * Outside Creative each is known only from its burnt scroll (Game.knowsSpell, ItemTypes.SCROLL_SPELL_COLOR);
 * in Creative all of them at once and free (no mana rules there).
 *
 *   «Create a Planet» (500 mana; instant, its making goes on by itself ~10 s): only in space — the raised hand
 *     (the wand) pointed at a meteor cluster (скопление метеоритов: Planets.clusters, the asteroid belt and the
 *     Kuiper belt). The rocks are drawn in to one point, crash, go red-hot, stick into a ball, it cools: a new
 *     planet on the cluster's own orbit round the Sun, where the cluster was. «Планета <ник>» (2, 3… for the next
 *     ones). Lifeless: bare rock and dust, no air at all (breathe by magic there), small gravity (by its size:
 *     ~0.2) — easy to fly off (no air: no fire on the way in or out). The cluster is gone for good: there are only
 *     so many (8 in the asteroid belt, 5 in the Kuiper belt) — they never come back.
 *   «Enlarge Planet» (100; instant, grows ~3 s): the hand at a planet (from space) — or standing on it. +30 % of
 *     its radius and of its gravity (the same rock, more of it: the pull grows with the radius). At most three
 *     times a planet (×2.2). The land on its surface stays as it is (its voxel surface is the same — what players
 *     built there stands); the ball in space, its pull and the way down to it grow. Gas giants: yes (no ground
 *     to break). Not: the Sun, the Earth (everybody's home: the gods do not allow it), Venus (the gods' temple:
 *     the whole planet is under their protection).
 *   «Terraform Planet» (1000; instant, the planet changes over ~8 s, its land remade a few chunks a frame): the
 *     hand at a planet from space, or standing on it. By its distance from the Sun (Planets.climateAt):
 *       too close (inside ~21 km: Mercury) — it does not work, the air boils off (no mana taken);
 *       hot (~21–25 km) — a hot desert: air, orange sand, baked rock, rare violet «cacti» with a flower;
 *       green (Venus' orbit out to just past Mars, ~25–47 km) — air, seas and lakes, its own moss / grass (teal,
 *         rust or blue — by the planet), its own trees (wide «umbrellas», thin «spires») in violet, cyan or gold;
 *       cold (~47–150 km: the asteroid belt, Jupiter) — an ice world: air, the lakes frozen solid, snow-blue moss,
 *         glassy frost-spike trees;
 *       too far (past ~150 km: Saturn, Pluto…) — it does not work (the air would freeze and fall as snow) —
 *         move it closer first («Wingardium Leviosa Super Maxima»).
 *     Then it has air: an atmosphere seen from space, its own sky and clouds, breathing without mana, fire on the
 *     way in, the climb out as from the Earth. No animals (nobody lives there yet). Not: the Sun, the gas giants
 *     (no ground), the Earth (it lives already), Venus (the gods), a planet terraformed already.
 *   «Wingardium Leviosa Super Maxima» (100 at once, then 3 a second while held — CONCENTRATION: nothing else is
 *     cast meanwhile; «стоп» / no mana lets go): only in space, the hand at a planet — it is held where it is and
 *     follows the hand's line at the distance it was taken at, slowly (as a house in «Левиоса Максима»: heavy —
 *     FOLLOW, at most MOVE_V m/s); fly with it to take it far. Let go: it stays on a new circular orbit through
 *     where it is (its radius: the new distance from the Sun — a new zone for «Terraform Planet»). It never goes
 *     into the Sun (it stops SUN_GAP short of it) or through another planet (it stops at its edge). Not: the Sun,
 *     the Earth (its orbit is everybody's), the Moon (it goes round the Earth), Venus (the gods).
 *   +100 mana cells: the first time each of the four really works (Mana.success → GOD_SPELLS) — added to the
 *     maximum like an achievement, with its own banner. Death takes them with all the rest (they lie in the body —
 *     Legacy.js, through the mana's growth and its list of firsts): «Give Me My Power» gives them back; after a
 *     death without that they can be earned again. In Creative: nothing (mana does not count there).
 *
 * На кого и на что (CLAUDE.md) — PLANET_TARGETS below: only celestial bodies and meteor clusters. Creatures,
 * players, things, ships, buildings, the world's blocks: not touched (not even pointed at — these spells look
 * only in space for a planet / a cluster). Nobody is pushed (Impact: null); no danger to the castles' people
 * (it all happens in space, far from them); the gods' gifts: Venus whole.
 *
 * Network: the host decides the planets (Space.create / Space.change → PlanetRegistry, saved with the world);
 * everybody sees the same birth / growth / new air (their times are in the registry: the shared clock); the
 * planet being dragged goes to everybody a few times a second (Space.onNet 'move'), its end as an update.
 * Each computer counts its own player's mana.
 */
import * as THREE from 'three';
import { planetPosition, climateAt, terraformPatch, orbitThrough, realmAt, SPACE } from '../world/Planets.js';
import { steadyDir } from './AimHold.js';

export const PMAGIC = {
    COST: { CreatePlanet: 500, EnlargePlanet: 100, TerraformPlanet: 1000, LevitationSuperMaxima: 100 },
    GIFT: 100, // mana cells, the first time each works
    DRAIN: 3, // mana a second while a planet is held
    REACH: 80000, // m: a planet the hand can reach from space
    CLUSTER_REACH: 30000, // m: a meteor cluster
    CONE: 0.07, // rad beyond the body's own size on the sky
    GROW: 1.3, MAX_GROWS: 3,
    MOVE_V: 1600, // m/s at most: a planet is heavy
    FOLLOW: 0.7, // 1/s: how fast it closes on where the hand points
    SUN_GAP: 4000, // m: never nearer the Sun's surface than this
    GAP: 300, // m between two planets' surfaces at least
    NET_DT: 0.2, // s: the move goes to the others this often
    NAME_T: 60, // s after «Create a Planet»: «Назови …» names it
    CLEAR_R: 7, // m round a player standing on a planet being terraformed: no tree grows there
};

/** «Назови Аврора», «назови её Новая Земля», «Name it Aurora» → the name (or null: not a naming). */
export function planetNameWords(text) {
    const s = String(text || '').trim().replace(/[.!?,;:«»"]+/g, ' ').replace(/\s+/g, ' ').trim();
    const m = /^(?:назови(?:те)?|назову|назовём|назовем|name it|call it|name her|call her)\s+(.+)$/i.exec(s);
    if (!m) return null;
    let n = m[1].replace(/^(?:её|ее|eё|планету|планетку|эту планету|как|it)\s+/i, '').replace(/^(?:её|ее|планету|как)\s+/i, '').trim();
    if (!n || n.length > 30) return null;
    n = n.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return n.slice(0, 24) || null;
}

/** The four spells (Mana: +100 cells the first time — GOD_SPELLS). */
export const PLANET_SPELLS = ['CreatePlanet', 'EnlargePlanet', 'TerraformPlanet', 'LevitationSuperMaxima'];

/**
 * Who / what × how (CLAUDE.md). Each spell: what it works on, and «не действует» with why.
 */
export const PLANET_TARGETS = {
    cluster: { CreatePlanet: 'a new planet of its rocks (the cluster is gone)', other: 'не действует: это не планета' },
    rocky: { EnlargePlanet: '+30 % radius and gravity (max 3 times)', TerraformPlanet: 'air, its own life — by its distance from the Sun', LevitationSuperMaxima: 'moved to a new orbit' },
    created: { EnlargePlanet: 'yes', TerraformPlanet: 'yes', LevitationSuperMaxima: 'yes' },
    moon: { EnlargePlanet: 'yes', TerraformPlanet: 'yes (the Earth\'s distance: the green zone)', LevitationSuperMaxima: 'не действует: Луна идёт вокруг Земли — её орбита держится за Землю' },
    gas: { EnlargePlanet: 'yes (no ground to break)', TerraformPlanet: 'не действует: у газового гиганта нет земли', LevitationSuperMaxima: 'yes' },
    earth: { all: 'не действует: Земля — дом всех, боги не дают её менять' },
    venus: { all: 'не действует: Венера под защитой богов (их храм — дар богов)' },
    sun: { all: 'не действует: Солнце не планета, к нему не подступиться' },
    creatures: { all: 'не действует: заклинания богов ищут только планеты и метеориты в космосе (players, villagers, animals, zombies, dragons, the Ice Queen, sailors… are never targets)' },
    things: { all: 'не действует: вещи, книги, сундуки, корабли, дома, блоки мира — не цели (only celestial bodies)' },
};

/** Why `name` does not work on `def` (or null). */
export function planetRefusal(name, def) {
    if (!def) return null;
    if (def.kind === 'star') return '☀️ Солнце — не планета: к нему и не подступиться';
    if (def.id === 'earth') return name === 'TerraformPlanet' ? '🌍 Земля и так живая — её незачем терраформировать' : '🌍 Землю боги трогать не дают — это дом всех';
    if (def.id === 'venus') return '🏛️ Венера под защитой богов: на ней их храм — золотая защита не пускает это заклинание';
    if (name === 'TerraformPlanet' && def.kind === 'gas') return `🌪️ «${def.name}» — планета-гигант: своя земля из твёрдых облаков и воздух на ней уже есть — терраформировать нечего`;
    if (name === 'TerraformPlanet' && def.terraformed) return `🌱 «${def.name}» уже терраформирована`;
    if (name === 'LevitationSuperMaxima' && def.parent) return `🌙 ${def.name} идёт вокруг ${def.parent === 'earth' ? 'Земли' : 'своей планеты'} — её отдельно не сдвинуть`;
    if (name === 'EnlargePlanet' && (def.grown | 0) >= PMAGIC.MAX_GROWS) return `🪐 «${def.name}» больше не растёт: она уже увеличена ${PMAGIC.MAX_GROWS} раза`;
    return null;
}

/** The new planet's look from the cluster's belt (its colours, its relief). */
export function planetFromCluster(c, name, t, by) {
    const kuiper = c.belt === 'kuiper';
    const radius = Math.round(150 + (c.count || 50) * 2.2);
    return {
        name, kind: 'rocky', a: c.a, phase: c.phase, period: c.period, incl: c.incl || 0, node: c.node || 0,
        radius, gravity: Math.round((0.25 * radius) / 300 * 100) / 100, air: 'none', sky: 'vacuum', look: 'rock',
        color: kuiper ? 0xa8b0b8 : 0x8a7a6a, tilt: 8 + ((c.count * 7) % 20), day: 1500 + ((c.count * 37) % 1200),
        ground: kuiper ? { dust: 0x9aa4ac, rock: 0x6c7480, dark: 0x4a5058, ice: 0xe6eef4, craters: 1.2, hills: 0.7, maria: 0.4 }
            : { dust: 0x8a7a68, rock: 0x6a5c50, dark: 0x4a4038, ice: 0xd8d2c8, craters: 1.3, hills: 0.8, scarps: 0.4 },
        cluster: c.id, born: t, created: by || true,
    };
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _v = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 };

export class PlanetMagic {
    constructor(game) {
        this.game = game;
        this.hold = null; // {id, side, D, steady, net} — the planet I hold («Super Maxima»)
        this._said = new Map();
        this.log = []; // (tests) what happened
    }

    get space() { return this.game.space; }
    /** Concentration (Concentration.held): a planet held. */
    get busy() { return !!this.hold; }

    /** Game._castLocalSpell: one of the four. Returns the name when it works, else null (with a hint). */
    cast(name, isFinal = true) {
        if (!isFinal) return null; // (the gods' words: only the whole phrase)
        const g = this.game, S = this.space;
        const say = (t) => { g.hud?.setVoice?.(t, true); return null; };
        if (!S?.enabled) return say('🚫 На картах космоса нет — заклинания планет здесь не работают');
        if (name === 'LevitationSuperMaxima' && this.hold) return null; // (the same words again while holding: still held)
        const ch = g.character;
        const side = g.wandSide?.() || [g.dom, g.off].find((s) => ch.isArmRaised(s));
        const onPlanet = S.realm !== 'space' && S.realm !== 'earth';
        if (!side || !ch.isArmRaised(side)) {
            if (!(onPlanet && (name === 'EnlargePlanet' || name === 'TerraformPlanet'))) return say(`✋ Поднимите руку (или палочку) и направьте её ${name === 'CreatePlanet' ? 'на скопление метеоритов' : 'на планету'}`);
        }
        if (name === 'CreatePlanet') return this._create(side);
        if (name === 'EnlargePlanet') return this._enlarge(side);
        if (name === 'TerraformPlanet') return this._terraform(side);
        if (name === 'LevitationSuperMaxima') return this._grab(side);
        return null;
    }

    // ---------------------------------------------------------------- aiming in space
    /** The hand's line in space (heliocentric): {o, d} or null (not in space). */
    _ray(side) {
        const g = this.game, S = this.space;
        if (S.realm !== 'space' || !side) return null;
        g.castOrigin(side, _o);
        g.character.getHandDirection(side, _d);
        if (_d.lengthSq() < 1e-6) return null;
        _d.normalize();
        const sp = this._toSpace(_o, _q);
        return { o: { x: sp.x, y: sp.y, z: sp.z }, d: { x: _d.x, y: _d.y, z: _d.z } };
    }

    /** A world position (in space) → heliocentric (Space: A + (P − O)). */
    _toSpace(w, out) {
        const S = this.space;
        out.x = S.O.x + (w.x - SPACE.ANCHOR_X); out.y = S.O.y + (w.y - SPACE.ORIGIN_Y); out.z = S.O.z + (w.z - SPACE.ANCHOR_Z);
        return out;
    }

    /** What the line points at among `items` ({pos, r}): the best by the angle off its edge, within reach. */
    _pick(ray, items, reach) {
        let best = null;
        for (const it of items) {
            const dx = it.pos.x - ray.o.x, dy = it.pos.y - ray.o.y, dz = it.pos.z - ray.o.z;
            const dist = Math.hypot(dx, dy, dz) || 1;
            if (dist - it.r > reach) continue;
            const cos = (dx * ray.d.x + dy * ray.d.y + dz * ray.d.z) / dist;
            const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
            const size = Math.asin(Math.min(1, it.r / dist));
            const off = ang - size;
            if (off > PMAGIC.CONE) continue;
            if (!best || off < best.off) best = { ...it, dist, off };
        }
        return best;
    }

    /** The planet the hand points at from space (or the one stood on). */
    _planetAimed(side, name) {
        const S = this.space, t = S.now();
        if (S.realm !== 'space' && S.realm !== 'earth') return { def: S.planets.get(S.realm), dist: 0 };
        const ray = this._ray(side);
        if (!ray) return null;
        const items = [];
        for (const def of S.planets.list) {
            const pos = planetPosition(def, t, { x: 0, y: 0, z: 0 }, S.planets);
            items.push({ def, pos, r: def.radius });
        }
        const hit = this._pick(ray, items, name === 'LevitationSuperMaxima' ? PMAGIC.REACH * 0.75 : PMAGIC.REACH);
        return hit ? { def: hit.def, dist: hit.dist, pos: hit.pos } : null;
    }

    _pay(name) {
        const g = this.game;
        const tired = g.combat?.check?.(name);
        if (tired) { g.hud?.setVoice?.(tired, true); return false; }
        g.combat?.pay?.(name);
        return true;
    }

    /** The first real use: +100 cells (Mana.success knows the four). */
    _worked(name) {
        this.game.noteCaster?.(name, this.game.localId);
        this.game.mana?.success?.(name);
        this.log.push({ ev: 'cast', name });
        if (this.log.length > 30) this.log.shift();
    }

    // ---------------------------------------------------------------- «Create a Planet»
    _create(side) {
        const g = this.game, S = this.space, t = S.now();
        if (S.realm !== 'space') return this._say(S.realm === 'earth' ? '🌌 «Create a Planet» — только в космосе: туда, где летят скопления метеоритов («Flying Maxima»)' : '🌌 «Create a Planet» — только в космосе, не на планете');
        const ray = this._ray(side);
        const free = S.planets.clusters.filter((c) => !c.used);
        const items = free.map((c) => ({ c, pos: planetPosition(c, t, { x: 0, y: 0, z: 0 }), r: c.r }));
        const hit = ray && this._pick(ray, items, PMAGIC.CLUSTER_REACH);
        if (!hit) {
            // (where the nearest cluster is: so the player knows where to fly)
            let near = null;
            for (const it of items) { const d = Math.hypot(it.pos.x - S.P.x, it.pos.y - S.P.y, it.pos.z - S.P.z); if (!near || d < near.d) near = { d, c: it.c }; }
            const where = near ? ` Ближайшее — ${near.c.belt === 'kuiper' ? 'в поясе Койпера' : 'в поясе астероидов'}, ${fmt(near.d)} отсюда.` : ' Свободных скоплений не осталось.';
            return this._say(`☄️ Рука должна смотреть на скопление метеоритов — без него планету не из чего создать.${where}`);
        }
        if (!this._pay('CreatePlanet')) return null;
        const c = hit.c;
        const def = planetFromCluster(c, this._newName(), t, this._me());
        S.create(def);
        this._beam(side, 0xff9a4a);
        g.sound?.playSpace?.('spaceRise', 0.8);
        this._say(`☄️ <b>Create a Planet!</b> Метеориты стягиваются в одну точку, сталкиваются, раскаляются… Рождается <b>«${def.name}»</b>. Хотите своё имя — скажите «Назови …» (например, «Назови Аврора»)`);
        this._naming = { cluster: c.id, until: performance.now() + PMAGIC.NAME_T * 1000 };
        this._later(10, () => { const p = this._myNew(); this._say(`🪐 Новая планета <b>«${p?.name || def.name}»</b>: камень и пыль, воздуха нет совсем (дышите магией), тяжесть ×${def.gravity} — взлетать с неё легко. Её видно на карте космоса`); });
        this._worked('CreatePlanet');
        return 'CreatePlanet';
    }

    /** The planet I made last (by its cluster: the same on the host and here). */
    _myNew() {
        const n = this._naming;
        return n ? this.space.planets.list.find((p) => p.cluster === n.cluster && !p.base) || null : null;
    }

    /**
     * After «Create a Planet» (NAME_T s): «Назови Аврора» / «Name it Aurora» gives it that name (Game._castLocalSpell
     * asks this first). True when the words were the naming (they are not a spell then).
     */
    tryName(text, isFinal = true) {
        const n = this._naming;
        if (!n) return false;
        if (performance.now() > n.until) { this._naming = null; return false; }
        const name = planetNameWords(text);
        if (!name) return false;
        if (!isFinal) return true; // (still being said: wait for the whole name)
        const p = this._myNew();
        if (!p) return true;
        let nm = name;
        const names = new Set(this.space.planets.list.filter((q) => q.id !== p.id).map((q) => q.name));
        for (let i = 2; names.has(nm); i++) nm = `${name} ${i}`;
        this.space.change(p.id, { name: nm });
        this._naming = null;
        this._say(`🪐 Теперь эту планету зовут <b>«${nm}»</b> — так её видят все, и на карте космоса тоже`);
        this.log.push({ ev: 'name', name: nm });
        return true;
    }

    _me() {
        const g = this.game;
        return g.net?.name || g.config?.name || g.config?.playerName || g.appearance?.name || 'Мага';
    }

    _newName() {
        const base = `Планета ${this._me()}`, names = new Set(this.space.planets.list.map((p) => p.name));
        if (!names.has(base)) return base;
        for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
    }

    // ---------------------------------------------------------------- «Enlarge Planet»
    _enlarge(side) {
        const S = this.space, t = S.now();
        const aim = this._planetAimed(side, 'EnlargePlanet');
        if (S.realm === 'earth') return this._say('🌌 «Enlarge Planet» — из космоса, рукой на планету (или стоя на ней)');
        if (!aim?.def) return this._say('🪐 Направьте руку на планету — она должна быть видна и не слишком далеко');
        const def = aim.def, no = planetRefusal('EnlargePlanet', def);
        if (no) return this._say(no);
        if (!this._pay('EnlargePlanet')) return null;
        const r0 = def.radius, g1 = Math.round((def.gravity || 0.2) * PMAGIC.GROW * 1000) / 1000, n = (def.grown | 0) + 1, name = def.name;
        const r = Math.round(r0 * PMAGIC.GROW);
        S.change(def.id, { radius: r, radiusFrom: r0, grownAt: t, grown: n, gravity: g1 });
        this._beam(side, 0xff6f3c);
        this._say(`🪐 <b>Enlarge Planet!</b> «${name}» растёт: радиус ${fmt(r0)} → ${fmt(r)}, тяжесть ×${Math.round(g1 * 100) / 100}${n >= PMAGIC.MAX_GROWS ? ' (больше она уже не вырастет)' : ''}`);
        this._worked('EnlargePlanet');
        return 'EnlargePlanet';
    }

    // ---------------------------------------------------------------- «Terraform Planet»
    _terraform(side) {
        const S = this.space, t = S.now();
        if (S.realm === 'earth') return this._say('🌍 Земля и так живая. «Terraform Planet» — для других планет: из космоса рукой на планету или стоя на ней');
        const aim = this._planetAimed(side, 'TerraformPlanet');
        if (!aim?.def) return this._say('🪐 Направьте руку на планету — она должна быть видна и не слишком далеко');
        const def = aim.def, no = planetRefusal('TerraformPlanet', def);
        if (no) return this._say(no);
        const a = def.parent ? S.planets.get(def.parent)?.a : def.a;
        const climate = climateAt(a);
        if (!climate) {
            return this._say(a < 21000 ? `☀️ «${def.name}» слишком близко к Солнцу — воздух сразу выкипит. Отодвиньте её дальше («Wingardium Leviosa Super Maxima»)`
                : `🧊 «${def.name}» слишком далеко от Солнца — оно её не греет, воздух замёрзнет и выпадет снегом. Подвиньте её ближе к Солнцу («Wingardium Leviosa Super Maxima») — за пояс астероидов, не дальше`);
        }
        if (!this._pay('TerraformPlanet')) return null;
        const patch = terraformPatch(def, climate);
        patch.terraAt = t;
        // (no tree grows up through anybody standing on it now: round each player there the ground stays open)
        const clear = this._standing(def);
        if (clear.length) patch.clear = clear;
        S.change(def.id, patch);
        this._beam(side, 0x1fae7a);
        this.game.sound?.playSpace?.('spaceGift', 0.8);
        const what = climate === 'green' ? 'зелёная зона: воздух, моря и озёра, своя трава и деревья'
            : climate === 'desert' ? 'близко к Солнцу — вышла жаркая пустыня: воздух есть, воды нет'
                : 'далеко от Солнца — вышел ледяной мир: воздух есть, вся вода — лёд';
        this._say(`🌱 <b>Terraform Planet!</b> «${def.name}» меняется: ${what} (${patch.terraLook}). Животных там нет`);
        this._later(8, () => this._say(`🌍 «${def.name}» терраформирована: дышать можно без маны, вход в её воздух — с огнём, взлёт — как с Земли`));
        this._worked('TerraformPlanet');
        return 'TerraformPlanet';
    }

    /** Where the players stand on this planet now (me and the others): [{x, z, r}] — no tree is grown there. */
    _standing(def) {
        const g = this.game, out = [];
        const add = (p) => { if (p && realmAt(p.x, p.y, p.z, this.space.planets) === def.id && out.length < 16) out.push({ x: Math.round(p.x), z: Math.round(p.z), r: PMAGIC.CLEAR_R }); };
        add(g.character?.group?.position);
        for (const r of g.remotes?.values?.() || []) add(r.position || r.group?.position);
        return out;
    }

    // ---------------------------------------------------------------- «Wingardium Leviosa Super Maxima»
    _grab(side) {
        const g = this.game, S = this.space;
        if (S.realm !== 'space') return this._say('🌌 «Wingardium Leviosa Super Maxima» двигает планеты — только в космосе, рукой на планету');
        const aim = this._planetAimed(side, 'LevitationSuperMaxima');
        if (!aim?.def) return this._say('🪐 Направьте руку на планету — она должна быть видна и не слишком далеко');
        const def = aim.def, no = planetRefusal('LevitationSuperMaxima', def);
        if (no) return this._say(no);
        if (!this._pay('LevitationSuperMaxima')) return null;
        const t = S.now();
        planetPosition(def, t, _p, S.planets);
        // (held from now: on a circle through where it is, its height kept — no jump)
        S.planets.live(def.id, { ...orbitThrough(_p.x, _p.z, t), lift: _p.y, liftT: null });
        this.hold = { id: def.id, side, D: Math.max(aim.dist, def.radius + 600), steady: {}, net: 0, t: 0, worked: false };
        S.noCarry = def.id;
        if (S.view) S.view.fx.hold = { id: def.id };
        this._beam(side, 0xf2e6ff);
        this._say(`🪐 <b>Wingardium Leviosa Super Maxima!</b> «${def.name}» в вашей власти: ведите рукой — она медленно идёт за ней. Летите — она за вами. «Стоп» — отпустить (3 маны в секунду)`);
        this.log.push({ ev: 'grab', id: def.id });
        return 'LevitationSuperMaxima';
    }

    /** Let go («стоп», no mana, death…): the planet stays on its new orbit. True if one was held. */
    stop(why = 'stop') {
        const h = this.hold;
        if (!h) return false;
        this.hold = null;
        const S = this.space, def = S.planets.get(h.id);
        if (S.noCarry === h.id) S.noCarry = null;
        if (S.view && S.view.fx.hold?.id === h.id) S.view.fx.hold = null;
        if (def) {
            const o = { a: def.a, phase: def.phase, period: def.period, incl: 0, ecc: 0, node: 0, lift: def.lift || 0, liftT: S.now() }; // (then it settles into the plane of the orbits: Planets.LIFT_SETTLE)
            this.game.sync?.net?.send?.({ t: 'planets', op: 'move', id: h.id, o, end: 1, relay: true });
            S.change(h.id, o);
            const cl = climateAt(def.parent ? null : def.a);
            const zone = cl === 'green' ? 'зелёная зона — тут терраформирование даст леса и моря' : cl === 'desert' ? 'жаркая зона — терраформирование даст пустыню' : cl === 'ice' ? 'холодная зона — терраформирование даст ледяной мир' : def.a < 21000 ? 'слишком близко к Солнцу для жизни' : 'слишком далеко от Солнца для жизни';
            if (why !== 'dead') this._say(`🪐 «${def.name}» отпущена: новая орбита — ${fmt(def.a)} от Солнца (${zone})${Math.abs(o.lift) > 50 ? '; она медленно опускается в плоскость орбит остальных планет' : ''}`);
            if (h.worked) this._worked('LevitationSuperMaxima');
        }
        this.log.push({ ev: 'release', id: h.id, why });
        return true;
    }

    /** Every frame (Game): the held planet follows the hand. */
    update(dt) {
        const h = this.hold;
        if (!h) return;
        const g = this.game, S = this.space;
        const def = S.planets.get(h.id);
        if (!def || S.realm !== 'space' || g.combat?.dead || g.isDeadLocal) { this.stop(def ? 'far' : 'gone'); return; }
        if (!g.combat?.drain?.(PMAGIC.DRAIN * dt, dt)) { this.stop('mana'); this._say('😮‍💨 Мана кончилась — планета отпущена'); return; }
        h.t += dt;
        // the hand's line (steadied: a trembling hand does not shake a planet)
        if (!g.duel?._handOf?.(g.localId, h.side, _hp, _hd)) return;
        steadyDir(h.steady, _hd, dt);
        this._toSpace(_hp, _q);
        const tx = _q.x + _hd.x * h.D, ty = _q.y + _hd.y * h.D, tz = _q.z + _hd.z * h.D;
        const t = S.now();
        planetPosition(def, t, _p, S.planets);
        let dx = tx - _p.x, dy = ty - _p.y, dz = tz - _p.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 0.5) {
            const step = Math.min(dist, Math.min(PMAGIC.MOVE_V, dist * PMAGIC.FOLLOW) * dt);
            dx *= step / dist; dy *= step / dist; dz *= step / dist;
            let nx = _p.x + dx, ny = _p.y + dy, nz = _p.z + dz;
            const r = this._keepClear(def, nx, ny, nz, t);
            if (r) { nx = r.x; ny = r.y; nz = r.z; }
            S.planets.live(def.id, { ...orbitThrough(nx, nz, t), lift: ny });
            if (Math.hypot(nx - _p.x, ny - _p.y, nz - _p.z) > 1) h.worked = true;
        }
        // (the pearl light along the hand, and the others told a few times a second)
        if (Math.random() < 0.5) this._beam(h.side, 0xf2e6ff, 1);
        h.net += dt;
        if (h.net >= PMAGIC.NET_DT && g.sync?.net?.active) {
            h.net = 0;
            g.sync.net.send({ t: 'planets', op: 'move', id: def.id, o: { a: def.a, phase: def.phase, period: def.period, incl: 0, ecc: 0, node: 0, lift: def.lift || 0, liftT: null }, relay: true });
        }
    }

    /**
     * Where the planet may be: never into the Sun (SUN_GAP short of its surface), never through another body
     * (it stops at its edge). Returns the corrected place, or null when (x, y, z) is fine.
     */
    _keepClear(def, x, y, z, t) {
        const S = this.space;
        let out = null;
        const minSun = SPACE.SUN_R + def.radius + PMAGIC.SUN_GAP, ds = Math.hypot(x, y, z) || 1;
        if (ds < minSun) { const k = minSun / ds; x *= k; y *= k; z *= k; out = true; }
        for (const b of S.planets.list) {
            if (b.id === def.id || b.kind === 'star') continue;
            planetPosition(b, t, _v, S.planets);
            const min = b.radius + def.radius + PMAGIC.GAP;
            let ex = x - _v.x, ey = y - _v.y, ez = z - _v.z;
            const d = Math.hypot(ex, ey, ez);
            if (d >= min) continue;
            if (d < 1e-3) { ex = _v.x; ey = 0; ez = _v.z; } // (right at its centre: out away from the Sun)
            const l = Math.hypot(ex, ey, ez) || 1;
            x = _v.x + (ex / l) * min; y = _v.y + (ey / l) * min; z = _v.z + (ez / l) * min; out = true;
        }
        return out ? { x, y, z } : null;
    }

    /** Another player's planet being moved (Space.onNet 'move'): its pearl light here too. */
    netHold(m) {
        const v = this.space?.view;
        if (!v || this.hold?.id === m.id) return;
        v.fx.hold = m.end ? null : { id: m.id };
    }

    // ---------------------------------------------------------------- the look, the words
    /** The spell's light from the hand along its line (the game's own scene: sparks). */
    _beam(side, color, n = 14) {
        const g = this.game;
        if (!side || !g.fx?.spark) return;
        g.castOrigin(side, _o);
        g.character.getHandDirection(side, _d);
        _d.normalize();
        for (let i = 0; i < n; i++) {
            const k = 0.5 + Math.random() * 14;
            _v.copy(_o).addScaledVector(_d, k);
            g.fx.spark(_v, color, 0.12 + Math.random() * 0.1, _hp.copy(_d).multiplyScalar(30 + Math.random() * 40), 0.6);
        }
    }

    _say(text) {
        this.game.hud?.setVoice?.(text, true);
        return null;
    }

    _later(s, fn) {
        if (typeof setTimeout !== 'undefined') setTimeout(() => { if (this.game.active !== false) fn(); }, s * 1000);
    }

    dispose() { this.hold = null; }
}

/** «12 км», «830 м». */
function fmt(m) {
    m = Math.max(0, m);
    return m >= 10000 ? `${Math.round(m / 1000)} км` : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(m)} м`;
}
