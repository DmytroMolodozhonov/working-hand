# Water, air and fire settlements

New generation 31 worlds can generate three additional small wizard settlements, each with the same selection weight as an ordinary mage village. Geographic requirements still apply: water settlements need the sea; air homes stand on a real floating rock island; fire homes surround a new lava-filled volcanic mountain. These are hamlets, not cities.

Each has four furnished homes, ordinary doors, beds, three-slot chests and four distinct seeded elemental residents using CastleLife's existing day/night, combat, armour and death systems. Water residents have actual canals and no travelling water tanks; air residents have planted terraces and hanging balconies; fire buildings use nonflammable dark stone and metal doors. Residents keep the mana and gifts of their discipline.

Within spell loot, the associated element receives 1.4 times its ordinary relative weight. Other spells remain possible, rarity weights remain, and spell scrolls and pentagram tablets retain equal family frequency. Fire chests independently have a 25% chance of a gargoyle head, replacing an item instead of exceeding the chest capacity.

The fire ritual pavilion contains a dormant Infernum drawing. It needs a gargoyle head before opening; a corpse does not substitute. This settlement-specific offering leaves the existing global Infernum recipes intact. The drawing follows site wake/sleep and destroyed-ground cleanup. This supplies the ritual location and offering; a separate NPC quest dialogue is not implemented here.

World generation 30 and older do not enable these plans. Comparing complete chunk hashes for two seeds and four representative chunks against 35bd6bc produced identical generation-30 results. The generation flag travels through Game, World, TerrainView, terrain workers and globe preparation.

Validation: deterministic generation and site selection, valid homes and resident metadata, all walking graph edges with dry support and five metres of clear headroom across four rotations, usable real water at every water home, loot statistics and chest capacity, dormant ritual and site lifecycle. Real browser scenes meshed 25 chunks at each settlement and activated the ordinary home/resident systems with no page errors. Water, air and fire screenshots were inspected. Syntax/merge-marker checks passed. Multiplayer exploration, long performance soaks and the separate quest dialogue remain unverified or unfinished.
