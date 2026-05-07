GTD.md
Overview
This document defines the current technical structure of the game.

The project follows a simulation-first architecture:

Game logic runs independently of the UI
UI reads and displays game state
Systems update the world over time for idle/AFK play
Design intent is defined in GDD.md. This document defines how that intent is represented technically.

Core Architecture
The game is divided into:

Game Logic: client/src/game/
UI Layer: React components in client/src/
Game logic must NOT depend on React.

React may:

display game state
issue commands into game logic
start/stop the simulation loop for development
expose temporary debug controls
React must NOT contain core simulation rules.

Folder Structure
Current game logic is organized as flat TypeScript modules under client/src/game/.

Current files include:

types.ts
entities.ts
state.ts
commands.ts
gameLoop.ts
updateGame.ts
movementCadence.ts
followSystem.ts
attackSystem.ts
gatherSystem.ts
defendSystem.ts
enemyAISystem.ts
roleSystem.ts
roleProfiles.ts
partySystem.ts
partyFormationSystem.ts
partyProtectionSystem.ts
targetSelection.ts
explorationSystem.ts
attackSlots.ts
debugTools.ts
debugTelemetry.ts
debugMap.ts
index.ts
Do not restructure the project unless explicitly requested.

New helper modules may be added when they keep responsibilities clear.

Entity Model
Entities represent world objects and actors.

Entity Kinds
Current entity kinds:

companion
enemy
resource

The player is not represented as a world entity. The player is the manager/controller issuing intent and commands to party members.

Entity States
Current execution states:

idle
follow
attack
gather
defend
dead
States describe what an entity is currently doing.

Roles describe behavior priorities and should not be confused with states.

Position Model
Positions use numeric x and y coordinates.

Movement is continuous-style step movement, not strict tile-by-tile movement.

Entities move toward target positions by a small fixed step amount.

The current map/debug map may still provide:

bounds
walls
debug layout data
These are used for simple collision, wall checks, exploration, and movement validation.

Party Members
Companions are the physical party members.

Party members currently support:

id
classId
kind
position
state
health
maxHealth
combat timing
gather timing
gatherSpeed
currentTargetId
commandPriority
role
partyOrder
followTargetId
defendPosition

Shared party-member behavior is handled through partySystem.ts.

Current helper responsibilities include:

identify party members
get living party members
get the current party leader
sort party members by role priority and party order
identify busy gatherers
set party leader
set party member role
set party order
Leader
Leader is not a role.

Leader is stored in game state as:

partyLeaderId: string;


The current leader:

provides party intent
selects point of interest
selects enemy target
is a companion / physical party member
Systems must not assume any separate player entity exists.


If the configured leader is missing or dead, party helper logic falls back to the first living party member.

Roles
Roles apply to party members.

Role values:

type PartyMemberRole =
  | "defender"
  | "fighter"
  | "support"
  | "gatherer"
  | "none";
none is a safe default/unassigned role.

Current role ownership:

Party members have roles
CompanionRole aliases PartyMemberRole

Role behavior is handled by:

roleSystem.ts
roleProfiles.ts
role-specific systems such as defendSystem.ts and gatherSystem.ts
Party Order
Party order determines ordering within a role group.

Party members use:

partyOrder: number;
Formation/member ordering sorts by:

role priority
party order
id
Current role priority:

defender: 0
fighter: 1
support: 2
gatherer: 3
none: 4
Game State
GameState is the central simulation container.

Current responsibilities:

stores all entities
stores inventory counters
stores optional map/debug map data
stores auto-mode state
stores simulation tick
stores party leader id
stores leader intent
stores explored position records
stores follow trail records
stores movement planning data for the current tick
stores defender wait/blocking state
stores party formation state
stores combat feedback events
stores debug telemetry
Current movement planning fields include:

failedMoveByEntityId
moveIntentsByEntityId
reservedPositionsByEntityId
lastPositionsByEntityId
State helpers should remain low-level and safe. Systems should own behavior decisions.

Classes

Classes represent party member capabilities.

Roles represent behavior priorities.

Class data should stay in game logic under client/src/game/.

Current class model should remain structural only.

Initial class-related types:

type ClassPath =
  | "honor"
  | "primal"
  | "arcane"
  | "holy";

type ClassId =
  | "beginner"
  | "blade"
  | "aegis"
  | "hunter"
  | "beast"
  | "elementalist"
  | "runecaster"
  | "lightbearer"
  | "painbound";

type ClassDefinition = {
  id: ClassId;
  path: ClassPath | null;
  displayName: string;
};

Companions should store:

classId: ClassId;

Class definitions should live in:

classes.ts

Do not implement full ability systems, mana, resources, cooldowns, class progression, subclasses, or UI complexity until explicitly requested.

Classes must not depend on specific weapons.
Weapons are modifiers, not class identity.


