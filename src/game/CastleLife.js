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

import { ActionLog } from './ActionLog.js';
import { stateOf as gestureState, sayCtx, mark as markEmo } from './GestureLife.js';
import { isStallSite } from './CreativeMarket.js';
import { isGuestSite } from './CreativeGuest.js';
import { confusedMiss } from './StrongSpells.js';
import { treeAt } from './Carriages.js';
import { shareFoes } from './CrewTactics.js';
import { crowdStep, crowdNear } from './CrowdSources.js';
import { wardsOf, pushOut } from './ShieldWalls.js';
import { makeWayStep } from './Crowd.js';
import { separate } from './Pilot.js';
import { SPACE, talkDistance } from './PersonalSpace.js';
import { WALL, StuckWatch } from './Unstick.js';
import { FLEE, threatDist, threatCost, pathPasses, openWay, escapeWay, fleeSearch } from './FleePlan.js';
import { staffKnights } from './KnightStaff.js';
import { KT, LINES, choosePlan, reviewPlan, remember, begin, newMemory, castRoles, meleeStyle, planSteps, aimArrow } from './KnightTactics.js';
import { BLOCK, CHUNK, chunkKey } from '../world/Terrain.js';
import * as THREE from 'three';
import { setNearShadow, SHADOW_NEAR } from '../core/Shadows.js';
import { drawRange, drawLevel, DRAW } from './DrawRange.js';
import { ARMOR } from './ArmorTypes.js';
import { VillagerCommands } from './VillagerCommands.js';
import { RelationsLife } from './RelationsLife.js';
import { RebellionLife } from './RebellionLife.js';
import { SocialLife } from './SocialLife.js';
import { CourtLife } from './CourtLife.js';
import { JusticeLife } from './JusticeLife.js';
import { levelOf, withRank, commandsGuard, isForgiven, isRespected, RANK_TITLES, GREET_RANKED, fill as fillRank } from './Ranks.js';
import { VillagerModel, villagerLook, strippedLook, VILLAGER_FOOT_OFFSET, VILLAGER_SIT_OFFSET } from '../entities/VillagerModel.js';
import { SpeechBubble } from '../ui/SpeechBubble.js';
import { Chest } from '../entities/Chest.js';
/** A chest's look by its room: the king's and the Master's own — rich; the port's — a sea chest (Chest.js). */
const CHEST_LOOK = { king: 'rich', treasury: 'rich', throne: 'rich', vault: 'rich', study: 'rich', port: 'pirate' };
import { createRng } from '../core/math.js';
import { CastleTalk, onCounter, journal as gameJournal } from './CastleTalk.js';
import { WizardLife, isWizSite, WIZ_SHOUT, WIZ_JOBS, FX } from './WizardLife.js';
import { HamletLife, hamletRoster } from './HamletLife.js';
import { withTrade, applyTradeLook, tradeTitle } from './Trades.js';
import { WizardFight } from './WizardFight.js';
import { floorUnder } from './Wreck.js';
import { WIZ, wizardRoster, wizardStats } from './WizardAI.js';
import { EXPELLIARMUS } from './Expelliarmus.js';
import { teaches, placeOf, darkOfEntry, isDark } from './DarkMagic.js';
import { setDarkVillager } from '../entities/DarkSkin.js';
import { STARTLE, segDist2, startleReaction } from './Startle.js';
import { WANDER, wandererClass, missZone, isLoud, missVerdict, wandererLag, dieOf, isWeak, commonerDecide, commonerText, missText } from './WandererMind.js';
import { VillagerOrders } from './VillagerOrders.js';
import { Bodyguard, isLord } from './Bodyguard.js';
import { CastleWatch } from './CastleWatch.js';
import { kingFights, guardRadius, guardsKilled } from './KingNerve.js';
import { slowFactor, tickSlow } from './Slow.js';
import { trackSlope, slopePace, ledgeWide } from './HillWay.js';
import { creditKill, hellKilled } from './Mana.js';
import { hellRecent } from './HellKills.js';
import { darkHit } from './VitalityRules.js';
import { VillagerFear } from './VillagerFear.js';
import { MonsterFearLife } from './MonsterFearLife.js';
import { Rebuild } from './Rebuild.js';
import { NightLife } from './NightLife.js';
import { Wanted, wreckPoints, wantedTactics } from './Wanted.js';
import { knowsCulprit, sightRange, spellFamily } from './Blame.js';
import { BodyFound } from './BodyFound.js';
import { FACE, facesTarget } from './FaceTarget.js';
import { Claims, hallSpots, onDais, inHall } from './ThroneHall.js';
import { CSWIM, SWIMMERS, deepAt, waterAt, swimStep, splashes } from './CreatureSwim.js';
import { Chores, shownChore, choreCode, choreOf, choreThingsAt } from './Chores.js';

const _wardP = { x: 0, y: 0, z: 0 }; // (ShieldWalls.pushOut: a person's feet, reused)

const WAKE = 90; // m beyond the castle land: its people appear
const SLEEP = 140;
const SEE = 32; // m: villagers see violence this far (with a free line of sight)
const FAR_ONE = SHADOW_NEAR; // m: farther ones (no shadow there either) are drawn as one shape each (one draw instead of 8–12)
const NEAR_ONE = true; // people near drawn as one shape too (the video card moves its parts — FarShape)
const THINK_AWAY = 0.15; // s: how often a calm person far from everyone and out of the picture thinks (and steps)
/** Nothing happening to it: no fight, no fear, no order, no spell on it, not a wizard (their own magic and timers). */
const calmAway = (v) => !v.dead && !v.foe && !v.fear && !(v.fleeT > 0) && !v.order && !v.guardOrder && !v.cmd && !v.follow && !v.investigate
    && !(v.stunT > 0) && !v.vy && !v.lev && !v.carriedBy && !v.climb && !v.wizard && !(v.fireT > 0) && v.servantOf == null && !v.imp && !v.arena && v.mode !== 'run';
export const WALK = 2.3, RUN = 5.6;
const HOSTILE_MS = 180000;
const GRUDGE_MS = 40000; // a villager angry at ONE player (a hard blow, a theft): they fight that one only, no guards
const THEFT_MS = 90000;
import { settlePawn } from '../world/PawnStall.js';
import { TownNews } from './TownNews.js';
import { BUMP, LESSON, knockOutcome, beating, windDowns, packHostile, unpackHostile } from './BumpRules.js';
const SORRY_OK = ['Ладно, бывает.', 'Хорошо, я не сержусь.', 'Ну ладно, впредь аккуратнее.', 'Бывает. Забудем.'];
const RAMPAGE = 3; // different people of a castle hurt by one player within 2 min: that is a rampage — the guard comes
const PETTY = 12; // blocks of quiet damage (a pane, a few blocks) per player in 5 min: the people grumble, no guards
const LEASH = 20; // m: out of their land, knights chase on until the enemy is this far ahead
const HEAR_BOOM = 110; // m: a blast is heard this far (the guards come to look)
const ARROW_SPEED = 42, ARROW_DMG = 3; // a knight's bow (KnightTactics: the archers)
const URGENT = new Set(['rush', 'fallback', 'kingguard']); // (these cut a plan short)
const BODY_R = 0.42; // m: a person's half-width (walls are kept this far from the middle of the body)
const CHORE_SEEN = 60; // m: farther, a chore is not drawn (the person just stands — FPS)
const MELEE = new Set(['sword', 'shield']);
export const STATS = {
    builder: { hp: 8, armor: 0, dmg: 1 },
    farmer: { hp: 8, armor: 0, dmg: 1 },
    merchant: { hp: 8, armor: 0, dmg: 1 },
    knight: { hp: 20, armor: 50, dmg: 3 },
    king: { hp: 30, armor: 200, dmg: 5 }, // (the full magic set: twice a knight's plates, mends itself)
    advisor: { hp: 8, armor: 40, dmg: 1 }, // (a magic breastplate and greaves)
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
    lesson: ['Сейчас я тебя проучу.', 'Довольно! Урок тебе не повредит.', 'Вот теперь ты узнаешь манеры.'],
    lessonDone: ['Надеюсь, урок усвоен.', 'Хватит с тебя. Я возвращаюсь к делам.', 'Урок окончен.'],
    bump: ['Эй! Ты чего?!', 'Ай! Осторожнее!', 'Руки-то не распускай!', 'Смотри, куда машешь!'],
    bumpKnight: ['Ещё раз — и пожалеешь.', 'Полегче, странник.', 'Осторожнее с руками.'],
    bow: ['Ваше Величество!', 'Да здравствует король!', 'Слава новому королю!', 'Добро пожаловать, повелитель!'],
    boom: ['Что это было?!', 'Взрыв! Бегите!', 'Стену ломают!', 'Спасайтесь!', 'Стража! Тут колдун!'],
    swear: ['Получай, сволочь!', 'Ах ты ж гад!', 'Чтоб тебя!', 'Вот тебе, зараза!', 'Чёрт тебя дери!', 'Да чтоб ты провалился!', 'На, получи, мерзавец!'],
    thief: ['Ах ты ж ворюга!', 'Положи на место, зараза!', 'Ах ты, сволочь, в мой сундук полез?!', 'Чёрт бы тебя побрал, вор!', 'Ну всё, гад, получишь!', 'Вон из моего дома, паскуда!'],
    thiefSeen: ['Вор! Держи вора!', 'Грабят!', 'Вор в доме!'],
    winded: ['Эй, поосторожнее с ветром!', 'Ты чего дуешь?!', 'Что за сквозняк?!', 'Перестань, мне же в лицо!'],
    windedWiz: ['Прекратите! Это невежливо.', 'Молодой человек, не дуйте на старших!', 'Не здесь, прошу вас — прекратите!', 'Хм, ветер? Прекратите, или я отвечу.'],
    offended: ['Ну знаешь ли!', 'Я тебе это припомню!', 'Совсем обнаглел?!', 'Ещё раз тронешь — получишь!'],
    fightBack: ['Ах так?! Ну держись!', 'Сам напросился!', 'Ну всё, получишь!', 'Сейчас я тебе покажу!'],
    fightBackKnight: ['Ты за это ответишь!', 'Ну держись, наглец!', 'Сам напросился, странник.'],
    petty: ['Эй! Ты что творишь?!', 'Окно разбил! Кто платить будет?', 'А ну перестань ломать!', 'Совсем совести нет!'],
    investigate: ['Что там грохнуло? За мной!', 'К стене, живо!', 'Кто посмел?! Проверить!'],
    startled: ['Кто здесь?!', 'Это заклинание! Откуда?!', 'Нас атакуют! Ищите его!', 'Кто стрелял?! Покажись!'],
    startledWiz: ['Чары! Кто колдует?!', 'Покажись, колдун!', 'Это было в меня?!'],
    comrade: ['Его убили! Ищите убийцу!', 'Брат! Нет!', 'Убит! Он где-то рядом!', 'К оружию! Убийца рядом!'],
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
/** In the water (CreatureSwim.js). */
const SWIM_LINES = {
    heavy: ['Латы тянут на дно!', 'Тону! В доспехах не выплыть!', 'Тяжело… к берегу!'],
    wet: ['Вода! Холодная!', 'Помогите, я в воде!', 'К берегу, скорее!'],
    drown: ['Не могу… больше…', 'Помогите! Тону!', 'Буль…'],
};
/** Harm whose kind is done through something else, not straight from the hand (Blame.js: the culprit is not plain). */
export const viaOfKind = (kind) => (kind === 'quake' ? 'quake' : kind === 'fire' ? 'fire' : null);
const _v = new THREE.Vector3();
const _view = new THREE.Frustum(), _viewM = new THREE.Matrix4(), _viewS = new THREE.Sphere(); // (the camera's picture: far people out of it are not posed)
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
    const f = rng() < (role === 'knight' ? 0.15 : 0.5);
    const female = role === 'king' || role === 'advisor' ? false : f; // (the king and his advisor are men: the look and the voice agree — the author heard a woman's voice from a man)
    const name = role === 'king' ? def.king : (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
    const home = def.houses.length ? Math.floor(rng() * def.houses.length) : -1;
    const stall = role === 'merchant' && idx < merchants0 + def.stalls.length ? idx - merchants0 : -1;
    return { idx, role, female, name, home, stall, seed };
}

export function roleTitle(e) {
    return (e.trade && tradeTitle(e.trade, e.female)) || (e.female ? ROLE_NAMES_F : ROLE_NAMES)[e.role];
}

// --------------------------------------------------------------- graph
/** One key for the way between two nodes (either direction). */
export const edgeKey = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);

export class Graph {
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

    /** Every node one can get to from node a (not through a cut way) → Set of ids. */
    reach(a, cut = null) {
        const seen = new Set();
        if (a < 0) return seen;
        const st = [a];
        seen.add(a);
        while (st.length) {
            const c = st.pop();
            for (const nb of this.adj[c]) {
                if (seen.has(nb) || (cut?.size && cut.has(edgeKey(c, nb)))) continue;
                seen.add(nb); st.push(nb);
            }
        }
        return seen;
    }

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

    /**
     * A* from node a to node b → list of node ids (or null). opts: {cut (Set of edgeKey — ways the
     * world broke: a hole, a fallen wall — never taken), cost(node) → extra m (a fleeing one: near
     * a threat costs a lot — FleePlan.threatCost)}.
     */
    path(a, b, { cut = null, cost = null } = {}) {
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
                if (cut?.size && cut.has(edgeKey(cur, nb))) continue;
                const ng = g.get(cur) + Math.hypot(N[cur].x - N[nb].x, N[cur].y - N[nb].y, N[cur].z - N[nb].z) + (cost ? cost(N[nb]) : 0);
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
        this.extra = new Map(); // id -> def: sites made by the game itself, not by the terrain (the Creative market stall — CreativeMarket.js)
        this.castles = new Map(); // id -> runtime {def, graph, awake, active: Map(idx -> v), state, chests}
        this.byId = new Map(); // villager id -> v
        this.states = new Map(); // castle id -> saved state {owner, ownerName, kingDead, killed:Set}
        this.news = new TownNews(); // what each town knows has happened lately (its villagers' net talks about it — TownNews.js)
        this._scanT = 0;
        this._netT = 0;
        this._chatT = 4;
        this.enabled = !game.config.map && game.config.mode !== 'test';
        this.talk = new CastleTalk(game, this); // conversations and the market
        this.wizards = new WizardLife(this); // the wizards' towers and the wandering wizards
        this.hamlets = new HamletLife(this); // the lone houses and the small villages (HamletLife.js)
        this.hallClaims = new Claims(); // who stands where before the throne (ThroneHall.js)
        this.orders = new VillagerOrders(this); // what the people agreed to do (the king's orders)
        this.reb = new RebellionLife(this); // the hidden unrest of a place toward its owner (Rebellion.js)
        this.rel = new RelationsLife(this); // the three bars of every person to the hero, grudges, plots (Relations.js)
        this.social = new SocialLife(this); // goals, companions, a friend steps in, praise and sneers at magic, tired of friendship (Lives.js)
        this.justice = new JusticeLife(this); // arrests, the jail, searches (Justice.js)
        this.court = new CourtLife(this); // the treasury, the people's troubles, the vizier who reports and leads (Court.js)
        this.alog = new ActionLog(this, gameJournal); // the full journal of what the people in dealings do and why (ActionLog.js)
        this.cmds = new VillagerCommands(this); // the player's plain-word commands: poses, walks, formations, spars (VillagerCommands.js)
        this.mfear = new MonsterFearLife(game); // the hero in the monster form: who runs, who fights, who scatters the darkness (MonsterFear.js)
        this.fright = new VillagerFear(this); // danger: they hide in houses, run out of the gates, look out, come out (VillagerFear.js)
        this.rebuild = new Rebuild(this); // after it: the builders put the castle back as it was (Rebuild.js)
        this.chores = new Chores(this); // what the people do all day by their houses, at the well, the market (Chores.js)
        this.night = new NightLife(this); // the night: everybody home asleep, only the watch out (NightLife.js)
        this.stuck = new StuckWatch({ // «стоит без причины» (Unstick.js)
            now: 0,
            skip: (v) => this._standsFine(v),
            diagnose: (v) => this._whyStuck(v),
            replan: (v) => this._replan(v),
            unseen: (v) => this._players().every((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) > 45),
            nearestFree: (v) => this._nearestFree(v),
            log: (text, v) => { const t = `${v.role || '?'} #${v.id} (${v.cs?.def?.kind || '?'}) ${Math.round(v.x)},${Math.round(v.z)}: ${text}`; console.warn('[stuck]', t); this.game.perf?.note?.('стоит: ' + t); },
        });
        this.wanted = new Wanted(); // (host) each player's hidden «wanted level»: how hard the knights and wizards fight them (Wanted.js)
        this.watch = new CastleWatch(this); // (inside the walls one knight not of the main guard keeps an eye on a stranger: CastleWatch.js)
        this.guard = new Bodyguard(this); // (host) the king's bodyguards: the formation, whoever goes at him first (Bodyguard.js)
        this.found = new BodyFound(this); // (host) a body found: the alarm, the search for strangers (BodyFound.js)
        this.brainLine = (v) => this.talk.ambientLine(v);
    }

    get auth() { return this.game.authority; }
    get index() { const d = this.game.world?.terrain?.data; return d?.sites || d?.castles || null; } // (castles and wizards' towers)

    /** Who is person number `idx` of a site (a castle's villager or a wizard). */
    _rosterRaw(def, idx) { const own = def.people?.find((p) => p.idx === idx); if (own) return own; return def.kind === 'hamlet' ? hamletRoster(def, idx) : isWizSite(def) ? wizardRoster(def, idx) : rosterEntry(def, idx); }

    /** The same with the trade of the building the person works in (generation 11: Trades.js — a smith, a baker, a priest…). */
    _roster(def, idx) {
        const e = this._rosterRaw(def, idx);
        return def.buildings?.length ? withTrade(def, e, (d) => this._homesOf(d)) : e;
    }

    state(id) {
        let s = this.states.get(id);
        if (!s) { s = { owner: null, ownerName: null, kingDead: false, killed: new Set(), ranks: {} }; this.states.set(id, s); }
        return s;
    }

    // ---------------------------------------------------------- the king's friends (Ranks.js)
    /** The rank step of a player in a castle (0: none). The king himself is above all. */
    rankOf(cs, pid) { return this.state(cs.def?.id ?? cs).owner === pid ? 9 : levelOf(this.state(cs.def?.id ?? cs).ranks, pid); }

    /** Does he command the castle's guard like the king (the king, a commander, a deputy)? */
    isCommander(cs, pid) { const st = this.state(cs.def?.id ?? cs); return pid != null && (st.owner === pid || commandsGuard(st.ranks, pid)); }

    /** For `isLord`: the player counts as "the lord" of these men when he is the owner or a friend of the castle (never an enemy). */
    lordOf(cs, pid) { const st = this.state(cs.def.id); return isForgiven(st.ranks, pid) ? pid : st.owner; }

