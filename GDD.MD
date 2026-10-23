# GDD.md

## Game Concept

A party-based idle exploration RPG where the player manages a small expedition through a dangerous newly discovered land.

The player is the party manager, not a physical character in the world. Party members are the physical actors who move, fight, gather, recover, and progress.

The game is primarily idle/AFK with optional active intervention. The player guides party intent, assigns roles, chooses class direction, reacts to danger, and may directly command party members when needed.

Issue #693 records the approved movement and formation design for the implementation leaves under Issue #689. Sections marked as approved movement design describe that contract; they do not mean the runtime redesign is already implemented. Existing skill, encounter, quest, and travel rules remain in force unless a movement section explicitly revises them.

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
- shared inventory, bank, key item, and wallet systems during the prototype phase

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

If a party member is attacked, autonomous party behavior may temporarily prioritize that attacker through the combat commitment rules. An active player movement or focus order remains authoritative.

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

### Role Bonuses

Current prototype role bonuses give companions a small value bonus after they settle into a real role.

Role bonuses:

- apply only to Defender, Fighter, Support, and Gatherer
- do not apply to None / Unassigned
- are separate from role behavior priority
- start as pending after a role change
- become active after a short assignment delay
- may use simple level-banded values
- may affect derived combat stats or gathering speed
- should stay lightweight prototype tuning, not final specialization, talents, mastery, or role progression

Current prototype role bonus identities:

- Defender improves defense and block
- Fighter improves attack and magic power
- Support improves healing power
- Gatherer improves effective gather speed

Role bonus assignment should not change leader identity, class, equipment, party order, or autonomous behavior rules.

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

For the approved movement design, an individual direct companion command takes precedence over party-wide execution for that companion. Explicit player party movement and focus take precedence over autonomous targeting, role movement, following, and formation correction. Physical constraints, inability to act, and forced displacement can suspend execution without replacing valid player intent. The existing direct-gather personal self-defense exception retains the gather command for later resumption; a transient movement blocker alone does not trigger it.

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

Party movement uses continuous world positions and the current leader as its world-space reference.

The following is the approved movement design for Issue #689. Its foundation, command, and formation leaves implement it incrementally.

The leader moves toward the current intent:

- enemy target
- resource target
- exploration point
- quest point
- direct move target
- prototype map transition point
- prototype World Travel route step

Other party members use soft formation positions unless their role, current task, resurrection participation, or direct command gives them another task. Navigation may use internal cells or nodes, but gameplay positions, ranges, collision clearance, and formation offsets are continuous and are not snapped to a gameplay grid.

Movement authority:

- combat and role behavior choose intent and request movement; they do not compete by independently changing final positions
- ordinary walking, following, gathering approach, combat approach, and travel resolve through one normal locomotion request and commit path
- each entity has one movement owner and at most one committed movement result per simulation update
- companion mobility skills, enemy dashes or charges, and forced displacement use exclusive specialized movement transactions with their existing timing, collision sweeps, action restrictions, and effects
- normal locomotion, avoidance, and formation correction yield while specialized movement owns that entity
- valid player intent remains stored during temporary displacement and resumes when control returns
- completion, interruption, the moved entity's defeat/removal, map transition, restoration, and encounter reset release stale movement ownership through each transaction's existing rules; launched forced movement may still outlive its source

Selectable formations:

- Arrow 1-2-2, Balanced 2-1-2, and Side-by-side are the initial presets, supporting parties of one to five members
- slots use local forward and side offsets with soft role preferences, party order, and deterministic ties
- prior slot ownership is retained where possible to avoid unnecessary crossing or reassignment
- the leader receives a role-appropriate slot like any other companion; leadership does not grant a protected, central, or rear position
- all slot positions are derived relative to the leader's assigned local slot and the formation's facing
- slots suggest acceptable areas rather than exact points; obstacles, valid engagement positions, and higher-priority actions can require substitutes
- one selected preset adapts between travel and combat using smoothed facing and spacing
- travel uses projected leader movement so front slots can remain ahead even when the leader is in a rear slot
- constrained passages reduce lateral spacing first, then use stable legal substitutes or temporary trailing rather than collapsing every slot onto one point
- combat expands spacing toward committed threats; melee engagement, Defender interception, Support positioning, skills, and recovery may leave their slots
- direct commands, gathering, mobility skills, forced displacement, and other temporary departures reserve the companion's slot
- death leaves a hole during combat; permanent roster changes and post-combat reflow may update assignments
- companions gradually recover their prior slots and travel shape when the interruption ends

Party members should:

- stay near the leader during travel
- catch up if they fall behind
- avoid stacking on top of each other
- avoid blocked positions
- move in readable, small steps
- regroup after combat, gathering, resurrection, or travel transitions

Gatherers are allowed to temporarily leave the group while gathering.

Direct-commanded party members are not forced back into group movement by autonomous behavior.

Combat approach and collision clearance use shared body-aware continuous geometry, including variable enemy sizes and targetable structures. A legal engagement position must also be a legal standing position. Structure attackable bounds and their smaller ground collision footprints remain distinct, and renderer size never defines either rule.

Bounded, damped local avoidance considers nearby bodies inside movement resolution. It preserves same-party leader stability, large-enemy and NPC stability, walls, resources, movement bounds, and reservations. It does not repeatedly push entities after their normal movement commit. Exceptional overlap recovery handles invalid starting positions from spawn, load, teleport, or safe structure rebuilding. Rebuild clearance remains an atomic correction that preserves actor actions and player orders and defers if specialized movement or unsafe occupancy prevents it.

Formation slots and avoidance respect quest barriers, live structure footprints and rebuild reservations, and current zone/encounter bounds. Formation positioning does not introduce automatic telegraph dodging, skill bonuses, manual slot editing, advanced aggro, or a final physics/navigation system.

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

Under the approved movement design, cohesion coordinates soft formation travel with coarse slow/wait thresholds and bounded follower catch-up. Temporary slot departures do not force slot reassignment or an indefinite leader wait; slot recovery and passage re-expansion are gradual.

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

Current combat includes melee basic attacks and a lightweight prototype projectile layer shared by supported basic attacks and focused enemy abilities.

Prototype combat supports numeric skill ranges, enemy attack ranges, enemy attack windup timing, and basic projectile travel. Hunter basic attacks may use arrow projectiles. Ranged enemy combat styles may use simple projectile visuals such as thrown weapons, slime shots, wisps, or imp magic.

Projectile travel, enemy attack windup, and focused enemy cast telegraphs are prototype readability layers. They should not be treated as the final ranged combat system, ammunition system, projectile physics model, advanced targeting framework, or production combat telegraph system.

Companion combat may use derived combat stats for prototype attack power, defense, max health, evasion, block, magic power, healing power, magic defense, accuracy, critical hits, healing, shields, barriers, absorbs, mitigation, and passive health regeneration.

Current skill runtime may apply temporary combat state such as shields, barriers, absorbs, damage mitigation, mana shields, frost armor, Overcharge, party class buffs, gather buffs, healing over time, lifesteal, Runic Focus, forced evasion, fake death, next-attack damage bonuses, defense buffs, poison, burning, bleed, immobilize, disarm, silence, taunt, and temporary aggro drops.

Poison, burning, and bleed may deal periodic damage while active.

Temporary status effects may block movement, attacks, skill use, or gathering only where current prototype rules explicitly support that effect.

Derived stat and temporary skill runtime integration should remain simple and readable. It should not become a final balance model, advanced threat model, production status-effect framework, or production combat formula system unless explicitly requested.

Combat positioning should support future ranged classes without treating current prototype ranged enemy behavior as the final ranged combat system.

Current prototype enemies may be passive or aggressive by archetype or setup.

Aggressive enemies may be introduced by enemy archetype, enemy type, zone, event, or explicit debug scenario.

Approved movement design: combat chooses and retains a target; movement resolves how to reach a valid engagement area. A nearby movement blocker first supplies avoidance/pathing information. It cannot immediately replace a valid commitment.

Combat target commitment:

- explicit party focus and individual direct attack commands retain their selected living enemy or targetable hostile structure until completed, invalid, replaced, or canceled
- autonomous commitments survive minor distance changes, temporary obstruction, avoidance, formation correction, and enemies dashing across lanes
- documented reasons to switch an automatic target include death, target invalidation, sustained obstruction or lost reachability, leash failure, and a meaningful emergency threat
- a personal attacker or an enemy threatening a vulnerable companion may trigger an autonomous defensive response, subject to player-command authority
- new automatic targets use soft left/center/right formation-lane preference, reachability, active threat, and a soft penalty for existing claims, with deterministic ties
- cross-lane fallback is allowed, and single-target encounters or explicit player focus allow shared focus fire
- lane preference governs base engagement targets; existing skill-specific and area-target preferences keep their own ownership and manual-target constraints
- hostile structures remain manually targetable and are not discovered as autonomous combat or skill targets
- scripted autonomous suppression releases affected automatic commitments only; the existing Azure Mass direct-command exception remains valid
- destruction, removal, or an encounter state that truly makes a target unavailable invalidates the relevant commitment, including the Warmaster departure lifecycle
- target changes record a deterministic reason rather than relying on one-frame movement failure

Combat positioning expands around a smoothed committed threat direction, using slots as staging and recovery areas. Valid role actions and engagement range can take companions out of those areas without formation correction fighting them. When combat ends, companions gradually recover travel positioning and any still-valid interrupted autonomous task.

An ordinary player map-move order keeps the party moving even when an enemy attacks. Automatic pursuit or protection cannot silently replace that destination. Once the move completes, eligible automatic combat behavior can respond to the remaining threat. World Travel Auto Route has its own documented emergency pause/resume contract below.

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

- does not trigger in Harbor Union Bastion or Forward Bastion
- rescues normal wild-map wipes to the closest unlocked rescue hub by route distance
- rescues Slimeward dungeon floor wipes directly to Slimeward Camp
- may present a pending rescue choice if multiple unlocked rescue hubs are equally valid
- restores companions to the selected rescue hub arrival positions
- restores companion health
- clears active combat, movement, teleport, POI, drop, resurrection, formation, and map-local runtime state
- clears temporary skill runtime state, skill cooldowns, global cooldowns, status effects, skill visual events, companion AoE channels, enemy AoE channels, enemy AoE cooldowns, and reusable enemy ability runtime
- clears Slimeward dungeon runtime when rescue returns the party to Slimeward Camp
- may charge Crowns based on route distance, limited by the current wallet balance
- records map reach for quest state after rescue
- may show short-lived rescue feedback

This is a prototype safety system, not the final death penalty, revive economy, checkpoint system, or town recovery design.

Map transitions and rescue transitions should clear or prune map-local temporary runtime state.

Current map-local cleanup may include movement caches, attack slot caches, follow trails, combat feedback, projectiles, skill runtime state, status effects, skill cooldowns, companion AoE channels, enemy AoE channels, enemy AoE cooldowns, reusable enemy ability casts, reusable enemy ability cooldowns, required-basic-attack gates, resurrection runtime, health timing, and target dummy timing.

This cleanup is prototype runtime hygiene, not a final persistence, checkpoint, combat-instance, or encounter-reset system.

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
- A directly defeated Superior enemy grants 2 kill credits to matching NPC defeat-count objectives and taken Guild Notice Board kill objectives. Quest-item drops still roll once per defeated enemy, and aggregate Guild Field Team kill reports remain 1 credit per reported kill.

Superior enemies are prototype rare-variant behavior, not final elite design, named boss design, affix design, or production rare-monster tuning.

Encounter bands describe an individual authored enemy spawn, independently of its enemy type and Superior variant:

- Standard is the default band for ordinary spawns. A Standard enemy may still spawn as a Superior.
- Elite is a deliberately designed, stronger area monster based on the area's average enemy strength, rather than an ordinary enemy made stronger by the Superior roll.
- Champion is reserved for future handcrafted special-arena enemies and is not the final challenge of a tier.
- Boss is the end-of-tier challenge, generally placed around a tier boundary such as levels 9–10, 19–20, or 29–30.
- Hover inspection shows the rank for Elite, Champion, and Boss enemies; Standard rank is omitted, and rank does not appear in world nameplates.

The Azure Mass and the single Orc Warmaster in Orc Warcamp are Bosses. The Orc Warmaster is authored once in the Warmaster encounter area. Encounter-band labels currently classify spawns only; they do not independently change stats, AI, drops, XP, or Superior behavior.

Current prototype enemy scaling:

- supports starter and early scaling bands
- clamps effective scaling levels to the current prototype range
- derives simple combat stats such as max health, attack, defense, magic defense, evasion, and threat
- remains lightweight prototype tuning, not final encounter balance

Current prototype enemy respawn behavior:

- defeated enemies may respawn on wild maps after a short delay
- enemies respawn at their home position
- respawn restores health and clears temporary target, roam, mark, bind, and reusable enemy ability runtime state
- respawn may reroll eligible Superior enemy variant state
- normal enemy respawn pauses while a matching subzone is suppressed by an active defend-area quest objective or its short post-completion restore delay
- enemy respawn does not run in the hub

Current reusable enemy ability execution behavior:

- enemy types may reference reusable enemy ability definitions through an ordered ability-id list
- the ordered list is deterministic priority: an enemy tries the first valid ready ability when its next normal attack action is available
- starting an ability locks the caster position, target id, target position, and targeting direction for that cast
- ability cooldown starts when casting begins and continues to elapse during crowd control
- enemies cannot chase or perform basic attacks while casting
- a started ability requires the enemy to commit at least one basic attack before another ability can begin, including when the cast is interrupted
- death, removal, invalid or fake-death targets, taunt, incapacitation, silence, and bind may interrupt an active cast without refunding its cooldown
- immobilization alone does not interrupt an active cast, and disarm blocks basic attacks rather than reusable ability use
- active casts are canceled during restoration; valid unexpired reusable enemy ability cooldowns and required-basic-attack gates are preserved
- Ember Imp currently references the reusable `fire_bolt` ability
- Fire Bolt has a 5-unit range, a 0.9-second cast, a 0.3-second release windup, and a 6-second cooldown that starts when casting begins
- Fire Bolt launches from the locked cast origin, tracks its still-valid target at 8 world units per second, and resolves once at a 0.35-unit impact radius
- Fire Bolt deals 1.5 times enemy attack as direct magic damage through normal evasion, magic-defense, and active-shield rules; it does not apply Burn, splash damage, or ground fire
- the renderer presents Fire Bolt with an orange cast label, progress bar, pulsing caster glow, and a larger reuse of the current Imp fireball visual

This is a focused enemy-only execution runtime. It reuses existing combat effect systems and does not replace enemy AI, basic attacks, the existing enemy AoE channel system, companion skills, or the future full ability and casting framework.

Current prototype enemy AoE behavior:

- the hub includes a debug AoE target dummy
- engaged Heavy Slimes may use the same current prototype stomp channel
- eligible stomp casters start the stomp only when the player, party intent, direct command, or party combat state engages them
- the stomp locks a circular area, channels briefly, enters a short windup, then deals small physical damage to living companions still inside the circle at impact
- fake death can cause enemy AoE impact to skip the affected companion where current prototype rules support it
- shield blocks and passive block can prevent the damage
- binding the caster, killing the caster, or blocking line of sight to the locked area interrupts the channel and starts cooldown
- the renderer shows the danger circle and channel bar

Prototype enemy AoE behavior is debug combat-test and early enemy-skill behavior, not a final enemy ability framework, boss mechanic system, or production telegraph design.

Current prototype companion AoE channel behavior:

