# GDD.md

## Game Concept

A party-based exploration RPG where the player leads a small group of party members through a dangerous, newly discovered land.

The game is primarily idle/AFK, with optional active control. The player guides party intent, assigns roles, reacts to threats, and may later take direct control of the current leader.

---

## Core Pillars

- Party exists physically in the world
- Low input, high control
- Command-based control instead of micromanagement
- Roles define behavior priorities, not restrictions
- Classes define what a party member can do
- Exploration, combat, gathering, and formation interact as one system
- Party behavior should feel active, responsive, and alive

---

## Core Gameplay Loop

Explore the world  
-> Leader selects or discovers a point of interest  
-> Party travels in formation  
-> Party engages in combat, gathering, or exploration  
-> Party reacts to threats  
-> Party regroups  
-> Continue toward the next point of interest  

---

## Player & Party

The player leads a party of physical characters in the world.

The party has:
- one current leader
- multiple party members
- adjustable party order
- assignable roles for each party member

The current leader is the party member the player would control during active gameplay. Leader is not a role.

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
- defines the direction of party travel
- represents the character the player would control manually

Leader identity and combat role are separate.

A leader can be a Defender, Fighter, Support, Gatherer, or None. The leader's role does not determine physical formation position.

If a party member is attacked, the party may switch target priority to that attacker.

---

## Roles

Roles define behavior priorities.

Classes define available tools, stats, and abilities. Roles define how those tools are preferred.

If a role has no valid high-priority action, the party member falls back to lower-priority behavior.

### Global Priority Hierarchy

1. Direct player command
2. Emergency survival action
3. Primary role action
4. Secondary role action
5. Fallback action
6. Idle / follow

Direct commands override autonomous role behavior. Emergency survival behavior may interrupt direct commands only when explicitly allowed by design.

### None / Unassigned

`None` is a safe unassigned/default role. It is not a full gameplay role.

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
- Follow formation
- Regroup when too far away
- Return to formation when no target exists

Fallback:
- Return to formation near the party

Fighters should not interrupt their task for minor ally damage or minor support needs.

---

## Defender Role

Purpose:
- Protect the party and form the frontline

Primary behavior:
- Lead formation when defenders are present
- Target the leader's enemy target
- Engage enemy threats first
- Protect nearby allies
- Use taunt, aggro, control, mitigation, or defensive tools when available

Secondary behavior:
- Attack current threat
- Return to formation
- Hold near the frontline

Fallback:
- Return to formation near the party

Defenders should not chase distant enemies, leave party cohesion, or deal extra damage at the cost of protection.

---

## Support Role

Purpose:
- Heal, shield, buff, and stabilize the party

Primary behavior:
- Heal injured allies when healing exists
- Shield allies under threat when shielding exists
- Apply buffs when buffs exist
- Cleanse or control when those tools exist
- Stay behind frontline combat roles

Secondary behavior:
- Follow formation
- Maintain safe position
- Participate in light combat when safe

Fallback:
- If in combat, deal light damage while staying safe
- If not in combat, follow formation

Support behavior that requires healing, shielding, buffs, cleanses, or support skills is future-facing until those systems exist.

---

## Gatherer Role

Purpose:
- Collect resources while staying safe

Primary behavior:
- Find nearest valid resource within gathering range
- Gather current resource
- Use gathering, mobility, or safety tools when available
- Return closer to the party when idle

Secondary behavior:
- Avoid enemies
- Follow formation when not gathering
- Participate in combat only as fallback or when forced

Fallback:
- Follow party and help in combat if appropriate

Gatherers:
- can leave formation to gather
- have their own gathering range
- prioritize gathering over following the party while a valid gathering task exists
- rejoin formation when not actively gathering or traveling to a resource
- stay near or behind supports when in formation or combat fallback

Gatherers should not abandon gathering for distant combat, minor threats, or ally damage far away.

---

## Formation

Formation is based on role and party order, not leader position.

Formation order:

1. Defenders
2. Fighters
3. Supports
4. Gatherers

If a role group is empty, the next available role group leads.

Examples:
- No defenders: Fighters lead
- No defenders or fighters: Supports lead
- Only gatherers remain: Gatherers lead

If multiple party members share the same role, party order determines their order within that role group.

Party order should be adjustable by the player.

During travel, the party should stay as close together as possible while maintaining preferred role order.

Gatherers are excluded from formation cohesion while actively gathering or moving to a resource. When not actively gathering, gatherers rejoin formation behind or near supports.

---

## Formation Cohesion

Formation uses path-distance cohesion, not direct straight-line distance.

Default cohesion distance:
- 5 path steps

During travel:
- required party members should remain connected through path-distance links
- if a required party member falls too far behind, forward movement pauses
- the party waits until the separated member catches up
- movement resumes once cohesion is restored

Required party members include alive/non-incapacitated Defenders, Fighters, and Supports.

Gatherers are required for cohesion only when they are not actively gathering or moving to a resource.

---

## Combat

Combat is real-time and target-based.

Leader selects enemy targets. Combat roles decide how party members approach, position, and engage.

Combat flow:
- Leader identifies enemy target
- Party receives shared target and path information
- Formation approaches the enemy
- Defenders aim at the enemy target and lead engagement
- Fighters target the enemy and follow the frontline
- Supports target the enemy but stay behind fighters
- Gatherers continue gathering unless they are not gathering or are forced into combat fallback
- When close enough, units choose combat positions based on attack range

If any party member is attacked, the party may switch target priority to the attacker.

Current attack range is mostly melee, but combat positioning should support future ranged classes.

Early-game enemies are passive by default and only fight back after being attacked. Aggressive enemies may be introduced later by enemy type, zone, event, or explicit debug scenario.

---

## Gathering

Resources exist physically in the world.

Resources:
- have durability
- deplete
- respawn later

Gatherers can collect resources while the party explores. Gathering is task-based, not manual.

Gatherers have their own resource search/gathering range and should focus on gathering instead of following formation while a valid gathering task exists.

---

## Direct Orders

The player can give direct orders to specific party members.

Direct orders:
- override autonomous role behavior
- affect only the targeted party member
- do not automatically change other party members

Example:
If the party is attacking but the player orders one party member to gather, that party member gathers while the rest continue fighting.

Future input may include click-and-drag commands from a unit to a target.

---

## Party System

Initial party:
- 1 current leader
- up to 3 companions

Party size may change later.

The player can issue:
- group commands
- direct orders
- role changes
- party order changes
- future leader changes

Party members act independently based on:
- current leader intent
- assigned role
- party order
- direct commands
- immediate threats

---

## World Structure

- The world is divided into large zones/fields
- Zones are connected via teleport points at edges or key locations
- Each zone is a contained exploration area
- The game should feel continuous, not level-based

Do not implement zone or teleport logic until explicitly requested.

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

## Classes

Three main paths:

- Martial: Sword / Shield / Spear
- Arcane: Fire / Water / Wind
- Divine: Nature / Light / Pain

Each path branches into subclasses later.

Classes define what a party member can do. Roles define how they prefer to behave.

---

## Player Experience

The player should feel like they are leading a small expedition:

- assigning roles
- setting party direction
- watching party members act independently
- reacting to danger
- deciding when to intervene
- making strategic decisions instead of constant inputs

---

## Debug / Development Tools

Temporary debug tools may include:
- Add/remove companions
- Change roles
- Change party order
- Set current leader
- Randomize positions
- Reset enemy and resource states
- Restore party health
- Inspect AI decision reasons

Debug tools are not part of final gameplay.
