# MMO Party Simulator Patch Notes

These notes begin on June 19, 2026, when Beginner and all eight first classes had working prototype mechanics. Changes are listed newest first by day, with the starting baseline at the end so it remains the foundation that every later entry builds upon.

Entries are prepared before deployment and ship with the live release, so this document describes player-facing releases rather than every development change.

## October 25, 2026

### Added

- Added **Arrow**, **Balanced**, and **Side-by-side** formation selection in **Party Management → Formation**, with previews for parties of one to five companions. One saved choice serves both travel and combat; new games and older saves default to Arrow.
- Formation slots use soft role preferences: Defenders and Fighters favor forward positions, while Support and Gatherer-role companions favor rear positions. The leader receives a normal role-appropriate slot and remains the party's movement reference wherever that slot is.
- Formation changes blend their suggested positions over one second. Selection remains available while companions are dead, busy, or displaced; actual movement continues to respect commands, tasks, obstacles, and normal movement speeds.
- Added formation details to existing Debug Movement inspection, including the selected/applied preset, transition progress, slots, expected positions, substitutes, and current movement owner.

### Changed

- Party travel now uses adaptive soft formations with smooth turns, follower catch-up, and formation-aware regrouping. Narrow passages compress the formation sideways, then use distinct trailing positions when necessary; the party gradually reforms after the passage and retains soft positions when stopped.
- Combat uses formation positions as staging and recovery areas. Companions keep legal attack positions instead of chasing exact slots, and gradually return to travel formation after combat. Temporary tasks and displacement preserve slot ownership; a dead member leaves a hole until the roster changes.
- Newly acquiring automatic combatants softly prefer threats in their assigned left, center, or right lane and spread across suitable targets. Existing valid targets stay committed, while explicit party focus and single-target encounters still allow everyone to attack the same enemy.
- Automatic companion targets survive temporary crowding, avoidance, and movement changes. Obstruction-based retargeting requires sustained lack of progress and repeated reachability checks instead of a single blocked step.
- Personal defense stays local rather than replacing the whole party's objective. Defenders can also respond to real attacks on rear-slot allies before those allies become critically injured; critical-ally and personal-attacker responses retain higher priority.
- Individual floor drags remain one-shot movement orders and continue when attacked. Individual enemy/structure focus remains authoritative for that companion. Valid orders survive knockback and mobility, accepted replacements resume afterward, and direct gathering retains its personal self-defense exception before returning to the resource.
- Directly moving the leader lets eligible followers track the leader's actual movement without inheriting its individual attack or gathering target. Ordinary party floor orders also retain their destination when enemies attack.
- World Travel now uses adaptive formations while preserving the selected destination through emergency combat, individual commands, displacement, and temporary route restrictions. After an emergency, travel waits for calm and required regrouping. New automatic teleport rallies wait for active individual commands; an already-active rally keeps its existing priority.

### Fixed

- Fixed Nightmire Canopy's three Patron Ward auras sometimes appearing in front of their props after loading, animation-frame changes, or camera movement. The dark auras now consistently remain behind the Wards.
- Unified walking, combat approach, mobility skills, enemy dashes, knockback, and overlap recovery so competing movement systems cannot publish multiple position changes for one actor in the same update.
- Replaced repeated late pushing with local avoidance and bounded overlap recovery, reducing crowd jitter while preserving walls, resources, structures, movement bounds, and reservations.
- Aligned melee approach, Defender positioning, attack slots, and collision spacing around continuous body-aware geometry. Diagonal approaches, large or growing enemies, and broad structure edges now use consistent reach and standing-clearance checks.
- Blocked formation followers now hold and retry bounded path searches instead of repeatedly stepping sideways against hard obstacles. Preset changes receive fresh substitute-clearance timing, and Debug inspection avoids showing stale goals when the leader or execution context becomes unavailable.
- Companions now find safe temporary trailing positions when obstacles block their formation slots, reducing rear-member stalls and narrow-passage deadlocks before enough leader movement history exists.
- Recovery paths refresh when terrain or respawned resources block an accepted route. Companions keep their assigned slots and return smoothly once clearance improves.
- Preserved skill costs/effects and command resumption when movement must wait, including dash interruption, safe landings, Shield Shockwave completion timing, and safe Barracks rebuilding.

