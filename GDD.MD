# GDD.md

## Game Concept

A party-based exploration RPG where the player leads a small group of party members through a dangerous, newly discovered land.

The game is primarily idle/AFK, with optional active control. The player guides party intent, assigns roles, reacts to threats, and may later take direct control of the current leader.

The player is not a physical character in the world. The party members are the physical actors.

---

## Core Pillars

- Party members exist physically in the world
- Low input, high control
- Command-based control instead of micromanagement
- Simple autonomous behavior
- Roles define priorities, not restrictions
- Classes define what a party member can do
- Leveling supports long-term party growth
- Exploration, combat, gathering, and party movement interact as one system
- Party behavior should feel active, readable, and alive

---

## Core Gameplay Loop

1. Explore the world
2. Leader selects or discovers a point of interest
3. Party moves together
4. Party engages in combat, gathering, or exploration
5. Party reacts to threats
6. Party regroups
7. Party gains resources, XP, or progress
8. Continue toward the next point of interest

---

## Player & Party

The player is the party manager, not a physical character in the world.

The party has:

- one current leader
- up to 5 physical party members through progression
- adjustable party order
- assignable roles for each party member
- class identity for each party member
- level and XP progression for each party member

The current leader is one of the physical party members.

Leader is not a role.

Every party member can have a role:

- Defender
- Fighter
- Support
- Gatherer
- None / Unassigned

Roles define how a party member behaves. They do not restrict what the unit is allowed to do.

---

## Leader

The leader defines party intent.

The leader:

- selects the current point of interest
- selects the current enemy target
- represents the party member receiving the party's primary intent
- guides group movement during exploration and travel

Leader identity and combat role are separate.

A leader can be a Defender, Fighter, Support, Gatherer, or None.

If a party member is attacked, the party may switch target priority to that attacker.

If the current leader is missing, dead, or invalid, the party may fall back to another living party member as leader.

---

## Roles

Roles should use skill tags and current context to prioritize actions when skill systems exist.

Roles define priorities, not exclusivity.

If a role has no valid primary or secondary action, the party member may fall back to light combat participation.

Fallback combat must respect role identity:

- Fighters: full combat participation
- Defenders: moderate combat participation
- Supports: light, safe combat participation
- Gatherers: only when forced or idle
- None: basic fallback behavior only

Fallback actions must never override higher-priority role actions.

If a role has no valid high-priority action, the party member falls back to lower-priority behavior.

---

## Global Priority Hierarchy

1. Direct player command
2. Emergency survival action
3. Primary role action
4. Secondary role action
5. Fallback action
6. Idle / follow

Direct commands override autonomous role behavior.

---

## None / Unassigned

None is a safe unassigned/default role.

It is not a full gameplay role.

None should:

- follow party behavior when needed
- avoid special role logic
- use only basic fallback behavior
- remain safe for newly created or unconfigured party members

---

## Fighter Role

Purpose:

- Damage dealer and combat assistant

Primary behavior:

- Assist the leader's target
- Attack nearby enemies
- Use offensive tools when available
- Use damage or speed self-buffs when available

Secondary behavior:

- Follow the leader
- Regroup when too far away
- Return to the party when no target exists

Fallback:

- Return near the party
- Participate in combat if appropriate

Fighters should not interrupt their task for minor ally damage or minor support needs.

---

## Defender Role

Purpose:

- Protect the party and form the frontline

Primary behavior:

- Guard near the leader
- Position toward the leader's intent or current threat
- Target the leader's enemy target
- Engage enemy threats first
- Protect nearby allies
- Use taunt, aggro, control, mitigation, shield, or defensive tools when available

Secondary behavior:

- Attack current threat
- Return to guard position
- Hold near the leader and party

Fallback:

- Return near the party
- Participate in combat at moderate priority

Defenders should not chase distant enemies, abandon party safety, or deal extra damage at the cost of protection.

---

## Support Role

Purpose:

- Heal, shield, buff, and stabilize the party

Primary behavior:

- Stay near the party
- Stay behind frontline combat roles when possible
- Heal injured allies when healing exists
- Shield allies under threat when shielding exists
- Apply buffs when buffs exist
- Cleanse or control when those tools exist

