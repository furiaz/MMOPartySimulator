# GTD.md

## Overview

This document defines the current technical structure of the game.

Design intent is defined in `GDD.md`. This document describes how that intent is represented in code.

The project follows a simulation-first architecture:

- game logic runs independently of the UI
- UI reads and displays game state
- UI issues commands into game logic
- systems update the world over time for idle/AFK play
- renderer code displays world state but does not own simulation behavior

---

## Core Architecture

The game is divided into:

- Game Logic: `client/src/game/`
- UI Layer: React components in `client/src/`
- World renderer: `client/src/worldRenderer/PixiWorldRenderer.tsx`
- Visual asset registry, image icon mappings, and sprite helpers: `client/src/visualAssets.ts`, `client/src/assetIcons.ts`, and `client/src/SpriteAnimation.tsx`

Game logic must not depend on React or PixiJS.

React may:

- display game state
- issue commands into game logic
- start and stop the simulation loop for development
- expose temporary debug controls
- host the PixiJS world renderer
- render temporary UI overlays from game state

PixiJS may render world visuals from game state, but must not own simulation behavior.

React and PixiJS must not contain core simulation rules.

---

## Folder Structure

Current game-logic implementation files include:

- `attackSlots.ts`
- `attackSystem.ts`
- `classes.ts`
- `commands.ts`
- `directCompanionCommands.ts`
- `combatResolver.ts`
- `companionCombat.ts`
- `dungeonSystem.ts`
- `consumables.ts`
- `debugMap.ts`
- `debugTelemetry.ts`
- `debugTools.ts`
- `defendSystem.ts`
- `defenderCombat.ts`
- `dropSystem.ts`
- `dropTables.ts`
- `enemyAISystem.ts`
- `enemyAoeChannelSystem.ts`
- `enemyArchetypes.ts`
- `enemyRespawnSystem.ts`
- `enemyScaling.ts`
- `enemyVariants.ts`
- `entities.ts`
- `entityGuards.ts`
- `equipmentRules.ts`
- `equipmentSystem.ts`
- `equipmentTypes.ts`
- `explorationSystem.ts`
- `followSystem.ts`
- `gameLoop.ts`
- `gatherSystem.ts`
- `gathererResourceReservation.ts`
- `healingFountainSystem.ts`
- `healthSystem.ts`
- `index.ts`
- `inventory.ts`
- `items.ts`
- `leveling.ts`
- `merchant.ts`
- `movementState.ts`
- `navigation.ts`
- `navigationClick.ts`
- `partyFormationSystem.ts`
- `partyIntentSystem.ts`
- `partyProtectionSystem.ts`
- `partySpacing.ts`
- `partySystem.ts`
- `partyTargetSystem.ts`
- `partyThreatSystem.ts`
- `performanceMetrics.ts`
- `poiResumeSystem.ts`
- `poiSystem.ts`
- `poiTypes.ts`
- `positionUtils.ts`
- `questGuideSystem.ts`
- `questSystem.ts`
- `questTypes.ts`
- `resurrectionSystem.ts`
- `roleProfiles.ts`
- `roleSystem.ts`
- `simulationTiming.ts`
- `skillMovement.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`
- `skillSystem.ts`
- `skillTargeting.ts`
- `subzoneSystem.ts`
- `skills.ts`
- `state.ts`
- `stats.ts`
- `targetSelection.ts`
- `testState.ts`
- `teleportSystem.ts`
- `teleportState.ts`
- `types.ts`
- `updateGame.ts`
- `wallet.ts`
- `worldWipeRecovery.ts`

Current tests live beside game-logic files as `*.test.ts`.

Do not restructure the project unless explicitly requested.

New helper modules may be added when they keep responsibilities clear and preserve the simulation-first boundary.

---

## Entity Model

Entities represent world objects and actors.

Current entity kinds:

```ts
type EntityKind = "companion" | "enemy" | "resource" | "npc";
```

The player is not represented as a world entity.

The player is the manager/controller issuing intent and commands to party members.

NPC entities are prototype placeholders for hub visuals, simple interactions, and quest guide behavior.

Current prototype NPC behavior is limited to Quest Giver quest interaction, Merchant quick exchange, fixed Merchant Buy stock, placeholder hub NPC display, and prototype quest NPC behavior for guide, rescue, repair, defend, route unlock, and elite-spawn objectives.

NPCs do not implement dialogue, full shops beyond fixed prototype Merchant Buy stock, crafting, recruitment, smithing, relationship behavior, or general follower behavior.

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
### Gathering Terminology

`Gatherer` means the `role: "gatherer"` party role.

`collector` means a companion whose current behavior is gathering or assigned to gather a resource while their role is not `"gatherer"`.

In technical notes, tickets, tests, telemetry analysis, and comments:

- use `Gatherer` only for the Gatherer role
- use `collector` for non-Gatherer-role companions in `state: "gather"` or assigned to a resource gather target
- use explicit wording such as `Defender collector` or `Fighter collector` when the role matters

`collector` is not a `PartyMemberRole`, not an entity kind, and not a new state. It is descriptive terminology for role/state combinations already represented by existing fields.

---

## Position Model

Positions use numeric `x` and `y` coordinates.

Movement is continuous-style step movement, not strict tile-by-tile movement.

Entities move toward target positions by a fixed step amount.

Current movement step constants live in `entities.ts`.

Current movement model supports:

- bounds checks
- wall checks
- collision checks
- movement reservations
- simple pathing
- path retry/backoff data
- fallback movement
- party pass-through in specific party movement cases
- party swaps in specific movement edge cases
- navigation and path performance metrics

Current collision behavior:

- most entities use a simple circular collision shape
- Beginner companions use a vertical capsule collision shape to better match their taller sprite
- collision shape data supports movement, interaction targeting, and debug overlay readability
- collision shapes must not define class balance, combat reach, or final sprite scale

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
- `naturalStats`
- `allocatedStats`
- `unspentStatPoints`
- `role`
- `partyOrder`
- `followTargetId`
- `defendPosition`
- `currentTargetId`
- `lastGatherAt`
- `gatherSpeed`
- `commandPriority`
- `equipment`
- `consumables`
- `consumableBuffs`
- `consumableBehavior`

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

Current responsibilities include storing entities, shared party prototype inventory, shared party wallet, current debug map id, optional map data, active teleport state, auto-mode state, World Travel target state, POI preferences, simulation tick/frame/time values, party leader id, leader handoff timing, party intent, leader intent compatibility state, prototype quest state, global/local POI intent, interrupted POI target state, explored positions, follow trails, movement planning, movement path cache, attack slot cache, defender wait/blocking state, party formation state, combat feedback, prototype skill runtime state, prototype skill visual events, prototype consumable use state, hub food warning state, flask recharge state, prototype drop visual events, resurrection channel/progress state, world-wipe recovery state, passive health regeneration timing, target dummy regeneration timing, debug options, and debug telemetry.

Current movement planning fields include:

- `failedMoveByEntityId`
- `movementFailureMsByEntityId`
- `movementFailuresByEntityId`
- `movementPathRetryAtMsByEntityId`
- `moveIntentsByEntityId`
- `reservedPositionsByEntityId`
- `movementPathsByEntityId`
- `attackSlotCacheByEntityId`
- `movementDecisionsByEntityId`
- `lastPositionsByEntityId`

Current party intent, POI, and travel fields include:

- `partyIntent`
- `leaderIntent`
- `worldTravelTargetMapId`
- `globalPoiIntent`
- `localPoiTarget`
- `lastPoiDecision`
- `interruptedPoiTarget`
- `poiPreferences`

`partyIntent` is the current centralized party behavior intent model.

`leaderIntent`, `globalPoiIntent`, `localPoiTarget`, `worldTravelTargetMapId`, and `lastPoiDecision` remain synchronized compatibility fields for systems and UI that still read those values directly.

