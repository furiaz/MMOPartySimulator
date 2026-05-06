GDD.md
Game Concept
A party-based exploration RPG where the player leads a small group of party members through a dangerous, newly discovered land.

The game is primarily idle/AFK, with optional active control. The player guides party intent, assigns roles, reacts to threats, and may later take direct control of the current leader.

Core Pillars
Party members exist physically in the world
Low input, high control
Command-based control instead of micromanagement
Simple autonomous behavior
Roles define priorities, not restrictions
Classes define what a party member can do
Exploration, combat, gathering, and party movement interact as one system
Party behavior should feel active, readable, and alive
Core Gameplay Loop
Explore the world
-> Leader selects or discovers a point of interest
-> Party moves together
-> Party engages in combat, gathering, or exploration
-> Party reacts to threats
-> Party regroups
-> Continue toward the next point of interest

Player & Party
The player leads a party of physical characters in the world.

The party has:

one current leader
multiple party members
adjustable party order
assignable roles for each party member
The current leader is the party member the player would control during active gameplay. Leader is not a role.

Every party member can have a role:

Defender
Fighter
Support
Gatherer
None / Unassigned
Roles define how a party member behaves. They do not restrict what the unit is allowed to do.

Leader
The leader defines party intent.

The leader:

selects the current point of interest
selects the current enemy target
defines the direction of party travel
represents the character the player would control manually
Leader identity and combat role are separate.

A leader can be a Defender, Fighter, Support, Gatherer, or None.

If a party member is attacked, the party may switch target priority to that attacker.

Roles
Roles define behavior priorities.

Classes define available tools, stats, and abilities. Roles define how those tools are preferred.

If a role has no valid high-priority action, the party member falls back to lower-priority behavior.

Global Priority Hierarchy
Direct player command
Emergency survival action
Primary role action
Secondary role action
Fallback action
Idle / follow
Direct commands override autonomous role behavior.

None / Unassigned
None is a safe unassigned/default role. It is not a full gameplay role.

Fighter Role
Purpose:

Damage dealer and combat assistant
Primary behavior:

Assist the leader's target
Attack nearby enemies
Use offensive tools when available
Use damage or speed self-buffs when available
Secondary behavior:

Follow the leader
Regroup when too far away
Return to the party when no target exists
Fallback:

Return near the party
Fighters should not interrupt their task for minor ally damage or minor support needs.

Defender Role
Purpose:

Protect the party and form the frontline
Primary behavior:

Guard near the leader
Position toward the leader's intent or current threat
Target the leader's enemy target
Engage enemy threats first
Protect nearby allies
Use taunt, aggro, control, mitigation, or defensive tools when available
Secondary behavior:

Attack current threat
Return to guard position
Hold near the leader and party
Fallback:

Return near the party
Defenders should not chase distant enemies, abandon party safety, or deal extra damage at the cost of protection.

Support Role
Purpose:

Heal, shield, buff, and stabilize the party
Primary behavior:

Stay near the party
Stay behind frontline combat roles when possible
Heal injured allies when healing exists
Shield allies under threat when shielding exists
Apply buffs when buffs exist
Cleanse or control when those tools exist
Secondary behavior:

Follow the leader
Maintain safe position
Participate in light combat when safe
Fallback:

If in combat, deal light damage while staying safe
If not in combat, follow the party
Support behavior that requires healing, shielding, buffs, cleanses, or support skills is future-facing until those systems exist.

Gatherer Role
Purpose:

Collect resources while staying safe
Primary behavior:

Find a valid nearby resource
Move to that resource
Gather it
Use gathering, mobility, or safety tools when available
Return closer to the party when idle or too far away
Secondary behavior:

Avoid enemies
Follow the party when not gathering
Participate in combat only as fallback or when forced
Fallback:

Follow party and help in combat if appropriate
Gatherers:

can leave the party to gather
have their own gathering search range
prioritize gathering over following while a valid gathering task exists
rejoin the party when not actively gathering
should not abandon gathering for distant combat, minor threats, or ally damage far away
Party Movement
Party movement is simple and leader-centered.

The leader moves toward the current intent:

enemy target
resource target
exploration point
direct move target
Other party members follow the leader unless their role or direct command gives them another task.

The party does not use a strict grid formation.

Party members should:

stay near the leader during travel
catch up if they fall behind
avoid stacking on top of each other
avoid blocked positions
move in readable, small steps
regroup after combat or gathering
Gatherers are allowed to temporarily leave the group while gathering.

Direct-commanded party members are not forced back into group movement by autonomous behavior.

Party Cohesion
Party cohesion is based on simple distance from the leader.

During travel:

required party members should remain close enough to the leader
if party members fall too far behind, the leader may wait or slow progression
movement resumes naturally once the group catches up
Required party members include alive/non-incapacitated Defenders, Fighters, and Supports.

Gatherers are required for cohesion only when they are not actively gathering.

Combat
Combat is real-time and target-based.

Combat flow:

Leader identifies enemy target
Party receives shared target intent
Party approaches the enemy
Defenders guard and intercept threats
Fighters attack the selected target
Supports stay safer and assist when appropriate
Gatherers continue gathering unless they are pulled into fallback combat
When close enough, units attack
If any party member is attacked, the party may switch target priority to that attacker.

Current attack range is mostly melee, but combat positioning should support future ranged classes.

Early-game enemies are passive by default and only fight back after being attacked. Aggressive enemies may be introduced later by enemy type, zone, event, or explicit debug scenario.

Gathering
Resources exist physically in the world.

Resources:

have durability
yield items when durability is depleted
can have limited quantity
become depleted
may respawn later
Gathering is task-based, not manual.

Gatherers search for valid resources, move to them, gather over time, then return to party behavior when the task is finished or invalid.

Resources may limit how many gatherers can gather them at once.

Direct Orders
The player can give direct orders to specific party members.

Direct orders:

override autonomous role behavior
affect only the targeted party member
do not automatically change other party members
remain active until replaced, completed, or cleared
Example:
If the party is attacking but the player orders one party member to gather, that party member gathers while the rest continue fighting.

Future input may include click-and-drag commands from a unit to a target.

Party System
Initial party:

1 current leader
up to 3 companions
Party size may change later.

The player can issue:

group commands
direct orders
role changes
party order changes
future leader changes
Party members act independently based on:

current leader intent
assigned role
party order
direct commands
nearby threats
current task validity
World Structure
The world is divided into large zones/fields
Zones are connected via teleport points at edges or key locations
Each zone is a contained exploration area
The game should feel continuous, not level-based
Do not implement zone or teleport logic until explicitly requested.

World & Setting
New continent, recently discovered
Player arrives by boat
Central port town hub
Expanding outward into regions:
volcanic
snowy
foggy
Exploration includes:

hidden paths
caves
secret areas
Classes
Three main paths:

Martial: Sword / Shield / Spear
Arcane: Fire / Water / Wind
Divine: Nature / Light / Pain
Each path branches into subclasses later.

Classes define what a party member can do. Roles define how they prefer to behave.

Player Experience
The player should feel like they are leading a small expedition:

assigning roles
setting party direction
watching party members act independently
reacting to danger
deciding when to intervene
making strategic decisions instead of constant inputs
Debug / Development Tools
Temporary debug tools may include:

Add/remove companions
Change roles
Change party order
Set current leader
Randomize positions
Reset enemy and resource states
Restore party health
Inspect AI decision reasons
Debug tools are not part of final gameplay.