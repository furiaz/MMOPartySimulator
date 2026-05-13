# GTD.md

## Overview

This document defines the current technical structure of the game.

The project follows a simulation-first architecture:

- Game logic runs independently of the UI
- UI reads and displays game state
- Systems update the world over time for idle/AFK play

Design intent is defined in `GDD.md`. This document defines how that intent is represented technically.

---

## Core Architecture

The game is divided into:

- Game Logic: `client/src/game/`
- UI Layer: React components in `client/src/`
- Visual asset registry, image icon mappings, and sprite helpers: `client/src/visualAssets.ts`, `client/src/assetIcons.ts`, and `client/src/SpriteAnimation.tsx`

Game logic must not depend on React.

React may display game state, issue commands into game logic, start/stop the simulation loop for development, expose temporary debug controls, and render temporary visual effects and sprite animations from game state.

React must not contain core simulation rules.

---

## Folder Structure

Current files include:

- `attackSlots.ts`
- `attackSystem.ts`
- `classes.ts`
- `commands.ts`
- `debugMap.ts`
- `debugTelemetry.ts`
- `debugTools.ts`
- `defendSystem.ts`
- `defenderCombat.ts`
- `dropSystem.ts`
- `dropTables.ts`
- `enemyAISystem.ts`
- `enemyArchetypes.ts`
- `entities.ts`
- `entityGuards.ts`
- `equipmentRules.ts`
- `equipmentSystem.ts`
- `equipmentTypes.ts`
- `explorationSystem.ts`
- `followSystem.ts`
- `gameLoop.ts`
- `gatherSystem.ts`
- `healingFountainSystem.ts`
- `index.ts`
- `inventory.ts`
- `items.ts`
- `leveling.ts`
- `merchant.ts`
- `movementCadence.ts`
- `movementState.ts`
- `navigation.ts`
- `partyFormationSystem.ts`
- `partyProtectionSystem.ts`
- `partySpacing.ts`
- `partySystem.ts`
- `poiSystem.ts`
- `poiTypes.ts`
- `positionUtils.ts`
- `questSystem.ts`
- `questTypes.ts`
- `roleProfiles.ts`
- `roleSystem.ts`
- `simulationTiming.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`
- `skillSystem.ts`
- `skillTargeting.ts`
- `skills.ts`
- `state.ts`
- `targetSelection.ts`
- `testState.ts`
- `teleportSystem.ts`
- `types.ts`
- `updateGame.ts`
- `wallet.ts`


Do not restructure the project unless explicitly requested.

New helper modules may be added when they keep responsibilities clear.

---

## Entity Model

Entities represent world objects and actors.

Current entity kinds:

```ts
type EntityKind = "companion" | "enemy" | "resource" | "npc";
```

NPC entities are prototype placeholders for safe hub map visuals. Current prototype NPC behavior is limited to Quest Giver quest interaction and Merchant quick exchange. NPCs do not implement dialogue, full shops, crafting, recruitment, smithing, or relationship behavior.



The player is not represented as a world entity. The player is the manager/controller issuing intent and commands to party members.

Current execution states:

```ts
type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";
```

States describe what an entity is currently doing.

Roles describe behavior priorities and should not be confused with states.

---

## Position Model

Positions use numeric `x` and `y` coordinates.

Movement is continuous-style step movement, not strict tile-by-tile movement.

Entities move toward target positions by a fixed step amount.

Current movement step constants live in `entities.ts`.

Current movement model supports bounds checks, wall checks, collision checks, movement reservations, simple pathing, fallback movement, party pass-through in specific party movement cases, and party swaps in specific movement edge cases.

---

## Party Members

Companions are the physical party members.

Party members currently support:

- `id`
- `kind`
- `position`
- `state`
- `health`
- `maxHealth`
- `lastAttackAt`
- `classId`
- `characterLevel`
- `characterXp`
- `lastCharacterXpGained`
- `role`
- `partyOrder`
- `followTargetId`
- `defendPosition`
- `currentTargetId`
- `lastGatherAt`
- `gatherSpeed`
- `commandPriority`
- `equipment`

Shared party-member behavior is handled through `partySystem.ts`.

Current helper responsibilities include identifying party members, getting living party members, getting the current party leader, sorting party members, identifying busy gatherers, setting party leader, setting role, setting class, and setting party order.

---

## Leader

Leader is not a role.

Leader is stored in game state as:

```ts
partyLeaderId: string;
```

The current leader provides party intent, selects points of interest, selects enemy targets, and is a companion / physical party member.

Systems must not assume any separate player entity exists.

If the configured leader is missing or dead, party helper logic falls back to the first living party member.

Leader handoff uses a short millisecond-based timing buffer so systems can settle after leader changes.

---

## Roles

Roles apply to party members.

Current role values:

```ts
type PartyMemberRole =
  | "defender"
  | "fighter"
  | "support"
  | "gatherer"
  | "none";
```

