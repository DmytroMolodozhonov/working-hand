/**
 * opushka-spells.js — the battle spells in the world «Опушка» (the author 23.11: «работай над заклинаниями теперь, чтобы все заклинания работали
 * в игре (опушка), начинай от боевых в первую очередь»; before it: «Бомбардо и Бомбардо Максима пусть тоже тут работают — только учти, тут нет
 * блоков и всё по-другому»).
 *
 * The same words as in the game (the game's voice: VoiceService → matchSpell — the camera program's network or the browser's), the same wand
 * (the tip of the wand in the wizard's fist; where it points — the wand's own axis when the camera sees the arm, else where the eyes look).
 * Keys too, for a quiet room: B «Бомбардо» (Shift — Максима), J «Джолт» (Shift — Максима), T «Остолбеней», E «Экспеллиармус», K «Авада
 * Кедавра», I «Айс» (Shift — Максима), P «Протекшн» (Shift — Максима).
 *
 * This world has no blocks: a blast dents the ground itself (the height map, the grass on it, the way the feet walk), burns the grass to
 * stubble, chars the soil with glowing cracks that cool, throws clods that lie where they fell; the shock wave runs through the grass.
 *
 * Who / what × how (the author's rule — every spell is thought through for every kind):
 *   spell        | a player (me / a friend)                       | a flying pig                          | trees, rocks           | the ground, grass
 *   Bombardo     | by distance: up to 8 HP (Maxima ×3), thrown    | thrown, hurt by distance               | stops the orb; needles | a dent, char, burnt grass, clods
 *   Jolt         | 3 HP, thrown back off the feet (Maxima ×3)     | thrown far                             | stops it, a puff       | a puff of dust
 *   Stupefy      | 6 HP, falls, 3 s unable to move                | falls asleep: drops, lies 8 s          | stops it, red sparks   | red sparks
 *   Expelliarmus | the wand flies out — lies there, walk to it| not at all (no wand): a shove only   | sparks                 | sparks
 *   Avada        | 25 HP (armour does not stop it)         | dies: falls and lies                   | stops it (no harm)     | green smoke
 *   Ice          | 10 s in ice, −3 HP/s (Maxima 6 s, −10/s)       | frozen in ice, falls; thaws            | frost on the bark      | a patch of rime
 *   Protection   | a shield before the hand 3 s (Maxima — a sphere round the body 6 s): charges stop on it; a blast is softened
 * Who decides: each player for himself (a charge that reached me — on my computer), the host for the pigs; everybody sees every charge (the
 * cast goes over the net with its place and direction). Death: falls, 6 s, gets up at the meadow with full health.
 */
import * as THREE from 'three';
import { VoiceService } from '../src/input/VoiceService.js';
import { matchSpell, windPushAt, WIND_BODY_K } from '../src/fx/SpellManager.js';
import { DAMAGE } from '../src/game/Damage.js';
import { MANA, FIRST_SPELL } from '../src/game/Mana.js';
import { SPELL_COST } from '../src/game/SpellCosts.js';
import { CLASH, DUEL, clashPush } from '../src/game/Duel.js';
import { segmentToSegment } from '../src/game/SegmentContact.js';
import { aimOffset, steadyDir, applyAimOffset } from '../src/game/AimHold.js';
import { isWindRing, windRingPush } from '../src/game/WindRing.js';
import { LEVITATE } from '../src/game/Levitation.js';
import { fromGame, soundingLine } from '../src/audio/GameVoices.js';
import { cardilonCost } from '../src/game/CardilonRules.js';
import { CardilonLook } from '../src/fx/CardilonLook.js';
import { spellPhrase, afterCast, lateInSpeech, bodyNoise, soundTrust, ownVoiceEcho, TRUSTED_FAR } from '../src/audio/SpellPhrase.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new V3(), _w = new V3(), _u = new V3();

/** The spells of this world: the charge's look and speed (m/s — this world is a person's size: ~0.55 of the game's), its harm. */
export const SPELLS = {
    Bombardo: { ru: 'Бомбардо', kind: 'orb', speed: 17, grav: 3.2, life: 2.6, color: 0xff6a14, core: 0xfff0b0, size: 0.11, power: 1 },
    BombardoMaxima: { ru: 'Бомбардо Максима', kind: 'orb', speed: 15, grav: 1.9, life: 3.2, color: 0xff2a00, core: 0xffffff, size: 0.2, power: 3 },
    Jolt: { ru: 'Джолт', kind: 'bolt', speed: 13, color: 0xa9d6ff, core: 0xeaf6ff, size: 0.035, hp: 3, push: 7, life: 2.2 },
    JoltMaxima: { ru: 'Джолт Максима', kind: 'bolt', speed: 13, color: 0xc4e4ff, core: 0xffffff, size: 0.05, hp: 9, push: 15, life: 2.2 },
    Stupefy: { ru: 'Остолбеней', kind: 'bolt', speed: 12, color: 0xff3b3b, core: 0xffd8d0, size: 0.045, hp: 3, stun: 3, life: 2.4 },
    Expelliarmus: { ru: 'Экспеллиармус', kind: 'bolt', speed: 13, color: 0xc8102e, core: 0xffffff, size: 0.045, disarm: true, life: 2.4 },
    AvadaKedavra: { ru: 'Авада Кедавра', kind: 'bolt', speed: 12, color: 0x1f8a2a, core: 0x9dff3a, size: 0.06, hp: DAMAGE.AvadaKedavra, pierce: true, life: 2.6 },
    Ice: { ru: 'Айс', kind: 'bolt', speed: 14, color: 0x8fdcff, core: 0xf2fbff, size: 0.04, freeze: 10, burn: 3, life: 2.4 },
    IceMaxima: { ru: 'Айс Максима', kind: 'bolt', speed: 14, color: 0x6fc8ff, core: 0xffffff, size: 0.055, freeze: 6, burn: 10, life: 2.4 },
    SapiraDuel: { ru: 'Сапира', kind: 'bolt', speed: 12, color: 0xa77af6, core: 0xecdbff, size: 0.047, hp: DAMAGE.Sapira, push: 2.1, life: 2.5 },
    LevitateDuel: { ru: 'Вингардиум Левиоса', kind: 'bolt', speed: 11, color: 0xe7bb69, core: 0xfff4c9, size: 0.041, hp: 0, lift: 3.1, life: 2.5 },
    Wind: { ru: 'Вайнд', kind: 'gust', power: 1 },
    WindMaxima: { ru: 'Вайнд Максима', kind: 'gust', power: 3 },
    Inferno: { ru: 'Инферно', kind: 'fire' },
    Gather: { ru: 'Gather', kind: 'gather' },
    Lumos: { ru: 'Люмос', kind: 'light' },
    LumosAhead: { ru: 'Люмос вперёд', kind: 'light' },
    LumosMaxima: { ru: 'Люмос Максима', kind: 'light' },
    LumosFlashlight: { ru: 'Люмос фонарь', kind: 'light' },
    Nox: { ru: 'Нокс', kind: 'light' },
    Accio: { ru: 'Акцио', kind: 'utility' },
    Alohomora: { ru: 'Алохомора', kind: 'utility' },
    Lock: { ru: 'Lock', kind: 'utility' },
    Up: { ru: 'Up', kind: 'utility' },
    Stand: { ru: 'Stand', kind: 'utility' },
    Stop: { ru: 'Stop', kind: 'utility' },
    SuitUp: { ru:'Suit Up', kind:'utility' },
    Disarmor: { ru:'Дизармор', kind:'bolt', speed:14, color:0xe88159,core:0xffd4ab,size:.047, push:6,strip:true,life:2.1 },
    Fireworks: { ru:'Фейерверк', kind:'utility' },
    Fire: { ru:'Fire', kind:'utility' },
    Firefighting: { ru:'Firefighting', kind:'utility' },
    Cardilon: { ru:'Кардилон', kind:'utility' },
    SwordStrike: { ru:'Удар мечом', kind:'hit' },
    Protection: { ru: 'Протекшн', kind: 'shield', hold: 3, sphere: false },
    ProtectionMaxima: { ru: 'Протекшн Максима', kind: 'shield', hold: 6, sphere: true },
};
// (the game's word for each: «Frozen» is «Айс»)
const ALIAS = { Frozen: 'Ice', FrozenMaxima: 'IceMaxima', IceDuel: 'Ice', Sapira: 'SapiraDuel', Levitation: 'LevitateDuel' };
const KEYS = { KeyB: ['Bombardo', 'BombardoMaxima'], KeyJ: ['Jolt', 'JoltMaxima'], KeyT: ['Stupefy', 'Stupefy'], KeyE: ['Expelliarmus', 'Expelliarmus'],
    KeyK: ['AvadaKedavra', 'AvadaKedavra'], KeyG: ['Wind', 'WindMaxima'], KeyI: ['Ice', 'IceMaxima'], KeyP: ['Protection', 'ProtectionMaxima'] };

export const HERO = { HP: 20, RESPAWN: 6, BODY_R: 0.32, BODY_H: 1.8 };
const BLAST = { R: 4.2, PEAK: 8, CRATER: 4.8, DEPTH: 1.3, CRATER_MAX: 8.5, DEPTH_MAX: 2.8 }; // the blast of a Bombardo (Maxima: ×√3 the reach, ×3 the harm, the dent ×2.2) — the author 23.11: «слишком слабые, прямо слишком»
const MAX_BLASTS = 12;
const PIG_HP = 20;

export class OpushkaSpells {
    /** api: { scene, camera, U, player(), rig(), pigs, groundH, dent(x, z, r, d), trees(), rocks(), net(), audio(), remotes(), hud(text), setLocked(b) } */
    constructor(api) {
        this.api = api;
        this.bolts = [];
        this.successes = new Set();
        this.mana = this.maxMana = MANA.BASE;
        this.clashes = new Map();
        this.shields = [];   // {by, pos, dir, sphere, t, life, mesh}
        this.clods = null;
        this.me = { hp: HERO.HP, stun: 0, frozen: 0, burn: 0, dead: 0, fall: 0, wandOut: null, knock: new V3() };
        this._seq = 0;
        this._blastI = 0;
        this.shake = 0;
        this.heard = '';
    }

