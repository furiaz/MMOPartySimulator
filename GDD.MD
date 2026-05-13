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

Current basic party attacks are mostly melee.

Prototype combat also supports numeric skill ranges and enemy attack ranges. Some prototype enemy archetypes may attack from range.

Combat positioning should continue to support future ranged classes without treating the current prototype ranged enemy behavior as the final ranged combat system.

Early-game enemies may be passive by default and only fight back after being attacked.

Aggressive enemies may be introduced by enemy archetype, enemy type, zone, event, or explicit debug scenario.


If any party member is attacked, the party may switch target priority to that attacker.

---

## Enemy Behavior

Enemies can be passive or aggressive.

Passive enemies:

- do not seek targets on their own
- may wander near their home position
- fight back after being attacked

Aggressive enemies:

- may detect nearby party members
- may attack without being attacked first
- may choose targets by enemy archetype preference
- should respect their intended encounter area or leash behavior

Current prototype enemy combat styles:

- Melee
- Ranged
- Support

Current prototype enemy target preferences:

- closest party member
- current leader
- lowest-health party member

Enemies may have levels, health, attack cooldowns, detection ranges, attack ranges, home positions, and lightweight roaming behavior.

Enemy XP rewards currently come from the enemy level XP table by default. Monster-specific XP adjustments, Superior monster reward modifiers, and special named Elite monster rewards are future-facing and should not be treated as part of the current archetype setup data.

Enemy level may later affect stats, difficulty, loot, and encounter tuning.

Current prototype enemy archetypes:

- Slime
- Cave Bat
- Forest Spider
- Goblin Scout
- Goblin Thrower
- Bog Imp
- Stone Crawler
- Thorn Shaman
- Ash Wisp
- Mossling
- Wolf
- Orc

Prototype enemy archetypes are lightweight tuning data for current supported setup values such as level, health, attack cooldown, detection range, attack range, temperament, combat style, and target preference. They are not final bestiary content, final encounter design, faction design, AI behavior trees, production combat roles, or XP reward tables.


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

## Prototype Inventory, Wallet, Drops, and Exchange

The party has a shared prototype inventory and wallet.

Inventory is slot-based and belongs to the party, not individual companions.

Current prototype inventory rules:

- starting capacity is 10 slots
- item gains go directly into shared inventory for now
- materials stack to 250
- consumables stack to 99
- equipment does not stack
- quest items can stack only if their item definition allows it
- event items can stack only if their item definition allows it
- equipment items may move between shared inventory and companion equipment slots

Current item categories:

- material
- consumable
- equipment
- quest
- event

The prototype wallet is shared by the party.

Current wallet rules:

- currency does not use inventory slots
- current currency is Crowns
- wallet balance may be shown in inventory, merchant UI, and temporary feedback
- wallet changes are game-state data, not individual companion data

Enemy drops currently use lightweight prototype drop tables.

Current enemy drop behavior:

- defeated enemies may roll material or equipment drops by enemy type
- current enemy drop tables exist for Wolf and Orc enemy types only
- drop results use short-lived visual feedback before being routed into shared inventory
- drops do not create persistent ground loot
- inventory overflow may partially or fully reject dropped items

Current prototype loot materials:

- Wolf Pelt
- Wolf Fang
- Wolf Claw
- Orc Tusk
- Orc Hide
- Orc Scrap

Current prototype enemy equipment drops may include:

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

Current quick exchange behavior:

- the hub Merchant can exchange eligible enemy parts for Crowns
- eligible quick-exchange parts are prototype material items marked for exchange
- quick exchange removes eligible parts from shared inventory
- quick exchange adds Crowns to the shared wallet
- this is a prototype exchange action, not a full selling or shop economy

Current merchant UI may show Buy and Sell placeholder panels.

Buy and Sell placeholder panels:

- may be visible in the merchant interaction UI
- do not currently implement buying or selling rules
- must not be treated as full shop behavior
- must not define economy rules in React UI




This is not the full inventory, wallet, equipment economy, shop, crafting, trading, bank, loot, or persistence system.

Do not implement these unless explicitly requested:

- bank storage
- persistent ground loot
- consumable item effects
- full selling or buying flows
- full shops
- crafting
- trading
- save/load
- backend persistence
- full wallet UI
- full equipment economy
- rarity, affixes, upgrades, durability, sockets, set bonuses, or item comparison

---

## Prototype Equipment

A lightweight prototype equipment foundation exists.

Equipment is gameplay-facing, not sprite-facing.

Equipped items:

- affect prototype equipment data
- may expose simple prototype stat modifiers such as attack, defense, max health, block, evasion, magic power, or healing power
- may be displayed in UI summaries
- do not imply a complete stat scaling system
- do not visually change character sprites
- do not add visible weapon swaps
- do not add paper-doll rendering, weapon anchoring, or sprite attachments


Current companion equipment slots:

- Head
- Chest
- Legs
- Gloves
- Boots
- Main Hand
- Offhand
- Accessory 1
- Accessory 2

Current prototype class equipment permissions:

- Beginner: Training Sword, no offhand
- Blade: One-Handed Sword, no offhand
- Aegis: One-Handed Mace, Shield
- Hunter: Bow, no offhand
- Beast: Claw Gauntlets, no offhand
- Elementalist: Orb, no offhand
- Runecaster: Rune Lantern, Talisman
- Lightbearer: Holy Mace, Holy Lantern
- Penitent: Thorn Whip, Sacrificial Dagger

