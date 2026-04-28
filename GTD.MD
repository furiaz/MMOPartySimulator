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
- defend → protect area

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

