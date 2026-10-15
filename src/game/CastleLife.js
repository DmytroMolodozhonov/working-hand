/**
 * CastleLife.js — the people of the castles.
 *
 * Each castle (src/world/Castles.js) has its people: a king on the throne,
 * knights at the gate, round the throne, on the walls and in the yard,
 * merchants at the market stalls, farmers in the fields, builders and
 * townsfolk walking between the houses, the market, the well and the castle.
 * A castle of 1000 does not run 1000 people: it shows a crowd round you (more
 * people near you, they come out of houses and go back in), so it feels like
 * a big town — every villager is still someone: a name, a role, a home, the
 * same look every time.
 *
 * Nobody touches you while you behave. Hurt a villager or a knight where
 * someone sees it (or the victim lives to tell) and the castle turns on you:
 * knights who saw it attack, the people run and shout for the guard. Hit
 * the king and every knight of the castle comes running. Knights and the
 * king wear armour: 50 (the king 100) armour points take most of a blow, so
 * their hearts go down many times slower. Kill the king and the castle is
 * yours: the people bow, the knights obey, the chests open.
 *
 * Multiplayer: the host runs the people (who goes where, who fights whom);
 * guests show them and send their hits.
 */

import { shareFoes } from './CrewTactics.js';
import { avoidStep } from './Avoid.js';
import { KT, LINES, choosePlan, reviewPlan, remember, begin, newMemory, castRoles, meleeStyle, planSteps, aimArrow } from './KnightTactics.js';
import { BLOCK } from '../world/Terrain.js';
import * as THREE from 'three';
import { setNearShadow, SHADOW_NEAR } from '../core/Shadows.js';
import { ARMOR } from './ArmorTypes.js';
import { VillagerModel, villagerLook, strippedLook, VILLAGER_FOOT_OFFSET, VILLAGER_SIT_OFFSET } from '../entities/VillagerModel.js';
import { SpeechBubble } from '../ui/SpeechBubble.js';
import { Chest } from '../entities/Chest.js';
import { createRng } from '../core/math.js';
import { CastleTalk } from './CastleTalk.js';
import { WizardLife, isWizSite, WIZ_SHOUT, WIZ_JOBS, FX } from './WizardLife.js';
import { WizardFight } from './WizardFight.js';
import { floorUnder } from './Wreck.js';
import { WIZ, wizardRoster } from './WizardAI.js';
import { EXPELLIARMUS } from './Expelliarmus.js';
import { VillagerOrders } from './VillagerOrders.js';
import { slowFactor, tickSlow } from './Slow.js';
import { creditKill } from './Mana.js';
import { VillagerFear } from './VillagerFear.js';
import { Rebuild } from './Rebuild.js';
import { NightLife } from './NightLife.js';
import { Wanted, wreckPoints, wantedTactics } from './Wanted.js';
import { knowsCulprit, sightRange, spellFamily } from './Blame.js';
import { BodyFound } from './BodyFound.js';

const WAKE = 90; // m beyond the castle land: its people appear
const SLEEP = 140;
const SEE = 32; // m: villagers see violence this far (with a free line of sight)
const VIEW = 80; // m: farther villagers are not drawn
const WALK = 2.3, RUN = 5.6;
const HOSTILE_MS = 180000;
const GRUDGE_MS = 40000; // a villager angry at ONE player (a hard blow, a theft): they fight that one only, no guards
const THEFT_MS = 90000;
const RAMPAGE = 3; // different people of a castle hurt by one player within 2 min: that is a rampage — the guard comes
const PETTY = 12; // blocks of quiet damage (a pane, a few blocks) per player in 5 min: the people grumble, no guards
const LEASH = 20; // m: out of their land, knights chase on until the enemy is this far ahead
const HEAR_BOOM = 110; // m: a blast is heard this far (the guards come to look)
const ARROW_SPEED = 42, ARROW_DMG = 3; // a knight's bow (KnightTactics: the archers)
const URGENT = new Set(['rush', 'fallback', 'kingguard']); // (these cut a plan short)
const BODY_R = 0.42; // m: a person's half-width (walls are kept this far from the middle of the body)
const MELEE = new Set(['sword', 'shield']);
export const STATS = {
    builder: { hp: 8, armor: 0, dmg: 1 },
    farmer: { hp: 8, armor: 0, dmg: 1 },
    merchant: { hp: 8, armor: 0, dmg: 1 },
    knight: { hp: 20, armor: 50, dmg: 3 },
    king: { hp: 30, armor: 100, dmg: 5 },
    advisor: { hp: 8, armor: 0, dmg: 1 },
};
/** The king's advisor stands by the throne: roster number -1 (not one of the people counted by `population`). */
export const ADVISOR_IDX = -1;
export const ROLE_NAMES = { builder: 'Строитель', farmer: 'Фермер', merchant: 'Торговец', knight: 'Рыцарь', king: 'Король', advisor: 'Советник' };
const ROLE_NAMES_F = { builder: 'Строительница', farmer: 'Фермерша', merchant: 'Торговка', knight: 'Рыцарь', king: 'Король', advisor: 'Советница' };
const MALE = ['Иван', 'Пётр', 'Фёдор', 'Михаил', 'Григорий', 'Степан', 'Яков', 'Тимофей', 'Матвей', 'Савелий', 'Никита', 'Еремей', 'Захар', 'Остап', 'Богдан', 'Мирон', 'Лука', 'Демьян', 'Филипп', 'Аким', 'Гордей', 'Игнат', 'Кузьма', 'Прохор', 'Тарас', 'Ефим', 'Арсений', 'Любомир', 'Ратибор', 'Всеслав'];
const FEMALE = ['Мария', 'Анна', 'Дарья', 'Агафья', 'Василиса', 'Марфа', 'Ульяна', 'Евдокия', 'Аксинья', 'Пелагея', 'Олеся', 'Любава', 'Злата', 'Милана', 'Забава', 'Настасья', 'Варвара', 'Фёкла', 'Ярослава', 'Дуняша'];

// what people shout (the conversation brain adds much more when you talk to them)
const SHOUT = {
    help: ['Помогите!', 'Стража! Стража!', 'Убивают!', 'Спасите!', 'А-а-а! Беги!'],
    knight: ['Стой, негодяй!', 'Именем короля!', 'К оружию!', 'Ты за это ответишь!', 'Взять его!'],
    king: ['Стража! Ко мне!', 'Как ты смеешь?!', 'Рыцари! Защитите своего короля!'],
    hurt: ['Ай!', 'За что?!', 'Ох...', 'Больно же!'],
    bump: ['Эй! Ты чего?!', 'Ай! Осторожнее!', 'Руки-то не распускай!', 'Смотри, куда машешь!'],
    bumpKnight: ['Ещё раз — и пожалеешь.', 'Полегче, странник.', 'Осторожнее с руками.'],
    bow: ['Ваше Величество!', 'Да здравствует король!', 'Слава новому королю!', 'Добро пожаловать, повелитель!'],
    boom: ['Что это было?!', 'Взрыв! Бегите!', 'Стену ломают!', 'Спасайтесь!', 'Стража! Тут колдун!'],
    swear: ['Получай, сволочь!', 'Ах ты ж гад!', 'Чтоб тебя!', 'Вот тебе, зараза!', 'Чёрт тебя дери!', 'Да чтоб ты провалился!', 'На, получи, мерзавец!'],
    thief: ['Ах ты ж ворюга!', 'Положи на место, зараза!', 'Ах ты, сволочь, в мой сундук полез?!', 'Чёрт бы тебя побрал, вор!', 'Ну всё, гад, получишь!', 'Вон из моего дома, паскуда!'],
    thiefSeen: ['Вор! Держи вора!', 'Грабят!', 'Вор в доме!'],
    offended: ['Ну знаешь ли!', 'Я тебе это припомню!', 'Совсем обнаглел?!', 'Ещё раз тронешь — получишь!'],
    fightBack: ['Ах так?! Ну держись!', 'Сам напросился!', 'Ну всё, получишь!', 'Сейчас я тебе покажу!'],
    fightBackKnight: ['Ты за это ответишь!', 'Ну держись, наглец!', 'Сам напросился, странник.'],
    petty: ['Эй! Ты что творишь?!', 'Окно разбил! Кто платить будет?', 'А ну перестань ломать!', 'Совсем совести нет!'],
    investigate: ['Что там грохнуло? За мной!', 'К стене, живо!', 'Кто посмел?! Проверить!'],
    wrecker: ['Вот он, разрушитель!', 'Держи колдуна!', 'Ты сломал нашу стену — ответишь!', 'Взять его, он ломает замок!'],
    captured: ['Король пал! Да здравствует новый король!', 'Мы служим вам, Ваше Величество!'],
    ambient: {
        merchant: ['Свежий хлеб! Подходи!', 'Яблоки, сыр, мясо — всё свежее!', 'Покупайте, не стесняйтесь!', 'Кладите товар на прилавок — куплю!'],
        farmer: ['Урожай нынче хороший...', 'Опять дождя ждём.', 'Эх, спина болит...', 'Пшеница поспела!'],
        builder: ['Стену чинить надо...', 'Где мой молоток?', 'Ещё один дом к зиме поставим.', 'Камня бы побольше.'],
        knight: ['Всё спокойно.', 'Служу королю!', 'Не шали тут.', 'Ночью опять зомби полезут...'],
        king: ['Мой замок — моя крепость.', 'Кто посмел нарушить тишину?', 'Казна сама себя не наполнит.'],
    },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Harm whose kind is done through something else, not straight from the hand (Blame.js: the culprit is not plain). */
export const viaOfKind = (kind) => (kind === 'quake' ? 'quake' : kind === 'fire' ? 'fire' : null);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** Who is villager number `idx` of a castle (always the same). */
export function rosterEntry(def, idx) {
    const seed = (strHash(def.id) ^ Math.imul(idx + 1, 2654435761)) >>> 0;
    const rng = createRng(seed);
    let role;
    const merchants0 = def.knights + 1;
    if (idx === ADVISOR_IDX) role = 'advisor';
    else if (idx === 0) role = 'king';
    else if (idx <= def.knights) role = 'knight';
    else if (idx < merchants0 + def.stalls.length) role = 'merchant';
    else { const r = rng(); role = r < 0.45 ? 'farmer' : r < 0.85 ? 'builder' : 'merchant'; }
    const female = role === 'king' ? false : rng() < (role === 'knight' ? 0.15 : 0.5);
    const name = role === 'king' ? def.king : (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
    const home = def.houses.length ? Math.floor(rng() * def.houses.length) : -1;
    const stall = role === 'merchant' && idx < merchants0 + def.stalls.length ? idx - merchants0 : -1;
    return { idx, role, female, name, home, stall, seed };
}

export function roleTitle(e) {
    return (e.female ? ROLE_NAMES_F : ROLE_NAMES)[e.role];
}

// --------------------------------------------------------------- graph
class Graph {
    constructor(def) {
        this.nodes = def.nodes;
        this.adj = def.nodes.map(() => []);
        for (const [a, b] of def.edges) { this.adj[a].push(b); this.adj[b].push(a); }
        this.byTag = new Map();
        for (const n of def.nodes) {
            if (!n.tag) continue;
            const key = n.tag.startsWith('room:') ? 'room' : n.tag;
            (this.byTag.get(key) || this.byTag.set(key, []).get(key)).push(n.id);
            if (key === 'room') (this.byTag.get(n.tag) || this.byTag.set(n.tag, []).get(n.tag)).push(n.id);
        }
    }

    tagged(tag) { return this.byTag.get(tag) || []; }

    /** The node nearest to a point (on about the same floor). */
    nearest(x, y, z, maxDy = 2.5) {
        let best = -1, bd = Infinity;
        for (const n of this.nodes) {
            if (Math.abs(n.y - y) > maxDy) continue;
            const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
            if (d < bd) { bd = d; best = n.id; }
        }
        return best;
    }

    /** A* from node a to node b → list of node ids (or null). */
    path(a, b) {
        if (a < 0 || b < 0) return null;
        if (a === b) return [a];
        const N = this.nodes;
        const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].y - N[b].y, N[i].z - N[b].z);
        const g = new Map([[a, 0]]), from = new Map();
        const open = [[h(a), a]];
        const closed = new Set();
        while (open.length) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
            const [, cur] = open[bi];
            open[bi] = open[open.length - 1]; open.pop();
            if (cur === b) {
                const out = [b];
                let c = b;
                while (from.has(c)) { c = from.get(c); out.push(c); }
                return out.reverse();
            }
            if (closed.has(cur)) continue;
            closed.add(cur);
            for (const nb of this.adj[cur]) {
                const ng = g.get(cur) + Math.hypot(N[cur].x - N[nb].x, N[cur].y - N[nb].y, N[cur].z - N[nb].z);
                if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); from.set(nb, cur); open.push([ng + h(nb), nb]); }
            }
        }
        return null;
    }
}

// --------------------------------------------------------------- the system
export class CastleLife {
    constructor(game) {
        this.game = game;
        this.castles = new Map(); // id -> runtime {def, graph, awake, active: Map(idx -> v), state, chests}
        this.byId = new Map(); // villager id -> v
        this.states = new Map(); // castle id -> saved state {owner, ownerName, kingDead, killed:Set}
        this._scanT = 0;
        this._netT = 0;
        this._chatT = 4;
        this.enabled = !game.config.map && game.config.mode !== 'test';
        this.talk = new CastleTalk(game, this); // conversations and the market
        this.wizards = new WizardLife(this); // the wizards' towers and the wandering wizards
        this.orders = new VillagerOrders(this); // what the people agreed to do (the king's orders)
        this.fright = new VillagerFear(this); // danger: they hide in houses, run out of the gates, look out, come out (VillagerFear.js)
        this.rebuild = new Rebuild(this); // after it: the builders put the castle back as it was (Rebuild.js)
        this.night = new NightLife(this); // the night: everybody home asleep, only the watch out (NightLife.js)
        this.wanted = new Wanted(); // (host) each player's hidden «wanted level»: how hard the knights and wizards fight them (Wanted.js)
        this.found = new BodyFound(this); // (host) a body found: the alarm, the search for strangers (BodyFound.js)
        this.brainLine = (v) => this.talk.ambientLine(v);
    }

    get auth() { return this.game.authority; }
    get index() { const d = this.game.world?.terrain?.data; return d?.sites || d?.castles || null; } // (castles and wizards' towers)

    /** Who is person number `idx` of a site (a castle's villager or a wizard). */
    _roster(def, idx) { return isWizSite(def) ? wizardRoster(def, idx) : rosterEntry(def, idx); }

    state(id) {
        let s = this.states.get(id);
        if (!s) { s = { owner: null, ownerName: null, kingDead: false, killed: new Set() }; this.states.set(id, s); }
        return s;
    }

    _runtime(def) {
        let cs = this.castles.get(def.id);
        if (!cs) {
            cs = { def, graph: new Graph(def), awake: false, active: new Map(), hostile: new Map(), chests: [], spawnT: 0, reinforced: 0 };
            this.castles.set(def.id, cs);
        }
        return cs;
    }

