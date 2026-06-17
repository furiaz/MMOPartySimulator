import { handleEnemyDefeatedDrops } from "./dropSystem";
import { isLivingCompanion, isLivingEnemy, isTargetDummyEnemy } from "./entityGuards";
import { grantCharacterXpToParty } from "./leveling";
import { getEuclideanDistance } from "./positionUtils";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { applyStatusEffect } from "./statusEffects";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionAoeChannelState,
  Enemy,
  SkillDefinition,
} from "./types";

export const SHIELD_SHOCKWAVE_CHANNEL_MS = 200;

export function updateCompanionAoeChannelSystem(
  state: GameState,
  now = Date.now(),
): GameState {
  let nextState = state;

  for (const channel of Object.values(state.companionAoeChannelsByCasterId ?? {})) {
    nextState = updateActiveChannel(nextState, channel, now);
  }

  return nextState;
}

export function startShieldShockwaveChannel(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "shockwave" ||
    state.companionAoeChannelsByCasterId?.[caster.id]
  ) {
    return state;
  }

  const nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return {
    ...nextState,
    companionAoeChannelsByCasterId: {
      ...(nextState.companionAoeChannelsByCasterId ?? {}),
      [caster.id]: {
        id: `shield_shockwave:${caster.id}:${now}`,
        abilityId: "shield_shockwave",
        casterId: caster.id,
        shape: {
          type: "circle",
          center: caster.position,
          radius: skill.effect.radius,
        },
        visualIntent: "partyOffensive",
        damageType: skill.effect.damageType,
        powerMultiplier: skill.effect.powerMultiplier,
        bindDurationMs: skill.effect.bindDurationMs,
        startedAt: now,
        channelEndsAt: now + SHIELD_SHOCKWAVE_CHANNEL_MS,
      },
    },
  };
}

export function startMaulSweepChannel(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "maulSweep" ||
    state.companionAoeChannelsByCasterId?.[caster.id]
  ) {
    return state;
  }

  const nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return {
    ...nextState,
    companionAoeChannelsByCasterId: {
      ...(nextState.companionAoeChannelsByCasterId ?? {}),
      [caster.id]: {
        id: `maul_sweep:${caster.id}:${now}`,
        abilityId: "maul_sweep",
        casterId: caster.id,
        shape: {
          type: "circle",
          center: caster.position,
          radius: skill.effect.radius,
        },
        visualIntent: "partyOffensive",
        damageType: skill.effect.damageType,
        powerMultiplier: skill.effect.powerMultiplier,
        disarmDurationMs: skill.effect.disarmDurationMs,
        startedAt: now,
        channelEndsAt: now + SHIELD_SHOCKWAVE_CHANNEL_MS,
      },
    },
  };
}

function updateActiveChannel(
  state: GameState,
  channel: CompanionAoeChannelState,
  now: number,
): GameState {
  const caster = state.entities[channel.casterId];

  if (!isLivingCompanion(caster)) {
    return finishChannel(state, channel);
  }

  if (now < channel.channelEndsAt) {
    return state;
  }

  if (channel.abilityId === "shield_shockwave") {
    return resolveShieldShockwaveImpact(state, channel, caster, now);
  }

  if (channel.abilityId === "maul_sweep") {
    return resolveMaulSweepImpact(state, channel, caster, now);
  }

  return finishChannel(state, channel);
}

function resolveMaulSweepImpact(
  state: GameState,
  channel: CompanionAoeChannelState,
  caster: Companion,
  now: number,
): GameState {
  let nextState = state;

  for (const enemy of Object.values(state.entities)) {
    const currentEnemy = nextState.entities[enemy.id];

    if (
      !isLivingEnemy(currentEnemy) ||
      !isInsideCircle(currentEnemy.position, channel.shape.center, channel.shape.radius)
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      currentEnemy,
      "Maul Sweep",
      now,
      channel.damageType,
      channel.powerMultiplier,
    );

    const damagedTarget = nextState.entities[currentEnemy.id];

    if (
      isLivingEnemy(damagedTarget) &&
      !isTargetDummyEnemy(damagedTarget) &&
      channel.disarmDurationMs
    ) {
      nextState = applyStatusEffect(
        nextState,
        {
          type: "disarmed",
          targetId: damagedTarget.id,
          durationMs: channel.disarmDurationMs,
          sourceId: caster.id,
          sourceKey: "maul_sweep",
        },
        now,
      );
    }
  }

  return finishChannel(nextState, channel);
}

function resolveShieldShockwaveImpact(
  state: GameState,
  channel: CompanionAoeChannelState,
  caster: Companion,
  now: number,
): GameState {
  let nextState = state;

  for (const enemy of Object.values(state.entities)) {
    const currentEnemy = nextState.entities[enemy.id];

    if (
      !isLivingEnemy(currentEnemy) ||
      !isInsideCircle(currentEnemy.position, channel.shape.center, channel.shape.radius)
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      currentEnemy,
      "Shield Shockwave",
      now,
      channel.damageType,
      channel.powerMultiplier,
    );

    const damagedTarget = nextState.entities[currentEnemy.id];

    if (
      isLivingEnemy(damagedTarget) &&
      !isTargetDummyEnemy(damagedTarget) &&
      channel.bindDurationMs
    ) {
      nextState = updateEntity(nextState, {
        ...damagedTarget,
        state: "attack",
        currentTargetId: caster.id,
      });
      nextState = {
        ...nextState,
        skillBindsByEnemyId: {
          ...(nextState.skillBindsByEnemyId ?? {}),
          [damagedTarget.id]: {
            sourceId: caster.id,
            targetId: damagedTarget.id,
            expiresAt: now + channel.bindDurationMs,
          },
        },
      };
    }
  }

  return finishChannel(nextState, channel);
}

function damageEnemy(
  state: GameState,
  caster: Companion,
  target: Enemy,
  label: string,
  now: number,
  damageType: "physical" | "magic",
  powerMultiplier: number,
): GameState {
  const combatResult = resolveAndApplyCombatDamage(state, caster, target, {
    damageType,
    powerMultiplier,
    allowEvasion: true,
    allowPassiveBlock: damageType === "physical",
    now,
    label,
  });
  let nextState = combatResult.state;
  const damagedTarget = combatResult.target;

  if (damagedTarget.kind === "enemy" && damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(nextState, damagedTarget, caster.id, now);
    nextState = recordEnemyDefeatedForQuests(
      nextState,
      damagedTarget,
      nextState.currentMapId,
      Math.random,
      now,
    );
    if (!damagedTarget.questSpawn?.suppressNormalDrops) {
      nextState = handleEnemyDefeatedDrops(nextState, damagedTarget, caster.id, now);
    }
  }

  if (damagedTarget.kind === "enemy" && damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  return nextState;
}

function finishChannel(
  state: GameState,
  channel: CompanionAoeChannelState,
): GameState {
  const companionAoeChannelsByCasterId = {
    ...(state.companionAoeChannelsByCasterId ?? {}),
  };
  delete companionAoeChannelsByCasterId[channel.casterId];

  return {
    ...state,
    companionAoeChannelsByCasterId,
  };
}

function isInsideCircle(
  position: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
): boolean {
  return getEuclideanDistance(position, center) <= radius;
}