Secondary behavior:

- Follow the leader
- Maintain safe position
- Participate in light combat when safe

Fallback:

- If in combat, deal light damage while staying safe
- If not in combat, follow the party

Support behavior should prioritize party survival over damage.

Support skills may exist in prototype form before the full support system is complete.

---

## Gatherer Role

Purpose:

- Collect resources while staying safe

Primary behavior:

- Find a valid nearby resource
- Move to that resource
- Gather it
- Use gathering, mobility, or safety tools when available
- Return closer to the party when idle or too far away

Secondary behavior:

- Avoid enemies
- Follow the party when not gathering
- Participate in combat only as fallback or when forced

Fallback:

- Follow party
- Help in combat only if appropriate

Gatherers:

- can leave the party to gather
- have their own gathering search range
- prioritize gathering over following while a valid gathering task exists
- rejoin the party when not actively gathering
- should not abandon gathering for distant combat, minor threats, or ally damage far away

---

## Party Movement

Party movement is simple and leader-centered.

The leader moves toward the current intent:

- enemy target
- resource target
- exploration point
- direct move target
- prototype map transition point

Other party members follow the leader unless their role or direct command gives them another task.

The party does not use a strict grid formation.

Party members should:

- stay near the leader during travel
- catch up if they fall behind
- avoid stacking on top of each other
- avoid blocked positions
- move in readable, small steps
- regroup after combat or gathering

Gatherers are allowed to temporarily leave the group while gathering.

Direct-commanded party members are not forced back into group movement by autonomous behavior.

---

## Party Cohesion

Party cohesion is based on simple distance from the leader.

During travel:

- required party members should remain close enough to the leader
- if party members fall too far behind, the leader may wait or slow progression
- movement resumes naturally once the group catches up

Required party members include alive/non-incapacitated Defenders, Fighters, and Supports.

Gatherers are required for cohesion only when they are not actively gathering.

Direct-commanded members are excluded from autonomous cohesion behavior.

---

## Combat

Combat is real-time and target-based.

Combat flow:

1. Leader identifies enemy target
2. Party receives shared target intent
3. Party approaches the enemy
4. Defenders guard and intercept threats
5. Fighters attack the selected target
6. Supports stay safer and assist when appropriate
7. Gatherers continue gathering unless pulled into fallback combat
8. When close enough, units attack
9. Defeated enemies grant XP to eligible living party members
10. Party regroups or continues exploration

Current attack range is mostly melee, but combat positioning should support future ranged classes.

Early-game enemies are passive by default and only fight back after being attacked.

Aggressive enemies may be introduced by enemy type, zone, event, or explicit debug scenario.

If any party member is attacked, the party may switch target priority to that attacker.

---

## Enemy Behavior

Enemies can be passive or aggressive.

Passive enemies:

- do not seek targets on their own
- fight back after being attacked

Aggressive enemies:

- may detect nearby party members
- may attack without being attacked first
- should respect their intended encounter area or leash behavior

Enemies may have levels.

Enemy level affects XP reward and may later affect stats, difficulty, loot, and encounter tuning.

---

## Gathering

Resources exist physically in the world.

Resources:

- have durability
- yield items when durability is depleted
- can have limited quantity
- become depleted
- may respawn later

Gathering is task-based, not manual.

Gatherers search for valid resources, move to them, gather over time, then return to party behavior when the task is finished or invalid.

Resources may limit how many gatherers can gather them at once.

Current resource categories:

- Wood
- Ore
- Herb

Resources currently grant prototype item stacks into the shared party inventory.

## Prototype Inventory

The party has a shared prototype inventory.

Inventory is slot-based and belongs to the party, not individual companions.

Current prototype inventory rules:

- starting capacity is 10 slots
- currency does not use inventory slots
- item gains go directly into shared inventory for now
- materials stack to 250
- consumables stack to 99
- equipment does not stack
- quest items can stack only if their item definition allows it
- event items can stack only if their item definition allows it

Current item categories:

- material
- consumable
- equipment
- quest
- event