Current POI preferences include:

- `stayInMap`
- `searchScope`

`stayInMap` currently represents the Stay in Subzone prototype control.

When enabled, POI and autonomous gatherer selection use the leader's current subzone as a local boundary where supported.

Current prototype consumable runtime fields include:

- `consumableUsesByCompanionId`
- `hubDepartureFoodWarning`
- `flaskRechargeEnemyKillCounter`
- `flaskRechargeCountedEnemyDefeats`

Current prototype skill runtime fields include:

- `skillMarksByEnemyId`
- `skillSelfBuffsByCompanionId`
- `skillGatherBuffsByCompanionId`
- `skillBindsByEnemyId`
- `skillShieldBlocksById`
- `skillCooldownsByCompanionId`
- `skillVisualEvents`

Current resurrection and recovery fields include:

- `resurrectionProgressByCompanionId`
- `resurrectionChannelsByHelperId`
- `worldWipeRecovery`

Current health runtime fields include:

- `lastHealthRegenAtByCompanionId`
- `lastTargetDummyRegenAtByEnemyId`

Current debug option fields include:

- `superSpeedEnabled`
- `superExpEnabled`
- `deepNavigationTelemetryEnabled`

State helpers should remain low-level and safe.

Systems should own behavior decisions.

---

## Classes

Classes represent party member capabilities.

Roles represent behavior priorities.

Class data stays in game logic under `client/src/game/`.

Class definitions live in `classes.ts`.

Current class path type:

```ts
type ClassPath = "honor" | "primal" | "arcane" | "holy";
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

Weapons are gameplay-facing stat/data modifiers, not sprite identity.

Equipment rules must not require React rendering logic, sprite swaps, weapon anchoring, or visible attachment systems.

Current class implementation is lightweight and structural.

Classes currently provide prototype skills through `skills.ts`.

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

`xpReward` is stored on individual enemy entities only as an explicit spawn-level override.

`xpReward` is not part of `EnemyArchetypeDefinition`.

Current leveling constants:

- `MAX_CHARACTER_LEVEL = 200`
- `BEGINNER_CLASS_UNLOCK_LEVEL = 10`

Current leveling behavior:

- enemies grant XP when killed by party combat or prototype skills
- XP is granted to living companions
- dead companions do not receive XP
- max-level companions do not receive XP
- XP reward defaults from the same-level enemy XP table if an individual enemy `xpReward` override is not set
- XP to next level uses anchored progression values with interpolation
- same-level enemy XP uses anchored progression values with interpolation
- companion XP rolls over through multiple level-ups if enough XP is gained
- max-level companions have `characterXp` reset to 0
- level-ups may apply automatic natural-stat growth
- level-ups may grant unspent stat points after base class progression begins
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

Leveling is a prototype progression system.

It should remain simple unless expanded intentionally.

---

## Skills Prototype

Skills are simple class-based actions used to extend existing behavior.

Skill definitions live in `skills.ts`.

Skill selection and execution live in:

- `skillSystem.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`
- `skillTargeting.ts`
- `skillMovement.ts`

Current skill runtime is prototype-only.

It is not a full ability framework.

Current skill ids include Beginner prototype skills and base class prototype skills:

```ts
type SkillId =
  | "throw_rock"
  | "kick"
  | "guard_up"
  | "first_aid"
  | "deep_breath"
  | "rally_call"
  | "field_hands"
  | "quick_step"
  | "sweeping_strike"
  | "guard_wall"
  | "mark_target"
  | "feral_surge"
  | "elemental_bolt"
  | "binding_rune"
  | "light_mend"
  | "penitents_gift";
```

Current Beginner prototype skills:

- Beginner: Throw Rock
- Beginner: Kick
- Beginner: Guard Up
- Beginner: First Aid
- Beginner: Deep Breath
- Beginner: Rally Call
- Beginner: Field Hands
- Beginner: Quick Step

Current base class prototype skills:

- Blade: Sweeping Strike
- Aegis: Guard Wall
- Hunter: Mark Target
- Beast: Feral Surge
- Elementalist: Elemental Bolt
- Runecaster: Binding Rune
- Lightbearer: Light Mend
- Penitent: Penitent's Gift

Current skill effects may include direct damage, lunge damage, sweeping/splash damage, taunt, enemy mark bonus damage, self damage buff, ally damage buff, gathering speed buff, quick-step movement, shield block, bind, heal, self-cost heal, beginner fallback damage, beginner emergency recovery, beginner defensive survival, beginner support, and beginner mobility.

Current skill rules:

- skills are tied to classes
- roles determine preferred skill usage
- skill tags affect role scoring
- skill selection must validate target, range, cooldown, companion state, and current context
- skill movement helpers must validate map bounds, walls, active resources, and blocking entity collision before moving companions
- direct-commanded companions do not use autonomous prototype skills
- dead companions do not use skills
- skills have a shared prototype cooldown
- current shared prototype cooldown is 5000ms
- skill ranges use numeric values
- runtime skill effects expire through game-state cleanup
- skill visuals are represented through temporary visual events
- skill feedback may use combat feedback events
- React UI must not define skill behavior or skill scoring

Current skill visual event types:

```ts
type SkillVisualType =
  | "slash"
  | "projectile"
  | "red_flash"
  | "heal";
```

Current skill runtime state includes marks, self buffs, gather buffs, binds, shield blocks, cooldowns, and visual events.

Do not expand this into a full ability framework unless explicitly requested.

Do not add mana, casting, advanced targeting, equipment requirements, complex cooldown systems, skill trees, hotbars, or player-triggered active skill input unless explicitly requested.

---

## Prototype Companion Stats

Prototype companion stats are implemented in `stats.ts`.

Current primary stat ids are:

```ts
type PrimaryStatId =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom";
```

Companions store:

```ts
naturalStats: CompanionPrimaryStats;
allocatedStats: CompanionPrimaryStats;
unspentStatPoints: number;
```

Current derived stat shape is:

```ts
type CompanionDerivedStats = {
  attack: number;
  defense: number;
  maxHealth: number;
  evasion: number;
  block: number;
  magicPower: number;
  healingPower: number;
  magicDefense: number;
  accuracy: number;
  criticalChance: number;
  criticalDamage: number;
  healthRegen: number;
};
```

Current stat constants include:

- `MINIMUM_ACTUAL_PRIMARY_STAT = 1`
- `STARTING_PRIMARY_STAT_VALUE = 1`
- `BEGINNER_STAT_GROWTH_PER_LEVEL`
- `BASE_CLASS_AUTOMATIC_STAT_POINTS_PER_LEVEL = 5`
- `PLAYER_STAT_POINTS_PER_LEVEL_AFTER_CLASS_UNLOCK = 2`
- `MAX_ALLOCATED_PRIMARY_STAT_POINTS_PER_STAT = 99`

Current stat helpers include:

- `createDefaultNaturalCompanionStats`
- `createEmptyAllocatedCompanionStats`
- `getCompanionActualStats`
- `getCompanionDerivedStats`
- `applyCompanionLevelUpStatGrowth`
- `allocateCompanionStatPoint`
- `syncCompanionDerivedMaxHealth`

Natural stats represent starting and automatic level-up growth.

Allocated stats represent player-assigned stat points.

Unspent stat points represent available allocation points.

Equipment and consumable buffs may provide primary stat modifiers or derived stat modifiers.

Primary stat modifiers are included when calculating actual companion stats.

Derived stat modifiers are included when calculating derived combat stats.

Derived max health is synchronized onto companions when relevant state changes occur.

Stat allocation is game logic, not React-only state.

React may call supported allocation helpers and display allocation results, but must not define stat formulas.

Do not add final balance formulas, respec systems, advanced scaling, secondary class history, or backend persistence unless explicitly requested.

---

## Combat Resolution

Prototype combat resolution uses shared game-logic helpers.

Combat-facing companion values should route through `getCompanionDerivedStats` where supported.

Current derived stat combat behavior may include:

- physical damage using Attack
- magic damage using Magic Power
- healing using Healing Power
- damage mitigation using Defense or Magic Defense
- hit checks using Accuracy and Evasion
- active shield block support
- passive block support
- critical hit chance and critical damage
- derived max health
- passive health regeneration

`combatResolver.ts` owns shared combat resolution helpers for attacks, mitigation, evasion, block, critical hits, minimum damage, healing calculations, and combat telemetry.

`healthSystem.ts` owns derived max-health synchronization and passive companion health regeneration.

Auto attacks, defender attacks, prototype damage skills, splash damage, magic damage, healing skills, fountain healing, debug health restore, and UI health displays should use derived stat data where that behavior is implemented.

Combat formulas are prototype rules.

Combat formulas should stay simple and centralized in game logic.

React must not define combat formulas, stat formulas, hit rules, block rules, crit rules, healing rules, or regeneration rules.

---

## Commands

Commands can be direct entity commands, party member commands, party member group commands, leader-selection commands, and party-order commands.

Rules:

- party orders update party intent and assign autonomous member states from that shared intent
- direct companion commands are stored separately from party intent
- direct companion commands can target attack, gather, or move behavior for one companion
- direct companion commands override autonomous behavior for the targeted companion
- direct companion commands do not automatically change other companions
- direct companion commands cancel resurrection channeling for the commanded helper
- direct companion commands reject invalid sources, invalid targets, blocked move positions, targets beyond the direct-command leash, and full resource gather slots
- direct gather commands reserve resource capacity before autonomous collectors
- direct gather commands may temporarily self-defend against personal threats without clearing the gather command
- completed or canceled direct commands start a short rejoin grace period before normal autonomous behavior fully resumes
- direct move commands clear stale movement planning for the commanded companion

Current command priority values:

```ts
type CommandPriority = "autonomous" | "direct";
```
Current direct companion command constants:

- `DIRECT_COMMAND_MAX_PATH_DISTANCE = 30`
- `DIRECT_COMMAND_REJOIN_GRACE_MS = 1500`

Current command types use entity states except `dead`.

---

## Party Intent and Leader Intent

Party execution intent uses the same shape as leader intent:

```ts
type LeaderIntent = {
  type: "attack" | "move" | "gather" | "explore";
  targetId: string | null;
  targetPosition: Position | null;
  source?: "player" | "ai";
};