### Known Issues

- In very dense fights, an enemy can briefly drop and reacquire its target when other bodies block its path. This can cause short Defender target switches; the enemy-side retention behavior is unchanged in this release.

## October 22, 2026

### Added

- Added a Hub 2 main-quest chain using the Forward Bastion's existing Quest Giver. Objectives within each main quest progress together, and eligible prior ownership or encounter milestones are recognized.
- **Orders from the Guild** introduces the Guild Notice Board after the Azure Trial and first-class selection. Take the protected **Assault on Ash Goblin Encampment** starter contract, then return to the Quest Giver to unlock the Zone 4 main quest.
- **Break the Ash Camp** requires 200 Zone 4 enemy credits, 20 gathered Zone 4 resource units, and a first-class weapon equipped on an active companion. Rewards: **1,800 character XP per eligible companion and 500 Crowns**.
- **Into the Briar Burrows** requires 300 Zone 5 enemy credits, a Tin Crawler Hatchling, and three active companions. Rewards: **2,800 character XP per eligible companion and 750 Crowns**. Previously acquired Hatchlings and existing party members count immediately.
- **The Patron's Shadow** requires breaking three Nightmire Canopy Patron Wards and owning an Elder Mossling. Charge each Ward with 100 matching Night Bat, Elder Mossling, or Cinder Wisp credits, then manually activate its themed defense in any order. Rewards: **4,000 character XP per eligible companion and 1,000 Crowns**.
- Patron Ward defenses allow one active fight at a time, preserve charge after failed attempts, and unlock the Orc Warcamp route after the third Ward breaks, without waiting for quest turn-in. Added animated Patron auras, a dark-green portal barrier, and a Warmaster foreshadowing scene. Existing saves that already reached Orc Warcamp retain access.
- **The Evil Patron's Chosen** tracks one Warmaster victory, the captive's rescue, full chest collection, and 150 Orc kill credits. Boss-first guidance does not prevent other objectives progressing in parallel. Rewards: **6,000 character XP per eligible living companion and 1,500 Crowns**.
- Rebuilt Orc Warcamp around a broad farming field, a north-to-south approach, and a compact Boss arena with three Barracks. The route Barrack has walkable lanes beside it, and the return path to Nightmire remains accessible.
- Added manually attackable Barracks that produce normal Orc reinforcements: 80% Grunts, 10% Raiders, and 10% Shieldbearers. The route building activates near visible companions; arena buildings activate during the Boss attempt when a companion is visible in the arena. Auto Combat does not independently target buildings, but manual attacks and incidental damaging AoEs can destroy them.
- Barracks leave nonblocking ruins when destroyed, rebuild independently after two minutes when permitted, and announce **"Work Work"** ten seconds beforehand. Rebuilding safely separates movable occupants where possible and waits when no safe placement exists. Surviving reinforcements retain their building ownership.
- Added the Orc Warmaster's **Kick**, **Rending Dash**, **Patron Cleave**, and **Patron Burst**. Kick pushes its target up to four units; Cleave unlocks at five Patron Power and Burst at ten. Skills retain telegraphs and require a basic attack between uses.
- Arena Orc deaths send visible energy toward the Warmaster. Patron Power caps at ten, increases his sprite, aura, and combat size by up to 50%, and persists for the attempt without decaying. Wipes, retreat, travel, and restoration reset a living Boss attempt without requiring another 60-kill recharge.
- Added repeatable Warmaster encounters. The first fight is ready immediately; subsequent fights recharge after **60 qualifying Zone 7 Orc deaths**, including Barrack reinforcements. Superiors grant one recharge credit per physical death. Rearming waits for full chest collection and a safely cleared entrance, then restores the Boss and all three arena Barracks.
- Each Warmaster victory creates one persistent, manually collected chest: **500 Crowns**, independent **90% level-15 equipment** and **10% level-20 equipment** rolls, and **five independent first-class skill books**. Partial collection preserves overflow without rerolling rewards, and departure warnings let players return for unclaimed loot or leave it safely for later.
- The first Warmaster victory automatically frees the captive. Added closed/open cage artwork with transparent bars; the cage stays open after rescue through later fights and saves.