- Shield Shockwave and Maul Sweep retain their 0.2-second channels; other currently immediate companion area skills remain immediate
- each use snapshots its selected variant, origin, direction and rank-adjusted effect coefficient; effects and full-world visuals reuse the same resolved geometry
- living actor centers determine inclusion; damaging areas intersect hostile structure attackable rectangles once, even when shape primitives overlap
- Shield Shockwave's circle binds for one second and taunts for five; its cone stuns for one second, pushes up to two units at 16 units/second, then taunts for three seconds from actual movement completion
- cone evasion prevents damage and control; blocking or absorption does not stop the push. Terrain and full-body safe landings can shorten displacement; a fully blocked push starts taunt immediately
- Maul Sweep retains its existing disarm, including the full-circle damage tradeoff
- companion AoE channels are temporary skill runtime behavior, not a final casting, telegraph, or player-authored area-targeting system

Companion area variants (world units; damage coefficients below are rank one, with existing rank and combat modifiers preserved):

| Skill | Variants | Default |
|---|---|---|
| Sweeping Strike | Caster-centered 180-degree semicircle, radius 2: 1.5× Attack uniformly per recipient; full radius-2 circle: 1.05× Attack (70% normal skill damage), without primary/splash distinction | Semicircle |
| Shield Shockwave | Caster-centered radius-2 circle or forward 180-degree cone reaching 2; both 0.7× Attack, with the control sequencing above | Circle |
| Arrow Burst | Forward 6×1.5 line or 90-degree cone reaching 3.4; both 1.2× Attack | Cone |
| Maul Sweep | Caster-centered radius-2 180-degree semicircle: 1.15× Attack; full circle: 0.805× Attack, both with existing disarm | Semicircle |
| FireBurst | Selected-enemy-centered radius-3 circle (area 28.27), 13-square cross or X (area 29.25), or centered 9×3 strip (area 27); normal magic damage and Burn for all | Circle |
| Circle of Renewal | Selected-ally-centered radius-5 circle, or radius 5√0.7 (about 4.18) with exactly 70% area and 130% normal healing | Normal circle |
| Dawn Step | Radius-2 circle or five-square cross; offensive effects at landing, defensive effects at departure; existing disarm | Circle |
| Atonement Step | Same circle/cross choices; offensive landing disarms, defensive departure heals other injured allies; existing HP cost and safety rules | Circle |

Square patterns use touching 1.5×1.5 squares and rotate smoothly in world space. FireBurst's directional patterns align caster-to-target, with three squares per arm on its cross/X. Rune Step uses one fixed true radius-2 circle under its existing offensive/defensive rules, without shape or target-priority choices. Shield Challenge, Threatening Roar and party-wide buffs remain unchanged. No rings or orbiting effects are introduced.

Sweeping Strike, Shield Shockwave and Maul Sweep use normal attack context and current combat facing, without target-priority settings or priority-driven approach movement. Arrow Burst and FireBurst offer High HP / Big Group / Low HP. Dawn Step and Atonement Step offer those priorities only for offensive approaches; defensive escape remains threat-based. Renewal also offers Defender. Big Group is the default and scores the actual selected shape, including valid prospective mobility landings. High HP uses remaining HP; Low HP uses HP percentage. Healing main targets must remain living, injured and satisfy their HP threshold. Distance and ID break ties deterministically. Manual targeting and movement safety remain authoritative, and Barracks are never discovered as autonomous skill targets.

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

- Green Slime
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

Prototype enemy archetypes/families provide lightweight defaults such as display name, default combat style, default attack range, and default temperament.

Prototype enemy types provide current setup values such as level, attack cooldown, detection range, attack range override, combat body radius, temperament, combat style override, target preference, and an optional ordered reusable enemy ability-id list.

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
- may be rebuilt by map reset, debug reset, or current prototype resource respawn behavior

Gathering is task-based, not manual.

Gatherers and collectors search for or receive valid resources, move to an open reachable stand position near the resource when needed, gather over time while within the current prototype resource interaction range, then return to party behavior when the task is finished, invalid, unsafe, or no longer worth pursuing.

Current prototype resource interaction range is 2.

Resources may limit how many gatherers or collectors can gather them at once.

Current prototype resource respawn behavior:

- authored wilderness resource nodes respawn after 30 seconds when depleted
- respawn restores the node at its authored position with full durability and full quantity
- respawn uses the node's authored resource type and tier
- resource respawn is a current prototype AFK support behavior, not a production resource ecosystem


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

Resource hover details should show the current produced item name, resource type, tier, durability, and current quantity. Resource hover quantity should show the actual remaining quantity only, without current/max inventory capacity text.

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
- skill books stack to 99
- equipment does not stack
- quest items can stack only if their item definition allows it
- event items can stack only if their item definition allows it
- equipment items may move between shared inventory and companion equipment slots
- skill books remain inventory items until successfully read by an eligible companion

Current item categories:

- material
- consumable
- skill book
- equipment
- quest
- event

The implementation category id for skill books is `skill_book`, but player-facing documentation may call them skill books.

Current prototype consumable behavior:

- companions may equip one flask from shared inventory
- equipped flasks start with zero charges when equipped
- flasks have use duration, cooldown, charges, charge cost, healing, and optional temporary stat buffs
- manual party consumable use can start flask use for eligible living companions
- auto-flask behavior can start flask use when a companion reaches the configured HP threshold
- equipped flasks can be refilled at the hub healing fountain
- equipped flasks gain one charge after 20 counted enemy defeats
- consumable buffs contribute to companion primary and derived stat calculations while active

Food-style companion buffs are now handled by the Inn Kitchen, not by shared-inventory consumable assignment.

Current Inn Kitchen meal behavior:

- meals are cooked per companion through Guild & Inn -> Inn -> Kitchen
- the current MVP recipe is House Bread
- House Bread costs Crowns and Hearth's Fire
- House Bread grants a temporary Max HP bonus to the selected companion
- Inn Kitchen meals persist through save/load until they expire
- selected recipes and auto-cook preferences are stored per companion
- auto-cook may renew meals for hub-eligible companions when the configured threshold is reached and the Kitchen has enough Crowns and Hearth's Fire

Current prototype consumable items:

- Minor Recovery Flask
- Soldier's Recovery Flask

The prototype wallet is shared by the party.

Current wallet rules:

- currency does not use inventory slots
- current currency is Crowns
- wallet balance may be shown in inventory, merchant UI, and temporary feedback
- wallet changes are game-state data, not individual companion data

Enemy drops currently use lightweight prototype drop tables.

Current enemy drop behavior:

- defeated enemies may roll drops by enemy archetype, enemy type, loot tier, and optional Superior variant
- loot tier is currently derived from enemy level
- Tier 1 currently covers enemies below level 10
- Tier 2 currently covers enemies level 10 and above
- archetype/tier drops route enemy-part material items into shared inventory
- Superior enemies use higher-yield prototype drop tables where supported
- Azure Mass currently has a type-specific Slime loot table
- Goblin Shaman may also roll a low-chance type-specific Simple Lantern equipment drop at Tier 2
- Superior Goblin Shaman has a higher prototype Simple Lantern drop chance
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
- Goblin Shaman Tier 2 archetype drop: Simple Lantern 2%

Current prototype gathered materials:

- Softwood
- Copper Ore
- Field Herb
- Hardwood
- Iron Ore
- Redleaf Herb

Legacy gathered material ids for Wood, Ore, and Herb may still exist for compatibility, but current resource yields should use tiered gathered material items.

Current prototype enemy-part material drops may include:

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

- Simple Lantern from Goblin Shaman

Current merchant behavior:

- the hub Merchant has a fixed prototype buy stock
- Merchant Buy can purchase selected equipment, flasks, and skill books for Crowns
- current Merchant Buy skill book stock includes books for all current Beginner and first-class active and passive skills
- current Merchant Buy pricing uses the existing lower price category for Beginner skill books and higher price category for first-class skill books
- Merchant Buy validates merchant identity, quest unlock state, stock membership, price, wallet balance, item category, and inventory capacity
- purchased items are added to shared party inventory
- Merchant Buy may filter stock by group, secondary item type or slot, minimum level requirement, maximum level requirement, and party equipment compatibility
- party-compatible filtering applies to equipment compatibility and does not hide flasks or skill books
- current Merchant Buy stock groups include flasks, books, weapons, offhands, cloth armor, leather armor, mail armor, plate armor, and accessories
- current secondary Merchant Buy filters may separate weapons and offhands by equipment type, armor by slot, and accessories by charm type
- Merchant Sell can sell unlocked shared-inventory slots containing current regular Merchant Buy stock items or enemy-part materials
- current regular Merchant Buy stock items sell for 100 percent of their current per-unit Buy price
- enemy-part materials sell for their explicit per-unit item value
- enemy-part values increase with the difficulty of the easiest normal enemy source; current common values rise from 1 Crown at levels 1-3 to 6 Crowns at levels 16-18, and matching rare parts are worth four times the common value
- parts shared by enemies at multiple levels use the easiest normal source, and Superior enemies keep the same per-unit value because their increased drop quantities already provide the reward increase
- equipped items, banked items, locked inventory slots, quest items, event items, key items, gathered resource materials, Farm ownership, Livestock ownership, and items outside the current Merchant Sell rules cannot be sold
- stackable sales use a player-selected quantity and show the live total Crown payout before confirmation
- Merchant Sell does not include Sell All, automatic selling, remote selling, dynamic prices, purchase provenance, or a full shop economy
- while Outfit the Expedition is active and its First Aid purchase objective is incomplete, First Aid is the only enabled Merchant purchase; other regular stock remains visible but unavailable, Farm Seed and Livestock purchases are unavailable, and Merchant Sell remains available
- purchasing First Aid immediately unlocks the normal Merchant purchase options, and later selling First Aid does not reverse completed purchase-objective progress
- this is prototype merchant behavior, not a full shop economy

Current prototype key item behavior:

- key items are slotless progression records, not inventory-slot items
- current key items may unlock direct prototype World Travel teleport options
- key items may be awarded by crafting, boss drops, or other explicit prototype rewards
- key items may show short-lived unlock feedback

Current prototype bank behavior:

- Bank Chest NPCs provide shared party storage anywhere in the current town hub when that hub contains a Bank Chest
- bank storage is slot-based and separate from shared inventory
- bank and inventory slots may be locked to prevent selected movement
- manual deposit, manual withdraw, and deposit-all actions may move eligible items between inventory and bank
- quest items cannot be deposited
- bank auto-routing may keep items in inventory, deposit eligible enemy-part materials only, or deposit all eligible non-quest items
- remote bank viewing may exist through UI, but item movement requires Bank service availability in the current town hub

Current prototype crafting behavior:

- Smith NPCs provide lightweight prototype crafting anywhere in the current town hub when that hub contains a Smith
- crafting may create equipment or slotless key items
- crafting consumes required unlocked inventory items, matching previous equipment where required, and Crowns
- crafting does not count equipped or banked equipment toward previous-equipment requirements
- crafting requires inventory space for item outputs after consumed inputs are accounted for
- current craftable equipment covers prototype level 1, 5, 10, and 15 equipment paths where recipes exist
- current key item crafting may include the Harbor Union Bastion Teleportation Echo
- successful crafting may advance explicit crafting quest objectives