Armor and accessories are currently shared prototype equipment categories and are not class-restricted unless explicitly defined later.


Current shared prototype armor and accessory examples include:

- Cloth Cap
- Padded Chest
- Padded Legs
- Cloth Gloves
- Travel Boots
- Plain Charm

Current enemy-drop prototype armor examples include:

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


Bow and Claw Gauntlets may occupy both hands as lightweight prototype exceptions.

Do not implement generalized dual wield, arbitrary two-handed combinations, subclass equipment expansion, equipment visuals, full stat scaling, gear recycling, or a full equipment economy unless explicitly requested.




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
- current starting leader is a Fighter
- current second starting member is a Defender
- the party currently starts in Harbor Union Bastion
- the shared inventory currently starts with one Training Sword as prototype/debug setup


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
- Quests


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
- basic item details on hover or selection
- equipment item details such as slot, type, and simple stat modifiers
- a shortcut from an equipment item to Party Management Equipment

The Inventory menu may display the shared wallet balance, but must not implement the full inventory, equipment economy, full wallet UI, shop, crafting, trading, bank, loot, or persistence systems unless explicitly requested.


### Quests Menu

The Quests menu displays the current prototype quest log.

It may show:

- available, active, ready-to-turn-in, and completed prototype quests
- current objective progress
- simple quest status labels
- simple prototype reward text
- inventory-full turn-in feedback when quest rewards cannot fit

The Quests menu must not implement a full quest journal, branching dialogue, quest reward economy, reputation, cutscenes, or production quest content unless explicitly requested.

## Prototype Quests and POI Direction

A lightweight prototype quest chain exists to guide idle/AFK progression through current debug maps.

Current prototype quest statuses:

- Locked
- Available
- Active
- Ready to Turn In
- Completed

Current prototype quest objective types:

- talk to POI
- reach POI
- defeat enemy count
- gather item count
- return to POI

Current prototype quests:

- Clear the Shore
- Gather Expedition Supplies
- Scout the Northern Road
- Threat Beyond the Pass

The Quest Giver in Harbor Union Bastion can accept available quests and turn in ready quests when the leader reaches the interaction range.
Current prototype quest reward behavior:

- ready quests can grant rewards through Quest Giver turn-in
- rewards may include Crowns, character XP, inventory items, and equipment items
- quest rewards are all-or-nothing
- reward values are validated before state changes are applied
- if every reward can fit, all rewards are granted and the quest completes
- if any item or equipment reward cannot fit, no rewards are granted
- inventory-full reward failure keeps the quest ready to turn in so the player can clear space and retry
- invalid reward data prevents reward claiming
- equipment rewards go into shared party inventory, not directly into companion equipment slots
- quest XP goes to living current party members only
- quest XP does not use enemy level-gap reduction
- max-level party members do not gain quest XP
- non-repeatable quests grant rewards once total
- completed quests may unlock later quests
- later quests may require specific earlier quests to be completed


Prototype POI direction may choose local targets for auto-mode behavior.

Current POI categories:

- NPC
- Quest
- Combat
- Resource
- Teleport
- Exploration
- Idle
- Event

POI direction may route the leader toward quest givers, combat targets, resources, exploration points, idle hub positions, or prototype teleports.

This is a prototype guidance layer for current debug maps. It is not a full quest system, dialogue system, final POI framework, final zone-routing system, or production content pipeline.

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
- XP rewards should scale from the enemy level table by default
- monster-specific XP deltas and Superior monster XP modifiers are future-facing tuning work
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

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity. Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

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

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity. Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

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
- It currently includes a minimal beach/dock entry area, small city square, placeholder NPCs, a healing fountain, and a clear exit to the first wild map.
- Current placeholders may include Quest Giver, Merchant, Smith, Dog, Test Blade, and Test Hunter.
- The Quest Giver supports the lightweight prototype quest chain only.
- The Merchant supports prototype quick exchange of eligible enemy parts for Crowns only.
- The healing fountain restores party member health when party members are in range.
- The prototype hub should not spawn hostile enemies for now.
- The prototype hub must not implement full town systems, interiors, branching dialogue, shops, crafting, recruitment, smithing, or NPC relationship systems unless explicitly requested.



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
- inspect quest state and POI decisions
- inspect wallet, drops, and merchant exchange telemetry
- inspect healing fountain behavior
- inspect enemy archetype, combat style, target preference, attack range, and target decision behavior


Debug tools are not part of final gameplay.

---

## Future Systems

Do not implement these unless explicitly requested:

- final zone system
- full teleport network
- subclass progression
- full equipment economy beyond the current prototype equipment foundation
- equipment visuals, weapon anchoring, paper-doll rendering, or visible weapon swaps
- full inventory/equipment economy beyond the current prototype shared party inventory
- advanced ability framework
- mana or complex resource costs
- advanced support mechanics
- advanced aggro/threat mechanics
- full ranged combat beyond current prototype skill and enemy attack ranges
- backend persistence
- networking/server authority
- production asset pipeline
- final world content pipeline
- full quest journal, branching dialogue, production quest content, or full quest reward economy beyond prototype quest rewards
- full shop, selling, buying, and merchant economy beyond prototype quick exchange
- persistent ground loot beyond prototype drop-to-inventory behavior
- production POI framework beyond current debug-map guidance


---

## Conflict Resolution

If prompt instructions conflict with this document or `GTD.md`:

1. Stop
2. Explain the conflict clearly
3. Ask for confirmation before proceeding

Do not guess or silently override documented behavior.