type PartyExecutionIntent = LeaderIntent;
```

Current party intent is stored as:

```ts
type PartyBehaviorMode =
  | "idle"
  | "travel"
  | "engage"
  | "defend"
  | "regroup"
  | "resurrect";

type PartyIntentSource = "player" | "ai";

type PartyRecoveryAction =
  | "fight_near_dead_leader"
  | "resurrect";

type PartyRecoveryIntent = {
  action: PartyRecoveryAction;
  deadCompanionId: string;
  threatEnemyIds: string[];
};

type PartyIntentSnapshot = {
  executionIntent: PartyExecutionIntent | null;
  globalPoiIntent: GlobalPoiIntent | null;
  localPoiTarget: LocalPoiTarget | null;
  worldTravelTargetMapId: DebugMapId | null;
  lastPoiDecision?: PoiDecisionState;
};

type PartyIntent = PartyIntentSnapshot & {
  mode: PartyBehaviorMode;
  source: PartyIntentSource;
  queuedIntent?: PartyIntentSnapshot | null;
  recoveryIntent?: PartyRecoveryIntent | null;
};
```

`partyIntent` is used by party movement, role behavior, combat targeting, exploration, defender positioning, POI targeting, teleport movement, resurrection recovery, and self-defense recovery.

`leaderIntent` remains synchronized from `partyIntent.executionIntent` for compatibility with existing systems and UI.

Party intent may be cleared when a point of interest is reached, combat ends, map transition completes, teleport completes, or recovery intent finishes.

`partyIntentSystem.ts` owns current recovery and self-defense intent behavior. It can queue existing party intent, switch to resurrection or nearby-threat combat, and restore queued intent when recovery ends.

## Prototype Quests and POIs

Prototype quest definitions live in `questSystem.ts` and quest types live in `questTypes.ts`.

Quest NPC, escort, rescue, repair, defend, route unlock, and elite-spawn objective helper behavior lives in `questGuideSystem.ts`.

Quest state is stored on `GameState` as:

```ts
quests: Record<QuestId, QuestState>;
```

Current quest ids are:

- `clear_the_shore`
- `outfit_the_expedition`
- `stolen_field_supplies`
- `break_lower_shore_blockage`
- `scout_rise_samples`
- `rescue_the_grove_runner`
- `hold_the_field_cache`
- `open_wolf_causeway`

Current quest display names are:

- `clear_the_shore`: Secure the Landing
- `outfit_the_expedition`: Outfit the Expedition
- `stolen_field_supplies`: Stolen Field Supplies
- `break_lower_shore_blockage`: Break the Lower Shore Blockage
- `scout_rise_samples`: Scout Rise Samples
- `rescue_the_grove_runner`: Rescue the Grove Runner
- `hold_the_field_cache`: Hold the Field Cache
- `open_wolf_causeway`: Open the Wolf Causeway

Current quest objective types are:

```ts
type QuestObjectiveType =
  | "talk_to_poi"
  | "reach_poi"
  | "defeat_enemy_count"
  | "collect_enemy_quest_drop_count"
  | "gather_item_count"
  | "equip_item"
  | "equip_flask"
  | "buy_merchant_equipment"
  | "inspect_poi"
  | "repair_poi"
  | "defend_area"
  | "rescue_npc"
  | "guide_npc_to_poi"
  | "unlock_route"
  | "defeat_elite"
  | "return_to_poi";
