# GTD.md

## Overview

This document defines the technical structure of the game.

The project follows a simulation-first architecture:
- Game logic runs independently of the UI
- UI reads and displays game state
- Systems update the world over time for idle/AFK play

Design intent is defined in `GDD.md`. This document defines how that intent should be represented technically.

---

## Core Architecture

The game is divided into:

- Game Logic: `client/src/game/`
- UI Layer: React components in `client/src/`

Game logic must NOT depend on React.

React may:
- display game state
- issue commands into game logic
- start/stop the simulation loop for development
- expose temporary debug controls

React must NOT contain core simulation rules.

---

## Folder Structure

Current game logic is organized as flat TypeScript modules under `client/src/game/`.

Important current files include:

- `types.ts`
- `entities.ts`
- `state.ts`
- `commands.ts`
- `gameLoop.ts`
- `updateGame.ts`
- `followSystem.ts`
- `attackSystem.ts`
- `gatherSystem.ts`
- `defendSystem.ts`
- `enemyAISystem.ts`
- `roleSystem.ts`
- `partyFormationSystem.ts`
- `partyProtectionSystem.ts`
- `targetSelection.ts`
- `debugTools.ts`
- `debugTelemetry.ts`
- `debugMap.ts`

Do not restructure the project unless explicitly requested.

New helper modules may be added when they keep responsibilities clear. Good candidates:
- `partySystem.ts`
- `roleProfiles.ts`
- `roleDecisionSystem.ts`

---

## Entity Model

Entities represent world objects and actors.

### Entity Kinds

Current entity kinds:
- player
- companion
- enemy
- resource

### Entity States

Current execution states:
- idle
- follow
- attack
- gather
- defend
- dead

States describe what an entity is currently doing.

Roles describe behavior priorities and should not be confused with states.

---

## Party Members

The player and companions are party members.

Party members should support:
- id
- kind
- position
- state
- health
- maxHealth
- combat stats
- gatherSpeed
- currentTargetId
- commandPriority
- role
- partyOrder

The code may keep separate `Player` and `Companion` types for now, but shared party-member behavior should use helper functions instead of duplicating logic.

Recommended helpers:
- `isPartyMember(entity)`
- `getPartyMembers(state)`
- `getPartyLeader(state)`
- `getOrderedPartyMembers(state)`
- `getOrderedFormationMembers(state)`
- `isGathererBusy(entity)`

---

## Leader

Leader is not a role.

Leader should be stored as party state:

```ts
partyLeaderId: string;
```

The current leader:
- provides party intent
- selects point of interest
- selects enemy target
- may later be manually controlled by the player

Systems must not assume the `player` entity is always the formation anchor.

For the next implementation phase, the existing player may remain the default leader until leader switching is implemented.

---

## Roles

Roles apply to party members.

Role values:

```ts
type PartyMemberRole =
  | "defender"
  | "fighter"
  | "support"
  | "gatherer"
  | "none";
```

`none` is a safe default/unassigned role.

Current `CompanionRole` should eventually be generalized to a party-member role concept. This can be done incrementally to avoid a large refactor.

Recommended next step:
- add support for `support`
- add `role` to `Player`
- keep existing behavior stable while expanding role ownership

---

## Party Order

Party order should be adjustable.

Party order determines ordering within a role group.

Recommended field:

```ts
partyOrder: number;
```

Formation ordering should sort by:
1. role priority
2. party order

Suggested role priority:

```ts
defender: 0
fighter: 1
support: 2
gatherer: 3
none: 4
```

---

## Game State

`GameState` is the central simulation container.

Current responsibilities:
- stores all entities
- stores inventory counters
- stores map/debug map data
- stores auto-mode state
- stores leader intent
- stores explored tiles
- stores movement planning data for the current tick
- stores formation state
- stores combat feedback events
- stores debug telemetry

Next-phase additions:

```ts
partyLeaderId: string;
```

Party order may live on party member entities or a party-specific structure. Prefer the simpler option unless a stronger need appears.

State helpers should remain low-level and safe. Systems should own behavior decisions.

---

## Commands

Commands can be:
- group commands
- direct entity commands
- future leader-selection commands
- future party-order commands

Rules:
- direct commands override autonomous behavior for the targeted entity
- direct commands should not automatically change other entities
- emergency survival behavior may interrupt direct commands only when explicitly allowed
- commands should update leader intent only when issued by or for the current leader