### Changed

- Guild Board postings now randomly select among visited **Zones 4–7** and four categories: **Assault on {Zone}**, **{Enemy} Extermination in {Zone}**, **Rummage of {Zone}**, and **Forage in {Zone}**. Regular contracts exclude Boss, Elite, and Champion encounters.
- Board refreshes prefer visited zones within five levels of the active party's average, with an 80% nearby-zone preference when both groups exist. Targets and rewards are fixed when postings generate, not when the menu opens; recruitment affects future refreshes rather than existing contracts.
- Zone 4/5/6/7 contracts require **50/70/90/110 kill credits**, **30/42/54/66 Rummage items**, or **10/15/20/25 gathered resource units**. Rummage has a separate 50% drop roll per qualifying death and contract, uses no inventory slots, and has no pity mechanic. Forage accepts successfully gathered wood, ore, or herbs without consuming them at claim.
- New Board contracts grant workload-based XP, **150/200/250/300 base Crowns** by zone, and **two independently rolled first-class books**. Reward Quality increases Crowns and offers an independently rolled third book, without increasing XP. Claims are all-or-nothing if the complete book award cannot fit; taken and completed-unclaimed postings remain protected from refresh.
- The fixed Zone 4 starter now asks for 50 total ordinary-enemy credits and uses the new rewards. It remains available before the first Zone 4 visit and protected until taken. Existing taken or completed legacy contracts retain their original requirements and rewards.
- Direct Superior defeats now grant two credits to matching ordinary kill quests and Board kill contracts. Quest-item drops still roll once per physical death, and Field Team reports retain one credit per reported kill. Field Teams contribute to Assault and Extermination, not Rummage or Forage.
- Skill Preferences now groups supported controls under each skill's exact name. Settings are independent between skills, existing choices migrate, and disabled legacy skills no longer clutter preference cards. Detailed hover/focus descriptions show geometry, targeting, and effect tradeoffs.
- Added **Sweeping Strike** and **Maul Sweep** semicircle/full-circle variants. Their full circles deal 70% of the semicircle's skill damage; Sweeping Strike now applies uniform damage rather than different primary and splash values.
- **Shield Shockwave** can use its existing circle control or a forward semicircle that stuns for one second, pushes up to two units, then taunts for three seconds after displacement finishes.
- **Arrow Burst** offers a longer line or wider cone. **FireBurst** offers similarly sized target-centered circle, cross, X, and line areas while retaining its damage and Burn.
- **Circle of Renewal** offers its normal radius-five circle or a concentrated circle with 70% of the area and 130% healing. **Dawn Step** and **Atonement Step** offer circle/cross variants with their existing offensive and defensive effects. **Rune Step** remains a fixed circle.
- Applicable skills offer **High HP**, **Big Group**, and **Low HP** targeting; Renewal also offers **Defender**. Big Group scores the selected shape, while caster-centered melee AoEs retain normal attack-context facing rather than adding target-priority controls. Shared resolved geometry keeps effects and telegraphs aligned.
- Added hover-only **Rank** information for non-standard encounters, independent of Superior variants. Azure Mass and the single Orc Warmaster are Bosses; Standard enemies omit the Rank row, and world nameplates remain unchanged.
- Tin Crawler acquisition is now named **Tin Crawler Hatchling**, with **Tin Crawler Hatchling Discovery** as its permanent key item. The placed adult remains Tin Crawler, and discovery probabilities are unchanged.