This is not the full inventory, equipment, wallet, shop, crafting, trading, bank, loot, or persistence system.

Do not implement these unless explicitly requested:

- bank storage
- ground loot
- equipment slots
- item effects
- consumable use
- selling
- shops
- crafting
- trading
- save/load
- backend persistence
- full wallet UI


---

## Direct Orders

The player can give direct orders to specific party members.

Direct orders:

- override autonomous role behavior
- affect only the targeted party member
- do not automatically change other party members
- remain active until replaced, completed, or cleared

Example:

If the party is attacking but the player orders one party member to gather, that party member gathers while the rest continue fighting.

Future input may include click-and-drag commands from a unit to a target.

---

## Party Management

Initial prototype party:

- 1 current leader
- 2 starting party members

Party size may increase through total party level progression.

The player can issue:

- group commands
- direct orders
- role changes
- class changes
- party order changes
- leader changes

Party members act independently based on:

- current leader intent
- assigned role
- class
- available skills
- level
- party order
- direct commands
- nearby threats
- current task validity

## Main Menu and Party UI

The main gameplay UI may include a simple menu system for inspecting and managing the party.

Current intended main menu entries:

- Party
- Party Management
- Inventory

The player is the party manager, not a physical character. Menus should support party oversight, planning, and decision-making without implying the player is a world entity.

### Party Menu

The Party menu is for quick inspection and overview.

It may show:

- current companions in the party
- selected companion summary
- basic stats preview
- current role preview
- equipment preview, if equipment data exists

The Party menu is not the primary place for role decisions, equipment decisions, class decisions, party order changes, or advanced management.

To reduce unnecessary backtracking, the Party menu may provide contextual shortcuts for the selected companion:

- View Full Stats
- Change Role
- Manage Equipment

Shortcut intent:

- View Full Stats opens the full stats view for the selected companion
- Change Role opens Party Management for the selected companion with Role Select visible
- Manage Equipment opens Party Management for the selected companion with Equipment visible

If the target system does not exist yet, the shortcut may open a placeholder section only.

### Party Management Menu

The Party Management menu is for companion decisions and management.

It may show:

- companion list
- selected companion management options
- Role Select
- Equipment
- Full Stats

Role Select must use the existing party role values:

- Defender
- Fighter
- Support
- Gatherer
- None / Unassigned

Role changes affect role priority behavior. Leader identity remains separate from role.

Future-facing sections may appear as placeholders only:

- Party Order
- Formation
- Skill Preferences
- Behavior Settings

Placeholder sections must not implement future systems unless explicitly requested.

### Inventory Menu

The Inventory menu displays the shared prototype party inventory.

It may show:

- inventory slots
- item stacks
- item categories already supported by the current prototype inventory

The Inventory menu must not implement the full inventory, equipment, wallet, shop, crafting, trading, bank, loot, or persistence systems unless explicitly requested.



---

## Leveling

Party members gain XP and levels.

Leveling exists to support long-term progression, party growth, and class development.

Current leveling rules:

- party members start at level 1
- party members gain XP from defeated enemies
- living party members are eligible for XP
- dead party members do not gain XP
- max-level party members do not gain XP
- XP can be reduced when the enemy is much lower level than the party member
- level-ups may occur immediately when enough XP is gained

Current max level:

- Level 200

Current XP intent:

- early levels should be fast enough to show progression quickly
- later levels should take significantly longer
- XP rewards should scale with enemy level
- lower-level enemies should become less valuable as party members outlevel them

Leveling should remain simple and readable during the prototype phase.

---

## Party Size Progression

Party size is tied to total party character level.

Current party size progression:

- Total party level below 10: 2 party members
- Total party level 10 or higher: 3 party members
- Total party level 30 or higher: 4 party members
- Total party level 60 or higher: 5 party members

Party size progression should support the feeling of building an expedition over time.

Current intended party size must not exceed 5 unless explicitly redesigned.

---

## Classes

Classes define what a party member can do: available tools, stats, and abilities.

Roles define how a party member behaves and prioritizes those tools.

Classes do not override role behavior.

Roles do not restrict class capabilities.

