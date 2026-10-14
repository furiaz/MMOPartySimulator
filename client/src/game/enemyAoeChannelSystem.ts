import { aoeTargetDummyId } from "./debugMap";
import {
  createAoeCastTransform,
  isPositionInsideAoe,
  resolveAoePattern,
} from "./aoePatterns";
import { damageEntity } from "./entities";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { getUnbrokenLineDamageReductionPercent } from "./martialPassives";
import { blockIncomingAttackIfShielded, isEnemyBound } from "./skillRuntime";
import { isFakeDeathActive } from "./statusEffects";
import { getCompanionDerivedStats } from "./stats";
import {
  addCombatFeedback,
  getEntityById,
  isActiveResourcePosition,
  isWallPosition,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  Enemy,
  EnemyAoeAbilityId,
  EnemyAoeChannelState,
  EnemyAoeCooldownState,
  EnemyAoeInterruptReason,
  AoePattern,
  Position,
} from "./types";

export const AOE_DUMMY_STOMP_ABILITY_ID: EnemyAoeAbilityId = "aoe_dummy_stomp";
export const AOE_DUMMY_STOMP_RADIUS = 2;
export const AOE_DUMMY_STOMP_CHANNEL_MS = 1500;
export const AOE_DUMMY_STOMP_WINDUP_MS = 500;
export const AOE_DUMMY_STOMP_COOLDOWN_MS = 6000;
export const AOE_DUMMY_PATTERN_GAP_MS = 750;
export const AOE_DUMMY_STOMP_DAMAGE = 1;

export const AOE_DUMMY_PATTERN_NAMES = [
  "Circle",
  "Ring",
  "Concentric Rings",
  "Line",
  "Rectangle",
  "Cross",
  "X",
  "Cone",
  "Combined",
] as const;

type AoeDummyPatternName = (typeof AOE_DUMMY_PATTERN_NAMES)[number];

const AOE_DUMMY_PATTERNS: ReadonlyArray<{
  name: AoeDummyPatternName;
  pattern: AoePattern;
}> = [
  { name: "Circle", pattern: { type: "circle", radius: AOE_DUMMY_STOMP_RADIUS } },
  { name: "Ring", pattern: { type: "ring", innerRadius: 2, outerRadius: 3.5 } },
  {
    name: "Concentric Rings",
    pattern: {
      type: "concentricRings",
      rings: [
        { innerRadius: 0.75, outerRadius: 1.75 },
        { innerRadius: 3.75, outerRadius: 4.75 },
      ],
    },
  },
  { name: "Line", pattern: { type: "line", squareCount: 5 } },
  { name: "Rectangle", pattern: { type: "rectangle", columns: 4, rows: 3 } },
  { name: "Cross", pattern: { type: "cross", armLength: 2 } },
  { name: "X", pattern: { type: "x", armLength: 2 } },
  {
    name: "Cone",
    pattern: { type: "cone", range: 5, angleRadians: Math.PI / 3 },
  },
  {
    name: "Combined",
    pattern: {
      type: "union",
      patterns: [
        { type: "circle", radius: 1.5 },
        { type: "line", squareCount: 4 },
      ],
    },
  },
];

const LINE_OF_SIGHT_SAMPLE_DISTANCE = 0.1;
const PASSIVE_BLOCK_FACTOR = 0.45;
const PASSIVE_BLOCK_SOFTNESS = 35;

export function updateEnemyAoeChannelSystem(
  state: GameState,
  now = Date.now(),
  rng: () => number = Math.random,
): GameState {
  let nextState: GameState = {
    ...state,
    enemyAoeCooldownsByCasterId: clearExpiredCooldowns(
      state.enemyAoeCooldownsByCasterId,
      now,
    ),
  };

  for (const channel of Object.values(nextState.enemyAoeChannelsByCasterId ?? {})) {
    nextState = updateActiveChannel(nextState, channel, now, rng);
  }

  return maybeStartStompChannels(nextState, now);
}
export function isEnemyAoeChanneling(state: GameState, enemyId: string): boolean {
  return Boolean(state.enemyAoeChannelsByCasterId?.[enemyId]);
}

