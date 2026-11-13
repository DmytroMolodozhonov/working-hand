/** Shared numeric spell prices. Worker-safe: no renderer, scene, DOM or gameplay imports. */
/** Fatigue cost of each spell (stronger = more tiring). */
export const SPELL_COST = {
    Protection: 5,
    ProtectionMaxima: 20,
    ProtectionGods: 100, // the gods' shield: then 3 a second while it holds (ProtectionGods.js; the author: 100 + 3)
    ProtectionGodsMaxima: 300, // … its dome: then 5 a second (the author: 300 + 5)
    Bombardo: 20, // (the author 05.11: +5)
    BombardoMaxima: 35, // (the author 05.11: +10)
    Thunderwave: 150, // (the author 05.11: 150 now, was 200; 200 a cast — it hits everyone in the zone at once and only Protection Maxima / the gods hold it; 200 mana is easy to reach in 1–2 hours)
    Sapira: 20,
    Inferno: 10,
    Fire: 4, // a campfire
    Firefighting: 5, // a burst of water: puts fire out (Firefighting.js)
    FirefightingMaxima: 20, // … a hose held 5 s: it drowns even the Hellfire
    Unfurl: 6, // a ship's sails let down (all of them at once)
    Furl: 3, // rolled up
    Ice: 5, // «Айс» = «Frozen» (one spell): a charge — 10 s in ice, −3 HP/s (StrongSpells.js)
    IceMaxima: 20, // «Айс Максима» = «Frozen Maxima»: −10 HP/s, at the part of the body pointed at
    Sands: 8,
    Flight: 20, // (the author 05.11: twice as much a take-off)
    Up: 7, // get up / leap out of the water
    Waterball: 5,
    Maxima: 4,
    WaterForming: 5,
    Frozen: 5,
    Levitation: 6,
    LevitationMaxima: 50, // «Вингардиум Левиоса Максима»: 50 at once, then 2 a second while it holds (LevitationMaxima.js)
    Accio: 5,
    Alohomora: 5, // a lock opens (Alohomora.js)
    Lock: 3, // an open door shuts and locks (Alohomora.js: Lock)
    AlohomoraMaxima: 25, // … a strong lock: the gates of a throne room
    Wind: 8,
    Brainrot: 15,
    Imperius: 100, // «Империус»: the mind into an ordinary creature (the author: 100; the maximum ≥ 150; then 1 a second — Imperius.js)
    ImperiusMaxima: 500, // «Империус Максима»: into any creature, a player too (the author: 500; the maximum ≥ 750; then 2 a second)
    BrainrotMaxima: 30, // «Brain Rot Maxima» (the dragons — DragonTame.js): once to cast, then 0,5 a second to hold it
    LightningStrike: 25,
    ToTheSun: 12,
    Reperio: 10, // «Reperio»: the way to my own last body — a trail of light and a line on the map (BodyFinder.js; the author 08.11: 10; known from the start, black magic)
    GiveMyPower: 30, // your power back from your own skeleton (Legacy.js; the author: 30)
    CreatePlanet: 500, EnlargePlanet: 100, TerraformPlanet: 1000, LevitationSuperMaxima: 100, // the gods' scrolls (PlanetMagic.js; the author: 500, 100, 1000; the Super Maxima then 3 a second)
    LetItRain: 20,
    Whirlpool: 400, // («Maelstrom», the author 07.11: a whirlpool in the sea that draws the ships in — Whirlpool.js)
    Tornado: 300, // (the author 05.11: a waterspout over the sea — OceanStorm.summon)
    Earthquake: 10,
    EarthquakeMaxima: 25,
    WindMaxima: 20,
    Overgrown: 10, // creatures thrown apart (Overgrown.js)
    Flourish: 12, // the earth turns green, then flowers (Flourish.js; the author 05.11)
    OvergrownMaxima: 20,
    Stupefy: 12,
    Expelliarmus: 12, // the wand flies out of the target's hand (Expelliarmus.js)
    Disarmor: 12, // the plain steel flies off the target (Armor.js)
    SuitUp: 5, // all the armour on at once (Armor.js; known without a scroll)
    Jolt: 5, // a bolt of air: the target is thrown back and falls (Duel.JOLT)
    JoltMaxima: 15, // … three times as strong (and three times the cost)
    ProtectionHouse: 20, // a house's sphere of protection (HouseWards.js)
    WardGrow: 3, // … each metre its dome grows while the hand is on it (1 m a second; «Maxima»: 2)
    ProtectionInvisible: 15, // the protected house is not seen from far
    WardDispel: 5, // takes down my own sphere (twice said)
    ProtectionHouseGrant: 5, // a friend may come into the house
    StrengthenHouse: 5, // «Strengthen House»: the least to begin — then 5 a second while the beam feeds the sphere (nothing at once; HouseWards.js)
    AvadaKedavra: 25,
    // the strong duel spells (StrongSpells.js)
    Spiralis: 250, // «Спиралис»: in a beam clash both beams are taken and whirled, then let go as a double charge (Whirl.js)
    Caligo: 50, // «Caligo»: the dark mage's fog, a great jet for 10 s (DarkFog.js)
    Sectura: 50, // «Sectura» (the cutting curse of black magic): paid at the swing of the wand, not at the word (Slash.js)
    Accentric: 50, // «Акцентрик»: the haze — −40 over 8 s, a minute lost
    Axis: 2000, // «Axis»: the gods' turn of the planet — day to night, night to day over ~10 s (a scroll of the gods — TimeTurn.js)
    Kidarius: 1000, // «Кидариус»: the gods' bolt — blows up on the target, −500 (a scroll of the gods — StrongSpells.js)
    Pilbidrio: 100, // «Пилбидрио»: −80, the body burst at ≤ 80
    Electrum: 50, // «Электром»: then 3 a second while the lightning is held
    Die: 1000, // «Дай»: the gods' — +10 a second while its beam fights in a clash
    WaveAttack: 8,
    WaveAttackMaxima: 18,
    AirBubble: 4,
    AirBubbleMaxima: 10,
    Hammer: 7,
    Breakthrough: 10,
    BreakthroughMaxima: 20,
    Lumos: 2,
    LumosMaxima: 4,
    LumosFlashlight: 3, // (the Lumos' modes: once)
    LumosAhead: 3,
    LumosFollowing: 15, // (then 0.1 a second: WandMagic.FOLLOW)
    CreateBed: 6,
    CreateHouse: 20, // a house by magic: then 0.5 a second for its 10 s (HouseMagic.js; each level of «Improve a House» twice as much)
    CreateCastle: 500,
    DivineCreation: 1000, // «Да пусть создастся»: the gods make what is described (DivineCreation.js pays it itself; Creative: free) // a whole castle by magic, at once (CastleMagic.js pays it itself; Creative: free)
    ImproveHouse: 40, // (level 2; 80, 160, 320 for the next — HouseMagic pays it itself)
    ChangeColor: 2,
    WaterVortex: 20, // very strong: a whole vortex of water, 20 at once + 1 a second while it holds water (see WaterVortex.js)
    VortexBubble: 0, // «Bubble» on the one the vortex hit: part of the vortex (already paid)
    FireMaxima: 20, // the only way out of the vortex's ice
    Snowman: 30, // a friendly snowman out of snow (instant; nobody's — IceQueen.castSnowman)
    Alive: 25, // a living tree (then it drains the mana while it lives)
    AliveMaxima: 50, // twice «Alive»: every grave of a graveyard / the trees round (each then drains 1 mana a second)
    TotalDestruction: 80, // the whole area falls into ruins (only with a mana maximum of 100+)
    TotalDestructionMaxima: 160, // twice as strong (only with a mana maximum of 200+)
    CircleAttack: 80, // a great wave all round the wizard — as «Total Destruction» (a mana maximum of 100+; CircleAttack.js)
    CircleAttackMaxima: 160, // … much stronger (a mana maximum of 200+)
    Inspirius: 500, // the mightiest: 500 at once, only with the wand (Inspirius.js)
    PlanetLiquidation: 1500, // «Planet Liquidation»: a planet blown up — 1500 + the planet's mass (PlanetDoom.massCost: check / pay `extra`)
    Boom: 750, // «Бум»: a mountain torn apart from inside — the scroll of the gods' temple (Boom.js)
    WaterVortexSuperMaxima: 80, // the great water storm: 2 a second while held, «стоп» 50 (only with a mana maximum of 100+; WaterStorm.js)
    WindImpulse: 10, // a ring of air: everybody within 3 m pushed away (only from a scroll — WindImpulse.js)
    WindImpulseMaxima: 40, // … within 9 m
    Drawdown: 5, // the ground sinks where the hand points; then 1 a second while it holds (Drawdown.js)
    DrawdownMaxima: 20, // … a wider bowl; then 2 a second
    Liquidation: 10, // a splash: a thing crumbles into dust, the living −3 HP (Liquidation.js)
    LiquidationMaxima: 25, // … magic things too
    Stitching: 7, // a passage sewn shut with stones of its walls (Stitching.js)
    CreateBridge: 10, // planks over a river or a ravine, 2–40 m, +0.5 mana a metre beyond 16 (Bridge.js; no scroll)
    Fireworks: 15, // once, at the start (the author: «снимается 15 маны»); the 10 s that follow cost nothing (Fireworks.js; no scroll)
    Invisibility: 250, // nobody sees me; then 2 a second (only from a scroll — Invisibility.js)
    GroundVortex: 20, // «Ground Vortex»: the earth rises and circles; then 1 a second while held (a scroll — GroundVortex.js)
    Cardilon: 7, NihilisDuel: 40, Nihilis: 40, // «Nihilis Atra»: a cone of light scatters black magic; instant (only from a scroll — Nihilis.js)
    SunRay: 500, // «Sun Ray»: the Sun's energy into the wand, then the burning beam at «Атак» — 500 once (a scroll of the gods — SunRay.js)
    Helios: 500, // «Helios»: the gods' Sun over the caster on a planet — 500 at once, then 3 a second (Helios.js)
    WaterPart: 300, // «Aquadivide»: the water stands aside like the sea for Moses — 300 at once, then 3 a second (a scroll only — WaterPart.js)
    Fireball:7, Featherfall: 10,
    WaterWalk: 50, // «Aquambula»: walking on the water — 50 at once, then 1 a second (a scroll only — WaterWalk.js)
    VisibleGodi: 20, // «Visible Godi»: a cloud on the screen shows what is behind a wall; then 1 a second (only from a scroll — VisibleGodi.js; the author lost the number in the dictation, the main session chose 20 — change it here)
    FireSerpent: 60, // «Serpent» out of my Hellfire: one must have 350 mana; then the Hellfire's drain ×2 while it lives (FireSerpent.js)
    Hellfire: 250, // «Let the Hellfire Come»: then 2 a second while held (only with a mana maximum of 100+; Hellfire.js)
    IceCastle: 500, // «Create an Ice Castle»: a stamp, then the hands raise it (IceMagic.js; free in Creative)
    IceBridge: 50, // «Ice Bridge»: an arch of ice after the hand (IceMagic.js)
    FlyingMaxima: 30, // «Flying Maxima»: up out of the air into space (Space.js; then breathing there: 0.5 a second)
};