### Balance

- Rebalanced the higher-level XP curve for gentler progression while preserving companions' earned levels and XP.
- Set the Orc Warmaster to **1,500 HP**. All Barracks have **1,248 HP** and a **12-second reinforcement cycle**; each arena Barrack caps at **two living reinforcements**, while the route Barrack retains its five-enemy cap. Patron growth does not add HP, attack, or defense bonuses.
- Smith recipes now use level-appropriate materials: armor ingredients may come from at most two levels above the item, and weapon ingredients from at most three levels above it. Prefer lower/equal-level materials, with higher-level ingredients used in smaller quantities; removed late-Orc materials from inappropriate level-10 recipes.
- **Open the Causeway** now has one repair ambush of two level-7 Wolves and one level-7 Goblin Thrower. The ten-second repair must finish and all three ambushers must die before the tracked level-8 Superior Wolf appears. That Wolf remains Standard rank and grants normal Superior rewards. Escort, route unlock, and quest rewards are unchanged.

### Fixed

- Guild-recruited companions now survive physical teleports, World Travel, and debug map reconstruction with their active-party records and leader identity intact. Inn reserves and Field Teams are not inserted into the active world.
- Fountains now heal living active companions and refill equipped flasks wherever map data places a fountain, including Hub 2. They still do not revive dead companions.
- Defense-focused Auto Combat stays with the encounter, ignores resource POIs, and holds near its anchor between waves and across shared encounter handoffs. Autonomous Gatherer-role companions rejoin the party; manual gathering orders remain available.
- Patron Ward defenses suppress ambient enemies throughout Nightmire, including dead/respawning and Superior enemies, then restore them two seconds afterward. Consecutive defenses share suppression without a brief repopulation. Causeway suppression continues through the Superior Wolf and restores ambient enemies three seconds after its defeat.
- World speech bubbles now avoid the minimap and registered HUD bounds, keeping the Warmaster's lower-Ward finale readable. The Causeway Worker also announces **"Its an ambush! Protect me!"** once when the repair ambush starts.
- Warmaster victory turns Auto Combat off and clears remaining arena enemies without rewards. Arena production and rebuilding stay frozen until the next valid encounter; chest interaction also stops Auto Combat and keeps the loot interface open rather than letting autonomous movement close it.
- The Warmaster waits near his Barracks until detecting the party instead of wandering away between attempts. Removed the duplicate Warmaster spawn, preserved ordinary combat movement, and kept Boss pursuit inside the arena.
- Barrack attacks use the building's visible attackable area instead of crowding every attacker around one small point. Opened the route's former hard choke and made production respect line of sight to reduce crowding and prevent spawning through walls.
- Added restoration and legacy-save reconciliation for the new quests, encounter milestones, chest history, Barracks, and preferences without resetting existing progress or requiring a new save version.

## October 9, 2026

### Changed

- Point-of-interest displays now use readable enemy names instead of internal enemy identifiers.
- Functional town services can now be opened from anywhere in the current hub while their NPC is present; excluded interactions such as dogs and quest guides still use normal range checks.

## October 8, 2026

### Added

- Added the first sound-effect pass for combat, gathering, quests, merchant transactions, and UI feedback.

## October 7, 2026

### Changed

- Consolidated first-class hand equipment into clearer weapon and offhand families, including flexible Claw, Orb, and Lantern slot rules where appropriate.

## October 6, 2026

### Added

- Added class portraits to compact party and companion interfaces so each class is recognizable at a glance.
- Added a configurable equipment-drop popup threshold, including an Off setting for players who prefer quieter loot feedback.
- Added onboarding when the party-size limit increases, explaining when a new active slot becomes available.
- Added short, non-branching speech bubbles for supported NPC interactions.