Skill usage is determined by:

- role priorities
- skill tags
- current context such as combat, danger, gathering, or party safety

Classes must not depend on specific weapons.

Weapons are modifiers, not class identity.

---

## Starting Class

Party members may begin as:

- Beginner

Beginner is the starting class before choosing a class path.

Beginner should feel simple, flexible, and unfinished.

Beginner party members become eligible to choose a base class at level 10.

---

## Class Paths

There are four class paths:

- Honor Path
- Primal Path
- Arcane Path
- Holy Path

Each path has two base classes.

Subclass progression is future-facing and should not be implemented until explicitly requested.

---

## Honor Path

Theme:

- discipline
- training
- control
- technique

Base classes:

- Blade
- Aegis

Blade is an offensive melee and precision combat class focused on fast, consistent damage.

Aegis is a defensive combat class focused on mitigation, protection, and frontline control.

---

## Primal Path

Theme:

- instinct
- survival
- natural power
- adaptability

Base classes:

- Hunter
- Beast

Hunter is a tracking, positioning, precision, hybrid combat, and utility class.

Beast is a raw aggression class focused on sustain, feral combat, and resilience.

---

## Arcane Path

Theme:

- learned magic
- reality manipulation

Base classes:

- Elementalist
- Runecaster

Elementalist is a damage-focused magic class with support for burst damage and future support for AoE and DoT effects.

Runecaster is a control and utility magic class focused on traps, buffs, preparation, and battlefield manipulation.

---

## Holy Path

Theme:

- faith
- devotion
- divine power

Base classes:

- Lightbearer
- Penitent

Lightbearer is a healing, protection, and stabilization class.

Penitent is a high-risk, high-reward class based on self-sacrifice mechanics.

---

## Class Rules

Classes must not depend on specific weapons.

Weapons are modifiers, not class identity.

Base class selection from Beginner may exist during prototype progression.

Subclass progression is future-facing and should not be implemented until explicitly requested.

Classes define available skills, tools, and stat direction.

Roles determine how those tools are prioritized.

---

## Skills Prototype

Skills are simple abilities tied to classes.

Skills:

- are defined by tags
- use simple effects
- may use a shared prototype cooldown
- do not yet use mana or advanced resource systems
- are used as simple extensions of existing behavior

Skill usage is determined by:

- role priorities
- skill tags
- current context such as combat, danger, gathering, and safety

Current prototype skills may include:

- offensive damage
- splash damage
- marks
- self-buffs
- shields
- binds
- healing
- self-cost healing

Current prototype skills are not the full final ability system.

---

## Prototype Base Class Skills

Each base class may have a simple prototype skill.

Current intended prototype skill identities:

- Blade: Sweeping Strike
- Aegis: Guard Wall
- Hunter: Mark Target
- Beast: Feral Surge
- Elementalist: Elemental Bolt
- Runecaster: Binding Rune
- Lightbearer: Light Mend
- Penitent: Penitent's Gift

These skills are placeholders for class identity and role interaction.

They may be replaced, renamed, retuned, or expanded later.

---

## Skill Tags

Skills use tag categories.

Offensive:

- Offensive
- Damage
- DoT
- Single Target
- Multi Target
- AoE
- Trap
- Summon - Attack

Defensive:

- Defensive
- Shield
- Heal
- Safety
- Damage Mitigation
- Elemental Mitigation
- Summon - Defense

Control / Utility:

- Control
- Taunt
- Aggro
- Buff
- Cleanse
- Summon - Support

Movement:

- Mobility
- Dash
- Jump
- Escape

Gathering:

- Gathering
- Resource Buff
- Tool Buff

Cost:

- Self Cost - HP

Prototype / Utility:

- Self Buff
- Light Damage

Important rules:

- Roles determine preferred skill usage, not classes
- Classes define available skills, not behavior
- Skills must remain simple during this phase
- This is a prototype system, not a full ability system

---

## Skill Range

Skill ranges should use numeric values.

Examples:

- Melee: 1
- Short range: 3-4
- Medium range: 4-6
- Long range: 6+

