# Many sessions at once — rules for every session

About 25 Claude Code sessions work on this game at the same time, each on its own task, and all of
them push to the same branch `main-fbxy0j`. Nobody answers questions.

## Work

- Work fully on your own: never ask, never wait for confirmation, never stop halfway to report.
  Finish the whole task, phase by phase, pushing each finished phase. If something is unclear,
  choose the most realistic option in the spirit of the author's rules and say so in the commit.
- Read `CLAUDE.md` first and obey it strictly:
  - every action is a real hand/finger interaction, never a canned animation;
  - hands never pass through things;
  - nothing drops or happens by accident;
  - «characters» means EVERY creature (players, villagers, knights, sailors, wizards, zombies,
    animals, living trees — not book-birds): hits, pushes, cuts and spells work on all of them;
  - everything new is tested.
- Stay inside your task. Prefer new files/modules for new features. When you must touch shared code
  (`src/game/Game.js`, `src/net/NetSync.js`, `src/fx/SpellManager.js`, `src/game/Combat.js`…),
  make small, clearly separated edits.
- Design notes for several features are in `docs/plans/` (see `README.md` there). They are starting
  points: check them against the current code.

## The game in one paragraph

A browser voxel game (three.js, ES modules, no build step) controlled by the player's real body through
a webcam (pose + hands), with Russian voice spells (`src/fx/SpellManager.js` `matchSpell`), PeerJS
multiplayer where the host is the authority (`src/net/NetSync.js`), and modes `config.mode`
`'creative' | 'survival' | 'freeworld'` (PvP free world with HP and mana: `Combat.enabled`) | maps.
The page exposes `window.__zns.game` for tests.

## Tests

- Setup: `npm ci` (or `npm install`) if `node_modules` is missing.
- Unit: `npm test` (node --test tests/unit) — must always pass before a push.
- E2E: Playwright + Chromium (pre-installed; `executablePath: '/opt/pw-browsers/chromium'` if needed):
  `ZNS_TEST_PORT=<free port> node --test --test-name-pattern="<part of name>" tests/e2e/<file>.test.mjs`.
  Synthetic poses: `tests/e2e/poses.mjs` (`frame({...})`, `feed(page, opts, count, ms)`); helpers:
  `tests/e2e/harness.mjs` (`startServer`, `launch`, `openPage`, `startFromMenu(page, mode)`,
  `waitHudVisible`, `realErrors`). Run the e2e tests you add and the ones covering what you change.

## Git (very important)

- Branch `main-fbxy0j` only. Small, finished, tested commits.
- Commit as the author with Claude as the committer:
  `GIT_COMMITTER_NAME=Claude GIT_COMMITTER_EMAIL=noreply@anthropic.com git -c user.name=DmytroMolodozhonov -c user.email=forsahenew@gmail.com commit ...`
  Message: one English line saying what the player gets, then details, then the attribution trailer
  your own session's instructions give you. No model names in commits or code.
- To push:
  1. `git fetch origin main-fbxy0j && git rebase origin/main-fbxy0j`
  2. resolve conflicts KEEPING BOTH SIDES' work — others change the same files; never drop or revert
     someone else's change;
  3. `npm test` (must pass);
  4. `git push origin HEAD:main-fbxy0j`; if rejected because someone pushed meanwhile, go back to 1.
- NEVER force-push, never push other branches, never open pull requests, never rewrite pushed history.
- Push each finished phase as soon as it is green; fetch + rebase often while you work.
- Never commit `.env.local` or any keys; never bypass GitHub push protection (the vendored
  `transformers.min.js` false positive is already handled). Don't touch the minimap lake (it is correct).

## Texts

Player-facing text is simple Russian. When behaviour or spells change, update `README.md` (Russian)
and the in-game book `src/ui/Codex.js`. The fatigue bar is being renamed to «мана» (internally still
`Combat.fatigue` until the mana session lands) — in new player-facing texts say «мана».

## Mana hook (for every new spell)