### Changed

- Training Swords and Copper Training Swords became universal main-hand weapons, so a Beginner can keep one equipped when selecting any first class.

## September 29, 2026

### Added

- Added Merchant Sell with quantity selection, clear Crown totals, and protected handling for locked or ineligible inventory slots.

## September 26, 2026

### Added

- Added keyboard shortcuts for opening and cycling game menus, pausing, Auto Combat, and dismissing supported overlays.
- Added hub background music with volume and mute controls.

## September 24, 2026

### Added

- Added two passive skills for each magic and support first class: Elementalist, Runecaster, Lightbearer, and Penitent.

## September 23, 2026

### Added

- Added two passive skills for each martial first class: Blade, Aegis, Hunter, and Beast.
- Added reusable Runecaster word seals and ordered two-seal icons so rune skills keep a consistent visual vocabulary.

### Balance

- Retuned Elementalist Overcharge so power and cooldown cost both scale explicitly by rank, with slower growth after rank 5.
  - **Example:** At rank 5, the previous version granted 20% skill power with a fixed 20% cooldown penalty. The retuned version keeps 20% power but applies a 28% cooldown penalty before Stable Overcharge reductions.

## September 18, 2026

### Added

- Added two always-active Beginner passives and reworked the Beginner active kit so early skills remain useful after first-class selection.

## September 17, 2026

### Added

- Added visible companion buff and debuff rails to the bottom HUD, with a player-controlled display toggle.
- Added scalable active-skill ranks, companion-aware rank caps, and exact skill-book Study costs.
  - **Example:** Before, three of four required books could be consumed and stored as partial progress. After, Study waits until all four books are present, consumes exactly four, and grants one rank.

## September 15, 2026

### Balance

- Extended maintenance-buff durations so companions spend less time refreshing routine effects.
  - **Example:** General first-class maintenance buffs changed from 60 seconds to 5 minutes; Overcharge received its own 2-minute duration instead of sharing the general timer.

### Fixed

- Fixed companions becoming stuck on one another by improving obstruction recovery and leader-anchored separation.

## September 12, 2026

### Added

- Added important-item acquisition popups for high-value drops and unlocks.

### Changed

- Polished later wilderness zones with denser landmarks, clearer encounter spaces, improved HUD presentation, and more readable travel flow.
- Rebalanced early enemies, companion growth, equipment, and inventory data for a smoother level curve.
- Doubled the interaction range for core hub services and improved resource tooltips with produced-item and remaining-node details.
- Reclassified monster parts as materials and removed the old automatic Merchant quick-exchange flow so they remain available for storage and later use.

## September 9, 2026

### Added

- Added Quest Helper shortcut buttons for common quest and travel actions.
- Expanded onboarding with more contextual guide popups for party growth and major systems.

## September 3, 2026

### Changed

- Renamed the starter Slime enemy to Green Slime for clearer bestiary and target labels.

## September 2, 2026

### Added

- Added yellow quest indicators beside relevant NPC, enemy, and resource nameplates.

### Changed

- Simplified the player-facing Auto Combat control to Off or On while keeping route behavior and quest guidance coordinated behind the scenes.
- World Travel and quest panels now show where active NPC quest objectives are located.

### Fixed

- Restored normal enemies after defense objectives and added timed respawning for authored wilderness resource nodes.

## August 28, 2026

### Changed

- Separated automatic local combat from travel routing so stopping one behavior no longer unintentionally cancels the other.

## August 25, 2026

### Added

- Added Wolf, Tin Crawler, and Elder Mossling discoveries plus helper bonuses that improve Guild rerolls or Farm production.
- Added bronze accessory crafting recipes and their supporting item progression.

### Changed

- Renamed Stone Crawler and its related material to Tin Crawler and Tin Ore.

### Fixed

