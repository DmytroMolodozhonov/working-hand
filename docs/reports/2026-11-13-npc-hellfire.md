# Strong fire mage Hellfire

Fire mages with enough actual mana can prepare Let the Hellfire Come during their attack cycle. They pay the existing full 250 plus 2/s, use the same Hellfire blaze, damage, water, residual fires and network packets as players, and interrupt on death/stun/carry/levitation/falling, lost foe, exhausted mana or seven seconds. Fire mages remain immune to infernal damage, heat panic and heat push; they gain no defensive shield. Water now really reduces a host-owned NPC blaze and can extinguish it.

Generated elemental endurance uses novice/adept/elder reserves (roughly 50/100/400), preserving explicit entry ranks/mana. This makes strong generated fire mages able to afford the existing 250-mana spell; no discount or endless NPC mana. Creative Ignis has 400 so this can be tested.

Four direct tests cover full cost/drain, NPC identity in packets, finite channel, residual flames, interruption, water extinction and deterministic endurance. Existing 15 Hellfire and 13 elemental combat tests pass. Actual Creative Game.frame reached Hellfire naturally after 450 frames, max 400 and remaining 86.89 after other paid attacks plus one second of Hellfire. Stun removed the held blaze and left one ordinary fading residual fire. Screenshot /tmp/fire-mage-hellfire/fire-mage-hellfire.png inspected; no page errors.
