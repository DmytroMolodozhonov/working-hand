/**
 * SpellManager.js — voice spells.
 *
 * Same spells, words, damage and look as the original (Сапира, Тандервейв,
 * Инферно, Санд/Даст, Айс) plus the new «Бомбардо» — an explosive orb that
 * blows up blocks, trees, tables and zombies.
 *
 * Visuals use the pooled Effects (no per-spark meshes). Damage only happens
 * where `authoritative` is true (single player / multiplayer host); other
 * peers render the same spell for the eyes only.
 */

import * as THREE from 'three';
import { INFERNO, InfernoLook, infernoReach, infernoDrain, inStream, streamStop } from './InfernoStream.js';
import { thunderPush } from '../game/Impact.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Bombardo blast radius; «Бомбардо Максима» is MAXIMA_POWER times stronger. */
export const BOMBARDO_RADIUS = 3.6;
export const MAXIMA_POWER = 3;
/** Crater radius for a given power: 3× the energy → ~1.7× wider, ~5× more ground removed. */
export function bombardoRadius(power = 1) {
    return BOMBARDO_RADIUS * Math.sqrt(power);
}

/** Recognise a spell name in a voice transcript. Exported for tests. */
const RAY_SPELLS = new Set(['Sapira', 'Thunderwave', 'Wind', 'WindMaxima', 'Sands', 'Ice', 'Bombardo', 'BombardoMaxima']);

export function matchSpell(text) {
    const s = (text || '').toLowerCase().trim();
    if (!s) return null;
    const has = (...words) => words.some((w) => s.includes(w));
    // Beds (first: colour words like «синий» / «red» must not turn into other spells)
    if (has('цвет', 'color', 'colour', 'колор', 'калор', 'колар', 'покрас', 'перекрас', 'раскрас', 'чейндж', 'чендж', 'change')) return 'ChangeColor';
    if (has('кроват') || (has('bed', 'бед', 'бэд') && has('creat', 'крейт', 'криейт', 'криэйт', 'креит', 'созда', 'сдела', 'a bed', 'э бед', 'э бэд'))) return 'CreateBed';
    // Wand spells
    if (has('раскрой', 'раскрои', 'секрет', 'тайны', 'reveal', 'secret')) return 'Reveal';
    if (has('люмос', 'лумос', 'люмус', 'lumos', 'lumus', 'люмаз')) return has('макс', 'max', 'мах') ? 'LumosMaxima' : 'Lumos';
    if (has('нокс', 'nox', 'нокса', 'knox')) return 'Nox';
    if (has('латин', 'вратин', 'latin', 'vratin', 'братин', 'ратин')) return 'Draw';
    // «Water Vortex» («вотер вортекс»): before everything that shares its sounds (water ball, Maxima…)
    if (has('vortex', 'vortec', 'vortx', 'вортекс', 'вортэкс', 'вортикс', 'вортекз', 'вортес', 'вотекс', 'вортакс', 'водоворот', 'ворт экс')) return 'WaterVortex';
    // Shield first: «Protection Maxima» must not become Bombardo/water «максима»
    if (has('протекш', 'протэкш', 'протекш', 'протекц', 'protect', 'протект', 'щит')) return has('максим', 'maxim', 'макс', 'max') ? 'ProtectionMaxima' : 'Protection';
    // Building (before the short tokens of other spells)
    if (has('stand', 'стэнд', 'стенд', 'стоп', 'stop')) return 'Stand'; // («стоп» also stops every spell still going)
    // («Assemble» too: «Gather» is not always heard right)
    if (has('gather', 'гезер', 'гэзер', 'гатер', 'газер', 'гаазер', 'собери', 'собрать', 'assembl', 'ассембл', 'асембл', 'эссембл', 'эсембл', 'ассэмбл', 'асэмбл')) return 'Gather';
    if (has('floor', 'флор', 'флоор', 'флур')) return 'CreateFloor';
    if (has('ceiling', 'силинг', 'сейлинг', 'силин', 'эсилин', 'потол')) return 'CreateCeiling';
    if (has('roof', 'руф', 'крыш')) return 'BuildRoof';
    if (has('wall', 'уолл', 'уол', 'стену', 'стена')) return 'CreateWall';
    if (has('door', 'двер', ' дор', 'дорь')) return 'CreateDoor';
    // «To the Sun» (before «Даст»: «sun» is one of its words)
    if (has('to the sun', 'to the son', 'tothesun', 'ту зе сан', 'ту зэ сан', 'ту за сан', 'ту де сан', 'ту ze сан', 'тузесан', 'тузэсан', 'тузасан', 'к солнцу', 'солнц')) return 'ToTheSun';
    // New spell first: its words must never be mistaken for the short Sand/Ice tokens.
    if (has('бомбар', 'бомбор', 'бамбар', 'бонбар', 'помбар', 'бомбард', 'bombar', 'bombor', 'bambar', 'бомба', 'bomb')) {
        // «Бомбардо Максима»: the same word plus «максима»
        return has('макс', 'max', 'мэкс', 'мекс', 'maks', 'мах') ? 'BombardoMaxima' : 'Bombardo';
    }
    if (has('лайтнинг', 'лайтинг', 'лайтнин', 'лайтин', 'lightning', 'lightnin', 'lighting', 'страйк', 'strike', 'лайт нинг')) return 'LightningStrike';
    // Duel magic
    if (has('авада', 'кедавр', 'кидавр', 'avada', 'kedavr', 'kadavr', 'водокидавр', 'адакедавр')) return 'AvadaKedavra';
    // «Alive»: a tree comes alive (its sounds before the short Ice / Sands / Flight tokens)
    if (has('alive', 'a live', 'alife', 'алайв', 'алаив', 'алайф', 'элайв', 'элаив', 'элайф', 'эллайв', 'аллайв', 'олайв', 'алив', 'элив', 'алайве', 'оживи', 'оживай', 'оживл')) return 'Alive';
    if (has('остолбен', 'остолбин', 'столбен', 'ступеф', 'stupef', 'stupif', 'ступиф')) return 'Stupefy';
    if (has('вингард', 'вингард', 'wingard', 'левиос', 'левиоз', 'leviosa', 'leviose', 'левиоc', 'вин гард')) return 'Levitation';
    if (has('паузин', 'паузен', 'паузи', 'пауза', 'паузу', 'pausin', 'pauzin', 'pause', 'повзин')) return 'Pause';
    // Water: «Air Bubble», «Wave Attack» (before Thunderwave/Wind: they share sounds)
    const maxW = () => has('макс', 'max', 'мах');
    // («Bubble» as the Russian recognizer hears it: «бабал», «бобл», «бубл», «пабл»…)
    if (has('bubble', 'bubbl', 'buble', 'bobble', 'babble', 'бабл', 'баббл', 'бабол', 'бабал', 'бабел', 'бабэл', 'бабыл', 'бобл', 'боббл', 'бубл', 'пабл', 'паббл', 'баблы', 'пузыр', 'эйр баб', 'air bub')) return maxW() ? 'AirBubbleMaxima' : 'AirBubble';
    if ((has('wave', 'вейв', 'вэйв', 'уэйв', 'волн') && has('attack', 'атак', 'аттак', 'атт', 'атэк', 'эттак', 'атак')) || has('waveattack', 'вейватак')) return maxW() ? 'WaveAttackMaxima' : 'WaveAttack';
    if (has('breakthrough', 'брейкфру', 'брейкср', 'брэйкфру', 'брейк сру', 'брейк фру', 'брейксру', 'break through', 'прорыв')) return has('макс', 'max', 'мах') ? 'BreakthroughMaxima' : 'Breakthrough';
    if (has('рескью', 'рескю', 'рэскью', 'rescue', 'рескьу', 'спасен', 'спаси')) return 'Rescue';
    if (has('атак', 'attack', 'аттак', 'атэк', 'этак', 'атака', 'в атаку')) return 'Attack';
    if (has('earthquake', 'earth quake', 'earthcake', 'эрсквейк', 'эртквейк', 'ерсквейк', 'эрскейк', 'эрткейк', 'эрс квейк', 'квейк', 'quake', 'землетряс', 'эрскейп', 'escape', 'эскейп', 'искейп', 'ескейп', 'скейп', 'эскейт', 'skype', 'скайп')) return has('макс', 'max', 'мах') ? 'EarthquakeMaxima' : 'Earthquake';
    if (has('брейнрот', 'брейн рот', 'брейнрод', 'брэйнрот', 'brainrot', 'brain rot', 'брейн', 'брэйн', 'brain')) return 'Brainrot';
    if (has('вайнд', 'винд', 'вайн', 'уинд', 'wind', 'ветер', 'ветр', 'ваинд')) return has('макс', 'max', 'мах') ? 'WindMaxima' : 'Wind';
    if (has('акцио', 'акцыо', 'акцие', 'акция', 'акций', 'аксио', 'акчо', 'акио', 'accio', 'acio', 'akcio', 'aksio', 'axio', 'эксио')) return 'Accio';
    // «Fire Maxima» (before the lone «Максима» and the campfire «Fire»)
    if (has('fire', 'файр', 'фаер', 'фаир', 'фаэр', 'файер') && has('макс', 'max', 'мах', 'maks')) return 'FireMaxima';
    // Water bending (before Ice/Sands: their short tokens would catch these words)
    const water = has('вотер', 'ватер', 'уотер', 'water', 'вотр', 'водян', 'вода', 'воду', 'уатер', 'watter', 'woter');
    if (has('форминг', 'forming', 'формин') || (water && has('форм', 'form'))) return 'WaterForming';
    if (water && has('бол', 'бал', 'ball', 'bowl', 'bol', 'шар', 'буль', 'бул')) return 'Waterball';
    if (has('фрозен', 'фроузен', 'фрозэн', 'фризен', 'frozen', 'frosen', 'заморо')) return 'Frozen';
    if (has('максим', 'maxim', 'макс', 'max')) return 'Maxima';
    if (has('флайн', 'флаин', 'флайм', 'флай', 'флэй', 'флей', 'фляй', 'fly', 'flai', 'полёт', 'полет', 'взлёт', 'взлет')) return 'Flight';
    // «Thunder wave» heard as «Сандер вейв»: the wave word wins over the Sand tokens
    if (has('тандер', 'сандер', 'сандэр', 'thunder', 'sander', 'сандр', 'тандр') || (has('вейв', 'wave', 'вэйв', 'уэйв') && has('сан', 'тан', 'san', 'tan', 'сун', 'фан'))) return 'Thunderwave';
    if (has('сап', 'sap', 'саб', 'sab', 'саф', 'saf', 'сат', 'sat', 'зап', 'zap')) return 'Sapira';
    if (has('танд', 'thun', 'молн', 'гром', 'удар')) return 'Thunderwave';
    // «Fire» (a campfire) before Inferno: «Инферно» never contains these words
    if (has('fire', 'файр', 'фаер', 'фаир', 'фаэр', 'файер', 'костёр', 'костер', 'костр')) return 'Fire';
    if (has('инфер', 'infer', 'огон')) return 'Inferno';
    if (has('санд', 'sand', 'сенд', 'send', 'санс', 'sans', 'песо', 'peso', 'цент', 'cent', 'даст', 'dust', 'sun', 'son', 'sam', 'set', 'sed')) return 'Sands';
    if (has('айс', 'ice', 'аис', 'ais', 'лед', 'лёд', 'led', 'мороз', 'moroz', 'холод', 'cold', 'луч', 'beam', 'eyes', 'ace', 'is', 'snow', 'freeze', 'froze')) return 'Ice';
    return null;
}