Do not use vague terms like "short" or "medium" in implementation.

---

## World Structure

The world is divided into large zones/fields.

Zones are connected via teleport points at edges or key locations.

Each zone is a contained exploration area.

The game should feel continuous, not level-based.

Current map transitions may exist as prototype/debug behavior, but the final zone and teleport system should not be expanded unless explicitly requested.

Future entities will eventually include a zoneId in addition to position.

---

## World & Setting

The game begins on a newly discovered continent.

The player arrives by boat.

A central port town acts as the main hub. The current prototype hub is Harbor Union Bastion, a small safe port/peninsula settlement with placeholder town entities only.

Current prototype hub:

- Harbor Union Bastion is the first prototype hub map.
- It is a safe port/peninsula settlement.
- It currently includes a minimal beach/dock entry area, small city square, placeholder NPCs, and a clear exit to the first wild map.
- Current placeholders may include Quest Giver, Merchant, Smith, and Dog.
- The prototype hub should not spawn hostile enemies for now.
- The prototype hub must not implement full town systems, interiors, quests, shops, crafting, dialogue, or NPC interaction unless explicitly requested.


The expedition expands outward into regions such as:

- volcanic
- snowy
- foggy

Exploration includes:

- hidden paths
- caves
- secret areas
- dangerous wilderness
- resource locations
- enemy encounters

The world should feel like an expedition into unknown land, not a sequence of disconnected levels.

---

## Zones & Teleports

Final world structure should use large zones/fields connected by teleport points.

Teleport points should feel like physical world transitions, such as:

- road exits
- cave entrances
- boats
- mountain passes
- gates
- region boundaries

Prototype/debug map transitions may exist during development.

Current prototype/debug map routes are:

- `hub` <-> `map-1`
- `map-1` <-> `map-2`

Prototype teleport behavior should not define the final world structure.

Do not build the final zone system, persistent zone state, or full production teleport network unless explicitly requested.


---

## Maps & Room Design

Rooms and open areas must be large enough for party members and enemies to move without clogging.

Every room must be reachable from every other room.

Connect rooms with open passages, not doors, unless doors are explicitly designed as an interaction system later.

Do not place passages close to map edges.

Do not place entities inside walls or directly against walls.

Maps should support:

- party movement
- combat positioning
- resource gathering
- exploration
- readable navigation
- future zone expansion

---

## Visual Style

The game uses a top-down readable presentation.

Current visuals may use prototype sprites and placeholders.

Visual priorities:

- party members should be easy to identify
- enemies should be easy to distinguish from party members
- resources should be visible and readable
- movement direction should be understandable
- feedback should make combat, gathering, and skills readable

Prototype art assets are allowed while systems are being built.

Art assets should not define game logic.

Final art direction may evolve later.

---

## Player Experience

The player should feel like they are leading a small expedition.

The experience should emphasize:

- assigning roles
- choosing class direction
- growing party members over time
- setting party direction
- watching party members act independently
- reacting to danger
- deciding when to intervene
- making strategic decisions instead of constant inputs

The game should reward observation and planning more than constant clicking.

---

## Debug / Development Tools

Temporary debug tools may include:

- add/remove companions
- change roles
- change classes
- change party order
- set current leader
- randomize positions
- reset enemy and resource states
- restore party health
- inspect AI decision reasons
- inspect XP and level progression
- inspect class and skill behavior
- inspect movement/pathing issues
- debug map transitions
- export debug telemetry

Debug tools are not part of final gameplay.

---

## Future Systems

Do not implement these unless explicitly requested:

- final zone system
- full teleport network
- subclass progression
- weapons and equipment
- full inventory/equipment economy beyond the current prototype shared party inventory
- advanced ability framework
- mana or complex resource costs
- advanced support mechanics
- advanced aggro/threat mechanics
- advanced ranged combat
- backend persistence
- networking/server authority
- production asset pipeline
- final world content pipeline

---

## Conflict Resolution

If prompt instructions conflict with this document or `GTD.md`:

1. Stop
2. Explain the conflict clearly
3. Ask for confirmation before proceeding

Do not guess or silently override documented behavior.
