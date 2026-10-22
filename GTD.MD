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
- UI-facing derived helpers: non-persisted presentation helpers in `client/src/`, such as `questEntityIndicators.ts` and quest route/objective marker helpers
- World renderer: `client/src/worldRenderer/PixiWorldRenderer.tsx` and `client/src/worldRenderer/PixiWorldRendererHelpers.ts`
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
- `afkCombatEstimate.ts`
- `bank.ts`
- `classes.ts`
- `classSelection.ts`
- `combatBasicAttackResolution.ts`
- `combatProjectileProfiles.ts`
- `combatProjectileSystem.ts`
- `combatResolver.ts`
- `commands.ts`
- `companionAoeChannelSystem.ts`
- `companionCombat.ts`
- `companionCooldowns.ts`
- `consumables.ts`
- `createInitialGameState.ts`
- `crafting.ts`
- `debugMap.ts`
- `debugTelemetry.ts`
- `debugTools.ts`
- `defendSystem.ts`
- `defenderCombat.ts`
- `directCompanionCommands.ts`
- `dropSystem.ts`
- `dropTables.ts`
- `dungeonSystem.ts`
- `enemyAISystem.ts`
- `enemyAbilities.ts`
- `enemyAbilitySystem.ts`
- `enemyAoeChannelSystem.ts`
- `enemyArchetypes.ts`
- `enemyRespawnSystem.ts`
- `enemyScaling.ts`
- `enemyVariants.ts`
- `entities.ts`
- `entitySeparationSystem.ts`
- `entityGuards.ts`
- `equipmentRules.ts`
- `equipmentSystem.ts`
- `equipmentTypes.ts`
- `explorationSystem.ts`
- `farm.ts`
- `followSystem.ts`
- `gameLoop.ts`
- `gatherSystem.ts`
- `gathererResourceReservation.ts`
- `guildNoticeBoard.ts`
- `guildRecruit.ts`
- `guildRecruitUpgrades.ts`
- `guildSecondaryParties.ts`
- `guildSecondaryPartyAssignments.ts`
- `guildTavern.ts`
- `healingFountainSystem.ts`
- `healthSystem.ts`
- `hubNpcAccess.ts`
- `innKitchen.ts`
- `innKitchenUpgrades.ts`
- `innRoomUpgrades.ts`
- `index.ts`
- `inventory.ts`
- `interactionApproach.ts`
- `items.ts`
- `keyItems.ts`
- `leveling.ts`
- `livestock.ts`
- `livestockHelperBonuses.ts`
- `mapRuntimeCleanup.ts`
- `merchant.ts`
- `movementPlanning.ts`
- `movementState.ts`
- `movementTypes.ts`
- `navigation.ts`
- `navigationClick.ts`
- `newsBroadcast.ts`
- `partyActivityCoordinator.ts`
- `partyFormationSystem.ts`
- `partyIntentState.ts`
- `partyIntentSystem.ts`
- `partyOrderReachability.ts`
- `partyProtectionSystem.ts`
- `partySpacing.ts`
- `partySystem.ts`
- `partyTargetSystem.ts`
- `partyThreatSystem.ts`
- `performanceMetrics.ts`
- `poiResumeSystem.ts`
- `poiSystem.ts`
- `poiTargetSelection.ts`
- `poiTypes.ts`
- `positionUtils.ts`
- `questGuideSystem.ts`
- `questProgressionHooks.ts`
- `questSystem.ts`
- `questTypes.ts`
- `resurrectionSystem.ts`
- `resourceInteraction.ts`
- `resourceRespawnSystem.ts`
- `roleBonus.ts`
- `roleProfiles.ts`
- `roleSystem.ts`
- `saveGame.ts`
- `simulationTiming.ts`
- `skillBehavior.ts`
- `skillEffectResolution.ts`
- `skillMovement.ts`
- `skillOvercharge.ts`
- `skillProgression.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`
- `skillSystem.ts`
- `skillTargeting.ts`
- `skills.ts`
- `state.ts`
- `stats.ts`
- `statusEffects.ts`
- `subzoneSystem.ts`
- `targetSelection.ts`
- `teleportState.ts`
- `teleportSystem.ts`
- `testState.ts`
- `types.ts`
- `updateGame.ts`
- `wallet.ts`
- `worldDiscovery.ts`
- `worldTravelTeleports.ts`
- `worldTravelRouting.ts`
- `worldWipeRecovery.ts`

Current tests live beside game-logic files as `*.test.ts`.

Current top-level React/UI implementation files include:

- `App.tsx`
- `BankPanel.tsx`
- `CompanionPanels.tsx`
- `CompanionVitalsPanel.tsx`
- `CraftingPanel.tsx`
- `FarmLivestockPanel.tsx`
- `farmPresentation.ts`
- `GameMenu.tsx`
- `gameMenuTypes.ts`
- `GuildTavernPanel.tsx`
- `GuidePopup.tsx`
- `guidePopupDefinitions.ts`
- `InventoryPanel.tsx`
- `ImportSaveButton.tsx`
- `innKitchenPresentation.ts`
- `innRoomsPresentation.ts`
- `livestockPresentation.ts`
- `main.tsx`
- `npcInteractionRange.ts`
- `poiPresentation.ts`
- `PatchNotesDialog.tsx`
- `PATCH_NOTES.md`
- `QuestPanels.tsx`
- `QuestTrackerPanel.tsx`
- `questUiHelpers.ts`
- `saveStorage.ts`
- `SpriteAnimation.tsx`
- `visualAssets.ts`
- `assetIcons.ts`
- `visualMovement.ts`
- `WorldPanel.tsx`

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

NPC entities are prototype placeholders for hub visuals, simple interactions, quest guide behavior, dungeon chest presentation, bank chest presentation, Guild & Inn service presentation, Farm and Livestock service presentation where present, and non-interactive service placeholders.

Current prototype NPC behavior is limited to Quest Giver quest interaction, Class Mentor first-class selection interaction, fixed Merchant Buy stock and limited Merchant Sell interaction, Smith crafting interaction, Bank Chest storage interaction, Guild & Inn service opening where present, Farm and Livestock service opening where present, lightweight non-branching speech presentation for supported character NPCs, placeholder hub NPC display, prototype quest NPC behavior for guide, rescue, repair, defend, route unlock, and elite-spawn objectives, and Slimeward dungeon chest closed/open presentation.

Current NPC role values include:

```ts
type NpcRole =
  | "quest_giver"
  | "class_mentor"
  | "bounty_board"
  | "merchant"
  | "smith"
  | "bank_chest"
  | "guild_coordinator"
  | "tavern_keeper"
  | "farmer"
  | "livestock_keeper"
  | "dog"
  | "test_blade"
  | "quest_guide"
  | "dungeon_chest_closed"
  | "dungeon_chest_open";
```

`hubNpcAccess.ts` owns town-hub recognition, the functional hub NPC role allowlist, and current-map NPC-presence checks. Only `hub` and `hub-2` are current town hubs. Functional roles are `quest_giver`, `class_mentor`, `merchant`, `smith`, `bank_chest`, `guild_coordinator`, `tavern_keeper`, `farmer`, and `livestock_keeper`. Their interactions are available across the current town hub while the matching entity exists. `npcInteractionRange.ts` keeps numeric range fallback for excluded interactions such as dogs, quest guides, and dungeon chests.

Supported character NPCs may display one transient, non-branching speech bubble after their interaction becomes available. React coordinates the transient speaker and timing state, a focused UI-presentation helper resolves role or quest-state text without mutating game state, and the PixiJS renderer owns bubble layout and drawing. React measures registered HUD regions such as the minimap and coordinate panel and passes viewport-space avoidance rectangles to the renderer. The shared pure layout helper tries centered-above, horizontally shifted, and below-speaker candidates, clamps the complete bubble inside the usable world viewport, chooses the least-overlapping candidate only as a constrained fallback, and keeps the tail directed toward the speaker. Ordinary NPC speech and the Orc Warmaster finale use this same layout; HUD layers remain above the world renderer. Speech is not persisted and does not define simulation behavior.

NPCs do not implement branching dialogue, dialogue choices, conversation history, full shops beyond fixed prototype Merchant Buy stock, production crafting or smithing beyond current prototype Smith crafting, recruitment beyond current Guild Recruit helpers, relationship behavior, or general follower behavior.

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
- interaction stand-position resolution for nearby target interactions
- party pass-through in specific party movement cases
- party swaps in specific movement edge cases
- stationary overlap separation for selected companions, enemies, and NPCs
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
- `skillBehavior`
- `skillProgression`
- `roleBonus`

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

Role bonus assignment is handled by `roleBonus.ts`.

Companions store:

```ts
roleBonus: RoleBonusState;
```

Current role bonus state tracks:

- `activeRole`
- `pendingRole`
- `changedAt`
- `activatesAt`

`setPartyMemberRole` starts a pending role bonus for the newly assigned role.

`updateRoleBonusAssignments` activates pending role bonuses after the prototype assignment delay.

Current role bonus constants include:

- `ROLE_BONUS_ASSIGNMENT_DELAY_MS = 5000`

Active role bonuses contribute through stat and gathering helpers.

Current role bonus effects include:

- Defender: defense and block modifiers
- Fighter: attack and magic power modifiers
- Support: healing power modifier
- Gatherer: effective gather speed modifier

Role bonus code must not create new role values or change autonomous role priority behavior.

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

Current responsibilities include storing entities, shared party prototype inventory, shared party bank, shared party key item state, shared party wallet, current debug map id, optional map data, active teleport state, teleport runtime state, auto-mode state, World Travel target state, POI preferences, simulation tick/frame/time values, party leader id, leader handoff timing, party intent, leader intent compatibility state, direct companion command state, prototype quest state, Guild & Inn state, Farm state, Livestock state, world discovery state, pending offline farming loot, global/local POI intent, interrupted POI target state, explored positions, follow trails, movement planning, movement path cache, attack slot cache, enemy target reachability cache, defender wait/blocking state, party formation state, combat feedback, basic combat projectile runtime state, autonomous target suppression state, skill runtime state, status-effect runtime state, skill visual events, companion AoE runtime state, enemy AoE runtime state, reusable enemy ability runtime state, prototype consumable use state, flask recharge state, prototype drop visual events, Slimeward dungeon runtime state, resurrection participant/progress state, world-wipe recovery state, passive health regeneration timing, target dummy regeneration timing, last companion damage timing, short-lived news broadcasts, debug options, and debug telemetry.

Current movement planning fields include:

- `failedMoveByEntityId`
- `movementFailureMsByEntityId`
- `movementFailuresByEntityId`
- `movementPathRetryAtMsByEntityId`
- `moveIntentsByEntityId`
- `reservedPositionsByEntityId`
- `movementPathsByEntityId`
- `attackSlotCacheByEntityId`
- `enemyTargetReachabilityCacheByEnemyId`
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

Current direct companion command fields include:

- `directCompanionCommandsById`
- `directCommandGraceUntilByCompanionId`

Direct companion command state tracks active attack, gather, and move orders plus short rejoin grace after normal command completion or cancellation.

Current autonomous target suppression fields include:

- `autonomousTargetSuppressionsByEnemyId`

Autonomous target suppression state can temporarily remove a specific enemy from normal autonomous companion and skill target selection without canceling valid direct companion commands.

Current POI preferences include:

- `stayInMap`
- `searchScope`

Current POI search scope values are:

```ts
type PoiSearchScope = "free_travel" | "zone_only" | "subzone_only";
```

`stayInMap` is compatibility state for the older Stay in Subzone prototype control.

`subzone_only` sets `stayInMap` to true and lets POI and autonomous gatherer selection use the leader's current subzone as a local boundary where supported.

`zone_only` keeps autonomous POI selection on the current prototype map without applying leader-subzone filtering. It is not the final zone system.

The current React map UI exposes Auto Combat as Off or On only. Off clears `autoModeEnabled`. On sets `autoModeEnabled` and writes `poiPreferences.searchScope` to `subzone_only`, using the leader's current internal subzone boundary where supported.

The player-facing Auto Combat UI no longer exposes Free Travel, Zone Only, or Subzone Only cycling. These scope values may remain as internal compatibility state for save migration, POI helpers, tests, or future prototype controls.

Current shared inventory, bank, key item, and wallet fields include:

- `inventory`
- `bank`
- `keyItemsById`
- `wallet`

Current key item state includes permanent discoveries such as Farm seed unlocks and Livestock creature discoveries. These unlock plots and owned creature visibility without creating normal inventory clutter.

Current Guild & Inn and discovery fields include:

- `highestEverCompanionLevel`
- `restingCompanionsById`
- `guildRecruit`
- `guildUpgrades`
- `guildNoticeBoard`
- `guildSecondaryParties`
- `innUpgrades`
- `innKitchen`
- `farm`
- `livestock`
- `worldDiscovery`
- `pendingOfflineFarmingLoot`

Current short-lived feedback fields include:

- `newsBroadcasts`

Current prototype consumable runtime fields include:

- `consumableUsesByCompanionId`
- `flaskRechargeEnemyKillCounter`
- `flaskRechargeCountedEnemyDefeats`

Current prototype drop and dungeon runtime fields include:

- `dropVisualEvents`
- `slimewardDungeon`

Current combat projectile runtime fields include:

- `combatProjectiles`

Combat projectile travel and impact runtime is owned by `combatProjectileSystem.ts`; basic projectile visual/profile selection is owned by `combatProjectileProfiles.ts`, while focused abilities may provide their own semantic projectile profile.

The shared projectile launcher supports an optional locked world-space origin and impact label while the existing basic-attack wrapper preserves current callers. Projectile runtime supports current companion and ranged-enemy basic attacks plus the Ember Imp Fire Bolt.

Projectile runtime is cleared by save sanitization and map-local runtime cleanup where appropriate.

Current skill runtime and cooldown fields include:

- `skillMarksByEnemyId`
- `skillSelfBuffsByCompanionId`
- `skillPartyBuffsBySourceId`
- `skillPartyPoisonCoatingsBySourceId`
- `skillPartyClassBuffsByCompanionId`
- `skillOverchargesByCompanionId`
- `skillManaShieldsByCompanionId`
- `skillFrostArmorsByCompanionId`
- `skillHealOverTimesByCompanionId`
- `skillLifestealBuffsByCompanionId`
- `skillRewindRunesByCompanionId`
- `skillRunicFocusByCompanionId`
- `skillGatherBuffsByCompanionId`
- `skillDamageMitigationsByCompanionId`
- `skillAbsorbShieldsByCompanionId`
- `skillSelfMitigationBuffsByCompanionId`
- `skillPartyMitigationBuffsBySourceId`
- `skillBindsByEnemyId`
- `skillShieldBlocksById`
- `skillCooldownsByCompanionId`
- `globalCooldownsByCompanionId`
- `skillVisualEvents`

Current status-effect runtime fields include:

- `statusEffectsById`

Current companion AoE runtime fields include:

- `companionAoeChannelsByCasterId`

Current enemy AoE runtime fields include:

- `enemyAoeChannelsByCasterId`
- `enemyAoeCooldownsByCasterId`

Current reusable enemy ability runtime fields include:

- `enemyAbilityCastsByEnemyId`
- `enemyAbilityCooldownsByEnemyId`
- `enemyAbilityBasicAttackRequiredByEnemyId`
- `enemyDashesByEnemyId`

Current forced-movement and Warmaster attempt runtime fields include:

- `forcedMovementsByEntityId`
- `warmasterAttempt`

Current resurrection and recovery fields include:

- `resurrectionProgressByCompanionId`
- `resurrectionChannelsByHelperId`
- `worldWipeRecovery`

Current health runtime fields include:

- `lastHealthRegenAtByCompanionId`
- `lastTargetDummyRegenAtByEnemyId`
- `lastCompanionDamageTakenAtByCompanionId`

Current debug option fields include:

- `superSpeedEnabled`
- `superExpEnabled`
- `companionInfiniteHealthEnabled`
- `deepNavigationTelemetryEnabled`

State helpers should remain low-level and safe.

Systems should own behavior decisions.

Initial game state is created by `createInitialGameState.ts`.

Current initial prototype state includes:

- Harbor Union Bastion as the starting map
- two starting companions
- the starting leader as a Defender-role companion
- the second starting companion as a Fighter-role companion
- Hub 1 basic service NPCs: Quest Giver, Merchant, Smith, Bank Chest, and Dog
- quest-unlocked Hub 1 Class Mentor NPC state
- Hub 2 basic service NPCs plus Guild Coordinator, Inn Keeper, Farmer, Livestock keeper, and dog NPCs where the map is created
- hub target dummy and hub AoE target dummy
- empty shared party inventory, bank, key item state, and wallet
- initial Guild Recruit, Guild Notice Board, Guild Field Team, Inn Rooms, Inn Kitchen, Inn upgrade, Farm, Livestock, and world discovery state
- initial quest state
- one Training Sword added to shared inventory as prototype/debug setup

---

## Prototype Save and Offline Farming

Browser-local save logic is split between game logic and React-facing storage helpers.

Game-logic save helpers live in `saveGame.ts`.

React-facing browser storage helpers live in `client/src/saveStorage.ts`.

Current save game behavior:

- `SAVE_VERSION` is currently `3`
- version-1 and version-2 saves pass through the centralized `migrateSavedGameToCurrentVersion` migration before validation or sanitization
- the version-1 migration remaps retired Holy Mace and Holy Lantern ids across the complete saved object, preserving inventory/bank quantities and fixed slot positions, then directly fills empty Blade, Hunter, Beast, and Elementalist offhands with a matching-tier item or the level-10 fallback
- the version-2 migration remaps legacy `test-enemy` wild-enemy ids in current-map entity keys and enemy records, flask recharge counted-defeat records, and defend-objective suppressed-enemy ids or snapshots
- migrations run sequentially, so version-1 saves receive both the item/offhand migration and the wild-enemy id migration before becoming version 3
- offhand migration grants are limited to version 1; later saves do not run them, and populated offhands are never overwritten
- saved data includes `saveVersion`, `savedAtMs`, optional `offlineFarmingBlockedReason`, and sanitized `GameState`
- validation rejects malformed saves, unsupported save versions, missing entities, invalid inventory, invalid bank, invalid key item state, invalid wallet, invalid quest state, invalid leader id, and invalid current map id
- restore rebuilds the current debug map from saved quest state
- restore applies Farm and Livestock catch-up through their capped production rules
- save sanitization preserves valid shared inventory, bank, key item, wallet, quest, companion progression, companion equipment, companion flask assignment, Guild & Inn state, Farm state, Livestock state, world discovery state, pending offline loot, and teleport working state while dropping removed or invalid item IDs from saved item containers
- save sanitization reconciles state-derived quest availability, rechecks active equipment objectives, and persists starter-contract acceptance with existing Notice Board progress
- legacy saves missing both new quest ids skip onboarding when The Azure Trial is already completed and any active or resting roster companion has a first class; otherwise they retain the onboarding flow and receive the dedicated starter contract without replacing saved Board slots
- save sanitization resets transient runtime state such as active teleports, party intent, direct commands, interrupted POI state, movement caches, attack slots, combat feedback, combat projectiles, autonomous target suppressions, skill runtime, status-effect runtime, companion AoE runtime, enemy AoE channels, enemy AoE cooldowns, active reusable enemy ability casts, consumable use runtime, drop visuals, resurrection runtime, world-wipe recovery, health timing, target dummy timing, companion damage timing, short-lived news broadcasts, and debug telemetry
- reusable enemy ability cooldowns are the focused exception to normal combat-cooldown clearing: sanitization preserves only known configured abilities with finite unexpired absolute expiration timestamps and preserves a valid required-basic-attack gate, while discarding malformed, expired, unknown-ability, and missing-enemy records
- companion save sanitization keeps dead companions dead, returns living companions to idle or follow state, clears temporary consumable buffs, and sanitizes skill progression data
- enemy save sanitization keeps dead enemies dead and returns living enemies to idle state
- Slimeward dungeon chest UI state is closed during save sanitization