`none` is a safe default/unassigned role.

Party members have roles, and `CompanionRole` aliases `PartyMemberRole`.

Role behavior is handled by `roleSystem.ts`, `roleProfiles.ts`, and role-specific systems such as `defendSystem.ts` and `gatherSystem.ts`.

Roles define priorities. Classes define available capabilities.

---

## Party Order

Party order determines ordering within a role group.

Party members use:

```ts
partyOrder: number;
```

Formation/member ordering sorts by role priority, party order, and id.

Current role priority:

- defender: 0
- fighter: 1
- support: 2
- gatherer: 3
- none: 4

---

## Game State

`GameState` is the central simulation container.

Current responsibilities include storing entities, shared party prototype inventory, shared party wallet, current debug map id, optional map data, active teleport state, auto-mode state, simulation tick/frame/time values, party leader id, leader handoff timing, leader intent, prototype quest state, global/local POI intent, explored positions, follow trails, movement planning, movement path cache, defender wait/blocking state, party formation state, combat feedback, prototype skill runtime state, prototype skill visual events, prototype drop visual events, and debug telemetry.


Current movement planning fields include:

- `failedMoveByEntityId`
- `movementFailureMsByEntityId`
- `movementFailuresByEntityId`
- `moveIntentsByEntityId`
- `reservedPositionsByEntityId`
- `movementPathsByEntityId`
- `movementDecisionsByEntityId`
- `lastPositionsByEntityId`


Current prototype skill runtime fields include:

- `skillMarksByEnemyId`
- `skillSelfBuffsByCompanionId`
- `skillBindsByEnemyId`
- `skillShieldBlocksById`
- `skillCooldownsByCompanionId`
- `skillVisualEvents`

State helpers should remain low-level and safe. Systems should own behavior decisions.

---

## Classes

Classes represent party member capabilities.

Roles represent behavior priorities.

Class data stays in game logic under `client/src/game/`.

Class definitions live in `classes.ts`.

Current class path type:

```ts
type ClassPath =
  | "honor"
  | "primal"
  | "arcane"
  | "holy";
```

Current class id type:

```ts
type ClassId =
  | "beginner"
  | "blade"
  | "aegis"
  | "hunter"
  | "beast"
  | "elementalist"
  | "runecaster"
  | "lightbearer"
  | "penitent";
```

Current class definition type:

```ts
type ClassDefinition = {
  id: ClassId;
  path: ClassPath | null;
  displayName: string;
};
```

Companions store:

```ts
classId: ClassId;
```

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity. Equipment rules must not require React rendering logic, sprite swaps, weapon anchoring, or visible attachment systems.


Current class implementation is still lightweight and structural, but classes now provide prototype skills through `skills.ts`.

Subclass progression is not implemented.

---

## Leveling

Character leveling is implemented in `leveling.ts`.

Current companion leveling fields:

```ts
characterLevel: number;
characterXp: number;
lastCharacterXpGained?: number;
```

Current enemy leveling fields:

```ts
level: number;
xpReward?: number;
```

Current leveling constants:

- `MAX_CHARACTER_LEVEL = 200`
- `BEGINNER_CLASS_UNLOCK_LEVEL = 10`

Current leveling behavior:

- enemies grant XP when killed by party combat or prototype skills
- XP is granted to living companions
- dead companions do not receive XP
- max-level companions do not receive XP
- XP reward defaults from enemy level if `xpReward` is not set
- XP to next level uses anchored progression values with interpolation
- same-level enemy XP uses anchored progression values with interpolation
- companion XP rolls over through multiple level-ups if enough XP is gained
- max-level companions have `characterXp` reset to 0
- debug telemetry records XP awarded, XP reduced, XP skipped, and level-up events

Current level-gap XP modifier:

- companion level up to 10 above enemy level: 100 percent XP
- companion level 11-20 above enemy level: 50 percent XP
- companion level 21-30 above enemy level: 25 percent XP
- companion level more than 30 above enemy level: 0 percent XP

Current party size limit is based on total party character level:

- total party level below 10: 2 party members
- total party level 10 or higher: 3 party members
- total party level 30 or higher: 4 party members
- total party level 60 or higher: 5 party members

Beginner class eligibility is currently:

- companion class is `beginner`
- companion level is at least 10

Leveling is a prototype progression system. It should remain simple unless expanded intentionally.

---

## Skills Prototype

Skills are simple class-based actions used to extend existing behavior.

Skill definitions live in `skills.ts`.

Skill selection and execution live in:

- `skillSystem.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`

Current skill runtime is prototype-only. It is not a full ability framework.

Current skill ids:

```ts
type SkillId =
  | "sweeping_strike"
  | "guard_wall"
  | "mark_target"
  | "feral_surge"
  | "elemental_bolt"
  | "binding_rune"
  | "light_mend"
  | "penitents_gift";
```