export class SpellManager {
    /**
     * @param {THREE.Scene} scene
     * @param {Effects} fx
     * @param {object} hooks
     *   zombies(): Zombie[]
     *   authoritative(): boolean
     *   damage(z, amount, isWeapon, dir)
     *   explode(pos, radius, casterId, power)   (authoritative only)
     *   handPose(casterId, side) -> {origin, dir} | null   (live hand for ice beam)
 *   ignite(origin, dir, length) / igniteAt(pos, radius)   set trees on fire
 *   burn(o, d, len, casterId) -> bool   the Inferno stream burns what it reaches (true: something burnt)
 *   waters() -> [{x,y,z,r}]   water balls / vortex water that stop the flame;  blockAt(x,y,z) -> 'water'|'solid'|null
 *   drain(casterId, mana) -> false when the caster has no mana left (the held flame goes out)
 *   players(casterId) -> player targets (Свободный мир): {local, center(), hit(kind, from, push), blocks(from), chill(amount, from)}
     *   collision: CollisionWorld
     *   terrain(): Terrain|null
     */
    constructor(scene, fx, hooks) {
        this.scene = scene;
        this.fx = fx;
        this.hooks = hooks;
        this.spells = [];
        this.soundManager = null;

        // Re-usable projectile meshes (sand ball, bombardo orb)
        this.sandBalls = this._ballPool(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd2b48c }), 6);
        this.orbs = this._ballPool(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347 }), 6);
        for (const o of this.orbs) {
            const halo = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
            o.add(halo);
        }
    }

    _ballPool(geo, mat, n) {
        const arr = [];
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.visible = false;
            m.userData.free = true;
            this.scene.add(m);
            arr.push(m);
        }
        return arr;
    }

    _takeBall(pool) {
        const m = pool.find((b) => b.userData.free) || pool[0];
        m.userData.free = false;
        m.visible = true;
        return m;
    }

    _freeBall(m) {
        m.visible = false;
        m.scale.setScalar(1);
        m.userData.free = true;
    }

    setSoundManager(sm) {
        this.soundManager = sm;
    }

    _sound(fn, ...args) {
        if (!this.soundManager || !this.soundManager[fn]) return;
        try { this.soundManager[fn](...args); } catch (e) { console.warn('Sound error', e); }
    }

    get zombies() {
        return this.hooks.zombies ? this.hooks.zombies() : [];
    }

    get auth() {
        return this.hooks.authoritative ? this.hooks.authoritative() : true;
    }

    /**
     * @param {string} text  voice transcript or spell name
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction (normalised)
     * @param {string} handSide
     * @param {string} [casterId]
     * @returns {string|null} spell name
     */
    castSpell(text, origin, direction, handSide, casterId = 'local') {
        const name = matchSpell(text);
        if (!name) return null;
        this.cast(name, origin, direction, handSide, casterId);
        return name;
    }

    cast(name, origin, direction, handSide, casterId = 'local') {
        const o = origin.clone();
        const d = direction.clone().normalize();
        // book-birds are knocked down by the spells that fly
        if (RAY_SPELLS.has(name) && this.hooks.birdRay) this.hooks.birdRay(o, d, 30, name.endsWith('Maxima') ? 2 : 1, name);
        switch (name) {
            case 'Sapira': this.castSapira(o, d, casterId); break;
            case 'Thunderwave': this.castThunderwave(o, d, casterId); break;
            case 'Wind': this.castWind(o, d, casterId, 1); break;
            case 'Brainrot': this.castBrainrot(o, direction.clone()); break; // (its length = the distance)
            case 'Storm': if (this.hooks.storm) this.hooks.storm(o); break;
            case 'ToTheSun': this.hooks.sun?.(o); break;
            case 'LightningHold': this.castLightningHold(casterId, handSide); break;
            case 'LightningHit': this.castLightningHit(o, casterId); break;
            case 'LightningCatch': this.castLightningCatch(o, casterId); break;
            // (the beam: `direction` = from the target point back to the caster's hands)
            case 'LightningBeam': this.castLightningHit(o, casterId, o.clone().add(direction)); break;
            case 'Earthquake': this.castEarthquake(o, d, casterId, 1); break;
            case 'EarthquakeMaxima': this.castEarthquake(o, d, casterId, 3); break;
            case 'WindMaxima': this.castWind(o, d, casterId, 3); break;
            case 'WaveAttack': this.castWave(o, direction.clone(), casterId, 1); break; // (its length = the distance)
            case 'WaveAttackMaxima': this.castWave(o, direction.clone(), casterId, 2.2); break;
            case 'Inferno': this.castInferno(o, d, casterId, handSide || 'right'); break;
            case 'Sands': this.castSands(o, d, casterId); break;
            case 'Ice': this.castIce(o, d, handSide, casterId); break;
            case 'Bombardo': this.castBombardo(o, d, casterId); break;
            case 'BombardoMaxima': this.castBombardo(o, d, casterId, MAXIMA_POWER); break;
            case 'WallRise': case 'WallRiseMaxima': this.castWallRise(o, d, casterId, name === 'WallRiseMaxima'); break; // (Breakthrough's wall)
            case 'Flight': return false; // handled by the game (it moves the caster)
            default: return false;
        }
        return true;
    }

    update(dt) {
        for (let i = this.spells.length - 1; i >= 0; i--) {
            const spell = this.spells[i];
            spell.life -= dt;
            if (spell.onUpdate && spell.life > 0) spell.onUpdate(spell, dt);
            if (spell.life <= 0) {
                if (spell.onEnd) spell.onEnd(spell);
                this.spells.splice(i, 1);
            }
        }
    }

    /** «Стоп»: the spells this caster holds (flames, ice beams, the storm in the hands) end now. */
    stopBy(casterId) {
        let n = 0;
        for (const sp of this.spells) if (sp.held && sp.by === casterId && sp.life > 0) { sp.life = 0; n++; }
        return n > 0;
    }

    clear() {
        for (const s of this.spells) if (s.onEnd) s.onEnd(s);
        this.spells.length = 0;
    }

    /** Players a spell from `casterId` can hit (never the caster). */
    _players(casterId) {
        return this.hooks.players ? this.hooks.players(casterId) : [];
    }

    _damage(z, amount, isWeapon, dir) {
        if (this.auth && this.hooks.damage) this.hooks.damage(z, amount, isWeapon, dir);
    }

    // -------------------------------------------------------------- Inferno
    /**
     * A stream of fire from the hand (see InfernoStream.js): it follows the caster's live
     * hand every frame, grows out in ~0.3 s, stops at a shield facing it, at water
     * (steam) and at walls, burns every creature in it. The caster pays mana while holding it.
     */
    castInferno(origin, direction, casterId, handSide = 'right') {
        this._sound('playInferno');
        const look = new InfernoLook(this.fx);
        const o = origin.clone(), d = direction.clone();
        const right = new THREE.Vector3(), up = new THREE.Vector3();
        const flame = { t: 0, len: 0, end: null, o, d, burnT: 0, drainT: 0, worked: false };
        this.spells.push({
            life: INFERNO.LIFE,
            held: true, by: casterId, kind: 'Inferno', flame, // («стоп» ends it)
            onUpdate: (spell, dt) => {
                // the stream comes out of the live hand, wherever it points now
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live && live.dir && live.dir.lengthSq() > 1e-6) { o.copy(live.origin); d.copy(live.dir).normalize(); }
                // the caster pays mana while holding it (the hook says no when it ran out)
                if (this.hooks.drain && this.hooks.drain(casterId, infernoDrain(dt), dt) === false) { flame.noMana = true; spell.life = 0; return; }
                flame.t += dt;
                const players = this._players(casterId);
                const stop = streamStop(o, d, infernoReach(flame.t), {
                    waters: this.hooks.waters ? this.hooks.waters() : [],
                    shields: players.filter((p) => p.blocks(o)).map((p) => { const c = p.center(); return { x: c.x, y: c.y, z: c.z, r: 0.8 }; }),
                    blockAt: this.hooks.blockAt || null,
                });
                flame.len = stop.t; flame.end = stop.by;
                right.crossVectors(d, UP);
                if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
                right.normalize();
                up.crossVectors(right, d).normalize();
                look.draw(dt, o, d, flame.len, flame.end, right, up);
                // water hisses (steam) where the flame meets it
                flame.hissT = (flame.hissT || 0) - dt;
                if (flame.end === 'water' && flame.hissT <= 0) { flame.hissT = 1.2; this._sound('playSplash'); }
                let hit = false;
                for (const z of this.zombies) {
                    if (z.isDead || z.damageCooldown > 0) continue;
                    _a.copy(z.group.position); _a.y += 1;
                    if (!inStream(o, d, flame.len, _a, 0.6)) continue;
                    this._damage(z, 1, true, d);
                    z.damageCooldown = 0.1;
                    hit = true;
                }
                for (const p of players) {
                    if (!p.local) continue; // (every computer burns only its own player)
                    if (inStream(o, d, flame.len, p.center(), 0.5) && p.hit('Inferno', o)) hit = true;
                }
                // trees, dry blocks, animals, villagers, knights, spiders, living trees…
                flame.burnT -= dt;
                if (flame.burnT <= 0) {
                    flame.burnT = INFERNO.BURN_TICK;
                    if (this.hooks.burn && this.hooks.burn(o, d, flame.len, casterId)) hit = true;
                    else if (!this.hooks.burn && this.hooks.ignite) this.hooks.ignite(o, d, flame.len);
                }
                // mana: the flame really burnt something
                if (hit && !flame.worked) { flame.worked = true; this.hooks.success?.(casterId, 'Inferno'); }
            },
            onEnd: () => { if (flame.noMana) this.hooks.flameOut?.(casterId); }, // (it went out everywhere)
        });
    }

    // --------------------------------------------------------- Thunderwave
    castThunderwave(origin, direction, casterId) {
        this._sound('playThunder');
        for (let i = 0; i < 20; i++) {
            _a.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5 + 3, (Math.random() - 0.5) * 5).add(origin);
            this.fx.spark(_a, 0x88ffff, 1.5, _b.copy(direction).multiplyScalar(5), 0.5);
        }
        const range = 40;
        for (let k = 0; k < 15; k++) {
            const boltDir = direction.clone().applyAxisAngle(UP, (Math.random() - 0.5) * 2.0).normalize();
            const curr = origin.clone();
            const segments = 8;
            const segLen = (range * (0.5 + Math.random() * 0.5)) / segments;
            for (let s = 0; s < segments; s++) {
                const next = curr.clone().addScaledVector(boltDir, segLen);
                next.x += (Math.random() - 0.5) * 2; next.y += (Math.random() - 0.5) * 2; next.z += (Math.random() - 0.5) * 2;
                this.fx.bolts.add(curr, next, 0.15 + k * 0.01);
                curr.copy(next);
            }
        }
        this.fx.lightFlash(origin, 0xaaddff, 3, 0.3, 50);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            const to = _a.subVectors(z.group.position, origin);
            const dist = to.length();
            const dirTo = _b.copy(to).normalize();
            if ((dist < 4.0 && direction.dot(dirTo) > -0.2) || (dist < range && direction.angleTo(dirTo) < 1.2)) {
                if (this.auth) {
                    z.damageCooldown = 0;
                    this._damage(z, 5, true, dirTo);
                    if (!this.hooks.creatures) z.group.position.addScaledVector(dirTo, 8);
                }
            }
        }
        // every creature in the wave is shoved by its strength there (near: off its feet; far: a stagger)
        const wave = (pos) => {
            const to = new THREE.Vector3().subVectors(pos, origin);
            const dist = to.length();
            const dirTo = to.clone().normalize();
            if (!((dist < 4.0 && direction.dot(dirTo) > -0.2) || (dist < range && direction.angleTo(dirTo) < 1.2))) return null;
            return dirTo.setY(0).normalize().multiplyScalar(thunderPush(dist)).setY(1);
        };
        if (this.auth) this.hooks.creatures?.('Thunderwave', casterId, wave, { from: origin, noSlide: (c) => c.isAnimal /* (Animals throws its own) */ });
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            const v = wave(p.center());
            if (v) p.hit('Thunderwave', origin, v);
        }
    }

    // ------------------------------------------------------ Lightning Strike
    /** The lightning sits in the caster's hand: a crackling bolt from the sky to it (≤ 5 s). */
    castLightningHold(casterId, side) {
        this._holds = this._holds || new Map();
        const prev = this._holds.get(casterId);
        if (prev) prev.life = 0;
        const sky = new THREE.Vector3();
        const spell = {
            life: 8.5,
            held: true, by: casterId,
            onUpdate: () => {
                // the power of the storm sits in both hands: strands from the sky, arcs between the hands
                const hands = [];
                for (const s of ['right', 'left']) {
                    const hp = this.hooks.handPose ? this.hooks.handPose(casterId, s) : null;
                    if (hp) hands.push(hp.origin.clone());
                }
                if (!hands.length) return;
                for (const hand of hands) {
                    sky.set(hand.x + 6, hand.y + 45, hand.z - 4);
                    this._jagged(sky, hand, 12, 2.2, 0.05);
                    if (Math.random() < 0.5) this._jagged(sky, hand, 10, 3.5, 0.05);
                    for (let k = 0; k < 2; k++) this.fx.spark(hand, Math.random() < 0.5 ? 0xffffff : 0x9fd8ff, 0.22, _b.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 0.3);
                }
                if (hands.length === 2 && Math.random() < 0.6) this._jagged(hands[0], hands[1], 5, 0.4, 0.05);
            },
            onEnd: () => { if (this._holds.get(casterId) === spell) this._holds.delete(casterId); },
        };
        this._holds.set(casterId, spell);
        this.spells.push(spell);
    }

    /** A jagged bolt from a to b (segments live one frame unless `life`). */
    _jagged(a, b, n, amp, life) {
        const dir = _a.subVectors(b, a);
        let prev = a.clone();
        for (let i = 1; i <= n; i++) {
            const p = a.clone().addScaledVector(dir, i / n);
            if (i < n) p.add(_c.set((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * 2 * amp));
            this.fx.bolts.add(prev, p, life);
            prev = p;
        }
    }

    /** The storm's lightning comes down into the caster's raised hands: a huge flash, no harm. */
    castLightningCatch(o, casterId) {
        const hands = [];
        for (const s of ['right', 'left']) { const hp = this.hooks.handPose ? this.hooks.handPose(casterId, s) : null; if (hp) hands.push(hp.origin.clone()); }
        if (!hands.length) hands.push(o.clone().add(_b.set(0, 4, 0)));
        for (const hand of hands) {
            const sky = new THREE.Vector3(hand.x + 8, hand.y + 70, hand.z - 5);
            for (let k = 0; k < 4; k++) this._jagged(sky, hand, 18, 4 - k, 0.4 + k * 0.05);
            for (let i = 0; i < 30; i++) this.fx.spark(hand, i % 3 ? 0xffffff : 0x9fd8ff, 0.3, _b.set((Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10), 0.7);
            this.fx.lightFlash(hand, 0xdde8ff, 16, 0.6, 140);
        }
        this.fx.shake = Math.max(this.fx.shake, 1.5);
        this._sound('playThunder');
    }

    /**
     * The lightning strikes `point` — from the sky, or (`from`) out of the caster's hands
     * in a huge crackling beam: everything right there is hit hard.
     */
    castLightningHit(point, casterId, from = null) {
        const hold = this._holds && this._holds.get(casterId);
        if (hold) hold.life = 0;
        const sky = from ? from.clone() : new THREE.Vector3(point.x + 8, point.y + 70, point.z - 5);
        for (let k = 0; k < (from ? 5 : 3); k++) this._jagged(sky, point, from ? 14 : 16, from ? 2.4 - k * 0.4 : 3 - k, 0.45 + k * 0.05);
        if (from) this.fx.lightFlash(from, 0xdde8ff, 10, 0.4, 80);
        for (let k = 0; k < 6; k++) { // branches
            const mid = sky.clone().lerp(point, 0.3 + Math.random() * 0.5);
            this._jagged(mid, mid.clone().add(_b.set((Math.random() - 0.5) * 14, -6 - Math.random() * 8, (Math.random() - 0.5) * 14)), 5, 1, 0.3);
        }
        this.fx.lightFlash(point, 0xdde8ff, 14, 0.5, 120);
        this.fx.shake = Math.max(this.fx.shake, 1.2);
        for (let i = 0; i < 40; i++) this.fx.spark(point, i % 3 ? 0xffffff : 0x9fd8ff, 0.25, _b.set((Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12), 0.6);
        this._sound('playThunder');
        if (this.hooks.ignite) this.hooks.ignite(point.clone().add(UP.clone().multiplyScalar(4)), _b.set(0, -1, 0), 6);
        const R = 3.2;
        if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                if (z.group.position.distanceTo(point) < R + 0.5) { z.damageCooldown = 0; this._damage(z, 20, false, _b.set(0, 0, 1)); }
            }
            // whoever lives through it is thrown off its feet, away from the strike
            this.hooks.creatures?.('Lightning', casterId, (pos) => {
                if (pos.distanceTo(point) > R + 1.5) return null;
                const v = new THREE.Vector3(pos.x - point.x, 0, pos.z - point.z);
                if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
                return v.normalize().multiplyScalar(8);
            }, { from: point });
        }
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            if (p.center().distanceTo(point) < R + 0.5) p.hit('Lightning', point);
        }
        if (this.hooks.lightningAt) this.hooks.lightningAt(point, casterId);
    }

    // ---------------------------------------------------------- Earthquake
    /**
     * «Earthquake»: a stomp sends a quake along the ground in one direction — a
     * crack opens, dust and stones jump, and everything it runs under falls
     * down for a few seconds and gets hurt. Maxima: 3× stronger, longer, wider.
     */
    castEarthquake(origin, direction, casterId, power = 1) {
        this._sound('playExplosion', origin, origin, power > 1 ? 2 : 1);
        const dir = direction.clone().setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
        dir.normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const length = power > 1 ? 32 : 20;
        const half = power > 1 ? 4 : 2.4; // half-width of the hit strip
        const SPEED = 16; // m/s the wave runs
        const ground = (x, z) => (this.hooks.collision ? this.hooks.collision.surfaceY(x, z) : 0);
        // The crack: a jagged dark line on the ground that opens as the wave passes
        const crackMat = new THREE.MeshBasicMaterial({ color: 0x1c120c, transparent: true, opacity: 0.95, depthWrite: false });
        const glowMat = new THREE.MeshBasicMaterial({ color: power > 1 ? 0xff6a2a : 0xd08a4a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
        const crack = new THREE.Group();
        this.scene.add(crack);
        const segs = [];
        let prev = origin.clone().addScaledVector(dir, 1);
        const w = power > 1 ? 0.55 : 0.32;
        for (let d = 2; d <= length; d += 1.6) {
            const p = origin.clone().addScaledVector(dir, d).addScaledVector(side, (Math.random() - 0.5) * 1.2);
            for (const q of [prev, p]) q.y = ground(q.x, q.z) + 0.04;
            const len = prev.distanceTo(p);
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, len), crackMat);
            m.position.copy(prev).lerp(p, 0.5);
            m.lookAt(p);
            m.scale.set(0.01, 1, 1);
            const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 0.05, len), glowMat);
            glow.position.y = 0.01;
            m.add(glow);
            crack.add(m);
            segs.push({ m, d });
            prev = p;
        }
        const hit = new Set(), fell = new Set(); // (hurt once; thrown off the feet once)
        let t = 0;
        this.spells.push({
            life: length / SPEED + 8,
            onUpdate: (spell, dt) => {
                t += dt;
                const front = t * SPEED;
                for (const s of segs) {
                    if (s.d > front) continue;
                    s.m.scale.x = Math.min(1, s.m.scale.x + dt * 6);
                    // dust and stones jump where the wave passes now
                    if (s.d > front - SPEED * dt * 1.5 && !s.burst) {
                        s.burst = true;
                        const p = s.m.position;
                        for (let i = 0; i < (power > 1 ? 7 : 4); i++) {
                            this.fx.spark(_a.set(p.x + (Math.random() - 0.5) * half, p.y + 0.2, p.z + (Math.random() - 0.5) * half), [0x8a6a4a, 0x6b5440, 0xa38766][i % 3], 0.3 + Math.random() * 0.3 * power, _b.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4 * power, (Math.random() - 0.5) * 3), 1.0);
                        }
                    }
                }
                // Whatever the wave runs under falls down (once)
                if (front <= length + 1) {
                    const reached = (pos) => {
                        const to = _a.subVectors(pos, origin);
                        const along = to.dot(dir);
                        if (along < 0.5 || along > length || along > front) return false;
                        return Math.abs(to.dot(side)) < half;
                    };
                    if (this.auth) {
                        for (const z of this.zombies) {
                            if (z.isDead || hit.has(z)) continue;
                            if (!reached(z.group.position)) continue;
                            hit.add(z);
                            if (!this.hooks.creatures) {
                                z.stunTimer = Math.max(z.stunTimer || 0, power > 1 ? 4 : 2.5);
                                z.vy = Math.max(z.vy || 0, 4 + power * 2);
                            }
                            z.damageCooldown = 0;
                            this._damage(z, power > 1 ? 12 : 4, false, dir);
                        }
                        // the ground runs away under their feet: everything it runs under falls back against it
                        this.hooks.creatures?.(power > 1 ? 'EarthquakeMaxima' : 'Earthquake', casterId,
                            (pos) => (reached(pos) ? dir.clone().multiplyScalar(power > 1 ? -5 : -3) : null),
                            { skip: (c) => fell.has(c), each: (c) => fell.add(c) });
                    }
                    if (this.hooks.quakeMe && !hit.has('me')) {
                        if (this.hooks.quakeMe(casterId, origin, reached, power, dir)) hit.add('me');
                    }
                }
                // the crack fades away after a while
                const fade = t - length / SPEED - 5;
                if (fade > 0) { crackMat.opacity = Math.max(0, 0.95 - fade / 3); glowMat.opacity = Math.max(0, 0.7 - fade / 3); }
                else glowMat.opacity = 0.45 + Math.sin(t * 9) * 0.25;
            },
            onEnd: () => {
                this.scene.remove(crack);
                crack.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
                crackMat.dispose(); glowMat.dispose();
            },
        });
    }

    // ------------------------------------------------------------ Brainrot
    /**
     * «Брейнрот»: hypnotic rings roll out from a glowing spot above the
     * wizard's head towards the zombie (the length of `direction` = distance).
     */
    castBrainrot(origin, direction) {
        this._sound('playSapira');
        const dist = Math.max(2, direction.length());
        const dir = direction.clone().normalize();
        if (!this._ringGeo) this._ringGeo = new THREE.TorusGeometry(1, 0.09, 8, 40);
        const cols = [0xd65bff, 0xff5bd6, 0x8f5bff, 0x5bffd0];
        const rings = [];
        for (let i = 0; i < 9; i++) {
            const m = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            m.visible = false;
            this.scene.add(m);
            rings.push({ m, delay: i * 0.16 });
        }
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7bff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        orb.position.copy(origin);
        this.scene.add(orb);
        const SPEED = 11;
        let t = 0;
        this.spells.push({
            life: 0.16 * 9 + dist / SPEED + 0.3,
            onUpdate: (spell, dt) => {
                t += dt;
                orb.scale.setScalar(1 + Math.sin(t * 14) * 0.25);
                for (const r of rings) {
                    const lt = t - r.delay;
                    if (lt < 0) continue;
                    const d = lt * SPEED;
                    if (d > dist) { r.m.visible = false; continue; }
                    r.m.visible = true;
                    r.m.position.copy(origin).addScaledVector(dir, d);
                    r.m.scale.setScalar(0.35 + d * 0.09);
                    r.m.rotateZ(dt * 5);
                    r.m.material.opacity = 0.85 * (1 - d / dist * 0.6);
                }
            },
            onEnd: () => {
                for (const r of rings) { this.scene.remove(r.m); r.m.material.dispose(); }
                this.scene.remove(orb); orb.geometry.dispose(); orb.material.dispose();
            },
        });
    }

    // ---------------------------------------------------------------- Wind
    /**
     * «Вайнд»: a gust from the hand blows away whatever is in front — zombies,
     * players, loose things. Harmless. «Вайнд Максима» is 3× stronger and reaches further.
     */
    castWind(origin, direction, casterId, power = 1) {
        this._sound('playWhoosh');
        const range = power > 1 ? 24 : 14;
        const cone = 0.65;
        const strength = 13 * power; // m/s at the hand
        // Visible gust: pale swirling streaks flying out in a cone
        const n = power > 1 ? 70 : 35;
        for (let i = 0; i < n; i++) {
            const spread = _b.set((Math.random() - 0.5) * cone * 1.6, (Math.random() - 0.5) * cone * 1.2, (Math.random() - 0.5) * cone * 1.6);
            const v = _a.copy(direction).add(spread).normalize().multiplyScalar(range * (0.9 + Math.random() * 0.8));
            const start = _c.copy(origin).addScaledVector(direction, Math.random() * 1.5);
            this.fx.spark(start, Math.random() < 0.5 ? 0xe8f6ff : 0xbfe3ff, 0.18 + Math.random() * 0.25 * power, v, 0.7 + Math.random() * 0.3);
        }
        const push = (pos) => {
            const to = _a.subVectors(pos, origin);
            const dist = to.length();
            if (dist > range) return null;
            const dirTo = to.normalize();
            if (dist > 2.5 && direction.angleTo(dirTo) > cone) return null;
            if (dist <= 2.5 && direction.dot(dirTo) < 0) return null;
            const k = strength * (1 - 0.6 * dist / range);
            return _b.copy(direction).lerp(dirTo, 0.5).setY(0).normalize().multiplyScalar(k).setY(k * 0.35);
        };
        // Creatures (moved where they are simulated): a stagger across the cone, off the feet point-blank
        if (this.auth && this.hooks.creatures) this.hooks.creatures(power > 1 ? 'WindMaxima' : 'Wind', casterId, (pos) => { const v = push(pos); return v && v.clone(); }, { from: origin });
        else if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const v = push(_c.copy(z.group.position).add(UP));
                if (!v) continue;
                z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0));
                z.vy = Math.max(z.vy || 0, v.y);
            }
        }
        // Loose things (where their physics runs)
        for (const w of this.hooks.weapons ? this.hooks.weapons() : []) {
            if (w.holder || w.remoteTarget) continue;
            const v = push(w.position);
            if (!v) continue;
            w.hover = null;
            w.wake();
            w.velocity.add(v);
            w.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }
        // Me, if another wizard blew at me (every machine moves its own player)
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, origin, (pos) => push(pos), power > 1 ? 'WindMaxima' : 'Wind');
    }

    // ----------------------------------------------------------- Wave Attack
    /**
     * A wave rises from the water (origin) and rolls to the target point
     * (origin + vec): a curved wall of water, foam on top. Whoever it reaches is
     * washed away (pushed hard along the wave) — it never hurts.
     */
    castWave(origin, vec, casterId, power = 1) {
        const dist = Math.max(4, Math.min(40, vec.length()));
        const dir = vec.setY(0).normalize();
        if (!Number.isFinite(dir.x)) return;
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const width = 3.2 * power, height = 1.6 + 1.1 * power;
        const speed = 11;
        this._sound('playWhoosh');
        const geo = new THREE.CylinderGeometry(width / 2, width / 2, 1, 20, 1, true, -Math.PI / 2, Math.PI);
        geo.rotateZ(Math.PI / 2);
        const mat = new THREE.MeshPhongMaterial({ color: 0x2f8fd0, transparent: true, opacity: 0.75, shininess: 90, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
        const wave = new THREE.Mesh(geo, mat);
        this.scene.add(wave);
        const ground = (x, z) => (this.hooks.collision ? this.hooks.collision.surfaceY(x, z) : 0);
        const pos = origin.clone();
        const hit = new Set();
        let travelled = 0;
        const total = dist + 3;
        const push = (p) => {
            const to = _a.subVectors(p, pos);
            const along = to.dot(dir), across = Math.abs(to.dot(side));
            if (along < -1.2 || along > 1.6 || across > width / 2 + 0.6 || Math.abs(to.y) > height + 2.5) return null;
            const k = 4 + 6 * power; // (carried and staggered; the Maxima throws off the feet)
            return _b.copy(dir).multiplyScalar(k).setY(2.5 + power);
        };
        this.spells.push({
            life: total / speed + 0.6,
            onUpdate: (spell, dt) => {
                travelled += speed * dt;
                const k = Math.min(1, travelled / total);
                pos.copy(origin).addScaledVector(dir, Math.min(travelled, total));
                pos.y = Math.max(ground(pos.x, pos.z), origin.y - 0.5); // rides on the water, climbs the shore
                // rises out of the water, grows, then breaks at the end
                const rise = Math.min(1, travelled / 3), fall = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
                const h = height * rise * Math.max(0.05, fall);
                wave.position.copy(pos).setY(pos.y + h / 2 - 0.3);
                wave.scale.set(1, h, 1.4);
                wave.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
                mat.opacity = 0.75 * Math.max(0.1, fall);
                // spray and foam
                for (let i = 0; i < 6 * power; i++) {
                    _c.copy(pos).addScaledVector(side, (Math.random() - 0.5) * width).setY(pos.y + h * (0.7 + Math.random() * 0.4));
                    this.fx.spark(_c, Math.random() < 0.5 ? 0xffffff : 0x9fd8ff, 0.12 + Math.random() * 0.15, _b.copy(dir).multiplyScalar(3 + Math.random() * 3).setY(1 + Math.random() * 2), 0.6);
                }
                // zombies (where they are simulated), things, and me
                if (this.auth && this.hooks.creatures) {
                    this.hooks.creatures(power > 1 ? 'WaveAttackMaxima' : 'WaveAttack', casterId, (p) => { const v = push(p); return v && v.clone(); },
                        { skip: (c) => hit.has(c), each: (c) => hit.add(c) });
                } else if (this.auth) {
                    for (const z of this.zombies) {
                        if (z.isDead || hit.has(z)) continue;
                        const v = push(_c.copy(z.group.position));
                        if (!v) continue;
                        hit.add(z);
                        z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0));
                        z.vy = Math.max(z.vy || 0, v.y);
                    }
                }
                for (const w of this.hooks.weapons ? this.hooks.weapons() : []) {
                    if (w.holder || w.remoteTarget || hit.has(w)) continue;
                    const v = push(w.position);
                    if (!v) continue;
                    hit.add(w);
                    w.hover = null;
                    w.wake();
                    w.velocity.add(v);
                }
                if (this.hooks.blowMe && !hit.has('me')) {
                    let got = false;
                    this.hooks.blowMe(casterId, pos, (p) => { const v = push(p); if (v) got = true; return v; }, power > 1 ? 'WaveAttackMaxima' : 'WaveAttack');
                    if (got) hit.add('me');
                }
            },
            onEnd: () => { this.scene.remove(wave); geo.dispose(); mat.dispose(); },
        });
    }

    // --------------------------------------------------------------- Sands
    castSands(origin, direction, casterId) {
        this._sound('playWhoosh');
        const players = this._players(casterId);
        const ball = this._takeBall(this.sandBalls);
        ball.position.copy(origin);
        const velocity = direction.clone().multiplyScalar(25.0);
        const sanded = new Set();
        this.spells.push({
            life: 3.0,
            onUpdate: (spell, dt) => {
                ball.position.addScaledVector(velocity, dt);
                ball.rotation.x += dt * 5;
                ball.rotation.y += dt * 5;
                if (Math.random() > 0.5) {
                    this.fx.spark(ball.position, 0xd2b48c, 0.2, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    _a.copy(z.group.position); _a.y += 1.2;
                    if (ball.position.distanceTo(_a) < 1.5) {
                        if (this.auth && this.hooks.sand) this.hooks.sand(z);
                        for (let k = 0; k < 20; k++) {
                            this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                        }
                        spell.life = 0;
                        return;
                    }
                }
                // people and animals: sand in the face — they reel back
                if (this.auth && this.hooks.creatures) {
                    const n = this.hooks.creatures('Sands', casterId, (pos) => (ball.position.distanceTo(pos) < 1.8 ? velocity.clone().setY(0).normalize().multiplyScalar(5) : null),
                        { kinds: ['v', 'a'], from: origin, skip: (c) => sanded.has(c), each: (c) => sanded.add(c) });
                    if (n) {
                        for (let k = 0; k < 20; k++) this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                        spell.life = 0;
                        return;
                    }
                }
                for (const p of players) {
                    if (ball.position.distanceTo(p.center()) >= 1.5) continue;
                    if (p.blocks(origin)) {
                        // Bounces off the shield
                        velocity.multiplyScalar(-0.8);
                        ball.position.addScaledVector(velocity, dt * 2);
                        p.hit('Sands', origin);
                        continue;
                    }
                    if (p.local) p.hit('Sands', origin);
                    for (let k = 0; k < 20; k++) {
                        this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                    }
                    spell.life = 0;
                    return;
                }
                if (ball.position.distanceTo(origin) > 20) spell.life = 0;
            },
            onEnd: () => this._freeBall(ball),
        });
    }

    // ----------------------------------------------------------------- Ice
    castIce(origin, direction, handSide, casterId) {
        let target = null, minDist = Infinity;
        for (const z of this.zombies) {
            if (z.isDead || z.isFrozen) continue;
            _a.copy(z.group.position); _a.y += 1.2;
            _a.sub(origin);
            const dist = _a.length();
            if (dist > 20) continue;
            if (direction.angleTo(_a.normalize()) < 0.4 && dist < minDist) { minDist = dist; target = z; }
        }
        // Players can be frozen too (Свободный мир)
        let player = null;
        for (const p of this._players(casterId)) {
            _a.subVectors(p.center(), origin);
            const dist = _a.length();
            if (dist > 20) continue;
            if (direction.angleTo(_a.normalize()) < 0.4 && dist < minDist) { minDist = dist; player = p; target = null; }
        }
        if (player) { this._icePlayer(origin, direction, handSide, casterId, player); return; }
        if (!target) {
            this.fx.straightBeam(origin, _a.copy(origin).addScaledVector(direction, 20), 0.4, 0x88ffff, 0.5, 0.5);
            return;
        }
        this._sound('playIce');
        const beam = this.fx.acquireIceBeam();
        const initialDir = direction.clone();
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), dir = new THREE.Vector3();
        this.spells.push({
            life: 5.0,
            held: true, by: casterId,
            onUpdate: (spell, dt) => {
                if (target.isDead) { spell.life = 0; return; }
                p2.copy(target.group.position); p2.y += 1.2;
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live) { p0.copy(live.origin); dir.copy(live.dir); } else { p0.copy(origin); dir.copy(initialDir); }
                // Beam breaks if the hand turns away more than ~25° from where it was cast
                if (dir.angleTo(initialDir) > 0.45) { spell.life = 0; return; }
                const dist = p0.distanceTo(p2);
                p1.copy(p0).addScaledVector(dir, dist * 0.5);
                if (beam) beam.setCurve(p0, p1, p2);
                if (this.auth && this.hooks.chill) this.hooks.chill(target, (1.0 / 5.0) * dt);
                if (Math.random() > 0.5) {
                    this.fx.spark(p2, 0xaaddff, 0.4, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
            },
            onEnd: () => this.fx.releaseIceBeam(beam),
        });
    }

    /** Ice beam on a player: freezes in 5 s, breaks when they run out of it or a shield stops it. */
    _icePlayer(origin, direction, handSide, casterId, player) {
        this._sound('playIce');
        const beam = this.fx.acquireIceBeam();
        const initialDir = direction.clone();
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), dir = new THREE.Vector3();
        this.spells.push({
            life: 5.5,
            held: true, by: casterId,
            onUpdate: (spell, dt) => {
                p2.copy(player.center());
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live) { p0.copy(live.origin); dir.copy(live.dir); } else { p0.copy(origin); dir.copy(initialDir); }
                if (dir.angleTo(initialDir) > 0.45) { spell.life = 0; return; }
                // The target got away: out of the beam's reach or direction
                const to = _a.subVectors(p2, p0);
                if (to.length() > 24 || dir.angleTo(to.normalize()) > 0.55) { spell.life = 0; return; }
                const dist = p0.distanceTo(p2);
                p1.copy(p0).addScaledVector(dir, dist * 0.5);
                if (beam) beam.setCurve(p0, p1, p2);
                if (player.local && !player.chill(dt / 5, p0)) { spell.life = 0; return; }
                if (!player.local && player.blocks(p0)) { spell.life = 0; return; }
                if (Math.random() > 0.5) this.fx.spark(p2, 0xaaddff, 0.4, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
            },
            onEnd: () => this.fx.releaseIceBeam(beam),
        });
    }

    // ---------------------------------------------------- Breakthrough's wall
    /** The wall shoots up out of the ground at `center` (across `dir`): whoever stands on it is thrown back. */
    castWallRise(center, dir, casterId, max) {
        dir = dir.clone().setY(0);
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x), width = max ? 9 : 5;
        const push = (p) => {
            const to = new THREE.Vector3(p.x - center.x, 0, p.z - center.z);
            if (Math.abs(to.dot(side)) > width / 2 + 1 || Math.abs(to.dot(dir)) > 1.6) return null;
            return dir.clone().multiplyScalar(max ? 12 : 8).setY(max ? 8 : 6);
        };
        const name = max ? 'WallRiseMaxima' : 'WallRise';
        if (this.auth && this.hooks.creatures) this.hooks.creatures(name, casterId, push);
        else if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const v = push(z.group.position);
                if (v) { z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0)); z.vy = Math.max(z.vy || 0, v.y); }
            }
        }
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, center, push, name);
    }

    // -------------------------------------------------------------- Sapira
    castSapira(origin, direction, casterId) {
        this._sound('playSapira');
        const len = 100;
        const end = _a.copy(origin).addScaledVector(direction, len);
        this.fx.straightBeam(origin, end, 0.2, 0x000000, 1.0, 1.5, (s) => { s.mesh.material.opacity = 1; });
        this.fx.straightBeam(origin, end, 0.6, 0x9b59b6, 0.5, 1.5, (s) => {
            const scale = 1 + Math.sin(s.life * 10) * 0.5;
            s.mesh.scale.x = 0.6 * scale;
            s.mesh.scale.z = 0.6 * scale;
        }, THREE.AdditiveBlending);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            _b.copy(z.group.position); _b.y += 1.2;
            _c.subVectors(_b, origin);
            const proj = _c.dot(direction);
            if (proj < 0 || proj > len) continue;
            _c.copy(origin).addScaledVector(direction, proj);
            if (_c.distanceTo(_b) < 1.5) this._damage(z, 10, true, direction);
        }
        // the beam's charge throws whoever it goes through off their feet
        if (this.auth) this.hooks.creatures?.('Sapira', casterId, (pos) => {
            const to = new THREE.Vector3().subVectors(pos, origin), proj = to.dot(direction);
            if (proj < 0 || proj > len || origin.clone().addScaledVector(direction, proj).distanceTo(pos) > 1.8) return null;
            return direction.clone().setY(0).normalize().multiplyScalar(12);
        }, { from: origin });
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            _b.copy(p.center());
            _c.subVectors(_b, origin);
            const proj = _c.dot(direction);
            if (proj < 0 || proj > len) continue;
            _c.copy(origin).addScaledVector(direction, proj);
            if (_c.distanceTo(_b) < 1.5) p.hit('Sapira', origin);
        }
    }

    // ------------------------------------------------------------ Bombardo
    castBombardo(origin, direction, casterId, power = 1) {
        const maxima = power > 1;
        this._sound('playBombardoCast');
        const orb = this._takeBall(this.orbs);
        const size = maxima ? 2.3 : 1;
        orb.scale.setScalar(size);
        orb.position.copy(origin).addScaledVector(direction, 0.8 * size);
        const vel = direction.clone().multiplyScalar(maxima ? 27 : 32);
        const gravity = maxima ? 3.5 : 6;
        const radius = bombardoRadius(power);
        const hitR2 = 1.3 * size * size;
        const prev = new THREE.Vector3();
        const collision = this.hooks.collision;
        if (maxima) this.fx.castBurst(origin, direction);
        const handOrigin = origin.clone();
        const players = this._players(casterId);
        let age = 0;
        let exploded = false;
        const explodeAt = (p) => {
            if (exploded) return;
            exploded = true;
            this.hooks.success?.(casterId, maxima ? 'BombardoMaxima' : 'Bombardo'); // (mana: it went off)
            if (this.auth && this.hooks.explode) this.hooks.explode(p.clone(), radius, casterId, power);
            else this.fx.lightFlash(p, 0xffaa55, 2 * size, 0.15, 20 * size); // client: real blast arrives from the host
        };
        this.spells.push({
            life: maxima ? 3.2 : 2.6,
            onUpdate: (spell, dt) => {
                prev.copy(orb.position);
                age += dt;
                vel.y -= gravity * dt;
                orb.position.addScaledVector(vel, dt);
                orb.rotation.y += dt * 8;
                // Trail
                const trail = maxima ? 8 : 3;
                for (let k = 0; k < trail; k++) {
                    const j = maxima ? 4 : 2;
                    this.fx.glow.spawn(orb.position.x, orb.position.y, orb.position.z,
                        (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j,
                        k === 0 ? 0xffd27a : (maxima && k % 3 === 1 ? 0xff2a00 : 0xff6a00), (0.35 + Math.random() * 0.3) * (maxima ? 2 : 1), maxima ? 0.45 : 0.3, { shrink: 2.0 });
                }
                // Maxima: magic keeps pouring out of the hand for a moment
                if (maxima && age < 0.45) {
                    for (let k = 0; k < 5; k++) {
                        const sp = 14 + Math.random() * 16;
                        this.fx.glow.spawn(handOrigin.x, handOrigin.y, handOrigin.z,
                            direction.x * sp + (Math.random() - 0.5) * 4, direction.y * sp + (Math.random() - 0.5) * 4, direction.z * sp + (Math.random() - 0.5) * 4,
                            Math.random() < 0.4 ? 0xffffff : 0xffa030, 0.3 + Math.random() * 0.4, 0.25 + Math.random() * 0.2, { shrink: 2.5 });
                    }
                }
                // Terrain (voxel DDA between last and current position)
                const terrain = this.hooks.terrain ? this.hooks.terrain() : null;
                const step = _a.subVectors(orb.position, prev);
                const stepLen = step.length();
                if (terrain && stepLen > 0) {
                    const hit = terrain.raycast(prev, step.clone().divideScalar(stepLen), stepLen);
                    if (hit) { explodeAt(_b.set(hit.x, hit.y, hit.z)); spell.life = 0; return; }
                }
                // Walls / tables / trees / floor
                if (collision && collision.pointBlocked(orb.position.x, orb.position.y, orb.position.z)) {
                    explodeAt(prev); spell.life = 0; return;
                }
                // Players: a shield sends the orb back, otherwise it blows up on them
                for (const p of players) {
                    const pc = p.center();
                    if (orb.position.distanceTo(pc) > 1.2 + size * 0.45) continue;
                    if (p.blocks(origin)) {
                        _a.subVectors(orb.position, pc).normalize();
                        vel.reflect(_a).multiplyScalar(0.9);
                        orb.position.copy(pc).addScaledVector(_a, 1.4 + size * 0.5);
                        p.hit('Bounce', origin);
                        continue;
                    }
                    explodeAt(orb.position); spell.life = 0; return;
                }
                // Zombies
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    const zp = z.group.position;
                    const dx = orb.position.x - zp.x, dz = orb.position.z - zp.z;
                    if (dx * dx + dz * dz < hitR2 && orb.position.y > zp.y - 1 - size && orb.position.y < zp.y + 3 + size) {
                        explodeAt(orb.position); spell.life = 0; return;
                    }
                }
            },
            onEnd: (spell) => {
                if (!exploded) explodeAt(orb.position); // fizzles out with a bang at max range
                this._freeBall(orb);
            },
        });
    }
}
