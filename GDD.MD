# GDD.md

## Game Concept

A party-based idle exploration RPG where the player manages a small expedition through a dangerous newly discovered land.

The player is the party manager, not a physical character in the world. Party members are the physical actors who move, fight, gather, recover, and progress.

The game is primarily idle/AFK with optional active intervention. The player guides party intent, assigns roles, chooses class direction, reacts to danger, and may directly command party members when needed.

---

## Core Pillars

- Party members are physical actors in the world
- The player gives intent instead of micromanaging every action
- Low input should still produce meaningful control
- Autonomous behavior should be simple, readable, and predictable
- Roles define behavior priorities, not hard restrictions
- Classes define available tools, stats, and progression identity
- Exploration, combat, gathering, movement, quests, inventory, and progression should support one shared expedition loop
- Party growth should be visible through level, class, equipment, skills, and party size progression
- Prototype systems should stay lightweight until intentionally expanded

---

## Core Gameplay Loop

1. The party explores the current map or follows a chosen destination.
2. The leader selects or receives the current point of interest.
3. Party members move with the leader unless their role, task, or direct command gives them another priority.
4. The party engages in combat, gathering, quest work, travel, or recovery.
5. Party members react to threats and role needs.
6. The party regroups when the immediate task ends.
7. The party gains resources, XP, quest progress, items, Crowns, or map progress.
8. The expedition continues toward the next useful objective.

---

## Player & Party

The player manages the party from outside the world.

The party has:

- one current leader
- up to 5 physical party members through progression
- adjustable party order
- assignable roles
- class identity
- level and XP progression
- shared inventory and wallet systems during the prototype phase

The current leader is always one of the physical party members.

Leader is not a role.

Every party member can have one role:

- Defender
- Fighter
- Support
- Gatherer
- None / Unassigned

Roles describe how party members prioritize actions. Roles do not remove the ability to perform fallback behavior when appropriate.

---

## Leader

The leader defines the party's current intent.

The leader may:

- guide exploration and travel
- select or receive the current point of interest
- select the current enemy target
- move toward direct player commands
- anchor party cohesion
- represent the party member currently carrying the expedition's primary intent

Leader identity and combat role are separate.

A leader can have any role, including None / Unassigned.

If a party member is attacked, the party may temporarily prioritize that attacker.

If the current leader is missing, dead, or invalid, party behavior may fall back to another living party member as leader.

---

## Roles

Roles define priorities, not exclusivity.

Roles should use skill tags and current context when skill systems exist.

If a role has no valid primary or secondary action, the party member may fall back to lower-priority behavior.

Fallback combat must respect role identity:

- Fighters may fully participate in combat
- Defenders may participate at moderate priority while preserving protection behavior
- Supports may participate lightly while staying safe
- Gatherers may participate only when forced, threatened, or idle
- None / Unassigned uses only basic fallback behavior

Fallback actions must never override higher-priority role actions.

Direct commands always override autonomous role behavior unless the target is unable to act.

### Gathering Terminology

`Gatherer` refers only to the assigned Gatherer role.

A `collector` is any non-Gatherer-role companion currently gathering or assigned to gather a resource through party intent, AI intent, quest intent, or player command.

Collector examples:

- a Defender gathering the leader's quest herb target
- a Fighter gathering a player-commanded resource target
- a Support gathering because the party has shared gather intent
- a None / Unassigned companion gathering from shared party intent

Collectors do not gain autonomous Gatherer-role resource search behavior.

Only Gatherer-role companions may independently choose separate valid resource nodes through Gatherer role behavior.

When a collector is actively threatened or attacked, combat/self-defense priority may temporarily interrupt gathering. When the threat is gone, the party may resume the interrupted resource or quest gather objective.

---

## Global Priority Hierarchy

1. Direct player command
2. Emergency survival action
3. Primary role action
4. Secondary role action
5. Fallback action
6. Idle / follow

This priority hierarchy applies to autonomous party behavior unless a specific system documents a narrower exception.

---

## None / Unassigned

None / Unassigned is the safe default role.

It is not a full gameplay role.

None / Unassigned should:

- follow party behavior when needed
- avoid special role logic
- avoid proactive combat, gathering, support, or protection behavior
- use only basic fallback behavior
- remain safe for newly created or unconfigured party members

---

## Fighter Role

Purpose:

- Deal damage and help finish threats quickly

Primary behavior:

- assist the leader's target
- attack nearby valid enemies
- use offensive skills when available
- use damage, speed, or combat self-buffs when available

Secondary behavior:

- follow the leader
- regroup when too far away
- return to the party when no valid target exists

Fallback behavior:

- return near the party
- participate in combat when appropriate

Fighters should prioritize combat contribution over minor ally support needs.

Fighters should not abandon an active combat task for distant, low-priority, or non-emergency distractions.

---

## Defender Role

Purpose:

- Protect the party and hold the frontline

Primary behavior:

- guard near the leader or party center
- position toward the current threat or leader intent
- engage the leader's enemy target when appropriate
- intercept nearby threats
- protect nearby allies
- use taunt, aggro, control, mitigation, shield, or defensive skills when available

Secondary behavior:

- attack the current threat
- return to guard position
- hold near the leader and party

Fallback behavior:

- return near the party
- participate in combat at moderate priority

Defenders should value party safety over damage.

Defenders should not chase distant enemies, abandon nearby allies, or deal extra damage at the cost of protection.

---

## Support Role

Purpose:

- Heal, shield, buff, and stabilize the party

Primary behavior:

- stay near the party
- stay behind frontline combat roles when possible
- heal injured allies when healing exists
- shield allies under threat when shielding exists
- apply buffs when buffs exist
- cleanse, control, or stabilize when those tools exist