    /** At loading: everything that will ever be drawn, made now (no shader made in the middle of a fight; one light, always there). */
    init() {
        const { scene, U } = this.api;
        this.cardilonLook=new CardilonLook({scene});
        this.campfires=[];
        this.light = { position: new V3(), color: new THREE.Color(0xffa050), intensity: 0 }; this._lightT = 0; this._lightK = 0; this._lightTau = 1; this._ember = 0; // (not a THREE light: the shaders' own flash — uFlashV/uFlashC)
        U.uBlast.value = Array.from({ length: MAX_BLASTS }, () => new THREE.Vector4(0, 0, 0, -1e4));
        U.uBlastP.value = Array.from({ length: MAX_BLASTS }, () => new THREE.Vector4(0, 0, 0, 0));
        this.glow = new Sparks(scene, 2400, true);
        this.smoke = new Sparks(scene, 1600, false, this.api.groundH, U.uSunDirW);
        this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
        this.coreGeo = new THREE.IcosahedronGeometry(1, 2);
        this.halo = haloTexture();
        this.fireMat = fireballMaterial();
        this.fireGeo = new THREE.IcosahedronGeometry(1, 4);
        this.foam = Array.from({length: 6}, () => {
            const mesh = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 56),
                new THREE.MeshBasicMaterial({ color: 0xb8e8ee, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
            mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 3;
            scene.add(mesh); return mesh;
        });
        this.fires = [];
        for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(this.fireGeo, this.fireMat.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); this.fires.push(m); }
        this.iceMat = iceMaterial(); this.iceGeo = iceGeometry();
        this.iceMine = new THREE.Mesh(this.iceGeo, this.iceMat); this.iceMine.visible = false; scene.add(this.iceMine);
        this.shieldMat = shieldMaterial();
        this.shieldDisc = new THREE.CircleGeometry(0.75, 48); this.shieldBall = new THREE.SphereGeometry(1.15, 40, 24);
        this.clods = new Clods(scene, this.api.groundH);
        // a few of each, drawn once on loading (their shaders are made now)
        const warm = [new THREE.Mesh(this.shieldDisc, this.shieldMat), new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })), new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo, blending: THREE.AdditiveBlending, depthWrite: false }))];
        for (const w of warm) { w.position.set(0, -500, 0); scene.add(w); }
        this._warm = warm;
        this.voice = new VoiceService();
        this.voice.setPreference(this.api.voiceSettings?.voiceEngine);
        this.voice.onResult = (text, isFinal, held, meta) => this._heard(text, isFinal, meta);
        addEventListener('keydown', (e) => {
            if (e.repeat || !this.api.playing() || e.ctrlKey || e.metaKey || this.api.keysOff?.()) return; // (from the game's menu: spells by the voice only, as in the game)
            const k = KEYS[e.code]; if (k) this.cast(k[e.shiftKey ? 1 : 0]);
        });
    }

    /** The game's voice: started with the play (a user's gesture lets the browser's microphone in). */
    startVoice() {
        for (const w of this._warm || []) w.removeFromParent();
        this._warm = null;
        if (navigator.webdriver) return; // (automated checks: no microphone)
        const mic=this.api.voiceSettings?.voiceMic;
        if(mic&&this.voice.prefer!=='browser'&&!this.voice.shouldListen)this.voice.native.setMic(mic);
        try { this.voice.start(); } catch (e) { console.warn('[Опушка] voice', e); }
    }

    /**
     * A phrase heard — the game's own way to tell a spell (main.js voice.onResult; the author 23.11: «у нас есть система определения заклинаний,
     * много защиты — возьми готовую»; after «Бомбардо Максима» the blast's sound came back as «Айс», «Бомбардо»…): the phrase must be a spell
     * and not talk (spellPhrase), not the tail of my own last spell — its blast, its echo, the end of the same breath (afterCast), not a word
     * deep in a long sentence (lateInSpeech), not breath or steps (bodyNoise), and — found by its sound — sure enough (soundTrust).
     */
    _heard(command, isFinal, meta = null) {
        if (!this.api.playing() || !command) return;
        const final = isFinal || !!meta?.settled;
        const phrase = spellPhrase(command, { final });
        let spoken = meta?.talkOnly || phrase.name && !phrase.ok ? null : matchSpell(command);
        const when=performance.now(), from=meta?.from ?? when-2500, to=meta?.to ?? when;
        if (!spoken) {
            if (final && command.length>=3 && !ownVoiceEcho(command,meta,soundingLine(from,to))) {
                const voice=this.voice, peak=voice?.recentPeak?.(2500);
                this.api.village?.()?.hear(command,{loud:Number.isFinite(peak) && peak-voice.noiseFloor>=30});
            }
            return;
        }
        if(fromGame(spoken,{...meta,from,to}))return;
        if (spoken === 'Reveal') { if (final) this.api.reveal?.(); return; }
        const now = performance.now(), running = !!this.api.running?.();
        const why = afterCast(this._lastCast, spoken, meta, now) || lateInSpeech(spoken, command, meta, now)
            || bodyNoise({ spell: spoken, text: command, native: !!meta?.native, fit: meta?.fit, len: meta?.len, snr: meta?.snr, running, lips: undefined })
            || (meta?.native && meta.sure && !meta.byWords ? soundTrust({ spell: spoken, canonical: command, written: meta.near ?? meta.written, fit: meta.fit, len: meta.len,
                far: meta.refChecked ? Math.min(meta.far || 0, TRUSTED_FAR) : meta.far, running, lips: undefined, snr: meta.snr, combat: false, handAimed: true, known: true, holding: false, hope: false }) : null);
        if (why) { spellLog(`«${command}» отсеяно: ${why}`); return; }
        if (spoken in ALIAS) spoken = ALIAS[spoken];
        if (!SPELLS[spoken]) { if (final) this.api.hud(`«${command}» — в этом мире это заклинание пока не работает`); return; }
        // (a «Бомбардо» may still become «… Максима»: the plain one waits for the phrase's end; the others go at once — once a phrase)
        if (!final && (spoken === 'Bombardo' || spoken === 'Jolt' || spoken === 'Ice' || spoken === 'Protection' || spoken === 'Wind' || spoken === 'LevitateDuel')) return;
        if (this._lastCast && this._lastCast.seg != null && meta?.seg === this._lastCast.seg && this._lastCast.spell === spoken) return; // (the same phrase seen again)
        this._lastCast = { spell: spoken, at: now, seg: meta?.seg, to: meta?.to };
        this.cast(spoken);
    }

    /** Where the wand's tip is and where it points. */
    aim(assist = true) {
        const rig = this.api.rig(), cam = this.api.camera, P = this.api.player();
        const hand = this.api.wandHand?.() || 'R';
        const wand = this.api.wandHeld?.() === false ? null : rig?.fingers?.[hand]?.wand;
        const o = new V3(), d = new V3();
        cam.getWorldDirection(d);
        if (wand && !this.me.wandOut) {
            wand.updateWorldMatrix(true, false);
            o.set(0, wand.userData.tipY || 0.62, 0).applyMatrix4(wand.matrixWorld);
            if (this.api.armsLive()) { // the wand's own axis — and a little toward where the eyes look, if it points near there
                const ax = new V3(0, 1, 0).transformDirection(wand.matrixWorld).normalize();
                const a = ax.angleTo(d);
                d.lerp(ax, a > 0.6 ? 1 : 0.55).normalize();
            } else {
                // no camera: toward the point the eyes look at (as a cross-hair)
                const far = this._lookPoint(cam);
                d.copy(far).sub(o).normalize();
            }
        } else {
            o.copy(P.pos).add(_v.set(0, 1.45, 0)).addScaledVector(d, 0.4);
        }
        // no camera: the arm is raised toward where the eyes look and the charge leaves from the end of the raised wand (not from the wand
        // hanging at the knee — it went into the ground beside the wizard: the author's screenshots)
        if (wand && !this.me.wandOut && !this.api.armsLive() && rig?.B?.['ua' + hand]) {
            const sh = new V3(); rig.B['ua' + hand].getWorldPosition(sh);
            const far = this._lookPoint(cam);
            d.copy(far).sub(sh).normalize();
            o.copy(sh).addScaledVector(d, 0.82);
            this._raiseArm(d);
        }
        // a little help: a living target within ~5° of the line is aimed at its chest
        const best = assist ? this._assist(o, d) : null;
        if (best) d.copy(best).sub(o).normalize();
        return { o, d };
    }

    /** The right arm raised along `d` (world) for a moment — the camera's arm source replaced by this pose; the others see it too. */
    _raiseArm(d) {
        const rig = this.api.rig(), P = this.api.player(); if (!rig) return;
        const dc = d.clone().applyAxisAngle(_u.set(0, 1, 0), -P.faceYaw);
        const mk = () => ({ u: { x: 0, y: -1, z: 0 }, f: { x: 0, y: -1, z: 0 }, h: { x: 0, y: -1, z: 0 }, n: { x: 1, y: 0, z: 0 }, ok: false, hand: false, curl: null });
        const A = this._raise || (this._raise = { dirs: { L: mk(), R: mk() }, solve() {} });
        const u = dc.clone().add(_v.set(-0.12, -0.3, 0)).normalize();
        const arm = A.dirs[this.api.wandHand?.() || 'R'];
        Object.assign(arm.u, { x: u.x, y: u.y, z: u.z }); Object.assign(arm.f, { x: dc.x, y: dc.y, z: dc.z }); arm.ok = true;
        rig.arms = A; this._raiseT = 0.9;
    }

    _lookPoint(cam) {
        const o = cam.position, d = cam.getWorldDirection(new V3());
        for (let t = 1; t < 120; t += 0.5) { _v.copy(o).addScaledVector(d, t); if (this.api.solid ? this.api.solid(_v.x,_v.y,_v.z)>0 : _v.y < this.api.groundH(_v.x,_v.z)) return _v.clone(); }
        return o.clone().addScaledVector(d, 120);
    }

    _assist(o, d) {
        let best = null, bestA = 0.09;
        for (const t of this._targets()) {
            _w.copy(t.c).sub(o); const dist = _w.length(); if (dist < 1 || dist > 60) continue;
            const a = _w.normalize().angleTo(d); if (a < bestA) { bestA = a; best = t.c.clone(); }
        }
        return best;
    }

    /** Everyone a charge can meet: me, the friends, the pigs — {kind, c (centre), r, h, ref}. */
    _targets() {
        const out = [], P = this.api.player();
        if (!this.me.dead) out.push({ kind: 'me', c: new V3(P.pos.x, P.pos.y + 0.95, P.pos.z), base: P.pos, r: HERO.BODY_R, h: HERO.BODY_H });
        for (const [id, R] of this.api.remotes()) if (R.rig && !R.dead) out.push({ kind: 'friend', id, c: new V3(R.P.pos.x, R.P.pos.y + 0.95, R.P.pos.z), base: R.P.pos, r: HERO.BODY_R, h: HERO.BODY_H });
        this.api.village?.()?.people.forEach((npc) => { if (!npc.dead) out.push({ kind: 'resident', id: npc.id, npc, c: npc.pos.clone().add(new V3(0, 0.95, 0)), base: npc.pos, h: HERO.BODY_H, r: HERO.BODY_R }); });
        this.api.pigs.forEach((pg, i) => { if (!pg.dead) out.push({ kind: 'pig', i, pg, c: pg.pos.clone().add(_v.set(0, 0.45 * (pg.sc || 1), 0)), r: 0.45 * (pg.sc || 1) }); });
        return out;
    }

    /** I cast (voice or key). */
    cast(name) {
        const S = SPELLS[name];
        if (!S || S.kind==='hit' || this.me.dead || this.me.stun > 0 && name!=='Stand' || this.me.frozen > 0) {
            if (S && !this.me.dead) this.api.hud(this.me.frozen > 0 ? '❄️ Во льду не поколдуешь' : '💫 Вы оглушены');
            return;
        }
        if ((this.me.wandOut || this.api.wandHeld?.() === false) && S.kind !== 'shield' && !['Nox','Up','Stand','Stop'].includes(name)) { this.api.hud('🪄 Палочки нет в руке — подберите её'); return; }
        if (this.api.knows?.(name) === false) { this.api.hud('Сначала изучите это заклинание со свитка'); return; }
        const canonical = name === 'SapiraDuel' ? 'Sapira' : name === 'LevitateDuel' ? 'Levitation' : name;
        const cost = SPELL_COST[canonical] ?? 0;
        if (!this.noHarm && this.mana < cost) { this.api.hud('Не хватает маны'); return; }
        const { o, d } = this.aim(!S.lift&&!['gather','utility','light'].includes(S.kind));
        if(S.lift){
            if(this.levitating){this.releaseLift();return;}
            const target=this.liftTarget(o,d);
            if(target?.direct){
                if(this.startLift(target,o,d)){
                    if(!this.noHarm)this.mana-=cost;
                    this._succeeded(name);
                    this.sound('cast',o,.6);
                }
                return;
            }
        }
        if (S.kind === 'gather') {
            if (this.api.gather?.(o, d, cost)) this.sound('cast', o, .5);
            return;
        }
        if(name==='Disarmor'&&d.y>.9){
            if(this.api.stripMe?.()){
                if(!this.noHarm)this.mana-=cost;
                this._succeeded(name);
            }
            return;
        }
        if(S.kind==='light'||S.kind==='utility'){
            if(name==='Cardilon'){
                this._cardilon();
                return;
            }
            const success=S.kind==='light'?this._lightSpell(name,o,d):this._utility(name,o,d);
            if(success){
                if(!this.noHarm)this.mana-=cost;
                this._succeeded(name);
                this.sound('cast',o,.45);
                this.api.hud('«'+S.ru+'»');
            }
            return;
        }
        if (!this.noHarm) this.mana -= cost;
        const id = this.api.net()?.localId || 'me';
        const castId = id + ':' + (++this._seq);
        this.api.hud(`🪄 «${S.ru}»`);
        this._spawn(name, o, d, id, castId, true);
        if (name !== 'Inferno') this.api.net()?.send({ t: 'cast', n: name, o: [o.x, o.y, o.z].map(r3), d: [d.x, d.y, d.z].map(r4), id: castId }, true);
    }

    liftTarget(origin, direction) {
        const range=LEVITATE.RANGE*.65, end=origin.clone().addScaledVector(direction,range);
        let target, first=range;
        const consider=(kind,subject,point,joint,direct)=>{
            const t=segSphere(origin,end,point,.29);
            if(t===null||t*range>=first)return;
            const obstacle=this._worldHit(origin,point,.02);
            if(obstacle&&obstacle.t<.95)return;
            first=t*range;
            target={kind,subject,point,joint,direct};
        };
        for(const person of this.api.village?.()?.people||[]){
            if(person.rig.limp){
                const x=person.rig.limp.doll.x;
                for(let i=0;i<x.length;i+=3){
                    consider('resident',person,new V3(x[i],x[i+1],x[i+2]),i/3,person.dead||!person.mage);
                }
            }else if(!person.dead){
                const t=segCapsule(origin,end,person.pos,HERO.BODY_R,HERO.BODY_H);
                if(t!==null&&t*range<first){
                    const point=origin.clone().lerp(end,t);
                    if(!this._worldHit(origin,point,.02)){
                        first=t*range;
                        target={kind:'resident',subject:person,point,direct:!person.mage};
                    }
                }
            }
        }
        if(!this.api.net()?.isClient)for(const pig of this.api.pigs){
            consider('pig',pig,pig.pos.clone().add(new V3(0,.4,0)),0,true);
        }
        return target;
    }

    startLift(target,origin,direction) {
        const {kind,subject,point}=target;
        let joint=target.joint;
        if(kind==='resident'){
            if(!subject.rig.limp)this.api.fallResident?.(subject,new V3(),0);
            const limp=subject.rig.limp;
            if(!limp)return false;
            if(joint==null){
                let best=Infinity;
                for(let i=0;i<limp.doll.x.length;i+=3){
                    const distance=point.distanceToSquared(new V3(limp.doll.x[i],limp.doll.x[i+1],limp.doll.x[i+2]));
                    if(distance<best){best=distance;joint=i/3;}
                }
            }
            limp.recovering=false;
            limp.doll.goal=limp.doll.rise=null;
            limp.levTarget={joint,position:point.clone()};
        }else{
            subject.levitated=true;
            subject.state='ko';
            subject.ko=Math.max(subject.ko||0,2);
        }
        const offset=point.clone().sub(origin);
        this.levitating={kind,subject,point:point.clone(),distance:Math.max(1,offset.length()),
            off:aimOffset(direction,offset),last:point.clone(),velocity:new V3(),steady:{},age:0};
        return true;
    }

    stepLift(dt) {
        const lift=this.levitating;
        if(!lift)return;
        const {subject,kind}=lift;
        if(this.me.dead||this.me.stun>0||this.me.frozen>0||this.api.wandHeld?.()===false||kind==='resident'&&!subject.rig.limp){
            this.releaseLift();return;
        }
        lift.age+=dt;
        if(lift.age>=(kind==='resident'&&!subject.dead&&subject.mage?LEVITATE.WIZARD_T:LEVITATE.MAX_HOLD)){this.releaseLift();return;}
        const {o,d}=this.aim(false), direction=steadyDir(lift.steady,d,dt);
        lift.off.dp*=Math.exp(-dt*LEVITATE.RISE);
        const want=o.clone().addScaledVector(applyAimOffset(direction,lift.off,new V3()),lift.distance);
        const floor=this.api.liftFloor?.(want.x,want.z,lift.point.y)??this.api.groundH(want.x,want.z);
        want.y=Math.max(want.y+.45,floor+1.95);
        const next=lift.point.clone().lerp(want,1-Math.exp(-dt*LEVITATE.FOLLOW));
        if(!this._worldHit(lift.point,next,.02))lift.point.copy(next);
        lift.velocity.lerp(lift.point.clone().sub(lift.last).multiplyScalar(1/Math.max(dt,.001)),Math.min(1,dt*6));
        lift.last.copy(lift.point);
        if(kind==='resident')subject.rig.limp.levTarget.position.copy(lift.point);
        else subject.pos.copy(lift.point).add(new V3(0,-.4,0));
    }

    releaseLift() {
        const lift=this.levitating;
        if(!lift)return;
        const {kind,subject,velocity}=lift;
        velocity.clampLength(0,9);
        if(kind==='resident'&&subject.rig.limp){
            subject.rig.limp.levTarget=null;
            subject.rig.limp.doll.push(velocity.x,velocity.y,velocity.z);
        }else if(kind==='pig'){
            subject.levitated=false;
            subject.vel.copy(velocity);
        }
        this.levitating=null;
    }

    crystalFound(point) {
        this.maxMana += MANA.CRYSTAL;
        this.mana = Math.min(this.maxMana,this.mana+MANA.CRYSTAL);
        this.flash(point,0x6abfff,1.3,.17);
        this.api.hud('Кристалл маны · +'+MANA.CRYSTAL+' ячейка');
    }

    _succeeded(name) {
        if(this.noHarm||this.successes.has(name))return;
        this.successes.add(name);
        const gain=FIRST_SPELL[name]??(name==='SapiraDuel'?FIRST_SPELL.Sapira:0)??0;
        this.maxMana+=gain;this.mana+=gain;
    }

    _lightSpell(name,o,d) {
        if(name==='Nox'){
            this.wandLight?.removeFromParent();
            this.wandBeam?.removeFromParent();
            this.wandBeam?.target.removeFromParent();
            this.lightName=null;
            return true;
        }
        if(!this.wandLight){
            this.wandLight=new THREE.PointLight(0xffedce,3.7,10,2);
            this.wandBeam=new THREE.SpotLight(0xfff1dd,45,21,.25,.34,1.5);
        }
        const {scene}=this.api;
        scene.add(this.wandLight,this.wandBeam,this.wandBeam.target);
        this.lightName=name;
        this.lightPoint=(o||this.api.player().pos).clone().addScaledVector(d,4.2);
        this._lampStep();
        return true;
    }

    _lampStep() {
        if(!this.lightName)return;
        const where=this.api.player().pos,forward=this.api.camera.getWorldDirection(new V3());
        const mode=this.lightName,spot=mode==='LumosFlashlight';
        this.wandBeam.visible=spot;this.wandLight.visible=!spot;
        const source=where.clone().add(new V3(0,1.48,0)).addScaledVector(forward,.42);
        if(spot){this.wandBeam.position.copy(source);this.wandBeam.target.position.copy(source).addScaledVector(forward,11);}
        else{
            this.wandLight.position.copy(mode==='LumosAhead'?this.lightPoint:source);
            if(mode==='LumosMaxima')this.wandLight.position.y+=2.6;
            this.wandLight.intensity=mode==='LumosMaxima'?23:5.3;
            this.wandLight.distance=mode==='LumosMaxima'?20:10;
        }
    }

    _utility(name,o,d) {
        if(name==='Alohomora'||name==='Lock')return this.api.village?.()?.doorSpell(o,d,name==='Lock')||false;
        if(name==='Accio')return this.api.callItem?.(o,d)||false;
        if(name==='Up')return this.api.up?.()||false;
        if(name==='SuitUp')return this.api.suitUp?.()||false;
        if(name==='Fire')return this._campfire(o,d);
        if(name==='Firefighting')return this._douse(o,d);
        if(name==='Fireworks'){
            const p=o.clone().add(new V3(0,1.29,0)).addScaledVector(d,2.1);
            const hues=[0xffb153,0xe27cf1,0x69ddff,0xf0ff9f];
            for(let i=0;i<120;i++){
                const theta=Math.random()*Math.PI*2,y=Math.random()*2-1,r=Math.sqrt(1-y*y);
                const v=new V3(Math.sin(theta)*r,y,Math.cos(theta)*r).multiplyScalar(rnd(2.3,6.4));
                this.glow.spawn(p,v,hues[i%hues.length],rnd(.05,.097),rnd(.74,1.45),{drag:.95,grav:3.1});
            }
            this.flash(p,0xffae77,2.1,.21);
            return true;
        }
        if(name==='Stand'){
            if(this.api.rig()?.limp){this.me.stun=0;this.api.recover?.(this.api.player());return true;}
            return this.api.standSpell?.()||false;
        }
        if(name==='Stop'){
            this.releaseLift();
            for(const sh of this.shields)if(sh.by===this._myId())sh.dead=true;
            this._lightSpell('Nox',o,d);
            return true;
        }
        return false;
    }

    _cardilon() {
        if(this.api.net()?.active){this.api.hud('Кардилон доступен в одиночной «Опушке»');return;}
        const id=this._myId(), shield=this.shields.find(sh=>sh.by===id&&!sh.sphere&&!sh.dead);
        if(!shield){this.api.hud('Сначала поднимите обычный Protection');return;}
        const p=this.api.player().pos.clone().add(new V3(0,1.04,0));
        let chosen=null, nearest=24**2;
        for(const b of this.bolts){
            if(b.done||b.by===id||b.S.kind!=='orb')continue;
            const travel=p.clone().sub(b.p),sq=travel.lengthSq(),reach=travel.dot(b.v),speed=b.v.lengthSq();
            if(sq>=nearest||reach<=0||speed<1||sq-reach*reach/speed>=(b.S.power>1?3.10:2.05)**2||this._worldHit(shield.pos,b.p,0))continue;
            chosen=b;nearest=sq;
        }
        if(!chosen){this.api.hud('Нет летящей к вам Бомбарды');return;}
        const cost=cardilonCost(chosen.S.power);
        if(!this.noHarm&&this.mana<cost){this.api.hud('Не хватает маны');return;}
        if(!this.noHarm)this.mana-=cost;
        chosen.done=true;shield.dead=true;
        this.cardilonLook.start(shield.pos,chosen.p,chosen.S.power);
        this._succeeded('Cardilon');
        this.sound('cast',shield.pos,.58);
        this.api.hud('Кардилон · заряд перехвачен');
    }

    _campfire(o,d) {
        const hit=this._worldHit(o,o.clone().addScaledVector(d,11),0,true);
        if(hit?.kind!=='ground'||hit.n.y<.55||this.api.waterAt(hit.p.x,hit.p.z)
            ||this.campfires.some(f=>f.root.position.distanceToSquared(hit.p)<1.4))return false;
        this.fireWood ||= {geo:new THREE.CylinderGeometry(.064,.082,.65,9),mat:new THREE.MeshStandardMaterial({color:0x463323,roughness:.94})};
        const root=new THREE.Group(),wood=this.fireWood;
        root.position.copy(hit.p);
        for(let i=0;i<4;i++){
            const log=new THREE.Mesh(wood.geo,wood.mat),a=i*Math.PI*.47;
            log.rotation.set(Math.PI*.49,0,a,'YXZ');
            log.position.y=.13+i*.027;
            root.add(log);
        }
        const mat=this.fireMat.clone(),flame=new THREE.Mesh(this.fireGeo,mat);
        mat.uniforms.uSeed.value=hit.p.x*.013+hit.p.z*.017;
        mat.uniforms.uK.value=.32;
        flame.position.y=.38;flame.scale.set(.33,.64,.34);flame.frustumCulled=false;
        root.add(flame);this.api.scene.add(root);
        this.campfires.push({root,flame,age:0,smoke:0});
        if(this.campfires.length>12)this._removeFire(this.campfires[0]);
        return true;
    }

    _removeFire(fire) {
        const i=this.campfires.indexOf(fire);
        if(i>=0)this.campfires.splice(i,1);
        fire.root.removeFromParent();
        fire.flame.material.dispose();
    }

    _douse(o,d) {
        const end=o.clone().addScaledVector(d,10);
        const targets=this.campfires.filter(f=>{
            const center=f.root.position.clone().add(new V3(0,.44,0));
            return segSphere(o,end,center,.68)!==null&&!this._worldHit(o,center,0);
        });
        for(const fire of targets){
            const p=fire.root.position.clone().add(new V3(0,.33,0));
            for(let i=0;i<18;i++)this.smoke.spawn(p,new V3(rnd(-.5,.5),rnd(.7,1.7),rnd(-.5,.5)),0xb9c4bb,.1,rnd(.53,.94),{grow:1,alpha:.56});
            this._removeFire(fire);
        }
        return targets.length>0;
    }

    castResident(npc, target, name) {
        name=ALIAS[name]||name;
        if(!SPELLS[name])return false;
        const wand = npc.rig.fingers?.[npc.rig.activeHand]?.wand;
        if (!wand?.visible) return false;
        const origin = wand.localToWorld(new V3(0, wand.userData.tipY || 0.62, 0));
        const heading = target.clone().add(new V3(0, 1.13, 0)).sub(origin).normalize();
        const end = origin.clone().addScaledVector(heading, origin.distanceTo(target) - 0.4);
        if (this._worldHit(origin, end, 0)) return false;
        this._spawn(name, origin, heading, npc.id, npc.id + ':' + (++this._seq), false);
        return true;
    }

    /** Somebody else's cast came over the net: the same charge here (it hurts whoever it reaches on his own computer). */
    netCast(m) {
        if (!SPELLS[m.n] || ['gather','hit','utility','light'].includes(SPELLS[m.n].kind) || !Array.isArray(m.o) || !Array.isArray(m.d)) return;
        const o = new V3(...m.o), d = new V3(...m.d).normalize();
        if (![o.x, o.y, o.z, d.x, d.y, d.z].every(Number.isFinite)) return;
        this._spawn(m.n, o, d, m.from, m.id, false);
    }

    _spawn(name, o, d, by, castId, mine) {
        const S = SPELLS[name];
        if (S.kind === 'shield') { this._shield(name, o, d, by); if(mine)this._succeeded(name);return; }
        if (S.kind === 'fire') { if(mine&&this.api.ignite?.())this._succeeded(name);return; }
        if(S.kind==='gust'){
            this.castGust(name,o,d,by,mine);
            return;
        }
        const core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(S.core).multiplyScalar(2.2), toneMapped: false }));
        core.scale.setScalar(S.size); core.position.copy(o);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo, color: S.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
        halo.scale.setScalar(S.size * (S.kind === 'orb' ? 9 : 11));
        core.add(halo); halo.scale.divideScalar(S.size);
        this.api.scene.add(core);
        const b = { name, S, by, id: castId, mine, p: o.clone(), v: d.clone().multiplyScalar(S.speed), age: 0, core, halo, hand: o.clone(), dir: d.clone(), done: false, spin: Math.random() * 6 };
        if (S.kind === 'bolt') b.streak = this._makeBeam(S.color, S.core);
        this.bolts.push(b);
        this._castFx(b);
        this.sound(name === 'BombardoMaxima' ? 'castMax' : S.kind === 'orb' ? 'cast' : name === 'AvadaKedavra' ? 'avada' : name.startsWith('Ice') ? 'ice' : name.startsWith('Jolt') ? 'jolt' : 'bolt', o, S.kind === 'orb' ? 1 : 0.8, S.color);
    }

    castGust(name,origin,direction,caster,mine) {
        const power=SPELLS[name].power, radial=isWindRing(name,direction);
        const source=this._bodyOf(caster);
        if(radial&&source)origin=source.clone().add(new V3(0,.65,0));
        this.api.airGust?.(origin,direction,power,radial);
        let affected=this.api.village?.()?.windDoor(origin,direction);
        const scale=.60, range=(power>1?24:14)*scale;
        const push=(point)=>{
            if(this._worldHit(origin,point,0)||this._shieldHit(origin,point,caster))return null;
            if(!radial)return windPushAt(origin,direction,point,range,13*power*scale,2.5*scale);
            const scaled=point.clone().sub(origin).divideScalar(scale).add(origin);
            return windRingPush(origin,scaled)?.multiplyScalar(scale) || null;
        };
        const myId=this._myId(), net=this.api.net();
        for(const target of this._targets()){
            if(target.kind==='friend'||target.kind==='resident'&&target.id===caster||target.kind==='me'&&(mine||caster===myId)||target.kind==='pig'&&net?.isClient)continue;
            const force=push(target.c);
            if(!force)continue;
            const up=force.y*1.25, speed=force.setY(0).length()*WIND_BODY_K;
            const dir=force.normalize();
            affected=true;
            if(target.kind==='resident')this.api.village().hit(target.npc,0,dir,caster,{push:speed,up,hostile:true});
            else if(target.kind==='me')this.hurtMe(name,dir,caster,{hp:0,push:speed,up});
            else if(target.kind==='pig'){
                target.pg.vel.addScaledVector(dir,speed).setY(up);
                target.pg.ko=Math.max(target.pg.ko||0,1.3);
                target.pg.state='ko';
            }
        }
        if(this.api.blowItems?.(push))affected=true;
        this.sound('gust',origin,.55);
        if(mine&&affected)this._succeeded(name);
    }

    _castFx(b) {
        const { S, p, dir } = b, G = this.glow;
        const n = b.name === 'BombardoMaxima' ? 70 : 26;
        for (let i = 0; i < n; i++) {
            _v.copy(dir).multiplyScalar(rnd(1, 4)).add(_w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(1.4));
            G.spawn(p, _v, i % 3 ? S.color : S.core, rnd(0.02, 0.05), rnd(0.2, 0.45), { drag: 3, grav: -0.3 });
        }
        this.flash(p, S.color, b.name === 'BombardoMaxima' ? 6 : 2.5, 0.12);
    }

    // ----------------------------------------------------------------------------------------------- shields
    _shield(name, o, d, by) {
        const S = SPELLS[name];
        const mesh = new THREE.Mesh(S.sphere ? this.shieldBall : this.shieldDisc, this.shieldMat.clone());
        mesh.material.uniforms.uT0.value = this.api.U.uTime.value;
        this.api.scene.add(mesh);
        const sh = { name, by, sphere: S.sphere, t: 0, life: S.hold, mesh, pos: new V3(), dir: d.clone().setY(d.y * 0.4).normalize() };
        this.shields = this.shields.filter((x) => { if (x.by === by) { x.mesh.removeFromParent(); return false; } return true; }); // (one shield each)
        this.shields.push(sh);
        this._placeShield(sh);
        this.sound('shield', sh.pos, 0.7);
        for (let i = 0; i < 40; i++) this.glow.spawn(sh.pos, _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(1.2), 0xbfe3ff, rnd(0.02, 0.04), rnd(0.3, 0.6), { drag: 4 });
    }

    _placeShield(sh) {
        const body = this._bodyOf(sh.by);
        if (!body) return;
        if (sh.sphere) sh.pos.set(body.x, body.y + 0.95, body.z);
        else { const P = this.api.player(); if (sh.by === this._myId()) { this.api.camera.getWorldDirection(sh.dir); sh.dir.y *= 0.4; sh.dir.normalize(); }
            sh.pos.set(body.x, body.y + 1.3, body.z).addScaledVector(sh.dir, 0.75); void P; }
        sh.mesh.position.copy(sh.pos);
        if (!sh.sphere) sh.mesh.lookAt(_v.copy(sh.pos).add(sh.dir));
    }

    _myId() { return this.api.net()?.localId || 'me'; }
    _bodyOf(id) {
        if (id === this._myId() || id === 'me') return this.api.player().pos;
        return this.api.remotes().get(id)?.P.pos || this.api.village?.()?.people.find((person)=>person.id===id&&!person.dead)?.pos || null;
    }

    /** Does a charge on its way from a to b meet a shield (not its own caster's)? → the shield */
    _shieldHit(a, b, by) {
        for (const sh of this.shields) {
            if (sh.by === by) continue;
            const r = sh.sphere ? 1.15 : 0.75;
            const t = segSphere(a, b, sh.pos, r);
            if (t === null) continue;
            if (!sh.sphere) { _v.copy(a).lerp(b, t).sub(sh.pos); if (Math.abs(_v.dot(sh.dir)) > 0.35) continue; }
            return { sh, t };
        }
        return null;
    }

    // ----------------------------------------------------------------------------------------------- every frame
    update(dt) {
        const { U } = this.api;
        this._me(dt);
        this.stepLift(dt);
        this._lampStep();
        this.cardilonLook?.update(dt);
        this.mana=Math.min(this.maxMana,this.mana+dt);
        for (const sh of this.shields) {
            sh.t += dt; this._placeShield(sh); sh.mesh.material.uniforms.uTime.value = this.api.U.uTime.value;
            const fade = Math.min(1, sh.t * 6) * (1 - clamp((sh.t - sh.life + 0.6) / 0.6, 0, 1));
            sh.mesh.material.uniforms.uA.value = fade;
            if (sh.t >= sh.life) sh.dead = true;
        }
        this.shields = this.shields.filter((sh) => { if (sh.dead) { sh.mesh.removeFromParent(); sh.mesh.material.dispose(); } return !sh.dead; });
        for (const b of this.bolts) if (!b.done) this._fly(b, dt);
        this._stepClashes(dt);
        this.bolts = this.bolts.filter((b) => { if (b.done) { b.core.removeFromParent(); b.core.material.dispose(); b.halo.material.dispose(); if (b.streak) { b.streak.removeFromParent(); b.streak.material.dispose(); } } return !b.done; });
        this.glow.update(dt); this.smoke.update(dt); this.clods.update(dt);
        for (const ring of this.foam) {
            if (!ring.visible) continue;
            const u = ring.userData;
            u.age += dt;
            const progress = u.age / u.life;
            ring.visible = progress < 1;
            ring.scale.setScalar(0.3 + (1 - (1 - progress) ** 2) * u.radius);
            ring.material.opacity = 0.55 * Math.max(0, 1 - progress) ** 1.4;
        }
        for (const f of this.fires) if (f.visible) this._fireStep(f, dt);
        for(const fire of this.campfires){
            fire.age+=dt;fire.smoke+=dt;
            const pulse=Math.sin(fire.age*11.3)+.51*Math.sin(fire.age*27.2);
            fire.flame.scale.set(.32+pulse*.024,.54+pulse*.058,.33+pulse*.021);
            const u=fire.flame.material.uniforms;
            u.uTime.value+=dt;
            if(fire.smoke>.12&&fire.root.position.distanceToSquared(this.api.player().pos)<34**2){
                fire.smoke=0;
                this.smoke.spawn(fire.root.position.clone().add(new V3(0,.55,0)),new V3(rnd(-.12,.12),1.08,rnd(-.12,.12)),0x655b4f,.12,2.3,{grow:.9,alpha:.44});
            }
        }
        for (const pg of this.api.pigs) {
            const on = pg.frozen > 0 && !pg.dead;
            if (on && !pg.ice) { pg.ice = new THREE.Mesh(this.iceGeo, this.iceMat); pg.ice.scale.set(1.3, 0.45, 1.6); this.api.scene.add(pg.ice); }
            if (pg.ice) { pg.ice.visible = on; if (on) { pg.ice.position.copy(pg.pos).add(_v.set(0, -0.05, 0)); pg.ice.rotation.y = pg.yaw; } }
        }
        // the one light: a flash fades, then the embers' glow
        this._lightT += dt;
        // (never «not a number»: a NaN light turns every lit thing on the video card black — the author's dark forest, 23.11)
        const li = this._lightK * Math.exp(-this._lightT / (this._lightTau || 1)) + (this._ember || 0) * Math.max(0, 1 - this._lightT / 6) * (0.8 + 0.2 * Math.sin(this._lightT * 23));
        this.light.intensity = Number.isFinite(li) ? li : 0;
        const Uf = this.api.U;
        Uf.uFlashC.value.set(this.light.color.r, this.light.color.g, this.light.color.b, this.light.intensity * 0.15);
        if (this.light.intensity > 0.01) Uf.uFlashV.value.copy(this.light.position).applyMatrix4(this.api.camera.matrixWorldInverse);
        this.shake = Math.max(0, this.shake - dt * 1.6);
        void U;
    }

    flash(p, color, k, tau) {
        if (this._lightK * Math.exp(-this._lightT / (this._lightTau || 1)) > k * 1.5) return; // (a bigger flash still burning wins)
        this.light.position.copy(p); this.light.color.setHex(color).convertSRGBToLinear(); this._lightK = k * 40; this._lightT = 0; this._lightTau = tau; this._ember = 0;
    }

    _fly(b, dt) {
        b.age += dt;
        const { S } = b;
        const a = b.p.clone(); b.previous = a;
        if (S.grav) b.v.y -= S.grav * dt;
        b.p.addScaledVector(b.v, dt);
        b.core.position.copy(b.p);
        if (b.streak) {
            const tail = b.p.clone().addScaledVector(b.dir, -Math.min(2.8, b.age * S.speed));
            this._setBeam(b.streak, tail, b.p, S.size * 0.42);
        }
        b.spin += dt * 9; b.core.rotation.set(b.spin, b.spin * 0.7, 0);
        b.halo.material.opacity = 0.75 + 0.25 * Math.sin(b.age * 40 + b.spin);
        // the trail
        const G = this.glow, maxi = b.name === 'BombardoMaxima';
        const n = S.kind === 'orb' ? (maxi ? 9 : 4) : b.name === 'AvadaKedavra' ? 3 : 2;
        for (let i = 0; i < n; i++) {
            _w.copy(b.p).lerp(a, Math.random());
            _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(S.kind === 'orb' ? (maxi ? 1.6 : 0.8) : 0.25);
            G.spawn(_w, _v, i === 0 ? S.core : S.color, S.kind === 'orb' ? rnd(0.04, 0.09) * (maxi ? 1.8 : 1) : rnd(0.015, 0.03), S.kind === 'orb' ? rnd(0.2, 0.4) : rnd(0.12, 0.25), { drag: 2, grav: S.kind === 'orb' ? -0.6 : 0 });
        }
        if (b.name === 'AvadaKedavra' && Math.random() < 0.5) this.smoke.spawn(b.p, _v.set(rnd(-0.2, 0.2), rnd(0, 0.3), rnd(-0.2, 0.2)), 0x0c2a10, rnd(0.08, 0.14), rnd(0.6, 1), { grow: 0.4, alpha: 0.5 });
        if (b.name.startsWith('Jolt') && Math.random() < 0.6) this.smoke.spawn(b.p, _v.set(0, 0, 0), 0xdfeeff, 0.05, 0.3, { grow: 1.6, alpha: 0.12 });
        if (b.name.startsWith('Ice') && Math.random() < 0.7) G.spawn(b.p, _v.set(rnd(-0.3, 0.3), rnd(-0.5, 0), rnd(-0.3, 0.3)), 0xffffff, 0.012, 0.6, { drag: 1, grav: 0.8 });
        if (maxi && b.age < 0.45) for (let i = 0; i < 5; i++) G.spawn(b.hand, _v.copy(b.dir).multiplyScalar(rnd(5, 10)).add(_w.set(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))), Math.random() < 0.4 ? 0xffffff : 0xffa030, rnd(0.03, 0.06), rnd(0.15, 0.3), { drag: 3 });
        if (b.age < 0.06) return; // (the first moment: out of the hand)
        // what it meets on the way a → b.p: a shield, a body, a tree or a rock, the ground
        const sh = this._shieldHit(a, b.p, b.by);
        if (sh) { this._onShield(b, a.lerp(b.p, sh.t), sh.sh); return; }
        let hit = null, ht = 2;
        for (const t of this._targets()) {
            if (t.id === b.by || b.age < 0.25 && t.kind === 'me' && b.mine) continue; // (not the caster himself as it leaves the hand)
            const tt = t.h ? segCapsule(a, b.p, t.base, t.r + S.size, t.h) : segSphere(a, b.p, t.c, t.r + S.size);
            if (tt !== null && tt < ht) { ht = tt; hit = t; }
        }
        const world = this._worldHit(a, b.p, S.size, S.kind === 'orb');
        const endAt = Math.min(world?.t ?? 1, ht);
        if (S.kind === 'bolt' && this._tryClash(b, a, a.clone().lerp(b.p, endAt))) return;
        if (world && world.t < ht) { this._onWorld(b, world); return; }
        if (hit) { this._onBody(b, a.clone().lerp(b.p, ht), hit); return; }
        if (b.age > (S.life || 2.5)) { if (S.kind === 'orb') this._explode(b, b.p.clone()); else this._fizzle(b); }
    }

    _makeBeam(color, coreColor) {
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(coreColor || color).multiplyScalar(2.1), toneMapped: false });
        const mesh = new THREE.Mesh(this.beamGeo, material);
        mesh.visible = false;
        this.api.scene.add(mesh);
        return mesh;
    }

    _setBeam(mesh, a, b, width) {
        const direction = b.clone().sub(a), length = direction.length();
        mesh.visible = length > 0.01;
        if (!mesh.visible) return;
        mesh.position.copy(a).lerp(b, 0.5);
        mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), direction.divideScalar(length));
        mesh.scale.set(width, length, width);
    }

    _tryClash(shot, previous, tip) {
        const net = this.api.net();
        if (!net?.isHost) return false;
        const body = this._bodyOf(shot.by);
        if (!body) return false;
        for (const other of this.bolts) {
            if (other.done || other.S.kind !== 'bolt' || other.by === shot.by || other.age < 0.05
                || shot.dir.dot(other.dir) > -CLASH.FACING) continue;
            const rival = this._bodyOf(other.by);
            if (!rival) continue;
            const between = rival.clone().sub(body).setY(0);
            if (between.lengthSq() < 1) continue;
            between.normalize();
            if (between.dot(shot.dir) < 0.55 || between.dot(other.dir) > -0.55) continue;
            const meet = segmentToSegment(previous, tip, other.previous || other.p, other.p);
            if (meet.dist > CLASH.MEET * 0.58) continue;
            const point = previous.clone().lerp(tip, meet.s).lerp((other.previous || other.p).clone().lerp(other.p, meet.k), 0.5);
            const message = { t: 'opclash', mode: 'start', id: shot.id + '/' + other.id,
                a: { by: shot.by, spell: shot.name, bolt: shot.id, dir: shot.dir.toArray() },
                b: { by: other.by, spell: other.name, bolt: other.id, dir: other.dir.toArray() }, at: point.toArray() };
            this.netClash(message);
            net.send(message);
            return true;
        }
        return false;
    }

    netClash(message) {
        let clash = this.clashes.get(message.id);
        if (message.mode === 'start' && !clash) {
            const sa = SPELLS[message.a?.spell], sb = SPELLS[message.b?.spell];
            if (!sa || !sb || !Array.isArray(message.at) || !message.at.every(Number.isFinite)) return;
            for (const b of this.bolts) if (b.id === message.a.bolt || b.id === message.b.bolt) b.done = true;
            clash = { a: message.a, b: message.b, point: new V3(...message.at), aim: new V3(...message.at),
                ma: this._makeBeam(sa.color, sa.core), mb: this._makeBeam(sb.color, sb.core), time: 0, send: 0, p: 0.5, lostA: 0, lostB: 0 };
            this.clashes.set(message.id, clash);
            if ([clash.a.by, clash.b.by].includes(this._myId())) this.api.hud('⚡ Лучевая дуэль — держите палочку на сопернике');
        } else if (message.mode === 'step' && clash && Array.isArray(message.at) && message.at.every(Number.isFinite)) {
            clash.aim.set(...message.at);
        } else if (message.mode === 'end' && clash) {
            if (message.loser === this._myId()) {
                const winner = clash.a.by === message.loser ? clash.b : clash.a;
                this.hurtMe(winner.spell, new V3(...winner.dir), winner.by);
            }
            for (const m of [clash.ma, clash.mb]) { m.parent?.remove(m); m.material.dispose(); }
            this.clashes.delete(message.id);
        }
    }

    _beamHand(side) {
        const mine = side.by === this._myId();
        const remote = mine ? null : this.api.remotes().get(side.by);
        const body = this._bodyOf(side.by), rig = mine ? this.api.rig() : remote?.rig;
        if (!body || (mine ? this.me.dead || this.api.wandHeld?.() === false : remote?.dead || (remote?.st & 20))) return null;
        const wand = rig?.fingers?.[rig?.activeHand]?.wand;
        const pointed = mine ? this.api.armsLive() : !!remote?.arms?.dirs?.[rig?.activeHand]?.ok;
        if (wand && pointed) {
            wand.updateWorldMatrix(true, false);
            return { point: wand.localToWorld(new V3(0, wand.userData.tipY || 0.62, 0)), dir: new V3(0, 1, 0).transformDirection(wand.matrixWorld) };
        }
        const look = mine ? this.api.player() : remote?.P;
        const dir = look ? new V3(-Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.yaw) * Math.cos(look.pitch)) : new V3(...side.dir);
        return { point: body.clone().add(new V3(0, 1.27, 0)).addScaledVector(dir, 0.43), dir };
    }

    _stepClashes(dt) {
        const net = this.api.net();
        for (const [id, c] of this.clashes) {
            c.time += dt;
            const a = this._beamHand(c.a), b = this._beamHand(c.b);
            if (net?.isHost) {
                let loser = null;
                if (!a || !b) loser = a ? c.b.by : b ? c.a.by : null;
                if (a && b) {
                    const axis = b.point.clone().sub(a.point);
                    const distance = axis.length();
                    axis.normalize();
                    const dotA = a.dir.dot(axis), dotB = -b.dir.dot(axis), minimum = Math.cos(DUEL.CONTACT_ANGLE);
                    c.lostA = dotA < minimum ? c.lostA + dt : 0;
                    c.lostB = dotB < minimum ? c.lostB + dt : 0;
                    if ((c.lostA > 0.45) !== (c.lostB > 0.45)) loser = c.lostA > 0.45 ? c.a.by : c.b.by;
                    c.p = clamp(c.p + clashPush(2.4 * (dotA - dotB)) * dt, 0, 1);
                    if (c.p <= 0.035 || c.p >= 0.965) loser = c.p < 0.5 ? c.a.by : c.b.by;
                    c.aim.copy(a.point).lerp(b.point, c.p);
                    if (distance > 35 || this._worldHit(a.point, c.aim, 0) || this._worldHit(b.point, c.aim, 0)) c.time = 17;
                }
                if (loser || !a || !b || c.time > 16) {
                    const m = { t: 'opclash', mode: 'end', id, loser };
                    net.send(m);
                    this.netClash(m);
                    continue;
                }
                if ((c.send += dt) >= 0.09) {
                    c.send = 0;
                    net.send({ t: 'opclash', mode: 'step', id, at: c.aim.toArray().map(r3) });
                }
            } else if (!net || c.time > 18) {
                this.netClash({ mode: 'end', id });
                continue;
            }
            if (!a || !b) continue;
            c.point.lerp(c.aim, 1 - Math.exp(-dt * 18));
            this._setBeam(c.ma, a.point, c.point, 0.045);
            this._setBeam(c.mb, b.point, c.point, 0.045);
            this.glow.spawn(c.point, new V3(rnd(-1.5, 1.5), rnd(-0.2, 1.2), rnd(-1.5, 1.5)), 0xfff3b8, 0.078, 0.22);
        }
    }

    /** The trees' trunks, the rocks, the ground between a and b → {t, p, kind, n} */
    _worldHit(a, b, rad, hitWater = false) {
        let best = null;
        const house = this.api.village?.()?.trace(a, b, rad);
        if (hitWater && (a.y >= 0) !== (b.y >= 0)) {
            const t = a.y / (a.y - b.y), point = a.clone().lerp(b, t);
            if (this.api.waterAt(point.x, point.z)) best = { t, p: point, kind: 'water', n: new V3(0, 1, 0) };
        }
        const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.2));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (best && t >= best.t) break;
            _v.copy(a).lerp(b, t);
            const g = this.api.groundH(_v.x, _v.z);
            const solid = this.api.solid;
            if (solid ? solid(_v.x, _v.y, _v.z) >= -rad : _v.y - rad <= g) {
                const p = _v.clone(), n = new V3(0, 1, 0);
                if (solid) {
                    const {x,y,z} = p, d=0.16;
                    n.set(solid(x-d,y,z)-solid(x+d,y,z),solid(x,y-d,z)-solid(x,y+d,z),solid(x,y,z-d)-solid(x,y,z+d)).normalize();
                } else p.y = Math.max(p.y, g);
                best = { t, p, kind: 'ground', n };
                break;
            }
        }
        for (const tr of this.api.trees()) {
            if (_u.set(b.x - tr.x, 0, b.z - tr.z).lengthSq() > 64) continue;
            const t = segCylinder(a, b, tr.x, tr.z, tr.r + rad, tr.y, tr.y + tr.h);
            if (t !== null && (!best || t < best.t)) best = { t, p: a.clone().lerp(b, t), kind: 'tree', n: _u.set(a.x - tr.x, 0, a.z - tr.z).normalize().clone(), tree: tr };
        }
        for (const rk of this.api.rocks()) {
            const t = segSphere(a, b, rk.c, rk.r + rad);
            if (t !== null && (!best || t < best.t)) best = { t, p: a.clone().lerp(b, t), kind: 'rock', n: a.clone().sub(rk.c).normalize() };
        }
        return house && (!best || house.t < best.t) ? house : best;
    }

    _onShield(b, p, sh) {
        b.done = true;
        const G = this.glow;
        for (let i = 0; i < 36; i++) G.spawn(p, _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(2.5), i % 2 ? b.S.color : 0xcfe8ff, rnd(0.02, 0.05), rnd(0.2, 0.45), { drag: 3 });
        sh.mesh.material.uniforms.uHit.value.copy(p); sh.mesh.material.uniforms.uHitT.value = this.api.U.uTime.value;
        this.sound('block', p, 0.8);
        if (b.S.kind === 'orb') this._explode(b, p, 0.4); // (a blast on the shield: it still goes off, softened behind it)
    }

    _onWorld(b, w) {
        spellLog(`${b.name} → ${w.kind} на ${b.age.toFixed(2)} с, ${w.p.distanceTo(b.hand).toFixed(1)} м`);
        if (b.S.kind === 'orb') { this._explode(b, w.kind === 'water' ? w.p : w.p.addScaledVector(w.n, 0.1), 1, w.kind === 'water'); return; }
        b.done = true;
        const G = this.glow, S = b.S;
        for (let i = 0; i < 22; i++) G.spawn(w.p, _v.copy(w.n).multiplyScalar(rnd(0.5, 2.5)).add(_w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))), i % 2 ? S.color : S.core, rnd(0.015, 0.035), rnd(0.15, 0.4), { drag: 2, grav: 2 });
        if (w.kind === 'ground') for (let i = 0; i < 5; i++) this.smoke.spawn(w.p, _v.set(rnd(-0.4, 0.4), rnd(0.2, 0.6), rnd(-0.4, 0.4)), 0x6b5a45, rnd(0.1, 0.18), rnd(0.8, 1.4), { grow: 0.5, alpha: 0.45 });
        if (b.name === 'AvadaKedavra') for (let i = 0; i < 8; i++) this.smoke.spawn(w.p, _v.set(rnd(-0.3, 0.3), rnd(0.2, 0.5), rnd(-0.3, 0.3)), 0x1a4a1c, rnd(0.12, 0.2), rnd(1, 1.8), { grow: 0.5, alpha: 0.5 });
        if (b.name.startsWith('Ice')) this._rime(w.p, b.name === 'IceMaxima' ? 1.4 : 0.8);
        if (w.kind === 'tree') this._needles(w.p, 30);
        this.flash(w.p, S.color, 1, 0.1);
        this.sound('hit', w.p, 0.5, S.color);
    }

    _fizzle(b) {
        b.done = true;
        for (let i = 0; i < 12; i++) this.glow.spawn(b.p, _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), b.S.color, 0.02, 0.3, { drag: 2 });
    }

    /** A charge reached a body. */
    _onBody(b, p, t) {
        spellLog(`${b.name} → ${t.kind} на ${b.age.toFixed(2)} с, ${p.distanceTo(b.hand).toFixed(1)} м`);
        b.done = true;
        const S = b.S, G = this.glow;
        if(b.mine)this._succeeded(b.name);
        if (S.kind === 'orb') { this._explode(b, p); return; }
        for (let i = 0; i < 30; i++) G.spawn(p, _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(2), i % 2 ? S.color : S.core, rnd(0.02, 0.04), rnd(0.2, 0.45), { drag: 3 });
        this.flash(p, S.color, 1.4, 0.12);
        this.sound('hit', p, 0.8, S.color);
        const net = this.api.net();
        if (t.kind === 'me') {
            if (!net?.isClient) this.hurtMe(b.name, b.dir, b.by);
        } else if (t.kind === 'friend' && net?.isHost) {
            net.send({ t: 'opimpact', who: t.id, by: b.by, spell: b.name, dir: b.dir.toArray().map(r3) });
        }
        else if (t.kind === 'resident') {
            const village=this.api.village();
            if(S.lift&&b.mine){
                if(!this.levitating)this.startLift({kind:'resident',subject:t.npc,point:p},b.hand,b.dir);
                return;
            }
            if(S.disarm){
                const disarmed=village.disarm(t.npc);
                village.hit(t.npc,0,b.dir,b.by,{push:disarmed?0:1.6,hostile:true});
                return;
            }
            if(S.strip)village.stripArmor?.(t.npc);
            village.hit(t.npc,b.name==='AvadaKedavra'?t.npc.hp:S.hp||0,b.dir,b.by,{
                push:S.push||0,up:S.push?2.5+S.push*.15:0,stun:S.stun||0,freeze:S.freeze||0,
            });
        }
        else if (t.kind === 'pig') this._pigHit(t.i, b.name, b.dir, 1);
    }

    // ----------------------------------------------------------------------------------------------- the blast
    _explode(b, p, soft = 1, water = p.y <= 0 && !!this.api.waterAt(p.x, p.z)) {
        b.done = true;
        spellLog(`${b.name} взрыв: ${b.age.toFixed(2)} с, ${b.p.distanceTo(b.hand).toFixed(1)} м от руки`);
        const maxi = b.name === 'BombardoMaxima', S = b.S, pw = S.power;
        const R = BLAST.R * Math.sqrt(pw);
        if(b.mine)this._succeeded(b.name);
        this.api.loot?.()?.blast(p,R,b.by);
        const G = this.glow, Sm = this.smoke;
        if (water) this.waterBurst(p, R, soft);
        else {
            // the fireball
            const f = this.fires.find((x) => !x.visible) || this.fires[0];
            f.visible = true; f.position.copy(p); f.userData = { t: 0, life: maxi ? 1.9 : 1.3, R: R * 0.62 * soft, y: p.y };
            f.material.uniforms.uSeed.value = Math.random() * 100;
            // sparks and embers
            const n = maxi ? 700 : 320;
            for (let i = 0; i < n; i++) {
                _v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, maxi ? 24 : 15) * soft);
                G.spawn(p, _v, Math.random() < 0.3 ? 0xffe0a0 : Math.random() < 0.5 ? 0xff7a1a : 0xff3a00, rnd(0.02, 0.06), rnd(0.5, maxi ? 2.6 : 1.7), { drag: 1.0, grav: 4 });
            }
            // smoke: a rising column and a ring of dust running along the ground
            for (let i = 0; i < (maxi ? 110 : 55); i++) Sm.spawn(_w.copy(p).add(_v.set(rnd(-0.5, 0.5), rnd(0, 0.8), rnd(-0.5, 0.5)).multiplyScalar(R * 0.4)), _v.set(rnd(-0.6, 0.6), rnd(0.8, 2.2), rnd(-0.6, 0.6)), Math.random() < 0.5 ? 0x2a241f : 0x4a4038, rnd(0.7, 1.2) * Math.sqrt(pw), rnd(4, maxi ? 10 : 7), { grow: 1.0, alpha: 0.75, delay: rnd(0.15, 0.5) });
            for (let i = 0; i < (maxi ? 40 : 20); i++) { const a = i / (maxi ? 40 : 20) * Math.PI * 2; Sm.spawn(_w.copy(p).add(_v.set(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5)), _v.set(Math.cos(a) * rnd(5, 9), rnd(0.2, 0.6), Math.sin(a) * rnd(5, 9)).multiplyScalar(Math.sqrt(pw) * 0.7), 0x7a6a55, rnd(0.35, 0.6), rnd(1.6, 2.6), { grow: 1.2, alpha: 0.5, drag: 2.2 }); }
            // the ground: a dent, char that glows and cools, burnt grass, clods
            const g = this.api.groundH(p.x, p.z), onGround = p.y - g < R * 0.7;
            if (onGround) {
                // (the author 23.11: «слабый в плане разрушения… при взаимодействии с землёй»): a real crater — bare earth thrown out, a rim of it
                const Rc = (maxi ? BLAST.CRATER_MAX : BLAST.CRATER) * soft, depth = (maxi ? BLAST.DEPTH_MAX : BLAST.DEPTH) * soft;
                const k = clamp(1 - (p.y - g) / (R * 0.7), 0.3, 1); // (an orb going off above the ground digs less)
                this.api.dent(p.x, p.z, Rc * k, depth * k, p.y);
                this._scorch(p.x, p.z, R, pw, Rc * k);
                this.clods.burst(p, maxi ? 160 : 80, Rc);
                this._earthFountain(p, Rc * k, maxi);
            }
            this._needlesAround(p, R * 2);
            // the trees near it: broken at the ground and thrown down away from the blast (nearer — surely, further — some; never the whole forest)
            let felled = 0; const reachT = R * 1.35, maxT = maxi ? 9 : 4;
            const near = this.api.trees().filter((t) => !t.fell).map((t) => ({ t, d: Math.hypot(t.x - p.x, t.z - p.z) })).filter((o) => o.d < reachT).sort((a, b) => a.d - b.d);
            for (const { t, d } of near) {
                if (felled >= maxT) break;
                const k = 1 - d / reachT, h = ((t.i * 2654435761) >>> 0) / 4294967296; // (the same trees fall on every computer)
                if (d < R * 0.6 || h < k * 1.4) { if (this.api.fell(t.i, p.x, p.z, k * soft)) felled++; }
            }
            this.flash(p, 0xff9a40, (maxi ? 16 : 8) * soft, maxi ? 0.45 : 0.3); this._ember = onGround ? (maxi ? 8 : 4) : 0;
            this.sound(maxi ? 'boomMax' : 'boom', p, 1.6 * soft);
        }
        // who it reaches (each on his own computer; the pigs on the host's)
        const P = this.api.player();
        const dMe = _v.set(P.pos.x, P.pos.y + 0.9, P.pos.z).distanceTo(p);
        this.shake = Math.max(this.shake, clamp((maxi ? 2.4 : 1.5) * (1 - dMe / (R * 14)), 0, 2.4));
        const reach = R + 1.6;
        const village = this.api.village?.();
        if (village) {
            const alarm = water ? new Set() : village.blast(p, 2.4 * pw * soft, R);
            for (const npc of village.people) {
                const d = npc.pos.clone().add(new V3(0, 0.9, 0)).distanceTo(p);
                if (d < reach || alarm.has(npc.home.id)) {
                    const force = Math.max(0, 1 - d / reach);
                    const dir = npc.pos.clone().sub(p).setY(0).normalize();
                    village.hit(npc, BLAST.PEAK * pw * force * soft, dir, b.by, {
                        push: (9 + 9 * pw) * force * soft, up: (5 + 2 * pw) * force * soft,
                    });
                }
            }
        }
        if (dMe < reach && !this.me.dead) {
            const k = 1 - dMe / reach, shielded = this.shields.some((s) => s.by === this._myId() && (s.sphere || _w.copy(p).sub(s.pos).dot(s.dir) > 0));
            const dir = _w.set(P.pos.x - p.x, 0, P.pos.z - p.z).normalize();
            this.hurtMe(b.name, dir, b.by, { hp: BLAST.PEAK * pw * k * soft * (shielded ? 0.25 : 1), push: (9 + 9 * pw) * k * soft * (shielded ? 0.3 : 1), up: (5 + 2 * pw) * k * soft });
        }
        this.api.pigs.forEach((pg, i) => { const d = pg.pos.distanceTo(p); if (d < reach * 1.3) this._pigHit(i, b.name, _w.copy(pg.pos).sub(p).normalize().clone(), 1 - d / (reach * 1.3)); });
    }

    waterBurst(p, radius, strength = 1) {
        const surface = new V3(p.x, 0.045, p.z);
        const ring = this.foam.find((m) => !m.visible) || this.foam[0];
        ring.visible = true; ring.position.copy(surface); ring.scale.setScalar(0.3);
        ring.userData = { age: 0, life: 0.8 + radius * 0.22, radius: radius * 1.25 };
        const jets = Math.ceil(radius * 20);
        for (let i = 0; i < jets; i++) {
            const a = Math.random() * Math.PI * 2, spread = rnd(0.5, radius * 1.3);
            const base = _w.copy(surface).add(_u.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rnd(0, radius * 0.16)));
            _v.set(Math.cos(a) * spread, rnd(0.7, 2.4) * radius * strength, Math.sin(a) * spread);
            this.smoke.spawn(base, _v, i % 3 ? 0xa2ced9 : 0xe7f3f2, rnd(0.05, 0.20) * Math.sqrt(radius),
                rnd(0.36, 0.74) + radius * 0.07, { grav: 12, drag: 0.8, grow: 0.15, alpha: 0.78 });
        }
        this._ember = 0;
        this.sound('splash', surface, Math.min(1.3, radius * 0.27));
    }

    _fireStep(f, dt) {
        const u = f.userData; u.t += dt;
        const k = u.t / u.life;
        if (k >= 1) { f.visible = false; return; }
        const s = u.R * (0.25 + 0.75 * (1 - Math.exp(-u.t * 9))) * (1 + k * 0.6);
        f.scale.setScalar(s); f.position.y = u.y + u.t * 1.2;
        f.material.uniforms.uK.value = k; f.material.uniforms.uTime.value += dt;
    }

    /** The scorch on the ground (drawn by the ground's and the grass's own shaders from uBlast): char, embers, burnt grass, the wave. */
    _scorch(x, z, R, pw, crater = 0) {
        const U = this.api.U, i = this._blastI++ % MAX_BLASTS;
        U.uBlast.value[i].set(x, z, R, U.uTime.value);
        U.uBlastP.value[i].set(pw, 0, 1e6, crater); // (a crater stays: the earth does not grow back by itself — w: its radius)
    }

    /** The earth thrown up: a fountain of soil and stones that rains back, turf torn out, a brown cloud rolling out low along the ground. */
    _earthFountain(p, Rc, maxi) {
        const Sm = this.smoke, n = maxi ? 520 : 260;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * Rc * 0.6, up = rnd(5, maxi ? 17 : 12) * (1 - r / Rc * 0.6), out = rnd(1, maxi ? 9 : 6);
            _w.set(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
            Sm.spawn(_w, _v.set(Math.cos(a) * out, up, Math.sin(a) * out), Math.random() < 0.2 ? 0x4a3a28 : Math.random() < 0.5 ? 0x2a1d12 : 0x1c140d, rnd(0.04, 0.12), rnd(1.4, maxi ? 3.2 : 2.4), { drag: 0.25, grav: 9.8, alpha: 1, grow: 0 });
        }
        // the brown cloud: low, wide, slow — dust of earth, not the black smoke of the fire
        for (let i = 0; i < (maxi ? 70 : 36); i++) { const a = Math.random() * Math.PI * 2, r = Rc * rnd(0.2, 1.1);
            Sm.spawn(_w.set(p.x + Math.cos(a) * r, p.y + rnd(0.2, 1.2), p.z + Math.sin(a) * r), _v.set(Math.cos(a) * rnd(1, 4), rnd(0.3, 1.6), Math.sin(a) * rnd(1, 4)), Math.random() < 0.5 ? 0x6e5a44 : 0x857058, rnd(0.8, 1.6) * (maxi ? 1.5 : 1), rnd(5, maxi ? 12 : 8), { drag: 0.7, grav: -0.05, alpha: 0.55, grow: 0.5, delay: rnd(0.05, 0.6) }); }
    }

    _rime(p, r) {
        const U = this.api.U, i = this._blastI++ % MAX_BLASTS;
        U.uBlast.value[i].set(p.x, p.z, r, U.uTime.value);
        U.uBlastP.value[i].set(0, 1, 40, 0); // (y = 1: frost, not fire)
    }

    /** A trunk broke at the ground: splinters of pale wood fly, the wood cracks. */
    treeBroke(p, r, dir) {
        for (let i = 0; i < 70; i++) this.smoke.spawn(_w.copy(p).add(_v.set(rnd(-r, r), rnd(-0.2, 0.4), rnd(-r, r))), _v.set(dir.x * rnd(1, 5) + rnd(-2, 2), rnd(1, 5), dir.z * rnd(1, 5) + rnd(-2, 2)), Math.random() < 0.6 ? 0xb99a6e : 0x6b4f33, rnd(0.02, 0.06), rnd(1, 2), { drag: 0.4, grav: 9.8, alpha: 1 });
        this.sound('crack', p, 1.2);
    }
    /** A felled tree struck the ground: a long line of dust and needles along it, the thud through the feet. */
    treeLanded(base, dir, H, first) {
        const n = first ? 40 : 12;
        for (let i = 0; i < n; i++) { const t = rnd(0.2, 1) * H * 0.9;
            this.smoke.spawn(_w.set(base.x + dir.x * t + rnd(-1, 1), base.y + rnd(0, 0.8), base.z + dir.z * t + rnd(-1, 1)), _v.set(rnd(-1.5, 1.5), rnd(0.3, 1.2), rnd(-1.5, 1.5)), Math.random() < 0.5 ? 0x7a6a55 : 0x5e5040, rnd(0.6, 1.3), rnd(3, 6), { drag: 0.8, grav: -0.05, alpha: 0.45, grow: 0.5 }); }
        if (first) { this._needles(_w.set(base.x + dir.x * H * 0.7, base.y + 1, base.z + dir.z * H * 0.7), 60);
            const P = this.api.player(), d = Math.hypot(P.pos.x - base.x - dir.x * H * 0.5, P.pos.z - base.z - dir.z * H * 0.5); this.shake = Math.max(this.shake, clamp(1.2 - d / 25, 0, 1.2)); }
        this.sound('thud', _w.set(base.x + dir.x * H * 0.5, base.y, base.z + dir.z * H * 0.5), first ? 1.4 : 0.5);
    }

    _needles(p, n) {
        for (let i = 0; i < n; i++) this.glow.spawn(_w.copy(p).add(_v.set(rnd(-1, 1), rnd(0, 2), rnd(-1, 1))), _v.set(rnd(-0.3, 0.3), rnd(-0.4, 0), rnd(-0.3, 0.3)), 0x2f3a16, 0.012, rnd(2, 4), { drag: 1.5, grav: 0.8, solid: true });
    }
    _needlesAround(p, r) {
        for (const tr of this.api.trees()) {
            const d = Math.hypot(tr.x - p.x, tr.z - p.z); if (d > r) continue;
            for (let i = 0; i < 25 * (1 - d / r); i++) this.glow.spawn(_w.set(tr.x + rnd(-1.5, 1.5), tr.y + tr.h * rnd(0.4, 0.9), tr.z + rnd(-1.5, 1.5)), _v.set(rnd(-0.4, 0.4), rnd(-0.3, 0.1), rnd(-0.4, 0.4)), Math.random() < 0.5 ? 0x2f3a16 : 0x4b4a1c, 0.012, rnd(3, 6), { drag: 1.2, grav: 0.6, solid: true });
        }
    }

    // ----------------------------------------------------------------------------------------------- me: health, falls, ice, the wand
    /** A spell reached me (on my computer: I decide for myself). */
    hurtMe(name, dir, by, o = null) {
        const me = this.me, S = SPELLS[name], P = this.api.player();
        if (me.dead) return;
        const sphere = this.shields.find((s) => s.by === this._myId() && s.sphere);
        if (sphere && !S.pierce && !o) return; // (inside my own sphere: only Avada passes)
        let hp = o ? o.hp : S.hp || 0, push = o ? o.push : S.push || 0, up = o ? o.up : 0;
        if (S.stun) { me.stun = Math.max(me.stun, S.stun); this.api.hud('💫 Вас оглушили'); }
        if (S.freeze) { me.frozen = S.freeze; me.burn = S.burn; this.api.hud('❄️ Вы во льду'); this.sound('freeze', P.pos, 0.8); }
        if (S.lift) { P.grounded=false;P.vy=Math.max(P.vy,S.lift);me.stun=Math.max(me.stun,.55); }
        if (S.disarm && !me.wandOut && this.api.wandHeld?.() !== false) this._loseWand(dir);
        if (S.strip)this.api.stripMe?.();
        if (name.startsWith('Jolt')||S.strip) { up = 2.5 + push * 0.15; me.stun = Math.max(me.stun, 0.6); }
        if (push > 0) { P.vel.x += dir.x * push; P.vel.z += dir.z * push; P.vy = Math.max(P.vy, up); P.grounded = false; }
        if (hp > 0) this._damage(hp, by);
        if (me.dead || S.stun || push >= 4.5) {
            if (!me.dead) me.stun = Math.max(me.stun, push >= 4.5 ? 2.4 : S.stun || 0);
            this._fall(P, dir, push || (me.dead ? 2.1 : 1.4));
        }
    }

    _fall(P, direction, energy) {
        if (direction.lengthSq() < .001) direction = new V3(-Math.sin(P.faceYaw), 0, -Math.cos(P.faceYaw));
        const rig = this.api.rig();
        if (!rig?.limp && P.vel.lengthSq() < .5) P.vel.addScaledVector(direction, energy * .45);
        this.api.fall?.(P, direction, energy);
    }

    _damage(hp, by) {
        const me = this.me;
        if (this.noHarm) return; // (Creative: no health, as in the game's Creative — the spells still throw, stun and freeze)
        me.hp = Math.max(0, me.hp - hp);
        this.api.pain(Math.min(1, hp / 20));
        if (me.hp <= 0 && !me.dead) {
            me.dead = HERO.RESPAWN; me.stun = 0; me.frozen = 0;
            const who = by && by !== this._myId() ? this.api.nameOf(by) : null;
            this.api.hud(who ? `☠️ Вас победил ${who} — встанете на поляне` : '☠️ Вы погибли — встанете на поляне');
            this.mana=this.maxMana=MANA.BASE;this.successes.clear();
            this.api.net()?.send({ t: 'died', by }, true);
        }
    }

    _loseWand(dir) {
        const rig = this.api.rig(), hand = this.api.wandHand?.() || 'R', wand = rig?.fingers?.[hand]?.wand; if (!wand) return;
        const P = this.api.player();
        wand.updateWorldMatrix(true, false);
        const w = { obj: wand, parent: wand.parent, p: new V3().setFromMatrixPosition(wand.matrixWorld), q: new THREE.Quaternion().setFromRotationMatrix(wand.matrixWorld),
            v: new V3(dir.x * 3.5 + rnd(-1, 1), 4.5, dir.z * 3.5 + rnd(-1, 1)), w: new V3(rnd(-12, 12), rnd(-6, 6), rnd(-12, 12)), rest: false, local: { p: wand.position.clone(), q: wand.quaternion.clone(), s: wand.scale.clone() } };
        w.ws = new V3(); wand.getWorldScale(w.ws);
        this.api.scene.add(wand); wand.position.copy(w.p); wand.quaternion.copy(w.q); wand.scale.copy(w.ws);
        this.me.wandOut = w;
        rig.fingers[hand].gripSaved = rig.fingers[hand].grip; rig.fingers[hand].grip = null; // (the empty hand opens)
        this.api.hud('🪄 Палочку выбили из руки — подойдите к ней');
        void P;
    }

    _wandStep(dt) {
        const w = this.me.wandOut; if (!w) return;
        const o = w.obj, g = this.api.groundH(w.p.x, w.p.z);
        if (!w.rest) {
            w.v.y -= 9.8 * dt; w.p.addScaledVector(w.v, dt);
            _u.copy(w.w).multiplyScalar(dt); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(_u.x, _u.y, _u.z)); w.q.premultiply(q);
            if (w.p.y < g + 0.02) { w.p.y = g + 0.02; if (Math.abs(w.v.y) < 1.2) { w.rest = true; // (lying on the grass: along the ground)
                    const yaw = Math.atan2(w.v.x, w.v.z); w.q.setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ')); }
                else { w.v.y *= -0.3; w.v.x *= 0.5; w.v.z *= 0.5; w.w.multiplyScalar(0.5); } }
            o.position.copy(w.p); o.quaternion.copy(w.q);
        }
        // walked up to it: the hand takes it back
        const P = this.api.player();
        if (!this.me.dead && Math.hypot(P.pos.x - w.p.x, P.pos.z - w.p.z) < 0.8 && w.rest) this._takeWand();
    }

    _takeWand() {
        const w = this.me.wandOut; if (!w) return;
        w.parent.add(w.obj); w.obj.position.copy(w.local.p); w.obj.quaternion.copy(w.local.q); w.obj.scale.copy(w.local.s);
        const F = this.api.rig().fingers[this.api.wandHand?.() || 'R']; F.grip = F.gripSaved; this.me.wandOut = null;
        this.api.hud('🪄 Палочка снова в руке');
    }

    _me(dt) {
        if (this._raiseT > 0 && (this._raiseT -= dt) <= 0) { const rig = this.api.rig(); if (rig?.arms === this._raise) rig.arms = null; }
        const me = this.me, P = this.api.player(), root = this.api.charRoot();
        this._wandStep(dt);
        if (me.frozen > 0) {
            me.frozen -= dt; this._damage(me.burn * dt, null);
            this.iceMine.visible = !me.dead; this.iceMine.position.copy(P.pos); this.iceMine.rotation.y = P.faceYaw;
            if (me.frozen <= 0 || me.dead) { this.iceMine.visible = false; me.frozen = 0; this._shatter(P.pos); }
        }
        if (me.stun > 0) me.stun -= dt;
        const rig = this.api.rig();
        if (me.dead && !rig?.limp) this._fall(P, new V3(), 1.4);
        if (!me.dead && me.stun <= 0) this.api.recover?.(P);
        me.fall = rig?.limp ? 1 : 0;
        root.rotation.x = 0;
        this.api.setLocked(me.dead > 0 || me.stun > 0 || me.frozen > 0 || !!rig?.limp);
        if (me.dead) {
            me.dead -= dt;
            if (me.dead <= 0) { // up again at the meadow
                me.dead = 0; me.hp = HERO.HP; me.fall = 0; me.stun = 0; me.frozen = 0;
                if (me.wandOut) this._takeWand();
                this.api.stand?.();
                this.api.respawn();
                this.api.hud('✨ Вы снова на поляне');
            }
        }
    }

    _shatter(p) {
        for (let i = 0; i < 60; i++) this.glow.spawn(_w.copy(p).add(_v.set(rnd(-0.4, 0.4), rnd(0, 1.8), rnd(-0.4, 0.4))), _v.set(rnd(-2, 2), rnd(0, 3), rnd(-2, 2)), 0xdff4ff, rnd(0.02, 0.05), rnd(0.4, 0.9), { drag: 1, grav: 6 });
        this.sound('shatter', p, 0.7);
    }

    /** A friend frozen (his own computer said so): the ice round his wizard here. */
    friendIce(R, on) {
        if (on && !R.ice) { R.ice = new THREE.Mesh(this.iceGeo, this.iceMat); this.api.scene.add(R.ice); }
        if (R.ice) { R.ice.visible = on; if (on) { R.ice.position.copy(R.P.pos); R.ice.rotation.y = R.P.faceYaw; } }
    }

    /** What my state is for the others (in my pose): fallen, frozen, the wand out, dead. */
    stateBits() { const m = this.me; return (m.fall > 0.5 ? 1 : 0) | (m.frozen > 0 ? 2 : 0) | (m.wandOut ? 4 : 0) | (m.dead ? 8 : 0) | (this.api.wandHeld?.() === false && !m.wandOut ? 16 : 0) | (this.api.wandHand?.() === 'L' ? 32 : 0); }

    // ----------------------------------------------------------------------------------------------- the pigs (the host decides)
    _pigHit(i, name, dir, k) {
        const net = this.api.net();
        if (net?.isClient) return;
        this.pigHit(i, name, dir, k);
    }

    /** On the host (or alone): what a spell does to a pig. */
    pigHit(i, name, dir, k) {
        const pg = this.api.pigs[i]; if (!pg || pg.dead) return;
        const S = SPELLS[name]; if (!S) return;
        pg.hp = pg.hp ?? PIG_HP;
        const throwIt = (sp, up) => { pg.ko = Math.max(pg.ko || 0, 0.01); pg.vel.set(dir.x * sp, up, dir.z * sp); pg.state = 'ko'; };
        if (S.kind === 'orb') { pg.hp -= BLAST.PEAK * S.power * k * 1.5; throwIt(10 * S.power * k + 3, 5 + 6 * k); pg.ko = 3; }
        else if (name === 'AvadaKedavra') { pg.hp = 0; }
        else if (S.stun) { throwIt(1, 0); pg.ko = 8; pg.hp -= S.hp; }
        else if (S.push) { throwIt(S.push * 0.9, 3 + S.push * 0.2); pg.ko = 2; pg.hp -= S.hp; }
        else if (S.freeze) { pg.frozen = S.freeze; pg.ko = S.freeze; throwIt(0, 0); pg.hp -= S.burn * S.freeze * 0.5; }
        else if (S.disarm) { throwIt(2, 1); pg.ko = 0.8; } // (a pig has no wand: only the shove)
        this.api.oink(pg);
        if (pg.hp <= 0) { pg.dead = true; pg.ko = 1e9; pg.state = 'ko'; pg.deadAt = performance.now(); }
    }

    // ----------------------------------------------------------------------------------------------- sound
    /** All the sounds made once, when the sound starts (never in the middle of a fight). */
    makeSounds(C) {
        if (this.snd || !C) return;
        const sr = C.sampleRate, mk = (sec, f) => { const n = Math.floor(sec * sr), b = C.createBuffer(1, n, sr), d = b.getChannelData(0); f(d, n, sr); let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) for (let i = 0; i < n; i++) d[i] /= m; return b; };
        const noise = () => Math.random() * 2 - 1;
        const lp = (d, a) => { let y = 0; for (let i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } };
        const boom = (sec, sub, bright) => mk(sec, (d, n) => {
            let y = 0, y2 = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr, env = Math.exp(-t * (2.2 / sec * 2)) * (1 - Math.exp(-t * 400));
                const cut = 0.02 + bright * Math.exp(-t * 5);
                y += (noise() - y) * cut; y2 += (y - y2) * cut;
                const s = Math.sin(2 * Math.PI * (sub * (1 + 1.5 * Math.exp(-t * 8))) * t) * Math.exp(-t * 3.2);
                const crack = t < 0.012 ? noise() * (1 - t / 0.012) : 0;
                const debris = t > 0.25 && Math.random() < 0.0009 * Math.exp(-(t - 0.25) * 1.4) ? 1 : 0;
                d[i] = y2 * env * 3.5 + s * 0.9 + crack * 0.8 + (debris ? noise() * 0.4 : 0) + (i > 40 ? d[i - 40] * 0 : 0);
            }
            for (let i = n - 1; i >= 0; i--) { const j = i - Math.floor(0.33 * sr), k = i - Math.floor(0.81 * sr); if (j > 0) d[i] += d[j] * 0.22; if (k > 0) d[i] += d[k] * 0.12; } // (the forest answers)
        });
        const whoosh = (sec, f0, f1, tone) => mk(sec, (d, n) => {
            let y = 0, ph = 0;
            for (let i = 0; i < n; i++) { const t = i / sr, k = t / sec, env = Math.sin(Math.PI * Math.min(1, k * 1.6)) ** 1.5 * (1 - k);
                const a = clamp((f0 + (f1 - f0) * k) / sr * 6, 0.01, 0.9); y += (noise() - y) * a;
                ph += 2 * Math.PI * (tone * (1 + 0.6 * k)) / sr; d[i] = (y * 1.4 + (tone ? Math.sin(ph) * 0.35 + Math.sin(ph * 2.01) * 0.12 : 0)) * env; }
        });
        this.snd = {
            gust: whoosh(.72,210,610,0),
            creak: whoosh(.48,115,330,98),
            splash: mk(1.65, (samples, n) => {
                let low = 0;
                for (let i = 0; i < n; i++) {
                    const t = i / sr;
                    low += (noise() - low) * 0.08;
                    const bubbles = Math.sin(2 * Math.PI * (76 + 180 * Math.exp(-t * 5)) * t);
                    samples[i] = (low * 2 + noise() * 0.21) * (1 - Math.exp(-t * 70)) * Math.exp(-t * 3.4)
                        + bubbles * (0.4 + 0.6 * Math.sin(t * 53) ** 2) * Math.exp(-t * 11) * 0.18;
                }
            }),
            boom: boom(3.2, 46, 0.6), boomMax: boom(5, 34, 0.75),
            cast: whoosh(0.7, 300, 2400, 0), castMax: whoosh(1.1, 120, 1800, 70),
            bolt: whoosh(0.45, 900, 4200, 880), jolt: mk(0.4, (d, n) => { let y = 0; for (let i = 0; i < n; i++) { const t = i / sr; y += (noise() - y) * 0.08; d[i] = (y * 2 + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 18)) * Math.exp(-t * 9); } }),
            avada: mk(1.0, (d, n) => { let y = 0; for (let i = 0; i < n; i++) { const t = i / sr, env = Math.min(1, t * 8) * Math.exp(-t * 2.4); y += (noise() - y) * 0.05;
                d[i] = (y * 1.5 + (Math.sin(2 * Math.PI * 110 * t) + Math.sin(2 * Math.PI * 116.5 * t) + Math.sin(2 * Math.PI * 164.8 * t)) * 0.25 * Math.sin(2 * Math.PI * 6 * t) ** 2) * env; } }),
            ice: mk(0.8, (d, n) => { let y = 0; for (let i = 0; i < n; i++) { const t = i / sr, env = Math.exp(-t * 4); y += (noise() - y) * 0.5;
                d[i] = (y * 0.3 * Math.exp(-t * 9) + [2093, 2637, 3136, 4186].reduce((s, f, j) => s + Math.sin(2 * Math.PI * f * t + j) * Math.exp(-t * (3 + j)), 0) * 0.18) * env; } }),
            hit: mk(0.35, (d, n) => { let y = 0; for (let i = 0; i < n; i++) { const t = i / sr; y += (noise() - y) * 0.3; d[i] = (y * 1.2 + Math.sin(2 * Math.PI * (300 - t * 500) * t)) * Math.exp(-t * 14); } }),
            block: mk(0.6, (d, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 660 * t) * 0.6 + Math.sin(2 * Math.PI * 990 * t) * 0.3 + noise() * 0.3 * Math.exp(-t * 30)) * Math.exp(-t * 6); } }),
            shield: whoosh(0.9, 400, 1400, 330),
            freeze: mk(1.2, (d, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.random() < 0.02 * Math.exp(-t * 2) ? noise() : 0) * 1 + noise() * 0.08 * Math.exp(-t * 3); } lp(d, 0.6); }),
            crack: mk(1.1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.random() < 0.06 * Math.exp(-t * 3) ? noise() : 0) * (t < 0.05 ? 1.5 : 0.7) + Math.sin(2 * Math.PI * (180 + 40 * Math.sin(t * 30)) * t) * 0.25 * Math.exp(-t * 4) * (t > 0.08 ? 1 : 0); } }),
            thud: mk(1.6, (d, n) => { let y = 0; for (let i = 0; i < n; i++) { const t = i / sr; y += (noise() - y) * 0.03; d[i] = (y * 3 + Math.sin(2 * Math.PI * (55 - 20 * t) * t) * 1.2) * Math.exp(-t * 3.5) + (Math.random() < 0.01 * Math.exp(-t * 2) ? noise() * 0.4 : 0); } }),
            shatter: mk(0.9, (d, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.random() < 0.05 * Math.exp(-t * 4) ? noise() : 0) + Math.sin(2 * Math.PI * 3520 * t) * 0.1 * Math.exp(-t * 7); } }),
        };
    }

    sound(kind, p, vol = 1) {
        const C = this.api.audio(); if (!C) return;
        this.makeSounds(C);
        const buf = this.snd?.[kind]; if (!buf) return;
        const cam = this.api.camera, d = cam.position.distanceTo(p);
        const g = C.createGain(), pan = C.createStereoPanner ? C.createStereoPanner() : null;
        g.gain.value = Math.min(1, vol * 2.4 / (1 + d * 0.12));
        const rel = p.clone().sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());
        const src = C.createBufferSource(); src.buffer = buf;
        const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000 / (1 + d * 0.04);
        src.connect(f).connect(g);
        if (pan) { pan.pan.value = clamp(rel.x / Math.max(1, Math.abs(rel.z) + Math.abs(rel.x)), -1, 1); g.connect(pan).connect(C.destination); } else g.connect(C.destination);
        src.start(C.currentTime + (kind.startsWith('boom') ? d / 343 : 0));
    }
}