Current prototype skills:

- Blade: Sweeping Strike
- Aegis: Guard Wall
- Hunter: Mark Target
- Beast: Feral Surge
- Elementalist: Elemental Bolt
- Runecaster: Binding Rune
- Lightbearer: Light Mend
- Penitent: Penitent's Gift

Current skill effects include direct damage, sweeping/splash damage, enemy mark bonus damage, self damage buff with HP cost, shield block, bind, heal, and self-cost heal.

Current skill rules:

- skills are tied to classes
- roles determine preferred skill usage
- skill tags affect role scoring
- direct-commanded companions do not use autonomous prototype skills
- dead companions do not use skills
- skills have a shared prototype cooldown
- current shared prototype cooldown is 5000ms
- skill ranges use numeric values
- runtime skill effects expire through game-state cleanup
- skill visuals are represented through temporary visual events
- skill feedback may use combat feedback events

Current skill visual event types:

```ts
type SkillVisualType =
  | "slash"
  | "projectile"
  | "red_flash"
  | "heal";
```

Current skill runtime state includes marks, self buffs, binds, shield blocks, cooldowns, and visual events.

Do not expand this into a full ability framework unless explicitly requested.

Do not add mana, casting, advanced targeting, equipment requirements, or complex cooldown systems unless explicitly requested.

---

## Commands

Commands can be direct entity commands, party member commands, party member group commands, leader-selection commands, and party-order commands.

Rules:

- direct commands override autonomous behavior for the targeted entity
- direct commands should not automatically change other entities
- direct commands are absolute for this phase
- commands update leader intent only when issued by or for the current leader

Current command priority values:

```ts
type CommandPriority = "autonomous" | "direct";
```

Current command types use entity states except `dead`.

---

## Leader Intent

Leader intent is stored as:

```ts
type LeaderIntent = {
  type: "attack" | "move" | "gather" | "explore";
  targetId: string | null;
  targetPosition: Position | null;
  source?: "player" | "ai";
};

```

Leader intent is used by party movement, role behavior, combat targeting, exploration, defender positioning, and teleport point movement.

Leader intent may be cleared when a point of interest is reached, combat ends, or a map transition completes.

## Prototype Quests and POIs

Prototype quest definitions live in `questSystem.ts` and quest types live in `questTypes.ts`.

Quest state is stored on `GameState` as `quests: Record<QuestId, QuestState>`.

Current quest ids are `clear_the_shore`, `gather_expedition_supplies`, `scout_the_northern_road`, and `threat_beyond_the_pass`.

Current quest statuses are `locked`, `available`, `active`, `ready_to_turn_in`, and `completed`.

Current quest reward source types are `npc`, `mapTrigger`, and `objectTrigger`.

Only NPC quest turn-in is implemented. Map trigger and object trigger sources are future-facing type support only.

Current quest rewards may include:

- Crowns
- character XP
- inventory item rewards
- equipment item rewards

Current quest state also tracks reward claim safety through:

- `completedCycle`
- `rewardClaimedCycle`
- `lastTurnInError`

Quest reward claim behavior:

- Quest Giver turn-in validates the full reward package before mutating state.
- If validation fails, no Crowns, XP, items, equipment, or completion state are applied.
- If validation succeeds, all rewards are granted and the quest is marked completed.
- Equipment rewards are added to shared party inventory.
- Quest XP is awarded to living current party members only and does not use enemy level-gap reduction.
- Non-repeatable quests cannot grant rewards more than once.
- Inventory-full failures leave the quest `ready_to_turn_in`.

POI selection types live in `poiTypes.ts`.

Current POI categories are `npc`, `quest`, `combat`, `resource`, `teleport`, `exploration`, `idle`, and `event`.

`poiSystem.ts` selects global quest intent and local map targets for auto-mode behavior. It may set leader intent toward quest givers, combat targets, resources, exploration points, idle hub points, or prototype teleports.

The POI system must remain a prototype debug-map guidance layer and must not become the final world-routing, dialogue, or quest content pipeline unless explicitly requested.


---

## Systems

Systems operate on `GameState`.

Current systems include:

- Teleport System
- POI System
- Healing Fountain System
- Role System
- Skill System
- Party Formation System
- Exploration System
- Defend System
- Follow System
- Enemy AI System
- Attack System
- Drop System
- Gathering System
- Party Protection System
- Debug Telemetry


Each system reads `GameState`, updates entities through state helpers, runs during simulation ticks, and keeps behavior focused and simple.

Systems must avoid conflicting movement updates.

Each entity should perform only one movement behavior per tick unless a system explicitly uses multi-step catch-up behavior.

---

## Game Loop

The game loop runs continuously while enabled, executes systems in order, updates `GameState`, and supports idle/AFK simulation.

Current high-level order:

