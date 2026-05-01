# GTD.md

## Overview

This document defines the technical structure of the game.

The project follows a simulation-first architecture:
- Game logic runs independently of the UI
- UI reads and displays game state
- Systems update the world over time (idle/AFK ready)

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

React must NOT contain core simulation rules.

---

## Folder Structure (Current)

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

Do not change this structure unless explicitly requested.

---

## Entities System

Entities represent world objects and actors.

### Base Entity

All world entities share:

- id
- kind
- position
- state/status if applicable

Base entities should stay minimal.

### Current Entity Kinds

- player
- companion
- enemy
- resource

### Current States

- idle
- follow
- attack
- gather
- defend
- dead

---

## Player

The player:
- is the main controllable character
- can receive autonomous commands
- can attack
- can gather
- can be damaged
- can use future manual input
- has health
- has combat stats
- has gatherSpeed
- may later have skills/proficiencies

Manual controls are future work. When added, manual input should override or influence autonomous behavior.

---

## Companion

Companions:
- can receive commands
- can follow
- can attack
- can gather
- can defend as a frontline role
- can be damaged
- have health
- have combat stats
- have gatherSpeed
- have a followTargetId
- may later have skills/proficiencies

---

## Enemy

Enemies:
- can move
- can attack
- can be damaged
- have health
- have combat stats
- may be passive or aggressive
- should not gather
- should not receive gathering stats

Early-game enemies are passive by default. Aggressive enemies should only appear through explicit enemy setup, zones, events, or debug scenarios.

---

## Resource

Resources:
- can be targeted for gathering
- have resourceType
- have durability
- have maxDurability
- have quantity
- have maxGatherers
- may be depleted/refreshed
- do not move
- do not attack
- do not have health
- do not gather

---

## Game State System

GameState is the central container of the simulation.

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

GameState should provide safe helpers for reading and updating state.

Systems should own behavior decisions. State helpers may support low-level shared operations such as entity lookup, entity updates, collision checks, movement helpers, and path-distance queries.

If movement/pathfinding grows significantly, it should be moved from `state.ts` into a dedicated movement/pathing module.

### Core Functions

- addEntity(entity)
- updateEntity(entity)
- getEntityById(id)

---

## Commands

Commands can be:

- Global/group commands
- Direct/entity-specific commands

Rules:
- Direct commands override only the targeted entity.
- Direct commands should not automatically change other entities.
- Other entities continue their current behavior.
- Future UI may issue direct commands through click-and-drag interactions.

---

## Party Management

GameState supports a party composed of:

- 1 player
- Up to 3 companions initially

Party size may change in the future.

---

## Systems

Systems operate on GameState.

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
- reads GameState
- updates entities through state helpers
- runs during simulation ticks
- should keep behavior focused and simple

---

## Game Loop

The game loop:
- runs continuously while enabled
- executes systems in order
- updates GameState
- supports idle/AFK simulation

System order should avoid conflicting movement updates. An entity should execute only one movement behavior per tick.

---

## Behavior Priority

- Each entity executes only one behavior per tick.
- Behavior is determined by entity state.
- Systems must not conflict when updating entity position.
- Movement planning/reservations should prevent stacking and body-block loops.

---

## Behavior Rules

### States

- idle → entity does nothing
- follow → entity follows assigned target
- attack → entity moves toward and attacks target
- gather → entity gathers from a resource
- defend → frontline role:
  - positions ahead of leader
  - engages leader’s target
  - does not chase far from leader
- dead → entity does not act

---

## Behavior End Rules

- gather ends when resource is depleted, then the entity switches to follow
- attack ends when target is dead or gone:
  - if another party member is in combat, assist
  - otherwise switch to follow
- idle remains idle until commanded

---

## Movement

- Top-down 2D (x, y)
- No gravity
- Movement is step-based for now
- Entities cannot occupy the same tile
- If destination is occupied:
  - try simple alternative positions
  - otherwise stay in place
- Formation should adapt naturally in narrow spaces

---

## Gathering Limits

- Resources define maxGatherers.
- Current default is 1 gatherer per resource.
- If too many entities try to gather:
  - allowed entities gather
  - extra entities fallback to follow
- Future resources may require or allow multiple gatherers.

---

## Resource Node Model

Resources use a two-layer depletion model:

- durability/currentDurability = progress toward extracting 1 resource
- maxDurability = durability reset value
- quantity/remainingAmount = number of resources still available in the node
- depleted = true when no resources remain

### Gathering Flow

1. Gatherer reduces resource durability based on gatherSpeed.
2. When durability reaches 0 or less:
   - add 1 resource to inventory based on resourceType
   - reduce node quantity by 1
3. If node quantity is still above 0:
   - reset durability to maxDurability
4. If node quantity is 0 or less:
   - mark node as depleted or remove it

Current resource types:
- wood
- ore
- herb

---

## Party Protection

When the main character is attacked:

- companions in idle or follow switch to attack
- companions already busy with gather, attack, or defend are NOT interrupted
- direct-commanded companions are NOT interrupted
- auto-retaliate only affects idle/follow entities

Fighter role alone must not override this rule. A fighter already attacking should not be retargeted by party protection unless explicitly commanded.

---

## Formation Rules

- Leader selects targets.

Defenders:
- receive and lock to leader’s target
- move first toward intercept
- stay within short distance of leader
- do not select independent targets
- do not chase enemies far away from leader

Leader:
- follows behind defenders during engagement

Fighters:
- follow leader
- assist combat

Gatherers:
- operate around leader
- commit to resource gathering

### Movement Priority

- Defender moves first
- Leader moves after defender
- Fighters follow leader
- Gatherers act independently unless commanded

### Constraints

- No entity stacking
- Avoid oscillation and body-block loops
- Formation adapts naturally in narrow spaces

---

## Debug Utilities

Debug/testing helpers may exist for development:
- Add/remove companions
- Reset health
- Reset resources
- Randomize positions
- Debug telemetry
- Debug maps
- Explicit aggressive-enemy test setups

These should be isolated from core systems and must not define final gameplay behavior.

---

## World Structure (Future)

- World is divided into zones.
- Each entity will later include zoneId.
- Teleport points connect zones.

Do NOT implement zones yet unless explicitly requested.

---

## Future Expansion

Do NOT implement unless requested:

- Zones and teleport points
- Skills
- Inventory items/equipment
- Class/subclass progression
- Networking/server authority
- Backend persistence
- Advanced aggro/threat systems