```

Current implemented quest objective behavior includes defeat counts, enemy quest drop counts, gather counts, reach POIs, inspect POIs, guide NPC escort objectives, rescue NPC objectives, repair POIs, defend areas, route unlocks, elite defeat objectives, equipment equip checks, flask equip checks, and Merchant Buy equipment checks.

Current prototype quest chain:

- `clear_the_shore` unlocks `outfit_the_expedition`
- `outfit_the_expedition` unlocks `stolen_field_supplies`
- `stolen_field_supplies` unlocks `break_lower_shore_blockage`
- `break_lower_shore_blockage` unlocks `scout_rise_samples`
- `scout_rise_samples` unlocks `rescue_the_grove_runner`
- `rescue_the_grove_runner` unlocks `hold_the_field_cache`
- `hold_the_field_cache` unlocks `open_wolf_causeway`
- `open_wolf_causeway` unlocks `find_slimeward_camp`

Current quest rewards may include:

- Crowns
- character XP
- inventory item rewards
- equipment item rewards

Merchant interaction is gated by quest progress where implemented.

Merchant Buy can be locked until the equipment tutorial flow allows it.

`questGuideSystem.ts` currently owns prototype quest NPC, rescue, repair, defend, route unlock, and elite-spawn objective helpers.

Current quest objective helper behavior:

- active quest NPCs are created from quest objective data
- guide and rescue NPCs use objective-provided ids, display names, start positions, and target positions
- guide and rescue NPCs spawn only on the target map while their objective is active and incomplete
- guide NPC escort movement starts after leader contact
- guide NPCs pause when no companion is within escort range or nearby living enemies are present
- rescue objectives complete when the leader reaches the NPC after nearby enemies are cleared
- repair objectives progress while a party member or quest guide NPC is near the target and not targeted by an enemy
- defend objectives start from a nearby repair actor, spawn quest enemy waves, and use repair progress as the defense timer
- defeat elite objectives ensure the configured elite quest enemy is spawned
- unlock route objectives complete the current route objective when active

The quest guide and related quest objective helpers are prototype systems.

They must not become a general follower, recruitment, companion NPC, production escort, final event scripting, or final quest framework unless explicitly requested.
POI selection types live in `poiTypes.ts`.

Current POI categories are:

- `npc`
- `quest`
- `combat`
- `resource`
- `teleport`
- `exploration`
- `idle`
- `event`

`poiSystem.ts` selects global quest intent and local map targets for auto-mode behavior.

POI selection should evaluate progression targets before generic map activity.

Current intended POI priority order:

1. active World Travel route target
2. active quest objective target on the current map
3. ready quest turn-in target
4. available quest acceptance target on the current map
5. quest-required prototype teleport when the active objective is on another reachable prototype map
6. hub Merchant quick exchange when eligible junk is available
7. reachable wild combat target when combat fallback is relevant
8. reachable wild resource target when gathering fallback is relevant
9. reachable exploration or inspect target
10. safe idle hub point

POI selection should skip targets that are invalid, unreachable, depleted, dead, completed, locked, already satisfied, reserved by autonomous gatherer work, blocked by Stay in Subzone rules, or not relevant to the current map.

POI selection may score candidates by priority, path distance, fallback score, nearby-resource bonus, progressive fallback, local target preference, and stable-target switching rules.

Wild POI selection may reuse a valid target briefly before reevaluating.

Active quest resource POIs may use a longer short commitment window than generic wild fallback POIs.

POI selection should record debug telemetry for selected POIs and skipped POIs where useful.

The POI system may set leader intent toward quest givers, combat targets, resources, exploration points, inspect points, escort targets, idle hub points, or prototype teleports.

`poiResumeSystem.ts` can capture an interrupted POI target when combat interrupts travel, gathering, or world-route intent.

It may restore that target after combat ends if the map still matches, the target is still valid, no live party aggro remains, and no blocking direct party command exists.

The POI system must remain a prototype debug-map guidance layer and must not become the final world-routing, dialogue, or quest content pipeline unless explicitly requested.

## Gatherer Resource Reservation

`gathererResourceReservation.ts` coordinates autonomous gatherer resource targeting.

Current responsibilities include:

- building a per-update resource work context
- reserving valid resources for autonomous gatherers
- respecting resource `maxGatherers`
- avoiding autonomous gatherer conflicts with party-level gather intent
- caching gatherer target checks during an update
- caching resource reachability checks
- keeping gatherer work within the leader's subzone when Stay in Subzone is enabled
- allowing gatherers to work within their leader leash when not restricted to the leader's subzone

This is prototype gatherer coordination.

It must not become a full job scheduler, worker assignment system, logistics system, or production resource economy unless explicitly requested.

---

## Systems

Systems operate on `GameState`.

Current systems include:

- Teleport System
- POI System
- POI Resume System
- Healing Fountain System
- Health System
- Consumable System
- Resurrection System
- Role System
- Skill System
- Party Formation System
- Exploration System
- Defend System
- Follow System
- Quest Guide System
- Enemy AI System
- Attack System
- Drop System
- Enemy Respawn System
- Gathering System
- Party Protection System
- World Wipe Recovery
- Debug Telemetry

Each system reads `GameState`, updates entities through state helpers, runs during simulation ticks, and keeps behavior focused and simple.

Systems must avoid conflicting movement updates.

Each entity should perform only one movement behavior per tick.

Catch-up and special movement should use speed multipliers or delta-scaled movement instead of repeated movement bursts unless explicitly documented.

---

## Game Loop

The game loop runs continuously while enabled, executes systems in order, updates `GameState`, and supports idle/AFK simulation.

Current high-level order:

1. Advance simulation timing and clear expired combat feedback, skill runtime state, and frame movement planning
2. Clear expired consumable buffs
3. Clear expired hub departure food warnings
4. Synchronize derived max health
5. Update consumable behavior
6. Update active consumable use
7. Synchronize derived max health again after consumable changes
8. Update world-wipe recovery
9. If world-wipe recovery is pending or changed maps, record telemetry and stop the tick early
10. Update party intent recovery
11. Update resurrection
12. Update party intent recovery again after resurrection changes
13. Update teleport system
14. If teleport is active or map transition happened, record telemetry and stop the tick early
15. Update direct companion commands
16. Build current resource work context
17. Update POI system
18. Update healing fountain system
19. Rebuild resource work context
20. If auto mode is enabled, update role behavior
21. If auto mode is enabled, update prototype skills
22. If party execution intent, auto mode, or teleport POI movement is active, update party formation movement
23. If auto mode is enabled, reserve exploration movement
24. Update defender behavior
25. If auto mode is enabled, update exploration
26. Update follow behavior
27. Update quest guide escort behavior
28. Update enemy AI
29. Update enemy AoE channel behavior
30. Update party intent self-defense
31. Update attacks
32. Update flask recharge from counted enemy defeats
33. Restore interrupted POI target when valid
34. Update passive health regeneration
35. Update target dummy health regeneration
36. Update drop system
37. Update enemy respawn system
38. Update gathering
39. Update skill shield block positions
40. Idle autonomous party members when no POI or leader intent is active
41. Record debug telemetry

Movement conflicts are guarded with per-tick moved entity ids, movement intent records, path records, attack slot cache records, and reserved positions.

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
- path retry/backoff data may delay repeated failed path attempts
- pathfinding is used when map data exists and direct movement is blocked or unsuitable
- fallback movement is attempted when direct/path movement fails
- navigation/path metrics may be recorded for performance inspection

Movement helpers live primarily in `state.ts`.

Navigation helpers live in `navigation.ts`.

Navigation click helpers live in `navigationClick.ts`.

If movement logic grows significantly, pathing and collision helpers may be moved to dedicated modules, but no restructure is required now.

---

## Navigation

Navigation is implemented in `navigation.ts`.

Current navigation supports baking a navigation grid from map walls, walkable cell checks, wall-adjacent movement cost, A-style path search to one of several goals, bounded navigation distance checks, nearest reachable navigation position search, and conversion from continuous positions to rounded navigation nodes.

Current navigation uses four-direction neighbors:

- east
- west
- south
- north

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

Resurrection-channeling members are excluded from autonomous cohesion behavior where supported.

---

## Follow System

`followSystem.ts` keeps autonomous followers near the current party leader.

A follower may move when it is a party member, is in follow state, is not the leader, is not direct-commanded, is not a busy gatherer, has not already moved this tick, and is outside follow leash distance.

Followers that are far away may use catch-up speed tuning, but should not rely on repeated multi-step movement bursts.

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
- `criticalHpPercent`
- `preferredHealHpPercent`
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

`attackSlots.ts` supports selecting attack slots around a target.

`companionCombat.ts` and `defenderCombat.ts` provide companion-facing combat helpers.

Current attack behavior:

- attackers require a valid combat target
- attackers move toward targets if out of range
- attackers can select attack slots around a target
- attackers attack when in range and cooldown is ready
- companion basic attacks use the prototype attack range
- enemies may use archetype or entity-specific attack ranges
- enemies may use entity-specific attack cooldowns
- attackers can take a small final positioning step when just outside range
- damage is resolved through `combatResolver.ts` using derived combat stats, mitigation, evasion, block, critical hits, and prototype skill damage modifiers
- prototype skill damage modifiers can increase damage
- shield blocks can block incoming enemy attacks
- defeated targets enter dead state
- enemies attacked by party members fight back
- party members may assist nearby party combat targets
- party protection is triggered when enemies damage party members
- party members gain XP when enemies are defeated by party attacks
- enemy defeats can progress prototype quests
- enemy defeats can trigger prototype drop rolls

Current basic attack constants and helpers:

- `DEFAULT_COMPANION_ATTACK_RANGE = 1`
- `ATTACK_COOLDOWN_MS = 2000`
- `ENEMY_ATTACK_WINDUP_MS = 500`
- `TARGET_SWITCH_DISTANCE = 6`
- enemy attack range may come from enemy entity data, enemy type data, enemy archetype defaults, or the default enemy attack range

Combat movement order uses role priority for party members.

---

## Enemy Archetypes

`enemyArchetypes.ts` owns lightweight prototype enemy archetype defaults and enemy type setup data.

Current enemy archetype ids are:

```ts
type EnemyArchetypeId =
  | "slime"
  | "bat"
  | "spider"
  | "goblin"
  | "imp"
  | "wolf"
  | "crawler"
  | "mossling"
  | "wisp"
  | "orc";