Current browser storage behavior:

- local saves use `window.localStorage`
- current storage key is `mmo-party-simulator.save.v1`
- the UI can read, write, export, import, and download save files
- exported save files are JSON
- imported save text is parsed, validated, and restored before any overwrite confirmation or local-storage replacement
- the start-screen caller confirms only when a stored save exists, writes the valid import, reports success, enables Continue, and remains on the menu
- the in-game Options caller preserves replacement confirmation and immediately enters the restored imported state after a successful write
- canceled replacement, parsing failure, validation failure, restoration failure, file-read failure, or storage-write failure leaves the previously stored save untouched
- the UI does not expose a browser-save deletion helper or Delete Save control

Current Patch Notes behavior:

- player-facing history lives in `client/src/PATCH_NOTES.md` as React-owned UI content rather than game state, public runtime data, or simulation logic
- Vite imports the Markdown as bundled raw text and `PatchNotesDialog.tsx` renders it with `react-markdown` using `skipHtml` and no raw-HTML or GFM plugin
- the document begins with the June 19, 2026 mechanically complete nine-class baseline and continues with newest-first monthly history
- the dialog owns its scroll region, sticky Close control, Escape and backdrop closing, keyboard focus containment, focus restoration, and reopen-at-top behavior
- future player-facing entries are added when changes reach `live`

Current offline farming behavior:

- offline farming is applied when continuing a valid save unless the saved state recorded an offline-farming block reason
- offline farming credit is capped by `MAX_OFFLINE_FARMING_MS`
- current cap is 30 minutes
- offline farming requires at least one minute offline
- offline farming uses `afkCombatEstimate.ts` for the current party and current subzone
- the shared AFK estimator returns combat rating, party damage, kill potential, spawn cap, final kills, XP, survivability, resources, enemy summary, access efficiency, estimated drops, and warnings
- final offline kills are constrained by combat capability, movement/access downtime, survivability, and subzone spawn capacity
- offline farming grants XP immediately to eligible living active party companions
- offline farming routes gathered resources and monster drops through inventory helpers
- inventory overflow keeps unclaimed resource/drop rewards in `pendingOfflineFarmingLoot`
- pending offline loot can be claimed later and survives save/load until collected
- Farm and Livestock production catch-up is separate from offline farming loot and uses each system's own holding caps and routing rules
- offline farming can be skipped for active travel, active recovery, resurrection, open dungeon chest loot, unsupported maps, unsupported subzones, missing living leader, or defeated party state

This is prototype browser-local persistence and lightweight offline reward approximation.

It is not backend persistence, cloud save, account save, cross-device save, full offline simulation, or a production idle economy.

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

Classes provide alpha active and passive skills through `skills.ts`.

First-class selection from Beginner is handled by `classSelection.ts`.

Current first-class selection validates:

- target entity exists and is a companion
- selected class is a first class, not Beginner
- companion is living
- companion is currently Beginner
- companion level is at least `BEGINNER_CLASS_UNLOCK_LEVEL`
- currently equipped items are compatible with the selected first class

Successful first-class selection calls `setPartyMemberClass`, which updates class id and ensures class skill progression for the selected class.

Current first-class selection failure reasons include:

```ts
type FirstClassSelectionFailureReason =
  | "companion_not_found"
  | "companion_dead"
  | "not_beginner"
  | "level_too_low"
  | "invalid_class"
  | "incompatible_equipment";
```

First-class selection checks every currently equipped item against the selected first-class equipment profile.

Universal Training Sword-type main-hand weapons are compatible with every current and future class, so `classSelection.ts` retains them through successful first-class selection. Other incompatible equipment continues to block selection.

A companion cannot enter first-class selection if any first-class option would be blocked by currently equipped incompatible gear.

Class selection validation must stay in `classSelection.ts` and must not be duplicated in React UI.

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

- enemies grant XP when killed by party combat or skills
- XP is granted to living companions
- dead companions do not receive XP
- max-level companions do not receive XP
- XP reward defaults from the same-level enemy XP table if an individual enemy `xpReward` override is not set
- XP to next level uses anchored progression values with interpolation
- same-level enemy XP uses anchored progression values with interpolation
- companion XP rolls over through multiple level-ups if enough XP is gained
- max-level companions have `characterXp` reset to 0
- level-ups may apply automatic natural-stat growth
- level-ups may grant unspent stat points after first-class progression begins
- debug telemetry records XP awarded, XP reduced, XP skipped, and level-up events

Current level-gap XP modifier:

- companion level up to 10 above enemy level: 100 percent XP
- companion level 11-20 above enemy level: 50 percent XP
- companion level 21-30 above enemy level: 25 percent XP
- companion level more than 30 above enemy level: 0 percent XP

Current party size limit is based on the highest companion level ever reached:

- highest companion level below 10: 2 party members
- highest companion level 10 or higher: 3 party members
- highest companion level 30 or higher: 4 party members
- highest companion level 60 or higher: 5 party members

Beginner first-class eligibility is currently:

- companion class is `beginner`
- companion is living
- companion level is at least 10
- currently equipped items are compatible with the selected first class

Leveling is a prototype progression system.

It should remain simple unless expanded intentionally.

---

## Alpha Skill System

Skills are class-based active actions and always-active passive effects. The alpha system extends the existing game-logic model rather than introducing a second ability framework.

Shared skill definitions live in `skills.ts` and identify each skill with `type: "active" | "passive"`. Active definitions contain executable action metadata; passive definitions contain effect metadata consumed by focused game-logic selectors and helpers.

Skill selection, behavior settings, cooldowns, execution, status-effect gating, overcharge adjustment, companion AoE channeling, runtime ticking, and effect resolution live in:

- `skillSystem.ts`
- `skillBehavior.ts`
- `companionCooldowns.ts`
- `skillRolePreferences.ts`
- `skillRuntime.ts`
- `skillTargeting.ts`
- `skillMovement.ts`
- `skillOvercharge.ts`
- `statusEffects.ts`
- `companionAoeChannelSystem.ts`
- `skillEffectResolution.ts`

Passive implementation must use focused selectors and existing runtime ownership. Do not introduce a generic event bus solely for passive effects.

Current companion skill behavior settings live in `skillBehavior.ts`.

Companions store:

```ts
skillBehavior: CompanionSkillBehavior;
```

Current companion skill behavior settings include:

- `beginnerFirstAidSelfHealHpThresholdPercent`
- `beginnerFirstAidAllyHealHpThresholdPercent`
- `secondWindSelfHealHpThresholdPercent`
- `holdFastUseHpThresholdPercent`
- `fakeDeathUseHpThresholdPercent`
- `bloodFeastUseHpThresholdPercent`
- `lightMendAllyHealHpThresholdPercent`
- `selfSacrificeSafetyFloorPercent`
- `penitentsGiftAllyHealHpThresholdPercent`
- `penitentsGiftSelfHealHpThresholdPercent`
- `eternalHopeUseHpThresholdPercent`
- `mobilitySkillUseMode`
- `defensiveMobilityUseHpThresholdPercent`
- `supportFocus`
- `overchargeEnabled`
- `fireBurstTargetMode`
- `circleOfRenewalTargetMode`
- `circleOfRenewalMainTargetHpThresholdPercent`

Beginner First Aid self-heal threshold defaults to 20 percent and is clamped from 10 percent to 60 percent.

Beginner First Aid ally-heal threshold defaults to 35 percent and is clamped from 10 percent to 60 percent.

Second Wind self-heal threshold defaults to 30 percent and is clamped from 1 percent to 30 percent.

Hold Fast use threshold defaults to 40 percent and is clamped from 1 percent to 100 percent.

Fake Death use threshold defaults to 25 percent and is clamped from 1 percent to 100 percent.

Blood Feast use threshold defaults to 45 percent and is clamped from 1 percent to 100 percent.

Light Mend ally-heal threshold defaults to 60 percent and is clamped from 1 percent to 100 percent.

Self Sacrifice safety floor defaults to 35 percent and is clamped from 1 percent to 100 percent.

Penitent's Gift ally-heal threshold defaults to 50 percent and is clamped from 1 percent to 100 percent.

Penitent's Gift self-heal threshold defaults to 35 percent and is clamped from 1 percent to 100 percent.

Eternal Hope use threshold defaults to 35 percent and is clamped from 1 percent to 100 percent.

Defensive mobility threshold defaults to 50 percent and is clamped from 1 percent to 100 percent.

Overcharge is enabled by default.

Current mobility skill use mode values are:

```ts
type MobilitySkillUseMode = "offensive" | "defensive";
```

Current Support Focus values are:

```ts
type SupportFocus = "lowest_hp" | "leader" | "defender";
```
Current FireBurst target mode values are:

```ts
type FireBurstTargetMode = "big_group" | "low_health" | "highest_health";
```

Current Circle of Renewal target mode values are:

```ts
type CircleOfRenewalTargetMode =
  | "big_group"
  | "low_health"
  | "defender";
```
Support Focus, mobility skill use mode, FireBurst target mode, Circle of Renewal target mode, overcharge enablement, and skill HP thresholds are targeting and usage preferences for supported skill behavior. They must not create new role values or move skill targeting rules into React UI.

Skill ids include active and passive Beginner and first-class skills:

```ts
type SkillId =
  | "throw_rock" // Beginner
  | "kick" // Beginner
  | "guard_up" // Beginner
  | "first_aid" // Beginner
  | "deep_breath" // Beginner
  | "rally_call" // Beginner
  | "field_hands" // Beginner
  | "follow_through" // Beginner active
  | "resourcefulness" // Beginner passive
  | "steady_nerves" // Beginner passive
  | "duelist_challenge" // Blade
  | "second_wind" // Blade
  | "blade_parry" // Blade
  | "edge_focus" // Blade
  | "press_the_opening" // Blade
  | "woodcutter_rhythm" // Blade
  | "flash_step" // Blade
  | "sweeping_strike" // Blade
  | "duelists_momentum" // Blade passive
  | "riposte_training" // Blade passive
  | "shield_challenge" // Aegis
  | "hold_fast" // Aegis
  | "guard_wall" // Aegis
  | "iron_stance" // Aegis
  | "shield_formation" // Aegis
  | "stonebreaker_rhythm" // Aegis
  | "shield_rush" // Aegis
  | "shield_shockwave" // Aegis
  | "rooted_bastion" // Aegis passive
  | "unbroken_line" // Aegis passive
  | "pinning_shot" // Hunter
  | "fake_death" // Hunter
  | "evasive_instinct" // Hunter
  | "hunters_focus" // Hunter
  | "poison_coating" // Hunter
  | "herbalist_rhythm" // Hunter
  | "skirmish_shot" // Hunter
  | "arrow_burst" // Hunter
  | "headhunter" // Hunter passive
  | "exploit_the_snare" // Hunter passive
  | "threatening_roar" // Beast
  | "blood_feast" // Beast
  | "rugged_hide" // Beast
  | "feral_surge" // Beast
  | "pack_frenzy" // Beast
  | "stoneclaw_rhythm" // Beast
  | "pounce" // Beast
  | "maul_sweep" // Beast
  | "blood_scent" // Beast passive
  | "pack_instinct" // Beast passive
  | "elemental_bolt" // Elementalist
  | "mana_shield" // Elementalist
  | "frost_armor" // Elementalist
  | "overcharge" // Elementalist
  | "arcane_conduit" // Elementalist
  | "emberwood_rhythm" // Elementalist
  | "flame_step" // Elementalist
  | "fire_burst" // Elementalist
  | "stable_overcharge" // Elementalist passive
  | "arcane_crescendo" // Elementalist passive
  | "binding_rune" // Runecaster
  | "rune_lance" // Runecaster
  | "warding_glyph" // Runecaster
  | "rewind_rune" // Runecaster
  | "runic_focus" // Runecaster
  | "leyline_matrix" // Runecaster
  | "stone_sigil_rhythm" // Runecaster
  | "rune_step" // Runecaster
  | "word_resonance" // Runecaster passive
  | "living_inscription" // Runecaster passive
  | "blinding_ray" // Lightbearer
  | "light_mend" // Lightbearer
  | "sanctuary_veil" // Lightbearer
  | "guiding_light" // Lightbearer
  | "radiant_benediction" // Lightbearer
  | "herbalist_hymn" // Lightbearer
  | "dawn_step" // Lightbearer
  | "circle_of_renewal" // Lightbearer
  | "overflowing_grace" // Lightbearer passive
  | "many_beacons" // Lightbearer passive
  | "whip_prison" // Penitent
  | "flagellant_lash" // Penitent
  | "martyrs_veil" // Penitent
  | "penitents_gift" // Penitent
  | "eternal_hope" // Penitent
  | "burdened_benediction" // Penitent
  | "woodcutting_penance" // Penitent
  | "atonement_step" // Penitent
  | "crimson_authority" // Penitent passive
  | "cruel_mercy"; // Penitent passive
```

Beginner active skills:

- Beginner: Throw Rock
- Beginner: Kick
- Beginner: Guard Up
- Beginner: First Aid
- Beginner: Deep Breath
- Beginner: Rally Call
- Beginner: Field Hands
- Beginner: Follow Through

Blade active skills:

- Blade: Duelist Challenge
- Blade: Second Wind
- Blade: Blade Parry
- Blade: Edge Focus
- Blade: Press the Opening
- Blade: Woodcutter Rhythm
- Blade: Flash Step
- Blade: Sweeping Strike

Aegis active skills:

- Aegis: Shield Challenge
- Aegis: Hold Fast
- Aegis: Guard Wall
- Aegis: Iron Stance
- Aegis: Shield Formation
- Aegis: Stonebreaker Rhythm
- Aegis: Shield Rush
- Aegis: Shield Shockwave

Hunter active skills:

- Hunter: Pinning Shot
- Hunter: Fake Death
- Hunter: Evasive Instinct
- Hunter: Hunter's Focus
- Hunter: Poison Coating
- Hunter: Herbalist Rhythm
- Hunter: Skirmish Shot
- Hunter: Arrow Burst

Beast active skills:

- Beast: Threatening Roar
- Beast: Blood Feast
- Beast: Rugged Hide
- Beast: Feral Surge
- Beast: Pack Frenzy
- Beast: Stoneclaw Rhythm
- Beast: Pounce
- Beast: Maul Sweep

Elementalist active skills:

- Elementalist: Elemental Bolt
- Elementalist: Mana Shield
- Elementalist: Frost Armor
- Elementalist: Overcharge
- Elementalist: Arcane Conduit
- Elementalist: Emberwood Rhythm
- Elementalist: Flame Step
- Elementalist: FireBurst

Runecaster active skills:

- Runecaster: Binding Rune
- Runecaster: Rune Lance
- Runecaster: Warding Glyph
- Runecaster: Rewind Rune
- Runecaster: Runic Focus
- Runecaster: Leyline Matrix
- Runecaster: Stone Sigil Rhythm
- Runecaster: Rune Step

Lightbearer active skills:

- Lightbearer: Blinding Ray
- Lightbearer: Light Mend
- Lightbearer: Sanctuary Veil
- Lightbearer: Guiding Light
- Lightbearer: Radiant Benediction
- Lightbearer: Herbalist Hymn
- Lightbearer: Dawn Step
- Lightbearer: Circle of Renewal

Penitent active skills:

- Penitent: Whip Prison
- Penitent: Flagellant Lash
- Penitent: Martyr's Veil
- Penitent: Penitent's Gift
- Penitent: Eternal Hope
- Penitent: Burdened Benediction
- Penitent: Woodcutting Penance
- Penitent: Atonement Step

Passive skills by class:

- Beginner: Resourcefulness, Steady Nerves
- Blade: Duelist's Momentum, Riposte Training
- Aegis: Rooted Bastion, Unbroken Line
- Hunter: Headhunter, Exploit the Snare
- Beast: Blood Scent, Pack Instinct
- Elementalist: Stable Overcharge, Arcane Crescendo
- Runecaster: Word Resonance, Living Inscription
- Lightbearer: Overflowing Grace, Many Beacons
- Penitent: Crimson Authority, Cruel Mercy

Active-skill lookup and autonomous selection must exclude passive definitions. A learned-passive lookup must include passives from every class tier the companion has unlocked. Passives never enter active slots, legacy selection, cooldown processing, or autonomous action scoring.

Class unlock initializes every active and passive skill for that class at rank 1. Passive-specific skill books use the same learned-skill rank and exact-cost Study model as active skills. React presents passive rank, current cap, description, and books required for the next rank, but does not calculate passive effects.

Passive mechanics remain owned by focused game-logic modules:

- combat damage and healing modifiers resolve beside the existing damage or healing calculation
- incoming control reduction resolves when status duration is applied, and Steady Nerves only adjusts supported control whose source resolves to an enemy; current bind behavior uses the `immobilized` runtime status
- position, recent-hit, recent-kill, prior-target, and prior-rune memory is stored and updated by game logic
- barriers, charges, stack expiration, and source-owned rune effects are stored in explicit runtime state and cleaned by the existing runtime cleanup path
- passive bonuses are queried from learned skill state and never duplicated into React state

Current passive resolution details:

- Arcane Crescendo counters and charged state, Word Resonance prior-rune memory, Many Beacons prior-target memory, Cruel Mercy charges, and Overflowing Grace barriers are transient runtime records
- map transitions, world-wipe recovery, and save restoration clear those records with other transient skill runtime
- Crimson Authority modifies enemy-facing Penitent control and bleed durations, while Whip Prison applies its unmodified base control duration to the caster's self-inflicted immobilize, disarm, and silence
- incoming absorb order is Mana Shield, then the standard absorb-shield record, then the Overflowing Grace barrier
- Blood Scent and Pack Instinct re-evaluate their health and proximity conditions independently for each qualifying damage-over-time tick
- the existing companion buff presentation exposes Duelist's Momentum, Riposte Training, Rooted Bastion, Headhunter, Arcane Crescendo progress or charged state, Cruel Mercy charges, and Overflowing Grace barrier state; prior-target and prior-rune memories remain simulation state rather than separate buff icons

The exact passive formulas and qualifying conditions are authoritative in GDD.md. Continuous passive scaling uses the shared `U(rank)` helper; discrete and bespoke effects use explicit helpers and milestone tests.

### Beginner active-skill implementation rules

Beginner active definitions and resolution must implement these rank behaviors through the currently reachable rank 10:

- Throw Rock taunt duration: 3 seconds at rank 1, +0.5 seconds per rank through rank 5, then +0.25 seconds per rank; rank 10 is 6.25 seconds.
- Kick damage: 100 percent at rank 1, +5 percentage points per rank through rank 5, then +2.5 points per rank; rank 10 is 132.5 percent.
- Guard Up: 6–10 seconds at ranks 1–5, then +0.5 seconds per rank; one block at ranks 1–4, two at ranks 5–9, and three at rank 10.
- First Aid normal healing uses the generic potency curve before the target-health effectiveness multiplier is applied.
- Deep Breath and Rally Call: +1 damage per rank through rank 5, then +0.5 per rank; rank 10 is +7.5.
- Field Hands uses generic gathering-power scaling and does not modify item quantity, tier, or rarity.
- Follow Through replaces Quick Step and its book id. It is a range-1, 10-second-cooldown direct physical melee skill. Its base damage is 100–140 percent in 10-point rank steps through rank 5, then +5 points per rank; rank 10 is 165 percent. Its conditional bonus is 20–40 points in 5-point steps through rank 5, then +2.5 points per rank; rank 10 is 52.5 points. The bonus applies when the target is currently attacking another living companion. Autonomous targeting prefers, but does not require, such a target.

First Aid resolution must reject targets above 60 percent health. Its effectiveness is a portion of the already rank-scaled normal heal:

```text
target HP >= 60%: 10% effectiveness at exactly 60%, invalid above 60%
target HP 30–60%: linear interpolation from 60% effectiveness at 30% HP to 10% at 60% HP
target HP 10–30%: linear interpolation from 100% effectiveness at 10% HP to 60% at 30% HP
target HP <= 10%: 100% effectiveness
```

The First Aid self and ally threshold controls clamp to 10–60 percent. The UI may display the selected threshold and computed effectiveness, but the interpolation helper and cast validation remain in game logic.

### Overcharge implementation rules

Overcharge bypasses generic effect scaling:

```text
powerBonusPercent(rank):
rank 1–5 = 10 + (rank - 1) × 2.5
rank 6+  = 20 + (rank - 5) × 1.25

cooldownPenaltyPercent(rank):
rank 1–5 = 20 + (rank - 1) × 2
rank 6+  = 28 + (rank - 5) × 1
```

Milestones are 10/20 percent at rank 1, 20/28 at rank 5, 26.25/33 at rank 10, and 32.5/38 at rank 15. Stable Overcharge subtracts `1 × U(rank)` percentage points from the cooldown penalty with a zero floor. A successful Overcharge cast or refresh stores a snapshot of the scaled power and effective cooldown penalty in `SkillOverchargeState`; later rank changes do not mutate the active snapshot. Overcharge and Arcane Crescendo damage bonuses combine additively. Existing duration, refresh-window, enable-toggle, and base-cooldown ownership remains unchanged. The UI reads and displays calculated power and cooldown values rather than reproducing these formulas.

### Runecaster rune-word and word-seal metadata

Every current Runecaster active skill stores exactly two complete rune-word records in an ordered primary/secondary sequence. The definition data preserves Unicode text exactly and exposes it to presentation without using glyph strings or asset paths as mechanical identifiers.

```ts
type RunecasterRuneWordId =
  | "qqen"
  | "asqqen"
  | "tafala"
  | "tazmert"
  | "amesten"
  | "afrag"
  | "ughal"
  | "tudert"
  | "als"
  | "ammas"
  | "aztta"
  | "abrid"
  | "azru"
  | "anya"
  | "asurif";

type RuneWordDefinition = {
  id: RunecasterRuneWordId;
  glyphs: string;
  transliterations: readonly string[];
  meaning: string;
  mechanicalConcept: string;
  sealAssetKey: RunecasterRuneWordId;
};

type RunecasterRuneSequence = {
  primary: RuneWordDefinition;
  secondary: RuneWordDefinition;
  presentationGuidance: string;
};
```

A word seal is a compact visual shorthand for one complete rune-word. It is not a Tifinagh letter and must not be presented as one. Each `RunecasterRuneWordId` resolves to one stable reusable seal asset. The same word always resolves to the same seal, including Qqen in Binding Rune and Rune Step. Seal identity must remain readable by silhouette without relying on color.

Canonical ordered definition data:

| Skill | Primary | Secondary | Ordered concepts |
|---|---|---|---|
| Binding Rune | `ⵇⵇⵏ` — qqen / qqn — `qqen` | `ⴰⵙⵇⵇⵏ` — asqqen / asqqn — `asqqen` | Bind → Tether |
| Rune Lance | `ⵜⴰⴼⴰⵍⴰ` — tafala — `tafala` | `ⵜⴰⵣⵎⵎⴰⵔⵜ` — tazmmart / tazmert — `tazmert` | Lance → Power |
| Warding Glyph | `ⴰⵎⵙⵜⵏ` — amesten — `amesten` | `ⴰⴼⵔⴰⴳ` — afrag — `afrag` | Protection → Barrier |
| Rewind Rune | `ⵓⵖⴰⵍ` — uɣal — `ughal` | `ⵜⵓⴷⵔⵜ` — tudert — `tudert` | Return → Life |
| Runic Focus | `ⴰⵍⵙ` — als — `als` | `ⴰⵎⵎⴰⵙ` — ammas — `ammas` | Repeat → Center |
| Leyline Matrix | `ⴰⵣⵟⵟⴰ` — azṭṭa — `aztta` | `ⴰⴱⵔⵉⴷ` — abrid — `abrid` | Network → Path |
| Stone Sigil Rhythm | `ⴰⵣⵔⵓ` — azru — `azru` | `ⴰⵏⵢⴰ` — anya — `anya` | Stone → Rhythm |
| Rune Step | `ⴰⵙⵓⵔⵉⴼ` — asurif — `asurif` | `ⵇⵇⵏ` — qqen / qqn — `qqen` | Step → Bind |

Validation must assert that all current Runecaster active skills have two known word definitions, all ordered skill pairs are unique, and reused words keep the same object and seal identity. Reversed ordered pairs remain valid for future skills. Future effects should display at most three seals simultaneously and stage any longer future sequence.

Meanings and presentation guidance are the complete entries in GDD.md and must be carried in structured game-logic definitions. Glyph sequences are immutable content: do not normalize their order, invent substitutions, merge the two words, or treat individual letters as independent magical symbols. Compact 32×32 skill icons compose the two stable seals in sequence order. Dedicated 64×64 seal assets and 128×128 battlefield composites prevent large source art from being compressed directly into small UI slots. The Leyline Matrix companion composite is 64×64. Runic Focus specifically places Ammas at the center and Als around it.

The UI list renders the compact ordered two-seal icon and transliterated names. Skill details render exact glyphs, all transliterations, meanings, mechanical contribution, sequence order, and rune-word count with a Neo-Tifinagh-capable fallback font. Runecaster skill books reuse the exact compact skill icon on the class-standard book. React does not recreate rune vocabulary, validate sequences, or infer asset identities. In-world copy must not mention a real-world region.

Current skill effects may include direct damage, lunge damage, sweeping/splash damage, area damage, taunt, multi-taunt, enemy mark bonus damage, self damage buff, ally damage buff, party damage buff, party class buffs, party poison coating, gathering power buff, shield block, absorb shields, mana shields, frost armor, damage mitigation, self mitigation, party mitigation, bind, immobilize, disarm, blind/forced evasion, fake death, silence, poison, burning, bleed, heal, self-percent heal, ally heal, heal-over-time effects, lifesteal, rewind runes, runic focus, overcharge, companion AoE channels, Beginner fallback damage, Beginner emergency recovery, Beginner defensive survival, Beginner support, and passive modifiers.

`skillEffectResolution.ts` owns applying active skill effects after selection, including damage, lunge damage, sweeping damage, area damage, taunt, multi-taunt, mark, self buff, party buff, ally buff, party class buff, poison coating, gather buff, shield block, absorb shields, mana shields, frost armor, damage mitigation, self mitigation, party mitigation, bind, status effects, heal, self-percent heal, self-cost heal, heal-over-time effects, lifesteal, rewind runes, runic focus, overcharge setup, companion AoE channel setup, visual events, combat feedback, cooldown consumption decisions, XP grants, quest defeat progress, and enemy drop handling where relevant.

Current skill rules:

- skills are tied to classes
- roles determine preferred skill usage
- skill tags affect role scoring
- skill tags are typed metadata on skill definitions and may describe targeting, effect family, role scoring, maintenance behavior, mobility, gathering, defensive, support, or self-cost traits
- offensive-spell and area-of-effect classification is explicit typed skill metadata so Arcane Crescendo never infers eligibility from presentation text
- skill selection must validate target, range, cooldown, companion state, and current context
- skill movement helpers must validate map bounds, walls, active resources, and blocking entity collision before moving companions
- direct-commanded companions do not use autonomous active skills
- dead companions do not use skills
- skills may use individual per-skill cooldowns
- skills without an explicit cooldown fall back to the shared skill cooldown value
- current fallback skill cooldown is 10000ms
- Beginner active skills currently use explicit 10000ms cooldowns
- basic attacks and successful skill uses start a companion global cooldown
- current companion global cooldown is 2000ms
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
Current AoE visual intent values are:

```ts
type AoeVisualIntent =
  | "enemyOffensive"
  | "partyOffensive"
  | "partyHealing";
```

AoE visual intent is presentation metadata for renderer feedback. It must not define damage ownership, targeting, faction logic, or simulation behavior.

Current skill runtime state includes marks, self buffs, party buffs, poison coatings, class buffs, overcharges, mana shields, frost armor, heal-over-time effects, lifesteal buffs, rewind runes, runic focus, gather buffs, damage mitigations, absorb shields, self mitigation buffs, party mitigation buffs, binds, shield blocks, status effects, passive charges and sequence memory, recent qualifying kills, source-owned rune effects, companion AoE channels, per-skill cooldowns, companion global cooldowns, and visual events.

`skillProgression.ts` owns learned skill ranks, next-rank book costs, skill-book Study actions, active and passive lookup, companion-aware caps, scaled skill definitions, and legacy-enabled active skill carry-over.

Skill progression behavior:

- all active and passive skills for a newly unlocked class initialize at rank 1
- a Beginner companion has a Beginner cap of 5
- after first-class selection, the Beginner cap becomes 10 and the current first-class cap is 5
- the documented future rule adds 5 to each earlier class tier whenever a later class tier is unlocked; future second- and third-class systems are not implemented now
- rank 5 is a fixed `legacyUnlockRank` for active skills and does not move when a cap increases
- eligible legacy active skills remain individually enabled without an active-skill slot limit
- passive skills are always active after unlock and never use legacy toggles or active-skill slots
- cap lookup must accept companion class-depth context; a skill-only `getSkillMaxRank(skill)` is insufficient
- book cost for target rank `B` is `B(B + 1) / 2 - 2`
- no partial book progress is stored
- a Study command is enabled only when shared inventory contains the full next-rank cost for the matching skill book
- one successful Study command consumes exactly the next-rank cost, advances exactly one rank, and leaves excess books in inventory
- invalid, unavailable, maxed, and insufficient-quantity Study commands consume nothing
- Beginner and first-class skill-book price categories and the item stack limit remain unchanged
- active legacy eligibility checks compare rank to `legacyUnlockRank`, not the current companion-aware maximum
- legacy-enabled active skills enter the active pool only when class-lineage and eligibility checks pass
- no prototype-save migration is required

Shared scaling helpers use:

```text
U(rank):
rank 1–5 = rank
rank 6+  = 5 + (rank - 5) × 0.5

G(rank):
rank 1–5 = rank - 1
rank 6+  = 4 + (rank - 5) × 0.5
```

Supported generic effects gain their normal rank-1-through-5 step through rank 5 and half that step after rank 5. Discrete effects use explicit milestone helpers. First Aid, Follow Through, Guard Up, Overcharge, Arcane Crescendo, Overflowing Grace, and every other bespoke formula must bypass inappropriate generic scaling and match GDD.md.

Do not expand this into a second or full ability framework unless explicitly requested.

Do not add a mana resource, casting framework, advanced targeting, equipment requirements, complex cooldown systems, skill trees, hotbars, or player-triggered active skill input unless explicitly requested.

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

Active role bonuses may provide derived stat modifiers or effective gather speed modifiers.

Primary stat modifiers are included when calculating actual companion stats.

Derived stat modifiers from equipment, consumables, and active role bonuses are included when calculating derived combat stats.

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

- party orders validate leader reachability, blocked positions, target validity, and path distance before updating shared party intent
- rejected party orders leave party intent unchanged and record debug telemetry
- accepted party orders update party intent and assign autonomous member states from that shared intent
- direct companion commands are stored separately from party intent
- direct companion commands can target attack, gather, or move behavior for one companion
- direct companion commands override autonomous behavior for the targeted companion
- direct companion commands do not automatically change other companions
- direct companion commands cancel resurrection participation for the commanded helper
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

`partyIntentState.ts` owns helper behavior for setting party execution intent, setting World Travel targets, queueing current party intent, restoring queued party intent, and synchronizing compatibility fields.

`leaderIntent` remains synchronized from `partyIntent.executionIntent` for compatibility with existing systems and UI.

Party intent may be cleared when a point of interest is reached, combat ends, map transition completes, teleport completes, or recovery intent finishes.

`partyIntentSystem.ts` owns current recovery and self-defense intent behavior. It can queue existing party intent, switch to resurrection recovery or nearby-threat combat, and restore queued intent when recovery ends.

## Prototype Quests and POIs

Prototype quest definitions live in `questSystem.ts` and quest types live in `questTypes.ts`.

Quest NPC, escort, rescue, repair, defend, route unlock, and elite-spawn objective helper behavior lives in `questGuideSystem.ts`.

Quest state is stored on `GameState` as:

```ts
quests: Record<QuestId, QuestState>;
```

Current quest runtime state may include:

- quest drop pity counters by objective id
- repair progress by objective id
- defense started objective ids
- defense spawned wave keys
- quest-spawned enemy ids by objective id
- legacy despawned subzone enemy ids by objective id
- suppressed subzone enemy snapshots by objective id
- suppressed subzone enemy restore timestamps by objective id
- generalized ambient-enemy suppression sessions by quest-scoped group id
- Patron Ward pending activation, active Ward/wave, tracked defenders, retreat/fade/finale timing, route unlock, and legacy-route preservation

Current quest ids are:

- `clear_the_shore`
- `outfit_the_expedition`
- `smiths_first_work`
- `stolen_field_supplies`
- `break_lower_shore_blockage`
- `scout_rise_samples`
- `rescue_the_grove_runner`
- `hold_the_field_cache`
- `open_wolf_causeway`
- `broken_thicket_survey`
- `crawler_shelf_report`
- `find_slimeward_camp`
- `azure_trial`
- `orders_from_the_guild`
- `break_the_ash_camp`
- `into_the_briar_burrows`
- `the_patrons_shadow`

Current quest display names are:

- `clear_the_shore`: Secure the Landing
- `outfit_the_expedition`: Outfit the Expedition
- `smiths_first_work`: First Work at the Smithy
- `stolen_field_supplies`: Stolen Field Supplies
- `break_lower_shore_blockage`: Break the Lower Shore Blockage
- `scout_rise_samples`: Scout Rise Samples
- `rescue_the_grove_runner`: Rescue the Grove Runner
- `hold_the_field_cache`: Hold the Field Cache
- `open_wolf_causeway`: Open the Causeway
- `broken_thicket_survey`: Broken Thicket Survey
- `crawler_shelf_report`: Crawler Shelf Report
- `find_slimeward_camp`: Slimeward Trail
- `azure_trial`: The Azure Trial
- `orders_from_the_guild`: Orders from the Guild
- `break_the_ash_camp`: Break the Ash Camp
- `into_the_briar_burrows`: Into the Briar Burrows
- `the_patrons_shadow`: The Patron's Shadow

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
  | "buy_merchant_item"
  | "craft_item"
  | "inspect_poi"
  | "repair_poi"
  | "defend_area"
  | "rescue_npc"
  | "guide_npc_to_poi"
  | "unlock_route"
  | "defeat_elite"
  | "defeat_quest_spawn"
  | "collect_dungeon_chest"
  | "return_to_poi"
  | "take_guild_notice_board_quest"
  | "own_livestock_creature"
  | "active_party_member_count"
  | "patron_ward";