1. Advance simulation timing and clear expired combat feedback, skill runtime state, and frame movement planning
2. Update teleport system
3. If teleport is active or map transition happened, record telemetry and stop the tick early
4. Update POI system
5. Update healing fountain system
6. If auto mode is enabled, update role behavior
7. If auto mode is enabled, update prototype skills
8. If leader intent, auto mode, or teleport POI movement is active, update party formation movement
9. If auto mode is enabled, reserve exploration movement
10. Update defender behavior
11. If auto mode is enabled, update exploration
12. Update follow behavior
13. Update enemy AI
14. Update attacks
15. Update drop system
16. Update gathering
17. Update skill shield block positions
18. Idle autonomous party members when no POI or leader intent is active
19. Record debug telemetry


Movement conflicts are guarded with per-tick moved entity ids, movement intent records, path records, and reserved positions.

---

## Movement

Movement rules:

- top-down 2D
- numeric positions
- fixed step movement toward targets
- no entity stacking
- resources and living entities block movement
- walls block movement when map data exists
- map bounds apply when map data exists
- party members may pass through each other in some party movement cases
- movement reservations prevent conflicts
- swap handling exists for party movement edge cases
- failed movement is tracked per tick
- pathfinding is used when map data exists and direct movement is blocked or unsuitable
- fallback movement is attempted when direct/path movement fails

Movement helpers live primarily in `state.ts`.

Navigation helpers live in `navigation.ts`.

If movement logic grows significantly, pathing and collision helpers may be moved to dedicated modules, but no restructure is required now.

---

## Navigation

Navigation is implemented in `navigation.ts`.

Current navigation supports baking a navigation grid from map walls, walkable cell checks, wall-adjacent movement cost, A-style path search to one of several goals, bounded navigation distance checks, nearest reachable navigation position search, and conversion from continuous positions to rounded navigation nodes.

Current navigation uses four-direction neighbors: east, west, south, and north.

Navigation is used by movement, targeting, exploration, and slot selection helpers.

Navigation remains a simple prototype pathing system and should not become a complex pathfinding framework unless explicitly requested.

---

## Party Movement

Party movement is simple and leader-centered.

`partyFormationSystem.ts` currently owns reading leader intent, selecting a target position, deciding travel or combat phase, assigning travel follow targets, assigning shared combat targets, moving the leader toward the point of interest, moving followers toward the leader, and clearing completed movement or combat state.

Current party movement does not use strict formation slots.

The party leader moves toward the point of interest only when the party is cohesive.

Followers move toward the leader when outside follow distance.

Busy gatherers and direct-commanded members are excluded from normal party movement.

Party movement can also guide the party toward a teleport point when a teleport POI is active.

---

## Party Cohesion

Party cohesion is currently based on simple distance from the leader.

A party member counts as cohesive when it is the leader or close enough to the leader.

Gatherers are excluded from cohesion while actively gathering a valid resource.

A gatherer rejoins normal cohesion when not actively gathering and close enough to rejoin party behavior.

Direct-commanded members are excluded from autonomous cohesion behavior.

---

## Follow System

`followSystem.ts` keeps autonomous followers near the current party leader.

A follower may move when it is a party member, is in follow state, is not the leader, is not direct-commanded, is not a busy gatherer, has not already moved this tick, and is outside follow leash distance.

Followers that are far away may take extra catch-up steps.

---

## Role System

`roleSystem.ts` assigns autonomous role targets when party members are available for role behavior.

Role behavior does not apply when the entity is not a party member, is direct-commanded, or is already doing a non-interruptible current action.

Current role behavior:

- Fighters follow during travel and attack the leader's combat target when available
- Gatherers search for resources and gather when possible
- Supports avoid overriding travel movement and may attack the leader's target when not traveling
- Defenders enter defend behavior as companions
- None has no special autonomous role target

Skill usage is handled separately by `skillSystem.ts`, but role preferences influence skill scoring through `skillRolePreferences.ts`.

---

## Role Profiles

`roleProfiles.ts` centralizes role metadata and tuning.

Current profile fields include:

- `positionBias`
- `followDistance`
- `aggression`
- `taskCommitment`
- `riskTolerance`
- `movementPriority`
- `cooldownUsage`
- `resourceSpending`

Current tuning fields include:

- `engageRange`
- `chaseLimit`
- `leashDistance`
- `interruptBuffer`
- `dangerThreshold`
- `protectionRadius`
- support health threshold placeholders
- `resourceSearchRange`
- `combatAssistRange`

Role profiles should remain data-focused.

---

## Defender System

`defendSystem.ts` owns defender-specific behavior.

Current defender behavior:

- defenders guard near the leader
- defenders use leader intent to choose a guard position
- defenders can stand ahead or to the side of leader movement
- defenders target the leader's enemy target
- defenders can intercept nearby enemies threatening the leader or party
- defenders attack in melee range
- defenders may cause the leader to wait briefly so they can intercept
- defenders avoid chasing too far away from the leader