- Prevented the Bank and main menu from forcing horizontal overflow on narrower layouts.

## August 24, 2026

### Added

- Added Livestock with grid placement, Duskhen ownership, Egg production, Pantry collection, and persistent save support.
- Added daily Pantry-backed feeding, hungry pause and resume behavior, prorated placement costs, and Feed Now.
- Added Livestock animal and building upgrades for production speed, feed discounts, holding limits, rows, and columns.

## August 23, 2026

### Added

- Added unlock paths for Potato, Moonleaf, Bittercap Mushroom, and Ashpepper crops through merchants, gathering, and enemy discoveries.

## August 21, 2026

### Added

- Added the Farm with persistent crop plots, timed production, holding limits, and Harvest All delivery to the Inn Pantry.
- Added Farm speed, holding-cap, and fertilizer upgrades.

## August 19, 2026

### Added

- Added Kitchen auto-cook preferences, renewal thresholds, bulk cooking, and Kitchen upgrade tracks.

### Changed

- Cleaned out the retired inventory-food system after the Inn Kitchen became the owner of meal buffs.

## August 17, 2026

### Added

- Added Guild Field Teams, reserve-roster assignment, dispatch destinations, timed AFK rewards, and return or redeem controls.
- Added Inn Rooms as a reserve-companion overview with upgradeable capacity.
- Added the Inn Kitchen, House Bread meals, Hearth's Fire, a Pantry, per-companion recipes, and persistent meal buffs.

## August 12, 2026

### Added

- Added Field Team upgrades and a shared AFK estimator so assignment rewards use the same party and subzone estimates shown to players.

## August 11, 2026

### Added

- Added Recruit upgrades for more candidate slots, better level ranges, faster refreshes, equipment chances, and skill chances.
- Added Notice Board upgrades for extra slots, improved rewards, faster refreshes, and daily Scout rerolls.

## August 10, 2026

### Added

- Added a shared Guild and Inn foundation in Forward Bastion with service availability and persistent progression state.
- Added Guild Recruit candidates who can join the active party or move into the Inn reserve when space is available.
- Added Guild Notice Board quests with take, cancel, progress, completion, reward, refresh, and seen states.

## August 6, 2026

### Added

- Added craftable Teleportation Echo key items for direct World Travel to supported discovered destinations.

## August 5, 2026

### Added

- Completed the level 1, 5, 10, and 15 Smith recipe sets for supported equipment lines.

## August 3, 2026

### Added

- Added the enemy, drop, and resource progression for Briar Burrows, Nightmire Canopy, and Orc Warcamp.

## July 30, 2026

### Added

- Added a guided crafting tutorial and reshaped Merchant stock around equipment families, flasks, and skill books.

### Changed

- Expanded Merchant equipment stock so available gear follows the party's level and class compatibility more clearly.

## July 29, 2026

### Added

- Added full Tier 1 crafting recipes and matching equipment icons.

## July 27, 2026

### Added

- Added the Smith crafting interface with recipe filters, requirements, Crown costs, previous-equipment upgrades, and result feedback.
- Added a 100-slot Bank with manual deposit and withdrawal, locked slots, Deposit All, and automatic routing choices.

### Fixed

- Fixed Bank layout overflow and restored missing Merchant quest guidance during the crafting and storage rollout.

## July 20, 2026

### Added

- Added level 10 Leather and Mail armor sets to fill progression gaps.

### Changed

- During Azure Mass phase retreats, autonomous companions now clear the boss target and switch to the summoned wave while direct orders remain intact.

## July 2, 2026

### Added

- Added eight-direction Azure Mass sprites so the boss faces its movement direction during the fight.
- Added Forward Bastion as the second hub and connected it between the early and later wilderness routes.

### Fixed

- Fixed the Slimeward Camp return route so leaving for the previous zone restores the party to the intended arrival point.

## July 1, 2026

### Added

