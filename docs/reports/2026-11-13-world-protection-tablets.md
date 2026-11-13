# World protection and pentagram tablets — 13 November 2026

Existing protection already used an independent disk folder, atomic replacement and stale-write rejection. Missing layers were history, recovery from damaged primaries, durable flush and acknowledgement of disk failures. No original user saves were available in this workspace; this change does not claim to recover the previously missing worlds.

`world_storage.py` retains up to 20 JSON backup files per world (previous, 12 five-minute slots, 7 daily slots), validates identity/seed, recovers missing/corrupt primaries and preserves explicit deletions. The browser awaits independent store outcomes, reports degraded/failed saving and times out blocked operations. The world endpoint accepts up to 64 MiB instead of the map limit of 5 MiB. Persistence remains in the user's local app data outside the updated checkout; these are local copies, not protection against losing the entire physical disk.

Pentagram knowledge keeps the compatible scroll/pentagram save/network payload and loot rules. Its model is now a round tablet bearing the exact figure, with dark/light stone palettes. Four meshes per item; geometry/material reuse and two bounded 512² atlas pages, warmed before gameplay. Icons distinguish the pentagram ID. Inspection keeps the tablet rigid and visible, including remote hand placement; ordinary scroll reading is unchanged. Codex cards and search omit unknown pentagrams. Main-menu reference catalog and Creative keep their existing full-knowledge behavior.

The pause menu uses stable rounded clipping rather than a changing SVG clip-path on its scroller parent. The decorative frame remains and skips identical size redraws. A generic wide-card style caused the stretched illustrations; explicit square dimensions fix it.

Validation:

- Nine Python world storage/order/HTTP tests passed, including real files, corruption, missing files, failed replace, bounded history over nine simulated days, two players' mana, explicit deletion, stale writes, wrong-world rejection and an HTTP world larger than 5 MiB.
- Targeted browser-profile and launcher tests pass in the server-capable environment. The broad Python suite has two unrelated hand-tracking errors because OpenCV (`cv2`) is absent, and environment-dependent skips; no claim of an entirely green broad suite.
- Focused Node checks cover durable acknowledgement/error reporting, browser-profile failure fallback, death checkpoint queue, multiplayer death, legacy ownership, saved skin, scroll saves/reading/network, models/icons, descriptions, known-only Codex/search. Synthetic local and remote hand inspection preserves the rigid tablet.
- Actual game scene `tools/shots/pentagram-tablets.mjs`: game boots in 48 s; four images inspected at `/tmp/pentagram-tablets-final`. Only two supplied known figures show; all 21 learned illustrations retain equal width/height. During 90 scroll frames over a 7139 px range, frame geometry received zero mutations and parent clipping stayed `none`. No page errors. The rare user-observed flicker was not independently reproduced before the structural fix.
- The inspected screenshot exposed a pre-existing literal `${c.spell}` in the learning footer; corrected and covered by a focused rendering assertion.