Defender behavior is skipped during active party travel movement.

Direct-commanded defenders are not controlled by autonomous defend behavior.

Aegis shield-block skill behavior is handled by the prototype skill system, not by the defender system directly.

---

## Attack System

`attackSystem.ts` owns combat execution.

Current attack behavior:

- attackers require a valid combat target
- attackers move toward targets if out of range
- attackers can select attack slots around a target
- attackers attack when in range and cooldown is ready
- companion basic attacks use the prototype attack range
- enemies may use archetype or entity-specific attack ranges
- enemies may use entity-specific attack cooldowns
- attackers can take a small final positioning step when just outside range
- damage is applied directly
- prototype skill damage modifiers can increase damage
- shield blocks can block incoming enemy attacks
- defeated targets enter dead state
- enemies attacked by party members fight back
- party members may assist nearby party combat targets
- party protection is triggered when enemies damage party members
- party members gain XP when enemies are defeated by party attacks
- enemy defeats can progress prototype quests
- enemy defeats can trigger prototype drop rolls


Current basic attack constants:

- `ATTACK_RANGE = 1`
- `ATTACK_DAMAGE = 1`
- `ATTACK_COOLDOWN_MS = 1000`
- `TARGET_SWITCH_DISTANCE = 6`

Combat movement order uses role priority for party members.

---

## Enemy Archetypes

`enemyArchetypes.ts` owns lightweight prototype enemy tuning data.

Current enemy archetype ids:

- `slime`
- `cave_bat`
- `forest_spider`
- `goblin_scout`
- `goblin_thrower`
- `bog_imp`
- `stone_crawler`
- `thorn_shaman`
- `ash_wisp`
- `mossling`
- `wolf`
- `orc`

Current enemy archetype data may define:

- display name
- temperament
- combat style
- target preference
- level
- max health
- attack cooldown
- XP reward override
- detection range
- attack range

Enemy archetypes are prototype tuning records. They are not final bestiary content, faction design, encounter design, or production AI behavior trees.




## Enemy AI System

`enemyAISystem.ts` owns enemy autonomous targeting.

Current enemy behavior:

- passive enemies do not seek combat targets on their own
- passive enemies may wander near their home position
- aggressive enemies search for nearby party targets
- enemy archetypes can define detection range and target preference
- target preferences currently support closest, leader, and lowest-health party member
- enemies with valid targets enter or remain in attack state
- enemies clear invalid targets
- enemies attacking party members trigger party protection
- bound enemies cannot chase targets while out of attack range
- enemies respect home roam leash and attack leash distances
- enemies record lightweight target decision reasons for debug telemetry

Current enemy detection range:

- `ENEMY_DETECTION_RANGE = 5`

---

## Party Protection

`partyProtectionSystem.ts` responds when a party member is attacked.

Current behavior:

- leader intent switches to attack the attacker
- nearby idle/follow party members may switch to attack the attacker
- direct-commanded party members are not overridden
- busy gatherers are not pulled by distant threats
- protection requires party members to be close enough to the attacked member
- `protectLeader` currently aliases `protectPartyMember`

---

## Gathering System

`gatherSystem.ts` owns gathering execution.

Current gathering behavior:

- gatherers require a valid resource target
- gatherers move toward resources when out of range
- gatherers gather when in range and cooldown is ready
- resource durability is reduced
- resource yields are routed through prototype inventory helpers
- depleted resources become invalid
- gatherers return to follow when their target is depleted or invalid
- resources limit how many gatherers may gather them at once

Current gathering constants:

- `GATHER_RANGE = 1`
- `GATHER_COOLDOWN_MS = 1000`
- `GATHERER_PARTY_RETURN_DISTANCE = 15`

Gatherers with autonomous gatherer behavior may stay committed to a resource task unless it becomes invalid or unsafe by current checks.

---

## Exploration System

`explorationSystem.ts` owns current auto-exploration behavior.

Current exploration behavior:

- only runs when auto mode is enabled
- requires map/debug map data
- records explored positions for autonomous entities
- avoids active resources and walls
- finds nearby enemies before unexplored positions
- sets leader intent to attack when an enemy target is found
- otherwise sets leader intent to explore toward the nearest reachable unexplored position
- does not run movement while party formation has an active target

Current auto enemy target radius:

- `AUTO_ENEMY_TARGET_RADIUS = 48`

Exploration still uses explored position records named `exploredTiles` in code.

---

## Resources

Resources are entities.

Current resource fields:

- `resourceType`
- `durability`
- `maxDurability`
- `quantity`
- `maxGatherers`
- `isDepleted`

Current resource types:

```ts
type ResourceType = "wood" | "ore" | "herb";
```

Gathering reduces durability.