export function isStompOnlyEnemy(enemy: Enemy): boolean {
  return enemy.enemyTypeId === "slimeward_heavy_slime";
}

export function clearEnemyAoeRuntime(state: GameState): GameState {
  if (
    !state.enemyAoeChannelsByCasterId &&
    !state.enemyAoeCooldownsByCasterId
  ) {
    return state;
  }

  return {
    ...state,
    enemyAoeChannelsByCasterId: {},
    enemyAoeCooldownsByCasterId: {},
    aoeDummyPatternSequenceIndex: 0,
  };
}

function updateActiveChannel(
  state: GameState,
  channel: EnemyAoeChannelState,
  now: number,
  rng: () => number,
): GameState {
  const caster = getEntityById(state, channel.casterId);

  if (!isLivingEnemy(caster)) {
    return interruptChannel(state, channel, "caster_dead", now);
  }

  if (isEnemyBound(state, caster)) {
    return interruptChannel(state, channel, "caster_bound", now);
  }

  if (!hasLineOfSightToAoe(state, caster, channel.area.castTransform.origin)) {
    return interruptChannel(state, channel, "line_of_sight", now);
  }

  if (now < channel.channelEndsAt) {
    return updateChannelPhase(state, channel, "channeling");
  }

  if (now < channel.windupEndsAt) {
    return updateChannelPhase(state, channel, "windup");
  }

  return resolveChannelImpact(state, channel, caster, now, rng);
}

function maybeStartStompChannels(state: GameState, now: number): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isLivingEnemy(entity) || !canCastStomp(nextState, entity)) {
      continue;
    }

    nextState = startStompChannel(nextState, entity, now);
  }

  return nextState;
}

function canCastStomp(state: GameState, caster: Enemy): boolean {
  return (
    (caster.id === aoeTargetDummyId || isStompOnlyEnemy(caster)) &&
    !isEnemyBound(state, caster) &&
    !state.enemyAbilityCastsByEnemyId?.[caster.id] &&
    !state.enemyAoeChannelsByCasterId?.[caster.id] &&
    !state.enemyAoeCooldownsByCasterId?.[caster.id] &&
    isAoeStompCasterEngaged(state, caster) &&
    hasLineOfSightToAoe(state, caster, caster.position)
  );
}

function startStompChannel(
  state: GameState,
  caster: Enemy,
  now: number,
): GameState {
  const isDummy = caster.id === aoeTargetDummyId;
  const sequenceIndex = getDummySequenceIndex(state);
  const patternEntry = isDummy
    ? AOE_DUMMY_PATTERNS[sequenceIndex]
    : AOE_DUMMY_PATTERNS[0];
  const targetPosition = getCastTargetPosition(state, caster);
  const channel = createStompChannel(caster, patternEntry, targetPosition, now);
  const nextState = isDummy
    ? addCombatFeedback(state, {
        type: "attack",
        entityId: caster.id,
        feedbackKind: "attack",
        text: patternEntry.name,
        now,
      })
    : state;

  return {
    ...nextState,
    enemyAoeChannelsByCasterId: {
      ...(nextState.enemyAoeChannelsByCasterId ?? {}),
      [caster.id]: channel,
    },
    aoeDummyPatternSequenceIndex: isDummy
      ? (sequenceIndex + 1) % AOE_DUMMY_PATTERNS.length
      : nextState.aoeDummyPatternSequenceIndex,
  };
}

function createStompChannel(
  caster: Enemy,
  patternEntry: (typeof AOE_DUMMY_PATTERNS)[number],
  targetPosition: Position,
  now: number,
): EnemyAoeChannelState {
  const isDummy = caster.id === aoeTargetDummyId;

  return {
    id: `${AOE_DUMMY_STOMP_ABILITY_ID}:${caster.id}:${now}`,
    abilityId: AOE_DUMMY_STOMP_ABILITY_ID,
    casterId: caster.id,
    area: resolveAoePattern(
      patternEntry.pattern,
      createAoeCastTransform(caster.position, targetPosition),
    ),
    patternName: patternEntry.name,
    phase: "channeling",
    startedAt: now,
    channelEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS,
    windupEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    cooldownMs: isDummy
      ? AOE_DUMMY_PATTERN_GAP_MS
      : AOE_DUMMY_STOMP_COOLDOWN_MS,
  };
}