Secondary behavior:

- follow the leader
- maintain safe position
- participate in light combat when safe

Fallback behavior:

- in combat, deal light damage while staying safe
- out of combat, follow the party

Support behavior should prioritize party survival over damage.

Support skills may exist in prototype form before the full support system is complete.

---

## Gatherer Role

Purpose:

- Collect resources while staying safe

Primary behavior:

- find a valid nearby resource
- move to that resource
- gather it
- use gathering, mobility, or safety tools when available
- return closer to the party when idle, unsafe, too far away, or finished

Secondary behavior:

- avoid enemies
- follow the party when not gathering
- participate in combat only as fallback or when forced

Fallback behavior:

- follow the party
- help in combat only when appropriate

Gatherers:

- can temporarily leave the party to gather
- have their own gathering search behavior
- prioritize gathering over following while a valid reachable gathering task exists
- avoid resources already reserved by other autonomous gatherers when reservation capacity is full
- respect resource `maxGatherers`
- may stay committed to their current valid resource when normal interruption logic would otherwise pull them away
- rejoin the party when not actively gathering or when their target becomes invalid
- must stay within current gatherer leash behavior or the leader's current subzone boundary when Stay in Subzone is enabled
- should not abandon gathering for distant combat, minor threats, or ally damage far away

---

## Party Movement

Party movement is simple and leader-centered.

The leader moves toward the current intent:

- enemy target
- resource target
- exploration point
- quest point
- direct move target
- prototype map transition point
- prototype World Travel route step

Other party members follow the leader unless their role, current task, resurrection participation, or direct command gives them another task.

The party does not use a player-authored grid formation.

Current prototype movement uses a lightweight automatic party formation and cohesion layer.

Current prototype party formation and activity behavior:

- tracks whether the party is idle, forming, traveling, or in combat
- uses party activity coordination to choose travel or combat from direct player intent, nearby active threats, party combat targets, movement targets, and current distance
- assigns shared travel or combat intent from the leader's current target or POI target
- moves the leader toward the current POI or target when cohesion allows it
- moves followers toward the leader or soft follow positions
- allows party members to pass through each other in specific party movement cases
- may assign all autonomous party members to gather when the leader intent is a shared gather target
- assigns combat targets to autonomous party members when combat begins
- excludes direct-commanded, direct-command grace, resurrection-assigned, and threat-responding companions from autonomous travel cohesion where appropriate
- clears formation state when no valid target or travel point remains
- records formation changes in debug telemetry

Party members should:

- stay near the leader during travel
- catch up if they fall behind
- avoid stacking on top of each other
- avoid blocked positions
- move in readable, small steps
- regroup after combat, gathering, resurrection, or travel transitions

Gatherers are allowed to temporarily leave the group while gathering.

Direct-commanded party members are not forced back into group movement by autonomous behavior.

This is an automatic prototype movement aid, not a final formation editor, tactical formation system, or player-authored positioning system.

---

## Party Cohesion

Party cohesion is based on simple distance from the leader.

During travel:

- required party members should remain close enough to the leader
- if party members fall moderately behind, the leader may slow down
- if party members fall too far behind, the leader may wait
- followers may briefly catch up faster when they are too far from the leader
- movement resumes naturally once the group catches up

Required party members include living, non-incapacitated Defenders, Fighters, Supports, and non-busy party members.

Gatherers are required for cohesion only when they are not actively gathering and are close enough to be rejoining the party.

Direct-commanded members and resurrection participants are excluded from autonomous cohesion behavior.

Current prototype cohesion distances are implementation tuning values and should not be treated as final balance.

---

## Combat

Combat is real-time and target-based.

Combat flow:

1. The leader identifies or receives an enemy target.
2. The party receives shared combat intent.
3. The party approaches the enemy when needed.
4. Defenders guard, intercept, and hold the frontline.
5. Fighters focus on damaging valid targets.
6. Supports stay safer and stabilize the party.
7. Gatherers continue gathering unless threatened, forced, idle, or pulled into fallback combat.
8. Units attack or use valid skills when in range.
9. Defeated enemies grant XP to eligible living party members.
10. The party regroups, recovers, resumes gathering, or continues exploration.

Current basic party attacks are mostly melee.

Prototype combat supports numeric skill ranges and enemy attack ranges. Some prototype enemy archetypes and enemy types may attack from range.

Companion combat may use derived combat stats for prototype attack power, defense, max health, evasion, block, magic power, healing power, magic defense, accuracy, critical hits, healing, shields, and passive health regeneration.

Derived stat combat integration should remain simple and readable. It should not become a final balance model, advanced threat model, or production combat formula system unless explicitly requested.

Combat positioning should support future ranged classes without treating current prototype ranged enemy behavior as the final ranged combat system.

Current prototype enemies may be passive or aggressive by archetype or setup.

Aggressive enemies may be introduced by enemy archetype, enemy type, zone, event, or explicit debug scenario.

If any party member is attacked, blocked by a nearby enemy while moving, or stuck near a threat during active party intent, the party may temporarily switch to self-defense and preserve the interrupted POI or travel intent for later restoration.

---

## Party Defeat, Resurrection, and Recovery

Party members can die during combat.

Dead party members:

- do not act
- do not move
- do not receive enemy XP
- may be revived by living companions when the party is out of combat

Current prototype resurrection behavior:

