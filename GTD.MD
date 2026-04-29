# GTD.md

## Overview

This document defines the technical structure of the game.

The project follows a **simulation-first architecture**:
- Game logic runs independently of the UI
- UI only reads and displays game state
- Systems update the world over time (idle/AFK ready)

---

## Core Architecture

The game is divided into:

- Game Logic (src/game/)
- UI Layer (React)

Game Logic must NOT depend on React.

---

## Folder Structure (Current)

src/game/
  entities/
  state/
  index.ts

---

## Entities System

Entities represent all actors in the world.

### Base Entity (GameEntity)

Properties:
- id: string
- kind: "player" | "companion"
- position: { x: number, y: number }
- state: "idle" | "follow" | "attack" | "gather" | "defend"

### Player
- Controlled directly by the user
- Shares base entity structure

### Companion
- Autonomous
- Has:
  - followTargetId

---

## Game State System

The GameState is the central container of the simulation.

Responsibilities:
- Stores all entities
- Provides access to entities
- Allows safe updates

### Structure

GameState should contain:
- entities: Record<string, GameEntity>

### Functions

- addEntity(entity)
- updateEntity(entity)
- getEntityById(id)

GameState must NOT contain game logic (only storage + access).

---

## Systems (Next Step)

Systems operate on GameState.

Examples:
- Follow System
- Combat System
- Gathering System
- Defend System

Each system:
- Reads GameState
- Updates entities
- Runs every tick

---

## Game Loop (Planned)

A game loop will:

- Run continuously (idle-friendly)
- Execute systems in order
- Update GameState

Example (conceptual):

updateFollowSystem()
updateCombatSystem()
updateGatherSystem()

---

## Movement

- Top-down 2D (x, y)
- No gravity
- Movement is step-based (for now)

---

## World Structure (Planned)

- World is divided into zones
- Each entity will later include:
  - zoneId
- Teleport points connect zones

Do NOT implement zones yet.

---

## AI Behavior (Planned)

Entities act based on state:

- idle → do nothing
- follow → move toward target
- attack → engage enemy
- gather → interact with resource
- defend → frontline behavior, position in front of leader and engage leader’s target

State-driven behavior is the core of automation.

---

## Design Constraints

- Keep systems simple
- Avoid premature optimization
- Do not introduce complex patterns early
- Expand only when needed

---

## Future Expansion (Do NOT implement yet)

- Combat mechanics
- Resource systems
- Inventory
- Skills
- Networking (server-authoritative)

---

## Development Rule

Always build:

1. Data (types)
2. State (storage)
3. System (logic)
4. Then UI

Never skip this order.

### Player

- Controlled directly by the user (future)
- Can also act autonomously (idle/AFK behavior)
- Uses the same state-driven system as companions (idle, follow, attack, etc.)
- Manual controls (e.g. WASD, clicking) will override or influence autonomous behavior

## Command Priority

- Commands may be group-based or entity-specific.
- Entity-specific direct commands override that entity’s current behavior.
- Direct commands should not automatically change other entities.
- Future UI may issue direct commands through click-and-drag interactions.

### Party Management (Current)

- GameState supports a party composed of:
  - Player (main entity)
  - Companion entities
- Initial party limit:
  - 1 player + up to 3 companions
- Party size may change in the future

### Command Scope

- Commands can be:
  - Global (affect multiple entities)
  - Direct (affect a single entity)
- Direct commands override only the targeted entity
- Other entities continue their current behavior

### Behavior Priority

- Each entity executes only one behavior per tick
- Behavior is determined by entity state
- Systems must not conflict when updating entity position

## Debug Utilities (Temporary)

- Debug/testing helpers may exist for development:
  - Add/remove entities
  - Reset health
  - Reset resources
  - Randomize positions
- These should be isolated from core systems
- They must not affect final game architecture

## Gathering Limits

- Resources can define how many entities may gather them at once.
- Current default is 1 gatherer per resource.
- If extra entities are ordered to gather a full resource, they switch to follow the leader.
- Future resources may require or allow multiple gatherers.

## Behavior Rules (Current)

### States

- idle → entity does nothing
- follow → entity follows assigned target (usually main character)
- attack → entity moves toward and attacks target
- gather → entity gathers from a resource
- defend → frontline role:
  - positions ahead of leader
  - engages leader’s target
  - does not chase far from leader

---

### Command Rules

- Commands can be:
  - direct (single entity)
  - group (multiple entities)
- Direct commands override only the targeted entity
- Extra entities (e.g. over-cap gatherers) fallback to follow

---

### Behavior Priority

- Each entity executes only ONE behavior per tick
- Behavior is determined strictly by entity state
- Systems must not conflict

---

### Behavior End Rules

- gather → ends when resource is depleted → switch to follow
- attack → ends when target is dead or gone:
  - if another party member is in combat → assist
  - otherwise → switch to follow
- idle → remains idle until commanded

---

### Movement Rules

- Entities cannot occupy the same tile
- If destination is occupied:
  - try simple alternative positions
  - otherwise stay in place

---

### Gathering Rules

- Resources define maxGatherers (default = 1)
- If too many entities try to gather:
  - allowed entities gather
  - extra entities fallback to follow

---

### Party Protection

- When main character is attacked:
  - companions in idle or follow switch to attack
  - companions already busy (gather/attack/defend) are NOT interrupted

---

### Future Rules (Planned)

- Defend is a toggle/assigned role, not automatic
- Auto-retaliate will only affect idle/follow entities
- Player manual input (WASD, click) will override autonomous behavior

## Entity Type Responsibilities

### Base Entity

All world entities share:
- id
- kind
- position
- state/status if applicable

Base entities should stay minimal.

---

### Player

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

---

### Companion

Companions:
- can receive commands
- can follow
- can attack
- can gather
- can defend (frontline role, not area guard)
- can be damaged
- have health
- have combat stats
- have gatherSpeed
- may later have skills/proficiencies

---

### Enemy

Enemies:
- can move
- can attack
- can be damaged
- have health
- have combat stats
- may be passive or aggressive
- should not gather
- should not receive gathering stats

---

### Resource

Resources:
- can be targeted for gathering
- have resourceType
- have durability/remaining amount
- have maxGatherers
- may be depleted/refreshed
- do not move
- do not attack
- do not have health
- do not gather

## Resource Node Model

Resources use a two-layer depletion model:

- durability/currentDurability = progress toward extracting 1 resource
- maxDurability = durability reset value
- quantity/remainingAmount = number of resources still available in the node
- depleted = true when no resources remain

### Gathering Flow

1. Gatherer reduces resource durability based on gatherSpeed
2. When durability reaches 0 or less:
   - add 1 resource to inventory based on resourceType
   - reduce node quantity by 1
3. If node quantity is still above 0:
   - reset durability to maxDurability
4. If node quantity is 0 or less:
   - mark node as depleted or remove it

### Notes

- Current resource types include wood, ore, and herb
- Future systems may modify gatherSpeed based on skills/tools
- Resources may later have different maxDurability and quantity values

## Formation Rules (Current)

- Leader selects targets

- Defenders:
  - receive and lock to leader’s target
  - move first toward intercept
  - stay within short distance (~2 tiles) of leader
  - do not select independent targets

- Leader:
  - follows behind defenders during engagement

- Fighters:
  - follow leader
  - assist combat

- Gatherers:
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
- Formation adapts naturally in narrow spaces (single-file movement)