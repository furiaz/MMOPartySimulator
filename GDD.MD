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

Companion combat may use derived combat stats for prototype attack power, defense, max health, evasion, block, magic power, healing power, magic defense, accuracy, critical hits, and passive health regeneration.

Derived stat combat integration should remain simple and readable. It should not become a final balance model, advanced threat model, or production combat formula system unless explicitly requested.

Combat positioning should continue to support future ranged classes without treating the current prototype ranged enemy behavior as the final ranged combat system.


Current prototype enemies may be passive or aggressive by archetype or setup.

Aggressive enemies may be introduced by enemy archetype, enemy type, zone, event, or explicit debug scenario.

If any party member is attacked, the party may switch target priority to that attacker.

## Party Defeat, Resurrection, and Recovery

Party members can die during combat.

Dead party members:

- do not act
- do not receive enemy XP
- may be revived by living companions when the party is out of combat

Current prototype resurrection behavior:

- living autonomous companions may move to dead companions after combat ends
- resurrection requires close range
- resurrection channels over time
- resurrection can be canceled if the helper becomes invalid, receives a direct command, or the target is revived
- revived companions return with minimal health and resume party behavior

If all party members are defeated outside the hub, prototype world-wipe recovery may rescue the party to an unlocked rescue hub.

Current prototype world-wipe recovery behavior:

- does not trigger in the hub
- restores companions to the selected rescue hub
- restores companion health
- clears active combat, movement, teleport, POI, skill, drop, and resurrection runtime state
- may charge Crowns based on route distance, limited by the current wallet balance
- may show short-lived rescue feedback

This is a prototype safety system, not the final death penalty, revive economy, checkpoint system, or town recovery design.

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

Enemies may have levels, health, attack cooldowns, detection ranges, attack ranges, home positions, subzone ids, encounter area ids, lightweight roaming behavior, and defeated timestamps.

Enemy XP rewards currently come from the enemy level XP table by default. Monster-specific XP adjustments, Superior monster reward modifiers, and special named Elite monster rewards are future-facing and should not be treated as part of the current archetype setup data.

Current prototype enemy scaling:

- supports starter and early scaling bands
- clamps effective scaling levels to the current prototype range
- derives simple combat stats such as max health, attack, defense, magic defense, evasion, and threat
- remains lightweight prototype tuning, not final encounter balance

Current prototype enemy respawn behavior:

- defeated enemies may respawn on wild maps after a short delay
- enemies respawn at their home position
- respawn restores health and clears temporary target, roam, mark, and bind state
- enemy respawn does not run in the hub

Current prototype enemy archetypes:

- Slime
- Cave Bat
- Forest Spider
- Goblin Scout
- Goblin Thrower
- Bog Imp
- Stone Crawler
- Goblin Shaman
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
- can have a resource tier
- can limit simultaneous gatherers
- become depleted
- may be rebuilt by map reset, debug reset, or future respawn behavior


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

- starting capacity is 50 slots
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
- junk

The prototype wallet is shared by the party.

Current wallet rules:

- currency does not use inventory slots
- current currency is Crowns
- wallet balance may be shown in inventory, merchant UI, and temporary feedback
- wallet changes are game-state data, not individual companion data

Enemy drops currently use lightweight prototype drop tables.

Current enemy drop behavior:

- defeated enemies may roll junk drops by enemy family and loot tier
- loot tier is currently derived from enemy level
- Tier 1 currently covers enemies below level 10
- Tier 2 currently covers enemies level 10 and above
- current family drop tables may exist for Slime, Bat, Spider, Goblin, Imp, Wolf, Crawler, Mossling, Wisp, and Orc families
- family/tier drops route prototype junk items into shared inventory
- Goblin Shaman may also roll a low-chance archetype-specific Holy Lantern equipment drop
- drop results use short-lived visual feedback before being routed into shared inventory
- drops do not create persistent ground loot
- inventory overflow may partially or fully reject dropped items