When durability reaches zero, quantity decreases, resource yield is routed through prototype inventory helpers, durability resets if quantity remains, and the resource becomes depleted when quantity reaches zero.

## Prototype Inventory, Wallet, Drops, and Merchant Exchange

Prototype inventory game logic lives under `client/src/game/`.

Current inventory modules include:

- `items.ts`
- `inventory.ts`

Inventory state is stored on `GameState` as shared party state.

Inventory is slot-based with a temporary starting capacity of 10 slots.

The shared prototype wallet is stored on `GameState` as `wallet`.

Wallet logic lives in `wallet.ts`.

Current currency id:

- `crowns`

Currency does not use inventory slots.

Enemy drop logic lives in:

- `dropTables.ts`
- `dropSystem.ts`

Drops roll by enemy type, create short-lived drop visual events, and route completed drops into shared inventory. Drops do not create persistent ground loot.

Merchant quick exchange logic lives in `merchant.ts`.

Current merchant behavior:

- identifies Merchant NPCs by `npcRole: "merchant"`
- finds eligible parts marked for quick exchange
- removes eligible parts from shared inventory
- adds Crowns to the shared wallet
- records merchant and wallet telemetry

This prototype inventory/wallet/drop/merchant layer does not include bank storage, persistent ground loot, consumable item effects, full selling, buying, shops, crafting, trading, save/load, backend persistence, full wallet UI, full equipment economy, rarity, affixes, upgrades, durability, sockets, set bonuses, or item comparison.


## Prototype Equipment

Prototype equipment game logic lives under `client/src/game/`.

Current equipment modules include:

- `equipmentTypes.ts`
- `equipmentRules.ts`
- `equipmentSystem.ts`

Companion equipment is stored on the companion entity as `equipment`.

Current equipment slots are:

```ts
type EquipmentSlot =
  | "head"
  | "chest"
  | "legs"
  | "gloves"
  | "boots"
  | "mainHand"
  | "offhand"
  | "accessory1"
  | "accessory2";
```

Current equipment kinds are:

```ts
type EquipmentKind = "weapon" | "offhand" | "armor" | "accessory";
```

Current weapon types are:

```ts
type WeaponType =
  | "training_sword"
  | "one_handed_sword"
  | "one_handed_mace"
  | "claw_gauntlets"
  | "thorn_whip"
  | "bow"
  | "orb"
  | "rune_lantern"
  | "holy_mace";
```

Current offhand types are:

```ts
type OffhandType =
  | "shield"
  | "talisman"
  | "holy_lantern"
  | "sacrificial_dagger";
```

Current armor types are:

```ts
type ArmorType =
  | "head_armor"
  | "chest_armor"
  | "legs_armor"
  | "gloves_armor"
  | "boots_armor";
```

Current accessory type is:

```ts
type AccessoryType = "accessory";
```

Equipment rules validate slot, class permission, both-hands occupancy, inventory removal, inventory return on unequip, and telemetry results.

Equipment remains gameplay-facing data only. It must not require sprite swaps, weapon anchoring, paper-doll rendering, or visible attachment systems.

Current prototype class-restricted equipment items include:

- Beginner: Training Sword
- Blade: Iron Sword
- Aegis: Training Mace, Wooden Shield
- Hunter: Short Bow
- Beast: Claw Gauntlets
- Elementalist: Apprentice Orb
- Runecaster: Rune Lantern, Simple Talisman
- Lightbearer: Holy Mace, Holy Lantern
- Penitent: Thorn Whip, Sacrificial Dagger

Current shared prototype armor and accessory items include:

- Cloth Cap
- Padded Chest
- Padded Legs
- Cloth Gloves
- Travel Boots
- Plain Charm

Current enemy-drop prototype armor items include:

- Worn Cap
- Worn Tunic
- Worn Pants
- Worn Gloves
- Worn Boots
- Reinforced Helm
- Reinforced Armor
- Reinforced Legguards
- Reinforced Gloves
- Reinforced Boots

Current prototype equipment stat modifiers may include:

- attack
- defense
- maxHealth
- block
- evasion
- magicPower
- healingPower

Short Bow and Claw Gauntlets currently occupy both hands as prototype exceptions.



## Map Data

Current map data is debug/prototype map data.

Current map fields:

```ts
type GameMap = {
  id?: DebugMapId;
  displayName: string;
  debugName: string;
  columns: number;
  rows: number;
  walls: Position[];
  teleports: DebugTeleportPoint[];
  healingFountains: HealingFountain[];
  navigationGrid?: NavigationGrid;
};
```


Current debug map ids:

```ts
type DebugMapId = "hub" | "map-1" | "map-2";
```

Current readable map names:

- `hub`: Harbor Union Bastion
- `map-1`: First Wild Map
- `map-2`: Second Wild Map

Maps currently support dimensions, wall positions, baked navigation grid, companion start positions, enemy start positions, resource start data, hub NPC placeholder data, healing fountain data, display/debug names, and prototype teleport points.