- resurrection is driven by party recovery intent when a companion is dead
- the recovery intent may temporarily pause POI, World Travel, teleport, gathering, or combat intent
- existing party intent may be queued and restored when recovery ends
- living autonomous companions may be assigned as resurrection participants for the selected dead companion
- participants move toward valid stand positions inside the resurrection area
- the current prototype resurrection area uses a short range around the dead companion
- resurrection progresses over time when living companions are within the resurrection area
- multiple living contributors may speed resurrection progress through prototype contribution multipliers
- participants may attack active threats inside the resurrection area while recovery remains active
- direct-commanded companions do not start or continue resurrection participation
- resurrection assignments are cleared when the helper, target, or recovery intent becomes invalid
- revived companions return with minimal health and resume party behavior

If all party members are defeated outside the hub, prototype world-wipe recovery may rescue the party to an unlocked rescue hub.

Current prototype world-wipe recovery behavior:

- does not trigger in Harbor Union Bastion
- rescues normal wild-map wipes to the closest unlocked rescue hub by route distance
- rescues Slimeward dungeon floor wipes directly to Slimeward Camp
- may present a pending rescue choice if multiple unlocked rescue hubs are equally valid
- restores companions to the selected rescue hub arrival positions
- restores companion health
- clears active combat, movement, teleport, POI, skill, drop, resurrection, formation, and map-local runtime state
- clears Slimeward dungeon runtime when rescue returns the party to Slimeward Camp
- may charge Crowns based on route distance, limited by the current wallet balance
- records map reach for quest state after rescue
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
- may choose targets by enemy type target preference
- should respect their intended encounter area or leash behavior

Current prototype enemy combat styles:

- Melee
- Ranged
- Support

Current prototype enemy target preferences:

- closest party member
- current leader
- lowest-health party member

Enemies may have levels, health, attack cooldowns, detection ranges, attack ranges, home positions, subzone ids, encounter area ids, lightweight roaming behavior, defeated timestamps, and optional prototype variants.

Enemy XP rewards currently come from the enemy level XP table by default. Superior enemies currently apply a prototype XP multiplier. Monster-specific XP adjustments and special named Elite monster reward modifiers are future-facing tuning work and should not be treated as part of normal enemy archetype or enemy type setup data.

Current prototype enemy variants:

- Superior enemies may appear on eligible wild-map enemy spawns.
- Superior enemies do not spawn in the hub.
- Superior enemies do not roll in the middle twenty percent of a map's height.
- A subzone can have at most one living Superior enemy at a time.
- Superior enemies have increased health, attack, defense, magic defense, XP, drop tables, render scale, and a visible renderer aura.
- Superior enemy spawning may happen during map spawn, enemy respawn, or explicit debug forcing.

Superior enemies are prototype rare-variant behavior, not final elite design, named boss design, affix design, or production rare-monster tuning.

Current prototype enemy scaling:

- supports starter and early scaling bands
- clamps effective scaling levels to the current prototype range
- derives simple combat stats such as max health, attack, defense, magic defense, evasion, and threat
- remains lightweight prototype tuning, not final encounter balance

Current prototype enemy respawn behavior:

- defeated enemies may respawn on wild maps after a short delay
- enemies respawn at their home position
- respawn restores health and clears temporary target, roam, mark, and bind state
- respawn may reroll eligible Superior enemy variant state
- enemy respawn does not run in the hub

Current prototype enemy AoE behavior:

- the hub includes a debug AoE target dummy
- the AoE dummy starts its stomp only when the player, party intent, direct command, or party combat state engages it
- the stomp locks a circular area, channels briefly, enters a short windup, then deals small physical damage to living companions still inside the circle at impact
- shield blocks and passive block can prevent the damage
- binding the caster, killing the caster, or blocking line of sight to the locked area interrupts the channel and starts cooldown
- the renderer shows the danger circle and channel bar

Prototype enemy AoE behavior is debug combat-test behavior, not a final enemy ability framework, boss mechanic system, or production telegraph design.

Current prototype enemy archetype/family ids:

- Slime
- Bat
- Spider
- Goblin
- Imp
- Wolf
- Crawler
- Mossling
- Wisp
- Orc

Current prototype enemy types:

- Slime
- Heavy Slime
- Pale Ooze
- Slime Spitter
- The Azure Mass
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

Slimeward-specific enemy types currently use the Slime archetype/family and exist for the Slimeward dungeon prototype.

Prototype enemy archetypes/families provide lightweight defaults such as display name, default combat style, default attack range, default temperament, and drop-family identity.

Prototype enemy types provide current setup values such as level, attack cooldown, detection range, attack range override, temperament, combat style override, and target preference.

Prototype enemy archetypes and enemy types are not final bestiary content, final encounter design, faction design, AI behavior trees, production combat roles, or XP reward tables.
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

Gatherers search for valid resources, move to them, gather over time, then return to party behavior when the task is finished, invalid, unsafe, or no longer worth pursuing.

Resources may limit how many gatherers can gather them at once.

Current resource categories:

- Wood
- Ore
- Herb

Current gathered material routing:

- Wood grants Softwood at Tier 1 and Hardwood at Tier 2
- Ore grants Copper Ore at Tier 1 and Iron Ore at Tier 2
- Herb grants Field Herb at Tier 1 and Redleaf Herb at Tier 2

Legacy Wood, Ore, and Herb item definitions may still exist as prototype data, but current gathering routes resource type and tier into the tiered material items above.

Resources currently grant prototype item stacks into the shared party inventory.

Gathering should remain readable and lightweight during the prototype phase. Do not add full crafting chains, profession progression, complex tool durability, or production resource ecosystems unless explicitly requested.

---

## Prototype Inventory, Wallet, Drops, and Exchange

The party has a shared prototype inventory and wallet.

Inventory and wallet systems belong to the party, not individual companions.