Equipment recipe material rules (Issue #683):

- Prefer materials available at or below the equipment's level. Armor, accessories, shields, quivers, talismans, and other non-weapon offhands may use sources at most 2 levels above the item; weapons, including weapons used offhand, may use sources at most 3 levels above it.
- Above-level materials are supplementary: each quantity must be smaller than the main gathered ingredient's quantity (the largest gathered-material quantity when several are used).
- Source level means the earliest reliable source of the exact material tier: a normal authored enemy, an authored gathering location, or the acquisition source of the producing Livestock creature. Superior variants do not increase source level.
- Every equipment recipe must comply, including recipes for consumed previous equipment. These are content-authoring rules, not new material equip requirements, player crafting gates, or restrictions on slotless key-item recipes.
- Corrected level-10 recipes use appropriate Goblin/Imp parts or older Wolf Pelts instead of level-18 Orc parts; level-15 Sentinel Boots and Bastion Sabatons use Briar Wolf Pelts. Level-10 pendants use Iron Ore instead of Tin Ore; level-15 pendants retain Tin Ore from Tin Crawler Livestock.
- Orc Hide and Orc Tusk retain their drops and sale values but have no current crafting use after these corrections. New uses require separate design approval.

This is not the full inventory, wallet, equipment economy, shop, crafting, trading, bank, loot, backend persistence, cloud save, account save, or cross-device persistence system.

Do not implement these unless explicitly requested:

- production bank storage beyond the current prototype Bank Chest system
- persistent ground loot
- full selling flows beyond the current prototype Merchant Sell rules
- dynamic shop inventories or full shop economy beyond the fixed prototype Merchant buy stock
- advanced consumable systems beyond current prototype flasks, auto-flask behavior, flask recharge, and Inn Kitchen meal buffs
- full crafting chains, profession progression, upgrades, durability, or production crafting economy beyond the current prototype Smith crafting system
- trading
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

- Universal starter/fallback: Training Sword-type main-hand weapons may be equipped by every current and future class
- Beginner: no specialized weapon type, no offhand; uses the universal Training Sword type
- Blade: One-Handed Sword, Dagger
- Aegis: One-Handed Mace, Shield
- Hunter: Bow, Quiver
- Beast: Claw, Claw
- Elementalist: Orb, Orb
- Runecaster: Lantern, Talisman
- Lightbearer: One-Handed Mace, Lantern
- Penitent: Whip, Dagger

Training Sword-type weapons, including Training Sword and Copper Training Sword, remain equipped through first-class selection and may be re-equipped by every class. They contribute only their existing item stats; class identity continues to determine attacks, attack range, projectiles, and skills.

All specialized class weapons and offhands remain restricted to their listed class permissions and requested equipment slot. Claws, Orbs, and Lanterns may define both Main Hand and Offhand as compatible item slots, but the class profile still decides which of those slots each class may use. This supports Beast and Elementalist using two separately owned copies while preventing unrestricted dual wielding or invalid Lantern placement.

Fresh first-class selection does not grant equipment. The free Dagger, Quiver, second Claw, or second Orb is limited to automatic migration of existing version-1 saves.

Current prototype weapon and offhand item examples include:

- Training Sword
- Copper Training Sword
- Iron Sword
- Iron Mace
- Claw Gauntlet
- Thorn Whip
- Short Bow
- Apprentice Orb
- Simple Lantern
- Wooden Shield
- Leather Quiver
- Simple Talisman
- Iron Dagger

Bows use the Main Hand while Quivers use the Offhand. Claws and Orbs are separate one-item-per-hand equipment lines; each equipped copy contributes its full item stats. The existing both-hands equipment framework remains available for future explicitly two-handed equipment, but current Bows and Claws do not use it.

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
- Current level 10 armor coverage includes cloth, leather, mail, and plate prototype armor options.
- Current Tier 2 prototype equipment definitions may use level 15 and level 20 requirements for scaled weapons, offhands, and armor.

Current prototype armor sets may include:

- Acolyte cloth armor
- Scholar cloth armor
- Scout leather armor
- Stalker leather armor
- Trailrunner leather armor
- Ravager leather armor
- Guard mail armor
- Vanguard mail armor
- Wardmail armor
- Ironmarch armor
- Bulwark plate armor
- Warplate armor
- Tier 2 level 15 and level 20 cloth, leather, mail, and plate armor variants

Current prototype accessory examples include:

- Plain Charm

Current prototype quest equipment rewards may include:

- Guard Coif
- Scout Boots
- Bulwark Cuirass
- Plain Charm

Current archetype-specific prototype equipment drops may include:

- Simple Lantern from Goblin Shaman

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

Direct party orders may be rejected without changing party intent when the target is invalid, blocked, or unreachable. Rejections should be recorded through debug telemetry.

A direct gather command may temporarily pause for its existing personal self-defense behavior while retaining the resource order. Under the approved movement design, a transient blocker alone cannot replace a direct move or attack target. Automatic formation, role, and target decisions cannot rewrite active direct intent.

Temporary forced displacement pauses execution while preserving a valid original destination or target and the companion's formation slot. Execution resumes after movement authority returns. Death, target destruction, invalidation, replacement, and cancellation still end the command through its normal lifecycle.

Temporary status effects may still prevent a direct-commanded companion from moving, attacking, gathering, or using skills when the current prototype status rules block that action.

Example:

If the party is attacking but the player orders one party member to gather, that party member gathers while the rest continue fighting.

Dragging a companion to a place issues an individual move, then returns control to normal behavior after completion. Dragging it to a valid enemy or hostile structure issues individual focus until the target or command ends. Physical constraints and inability to act still apply.

---

## Party Management

Initial prototype party:

- 1 current leader
- 2 starting party members
- current starting leader is a Defender
- current second starting member is a Fighter
- the party currently starts in Harbor Union Bastion
- the shared inventory currently starts with one Training Sword as prototype/debug setup

Party size may increase through progression of the highest companion level ever reached.

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
- skill tags
- skill behavior settings
- skill cooldowns and global cooldowns
- level
- party order
- direct commands
- nearby threats
- temporary status effects
- current task validity
- current map and quest context

---

## Main Menu and Party UI

The main gameplay UI may include a simple menu system for inspecting and managing the party and prototype world navigation.

Current intended main menu entries:

- Party
- Party Management
- Inventory
- Atlas
- World
- Options

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
- basic consumable effect and requirement text

Inn Kitchen meal buffs are managed through Guild & Inn -> Inn -> Kitchen, not through Party Equipment.

Skills may show the selected companion's learned active and passive skills from every unlocked class tier.

Current Skills UI may show:

- skill display name
- effect summary
- current rank and max rank
- books required for the next rank
- cooldown
- range
- role score
- skill tags

Active skills are grouped by class. Learned earlier-class active skills may appear in a separate legacy section when they have reached the fixed rank-5 eligibility threshold. Passives appear in a separate passive presentation and never show legacy controls.

Skill Preferences show independent entries under each learned current-class skill's exact name and for enabled legacy skills with supported controls. Disabled legacy skills hide their preference cards without deleting saved settings; enabling them reveals those settings again. A setting for one skill never changes another skill. Unsupported or ineffective controls are omitted; the separate legacy Enable/Disable controls remain available. Hover and keyboard-focus details explain area origin, angle, dimensions, damage/healing tradeoffs, control timing and target meaning, including rank-adjusted potency.

Current supported Skill Preferences may include:

- First Aid Self-Heal Threshold from 10 percent to 60 percent, with the resulting healing effectiveness shown beside the slider
- First Aid Ally-Heal Threshold from 10 percent to 60 percent, with the resulting healing effectiveness shown beside the slider
- Second Wind Self-Heal Threshold up to the current prototype cap
- Hold Fast Use Threshold
- Fake Death Use Threshold up to the current prototype cap
- Blood Feast Use Threshold up to the current prototype cap
- Light Mend Ally HP Threshold up to the current prototype cap
- Self-Sacrifice Safety Floor for Penitent self-cost skills
- Penitent's Gift Ally HP Threshold up to the current prototype cap
- Penitent's Gift Self HP Threshold up to the current prototype cap
- Eternal Hope Use Threshold up to the current prototype cap
- Overcharge enabled or disabled
- Offensive or Defensive use and defensive HP threshold separately for each supported mobility skill
- Ally focus separately for each supported healing or support skill
- Area variants and target priorities only on the individual skills listed above
- Circle of Renewal Target selection for High HP, Big Group, Low HP, or Defender
- Circle Main Target HP Threshold up to the current prototype cap
- legacy Beginner skill toggles when eligible

Skill Preferences must remain backed by game-logic behavior settings and should not define skill targeting, healing rules, or support behavior inside React UI.

Valid saved per-skill settings take precedence. Legacy shared choices seed individual entries once; subsequent changes remain independent. Settings survive class changes, reserve/Field Team roster movement and restoration, with malformed or unsupported options falling back to authored defaults. Preference edits affect subsequent uses, never an active channel. Transient areas and post-knockback effects clear on restoration without a save-version change. New area visuals use companion palettes and blue skill-name feedback in the full renderer only, not the minimap.

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

Approved movement design: Formation offers Arrow 1-2-2, Balanced 2-1-2, and Side-by-side through game-logic commands. The UI displays and selects a preset; game logic assigns roles to slots and resolves movement. Implementation is owned by Issue #704 after its movement and formation prerequisites.

The selected preset persists through save/load and map or recovery transitions. Runtime positions, facing, substitutes, and reservations are rebuilt. Older saves use a supported authored default. Switching presets blends into the new shape while preserving active commands and targets; custom slot editing remains outside this design.

Behavior Settings currently supports prototype companion behavior controls:

- Auto-use Flask toggle
- Flask HP Threshold setting from 1 percent to 100 percent

Skill behavior settings such as First Aid thresholds and Support Focus may live in companion Skill Preferences instead of whole-party Behavior Settings.

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

The Inventory menu may display current shared inventory, key items, wallet-facing values, and supported prototype item interactions.

The Inventory menu must not implement the full inventory, equipment economy, full wallet UI, shop, production crafting, trading, production bank economy, loot, or persistence systems unless explicitly requested.

The Inventory view may display skill book details when a skill book is selected.

Current skill book inventory interactions may include:

- showing the mapped skill name
- showing the mapped skill's max rank
- showing eligible companions who can read the selected book
- showing each eligible companion's current rank for that skill
- reading the selected book for an eligible companion
- showing a no-eligible-companion state when no party member can use the selected book

Skill book reading must call game-logic skill progression helpers and must not duplicate skill lineage, rank cap, inventory removal, or eligibility rules inside React UI.

Current skill-book visual standard:

- each class uses one clean, icon-free book-cover design shared by every active and passive skill book for that class
- each individual book places the exact icon used by its mapped skill on that class-standard cover; books do not use alternate one-off skill emblems
- current cover identities are Beginner parchment, Blade crimson, Aegis steel blue, Hunter forest green, Beast deep evergreen, Elementalist teal, Runecaster violet, Lightbearer pearl-silver, and Penitent graphite
- the common silhouette and gold trim remain consistent while the distinct cover colors identify class ownership

### Quests Menu

The Quests menu displays the current prototype quest log.

It may show:

- available, active, ready-to-turn-in, and completed prototype quests
- current objective progress
- simple quest status labels
- simple prototype reward text
- inventory-full turn-in feedback when quest rewards cannot fit
- category grouping for different quest sources, including main prototype quests and Guild Notice Board quests
- NPC quest location information using current prototype zone/subzone names
- world entity quest indicators may show a separate yellow `!` beside quest-relevant entities

The Quests menu must not implement a full quest journal, branching dialogue, quest reward economy, reputation, cutscenes, or production quest content unless explicitly requested.

### Atlas Menu

The Atlas menu is the current prototype hub for reference and service pages.

Current Atlas pages may include:

- quest and objective reference
- Smith crafting
- Bank storage
- AFK Estimate
- Guild & Inn
- Farm & Livestock

Atlas pages may be viewed remotely when supported.

Functional hub NPC interactions and service actions are available anywhere within the current town hub when the matching NPC role exists in that hub. Current town hubs are Harbor Union Bastion (`hub`) and Forward Bastion (`hub-2`) only; Slimeward Camp and wilderness maps do not count as town hubs. Functional hub roles are Quest Giver, Class Mentor, Merchant, Smith, Bank Chest, Guild Coordinator, Inn Keeper, Farmer, and Livestock keeper. Dogs, quest guides, dungeon chests, and other excluded interactions retain their local interaction ranges.

Service actions remain gated by their owning system and by current-hub service availability:

- Smith crafting requires a Smith in the current town hub
- Bank transfers require a Bank Chest in the current town hub
- Guild & Inn service actions require a Guild Coordinator or Inn Keeper in the current town hub
- Farm service actions require a Farmer in the current town hub
- Livestock service actions require a Livestock keeper in the current town hub

Guild & Inn remote viewing may show current state, upgrades, rooms, recipes, quests, recruits, Field Teams, and timers without allowing gated service actions.

Farm & Livestock remote viewing may show current plots, crop holding, crop rates, livestock grid state, creature ownership, feed requirements, production estimates, upgrades, helper bonuses, and timers without allowing gated service actions.

Guild & Inn, Farm, and Livestock are current town services. Their service actions unlock after The Azure Trial is completed and still require the matching service NPC in the current town hub.

Current prototype hub service split:

- Harbor Union Bastion / Hub 1 has basic hub services only: Quest Giver, Merchant, Smith, Bank Chest, Dog, Healing Fountain, Target Dummy, AoE Target Dummy, and the quest-unlocked Class Mentor.
- Harbor Union Bastion / Hub 1 does not include Guild & Inn, Farm, Livestock, their service NPCs, or the old Test Blade placeholder.
- Forward Bastion / Hub 2 has basic hub services plus Guild & Inn, Farm, and Livestock.
- Main hubs after Forward Bastion should include basic hub services plus Guild & Inn by default.
- Farm and Livestock are currently Forward Bastion special services unless a future ticket explicitly shares or relocates them.

Current Guild & Inn behavior:

- the shared service is opened through the Atlas where supported or by interacting with the Guild Coordinator or Inn Keeper in hubs where they are present
- Guild Recruit shows generated recruit candidates, refresh timing, recruitment upgrades, and destination preview
- Guild Notice Board shows available, taken, and done contracts in four categories: Assault, Extermination, Rummage, and Forage, with descriptions, objectives, rewards, refresh timing, Scout and Wolf-helper rerolls, source breakdown tooltips, and unseen update sign state
- New parties receive a fixed `Assault on Ash Goblin Encampment` starter contract requiring 50 total ordinary-enemy credits in Zone 4, with 575 character XP, 150 base Crowns, and two independently rolled first-class skill books
- The available starter contract is protected from scheduled refreshes and rerolls until taken. Other eligible slots may still reroll, and a reroll is not consumed when no slot can change.
- All Notice Board progress begins only after a posting is taken. After the starter is taken, its completion, claiming, refresh, and cancellation follow normal Board behavior; cancellation does not undo the Guild onboarding outcome.
- Guild Field Teams manage inactive companion assignment, roster movement, upgrades, AFK assignments, redeeming rewards, and return-to-hub behavior
- Inn Rooms show every recruited companion as occupying a room slot, including active party, Inn reserve, and Field Team companions
- Inn Kitchen cooks per-companion meals, manages selected recipes and auto-cook preferences, spends Hearth's Fire, and exposes Recipe Book, Pantry, and Kitchen upgrades

Tier 2 Guild Notice Board contract rules:

Ordinary postings target visited Zones 4–7 only. Zones 1–3, hubs, dungeons, and unvisited destinations are excluded. The fixed Zone 4 starter is the onboarding exception: it is available before the party first visits that map. With no eligible visited zone, ordinary slots stay empty.

When generating a posting, compare the arithmetic mean level of all active companions, including dead active members but excluding Inn reserves and Field Teams, with each visited destination's mean ordinary-monster-type level. Choose from zones within ±5 levels with 80% probability and from other eligible visited zones with 20%; use the nonempty group exclusively when the other group is empty, and choose uniformly within the selected group. Recruitment and new visits affect future generation, not existing postings.

Each slot independently chooses one of the four categories with equal probability. Duplicate zones, categories, or targets are allowed, and matching taken contracts can progress concurrently. Monster pools come from authored Standard encounters; Bosses, Elites, Champions, target dummies, and structures are excluded. Superior variants qualify through their underlying ordinary type, not as a separate contract target. Ordinary Barrack reinforcements count normally.

| Category | Objective | Contract name |
|---|---|---|
| Assault | One shared ordinary-enemy kill-credit counter throughout the target map | `Assault on {Zone}` |
| Extermination | One uniformly selected ordinary monster type in the target map | `{Enemy} Extermination in {Zone}` |
| Rummage | Contract-specific supplies from ordinary enemies in the target map | `Rummage of {Zone}` |
| Forage | Any successfully inventoried wood, ore, or herb units gathered in the target map | `Forage in {Zone}` |

| Zone | Assault / Extermination credits | Rummage items | Forage units | Base Crowns |
|---|---:|---:|---:|---:|
| 4 — Ash Goblin Encampment | 50 | 30 | 10 | 150 |
| 5 — Briar Burrows | 70 | 42 | 15 | 200 |
| 6 — Nightmire Canopy | 90 | 54 | 20 | 250 |
| 7 — Orc Warcamp | 110 | 66 | 25 | 300 |

Progress is capped at the requirement. Direct Superior defeats grant two Assault or Extermination credits. Rummage instead rolls once per qualifying physical death per matching taken contract at exactly 50%, independently between contracts, with no pity or Superior quantity multiplier. `Recovered Supplies — {Zone}` appear in the quest pouch without occupying inventory slots; they belong only to that posting and disappear on cancellation or completed reward claiming.

Forage counts only units successfully added to inventory by gathering. Existing inventory, purchases, Farm or Livestock outputs, Field Team resources, failed inventory additions, and merely depleting a node do not count. Gathered materials are not consumed when claiming. Field Teams contribute only reported kills to matching-map Assault or Extermination contracts, at one credit per reported kill; they do not generate Rummage supplies or Forage progress.

Base XP, base Crowns, and random book outcomes are fixed when a posting is generated. Let `N` be its zone's kill requirement, `R` its Rummage requirement, and `M` the arithmetic mean normal XP of eligible monster types:

- Assault and Forage: `floor(0.5 × N × M)` character XP.
- Extermination: `floor(0.5 × N × target monster normal XP)` character XP.
- Rummage: `floor(0.5 × (R ÷ 0.5) × M)` character XP.

Round down only after the complete calculation. Generation uses normal authored enemy XP without Superior bonuses, player-level penalties, or debug multipliers. Claiming grants the full XP amount to each eligible living current-party companion through existing reward/leveling rules, including normal max-level and debug handling.

Every new posting stores two independent, uniform first-class skill-book results across all eight first classes, excluding Beginner books; duplicates are allowed. It also stores an independent third-book candidate and chance roll. Reward Quality is applied at claim time: levels 1/2/3 grant 100%/110%/120% of base Crowns and a 0%/10%/20% chance of the third book, without scaling XP. Viewing, loading, or retrying a claim never rerolls rewards.

Board interaction claims each completed contract atomically. If all awarded books cannot fit, including duplicate stacks and any bonus book, grant nothing and retain the done/unclaimed contract with inventory-full feedback. Taken and done/unclaimed contracts cannot be refreshed or rerolled away.

The Board clock advances independently of the Guild menu and continues while menus pause combat. Opening or rendering the Board does not generate or retarget postings. Targets and rewards are snapshotted only on generation, scheduled refresh, or manual reroll; newly purchased slots are initialized by the game clock. Existing slot counts, refresh upgrades, and Scout/Wolf reroll limits remain unchanged. Restoration processes at most one overdue refresh, not every missed interval.

Valid legacy taken/done contracts keep their original requirements, progress, and rewards without retroactive XP or new book rolls. Available legacy ordinary postings change only on their next actual refresh/reroll. An untaken legacy starter is upgraded once on restoration while preserving its identity and onboarding state. These optional contract fields require no save-version bump. Board contracts do not add World Travel route hints or new Auto Combat priorities.

Current Farm behavior:

- Farm is currently a Forward Bastion special service and is opened through the Atlas where supported or by interacting with the Farmer in hubs where Farm is present
- crops are permanent plot discoveries and production outputs, not normal inventory clutter
- Carrots start unlocked at level 0 production
- Potato, Moonleaf, Bittercap Mushroom, and Ashpepper plots unlock from seed/key-item sources
- Potato Seed is currently a Merchant purchase
- Moonleaf Seed is currently a rare find from tier 1 herb gathering
- Bittercap Mushroom Spores are currently a rare find from tier 1 wood gathering
- Ashpepper Seed is currently a rare find from Ash Wisp defeats
- unlocked plots start at level 0 production and generate automatically only after their Speed upgrade reaches level 1
- current baseline crop production is 1 crop every 20 minutes at Speed level 1 before upgrades and helper bonuses
- Farm crop output waits in Farm holding until Harvest All transfers it into the Inn Kitchen Pantry
- Farm holding starts at 20 per crop, can be increased by Harvest Cap upgrades, and does not create hidden overflow
- Harvest All collects only currently held crops and does not reset crop generation timers
- per-crop upgrades are Speed, Harvest Cap, and Fertilizer
- placed and fed Elder Mosslings in Livestock add 10% Farm generation speed each

Current Livestock behavior:

- Livestock is currently a Forward Bastion special service and is opened through the Atlas where supported or by interacting with the Livestock keeper in hubs where Livestock is present
- Livestock uses a ranch grid with owned unplaced creatures and placed creatures
- current creatures are Duskhen, Wolf, Tin Crawler, and Elder Mossling
- current creature footprints are Duskhen 1x1, Wolf 2x1, Tin Crawler 2x2, and Elder Mossling 2x2
- two Duskhens are initially owned but unplaced
- Duskhen produces Eggs for the Inn Kitchen Pantry
- Tin Crawler produces Tin Ore into shared inventory until the Smithy rework provides a better production destination
- current Duskhen and Tin Crawler baseline production is 1 output every 3 hours before upgrades
- Wolf and Elder Mossling are helper creatures with no direct output in the current prototype
- Livestock Collect All routes each held output to its current destination
- Livestock feeding consumes whole ingredients from the Inn Kitchen Pantry only
- feeding happens on placement, at local midnight, and through Feed Now for hungry creatures
- hungry creatures pause production and helper bonuses until fed again
- current feed requirements are 10 per day from Duskhen: Carrots, Wolf: Eggs, Tin Crawler: Bittercap Mushrooms, and Elder Mossling: Moonleaf
- current Livestock holding starts at 20 per produced output and does not create hidden overflow
- animal upgrades currently cover production speed, feed discount, and output holding cap where the creature has an output
- building upgrades currently expand rows and columns; Slot Efficiency is visible as Coming Soon

Guild & Inn, Farm, and Livestock MVP systems are current prototype town services. They are not final interiors, full dialogue, final recruitment economy, production housing, full kitchen economy, full ranch economy, full crop economy, creature adjacency/star bonuses, final Smithy production routing, or a completed town-management system.

### World Travel Menu

The World Travel menu is a prototype navigation menu for choosing known prototype map destinations in the current prototype region.

It may show:

- current prototype map
- available connected prototype destinations
- destination display names
- whether a destination can currently be selected
- simple unavailable-state messaging when travel is blocked
- unlocked direct Teleportation Echo options where current prototype key items support them
- yellow `!` NPC quest hints beside route destinations with active or ready-to-turn-in NPC quest relevance

World Travel selection may request travel to a known prototype map destination.

The POI system should route the party toward the next valid teleport step along the current prototype route.

Auto Route is persistent player-selected travel intent, separate from Auto Combat. It uses known eligible destinations and working route steps, refuses blocked routes, and does not proactively choose enemies. It pauses for body blocking, movement-blocking control, or a companion below 50 percent health near a hostile. After the emergency ends, it resumes after 1500 milliseconds of calm and required party cohesion. Formation compression and temporary displacement do not erase the destination.

Approved movement design: individual follower commands complete independently and then rejoin the route. Direct leader movement temporarily overrides route execution and moves the formation reference while retaining the route for later resumption. Companion drag orders are distinguished from normal non-menu world clicks, which cancel Auto Route and perform the clicked action. Explicit Travel stop also cancels it. Arrival clears the route; Auto Combat on arrival enables after the existing 500-millisecond delay when selected and when no encounter rule cancels that pending enable.

Routing and formation movement respect the current Zones 4–7 gates, Patron Ward unlock, active encounter restrictions, and Warmaster chest/departure choice. A blocking chest or departure overlay pauses simulation; movement cannot bypass it or an unacknowledged departure guard.

Direct Teleportation Echo selection may immediately move the party to an unlocked supported prototype destination when no active transition or recovery interaction blocks it.

NPC quest hints are informational route-menu markers, not separate quest route buttons.

NPC quest hints may show active quest objectives by prototype zone/subzone and may show ready-to-turn-in NPC quests at the quest giver hub as completed. If multiple active NPC quests point to the same destination, one marker may group those quests in a tooltip. If an NPC quest objective is inside a special region such as the Slimeward dungeon, the hint should point to the nearest routeable parent zone/subzone, such as Azurefen Hollow / Imp Fen for Slimeward objectives. Guild Notice Board quests do not appear in NPC quest route hints.

World Travel must use existing prototype teleport route data and current map state.

World Travel must not create final zone routing, persistent zone state, production fast travel rules, map discovery rules, production travel costs, or a full world map unless explicitly requested.

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
- craft item
- unlock route
- collect dungeon chest
- return to POI
- take Guild Notice Board quest

Encounter-milestone objectives read durable Boss victory, captive rescue, or full chest collection without creating another encounter or NPC.

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
- craft item
- unlock route
- collect dungeon chest
- take Guild Notice Board quest

Talk-to-POI and return-to-POI objective types are lightweight type support and should not be treated as implemented quest content unless a quest definition uses them.

Current prototype quests:

- Secure the Landing
  - Quest id: clear_the_shore
  - Objectives: defeat 10 Green Slimes in Shore Fringe, gather 3 Wood in Shore Fringe, and inspect the Shore Fringe supply marker
  - Rewards: 50 Crowns, 8 character XP, 2 Tier 1 Wolf Pelt, 1 Minor Recovery Flask, 1 Guard Coif
  - Unlocks: Outfit the Expedition

- Outfit the Expedition
  - Quest id: outfit_the_expedition
  - Objectives: equip a Training Sword, equip a Guard Coif, equip a Minor Recovery Flask, and buy 1 First Aid skill book
  - Rewards: 10 Crowns, 4 character XP
  - Unlocks: First Work at the Smithy

- First Work at the Smithy
  - Quest id: smiths_first_work
  - Objectives: craft 1 Plain Charm and equip it in accessory slot 1
  - Rewards: 10 Crowns, 4 character XP
  - Unlocks: Stolen Field Supplies

- Stolen Field Supplies
  - Quest id: stolen_field_supplies
  - Objectives: collect 10 Stolen Supply Bundle quest drops from Cave Bat-family enemies in Mossy Glade
  - Rewards: 45 Crowns, 12 character XP
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
  - Rewards: 65 Crowns, 22 character XP
  - Unlocks: Hold the Field Cache

- Hold the Field Cache
  - Quest id: hold_the_field_cache
  - Objectives: defend the Old Grove field cache while quest-spawned enemies attack
  - Rewards: 75 Crowns, 28 character XP, 1 Soldier's Recovery Flask
  - Unlocks: Open the Causeway

- Open the Causeway
  - Quest id: open_wolf_causeway
  - Objectives: escort the Causeway Worker, repair the Wolf Causeway blockage for 10 seconds while defeating its three ambushers (two Wolves and one Goblin Thrower), defeat the tracked level-8 Superior Wolf, and unlock the map-3 route
  - The 10-second repair defense begins with the Causeway Worker saying, “Its an ambush! Protect me!”
  - The repair step completes only after both the full repair timer and all three ambushers are defeated. The tracked Superior Wolf is the encounter’s second step and appears only after the repair defense ends.
  - Ambient enemies remain suppressed across both steps and return three seconds after the tracked Wolf is defeated.
  - The quest Wolf is a Superior variant with Standard encounter rank. It uses normal Superior combat and rewards; unrelated Superior Wolves do not count.
  - Rewards: 100 Crowns, 40 character XP, 1 Bulwark Cuirass, 1 Plain Charm
  - Unlocks: Broken Thicket Survey

- Broken Thicket Survey
  - Quest id: broken_thicket_survey
  - Objectives: inspect the Broken Thicket trail marker, collect 5 Crawler Shell Fragment quest drops in Broken Thicket, and gather 2 Herbs in Broken Thicket
  - Rewards: 45 Crowns, 10 character XP
  - Unlocks: Crawler Shelf Report

- Crawler Shelf Report
  - Quest id: crawler_shelf_report
  - Objectives: inspect the Crawler Shelf overlook, collect 4 Shelf Rune Scrap quest drops in Crawler Shelf, and repair the Crawler Shelf route marker
  - Rewards: 45 Crowns, 12 character XP, 1 Minor Recovery Flask
  - Unlocks: Slimeward Trail

- Slimeward Trail
  - Quest id: find_slimeward_camp
  - Objectives: inspect the Slimeward Camp teleporter, defeat 4 Mosslings in Imp Fen, collect 4 Teleporter Stabilizer quest drops in Imp Fen, repair the Slimeward Camp teleporter, and unlock the Slimeward Camp route
  - Rewards: 25 Crowns, 10 character XP
  - Unlocks: The Azure Trial

- The Azure Trial
  - Quest id: azure_trial
  - Objectives: enter Slimeward Floor 1, defeat The Azure Mass on Slimeward Floor 2, and collect the Slimeward boss chest
  - Rewards: 100 Crowns, 1500 character XP

- Orders from the Guild
  - Quest id: orders_from_the_guild
  - Availability: The Azure Trial is completed and at least one active or resting roster companion has selected a first class
  - Objective: take the fixed `Assault on Ash Goblin Encampment` Guild Notice Board contract
  - Rewards: none
  - Unlocks: Break the Ash Camp after normal turn-in

- Break the Ash Camp
  - Quest id: break_the_ash_camp
  - Objectives progress in parallel: earn 200 direct enemy kill credits in Ash Goblin Encampment, successfully collect 20 Wood, Ore, or Herb units from that map, and equip one class-restricted first-class weapon on an active party companion
  - Training Sword variants and offhand-only shields, quivers, talismans, and daggers do not satisfy the weapon objective
  - The equipment objective remains complete after it is first satisfied
  - Rewards: 500 Crowns and 1800 character XP
  - Unlocks: Into the Briar Burrows

- Into the Briar Burrows
  - Quest id: into_the_briar_burrows
  - Objectives progress in parallel: earn 300 direct enemy kill credits in Briar Burrows, own one Tin Crawler Hatchling, and have at least 3 active party companions
  - Existing Tin Crawler ownership and active-party size are recognized immediately; resting and Field Team companions do not count toward the party-size objective
  - The Hatchling is not consumed and retains the existing first/second/further discovery chances of 10%/5%/1%
  - Rewards: 750 Crowns and 2800 character XP
  - Unlocks: The Patron's Shadow

- The Patron's Shadow
  - Quest id: the_patrons_shadow
  - Objectives progress in parallel: charge and break the Night Bat, Elder Mossling, and Cinder Wisp Patron Wards, and own one Elder Mossling Livestock creature
  - Each Ward requires 100 matching Nightmire Canopy enemy credits before it can be manually activated; ambient Superior enemies grant 2 credits and quest-spawned Ward defenders are always normal variants
  - Ward defenses may be completed in any order and use waves of 3+3 Night Bats, 4+4 Elder Mosslings, and 3+3+4 Cinder Wisps respectively
  - Rewards: 1000 Crowns and 4000 character XP
  - Unlocks: The Evil Patron's Chosen

- The Evil Patron's Chosen
  - Quest id: the_evil_patrons_chosen
  - Available from the Forward Bastion Quest Giver after The Patron's Shadow is turned in; non-repeatable
  - Display objectives in this order: defeat the Orc Warmaster once, free the captive, fully collect the Warmaster's chest, and earn 150 Orc kill credits in Orc Warcamp
  - All four progress in parallel. Orc kills count after acceptance, including Grunts, Raiders, Shieldbearers, the Warmaster and Barrack reinforcements; normal enemies grant 1 credit and Superiors 2, capped at 150
  - Prior Boss victory, automatic captive rescue and fully collected chest milestones count on acceptance and remain complete through later attempts, rearming, travel and loading; ordinary kills before acceptance are not banked
  - Chest completion requires its Crowns and every pending item to be collected; opening it or leaving inventory overflow does not qualify
  - Rewards: 1500 Crowns once and 6000 character XP for each eligible living current-party companion, separate from Boss XP/drops and chest rewards
  - No further quest unlock

Quest definitions own their quest-giver map. Quest Givers in Harbor Union Bastion and Forward Bastion can accept their available quests and turn in their ready quests from anywhere in the matching hub while that Quest Giver is present.

The Class Mentor may act as the current prototype quest source for The Azure Trial.

`Orders from the Guild` is reconciled after Azure Trial turn-in, successful first-class selection, and save restoration so either requirement may be completed first. Taking its starter Board contract before accepting the onboarding quest satisfies the objective immediately when the quest is later accepted. The Board take action owns this progress in game logic rather than React UI.

`Break the Ash Camp` counts only resource quantities successfully added to inventory from `map-4` / `ash-goblin-encampment`; failed full-inventory collection does not progress the quest. A generic gather objective may omit a resource type to match any supported resource while retaining its map and subzone restrictions.

`Into the Briar Burrows` uses state-derived Livestock ownership and active-party-size objectives. Incomplete state-derived objectives reconcile on quest acceptance, the matching roster or Livestock action, and save restoration; once completed, they remain complete.

Quests may author first-incomplete objective guidance independently of parallel progression. The Evil Patron's Chosen guides toward the Boss, any remaining rescue/chest milestone, then remaining Orc kills; turn-in routes to Forward Bastion once ready. Tracker labels use optional authored objective names. Manual orders and self-defense retain priority. If the player re-enables Auto Combat after victory, guidance may approach the chest but never claims it automatically.

`The Patron's Shadow` places three manually activated Wards around the Nightmire Canopy route to Orc Warcamp. Only one Ward defense can be active at a time. Starting a defense removes all ambient Nightmire enemies and leaves only the matching quest defenders. Failed, abandoned, wiped, or interrupted defenses reset to charged-and-ready without requiring another 100 credits. Ambient enemies return at full health near their authored homes 2 seconds after the defense ends unless another Ward begins during that breathing period.

During an active quest defense, Auto Combat prioritizes that encounter's living defenders and holds at the defense anchor between waves. Focus continues across sequential objectives that hand off the same ambient-enemy suppression group, targeting the current objective's quest enemies or holding near its target position before they appear. It does not select resource POIs, and autonomous Gatherer-role companions rejoin the party instead of starting or continuing autonomous gathering. Manual party gathering and direct companion gathering commands remain allowed and may still cause the existing retreat/reset behavior. Focus ends when the current encounter objective completes or resets; a remaining ambient-enemy restoration delay does not extend it.

Completing the third Ward unlocks the Orc Warcamp route before quest turn-in. The dark-green collision barrier around the teleporter fades, and an untargetable Orc Warmaster scene actor says `You have drawn the Patron's gaze. Come, then.`, remains visible for 3 seconds, then fades through the portal. Existing saves that had already reached Orc Warcamp preserve that access without replaying the barrier scene.

Current lightweight NPC speech bubble behavior:

- interacting with a supported character NPC may show one short-lived, non-branching speech bubble near that NPC; functional hub NPCs use current-hub availability, while excluded NPCs still require the party to reach their local interaction range
- service NPC speech may provide a short role tip while the existing service UI opens normally
- Quest Giver and Class Mentor speech may reflect ready, available, or active quest state through authored hints
- supported dog NPCs may show a short bark without opening a service panel
- world speech bubbles prefer centered-above placement, shift horizontally around registered HUD regions, fall below the speaker when needed, and remain clamped inside the usable world viewport; their tails continue to point toward the speaker
- the Orc Warmaster Ward finale uses the same HUD-aware speech placement so its sentence remains readable beside the minimap and coordinate panel
- speech is presentation-only, does not pause simulation, does not persist in saves, and does not change quest or NPC behavior
- Bank Chests, dungeon chests, and temporary quest-objective NPCs do not use this speech presentation
- this does not implement branching dialogue, choices, conversation history, relationships, cutscenes, or a full dialogue system

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
- a defend objective may opt into requiring all configured defender waves to be defeated as well as completing its repair timer; without this setting, existing timer-only defense behavior is unchanged
- quest objectives may data-drive ambient-enemy suppression for a map or subzone, including living, defeated, respawning, normal, and Superior ambient enemies while leaving target dummies and quest-spawned enemies untouched
- suppression groups allow consecutive objectives to share captured enemies and cancel a pending restoration without briefly repopulating the area
- suppressed enemies restore together after the objective's configured delay, at full health and near safe authored home positions; each objective chooses whether original variants are preserved or rerolled
- the existing field-cache and Wolf Causeway defenses use subzone suppression, a 3-second delay, and variant rerolls; the Patron Wards share map-wide suppression, a 2-second delay, and preserved variants
- living quest-spawned defense enemies are cleaned up when the defense objective completes
- defeat elite objectives can spawn an aggressive quest enemy
- unlock route objectives complete the associated route step

Quest guide, rescue, repair, defend, route unlock, and elite behaviors are prototype quest-objective helpers.

They are not full follower, recruitment, dialogue, companion, town NPC, production escort, event scripting, or final quest framework systems.

Current prototype world quest indicator behavior:

- quest-relevant world entities may show a separate yellow `!` immediately before the entity name
- enemy name text remains unchanged; the `!` is a separate visual prefix
- active incomplete main quest enemy, resource, guide NPC, rescue NPC, and explicit POI/NPC objectives may mark matching living or active entities on the current map
- available and ready-to-turn-in NPC quests may mark their quest giver NPC
- taken incomplete Guild Notice Board combat and Rummage objectives may mark matching living ordinary enemies on the target map; Forage objectives may mark active resources on that map
- completed objectives, completed quests, available Notice Board quests, and done Notice Board quests do not mark objective targets
- an entity shows at most one quest `!` even if multiple quests match it
- a future Notice Board-specific alternate icon may exist later, but it is not part of the current prototype behavior

Current prototype quest reward behavior:

- ready quests can grant rewards through Quest Giver turn-in
- rewards may include Crowns, character XP, inventory items, and equipment items
- current NPC quest rewards do not grant skill books unless a quest definition explicitly adds them later; Guild Notice Board contracts have their separate first-class book rewards
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
- direct Superior kills grant 2 credits to matching defeat-count objectives without multiplying elite objectives, quest-item drops, resources, equipment requirements, or other objective quantities

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

The current Leader POIs panel shows a combat target's broad enemy archetype name, such as `Slime` or `Bat`, instead of exposing its internal entity id or sequence number. Non-combat POI labels keep their existing presentation.

POI selection should prefer progression-relevant targets before generic local activity.

Current intended POI priority order:

1. active World Travel route target
2. active quest objective on the current map
3. ready quest turn-in target
4. available quest acceptance target on the current map
5. quest-required prototype teleport when the active objective is on another reachable prototype map
6. reachable wild combat target when combat fallback is relevant
7. reachable wild resource target when gathering fallback is relevant
8. reachable exploration or inspect target for quest objectives
9. safe idle hub point

When the party is in the hub, Merchant POI behavior is currently driven by active quest objectives and direct player interaction, not autonomous item selling.

POI selection should avoid selecting invalid, unreachable, depleted, dead, completed, locked, already satisfied, or gatherer-reserved resource targets.

POI selection may use path distance, priority, target scoring, progressive fallback, local target preference, and short commitment windows to avoid unstable target switching.

The POI categories above are shared guidance capabilities, not permission for Auto Combat to choose every category. Auto Combat and explicit World Travel have separate ownership; existing authored quest-defense and encounter guidance remains applicable.

Current prototype UI exposes Auto Combat as an Off/On control:

- Auto Combat: Off disables proactive combat acquisition; existing personal/party self-defense remains available subject to player-command priority.
- Auto Combat: On enables local combat, roles, Gatherer-role behavior, and supported dungeon/encounter guidance inside the current scope. It does not independently start generic open-world quest, NPC, resource, exploration, idle, or World Travel routes; authored quest-defense and encounter guidance remains governed by its existing rules.

Player-facing Zone/Subzone/Free Travel cycling has been removed. Internal POI scope compatibility may exist, but the current game-facing Auto Combat behavior is Off or On using the local subzone boundary.

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
- level-ups may grant unspent stat points after first-class progression begins
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

First-class growth should express class identity using small automatic stat increases:

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

Party size is tied to the highest companion level ever reached.

Current party size progression:

- Highest companion level below 10: 2 party members
- Highest companion level 10 or higher: 3 party members
- Highest companion level 30 or higher: 4 party members
- Highest companion level 60 or higher: 5 party members

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
- current context such as combat, danger, gathering, support needs, or party safety
- target validity
- range
- companion skill behavior settings
- companion global cooldown availability
- individual skill cooldown availability
- temporary status effects that may block skill use

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity.

Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

---

## Starting Class

Party members may begin as:

- Beginner

Beginner is the starting class before choosing a first class.

Beginner should feel simple, flexible, and broadly useful across every later class path.

Current prototype first-class selection:

- becomes available at level 10
- is available only to living Beginner companions
- allows choosing Blade, Aegis, Hunter, Beast, Elementalist, Runecaster, Lightbearer, or Penitent
- rejects invalid class targets
- rejects companions who already chose a first class
- rejects choices when currently equipped items are incompatible with the selected class
- retains equipped universal Training Sword-type weapons through a successful selection

---

## Class Paths

There are four class paths:

- Honor Path
- Primal Path
- Arcane Path
- Holy Path

Each path has two first classes.

Subclass progression is future-facing and should not be implemented until explicitly requested.

---

## Honor Path

Theme:

- discipline
- training
- control
- technique

First classes:

- Blade
- Aegis

Blade is an offensive melee and precision combat class focused on fast, consistent damage, self-sustain, parrying, physical party support, wood gathering support, mobility, and small-area strikes.

Aegis is a defensive combat class focused on mitigation, protection, shielding, taunts, frontline control, ore gathering support, mobility, and defensive area disruption.

---

## Primal Path

Theme:

- instinct
- survival
- natural power
- adaptability

First classes:

- Hunter
- Beast

Hunter is a tracking, positioning, precision, hybrid combat, and utility class focused on control shots, threat escape, evasion, ranged pressure, poison support, herb gathering support, mobility, and area arrow attacks.

Beast is a raw aggression class focused on sustain, feral combat, resilience, roaring control, lifesteal, mitigation, pack support, ore gathering support, pouncing mobility, and area disruption.

---

## Arcane Path

Theme:

- learned magic
- reality manipulation

First classes:

- Elementalist
- Runecaster

Elementalist is a damage-focused magic class with support for magic damage, shielding, defensive buffs, Overcharge, party magic support, wood gathering support, fiery mobility, AoE, and DoT effects.

Runecaster is a control and utility magic class focused on traps, ranged magic, barriers, delayed recovery, focus effects, party mitigation support, ore gathering support, and rune-based mobility.

---

## Holy Path

Theme:

- faith
- devotion
- divine power

First classes:

- Lightbearer
- Penitent

Lightbearer is a healing, protection, and stabilization class focused on control, direct healing, barriers, healing over time, party support, herb gathering support, safe mobility, and area healing.

Penitent is a high-risk, high-reward class based on self-sacrifice mechanics, control, bleeding damage, sacrificial barriers, sacrifice healing, sustain, party support, wood gathering support, and self-cost mobility.

---

## Class Rules

Classes may have restrictive prototype weapon and offhand permissions.

Weapons are gameplay-facing stat/data modifiers, not sprite identity.

Class sprites already express the class fantasy visually, so equipment must not require visible weapon swaps, paper-doll rendering, weapon anchoring, or sprite attachment work during the prototype phase.

First-class selection from Beginner exists during prototype progression.

Subclass progression is future-facing and should not be implemented until explicitly requested.

Classes define available skills, tools, equipment permissions, and stat direction.

Roles determine how those tools are prioritized.

---

## Alpha Skill System

Skills are class-based abilities that form a persistent part of companion progression. The alpha system supports active skills and always-active passive skills without adding mana, skill trees, hotbars, or an advanced casting framework.

Active skills:

- are defined by tags
- use simple effects
- use numeric ranges
- may use per-skill cooldowns
- may use a short companion global cooldown after basic attacks or skill use
- do not yet use mana or advanced resource systems
- are used as simple extensions of existing party, role, combat, support, movement, and gathering behavior
- should be selected through role priorities and context instead of hardcoded class behavior

Passive skills:

- are learned automatically at rank 1 when their class is unlocked
- remain active after later class changes
- do not use equipment slots, activation toggles, or legacy enabling
- may be broadly useful or may require a specific class skill, status, or combat event before they can have an effect
- use the same rank and skill-book progression foundation as active skills

Skill usage is determined by:

- role priorities
- skill tags
- current context such as combat, danger, gathering, support needs, and safety
- target validity
- range
- companion global cooldown availability
- individual skill cooldown availability
- companion skill behavior settings where supported

Alpha skill effects may include:

- direct physical or magic damage
- lunge damage
- splash or area damage
- taunts and multi-target taunts
- enemy control such as binds, disarms, traps, or temporary aggro drops
- self-buffs
- ally buffs
- party class buffs
- shields, barriers, absorbs, and block effects
- damage mitigation
- healing
- healing over time
- self-healing
- self-cost healing
- lifesteal
- DoT effects such as burning, bleeding, or poison
- mobility, dash, escape, and repositioning effects
- gathering support buffs
- maintenance-style buffs
- beginner fallback combat or survival tools

Alpha skill cooldown behavior:

- Beginner active skills may have longer individual cooldowns than some first-class active skills
- first-class active skills may define individual cooldowns or fall back to the shared skill cooldown value
- long-duration first-class buffs may use long cooldowns and refresh windows
- individual skill cooldowns should not block other ready skills
- companion global cooldown prevents immediate repeated basic attacks or skill use
- failed skill effects should not consume cooldown when no effect is applied
- Overcharge may temporarily increase supported skill power while adding a cooldown penalty

Alpha skill progression:

- companions automatically learn every active and passive skill belonging to a newly unlocked class at rank 1
- a Beginner companion has a rank cap of 5 for Beginner skills
- after a first class is unlocked, Beginner skills have a rank cap of 10 and first-class skills have a rank cap of 5
- each later class tier is intended to add 5 ranks to every earlier class tier: Beginner caps progress 5/10/15/20, first-class caps progress 5/10/15, second-class caps progress 5/10, and third-class skills begin at cap 5
- future class tiers and their content are not implemented by the alpha skill work
- an earlier-class active skill becomes eligible for cross-class legacy enabling at rank 5, regardless of its current maximum rank
- legacy enabling applies only to active skills
- eligible legacy active skills remain individually enabled without a slot limit
- learned passive skills remain active automatically and never require legacy enabling
- a skill book cannot teach a skill outside the companion's learned class lineage

Continuous rank scaling uses two shared units unless a skill defines a bespoke progression:

```text
Scale units U(rank):
rank 1–5: U = rank
rank 6+:  U = 5 + (rank - 5) × 0.5

Growth steps G(rank):
rank 1–5: G = rank - 1
rank 6+:  G = 4 + (rank - 5) × 0.5
```

Effects expressed as a value per rank use `U(rank)`. Effects that start from a rank-1 base and grow afterward use `G(rank)`. Discrete effects use explicit milestones. Arcane Crescendo, Overflowing Grace, Overcharge, and other explicitly listed skills use their own formulas.

Skill logic should remain in game logic, not React UI.

---

## Beginner Active Skills

Beginner has eight broad active skills that remain useful after first-class selection without replacing first-class identity.

Beginner active skill identities:

- Throw Rock
- Kick
- Guard Up
- First Aid
- Deep Breath
- Rally Call
- Field Hands
- Follow Through

Beginner active scaling through the currently reachable rank 10:

- **Throw Rock:** a ranged taunt. Taunt duration is 3 seconds at rank 1, gains 0.5 seconds per rank through rank 5, then gains 0.25 seconds per rank. Rank 10 lasts 6.25 seconds.
- **Kick:** an opening lunge and melee fallback attack. Direct physical damage is 100 percent at rank 1, gains 5 percentage points per rank through rank 5, then gains 2.5 percentage points per rank. Rank 10 deals 132.5 percent.
- **Guard Up:** a defensive survival skill. Duration is 6, 7, 8, 9, and 10 seconds at ranks 1–5, then gains 0.5 seconds per rank. It blocks one physical hit at ranks 1–4, two at ranks 5–9, and three at rank 10.
- **First Aid:** an emergency heal whose normal healing uses the generic rank potency curve. Its actual healing is reduced according to the target's current health as described below.
- **Deep Breath:** a self damage buff. It grants +1 damage per rank through rank 5, then +0.5 damage per rank. Rank 10 grants +7.5 damage.
- **Rally Call:** an ally damage buff. It grants +1 damage per rank through rank 5, then +0.5 damage per rank. Rank 10 grants +7.5 damage.
- **Field Hands:** its gathering-power bonus uses the generic rank potency curve. Its player-facing description is: "For 90 seconds, increases gathering power for any resource. Each one-second gathering attempt removes more resource durability, so items are collected sooner. It does not improve item quantity, tier, or rarity."
- **Follow Through:** a range-1 melee skill with a 10-second cooldown that deals direct physical damage. Base damage is 100, 110, 120, 130, and 140 percent at ranks 1–5, then gains 5 percentage points per rank; rank 10 deals 165 percent. When the target is currently attacking another living companion, Follow Through gains a conditional 20, 25, 30, 35, or 40 percentage points at ranks 1–5, then gains 2.5 points per rank; rank 10 gains 52.5 points. Autonomous targeting prefers a qualifying enemy but may use the baseline attack when none qualifies.

First Aid targeting and effectiveness:

- First Aid cannot be cast on a target above 60 percent health.
- At 60 percent target health, it applies 10 percent of its normal rank-scaled heal.
- At 30 percent target health, it applies 60 percent of its normal rank-scaled heal.
- At 10 percent target health or lower, it applies 100 percent of its normal rank-scaled heal.
- Effectiveness is linearly interpolated between the 60-to-30-percent and 30-to-10-percent anchors.
- The self-heal and ally-heal preference sliders are clamped from 10 through 60 percent and show the resulting effectiveness beside the selected threshold.
- Beginner companions may prioritize themselves at or below the configured self-heal threshold. Support-role Beginner companions may heal an ally when supported targeting context and the ally-heal threshold allow it.

Follow Through replaces Quick Step and its skill-book identity. Prototype saves do not require migration.

Beginner active skills use the normal two-second companion global cooldown. No attack-speed or global-cooldown scaling is added by this roster.

---

## First-Class Active Skills

Each current first class has eight active skills. These skills establish the class's alpha identity and use the shared active-skill progression rules unless an explicit formula overrides them.

Blade active skill identities:

- Duelist Challenge
- Second Wind
- Blade Parry
- Edge Focus
- Press the Opening
- Woodcutter Rhythm
- Flash Step
- Sweeping Strike

Aegis active skill identities:

- Shield Challenge
- Hold Fast
- Guard Wall
- Iron Stance
- Shield Formation
- Stonebreaker Rhythm
- Shield Rush
- Shield Shockwave

Hunter active skill identities:

- Pinning Shot
- Fake Death
- Evasive Instinct
- Hunter's Focus
- Poison Coating
- Herbalist Rhythm
- Skirmish Shot
- Arrow Burst

Beast active skill identities:

- Threatening Roar
- Blood Feast
- Rugged Hide
- Feral Surge
- Pack Frenzy
- Stoneclaw Rhythm
- Pounce
- Maul Sweep

Elementalist active skill identities:

- Elemental Bolt
- Mana Shield
- Frost Armor
- Overcharge
- Arcane Conduit
- Emberwood Rhythm
- Flame Step
- FireBurst

Runecaster active skill identities:

- Binding Rune
- Rune Lance
- Warding Glyph
- Rewind Rune
- Runic Focus
- Leyline Matrix
- Stone Sigil Rhythm
- Rune Step

Lightbearer active skill identities:

- Blinding Ray
- Light Mend
- Sanctuary Veil
- Guiding Light
- Radiant Benediction
- Herbalist Hymn
- Dawn Step
- Circle of Renewal

Penitent active skill identities:

- Whip Prison
- Flagellant Lash
- Martyr's Veil
- Penitent's Gift
- Eternal Hope
- Burdened Benediction
- Woodcutting Penance
- Atonement Step

Balance may continue to change during alpha, but names, progression ownership, and cross-class rules are no longer disposable prototype behavior.

---

## Elementalist Overcharge Progression

Overcharge uses explicit power and cooldown-penalty formulas instead of the generic rank curve:

```text
Power bonus:
rank 1–5 = 10% + 2.5 percentage points per rank after rank 1
rank 6+  = rank-5 value + 1.25 percentage points per rank

Cooldown penalty:
rank 1–5 = 20% + 2 percentage points per rank after rank 1
rank 6+  = rank-5 value + 1 percentage point per rank
```

| Rank | Power bonus | Cooldown penalty |
|---:|---:|---:|
| 1 | 10% | 20% |
| 5 | 20% | 28% |
| 10 | 26.25% | 33% |
| 15 | 32.5% | 38% |

Overcharge duration, refresh window, enable preference, and base cooldown remain unchanged. Stable Overcharge subtracts its reduction from the cooldown penalty, never below zero. A successful Overcharge cast or refresh snapshots the current rank-scaled power and reduced cooldown penalty for that application; later rank changes apply on the next cast or refresh. Overcharge and Arcane Crescendo damage bonuses combine additively.

---

## Passive Skills

Every current class has two passive skills. They unlock at rank 1 with the class, use matching skill books and normal class-dependent rank caps, and remain active after later class changes. General percentage passives use `U(rank)` unless a bespoke formula is stated.

Passive counters, charges, prior-target or prior-rune memories, and barriers are temporary skill runtime. Map transitions, world-wipe recovery, and save restoration clear them through the normal skill-runtime cleanup rules.

Beginner passives:

- **Resourcefulness:** equipped flasks restore `2% × U(rank)` more health. This is 10 percent at rank 5 and 15 percent at rank 10.
- **Steady Nerves:** harmful control durations applied by enemies to the companion are reduced by `2% × U(rank)`. It applies to immobilize or bind, disarm, blind or forced evasion, silence, and taunt, but not allied or self-inflicted control and not damage-over-time effects. This is 10 percent at rank 5 and 15 percent at rank 10.

Blade passives:

- **Duelist's Momentum:** successful direct physical hits against the same enemy build up to three stacks. Each stack grants `1% × U(rank)` physical damage. Changing targets or the target's death clears all stacks. The hit that creates a stack does not benefit from that new stack.
- **Riposte Training:** Blade Parry mitigation grants one 10-second charge. The next successful direct physical hit gains `5% × U(rank)` damage and consumes the charge. A new charge refreshes the duration and never stacks.

Aegis passives:

- **Rooted Bastion:** after five seconds without changing position, gain `3% × U(rank)` Defense. Walking, forced movement, or teleporting resets the condition; being immobilized does not.
- **Unbroken Line:** enemies taunted by this companion deal `3% × U(rank)` less damage to other companions, but not to the taunting companion. Multiple sources use only the strongest value.

Hunter passives:

- **Headhunter:** each XP-granting party kill in the last 30 seconds grants one percentage point of critical chance. Maximum stacks at ranks 1–5 are 3, 4, 5, 6, and 7. Test targets, summons, and enemies that grant no kill credit do not count. The maximum gains one additional stack at each later five-rank milestone, reaching 8 at rank 10 and 9 at rank 15.
- **Exploit the Snare:** deal `3% × U(rank)` additional direct physical damage to enemies that are bound, immobilized, disarmed, blinded, or silenced. Damage-over-time effects and taunt do not qualify.

Beast passives:

- **Blood Scent:** deal `3% × U(rank)` additional physical damage to enemies at or below 30 percent health, including qualifying physical damage-over-time ticks. Recheck the health threshold for each resolved tick.
- **Pack Instinct:** deal `2% × U(rank)` additional direct and damage-over-time damage when another living companion is within two spaces of the target. Recheck party proximity for each resolved tick.

Elementalist passives:

- **Stable Overcharge:** subtract `1 percentage point × U(rank)` from Overcharge's cooldown penalty, never below zero. This is 5 points at rank 5 and 10 points at rank 15.
- **Arcane Crescendo:** each successful skill explicitly classified as an offensive spell builds one charge. Buffs, shields, heals, gathering skills, failed casts, and duplicated resolutions do not count. After reaching the threshold, the next successful offensive area-of-effect spell gains `4% × rank` damage and consumes the charge. The threshold-building spell cannot also trigger the bonus, the unused charge persists until consumed or normal skill-runtime cleanup occurs, and the triggering area spell begins the next cycle at zero.

```text
Arcane Crescendo threshold:
ranks 1–5:  10 successful offensive spells
ranks 6–10: 9 successful offensive spells
ranks 11–15: 8 successful offensive spells
general formula: max(6, 10 - floor((rank - 1) / 5))
```

Runecaster passives:

- **Word Resonance:** when the current successful Runecaster skill has a different primary rune-word from the previous successful Runecaster skill, it gains `2% × U(rank)` effect strength. The first cast receives no bonus. Runic Focus duplicates neither trigger nor advance the sequence. Resonance can strengthen damage, healing, relevant buff strength, gathering power, or control and effect duration. It does not change cooldown, range, movement distance, target count, block count, or Runic Focus duplication count.
- **Living Inscription:** each active rune effect created by the companion grants `1% × U(rank)` Runecaster-skill effectiveness, with at most two effects contributing. Eligible effects are Binding Rune, Warding Glyph, Rewind Rune, one Leyline Matrix cast, and an active Rune Step trap. Count source-owned effects, not every entity affected by one source effect. Word Resonance and Living Inscription combine additively.

Lightbearer passives:

- **Overflowing Grace:** converts `5% × rank` of direct overhealing into an eight-second absorb barrier capped at `1% × rank` of the target's maximum health. At rank 5 this is 25 percent conversion and a 5 percent cap; at rank 15 it is 75 percent conversion and a 15 percent cap. Applications merge and refresh up to the cap. Direct single-target and direct area heals qualify; healing-over-time ticks and recursive barrier effects do not. When several absorb effects are present, damage uses Mana Shield first, a standard absorb shield second, and Overflowing Grace last.
- **Many Beacons:** a direct heal whose selected or main target differs from the previous direct-heal target gains `2% × U(rank)` healing. The first heal receives no bonus, repeating a target has no bonus or penalty, the memory expires after ten seconds, and healing-over-time ticks do not change the memory.

Penitent passives:

- **Crimson Authority:** while at or below 50 percent health, enemy-facing control and bleed durations created by the Penitent gain `3% × U(rank)`. It does not extend self-inflicted control drawbacks such as Whip Prison's restriction on its caster. Determine the duration when the effect is applied; later healing does not shorten an existing effect.
- **Cruel Mercy:** successfully healing or shielding another companion grants one ten-second charge. The next successful damaging Penitent skill gains `3% × U(rank)` direct and bleed damage and consumes the charge. Self-healing does not prime it, and failed skills or old damage-over-time ticks do not consume it. A new charge refreshes the duration and never stacks.

---

## Runecaster Tifinagh Rune-Word and Word-Seal System

Runecaster magic uses real Amazigh words written in Neo-Tifinagh. Tifinagh glyphs are letters, not independent mystical symbols. Each complete word functions as one magical rune-word. Exact glyph order and character count must be preserved. This linguistic origin is presented as in-world Runecaster lore without referring to a real-world region.

For readable combat presentation, each complete rune-word maps to one compact magical **word seal**. A word seal is invented visual shorthand for the complete word; it is not a Tifinagh letter, does not replace the canonical spelling, and must never be presented as part of the Tifinagh alphabet. The same rune-word always uses the same seal, and seal identity comes from its silhouette rather than its color.

Each current Runecaster skill uses one unique ordered sequence of two word seals: primary, then secondary. The two complete words remain separate symbolic concepts and do not need to form one grammatical sentence. Reversing an existing sequence is permitted for a future skill because order carries meaning. Future effects should show no more than three seals simultaneously; longer future sequences should appear in readable stages.

| Skill | Primary rune-word and seal ID | Primary meaning | Secondary rune-word and seal ID | Secondary meaning | Ordered concepts |
|---|---|---|---|---|---|
| Binding Rune | `ⵇⵇⵏ` — qqen / qqn — `qqen` | tie, bind, attach, or restrain | `ⴰⵙⵇⵇⵏ` — asqqen / asqqn — `asqqen` | rope, tether, or physical bond | Bind → Tether |
| Rune Lance | `ⵜⴰⴼⴰⵍⴰ` — tafala — `tafala` | spear or lance | `ⵜⴰⵣⵎⵎⴰⵔⵜ` — tazmmart / tazmert — `tazmert` | power, capacity, strength, or ability | Lance → Power |
| Warding Glyph | `ⴰⵎⵙⵜⵏ` — amesten — `amesten` | protection or defense | `ⴰⴼⵔⴰⴳ` — afrag — `afrag` | fence, enclosure, barricade, or protective boundary | Protection → Barrier |
| Rewind Rune | `ⵓⵖⴰⵍ` — uɣal — `ughal` | return, go back, or come back | `ⵜⵓⴷⵔⵜ` — tudert — `tudert` | life | Return → Life |
| Runic Focus | `ⴰⵍⵙ` — als — `als` | repeat, perform again, redo, or begin again | `ⴰⵎⵎⴰⵙ` — ammas — `ammas` | center or middle | Repeat → Center |
| Leyline Matrix | `ⴰⵣⵟⵟⴰ` — azṭṭa — `aztta` | weaving, loom, web, or network | `ⴰⴱⵔⵉⴷ` — abrid — `abrid` | path, way, route, or road | Network → Path |
| Stone Sigil Rhythm | `ⴰⵣⵔⵓ` — azru — `azru` | rock or stone | `ⴰⵏⵢⴰ` — anya — `anya` | rhythm, cadence, air, or melody | Stone → Rhythm |
| Rune Step | `ⴰⵙⵓⵔⵉⴼ` — asurif — `asurif` | step, stride, or stage of movement | `ⵇⵇⵏ` — qqen / qqn — `qqen` | tie, bind, attach, or restrain | Step → Bind |

Skill-specific seal presentation:

- Binding Rune places the Qqen seal centrally as the binding command and the Asqqen seal around or behind it as tightening links or a closing tether.
- Rune Lance forms the shaft or forward line from the Tafala seal, with the Tazmert seal supporting or trailing it as propelling force.
- Warding Glyph displays the Amesten and Afrag seals as two defensive layers: protection and boundary.
- Rewind Rune presents Uɣal as the returning motion while Tudert remains the life-bearing center.
- Runic Focus overrides the normal primary emphasis: Ammas sits at the center while Als surrounds it as repetition.
- Leyline Matrix emphasizes Azṭṭa on the caster as the network while connected party members receive the smaller Abrid path seal.
- Stone Sigil Rhythm keeps Azru heavy and stable while Anya supplies the repeated cadence.
- Rune Step carries Asurif with the moving caster, then leaves Qqen at the destination as the binding trap.

The skill list shows a compact ordered two-seal icon with transliterated rune-word names. Skill details show the full Neo-Tifinagh spellings, all accepted transliterations, meanings, mechanical concepts, sequence order, and rune-word count. Text rendering must use a Neo-Tifinagh-capable fallback font. Skill books reuse the exact compact skill-sequence icon on the Runecaster book design. Battlefield composites may add the existing violet and cyan class presentation around the same canonical seals without changing their silhouettes.

A cumulative rune meter, a third Runic Focus copy, invented marks presented as Tifinagh letters, and new animated visual behavior are outside the current alpha scope.

---

## Skill Books

Skill books are stackable, skill-specific inventory items used to raise active and passive skill ranks.

Skill-book behavior:

- skill books are stackable inventory items
- each skill book maps to one active or passive skill
- skill books exist for all current Beginner and first-class active and passive skills
- Beginner and first-class books retain their existing price categories and stack limit of 99
- a companion can read a skill book only for a skill in their current class lineage
- a companion can read an eligible Beginner skill book while Beginner
- a first-class companion can read eligible books for current first-class skills and learned Beginner skills
- every unlocked class skill begins at rank 1
- the number of books required to reach target rank `B` is `cost(B) = B(B + 1) / 2 - 2`
- examples are 1 book from rank 1 to 2, 4 from rank 2 to 3, 8 from rank 3 to 4, 13 from rank 4 to 5, and 53 from rank 9 to 10
- advancing one skill from rank 1 through rank 10 requires 201 books in total
- no partial book progress is stored
- a Study action is available only when shared inventory contains the full number of matching books required for the next rank
- one Study action consumes exactly that requirement and advances exactly one rank
- excess matching books remain in shared inventory after that action
- studying fails if the companion is invalid, the item is not a skill book, the skill is unknown, the skill is unavailable to that companion, the skill is already maxed, the full required quantity is unavailable, or inventory removal fails
- failed Study actions consume no books
- companion selection shows the companion name and the exact number of books required for that companion's next rank; the action is disabled when inventory has fewer books
- skill presentation shows current rank, the selected companion's current maximum rank, and the books required for the next rank; a maxed skill shows `Max`

Skill books are primarily obtained through Merchant Buy stock unless another current reward, drop, or debug path explicitly grants one.

Broad Merchant availability supports alpha progression testing and does not define the final trainer, loot, class tutor, or skill acquisition economy. No prototype-save migration is required for this transition.

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
- Barrier
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
- Party Buff
- Maintenance
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

- Self Healing
- Self Buff
- Light Damage

Important rules:

- Roles determine preferred skill usage, not classes
- Classes define available skills, not behavior
- Beginner active skills are the definitive alpha Beginner kit and remain useful after first-class selection.
- First-class active skills define current alpha class identity but are not final content-complete class kits.
- Skill ranks and legacy-enabled earlier-class active skills are the alpha progression foundation, not a mastery or multiclass system.
- Skill Preferences remain UI controls backed by game logic.
- Skills remain deliberately simple and data-driven during alpha.
- The alpha system extends the existing skill-definition/progression model rather than creating a separate full ability framework.

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

A central port town acts as the first main hub.

Current prototype hub maps are Harbor Union Bastion and Forward Bastion, safe settlements with placeholder town entities and decorative non-simulation structure visuals.

Current Harbor Union Bastion prototype hub:

- Harbor Union Bastion is the first prototype hub map.
- It is a safe port/peninsula settlement.
- It currently includes a minimal beach/dock entry area, small city square, basic service NPCs, a healing fountain, decorative house/cabin/tent/dock-shore structure visuals, and a clear exit to the first wild zone.
- Current placeholders may include Quest Giver, quest-unlocked Class Mentor, Merchant, Smith, Bank Chest, Dog, a hub target dummy, and a hub AoE target dummy.
- The Quest Giver supports the lightweight prototype quest chain only.
- The Class Mentor supports prototype first-class selection for eligible Beginner companions after the quest unlocks it and remains available in Hub 1 after The Azure Trial.
- The Merchant supports a fixed prototype buy stock for selected equipment, flasks, and skill books.
- The Smith supports current lightweight prototype crafting only.
- The Bank Chest supports current lightweight prototype shared bank storage only.
- Harbor Union Bastion does not currently include Guild & Inn, Guild Coordinator, Inn Keeper, Farm, Livestock, their service NPCs, Test Blade, or direct physical Slimeward Camp access.
- Hub target dummies are passive 100 HP debug enemies with no XP reward.
- The standard hub target dummy can be manually attacked for combat testing, is not selected by autonomous POI behavior, and regenerates health over time.
- The hub AoE target dummy is a debug combat-test enemy for prototype enemy AoE channel and telegraph behavior.
- The healing fountain restores party member health and refills equipped flask charges when party members are in range.
- The prototype hub should not spawn hostile enemies for now.
- The prototype hub must not implement full town systems, interiors, branching dialogue, full shops beyond the fixed prototype Merchant buy stock, full crafting or smithing beyond current prototype Smith crafting, recruitment beyond current Guild Recruit behavior, or NPC relationship systems unless explicitly requested.

Current Forward Bastion prototype hub:

- Forward Bastion is the second prototype hub map.
- It is a safe forward settlement connected between Azurefen Hollow and Ash Goblin Encampment.
- It currently includes basic hub services, a Guild & Inn building, Farm and Livestock service anchors, decorative structure visuals, a healing fountain, and physical route teleports.
- Current placeholders may include Quest Giver, Merchant, Smith, Bank Chest, Guild Coordinator, Inn Keeper, Farmer, Livestock keeper, and dog NPCs.
- The Quest Giver owns the current Guild Notice Board onboarding quest and the Ash Goblin Encampment main quest.
- The Class Mentor may appear in Forward Bastion through current quest-aware hub NPC data.
- The standalone Bounty Board NPC is removed; board work is accessed through the Guild & Inn Notice Board UI.
- The Guild Coordinator and Inn Keeper open the current Guild & Inn Atlas service page.
- Guild & Inn service actions are available throughout Forward Bastion while either Guild & Inn service NPC is present.
- The Guild & Inn Notice Board sign may appear near the building when board work is unseen or claimable.
- Farm and Livestock service actions are available throughout Forward Bastion while the matching service NPC is present.
- The Smith supports current lightweight prototype crafting only.
- The Bank Chest supports current lightweight prototype shared bank storage only.
- Forward Bastion should not spawn hostile enemies for now.
- Forward Bastion must not implement full town systems, interiors, bounty systems, full smithing or crafting beyond current prototype Smith crafting, recruitment beyond current Guild Recruit behavior, branching dialogue, full shops beyond the fixed prototype Merchant buy stock, or NPC relationship systems unless explicitly requested.

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
- `map-3` <-> `hub-2`
- `hub-2` <-> `map-4`
- `map-4` <-> `map-5`
- `map-5` <-> `map-6`
- `map-6` <-> `map-7`
- `map-3` <-> `slimeward-camp`
- `slimeward-camp` <-> `slimeward-floor-1`
- `slimeward-floor-1` <-> `slimeward-floor-2`
- `slimeward-floor-2` -> `slimeward-camp`

Slimeward Camp is currently reached from Azurefen Hollow through the map-3 route access. Direct World Travel to Slimeward Camp is available only after the Slimeward Camp Teleportation Echo is unlocked.

Some prototype forward teleports can start non-working and become working through quest route-unlock objectives or dungeon runtime events.

Current non-working starter routes:

- `map-1` -> `map-2`
- `map-2` -> `map-3`
- `map-6` -> `map-7` until all three Patron Wards have been completed, except for legacy saves that already reached map-7
- `hub-2` north route placeholder
- `hub-2` east route placeholder
- `slimeward-camp` broken exit placeholder
- `slimeward-floor-2` -> `slimeward-camp` until the Slimeward boss chest has collected loot

World Travel and AI route selection should use only working teleports.

Current readable prototype/debug map names:

- `hub`: Harbor Union Bastion
- `hub-2`: Forward Bastion
- `map-1`: Mosswake Shore
- `map-2`: Briarwood Rise
- `map-3`: Azurefen Hollow
- `map-4`: Ash Goblin Encampment
- `map-5`: Briar Burrows
- `map-6`: Nightmire Canopy
- `map-7`: Orc Warcamp
- `slimeward-camp`: Slimeward Camp
- `slimeward-floor-1`: Slimeward Floor 1
- `slimeward-floor-2`: Slimeward Floor 2

Current prototype wilderness subzones are:

- Mosswake Shore: Shore Fringe, Mossy Glade, Lower Shore
- Briarwood Rise: Scout Rise, Old Grove, Wolf Causeway
- Azurefen Hollow: Broken Thicket, Crawler Shelf, Imp Fen
- Ash Goblin Encampment: Ash Camp
- Briar Burrows: Briar Burrows
- Nightmire Canopy: Nightmire Canopy
- Orc Warcamp: Orc Warcamp

Current post-Hub-2 wilderness structure:

- Post-Hub-2 maps are smaller than the pre-Hub-2 wilderness maps and currently use one internal subzone each for POI, Auto Combat, AFK estimate, encounter, resource, and compatibility systems.
- Post-Hub-2 maps use blockers, negative space, encounter pockets, and landmarks to create denser paths without narrow party-clogging corridors.
- After Hub 2, each new wilderness map should normally contain around three enemy types as the current standard; exceptions are allowed when the theme benefits from a close variant count.
- Ash Goblin Encampment contains Goblin Shaman level 10, Ash Wisp level 11, and Ember Imp level 12. Ember Imps use the telegraphed reusable Fire Bolt before returning to their normal ranged basic attacks.
- Briar Burrows contains Tin Crawler level 13, Briar Wolf level 15, and Mire Spider level 15.
- Nightmire Canopy contains Night Bat level 16, Elder Mossling level 17, and Cinder Wisp level 18.
- Nightmire Canopy's three Patron Wards reuse the Bat roost tree, Elder Moss stump, and Cinder-veined stone landmarks near the Orc Warcamp teleporter. Uncompleted Wards and their quest defenders show the looping dark-green Orc aura as a narrative marker rather than a combat bonus.
- The Orc Warcamp teleporter is covered by a radius-5 dark-green barrier until the third Ward is completed; its visual circle and collision use the same authored geometry, and the barrier is omitted for legacy-preserved access.
- Orc Warcamp contains Orc Grunt level 18, Orc Raider level 19, Orc Shieldbearer level 19, and Orc Warmaster level 20.

Planned Orc Warcamp layout (Issue #678):

- Keep the overall map footprint the same as Nightmire Canopy.
- Use roughly 60% of the map for a broad, freely accessible Orc field, about 15% for a vertical route, and the remaining 25% for the Warmaster arena. These are layout targets, not exact partition boundaries.
- Keep the open field useful for repeatable Orc farming and backtracking; loose enemy squads may organize the field, but players do not need to clear it as a mandatory sequence of checkpoints.
- Start the route near the top of the field, run it downward, and enter the arena from below. Place one Orc squad and a destructible, health-bearing, non-attacking Barrack along the vertical passage. Keep walkable lanes beside the living Barrack, so destroying it is optional rather than required to advance; retain the passage's outer walls.
- The compact arena spans X80.5–108.5 and Y21.5–51.5 within the unchanged 110×57 map. Its former northern footprint is solid terrain. Three arena Barracks stand at (88,29), (95,26) and (102,29), around the Warmaster and dais at (95,32). Keep clear central movement and AoE space, the southern gate at (87,51), cage at (88,45) and chest at (102,45).
- The arena entrance may use a dark-green circular collision barrier following the visual and collision behavior of the Nightmire Patron Ward barrier. Its open/closed progression is separate from the fixed map layout, and it must not trap the party inside the arena.

Current Orc Barracks behavior (Issue #679):

- All four Barracks are manually targetable hostile combat structures, never autonomous Auto Combat targets. Basic attacks, projectiles, damaging skills and incidental AoEs can damage them; DoTs work, while crowd control and aura buffs do not.
- Each has six times normal level-18 Orc Grunt health (currently 1,248 HP), zero attack, defense, magic defense, evasion and block. The route artwork and attackable rectangle are 5×5 units; arena artwork and attackable rectangles are 3×3. Their smaller bottom-aligned 5×2 and 3×1 ground footprints define movement collision only. Companions attack from any reachable position in range of the attackable rectangle, without crowding the building center; unrelated walls still block direct attacks. Any AoE intersection with the attackable rectangle counts once, including roof-area and boundary contact, while ring holes remain empty.
- The route Barrack requires a living active companion within 10 units and clear line of sight. Arena Barracks instead require an active Warmaster attempt and a visible living active companion anywhere inside the arena, without the ten-unit restriction. Walls and solid map collision obstacles block visibility; companions and enemies do not. Each uses a twelve-second preparation cycle, including the first spawn. The route Barrack caps at five living owned reinforcements; each arena Barrack caps at two, for six arena reinforcements total. Spawn weights remain 80% Orc Grunt, 10% Orc Raider and 10% Orc Shieldbearer. They use normal type levels, abilities and rewards, never roll Superior and do not independently respawn. Existing over-cap reinforcements remain alive; their building pauses production until fewer than its configured cap remain.
- Preparation pauses without losing progress when activation requirements fail or the cap is reached. Losing visibility or the active attempt also preserves any completed preparation and pending rolled type. Blocked spawn positions retain the finished preparation and rolled type until a reachable, body-clear candidate is available; there are no catch-up production bursts or immediate opening wave.
- Destruction replaces the healthy building with ruined artwork at its unchanged visual size and ground anchor, removing collision, attack commands and combat overlays. Ruins are nonblocking and untargetable. Destruction grants no XP, drops, quest kills, flask recharge or enemy-kill triggers. Existing reinforcements remain alive and continue counting against its cap.
- Each Barrack independently rebuilds at full health two minutes after destruction, including during Boss combat. At the deadline, physically overlapping living companions and enemies may be safely separated to the nearest valid local positions outside its ground footprint. Full bodies, terrain, other occupants, enemy movement bounds and reservations must all fit; corrections are planned together and applied only if every blocker can be placed safely. This is position correction, not combat knockback: health, statuses, targets, casts, cooldowns, gathering state and player orders remain unchanged. NPCs, resources, terrain and other structures are never displaced. Active/pending dashes, forced movement, reservation-only blockers or unsafe landings defer rebuilding, with blocked clearance checks at most once every 250 milliseconds.
- Rebuilding swaps back to the healthy artwork, starts a fresh preparation cycle and keeps surviving reinforcement ownership. The defeated Warmaster arena freezes its three Barracks until the completed-clear lifecycle below rearms them; frozen buildings neither rebuild independently nor give repair warnings. The route Barrack remains independent.
- Health, preparation, monotonic reinforcement IDs, rebuild deadlines, the route tutorial-seen flag and whether the current repair warning has played survive saves and travel. Increasing Barrack durability preserves each living building's health percentage; destroyed buildings remain destroyed. Older saves safely relocate full actor bodies out of reclaimed terrain and moved buildings, repair reinforcement homes and rebind the Warmaster's home without changing companions' life state or progression. No reinforcements are produced offline. Map exit removes local reinforcements without defeat rewards; a same-map restoration retains valid owned reinforcements. An overdue rebuild occurs only on the active map after safe clearance.
- Living Barracks show health, preparation and pulsing hostile outlines. The route Barrack introduces manual targeting with “Click the Barrack to attack it” and one five-second HUD-aware speech bubble when production begins after approaching or rebuilding; loading does not replay it. Arena Barracks omit the tutorial. All four buildings say `Work Work` once per destruction/rebuild cycle, ten seconds before their rebuild deadline, using the same five-second bubble and final half-second fade. An occupied footprint does not repeat or postpone the line; loading clears transient speech, preserves whether it played and skips a warning whose display window was already missed offline. Ruins have no health/preparation bars or hostile outlines, but may show this repair speech.
- Barrack-spawned Orc deaths count toward Warmaster recharge after victory. Independent rebuild timers still apply during active fights; completed-clear arena freezing and restoration are the explicit exceptions described below.

Current Orc Warmaster encounter (Issue #680):

- The level-20 Boss has 1,500 HP and keeps his other combat stats, basic attack, XP and drops. Azure Mass retains its existing 900 HP. A living party member entering the eastern arena begins an attempt without granting unlimited-range aggro. The Warmaster's chase and dash stay inside that arena.
- The Warmaster does not wander while idle. He waits near the Barracks at his safe home after spawning, resetting or rearming, then detects and fights the party normally; combat movement is unchanged.
- Ready abilities use priority Patron Burst, Patron Cleave, Kick, then Rending Dash, with at least one committed normal attack between abilities. Cooldowns start when casting begins. Cast origin, direction and offensive areas are locked once.

| Ability | Patron Power | Cast / windup | Cooldown | Effect |
| --- | --- | --- | --- | --- |
| Rending Dash | 0 | 0.9s / 0.2s | 10s | Existing 7.5×3-unit Raider dash, 0.35s full travel, 1.5× attack as physical damage. |
| Kick | 0 | 0.6s / 0.2s | 8s | 1× attack as physical damage at melee reach; pushes the surviving target up to 4 units over 0.25s. Moving out of reach or line of sight avoids the hit. |
| Patron Cleave | 5 | 1.2s / 0.3s | 12s | Locked 90-degree cone with 6-unit reach; 1.5× attack as physical damage. |
| Patron Burst | 10 | 1.5s / 0.5s | 20s | Locked filled circle with 4-unit radius; 2× attack as physical damage. |

- Kick's reusable forced movement respects terrain, resources, structures and the target's full body. It can cross living actors but must finish at a free point on the same line, falling back backward if needed. Evasion prevents the push; blocking, shielding or absorbing the damage does not. Displacement suspends actions while preserving pending player orders.
- Each genuine Orc Grunt, Raider or Shieldbearer death inside an active arena attempt sends one visible Patron-energy transfer to the living Boss, including Barrack reinforcements. Superior quest credits do not multiply this energy; despawning and cleanup grant none. Transfers arrive after one second, track the moving Boss visually, cannot be intercepted and are discarded when the Boss or attempt ends.
- Patron Power caps at 10 and does not decay. Cleave becomes available at five power and Burst at ten for the rest of that attempt. Overflow is discarded. Destroying a Barrack prevents its future reinforcements but does not remove power already acquired; only ending or resetting the attempt clears power.
- Each stack adds 5% of the authored base size to the Boss's sprite, aura and combat radius, up to 1.5× at 10 stacks. His base 1.25-unit radius becomes 1.875 units; combat stats and authored ability dimensions do not grow. Movement reserves enough terrain clearance for maximum growth.
- Existing Orc auras render behind living arena Orcs and the Boss, never over their sprites. Energy copies travel from defeated Orcs to him. His overhead display shows `Patron Power: N/10`; the first completed transfer each attempt triggers `Their borrowed power returns to me!` through the shared five-second HUD-aware speech bubble. Cast names use enemy red, with existing offensive telegraphs and dash afterimages.
- A wipe, three continuous seconds without a living party member inside the arena, map exit, explicit encounter reset or save restoration resets a living Boss to full health near home, zero power and base size. It clears his active actions, cooldowns, basic-attack gate, transfers, speech and associated displacement. Failed attempts require no recharge and do not repair Barracks or remove surviving reinforcements. A defeated Boss remains unavailable under the lifecycle below; legacy saves without that lifecycle instead start with the first encounter ready.

Current Warmaster repeat lifecycle and rewards (Issue #681):

- The first encounter is ready immediately. The Warmaster no longer uses ordinary timed enemy respawning. After each victory, 60 physical Zone 7 Orc Grunt, Raider or Shieldbearer deaths recharge the next encounter, including Barrack reinforcements. Each death grants one credit, including Superiors. Progress starts at victory, caps at 60 and does not bank kills from before victory or while another fight is ready/active. Structures, the Warmaster, other maps, despawns and cleanup grant none.
- Victory removes remaining arena enemies without defeat rewards and stops arena production, enemy respawning and Barrack rebuilding across travel and saves. The farming field and route Barrack are unaffected. Normal Boss XP and drops remain separate from the chest reward.
- Each genuine victory switches Auto Combat off once and clears AI-created targets and movement intent without discarding player-authored orders or direct companion commands. Simulation and rescue speech continue; self-defense remains available. The player may explicitly re-enable Auto Combat afterward, and later defeated-arena updates do not switch it off again.
- The southern arena entrance uses a pulsing radius-five dark-green collision barrier and shows recharge progress while unavailable. It stays open after victory until loot is collected and the party can safely leave. An unclaimed chest keeps access open even at 60 credits; neither the chest nor its contents are discarded.
- Once all loot is collected and the party, including dead members and movement reservations, is clear of the arena and gate, the gate closes. At 60 credits, safe reconstruction restores the Boss and all three arena Barracks to full health, resets their preparation and reopens access. Reinforcement ID sequences are retained. This completed-clear restoration does not apply to wipes or the route Barrack.
- Each victory creates exactly one manually claimed chest at (102,45). It grants 500 Crowns, an independent 90% chance for one level-15 equipment item, an independent 10% chance for one level-20 item, and five independently selected first-class skill books. Both equipment rolls may succeed or fail; duplicate books are allowed. Choices are uniform within existing exact-level equipment and all first-class book pools, without party weighting or Beginner books.
- Chest contents roll once per completed encounter. Manual interaction requires a living leader within three units; clicking from farther away approaches first. A valid manual chest request and every successful claim switch Auto Combat off, whether or not inventory is full. Auto Combat never claims the chest. Overflow remains pending; partial collection and the one-time currency grant persist without rerolls or duplicate claims. The chest overlay pauses simulation immediately on opening and stays open until explicitly dismissed through its controls or the existing dismissal shortcut. Gameplay shortcuts cannot issue conflicting actions behind it. Closing it or leaving does not automatically re-enable Auto Combat.
- Attempting to walk out or use a supported teleport with unclaimed loot offers `Return to chest` or `Leave anyway`. Returning cancels departure and directs the party toward the chest without claiming it. Leaving preserves loot and gate access, delaying reconstruction. The acknowledged excursion does not repeatedly warn; re-entry permits a new warning.
- The first victory automatically opens the cage at (88,45) and rescues its captive, who says `You’ve freed me. Thank you!` through the existing five-second HUD-aware speech. Rescue persists and does not replay on loading or later clears. Matching transparent closed/open cage sprites occupy a three-world-unit-square visual with a shared ground anchor; widely spaced bars reveal the existing captive behind them. The cage remains open through travel, restoration and repeat encounters. It adds no collision or manual rescue interaction; existing chest/NPC artwork is retained and the captive's town service remains undefined.
- Saves preserve encounter sequence, recharge, availability, rescue and rolled/partially collected rewards. Active fights restore as ready attempts without victory rewards. Legacy saves missing lifecycle data start ready, even if their old Warmaster was dead, without retroactive loot or rescue. No save-version change or general persistent-zone system is introduced. Post-Warmaster content remains out of scope.
- Full chest collection also preserves a lifetime collection milestone after the current chest ledger is cleared on rearming. Older saves recognize a valid fully collected ledger or a valid later encounter sequence as collection evidence, never chest absence alone. Milestones reconcile only after lifecycle sanitation; malformed or missing data must not invent prior victories or collection.

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
- The Azure Mass triggers prototype phase waves at 75%, 50%, and 25% health remaining.
- Current phase waves spawn 3, 4, and 5 Slimeward enemies respectively, with one authored Superior slime in each wave.
- When an Azure Mass phase starts, the boss temporarily flees living companions inside the boss room.
- While the flee window is active, autonomous companion targeting suppresses The Azure Mass so companions can retarget through normal behavior, including toward spawned phase slimes.
- Direct player commands against The Azure Mass are preserved by the flee retargeting behavior unless another normal validity rule blocks the command.
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

Current prototype World Travel may also expose direct teleport options unlocked by slotless Teleportation Echo key items.

Current direct World Travel teleport unlocks include:

- Harbor Union Bastion, unlocked by the Harbor Union Bastion Teleportation Echo from prototype crafting
- Slimeward Camp, unlocked by the Slimeward Camp Teleportation Echo from the Azure Mass

Direct World Travel teleport options are prototype key-item convenience travel. They should not define final fast travel, discovery, travel cost, route ownership, or production teleport-network behavior.

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

Current visuals may use prototype sprites, first-class character sprites, generated terrain tiles, generated icons, class portraits, feedback VFX sprites, decorative map visual objects, dungeon visuals, teleporter and passage-blocker visuals, boss sprites, and placeholders.

Visual priorities:

- party members should be easy to identify
- enemies should be easy to distinguish from party members
- NPCs should be easy to identify in prototype hub and quest spaces
- resources should be visible and readable
- movement direction should be understandable
- terrain, walls, obstacles, labels, teleports, and feedback should remain readable at the current prototype render scale
- feedback should make combat, gathering, drops, quest guidance, escort behavior, resurrection, recovery, skills, status effects, projectiles, and AoE danger or party-offensive areas readable

Enemy, NPC, and subzone name labels may be used as UI-facing readability aids.

Name labels must not define simulation behavior, targeting rules, NPC behavior, dialogue, or final content pipeline rules.

Current prototype map visuals may use 32px construction-cell anchoring for walls, obstacles, entities, overlays, labels, effects, camera math, and input targeting while rendering larger floor chunks as background terrain.

Current generated terrain, feedback, map, and UI asset direction may include 32x32 bush or obstacle assets, 64x64 tree assets, 128x128 floor chunks, hub floor assets, wilderness floor assets, post-Hub-2 enemy and terrain assets, Slimeward dungeon floor and wall assets, hub castle wall assets, decorative hub structure assets, generated skill or feedback sprites, first-class skill effect sprites, combat projectile sprites, teleporter active/broken visuals, passage blocker visuals, enemy AoE circles, companion AoE circles, Azure Mass boss sprites, bottom HUD Auto Combat and Pause/Resume controls, companion buff/debuff placeholder rails, and temporary skill visual events.

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

## Prototype Save, Offline Progress, Patch Notes, and Guide Popups

Current prototype browser persistence includes local save support.

Current prototype save behavior:

- the start screen offers Continue, New Game, and Import Save as primary actions, plus a smaller Patch Notes action
- Patch Notes is available without a save and opens a scrollable player-facing history beginning with the June 19, 2026 mechanically complete nine-class baseline
- Patch Notes closes through its persistent Close control, Escape, or backdrop selection and returns focus to its start-screen opener
- future patch-note entries are added when changes reach the live version
- saves are stored in browser local storage
- the game may autosave periodically during play
- the game may autosave before tab sleep or page unload
- map transitions may trigger a save
- major quest status changes may trigger a save
- the player may manually save
- the player may export a save file
- the player may import a save file from the start screen or in-game Options
- imported files are parsed, validated, and restored successfully before replacement is offered
- importing from the start screen asks for confirmation when a stored save exists, writes the valid import, and remains on the start screen with Continue enabled
- importing from in-game Options keeps the replacement confirmation and immediately loads the valid imported state
- canceling replacement or selecting an invalid or unreadable file leaves the current stored save unchanged
- starting a new game over an existing save asks for confirmation
- the game does not expose a separate delete-save action; New Game is the supported way to replace existing progress with a fresh save
- save files use a prototype save version
- current save schema version is `3`; the existing `mmo-party-simulator.save.v1` browser-storage key remains unchanged so older local saves stay discoverable
- version-1 saves automatically migrate removed Holy Mace and Holy Lantern item ids to the surviving Mace and Lantern lines before normal validation and sanitization
- version-1 migration directly fills an empty Blade, Hunter, Beast, or Elementalist offhand with the matching-tier Dagger, Quiver, Claw, or Orb, using the level-10 item as fallback; occupied offhands are never replaced and version-2-or-later saves do not repeat the grant
- version-2 saves automatically migrate legacy wild-enemy ids and their durable saved references to the current readable zone/enemy-type id format; version-1 saves run both migrations in order
- invalid, unsupported, malformed, or incompatible saves are rejected with player-facing feedback
- restored saves rebuild the current prototype map from saved quest state
- restored saves preserve valid shared inventory, wallet, bank, key item, quest, companion, Guild & Inn, world discovery, pending offline loot, and teleport working state while dropping removed or invalid item IDs from saved item containers
- approved formation persistence under Issue #704 preserves the selected preset, defaults older saves safely, and rebuilds transient assignments, substitutes, reservations, and movement ownership from the current world
- restored saves clear transient runtime state such as active travel, direct commands, combat feedback, projectiles, companion skill and global cooldowns, movement caches, resurrection channels, recovery overlays, temporary visuals, consumable buffs, skill runtime state, status effects, companion AoE channels, enemy AoE channels, enemy AoE cooldowns, active reusable enemy ability casts, and debug telemetry
- reusable enemy ability cooldowns are the narrow cooldown exception: valid unexpired absolute expiration timestamps and the required-basic-attack gate survive restoration, while expired, malformed, unknown-ability, or missing-enemy records are discarded
- restored saves clear short-lived news broadcast feedback
- restored saves sanitize companion skill progression and preserve valid learned skill rank data
- eligible legacy saves that predate the Guild Board onboarding quest treat that onboarding as completed and expose `Break the Ash Camp` without replacing existing Board slots or progress
- pre-eligibility legacy saves retain the onboarding path and receive the protected starter contract when its Azure Trial and first-class requirements are later met
- restored active `Break the Ash Camp` quests recheck the currently equipped first-class weapon requirement while preserving already-completed objective progress

Current prototype offline progress:

- may apply when continuing a valid save
- is capped to 30 minutes
- uses the shared AFK combat estimator for the current party and current subzone
- may grant deterministic estimated enemy kills, XP, gathered resources, and monster drops
- caps kills by subzone enemy availability and respawn limits
- includes access efficiency, combat capability, survivability, natural resources, and known enemy data in the estimate
- grants XP immediately to eligible active companions
- routes resource and monster-drop rewards through pending offline loot when inventory space is not available
- can be skipped when the saved state was in active travel, recovery, resurrection, an open dungeon chest interaction, an unsupported map, an unsupported subzone, a defeated-party state, or another unsafe transient state
- is a lightweight idle-progression approximation, not a full offline simulation

Current prototype guide popups:

- may appear when starting a new game
- may appear when the equipment tutorial quest becomes active
- may appear when `Orders from the Guild` becomes active to explain concurrent main/Board progress, taken-only Board kill counting, and Board reward claiming through the Atlas Guild & Inn page
- may appear after the first world-wipe rescue
- pause the simulation while active
- are UI guidance only
- do not define simulation behavior, quest rules, AI behavior, balance, or final tutorial structure

Prototype save, offline progress, Patch Notes, and guide popups are browser-prototype systems. Patch Notes is bundled player-facing UI content and does not define game state or simulation behavior. These systems are not backend persistence, account persistence, cloud save, cross-device save, production offline economy, final tutorial design, or final onboarding flow.

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
- inspect XP, level progression, first-class eligibility, skill ranks, skill books, and legacy skill behavior
- inspect role bonus assignment, class behavior, first-class selection, skill behavior, skill cooldowns, skill thresholds, mobility skill mode, Support Focus settings, Overcharge settings, FireBurst targeting, Circle of Renewal targeting, legacy skill behavior, status effects, skill visual events, companion AoE channels, and enemy AoE channels
- inspect movement/pathing issues, movement planning, path backoff, and navigation grid behavior
- inspect direct companion command issue, rejection, replacement, completion, cancellation, and rejoin grace behavior
- debug map transitions
- export debug telemetry
- inspect quest state and POI decisions
- inspect wallet, drops, merchant exchange, and Merchant Buy telemetry
- inspect inventory capacity, item grants, item removal, and reward validation
- inspect bank storage, slot locking, transfer, and auto-routing behavior
- inspect key item unlock state and direct World Travel teleport options
- inspect Smith crafting recipe status, crafting requirements, crafting results, and crafting telemetry
- inspect equipment equip, unequip, validation, and stat contribution behavior
- inspect flask assignment, flask use, auto-flask behavior, and flask recharge behavior
- inspect AFK estimate output, offline reward summaries, and pending offline loot
- inspect Guild & Inn state, Guild Recruit, Notice Board, Field Teams, Inn Rooms, Inn Kitchen, Hearth's Fire, and related upgrade state
- inspect Farm and Livestock state, crop and creature unlocks, production, feeding, helper bonuses, upgrade state, pantry/inventory transfers, and related telemetry
- inspect healing fountain health restoration and flask refill behavior
- inspect enemy archetype, combat style, target preference, attack range, and target decision behavior
- inspect enemy scaling, respawn, subzone, and encounter area behavior
- inspect party intent, party activity coordination, self-defense recovery, resurrection, and world-wipe recovery behavior
- inspect interrupted POI restore behavior
- inspect quest guide escort behavior
- inspect PixiJS world rendering behavior
- teleport directly between Harbor Union Bastion and Forward Bastion for prototype hub testing
- add prototype flasks to shared inventory
- add prototype crafting materials and enemy drops to shared inventory

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
- advanced ability framework beyond current prototype class skills, skill ranks, skill books, skill behavior settings, temporary skill runtime state, status effects, companion AoE channels, focused reusable enemy ability execution, and legacy-enabled Beginner skill carry-over
- mana or complex resource costs
- full casting system beyond the focused reusable enemy ability runtime
- advanced targeting system
- advanced support mechanics
- advanced aggro/threat mechanics
- full ranged combat beyond current prototype skill ranges, enemy attack ranges, and basic projectile visuals
- backend persistence
- networking/server authority
- production asset pipeline
- final world content pipeline
- full quest journal, branching dialogue, production quest content, or full quest reward economy beyond prototype quest rewards
- full shop, selling, buying, and merchant economy beyond fixed prototype Merchant Buy stock and the current prototype Merchant Sell rules
- full production crafting, smithing, profession progression, upgrade chains, or recipe economy beyond current prototype Smith crafting
- full production bank economy, account storage, remote storage rules, or storage upgrades beyond current prototype Bank Chest storage
- persistent ground loot beyond prototype drop-to-inventory behavior
- final death penalty, checkpoint, resurrection economy, or recovery system beyond prototype resurrection and world-wipe recovery
- production enemy respawn, encounter reset, or spawn scheduling beyond current prototype wild-map respawn behavior
- production POI framework beyond current debug-map guidance
- production escort, follower, recruitment, or companion NPC systems beyond the current quest guide prototype and current Guild Recruit MVP
- full town systems, interiors, production crafting, production smithing, recruitment beyond current Guild Recruit behavior, or NPC relationship systems

---

## Conflict Resolution

If prompt instructions conflict with this document or `GTD.md`:

1. Stop
2. Explain the conflict clearly
3. Ask for confirmation before proceeding

Do not guess or silently override documented behavior.