Map data is still development/prototype data and should not define final world content.


---

## Teleport System

`teleportSystem.ts` implements prototype/debug map transitions between current debug maps.

This is not the final zone system.

Current prototype/debug routes:

- `hub` -> `map-1`
- `map-1` -> `hub`
- `map-1` -> `map-2`
- `map-2` -> `map-1`

Current teleport behavior:

- uses a small debug map teleport table
- can be triggered by player/debug action or AI conditions
- can set a teleport point as party movement intent
- auto mode may select eligible teleport points after living enemies are cleared
- party members rally to the teleport point
- teleport completes when living party members are within teleport range
- on completion, current map changes to the teleport target map
- map-local enemies, resources, hub placeholders, explored tiles, movement planning, formation state, combat feedback, skill visuals, and follow trails are reset or rebuilt for the new map
- companion progression, class, role, level, XP, health, party identity, and party order are preserved

Current active teleport state:

```ts
type ActiveTeleport = {
  id: string;
  position: Position;
  range: number;
  sourceMapId: DebugMapId;
  targetMapId: DebugMapId;
  triggeredBy: "ai" | "player";
};
```

Do not expand this into full zones, persistent world streaming, or a final teleport network unless explicitly requested.


---

## Combat Feedback

Combat feedback events are stored in game state.

Current feedback event types:

```ts
type CombatFeedbackType = "attack" | "damage" | "death" | "gather";
```

Feedback events expire automatically.

Current feedback duration:

- `COMBAT_FEEDBACK_DURATION_MS = 900`

Combat feedback may be used by attacks, gathering, skill effects, and temporary UI feedback.

---

## Visual Assets

Visual assets are currently UI-facing and are not part of core simulation rules.

Current visual asset files:

- `client/src/visualAssets.ts`
- `client/src/assetIcons.ts`
- `client/src/SpriteAnimation.tsx`

Current public asset path root:

- `client/public/Asserts/`

Current generated asset groups include:

- `Asserts/Generated/now-pack`
- `Asserts/Generated/map-wilderness`
- `Asserts/Generated/hub-floors`

Current sprite asset groups include:

- `Asserts/Characters/Test-Character`
- `Asserts/Characters/Test-Enemy`
- `Asserts/Characters/Test-Enemy2`
- `Asserts/Characters/Test-NPC`
- `Asserts/Characters/Prototype-Enemies`

Current companion visuals:

- companions use the test character sprite
- idle uses a single idle frame
- run uses directional frame sequences for north, south, west, and east

Current enemy visuals:

- Wolf-style enemies may use the test enemy sprite
- Orc-style enemies may use the Test-Enemy2 directional static sprites
- prototype enemy archetypes may use static generated archetype sprites
- fallback enemy visuals depend on current map/debug context

Current resource visuals use generated image icons by resource type.

Current NPC visuals:

- Quest Giver, Merchant, Smith, and Dog may use generated image icons
- Test Blade and Test Hunter may use Test-NPC image assets
- unsupported NPC visuals fall back to placeholder classes

Current map tile visuals:

- wilderness maps may use generated grass, tree, and bush image tiles
- the hub may use generated stone floor imagery for the city interior
- fallback floor and wall visuals use placeholder class names

Visual asset registry responsibilities include defining sprite frame lists, frame duration, entity visual mapping, sprite animation selection, image icon mappings, and placeholder class names.

Simulation logic must not depend on sprite assets.


---

## Debug Telemetry

Debug telemetry records simulation information for inspection.

Current telemetry can track target acquisition, target changes, formation changes, skipped targets, movement failure, attack start, damage dealt, entity death, gathering start, resource depletion, class changes, role changes, character XP awarded, character XP reduced, character level up, character XP skipped, inventory changes, equipment equip/unequip attempts, equipment equip/unequip results, equipment validation failures, teleport start, teleport completion, teleport skips, map transitions, POI selection, POI skips, quest dialog opening, quest acceptance, quest objective progress, quest objective completion, quest ready-to-turn-in state, quest reward validation, quest reward validation failure, quest reward claim start, quest reward Crowns, quest reward XP, quest reward item and equipment grants, quest turn-in, quest completion, quest unlocks, quest-driven teleport intent, enemy drop rolls, drop visual events, drop inventory routing, wallet currency changes, merchant interaction events, and merchant quick exchange results.



Telemetry snapshots may include tick, current map id, current map display name, current map debug name, active teleport id, active teleport source map, active teleport target map, teleport trigger source, entity id, kind, class id, role, state, position, target, command priority, character level, character XP, XP to next level, XP progress percent, last XP gained, movement result, reason, formation phase, formation slot data, target distance, intended position, blocker data, and navigation data.

Teleport/map transition telemetry may include previous map id, next map id, previous/next map display names, active teleport id, teleport source map, teleport target map, trigger source, entity positions before transition, entity positions after transition, and skip reason when available.