`game.mana.success('<SpellName>')` — call it ONCE where your code knows the spell really worked
(it lifted / hit / exploded / appeared…). It gives +1 to the mana maximum, and +3 more the first time a
strong spell works (every `…Maxima`, plus `STRONG_SPELLS` in `src/game/Mana.js` — add yours there if it
is strong). `Game.castLocalSpell` already calls it for a spell that was paid for (`combat.pay`) and
returned its name, unless the name is in `MANA_LATER` (Game.js) or the code set `this._manaLater = true`
during the cast: then report it yourself when it works. Player-facing text: say «мана», not «усталость».

## When done

Make sure everything is pushed, then end with a short report in simple Russian: what the player can
do now, and what is left, if anything.

## Who does what (don't do other sessions' tasks)

| Session | Task |
|---|---|
| spider | The giant spider twice as big |
| mana | Mana instead of fatigue (max grows with practice) → mana crystals in caves → «Максима» in a duel clash |
| tower | The Wizards' Tower (academy), wizard houses, wizards, wandering wizards |
| houses | Lying in a villager's bed; houses without getting stuck or flicker; knights not crowding |
| alive | The «Alive» spell (a living tree) + Brainrot on any creature |
| herds | Animal herds keep a distance and behave like animals |
| models | New horse and pig models |
| handshake | Handshake and holding/pulling someone's hand |
| impacts | Pushes, staggers, knockdowns, punches, head jolts, falls — on every creature; each spell's physical effect |
| vortex | The «Water Vortex» spell + Bubble, Frozen, Fire Maxima |
| hands | Nothing drops by accident, real throws, reliable grabs, realistic holds, bow string |
| book | The spell book held really realistically |
| scrolls | Scrolls, the saved worlds menu, small fixes |
| cuts | Sword/axe cut off limbs and heads of every creature where the blade passed |
| death | Death: the body stays (bones), everything drops and can be looted, respawn with only the wooden wand |
| runner | The running book (+30% run speed) |
| fishing | The fishing rod and fishing |
| sea | The sea: deep water, beaches, waves, sea castles with a port → then the surfboard |
| ships | 17th-century ships: model, decks, sails, wheel, wind → then crews, cannons, damage, sinking, sync |
| look | The new look: the name «Волшебство только начинается», interface, modes, logo |
| launcher | Windows launch: an app window with a loading/update screen, shortcut, install folder |
| talk | Villagers really talk (a small neural net) and carry out orders |
| voices | Better villager voices (female/male never mixed) |
| head | Head turning gets slow over time (right turns crawl after a while) |
| wand | Hand lag; the wand's direction and grip; a real stick (pen, brush) in the hand seen by the camera |
| (main session) | Inferno following the hand; Avada only from a scroll |

## Sea API (from the «sea» session — stable, use it)

`src/world/Sea.js` (pure, Node-testable). New worlds are generation 2 (`Terrain.WORLD_GEN`, `game.gen`,
saved in the world and sent to guests); old saves and old hosts stay generation 1 (no seas, bedrock −9).
Generation 2: `MIN_LAYER = -17` (bedrock), the deep sea floor is at layer −16.

- `game.sea` (null when the world has no seas) — a `SeaWaves`:
  - `sea.time()` — the wave clock in seconds, the same on every computer (`game.seaTime()`).
  - `sea.s(x, z)` — metres from the shore, > 0 in the sea (a castle harbour counts as sea, quays as land).
  - `sea.height(x, z, t?)` — the water surface is at `WATER_LEVEL_Y + height` (0 off the sea).
  - `sea.sample(x, z, t, out)` → `{h, gx, gz, vx, vz, c, dx, dz, breaking, depth, s}` or null off the sea
    (slope, surface water speed, wave speed and direction towards the shore, whitewater 0..1, depth in layers).
  - `sea.beachesNear(x, z, r)` → `[{x, z, yaw, s}]` sand spots facing the sea.
  - `sea.storm` (0..1) makes every wave bigger.
- Low level: `seaWaveHeight(x, z, t, s, storm)` — THE wave (the drawn water uses the GLSL copy `waveGlsl()`),
  `waveAmp(s)`, `SeaIndex` (`signedDist`, `nearest`, `near`, `pointAt`), `seaDepth(s)`.
- `terrain.data.isSeaColumn(ix, iz)`, `terrain.data.seas` (the `SeaIndex`).
- Sea castles: `castle.variant === 'sea'`, `castle.port` — see the note at the end of this file once
  phase 3 lands (berths for ships, cannon mount points, port chests).