/** The spells' short journal (for checks): the last 40 lines only. */
function spellLog(line) { const L = window.__spellLog || (window.__spellLog = []); L.push(line); if (L.length > 40) L.shift(); }
function r3(v) { return Math.round(v * 1000) / 1000; }
function r4(v) { return Math.round(v * 10000) / 10000; }

/** The share t ∈ [0, 1] of the way a → b where it first comes within r of c (null: never). */
function segSphere(a, b, c, r) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
    const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), Cc = fx * fx + fy * fy + fz * fz - r * r;
    if (Cc <= 0) return 0;
    if (A < 1e-12) return null;
    const D = B * B - 4 * A * Cc; if (D < 0) return null;
    const t = (-B - Math.sqrt(D)) / (2 * A);
    return t >= 0 && t <= 1 ? t : null;
}
/** … of an upright capsule standing on `base`, radius r, height h. */
function segCapsule(a, b, base, r, h) {
    let best = null;
    for (let k = 0; k <= 4; k++) { const t = segSphere(a, b, _u.set(base.x, base.y + r + (h - 2 * r) * k / 4, base.z), r); if (t !== null && (best === null || t < best)) best = t; }
    return best;
}
/** … of an upright cylinder (a trunk). */
function segCylinder(a, b, x, z, r, y0, y1) {
    const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - x, fz = a.z - z;
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), Cc = fx * fx + fz * fz - r * r;
    let t;
    if (Cc <= 0) t = 0;
    else { if (A < 1e-12) return null; const D = B * B - 4 * A * Cc; if (D < 0) return null; t = (-B - Math.sqrt(D)) / (2 * A); if (t < 0 || t > 1) return null; }
    const y = a.y + (b.y - a.y) * t;
    return y >= y0 && y <= y1 ? t : null;
}

