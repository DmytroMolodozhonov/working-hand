# Earth combat recovery and close-range air defence

The disappearing spell launch regression was fixed separately in dd092fd. This change addresses a separate long stationary recovery in the earth controller.

Earth casters previously waited for up to 60 mana, stood still beyond 22 m, and required 38 mana to start even when a novice's maximum was only 25. Recovery now resumes at the caster's own capacity or 32 mana. Lift reserves include actual drain and one paid throw; low reserves skip the optional orbit delay and use a short punch instead of spending the last mana on sharpening. Costs and regeneration remain unchanged.

During recovery and between rooted strikes, the mage asks the ordinary terrain/crowd collision pilot to change position while facing the opponent. A blocked sidestep tries the other side after 0.75 s, and that pilot cannot clear the live opponent simply because a sideways route was blocked. Existing range/leash limits remain.

Air mages use ordinary Wind Impulse (10 mana, 3 m) or its Maxima (40 mana, 9 m) under close pressure. These originate at the caster's body and use the existing shared spell/network path. Ordinary distant gust and Leviosa attacks remain available. Peaceful elemental settlement residents return control to ordinary day/night life; water residents can locate real canals within 10 m without a portable tank or humidity gift.

Validation: 28 earth controller/geometry/pose tests passed, including 25-mana repeated attacks, bounded recovery time, blocked sidestep reversal and blast interruption. Elemental controller tests cover both impulse costs, body origins, shared events and refusal without mana.

Actual Creative Game.frame replay, ordinary terrain/crowd steering and synthetic tracked camera pose: starting from 17 mana the mage moved 23.1 m during the first 20 seconds, began lifting at 15 seconds and released two volleys by 18 seconds. After a real Bombardo, he survived with 24 HP and resumed attacks after replenishing the spent reserve (four volleys total). No page errors. Rendering was replaced by scene/camera matrix updates during accelerated gameplay; the final screenshot used the real renderer. This is not a GPU benchmark or an exhaustive multiplayer playtest.