Current prototype gathered materials:

- Softwood
- Copper Ore
- Field Herb
- Hardwood
- Iron Ore
- Redleaf Herb

Legacy gathered material ids for Wood, Ore, and Herb may still exist for compatibility, but current resource yields should use tiered gathered material items.

Current prototype junk drops may include:

- Tier 1 Slime Gel
- Tier 1 Slime Core
- Tier 1 Bat Wing
- Tier 1 Bat Ear
- Tier 1 Spider Silk
- Tier 1 Spider Fang
- Tier 1 Goblin Ear
- Tier 1 Goblin Tooth
- Tier 1 Imp Horn Chip
- Tier 1 Imp Tail
- Tier 1 Wolf Pelt
- Tier 1 Wolf Fang
- Tier 1 Crawler Pebble
- Tier 1 Crawler Plate
- Tier 1 Moss Tuft
- Tier 1 Mossling Cap
- Tier 2 Goblin Ear
- Tier 2 Goblin Tooth
- Tier 2 Wisp Ash
- Tier 2 Wisp Ember
- Tier 2 Orc Hide
- Tier 2 Orc Tusk

Current prototype enemy equipment drops may include:

- Holy Lantern from Goblin Shaman

Current quick exchange behavior:

- the hub Merchant can exchange eligible junk items for Crowns
- eligible quick-exchange junk items are prototype junk items with sell value
- quick exchange removes eligible junk items from shared inventory
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

Current archetype-specific prototype equipment drops may include:

- Holy Lantern from Goblin Shaman

Older prototype armor items may still exist as item definitions, but they should not be treated as current enemy drop behavior unless a drop table explicitly uses them again.



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

The main gameplay UI may include a simple menu system for inspecting and managing the party and prototype world navigation.

Current intended main menu entries:

- Party
- Party Management
- Inventory
- Quests
- World Travel

The player is the party manager, not a physical character. Menus should support party oversight, planning, travel decisions, and decision-making without implying the player is a world entity.

### Party Menu

The Party menu is for companion-focused inspection and companion-specific management.

It may show:

- current companions in the party
- a selected companion summary
- companion Stats
- companion Equipment
- companion Skills
- companion Skill Preferences

The Party menu may use a persistent companion selector so the player can switch companions while staying inside companion-focused sections.

Current Party sections:

- Stats
- Equipment
- Skills
- Skill Preferences

Stats may show:

- available stat points
- Strength
- Dexterity
- Constitution
- Intelligence
- Wisdom
- level and XP progression
- derived combat stats from current prototype stat helpers

Stat allocation controls may appear in the Party Stats UI only when backed by game-logic commands. If allocation is not supported for the current state, controls must be disabled or read-only.

Equipment may show companion equipment slots and valid equipment choices from the shared party inventory. Equipment rules must remain in game logic.

Skills may show the selected companion's current class skills. Current class tabs may show only the companion's current class until class-history or multi-class progression data exists.

Skill Preferences may appear as a placeholder only until a supported skill-preference system exists.

The Party menu is not the primary place for whole-party decisions such as role assignment, party order, formation, or behavior settings.

### Party Management Menu

The Party Management menu is for party-wide decisions and management.

It may show:

- current leader status
- leadership switch action for living eligible companions
- Role Select
- Party Order
- Formation
- Behavior Settings

Leadership switching changes the current leader identity only. It does not change role, class, party order, equipment, or party behavior rules.

Role Select must use the existing party role values:

- Defender
- Fighter
- Support
- Gatherer
- None / Unassigned

Role changes affect role priority behavior. Leader identity remains separate from role.

Party Order may support ordering companions for party behavior and display.

Formation and Behavior Settings may appear as placeholders only until those systems are explicitly implemented.

Party Management should not own companion-specific Stats, Equipment, Skills, or Skill Preferences unless explicitly redesigned later.


