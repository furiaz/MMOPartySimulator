# GDD.md

## Game Concept

A party-based exploration RPG where the player leads a small group of companions in a dangerous, newly discovered land.

The player controls one character directly while companions act autonomously based on assigned commands.

---

## Core Pillars

- Party exists in the world (not abstract)
- Command-based control instead of micromanagement
- Companions are multi-role (combat, gathering, defense)
- Gameplay is driven by exploration and emergent situations
- Primarily idle/AFK with optional active play

---

## Core Gameplay Loop

Explore the world  
→ Assign roles to companions  
→ Engage in combat or gathering  
→ React to threats  
→ Regroup and continue exploration  

---

## Player & Party

- Player controls one character directly
- Companions exist physically in the world
- Companions can:
  - Follow
  - Attack
  - Gather
  - Defend

Control is intent-based, not direct control of each unit.

---

## Combat

- Real-time combat
- Target-based system
- Party focuses on selected targets
- Combat is mostly automated once engaged

Future expansion:
- Skills
- Target prioritization
- Aggro/threat systems

---

## Gathering

- Resources exist in the world
- Companions can gather while the player explores
- Resources:
  - have durability
  - deplete and respawn

Focus is on task assignment, not manual gathering.

---

## Defend System

- Companions can guard an area or resource
- They react to nearby threats autonomously
- This enables area control and emergent gameplay

---

## World Structure

- The world is divided into large zones/fields
- Zones are connected via teleport points (edges or key locations)
- Each zone is a contained exploration area
- The game should feel continuous, not level-based

---

## World & Setting

- New continent, recently discovered
- Player arrives by boat
- Central port town hub
- Expanding outward into regions:
  - volcanic
  - snowy
  - foggy

Exploration includes:
- hidden paths
- caves
- secret areas

---

## Classes (High-Level)

Three main paths:

- Martial (Sword / Shield / Spear)
- Arcane (Fire / Water / Wind)
- Divine (Nature / Light / Pain)

Each path branches into subclasses later.

---

## Player Experience

The player should feel like they are leading a small expedition:

- assigning roles
- reacting to events
- watching companions act independently
- making strategic decisions instead of constant inputs

---

## Design Goals

- Low input, high control
- Strong system interaction (combat + AI + gathering)
- Emergent gameplay situations
- Scalable systems for future expansion

- Early-game enemies are passive by default and only fight back after being attacked.
- Aggressive enemies may be introduced later by enemy type, zone, or event.

## Direct Orders

- The player can give direct orders to specific party members.
- Direct orders override that unit’s current autonomous behavior.
- Example: if the party is attacking but the player orders one companion to gather, that companion gathers while the rest continue fighting.
- Future input may include click-and-drag commands from a unit to a target.

## Party System

- The player leads a party consisting of:
  - 1 main character
  - Up to 3 companions (initial limit)
- Companions act independently based on assigned commands
- The player can issue:
  - group commands
  - direct orders to specific companions

---

## Debug / Development Tools (Temporary)

- The game includes temporary debug tools for development:
  - Add/remove companions
  - Randomize entity positions
  - Reset enemy and resource states
  - Restore party health
- These tools are NOT part of final gameplay

