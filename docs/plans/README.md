# Design notes for features in progress

Plans written while investigating the code. They are starting points, not orders:
line numbers and some facts may be out of date — check the current code first.
Paths under `/tmp/...` mentioned inside were scratch experiments on another machine and are not available.

| File | Feature |
|---|---|
| `interactions.md` | Pushes, staggers, knockdowns, punches, hand holding — for every creature, and each spell's physical effect |
| `dismemberment.md` | Sword/axe cut off arms, legs, heads where the blade passed |
| `sea-ships.md` | Sea, beaches, waves, sea castles with a port, 17th-century ships |
| `surfboard.md` | The water surfboard |
| `wizard-tower.md` | The Wizards' Tower (academy), wizard houses, wizards (background: `wizard-tower-research.md`) |
| `hands-items.md` | Nothing drops by accident, real throws, reliable grabs, realistic holds, bow string |
| `houses-beds-knights.md` | Lying in a villager's bed, houses without getting stuck or flicker, knights not crowding (patches in `patches/`, made against an older commit) |
| `book-scrolls-menu-misc.md` | The book in the hands, scrolls, saved worlds menu, small fixes |
| `talk.md` | Villagers really talk: a small neural net with game actions (tool calling), the king's orders, the advisor |
| `voices.md` | Villager voices: Supertonic 3 neural TTS (5 female + 5 male), gender rules, the research behind it |
| `desktop.md` | From the browser to a real desktop program: what eats the frame (measured), Electron/WebGPU/native/Godot compared, the staged plan (stage 1 — the game's own engine process — done) |