```

Current enemy type ids are:

```ts
type EnemyTypeId =
  | "slime"
  | "slimeward_heavy_slime"
  | "slimeward_pale_ooze"
  | "slimeward_spitter_slime"
  | "azure_mass"
  | "cave_bat"
  | "forest_spider"
  | "goblin_scout"
  | "goblin_thrower"
  | "bog_imp"
  | "stone_crawler"
  | "goblin_shaman"
  | "ash_wisp"
  | "mossling"
  | "wolf"
  | "orc";
```

Current enemy archetype data may define:

- display name
- default combat style
- default attack range
- default temperament

Current enemy type data may define:

- display name
- archetype id
- temperament
- combat style override
- target preference
- level
- attack cooldown
- detection range
- attack range override

Enemy archetypes and enemy types are prototype tuning records.

They are not final bestiary content, faction design, encounter design, or production AI behavior trees.

---

## Enemy AI System

`enemyAISystem.ts` owns enemy autonomous targeting.

Current enemy behavior:

- passive enemies do not seek combat targets on their own
- passive enemies may wander near their home position
- aggressive enemies search for nearby party targets
- enemy types define setup data such as level, attack cooldown, detection range, attack range override, temperament, combat style override, and target preference
- enemy archetypes do not define XP rewards
- enemy XP defaults from level-table data unless an individual spawn explicitly overrides `xpReward`
- target preferences currently support closest, leader, and lowest-health party member
- enemies with valid targets enter or remain in attack state
- enemies clear invalid targets
- enemies attacking party members trigger party protection
- bound enemies cannot chase targets while out of attack range
- enemies respect home roam leash and attack leash distances
- enemies record lightweight target decision reasons for debug telemetry

Current enemy detection range:

- `ENEMY_DETECTION_RANGE = 10`

---

## Enemy Scaling and Respawn

`enemyScaling.ts` owns lightweight prototype enemy combat stat scaling.

Current enemy scaling behavior:

- clamps effective scaling level to the current prototype range
- supports `starter` and `early` scaling bands
- derives max health, attack, defense, magic defense, evasion, and threat
- may use archetype id for future threat modifiers
- remains prototype tuning, not final encounter balance

Current enemy scaling constants:

- `MIN_ENEMY_SCALING_LEVEL = 1`
- `MAX_ENEMY_SCALING_LEVEL = 20`

`enemyRespawnSystem.ts` owns current prototype enemy respawn behavior.

Current enemy respawn behavior:

- does not run without a current map id
- does not run in the hub
- records a defeated timestamp for dead enemies
- respawns dead wild-map enemies after the respawn delay
- restores respawned enemies to home position, idle state, full health, and no target
- clears temporary target, roam, mark, and bind runtime state for the respawned enemy

Current enemy respawn constant:

- `ENEMY_RESPAWN_DELAY_MS = 30_000`

Enemy respawn is prototype wild-map behavior.

It should not become production spawn scheduling, encounter reset design, persistent world spawning, or final difficulty pacing unless explicitly requested.

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
- escort-aware protection may keep defenders and party members focused near the active quest guide instead of chasing unrelated distant threats

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

- `GATHER_RANGE = ENTITY_COLLISION_DISTANCE * 2`
- `GATHER_COOLDOWN_MS = 1000`
- `GATHER_APPROACH_BUFFER = 0.15`

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
- `tier`
- `durability`
- `maxDurability`
- `quantity`
- `maxGatherers`
- `isDepleted`

Current resource types:

```ts
type ResourceType = "wood" | "ore" | "herb";
```

Current loot tiers:

```ts
type LootTier = 1 | 2;
```

Gathering reduces durability.

When durability reaches zero, quantity decreases, resource yield is routed through prototype inventory helpers, durability resets if quantity remains, and the resource becomes depleted when quantity reaches zero.

Resource yields currently resolve by resource type and tier.

Current tiered resource item ids:

```ts
type ResourceItemId =
  | ResourceType
  | "softwood"
  | "copper_ore"
  | "field_herb"
  | "hardwood"
  | "iron_ore"
  | "redleaf_herb";
```

The base `wood`, `ore`, and `herb` item ids are legacy compatibility material ids.

Current resource yields should use tiered material ids.

---

## Prototype Inventory, Wallet, Consumables, Drops, and Merchant

Prototype inventory game logic lives under `client/src/game/`.

Current inventory modules include:

- `items.ts`
- `inventory.ts`

Inventory state is stored on `GameState` as shared party state.

Inventory is slot-based with a temporary starting capacity of 50 slots.

Current item categories:

```ts
type ItemCategory =
  | "material"
  | "consumable"
  | "equipment"
  | "quest"
  | "event"
  | "junk";
```

The shared prototype wallet is stored on `GameState` as `wallet`.

Wallet logic lives in `wallet.ts`.

Current currency id:

- `crowns`

Currency does not use inventory slots.

Prototype consumable logic lives in `consumables.ts`.

Current consumable kinds are:

- flask
- food

Current consumable behavior:

- companions may equip one flask
- companions may assign one food item
- flasks use charges, cooldowns, use duration, healing, and optional temporary buffs
- food uses inventory quantity only after completed use
- food may only be used in the hub while the party is safe
- food use is canceled if the companion takes damage before completion
- auto-flask behavior can start flask use at or below a companion HP threshold
- equipped flasks can be refilled by the hub healing fountain
- equipped flasks gain one charge after 20 counted enemy defeats
- consumable buffs feed into companion stat calculations

Enemy drop logic lives in:

- `dropTables.ts`
- `dropSystem.ts`

Drops roll by enemy family and loot tier, create short-lived drop visual events, and route completed drops into shared inventory.

Drops do not create persistent ground loot.

Current enemy family ids:

```ts
type EnemyFamilyId =
  | "slime"
  | "bat"
  | "spider"
  | "goblin"
  | "imp"
  | "wolf"
  | "crawler"
  | "mossling"
  | "wisp"
  | "orc";
```

Current enemy type aliases enemy family id:

```ts
type EnemyType = EnemyFamilyId;
```

Current drop tables are keyed by enemy family and loot tier.

Loot tier is currently derived from enemy level.

Current loot tier behavior:

- level below 10 maps to tier 1
- level 10 or higher maps to tier 2
- supported loot tiers are currently 1 and 2

Current drop table behavior:

- family drop tables may roll common and rare junk drops
- archetype-specific drop tables may add special exceptions
- `goblin_shaman` currently has a low-chance tier 2 Holy Lantern equipment drop
- missing family or tier tables simply produce no drops from that table

Current prototype junk item ids:

```ts
type JunkItemId =
  | "slime_gel_t1"
  | "slime_core_t1"
  | "bat_wing_t1"
  | "bat_ear_t1"
  | "spider_silk_t1"
  | "spider_fang_t1"
  | "goblin_ear_t1"
  | "goblin_tooth_t1"
  | "imp_horn_chip_t1"
  | "imp_tail_t1"
  | "wolf_pelt"
  | "wolf_fang"
  | "crawler_pebble_t1"
  | "crawler_plate_t1"
  | "moss_tuft_t1"
  | "mossling_cap_t1"
  | "goblin_ear_t2"
  | "goblin_tooth_t2"
  | "wisp_ash_t2"
  | "wisp_ember_t2"
  | "orc_hide"
  | "orc_tusk";