Inventory is slot-based during the prototype phase.

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

Current prototype consumable behavior:

- consumables currently include flasks and food
- companions may equip one flask from shared inventory
- equipped flasks start with zero charges when equipped
- companions may assign one food item from shared inventory
- assigned food remains in inventory until a completed food use consumes one item
- manual party consumable use can start flask or food use for eligible living companions
- flasks have use duration, cooldown, charges, charge cost, healing, and optional temporary stat buffs
- food has use duration, level requirements, temporary stat buffs, and can only be consumed in the hub while the party is safe
- food use is canceled if the companion takes damage before completion
- auto-flask behavior can start flask use when a companion reaches the configured HP threshold
- equipped flasks can be refilled at the hub healing fountain
- equipped flasks gain one charge after 20 counted enemy defeats
- consumable buffs contribute to companion primary and derived stat calculations while active
- leaving the hub may show a short non-blocking food warning when assigned food is available but the companion has no active food buff

Current prototype consumable items:

- Minor Recovery Flask
- Soldier's Recovery Flask
- Hearty Trail Rations
- Skirmisher Rations

The prototype wallet is shared by the party.

Current wallet rules:

- currency does not use inventory slots
- current currency is Crowns
- wallet balance may be shown in inventory, merchant UI, and temporary feedback
- wallet changes are game-state data, not individual companion data

Enemy drops currently use lightweight prototype drop tables.

Current enemy drop behavior:

- defeated enemies may roll drops by enemy family and loot tier
- loot tier is currently derived from enemy level
- Tier 1 currently covers enemies below level 10
- Tier 2 currently covers enemies level 10 and above
- family/tier drops route prototype junk items into shared inventory
- Goblin Shaman may also roll a low-chance archetype-specific Holy Lantern equipment drop at Tier 2
- drop results use short-lived visual feedback before being routed into shared inventory
- drops do not create persistent ground loot
- inventory overflow may partially or fully reject dropped items

Current prototype drop chances:

- Slime Tier 1: Slime Gel 70%, Slime Core 12%
- Bat Tier 1: Bat Wing 65%, Bat Ear 10%
- Spider Tier 1: Spider Silk 65%, Spider Fang 10%
- Goblin Tier 1: Goblin Ear 60%, Goblin Tooth 9%
- Goblin Tier 2: Goblin Ear 60%, Goblin Tooth 9%
- Imp Tier 1: Imp Horn Chip 60%, Imp Tail 8%
- Wolf Tier 1: Wolf Pelt 60%, Wolf Fang 8%
- Crawler Tier 1: Crawler Pebble 55%, Crawler Plate 7%
- Mossling Tier 1: Moss Tuft 55%, Mossling Cap 7%
- Wisp Tier 2: Wisp Ash 55%, Wisp Ember 7%
- Orc Tier 2: Orc Hide 55%, Orc Tusk 7%
- Goblin Shaman Tier 2 archetype drop: Holy Lantern 2%

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

Current merchant behavior:

- the hub Merchant can exchange eligible junk items for Crowns
- eligible quick-exchange junk items are prototype junk items with sell value
- quick exchange removes eligible junk items from shared inventory
- quick exchange adds Crowns to the shared wallet
- the hub Merchant has a fixed prototype buy stock
- Merchant Buy can purchase selected equipment and consumables for Crowns
- Merchant Buy validates merchant identity, stock membership, price, wallet balance, and inventory capacity
- purchased items are added to shared party inventory
- Merchant Buy may filter stock by group and party equipment compatibility
- current Merchant Buy stock groups include flasks, food, weapons, offhands, cloth armor, leather armor, mail armor, plate armor, and accessories
- the Sell panel may be visible as a placeholder only
- full selling rules are not implemented
- this is prototype merchant behavior, not a full shop economy

This is not the full inventory, wallet, equipment economy, shop, crafting, trading, bank, loot, or persistence system.

Do not implement these unless explicitly requested:

- bank storage
- persistent ground loot
- full selling flows
- dynamic shop inventories or full shop economy beyond the fixed prototype Merchant buy stock
- advanced consumable systems beyond current prototype flasks, food assignment, auto-flask behavior, hub food behavior, and temporary buffs
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
- may provide simple prototype primary stat modifiers
- may provide simple prototype derived stat modifiers
- may have a tier
- may have a level requirement
- may be displayed in UI summaries
- do not imply a complete stat scaling system
- do not visually change character sprites
- do not add visible weapon swaps
- do not add paper-doll rendering, weapon anchoring, or sprite attachments

Current prototype derived stat modifiers may include:

- attack
- defense
- max health
- block
- evasion
- magic power
- healing power
- magic defense
- accuracy
- critical chance
- critical damage
- health regeneration

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

Current prototype weapon and offhand item examples include:

- Training Sword
- Iron Sword
- Guard Mace
- Claw Gauntlets
- Thorn Whip
- Short Bow
- Apprentice Orb
- Rune Lantern
- Holy Mace
- Wooden Shield
- Simple Talisman
- Holy Lantern
- Sacrificial Dagger

Bow and Claw Gauntlets may occupy both hands as lightweight prototype exceptions.

Armor and accessories are currently shared prototype equipment categories and are not class-restricted unless explicitly defined later.

Current armor families:

- Cloth
- Leather
- Mail
- Plate

Current prototype armor identity:

- Cloth armor may support healing, magic power, magic defense, wisdom, intelligence, constitution, or evasion.
- Leather armor may support evasion, dexterity, accuracy, attack, critical chance, or light defense.
- Mail armor may support balanced defense, constitution, strength, max health, block, attack, accuracy, and small evasion penalties.
- Plate armor may support heavy defense, block, max health, strength, attack, accuracy, and larger evasion penalties.