```

Current implemented quest objective behavior includes defeat counts, enemy quest drop counts, gather counts, reach POIs, inspect POIs, guide NPC escort objectives, rescue NPC objectives, repair POIs, defend areas, route unlocks, elite defeat objectives, tracked quest-spawn defeat objectives, dungeon chest collection checks, equipment equip checks, flask equip checks, Merchant Buy item checks, crafted item checks, taking a matching Guild Notice Board quest, Livestock ownership, active-party size, and Patron Ward charge/defense completion.

`QuestObjectiveDefinition.startSpeech` may provide an NPC id, display name, text, and optional speaker position for one-shot objective-start presentation. `questSpawnTarget` configures a tracked target by enemy type, level, position, optional variant, and encounter band. The `defeat_quest_spawn` objective uses the objective's saved runtime entity-id list as its authority for targeting and kill progress.

Each `QuestDefinition` owns `questGiverPoiId` and `questGiverMapId`. Availability may also require completed quests and a first-class active or resting roster companion. `reconcileQuestAvailability` evaluates those state-derived requirements after relevant quest completion, first-class selection, and save restoration.

`gather_item_count` may omit `resourceType` to match any successfully inventoried resource while retaining map and subzone filters. The `first_class_weapon` equipment requirement inspects current active-companion hand slots for equipment whose kind is `weapon`, whose type is not a Training Sword, and whose allowed-class list includes a first class. Quest acceptance, equipment changes, and restoration call the shared equipment-objective check; completed equipment objectives are monotonic.

`own_livestock_creature` and `active_party_member_count` are state-derived objectives reconciled in game logic after quest acceptance, matching Livestock acquisition, recruitment or roster movement, and save restoration. Incomplete progress reflects current ownership or active-party size; completed progress remains monotonic. Active-party count includes living or dead active members but excludes Inn reserve and Field Team companions.

`guildNoticeBoardQuestIntegration.ts` owns the Board-take-to-quest-progress seam. React invokes that game-logic action rather than coordinating onboarding progress itself. A previously accepted starter contract is state-derived on onboarding acceptance.

Current NPC quest location display and World Travel quest hints are derived UI data from `QUEST_DEFINITIONS` and `QuestState`. Active NPC quests use incomplete objectives in definition order, resolving objective location from `targetMapId` first and then `enemyMapId`; unmapped objectives use the definition's `questGiverMapId`. Ready-to-turn-in and available NPC quests use the same data-driven quest-giver map and render turn-ins as completed without objective lines. Slimeward special-region objectives resolve to Azurefen Hollow / Imp Fen, the nearest routeable parent zone/subzone, instead of dungeon floor route rows. Guild Notice Board quests do not participate in these NPC quest route hints. This UI hint layer must not add persisted quest-location state, new route commands, or Notice Board routing behavior.

`questEntityIndicators.ts` derives UI-only quest entity indicators from current quest state, Guild Notice Board state, and current entities. It returns at most one indicator per entity id. Active incomplete main quest objectives may mark matching living enemies, active resources, guide NPCs, rescue NPCs, or explicit objective NPC/POI entities on the current map. Available and ready-to-turn-in main quests may mark their quest giver NPC. Taken incomplete Guild Notice Board kill objectives may mark matching living enemies by `enemyTypeId`; available and done Notice Board quests do not mark enemies. This helper must not persist indicator state or own quest simulation behavior.

Current prototype quest chain:

- `clear_the_shore` unlocks `outfit_the_expedition`
- `outfit_the_expedition` unlocks `smiths_first_work`
- `smiths_first_work` unlocks `stolen_field_supplies`
- `stolen_field_supplies` unlocks `break_lower_shore_blockage`
- `break_lower_shore_blockage` unlocks `scout_rise_samples`
- `scout_rise_samples` unlocks `rescue_the_grove_runner`
- `rescue_the_grove_runner` unlocks `hold_the_field_cache`
- `hold_the_field_cache` unlocks `open_wolf_causeway`
- `open_wolf_causeway` (Open the Causeway) unlocks `broken_thicket_survey`
- `broken_thicket_survey` unlocks `crawler_shelf_report`
- `crawler_shelf_report` unlocks `find_slimeward_camp`
- `find_slimeward_camp` unlocks `azure_trial`
- completed `azure_trial` plus any first-class active or resting roster companion makes `orders_from_the_guild` available
- `orders_from_the_guild` unlocks `break_the_ash_camp`
- `break_the_ash_camp` unlocks `into_the_briar_burrows`
- `into_the_briar_burrows` unlocks `the_patrons_shadow`

`orders_from_the_guild` completes its objective when the dedicated starter Notice Board contract is taken and grants no rewards. `break_the_ash_camp` uses parallel map-4 objectives for 200 direct kill credits, 20 successfully inventoried resources of any supported type, and one first-class weapon, then grants 1800 character XP through the existing quest reward path and 500 Crowns once.

`into_the_briar_burrows` uses parallel map-5 and roster objectives for 300 direct kill credits, ownership of one `tin_crawler` Livestock creature, and 3 active party members, then grants 2800 character XP and 750 Crowns. Tin Crawler acquisition presentation uses `Tin Crawler Hatchling`, its permanent key item is `Tin Crawler Hatchling Discovery`, and its placed adult Livestock name remains `Tin Crawler`. Existing Tin Crawler ownership completes the objective without consuming the creature or changing its 10%/5%/1% discovery chances.

`the_patrons_shadow` uses three `patron_ward` objectives plus an `elder_mossling` Livestock ownership objective, then grants 4000 character XP and 1000 Crowns. Each Ward accumulates 100 matching direct enemy credits before manual activation. `patronWardState.ts` owns Ward definitions, positions, wave counts, barrier geometry, timing constants, route-open checks, and persistent/transient runtime sanitation. `patronWardSystem.ts` owns click-and-approach activation, mutually exclusive defenses, normal-only quest-defender waves, retreat/wipe/map-exit resets, objective completion, prop fades, the barrier/route transition, legacy map-7 access, and renderer-facing Ward/Warmaster presentation. The route unlock persists before quest turn-in while encounter, fade, and finale timing remain transient.

`directKillCredit.ts` is the shared direct-defeat credit helper. It returns 2 for Superior enemies and 1 otherwise. Direct NPC `defeat_enemy_count` objectives and direct Notice Board kill objectives use it. Quest-item drop rolls remain once per enemy, `defeat_elite` remains one completion, and `defeat_quest_spawn` completes once for the tracked entity id without applying Superior double credit. Aggregate Field Team kill redemption keeps the quantities reported by the estimator without applying Superior credit.

Current quest rewards may include:

- Crowns
- character XP
- inventory item rewards
- equipment item rewards

Merchant interaction is gated by quest progress where implemented.

Merchant Buy can be locked until the equipment tutorial flow allows it.

`questGuideSystem.ts` currently owns prototype quest NPC, rescue, repair, defend, route unlock, elite-spawn, and tracked quest-spawn objective helpers. Patron Ward behavior remains in the focused `patronWardSystem.ts` rather than being hardcoded into the generic guide system.

Current quest objective helper behavior:

- active quest NPCs are created from quest objective data
- guide and rescue NPCs use objective-provided ids, display names, start positions, and target positions
- guide and rescue NPCs spawn only on the target map while their objective is active and incomplete
- guide NPC escort movement starts after leader contact
- guide NPCs pause when no companion is within escort range or nearby living enemies are present
- rescue objectives complete when the leader reaches the NPC after nearby enemies are cleared
- repair objectives progress while a party member or quest guide NPC is near the target and not targeted by an enemy
- defend objectives start from a nearby repair actor, begin their configured ambient-enemy suppression, spawn quest enemy waves, and use repair progress as the defense timer
- defend objectives may opt into waiting for every configured defender wave to be defeated in addition to reaching the repair-duration threshold; objectives without this setting retain timer-only completion
- defend objectives may define one-shot start speech data; the first start transition emits a transient NPC speech cue that React presents through the shared HUD-aware bubble, and save restoration/map transitions clear the cue while the persisted started flag prevents replay
- Open the Causeway configures its defense wave only at repair progress 0, preserving the 10-second repair and the two-Wolf/one-Goblin Thrower composition; the Causeway Worker says `Its an ambush! Protect me!` when the defense starts
- `questAmbientEnemySuppressionSystem.ts` owns reusable begin, maintain, release, restore, clear, and load-sanitization behavior for data-driven `map` or `subzone` suppression
- suppression configuration provides scope, an optional quest-scoped group id, restore delay, and `preserve` or `reroll` variant policy; missing configuration causes no suppression
- active sessions snapshot matching living, dead, respawning, normal, or Superior non-dummy ambient enemies, continuously remove newly introduced matching ambient enemies, and leave quest-spawned enemies untouched
- releasing the last objective owner schedules deterministic safe restoration at full health near authored homes; a new owner in the same group cancels the timer without an intermediate repopulation. The quest-guide update processes the active objective before timed restoration so a newly active owner can claim the group first
- Hold the Field Cache and Defend Wolf Causeway use subzone scope, a 3-second delay, and variant rerolls; all Patron Wards share map scope through `nightmire-wards`, a 2-second delay, and preserved variants
- completed defend objectives clean up living quest-spawned enemies and release their suppression session
- Open the Causeway requires both its 10-second repair and defeat of all three first-wave defenders; its following tracked Superior Wolf objective joins the same `wolf-causeway-encounter` subzone-suppression group, so ambient enemies return only three seconds after the Wolf objective completes
- legacy defense saves with objective-owned despawn ids, snapshots, or restore timestamps are converted into the generalized runtime when valid; malformed or orphaned sessions restore safely instead of leaving enemies absent
- defeat elite objectives ensure the configured elite quest enemy is spawned
- tracked quest-spawn objectives ensure a configured, tracked enemy exists and progress only when its runtime-tracked entity id is defeated; the Causeway objective replaces an old live Elite Wolf with its configured level-8 Superior Wolf, preserving Standard encounter rank and normal Superior drops/rewards
- unlock route objectives complete the current route objective when active
- collect dungeon chest objectives complete when the matching dungeon chest has been collected
- craft item objectives complete when `recordCraftedItemForQuests` observes the matching crafted item

The quest guide and related quest objective helpers are prototype systems.

They must not become a general follower, recruitment, companion NPC, production escort, final event scripting, or final quest framework unless explicitly requested.

Current quest guide constants include:

- `QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS = 3_000`

`questDefenseFocus.ts` resolves encounter focus without quest, Ward, map, or enemy-type allowlists. It recognizes started incomplete `defend_area` objectives, the active typed `patron_ward` runtime, and a current sequential objective that owns or is taking over a live shared ambient-suppression group. The handoff case includes the pending-restoration window between sequential objectives, before the next objective claims ownership. The resolver returns the current quest/objective, its target position, and living quest-spawn enemy ids. While Auto Combat owns party behavior, `poiSystem.ts`, `poiTargetSelection.ts`, and `roleSystem.ts` use that context to clear AI-created resource work, prioritize encounter enemies, hold at the objective position between waves or before a spawn, and keep autonomous Gatherer-role companions with the party. Player-authored party gathering and direct companion commands are preserved. Focus ends when the current encounter objective completes or resets, even if the suppression group still has a pending ambient-restoration delay.

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

`poiSystem.ts` selects global quest intent and coordinates local map target selection for auto-mode behavior.

`poiTargetSelection.ts` builds and scores local POI candidates, handles World Travel route targets, quest targets, Smith crafting targets, wild fallback combat/resource targets, leader subzone restrictions, progressive fallback distance tiers, and stable target reuse.

POI selection should evaluate progression targets before generic map activity.

Current intended POI priority order:

1. active World Travel route target
2. active quest objective target on the current map
3. ready quest turn-in target
4. available quest acceptance target on the current map
5. quest-required prototype teleport when the active objective is on another reachable prototype map
6. reachable wild combat target when combat fallback is relevant
7. reachable wild resource target when gathering fallback is relevant
8. reachable exploration or inspect target
9. safe idle hub point

POI selection should skip targets that are invalid, unreachable, depleted, dead, completed, locked, already satisfied, reserved by autonomous gatherer work, blocked by Stay in Subzone rules, or not relevant to the current map.

POI selection may score candidates by priority, path distance, fallback score, nearby-resource bonus, progressive fallback, local target preference, and stable-target switching rules.

Wild POI selection may reuse a valid target briefly before reevaluating.

Active quest resource POIs may use a longer short commitment window than generic wild fallback POIs.

When an active quest objective targets another subzone on the current map, POI target selection may create a route-to-subzone exploration target using current subzone passage data.

POI selection should record debug telemetry for selected POIs and skipped POIs where useful.

`poiPresentation.ts` owns the UI-facing Leader POI target label. Combat rows resolve `targetEntityId` with `poiId` fallback, prefer the target enemy's broad archetype display name, fall back to its enemy-type display name, and finally use `Enemy`. Non-combat rows retain their POI id presentation. This helper derives labels only and does not change POI selection or simulation state.

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

Current systems and update helpers include:

- Teleport System
- Teleport State helpers
- World Travel Routing helpers
- POI System
- POI Target Selection helpers
- POI Resume System
- Healing Fountain System
- Health System
- Consumable System
- Direct Companion Command System
- Resurrection System
- Role System
- Class Selection helpers
- Skill System
- Skill Behavior helpers
- Skill Progression helpers
- Skill Runtime helpers
- Skill Targeting helpers
- Skill Movement helpers
- Skill Overcharge helpers
- Skill Effect Resolution helpers
- Status Effect helpers
- Companion AoE Channel System
- Party Activity Coordinator helpers
- Party Formation System
- Exploration System
- Defend System
- Follow System
- Quest Guide System
- Enemy AI System
- Enemy Ability System
- Enemy AoE Channel System
- Attack System
- Combat Projectile System
- Drop System
- Slimeward Dungeon System
- Enemy Respawn System
- Gathering System
- Entity Separation System
- Interaction Approach helpers
- Resource Interaction helpers
- Party Order Reachability helpers
- Party Protection System
- World Wipe Recovery
- Map Runtime Cleanup helpers
- Debug Telemetry

Each system reads `GameState`, updates entities through state helpers, runs during simulation ticks, and keeps behavior focused and simple.

Systems must avoid conflicting movement updates.

Each entity should perform only one movement behavior per tick.

Catch-up and special movement should use speed multipliers or delta-scaled movement instead of repeated movement bursts unless explicitly documented.

---

## Game Loop

The game loop runs continuously while enabled, executes systems in order, updates `GameState`, and supports idle/AFK simulation.

Current high-level order:

1. If the Slimeward dungeon chest UI is open, record telemetry and stop the tick early
2. Advance simulation timing, clear frame movement planning, and clear expired combat feedback
3. Update status effects
4. Update rune skill runtime
5. Clear expired skill runtime state
6. Clear expired consumable buffs
7. Update role bonus assignments
8. Process Inn Kitchen auto-cook for eligible companions
9. Synchronize derived max health
10. Apply debug companion infinite health when enabled
11. Update consumable behavior
12. Update active consumable use
13. Synchronize derived max health again after consumable and meal changes
14. Apply debug companion infinite health again when enabled
15. Update world-wipe recovery
16. If world-wipe recovery is pending or changed maps, record telemetry and stop the tick early
17. Update party intent recovery
18. Update resurrection
19. Update party intent recovery again after resurrection changes
20. Update teleport system
21. If teleport is active or map transition happened, record telemetry and stop the tick early
22. Update direct companion commands
23. Build current resource work context
24. Update POI system
25. Update healing fountain system
26. Rebuild resource work context
27. If auto mode is enabled, update role behavior
28. If auto mode is enabled, update active skills and passive runtime
29. If party execution intent, auto mode, or teleport POI movement is active, update party formation movement
30. If auto mode is enabled, reserve exploration movement
31. Update defender behavior
32. If auto mode is enabled, update exploration
33. Update follow behavior
34. Update quest guide escort behavior
35. Update enemy AI
36. Update reusable enemy ability execution
37. Update enemy AoE channel behavior
38. Update companion AoE channel behavior
39. Update party intent self-defense
40. Update combat skills
41. Update attacks
42. Update combat projectiles
43. Update flask recharge from counted enemy defeats
44. Restore interrupted POI target when valid
45. Update passive health regeneration
46. Update target dummy health regeneration
47. Update drop system
48. Update Slimeward dungeon system
49. Update enemy respawn system
50. Update gathering
51. Update resource respawn
52. Update entity separation
53. Update skill shield block positions
53. Idle autonomous party members when no POI or leader intent is active
54. Record current world discovery for supported wild subzones
55. Apply debug companion infinite health again when enabled
56. Record debug telemetry

Movement conflicts are guarded with per-tick moved entity ids, movement intent records, path records, attack slot cache records, and reserved positions.

The Patron Ward system updates before world-wipe recovery so active Ward state can reset cleanly on wipes and map exits. Generalized ambient-enemy suppression updates through the quest-guide stage before enemy AI, ensuring suppressed enemies cannot act or respawn during the defense. Defense-focused POI cleanup and selection occurs in the POI stage before role behavior, so autonomous Gatherer-role companions see the same active-defense context during that tick.

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

Movement planning, collision checks, path retries, movement reservations, party pass-through, swaps, fallback movement, and movement helper behavior live primarily in `movementPlanning.ts`.

Movement frame/tick cleanup helpers live in `movementState.ts`.

Movement-related types live in `movementTypes.ts`.

`state.ts` re-exports selected movement helpers for compatibility with existing callers.

`interactionApproach.ts` resolves reachable stand positions near interaction targets while respecting map bounds, walls, collisions, reserved positions, and path reachability.

`resourceInteraction.ts` owns the current prototype resource interaction range constant.

`entitySeparationSystem.ts` owns lightweight stationary overlap cleanup for selected companions, enemies, and NPCs after normal movement and gathering updates.

Same-party separation treats the current party leader as anchored. When the leader overlaps another companion, only the non-leader companion is nudged away if an available position exists.

Navigation helpers live in `navigation.ts`.

Navigation click helpers live in `navigationClick.ts`.

Movement logic should remain in game logic modules and must not move into React or PixiJS.

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

`partyFormationSystem.ts` currently owns party formation state, shared travel/combat assignment, leader movement toward the point of interest, follower movement toward the leader, and clearing completed movement or combat state.

`partyActivityCoordinator.ts` helps decide whether current party activity is traveling or combat by considering direct player party intent, nearby active threats, party combat targets, movement targets, and current distance.

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
## Direct Companion Commands

`directCompanionCommands.ts` owns direct player orders for individual companions.

Current direct command types are:

```ts
type DirectCompanionCommandType = "attack" | "gather" | "move";
```

Current direct command behavior:

- validates the source companion is living
- validates attack targets, gather targets, move positions, path distance, blocked positions, and resource capacity
- stores active commands in `directCompanionCommandsById`
- replaces any existing direct command for the same companion
- clears resurrection recovery assignment for the commanded companion
- marks the companion with `commandPriority: "direct"`
- updates the companion state to attack, gather, or follow for direct movement
- moves direct-move companions with the direct-command path profile
- allows direct-gather companions to respond to personal threats or movement-blocking enemies
- completes or cancels commands when targets become invalid, resources are full, companions die, or move targets are reached
- starts a short rejoin grace period after normal completion or cancellation
- records direct command issue, rejection, replacement, completion, cancellation, and grace telemetry

Current direct command constants:

- `DIRECT_COMMAND_MAX_PATH_DISTANCE = 30`
- `DIRECT_COMMAND_REJOIN_GRACE_MS = 1500`

Direct commands are prototype player intervention behavior, not a hotbar, RTS control framework, or final input model.

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

Aegis shield-block skill behavior is handled by the skill system, not by the defender system directly.

---

## Attack System

`attackSystem.ts` owns combat execution.

`combatBasicAttackResolution.ts` owns applying basic attack impact effects such as damage, XP, quest defeat progress, drops, fight-back state, and party protection triggers.

`combatProjectileSystem.ts` owns active combat projectile travel and delayed projectile impact resolution for supported basic attacks and focused abilities.

`combatProjectileProfiles.ts` owns current basic projectile profile selection for Hunter companions and ranged enemy combat styles.

`attackSlots.ts` supports selecting attack slots around a target.

`companionCombat.ts` and `defenderCombat.ts` provide companion-facing combat helpers.

Current attack behavior:

- attackers require a valid combat target
- attackers cannot basic attack while an active status effect blocks attacks
- attackers move toward targets if out of range
- attackers can select attack slots around a target
- attackers attack when in range and cooldown is ready
- companion basic attacks use the prototype attack range
- Hunter basic attacks currently use a longer prototype range and launch basic arrow projectiles
- ranged enemy combat styles currently launch basic projectile visuals, and Ember Imp may launch its separate Fire Bolt ability projectile
- enemies may use archetype or entity-specific attack ranges
- enemies may use entity-specific attack cooldowns
- enemies use a short basic attack windup before impact or projectile launch
- attackers can take a small final positioning step when just outside range
- damage is resolved through `combatResolver.ts` using derived combat stats, mitigation, evasion, forced evasion, block, critical hits, defense buffs, absorb shields, mana shields, frost armor, next-attack bonuses, and skill damage modifiers
- skill damage modifiers, class buffs, party buffs, lifesteal buffs, passive modifiers, and status-driven next-attack bonuses can affect combat impact
- shield blocks, absorb shields, mana shields, frost armor, defense buffs, and mitigation buffs can reduce, absorb, block, reflect, or respond to incoming damage where implemented
- defeated targets enter dead state
- enemies attacked by party members fight back
- party members may assist nearby party combat targets
- party protection is triggered when enemies damage party members
- party members gain XP when enemies are defeated by party attacks
- enemy defeats can progress prototype quests
- enemy defeats can trigger prototype drop rolls

Current basic attack constants and helpers:

- `DEFAULT_COMPANION_ATTACK_RANGE = 1`
- `HUNTER_BASIC_ATTACK_RANGE = 4`
- `BASIC_PROJECTILE_SPEED = 12`
- `BASIC_PROJECTILE_IMPACT_RADIUS = 0.3`
- `ATTACK_COOLDOWN_MS = 2000`
- `ENEMY_ATTACK_WINDUP_MS = 500`
- `TARGET_SWITCH_DISTANCE = 6`
- enemy attack range may come from enemy entity data, enemy type data, enemy archetype defaults, or the default enemy attack range

Combat movement order uses role priority for party members.

---

## Status Effects

`statusEffects.ts` owns current prototype status-effect storage, expiry, action gating, damage-over-time ticking, forced evasion consumption, next-attack bonus consumption, defense bonus aggregation, and aggro-drop helpers.

Current status-effect types include:

- `taunted`
- `immobilized`
- `incapacitated`
- `disarmed`
- `silenced`
- `fakeDeath`
- `forcedEvasion`
- `nextAttackDamageBonus`
- `poison`
- `burning`
- `bleed`
- `defenseBuff`

Current status-effect behavior:

- movement is blocked by `immobilized` and `incapacitated`
- basic attacks are blocked by `incapacitated` and `disarmed`
- skill use is blocked by `incapacitated` and `silenced`
- gathering is blocked by `incapacitated`
- fake death can make enemies ignore or drop the affected companion where supported
- forced evasion is consumed by the next eligible incoming attack
- next-attack damage bonus is consumed by the next eligible outgoing attack
- poison and burning deal magic damage over time
- bleed deals physical damage over time
- damage-over-time effects can expire, tick, kill targets, grant XP, progress quests, and trigger drops through normal damage resolution where supported

Status effects are skill/combat runtime, not a full crowd-control, buff/debuff, dispel, resistance, or condition-stacking framework.

---

## Companion AoE Channel System

`companionAoeChannelSystem.ts` owns current party-side AoE skill channel runtime and impact resolution.

Current companion AoE channel behavior:

- stores active companion AoE channels by caster id
- resolves supported companion AoE impacts after their channel timing completes
- removes the channel after impact or invalidation
- Shield Shockwave damages nearby enemies and can apply bind runtime
- Maul Sweep damages nearby enemies and can apply `disarmed`
- companion AoE impact can grant XP, progress quest defeat objectives, and trigger enemy drops through normal combat resolution where supported

Companion AoE channel runtime is skill runtime and should stay in game logic.

---

## Enemy AoE Channel System

`enemyAoeChannelSystem.ts` owns current enemy-side AoE channel runtime and impact resolution.

Current enemy AoE channel behavior:

- stores active enemy AoE channels by caster id
- stores enemy AoE cooldown state by caster id
- supports channeling and windup phases
- supports current AoE dummy stomp behavior
- supports current Heavy Slime stomp behavior
- interrupts channels when the caster dies, becomes bound, or loses required line of sight where implemented
- skips fake-death companions during eligible impact targeting
- resolves AoE impact through normal damage resolution where supported

Enemy AoE channel runtime is prototype combat runtime and should not become a final boss scripting, telegraph, encounter, or raid-mechanic framework unless explicitly requested.

---

## Enemy Ability System

`enemyAbilities.ts` owns renderer-neutral reusable enemy ability definitions. `enemyAbilitySystem.ts` owns their focused enemy-only execution runtime.

Current reusable enemy ability behavior:

- enemy type definitions may provide ordered `abilityIds`; list order is deterministic selection priority
- definitions provide a display name, range, cooldown, cast duration, optional windup duration, and a focused effect resolver
- unknown definitions, missing resolvers, active cooldowns, out-of-range targets, and otherwise invalid candidates are skipped so the next configured ability or the normal basic attack can proceed
- selection occurs only when a living attacking enemy has a valid target, its normal attack action is ready, no basic-attack windup or enemy AoE channel is active, status and bind rules permit skill use, and no basic attack is currently required
- cast start snapshots caster origin, target id, target position, and normalized targeting direction, starts the absolute cooldown immediately, and sets the required-basic-attack gate
- active casts prevent enemy chase and basic attacks; enemy AoE channels cannot start over them
- effect resolvers receive the locked snapshot plus the current caster and target so a concrete ability can deliberately use fixed-position, updated-position, or entity-tracking behavior
- successful resolution and interruption both reset the caster's normal attack timer; interruption preserves cooldown and the required-basic-attack gate
- melee clears the gate when impact resolution is attempted, while ranged basic attacks clear it when their projectile launches; blocks, dodges, and misses still count as committed attacks
- death, removal, invalid or fake-death targets, taunt, incapacitation, silence, and existing bind runtime cancel active casts; immobilization alone does not, and disarm remains basic-attack-only control
- respawn and entity-removal cleanup discard per-enemy cast, cooldown, and gate records
- map transitions discard all reusable enemy ability runtime for departing enemies
- save restoration cancels active casts, preserves sanitized unexpired cooldown expiration timestamps and valid required-basic-attack gates, and requires no save-version bump because the fields are optional

The production registry contains `fire_bolt`, the Tin Crawler and Shieldbearer Fortifying Aura variants, the Night Bat and Raider Rending Dash variants, and the Warmaster's Rending Dash, Kick, Patron Cleave and Patron Burst definitions. Enemy types retain ordered references rather than copies of their execution logic.

`fire_bolt`, assigned only to Ember Imp, uses a 5-unit selection range, 0.9-second cast, 0.3-second release windup, and 6-second cooldown starting at cast initiation. Its resolver launches a homing projectile from the cast's locked origin at 8 world units per second with a 0.35-unit impact radius, then resolves 1.5-times enemy attack as direct magic damage through existing combat rules. The projectile uses the semantic `enemy_fire_bolt` visual profile, reusing the existing Imp fireball asset at 32 by 32 pixels, and supplies `Fire Bolt` as its impact label. Fire Bolt does not add Burn, splash, ground fire, straight-line collision, or a new resource system.

Ability handlers should delegate to existing damage, projectile, status-effect, and shared AoE helpers. This focused runtime does not replace enemy AI, the current enemy AoE channel system, companion skills, or the future full ability and casting framework.

### Warmaster Attempt and Patron Power

`orcWarcampLayout.ts` owns pure authored arena bounds and placement anchors shared by map geometry, Barrack definitions and Boss simulation, without renderer/runtime imports. The compact arena spans X80.5–108.5 and Y21.5–51.5; map reconstruction fills its reclaimed northern footprint with terrain. `warmasterState.ts` owns renderer-neutral attempt/transfer types and the pure death-recording seam. `state.updateEntity` records genuine alive-to-dead enemy transitions centrally, covering direct damage, projectiles, AoEs and DoTs. Only Grunts, Raiders and Shieldbearers inside the active arena qualify, including owned Barrack reinforcements; one death produces one transfer regardless of Superior kill-credit multipliers. A later respawned enemy can qualify again, while duplicate dead updates cannot.

`warmasterSystem.ts` starts attempts on living active-party arena entry, advances transfers, applies non-compounding size changes and resets living attempts. Optional `warmasterAttempt` stores Boss/attempt identity, power, pending transfers, retreat timing and speech state. Transfers store corpse origin and a one-second arrival deadline; simulation, not animation, awards power. Due arrivals are consumed once in timestamp order, including across large time advances. Power caps at ten, discards overflow and persists without decay until the attempt ends or resets; no decay deadline is stored.

The Warmaster's enemy definition authors 1,500 max HP through optional `EnemyTypeDefinition.maxHealth`. Enemy construction prefers an explicit spawn override, then authored type HP, then ordinary level scaling; respawning reuses that construction path. Boss attempt reset/restoration reconciles legacy max HP to the current definition, fully heals only living Bosses and leaves dead Bosses dead. Azure Mass's existing 900-HP spawn override is unchanged. Barracks use one shared 12,000ms preparation constant for the first and subsequent reinforcements, including after rebuilding; existing pause, cap and pending-roll behavior remains unchanged.

Warmaster ability priority is Burst → Cleave → Kick → Dash. `canStart` gates Cleave at five power and Burst at ten; these thresholds remain met for the rest of the attempt. Shared AoE resolution locks the six-unit 90-degree cone and radius-four circle once for selection, telegraphing and exactly-once physical hits. Kick uses a locked origin/target and terrain-aware melee validation at resolution; evasion prevents displacement, but a blocked or shielded hit still pushes a surviving target. The Warmaster definition reuses the existing Rending Dash factory, deferred completion, clipping, safe landing and swept-hit implementation.

`Enemy.combatSizeMultiplier` scales the authored combat radius and renderer sprite/aura from 1 to 1.5 without modifying stats or AoE dimensions. Optional `movementBounds` constrain only explicitly bounded enemies, while `minimumMovementBodyRadius` reserves maximum-growth terrain clearance. `enemyMovementBounds.ts`, movement planning, AI chase and dash planning share these checks; other enemies retain existing leash behavior. Size changes invalidate movement/attack-slot caches rather than doing so on every animated aura frame. Dash runtime snapshots its body scale for static afterimages.

Wipes, three seconds of arena absence, map exit, encounter reset and restoration clear the attempt. A living Boss returns to full health at a safe home position with base size and fresh action runtime; a dead Boss is not revived. This is a narrow Boss-attempt exception to normal restored enemy cooldown/gate preservation. Barrack runtime, ownership and rebuild deadlines remain independent. Issue #681 still owns recharge, gate availability and later encounter lifecycle.

### Reusable Forced Movement

`forcedMovement.ts` owns optional `forcedMovementsByEntityId` and focused start/update/cancel helpers. Each record locks source/target identity, origin, direction, distance, movement timestamps and the latest safe landing. Terrain sampling respects map bounds, walls, structures, resources, full companion capsules and enemy circles. Living actors may be crossed; destinations must be unoccupied and respect movement/dash reservations. Revalidation only shortens travel backward on the locked line; there is no lateral redirection or rebound.

Kick requests four units over 0.25 seconds, with duration shortened proportionally when clipped. Updates check intervening terrain even under large deltas and report moved entity IDs. Shared movement, attack, skill, gathering, consumable and resurrection guards suspend actions during displacement; direct-command processing preserves pending player orders. Starting displacement cancels active channels and conflicting motion. Death/removal, map cleanup, reset and restoration clear it; the source's later death alone does not cancel launched motion. Restoration uses a valid saved last-safe position rather than leaving a target mid-overlap. All fields remain optional and transient; no save-version bump or general physics framework is introduced.

### Warmaster Presentation

React passes the simulation attempt to the full renderer without owning transfer timing or power rules. Existing Orc aura frames loop behind arena Orcs and the Boss on a dedicated container below the entity layer, so cached sprite creation/reuse cannot place them in front. The same behind-entity layer carries energy-transfer copies, which interpolate toward the Boss's current rendered position until the simulation deadline. Sprite and aura scale together; overhead power, red cast labels, locked telegraphs and existing tinted dash afterimages remain renderer-owned.

The shared HUD-aware speech binding also accepts enemy speakers, including the first-transfer line `Their borrowed power returns to me!`, using the existing five-second duration and final half-second fade. Attempt, body scale, transfers and forced motion participate in render signatures, bounds-based culling, timed work and final cleanup frames. These extra effects and speech are excluded from the minimap. Existing assets are reused without asset-library changes.

---

## Enemy Archetypes

`enemyArchetypes.ts` owns lightweight prototype enemy archetype defaults and enemy type setup data.

### Encounter Bands

Encounter bands belong to individual authored enemy spawns, not enemy types or archetypes. `EnemyStartData.encounterBand` accepts `standard`, `elite`, `champion`, or `boss`; missing authored values resolve to `standard` when an enemy is created. Runtime `Enemy.encounterBand` carries the resolved value through map reconstruction and respawn. Respawn preserves the current enemy's band.

Encounter bands are independent of the optional `superior` enemy variant. Superior spawning may strengthen a Standard spawn without changing its band. Bands currently provide classification and hover inspection only; they do not alter combat stats, AI, rewards, drops, or quest behavior. The React enemy hover tooltip shows Elite, Champion, or Boss and omits the row for Standard enemies. World nameplates remain unchanged.

Save sanitation matches current-map enemies against authored spawn IDs and uses the authored band when available. For dynamic or otherwise unmatched enemies, it preserves a valid saved band and defaults missing or invalid values to `standard`. These optional fields require no save-version migration.

The Azure Mass and the retained Orc Warmaster spawn are authored as Bosses. Orc Warcamp has one Orc Warmaster spawn. Boss design is expected to align with tier-boundary challenges; this is guidance for content authoring, not a runtime scaling rule.

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
  | "green_slime"
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
- enemy types define setup data such as level, attack cooldown, detection range, attack range override, temperament, combat style override, target preference, and an optional ordered reusable ability-id list
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
- skips normal enemy respawns while the enemy's subzone is suppressed by an active defend-area objective or its post-completion restore delay

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

`resourceRespawnSystem.ts` owns current prototype resource node respawn behavior for authored wilderness resources.

Current resource respawn behavior:

- uses current map id or current map data to find authored resource start data
- records `depletedAtMs` when an authored active-map resource first becomes depleted without a timestamp
- respawns authored depleted resources after the respawn delay
- recreates the node from authored start data at its authored position
- restores full durability and quantity through normal resource creation
- preserves authored resource type and tier
- clears stale `depletedAtMs` from active resource nodes

Current resource respawn constant:

- `RESOURCE_RESPAWN_DELAY_MS = 30_000`

Resource respawn is prototype AFK support behavior.

It should not become production resource scheduling, a final gathering economy, persistent world spawning, or profession progression unless explicitly requested.

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
- `depletedAtMs`

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

When an authored wilderness-map resource remains depleted for `RESOURCE_RESPAWN_DELAY_MS`, it may be rebuilt at its authored position with full durability and quantity.

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

Resource hover details are built outside React rendering in `resourceTooltip.ts`.

Current resource hover details include:

- produced item display name from resource type and tier
- resource type
- tier
- durability
- current quantity only

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
  | "skill_book"
  | "equipment"
  | "quest"
  | "event";
```
Skill book item ids are part of `ItemId`.