- Added three health-threshold phases to The Azure Mass, each summoning a larger slime wave with one Superior enemy.

## June 27, 2026

### Added

- Added scaled equipment options to Merchant stock so stronger gear appears as progression advances.

### Fixed

- Fixed the Slimeward dungeon return route so leaving the dungeon restores the party to the intended camp position.

## June 23, 2026

### Added

- Added first-class combat VFX for Lightbearer and Penitent skills.

## June 22, 2026

### Added

- Added first-class combat VFX for Hunter and Beast skills.
- Added first-class combat VFX for Elementalist and Runecaster skills.

## June 21, 2026

### Added

- Added first-class combat VFX for Blade and Aegis skills.

### Changed

- Targeted skill effects now appear on their actual target instead of only around the caster.

## June 20, 2026

### Changed

- Status-effect bars and damage-over-time icons received clearer timing and taunt presentation.

## Baseline — June 19, 2026

### Added

- The party began with two physical companions and could grow to five through level progression.
- Any living companion could be chosen as party leader, independently of their assigned role.
- Defender, Fighter, Support, Gatherer, and None roles gave companions different autonomous priorities.
- Role bonuses rewarded companions who remained assigned as Defender, Fighter, Support, or Gatherer long enough for the assignment to settle.
- Direct attack, gather, and move orders let the player temporarily override one companion's autonomous behavior.
- Party intent, cohesion, formation movement, and automatic regrouping kept the expedition acting as a unit.
- All nine prototype classes were playable: Beginner, Blade, Aegis, Hunter, Beast, Elementalist, Runecaster, Lightbearer, and Penitent.
- Beginner companions could select a first class at level 10 when their equipped items were compatible.
- Every class had a working active-skill kit covering its intended combat, support, control, mobility, or gathering identity.
- Skill behavior settings let players tune supported healing thresholds, defensive triggers, mobility use, and target preferences.
- Skill books raised learned skills, and maxed Beginner skills could remain available as legacy skills after first-class selection.
- Companions gained levels, natural stats, allocatable stat points, and derived combat stats.
- Class-restricted weapons, armor, accessories, flasks, and equipment slots were supported through the shared party inventory.
- Real-time combat included melee and ranged attacks, cooldowns, hit checks, defense, evasion, block, critical hits, healing, and health regeneration.
- Temporary combat effects included taunts, binds, shields, mitigation, damage-over-time effects, buffs, healing-over-time effects, and other class mechanics.
- Enemies supported passive and aggressive behavior, target preferences, combat styles, level scaling, respawning, and rare Superior variants.
- Fallen companions could be resurrected by the surviving party, while a full party defeat returned the expedition to a safe rescue point.
- Harbor Union Bastion, four wilderness zones, Slimeward Camp, and two Slimeward dungeon floors formed the playable route.
- The Slimeward dungeon included ordered encounters, The Azure Mass boss, a loot chest, and an exit unlocked by collecting the chest.
- A connected main quest chain guided the party through combat, gathering, equipment, repair, defense, escort, route, elite, and dungeon objectives.
- Auto exploration and point-of-interest selection could pursue quests, enemies, resources, teleports, and unexplored locations.
- Wood, Ore, and Herb nodes could be gathered for tiered materials by Gatherer-role companions or commanded collectors.
- The shared inventory and wallet supported stackable materials, consumables, skill books, equipment, quest items, and Crowns.
- Enemy drop tables supplied materials and occasional equipment, with short-lived drop feedback instead of persistent ground loot.
- The Merchant sold a fixed selection of equipment, flasks, and skill books and exchanged eligible monster parts for Crowns.
- Browser saves supported autosave, manual save, Continue, New Game, export, import, validation, and versioned restoration.
- Continuing a suitable wilderness save could grant capped offline XP, resources, and enemy drops, with overflow rewards held for later collection.
- Guide popups introduced the game, the equipment tutorial, and recovery after the first full-party defeat.