// ======================================================================================================= the looks
/** A soft round glow (the halo of a charge). */
function haloTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const NOISE_GLSL = `
float h3(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),u.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),u.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),u.x),u.y),u.z);}
float fb3(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n3(p);p=p*2.07+vec3(3.1,1.7,5.3);a*=.5;}return s;}`;

/** The fireball of a blast: a boiling ball — white-hot inside, orange, deep red, then dark smoke as it cools and rises. */
function fireballMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } },
        transparent: true, depthWrite: false, toneMapped: false,
        vertexShader: NOISE_GLSL + `uniform float uK,uTime,uSeed;varying vec3 vN,vP;varying float vH;
          void main(){vec3 p=position;float h=fb3(p*2.2+vec3(0.,-uTime*2.5,uSeed));vH=h;p*=0.78+0.5*h;vN=normalize(normalMatrix*normal);
            vec4 mv=modelViewMatrix*vec4(p,1.);vP=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
        fragmentShader: NOISE_GLSL + `uniform float uK,uTime,uSeed;varying vec3 vN,vP;varying float vH;
          void main(){float fr=abs(dot(normalize(vN),normalize(vP)));float heat=clamp((1.-uK*1.25)*(0.55+0.7*vH)+fr*0.35-0.1,0.,1.);
            vec3 c=mix(vec3(0.05,0.04,0.035),vec3(0.6,0.07,0.01),smoothstep(0.08,0.3,heat));c=mix(c,vec3(2.6,0.85,0.15),smoothstep(0.3,0.6,heat));c=mix(c,vec3(4.,3.1,1.8),smoothstep(0.65,0.95,heat));
            float a=smoothstep(0.,0.35,fr)*(1.-smoothstep(0.55,1.,uK))*(0.75+0.25*vH);gl_FragColor=vec4(c,a);}`,
    });
}

/** A block of ice round a frozen wizard: clear at the edges, milky inside, cracks and trapped bubbles. */
function iceMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {}, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `varying vec3 vN,vP,vO;void main(){vO=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vP=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
        fragmentShader: NOISE_GLSL + `varying vec3 vN,vP,vO;void main(){float fr=1.-abs(dot(normalize(vN),normalize(vP)));
            float crack=smoothstep(0.03,0.0,abs(n3(vO*9.)-0.5))*0.8;float bub=smoothstep(0.86,0.9,n3(vO*40.));
            vec3 c=mix(vec3(0.55,0.78,0.95),vec3(0.92,0.98,1.),fr)+crack*0.5+bub*0.4;float a=0.22+fr*0.5+crack*0.4+bub*0.3;gl_FragColor=vec4(c*1.1,a);}`,
    });
}
function iceGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.85 + 0.3 * Math.abs(Math.sin(x * 7 + y * 3 + z * 5)); p.setXYZ(i, x * 0.55 * k, (y * 0.5 + 0.5) * 2.0 * k, z * 0.55 * k); }
    g.computeVertexNormals(); return g;
}