Current skill book items map one inventory item to one `SkillId` through `skillBookSkillId`.

Skill-book reading logic lives in `skillProgression.ts`, not in React UI or merchant logic.

Skill-book behavior:

- skill books are normal inventory items with `category: "skill_book"`
- skill books are stackable and currently use `maxStack: 99`
- each skill book points to exactly one `SkillId` through `skillBookSkillId`
- `getSkillBookReadCandidates` returns learned companions that can be presented for the selected book together with their next-rank requirement and availability state
- `canCompanionReadSkillBook` distinguishes `eligible`, `insufficient_books`, `unavailable`, and `maxed`
- `readSkillBook` validates item definition, known skill id, companion id, learned skill availability, companion-aware max rank, next-rank cost, total matching inventory quantity, and exact inventory removal
- failed skill-book Study actions do not remove books from inventory
- a successful Study action removes exactly the next-rank requirement across matching shared-inventory stacks and advances exactly one rank
- inventory quantity beyond the next-rank requirement remains in inventory and never spills into a second rank
- skill progression sanitization keeps known skill ids, clamps ranks to companion-aware caps, preserves valid legacy-enabled active skill ids, and ensures every unlocked class's active and passive skills remain learned

Skill-book asset composition follows one technical standard:

- composed skill-specific 32×32 books live under `client/public/assets/items/skill-books/<class>/`
- icon-free class covers, source art, and review sheets are generation inputs rather than runtime assets; after Ticket 0523 they are retained in the external Library archive instead of under `client/public`
- the external Library archive is not part of the Git repository and is not required by the game at build time or runtime
- every composed book overlays the exact icon mapped to the skill on its class cover at native output size; active and passive books use the same rule
- the historical Ticket 0512 and Ticket 0516 generation scripts are retained with their inputs under the external Library archive at `Unused assets/MMOPartySimulator/tracked/client/scripts/`; they are provenance records rather than project-local tooling or build/runtime dependencies
- current class cover colors are Blade `#8E2634`, Aegis `#4F718C`, Hunter `#3F6B46`, Beast `#234D35`, Elementalist `#177C82`, Runecaster `#6846A5`, Lightbearer `#BBC2CC`, and Penitent `#3B4148`; Beginner retains its parchment source color
- Beast uses a `0.68` cover-lightness multiplier and Penitent uses `0.58` so their covers remain distinct from Beginner and Lightbearer respectively
- composition should begin from native small-format cover and icon assets rather than shrinking a large generated book into the 32×32 inventory slot