Prototype inventory telemetry may include:

- `item_add_attempt`
- `item_added`
- `item_add_partial`
- `item_add_failed_full`
- `item_removed`
- `inventory_stack_created`
- `inventory_stack_updated`
- `inventory_capacity_checked`

Inventory telemetry should remain development-only and may include tick, item id, item category, requested quantity, added quantity, removed quantity, overflow quantity, slot index, stack quantity before, stack quantity after, used slots, capacity, and source.


Debug telemetry should remain development-only.

Prototype equipment telemetry may include:

- `equipment_equip_attempt`
- `equipment_equipped`
- `equipment_equip_failed`
- `equipment_unequip_attempt`
- `equipment_unequipped`
- `equipment_unequip_failed`
- `equipment_inventory_return_failed`
- `equipment_invalid_class`
- `equipment_invalid_slot`

Equipment telemetry should remain development-only and may include tick, companion id, companion class id, item id, item display name, item category, target slot, equipment type, previous item id, result, reason, used inventory slots, and inventory capacity.


---

## Debug Utilities

Debug/testing helpers may exist for development:

- add/remove companions
- change roles
- change classes
- change party order
- set current leader
- reset health
- reset resources
- randomize positions
- debug telemetry recording/export
- debug maps
- explicit aggressive-enemy test setups
- prototype teleport/map transition testing

These should remain isolated from core systems and must not define final gameplay behavior.

---

## Current UI Responsibilities

The React UI currently may display and control map/debug map view, generated terrain tiles, party members, enemies, resources, NPCs, healing fountains, sprite animation, camera follow behavior, combat feedback, skill visual feedback, drop visual feedback, party selection, role changes, class changes, party order changes, leader changes, group/direct commands, inventory counters, wallet balance, inventory item details, prototype equipment slot state, prototype equipment equip/unequip commands, quest tracker, quest log, prototype quest reward text, quest turn-in error feedback, merchant quick exchange UI, merchant Buy/Sell placeholder panels, XP and level progress, party size limit, debug controls, and debug telemetry export.




UI should remain a consumer/controller of game state, not the owner of simulation behavior.


## Menu UI Technical Structure

The React UI may include a main menu and submenu system for party overview, party management, prototype inventory display, and prototype quest display.

Menu UI must remain in React components under `client/src/`.

Game logic must remain under `client/src/game/`.

React may:

- read current game state
- track selected menu state
- track selected companion UI state
- track selected management section UI state
- track selected quest UI state
- call existing game command/helper functions for supported actions
- display placeholder sections for future systems

React must not:

- define core simulation behavior
- duplicate role logic
- invent new role values
- define equipment rules, skills, formation, behavior settings, quest rules, merchant rules, wallet rules, or advanced inventory rules inside React components
- implement equipment UI beyond displaying game state and issuing commands to existing game logic unless explicitly requested

Current intended main menu views:

- Party
- Party Management
- Inventory
- Quests

Current intended Party Management sections:

- Role Select
- Equipment
- Full Stats
- Party Order placeholder
- Formation placeholder
- Skill Preferences placeholder
- Behavior Settings placeholder

Role Select must use the existing `PartyMemberRole` values:

```ts
type PartyMemberRole =
  | "defender"
  | "fighter"
  | "support"
  | "gatherer"
  | "none";
```

The Quests view may display prototype quest state and objective progress from game state.

The Inventory view may display wallet balance, but wallet and inventory rules must remain in game logic.

Merchant UI may call existing merchant helper functions, but must not define exchange rules inside React.


## World Structure Future Work

The final world is expected to be divided into zones/fields.

Future world systems may include:

- `zoneId` on entities
- teleport points connecting zones
- persistent zone state
- central hub and outward regions
- final map/zone content pipeline

Current `teleportSystem.ts` is only a prototype/debug map transition and should not be treated as the final zone system.

Do not implement full zones or final teleport networks unless explicitly requested.

---

## Future Expansion

Do not implement unless requested:

- full zone system
- persistent teleport network
- backend persistence
- networking/server authority
- full inventory/equipment economy beyond the current prototype shared party inventory
- full equipment economy beyond the current prototype equipment foundation
- equipment visuals, weapon anchoring, paper-doll rendering, or visible weapon swaps
- subclass progression
- full ability framework
- mana/resource cost system
- casting system
- advanced targeting system
- advanced aggro/threat systems
- advanced ranged combat
- advanced support mechanics
- production asset pipeline
- final world content pipeline
- full quest journal, dialogue system, quest reward economy, or production quest content beyond the prototype quest chain
- full shop, selling, buying, and merchant economy beyond prototype quick exchange
- persistent ground loot beyond prototype drop visual events and drop-to-inventory behavior
- final POI/world-routing framework beyond debug-map POI guidance