### Inventory Menu

The Inventory menu displays the shared prototype party inventory.

It may show:

- inventory slots
- item stacks
- item categories already supported by the current prototype inventory
- basic item details on hover or selection
- equipment item details such as slot, type, and simple stat modifiers

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

### World Travel Menu

The World Travel menu is a prototype navigation menu for choosing available known prototype map destinations.

It may show:

- current prototype map
- available connected prototype destinations
- destination display names
- whether a destination can currently be selected
- simple unavailable-state messaging when travel is blocked

World Travel selection may request travel to an available prototype teleport destination by setting party travel intent toward the relevant teleport point.

World Travel must use existing prototype teleport route data and current map state. It must not create final zone routing, persistent zone state, fast travel rules, map discovery rules, production travel costs, or a full world map unless explicitly requested.

World Travel does not replace physical teleport points. It is a menu-driven way to guide the party toward currently valid prototype map transitions.


## Prototype Quests and POI Direction

A lightweight prototype quest chain exists to guide idle/AFK progression through current debug maps.

Current prototype quest statuses:

- Locked
- Available
- Active
- Ready to Turn In
- Completed

Supported prototype quest objective type definitions:

- talk to POI
- reach POI
- defeat enemy count
- gather item count
- return to POI

Current prototype quest content currently uses:

- reach POI
- defeat enemy count
- gather item count

Talk-to-POI and return-to-POI objective types are lightweight type support and should not be treated as implemented quest content unless a quest definition uses them.


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

POI selection should prefer progression-relevant targets before generic local activity.

Current intended POI priority order:

1. active World Travel route target
2. hub Merchant quick exchange when eligible junk is available
3. ready quest turn-in target
4. active quest objective target on the current map
5. available quest acceptance target on the current map
6. quest-required prototype teleport when the active objective is on a connected map
7. nearby combat target when combat is relevant
8. nearby resource target when gathering is relevant
9. reachable unexplored exploration point
10. safe idle hub point

POI selection should avoid selecting invalid, unreachable, depleted, dead, completed, locked, or already satisfied targets.

POI selection should not repeatedly choose the same failed target when a better valid target exists.

POI direction may route the leader toward quest givers, combat targets, resources, exploration points, idle hub positions, or prototype teleports.

If combat interrupts an active POI target, the prototype may preserve the interrupted POI and restore it after combat ends when the target is still valid and no direct party command blocks it.


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
- level-ups may increase natural primary stats through prototype class growth
- level-ups may grant unspent stat points after base class progression begins
- player-assigned stat points are stored as companion stat data, not UI-only state


Current max level:

- Level 200

Current XP intent:

- early levels should be fast enough to show progression quickly
- later levels should take significantly longer
- XP rewards should scale from the enemy level table by default
- monster-specific XP deltas and Superior monster XP modifiers are future-facing tuning work
- lower-level enemies should become less valuable as party members outlevel them

Leveling should remain simple and readable during the prototype phase.

### Prototype Companion Stats

Current primary stats:

- Strength
- Dexterity
- Constitution
- Intelligence
- Wisdom

Primary stats are prototype progression data for companions.

Current prototype stat sources may include:

- natural stats from starting values and level-up growth
- allocated stats from player-assigned stat points
- temporary stat modifiers from prototype effects
- equipment stat modifiers from equipped items

Current derived combat stats may include:

- Attack
- Defense
- Max HP
- Evasion
- Block
- Magic Power
- Healing Power
- Magic Defense
- Accuracy
- Critical Chance
- Critical Damage
- Health Regen

Derived combat stats are calculated from primary stats and equipment modifiers. They are the current prototype path for making class growth, allocation, and equipment matter in combat.

Beginner growth is broad and simple.

Base class growth should express class identity using small automatic stat increases:

- Blade emphasizes Strength and Dexterity
- Aegis emphasizes Constitution and frontline durability
- Hunter emphasizes Dexterity
- Beast emphasizes Strength and Constitution
- Elementalist emphasizes Intelligence
- Runecaster emphasizes Intelligence and Wisdom
- Lightbearer emphasizes Wisdom
- Penitent emphasizes Constitution and Wisdom

Current stat allocation is prototype-only and should stay simple.

Do not implement final balance curves, respec systems, advanced formulas, secondary class stat history, or permanent build-locking rules unless explicitly requested.


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
- should be selected through role priorities and context instead of hardcoded class behavior

Skill usage is determined by:

- role priorities
- skill tags
- current context such as combat, danger, gathering, and safety
- target validity
- range
- cooldown availability

Current prototype skills may include:

- offensive damage
- splash damage
- marks
- self-buffs
- shields
- binds
- healing
- self-cost healing
- beginner fallback combat or survival tools

Current prototype skills are not the full final ability system.

Skill logic should remain in game logic, not React UI.

---

## Prototype Beginner Skills

Beginner may have simple prototype skills before choosing a base class.

Beginner skills should feel basic, flexible, and transitional.

Current intended Beginner prototype skill identities:

- Throw Rock
- Kick
- Guard Up
- First Aid
- Deep Breath
- Rally Call
- Field Hands
- Quick Step

Throw Rock is a simple ranged taunt tool.

Kick is a simple melee fallback attack.

Guard Up is a simple defensive survival skill.

First Aid is a small emergency recovery skill.

Deep Breath is a simple self-buff.

Rally Call is a simple ally buff.

Field Hands is a simple gathering support skill.

Quick Step is a simple mobility and escape skill.


Beginner skills should not compete with base class identity. They exist to make early party members feel functional before level 10.

Beginner skills may be replaced, renamed, retuned, or removed later.

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
- Beginner skills are temporary prototype tools, not a final class kit
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
- The Merchant supports prototype quick exchange of eligible junk items for Crowns only.
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
- `map-2` <-> `map-3`
- `map-3` <-> `map-4`

Current readable prototype/debug map names:

- `hub`: Harbor Union Bastion
- `map-1`: First Wild Map
- `map-2`: Second Wild Map
- `map-3`: Third Wild Map
- `map-4`: Fourth Wild Map

Current prototype wilderness maps may contain named subzones, encounter areas, encounter leashes, resource locations, and UI-facing subzone labels.

Subzones and encounter areas are current prototype map-organization data. They must not be treated as the final zone system, final region content model, final encounter design pipeline, or persistent world-state structure.


Prototype teleport behavior should not define the final world structure.

The World Travel menu may expose currently available prototype/debug map destinations and guide the party toward the matching teleport point.

World Travel is menu-driven travel intent for existing prototype routes. It is not instant fast travel unless explicitly implemented that way later.

Do not build the final zone system, persistent zone state, full production teleport network, travel costs, map discovery, or a full world map unless explicitly requested.


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
- NPCs should be easy to identify in prototype hub spaces
- resources should be visible and readable
- movement direction should be understandable
- feedback should make combat, gathering, and skills readable

Enemy and NPC name labels may be used as UI-facing readability aids. Name labels must not define simulation behavior, targeting rules, NPC behavior, dialogue, or final content pipeline rules.


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
- inspect enemy scaling, respawn, subzone, and encounter area behavior
- inspect resurrection and world-wipe recovery behavior
- inspect interrupted POI restore behavior


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
- final death penalty, checkpoint, resurrection economy, or recovery system beyond prototype resurrection and world-wipe recovery
- production enemy respawn, encounter reset, or spawn scheduling beyond current prototype wild-map respawn behavior
- production POI framework beyond current debug-map guidance


---

## Conflict Resolution

If prompt instructions conflict with this document or `GTD.md`:

1. Stop
2. Explain the conflict clearly
3. Ask for confirmation before proceeding

Do not guess or silently override documented behavior.