```

Merchant logic lives in `merchant.ts`.

Current merchant behavior:

- identifies Merchant NPCs by `npcRole: "merchant"`
- can be gated by quest progress where implemented
- finds eligible junk items with positive sell value for quick exchange
- removes eligible quick-exchange junk items from shared inventory
- adds Crowns to the shared wallet
- exposes fixed prototype Merchant Buy stock
- supports buying selected equipment and consumables for Crowns
- validates merchant identity, stock membership, item category, price, wallet balance, inventory capacity, and quest gating
- adds purchased items to shared inventory
- supports stock filtering by group and party equipment compatibility
- records merchant buy, quick exchange, inventory, wallet, and quest-gating telemetry

Current Merchant Buy stock groups are:

- `flasks`
- `food`
- `weapons`
- `offhands`
- `cloth`
- `leather`
- `mail`
- `plate`
- `accessories`

The Merchant Sell panel is currently a UI placeholder only.

Full selling rules, dynamic shop inventory, shop restocking, price simulation, and a full shop economy are not implemented.

This prototype inventory/wallet/consumable/drop/merchant layer does not include bank storage, persistent ground loot, full selling, dynamic shops, crafting, trading, save/load, backend persistence, full wallet UI, full equipment economy, rarity, affixes, upgrades, durability, sockets, set bonuses, or item comparison.



## Prototype Equipment

Prototype equipment game logic lives under `client/src/game/`.

Current equipment modules include:

- `equipmentTypes.ts`
- `equipmentRules.ts`
- `equipmentSystem.ts`

Equipment item definitions live in `items.ts`.

Companion equipment is stored on the companion entity as:

```ts
equipment: CompanionEquipment;
```

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

Current armor families are:

```ts
type ArmorFamily = "cloth" | "leather" | "mail" | "plate";
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

Equipment rules validate:

- slot compatibility
- class permission
- level requirement
- both-hands occupancy
- inventory removal
- inventory return on unequip
- telemetry results

Armor and accessories currently ignore class restrictions when level requirements are met.

Equipment remains gameplay-facing data only.

Equipment must not require sprite swaps, weapon anchoring, paper-doll rendering, or visible attachment systems.

Current prototype class-restricted weapon and offhand items include:

- Beginner: Training Sword
- Blade: Iron Sword
- Aegis: Guard Mace, Wooden Shield
- Hunter: Short Bow
- Beast: Claw Gauntlets
- Elementalist: Apprentice Orb
- Runecaster: Rune Lantern, Simple Talisman
- Lightbearer: Holy Mace, Holy Lantern
- Penitent: Thorn Whip, Sacrificial Dagger

Current shared prototype armor families include:

- Cloth
- Leather
- Mail
- Plate

Current prototype armor item groups include:

- Acolyte cloth armor
- Scholar cloth armor
- Scout leather armor
- Stalker leather armor
- Guard mail armor
- Vanguard mail armor
- Bulwark plate armor
- Warplate armor

Current shared prototype accessory items include:

- Plain Charm

Current quest equipment rewards may include:

- Acolyte Hood
- Scout Boots
- Bulwark Cuirass

Current archetype-specific prototype equipment drops may include:

- Holy Lantern from Goblin Shaman

Current prototype equipment primary stat modifiers may include:

- strength
- dexterity
- constitution
- intelligence
- wisdom

Current prototype equipment derived stat modifiers may include:

- attack
- defense
- maxHealth
- block
- evasion
- magicPower
- healingPower
- magicDefense
- accuracy
- criticalChance
- criticalDamage
- healthRegen

Short Bow and Claw Gauntlets currently occupy both hands as prototype exceptions.

Equipment is a prototype foundation, not a full equipment economy.

Do not add generalized dual wield, arbitrary two-handed combinations, subclass equipment expansion, equipment visuals, gear recycling, rarity, affixes, upgrades, durability, sockets, set bonuses, item comparison, or a full equipment economy unless explicitly requested.



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
  subzones?: ZoneSubzone[];
  subzoneNameLabels?: ZoneSubzoneNameLabel[];
  visualObjects?: MapVisualObject[];
  floorCells?: Position[];
  visualTheme?: "default" | "slimeward-cave";
  waypoints?: DungeonWaypoint[];
  navigationGrid?: NavigationGrid;
};
```

Current debug map ids:

```ts
type DebugMapId =
  | "hub"
  | "map-1"
  | "map-2"
  | "map-3"
  | "map-4"
  | "slimeward-camp"
  | "slimeward-floor-1"
  | "slimeward-floor-2";
```

Current readable map names:

- `hub`: Harbor Union Bastion
- `map-1`: First Wild Zone
- `map-2`: Second Wild Zone
- `map-3`: Third Wild Zone
- `map-4`: Fourth Wild Zone
- `slimeward-camp`: Slimeward Camp
- `slimeward-floor-1`: Slimeward Floor 1
- `slimeward-floor-2`: Slimeward Floor 2

Maps currently support dimensions, wall positions, baked navigation grid, companion start positions, enemy start positions, resource start data, hub NPC placeholder data, healing fountain data, decorative map visual objects, display/debug names, prototype teleport points, optional subzones, optional subzone labels, encounter areas, encounter leashes, and resource locations.

Map data is still development/prototype data and should not define final world content.

Current prototype map dimensions:

- `hub`: 110 columns by 60 rows
- `map-1`: 160 columns by 57 rows
- `map-2`: 160 columns by 57 rows
- `map-3`: 160 columns by 30 rows
- `map-4`: 160 columns by 30 rows
- `slimeward-camp`: 44 columns by 30 rows
- `slimeward-floor-1`: 136 columns by 40 rows
- `slimeward-floor-2`: 152 columns by 44 rows

The current row count reflects prototype debug-map presentation space.

It is not final world scale or final zone design.

---

## Subzone System

`subzoneSystem.ts` owns lightweight helpers for detecting whether a position is inside an authored prototype subzone.

Current responsibilities include:

- finding the subzone at a position
- checking whether a position is inside a subzone's bounds

Current wilderness maps are authored with three prototype subzones each.

Subzones are used by current map organization, floor texture selection, Stay in Subzone behavior, encounter area placement, resource location placement, and UI-facing subzone labels.

Subzones are prototype map-organization data.

Subzones are not final zones, final region content, persistent zone state, or the production world model.

---

## Teleport System

`teleportSystem.ts` implements prototype/debug map transitions between current debug maps.

This is not the final zone system.

Current prototype/debug routes:

- `hub` -> `map-1`
- `map-1` -> `hub`
- `map-1` -> `map-2`
- `map-2` -> `map-1`
- `map-2` -> `map-3`
- `map-3` -> `map-2`
- `map-3` -> `map-4`
- `map-4` -> `map-3`

Current teleport behavior:

- uses a small debug map teleport table
- supports per-teleport runtime working state
- teleports default to working unless their map definition sets `startsWorking: false`
- quest route-unlock objectives may set a teleport to working
- non-working teleports cannot be triggered or selected for route movement
- can be triggered by player/debug action, World Travel menu selection, or AI conditions
- can set a teleport point as party movement intent
- auto mode may select eligible working teleport points after living enemies are cleared or when quest progression requires a connected map
- World Travel may select an eligible known destination and guide the party toward the matching working teleport point
- party members rally to the teleport point
- teleport completes when living party members are within teleport range
- on completion, current map changes to the teleport target map
- map-local enemies, resources, hub placeholders, hub target dummies, explored tiles, movement planning, direct commands, formation state, combat feedback, skill visuals, enemy AoE runtime, drop visuals, resurrection state, and follow trails are reset or rebuilt for the new map
- companion progression, class, role, level, XP, health, party identity, equipment, consumables, wallet, inventory, quests, party order, and teleport working state are preserved

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
Current teleport runtime state:

```ts
type TeleportRuntimeState = {
  isWorking: boolean;
};
```

`teleportState.ts` owns helper logic for resolving default and runtime teleport working state.

World Travel should use current route and map data.

World Travel must not require final zone ids, persistent zone state, final world streaming, map discovery, travel costs, or a production teleport network.

Do not expand this into full zones, persistent world streaming, or a final teleport network unless explicitly requested.

## Slimeward Dungeon Prototype

`dungeonSystem.ts` owns current Slimeward dungeon runtime behavior.

Current Slimeward dungeon maps are:

- `slimeward-camp`
- `slimeward-floor-1`
- `slimeward-floor-2`

Current Slimeward dungeon runtime state:

```ts
type DungeonChestRuntimeState = {
  status: "hidden" | "available" | "opened" | "collected";
  position: Position;
  exitTeleportId: string;
  rolledLoot: InventorySlot[];
  collectedLoot: InventorySlot[];
  pendingLoot: InventorySlot[];
  isUiOpen?: boolean;
  openedAtMs?: number;
  autoContinueAtMs?: number;
  inventoryFull?: boolean;
};