Current armor level requirement intent:

- Cloth and Leather Tier 1 armor may be available from level 1.
- Mail Tier 1 armor may require level 5.
- Plate Tier 1 armor may require level 10.

Current prototype armor sets may include:

- Acolyte cloth armor
- Scholar cloth armor
- Scout leather armor
- Stalker leather armor
- Guard mail armor
- Vanguard mail armor
- Bulwark plate armor
- Warplate armor

Current prototype accessory examples include:

- Plain Charm

Current prototype quest equipment rewards may include:

- Acolyte Hood
- Scout Boots
- Bulwark Cuirass

Current archetype-specific prototype equipment drops may include:

- Holy Lantern from Goblin Shaman

This is a prototype equipment foundation, not a full equipment economy.

Do not implement generalized dual wield, arbitrary two-handed combinations, subclass equipment expansion, equipment visuals, gear recycling, rarity, affixes, upgrades, durability, sockets, set bonuses, item comparison, or a full equipment economy unless explicitly requested.



## Direct Orders

The player can give direct orders to specific party members.

Current direct order types:

- attack
- gather
- move

Direct orders:

- override autonomous role behavior for the targeted party member
- affect only the targeted party member
- do not automatically change other party members
- replace any previous direct order on that same party member
- clear resurrection participation for that party member
- validate source, target, path distance, blocked positions, resource capacity, and ability to act
- remain active until replaced, completed, canceled, or invalidated
- start a short rejoin grace period after normal completion or cancellation

Direct gather orders respect resource `maxGatherers`.

A direct-commanded companion may temporarily attack a personal threat or movement blocker while keeping direct-command priority.

Example:

If the party is attacking but the player orders one party member to gather, that party member gathers while the rest continue fighting.

Future input may include click-and-drag commands from a unit to a target.

---

## Party Management

Initial prototype party:

- 1 current leader
- 2 starting party members
- current starting leader is a Defender
- current second starting member is a Fighter
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
- current map and quest context

---

## Main Menu and Party UI

The main gameplay UI may include a simple menu system for inspecting and managing the party and prototype world navigation.

Current intended main menu entries:

- Party
- Party Management
- Inventory
- Quests
- World Travel

The player is the party manager, not a physical character.

Menus should support party oversight, planning, travel decisions, and decision-making without implying the player is a world entity.

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

Stat allocation controls may appear in the Party Stats UI only when backed by game-logic commands.

If allocation is not supported for the current state, controls must be disabled or read-only.

Equipment may show companion equipment slots and valid equipment choices from the shared party inventory.

Equipment rules must remain in game logic.

Current Equipment section may also show prototype consumable controls:

- equipped flask
- available flask choices from shared inventory
- assigned food
- available food choices from shared inventory
- active food buff timing
- basic consumable effect and requirement text

Skills may show the selected companion's current class skills.

Current class tabs may show only the companion's current class until class-history or multi-class progression data exists.

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

Leadership switching changes the current leader identity only.

Leadership switching does not change role, class, party order, equipment, or party behavior rules.

Role Select must use the existing party role values:

- Defender
- Fighter
- Support
- Gatherer
- None / Unassigned

Role changes affect role priority behavior.

Leader identity remains separate from role.

Party Order may support ordering companions for party behavior and display.

Formation may appear as a UI placeholder only.

The current simulation has lightweight automatic party formation behavior, but there is no player-facing formation editor yet.

Behavior Settings currently supports prototype auto-flask controls:

- Auto-use Flask toggle
- Flask HP Threshold setting from 1 percent to 100 percent

Behavior Settings should not define new autonomous behavior outside supported game-logic settings.

Party Management should not own companion-specific Stats, Equipment, Skills, or Skill Preferences unless explicitly redesigned later.

### Inventory Menu

The Inventory menu displays the shared prototype party inventory.

It may show:

- inventory slots
- item stacks
- item categories already supported by the current prototype inventory
- basic item details on hover or selection
- equipment item details such as slot, type, level requirement, and simple stat modifiers
- shared wallet balance

The Inventory menu must not implement the full inventory, equipment economy, full wallet UI, shop, crafting, trading, bank, loot, or persistence systems unless explicitly requested.

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

The World Travel menu is a prototype navigation menu for choosing known prototype map destinations in the current prototype region.

It may show:

- current prototype map
- available connected prototype destinations
- destination display names
- whether a destination can currently be selected
- simple unavailable-state messaging when travel is blocked

World Travel selection may request travel to a known prototype map destination.

The POI system should route the party toward the next valid teleport step along the current prototype route.

World Travel must use existing prototype teleport route data and current map state.

World Travel must not create final zone routing, persistent zone state, fast travel rules, map discovery rules, production travel costs, or a full world map unless explicitly requested.

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
- inspect POI
- guide NPC to POI
- rescue NPC
- repair POI
- defend area
- defeat enemy count
- defeat elite
- collect enemy quest drop count
- gather item count
- equip item
- equip flask
- buy merchant equipment
- unlock route
- return to POI

Current prototype quest content currently uses:

- reach POI
- inspect POI
- guide NPC to POI
- rescue NPC
- repair POI
- defend area
- defeat enemy count
- defeat elite
- collect enemy quest drop count
- gather item count
- equip item
- equip flask
- buy merchant equipment
- unlock route

Talk-to-POI and return-to-POI objective types are lightweight type support and should not be treated as implemented quest content unless a quest definition uses them.

Current prototype quests:

- Secure the Landing
  - Quest id: clear_the_shore
  - Objectives: defeat 10 Slimes in Shore Fringe, gather 3 Wood in Shore Fringe, and inspect the Shore Fringe supply marker
  - Rewards: 50 Crowns, 8 character XP, 2 Tier 1 Wolf Pelt, 1 Minor Recovery Flask, 1 Acolyte Hood
  - Unlocks: Outfit the Expedition

- Outfit the Expedition
  - Quest id: outfit_the_expedition
  - Objectives: equip a Training Sword, equip an Acolyte Hood, equip a Minor Recovery Flask, and buy 1 merchant equipment item
  - Rewards: 10 Crowns, 4 character XP
  - Unlocks: Stolen Field Supplies

- Stolen Field Supplies
  - Quest id: stolen_field_supplies
  - Objectives: collect 10 Stolen Supply Bundle quest drops from Cave Bat-family enemies in Mossy Glade
  - Rewards: 35 Crowns, 12 character XP, 1 Hearty Trail Rations
  - Unlocks: Break the Lower Shore Blockage

- Break the Lower Shore Blockage
  - Quest id: break_lower_shore_blockage
  - Objectives: inspect the Lower Shore webbed wreckage, defeat 20 Forest Spiders in Lower Shore, escort the Route Worker to the blockage, repair the blockage, and unlock the map-2 route
  - Rewards: 60 Crowns, 18 character XP, 1 Scout Boots
  - Unlocks: Scout Rise Samples

- Scout Rise Samples
  - Quest id: scout_rise_samples
  - Objectives: collect 12 Scout Report Sample quest drops in Scout Rise
  - Rewards: 45 Crowns, 18 character XP, 1 Minor Recovery Flask
  - Unlocks: Rescue the Grove Runner

- Rescue the Grove Runner
  - Quest id: rescue_the_grove_runner
  - Objectives: reach the Grove Runner, rescue the Grove Runner, and repair the Old Grove field cache
  - Rewards: 55 Crowns, 22 character XP, 1 Skirmisher Rations
  - Unlocks: Hold the Field Cache

- Hold the Field Cache
  - Quest id: hold_the_field_cache
  - Objectives: defend the Old Grove field cache while quest-spawned enemies attack
  - Rewards: 75 Crowns, 28 character XP, 1 Soldier's Recovery Flask
  - Unlocks: Open the Wolf Causeway

- Open the Wolf Causeway
  - Quest id: open_wolf_causeway
  - Objectives: escort the Causeway Worker, defend the Wolf Causeway blockage, defeat the causeway elite, and unlock the map-3 route
  - Rewards: 100 Crowns, 40 character XP, 1 Bulwark Cuirass, 1 Plain Charm
  - Unlocks: Slimeward Trail

- Slimeward Trail
  - Quest id: find_slimeward_camp
  - Objectives: unlock the Slimeward Camp route from Third Wild Zone
  - Rewards: 25 Crowns, 10 character XP

The Quest Giver in Harbor Union Bastion can accept available quests and turn in ready quests when the leader reaches interaction range.

Current prototype quest guide behavior:

- temporary quest guide NPCs may be spawned for active guide or rescue objectives
- quest guide id, display name, start position, and target position come from the active quest objective
- quest guide NPCs appear only on the target map while their objective is active and incomplete
- guide NPCs for escort objectives wait until the leader reaches contact range
- escort guide NPCs move toward their objective target after contact
- escort guide NPCs move at a slower prototype escort speed
- escort guide NPCs pause if no companion is within escort range
- escort guide NPCs pause if living enemies are nearby
- rescue objectives complete when the leader reaches the NPC and nearby enemies are cleared
- repair objectives can be progressed by a nearby party member or quest guide NPC
- repair progress pauses if the repair actor is targeted by an enemy
- defend objectives can spawn quest enemies during repair progress
- defeat elite objectives can spawn an aggressive quest enemy
- unlock route objectives complete the associated route step

Quest guide, rescue, repair, defend, route unlock, and elite behaviors are prototype quest-objective helpers.

They are not full follower, recruitment, dialogue, companion, town NPC, production escort, event scripting, or final quest framework systems.
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
2. active quest objective on the current map
3. ready quest turn-in target
4. available quest acceptance target on the current map
5. quest-required prototype teleport when the active objective is on another reachable prototype map
6. hub Merchant quick exchange when eligible junk is available
7. reachable wild combat target when combat fallback is relevant
8. reachable wild resource target when gathering fallback is relevant
9. reachable exploration or inspect target for quest objectives
10. safe idle hub point

When the party is in the hub, eligible merchant quick exchange may be considered before quest and idle targets.

POI selection should avoid selecting invalid, unreachable, depleted, dead, completed, locked, already satisfied, or gatherer-reserved resource targets.

POI selection may use path distance, priority, target scoring, progressive fallback, local target preference, and short commitment windows to avoid unstable target switching.

When Stay in Subzone is enabled, POI selection should prefer targets inside the leader's current subzone while still allowing valid teleport POIs and local quest interactions.

POI direction may route the leader toward:

- quest givers
- combat targets
- resources
- exploration points
- inspect points
- escort points
- idle hub positions
- prototype teleports
- World Travel route steps

If combat interrupts an active POI target, the prototype may preserve the interrupted POI and restore it after combat ends when the target is still valid and no direct party command blocks it.

This is a prototype guidance layer for current debug maps.

This is not a full quest system, dialogue system, final POI framework, final zone-routing system, or production content pipeline.

---

## Leveling

Party members gain XP and levels.

Leveling supports long-term progression, party growth, class development, and the feeling of a growing expedition.

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
- Superior enemies currently apply a prototype XP multiplier
- monster-specific XP deltas and named Elite reward modifiers are future-facing tuning work
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