The shared prototype wallet is stored on `GameState` as `wallet`.

Wallet logic lives in `wallet.ts`.

Current currency id:

- `crowns`

Currency does not use inventory slots.

Prototype key item logic lives in `keyItems.ts`.

Key items are stored on `GameState` as:

```ts
keyItemsById?: KeyItemsById;
```

Current key item behavior:

- key items are slotless and do not use inventory or bank capacity
- key item quantities are sanitized by known key item id
- key items may be awarded directly or only-if-missing
- owned key items may unlock direct World Travel teleport options
- current key item definitions include Teleportation Echo entries for Harbor Union Bastion and Slimeward Camp

Short-lived global feedback logic lives in `newsBroadcast.ts`.

News broadcasts are stored on `GameState` as:

```ts
newsBroadcasts?: NewsBroadcastEvent[];
```

Current news broadcast behavior:

- broadcasts are queued with text, creation time, and expiry time
- unlock broadcasts currently use `Unlocked: {displayName}`
- expired broadcasts are pruned by `updateGame`
- news broadcasts are transient UI feedback and are cleared by save sanitization

Prototype bank logic lives in `bank.ts`.

Bank state is stored on `GameState` as:

```ts
bank: PartyBank;
```

Current bank state:

```ts
type BankAutoRoutingMode =
  | "keep_inventory"
  | "deposit_body_parts"
  | "deposit_all";

type PartyBank = {
  capacity: number;
  slots: BankSlot[];
  lockedSlotIndices: number[];
  autoRoutingMode: BankAutoRoutingMode;
};
```

Current bank behavior:

- uses a fixed prototype capacity of 100 slots
- stores items separately from shared inventory
- accepts inventory items except quest items
- supports manual deposit, manual withdraw, and deposit-all helpers
- requires a living leader and a `bank_chest` NPC in the current town hub for manual transfer by default
- may be viewed remotely through UI while transfer actions remain gated by current-hub Bank service availability
- supports bank slot locks and inventory slot locks for bank movement
- supports auto-routing modes for keeping inventory, depositing eligible enemy-part materials, or depositing all eligible non-quest items
- sanitizes missing or old-save bank state into valid default bank state

Prototype Smith crafting logic lives in `crafting.ts`.

Current crafting behavior:

- recipes may output inventory items or slotless key items
- recipe costs may require inventory item quantities, matching previous equipment, and Crowns
- crafting requires a leader and a `smith` NPC in the current town hub
- crafting ignores locked inventory slots when counting or consuming requirements
- crafting does not count equipped or banked equipment toward previous-equipment requirements
- item outputs require inventory capacity after consumed inputs are accounted for
- key item outputs do not require inventory capacity and cannot be crafted again when already owned
- successful item crafting routes inventory mutation through inventory helpers
- successful key item crafting routes unlock feedback through news broadcasts
- successful crafting can record quest progress through quest progression hooks
- crafting attempts, successes, and failures can record debug telemetry when telemetry recording is enabled

Current crafting recipes include:

- the Harbor Union Bastion Teleportation Echo key item recipe
- level 1, 5, 10, and 15 prototype equipment recipes where matching item definitions exist
- previous-equipment upgrade requirements for supported level 5 and level 15 recipes

Prototype consumable logic lives in `consumables.ts`.

Current consumable kinds are:

- flask

Current consumable behavior:

- companions may equip one flask
- flasks use charges, cooldowns, use duration, healing, and optional temporary buffs
- auto-flask behavior can start flask use at or below a companion HP threshold
- equipped flasks can be refilled by the hub healing fountain
- equipped flasks gain one charge after 20 counted enemy defeats
- consumable buffs feed into companion stat calculations

Food-style buffs are owned by the Inn Kitchen, not by inventory consumable assignment.

Inn Kitchen logic lives in `innKitchen.ts` and related upgrade/presentation helpers.

Current Inn Kitchen behavior:

- stores per-companion active meal buffs on `innKitchen`
- stores per-companion selected recipe, auto-cook enabled state, and renewal threshold preferences
- regenerates and spends Hearth's Fire
- supports House Bread as the current MVP recipe
- applies Inn meal stat effects through state-aware stat helpers
- keeps Recipe Book, Pantry, salt booster placeholder, Hearth's Fire, and Kitchen upgrade data separate from shared inventory consumables

Enemy drop logic lives in:

- `dropTables.ts`
- `dropSystem.ts`

Drops roll by enemy archetype, enemy type exceptions, loot tier, and optional Superior variant, create short-lived drop visual events, and route completed drops into shared inventory.

Drops do not create persistent ground loot.

Current drop table ids are derived from enemy archetype, loot tier, optional Superior variant, and selected enemy-type exceptions.

```ts
type DropTableId =
  | `${EnemyArchetypeId}_tier_${LootTier}_drops`
  | `${EnemyArchetypeId}_superior_tier_${LootTier}_drops`
  | "azure_mass_tier_1_drops"
  | "goblin_shaman_tier_2_drops"
  | "goblin_shaman_superior_tier_2_drops";
```

Current drop tables are keyed by enemy archetype, enemy type exceptions, loot tier, and optional Superior variant.

Loot tier is currently derived from enemy level.

Current loot tier behavior:

- level below 10 maps to tier 1
- level 10 or higher maps to tier 2
- supported loot tiers are currently 1 and 2

Current drop table behavior:

- archetype drop tables may roll common and rare enemy-part material drops
- Superior archetype drop tables may roll higher-yield prototype enemy-part material drops
- enemy-type drop tables may add special exceptions
- `azure_mass` currently has a type-specific Tier 1 Slime loot table
- `goblin_shaman` currently has a low-chance Tier 2 Holy Lantern equipment drop
- Superior `goblin_shaman` currently has a higher prototype Tier 2 Holy Lantern equipment drop chance
- missing archetype, enemy-type, variant, or tier tables simply produce no drops from that table

Current prototype enemy-part material item ids:

```ts
type EnemyPartItemId =
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
- exposes fixed prototype Merchant Buy stock
- supports buying selected equipment, flasks, and skill books for Crowns
- validates merchant identity, stock membership, item category, price, wallet balance, inventory capacity, and quest gating
- adds purchased items to shared inventory
- supports stock filtering by main group, secondary filter, minimum level requirement, maximum level requirement, and party equipment compatibility where implemented
- always allows flask and skill-book stock entries through stock compatibility filtering
- treats party-compatible filtering as an equipment compatibility filter, not a flask or skill-book visibility rule
- does not quick-exchange or sell enemy-part materials in the current prototype
- records merchant buy, inventory, wallet, and quest-gating telemetry

Current Merchant Buy stock groups are:

- `flasks`
- `books`
- `weapons`
- `offhands`
- `cloth`
- `leather`
- `mail`
- `plate`
- `accessories`

Current Merchant Buy filter inputs include:

```ts
type MerchantBuyFilter = "all" | MerchantStockGroup;

type MerchantStockFilterOptions = {
  mainFilter?: MerchantBuyFilter;
  secondaryFilter?: string | null;
  minLevelRequirement?: number | null;
  maxLevelRequirement?: number | null;
  partyCompatibleOnly?: boolean;
};
```

Current Merchant Buy stock includes Beginner and first-class books for all implemented active and passive skills. Existing Beginner and first-class price categories remain unchanged.

Merchant stock, pricing, filtering, quest gating, buying, wallet mutation, and inventory mutation must remain in `merchant.ts` and related game-logic helpers.

React may display merchant stock and issue buy/filter commands, but must not define merchant stock, prices, compatibility rules, wallet rules, or inventory mutation rules.

Merchant Sell is a limited prototype flow owned by `merchant.ts` and related game-logic helpers.

Current Merchant Sell behavior:

- accepts a Merchant id, fixed shared-inventory slot index, and requested quantity
- resolves current slot contents, lock state, eligibility, per-unit value, and total payout in game logic at confirmation time
- sells items found in the current regular Merchant Buy stock for 100 percent of their current Buy price
- sells items with `materialKind: "enemy_part"` for their explicit positive integer `value`
- gives Merchant-stock pricing precedence if an item ever satisfies both pricing paths
- rejects equipped items, banked items, locked inventory slots, quest items, event items, key items, gathered resource materials, Farm ownership, Livestock ownership, invalid quantities, missing values, and other ineligible items
- removes exactly the requested quantity from the selected fixed inventory slot and adds the exact Crown total through existing inventory and wallet helpers
- treats the inventory removal and wallet payout as one atomic gameplay transaction
- records Merchant Sell attempt, failure, item removal, currency addition, and completion telemetry
- does not reverse completed Merchant purchase quest progress
- does not include Sell All, automatic selling, remote selling, purchase provenance, dynamic prices, or a full shop economy

Enemy-part values are explicit item-definition data. Their initial balance follows the difficulty of the easiest normal enemy that drops the part: the common value is `ceil(source level / 3)` and the matching rare part is worth four times that common value. Parts shared across multiple enemy levels use the easiest normal source. Superior enemies retain the same per-unit value because their increased quantities already carry the Superior reward.

While `outfit_the_expedition` is active and `buy_first_aid_skill_book` is incomplete, game logic allows First Aid as the only Merchant purchase. Other regular Buy stock remains visible but disabled, Farm Seed and Livestock purchase actions are disabled, and Merchant Sell remains available. The normal purchase options unlock immediately after a successful First Aid purchase. Selling First Aid later does not reverse the completed purchase objective.

React may filter Sell entries by all sellable items, Merchant items, or enemy parts; select a fixed inventory slot; control a clamped whole-number quantity; and display a live `quantity * unit value` total. React must not define sell eligibility, values, tutorial purchase gating, inventory mutation, wallet mutation, or transaction results.

Dynamic shop inventory, shop restocking, price simulation, and a full shop economy are not implemented.

Guild & Inn service logic lives in:

- `guildTavern.ts`
- `guildRecruit.ts`
- `guildRecruitUpgrades.ts`
- `guildNoticeBoard.ts`
- `guildSecondaryParties.ts`
- `guildSecondaryPartyAssignments.ts`
- `innRoomUpgrades.ts`
- `innKitchen.ts`
- `innKitchenUpgrades.ts`

Current Guild & Inn behavior:

- identifies Guild & Inn service anchors by `npcRole: "guild_coordinator"` or `npcRole: "tavern_keeper"`
- uses the shared current-hub NPC availability rule to gate service actions
- allows Guild & Inn pages to be viewed remotely where UI supports reference-only access
- keeps service action validation in game logic, not React
- stores active party, resting reserve, Field Team, recruit, board, upgrade, room, Kitchen, Hearth's Fire, and world discovery state on `GameState`

Current Guild Recruit behavior:

- stores recruit candidates, refresh timing, generated candidate details, and sequence data
- routes recruited companions to active party first, then Inn reserve when possible
- uses Guild recruit upgrades for slots, level range, refresh speed, equipment chance, and skill chance

Current Guild Notice Board behavior:

- stores board slots, refresh timing, seen state, regular quest sequence, rerolls, starter acceptance, category, description, and taken/done quest progress
- records enemy-defeat progress only after board quests are taken
- supports available, taken, and done board quest states
- claims completed board rewards through board interaction
- uses board upgrades for slot count, reward quality, refresh speed, and Scout rerolls
- derives daily reroll limit from Guild Scouts plus active Livestock helper bonuses from placed, fed Wolves
- provides reusable Assault and Extermination title/template helpers while leaving Rummage and Forage generation unimplemented
- creates the fixed `guild-notice-board-starter-ash-goblin-encampment` contract outside normal sequence ids, with 50 Ash Wisp and 50 Ember Imp objectives and the existing 100-Crown-plus-skill-book reward path
- protects the available starter contract from scheduled refresh and reroll, continues rerolling other eligible slots, and consumes no reroll when no slot can change
- preserves existing saved slots and progress; after the starter is accepted, cancellation, completion, claiming, and replacement use the ordinary Board lifecycle

Current Field Team behavior:

- stores unlocked Field Teams, roster slot assignments, upgrade state, and assignment state
- keeps assigned Field Teams invisible in the world renderer
- uses shared AFK estimator output for assignment reward generation
- blocks roster movement for assigned Field Teams until they are returned
- lets redeemed assignment kills contribute to active Notice Board quests where allowed

Current Inn behavior:

- Rooms are a read-only companion overview using roster state and Inn room capacity upgrades
- Kitchen owns per-companion meal buffs, selected recipes, auto-cook preferences, Hearth's Fire, Recipe Book, Pantry, and Kitchen upgrades
- Inn meal effects are applied through state-aware stat helpers instead of prototype consumable equipment

Farm and Livestock service logic lives in:

- `farm.ts`
- `livestock.ts`
- `livestockHelperBonuses.ts`

Current Farm behavior:

- identifies Farm service anchors by `npcRole: "farmer"`
- uses the shared current-hub NPC availability rule to gate Farm actions
- keeps Farm action validation, crop unlocks, production timing, upgrade costs, holding caps, fertilizer rolls, harvest, pantry transfer, and telemetry in game logic
- uses data-driven crop definitions for Carrot, Potato, Moonleaf, Bittercap Mushroom, and Ashpepper
- stores crop plots on `GameState.farm` as permanent field discoveries with per-crop Speed, Harvest Cap, and Fertilizer upgrade levels
- currently uses a 20-minute baseline crop interval, 1 crop per cycle, and a 20-crop baseline holding cap before upgrades and helper bonuses
- routes harvested crop output into `innKitchen.pantry` and does not create normal inventory items for crops
- includes active Elder Mossling helper bonuses from Livestock in Farm generation timing and presentation rates

Current Livestock behavior:

- identifies Livestock service anchors by `npcRole: "livestock_keeper"`
- uses the shared current-hub NPC availability rule to gate Livestock actions
- keeps grid placement, footprint validation, ownership, production timing, feeding, hungry pause/resume, upgrades, unlocks, collection routing, helper bonuses, and telemetry in game logic
- stores owned creatures, placed creatures, building upgrades, animal upgrades, feed day tracking, and holding quantities on `GameState.livestock`
- uses data-driven creature definitions for Duskhen, Wolf, Tin Crawler, and Elder Mossling
- currently uses a 3-hour baseline output interval, 1 output per cycle, 20-output baseline holding caps, and 10 feed per day before upgrades
- routes Eggs to `innKitchen.pantry` and routes Tin Ore to shared inventory until the Smithy rework changes the destination
- derives helper bonuses only from placed, fed Wolves and Elder Mosslings

Merchant, gathering, and enemy-drop hooks can unlock Farm crops or Livestock creatures:

- Merchant Farm Seeds currently sells Potato Seed
- Merchant Livestock currently sells Duskhen Egg ownership
- tier 1 herb gathering can unlock Moonleaf Seed
- tier 1 wood gathering can unlock Bittercap Mushroom Spores
- Ash Wisp defeats can unlock Ashpepper Seed
- Wolf, Tin Crawler, and Elder Mossling defeats can grant creature discoveries
- seed and creature discoveries are represented through key items and system state, not normal inventory clutter

This prototype inventory/wallet/key-item/bank/consumable/drop/merchant/crafting/Farm/Livestock layer does not include persistent ground loot, full selling beyond the current prototype Merchant Sell rules, dynamic shops, trading, backend persistence, cloud save, account save, cross-device persistence, full wallet UI, full equipment economy, full production bank rules, full production crafting chains, profession progression, full recipe discovery, final crop economy, final ranch economy, final Smithy production routing, creature adjacency/star bonuses, production upgrade economies beyond current Guild & Inn, Farm, and Livestock upgrades, rarity, affixes, durability, sockets, set bonuses, or item comparison.



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
  | "claw"
  | "whip"
  | "bow"
  | "orb"
  | "lantern";
```

Current offhand types are:

```ts
type OffhandType =
  | "shield"
  | "quiver"
  | "talisman"
  | "dagger"
  | "claw"
  | "orb"
  | "lantern";
```

Equipment definitions keep one primary `equipmentSlot` and may add:

```ts
alternateEquipmentSlots?: EquipmentSlot[];
```

Only Claws, Orbs, and Lanterns currently use `alternateEquipmentSlots`, with `mainHand` primary and `offhand` alternate. `getEquipmentCompatibleSlots(itemDefinition)` is the shared source for slot compatibility in game rules and equipment presentation.

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

- companion existence
- item existence
- inventory quantity
- item category
- slot compatibility
- class permission
- level requirement
- both-hands occupancy
- inventory capacity for returned items
- inventory removal
- inventory return on unequip

Equipment validation helpers are shared game logic and may be used by equipment UI, merchant compatibility filtering, and first-class selection compatibility checks. Hand-equipment class validation is slot-aware through `isClassAllowedForEquipment(classId, itemDefinition, targetSlot)`: the requested slot must accept the item type in the class profile, and any item-level `allowedClassIds` restriction must also permit the class. Merchant compatibility succeeds when at least one compatible hand slot is allowed for the selected companion.
- telemetry results

`equipmentRules.ts` owns the shared universal main-hand compatibility rule. `getAllowedEquipmentTypeLabels` combines universal main-hand types with the selected class profile and removes duplicates. `classSelection.ts` consumes the same compatibility rule instead of duplicating equipment permissions.

Armor and accessories currently ignore class restrictions when level requirements are met.

Equipment remains gameplay-facing data only.

Equipment must not require sprite swaps, weapon anchoring, paper-doll rendering, or visible attachment systems.

Current universal starter/fallback weapon items include:

- Training Sword
- Copper Training Sword

Both use the `training_sword` equipment type, may be equipped by every current and future class, and remain equipped through first-class selection. They contribute only their existing item stats; class identity continues to determine attacks, attack range, projectiles, and skills.

Current prototype class hand-equipment permissions are:

- Beginner: Training Sword, no offhand
- Blade: One-Handed Sword, Dagger
- Aegis: One-Handed Mace, Shield
- Hunter: Bow, Quiver
- Beast: Claw, Claw
- Elementalist: Orb, Orb
- Runecaster: Lantern, Talisman
- Lightbearer: One-Handed Mace, Lantern
- Penitent: Whip, Dagger

The canonical consolidated level 10/15/20 lines are:

- Mace: `guard_mace` / Iron Mace (Attack 2, Defense 2), `bastion_mace` / Steel Mace (Attack 4, Defense 3), `ironhold_mace` / Veteran Mace (Attack 5, Defense 4)
- Dagger: `sacrificial_dagger` / Iron Dagger (Attack 2), `ritual_dagger` / Steel Dagger (Attack 3, Accuracy 1), `oath_dagger` / Veteran Dagger (Attack 4, Accuracy 2)
- Lantern: `rune_lantern` / Simple Lantern (Magic Power 2, Healing Power 1, Magic Defense 1), `etched_rune_lantern` / Etched Lantern (Magic Power 3, Healing Power 2, Magic Defense 2), `deep_rune_lantern` / Greater Lantern (Magic Power 4, Healing Power 3, Magic Defense 2)
- Quiver: `leather_quiver` (Accuracy 1, Evasion 1), `reinforced_quiver` (Attack 1, Accuracy 2, Evasion 1), `veteran_quiver` (Attack 2, Accuracy 2, Evasion 2)

Fresh class selection changes only class state and does not grant hand equipment. Missing first-class offhands are granted only by the version-1 save migration.

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
- Trailrunner leather armor
- Ravager leather armor
- Guard mail armor
- Vanguard mail armor
- Wardmail armor
- Ironmarch armor
- Bulwark plate armor
- Warplate armor
- Tier 2 level 15 and level 20 cloth armor variants
- Tier 2 level 15 and level 20 leather armor variants
- Tier 2 level 15 and level 20 mail armor variants
- Tier 2 level 15 and level 20 plate armor variants

Current shared prototype accessory items include:

- Plain Charm

Current scaled prototype equipment definitions include level 15 and level 20 weapons and offhands for current first classes where the matching weapon or offhand type exists.

Current level 10 armor coverage includes cloth, leather, mail, and plate prototype armor options.

Current quest equipment rewards may include:

- Guard Coif
- Scout Boots
- Bulwark Cuirass
- Plain Charm

Current archetype-specific prototype equipment drops may include:

- Simple Lantern from Goblin Shaman

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

Bows are one-slot Main Hand items and accept Quivers in the Offhand. Claws and Orbs are individual items compatible with either hand, and two equipped copies apply both copies' full stats. Lanterns are compatible with either hand at the item level, while class profiles restrict Runecaster Lanterns to Main Hand and Lightbearer Lanterns to Offhand. The `occupiesBothHands` framework remains available for future equipment, but current Bows and Claws do not use it.

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
  collisionWalls?: Position[];
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

`walls` are authored map wall positions. `collisionWalls` are optional extra collision-only blockers used by prototype quest or route state without necessarily changing the main visual wall list.

Current debug map ids:

```ts
type DebugMapId =
  | "hub"
  | "hub-2"
  | "map-1"
  | "map-2"
  | "map-3"
  | "map-4"
  | "map-5"
  | "map-6"
  | "map-7"
  | "slimeward-camp"
  | "slimeward-floor-1"
  | "slimeward-floor-2";
```

Current readable map names:

- `hub`: Harbor Union Bastion
- `hub-2`: Forward Bastion
- `map-1`: Mosswake Shore
- `map-2`: Briarwood Rise
- `map-3`: Azurefen Hollow
- `map-4`: Ash Goblin Encampment
- `map-5`: Briar Burrows
- `map-6`: Nightmire Canopy
- `map-7`: Orc Warcamp
- `slimeward-camp`: Slimeward Camp
- `slimeward-floor-1`: Slimeward Floor 1
- `slimeward-floor-2`: Slimeward Floor 2

Maps currently support dimensions, wall positions, baked navigation grid, companion start positions, enemy start positions, resource start data, hub NPC placeholder data, healing fountain data, decorative map visual objects, display/debug names, prototype teleport points, optional subzones, optional subzone labels, encounter areas, encounter leashes, and resource locations.

Map data is still development/prototype data and should not define final world content.

Current prototype map dimensions:

- `hub`: 110 columns by 60 rows
- `hub-2`: 132 columns by 72 rows
- `map-1`: 160 columns by 57 rows
- `map-2`: 160 columns by 57 rows
- `map-3`: 160 columns by 57 rows
- `map-4`: 110 columns by 57 rows
- `map-5`: 110 columns by 57 rows
- `map-6`: 110 columns by 57 rows
- `map-7`: 110 columns by 57 rows
- `slimeward-camp`: 44 columns by 30 rows
- `slimeward-floor-1`: 136 columns by 40 rows
- `slimeward-floor-2`: 152 columns by 44 rows

The current row count reflects prototype debug-map presentation space.

It is not final world scale or final zone design.

Current wilderness subzone structure:

- `map-1` through `map-3` use three authored wilderness subzones each.
- `map-4` through `map-7` use one internal subzone each for POI, Auto Combat, AFK estimate, encounter-area, resource-location, and compatibility systems.
- Post-Hub-2 maps are narrower than the pre-Hub-2 wilderness maps and use denser obstacle, negative-space, encounter-pocket, and landmark layouts.
- Post-Hub-2 wilderness maps should normally have around three enemy types per map as the current prototype standard, with close exceptions when the theme needs them.

Current post-Hub-2 map enemy groups:

- `map-4`: Goblin Shaman level 10, Ash Wisp level 11, Ember Imp level 12
- `map-5`: Tin Crawler level 13, Briar Wolf level 15, Mire Spider level 15
- `map-6`: Night Bat level 16, Elder Mossling level 17, Cinder Wisp level 18
- `map-7`: Orc Grunt level 18, Orc Raider level 19, Orc Shieldbearer level 19, Orc Warmaster level 20

Planned `map-7` topology for Issue #678:

- Keep the 110-by-57 footprint already used by `map-6`.
- Treat an open Orc field of roughly 60% of the map, a vertical route of roughly 15%, and a Boss arena of roughly 25% as approximate authoring budgets rather than rigid region boundaries.
- Keep the field open and farmable, with Orcs authored in loose squads. Auto Mode may route toward the route and arena anchors, but must not turn the field into a mandatory ordered checkpoint gauntlet.
- Start the route near the field's upper side, run it south, and connect it to the arena from below. The route contains one squad and one Barrack, with walkable lanes beside the living building. Issue #679 removes only the ten fixed wall cells adjoining its footprint (x70–72 and x78–79 at y25–26); retain the passage walls and the Barrack's own collision. Traversal and reinforcement reachability must not require its destruction.
- The shared compact arena layout reserves three Barracks at (88,29), (95,26) and (102,29), the Warmaster/dais at (95,32), cage at (88,45), chest at (102,45) and southern gate at (87,51). Retain central combat lanes for party movement, dashes and AoEs; the route Barrack and farming field remain outside this arena.
- Map data owns fixed geometry and placement anchors. Barrack health/behavior and Boss-gate progression are owned by their separate implementation issues; the layout must not encode them as a chain of mandatory field checkpoints.
- The arena entrance barrier should follow the existing Nightmire Patron barrier's circular collision and visual behavior. Keep its rendered area and collision geometry aligned, and let Boss-gate progression determine when the passage is open.

Authored wild-enemy ids are assigned centrally after encounter-area filtering. Their format is `zone-<zone-number>-<enemy-type-token>-<two-digit-sequence>`, with underscores in the enemy type converted to hyphens. Sequences are one-based, restart independently for each enemy type, and span the whole wilderness zone rather than each subzone. Dungeon, quest-spawned, hub target-dummy, and explicit debug-summon ids retain their existing ownership and formats.

---

## Combat Structures and Orc Barracks

Issue #679 adds `CombatStructure` to game/combat-target unions, not autonomous actors, enemy types or archetypes. `barrackDefinitions.ts` owns placement identity, ground collision bounds, separate authored attackable bounds, spawn candidates and shared tuning. The route attack bounds cover 5×5 world units and arena attack bounds 3×3, aligned with their displayed buildings without reading renderer dimensions. `barracks.ts` owns initialization, preparation, capped reinforcement production, safe rebuilding and restoration sanitation. Definitions and runtime contain no artwork, asset dimensions or rendering instructions.

`combatStructures.ts` provides shared hostile-target validation, nearest-attack-bound positions, reachable approach positions and structure line-of-sight checks. A companion already in range with line of sight retains its position without a path search. Otherwise, one shared reachable-position search uses the normal movement blockers; party-order validation reuses that result rather than searching every perimeter candidate and then validating it again. Manual party/direct orders accept living structures; autonomous enemy discovery does not. Existing damage, projectile, skill and DoT paths use the normal combat rules. Structure updates synchronize durable health and centralize exactly-once destruction, command cleanup, collision removal, navigation rebaking and movement/attack-cache invalidation. Enemy-only reward and retaliation paths remain enemy-only. Status application rejects non-damaging components on structures; enemy support auras exclude them.

Shared resolved-AoE geometry supports boolean rectangle intersection for circles, rings, cones, rotated squares/rectangles and unions. Combat uses the attackable bounds, including roof-area and boundary contact; ring holes remain empty and overlapping union primitives never multiply an effect. Navigation, dash clipping, spawn clearance and rebuild occupancy continue using only the smaller ground collision footprint. Restoration recreates both bounds from authored definitions, so older saves require no migration.

Optional `barracksById` state stores health, recorded maximum health, preparation, pending rolled type, monotonic spawn sequence, absolute rebuild deadline and tutorial-seen state. All four buildings derive 1,248 HP from six normal level-18 Grunts, with zero defense and magic defense. The default activation policy retains ten-unit living-companion proximity. Optional definition activation data instead references an encounter identity and bounds: orchestration supplies active identities after the Warmaster attempt update, keeping Boss checks outside production. Arena buildings require a matching active encounter and a living active companion inside those bounds, without a distance limit. Both policies require clear structure line of sight and room below the definition's `reinforcementCap`: five for the route building and two for each arena building. Caps are authored data, not saved runtime. Existing over-cap ownership remains valid and pauses production without clearing preparation or pending rolls; no save migration or forced despawning is needed. Reuse `hasStructureLineOfSight` for a short wall/collision-obstruction check rather than a path search; actor entities do not occlude it. Only qualifying visible companions become spawn-reachability goals. Loss of activation pauses preparation and preserves pending rolls, as do blocked candidates. Normal reinforcements carry typed `barrackSpawn` ownership, use normal type levels/stats/abilities/rewards, and are excluded from independent respawning. Ownership remains valid after building destruction/rebuild; map reconstruction discards departing reinforcements normally without kill rewards.

Restoration clamps malformed values, removes unknown structure/ownership records, reconciles sequence high-water marks, clears speech and pending commands, recreates structures and derives collision before navigation. Living health is converted proportionally from the recorded maximum, falling back to serialized structure max HP or legacy 624 HP. Recording the new maximum makes conversion idempotent, including off-map state; dead buildings retain zero HP and their deadlines. Missing legacy fields create authored healthy Barracks, including the new North building. `orcWarcampRestoration.ts` then rebinds the authored Boss home and bounds, repairs owned reinforcement homes and deterministically relocates full actor bodies blocked by changed terrain or structure collision. It preserves roster/progression/life state and runs only during reconstruction/restoration, before living Boss attempt reset; movement caches and transient runtime are cleared by the existing sanitation path. No save-version bump is needed. Dead structures rebuild only after their independent 120-second deadline and only when their full footprint is free of living solids and movement/dash reservations. No offline reinforcement production or arena-wide repair is performed.

The full renderer reuses each existing map-prop sprite once, hides destroyed props, and owns bars, hostile outlines and tutorial presentation. Shared HUD-aware speech resolves either NPC or structure speakers. Runtime signatures and timed-work detection cover presentation changes and final cleanup; minimap rendering excludes structure overlays and speech. Boss recharge/gate behavior remains in Issue #681, which must accept reinforcement kill credit without replacing independent rebuild timers.

---

## Subzone System

`subzoneSystem.ts` owns lightweight helpers for detecting whether a position is inside an authored prototype subzone.

Current responsibilities include:

- finding the subzone at a position
- checking whether a position is inside a subzone's bounds

Current wilderness maps are authored with two or three prototype subzones each.

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
- `map-3` -> `hub-2`
- `hub-2` -> `map-3`
- `hub-2` -> `map-4`
- `map-4` -> `hub-2`
- `map-4` -> `map-5`
- `map-5` -> `map-4`
- `map-5` -> `map-6`
- `map-6` -> `map-5`
- `map-6` -> `map-7`
- `map-7` -> `map-6`
- `hub-2` -> `hub-2` north route placeholder
- `hub-2` -> `hub-2` east route placeholder
- `map-3` -> `slimeward-camp`
- `slimeward-camp` -> `map-3`
- `slimeward-camp` -> `slimeward-floor-1`
- `slimeward-camp` -> `slimeward-camp`
- `slimeward-floor-1` -> `slimeward-camp`
- `slimeward-floor-1` -> `slimeward-floor-2`
- `slimeward-floor-2` -> `slimeward-floor-1`
- `slimeward-floor-2` -> `slimeward-camp`

Current teleport behavior:

- uses a small debug map teleport table
- supports per-teleport runtime working state
- teleports default to working unless their map definition sets `startsWorking: false`
- quest route-unlock objectives may set a teleport to working
- `map-6-to-map-7` starts non-working for new progression and is surrounded by collision cells generated from the same radius-5 circle used to render the Patron barrier; completing all three Patron Wards fades the barrier and persists the route unlock before quest turn-in
- save restoration preserves valid route unlock state and marks saves that had already reached or occupied map-7 as legacy-preserved, omitting the barrier and Warmaster scene rather than removing access
- non-working teleports cannot be triggered or selected for route movement
- can be triggered by player/debug action, World Travel menu selection, or AI conditions
- can set a teleport point as party movement intent
- auto mode may select eligible working teleport points after living enemies are cleared or when quest progression requires a connected map
- World Travel may select an eligible known destination and guide the party toward the matching working teleport point
- Slimeward Camp is reached from Azurefen Hollow through the prototype route, or by direct World Travel only after the Slimeward Camp Teleportation Echo is unlocked
- the direct Hub 1 to Slimeward Camp prototype/debug route has been removed from map data
- direct World Travel teleport may immediately transition to an unlocked supported destination through `teleportWorldTravelDestination`
- direct World Travel teleport requires a matching key item unlock and is blocked by current-map selection, active transitions, world-wipe recovery, open Slimeward chest UI, or resurrection runtime
- party members rally to the teleport point
- teleport completes when living party members are within teleport range
- on completion, current map changes to the teleport target map
- map-local enemies, resources, hub placeholders, hub target dummies, explored tiles, movement planning, direct commands, formation state, combat feedback, combat projectiles, autonomous target suppressions, skill runtime, status-effect runtime, skill visuals, companion AoE runtime, enemy AoE runtime, reusable enemy ability runtime, consumable-use runtime, drop visuals, resurrection state, health timing, target dummy timing, companion damage timing, and follow trails are reset, cleared, pruned, or rebuilt for the new map
- companion progression, class, role, level, XP, health, party identity, equipment, consumables, wallet, inventory, quests, party order, and teleport working state are preserved

`mapRuntimeCleanup.ts` owns clearing map-local runtime state during map transitions and pruning runtime records for entities that no longer exist.

Map transition cleanup clears or resets active teleport, direct commands, direct-command grace, interrupted POI state, explored tiles, follow trails, combat feedback, combat projectiles, autonomous target suppressions, movement planning, attack slot cache, defender wait/blocking state, skill visuals, companion AoE runtime, enemy AoE runtime, reusable enemy ability casts, cooldowns, and required-basic-attack gates, consumable-use runtime, flask counted defeat records, health regeneration timing, target dummy regeneration timing, companion damage timing, drop visuals, resurrection state, party formation state, and map-local skill/status runtime.

Map transition cleanup clears map-local skill/status runtime such as marks, binds, shield blocks, status effects, party poison coatings, party class buffs, overcharges, mana shields, frost armor, heal-over-time effects, lifesteal buffs, rewind runes, runic focus, absorb shields, self mitigation buffs, party mitigation buffs, gather buffs, damage mitigations, and other transient skill records that should not survive a prototype map change.

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

`worldTravelRouting.ts` owns current prototype World Travel route-step selection.

`worldTravelTeleports.ts` owns current key-item unlocked direct World Travel teleport metadata.

World Travel should use current route and map data.

Current World Travel routing:

- returns no route when the current map is missing or already matches the destination
- prefers a direct working teleport when one exists
- routes between main-world maps through the ordered main route from hub through map-7, including Forward Bastion between map 3 and map 4
- uses breadth-first route search for other working prototype routes, including Slimeward routes
- ignores non-working teleports
- restricts main-world-to-main-world travel to main-world route teleports

Current direct World Travel teleport unlocks:

- `hub` requires `teleport_echo_harbor_union_bastion`
- `slimeward-camp` requires `teleport_echo_slimeward_camp`