/** Protection: a shimmering, faintly hexagonal skin of light that rings where it is struck. */
function shieldMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uT0: { value: 0 }, uHit: { value: new V3(0, -999, 0) }, uHitT: { value: -99 }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
        vertexShader: `varying vec3 vN,vP,vW;void main(){vN=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vP=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
        fragmentShader: NOISE_GLSL + `uniform float uA,uT0,uHitT,uTime;uniform vec3 uHit;varying vec3 vN,vP,vW;
          float hexd(vec2 p){p=abs(p);return max(p.x*0.866+p.y*0.5,p.y);}
          void main(){float fr=1.-abs(dot(normalize(vN),normalize(vP)));vec2 q=vW.xz*6.+vW.y*3.;vec2 g=vec2(q.x+q.y*0.577,q.y*1.155);vec2 c=floor(g)+0.5;
            float hx=smoothstep(0.42,0.5,hexd(fract(g)-0.5));float t=uTime;
            float hit=max(0.,1.-distance(vW,uHit)*1.5)*exp(-max(0.,(t-uHitT))*3.);
            float a=uA*(0.04+fr*0.35+hx*0.1+hit*1.2+0.05*n3(vW*8.));gl_FragColor=vec4(vec3(0.45,0.7,1.)*a,a);}`,
    });
}

/** A pool of glowing (additive) or smoky (soft) points: one draw each, nothing made while it runs. */
class Sparks {
    constructor(scene, n, add, groundH = null, sun = null) {
        this.n = n; this.i = 0; this.add = add; this.groundH = groundH;
        const g = new THREE.BufferGeometry();
        this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.sz = new Float32Array(n);
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
        this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.o = new Float32Array(n * 6); this.base = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
        const m = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 600 }, uSun: sun || { value: new V3(0, 1, 0) } }, transparent: true, depthWrite: false, toneMapped: !add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
            vertexShader: `attribute vec4 aCol;attribute float aSize;uniform float uScale;varying vec4 vC;varying float vS,vD;varying vec3 vTo;void main(){vC=aCol;vec4 mv=modelViewMatrix*vec4(position,1.);vTo=cameraPosition-position;vD=length(vTo);vS=fract(position.x*13.1+position.z*7.7);
              gl_PointSize=clamp(aSize*uScale/max(0.1,-mv.z),0.,256.);gl_Position=projectionMatrix*mv;}`,
            fragmentShader: add
                ? `varying vec4 vC;void main(){vec2 p=gl_PointCoord-0.5;float d=length(p)*2.;float a=smoothstep(1.,0.,d);a*=a;gl_FragColor=vec4(vC.rgb*a*vC.a*2.2,a*vC.a);}`
                : NOISE_GLSL + `uniform vec3 uSun;varying vec4 vC;varying float vS,vD;varying vec3 vTo;
                  void main(){
                    vec2 p=gl_PointCoord-0.5;
                    float n=n3(vec3(p*4.,vS*40.));
                    float a=1.-smoothstep(.18,.99,length(p)*2.+n*.42-.18);
                    if(a*vC.a<.008)discard;
                    float back=pow(max(dot(normalize(-vTo),normalize(uSun)),0.),4.);
                    float edge=(1.-a)*back;
                    vec3 lit=vC.rgb*(.67+.45*(.5-p.y)+.36*edge)+vec3(.15,.14,.12)*edge;
                    float haze=1.-exp(-vD*.007);
                    lit=mix(lit,vec3(.27,.32,.37),haze*.55);
                    gl_FragColor=vec4(lit,a*vC.a*(1.-haze*.45));
                  }`,
        });
        this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = add ? 6 : 5; scene.add(this.pts);
        this.dirty = false;
    }
    /** opt: drag, grav (m/s² down), grow (×/s), alpha, delay (s), solid (not glowing: needles, dust) */
    spawn(p, v, color, size, life, opt = {}) {
        const i = this.i = (this.i + 1) % this.n, c = new THREE.Color(color);
        this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
        this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
        const a = opt.alpha ?? 1;
        this.base[i * 4] = c.r; this.base[i * 4 + 1] = c.g; this.base[i * 4 + 2] = c.b; this.base[i * 4 + 3] = opt.solid && this.add ? -a : a;
        this.sz[i] = size; this.life[i] = -(opt.delay || 0); this.max[i] = life;
        this.o[i * 6] = opt.drag || 0; this.o[i * 6 + 1] = opt.grav || 0; this.o[i * 6 + 2] = opt.grow || 0; this.o[i * 6 + 3] = size; this.o[i * 6 + 4] = (opt.grav || 0) > 3 && this.groundH ? 1 : 0; // (heavy bits — earth, stones — stop on the ground)
        this.col[i * 4 + 3] = 0;
        this.dirty = true;
    }
    update(dt) {
        if (!this.dirty) return;
        let alive = 0;
        for (let i = 0; i < this.n; i++) {
            if (this.max[i] <= 0) continue;
            this.life[i] += dt;
            const L = this.life[i], M = this.max[i];
            if (L < 0) { this.col[i * 4 + 3] = 0; alive++; continue; }
            if (L >= M) { this.max[i] = 0; this.col[i * 4 + 3] = 0; this.pos[i * 3 + 1] = -9999; continue; }
            alive++;
            const k = Math.exp(-this.o[i * 6] * dt);
            this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.o[i * 6 + 1] * dt; this.vel[i * 3 + 2] *= k;
            this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
            if (this.o[i * 6 + 4] && this.vel[i * 3 + 1] < 0) { const g = this.groundH(this.pos[i * 3], this.pos[i * 3 + 2]); if (this.pos[i * 3 + 1] < g) { this.pos[i * 3 + 1] = g; this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0; this.o[i * 6 + 1] = 0; this.o[i * 6 + 4] = 0; this.life[i] = Math.max(L, M - 0.6); } }
            const f = L / M, a0 = this.base[i * 4 + 3];
            this.sz[i] = this.o[i * 6 + 3] * (1 + this.o[i * 6 + 2] * L);
            const fade = this.add ? (1 - f) * (1 - f) : Math.min(1, L * 3) * (1 - f);
            if (a0 < 0) { this.col[i * 4] = this.base[i * 4] * 0.15; this.col[i * 4 + 1] = this.base[i * 4 + 1] * 0.15; this.col[i * 4 + 2] = this.base[i * 4 + 2] * 0.15; this.col[i * 4 + 3] = -a0 * fade; }
            else { const hot = this.add ? 1 - f * 0.6 : 1; this.col[i * 4] = this.base[i * 4] * hot; this.col[i * 4 + 1] = this.base[i * 4 + 1] * hot * (this.add ? 1 - f * 0.4 : 1); this.col[i * 4 + 2] = this.base[i * 4 + 2] * hot * (this.add ? 1 - f * 0.7 : 1); this.col[i * 4 + 3] = a0 * fade; }
        }
        const g = this.pts.geometry;
        g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
        if (!alive) this.dirty = false;
    }
}

/** Clods of earth and turf thrown by a blast: they fly, bounce once or twice and lie where they fell (a minute), then sink into the grass. */
class Clods {
    constructor(scene, groundH) {
        this.groundH = groundH; this.n = 400; this.i = 0;
        const geo = new THREE.DodecahedronGeometry(1, 0), p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.8 + 0.35 * Math.abs(Math.sin(x * 5.1 + y * 3.3 + z * 4.7)); p.setXYZ(i, x * k, y * k * 0.7, z * k); }
        geo.computeVertexNormals();
        this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), this.n);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
        const c = new THREE.Color();
        for (let i = 0; i < this.n; i++) { c.setHSL(0.07 + Math.random() * 0.03, 0.35, 0.08 + Math.random() * 0.06); if (i % 4 === 0) c.setRGB(0.05, 0.08, 0.02); this.mesh.setColorAt(i, c); }
        this.s = Array.from({ length: this.n }, () => ({ p: new V3(0, -999, 0), v: new V3(), q: new THREE.Quaternion(), w: new V3(), size: 0, rest: 0, live: 0 }));
        this._m = new THREE.Matrix4(); this._sc = new V3();
        for (let i = 0; i < this.n; i++) this._put(i);
        scene.add(this.mesh); this.active = 0;
    }
    _put(i) { const s = this.s[i]; this.mesh.setMatrixAt(i, this._m.compose(s.p, s.q, this._sc.setScalar(s.size))); }
    burst(p, n, R) {
        for (let k = 0; k < n; k++) {
            const i = this.i = (this.i + 1) % this.n, s = this.s[i], a = Math.random() * Math.PI * 2, sp = rnd(2, 7) * Math.sqrt(R / 4);
            s.p.set(p.x + Math.cos(a) * rnd(0, R * 0.4), p.y + 0.1, p.z + Math.sin(a) * rnd(0, R * 0.4));
            s.v.set(Math.cos(a) * sp, rnd(4, 11) * Math.sqrt(R / 4), Math.sin(a) * sp); s.w.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
            s.size = rnd(0.04, 0.14) * (Math.random() < 0.15 ? 2.2 : 1); s.rest = 0; s.live = 150 + rnd(0, 40);
        }
        this.active = this.n;
    }
    update(dt) {
        if (!this.active) return;
        let moving = 0; const e = new THREE.Euler(), dq = new THREE.Quaternion();
        for (let i = 0; i < this.n; i++) {
            const s = this.s[i]; if (s.live <= 0) continue;
            s.live -= dt;
            if (s.live <= 0) { s.p.y = -999; this._put(i); continue; }
            if (s.live < 2) { s.p.y -= dt * s.size * 0.6; this._put(i); moving++; continue; } // (sinks into the grass)
            if (s.rest) continue;
            moving++;
            s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
            e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt); s.q.multiply(dq.setFromEuler(e));
            const g = this.groundH(s.p.x, s.p.z) + s.size * 0.5;
            if (s.p.y < g) { s.p.y = g; if (s.v.y < -1.5) { s.v.y *= -0.25; s.v.x *= 0.55; s.v.z *= 0.55; s.w.multiplyScalar(0.5); } else s.rest = 1; }
            this._put(i);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (!moving) this.active = 0;
    }
}