Commands
Commands can be:

direct entity commands
Party member commands
Party member group commands
future leader-selection commands
future party-order commands
Rules:

direct commands override autonomous behavior for the targeted entity
direct commands should not automatically change other entities
direct commands are absolute for this phase
commands update leader intent only when issued by or for the current leader
Current command priority values:

type CommandPriority = "autonomous" | "direct";
Current command types use entity states except dead.

Leader Intent
Leader intent is stored as:

type LeaderIntent = {
  type: "attack" | "move" | "gather" | "explore";
  targetId: string | null;
  targetPosition: Position | null;
};
Leader intent is used by:

party movement
role behavior
combat targeting
exploration
defender positioning
Leader intent may be cleared when a point of interest is reached or combat ends.

Systems
Systems operate on GameState.

Current systems include:

Role System
Party Formation System
Exploration System
Defend System
Follow System
Enemy AI System
Attack System
Gathering System
Party Protection System
Debug Telemetry
Each system:

reads GameState
updates entities through state helpers
runs during simulation ticks
keeps behavior focused and simple
Systems must avoid conflicting movement updates.

Each entity should perform only one movement behavior per tick unless a system explicitly uses multi-step catch-up behavior.

Game Loop
The game loop:

runs continuously while enabled
executes systems in order
updates GameState
supports idle/AFK simulation
Current high-level order:

Clear expired combat feedback
Advance simulation tick
Clear tick movement planning
If auto mode is enabled, update role behavior
If auto mode is enabled, update party formation movement
If auto mode is enabled, reserve exploration movement
Update defender behavior
If auto mode is enabled, update exploration
Update follow behavior
Update enemy AI
Update attacks
Update gathering
Record debug telemetry
Movement conflicts are guarded with per-tick moved entity ids and reserved positions.

Movement
Movement rules:

top-down 2D
numeric positions
fixed step movement toward targets
no entity stacking
resources and living entities block movement
walls block movement when map data exists
map bounds apply when map data exists
party members may pass through each other in some party movement cases
movement reservations prevent conflicts
swap handling exists for party movement edge cases
failed movement is tracked per tick
Movement helpers live in state.ts.

If movement logic grows significantly, pathing and collision helpers may be moved to a dedicated module, but no restructure is required now.

Party Movement
Party movement is simple and leader-centered.

partyFormationSystem.ts currently owns:

reading leader intent
selecting a target position
deciding travel or combat phase
assigning travel follow targets
assigning shared combat targets
moving the leader toward the point of interest
moving followers toward the leader
clearing completed movement or combat state
Current party movement constants:

PARTY_COHESION_DISTANCE = 4
FOLLOW_DISTANCE = 1.5
FOLLOW_CATCHUP_DISTANCE = 5
COMBAT_BREAK_DISTANCE = 3
POI_REACHED_DISTANCE = 1
GATHERER_REJOIN_DISTANCE = 6
Current party movement does not use strict formation slots.

The party leader moves toward the point of interest only when the party is cohesive.

Followers move toward the leader when outside follow distance.

Busy gatherers and direct-commanded members are excluded from normal party movement.

Party Cohesion
Party cohesion is currently based on simple distance from the leader.

A party member counts as cohesive when:

it is the leader, or
it is close enough to the leader
Gatherers are excluded from cohesion while actively gathering a valid resource.

A gatherer rejoins normal cohesion when:

not actively gathering, and
close enough to rejoin party behavior
Direct-commanded members are excluded from autonomous cohesion behavior.

Follow System
followSystem.ts keeps autonomous followers near the current party leader.

A follower may move when:

it is a party member
it is in follow state
it is not the leader
it is not direct-commanded
it is not a busy gatherer
it has not already moved this tick
it is outside follow leash distance
Current follow constants:

FOLLOW_LEASH_RADIUS = 1.5
FOLLOW_CATCHUP_DISTANCE = 5
Followers that are far away may take extra catch-up steps.

Role System
roleSystem.ts assigns autonomous role targets when party members are available for role behavior.

Role behavior does not apply when:

the entity is not a party member
the entity is direct-commanded
the entity is already doing a non-interruptible current action
Current role behavior:

Fighters follow during travel and attack the leader's combat target when available
Gatherers search for resources and gather when possible
Supports avoid overriding travel movement and may attack the leader's target when not traveling
Defenders enter defend behavior as companions
None has no special autonomous role target
Role Profiles
roleProfiles.ts centralizes role metadata and tuning.

Current profile fields include:

positionBias
followDistance
aggression
taskCommitment
riskTolerance
movementPriority
cooldownUsage
resourceSpending
Current tuning fields include:

engageRange
chaseLimit
leashDistance
interruptBuffer
dangerThreshold
protectionRadius
support health threshold placeholders
resourceSearchRange
combatAssistRange
Support healing, shielding, buffs, cleanses, and summons are not implemented.

