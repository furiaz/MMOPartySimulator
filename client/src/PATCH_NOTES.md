# MMO Party Simulator Patch Notes

These notes begin on June 19, 2026, when Beginner and all eight first classes had working prototype mechanics. Changes are listed newest first by day, with the starting baseline at the end so it remains the foundation that every later entry builds upon.

Future entries are added when changes reach the live version, so this document describes player-facing releases rather than every development change.

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