type SlimewardDungeonRuntimeState = {
  chest: DungeonChestRuntimeState | null;
};
```

Current Slimeward dungeon behavior:

- `updateSlimewardDungeonSystem` runs during simulation updates after drops and before enemy respawn.
- Simulation updates return early while the Slimeward dungeon chest UI is open.
- Floor 1 POI routing targets the next living authored dungeon enemy, then the Floor 2 teleporter.
- Floor 2 POI routing targets the next living authored dungeon enemy, then the boss chest, then the final exit.
- The boss chest appears after The Azure Mass is dead.
- Chest loot currently rolls fixed prototype inventory slots for slime gel, slime core, and a minor recovery flask.
- Chest collection routes loot through shared inventory.
- If inventory accepts all chest loot, the chest is collected and the Floor 2 exit teleport becomes working.
- If inventory is full, Auto Mode is disabled, overflow loot remains pending, and the Floor 2 exit remains non-working.
- Closing or continuing the chest UI hides the overlay without discarding pending loot.
- Slimeward dungeon floor enemies do not respawn.
- Starting a new Slimeward dungeon run from camp clears prior Slimeward dungeon runtime.
- Debug reset clears Slimeward dungeon runtime and returns an in-dungeon party to Slimeward Camp.

Current Slimeward dungeon map data may include floor cells, slimeward cave visual themes, dungeon waypoints, authored enemy packs, authored Superior variants, decorative dungeon visual objects, and Slimeward-specific teleport visuals.

This is a prototype dungeon route and chest interaction.

It is not a final dungeon framework, production boss system, procedural dungeon generator, final loot chest system, or persistent dungeon-state model.

---

## Resurrection and World-Wipe Recovery

`resurrectionSystem.ts` owns current prototype companion resurrection behavior.

Current resurrection behavior:

- runs during simulation updates after POI and healing fountain updates
- only assigns resurrection helpers when the party is not in combat
- living autonomous companions may move toward dead companions
- resurrection requires close range
- resurrection progresses over time while the helper remains valid and in range
- direct-commanded helpers do not continue resurrection channeling
- completed resurrection returns the target companion to follow behavior with minimal health
- resurrection channels and progress emit debug telemetry

Current resurrection constants:

- `RESURRECTION_REQUIRED_MS = 10000`
- `RESURRECTION_RANGE = 1`

`worldWipeRecovery.ts` owns current prototype party defeat recovery.

Current world-wipe recovery behavior:

- triggers when every companion is dead outside Harbor Union Bastion
- chooses available unlocked rescue hubs by route distance for normal wild-map wipes
- rescues Slimeward dungeon floor wipes directly to Slimeward Camp
- may enter a pending choice state when multiple equally valid rescue hubs exist
- currently defaults to Harbor Union Bastion as the normal unlocked rescue hub
- treats Slimeward Camp as the rescue hub for Slimeward dungeon floors
- may charge Crowns using the current rescue fee calculation, capped by current wallet balance
- restores companions to rescue hub arrival positions with full health
- rebuilds rescue hub NPCs and hub target dummies where appropriate
- clears map-local runtime state, combat state, movement state, teleport state, POI state, skill runtime state, enemy AoE runtime, drop visuals, resurrection state, direct commands, follow trails, and formation state
- clears Slimeward dungeon runtime when rescuing to Slimeward Camp
- records map reach for quest state after rescue

Current world-wipe recovery constants:

- `WORLD_WIPE_RESCUE_OVERLAY_DURATION_MS = 2000`
- rescue base fee is 5 Crowns
- rescue fee adds 10 Crowns per map hop

This is a prototype safety system.

It is not the final death penalty, checkpoint, revive economy, or recovery design unless explicitly requested.

---

## Combat Feedback

Combat feedback events are stored in game state.

Current feedback event types:

```ts
type CombatFeedbackType =
  | "attack"
  | "damage"
  | "death"
  | "gather"
  | "heal";