Defender System
defendSystem.ts owns defender-specific behavior.

Current defender behavior:

defenders guard near the leader
defenders use leader intent to choose a guard position
defenders can stand ahead or to the side of leader movement
defenders target the leader's enemy target
defenders can intercept nearby enemies threatening the leader or party
defenders attack in melee range
defenders may cause the leader to wait briefly so they can intercept
defenders avoid chasing too far away from the leader
Defender behavior is skipped during active party travel movement.

Direct-commanded defenders are not controlled by autonomous defend behavior.

Attack System
attackSystem.ts owns combat execution.

Current attack behavior:

attackers require a valid combat target
attackers move toward targets if out of range
attackers attack when in range and cooldown is ready
damage is applied directly
defeated targets enter dead state
enemies attacked by party members fight back
party members may assist nearby party combat targets
party protection is triggered when enemies damage party members
Current combat constants:

ATTACK_RANGE = 1
ATTACK_DAMAGE = 1
ATTACK_COOLDOWN_MS = 1000
TARGET_SWITCH_DISTANCE = 6
Combat movement order uses role priority for party members.

Enemy AI System
enemyAISystem.ts owns enemy autonomous targeting.

Current enemy behavior:

passive enemies do not seek targets on their own
aggressive enemies search for nearby party targets
enemies with valid targets enter or remain in attack state
enemies clear invalid targets
enemies attacking party members trigger party protection
Current enemy detection range:

ENEMY_DETECTION_RANGE = 5
Party Protection
partyProtectionSystem.ts responds when a party member is attacked.

Current behavior:

leader intent switches to attack the attacker
nearby idle/follow party members may switch to attack the attacker
direct-commanded party members are not overridden
busy gatherers are not pulled by distant threats
protection requires party members to be close enough to the attacked member
protectLeader currently aliases protectPartyMember.

Gathering System
gatherSystem.ts owns gathering execution.

Current gathering behavior:

gatherers require a valid resource target
gatherers move toward resources when out of range
gatherers gather when in range and cooldown is ready
resource durability is reduced
inventory increases when a resource yield is produced
depleted resources become invalid
gatherers return to follow when their target is depleted or invalid
resources limit how many gatherers may gather at once
Current gathering constants:

GATHER_RANGE = 1
GATHER_COOLDOWN_MS = 1000
GATHERER_PARTY_RETURN_DISTANCE = 15
Gatherers with autonomous gatherer behavior may stay committed to a resource task unless it becomes invalid or unsafe by current checks.

Exploration System
explorationSystem.ts owns current auto-exploration behavior.

Current exploration behavior:

only runs when auto mode is enabled
requires map/debug map data
records explored positions for autonomous entities
avoids active resources and walls
finds nearby enemies before unexplored positions
sets leader intent to attack when an enemy target is found
otherwise sets leader intent to explore toward the nearest reachable unexplored position
does not run movement while party formation has an active target
Current auto enemy target radius:

AUTO_ENEMY_TARGET_RADIUS = 48
Exploration still uses explored position records named exploredTiles in code.

Resources
Resources are entities.

Current resource fields:

resourceType
durability
maxDurability
quantity
maxGatherers
isDepleted
Current resource types:

wood
ore
herb
Gathering reduces durability. When durability reaches zero, quantity decreases and inventory may increase.

A resource is depleted when quantity reaches zero.

Combat Feedback
Combat feedback events are stored in game state.

Current feedback event types:

attack
damage
death
gather
Feedback events expire automatically.

Current feedback duration:

COMBAT_FEEDBACK_DURATION_MS = 900
Debug Telemetry
Debug telemetry records simulation information for inspection.

Current telemetry can track:

target acquisition
target changes
formation changes
skipped targets
movement failure
attack start
damage dealt
entity death
gathering start
resource depletion
role changes
Telemetry snapshots may include:

tick
entity id
kind
role
state
position
target
command priority
movement result
reason
formation phase
formation slot data when present
Debug telemetry should remain development-only.

Debug Utilities
Debug/testing helpers may exist for development:

Add/remove companions
Change roles
Change party order
Set current leader
Reset health
Reset resources
Randomize positions
Debug telemetry
Debug maps
Explicit aggressive-enemy test setups
These should remain isolated from core systems and must not define final gameplay behavior.

World Structure Future Work
World is divided into zones.
Each entity will later include zoneId.
Teleport points connect zones.
Do NOT implement zones unless explicitly requested.

Future Expansion
Do NOT implement unless requested:

Zones and teleport points
Full skill system
Inventory items/equipment
Class/subclass progression
Networking/server authority
Backend persistence
Advanced aggro/threat systems
Advanced ranged combat
Advanced support mechanics