function getDummySequenceIndex(state: GameState): number {
  const index = state.aoeDummyPatternSequenceIndex ?? 0;

  return index >= 0 && index < AOE_DUMMY_PATTERNS.length ? index : 0;
}

function getCastTargetPosition(state: GameState, caster: Enemy): Position {
  const directAttacker = Object.values(state.directCompanionCommandsById ?? {})
    .filter(
      (command) =>
        command.type === "attack" &&
        command.targetId === caster.id &&
        isLivingCompanion(getEntityById(state, command.companionId)),
    )
    .sort(
      (first, second) =>
        second.issuedAt - first.issuedAt ||
        first.companionId.localeCompare(second.companionId),
    )[0];

  if (directAttacker) {
    const companion = getEntityById(state, directAttacker.companionId);
    if (isLivingCompanion(companion)) {
      return companion.position;
    }
  }

  const hasPartyAttackIntent =
    (state.leaderIntent?.type === "attack" &&
      state.leaderIntent.targetId === caster.id) ||
    (state.partyIntent?.executionIntent?.type === "attack" &&
      state.partyIntent.executionIntent.targetId === caster.id);
  const leader = getEntityById(state, state.partyLeaderId);

  if (hasPartyAttackIntent && isLivingCompanion(leader)) {
    return leader.position;
  }

  const nearestAttacker = getPartyMembers(state)
    .filter(
      (member) =>
        isLivingCompanion(member) &&
        member.state === "attack" &&
        member.currentTargetId === caster.id,
    )
    .sort(
      (first, second) =>
        getEuclideanDistance(first.position, caster.position) -
          getEuclideanDistance(second.position, caster.position) ||
        first.id.localeCompare(second.id),
    )[0];

  return nearestAttacker?.position ?? {
    x: caster.position.x + 1,
    y: caster.position.y,
  };
}

function isAoeStompCasterEngaged(state: GameState, caster: Enemy): boolean {
  if (
    state.leaderIntent?.type === "attack" &&
    state.leaderIntent.targetId === caster.id
  ) {
    return true;
  }

  if (
    state.partyIntent?.executionIntent?.type === "attack" &&
    state.partyIntent.executionIntent.targetId === caster.id
  ) {
    return true;
  }

  if (
    Object.values(state.directCompanionCommandsById ?? {}).some(
      (command) => command.type === "attack" && command.targetId === caster.id,
    )
  ) {
    return true;
  }

  return getPartyMembers(state).some(
    (member) => member.state === "attack" && member.currentTargetId === caster.id,
  );
}

function resolveChannelImpact(
  state: GameState,
  channel: EnemyAoeChannelState,
  caster: Enemy,
  now: number,
  rng: () => number,
): GameState {
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    const currentMember = getEntityById(nextState, member.id);

    if (
      !isLivingCompanion(currentMember) ||
      isFakeDeathActive(nextState, currentMember.id) ||
      !isPositionInsideAoe(channel.area, currentMember.position)
    ) {
      continue;
    }

    nextState = applyFlatAoeDamage(nextState, caster, currentMember, now, rng);
  }

  return finishChannel(nextState, channel, now);
}