    // ---------------------------------------------------------- players
    _players() {
        const g = this.game;
        const out = [];
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p) : p); // (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
        const push = (id, p) => { const q = seen(id, p); if (q) out.push({ id, p: q }); };
        if (!g.isDeadLocal && !g.combat?.dead) push(g.localId, g.character.group.position);
        for (const [id, r] of g.remotes) if (!r.dead) push(id, r.position);
        return out;
    }

    _playerPos(id) {
        const g = this.game;
        const seen = (p) => (p && g.invis ? g.invis.aiPos(id === 'local' ? g.localId : id, p) : p); // (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
        if (id === g.localId || id === 'local') return g.isDeadLocal || g.combat?.dead ? null : seen(g.character.group.position);
        const r = g.remotes.get(id);
        return r && !r.dead ? seen(r.position) : null;
    }

    _inLand(def, p, extra = 0) {
        return Math.max(Math.abs(p.x - def.x), Math.abs(p.z - def.z)) <= def.zone + extra;
    }

    // ---------------------------------------------------------- villagers
    _activate(cs, idx, at, job, extra = {}) {
        const def = cs.def;
        if (cs.active.has(idx) || this.state(def.id).killed.has(idx)) return null;
        const e = this._roster(def, idx);
        let look = villagerLook(e.seed, e.role === 'advisor' ? 'merchant' : e.role, e.female, { castleColor: def.color });
        if (e.robe) look.magicRobe = true; // (a wizard's magic robe: Armor.js)
        if (this.game.armor?.wasStripped(def.id + ':' + idx)) look = strippedLook(look); // («Disarmor» took the steel / the plain robe off)
        const model = new VillagerModel(look, { castleColor: def.color });
        this.game.scene.add(model.group);
        const S = WIZ[e.role] ? { hp: WIZ[e.role].hp, armor: WIZ[e.role].ward } : STATS[e.role]; // (a wizard's ward is its armour)
        const v = {
            id: def.id + ':' + idx, cs, idx, entry: e, role: e.role, name: e.name, title: roleTitle(e),
            model, group: model.group, isVillager: true,
            hp: extra.hp ?? S.hp, armor: extra.armor ?? S.armor, maxHp: S.hp, maxArmor: S.armor,
            dead: false, get isDead() { return this.dead; }, damageCooldown: 0, removable: false,
            x: at.x, y: at.y, z: at.z, yaw: at.yaw ?? 0, mode: 'idle', speed: 0,
            job, post: extra.post || null, path: null, pathI: 0, waitT: 0, trips: 0,
            foe: null, fleeFrom: null, fleeT: 0, sayT: 0, bowT: 0, barT: 0, hitT: 0,
            walk: WALK * (0.72 + ((e.seed >>> 4) % 100) / 220), lane: (((e.seed >>> 11) % 100) / 100 - 0.5) * 2.6,
            bubble: null, bar: null, net: null,
        };
        if (e.robe) v.robe = true;
        if (look.unarmored || look.robeOff) v.stripped = true;
        if (look.unarmored) { v.armor = 0; v.maxArmor = 0; } // (a wizard's ward is no steel: it stays)
        if (WIZ[e.role]) this.wizards.init(v);
        v.group.position.set(v.x, v.y + VILLAGER_FOOT_OFFSET, v.z);
        v.group.rotation.y = v.yaw;
        cs.active.set(idx, v);
        this.byId.set(v.id, v);
        return v;
    }

    _deactivate(v) {
        const cs = v.cs;
        if (!v.dead && v.bleed > 0) this.state(cs.def.id).killed.add(v.idx); // (a cut-off limb: bled to death out of sight)
        cs.active.delete(v.idx);
        this.byId.delete(v.id);
        v.removable = true;
        v.model.dispose();
        if (v.bubble) { this.game.scene.remove(v.bubble.sprite); v.bubble.dispose(); }
        if (v.bar) { this.game.scene.remove(v.bar.sprite); v.bar.tex.dispose(); v.bar.sprite.material.dispose(); }
    }

    /** All living villagers near the local player (targets for weapons and fists). */
    targets() {
        const out = [];
        const me = this.game.character.group.position;
        for (const v of this.byId.values()) if (!v.dead && Math.abs(v.x - me.x) < 40 && Math.abs(v.z - me.z) < 40) out.push(v);
        return out;
    }

    // ------------------------------------------------------- wake / sleep
    _scan() {
        const idx = this.index;
        if (!idx) return;
        const players = this._players();
        const seen = new Set();
        for (const pl of players) {
            for (const def of idx.near(pl.p.x, pl.p.z, WAKE)) {
                seen.add(def.id);
                const cs = this._runtime(def);
                if (!cs.awake) this._wake(cs);
            }
        }
        for (const cs of this.castles.values()) {
            if (!cs.awake || seen.has(cs.def.id) || cs.def.kind === 'wander') continue; // (wanderers keep their own pace)
            const far = players.every((pl) => Math.max(Math.abs(pl.p.x - cs.def.x), Math.abs(pl.p.z - cs.def.z)) > cs.def.zone + SLEEP);
            if (far) this._sleep(cs);
        }
    }

    _wake(cs) {
        cs.awake = true;
        this._makeChests(cs);
        if (!this.auth) return;
        const def = cs.def;
        if (isWizSite(def)) { this.wizards.wake(cs); return; } // (no knights: the wizards have their own places)
        if (this.night?.staffNight(cs)) return; // (at night: only the watch is out — NightLife.js)
        this._staffDay(cs);
    }

    /** (host) The castle's people at their day places (those not out already). */
    _staffDay(cs) {
        const def = cs.def;
        const st = this.state(def.id);
        let k = 1; // knights by number
        const knight = (at, job, post) => { while (k <= def.knights && (st.killed.has(k) || cs.active.has(k))) k++; if (k > def.knights) return null; return this._activate(cs, k++, at, job, { post }); };
        // the king on his throne
        if (!st.kingDead) this._activate(cs, 0, def.throne, 'king', { post: def.throne });
        // two knights by the throne, guards at the gate, two on the walls, two in the yard
        const tf = def.throneFront;
        for (const side of [-1, 1]) {
            const g = cs.graph.nodes[cs.graph.tagged('throneFront')[0]];
            const sx = Math.cos(def.throne.yaw) * 4 * side, sz = -Math.sin(def.throne.yaw) * 4 * side;
            const at = { x: (g ? g.x : tf.x) + sx, y: tf.y, z: (g ? g.z : tf.z) + sz, yaw: def.throne.yaw };
            knight(at, 'guard', at);
            // the king's advisor: by the throne, a little to the side (serves whoever is king)
            if (side === 1) { const a = { ...at, x: at.x - sx / 2, z: at.z - sz / 2 }; this._activate(cs, ADVISOR_IDX, a, 'guard', { post: a }); }
        }
        for (const post of def.posts) knight(post, 'guard', post);
        const loop = def.wallWalk || [];
        for (let i = 0; i < Math.min(2, Math.floor(loop.length / 6)); i++) {
            const n = cs.graph.nodes[loop[Math.floor(i * loop.length / 2)]];
            const v = knight({ x: n.x, y: n.y, z: n.z }, 'patrol');
            if (v) v.loopI = Math.floor(i * loop.length / 2);
        }
        for (const id of cs.graph.tagged('yard').concat(cs.graph.tagged('well')).slice(0, 2)) {
            const n = cs.graph.nodes[id];
            knight({ x: n.x, y: n.y, z: n.z }, 'yard');
        }
        // the merchants at their stalls
        def.stalls.forEach((s, i) => this._activate(cs, def.knights + 1 + i, { ...s.back, yaw: s.yaw }, 'stall', { post: { ...s.back, yaw: s.yaw } }));
        // farmers in a few fields
        let f = 0;
        for (const field of def.fields.slice(0, 4)) {
            const idx = this._freeCommoner(cs, 'farmer');
            if (idx < 0) break;
            const v = this._activate(cs, idx, { x: field.x, y: field.y, z: field.z }, 'farm');
            if (v) { v.fieldNode = field.node; f++; }
        }
    }

    _sleep(cs) {
        cs.awake = false;
        for (const v of [...cs.active.values()]) this._deactivate(v);
    }

    _makeChests(cs) {
        const g = this.game;
        if (cs.chestsMade) return;
        cs.chestsMade = true;
        const st = this.state(cs.def.id);
        for (const c of cs.def.chests) {
            if (g.chests.some((x) => x.id === c.id) || g.burnWreck?.burnt.has(c.id)) continue; // (burnt down: BurnWreck.js)
            const cy = Math.min(c.y, floorUnder(g.world?.terrain?.data, c.x, c.y, c.z) ?? c.y); // (its floor blown away: lower)
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, cy, c.z), 'loot', c.yaw, c.id, { scale: c.scale });
            if (c.gap != null) chest.setWallGap(c.gap); // (its lid leans on the wall behind it)
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.locked = !st.kingDead;
            chest.castle = cs.def;
            chest.room = c.room;
            g.chests.push(chest);
            if (g._openedChests?.has(c.id)) chest.setOpenInstant();
            else g.locks?.restoreChest(chest); // (unlocked by «Алохомора» before)
            cs.chests.push(chest);
        }
    }

    /** A roster number of a commoner of the wanted role who is not out now. */
    _freeCommoner(cs, role = null) {
        const def = cs.def;
        const st = this.state(def.id);
        const first = def.knights + 1 + def.stalls.length;
        const n = Math.max(first + 1, def.population);
        for (let tries = 0; tries < 30; tries++) {
            const idx = first + Math.floor(Math.random() * (n - first));
            if (cs.active.has(idx) || st.killed.has(idx)) continue;
            if (role && this._roster(def, idx).role !== role) continue;
            return idx;
        }
        return -1;
    }

    /** Keep a crowd round the players: people come out of houses and go about. */
    _crowd(cs, dt) {
        const def = cs.def;
        cs.spawnT -= dt;
        if (cs.spawnT > 0) return;
        cs.spawnT = 0.7;
        const players = this._players().filter((pl) => this._inLand(def, pl.p, 40));
        if (!players.length) return;
        if (this.fright.quietFor(cs) < 40) return; // (danger about: nobody comes out of the houses now)
        // (a weaker computer — fewer people round you; fewer at night)
        const q = [0.45, 0.65, 0.85, 1][this.game.quality?.level ?? 3] ?? 1;
        const want = Math.round(Math.min(22, 7 + def.population / 55) * (this.night?.crowdK() ?? 1) * q); // (at night nobody: NightLife.js)
        let count = 0;
        for (const v of cs.active.values()) if (v.job === 'wander' && !v.dead) count++;
        // too far from everyone: goes home (disappears)
        for (const v of [...cs.active.values()]) {
            if (v.job !== 'wander' || v.foe) continue;
            const near = players.some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 100);
            if (!near) { this._deactivate(v); count--; }
        }
        if (count >= want) return;
        // someone comes out of a house (or walks in along a road) 25-70 m away from a player
        const pl = players[Math.floor(Math.random() * players.length)];
        const homes = cs.graph.tagged('home');
        let node = -1;
        for (let t = 0; t < 12; t++) {
            const id = homes[Math.floor(Math.random() * homes.length)];
            const n = cs.graph.nodes[id];
            const d = Math.hypot(n.x - pl.p.x, n.z - pl.p.z);
            if (d > 22 && d < 70) { node = id; break; }
        }
        if (node < 0) return;
        const idx = this._freeCommoner(cs);
        if (idx < 0) return;
        const n = cs.graph.nodes[node];
        const v = this._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'wander');
        if (v) {
            v.node = node; v.trips = 1 + Math.floor(Math.random() * 3);
            // some come out and stand at the door a while first (not everybody marching at once)
            if (Math.random() < 0.45) v.waitT = 4 + Math.random() * 14; else this._nextTrip(v);
        }
    }

    // ------------------------------------------------------------ moving
    _goTo(v, node) {
        const g = v.cs.graph;
        const from = v.node != null && v.node >= 0 && Math.hypot(g.nodes[v.node].x - v.x, g.nodes[v.node].z - v.z) < 3 ? v.node : g.nearest(v.x, v.y, v.z);
        const path = g.path(from, node);
        v.path = path;
        v.pathI = 0;
        v.goal = node;
        return !!path;
    }

    /** A wanderer picks where to go next (or goes home at the end). */
    _nextTrip(v) {
        if (v.wizard && this.wizards.nextTrip(v)) return;
        const g = v.cs.graph;
        if (v.trips <= 0) { v.goingHome = true; this._goTo(v, this._homeNode(v)); return; }
        v.trips--;
        const r = Math.random();
        const choose = (tag) => { const l = g.tagged(tag); return l.length ? l[Math.floor(Math.random() * l.length)] : -1; };
        let node = -1;
        // people go to people: join somebody standing about (a chat)
        if (r < 0.3) {
            const idle = [...v.cs.active.values()].filter((o) => o !== v && !o.dead && o.job === 'wander' && o.waitT > 6 && Math.hypot(o.x - v.x, o.z - v.z) < 60);
            if (idle.length) {
                const o = idle[Math.floor(Math.random() * idle.length)];
                const n = g.nearest(o.x, o.y, o.z);
                if (n >= 0) { v.purpose = 'chat'; v.chatWith = o; this._goTo(v, n); return; }
            }
        }
        if (v.role === 'farmer' && r < 0.5) node = choose('field');
        else if (r < 0.32) node = choose('stall');
        else if (r < 0.42) node = choose('market');
        else if (r < 0.5) node = choose('well');
        else if (r < 0.6) node = choose('yard');
        else if (r < 0.68) node = choose('room');
        else if (r < 0.78 && v.cs.def.port) node = choose(Math.random() < 0.5 ? 'pier' : 'quay'); // (a sea castle: down to the port)
        else node = choose('home');
        if (node < 0) node = choose('home');
        v.purpose = g.nodes[node]?.tag || '';
        this._goTo(v, node);
    }

    _homeNode(v) {
        const own = v.cs.def.houses[v.entry.home];
        if (own && own.homeNode != null) return own.homeNode;
        const homes = v.cs.graph.tagged('home');
        return homes.length ? homes[Math.abs(v.entry.home) % homes.length] : v.cs.graph.nearest(v.x, v.y, v.z);
    }

    /** One step along the path; true when the end is reached. */
    _followPath(v, dt, speed) {
        speed *= v.legK ?? 1; // (a leg cut off: hopping / crawling — Dismember.js)
        const g = v.cs.graph;
        if (!v.path || v.pathI >= v.path.length) return true;
        const n = g.nodes[v.path[v.pathI]];
        // outdoors everybody keeps to their own side of the road (no walking in single file);
        // in the castle, doors and rooms — right along the path
        let tx = n.x, tz = n.z;
        const last = v.pathI >= v.path.length - 1;
        if (v.lane && !last && v.pathI > 0 && !this._inWalls(v.cs.def, n)) {
            const pn = g.nodes[v.path[v.pathI - 1]];
            const sx = n.x - pn.x, sz = n.z - pn.z, sl = Math.hypot(sx, sz);
            if (sl > 3 && Math.abs(n.y - pn.y) < 0.5) { tx += -sz / sl * v.lane; tz += sx / sl * v.lane; }
        }
        const dx = tx - v.x, dz = tz - v.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) { v.node = v.path[v.pathI]; v.pathI++; return v.pathI >= v.path.length; }
        const s = Math.min(d, speed * slowFactor(v) * dt);
        v.x += dx / d * s; v.z += dz / d * s;
        v.yaw = turn(v.yaw, Math.atan2(-dx, -dz), dt * 8);
        v.speed = speed;
        return false;
    }

    /** Inside the castle walls (where paths are narrow: doors, stairs, rooms). */
    _inWalls(def, p) {
        const w = def.walls;
        if (!w) return false; // (a wanderers' «site»: no walls)
        return p.x >= w.x0 - 2 && p.x <= w.x1 + 2 && p.z >= w.z0 - 2 && p.z <= w.z1 + 2;
    }

    /** Straight towards a point (a fight); stops at walls. */
    _steer(v, tx, tz, speed, dt, stopAt = 0) {
        speed *= v.legK ?? 1; // (a leg cut off)
        const dx = tx - v.x, dz = tz - v.z;
        const d = Math.hypot(dx, dz);
        v.yaw = turn(v.yaw, Math.atan2(-dx, -dz), dt * 10);
        if (d <= stopAt) { v.speed = 0; return d; }
        const s = Math.min(d - stopAt, speed * slowFactor(v) * dt);
        // a ledge right ahead (half a body high): climb it rather than inch at it
        if (!this._walkable(v.x + dx / d * 0.75, v.z + dz / d * 0.75, v.y) && this._tryClimb(v, dx / d, dz / d)) { v.speed = 0; return d; }
        // somebody in the way (a player, another person, an animal): round them on the side with room;
        // in a narrow spot wait a moment for them to move (then squeeze past)
        let ux = dx / d, uz = dz / d;
        if (speed > 0) {
            const others = this._othersNear(v);
            if (others.length) {
                const a = avoidStep(v, { x: ux, z: uz }, others, { maxF: d - stopAt - 0.2, room: (x, z) => this._walkable(x, z, v.y) });
                if (a.wait && (v.waitT = (v.waitT || 0) + dt) < 1.6) { v.speed = 0; return d; }
                if (!a.wait) v.waitT = 0;
                ux = a.x; uz = a.z;
            }
        }
        const nx = v.x + ux * s, nz = v.z + uz * s;
        // (the body has a thickness: the shoulder never goes into a wall — a step's room is looked at a little ahead)
        const B = BODY_R;
        if (this._walkable(nx, nz, v.y) && this._walkable(nx + ux * B, nz + uz * B, v.y)) { v.x = nx; v.z = nz; v.speed = speed; }
        else if (Math.abs(ux) > 0.05 && this._walkable(nx, v.z, v.y) && this._walkable(nx + Math.sign(ux) * B, v.z, v.y)) { v.x = nx; v.speed = speed; }
        else if (Math.abs(uz) > 0.05 && this._walkable(v.x, nz, v.y) && this._walkable(v.x, nz + Math.sign(uz) * B, v.y)) { v.z = nz; v.speed = speed; }
        else if (this._tryClimb(v, dx / d, dz / d)) v.speed = 0;
        else {
            // a wall ahead too high to climb: try round it (along the wall, either way)
            v.speed = 0;
            const a0 = Math.atan2(dz, dx);
            for (const da of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
                const ax = Math.cos(a0 + da), az = Math.sin(a0 + da);
                if (this._walkable(v.x + ax * s, v.z + az * s, v.y) && this._walkable(v.x + ax * (s + B), v.z + az * (s + B), v.y)) { v.x += ax * s; v.z += az * s; v.speed = speed; break; }
                if (Math.abs(da) <= 1.6 && this._tryClimb(v, ax, az)) break;
            }
        }
        return d;
    }

    /** Bodies near this walker it must not walk into: people, players, animals (once a frame, then filtered). */
    _othersNear(v) {
        const g = this.game;
        const f = g.frameCount ?? 0;
        if (this._bodiesF !== f || !this._bodies) {
            this._bodiesF = f;
            const B = this._bodies = [];
            for (const o of this.byId.values()) if (!o.dead && !o.seated && !o.climb && o.group?.visible !== false) B.push({ x: o.x, y: o.y, z: o.z, r: o.role === 'knight' || o.role === 'king' ? 0.7 : 0.5, ref: o });
            const me = g.character?.group.position;
            if (me && !g.isDeadLocal) B.push({ x: me.x, y: me.y - 1.95, z: me.z, r: 0.6, ref: null });
            for (const [, r] of g.remotes || []) if (!r.dead) B.push({ x: r.position.x, y: r.position.y - 1.95, z: r.position.z, r: 0.6, ref: null });
            for (const a of g.animals?.list || []) if (!a.dead) B.push({ x: a.group.position.x, y: a.group.position.y, z: a.group.position.z, r: 0.9 * (a.group.scale.x || 1), ref: a });
        }
        const out = [];
        for (const b of this._bodies) {
            if (b.ref === v || Math.abs(b.x - v.x) > 3.5 || Math.abs(b.z - v.z) > 3.5 || Math.abs(b.y - v.y) > 2.5) continue;
            out.push(b);
        }
        return out;
    }

    /**
     * A ledge ahead (the side of a crater, a wall of 2–3 blocks — up to about half
     * a body): grab the edge and climb up. Higher than that: no way.
     */
    _tryClimb(v, nx, nz) {
        const t = this.game.world?.terrain?.data;
        if (!t || v.climb) return false;
        const L = Math.round(v.y + 1.5); // the air layer the feet stand in
        const ax = Math.round(v.x + nx * 1.1), az = Math.round(v.z + nz * 1.1);
        if (ax === Math.round(v.x) && az === Math.round(v.z)) return false;
        const f = t.floorBelow(ax, az, L + 4);
        const rise = f - (L - 1);
        if (rise < 2 || rise > 3) return false;
        if (t.solidIn(ax, az, f + 1, f + 5)) return false; // (no room on top)
        v.climb = { t: 0, dur: 0.7 + rise * 0.45, x0: v.x, y0: v.y, z0: v.z, x1: ax, y1: f - 0.5, z1: az };
        v.yaw = Math.atan2(-nx, -nz);
        return true;
    }

    /** Climbing out: hands on the edge, pull up, a knee over, stand up on top. */
    _climbStep(v, dt) {
        const c = v.climb;
        c.t += dt;
        const k = Math.min(1, c.t / c.dur);
        const up = k < 0.75 ? k / 0.75 : 1;
        const fwd = k < 0.55 ? 0.15 * (k / 0.55) : 0.15 + 0.85 * ((k - 0.55) / 0.45);
        v.y = c.y0 + (c.y1 - c.y0) * (up * up * (3 - 2 * up));
        v.x = c.x0 + (c.x1 - c.x0) * fwd;
        v.z = c.z0 + (c.z1 - c.z0) * fwd;
        v.mode = 'climb';
        v.speed = 0;
        if (k >= 1) v.climb = null;
    }

    /**
     * The body stuck in a wall (the chest in solid blocks for a while — a riser of a stair is
     * no wall): it steps out to the nearest free cell on about its level. True when it moved.
     */
    _unwall(v) {
        const t = this.game.world?.terrain?.data;
        if (!t) return false;
        const ix = Math.round(v.x), iz = Math.round(v.z), L = Math.round(v.y + 1.5);
        if (!t.solidIn(ix, iz, L + 1, L + 2)) { v.inWall = 0; return false; }
        if ((v.inWall = (v.inWall || 0) + 1) < 2) return false; // (twice in a row: not a moment on a step)
        for (let r = 1; r <= 3; r++) {
            let best = null, bd = Infinity;
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const x = ix + dx, z = iz + dz;
                const f = t.floorBelow(x, z, L + 2);
                const y = f - 0.5;
                if (Math.abs(y - v.y) > 1.6 || !this._walkable(x, z, y)) continue;
                const d = Math.hypot(x - v.x, z - v.z);
                if (d < bd) { bd = d; best = { x, y, z }; }
            }
            if (best) { v.x = best.x; v.z = best.z; v.y = best.y; v.path = null; v.inWall = 0; return true; }
        }
        return false;
    }

    _walkable(x, z, y) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const ix = Math.round(x), iz = Math.round(z);
        const L = Math.round(y + 1.5);
        const f = t.floorBelow(ix, iz, L + 1);
        if (f > L || f < L - 3) return false;
        if (this.game.carriages?.list.size && this.game.carriages.blocksAt(x, z, y)) return false; // (a cart on the road: round it)
        return !t.solidIn(ix, iz, f + 1, f + 5);
    }

    /** A body flying through the air may be at (x, z): no wall, no block where its body is. */
    _airFree(x, z, y) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const L = Math.round(y + 1.5);
        return !t.solidIn(Math.round(x), Math.round(z), L, L + 2);
    }

    _ground(v) {
        const c = this.game.collision;
        const gy = c.groundAt ? c.groundAt(v.x, v.z, v.y + 1.1) : c.groundY(v.x, v.z);
        v.y += (gy - v.y) * (gy > v.y ? 1 : 0.5);
    }

    /**
     * A dead body is never left in the air: killed while flying, or the floor under it broken
     * (a blast, a ruin) — it falls by the same physics down to the ground, the water or a floor
     * that still stands, and lies there (its body in Death.js goes with it).
     */
    _deadFall(v, dt) {
        if (v.lev) return; // (held up by «Левиоса»: the magic carries it)
        if (!v.vy) {
            v.supT = (v.supT || 0) - dt;
            if (v.supT > 0) return;
            v.supT = 0.25;
            const c = this.game.collision;
            const gy = c?.groundAt ? c.groundAt(v.x, v.z, v.y + 1.1) : c?.groundY?.(v.x, v.z);
            if (gy == null || v.y <= gy + 0.05) return;
            v.vy = -0.01; // (nothing under it: it starts to fall)
        }
        this._fallStep(v, dt);
        if (!v.vy) this.game.death?.settle?.('v', v.id, v.x, v.y, v.z); // (it lies here now)
    }

    /** Thrown up / let go in the air: flies on with its swing and falls. */
    _fallStep(v, dt) {
        const g = this.game;
        v.y += v.vy * dt; v.vy -= 22 * dt;
        if (v.vx || v.vz) {
            const nx = v.x + (v.vx || 0) * dt, nz = v.z + (v.vz || 0) * dt;
            // a wall stops a flying body (it does not go through: it strikes it — Levitation counts the blow)
            const t = g.terrain?.data;
            if (t?.isSolidAt && (t.isSolidAt(nx, v.y + 1.2, nz) || t.isSolidAt(nx, v.y + 2.8, nz))) { v.vx = 0; v.vz = 0; }
            else { v.x = nx; v.z = nz; }
            const k = Math.max(0, 1 - 0.6 * dt);
            v.vx = (v.vx || 0) * k; v.vz = (v.vz || 0) * k;
        }
        const gy = g.collision.groundAt ? g.collision.groundAt(v.x, v.z, v.y + 1.1) : g.collision.groundY(v.x, v.z);
        if (v.y <= gy && v.vy < 0) { v.y = gy; v.vy = 0; v.vx = 0; v.vz = 0; v.flyFlail = false; }
    }

    // ------------------------------------------------------------- think
    _think(v, dt) {
        const g = this.game;
        const cs = v.cs;
        v.damageCooldown -= dt;
        v.sayT -= dt;
        tickSlow(v, dt); // («Даст»: slowed for a while)
        if (v.wizard && v.fx) this.wizards?.fight?.lostFocus(v); // (stunned / lifted / dead: his concentration is gone)
        if (v.dead) { v.deadT = (v.deadT || 0) + dt; this._deadFall(v, dt); if (v.deadT > 50) this._deactivate(v); return; }
        if (v.sleep && this.night?.step(v, dt)) return; // (going to bed, asleep, getting up — NightLife.js)
        // held up by «Вингардиум Левиоса»: Levitation carries the body
        if (v.lev) { v.mode = v.lev.body ? 'dead' : 'flail'; v.speed = 0; return; } // (kicking in the air: VillagerModel 'flail')
        // stunned / frozen / thrown up by a spell
        if (v.stunT > 0 || v.vy) {
            v.stunT = (v.stunT || 0) - dt;
            if (v.vy) this._fallStep(v, dt);
            v.mode = v.flyFlail ? 'flail' : 'idle'; v.speed = 0; // (thrown by «Левиоса»: arms and legs going as it flies)
            return;
        }
        if (v.climb) { this._climbStep(v, dt); return; }
        // riding on a cart: on its seat (the cart's people get down when trouble comes — Travelers.js)
        if (v.seated && v.job === 'cart' && !v.foe && !v.fear && !(v.fleeT > 0) && g.travelers?.step(v, dt)) return;
        // got inside a wall somehow (a shove, a blink, a blast that moved the blocks): out to the nearest free place
        if (!v.seated && (v.wallT = (v.wallT || 0) - dt) <= 0) { v.wallT = 0.5; this._unwall(v); }
        // a great fire close by (the Hellfire): back off from it behind the shield, or run (fear())
        if (v.fireT > 0 && this._fireStep(v, dt)) return;
        // «Брейнрот»: a servant follows its master and fights for them
        if (v.servantOf != null && this._serve(v, dt)) return;
        if (v.wizard && this.wizards.think(v, dt)) return; // (a wizard: its own fight and magic)
        // a hostile player in sight: knights go for them
        if (this._fights(v) && !v.foe) {
            v.lookT = (v.lookT || 0) - dt;
            if (v.lookT <= 0) {
                v.lookT = 0.6;
                for (const [pid, until] of cs.hostile) {
                    if (until < Date.now()) { cs.hostile.delete(pid); continue; }
                    const p = this._playerPos(pid);
                    // (just given up on them out there: only if they come back near)
                    if (p && v.gaveUp?.id === pid && v.gaveUp.until > Date.now() && (Math.hypot(p.x - v.x, p.z - v.z) > 12 || !this._inLand(cs.def, p, 30))) continue;
                    if (p && Math.hypot(p.x - v.x, p.z - v.z) < 26 && this._sees(v, p)) { v.foe = pid; this._say(v, pick(v.wizard ? WIZ_SHOUT.fight : SHOUT.knight)); break; }
                }
                // a body was found here: every stranger about is a suspect (BodyFound.js)
                if (!v.foe) this.found.suspect(v);
            }
        }
        // a timid wizard (a student who doesn't fight) and an enemy of the tower close by: away from him
        if (v.wizard && !v.foe && !this._fights(v) && !(v.fleeT > 0) && cs.hostile.size) {
            v.lookT = (v.lookT || 0) - dt;
            if (v.lookT <= 0) {
                v.lookT = 0.6;
                for (const [pid, until] of cs.hostile) {
                    if (until < Date.now()) continue;
                    const p = this._playerPos(pid);
                    if (p && Math.hypot(p.x - v.x, p.z - v.z) < 24 && this._sees(v, p)) { v.fleeT = 10; v.fleeFrom = pid; v.fleeing = false; v.seated = false; v.job = v.job === 'desk' ? 'wander' : v.job; this._say(v, pick(SHOUT.help)); break; }
                }
            }
        }
        if (v.foe) { this._fight(v, dt); return; }
        if (v.order && this.orders.step(v, dt)) return; // (the king's orders: hunt, defend)
        if (v.investigate && this._investigate(v, dt)) return;
        if (this.fright.step(v, dt)) return; // (danger near: hiding, running away, looking out, buckets)
        if (v.job === 'rebuild' && this.rebuild.work(v, dt)) return; // (a builder at the repairs)
        if ((v.pack > 0 || v.rounds) && this.night?.duty(v, dt)) return; // (a merchant packing up, the watch's rounds)
        if (v.fleeT > 0) {
            v.fleeT -= dt;
            const fp = v.fleeFrom ? this._playerPos(v.fleeFrom) : v.fleeAt || null; // (from a player — or from a place: a blast)
            // run away along the paths: to a place far from the attacker (home, the gate, the market…)
            if (!v.fleeing && fp) {
                v.fleeing = true;
                const g2 = cs.graph;
                let best = -1, bs = -Infinity;
                for (let k = 0; k < 16; k++) {
                    const n = g2.nodes[Math.floor(Math.random() * g2.nodes.length)];
                    if (!n || Math.abs(n.y - v.y) > 6) continue; // (a wanderer on the road: no paths)
                    const away = Math.hypot(n.x - fp.x, n.z - fp.z), mine = Math.hypot(n.x - v.x, n.z - v.z);
                    const s = away - 0.4 * mine + (n.tag === 'home' ? 15 : 0);
                    if (away > 25 && s > bs) { bs = s; best = n.id; }
                }
                if (best >= 0) this._goTo(v, best);
            }
            if (v.path && v.pathI < (v.path?.length || 0)) this._followPath(v, dt, RUN);
            else if (fp && (Math.hypot(fp.x - v.x, fp.z - v.z) < 10 || !cs.graph.nodes.length)) this._steer(v, v.x + (v.x - fp.x), v.z + (v.z - fp.z), RUN, dt);
            else v.speed = 0;
            v.mode = v.speed > 0 ? 'flee' : 'idle';
            this._ground(v);
            if (v.fleeT <= 0) { v.fleeFrom = null; v.fleeAt = null; v.fleeing = false; v.path = null; if (v.job === 'wander') this._nextTrip(v); }
            return;
        }
        // the new king comes by: bow
        const st = this.state(cs.def.id);
        if (st.owner && v.bowT <= 0) {
            const op = this._playerPos(st.owner);
            if (op && Math.hypot(op.x - v.x, op.z - v.z) < 6) {
                v.bowT = 40;
                v.bowing = 1.6;
                v.yaw = Math.atan2(-(op.x - v.x), -(op.z - v.z));
                if (!this.talk.inTalk?.()) this._say(v, pick(SHOUT.bow)); // (a bow, but no cry in the middle of my talk)
            }
        }
        v.bowT -= dt;
        if (v.bowing > 0) { v.bowing -= dt; v.mode = 'bow'; v.speed = 0; return; }
        if (v.giveT > 0) { v.giveT -= dt; v.mode = 'offer'; v.speed = 0; this._ground(v); return; } // (a merchant's hand out for the coins)
        // talking with a player: stops and looks at them (the king keeps his seat)
        if (v.talking > 0 && v.job !== 'king') {
            const tp = this._playerPos(v.talkTo || g.localId);
            if (tp) v.yaw = turn(v.yaw, Math.atan2(-(tp.x - v.x), -(tp.z - v.z)), dt * 6);
            v.mode = 'talk'; v.speed = 0;
            // (a comfortable distance for a talk: too close — a small step back, still facing me)
            const dd = tp ? Math.hypot(tp.x - v.x, tp.z - v.z) : 9;
            if (dd < 1.9 && dd > 1e-3 && v.job !== 'stall') {
                const s = Math.min(1.9 - dd, 0.9 * dt), nx = v.x + (v.x - tp.x) / dd * s, nz = v.z + (v.z - tp.z) / dd * s;
                if (this._walkable(nx, nz, v.y)) { v.x = nx; v.z = nz; }
            }
            this._ground(v);
            return;
        }
        // following a player who asked («иди за мной»)
        if (v.follow) {
            v.followT -= dt;
            const fp = this._playerPos(v.follow);
            if (!fp || v.followT <= 0 || (!v.followFar && !this._inLand(cs.def, fp, 20))) { v.follow = null; v.followFar = false; v.path = null; }
            else {
                const d = this._steer(v, fp.x, fp.z, Math.hypot(fp.x - v.x, fp.z - v.z) > 8 ? RUN : WALK, dt, 3);
                v.mode = d > 3.2 ? (v.speed > WALK ? 'run' : 'walk') : 'idle';
                this._ground(v);
                return;
            }
        }
        if (WIZ_JOBS.has(v.job)) { this.wizards.job(v, dt); return; } // (the wizards' places: chair, lectern, cauldron…)
        switch (v.job) {
            case 'king':
            case 'guard':
            case 'stall': {
                const p = v.post;
                const d = Math.hypot(p.x - v.x, p.z - v.z);
                if (d > 1.5) {
                    if (!v.path) this._goTo(v, v.cs.graph.nearest(p.x, p.y, p.z));
                    if (this._followPath(v, dt, WALK)) { v.path = null; this._steer(v, p.x, p.z, WALK, dt); }
                    v.mode = 'walk';
                } else {
                    v.x += (p.x - v.x) * Math.min(1, dt * 4); v.z += (p.z - v.z) * Math.min(1, dt * 4);
                    v.yaw = turn(v.yaw, p.yaw, dt * 4);
                    v.speed = 0;
                    v.path = null;
                    v.mode = v.job === 'king' ? 'sit' : v.talking > 0 ? 'talk' : 'idle';
                    if (v.job === 'king') { v.y = p.y; v.seated = true; return; }
                }
                v.seated = false;
                break;
            }
            case 'home': {
                // at home: pottering about the room, now and then a few steps
                const p = v.homeAt;
                if (Math.hypot(p.x - v.x, p.z - v.z) > 5) {
                    // (back from a fight / a run: along the paths, through the door)
                    if (!v.path) this._goTo(v, this._homeNode(v));
                    if (this._followPath(v, dt, WALK)) v.path = null;
                    v.mode = 'walk';
                    break;
                }
                if (v.waitT > 0) { v.waitT -= dt; v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle'; break; }
                if (!v.spot) v.spot = { x: p.x + (Math.random() - 0.5) * 3, z: p.z + (Math.random() - 0.5) * 3 };
                const d = this._steer(v, v.spot.x, v.spot.z, WALK * 0.6, dt, 0.4);
                v.mode = v.speed > 0 ? 'walk' : 'idle';
                if (d < 0.5 || v.speed === 0) { v.spot = null; v.waitT = 6 + Math.random() * 14; }
                break;
            }
            case 'patrol': {
                const loop = v.cs.def.wallWalk;
                if (!v.path || v.pathI >= v.path.length) {
                    v.loopI = ((v.loopI ?? 0) + 1) % loop.length;
                    this._goTo(v, loop[v.loopI]);
                }
                this._followPath(v, dt, WALK * 0.8);
                v.mode = 'walk';
                break;
            }
            case 'yard': {
                if (v.waitT > 0) { v.waitT -= dt; v.mode = 'idle'; v.speed = 0; break; }
                if (!v.path || this._followPath(v, dt, WALK * 0.8)) {
                    if (v.path) { v.waitT = 4 + Math.random() * 8; v.path = null; break; }
                    const g2 = v.cs.graph;
                    const options = g2.tagged('yard').concat(g2.tagged('well'), g2.tagged('gateIn'), g2.tagged('keepDoor'), g2.tagged('barracksDoor'));
                    this._goTo(v, options[Math.floor(Math.random() * options.length)]);
                }
                v.mode = v.path ? 'walk' : 'idle';
                break;
            }
            case 'road':
            case 'cart': // (the people of the roads: on foot or on a cart — Travelers.js)
                if (g.travelers?.step(v, dt)) return;
                break;
            case 'farm': {
                if (v.waitT > 0) { v.waitT -= dt; v.mode = 'work'; v.speed = 0; break; }
                if (!v.path) {
                    const fields = v.cs.graph.tagged('field');
                    this._goTo(v, fields[Math.floor(Math.random() * fields.length)]);
                }
                if (this._followPath(v, dt, WALK)) { v.path = null; v.waitT = 15 + Math.random() * 25; }
                v.mode = v.path ? 'walk' : 'work';
                break;
            }
            default: { // wander
                if (v.waitT > 0) {
                    v.waitT -= dt;
                    v.speed = 0;
                    // somebody close by: they talk (turned to each other, hands going)
                    v.chatT = (v.chatT || 0) - dt;
                    if (v.chatT <= 0) {
                        v.chatT = 1.5;
                        v.mate = null;
                        for (const o of v.cs.active.values()) if (o !== v && !o.dead && !o.foe && Math.hypot(o.x - v.x, o.z - v.z) < 4.5 && (o.waitT > 0 || o.job !== 'wander')) { v.mate = o; break; }
                    }
                    if (v.mate) v.yaw = turn(v.yaw, Math.atan2(-(v.mate.x - v.x), -(v.mate.z - v.z)), dt * 3);
                    v.mode = v.talking > 0 || v.mate ? 'talk' : v.purpose === 'field' ? 'work' : (v.role === 'builder' && v.purpose === 'home' ? 'work' : 'idle');
                    if (v.waitT <= 0) this._nextTrip(v);
                    break;
                }
                if (!v.path) { this._nextTrip(v); if (!v.path) { v.waitT = 3; break; } }
                if (this._followPath(v, dt, v.walk || WALK)) {
                    v.path = null;
                    if (v.goingHome) { if (!this.night?.arriveHome(v)) this._deactivate(v); return; } // went into the house (at night: to bed)
                    // they stay a good while where they came (shopping, chatting, working)
                    v.waitT = v.purpose === 'chat' ? 15 + Math.random() * 30 : 10 + Math.random() * 35;
                    if (v.purpose === 'chat' && v.chatWith && !v.chatWith.dead) v.chatWith.waitT = Math.max(v.chatWith.waitT, 12);
                }
                v.mode = 'walk';
            }
        }
        this._ground(v);
    }

    /** A servant of «Брейнрот»: after its master, at the master's enemies. */
    _serve(v, dt) {
        const g = this.game;
        const sv = g.servants?.plan('v', v, _v.set(v.x, v.y, v.z), 2.6);
        if (!sv) return false;
        v.foe = null; v.fleeT = 0; v.seated = false; v.investigate = null;
        v.serveT = (v.serveT || 0) - dt;
        if (sv.mode === 'strike') {
            const e = sv.enemy;
            this._steer(v, e.x, e.z, 0, dt, 9); // (turned to the enemy)
            v.speed = 0;
            v.mode = 'attack';
            if (v.serveT <= 0) {
                v.serveT = 1.1;
                g.servants.damage(e, STATS[v.role]?.dmg || 1, _v2.set(e.x - v.x, 0, e.z - v.z).normalize(), v.servantOf);
            }
        } else if (sv.mode === 'stay') {
            v.speed = 0;
            v.mode = 'idle';
        } else {
            v.path = null;
            this._steer(v, sv.x, sv.z, sv.mode === 'chase' ? RUN : WALK * 1.3, dt, 0.3);
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        }
        this._ground(v);
        return true;
    }

    _fight(v, dt) {
        const cs = v.cs;
        const fp = this._playerPos(v.foe);
        const d = fp ? Math.hypot(fp.x - v.x, fp.z - v.z) : Infinity;
        // they don't stop at the edge of their land: only when the enemy got well
        // away from them (~20 m) beyond it — or very far from the castle
        const gone = !fp || (!this._inLand(cs.def, fp, 30) && (d > LEASH || !this._inLand(cs.def, fp, 160)));
        // (the whole castle against them — or only this one, angry at this player: a blow, a theft)
        const grudge = v.grudge && v.grudge.id === v.foe && v.grudge.until > Date.now();
        if (gone || !(cs.hostile.get(v.foe) > Date.now() || grudge)) {
            if (fp && gone) v.gaveUp = { id: v.foe, until: Date.now() + 15000 }; // (not straight back at them)
            v.foe = null; v.path = null; v.chaseT = 0; v.grudge = null;
            return;
        }
        v.seated = false;
        // the squad's plan gives some of them other work than the sword: bows, holding the ways
        // down, climbing up, an ambush, a runner, the king's guard (KnightTactics)
        if (v.tac && !MELEE.has(v.tac.role) && this._tacStep(v, fp, d, dt)) return;
        const style = v.tac?.style || null;
        const RUSH = style?.speed === 'walk' && d < 20 ? WALK * 1.3 : RUN; // (a shield wall, drivers: at a steady walk)
        if (d > 11 || (d > 6 && !this._sees(v, fp))) {
            // far or behind walls: along the paths
            v.chaseT = (v.chaseT || 0) - dt;
            // (out in the open beyond their land there are no paths: straight at them)
            if (d > 10 && !this._sees(v, fp) && this._inLand(cs.def, fp, 0)) {
                if (v.chaseT <= 0 || !v.path) { v.chaseT = 1.5; this._goTo(v, cs.graph.nearest(fp.x, fp.y - 1.95, fp.z, 6)); }
                this._followPath(v, dt, RUSH);
            } else this._steer(v, fp.x, fp.z, RUSH, dt, 2.2);
            v.mode = v.tac?.role === 'shield' ? 'block' : RUSH < RUN ? 'walk' : 'run';
            this._ground(v);
            return;
        }
        // near: the attackers share the circle round the enemy — up to three strike
        // at once from different sides (one gets behind), the others wait a little
        // farther with shields up and take turns
        const n = v.slotN || 1;
        const turn8 = Math.floor(Date.now() / 8000);
        const i = ((v.slotI || 0) + turn8) % n;
        const front = Math.min(n, style?.front ?? 3);
        let engaged = i < front;
        const base = v.slotBase ?? Math.atan2(v.z - fp.z, v.x - fp.x);
        let a = engaged ? base + (i - (front - 1) / 2) * (front === 2 ? Math.PI * 0.8 : Math.PI * 2 / 3) : base + Math.PI + (i - front) * (Math.PI * 2 / Math.max(1, n - front));
        let R = engaged ? 2.3 : 6.5;
        if (style?.wall) {
            // the shield wall: the shields side by side in front, the swords at its ends
            const k = v.slotI || 0;
            if (v.tac.role === 'shield') { engaged = true; a = base + (k - (n - 1) / 2) * 0.75; R = 2.6; } // (shoulder to shoulder, not inside each other)
            else { engaged = k < 2; a = base + (k % 2 ? 1 : -1) * (1.5 + 0.5 * Math.floor(k / 2)); R = engaged ? 2.3 : 5.5; }
        } else if (style?.spread && n >= 3) {
            // all round him at once: each his own side, the free ones close between
            const k = v.slotI || 0;
            a = base + (k / n) * Math.PI * 2;
            R = engaged ? (style.close ? 2.1 : 2.3) : (style.close ? 4.6 : 6.2); // (the free ones wait off, out of the swings)
        }
        let tx = fp.x + Math.cos(a) * R, tz = fp.z + Math.sin(a) * R;
        const toSlot = Math.hypot(tx - v.x, tz - v.z);
        // the place is on the other side: go round the enemy (along the circle), not through them
        const cur = Math.atan2(v.z - fp.z, v.x - fp.x);
        let da = a - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > 0.5 && d < R + 4) {
            const step = cur + Math.sign(da) * 0.6, rr = Math.max(R, Math.min(d, R + 1.5));
            tx = fp.x + Math.cos(step) * rr; tz = fp.z + Math.sin(step) * rr;
        }
        // (never right on top of them: a sword's length away at least)
        if (d < 1.9 && d > 1e-3) { const k = (1.9 - d) * 0.7; const nx = v.x + (v.x - fp.x) / d * k, nz = v.z + (v.z - fp.z) / d * k; if (this._walkable(nx, nz, v.y)) { v.x = nx; v.z = nz; } }
        if (toSlot > 0.8) {
            this._steer(v, tx, tz, toSlot > 3 ? RUSH : WALK * 1.3, dt, 0.3);
            v.mode = v.tac?.role === 'shield' ? 'block' : v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : (engaged ? 'attack' : 'block');
            // already within reach on the way round: strike anyway
            if (engaged && d < 3.2) { v.yaw = turn(v.yaw, Math.atan2(-(fp.x - v.x), -(fp.z - v.z)), dt * 9); v.mode = 'attack'; }
        } else {
            this._steer(v, fp.x, fp.z, 0, dt, 9); // (turned to the enemy)
            v.speed = 0;
            v.mode = engaged ? 'attack' : 'block';
        }
        if (v.mode === 'attack') {
            // now and then a curse in the heat of the fight
            v.swearT = (v.swearT ?? 2 + Math.random() * 4) - dt;
            if (v.swearT <= 0) { v.swearT = 7 + Math.random() * 10; if (Math.random() < 0.45) this._say(v, pick(SHOUT.swear), 2.5); }
        }
        this._ground(v);
    }

    /** Who fights whom: places round each enemy (each attacker its own), once a frame. */
    _assignSlots() {
        this._shareFoes();
        // (the swords and the shields of a shield wall each have their own places; other roles none)
        const groups = new Map();
        for (const v of this.byId.values()) {
            if (v.dead || !v.foe) continue;
            if (v.tac && !MELEE.has(v.tac.role)) continue;
            const key = v.tac?.role === 'shield' ? 's' : 'm';
            const gr = groups.get(v.foe) || groups.set(v.foe, { m: [], s: [] }).get(v.foe);
            gr[key].push(v);
        }
        const now = Date.now();
        this._slotBase = this._slotBase || new Map();
        for (const [foe, gr] of groups) {
            const fp = this._playerPos(foe);
            if (!fp) continue;
            const both = gr.m.concat(gr.s);
            let b = this._slotBase.get(foe);
            if (!b || now > b.until) {
                let sx = 0, sz = 0;
                for (const v of both) { sx += v.x - fp.x; sz += v.z - fp.z; }
                b = { a: Math.atan2(sz, sx), until: now + 10000 };
                this._slotBase.set(foe, b);
            }
            // (he holds a shield up: they come at him from behind)
            const sq = both.find((v) => v.tac?.sq)?.tac.sq;
            const base = sq?.plan === 'encircle' && sq.sit?.shield ? this._backOf(foe) ?? b.a : b.a;
            for (const all of [gr.m, gr.s]) {
                // (one stuck deep down in a pit can't take a place round the enemy)
                const list = all.filter((v) => v.y > fp.y - 2 - 3);
                for (const v of all) if (!list.includes(v)) { v.slotI = 0; v.slotN = 1; v.slotBase = null; }
                // (the order by id is stable; the circle is set where most of them came from and kept a while)
                list.sort((p, q) => (p.id < q.id ? -1 : 1));
                list.forEach((v, k) => { v.slotI = k; v.slotN = list.length; v.slotBase = base; });
            }
        }
    }

    /** The bearing (from him) of a player's back. */
    _backOf(id) {
        const g = this.game;
        const ch = id === g.localId ? g.character : g.remotes.get(id)?.character;
        if (!ch) return null;
        const y = ch.group.rotation.y;
        return Math.atan2(Math.cos(y), Math.sin(y));
    }

    /**
     * A group attacks the castle: its defenders (knights, the king, anybody fighting) share the
     * enemies out (CrewTactics.shareFoes) — nobody left free while all of them rush one; each stays on
     * his own while that one has no more than his share. Once a second, per castle.
     */
    _shareFoes() {
        const now = Date.now();
        if (now - (this._shareT || 0) < 1000) return;
        this._shareT = now;
        const byCastle = new Map();
        for (const v of this.byId.values()) {
            if (v.dead || !v.foe || v.servantOf != null || !v.cs) continue;
            (byCastle.get(v.cs) || byCastle.set(v.cs, []).get(v.cs)).push(v);
        }
        for (const [cs, men] of byCastle) {
            if (men.length < 2) continue;
            const foes = [];
            for (const [pid, until] of cs.hostile) {
                if (until < now) continue;
                const p = this._playerPos(pid);
                if (p && men.some((v) => Math.hypot(p.x - v.x, p.z - v.z) < 30)) foes.push({ id: pid, x: p.x, z: p.z });
            }
            if (foes.length < 2) continue;
            const m = shareFoes(men.map((v) => ({ id: v.id, x: v.x, z: v.z, foe: v.foe })), foes, { reach: 30 });
            for (const v of men) {
                const id = m.get(v.id);
                if (!id || id === v.foe || (v.gaveUp?.id === id && v.gaveUp.until > now)) continue;
                v.foe = id; v.path = null; v.chaseT = 0;
            }
        }
    }

    // ------------------------------------------------------------ the squad's mind (KnightTactics.js)
    /**
     * (host) The knights of a castle after one foe are a squad: the captain picks a plan, weighs it
     * every few seconds, changes it when it fails (and remembers what failed against this foe);
     * every knight gets a role (sword, shield, archer, watch, climber, hide, runner, retreat, guard).
     * A few times a second.
     */
    _squads(dt) {
        this.clock = (this.clock || 0) + dt; // (the squads' time is the game's: a slow frame slows their plans too)
        this._sqT = (this._sqT || 0) - dt;
        if (this._sqT > 0) return;
        this._sqT = 0.25;
        const now = this.clock;
        for (const cs of this.castles.values()) {
            if (!cs.awake || isWizSite(cs.def)) continue;
            const groups = new Map();
            for (const v of cs.active.values()) {
                if (v.role !== 'knight' || v.dead || !v.foe || v.servantOf != null) { if (v.tac) this._untac(v); continue; }
                (groups.get(v.foe) || groups.set(v.foe, []).get(v.foe)).push(v);
            }
            const squads = cs.squads || (cs.squads = new Map());
            for (const foe of [...squads.keys()]) if (!groups.has(foe)) squads.delete(foe);
            for (const [foe, men] of groups) {
                let sq = squads.get(foe);
                if (!sq) squads.set(foe, (sq = this._newSquad(cs, foe, men, now)));
                this._runSquad(sq, men, now);
            }
        }
    }

    _untac(v) { v.tac = null; v.fx = (v.fx | 0) & ~1; }

    _newSquad(cs, foe, men, now) {
        const mems = cs.tacMem || (cs.tacMem = new Map());
        let mem = mems.get(foe);
        if (!mem) mems.set(foe, (mem = newMemory())); // (what failed against this one is remembered after the fight too)
        mem.plan = null;
        const fp = this._playerPos(foe);
        // (the captain sizes him up a moment before the first order)
        return {
            cs, foe, mem, t0: now, ids: new Set(men.map((v) => v.id)), start: men.length, lost: 0, lostAt: [], plan: null, planT0: now, reviewT: now + 0.5,
            captain: null, sayT: 0, seen: {}, sit: null, base: 0, vel: { x: 0, y: 0, z: 0 }, last: fp ? { x: fp.x, y: fp.y, z: fp.z, t: now } : null,
            d0: 0, hp0: 0, blows: 0, shots: 0, lost0: 0, up: false, steps: null, upNode: -1, callT: now + 6,
        };
    }

    _runSquad(sq, men, now) {
        const ids = new Set(men.map((v) => v.id));
        let changed = false;
        for (const id of sq.ids) if (!ids.has(id)) { changed = true; const v = this.byId.get(id); if (!v || v.dead) { sq.lost++; sq.lostAt.push(now); } }
        for (const id of ids) if (!sq.ids.has(id)) changed = true;
        sq.ids = ids;
        sq.start = Math.max(sq.start, men.length);
        const fp = this._playerPos(sq.foe);
        if (!fp) return;
        // how he moves (the archers lead him; is he running away from them?)
        if (sq.last) {
            const dt = now - sq.last.t;
            if (dt > 0.05 && dt < 2) {
                const k = Math.min(1, dt * 3);
                sq.vel.x += ((fp.x - sq.last.x) / dt - sq.vel.x) * k; sq.vel.y += ((fp.y - sq.last.y) / dt - sq.vel.y) * k; sq.vel.z += ((fp.z - sq.last.z) / dt - sq.vel.z) * k;
            }
        }
        sq.last = { x: fp.x, y: fp.y, z: fp.z, t: now };
        if (now >= sq.reviewT) {
            sq.reviewT = now + KT.REVIEW;
            const sit = this._situation(sq, men, fp, now);
            if (this._review(sq, men, sit, now)) changed = true;
        }
        if (changed && sq.plan) this._cast(sq, men, fp, now);
        // a siege: now and then they shout up at him
        if (sq.plan === 'siege' && now > sq.callT) {
            sq.callT = now + 7 + Math.random() * 5;
            const w = men.find((v) => v.tac?.role === 'watch');
            if (w) this._say(w, pick(LINES.callDown), 3);
        }
    }

    /** What the squad sees: their foe, the place, themselves (KnightTactics' `sit`). */
    _situation(sq, men, fp, now) {
        const g = this.game, cs = sq.cs;
        const t = g.world?.terrain?.data;
        const able = men.filter((v) => !(v.stunT > 0) && !v.vy && !v.lev);
        const ds = men.map((v) => Math.hypot(fp.x - v.x, fp.z - v.z)).sort((a, b) => a - b);
        const ys = men.map((v) => v.y).sort((a, b) => a - b);
        const dist = ds[Math.floor(ds.length / 2)] ?? 0, baseY = ys[Math.floor(ys.length / 2)] ?? fp.y - 1.95;
        let cx = 0, cz = 0;
        for (const v of men) { cx += v.x; cz += v.z; }
        sq.base = Math.atan2(cz / men.length - fp.z, cx / men.length - fp.x); // (from him towards them)
        const st = this._foeState(sq.foe);
        const feet = fp.y - 1.95;
        const gy = g.collision.groundAt ? g.collision.groundAt(fp.x, fp.z, feet + 0.6) : g.collision.groundY(fp.x, fp.z);
        const air = st.air || feet - gy > 2.2;
        const w = g.swim?.waterAt?.(fp.x, fp.z, feet + 0.3);
        const water = !air && (st.swim || (!!w && w.depth >= 3 && feet < w.surface + 0.5));
        const high = !air && !water && feet > baseY + 3.2;
        // how to get up to him: the castle's stairs (a path to a place by him), or steps to build
        let reach = 'ground';
        if (high) {
            reach = null;
            const cap = men.reduce((a, b) => (b.idx < a.idx ? b : a));
            const node = cs.graph.nearest(fp.x, feet, fp.z, 2.5);
            const n = cs.graph.nodes[node];
            sq.upNode = -1;
            if (n && Math.hypot(n.x - fp.x, n.z - fp.z) < 6 && cs.graph.path(cs.graph.nearest(cap.x, cap.y, cap.z), node)) { reach = 'path'; sq.upNode = node; }
            else if (t) {
                if (!sq.steps || Math.hypot(sq.steps.at.x - fp.x, sq.steps.at.z - fp.z) > 4) {
                    const s = planSteps(t, { x: fp.x, y: feet, z: fp.z }, { x: cap.x, y: baseY, z: cap.z });
                    sq.steps = s ? { ...s, done: 0, at: { x: fp.x, z: fp.z } } : null;
                }
                if (sq.steps) reach = 'steps';
            }
        }
        const Lf = Math.round(feet + 1.5);
        const inside = !!t && !air && !high && t.solidIn(Math.round(fp.x), Math.round(fp.z), Lf + 3, Lf + 12);
        const king = cs.active.get(0);
        const kingAlive = !!king && !king.dead;
        const fled = Math.hypot(sq.vel.x, sq.vel.z) > 2.5 && sq.sit && dist > sq.sit.dist + 1;
        const hpK = men.reduce((a, v) => a + v.hp / v.maxHp, 0) / men.length;
        const servants = !!g.servants?.of?.(sq.foe)?.length || !!(g.livingTrees?.list || []).some((tr) => tr.owner === sq.foe && (tr.phase === 'rise' || tr.phase === 'alive'));
        return {
            n: able.length, start: sq.start, lost: sq.lost, lostRecent: sq.lostAt.filter((x) => now - x < 20).length, hpK,
            shields: able.filter((v) => v.model.shield).length, dist, air, high, water, reach,
            lying: st.lying, busy: st.busy, noMana: st.noMana, shield: st.shield, servants, inside, fled: !!fled,
            kingAlive, kingThreat: kingAlive && Math.hypot(fp.x - king.x, fp.z - king.z) < 14 && Math.abs(feet - king.y) < 4,
            t: now - sq.t0, foeHp: st.hp,
        };
    }

    /** What can be seen of a player: flying, lying, swimming, a held spell, no mana, a shield, health. */
    _foeState(id) {
        const g = this.game;
        if (id === g.localId) {
            const c = g.combat;
            const manaK = c?.enabled && g.mana ? g.mana.value / Math.max(1, g.mana.max) : 1;
            return {
                air: !!g.flight?.active, swim: !!g.swim?.swimming,
                lying: !!g.knock?.down || !!c?.immobile || !!g.beds?.lying,
                busy: !!(g.hellfire?.busy || g.waterStorm?.busy || g.vortex?.busy || g.levitation?.active || g.builder?.build || g.duel?.myContact?.()),
                noMana: manaK < 0.12, shield: !!c?.shield, hp: c?.enabled ? c.hp : g.playerHP ?? 20,
            };
        }
        const r = g.remotes.get(id);
        const ch = r?.character;
        return {
            air: !!ch?.flying, swim: !!ch?.swimming, lying: !!ch?.knockedDown || !!r?.combat?.frozen,
            busy: !!r?.target?.dc, noMana: r?.fatigue != null && r.fatigue < 4, shield: (r?.combat?.shield || 0) > 0, hp: r?.hp ?? 20,
        };
    }

    /** The captain weighs the plan; true when it changed. */
    _review(sq, men, sit, now) {
        sq.sit = sit;
        this._observe(sq, men, sit, now);
        const P = sq.plan;
        const first = choosePlan(sit, sq.mem, now);
        let res = null;
        if (P) {
            const p = { t: now - sq.planT0, closer: sq.d0 - sit.dist, hurt: Math.max(0, sq.hp0 - sit.foeHp), blows: sq.blows, shots: sq.shots, lost: sq.lost - sq.lost0, up: sq.up };
            res = reviewPlan(P, sit, p);
            if (!res) {
                if (first.id === P) return false;
                // (a plan is given its time — only a big chance or a big danger cuts it short)
                if (p.t < KT.MIN_PLAN && !URGENT.has(first.id)) return false;
                res = { done: true, why: 'better' };
            }
            remember(sq.mem, P, res, now);
        }
        const id = res ? choosePlan(sit, sq.mem, now).id : first.id;
        begin(sq.mem, id, now);
        sq.plan = id; sq.planT0 = now; sq.d0 = sit.dist; sq.hp0 = sit.foeHp; sq.blows = 0; sq.shots = 0; sq.lost0 = sq.lost; sq.up = false;
        // the captain gives the order (the reason it changed first, when the old plan failed)
        const cap = men.reduce((a, b) => (b.idx < a.idx ? b : a));
        let line = id === 'rush' ? pick(LINES.rushWhy[sit.lying ? 'lying' : sit.noMana ? 'noMana' : 'busy'])
            : id === 'climb' && sit.reach === 'steps' && sq.steps?.cells.length ? pick(LINES.plan.climbBuild) : pick(LINES.plan[id]);
        if (res?.fail && LINES.fail[res.why] && id !== P) line = pick(LINES.fail[res.why]) + ' ' + line;
        if (id !== P || res?.fail) this._say(cap, line, 4);
        sq.sayT = now + 2;
        return true;
    }

    /** One of them sees something new and calls it out (the captain answers with an order). */
    _observe(sq, men, sit, now) {
        const flags = { air: sit.air, high: sit.high, water: sit.water, shield: sit.shield, servants: sit.servants, inside: sit.inside };
        const was = sq.seen;
        sq.seen = flags;
        if (now < sq.sayT) return;
        let key = null;
        for (const k of Object.keys(flags)) if (flags[k] && !was[k]) { key = k; break; }
        if (!key && (was.high || was.air || was.water) && !sit.high && !sit.air && !sit.water) key = 'down';
        if (!key) return;
        const cap = men.reduce((a, b) => (b.idx < a.idx ? b : a));
        const fp = sq.last;
        const who = men.filter((v) => v !== cap).sort((a, b) => Math.hypot(a.x - fp.x, a.z - fp.z) - Math.hypot(b.x - fp.x, b.z - fp.z))[0] || cap;
        this._say(who, pick(LINES.seen[key]), 3);
        sq.sayT = now + 1.2;
    }

    /** Roles for the plan; the places of the watchers, guards and hiders. */
    _cast(sq, men, fp, now) {
        const king = sq.cs.active.get(0);
        const kingAlive = !!king && !king.dead;
        const cap = {};
        const roles = castRoles(sq.plan, men.map((v) => ({
            id: v.id, idx: v.idx, d: Math.hypot(fp.x - v.x, fp.z - v.z), dk: kingAlive ? Math.hypot(king.x - v.x, king.z - v.z) : Infinity, shield: !!v.model.shield,
        })), { kingAlive, help: now - sq.mem.helpAt > KT.HELP_AGAIN && sq.cs.reinforced < sq.cs.def.knights, captain: cap });
        sq.captain = cap.id;
        const style = meleeStyle(sq.plan);
        for (const v of men) {
            const role = roles.get(v.id) || 'sword';
            if (v.tac && v.tac.role === role && v.tac.plan === sq.plan) { v.tac.style = style; continue; }
            v.tac = { role, plan: sq.plan, style, sq, since: now, k: 0, of: 1 };
            v.path = null; v.chaseT = 0;
            if (role !== 'archer') v.fx = (v.fx | 0) & ~1;
            if (role === 'runner') this._say(v, pick(LINES.runner), 3);
        }
        // the ones standing round (in order round him: nobody crosses another's way)
        for (const role of ['watch', 'guard', 'hide']) {
            const list = men.filter((v) => v.tac.role === role).sort((a, b) => Math.atan2(a.z - fp.z, a.x - fp.x) - Math.atan2(b.z - fp.z, b.x - fp.x));
            list.forEach((v, k) => { v.tac.k = k; v.tac.of = list.length; v.tac.spot = null; });
        }
    }

    /** A knight with a role other than the sword: true when the role moved him this frame. */
    _tacStep(v, fp, d, dt) {
        const tac = v.tac, sq = tac.sq;
        switch (tac.role) {
            case 'archer': return this._archer(v, sq, fp, d, dt);
            case 'watch': return this._watch(v, sq, fp, d, dt);
            case 'climber': return this._climber(v, sq, fp, d, dt);
            case 'hide': return this._hide(v, sq, fp, d, dt);
            case 'runner': return this._runner(v, sq, fp, d, dt);
            case 'retreat': return this._retreat(v, sq, fp, d, dt);
            case 'guard': return this._guardKing(v, sq, fp, d, dt);
            default: return false;
        }
    }

    /** He is right here, on my level: the sword, whatever my role. */
    _closeTo(v, fp, d) { return d < 3.8 && Math.abs(fp.y - 1.95 - v.y) < 2.2; }

    _face(v, fp, dt) { v.yaw = turn(v.yaw, Math.atan2(-(fp.x - v.x), -(fp.z - v.z)), dt * 8); }

    /** Water there (knights don't swim in armour). */
    _wet(x, z, y) { const w = this.game.swim?.waterAt?.(x, z, y + 0.3); return !!w && w.depth > 1 && y < w.surface; }

    /** To a place: straight, or along the castle's paths when walls are between. True when there. */
    _goSpot(v, x, z, speed, dt, stop = 0.5) {
        const d = Math.hypot(x - v.x, z - v.z);
        if (d <= stop) { v.speed = 0; v.path = null; return true; }
        const cs = v.cs, c = this.game.collision;
        v.chaseT = (v.chaseT || 0) - dt;
        // (the paths only lead in and out of the walls; out in the open — straight)
        if (d > 9 && cs.graph.nodes.length && (this._inWalls(cs.def, { x, z }) || this._inWalls(cs.def, v)) && c.lineOfSight && !c.lineOfSight(v.x, v.y + 2.5, v.z, x, v.y + 2.5, z, 1.5)) {
            if (!v.path || v.chaseT <= 0) { v.chaseT = 2.5; this._goTo(v, cs.graph.nearest(x, v.y, z, 6)); }
            if (v.path && !this._followPath(v, dt, speed)) return false;
        }
        this._steer(v, x, z, speed, dt, stop);
        return false;
    }

    /** A dry place on the ground at bearing `a`, about `R` from him (out along the bearing if wet). */
    _groundSpot(v, fp, a, R) {
        const t = this.game.world?.terrain?.data;
        for (let r = R; r < R + 14; r += 1.5) {
            const x = fp.x + Math.cos(a) * r, z = fp.z + Math.sin(a) * r;
            const y = t ? t.floorBelow(Math.round(x), Math.round(z), Math.round(v.y + 1.5) + 2) - 0.5 : v.y;
            if (!this._wet(x, z, y)) return { x, z, y };
        }
        return { x: fp.x + Math.cos(a) * R, z: fp.z + Math.sin(a) * R, y: v.y };
    }

    /** Bow: a place with a clear shot (each archer his own side), then draw, aim, loose. */
    _archer(v, sq, fp, d, dt) {
        const tac = v.tac;
        // he came down to me: the sword again (and the bow knocked out of the hands: fists)
        if ((this._closeTo(v, fp, d) && !sq.sit?.air) || v.disarmed || performance.now() < (sq.noArrows || 0)) { v.fx &= ~1; return false; }
        v.fx = (v.fx | 0) | 1;
        tac.spotT = (tac.spotT || 0) - dt;
        if (!tac.spot || tac.spotT <= 0) { tac.spotT = 2.5; tac.spot = this._archerSpot(v, sq, fp) || tac.spot; }
        const sp = tac.spot;
        const sees = d > 3 && d < 32 && this._sees(v, fp);
        const far = sp ? Math.hypot(sp.x - v.x, sp.z - v.z) : 0;
        tac.draw = tac.draw ?? -Math.random();
        if (sp && far > 1.2 && !(sees && far < 5 && d > 8)) {
            this._goSpot(v, sp.x, sp.z, RUN, dt, 1);
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
            tac.draw = Math.min(tac.draw, 0);
        } else {
            v.speed = 0; v.path = null;
            this._face(v, fp, dt);
            if (!sees) { v.mode = 'idle'; tac.spotT = Math.min(tac.spotT, 0.6); tac.draw = Math.min(tac.draw, 0); }
            else {
                v.mode = 'shoot';
                const D = Math.hypot(fp.x - v.x, fp.z - v.z);
                v.aimPitch = Math.max(-1, Math.min(1, Math.atan2(fp.y + 0.6 - (v.y + 3.2), D)));
                tac.draw += dt;
                if (tac.draw >= 1.3) { tac.draw = -(0.8 + Math.random() * 1.2); this._loose(v, sq, fp); }
            }
        }
        this._ground(v);
        return true;
    }

    _archerSpot(v, sq, fp) {
        const t = this.game.world?.terrain?.data, c = this.game.collision;
        const others = [];
        for (const id of sq.ids) { const o = this.byId.get(id); if (o && o !== v && o.tac?.role === 'archer' && o.tac.spot) others.push(o.tac.spot.a); }
        const mine = Math.atan2(v.z - fp.z, v.x - fp.x);
        let best = null, bs = Infinity, checks = 0;
        for (const R of [14, 19, 10, 24]) {
            for (let i = 0; i < 12 && checks < 30; i++) {
                const a = mine + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
                if (others.some((o) => angDiff(o, a) < 0.4)) continue; // (each archer his own side)
                const x = fp.x + Math.cos(a) * R, z = fp.z + Math.sin(a) * R;
                const y = t ? t.floorBelow(Math.round(x), Math.round(z), Math.round(v.y + 1.5) + 2) - 0.5 : v.y;
                if (Math.abs(y - v.y) > 3.5 || !this._walkable(x, z, y) || this._wet(x, z, y)) continue;
                const sc = Math.hypot(x - v.x, z - v.z) + Math.abs(R - 15) * 0.4;
                if (sc >= bs) continue;
                checks++;
                if (c.lineOfSight && !c.lineOfSight(x, y + 3.4, z, fp.x, fp.y + 0.4, fp.z, 1.2)) continue;
                best = { x, z, a }; bs = sc;
            }
        }
        return best;
    }

    /** (host) An arrow off a knight's bow: aimed (and led) at him, a little off — they are no marksmen. */
    _loose(v, sq, fp) {
        const g = this.game;
        if (!g.gear?.fire) return;
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        const from = new THREE.Vector3(v.x + fx * 0.9, v.y + 3.2, v.z + fz * 0.9);
        const to = { x: fp.x, y: fp.y + 0.6, z: fp.z };
        const a = aimArrow(from, to, sq.vel, ARROW_SPEED);
        if (!a) return;
        const D = Math.hypot(to.x - from.x, to.z - from.z);
        const err = 0.012 + D * 0.0016;
        const vel = new THREE.Vector3(a.x, a.y, a.z);
        vel.applyAxisAngle(_v2.set(0, 1, 0), (Math.random() - 0.5) * 2 * err);
        vel.y += (Math.random() - 0.5) * 2 * err * ARROW_SPEED;
        const dmg = Math.round(ARROW_DMG * wantedTactics(this.wantedLevel(v.foe)).dmg);
        g.gear.fire(from, vel, dmg, v.id);
        g.sync?.arrow?.(from, vel, dmg, v.id);
        sq.shots++;
        // his arrows bounce off magic steel (Armor.js): after a few they think it does not work and leave the bows a while
        if (g.armor?.bouncesArrows(sq.foe)) {
            sq.futile = (sq.futile || 0) + 1;
            if (sq.futile >= ARMOR.GIVE_UP) { sq.futile = 0; sq.noArrows = performance.now() + ARMOR.GIVE_UP_T * 1000; this._say(v, 'Стрелы его не берут! Бросьте луки!', 3); }
        }
        const me = g.character.group.position;
        if (Math.hypot(me.x - v.x, me.z - v.z) < 35) g.sound?.playBowRelease?.(0.7);
    }

    /** Hold a way down / stand round the place he holds: shield up, facing him. */
    _watch(v, sq, fp, d, dt) {
        if (this._closeTo(v, fp, d)) return false;
        const tac = v.tac;
        const R = sq.plan === 'siege' ? 7.5 : 9.5;
        let a = sq.base + (tac.k / Math.max(1, tac.of)) * Math.PI * 2;
        // (not on the steps being built)
        if (sq.steps?.dir) { const s = Math.atan2(sq.steps.dir.z, sq.steps.dir.x), dd = Math.atan2(Math.sin(a - s), Math.cos(a - s)); if (Math.abs(dd) < 0.6) a = s + (dd >= 0 ? 0.6 : -0.6); }
        if (!tac.spot || Math.hypot(tac.spot.fx - fp.x, tac.spot.fz - fp.z) > 3) tac.spot = { ...this._groundSpot(v, fp, a, R), fx: fp.x, fz: fp.z };
        if (this._goSpot(v, tac.spot.x, tac.spot.z, RUN, dt, 0.8) || v.speed === 0) { v.speed = 0; this._face(v, fp, dt); v.mode = 'block'; }
        else v.mode = v.speed > WALK * 1.2 ? 'run' : 'walk';
        this._ground(v);
        return true;
    }

    /** Up to him: the castle's stairs — or steps of planks, built at the foot of the wall. */
    _climber(v, sq, fp, d, dt) {
        const feet = fp.y - 1.95;
        if (v.y > feet - 1.2) { // (up there with him: the sword)
            if (!sq.up) { sq.up = true; this._say(v, pick(LINES.up), 3); }
            return false;
        }
        if (sq.sit?.reach === 'path' && sq.upNode >= 0) {
            v.chaseT = (v.chaseT || 0) - dt;
            if (!v.path || v.chaseT <= 0) { v.chaseT = 3; this._goTo(v, sq.upNode); }
            if (!v.path || this._followPath(v, dt, RUN)) { v.path = null; this._steer(v, fp.x, fp.z, RUN, dt, 2.2); }
            v.mode = v.speed > 0 ? 'run' : 'idle';
            this._ground(v);
            return true;
        }
        const S = sq.steps;
        if (!S) return false;
        const left = S.cells.length - S.done;
        if (left > 0) {
            // one builds (standing a little out from the last step); the other waits behind him, out of the way
            const builder = [...sq.ids].map((id) => this.byId.get(id)).filter((o) => o && !o.dead && o.tac?.role === 'climber').sort((a, b) => a.idx - b.idx)[0] === v;
            const off = builder ? 0.3 : 3;
            const bx = S.base.x + S.dir.x * off, bz = S.base.z + S.dir.z * off;
            if (!builder) {
                if (!this._goSpot(v, bx, bz, RUN, dt, 0.6)) v.mode = v.speed > 0 ? 'run' : 'idle';
                else { v.speed = 0; this._face(v, fp, dt); v.mode = 'block'; }
            } else if (Math.hypot(bx - v.x, bz - v.z) > 0.6) {
                this._goSpot(v, bx, bz, RUN, dt, 0.3);
                v.mode = v.speed > 0 ? 'run' : 'idle';
            } else {
                // at the foot of the wall: a plank, another, a step on a step
                v.speed = 0;
                const c = S.cells[S.done];
                v.yaw = turn(v.yaw, Math.atan2(-(c[0] - v.x), -(c[2] - v.z)), dt * 8);
                v.mode = 'work';
                v.buildT = (v.buildT ?? 0.4) - dt;
                if (v.buildT <= 0) { v.buildT = 0.35 + Math.random() * 0.2; this._buildStep(v, S); }
            }
        } else {
            this._steer(v, fp.x, fp.z, RUN, dt, 1.2); // (up the steps: a ledge at a time)
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        }
        this._ground(v);
        return true;
    }

    /** One plank of the steps (the world changes for everybody: like a builder's block). */
    _buildStep(v, S) {
        const g = this.game, t = g.world?.terrain?.data;
        if (!t) { S.done = S.cells.length; return; }
        while (S.done < S.cells.length) {
            const [x, L, z] = S.cells[S.done];
            const cur = t.get(x, L, z);
            if (cur !== BLOCK.AIR && cur !== BLOCK.WATER) { S.done++; continue; }
            // (somebody standing in that place: «step aside!» — out towards where the builder stands)
            for (const o of v.cs.active.values()) {
                if (o.dead || Math.abs(o.x - x) > 0.9 || Math.abs(o.z - z) > 0.9) continue;
                const Lo = Math.round(o.y + 1.5);
                if (L < Lo - 1 || L > Lo + 4) continue;
                const dx = S.base.x - x, dz = S.base.z - z, dl = Math.hypot(dx, dz) || 1;
                if (this._walkable(o.x + dx / dl * 1.2, o.z + dz / dl * 1.2, o.y)) { o.x += dx / dl * 1.2; o.z += dz / dl * 1.2; }
                return;
            }
            t.set(x, L, z, BLOCK.PLANKS);
            g.builder?._sendEdits?.([[x, L, z, BLOCK.PLANKS]]);
            g.fx?.spark?.(_v.set(x, L - 1, z), 0xb08050, 0.12, _v2.set(0, 2, 0), 0.4);
            S.done++;
            if (Math.random() < 0.2) this._say(v, pick(LINES.build), 2);
            return;
        }
    }

    /** Ambush: round him wide to the far side, wait there still; he comes near — out with the sword. */
    _hide(v, sq, fp, d, dt) {
        const tac = v.tac;
        const now = this.clock || 0;
        if (this._closeTo(v, fp, d) || (d < 7 && tac.hidden) || now - tac.since > 18) {
            tac.role = 'sword';
            this._say(v, pick(LINES.ambushNow), 3);
            return false;
        }
        const a = sq.base + Math.PI + (tac.k - (tac.of - 1) / 2) * 0.8; // (the far side of him from the others)
        let tx = fp.x + Math.cos(a) * 9, tz = fp.z + Math.sin(a) * 9;
        const cur = Math.atan2(v.z - fp.z, v.x - fp.x);
        let da = a - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > 0.9) { const s = cur + Math.sign(da) * 0.8; tx = fp.x + Math.cos(s) * 15; tz = fp.z + Math.sin(s) * 15; } // (wide round him, never past his nose)
        if (Math.hypot(tx - v.x, tz - v.z) < 1.5) { tac.hidden = true; v.speed = 0; this._face(v, fp, dt); v.mode = 'idle'; }
        else { this._goSpot(v, tx, tz, RUN, dt, 0.5); v.mode = v.speed > 0 ? 'run' : 'idle'; }
        this._ground(v);
        return true;
    }

    /** For reinforcements: to the barracks (or the gate), and the others come out. */
    _runner(v, sq, fp, d, dt) {
        const tac = v.tac, cs = v.cs, gr = cs.graph;
        if (tac.node == null) {
            const doors = gr.tagged('barracksDoor').concat(gr.tagged('keepDoor'), gr.tagged('gateIn'));
            let best = -1, bd = Infinity;
            for (const id of doors) { const n = gr.nodes[id]; const dd = Math.hypot(n.x - v.x, n.z - v.z); if (Math.hypot(n.x - fp.x, n.z - fp.z) > 10 && dd < bd) { bd = dd; best = id; } }
            tac.node = best;
        }
        const n = gr.nodes[tac.node];
        if (!n || Math.hypot(n.x - v.x, n.z - v.z) < 3) { this._callHelp(sq, v); tac.role = 'sword'; return false; }
        if (!v.path) this._goTo(v, tac.node);
        if (!v.path || this._followPath(v, dt, RUN)) { v.path = null; this._steer(v, n.x, n.z, RUN, dt, 0.5); }
        v.mode = 'run';
        this._ground(v);
        return true;
    }

    _callHelp(sq, v) {
        const cs = sq.cs;
        sq.mem.helpAt = this.clock || 0;
        const had = new Set(cs.active.keys());
        this._reinforce(cs, sq.foe);
        // (and those about the castle doing nothing come too)
        let n = 0;
        for (const k of cs.active.values()) {
            if (n >= 3 || k.dead || k.foe || k.role !== 'knight') continue;
            if (Math.hypot(k.x - v.x, k.z - v.z) < 60 && k.job !== 'guard') { k.foe = sq.foe; k.investigate = null; n++; }
        }
        const fresh = [...cs.active.values()].find((k) => !had.has(k.idx) && k.foe === sq.foe) || [...cs.active.values()].find((k) => k !== v && k.foe === sq.foe && k.role === 'knight');
        if (fresh) this._say(fresh, pick(LINES.help), 3);
    }

    /** Fall back: to the gate / the keep, catch breath (a little health back), shields to him. */
    _retreat(v, sq, fp, d, dt) {
        if (this._closeTo(v, fp, d)) return false;
        const tac = v.tac, gr = v.cs.graph;
        if (tac.node == null) {
            let best = -1, bs = -Infinity;
            for (const id of gr.tagged('gateIn').concat(gr.tagged('keepDoor'), gr.tagged('throneFront'), gr.tagged('yard'))) {
                const n = gr.nodes[id];
                const s = Math.hypot(n.x - fp.x, n.z - fp.z) - 0.6 * Math.hypot(n.x - v.x, n.z - v.z);
                if (s > bs) { bs = s; best = id; }
            }
            tac.node = best;
        }
        const n = gr.nodes[tac.node];
        if (n && Math.hypot(n.x - v.x, n.z - v.z) > 2.5) {
            if (!v.path) this._goTo(v, tac.node);
            if (!v.path || this._followPath(v, dt, RUN)) { v.path = null; this._steer(v, n.x, n.z, RUN, dt, 0.5); }
            v.mode = 'run';
        } else {
            v.speed = 0; v.path = null;
            this._face(v, fp, dt);
            v.mode = 'block';
            v.hp = Math.min(v.maxHp, v.hp + 0.5 * dt);
        }
        this._ground(v);
        return true;
    }

    /** By the king: between him and the foe, shields up. */
    _guardKing(v, sq, fp, d, dt) {
        const king = v.cs.active.get(0);
        if (!king || king.dead) { v.tac.role = 'sword'; return false; }
        if (this._closeTo(v, fp, d)) return false;
        const tac = v.tac;
        const a = Math.atan2(fp.z - king.z, fp.x - king.x) + (tac.k - (tac.of - 1) / 2) * 0.8;
        if (this._goSpot(v, king.x + Math.cos(a) * 3.2, king.z + Math.sin(a) * 3.2, RUN, dt, 0.6) || v.speed === 0) { v.speed = 0; this._face(v, fp, dt); v.mode = 'block'; }
        else v.mode = v.speed > WALK * 1.2 ? 'run' : 'walk';
        this._ground(v);
        return true;
    }

    /** People don't walk through each other: the near ones push apart. */
    _separate(dt) {
        const list = [];
        for (const v of this.byId.values()) if (!v.dead && !v.climb && !v.seated && v.group.visible) list.push(v);
        const k = Math.min(1, dt * 10);
        for (let a = 0; a < list.length; a++) {
            const p = list[a];
            for (let b = a + 1; b < list.length; b++) {
                const q = list[b];
                const dx = q.x - p.x, dz = q.z - p.z;
                if (Math.abs(dx) > 2 || Math.abs(dz) > 2 || Math.abs(q.y - p.y) > 2.5) continue;
                const R = p.role === 'knight' || q.role === 'knight' || p.role === 'king' || q.role === 'king' ? 1.8 : 1.35;
                const d = Math.hypot(dx, dz);
                if (d >= R) continue;
                const ux = d > 1e-3 ? dx / d : Math.random() - 0.5, uz = d > 1e-3 ? dz / d : Math.random() - 0.5;
                // (one talking with a player stands his ground: the others step round him, they don't shove him)
                const pa = p.talking > 0, qa = q.talking > 0;
                const push = (R - d) * 0.5 * k;
                const pp = pa && !qa ? 0 : qa && !pa ? push * 2 : push, qp = qa && !pa ? 0 : pa && !qa ? push * 2 : push;
                if (pp && this._walkable(p.x - ux * pp, p.z - uz * pp, p.y)) { p.x -= ux * pp; p.z -= uz * pp; }
                if (qp && this._walkable(q.x + ux * qp, q.z + uz * qp, q.y)) { q.x += ux * qp; q.z += uz * qp; }
            }
        }
    }

    /** (host) the swing of a knight / the king hits its target. */
    _strike(v) {
        if (v.model.limbs?.rightArm != null) return; // (no sword arm any more)
        const fp = this._playerPos(v.foe);
        if (!fp || Math.hypot(fp.x - v.x, fp.z - v.z) > 3.4) return;
        if (Math.abs(fp.y - 1.95 - v.y) > 2.6) return; // (he is up on a roof over my head: the sword cuts the air)
        const sq = v.cs?.squads?.get(v.foe);
        if (sq) sq.blows++;
        // (its sword knocked out by «Экспеллиармус»: fists)
        const base = v.disarmed ? Math.max(1, Math.round(STATS[v.role].dmg * EXPELLIARMUS.FIST)) : STATS[v.role].dmg;
        const dmg = Math.round(base * wantedTactics(this.wantedLevel(v.foe)).dmg); // (a known murderer: they hit harder)
        if (v.foe === this.game.localId) this.struck(dmg, v.x, v.z, v.title);
        else this.game.sync?.villagerStrike?.(v.foe, dmg, v.x, v.z, v.title);
    }

    /** A knight's sword reached me. */
    struck(dmg, x, z, who = 'Рыцарь') {
        const g = this.game;
        const from = _v.set(x, g.character.group.position.y, z);
        if (g.gear?.shieldFaces?.(from)) { g.gear.shieldTook?.('melee'); return; }
        if (g.weapons?.parried?.(x, z)) { g.hud.setVoice(`⚔️ Вы отбили удар: ${who}`, true); return; } // (his sword met my blade)
        if (g.combat.enabled) g.combat.damage(dmg, null, 'knight');
        else g.damageLocalPlayer(dmg);
        // the blow shoves me back (a stagger) and jerks my head
        const push = _v2.subVectors(g.character.group.position, from).setY(0).normalize().multiplyScalar(5).setY(2);
        if (g.impact) g.impact.apply({ v: push.clone(), from: from.clone().setY(g.character.group.position.y + 1), by: null, kind: 'knight', jolt: 1.5, toss: 2, noShield: true });
        else g.knockback?.add(push);
        g.hud.setVoice(`⚔️ ${who} ударил вас: −${dmg}`, true);
    }

    _sees(v, p) {
        const c = this.game.collision;
        // (sampled every 0.45 m: a wall one block thick is never stepped over)
        return c.lineOfSight ? c.lineOfSight(v.x, v.y + 3.6, v.z, p.x, p.y + 0.5, p.z, 0.45) : true;
    }

    _isPlayer(id) { return id != null && (id === this.game.localId || !!this.game.remotes?.has(id)); }

    /** (host) A player did something to the people (Wanted.js): nobody sees the number, they feel it. */
    deed(by, kind, extra = 0) {
        if (!this.auth || !this._isPlayer(by)) return;
        this.wanted.add(by, kind, Date.now() / 1000, extra);
    }

    /** (host) Does anybody of site `def` know `by` did what happened at `pos`? */
    _anyKnows(def, by, pos, via = null) {
        const cs = this.castles.get(def.id);
        if (!cs?.awake) return false;
        for (const w of cs.active.values()) if (Math.hypot(w.x - pos.x, w.z - pos.z) < 60 && this._knows(w, by, pos, via)) return true;
        return false;
    }

    /** (host) How wanted this player is: 0…3 (Wanted.js). */
    wantedLevel(id) { return this._isPlayer(id) ? this.wanted.level(id, Date.now() / 1000) : 0; }

    // ------------------------------------------------------------ damage
    /** Someone hit a villager (weapons, fists, spells). */
    hit(v, dmg, dir, by, opts = {}) {
        if (!v || v.dead) return;
        if (!this.auth) { this.game.sync?.villagerHit?.(v.id, dmg, dir ? [dir.x, dir.z] : null, (opts.magic ? 1 : 0) | (opts.weapon ? 2 : 0) | (opts.spell ? 4 : 0) | (opts.pierce ? 8 : 0) | (opts.hard ? 16 : 0)); this._flash(v); return; }
        if (v.sleep) this.night?.wake(v, 'hit', by); // (a blow wakes a sleeper — and the ones round him hear it)
        this.night?.noise(v, 9);
        if (v.damageCooldown > 0 && !opts.spell) return;
        v.damageCooldown = 0.35;
        if (v.wizard) v.hurtAt = Date.now();
        // the Master's dome: nothing gets through while it holds (but «Авада Кедавра»)
        // (a spell: half its mana from his — an unnamed one as an ordinary 10; a blow: nothing. Out of mana it shatters)
        if (v.wizard && (v.fx & FX.DOME) && !opts.pierce && this.wizards.fight.shieldPays(v, opts.spell ? opts.kind || 'spell' : 'melee', true)) { this._flash(v); return; }
        // a shield held up (the shield wall, the ones holding a place, a wizard's hand shield) takes a blow
        // or a spell from the front: little gets through. «Авада Кедавра» passes any shield.
        if (dir && !opts.pierce && v.foe && this._shieldUp(v)) {
            if (dir.x * -Math.sin(v.yaw) + dir.z * -Math.cos(v.yaw) < -0.35) {
                dmg *= opts.fire ? 0.5 : 0.25; // (fire goes round a shield: it only halves it)
                if (opts.fire) v.shieldHeat = (v.shieldHeat || 0) + 0.25; // (and the shield gets hot)
                for (let i = 0; i < 5; i++) this.game.fx.spark(_v.set(v.x - Math.sin(v.yaw) * 0.8, v.y + 2.6, v.z - Math.cos(v.yaw) * 0.8), 0xffe9a0, 0.08, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.4);
            }
        }
        // armour takes most of the blow: the hearts go down many times slower
        if (opts.pierce) v.hp = 0; // («Авада Кедавра»: no armour stops it)
        else if (v.armor > 0 && opts.fire) {
            // fire heats the armour through: it takes half, and burns less — but the hearts still go down
            const a = Math.min(v.armor, dmg * 0.5);
            v.armor -= a;
            v.hp -= a * 0.5 + (dmg - a);
        } else if (v.armor > 0) {
            const a = Math.min(v.armor, dmg);
            v.armor -= a;
            v.hp -= a * 0.2 + (dmg - a);
        } else v.hp -= dmg;
        v.hp = Math.max(0, Math.round(v.hp * 10) / 10);
        v.barT = 8;
        this._flash(v);
        if (dir && this._walkable(v.x + dir.x * (0.3 + BODY_R), v.z + dir.z * (0.3 + BODY_R), v.y)) { v.x += dir.x * 0.3; v.z += dir.z * 0.3; } // (never shoved into a wall)
        const killed = v.hp <= 0;
        const pos = { x: v.x, y: v.y, z: v.z };
        if (killed) this._die(v, by);
        // the hidden wanted level: a kill, or a real blow (not a bump in a crowd) — only what somebody saw (Blame.js)
        const real = killed || opts.spell || opts.weapon || opts.magic || opts.pierce || opts.fire || dmg > 1;
        const deed = () => { if (by && real) this.deed(by, killed ? (v.role === 'king' || v.role === 'master' ? 'killChief' : 'kill') : 'hurt'); };
        // a blow without magic (a fist, a slap, a blade) on one person is between the two of them:
        // they tell you off, take offence, or — a hard blow — fight YOU; no guards (only a rampage brings them)
        if (!killed && by && !opts.via && !opts.spell && !opts.pierce && !opts.magic && !(opts.weapon && v.role === 'king') && this._personal(v, by, dmg, opts)) { deed(); return; }
        if (!killed && v.role !== 'knight' && v.role !== 'king') this._say(v, pick(SHOUT.hurt));
        if (by && this._offence(v.cs, by, v, killed, pos, opts)) deed();
    }

    /**
     * Does person `w` know player `by` did this (Blame.js)? `src`: where the thing doing it is (the
     * tree, the fire…); `via`: its kind (null — the player's own hand / charge).
     */
    _knows(w, by, src = null, via = null) {
        if (!w || w.dead || w.sleep?.phase === 'lie') return false;
        return this.knowsFrom(w, by, src, via, w.cs?.castSeen);
    }

    /** The same for anybody standing at `w` {x, y, z, wizard, id} (a sailor on his deck too). */
    knowsFrom(w, by, src = null, via = null, castSeen = null) {
        if (!this._isPlayer(by)) return false;
        const rec = via ? castSeen?.get(by + '|' + via) : null;
        const sawCast = !!rec && Date.now() - rec.t < 180000 && rec.ids.has(w.id);
        const bp = this._playerPos(by);
        const dPlayer = bp ? Math.hypot(bp.x - w.x, bp.z - w.z) : Infinity;
        const night = !!this.game.isNight;
        const seesPlayer = !!bp && dPlayer <= sightRange(!!w.wizard, night) && this._sees(w, bp);
        const dSource = bp && src ? Math.hypot(bp.x - src.x, bp.z - src.z) : Infinity;
        return knowsCulprit({ wizard: !!w.wizard, night, seesPlayer, dPlayer, via, dSource, sawCast });
    }

    /**
     * (host) Player `by` casts `name` now: the people who see him cast remember it — later harm by
     * what he made (the tree he woke, a fire he lit) is known to be his by them (Blame.js).
     */
    witnessCast(by, name) {
        if (!this.auth || !this._isPlayer(by)) return;
        const bp = this._playerPos(by);
        if (!bp || !this.index) return;
        const fam = spellFamily(name), now = Date.now(), night = !!this.game.isNight;
        for (const def of this.index.near(bp.x, bp.z, 0)) {
            const cs = this.castles.get(def.id);
            if (!cs?.awake) continue;
            let ids = null;
            for (const w of cs.active.values()) {
                if (w.dead || w.sleep?.phase === 'lie' || w.stunT > 0) continue;
                if (Math.hypot(bp.x - w.x, bp.z - w.z) > sightRange(!!w.wizard, night) || !this._sees(w, bp)) continue;
                (ids || (ids = new Set())).add(w.id);
            }
            if (!ids) continue;
            const m = cs.castSeen || (cs.castSeen = new Map());
            m.set(by + '|' + fam, { t: now, ids });
        }
    }

    /**
     * Hurt by a thing whose master nobody saw (a tree come alive, a servant, a flying thing, a fire):
     * `w` defends himself from the thing — the brave back off facing it (a wizard casts at a creature),
     * the rest run (fear()).
     */
    _defend(w, src, opts = {}) {
        if (!w || w.dead || !src) return;
        this.fear(w, src.x, src.z, 0.4);
        if (w.wizard && opts.srcRef) this.wizards.fight.threat(w, opts.srcRef);
    }

    /**
     * A blow without magic between one player and one villager. Returns false when it is no
     * longer personal: this player has hurt several people here lately (a rampage — the castle turns on them).
     */
    _personal(v, by, dmg, opts = {}) {
        const g = this.game;
        if (!(by === g.localId || g.remotes?.has(by))) return false;
        const cs = v.cs;
        const now = Date.now();
        const bumps = cs.bumps || (cs.bumps = new Map());
        const key = by + '|' + v.id;
        const prev = bumps.get(key);
        const n = prev && now - prev.t < 30000 ? prev.n + 1 : 1;
        bumps.set(key, { t: now, n });
        const hard = !!opts.weapon || !!opts.hard || dmg > 1;
        // (the people really hurt by this player lately — a single light knock is not counted)
        if (hard || n > 1) {
            const hurt = cs.hurtBy || (cs.hurtBy = new Map());
            let m = hurt.get(by);
            if (!m) hurt.set(by, (m = new Map()));
            m.set(v.id, now);
            for (const [id, t] of m) if (now - t > 120000) m.delete(id);
            if (m.size >= RAMPAGE) return false;
        }
        const b = this.talk?.brain?.(v);
        if (b) { b.mood -= hard ? 0.5 : 0.2; b.memory.insults = (b.memory.insults || 0) + 1; }
        const knightly = v.role === 'knight' || v.role === 'king';
        // (a light knock — a hand reaching for a handshake, a bump in a crowd — once: just told off)
        if (!hard && n === 1) { this._say(v, pick(knightly ? SHOUT.bumpKnight : SHOUT.bump), 3); return true; }
        // (again and again, or the king of this castle himself: offended — not a fight)
        if ((!hard && n < 3) || this.state(cs.def.id).owner === by) { this._say(v, pick(knightly ? SHOUT.bumpKnight : SHOUT.offended), 3); return true; }
        // a hard blow (or the third knock): this one fights back — only them, only this player
        v.grudge = { id: by, until: now + GRUDGE_MS };
        if (v.foe !== by) { v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; v.seated = false; }
        this._say(v, pick(knightly ? SHOUT.fightBackKnight : SHOUT.fightBack), 3);
        if (by === g.localId) g.hud.setVoice?.(`😠 ${v.title} ${v.name} разозлился и дерётся с вами`, true);
        return true;
    }

    _flash(v) {
        v.model.flashHit(0.15);
        for (let i = 0; i < 6; i++) this.game.fx.spark(_v.set(v.x, v.y + 2.6, v.z), v.armor > 0 ? 0xdddddd : 0xb3001b, 0.08, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
    }

    _die(v, by) {
        v.dead = true;
        v.mode = 'dead';
        v.foe = null;
        v.path = null;
        const st = this.state(v.cs.def.id);
        st.killed.add(v.idx);
        this.game.death?.villagerDied(v); // the body stays; a knight's sword, shield and coins drop
        if (v.wizard && by != null) creditKill(this.game, by, { wiz: v.id, mm: v.maxMana || 30 }); // (mana: a wizard beaten in a duel)
        if (v.role === 'king') this._capture(v.cs, by);
        this._sendState(v.cs);
    }

    /** Does this one fight (knights, the king; the tower's wizards but a timid student)? */
    _fights(v) { return v.role === 'knight' || v.role === 'king' || (!!v.wizard && WizardFight.fights(v)); }

    /** A shield up: a knight's in the shield wall / holding a place, a wizard's hand shield. */
    /**
     * (host) A great fire (the Hellfire) at (x, z), `heat` 0…1 how close: people fear it. The brave —
     * knights, the king, wizards — back off step by step facing it behind their shields (some panic and
     * run; a shield gone hot in it makes them drop back); everyone else runs from it.
     */
    fear(v, x, z, heat = 0, dt = 0.25) {
        if (!v || v.dead || v.lev || v.servantOf != null) return;
        const brave = v.role === 'knight' || v.role === 'king' || !!v.wizard;
        if (!(v.fireT > 0)) {
            v.firePanic = !brave || Math.random() < 0.15 + 0.35 * heat;
            if (v.firePanic) this._say(v, pick(SHOUT.help));
        }
        if (brave && !v.firePanic && (v.shieldHeat || 0) > 2.5) { v.firePanic = true; v.shieldHeat = 0; } // (the shield too hot to hold)
        v.fireAt = { x, z };
        v.fireT = Math.max(v.fireT || 0, v.firePanic ? 3 : 0.7);
    }

    /** One step away from the fire (see fear()). */
    _fireStep(v, dt) {
        v.fireT -= dt;
        const f = v.fireAt;
        if (!f) return false;
        const dx = v.x - f.x, dz = v.z - f.z, d = Math.hypot(dx, dz) || 1;
        if (v.firePanic) {
            this._steer(v, v.x + dx / d * 6, v.z + dz / d * 6, RUN, dt);
            v.mode = v.speed > 0 ? 'flee' : 'idle';
        } else {
            this._steer(v, v.x + dx / d * 3, v.z + dz / d * 3, WALK * 0.6, dt);
            v.yaw = Math.atan2(dx, dz); // (facing the fire, the shield to it)
            v.mode = v.model?.shield ? 'block' : v.speed > 0 ? 'walk' : 'idle';
        }
        this._ground(v);
        if (v.fireT <= 0) { v.fireAt = null; v.firePanic = false; v.shieldHeat = Math.max(0, (v.shieldHeat || 0) - 1); }
        return true;
    }

    _shieldUp(v) { return (!!v.model.shield && (v.mode === 'block' || v.tac?.role === 'shield')) || (!!v.wizard && !!(v.fx & FX.SHIELD)); }

    /**
     * (host) A duel charge reached a castle person (Duel.applyToCreature): taken by a shield? The
     * Master's dome takes any; a wizard's hand shield or a knight's raised shield — one from the
     * front (Sapira's blow on a knight's shield: hit() weakens it; Avada passes a knight's shield).
     * A wizard's shield pays half of the charge's mana for it — out of mana it shatters.
     */
    wardOff(v, from, spell) {
        if (v.dead) return false;
        // a wizard's «Protection» / the Master's dome: any charge — «Авада Кедавра» too — for half its mana (WizardFight.shieldPays)
        if (v.wizard && (v.fx & FX.DOME)) return this.wizards.fight.shieldPays(v, spell, true);
        const front = !!from && (from.x - v.x) * -Math.sin(v.yaw) + (from.z - v.z) * -Math.cos(v.yaw) > 0;
        if (!front || !v.foe || !this._shieldUp(v)) return false;
        if (v.wizard) return this.wizards.fight.shieldPays(v, spell, false);
        return spell !== 'AvadaKedavra' && spell !== 'SapiraDuel'; // (a knight's shield of wood and iron)
    }

    /** Who saw it? If anyone did (or the victim lives to tell), the castle turns on `by`. */
    _offence(cs, by, victim, killed, pos, opts = {}) {
        const g = this.game;
        const st = this.state(cs.def.id);
        if (by === st.owner) return false; // (the king may do as he likes)
        const isPlayer = by === g.localId || g.remotes.has(by);
        if (!isPlayer) return false;
        const saw = [];
        for (const w of cs.active.values()) {
            if (w.dead || w === victim || w.sleep?.phase === 'lie') continue; // (asleep: saw nothing)
            if (Math.hypot(w.x - pos.x, w.z - pos.z) > SEE) continue;
            if (this._sees(w, { x: pos.x, y: pos.y + 1.5, z: pos.z })) saw.push(w);
        }
        if (!killed && victim) saw.push(victim);
        // who of them knows it was this player (Blame.js): saw him do it / saw the cast / it is plain
        const via = opts.via || null, src = opts.src || pos;
        const witnesses = saw.filter((w) => this._knows(w, by, src, via));
        if (!witnesses.length) {
            // nobody knows whose: they defend themselves from the thing itself (the tree, the fire, the flying thing)
            if (via) for (const w of saw) this._defend(w, src, opts);
            return false;
        }
        const was = cs.hostile.get(by) > Date.now();
        cs.hostile.set(by, Date.now() + HOSTILE_MS);
        const kingHit = victim && victim.role === 'king';
        for (const w of witnesses) {
            if (this._fights(w)) { w.foe = by; if (Math.random() < 0.6) this._say(w, pick(w.wizard ? WIZ_SHOUT.fight : w.role === 'king' ? SHOUT.king : SHOUT.knight)); }
            else { const bp = this._playerPos(by); this.fright.scare(w, 'attacker', bp ? { x: bp.x, y: bp.y - 1.95, z: bp.z } : pos, by); if (Math.random() < 0.5) this._say(w, pick(SHOUT.help)); }
        }
        // the alarm: knights near any witness come too; for the king — every knight
        for (const k of cs.active.values()) {
            if (k.dead || k.foe || !this._fights(k)) continue;
            if (kingHit || witnesses.some((w) => Math.hypot(w.x - k.x, w.z - k.z) < 45)) k.foe = by;
        }
        if (kingHit) this._reinforce(cs, by);
        else if (!was && cs.def.knights > 0 && this.wantedLevel(by) >= 2) this._sendGuards(cs, pos, by, 3); // (a known killer: more of the guard come out)
        const road = cs.def.kind === 'wander' || cs.def.kind === 'errant' || cs.def.kind === 'folk';
        if (!was && by === g.localId) g.hud.setVoice(road ? '⚔️ Путники видели, что вы сделали' : '⚔️ Вас заметили! Стража замка идёт за вами', true);
        else if (!was) g.sync?.villagerAlarm?.(by, cs.def.name);
        return true;
    }

    /** Hit the king: every knight of the castle comes (from the barracks, the gate, the walls). */
    _reinforce(cs, by) {
        const def = cs.def;
        const st = this.state(def.id);
        if (cs.reinforced >= def.knights) return;
        const from = cs.graph.tagged('barracksDoor').concat(cs.graph.tagged('keepDoor'), cs.graph.tagged('gateIn'));
        let n = 0;
        for (let k = 1; k <= def.knights && n < 10; k++) {
            if (cs.active.has(k) || st.killed.has(k)) continue;
            const node = cs.graph.nodes[from[n % from.length]];
            const v = this._activate(cs, k, { x: node.x + (Math.random() - 0.5) * 2, y: node.y, z: node.z + (Math.random() - 0.5) * 2 }, 'yard');
            if (v) { v.foe = by; n++; }
        }
        cs.reinforced += n;
    }

    /** The king is dead: the castle belongs to `by`. */
    _capture(cs, by) {
        const g = this.game;
        const st = this.state(cs.def.id);
        st.kingDead = true;
        st.owner = by || null;
        st.ownerName = by ? g.playerName(by) : null;
        cs.hostile.clear();
        for (const v of cs.active.values()) { v.foe = null; v.fleeT = 0; v.grudge = null; }
        for (const c of cs.chests) c.locked = false;
        const someone = [...cs.active.values()].find((v) => !v.dead && v.role !== 'king');
        if (someone) this._say(someone, pick(SHOUT.captured));
        this._announceCapture(cs, st);
        this._sendState(cs);
    }

    _announceCapture(cs, st) {
        const g = this.game;
        if (cs.def.kind === 'tower') { g.hud.notify?.(`🧙 Мастер академии «${cs.def.name.replace(/^Академия «|»$/g, '')}» повержен — хранилище открыто`); return; } // (a tower is never «captured»)
        if (st.owner === g.localId) g.hud.notify?.(`👑 Вы победили короля! ${cs.def.name} теперь ваш — сундуки открыты`);
        else g.hud.notify?.(`👑 ${st.ownerName || 'Кто-то'} захватил ${cs.def.name}`);
    }

    /**
     * Something dangerous happens at `pos` (a quake, «Breakthrough», lightning…): the people
     * near take fright (VillagerFear). A guest tells the host, who runs the people.
     */
    alarm(pos, kind, by = null, r = null) {
        if (!this.enabled || !pos) return;
        if (!this.auth) { this.game.sync?.villagerDanger?.([Math.round(pos.x), Math.round(pos.y ?? 0), Math.round(pos.z)], kind, r); return; }
        this.fright.add(kind, pos, { by, r });
        this.wizards.danger(pos, kind, by, r); // (the wizards of a tower: the brave go to see, the timid run)
        // (something dreadful cast among the people: a little on the wanted level — once in a while, if somebody saw whose)
        if (by && this._isPlayer(by) && this.index?.near(pos.x, pos.z, 0).some((def) => this._inLand(def, pos, 20) && this._anyKnows(def, by, pos, viaOfKind(kind)))) {
            const sc = this._scareAt || (this._scareAt = new Map());
            if (!(Date.now() - (sc.get(by) || 0) < 5000)) { sc.set(by, Date.now()); this.deed(by, 'scare'); }
        }
    }

    /**
     * Someone wrecked part of a castle or village (a blast, «Gather», fire): the
     * noise brings the guards to look, people run, and if anybody sees the
     * culprit — the whole guard goes for them.
     * @param {{x,y,z}} pos  where it happened
     * @param {string|null} by  the player who did it (if known)
     * @param {number} blocks  castle blocks destroyed
     * @param {boolean} [loud]  a blast (heard far) or quiet work (seen near)
     */
    damaged(pos, by, blocks, loud = true, { r = null, kind = null, via = viaOfKind(kind) } = {}) {
        if (!this.enabled || !this.index) return;
        const g = this.game;
        if (!this.auth) { if (by === g.localId) g.sync?.villagerVandal?.([Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)], blocks, loud ? 1 : 0, r); return; }
        this.night?.noise(pos, loud ? 40 : 14); // (a pane breaking, a wall coming down: the sleepers near wake)
        // (a blast: the people near take fright — VillagerFear; whatever broke is put back later — Rebuild)
        if (loud) { this.fright.add(kind || 'blast', pos, { r: r ?? 4, by }); this.wizards.danger(pos, kind || 'blast', by, r ?? 4, via); }
        if (blocks > 0 || loud) this.rebuild.damaged(pos, r ?? (loud ? 6 : 2), by, loud); // (a crater in the street too)
        const isPlayer = !!by && (by === g.localId || g.remotes.has(by));
        let counted = false;
        for (const def of this.index.near(pos.x, pos.z, 0)) {
            if (!this._inLand(def, pos, 12)) continue;
            const cs = this._runtime(def);
            if (!cs.awake) continue;
            const st = this.state(def.id);
            if (by && by === st.owner) continue; // (the king may pull down his own walls)
            const bp = isPlayer ? this._playerPos(by) : null;
            // a quiet little damage (a pane, a block or two): whoever sees it grumbles at that player — no guards
            if (!loud && isPlayer && blocks > 0 && !via && this._petty(cs, by, blocks, bp, pos)) continue;
            const hear = loud ? HEAR_BOOM : 30;
            let seen = false;
            let comers = 0;
            for (const v of cs.active.values()) {
                if (v.dead) continue;
                const d = Math.hypot(v.x - pos.x, v.z - pos.z);
                if (d > hear) continue;
                // a blast draws every eye: whoever saw the culprit do it knows who it was (Blame.js: not a fire that spread)
                if (bp && blocks > 0 && !seen && this._knows(v, by, pos, via)) seen = true;
                if (v.role === 'knight') {
                    // (a blast from a charge: one seen about with a wand is suspect; a fire, the ground — nobody to look for)
                    if (!v.foe) { v.investigate = { x: pos.x, y: pos.y, z: pos.z, by: isPlayer && !via ? by : null, t: 45 }; v.path = null; v.lookT = 0; comers++; }
                }
            }
            if (!isPlayer || blocks <= 0) continue;
            if (!counted && seen) { counted = true; this.deed(by, wreckPoints(blocks)); }
            st.wrecked = (st.wrecked || 0) + blocks;
            // a big blast: more knights run out of the barracks and the gate to see
            if (loud && comers < 4) this._sendGuards(cs, pos, via ? null : by, 4 - comers);
            if (seen) this._catch(cs, by, pos);
        }
    }

    /** Quiet small damage by one player (5 min memory): true while it is still petty. */
    _petty(cs, by, blocks, bp, pos) {
        const now = Date.now();
        const q = cs.petty || (cs.petty = new Map());
        const r = q.get(by);
        const n = (r && now - r.t < 300000 ? r.n : 0) + blocks;
        q.set(by, { n, t: now });
        if (n >= PETTY) return false;
        let said = false;
        for (const v of cs.active.values()) {
            if (v.dead || v.foe || v.role === 'king' || !bp) continue;
            if (Math.hypot(v.x - pos.x, v.z - pos.z) > 25 || !this._sees(v, bp)) continue;
            const b = this.talk?.brain?.(v);
            if (b) b.mood -= 0.3;
            if (!said) { said = true; this._say(v, pick(SHOUT.petty), 3); }
        }
        return true;
    }

    /** A few knights come out (barracks, keep, gate) and run to look at a place. */
    _sendGuards(cs, pos, by, n) {
        const def = cs.def;
        const st = this.state(def.id);
        const from = cs.graph.tagged('barracksDoor').concat(cs.graph.tagged('gateIn'), cs.graph.tagged('keepDoor'), cs.graph.tagged('yard'));
        if (!from.length) return;
        // (the nearest doors first)
        from.sort((a, b) => Math.hypot(cs.graph.nodes[a].x - pos.x, cs.graph.nodes[a].z - pos.z) - Math.hypot(cs.graph.nodes[b].x - pos.x, cs.graph.nodes[b].z - pos.z));
        let sent = 0;
        for (let k = 1; k <= def.knights && sent < n; k++) {
            if (cs.active.has(k) || st.killed.has(k)) continue;
            const node = cs.graph.nodes[from[sent % Math.min(2, from.length)]];
            const v = this._activate(cs, k, { x: node.x + (Math.random() - 0.5) * 2, y: node.y, z: node.z + (Math.random() - 0.5) * 2 }, 'yard');
            if (!v) continue;
            v.investigate = { x: pos.x, y: pos.y, z: pos.z, by, t: 50 };
            if (sent === 0) this._say(v, pick(SHOUT.investigate));
            sent++;
        }
    }

    /** The culprit is known: the castle turns on them, every knight near comes. */
    _catch(cs, by, pos) {
        const g = this.game;
        const was = cs.hostile.get(by) > Date.now();
        cs.hostile.set(by, Date.now() + HOSTILE_MS);
        let shouted = false;
        for (const k of cs.active.values()) {
            if (k.dead || k.foe || !this._fights(k)) continue;
            if (k.role === 'king' && Math.hypot(k.x - pos.x, k.z - pos.z) > 30) continue;
            if (Math.hypot(k.x - pos.x, k.z - pos.z) < 110) {
                k.foe = by; k.investigate = null;
                if (!shouted) { shouted = true; this._say(k, pick(SHOUT.wrecker)); }
            }
        }
        if (!was && by === g.localId) g.hud.setVoice('⚔️ Стража видела, кто ломает замок! Рыцари идут за вами', true);
        else if (!was) g.sync?.villagerAlarm?.(by, cs.def.name);
    }

    /** A knight goes to the place of a blast and looks round; the culprit near → caught. */
    _investigate(v, dt) {
        const I = v.investigate;
        I.t -= dt;
        if (I.t <= 0) { v.investigate = null; v.path = null; return false; }
        // who is about? the one who did it, seen near the place, is caught
        v.lookT = (v.lookT || 0) - dt;
        if (v.lookT <= 0) {
            v.lookT = 0.5;
            const p = I.by ? this._playerPos(I.by) : null;
            if (p && Math.hypot(p.x - I.x, p.z - I.z) < 40 && Math.hypot(p.x - v.x, p.z - v.z) < 32 && this._sees(v, p)) {
                this._catch(v.cs, I.by, I);
                return false;
            }
        }
        const d = Math.hypot(I.x - v.x, I.z - v.z);
        // (never into a fire or a castle coming down: they look from its edge)
        const keep = this.fright.keepOut(I);
        if (keep && d < keep + 5) { v.speed = 0; v.path = null; v.yaw = turn(v.yaw, Math.atan2(-(I.x - v.x), -(I.z - v.z)), dt * 4); v.mode = 'idle'; this._ground(v); return true; }
        if (d > 6) {
            v.chaseT = (v.chaseT || 0) - dt;
            if (!v.path || v.chaseT <= 0) { v.chaseT = 3; this._goTo(v, v.cs.graph.nearest(I.x, I.y, I.z, 8)); }
            const end = this._followPath(v, dt, RUN);
            if (end) this._steer(v, I.x, I.z, RUN * 0.6, dt, 5);
            v.mode = v.speed > 0 ? 'run' : 'idle';
        } else {
            // there: looking round
            v.speed = 0; v.path = null;
            v.yaw = turn(v.yaw, v.yaw + 1, dt * 0.8);
            v.mode = 'idle';
            if (I.t > 12) I.t = 12;
        }
        this._ground(v);
        return true;
    }

    // ------------------------------------------------------------ homes
    /** Roster numbers of the people of each house (house index → [idx…]), cached. */
    _homesOf(def) {
        if (def._homes) return def._homes;
        const m = new Map();
        const first = def.knights + 1 + def.stalls.length;
        const last = Math.min(Math.max(first + 1, def.population), first + 900);
        for (let idx = first; idx < last; idx++) {
            const e = this._roster(def, idx);
            if (e.home < 0) continue;
            (m.get(e.home) || m.set(e.home, []).get(e.home)).push(idx);
        }
        def._homes = m;
        return m;
    }

    /** (host) A house near a player: one or two of its people are at home. */
    spawnFamily(def, hIdx) {
        if (!this.enabled || !this.auth) return [];
        const cs = this._runtime(def);
        if (!cs.awake) return [];
        const house = def.houses[hIdx];
        if (this.night?.asleepTime()) return this.night.familyAsleep(cs, def, hIdx); // (at night: in bed asleep)
        const st = this.state(def.id);
        const out = [];
        const want = house.rich ? 2 : 1 + (strHash(house.id) % 2);
        for (const idx of this._homesOf(def).get(hIdx) || []) {
            if (out.length >= want) break;
            if (cs.active.has(idx) || st.killed.has(idx)) { if (cs.active.get(idx)?.job === 'home') out.push(cs.active.get(idx)); continue; }
            const at = house.inside;
            const v = this._activate(cs, idx, { x: at.x + (Math.random() - 0.5) * 2, y: at.y, z: at.z + (Math.random() - 0.5) * 2, yaw: Math.random() * 6 }, 'home');
            if (!v) continue;
            v.house = hIdx; v.homeAt = at; v.waitT = Math.random() * 10;
            out.push(v);
        }
        return out;
    }

    /** (host) Nobody is near the house any more: its people go out of sight. */
    releaseFamily(def, hIdx) {
        const cs = this.castles.get(def.id);
        if (!cs) return;
        for (const v of [...cs.active.values()]) if (v.job === 'home' && v.house === hIdx && !v.foe && !v.dead) this._deactivate(v);
    }

    /**
     * (host) A player takes from a house chest / breaks in: whoever of the house
     * sees it attacks (swearing), neighbours shout, near knights come.
     * Returns true when somebody saw it.
     */
    theft(def, hIdx, by, pos) {
        if (!this.enabled) return false;
        const g = this.game;
        const cs = this.castles.get(def.id);
        if (!cs || !by) return false;
        const st = this.state(def.id);
        if (by === st.owner) return false;
        const bp = this._playerPos(by) || pos;
        const seers = [];
        for (const v of cs.active.values()) {
            if (v.dead) continue;
            const fam = v.entry.home === hIdx && v.role !== 'knight' && v.role !== 'king';
            if (Math.hypot(v.x - bp.x, v.z - bp.z) > (fam ? 30 : 22)) continue;
            if (this._sees(v, bp)) seers.push({ v, fam });
        }
        if (!seers.length) return false;
        // only the thief, and only the family goes for them (the neighbours shout) — a theft is no war: no guards
        const until = Date.now() + THEFT_MS;
        let owners = 0;
        for (const { v, fam } of seers) {
            if (fam) { owners++; v.grudge = { id: by, until }; v.foe = by; v.fleeT = 0; v.path = null; v.seated = false; this._say(v, pick(SHOUT.thief)); }
            else if (v.role !== 'knight' && v.role !== 'king' && Math.random() < 0.6) this._say(v, pick(SHOUT.thiefSeen));
        }
        if (by === g.localId) g.hud.setVoice(owners ? '😡 Хозяева увидели, что вы берёте их вещи! Они идут на вас' : '👀 Соседи видели, как вы взяли чужое', true);
        return true;
    }

    /**
     * (host) A player forced a lock of the castle (a chest in its rooms, the gates of the throne room
     * — src/game/Alohomora.js) or took a thing out of such a chest: whoever sees it raises the alarm,
     * the guards come. Nobody sees — nothing happens.
     */
    forced(id, by, pos) {
        if (!this.enabled || !this.auth || !by || !pos) return;
        const cs = this.castles.get(id) || this._runtimeById(id);
        if (!cs) return;
        this.night?.noise(pos, 16); // (a lock forced: heard)
        this._offence(cs, by, null, false, { x: pos.x, y: pos.y ?? cs.def.F, z: pos.z });
    }

    /** (host) A player took a thing that lay in a house chest: a theft, if anybody sees it. */
    tookFromHome(home, by) {
        if (!home || !by || !this.enabled || !this.auth) return false;
        const cs = this.castles.get(home.c) || this._runtimeById(home.c);
        if (cs && home.h < 0) { this.forced(cs.def.id, by, this._playerPos(by)); return true; } // (a chest of the castle itself)
        if (!cs || !cs.def.houses?.[home.h]) return false;
        return this.theft(cs.def, home.h, by, this._playerPos(by) || cs.def.houses[home.h].inside);
    }

    /** A villager saw / suffered a crime (theft, threats) by a player. */
    reportCrime(v, by, kind = 'crime') {
        if (!v || v.dead) return;
        if (!this.auth) { this.game.sync?.villagerCrime?.(v.id, kind); return; }
        // (a thing carried off from the market: the merchant goes for the thief himself — no guards)
        if (kind === 'theft' && by && by !== this.state(v.cs.def.id).owner) { v.grudge = { id: by, until: Date.now() + THEFT_MS }; v.foe = by; v.fleeT = 0; v.path = null; return; }
        this._offence(v.cs, by, v, false, { x: v.x, y: v.y, z: v.z });
    }

    /** A player died: the castles forget them. */
    playerDied(id) {
        for (const cs of this.castles.values()) {
            cs.hostile.delete(id);
            for (const v of cs.active.values()) if (v.foe === id) { v.foe = null; v.grudge = null; }
        }
    }

    hitAt(p, radius, dmg, by) {
        for (const v of [...this.byId.values()]) if (!v.dead && Math.hypot(v.x - p.x, v.z - p.z) < radius + 1 && Math.abs(v.y + 2 - p.y) < radius + 3 && !this.game.wards?.shields(p, { x: v.x, y: v.y + 2, z: v.z })) this.hit(v, dmg, _v.set(v.x - p.x, 0, v.z - p.z).normalize().clone(), by, { spell: true });
    }

    hitRay(o, d, len, width, dmg, by) {
        let any = false;
        for (const v of [...this.byId.values()]) {
            if (v.dead) continue;
            const to = _v.set(v.x - o.x, v.y + 2 - o.y, v.z - o.z);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() < width + 1.2) { this.hit(v, dmg, d.clone(), by, { spell: true }); any = true; }
        }
        return any;
    }

    // ------------------------------------------------------------ speech
    _say(v, text, seconds = 4, broadcast = true, force = false) {
        if (!text || v.sayT > 0 && !broadcast && !force) return;
        v.sayT = 1.5;
        if (!v.bubble) { v.bubble = new SpeechBubble(); this.game.scene.add(v.bubble.sprite); }
        // a cry in a fight, a call for help, an alarm: shouted (seen and heard far)
        const shout = /!$/.test(text) && (!!v.foe || !!v.investigate || v.fleeT > 0 || v.fear?.level >= 2 || v.role === 'knight' || v.role === 'king');
        if (shout && !v.sleep && this.auth) this.night?.noise(v, 16); // (a shout wakes the sleepers near)
        // (heard aloud → no words over the head: the talk is by voice; the words only when there is no voice)
        if (this.talk.voiceCarries?.(v, shout)) v.bubble.hide?.();
        else v.bubble.show(text, { name: `${v.title} ${v.name}`, seconds, shout, color: v.wizard ? '#5b2d8e' : v.role === 'king' ? '#b8860b' : v.role === 'knight' ? '#4a5a7a' : '#5a3a1a' });
        this.talk.voice(v, text, shout);
        if (broadcast) this.game.sync?.villagerSay?.(v.id, text); // (everybody near sees the bubble)
    }

    /** (network) a villager said something. */
    heard(id, text) {
        const v = this.byId.get(id);
        if (!v) return;
        // (the answer to my own words, thought on the host: said at once, never lost)
        if (this.talk.hostAnswer?.(v, text)) return;
        this._say(v, text, 4, false);
    }

    _chatter(dt) {
        this._chatT -= dt;
        if (this._chatT > 0 || !this.auth) return;
        this._chatT = 5 + Math.random() * 6;
        if (this.talk.inTalk?.()) return; // (nobody chatters over my talk with someone)
        const me = this.game.character.group.position;
        const now = performance.now();
        // (not one talking with somebody: no line of their own over the answer)
        const near = [...this.byId.values()].filter((v) => !v.dead && !v.foe && !v.sleep && !v.pack && !(v.talking > 0) && now - (v.talkedAt || -1e9) > 30000 && Math.hypot(v.x - me.x, v.z - me.z) < 22);
        if (!near.length) return;
        const v = near[Math.floor(Math.random() * near.length)];
        const line = this.brainLine?.(v) || pick(SHOUT.ambient[v.role] || WIZ_SHOUT.ambient[v.role] || SHOUT.hurt);
        this._say(v, line);
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        if (!this.enabled || !this.index) return;
        const g = this.game;
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 1; this._scan(); }
        if (this.auth) {
            for (const cs of this.castles.values()) if (cs.awake) { if (isWizSite(cs.def)) this.wizards.crowd(cs, dt); else this._crowd(cs, dt); }
            this.fright.update(dt);
            this.rebuild.update(dt);
            this.night?.update(dt);
            this.found.update(dt); // (a body of their own found: the alarm, the search — BodyFound.js)
            this._squads(dt);
            this._assignSlots();
            for (const v of [...this.byId.values()]) if (!v.handLink) this._think(v, dt); // (held by the hand: HandHold leads them)
            this._separate(dt);
        } else {
            for (const v of this.byId.values()) {
                v.sayT -= dt; // (here too: else after a guest's first line every line of the host's villagers was dropped)
                if (!v.net) continue;
                const k = Math.min(1, dt * 8);
                v.x += (v.net.x - v.x) * k; v.y += (v.net.y - v.y) * k; v.z += (v.net.z - v.z) * k;
                v.yaw = turn(v.yaw, v.net.yaw, dt * 10);
            }
        }
        // models, bubbles, bars; fists of the local player; push me out of the people
        const me = g.character.group.position;
        const cam = g.camera;
        for (const v of [...this.byId.values()]) {
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            const visible = d < VIEW && !(v.wizard && d < 20 && Math.abs(v.y - (me.y - 1.95)) > 9); // (a wizard on another floor of the tower: not drawn)
            v.group.visible = visible && !(v.dead && v.bodyMoved); // (its body carried off by «Левиоса»: Death's copy is it now)
            v.group.position.set(v.x, v.y + (v.seated ? VILLAGER_SIT_OFFSET : VILLAGER_FOOT_OFFSET), v.z);
            v.group.rotation.y = v.yaw;
            if (visible) {
                setNearShadow(v.group, d < SHADOW_NEAR);
                // (far people move their arms and legs less often — nobody sees the difference)
                v.animT = (v.animT || 0) + dt;
                if (d < 35 || v.foe || v.animT > (d < 60 ? 0.066 : 0.12)) {
                    // (a knight's bow out of its place on the back — and back again for the sword)
                    if (v.role === 'knight' && !v.dead && (v.model.toolKind === 'sword' || v.model.toolKind === 'longbow')) { v.model.setHeldTool(v.fx & 1 ? 'longbow' : 'sword'); v.model.setAim?.(v.aimPitch || 0); }
                    v.model.update(v.animT, { mode: v.mode, speed: v.speed });
                    v.animT = 0;
                    // (a builder's hammer heard: the repairs — Rebuild.js)
                    if (v.model.workStrikeNow && v.role === 'builder' && v.model.toolKind === 'hammer' && d < 40) g.sound?.playHammer?.(_v.set(v.x, v.y + 2.2, v.z), 0.8);
                }
                if (this.auth && v.model.strikeNow && v.foe) this._strike(v);
                else if (this.auth && v.model.strikeNow && v.order) this.orders.strike(v);
            }
            if (v.bubble) v.bubble.update(dt, _v.set(v.x, v.y + (v.wizard ? 5.6 : 4.4), v.z), cam);
            this._updateBar(v, dt, cam);
            if (v.dead) continue;
            if (d < 1.4 && d > 1e-3 && Math.abs(v.y - (me.y - 1.95)) < 2) {
                const o = 1.4 - d;
                me.x += (me.x - v.x) / d * o * 0.7; me.z += (me.z - v.z) / d * o * 0.7;
            }
        }
        this.night?.visuals(dt); // (blankets, «z-z-z», the watch's torches; a hand on a sleeper)
        this.wizards.update(dt);
        this._chatter(dt);
        this.talk.update(dt);
        this._netSend(dt);
    }

    /** A health bar over a villager in a fight: hearts and (grey) armour. */
    _updateBar(v, dt, cam) {
        v.barT -= dt;
        const show = !v.dead && (v.barT > 0 || v.foe);
        if (!show) { if (v.bar) v.bar.sprite.visible = false; return; }
        if (!v.bar) {
            if (typeof document === 'undefined') return;
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 32;
            const tex = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            sprite.scale.set(2.4, 0.6, 1);
            sprite.renderOrder = 998;
            this.game.scene.add(sprite);
            v.bar = { canvas, tex, sprite, key: '' };
        }
        const key = `${v.hp}|${v.armor}`;
        if (key !== v.bar.key) {
            v.bar.key = key;
            const c = v.bar.canvas.getContext('2d');
            c.clearRect(0, 0, 128, 32);
            c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 128, 32);
            c.fillStyle = '#d0202c'; c.fillRect(4, 4, 120 * v.hp / v.maxHp, 11);
            if (v.maxArmor) { c.fillStyle = v.wizard ? '#5aa0ff' : '#b8c2cc'; c.fillRect(4, 18, 120 * v.armor / v.maxArmor, 10); }
            v.bar.tex.needsUpdate = true;
        }
        v.bar.sprite.visible = true;
        v.bar.sprite.position.set(v.x, v.y + (v.role === 'master' ? 6.3 : v.wizard ? 6.0 : v.role === 'king' ? 5.9 : 5.5), v.z);
    }

    // ------------------------------------------------------------ network
    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.2;
        const r = (x) => Math.round(x * 100) / 100;
        const list = [];
        for (const v of this.byId.values()) list.push([v.id, r(v.x), r(v.y), r(v.z), r(v.yaw), v.mode, Math.round(v.hp * 10) / 10, Math.round(v.armor), v.seated ? 1 : 0, r(v.speed), v.fx | 0, r(v.aimPitch || 0), v.disarmed ? 1 : 0]);
        g.sync.villagers?.(list);
    }

    /** (guests) the host's villagers. */
    applyNet(list) {
        const idx = this.index;
        if (!idx) return;
        const seen = new Set();
        for (const [id, x, y, z, yaw, mode, hp, armor, seated, speed, fx, pitch, disarmed] of list || []) {
            seen.add(id);
            let v = this.byId.get(id);
            if (!v) {
                const [cid, n] = id.split(':');
                const cs = [...this.castles.values()].find((c) => c.def.id === cid) || this._runtimeById(cid);
                if (!cs) continue;
                v = this._activate(cs, +n, { x, y, z, yaw }, 'net');
                if (!v) continue;
            }
            v.net = { x, y, z, yaw };
            v.mode = mode;
            if (hp < v.hp || armor < v.armor) v.barT = 8;
            v.hp = hp; v.armor = armor; v.seated = !!seated; v.speed = speed;
            if (v.role === 'knight') { v.fx = fx ?? 0; v.aimPitch = pitch ?? 0; } // (a bow in his hands, where it aims)
            else if (!v.wizard) this.fright.applyFx(v, fx | 0); // (a bucket of water in the hands)
            if (v.wizard) {
                // (a wizard's small magic, and where the wand aims; a blink: there at once, in a puff of smoke)
                if ((fx & 128) && !(v.fx & 128)) { this.wizards.fx.smoke(v); v.x = x; v.y = y; v.z = z; this.wizards.fx.smoke(v); }
                v.fx = fx ?? 0; v.aimPitch = pitch ?? 0;
            }
            // («Экспеллиармус» knocked its sword out: the sword flies / lies about as a weapon of its own)
            if (disarmed && !v.disarmed) { v.disarmed = true; v.model?.setHeldTool?.('none'); }
            if (mode === 'dead' && !v.dead) this.game.death?.stripVillager(v); // (its sword lies on the ground now)
            if (mode === 'dead') v.dead = true;
        }
        for (const v of [...this.byId.values()]) if (!seen.has(v.id)) this._deactivate(v);
    }

    _runtimeById(cid) {
        const idx = this.index;
        if (!idx) return null;
        let def = null;
        if (idx.byId) def = idx.byId(cid); // (castles, towers, wanderers)
        else { const m = /^cs(-?\d+)_(-?\d+)$/.exec(cid); if (m) def = idx.cellOf(+m[1], +m[2]); }
        return def ? this._runtime(def) : null;
    }

    _sendState(cs) {
        const st = this.state(cs.def.id);
        this.game.sync?.castleState?.(cs.def.id, { owner: st.owner, ownerName: st.ownerName, kingDead: st.kingDead, killed: [...st.killed] });
    }

    /** (network / save) a castle's state. */
    applyState(id, s) {
        const st = this.state(id);
        const wasDead = st.kingDead;
        st.owner = s.owner || null; st.ownerName = s.ownerName || null; st.kingDead = !!s.kingDead;
        st.killed = new Set(s.killed || []);
        const cs = this.castles.get(id) || this._runtimeById(id);
        if (cs) for (const c of cs.chests) c.locked = !st.kingDead;
        if (cs && st.kingDead && !wasDead && this.game.active) this._announceCapture(cs, st);
    }

    snapshot() {
        const out = {};
        for (const [id, s] of this.states) if (s.kingDead || s.killed.size) out[id] = { owner: s.owner, ownerName: s.ownerName, kingDead: s.kingDead, killed: [...s.killed] };
        return out;
    }

    restore(data) {
        for (const [id, s] of Object.entries(data || {})) this.applyState(id, s);
    }

    /** Castle captured by this player? (for the dialogue: «Ваше Величество») */
    ownerOf(castleId) { return this.state(castleId).owner; }

    dispose() {
        this.talk.dispose();
        this.fright.clear();
        this.rebuild.dispose();
        this.night?.dispose();
        for (const v of [...this.byId.values()]) this._deactivate(v);
        this.castles.clear();
    }
}

function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); }

function turn(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
}