Derived combat stats are calculated from primary stats and equipment modifiers.

Derived combat stats are the current prototype path for making class growth, allocation, consumable buffs, and equipment matter in combat.

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

Classes define what a party member can do: available tools, stats, skills, and equipment permissions.

Roles define how a party member behaves and prioritizes those tools.

Classes do not override role behavior.

Roles do not restrict class capabilities.

Skill usage is determined by:

- role priorities
- skill tags
- current context such as combat, danger, gathering, or party safety
- target validity
- range
- cooldown availability

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity.

Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

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

Weapons are gameplay-facing stat/data modifiers, not sprite identity.

Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

Base class selection from Beginner may exist during prototype progression.

Subclass progression is future-facing and should not be implemented until explicitly requested.

Classes define available skills, tools, equipment permissions, and stat direction.

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
- ally buffs
- shields
- binds
- healing
- self-cost healing
- mobility
- lunge movement and damage
- gathering support
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

Kick is a simple opening lunge and melee fallback attack.

Guard Up is a simple defensive survival skill.

First Aid is a small emergency recovery skill.

Deep Breath is a simple self-buff.

Rally Call is a simple ally buff.

Field Hands is a simple gathering support skill.

Quick Step is a simple mobility and escape skill.

Beginner skills should not compete with base class identity.

Beginner skills exist to make early party members feel functional before level 10.

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

The final world is divided into large zones or fields.

Zones are connected via teleport points at edges or key locations.

Each zone is a contained exploration area.

The game should feel continuous, not level-based.

Current map transitions may exist as prototype/debug behavior, but the final zone and teleport system should not be expanded unless explicitly requested.

Future entities will eventually include a zoneId in addition to position.

---

## World & Setting

The game begins on a newly discovered continent.

The player arrives by boat.

A central port town acts as the main hub.

The current prototype hub is Harbor Union Bastion, a small safe port/peninsula settlement with placeholder town entities and decorative non-simulation structure visuals.

Current prototype hub:

- Harbor Union Bastion is the first prototype hub map.
- It is a safe port/peninsula settlement.
- It currently includes a minimal beach/dock entry area, small city square, placeholder NPCs, a healing fountain, decorative house/cabin/tent/dock-shore structure visuals, and a clear exit to the first wild zone.
- Current placeholders may include Quest Giver, Merchant, Smith, Dog, Test Blade, a hub target dummy, and a hub AoE target dummy.
- The Quest Giver supports the lightweight prototype quest chain only.
- The Merchant supports prototype quick exchange of eligible junk items for Crowns and a fixed prototype buy stock for selected equipment and consumables.
- Hub target dummies are passive 100 HP debug enemies with no XP reward.
- The standard hub target dummy can be manually attacked for combat testing, is not selected by autonomous POI behavior, and regenerates health over time.
- The hub AoE target dummy is a debug combat-test enemy for prototype enemy AoE channel and telegraph behavior.
- The healing fountain restores party member health and refills equipped flask charges when party members are in range.
- The prototype hub should not spawn hostile enemies for now.
- The prototype hub must not implement full town systems, interiors, branching dialogue, full shops beyond the fixed prototype Merchant buy stock, crafting, recruitment, smithing, or NPC relationship systems unless explicitly requested.

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

Final world structure should use large zones or fields connected by teleport points.

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
- `hub` -> `slimeward-camp`
- `map-3` <-> `slimeward-camp`
- `slimeward-camp` <-> `slimeward-floor-1`
- `slimeward-floor-1` <-> `slimeward-floor-2`
- `slimeward-floor-2` -> `slimeward-camp`

Some prototype forward teleports can start non-working and become working through quest route-unlock objectives or dungeon runtime events.

Current non-working starter routes:

- `map-1` -> `map-2`
- `map-2` -> `map-3`
- `slimeward-camp` broken exit placeholder
- `slimeward-floor-2` -> `slimeward-camp` until the Slimeward boss chest has collected loot

World Travel and AI route selection should use only working teleports.

Current readable prototype/debug map names:

- `hub`: Harbor Union Bastion
- `map-1`: First Wild Zone
- `map-2`: Second Wild Zone
- `map-3`: Third Wild Zone
- `map-4`: Fourth Wild Zone
- `slimeward-camp`: Slimeward Camp
- `slimeward-floor-1`: Slimeward Floor 1
- `slimeward-floor-2`: Slimeward Floor 2

Current prototype wilderness subzones are:

- First Wild Zone: Shore Fringe, Mossy Glade, Lower Shore
- Second Wild Zone: Scout Rise, Old Grove, Wolf Causeway
- Third Wild Zone: Broken Thicket, Crawler Shelf, Imp Fen
- Fourth Wild Zone: Shaman Watch, Ash Hollow, Orc Approach

Current Slimeward dungeon prototype rooms/subzones are:

- Slimeward Floor 1: Slimeward Entry, Gelstone Bend, Dripping Pocket, Slimecut Hall, Azure Threshold
- Slimeward Floor 2: Lower Landing, Azure Runoff, Heavy Pool, Mass Approach, Azure Mass Chamber

Current prototype subzones may define level ranges, enemy archetype lists, encounter areas, encounter leash radii, resource locations, passages, and UI-facing name labels.

Subzones, encounter areas, dungeon rooms, and dungeon waypoints are current prototype map-organization data.

Subzones, encounter areas, dungeon rooms, and dungeon waypoints must not be treated as the final zone system, final region content model, final encounter design pipeline, dungeon framework, or persistent world-state structure.

Current Slimeward dungeon prototype behavior:

- Slimeward Camp is a prototype staging map connected to the wider debug-map route network.
- Slimeward Floor 1 and Slimeward Floor 2 are prototype dungeon floor maps.
- Dungeon POI selection guides the party through ordered enemy packs, floor exits, the boss chest, and the final exit.
- Slimeward floor enemies do not respawn.
- The Azure Mass is the current prototype Slimeward boss.
- After The Azure Mass is defeated, a dungeon chest becomes available on Slimeward Floor 2.
- The boss chest grants prototype loot to the shared inventory.
- If inventory space is available, the boss chest enables the Slimeward Floor 2 exit.
- If inventory is full, Auto Mode stops, chest loot remains pending, and the exit stays closed until loot can be collected.
- While the dungeon chest UI is open, simulation updates pause for the chest interaction.
- Auto Mode may continue after a short chest countdown when loot was collected successfully.
- The debug Slimeward dungeon reset returns an in-dungeon party to Slimeward Camp and clears Slimeward dungeon runtime.

Prototype teleport and Slimeward dungeon behavior should not define the final world structure.

The World Travel menu may expose known prototype/debug map destinations and guide the party toward the next teleport point needed to reach the selected map.

World Travel is menu-driven travel intent for existing prototype routes.

World Travel is not instant fast travel unless explicitly implemented that way later.

Do not build the final zone system, persistent zone state, full production teleport network, travel costs, map discovery, production dungeon framework, or a full world map unless explicitly requested.

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

Current world rendering uses a PixiJS renderer for the main map view.

Current visuals may use prototype sprites, generated terrain tiles, generated icons, class portraits, feedback VFX sprites, decorative map visual objects, and placeholders.

Visual priorities:

- party members should be easy to identify
- enemies should be easy to distinguish from party members
- NPCs should be easy to identify in prototype hub and quest spaces
- resources should be visible and readable
- movement direction should be understandable
- terrain, walls, obstacles, labels, teleports, and feedback should remain readable at the current prototype render scale
- feedback should make combat, gathering, drops, quest guidance, escort behavior, resurrection, recovery, and skills readable

Enemy, NPC, and subzone name labels may be used as UI-facing readability aids.

Name labels must not define simulation behavior, targeting rules, NPC behavior, dialogue, or final content pipeline rules.

Current prototype map visuals may use 32px construction-cell anchoring for walls, obstacles, entities, overlays, labels, effects, camera math, and input targeting while rendering larger floor chunks as background terrain.

Current generated terrain and map visual asset direction may include 32x32 bush or obstacle assets, 64x64 tree assets, 128x128 floor chunks, hub floor assets, wilderness floor assets, hub castle wall assets, decorative hub structure assets, and generated skill or feedback sprites.

Terrain asset size and render scale are UI-facing presentation choices.

Terrain asset size and render scale must not define simulation coordinates, movement, collision, map geometry, entity placement, gameplay range, final art direction, or a production asset pipeline.

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
- improving party equipment and consumable readiness
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
- inspect movement/pathing issues, movement planning, path backoff, and navigation grid behavior
- inspect direct companion command issue, rejection, replacement, completion, cancellation, and rejoin grace behavior
- debug map transitions
- export debug telemetry
- inspect quest state and POI decisions
- inspect wallet, drops, merchant exchange, and Merchant Buy telemetry
- inspect inventory capacity, item grants, item removal, and reward validation
- inspect equipment equip, unequip, validation, and stat contribution behavior
- inspect consumable assignment, flask use, food use, auto-flask behavior, food warnings, and flask recharge behavior
- inspect healing fountain health restoration and flask refill behavior
- inspect enemy archetype, combat style, target preference, attack range, and target decision behavior
- inspect enemy scaling, respawn, subzone, and encounter area behavior
- inspect party intent, party activity coordination, self-defense recovery, resurrection, and world-wipe recovery behavior
- inspect interrupted POI restore behavior
- inspect quest guide escort behavior
- inspect PixiJS world rendering behavior
- add prototype consumables to shared inventory

Debug tools are not part of final gameplay.

Debug tools should stay isolated from final design expectations and should not define production behavior.

---

## Future Systems

Do not implement these unless explicitly requested:

- final zone system
- full teleport network
- subclass progression
- full equipment economy beyond the current prototype equipment foundation
- equipment visuals, weapon anchoring, paper-doll rendering, paper-doll equipment, or visible weapon swaps
- full inventory/equipment economy beyond the current prototype shared party inventory
- advanced ability framework
- mana or complex resource costs
- casting system
- advanced targeting system
- advanced support mechanics
- advanced aggro/threat mechanics
- full ranged combat beyond current prototype skill and enemy attack ranges
- backend persistence
- networking/server authority
- production asset pipeline
- final world content pipeline
- full quest journal, branching dialogue, production quest content, or full quest reward economy beyond prototype quest rewards
- full shop, selling, buying, and merchant economy beyond prototype quick exchange and fixed prototype Merchant Buy stock
- persistent ground loot beyond prototype drop-to-inventory behavior
- final death penalty, checkpoint, resurrection economy, or recovery system beyond prototype resurrection and world-wipe recovery
- production enemy respawn, encounter reset, or spawn scheduling beyond current prototype wild-map respawn behavior
- production POI framework beyond current debug-map guidance
- production escort, follower, recruitment, or companion NPC systems beyond the current quest guide prototype
- full town systems, interiors, crafting, smithing, recruitment, or NPC relationship systems

---

## Conflict Resolution

If prompt instructions conflict with this document or `GTD.md`:

1. Stop
2. Explain the conflict clearly
3. Ask for confirmation before proceeding

Do not guess or silently override documented behavior.