```

Feedback events expire automatically.

Current feedback duration:

- `COMBAT_FEEDBACK_DURATION_MS = 1000`

Combat feedback may be used by attacks, gathering, skill effects, and temporary UI feedback.

---

## Visual Assets

Visual assets and world rendering are currently UI-facing and are not part of core simulation rules.

Current visual and rendering files:

- `client/src/visualAssets.ts`
- `client/src/assetIcons.ts`
- `client/src/SpriteAnimation.tsx`
- `client/src/worldRenderer/PixiWorldRenderer.tsx`

Current public asset path root:

- `client/public/Asserts/`

Current generated asset groups referenced by UI include:

- `Asserts/Generated/now-pack`
- `Asserts/Generated/map-wilderness`
- `Asserts/Generated/map-wilderness/128`
- `Asserts/Generated/hub-floors`
- `Asserts/Generated/hub-floors/New/128`
- `Asserts/Generated/beginner-skill-effects-50/sprites`
- `Asserts/Generated/prototype-vfx/sprites`
- `Asserts/Generated/class-portraits`
- `Asserts/Generated/hub-castle-walls`
- `Asserts/Generated/hub-structures/256`

Current sprite asset groups include:

- `Asserts/Characters/Beginner`
- `Asserts/Characters/Test-Character`
- `Asserts/Characters/Test-Enemy`
- `Asserts/Characters/Test-Enemy2`
- `Asserts/Characters/Test-NPC`
- `Asserts/Characters/Prototype-Enemies`

Current world renderer behavior:

- PixiJS renders the main world view.
- React hosts the renderer and passes game state and command callbacks.
- The renderer supports preview and full modes.
- The renderer may draw floor chunks, walls, obstacles, decorative map visual objects, entities, resources, NPCs, teleports, labels, combat feedback, skill visuals, drop visuals, resurrection feedback, world-wipe feedback, and camera-follow presentation.
- PixiJS rendering must not own simulation rules, targeting rules, movement rules, combat rules, quest rules, or map data generation.

Current companion visuals:

- Beginner companions use the generated Beginner walking sprite set
- non-Beginner companions currently use the test character sprite
- idle may use a single idle frame or directional first-frame idle fallback depending on the sprite set
- run uses directional frame sequences for north, south, west, and east where available
- class portraits are UI-facing images and do not define simulation behavior

Current enemy visuals:

- Wolf-style enemies may use the test enemy sprite
- Orc-style enemies may use the Test-Enemy2 directional static sprites
- prototype enemy archetypes may use static generated archetype sprites
- fallback enemy visuals depend on current map/debug context

Current resource visuals use generated image icons by resource type.

Current NPC visuals:

- Quest Giver, Merchant, Smith, and Dog may use generated image icons
- Test Blade may use Test-NPC image assets
- quest guide NPCs may use temporary NPC visuals
- unsupported NPC visuals fall back to placeholder classes

Current map tile visuals:

- the PixiJS world renderer uses a 32px construction-cell pixel size for coordinate anchoring, walls, obstacles, click conversion, camera math, overlays, entities, resources, NPCs, teleports, labels, and effects
- current floor imagery renders as 128px floor chunks spanning 4x4 construction cells
- wilderness floor chunks currently use 128px generated wilderness floor assets
- hub floor chunks currently use 128px generated hub floor assets
- wilderness floor tile selection may use the subzone containing the floor chunk center so each subsection has stable floor texture selection
- wilderness maps may use generated grass, tree, and bush image tiles
- the hub may use generated stone, outside-grass, castle-wall, and decorative structure imagery
- fallback floor and wall visuals use placeholder classes or renderer fallback drawing

Current generated terrain asset direction may include:

- 32x32 bush or obstacle assets
- 64x64 tree assets
- 64x64 floor assets for visual testing
- 128x128 floor assets for the active floor-chunk render experiment
- hub castle wall assets
- 256px decorative hub structure assets

The 32px construction cell is a render and authoring anchor, not tile-by-tile gameplay movement.

Floor chunk size and terrain asset size must not change simulation coordinates, movement, collision, pathing, map geometry, entity placement, teleports, gameplay ranges, or game logic.

Visual asset registry responsibilities include defining sprite frame lists, frame duration, entity visual mapping, sprite animation selection, image icon mappings, terrain image mappings, and placeholder class names.

Simulation logic must not depend on PixiJS, sprite assets, floor chunk size, or terrain image dimensions.

---

## Debug Telemetry

Debug telemetry records simulation information for inspection.

Current telemetry can track target acquisition, target changes, formation changes, skipped targets, movement failure, path query metrics, navigation distance metrics, attack start, damage dealt, combat resolution, healing resolution, health regeneration, max-health synchronization, entity death, gathering start, resource depletion, class changes, role changes, character XP awarded, character XP reduced, character level up, character XP skipped, inventory changes, equipment equip/unequip attempts, equipment equip/unequip results, equipment validation failures, teleport start, teleport completion, teleport skips, map transitions, POI selection, POI skips, POI interruption, quest availability, quest dialog opening, quest acceptance, quest objective progress, quest objective completion, quest ready-to-turn-in state, quest finish selection, quest reward validation, quest reward validation failure, quest reward claim start, quest reward claim failure, quest reward claim success, quest repeat reset, quest reward Crowns, quest reward XP, quest reward item and equipment grants, quest turn-in, quest completion, quest unlocks, quest equipment state checks, quest-driven teleport intent, enemy drop rolls, drop visual events, drop inventory routing, wallet currency changes, merchant interaction events, Merchant Buy results, quick exchange results, merchant quest gating, skill selection, skill usage, skill skips, skill effects, resurrection target selection, resurrection channel start, resurrection channel progress, resurrection channel cancellation, companion resurrection, flask fountain refills, flask recharge progress, flask charge gains, and capped flask recharge no-ops.

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

Debug telemetry should remain development-only.

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
- add prototype consumables to shared inventory
- hub target dummy testing
- explicit aggressive-enemy test setups
- prototype teleport/map transition testing
- prototype resurrection testing
- prototype world-wipe recovery testing
- enemy scaling and respawn testing
- subzone, encounter area, and subzone label validation
- interrupted POI restore testing
- quest guide escort testing
- PixiJS world renderer inspection
- movement and navigation performance inspection

These should remain isolated from core systems and must not define final gameplay behavior.

---

## Current UI Responsibilities

The React UI currently may display and control map/debug map view through the PixiJS world renderer, generated terrain tiles, subzone name labels, party members, enemies, resources, NPCs, quest guide NPCs, healing fountains, hub target dummies, sprite animation, enemy and NPC name labels, Superior enemy name/aura presentation, enemy AoE danger circles and channel bars, teleport working/broken presentation, camera follow behavior, combat feedback, skill visual feedback, direct command overlays and rejection feedback, drop visual feedback, resurrection progress, world-wipe rescue choice and rescue feedback overlays, party selection, role changes, class changes, party order changes, leader changes, Party Management leader status and leader switching controls, group/direct commands, inventory counters, wallet balance, inventory item details, prototype equipment slot state, prototype equipment equip/unequip commands, prototype consumable equipment, food assignment, auto-flask settings, hub food warnings, quest tracker, quest log, prototype quest reward text, quest objective text, quest turn-in error feedback, equipment tutorial quest state, merchant quick exchange UI, Merchant Buy UI, Merchant Sell placeholder UI, World Travel menu state, prototype destination selection, XP and level progress, party size limit, debug controls, performance/debug telemetry, and debug telemetry export.

UI should remain a consumer/controller of game state, not the owner of simulation behavior.

---

## Menu UI Technical Structure

The React UI may include a main menu and submenu system for party overview, party management, prototype inventory display, prototype quest display, and prototype world travel.

Menu UI must remain in React components under `client/src/`.

Game logic must remain under `client/src/game/`.

React may:

- read current game state
- track selected menu state
- track selected companion UI state
- track selected Party section UI state
- track selected Party Management section UI state
- track selected quest UI state
- track selected World Travel destination UI state
- render UI-facing enemy and NPC name labels
- call existing game command/helper functions for supported actions
- call existing party leader helper functions for leadership switching
- call existing stat allocation helpers for supported stat allocation actions
- call existing equipment helpers for supported equipment actions
- call existing consumable helpers for supported flask, food, and auto-flask actions
- call existing merchant helpers for supported quick exchange and Merchant Buy actions
- call existing teleport or travel-intent helpers for supported prototype World Travel actions
- display placeholder sections for future systems

React must not:

- define core simulation behavior
- duplicate role logic
- invent new role values
- define stat formulas, derived combat formulas, equipment rules, skills, formation, behavior settings, quest rules, POI selection rules, teleport rules, merchant rules, wallet rules, or advanced inventory rules inside React components
- implement equipment UI beyond displaying game state and issuing commands to existing game logic unless explicitly requested
- implement final zone routing, map discovery, travel costs, or production world-map behavior inside React components

Current intended main menu views:

- Party
- Party Management
- Inventory
- Quests
- World Travel

Current intended Party sections and controls:

- companion selector
- Stats
- Equipment
- Skills
- Skill Preferences placeholder

Current intended Party Management sections and controls:

- current leader status
- leadership switch action for living eligible companions
- Role Select
- Party Order
- Formation placeholder for UI only; automatic formation behavior lives in `partyFormationSystem.ts`
- Behavior Settings for supported prototype auto-flask controls

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

The World Travel view may display the current map and known prototype region destinations.

Selecting a destination may set `worldTravelTargetMapId`; the POI system then guides the party toward the next valid teleport step along the current prototype route.

Merchant UI may call existing merchant helper functions, but must not define exchange, buy, pricing, stock, inventory, or wallet rules inside React.

Merchant Buy may display and purchase from fixed prototype stock through game logic.

Merchant Sell may exist as a placeholder only until a real selling system is explicitly requested.

---

## World Structure Future Work

The final world is expected to be divided into zones or fields.

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
- equipment visuals, weapon anchoring, paper-doll rendering, paper-doll equipment, or visible weapon swaps
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
- full shop, selling, buying, and merchant economy beyond prototype quick exchange and fixed prototype Merchant Buy stock
- persistent ground loot beyond prototype drop visual events and drop-to-inventory behavior
- final death penalty, checkpoint, resurrection economy, or recovery system beyond prototype resurrection and world-wipe recovery
- production enemy respawn, encounter reset, or spawn scheduling beyond current prototype wild-map respawn behavior
- final POI/world-routing framework beyond debug-map POI guidance
- production escort, follower, recruitment, or companion NPC systems beyond the current quest guide prototype
- full town systems, interiors, crafting, smithing, recruitment, or NPC relationship systems