    /**
     * (host) The king gives (level 1…4) or takes (0) a rank: kept in the castle's state, told to everybody, announced by the knights
     * near the friend. Only the owner may (VillagerCommands checks).
     */
    setRank(cs, pid, level, title, name) {
        const st = this.state(cs.def.id);
        const before = levelOf(st.ranks, pid);
        st.ranks = withRank(st.ranks, pid, level, title, name);
        if (level && level > before) this.reb?.note(cs, st.owner, 'rank'); // (an office given: a sign of the king's care)
        if (level) { const h = cs.hostile; h.delete(pid); for (const k of cs.active.values()) if (k.foe === pid) { k.foe = null; k.grudge = null; } } // (the friend is forgiven at once)
        this._sendState(cs);
        const p = this._playerPos(pid);
        if (level && level !== before && p) {
            // the knights nearest to him greet him by his new standing — one or two voices
            const near = [...cs.active.values()].filter((k) => !k.dead && k.role === 'knight' && Math.hypot(k.x - p.x, k.z - p.z) < 40).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 2);
            near.forEach((k, i) => { const line = pick(GREET_RANKED[level] || GREET_RANKED[1]); setTimeout(() => { if (!k.dead) this._say(k, fillRank(line, name, RANK_TITLES[level] === title ? '' : title), 3.5); }, 1200 + i * 1300); });
        }
    }

    /** A site the game makes itself (not in the terrain's index): found by `_scan` and `_runtimeById`. */
    addSite(def) { this.extra.set(def.id, def); }

    _runtime(def) {
        let cs = this.castles.get(def.id);
        if (!cs) {
            cs = { def, graph: new Graph(def), awake: false, active: new Map(), hostile: new Map(), chests: [], spawnT: 0, reinforced: 0 };
            this.castles.set(def.id, cs);
            const rem = this._pendingHostile?.get(def.id);
            if (rem > 0) { cs.hostile.set(this.game.localId, unpackHostile(rem, Date.now())); this._pendingHostile.delete(def.id); }
        }
        return cs;
    }

    // ---------------------------------------------------------- players
    /**
     * Where the players really ARE (wake / sleep of places, who is near, who sees the beds…): an invisible player is
     * here too — the castle must not fall asleep and its people vanish round them (the author: knights blinked in and
     * out under «Invisible»). `perceived` = what the people can SEE (an invisible player: only where they were last
     * noticed, for a few seconds — Invisibility.aiPos): for suspicion, greetings and the like.
     */
    _players(perceived = false) {
        const g = this.game;
        const out = [];
        const at = (id, p) => (perceived && g.invis ? g.invis.aiPos(id, p) : p);
        const push = (id, p) => { const q = at(id, p); if (q) out.push({ id, p: q }); };
        if (!g.isDeadLocal && !g.combat?.dead) push(g.localId, g.character.group.position);
        for (const [id, r] of g.remotes) if (!r.dead) push(id, r.position);
        return out;
    }

    _playerPos(id) {
        const g = this.game;
        const b = this._bossNow; // (the boss being thought: the king, the head of the wizards' tower — sees the invisible and cries out)
        const boss = b ? { key: 'villager:' + b.id, x: b.x, z: b.z, say: (t) => this._say(b, t, 4, true, true) } : null;
        const seen = (p) => (p && g.invis ? g.invis.aiPos(id === 'local' ? g.localId : id, p, boss) : p); // (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
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
        if (cs.active.has(idx) || this.state(def.id).killed.has(idx) || this.justice?.isJailed(cs, idx)) return null; // (and the ones in the king's jail are not out and about)
        const e = this._roster(def, idx);
        let look = villagerLook(e.seed, e.role === 'advisor' ? 'merchant' : e.role, e.female, { castleColor: def.color });
        if (e.robe) look.magicRobe = true; // (a wizard's magic robe: Armor.js)
        if (e.trade) applyTradeLook(look, e.trade); // (a smith, a baker, a priest…: the clothes of the trade — Trades.js)
        if (e.role === 'advisor') Object.assign(look, { advisor: true, magicChest: true, magicLegs: true, hat: 'chancellor', hatColor: 0x6a1233, plume: false, shirt: 0x6a1233, pants: 0x3d0a1f, boots: 0x2b1a14, dress: false }); // (the king's super-helper: no helm, magic breastplate and greaves, the cap of office)
        if (e.rank) look.rank = e.rank; // (his rank: the robe's trim and cuffs — VillagerModel)
        if (extra.look) extra.look(look, e); // (a steward of the duel arena: his own robe — ArenaDuels.stewardLook)
        if (e.elder) { look.female = false; look.hairColor = 0xd8d8d8; look.beard = 'long'; look.hat = 'wizardTall'; } // (a settlement's Elder: an old man — WizVillages.js)
        if (this.game.armor?.wasStripped(def.id + ':' + idx)) look = strippedLook(look); // («Disarmor» took the steel / the plain robe off)
        const model = new VillagerModel(look, { castleColor: def.color });
        this.game.scene.add(model.group);
        const WS = WIZ[e.role] ? wizardStats(e.role, e.rank, e.mana) : null;
        const S = WS ? { hp: WS.hp, armor: WS.ward } : STATS[e.role]; // (a wizard's ward is its armour; health and ward by his rank)
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
        v.dark = darkOfEntry(def, e, v.id); // (чёрный маг мира: метки на теле — DarkSkin.js; волшебники своих не презирают)
        if (v.dark > 0) setDarkVillager(model, v.dark);
        if (e.role === 'king') v.magicPieces = ['helmet', 'chest', 'legs'];
        else if (e.role === 'advisor') v.magicPieces = ['chest', 'legs'];
        if (v.magicPieces) { v.magicSet = v.magicPieces.length === 3; v.magicMend = 0; }
        if (look.unarmored || look.robeOff) v.stripped = true;
        if (look.unarmored || (e.role === 'advisor' && !look.magicChest)) { v.armor = 0; v.maxArmor = 0; v.magicPieces = null; v.magicSet = false; v.stripped = true; } // (a wizard's ward is no steel: it stays)
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
    targets(reach = 40) {
        const out = [];
        const me = this.game.character.group.position;
        for (const v of this.byId.values()) if (!v.dead && Math.abs(v.x - me.x) < reach && Math.abs(v.z - me.z) < reach) out.push(v);
        return out;
    }

    // ------------------------------------------------------- wake / sleep
    _scan() {
        const idx = this.index;
        if (!idx) return;
        const players = this._players();
        this.game.imperius?.eyes?.(players); // («Империус»: the places round a creature with a mind in it wake and stay awake — up to 1800 m from the body)
        const seen = new Set();
        // (one place wakes per look — its people are made at once, 15–40 ms: the next one a moment later)
        let woke = false;
        const wake = (cs) => {
            if (cs.awake) return;
            if (woke) { this._scanT = 0.1; return; }
            woke = true;
            this._wake(cs);
        };
        for (const pl of players) {
            for (const def of this.extra.values()) {
                if (Math.max(Math.abs(pl.p.x - def.x), Math.abs(pl.p.z - def.z)) > def.zone + WAKE) continue;
                seen.add(def.id);
                wake(this._runtime(def));
            }
            for (const def of idx.near(pl.p.x, pl.p.z, WAKE)) {
                seen.add(def.id);
                wake(this._runtime(def));
            }
        }
        for (const cs of this.castles.values()) {
            if (!cs.awake || seen.has(cs.def.id) || cs.def.kind === 'wander') continue; // (wanderers keep their own pace)
            const far = players.every((pl) => Math.max(Math.abs(pl.p.x - cs.def.x), Math.abs(pl.p.z - cs.def.z)) > cs.def.zone + SLEEP);
            // (a fight chased far from the place: whoever of its people is still near a player — or fighting — does not vanish with it)
            if (far && !this._heldAwake(cs, players)) this._sleep(cs);
        }
        for (const cs of this.castles.values()) if (cs.awake && !cs.chestsMade) this._makeChests(cs); // (the chests whose land was not made yet)
    }

    /** One of the place's people is away from it near a player (or in a fight): the place stays awake. */
    _heldAwake(cs, players) {
        for (const v of cs.active.values()) {
            if (v.dead) continue;
            const strayed = Math.max(Math.abs(v.x - cs.def.x), Math.abs(v.z - cs.def.z)) > cs.def.zone + 20;
            if (!strayed && !v.foe) continue;
            for (const pl of players) {
                const d = Math.hypot(pl.p.x - v.x, pl.p.z - v.z);
                if ((strayed && d < SLEEP + 60) || (v.foe && d < 500)) return true;
            }
        }
        return false;
    }

    _wake(cs) {
        cs.awake = true;
        this._makeChests(cs);
        this.game.pentagranium?.worldWake(cs.def); // (the settlement's ready teleportation pentagram, paired with the nearest settlement — PentagramWorld.js)
        this.game.loreLibrary?.wake(cs.def); // (its library's reading stands with the books of the world's history — LoreLibrary.js; on every computer)
        if (!this.auth) return;
        const def = cs.def;
        if (isGuestSite(def)) { const v = this._activate(cs, 1, def.spot, 'stall', { post: def.spot }); if (v) v.guest = true; return; } // (the Creative guest: just him — CreativeGuest.js)
        if (isStallSite(def)) { const st = def.stalls[0]; this._activate(cs, 1, { ...st.back, yaw: st.yaw }, 'stall', { post: { ...st.back, yaw: st.yaw } }); return; } // (the Creative stall: just its merchant)
        if (def.kind === 'hamlet') { this.hamlets.wake(cs); return; } // (the lone houses and the small villages: HamletLife.js)
        if (isWizSite(def)) { this.wizards.wake(cs); return; } // (no knights: the wizards have their own places)
        if (this.night?.staffNight(cs)) return; // (at night: only the watch is out — NightLife.js)
        this._staffDay(cs);
    }

    /** (host) The castle's people at their day places (those not out already). */
    _staffDay(cs) {
        const def = cs.def;
        if (def.kind === 'hamlet') { this.hamlets.staffDay(cs); return; } // (no king, no castle: HamletLife.js)
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
        if (def.capped) staffKnights(this, cs, knight); // (generation 21+: 10–15 knights, each at his post — KnightStaff.js)
        else this._staffOld(cs, knight);
        // the merchants at their stalls
        settlePawn(this.game.world?.terrain?.data, def);
        def.stalls.forEach((s, i) => (!s.probe || s.settled) && !s.off && this._activate(cs, def.knights + 1 + i, { ...s.back, yaw: s.yaw }, 'stall', { post: { ...s.back, yaw: s.yaw } }));
        // farmers in a few fields
        let f = 0;
        for (const field of def.fields.slice(0, 4)) {
            const idx = this._freeCommoner(cs, 'farmer');
            if (idx < 0) break;
            const v = this._activate(cs, idx, { x: field.x, y: field.y, z: field.z }, 'farm');
            if (v) { v.fieldNode = field.node; f++; }
        }
    }

    /** The old crowd's places (worlds before generation 21): four at the gate, two on the walls, two in the yard. */
    _staffOld(cs, knight) {
        const def = cs.def;
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
    }

    _sleep(cs) {
        cs.awake = false;
        this.game.pentagranium?.worldSleep(cs.def);
        this.game.loreLibrary?.sleep(cs.def);
        if (cs.def.kind === 'hamlet') this.hamlets.sleep(cs); // (its fire out, its sphere put away)
        for (const v of [...cs.active.values()]) this._deactivate(v);
        // the goods still lying unpaid on its counters are put away (laid out again when somebody comes):
        // a long flight left every market's goods of the world lying about
        const talk = this.talk, items = this.game.items;
        if (this.auth && talk?.stalls && items) cs.def.stalls.forEach((st, i) => {
            const key = talk._stallKey(cs.def, i), s = talk.stalls.get(key);
            if (!s) return;
            for (const uid of s.goods) {
                const L = items.loose.get(uid);
                if (L && L.item.shop && !L.item.shop.paid && onCounter(st, L.model.position)) { items.removeLoose(uid); this.game.sync?.itemGone?.(uid, null, null); }
            }
            talk.stalls.delete(key);
        });
        // its chests are put away too, as a village house's (an opened one is remembered — _openedChests; an
        // unlocked one — Locks): a long flight over the world left every castle's chests in the scene
        const g = this.game;
        cs.chests = cs.chests.filter((c) => {
            if (c.animating) return true;
            if (c.isOpen) (g._openedChests = g._openedChests || new Set()).add(c.id);
            if (c.boxId != null) g.collision.removeBox(c.boxId);
            c.dispose();
            const k = g.chests.indexOf(c);
            if (k >= 0) g.chests.splice(k, 1);
            return false;
        });
        cs.chestsMade = false;
    }

    _makeChests(cs) {
        const g = this.game;
        if (cs.chestsMade) return;
        cs.chestsMade = true;
        const st = this.state(cs.def.id);
        const data = g.world?.terrain?.data;
        for (const c of cs.def.chests) {
            if (g.chests.some((x) => x.id === c.id) || g.burnWreck?.burnt.has(c.id)) continue; // (burnt down: BurnWreck.js)
            if (data?.chunks && ![-1, 1].every((dx) => [-1, 1].every((dz) => data.chunks.has(chunkKey(Math.floor((c.x + dx) / CHUNK), Math.floor((c.z + dz) / CHUNK)))))) { cs.chestsMade = false; continue; } // (its land — and the column the floor is read from, rounded — not made on this computer yet: making it now was a long frame; at the next look, _scan)
            const cy = Math.min(c.y, floorUnder(g.world?.terrain?.data, c.x, c.y, c.z) ?? c.y); // (its floor blown away: lower)
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, cy, c.z), 'loot', c.yaw, c.id, { scale: c.scale, style: c.look || CHEST_LOOK[c.room] }); // (generation 8: the look the plan gave it — iron, painted, a crate…)
            if (c.gap != null) chest.setWallGap(c.gap); // (its lid leans on the wall behind it)
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.locked = !st.kingDead;
            chest.castle = cs.def;
            chest.room = c.room;
            if (c.flavor) chest.flavor = c.flavor; // (what it holds: food, clothes, arms, scrolls — ItemTypes.rollStoreLoot)
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
    _goTo(v, node, cost = null) {
        const g = v.cs.graph;
        const from = v.node != null && v.node >= 0 && Math.hypot(g.nodes[v.node].x - v.x, g.nodes[v.node].z - v.z) < 3 ? v.node : g.nearest(v.x, v.y, v.z);
        const cut = v.cs.cut;
        let path = g.path(from, node, { cut, cost }); // (never through a way the world broke — breakWays)
        // the place cut off (every way there broken): as near to it as one can get
        if (!path && node >= 0 && from >= 0 && cut?.size) {
            const t = g.nodes[node];
            let best = -1, bd = Infinity;
            for (const id of g.reach(from, cut)) { const n = g.nodes[id], d = Math.hypot(n.x - t.x, (n.y - t.y) * 2, n.z - t.z); if (d < bd) { bd = d; best = id; } }
            if (best >= 0) path = g.path(from, best, { cut, cost });
        }
        // (already between the first node and the next: no stepping back to the first — the back-and-forth
        // of a walker whose way is looked for again every few seconds)
        let i = 0;
        if (path && path.length > 1) {
            const a = g.nodes[path[0]], b = g.nodes[path[1]];
            if (Math.abs(a.y - b.y) < 1.5 && Math.hypot(b.x - v.x, b.z - v.z) < Math.hypot(b.x - a.x, b.z - a.z) && this._edgeWalkable(v, b)) i = 1;
        }
        v.path = path;
        v.pathI = i;
        v.goal = node;
        return !!path;
    }

    /** A wanderer picks where to go next (or goes home at the end). */
    _nextTrip(v) {
        if (this.chores.plan(v)) return; // (a chore of their own: the roof, the wood, the well, the ball…)
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

    /** Back on a way it left a while: on from the node nearest it ahead, not back to one it already passed. */
    _resyncPath(v) {
        const N = v.cs.graph.nodes;
        let bi = v.pathI, bd = Infinity;
        for (let i = v.pathI; i < Math.min(v.path.length, v.pathI + 8); i++) {
            const n = N[v.path[i]], d = Math.hypot(n.x - v.x, n.z - v.z) + Math.abs(n.y - v.y) * 2;
            if (d < bd) { bd = d; bi = i; }
        }
        // (that nearest one is already about passed when the next is nearer than it is to the next)
        const a = N[v.path[bi]], b = N[v.path[bi + 1]];
        if (b && Math.hypot(b.x - v.x, b.z - v.z) < Math.hypot(b.x - a.x, b.z - a.z)) bi++;
        v.pathI = bi;
    }

    /** One step along the path; true when the end is reached. */
    _followPath(v, dt, speed) {
        speed *= v.legK ?? 1; // (a leg cut off: hopping / crawling — Dismember.js)
        const g = v.cs.graph;
        if (!v.path || v.pathI >= v.path.length) return true;
        const n = g.nodes[v.path[v.pathI]];
        // off the ways, walls between it and them (up some steps, in a corner of a house, behind rubble):
        // the way to the path found block by block first (gridWay), then on along the path
        if (v.gridWay) {
            const w = v.gridWay[0];
            if (!w || v.gridWay.goal !== v.path[v.pathI]) v.gridWay = null;
            else {
                const d = this._steer(v, w.x, w.z, speed, dt, 0.25);
                if (d < 0.45) { v.gridWay.shift(); if (!v.gridWay.length) v.gridWay = null; }
                return false;
            }
        }
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
        const s = Math.min(d, speed * slowFactor(v) * slopePace(v.slope) * dt); // (slower up a hill, quicker down: HillWay.js)
        // somebody on the way (a man, a player, an animal, a monster): round them early, on the side
        // with room; two meeting keep to the right; a narrow spot — wait / give way (Crowd.js)
        let ux = dx / d, uz = dz / d;
        if (speed > 0) {
            const a = crowdStep(this.game, v, v, ux, uz, last ? d : d + 3, { r: this._bodyR(v), speed: speed * slowFactor(v), dt, room: (x, z) => this._walkable(x, z, v.y) });
            if (!a) { v.speed = 0; return false; }
            // (off the path only where one can walk; else the path's own way — but never into a player's shield)
            if (a.x !== ux || a.z !== uz) {
                if (this._walkable(v.x + a.x * (s + BODY_R), v.z + a.z * (s + BODY_R), v.y)) { ux = a.x; uz = a.z; } else if (a.ward) { v.speed = 0; return false; }
                // (no room to step round him — a gate, a narrow street: never on into his back; a moment behind him)
                else if (a.by && Math.hypot(a.by.vx || 0, a.by.vz || 0) > 0.5 && Math.hypot(a.by.x - v.x, a.by.z - v.z) < this._bodyR(v) + (a.by.r ?? 0.5) + 0.35 && (a.by.x - v.x) * ux + (a.by.z - v.z) * uz > 0) { v.speed = 0; return false; }
            }
        }
        // a door shut by «Lock» on the way: knock, wait a little — then go some other way (never through it)
        if (this.game.locks?.spelled?.size && this.game.locks.blocksAt(v.x + ux * (s + BODY_R), v.z + uz * (s + BODY_R), v.y)) return this._lockedOut(v, dt);
        v.knockT = 0;
        // the way ahead is not there any more (a hole the blast left, a wall or stones fallen across):
        // never over the edge, never through it — along it towards the node; if this way itself is
        // broken, it is cut and another way is taken (the changed world is understood: breakWays)
        if (!this._walkable(v.x + ux * (s + BODY_R), v.z + uz * (s + BODY_R), v.y)) {
            v.blockT = (v.blockT || 0) + dt;
            if (v.blockT > 0.8) {
                v.blockT = 0;
                const a = v.pathI > 0 ? v.path[v.pathI - 1] : g.nearest(v.x, v.y, v.z), b = v.path[v.pathI];
                // (cut only where the world was broken: a way as it was built is never given up for good)
                if (a >= 0 && a !== b && this._nearBreak(v.cs, g.nodes[a], n) && !this._edgeWalkable(g.nodes[a], n)) {
                    (v.cs.cut || (v.cs.cut = new Set())).add(edgeKey(a, b));
                    if (!this._goTo(v, v.path[v.path.length - 1], v.pathCost)) { v.path = null; v.speed = 0; return true; }
                    return false;
                }
                // (the way itself is whole — it's where it stands: round the walls to it, block by block)
                if (!(v.gridT > (this._clock || 0))) {
                    v.gridT = (this._clock || 0) + 3;
                    const w = this._gridWay(v, n);
                    if (w) { w.goal = b; v.gridWay = w; return false; }
                }
            }
            this._steer(v, tx, tz, speed, dt);
            return false;
        }
        v.blockT = 0;
        v.x += ux * s; v.z += uz * s;
        v.yaw = turn(v.yaw, Math.atan2(-ux, -uz), dt * 8);
        v.speed = speed;
        return false;
    }

    /** At a door shut by «Lock»: stand and knock now and then; after a while give the way up (true: the path is over). */
    _lockedOut(v, dt) {
        v.speed = 0;
        const t0 = v.knockT || 0;
        v.knockT = t0 + dt;
        if (Math.floor(v.knockT / 1.6) !== Math.floor(t0 / 1.6)) {
            const me = this.game.character?.group?.position;
            if (me && Math.hypot(me.x - v.x, me.z - v.z) < 25) this.game.sound?.playHammer?.({ x: v.x, y: v.y + 1.4, z: v.z }, 0.35);
        }
        if (v.knockT < 6) return false;
        v.knockT = 0;
        v.path = null; // (they go elsewhere: their day picks a new place)
        return true;
    }

    /**
     * The way on foot from where it stands to a point `to` {x, y, z} (≤ ~20 m off), block by block:
     * round walls, up and down steps one can walk (a search over the blocks one can stand on — the
     * same `_walkable` as every step). → [{x, z}…] (the corners only) or null.
     */
    _gridWay(v, to, maxCells = 1800) {
        const t = this.game.world?.terrain?.data;
        if (!t) return null;
        const sx = Math.round(v.x), sz = Math.round(v.z), gx = Math.round(to.x), gz = Math.round(to.z);
        if (Math.abs(gx - sx) > 22 || Math.abs(gz - sz) > 22) return null;
        const key = (x, z) => (x - sx + 64) * 256 + (z - sz + 64);
        const open = [[Math.hypot(gx - sx, gz - sz), 0, sx, sz, v.y]];
        const seen = new Map([[key(sx, sz), null]]);
        let found = null, n = 0;
        while (open.length && n++ < maxCells) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
            const [, c, x, z, y] = open[bi];
            open[bi] = open[open.length - 1]; open.pop();
            if (Math.abs(x - gx) <= 1 && Math.abs(z - gz) <= 1 && Math.abs(y - to.y) < 2) { found = key(x, z); break; }
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const nx = x + dx, nz = z + dz, k = key(nx, nz);
                if (seen.has(k) || Math.abs(nx - sx) > 24 || Math.abs(nz - sz) > 24) continue;
                if (!this._walkable(nx, nz, y)) continue;
                if (dx && dz && (!this._walkable(x + dx, z, y) || !this._walkable(x, z + dz, y))) continue; // (no cutting a corner)
                const ny = t.floorBelow(nx, nz, Math.round(y + 1.5) + 1) - 0.5;
                seen.set(k, key(x, z));
                const nc = c + (dx && dz ? 1.414 : 1);
                open.push([nc + Math.hypot(gx - nx, gz - nz), nc, nx, nz, ny]);
            }
        }
        if (found == null) return null;
        const cells = [];
        for (let k = found; k != null; k = seen.get(k)) cells.push({ x: Math.floor(k / 256) - 64 + sx, z: (k % 256) - 64 + sz });
        cells.reverse();
        // (only where it turns: a straight run is one step)
        const out = [];
        for (let i = 1; i < cells.length; i++) {
            const a = cells[i - 1], b = cells[i], c = cells[i + 1];
            if (!c || (b.x - a.x) !== (c.x - b.x) || (b.z - a.z) !== (c.z - b.z)) out.push(b);
        }
        out.push({ x: to.x, z: to.z });
        return out;
    }

    /** Can one walk straight from where it stands to (x, z) — up and down the ground as it goes (≤ 40 m looked at)? */
    _lineWalk(v, x, z) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const d = Math.hypot(x - v.x, z - v.z), n = Math.min(50, Math.ceil(d / 0.8));
        let y = v.y;
        for (let i = 1; i <= n; i++) {
            const px = v.x + (x - v.x) * i / n, pz = v.z + (z - v.z) * i / n;
            if (!this._walkable(px, pz, y)) return false;
            y = t.floorBelow(Math.round(px), Math.round(pz), Math.round(y + 1.5) + 1) - 0.5;
        }
        return true;
    }

    /** Can one walk the straight way between two path nodes (the floor there, no wall across)? */
    _edgeWalkable(a, b) {
        const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.6));
        for (let i = 0; i <= n; i++) {
            const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, y = a.y + (b.y - a.y) * k;
            // (a stair is not a straight slope: a step a block above or below the line is still the way)
            if (!this._walkable(x, z, y) && !this._walkable(x, z, y + 1) && !this._walkable(x, z, y - 1)) return false;
        }
        return true;
    }

    /**
     * For the search of a way round a hill (HillWay.RoutePlanner): the height at (nx, nz) when one can walk there from
     * (x, z, y) — every step the same `_walkable` as the walk itself, a ledge of two blocks too (it is climbed:
     * `_tryClimb`) — else null. Ground not yet brought by the workers is shut (never made in a frame).
     */
    routeStep(x, z, y, nx, nz) {
        const t = this.game.world?.terrain?.data;
        if (!t) return y;
        if (t.landMade && !t.landMade(nx, nz)) return null;
        const n = Math.max(2, Math.ceil(Math.hypot(nx - x, nz - z) / 0.7));
        let yy = y;
        for (let i = 1; i <= n; i++) {
            const px = x + (nx - x) * i / n, pz = z + (nz - z) * i / n;
            let up = 0;
            if (!this._walkable(px, pz, yy)) { if (!this._walkable(px, pz, yy + 1)) return null; up = 1; }
            yy = t.floorBelow(Math.round(px), Math.round(pz), Math.round(yy + 1.5) + 1 + up) - 0.5;
        }
        return yy;
    }

    /**
     * (host) The world broke at `pos` (a blast, «Gather», a wall come down): the ways of the castle /
     * tower through that place which one can't walk any more are cut — nobody's path goes over the
     * hole or through the rubble, and whoever was on such a way looks for another at once. (A cut
     * way is looked at again now and then: the builders put it back — Rebuild.js.)
     */
    breakWays(pos, r) {
        for (const cs of this.castles.values()) {
            if (!cs.graph.nodes.length || !this._inLand(cs.def, pos, r + 12)) continue;
            const br = cs.breaks || (cs.breaks = []);
            br.push({ x: pos.x, y: pos.y ?? 0, z: pos.z, r });
            if (br.length > 24) br.shift();
            const N = cs.graph.nodes, py = pos.y ?? 0;
            let any = false;
            for (const [a, b] of cs.def.edges) {
                const A = N[a], B = N[b];
                if (Math.min(A.y, B.y) > py + r + 3 || Math.max(A.y, B.y) < py - r - 4) continue;
                if (segDist2(A.x, 0, A.z, B.x, 0, B.z, pos.x, 0, pos.z) > (r + 2) * (r + 2)) continue;
                const k = edgeKey(a, b);
                if (this._edgeWalkable(A, B)) { cs.cut?.delete(k); continue; }
                (cs.cut || (cs.cut = new Set())).add(k);
                any = true;
            }
            if (!any) continue;
            for (const v of cs.active.values()) {
                if (!v.path || v.dead || v.pathI >= v.path.length) continue;
                let hit = false;
                for (let i = Math.max(1, v.pathI); i < v.path.length && !hit; i++) hit = cs.cut.has(edgeKey(v.path[i - 1], v.path[i]));
                if (hit && !this._goTo(v, v.path[v.path.length - 1], v.pathCost)) v.path = null;
            }
        }
    }

    /** Does the way a→b pass a place where the world was broken (a blast, rubble — breakWays)? */
    _nearBreak(cs, a, b) {
        for (const p of cs.breaks || []) {
            if (Math.min(a.y, b.y) > p.y + p.r + 6 || Math.max(a.y, b.y) < p.y - p.r - 6) continue;
            if (segDist2(a.x, 0, a.z, b.x, 0, b.z, p.x, 0, p.z) < (p.r + 4) * (p.r + 4)) return true;
        }
        return false;
    }

    /** (host) Now and then: a cut way that one can walk again (put back) is open again. */
    _healWays(dt) {
        this._healT = (this._healT || 0) - dt;
        if (this._healT > 0) return;
        this._healT = 5;
        for (const cs of this.castles.values()) {
            if (!cs.cut?.size) continue;
            const N = cs.graph.nodes;
            for (const k of [...cs.cut]) { const a = Math.floor(k / 65536), b = k % 65536; if (N[a] && N[b] && this._edgeWalkable(N[a], N[b])) cs.cut.delete(k); }
        }
    }

    /** How wide one is (m): others keep this clear of it. */
    _bodyR(v) { return v.role === 'knight' || v.role === 'king' ? 0.7 : 0.5; }

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
        if (!v.wallW?.inWay && speed > 0) { const r = this._wallGuard(v, tx, tz, d, stopAt, speed, dt); if (r !== null) return r; }
        const s = Math.min(d - stopAt, speed * slowFactor(v) * slopePace(v.slope) * dt);
        // a ledge right ahead (half a body high): climb it rather than inch at it
        if (!this._walkable(v.x + dx / d * 0.75, v.z + dz / d * 0.75, v.y) && this._tryClimb(v, dx / d, dz / d)) { v.speed = 0; return d; }
        // somebody in the way (a player, another person, an animal): round them on the side with room;
        // in a narrow spot wait a moment for them to move (then squeeze past)
        let ux = dx / d, uz = dz / d;
        let kk = 1; // (the share of full speed the pilot asks for: slower in a queue, behind a slower one — Pilot.js)
        if (speed > 0) {
            const a = crowdStep(this.game, v, v, ux, uz, Math.max(0.1, d - stopAt - 0.2), { r: this._bodyR(v), speed: speed * slowFactor(v), dt, room: (x, z) => this._walkable(x, z, v.y), rank: (v.cmd || v.order || v.follow || v.foe) ? 1 : 0 });
            if (!a) { v.speed = 0; return d; }
            if (a.unstick) { // (stuck for ~10 s among the others or the walls: set on the nearest free place — never a permanent stand)
                if (this._walkable(a.unstick.x, a.unstick.z, v.y)) { this.alog?.decision(v, `долго без движения — выставлен на свободное место (${v.x.toFixed(1)}, ${v.z.toFixed(1)}) → (${a.unstick.x.toFixed(1)}, ${a.unstick.z.toFixed(1)})`); v.x = a.unstick.x; v.z = a.unstick.z; }
                v.speed = 0; return d;
            }
            ux = a.x; uz = a.z; kk = a.k ?? 1;
        }
        const s2 = s * kk; speed *= kk;
        const nx = v.x + ux * s2, nz = v.z + uz * s2;
        // (the body has a thickness: the shoulder never goes into a wall — a step's room is looked at a little ahead)
        const B = BODY_R;
        if (this._walkable(nx, nz, v.y) && this._walkable(nx + ux * B, nz + uz * B, v.y)) { v.x = nx; v.z = nz; v.speed = speed; }
        else if (Math.abs(ux) > 0.05 && this._walkable(nx, v.z, v.y) && this._walkable(nx + Math.sign(ux) * B, v.z, v.y)) { v.x = nx; v.speed = speed; }
        else if (Math.abs(uz) > 0.05 && this._walkable(v.x, nz, v.y) && this._walkable(v.x, nz + Math.sign(uz) * B, v.y)) { v.z = nz; v.speed = speed; }
        else if (this._tryClimb(v, dx / d, dz / d)) v.speed = 0;
        else {
            // a wall ahead too high to climb: try round it (along the wall, either way — the side it
            // already went first, for a while: no jittering left-right on the spot against a wall)
            v.speed = 0;
            const a0 = Math.atan2(dz, dx);
            const sd = v.slide && v.slide.until > (this._clock || 0) ? v.slide.sign : 1;
            for (const k of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
                const da = k * sd;
                const ax = Math.cos(a0 + da), az = Math.sin(a0 + da);
                if (this._walkable(v.x + ax * s, v.z + az * s, v.y) && this._walkable(v.x + ax * (s + B), v.z + az * (s + B), v.y)) { v.x += ax * s; v.z += az * s; v.speed = speed; v.slide = { sign: Math.sign(da), until: (this._clock || 0) + 1.5 }; break; }
                if (Math.abs(da) <= 1.6 && this._tryClimb(v, ax, az)) break;
            }
        }
        return d;
    }

    /**
     * Walls between it and the goal that the straight way does not see (a house built by magic, rubble):
     * no progress for a while → the way round block by block (gridWay) and along it; no way (a shut house,
     * a door it can't pass) → it backs off from the wall, stands, and after WALL.LEAVE s gives the goal up.
     * → null: go on as usual; a number: this step is done (the distance to the goal).
     */
    _wallGuard(v, tx, tz, d, stopAt, speed, dt) {
        const W = v.wallW || (v.wallW = { t: 0, best: Infinity, gx: tx, gz: tz, way: null, noWay: 0, planAt: -9 });
        const clock = this._clock || 0;
        if (Math.hypot(tx - W.gx, tz - W.gz) > 4) { W.gx = tx; W.gz = tz; W.t = 0; W.best = Infinity; W.way = null; W.noWay = 0; }
        if (W.noWay > 0) {
            W.noWay += dt;
            if (W.noWay > WALL.LEAVE) { W.noWay = 0; W.t = 0; W.best = Infinity; W.planAt = clock + 10; this._giveUp(v); v.speed = 0; return d; }
            // (a polite distance from the wall: back off, face the goal, wait)
            v.yaw = turn(v.yaw, Math.atan2(-(tx - v.x), -(tz - v.z)), dt * 6);
            if (Math.hypot(v.x - W.bx, v.z - W.bz) < WALL.KEEP && d < WALL.KEEP + stopAt + 3) {
                const ux = (v.x - tx) / (d || 1), uz = (v.z - tz) / (d || 1), st = Math.min(0.9, speed) * dt;
                if (this._walkable(v.x + ux * (st + BODY_R), v.z + uz * (st + BODY_R), v.y)) { v.x += ux * st; v.z += uz * st; v.speed = 0.9; return d; }
            }
            v.speed = 0;
            return d;
        }
        if (W.way) {
            const p = W.way[0];
            if (!p) { W.way = null; return null; }
            W.inWay = true;
            const r = this._steer(v, p.x, p.z, speed, dt, 0.25);
            W.inWay = false;
            if (r < 0.45) W.way.shift();
            if (!W.way.length) { W.way = null; W.t = 0; W.best = Infinity; }
            else if (v.speed === 0 && (W.stuckT = (W.stuckT || 0) + dt) > 2.5) { W.stuckT = 0; W.way = null; W.planAt = -9; } // (even the way round is shut now: look again)
            else if (v.speed > 0) W.stuckT = 0;
            return d;
        }
        // (is it getting nearer? a slide along a wall that makes no way is not)
        if (d < W.best - 0.3) { W.best = d; W.t = 0; } else W.t += dt;
        if (W.t < WALL.PLAN || d < stopAt + 0.5 || clock < W.planAt) return null;
        W.planAt = clock + 3; W.t = 0;
        if (d > 22 || this._lineWalk(v, tx, tz)) return null; // (far: not a wall of a house; the straight way is open: it's the crowd, not a wall)
        const w = this._gridWay(v, { x: tx, y: v.y, z: tz }, 1200);
        if (w && w.length) { W.way = w; W.best = Infinity; W.stuckT = 0; return null; }
        // no way at all: it knows the wall is shut
        W.noWay = 0.001; W.bx = v.x; W.bz = v.z;
        return null;
    }

    /** Standing is right for it now (asleep, talking, waiting for a player, at its post, in a fight…): not «stuck». */
    _standsFine(v) {
        if (v.dead || v.sleep || v.handLink || v.lev || v.climb || v.seated || v.talking > 0 || v.stunT > 0 || v.bowing > 0 || v.giveT > 0) return 'state';
        if (v.foe || v.follow || v.investigate || v.fleeT > 0 || v.fireT > 0 || v.order || v.servantOf != null || v.fear || v.chore || v.waitT > 0) return 'busy';
        if (v.mode !== 'walk' && v.mode !== 'run' && v.mode !== 'idle') return 'mode';
        if (v.job === 'king' || v.job === 'guard' || v.job === 'stall' || (v.post && Math.hypot(v.post.x - v.x, v.post.z - v.z) < 2)) return 'post';
        if (v.wallW?.noWay > 0) return 'wall'; // (it stands off a shut wall on purpose, and lets go of the goal by itself)
        if (this.game.isNight && this.night?.asleepTime?.()) return 'night';
        if (this._players().some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 4)) return 'player'; // (waits for a player / is blocked by one)
        return null;
    }

    /** Why it stands: for the log. */
    _whyStuck(v) {
        const land = this.game.world?.terrain?.data;
        if (land?.landMade && !land.landMade(v.x, v.z)) return 'ждёт землю (воркеры не принесли)';
        const g = v.cs?.graph;
        if (!g || !g.nodes.length) return 'нет узлов пути в месте';
        if (g.nearest(v.x, v.y, v.z, 6) < 0) return 'нет узла рядом (вне путей)';
        if (!v.path || v.pathI >= v.path.length) return `путь пуст (работа ${v.job}, режим ${v.mode})`;
        const near = crowdNear(this.game, v.x, v.y, v.z, 1.6, v) || [];
        if (near.length) return `заблокирован: ${near[0].ref?.role || near[0].kind || 'кто-то'} ${near[0].ref?.id ?? ''}`;
        if (!this._walkable(v.x, v.z, v.y)) return 'стоит в непроходимом месте';
        return `упирается в препятствие на пути (узел ${v.path[v.pathI]})`;
    }

    /** A new way for a stuck one: the path and all it was doing with it forgotten, cut ways looked at again. */
    _replan(v) {
        v.path = null; v.gridWay = null; v.wallW = null; v.detourT = 0; v.backT = 0; v.holdT = 0;
        if (v.cs?.cut?.size) v.cs.cut.clear();
        return true;
    }

    /** The nearest place of its castle's ways where one can stand (for one stuck out of sight). */
    _nearestFree(v) {
        const g = v.cs?.graph;
        if (!g?.nodes.length) return null;
        let best = null, bd = Infinity;
        for (const n of g.nodes) {
            const d = Math.hypot(n.x - v.x, n.z - v.z) + Math.abs(n.y - v.y) * 2;
            if (d < bd && d > 0.5 && this._walkable(n.x, n.z, n.y)) { bd = d; best = n; }
        }
        return best ? { x: best.x, y: best.y, z: best.z } : null;
    }

    /** The goal can't be reached (a shut wall): it lets go of it and goes about its day. */
    _giveUp(v) {
        v.path = null; v.gridWay = null;
        if (v.follow && !v.followFar) v.follow = null; // (one on the march with me waits at a shut wall — the way round is looked for — and does not lose me)
        if (v.investigate) v.investigate = null;
        v.waitT = Math.max(v.waitT || 0, 6);
        v.mode = 'idle';
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
        // (a post, a pillar, a fence is no ledge: the top must be as wide as steps are — HillWay.ledgeWide)
        if (!ledgeWide((x, z) => t.floorBelow(x, z, f + 1), ax, az, nx, nz, f)) return false;
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
        // (the blocks' answer for this cell is remembered until the world's blocks change — t.version: the people's steps
        // ask the same cells hundreds of times a frame, each a few block lookups; 60 people in a castle spent ~1 ms here)
        const wc = this._walkMemo || (this._walkMemo = new Map());
        if (this._walkVer !== t.version || wc.size > 60000) { wc.clear(); this._walkVer = t.version; }
        const key = (ix * 2097152 + iz) * 1024 + (L & 1023);
        let cell = wc.get(key);
        if (cell === undefined) { cell = this._walkCell(t, ix, iz, L); wc.set(key, cell); }
        if (cell === 0) return false;
        // (up a ramp — BlockShapes.js: its surface right where the body steps, not its cell's top, is the step)
        if (cell === 2 && !(t.floorAt(x, z, y + 1.1) <= y + 1.1)) return false;
        if (this.game.carriages?.list.size && this.game.carriages.blocksAt(x, z, y)) return false; // (a cart on the road: round it)
        if (treeAt(this.game, x, z, 0.45)) return false; // (a tree that is a model — an apple tree: never through its trunk)
        if (this.game.locks?.spelled?.size && this.game.locks.blocksAt(x, z, y)) return false; // (a door shut by «Lock»)
        return true;
    }

    /** The blocks' part of _walkable for a cell: 0 — no, 1 — yes, 2 — yes if the ramp's surface right there is low enough. */
    _walkCell(t, ix, iz, L) {
        const f = t.floorBelow(ix, iz, L + 1);
        const ramp = f === L + 1 && !!t.shapeAt?.(ix, f, iz);
        if ((f > L && !ramp) || f < L - 3) return 0;
        // deep water is no ground: nobody walks into it (nor after a foe swimming there — CreatureSwim.js)
        if (t.get(ix, f + 1, iz) === BLOCK.WATER && t.get(ix, f + 2, iz) === BLOCK.WATER && t.get(ix, f + 3, iz) === BLOCK.WATER) return 0;
        if (t.solidIn(ix, iz, f + 1, f + 5)) return 0;
        return f > L ? 2 : 1;
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
            const w = this._deepWater(v);
            if (w && v.y >= w.surface - 0.6) return; // (the body floats)
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
        // into deep water: a splash, the water holds the body up (it swims — or, dead, floats)
        const w = v.vy < 0 ? this._deepWater(v) : null;
        if (w) {
            const fy = v.dead ? w.surface - 0.3 : w.surface - SWIMMERS.person.float;
            if (v.y <= fy) {
                if (v.vy < -3) this._splash(v, w.surface, true);
                v.y = fy; v.vy = 0; v.vx = 0; v.vz = 0; v.flyFlail = false;
                return;
            }
        }
        const gy = g.collision.groundAt ? g.collision.groundAt(v.x, v.z, v.y + 1.1) : g.collision.groundY(v.x, v.z);
        if (v.y <= gy && v.vy < 0) { v.y = gy; v.vy = 0; v.vx = 0; v.vz = 0; v.flyFlail = false; }
    }

    /** Deep water where the body is (off its feet), or null. */
    _deepWater(v) {
        const w = waterAt(this.game.world?.terrain?.data, v.x, v.z, v.y);
        return w && w.depth >= CSWIM.DEEP ? w : null;
    }

    /** A splash where a body goes into the water (every computer sees the drops; the host's sound). */
    _splash(v, surface, big = false) {
        const st = { splT: 0 };
        splashes(this.game, v.x, surface, v.z, 0, big, st);
        if (big) splashes(this.game, v.x, surface, v.z, 0, big, { splT: 0 });
    }

    /**
     * (host) In deep water (CreatureSwim.js): it swims at the top to the nearest place to get out
     * and pulls itself out there; a knight / the king in plates goes slowly, low — no way out for
     * long, he throws the plates off; nowhere at all (the sea): it tires and drowns. True: swimming.
     */
    _swim(v, dt) {
        const t = this.game.world?.terrain?.data;
        if (!t || v.seated) return false;
        const heavy = (v.role === 'knight' || v.role === 'king') && !v.stripped && v.maxArmor > 0;
        const kind = heavy ? SWIMMERS.heavy : SWIMMERS.person;
        if (!v.sw && !deepAt(t, v.x, v.z, v.y, kind.deep)) return false; // (the usual case: dry land, the shallows)
        const sw = v.sw || (v.sw = {});
        const r = swimStep(v, sw, kind, { t, home: v.cs.def }, dt);
        if (!r) { v.sw = null; return false; } // (on its feet again: the shallows)
        v.path = null; v.investigate = null; v.bowing = 0;
        if (!sw.said) {
            sw.said = true;
            if (heavy) this._say(v, pick(SWIM_LINES.heavy), 3);
            else if (Math.random() < 0.6) this._say(v, pick(SWIM_LINES.wet), 3);
        }
        if (r === 'shed') {
            // the plates pull him down: off with them — they sink, to lie on the bottom
            this.game.armor?.shedVillager?.(v);
            if (!v.stripped) { v.stripped = true; v.armor = 0; v.maxArmor = 0; } // (no armour system: the same in numbers)
            sw.t = 0; sw.noWayT = 0; sw.findT = 0;
        } else if (r === 'drown') {
            v.hp = Math.max(0, v.hp - 1);
            v.barT = 8;
            if (v.hp <= 0) { this._die(v, v.foe ?? null); return true; }
            if (Math.random() < 0.3) this._say(v, pick(SWIM_LINES.drown), 2);
        } else if (r.out) {
            // at the edge: hands on it, pulled up and out (as up a ledge: _climbStep)
            const o = r.out;
            v.sw = null;
            v.yaw = Math.atan2(-(o.x - v.x), -(o.z - v.z));
            v.climb = { t: 0, dur: 0.8 + Math.max(0, o.y - v.y - 1) * 0.5 + (heavy ? 0.6 : 0), x0: v.x, y0: v.y, z0: v.z, x1: o.x, y1: o.y, z1: o.z };
            this._splash(v, o.y, false);
            return true;
        }
        v.mode = heavy || sw.under ? 'paddle' : 'swim';
        v.speed = sw.moving ? kind.speed : 0;
        return true;
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
        if (v.carriedBy) { v.mode = 'flail'; v.speed = 0; return; } // (in a gargoyle's claws: hanging, kicking — Gargoyles._carry holds the place)
        if (v.lev) { v.mode = v.lev.body ? 'dead' : 'flail'; v.speed = 0; return; } // (kicking in the air: VillagerModel 'flail')
        // stunned / frozen / thrown up by a spell
        if (v.stunT > 0 || v.vy) {
            v.stunT = (v.stunT || 0) - dt;
            if (v.vy) this._fallStep(v, dt);
            else this._ground(v); // (knocked back / lying: follows the ground, a slope too)
            v.mode = v.flyFlail ? 'flail' : 'idle'; v.speed = 0; // (thrown by «Левиоса»: arms and legs going as it flies)
            return;
        }
        if (v.climb) { this._climbStep(v, dt); return; }
        // a road fighter's own reaction time passed (WandererMind): now he acts; a commoner's decision runs out (the fear is gone)
        if (v.wLag && (v.wLag.t -= dt) <= 0) { const f = v.wLag.fn; v.wLag = null; if (!v.dead) f(); }
        if (v.wm && v.wm.until && Date.now() > v.wm.until) this._wanderCalm(v);
        // startled (a spell flew past, a blast near — Startle.js): a flinch and a turn to where it came from
        if (v.flinchT > 0) {
            v.flinchT -= dt;
            const f = v.flinchFrom;
            if (f && !v.seated) v.yaw = turn(v.yaw, Math.atan2(-(f.x - v.x), -(f.z - v.z)), dt * 6);
            v.speed = 0;
            v.mode = v.flinchT > STARTLE.FLINCH * 0.45 ? 'flinch' : 'idle';
            this._ground(v);
            return;
        }
        // in deep water: swims (never walks the bottom) — to the bank, and out
        if (this._swim(v, dt)) return;
        // a knight on duty: a creature with a «Империус» mind walks about his castle — told to go, shooed, beaten (ImperiusGuards.js)
        if (v.impDuty && g.imperius?.guards?.guardStep(v, dt)) return;
        // riding on a cart: on its seat (the cart's people get down when trouble comes — Travelers.js)
        if (v.seated && v.job === 'cart' && !v.foe && !v.fear && !(v.fleeT > 0) && g.travelers?.step(v, dt)) return;
        if (v.seated && v.job === 'ride' && g.travelers?.step(v, dt)) return; // (in the saddle: Riders.js leads the horse — and gets down to fight)
        // got inside a wall somehow (a shove, a blink, a blast that moved the blocks): out to the nearest free place
        if (!v.seated && (v.wallT = (v.wallT || 0) - dt) <= 0) { v.wallT = 0.5; this._unwall(v); }
        // the hero is a monster (MonsterFear.js): most run, a quarter of the knights fight, the wizards who know «Nihilis Atra» scatter it
        if (this.mfear.step(v, dt)) return;
        // a great fire close by (the Hellfire): back off from it behind the shield, or run (fear())
        if (v.fireT > 0 && this._fireStep(v, dt)) return;
        // «Брейнрот»: a servant follows its master and fights for them
        if (v.servantOf != null && this._serve(v, dt)) return;
        // the infernal gargoyles (Gargoyles.js): a knight near one runs under it and strikes when it is low
        if (g.gargoyles?.list.length && g.gargoyles.knightStep(v, dt)) return;
        if (g.customCreatures?.list.length && g.customCreatures.knightStep(v, dt)) return; // (a hostile creature of one's own near: the knights fight it — CustomCreatures.knightStep)
        if (v.arena && g.arenaDuels?.step(v, dt)) return; // (at the duel arena: a fan on the stands, a duellist — ArenaDuels.js)
        if (v.wizard && this.wizards.think(v, dt)) return; // (a wizard: its own fight and magic)
        if (v.role === 'king') this._kingNerve(v, dt); // (the king hides by default; he fights only when most of his guard is dead or he is cornered: KingNerve.js)
        // a hostile player in sight: knights go for them
        if (this._fights(v) && !v.foe) {
            v.lookT = (v.lookT || 0) - dt;
            if (v.lookT <= 0) {
                v.lookT = 0.6;
                for (const [pid, until] of cs.hostile) {
                    if (until < Date.now()) { cs.hostile.delete(pid); continue; }
                    const p = this._playerPos(pid);
                    // (just given up on them out there: only if they come back near)
                    if (isLord(v, pid, this.lordOf(cs, pid))) continue; // (the king and his friends are never his own men's enemy)
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
        if (v.magicPieces && !v.stripped && v.armor < v.maxArmor && v.hp > 0) v.armor = Math.min(v.maxArmor, v.armor + ARMOR.REGEN * (v.maxArmor / 40) * dt); // (magic pieces mend by themselves)
        if (v.foe != null && isLord(v, v.foe, this.lordOf(cs, v.foe))) { v.foe = null; v.grudge = null; v.lesson = null; } // (whatever happened — a shove, a blast, a spell: never at the king)
        if (v.gOwner != null && this.guard.step(v, dt)) return; // (a bodyguard: the king's enemy first, the formation round him)
        if (v.foe) { this._fight(v, dt); return; }
        if (v.order && this.orders.step(v, dt)) return; // (the king's orders: hunt, defend)
        if (v.investigate && this._investigate(v, dt)) return;
        if (this.fright.step(v, dt)) return; // (danger near: hiding, running away, looking out, buckets)
        if (v.cmd && this.cmds.step(v, dt)) return; // (a plain-word command: a pose, a walk, a place in the line, a spar)
        if (v.job === 'rebuild' && this.rebuild.work(v, dt)) return; // (a builder at the repairs)
        if ((v.pack > 0 || v.rounds) && this.night?.duty(v, dt)) return; // (a merchant packing up, the watch's rounds)
        if (v.fleeT > 0) { this._fleeStep(v, dt); return; }
        if (v.watch && this.watch.step(v, dt)) return; // (a stranger inside the walls: one knight keeps an eye on him)
        // the new king comes by: bow
        const st = this.state(cs.def.id);
        if (st.owner && v.bowT <= 0 && !v.follow && !v.order) { // (a bow once, not on the march and not at every step)
            const op = this._playerPos(st.owner);
            if (op && Math.hypot(op.x - v.x, op.z - v.z) < 6 && this._sees(v, op)) { // (a wall: he does not bow to one he cannot see)
                v.bowT = 150; // (game seconds before the next bow)
                v.bowing = 1.6;
                v.yaw = Math.atan2(-(op.x - v.x), -(op.z - v.z));
                if (!this.talk.inTalk?.()) this._say(v, pick(SHOUT.bow)); // (a bow, but no cry in the middle of my talk)
            }
        }
        v.bowT -= dt;
        if (v.bowing > 0) { v.bowing -= dt; v.mode = 'bow'; v.speed = 0; return; }
        if (v.giveT > 0) { v.giveT -= dt; v.mode = 'offer'; v.speed = 0; this._ground(v); return; } // (a merchant's hand out for the coins)
        // talking with a player: stops and looks at them (the king keeps his seat)
        if (v.talking > 0 && v.job !== 'king' && !this._talkBlind(v, dt)) {
            const tp = this._playerPos(v.talkTo || g.localId);
            const gp = v.glance || tp; // (shown a place with the hand: he faces it, not me — CommandTalk._begin)
            if (gp) v.yaw = turn(v.yaw, Math.atan2(-(gp.x - v.x), -(gp.z - v.z)), dt * 6);
            v.mode = 'talk'; v.speed = 0;
            // (a comfortable distance for a talk: too close — a small step back, still facing me)
            const dd = tp ? Math.hypot(tp.x - v.x, tp.z - v.z) : 9;
            const want = v.job === 'merchant' && v.post ? SPACE.TALK_MIN : talkDistance(this.rel?.eff?.(v, v.talkTo || g.localId)); // (a trader at his counter stays at it)
            if (dd < want && dd > 1e-3 && v.job !== 'stall') {
                const s = Math.min(want - dd, 1.3 * dt), nx = v.x + (v.x - tp.x) / dd * s, nz = v.z + (v.z - tp.z) / dd * s;
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
                // (the king sits on the throne: each follower stands on his own free place before the dais — never into the throne or each other)
                const hs = this._hallSlot(v, fp);
                if (hs) {
                    const dh = Math.hypot(hs.x - v.x, hs.z - v.z);
                    if (dh > 0.7) { this._steer(v, hs.x, hs.z, dh > 8 ? RUN : WALK, dt, 0.5); v.mode = v.speed > WALK ? 'run' : v.speed > 0 ? 'walk' : 'idle'; }
                    else { v.speed = 0; v.mode = 'idle'; v.yaw = turn(v.yaw, hs.yaw, dt * 4); }
                    this._ground(v);
                    return;
                }
                // (each follower has a place of his own round the hero — behind him, spread out; not all in one heap on one point)
                const sl = this._followSlot(v, fp);
                const d0 = Math.hypot(sl.x - v.x, sl.z - v.z), d = this._goSpot(v, sl.x, sl.z, Math.hypot(fp.x - v.x, fp.z - v.z) > 8 ? RUN : WALK, dt, 0.9, fp.y - 1.95) ? Math.min(d0, 3.5) : d0; // (on another floor — down a tower: only by its stair, never off the edge; 3–5 blocks off, not pressed to the king) // (by the castle's paths when walls are between — a tower's wall, a house)
                v.mode = d > 3.2 && !(v.wallW?.noWay > 0) ? (v.speed > WALK ? 'run' : 'walk') : 'idle'; // (standing off a shut wall: idle)
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
                const loop = v.loopIds || v.cs.def.wallWalk; // (a yard / quay round — KnightStaff.js — or the wall walk)
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
                if (v.chore && this.chores.step(v, dt)) break; // (at their chore)
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
                if (v.chore) this.chores.walking(v); // (a bucket, a sack carried home)
                if (this._followPath(v, dt, v.walk || WALK)) {
                    v.path = null;
                    if (v.chorePlan && this.chores.arrive(v)) break; // (came to do the chore)
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

    /**
     * What a frightened one runs from now: the place it was scared by (a blast, the hole it left),
     * the player it runs from, and every known enemy of its castle / tower about (seen — Blame.js).
     */
    _threats(v) {
        const T = [];
        if (v.fleeAt) T.push({ x: v.fleeAt.x, z: v.fleeAt.z, r: v.fleeAt.r ?? 10 });
        const now = Date.now();
        const add = (pid) => {
            const p = this._playerPos(pid);
            if (p && Math.hypot(p.x - v.x, p.z - v.z) < 70 && !T.some((t) => t.pid === pid)) T.push({ x: p.x, z: p.z, r: 14, pid });
        };
        if (v.fleeFrom != null) add(v.fleeFrom);
        for (const [pid, until] of v.cs.hostile) if (until > now) add(pid);
        return T;
    }

    /**
     * (host) Running away (a timid wizard, anybody told to flee, frightened by a blast or a player):
     * away from every threat and never past one (FleePlan.js). In a building or a tower — by its ways
     * to the farthest place it can reach without going near them (the stairs up, the back rooms, out
     * of a door on the far side); out in the open — straight away across the land, not along the road
     * that passes the attacker. Far enough: it stops and watches, and keeps away while the threat is
     * there (no walking back to the enemy when the time is up).
     */
    _fleeStep(v, dt) {
        const cs = v.cs;
        v.fleeT -= dt;
        v.seated = false;
        if (WIZ_JOBS.has(v.job)) { v.job = 'wander'; v.post = null; v.trips = 0; } // (the desk, the lectern: left behind)
        const F = v.flee || (v.flee = { t: 0, plan: null });
        F.t -= dt;
        if (F.t <= 0 || !F.T) { F.T = this._threats(v); }
        const T = F.T;
        const d = T.length ? threatDist(v, T) : Infinity;
        // the enemy still about: it goes on keeping away (a place it was scared at is feared only its own while)
        if (v.fleeT < 1.5 && T.some((t) => t.pid != null && threatDist(v, [t]) < FLEE.SAFE + 15)) v.fleeT = 1.5;
        if (v.fleeT <= 0 || !T.length) {
            v.fleeFrom = null; v.fleeAt = null; v.fleeing = false; v.path = null; v.flee = null; v.pathCost = null;
            if (v.job === 'wander') this._nextTrip(v);
            return;
        }
        if (F.t <= 0) {
            F.t = FLEE.REPLAN;
            const indoors = this._roofed(v);
            if (d >= FLEE.SAFE && !indoors) F.plan = { watch: true };
            else if (cs.graph.nodes.length && (indoors || this._inWalls(cs.def, v) || !F.plan?.open)) {
                // by the ways of the building — one search over the ways it can take (not through a broken one — a doorway gone into a
                // crater —, not into a threat): the farthest place for the least running, and the way there
                const g2 = cs.graph;
                if (!(F.plan?.node != null && v.path && v.pathI < v.path.length && !pathPasses(v.path.slice(v.pathI), g2.nodes, v, T))) {
                    const from = v.node != null && v.node >= 0 && Math.hypot(g2.nodes[v.node].x - v.x, g2.nodes[v.node].z - v.z) < 3 ? v.node : g2.nearest(v.x, v.y, v.z);
                    const r = fleeSearch(g2, from, v, T, { cut: cs.cut, key: edgeKey, maxRun: indoors ? 140 : 90, ...(v.shelter ? this._fleeExtras(v, T) : {}) });
                    if (r) { v.path = r.path; v.pathI = 0; v.goal = r.goal; F.plan = { node: r.goal }; v.pathCost = (n) => threatCost(n, T); } else { F.plan = null; v.path = null; }
                }
                if (!F.plan && !indoors) { const q = openWay(v, T, (x, z) => this._walkable(x, z, v.y)) || escapeWay(v, T, (x, z) => this._walkable(x, z, v.y)); F.plan = q ? { open: q } : { watch: true }; v.path = null; }
                if (!F.plan) { const q = escapeWay(v, T, (x, z) => this._walkable(x, z, v.y), 8); F.plan = q ? { open: q } : { watch: true }; } // (cornered inside: it cowers where it is, away from the windows it can't reach)
            } else {
                const q = openWay(v, T, (x, z) => this._walkable(x, z, v.y)) || escapeWay(v, T, (x, z) => this._walkable(x, z, v.y));
                F.plan = q ? { open: q } : { watch: true };
                v.path = null;
            }
        }
        const P = F.plan;
        // (running but not moving: the path / the point is shut by a counter, a wall — not the same again: another way round, out of the corner)
        if (P && !P.watch) {
            F.still = v.speed === 0 && (P.node != null || P.open) ? (F.still || 0) + dt : 0;
            if (F.still > 1.2) {
                F.still = 0; F.bad = (F.bad || 0) + 1;
                const q = escapeWay(v, T, (x, z) => this._walkable(x, z, v.y), 6 + F.bad * 2);
                this.alog?.decision(v, `бежит, но стоит на месте — другой путь прочь от угла: ${q ? `к (${q.x.toFixed(1)}, ${q.z.toFixed(1)})` : 'нет свободной стороны'}`);
                F.plan = q ? { open: q } : { watch: true }; v.path = null; F.t = FLEE.REPLAN;
            }
        }
        if (P?.node != null && v.path && v.pathI < v.path.length) {
            if (this._followPath(v, dt, RUN)) { v.path = null; F.t = 0; }
        } else if (P?.open) {
            const left = this._steer(v, P.open.x, P.open.z, RUN, dt, 1);
            if (left < 1.5 || v.speed === 0) F.t = Math.min(F.t, 0.2);
        } else {
            // far enough (or nowhere to go): stands and watches the danger, ready to run on
            v.speed = 0; v.path = null;
            const t = T.reduce((a, b) => (Math.hypot(b.x - v.x, b.z - v.z) < Math.hypot(a.x - v.x, a.z - v.z) ? b : a), T[0]);
            v.yaw = turn(v.yaw, Math.atan2(-(t.x - v.x), -(t.z - v.z)), dt * 5);
            if (d < FLEE.SAFE - 10) F.t = Math.min(F.t, 1); // (it came nearer: on again)
        }
        // (standing near it, nowhere farther to go: cowering — ducked, the arms over the head)
        v.mode = v.speed > 0 ? 'flee' : d < FLEE.SAFE * 0.6 ? 'flinch' : 'idle';
        this._ground(v);
    }

    /**
     * For a great fire: which places are SAFE (behind a wall from the fire, under a roof) and how many runners already head for each
     * (FleePlan: the score of a place goes down for every other one going there — they spread out, no heap). Walls looked at once a few
     * seconds for the whole place (the cache), not for every runner.
     */
    _fleeExtras(v, T) {
        const cs = v.cs, now = Date.now(), col = this.game.collision, data = this.game.world?.terrain?.data;
        const fires = T.filter((t) => t.pid == null);
        const key = fires.map((t) => `${Math.round(t.x / 3)},${Math.round(t.z / 3)}`).join('|');
        let C = cs.shelterCache;
        if (!C || C.key !== key || now - C.t > 4000) C = cs.shelterCache = { key, t: now, m: new Map() };
        const loads = new Map();
        for (const o of cs.active.values()) { if (o === v || o.dead) continue; const nd = o.flee?.plan?.node; if (nd != null) loads.set(nd, (loads.get(nd) || 0) + 1); }
        const bonus = (n, id) => {
            let b = C.m.get(id);
            if (b !== undefined) return b;
            b = 0;
            for (const t of fires) {
                if (col?.lineOfSight && !col.lineOfSight(t.x, n.y + 2.5, t.z, n.x, n.y + 2.5, n.z, 0.45)) b += 16; // (a wall between: the fire does not reach, the heat is held)
            }
            if (data?.solidIn) { const L = Math.round(n.y + 1.5); if (data.solidIn(Math.round(n.x), Math.round(n.z), L + 4, L + 14)) b += 6; } // (under a roof)
            C.m.set(id, b);
            return b;
        };
        return { bonus, load: (id) => loads.get(id) || 0 };
    }

    /** A roof over it (inside a house, the tower, a gate): the ways of the building lead out. */
    _roofed(v) {
        const t = this.game.world?.terrain?.data;
        if (!t) return false;
        const L = Math.round(v.y + 1.5);
        return t.solidIn(Math.round(v.x), Math.round(v.z), L + 4, L + 14);
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
            if (v.serveT <= 0 && facesTarget(v.yaw, v.x, v.z, e.x, e.z, FACE.MELEE)) { // («лицом к цели»)
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
        const gone = !fp || (!this._inLand(cs.def, fp, 30) && (d > LEASH || !this._inLand(cs.def, fp, 160))) || (v.wm?.stance === 'attack' && d > WANDER.LEASH); // (an ordinary traveller does not chase far: WandererMind.LEASH)
        // (the whole castle against them — or only this one, angry at this player: a blow, a theft)
        const grudge = v.grudge && v.grudge.id === v.foe && v.grudge.until > Date.now();
        if (v.lesson && (gone || Date.now() > v.lesson.until || v.lesson.casts >= LESSON.MAX_CASTS || this._pupilDown(v.foe))) { this._lessonOver(v); return; }
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
            // (out in the open beyond their land there are no paths: straight at them. Once on the paths
            // they keep to them a while — him seen and lost behind a corner step by step is no reason to turn every frame)
            if (d > 10 && !this._sees(v, fp) && this._inLand(cs.def, fp, 0)) v.byPathT = 1.5;
            else v.byPathT = (v.byPathT || 0) - dt;
            if (d > 10 && v.byPathT > 0 && this._inLand(cs.def, fp, 0)) {
                if (v.chaseT <= 0 || !v.path) {
                    v.chaseT = 1.5;
                    const to = cs.graph.nearest(fp.x, fp.y - 1.95, fp.z, 6);
                    if (v.path && to === v.goal && v.pathI < v.path.length) this._resyncPath(v); else this._goTo(v, to);
                }
                if (this._followPath(v, dt, RUSH)) { v.path = null; this._steer(v, fp.x, fp.z, RUSH, dt, 2.2); }
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
    /** (a follower inside the throne room, the followed one on / by the dais) his own free place before the dais, or null. */
    _hallSlot(v, fp) {
        const def = v.cs.def;
        if (!def.throne || !onDais(def, fp, 3.5) || !inHall(def, v, 2) || Math.abs(fp.y - 1.95 - v.y) > 4) return null;
        return this.hallClaims.spot(def.id + ':hall', this._hallSpots(def), v, this._clock || 0);
    }

    _hallSpots(def) { return def._hallSpots || (def._hallSpots = hallSpots(def)); }

    _goSpot(v, x, z, speed, dt, stop = 0.5, y = null) {
        const d = Math.hypot(x - v.x, z - v.z);
        // (a place on another floor — down the tower's stair to the foe, up to a gallery: there only by the stairs)
        const floor = y != null && Math.abs(y - v.y) > 2.5;
        if (d <= stop && !floor) { v.speed = 0; v.path = null; return true; }
        const cs = v.cs, c = this.game.collision;
        v.chaseT = (v.chaseT || 0) - dt;
        // (the paths only lead in and out of the walls; out in the open — straight. Once on the paths it
        // keeps to them a while: a wall's edge seen and lost step by step is no reason to turn every frame)
        const walls = d > 9 && (this._inWalls(cs.def, { x, z }) || this._inWalls(cs.def, v));
        // (seen is not walkable: a fence, a low wall, a ditch between — over them the eyes go, the feet don't)
        v.lineChkT = (v.lineChkT || 0) - dt;
        if (walls && v.lineChkT <= 0) { v.lineChkT = 0.4; v.lineOk = !(c.lineOfSight && !c.lineOfSight(v.x, v.y + 2.5, v.z, x, v.y + 2.5, z, 1.5)) && this._lineWalk(v, x, z); } // (looked at a few times a second)
        if (walls && !v.lineOk) v.byPathT = 1.5;
        else v.byPathT = (v.byPathT || 0) - dt;
        if (cs.graph.nodes.length && (floor || (walls && v.byPathT > 0))) {
            if (!v.path || v.chaseT <= 0) {
                v.chaseT = 2.5;
                // (the same place to go: the way it is on stays — no turning back and forth as the place shifts a little)
                const to = cs.graph.nearest(x, floor ? y : v.y, z, floor ? 3 : 6);
                if (!(v.path && to === v.goal && v.pathI < v.path.length)) this._goTo(v, to);
                else this._resyncPath(v);
            }
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
                // («лицом к цели»: drawn, he looses only turned fully to him — else holds the draw while he turns)
                if (tac.draw >= 1.3) { if (facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.ARROW)) { tac.draw = -(0.8 + Math.random() * 1.2); this._loose(v, sq, fp); } else tac.draw = 1.3; }
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

    /**
     * A place of his own for a follower round the one he follows (the author: «рыцари скапливаются возле меня»): all the followers of a player in a
     * castle are counted (by name — the same order every frame); they stand in rings 3.2 m, 5 m, 6.8 m… from him, 1.9 m apart on a ring, spread
     * over the half-circle BEHIND him (he looks forward: nobody blocks his way); standing still — the full circle. → { x, z } (his own place; the hero's
     * position when he is alone / far).
     */
    _followSlot(v, fp) {
        const clock = this._clock || 0;
        let S = this._fslots;
        if (!S || clock - S.at > 0.5) {
            S = this._fslots = { at: clock, by: new Map() };
            const lists = new Map();
            for (const w of this.byId.values()) {
                if (w.dead || !w.follow || w.job === 'king') continue;
                const key = w.cs.def.id + '|' + w.follow;
                let l = lists.get(key);
                if (!l) lists.set(key, (l = []));
                l.push(w);
            }
            for (const l of lists.values()) {
                l.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
                l.forEach((w, i) => S.by.set(w.id, { i, n: l.length }));
            }
        }
        const e = S.by.get(v.id);
        if (!e || e.n < 2) return fp;
        const g = this.game;
        const ch = v.follow === g.localId ? g.character?.group : g.remotes?.get(v.follow)?.character?.group || g.remotes?.get(v.follow)?.group;
        const yaw = ch?.rotation?.y;
        // rings: capacity by arc length
        let ring = 0, k = e.i, R = SPACE.FOLLOW_R0, cap = 0;
        for (;;) {
            cap = Math.max(3, Math.floor((Math.PI * 2 * R * (yaw == null ? 1 : 0.5)) / SPACE.FOLLOW_ARC));
            if (k < cap) break;
            k -= cap; ring++; R = SPACE.FOLLOW_R0 + ring * SPACE.FOLLOW_STEP;
            if (ring > 6) break;
        }
        // the angle: behind the hero (his back direction = yaw + π... his forward is (−sin y, −cos y)), a half circle; without a heading, the full circle
        const back = yaw == null ? 0 : Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const span = yaw == null ? Math.PI * 2 : Math.PI * 1.15;
        const t = cap > 1 ? k / (cap - 1) - 0.5 : 0;
        const ang = yaw == null ? (k / cap) * Math.PI * 2 + e.i * 0.0 : back + t * span;
        // (angle measured as the direction in x–z: the point at distance R in the direction `ang` from the hero, where 0 = +x; the «behind» direction of yaw y is (sin y, cos y))
        const bx = yaw == null ? Math.cos(ang) : Math.sin(yaw + t * span), bz = yaw == null ? Math.sin(ang) : Math.cos(yaw + t * span);
        return { x: fp.x + bx * R, z: fp.z + bz * R, y: fp.y };
    }

    /**
     * People don't walk through each other (the author: «текстуры накладываются друг на друга… никаких прикосновений»): every body that is a man's
     * (and the players' — they are never pushed, only walked round) is taken OUT of those it overlaps, by the sum of the real radii and a small gap.
     * Pilot.separate: all of the overlap that is his to undo (a standing one more, a moving pair half each); where the wall does not let him
     * go, the other way along it. Not a soft push at a distance (the old one let the bodies stay inside each other in a narrow place).
     */
    _separate(dt) {
        const near = this._sepNear || (this._sepNear = []);
        const bodies = this._sepBodies || (this._sepBodies = []);
        for (const p of this.byId.values()) {
            if (p.dead || p.climb || p.seated || !p.group.visible) continue;
            // asked to make way (one stands in another's way — talking too): a step aside, where one can stand
            const mw = makeWayStep(p, dt);
            if (mw) {
                const l = Math.hypot(mw.x, mw.z) || 1;
                if (this._walkable(p.x + mw.x + mw.x / l * BODY_R, p.z + mw.z + mw.z / l * BODY_R, p.y)) { p.x += mw.x; p.z += mw.z; }
            }
            // (in a player's shield / dome — it went up over him: out of it, where one can stand — ShieldWalls.js)
            const wards = wardsOf(this.game);
            if (wards.length) {
                const o = _wardP; o.x = p.x; o.y = p.y; o.z = p.z;
                if (pushOut(o, this._bodyR(p), wards, Math.min(1, dt * 10)) && this._walkable(o.x, o.z, p.y)) { p.x = o.x; p.z = o.z; }
            }
            // (only the ones round it, from the crowd's grid — never all with all)
            bodies.length = 0;
            for (const b of crowdNear(this.game, p.x, p.y, p.z, SPACE.STAND_RANGE, p, 2.5, near)) {
                b.gap = undefined;
                if (b.kind === 'player') { b.fixed = true; bodies.push(b); continue; }
                if (b.kind !== 'man' || b.ref === p) continue;
                const q = b.ref;
                if (Math.abs(q.y - p.y) > 2.5 || q.seated || q.climb) continue;
                bodies.push(b);
            }
            if (!bodies.length) continue;
            const r = this._bodyR(p);
            // (talking with the hero or standing: he makes room more; a walker passing a standing one gives way first)
            const push = separate(p, r, bodies, { id: p.id, yield: p.talking > 0 ? false : (p.speed || 0) < 0.2, cap: 0.35 * Math.max(0.3, dt * 30) });
            if (!push.x && !push.z) {
                // personal space (SPACE.STAND_GAP): two standing in the open drift apart gently; never in a doorway / on a stair, never a post
                if (p.talking > 0 || (p.speed || 0) > 0.2 || p.post || p.job === 'stall' || p.job === 'king' || p.fleeT > 0 || p.foe) continue;
                let any = false;
                for (const b of bodies) {
                    const q = b.ref;
                    b.gap = 0;
                    if (b.kind !== 'man' || !q || q.talking > 0 || (q.speed || 0) > 0.2 || q.post || q.job === 'stall' || q.job === 'king' || q.foe || Math.hypot(b.x - p.x, b.z - p.z) > SPACE.STAND_RANGE) continue;
                    b.gap = SPACE.STAND_GAP; any = true;
                }
                if (!any) continue;
                const R = SPACE.OPEN_ROOM;
                if (!(this._walkable(p.x + R, p.z, p.y) && this._walkable(p.x - R, p.z, p.y) && this._walkable(p.x, p.z + R, p.y) && this._walkable(p.x, p.z - R, p.y))) continue;
                const soft = separate(p, r, bodies, { id: p.id, yield: true, cap: SPACE.STAND_PUSH * dt });
                if ((soft.x || soft.z) && this._walkable(p.x + soft.x * 2, p.z + soft.z * 2, p.y)) { p.x += soft.x; p.z += soft.z; }
                continue;
            }
            for (const f of [1, 0.5]) {
                if (this._walkable(p.x + push.x * f, p.z + push.z * f, p.y)) { p.x += push.x * f; p.z += push.z * f; break; }
                if (f === 0.5) {
                    // (the wall is in that way: along it)
                    if (Math.abs(push.x) > Math.abs(push.z) ? this._walkable(p.x, p.z + Math.sign(push.z || 1) * Math.abs(push.x) * 0.5, p.y) : this._walkable(p.x + Math.sign(push.x || 1) * Math.abs(push.z) * 0.5, p.z, p.y)) {
                        if (Math.abs(push.x) > Math.abs(push.z)) p.z += Math.sign(push.z || 1) * Math.abs(push.x) * 0.5; else p.x += Math.sign(push.x || 1) * Math.abs(push.z) * 0.5;
                    }
                }
            }
        }
    }

    /** (host) the swing of a knight / the king hits its target. */
    _strike(v) {
        if (v.model.limbs?.rightArm != null) return; // (no sword arm any more)
        const fp = this._playerPos(v.foe);
        // (a giant foe — the monster form ×7, MonsterForm.js: the sword reaches its legs from beside them)
        const fs = v.foe === this.game.localId ? this.game.character?.size || 1 : this.game.remotes?.get(v.foe)?.character?.size || 1;
        if (!fp || Math.hypot(fp.x - v.x, fp.z - v.z) > 3.4 + 0.48 * (fs - 1)) return;
        if (Math.abs(fp.y - 1.95 * fs - v.y) > 2.6) return; // (he is up on a roof over my head: the sword cuts the air)
        if (!facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.MELEE)) return; // («лицом к цели»: a swing from the side / behind cuts the air)
        if (confusedMiss(v)) return; // (lost in Accentric's haze: the swing cuts the air — StrongSpells)
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

    /**
     * A wall (a roof, a shut door) between a villager and the one he «talks with»: he does not turn to him, does not stand
     * facing him — the author: «он ВООБЩЕ через стену никак не может взаимодействовать». A moment of grace (a step behind a post),
     * then the talk is over. Asked ~3 times a second. → true: he is blind to him (the caller skips the talk).
     */
    _talkBlind(v, dt) {
        const tid = v.talkTo || this.game.localId;
        const tp = this._playerPos(tid);
        if (!tp) return false;
        const now = performance.now();
        if (v.losId !== tid || now - (v.losAt || 0) > 300) {
            v.losId = tid; v.losAt = now;
            v.losOk = this._sees(v, tp);
        }
        if (v.losOk) { v.blindT = 0; return false; }
        v.blindT = (v.blindT || 0) + dt;
        if (v.blindT > 0.6) {
            this.alog?.decision(v, 'не видит героя (стена между ними) — не смотрит на него и не разговаривает');
            v.talking = 0; v.talkTo = null; v.blindT = 0;
        }
        return true;
    }

    _sees(v, p) {
        const c = this.game.collision;
        // (sampled every 0.45 m: a wall one block thick is never stepped over)
        return c.lineOfSight ? c.lineOfSight(v.x, v.y + 3.6, v.z, p.x, p.y + 0.5, p.z, 0.45) : true;
    }

    /**
     * News for the towns where it happened (TownNews): who did it is kept only if somebody there saw it.
     * `def`: the town already known (a villager's own); otherwise every town whose land holds `pos`.
     */
    _news(pos, kind, by, via = null, who = null, def = null) {
        if (!pos) return;
        const player = this._isPlayer(by);
        for (const d of def ? [def] : this.index?.near(pos.x, pos.z, 0) || []) {
            if (!def && !this._inLand(d, pos, 20)) continue;
            const seen = player && this._anyKnows(d, by, pos, via);
            this.news?.add(d.id, kind, { by: seen ? by : null, byName: seen ? this.game.playerName?.(by) : null, seen, who });
        }
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
        this._achHit(v, by);
        if (by === this.game.localId && !v.arena) this.talk?.feel?.(v, -12); // (he remembers who struck him — Attitude.js)
        markEmo(v, 'hit', 2.5);
        this.rel?.onHit(v, by, false); // (the three bars: the victim and who saw it — Relations.js)
        if (this._isPlayer(by) && !v.arena) this._news(v, 'hit', by, null, `${v.title || ''} ${v.name || ''}`.trim(), v.cs.def); // (the town remembers who struck its people)
        this.night?.noise(v, 9);
        if (v.damageCooldown > 0 && !opts.spell) return;
        v.damageCooldown = 0.35;
        v.hellT = opts.hell ? Date.now() : 0; // (the last blow was the Hellfire's: a kill darkens the caster — HellKills.js)
        v.darkT = darkHit(opts, isDark) ? Date.now() : 0; // (the last blow was black magic: the body fits the rite of monstrous vitality — VitalityRules.js)
        if (v.wizard) v.hurtAt = Date.now();
        // the Master's dome: nothing gets through while it holds (but «Авада Кедавра»)
        // (a spell: half its mana from his — an unnamed one as an ordinary 10; a blow: nothing. Out of mana it shatters)
        if (v.wizard && (v.fx & FX.DOME) && !opts.pierce && this.wizards.fight.shieldPays(v, opts.spell ? opts.kind || 'spell' : 'melee', true)) { this._flash(v); return; }
        // a shield held up (the shield wall, the ones holding a place, a wizard's hand shield) takes a blow
        // or a spell from the front: little gets through. «Авада Кедавра» passes any shield.
        if (dir && !opts.pierce && opts.kind !== 'Thunderwave' && v.foe && this._shieldUp(v)) { // (Thunderwave comes from above: a hand shield does not stop it)
            if (dir.x * -Math.sin(v.yaw) + dir.z * -Math.cos(v.yaw) < -0.35) {
                dmg *= opts.fire ? 0.5 : 0.25; // (fire goes round a shield: it only halves it)
                if (opts.fire) v.shieldHeat = (v.shieldHeat || 0) + 0.25; // (and the shield gets hot)
                for (let i = 0; i < 5; i++) this.game.fx.spark(_v.set(v.x - Math.sin(v.yaw) * 0.8, v.y + 2.6, v.z - Math.cos(v.yaw) * 0.8), 0xffe9a0, 0.08, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.4);
            }
        }
        // (two wizards of the duel arena: a friendly duel — the blow never kills: ArenaDuels.soften)
        if (v.arena && this.game.arenaDuels) dmg = this.game.arenaDuels.soften(v, by, dmg);
        // armour takes most of the blow: the hearts go down many times slower
        if (v.magicSet && opts.fire) dmg *= 0.5; // (the whole magic set: fire does half)
        if (opts.pierce) v.hp = 0; // («Авада Кедавра»: no armour stops it)
        else if (v.armor > 0 && opts.kind === 'Thunderwave' && !v.magicPieces?.length) v.hp -= dmg; // (plain steel does not hold a blow from above; a magic piece does)
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
        if (by != null && this.game.arenaDuels?.onHit(v, by, killed, opts)) return; // (a legal duel at the arena — nobody minds it; a foul is the arena's: ArenaDuels.js)
        // the hidden wanted level: a kill, or a real blow (not a bump in a crowd) — only what somebody saw (Blame.js)
        const real = killed || opts.spell || opts.weapon || opts.magic || opts.pierce || opts.fire || dmg > 1;
        const deed = () => { if (by && real) this.deed(by, killed ? (v.role === 'king' || v.role === 'master' ? 'killChief' : 'kill') : 'hurt'); };
        if (!killed && by && !opts.via && this._wClass(v) === 'commoner') this.wanderAttacked(v, by, 'attacked'); // (an ordinary traveller struck: 90 % hit back — WandererMind)
        // a blow without magic (a fist, a slap, a blade) on one person is between the two of them:
        // they tell you off, take offence, or — a hard blow — fight YOU; no guards (only a rampage brings them)
        if (!killed && by && !opts.via && !opts.spell && !opts.pierce && !opts.magic && !(opts.weapon && v.role === 'king') && this._personal(v, by, dmg, opts)) { deed(); return; }
        if (!killed && v.role !== 'knight' && v.role !== 'king') this._say(v, pick(SHOUT.hurt));
        if (by && this._offence(v.cs, by, v, killed, pos, opts)) deed();
        // nobody knows who (too far, dark, behind a wall): the hurt one turns to where it came from and searches (Startle.js)
        else if (!killed && by && !opts.via) this.startle(v, by, opts.src || this._feetOf(by) || pos, { hit: true });
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
     * (host) A threat passed by `v` — a spell flew past him, a ray or a blast close by — or a spell hit him that
     * doesn't hurt (Startle.js). He flinches and turns to where it came from (`from`); he sees who did it
     * (Blame.js) — the fighters go for him, the others run; he doesn't — the fighters search the place it came
     * from, the others run from it. The ones near hear the cry. `by`: a player's id (others: nothing).
     */
    startle(v, by, from, { hit = false, miss = null, loud = false, blocked = false } = {}) {
        if (!this.auth || !v || v.dead || v.servantOf != null || !from || !this._isPlayer(by)) return false;
        const cs = v.cs, now = Date.now();
        if (!cs || v.foe || by === this.state(cs.def.id).owner) return false; // (fighting already; the king may do as he likes)
        if (this.game.arenaDuels?.calm(v, by)) return false; // (the arena's legal duel: spells flying there are the show — ArenaDuels.js)
        const wc = this._wClass(v); // (a road person: knight / wizard / ordinary — WandererMind.js)
        if (miss != null && wc !== 'knight' && wc !== 'wizard') return false; // (the wide ring of a miss is for the road's fighters only; castle people keep the old narrow one)
        if (wc && isLord(v, by, this.lordOf(cs, by))) return false;
        if (wc === 'commoner' && hit) { this.wanderAttacked(v, by, 'attacked'); this._callNear(v, null, from, by); return true; } // (a spell that hit and did not hurt: still an attack)
        if (now - (v.startleAt || 0) < (hit ? 300 : STARTLE.AGAIN_MS)) return false; // (a volley: one threat; a hit told once)
        if (miss != null && this._wanderMissAt(v, by, from, miss, loud, wc, now, blocked)) return true;
        if (miss != null) return false;
        v.startleAt = now;
        if (v.sleep) this.night?.wake?.(v, 'alarm');
        v.readyUntil = now + STARTLE.READY_MS; // (a wizard has his shield ready for the next one: WizardFight._notice)
        if (!(v.stunT > 0) && !v.lev) { v.flinchT = STARTLE.FLINCH; v.flinchFrom = { x: from.x, z: from.z }; }
        const knows = this._knows(v, by, null, null);
        if (v.party) this.game.travelers?.alert?.(v.party, knows && (wc !== 'commoner' || hit) ? by : null); // (a cart stops, the riders get down; a shot that missed travellers is no blow at them)
        if (v.seated && v.job !== 'cart') v.seated = false;
        const r = startleReaction({ fights: this._fights(v), knows });
        if (r === 'fight' || r === 'flee') {
            cs.hostile.set(by, now + HOSTILE_MS);
            if (r === 'fight') { v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; this._say(v, pick(v.wizard ? WIZ_SHOUT.fight : v.role === 'king' ? SHOUT.king : SHOUT.knight), 3); }
            else { const bp = this._playerPos(by); this.fright?.scare?.(v, 'attacker', bp ? { x: bp.x, y: bp.y - 1.95, z: bp.z } : from, by); this._say(v, pick(SHOUT.help), 3); }
        } else if (r === 'search') {
            if (v.wizard && this.wizards?.answerShot?.(v, by, from)) { /* (a wizard who saw where the shot came from: shield up, and after it — WizardLife.answerShot) */ } else {
                v.investigate = { x: from.x, y: from.y ?? v.y, z: from.z, by: null, t: STARTLE.SEARCH_S }; // (nobody saw whose: he looks at the place, not for a man — Blame.js)
                v.path = null; v.lookT = 0;
            }
            this._say(v, pick(v.wizard ? SHOUT.startledWiz : SHOUT.startled), 3);
        } else {
            v.fleeAt = { x: from.x, z: from.z }; v.fleeFrom = null; v.fleeT = STARTLE.FLEE_S; v.fleeing = false;
            if (Math.random() < 0.6) this._say(v, pick(SHOUT.help), 3);
        }
        this._callNear(v, knows ? by : null, from, by);
        return true;
    }

    // ------------------------------------------------------------ the people of the roads (WandererMind.js)
    /** 'knight' | 'wizard' | 'commoner' | null — a road person (Travelers.js). */
    _wClass(v) { return wandererClass({ role: v.role, wizard: !!v.wizard, siteKind: v.cs?.def?.kind }); }

    /** (host) A road knight / wizard and a miss `d` m from his body: turn, watch, or fight (zones and chances: WandererMind). True: handled. */
    _wanderMissAt(v, by, from, d, loud, wc, now, blocked) {
        const zone = missZone(d, { loud, blocked });
        if (!zone) return false;
        const knows = this._knows(v, by, null, null);
        v.missN = (v.missN || 0) + 1;
        const verdict = missVerdict({ cls: wc, rank: v.rank, zone, knows, roll: dieOf(v.id, v.missN, 'm') });
        v.startleAt = now;
        if (v.sleep) this.night?.wake?.(v, 'alarm');
        v.readyUntil = now + STARTLE.READY_MS;
        if (!(v.stunT > 0) && !v.lev) { v.flinchT = STARTLE.FLINCH; v.flinchFrom = { x: from.x, z: from.z }; }
        this.alog?.decision(v, missText(`${v.title || ''} ${v.name || ''}`.trim(), d, zone, verdict));
        if (v.party) this.game.travelers?.alert?.(v.party, verdict.act === 'fight' ? by : null);
        if (verdict.act === 'fight') {
            const go = () => { if (v.dead || v.foe) return; v.cs.hostile.set(by, now + HOSTILE_MS); v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; this._say(v, pick(v.wizard ? WIZ_SHOUT.fight : SHOUT.knight), 3); };
            const lag = wandererLag(wc, v.rank);
            if (lag.t > 0.3) v.wLag = { t: lag.t, fn: go }; else go();
        } else if (verdict.act === 'search') {
            if (v.wizard && this.wizards?.answerShot?.(v, by, from)) { /* (shield up; the hunt goes after his reaction time) */ } else { v.investigate = { x: from.x, y: from.y ?? v.y, z: from.z, by: null, t: STARTLE.SEARCH_S }; v.path = null; v.lookT = 0; }
            this._say(v, pick(v.wizard ? SHOUT.startledWiz : SHOUT.startled), 3);
        } // ('turn': the flinch above faces the source; the shield stays ready — WizardFight._notice reads readyUntil)
        this._callNear(v, verdict.act === 'fight' ? by : null, from, by);
        return true;
    }

    /**
     * (host) An ordinary traveller is attacked (`kind` 'attacked': struck, hit by a spell, hurt, or his party was) or saw a killing
     * ('witness'). One die per person per episode from his id (WandererMind.commonerDecide), kept 60 s: 90 % (witness: 50 %) he hits back
     * with what he has (fists, a pitchfork, a stone), the rest — and the weak, always — run from the culprit.
     */
    wanderAttacked(v, by, kind = 'attacked') {
        if (!this.auth || !v || v.dead || !this._isPlayer(by) || this._wClass(v) !== 'commoner') return false;
        const cs = v.cs, now = Date.now();
        if (isLord(v, by, this.lordOf(cs, by))) return false;
        const d = commonerDecide({ id: v.id, weak: isWeak(v), kind, prev: v.wm, now });
        v.wm = d.mem;
        if (d.fresh) this.alog?.decision(v, commonerText(`${v.title || ''} ${v.name || ''}`.trim(), d));
        if (v.wmBrave0 === undefined) v.wmBrave0 = !!v.roadBrave;
        v.roadBrave = d.stance === 'attack'; // (_fights: fists and a pitchfork; the others never fight — even a naturally brave one of the seed)
        if (v.seated && v.job !== 'cart') v.seated = false;
        if (d.stance === 'attack') {
            if (d.fresh || !v.foe) { cs.hostile.set(by, now + WANDER.MEMORY_S * 1000); v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; v.fear = null; if (d.fresh) this._say(v, pick(['Ах ты так?! Получай!', 'Не дам в обиду своих!', 'А ну, отойди от нас!', 'Сейчас я тебе покажу!']), 3); }
        } else if (d.fresh) {
            if (v.foe === by) v.foe = null;
            const bp = this._playerPos(by);
            this.fright?.scare?.(v, 'attacker', bp ? { x: bp.x, y: bp.y - 1.95, z: bp.z } : { x: v.x, y: v.y, z: v.z }, by);
            this._say(v, pick(SHOUT.help), 3);
        }
        return true;
    }

    /** (host) The decision runs out: no endless fear or fight — back to the road (the cart waits for CALM — Travelers). */
    _wanderCalm(v) {
        const wm = v.wm; v.wm = { n: wm.n || 0, until: 0 };
        if (v.wmBrave0 !== undefined) { v.roadBrave = v.wmBrave0; v.wmBrave0 = undefined; }
        if (wm.stance === 'attack' && v.foe && !this._fights(v)) { v.foe = null; v.path = null; }
        this.alog?.decision(v, 'странник: решение выдохлось — снова по своим делам');
    }

    /** (host) A person was killed by a player: the ordinary travellers who see it (≤ 40 m, a free line) throw their die — 50 / 50. */
    _wanderWitness(dead, by) {
        const pos = { x: dead.x, y: dead.y, z: dead.z };
        const R = WANDER.WITNESS_R;
        for (const o of this.byId.values()) {
            if (o === dead || o.dead || Math.abs(o.x - pos.x) > R || Math.abs(o.z - pos.z) > R) continue;
            if (this._wClass(o) !== 'commoner' || Math.hypot(o.x - pos.x, o.z - pos.z) > R || !this._sees(o, pos)) continue;
            if (o.party) this.game.travelers?.alert?.(o.party, null);
            this.wanderAttacked(o, by, 'witness');
        }
    }

    /** (host) The cry of `v`: the fighters near with nothing to do come — at the culprit if he is known, else to look where it came from. */
    _callNear(v, known, from, by) {
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || o.foe || o.investigate || o.servantOf != null || !this._fights(o) || o.sleep?.phase === 'lie') continue;
            if (Math.abs(o.x - v.x) > STARTLE.CALL_R || Math.abs(o.z - v.z) > STARTLE.CALL_R || Math.hypot(o.x - v.x, o.z - v.z) > STARTLE.CALL_R) continue;
            o.readyUntil = Date.now() + STARTLE.READY_MS;
            if (known) { o.foe = known; o.path = null; }
            else { o.investigate = { x: from.x, y: from.y ?? o.y, z: from.z, by: null, t: STARTLE.SEARCH_S }; o.path = null; o.lookT = 0; }
        }
    }

    /**
     * (host, Duel._fly) A player's charge flew p→q this frame (`from`: the caster's hand): everybody it passed close
     * by is startled — not the one it hit (`hitId`: that one feels it in full: hit / applyToCreature).
     */
    passBy(p, q, by, from, hitId = null) {
        if (!this.auth || !this._isPlayer(by)) return;
        const R0 = STARTLE.BOLT_R + BODY_R, RW = WANDER.ZONE.NEAR + BODY_R; // (the road's knights and wizards notice a miss up to 15 m: WandererMind)
        const minX = Math.min(p.x, q.x) - RW, maxX = Math.max(p.x, q.x) + RW, minZ = Math.min(p.z, q.z) - RW, maxZ = Math.max(p.z, q.z) + RW;
        for (const v of this.byId.values()) {
            if (v.dead || v.foe || v.id === hitId || v.x < minX || v.x > maxX || v.z < minZ || v.z > maxZ) continue;
            const d2 = segDist2(p.x, p.y, p.z, q.x, q.y, q.z, v.x, v.y + 2.4, v.z);
            const wc = this._wClass(v);
            if (wc === 'knight' || wc === 'wizard') {
                const d = Math.max(0, Math.sqrt(d2) - BODY_R);
                const blocked = !this._sees(v, { x: q.x, y: q.y - 0.5, z: q.z }); // (a wall between: not seen; a quiet charge is not heard)
                this.startle(v, by, from, { miss: d, loud: false, blocked });
                continue;
            }
            if (d2 > R0 * R0) continue;
            this.startle(v, by, from);
        }
    }

    /** (host) A blast / a lightning at `p` (radius `r`): the ones near but not in it are startled (in it: hitAt hurts them). */
    startleAround(p, r, by, from = null) {
        if (!this.auth || !this._isPlayer(by)) return;
        const bp = from || this._playerPos(by) || p;
        const R = r + STARTLE.BLAST_R, RW = r + WANDER.ZONE.HEARD; // (a blast is loud: the road's fighters hear it up to 30 m beyond it, a wall or not)
        for (const v of this.byId.values()) {
            if (v.dead || v.foe || Math.abs(v.x - p.x) > RW || Math.abs(v.z - p.z) > RW) continue;
            const d = Math.hypot(v.x - p.x, v.z - p.z);
            if (d < r + 1) continue;
            const wc = this._wClass(v);
            if (wc === 'knight' || wc === 'wizard') {
                const blocked = !this._sees(v, p);
                this.startle(v, by, bp, { miss: d - r, loud: true, blocked });
                continue;
            }
            if (d > R) continue;
            this.startle(v, by, bp);
        }
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
        const n = prev && now - prev.t < BUMP.AGAIN_MS ? prev.n + 1 : 1;
        bumps.set(key, { t: now, n });
        // wizards are reserved: a hand blow (no weapon, no spell) is answered by the beaten one alone, and only after a real beating
        if (v.wizard && !opts.weapon && !opts.magic && this.state(cs.def.id).owner !== by) {
            const r = beating(v.beaten, by, dmg, now);
            v.beaten = r.rec;
            v.offended = { by, t: now, hp: v.hp };
            if (r.lesson && this._lesson(v, by)) return true;
            if (!v.foe) this._say(v, pick(n === 1 ? SHOUT.bump : SHOUT.offended), 3);
            return true;
        }
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
        // (a light knock — a hand reaching for a handshake, a bump in a crowd — once: just told off; a second one within 20 s angers them)
        v.offended = { by, t: now, hp: v.hp };
        const out = knockOutcome({ hard, count: n, owner: this.state(cs.def.id).owner === by });
        if (out === 'told') { this._say(v, pick(knightly ? SHOUT.bumpKnight : SHOUT.bump), 3); return true; }
        if (out === 'offended') { this._say(v, pick(knightly ? SHOUT.bumpKnight : SHOUT.offended), 3); return true; }
        // a hard blow (or the third knock): this one fights back — only them, only this player
        v.grudge = { id: by, until: now + GRUDGE_MS };
        if (v.foe !== by) { v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; v.seated = false; }
        this._say(v, pick(knightly ? SHOUT.fightBackKnight : SHOUT.fightBack), 3);
        if (by === g.localId) g.hud.setVoice?.(`😠 ${v.title} ${v.name} разозлился и дерётся с вами`, true);
        return true;
    }

    /**
     * «Извините» (CastleTalk): whoever I knocked in the last 15 s near me calms down — the grudge and the hostility to me are
     * lifted, if it did not grow into a real fight (nobody dead, little damage). @returns {boolean} somebody was calmed
     */
    forgive(by = this.game.localId) {
        if (!this.auth) { this.game.sync?.villagerSorry?.(); return false; }
        const pp = this._playerPos(by), now = Date.now();
        if (!pp) return false;
        let calmed = null;
        for (const v of this.byId.values()) {
            const o = v.offended;
            if (v.dead || !o || o.by !== by || now - o.t > BUMP.SORRY_MS) continue;
            if (Math.hypot(v.x - pp.x, v.z - pp.z) > BUMP.SORRY_R || o.hp - v.hp > BUMP.MAX_HP_LOSS * Math.max(1, v.maxHp / 10) + 1) continue;
            if (v.grudge?.id === by) v.grudge = null;
            if (v.foe === by) { v.foe = null; v.path = null; v.fleeT = 0; }
            v.offended = null;
            calmed = v;
            this._say(v, pick(SORRY_OK), 3);
        }
        if (!calmed) return false;
        const cs = calmed.cs, st = this.state(cs.def.id);
        if (!st.killed.size) cs.hostile.delete(by); // (nobody killed: the castle forgets it too)
        for (const k of cs.active.values()) if (k.foe === by && !k.dead && now - (k.offended?.t || 0) < BUMP.SORRY_MS * 2) k.foe = null;
        return true;
    }

    _flash(v) {
        v.model.flashHit(0.15);
        for (let i = 0; i < 6; i++) this.game.fx.spark(_v.set(v.x, v.y + 2.6, v.z), v.armor > 0 ? 0xdddddd : 0xb3001b, 0.08, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
    }

    _die(v, by) {
        // (did the wizard know who was against him — fought him, held a grudge, saw him? An ambush he never noticed is no duel: no mastery for it)
        const aware = !!v.wizard && by != null && this._isPlayer(by) && (v.foe === by || v.grudge?.id === by || this.knowsFrom(v, by, null, null, v.cs?.castSeen));
        this.rel?.onHit(v, by, true); // (a killing: the town's opinion of the hero — Relations.js)
        v.dead = true;
        if (by != null && this._isPlayer(by)) this._wanderWitness(v, by); // (the travellers who saw it: 50 / 50 — WandererMind)
        v.seated = false; // (a seated body is drawn 1.7 m lower — it sank through the floor: the dead king on his throne)
        this.cmds?.clear(v);
        this.talk?.speech?.cancelKey?.(v.id); // (the dead say nothing: his line stops, his queue is dropped)
        v.bubble?.hide?.();
        v.mode = 'dead';
        v.foe = null;
        v.path = null;
        const st = this.state(v.cs.def.id);
        // (the arena's duel mode: a wizard the hero beat there falls and is taken away — no body, no news of a murder, nobody startled,
        // and he is no more «killed» for good: the arena has the same wizards again — ArenaDuels.quietKill)
        const quiet = !!this.game.arenaDuels?.quietKill?.(v, by);
        if (!quiet) {
            st.killed.add(v.idx);
            v.darkKill = hellRecent(v.darkT, Date.now()); // (killed by black magic: the body keeps it — Death.villagerDied → the rite of monstrous vitality)
            if (hellRecent(v.hellT, Date.now())) hellKilled(this.game, by, 'v', v.role, v.id); // (the Hellfire killed a humanoid: +1 black magic to the caster)
            this.game.death?.villagerDied(v); // the body stays; what was in the hand falls (Death.dropHeld), a knight's shield and coins too
            if (v.byOrder != null && !v.rebelOrder) this.reb?.note(v.cs, v.byOrder, 'execution'); // (a man put to death on the king's order: the people do not forget)
            if (v.byOrder == null) this._comradeDown(v, by); // (on the king's order: nobody is startled)
            this._news(v, 'death', this._isPlayer(by) ? by : null, null, `${v.title || ''} ${v.name || ''}`.trim(), v.cs.def);
        }
        if (v.wizard && by != null) creditKill(this.game, by, { wiz: v.id, mm: v.maxMana || 30, pos: [v.x, v.y, v.z], aw: aware ? 1 : 0 }); // (mana: a wizard beaten in a duel)
        if (v.role === 'king') this._capture(v.cs, by);
        else if (v.entry?.elder && !st.kingDead) { // (a settlement's Elder: the hall's chests open; the wizards are not «captured» — WizVillages.js)
            st.kingDead = true;
            for (const c of v.cs.chests) c.locked = false;
            this._announceCapture(v.cs, st);
        }
        this._achDied(v, by);
        this._sendState(v.cs);
    }

    /** A player's feet (where a thing he did came from), or null. */
    _feetOf(by) {
        const p = this._isPlayer(by) ? this._playerPos(by) : null;
        return p ? { x: p.x, y: p.y - 1.95, z: p.z } : null;
    }

    /**
     * (host) `v` fell (the author: «тот, кто стоял возле него, как будто завис»): the ones near who see it cry out,
     * flinch and turn — the killer seen: at him (the others run); not seen: they look round and search the way the
     * death came from, and call the others (startle). BodyFound later raises the whole place when the body is found.
     */
    _comradeDown(v, by) {
        if (!this.auth || !v.cs) return;
        const at = { x: v.x, y: v.y, z: v.z };
        const from = this._feetOf(by);
        let said = false;
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || o.servantOf != null || o.sleep?.phase === 'lie') continue;
            if (Math.abs(o.x - at.x) > 30 || Math.abs(o.z - at.z) > 30) continue;
            const d = Math.hypot(o.x - at.x, o.z - at.z);
            if (d > 30 || Math.abs(o.y - at.y) > 6 || (d > 4 && !this._sees(o, { x: at.x, y: at.y + 1.5, z: at.z }))) continue;
            if (from) { if (this.startle(o, by, from, { hit: true }) && !said && this._fights(o)) { said = true; this._say(o, pick(SHOUT.comrade), 3); } continue; }
            // (killed by no player — a zombie, a creature, a fall: they look at the body and search round it)
            if (o.foe) continue;
            o.flinchT = STARTLE.FLINCH; o.flinchFrom = { x: at.x, z: at.z };
            if (this._fights(o) && !o.investigate) { o.investigate = { x: at.x, y: at.y, z: at.z, by: null, t: STARTLE.SEARCH_S }; o.path = null; o.lookT = 0; }
            if (!said) { said = true; this._say(o, pick(SHOUT.comrade), 3); }
        }
    }

    /** Which achievement this person's death is (Achievements.js): the king, the Ice Queen, a tower's Master. */
    _achKind(v) {
        if (v.role === 'iceQueen' || v.iceQueen) return 'iceQueen'; // (the Ice Queen: made in another work — counted as soon as she is)
        if (v.role === 'king') return 'king';
        if (v.role === 'master' && v.cs?.def?.kind === 'tower') return 'master';
        return null;
    }

    /** (host) A blow on a castle person: taking part (the king, the Queen, the Master) / fighting there. */
    _achHit(v, by) {
        const a = this.game.achievements;
        if (!a || by == null) return;
        const k = this._achKind(v);
        if (k) a.hit(k, v.id, by); else a.fought(by);
    }

    /** (host) The king / the Ice Queen / a tower's Master died: the achievement to all who took part. */
    _achDied(v, by) {
        const a = this.game.achievements, k = this._achKind(v);
        if (!a || !k) return;
        const pos = { x: v.x, y: v.y, z: v.z };
        if (k === 'master') a.masterKilled(v.cs.def, v.id, by, pos);
        else a.killed(k, v.id, by, pos);
    }

    /** Does this one fight (knights, the king; the tower's wizards but a timid student)? */
    _fights(v) { return v.role === 'knight' || (v.role === 'king' && !!v.kingFight) || (!!v.wizard && WizardFight.fights(v)) || !!v.roadBrave; } // (a brave one of the road's folk too: Travelers.roadBrave)

    /** A shield up: a knight's in the shield wall / holding a place, a wizard's hand shield. */
    /**
     * (host) A great fire (the Hellfire) at (x, z), `heat` 0…1 how close: people fear it. The brave —
     * knights, the king, wizards — back off step by step facing it behind their shields (some panic and
     * run; a shield gone hot in it makes them drop back); everyone else runs from it.
     */
    fear(v, x, z, heat = 0, dt = 0.25, opt = {}) {
        if (!v || v.dead || v.lev || v.servantOf != null) return;
        const brave = v.role === 'knight' || v.role === 'king' || !!v.wizard;
        // a great fire (the Hellfire) and a wizard: not a step back in a heap — to a SAFE place (behind a wall, in a building), spread out (WizardLife.fireRun)
        if (v.wizard && opt.big && !opt.panic) { this.wizards.fireRun(v, x, z, opt.r ?? 12, heat); return; }
        if (!(v.fireT > 0)) {
            v.firePanic = opt.panic || !brave || Math.random() < 0.15 + 0.35 * heat;
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

    /**
     * (host) The king: fight or hide (KingNerve.js). Fights when many of the castle's knights are dead, or when no live guard is
     * near and the enemy is on him; otherwise he drops the fight, calls the guard and goes deeper into the castle (VillagerFear).
     */
    _kingNerve(v, dt) {
        if ((v.nerveT = (v.nerveT || 0) - dt) > 0 && !(v.foe != null && !v.kingFight)) return; // (a fight he has no business in: dropped at once)
        v.nerveT = 0.4;
        const cs = v.cs, def = cs.def, now = Date.now(), st = this.state(def.id);
        const ids = new Set(cs.hostile.keys());
        if (v.foe != null) ids.add(v.foe);
        let hero = null, hp = null, hd = Infinity;
        for (const pid of ids) {
            if (isLord(v, pid, this.lordOf(cs, pid)) || !(cs.hostile.get(pid) > now || v.foe === pid)) continue;
            const p = this._playerPos(pid);
            const d = p ? Math.hypot(p.x - v.x, p.z - v.z) : Infinity;
            if (d < hd) { hd = d; hero = pid; hp = p; }
        }
        const R = guardRadius(def.walls);
        let near = 0;
        for (const k of cs.active.values()) {
            if (k.role !== 'knight' || k.dead || k.sleep || k.stunT > 0 || k.lev || Math.abs(k.y - v.y) > 10) continue;
            if (Math.hypot(k.x - v.x, k.z - v.z) <= R) near++;
        }
        const r = kingFights({ killed: guardsKilled(st.killed, def.knights), knights: def.knights, guardNear: near, heroDist: hd, fighting: !!v.kingFight });
        v.kingFight = r.fight;
        if (r.fight) {
            if (hero != null && v.foe == null && cs.hostile.get(hero) > now) { v.foe = hero; v.path = null; v.seated = false; this._say(v, pick(SHOUT.king), 3); }
        } else if (v.foe != null) {
            // not his fight: away from him, the guard called
            const foe = v.foe;
            v.foe = null; v.grudge = null; v.lesson = null; v.path = null;
            const fp = this._playerPos(foe) || hp;
            if (fp) {
                this.fright?.scare?.(v, 'attacker', { x: fp.x, y: fp.y - 1.95, z: fp.z }, foe);
                this._callNear(v, foe, fp, foe);
            }
            this._say(v, 'Стража! Ко мне!', 3);
        }
    }

    _shieldUp(v) { return (!!v.model.shield && (v.mode === 'block' || v.tac?.role === 'shield')) || (!!v.wizard && !!(v.fx & FX.SHIELD)); }

    /**
     * (host) A duel charge reached a castle person (Duel.applyToCreature): taken by a shield? The
     * Master's dome takes any; a wizard's hand shield or a knight's raised shield — one from the
     * front (Sapira's blow on a knight's shield: hit() weakens it; Avada passes a knight's shield).
     * A wizard's shield pays half of the charge's mana for it — out of mana it shatters.
     */
    wardOff(v, from, spell, dt = 0) {
        if (v.dead) return false;
        // a wizard's «Protection» / the Master's dome: any charge — «Авада Кедавра» too — for half its mana (WizardFight.shieldPays)
        if (v.wizard && (v.fx & FX.DOME)) return this.wizards.fight.shieldPays(v, spell, true, dt);
        const front = !!from && (from.x - v.x) * -Math.sin(v.yaw) + (from.z - v.z) * -Math.cos(v.yaw) > 0;
        if (!front || !(v.foe || v.arenaFight) || !this._shieldUp(v)) return false; // (arenaFight: an arena duellist's shield — ArenaDuels.js)
        if (v.wizard) return this.wizards.fight.shieldPays(v, spell, false, dt);
        if (dt > 0 && spell === 'Electrum') return this.wizards.fight.shieldHeats(v, dt); // (wood and iron: lightning heats it, it gives way in time)
        return spell !== 'AvadaKedavra' && spell !== 'SapiraDuel'; // (a knight's shield of wood and iron)
    }

    /** Who saw it? If anyone did (or the victim lives to tell), the castle turns on `by`. */
    _offence(cs, by, victim, killed, pos, opts = {}) {
        const g = this.game;
        const st = this.state(cs.def.id);
        if (by === st.owner) return false; // (the king may do as he likes)
        if (isForgiven(st.ranks, by)) return false; // (and his friend: what he does is forgiven — Ranks.js)
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
        // (no hint to the player that «somebody saw it» — the author: a useless one; they see the people turn on them. Only the log.)
        if (!was) console.info('[CastleLife] seen:', by, cs.def.name);
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
        if (by && this._isPlayer(by) && cs.def.kind !== 'tower' && cs.def.kind !== 'wizvillage') this.reb?.note(cs, by, 'slainKing'); // (the people obey him — and hate him: Rebellion.js)
        st.ownerName = by ? g.playerName(by) : null;
        this.news?.add(cs.def.id, 'captured', { by, byName: st.ownerName, seen: !!by });
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
        if (cs.def.kind === 'wizvillage') { g.hud.notify?.(`✨ Старейшина поселения «${cs.def.name}» повержен — сундуки ратуши открыты`); return; }
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
        this.game.buildingFx?.alarm(pos, r || 60); // (the church bell tolls the alarm — BuildingFx.js)
        if (!this.auth) { this.game.sync?.villagerDanger?.([Math.round(pos.x), Math.round(pos.y ?? 0), Math.round(pos.z)], kind, r); return; }
        this.fright.add(kind, pos, { r });
        this._news(pos, kind, by, viaOfKind(kind));
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
        // (no culprit given to the frightened: they run from the thing itself)
        if (loud) { this.fright.add(kind || 'blast', pos, { r: r ?? 4 }); this.wizards.danger(pos, kind || 'blast', by, r ?? 4, via); }
        if (loud || blocks > 0) this._news(pos, loud ? kind || 'blast' : 'wreck', by, via);
        if (blocks > 0 || loud) this.rebuild.damaged(pos, r ?? (loud ? 6 : 2), by, loud); // (a crater in the street too)
        this.breakWays(pos, r ?? (loud ? 6 : 2)); // (no path over the hole any more: everybody's ways round it)
        const isPlayer = !!by && (by === g.localId || g.remotes.has(by));
        let counted = false;
        for (const def of this.index.near(pos.x, pos.z, 0)) {
            if (!this._inLand(def, pos, 12)) continue;
            if (isPlayer && blocks > 0 && def.kind === 'tower') g.achievements?.towerWrecked(def, by); // (a wizards' tower pulled down: Achievements.js)
            const cs = this._runtime(def);
            if (!cs.awake) continue;
            const st = this.state(def.id);
            if (by && by === st.owner) { if (isPlayer && blocks > 0) this.reb?.note(cs, by, kind === 'fire' ? 'arson' : 'wreck', kind === 'fire' ? 1 : blocks); continue; } // (the king may pull down his own walls — and the people take it ill: Rebellion.js)
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
                    // (nobody is named: he goes to look at the place; only what he SEES decides — _investigate)
                    if (!v.foe) { v.investigate = { x: pos.x, y: pos.y, z: pos.z, by: null, t: 45 }; v.path = null; v.lookT = 0; comers++; }
                }
            }
            if (!isPlayer || blocks <= 0) continue;
            if (!counted && seen) { counted = true; this.deed(by, wreckPoints(blocks)); }
            st.wrecked = (st.wrecked || 0) + blocks;
            // a big blast: more knights run out of the barracks and the gate to see
            if (loud && comers < 4) this._sendGuards(cs, pos, seen ? by : null, 4 - comers);
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
        if (!was) console.info('[CastleLife] caught wrecking:', by, cs.def.name); // (no hint: the knights coming say it)
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
            // (he looks for no one by name: a player he really SEES near the place — by his own sight, day or night — is the suspect)
            const g = this.game, night = !!g.isNight, R = sightRange(!!v.wizard, night);
            const seeIt = (id) => {
                const p = this._playerPos(id);
                return p && Math.hypot(p.x - I.x, p.z - I.z) < 40 && Math.hypot(p.x - v.x, p.z - v.z) < R && this._sees(v, p);
            };
            const who = I.by && seeIt(I.by) ? I.by : seeIt(g.localId) ? g.localId : [...g.remotes.keys()].find(seeIt);
            if (who && who !== this.state(v.cs.def.id).owner) {
                this._catch(v.cs, who, I);
                return false;
            }
        }
        const d = Math.hypot(I.x - v.x, I.z - v.z);
        // (never into a fire or a castle coming down: they look from its edge)
        const keep = this.fright.keepOut(I);
        if (keep && d < keep + 5) { v.speed = 0; v.path = null; v.yaw = turn(v.yaw, Math.atan2(-(I.x - v.x), -(I.z - v.z)), dt * 4); v.mode = 'idle'; this._ground(v); return true; }
        if (d > 6 && !I.blocked) {
            v.chaseT = (v.chaseT || 0) - dt;
            if (!v.path || v.chaseT <= 0) { v.chaseT = 3; this._goTo(v, v.cs.graph.nearest(I.x, I.y, I.z, 8)); }
            const end = this._followPath(v, dt, RUN);
            if (end) this._steer(v, I.x, I.z, RUN * 0.6, dt, 5);
            v.mode = v.speed > 0 ? 'run' : 'idle';
            // (no way nearer — a wall, the rubble, everybody in the gate: he looks from where he is, not running on the spot)
            const pr = I.prog || (I.prog = { x: v.x, z: v.z, t: 0 });
            pr.t += dt;
            if (pr.t > 3) { if (Math.hypot(v.x - pr.x, v.z - pr.z) < 1.2) { I.blocked = true; v.path = null; } pr.x = v.x; pr.z = v.z; pr.t = 0; }
        } else {
            // there: looking round (kept off it: looking at it)
            v.speed = 0; v.path = null;
            v.yaw = I.blocked ? turn(v.yaw, Math.atan2(-(I.x - v.x), -(I.z - v.z)), dt * 4) : turn(v.yaw, v.yaw + 1, dt * 0.8);
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
            const e = this._rosterRaw(def, idx);
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
        if (cs) this.reb?.note(cs, by, 'theft'); // (the owner robbing his people: Rebellion.js)
        if (cs && home.h < 0) { this.forced(cs.def.id, by, this._playerPos(by)); return true; } // (a chest of the castle itself)
        if (!cs || !cs.def.houses?.[home.h]) return false;
        if (this.rel?.homeAllows?.(cs, home, by, 'take')) return false; // (the family likes him enough to let him take it — Relations.mayTakeThing)
        return this.theft(cs.def, home.h, by, this._playerPos(by) || cs.def.houses[home.h].inside);
    }

    /** A villager saw / suffered a crime (theft, threats) by a player. */
    reportCrime(v, by, kind = 'crime') {
        if (!v || v.dead) return;
        if (!this.auth) { this.game.sync?.villagerCrime?.(v.id, kind); return; }
        // (a thing carried off from the market: the merchant goes for the thief himself — no guards)
        if (kind === 'theft' && by && by !== this.state(v.cs.def.id).owner) { v.grudge = { id: by, until: Date.now() + THEFT_MS }; v.foe = by; v.fleeT = 0; v.path = null; return; }
        if (kind === 'theft') this.rel?.theft(v, by);
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
        if (this.auth && by) this.startleAround(p, radius, by); // (the ones near: startled — Startle.js)
    }

    hitRay(o, d, len, width, dmg, by) {
        let any = false;
        const near = this.auth && this._isPlayer(by);
        for (const v of [...this.byId.values()]) {
            if (v.dead) continue;
            const to = _v.set(v.x - o.x, v.y + 2 - o.y, v.z - o.z);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            const off = to.addScaledVector(d, -along).length();
            if (off < width + 1.2) { this.hit(v, dmg, d.clone(), by, { spell: true }); any = true; }
            else if (near && off < width + 1.2 + STARTLE.RAY_R) this.startle(v, by, o); // (the ray went right by him)
        }
        return any;
    }

    /**
     * (host) «Вайнд» blew along the ray: a harmless gust — nobody is hurt, no alarm, the town does not stir (the push itself:
     * CreatureImpact). The ones it hit only protest now and then; a wizard now and then takes it as a challenge (one fighter
     * against the one who blew — nobody else joins, nobody is called).
     */
    windRay(o, d, len, width, by, name = 'Wind') {
        if (!this.auth || !this._isPlayer(by)) return;
        const now = Date.now();
        for (const v of this.byId.values()) {
            if (v.dead || v.sleep || v.servantOf != null || now - (v.windAt || 0) < 5000) continue;
            const to = _v.set(v.x - o.x, v.y + 2 - o.y, v.z - o.z);
            const along = to.dot(d);
            if (along < 0 || along > len || to.addScaledVector(d, -along).length() > width + 1.2) continue;
            v.windAt = now;
            if (v.wizard) this.wizards.windWatch(v, name, Math.hypot(v.x - o.x, v.z - o.z), o); // (a wizard sees it coming: a shield — before the push)
            if (this.game.arenaDuels?.calm(v, by) || v.foe || by === this.state(v.cs.def.id).owner) continue;
            // (a gust is never punished: no duel, no alarm, no hostility — only a grumble now and then, once a minute at most)
            if (now - (v.windSaid || 0) > LESSON.WIND_TALK_MS && Math.random() < 0.4) { v.windSaid = now; this._say(v, pick(v.wizard ? SHOUT.windedWiz : SHOUT.winded), 3); }
        }
    }

    /**
     * (host) The wind knocked this one off his feet (CreatureImpact). Once: only a protest. Twice within 20 s, and he is a wizard:
     * he alone may teach the one who blew a lesson (a soft one — `_lesson`). Nobody else stirs.
     */
    windKnocked(v, by) {
        if (!this.auth || !v || v.dead || !v.wizard || !this._isPlayer(by) || v.servantOf != null) return;
        if (this.game.arenaDuels?.calm(v, by) || v.foe || by === this.state(v.cs.def.id).owner) return;
        const now = Date.now();
        const r = windDowns(v.windDown, now);
        v.windDown = r.list;
        if (!r.lesson) { if (now - (v.windSaid || 0) > 5000) { v.windSaid = now; this._say(v, pick(SHOUT.windedWiz), 3); } return; }
        v.windDown = [];
        this._lesson(v, by);
    }

    /** A wizard teaches `by` a lesson: he alone, Expelliarmus / Stupefy only, then he leaves it (see `_fight`). */
    _lesson(v, by) {
        const now = Date.now();
        if (by === this.game.localId && this.game.dark?.skin > 80 && !teaches(this.game.dark.skin, placeOf(v.cs?.def, v.entry), v.id)) return false; // (чёрный маг: не учат)
        if (!this._fights(v) || v.foe || v.lesson || now - (v.lessonEnd || 0) < LESSON.AGAIN_MS) return false;
        v.lesson = { by, until: now + LESSON.MS, casts: 0 };
        v.grudge = { id: by, until: now + LESSON.MS };
        v.foe = by; v.path = null; v.investigate = null; v.fleeT = 0; v.seated = false;
        this._say(v, pick(SHOUT.lesson), 3);
        console.info('[CastleLife] lesson:', v.name, '→', by);
        return true;
    }

    /** The lesson is over (the pupil stunned, time, enough casts): he calms down and goes about his business. */
    _lessonOver(v) {
        v.lesson = null; v.lessonEnd = Date.now();
        v.foe = null; v.grudge = null; v.path = null; v.chaseT = 0; v.beaten = null; v.prep = null;
        this._say(v, pick(SHOUT.lessonDone), 3);
    }

    _pupilDown(by) {
        const g = this.game;
        if (by === g.localId) return !!(g.combat?.stunned || g.combat?.dead || g.knock?.down);
        const r = g.remotes?.get(by);
        return !r || r.dead || !!r.combat?.stunned;
    }

    // ------------------------------------------------------------ speech
    _say(v, text, seconds = 4, broadcast = true, force = false) {
        if (!text || v.dead || v.stunT > 0 || v.sayT > 0 && !broadcast && !force) return;
        v.sayT = 1.5;
        sayCtx(v, text, seconds);
        if (!v.bubble) { v.bubble = new SpeechBubble(); this.game.scene.add(v.bubble.sprite); }
        // a cry in a fight, a call for help, an alarm: shouted (seen and heard far)
        const shout = /!$/.test(text) && (!!v.foe || !!v.investigate || v.fleeT > 0 || v.fear?.level >= 2 || v.role === 'knight' || v.role === 'king');
        if (shout && !v.sleep && this.auth) this.night?.noise(v, 16); // (a shout wakes the sleepers near)
        // (heard aloud → no words over the head: the talk is by voice; the words only when there is no voice)
        // (a voice that would cut the answer I am hearing is not said — false: then its words show)
        const mute = !!this.game.duelOnly; // (the duel-only start: no villager voices — the words show over the head, nothing is spoken)
        const voiced = !mute && this.talk.voiceCarries?.(v, shout) && this.talk.voice(v, text, shout) !== false;
        if (voiced) v.bubble.hide?.();
        else v.bubble.show(text, { name: `${v.title} ${v.name}`, seconds, shout, color: v.wizard ? '#5b2d8e' : v.role === 'king' ? '#b8860b' : v.role === 'knight' ? '#4a5a7a' : '#5a3a1a' });
        if (!mute && !this.talk.voiceCarries?.(v, shout)) this.talk.voice(v, text, shout);
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
        if (this._chatT > 0 || !this.auth || this.game.duelOnly) return; // (the duel-only start: nobody chatters)
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
            for (const cs of this.castles.values()) if (cs.awake && !isStallSite(cs.def) && !isGuestSite(cs.def)) { if (isWizSite(cs.def) && cs.def.kind !== 'hamlet') this.wizards.crowd(cs, dt); else this._crowd(cs, dt); }
            this.hamlets.update(dt);
            this.fright.update(dt);
            this.mfear.update(dt);
            this.rebuild.update(dt);
            this.night?.update(dt);
            this.found.update(dt); // (a body of their own found: the alarm, the search — BodyFound.js)
            this.guard.update(dt);
            this.rel?.update(dt);
            this.reb?.update(dt);
            this.alog?.update(dt);
            this.social?.update(dt);
            this.court?.update(dt);
            for (const cs of this.castles.values()) if (cs.awake && (cs.watchT = (cs.watchT || 0) - dt) <= 0) { cs.watchT = 0.7; this.watch.assign(cs, dt); }
            this._squads(dt);
            this._assignSlots();
            this._healWays(dt);
            this._clock = (this._clock || 0) + dt;
            const land = this.game.world?.terrain?.data;
            const pls = this._players();
            for (const v of [...this.byId.values()]) {
                if (v.handLink) continue; // (held by the hand: HandHold leads them)
                // (its land is not made yet — the workers bring it: it waits, instead of making the ground here in the middle of a frame)
                if (land?.landMade && !land.landMade(v.x, v.z)) {
                    v.speed = 0; if (!v.dead) v.mode = 'idle';
                    // (waits for the workers' ground: that is only while no player is near — else it's a fault worth a line in the log)
                    if ((v.landWaitT = (v.landWaitT || 0) + dt) > 30 && this._players().some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 90) && this._clock - (v.landLogAt ?? -1e9) > 60) { v.landLogAt = this._clock; this.stuck.env.log(`стоит без причины ${Math.round(v.landWaitT)} с: ${this._whyStuck(v)}`, v); }
                    continue;
                }
                v.landWaitT = 0;
                this._bossNow = v.role === 'king' || v.role === 'master' ? v : null;
                if (v.imp && !v.dead && g.imperius?.step('v', v, dt)) continue; // («Империус»: a mind in it, not its own — ImperiusControl.step)
                // (calm, far from every player and out of my picture — its pose waits too: it thinks every THINK_AWAY s, its
                // time added up — a step of 0.35 m at a walk; anything happening to it — every frame again)
                let tdt = dt;
                if (v.group?.userData.matFrozen && calmAway(v) && pls.every((pl) => Math.abs(pl.p.x - v.x) + Math.abs(pl.p.z - v.z) > 70)) {
                    v.thinkAcc = (v.thinkAcc || 0) + dt;
                    if (v.thinkAcc < THINK_AWAY) continue;
                    tdt = Math.min(v.thinkAcc, 0.3); v.thinkAcc = 0;
                } else v.thinkAcc = 0;
                this._think(v, tdt);
                trackSlope(v); // (the slope under it, from how it moved: its pace and the lean of its body)
                this.stuck.env.now = this._clock;
                this.stuck.watch(v, tdt, v.mode === 'walk' || v.mode === 'run' || (v.path && v.pathI < v.path.length));
            }
            this._bossNow = null;
            this._separate(dt);
        } else {
            for (const v of this.byId.values()) {
                v.sayT -= dt; // (here too: else after a guest's first line every line of the host's villagers was dropped)
                if (v.imp?.mine && !v.dead && g.imperius?.step('v', v, dt)) continue; // (my mind is in it: my computer moves it)
                if (!v.net) continue;
                const k = Math.min(1, dt * 8);
                v.x += (v.net.x - v.x) * k; v.y += (v.net.y - v.y) * k; v.z += (v.net.z - v.z) * k;
                v.yaw = turn(v.yaw, v.net.yaw, dt * 10);
                trackSlope(v); // (the guest sees the hill under it by the moves it is shown)
            }
        }
        // models, bubbles, bars; fists of the local player; push me out of the people
        const me = g.character.group.position;
        const cam = g.camera;
        const range = drawRange(g.world?.terrain?.viewDistance); // (as far as the world is drawn)
        const pic = !!cam?.projectionMatrix; // (no picture — a test's game: everyone is «seen»)
        if (pic) _view.setFromProjectionMatrix(_viewM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); // (far people out of the picture: their pose waits — below)
        for (const v of [...this.byId.values()]) {
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            const lv = drawLevel(d, range, { foe: v.foe, shadowNear: FAR_ONE });
            const visible = lv !== 'none' && !(v.wizard && d < 20 && Math.abs(v.y - (me.y - 1.95)) > 9); // (a wizard on another floor of the tower: not drawn)
            v.group.visible = visible && !(v.dead && v.bodyMoved); // (its body carried off by «Левиоса»: Death's copy is it now)
            v.group.position.set(v.x, v.y + (v.seated ? VILLAGER_SIT_OFFSET : VILLAGER_FOOT_OFFSET), v.z);
            v.group.rotation.y = v.yaw;
            if (visible) {
                setNearShadow(v.group, d < SHADOW_NEAR);
                // (far people move their arms and legs less often — nobody sees the difference)
                v.animT = (v.animT || 0) + dt;
                const far = lv === 'far' || lv === 'distant'; // (far: drawn as one shape — VillagerModel.setFar)
                // (near too: one shape per material moved by the video card — FarShape; a near person was 10–30 draws)
                if (!far && !NEAR_ONE) v.model.setFar(false);
                // (a far one out of the picture — behind me, aside: the pose and its one-shape copy wait, the time adds up,
                // and the moment he comes into view he is posed at once; the far copies were remade for people nobody saw)
                const unseen = pic && far && !v.foe && !v.order && !v.guardOrder && !_view.intersectsSphere(_viewS.set(_v.set(v.x, v.y + 1.5, v.z), 4));
                if (unseen && !v.model._far) v.model.setFar(true); // (out of the picture: no pose, but already one shape for when it comes into view)
                v.group.userData.matFrozen = unseen; // (nobody sees it and, far, it casts no shadow: its ~25 matrices wait too — SceneMatrices)
                v.model.faceOn?.(d < 38 && !unseen);
                if (!unseen && (d < 35 || v.foe || v.animT > (lv === 'distant' ? DRAW.DISTANT_STEP : d < 60 ? 0.066 : 0.12))) {
                    // (a knight's bow out of its place on the back — and back again for the sword)
                    if (v.role === 'knight' && !v.dead && (v.model.toolKind === 'sword' || v.model.toolKind === 'longbow')) { v.model.setHeldTool(v.fx & 1 ? 'longbow' : 'sword'); v.model.setAim?.(v.aimPitch || 0); }
                    if (v.glance) { // (he looks where I pointed — CommandTalk._begin)
                        v.glance.t -= v.animT;
                        if (v.glance.t <= 0 || v.foe) { v.glance = null; v.model.lookAt(null); }
                        else {
                            v.model.lookAt(_v.set(v.glance.x, v.y + 3.4, v.glance.z));
                            // (the head turns ±70° only: the body follows, when he is not busy walking somewhere on an order)
                            if (!v.cmd && !v.foe && !(v.speed > 0.3)) v.yaw = turn(v.yaw, Math.atan2(-(v.glance.x - v.x), -(v.glance.z - v.z)), v.animT * 5);
                        }
                    }
                    const ck = this.auth ? shownChore(v) : v.chore;
                    const choreMoving = v.mode === 'chore' && v.speed > 0.4; // (a villager at a chore that is on the move — pushed, drawn off: he walks, his things are not shown: no bench stuck to the feet)
                    { const gs = d < 38 ? gestureState(this, v) : null; if (gs) v.emoNow = gs.emo; v.model.update(v.animT, { mode: choreMoving ? 'walk' : v.mode, speed: v.speed, slope: v.slope, chore: !choreMoving && ck && d < CHORE_SEEN ? ck : null, side: v.choreSide, bare: v.cmdLie, sheath: v.sheath, emo: gs?.emo, gctx: gs?.gctx, talk: gs?.talk, gest: v.gestNow, acc: gs?.acc, breath: gs?.breath, listen: gs?.listen, since: gs?.since }); }
                    v.animT = 0;
                    if (v.model.choreBeat && d < 40) this._choreSound(v, v.model.choreBeat, d);
                    if (far || NEAR_ONE) v.model.setFar(true);
                    // (a builder's hammer heard: the repairs — Rebuild.js)
                    if (v.model.workStrikeNow && v.role === 'builder' && v.model.toolKind === 'hammer' && d < 40) g.sound?.playHammer?.(_v.set(v.x, v.y + 2.2, v.z), 0.8);
                }
                if (v.imp?.mine && v.model.strikeNow) g.imperius?.landed('v', v); // (my mind's blow: at the sword's own moment)
                else if (this.auth && v.model.strikeNow && v.impDuty) g.imperius?.guards?.guardStrike(v); // (a knight on duty: the blow / the shove)
                else if (this.auth && v.model.strikeNow && v.foe) this._strike(v);
                else if (this.auth && v.model.strikeNow && v.cmd) this.cmds.strike(v);
                else if (this.auth && v.model.strikeNow && (v.order || v.guardOrder)) this.orders.strike(v);
            }
            if ((v.mode === 'swim' || v.mode === 'paddle') && visible && d < 40) splashes(g, v.x, v.y + SWIMMERS.person.float, v.z, dt, v.mode === 'paddle', v); // (the water round a swimmer)
            if (v.bubble) v.bubble.update(dt, _v.set(v.x, v.y + (v.wizard ? 5.6 : 4.4), v.z), cam);
            if (lv !== 'distant') this._updateBar(v, dt, cam); else if (v.bar) v.bar.sprite.visible = false; // (distant: no bar)
            if (v.dead) continue;
            if (d < 1.4 && d > 1e-3 && Math.abs(v.y - (me.y - 1.95)) < 2) {
                const o = 1.4 - d;
                me.x += (me.x - v.x) / d * o * 0.7; me.z += (me.z - v.z) / d * o * 0.7;
            }
            // (a chore's things — a ladder, a block, a line, a dummy: not walked through)
            const ct = d < 8 && choreThingsAt(v);
            if (ct && Math.abs(v.y - (me.y - 1.95)) < 2) {
                const dx = me.x - ct.x, dz = me.z - ct.z, dd = Math.hypot(dx, dz), R = ct.r + 0.45;
                if (dd < R && dd > 1e-3) { me.x += dx / dd * (R - dd); me.z += dz / dd * (R - dd); }
            }
        }
        this.night?.visuals(dt); // (blankets, «z-z-z», the watch's torches; a hand on a sleeper)
        this.wizards.update(dt);
        this._chatter(dt);
        this.talk.update(dt);
        this._netSend(dt);
    }

    /** A chore heard (every computer, from the body's own moment: the blow, the catch, the bubble). */
    _choreSound(v, beat, d) {
        const s = this.game.sound;
        if (!s) return;
        const p = _v.set(v.x, v.y + 2, v.z), vol = d < 15 ? 1 : 1 - (d - 15) / 30;
        if (beat === 'hammer') s.playHammer?.(p.setY(v.y + 5.5), 0.7 * vol);
        else s.playChore?.(beat, p, vol, v.model.choreNote);
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
        for (const v of this.byId.values()) list.push([v.id, r(v.x), r(v.y), r(v.z), r(v.yaw), v.mode, Math.round(v.hp * 10) / 10, Math.round(v.armor), v.seated ? 1 : 0, r(v.speed), v.fx | 0, r(v.aimPitch || 0), (v.disarmed ? 1 : 0) | (v.shieldGone ? 2 : 0) | (v.toolGone ? 4 : 0), choreCode(shownChore(v), v.choreSide)]);
        g.sync.villagers?.(list);
    }

    /** (guests) the host's villagers. */
    applyNet(list) {
        const idx = this.index;
        if (!idx) return;
        const seen = new Set();
        for (const [id, x, y, z, yaw, mode, hp, armor, seated, speed, fx, pitch, disarmed, chore] of list || []) {
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
            [v.chore, v.choreSide] = choreOf(chore); // (what they are doing: Chores.js)
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
            // (bits: 1 sword gone, 2 shield gone, 4 tool gone — «Liquidation» crumbles what is in the hand: HeldBreak.js)
            if ((disarmed & 1) && !v.disarmed) { v.disarmed = true; v.model?.setHeldTool?.('none'); }
            if ((disarmed & 2) && !v.shieldGone) { v.shieldGone = true; v.model?.dropShield?.(); }
            if ((disarmed & 4) && !v.toolGone) { v.toolGone = true; v.model?.setHeldTool?.('none'); }
            if (mode === 'dead' && !v.dead) this.game.death?.stripVillager(v); // (its sword lies on the ground now)
            if (mode === 'dead') v.dead = true;
        }
        for (const v of [...this.byId.values()]) if (!seen.has(v.id)) this._deactivate(v);
    }

    _runtimeById(cid) {
        const idx = this.index;
        if (!idx) return null;
        if (this.extra.has(cid)) return this._runtime(this.extra.get(cid));
        let def = null;
        if (idx.byId) def = idx.byId(cid); // (castles, towers, wanderers)
        else { const m = /^cs(-?\d+)_(-?\d+)$/.exec(cid); if (m) def = idx.cellOf(+m[1], +m[2]); }
        return def ? this._runtime(def) : null;
    }

    _sendState(cs) {
        const st = this.state(cs.def.id);
        this.game.sync?.castleState?.(cs.def.id, { owner: st.owner, ownerName: st.ownerName, kingDead: st.kingDead, killed: [...st.killed], ranks: st.ranks, ...(this.rel ? this.rel.pack(cs) : {}) });
    }

    /** (network / save) a castle's state. */
    applyState(id, s) {
        const st = this.state(id);
        const wasDead = st.kingDead;
        st.owner = s.owner || null; st.ownerName = s.ownerName || null; st.kingDead = !!s.kingDead;
        st.killed = new Set(s.killed || []);
        // (the king's friends: told to everybody; if mine changed, I am told too)
        const myBefore = levelOf(st.ranks, this.game.localId);
        st.ranks = s.ranks && typeof s.ranks === 'object' ? s.ranks : {};
        this.rel?.unpack(st, s);
        const my = st.ranks[this.game.localId], myLevel = my?.level | 0;
        if (this.game.active && myLevel !== myBefore) {
            this.game.hud?.notify?.(myLevel ? `👑 ${st.ownerName || 'Король'} дал вам место в замке «${this.castles.get(id)?.def?.name || ''}»: ${my.title}` : `👑 Ваше положение в замке отменено`);
        }
        const cs = this.castles.get(id) || this._runtimeById(id);
        if (cs) for (const c of cs.chests) c.locked = !st.kingDead;
        if (cs && st.kingDead && !wasDead && this.game.active) this._announceCapture(cs, st);
    }

    snapshot() {
        const out = {};
        for (const [id, s] of this.states) if (s.kingDead || s.killed.size || s.court || s.jail || Object.keys(s.ranks || {}).length || Object.keys(s.rel || {}).length || Object.keys(s.rep || {}).length || (s.reb && s.reb.v > 0)) {
                const cs = this.castles.get(id);
                out[id] = { owner: s.owner, ownerName: s.ownerName, kingDead: s.kingDead, killed: [...s.killed], ranks: s.ranks || {}, ...(cs ? (this.rel ? this.rel.pack(cs) : {}) : { rel: s.rel || {}, rep: s.rep || {}, ...(s.reb && s.reb.v > 0 ? { reb: s.reb } : {}), ...(s.court ? { court: s.court } : {}), ...(s.jail ? { jail: s.jail } : {}) }) };
            }
        const h = this.hostileSnapshot();
        if (Object.keys(h).length) out.__hostile = h;
        const fr = this.rel?.packFree?.();
        if (fr && (Object.keys(fr.rel).length || Object.keys(fr.rep).length)) out.__free = fr;
        return out;
    }

    /** The anger of the places at me: {castle id: ms left} (the time left, not the clock — leaving the game does not cool it). */
    hostileSnapshot() {
        const out = {}, now = Date.now(), me = this.game.localId;
        for (const [id, rem] of this._pendingHostile || []) if (rem > 0) out[id] = rem;
        for (const [id, cs] of this.castles) { const r = packHostile(cs.hostile.get(me), now); if (r) out[id] = r; else if (!this._pendingHostile?.has(id)) delete out[id]; }
        return out;
    }

    restore(data) {
        const { __hostile, __free, ...states } = data || {};
        this.rel?.unpackFree?.(__free);
        for (const [id, s] of Object.entries(states)) this.applyState(id, s);
        const now = Date.now(), me = this.game.localId;
        this._pendingHostile = new Map();
        for (const [id, rem] of Object.entries(__hostile || {})) {
            const cs = this.castles.get(id);
            if (cs) cs.hostile.set(me, unpackHostile(+rem, now));
            else this._pendingHostile.set(id, +rem);
        }
    }

    /** Castle captured by this player? (for the dialogue: «Ваше Величество») */
    ownerOf(castleId) { return this.state(castleId).owner; }

    dispose() {
        this.rel?.dispose();
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