Recommended future command helpers:
- `setPartyLeader(state, entityId)`
- `setPartyMemberRole(state, entityId, role)`
- `setPartyOrder(state, entityId, partyOrder)`

---

## Systems

Systems operate on `GameState`.

Current systems include:
- Follow System
- Attack System
- Gathering System
- Defend System
- Enemy AI System
- Role System
- Party Formation System
- Party Protection System
- Exploration System

Each system:
- reads `GameState`
- updates entities through state helpers
- runs during simulation ticks
- keeps behavior focused and simple

Recommended responsibility split:

### Party System

Owns:
- party leader lookup
- party member lookup
- party order helpers
- role-order sorting
- leader assignment helpers

### Role Profile System

Owns:
- role parameters
- symbolic role behavior values
- role priority metadata

### Role Decision System

Owns:
- role-based autonomous decisions
- simple interrupt checks
- fallback selection
- AI decision reasons

### Party Formation System

Owns:
- role-order formation
- party cohesion
- travel formation
- transition to combat positioning

### Attack System

Owns:
- attack execution
- attack cooldowns
- damage
- combat target validity
- attack slot movement

### Gather System

Owns:
- gathering execution
- resource depletion
- gatherer commitment
- gatherer return behavior

---

## Game Loop

The game loop:
- runs continuously while enabled
- executes systems in order
- updates `GameState`
- supports idle/AFK simulation

Systems must avoid conflicting movement updates.

Each entity should perform only one movement behavior per tick.

Recommended high-level order:
1. Clear tick movement planning
2. Resolve leader intent / point of interest
3. Resolve role decisions and simple interrupts
4. Update party formation and cohesion
5. Run movement/behavior systems
6. Resolve combat and gathering
7. Record debug telemetry

Exact order may change as systems mature, but movement conflicts must stay guarded.

---

## Behavior Priority

Global AI priority:

1. Direct player command
2. Emergency survival action
3. Primary role action
4. Secondary role action
5. Fallback action
6. Idle / follow

Interrupt rule:

```ts
newActionPriority > currentActionPriority + roleCommitmentBuffer
```

Keep the first implementation simple. Do not build a complex behavior tree unless explicitly requested.

---

## Role Profiles

Role profile data should be centralized rather than scattered across systems.

Suggested shape:

```ts
type RoleProfile = {
  positionBias: "front" | "mid" | "back" | "free";
  followDistance: "tight" | "normal" | "loose";
  aggression: "veryLow" | "low" | "medium" | "high";
  taskCommitment: "low" | "medium" | "high";
  riskTolerance: "veryLow" | "low" | "medium" | "high";
  movementPriority: "lead" | "follow" | "adaptive" | "independent";
  cooldownUsage: "minimal" | "conservative" | "defensive" | "aggressive";
  resourceSpending: "minimal" | "conservative" | "moderate" | "aggressive";
};
```

Initial numeric parameters should be conservative and easy to tune.

Suggested starting values:

```ts
fighter: {
  engageRange: 8,
  chaseLimit: 6,
  leashDistance: 8,
  interruptBuffer: 20,
  dangerThreshold: 4,
}

defender: {
  engageRange: 6,
  chaseLimit: 3,
  leashDistance: 4,
  protectionRadius: 6,
  interruptBuffer: 10,
  dangerThreshold: 6,
}

support: {
  engageRange: 3,
  chaseLimit: 0,
  leashDistance: 6,
  criticalHpPercent: 0.35,
  preferredHealHpPercent: 0.65,
  interruptBuffer: 10,
  dangerThreshold: 3,
}

gatherer: {
  resourceSearchRange: 30,
  combatAssistRange: 3,
  chaseLimit: 0,
  leashDistance: 15,
  interruptBuffer: 30,
  dangerThreshold: 2,
}
```

These values are placeholders for tuning.

---

## Formation

Formation must be based on role order and party order, not leader position.

Formation order:

```ts
defender -> fighter -> support -> gatherer -> none
```

If a role group is empty, the next available role group leads.

Formation members should be ordered by:

```ts
rolePriority + partyOrder
```

The current leader should not automatically be placed at the front, center, or anchor.

Gatherers:
- are excluded from formation while actively gathering or moving to a resource
- rejoin formation when not actively gathering
- appear near/behind supports when included

---

## Formation Cohesion

Formation uses path-distance cohesion.

Default cohesion distance:

```ts
FORMATION_COHESION_PATH_DISTANCE = 5;
```

Required members:
- alive/non-dead defenders
- alive/non-dead fighters
- alive/non-dead supports
- alive/non-dead gatherers only when not actively gathering or moving to a resource

Cohesion rule:
- required members must remain connected through path-distance links
- if cohesion breaks, forward travel pauses
- members catch up before travel resumes

Avoid direct-distance checks for cohesion. Walls and obstacles must be considered.

Do not allow two disconnected clusters to count as cohesive just because each member is close to someone. Cohesion should validate that the required formation group is connected.

---

## Formation Travel

Travel flow:

1. Current leader sets target or point of interest.
2. Party computes or receives path information.
3. Ordered formation members are calculated.
4. The first available ordered member leads movement.
5. Following members maintain role/party order behind or near the previous formation member.
6. If cohesion breaks, forward movement pauses.
7. Once close enough to an enemy target, formation transitions into combat positioning.

Formation travel should remain fluid. Do not require perfect slot placement before movement unless cohesion is broken.

---

## Combat Approach

Leader-selected enemy target is shared with party members.

Role behavior during approach:
- defenders target the enemy and lead engagement
- fighters target the enemy and follow defenders/frontline
- supports target the enemy and follow fighters/backline
- gatherers keep gathering behavior unless included in formation or forced into fallback combat

Combat transition distance:

```ts
COMBAT_APPROACH_DISTANCE = 2 or 3;
```

When close enough:
- units choose combat positions
- attack range must be considered
- melee units use adjacent slots
- future ranged units should use valid ranged slots

Current attack range may remain 1 until ranged classes exist.

---

## Party Protection

When any party member is attacked:

- attacker becomes a high-priority party target
- leader intent may switch to the attacker
- role decisions may respond based on priority and interrupt rules
- direct-commanded members should not be overridden except by explicitly allowed emergency survival behavior
- busy gatherers should not be interrupted by distant threats

This should replace player-only protection assumptions over time.

---

## Gathering

Resources use the existing depletion model.

Gatherers:
- prioritize resources within their search/gathering range
- can leave formation while gathering or moving to a resource
- are excluded from formation cohesion while actively gathering
- rejoin formation when no valid gathering task exists
- may fallback to combat only when appropriate

Gathering limits:
- resources define `maxGatherers`
- default remains 1 gatherer per resource
- excess gatherers should fallback to role behavior

---

## Movement

Movement rules:
- top-down 2D
- step-based
- no entity stacking
- path distance preferred for formation cohesion
- movement reservations prevent conflicts
- one movement behavior per entity per tick

If movement/pathfinding grows significantly, move pathing logic out of `state.ts` into a dedicated module.

---

## Support Role Implementation

Support can be added before a full skill system exists.

Initial support behavior may include:
- formation positioning behind fighters
- safe combat fallback
- target awareness
- avoiding unnecessary danger

Do not implement healing, shielding, buffs, cleanses, or summons unless explicitly requested.

Support thresholds can exist as profile placeholders but should not drive missing systems.

---

## Debug Telemetry

AI behavior should expose decision reasons when practical.

Useful reason labels:
- leader_target_changed
- party_member_attacked
- target_dead
- ally_threatened
- danger_too_close
- resource_found
- resource_depleted
- no_primary_action
- fallback_combat
- return_to_formation
- direct_command
- cohesion_broken
- cohesion_restored
- formation_order_changed
- combat_positioning_started

Telemetry should help explain:
- why a unit changed state
- why a unit changed target
- why formation paused
- why a unit left or rejoined formation

---

## Debug Utilities

Debug/testing helpers may exist for development:
- Add/remove companions
- Change roles
- Change party order
- Set current leader
- Reset health
- Reset resources
- Randomize positions
- Debug telemetry
- Debug maps
- Explicit aggressive-enemy test setups

These should remain isolated from core systems and must not define final gameplay behavior.

---

## World Structure Future Work

- World is divided into zones.
- Each entity will later include `zoneId`.
- Teleport points connect zones.

Do NOT implement zones unless explicitly requested.

---

## Future Expansion

Do NOT implement unless requested:

- Zones and teleport points
- Full skill system
- Inventory items/equipment
- Class/subclass progression
- Networking/server authority
- Backend persistence
- Advanced aggro/threat systems
- Advanced ranged combat
- Advanced support mechanics
