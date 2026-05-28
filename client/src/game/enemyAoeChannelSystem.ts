import { aoeTargetDummyId } from "./debugMap";
import { damageEntity } from "./entities";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { blockIncomingAttackIfShielded, isEnemyBound } from "./skillRuntime";
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
  Position,
} from "./types";

export const AOE_DUMMY_STOMP_ABILITY_ID: EnemyAoeAbilityId = "aoe_dummy_stomp";
export const AOE_DUMMY_STOMP_RADIUS = 2;
export const AOE_DUMMY_STOMP_CHANNEL_MS = 1500;
export const AOE_DUMMY_STOMP_WINDUP_MS = 500;
export const AOE_DUMMY_STOMP_COOLDOWN_MS = 6000;
export const AOE_DUMMY_STOMP_DAMAGE = 1;

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

  return maybeStartAoeDummyChannel(nextState, now);
}

export function isEnemyAoeChanneling(state: GameState, enemyId: string): boolean {
  return Boolean(state.enemyAoeChannelsByCasterId?.[enemyId]);
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

  if (!hasLineOfSightToAoe(state, caster, channel.shape.center)) {
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

function maybeStartAoeDummyChannel(state: GameState, now: number): GameState {
  const caster = getEntityById(state, aoeTargetDummyId);

  if (
    !isLivingEnemy(caster) ||
    isEnemyBound(state, caster) ||
    state.enemyAoeChannelsByCasterId?.[caster.id] ||
    state.enemyAoeCooldownsByCasterId?.[caster.id] ||
    !isAoeDummyEngaged(state, caster) ||
    !hasLineOfSightToAoe(state, caster, caster.position)
  ) {
    return state;
  }

  const channel: EnemyAoeChannelState = {
    id: `${AOE_DUMMY_STOMP_ABILITY_ID}:${caster.id}:${now}`,
    abilityId: AOE_DUMMY_STOMP_ABILITY_ID,
    casterId: caster.id,
    shape: {
      type: "circle",
      center: caster.position,
      radius: AOE_DUMMY_STOMP_RADIUS,
    },
    phase: "channeling",
    startedAt: now,
    channelEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS,
    windupEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    cooldownMs: AOE_DUMMY_STOMP_COOLDOWN_MS,
  };

  return {
    ...state,
    enemyAoeChannelsByCasterId: {
      ...(state.enemyAoeChannelsByCasterId ?? {}),
      [caster.id]: channel,
    },
  };
}

function isAoeDummyEngaged(state: GameState, caster: Enemy): boolean {
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
      !isInsideCircle(currentMember.position, channel.shape.center, channel.shape.radius)
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

  const damagedTarget = damageEntity(target, AOE_DUMMY_STOMP_DAMAGE);
  nextState = updateEntity(nextState, damagedTarget);

  return addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    sourceEntityId: caster.id,
    targetEntityId: target.id,
    damageType: "physical",
    feedbackKind: "damage",
    amount: AOE_DUMMY_STOMP_DAMAGE,
    text: `-${AOE_DUMMY_STOMP_DAMAGE} HP`,
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

function isInsideCircle(
  position: Position,
  center: Position,
  radius: number,
): boolean {
  return getEuclideanDistance(position, center) <= radius;
}