function applyFlatAoeDamage(
  state: GameState,
  caster: Enemy,
  target: Companion,
  now: number,
  rng: () => number,
): GameState {
  const shieldResult = blockIncomingAttackIfShielded(
    state,
    caster,
    target,
    now,
    "physical",
  );
  let nextState = shieldResult.state;

  if (shieldResult.blocked) {
    return nextState;
  }

  if (rollPassiveBlock(target, rng)) {
    return addCombatFeedback(nextState, {
      type: "damage",
      entityId: target.id,
      sourceEntityId: caster.id,
      targetEntityId: target.id,
      damageType: "physical",
      feedbackKind: "blocked",
      text: "Blocked",
      now,
    });
  }

  const reductionPercent = getUnbrokenLineDamageReductionPercent(
    nextState,
    caster,
    target,
    now,
  );
  const damage = Math.max(
    1,
    Math.round(AOE_DUMMY_STOMP_DAMAGE * (1 - reductionPercent / 100)),
  );
  const damagedTarget = damageEntity(target, damage);
  nextState = updateEntity(nextState, damagedTarget);

  return addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    sourceEntityId: caster.id,
    targetEntityId: target.id,
    damageType: "physical",
    feedbackKind: "damage",
    amount: damage,
    text: `-${damage} HP`,
    now,
  });
}

function rollPassiveBlock(target: Companion, rng: () => number): boolean {
  const block = getCompanionDerivedStats(target).block;
  const blockChance =
    PASSIVE_BLOCK_FACTOR * block / (block + PASSIVE_BLOCK_SOFTNESS);

  return blockChance > 0 && rng() < blockChance;
}

function updateChannelPhase(
  state: GameState,
  channel: EnemyAoeChannelState,
  phase: EnemyAoeChannelState["phase"],
): GameState {
  if (channel.phase === phase) {
    return state;
  }

  return {
    ...state,
    enemyAoeChannelsByCasterId: {
      ...(state.enemyAoeChannelsByCasterId ?? {}),
      [channel.casterId]: {
        ...channel,
        phase,
      },
    },
  };
}

function interruptChannel(
  state: GameState,
  channel: EnemyAoeChannelState,
  reason: EnemyAoeInterruptReason,
  now: number,
): GameState {
  return addCombatFeedback(finishChannel(state, channel, now), {
    type: "attack",
    entityId: channel.casterId,
    feedbackKind: reason,
    text: "Interrupted",
    now,
  });
}

function finishChannel(
  state: GameState,
  channel: EnemyAoeChannelState,
  now: number,
): GameState {
  const enemyAoeChannelsByCasterId = {
    ...(state.enemyAoeChannelsByCasterId ?? {}),
  };
  delete enemyAoeChannelsByCasterId[channel.casterId];

  return {
    ...state,
    enemyAoeChannelsByCasterId,
    enemyAoeCooldownsByCasterId: {
      ...(state.enemyAoeCooldownsByCasterId ?? {}),
      [channel.casterId]: createCooldown(channel, now),
    },
  };
}

function createCooldown(
  channel: EnemyAoeChannelState,
  now: number,
): EnemyAoeCooldownState {
  return {
    abilityId: channel.abilityId,
    casterId: channel.casterId,
    expiresAt: now + channel.cooldownMs,
  };
}

function clearExpiredCooldowns(
  cooldowns: Record<string, EnemyAoeCooldownState> | undefined,
  now: number,
): Record<string, EnemyAoeCooldownState> {
  return Object.fromEntries(
    Object.entries(cooldowns ?? {}).filter(([, cooldown]) => cooldown.expiresAt > now),
  );
}

function hasLineOfSightToAoe(
  state: GameState,
  caster: Enemy,
  center: Position,
): boolean {
  const distance = getEuclideanDistance(caster.position, center);

  if (distance === 0) {
    return true;
  }

  const direction = {
    x: (center.x - caster.position.x) / distance,
    y: (center.y - caster.position.y) / distance,
  };
  const steps = Math.max(1, Math.ceil(distance / LINE_OF_SIGHT_SAMPLE_DISTANCE));

  for (let step = 1; step <= steps; step += 1) {
    const stepDistance = Math.min(distance, step * LINE_OF_SIGHT_SAMPLE_DISTANCE);
    const position = {
      x: caster.position.x + direction.x * stepDistance,
      y: caster.position.y + direction.y * stepDistance,
    };

    if (
      isWallPosition(state, position) ||
      isActiveResourcePosition(state, position, undefined)
    ) {
      return false;
    }
  }

  return true;
}