World Travel must not require final zone ids, persistent zone state, final world streaming, production map discovery, production travel costs, or a production teleport network.

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
  azureMass?: {
    triggeredPhaseThresholds: AzureMassPhaseThreshold[];
    fleeUntilMs?: number;
  };
};
```

Current Slimeward dungeon behavior:

- `updateSlimewardDungeonSystem` runs during simulation updates after drops and before enemy respawn.
- Simulation updates return early while the Slimeward dungeon chest UI is open.
- Floor 1 POI routing targets the next living authored dungeon enemy, then the Floor 2 teleporter.
- Floor 2 POI routing targets the next living authored dungeon enemy, then the boss chest, then the final exit.
- The boss chest appears after The Azure Mass is dead.
- The Azure Mass phase system triggers at 75%, 50%, and 25% health remaining.
- Azure Mass phase runtime records triggered thresholds and temporary flee timing.
- Each newly crossed Azure Mass threshold spawns an authored phase wave in the boss room with one Superior slime.
- Phase wave sizes are currently 3 enemies at 75%, 4 enemies at 50%, and 5 enemies at 25%.
- When a phase starts, `partyTargetSystem.ts` suppresses The Azure Mass from autonomous target selection for the flee window and `dungeonSystem.ts` clears shared/autonomous party targets pointing at the boss.
- Direct companion commands are preserved by Azure Mass flee retargeting.
- During an active flee window, The Azure Mass clears attack/roam runtime and moves away from the nearest living companion inside the boss room at a prototype speed multiplier.
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
- uses party recovery intent to select the active dead companion target
- assigns living autonomous companions as resurrection participants
- stores participant assignments in `resurrectionChannelsByHelperId`
- stores target progress in `resurrectionProgressByCompanionId`
- moves participants toward valid stand positions inside the resurrection area
- lets participants attack active threats inside the resurrection area
- progresses resurrection when living companions are within the resurrection area
- scales progress contribution by current contributor count using prototype contribution multipliers
- removes participant assignments when the helper, target, or recovery intent becomes invalid
- direct-commanded helpers do not continue resurrection participation
- completed resurrection returns the target companion to follow behavior with minimal health
- resurrection participant assignment, removal, area progress, and completion emit debug telemetry

Current resurrection constants:

- `RESURRECTION_REQUIRED_MS = 10000`
- `RESURRECTION_RANGE = 5`

`worldWipeRecovery.ts` owns current prototype party defeat recovery.

Current world-wipe recovery behavior:

- triggers when every companion is dead outside safe hub maps such as Harbor Union Bastion and Forward Bastion
- chooses available unlocked rescue hubs by route distance for normal wild-map wipes
- rescues Slimeward dungeon floor wipes directly to Slimeward Camp
- may enter a pending choice state when multiple equally valid rescue hubs exist
- currently defaults to Harbor Union Bastion as the first normal unlocked rescue hub
- may use Forward Bastion as a normal rescue hub for later prototype map progress
- treats Slimeward Camp as the rescue hub for Slimeward dungeon floors
- may charge Crowns using the current rescue fee calculation, capped by current wallet balance
- restores companions to rescue hub arrival positions with full health
- rebuilds rescue hub NPCs and hub target dummies where appropriate
- clears map-local runtime state, combat state, movement state, teleport state, POI state, skill runtime state, status-effect runtime, companion AoE runtime, enemy AoE runtime, drop visuals, resurrection state, direct commands, follow trails, and formation state
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
  | "enemy_spotted"
  | "gather"
  | "heal"
  | "level_up";
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
- `client/src/questEntityIndicators.ts`
- `client/src/worldRenderer/PixiWorldRenderer.tsx`
- `client/src/worldRenderer/PixiWorldRendererHelpers.ts`

Current public asset path root:

- `client/public/assets/`

The Orc aura runtime frames live under `client/public/assets/effects/gameplay/orc-aura/`; their exact-copy mirrors and manifest records live in the external Used Assets library according to the repository asset lifecycle.

Current semantic asset groups referenced by the UI include:

- `assets/effects/gameplay`
- `assets/effects/gameplay/orc-aura`
- `assets/effects/projectiles`
- `assets/entities/companions`
- `assets/entities/enemies`
- `assets/entities/npcs`
- `assets/items/equipment`
- `assets/items/skill-books`
- `assets/skills/effects`
- `assets/skills/icons`
- `assets/skills/rune-seals`
- `assets/ui/controls`
- `assets/ui/equipment-placeholders`
- `assets/ui/farm`
- `assets/ui/portraits`
- `assets/world/dungeons`
- `assets/world/props`
- `assets/world/resources`
- `assets/world/structures`
- `assets/world/teleports`
- `assets/world/terrain`

Current world renderer behavior:

- PixiJS renders the main world view.
- React hosts the renderer and passes game state and command callbacks.
- The renderer supports preview and full modes.
- The renderer may draw floor chunks, walls, obstacles, decorative map visual objects, entities, resources, NPCs, teleports, labels, combat feedback, skill visuals, companion AoE visuals, enemy AoE danger circles and channel bars, reusable enemy ability cast labels/bars/glows, combat projectile visuals, drop visuals, resurrection feedback, world-wipe feedback, status-effect presentation where supported, Patron Ward props/aura/labels, the Nightmire barrier, the Warmaster finale, HUD-aware speech bubbles, and camera-follow presentation.
- The renderer may draw quest entity indicators as separate yellow `!` text prefixes beside relevant enemy, NPC, or resource labels without modifying entity display names.
- The renderer uses redraw gating so stable preview/full renderer frames are skipped unless game state, timed visual work, texture readiness, or sizing changes require a draw. Active enemy ability casts participate in full-render signatures and timed redraw work so cast progress and glow animation receive a final cleanup frame.
- Patron aura loops, barrier pulses, Ward/finale fades, speech timing, and HUD avoidance rectangles participate in the applicable full-render signatures and timed redraw work. The preview/minimap renderer omits Ward speech and barrier presentation.
- The seven Orc aura frames loop at approximately 10 FPS behind uncompleted Wards and quest-spawned Ward defenders. The aura marker is presentation-only and does not apply combat stats.
- The renderer tracks Pixi texture lifetime with shared, current-map, previous-map, and durable texture scopes, then best-effort evicts old map-only textures.
- The renderer reuses managed Pixi sprites and text where safe, caches static map-derived render data, and records draw/texture/performance sample metrics for debugging.
- Texture cache and redraw behavior are renderer-only optimizations and must not define simulation cadence, gameplay timing, or map ownership rules.
- PixiJS rendering must not own simulation rules, targeting rules, movement rules, combat rules, quest rules, or map data generation.

Current companion visuals:

- Beginner companions use the generated Beginner walking sprite set
- first-class companions currently use class-specific sprite folders for Blade, Aegis, Hunter, Beast, Elementalist, Runecaster, Lightbearer, and Penitent
- non-Beginner companions fall back to the test character sprite only if a class-specific sprite mapping is missing
- idle may use a single idle frame, four-direction first-frame fallback, or eight-direction first-class idle frames depending on the sprite set
- run uses directional frame sequences for north, south, west, and east where available
- class portraits are UI-facing images and do not define simulation behavior

Current enemy visuals:

- Wolf-style enemies may use the test enemy sprite
- Orc-style enemies may use the Test-Enemy2 directional static sprites
- prototype enemy archetypes may use static generated archetype sprites
- Slimeward dungeon enemies may use generated dungeon enemy images
- The Azure Mass currently uses eight-direction Azure Mass sprites
- fallback enemy visuals depend on current map/debug context

Current resource visuals use generated image icons by resource type.

Current NPC visuals:

- Quest Giver, Class Mentor, Merchant, Smith, Bank Chest, Guild Coordinator, Inn Keeper, Farmer, Livestock keeper, and Dog may use generated image icons where those NPCs are present
- quest guide NPCs may use temporary NPC visuals
- dungeon chest NPCs may use temporary or placeholder presentation
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
- teleport active/broken visuals
- passage blocker open/repaired and closed/collapsed visuals
- Slimeward dungeon floor, wall, waypoint, chest, obstacle, slime, and boss visuals
- class portrait, first-class skill effect, prototype VFX, and combat projectile visuals
- post-Hub-2 enemy and terrain visuals
- bottom HUD Auto Combat, Pause/Resume, and companion buff/debuff placeholder visuals

The 32px construction cell is a render and authoring anchor, not tile-by-tile gameplay movement.

Floor chunk size and terrain asset size must not change simulation coordinates, movement, collision, pathing, map geometry, entity placement, teleports, gameplay ranges, or game logic.

Visual asset registry responsibilities include defining sprite frame lists, frame duration, entity visual mapping, sprite animation selection, image icon mappings, terrain image mappings, and placeholder class names.

Simulation logic must not depend on PixiJS, sprite assets, floor chunk size, or terrain image dimensions.

---

## Debug Telemetry

Debug telemetry records simulation information for inspection.

Current telemetry can track target acquisition, target changes, formation changes, skipped targets, movement failure, path query metrics, navigation distance metrics, attack start, damage dealt, combat resolution, healing resolution, health regeneration, max-health synchronization, entity death, Superior enemy spawning, gathering start, resource depletion, class changes, role changes, character XP awarded, character XP reduced, character level up, character XP skipped, inventory changes, equipment equip/unequip attempts, equipment equip/unequip results, equipment validation failures, teleport start, teleport completion, teleport skips, map transitions, POI selection, POI skips, POI interruption, quest availability, quest dialog opening, quest acceptance, quest objective progress, quest objective completion, quest ready-to-turn-in state, quest finish selection, quest reward validation, quest reward validation failure, quest reward claim start, quest reward claim failure, quest reward claim success, quest repeat reset, quest reward Crowns, quest reward XP, quest reward item and equipment grants, quest turn-in, quest completion, quest unlocks, quest equipment state checks, quest-driven teleport intent, enemy drop rolls, quest drop visuals, drop visual events, drop inventory routing, wallet currency changes, merchant interaction events, Merchant Buy and Sell results, merchant quest gating, crafting attempts, crafting successes, crafting failures, debug crafting material grants, skill selection, skill usage, skill skips, skill effects, skill cooldown state, direct command issue/rejection/replacement/completion/cancellation/grace events, resurrection target selection, resurrection participant assignment, resurrection area progress, resurrection participant removal, companion resurrection, flask fountain refills, flask recharge progress, flask charge gains, and capped flask recharge no-ops.

Party-order rejection telemetry currently uses `party_order_rejected` for invalid, blocked, or unreachable party orders.

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

Prototype crafting telemetry may include:

- `craft_attempted`
- `craft_succeeded`
- `craft_failed`
- `debug_crafting_materials_added`

Crafting telemetry should remain development-only and may include tick, companion id or fallback crafting entity id, crafting recipe id, output item id, output quantity, failure reason, requirement rows, consumed item rows, Crown cost, currency balances, inventory used slots, inventory capacity, and free slots before or after crafting.

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
- toggle companion infinite health
- randomize positions
- debug telemetry recording/export
- debug maps
- direct companion command testing
- role bonus assignment testing
- skill behavior, skill progression, skill book, legacy skill, cooldown, and overcharge testing
- status-effect testing
- companion AoE channel testing
- map runtime cleanup testing
- Slimeward dungeon runtime and chest testing
- enemy AoE channel testing
- add prototype flasks to shared inventory
- add prototype crafting materials and enemy drops to shared inventory
- bank storage, slot lock, transfer, and auto-routing testing
- key item and direct World Travel teleport testing
- Smith crafting recipe, requirement, result, and telemetry testing
- hub target dummy testing
- explicit aggressive-enemy test setups
- prototype teleport/map transition testing
- debug teleport to Slimeward Camp testing
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

The React UI currently may display and control map/debug map view through the PixiJS world renderer, generated terrain tiles, subzone name labels, party members, enemies, resources, NPCs, quest guide NPCs, healing fountains, hub target dummies, Guild & Inn service NPCs, Farm and Livestock service NPCs, Patron Wards, Patron aura animation, the Nightmire route barrier, the untargetable Warmaster finale actor, HUD-aware world speech bubbles, sprite animation, enemy and NPC name labels, Superior enemy name/aura presentation, enemy AoE danger circles and channel bars, reusable enemy ability cast presentation, companion AoE skill visuals, status-effect presentation where supported, combat projectile visuals, teleport working/broken presentation, camera follow behavior, combat feedback, skill visual feedback, news broadcast overlays, companion global cooldown display, direct command overlays and rejection feedback, drop visual feedback, resurrection progress, world-wipe rescue choice and rescue feedback overlays, party selection, role changes, role bonus status, class changes, first-class selection, party order changes, leader changes, Party Management leader status and leader switching controls, group/direct commands, inventory counters, wallet balance, inventory item details, key item display, skill book details, skill book reading actions, prototype equipment slot state, prototype equipment equip/unequip commands, prototype flask equipment, auto-flask settings, Beginner First Aid self-heal settings, Beginner First Aid ally-heal settings, Second Wind self-heal settings, Hold Fast use settings, Fake Death use settings, Blood Feast use settings, Light Mend ally-heal settings, Self Sacrifice safety-floor settings, Penitent's Gift ally/self-heal settings, Eternal Hope use settings, mobility skill use mode settings, defensive mobility threshold settings, Support Focus settings, Overcharge toggle settings, FireBurst target mode settings, Circle of Renewal target mode and HP-threshold settings, learned skill summaries, legacy skill toggles, quest tracker, quest log, Notice Board quest grouping, prototype quest reward text, quest turn-in error feedback, equipment tutorial quest state, Smithy quest state, guide popup overlays, Merchant Buy UI, Merchant Sell UI, Bank Chest interaction UI, bank slot display, bank transfer controls, bank slot locking controls, Smith crafting UI, crafting filters, crafting recipe details, crafting result feedback, AFK Estimate UI, Guild & Inn UI, Guild Recruit UI, Notice Board UI, Field Team UI, Inn Rooms UI, Inn Kitchen UI, Farm & Livestock UI, crop and creature filters, Farm and Livestock upgrade overlays, Livestock grid placement controls, Livestock helper summaries, Hearth's Fire display, World Travel menu state, prototype destination selection, direct Teleportation Echo travel options, Options save controls, start screen save and Patch Notes controls, bundled Markdown patch-note presentation, offline progress summary, pending offline loot claiming, XP and level progress, party size limit, bottom HUD Auto Combat and Pause/Resume controls, companion buff/debuff placeholder rails, debug controls, performance/debug telemetry, and debug telemetry export.

The full renderer viewport should reserve the bottom HUD area so the map camera and interactable world view do not place important content behind the companion vitals and buff/debuff rail UI.

UI should remain a consumer/controller of game state, not the owner of simulation behavior.

---

## Menu UI Technical Structure

The React UI may include a main menu and submenu system for party overview, party management, prototype inventory display, Atlas quest/crafting/bank pages, prototype world travel, and prototype options/save controls.

Menu UI must remain in React components under `client/src/`.

Game logic must remain under `client/src/game/`.

React may:

- read current game state
- track selected menu state
- track selected companion UI state
- track selected Party section UI state
- track selected Party Management section UI state
- track selected Atlas subpage UI state
- track selected quest UI state
- track selected World Travel destination UI state
- track guide popup queue, active popup, and viewed popup UI state
- track save status and offline summary UI state
- track start-screen Patch Notes dialog state and focus restoration
- render UI-facing enemy and NPC name labels
- track one transient NPC speech bubble and pass it to the PixiJS world renderer
- measure registered HUD bounds on mount, renderer remount, window resize, and element-size changes, then pass those viewport-space avoidance rectangles to the renderer without owning speech-layout decisions
- call existing game command/helper functions for supported actions
- call existing party leader helper functions for leadership switching
- call existing stat allocation helpers for supported stat allocation actions
- call existing class selection helpers for supported first-class selection actions
- call existing equipment helpers for supported equipment actions
- call existing consumable helpers for supported flask and auto-flask actions
- call existing Guild & Inn helpers for supported recruit, board, Field Team, room, Kitchen, Hearth's Fire, and upgrade actions
- call existing Farm and Livestock helpers for supported crop, creature, grid, feed, collect, upgrade, helper summary, and pantry/inventory routing actions
- call existing skill behavior helpers for supported skill behavior settings
- call existing skill progression helpers for supported skill-book reading and legacy active-skill toggles
- call existing merchant helpers for supported Merchant Buy actions
- call existing bank helpers for supported bank transfers, slot locks, and auto-routing settings
- call existing crafting helpers for supported recipe status display and craft actions
- call existing teleport or travel-intent helpers for supported prototype World Travel actions
- call browser save storage helpers for supported local save, import, export, continue, and new-game actions
- display placeholder sections for future systems

React must not:

- define core simulation behavior
- duplicate role logic
- invent new role values
- define stat formulas, derived combat formulas, equipment rules, skills, formation, behavior settings, quest rules, POI selection rules, teleport rules, merchant rules, bank rules, crafting rules, wallet rules, key item unlock rules, Farm rules, Livestock rules, pantry transfer rules, helper-bonus rules, or advanced inventory rules inside React components
- implement equipment UI beyond displaying game state and issuing commands to existing game logic unless explicitly requested
- implement final zone routing, map discovery, travel costs, or production world-map behavior inside React components

Current intended main menu views:

- Party
- Party Management
- Inventory
- Atlas
- World
- Options

Current intended Party sections and controls:

- companion selector
- Stats
- Equipment
- Skills
- learned active and passive skill display with current rank, companion-aware cap, and books required for the next rank
- legacy active-skill toggles where the fixed rank-5 threshold is met
- no passive skill toggles or legacy controls
- Skill Preferences for supported skill behavior settings
- HP threshold controls for supported self-heal, ally-heal, defensive, and safety skills
- target mode controls for supported FireBurst and Circle of Renewal behavior
- Overcharge toggle control for supported Elementalist behavior

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
First-class selection UI may present eligible living Beginner companions at level 10 or higher.

First-class selection UI must call game-logic class selection helpers and display failure feedback from the returned result.

React must not duplicate first-class selection validation, class equipment compatibility rules, or skill progression initialization logic.

The Atlas view may display prototype quest state, objective progress, Smith crafting state, bank state, AFK Estimate state, and Guild & Inn state from game state.

The Inventory view may display wallet balance and key items, but wallet, key item, and inventory rules must remain in game logic.

The World Travel view may display the current map and known prototype region destinations.

Selecting a destination may set `worldTravelTargetMapId`; the POI system then guides the party toward the next valid teleport step along the current prototype route.

Selecting an unlocked direct Teleportation Echo destination may call existing teleport helpers to complete the supported prototype direct transition.

Bank UI may call existing bank helper functions, but must not define bank capacity, slot-locking, transfer, service availability, quest-item exclusion, or auto-routing rules inside React.

Crafting UI may call existing crafting helper functions, but must not define recipes, recipe sorting, material matching, previous-equipment requirements, key item ownership checks, Smith service availability, wallet mutation, inventory mutation, or quest progress rules inside React.

Merchant UI may call existing merchant helper functions, but must not define exchange, buy, pricing, stock, inventory, or wallet rules inside React.

Merchant Buy may display and purchase from fixed prototype stock through game logic.

Merchant Sell may display game-logic-provided sellable shared-inventory slots, per-unit values, clamped quantity controls, live total payout, and transaction feedback. It must not define eligibility, values, tutorial purchase gating, or inventory and wallet mutation inside React.

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
- full ability framework beyond the focused reusable enemy ability runtime
- mana/resource cost system
- full casting system beyond the focused reusable enemy ability runtime
- advanced targeting system
- advanced aggro/threat systems
- advanced ranged combat beyond current basic projectile visuals and enemy attack windup
- advanced support mechanics
- production asset pipeline
- final world content pipeline
- full quest journal, dialogue system, quest reward economy, or production quest content beyond the prototype quest chain
- full shop, selling, buying, and merchant economy beyond fixed prototype Merchant Buy stock and the current prototype Merchant Sell rules
- full production crafting, smithing, profession progression, upgrade chains, or recipe economy beyond current prototype Smith crafting
- full production bank economy, account storage, remote storage rules, or storage upgrades beyond current prototype Bank Chest storage
- persistent ground loot beyond prototype drop visual events and drop-to-inventory behavior
- final death penalty, checkpoint, resurrection economy, or recovery system beyond prototype resurrection and world-wipe recovery
- production enemy respawn, encounter reset, or spawn scheduling beyond current prototype wild-map respawn behavior
- final POI/world-routing framework beyond debug-map POI guidance
- production escort, follower, recruitment, or companion NPC systems beyond the current quest guide prototype and current Guild Recruit helpers
- full town systems, interiors, production crafting, production smithing, recruitment beyond current Guild Recruit helpers, or NPC relationship systems
